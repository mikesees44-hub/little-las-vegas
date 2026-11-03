import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { newGameWith, type StartId } from '../src/engine/starts';
import { crew, player } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { applyEffects } from '../src/engine/effects';
import { previewAction } from '../src/engine/actions';
import { playSession } from '../src/engine/minigames';
import { pw } from '../src/engine/powerState';
import { upgradeSave } from '../src/engine/upgradeSave';
import { validateHierarchy } from '../src/engine/hierarchy';
import { REGISTRY_KEYS } from '../src/ui/shell/nav';
import { can, eventAllowed, lockedSections, rankBlock, rankWordOf, SECTION_CAP, stationOf, unlocksBetween } from '../src/engine/rankView';
import { above, aboveChart, aboveIds, callInBlock, chiefOf, donOf, placeSummary, queueCallIn } from '../src/engine/valente';
import { SCENE_ERRORS, SCENES_BY_ID } from '../src/engine/authored/library';
import { stationOk } from '../src/engine/authored/run';
import type { EventInstance, GameState, PlayerAction } from '../src/engine/types';

const LOW = ['associate', 'soldier', 'capo'] as const;
const BOSS_STARTS: StartId[] = ['classic', 'olddon', 'sees', 'rise'];
const BOSS_ONLY_SECTIONS = ['borgata.council', 'borgata.chain', 'diplomacy.table', 'diplomacy.warroom', 'town.cityhall', 'house.succession'];
const BOSS_ORDERS: PlayerAction[] = [
  { kind: 'appoint', seat: 'underboss', charId: 'x' },
  { kind: 'declareWar', rival: 'kessler', district: 'boardwalk' },
  { kind: 'raiseDispute', dispute: 'territory', rival: 'kessler', district: 'boardwalk' } as unknown as PlayerAction,
  { kind: 'edict', edict: 'omerta', on: true },
];

function ev(defId: string, meta?: EventInstance['meta']): EventInstance {
  return { iid: 'e1', defId, title: 't', text: 't', week: 1, choices: [], defaultChoiceId: 'x', mandatory: false, priority: 1, meta };
}

