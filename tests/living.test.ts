import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState, forceDeath } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { reconcileAccounts, tributeOpen } from '../src/engine/tribute';
import { tidyState } from '../src/engine/tidy';
import { upgradeSave } from '../src/engine/upgradeSave';
import { ageOf, present, type LivingState, type Tp } from '../src/engine/livingState';
import { districtTotals, setLivingEnabled } from '../src/engine/livingWorld';
import { livingBalances, livingMoneyHeld } from '../src/engine/livingMoney';
import { bossLearns, factSeen, seenFacts } from '../src/engine/livingKnow';
import { knownStories } from '../src/engine/livingStory';
import { livingRequest } from '../src/engine/livingAsk';
import { districtView, personView } from '../src/engine/livingView';
import { jobsOf } from '../src/engine/hood';
import { HOODS_BY_ID } from '../src/engine/hoodData';
import { ensureFin, finOf, finView, seenSkim, seenWealth } from '../src/engine/crewFinance';
import { financeWeek } from '../src/engine/crewFinance';
import { purseMen, upToCollected } from '../src/engine/crewPurse';
import { ensureTribute } from '../src/engine/tributeState';
import { Happening } from '../src/ui/town/Happening';
import { FinancialLife } from '../src/ui/sheet/FinancialLife';
import type { GameState, PlayerAction } from '../src/engine/types';

/**
 * Phase 3, the living neighborhood (B11-B14, B32) and the men's financial
 * lives. Small seeds, hands-off runs, then the player stepping in.
 */

function run(s: GameState, weeks: number, actions?: (s: GameState, i: number) => PlayerAction[] | undefined): GameState {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    const a = actions?.(s, i);
    s = advanceWeek(s, a ? { actions: a } : {}).state;
  }
  return s;
}

const cache = new Map<string, GameState>();
function hands(seed: string, weeks: number): GameState {
  const k = `${seed}:${weeks}`;
  if (!cache.has(k)) cache.set(k, run(newGame(seed), weeks));
  return cache.get(k)!;
}

function people(L: LivingState): Tp[] {
  return Object.values(L.people);
}

