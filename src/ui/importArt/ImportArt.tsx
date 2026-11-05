import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { GameState } from '../../engine/types';
import { Modal } from '../components/Modal';
import { ASSET_URLS } from '../hood/art/assetUrls';
import { artVersion, importImage, overrides, removeImport, subscribeArt } from './artStore';

/** The pictures most worth replacing, named for people; every other picture key follows. */
const MAIN_PICTURES: { k: string; label: string }[] = [
  { k: 'title_boardwalk_1960', label: 'Title screen (the boardwalk)' },
  { k: 'desk_topdown_1960', label: 'The Desk (the desk from above)' },
  { k: 'office_room_1960', label: 'The Office (the room)' },
  { k: 'sitdown_table_1960', label: 'The Sit-Down table' },
  { k: 'club_stage_1960', label: 'The club stage' },
];

/**
 * IMPORT ART (owner only): pick a picture from your computer, choose what it is for (a person's portrait,
 * or one of the game's pictures), and it goes into the game for everyone who plays this link.
 */
export function ImportArt({ s, onClose }: { s: GameState; onClose: () => void }) {
  useSyncExternalStore(subscribeArt, artVersion, artVersion);
  const [file, setFile] = useState<File | undefined>();
  const [preview, setPreview] = useState<string | undefined>();
  const [kind, setKind] = useState<'face' | 'art'>('face');
  const [q, setQ] = useState('');
  const [who, setWho] = useState<string | undefined>();
  const [pic, setPic] = useState(MAIN_PICTURES[0].k);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | undefined>();

  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const people = useMemo(() => {
    const n = q.trim().toLowerCase();
    return Object.values(s.characters)
      .filter((c) => c.alive && (!n || `${c.firstName} ${c.lastName} ${c.nickname ?? ''}`.toLowerCase().includes(n)))
      .sort((a, b) => (a.id === s.playerId ? -1 : b.id === s.playerId ? 1 : 0) || (a.faction === 'player' ? 0 : 1) - (b.faction === 'player' ? 0 : 1) || a.lastName.localeCompare(b.lastName))
      .slice(0, 40);
  }, [s, q]);
  const otherKeys = useMemo(() => Object.keys(ASSET_URLS).filter((k) => !MAIN_PICTURES.some((m) => m.k === k)).sort(), []);
  const o = overrides();
  const name = (id: string) => { const c = s.characters[id]; return c ? `${c.firstName} ${c.lastName}` : id; };

  const go = async () => {
    if (!file) return;
    const target = kind === 'face' ? (who ? { face: who } : undefined) : { art: pic };
    if (!target) { setMsg({ ok: false, text: 'Pick the person first.' }); return; }
    setBusy(true); setMsg(undefined);
    const r = await importImage(file, target);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: kind === 'face' ? `Done: that's ${name(who!)} now.` : 'Done: the picture is in the game.' } : { ok: false, text: r.why });
    if (r.ok) setFile(undefined);
  };

  const sel = 'w-full rounded border border-noir-600 bg-noir-900 px-2 py-1 text-sm text-stone-200';
  return (
    <Modal onClose={onClose}>
      <div className="space-y-3 p-4 sm:p-6" data-testid="import-art">
        <h2 className="font-display text-xl text-gold-300">Import art</h2>
        <p className="text-xs text-stone-400">Only you see this. Pick a picture from your computer and choose what it's for. It shows for everyone who plays this game.</p>

        <label className="block text-sm text-stone-300">1. The picture
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-1 block w-full text-xs text-stone-300" onChange={(e) => setFile(e.target.files?.[0])} data-testid="import-file" />
        </label>
        {preview && <img src={preview} alt="" className="max-h-40 rounded border border-noir-600" />}

        <div className="text-sm text-stone-300">2. What it's for</div>
        <div className="flex gap-2" role="radiogroup">
          {(['face', 'art'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`flex-1 rounded border px-2 py-1 text-sm ${kind === k ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-400'}`}>
              {k === 'face' ? "A person's portrait" : 'A picture in the game'}
            </button>
          ))}
        </div>
        {kind === 'face' ? (
          <div className="space-y-1">
            <input className={sel} placeholder="Find a person by name…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="import-search" />
            <select className={sel} size={6} value={who ?? ''} onChange={(e) => setWho(e.target.value)} data-testid="import-who">
              {people.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.id === s.playerId ? ' (you)' : ''} · {c.rank}</option>)}
            </select>
          </div>
        ) : (
          <select className={sel} value={pic} onChange={(e) => setPic(e.target.value)} data-testid="import-pic">
            <optgroup label="The main pictures">{MAIN_PICTURES.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}</optgroup>
            <optgroup label="Every other picture">{otherKeys.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</optgroup>
          </select>
        )}

        <button type="button" className="btn-gold w-full" disabled={!file || busy} onClick={() => void go()} data-testid="import-go">{busy ? 'Importing…' : '3. Import it'}</button>
        {msg && <div className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`} role="status">{msg.text}</div>}

        {(Object.keys(o.faces).length > 0 || Object.keys(o.art).length > 0) && (
          <div className="border-t border-noir-700 pt-2">
            <div className="mb-1 text-xs uppercase tracking-wider text-stone-500">Your imports</div>
            <ul className="space-y-1 text-sm">
              {Object.entries(o.faces).map(([id, url]) => (
                <li key={`f${id}`} className="flex items-center gap-2"><img src={url} alt="" className="h-8 w-8 rounded object-cover" /><span className="flex-1 text-stone-300">{name(id)}</span><button type="button" className="text-xs text-red-300 underline" onClick={() => void removeImport({ face: id })}>Remove</button></li>
              ))}
              {Object.entries(o.art).map(([k, url]) => (
                <li key={`a${k}`} className="flex items-center gap-2"><img src={url} alt="" className="h-8 w-12 rounded object-cover" /><span className="flex-1 text-stone-300">{MAIN_PICTURES.find((m) => m.k === k)?.label ?? k.replace(/_/g, ' ')}</span><button type="button" className="text-xs text-red-300 underline" onClick={() => void removeImport({ art: k })}>Remove</button></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
