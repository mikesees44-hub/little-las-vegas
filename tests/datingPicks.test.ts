import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGameWith } from '../src/engine/starts';
import { previewAction } from '../src/engine/actions';
import { bestChances } from '../src/engine/datingPicks';

describe('your best chances', () => {
  it('ranks the next step with her odds, best first, each a real order', () => {
    const s = newGameWith('best-1', 'associate');
    const b = bestChances(s);
    expect(b.length).toBeGreaterThan(0);
    for (let i = 1; i < b.length; i++) expect(b[i].chance).toBeLessThanOrEqual(b[i - 1].chance);
    for (const x of b) expect(previewAction(s, x.action).disabledReason).toBeUndefined();
    expect(b[0].chance).toBeGreaterThan(0.3);
  });
});
