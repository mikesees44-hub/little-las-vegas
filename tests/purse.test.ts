import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { CAR_PRICE, earningsBoard, HOUSE_DOWN, linesOf, purseOf, upToCollected } from '../src/engine/crewPurse';
import { shortOdds } from '../src/engine/tribute';
import { crew } from '../src/engine/characters';
import type { GameState } from '../src/engine/types';
import { donChoices, requiredFamily } from './tributeFamily';

function play(seed: string, weeks: number, before?: (s: GameState) => void): { s: GameState; start: GameState } {
  let s = requiredFamily(seed);
  before?.(s);
  const start = JSON.parse(JSON.stringify(s)) as GameState;
  for (let w = 0; w < weeks; w++) s = advanceWeek(s, donChoices(s, w)).state;
  return { s, start };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe("the men's own money", () => {
  it('every capo, soldier and associate keeps his end and it builds in his own pocket', () => {
    const { s, start } = play('purse-a', 20);
    const t = s.tribute!;
    for (const rank of ['capo', 'soldier', 'associate'] as const) {
      const men = crew(s).filter((c) => c.rank === rank && start.characters[c.id]);
      expect(men.length).toBeGreaterThan(0);
      // What he put by: a car or a house bought out of savings in these weeks is still his (as below).
      const bought = (id: string) => { const l = t.life?.[id]; return ((l?.car ?? -1) >= start.week ? CAR_PRICE : 0) + ((l?.house ?? -1) >= start.week ? HOUSE_DOWN : 0); };
      expect(median(men.map((c) => c.wealth + bought(c.id) - start.characters[c.id].wealth))).toBeGreaterThan(0);
      // Each of them kept something in the open over the last weeks.
      expect(men.filter((c) => purseOf(s, c.id).reduce((a, r) => a + r.kept, 0) > 0).length).toBeGreaterThanOrEqual(Math.ceil(men.length / 2));
    }
    // Lifetime: his weekly living (everything but a car or a house, bought out of savings) is less than he kept.
    const lives = Object.values(t.life ?? {});
    const living = lives.reduce((a, l) => a + l.spent - (l.car ? CAR_PRICE : 0) - (l.house ? HOUSE_DOWN : 0), 0);
    expect(living).toBeLessThan(lives.reduce((a, l) => a + l.kept, 0));
  }, 120000);

  it("a man's week on the board is the ledger's: kept = his open inflows; spending = his expense transfers", () => {
    const { s } = play('purse-b', 14);
    const t = s.tribute!;
    const b = t.books[t.books.length - 1];
    let checked = 0;
    for (const [id, rows] of Object.entries(t.purse ?? {})) {
      const r = rows[rows.length - 1];
      const inflow = b.x.filter((x) => x[1] === `wealth:${id}` && (x[3] === 'member_keep' || x[3] === 'capo_distribution' || x[3] === 'underboss_distribution')).reduce((a, x) => a + x[2], 0);
      const paidDown = b.x.filter((x) => x[0] === `wealth:${id}` && x[3] === 'capo_distribution').reduce((a, x) => a + x[2], 0);
      expect(r.kept).toBe(Math.max(0, inflow - paidDown));
      const spent = b.x.filter((x) => x[0] === `wealth:${id}` && x[1].startsWith('ext:life:')).reduce((a, x) => a + x[2], 0);
      expect(r.spent).toBe(spent);
      expect(r.wealth).toBe(Math.round(s.characters[id].wealth));
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  }, 120000);

  it("the Family's Earnings board totals reconcile with the envelope, every week", () => {
    let s = requiredFamily('purse-c');
    for (let w = 0; w < 16; w++) {
      s = advanceWeek(s, donChoices(s, w)).state;
      const t = s.tribute!;
      const rep = t.reports[t.reports.length - 1];
      const board = earningsBoard(s);
      expect(board.week).toBe(rep.week);
      const up = board.rows.reduce((a, r) => a + r.up, 0);
      const u = upToCollected(rep);
      // Everything the men kicked up is on the board, man by man.
      expect(up).toBe(u.up);
      expect(u.ok).toBe(true);
      // Per crew: the board's men add up to the crew's line (paid + arrears made good).
      for (const cl of rep.crews) {
        const ids = new Set(cl.members.map((m) => m.id));
        const fromBoard = board.rows.filter((r) => ids.has(r.id)).reduce((a, r) => a + linesOf({ ...rep, crews: [cl], direct: [] }, r.id).up, 0);
        expect(fromBoard).toBe(cl.members.reduce((a, m) => a + m.paid + (m.back ?? 0), 0));
      }
      // Everything that reached the underboss is in his share, what he took, the envelope or the count not yet done.
      const late = rep.issues.find((i) => i.kind === 'late')?.amount ?? 0;
      expect(rep.ubShare + rep.ubSkim + rep.presented + late).toBe(rep.collected);
    }
  }, 120000);

  it('a man who cannot cover his house borrows, and a man in debt is tempted', () => {
    let target = '';
    const { s } = play('purse-d', 3, (s0) => {
      const m = crew(s0).find((c) => c.rank === 'associate')!;
      target = m.id;
      m.wealth = 0;
      m.policy = 'squeeze';
      m.household = { wife: 'Rose', kids: [{ name: 'Joey', male: true, born: 1955 }, { name: 'Ann', male: false, born: 1957 }] };
    });
    const life = s.tribute!.life![target];
    expect(life).toBeTruthy();
    const before = shortOdds(s, s.characters[target]).p;
    life.debt = Math.max(life.debt, 600);
    expect(shortOdds(s, s.characters[target]).p).toBeGreaterThan(before - 1e-9);
    const clean = JSON.parse(JSON.stringify(s)) as GameState;
    clean.tribute!.life![target].debt = 0;
    clean.characters[target].wealth = 5000;
    expect(shortOdds(s, s.characters[target]).p).toBeGreaterThan(shortOdds(clean, clean.characters[target]).p);
  }, 120000);
});
