import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { makeCharacter } from '../src/engine/characters';
import { previewAction } from '../src/engine/actions';
import { ensureDating, setDatingSettings } from '../src/engine/datingState';
import { ensureProviders, isAdult } from '../src/engine/dating';
import { startRomance } from '../src/engine/romance';
import { ensureRomance } from '../src/engine/storyState';
import { ensureEars } from '../src/engine/ears';
import { ensurePayroll } from '../src/engine/payrollState';
import { ensureTie } from '../src/engine/bonds';
import { ensureSingle } from '../src/engine/single';
import { affairFor } from '../src/engine/womenCore';
import { littleBlackBook, bookRows, BOOK_SECTIONS, type BookSection } from '../src/engine/blackBook';
import type { Character, GameState } from '../src/engine/types';

function woman(s: GameState, age = 28): Character {
  const c = makeCharacter(s, { gender: 'F', age, rank: 'civilian', faction: 'none', nickname: false, traits: [] });
  c.orientation = 'straight';
  ensureDating(s).met[c.id] = s.week;
  return c;
}

interface Seeded { s: GameState; comer: string; fling: string; courting: string; dating: string; paid: string; ear: string; payroll: string; pregnant: string; wife: string; minor: string }

/** A married boss a few weeks in, with one of each kind of woman. */
function seeded(seed = 'bb-1'): Seeded {
  let s = newGame(seed);
  s = advanceWeek(s, {}).state;
  const boss = s.characters[s.playerId];
  boss.orientation = 'straight';
  s.tribute!.acct.personal = 5000;
  const D = ensureDating(s);
  // His wife (or one made for the test), jealous of another woman.
  let wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (!wife?.alive) {
    wife = woman(s, 34);
    boss.spouseId = wife.id;
    wife.spouseId = boss.id;
  }
  const tie = ensureTie(s, wife.id, 'wife')!;
  tie.mem.push({ w: s.week, k: 'jealous', t: 'the night she smelled perfume on his coat', v: -10 });
  // Courting: a date, friends, not yet seeing each other.
  const courting = woman(s, 26);
  D.bonds[courting.id] = { id: courting.id, aff: 30, rung: 'friends', dates: 1, since: s.week, gifts: [], via: 'test', last: s.week };
  // Dating: a romance with the boss.
  const dating = woman(s, 29);
  D.bonds[dating.id] = { id: dating.id, aff: 65, rung: 'attracted', dates: 4, since: s.week, gifts: [], via: 'test', last: s.week };
  expect(startRomance(s, boss.id, dating.id)).toBeTruthy();
  // A paid regular.
  ensureProviders(s, D);
  const prov = Object.values(D.providers).find((p) => p.status === 'working' && p.offers && isAdult(s, s.characters[p.id]))!;
  prov.visits = [s.week - 1, s.week - 2, s.week - 3].filter((w) => w >= 0);
  if (!prov.visits.length) prov.visits = [0];
  // An ear on the street.
  const E = ensureEars(s);
  const ear = Object.values(E.ears).find((e) => s.characters[e.id]?.gender === 'F' && isAdult(s, s.characters[e.id]))!;
  ear.known = true;
  ear.status = 'listening';
  // A woman on the payroll (the books).
  const book = woman(s, 40);
  ensurePayroll(s).hires[book.id] = { id: book.id, job: 'bookkeeper', wage: 60, since: s.week, loyalty: 80, knows: 55, unpaid: 0, paid: 0, made: 4000 };
  // Pregnant with his child (and she has told him).
  const preg = woman(s, 27);
  D.bonds[preg.id] = { id: preg.id, aff: 70, rung: 'attracted', dates: 5, since: s.week, gifts: [], via: 'test' };
  startRomance(s, boss.id, preg.id);
  const R = ensureRomance(s);
  R.pregnancies.push({ id: 'pg-test', motherId: preg.id, fatherId: boss.id, dueWeek: s.week + 20 });
  D.preg.push({ id: 'pg-test', motherId: preg.id, week: s.week, knownBy: [preg.id, boss.id], tellAt: s.week });
  // A woman who came on to him (open), and a night that went nowhere.
  const comer = woman(s, 31);
  ensureSingle(s).open = { id: comer.id, w: s.week, who: 'club', why: 'looks', m: 1 };
  const fling = woman(s, 33);
  const af = affairFor(s, fling.id);
  af.stage = 'ended'; af.n = 1; af.last = s.week; af.ended = { week: s.week, by: 'her', why: 'Just the once' };
  // A minor he has "met" (bad data): never listed.
  const kid = woman(s, 16);
  D.bonds[kid.id] = { id: kid.id, aff: 80, rung: 'attracted', dates: 3, since: 0, gifts: [], via: 'bad data' };
  return { s, comer: comer.id, fling: fling.id, courting: courting.id, dating: dating.id, paid: prov.id, ear: ear.id, payroll: book.id, pregnant: preg.id, wife: wife.id, minor: kid.id };
}

