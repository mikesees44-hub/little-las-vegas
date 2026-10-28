import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { capos } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { opinion } from '../src/engine/relations';
import { mindsWeek } from '../src/engine/minds';
import {
  negotiable, resolveEventNow, scaleEffects, startDialogue, stepDialogue, talkOutcomeOf, termsToChoice, toneEffect, toneOptions, validateDialogue,
  type Dialogue, type Tone,
} from '../src/engine/minds/dialogue';
import type { EventInstance, GameState, Trait } from '../src/engine/types';

function game(seed = 'dlg-a'): GameState {
  const s = newGame(seed);
  mindsWeek(newCtx(s));
  return s;
}
const who = (s: GameState) => capos(s)[0];

describe('the two-way window: meters move with tone and her nature', () => {
  it('flirting warms a woman who likes it and cools a pious one', () => {
    const s = game();
    const c = who(s);
    const d = startDialogue(s, c.id, 'romance');
    c.traits = ['Womanizer' as Trait];
    const warm = toneEffect(s, d, 'flirt');
    c.traits = ['Pious'];
    const cold = toneEffect(s, d, 'flirt');
    expect(warm.i).toBeGreaterThan(cold.i);
    expect(cold.a).toBeGreaterThan(warm.a);
  });

  it('a hothead flares faster than a coward, and a coward bends', () => {
    const s = game();
    const c = who(s);
    const d = startDialogue(s, c.id, 'negotiate', { label: 'x', unit: '$', dir: 1, ask: 1000, res: 900, lo: 500, hi: 1500 });
    c.traits = ['Hot-headed'];
    const hot = toneEffect(s, d, 'threaten');
    c.traits = ['Cowardly'];
    const cow = toneEffect(s, d, 'threaten');
    expect(hot.a).toBeGreaterThan(cow.a);
    expect(cow.bend).toBeGreaterThan(hot.bend);
  });

  it('every tone option carries a hint; she walks out when the boss keeps getting angry', () => {
    const s = game();
    const c = who(s);
    c.traits = ['Hot-headed'];
    let d: Dialogue = startDialogue(s, c.id, 'romance');
    const opts = toneOptions(s, d);
    expect(opts.map((o) => o.tone)).toEqual(expect.arrayContaining(['flirt', 'compliment', 'push', 'joke', 'apologize', 'backoff', 'walk', 'angry']));
    for (const o of opts) expect(o.hint.length).toBeGreaterThan(0);
    for (let i = 0; i < 6 && !d.end; i++) d = stepDialogue(s, d, 'angry').d;
    expect(d.end).toBe('walkout');
    expect(d.log.some((l) => l.who === 'narrator')).toBe(true);
    // The window is pure and deterministic.
    const a = stepDialogue(s, startDialogue(s, c.id, 'romance'), 'joke');
    const b = stepDialogue(s, startDialogue(s, c.id, 'romance'), 'joke');
    expect(a).toEqual(b);
  });

  it('a negotiation never deals outside her reservation, and accepts at her position', () => {
    const s = game();
    const c = who(s);
    c.traits = ['Greedy'];
    const stake = { label: 'Her price', unit: '$' as const, dir: 1 as const, ask: 1000, res: 850, lo: 400, hi: 1500 };
    let d = startDialogue(s, c.id, 'haggle', stake);
    d = stepDialogue(s, d, 'negotiate', { offer: 400 }).d;
    expect(d.end).not.toBe('deal');
    expect(d.stake!.pos).toBeGreaterThanOrEqual(d.stake!.res);
    expect(d.stake!.pos).toBeLessThan(1000);
    const acc = stepDialogue(s, d, 'accept').d;
    expect(acc.end).toBe('deal');
    expect(acc.deal).toBe(d.stake!.pos);
    // An offer at or above her reservation is taken.
    const ok = stepDialogue(s, startDialogue(s, c.id, 'haggle', stake), 'negotiate', { offer: 900 }).d;
    expect(ok.end).toBe('deal');
    expect(ok.deal).toBe(900);
  });

  it('Claude\'s read of the moment is validated and bounded', () => {
    expect(validateDialogue({ reply: '' })).toBeUndefined();
    expect(validateDialogue('nope')).toBeUndefined();
    const v = validateDialogue({ reply: 'Get out.', interest_delta: -99, anger_delta: 99, walk: true })!;
    expect(v).toEqual({ reply: 'Get out.', interest: -8, anger: 12, walk: true });
    const s = game();
    const d = startDialogue(s, who(s).id, 'romance');
    const r = stepDialogue(s, d, 'joke', { ai: { reply: 'Ha. You wish.', interest: 50, anger: -50, walk: false } });
    expect(r.line).toBe('Ha. You wish.');
    expect(Math.abs(r.di)).toBeLessThanOrEqual(25);
  });

  it('a talk window ends as a bounded talk outcome', () => {
    const s = game();
    let d = startDialogue(s, who(s).id, 'talk');
    for (const t of ['compliment', 'joke', 'flatter'] as Tone[]) d = stepDialogue(s, d, t).d;
    const o = talkOutcomeOf(d);
    expect(o.opinion).toBeGreaterThanOrEqual(-5);
    expect(o.opinion).toBeLessThanOrEqual(5);
    expect(o.reveals).toEqual([]);
  });
});

