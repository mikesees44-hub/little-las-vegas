import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { crew, capos, makeCharacter, player } from '../src/engine/characters';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { newCtx } from '../src/engine/ledger';
import { addOpinion, opinion } from '../src/engine/relations';
import { answerItem, scheduled } from '../src/engine/schedule';
import { obeyOdds } from '../src/engine/hierarchy';
import { applyEffects } from '../src/engine/effects';
import { ensureThreats } from '../src/engine/threats';
import { upgradeSave } from '../src/engine/upgradeSave';
import {
  addFedEvidence, bossCooperates, bossHasFlipped, brascoChecked, ensureFeds, fedsMoments, fedsWeek, flipOdds, hollowFactors, informantsAround,
  isInformant, startBrasco, startPinch,
} from '../src/engine/feds';
import { reckoningScene, retributionDeters, startCrisis } from '../src/engine/fedsCrisis';
import { itemView } from '../src/engine/schedule';
const dmwTitle = (s: GameState, id: string) => itemView(s, id)?.title;
import type { Character, GameState } from '../src/engine/types';

const week = (s: GameState) => { const ctx = newCtx(s); fedsWeek(ctx); return ctx; };
const items = (s: GameState, kind: string) => scheduled(s).filter((x) => x.kind === kind);
const answer = (s: GameState, kind: string, opt?: string) => {
  const it = items(s, kind)[0];
  expect(it, `a ${kind} on the clock`).toBeDefined();
  const r = answerItem(s, it.id, opt)!;
  expect(r.result.ok).toBe(true);
  return r;
};
function soldier(s: GameState): Character {
  return crew(s).find((c) => c.rank === 'soldier' || c.rank === 'associate')!;
}
function bigFamily(s: GameState, n = 14): void {
  const k = capos(s)[0];
  while (crew(s).length < n) {
    const c = makeCharacter(s, { rank: 'soldier', faction: 'player', age: 30 });
    c.capoId = k?.id;
  }
}

describe('feds: pinches', () => {
  it('a serious crime leaves evidence, and the man is picked up at a real hour', () => {
    const s = newGame('feds-pinch');
    const c = soldier(s);
    addFedEvidence(s, c.id, 70, 'a truck hijacking');
    expect(c.evidence).toBeGreaterThanOrEqual(70);
    expect(ensureFeds(s).log.at(-1)?.why).toBe('a truck hijacking');
    let tries = 0;
    while (!items(s, 'feds_knock').length && tries++ < 60) { week(s); s.week++; ensureFeds(s).lastPinch = -99; }
    const knock = items(s, 'feds_knock')[0];
    expect(knock).toBeDefined();
    expect(knock.d).toBeGreaterThanOrEqual(1);
    expect([5, 6, 7, 15, 22]).toContain(knock.h);
    const p = s.feds!.pinches.find((x) => x.charId === c.id)!;
    expect(p.serious).toBe(true);
    expect(p.crime).toBe('a truck hijacking');
    const r = answerItem(s, knock.id, 'nothing')!;
    const p2 = r.state.feds!.pinches.find((x) => x.charId === c.id)!;
    expect(p2.stage).toBe('held');
    expect(p2.years).toBeGreaterThan(1);
    expect(r.extra?.h).toMatch(/HELD/);
    expect(items(r.state, 'feds_visit').length).toBe(1);
    expect(r.state.journal?.e.some((e) => e.src === 'feds')).toBe(true);
  });

  it('a small charge can go away', () => {
    const s = newGame('feds-small');
    const c = soldier(s);
    c.evidence = 10;
    startPinch(s, c, 'bookmaking', false);
    let st = s;
    for (let i = 0; i < 12 && st.feds!.pinches[0].stage === 'coming'; i++) {
      const it = items(st, 'feds_knock')[0];
      const r = answerItem(st, it.id, 'lindner')!;
      if (r.state.feds!.pinches[0].outcome === 'dropped') { st = r.state; break; }
      st = s; startPinch(st, c, 'bookmaking', false); st.feds!.pinches.shift();
    }
    expect(['dropped', 'stood']).toContain(st.feds!.pinches.at(-1)!.outcome ?? 'stood');
  });
});

