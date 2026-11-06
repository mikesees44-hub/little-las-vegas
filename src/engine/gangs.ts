import type { ActionPreview } from './actions';
import type { FamAction, FamOp } from './familyWeb';
import type { Ctx } from './ledger';
import type { GameState } from './types';

/** Gangs that crop up (the next commit fills this in). */
export function previewGang(_s: GameState, _a: Extract<FamAction, { op: 'gang' }>): ActionPreview {
  return { title: 'A gang', effects: [], cost: 0, because: '', category: 'cost', disabledReason: 'No such gang' };
}
export function applyGangOp(_ctx: Ctx, _o: Extract<FamOp, { op: 'gang' }>): void {}
export function gangsWeek(_ctx: Ctx): void {}