describe('the nightlife moments go through the existing ops', () => {
  it('the haggle\'s price and deal are evening.ts haggle\'s; the car order carries the agreed price', async () => {
    const { haggle, askingPrice } = await import('../src/engine/evening');
    const { haggleTurn, startHaggle, nightOrder, boldTurn, startBold } = await import('../src/engine/minds/nightDialogue');
    const { boldReply } = await import('../src/engine/quickies');
    const s = game('dlg-night');
    const id = capos(s)[0].id;
    const d0 = startHaggle(s, id, 'car');
    expect(d0.stake!.ask).toBe(askingPrice(s, id, 'car').price);
    const offer = Math.round((d0.stake!.ask * 0.9) / 10) * 10;
    const r = haggleTurn(s, d0, 'car', 'negotiate', offer);
    const h = haggle(s, id, 'car', 'counter', offer, 1, d0.stake!.ask);
    expect(r.d.stake!.pos).toBe(h.price);
    expect(r.d.end === 'deal').toBe(h.result === 'deal');
    const acc = haggleTurn(s, r.d.end ? d0 : r.d, 'car', 'accept');
    expect(acc.d.end).toBe('deal');
    expect(nightOrder('car', id, acc.d)).toEqual({ kind: 'nightlife', op: { op: 'car', id, price: acc.d.deal } });
    // The bold offer: her answer is boldReply's; the order is the same op the old card gave.
    const b = boldTurn(s, startBold(s, id), 250);
    expect(b.result).toBe(boldReply(s, id, 250, 0).result);
    expect(nightOrder('bold', id, b.d, 'none')).toEqual({ kind: 'nightlife', op: { op: 'bold', id, amount: 250, raises: 0, after: 'none' } });
  });
});

/** A decision with a counterpart and money on the table. */
function withDecision(s: GameState): EventInstance {
  const k = capos(s)[0];
  const ev: EventInstance = {
    iid: 'ev-test', defId: 'test_request', title: 'A capo wants a bigger cut', text: '...', week: s.week, actors: [k.id],
    choices: [
      { id: 'pay', label: 'Give him the money', because: 'gave him the money', effects: [{ type: 'money', amount: -1000 }, { type: 'opinion', from: k.id, to: s.playerId, amount: 5, reason: 'Paid me' }] },
      { id: 'no', label: 'Tell him no', because: 'told him no', effects: [{ type: 'opinion', from: k.id, to: s.playerId, amount: -3, reason: 'Said no' }] },
      { id: 'whack', label: 'Have him whacked', because: 'had him whacked', effects: [{ type: 'kill', charId: k.id, cause: 'test' }] },
    ],
    defaultChoiceId: 'no',
  } as unknown as EventInstance;
  s.pendingEvents = [ev, ...s.pendingEvents];
  return ev;
}

