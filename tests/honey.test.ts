import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { makeCharacter, player } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { setDatingSettings } from '../src/engine/datingState';
import { upgradeSave } from '../src/engine/upgradeSave';
import { mindsWeek } from '../src/engine/minds';
import { mindOf } from '../src/engine/minds/state';
import { ensureDeeds } from '../src/engine/deeds';
import { track } from '../src/engine/intrigue';
import { opinion } from '../src/engine/relations';
import { ensureThreats, lureOdds, planLure, threatsWeek } from '../src/engine/threats';
import { createGuard } from '../src/engine/protect';
import { previewAction } from '../src/engine/actions';
import { affairFor, wifeFor } from '../src/engine/womenCore';
import {
  applyHoneyOp, claimFrom, claimRows, honeyActionsFor, honeyWeek, leakIntel, mistressRows, previewHoney, scornAdd, scornRows, turnOdds, watchRows,
} from '../src/engine/honey';
import { approachOdds, closeOdds, dareRead, runDare, type DareMove } from '../src/engine/honeyScript';
import { ensureHoney, type Agent } from '../src/engine/honeyState';
import { SCENE_ERRORS, SCENES } from '../src/engine/authored/library';
import { isMature, tryScene, whenOk } from '../src/engine/authored/run';
import { validateScenes } from '../src/engine/authored/validate';
import type { Character, GameState, RivalId, Trait } from '../src/engine/types';

const ctxOp = (s: GameState, o: Parameters<typeof applyHoneyOp>[1]) => { const ctx = newCtx(s); applyHoneyOp(ctx, o); return ctx; };

function woman(s: GameState, age = 27, traits: Trait[] = []): Character {
  const c = makeCharacter(s, { gender: 'F', age, rank: 'civilian', faction: 'none', nickname: false });
  c.traits = traits;
  c.orientation = 'straight';
  return c;
}

/** A woman the boss is having an affair with (so the dare and the rest can touch her). */
function lover(s: GameState, traits: Trait[] = [], age = 27): Character {
  const c = woman(s, age, traits);
  const a = affairFor(s, c.id);
  a.stage = 'affair';
  a.since = s.week - 6;
  a.last = s.week;
  a.aff = 40;
  return c;
}

function crewMan(s: GameState, i = 0): Character {
  return Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.gender === 'M' && c.id !== s.playerId && c.rank !== 'civilian').sort((a, b) => (a.id < b.id ? -1 : 1))[i];
}

function agent(s: GameState, id: string, kind: Agent['kind'], master: Agent['master'] = 'kessler'): Agent {
  const H = ensureHoney(s);
  const a: Agent = { id, kind, master, since: s.week, status: 'working', intel: 0 };
  H.agents[id] = a;
  H.seen[id] = s.week;
  return a;
}

/** Find the first approach whose reply matches. */
function firstWith(pred: (moves: DareMove[]) => boolean): DareMove[] | undefined {
  for (const a of ['flirt', 'dare', 'flatter', 'status', 'money'] as DareMove[]) if (pred([a])) return [a];
  return undefined;
}

