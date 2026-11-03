import { momentView } from '../../engine/daily';
import type { GameState } from '../../engine/types';
import { Modal } from './Modal';
import { DecisionCard } from '../decide/DecisionCard';

/**
 * A TICKING CLOCK RUNS OUT (threats.ts resolveStrike; the storm: setPieces.ts resolveStorm): a threat lands on its day and hour,
 * the clock stops, and the boss has a moment. Every answer shows its odds (the chance it comes to
 * nothing), and the roll happens the moment he picks. Closing the card is "let your people handle it".
 */
export function StrikeCard({ s, id, onChoose }: { s: GameState; id: string; onChoose: (opt: string) => void }) {
  const v = momentView(s, id);
  if (!v) return null;
  return (
    <Modal onClose={() => onChoose(v.def)}>
      <div className="p-4 sm:p-6" data-testid="strike-card">
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
