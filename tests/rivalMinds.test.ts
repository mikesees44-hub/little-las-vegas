import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { player } from '../src/engine/characters';
import { scoreMoves } from '../src/engine/rivals';
import { rivalLean } from '../src/engine/minds/planner';
import { ensureIntrigue } from '../src/engine/intrigueState';
import { ensureThreats } from '../src/engine/threats';
import { checkThought, heardOnDesk, mindAccess, rivalThought, seenThought, thoughtPrompt } from '../src/engine/ai/rivalMinds';
import { bossDesk } from '../src/engine/desk';
import { RivalMind } from '../src/ui/ai/RivalMind';
import type { GameState, RivalId } from '../src/engine/types';

function base(seed = 'rm-1'): { s: GameState; rid: RivalId; leader: string } {
  const s = newGame(seed);
  player(s).attributes.intrigue = 10;
  const r = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive)!;
  return { s, rid: r.id, leader: r.leaderId };
}

function withSpy(s: GameState, rid: RivalId): void {
  const I = ensureIntrigue(s);
  const man = Object.values(s.characters).find((c) => c.alive && c.faction === rid && c.id !== s.rivals.find((r) => r.id === rid)!.leaderId)!;
  I.spies.push({ id: 'sp-test', charId: man.id, master: 'player', inside: rid, how: 'bribe', since: s.week, cover: 80 });
}

describe('rival minds: the thought is the engine\'s own', () => {
  it('his next move is the top of the week\'s scored, mind-weighed candidates', () => {
    for (const seed of ['rm-a', 'rm-b', 'rm-c']) {
      const { s } = base(seed);
      for (const r of s.rivals.filter((x) => x.kind !== 'law')) {
        if (!s.characters[r.leaderId]?.alive) continue;
        const snap = JSON.stringify(s);
        const t = rivalThought(s, r.id)!;
        expect(JSON.stringify(s)).toBe(snap); // pure
        const cands = scoreMoves(s, r);
        rivalLean(s, r, cands);
        const best = cands.reduce((a, b) => (b.score > a.score ? b : a), cands[0]);
        if (!best) { expect(t.move).toBeUndefined(); continue; }
        expect(cands.filter((c) => c.score === best.score).some((c) => c.move === t.move && c.target === t.target)).toBe(true);
        expect(t.share).toBeGreaterThan(0);
        expect(t.share).toBeLessThanOrEqual(1);
        expect(t.line.length).toBeGreaterThan(0);
      }
    }
  });

  it('a plan already set against your people is in his thoughts and on the Desk', () => {
    const { s, rid, leader } = base('rm-2');
    withSpy(s, rid);
    const T = ensureThreats(s);
    T.threats.push({ id: 'th-test', kind: 'hit', by: rid, targetId: s.playerId, start: s.week, due: s.week + 1, blunt: 0 });
    const t = rivalThought(s, rid)!;
    expect(t.plots.map((p) => p.id)).toContain('th-test');
    expect(t.aimsAtYou).toBe(true);
    expect(t.brief.join(' ')).toMatch(/already set in motion: a hit against the boss himself/i);
    const heard = heardOnDesk(s);
    expect(heard.some((h) => h.key === `heard:${rid}` && h.title.startsWith('Heard:') && h.ref.charId === leader)).toBe(true);
    expect(bossDesk(s).find((g) => g.kind === 'upcoming')?.items.some((i) => i.key === `heard:${rid}`)).toBe(true);
  });
});

describe('rival minds: who can see it', () => {
  it('nothing without a way in; a spy, an informant or the nose opens it', () => {
    const { s, rid, leader } = base('rm-3');
    const no = mindAccess(s, rid);
    expect(no.ok).toBe(false);
    expect(no.why).toContain(s.characters[leader].firstName);
    expect(seenThought(s, rid).thought).toBeUndefined();
    expect(heardOnDesk(s)).toEqual([]);

    const a = structuredClone(s);
    withSpy(a, rid);
    expect(mindAccess(a, rid).ok).toBe(true);
    expect(seenThought(a, rid).thought).toBeDefined();

    const b = structuredClone(s);
    const man = Object.values(b.characters).find((c) => c.alive && c.faction === rid && c.id !== leader)!;
    man.informantFor = 'player';
    expect(mindAccess(b, rid).ok).toBe(true);

    const c = structuredClone(s);
    player(c).attributes.intrigue = 90;
    expect(mindAccess(c, rid)).toMatchObject({ ok: true, via: 'your own nose for it' });

    // A spy who was pulled out is no way in.
    const d = structuredClone(s);
    withSpy(d, rid);
    d.intrigue!.spies[d.intrigue!.spies.length - 1].ended = d.week;
    expect(mindAccess(d, rid).ok).toBe(false);
  });
});

describe('rival minds: the voice and the card', () => {
  it('the validator keeps his words to the brief', () => {
    const { s, rid } = base('rm-4');
    const t = rivalThought(s, rid)!;
    expect(thoughtPrompt(t)[0].content).toContain('FACTS');
    expect(checkThought(s, t, { thought: 'The island is getting crowded. Somebody has to make room.' })).toBeTruthy();
    const other = Object.values(s.characters).find((c) => c.lastName.length >= 4 && !t.names.includes(c.lastName) && !t.names.includes(c.firstName))!;
    expect(checkThought(s, t, { thought: `${other.lastName} is weak.` })).toBeUndefined();
    expect(checkThought(s, t, { thought: 'Hit them on the 4th.' })).toBeUndefined();
    expect(checkThought(s, t, { thought: Array(70).fill('quiet').join(' ') })).toBeUndefined();
    expect(checkThought(s, t, null)).toBeUndefined();
  });

  it('the card renders locked and open without Claude', () => {
    const { s, rid } = base('rm-5');
    expect(renderToString(createElement(RivalMind, { s, rival: rid }))).toContain(`rival-mind-locked-${rid}`);
    withSpy(s, rid);
    const html = renderToString(createElement(RivalMind, { s, rival: rid }));
    expect(html).toContain(`rival-mind-text-${rid}`);
    expect(html).toContain('What he&#x27;s thinking');
  });
});
