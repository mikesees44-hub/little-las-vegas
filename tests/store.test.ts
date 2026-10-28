import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { CATALOG } from '../src/engine/catalog';
import { capos, crew } from '../src/engine/characters';
import { advanceWeek } from '../src/engine/engine';
import { newCtx, reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { addOpinion, opinion } from '../src/engine/relations';
import { ownedCount, spendBlock, spendOwned, spendPrice } from '../src/engine/spend';
import { SPEND, SPEND_BY_ID } from '../src/engine/spendData';
import {
  adviserLine, bizCapacity, catalogEntry, bizCard, bizTake, counterOffer, financeTerms, haggleFloor, LINKED_BIZ, luxuryItems, raceBlock, runners, storeCard, storeItems, storeSize, storeTab,
} from '../src/engine/store';
import { STORE_TABS } from '../src/engine/storeData';
import { sharePlan } from '../src/engine/storeShare';
import { timeCost } from '../src/engine/timeCost';
import { ensureTravel, type Trip } from '../src/engine/travelState';
import { quoteTrip } from '../src/engine/travel';
import { upgradeSave } from '../src/engine/upgradeSave';
import { easyPlan, easyQuote, groupIds, whoMindsTheStore, wildDay, wildOn, WHOLE_FAMILY } from '../src/engine/vacPlanner';
import type { Character, GameState, PlayerAction } from '../src/engine/types';
import { StorePanel } from '../src/ui/store/StorePanel';

const buy = (item: string, extra: Record<string, unknown> = {}): PlayerAction => ({ kind: 'spend', op: { op: 'buy', item, ...extra }, fund: 'family' } as PlayerAction);

function rich(seed: string): GameState {
  const s = newGame(seed);
  s.money = 600000;
  s.tribute!.acct.personal = 400000;
  return s;
}

/** A wife for the boss (if the seed gave him none) and a goomar, both adults. */
function withWomen(s: GameState): { wife: Character; goomar: Character } {
  const B = s.characters[s.playerId];
  const women = Object.values(s.characters).filter((c) => c.alive && c.gender === 'F' && !c.dynasty && c.id !== B.spouseId && c.faction !== 'player' && !c.spouseId);
  let wife = B.spouseId ? s.characters[B.spouseId] : undefined;
  if (!wife?.alive) { wife = women.shift()!; B.spouseId = wife.id; wife.spouseId = B.id; }
  const goomar = women.find((c) => c.id !== wife!.id)!;
  ensureTravel(s).friends[B.id] = [goomar.id];
  return { wife, goomar };
}

describe('The Store: the catalog', () => {
  it('is deep: 350+ things, every tab stocked, every line sane', () => {
    expect(storeSize()).toBeGreaterThanOrEqual(350);
    expect(SPEND.length).toBeGreaterThanOrEqual(330);
    expect(new Set(SPEND.map((x) => x.id)).size).toBe(SPEND.length);
    for (const t of STORE_TABS) expect(storeItems(t).length, t).toBeGreaterThanOrEqual(t === 'armory' ? 10 : 15);
    expect(luxuryItems().length).toBeGreaterThan(20);
    for (const it of SPEND) {
      expect(STORE_TABS).toContain(storeTab(it));
      if (it.biz) {
        expect(it.biz.rev[0] + it.biz.rev[1], it.id).toBeGreaterThan(0);
        expect(it.biz.loc.length, it.id).toBeGreaterThan(2);
        expect(it.biz.cond.length, it.id).toBeGreaterThan(2);
        expect(['building', 'business', 'share']).toContain(it.biz.stake);
      }
      if (it.inv) {
        expect(it.inv.partner.length, it.id).toBeGreaterThan(3);
        expect(it.inv.ret[0]).toBeLessThanOrEqual(it.inv.ret[1]);
      }
      if (it.horse) expect(it.horse.speed).toBeGreaterThan(40);
    }
    // What the boss asked for by name.
    for (const id of ['st_penthouse', 'st_mansion', 'st_waterfront', 'st_flophouse', 'st_rooming', 'st_testarossa', 'st_birdcage', 'st_raceteam', 'st_claimer', 'st_stakeshorse', 'st_trainer', 'st_yacht', 'st_submariner', 'st_diamondnecklace', 'st_diner', 'st_marina', 'st_funeral', 'st_recstudio', 'st_hotel', 'st_inv_bonds', 'st_tommy', 'st_kitchen', 'st_lawschool']) expect(SPEND_BY_ID[id], id).toBeDefined();
    // Every legit business type in the design: a store business, or one bought through the districts.
    const linked = new Set(LINKED_BIZ);
    for (const k of ['pizza', 'restaurant', 'deli', 'bar', 'supperclub', 'club', 'stand', 'arcade', 'motel', 'laundromat', 'pawn', 'taxi', 'carlot', 'trucking', 'construction', 'concrete', 'boarding'] as const) expect(linked.has(k), k).toBe(true);
    for (const id of ['st_bakery', 'st_candy', 'st_souvenir', 'st_bikerent', 'st_barber', 'st_records', 'st_hotel', 'st_filmstudio', 'st_socialclub', 'st_office', 'st_garage', 'st_storage', 'st_warehouse', 'st_parkinglot', 'st_vacantlot', 'st_apartments']) expect(SPEND_BY_ID[id], id).toBeDefined();
  });

  it('is period: a photocopier waits for 1961, an answering machine for the seventies; the Tommy gun is a federal file', () => {
    const s = rich('st-period');
    expect(spendBlock(s, SPEND_BY_ID.st_xerox)).toMatch(/1961/);
    expect(spendBlock(s, SPEND_BY_ID.st_answering)).toMatch(/1971/);
    expect(spendBlock(s, SPEND_BY_ID.st_computer)).toMatch(/1975/);
    expect(spendBlock(s, SPEND_BY_ID.st_mustang)).toMatch(/1964/);
    expect(SPEND_BY_ID.st_tommy.notice?.join(' ')).toMatch(/FBI/);
    expect(timeCost(buy('st_diner'))).toBe(2);
    expect(timeCost({ kind: 'spend', op: { op: 'race', uid: 'x', race: 'mon_hcap' } })).toBe(4);
    expect(timeCost({ kind: 'spend', op: { op: 'share', total: 1000, split: { crew: 100, widows: 0, church: 0, hood: 0 }, by: 'rank', pot: 'family' } })).toBe(1);
  });
});

describe('The Store: the purchase card', () => {
  it('shows price, down payment, weekly expenses, revenue, profit range, manager, condition, location and the adviser', () => {
    const s = rich('st-card');
    const c = storeCard(s, SPEND_BY_ID.st_diner);
    expect(c.price).toBeGreaterThan(0);
    expect(c.down).toBeGreaterThan(0);
    expect(c.down!).toBeLessThan(c.price);
    expect(c.weekly).toBeGreaterThan(0);
    expect(c.revenue).toBeGreaterThan(0);
    expect(c.profit![1]).toBeGreaterThan(c.profit![0]);
    expect(c.manager).toBeTruthy();
    expect(c.condition).toBeTruthy();
    expect(c.location).toBeTruthy();
    expect(c.stake).toMatch(/business/);
    expect(c.adviser.length).toBeGreaterThan(10);
    expect(c.negotiable).toBe(true);
    expect(adviserLine(s, SPEND_BY_ID.st_candy)).toMatch(/summer/i);
    // Building, business, share: three different things.
    expect(storeCard(s, SPEND_BY_ID.st_storefronts).stake).toMatch(/building/i);
    expect(storeCard(s, SPEND_BY_ID.st_inv_restaurant).stake).toMatch(/share/i);
    const inv = storeCard(s, SPEND_BY_ID.st_inv_motel).inv!;
    expect(inv.risk).toBeTruthy();
    expect(inv.ret).toMatch(/estimate/);
    expect(inv.partner).toMatch(/Kaplan/);
    expect(storeCard(s, SPEND_BY_ID.st_pi).hire?.conflict).toBeTruthy();
    const b = bizCard(s, 'pizza');
    expect(b.price).toBe(CATALOG.pizza.cost);
    expect(b.profit[1]).toBeGreaterThan(b.profit[0]);
    expect(b.adviser).toBeTruthy();
  });

  it('renders the tabs, the cards and the two big buttons', () => {
    const s = rich('st-ui');
    const html = renderToString(createElement(StorePanel, { s }));
    expect(html).toContain('data-testid="store-tabs"');
    for (const t of ['luxury', ...STORE_TABS]) expect(html).toContain(`data-testid="store-tab-${t}"`);
    expect(html).toContain('data-testid="store-share-btn"');
    expect(html).toContain('data-testid="store-vacation-btn"');
    expect(html.split('data-testid="store-card"').length - 1).toBeGreaterThan(20);
    for (const a of ['Inspect', 'Ask adviser', 'Negotiate', 'Buy', 'Finance']) expect(html).toContain(`>${a}<`);
    expect(renderToString(createElement(StorePanel, { s, initial: 'share' }))).toContain('data-testid="share-wealth"');
    const v = renderToString(createElement(StorePanel, { s, initial: 'vacation' }));
    expect(v).toContain('data-testid="easy-vacation"');
    expect(v).toContain('data-testid="easy-whole-family"');
  });
});

describe('The Store: finance, upkeep, revenue, negotiating', () => {
  it('finance: a quarter down, weekly payments, the diner pays into Family money', () => {
    const s = rich('st-fin');
    s.date = { ...s.date, m: 7 };
    const it = SPEND_BY_ID.st_diner;
    const f = financeTerms(s, it)!;
    const p = previewAction(s, buy('st_diner', { finance: true }));
    expect(p.disabledReason).toBeUndefined();
    expect(p.cost).toBe(f.down);
    const m0 = s.money;
    const r = advanceWeek(s, { actions: [buy('st_diner', { finance: true })] });
    expect(reconcile(r.report)).toEqual([]);
    const st = r.state;
    const o = spendOwned(st).find((x) => x.id === 'st_diner')!;
    expect(o.paid).toBe(spendPrice(s, it));
    const loan = st.spend!.loans!.find((l) => l.uid === o.uid)!;
    expect(loan.pay).toBe(f.pay);
    expect(m0 - st.money).toBeLessThan(spendPrice(s, it));
    const r2 = advanceWeek(st, {});
    expect(r2.state.spend!.loans!.find((l) => l.uid === o.uid)!.left).toBe(loan.left - loan.pay);
    expect(r2.report.lines.some((l) => l.label === 'The Store: your legitimate businesses' && l.amount > 0)).toBe(true);
    expect(r2.report.lines.some((l) => /^Payments: A diner/.test(l.label) && l.amount < 0)).toBe(true);
    // Four missed payments and they come for it.
    const broke = r2.state;
    broke.money = 0;
    broke.spend!.loans!.find((l) => l.uid === o.uid)!.missed = 3;
    const r3 = advanceWeek(broke, {});
    expect(spendOwned(r3.state).some((x) => x.uid === o.uid)).toBe(false);
    expect(r3.log.some((l) => /Repossessed/.test(l))).toBe(true);
  });

  it('equipment raises capacity, not demand: a bigger kitchen matters in July, not in January', () => {
    const s = rich('st-equip');
    s.date = { ...s.date, m: 7 };
    const st = advanceWeek(s, { actions: [buy('st_diner'), buy('st_kitchen')] }).state;
    const diner = SPEND_BY_ID.st_diner;
    const bare = advanceWeek(s, { actions: [buy('st_diner')] }).state;
    st.date = { ...st.date, m: 7 };
    bare.date = { ...bare.date, m: 7 };
    expect(bizCapacity(st, diner)).toBeGreaterThan(bizCapacity(bare, diner));
    expect(bizTake(st, diner)).toBeGreaterThan(bizTake(bare, diner));
    st.date = { ...st.date, m: 1 };
    bare.date = { ...bare.date, m: 1 };
    expect(bizTake(st, diner)).toBe(bizTake(bare, diner));
  });

  it('negotiate: the asking price, his floor, a counter, an insult; a buy at the agreed price', () => {
    const s = rich('st-haggle');
    const it = SPEND_BY_ID.st_waterfront;
    const list = spendPrice(s, it);
    const floor = haggleFloor(s, it);
    expect(floor).toBeLessThan(list);
    expect(counterOffer(s, it, list).ok).toBe(true);
    expect(counterOffer(s, it, floor).ok).toBe(true);
    const low = counterOffer(s, it, Math.round(floor * 0.95));
    expect(low.ok).toBe(false);
    expect(low.price).toBe(floor);
    expect(counterOffer(s, it, Math.round(list * 0.5)).price).toBe(list);
    expect(previewAction(s, buy('st_waterfront', { offer: Math.round(list * 0.5) })).disabledReason).toMatch(/won't take/);
    const st = advanceWeek(s, { actions: [buy('st_waterfront', { offer: floor })] }).state;
    expect(spendOwned(st).find((o) => o.id === 'st_waterfront')!.paid).toBe(floor);
    // Services and occasions are not haggled over.
    expect(counterOffer(s, SPEND_BY_ID.sp_maid, 10).ok).toBe(false);
  });

  it('gifts depend on the recipient: a greedy wife loves the stones, a wife who distrusts you barely moves', () => {
    const s = rich('st-gift');
    const { wife } = withWomen(s);
    const amount = (st: GameState) => (previewAction(st, buy('st_rubyring')).effects.find((e) => e.type === 'opinion' && e.from === wife.id) as { amount: number } | undefined)?.amount ?? 0;
    s.characters[wife.id].traits = [];
    const base = amount(s);
    expect(base).toBeGreaterThan(0);
    s.characters[wife.id].traits = ['Greedy'];
    expect(amount(s)).toBeGreaterThan(base);
    s.characters[wife.id].traits = [];
    addOpinion(s, wife.id, s.playerId, 'Betrayed', -90);
    expect(opinion(s, wife.id, s.playerId)).toBeLessThanOrEqual(-40);
    expect(amount(s)).toBeLessThan(base);
  });
});

describe('The Store: racing', () => {
  it('a horse runs at Monmouth; the result is recorded and the same seed gives the same race', () => {
    const run = () => {
      let s = rich('st-race');
      s.date = { ...s.date, m: 6 };
      s = advanceWeek(s, { actions: [buy('st_allowance'), buy('st_trainer')] }).state;
      s.date = { ...s.date, m: 7 };
      const h = runners(s).find((x) => x.id === 'st_allowance')!;
      expect(raceBlock(s, h.uid, 'mon_hcap')).toBeUndefined();
      expect(raceBlock(s, h.uid, 'sebring')).toMatch(/cars/);
      const a: PlayerAction = { kind: 'spend', op: { op: 'race', uid: h.uid, race: 'mon_hcap' }, fund: 'family' };
      expect(previewAction(s, a).disabledReason).toBeUndefined();
      const r = advanceWeek(s, { actions: [a] });
      expect(reconcile(r.report)).toEqual([]);
      return { rec: r.state.spend!.races![h.uid], log: r.log.filter((l) => /Monmouth|handicap/i.test(l)) };
    };
    const a = run();
    const b = run();
    expect(a.rec.starts).toBe(1);
    expect(a.rec.hist.length).toBe(1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('Sebring needs a race car and a team', () => {
    let s = rich('st-sebring');
    s.date = { ...s.date, m: 3 };
    s = advanceWeek(s, { actions: [buy('st_porsche718')] }).state;
    s.date = { ...s.date, m: 3 };
    const car = runners(s).find((x) => x.kind === 'car')!;
    expect(raceBlock(s, car.uid, 'sebring')).toMatch(/team/);
    s = advanceWeek(s, { actions: [buy('st_raceteam')] }).state;
    s.date = { ...s.date, m: 3 };
    expect(raceBlock(s, car.uid, 'sebring')).toBeUndefined();
  });
});

describe('Share the wealth', () => {
  it('rank: the capos get more than the soldiers; merit follows the earnings; widows and turkeys as asked', () => {
    const s = rich('st-share');
    const p = sharePlan(s, 10000, { crew: 60, widows: 0, church: 20, hood: 20 }, 'rank');
    const men = p.lines.filter((l) => l.kind === 'man');
    expect(men.length).toBe(crew(s).filter((c) => c.id !== s.playerId).length);
    expect(men.reduce((a, l) => a + l.amount, 0)).toBe(p.crew);
    const capo = capos(s)[0];
    const soldier = crew(s).find((c) => c.rank === 'soldier' || c.rank === 'associate');
    if (capo && soldier) expect(men.find((l) => l.id === capo.id)!.amount).toBeGreaterThan(men.find((l) => l.id === soldier.id)!.amount);
    expect(p.turkeys).toBeGreaterThan(0);
    expect(p.respect).toBeGreaterThan(0);
    expect(p.localHeat).toBeLessThanOrEqual(0);
    expect(p.loyalty).toBeGreaterThan(0);
    const noWidows = sharePlan(s, 10000, { crew: 50, widows: 50, church: 0, hood: 0 }, 'rank');
    expect(noWidows.widows === 0 || noWidows.lines.some((l) => l.kind === 'widow')).toBe(true);
  });

  it('one order: the men are paid into their own money, they think better of you, the books balance', () => {
    const s = rich('st-share2');
    const a: PlayerAction = { kind: 'spend', op: { op: 'share', total: 8000, split: { crew: 70, widows: 0, church: 15, hood: 15 }, by: 'rank', pot: 'family' } };
    const p = previewAction(s, a);
    expect(p.disabledReason).toBeUndefined();
    expect(p.effects.some((e) => e.type === 'respect')).toBe(true);
    const man = crew(s).find((c) => c.id !== s.playerId)!;
    const w0 = man.wealth;
    const o0 = opinion(s, man.id, s.playerId);
    const base = advanceWeek(s, {});
    const r = advanceWeek(s, { actions: [a] });
    expect(reconcile(r.report)).toEqual([]);
    expect(r.state.characters[man.id].wealth - base.state.characters[man.id].wealth).toBeGreaterThan(0);
    expect(opinion(r.state, man.id, s.playerId)).toBeGreaterThan(opinion(base.state, man.id, s.playerId));
    expect(base.state.money - r.state.money).toBeGreaterThanOrEqual(7000);
    void w0; void o0;
    expect(previewAction(s, { kind: 'spend', op: { op: 'share', total: 10_000_000, split: { crew: 100, widows: 0, church: 0, hood: 0 }, by: 'rank', pot: 'family' } }).disabledReason).toMatch(/Needs/);
  });
});

describe('The easy vacation planner', () => {
  it('the whole family: more people cost more, the crew come as guests, somebody minds the store', () => {
    const s = rich('st-vac');
    withWomen(s);
    const small = easyQuote(s, { destId: 'catskills', departIn: 1, nights: 4, tier: 'first', mode: 'train', picks: groupIds(s, ['wife']) });
    const all = groupIds(s, WHOLE_FAMILY);
    const big = easyQuote(s, { destId: 'catskills', departIn: 1, nights: 4, tier: 'first', mode: 'train', picks: all });
    expect(big.quote.cost).toBeGreaterThan(small.quote.cost);
    expect(big.plan.entourage).toBe(true);
    expect(big.perHead).toBeGreaterThan(0);
    expect(quoteTrip(s, big.plan).block ?? '').not.toMatch(/bodyguard|At most 8/);
    const home = whoMindsTheStore(s, []);
    const away = whoMindsTheStore(s, all);
    expect(away.risk).toBeGreaterThan(home.risk);
    expect(away.lines.join(' ')).toMatch(/minds the store|Nobody minds/);
  });

  it('wife and goomar both along: it gets wild; either one alone, it does not', () => {
    const s = rich('st-wild');
    const { wife, goomar } = withWomen(s);
    expect(wildOn(s, [wife.id, goomar.id])).toBe(true);
    expect(wildOn(s, [wife.id])).toBe(false);
    expect(wildOn(s, [goomar.id])).toBe(false);
    const plan = easyPlan(s, { destId: 'miamibeach', departIn: 0, nights: 4, tier: 'first', picks: [wife.id, goomar.id] });
    expect(plan.companionId).toBe(goomar.id);
    expect(plan.guests).toEqual([wife.id]);
    const trip = (party: string[], companionId?: string): Trip => ({
      id: `tripw${party.length}`, purpose: 'vacation', leaderId: s.playerId, party, guests: party.filter((x) => x !== companionId), companionId, driverIds: [], destId: 'miamibeach', mode: 'plane', tier: 'first', cars: 0,
      days: ['a', 'b', 'c', 'd'], departDay: s.week * 7, arriveDay: s.week * 7, leaveDay: s.week * 7 + 4, homeDay: s.week * 7 + 5, cost: 0, journal: [], done: 0, legs: [],
    });
    const both = trip([wife.id, goomar.id], goomar.id);
    const ctx = newCtx(s);
    const beats = [0, 1, 2, 3].map((d) => wildDay(ctx, both, d)).filter(Boolean);
    expect(beats.length).toBe(4);
    expect(both.vac?.wild).toBe(4);
    expect(both.journal.length).toBe(4);
    expect(wildDay(ctx, trip([wife.id]), 0)).toBeUndefined();
    expect(wildDay(ctx, trip([goomar.id], goomar.id), 0)).toBeUndefined();
    // Deterministic: the same trip and day, the same beat.
    const again = trip([wife.id, goomar.id], goomar.id);
    expect(wildDay(newCtx(s), again, 2)?.id).toBe(beats[2]!.id);
  });
});

describe('The Good Life folded into the Store', () => {
  it('an old save with Good Life things still loads, counts in the Store, and blocks a duplicate', () => {
    const s = rich('st-fold');
    const r = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'luxBuy', item: 'baymansion' }, fund: 'family' }, { kind: 'econ', op: { type: 'luxBuy', item: 'racehorse' }, fund: 'family' }] });
    const old = upgradeSave(JSON.parse(JSON.stringify(r.state)) as GameState);
    expect(old.econ!.goodLife!.map((o) => o.id)).toEqual(expect.arrayContaining(['baymansion', 'racehorse']));
    expect(ownedCount(old, 'st_mansion')).toBe(1);
    expect(spendBlock(old, SPEND_BY_ID.st_mansion)).toMatch(/already/i);
    // The old horse can race in the Store.
    expect(runners(old).some((x) => x.legacy)).toBe(true);
    // And a Store mansion blocks the old order.
    const s2 = advanceWeek(rich('st-fold2'), { actions: [buy('st_mansion')] }).state;
    expect(previewAction(s2, { kind: 'econ', op: { type: 'luxBuy', item: 'baymansion' } }).disabledReason).toMatch(/already/i);
  });

  it('a save with no Store state stays without one; NPC flexes are bounded', () => {
    let s = newGame('st-npc');
    expect(upgradeSave(JSON.parse(JSON.stringify(s))).store).toBeUndefined();
    for (const c of crew(s)) c.wealth = 200000;
    for (let i = 0; i < 30; i++) s = advanceWeek(s, {}).state;
    expect(s.spend).toBeUndefined();
    expect((s.store?.buys.length ?? 0)).toBeLessThanOrEqual(30);
    expect((s.store?.biz.length ?? 0)).toBeLessThanOrEqual(20);
    expect(s.store?.buys.length ?? 0).toBeGreaterThan(0);
  });
});

