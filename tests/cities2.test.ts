import { describe, expect, it } from 'vitest';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { upgradeSave } from '../src/engine/upgradeSave';
import { reconcile } from '../src/engine/ledger';
import { mintMan, sizeOf, tiesOf } from '../src/engine/familyWeb';
import { FAMILY_BY_ID, FAMILY_DEFS } from '../src/engine/familyWebData';
import { CITY_TIES } from '../src/engine/familyWebCitiesData';
import type { GameState } from '../src/engine/types';

/** Real people of the period (and later) who must never appear by name. */
const REAL = /\b(Giancana|Accardo|Ricca|Humphreys|Alderisio|Battaglia|Spilotro|Rosselli|Roselli|Marcello|Trafficante|Hoffa|Dalitz|Lansky|Siegel|Capone|Nitti|Lucchese|Gambino|Genovese|Bonanno|Profaci|Escobar|Ochoa|Lehder|Rodr[ií]guez Orejuela|Castro|Batista|Guevara|Kennedy|Maheu|Bistro|Bruno|Testa)\b/;

const run = (s: GameState, n: number, check?: (s: GameState) => void): GameState => {
  for (let i = 0; i < n; i++) {
    const r = advanceWeek(s, { actions: [] });
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
    check?.(s);
  }
  return s;
};

const NEW_FAMS = ['chicago', 'nola'] as const;

describe('the cities: Chicago, New Orleans, Florida, the Colombians', () => {
  it('the new families are in the web at the start: tied, compact, fictional, deterministic', () => {
    const s = newGame('c2-a');
    for (const f of NEW_FAMS) {
      const d = FAMILY_BY_ID[f];
      expect(d, f).toBeDefined();
      expect(tiesOf(s, f).length, `${f} tied`).toBeGreaterThan(0);
      expect(d.roster.length, `${f} leaders named`).toBeGreaterThanOrEqual(3);
      expect(d.roster.length, `${f} compact`).toBeLessThanOrEqual(14);
      expect(sizeOf(s, f)).toBe(d.men);
      for (const m of d.roster) expect(m.name, `${f}: ${m.name}`).not.toMatch(REAL);
      expect(d.blurb).not.toMatch(REAL);
    }
    expect(FAMILY_BY_ID.chicago.men).toBeGreaterThanOrEqual(250);
    expect(FAMILY_BY_ID.chicago.group).toBe('chi');
    for (const t of CITY_TIES) expect(t.story).not.toMatch(REAL);
    expect(newGame('c2-a').families).toEqual(s.families);
    // Nobody is a character until met.
    const before = Object.keys(s.characters).length;
    expect(mintMan(s, 'chicago', 1)).toBeDefined();
    expect(Object.keys(s.characters).length).toBe(before + 1);
  });

  it('save rule: a fresh game is final; a web from before the cities gets their ties once', () => {
    const s = newGame('c2-b');
    expect(upgradeSave(cloneState(s))).toEqual(s);
    const old = cloneState(s);
    const st = old.families!;
    const n = CITY_TIES.length;
    st.ties = st.ties.slice(0, st.ties.length - n);
    delete st.c2;
    for (const d of FAMILY_DEFS) if (d.group === 'chi' || d.group === 'nola' || d.group === 'fla') delete st.size[d.id];
    const up = upgradeSave(old);
    expect(up.families!.ties.length).toBe(s.families!.ties.length);
    expect(up.families!.c2).toBe(n);
    expect(upgradeSave(cloneState(up))).toEqual(up);
  });

  it('a year of the web with the cities: they come calling, the families jockey, the books reconcile, the save stays small', () => {
    let s = newGame('c2-c');
    const seen = new Set<string>();
    s = run(s, 52, (x) => {
      for (const e of [...x.eventQueue, ...x.pendingEvents]) seen.add(e.defId);
    });
    expect(seen.has('fam_chi') || seen.has('fam_nola')).toBe(true);
    const log = s.families!.log.map((l) => l.t).join(' ');
    expect(log.length).toBeGreaterThan(0);
    const size = JSON.stringify(s).length;
    expect(size).toBeLessThan(3.7 * 1024 * 1024);
    console.log(`save after a year: ${(size / 1024 / 1024).toFixed(2)} MB`);
  }, 600000);
});
