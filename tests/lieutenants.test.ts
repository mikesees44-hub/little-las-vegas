/**
 * The lieutenants at work (engine/lieutenants.ts): the underboss and the consigliere run their domains
 * day to day, within the boss's levels and budget; he can approve, change or veto before their day;
 * their traits shape their picks; their misdeeds come out later; a good one softens neglect.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { holder } from '../src/engine/council';
import { addOpinion, opinion } from '../src/engine/relations';
import { inbox } from '../src/engine/inbox';
import { upgradeSave } from '../src/engine/upgradeSave';
import { neglectWeek } from '../src/engine/neglect';
import {
  actLocked, budgetOf, choose, DOMAIN_IDS, DOMAINS, docketOf, ensureLt, lieutenantsWeek, ltCover, ltDecide, ltProfile, ltView,
  morningReport, pendingAsks, planDocket, setBudget, setLevel, type LtAct, type LtCand, type LtDomain,
} from '../src/engine/lieutenants';
import { MorningReports, WhoHandlesWhat } from '../src/ui/lieutenants/Lieutenants';
import { plansInMotion } from '../src/ui/plans/plans';
import type { Character, GameState, PlayerAction } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));
const withDay = (s: GameState, day: number): GameState => ({ ...s, days: { week: s.week, day, answers: {}, skipped: [] } });

/** A few played weeks (default answers, no orders), memoized per seed. */
const memo = new Map<string, GameState[]>();
function weeks(seed: string, n = 6): GameState[] {
  const k = `${seed}:${n}`;
  if (!memo.has(k)) {
    const out: GameState[] = [];
    let s = newGame(seed);
    for (let i = 0; i < n && !s.gameOver; i++) { out.push(s); s = advanceWeek(s, {}).state; }
    out.push(s);
    memo.set(k, out);
  }
  return memo.get(k)!;
}

/** Make a man sharp (or dull) and set his traits. */
function shape(s: GameState, c: Character, skill: number, traits: Character['traits']): void {
  for (const k of Object.keys(c.attributes) as (keyof Character['attributes'])[]) c.attributes[k] = skill;
  c.traits = traits;
  const v = (c.attrs as { v?: Record<string, number> } | undefined)?.v;
  if (v) for (const k of Object.keys(v)) v[k] = skill;
  // Not ambitious, not greedy unless the traits say so (his career goal is re-read).
  if (v) Object.assign(v, { ambition: 20, greed: 20 });
  c.goal = undefined;
  if (s.tribute?.ubGoals) delete s.tribute.ubGoals[c.id];
}

function firstAsk(states: GameState[]): { s: GameState; a: LtAct } {
  for (const s of states) {
    const a = docketOf(s).find((x) => x.mode === 'ask' && !x.needsOk && (x.options[0]?.cost ?? 0) <= budgetOf(s, x.seat));
    if (a) return { s, a };
  }
  throw new Error('no ask-first job in these weeks');
}

