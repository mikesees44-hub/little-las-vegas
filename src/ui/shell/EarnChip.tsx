import { useMemo } from 'react';
import { fixGroups } from '../../engine/fastFix';
import type { GameState } from '../../engine/types';
import { FixChip } from './FixChips';

/**
 * Always in sight: how many of your men are not earning (or are broke), and one tap to fix them.
 * The chip opens a short list (each man, why, the one fix) with "Fix all" — one confirm, real orders.
 * Hidden when everyone is earning and nobody is broke. (One of the fix chips: FixChips.tsx.)
 */
export function EarnChip({ s, initialOpen }: { s: GameState; initialOpen?: boolean }) {
  const g = useMemo(() => fixGroups(s).find((x) => x.kind === 'earn'), [s]);
  return g ? <FixChip g={g} initialOpen={initialOpen} /> : null;
}
