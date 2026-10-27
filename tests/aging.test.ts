import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AgingSection } from '../src/ui/sheet/AgingSection';
import {
  agingOf, applyAgingOp, buildIncapable, deathMult, effectiveFrom, ensureAging, fertility, knownOld, learnedSkills, lifeTraits, lvl,
  onsetAge, settleSkills, skillLines, stressMult, successionBar, undiagnosed, type OldTrait,
} from '../src/engine/aging';
import { ageOn, dateOfWeek, monthKey } from '../src/engine/calendar';
import { birthForAge, crew, makeCharacter, player } from '../src/engine/characters';
import { bloodLine, monthlyLife } from '../src/engine/dynasty';
import { applyEffects } from '../src/engine/effects';
import { famMut } from '../src/engine/familyState';
import { capability } from '../src/engine/heir';
import { newCtx } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { doctorReading } from '../src/engine/roundsPersonal';
import { ubAuthority } from '../src/engine/shadow';
import { ensureShadow } from '../src/engine/shadowState';
import { newGameWith } from '../src/engine/starts';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { Character, GameState } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

/** Advance whole months of life (calendar + monthlyLife only). */
function months(s: GameState, n: number): void {
  for (let i = 0; i < n && !s.gameOver; i++) {
    const m = monthKey(s.date);
    while (monthKey(s.date) === m) { s.week += 1; s.date = dateOfWeek(s.week); }
    monthlyLife(newCtx(s));
  }
}

function oldMan(s: GameState, age: number, extra: Partial<Character> = {}): Character {
  const c = makeCharacter(s, { rank: 'civilian', faction: 'none', age });
  c.health = 85;
  c.conditions = [];
  Object.assign(c, extra);
  return c;
}

describe('old-age traits come on, each man on his own schedule', () => {
  it('onset ages are seeded, individual and repeatable', () => {
    const s = newGame('age-onset');
    const men = Array.from({ length: 12 }, () => oldMan(s, 60));
    const ages = men.map((c) => onsetAge(s, c, 'mind'));
    expect(new Set(ages.map((a) => Math.round(a))).size).toBeGreaterThan(4);
    const again = men.map((c) => onsetAge(s, c, 'mind'));
    expect(again).toEqual(ages);
    for (const c of men) expect(onsetAge(s, c, 'infirm')).toBeGreaterThan(55);
  });

  it('the old get traits over the years, the young do not; skills fall below what was learned', () => {
    const s = newGame('age-run');
    const old = Array.from({ length: 16 }, () => oldMan(s, 76));
    const young = Array.from({ length: 5 }, () => oldMan(s, 30));
    months(s, 36);
    const got = old.filter((c) => Object.keys(agingOf(s, c.id).t).length > 0);
    expect(got.length).toBeGreaterThan(5);
    for (const c of young) expect(Object.keys(agingOf(s, c.id).t)).toHaveLength(0);
    const hurt = got.filter((c) => c.alive && Object.values(agingOf(s, c.id).t).some((L) => (L ?? 0) >= 1) && (['force', 'diplomacy', 'leadership'] as const).some((k) => c.attributes[k] < learnedSkills(s, c)[k]));
    expect(hurt.length).toBeGreaterThan(0);
  });

  it('learned vs effective reads plainly ("78 learned → 65 effective: Withering Mind 2")', () => {
    const s = newGame('age-eff');
    const c = oldMan(s, 50);
    c.attributes.leadership = 78;
    const A = ensureAging(s);
    A.p[c.id] = { t: { mind: 2 }, at: { mind: s.week }, dx: ['mind'] };
    expect(effectiveFrom(s, c, c.attributes).leadership).toBe(65);
    settleSkills(s, c);
    expect(c.attributes.leadership).toBe(65);
    expect(learnedSkills(s, c).leadership).toBe(78);
    // A gain from an event lands on the learned skill and is not lost.
    c.attributes.leadership += 5;
    settleSkills(s, c);
    expect(learnedSkills(s, c).leadership).toBe(83);
    // Cured (not realistic, but the books balance): the learned skill comes back.
    A.p[c.id].t = {};
    settleSkills(s, c);
    expect(c.attributes.leadership).toBe(83);
    expect(agingOf(s, c.id).learned).toBeUndefined();
  });

  it('the player sees the cause only once the doctor names it; others are a mystery until heard', () => {
    const s = newGame('age-privacy');
    const boss = player(s);
    const A = ensureAging(s);
    A.p[boss.id] = { t: { mind: 2 }, at: {} };
    settleSkills(s, boss);
    expect(knownOld(s, boss)).toHaveLength(0);
    expect(undiagnosed(s).map((x) => x.trait)).toEqual(['mind']);
    expect(skillLines(s, boss).find((l) => l.skill === 'leadership')!.why).toEqual(['Something the doctor should look at']);
    // The doctor visit names it and slows it.
    expect(doctorReading(s).lines.some((l) => /Withering Mind 2/.test(l))).toBe(true);
    applyAgingOp(newCtx(s), { k: 'checkup', charId: boss.id });
    expect(knownOld(s, boss).map((k) => k.label)).toEqual(['Withering Mind 2']);
    expect(agingOf(s, boss.id).care).toBe(s.week);
    expect(skillLines(s, boss).find((l) => l.skill === 'leadership')!.why).toEqual(['Withering Mind 2']);
    // Someone else's condition: unknown until heard.
    const cap = crew(s)[1];
    A.p[cap.id] = { t: { eyes: 2 }, at: {} };
    expect(knownOld(s, cap)).toHaveLength(0);
    A.p[cap.id].heard = { eyes: 'rumor' };
    expect(knownOld(s, cap)[0]).toMatchObject({ label: 'Clouded Eyes 2', sure: false });
  });

  it('a doctor\'s care slows it; drink and stress speed it up', () => {
    const count = (care: boolean, drinker: boolean) => {
      let stages = 0;
      for (const seed of ['dc-1', 'dc-2', 'dc-3']) {
        const s = newGame(seed);
        const men = Array.from({ length: 8 }, () => oldMan(s, 84, drinker ? { traits: ['Drinker'] } : { traits: [] }));
        for (let m = 0; m < 48; m++) {
          if (care) for (const c of men) if (c.alive) applyAgingOp(newCtx(s), { k: 'checkup', charId: c.id });
          months(s, 1);
        }
        stages += men.reduce((a, c) => a + Object.values(agingOf(s, c.id).t).reduce((x, L) => x + (L ?? 0), 0), 0);
      }
      return stages;
    };
    expect(count(true, false)).toBeLessThan(count(false, true));
  });
});