describe('the docket: real jobs, by domain and level', () => {
  it('both men plan jobs from the state, each in his own domains, with real orders', () => {
    const doms = new Set<string>();
    for (const seed of ['lt-a', 'lt-b', 'lt-c']) for (const s of weeks(seed)) for (const a of docketOf(s)) {
      expect(DOMAINS[a.domain].seat).toBe(a.seat);
      expect(holder(s, a.seat)?.id).toBe(a.byId);
      expect(a.options.length).toBeGreaterThan(0);
      expect(a.options.some((o) => o.id === a.pick)).toBe(true);
      expect(a.day).toBeGreaterThanOrEqual(0);
      expect(a.day).toBeLessThanOrEqual(6);
      // A man never sets the other seat's job.
      for (const o of a.options) if (o.action.kind === 'councilTask') expect(o.action.seat).toBe(a.seat);
      doms.add(a.domain);
    }
    expect([...doms].filter((d) => DOMAINS[d as LtDomain].seat === 'underboss').length).toBeGreaterThanOrEqual(2);
    expect([...doms].filter((d) => DOMAINS[d as LtDomain].seat === 'consigliere').length).toBeGreaterThanOrEqual(1);
  });

  it('"I\'ll do it" keeps him out; "Handle it" acts; "Ask me first" proposes', () => {
    const s0 = weeks('lt-a')[1];
    const acts = planDocket(s0);
    expect(acts.length).toBeGreaterThan(0);
    const d = acts[0].domain;
    const self = setLevel(s0, d, 'self');
    expect(planDocket(self).some((a) => a.domain === d)).toBe(false);
    const handle = setLevel(s0, d, 'handle');
    for (const a of planDocket(handle).filter((x) => x.domain === d)) expect(a.mode).toBe(a.needsOk ? 'ask' : 'handle');
    const ask = setLevel(s0, d, 'ask');
    for (const a of planDocket(ask).filter((x) => x.domain === d)) expect(a.mode).toBe('ask');
    // Everything off: no jobs at all.
    let none = s0;
    for (const x of DOMAIN_IDS) none = setLevel(none, x, 'self');
    expect(planDocket(none)).toEqual([]);
  });

  it('defaults: most routine domains are "Ask me first"', () => {
    const asks = DOMAIN_IDS.filter((d) => DOMAINS[d].def === 'ask').length;
    expect(asks).toBeGreaterThan(DOMAIN_IDS.length / 2);
  });

  it('an empty seat plans nothing and says so', () => {
    const s = clone(weeks('lt-a')[1]);
    s.council.consigliere.holderId = undefined;
    expect(docketOf(s).some((a) => a.seat === 'consigliere')).toBe(false);
    expect(morningReport(s, 'consigliere').empty).toMatch(/Nobody is consigliere/);
  });
});

describe('Ask me first: the deadline', () => {
  it('waits in the inbox until his day; after it, the boss\'s word no longer reaches him and he acts his way', () => {
    const { s, a } = firstAsk(weeks('lt-a'));
    const early = withDay(s, Math.min(a.day, 0));
    expect(pendingAsks(early).some((x) => x.id === a.id)).toBe(true);
    expect(inbox(early).some((i) => i.ref.lt === a.id && i.kind === 'lieutenant')).toBe(true);
    // Past his day: locked.
    const late = withDay(s, a.day + 1);
    expect(actLocked(late, a)).toBe(true);
    expect(pendingAsks(late).some((x) => x.id === a.id)).toBe(false);
    expect(ltDecide(late, a.id, 'veto')).toBe(late);
    // Nobody said anything: he does it when the week turns.
    const r = advanceWeek(s, {});
    const e = ltView(r.state).log.find((x) => x.actId === a.id && x.week === s.week)!;
    expect(e).toBeTruthy();
    expect(['done', 'failed', 'skipped']).toContain(e.result);
    expect(e.approved).toBeFalsy();
  });

  it('over his budget he will not act without the boss\'s OK', () => {
    const s0 = weeks('lt-b')[1];
    const s = setBudget(setBudget(s0, 'underboss', 0), 'consigliere', 0);
    const acts = planDocket(s);
    for (const a of acts) if (a.options.find((o) => o.id === a.pick)!.cost > 0) { expect(a.needsOk).toBe(true); expect(a.mode).toBe('ask'); }
    // Even on a docket planned before the budget was cut, he checks the budget when he acts.
    const r = advanceWeek(s, {});
    const spent = ltView(r.state).log.filter((e) => e.week === s.week).reduce((x, e) => x + e.cost, 0);
    expect(spent).toBe(0);
  });
});

