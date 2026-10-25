import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { convictionOdds, legalOf } from '../src/engine/longgame';
import { autoFinish, mgOf, playSession, randomMoves, sessionOptions, startSession, stepSession, type MgSession } from '../src/engine/minigames';
import { newGame } from '../src/engine/newGame';
import { buildNpcTrial, onArrest, TRIAL_EVIDENCE, type TrialData } from '../src/engine/trial';
import { convictionP } from '../src/engine/trialCase';
import { crew } from '../src/engine/characters';
import type { GameState } from '../src/engine/types';

function bossOnTrial(seed: string, evidence: number): GameState {
  let s = newGame(seed);
  s = advanceWeek(s, {}).state;
  s.money = 30000;
  s.characters[s.playerId].evidence = evidence;
  s.legal = { stage: 'trial', personId: s.playerId, defense: 0, since: s.week };
  return s;
}

const params = (s: GameState) => ({ defendant: s.playerId, mode: 'boss', play: 0 });
const convicted = (d: TrialData) => d.verdict === 'convicted' || d.verdict === 'partial' || d.verdict === 'hung';

describe('trial mode', () => {
  it('is deterministic: the same state and moves give the same trial', () => {
    const s = bossOnTrial('det', 60);
    const moves = randomMoves(s, 'trial', 'evX', params(s), undefined, { rng: 42 });
    const a = playSession(s, 'trial', 'evX', params(s), {}, moves);
    const b = playSession(s, 'trial', 'evX', params(s), {}, moves);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    // Stepping one move at a time is the same as the replay.
    let x = startSession(s, 'trial', 'evX', params(s));
    for (const m of moves) x = stepSession(s, x, m);
    expect(JSON.stringify(autoFinish(s, x).outcome)).toEqual(JSON.stringify(a.outcome));
    // An illegal move is the default play, not a crash.
    expect(playSession(s, 'trial', 'evX', params(s), {}, ['nonsense', 'more nonsense']).done).toBe(true);
  });

  it('letting it play out convicts at the odds it shows, close to the old passive trial', () => {
    for (const E of [40, 75]) {
      const s = bossOnTrial('dist', E);
      const N = 600;
      let conv = 0;
      let p = 0;
      for (let i = 0; i < N; i++) {
        const ses = playSession(s, 'trial', `d${i}`, params(s)) as MgSession<TrialData>;
        if (convicted(ses.d)) conv++;
        p += ses.d.pFinal ?? 0;
      }
      expect(Math.abs(conv / N - p / N)).toBeLessThan(0.05);
      expect(Math.abs(conv / N - convictionOdds(s, s.legal!))).toBeLessThan(0.13);
    }
  });

  it('more evidence never makes a conviction less likely', () => {
    const base = { baseDefense: 0, lawyerSkill: 70, defensePts: 0, closingBonus: 0, jurors: [], taint: 0 };
    let last = -1;
    for (let e = 0; e <= 100; e += 5) {
      const p = convictionP({ ...base, items: [{ id: 'e1', kind: 'money', title: '', text: '', weight: 1, physical: true, strength: e, base: e, status: 'pending' }] }).p;
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    const rate = (E: number) => {
      const s = bossOnTrial('mono', E);
      let c = 0;
      for (let i = 0; i < 300; i++) if (convicted((playSession(s, 'trial', `m${i}`, params(s)) as MgSession<TrialData>).d)) c++;
      return c / 300;
    };
    const r = [20, 50, 80].map(rate);
    expect(r[1]).toBeGreaterThan(r[0]);
    expect(r[2]).toBeGreaterThan(r[1]);
  });

  it('the trial popup plays through advanceWeek with replayed moves, and the ledger reconciles', () => {
    let s = bossOnTrial('wk', 70);
    s.legal!.next = s.week;
    for (let i = 0; i < 4 && !s.pendingEvents.some((e) => e.defId === 'trial'); i++) s = advanceWeek(s, {}).state;
    const ev = s.pendingEvents.find((e) => e.defId === 'trial')!;
    expect(ev).toBeTruthy();
    expect(ev.choices.map((c) => c.id)).toEqual(['court', 'quiet', 'plea']);
    const moves = randomMoves(s, 'trial', ev.iid, { defendant: s.playerId, mode: 'boss', play: 1 }, undefined, { rng: 7 });
    const expected = playSession(s, 'trial', ev.iid, { defendant: s.playerId, mode: 'boss', play: 1 }, {}, moves) as MgSession<TrialData>;
    const r = advanceWeek(s, { choices: { [ev.iid]: 'court' }, minigames: { [ev.iid]: moves } });
    expect(reconcile(r.report)).toEqual([]);
    const st = r.state.legal!.stage;
    const v = expected.d.verdict;
    if (v === 'acquitted') expect(st).toBe('quiet');
    else if (v === 'convicted' || v === 'partial' || v === 'plea') expect(st).toBe('prison');
    else if (v === 'hung' || v === 'mistrial') expect(st).toBe('trial');
    expect(r.state.news.some((n) => n.kind === 'minigame')).toBe(true);
    expect(r.state.mg!.history.length).toBe(1);
  });

  it('the boss who flips: the heir takes over a house with a rat in it', () => {
    const s = bossOnTrial('flip', 70);
    const old = s.playerId;
    const ses = playSession(s, 'arraignment', 'evF', { defendant: old, mode: 'boss', play: 1 }, {}, ['knock_quiet', 'notguilty', 'held', 'flip', 'path_heir']) as MgSession<TrialData>;
    expect(ses.d.verdict).toBe('flipped');
    expect(ses.d.path).toBe('heir');
    const ev = { iid: 'evF', defId: 'indictment', week: s.week, mandatory: true, priority: 92, title: 'Indicted', text: '', defaultChoiceId: 'arraign', choices: [{ id: 'arraign', label: '', because: 'x', effects: [{ type: 'minigame' as const, game: 'arraignment' as const, iid: 'evF', params: { defendant: old, mode: 'boss', play: 1 } }] }] };
    s.pendingEvents = [ev];
    const fam = s.heat.family;
    const r = advanceWeek(s, { choices: { evF: 'arraign' }, minigames: { evF: ses.moves } });
    expect(reconcile(r.report)).toEqual([]);
    const n = r.state;
    expect(n.playerId).not.toBe(old);
    expect(n.characters[old].faction).toBe('law');
    expect(n.gameOver).toBeUndefined();
    expect(n.mg!.betrayal?.ratId).toBe(old);
    expect(n.mg!.witnesses.some((w) => w.id === old && w.boss)).toBe(true);
    expect(r.report.lines.some((l) => l.stat === 'heat.family' && l.amount > 0)).toBe(true);
    expect(n.heat.family).toBeGreaterThan(fam - 10);
  });

  it('the boss who flips can play on as the rat in hiding: a short epilogue and the end', () => {
    const s = bossOnTrial('rat', 70);
    const ses = playSession(s, 'arraignment', 'evR', { defendant: s.playerId, mode: 'boss', play: 1 }, {}, ['knock_quiet', 'notguilty', 'held', 'flip', 'path_witness']);
    expect(ses.outcome!.epilogue!.length).toBeGreaterThan(2);
    s.pendingEvents = [{ iid: 'evR', defId: 'indictment', week: s.week, mandatory: true, priority: 92, title: '', text: '', defaultChoiceId: 'a', choices: [{ id: 'a', label: '', because: 'x', effects: [{ type: 'minigame', game: 'arraignment', iid: 'evR', params: { defendant: s.playerId, mode: 'boss', play: 1 } }] }] }];
    const r = advanceWeek(s, { choices: { evR: 'a' }, minigames: { evR: ses.moves } });
    expect(r.state.gameOver?.reason).toBe('witness');
  });

  it('a crew man with a thick file goes to trial; if he flips he testifies against your people', () => {
    let s = newGame('crewtrial');
    s = advanceWeek(s, {}).state;
    const man = crew(s).find((c) => c.rank === 'soldier')!;
    man.evidence = TRIAL_EVIDENCE + 30;
    man.traits = ['Cowardly'];
    onArrest(s, man, 40);
    expect(s.eventQueue.some((e) => e.defId === 'npc_trial' && e.meta?.charId === man.id)).toBe(true);
    // Find a seed where he flips under "trust him".
    let flipped: MgSession<TrialData> | undefined;
    let iid = '';
    for (let i = 0; i < 60 && !flipped; i++) {
      const x = playSession(s, 'trial', `c${i}`, { defendant: man.id, mode: 'crew', play: 1, weeks: 40 }, {}, ['held', 'trust']) as MgSession<TrialData>;
      if (x.d.verdict === 'flipped') {
        flipped = x;
        iid = `c${i}`;
      }
    }
    expect(flipped).toBeTruthy();
    const bossEv = s.characters[s.playerId].evidence ?? 0;
    const ev = buildNpcTrial(s, man, 40);
    ev.iid = iid;
    (ev.choices[0].effects[0] as { iid: string }).iid = iid;
    s.pendingEvents = [ev];
    s.eventQueue = [];
    const r = advanceWeek(s, { choices: { [iid]: 'court' }, minigames: { [iid]: flipped!.moves } });
    expect(reconcile(r.report)).toEqual([]);
    expect(r.state.characters[man.id].faction).toBe('law');
    expect(r.state.characters[r.state.playerId].evidence ?? 0).toBeGreaterThan(bossEv);
    expect(mgOf(r.state).witnesses.some((w) => w.id === man.id && w.against.includes(r.state.playerId))).toBe(true);
    // His testimony becomes an item in the boss's next trial.
    const t = startSession(r.state, 'trial', 'evB', { defendant: r.state.playerId, mode: 'boss', play: 0 }) as MgSession<TrialData>;
    const seated = autoFinish(r.state, t) as MgSession<TrialData>;
    expect(seated.d.items.some((x) => x.kind === 'flipper')).toBe(true);
  });

  it('the old "let it play out" choice still reaches a verdict', () => {
    let s = bossOnTrial('legacy', 80);
    s.legal!.next = s.week;
    for (let i = 0; i < 4 && !s.pendingEvents.some((e) => e.defId === 'trial'); i++) s = advanceWeek(s, {}).state;
    const ev = s.pendingEvents.find((e) => e.defId === 'trial')!;
    const r = advanceWeek(s, { choices: { [ev.iid]: 'quiet' } });
    expect(['prison', 'quiet', 'trial']).toContain(legalOf(r.state).stage);
    expect(r.state.mg!.history[0].game).toBe('trial');
  });

  it('every phase offers real choices with numbers on them', () => {
    const s = bossOnTrial('opts', 60);
    let ses = startSession(s, 'trial', 'evO', { defendant: s.playerId, mode: 'boss', play: 1 });
    const seen = new Set<string>();
    while (!ses.done) {
      seen.add(ses.phase);
      expect(sessionOptions(s, ses).length).toBeGreaterThan(0);
      ses = stepSession(s, ses);
    }
    for (const ph of ['lawyer', 'jury', 'case', 'deal', 'closing', 'verdict']) expect(seen.has(ph), ph).toBe(true);
    expect(ses.outcome!.headline!.headline.length).toBeGreaterThan(5);
  });
});
