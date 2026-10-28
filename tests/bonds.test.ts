import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { makeCharacter, player } from '../src/engine/characters';
import { ageOn } from '../src/engine/calendar';
import { newCtx } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { opinionBreakdown } from '../src/engine/relations';
import { startRomance } from '../src/engine/romance';
import { applyNightOp, nightRoster } from '../src/engine/nightlife';
import { isGoomar } from '../src/engine/goomar';
import { stageOf as datingStage } from '../src/engine/dating';
import { timeCost } from '../src/engine/timeCost';
import { upgradeSave } from '../src/engine/upgradeSave';
import { packSave, unpackSave } from '../src/ui/save';
import {
  annivWeek, applyBondOp, bondGroups, bondsWeek, computeStage, gesturesFor, godchildFor, kidsOf, previewBond, recallLine,
  registerGiftables, DEFAULT_GIFTABLES, voiceOf, wantNow, wantsMore, wifeDecides, wifeLeaning, wifeOf, type BondOp,
} from '../src/engine/bonds';
import type { Tie } from '../src/engine/bondsState';
import type { Character, GameState, PlayerAction } from '../src/engine/types';
import { YourPeople } from '../src/ui/bonds/YourPeople';
import { playWeeks } from './helpers';

const week = (s: GameState) => bondsWeek(newCtx(s));
const act = (s: GameState, op: BondOp) => { const ctx = newCtx(s); applyBondOp(ctx, op); return ctx; };
const tie = (s: GameState, id: string): Tie => s.bonds!.ties[id];

/** An adult woman the boss is seeing, made his goomar (her yes is forced here: the nightlife tests cover her decision). */
function goomar(s: GameState, pick = 0): Character {
  const boss = player(s);
  const pool = nightRoster(s, 'dancer').map((r) => s.characters[r.id]).filter((c) => !c.spouseId && !s.nightlife!.people[c.id].bounds.includes('no_married'));
  boss.orientation = 'straight';
  for (const her of pool.slice(pick)) {
    her.orientation = 'straight';
    startRomance(s, boss.id, her.id);
    applyNightOp(newCtx(s), { op: 'goomar', id: her.id, rent: 25, allowance: 75, where: 'an apartment on Atlantic Avenue' });
    if (isGoomar(s, her.id)) return her;
  }
  throw new Error('no goomar');
}

function aKid(s: GameState): Character {
  const k = godchildFor(s);
  if (k) return k;
  const boss = player(s);
  const c = makeCharacter(s, { gender: 'M', age: 2, rank: 'civilian', faction: 'none', nickname: false });
  c.fatherId = boss.id;
  c.dynasty = true;
  boss.childrenIds.push(c.id);
  return c;
}