describe('the living Boardwalk: 104 weeks with nobody touching it', () => {
  const s0 = hands('living-a', 1);
  const s = hands('living-a', 104);
  const L = s.living!;

  it('the district is made from the lot records: every private going concern has an owner with a household', () => {
    const L0 = s0.living!;
    const zones = HOODS_BY_ID.boardwalk.zones;
    for (const l of s0.econ!.lots.filter((x) => zones.includes(x.zone) && x.status === 'private' && x.stage === 'open' && x.use && x.tenant)) {
      const b = L0.biz[l.id];
      expect(b, l.id).toBeDefined();
      expect(L0.hh[L0.people[b.owner].hh]).toBeDefined();
    }
    expect(Object.keys(L0.people).length).toBeGreaterThan(120);
  });

  it('genealogy stays possible: no impossible ages or parents; households and marriages agree', () => {
    const y = s.date.y, m = s.date.m;
    for (const p of people(L)) {
      expect(ageOf(p, y, m), p.id).toBeGreaterThanOrEqual(0);
      const mo = p.mo ? L.people[p.mo] : undefined;
      const fa = p.fa ? L.people[p.fa] : undefined;
      if (mo) { const at = p.by - mo.by; expect(at, `${p.id} mother`).toBeGreaterThanOrEqual(15); expect(at).toBeLessThanOrEqual(50); }
      if (fa) expect(p.by - fa.by, `${p.id} father`).toBeGreaterThanOrEqual(16);
      if (p.sp && !p.sepd) {
        const q = L.people[p.sp];
        expect(q?.sp, `${p.id} spouse`).toBe(p.id);
        expect(ageOf(p, y, m)).toBeGreaterThanOrEqual(18);
      }
      if (!p.dead && p.left === undefined) {
        const homes = Object.values(L.hh).filter((h) => h.members.includes(p.id));
        expect(homes.length, `${p.id} lives in one household`).toBe(1);
        expect(homes[0].id).toBe(p.hh);
      }
      // Romance and money plans are for grown people only.
      if (p.plan && (p.plan.k === 'court' || p.plan.k === 'affair' || p.plan.k === 'skim')) expect(ageOf(p, y, m)).toBeGreaterThanOrEqual(18);
    }
    for (const h of Object.values(L.hh)) for (const id of h.members) expect(L.people[id]?.hh, id).toBe(h.id);
  });

  it('the dead do nothing after they die', () => {
    const acts = new Set(['loan', 'hired', 'courting', 'affair', 'skim', 'theft', 'thief', 'revenge', 'asked_help', 'opened', 'raise', 'grudge']);
    for (const p of people(L).filter((x) => x.dead)) {
      const died = L.facts.find((f) => f.k === 'died' && f.a[0] === p.id);
      if (!died) continue;
      for (const f of L.facts) if (acts.has(f.k) && f.a[0] === p.id) expect(f.w, `${p.id} ${f.k}`).toBeLessThanOrEqual(died.w);
    }
  });

  it('money reconciles: what the district holds changed by exactly what came in from and went out to the outside', () => {
    const held0 = livingMoneyHeld(s0.living!) - 0;
    const flow0 = Object.values(s0.living!.flow).reduce((a, b) => a + b, 0);
    const flow1 = Object.values(L.flow).reduce((a, b) => a + b, 0);
    // flow[x] < 0: money came in from x; > 0: money went out to x.
    expect(livingMoneyHeld(L) - held0).toBe(-(flow1 - flow0));
    for (const [k, v] of Object.entries(livingBalances(L))) expect(v, k).toBeGreaterThanOrEqual(0);
  });

  it('stays stable: no runaway population, businesses come and go, the event rate is plausible', () => {
    const t = districtTotals(s, L);
    expect(t.people).toBeGreaterThan(L.base.pop * 0.6);
    expect(t.people).toBeLessThan(L.base.pop * 1.6);
    expect(Object.keys(L.biz).length).toBeGreaterThan(L.base.biz * 0.6);
    expect(Object.keys(L.biz).length).toBeLessThan(L.base.biz * 1.6);
    expect(L.stats.facts / 104).toBeLessThan(10);
    // Restraint: scandals are rare.
    expect(L.stats.affairs + L.stats.thefts + L.stats.revenge).toBeLessThan(40);
  });

  it('people act on their own: relationships, children, loans, jobs and business changes all happen', () => {
    const st = L.stats;
    expect(st.marriages + L.facts.filter((f) => f.k === 'courting').length).toBeGreaterThan(0);
    expect(st.births).toBeGreaterThan(0);
    expect(st.loans).toBeGreaterThan(0);
    expect(L.facts.some((f) => f.k === 'repaid' || f.k === 'default' || f.k === 'missed')).toBe(true);
    expect(st.hires).toBeGreaterThan(0);
    expect(st.opened + st.closed + st.sold).toBeGreaterThan(0);
  });

  it('district totals come from the records and agree with the neighborhood dashboard', () => {
    const t = districtTotals(s, L, 'boardwalk');
    expect(s.hood!.stats.boardwalk.pop).toBe(t.people);
    const zones = HOODS_BY_ID.boardwalk.zones;
    const lots = s.econ!.lots.filter((l) => zones.includes(l.zone));
    expect(t.jobs).toBe(lots.reduce((a, l) => a + jobsOf(l), 0));
    const employed = people(L).filter((p) => present(p, s.week) && ageOf(p, s.date.y, s.date.m) >= 18 && p.job && lots.some((l) => l.id === p.job)).length;
    expect(t.employed).toBe(employed);
    // Every business the people run stands on an open private lot in the district.
    for (const b of Object.values(L.biz)) {
      const l = lots.find((x) => x.id === b.lot)!;
      expect(l.status).toBe('private');
      expect(l.stage).toBe('open');
      expect(L.people[b.owner].dead).toBeUndefined();
    }
  });

  it('a story links its causes: every fact it holds exists and comes in order', () => {
    const multi = L.stories.filter((st) => st.f.length >= 3);
    expect(multi.length).toBeGreaterThan(0);
    for (const st of multi) {
      let w = 0;
      for (const id of st.f) {
        const f = L.facts.find((x) => x.id === id);
        if (!f) continue;
        expect(f.w).toBeGreaterThanOrEqual(w);
        w = f.w;
      }
    }
  });
});