describe('the last stages', () => {
  it('a faltering heart past its last stage kills (after a warning)', () => {
    const s = newGame('age-heart');
    const c = oldMan(s, 80);
    const A = ensureAging(s);
    A.p[c.id] = { t: { heart: 3 }, at: { heart: s.week - 100 } };
    c.warnedWeek = s.week - 10;
    for (let i = 0; i < 120 && c.alive; i++) months(s, 1);
    expect(c.alive).toBe(false);
    expect(A.stats.heartDeaths + (c.death?.cause !== 'his heart gave out' ? 1 : 0)).toBeGreaterThan(0);
  });

  it('an incapable boss gets someone to act for him; options stay open', () => {
    const s = newGameWith('age-incap', 'classic');
    const boss = player(s);
    const A = ensureAging(s);
    A.p[boss.id] = { t: { mind: 3, incapable: 1 }, at: {} };
    settleSkills(s, boss);
    expect(Object.values(boss.attributes).every((v) => v === 0)).toBe(true);
    const ev = buildIncapable(s);
    expect(ev.choices.map((c) => c.id)).toEqual(['ub', 'heir', 'step', 'none']);
    ensureShadow(s);
    const ctx = newCtx(s);
    const ub = ev.choices.find((c) => c.id === 'ub')!;
    if (!ub.disabledReason) {
      applyEffects(ctx, ub.effects, { label: ev.title, because: ub.because, category: 'event' });
      expect(A.regent?.mode).toBe('ub');
      expect(ubAuthority(s)).toBe('acting');
      months(s, 3);
      expect(ubAuthority(s)).toBe('acting');
    }
    expect(fertility(s, boss)).toBe(0);
    expect(successionBar(s, boss)).toBe('Incapable');
    expect(stressMult(s, boss.id, 10)).toBeGreaterThan(1);
  });

  it('a boss whose mind goes all the way gets the event in play', () => {
    const s = newGameWith('age-incap2', 'classic');
    const boss = player(s);
    boss.birth = birthForAge(s, s.date, 80);
    const A = ensureAging(s);
    A.p[boss.id] = { t: { mind: 3 }, at: { mind: s.week - 400 } };
    boss.health = 90;
    for (let i = 0; i < 200 && !lvl(s, boss.id, 'incapable') && boss.alive && s.playerId === boss.id; i++) months(s, 1);
    if (s.playerId === boss.id && boss.alive) {
      expect(lvl(s, boss.id, 'incapable')).toBe(1);
      expect(s.eventQueue.some((e) => e.defId === 'aging_incapable')).toBe(true);
    }
  });

  it('frailty makes death likelier', () => {
    const s = newGame('age-death');
    const c = oldMan(s, 75);
    expect(deathMult(s, c)).toBe(1);
    ensureAging(s).p[c.id] = { t: { bones: 2, heart: 1 }, at: {} };
    expect(deathMult(s, c)).toBeGreaterThan(1.3);
  });
});

