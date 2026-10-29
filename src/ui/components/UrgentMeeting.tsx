import { MEET_HOURS, urgentMeetings, type MeetVia, type ResponseId } from '../../engine/threats';
import type { GameState } from '../../engine/types';
import { Face } from './People';
import { Modal } from './Modal';
import { DecisionCard } from '../decide/DecisionCard';
import type { OddsView } from '../../engine/decide';

const NO_ROLL: OddsView = { known: false, label: 'no roll', reasons: [] };
const CERTAIN: OddsView = { known: false, label: 'certain', reasons: [] };

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
          <button className="btn-quiet text-xs" onClick={onClose} data-testid="urgent-later" aria-label="Close">✕</button>
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
          <DecisionCard s={s} compact keys
            options={[
              { id: 'boss', label: 'Meet him now', detail: u.canMeet ?? `About ${MEET_HOURS} hours. He talks more freely to you, and only you can play the feds along.`, odds: NO_ROLL, disabled: u.canMeet, rowTestId: 'urgent-meet' },
              { id: 'underboss', label: `Send the underboss${u.underboss ? `: ${u.underboss}` : ''}`, detail: 'Costs you nothing. Whatever you decide lands a little softer second-hand.', odds: NO_ROLL, disabled: u.underboss ? undefined : 'No underboss in the seat', rowTestId: 'urgent-underboss' },
              { id: 'consigliere', label: `Send the consigliere${u.consigliere ? `: ${u.consigliere}` : ''}`, detail: 'The best nose for a story somebody planted.', odds: NO_ROLL, disabled: u.consigliere ? undefined : 'No consigliere in the seat', rowTestId: 'urgent-consigliere' },
              { id: 'ignore', label: 'Tell him not now', odds: NO_ROLL, hostile: true, rowTestId: 'urgent-ignore',
                worst: { label: 'If it is real', text: 'it lands in full, and he remembers he stuck his neck out for nothing.', effects: [] } },
            ]}
            onDecide={(id) => (id === 'ignore' ? onIgnore(u.id) : onMeet(u.id, id as MeetVia))}
            primaryLabel={(o) => (!o ? 'Pick one' : o.id === 'ignore' ? 'Send him away' : o.id === 'boss' ? 'Meet him ▸' : 'Send him ▸')}
            primaryTestId="urgent-go"
            onLater={onClose} laterLabel="Later"
            testid="urgent-decide" />
        )}

        {u.status !== 'waiting' && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">{u.via === 'boss' ? 'What he told you' : `What he told ${viaName ?? 'your man'}`}</div>
            <p className="mt-1 text-stone-200 leading-relaxed" data-testid="urgent-detail">{u.detail}</p>
            {u.read && <p className="mt-1 text-[12px] text-sky-300" data-testid="urgent-read">{u.read}</p>}
            <div className="mt-3 text-[10px] uppercase tracking-widest text-stone-500">What do we do? <span className="normal-case tracking-normal text-stone-600">(done when the week turns, before it lands)</span></div>
            <DecisionCard s={s} compact keys selected={u.response}
              options={u.responses.map((r) => ({ id: r.id, label: r.label, detail: r.hint, odds: r.id === 'nothing' ? NO_ROLL : CERTAIN, done: u.response === r.id, rowTestId: `urgent-resp-${r.id}`,
                worst: r.id === 'nothing' ? { label: 'If it is real', text: 'it lands in full.', effects: [] } : undefined }))}
              onDecide={(id) => onRespond(u.id, id as ResponseId)}
              primaryLabel={(o) => (o ? (u.response === o.id ? 'Your answer ✓' : 'Give the order ▸') : 'Pick one')}
              primaryTestId="urgent-answer"
              onLater={onClose} laterLabel="Later"
              testid="urgent-respond" />
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
