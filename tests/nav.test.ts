import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { alerts } from '../src/engine/alerts';
import { whatShouldIDo } from '../src/engine/opportunities';
import { PANELS } from '../src/ui/shell/panels';
import { HOME_IDS, LEGACY_TAB_ROUTE, type HomeId, type Route } from '../src/ui/shell/routes';
import { canonicalKey, HOMES, homeForKey, itemOf, NAV, NAV_ITEMS, NAV_ONLY, NAV_TREE, OLD_KEYS, REGISTRY_KEYS, resolveRoute } from '../src/ui/shell/nav';
import { doNow } from '../src/ui/shell/doNow';
import { shellAlerts } from '../src/ui/shell/alertRoutes';
import { Drawer } from '../src/ui/shell/Drawer';
import { playWeeks } from './helpers';
import { bossDesk } from '../src/engine/desk';
import { deskQueue } from '../src/engine/attention';

const configured = HOME_IDS.flatMap((h) => NAV[h].flatMap((g) => g.items.flatMap((it) => [...it.keys, ...(it.aliases ?? [])])));

describe('the menus: seven homes, every screen in exactly one', () => {
  it('there are seven homes with distinct letters, F-keys, labels and icons', () => {
    expect(HOMES.map((h) => h.id)).toEqual(HOME_IDS);
    expect(new Set(HOMES.map((h) => h.key)).size).toBe(7);
    expect(new Set(HOMES.map((h) => h.label)).size).toBe(7);
    expect(new Set(HOMES.map((h) => h.icon)).size).toBe(7);
    // The phone bar holds seven: short labels that fit a ~54px button at 390px.
    for (const h of HOMES) expect(h.short.length, h.short).toBeLessThanOrEqual(7);
    for (const [i, h] of HOMES.entries()) {
      expect(homeForKey(h.key)).toBe(h.id);
      expect(homeForKey(`F${i + 1}`)).toBe(h.id);
      expect(h.blurb.length).toBeGreaterThan(20);
    }
    // The old drawer letters still open something sensible, and never clash with a new one.
    for (const [k, h] of Object.entries(OLD_KEYS)) {
      expect(HOMES.some((x) => x.key === k), k).toBe(false);
      expect(homeForKey(k)).toBe(h);
    }
  });

  it('every registered section is placed in exactly one home (no orphans, no duplicates)', () => {
    for (const k of REGISTRY_KEYS) expect(configured.filter((x) => x === k).length, `${k} placed in nav.ts`).toBe(1);
    for (const k of REGISTRY_KEYS) expect(NAV_ITEMS.filter((it) => it.keys.includes(k) || it.aliases?.includes(k)).length, k).toBe(1);
    // ...and nav.ts names nothing that is not a screen.
    for (const k of configured) expect(REGISTRY_KEYS.includes(k) || (NAV_ONLY as readonly string[]).includes(k), `${k} exists`).toBe(true);
  });

  it('a duplicate screen is one place plus a link (the weekly envelope)', () => {
    expect(canonicalKey('borgata.take')).toBe('holdings.take');
    expect(itemOf('borgata.take')!.home).toBe('money');
    expect(resolveRoute({ panel: 'borgata', section: 'take' })).toEqual({ home: 'money', key: 'holdings.take' });
  });

  it('a duplicate is one place plus links: Who handles what, the standing orders, the audience, the books', async () => {
    const { wherePath } = await import('../src/ui/shell/nav');
    expect(wherePath('borgata.chain')).toBe('Crew › Council & standing orders › Who handles what');
    expect(wherePath('holdings.take')).toBe('Money › The money › The envelope');
    const { CHAIN_PATH } = await import('../src/ui/lieutenants/Lieutenants');
    const { ORDERS_PATH } = await import('../src/ui/planner/StandingOrders');
    expect(CHAIN_PATH).toBe(wherePath('borgata.chain'));
    expect(ORDERS_PATH).toBe(wherePath('borgata.orders'));
    const s = newGame('nav-dupes');
    // The modal is the same component as the place, and says where the place is.
    const { WhoHandlesWhat, ChainOfCommandPlace } = await import('../src/ui/lieutenants/Lieutenants');
    const modal = renderToString(createElement(WhoHandlesWhat, { s, update: () => {}, onClose: () => {} }));
    const place = renderToString(createElement(ChainOfCommandPlace, { s }));
    expect(modal).toContain('data-testid="lt-settings-place"');
    expect(modal).toContain(wherePath('borgata.chain')!.replace(/&/g, '&amp;'));
    const firstId = /data-testid="([^"]+)"/.exec(place)![1];
    expect(modal).toContain(`data-testid="${firstId}"`);
    // The book's Standing orders page links to the Family's pages.
    const { StandingOrders } = await import('../src/ui/planner/StandingOrders');
    const so = renderToString(createElement(StandingOrders, { s, act: () => {}, onOrder: () => {}, onPlace: () => {} }));
    expect(so).toContain('data-testid="so-place-chain"');
    expect(so).toContain('data-testid="so-place-orders"');
    // The books' per-week money lines are the ledger, not "the envelope".
    const books = readFileSync(join(__dirname, '../src/ui/books/TheBooks.tsx'), 'utf8');
    expect(books).toContain('title="Ledger by week"');
    expect(books).toContain('id="books-envelopes"');
  });

  it('every place has a name, an icon and a one-line subtitle; names are unique', () => {
    const labels = NAV_ITEMS.map((it) => it.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const it of NAV_ITEMS) {
      expect(it.icon.length, it.label).toBeGreaterThan(0);
      expect(it.sub.length, it.label).toBeGreaterThan(15);
      expect(it.sub.length, it.label).toBeLessThan(120);
    }
    for (const h of HOME_IDS) {
      const n = NAV_TREE[h].flatMap((g) => g.items).length;
      expect(n, h).toBeGreaterThan(0);
      expect(n, h).toBeLessThanOrEqual(8);
    }
    expect(NAV_ITEMS.length).toBeLessThanOrEqual(35);
  });

  it('the seven homes are the Desk, Family, Crew, Money, Law, Rivals, Town; every old home and letter still lands', () => {
    expect(HOMES.map((h) => [h.id, h.key])).toEqual([['desk', 'd'], ['house', 'f'], ['org', 'c'], ['money', 'b'], ['law', 'l'], ['rivals', 'r'], ['town', 't']]);
    // Old home ids keep their meaning: `family` was always the organisation (Crew); Your Life is Family; the Map is Town.
    const old: Record<string, string> = { week: 'desk', money: 'money', biz: 'money', family: 'org', town: 'town', you: 'house', life: 'house', map: 'town' };
    for (const [o, n] of Object.entries(old)) expect(resolveRoute({ home: o as HomeId }).home, o).toBe(n);
    for (const [k, h] of Object.entries({ w: 'desk', t: 'town', m: 'town', y: 'house', h: 'house', o: 'desk', c: 'org', $: 'money' })) expect(homeForKey(k), k).toBe(h);
    for (const k of ['w', 'r', 't', 'y', 'h', 'b', 'l', 'o', 'd', 'c', 'm', 'f']) expect(homeForKey(k), k).toBeDefined();
    expect(homeForKey('F7')).toBe('town');
    // Settings and help live in ☰; their nav entry is parked under the Desk.
    expect(resolveRoute('home:you/nav.settings')).toEqual({ home: 'desk', key: 'nav.settings' });
    expect(resolveRoute('home:life/nav.help')).toEqual({ home: 'desk', key: 'nav.help' });
    // The moves (§3.2): headquarters and guards to Law, the front boss to Rivals, how you rule to Family, the Store to Money.
    for (const [k, h] of Object.entries({ 'holdings.hq': 'law', 'borgata.protect': 'law', 'town.case': 'law', 'diplomacy.front': 'rivals', 'you.lifestyle': 'house', 'you.store': 'money', 'borgata.orders': 'org', 'town.cityhall': 'town', 'you.walk': 'town' })) expect(itemOf(k)!.home, k).toBe(h);
    expect(resolveRoute({ home: 'week' as HomeId, key: 'ops.plan' })).toEqual({ home: 'desk', key: 'ops.plan' });
  });

  it('every legacy tab id resolves to a home and a section in it', () => {
    for (const [tab, r] of Object.entries(LEGACY_TAB_ROUTE)) {
      const n = resolveRoute(tab);
      if (tab === 'map') { expect(n).toEqual({}); continue; }
      expect(n.home, tab).toBeDefined();
      if (r.section || r.key) {
        expect(n.key, tab).toBeDefined();
        expect(itemOf(n.key!)!.home, tab).toBe(n.home);
      }
    }
  });

  it('every registry route ({ panel, section } and "panel.section") resolves to where that section lives', () => {
    for (const p of PANELS) {
      for (const x of p.sections) {
        const key = `${p.id}.${x.id}`;
        const want = { home: itemOf(key)!.home, key: canonicalKey(key) };
        expect(resolveRoute({ panel: p.id, section: x.id }), key).toEqual(want);
        expect(resolveRoute(key), key).toEqual(want);
      }
      expect(resolveRoute({ panel: p.id }).home, p.id).toBeDefined();
      expect(resolveRoute(p.id).home, p.id).toBeDefined();
    }
    for (const h of HOME_IDS) expect(resolveRoute({ home: h })).toEqual({ home: h });
    expect(resolveRoute({ home: 'life' as HomeId, key: 'nav.settings' })).toEqual({ home: 'desk', key: 'nav.settings' });
    expect(resolveRoute('settings')).toEqual({ home: 'desk', key: 'nav.settings' });
    expect(resolveRoute('nonsense')).toEqual({});
  });

  it('every route string written in the game resolves (alerts, advice, briefing, buttons)', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
    walk(join(__dirname, '..', 'src'));
    const found = new Set<string>();
    for (const f of files) {
      if (/MapView|DesignerHub|walkData|housesPack|worldpack/.test(f)) continue; // their own local `go`/`tab`
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\btab: ?'([a-z.A-Z]+)'/g)) found.add(m[1]);
      for (const m of src.matchAll(/\b(?:goTab|shell\.go|ctx\.go|c\.go|onTab)\(['`]([a-z.A-Z]+)['`]\)/g)) found.add(m[1]);
      for (const m of src.matchAll(/\bgo\('([a-z.A-Z]+)'\)/g)) found.add(m[1]);
    }
    expect(found.size).toBeGreaterThan(15);
    for (const t of found) {
      if (t === 'map') continue;
      expect(resolveRoute(t).home, t).toBeDefined();
    }
  });

  it('the route objects the shell builds (In Motion, goals, alerts) land on real sections', () => {
    const files = ['inMotion.ts', 'goals.ts', 'alertRoutes.ts', 'doNow.ts'].map((f) => readFileSync(join(__dirname, '..', 'src', 'ui', 'shell', f), 'utf8'));
    let n = 0;
    for (const src of files) {
      for (const m of src.matchAll(/panel: '([a-z]+)', section: '([a-z]+)'/g)) {
        n++;
        const r: Route = { panel: m[1] as Route['panel'], section: m[2] };
        const got = resolveRoute(r);
        expect(got.key, `${m[1]}.${m[2]}`).toBe(canonicalKey(`${m[1]}.${m[2]}`));
        expect(got.key, `${m[1]}.${m[2]}`).toBeDefined();
      }
    }
    expect(n).toBeGreaterThan(20);
  });
});

describe('Do this now', () => {
  it('This Week puts the decisions on the desk first', () => {
    const s = playWeeks('nav-donow', 6);
    const sa = shellAlerts(s, alerts(s));
    const w = doNow(s, 'desk', { alerts: sa, opps: whatShouldIDo(s, 12), unanswered: 2, brief: 3 });
    expect(w[0].act.kind).toBe('decisions');
    expect(w[1].act.kind).toBe('sitdown');
    // The Desk itself: Needs you first, then Handled for you, then your orders, bills, what is coming.
    const order = ['needs', 'handled', 'order', 'bill', 'upcoming'];
    const g = bossDesk(s).map((x) => x.kind);
    expect([...g].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(g);
    if (deskQueue(s).needs.length) expect(g[0]).toBe('needs');
    for (const h of HOME_IDS) {
      const items = doNow(s, h, { alerts: sa, opps: whatShouldIDo(s, 12), unanswered: 0, brief: 0 });
      for (const d of items) {
        expect(d.title.length, h).toBeGreaterThan(3);
        if (d.act.kind === 'route') expect(resolveRoute(d.act.route).home, d.id).toBeDefined();
      }
    }
  });
  it('an empty council seat shows up under The Family', () => {
    const s = newGame('nav-seat');
    s.council.fixer = { ...s.council.fixer, holderId: undefined };
    const f = doNow(s, 'org', { alerts: [], opps: [], unanswered: 0, brief: 0 });
    expect(f.some((d) => d.id === 'seats')).toBe(true);
  });
});

describe('the drawer renders every home', () => {
  it('front page: what to do now, then every place with its line', () => {
    const s = playWeeks('nav-render', 4);
    const ctx = { onLaw: () => {}, onHeir: () => {}, go: () => {}, reports: [], openReports: () => {}, onHouseSel: () => {} };
    for (const h of HOME_IDS) {
      const html = renderToString(createElement(Drawer, { s, home: h, groups: NAV_TREE[h], ctx, onOpen: () => {}, onClose: () => {}, escEnabled: false, doNow: [], onDo: () => {}, extras: {} }));
      expect(html, h).toContain(`data-testid="drawer-${h}"`);
      // The Desk is the calm home screen: its "Do this now" shows only when there is something to do (STREAMLINE S14).
      if (h !== 'desk') expect(html, h).toContain('data-testid="do-now"');
      else expect(html, h).not.toContain('data-testid="do-now-empty"');
      for (const it of NAV_TREE[h].flatMap((g) => g.items)) expect(html, it.id).toContain(`data-testid="nav-item-${it.id}"`);
    }
  });
});

describe('the chain of command is a place', () => {
  it('borgata.chain is placed once, as a view of the council', () => {
    const items = NAV_ITEMS.filter((it) => it.keys.includes('borgata.chain'));
    expect(items.length).toBe(1);
    expect(items[0].keys[0]).toBe('borgata.council');
    expect(resolveRoute('borgata.chain').key).toBe('borgata.chain');
  });
});

describe('naming rules (STREAMLINE_2 §3.5)', () => {
  // Imperative verbs an action may start with: the hub's eight and the precise verbs under them.
  const VERB = /^(Talk|Pay|Order|Plan|Buy|Travel|Hurt|Protect|Adopt|Answer|Ask|Audit|Back|Befriend|Build|Call|Charter|Check|Choose|Climb|Cultivate|Dare|Deal|Decide|Dinner|Discipline|Disinherit|Do|Equip|Find|Fund|Give|Go|Handle|Have|Hear|Hire|Hit|Hold|Host|Hunt|Keep|Lay|Learn|Lend|Let|Lobby|Make|Manage|Move|Name|Offer|Open|Partner|Plant|Push|Put|Raise|Read|Retain|Run|See|Seat|Sell|Set|Shop|Sign|Spend|Spread|Start|Take|Upgrade|Use|Watch|Work|Arrange)\b/;
  it('every thing to do starts with an imperative verb; its old label is kept to be found', async () => {
    const { ACTION_ENTRIES } = await import('../src/ui/shell/actionEntries');
    for (const e of ACTION_ENTRIES) expect(e.label, e.label).toMatch(VERB);
    const { findAll } = await import('../src/ui/shell/find');
    const s = newGame('names-was');
    // "Dirty work: a one-off job" is "Do dirty work: …" now; the old words still find it.
    expect(findAll(s, 'molehunt').some((r) => r.kind === 'do' && /mole/i.test(r.title))).toBe(true);
  });

  it('places are nouns, never verbs; one name per thing', () => {
    for (const it of NAV_ITEMS) {
      expect(it.label, it.label).not.toMatch(VERB);
      for (const v of it.views ?? []) expect(v, `${it.label} › ${v}`).not.toMatch(/^(Hold|Walk|Plan|Pay|Talk)\b/);
    }
    const labels = PANELS.flatMap((p) => p.sections.map((x) => x.label));
    expect(labels).not.toContain('The Succession');
    expect(labels).not.toContain('Hold court');
    // "Ambitions" are the three CK goals only, not the house's big moves.
    expect(NAV_ITEMS.flatMap((it) => it.views ?? [])).not.toContain('Ambitions');
  });

  it('old names still find the renamed screens', async () => {
    const { findAll } = await import('../src/ui/shell/find');
    const s = newGame('names-old');
    for (const [q, key] of [['hold court', 'you.court'], ['walk the boardwalk', 'you.walk'], ['edicts', 'borgata.orders'], ['the succession', 'house.court']] as const) {
      expect(findAll(s, q, { limit: 50 }).some((r) => r.kind === 'screen' && r.go.to === 'route' && r.go.key === key), q).toBe(true);
    }
  });
});
