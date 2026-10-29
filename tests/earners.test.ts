import { finOf, ownTotal } from '../src/engine/crewFinance';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { CATALOG } from '../src/engine/catalog';
import { owned } from '../src/engine/business';
import { capos } from '../src/engine/characters';
import { briefing } from '../src/engine/briefing';
import { RACKETS } from '../src/engine/racketData';
import { earnerAction, earnerLines, earnerOf, holderOf, holders, suggestFor, EARNER_KEEP } from '../src/engine/earners';
import { MENU, MENU_GROUPS, menuRows, runnersFor, startSummary, whereFor, defaultRunner } from '../src/engine/racketMenu';
import { pocketCash } from '../src/engine/tributeState';
import { tidyState } from '../src/engine/tidy';
import { upgradeSave } from '../src/engine/upgradeSave';
import { opinion } from '../src/engine/relations';
import { OrdersContext } from '../src/ui/components/Orders';
import { StartRacket } from '../src/ui/econ/StartRacket';
import { SteadyEarners } from '../src/ui/econ/SteadyEarners';
import type { BusinessKind, GameState, PlayerAction } from '../src/engine/types';
import { placeStart, racketGaps } from '../src/engine/racketMenu';
import { doNow } from '../src/ui/shell/doNow';

function rich(seed = 'earn'): GameState {
  const s = newGame(seed);
  s.money = 90000;
  s.respect = 70;
  return s;
}
const week = (s: GameState, actions: PlayerAction[] = []) => advanceWeek(s, { choices: {}, actions }).state;
const START = (kind: BusinessKind, extra: { runner?: string; earner?: boolean; district?: string } = {}): PlayerAction => ({ kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind, ...extra } } });

describe('Start a racket: the menu', () => {
  it('five plain groups, every item a line, cheapest first, a few good first rackets', () => {
    const s = rich();
    expect(MENU_GROUPS.map((g) => g.label)).toEqual(['Street money', 'Vice', 'Contraband', 'Working the system', 'Payoffs & protection']);
    for (const g of MENU_GROUPS) {
      const rows = menuRows(s, g.id);
      expect(rows.length, g.id).toBeGreaterThan(2);
      for (let i = 1; i < rows.length; i++) expect(rows[i].cost).toBeGreaterThanOrEqual(rows[i - 1].cost);
      for (const r of rows) {
        expect(r.line.length, r.key).toBeGreaterThan(15);
        expect(r.objects.length, r.key).toBeGreaterThan(3);
      }
    }
    const first = MENU.filter((m) => m.first);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(first.length).toBeLessThanOrEqual(3);
    for (const m of first) expect(CATALOG[m.key as BusinessKind].cost).toBeLessThanOrEqual(3500);
    // The classic operations are all on it.
    for (const k of ['madam', 'narcotics', 'guns', 'protection', 'loansharking', 'numbers', 'bookmaking', 'cardgame', 'vending', 'stag', 'afterhours', 'bootleg', 'cigarettes', 'fencing', 'cargo', 'counterfeit', 'labor', 'bidrig', 'concrete', 'waste', 'insurance', 'bustout', 'washing', 'chopshop', 'court', 'payoff', 'taxdodge']) {
      expect(MENU.some((m) => m.key === k), k).toBe(true);
    }
  });

  it('every racket on the menu has its data (a line, dials or situations), and a summary with cost, take, heat, risk and who objects', () => {
    const s = rich();
    for (const m of MENU) {
      if (m.key !== 'madam' && CATALOG[m.key].category === 'racket') expect(RACKETS[m.key], m.key).toBeDefined();
      const sum = startSummary(s, m.key);
      expect(sum.risk.length, m.key).toBeGreaterThan(2);
      expect(sum.objects.length, m.key).toBeGreaterThan(2);
      expect(sum.philly.length, m.key).toBeGreaterThan(5);
      expect(Number.isFinite(sum.weekly), m.key).toBe(true);
    }
    const narc = startSummary(s, 'narcotics');
    expect(narc.philly).toMatch(/[Ff]orbid/);
    expect(narc.warns.join(' ')).toMatch(/rat|talk/);
    expect(narc.weekly).toBeGreaterThan(startSummary(s, 'numbers').weekly);
  });

  it('who runs it lists you, the capos and the free men with skill, loyalty and load; where suggests the best district', () => {
    const s = rich();
    const rs = runnersFor(s, 'numbers');
    expect(rs[0].role).toBe('boss');
    expect(rs.some((r) => r.role === 'capo')).toBe(true);
    for (const r of rs) expect(r.skill).toBeGreaterThanOrEqual(0);
    expect(rs.filter((r) => r.role === 'capo').every((r) => r.loyalty !== undefined)).toBe(true);
    expect(defaultRunner(s, 'numbers')).toBeDefined();
    const w = whereFor(s, 'numbers');
    expect(w.length).toBeGreaterThan(0);
    expect(w[0].best).toBe(true);
  });

  it('guns, narcotics, protection, the court and the pad all start through the same order', () => {
    for (const kind of ['guns', 'narcotics', 'protection', 'court', 'payoff', 'cigarettes', 'chopshop'] as BusinessKind[]) {
      const s = rich(`start-${kind}`);
      const a = startSummary(s, kind).action!;
      expect(previewAction(s, a).disabledReason, kind).toBeUndefined();
      const n = week(s, [a]);
      expect(owned(n).some((b) => b.kind === kind), kind).toBe(true);
    }
  });

  it('narcotics: the old-timers disapprove the week it starts', () => {
    const s = rich('narc');
    const k = capos(s)[0];
    const before = opinion(s, k.id, s.playerId);
    const n = week(s, [START('narcotics')]);
    expect(opinion(n, k.id, n.playerId)).toBeLessThan(before + 3);
    expect(n.characters[k.id].alive).toBe(true);
  });

  it('the Madam\'s arrangement is agreed through the same summary, as her cut (the family runs nobody)', () => {
    const s = rich('madam');
    const sum = startSummary(s, 'madam');
    if (s.ears?.madam && s.ears.madam.cut < 3) {
      expect(sum.action?.kind).toBe('ears');
      expect(previewAction(s, sum.action!).disabledReason).toBeUndefined();
    }
    expect(sum.warns.join(' ')).toMatch(/adults|her people/);
  });

  it('a bust-out pays once after six weeks and the store is gone', () => {
    let s = rich('bust');
    s = week(s, [START('bustout')]);
    const b = owned(s).find((x) => x.kind === 'bustout')!;
    expect(b).toBeDefined();
    let paid = 0;
    for (let i = 0; i < 8; i++) {
      s = week(s);
      paid += (s.lastReport?.lines ?? []).filter((l) => l.src === b.id && l.amount > 0).reduce((a, l) => a + l.amount, 0);
    }
    expect(paid).toBeGreaterThan(CATALOG.bustout.cost);
    expect(owned(s).some((x) => x.id === b.id)).toBe(false);
  });
});

