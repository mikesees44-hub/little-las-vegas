import { describe, expect, it } from 'vitest';
import '../src/engine/engine';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { makeCharacter } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { mindsWeek } from '../src/engine/minds';
import { mindOf } from '../src/engine/minds/state';
import { setTie } from '../src/engine/deeds/state';
import { ensureCapos } from '../src/engine/caposState';
import { addOpinion, opinion } from '../src/engine/relations';
import { upgradeSave } from '../src/engine/upgradeSave';
import { applyDecision } from '../src/engine/reactions';
import {
  argueFromBatch, argueReply, argueWeek, beginArgument, closeArgument, EVENT_BUDGET, faceToFace, heatedChoices, MAX_ROUNDS, openArgument, plantSeed,
  potentialSeeds, replyArgument, replyOdds, type ArgSpec, type Argument, type Reply, type SeedKind,
} from '../src/engine/argue';
import type { Character, EventInstance, GameState, Trait } from '../src/engine/types';

/**
 * The five reactive test situations (design notes §6 H): each shows an
 * immediate response, a follow-up exchange, the room's reactions, and two
 * distinct story seeds depending on how it goes.
 */

const UB = 'c16'; // Rocco, underboss
const MATTEO = 'c26';
const MALACHY = 'c29';
const PHILIP = 'c21';
const DESMOND = 'c36'; // soldier under Philip
const TIMOTHY = 'c33'; // soldier under Philip
const LOUIS = 'c5'; // capo, of the house

function game(seed = 'argue-1'): GameState {
  const s = newGame(seed);
  mindsWeek(newCtx(s));
  // Nobody hides anything unless a test says so.
  for (const b of Object.values(s.capos?.books ?? {})) delete b.plot;
  for (const m of Object.values(s.minds?.minds ?? {})) delete m.plan;
  return s;
}
const ch = (s: GameState, id: string): Character => s.characters[id];
const traits = (s: GameState, id: string, t: Trait[]) => { ch(s, id).traits = t; };

/** Reply in order (repeating the last) until it ends; the argument. */
function play(s: GameState, replies: Reply[]): Argument {
  for (let i = 0; i < MAX_ROUNDS + 1; i++) {
    const A = s.argue!.live!;
    if (A.end) return A;
    replyArgument(s, replies[Math.min(i, replies.length - 1)]);
  }
  return s.argue!.live!;
}
const seedKinds = (s: GameState, A: Argument): SeedKind[] => (A.seeds ?? []).map((id) => s.argue!.seeds.find((x) => x.id === id)!.k);
const lineBy = (A: Argument, id: string) => A.log.filter((l) => l.by === id);

/** Common checks for one situation. */
function immediate(A: Argument, t: string) {
  // His answer comes right away, before the boss says another word.
  expect(A.log[0].by).toBe('');
  expect(lineBy(A, t).length).toBeGreaterThanOrEqual(1);
  expect(A.log.findIndex((l) => l.by === t)).toBeLessThan(A.log.findIndex((l) => l.by === 'boss') === -1 ? 99 : A.log.findIndex((l) => l.by === 'boss'));
}
function followUp(s: GameState, t: string, r: Reply) {
  const before = s.argue!.live!.log.length;
  const A = replyArgument(s, r)!;
  const added = A.log.slice(before);
  expect(added.some((l) => l.by === 'boss' && l.r === r)).toBe(true);
  expect(added.some((l) => l.by === t)).toBe(true);
  expect(A.round).toBe(1);
  return A;
}
function roomRemembers(s: GameState, A: Argument) {
  for (const id of A.room) {
    const m = mindOf(s, id);
    if (m) expect(m.mem.some((x) => x.k === 'talk' && x.who === A.t && /^saw /.test(x.t)), id).toBe(true);
  }
}

