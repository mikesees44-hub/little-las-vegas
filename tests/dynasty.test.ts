import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { bloodLine, chooseHeir, killCharacter, monthlyLife, validatePlayer } from '../src/engine/dynasty';
import { makeCharacter, monthlyDeathChance, livingDynasty, crew } from '../src/engine/characters';
import { ageOn } from '../src/engine/calendar';
import type { Character, GameState } from '../src/engine/types';

function addChild(s: GameState, parent: Character, gender: 'M' | 'F', age: number): Character {
  const c = makeCharacter(s, { gender, age, lastName: parent.lastName, dynasty: true, faction: 'player', rank: 'civilian', nickname: false });
  c.fatherId = parent.id;
  parent.childrenIds.push(c.id);
  return c;
}

/** Strip the generated house down to a controlled family for succession tests. */
function controlledHouse(seed: string) {
  const s = newGame(seed);
  const boss = s.characters[s.playerId];
  for (const c of Object.values(s.characters)) if (c.dynasty && c.id !== boss.id) c.dynasty = false;
  boss.childrenIds = [];
  boss.fatherId = undefined;
  return { s, boss };
}

describe('succession', () => {
  it('blood: eldest adult son inherits over an older daughter and younger son', () => {
    const { s, boss } = controlledHouse('succ1');
    const daughter = addChild(s, boss, 'F', 24);
    const elder = addChild(s, boss, 'M', 22);
    addChild(s, boss, 'M', 19);
    expect(chooseHeir(s, boss).heir?.id).toBe(elder.id);
    expect(bloodLine(s, boss)[0].id).toBe(elder.id);
    expect(bloodLine(s, boss).map((c) => c.id)).toContain(daughter.id);
  });

  it('killCharacter on the player switches to the heir, records history and schedules a funeral', () => {
    const { s, boss } = controlledHouse('succ2');
    const son = addChild(s, boss, 'M', 25);
    const ctx = newCtx(s);
    killCharacter(ctx, boss.id, 'heart attack');
    expect(s.playerId).toBe(son.id);
    expect(s.characters[son.id].rank).toBe('boss');
    expect(s.characters[boss.id].alive).toBe(false);
    expect(s.characters[boss.id].death?.cause).toBe('heart attack');
    expect(s.eventQueue.some((e) => e.defId === 'funeral')).toBe(true);
    expect(s.dynastyHistory.some((h) => /heart attack/.test(h.text))).toBe(true);
    expect(s.dynastyHistory.some((h) => /became head of the house/.test(h.text))).toBe(true);
    expect(validatePlayer(s)).toEqual([]);
    expect(s.gameOver).toBeUndefined();
  });

  it('falls through to brothers when there are no children', () => {
    const { s, boss } = controlledHouse('succ3');
    const dad = makeCharacter(s, { age: 75, lastName: boss.lastName, dynasty: true, faction: 'player' });
    dad.alive = false;
    boss.fatherId = dad.id;
    const bro = makeCharacter(s, { age: 30, lastName: boss.lastName, dynasty: true, faction: 'player', gender: 'M' });
    bro.fatherId = dad.id;
    killCharacter(newCtx(s), boss.id, 'shot');
    expect(s.playerId).toBe(bro.id);
  });

  it('minors inherit only when no adults remain', () => {
    const { s, boss } = controlledHouse('succ4');
    const kid = addChild(s, boss, 'M', 10);
    killCharacter(newCtx(s), boss.id, 'stroke');
    expect(s.playerId).toBe(kid.id);
    expect(s.gameOver).toBeUndefined();
  });

  it('game over only when no eligible dynasty member remains', () => {
    const { s, boss } = controlledHouse('succ5');
    killCharacter(newCtx(s), boss.id, 'stroke');
    expect(s.gameOver?.reason).toBe('no_heir');
  });

  it('appointed law uses the designated heir, falling back to blood', () => {
    const { s, boss } = controlledHouse('succ6');
    const elder = addChild(s, boss, 'M', 30);
    const younger = addChild(s, boss, 'M', 20);
    s.successionLaw = 'appointed';
    s.designatedHeirId = younger.id;
    killCharacter(newCtx(s), boss.id, 'stroke');
    expect(s.playerId).toBe(younger.id);

    const t = controlledHouse('succ6b');
    const e2 = addChild(t.s, t.boss, 'M', 30);
    t.s.successionLaw = 'appointed';
    t.s.designatedHeirId = 'nobody';
    killCharacter(newCtx(t.s), t.boss.id, 'stroke');
    expect(t.s.playerId).toBe(e2.id);
    void elder;
  });

  it('underboss law: the underboss inherits and joins the house', () => {
    const { s, boss } = controlledHouse('succ7');
    addChild(s, boss, 'M', 30);
    s.successionLaw = 'underboss';
    const ub = crew(s).find((c) => c.rank === 'underboss')!;
    killCharacter(newCtx(s), boss.id, 'stroke');
    expect(s.playerId).toBe(ub.id);
    expect(s.characters[ub.id].dynasty).toBe(true);
    expect(validatePlayer(s)).toEqual([]);
    // a new underboss was named
    expect(crew(s).some((c) => c.rank === 'underboss')).toBe(true);
  });

  it('capos elect choose the candidate they like best', () => {
    const { s, boss } = controlledHouse('succ8');
    const a = addChild(s, boss, 'M', 30);
    const b = addChild(s, boss, 'M', 28);
    s.successionLaw = 'capos_elect';
    for (const c of crew(s).filter((x) => x.rank === 'capo')) {
      s.relations[`${c.id}>${b.id}`] = { from: c.id, to: b.id, modifiers: [{ id: 'x', reason: 'Good kid', value: 50, decay: 0, week: 0 }], fear: 0, trust: 30, grievance: 0 };
    }
    killCharacter(newCtx(s), boss.id, 'stroke');
    expect(s.playerId).toBe(b.id);
    void a;
  });

  it('successive deaths keep producing valid players until the line ends', () => {
    const { s, boss } = controlledHouse('succ9');
    addChild(s, boss, 'M', 30);
    addChild(s, boss, 'F', 27);
    addChild(s, boss, 'M', 12);
    let deaths = 0;
    while (!s.gameOver && deaths < 10) {
      killCharacter(newCtx(s), s.playerId, 'test');
      deaths++;
      if (!s.gameOver) expect(validatePlayer(s)).toEqual([]);
    }
    expect(deaths).toBe(4);
    expect(s.gameOver?.reason).toBe('no_heir');
  });
});