describe('The deep catalog (one structure for every purchase)', () => {
  it('every item answers the shared structure: category, years, where, model, costs, requirements, ownership, benefits, visibility, exit, hooks', () => {
    const s = rich('st-entry');
    for (const it of SPEND) {
      const e = catalogEntry(s, it);
      expect(STORE_TABS).toContain(e.category);
      expect(e.years[0], it.id).toBeLessThanOrEqual(e.years[1]);
      expect(e.where.length, it.id).toBeGreaterThan(2);
      expect(['buy', 'rent', 'lease', 'hire', 'subscribe', 'share']).toContain(e.model);
      expect(e.upfront, it.id).toBeGreaterThan(0);
      expect(e.recurring).toBeGreaterThanOrEqual(0);
      expect(['player', 'household', 'recipient', 'company', 'organization']).toContain(e.ownership);
      expect(e.exit.length, it.id).toBeGreaterThan(3);
      expect(Array.isArray(e.hooks)).toBe(true);
    }
    // Land, building, business and share are different things.
    expect(catalogEntry(s, SPEND_BY_ID.st_commlot).model).toBe('buy');
    expect(storeCard(s, SPEND_BY_ID.st_motelbldg).stake).toMatch(/building/i);
    expect(catalogEntry(s, SPEND_BY_ID.st_inv_controlling).model).toBe('share');
    expect(SPEND_BY_ID.st_inv_controlling.inv!.wants).toBeTruthy();
    expect(SPEND_BY_ID.st_inv_controlling.inv!.ctrl).toBe(true);
    expect(catalogEntry(s, SPEND_BY_ID.st_chauffeured).model).toBe('lease');
    expect(catalogEntry(s, SPEND_BY_ID.st_cpa).model).toBe('hire');
    // The categories of the design are stocked.
    for (const id of ['st_grocery', 'st_butcher', 'st_coffee', 'st_wholesale', 'st_beachrental', 'st_moviehouse', 'st_dancehall', 'st_musicvenue', 'st_downtownhotel', 'st_luxuryhotel', 'st_lounge', 'st_cabaret', 'st_tailor', 'st_jewelry', 'st_newspaper', 'st_bookkeeping', 'st_carservice', 'st_autorepair', 'st_coldstorage', 'st_fishing', 'st_charter', 'st_demolition', 'st_country', 'st_duesenberg', 'st_sailyacht', 'st_charterplane', 'st_railcar', 'st_europe', 'st_famdetail', 'st_mediator']) expect(SPEND_BY_ID[id], id).toBeDefined();
  });

  it('regulated businesses need qualified people; adult venues carry their conditions and are not legal everywhere, every decade', () => {
    const s = rich('st-quals');
    expect(spendBlock(s, SPEND_BY_ID.st_funeral)).toMatch(/mortician/);
    expect(spendBlock(s, SPEND_BY_ID.st_bookkeeping)).toMatch(/cpa/);
    const st = advanceWeek(s, { actions: [buy('st_mortician')] }).state;
    expect(spendBlock(st, SPEND_BY_ID.st_funeral)).toBeUndefined();
    const cab = SPEND_BY_ID.st_cabaret;
    expect(cab.adult!.voluntary).toBeTruthy();
    expect(cab.adult!.leave).toBeTruthy();
    expect(cab.adult!.pay).toBeTruthy();
    expect(spendBlock(s, cab)).toMatch(/1962/);
    expect(catalogEntry(s, cab).requirements.join(' ')).toMatch(/license/i);
  });

  it('ownership stays separate: the wife\'s jewelry is hers; a capo\'s business is his', () => {
    const s = rich('st-own');
    const { wife } = withWomen(s);
    const st = advanceWeek(s, { actions: [buy('st_earrings_w')] }).state;
    const o = spendOwned(st).find((x) => x.id === 'st_earrings_w')!;
    expect(o.holder).toBe(wife.id);
    expect(previewAction(st, { kind: 'spend', op: { op: 'sell', uid: o.uid } }).disabledReason).toMatch(/not yours/);
    expect(catalogEntry(st, SPEND_BY_ID.sp_captain).ownership).toBe('organization');
    expect(catalogEntry(st, SPEND_BY_ID.sp_eldorado).ownership).toBe('player');
  });

  it('presents wear thin when repeated, and after a betrayal they are sent back; styles impress some and irritate others', () => {
    let s = rich('st-gift2');
    const { wife } = withWomen(s);
    s.characters[wife.id].traits = [];
    const amt = (st: GameState, id: string) => (previewAction(st, buy(id)).effects.find((e) => e.type === 'opinion' && e.from === wife.id) as { amount: number } | undefined)?.amount ?? 0;
    const first = amt(s, 'st_rubyring');
    s = advanceWeek(s, { actions: [buy('st_rubyring'), buy('st_diamondnecklace')] }).state;
    s.characters[wife.id].traits = [];
    expect(amt(s, 'st_earrings_w')).toBeLessThan(SPEND_BY_ID.st_earrings_w.wife!);
    addOpinion(s, wife.id, s.playerId, 'He betrayed me', -100);
    addOpinion(s, wife.id, s.playerId, 'He lied to my face', -60);
    expect(opinion(s, wife.id, s.playerId)).toBeLessThanOrEqual(-60);
    expect(amt(s, 'st_earrings_w')).toBe(0);
    expect(first).toBeGreaterThan(0);
    const fl = previewAction(rich('st-style'), buy('st_sharkskin'));
    expect(fl.effects.some((e) => e.type === 'crewOpinion')).toBe(true);
  });

  it('soldiers buy smaller things with their own money; the bills warn the boss before they ruin him', () => {
    let s = newGame('st-npc2');
    for (const c of crew(s)) c.wealth = c.rank === 'soldier' || c.rank === 'associate' ? 50000 : 0;
    for (let i = 0; i < 40; i++) s = advanceWeek(s, {}).state;
    const buyers = (s.store?.buys ?? []).map(([, who]) => s.characters[who]?.rank);
    expect(buyers.some((r) => r === 'soldier' || r === 'associate')).toBe(true);
    let t = rich('st-strain');
    t = advanceWeek(t, { actions: [buy('st_yacht'), buy('sp_slip')] }).state;
    expect(t.spend!.owned.some((o) => o.id === 'st_yacht')).toBe(false); // needs the slip first
    t = advanceWeek(t, { actions: [buy('st_yacht')] }).state;
    t.money = 100;
    t.tribute!.acct.personal = 100;
    const r = advanceWeek(t, {});
    expect(r.log.some((l) => /quietly ask somebody for help/.test(l))).toBe(true);
  });
});
