import { describe, expect, it } from 'vitest';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { newGame } from '../src/engine/newGame';
import { upgradeSave } from '../src/engine/upgradeSave';
import { reconcile } from '../src/engine/ledger';
import { tiesOf } from '../src/engine/familyWeb';
import { FAMILY_BY_ID } from '../src/engine/familyWebData';
import { CITY_TIES } from '../src/engine/familyWebCitiesData';
import { CASINOS, pointOdds, pointsIn } from '../src/engine/vegas';
import type { GameState } from '../src/engine/types';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Connections } from '../src/ui/shell/sections/Connections';

/** Real casinos of the period (and later) and the real people around them: never by name. */
const REAL_CASINO = /\b(Sands|Flamingo|Desert Inn|Stardust|Riviera|Tropicana|Dunes|Sahara|Thunderbird|El Rancho|Hacienda|Frontier|Golden Nugget|Mint|Four Queens|Aladdin|Caesars|Circus Circus|Silver Slipper|Showboat|Horseshoe|Moulin Rouge|El Cortez|Castaways|Landmark|Fremont Hotel|Binion|Dalitz|Lansky|Siegel|Hoffa|Rosenthal|Spilotro|Giancana|Accardo|Sinatra)\b/;

const step = (s: GameState): GameState => {
  const r = advanceWeek(s, { actions: [] });
  expect(reconcile(r.report)).toEqual([]);
  return r.state;
};

describe('Las Vegas, an open city', () => {
  it('fictional casinos shared by Chicago, Cleveland, New York and the Partners; tied into the web; the pension money is rumor', () => {
    const s = newGame('lv-a');
    for (const c of CASINOS) expect(c.name).not.toMatch(REAL_CASINO);
    const holders = new Set(CASINOS.flatMap((c) => c.holders));
    for (const f of ['chicago', 'cleveland', 'marchetti', 'vegas'] as const) expect(holders.has(f), f).toBe(true);
    expect(FAMILY_BY_ID.vegas.blurb).toMatch(/open city/);
    expect(FAMILY_BY_ID.vegas.blurb).toMatch(/Nobody has ever proved it/);
    for (const m of FAMILY_BY_ID.vegas.roster) expect(m.name).not.toMatch(REAL_CASINO);
    for (const t of CITY_TIES) expect(t.story).not.toMatch(REAL_CASINO);
    const partners = tiesOf(s, 'vegas').map((t) => (t.a === 'vegas' ? t.b : t.a));
    for (const f of ['chicago', 'cleveland', 'marchetti', 'biscayne', 'havana']) expect(partners, f).toContain(f);
    expect(upgradeSave(cloneState(s))).toEqual(s);
    expect(s.families!.lv).toBeUndefined();
  });

  it('a point shows its odds; held, it pays every week out of the count and the books reconcile; sold, it stops', () => {
    let s = newGame('lv-b');
    s.money = 50000;
    const crown = CASINOS.find((c) => c.id === 'crown')!;
    const p = previewAction(s, { kind: 'fam', op: { op: 'lv', step: 'buy', casino: 'crown' } });
    expect(p.disabledReason).toBeUndefined();
    expect(p.acceptance!.chance).toBeGreaterThan(0);
    expect(p.acceptance!.chance).toBeLessThan(1);
    expect(pointOdds(s, crown).reasons.length).toBeGreaterThan(1);
    expect(p.detail).toMatch(/%/);
    expect(previewAction(s, { kind: 'fam', op: { op: 'lv', step: 'sell', casino: 'crown' } }).disabledReason).toBeDefined();
    // Hold one directly (the odds are tested above) and run two months.
    s.families!.lv = { pts: [{ c: 'crown', n: 1, since: s.week, tot: 0 }], tot: 0 };
    let paid = 0;
    for (let i = 0; i < 8; i++) {
      s = step(s);
      paid += s.lastReport!.lines.filter((l) => /Desert Crown/.test(l.label)).reduce((a, l) => a + l.amount, 0);
    }
    expect(paid).toBeGreaterThan(0);
    expect(s.families!.lv!.tot).toBe(paid);
    expect(pointsIn(s, 'crown')).toBe(1);
    const r = advanceWeek(s, { actions: [{ kind: 'fam', op: { op: 'lv', step: 'sell', casino: 'crown' } }] });
    expect(reconcile(r.report)).toEqual([]);
    expect(pointsIn(r.state, 'crown')).toBe(0);
    expect(JSON.stringify((r.state.journal?.e ?? []).filter((x) => x.w === s.week))).toMatch(/Desert Crown/);
  }, 600000);

  it('the desert comes calling now and then (light), and the Connections card shows the Strip', () => {
    let s = newGame('lv-c');
    s.families!.lv = { pts: [{ c: 'palms', n: 1, since: 0, tot: 0 }], tot: 0 };
    let saw = false;
    for (let i = 0; i < 40 && !saw; i++) {
      s = step(s);
      if ([...s.eventQueue, ...s.pendingEvents].some((e) => e.defId === 'fam_lv')) saw = true;
    }
    expect(saw).toBe(true);
    const html = renderToString(createElement(Connections, { s }));
    expect(html).toMatch(/data-testid="strip-panel"/);
    expect(html).toMatch(/Coronado Palms/);
  }, 600000);
});