describe('arguments: 1. insult the underboss in front of two capos', () => {
  const spec = (): ArgSpec => ({ k: 'insult', t: UB, room: [MATTEO, MALACHY], label: 'You dressed Rocco down in front of the capos' });

  it('he answers hot at once; the boss answers back; the room speaks up and remembers', () => {
    const s = game();
    traits(s, UB, ['Hot-headed', 'Vengeful']);
    traits(s, MATTEO, ['Hot-headed']);
    setTie(s, MATTEO, UB, 'friend', 'Came up together');
    const A = beginArgument(s, spec())!;
    expect(A.pos).toBe('hot');
    expect(A.room).toEqual([MATTEO, MALACHY]);
    immediate(A, UB);
    // Odds on every reply; the consigliere can be asked in.
    for (const r of ['apologize', 'double', 'threaten', 'dismiss', 'mediate'] as Reply[]) {
      const o = replyOdds(s, A, r);
      expect(o.p).toBeGreaterThan(0);
      expect(o.p).toBeLessThan(1);
      expect(o.blocked).toBeUndefined();
    }
    expect(replyOdds(s, A, 'threaten').why.join(' ')).toMatch(/Hot-headed/);
    followUp(s, UB, 'double');
    const end = play(s, ['double', 'threaten']);
    expect(end.end).toBeDefined();
    expect(end.round).toBeLessThanOrEqual(MAX_ROUNDS);
    expect(end.done).toMatch(/\./);
    roomRemembers(s, end);
    // A man not in the room has no first-hand memory of it.
    const outside = mindOf(s, PHILIP);
    expect(outside?.mem.some((x) => /^saw /.test(x.t)) ?? false).toBe(false);
  });

  it('the room speaks up on its own: a hothead backs his friend, a peacemaker smooths it (across a few nights)', () => {
    const voices = new Set<string>();
    for (const seed of ['argue-1', 'argue-2', 'argue-3', 'argue-4', 'argue-5', 'argue-6']) {
      const s = game(seed);
      if (!s.characters[UB] || !s.characters[MATTEO] || !s.characters[MALACHY]) continue;
      traits(s, UB, ['Hot-headed']);
      traits(s, MATTEO, ['Hot-headed']);
      traits(s, MALACHY, ['Patient', 'Charming']);
      setTie(s, MATTEO, UB, 'friend', 'Came up together');
      beginArgument(s, spec());
      const A = play(s, ['double']);
      for (const l of A.log) if (l.v) voices.add(l.v);
    }
    expect(voices.size).toBeGreaterThanOrEqual(1);
    expect([...voices].every((v) => ['hothead', 'peacemaker', 'loyalist', 'opportunist'].includes(v))).toBe(true);
  });

  it('two different nights, two different stories: an apology makes peace; pushing a proud man splits the family', () => {
    // Peace: a loyal, patient underboss who thinks well of the boss.
    const a = game();
    traits(a, UB, ['Loyal-to-a-fault', 'Patient']);
    addOpinion(a, UB, a.playerId, 'Years together', 60, 0);
    beginArgument(a, spec());
    const A = play(a, ['apologize', 'mediate', 'apologize']);
    expect(A.end).toBe('reconciled');
    expect(seedKinds(a, A)).toContain('mend');
    // A split: a hot, vengeful one who already resents the boss.
    const b = game();
    traits(b, UB, ['Hot-headed', 'Vengeful']);
    addOpinion(b, UB, b.playerId, 'Bad years', -40, 0);
    beginArgument(b, spec());
    const B = play(b, ['threaten']);
    expect(['split', 'walkout']).toContain(B.end);
    expect(seedKinds(b, B)).toContain('allies');
    expect(new Set([...seedKinds(a, A), ...seedKinds(b, B)]).size).toBeGreaterThanOrEqual(2);
    // His opinion moved the right way in each.
    expect(opinion(a, UB, a.playerId)).toBeGreaterThan(opinion(b, UB, b.playerId));
    // The seed grows into the grievance ladder (faction-building and worse come from there).
    b.week += 6;
    argueWeek(newCtx(b));
    expect(b.power?.grievances.some((g) => g.charId === UB && g.post.startsWith('argue:') && g.status === 'open')).toBe(true);
    // Lands in Your File.
    expect(b.journal?.e.some((e) => e.src === 'argue' && e.p?.includes(UB))).toBe(true);
  });

  it('only the room saw it: the others hear it a week or more later, maybe bigger', () => {
    const s = game();
    traits(s, UB, ['Hot-headed']);
    beginArgument(s, spec());
    const A = play(s, ['threaten']);
    const G = s.argue!;
    expect(G.hear.length).toBeGreaterThan(0);
    for (const h of G.hear) {
      expect(h.due).toBeGreaterThan(s.week);
      expect(A.room).not.toContain(h.who);
      expect(h.who).not.toBe(UB);
    }
    // This week, nobody has heard yet.
    argueWeek(newCtx(s));
    expect(G.stats.heard).toBe(0);
    s.week += 4;
    argueWeek(newCtx(s));
    expect(G.stats.heard).toBeGreaterThan(0);
    const heard = Object.values(s.minds!.minds).some((m) => m.mem.some((x) => x.k === 'talk' && /^heard /.test(x.t)));
    const op = Object.values(s.relations).some((r) => r.modifiers.some((m) => /^What they say about/.test(m.reason)));
    expect(heard || op).toBe(true);
  });
});

