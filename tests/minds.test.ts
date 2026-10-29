import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { capos, player } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { upgradeSave } from '../src/engine/upgradeSave';
import { addOpinion, opinion } from '../src/engine/relations';
import {
  believe, capoLean, drives, ensureMinds, fadeMemories, gossipWeek, grudge, mindsWeek, remember, rivalLean, startRumor, threatLean,
  type CapoMove, type Mind,
} from '../src/engine/minds';
import { refreshGoals } from '../src/engine/minds/goals';
import { considerPlan, outlook, workPlan } from '../src/engine/minds/planner';
import { mindView } from '../src/engine/minds/view';
import {
  applyTalk, beginTalk, buildTalkPrompt, canTalk, personaOf, revealable, scriptedReply, TALK_OPINION_CAP, TALK_REASON, validateTalk,
} from '../src/engine/minds/talk';
import { hoursUsed } from '../src/engine/timeCost';
import { rivalCaps } from '../src/engine/rivals';
import type { Character, GameState, Trait } from '../src/engine/types';

function game(seed = 'minds-a'): GameState {
  const s = newGame(seed);
  mindsWeek(newCtx(s));
  return s;
}
function blankMind(id: string, w = 1): Mind {
  return { id, sat: [50, 50, 50, 50, 50, 50, 50, 50], mood: 'content', mv: 0, goals: [], bel: {}, facts: [], mem: [], why: [], th: w };
}
function withTraits(c: Character, traits: Trait[]): void { c.traits = traits; }

describe('minds: needs, drives and goals', () => {
  it('important people get full minds; drives follow traits', () => {
    const s = game();
    const M = s.minds!;
    expect(Object.keys(M.minds).length).toBeGreaterThan(5);
    expect(Object.keys(M.minds).length).toBeLessThanOrEqual(28);
    for (const r of s.rivals) if (s.characters[r.leaderId]?.alive) expect(M.minds[r.leaderId]).toBeDefined();
    for (const k of capos(s)) expect(M.minds[k.id]).toBeDefined();
    const k = capos(s)[0];
    withTraits(k, ['Greedy']);
    const g = drives(s, k);
    withTraits(k, ['Cowardly']);
    const c = drives(s, k);
    expect(g.money).toBeGreaterThan(c.money);
    expect(c.safety).toBeGreaterThan(g.safety);
    withTraits(k, ['Loyal-to-a-fault']);
    expect(drives(s, k).loyalty).toBeGreaterThan(g.loyalty);
  });

  it('goals come from urgent needs, coloured by nature: hotheads confront, schemers smear, cowards lie low', () => {
    const s = game();
    const k = capos(s)[0];
    const enemy = capos(s)[1] ?? s.characters[s.rivals[0].leaderId];
    const m = blankMind(k.id);
    remember(m, { w: s.week, k: 'slight', who: enemy.id, t: 'insulted him', v: -40 });
    m.sat = [80, 10, 80, 80, 80, 80, 0, 80];
    withTraits(k, ['Hot-headed', 'Vengeful']);
    refreshGoals(s, k, m, drives(s, k));
    expect(m.goals.map((g) => g.k)).toContain('get_even');
    m.goals = [];
    withTraits(k, ['Patient', 'Vengeful']);
    refreshGoals(s, k, m, drives(s, k));
    expect(m.goals.map((g) => g.k)).toContain('smear');
    m.goals = [];
    m.sat = [80, 80, 0, 80, 80, 80, 90, 80];
    withTraits(k, ['Cowardly']);
    refreshGoals(s, k, m, drives(s, k));
    expect(m.goals[0].k).toBe('lielow');
  });
});

describe('minds: memory', () => {
  it('memories fade; a vengeful man keeps his grudges longer', () => {
    const s = game();
    const k = capos(s)[0];
    const a = blankMind(k.id);
    const b = blankMind(k.id);
    remember(a, { w: 1, k: 'slight', who: 'x', t: 'a slight', v: -30 });
    remember(b, { w: 1, k: 'slight', who: 'x', t: 'a slight', v: -30 });
    withTraits(k, []);
    fadeMemories(k, a, 10);
    withTraits(k, ['Vengeful']);
    fadeMemories(k, b, 10);
    expect(grudge(a, 'x')).toBeLessThan(grudge(b, 'x'));
    withTraits(k, []);
    fadeMemories(k, a, 60);
    expect(a.mem.length).toBe(0);
  });
});

