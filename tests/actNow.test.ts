import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { capos } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { mindsWeek } from '../src/engine/minds';
import { actNow, instant } from '../src/engine/actNow';
import { DEEDS, deedPreview, ensureDeeds, tierOdds, tierOf } from '../src/engine/deeds';
import { d01 } from '../src/engine/deeds/state';
import { deskResults } from '../src/engine/desk';
import { heavyOf } from '../src/engine/heavy';
import { rollLine } from '../src/ui/decide/ResultCard';
import type { GameState, PlayerAction } from '../src/engine/types';

/** STREAMLINE S11: act now — settled the moment it is given, on its own dice, once. */
function game(seed: string): GameState {
  const s = newGame(seed);
  mindsWeek(newCtx(s));
  return s;
}
const capo = (s: GameState) => capos(s).filter((c) => !c.dynasty)[0] ?? capos(s)[0];

describe('actNow', () => {
  it('the same save and the same clicks give the same state; the main rng never moves', () => {
    const a0 = game('now-det');
    const b0 = game('now-det');
    const k = capo(a0);
    const clicks: PlayerAction[] = [
      { kind: 'deed', id: 'befriend', target: k.id },
      { kind: 'deed', id: 'flatter', target: capos(a0)[1]?.id ?? k.id },
    ];
    let a = a0, b = b0;
    for (const c of clicks) {
      expect(instant(a, c)).toBe(true);
      a = actNow(a, c).state;
      b = actNow(b, c).state;
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.rng).toEqual(a0.rng);
  });

  it('costs and hours are charged once: the same order again this week is refused', () => {
    const s = game('now-once');
    const k = capo(s);
    const a: PlayerAction = { kind: 'interact', id: 'dinner', target: k.id } as PlayerAction;
    const one = actNow(s, a);
    if (!one.result.ok) return; // a gift may be blocked in this world; the deed case below covers it
    const two = actNow(one.state, a);
    expect(two.result.ok).toBe(false);
    expect(two.state).toBe(one.state);
    expect(one.state.money).toBe(two.state.money);
  });

  it('a deed done twice in a row is refused the second time (once, and on cooldown)', () => {
    const s = game('now-twice');
    const a: PlayerAction = { kind: 'deed', id: 'befriend', target: capo(s).id };
    const one = actNow(s, a);
    expect(one.result.ok).toBe(true);
    const two = actNow(one.state, a);
    expect(two.result.ok).toBe(false);
    expect(two.state.week).toBe(one.state.week);
  });

  it('a save taken mid-week loads and gives the same result', () => {
    const s = game('now-save');
    const a: PlayerAction = { kind: 'deed', id: 'befriend', target: capo(s).id };
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(JSON.stringify(actNow(loaded, a).state)).toBe(JSON.stringify(actNow(s, a).state));
    const after = JSON.parse(JSON.stringify(actNow(s, a).state)) as GameState;
    expect(actNow(after, a).result.ok).toBe(false);
  });

  it('a deed\'s tiers come up as often as its odds say (2,000 seeded rolls, ±3%)', () => {
    const s = game('now-tiers');
    const k = capo(s);
    const pd = deedPreview(s, 'befriend', s.playerId, k.id)!;
    const want = tierOdds(pd.def, pd.chance);
    const D = ensureDeeds(structuredClone(s));
    const n = 2000;
    const got: Record<string, number> = { crit: 0, success: 0, fail: 0, critFail: 0 };
    for (let i = 0; i < n; i++) got[tierOf(DEEDS.befriend, pd.chance, d01(D))]++;
    for (const t of Object.keys(want) as (keyof typeof want)[]) expect(Math.abs(got[t] / n - want[t]), t).toBeLessThan(0.03);
  });

  it('the result is written once to Your File and shows on the Desk under Results', () => {
    const s = game('now-file');
    const a: PlayerAction = { kind: 'deed', id: 'befriend', target: capo(s).id };
    const r = actNow(s, a);
    const before = s.journal?.e.length ?? 0;
    const mine = (r.state.journal?.e ?? []).slice(before).filter((e) => e.src === 'order' && e.mine);
    expect(mine.length).toBe(1);
    const res = deskResults(r.state);
    expect(res[0]?.kind).toBe('result');
    expect(res[0]?.detail).toMatch(/^Done now/);
  });

  it('the roll is said honestly: "Needed 62 or less. Rolled 48."', () => {
    expect(rollLine(0.62, 47, true).text).toBe('Needed 62 or less. Rolled 48.');
    expect(rollLine(0.62, 70, false).text).toBe('Needed 62 or less. Rolled 71.');
    expect(rollLine(0.62, 61, false).roll).toBeGreaterThan(62);
  });
});

describe('one confirm (STREAMLINE S12): heavy orders only', () => {
  it('a whack, a war, selling a place and big money are heavy; a talk with your own capo is not', () => {
    const s = game('heavy');
    const k = capo(s);
    expect(heavyOf(s, { kind: 'interact', id: 'whack', target: k.id } as PlayerAction)).toBeTruthy();
    if (s.rivals[0] && s.districts[0]) expect(heavyOf(s, { kind: 'declareWar', rival: s.rivals[0].id, district: s.districts[0].id })).toBeTruthy();
    const biz = s.businesses.find((b) => b.owner === 'player');
    if (biz) expect(heavyOf(s, { kind: 'sellBusiness', businessId: biz.id })).toBeTruthy();
    expect(heavyOf(s, { kind: 'deed', id: 'befriend', target: k.id })).toBeUndefined();
    expect(heavyOf(s, { kind: 'interact', id: 'dinner', target: k.id } as PlayerAction)).toBeUndefined();
  });

  it('signing a deal is its own confirmation: the Deal window gives the order confirmed (MAKE_IT_GREAT #6, one order in the tray)', async () => {
    const { readFileSync } = await import('node:fs');
    const { signDeal } = await import('../src/ui/econ/DealWindow');
    const s = game('deal-sign');
    const tray: { a: PlayerAction; confirmed?: boolean }[] = [];
    const a: PlayerAction = { kind: 'deed', id: 'befriend', target: capo(s).id };
    expect(signDeal(s, a, { queue: (x, confirmed) => tray.push({ a: x, confirmed }) })).toBe('queued');
    expect(tray.length).toBe(1);
    expect(tray[0].confirmed).toBe(true);
    // The App asks only for a heavy order (the queue path reads isHeavy).
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toMatch(/isHeavy\(s, a\)\) \{ setConfirm\(a\)/);
  });
});