describe('arguments: 2. refuse a soldier\'s money request', () => {
  const spec = (): ArgSpec => ({ k: 'refuse', t: TIMOTHY, room: [PHILIP], label: 'You turned Timothy down for the money' });

  it('he answers, the boss softens or holds the line, the capo in the room takes note', () => {
    const s = game();
    const A = beginArgument(s, spec())!;
    immediate(A, TIMOTHY);
    followUp(s, TIMOTHY, 'apologize');
    const end = play(s, ['apologize', 'dismiss']);
    expect(end.end).toBeDefined();
    roomRemembers(s, end);
    expect(potentialSeeds(s, end)).toEqual(expect.arrayContaining(['shark', 'mend']));
  });

  it('reconciled: he comes back to make peace; thrown out hot: he goes to a shark', () => {
    const a = game();
    traits(a, TIMOTHY, ['Loyal-to-a-fault', 'Patient']);
    addOpinion(a, TIMOTHY, a.playerId, 'Good to me', 50, 0);
    beginArgument(a, spec());
    const A = play(a, ['apologize']);
    expect(A.end).toBe('reconciled');
    expect(seedKinds(a, A)).toContain('mend');

    const b = game();
    traits(b, TIMOTHY, ['Hot-headed', 'Greedy']);
    addOpinion(b, TIMOTHY, b.playerId, 'Never helps', -40, 0);
    beginArgument(b, spec());
    const B = play(b, ['threaten', 'dismiss']);
    expect(['walkout', 'split']).toContain(B.end);
    expect(seedKinds(b, B)).toContain('shark');
    b.week += 5;
    argueWeek(newCtx(b));
    expect(ch(b, TIMOTHY).debtTo).toBeDefined();
  });
});

describe('arguments: 3. promote a young capo over a veteran', () => {
  const spec = (): ArgSpec => ({ k: 'passover', t: MALACHY, about: PHILIP, room: [PHILIP, MATTEO], label: 'You gave Philip the waterfront over Malachy' });

  it('the veteran answers about the kid by name; the kid is in the room', () => {
    const s = game();
    traits(s, MALACHY, ['Ambitious', 'Hot-headed']);
    const A = beginArgument(s, spec())!;
    immediate(A, MALACHY);
    followUp(s, MALACHY, 'double');
    const end = play(s, ['double', 'dismiss']);
    roomRemembers(s, end);
    expect(potentialSeeds(s, end)).toEqual(expect.arrayContaining(['allies', 'feud']));
  });

  it('a plotting veteran smiles and agrees; an open one feuds with the kid', () => {
    // Hidden: he is already working a plot nobody has found.
    const a = game();
    traits(a, MALACHY, ['Patient', 'Ambitious']);
    ensureCapos(a).books[MALACHY] ??= { since: 0, st: 'turning', tide: -40, hedge: 50, sl: 0, rw: 0, signs: [], intel: [], take: [], heat: 0, heat8: [], doing: '' };
    a.capos!.books[MALACHY].plot = { k: 'coup', st: 1, w: a.week, sw: a.week };
    const A = beginArgument(a, spec())!;
    expect(A.pos).toBe('smiling');
    expect(A.heat).toBeLessThanOrEqual(22);
    // The window never says why: the odds look good.
    expect(replyOdds(a, A, 'double').p).toBeGreaterThanOrEqual(0.7);
    replyArgument(a, 'double');
    expect(A.end).toBe('plot');
    expect(seedKinds(a, A)).toContain('plotDeep');
    // The done line does not give the plot away.
    expect(A.done).not.toMatch(/plot|coup/i);

    const b = game();
    traits(b, MALACHY, ['Hot-headed', 'Vengeful']);
    addOpinion(b, MALACHY, b.playerId, 'Passed over', -30, 0);
    beginArgument(b, spec());
    const B = play(b, ['double']);
    expect(['walkout', 'split', 'truce']).toContain(B.end);
    const kinds = seedKinds(b, B);
    expect(kinds.some((k) => k === 'allies' || k === 'feud' || k === 'courted')).toBe(true);
    expect(new Set([...seedKinds(a, A), ...kinds]).size).toBeGreaterThanOrEqual(2);
    b.week += 7;
    argueWeek(newCtx(b));
    const grew = b.argue!.seeds.filter((x) => x.done !== undefined).map((x) => x.k);
    expect(grew.length).toBeGreaterThan(0);
    if (grew.includes('feud')) expect(opinion(b, MALACHY, PHILIP)).toBeLessThan(0);
  });
});