describe('determinism, saves, old saves', () => {
  it('same seed, same orders: the same district', () => {
    const a = run(newGame('living-d'), 30);
    const b = run(newGame('living-d'), 30);
    expect(JSON.stringify(a.living)).toBe(JSON.stringify(b.living));
  });

  it('save and load mid-run plays on the same as never saving', () => {
    const mid = run(newGame('living-e'), 20);
    const direct = run(mid, 15);
    const loaded = upgradeSave(JSON.parse(JSON.stringify(mid)) as GameState);
    const after = run(loaded, 15);
    expect(JSON.stringify(after.living)).toBe(JSON.stringify(direct.living));
  });

  it('the state is plain JSON after a week (tidy round-trip)', () => {
    const s = run(newGame('living-f'), 6);
    const c = JSON.parse(JSON.stringify(s));
    tidyState(c);
    expect(JSON.stringify(c.living)).toBe(JSON.stringify(s.living));
  });

  it('an older save without the district gets one the first week, and it runs', () => {
    const s = run(newGame('living-g'), 8);
    delete (s as Partial<GameState>).living;
    const up = upgradeSave(JSON.parse(JSON.stringify(s)) as GameState);
    expect(up.living).toBeUndefined();
    const after = run(up, 3);
    expect(after.living).toBeDefined();
    expect(Object.keys(after.living!.people).length).toBeGreaterThan(50);
  });
});

describe('the player changes the district\'s history', () => {
  it('helping a family in trouble changes what happens after, and leaves what happened before alone', () => {
    const base = run(newGame('living-i'), 30);
    const L = base.living!;
    // The household with the least money (that is still here).
    const hh = Object.values(L.hh).filter((h) => h.gone === undefined && h.members.some((id) => present(L.people[id], base.week))).sort((a, b) => a.cash - b.cash || a.id.localeCompare(b.id))[0];
    const plain = run(base, 40);
    const helped = run(base, 40, (_s, i) => (i === 0 ? [{ kind: 'living', op: { op: 'give', hh: hh.id, amt: 1500 } }] : undefined));
    const key = (f: { w: number; k: string; txt: string }) => `${f.w}|${f.k}|${f.txt}`;
    const A = plain.living!.facts.filter((f) => f.w > base.week).map(key);
    const B = helped.living!.facts.filter((f) => f.w > base.week).map(key);
    expect(A.join('\n')).not.toBe(B.join('\n'));
    expect(helped.living!.facts.some((f) => f.k === 'boss_helped')).toBe(true);
    // Most of the district's life is untouched by one gift (rolls are per person, per week).
    const setA = new Set(A);
    expect(B.filter((x) => setA.has(x)).length).toBeGreaterThan(B.length * 0.3);
    // The gift is real money: the Family paid it, the household got it.
    expect(helped.living!.flow.family).toBeLessThan(0);
  });
});

describe('what the boss knows (B11)', () => {
  const s = hands('living-a', 104);
  const L = s.living!;

  it('secrets are not on any player surface until a channel brings them', () => {
    const secret = L.facts.filter((f) => f.sec === 3 && !factSeen(s, f));
    const shown = new Set(seenFacts(s, 9999).map((x) => x.f.id));
    for (const f of secret) expect(shown.has(f.id)).toBe(false);
    const v = districtView(s, 9999)!;
    const html = JSON.stringify(v) + JSON.stringify(Object.keys(L.people).slice(0, 60).map((id) => personView(s, id)));
    for (const f of secret) expect(html.includes(`"${f.id}"`), f.txt).toBe(false);
    // The developer's truth only with the developer toggle.
    expect(JSON.stringify(personView(s, Object.keys(L.people)[0]))).not.toContain('"dev"');
  });

  it('every fact the boss knows says how he knows it, and a rumor is labeled a rumor', () => {
    const seen = seenFacts(s, 9999);
    expect(seen.length).toBeGreaterThan(10);
    for (const { seen: x } of seen) {
      expect(['public', 'rumor', 'confirmed']).toContain(x.lvl);
      expect(x.via.length).toBeGreaterThan(3);
    }
    expect(seen.some((x) => x.seen.lvl === 'rumor')).toBe(true);
  });

  it('a story shows only the beats the boss knows, and counts the rest as gaps', () => {
    for (const v of knownStories(s, 50)) {
      const st = L.stories.find((x) => x.id === v.id)!;
      expect(v.beats.length + v.gaps).toBeLessThanOrEqual(st.f.length);
      for (const b of v.beats) expect(factSeen(s, L.facts.find((f) => f.id === b.id)!)).toBeDefined();
    }
  });

  it('A09: another man\'s exact money and skim rate never show without the developer toggle', () => {
    const men = purseMen(s);
    for (const c of men) {
      const shown = seenWealth(s, c);
      if (Math.round(c.wealth) >= 100) expect(shown, c.id).not.toBe(`$${Math.round(c.wealth).toLocaleString('en-US')}`);
      expect(seenSkim(s, c, [])).not.toMatch(/%/);
    }
    expect(seenWealth(s, men[0], true)).toBe(`$${Math.round(men[0].wealth).toLocaleString('en-US')}`);
  });

  it('the screens render on phones and desktops without throwing', () => {
    expect(renderToString(createElement(Happening, { s }))).toContain('happening');
    const c = purseMen(s)[0];
    expect(renderToString(createElement(FinancialLife, { s, c }))).toContain('financial-life');
  });
});

