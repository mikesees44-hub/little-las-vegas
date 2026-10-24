import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Portrait } from '../src/ui/portrait/Portrait';
import { founderGenes, genesOf, LOCI } from '../src/ui/portrait/genes';
import { newGame } from '../src/engine/newGame';
import type { Character } from '../src/engine/types';

describe('portraits', () => {
  it('are deterministic and render for every character in a new game', () => {
    const s = newGame('portrait-test');
    for (const c of Object.values(s.characters)) {
      const a = renderToStaticMarkup(createElement(Portrait, { c, seed: s.seed, date: s.date }));
      const b = renderToStaticMarkup(createElement(Portrait, { c: { ...c }, seed: s.seed, date: s.date }));
      expect(a).toBe(b);
      expect(a).toContain('<svg');
    }
  });
  it('children inherit each locus from a parent', () => {
    const kid = { id: 'kid', fatherId: 'dad', motherId: 'mom' };
    const g = genesOf('x', kid);
    const f = founderGenes('x', 'dad');
    const m = founderGenes('x', 'mom');
    const own = founderGenes('x', 'kid');
    const fromParents = LOCI.filter((l) => ['nose', 'jaw', 'hair', 'eyes'].includes(l) && (g[l] === f[l] || g[l] === m[l] || g[l] === own[l]));
    expect(fromParents.length).toBe(4);
  });
  it('marks the dead and the jailed', () => {
    const s = newGame('portrait-test-2');
    const c = Object.values(s.characters).find((x) => x.gender === 'M') as Character;
    const dead = renderToStaticMarkup(createElement(Portrait, { c: { ...c, alive: false, death: { week: 1, date: s.date, cause: 'x' } }, seed: s.seed, date: s.date }));
    expect(dead).toContain('deceased');
    expect(dead).toContain('feColorMatrix');
    const jailed = renderToStaticMarkup(createElement(Portrait, { c: { ...c, imprisonedUntil: s.week + 50 }, seed: s.seed, date: s.date }));
    expect(jailed).toContain('JAIL');
  });
});