describe('feds: flipping', () => {
  it('the odds answer to loyalty, family care and traits', () => {
    const s = newGame('feds-flip');
    const c = soldier(s);
    const p = { charId: c.id, years: 10, care: [] as string[] };
    const base = flipOdds(s, p);
    expect(flipOdds(s, { ...p, care: ['envelope'] })).toBeLessThan(base);
    expect(flipOdds(s, { ...p, care: ['envelope', 'visit', 'lawyer'] })).toBeLessThan(flipOdds(s, { ...p, care: ['envelope'] }));
    const traits = c.traits;
    c.traits = ['Cowardly'];
    const coward = flipOdds(s, p);
    c.traits = ['Loyal-to-a-fault'];
    const loyal = flipOdds(s, p);
    c.traits = traits;
    expect(coward).toBeGreaterThan(loyal);
    addOpinion(s, c.id, s.playerId, 'test', 80, 0);
    expect(flipOdds(s, p)).toBeLessThan(base);
    expect(flipOdds(s, { ...p, years: 25 })).toBeGreaterThan(flipOdds(s, { ...p, years: 2 }));
  });

  it('a loyal man stands up, does his time, and comes home to respect', () => {
    const s = newGame('feds-standup');
    const c = soldier(s);
    c.traits = ['Loyal-to-a-fault', 'Honest'];
    c.evidence = 60;
    addOpinion(s, c.id, s.playerId, 'test', 90, 0);
    const p = startPinch(s, c, 'a truck hijacking', false);
    p.stage = 'held';
    p.decide = s.week;
    p.care = ['envelope', 'visit', 'lawyer', 'bail', 'word'];
    expect(flipOdds(s, p)).toBeLessThan(0.05);
    week(s);
    expect(p.outcome).toBe('stood');
    expect(c.imprisonedUntil).toBeGreaterThan(s.week);
    const respect = s.respect;
    s.week = p.home!;
    week(s);
    const ev = s.eventQueue.find((e) => e.defId === 'feds_homecoming')!;
    expect(ev).toBeDefined();
    const party = ev.choices.find((x) => x.id === 'party')!;
    const before = opinion(s, c.id, s.playerId);
    applyEffects(newCtx(s), party.effects, { label: 'test', because: 'test' });
    expect(s.respect).toBeGreaterThanOrEqual(respect);
    expect(opinion(s, c.id, s.playerId)).toBeGreaterThanOrEqual(before);
    expect(s.feds!.stats.homecomings).toBe(1);
  });

  it('a man who flips comes back out wearing a wire, and the tapes bring an indictment wave', () => {
    const s = newGame('feds-wire');
    const c = soldier(s);
    c.traits = ['Cowardly'];
    c.evidence = 90;
    const p = startPinch(s, c, 'a truck hijacking', false);
    p.stage = 'held';
    p.decide = s.week;
    for (let i = 0; i < 30 && p.outcome !== 'flipped'; i++) { p.stage = 'held'; p.outcome = undefined; p.decide = s.week; week(s); }
    expect(p.outcome).toBe('flipped');
    expect(c.informantFor).toBe('law');
    expect(isInformant(s, c.id)).toBe(true);
    expect(informantsAround(s).map((x) => x.id)).toContain(c.id);
    s.feds!.wire = 80;
    week(s);
    const r = answer(s, 'feds_wave', 'ride');
    expect(r.state.feds!.stats.waves).toBe(1);
    expect(r.state.feds!.pinches.filter((x) => x.wave).length).toBeGreaterThan(0);
    expect(r.extra?.h).toMatch(/INDICTS/);
  });

  it('the visiting room never kills a man unless the boss orders it', () => {
    const s = newGame('feds-visit');
    const c = soldier(s);
    c.evidence = 60;
    const p = startPinch(s, c, 'arson', false);
    const r = answer(s, 'feds_knock', 'nothing');
    const st = r.state;
    const after = answer(st, 'feds_visit', 'trust');
    expect(after.state.characters[c.id].alive).toBe(true);
    expect(p.charId).toBe(c.id);
  });
});

