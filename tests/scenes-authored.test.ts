import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { capos, crew, player } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { mindsWeek } from '../src/engine/minds';
import { ensureDeeds } from '../src/engine/deeds';
import { SCENE_ERRORS, SCENE_FILES, SCENES, SCENES_BY_ID } from '../src/engine/authored/library';
import { buildScene, castScene, choiceOdds, tryScene, whenOk } from '../src/engine/authored/run';
import { compare, validateScenes } from '../src/engine/authored/validate';
import type { GameState } from '../src/engine/types';
import { playWeeks } from './helpers';

function game(seed = 'scenes-a'): GameState {
  const s = newGame(seed);
  mindsWeek(newCtx(s));
  ensureDeeds(s);
  return s;
}

const good = {
  id: 'test_scene', title: 'A test for {capo.first}', theme: 'crew',
  who: { capo: { pool: 'capo' } },
  text: '{capo.call} waits. {capo.He} looks at {boss.first}.',
  choices: [
    { label: 'Yes', effects: [{ money: -100 }] },
    { label: 'No', odds: { base: 50 }, success: [{ respect: 1 }], failure: [{ respect: -1 }] },
  ],
};

describe('authored scenes: the library', () => {
  it('every shipped scene passes the validator; 15+ across the game\'s themes', () => {
    expect(SCENE_ERRORS).toEqual([]);
    expect(SCENE_FILES.length).toBeGreaterThanOrEqual(5);
    expect(SCENES.length).toBeGreaterThanOrEqual(15);
    const themes = new Set(SCENES.map((s) => s.theme));
    for (const t of ['crew', 'family', 'rivals', 'town', 'business']) expect(themes.has(t as never), t).toBe(true);
    // Chains: every follow-up is somebody's next.
    const nexts = new Set(SCENES.flatMap((s) => s.choices.flatMap((c) => (c.next === undefined ? [] : Array.isArray(c.next) ? c.next : [c.next]).map((n) => n.scene))));
    for (const s of SCENES.filter((x) => x.followup)) expect(nexts.has(s.id), s.id).toBe(true);
  });

  it('a good scene passes; mistakes are explained in plain words, with where and "did you mean"', () => {
    expect(validateScenes({ 'scenes/t.json': good }).errors).toEqual([]);
    const bad = JSON.parse(JSON.stringify(good));
    bad.choices[0].effects = [{ moneys: 5 }];
    bad.who.capo.traits = ['Hotheaded'];
    bad.text = '{capoo.first} waits.';
    bad.choices[1].next = { scene: 'nowhere' };
    bad.when = { seasn: 'summer' };
    const e = validateScenes({ 'scenes/t.json': bad }).errors;
    expect(e.some((x) => x.includes('scenes/t.json › test_scene › choices[0].effects[0]') && x.includes('unknown effect "moneys"') && x.includes('did you mean "money"'))).toBe(true);
    expect(e.some((x) => x.includes('"Hotheaded" is not a trait') && x.includes('Hot-headed'))).toBe(true);
    expect(e.some((x) => x.includes('{capoo.first}') && x.includes('did you mean "capo"'))).toBe(true);
    expect(e.some((x) => x.includes('no scene "nowhere"'))).toBe(true);
    expect(e.some((x) => x.includes('unknown condition "seasn"'))).toBe(true);
    const one = { ...good, choices: [good.choices[0]] };
    expect(validateScenes({ 'a.json': one }).errors.some((x) => x.includes('2 to 4 choices'))).toBe(true);
    const succ = JSON.parse(JSON.stringify(good));
    delete succ.choices[1].odds;
    expect(validateScenes({ 'a.json': succ }).errors.some((x) => x.includes('needs "odds"'))).toBe(true);
    // A bad scene is left out; the good ones in the same batch still load.
    const r = validateScenes({ 'a.json': [good, { ...bad, id: 'bad_one' }] });
    expect(r.scenes.map((x) => x.id)).toEqual(['test_scene']);
  });

  it('comparisons read like a person writes them', () => {
    expect(compare(5, '<10')).toBe(true);
    expect(compare(10, '<10')).toBe(false);
    expect(compare(40, '>=40')).toBe(true);
    expect(compare(-21, '<-20')).toBe(true);
    expect(compare(3, '=3')).toBe(true);
    expect(compare(45, 45)).toBe(true);
  });
});

