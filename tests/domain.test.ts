import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DOMAIN_IDS, domainOf, domainOfText } from '../src/ui/domain';
import { JCATS } from '../src/engine/journal';
import { newGame } from '../src/engine/newGame';

/** Domain colours (ui/domain.ts, index.css): one map, every category has a home, every token exists. */
describe('domain colors', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'index.css'), 'utf8');
  it('every domain has an accent, an ink and a class', () => {
    for (const d of DOMAIN_IDS) {
      expect(css).toMatch(new RegExp(`--d-${d}: \\d+ \\d+ \\d+;`));
      expect(css).toMatch(new RegExp(`--d-${d}-ink: \\d+ \\d+ \\d+;`));
      expect(css).toContain(`.llv-d-${d} {`);
    }
  });
  it('maps Your File categories, story themes, nav keys and homes in one place', () => {
    for (const c of JCATS) expect(DOMAIN_IDS).toContain(domainOf(c));
    for (const t of ['crew', 'family', 'romance', 'rivals', 'law', 'town', 'business', 'chain', 'world', 'institution']) expect(DOMAIN_IDS).toContain(domainOf(t));
    expect(domainOf('holdings.money')).toBe('money');
    expect(domainOf('town.case')).toBe('law');
    expect(domainOf('town.cityhall')).toBe('politics');
    expect(domainOf('house.marriages')).toBe('family');
    expect(domainOf('diplomacy.board')).toBe('rivals');
    expect(domainOf('nonsense')).toBeUndefined();
    const s = newGame('dom-text');
    expect(domainOfText(s, 'The FBI opened a file')).toBe('law');
    expect(domainOfText(s, 'Your wife wants a word')).toBe('family');
    expect(domainOfText(s, 'Father Doyle asks for the parish roof')).toBe('church');
    expect(domainOfText(s, 'Nothing at all')).toBeUndefined();
  });
  it('the legend names every domain (colour is never the only signal)', async () => {
    const { DomainLegend } = await import('../src/ui/components/Layout');
    const html = renderToString(createElement(DomainLegend));
    for (const w of ['Family &amp; house', 'Money', 'Law &amp; the feds', 'Rivals &amp; war', 'Romance &amp; nightlife', 'Church &amp; community', 'The shore &amp; travel']) expect(html).toContain(w);
  });
});