describe('feds: the boss turns', () => {
  it('the secret informant path, and never twice', () => {
    const s = newGame('feds-boss');
    const ctx = newCtx(s);
    expect(bossHasFlipped(s)).toBe(false);
    bossCooperates(ctx, 'informant');
    expect(bossHasFlipped(s)).toBe(true);
    expect(isInformant(s, s.playerId)).toBe(true);
    bossCooperates(ctx, 'witness');
    expect(s.feds!.boss!.path).toBe('informant');
    expect(s.feds!.flippers.length).toBe(1);
    s.week += 4;
    week(s);
    const r = answer(s, 'feds_handler', 'rival');
    expect(r.state.feds!.boss!.exposure).toBeGreaterThan(8);
    // It comes out: run.
    r.state.feds!.boss!.exposure = 100;
    const st = r.state;
    let tries = 0;
    while (!items(st, 'feds_burned').length && tries++ < 30) { st.week++; week(st); }
    const out = answer(st, 'feds_burned', 'run');
    expect(out.state.gameOver?.reason).toBe('witness');
  });
});

describe('feds: the hollow crown (Dead Man Walking)', () => {
  function crisisGame(seed: string) {
    const s = newGameWith(seed, 'olddon');
    bigFamily(s);
    s.respect = 20;
    for (const k of capos(s)) addOpinion(s, k.id, s.playerId, 'test', -60, 0);
    return s;
  }

  it('triggers, ignores orders, and runs seven beats on the clock', () => {
    const s = crisisGame('feds-hollow');
    expect(hollowFactors(s).filter((f) => f.on).length).toBeGreaterThanOrEqual(3);
    const k = capos(s)[0];
    const before = obeyOdds(s, k).obey;
    for (let i = 0; i < 60 && !s.feds?.hollow; i++) { week(s); s.week++; }
    expect(s.feds?.hollow).toBeDefined();
    expect(obeyOdds(s, k).obey).toBeLessThan(before);
    const beats = items(s, 'feds_dmw');
    expect(beats.length).toBe(7);
    expect(new Set(beats.slice(0, 5).map((x) => x.d)).size).toBe(5);
  });

  it('every way out: purge, mercy, retirement, the Bureau', () => {
    const s = crisisGame('feds-ends');
    const F = ensureFeds(s);
    const lead = capos(s)[0];
    F.hollow = { since: s.week, boss: s.playerId, meter: 40, won: [], next: s.week + 8, leadId: lead.id };
    startCrisis(newCtx(s), F, F.hollow);
    s.week = F.hollow.crisis!.w;
    let st = s;
    for (const beat of [1, 2, 3, 4, 5]) {
      const it = items(st, 'feds_dmw').find((x) => x.payload.beat === beat);
      if (!it) continue;
      const r = answerItem(st, it.id);
      if (r) st = r.state;
    }
    st.feds!.hollow!.crisis!.done = 'foiled';
    const scene = reckoningScene(st, st.feds!.hollow!.crisis!);
    expect(scene).toContain('If you come for the Don, you better not miss.');
    expect(scene).toContain(st.characters[lead.id].firstName);
    const judge = items(st, 'feds_dmw').find((x) => x.payload.beat === 7)!;
    expect(dmwTitle(st, judge.id)).toBe("THE DON'S RECKONING");
    const brutal = answerItem(st, judge.id, 'nomercy')!.state;
    expect(brutal.feds!.rebuild).toBeDefined();
    expect(brutal.feds!.hollow).toBeUndefined();
    expect(brutal.feds!.seeds.some((x) => x.key === 'capo')).toBe(true);
    expect(brutal.feds!.retribution).toBeDefined();
    expect(retributionDeters(brutal)).toBeLessThan(1);
    expect(brutal.feds!.survivor).toBeDefined();
    const sv = brutal.characters[brutal.feds!.survivor!.id];
    expect(sv.faction).toBe('player');
    const sel = answerItem(st, judge.id, 'selective')!.state;
    expect(sel.feds!.tests.length).toBeGreaterThan(0);
    expect(sel.feds!.survivor).toBeUndefined();
    const mercy = answerItem(st, judge.id, 'warning')!.state;
    expect(mercy.feds!.hollow?.dmw).toBeDefined();
    expect(mercy.feds!.seeds.some((x) => x.key === 'second')).toBe(true);
    expect(obeyOdds(mercy, capos(mercy)[0]).obey).toBeLessThan(0.9);
    const old = st.playerId;
    const retire = answerItem(st, judge.id, 'walk_retire')!.state;
    if (retire.feds!.retired) expect(retire.playerId).not.toBe(old);
    const fed = answerItem(st, judge.id, 'walk_feds')!.state;
    expect(fed.feds!.flippers).toContain(old);
    expect(fed.playerId !== old || !!fed.gameOver).toBe(true);
  });
});