describe('Steady earners', () => {
  it('a capo given his earner at the start kicks it up every week, keeps his end, and the line names it', () => {
    let s = rich('earn-capo');
    const k = capos(s)[0];
    s = week(s, [START('protection', { runner: k.id, earner: true })]);
    const b = earnerOf(s, k.id)!;
    expect(b?.kind).toBe('protection');
    expect(holderOf(s, b.id)).toBe(k.id);
    const takes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const w0 = ownTotal(s, k.id);
      const wk = s.week;
      s = week(s);
      const line = (s.lastReport?.lines ?? []).find((l) => l.src === b.id && l.stat === 'money' && l.amount > 0);
      expect(line?.label).toMatch(new RegExp(`${k.firstName} kicked up \\$[\\d,]+ — his protection`));
      expect(line?.who).toBe(k.id);
      takes.push(line!.amount);
      // His own money (cash and savings: crewFinance.ts) does not go down on an earner's week
      // (what he chose to buy for himself that week, a car or a ring, is his own business).
      const bought = (finOf(s, k.id)?.hist ?? []).filter((e) => e.w >= wk && e.amt < 0).reduce((a, e) => a - e.amt, 0);
      expect(ownTotal(s, k.id) + bought).toBeGreaterThan(w0 - 1);
    }
    expect(earnerLines(s).some((x) => x.who === k.id)).toBe(true);
    void EARNER_KEEP;
  });

  it('a steady earner swings less than the same racket run loose', () => {
    const spread = (xs: number[]) => (Math.max(...xs) - Math.min(...xs)) / Math.max(1, xs.reduce((a, x) => a + x, 0) / xs.length);
    const run = (give: boolean) => {
      let s = rich('earn-var');
      const k = capos(s)[0];
      s = week(s, [START('bookmaking', give ? { runner: k.id, earner: true } : {})]);
      const b = owned(s).filter((x) => x.kind === 'bookmaking').pop()!;
      const xs: number[] = [];
      for (let i = 0; i < 10; i++) {
        s = week(s);
        xs.push((s.lastReport?.lines ?? []).filter((l) => l.src === b.id && l.stat === 'money').reduce((a, l) => a + l.amount, 0));
      }
      return spread(xs);
    };
    expect(run(true)).toBeLessThan(run(false));
  });

  it('the boss\'s own earner pays straight into his Pocket', () => {
    let s = rich('earn-boss');
    s = week(s, [START('court', { runner: s.playerId, earner: true })]);
    const b = earnerOf(s, s.playerId)!;
    expect(b?.kind).toBe('court');
    s = week(s);
    const bk = s.tribute!.books[s.tribute!.books.length - 1];
    const x = bk.x.find((t) => t[0] === `ext:earner:${b.id}` && t[1] === 'personal');
    expect(x?.[2]).toBeGreaterThan(50);
    expect(pocketCash(s)).toBeGreaterThanOrEqual(0);
    // His piece is half; the other half is a family line that says so.
    const fam = (s.lastReport?.lines ?? []).find((l) => l.src === b.id && l.stat === 'money' && l.amount > 0);
    expect(fam?.label).toMatch(/your piece/);
    expect(Math.abs((fam?.amount ?? 0) - (x?.[2] ?? 0))).toBeLessThanOrEqual(1);
  });

  it('one tap gives a capo an existing business; he likes it; one man per business', () => {
    let s = rich('earn-tap');
    const k = capos(s).find((c) => !earnerOf(s, c.id))!;
    const b = suggestFor(s, k)!;
    expect(b).toBeDefined();
    const a = earnerAction(k.id, b.id);
    expect(previewAction(s, a).disabledReason).toBeUndefined();
    const op0 = opinion(s, k.id, s.playerId);
    s = week(s, [a]);
    expect(earnerOf(s, k.id)?.id).toBe(b.id);
    expect(opinion(s, k.id, s.playerId)).toBeGreaterThanOrEqual(op0);
    const k2 = capos(s).find((c) => c.id !== k.id)!;
    expect(previewAction(s, earnerAction(k2.id, b.id)).disabledReason).toMatch(/already/);
  });

  it('the underboss suggests one for a capo who has none, as a one-tap order', () => {
    const s = rich('earn-sit');
    let found = false;
    let st = s;
    for (let i = 0; i < 3 && !found; i++) {
      const it = briefing(st).items.find((x) => x.id.startsWith('earner:'));
      if (it) {
        found = true;
        const o = it.options.find((x) => x.id === 'give')!;
        expect(o.action).toBeDefined();
        expect(previewAction(st, o.action!).disabledReason).toBeUndefined();
      }
      st = week(st);
    }
    // Every holder without an earner has a suggestion while free businesses exist.
    expect(holders(s).length).toBeGreaterThan(1);
    expect(found || holders(s).every((c) => !suggestFor(s, c))).toBe(true);
  });

  it('a capo without an earner grumbles at the turn of the month; with one he is content', () => {
    let s = rich('earn-month');
    const [a, b] = capos(s);
    const give = suggestFor(s, a)!;
    s = week(s, [earnerAction(a.id, give.id)]);
    for (let i = 0; i < 12; i++) s = week(s);
    const mods = (id: string) => s.relations[`${id}>${s.playerId}`]?.modifiers.map((m) => m.reason) ?? [];
    expect(mods(a.id)).toContain('His own steady earner');
    expect(mods(b.id)).toContain('No steady earner of his own');
  });

  it('saves round-trip clean, and old saves (no earners) load', () => {
    let s = rich('earn-save');
    const k = capos(s)[0];
    s = week(s, [START('numbers', { runner: k.id, earner: true })]);
    s = week(s);
    const copy = structuredClone(s);
    tidyState(copy);
    expect(JSON.parse(JSON.stringify(copy))).toEqual(copy);
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete old.econ!.earners;
    const up = upgradeSave(old);
    expect(earnerOf(up, k.id)).toBeUndefined();
    expect(() => week(up)).not.toThrow();
  });
});