describe('the boss overrides', () => {
  it('veto: he does not do it; change: he does it the boss\'s way; approve: it is the boss\'s call too', () => {
    const { s, a } = firstAsk(weeks('lt-a'));
    const vetoed = ltDecide(withDay(s, 0), a.id, 'veto');
    expect(pendingAsks(vetoed).some((x) => x.id === a.id)).toBe(false);
    const rv = advanceWeek(vetoed, {});
    expect(ltView(rv.state).log.find((x) => x.actId === a.id && x.week === s.week)?.result).toBe('vetoed');
    expect(ltView(rv.state).rec[a.byId].vetoed).toBe(1);
    const ap = advanceWeek(ltDecide(withDay(s, 0), a.id, 'approve'), {});
    const e = ltView(ap.state).log.find((x) => x.actId === a.id && x.week === s.week)!;
    if (e.result !== 'skipped') expect(e.approved).toBe(true);
    const other = a.options.find((o) => o.id !== a.pick);
    if (other) {
      const ch = ltDecide(withDay(s, 0), a.id, 'change', other.id);
      expect(ltView(ch).calls[a.id]).toEqual({ verdict: 'change', option: other.id });
      const rc = advanceWeek(ch, {});
      const ec = ltView(rc.state).log.find((x) => x.actId === a.id && x.week === s.week)!;
      if (ec.result === 'done') expect(ec.text).toContain(other.label.charAt(0).toLowerCase() + other.label.slice(1));
    }
  });

  it('vetoing everything he plans hurts what he thinks of you', () => {
    const s0 = weeks('lt-a')[1];
    const ub = holder(s0, 'underboss')!;
    let s = withDay(s0, 0);
    const mine = docketOf(s).filter((a) => a.seat === 'underboss');
    expect(mine.length).toBeGreaterThanOrEqual(2);
    for (const a of mine) s = ltDecide(s, a.id, 'veto');
    const before = opinion(s, ub.id, s.playerId);
    const r = advanceWeek(s, {});
    const mod = r.state.relations[`${ub.id}>${s.playerId}`]?.modifiers.find((m) => /second-guesses/.test(m.reason));
    expect(mod).toBeTruthy();
    expect(mod!.value).toBeLessThan(0);
    void before;
  });

  it('a job the boss already ordered himself is not done twice', () => {
    const s0 = weeks('lt-a')[1];
    const a = docketOf(s0).find((x) => !x.needsOk && !x.waits)!;
    const o = a.options.find((x) => x.id === a.pick)!;
    const r = advanceWeek(s0, { actions: [o.action] });
    expect(ltView(r.state).log.find((x) => x.actId === a.id && x.week === s0.week)?.text).toMatch(/stood down|budget|short/);
  });
});

