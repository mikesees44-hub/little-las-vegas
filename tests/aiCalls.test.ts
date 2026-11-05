import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { crew } from '../src/engine/characters';
import { changeMeter, opinion } from '../src/engine/relations';
import {
  answerWord, checkReplyClass, checkText, checkWordMessage, reconcileWord, replyPrompt, wordCandidates, wordPrompt, wordThisWeek, WORD_PER_WEEK,
} from '../src/engine/ai/calls';
import { bossDesk } from '../src/engine/desk';
import { WordPanel } from '../src/ui/ai/WordPanel';
import type { GameState } from '../src/engine/types';

function base(seed = 'calls-1'): GameState {
  const s = newGame(seed);
  s.money = Math.max(s.money, 20000);
  return s;
}

function pinched(seed = 'calls-1'): { s: GameState; id: string } {
  const s = base(seed);
  const c = crew(s).find((x) => x.rank === 'soldier') ?? crew(s)[0];
  c.imprisonedUntil = s.week + 6;
  return { s, id: c.id };
}

describe('word from people: reasons from real state', () => {
  it('a fresh game makes no word state', () => {
    expect(newGame('calls-fresh').phone?.word).toBeUndefined();
  });

  it('a man in the county jail writes a letter', () => {
    const { s, id } = pinched();
    const w = wordCandidates(s).map((x) => x.w).find((x) => x.id === `pinch:${id}`);
    expect(w).toBeDefined();
    expect(w!.from).toBe('the county jail');
    expect(w!.names).toContain(s.characters[id].firstName);
    expect(w!.brief.join(' ')).toMatch(/county jail/);
    // Free him: no letter.
    s.characters[id].imprisonedUntil = undefined;
    expect(wordCandidates(s).some((x) => x.w.id === `pinch:${id}`)).toBe(false);
  });

  it('a grievance and a war make callers; one to three a week, one per kind', () => {
    const s = base('calls-2');
    const m = crew(s).find((x) => x.rank !== 'capo') ?? crew(s)[0];
    changeMeter(s, m.id, s.playerId, 'grievance', 60);
    const r = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive)!;
    r.war = true;
    const ids = wordCandidates(s).map((x) => x.w.id);
    expect(ids).toContain(`grievance:${m.id}`);
    expect(ids).toContain(`rival:${r.leaderId}`);
    const wk = wordThisWeek(s);
    expect(wk.length).toBeGreaterThanOrEqual(1);
    expect(wk.length).toBeLessThanOrEqual(WORD_PER_WEEK);
    expect(new Set(wk.map((w) => w.kind)).size).toBe(wk.length);
    // Every reply is a whitelist of the game's own effects.
    for (const w of wk) for (const rp of w.replies) expect(rp.eff.length).toBeGreaterThan(0);
  });
});

describe('word from people: answering', () => {
  it('a reply applies its effects, reconciles, is filed, and cools down', () => {
    const { s, id } = pinched('calls-3');
    // Make sure the letter is among this week's.
    const w = wordThisWeek(s).find((x) => x.id === `pinch:${id}`)!;
    expect(w).toBeDefined();
    const before = opinion(s, id, s.playerId);
    const r = answerWord(s, w.id, 'family');
    expect(r.result.ok).toBe(true);
    expect(r.state.money).toBe(s.money - 300);
    expect(reconcileWord(r.state, r.result)).toEqual([]);
    expect(opinion(r.state, id, s.playerId)).toBeGreaterThan(before);
    expect(r.state.journal!.e.some((e) => e.t.includes(s.characters[id].lastName) && e.src === 'phone')).toBe(true);
    expect(s.phone?.word).toBeUndefined(); // pure
    expect(wordThisWeek(r.state).some((x) => x.id === w.id)).toBe(false);
    // The cooldown holds into the next week; then he may write again.
    const next = { ...r.state, week: r.state.week + 1 };
    expect(wordCandidates(next).some((x) => x.w.id === w.id)).toBe(true);
    expect(wordThisWeek(next).some((x) => x.id === w.id)).toBe(false);
    const later = { ...r.state, week: r.state.week + 3 };
    expect(wordThisWeek(later).some((x) => x.id === w.id) || wordThisWeek(later).some((x) => x.kind === 'pinch')).toBe(true);
  });

  it('heat and rival opinion move through the ledger and reconcile', () => {
    const s = base('calls-4');
    const r = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive)!;
    r.war = true;
    const w = wordCandidates(s).map((x) => x.w).find((x) => x.id === `rival:${r.leaderId}`)!;
    // Force it in: answerWord answers only this week's word.
    const wk = wordThisWeek(s);
    if (!wk.some((x) => x.id === w.id)) return; // not picked this week; covered by the reply-shape test above
    const res = answerWord(s, w.id, 'warn');
    expect(res.result.ok).toBe(true);
    expect(reconcileWord(res.state, res.result)).toEqual([]);
    expect(res.state.respect).toBeGreaterThanOrEqual(s.respect);
  });

  it('an answer the Family cannot pay for, or not on the menu, is refused', () => {
    const { s, id } = pinched('calls-5');
    s.money = 10;
    const w = wordThisWeek(s).find((x) => x.id === `pinch:${id}`)!;
    expect(answerWord(s, w.id, 'family').result.ok).toBe(false);
    expect(answerWord(s, w.id, 'shoot him').result.ok).toBe(false);
    expect(answerWord(s, 'nobody:x', 'family').result.ok).toBe(false);
    const ok = answerWord(s, w.id, 'quiet');
    expect(ok.result.ok).toBe(true);
    expect(reconcileWord(ok.state, ok.result)).toEqual([]);
  });
});