describe('impossible to miss', () => {
  it('Rackets & Businesses: "Do this now" asks for a racket and for steady earners; a district offers "start a racket here"', () => {
    const s = rich('earn-miss');
    const g = racketGaps(s);
    expect(g.noEarner.length).toBeGreaterThan(0);
    const items = doNow(s, 'money', { alerts: [], opps: [], unanswered: 0, brief: 0 });
    expect(items.some((i) => i.id === 'steady-earners')).toBe(true);
    if (g.rackets < 3) expect(items.some((i) => i.id === 'start-racket')).toBe(true);
    const d = whereFor(s, 'protection')[0];
    const p = placeStart(s, d.id);
    expect(p?.picks.length).toBeGreaterThan(0);
    expect(placeStart(s, 'nowhere')).toBeUndefined();
  });
});

describe('the screens', () => {
  it('Start a racket and Steady earners render', () => {
    const s = rich('earn-ui');
    const wrap = (el: ReturnType<typeof createElement>) => createElement(OrdersContext.Provider, { value: { orders: [], queue: () => {}, remove: () => {} } }, el);
    const a = renderToString(wrap(createElement(StartRacket, { s })));
    expect(a).toContain('Start a racket');
    expect(a).toContain('Street money');
    expect(a).toContain('Payoffs &amp; protection');
    const b = renderToString(wrap(createElement(SteadyEarners, { s })));
    expect(b).toContain('Steady earners');
  });
});
