import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGameWith } from '../src/engine/starts';
import { allure, appetite } from '../src/engine/looks';
import { ageOn } from '../src/engine/calendar';

describe('allure', () => {
  it('a ladies\' man with charm and appetite gets around easier; minors are out', () => {
    const s = newGameWith('allure-1', 'classic');
    const boss = s.characters[s.playerId];
    const woman = Object.values(s.characters).find((c) => c.alive && c.gender !== 'M' && ageOn(c.birth, s.date) >= 21 && ageOn(c.birth, s.date) <= 45)!;
    const plain = { ...boss, traits: [] as typeof boss.traits, rank: 'soldier' as const };
    const rake = { ...boss, traits: ['Charming', 'Womanizer'] as typeof boss.traits, rank: 'boss' as const };
    expect(allure(s, rake, woman).value).toBeGreaterThan(allure(s, plain, woman).value + 15);
    expect(appetite(s, rake)).toBeGreaterThanOrEqual(appetite(s, plain));
    const kid = { ...woman, birth: { ...s.date, y: s.date.y - 15 } };
    expect(allure(s, rake, kid).value).toBe(0);
  });
});