describe('aging and death', () => {
  it('death chance rises with age and falls with health', () => {
    expect(monthlyDeathChance(30, 90)).toBeLessThan(monthlyDeathChance(60, 90));
    expect(monthlyDeathChance(60, 90)).toBeLessThan(monthlyDeathChance(80, 90));
    expect(monthlyDeathChance(60, 20)).toBeGreaterThan(monthlyDeathChance(60, 80) * 3);
    expect(monthlyDeathChance(95, 1)).toBeLessThanOrEqual(0.6);
  });

  it('natural death is always preceded by a warning', () => {
    const s = newGame('age1');
    const old = makeCharacter(s, { age: 88, dynasty: true, faction: 'player' });
    old.health = 5;
    let warnedAt: number | undefined;
    for (let m = 0; m < 60 && old.alive; m++) {
      s.week += 4;
      const ctx = newCtx(s);
      monthlyLife(ctx);
      if (old.warnedWeek !== undefined && warnedAt === undefined) warnedAt = s.week;
      if (!old.alive) {
        expect(warnedAt).toBeDefined();
        expect(s.week).toBeGreaterThan(warnedAt!);
      }
    }
    expect(old.alive).toBe(false);
  });

  it('characters age as the calendar advances', () => {
    let s = newGame('age2');
    const boss = s.characters[s.playerId];
    const a0 = ageOn(boss.birth, s.date);
    for (let i = 0; i < 53; i++) s = advanceWeek(s, {}).state;
    const b = s.characters[boss.id];
    if (b.alive) expect(ageOn(b.birth, s.date)).toBe(a0 + 1);
  });

  it('the house persists: births and marriages happen over decades', () => {
    let births = 0;
    let marriages = 0;
    for (let seed = 0; seed < 5; seed++) {
      let s = newGame(`gen${seed}`);
      for (let i = 0; i < 520 && !s.gameOver; i++) s = advanceWeek(s, {}).state;
      births += s.dynastyHistory.filter((h) => /was born/.test(h.text)).length;
      marriages += s.dynastyHistory.filter((h) => /married/.test(h.text)).length;
      if (!s.gameOver) expect(livingDynasty(s).length).toBeGreaterThan(0);
    }
    expect(births).toBeGreaterThan(0);
    expect(marriages).toBeGreaterThan(0);
  });
});

describe('stale events after a succession', () => {
  it('an event raised for the old boss cannot demote the new boss', async () => {
    const { forceDeath } = await import('../src/engine/engine');
    const { s, boss } = controlledHouse('stale1');
    const son = addChild(s, boss, 'M', 20);
    // A pending Sunday-dinner style choice that would bring the son into the crew as an associate.
    s.pendingEvents = [{
      iid: 'evX', defId: 'sunday', title: 'Sunday dinner', text: '', week: s.week, mandatory: false, priority: 1, defaultChoiceId: 'bring',
      choices: [{ id: 'bring', label: 'Bring him in', because: 'brought him in', effects: [{ type: 'rank', charId: son.id, rank: 'associate' }, { type: 'recruit', charId: son.id }] }],
    }];
    const after = forceDeath(s, boss.id, 'test').state;
    expect(after.playerId).toBe(son.id);
    const next = advanceWeek(after, { choices: { evX: 'bring' } }).state;
    expect(validatePlayer(next)).toEqual([]);
    expect(next.characters[son.id].rank).toBe('boss');
  });
});
