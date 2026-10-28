import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { advanceWeek } from '../src/engine/engine';
import { perkMod } from '../src/engine/lifestyle';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { opinion } from '../src/engine/relations';
import {
  declaredWeekly, giftableItems, irsCost, lavishness, reqTargets, spendBlock, spendOwned, spendPrice, spendResale, spendTags, spendUpkeepByPot,
} from '../src/engine/spend';
import { SPEND, SPEND_BY_ID, SPEND_CATS, spendHours } from '../src/engine/spendData';
import { timeCost } from '../src/engine/timeCost';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { GameState, PlayerAction } from '../src/engine/types';
import { SpendPanel } from '../src/ui/econ/SpendPanel';

const buy = (item: string): PlayerAction => ({ kind: 'spend', op: { op: 'buy', item }, fund: 'family' });
const pocket = (s: GameState) => s.tribute?.acct.personal ?? 0;

function rich(seed: string): GameState {
  const s = newGame(seed);
  s.money = 500000;
  s.tribute!.acct.personal = 300000;
  return s;
}

describe('Spend: the catalog', () => {
  it('is deep (well over 120 things), every line sane', () => {
    expect(SPEND.length).toBeGreaterThan(120);
    expect(new Set(SPEND.map((x) => x.id)).size).toBe(SPEND.length);
    const tags = new Set([...SPEND.flatMap((x) => x.unl ?? []), 'car', 'boat', 'bigboat', 'florida', 'horse']);
    for (const it of SPEND) {
      expect(it.price, it.id).toBeGreaterThan(0);
      expect(it.up, it.id).toBeGreaterThanOrEqual(0);
      expect(it.flash, it.id).toBeGreaterThanOrEqual(0);
      expect(it.flash, it.id).toBeLessThanOrEqual(10);
      expect(it.blurb.length, it.id).toBeGreaterThan(10);
      if (it.kind === 'svc') expect(it.up, `${it.id}: a retainer costs every week`).toBeGreaterThan(0);
      for (const n of it.needs ?? []) expect(tags.has(n), `${it.id} needs ${n}, which nothing gives`).toBe(true);
      for (const m of it.months ?? []) expect(m >= 1 && m <= 12, it.id).toBe(true);
      if (it.minYear && it.maxYear) expect(it.minYear).toBeLessThanOrEqual(it.maxYear);
    }
    for (const c of SPEND_CATS) expect(SPEND.filter((x) => x.cat === c).length, c).toBeGreaterThanOrEqual(5);
    expect(SPEND.filter((x) => x.pot === 'pocket').length).toBeGreaterThan(60);
    expect(SPEND.filter((x) => x.pot === 'family').length).toBeGreaterThan(25);
    // The ones the boss asked for by name.
    for (const id of ['sp_eldorado', 'sp_continental', 'sp_imperial', 'sp_tbird', 'sp_corvette', 'sp_300sl', 'sp_rolls', 'sp_armor', 'sp_driver', 'sp_runabout', 'sp_sportfisher', 'sp_slip', 'sp_plane', 'sp_camel', 'sp_patek', 'sp_shelter', 'sp_colortv', 'sp_club', 'sp_roof', 'sp_littleleague', 'sp_feast', 'sp_racehorse', 'sp_wedding', 'sp_sixteen', 'sp_vegas', 'sp_judge', 'sp_bailfund', 'sp_safehouse', 'sp_stash', 'sp_xmasbonus', 'sp_turkeys', 'sp_funeral', 'sp_widows']) expect(SPEND_BY_ID[id], id).toBeDefined();
  });

  it('is period: a color TV is rare and costly in 1960, the suicide-door Lincoln waits for 1961, Havana closes, bonuses wait for December', () => {
    const s = rich('sp-period');
    expect(s.date.y).toBe(1960);
    const tv = SPEND_BY_ID.sp_colortv;
    expect(spendBlock(s, tv)).toBeUndefined();
    expect(tv.stock).toBeLessThanOrEqual(3);
    expect(spendPrice(s, tv)).toBeGreaterThan(spendPrice(s, SPEND_BY_ID.sp_tv));
    expect(spendBlock(s, SPEND_BY_ID.sp_continental)).toMatch(/1961/);
    expect(spendBlock({ ...s, date: { ...s.date, y: 1962 } }, SPEND_BY_ID.sp_havana)).toMatch(/1960/);
    s.date = { ...s.date, m: 6 };
    expect(spendBlock(s, SPEND_BY_ID.sp_xmasbonus)).toMatch(/December/);
    s.date = { ...s.date, m: 12 };
    expect(spendBlock(s, SPEND_BY_ID.sp_xmasbonus)).toBeUndefined();
    // Per head: the bonus grows with the crew.
    expect(spendPrice(s, SPEND_BY_ID.sp_xmasbonus)).toBeGreaterThanOrEqual(300);
    expect(spendHours('sp_vegas')).toBe(10);
    expect(timeCost(buy('sp_wedding'))).toBe(4);
    expect(timeCost(buy('sp_beatcops'))).toBe(0.5);
  });

  it('exposes a gift catalog for other systems: things for a wife, a goomar, daughters', () => {
    const all = giftableItems();
    expect(all.length).toBeGreaterThan(15);
    expect(giftableItems(undefined, 'wife').some((g) => g.id === 'sp_mink')).toBe(true);
    expect(giftableItems(undefined, 'goomar').some((g) => g.for === 'goomar')).toBe(true);
    const s = newGame('sp-gifts');
    expect(giftableItems(s).every((g) => g.price > 0)).toBe(true);
  });
});