describe('arguments: 4. an affair in the family', () => {
  function withWife(s: GameState): string {
    const w = makeCharacter(s, { gender: 'F', age: 36, dynasty: true, firstName: 'Rosemary', lastName: ch(s, LOUIS).lastName });
    s.characters[w.id] = w;
    w.spouseId = LOUIS;
    ch(s, LOUIS).spouseId = w.id;
    return w.id;
  }
  const spec = (wife: string): ArgSpec => ({ k: 'affair', t: LOUIS, about: wife, room: [UB], label: 'You told Louis you know about the girl in Cape May' });

  it('he answers, the boss lays down the law, the underboss saw it', () => {
    const s = game();
    const wife = withWife(s);
    const A = beginArgument(s, spec(wife))!;
    immediate(A, LOUIS);
    followUp(s, LOUIS, 'double');
    const end = play(s, ['double', 'dismiss']);
    roomRemembers(s, end);
    expect(potentialSeeds(s, end)).toEqual(expect.arrayContaining(['vendetta', 'scandal']));
    // Kept non-explicit: nothing in the exchange goes past a closed door.
    expect(end.log.map((l) => l.t).join(' ')).not.toMatch(/\bbed\b|naked|sex/i);
  });

  it('hearing him out ends quietly; throwing him out brings her people', () => {
    const a = game();
    const wa = withWife(a);
    traits(a, LOUIS, ['Loyal-to-a-fault', 'Patient']);
    beginArgument(a, spec(wa));
    const A = play(a, ['apologize', 'mediate']);
    const b = game();
    const wb = withWife(b);
    traits(b, LOUIS, ['Hot-headed', 'Vengeful']);
    addOpinion(b, LOUIS, b.playerId, 'Meddles', -40, 0);
    beginArgument(b, spec(wb));
    const B = play(b, ['threaten', 'dismiss']);
    expect(['walkout', 'split']).toContain(B.end);
    expect(seedKinds(b, B)).toContain('vendetta');
    expect(new Set([...seedKinds(a, A), ...seedKinds(b, B)]).size).toBeGreaterThanOrEqual(2);
    // Lands in the family part of Your File.
    expect(b.journal?.e.some((e) => e.src === 'argue' && e.c === 'family')).toBe(true);
  });
});

describe('arguments: 5. accuse a loyal soldier of informing', () => {
  const spec = (): ArgSpec => ({ k: 'accuse', t: DESMOND, room: [PHILIP, MATTEO], label: 'You accused Desmond of talking to the law' });

  it('a loyal man is hurt, not hot; a real informant protests too much', () => {
    const s = game();
    traits(s, DESMOND, ['Loyal-to-a-fault', 'Honest']);
    const A = beginArgument(s, spec())!;
    expect(A.pos).toBe('hurt');
    immediate(A, DESMOND);
    followUp(s, DESMOND, 'double');
    const end = play(s, ['double', 'dismiss']);
    roomRemembers(s, end);
    expect(potentialSeeds(s, end)).toEqual(expect.arrayContaining(['wounded', 'ratTalk']));

    const r = game();
    traits(r, DESMOND, ['Cowardly']);
    ch(r, DESMOND).informantFor = 'law';
    const R = beginArgument(r, spec())!;
    expect(R.pos).toBe('scared');
    expect(R.mask).toBe(1);
  });

  it('taking it back mends it; pressing him leaves him wounded and the crew whispering', () => {
    const a = game();
    traits(a, DESMOND, ['Loyal-to-a-fault', 'Patient']);
    addOpinion(a, DESMOND, a.playerId, 'Years of service', 40, 0);
    beginArgument(a, spec());
    const A = play(a, ['apologize', 'apologize', 'mediate']);
    const b = game();
    traits(b, DESMOND, ['Honest', 'Hot-headed']);
    beginArgument(b, spec());
    const B = play(b, ['double', 'threaten']);
    const kb = seedKinds(b, B);
    expect(kb.some((k) => k === 'wounded' || k === 'ratTalk')).toBe(true);
    expect(new Set([...seedKinds(a, A), ...kb]).size).toBeGreaterThanOrEqual(2);
    b.week += 6;
    argueWeek(newCtx(b));
    const rumor = b.minds!.rumors.some((x) => x.k === 'rat' && x.by === DESMOND);
    const griev = b.power?.grievances.some((g) => g.charId === DESMOND && g.post.startsWith('argue:'));
    expect(rumor || griev).toBe(true);
  });
});

