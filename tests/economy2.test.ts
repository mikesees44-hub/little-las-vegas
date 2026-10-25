import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { expectedTake } from '../src/engine/business';
import { CATALOG } from '../src/engine/catalog';
import { cloneState, advanceWeek } from '../src/engine/engine';
import { econActions, econWeek } from '../src/engine/econ';
import { ensureEcon } from '../src/engine/econState';
import { GIFTS, GIFTS_BY_ID, giftAvailable, giftOpinion, tastes, type GiftCat } from '../src/engine/gifts';
import { BUG_WEEKS, HQ_INFO, hqWeek } from '../src/engine/hq';
import { registerPermitAuthority } from '../src/engine/construction';
import { rankManagers } from '../src/engine/managers';
import { newCtx, reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { BUILD_STAGES, buildCost, buildWeeks, districtTilt, propertyNet, stageWeeks, USES, USES_BY_ID, ZONES, zoneSeason } from '../src/engine/property';
import { RACKET_TREES } from '../src/engine/rackets';
import { rand } from '../src/engine/rng';
import type { BusinessKind, GameState, PlayerAction } from '../src/engine/types';
import { randomChoices } from './helpers';

function rich(seed: string): GameState {
  const s = newGame(seed);
  s.money = 1_000_000;
  s.heat = { local: 0, family: 0, federal: 0 };
  return s;
}

describe('economy pillar: rackets and catalog', () => {
  it('every racket but narcotics has a 3–4 step upgrade tree', () => {
    for (const k of Object.keys(CATALOG) as BusinessKind[]) {
      if (CATALOG[k].category !== 'racket' || k === 'narcotics') continue;
      const t = RACKET_TREES[k];
      expect(t, k).toBeDefined();
      expect(t!.length, k).toBeGreaterThanOrEqual(3);
      expect(t!.length, k).toBeLessThanOrEqual(4);
    }
  });
  it('the 1970s kinds are not for sale in 1960', () => {
    const s = rich('70s');
    const p = previewAction(s, { kind: 'buyBusiness', biz: 'adulttheater', district: 'pacific' });
    expect(p.disabledReason).toMatch(/1970/);
  });
  it('nothing in the catalogs is explicit', () => {
    const text = JSON.stringify([CATALOG, USES, GIFTS]).toLowerCase();
    for (const w of ['sex', 'prostitut', 'porn', 'whore', 'hooker', 'traffick', 'nude', 'corleone', 'barzini', 'tattaglia']) expect(text).not.toContain(w);
  });
  it('an upgrade raises the take and is a named chip', () => {
    let s = rich('upgrade');
    s = advanceWeek(s, { actions: [{ kind: 'buyBusiness', biz: 'numbers', district: 'downtown' }] }).state;
    const b = s.businesses.find((x) => x.kind === 'numbers' && x.owner === 'player')!;
    const before = expectedTake(s, b);
    const a: PlayerAction = { kind: 'econ', op: { type: 'upgrade', bizId: b.id } };
    const p = previewAction(s, a);
    expect(p.disabledReason).toBeUndefined();
    expect(p.effects.every((e) => e.label || e.type === 'econ')).toBe(true);
    s = advanceWeek(s, { actions: [a] }).state;
    const b2 = s.businesses.find((x) => x.id === b.id)!;
    expect(s.econ!.rackets[b.id].tier).toBe(1);
    expect(s.econ!.rackets[b.id].runners).toBe(12);
    expect(expectedTake(s, b2)).toBeGreaterThan(before);
  });
});

describe('economy pillar: construction', () => {
  it('stage weeks always add up to the build time', () => {
    for (const total of [6, 7, 9, 13, 22, 52, 78]) {
      const w = stageWeeks(total);
      expect(BUILD_STAGES.reduce((a, st) => a + w[st], 0)).toBe(total);
      for (const st of BUILD_STAGES) expect(w[st]).toBeGreaterThanOrEqual(1);
    }
  });
  it('a building goes through every stage and opens exactly on schedule', () => {
    const s = rich('build');
    const e = ensureEcon(s);
    const lot = e.lots.find((l) => l.status === 'sale' && !l.use && l.zone === 'boardwalk') ?? e.lots.find((l) => l.status === 'sale' && !l.use)!;
    // Buy the land and break ground (through the real orders).
    const buy = previewAction(s, { kind: 'econ', op: { type: 'buyLot', lotId: lot.id } });
    expect(buy.disabledReason).toBeUndefined();
    let st = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'buyLot', lotId: lot.id } }] }).state;
    expect(st.econ!.lots.find((l) => l.id === lot.id)!.stage).toBe('purchase');
    st.heat = { local: 0, family: 0, federal: 0 };
    st.money = 1_000_000;
    const use = USES_BY_ID.icecream;
    const build: PlayerAction = { kind: 'econ', op: { type: 'build', lotId: lot.id, use: 'icecream' } };
    expect(previewAction(st, build).disabledReason).toBeUndefined();
    // Drive the economy layer week by week and record the stage each week.
    const w = cloneState(st);
    const ctx = newCtx(w);
    const l = w.econ!.lots.find((x) => x.id === lot.id)!;
    l.use = 'icecream';
    l.stage = 'permits';
    l.stageWeek = 0;
    l.inspected = ['framing', 'interior', 'fire']; // inspections are tested on their own
    const seen: string[] = [];
    let weeks = 0;
    while ((l.stage as string) !== 'open' && weeks < 100) {
      w.heat.local = 0;
      econWeek(ctx);
      w.week++;
      weeks++;
      seen.push(l.stage!);
    }
    expect(weeks).toBe(buildWeeks(l, use, w));
    // Every build stage was visited, in order.
    const order = [...new Set(['permits', ...seen])];
    expect(order).toEqual(['permits', 'siteprep', 'foundation', 'framing', 'exterior', 'interior', 'open']);
    expect(w.econ!.stats.built).toBe(1);
    // Stage costs are ledger lines.
    expect(ctx.lines.filter((x) => x.label.startsWith('Construction:')).length).toBe(BUILD_STAGES.length);
  });
  it('construction stalls without money and resumes when it comes', () => {
    const s = rich('stall');
    const e = ensureEcon(s);
    const l = e.lots.find((x) => x.status === 'sale' && !x.use)!;
    l.status = 'owned';
    l.owner = 'player';
    l.use = 'icecream';
    l.stage = 'permits';
    l.stageWeek = 0;
    s.money = 0;
    const ctx = newCtx(s);
    econWeek(ctx);
    expect(l.stalled).toMatch(/No money/);
    expect(l.stageWeek).toBe(0);
    s.money = 100000;
    econWeek(ctx);
    expect(l.stalled).toBeUndefined();
    expect(l.stage !== 'permits' || l.stageWeek === 1).toBe(true);
    expect(ctx.lines.some((x) => x.label.includes('survey & permits'))).toBe(true);
  });
});