describe('Spend: buying', () => {
  it('a Cadillac: the pocket pays, respect and the family move, the IRS counts, upkeep every week after', () => {
    const s = rich('sp-caddy');
    s.businesses = s.businesses.filter((b) => b.owner !== 'player');
    const before = { pocket: pocket(s), family: s.money, respect: s.respect, fed: s.heat.federal };
    const p = previewAction(s, buy('sp_eldorado'));
    expect(p.disabledReason).toBeUndefined();
    expect(p.pot).toBe('pocket');
    expect(p.effects.some((e) => e.type === 'familyOpinion')).toBe(true);
    expect(p.effects.some((e) => e.type === 'heat' && e.bar === 'federal')).toBe(true);
    const r = advanceWeek(s, { actions: [buy('sp_eldorado')] });
    expect(reconcile(r.report)).toEqual([]);
    const st = r.state;
    expect(spendOwned(st).map((o) => o.id)).toContain('sp_eldorado');
    expect(pocket(st)).toBeLessThan(pocket(advanceWeek(s, {}).state) - 7000);
    expect(before.pocket).toBeGreaterThan(0);
    expect(st.heat.federal).toBeGreaterThanOrEqual(before.fed);
    expect(spendTags(st).has('car')).toBe(true);
    expect(st.spend!.irs).toBeGreaterThan(0);
    // One of a kind for the house: a second needs the limit (2 for the Eldorado), a third is refused.
    const p2 = advanceWeek(st, { actions: [buy('sp_eldorado')] }).state;
    expect(spendBlock(p2, SPEND_BY_ID.sp_eldorado)).toMatch(/already/i);
    // Upkeep from the pocket, named.
    const r3 = advanceWeek(p2, {});
    const books = r3.state.tribute!.books.find((b) => b.week === r3.report.week)!;
    expect(books.x.some((x) => x[0] === 'personal' && /^Spend: upkeep/.test(x[4] ?? ''))).toBe(true);
    // A car loses value.
    const later = { ...r3.state, date: { ...r3.state.date, y: r3.state.date.y + 4 } };
    const car = spendOwned(later).find((o) => o.id === 'sp_eldorado')!;
    expect(spendResale(later, car)).toBeLessThan(car.paid * 0.5);
  });

  it('the Family pays for the pad and the crew; the captain cools local heat, bodyguards make you harder to kill', () => {
    const s = rich('sp-pad');
    const guard0 = perkMod(s, 'guard');
    const lh0 = perkMod(s, 'localHeat');
    const r = advanceWeek(s, { actions: [buy('sp_captain'), buy('sp_bodyguards')] });
    const st = r.state;
    expect(perkMod(st, 'guard')).toBe(guard0 + 15);
    expect(perkMod(st, 'localHeat')).toBe(lh0 + 1);
    const up = spendUpkeepByPot(st);
    expect(up.family).toBeGreaterThan(100);
    expect(up.pocket).toBeGreaterThan(200);
    // The pad is Family money: the treasury pays it, by name.
    const r2 = advanceWeek(st, {});
    expect(r2.report.lines.some((l) => l.label === 'Spend: the pad, retainers and upkeep' && l.amount < 0)).toBe(true);
    // Let him go: no more upkeep.
    const cap = spendOwned(r2.state).find((o) => o.id === 'sp_captain')!;
    const r3 = advanceWeek(r2.state, { actions: [{ kind: 'spend', op: { op: 'sell', uid: cap.uid } }] });
    expect(spendOwned(r3.state).some((o) => o.id === 'sp_captain')).toBe(false);
  });

  it('jewelry for your wife moves her; a stash sells back at full value into the pot that paid', () => {
    const s = rich('sp-wife');
    const wife = reqTargets(s, 'spouse')[0];
    if (wife) {
      const o0 = opinion(s, wife.id, s.playerId);
      const st = advanceWeek(s, { actions: [buy('sp_anniv')] }).state;
      expect(opinion(st, wife.id, s.playerId)).toBeGreaterThan(o0);
    } else {
      expect(spendBlock(s, SPEND_BY_ID.sp_anniv)).toMatch(/wife/);
    }
    const st = advanceWeek(s, { actions: [buy('sp_stash')] }).state;
    const o = spendOwned(st).find((x) => x.id === 'sp_stash')!;
    expect(o.pot).toBe('family');
    expect(spendResale(st, o)).toBe(o.paid);
    const m0 = st.money;
    const st2 = advanceWeek(st, { actions: [{ kind: 'spend', op: { op: 'sell', uid: o.uid } }] }).state;
    expect(spendOwned(st2).some((x) => x.id === 'sp_stash')).toBe(false);
    expect(st2.money - m0).toBeGreaterThan(o.paid - 20000); // the stash comes back (other weekly flows aside)
  });

  it('a boat opens boat things; one-of-a-kind items sell out', () => {
    const s = rich('sp-boat');
    expect(spendBlock(s, SPEND_BY_ID.sp_watersit)).toMatch(/boat/);
    const st = advanceWeek(s, { actions: [buy('sp_runabout'), buy('sp_300sl')] }).state;
    expect(spendBlock(st, SPEND_BY_ID.sp_watersit)).toBeUndefined();
    expect(st.spend!.gone.sp_300sl).toBe(1);
    // Sell it, and it's still gone: the only one on the island went once.
    const o = spendOwned(st).find((x) => x.id === 'sp_300sl')!;
    const st2 = advanceWeek(st, { actions: [{ kind: 'spend', op: { op: 'sell', uid: o.uid } }] }).state;
    expect(spendBlock(st2, SPEND_BY_ID.sp_300sl)).toMatch(/Sold out/);
  });
});