describe('minds: beliefs and gossip', () => {
  it('beliefs firm up with repetition and a rat rumor lowers belief in loyalty', () => {
    const s = game();
    const k = capos(s)[0];
    const m = blankMind(k.id);
    believe(s, m, { k: 'rat', by: 'zz', c: 0.4, src: 'rumor', tr: false });
    const c1 = m.facts[0].c;
    believe(s, m, { k: 'rat', by: 'zz', c: 0.4, src: 'rumor', tr: false });
    expect(m.facts[0].c).toBeGreaterThan(c1);
    expect(m.bel.zz.t!).toBeLessThan(0);
  });

  it('rumors travel through the crew, lose certainty, and sometimes change on the way', () => {
    const s = game('minds-gossip');
    const M = ensureMinds(s);
    const crewIds = Object.keys(M.minds).filter((id) => s.characters[id].faction === 'player');
    expect(crewIds.length).toBeGreaterThan(2);
    const teller = M.minds[crewIds[0]];
    const victim = crewIds[1];
    // Everybody holds something against a third man: distortion slides blame onto him.
    for (const id of crewIds) if (id !== crewIds[2]) remember(M.minds[id], { w: s.week, k: 'slight', who: crewIds[2], t: 'old business', v: -30 });
    startRumor(s, M, teller, { k: 'skim', by: victim, tr: true });
    let passed = 0;
    for (let i = 0; i < 12; i++) { passed += gossipWeek(s, M, crewIds); s.week++; }
    expect(passed).toBeGreaterThan(0);
    const heard = crewIds.filter((id) => id !== crewIds[0]).flatMap((id) => M.minds[id].facts.filter((f) => f.src === 'rumor'));
    expect(heard.length).toBeGreaterThan(0);
    for (const f of heard) expect(f.c).toBeLessThan(0.75);
    // Run many seeds' worth: some copies change (wrong name or wrong deed).
    const s2 = game('minds-gossip-2');
    const M2 = ensureMinds(s2);
    const ids2 = Object.keys(M2.minds).filter((id) => s2.characters[id].faction === 'player');
    for (const id of ids2) if (id !== ids2[2]) remember(M2.minds[id], { w: 1, k: 'slight', who: ids2[2], t: 'old business', v: -30 });
    let distorted = 0;
    for (let r = 0; r < 20; r++) {
      startRumor(s2, M2, M2.minds[ids2[0]], { k: 'courted', by: ids2[1], tr: true });
      for (let i = 0; i < 6; i++) gossipWeek(s2, M2, ids2);
      distorted += ids2.flatMap((id) => M2.minds[id].facts).filter((f) => f.src === 'rumor' && !f.tr).length;
      M2.rumors = [];
    }
    expect(distorted).toBeGreaterThan(0);
  });
});