describe('economy pillar: managers and the ledger', () => {
  it('a skimming manager takes money that never reaches the treasury; the ledger still reconciles', () => {
    let s = rich('skim');
    s = advanceWeek(s, { actions: [{ kind: 'buyBusiness', biz: 'laundromat', district: 'pacific' }] }).state;
    const b = s.businesses.find((x) => x.kind === 'laundromat' && x.owner === 'player')!;
    const e = ensureEcon(s);
    e.managers[b.id] = { source: 'pro', name: 'Sticky Fingers', skill: 50, loyalty: 20, honesty: 0, salary: 50, share: 0, oversight: 'hands_off', since: s.week, skimmed: 0 };
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const before = s;
      const take = expectedTake(before, before.businesses.find((x) => x.id === b.id)!);
      const skimBefore = before.econ!.managers[b.id]?.skimmed ?? 0;
      const r = advanceWeek(before, randomChoices(before, i));
      expect(reconcile(r.report)).toEqual([]);
      s = r.state;
      const m = s.econ!.managers[b.id];
      if (!m) break; // fired by an event: fine
      const skim = m.skimmed - skimBefore;
      const line = r.report.lines.find((x) => x.label === `Business: ${b.name}`);
      // A popup answered this week can move the district's control before the ledger runs (a choice with an
      // influence chip): the take is then the one for the state the economy actually ran on.
      const takeAfter = expectedTake(s, s.businesses.find((x) => x.id === b.id) ?? b);
      if (take > 0 && line) {
        expect([take, takeAfter]).toContain(line.amount + skim);
        expect(skim).toBeGreaterThan(0);
      }
      total += skim;
      expect(r.report.lines.some((x) => x.label.startsWith('Managers\' salaries'))).toBe(true);
    }
    expect(total).toBeGreaterThan(0);
  });
  it('an audit finds the skim and brings half of it back through the ledger', () => {
    let s = rich('audit');
    s = advanceWeek(s, { actions: [{ kind: 'buyBusiness', biz: 'laundromat', district: 'pacific' }] }).state;
    const b = s.businesses.find((x) => x.kind === 'laundromat' && x.owner === 'player')!;
    ensureEcon(s).managers[b.id] = { source: 'pro', name: 'Sticky Fingers', skill: 50, loyalty: 20, honesty: 10, salary: 50, share: 0, oversight: 'hands_off', since: s.week, skimmed: 1000 };
    const r = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'audit', key: b.id } }] });
    const line = r.report.lines.find((x) => x.label.startsWith('Audit at'));
    expect(line?.amount).toBe(500);
    expect(r.state.econ!.managers[b.id].found).toBeGreaterThanOrEqual(1000);
  });
});