describe('Spend: the IRS counts', () => {
  it('flash with nothing to explain it draws more heat than the same buy with fronts and an accountant', () => {
    const bare = rich('sp-irs');
    bare.businesses = bare.businesses.filter((b) => b.owner !== 'player');
    const covered = advanceWeek(bare, { actions: [buy('sp_carlot'), buy('sp_vending'), buy('sp_accountant')] }).state;
    expect(declaredWeekly(covered)).toBeGreaterThan(declaredWeekly(bare) + 200);
    const rolls = SPEND_BY_ID.sp_rolls;
    const a = irsCost(bare, rolls);
    const b = irsCost(covered, rolls);
    expect(a.heat).toBeGreaterThan(0);
    expect(a.pressure).toBeGreaterThan(b.pressure);
    expect(a.heat).toBeGreaterThanOrEqual(b.heat);
    // The feds already watching make the same purchase look worse.
    const hot = { ...bare, heat: { ...bare.heat, federal: 80 } };
    const caddy = SPEND_BY_ID.sp_eldorado;
    expect(irsCost(hot, caddy).pressure).toBeGreaterThan(irsCost(bare, caddy).pressure);
  });

  it('living past the declared income builds pressure week by week, and ends in a net-worth audit', () => {
    let s = rich('sp-audit');
    s.businesses = s.businesses.filter((b) => b.owner !== 'player');
    s = advanceWeek(s, { actions: [buy('sp_rolls'), buy('sp_stoneharbor'), buy('sp_bodyguards'), buy('sp_chinchilla')] }).state;
    expect(lavishness(s)).toBeGreaterThan(1.2);
    s.spend!.irs = 20;
    s = advanceWeek(s, {}).state;
    expect(s.spend!.irs).toBeGreaterThan(20);
    const a0 = s.spend!.audits;
    s.spend!.irs = 99.5;
    const pocket0 = pocket(s) + s.money;
    const fed0 = s.heat.federal;
    const r = advanceWeek(s, {});
    expect(r.state.spend!.audits).toBe(a0 + 1);
    expect(r.state.spend!.irs).toBeLessThan(60);
    expect(pocket(r.state) + r.state.money).toBeLessThan(pocket0);
    expect(r.state.heat.federal).toBeGreaterThan(fed0 - 5);
    expect(r.log.some((l) => /net-worth audit/.test(l))).toBe(true);
    // A respectable return brings the pressure down.
    const st = r.state;
    st.spend!.irs = 50;
    const st2 = advanceWeek(st, { actions: [buy('sp_taxreturn')] }).state;
    expect(st2.spend!.irs).toBeLessThan(25);
  });
});

