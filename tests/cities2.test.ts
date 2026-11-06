import { describe, expect, it } from 'vitest';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { upgradeSave } from '../src/engine/upgradeSave';
import { reconcile } from '../src/engine/ledger';
import { mintMan, sizeOf, tiesOf } from '../src/engine/familyWeb';
import { FAMILY_BY_ID, FAMILY_DEFS } from '../src/engine/familyWebData';
import { CITY_TIES } from '../src/engine/familyWebCitiesData';
import { previewAction } from '../src/engine/actions';
import { market, maxLevel, OLD_SCHOOL } from '../src/engine/colombia';
import { stanceTo } from '../src/engine/familyWeb';
import type { GameState } from '../src/engine/types';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Connections } from '../src/ui/shell/sections/Connections';

/** Real people of the period (and later) who must never appear by name. */
const REAL = /\b(Giancana|Accardo|Ricca|Humphreys|Alderisio|Battaglia|Spilotro|Rosselli|Roselli|Marcello|Trafficante|Hoffa|Dalitz|Lansky|Siegel|Capone|Nitti|Lucchese|Gambino|Genovese|Bonanno|Profaci|Escobar|Ochoa|Lehder|Rodr[ií]guez Orejuela|Castro|Batista|Guevara|Kennedy|Maheu|Bruno|Testa)\b/;
/** The period's real gangsters (stories may name Castro as history, never a real gangster). */
const REAL_MOB = /\b(Giancana|Accardo|Ricca|Humphreys|Alderisio|Battaglia|Spilotro|Rosselli|Roselli|Marcello|Trafficante|Hoffa|Dalitz|Lansky|Siegel|Capone|Nitti|Lucchese|Gambino|Genovese|Bonanno|Profaci|Escobar|Ochoa|Lehder|Maheu)\b/;

const run = (s: GameState, n: number, check?: (s: GameState) => void): GameState => {
  for (let i = 0; i < n; i++) {
    const r = advanceWeek(s, { actions: [] });
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
    check?.(s);
  }
  return s;
};

const NEW_FAMS = ['chicago', 'nola', 'tampa', 'biscayne', 'havana', 'colombians'] as const;

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
      expect(d.blurb).not.toMatch(REAL_MOB);
    }
    expect(FAMILY_BY_ID.chicago.men).toBeGreaterThanOrEqual(250);
    expect(FAMILY_BY_ID.chicago.group).toBe('chi');
    for (const t of CITY_TIES) expect(t.story).not.toMatch(REAL_MOB);
    expect(FAMILY_BY_ID.nola.blurb).toMatch(/oldest/);
    expect(tiesOf(s, 'nola').some((t) => t.a === 'tampa' || t.b === 'tampa')).toBe(true);
    expect(tiesOf(s, 'nola').some((t) => t.a === 'havana' || t.b === 'havana')).toBe(true);
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
    expect(['fam_chi', 'fam_nola', 'fam_fla'].filter((d) => seen.has(d)).length).toBeGreaterThanOrEqual(2);
    const log = s.families!.log.map((l) => l.t).join(' ');
    expect(log.length).toBeGreaterThan(0);
    const size = JSON.stringify(s).length;
    expect(size).toBeLessThan(3.7 * 1024 * 1024);
    console.log(`save after a year: ${(size / 1024 / 1024).toFixed(2)} MB`);
  }, 600000);

  it('the Colombia connection: a 1960 trickle that grows; touching it pays, draws federal heat and the old families\' disapproval; never instructional', () => {
    expect(market(1960)).toBe(1);
    expect(market(1975)).toBeGreaterThan(market(1966));
    expect(maxLevel(1960)).toBe(1);
    expect(maxLevel(1970)).toBe(3);
    let s = newGame('c2-col');
    s.money = 100000;
    const p = previewAction(s, { kind: 'fam', op: { op: 'coke', step: 'in' } });
    expect(p.acceptance!.chance).toBeGreaterThan(0);
    expect(p.warning).toMatch(/forbid/);
    expect(p.disabledReason).toBeUndefined();
    expect(previewAction(s, { kind: 'fam', op: { op: 'coke', step: 'more' } }).disabledReason).toBeDefined();
    const text = JSON.stringify([p.title, p.detail, p.warning]);
    expect(text).not.toMatch(/\b(kilo|gram|pound|route|plane|boat|stash|cut it|process|lab)\b/i);
    // Put him in it directly (the odds are tested above) and run three months.
    const views0 = OLD_SCHOOL.map((f) => stanceTo(s, f).base);
    s.families!.col = { lvl: 1, since: s.week, tot: 0 };
    const fed0 = s.heat.federal;
    let fedAdded = 0;
    for (let i = 0; i < 13; i++) {
      // The cities' offers left unanswered resolve on their defaults (a gift to New Orleans...): clear them, so only the racket moves the views.
      s.eventQueue = []; s.pendingEvents = [];
      const r = advanceWeek(s, { actions: [] });
      expect(reconcile(r.report)).toEqual([]);
      fedAdded += r.report.lines.filter((l) => l.stat === 'heat.federal' && /narcotics/.test(l.label)).reduce((a, l) => a + l.amount, 0);
      s = r.state;
    }
    expect(fedAdded).toBeGreaterThan(5);
    expect(s.families!.col!.tot).toBeGreaterThan(0);
    const views1 = OLD_SCHOOL.map((f) => stanceTo(s, f).base);
    expect(views1.filter((v, i) => v < views0[i]).length).toBeGreaterThanOrEqual(3);
    void fed0;
  }, 600000);

  it('the Connections view shows Chicago, New Orleans, Florida and the gangs (where they are, what they want), and the import racket', () => {
    const s = newGame('c2-ui');
    s.gangs = { rng: 1, next: 2, list: [{ id: 'g1', kind: 'bikers', name: 'the Tuckahoe Road Saints MC', leader: 'Buck "Gravel" Loomis', district: 'causeway', size: 25, since: s.week, status: 'trouble', why: 'a summer motorcycle rally on the Shore' }], log: [], cd: {} };
    const html = renderToString(createElement(Connections, { s }));
    for (const id of ['fam-group-chi', 'fam-group-nola', 'fam-group-fla', 'fam-group-gangs', 'fam-card-chicago', 'fam-card-nola', 'fam-card-tampa', 'fam-card-biscayne', 'fam-card-havana', 'fam-card-colombians', 'coke-panel', 'gang-card-g1', 'gang-where-g1', 'gang-want-g1']) expect(html, id).toContain(`data-testid="${id}"`);
    expect(html).toContain('Rio Grande Causeway');
    expect(html).toMatch(/Chicago Outfit/);
  });
});
