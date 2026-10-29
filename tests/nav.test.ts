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

describe('the menus: six homes, every screen in exactly one', () => {
  it('there are six homes with distinct letters, F-keys, labels and icons', () => {
    expect(HOMES.map((h) => h.id)).toEqual(HOME_IDS);
    expect(new Set(HOMES.map((h) => h.key)).size).toBe(6);
    expect(new Set(HOMES.map((h) => h.label)).size).toBe(6);
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
      expect(n, h).toBeLessThanOrEqual(9);
    }
    expect(NAV_ITEMS.length).toBeLessThanOrEqual(35);
  });

  it('the six homes are the Desk, the Family, Money & Business, the Map, Rivals & the Law, Your Life; every old home and letter still lands', () => {
    expect(HOMES.map((h) => [h.id, h.key])).toEqual([['desk', 'd'], ['org', 'f'], ['money', 'b'], ['map', 'm'], ['rivals', 'r'], ['life', 'l']]);
    const old: Record<string, string> = { week: 'desk', money: 'money', biz: 'money', family: 'org', town: 'map', you: 'life' };
    for (const [o, n] of Object.entries(old)) expect(resolveRoute({ home: o as HomeId }).home, o).toBe(n);
    for (const [k, h] of Object.entries({ w: 'desk', t: 'map', y: 'life', h: 'life', o: 'desk', c: 'desk', $: 'money' })) expect(homeForKey(k), k).toBe(h);
    for (const k of ['w', 'r', 't', 'y', 'h', 'b', 'l', 'o', 'd', 'c']) expect(homeForKey(k), k).toBeDefined();
    expect(resolveRoute('home:you/nav.settings')).toEqual({ home: 'life', key: 'nav.settings' });
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
    expect(resolveRoute({ home: 'life', key: 'nav.settings' })).toEqual({ home: 'life', key: 'nav.settings' });
    expect(resolveRoute('settings')).toEqual({ home: 'life', key: 'nav.settings' });
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
