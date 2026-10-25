import type { GameState } from '../../engine/types';
import { CrewListPart } from '../components/CrewList';

export function CaposSection({ s }: { s: GameState }) {
  return <CrewListPart s={s} part="capos" />;
}