describe('arguments: the machinery', () => {
  it('is deterministic: the same game and the same replies give the same exchange', () => {
    const run = () => {
      const s = game('argue-1');
      traits(s, UB, ['Hot-headed']);
      beginArgument(s, { k: 'insult', t: UB, room: [MATTEO, MALACHY], label: 'x' });
      return JSON.stringify(play(s, ['double', 'apologize', 'mediate']).log);
    };
    expect(run()).toBe(run());
  });

  it('caps: four rounds, an event budget, no second argument with the same man this week, seeds deduped', () => {
    const s = game();
    traits(s, UB, ['Patient']);
    beginArgument(s, { k: 'insult', t: UB, room: [MATTEO, MALACHY], label: 'x' });
    const A = play(s, ['double', 'double', 'double', 'double', 'double']);
    expect(A.round).toBeLessThanOrEqual(MAX_ROUNDS);
    expect(A.ev).toBeLessThanOrEqual(EVENT_BUDGET);
    expect(A.log.filter((l) => l.v).length).toBeLessThanOrEqual(A.room.length);
    const s2 = closeArgument(s);
    expect(s2.argue!.live).toBeUndefined();
    expect(openArgument(s2, { k: 'insult', t: UB, label: 'again' })).toBe(s2);
    const G = s2.argue!;
    const one = plantSeed(s2, G, 'rumor', { id: 'z', t: UB, depth: 0 });
    const two = plantSeed(s2, G, 'rumor', { id: 'z2', t: UB, depth: 0 });
    expect(one && two).toBeFalsy();
  });

  it('pure window answers; closing mid-argument sends him off; a save round-trips', () => {
    const s0 = game();
    const s1 = openArgument(s0, { k: 'refuse', t: TIMOTHY, room: [PHILIP], label: 'You turned him down' });
    expect(s0.argue?.live).toBeUndefined();
    expect(s1.argue!.live!.round).toBe(0);
    const s2 = argueReply(s1, 'apologize');
    expect(s1.argue!.live!.round).toBe(0);
    expect(s2.argue!.live!.round).toBe(1);
    const saved = upgradeSave(JSON.parse(JSON.stringify(s2)) as GameState);
    expect(saved.argue!.live!.log.length).toBe(s2.argue!.live!.log.length);
    const s3 = closeArgument(saved);
    expect(s3.argue!.live).toBeUndefined();
    expect(s3.argue!.hist.length).toBe(1);
    expect(s3.journal?.e.some((e) => e.src === 'argue')).toBe(true);
  });

  it('opens from the reactions window and from a decision card', () => {
    const s = game();
    traits(s, MALACHY, ['Hot-headed', 'Vengeful']);
    const b = applyDecision(newCtx(s), { k: 'decline', label: 'You turned down Malachy\'s numbers bank', t: MALACHY, v: -14, y: 'Turned down my idea', pride: 1, src: 'rx_capoRacket' });
    expect(b).toBeDefined();
    const spec = argueFromBatch(s, b!);
    expect(spec?.t).toBe(MALACHY);
    expect(spec?.k).toBe('decline');

    const t = game();
    const ev: EventInstance = {
      iid: 'evx', defId: 'test_ask', title: 'Timothy asks for money', text: 'He needs it.', week: t.week, mandatory: false, priority: 50,
      actors: [TIMOTHY], meta: { charId: TIMOTHY }, defaultChoiceId: 'no',
      choices: [
        { id: 'yes', label: 'Give him the money', because: 'gave Timothy the money', effects: [{ type: 'money', amount: -500 }, { type: 'opinion', from: TIMOTHY, to: t.playerId, amount: 10, reason: 'Helped me out', decay: 1 }] },
        { id: 'no', label: 'Turn him down', because: 'turned Timothy down', effects: [{ type: 'opinion', from: TIMOTHY, to: t.playerId, amount: -12, reason: 'Turned me down', decay: 1 }] },
      ],
    };
    t.pendingEvents.push(ev);
    const heated = heatedChoices(t, ev);
    expect(heated.map((x) => x.ch.id)).toEqual(['no']);
    expect(heated[0].spec.k).toBe('refuse');
    const u = faceToFace(t, 'evx', 'no');
    expect(u.pendingEvents.some((e) => e.iid === 'evx')).toBe(false);
    expect(u.argue!.live!.t).toBe(TIMOTHY);
    expect(u.argue!.live!.log.some((l) => l.by === TIMOTHY)).toBe(true);
    // The argument is the reactions' window: no second popup for the same decision.
    expect((u.reactions?.q ?? []).some((x) => x.t === TIMOTHY)).toBe(false);
    expect(cloneState(u).argue!.live!.id).toBe(u.argue!.live!.id);
  });

  it('never kills or hands over a man: no deaths, no prison, no one leaves the family in the room', () => {
    for (const seed of ['argue-1', 'argue-2', 'argue-3']) {
      const s = game(seed);
      if (!s.characters[UB]) continue;
      traits(s, UB, ['Hot-headed', 'Vengeful', 'Cruel']);
      const alive = Object.values(s.characters).filter((c) => c.alive).length;
      beginArgument(s, { k: 'insult', t: UB, room: [MATTEO, MALACHY], label: 'x' });
      play(s, ['threaten']);
      expect(Object.values(s.characters).filter((c) => c.alive).length).toBe(alive);
      expect(ch(s, UB).faction).toBe('player');
      expect(ch(s, UB).imprisonedUntil ?? 0).toBeLessThanOrEqual(s.week);
    }
  });
});

