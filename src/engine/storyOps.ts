import { displayName } from './characters';
import type { Ctx } from './ledger';
import { addSecret } from './secrets';
import { applyRomanceOp, describeRomanceOp } from './romance';
import type { StoryOp } from './storyState';
import { FACTION_NAMES } from './world';
import type { GameState } from './types';

/**
 * The story pillar's effect ops (Effect `{ type: 'storyOp' }`): secrets
 * created by pack events, and the romance layer's relationship changes.
 */

export function applyStoryOp(ctx: Ctx, op: StoryOp): void {
  const s = ctx.s;
  switch (op.op) {
    case 'secret': {
      const c = s.characters[op.charId];
      if (!c?.alive) break;
      const sec = addSecret(s, c, op.kind, []);
      if (op.text) sec.text = op.text;
      for (const k of op.knownBy) if (!sec.knownBy.includes(k)) sec.knownBy.push(k);
      break;
    }
    default:
      applyRomanceOp(ctx, op);
      break;
  }
}

export function describeStoryOp(s: GameState, op: StoryOp): string | undefined {
  const nm = (id: string) => { const c = s.characters[id]; return c ? displayName(c) : '?'; };
  switch (op.op) {
    case 'secret':
      return op.knownBy.includes('player') ? `You learn a secret about ${nm(op.charId)}` : `${op.knownBy.map((f) => FACTION_NAMES[f]).join(', ')} learn${op.knownBy.length > 1 ? '' : 's'} a secret about ${op.charId === s.playerId ? 'you' : nm(op.charId)}`;
    default:
      return describeRomanceOp(s, op);
  }
}
