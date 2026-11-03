import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { actNow } from '../src/engine/actNow';
import { previewAction } from '../src/engine/actions';
import { campaignPressure } from '../src/engine/army';
import { capos } from '../src/engine/characters';
import { stake } from '../src/engine/cities';
import { applyEffects } from '../src/engine/effects';
import { newCtx } from '../src/engine/ledger';
import { timeCost } from '../src/engine/timeCost';
import { upgradeSave } from '../src/engine/upgradeSave';
import { SCENES_BY_ID } from '../src/engine/authored/library';
import { tryScene } from '../src/engine/authored/run';
import {
  applyOcOp, buildRaidEvent, caseMargin, ensureOc, leverOn, ocPressure, ocWeek, raidEscape, raidOdds, seizeOdds, supplies, type OcAction,
} from '../src/engine/oceanCity';
import type { Business, GameState, PlayerAction } from '../src/engine/types';
import { OceanCityPanel } from '../src/ui/econ/OceanCity';

const SUMMER = { y: 1960, m: 7, d: 15 };
const WINTER = { y: 1961, m: 1, d: 15 };

function game(seed = 'oc-a'): GameState {
  const s = newGame(seed);
  s.money = 60000;
  s.week = 12;
  s.date = { ...SUMMER };
  return s;
}

/** A bar of the family's to supply the run. */
function withBar(s: GameState): Business {
  const have = supplies(s)[0];
  if (have) return have;
  const b: Business = { id: `b${s.nextId++}`, name: 'The Shamrock', kind: 'bar', districtId: s.districts[0].id, owner: 'player', weeklyBase: 150, upkeep: 50, heat: 0 };
  s.businesses.push(b);
  return b;
}

const oc = (op: OcAction): PlayerAction => ({ kind: 'oc', op });

describe('Ocean City: the run', () => {
  it('needs a supply and a runner; starts in the moment, with a result and a line in Your File', () => {
    const s = game();
    s.businesses = s.businesses.filter((b) => !['bootleg', 'bar', 'club', 'supperclub', 'hoodclub', 'gentsclub', 'restaurant'].includes(b.kind));
    expect(previewAction(s, oc({ op: 'run', route: 'causeway', supply: 'nope', runner: s.playerId })).disabledReason).toMatch(/bar/);
    const bar = withBar(s);
    const k = capos(s)[0];
    const a = oc({ op: 'run', route: 'causeway', supply: bar.id, runner: k.id });
    const p = previewAction(s, a);
    expect(p.disabledReason).toBeUndefined();
    expect(p.detail).toMatch(/seized \d+% of weeks/);
    expect(timeCost(a, s)).toBeGreaterThan(0);
    const r = actNow(s, a);
    expect(r.result.ok).toBe(true);
    expect(r.state.oc?.run?.runner).toBe(k.id);
    expect(r.state.flags.oc_run).toBe(1);
    expect(r.state.flags.oc_run_causeway).toBe(1);
    expect(r.state.money).toBeLessThan(s.money);
    expect(r.state.journal?.e.some((e) => e.src === 'order' && /Ocean City/.test(e.t))).toBe(true);
  });

  it('pays more in the Season; a capo keeps his end and kicks up; a seizure has teeth', () => {
    const s = game();
    const bar = withBar(s);
    expect(caseMargin(s)).toBeGreaterThan(caseMargin({ ...s, date: WINTER }));
    const k = capos(s)[0];
    const o = ensureOc(s);
    o.run = { route: 'boat', supply: bar.id, runner: k.id, since: s.week, earned: 0, seized: 0 };
    const w0 = k.wealth;
    let seized = 0;
    for (let i = 0; i < 30; i++) {
      const ctx = newCtx(s);
      const before = o.run.seized;
      ocWeek(ctx);
      if (o.run.seized > before) { seized++; expect(ctx.lines.some((l) => /seized/.test(l.label))).toBe(true); }
    }
    expect(o.run.earned).toBeGreaterThan(0);
    expect(s.characters[k.id].wealth).toBeGreaterThan(w0);
    expect(o.stats.take).toBe(o.run.earned);
    expect(seized).toBe(o.stats.seized);
    // The causeway is riskier than the bay; the commissioner on the envelope makes it safer.
    expect(seizeOdds(s, 'causeway').p).toBeGreaterThan(seizeOdds(s, 'boat').p);
    const before = seizeOdds(s, 'causeway').p;
    o.stance = 'bought';
    expect(seizeOdds(s, 'causeway').p).toBeLessThan(before);
  });
});

