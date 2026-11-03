import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { capos, player } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { upgradeSave } from '../src/engine/upgradeSave';
import { addOpinion, opinion } from '../src/engine/relations';
import { mindsWeek } from '../src/engine/minds';
import { setTie } from '../src/engine/deeds/state';
import { applyEffects } from '../src/engine/effects';
import {
  applyDecision, buildProposal, dismissReactions, ensureReactions, nextReactions, POPS_PER_WEEK, predictChoice, proposalsEventSource,
  reactionDigest, reactionsTo, rxChoiceBegin, rxEnd, smoothOptions, smoothOver, type Decision,
} from '../src/engine/reactions';
import type { Character, EventInstance, GameState, Trait } from '../src/engine/types';

function game(seed = 'rx-a'): GameState {
  const s = newGame(seed);
  mindsWeek(newCtx(s));
  return s;
}
const nonKin = (s: GameState) => capos(s).filter((c) => !c.dynasty);
function setTraits(c: Character, t: Trait[]) { c.traits = t; }
const decline = (t: string, extra: Partial<Decision> = {}): Decision => ({ k: 'decline', label: 'You turned him down', t, v: -10, y: 'Turned down my idea', pride: 1, ...extra });

describe('reactions: who cares', () => {
  it('the target, his blood, his capo, his friends and rivals, the other capos all react', () => {
    const s = game();
    const [k, other] = nonKin(s);
    const man = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.capoId === k.id && c.rank !== 'capo')!;
    expect(man).toBeTruthy();
    // A friend and an enemy.
    const friend = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.id !== man.id && c.id !== k.id && c.id !== s.playerId && c.id !== other.id)!;
    setTie(s, man.id, friend.id, 'friend', 'Grew up together');
    setTie(s, man.id, other.id, 'rival', 'Bad blood');
    const list = reactionsTo(s, { k: 'punish', label: 'You came down on him', t: man.id, v: -20, y: 'Came down on me' });
    const roles = new Map(list.map((r) => [r.who, r]));
    expect(roles.get(man.id)?.role).toBe('target');
    expect(roles.get(k.id)?.role).toBe('capo');
    expect(roles.get(k.id)!.v).toBeLessThan(0);
    expect(roles.get(friend.id)?.why).toMatch(/friend/);
    expect(roles.get(friend.id)!.v).toBeLessThan(0);
    // His rival is pleased to see him put in his place.
    expect(roles.get(other.id)!.v).toBeGreaterThan(0);
    expect(roles.get(other.id)!.why).toMatch(/place/);
    // Third parties are there, not just the target.
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  it('favoring one capo makes an ambitious one jealous; the one passed over is told', () => {
    const s = game();
    const [a, b] = nonKin(s);
    setTraits(b, ['Ambitious']);
    const list = reactionsTo(s, { k: 'promote', label: 'You moved him up', t: a.id, v: 12, y: 'Moved me up' });
    const jealous = list.find((r) => r.who === b.id)!;
    expect(jealous.v).toBeLessThan(0);
    expect(jealous.why).toBe(`Favored ${a.firstName} over me`);
    expect(jealous.trait).toBe('Ambitious');
    const passed = reactionsTo(s, { k: 'favor', label: 'You sided with him', t: a.id, v: 10, over: b.id });
    expect(passed.find((r) => r.who === b.id)?.role).toBe('passed');
  });

  it('a family, Philadelphia and the wife react when it is about them', () => {
    const s = game();
    const r = s.rivals.find((x) => x.kind === 'mob')!;
    const list = reactionsTo(s, { k: 'war', label: 'You went to war', fam: [{ id: r.id, v: -10, y: 'Made war on us' }], wife: { v: -8, y: 'Brought war to the house' } });
    const who = new Set(list.map((x) => x.role));
    expect(who.has('family')).toBe(true);
    expect(who.has('philly')).toBe(true);
    if (s.characters[player(s).spouseId ?? '']?.alive) expect(who.has('wife')).toBe(true);
  });
});

describe('reactions: declining scales with his nature', () => {
  it('a Hot-headed, Vengeful man takes a no much harder than a Patient one', () => {
    const s = game();
    const k = nonKin(s)[0];
    setTraits(k, ['Patient']);
    const calm = reactionsTo(s, decline(k.id)).find((r) => r.who === k.id)!;
    setTraits(k, ['Hot-headed', 'Vengeful']);
    const hot = reactionsTo(s, decline(k.id)).find((r) => r.who === k.id)!;
    expect(hot.v).toBeLessThan(calm.v);
    expect(hot.tone).toBe('furious');
    expect(hot.trait).toBe('Hot-headed');
    expect(hot.major).toBe(true);
    expect(calm.tone).toBe('displeased');
    // Loyal-to-a-fault halves it, as addOpinion will.
    setTraits(k, ['Loyal-to-a-fault']);
    const loyal = reactionsTo(s, decline(k.id)).find((r) => r.who === k.id)!;
    expect(loyal.v).toBeGreaterThan(calm.v);
  });
});

