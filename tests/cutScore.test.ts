import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { capos } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { mindsWeek } from '../src/engine/minds';
import { opinion } from '../src/engine/relations';
import { applyEffects } from '../src/engine/effects';
import { predictChoice } from '../src/engine/reactions';
import { skimRate } from '../src/engine/economy';
import { buildScoreEvent } from '../src/engine/scores';
import { CUT_WAYS, cutPlan, cutSkim, cutThreshold, offerCut } from '../src/engine/cutScore';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { EventInstance, GameState } from '../src/engine/types';

function game(seed = 'cut-a'): GameState {
  const s = newGame(seed);
  mindsWeek(newCtx(s));
  s.money = 80000;
  s.week = 20;
  return s;
}

const pocket = (s: GameState) => s.tribute?.acct.personal ?? 0;

/** Queue the offer, turn the week so it is pending, then answer it. */
function cutWith(s0: GameState, way: string, total = 12000, by?: string): { before: GameState; after: GameState; ev: EventInstance } {
  const s = structuredClone(s0);
  const ev = offerCut(s, total, 'a test score', by)!;
  s.pendingEvents = [s.eventQueue.pop()!];
  const after = advanceWeek(s, { choices: { [ev.iid]: way } }).state;
  return { before: s, after, ev };
}

describe('cut up the score: the decision', () => {
  it('only a big score (scaled by inflation and family size) brings the decision; one at a time', () => {
    const s = game();
    const th = cutThreshold(s);
    expect(th).toBeGreaterThanOrEqual(3000);
    expect(offerCut(s, th - 100, 'small change')).toBeUndefined();
    const ev = offerCut(s, th + 5000, 'a fat score', capos(s)[0].id)!;
    expect(ev.defId).toBe('cut_score');
    expect(ev.choices.map((c) => c.id)).toEqual(CUT_WAYS);
    for (const c of ev.choices) expect(c.label).toMatch(/your cut \$[\d,]+/);
    // The boss's cut shrinks from the lion's share to making it rain.
    const cuts = CUT_WAYS.map((w) => cutPlan(s, w, 10000).boss);
    expect(cuts[0]).toBeGreaterThan(cuts[1]);
    expect(cuts[1]).toBeGreaterThan(cuts[2]);
    expect(cuts[3]).toBeLessThan(cuts[2]);
    // Who gets what is on the card.
    expect(ev.choices.find((c) => c.id === 'book')!.detail).toMatch(/envelopes \$[\d,]+ \(/);
    // A second one waits.
    expect(offerCut(s, th + 5000, 'another')).toBeUndefined();
    // A later year needs more.
    const t = game();
    t.date = { ...t.date, y: 1970 };
    expect(cutThreshold(t)).toBeGreaterThan(th);
  });

  it('the reactions are shown before choosing: the capo who brought it and the others compare', () => {
    const s = game();
    const [k, other] = capos(s);
    k.traits = k.traits.filter((x) => x !== 'Loyal-to-a-fault');
    const ev = offerCut(s, 15000, 'Sal\'s score', k.id)!;
    const lion = predictChoice(s, ev, ev.choices.find((c) => c.id === 'lion')!);
    expect(lion.find((r) => r.who === k.id)!.v).toBeLessThan(0);
    if (other) expect(lion.some((r) => r.who === other.id && r.v < 0)).toBe(true);
    const rain = predictChoice(s, ev, ev.choices.find((c) => c.id === 'rain')!);
    expect(rain.some((r) => r.v > 0)).toBe(true);
  });
});

describe('cut up the score: the money moves through the journal', () => {
  it('each way: the boss\'s cut lands in his Pocket, the men get envelopes, every dollar through the journal', () => {
    const s0 = game();
    const k = capos(s0)[0];
    for (const way of CUT_WAYS) {
      const s = structuredClone(s0);
      const ev = offerCut(s, 12000, 'a test score', k.id)!;
      const ch = ev.choices.find((c) => c.id === way)!;
      const p = cutPlan(s, way, 12000);
      const ctx = newCtx(s);
      const m0 = s.money;
      const p0 = pocket(s);
      applyEffects(ctx, ch.effects, { label: ch.label, because: ch.because, category: 'event' });
      expect(pocket(s) - p0, way).toBe(p.boss);
      const lines = s.tribute!.journal.filter((x) => x.k.startsWith('cutev'));
      expect(lines.find((x) => x.t === 'personal')?.a, way).toBe(p.boss);
      const env = lines.filter((x) => x.t.startsWith('wealth:')).reduce((a, x) => a + x.a, 0);
      expect(env, way).toBe(p.plan.crew + p.plan.widows);
      // Family money keeps the house's part (and pays the church, the street, the party).
      expect(m0 - s.money, way).toBe(12000 - p.house);
      expect(ctx.log.some((l) => l.startsWith('Cut up a test score')), way).toBe(true);
    }
  });

  it('answered at the week\'s turn, it lands in the chronicle and the books reconcile', () => {
    const { after } = cutWith(game(), 'spread', 12000, undefined);
    expect(after.chronicle.some((c) => c.text.includes('cut up a test score'))).toBe(true);
  });

  it('the lion\'s share has teeth: the capo resents it, the men grumble, the skim goes up for a while', () => {
    const s = game();
    const k = capos(s).find((c) => !c.traits.includes('Honest') && !c.traits.includes('Loyal-to-a-fault'))!;
    k.traits = k.traits.filter((x) => x !== 'Honest' && x !== 'Loyal-to-a-fault');
    const lion = cutWith(s, 'lion', 15000, k.id);
    const book = cutWith(s, 'book', 15000, k.id);
    expect(opinion(lion.after, k.id, s.playerId)).toBeLessThan(opinion(book.after, k.id, s.playerId));
    expect(cutSkim(lion.after)).toBeGreaterThan(0);
    expect(skimRate(lion.after, lion.after.characters[k.id])).toBeGreaterThanOrEqual(skimRate(book.after, book.after.characters[k.id]));
    expect(cutSkim(book.after)).toBe(0);
    // Making it rain: loyalty, and the cops notice the money.
    const rain = cutWith(s, 'rain', 15000, k.id);
    expect(opinion(rain.after, k.id, s.playerId)).toBeGreaterThan(opinion(lion.after, k.id, s.playerId));
  });

  it('a crew\'s big score kicked up brings the cut-up the next week', () => {
    const s = game();
    const k = capos(s)[0];
    const ev = buildScoreEvent(s, k, 20000, 'a trailer of Scotch');
    s.pendingEvents = [ev];
    const next = advanceWeek(s, { choices: { [ev.iid]: 'standard' } }).state;
    expect(next.pendingEvents.some((e) => e.defId === 'cut_score' && e.meta?.charId === k.id)).toBe(true);
  });

  it('an old save gets the state on load', () => {
    const s = game();
    s.cut = { log: [], n: 0 } as unknown as GameState['cut'];
    upgradeSave(s);
    expect(s.cut!.lion).toEqual([]);
  });
});