describe('honey: the bold dare script', () => {
  it('is deterministic, offers every line with visible odds, and the order replays it', () => {
    const s = newGame('h-dare');
    const c = lover(s);
    const r0 = runDare(s, c.id, 'office');
    expect(r0.block).toBeUndefined();
    expect(r0.options.map((o) => o.move)).toEqual(['flirt', 'dare', 'money', 'flatter', 'status']);
    for (const o of r0.options) { expect(o.odds).toBeGreaterThanOrEqual(0); expect(o.odds).toBeLessThanOrEqual(1); expect(o.say.length).toBeGreaterThan(10); }
    // Play it out on the first option every beat: same moves, same scene.
    let moves: DareMove[] = [];
    for (let i = 0; i < 3; i++) { const r = runDare(s, c.id, 'office', moves); if (r.end) break; moves = [...moves, r.options[0].move]; }
    const a = runDare(s, c.id, 'office', moves);
    const b = runDare(s, c.id, 'office', moves);
    expect(a.end).toBeDefined();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const p = previewAction(s, { kind: 'honey', op: { op: 'dare', id: c.id, at: 'office', moves } });
    expect(p.disabledReason).toBeUndefined();
    expect(p.acceptance).toBeUndefined();
    // An unfinished scene is not an order.
    expect(previewHoney(s, { op: 'dare', id: c.id, at: 'office', moves: [] }).disabledReason).toMatch(/end/);
  });

  it('her answers come from her traits: a dare suits a hothead, not a coward; flattery and money read differently; faith is a line', () => {
    const s = newGame('h-traits');
    const hot = lover(s, ['Hot-headed', 'Gambler']);
    const shy = lover(s, ['Cowardly', 'Paranoid']);
    const pious = lover(s, ['Pious']);
    const greedy = lover(s, ['Greedy']);
    const dh = approachOdds(s, dareRead(s, hot.id), 'dare');
    const ds = approachOdds(s, dareRead(s, shy.id), 'dare');
    expect(dh).toBeGreaterThan(ds);
    expect(approachOdds(s, dareRead(s, greedy.id), 'money')).toBeGreaterThan(approachOdds(s, dareRead(s, shy.id), 'money'));
    const rp = dareRead(s, pious.id);
    expect(rp.line).toBe('Her faith');
    for (const a of ['flirt', 'dare', 'money', 'flatter', 'status'] as const) expect(approachOdds(s, rp, a)).toBeLessThanOrEqual(0.15);
    expect(closeOdds(s, rp, 'desk')).toBe(0);
    // A pious woman never says yes, whatever he says.
    const all = (moves: DareMove[]): string[] => { const r = runDare(s, pious.id, 'club', moves); return r.end ? [r.end] : r.options.flatMap((o) => all([...moves, o.move])); };
    expect(all([]).includes('yes')).toBe(false);
  });

  it('a woman working him is suspiciously easy, steers him upstairs or out, and a set-up becomes a lure', () => {
    const s = newGame('h-agentdare');
    const plain = lover(s);
    const spy = lover(s);
    agent(s, spy.id, 'rival');
    expect(dareRead(s, spy.id).g).toBeGreaterThan(dareRead(s, plain.id).g);
    expect(dareRead(s, spy.id).reasons.some((r) => /willing/.test(r.label))).toBe(true);
    // Never names the truth on the screen.
    expect(JSON.stringify(dareRead(s, spy.id).reasons)).not.toMatch(/spy|agent|rival|kessler/i);
    expect(closeOdds(s, dareRead(s, spy.id), 'desk')).toBeGreaterThan(closeOdds(s, dareRead(s, plain.id), 'desk'));
    // A set-up asks him to the Starlight, and going is a lure.
    let found = false;
    for (let w = 0; w < 40 && !found; w++) {
      const t = newGame('h-setup');
      t.week += w;
      const c = lover(t);
      agent(t, c.id, 'setup');
      const first = firstWith((m) => runDare(t, c.id, 'club', m).replies[0] === 'turn');
      if (!first) continue;
      const r = runDare(t, c.id, 'club', [...first, 'along']);
      expect(r.end).toBe('lure');
      expect(r.close).toBe('motel');
      found = true;
    }
    expect(found).toBe(true);
  });
});

