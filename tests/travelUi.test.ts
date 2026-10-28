import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { player } from '../src/engine/characters';
import { TripPlanner } from '../src/ui/travel/TripPlanner';
import { FleePlanner } from '../src/ui/travel/FleePlanner';
import { FugitivePanel, TravellersPanel } from '../src/ui/travel/Panels';
import { suggestPlan } from '../src/engine/travel';
import { GoThere } from '../src/ui/travel/GoThere';
import { CityScreen, VisitPill } from '../src/ui/travel/CityScreen';
import { TravelContext } from '../src/ui/travel/context';
import { bookVisit, departFor, nextSlot } from '../src/engine/visit';
import { tickDay } from '../src/engine/days';
import { currentVisit } from '../src/engine/travelState';

describe('travel UI', () => {
  it('the trip planner shows the quote, the itinerary and the risks', () => {
    const s = newGame('ui-travel');
    s.money = 100000;
    const html = renderToString(createElement(TripPlanner, { s, leaderId: s.playerId, destId: 'miamibeach', onClose: () => {} }));
    expect(html).toContain('data-testid="trip-quote"');
    expect(html).toContain('data-testid="itinerary"');
    expect(html).toContain('Miami Beach');
  });
  it('travellers, the flight planner and the fugitive panel render', () => {
    let s = newGame('ui-lam');
    s.money = 100000;
    s = advanceWeek(s, { actions: [{ kind: 'travel', op: { type: 'trip', plan: { ...suggestPlan(s, s.playerId, 'oldcountry'), mode: 'ship' } }, fund: 'family' }] }).state; // pocket short: Family money approved (A13)
    expect(renderToString(createElement(TravellersPanel, { s }))).toContain('Rome');
    let f = newGame('ui-lam2');
    f.money = 100000;
    f.legal = { stage: 'indicted', personId: f.playerId, defense: 0, since: f.week };
    player(f).evidence = 70;
    expect(renderToString(createElement(FleePlanner, { s: f, personId: f.playerId, onClose: () => {} }))).toContain('flee-quote');
    f = advanceWeek(f, { actions: [{ kind: 'travel', op: { type: 'flee', plan: { personId: f.playerId, dest: 'mexico', mode: 'plane' } } }] }).state;
    expect(renderToString(createElement(FugitivePanel, { s: f }))).toContain('fugitive-panel');
  });
  it('going there yourself: the departure card, the city screen with its places and verbs, the pill', () => {
    const s = newGame('ui-visit');
    s.money = 100000;
    const card = renderToString(createElement(GoThere, { s, cityId: 'ac', update: () => {}, onClose: () => {}, onArrive: () => {} }));
    expect(card).toContain('data-testid="go-there"');
    expect(card).toContain('Atlantic City');
    expect(card).toContain('pulled over');
    let v = departFor(s, { cityId: 'philadelphia', mode: 'cars', guards: [] });
    const road = renderToString(createElement(CityScreen, { s: v, update: () => {}, onClose: () => {} }));
    expect(road).toContain('on the road to Philly');
    v = tickDay(v);
    const at = nextSlot(v, currentVisit(v)!, 'sitdown')!;
    v = bookVisit(v, { placeId: 'ph-ninth', verb: 'sitdown', ...at });
    const html = renderToString(createElement(CityScreen, { s: v, update: () => {}, onClose: () => {} }));
    expect(html).toContain('You&#x27;re in Philly');
    expect(html).toContain('The Latin Casino');
    expect(html).toContain('data-testid="city-verb-ph-latin-night"');
    expect(html).toContain('data-testid="city-agenda-item"');
    expect(html).toContain('data-testid="city-come-home"');
    expect(renderToString(createElement(VisitPill, { s: v, onOpen: () => {} }))).toContain('visit-pill');
    const panel = renderToString(createElement(TravelContext.Provider, { value: { plan: () => {}, flee: () => {}, go: () => {}, city: () => {} } }, createElement(TravellersPanel, { s: v })));
    expect(panel).toContain('data-testid="visit-row"');
    expect(renderToString(createElement(TravelContext.Provider, { value: { plan: () => {}, flee: () => {}, go: () => {} } }, createElement(TravellersPanel, { s })))).toContain('go-somewhere');
  });
});
