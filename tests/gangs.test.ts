import { describe, expect, it } from 'vitest';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { newGame } from '../src/engine/newGame';
import { upgradeSave } from '../src/engine/upgradeSave';
import { reconcile } from '../src/engine/ledger';
import { gangOdds, gangsOf, type Gang } from '../src/engine/gangs';
import type { GameState } from '../src/engine/types';

const REAL_CLUBS = /\b(Hells? Angels|Pagans|Outlaws|Bandidos|Warlocks|Breed|Mongols|Vagos|Sons of Silence|Latin Kings|Black P\.? Stones|Vice Lords|K&A)\b/i;

const step = (s: GameState): GameState => {
  const r = advanceWeek(s, { actions: [] });
  expect(reconcile(r.report)).toEqual([]);
  return r.state;
};

const plant = (s: GameState, g: Partial<Gang> = {}): Gang => {
  s.gangs = s.gangs ?? { rng: 7, next: 1, list: [], log: [], cd: {} };
  const gang: Gang = { id: `g${s.gangs.next++}`, kind: 'irish', name: 'the Kerry Street Boys', leader: 'Jackie Furlong', district: 'docks', size: 12, since: s.week, status: 'trouble', why: 'a test', ...g };
  s.gangs.list.push(gang);
  return gang;
};

describe('gangs that crop up', () => {
  it('a fresh game has none and is final: upgradeSave changes nothing', () => {
    const s = newGame('gang-a');
    expect(s.gangs).toBeUndefined();
    expect(upgradeSave(cloneState(s))).toEqual(s);
  });

  it('they appear from conditions: a summer rally brings bikers, an empty district a street crew; fictional names; trouble reconciles', () => {
    let s = newGame('gang-b');
    // Open a district: nobody holds the Bay Docks.
    const d = s.districts.find((x) => x.id === 'docks')!;
    for (const k of Object.keys(d.influence)) if (k !== 'none') d.influence[k as 'player'] = 5;
    let sawBikers = false;
    let sawCrew = false;
    let sawEvent = false;
    for (let i = 0; i < 40; i++) {
      s = step(s);
      for (const g of gangsOf(s)) {
        expect(g.name).not.toMatch(REAL_CLUBS);
        if (g.kind === 'bikers') sawBikers = true; else sawCrew = true;
      }
      if ([...s.eventQueue, ...s.pendingEvents].some((e) => e.defId === 'gang_new' || e.defId === 'gang_trouble')) sawEvent = true;
    }
    expect(sawBikers || sawCrew).toBe(true);
    expect(sawEvent).toBe(true);
    expect(s.gangs!.log.length).toBeGreaterThan(0);
  }, 600000);

  it('every response shows its odds, and the result lands in Your File', () => {
    let s = newGame('gang-c');
    s.money = 50000;
    const g = plant(s);
    for (const how of ['fight', 'buy', 'recruit', 'partner'] as const) {
      const p = previewAction(s, { kind: 'fam', op: { op: 'gang', id: g.id, how } });
      expect(p.acceptance, how).toBeDefined();
      expect(p.acceptance!.chance).toBeGreaterThan(0);
      expect(p.acceptance!.chance).toBeLessThan(1);
      expect(p.detail).toMatch(/%/);
      expect(p.disabledReason, how).toBeUndefined();
      expect(gangOdds(s, g, how).reasons.length).toBeGreaterThan(1);
    }
    // Bigger crews are harder to fight; a rival's payroll makes buying harder.
    const big = { ...g, size: 60 };
    expect(gangOdds(s, big, 'fight').chance).toBeLessThan(gangOdds(s, g, 'fight').chance);
    expect(gangOdds(s, { ...g, patron: 'manno' }, 'buy').chance).toBeLessThan(gangOdds(s, g, 'buy').chance);
    const men = Object.values(s.characters).filter((c) => c.faction === 'player' && c.alive).length;
    const r = advanceWeek(s, { actions: [{ kind: 'fam', op: { op: 'gang', id: g.id, how: 'partner' } }] });
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
    expect(Object.values(s.characters).filter((c) => c.faction === 'player' && c.alive).length).toBe(men);
    const file = JSON.stringify(s.journal?.e.slice(-40) ?? []);
    expect(file).toMatch(/Kerry Street Boys/);
  }, 600000);

  it('event choices carry their odds in the label; partners pay; bikers ride home after Labor Day', () => {
    let s = newGame('gang-d');
    plant(s, { status: 'partner', kind: 'mixed', name: 'the Back Bay Rats' });
    plant(s, { kind: 'bikers', name: 'the Cape Highway Vultures MC', district: 'causeway', size: 30 });
    s = step(s);
    expect(s.lastReport!.lines.some((l) => /Back Bay Rats: your piece/.test(l.label))).toBe(true);
    const ev = [...s.eventQueue, ...s.pendingEvents].find((e) => e.defId.startsWith('gang_'));
    if (ev) for (const c of ev.choices.filter((x) => x.id !== 'ignore')) expect(c.label).toMatch(/\d+%/);
    for (let i = 0; i < 30 && s.date.m < 10; i++) s = step(s);
    expect(gangsOf(s).some((g) => g.kind === 'bikers' && g.name === 'the Cape Highway Vultures MC')).toBe(false);
  }, 600000);
});