describe('Ocean City: the speakeasy and the raid', () => {
  it('build behind a front, upgrade it, the raid is a decision with odds; a tip-off raises them, a crusade lowers them', () => {
    let s = game();
    s = actNow(s, oc({ op: 'build', front: 'church' })).state;
    expect(s.oc?.easy?.front).toBe('church');
    expect(s.flags.oc_easy).toBe(1);
    const r0 = raidOdds(s).p;
    s = actNow(s, oc({ op: 'upgrade', up: 'door' })).state;
    expect(raidOdds(s).p).toBeLessThan(r0);
    s = actNow(s, oc({ op: 'upgrade', up: 'exit' })).state;
    expect(previewAction(s, oc({ op: 'upgrade', up: 'exit' })).disabledReason).toBe('Already done');
    const base = raidEscape(s, 'back').p;
    s.oc!.tip = s.week + 4;
    expect(raidEscape(s, 'back').p).toBeGreaterThan(base);
    s.oc!.tip = undefined;
    s.oc!.crusade = s.week + 4;
    expect(raidEscape(s, 'back').p).toBeLessThan(base);
    const ev = buildRaidEvent(s);
    expect(ev.mandatory).toBe(true);
    expect(ev.choices.find((c) => c.id === 'back')!.label).toMatch(/\(\d+%\)/);
    // Let them take it: certain, closed four weeks.
    const ctx = newCtx(s);
    const ride = ev.choices.find((c) => c.id === 'ride')!;
    applyEffects(ctx, ride.effects, { label: ride.label, because: ride.because, category: 'event' });
    expect(s.oc!.easy!.closedUntil).toBe(s.week + 4);
    expect(s.flags.oc_raided).toBe(1);
    // Closed: no take.
    const m = s.money;
    const c2 = newCtx(s);
    ocWeek(c2);
    expect(c2.lines.some((l) => /Speakeasy: /.test(l.label) && l.amount > 0)).toBe(false);
    expect(s.money).toBeLessThanOrEqual(m);
  });

  it('a raid comes when the odds say so, and the speakeasy earns when it does not', () => {
    const s = game();
    ensureOc(s).easy = { front: 'fudge', name: 'Back of the fudge shop', ups: ['band'], since: s.week, earned: 0, raids: 0 };
    s.oc!.board = 100;
    let raids = 0;
    for (let i = 0; i < 40 && !raids; i++) {
      ocWeek(newCtx(s));
      raids = s.eventQueue.filter((e) => e.defId === 'oc_raid').length;
    }
    expect(raids).toBe(1);
    expect(s.oc!.easy!.earned).toBeGreaterThan(0);
  });
});

