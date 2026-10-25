import type { GameState } from '../../engine/types';
import { CrewListPart } from '../components/CrewList';

export function CouncilSeats({ s }: { s: GameState }) {
  return <CrewListPart s={s} part="council" />;
}