describe('economy pillar: seasons by district', () => {
  it('the boardwalk booms in summer and dies in winter; South Philly does not care', () => {
    expect(zoneSeason('boardwalk', true)).toBeGreaterThan(2);
    expect(zoneSeason('boardwalk', false)).toBeLessThan(0.5);
    expect(zoneSeason('sphilly', true)).toBe(zoneSeason('sphilly', false));
    expect(zoneSeason('boardwalk', false, false)).toBe(1);
    // Over a year (15 summer weeks) every zone averages near 1.
    for (const z of ZONES) {
      const avg = (15 * z.season[0] + 37 * z.season[1]) / 52;
      expect(avg, z.id).toBeGreaterThan(0.8);
      expect(avg, z.id).toBeLessThan(1.3);
    }
  });
  it('the same ice cream parlor earns more on the boardwalk in July than in January', () => {
    const s = rich('season');
    const lot = { id: 'x', zone: 'boardwalk' as const, idx: 0, address: 'test', status: 'owned' as const, owner: 'player' as const, price: 0, rent: 0, use: 'icecream', stage: 'open' as const, condition: 100 };
    s.date = { y: 1960, m: 7, d: 15 };
    const summer = propertyNet(s, lot);
    s.date = { y: 1961, m: 1, d: 15 };
    const winter = propertyNet(s, lot);
    expect(summer.rev).toBeGreaterThan(winter.rev * 5);
    expect(winter.rev - winter.exp).toBeLessThan(0);
    const philly = { ...lot, zone: 'sphilly' as const, use: 'barber' };
    s.date = { y: 1960, m: 7, d: 15 };
    const a = propertyNet(s, philly);
    s.date = { y: 1960, m: 1, d: 15 };
    const b = propertyNet(s, philly);
    expect(a.rev).toBe(b.rev);
  });
  it('the district tilt on old businesses stays mild', () => {
    for (const z of ZONES) for (const on of [true, false]) {
      const t = districtTilt(z.district ?? 'none', on, true);
      expect(t).toBeGreaterThanOrEqual(0.92);
      expect(t).toBeLessThanOrEqual(1.08);
    }
  });
});

