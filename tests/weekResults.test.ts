import { describe, expect, it } from 'vitest';
import '../src/engine/engine';
import { advanceWeek } from '../src/engine/engine';
import { newGameWith } from '../src/engine/starts';
import { crew } from '../src/engine/characters';
import { targetsFor } from '../src/engine/dirtyWork';
import { weekResultCards } from '../src/ui/deeds/weekResults';
import type { PlayerAction } from '../src/engine/types';

describe('show what happens when you act (deep-dive top-10 #3)', () => {
  it('a dirty job comes back as a result card with the dice and a scene; a push with the ground it took', () => {
    const s = newGameWith('wr-1', 'rise');
    s.money = 50_000;
    const man = crew(s).find((c) => c.rank === 'soldier' || c.rank === 'associate')!;
    const job: PlayerAction = { kind: 'dirty', op: { job: 'hijack', who: man.id, target: targetsFor(s, 'hijack')[0]?.id } } as PlayerAction;
    const d = s.districts.find((x) => (x.influence.player ?? 0) < 80)!;
    const push: PlayerAction = { kind: 'pushDistrict', district: d.id };
    const r = advanceWeek(s, { actions: [job, push] });
    const cards = weekResultCards(s, r.state, [job, push]);
    const dirty = cards.find((c) => c.title.startsWith('Dirty work'));
    expect(dirty, 'the job has a card').toBeTruthy();
    expect(dirty!.chance).toBeGreaterThan(0);
    expect(dirty!.roll).toBeGreaterThanOrEqual(0);
    expect(dirty!.line.length).toBeGreaterThan(40);
    expect(dirty!.when).toMatch(/week/);
    // The roll agrees with the outcome: under the odds is a win.
    const won = dirty!.tier === 'success' || dirty!.tier === 'crit';
    expect(dirty!.roll! < Math.round(dirty!.chance! * 100) + 1).toBe(won);
    const p = cards.find((c) => c.title.startsWith('Push into'));
    expect(p, 'the push has a card').toBeTruthy();
    expect(p!.headline).toMatch(/%/);
  });
});