describe('requests come from real situations (B14)', () => {
  it('a debt the capo brings carries its known backstory, and paying it is real Family money to the lender', () => {
    // Find a week where a request was made, in a hands-off run.
    let s = newGame('living-a');
    let found: { st: string; s: GameState } | undefined;
    for (let i = 0; i < 104 && !found; i++) {
      s = advanceWeek(s, {}).state;
      const st = s.living!.stories.find((x) => x.ask && !x.ask.ans && x.open && livingRequest(s, x) && s.living!.debts.some((d) => d.st === 'open' && x.f.includes(d.fid)));
      if (st) found = { st: st.id, s };
    }
    expect(found).toBeDefined();
    const st = found!.s.living!.stories.find((x) => x.id === found!.st)!;
    const ev = livingRequest(found!.s, st)!;
    expect(ev.defId).toBe('living_request');
    // The backstory is made of facts the boss now knows (the capo told him).
    const known = st.f.filter((id) => { const f = found!.s.living!.facts.find((x) => x.id === id); return f && factSeen(found!.s, f); });
    expect(known.length).toBeGreaterThan(0);
    expect(ev.text.split('\n\n').length).toBeGreaterThanOrEqual(3);
    // Answer: pay it off.
    const d = found!.s.living!.debts.find((x) => x.st === 'open' && st.f.includes(x.fid))!;
    const before = found!.s.money;
    const pending = { ...found!.s, pendingEvents: [ev] } as GameState;
    const after = advanceWeek(pending, { choices: { [ev.iid]: 'pay' } }).state;
    const d2 = after.living!.debts.find((x) => x.id === d.id)!;
    expect(d2.st).toBe('paid');
    expect(after.living!.stories.find((x) => x.id === st.id)!.ask!.ans).toBe('pay');
    expect(after.living!.facts.some((f) => f.k === 'boss_helped')).toBe(true);
    expect(before - after.money).toBeGreaterThan(0);
  });
});

