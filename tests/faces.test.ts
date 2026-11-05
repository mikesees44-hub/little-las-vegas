import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGameWith } from '../src/engine/starts';
import { advanceWeek } from '../src/engine/engine';
import { FACES } from '../src/engine/faces';

describe('painted faces', () => {
  for (const start of ['classic', 'olddon', 'associate'] as const) {
    it(`${start}: the boss and the top of the cast get unique paintings`, () => {
      let s = newGameWith('faces-1', start as never);
      const held = () => Object.values(s.characters).filter((c) => c.alive && c.appearance?.face);
      const faces = held().map((c) => c.appearance!.face!);
      expect(new Set(faces).size).toBe(faces.length);
      expect(s.characters[s.playerId].appearance?.face).toBeTruthy();
      expect(faces.every((f) => FACES.some((x) => x.k === f))).toBe(true);
      // eslint-disable-next-line no-console
      console.log(start, held().map((c) => `${c.firstName} ${c.lastName} ${c.rank}${c.office ? '/' + c.office : ''} ${c.gender}=${c.appearance!.face}`).join('; '));
      const before = s.characters[s.playerId].appearance?.face;
      s = advanceWeek(s).state;
      expect(s.characters[s.playerId].appearance?.face).toBe(before);
      const after = Object.values(s.characters).filter((c) => c.alive && c.appearance?.face).map((c) => c.appearance!.face!);
      expect(new Set(after).size).toBe(after.length);
    });
  }
});

describe('stage faces', () => {
  it('a man on the stage gets a star face, and nobody else does', () => {
    let s = newGameWith('faces-stage', 'olddon' as never);
    for (let w = 0; w < 3; w++) s = advanceWeek(s).state;
    const stars = FACES.filter((f) => f.tags.includes('star' as never)).map((f) => f.k);
    for (const c of Object.values(s.characters)) {
      if (c.alive && c.appearance?.face && stars.includes(c.appearance.face)) {
        expect(c.gender).toBe('M');
      }
    }
  });
});