describe('reactions: predicted = applied', () => {
  it('every proposal option: what the card shows is what lands', () => {
    const s0 = game('rx-pred');
    let n = 0;
    for (const kind of ['capoRacket', 'capoMan', 'rivalTruce', 'rivalVenture', 'phillyPoint', 'ubPurge', 'wifeFamily', 'rivalSwap', 'rivalMarriage'] as const) {
      const base = cloneState(s0);
      const ev = buildProposal(base, kind);
      if (!ev) continue;
      for (const ch of ev.choices) {
        const s = cloneState(base);
        const pred = predictChoice(s, ev, ch);
        expect(ch.detail).toMatch(/(Accepting|Declining):/);
        const before = new Map(pred.map((r) => [r.who, opinion(s, r.who, s.playerId)]));
        const ctx = newCtx(s);
        applyEffects(ctx, ch.effects, { label: ev.title, because: ch.because, category: 'event' });
        const got = s.reactions?.q.at(-1)?.items ?? [];
        for (const r of pred) {
          if (!s.characters[r.who]?.alive) continue;
          const after = opinion(s, r.who, s.playerId);
          // The opinion moved by the predicted amount (only reactions touch these people in a proposal).
          if (!r.direct && Math.abs(before.get(r.who)! + r.v) < 100) expect(after - before.get(r.who)!, `${kind}/${ch.id}/${r.who}`).toBe(r.v);
          const g = got.find((x) => x.who === r.who);
          if (g) expect(g.v).toBe(r.v);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(5);
  });

  it('an inferred decision (a plain choice) is read before its effects and lands as predicted', () => {
    const s = game();
    const [a, b] = nonKin(s);
    const ev: EventInstance = {
      iid: 'ev-t', defId: 'deed_clash', title: 'At odds', text: '', week: s.week, defaultChoiceId: 'a', mandatory: false, priority: 1, meta: { charId: a.id }, actors: [a.id, b.id],
      choices: [{ id: 'a', label: 'Side with A', because: 'sided', effects: [{ type: 'opinion', from: a.id, to: s.playerId, amount: 10, reason: 'Took my side' }, { type: 'opinion', from: b.id, to: s.playerId, amount: -12, reason: 'Took his side' }] }],
    };
    const pred = predictChoice(s, ev, ev.choices[0]);
    expect(pred.find((r) => r.who === a.id)?.direct).toBe(1);
    expect(pred.find((r) => r.who === b.id)?.v).toBeLessThan(0);
    const rx = rxChoiceBegin(s, ev, ev.choices[0]);
    const ctx = newCtx(s);
    applyEffects(ctx, ev.choices[0].effects, { label: 'x', because: 'x', category: 'event' });
    rxEnd(ctx, rx);
    expect(rx!.list.map((r) => [r.who, r.v])).toEqual(pred.map((r) => [r.who, r.v]));
  });
});

describe('reactions: the window', () => {
  it('one decision makes one window (batched, at most 5), minor ones go to the summary', () => {
    const s = game();
    const k = nonKin(s)[0];
    setTraits(k, ['Hot-headed']);
    const ctx = newCtx(s);
    const b = applyDecision(ctx, decline(k.id, { fam: [{ id: 'philly' as never, v: -9, y: 'Turned down a peace' }] }));
    expect(b).toBeTruthy();
    expect(ensureReactions(s).q).toHaveLength(1);
    expect(b!.items.length).toBeLessThanOrEqual(5);
    expect(b!.items[0].major).toBe(true);
    // A minor decision: no window, a line in the summary.
    const w = nonKin(s)[1];
    setTraits(w, ['Patient']);
    applyDecision(ctx, { k: 'decline', label: 'You put him off', t: w.id, v: -3, y: 'Told me to wait' });
    expect(ensureReactions(s).q).toHaveLength(1);
    expect(reactionDigest(s).some((x) => x.who === w.id)).toBe(true);
  });

  it('the weekly window cap holds; the rest rolls into the summary', () => {
    const s = game();
    const ctx = newCtx(s);
    for (const k of nonKin(s)) { setTraits(k, ['Hot-headed', 'Vengeful']); applyDecision(ctx, decline(k.id)); }
    expect(nonKin(s).length).toBeGreaterThan(POPS_PER_WEEK);
    expect(ensureReactions(s).q.length).toBe(POPS_PER_WEEK);
    expect(ensureReactions(s).log.length).toBeGreaterThan(0);
  });

  it('smoothing it over gives opinion back, costs what it says, and closes the option', () => {
    const s = game();
    const k = nonKin(s)[0];
    setTraits(k, ['Hot-headed']);
    s.tribute && (s.tribute.acct.personal = 5000);
    applyDecision(newCtx(s), decline(k.id));
    const b = nextReactions(s)!;
    const r = b.items.find((x) => x.who === k.id)!;
    const opt = smoothOptions(s, r).find((o) => o.how === 'gift')!;
    const before = opinion(s, k.id, s.playerId);
    const s2 = smoothOver(s, b.id, k.id, 'gift');
    expect(opinion(s2, k.id, s2.playerId)).toBe(before + opt.back);
    expect(nextReactions(s2)!.items.find((x) => x.who === k.id)!.smooth).toBeUndefined();
    expect(smoothOver(s2, b.id, k.id, 'gift')).toBe(s2);
    const s3 = dismissReactions(s2, b.id);
    expect(nextReactions(s3)).toBeUndefined();
    // Pure: the input is untouched.
    expect(opinion(s, k.id, s.playerId)).toBe(before);
  });

  it('a furious capo sulks (holds back on his envelope); a declined proud man may go to a rival', () => {
    const s = game();
    const k = nonKin(s)[0];
    setTraits(k, ['Hot-headed', 'Ambitious']);
    const r = s.rivals.find((x) => x.kind === 'mob')!;
    const b = applyDecision(newCtx(s), decline(k.id, { go: r.id }))!;
    const me = b.items.find((x) => x.who === k.id)!;
    expect(me.tone).toBe('furious');
    expect(me.next).toMatch(/Sulks/);
    expect(s.reactions!.sulk[k.id]).toBeGreaterThan(s.week);
  });
});

describe('reactions: proposals, determinism, saves', () => {
  it('proposals come through the pipeline under the caps, and each option carries a react op', () => {
    let s = newGame('rx-props');
    const seen: string[] = [];
    for (let i = 0; i < 30 && !s.gameOver; i++) {
      for (const e of s.pendingEvents) if (e.defId.startsWith('rx_')) {
        seen.push(e.defId);
        for (const c of e.choices) expect(c.effects[0]).toMatchObject({ type: 'deed', op: { op: 'react' } });
      }
      // Never two proposals in one week.
      expect(s.pendingEvents.filter((e) => e.defId.startsWith('rx_')).length).toBeLessThanOrEqual(1);
      s = advanceWeek(s, {}).state;
    }
    expect(s.reactions?.stats.props ?? 0).toBeGreaterThan(0);
    const st = s.reactions!;
    expect(st.pl).toBeLessThanOrEqual(s.week);
    void seen;
  }, 120000);

  it('the source never makes two within the gap', () => {
    const s = game();
    s.week = 10;
    const R = ensureReactions(s);
    R.pl = 9;
    expect(proposalsEventSource(s)).toBeUndefined();
  });

  it('deterministic: the same seed and answers give the same reactions', () => {
    const run = () => {
      const s = game('rx-det');
      const k = nonKin(s)[0];
      addOpinion(s, k.id, s.playerId, 'x', -5);
      const ev = buildProposal(s, 'capoRacket')!;
      const ctx = newCtx(s);
      applyEffects(ctx, ev.choices.find((c) => c.id === 'no')!.effects, { label: 'x', because: 'x', category: 'event' });
      return JSON.stringify([ev.title, s.reactions]);
    };
    expect(run()).toBe(run());
  });

  it('save round-trip and upgradeSave: nothing lost, nothing changed', () => {
    const s = game();
    const k = nonKin(s)[0];
    applyDecision(newCtx(s), decline(k.id));
    const back = JSON.parse(JSON.stringify(s)) as GameState;
    expect(back.reactions).toEqual(s.reactions);
    const up = upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(up.reactions).toEqual(s.reactions);
    // A save without the layer gets none at load.
    const fresh = newGame('rx-up');
    const before = JSON.stringify(fresh);
    const up2 = upgradeSave(JSON.parse(before));
    expect(up2.reactions).toBeUndefined();
  });
});
