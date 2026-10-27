import { previewAction } from '../../engine/actions';
import { useEscape } from '../keys';
import { useMemo, useRef, useState } from 'react';
import { displayName } from '../../engine/characters';
import { GIFT_CAT_LABEL } from '../../engine/gifts';
import type { Character, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { useSheet } from '../components/People';
import { usePlanner } from '../components/Schemes';
import { useClarity } from '../clarity/context';
import { useTravel } from '../travel/context';
import { useShell } from '../shell/context';
import { menuFor, rankedGifts, type MenuCategory, type MenuCategoryId, type MenuItem } from './menuCatalog';
import { EarsPicker } from '../ears/EarsPicker';
import { ConnectionsList } from '../ears/Connections';

/** What you can do now first; what is blocked (with its reason) after. */
function sortItems(s: GameState, items: MenuItem[]): MenuItem[] {
  const blocked = (it: MenuItem) => (it.action ? !!previewAction(s, it.action).disabledReason : false);
  return [...items.filter((x) => !blocked(x)), ...items.filter(blocked)];
}

function GiftPicker({ s, c }: { s: GameState; c: Character }) {
  const [more, setMore] = useState(false);
  const { known, list } = useMemo(() => rankedGifts(s, c), [s, c]);
  const best = list.slice(0, 3);
  const cats = [...new Set(list.map((x) => x.g.cat))];
  const [cat, setCat] = useState(cats[0]);
  return (
    <div className="space-y-1.5" data-testid="gift-picker">
      <div className="text-[11px] text-stone-400">{known ? 'The three he would like best:' : 'You do not know his tastes yet (trust 20+). Three that suit his station:'}</div>
      {best.map((x) => <ActionCard key={x.g.id} s={s} compact action={{ kind: 'econ', op: { type: 'gift', giftId: x.g.id, to: c.id } }} label={`${x.g.name} — ${fmt$(x.price)}${x.liked ? ' ♥' : ''}`} />)}
      <button type="button" className="text-[11px] text-gold-300 underline" onClick={() => setMore((m) => !m)}>{more ? 'fewer' : `more… (${list.length} in the catalogue)`}</button>
      {more && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">{cats.map((k) => <button key={k} type="button" onClick={() => setCat(k)} className={`text-[11px] px-1.5 py-0.5 rounded ${cat === k ? 'bg-noir-700 text-gold-300' : 'text-stone-400'}`}>{GIFT_CAT_LABEL[k]}</button>)}</div>
          {list.filter((x) => x.g.cat === cat).map((x) => <ActionCard key={x.g.id} s={s} compact action={{ kind: 'econ', op: { type: 'gift', giftId: x.g.id, to: c.id } }} label={`${x.g.name} — ${fmt$(x.price)}${x.liked ? ' ♥' : x.disliked ? ' ✕' : ''}`} />)}
        </div>
      )}
    </div>
  );
}

function Item({ s, c, it, onDone }: { s: GameState; c: Character; it: MenuItem; onDone?: () => void }) {
  const { plan } = usePlanner();
  const travel = useTravel();
  const { openPicker } = useClarity();
  const shell = useShell();
  const [gifts, setGifts] = useState(false);
  if (it.action) return <ActionCard s={s} action={it.action} label={it.label} compact />;
  const o = it.open!;
  if (o.type === 'gifts' && gifts) return <GiftPicker s={s} c={c} />;
  if (o.type === 'ears' && gifts) return <div className="sm:col-span-2 rounded-md border border-noir-700 p-2">{o.mode === 'web' ? <ConnectionsList s={s} id={c.id} compact /> : <EarsPicker s={s} target={c} mode={o.mode} />}</div>;
  const run = () => {
    if (o.type === 'plan') { onDone?.(); plan(o.kind, c.id); }
    else if (o.type === 'trip') { onDone?.(); travel.plan(c.id); }
    else if (o.type === 'flee') { onDone?.(); travel.flee(c.id); }
    else if (o.type === 'marriage') { onDone?.(); openPicker({ kind: 'marriage', memberId: c.id }); }
    else if (o.type === 'go') { onDone?.(); shell.go(o.to); }
    else if (o.type === 'gifts' || o.type === 'ears') setGifts(true);
  };
  return (
    <button type="button" onClick={run} className={`w-full rounded-md border px-3 py-2 text-left ${it.hostile ? 'border-blood-500/50 hover:bg-blood-500/10' : 'border-noir-700 bg-noir-800/70 hover:border-gold-500'}`}>
      <div className={`text-sm font-semibold ${it.hostile ? 'text-red-300' : 'text-stone-100'}`}>{it.label ?? (o.type === 'go' ? o.label : '')} <span className="text-gold-300">▸</span></div>
      {it.text && <div className="text-[11px] text-stone-400">{it.text}</div>}
    </button>
  );
}

