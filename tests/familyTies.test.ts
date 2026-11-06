import { describe, expect, it } from 'vitest';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { newGame } from '../src/engine/newGame';
import { upgradeSave } from '../src/engine/upgradeSave';
import { addOpinion } from '../src/engine/relations';
import { allTies, famCards, mintMan, moveTieMult, sizeOf, stanceTo, tiesOf } from '../src/engine/familyWeb';
import { FAMILY_BY_ID, FAMILY_DEFS, FAM_KEYS } from '../src/engine/familyWebData';
import { NYC_FAMILIES } from '../src/engine/nycData';
import type { GameState, PlayerAction } from '../src/engine/types';

const run = (s: GameState, n: number, actions: PlayerAction[] = []): GameState => {
  for (let i = 0; i < n; i++) s = advanceWeek(s, { actions: i === 0 ? actions : [] }).state;
  return s;
};

describe('the families\' web', () => {
  it('every family, and your house, starts with at least one tie; the web is deterministic', () => {
    const s = newGame('ties-a');
    expect(s.families).toBeDefined();
    for (const f of [...FAM_KEYS, 'player' as const]) expect(tiesOf(s, f).length, `${f} has a tie`).toBeGreaterThan(0);
    expect(newGame('ties-a').families).toEqual(s.families);
    expect(tiesOf(s, 'player').some((t) => t.kind === 'sponsor' && t.a === 'philly')).toBe(true);
  });

  it('a fresh game is in final form: upgradeSave changes nothing; an old save gets the web once', () => {
    const s = newGame('ties-b');
    expect(upgradeSave(cloneState(s))).toEqual(s);
    const old = cloneState(s);
    delete old.families;
    expect(upgradeSave(old).families).toEqual(s.families);
  });

  it('rosters and sizes: Philadelphia\'s four outfits, Atlantic City, North Jersey, New York; all named people fictional', () => {
    const s = newGame('ties-c');
    for (const id of ['philly', 'westphilly', 'nephilly', 'northphilly', 'manno', 'newark']) expect(FAMILY_BY_ID[id].roster.length, id).toBeGreaterThanOrEqual(4);
    for (const id of Object.keys(NYC_FAMILIES)) {
      expect(FAMILY_BY_ID[id].roster.length).toBeGreaterThanOrEqual(3);
      expect(FAMILY_BY_ID[id].men).toBeGreaterThanOrEqual(150);
      expect(FAMILY_BY_ID[id].men).toBeLessThanOrEqual(350);
    }
    const real = /\b(Bruno|Testa|Scarfo|Gambino|Genovese|Lucchese|Bonanno|Profaci|Colombo|Luciano|Costello|Anastasia|Lansky|Siegel|Giancana|Accardo|Gotti|Castellano|Galante|Gigante|Pollina|Riccobene|Rugnetta)\b/;
    for (const d of FAMILY_DEFS) for (const m of d.roster) expect(m.name, `${d.id}: ${m.name}`).not.toMatch(real);
    for (const f of Object.values(NYC_FAMILIES)) expect(f.boss).not.toMatch(real);
    expect(FAMILY_BY_ID.westphilly.eth).toBe('Black');
    expect(FAMILY_BY_ID.nephilly.eth).toBe('Irish');
    expect(new Set(FAMILY_BY_ID.northphilly.roster.map((m) => m.eth ?? FAMILY_BY_ID.northphilly.eth)).size).toBeGreaterThanOrEqual(3);
    const cards = famCards(s);
    expect(cards.find((c) => c.id === 'corvino')!.size).toMatch(/~300 men/);
    expect(sizeOf(s, 'philly')).toBe(80);
  });

  it('ties shift stance: a friend of your friend warms to you, and rival moves read the ties', () => {
    const s = newGame('ties-d');
    const before = stanceTo(s, 'boston').value;
    const kessler = s.rivals.find((r) => r.id === 'kessler')!;
    addOpinion(s, kessler.leaderId, s.playerId, 'test', 80, 0);
    expect(stanceTo(s, 'boston').value).toBeGreaterThan(before);
    const manno = s.rivals.find((r) => r.id === 'manno')!;
    expect(moveTieMult(s, manno, 'kessler', 'strike')).toBeGreaterThan(1);
  });

  it('a named man is made a full character on demand, once, on his own dice', () => {
    const s = newGame('ties-e');
    const rng = s.rng;
    const a = mintMan(s, 'westphilly', 1)!;
    expect(a.ethnicity).toBe('Black');
    expect(s.rng).toBe(rng);
    expect(mintMan(s, 'westphilly', 1)!.id).toBe(a.id);
    expect(mintMan(s, 'philly', 0)).toBeUndefined();
  });

  it('the boss builds ties: orders show their odds', () => {
    const s = newGame('ties-f');
    s.money = 100000;
    const p = previewAction(s, { kind: 'fam', op: { op: 'envoy', fam: 'marchetti' } });
    expect(p.acceptance?.chance).toBeGreaterThan(0);
    expect(p.disabledReason).toBeUndefined();
    const fav = previewAction(s, { kind: 'fam', op: { op: 'favor', fam: 'westphilly' } });
    expect(fav.disabledReason).toBeUndefined();
    const t = run(s, 1, [{ kind: 'fam', op: { op: 'favor', fam: 'westphilly' } }]);
    expect(tiesOf(t, 'westphilly').some((x) => x.kind === 'debt' && (x.a === 'player' || x.b === 'player'))).toBe(true);
  }, 600000);

  it('the web moves over half a year: the families jockey, ask each other for help, and the books reconcile', () => {
    let s = newGame('ties-g');
    const t0 = JSON.stringify(allTies(s).map((t) => [t.kind, t.strength]));
    s = run(s, 26);
    const st = s.families!;
    expect(JSON.stringify(allTies(s).map((t) => [t.kind, t.strength]))).not.toBe(t0);
    expect(st.log.length).toBeGreaterThan(5);
    expect(FAM_KEYS.some((f) => sizeOf(s, f) !== FAMILY_BY_ID[f].men)).toBe(true);
    expect(s.lastReport).toBeDefined();
    for (const f of [...FAM_KEYS, 'player' as const]) expect(tiesOf(s, f).length, `${f} still tied`).toBeGreaterThan(0);
  }, 600000);
});
