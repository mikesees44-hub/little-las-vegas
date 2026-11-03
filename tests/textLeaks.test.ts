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

describe('the Old Don\'s night (deep-dive bug 16)', () => {
  it('is not "Made the boss", and the recap keeps what he did at the Bolero and to the family', async () => {
    const { playSession } = await import('../src/engine/minigame');
    const s = newGameWith('od-recap', 'olddon');
    const ev = s.pendingEvents.find((e) => e.defId === 'made_boss')!;
    const ses = playSession(s, 'madeboss', ev.iid, { variant: String(ev.meta?.variant ?? 'olddon'), play: 1 }, {}, ['next', 'next', 'od_watch', 'next', 'w_respect']);
    expect(ses.done).toBe(true);
    expect(ses.outcome?.title).not.toBe('Made the boss');
    const log = ses.beats.map((b) => b.text).join(' ');
    expect(log).toMatch(/watched who didn't clap/);
    expect(log).toMatch(/Ten years of peace/);
    expect((ses.outcome?.effects ?? []).every((e) => !('label' in e) || (e as { label?: string }).label !== 'Made the boss')).toBe(true);
  });
});

describe('one envelope (deep-dive bug 19)', () => {
  it('once the count is taken, "The envelope is on your desk" goes; the answered count stays the one row', () => {
    let s = newGameWith('env-once', 'rise');
    for (let i = 0; i < 4 && !s.pendingEvents.some((e) => e.defId === 'tribute_audience'); i++) s = advanceWeek(s, { choices: {} }).state;
    const ev = s.pendingEvents.find((e) => e.defId === 'tribute_audience');
    expect(ev, 'a count reached the desk').toBeTruthy();
    if (!ev) return;
    expect(inbox(s).some((i) => i.key === 'envelope')).toBe(true);
    const answers = { [ev.iid]: ev.choices[0].id };
    expect(inbox(s, { answers }).some((i) => i.key === 'envelope')).toBe(false);
    const rows = bossDesk(s, { answers }).flatMap((g) => g.items).filter((r) => r.key === 'envelope' || r.key === `ev:${ev.iid}`);
    expect(rows.length).toBe(1);
  }, 120_000);
});