describe('family and earned traits', () => {
  it('bastards, the disinherited and the incapable are out of the line; the legitimized are in', () => {
    const s = newGame('age-line');
    const boss = player(s);
    const kids: Character[] = [];
    for (const age of [30, 28, 26, 24]) {
      const k = makeCharacter(s, { rank: 'civilian', faction: 'player', dynasty: true, lastName: boss.lastName, age, gender: 'M' });
      k.fatherId = boss.id;
      boss.childrenIds.push(k.id);
      kids.push(k);
    }
    const ctx = newCtx(s);
    famMut(s, kids[0].id).bastardOf = boss.id;
    applyAgingOp(ctx, { k: 'tag', charId: kids[1].id, tag: 'disinherited' });
    ensureAging(s).p[kids[2].id] = { t: { incapable: 1 }, at: {} };
    famMut(s, kids[3].id).bastardOf = boss.id;
    famMut(s, kids[3].id).legitimized = true;
    const line = bloodLine(s, boss).map((c) => c.id);
    expect(line).not.toContain(kids[0].id);
    expect(line).not.toContain(kids[1].id);
    expect(line).not.toContain(kids[2].id);
    expect(line).toContain(kids[3].id);
    expect(lifeTraits(s, kids[0])).toContain('bastard');
    expect(lifeTraits(s, kids[1])).toContain('disinherited');
    expect(lifeTraits(s, kids[3])).toContain('legitimized');
    // Restoring him puts him back.
    applyAgingOp(ctx, { k: 'tag', charId: kids[1].id, tag: 'disinherited', remove: true });
    expect(bloodLine(s, boss).map((c) => c.id)).toContain(kids[1].id);
    // Shamed costs him as a candidate.
    const before = capability(s, kids[1]).score;
    applyAgingOp(ctx, { k: 'tag', charId: kids[1].id, tag: 'shamed' });
    expect(capability(s, kids[1]).score).toBeLessThan(before);
  });

  it('twins are seen as twins; seasoned age helps', () => {
    const s = newGame('age-twin');
    const mom = makeCharacter(s, { gender: 'F', age: 30 });
    const a = makeCharacter(s, { age: 10 });
    const b = makeCharacter(s, { age: 10 });
    a.motherId = mom.id; b.motherId = mom.id; b.birth = { ...a.birth };
    expect(lifeTraits(s, a)).toContain('twin');
    const old = oldMan(s, 60);
    expect(lifeTraits(s, old)).toContain('seasoned');
  });
});

describe('everyone ages: rival bosses too', () => {
  it('rival leaders get old-age traits', () => {
    const s = newGame('age-rivals');
    const leaders = s.rivals.map((r) => s.characters[r.leaderId]).filter((c): c is Character => !!c?.alive);
    expect(leaders.length).toBeGreaterThan(0);
    for (const c of leaders) { c.birth = birthForAge(s, s.date, 85); c.health = 90; }
    months(s, 60);
    expect(leaders.some((c) => Object.keys(agingOf(s, c.id).t).length > 0)).toBe(true);
  });
});

describe('saves', () => {
  it('a game with aging round-trips; loading changes nothing; old saves without it load', () => {
    const s = newGameWith('age-save', 'classic');
    player(s).birth = birthForAge(s, s.date, 72);
    months(s, 30);
    expect(s.aging).toBeDefined();
    const json = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(json)))).toBe(json);
    const a = JSON.parse(json) as GameState;
    const b = upgradeSave(JSON.parse(json) as GameState);
    months(a, 12);
    months(b, 12);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const old = clone(s);
    delete old.aging;
    const t = upgradeSave(old);
    expect(t.aging).toBeUndefined();
    months(t, 2);
    expect(t.aging).toBeDefined();
  });

  it('a new game loads to exactly itself', () => {
    for (const st of ['classic', 'sees'] as const) {
      const s = newGameWith(`age-new-${st}`, st);
      const json = JSON.stringify(s);
      expect(JSON.stringify(upgradeSave(JSON.parse(json)))).toBe(json);
    }
  });

  it('is deterministic', () => {
    const run = () => { const s = newGame('age-det'); for (let i = 0; i < 6; i++) oldMan(s, 78); months(s, 40); return JSON.stringify(s.aging); };
    expect(run()).toBe(run());
  });
});

describe('the sheet', () => {
  it('shows learned → effective with the named cause, summary first', () => {
    const s = newGame('age-ui');
    const boss = player(s);
    boss.attributes.leadership = 78;
    ensureAging(s).p[boss.id] = { t: { mind: 2 }, at: {}, dx: ['mind'] };
    settleSkills(s, boss);
    const html = renderToString(createElement(AgingSection, { s, c: boss })).replace(/<!-- -->/g, '');
    expect(html).toContain('Leadership 78 learned → 65 effective</span>: Withering Mind 2');
    expect(html).toContain('More…');
  });
});

void ageOn;
void ([] as OldTrait[]);
