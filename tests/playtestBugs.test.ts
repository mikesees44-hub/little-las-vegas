/**
 * Regression tests for the MAKE_IT_GREAT playtest bugs (#6, #7, #11 and the twice-told funeral).
 */
import { describe, expect, it } from 'vitest';
import { newGameWith } from '../src/engine/starts';
import { openingCard } from '../src/engine/scenes';
import { startSession, stepSession, sessionOptions, type MgSession } from '../src/engine/minigames';
import type { SceneData } from '../src/engine/scenes';
import type { PlayerAction } from '../src/engine/types';
import { signDeal } from '../src/ui/econ/DealWindow';
import { loadDesk, saveDesk, type KV } from '../src/ui/save';
import { resumeSession } from '../src/ui/minigames/MinigameScreen';
import { bareQuote, pickVoices } from '../src/ui/components/ConfirmOrder';
import { railTipClass } from '../src/ui/shell/LeftRail';
import { HINT_POS } from '../src/ui/shell/HintHost';
import { OFFICE_CARD_RECT } from '../src/ui/office/BossOffice';
import { HOTSPOTS } from '../src/ui/office/hotspots';
import type { Voice } from '../src/engine/counsel';
import { spendTime, timeBlock } from '../src/engine/timeCost';

function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('#6 signing a deal buys the place', () => {
  it('Sign queues the order already confirmed: no second "Are you sure?" to lose behind the congratulations', () => {
    const s = newGameWith('pt-sign');
    const a: PlayerAction = { kind: 'order', key: 'cops', via: 'direct' } as PlayerAction;
    const calls: { a: PlayerAction; confirmed?: boolean }[] = [];
    const r = signDeal(s, a, { queue: (x, confirmed) => calls.push({ a: x, confirmed }) });
    expect(r).toBe('queued');
    expect(calls).toEqual([{ a, confirmed: true }]);
  });
  it('with no hours left today the signed deal is booked for tomorrow, never dropped', () => {
    let s = newGameWith('pt-sign2');
    const a = { kind: 'econ', op: { type: 'deal', target: { kind: 'lot', lotId: 'x' }, terms: { haggles: 0, cash: 0 } } } as unknown as PlayerAction;
    for (let i = 0; i < 40 && !timeBlock(s, a); i++) s = spendTime(s, a).state;
    expect(timeBlock(s, a)).toBeTruthy();
    const got: string[] = [];
    expect(signDeal(s, a, { queue: () => got.push('queue'), later: () => got.push('later') })).toBe('tomorrow');
    expect(got).toEqual(['later']);
  });
  it('the advisers do not say the same words three times, and their words carry one pair of quotes', () => {
    const v = (id: string, role: string, says: string) => ({ adviser: { charId: id, role, name: id, title: role }, says, verdict: 'dont', pros: [], cons: [] }) as unknown as Voice;
    const vs = pickVoices([v('a', 'underboss', '"With respect, no."'), v('b', 'consigliere', '“With respect, no.”'), v('c', 'capo', 'Do it.')]);
    expect(vs.map((x) => x.adviser.charId)).toEqual(['a', 'c']);
    expect(bareQuote('"With respect, no…"')).toBe('With respect, no…');
  });
});

describe('#7 the week in progress survives a reload', () => {
  it('queued orders, answers and a half-played scene come back for the same game and week', () => {
    const kv = memKV();
    const s = newGameWith('pt-desk');
    const order = { kind: 'order', key: 'cops', via: 'direct' } as PlayerAction;
    saveDesk(1, { seed: s.seed, week: s.week, orders: [order], answers: { e1: 'a' }, moves: {}, partial: { e2: ['x'] }, auto: ['e2'] }, kv);
    const d = loadDesk(1, s, kv)!;
    expect(d.orders).toEqual([order]);
    expect(d.answers).toEqual({ e1: 'a' });
    expect(d.partial).toEqual({ e2: ['x'] });
    expect(d.auto).toEqual(['e2']);
  });
  it('a new week or another game starts with a clean desk', () => {
    const kv = memKV();
    const s = newGameWith('pt-desk2');
    saveDesk(1, { seed: s.seed, week: s.week, orders: [{ kind: 'order', key: 'cops', via: 'direct' } as PlayerAction], answers: {}, moves: {}, auto: [] }, kv);
    expect(loadDesk(1, { seed: s.seed, week: s.week + 1 }, kv)).toBeUndefined();
    expect(loadDesk(1, { seed: 'other', week: s.week }, kv)).toBeUndefined();
    // An empty desk removes the record.
    saveDesk(1, { seed: s.seed, week: s.week, orders: [], answers: {}, moves: {}, auto: [] }, kv);
    expect(kv.m.size).toBe(0);
  });
  it('"Made the boss" resumes after the moves already made instead of page 1', () => {
    const s = newGameWith('pt-resume');
    const ev = s.pendingEvents.find((e) => e.defId === 'made_boss')!;
    const params = (ev.choices[0].effects[0] as { params: Record<string, string | number> }).params;
    const first = startSession(s, 'madeboss', ev.iid, params) as MgSession<SceneData>;
    let ses = first;
    for (let i = 0; i < 2; i++) ses = stepSession(s, ses, sessionOptions(s, ses).filter((o) => !o.disabled)[0].id);
    const back = resumeSession(s, first, ses.moves) as MgSession<SceneData>;
    expect(back.moves).toEqual(ses.moves);
    expect(back.d.card.text).toBe(ses.d.card.text);
    expect(back.d.card.text).not.toBe(first.d.card.text);
  });
  it('the funeral is told once: the scene\'s first page does not repeat the opening card', () => {
    const s = newGameWith('pt-funeral', 'classic');
    const card = openingCard(s);
    const ev = s.pendingEvents.find((e) => e.defId === 'made_boss')!;
    const params = (ev.choices[0].effects[0] as { params: Record<string, string | number> }).params;
    const ses = startSession(s, 'madeboss', ev.iid, params) as MgSession<SceneData>;
    if (card.key === 'opening') {
      expect(card.text).toMatch(/lilies/);
      expect(ses.d.card.text).not.toMatch(/lilies|floor wax|bronze casket/);
    }
    // No sentence of the card appears again on page one.
    for (const sentence of card.text.split(/(?<=\.)\s+/).filter((x) => x.length > 30)) expect(ses.d.card.text).not.toContain(sentence);
  });
});

describe('#11 tips never sit on an open panel', () => {
  it('the rail\'s hover tip is off while a panel is open and right after a click', () => {
    expect(railTipClass(true, false)).toBeUndefined();
    expect(railTipClass(false, true)).toBeUndefined();
    expect(railTipClass(false, false)).toMatch(/delay-/);
  });
  it('coach marks keep to the bottom strip, never the top of the drawer or the door list', () => {
    for (const [k, cls] of Object.entries(HINT_POS)) expect(cls, k).not.toMatch(/top-/);
  });
  it('Monday\'s card in the Office covers no hotspot', () => {
    const r = OFFICE_CARD_RECT;
    for (const h of HOTSPOTS) {
      const q = h.rect;
      const overlap = q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y;
      expect(overlap, h.id).toBe(false);
    }
  });
});