describe('your people: the roster and the axes', () => {
  it('the wife, the kids, the crew and the enemies get cards with stages, axes, wants and a line', () => {
    const s = newGame('bonds-roster');
    week(s);
    const groups = bondGroups(s);
    const by = Object.fromEntries(groups.map((g) => [g.id, g.cards]));
    const wife = wifeOf(s)!;
    expect(by.wife[0].id).toBe(wife.id);
    expect(['solid', 'newlywed']).toContain(by.wife[0].stage);
    expect(by.kids.length).toBe(kidsOf(s).length);
    expect(by.crew.length).toBeGreaterThan(2);
    expect(by.rivals.length).toBeGreaterThan(0);
    for (const g of groups) for (const c of g.cards) {
      expect(c.axes.length).toBeGreaterThanOrEqual(5);
      for (const a of c.axes) { expect(a.v).toBeGreaterThanOrEqual(0); expect(a.v).toBeLessThanOrEqual(100); }
      expect(c.line.length).toBeGreaterThan(5);
      expect(c.wants.length).toBeGreaterThan(0);
      expect(c.gestures.length).toBeGreaterThan(0);
      for (const a of c.gestures) expect(previewAction(s, a).title.length).toBeGreaterThan(3);
    }
    // Attraction only where it belongs.
    expect(by.wife[0].axes.some((a) => a.key === 'attr')).toBe(true);
    expect(by.crew[0].axes.some((a) => a.key === 'attr')).toBe(false);
  });

  it('a date night raises her feelings and is remembered; neglect drifts them down and shows in her opinion', () => {
    const s = newGame('bonds-drift');
    week(s);
    const wife = wifeOf(s)!;
    const t = tie(s, wife.id);
    const aff0 = t.ax.aff;
    act(s, { op: 'date', id: wife.id });
    expect(t.ax.aff).toBeGreaterThan(aff0);
    expect(t.mem.some((m) => m.k === 'date')).toBe(true);
    expect(t.last).toBe(s.week);
    const high = t.ax.aff;
    for (let i = 0; i < 10; i++) { s.week++; week(s); }
    expect(t.ax.aff).toBeLessThan(high);
    expect(t.mem.some((m) => m.k === 'neglect')).toBe(true);
    expect(opinionBreakdown(s, wife.id, s.playerId).mods.some((m) => m.reason === 'Never has time for me' && m.value < 0)).toBe(true);
    expect(wantNow(s, t)?.text).toMatch(/Your time/);
    expect(voiceOf(s, t)).toMatch(/still live here/);
    // Attention again clears it.
    act(s, { op: 'date', id: wife.id });
    week(s);
    expect(opinionBreakdown(s, wife.id, s.playerId).mods.some((m) => m.reason === 'Never has time for me')).toBe(false);
  });

  it('stages follow the axes: wife cold, enemies grudge → enemy → nemesis, kids distant', () => {
    const s = newGame('bonds-stages');
    week(s);
    const wife = wifeOf(s)!;
    const t = tie(s, wife.id);
    t.ax.aff = 20;
    expect(computeStage(s, t)).toBe('cold');
    t.ax.aff = 40;
    expect(computeStage(s, t)).toBe('strained');
    const rival = Object.values(s.bonds!.ties).find((x) => x.role === 'rival')!;
    rival.ax.resent = 40; expect(computeStage(s, rival)).toBe('grudge');
    rival.ax.resent = 60; expect(computeStage(s, rival)).toBe('enemy');
    rival.ax.resent = 90; expect(computeStage(s, rival)).toBe('nemesis');
    const kid = tie(s, kidsOf(s)[0].id);
    kid.ax.aff = 20;
    expect(computeStage(s, kid)).toBe('distant');
  });
});

describe('your people: memories', () => {
  it('a missed anniversary is remembered, and brought up the next year it is missed', () => {
    const s = newGame('bonds-anniv');
    week(s);
    const wife = wifeOf(s)!;
    const t = tie(s, wife.id);
    t.since = -200;
    const aw = annivWeek(s, wife.id);
    s.week = aw + 52 + 2;
    week(s);
    expect(t.mem.filter((m) => m.k === 'missedAnniv').length).toBe(1);
    t.last = s.week;
    expect(voiceOf(s, t)).toMatch(/set the table/);
    s.week = aw + 104 + 2;
    t.last = s.week;
    week(s);
    expect(t.mem.filter((m) => m.k === 'missedAnniv').length).toBe(2);
    expect(voiceOf(s, t)).toBe('"You missed our anniversary last year too."');
    // The year he remembers: no new missed anniversary.
    s.week = aw + 156;
    const p = previewBond(s, { op: 'anniversary', id: wife.id });
    expect(p.disabledReason).toBeUndefined();
    expect(gesturesFor(s, wife.id).some((a) => a.kind === 'bond' && a.op.op === 'anniversary')).toBe(true);
    act(s, { op: 'anniversary', id: wife.id });
    s.week += 2;
    week(s);
    expect(t.mem.filter((m) => m.k === 'missedAnniv').length).toBe(2);
    expect(t.mem.some((m) => m.k === 'anniversary')).toBe(true);
    // Out of season it says why.
    s.week = aw + 156 + 20;
    expect(previewBond(s, { op: 'anniversary', id: wife.id }).disabledReason).toMatch(/Not your anniversary/);
  });

  it('memories are recalled in their words, the weightiest first, and capped', () => {
    const s = newGame('bonds-recall');
    week(s);
    const capo = Object.values(s.bonds!.ties).find((x) => x.role === 'crew')!;
    act(s, { op: 'fishing', id: capo.id });
    expect(recallLine(s, capo)).toMatch(/Remember the flounder/);
    expect(voiceOf(s, capo)).toMatch(/Remember the flounder off Hereford Inlet\? We should do that again/);
    for (let i = 0; i < 30; i++) { s.week++; act(s, { op: 'drink', id: capo.id }); }
    expect(capo.mem.length).toBeLessThanOrEqual(14);
    expect(capo.mem.some((m) => m.k === 'fishing')).toBe(true);
  });
});