describe('negotiating a decision, settled now', () => {
  it('finds the counterpart and the money; a deal scales it within bounds; no deal falls back to the refusal, never the grave choice', () => {
    const s = game('dlg-ev');
    const ev = withDecision(s);
    const n = negotiable(s, ev)!;
    expect(n.counterpart).toBe(capos(s)[0].id);
    expect(n.dealChoice).toBe('pay');
    expect(n.fallback).toBe('no');
    expect(n.stake.dir).toBe(1);
    let d = startDialogue(s, n.counterpart, 'negotiate', n.stake);
    d = stepDialogue(s, d, 'negotiate', { offer: 800 }).d;
    const accepted = d.end === 'deal' ? d : stepDialogue(s, d, 'accept').d;
    const t = termsToChoice(n, accepted);
    expect(t.choiceId).toBe('pay');
    expect(t.scale).toBeGreaterThanOrEqual(0.5);
    expect(t.scale).toBeLessThanOrEqual(1);
    const walked = stepDialogue(s, startDialogue(s, n.counterpart, 'negotiate', n.stake), 'walk').d;
    expect(termsToChoice(n, walked)).toEqual({ choiceId: 'no', scale: 1 });
    expect(scaleEffects([{ type: 'money', amount: -1000 }], 9)[0]).toEqual({ type: 'money', amount: -1500 });
    // With only grave alternatives there is nothing to negotiate.
    const ev2 = { ...ev, iid: 'x2', choices: [ev.choices[0], ev.choices[2]], defaultChoiceId: 'whack' } as EventInstance;
    expect(negotiable(s, ev2)).toBeUndefined();
  });

  it('a decision settled in the window changes the state at once, and the week turn does not apply it again', () => {
    const s = game('dlg-now');
    const ev = withDecision(s);
    const k = capos(s)[0];
    const m0 = s.money;
    const op0 = opinion(s, k.id, s.playerId);
    const r = resolveEventNow(s, ev.iid, 'pay', 0.8);
    expect(r.state.money).toBe(m0 - 800);
    expect(opinion(r.state, k.id, s.playerId)).toBe(op0 + 5);
    expect(r.state.pendingEvents.some((e) => e.iid === ev.iid)).toBe(false);
    expect(r.text).toMatch(/Done/);
    expect(r.state.minds!.settled!.length).toBe(1);
    // Pure: the input is untouched.
    expect(s.money).toBe(m0);
    expect(s.pendingEvents.some((e) => e.iid === ev.iid)).toBe(true);
    // The week's turn: the answer is not applied a second time.
    const wk = advanceWeek(r.state, { choices: { [ev.iid]: 'pay' } });
    expect(wk.report.lines.some((l) => l.label.startsWith('A capo wants a bigger cut'))).toBe(false);
    // An unknown event or choice changes nothing.
    expect(resolveEventNow(s, 'nope', 'pay').state).toBe(s);
    expect(resolveEventNow(s, ev.iid, 'nope').state).toBe(s);
  });
});

describe('the windows render (phone-first modal card)', () => {
  it('the dialogue, negotiation and talk windows render without Claude', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { DialogueWindow } = await import('../src/ui/minds/DialogueWindow');
    const { NegotiationWindow } = await import('../src/ui/minds/NegotiationWindow');
    const { TalkPanel } = await import('../src/ui/minds/TalkPanel');
    const s = game('dlg-ui');
    const ev = withDecision(s);
    const k = capos(s)[0];
    const d = stepDialogue(s, startDialogue(s, k.id, 'romance'), 'joke').d;
    const html = renderToString(createElement(DialogueWindow, { s, d, title: 'Test', onTone: () => {}, onClose: () => {} }));
    expect(html).toContain('dialogue-window');
    expect(html).toContain('dialogue-meters');
    expect(html).toContain('Flirt');
    expect(renderToString(createElement(NegotiationWindow, { s, ev, onClose: () => {} }))).toContain('dialogue-stake');
    expect(renderToString(createElement(TalkPanel, { s, id: k.id, update: () => {}, onClose: () => {} }))).toContain('Sit and talk');
  });
});
