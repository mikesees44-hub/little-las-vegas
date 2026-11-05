import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { playWeeks } from './helpers';
import { bossDesk } from '../src/engine/desk';
import { recommendations } from '../src/engine/planner/brief';
import { HOME_IDS } from '../src/ui/shell/routes';
import { HOMES_BY_ID, NAV_TREE } from '../src/ui/shell/nav';
import { Drawer } from '../src/ui/shell/Drawer';
import { DOMAIN_HOME, DOMAIN_HOMES, homeDomains, homeOfDeskItem } from '../src/ui/shell/homeDomain';
import { actionsFor, entryHomes, homeOfRec, needsFor, peopleFor, recsFor } from '../src/ui/shell/placeFront';
import { ACTION_ENTRIES } from '../src/ui/shell/actionEntries';
import { DOMAIN_IDS } from '../src/ui/domain';
import { DOM_LABEL } from '../src/ui/desk/BossDesk';

const s = playWeeks('place-front', 6);
const ctx = { onLaw: () => {}, onHeir: () => {}, go: () => {}, reports: [], openReports: () => {}, onHouseSel: () => {} };

describe('one front page for every home (STREAMLINE_2 §3.3)', () => {
  it('every domain lives in exactly one domain home, and every domain home has one', () => {
    for (const d of DOMAIN_IDS) expect(DOMAIN_HOMES, d).toContain(DOMAIN_HOME[d]);
    for (const h of DOMAIN_HOMES) expect(homeDomains(h).length, h).toBeGreaterThan(0);
    expect(homeDomains('desk').length).toBe(DOMAIN_IDS.length);
    // The Desk's chips say the homes' own names.
    for (const h of DOMAIN_HOMES) expect(DOM_LABEL[h]).toBe(HOMES_BY_ID[h].label);
  });

  it('every home renders its bands, in order, with every place still there', () => {
    for (const h of HOME_IDS) {
      const html = renderToString(createElement(Drawer, { s, home: h, groups: NAV_TREE[h], ctx, onOpen: () => {}, onClose: () => {}, escEnabled: false, doNow: [], onDo: () => {}, extras: {}, front: {} }));
      expect(html, h).toContain(`data-testid="drawer-${h}"`);
      if (h !== 'desk') expect(html, h).toContain('data-testid="do-now"');
      expect(html, h).toContain('data-testid="front-actions"');
      expect(html, h).toContain('data-testid="front-records"');
      for (const it of NAV_TREE[h].flatMap((g) => g.items)) expect(html, it.id).toContain(`data-testid="nav-item-${it.id}"`);
      // The order: Recommended, Needs you here, Your people, Do something, the places.
      const at = (id: string) => html.indexOf(`data-testid="${id}"`);
      const order = ['front-recs', 'do-now', 'front-people', 'front-actions', 'front-records'].map(at).filter((i) => i >= 0);
      expect([...order].sort((a, b) => a - b), h).toEqual(order);
    }
  });

  it('recommendations are at most three and in the home\'s domain', () => {
    for (const h of HOME_IDS) {
      const r = recsFor(s, h);
      expect(r.length, h).toBeLessThanOrEqual(3);
      if (h !== 'desk') for (const x of r) expect(homeOfRec(s, x), `${h}: ${x.title}`).toBe(h);
    }
    expect(DOMAIN_HOMES.reduce((a, h) => a + recsFor(s, h).length, 0)).toBeGreaterThan(0);
    // The Desk keeps the consigliere's own three, unchanged.
    expect(recsFor(s, 'desk').map((x) => x.id)).toEqual(recommendations(s).map((x) => x.id));
    // The filter only ever narrows: every home's pick is a real candidate of the wide pool.
    const pool = new Set(recommendations(s, {}, undefined, { keep: () => true, n: 99 }).map((x) => x.id));
    for (const h of DOMAIN_HOMES) for (const x of recsFor(s, h)) expect(pool.has(x.id)).toBe(true);
  });

  it('every Desk item appears in exactly one domain home\'s Needs you (plus the Desk)', () => {
    let tried = 0;
    for (const seed of ['place-front', 'place-front-2']) {
      const x = seed === 'place-front' ? s : playWeeks(seed, 10);
      const needs = bossDesk(x).find((g) => g.kind === 'needs')?.items ?? [];
      const desk = needsFor(x, 'desk').map((it) => it.key);
      expect([...desk].sort()).toEqual(needs.map((it) => it.key).sort());
      for (const it of needs) {
        tried++;
        const homes = DOMAIN_HOMES.filter((h) => needsFor(x, h).some((n) => n.key === it.key));
        expect(homes, it.title).toEqual([homeOfDeskItem(x, it)]);
      }
    }
    // A made-up paper of each telling kind lands where it should.
    expect(homeOfDeskItem(s, { kind: 'envelope', title: 'The envelope', detail: '', ref: {} })).toBe('money');
    expect(homeOfDeskItem(s, { kind: 'lawyer', title: 'Your lawyer', detail: '', ref: {} })).toBe('law');
    expect(homeOfDeskItem(s, { kind: 'request', title: 'A woman came to see you', detail: '', ref: { single: 'come' } })).toBe('house');
    expect(tried).toBeGreaterThan(0);
  });

  it('your people here: at most six, of the right kind', () => {
    for (const h of HOME_IDS) {
      const p = peopleFor(s, h, 6);
      expect(p.shown.length, h).toBeLessThanOrEqual(6);
      expect(p.total, h).toBeGreaterThanOrEqual(p.shown.length);
      for (const x of p.shown) expect(s.characters[x.id].alive, x.name).toBe(true);
    }
    expect(peopleFor(s, 'desk').shown).toEqual([]);
    expect(peopleFor(s, 'org').shown.length).toBeGreaterThan(0);
    expect(peopleFor(s, 'rivals').shown.every((x) => s.characters[x.id].faction !== 'player')).toBe(true);
  });

  it('do something here: every thing to do is in at least one home, and every home\'s list is real', () => {
    const seen = new Set<number>();
    for (const h of HOME_IDS) for (const g of actionsFor(h, s)) for (const i of g.entries) { seen.add(i); expect(entryHomes(s, i), ACTION_ENTRIES[i].label).toContain(h); }
    expect(seen.size).toBe(ACTION_ENTRIES.length);
    for (const h of DOMAIN_HOMES) expect(actionsFor(h, s).length, h).toBeGreaterThan(0);
  });
});