describe('their traits and agendas change their picks', () => {
  const base = weeks('lt-a')[1];
  const capo = Object.values(base.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'capo')!;
  const lean: PlayerAction = { kind: 'interact', id: 'threaten', target: capo.id };
  const dinner: PlayerAction = { kind: 'interact', id: 'dinner', target: capo.id };
  const cand: LtCand = {
    id: `short:${capo.id}`, seat: 'underboss', domain: 'collections', topic: 'His envelope', says: ['He came up short.'], priority: 600, self: {},
    opts: [{ id: 'lean', label: 'Lean on him', action: lean, cost: 0, why: 'so the others see it', value: 1000 }, { id: 'dinner', label: 'Have him to dinner', action: dinner, cost: 0, why: 'find out what is wrong', value: 1100 }],
  };
  const pickWith = (traits: Character['traits'], skill = 95, loyal = 60) => {
    const s = clone(base);
    const ub = holder(s, 'underboss')!;
    shape(s, ub, skill, traits);
    addOpinion(s, ub.id, s.playerId, 'test', loyal - opinion(s, ub.id, s.playerId), 0);
    return choose(s, ltProfile(s, 'underboss')!, cand);
  };
  it('a sharp, loyal, even-tempered man picks the best way', () => {
    const r = pickWith(['Loyal-to-a-fault']);
    expect(r.pick.id).toBe('dinner');
    expect(r.motive).toBeUndefined();
  });
  it('a hothead leans on him; a greedy man likes the job where the money passes through his hands', () => {
    expect(pickWith(['Hot-headed']).pick.id).toBe('lean');
    expect(pickWith(['Hot-headed']).motive).toBe('temper');
    const g = pickWith(['Greedy']);
    expect(g.pick.id).toBe('lean');
    expect(g.motive).toBe('skim');
  });
  it('a careful consigliere avoids the violent way', () => {
    const s = clone(base);
    const cons = holder(s, 'consigliere')!;
    shape(s, cons, 95, ['Patient']);
    const p = ltProfile(s, 'consigliere')!;
    expect(p.cautious).toBe(true);
    const c2: LtCand = { ...cand, seat: 'consigliere', domain: 'mediation', opts: [{ ...cand.opts[0], value: 1300 }, cand.opts[1]] };
    expect(choose(s, p, c2).pick.id).toBe('dinner');
    expect(choose(s, p, c2).motive).toBe('caution');
  });
  it('a dull man guesses (sometimes wrong), a sharp one does not', () => {
    let wrong = 0;
    for (let w = 0; w < 30; w++) {
      const s = clone(base);
      s.week = 100 + w;
      const ub = holder(s, 'underboss')!;
      shape(s, ub, 10, []);
      const c3: LtCand = { ...cand, opts: [{ ...cand.opts[0], label: 'Gift', action: { kind: 'interact', id: 'gift_small', target: capo.id }, value: 1000 }, cand.opts[1]] };
      if (choose(s, ltProfile(s, 'underboss')!, c3).pick.id !== 'dinner') wrong++;
    }
    expect(wrong).toBeGreaterThan(0);
    expect(wrong).toBeLessThan(30);
  });
});

describe('a big step and a favor', () => {
  it('asked about a big step and never answered, he waits; on "Handle it" he goes ahead', () => {
    let found: { s: GameState; a: LtAct } | undefined;
    for (const seed of ['lt-a', 'lt-b', 'lt-c']) for (const s of weeks(seed)) {
      const a = docketOf(s).find((x) => x.waits && !x.needsOk);
      if (a && !found) found = { s, a };
    }
    expect(found).toBeTruthy();
    const { s, a } = found!;
    const quiet = advanceWeek(setLevel(s, a.domain, 'ask'), {});
    expect(ltView(quiet.state).log.find((e) => e.actId === a.id && e.week === s.week)?.text).toMatch(/held off/);
    const handled = advanceWeek(setLevel(s, a.domain, 'handle'), {});
    expect(ltView(handled.state).log.find((e) => e.actId === a.id && e.week === s.week)?.text).not.toMatch(/held off/);
  });

  it('a dinner he gives on his own is his: the man owes him, and an ambitious underboss keeps the credit', () => {
    const s = clone(weeks('lt-a')[1]);
    const ub = holder(s, 'underboss')!;
    shape(s, ub, 80, ['Ambitious']);
    const capo = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'capo' && c.id !== ub.id)!;
    const act: LtAct = { id: `underboss:unhappy:${capo.id}`, seat: 'underboss', byId: ub.id, domain: 'crews', topic: 'Sore', line: 'He is sore.', options: [{ id: 'dinner', label: 'Invite to dinner', action: { kind: 'interact', id: 'dinner', target: capo.id }, cost: 0, why: 'cheap', value: 500 }], pick: 'dinner', best: 'dinner', why: 'cheap', day: 0, mode: 'handle', hours: 3, priority: 600 };
    ensureLt(s).docket = { week: s.week, acts: [act] };
    const toUb = opinion(s, capo.id, ub.id);
    const toBoss = opinion(s, capo.id, s.playerId);
    const r = advanceWeek(s, {});
    expect(ltView(r.state).log.find((e) => e.actId === act.id)?.result).toBe('done');
    expect(opinion(r.state, capo.id, ub.id) - toUb).toBeGreaterThan(opinion(r.state, capo.id, r.state.playerId) - toBoss);
    if (r.state.tribute?.ub.id === ub.id) expect(r.state.tribute.ub.helped?.[capo.id]?.unknownToDon).toBeGreaterThan(0);
  });
});

