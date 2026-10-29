import { describe, expect, it } from 'vitest';
import { ageOn } from '../src/engine/calendar';
import { displayName, player } from '../src/engine/characters';
import { advanceSpan, advanceWeek, SEASON_WEEKS } from '../src/engine/engine';
import { killCharacter } from '../src/engine/dynasty';
import { validateHierarchy } from '../src/engine/hierarchy';
import { newCtx, reconcile } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { SCENE_ERRORS, SCENES_BY_ID } from '../src/engine/authored/library';
import { castScene } from '../src/engine/authored/run';
import { attackEstimate, claimStrengths, HOSTILE_ROLES, LOYAL_ROLES, pressurePoints } from '../src/engine/oldDon';
import { newGameWith } from '../src/engine/starts';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { GameState, PlayerAction } from '../src/engine/types';

const OD_SCENES = ['od_birthday', 'od_consigliere_warning', 'od_sal_envoy', 'od_young_proposal', 'od_wife_heard', 'od_goomar_brother', 'od_sunday_dinner'];

function play(s: GameState, weeks: number): GameState {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    const r = advanceWeek(s, {});
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
  }
  return s;
}

describe('The Old Don (1960)', () => {
  it('sets up an old, rich, loved Don of the house of Sees with ten years in the chronicle', () => {
    const s = newGameWith('od-setup', 'olddon');
    const boss = player(s);
    expect(displayName(boss)).toBe('Vincenzo "the Old Man" Sees');
    expect(s.houseName).toBe('Sees');
    expect(ageOn(boss.birth, s.date)).toBeGreaterThanOrEqual(65);
    expect(boss.traits).toEqual(expect.arrayContaining(['Womanizer', 'Drinker']));
    expect(s.money).toBeGreaterThanOrEqual(60000);
    expect(s.tribute!.acct.personal).toBeGreaterThanOrEqual(200000);
    expect(s.respect).toBeGreaterThanOrEqual(60);
    expect(s.edicts.nojunk).toBe(true);
    const past = s.chronicle.filter((e) => e.date.y >= 1950 && e.date.y <= 1959);
    expect(past.length).toBe(10);
    expect(boss.childrenIds.map((id) => s.characters[id].firstName)).toEqual(['Paolo', 'Teresa', 'Nicky']);
    expect(s.businesses.some((b) => b.name === 'The Sees Motor Inn' && b.owner === 'player')).toBe(true);
    expect(Object.values(s.nightlife!.goomars).filter((g) => !g.ended).length).toBeGreaterThanOrEqual(1);
    expect(s.aging!.p[boss.id].t.heart).toBe(2);
    expect(validateHierarchy(s)).toEqual([]);
  });

  it('deals hidden hands: at least three really hostile, the loyal ones loyal, and varied by seed', () => {
    const patterns = new Set<string>();
    for (const seed of ['od-a', 'od-b', 'od-c', 'od-d', 'od-e', 'od-f']) {
      const s = newGameWith(seed, 'olddon');
      const od = s.oldDon!;
      const hostile = od.hands.filter((h) => HOSTILE_ROLES.includes(h.role) && h.real);
      const loyal = od.hands.filter((h) => LOYAL_ROLES.includes(h.role) && !h.real);
      expect(hostile.length, seed).toBeGreaterThanOrEqual(3);
      expect(loyal.length, seed).toBeGreaterThanOrEqual(2);
      // Hidden: nothing proven at the start, and some hands not even whispered.
      expect(od.hands.every((h) => h.know < 3)).toBe(true);
      expect(od.hands.some((h) => h.know === 0)).toBe(true);
      // Real plans in the minds: the ambitious capo wants the chair.
      const capo = od.hands.find((h) => h.role === 'capo')!;
      expect(s.minds!.minds[capo.id!].amb?.k).toMatch(/chair|capo/);
      patterns.add(od.hands.map((h) => `${h.role}${h.real ? 1 : 0}`).join(','));
    }
    expect(patterns.size).toBeGreaterThan(2);
  });

  it('puts pressure on the desk within the first four weeks', () => {
    let s = newGameWith('od-pressure', 'olddon');
    expect(pressurePoints(s).length).toBeGreaterThanOrEqual(3);
    expect(s.threats!.tips.length).toBeGreaterThanOrEqual(1);
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      s = play(s, 1);
      for (const e of s.pendingEvents) seen.add(e.defId);
    }
    expect([...seen].filter((d) => d.startsWith('scene_od_')).length).toBeGreaterThanOrEqual(2);
  });

  it('fogs the size of the coming move: rumors give a range, intel narrows it toward the truth', () => {
    const s = newGameWith('od-fog', 'olddon');
    const a = attackEstimate(s);
    expect(a.hi).toBeGreaterThan(a.lo);
    for (const h of s.oldDon!.hands) h.know = 3;
    const b = attackEstimate(s);
    expect(b.intel).toBeGreaterThan(a.intel);
    expect(b.hi - b.lo).toBeLessThan(a.hi - a.lo);
    expect(b.real).toBeGreaterThanOrEqual(b.lo);
    expect(b.real).toBeLessThanOrEqual(b.hi);
  });

  it('authored scenes are valid and cast with the hands\' own people', () => {
    expect(SCENE_ERRORS).toEqual([]);
    for (const id of OD_SCENES) expect(SCENES_BY_ID[id], id).toBeDefined();
    const s = newGameWith('od-scenes', 'olddon');
    for (const a of s.oldDon!.agenda) {
      const cast = castScene(s, SCENES_BY_ID[a.scene], a.cast);
      expect(cast, a.scene).toBeDefined();
      for (const [k, v] of Object.entries(a.cast)) expect(cast![k]).toBe(v);
    }
  });

  it('claim strengths for every claimant: blood, backing, Philadelphia, money, respect', () => {
    const s = newGameWith('od-claims', 'olddon');
    const cs = claimStrengths(s);
    const paolo = cs.find((c) => c.name.startsWith('Paolo'));
    expect(paolo).toBeDefined();
    expect(paolo!.parts.find((p) => p.label === 'Blood')!.value).toBe(25);
    expect(cs.some((c) => s.characters[c.id].rank === 'underboss')).toBe(true);
    for (const c of cs) {
      expect(c.total).toBeGreaterThanOrEqual(0);
      expect(c.total).toBeLessThanOrEqual(100);
      expect(c.parts.length).toBeGreaterThanOrEqual(5);
    }
    // Sideline is open; removing your own blood never is.
    const side: PlayerAction = { kind: 'power', op: { op: 'shadow', a: { op: 'sideline', charId: paolo!.id } } };
    expect(previewAction(s, side).disabledReason).toBeUndefined();
    const rm: PlayerAction = { kind: 'power', op: { op: 'shadow', a: { op: 'remove', charId: paolo!.id } } };
    expect(previewAction(s, rm).disabledReason).toBe('Not your own blood');
  });

  it('when the old Don dies, the player continues as the heir and the year is settled', () => {
    let s = play(newGameWith('od-death', 'olddon'), 2);
    const don = s.playerId;
    const ctx = newCtx(s);
    killCharacter(ctx, don, 'his heart gave out at the Bolero');
    s = play(s, 2);
    expect(s.gameOver).toBeUndefined();
    expect(s.playerId).not.toBe(don);
    expect(s.characters[s.playerId].alive).toBe(true);
    expect(s.oldDon!.year?.outcome).toBe('dead');
    expect(s.oldDon!.fallout).toBeDefined();
    expect(validateHierarchy(s)).toEqual([]);
    const back = JSON.parse(JSON.stringify(s)) as GameState;
    expect(JSON.stringify(play(back, 1))).toBe(JSON.stringify(play(s, 1)));
  });

  it('is deterministic, survives a save round-trip, and upgradeSave leaves it alone', () => {
    expect(JSON.stringify(newGameWith('od-det', 'olddon'))).toBe(JSON.stringify(newGameWith('od-det', 'olddon')));
    const s = play(newGameWith('od-det', 'olddon'), 5);
    const t = play(newGameWith('od-det', 'olddon'), 5);
    expect(JSON.stringify(s)).toBe(JSON.stringify(t));
    const back = JSON.parse(JSON.stringify(s)) as GameState;
    expect(JSON.stringify(advanceWeek(back, {}).state)).toBe(JSON.stringify(advanceWeek(s, {}).state));
    const raw = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw)))).toBe(raw);
  });

  it('a season advances thirteen weeks with delegation, deterministically', () => {
    const s = newGameWith('od-season', 'olddon');
    const a = advanceSpan(s, SEASON_WEEKS);
    const b = advanceSpan(newGameWith('od-season', 'olddon'), SEASON_WEEKS);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    const changed = a.state.playerId !== s.playerId;
    if (!changed && !a.state.gameOver) expect(a.state.week).toBe(s.week + SEASON_WEEKS);
    expect(a.reports.length).toBe(a.state.week - s.week);
  });

  it('plays a full year and gives a verdict', () => {
    const s = play(newGameWith('od-year', 'olddon'), 54);
    expect(s.oldDon!.year).toBeDefined();
    expect(s.chronicle.some((e) => e.text === s.oldDon!.year!.text)).toBe(true);
  }, 240000);
});
