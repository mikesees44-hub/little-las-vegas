import { describe, expect, it } from 'vitest';
import { crew } from '../src/engine/characters';
import { newGame } from '../src/engine/newGame';
import { addOpinion } from '../src/engine/relations';
import { newWarnings, pauseReason } from '../src/ui/clock';

describe('the clock', () => {
  it('pauses for decisions, open windows and the end of the game', () => {
    const s = newGame('clock');
    expect(s.pendingEvents.length).toBeGreaterThan(0);
    expect(pauseReason(s, false)).toMatch(/decision/);
    expect(pauseReason(s, false, 0)).toBeUndefined();
    expect(pauseReason(s, true, 0)).toMatch(/window/);
  });
  it('notices new warnings', () => {
    const a = newGame('warn');
    const b = JSON.parse(JSON.stringify(a));
    const capo = crew(b).find((c) => c.rank === 'capo')!;
    addOpinion(b, capo.id, b.playerId, 'Test', -100, 0);
    addOpinion(b, capo.id, b.playerId, 'Test 2', -100, 0);
    addOpinion(b, capo.id, b.playerId, 'Test 3', -100, 0);
    expect(newWarnings(a, b).some((t) => t.includes(capo.firstName))).toBe(true);
    expect(newWarnings(b, b)).toEqual([]);
  });
});