const has = (b: ReturnType<typeof littleBlackBook>, id: string, k: BookSection) => !!b.rows.find((r) => r.id === id)?.sections.includes(k);

describe('the little black book', () => {
  const T = seeded();
  const b = littleBlackBook(T.s);

  it('sorts every woman into her sections, from the game as it stands', () => {
    expect(has(b, T.courting, 'interested')).toBe(true);
    expect(has(b, T.courting, 'dating')).toBe(false);
    expect(has(b, T.dating, 'dating')).toBe(true);
    expect(has(b, T.dating, 'interested')).toBe(false);
    expect(has(b, T.paid, 'releases')).toBe(true);
    expect(has(b, T.ear, 'secrets')).toBe(true);
    expect(b.rows.find((r) => r.id === T.ear)!.ear).toBe(true);
    expect(has(b, T.payroll, 'business')).toBe(true);
    expect(has(b, T.payroll, 'secrets')).toBe(true); // she knows the Family's business
    expect(has(b, T.pregnant, 'trouble')).toBe(true);
    expect(b.rows.find((r) => r.id === T.pregnant)!.badges.some((x) => x.k === 'preg' && /due in 20 wks/.test(x.text))).toBe(true);
    expect(has(b, T.wife, 'dating')).toBe(true);
    expect(has(b, T.wife, 'trouble')).toBe(true);
    expect(b.rows.find((r) => r.id === T.wife)!.lines.trouble).toMatch(/Jealous/);
    expect(b.rows.find((r) => r.id === T.wife)!.badges.some((x) => x.k === 'wife')).toBe(true);
    expect(has(b, T.comer, 'want')).toBe(true);
    expect(b.rows.find((r) => r.id === T.comer)!.actions[0]).toEqual({ kind: 'dating', op: { op: 'come', id: T.comer, a: 'out' } });
    expect(has(b, T.fling, 'onenight')).toBe(true);
    expect(has(b, T.fling, 'dating')).toBe(false);
  });

  it('counts each section, and every row is a woman, an adult, not his blood', () => {
    for (const x of BOOK_SECTIONS) expect(b.counts[x.id]).toBe(b.rows.filter((r) => r.sections.includes(x.id)).length);
    expect(b.rows.some((r) => r.id === T.minor)).toBe(false);
    for (const r of b.rows) {
      const c = T.s.characters[r.id];
      expect(c.gender).toBe('F');
      expect(isAdult(T.s, c)).toBe(true);
      expect(r.age).toBeGreaterThanOrEqual(18);
      expect(r.sections.length).toBeGreaterThan(0);
      expect(r.opinion).toBeGreaterThanOrEqual(-100);
      expect(r.attraction).toBeGreaterThanOrEqual(0);
      expect(r.trust).toBeLessThanOrEqual(100);
    }
  });

  it('every quick action is a real order with a preview', () => {
    let n = 0;
    for (const r of b.rows) {
      for (const a of r.actions) {
        const p = previewAction(T.s, a);
        expect(p.title, JSON.stringify(a)).toBeTruthy();
        n++;
      }
    }
    expect(n).toBeGreaterThan(3);
    expect(b.rows.find((r) => r.id === T.ear)!.actions.some((a) => a.kind === 'ears' && a.op.op === 'meet')).toBe(true);
    expect(b.rows.find((r) => r.id === T.paid)!.actions.some((a) => a.kind === 'dating' && a.op.op === 'paid')).toBe(true);
  });

  it('search, section and sort', () => {
    const name = b.rows.find((r) => r.id === T.dating)!.name;
    expect(bookRows(b, { q: name.split(' ')[0] }).some((r) => r.id === T.dating)).toBe(true);
    expect(bookRows(b, { section: 'releases' }).every((r) => r.sections.includes('releases'))).toBe(true);
    const into = bookRows(b, { sort: 'into' });
    for (let i = 1; i < into.length; i++) expect(into[i].into).toBeLessThanOrEqual(into[i - 1].into);
    const useful = bookRows(b, { sort: 'useful' });
    expect(useful[0].useful).toBeGreaterThan(0);
  });

  it('mature content Off: no One night, no Releases, no adult badges or orders, and a paid-only woman is gone', () => {
    const off = setDatingSettings(T.s, { mature: 'off' });
    const o = littleBlackBook(off);
    expect(o.adult).toBe(false);
    expect(o.sections).not.toContain('onenight');
    expect(o.sections).not.toContain('releases');
    expect(o.counts.onenight).toBe(0);
    expect(o.counts.releases).toBe(0);
    for (const r of o.rows) {
      expect(r.badges.some((x) => x.k === 'pro')).toBe(false);
      expect(r.actions.some((a) => a.kind === 'dating' && (a.op.op === 'paid' || a.op.op === 'pro'))).toBe(false);
    }
    expect(o.rows.some((r) => r.id === T.fling)).toBe(false);
    const paidRow = o.rows.find((r) => r.id === T.paid);
    if (paidRow) expect(paidRow.sections.every((k) => k !== 'releases' && k !== 'onenight')).toBe(true);
    // Still the rest of the book.
    expect(o.counts.dating).toBeGreaterThan(0);
    expect(o.counts.business).toBeGreaterThan(0);
  });

  it('saves nothing: a fresh game has no black-book state, and reading the book changes nothing', () => {
    const s = newGame('bb-fresh');
    expect(JSON.stringify(Object.keys(s))).not.toMatch(/black/i);
    const before = JSON.stringify(T.s.dating);
    littleBlackBook(T.s);
    expect(JSON.stringify(T.s.dating)).toBe(before);
  });

  it('renders: the rail with counts, rows with meters, the best step', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { BlackBookPanel } = await import('../src/ui/dating/BlackBook');
    const html = renderToStaticMarkup(createElement(BlackBookPanel, { s: T.s }));
    expect(html).toContain('data-testid="little-black-book"');
    expect(html).toContain('The little black book');
    expect(html).toContain('data-testid="lbb-sec-releases"');
    expect(html).toContain('data-testid="lbb-row"');
    expect(html).toContain('data-testid="lbb-trust"');
    expect(html).toContain('data-testid="lbb-best"');
    const off = renderToStaticMarkup(createElement(BlackBookPanel, { s: setDatingSettings(T.s, { mature: 'off' }) }));
    expect(off).not.toContain('lbb-sec-releases');
    expect(off).not.toContain('lbb-sec-onenight');
    const { DatingPanel } = await import('../src/ui/dating/DatingPanel');
    const dp = renderToStaticMarkup(createElement(DatingPanel, { s: T.s, initialTab: 'book' }));
    expect(dp).toContain('data-testid="dating-tab-book"');
    expect(dp).toContain('data-testid="little-black-book"');
  });
});

describe('finding the black book', () => {
  it('Find answers "black book" and "women" with the little black book', async () => {
    const { findAll } = await import('../src/ui/shell/find');
    const s = newGame('bb-find');
    for (const q of ['black book', 'little black book', 'women']) {
      const r = findAll(s, q, { limit: 20 });
      expect(r.some((x) => x.id === 'screen:you.blackbook'), q).toBe(true);
    }
  });
});