describe('low starts: honest rank', () => {
  for (const st of LOW) {
    it(`${st}: plays as ${st} in a real family above, with no boss-only seats or screens`, () => {
      const s = newGameWith(`low-${st}`, st);
      expect(stationOf(s)).toBe(st);
      const a = above(s)!;
      expect(a).toBeDefined();
      // The family above is real: the Don, an underboss, a consigliere, capos with men.
      expect(donOf(s)?.alive).toBe(true);
      expect(s.characters[a.underbossId!]?.alive).toBe(true);
      expect(s.characters[a.consigliereId!]?.alive).toBe(true);
      expect(a.capoIds.length).toBeGreaterThanOrEqual(2);
      for (const id of aboveIds(s)) expect(s.characters[id].faction).not.toBe('player');
      // Below capo he answers to a named capo.
      if (st !== 'capo') expect(chiefOf(s)?.id).toBe(a.myCapoId);
      // Nobody in his own crew outranks his station, blood or not.
      const allowed = st === 'capo' ? ['soldier', 'associate'] : ['associate'];
      for (const m of crew(s)) expect(allowed, `${m.firstName} is ${m.rank}`).toContain(m.rank);
      // No council: every seat is empty.
      for (const seat of Object.values(s.council)) expect(seat.holderId).toBeUndefined();
      // Boss-only screens, seats and orders are gated (not deleted).
      const locked = lockedSections(s, REGISTRY_KEYS);
      for (const k of BOSS_ONLY_SECTIONS) expect(locked, k).toContain(k);
      for (const o of BOSS_ORDERS) expect(rankBlock(s, o), o.kind).toMatch(/^When you're/);
      expect(previewAction(s, BOSS_ORDERS[0]).disabledReason).toMatch(/^When you're/);
      expect(can(s, 'council')).toBe(false);
      expect(eventAllowed(s, ev('bagman'))).toBe(false);
      expect(eventAllowed(s, ev('pack_x', { cat: 'rivals' }))).toBe(false);
      expect(eventAllowed(s, ev('low_short', { low: 1 }))).toBe(true);
      // Words: he is not called the boss.
      expect(rankWordOf(s, player(s))).toBe(st);
      // The opening is true to the rank.
      const open = s.pendingEvents.find((e) => e.defId === 'made_boss')!;
      expect(open.title).not.toMatch(/Made the boss/);
      expect(open.text).not.toMatch(/Philadelphia/);
      // The chart has the Don on top and YOU inside the family.
      const chart = aboveChart(s)!;
      expect(chart.id).toBe(a.bossId);
      expect(JSON.stringify(chart)).toContain(`"id":"${s.playerId}","role":"${st}","you":true`);
      expect(placeSummary(s)!.line).toMatch(new RegExp(st, 'i'));
      expect(validateHierarchy(s)).toEqual([]);
    });
  }

  it('the opening scene ends true to the rank, never "Made the boss"', () => {
    for (const st of LOW) {
      const s = newGameWith(`open-${st}`, st);
      const e = s.pendingEvents.find((x) => x.defId === 'made_boss')!;
      const ses = playSession(s, 'madeboss', e.iid, { variant: st, play: 1 });
      expect(ses.outcome!.title).not.toMatch(/boss/i);
      expect(ses.outcome!.text).not.toMatch(/sits in the chair/);
      for (const fx of ses.outcome!.effects) expect(fx.label ?? '').not.toMatch(/Made the boss/);
    }
  });

  it('boss starts are unchanged: everything open, no family above, the old opening', () => {
    for (const st of BOSS_STARTS) {
      const s = newGameWith(`boss-${st}`, st);
      expect(stationOf(s)).toBe('boss');
      expect(above(s)).toBeUndefined();
      expect(lockedSections(s, REGISTRY_KEYS)).toEqual([]);
      for (const o of BOSS_ORDERS) expect(rankBlock(s, o)).toBeUndefined();
      for (const d of ['bagman', 'tribute_audience', 'office_x', 'capo_men', 'dyn_proposal']) expect(eventAllowed(s, ev(d))).toBe(true);
      expect(rankWordOf(s, player(s))).toBe('boss');
      for (const k of Object.keys(SECTION_CAP)) expect(lockedSections(s, [k])).toEqual([]);
    }
    expect(newGameWith('boss-classic2', 'classic').pendingEvents.find((e) => e.defId === 'made_boss')?.title).toBe('Made the boss');
  });

  it('every rung unlocks something visible, up to the chair', () => {
    expect(unlocksBetween('associate', 'soldier').length).toBeGreaterThan(0);
    expect(unlocksBetween('soldier', 'capo').length).toBeGreaterThan(2);
    expect(unlocksBetween('capo', 'underboss').length).toBeGreaterThan(0);
    expect(unlocksBetween('underboss', 'boss').join(' ')).toMatch(/Table/);
  });
});

describe('low starts: the climb', () => {
  function apply(s: GameState, effects: EventInstance['choices'][number]['effects']): void {
    applyEffects(newCtx(s), effects, { label: 'test', because: 'test' });
  }

  it('an associate gets made: a sponsor, the standing, the open books, then the ceremony with him as the candidate', () => {
    const s = newGameWith('made-1', 'associate');
    const a = above(s)!;
    expect(callInBlock(s)).toMatch(/vouch/);
    a.sponsors.push(a.myCapoId!);
    a.standing = 90;
    s.books = { open: true, slots: 2, nextChange: s.week + 6 };
    pw(s).climbWeek = -99;
    expect(callInBlock(s)).toBeUndefined();
    queueCallIn(s);
    const e = s.pendingEvents.find((x) => x.defId === 'low_made')!;
    expect(e).toBeDefined();
    // Played through, the scene rolls the odds in the moment; force a yes with an overwhelming chance.
    const ses = playSession(s, 'getmade', e.iid, { play: 1, p: 95 }, {}, ['w_wait', 'next', 'look_sponsor', 'oath_steady', 'next', 'next']);
    expect(ses.done).toBe(true);
    if (ses.outcome!.tone === 'good') {
      apply(s, ses.outcome!.effects);
      expect(stationOf(s)).toBe('soldier');
      expect(s.chronicle.some((c) => /You can now/.test(c.text))).toBe(true);
    } else {
      expect(ses.outcome!.title).toMatch(/Not this time/);
    }
  });

  it('a soldier asks to move up: a sit-down with the odds on the table, and a capo\'s crew if it goes his way', () => {
    for (const seed of ['up-1', 'up-2', 'up-3', 'up-4']) {
      const s = newGameWith(seed, 'soldier');
      above(s)!.standing = 80;
      pw(s).climbWeek = -99;
      const climb = previewAction(s, { kind: 'power', op: { op: 'climb' } });
      expect(climb.disabledReason).toBeUndefined();
      expect(climb.acceptance).toBeUndefined();
      queueCallIn(s);
      const e = s.pendingEvents.find((x) => x.defId === 'low_callin')!;
      const ses = playSession(s, 'callin', e.iid, { play: 1, p: 95 }, {}, ['next', 'ask_straight', 'next']);
      expect(ses.done).toBe(true);
      apply(s, ses.outcome!.effects);
      if (ses.outcome!.tone === 'good') {
        expect(stationOf(s)).toBe('capo');
        expect(can(s, 'sitdown')).toBe(true);
        expect(can(s, 'council')).toBe(false);
        return;
      }
    }
    throw new Error('four sit-downs at 95% all said no');
  });

  it('the quota and the orders come down from above, and the week runs for every rank', () => {
    for (const st of LOW) {
      let s = newGameWith(`wk-${st}`, st);
      const seen: string[] = [];
      for (let i = 0; i < 10; i++) { s = advanceWeek(s, {}).state; seen.push(...s.pendingEvents.map((e) => e.defId)); }
      const a = above(s)!;
      expect(a.lastKick).toBeDefined();
      expect(a.orders).toBeGreaterThan(0);
      // The orders reach his desk as scenes, and no boss-only popup does.
      expect(seen.some((d) => d.startsWith('scene_low_')), `${st}: ${seen.join(',')}`).toBe(true);
      for (const d of seen) expect(eventAllowed(s, ev(d)), `${st}: ${d}`).toBe(true);
      expect(s.lastReport!.lines.some((l) => /Kick-up to/.test(l.label) && !/Philadelphia/.test(l.label))).toBe(true);
      expect(validateHierarchy(s)).toEqual([]);
    }
  });

  it('an old low save gets the family above at load, without moving the dice', () => {
    const s = newGameWith('old-low', 'associate');
    const old = cloneState(s);
    delete old.power!.above;
    // An old save: his brother still a capo under him.
    const bro = Object.values(old.characters).find((c) => c.alive && c.dynasty && c.id !== old.playerId && c.gender === 'M');
    if (bro) { bro.faction = 'player'; bro.rank = 'capo'; }
    const rng = old.rng;
    upgradeSave(old);
    expect(above(old)).toBeDefined();
    expect(old.rng).toBe(rng);
    for (const m of crew(old)) expect(m.rank).toBe('associate');
  });
});

describe('low starts: authored scenes', () => {
  it('the low-rank scenes validate and come up only at their ranks', () => {
    expect(SCENE_ERRORS).toEqual([]);
    const ids = Object.keys(SCENES_BY_ID).filter((id) => id.startsWith('low_'));
    expect(ids.length).toBeGreaterThanOrEqual(10);
    const s = newGameWith('auth-low', 'associate');
    const b = newGameWith('auth-boss', 'classic');
    for (const id of ids) {
      const sc = SCENES_BY_ID[id];
      expect(sc.when?.station, id).toBeDefined();
      expect(stationOk(b, sc), `${id} at a boss's desk`).toBe(sc.when!.station!.includes('boss'));
    }
    expect(ids.some((id) => stationOk(s, SCENES_BY_ID[id]))).toBe(true);
  });
});

describe('low starts: the shell', () => {
  it('an associate\'s homes show no boss-only places; they wait greyed under "Above your rank"; a boss\'s are untouched', async () => {
    const { splitByRank, rankHidden } = await import('../src/ui/shell/useShellState');
    const { NAV_TREE } = await import('../src/ui/shell/nav');
    const { HOME_IDS } = await import('../src/ui/shell/routes');
    const low = newGameWith('shell-low', 'associate');
    const boss = newGameWith('shell-boss', 'classic');
    for (const h of HOME_IDS) {
      const g = splitByRank(low, NAV_TREE[h]);
      const open = g.filter((x) => x.title !== 'Above your rank').flatMap((x) => x.items.flatMap((it) => it.keys));
      for (const k of BOSS_ONLY_SECTIONS) expect(open, `${h}: ${k}`).not.toContain(k);
      for (const it of g.find((x) => x.title === 'Above your rank')?.items ?? []) expect(it.locked).toMatch(/^When you're/);
      expect(splitByRank(boss, NAV_TREE[h])).toEqual(NAV_TREE[h].filter((x) => x.items.length));
    }
    expect(rankHidden(boss, 'borgata.place')).toBe(true);
    expect(rankHidden(low, 'borgata.place')).toBe(false);
  });
});

describe('low starts: the chair', () => {
  it('when the Don dies, an underboss takes the chair and the family becomes his; a capo gets to choose, with the odds', async () => {
    const { chairOpen, takeTheChair } = await import('../src/engine/valente');
    const { killCharacter } = await import('../src/engine/dynasty');
    const { capos: caposOf } = await import('../src/engine/characters');
    // The underboss.
    const s = newGameWith('chair-ub', 'capo');
    const ctx = newCtx(s);
    pw(s).station = 'underboss';
    const a = above(s)!;
    const fam = a.capoIds.filter((id) => s.characters[id].alive);
    killCharacter(ctx, a.bossId, 'a heart attack at the Bolero', 'none');
    chairOpen(ctx);
    expect(stationOf(s)).toBe('boss');
    expect(above(s)).toBeUndefined();
    expect(can(s, 'table')).toBe(true);
    for (const id of fam) expect(s.characters[id].faction).toBe('player');
    expect(caposOf(s).length).toBeGreaterThan(0);
    expect(validateHierarchy(s)).toEqual([]);
    expect(s.chronicle.some((c) => /You can now/.test(c.text))).toBe(true);
    // The capo: an event with the claim's odds and the underboss to back.
    const t = newGameWith('chair-capo', 'capo');
    const c2 = newCtx(t);
    killCharacter(c2, above(t)!.bossId, 'old age', 'none');
    chairOpen(c2);
    const e = t.eventQueue.find((x) => x.defId === 'low_chair')!;
    expect(e).toBeDefined();
    expect(e.choices.find((c) => c.id === 'claim')!.detail).toMatch(/%/);
    applyEffects(c2, e.choices.find((c) => c.id === 'back')!.effects, { label: 'test', because: 'test' });
    expect(stationOf(t)).toMatch(/capo|underboss/);
    expect(t.characters[above(t)!.bossId].alive).toBe(true);
    void takeTheChair;
  });
});
