import { MEET_HOURS, urgentMeetings, type MeetVia, type ResponseId } from '../../engine/threats';
import type { GameState } from '../../engine/types';
import { Face } from './People';
import { Modal } from './Modal';

/**
 * An urgent meeting (threats.ts): somebody heard something and wants to see
 * the boss. Who's asking and the one line he would say out loud; take the
 * meeting yourself (a couple of hours, in town), send the underboss or the
 * consigliere, or brush him off. At the meeting: the whole story, your man's
 * read on it, and the answers, carried out when the week turns.
 */
export function UrgentMeeting({ s, id, onMeet, onIgnore, onRespond, onPick, onClose }: {
  s: GameState;
  id: string;
  onMeet: (id: string, via: MeetVia) => void;
  onIgnore: (id: string) => void;
  onRespond: (id: string, r: ResponseId) => void;
  /** Open another meeting from the strip. */
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const all = urgentMeetings(s);
  const u = all.find((x) => x.id === id);
  if (!u) return null;
  const c = u.charId ? s.characters[u.charId] : undefined;
  const i = all.indexOf(u);
  const viaName = u.via === 'underboss' ? u.underboss : u.via === 'consigliere' ? u.consigliere : undefined;
  return (
    <Modal onClose={onClose}>
      <div className="p-4 sm:p-6" data-testid="urgent-meeting">
        <div className="flex justify-between items-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-red-400">Urgent meeting{all.length > 1 ? ` · ${i + 1} of ${all.length}` : ''}</div>
          <button className="text-xs text-stone-500 hover:text-gold-300" onClick={onClose} data-testid="urgent-later">Later ✕</button>
        </div>
        <div className="flex gap-3 items-start mt-1">
          {c && <div className="shrink-0"><Face s={s} c={c} size={60} /></div>}
          <div className="min-w-0">
            <h2 className="font-display text-2xl text-gold-400 leading-tight">{u.who} wants to see you</h2>
            <div className="text-[11px] text-stone-400 mt-0.5">{u.role} · <span className={u.when === 'This week' ? 'text-red-300' : 'text-amber-300'} data-testid="urgent-deadline">{u.when}</span></div>
          </div>
        </div>
        <p className="mt-3 text-stone-300 leading-relaxed italic" data-testid="urgent-hint">"{u.hint}"</p>

        {u.status === 'waiting' && (
          <div className="mt-4 space-y-1.5">
            <button type="button" className="w-full text-left rounded border border-gold-600/60 bg-gold-500/10 px-3 py-2 hover:border-gold-400 disabled:opacity-40" disabled={!!u.canMeet} onClick={() => onMeet(u.id, 'boss')} data-testid="urgent-meet">
              <div className="text-sm font-semibold text-gold-300">Meet him now</div>
              <div className="text-[11px] text-stone-400">{u.canMeet ?? `About ${MEET_HOURS} hours. He talks more freely to you, and only you can play the feds along.`}</div>
            </button>
            <button type="button" className="w-full text-left rounded border border-noir-600 px-3 py-2 hover:border-gold-500 disabled:opacity-40" disabled={!u.underboss} onClick={() => onMeet(u.id, 'underboss')} data-testid="urgent-underboss">
              <div className="text-sm font-semibold text-stone-200">Send the underboss{u.underboss ? `: ${u.underboss}` : ''}</div>
              <div className="text-[11px] text-stone-400">{u.underboss ? 'Costs you nothing. Whatever you decide lands a little softer second-hand.' : 'No underboss in the seat.'}</div>
            </button>
            <button type="button" className="w-full text-left rounded border border-noir-600 px-3 py-2 hover:border-gold-500 disabled:opacity-40" disabled={!u.consigliere} onClick={() => onMeet(u.id, 'consigliere')} data-testid="urgent-consigliere">
              <div className="text-sm font-semibold text-stone-200">Send the consigliere{u.consigliere ? `: ${u.consigliere}` : ''}</div>
              <div className="text-[11px] text-stone-400">{u.consigliere ? 'The best nose for a story somebody planted.' : 'No consigliere in the seat.'}</div>
            </button>
            <button type="button" className="w-full text-left rounded border border-noir-700 px-3 py-2 hover:border-red-500" onClick={() => onIgnore(u.id)} data-testid="urgent-ignore">
              <div className="text-sm font-semibold text-stone-300">Tell him not now</div>
              <div className="text-[11px] text-stone-500">If it's real, it lands in full, and he'll remember he stuck his neck out for nothing.</div>
            </button>
          </div>
        )}

        {u.status !== 'waiting' && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">{u.via === 'boss' ? 'What he told you' : `What he told ${viaName ?? 'your man'}`}</div>
            <p className="mt-1 text-stone-200 leading-relaxed" data-testid="urgent-detail">{u.detail}</p>
            {u.read && <p className="mt-1 text-[12px] text-sky-300" data-testid="urgent-read">{u.read}</p>}
            <div className="mt-3 text-[10px] uppercase tracking-widest text-stone-500">What do we do? <span className="normal-case tracking-normal text-stone-600">(done when the week turns, before it lands)</span></div>
            <div className="mt-1 grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Your answer">
              {u.responses.map((r) => (
                <button key={r.id} type="button" role="radio" aria-checked={u.response === r.id} onClick={() => onRespond(u.id, r.id)} data-testid={`urgent-resp-${r.id}`}
                  className={`text-left rounded border px-2.5 py-1.5 ${u.response === r.id ? 'border-gold-400 bg-gold-500/15' : 'border-noir-600 hover:border-gold-500'}`}>
                  <div className="text-sm text-stone-100">{r.label}</div>
                  <div className="text-[11px] text-stone-400">{r.hint}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {all.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-1 text-[11px]">
            {all.map((x) => (
              <button key={x.id} type="button" onClick={() => onPick(x.id)} className={`rounded border px-1.5 py-0.5 ${x.id === u.id ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-400 hover:border-gold-500'}`}>
                {x.who}{x.status === 'waiting' ? ' •' : x.response ? ' ✓' : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