describe('economy pillar: gifts', () => {
  it('about 120 period gifts, and no Havana after 1959', () => {
    expect(GIFTS.length).toBeGreaterThanOrEqual(120);
    expect(giftAvailable(GIFTS_BY_ID.havana, 1960)).toBe(false);
    expect(giftAvailable(GIFTS_BY_ID.sixers, 1962)).toBe(false);
    expect(giftAvailable(GIFTS_BY_ID.sixers, 1963)).toBe(true);
    expect(giftAvailable(GIFTS_BY_ID.flyers, 1966)).toBe(false);
  });
  it('gift-taste opinion math: liked > neutral > 0 > the wrong gift', () => {
    const s = rich('gifts');
    const c = Object.values(s.characters).find((x) => x.alive && x.faction === 'player' && x.rank === 'capo')!;
    c.traits = c.traits.filter((t) => t !== 'Paranoid');
    const t = tastes(c);
    const price = 1000;
    const of = (cat: GiftCat) => ({ id: `t-${cat}`, name: 'test', cat, price });
    const neutralCat = (['car', 'fur', 'jewelry', 'watch', 'handbag', 'clothes', 'home', 'trip', 'sport', 'art', 'liquor', 'church', 'cash', 'leisure'] as GiftCat[]).find((x) => !t.likes.includes(x) && !t.dislikes.includes(x))!;
    const liked = giftOpinion(s, c, of(t.likes[0]), price);
    const neutral = giftOpinion(s, c, of(neutralCat), price);
    const wrong = giftOpinion(s, c, of(t.dislikes[0]), price);
    const base = Math.round(4 * Math.log(price / 50));
    expect(neutral.opinion).toBe(base);
    expect(liked.opinion).toBe(base + Math.round(base * 0.5) + 5);
    expect(wrong.opinion).toBeLessThan(0);
    expect(liked.fit).toBe(1);
    expect(wrong.fit).toBe(-1);
    expect(liked.opinion).toBeGreaterThan(neutral.opinion);
    // Too lavish for an associate: costs trust and a fifth of the goodwill.
    const assoc = Object.values(s.characters).find((x) => x.alive && x.faction === 'player' && x.rank === 'associate')!;
    assoc.traits = assoc.traits.filter((x) => x !== 'Paranoid');
    const ta = tastes(assoc);
    const cat = (['car', 'fur', 'jewelry', 'watch', 'handbag', 'clothes', 'home', 'trip', 'sport', 'art', 'liquor', 'church', 'cash', 'leisure'] as GiftCat[]).find((x) => !ta.likes.includes(x) && !ta.dislikes.includes(x))!;
    const cheap = giftOpinion(s, assoc, of(cat), 300);
    const big = giftOpinion(s, assoc, of(cat), 6000);
    expect(cheap.trust).toBeGreaterThan(0);
    expect(big.trust).toBeLessThan(0);
    expect(big.reasons.some((r) => r.label.startsWith('Too much'))).toBe(true);
  });
  it('a gift through the ledger moves opinion and trust and is recorded', () => {
    const s = rich('give');
    const c = Object.values(s.characters).find((x) => x.alive && x.faction === 'player' && x.rank === 'capo')!;
    const a: PlayerAction = { kind: 'econ', op: { type: 'gift', giftId: 'coupedeville', to: c.id } };
    const p = previewAction(s, a);
    expect(p.disabledReason).toBeUndefined();
    const r = advanceWeek(s, { actions: [a] });
    expect(r.report.lines.some((x) => x.label.startsWith('Gift: Cadillac Coupe de Ville') && x.amount < 0)).toBe(true);
    expect(r.state.econ!.gifts.length).toBe(1);
  });
  it('season tickets pass to the heir', () => {
    let s = rich('tickets');
    const boss = s.characters[s.playerId];
    const kid = boss.childrenIds.map((id) => s.characters[id]).find((k) => k?.alive);
    if (!kid) return;
    const e = ensureEcon(s);
    const other = Object.values(s.characters).find((x) => x.alive && x.dynasty && x.childrenIds.some((id) => s.characters[id]?.alive) && x.id !== s.playerId) ?? boss;
    e.tickets.push({ team: 'eagles', holderId: other.id, since: 1, box: false });
    other.alive = false;
    // The month turns over.
    for (let i = 0; i < 6; i++) s = advanceWeek(s, randomChoices(s, i)).state;
    const t = s.econ!.tickets.find((x) => x.team === 'eagles');
    expect(t).toBeDefined();
    expect(s.characters[t!.holderId].alive).toBe(true);
  });
});

