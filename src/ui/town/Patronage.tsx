import type { GameState } from '../../engine/types';
import { GiftsPanel } from '../econ/Gifts';

export function PatronagePanel({ s }: { s: GameState }) {
  return <GiftsPanel s={s} />;
}