describe('honey: claimed wives, and the divide', () => {
  it('a married woman made the boss\'s costs her (implied) and splits the crew; her husband scorns him', () => {
    const s = newGame('h-claim');
    mindsWeek(newCtx(s));
    const man = crewMan(s, 0);
    man.household = { wife: 'Rosemarie', kids: [{ name: 'Joey', male: true, born: 1952 }] };
    man.spouseId = undefined;
    const wife = wifeFor(s, man)!;
    wife.orientation = 'straight';
    const a = affairFor(s, wife.id);
    a.stage = 'affair';
    a.known.push({ w: 'town', how: 'gossip', week: s.week });
    const old = crewMan(s, 1);
    const young = crewMan(s, 2);
    old.birth = { ...old.birth, y: s.date.y - 60 };
    old.traits = ['Honest'];
    young.birth = { ...young.birth, y: s.date.y - 24 };
    young.traits = ['Womanizer'];
    const o0 = opinion(s, old.id, s.playerId);
    const y0 = opinion(s, young.id, s.playerId);
    const ctx = newCtx(s);
    honeyWeek(ctx);
    const cl = s.honey!.claims[wife.id];
    expect(cl).toBeDefined();
    expect(cl.husband).toBe(man.id);
    expect(['left', 'kids', 'cutoff', 'cold']).toContain(cl.fallout);
    expect(opinion(s, old.id, s.playerId)).toBeLessThan(o0);
    expect(opinion(s, young.id, s.playerId)).toBeGreaterThan(y0);
    expect(s.honey!.scorn[man.id]?.kind).toBe('husband');
    expect(s.honey!.scorn[man.id].heat).toBeGreaterThanOrEqual(70);
    expect(claimRows(s)[0].fallout.length).toBeGreaterThan(5);
    // One line, non-explicit.
    expect(ctx.log.some((l) => /in the island's eyes/.test(l))).toBe(true);
  });

  it('another family\'s wife is their grievance: tension rises (a war era\'s fuel)', () => {
    const s = newGame('h-claimrival');
    track(s, 'player', 'kessler');
    const rv = s.rivals.find((r) => r.id === 'kessler')!;
    const theirs = Object.values(s.characters).find((c) => c.alive && c.faction === rv.id && c.gender === 'M' && c.id !== rv.leaderId)!;
    theirs.household = { wife: 'Carmela', kids: [] };
    theirs.spouseId = undefined;
    const her = wifeFor(s, theirs)!;
    affairFor(s, her.id).stage = 'affair';
    const t0 = track(s, 'player', 'kessler')!.tension;
    claimFrom(newCtx(s), her.id, 'affair');
    expect(s.honey!.claims[her.id].rival).toBe('kessler');
    expect(track(s, 'player', 'kessler')!.tension).toBeGreaterThan(t0 + 15);
  });
});

describe('honey: women working the boss', () => {
  it('an agent leaks real intelligence (tension, a secret, a threat, or evidence) and everyone close is a little suspect', () => {
    const s = newGame('h-leak');
    track(s, 'player', 'kessler');
    const spy = lover(s);
    const other = lover(s);
    const a = agent(s, spy.id, 'rival');
    const t0 = track(s, 'player', 'kessler')!.tension;
    leakIntel(newCtx(s), a, 'office');
    expect(a.intel).toBe(1);
    expect(track(s, 'player', 'kessler')!.tension).toBeGreaterThan(t0);
    expect(s.honey!.watch[spy.id].susp).toBeGreaterThan(0);
    expect(s.honey!.watch[other.id].susp).toBeGreaterThan(0);
    // FBI: evidence on the boss.
    const fbi = lover(s);
    const f = agent(s, fbi.id, 'fbi', 'law');
    const ev0 = player(s).evidence ?? 0;
    leakIntel(newCtx(s), f, 'pillow');
    expect(player(s).evidence ?? 0).toBeGreaterThan(ev0);
  });

  it('the truth stays hidden until he knows; then he can turn her (her decision), feed her lies, or have it out', () => {
    const s = newGame('h-turn');
    const spy = lover(s);
    agent(s, spy.id, 'rival');
    // Before he knows: no turn, no feed; nothing on screen says what she is.
    expect(previewHoney(s, { op: 'turn', id: spy.id }).disabledReason).toBeDefined();
    expect(JSON.stringify(watchRows(s))).not.toMatch(/another family/);
    const w = ensureHoney(s).watch[spy.id] = { id: spy.id, susp: 100, signs: [[s.week, 'She asked about the Packard.']], known: s.week, how: 'signs' as const };
    void w;
    const p = previewHoney(s, { op: 'turn', id: spy.id });
    expect(p.disabledReason).toBeUndefined();
    expect(p.acceptance!.chance).toBeCloseTo(turnOdds(s, spy.id).chance);
    expect(watchRows(s)[0].known).toMatch(/another family/);
    ctxOp(s, { op: 'did', a: { op: 'turn', id: spy.id } });
    expect(s.honey!.agents[spy.id].status).toBe('turned');
    // Refused: she runs to them.
    const s2 = newGame('h-turn2');
    const spy2 = lover(s2);
    agent(s2, spy2.id, 'rival');
    ctxOp(s2, { op: 'bolted', id: spy2.id });
    expect(s2.honey!.agents[spy2.id].status).toBe('burned');
    // Fed lies: the rival acts on them and loses money.
    const s3 = newGame('h-feed');
    const spy3 = lover(s3);
    const a3 = agent(s3, spy3.id, 'rival');
    ensureHoney(s3).watch[spy3.id] = { id: spy3.id, susp: 100, signs: [], known: s3.week, asked: s3.week };
    ctxOp(s3, { op: 'agent', id: spy3.id, how: 'feed' });
    expect(a3.status).toBe('fed');
    const m0 = s3.rivals.find((r) => r.id === 'kessler')!.money;
    for (let i = 0; i < 20; i++) { s3.week++; honeyWeek(newCtx(s3)); }
    expect(s3.rivals.find((r) => r.id === 'kessler')!.money).toBeLessThan(m0);
  });

  it('having it out with an innocent woman costs him: she remembers', () => {
    const s = newGame('h-wrong');
    const c = lover(s);
    ensureHoney(s).watch[c.id] = { id: c.id, susp: 45, signs: [[s.week, 'They knew about the Thursday count.']] };
    expect(previewHoney(s, { op: 'confront', id: c.id }).disabledReason).toBeUndefined();
    ctxOp(s, { op: 'did', a: { op: 'confront', id: c.id } });
    expect(s.honey!.scorn[c.id]).toBeDefined();
    expect(opinion(s, c.id, s.playerId)).toBeLessThan(0);
  });

  it('a quiet look into her goes through the protect layer and can confirm (or clear) her', () => {
    const s = newGame('h-probe');
    const spy = lover(s);
    agent(s, spy.id, 'rival');
    ctxOp(s, { op: 'did', a: { op: 'probe', id: spy.id } });
    expect(s.protect!.asg.some((x) => x.type === 'investigate' && x.subjects.includes(spy.id) && x.purpose === 'loyalty')).toBe(true);
    let t = s;
    for (let i = 0; i < 6 && t.honey!.watch[spy.id]?.known === undefined; i++) t = advanceWeek(t, {}).state;
    expect((t.honey!.watch[spy.id]?.susp ?? 0) > 0 || t.honey!.watch[spy.id]?.known !== undefined).toBe(true);
  });
});

describe('honey: the honey trap goes only through the threats pipeline', () => {
  it('a lure is a hit on the boss with a warning tip; Paranoid and guards cut the odds; dropping her drops it', () => {
    const s = newGame('h-lure');
    const c = lover(s);
    agent(s, c.id, 'setup');
    const t = planLure(s, 'kessler' as RivalId, c.id, 0)!;
    expect(t.kind).toBe('hit');
    expect(t.targetId).toBe(s.playerId);
    expect(t.lure).toBe(c.id);
    expect(s.threats!.tips.some((x) => x.threatId === t.id && /Starlight|room/.test(x.hint))).toBe(true);
    const plain = lureOdds(s, t);
    // Paranoid.
    const s2 = newGame('h-lure');
    player(s2).traits = [...player(s2).traits.filter((x) => x !== 'Paranoid'), 'Paranoid'];
    const c2 = lover(s2);
    const t2 = planLure(s2, 'kessler' as RivalId, c2.id, 0)!;
    expect(lureOdds(s2, t2)).toBeLessThan(plain);
    // Guards at night.
    const g = crewMan(s, 0);
    createGuard(newCtx(s), { op: 'guard', subject: s.playerId, who: [g.id], kind: 'bodyguard', shift: 'around', weeks: 10 }, s.playerId, 'self', 0);
    expect(lureOdds(s, t)).toBeLessThan(plain);
    // Caution (men across the street) cuts it too.
    const s3 = newGame('h-lure3');
    const c3 = lover(s3);
    expect(lureOdds(s3, planLure(s3, 'kessler' as RivalId, c3.id, 0.45)!)).toBeLessThan(0.6);
    // Having it out with her drops it.
    ensureHoney(s).watch[c.id] = { id: c.id, susp: 100, signs: [], known: s.week, asked: s.week };
    ctxOp(s, { op: 'did', a: { op: 'confront', id: c.id } });
    expect(s.threats!.threats.some((x) => x.lure === c.id)).toBe(false);
  });

  it('the boss dies only when the lure lands in the threats pipeline, and never without a warning', () => {
    let deaths = 0;
    for (let i = 0; i < 12; i++) {
      const s = newGame(`h-land-${i}`);
      const c = lover(s);
      agent(s, c.id, 'setup');
      const t = planLure(s, 'kessler' as RivalId, c.id, 0)!;
      // The honey layer alone never kills him.
      for (let k = 0; k < 3; k++) honeyWeek(newCtx(s));
      expect(player(s).alive).toBe(true);
      expect(s.threats!.tips.some((x) => x.threatId === t.id)).toBe(true);
      s.week = t.due;
      threatsWeek(newCtx(s));
      if (!s.characters[t.targetId!].alive) { deaths++; expect(s.characters[t.targetId!].death?.cause ?? '').toMatch(/motel|set up/i); }
    }
    expect(deaths).toBeLessThan(12);
  });
});

describe('honey: mistresses as liabilities', () => {
  it('a want climbs from a hint to a threat; paying settles it; a called bluff that fails exposes him to his wife', () => {
    const s = newGame('h-mist');
    const boss = player(s);
    const c = lover(s, ['Vengeful']);
    const H = ensureHoney(s);
    H.mistresses[c.id] = { id: c.id, since: s.week, mouth: 10, want: 'apartment', stage: 0, next: s.week, paid: 0, leaks: 0 };
    const seen: number[] = [];
    for (let i = 0; i < 30 && (H.mistresses[c.id].stage < 4); i++) {
      s.week++;
      affairFor(s, c.id).last = s.week;
      honeyWeek(newCtx(s));
      seen.push(H.mistresses[c.id].stage);
    }
    expect(seen).toContain(1);
    expect(seen).toContain(2);
    expect(H.mistresses[c.id].stage).toBe(4);
    expect(H.mistresses[c.id].lever).toBeDefined();
    expect(s.eventQueue.some((e) => e.defId === 'honey_want')).toBe(true);
    expect(s.eventQueue.some((e) => e.defId === 'honey_threat')).toBe(true);
    const row = mistressRows(s)[0];
    expect(row.actions.map((a) => (a.kind === 'honey' && a.op.op === 'settle' ? a.op.how : ''))).toEqual(['pay', 'promise', 'bluff', 'away', 'consig', 'worse']);
    // The worst is only ever an explicit order, never an event's default.
    const threat = s.eventQueue.find((e) => e.defId === 'honey_threat')!;
    expect(threat.defaultChoiceId).toBe('promise');
    expect(threat.choices.some((ch) => /worse/.test(JSON.stringify(ch.effects)))).toBe(false);
    // Pay: settled.
    const s2 = JSON.parse(JSON.stringify(s)) as GameState;
    ctxOp(s2, { op: 'threat', id: c.id, how: 'pay' });
    expect(s2.honey!.mistresses[c.id].settled?.how).toBe('paid');
    // The threat lands when it comes due (she told someone).
    H.mistresses[c.id].lever = 'wife';
    if (boss.spouseId) {
      H.mistresses[c.id].due = s.week;
      honeyWeek(newCtx(s));
      expect(H.mistresses[c.id].settled?.how).toMatch(/told/);
      expect(s.honey!.scorn[c.id]).toBeDefined();
    }
  });

  it('a loud mouth leaks: the paper, the parlor, the crew or a rival bar', () => {
    const s = newGame('h-mouth');
    const c = lover(s, ['Drinker']);
    ensureHoney(s).mistresses[c.id] = { id: c.id, since: s.week, mouth: 100, stage: 0, next: s.week + 99, paid: 0, leaks: 0 };
    for (let i = 0; i < 40 && s.honey!.mistresses[c.id].leaks === 0; i++) { s.week++; affairFor(s, c.id).last = s.week; honeyWeek(newCtx(s)); }
    expect(s.honey!.mistresses[c.id].leaks).toBeGreaterThan(0);
  });
});

describe('honey: scorn remembers', () => {
  it('scorn is kept, written into the mind, fades slowly, and is acted on', () => {
    const s = newGame('h-scorn');
    mindsWeek(newCtx(s));
    const man = crewMan(s, 3);
    scornAdd(s, man.id, 'husband', 'the boss took my wife', 100);
    const m = mindOf(s, man.id);
    if (m) expect(m.mem.some((x) => x.k === 'betrayal' && x.who === s.playerId)).toBe(true);
    expect(scornRows(s)[0].id).toBe(man.id);
    for (let i = 0; i < 60 && !s.honey!.scorn[man.id]?.acted; i++) { s.week++; honeyWeek(newCtx(s)); }
    expect(s.honey!.stats.acted).toBeGreaterThan(0);
  });
});

describe('honey: adults only; Mature content Off hides it all', () => {
  it('no minor is ever touched; Off hides lists, orders, the dare and the week', () => {
    let s = newGame('h-off');
    const kid = woman(s, 16);
    expect(runDare(s, kid.id, 'club').block).toBe('Adults only');
    expect(previewHoney(s, { op: 'probe', id: kid.id }).disabledReason).toBe('Adults only');
    expect(scornAdd(s, kid.id, 'woman', 'x', 50)).toBeUndefined();
    ctxOp(s, { op: 'suspect', id: kid.id, by: 50 });
    expect(s.honey?.watch[kid.id]).toBeUndefined();
    const c = lover(s);
    ensureHoney(s).watch[c.id] = { id: c.id, susp: 50, signs: [] };
    expect(watchRows(s).length).toBe(1);
    s = setDatingSettings(s, { mature: 'off' });
    expect(watchRows(s)).toEqual([]);
    expect(mistressRows(s)).toEqual([]);
    expect(honeyActionsFor(s, c.id)).toEqual([]);
    expect(runDare(s, c.id, 'office').block).toMatch(/Mature/);
    const before = JSON.stringify(s.honey);
    honeyWeek(newCtx(s));
    expect(JSON.stringify(s.honey)).toBe(before);
    // The adults-only scenes never come up.
    const mature = SCENES.filter((x) => isMature(x));
    expect(mature.length).toBeGreaterThanOrEqual(8);
    for (const sc of mature) expect(whenOk(s, sc)).toBe(false);
  });
});

describe('honey: scenes, determinism, saves', () => {
  it('the honey scenes validate; the new pools, partnerOf and effects are checked', () => {
    expect(SCENE_ERRORS).toEqual([]);
    const honey = SCENES.filter((x) => x.id.startsWith('honey_'));
    expect(honey.length).toBeGreaterThanOrEqual(8);
    expect(honey.length).toBeLessThanOrEqual(12);
    const bad = { id: 'x_bad', title: 'x', text: 'x', who: { lover: { pool: 'lover', age: [16, 30] }, h: { pool: 'husband', partnerOf: 'nobody' } }, choices: [{ label: 'a', effects: [{ scorn: { who: 'boss', by: 5 } }] }, { label: 'b', effects: [{ hush: { role: 'lover' } }] }] };
    const e = validateScenes({ 'scenes/x.json': bad }).errors;
    expect(e.some((x) => /adults only/.test(x))).toBe(true);
    expect(e.some((x) => /partnerOf/.test(x))).toBe(true);
    expect(e.some((x) => /scorn himself/.test(x))).toBe(true);
  });

  it('a honey scene casts a lover and her husband, and its effects land', () => {
    const s = newGame('h-scene');
    mindsWeek(newCtx(s));
    ensureDeeds(s);
    s.week = 20;
    const man = crewMan(s, 0);
    man.household = { wife: 'Dolores', kids: [] };
    man.spouseId = undefined;
    const wife = wifeFor(s, man)!;
    const a = affairFor(s, wife.id);
    a.stage = 'affair';
    a.last = s.week;
    const ev = tryScene(s, 'honey_husband_at_the_bar');
    expect(ev).toBeDefined();
    const cast = JSON.parse(String(ev!.meta!.cast));
    expect(cast.lover).toBe(wife.id);
    expect(cast.husband).toBe(man.id);
    const ctx = newCtx(s);
    const ch = ev!.choices.find((x) => /bouncer/.test(x.label))!;
    for (const fx of ch.effects) if (fx.type === 'honey') applyHoneyOp(ctx, fx.op);
    expect(s.honey!.scorn[man.id]).toBeDefined();
  });

  it('deterministic weeks; the state survives a save; upgradeSave leaves a save without it alone and is a no-op on one with it', () => {
    const play = () => {
      let s = newGame('h-det');
      for (let i = 0; i < 30; i++) s = advanceWeek(s, {}).state;
      return s;
    };
    const a = play();
    const b = play();
    expect(JSON.stringify(a.honey)).toBe(JSON.stringify(b.honey));
    const fresh = newGame('h-save');
    expect(fresh.honey).toBeUndefined();
    expect(upgradeSave(JSON.parse(JSON.stringify(fresh))).honey).toBeUndefined();
    const c = lover(fresh);
    ensureHoney(fresh).mistresses[c.id] = { id: c.id, since: 1, mouth: 50, want: 'ring', stage: 2, next: 9, paid: 0, leaks: 0 };
    scornAdd(fresh, c.id, 'woman', 'he forgot my birthday', 40);
    const round = JSON.parse(JSON.stringify(fresh)) as GameState;
    expect(round.honey).toEqual(fresh.honey);
    const up = upgradeSave(JSON.parse(JSON.stringify(fresh)));
    expect(up.honey).toEqual(fresh.honey);
    const t = ensureThreats(fresh);
    expect(t).toBeDefined();
  });
});