describe('economy pillar: headquarters', () => {
  it('a bug adds evidence to everyone who talks at the HQ, every week, until it is pulled', () => {
    const s = rich('bug');
    const e = ensureEcon(s);
    e.hq.kind = 'social';
    e.hq.bug = { week: s.week, source: 'technician', leaked: 0 };
    const boss = s.characters[s.playerId];
    const capo = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'capo' && (c.imprisonedUntil ?? 0) <= s.week)!;
    boss.evidence = 0;
    capo.evidence = 0;
    const ctx = newCtx(s);
    for (let i = 0; i < 10; i++) {
      hqWeek(ctx, () => undefined);
      s.week++;
    }
    expect(boss.evidence).toBe(Math.floor(HQ_INFO.social.boss * 10 + 1e-9));
    expect(capo.evidence).toBe(Math.floor(HQ_INFO.social.capo * 10 + 1e-9));
    expect(e.hq.bug!.leaked).toBeGreaterThan(0);
    // Talking outside: only the boss, and far less.
    e.hq.kind = 'walk';
    const b0 = boss.evidence!;
    const c0 = capo.evidence!;
    for (let i = 0; i < 10; i++) {
      hqWeek(ctx, () => undefined);
      s.week++;
    }
    expect(boss.evidence! - b0).toBeLessThanOrEqual(2);
    expect(capo.evidence).toBe(c0);
    // The Feds pull it eventually.
    s.week = e.hq.bug!.week + BUG_WEEKS;
    hqWeek(ctx, () => undefined);
    expect(e.hq.bug).toBeUndefined();
  });
  it('a sweep can find the bug', () => {
    let found = 0;
    for (let i = 0; i < 12; i++) {
      const s = rich(`sweep${i}`);
      ensureEcon(s).hq.bug = { week: s.week, source: 'warrant', leaked: 0 };
      const r = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'sweep' } }] });
      if (!r.state.econ!.hq.bug) found++;
    }
    expect(found).toBeGreaterThan(4);
  });
});

