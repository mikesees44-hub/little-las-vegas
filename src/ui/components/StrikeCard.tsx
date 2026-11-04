import { momentView, type MomentView } from '../../engine/daily';
import type { GameState } from '../../engine/types';
import { Modal } from './Modal';
import { DecisionCard } from '../decide/DecisionCard';
import { CutClip } from './CutClip';

/**
 * A TICKING CLOCK RUNS OUT (threats.ts resolveStrike; the storm: setPieces.ts resolveStorm): a threat lands on its day and hour,
 * the clock stops, and the boss has a moment. Every answer shows its odds (the chance it comes to
 * nothing), and the roll happens the moment he picks. Closing the card is "let your people handle it".
 */
export function StrikeCard({ s, id, onChoose, view, kicker }: { s: GameState; id: string; onChoose: (opt: string) => void; view?: MomentView; kicker?: string }) {
  const v = view ?? momentView(s, id);
  if (!v) return null;
  return (
    <Modal onClose={() => onChoose(v.def)}>
      {v.clip && <CutClip k={v.clip} />}
      <div className="p-4 sm:p-6" data-testid={kicker ? 'call-card' : 'strike-card'}>
        {kicker && <div className="mb-1 flex items-center gap-2 text-xs text-gold-300" data-testid="call-kicker"><span className="llv-ring inline-flex h-6 w-6 items-center justify-center rounded-full border border-blood-500/70 bg-noir-800" aria-hidden>☎</span>{kicker}</div>}
        <div className="text-[10px] uppercase tracking-[0.3em] text-red-400">{v.when || 'Now'}{v.warned ? ' · you were warned' : ''}</div>
        <h2 className="font-display text-2xl text-gold-400 leading-tight mt-1">{v.title}</h2>
        <p className="mt-3 text-stone-300 leading-relaxed">{v.text}</p>
        <div className="mt-4">
          <DecisionCard s={s} compact keys
            options={v.options.map((o) => ({
              id: o.id, label: o.label, detail: o.hint, disabled: o.blocked, rowTestId: `strike-${o.id}`,
              odds: { known: true, chance: o.odds, label: 'It goes your way', reasons: [] },
            }))}
            onDecide={(oid) => onChoose(oid)}
            primaryLabel={(o) => (!o ? 'Your call' : `${o.label} ▸`)} />
        </div>
      </div>
    </Modal>
  );
}