describe('your people: the wife finds out', () => {
  it('suspicion → questions → a denial she may believe (and a lie remembered)', () => {
    const s = newGame('bonds-sus');
    week(s);
    goomar(s);
    const wife = wifeOf(s)!;
    const t = tie(s, wife.id);
    expect(previewBond(s, { op: 'deny', id: wife.id }).disabledReason).toMatch(/not asked/);
    t.sus = 34;
    week(s);
    expect(t.sus!).toBeGreaterThanOrEqual(35);
    expect(t.mem.some((m) => m.k === 'questions')).toBe(true);
    expect(voiceOf(s, t)).toMatch(/Where were you/);
    expect(previewBond(s, { op: 'deny', id: wife.id }).disabledReason).toBeUndefined();
    act(s, { op: 'deny', id: wife.id });
    expect(t.lied).toBe(true);
    expect(t.mem.some((m) => m.k === 'lie')).toBe(true);
  });

  it('she finds out, confronts him, and decides: confess', () => {
    const s = newGame('bonds-found');
    week(s);
    const her = goomar(s);
    const wife = wifeOf(s)!;
    s.nightlife!.goomars[her.id].wifeKnows = true;
    week(s);
    const t = tie(s, wife.id);
    expect(t.knows).toBe(s.week);
    expect(t.confront).toBe(s.week);
    expect(t.stage).toBe('strained');
    expect(voiceOf(s, t)).toMatch(/I know about her/);
    expect(wantNow(s, t)?.key).toBe('truth');
    const g = gesturesFor(s, wife.id).map((a) => (a as Extract<PlayerAction, { kind: 'bond' }>).op.op);
    expect(g.slice(0, 2)).toEqual(['confess', 'deny']);
    const lean = wifeLeaning(s, t, 'confess');
    expect(previewBond(s, { op: 'confess', id: wife.id }).warning).toMatch(/She decides/);
    act(s, { op: 'confess', id: wife.id });
    expect(t.confront).toBeUndefined();
    expect(t.mem.some((m) => m.k === 'confess')).toBe(true);
    expect(['stay', 'kids', 'leave']).toContain(lean);
    expect(['strained', 'cold', 'separated']).toContain(t.stage);
  });

  it('silence for two weeks: she decides on her own; stays for the kids, or leaves', () => {
    const s = newGame('bonds-silence');
    week(s);
    goomar(s);
    const wife = wifeOf(s)!;
    const t = tie(s, wife.id);
    t.sus = 100;
    s.nightlife!.goomars[Object.keys(s.nightlife!.goomars)[0]].wifeKnows = true;
    week(s);
    expect(t.confront).toBeDefined();
    // Middling feelings and young kids at home: she stays, for the kids.
    expect(kidsOf(s).some((k) => ageOn(k.birth, s.date) < 18)).toBe(true);
    Object.assign(t.ax, { aff: 25, trust: 30, resent: 30 });
    expect(wifeLeaning(s, t, 'silence')).toBe('kids');
    s.week += 2;
    t.last = s.week;
    week(s);
    expect(t.confront).toBeUndefined();
    expect(s.bonds!.stats.stayedForKids).toBe(1);
    expect(t.ax.aff).toBeLessThanOrEqual(22);
    expect(t.stage).toBe('cold');
    // Nothing left: she leaves (a separation, as romance.ts keeps it).
    const s2 = newGame('bonds-leave');
    week(s2);
    goomar(s2);
    const w2 = wifeOf(s2)!;
    const t2 = tie(s2, w2.id);
    Object.assign(t2.ax, { aff: 0, trust: 0, resent: 100 });
    expect(wifeDecides(newCtx(s2), t2, 'deny')).toBe('leave');
    expect(datingStage(s2, w2.id)).toBe('separated');
    expect(computeStage(s2, t2)).toBe('separated');
    expect(gesturesFor(s2, w2.id)[0]).toEqual({ kind: 'dating', op: { op: 'reconcile', id: w2.id } });
  });
});

