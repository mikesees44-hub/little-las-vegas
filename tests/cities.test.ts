import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { CITY_LIST, CITIES_BY_ID, hasPermission } from '../src/engine/cities';
import { crew } from '../src/engine/characters';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { schemeOdds } from '../src/engine/schemes';
import type { GameState } from '../src/engine/types';

const REQUIRED = ['New York', 'Philadelphia', 'Atlantic City', 'Wildwood', 'Newark', 'Boston', 'Providence', 'Buffalo', 'Pittsburgh', 'Cleveland', 'Detroit', 'Chicago', 'Kansas City', 'New Orleans', 'Miami', 'Tampa', 'Las Vegas', 'Reno', 'Los Angeles', 'Hot Springs', 'Newport, KY', 'Baltimore', 'Washington', 'Havana'];
const FORBIDDEN = ['Corleone', 'Barzini', 'Tattaglia', 'Tessio', 'Stracci', 'Cuneo', 'Clemenza', 'Gambino', 'Genovese', 'Lucchese', 'Bonanno', 'Colombo', 'Luciano', 'Lansky', 'Trafficante', 'Marcello', 'Giancana', 'Accardo', 'Costello'];

describe('the city map', () => {
  it('has every required city with real coordinates and a fictional owner', () => {
    const names = CITY_LIST.map((c) => c.name);
    for (const n of REQUIRED) expect(names).toContain(n);
    for (const c of CITY_LIST) {
      expect(c.lat).toBeGreaterThan(20);
      expect(c.lat).toBeLessThan(50);
      expect(c.lon).toBeGreaterThan(-125);
      expect(c.lon).toBeLessThan(-65);
      expect(c.rackets.length).toBeGreaterThan(0);
      expect(c.flavor.length).toBeGreaterThan(10);
      for (const f of FORBIDDEN) expect(`${c.owner} ${c.boss}`).not.toContain(f);
    }
    expect(CITIES_BY_ID.wildwood.group).toBe('player');
    expect(CITIES_BY_ID.havana.group).toBe('exiles');
    expect(CITIES_BY_ID.wildwood.lat).toBeCloseTo(38.99, 1);
  });
  it('envoy odds account for difficulty, standing and sending family', () => {
    const s = newGame('odds');
    const soldier = crew(s).find((c) => c.rank === 'soldier')!;
    const hard = schemeOdds(s, 'envoy', undefined, [soldier.id], { depth: 'planned', city: 'baltimore' });
    const easy = schemeOdds(s, 'envoy', undefined, [soldier.id], { depth: 'planned', city: 'capemay' });
    expect(easy.chance).toBeGreaterThan(hard.chance);
    s.cityStanding.baltimore = 60;
    expect(schemeOdds(s, 'envoy', undefined, [soldier.id], { depth: 'planned', city: 'baltimore' }).chance).toBeGreaterThan(hard.chance);
    const self = schemeOdds(s, 'envoy', undefined, [s.playerId], { depth: 'planned', city: 'baltimore' });
    expect(self.reasons.some((r) => r.label.startsWith('You go yourself'))).toBe(true);
  });
});

describe('Philadelphia\'s permission', () => {
  it('South Jersey needs none; anywhere else, going without it costs family heat', () => {
    const s = newGame('permit');
    const soldier = crew(s).find((c) => c.rank === 'soldier')!;
    expect(previewAction(s, { kind: 'askPermission', city: 'capemay' }).disabledReason).toMatch(/No permission/);
    const p = previewAction(s, { kind: 'scheme', scheme: 'envoy', agents: [soldier.id], opts: { depth: 'planned', city: 'boston' } });
    expect(p.warning).toMatch(/Philadelphia/);
    expect(p.effects.some((e) => e.type === 'heat' && e.bar === 'family' && e.amount > 0)).toBe(true);
    const local = previewAction(s, { kind: 'scheme', scheme: 'envoy', agents: [soldier.id], opts: { depth: 'planned', city: 'capemay' } });
    expect(local.effects.some((e) => e.type === 'heat')).toBe(false);
  });
  it('asking can be granted, and then the envoy goes without the penalty', () => {
    let granted: GameState | undefined;
    for (let i = 0; i < 12 && !granted; i++) {
      const s = newGame(`ask${i}`);
      const r = advanceWeek(s, { actions: [{ kind: 'interact', id: 'gift_large', target: s.rivals.find((x) => x.id === 'philly')!.leaderId }, { kind: 'askPermission', city: 'baltimore' }] });
      if (hasPermission(r.state, 'baltimore')) granted = r.state;
    }
    expect(granted).toBeTruthy();
    const soldier = crew(granted!).find((c) => c.rank === 'soldier')!;
    const p = previewAction(granted!, { kind: 'scheme', scheme: 'envoy', agents: [soldier.id], opts: { depth: 'planned', city: 'baltimore' } });
    expect(p.warning).toBeUndefined();
  });
});

describe('envoy outcomes', () => {
  it('come back as a contact, partnership or franchise — or trouble', () => {
    const kinds = new Set<string>();
    let trouble = 0;
    for (let i = 0; i < 30; i++) {
      let s = newGame(`env${i}`);
      s.money = 50000;
      const a = crew(s).find((c) => c.rank === 'soldier')!;
      s = advanceWeek(s, { actions: [{ kind: 'scheme', scheme: 'envoy', agents: [a.id], opts: { depth: 'planned', city: i % 2 ? 'capemay' : 'ac' } }] }).state;
      for (let w = 0; w < 20 && s.schemes.some((x) => x.owner === 'player'); w++) s = advanceWeek(s, {}).state;
      const city = i % 2 ? 'capemay' : 'ac';
      const o = s.outposts.find((x) => x.city === city);
      if (o) kinds.add(o.kind);
      else if ((s.cityStanding[city] ?? 0) < 0) trouble++;
    }
    expect(kinds.size).toBeGreaterThanOrEqual(2);
    expect(trouble).toBeGreaterThan(0);
  });
});