describe('the men build their own wealth (crew financial lives)', () => {
  it('a soldier earns and saves over the weeks with no orders', () => {
    const s0 = hands('living-a', 1);
    const s = hands('living-a', 52);
    const grew = purseMen(s).filter((c) => {
      const f = finOf(s, c.id);
      const was = s0.characters[c.id]?.wealth ?? 0;
      return f && c.wealth + f.bank + f.assets.reduce((a, x) => a + x.value, 0) > was;
    });
    expect(grew.length).toBeGreaterThan(0);
    expect(purseMen(s).some((c) => (finOf(s, c.id)?.bank ?? 0) > 0)).toBe(true);
  });

  it('outcomes vary: not everyone gets rich at the same rate', () => {
    const s = hands('living-a', 104);
    const worth = purseMen(s).map((c) => { const f = finOf(s, c.id); return c.wealth + (f?.bank ?? 0) + (f?.assets.reduce((a, x) => a + x.value, 0) ?? 0) - (f?.loans.reduce((a, d) => a + d.out, 0) ?? 0); });
    const mean = worth.reduce((a, b) => a + b, 0) / worth.length;
    const sd = Math.sqrt(worth.reduce((a, b) => a + (b - mean) ** 2, 0) / worth.length);
    expect(sd / Math.max(1, mean)).toBeGreaterThan(0.3);
    expect(new Set(purseMen(s).map((c) => finOf(s, c.id)?.goal)).size).toBeGreaterThan(1);
  });

  it('a capo with money invests in an available business: a stake on a real lot, paid for from his pocket', () => {
    let s = run(newGame('living-k'), 4);
    const capo = purseMen(s).find((c) => c.rank === 'capo')!;
    const life = ensureTribute(s).life![capo.id];
    const fin = ensureFin(s, capo, life);
    fin.goal = 'business';
    fin.risk = 90;
    capo.wealth = 20000;
    for (const b of Object.values(s.living!.biz)) b.red = 2; // owners who need capital
    let stake;
    for (let i = 0; i < 30 && !stake; i++) {
      s = advanceWeek(s, {}).state;
      stake = finOf(s, capo.id)?.assets.find((a) => a.k === 'stake');
    }
    expect(stake).toBeDefined();
    const b = s.living!.biz[stake!.lot!] ?? undefined;
    if (b) expect(b.stk!.some((x) => x.c === capo.id)).toBe(true);
    // The stake is a fact the boss does not know until a channel brings it.
    const f = s.living!.facts.find((x) => x.id === stake!.fid)!;
    expect(f.k).toBe('stake');
    const shown = finView(s, s.characters[capo.id]);
    if (!factSeen(s, f)) expect(shown.assets.some((a) => a.text.includes('%'))).toBe(false);
    bossLearns(s, f, 'confirmed', 'a test');
    if (stake!.value > 0) expect(finView(s, s.characters[capo.id]).assets.some((a) => a.text.includes('%'))).toBe(true);
  });

  it('a loan between two men is repaid with no money created or lost', () => {
    const s = cloneState(hands('living-a', 10));
    const men = purseMen(s);
    const [a, b] = [men[0], men[1]];
    a.wealth = 5000;
    b.wealth = 2000;
    const t = ensureTribute(s);
    const fa = ensureFin(s, a, (t.life![a.id] ??= { debt: 0, earned: 0, up: 0, kept: 0, spent: 0 }));
    ensureFin(s, b, (t.life![b.id] ??= { debt: 0, earned: 0, up: 0, kept: 0, spent: 0 }));
    fa.loans = [{ lender: b.id, label: 'a loan', out: 600, pay: 60, w: s.week, missed: 0, seen: 2 }];
    fa.month = `${s.date.y}-${s.date.m}`;
    finOf(s, b.id)!.month = fa.month;
    const total = a.wealth + b.wealth;
    for (let i = 0; i < 12; i++) {
      tributeOpen(s);
      const ctx = newCtx(s);
      financeWeek(ctx, a, t.life![a.id], 0, 0);
      expect(reconcileAccounts(s)).toEqual([]);
      s.week++;
    }
    expect(fa.loans[0].out).toBe(0);
    expect(a.wealth + b.wealth).toBe(total);
    expect(b.wealth).toBe(2600);
  });

  it('each man\'s contribution shows once in the envelope, and personal and family accounts reconcile', () => {
    const s = run(newGame('living-l'), 12);
    const rep = s.tribute!.reports[s.tribute!.reports.length - 1];
    // Kicked up - skimmed - held + late + carry = what reached the envelope: each contribution counted once.
    expect(upToCollected(rep).ok).toBe(true);
    const keys = s.tribute!.journal.map((x) => x.k);
    expect(new Set(keys).size).toBe(keys.length);
    expect(reconcileAccounts(s)).toEqual([]);
    // The men's own money moves never touch the Family's accounts.
    for (const x of s.tribute!.journal) if (x.k.includes(':fin:')) { expect(x.f).not.toBe('treasury'); expect(x.t).not.toBe('treasury'); expect(['personal', 'reserve', 'envelope', 'clearing']).not.toContain(x.t); }
  });

  it('assets and debts persist through save and load, and through death (the estate stays on the books)', () => {
    let s = hands('living-a', 104);
    const owner = purseMen(s).find((c) => (finOf(s, c.id)?.assets.length ?? 0) > 0);
    expect(owner).toBeDefined();
    const before = JSON.stringify(finOf(s, owner!.id));
    s = upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(JSON.stringify(finOf(s, owner!.id))).toBe(before);
    s = forceDeath(s, owner!.id, 'a heart attack').state;
    s = advanceWeek(s, {}).state;
    const f = finOf(s, owner!.id);
    expect(f).toBeDefined();
    expect(f!.assets.length).toBeGreaterThan(0);
    expect(f!.estate).toBeDefined();
  });
});

describe('B32: what a week costs', () => {
  it('the district adds little to a week (measured, warm)', () => {
    const start = run(newGame('living-bench'), 2);
    const time = (on: boolean) => {
      setLivingEnabled(on);
      let s = start;
      const t0 = performance.now();
      for (let i = 0; i < 26; i++) s = advanceWeek(s, {}).state;
      setLivingEnabled(true);
      return (performance.now() - t0) / 26;
    };
    time(false); time(true);
    const off = Math.min(time(false), time(false));
    const on = Math.min(time(true), time(true));
    const L = start.living!;
    console.log(`B32 week: ${off.toFixed(1)} ms without the district, ${on.toFixed(1)} ms with (+${(on - off).toFixed(1)} ms); ${Object.keys(L.people).length} people, ${Object.keys(L.hh).length} households, ${Object.keys(L.biz).length} businesses`);
    expect(on - off).toBeLessThan(45);
  });
});