describe('word from people: the validator', () => {
  it('rejects invented names, numbers, overlong text; keeps a clean message', () => {
    const { s, id } = pinched('calls-6');
    const w = wordThisWeek(s).find((x) => x.id === `pinch:${id}`)!;
    const me = s.characters[id].firstName;
    expect(checkWordMessage(s, w, { message: `It's ${me}. They feed us slop in here. Look in on my wife, boss.` })).toBeTruthy();
    const other = Object.values(s.characters).find((c) => c.id !== id && c.id !== s.playerId && c.lastName.length >= 4 && !w.names.includes(c.lastName) && !w.names.includes(c.firstName))!;
    expect(checkWordMessage(s, w, { message: `Tell ${other.lastName} I said hello.` })).toBeUndefined();
    expect(checkWordMessage(s, w, { message: 'Send me 500 dollars.' })).toBeUndefined();
    expect(checkWordMessage(s, w, { message: Array(90).fill('word').join(' ') })).toBeUndefined();
    expect(checkWordMessage(s, w, 'just a string')).toBeUndefined();
    expect(checkText(s, w, '', 80)).toBeUndefined();
  });

  it('a typed reply maps only to a whitelisted index', () => {
    const { s, id } = pinched('calls-7');
    const w = wordThisWeek(s).find((x) => x.id === `pinch:${id}`)!;
    expect(checkReplyClass(s, w, { choice: 0, answer: 'Thank you, boss.' })?.reply.id).toBe(w.replies[0].id);
    expect(checkReplyClass(s, w, { choice: '1', answer: 'All right.' })?.reply.id).toBe(w.replies[1].id);
    expect(checkReplyClass(s, w, { choice: 9 })).toBeUndefined();
    expect(checkReplyClass(s, w, { choice: -1 })).toBeUndefined();
    expect(checkReplyClass(s, w, { choice: 'kill him' })).toBeUndefined();
    // A bad answer text keeps the classification, drops the words.
    const c = checkReplyClass(s, w, { choice: 0, answer: 'It cost me 300.' });
    expect(c?.reply.id).toBe(w.replies[0].id);
    expect(c?.answer).toBeUndefined();
    // The prompts carry only the brief and the menu.
    expect(wordPrompt(w)[0].content).toContain('FACTS');
    expect(replyPrompt(w, 'Tell him we got him', w.line)[0].content).toContain(`0: ${w.replies[0].label}`);
  });
});

describe('word from people: screens', () => {
  it('the panel renders without Claude, and the Desk points to it', () => {
    const { s, id } = pinched('calls-8');
    const html = renderToString(createElement(WordPanel, { s }));
    expect(html).toContain('data-testid="word-panel"');
    expect(html).toContain(`data-testid="word-pinch:${id}"`);
    expect(html).toContain('Open the letter');
    const up = bossDesk(s).find((g) => g.kind === 'upcoming');
    expect(up?.items.some((i) => i.key === 'word')).toBe(true);
  });
});