describe('minds: the planner is in character', () => {
  it('a hothead leans to beefs, a coward away from them; a loyalist takes the heat; the greedy skim', () => {
    const s = game();
    const k = capos(s)[0];
    const M = ensureMinds(s);
    const base = (): Record<CapoMove, number> => ({ expand: 1, skim: 1, heat: 1, beef: 1, earn: 1, recruit: 1, cops: 1 });
    const lean = (traits: Trait[], sat: number[], mood: Mind['mood'] = 'content') => {
      withTraits(k, traits);
      M.minds[k.id] = { ...blankMind(k.id), sat, mood };
      const w = base();
      capoLean(s, k, w);
      return w;
    };
    const hot = lean(['Hot-headed', 'Vengeful'], [60, 20, 60, 60, 60, 60, 10, 60], 'angry');
    const cow = lean(['Cowardly'], [60, 60, 20, 60, 60, 60, 60, 60], 'afraid');
    expect(hot.beef).toBeGreaterThan(cow.beef);
    expect(hot.beef).toBeGreaterThan(hot.earn);
    const loyal = lean(['Loyal-to-a-fault'], [70, 70, 70, 70, 70, 70, 70, 10]);
    expect(loyal.heat).toBeGreaterThan(loyal.skim);
    const greedy = lean(['Greedy'], [5, 70, 70, 70, 70, 70, 70, 60], 'greedy');
    expect(greedy.skim).toBeGreaterThan(loyal.skim);
  });

  it('a rival boss with a grudge who believes you weak leans to strike you', () => {
    const s = game();
    const r = s.rivals.find((x) => x.kind === 'mob')!;
    const M = ensureMinds(s);
    const cands = () => [{ move: 'strike' as const, target: 'player' as const, score: 1 }, { move: 'offer_deal' as const, target: 'player' as const, score: 1 }];
    M.minds[r.leaderId] = { ...blankMind(r.leaderId), sat: [70, 30, 70, 30, 70, 70, 20, 60] };
    const calm = cands();
    rivalLean(s, r, calm);
    const m = M.minds[r.leaderId];
    remember(m, { w: s.week, k: 'slight', who: s.playerId, t: 'killed my nephew', v: -45 });
    m.bel[s.playerId] = { s: 5, sc: 0.9, u: s.week };
    r.muscle = 70;
    const angry = cands();
    rivalLean(s, r, angry);
    expect(angry[0].score / angry[1].score).toBeGreaterThan(calm[0].score / calm[1].score);
    const tl = threatLean(s, r)!;
    expect(tl.mult).toBeGreaterThan(1);
    expect(tl.kinds.hit).toBeGreaterThan(1);
  });

  it('a multi-step plan runs step by step, and is re-aimed when its mark is gone', () => {
    const s = game('minds-plan');
    const M = ensureMinds(s);
    const crewIds = Object.keys(M.minds).filter((id) => s.characters[id].faction === 'player' && s.characters[id].rank !== 'civilian');
    const schemer = s.characters[crewIds[0]];
    withTraits(schemer, ['Patient', 'Greedy']);
    const marks = crewIds.slice(1, 3).map((id) => s.characters[id]);
    for (const id of Object.keys(M.minds)) s.characters[id].wealth = 0;
    for (const x of marks) x.wealth = 5000;
    M.minds[schemer.id] = blankMind(schemer.id);
    const m = M.minds[schemer.id];
    m.bel[marks[0].id] = { w: 90, wc: 0.9, u: s.week };
    m.plan = { k: 'betray', t: marks[0].id, steps: ['befriend', 'borrow', 'welsh'], i: 0, w: s.week, sw: s.week, ad: 0, why: 'test' };
    const ctx = newCtx(s);
    workPlan(ctx, M, outlook(s, schemer.id)!);
    expect(m.plan!.i).toBe(1);
    expect(opinion(s, marks[0].id, schemer.id)).toBeGreaterThan(0);
    // The mark dies: the plan is re-aimed at the next man with money.
    marks[0].alive = false;
    workPlan(ctx, M, outlook(s, schemer.id)!);
    expect(m.plan?.t).toBe(marks[1].id);
    expect(m.plan?.i).toBe(0);
    expect(M.stats.adapted).toBeGreaterThan(0);
    // Played through: he borrows, then leaves the mark holding the bag.
    const before = schemer.wealth;
    addOpinion(s, marks[1].id, schemer.id, 'pals', 20, 0);
    for (let i = 0; i < 3 && m.plan; i++) workPlan(ctx, M, outlook(s, schemer.id)!);
    expect(schemer.wealth).toBeGreaterThan(before);
    expect(m.plan).toBeUndefined();
    expect(opinion(s, marks[1].id, schemer.id)).toBeLessThan(20);
    expect(m.why.length).toBeGreaterThan(0);
    // Its motives are secret until the boss has something on him.
    expect(mindView(s, schemer.id)!.why.length).toBe(0);
  });

  it('a coward drops a risky plan when he is scared', () => {
    const s = game();
    const M = ensureMinds(s);
    const k = capos(s)[0];
    withTraits(k, ['Cowardly']);
    M.minds[k.id] = { ...blankMind(k.id), sat: [50, 50, 0, 50, 50, 50, 50, 50] };
    const t = s.characters[s.rivals.find((r) => r.kind === 'mob')!.leaderId];
    M.minds[k.id].plan = { k: 'avenge', t: t.id, steps: ['learn', 'wait', 'strike'], i: 2, w: s.week, sw: s.week - 4, ad: 0, why: 'test' };
    workPlan(newCtx(s), M, outlook(s, k.id)!);
    expect(M.minds[k.id].plan).toBeUndefined();
    expect(M.stats.failed).toBeGreaterThan(0);
    considerPlan(s, M, outlook(s, k.id)!); // never throws on an empty slate
  });
});

