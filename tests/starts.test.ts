import { describe, expect, it } from 'vitest';
import { ageOn } from '../src/engine/calendar';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { newGameWith } from '../src/engine/starts';
import type { GameState } from '../src/engine/types';

function play(s: GameState, weeks: number) {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    const r = advanceWeek(s, {});
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
  }
  return s;
}

describe('starts', () => {
  it('the House of Sees: Don Salvatore "The Shark" Sees and his three heirs', () => {
    const s = newGameWith('sees1', 'sees');
    const boss = s.characters[s.playerId];
    expect(`${boss.firstName} ${boss.lastName}`).toBe('Salvatore Sees');
    expect(boss.nickname).toBe('The Shark');
    expect(s.houseName).toBe('Sees');
    const kids = boss.childrenIds.map((id) => s.characters[id]);
    expect(kids.map((k) => k.firstName)).toEqual(['Vito', 'Donato', 'Francesca']);
    expect(kids.every((k) => k.lastName === 'Sees' && k.dynasty && k.alive)).toBe(true);
    expect(kids[0].rank).toBe('underboss');
    expect(ageOn(boss.birth, s.date)).toBeGreaterThanOrEqual(59);
    expect(s.chronicle[0].text).toContain('Sees');
    play(s, 30);
  });

  it('Rise to Power: young, broke and small', () => {
    const s = newGameWith('rise1', 'rise');
    const boss = s.characters[s.playerId];
    expect(ageOn(boss.birth, s.date)).toBeLessThanOrEqual(30);
    expect(s.money).toBe(6000);
    expect(s.businesses.filter((b) => b.owner === 'player').length).toBeLessThanOrEqual(2);
    const men = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && !c.dynasty && c.rank !== 'civilian');
    expect(men.filter((m) => m.rank === 'capo').length).toBeLessThanOrEqual(1);
    for (const st of Object.values(s.council)) if (st.holderId) expect(s.characters[st.holderId].faction).toBe('player');
    play(s, 30);
  });

  it('starts leave the dynasty layer consistent (records for every member, none for the removed)', () => {
    for (const st of ['rise', 'sees'] as const) {
      const s = newGameWith(`dyn-${st}`, st);
      const d = s.dyn!;
      for (const id of Object.keys(d.people)) expect(s.characters[id]).toBeDefined();
      for (const c of Object.values(s.characters)) if (c.dynasty && c.alive && c.faction === 'player') expect(d.people[c.id]).toBeDefined();
      const boss = s.characters[s.playerId];
      for (const k of boss.childrenIds) expect(d.people[k].goal).toBeDefined();
    }
  });

  it('every start is deterministic from its seed', () => {
    for (const st of ['classic', 'rise', 'sees'] as const) {
      expect(JSON.stringify(newGameWith('det', st))).toBe(JSON.stringify(newGameWith('det', st)));
    }
  });
});
