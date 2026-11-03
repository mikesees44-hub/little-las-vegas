import { describe, expect, it } from 'vitest';
import '../src/engine/engine';
import { advanceWeek } from '../src/engine/engine';
import { newGameWith } from '../src/engine/starts';
import { buildAsk } from '../src/engine/deeds/asks';
import { inbox } from '../src/engine/inbox';
import { bossDesk } from '../src/engine/desk';
import type { GameState } from '../src/engine/types';

const RAW = /\b(capo|ev|tip|biz|pol):[a-z]?\d+\b|\bundefined\b|\bNaN\b|\[object /;

function texts(s: GameState): string[] {
  const out: string[] = [];
  for (const e of s.pendingEvents) out.push(e.title, e.text, ...e.choices.flatMap((c) => [c.label, c.detail ?? '']));
  for (const i of inbox(s)) out.push(i.title, i.why);
  for (const g of bossDesk(s)) for (const r of g.items) out.push(r.title, r.detail ?? '', r.ifNothing ?? '');
  return out.filter(Boolean);
}

describe('text integrity (deep-dive playthrough)', () => {
  it('no raw ids (capo:c21), "undefined" or NaN reach decisions, the inbox or the Desk over ten weeks', () => {
    for (const [seed, start] of [['leak-a', 'rise'], ['leak-b', 'olddon']] as const) {
      let s = newGameWith(seed, start);
      for (let w = 0; w < 10; w++) {
        for (const t of texts(s)) expect(RAW.test(t), `${seed} wk${s.week}: ${t}`).toBe(false);
        s = advanceWeek(s, { choices: {} }).state;
      }
    }
  }, 240_000);

  it('a woman who asks is "she", and the boss\'s own child never calls him "Boss"', () => {
    const s = newGameWith('leak-c', 'olddon');
    const kid = Object.values(s.characters).find((c) => c.alive && c.gender === 'F' && (c.fatherId === s.playerId || c.motherId === s.playerId));
    expect(kid).toBeTruthy();
    for (const d of ['askFavor', 'askLoan', 'partner', 'offerPiece'] as const) {
      const ev = buildAsk(s, { id: `k-${d}`, d, a: kid!.id, n: 500, w: s.week } as never)!;
      const all = [ev.text, ...ev.choices.flatMap((c) => [c.label, c.detail ?? ''])].join(' ');
      expect(all, d).not.toMatch(/\b(he|his|him|He|His|Him)\b/);
      expect(all, d).not.toMatch(/\bBoss\b/);
    }
  });
});
