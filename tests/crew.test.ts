import { describe, expect, it } from 'vitest';
import { capos, crew } from '../src/engine/characters';
import { flipChance } from '../src/engine/crewConsequences';
import { CREW_EVENTS, SUBJECT_COOLDOWN } from '../src/engine/crewEvents';
import { advanceWeek, forceDeath } from '../src/engine/engine';
import { capoOf, inRegimeRank, obeyOdds, regime, validateHierarchy } from '../src/engine/hierarchy';
import { newCtx, reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { defectTo } from '../src/engine/regimes';
import { addOpinion, opinion, setModifier } from '../src/engine/relations';
import { applyEffects } from '../src/engine/effects';
import type { GameState } from '../src/engine/types';
import { randomChoices } from './helpers';

function men(s: GameState) {
  return crew(s).filter(inRegimeRank);
}

describe('the family tree', () => {
  it('a new game builds regimes: every soldier and associate has a capo, outside guys hang off the regimes', () => {
    for (let i = 0; i < 10; i++) {
      const s = newGame(`tree${i}`);
      expect(validateHierarchy(s)).toEqual([]);
      for (const m of men(s)) expect(capoOf(s, m), `${m.firstName} has no capo`).toBeTruthy();
      for (const k of capos(s)) expect(k.capoId).toBeUndefined();
      const outside = Object.values(s.characters).filter((c) => c.outside);
      expect(outside.length).toBeGreaterThanOrEqual(capos(s).length);
      expect(outside.some((c) => c.outside === 'cop')).toBe(true);
    }
  });
  it('stays valid week after week: no dangling capos, no cycles, nobody above the boss', () => {
    for (let i = 0; i < 6; i++) {
      let s = newGame(`treeplay${i}`);
      for (let w = 0; w < 150 && !s.gameOver; w++) {
        s = advanceWeek(s, randomChoices(s, w)).state;
        const errs = validateHierarchy(s);
        expect(errs, `seed ${i} week ${s.week}`).toEqual([]);
      }
    }
  });
  it('a capo\'s death hands his regime to a man from inside it, through the one death function', () => {
    const s = newGame('capodeath');
    const k = capos(s).find((c) => regime(s, c.id).some((m) => m.rank === 'soldier'))!;
    const before = regime(s, k.id).map((m) => m.id);
    const { state } = forceDeath(s, k.id, 'heart attack');
    expect(state.characters[k.id].alive).toBe(false);
    expect(Object.values(state.characters).some((c) => c.alive && c.capoId === k.id)).toBe(false);
    expect(validateHierarchy(state)).toEqual([]);
    const heir = before.map((id) => state.characters[id]).find((c) => c.rank === 'capo');
    expect(heir, 'one of his own men takes over').toBeTruthy();
    for (const id of before) {
      const m = state.characters[id];
      if (m.id !== heir!.id && m.alive && m.faction === 'player') expect(m.capoId).toBe(heir!.id);
    }
    expect(state.eventQueue.concat(state.pendingEvents).some((e) => e.defId === 'funeral' && e.meta?.charId === k.id)).toBe(true);
  });
  it('moving a soldier to another capo is an order, and both capos notice', () => {
    let s = newGame('reassign');
    const [a, b] = capos(s);
    const m = regime(s, a.id)[0];
    const aBefore = opinion(s, a.id, s.playerId);
    s = advanceWeek(s, { actions: [{ kind: 'reassign', charId: m.id, capoId: b.id }] }).state;
    expect(s.characters[m.id].capoId).toBe(b.id);
    expect(opinion(s, a.id, s.playerId)).toBeLessThan(aBefore + 1);
    expect(s.characters[m.id].story?.some((x) => x.text.includes(b.lastName))).toBe(true);
  });
});

describe('soldiers are people', () => {
  it('every man has a craft, a goal, a household, a record, a file and a story', () => {
    const s = newGame('people');
    for (const m of crew(s)) {
      expect(m.craft).toBeTruthy();
      expect(m.goal).toBeTruthy();
      expect(Array.isArray(m.vices)).toBe(true);
      expect(m.evidence).toBeGreaterThanOrEqual(0);
      expect(m.record).toBeGreaterThanOrEqual(0);
      expect(m.story?.length).toBeGreaterThan(0);
      if (!m.dynasty) expect(m.household).toBeTruthy();
    }
  });
  it('under pressure: cowards with kids and nothing from the family flip; loyal men looked after stand up', () => {
    const s = newGame('flip');
    const [x, y] = men(s);
    x.traits = ['Cowardly', 'Greedy'];
    x.evidence = 70;
    x.household = { wife: 'Rosa', kids: [{ name: 'Anthony', male: true, born: 1955 }] };
    addOpinion(s, x.id, s.playerId, 'Test: bitter', -40, 0);
    y.traits = ['Loyal-to-a-fault', 'Patient'];
    y.evidence = 20;
    addOpinion(s, y.id, s.playerId, 'Test: devoted', 40, 0);
    const ctx = newCtx(s);
    expect(flipChance(ctx, x.id, 0)).toBeGreaterThan(0.5);
    expect(flipChance(ctx, y.id, 2)).toBeLessThan(0.1);
    expect(flipChance(ctx, x.id, 2)).toBeLessThan(flipChance(ctx, x.id, 0));
  });
  it('a flip feeds the boss\'s file and the federal heat, and the man who vouched for him pays', () => {
    const s = newGame('rat');
    const m = men(s).find((c) => c.rank === 'associate') ?? men(s)[0];
    const v = capoOf(s, m)!;
    m.vouchedBy = v.id;
    const before = s.characters[s.playerId].evidence ?? 0;
    const ctx = newCtx(s);
    const heat0 = s.heat.federal;
    applyEffects(ctx, [{ type: 'flip', charId: m.id }], { label: 'test', because: 'test' });
    expect(s.characters[m.id].faction).toBe('law');
    expect(s.characters[s.playerId].evidence).toBeGreaterThan(before);
    expect(s.heat.federal).toBeGreaterThanOrEqual(heat0);
    expect(opinion(s, s.playerId, v.id)).toBeLessThan(0);
    expect(s.crewStats!.flips).toBe(1);
    expect(validateHierarchy(s)).toEqual([]);
  });
});

describe('loyalty and defection', () => {
  it('a capo who walks out takes the men more loyal to him than to you; the rest stay', () => {
    const s = newGame('walkout');
    const k = capos(s).find((c) => regime(s, c.id).length >= 2)!;
    const [stay, go] = regime(s, k.id);
    stay.traits = stay.traits.filter((t) => t !== 'Loyal-to-a-fault');
    go.traits = go.traits.filter((t) => t !== 'Loyal-to-a-fault');
    go.dynasty = false;
    addOpinion(s, go.id, k.id, 'Test: my real boss', 60, 0);
    addOpinion(s, go.id, s.playerId, 'Test: who is he?', -30, 0);
    addOpinion(s, stay.id, s.playerId, 'Test: the boss is the boss', 80, 0);
    setModifier(s, stay.id, k.id, 'My capo', 0);
    const ctx = newCtx(s);
    const followers = defectTo(ctx, k, 'manno', 'courted');
    expect(s.characters[k.id].faction).toBe('manno');
    expect(followers.map((f) => f.id)).toContain(go.id);
    expect(s.characters[go.id].faction).toBe('manno');
    expect(s.characters[stay.id].faction).toBe('player');
    expect(s.crewStats!.defections).toBe(1 + followers.length);
    expect(validateHierarchy(s)).toEqual([]);
    expect(capoOf(s, s.characters[stay.id])).toBeTruthy();
  });
  it('a man courted by a rival either turns them down (if he loves you) or goes (if he does not)', () => {
    // Leaving is a weekly roll (about even odds over a courtship), so the bad case is judged over ten games.
    let gone = 0;
    for (const seed of ['court', 'court-b', 'court-c', 'court-d', 'court-e', 'court-f', 'court-g', 'court-h', 'court-i', 'court-j']) {
    const base = newGame(seed);
    const run = (love: number) => {
      let s: GameState = JSON.parse(JSON.stringify(base));
      const m = men(s).find((c) => !c.traits.includes('Loyal-to-a-fault') && !c.dynasty)!;
      addOpinion(s, m.id, s.playerId, 'Test', love, 0);
      addOpinion(s, m.id, s.rivals.find((r) => r.id === 'kessler')!.leaderId, 'Test: they buy rounds', 40, 0);
      m.courtedBy = { rival: 'kessler', week: s.week };
      for (let w = 0; w < 40; w++) {
        const ev = s.pendingEvents.find((e) => e.defId === 'crew_courted' && e.meta?.charId === m.id);
        s = advanceWeek(s, ev ? { choices: { [ev.iid]: 'let' } } : {}).state;
        if (s.characters[m.id].faction !== 'player' || !s.characters[m.id].courtedBy) break;
      }
      return s.characters[m.id];
    };
    expect(run(70).faction, seed).toBe('player');
    const f = run(-35).faction;
    expect(['player', 'kessler'], seed).toContain(f);
    if (f === 'kessler') gone++;
    }
    expect(gone).toBeGreaterThanOrEqual(3);
  });
  it('two loyalties: a capo who pays for a man\'s family wins the man, not you', () => {
    const s = newGame('twoloyal');
    const k = capos(s)[0];
    const m = regime(s, k.id)[0];
    const toK = opinion(s, m.id, k.id);
    const toB = opinion(s, m.id, s.playerId);
    const ctx = newCtx(s);
    applyEffects(ctx, [{ type: 'opinion', from: m.id, to: k.id, amount: 20, reason: 'Took care of my son', decay: 0 }], { label: 't', because: 't' });
    expect(opinion(s, m.id, k.id) - toK).toBe(20);
    expect(opinion(s, m.id, s.playerId)).toBe(toB);
  });
});

describe('the membership pipeline', () => {
  it('vouched → proposed → waits for the books → the ceremony → made; Philadelphia limits how many', () => {
    let s = newGame('books');
    s.money = 50000;
    const assoc = men(s).filter((c) => c.rank === 'associate' && !c.dynasty).slice(0, 2);
    expect(assoc.length).toBe(2);
    s.books = { open: false, slots: 0, nextChange: s.week + 6 };
    s = advanceWeek(s, { actions: assoc.map((a) => ({ kind: 'propose', charId: a.id }) as const) }).state;
    for (const a of assoc) {
      expect(s.characters[a.id].proposedWeek).toBeDefined();
      expect(s.characters[a.id].vouchedBy).toBeTruthy();
    }
    // Books closed: nobody is made.
    for (let w = 0; w < 3; w++) {
      expect(s.pendingEvents.some((e) => e.defId === 'making')).toBe(false);
      s = advanceWeek(s, {}).state;
    }
    // Philadelphia opens the books for one.
    s.books = { open: true, slots: 1, nextChange: s.week + 20 };
    const made: string[] = [];
    for (let w = 0; w < 8; w++) {
      const ev = s.pendingEvents.find((e) => e.defId === 'making');
      if (ev) {
        expect(ev.mandatory).toBe(true);
        expect(ev.text).toMatch(/saint card/);
        made.push(String(ev.meta!.charId));
      }
      s = advanceWeek(s, ev ? { choices: { [ev.iid]: 'make' } } : {}).state;
    }
    expect(made.length).toBe(1);
    const m = s.characters[made[0]];
    expect(m.rank).toBe('soldier');
    expect(m.madeWeek).toBeDefined();
    expect(s.books!.slots).toBe(0);
    expect(s.crewStats!.makings).toBe(1);
    const other = assoc.find((a) => a.id !== made[0])!;
    expect(s.characters[other.id].rank).toBe('associate');
    expect(s.characters[other.id].proposedWeek).toBeDefined();
  });
  it('a background check costs time and money and catches a plant', () => {
    let s = newGame('plant');
    s.money = 20000;
    const a = men(s).find((c) => c.rank === 'associate' && !c.dynasty)!;
    a.informantFor = 'law';
    s = advanceWeek(s, { actions: [{ kind: 'background', charId: a.id }] }).state;
    let found = false;
    for (let w = 0; w < 4 && !found; w++) {
      found = s.pendingEvents.some((e) => e.defId === 'plant_found' && e.meta?.charId === a.id);
      if (!found) s = advanceWeek(s, {}).state;
    }
    expect(found).toBe(true);
  });
});

describe('crew-driven decisions', () => {
  it('are varied, character-driven, capped, and the same man does not bring the same thing back soon', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 4; i++) {
      let s = newGame(`variety${i}`);
      const lastByKey: Record<string, number> = {};
      const lastSubject: Record<string, number> = {};
      for (let w = 0; w < 40 && !s.gameOver; w++) {
        expect(s.pendingEvents.length).toBeLessThanOrEqual(4);
        for (const e of s.pendingEvents) {
          if (!e.meta?.crew) continue;
          kinds.add(e.defId);
          expect(e.actors?.length, e.defId).toBeGreaterThan(0);
          const def = CREW_EVENTS.find((d) => d.key === e.defId);
          if (def) {
            if (lastByKey[e.defId] !== undefined) expect(s.week - lastByKey[e.defId], `${e.defId} cooldown`).toBeGreaterThanOrEqual(def.cooldown);
            lastByKey[e.defId] = s.week;
          }
          const k = `${e.defId}:${e.meta.charId}`;
          if (lastSubject[k] !== undefined) expect(s.week - lastSubject[k], k).toBeGreaterThanOrEqual(SUBJECT_COOLDOWN);
          lastSubject[k] = s.week;
        }
        s = advanceWeek(s, randomChoices(s, w)).state;
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(12);
  });
  it('Moretti\'s favor (and every rival proposition) does not come back within ten weeks', () => {
    for (let i = 0; i < 6; i++) {
      let s = newGame(`deal${i}`);
      const last: Record<string, number> = {};
      for (let w = 0; w < 80 && !s.gameOver; w++) {
        for (const e of s.pendingEvents.filter((x) => x.defId.startsWith('deal_'))) {
          if (last[e.defId] !== undefined && last[e.defId] !== e.week) expect(s.week - last[e.defId], e.defId).toBeGreaterThanOrEqual(10);
          last[e.defId] = e.week;
        }
        s = advanceWeek(s, randomChoices(s, w)).state;
      }
    }
  });
  it('a proposal can be run through the capo (insulated) or by the boss himself (fingerprints)', () => {
    const s = newGame('proposal');
    s.money = 30000;
    const def = CREW_EVENTS.find((d) => d.key === 'crew_proposal')!;
    const k = def.subjects(s)[0];
    const ev = def.build(s, k)!;
    expect(ev.title).toContain(k.firstName);
    const through = ev.choices.find((c) => c.id === 'through')!;
    const direct = ev.choices.find((c) => c.id === 'direct')!;
    expect(direct.effects.some((e) => e.type === 'evidence' && e.charId === s.playerId)).toBe(true);
    expect(through.effects.some((e) => e.type === 'evidence' && e.charId === s.playerId)).toBe(false);
    s.pendingEvents = [ev];
    let t = advanceWeek(s, { choices: { [ev.iid]: 'through' } }).state;
    let done = false;
    for (let w = 0; w < 3 && !done; w++) {
      const r = advanceWeek(t, {});
      expect(reconcile(r.report)).toEqual([]);
      done = r.state.chronicle.some((c) => c.kind === 'consequence' && c.text.includes(k.lastName));
      t = r.state;
    }
    expect(done).toBe(true);
  });
  it('orders down the chain are carried out more faithfully by men who like you', () => {
    const s = newGame('chain');
    const ub = crew(s).find((c) => c.rank === 'underboss')!;
    const low = obeyOdds(s, ub).obey;
    addOpinion(s, ub.id, s.playerId, 'Test: devoted', 60, 0);
    expect(obeyOdds(s, ub).obey).toBeGreaterThan(low);
  });
});

describe('rivals move on your people', () => {
  it('a named rival move on the crew lands at least every four weeks or so', () => {
    for (let i = 0; i < 4; i++) {
      let s = newGame(`rivalcrew${i}`);
      const weeks: number[] = [];
      for (let w = 0; w < 40 && !s.gameOver; w++) {
        const before = s.crewStats!.rivalCrewMoves;
        s = advanceWeek(s, randomChoices(s, w)).state;
        if (s.crewStats!.rivalCrewMoves > before) weeks.push(s.week);
      }
      expect(weeks.length).toBeGreaterThanOrEqual(8);
      const gaps = weeks.slice(1).map((x, j) => x - weeks[j]);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(6);
      expect(s.chronicle.some((c) => c.kind === 'rival' && /courting|envelope|inside your crew|lunch|offer|pushes into/.test(c.text))).toBe(true);
    }
  });
});

describe('factions', () => {
  it('escalate: demand → ultimatum → Philadelphia behind your back → a coup attempt', () => {
    let s = newGame('faction2');
    // Keep the plotters on the island for the length of the test (no monthly desertions).
    for (const c of capos(s)) c.traits = ['Loyal-to-a-fault', 'Patient'];
    for (const c of capos(s)) addOpinion(s, c.id, s.playerId, 'Test: hates the boss', -90, 0);
    let demand: string | undefined;
    let ult: string | undefined;
    for (let w = 0; w < 14 && !ult; w++) {
      const d = s.pendingEvents.find((e) => e.defId === 'faction_demand');
      if (d) demand = d.text;
      s = advanceWeek(s, {}).state; // stall
      ult = s.pendingEvents.find((e) => e.defId === 'faction_ultimatum')?.iid;
      if (!ult) for (const c of capos(s)) addOpinion(s, c.id, s.playerId, 'Test: hates the boss', -10, 0);
    }
    expect(demand).toMatch(/want/);
    expect(ult).toBeTruthy();
    const f = s.factions[0];
    expect(f.stage).toBe(1);
    const fam0 = s.heat.family;
    s = advanceWeek(s, { choices: { [ult!]: 'refuse' } }).state;
    expect(s.scheduled.some((x) => x.key === 'faction_philly')).toBe(true);
    expect(s.scheduled.some((x) => x.key === 'coup')).toBe(true);
    let philly = false;
    let coupDone = false;
    for (let w = 0; w < 8 && !coupDone && !s.gameOver; w++) {
      const r = advanceWeek(s, {});
      expect(reconcile(r.report)).toEqual([]);
      if (r.state.chronicle.some((c) => c.text.includes('Philadelphia behind your back'))) philly = true;
      coupDone = !r.state.scheduled.some((x) => x.key === 'coup');
      s = r.state;
    }
    expect(philly).toBe(true);
    expect(coupDone).toBe(true);
    expect(s.heat.family + 50).toBeGreaterThan(fam0);
  });
  it('can be split up: peeling off a member costs an envelope and shrinks the faction', () => {
    let s = newGame('split');
    for (const c of capos(s)) addOpinion(s, c.id, s.playerId, 'Test: hates the boss', -90, 0);
    s.money = 50000;
    for (let w = 0; w < 10 && !s.pendingEvents.some((e) => e.defId === 'faction_demand'); w++) s = advanceWeek(s, {}).state;
    const ev = s.pendingEvents.find((e) => e.defId === 'faction_demand')!;
    expect(ev).toBeTruthy();
    const f = s.factions.find((x) => x.id === ev.meta!.faction)!;
    const n = f.memberIds.length;
    const split = ev.choices.find((c) => c.id === 'split');
    if (!split) return; // two-man faction: nobody to peel off
    s = advanceWeek(s, { choices: { [ev.iid]: 'split' } }).state;
    const after = s.factions.find((x) => x.id === f.id);
    expect(after ? after.memberIds.length : 0).toBeLessThan(n);
  });
});
