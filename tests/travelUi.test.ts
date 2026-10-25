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
    s = advanceWeek(s, { actions: [{ kind: 'travel', op: { type: 'trip', plan: { ...suggestPlan(s, s.playerId, 'oldcountry'), mode: 'ship' } } }] }).state;
    expect(renderToString(createElement(TravellersPanel, { s }))).toContain('Rome');
    let f = newGame('ui-lam2');
    f.money = 100000;
    f.legal = { stage: 'indicted', personId: f.playerId, defense: 0, since: f.week };
    player(f).evidence = 70;
    expect(renderToString(createElement(FleePlanner, { s: f, personId: f.playerId, onClose: () => {} }))).toContain('flee-quote');
    f = advanceWeek(f, { actions: [{ kind: 'travel', op: { type: 'flee', plan: { personId: f.playerId, dest: 'mexico', mode: 'plane' } } }] }).state;
    expect(renderToString(createElement(FugitivePanel, { s: f }))).toContain('fugitive-panel');
  });
});