describe('authored scenes: in the game', () => {
  it('example scenes fire when their conditions hold, and not when they don\'t', () => {
    const s = game('scenes-fire');
    const boss = player(s);
    // The roast went cold: needs a wife.
    if (boss.spouseId) expect(tryScene(s, 'wife_late_dinner')?.defId).toBe('scene_wife_late_dinner');
    // A fight at the Bucket of Blood: summer, and a hothead among the soldiers.
    const men = crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate');
    men[0].traits = ['Hot-headed'];
    s.date = { y: 1960, m: 7, d: 10 };
    expect(tryScene(s, 'crew_hothead_bar_fight')?.text).toContain(men[0].firstName);
    s.date = { y: 1960, m: 12, d: 10 };
    expect(tryScene(s, 'crew_hothead_bar_fight')).toBeUndefined();
    // Donna: August or September 1960 only, once.
    s.date = { y: 1961, m: 9, d: 1 };
    expect(whenOk(s, SCENES_BY_ID.boardwalk_hurricane_warning)).toBe(false);
    s.date = { y: 1960, m: 9, d: 1 };
    expect(whenOk(s, SCENES_BY_ID.boardwalk_hurricane_warning)).toBe(true);
    // The short envelope: a greedy capo.
    for (const k of capos(s)) k.traits = ['Patient'];
    expect(tryScene(s, 'crew_short_envelope')).toBeUndefined();
    capos(s)[0].traits = ['Greedy'];
    s.week = 10;
    expect(tryScene(s, 'crew_short_envelope')?.title).toContain(capos(s)[0].firstName);
  });

  it('roles cast real people; placeholders fill; odds come from a deed with its reasons', () => {
    const s = game('scenes-cast');
    capos(s)[0].traits = ['Greedy'];
    s.week = 10;
    const sc = SCENES_BY_ID.crew_short_envelope;
    const cast = castScene(s, sc)!;
    expect(s.characters[cast.capo].traits).toContain('Greedy');
    const ev = buildScene(s, sc, cast)!;
    expect(ev.text).not.toMatch(/\{[a-z]+\.[a-zA-Z]+\}/);
    const odds = choiceOdds(s, sc.choices[0], cast)!;
    expect(odds.p).toBeGreaterThan(0);
    expect(odds.why.length).toBeGreaterThan(0);
    expect(ev.choices[0].detail).toMatch(/% it goes your way/);
  });

  it('an answer rolls its odds, records the scene, and a chain schedules its next part with the same cast', () => {
    let s = game('scenes-chain');
    capos(s)[0].traits = ['Greedy'];
    s.week = 10;
    s.money = 50000;
    const ev = tryScene(s, 'crew_short_envelope')!;
    const cast = JSON.parse(String(ev.meta!.cast));
    s.pendingEvents = [ev];
    s = advanceWeek(s, { choices: { [ev.iid]: 'c2' } }).state;
    const D = s.deeds!;
    expect(D.sc.crew_short_envelope).toBeDefined();
    expect(s.flags.watching_short_capo).toBe(1);
    const due = D.due.find((d) => d.id === 'crew_short_envelope_report');
    expect(due?.cast.capo).toBe(cast.capo);
    // An odds choice: the roll lands one way or the other, in the chronicle.
    let t = game('scenes-odds');
    capos(t)[0].traits = ['Greedy'];
    t.week = 10;
    const e2 = tryScene(t, 'crew_short_envelope')!;
    t.pendingEvents = [e2];
    t = advanceWeek(t, { choices: { [e2.iid]: 'c0' } }).state;
    const name = t.characters[JSON.parse(String(e2.meta!.cast)).capo].firstName;
    expect(t.chronicle.some((c) => c.text.includes(name) && (c.text.includes('rest by Monday') || c.text.includes('counts pennies')))).toBe(true);
  });

  it('scenes reach the boss in play, through the story director', () => {
    const s = playWeeks('scenes-play', 70);
    expect(s.director!.hist.filter(([, id]) => id.startsWith('scene_')).length).toBeGreaterThanOrEqual(2);
    expect(s.deeds!.stats.scenes).toBeGreaterThanOrEqual(2);
  });
});