describe('minds: in the week', () => {
  it('is deterministic, keeps the rival caps, bounds the save and records motives', () => {
    const run = () => {
      let s = newGame('minds-week');
      const reports = [];
      for (let i = 0; i < 40; i++) { const r = advanceWeek(s, {}); s = r.state; reports.push(r.report); }
      return { s, reports };
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a.s.minds)).toBe(JSON.stringify(b.s.minds));
    // Plain JSON numbers only (a NaN would not survive a save).
    expect(JSON.parse(JSON.stringify(a.s.minds))).toEqual(a.s.minds);
    // A loaded copy plays the same week.
    const x = advanceWeek(a.s, {}); const y = advanceWeek(JSON.parse(JSON.stringify(a.s)), {});
    expect(y.state.money).toBe(x.state.money);
    expect(JSON.stringify(y.state.minds)).toBe(JSON.stringify(x.state.minds));
    expect(a.s.money).toBe(b.s.money);
    for (const rep of a.reports) {
      const caps = rivalCaps({ week: rep.week } as GameState);
      const took = -rep.lines.filter((l) => l.category === 'rival' && l.stat === 'money').reduce((x, l) => x + l.amount, 0);
      expect(took).toBeLessThanOrEqual(Math.floor(rep.grossIncome * caps.moneyFrac) + 1);
      for (const bar of ['local', 'family', 'federal'] as const) {
        const h = rep.lines.filter((l) => l.category === 'rival' && l.stat === `heat.${bar}`).reduce((x, l) => x + l.amount, 0);
        expect(h).toBeLessThanOrEqual(caps.heatPerBar);
      }
    }
    const M = a.s.minds!;
    // The deeds (deeds/) give the minds more to remember and hear about: still every list within its per-mind cap.
    expect(JSON.stringify(M).length).toBeLessThan(75_000);
    expect(M.stats.thinks).toBeGreaterThan(100);
    const motives = Object.values(M.minds).flatMap((m) => m.why);
    expect(motives.length).toBeGreaterThan(0);
    for (const x of motives) expect(x.a.length).toBeGreaterThan(0);
  });

  it('upgradeSave leaves a save without minds alone, and a save with minds unchanged', () => {
    const s = newGame('minds-up');
    const before = JSON.stringify(s);
    upgradeSave(s);
    expect(s.minds).toBeUndefined();
    expect(JSON.stringify(s)).toBe(before);
    mindsWeek(newCtx(s));
    const w = JSON.stringify(s.minds);
    upgradeSave(s);
    expect(JSON.stringify(s.minds)).toBe(w);
  });

  it('the minds never draw on the main dice', () => {
    const s = newGame('minds-rng');
    const rng = s.rng;
    mindsWeek(newCtx(s));
    expect(s.rng).toBe(rng);
  });
});