describe('budget, dice and saves', () => {
  it('they never spend more of the Family\'s money than the budget on their own', () => {
    for (const seed of ['lt-a', 'lt-b', 'lt-c']) {
      const last = weeks(seed)[weeks(seed).length - 1];
      for (const seat of ['underboss', 'consigliere'] as const) {
        const byWeek = new Map<number, number>();
        for (const e of ltView(last).log.filter((x) => x.seat === seat && !x.approved)) byWeek.set(e.week, (byWeek.get(e.week) ?? 0) + e.cost);
        for (const v of byWeek.values()) expect(v).toBeLessThanOrEqual(budgetOf(last, seat));
      }
    }
  });

  it('deterministic, on their own dice: the main stream is never moved', () => {
    const s = weeks('lt-b')[2];
    expect(planDocket(clone(s))).toEqual(planDocket(clone(s)));
    const a = advanceWeek(s, {});
    const b = advanceWeek(clone(s), {});
    expect(b.state.money).toBe(a.state.money);
    expect(ltView(b.state)).toEqual(ltView(a.state));
    const w = clone(s);
    const rng = w.rng;
    lieutenantsWeek(newCtx(w), docketOf(s), {}, []);
    expect(w.rng).toBe(rng);
  });

  it('a save round-trips: levels, budget, calls, the docket and the record; the week replays the same', () => {
    let s = weeks('lt-c')[2];
    s = setLevel(setBudget(s, 'consigliere', 3000), 'press', 'handle');
    const a = docketOf(s)[0];
    if (a) s = ltDecide(withDay(s, 0), a.id, 'approve');
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(ltView(loaded)).toEqual(ltView(s));
    expect(docketOf(loaded)).toEqual(docketOf(s));
    const x = advanceWeek(s, {});
    const y = advanceWeek(loaded, {});
    expect(y.state.money).toBe(x.state.money);
    expect(y.report.lieutenants).toEqual(x.report.lieutenants);
  });

  it('upgradeSave leaves a current save exactly as it is', () => {
    for (const s of [weeks('lt-a')[3], newGame('lt-fresh')]) {
      const before = JSON.stringify(s);
      expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
    }
  });
});

