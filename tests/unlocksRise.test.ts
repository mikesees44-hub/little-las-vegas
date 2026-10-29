import { describe, expect, it } from 'vitest';
import { newGameWith, recommendedStart, STARTS } from '../src/engine/starts';
import { homeLock, rung, sectionVisible } from '../src/ui/shell/unlocks';
import { HOME_IDS } from '../src/ui/shell/routes';
import { HINTS, HINT_GAP_MS } from '../src/ui/shell/hints';
import { playWeeks } from './helpers';

describe('unlock by growth', () => {
  it('week 1: Desk, Family, Money, Map open; Life and Rivals greyed with a reason', () => {
    const s = newGameWith('unl-w1', 'rise');
    for (const h of ['desk', 'org', 'money', 'map'] as const) expect(homeLock(s, h), h).toBeUndefined();
    expect(homeLock(s, 'life')).toMatch(/Opens/);
    if (rung(s) < 4 && !s.rivals.some((r) => r.lastMove?.target === 'player')) expect(homeLock(s, 'rivals')).toMatch(/borgata/);
  });
  it('a seasoned save shows everything', () => {
    const s = playWeeks('unl-season', 17);
    for (const h of HOME_IDS) expect(homeLock(s, h), h).toBeUndefined();
    expect(sectionVisible(s, 'borgata.chain')).toBe(true);
  });
  it('the recommended start is data (one start), and hints are paced', () => {
    expect((Object.keys(STARTS) as (keyof typeof STARTS)[]).filter((k) => STARTS[k].recommended)).toEqual([recommendedStart()]);
    expect(HINT_GAP_MS).toBe(60000);
    expect(HINTS.find((h) => h.id === 'desk')?.text).toMatch(/Red needs you/);
  });
});