describe('sit and talk', () => {
  const setup = () => {
    const s = game('minds-talk');
    const k = capos(s)[0];
    return { s, k };
  };

  it('the prompt carries the rules, his persona, the game facts and the allowlist', () => {
    const { s, k } = setup();
    addOpinion(s, k.id, s.playerId, 'old friends', 60, 0);
    const man = Object.values(s.characters).find((x) => x.alive && x.capoId === k.id)!;
    s.secrets.push({ id: 'xp1', ownerId: man.id, kind: 'debt', text: 'owes a shylock', knownBy: [], week: s.week });
    const p = buildTalkPrompt(s, k.id, [], 'Who do you trust?');
    const all = p.messages.map((m) => m.content).join('\n');
    expect(p.messages[0].role).toBe('user');
    expect(p.messages[p.messages.length - 1].role).toBe('user');
    expect(all).toContain(k.firstName);
    expect(all).toContain('Traits');
    expect(all).toContain('Mood');
    expect(all).toContain('opinion of the boss');
    expect(all).toMatch(/Never name or allude to real people/);
    expect(all).toMatch(/Romance or flirting only between adults/);
    expect(all).toMatch(/Never give real-world instructions/);
    expect(all).toContain('Who do you trust?');
    expect(p.allow).toContain('secret:xp1');
    expect(all).toContain('owes a shylock');
    expect(personaOf(s, k.id)).toContain('Ambition');
  });

  it('the validator clamps, rejects bad JSON and drops reveals not on the allowlist', () => {
    expect(validateTalk(null, []).ok).toBe(false);
    expect(validateTalk('hello', []).ok).toBe(false);
    expect(validateTalk({ reply: '' }, []).ok).toBe(false);
    expect(validateTalk({ reply: 42 }, []).ok).toBe(false);
    const v = validateTalk({ reply: 'Sure, boss.\u0007', mood_delta: 99, opinion_delta: -40, reveals: ['secret:ok', 'secret:nope', 7], lie: 'yes', intent: 'launch_missiles' }, ['secret:ok']);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.out.reply).toBe('Sure, boss.');
    expect(v.out.mood).toBe(10);
    expect(v.out.opinion).toBe(-5);
    expect(v.out.reveals).toEqual(['secret:ok']);
    expect(v.out.lie).toBe(false);
    expect(v.out.intent).toBe('deflect');
    const long = validateTalk({ reply: 'x'.repeat(5000), opinion_delta: '3' }, []);
    expect(long.ok && long.out.reply.length).toBe(700);
    expect(long.ok && long.out.opinion).toBe(3);
  });

  it('a talk costs the boss an hour, applies only bounded outcomes, and reveals only allowed secrets', () => {
    const { s, k } = setup();
    expect(canTalk(s, k.id).ok).toBe(true);
    const h0 = hoursUsed(s);
    const s1 = beginTalk(s, k.id);
    expect(hoursUsed(s1)).toBeCloseTo(h0 + 1);
    expect(s1.minds!.talk!.n).toBe(1);
    // Pure: the input is untouched.
    expect(s.minds!.talk).toBeUndefined();
    let x = s1;
    for (let i = 0; i < 6; i++) x = applyTalk(x, k.id, { reply: 'Grazie.', mood: 5, opinion: 5, reveals: ['secret:not-allowed'], lie: false, intent: 'agree' });
    const mod = x.relations[`${k.id}>${s.playerId}`].modifiers.find((m) => m.reason === TALK_REASON)!;
    expect(mod.value).toBeLessThanOrEqual(TALK_OPINION_CAP);
    expect(x.secrets.every((sec) => sec.id !== 'not-allowed')).toBe(true);
    expect(x.minds!.heard.length).toBe(0);
    expect(opinion(s, k.id, s.playerId)).toBe(opinion(s1, k.id, s.playerId));
  });

  it('allowed secret reveals become known; a lie reveals nothing', () => {
    const { s, k } = setup();
    addOpinion(s, k.id, s.playerId, 'old friends', 60, 0);
    const other = Object.values(s.characters).find((x) => x.alive && x.capoId === k.id)!;
    s.secrets.push({ id: 'xs1', ownerId: other.id, kind: 'affair', text: 'test secret', knownBy: [], week: s.week });
    expect(revealable(s, k.id).map((r) => r.id)).toContain('secret:xs1');
    const lied = applyTalk(s, k.id, { reply: '...', mood: 0, opinion: 0, reveals: ['secret:xs1'], lie: true, intent: 'confess' });
    expect(lied.secrets.find((x) => x.id === 'xs1')!.knownBy).not.toContain('player');
    const told = applyTalk(s, k.id, { reply: '...', mood: 0, opinion: 0, reveals: ['secret:xs1'], lie: false, intent: 'confess' });
    expect(told.secrets.find((x) => x.id === 'xs1')!.knownBy).toContain('player');
    expect(told.minds!.heard[0].text).toContain('test secret');
    expect(s.secrets.find((x) => x.id === 'xs1')!.knownBy).not.toContain('player');
  });

  it('without Claude the scripted lines answer from his mind', () => {
    const { s, k } = setup();
    const a = scriptedReply(s, k.id, 'How is the family?', 0);
    expect(a.reply.length).toBeGreaterThan(3);
    expect(Math.abs(a.opinion)).toBeLessThanOrEqual(1);
    const b = scriptedReply(s, k.id, 'How is the family?', 0);
    expect(b).toEqual(a);
    expect(scriptedReply(s, k.id, 'Is the envelope short?', 1).reply.length).toBeGreaterThan(3);
  });

  it('the talk window falls back when sample is absent (never touches the network)', async () => {
    const { loadSample, askJson, resetSample } = await import('../src/ui/minds/sampleClient');
    resetSample();
    expect(await loadSample()).toBeNull();
    const busy = Object.assign(async () => ({ text: '' }), { json: async () => { throw { code: 'rate_limited', message: '' }; } });
    expect((await askJson(busy, [])).kind).toBe('busy');
    const no = Object.assign(async () => ({ text: '' }), { json: async () => { throw { code: 'not_granted', message: '' }; } });
    expect((await askJson(no, [])).kind).toBe('off');
    resetSample();
    const yes = Object.assign(async () => ({ text: '' }), { json: async <T,>() => ({ reply: 'ok' }) as T });
    expect(await askJson(yes, [])).toEqual({ kind: 'ok', data: { reply: 'ok' } });
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { MindSection } = await import('../src/ui/minds/MindSection');
    const { s, k } = setup();
    const html = renderToString(createElement(MindSection, { s, c: k }));
    expect(html).toContain('sheet-mind');
    void player(s); void cloneState;
  });
});
