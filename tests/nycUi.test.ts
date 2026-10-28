import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { capoPool, soldierPool } from '../src/engine/nyc';
import { NYC_DISTRICTS } from '../src/engine/nycData';
import { departFor } from '../src/engine/visit';
import { NycMapView } from '../src/ui/nyc/NycPanel';
import { CityScreen } from '../src/ui/travel/CityScreen';

describe('the New York map renders', () => {
  it('every neighborhood, the families\' colours and emblems, your crew, the attribution', () => {
    let s = newGame('nyc-ui');
    s.money = 100000;
    const capo = capoPool(s)[0];
    const men = soldierPool(s, capo.id).slice(0, 2).map((c) => c.id);
    s = advanceWeek(s, { actions: [{ kind: 'nyc', op: { op: 'crew', district: 'lowereast', capoId: capo.id, soldiers: men } }, { kind: 'nyc', op: { op: 'racket', district: 'lowereast', racket: 'numbers' } }] }).state;
    const html = renderToString(createElement(NycMapView, { s }));
    for (const d of NYC_DISTRICTS) expect(html, d.id).toContain(`data-testid="nyc-district-${d.id}"`);
    expect(html).toContain('data-owner="MARCHETTI"');
    expect(html).toContain('data-owner="YOURS"'); // the Lower East Side, with a crew and a racket
    expect(html).toContain('data-testid="nyc-legend"');
    expect(html).toMatch(/City Planning/);
    expect(html).toContain('data-testid="nyc-line-bridge"');
    expect(html).toContain('data-testid="nyc-line-tunnel"');
    expect(html).toContain('data-testid="nyc-families"');
    expect(html).toContain('Lower East Side');
  });

  it('the New York city screen has a Map tab; other cities do not', () => {
    let s = newGame('nyc-ui-city');
    s.money = 100000;
    const ny = departFor(s, { cityId: 'newyork', mode: 'cars', guards: [] });
    const html = renderToString(createElement(CityScreen, { s: ny, update: () => {}, onClose: () => {} }));
    expect(html).toContain('data-testid="city-tab-map"');
    expect(html).toContain('data-testid="city-tab-places"');
    s = departFor(s, { cityId: 'philadelphia', mode: 'cars', guards: [] });
    expect(renderToString(createElement(CityScreen, { s, update: () => {}, onClose: () => {} }))).not.toContain('city-tab-map');
  });
});