describe('economy pillar: random play', () => {
  it('two years of economy orders: no crash, the ledger always reconciles, things get built', () => {
    let built = 0;
    for (const seed of ['econ-a', 'econ-b']) {
      let s = newGame(seed);
      s.money += 30000;
      const h = { rng: 99 };
      for (let i = 0; i < 104 && !s.gameOver; i++) {
        const acts = econActions(s).filter((a) => !previewAction(s, a).disabledReason);
        const pick = acts.length ? [acts[Math.floor(rand(h) * acts.length)]] : [];
        const r = advanceWeek(s, { ...randomChoices(s, i), actions: pick });
        expect(reconcile(r.report)).toEqual([]);
        s = r.state;
      }
      built += s.econ!.stats.built + s.econ!.stats.lotsBought;
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
    expect(built).toBeGreaterThan(0);
  });
});

describe('economy pillar: permits, inspections, the supply chain, the town', () => {
  it('a build waits on the inspector and the zoning commission; a favor clears both', () => {
    let s = rich('permit');
    const e = ensureEcon(s);
    const l = e.lots.find((x) => x.status === 'sale' && !x.use)!;
    l.status = 'owned';
    l.owner = 'player';
    l.stage = 'purchase';
    s = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'build', lotId: l.id, use: 'duplex' } }] }).state;
    const l2 = s.econ!.lots.find((x) => x.id === l.id)!;
    expect(l2.stage).toBe('permits');
    expect(l2.permit).toBeDefined();
    if ((l2.permit!.zoning || l2.permit!.inspector) && s.favors > 0) {
      s = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'permits', lotId: l.id } }] }).state;
      expect(s.econ!.lots.find((x) => x.id === l.id)!.stage).not.toBe('permits');
    }
  });
  it('the permit authority is pluggable (an official of yours pushes zoning through)', () => {
    const s = rich('puppet');
    const e = ensureEcon(s);
    const l = e.lots.find((x) => x.status === 'sale' && !x.use)!;
    l.status = 'owned';
    l.owner = 'player';
    l.stage = 'permits';
    l.use = 'duplex';
    l.permit = { zoning: 3, inspector: 0 };
    const a: PlayerAction = { kind: 'econ', op: { type: 'puppetPermit', lotId: l.id } };
    expect(previewAction(s, a).disabledReason).toMatch(/No official/);
    const boss = s.characters[s.playerId];
    registerPermitAuthority(() => ({ zoning: 'the commission', waits: () => ({ zoning: 3, inspector: 1 }), puppet: () => boss }));
    try {
      expect(previewAction(s, a).disabledReason).toBeUndefined();
    } finally {
      registerPermitAuthority(undefined);
    }
  });
  it('a failed inspection is a stop-work order that holds the site until it is lifted', () => {
    const s = rich('stop');
    const e = ensureEcon(s);
    const l = e.lots.find((x) => x.status === 'sale' && !x.use)!;
    Object.assign(l, { status: 'owned', owner: 'player', use: 'duplex', stage: 'framing', stageWeek: 1, stopWork: { weeks: 3, reason: 'test' } });
    const ctx = newCtx(s);
    econWeek(ctx);
    expect(l.stageWeek).toBe(1);
    expect(l.stalled).toMatch(/Stop-work/);
    const r = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'fixCode', lotId: l.id } }] });
    expect(r.state.econ!.lots.find((x) => x.id === l.id)!.stopWork).toBeUndefined();
    expect(r.report.lines.some((x) => x.label.startsWith('Fix the code'))).toBe(true);
  });
  it('owning the supply chain makes your builds cheaper and faster', () => {
    const s = rich('supply');
    s.businesses = s.businesses.filter((b) => !['construction', 'concrete', 'lumber', 'trucking'].includes(b.kind));
    const l = ensureEcon(s).lots.find((x) => x.status === 'sale' && !x.use)!;
    const u = USES_BY_ID.apartments;
    const c0 = buildCost(l, u, s);
    const w0 = buildWeeks(l, u, s);
    for (const k of ['construction', 'concrete', 'lumber', 'trucking'] as const) s.businesses.push({ id: `t-${k}`, name: k, kind: k, districtId: 'downtown', owner: 'player', weeklyBase: 100, upkeep: 0, heat: 0 });
    expect(buildCost(l, u, s)).toBeLessThan(c0 * 0.75);
    expect(buildWeeks(l, u, s)).toBeLessThan(w0);
  });
  it('the town builds on its own: years later the lots fill in, the Crest gets its motels', () => {
    let s = newGame('town');
    const vacant0 = s.econ!.lots.filter((l) => !l.use).length;
    for (let i = 0; i < 160; i++) s = advanceWeek(s, randomChoices(s, i)).state;
    const e = s.econ!;
    expect(e.stats.npcBuilt).toBeGreaterThan(3);
    expect(e.lots.filter((l) => !l.use).length).toBeLessThan(vacant0);
    expect(e.lots.some((l) => l.zone === 'crest' && l.use === 'motel' && (l.started ?? 0) >= 1960)).toBe(true);
  });
  it('a rival bidding on the same lot can outbid you', () => {
    const s = rich('outbid');
    const e = ensureEcon(s);
    const l = e.lots.find((x) => x.status === 'sale')!;
    l.bidder = 'manno';
    const p = previewAction(s, { kind: 'econ', op: { type: 'buyLot', lotId: l.id } });
    expect(p.acceptance).toBeDefined();
    expect(p.acceptance!.reasons.some((r) => r.label.includes('deep pockets'))).toBe(true);
    expect(p.refuseEffects?.some((x) => x.type === 'econ')).toBe(true);
  });
});

describe('economy pillar: the crew suggests a manager', () => {
  it('ranks candidates best first, by expected weekly gain', () => {
    const s = rich('rank');
    const picks = rankManagers(s, 'test-key', 400);
    expect(picks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < picks.length; i++) expect(picks[i - 1].value).toBeGreaterThanOrEqual(picks[i].value);
    expect(picks.some((p) => p.source === 'pro')).toBe(true);
  });
});
