import { beforeAll, describe, expect, it } from 'vitest';
import { newBusiness } from '../src/engine/business';
import { advanceWeek } from '../src/engine/engine';
import { decideApp, deskApply, ensureFbank, fbankWeek, LEGAL_RATE, weeklyPayment } from '../src/engine/familyBank';
import { HOME_USES, homeLots, housingCounts, MORTGAGE, tryToBuild, vacantHomeLots, weeklyIncome } from '../src/engine/housing';
import { newCtx } from '../src/engine/ledger';
import { pay, reconcileLiving } from '../src/engine/livingMoney';
import { ageOf, present, type LivingState, type Th } from '../src/engine/livingState';
import { newGame } from '../src/engine/newGame';
import { placeAction, placeCondition } from '../src/engine/placeEligibility';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { GameState, PlayerAction } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;
const week = (s: GameState, actions: PlayerAction[] = []) => advanceWeek(s, { actions });
const quiet = (s: GameState) => { s.heat = { local: 0, family: 0, federal: 0 }; return s; };

/** A renting family with work, not building, not waiting. */
function renter(s: GameState, salt = 0): Th {
  const L = s.living!;
  const list = Object.values(L.hh).filter((hh) => hh.gone === undefined && !hh.lot && hh.rent > 0 && weeklyIncome(L, hh, s.week) > 0 && !Object.values(s.housing!.builds).some((b) => b.hh === hh.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return list[salt % list.length];
}

/** Give a household money from off the island (journaled, so the books still reconcile). */
function fund(s: GameState, hh: Th, amt: number): void {
  pay(newCtx(s), s.living!, 'x:arrive', `h:${hh.id}`, amt, 'test: an inheritance');
}

let base: GameState;
beforeAll(() => {
  base = week(quiet(newGame('housing'))).state;
});

describe('the town has its house lots and houses', () => {
  it('a new game has many empty lots and houses across the four towns', () => {
    const s = newGame('housing-new');
    const c = housingCounts(s);
    expect(c.lots).toBeGreaterThanOrEqual(300);
    expect(c.forSale).toBeGreaterThanOrEqual(150);
    expect(c.houses).toBeGreaterThanOrEqual(150);
    const zones = new Set(homeLots(s).map((l) => l.zone));
    for (const z of ['crest', 'downtown', 'north', 'westww']) expect(zones.has(z as never), z).toBe(true);
    // A variety of houses.
    const uses = new Set(homeLots(s).filter((l) => l.use).map((l) => l.use));
    expect(uses.size).toBeGreaterThanOrEqual(5);
  });

  it('most houses have a family of the living layer in them, with believable ages', () => {
    const s = base;
    const L = s.living!;
    const c = housingCounts(s);
    expect(c.lived).toBeGreaterThan(c.houses * 0.7);
    for (const l of homeLots(s).filter((x) => x.hh && x.stage === 'open')) {
      const hh = L.hh[l.hh!];
      expect(hh, l.id).toBeDefined();
      expect(hh.lot).toBe(l.id);
      const ms = hh.members.map((id) => L.people[id]);
      expect(ms.some((p) => ageOf(p, s.date.y, s.date.m) >= 18)).toBe(true);
      for (const p of ms) {
        for (const pid of [p.fa, p.mo]) {
          const par = pid ? L.people[pid] : undefined;
          if (par) expect(ageOf(par, s.date.y, s.date.m) - ageOf(p, s.date.y, s.date.m)).toBeGreaterThanOrEqual(17);
        }
      }
    }
  });

  it('a house is a home, not a shop: no shakedown, no buying it as a going concern', () => {
    const l = homeLots(base).find((x) => x.hh && x.use)!;
    expect(placeCondition(l)).toBe('home');
    expect(placeAction(base, l, 'shakedown')?.why).toMatch(/home/);
    expect(placeAction(base, l, 'buyBusiness')?.why).toBeTruthy();
    const v = vacantHomeLots(base)[0];
    expect(placeCondition(v)).toBe('vacant');
    expect(placeAction(base, v, 'offer')?.why).toBeUndefined();
  });
});

describe('families build with their own money', () => {
  it('a household buys a lot and builds a house with its own money over the weeks', () => {
    let s = clone(base);
    const hh = renter(s);
    fund(s, hh, 20000);
    const cash0 = s.living!.hh[hh.id].cash;
    const ctx = newCtx(s);
    expect(tryToBuild(ctx, hh.id)).toBe('cash');
    const b = Object.values(s.housing!.builds).find((x) => x.hh === hh.id)!;
    expect(b).toBeDefined();
    const lot = s.econ!.lots.find((l) => l.id === b.lot)!;
    expect(lot.status).toBe('private');
    expect(lot.hhOwns).toBe(1);
    expect(lot.stage).toBe('permits');
    const price = cash0 - s.living!.hh[hh.id].cash;
    expect(price).toBe(lot.price);
    let w = 0;
    while (s.econ!.lots.find((l) => l.id === b.lot)!.stage !== 'open' && w < 60) { s = week(quiet(s)).state; w++; }
    const l2 = s.econ!.lots.find((l) => l.id === b.lot)!;
    expect(l2.stage).toBe('open');
    s = week(quiet(s)).state;
    const L = s.living!;
    expect(s.housing!.builds[b.lot]).toBeUndefined();
    expect(L.hh[hh.id].lot).toBe(b.lot);
    expect(s.econ!.lots.find((l) => l.id === b.lot)!.hh).toBe(hh.id);
    expect(L.facts.some((f) => f.k === 'house_built' && f.at === b.lot)).toBe(true);
    expect(s.chronicle.some((c) => /broke ground/.test(c.text))).toBe(true);
    expect(reconcileLiving(L)).toEqual([]);
  });

  it('a mortgage moves money (Chemical Bank to the family, the family to the builder) and the books reconcile', () => {
    let s = clone(base);
    const hh = renter(s, 1);
    const L0 = s.living!;
    const lot = vacantHomeLots(s).sort((a, b) => a.price - b.price)[0];
    const total = lot.price + 9000;
    fund(s, hh, Math.round(total * 0.45));
    // Wages good enough for the bank.
    for (const id of L0.hh[hh.id].members) { const p = L0.people[id]; if (p.job === 'out') p.wage = 140; }
    const flow0 = L0.flow['x:bank'] ?? 0;
    const r = tryToBuild(newCtx(s), hh.id, lot.id);
    expect(r).toBe('bank');
    const d = L0.debts.find((x) => x.hh === hh.id && x.lender === 'bank' && x.lot === lot.id)!;
    expect(d).toBeDefined();
    expect(flow0 - (L0.flow['x:bank'] ?? 0)).toBe(d.amt);
    expect(d.pay).toBe(Math.ceil(d.amt * (1 + MORTGAGE.total) / MORTGAGE.weeks));
    for (let i = 0; i < 6; i++) s = week(quiet(s)).state;
    expect(reconcileLiving(s.living!)).toEqual([]);
    const b = s.housing!.builds[lot.id];
    expect(b.paid).toBeGreaterThan(0);
  });

  it('when the builder is one of the boss\'s construction fronts, the Family earns from the job (paid by the family)', () => {
    let s = clone(base);
    const co = newBusiness(s, 'construction', 'downtown', 'Seaside Construction');
    co.id = `b${s.nextId++}`;
    s.businesses.push(co);
    const hh = renter(s, 2);
    fund(s, hh, 25000);
    expect(tryToBuild(newCtx(s), hh.id, undefined, { builder: 'mine' })).toBe('cash');
    const b = Object.values(s.housing!.builds).find((x) => x.hh === hh.id)!;
    expect(b.acct).toBe('family');
    const addr = s.econ!.lots.find((l) => l.id === b.lot)!.address;
    let earned = 0;
    for (let i = 0; i < 40 && s.housing!.builds[b.lot]; i++) {
      const r = week(quiet(s));
      earned += r.report.lines.filter((x) => x.stat === 'money' && x.label.startsWith('Contract: Seaside Construction building') && x.label.endsWith(` at ${addr}`)).reduce((a, x) => a + x.amount, 0);
      s = r.state;
    }
    expect(earned).toBe(b.cost);
  });

  it('104 weeks with nobody touching it: empty lots fall, houses rise, within the caps', () => {
    let s = clone(base);
    const c0 = housingCounts(s);
    const H0 = s.housing!.init;
    let maxBuilds = 0;
    for (let i = 0; i < 104; i++) { s = week(quiet(s)).state; maxBuilds = Math.max(maxBuilds, Object.keys(s.housing!.builds).length); }
    const c = housingCounts(s);
    expect(c.vacant).toBeLessThan(c0.vacant);
    expect(c.houses).toBeGreaterThan(c0.houses);
    expect(c.forSale).toBeGreaterThanOrEqual(Math.min(c0.forSale, Math.round(H0.vacant * 0.2)) - 2);
    expect(maxBuilds).toBeLessThanOrEqual(10);
    expect(s.housing!.stats.built).toBeGreaterThan(5);
    const L = s.living!;
    const hh = Object.values(L.hh).filter((h) => h.gone === undefined && !L.hoods.includes(h.hood)).length;
    expect(hh).toBeLessThan((H0.hh ?? 200) * 1.6);
    expect(reconcileLiving(L)).toEqual([]);
  });
});

describe('the boss\'s houses and the townspeople', () => {
  function bossHouse(s: GameState) {
    const l = homeLots(s).find((x) => x.use && x.stage === 'open' && x.status === 'sale' && !x.hh)!;
    s.money = 200000;
    const r = week(quiet(s), [{ kind: 'econ', op: { type: 'buyLot', lotId: l.id } }]);
    return { s: r.state, id: l.id };
  }

  it('the boss sells a house to a family of the town, who pay with their own money', () => {
    const { s: s1, id } = bossHouse(clone(base));
    expect(s1.econ!.lots.find((l) => l.id === id)!.status).toBe('owned');
    const hh = renter(s1, 3);
    fund(s1, hh, 40000);
    const cash0 = s1.living!.hh[hh.id].cash;
    const money0 = s1.money;
    const r = week(quiet(s1), [{ kind: 'econ', op: { type: 'home', cmd: { k: 'sell', lotId: id, price: 'quick' } } }]);
    const s2 = r.state;
    const l = s2.econ!.lots.find((x) => x.id === id)!;
    expect(l.status).toBe('private');
    expect(l.hhOwns).toBe(1);
    const buyer = s2.living!.hh[l.hh!];
    expect(buyer.lot).toBe(id);
    const paid = r.report.lines.filter((x) => x.stat === 'money' && x.label.includes(`buy ${l.address}`)).reduce((a, x) => a + x.amount, 0);
    expect(paid).toBeGreaterThan(0);
    if (buyer.id === hh.id) expect(cash0 - s2.living!.hh[hh.id].cash).toBeGreaterThanOrEqual(paid - 500);
    expect(s2.money).toBeGreaterThan(money0 - 5000);
    expect(reconcileLiving(s2.living!)).toEqual([]);
  });

  it('the boss rents a house to a family, and the rent comes out of their wages every week', () => {
    const { s: s1, id } = bossHouse(clone(base));
    const r1 = week(quiet(s1), [{ kind: 'econ', op: { type: 'home', cmd: { k: 'rent', lotId: id } } }]);
    const l = r1.state.econ!.lots.find((x) => x.id === id)!;
    expect(l.hh).toBeDefined();
    expect(l.hhOwns).toBeUndefined();
    const r2 = week(quiet(r1.state));
    expect(r2.report.lines.some((x) => x.stat === 'money' && x.label.startsWith(`Rent: `) && x.label.includes(l.address) && x.amount > 0)).toBe(true);
  });

  it('save and load: the houses, the families and the builds come back the same and play on the same', () => {
    let s = clone(base);
    for (let i = 0; i < 6; i++) s = week(quiet(s)).state;
    const loaded = upgradeSave(clone(s));
    expect(housingCounts(loaded)).toEqual(housingCounts(s));
    let a = s;
    let b = loaded;
    for (let i = 0; i < 4; i++) { a = week(quiet(a)).state; b = week(quiet(b)).state; }
    expect(JSON.stringify(b.housing)).toBe(JSON.stringify(a.housing));
    expect(JSON.stringify(b.econ!.lots)).toBe(JSON.stringify(a.econ!.lots));
  });

  it('an older save without the houses gets them by stable id, and the families the next week', () => {
    const s = clone(base);
    delete s.housing;
    s.econ!.lots = s.econ!.lots.filter((l) => !l.home);
    const up = upgradeSave(s);
    expect(housingCounts(up).lots).toBe(housingCounts(base).lots);
    const next = week(quiet(up)).state;
    expect(housingCounts(next).lived).toBeGreaterThan(100);
    expect(reconcileLiving(next.living!)).toEqual([]);
  });
});

describe('the Family\'s loan desk', () => {
  function withBank(s: GameState): GameState {
    const b = newBusiness(s, 'bank', 'downtown', 'Shore Federal Savings & Loan');
    b.id = `b${s.nextId++}`;
    s.businesses.push(b);
    s.money = 200000;
    return s;
  }
  function poorFamily(s: GameState, salt = 4): Th {
    const L = s.living!;
    // A family that works for wages (no shop of its own), paid little.
    const all = Object.values(L.hh).filter((h) => h.gone === undefined && !h.lot && h.rent > 0 && h.members.some((id) => L.people[id].job === 'out') && !h.members.some((id) => L.biz[L.people[id].job ?? '']?.owner === id)).sort((a, b) => a.id.localeCompare(b.id));
    const hh = all[salt % all.length];
    for (const id of hh.members) { const p = L.people[id]; if (p.wage) p.wage = 25; }
    return hh;
  }

  it('a family Chemical Bank turns down comes to the Family\'s bank, with its real finances', () => {
    const s = withBank(clone(base));
    const hh = poorFamily(s);
    fund(s, hh, 4000);
    expect(tryToBuild(newCtx(s), hh.id)).toBe('desk');
    const app = s.fbank!.apps.find((a) => a.hh === hh.id && a.st === 'open')!;
    expect(app).toBeDefined();
    expect(app.denied.join(' ')).toMatch(/payments/);
    expect(app.income).toBe(weeklyIncome(s.living!, s.living!.hh[hh.id], s.week));
    expect(s.living!.facts.some((f) => f.k === 'bank_no')).toBe(true);
  });

  it('the rate the boss sets changes the weekly payments; the loan is real Family money', () => {
    const pays: number[] = [];
    for (const rate of [LEGAL_RATE, 0.05]) {
      const s = withBank(clone(base));
      const hh = poorFamily(s);
      fund(s, hh, 4000);
      tryToBuild(newCtx(s), hh.id);
      const F = ensureFbank(s);
      F.policy.rate = rate;
      F.policy.weeks = 52;
      const app = F.apps.find((a) => a.hh === hh.id)!;
      const money0 = s.money;
      const cash0 = s.living!.hh[hh.id].cash;
      const ctx = newCtx(s);
      expect(decideApp(ctx, app.id, 'approve')).toBe(true);
      const d = s.living!.debts.find((x) => x.lender === 'family' && x.hh === hh.id)!;
      expect(d.pay).toBe(weeklyPayment(app.amt, rate, 52));
      expect(money0 - s.money).toBe(app.amt);
      expect(s.living!.hh[hh.id].cash - cash0).toBe(app.amt);
      pays.push(d.pay);
    }
    expect(pays[1]).toBeGreaterThan(pays[0] * 3);
  });

  it('a default under "take the collateral" passes the house to the Family; the family stays on and pays rent', () => {
    const s = withBank(clone(base));
    const L = s.living!;
    const lot = homeLots(s).find((l) => l.hh && l.hhOwns && l.use && l.stage === 'open')!;
    const hh = L.hh[lot.hh!];
    const head = hh.members.map((id) => L.people[id]).find((p) => present(p, s.week) && ageOf(p, s.date.y, s.date.m) >= 18)!;
    const F = ensureFbank(s);
    F.policy.onDef = 'collateral';
    F.policy.coll = 'house';
    const app = deskApply(s, L, { kind: 'home', hh: hh.id, by: head.id, lot: lot.id, amt: 1500, why: 'to fix the roof', denied: ['test'] })!;
    const ctx = newCtx(s);
    expect(decideApp(ctx, app.id, 'approve')).toBe(true);
    const d = L.debts.find((x) => x.fb?.app === app.id)!;
    d.missed = 3;
    fbankWeek(ctx);
    expect(d.st).toBe('seized');
    expect(lot.status).toBe('owned');
    expect(lot.owner).toBe('player');
    expect(lot.hhOwns).toBeUndefined();
    expect(lot.hh).toBe(hh.id);
    expect(hh.rent).toBeGreaterThan(0);
    expect(reconcileLiving(L)).toEqual([]);
  });

  it('a default under "a piece of the business" makes the Family a partner', () => {
    const s = withBank(clone(base));
    const L: LivingState = s.living!;
    const b = Object.values(L.biz).find((x) => present(L.people[x.owner], s.week))!;
    const owner = L.people[b.owner];
    const F = ensureFbank(s);
    F.policy.onDef = 'piece';
    const app = deskApply(s, L, { kind: 'biz', hh: owner.hh, by: owner.id, lot: b.lot, amt: 800, why: 'for new booths', denied: ['test'] })!;
    const ctx = newCtx(s);
    expect(decideApp(ctx, app.id, 'approve')).toBe(true);
    const d = L.debts.find((x) => x.fb?.app === app.id)!;
    d.missed = 3;
    fbankWeek(ctx);
    expect(d.st).toBe('seized');
    expect(b.stk?.some((x) => x.c === 'family' && x.pct === 0.25)).toBe(true);
  });

  it('shady terms bring heat, resentment and talk; a bank\'s rate does not', () => {
    const run = (rate: number) => {
      const s = withBank(clone(base));
      const L = s.living!;
      const F = ensureFbank(s);
      F.policy.rate = rate;
      F.policy.weeks = 52;
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const hh = renter(s, i + 5);
        const head = L.hh[hh.id].members.map((id) => L.people[id]).find((p) => present(p, s.week) && ageOf(p, s.date.y, s.date.m) >= 18)!;
        const a = deskApply(s, L, { kind: 'home', hh: hh.id, by: head.id, amt: 2500, why: 'to get by', denied: ['test'] });
        if (a) { decideApp(newCtx(s), a.id, 'approve'); ids.push(head.id); }
      }
      let heat = 0;
      for (let w = 0; w < 8; w++) {
        const ctx = newCtx(s);
        s.date.m = ((s.date.m + (w % 4 === 3 ? 1 : 0) - 1) % 12) + 1;
        fbankWeek(ctx);
        heat += ctx.lines.filter((x) => x.stat.startsWith('heat')).reduce((a, x) => a + x.amount, 0);
      }
      const gr = ids.reduce((a, id) => a + (L.people[id].ties[s.playerId]?.gr ?? 0), 0);
      return { heat, talk: F.talk, gr };
    };
    const clean = run(LEGAL_RATE);
    const vig = run(0.05);
    expect(clean.heat).toBe(0);
    expect(vig.heat).toBeGreaterThan(0);
    expect(vig.talk).toBeGreaterThan(clean.talk);
    expect(vig.gr).toBeGreaterThan(clean.gr);
  });
});

void HOME_USES;