describe('Ocean City: the commissioner', () => {
  it('buy (odds shown), dig (the secrets system), squeeze (a hook); a refusal has teeth', () => {
    const s = game();
    const buy = previewAction(s, oc({ op: 'buy' }));
    expect(buy.acceptance?.chance).toBeGreaterThan(0);
    expect(buy.acceptance?.reasons.length).toBeGreaterThan(1);
    // Refused: the board hears.
    const ctx = newCtx(s);
    ensureOc(s);
    const b0 = s.oc!.board;
    applyEffects(ctx, buy.refuseEffects!, { label: 'x', because: 'x', category: 'event' });
    expect(s.oc!.board).toBeGreaterThan(b0);
    expect(previewAction(s, oc({ op: 'squeeze' })).disabledReason).toMatch(/nothing on him/);
    // Dig until something turns up.
    let t = s;
    for (let i = 0; i < 12 && !leverOn(t); i++) { t.week += 1; t = actNow(t, oc({ op: 'dig' })).state; }
    expect(leverOn(t)).toBeTruthy();
    expect(t.secrets.some((x) => x.ownerId === t.oc!.batten && x.knownBy.includes('player'))).toBe(true);
    let u = t;
    for (let i = 0; i < 12 && u.oc!.stance !== 'hooked'; i++) { u.week += 1; u = actNow(u, oc({ op: 'squeeze' })).state; }
    expect(u.oc!.stance).toBe('hooked');
    expect(u.hooks.some((h) => h.targetId === u.oc!.batten && h.strong)).toBe(true);
  });

  it('the wet referendum is a loud six-week fight; a wet town is legal', () => {
    let s = game();
    withBar(s);
    s = actNow(s, oc({ op: 'vote' })).state;
    expect(s.oc!.vote).toBeTruthy();
    expect(s.oc!.crusade).toBeGreaterThan(s.week);
    expect(s.news.some((n) => /LIQUOR/.test(n.headline))).toBe(true);
    for (let i = 0; i < 7 && s.oc!.vote; i++) { ocWeek(newCtx(s)); s.week += 1; }
    expect(s.oc!.vote).toBeUndefined();
    s.oc!.stance = 'wet';
    expect(seizeOdds(s, 'causeway').p).toBe(0);
    expect(raidOdds(s).p).toBe(0);
  });
});

describe('Ocean City: the rivals, the scenes, the map, the save', () => {
  it('Atlantic City or Philadelphia want a piece; told no, they lean toward a campaign', () => {
    const s = game();
    const bar = withBar(s);
    const o = ensureOc(s);
    o.run = { route: 'boat', supply: bar.id, runner: s.playerId, since: 0, earned: 50000, seized: 0 };
    for (let i = 0; i < 60 && !o.rival; i++) ocWeek(newCtx(s));
    const ev = s.eventQueue.find((e) => e.defId === 'oc_rival')!;
    expect(ev).toBeTruthy();
    const who = o.rival!.who;
    const no = ev.choices.find((c) => c.id === 'no')!;
    expect(no.effects.some((e) => e.type === 'schedule' && e.key === 'retaliation')).toBe(true);
    applyEffects(newCtx(s), no.effects, { label: no.label, because: no.because, category: 'event' });
    expect(ocPressure(s, who)).toBeGreaterThan(0);
    expect(campaignPressure(s, who).reasons.some((r) => /Ocean City/.test(r.label))).toBe(true);
    applyOcOp(newCtx(s), { op: 'rival', who, how: 'piece' });
    expect(ocPressure(s, who)).toBe(0);
  });

  it('four scenes in scenes/ocean_city.json, cast from the flags; the flags they set come back', () => {
    for (const id of ['oc_minister_son', 'oc_raid_night', 'oc_causeway_storm', 'oc_commissioner_case']) expect(SCENES_BY_ID[id], id).toBeTruthy();
    const s = game();
    expect(tryScene(s, 'oc_commissioner_case')).toBeUndefined();
    s.flags.oc_run = 1;
    expect(tryScene(s, 'oc_commissioner_case')?.choices.length).toBe(3);
    ensureOc(s);
    s.flags.oc_batten_photo = 1;
    ocWeek(newCtx(s));
    expect(s.flags.oc_batten_photo).toBeUndefined();
    expect(leverOn(s)).toMatch(/photograph/);
  });

  it('the map knows; an old save is topped up; the panel renders; a week turns with it all running', () => {
    let s = game();
    const bar = withBar(s);
    s = actNow(s, oc({ op: 'run', route: 'causeway', supply: bar.id, runner: capos(s)[0].id })).state;
    s = actNow(s, oc({ op: 'build', front: 'fountain' })).state;
    expect(stake(s, 'oceancity')).toMatch(/liquor run/);
    const html = renderToString(createElement(OceanCityPanel, { s, open: true }));
    expect(html).toContain('data-testid="oc-run"');
    expect(html).toContain('data-testid="oc-batten"');
    const old = structuredClone(s);
    delete (old.oc as { log?: unknown }).log;
    upgradeSave(old);
    expect(old.oc!.log).toEqual([]);
    const next = advanceWeek(s).state;
    expect(next.oc!.stats.take + next.oc!.stats.seized).toBeGreaterThan(0);
  });
});