describe('arguments: the window', () => {
  it('renders the faces, the exchange, five answers at most with odds, and the done line', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { ArgueWindow } = await import('../src/ui/argue/ArgueWindow');
    const s = game();
    traits(s, UB, ['Hot-headed']);
    const A = beginArgument(s, { k: 'insult', t: UB, room: [MATTEO, MALACHY], label: 'You dressed Rocco down in front of the capos' })!;
    const html = renderToStaticMarkup(createElement(ArgueWindow, { s, A, onReply: () => {}, onClose: () => {} }));
    expect(html).toContain('data-testid="argue-window"');
    expect(html).toContain('data-testid="argue-room"');
    expect((html.match(/data-testid="argue-(apologize|double|threaten|dismiss|mediate)"/g) ?? []).length).toBeLessThanOrEqual(5);
    expect(html).toContain('Ask Lorenzo to step in');
    expect(html).toMatch(/\d+%/);
    const E = play(s, ['threaten']);
    const done = renderToStaticMarkup(createElement(ArgueWindow, { s, A: E, onReply: () => {}, onClose: () => {} }));
    expect(done).toContain('data-testid="argue-done"');
    expect(done).toContain('in Your File');
    expect(done).not.toContain('data-testid="argue-replies"');
  });
});

describe('arguments: through the weekly turn', () => {
  it('a window left open is settled at the turn; seeds grow into the authored follow-ups; hearsay arrives', () => {
    let s = game();
    traits(s, UB, ['Loyal-to-a-fault', 'Patient']);
    addOpinion(s, UB, s.playerId, 'Years together', 60, 0);
    beginArgument(s, { k: 'insult', t: UB, room: [MATTEO, MALACHY], label: 'You dressed Rocco down' });
    const A = play(s, ['apologize', 'mediate', 'apologize']);
    expect(A.end).toBe('reconciled');
    // A second one, left hanging when the week turns.
    traits(s, TIMOTHY, ['Hot-headed']);
    beginArgument(s, { k: 'refuse', t: TIMOTHY, room: [PHILIP], label: 'You turned Timothy down' });
    expect(s.argue!.live!.end).toBeUndefined();
    s = advanceWeek(s, {}).state;
    expect(s.argue!.live).toBeUndefined();
    expect(s.argue!.hist.some((h) => h.t === TIMOTHY)).toBe(true);
    for (let i = 0; i < 3; i++) s = advanceWeek(s, {}).state;
    const mend = s.argue!.seeds.find((x) => x.k === 'mend' && x.who === UB);
    expect(mend?.done).toBeDefined();
    // The follow-up scene was scheduled (or already came up as a popup).
    const due = (s.deeds?.due ?? []).some((d) => d.id === 'argue_mend') || s.pendingEvents.some((e) => e.defId === 'scene_argue_mend') || (s.deeds?.sc.argue_mend ?? -1) >= 0;
    expect(due).toBe(true);
    expect(s.argue!.stats.heard).toBeGreaterThan(0);
  });
});