describe('your people: the goomar', () => {
  it('kept → serious → ultimatum (leave your wife), a stall, then she stops waiting', () => {
    const s = newGame('bonds-ult');
    week(s);
    const her = goomar(s);
    week(s);
    const t = tie(s, her.id);
    expect(t.role).toBe('goomar');
    expect(t.stage).toBe('kept');
    s.nightlife!.goomars[her.id].since = s.week - 30;
    t.ax.aff = 85;
    expect(computeStage(s, t)).toBe('serious');
    t.stage = 'serious';
    // The ultimatum comes on its own when she wants more (her decision, rolled per week).
    if (wantsMore(s, her.id)) {
      for (let i = 0; i < 200 && t.ult === undefined; i++) { s.week++; t.last = s.week; t.ax.aff = 85; week(s); }
      expect(t.ult).toBeDefined();
    } else t.ult = s.week + 6;
    expect(computeStage(s, t)).toBe('ultimatum');
    expect(wantNow(s, t)?.text).toMatch(/leave your wife/);
    expect(voiceOf(s, t)).toMatch(/Her or me/);
    const ops = gesturesFor(s, her.id).map((a) => (a as Extract<PlayerAction, { kind: 'bond' }>).op);
    expect(ops.filter((o) => o.op === 'ultimatum').length).toBe(3);
    const due = t.ult!;
    act(s, { op: 'ultimatum', id: her.id, answer: 'stall' });
    expect(t.ult).toBe(due + 4);
    expect(t.stalled).toBe(true);
    expect(previewBond(s, { op: 'ultimatum', id: her.id, answer: 'stall' }).disabledReason).toMatch(/already asked/);
    s.week = t.ult!;
    t.last = s.week;
    week(s);
    expect(isGoomar(s, her.id)).toBe(false);
    expect(t.mem.some((m) => m.t.includes('stopped waiting'))).toBe(true);
    expect(s.bonds!.log.some(([, x]) => x.includes('stopped waiting'))).toBe(true);
  });

  it('leaving the wife for her is a separation; the wife remembers', () => {
    const s = newGame('bonds-leavewife');
    week(s);
    const her = goomar(s);
    const wife = wifeOf(s)!;
    week(s);
    tie(s, her.id).ult = s.week + 6;
    act(s, { op: 'ultimatum', id: her.id, answer: 'leave' });
    expect(datingStage(s, wife.id)).toBe('separated');
    expect(tie(s, wife.id).mem.some((m) => m.k === 'betrayal')).toBe(true);
    expect(tie(s, her.id).ult).toBeUndefined();
  });

  it('she is expecting: her decision; he says where he stands, once', () => {
    const s = newGame('bonds-baby');
    week(s);
    const her = goomar(s);
    const boss = player(s);
    s.romance!.pregnancies.push({ id: 'pg1', motherId: her.id, fatherId: boss.id, dueWeek: s.week + 30 });
    s.dating!.preg.push({ id: 'pg1', motherId: her.id, week: s.week, knownBy: [her.id, boss.id], tellAt: s.week });
    week(s);
    const t = tie(s, her.id);
    expect(t.preg).toBeDefined();
    expect(voiceOf(s, t)).toMatch(/I decided/);
    expect(previewBond(s, { op: 'baby', id: her.id, stance: 'support' }).detail).toMatch(/decided to have the baby/);
    const trust = t.ax.trust;
    act(s, { op: 'baby', id: her.id, stance: 'support' });
    expect(t.preg!.stance).toBe('support');
    expect(t.ax.trust).toBeGreaterThan(trust);
    expect(previewBond(s, { op: 'baby', id: her.id, stance: 'distance' }).disabledReason).toMatch(/already told/);
  });

  it('adults only: nothing romantic is offered or done with a child', () => {
    const s = newGame('bonds-adults');
    week(s);
    const kid = aKid(s);
    week(s);
    for (const op of ['attention', 'date', 'reassure', 'herFamily'] as const) {
      expect(previewBond(s, { op, id: kid.id }).disabledReason, op).toBeDefined();
    }
    const t = tie(s, kid.id);
    const before = JSON.stringify(t);
    act(s, { op: 'attention', id: kid.id });
    expect(JSON.stringify(t)).toBe(before);
    for (const a of gesturesFor(s, kid.id)) expect(['kidTime', 'gift', 'apologize']).toContain((a as Extract<PlayerAction, { kind: 'bond' }>).op.op);
  });
});