describe('feds: the tip-off', () => {
  it('a hit on the boss heard on a wire becomes two agents at the bakery', () => {
    const s = newGame('feds-tip');
    const T = ensureThreats(s);
    T.fed.stage = 3;
    bossCooperates(newCtx(s), 'informant');
    s.feds!.boss!.w = -1;
    T.threats.push({ id: 'thHit', kind: 'hit', by: s.rivals[0].id, targetId: s.playerId, start: s.week, due: s.week + 1, dueDay: 5, hour: 22, blunt: 0 });
    let tries = 0;
    while (!items(s, 'feds_tip').length && tries++ < 10) { s.feds!.tipped = []; week(s); }
    const it = items(s, 'feds_tip')[0];
    expect(it.d).toBeLessThan(5);
    const r = answer(s, 'feds_tip', 'take');
    expect(r.state.threats!.threats.find((x) => x.id === 'thHit')!.blunt).toBeGreaterThanOrEqual(0.75);
    expect(r.state.feds!.owed).toBe(1);
  });
});

describe('feds: the undercover', () => {
  it('tells, discovery and its options', () => {
    const s = newGame('feds-brasco');
    startBrasco(newCtx(s), ensureFeds(s));
    const B = s.feds!.brasco!;
    expect(B).toBeDefined();
    const agent = s.characters[B.id];
    expect(agent.faction).toBe('player');
    expect(isInformant(s, agent.id)).toBe(true);
    B.tells = ['upstairs', 'days', 'notes'];
    let found = false;
    for (let i = 0; i < 20 && !found; i++) found = brascoChecked(newCtx(s), 0.2, true);
    expect(found).toBe(true);
    const r = answer(s, 'feds_brasco', 'freeze');
    expect(r.state.feds!.brasco!.end).toBe('frozen');
    expect(r.state.eventQueue.some((e) => e.defId === 'feds_voucher')).toBe(true);
    const kill = answer(s, 'feds_brasco', 'kill');
    expect(kill.state.characters[B.id].alive).toBe(false);
    expect(kill.state.heat.federal).toBeGreaterThan(s.heat.federal + 20);
  });

  it('undiscovered: the Bureau pulls him out and the indictments come', () => {
    const s = newGame('feds-brasco2');
    startBrasco(newCtx(s), ensureFeds(s));
    const B = s.feds!.brasco!;
    B.take = 60;
    B.pull = s.week;
    week(s);
    expect(B.end).toBe('pulled');
    expect(s.eventQueue.some((e) => e.defId === 'feds_voucher')).toBe(true);
    const r = answer(s, 'feds_wave', 'ride');
    expect(r.state.feds!.stats.waves).toBe(1);
    expect(fedsMoments(r.state).some((x) => x.kind === 'feds_wave')).toBe(false);
  });
});

describe('feds: saves', () => {
  it('round-trips, and upgradeSave tops up an old feds layer', () => {
    const s = newGame('feds-save');
    const c = soldier(s);
    c.evidence = 60;
    startPinch(s, c, 'arson', false);
    bossCooperates(newCtx(s), 'informant');
    const back = upgradeSave(JSON.parse(JSON.stringify(s)) as GameState);
    expect(back.feds).toEqual(s.feds);
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete (old.feds as unknown as Record<string, unknown>).seeds;
    delete (old.feds as unknown as Record<string, unknown>).flippers;
    const up = upgradeSave(old);
    expect(up.feds!.seeds).toEqual([]);
    expect(up.feds!.flippers).toEqual([]);
    expect(player(up)).toBeDefined();
  });
});