describe('consequences', () => {
  it('a greedy, dishonest underboss skims what passes through his hands, and it comes out weeks later', () => {
    let s = clone(weeks('lt-a')[1]);
    const ub = holder(s, 'underboss')!;
    shape(s, ub, 60, ['Greedy']);
    const v = (ub.attrs as { v?: Record<string, number> } | undefined)?.v;
    if (v) Object.assign(v, { conscience: 5, loyalty: 10, greed: 95 });
    // Give him a collections job that handles cash.
    const act: LtAct = { id: 'underboss:broke', seat: 'underboss', byId: ub.id, domain: 'collections', topic: 'The treasury', line: 'We need money.', options: [{ id: 'shake', label: 'Shake down the bars', action: { kind: 'order', key: 'shakedown', via: 'underboss' }, cost: 0, why: 'fast money', value: 1000 }], pick: 'shake', best: 'shake', why: 'fast money', day: 0, mode: 'handle', hours: 1, priority: 900 };
    const lt = ensureLt(s);
    lt.docket = { week: s.week, acts: [act] };
    let found = false;
    let hidden = false;
    for (let i = 0; i < 16 && !found; i++) {
      const r = advanceWeek(s, {});
      s = r.state;
      hidden ||= ltView(s).hidden.some((h) => h.kind === 'skim' && h.byId === ub.id);
      found = ltView(s).found.some((f) => f.kind === 'skim' && f.byId === ub.id);
    }
    expect(hidden || found).toBe(true);
    expect(found).toBe(true);
    expect(ltView(s).rec[ub.id].caught).toBeGreaterThan(0);
  });

  it('a good underboss softens an absent boss\'s cost in his domains; "I\'ll do it" and a disloyal one do not', () => {
    const s = clone(weeks('lt-b')[1]);
    const ub = holder(s, 'underboss')!;
    shape(s, ub, 90, ['Loyal-to-a-fault']);
    addOpinion(s, ub.id, s.playerId, 'test', 60, 0);
    const good = ltCover(s);
    expect(good.count).toBeGreaterThan(0.5);
    expect(good.men).toBeGreaterThan(0.5);
    const kept = setLevel(setLevel(s, 'collections', 'self'), 'crews', 'self');
    expect(ltCover(kept).count).toBe(0);
    expect(ltCover(kept).men).toBe(0);
    const bad = clone(s);
    shape(bad, holder(bad, 'underboss')!, 90, ['Greedy']);
    addOpinion(bad, ub.id, bad.playerId, 'test2', -120, 0);
    expect(ltCover(bad).count).toBe(0);
    // The count's skim, same idle week, with and without him minding it.
    const skimOf = (x: GameState) => {
      const y = clone(x);
      y.flags.idleWeeks = 9;
      const ctx = newCtx(y);
      ctx.gross = 10000;
      neglectWeek(ctx, false);
      return -ctx.lines.filter((l) => /Nobody is watching the count/.test(l.label)).reduce((a, l) => a + l.amount, 0);
    };
    expect(skimOf(s)).toBeLessThan(skimOf(kept));
    expect(skimOf(s)).toBeGreaterThan(0);
    // Delegating is not running the family: the idle count is not reset by them.
    const r = advanceWeek(s, {});
    expect(r.state.flags.idleWeeks ?? 0).toBeGreaterThan(0);
  });

  it('his unapproved work builds his own standing', () => {
    let s = weeks('lt-a')[0];
    const ub = holder(s, 'underboss')!;
    const base0 = s.tribute?.ub.base ?? 0;
    for (let i = 0; i < 5; i++) s = advanceWeek(s, {}).state;
    const done = ltView(s).log.filter((e) => e.byId === ub.id && e.result === 'done' && !e.approved).length;
    if (done && s.tribute?.ub.id === ub.id) expect(s.tribute.ub.base).toBeGreaterThan(base0 - 1);
    expect(morningReport(s, 'underboss').record).toBeTruthy();
  });
});

describe('the boss\'s view', () => {
  it('the morning report: yesterday, today, what he needs; plans rows; renders', () => {
    const { s, a } = firstAsk(weeks('lt-a'));
    const mid = withDay(s, Math.max(0, a.day - 1));
    const r = morningReport(mid, a.seat);
    expect(r.needs.some((x) => x.id === a.id)).toBe(true);
    const groups = plansInMotion(mid, { orders: [] });
    const row = groups.find((g) => g.id === 'inbox')?.rows.find((x) => x.key === `in:lt:${a.id}`);
    expect(row?.acts.map((x) => x.id)).toEqual(['approve', 'change', 'veto']);
    const html = renderToString(createElement(MorningReports, { s: mid, update: () => {}, onSettings: () => {} }));
    expect(html).toContain('data-testid="lt-reports"');
    expect(html).toContain('data-testid="lt-approve"');
    const set = renderToString(createElement(WhoHandlesWhat, { s: mid, update: () => {}, onClose: () => {} }));
    for (const d of DOMAIN_IDS) expect(set).toContain(`data-testid="lt-domain-${d}"`);
    // Handled jobs are listed with a way to stop them.
    const handled = setLevel(mid, a.domain, 'handle');
    const g2 = plansInMotion(ltDecide(handled, a.id, 'approve'), { orders: [] });
    expect(g2.find((g) => g.id === 'lieutenants')?.rows.some((x) => x.acts.some((y) => y.id === 'veto'))).toBe(true);
  });
});