describe('your people: the men', () => {
  it('drinks, fishing and cards make a friend, then a best friend, then the compare', () => {
    const s = newGame('bonds-compare');
    week(s);
    const kid = aKid(s);
    const capo = Object.values(s.bonds!.ties).find((x) => x.role === 'crew')!;
    expect(capo.stage).toBe('acquaintance');
    expect(previewBond(s, { op: 'godfather', id: capo.id, kidId: kid.id }).disabledReason).toMatch(/Only a real friend/);
    const seen = new Set<string>();
    const ops = ['drink', 'fishing', 'cards'] as const;
    for (let i = 0; i < 16 && capo.stage !== 'best'; i++) { s.week++; act(s, { op: ops[i % 3], id: capo.id }); seen.add(capo.stage); }
    expect(seen.has('friend')).toBe(true);
    expect(capo.stage).toBe('best');
    expect(bondGroups(s).find((g) => g.id === 'friends')!.cards.some((c) => c.id === capo.id)).toBe(true);
    const p = previewBond(s, { op: 'godfather', id: capo.id, kidId: kid.id });
    expect(p.disabledReason).toBeUndefined();
    expect(p.acceptance!.chance).toBeGreaterThan(0.5);
    act(s, { op: 'godfather', id: capo.id, kidId: kid.id });
    expect(capo.stage).toBe('compare');
    expect(voiceOf(s, capo)).toMatch(/Compare!/);
    expect(opinionBreakdown(s, capo.id, s.playerId).mods.some((m) => m.reason === 'My compare')).toBe(true);
    // One godfather per child.
    const other = Object.values(s.bonds!.ties).find((x) => x.role === 'crew' && x.id !== capo.id)!;
    other.stage = 'best';
    expect(previewBond(s, { op: 'godfather', id: other.id, kidId: kid.id }).disabledReason).toMatch(/has a godfather/);
  });

  it('a confidant who knows too much can betray you; a loan comes due', () => {
    const s = newGame('bonds-betray');
    week(s);
    const capo = Object.values(s.bonds!.ties).find((x) => x.role === 'crew')!;
    capo.stage = 'friend';
    act(s, { op: 'confide', id: capo.id });
    expect(capo.knows2).toBe(s.week);
    act(s, { op: 'lend', id: capo.id, amount: 500 });
    expect(capo.loan).toEqual({ amount: 500, due: s.week + 8 });
    for (let i = 0; i < 9; i++) { s.week++; capo.last = s.week; capo.ax.resent = 0; week(s); }
    // The loan was settled one way or the other.
    expect(capo.loan).toBeUndefined();
    expect(capo.mem.some((m) => m.k === 'favor' || (m.k === 'loan' && m.v < 0))).toBe(true);
    capo.ax.resent = 80;
    const ev = player(s).evidence ?? 0;
    for (let i = 0; i < 400 && capo.role !== 'rival'; i++) { s.week++; capo.last = s.week; capo.ax.resent = Math.max(capo.ax.resent, 80); week(s); }
    expect(capo.role).toBe('rival');
    expect(s.bonds!.stats.betrayals).toBe(1);
    expect(player(s).evidence ?? 0).toBeGreaterThan(ev);
    expect(capo.mem.some((m) => m.k === 'betrayal')).toBe(true);
  });

  it('settling a beef: siding with one man is remembered by both', () => {
    const s = newGame('bonds-beef');
    week(s);
    const [a, b] = Object.values(s.bonds!.ties).filter((x) => x.role === 'crew');
    s.relations[`${a.id}>${b.id}`] = { from: a.id, to: b.id, modifiers: [], fear: 0, trust: 30, grievance: 40 };
    const g = gesturesFor(s, a.id).filter((x) => x.kind === 'bond' && x.op.op === 'settle');
    expect(g.length).toBe(3);
    act(s, { op: 'settle', id: a.id, other: b.id, side: 'him' });
    expect(a.mem.some((m) => m.k === 'beef' && m.v > 0)).toBe(true);
    expect(tie(s, b.id).mem.some((m) => m.k === 'fight' && m.v < 0)).toBe(true);
  });
});

