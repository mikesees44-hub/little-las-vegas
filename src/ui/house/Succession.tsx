import type { GameState, SuccessionLaw } from '../../engine/types';
import { FamilyTree } from '../components/FamilyTree';
import { PowerPart } from '../power/PowerTab';

/** The House › Succession: the one place to name an heir. */
export function Succession({ s, pendingLaw, pendingHeir, onLaw, onHeir }: { s: GameState; pendingLaw?: SuccessionLaw; pendingHeir?: string; onLaw: (l: SuccessionLaw) => void; onHeir: (id: string) => void }) {
  return (
    <div className="space-y-6" data-testid="succession">
      <PowerPart s={s} part="crisis" />
      <FamilyTree s={s} pendingLaw={pendingLaw} pendingHeir={pendingHeir} onLaw={onLaw} onHeir={onHeir} />
      <PowerPart s={s} part="heirs" />
    </div>
  );
}