describe('Spend: determinism and saves', () => {
  const plan = (s: GameState) => [buy('sp_cardgame'), buy('sp_track'), buy('sp_maid'), buy('sp_beatcops'), buy('sp_suit')].filter((a) => !previewAction(s, a).disabledReason);

  it('the same seed and the same orders give the same game (bets, sell-outs, the IRS)', () => {
    const run = () => {
      let s = rich('sp-det');
      s.date = { ...s.date, m: 7 };
      for (let i = 0; i < 6; i++) s = advanceWeek(s, { actions: plan(s) }).state;
      return s;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a.spend)).toBe(JSON.stringify(b.spend));
    expect(a.money).toBe(b.money);
    expect(pocket(a)).toBe(pocket(b));
  });

  it('round-trips through a save; upgradeSave leaves a save without Spend alone', () => {
    let s = rich('sp-save');
    s = advanceWeek(s, { actions: [buy('sp_eldorado'), buy('sp_captain')] }).state;
    const back = JSON.parse(JSON.stringify(s)) as GameState;
    expect(back.spend).toEqual(s.spend);
    const up = upgradeSave(back);
    expect(up.spend).toEqual(s.spend);
    const x = advanceWeek(s, {}).state;
    const y = advanceWeek(up, {}).state;
    expect(JSON.stringify(y.spend)).toBe(JSON.stringify(x.spend));
    expect(y.money).toBe(x.money);
    const fresh = newGame('sp-old');
    expect(fresh.spend).toBeUndefined();
    expect(upgradeSave(JSON.parse(JSON.stringify(fresh))).spend).toBeUndefined();
    // No purchase, no state: the week does not invent one.
    expect(advanceWeek(fresh, {}).state.spend).toBeUndefined();
  });
});

describe('Spend: the screen', () => {
  it('shows both pots apart, the IRS gauge, filters and the whole catalog', () => {
    const s = rich('sp-ui');
    const st = advanceWeek(s, { actions: [buy('sp_eldorado'), buy('sp_captain')] }).state;
    const html = renderToString(createElement(SpendPanel, { s: st }));
    expect(html).toContain('data-testid="spend-pot-pocket"');
    expect(html).toContain('data-testid="spend-pot-family"');
    expect(html).toContain('data-testid="spend-irs"');
    expect(html).toContain('data-testid="spend-search"');
    expect(html).toContain('data-testid="spend-cats"');
    expect(html).toContain('data-testid="spend-owned"');
    expect(html.split('data-testid="spend-row"').length - 1).toBeGreaterThan(120);
  });
});