describe('your people: orders, time, determinism, saves, the screen', () => {
  it('a gesture is an order: it takes hours, and the week carries it out', () => {
    expect(timeCost({ kind: 'bond', op: { op: 'date', id: 'x' } })).toBe(4);
    expect(timeCost({ kind: 'bond', op: { op: 'fishing', id: 'x' } })).toBe(5);
    expect(timeCost({ kind: 'bond', op: { op: 'drink', id: 'x' } })).toBe(1.5);
    let s = newGame('bonds-order');
    s = advanceWeek(s, {}).state;
    const wife = wifeOf(s)!;
    s = advanceWeek(s, { actions: [{ kind: 'bond', op: { op: 'date', id: wife.id } }] }).state;
    expect(tie(s, wife.id).mem.some((m) => m.k === 'date' || m.t.includes('turned down'))).toBe(true);
  });

  it('the gift hook: the shop can hand in its catalog', () => {
    const s = newGame('bonds-gift');
    week(s);
    const wife = wifeOf(s)!;
    registerGiftables([{ id: 'hat', label: 'A Lilly Daché hat', cost: 55, for: 'her', warmth: 7 }]);
    try {
      const p = previewBond(s, { op: 'gift', id: wife.id, item: 'hat' });
      expect(p.disabledReason).toBeUndefined();
      expect(p.cost).toBe(55);
      act(s, { op: 'gift', id: wife.id, item: 'hat' });
      expect(tie(s, wife.id).mem.some((m) => m.k === 'gift')).toBe(true);
    } finally { registerGiftables(DEFAULT_GIFTABLES); }
  });

  it('is deterministic', () => {
    const a = playWeeks('bonds-det', 14);
    const b = playWeeks('bonds-det', 14);
    expect(a.bonds).toBeDefined();
    expect(JSON.stringify(a.bonds)).toBe(JSON.stringify(b.bonds));
  });

  it('saves round-trip; upgradeSave changes nothing on a current save and adds nothing to an old one', () => {
    const s = playWeeks('bonds-save', 10);
    const json = JSON.stringify(s);
    expect(unpackSave(packSave(json))).toBe(json);
    const back = upgradeSave(JSON.parse(json));
    expect(JSON.stringify(back)).toBe(json);
    const old = JSON.parse(json) as GameState;
    delete old.bonds;
    expect(upgradeSave(old).bonds).toBeUndefined();
    // And the next week makes it.
    expect(advanceWeek(old, {}).state.bonds).toBeDefined();
  });

  it('the screen: cards with stage, bars, the side chip, what they want, gestures', () => {
    const s = newGame('bonds-ui');
    week(s);
    const html = renderToString(createElement(YourPeople, { s }));
    expect(html).toContain('data-testid="your-people"');
    expect(html).toContain('data-testid="bond-card"');
    expect(html).toContain('data-testid="bond-axes"');
    expect(html).toContain('data-testid="bond-stage"');
    expect(html).toContain('data-testid="side-chip"');
    expect(html).toContain('data-testid="bond-group-wife"');
    expect(html).toContain('data-testid="action-row"');
    // A game with no layer yet still renders (cards read from what the game knows).
    const fresh = newGame('bonds-ui-fresh');
    expect(renderToString(createElement(YourPeople, { s: fresh }))).toContain('data-testid="bond-card"');
    expect(fresh.bonds).toBeUndefined();
  });
});