/**
 * Everything you can do to one person, CK style: categories down the side
 * (or across, when narrow), order cards with their verdict, cost and odds.
 */
export function InteractionMenu({ s, c, initial, onDone, cats: given }: { s: GameState; c: Character; initial?: MenuCategoryId; onDone?: () => void; cats?: MenuCategory[] }) {
  const cats = useMemo(() => given ?? menuFor(s, c), [given, s, c]);
  const [cur, setCur] = useState<MenuCategoryId | undefined>(initial && cats.some((x) => x.id === initial) ? initial : cats[0]?.id);
  if (!cats.length) return null;
  const cat = cats.find((x) => x.id === cur) ?? cats[0];
  return (
    <section className="mt-4" data-testid="interaction-menu">
      <div className="panel-title text-base">{c.id === s.playerId ? 'Your own business' : `Deal with ${c.firstName}`}</div>
      <p className="text-[11px] text-stone-500">Orders are carried out when you advance the week. Right-click any face, anywhere, for this menu.</p>
      <nav className="mt-1.5 flex flex-wrap gap-1" aria-label="Interaction categories">
        {cats.map((x) => (
          <button key={x.id} type="button" onClick={() => setCur(x.id)} data-testid={`menu-cat-${x.id}`}
            className={`rounded px-2 py-1 text-xs font-semibold ${cat.id === x.id ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`}>
            {x.label} <span className={cat.id === x.id ? 'text-noir-800' : 'text-stone-500'}>{x.items.length}</span>
          </button>
        ))}
      </nav>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {sortItems(s, cat.items).map((it) => <Item key={it.key} s={s} c={c} it={it} onDone={onDone} />)}
      </div>
    </section>
  );
}

/** The right-click menu: the same categories in a floating card at the cursor. */
export function ContextMenu({ s, id, x, y, category, onClose }: { s: GameState; id: string; x: number; y: number; category?: MenuCategoryId; onClose: () => void }) {
  const c = s.characters[id];
  const { open } = useSheet();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(true, onClose);
  if (!c) return null;
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  const width = Math.min(560, w - 16);
  const left = Math.max(8, Math.min(x, w - width - 8));
  const top = Math.max(8, Math.min(y, h - 360));
  return (
    <div className="fixed inset-0 z-[1180]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} data-testid="context-menu-backdrop">
      <div ref={ref} className="absolute panel border-gold-600/60 p-3 overflow-y-auto shadow-2xl shadow-black/80" style={{ left, top, width, maxHeight: h - top - 8 }} onClick={(e) => e.stopPropagation()} data-testid="context-menu">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-display text-lg text-gold-400 truncate">{displayName(c)}</div>
          <div className="flex gap-1 shrink-0">
            <button type="button" className="btn-ghost text-xs py-0.5" onClick={() => { onClose(); open(c.id); }}>Open sheet</button>
            <button type="button" className="btn-ghost text-xs py-0.5" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>
        <InteractionMenu s={s} c={c} initial={category} onDone={onClose} />
      </div>
    </div>
  );
}
