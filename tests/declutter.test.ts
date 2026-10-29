import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_ENTRIES } from '../src/ui/shell/actionEntries';
import { HOME_IDS, LEGACY_TAB_ROUTE } from '../src/ui/shell/routes';
import { itemOf, NAV_ITEMS, NAV_ONLY, NAV_TREE, REGISTRY_KEYS, resolveRoute } from '../src/ui/shell/nav';

/**
 * The declutter guard (TAB_AUDIT.md): screens and buttons were combined, but
 * nothing the boss could do went missing. Every PlayerAction kind, and every
 * op of the kinds that have them, has an entry point in the UI registry
 * (ui/shell/actionEntries.ts) whose source really builds it; every screen
 * lives in exactly one home; every old route still lands somewhere.
 */

const SRC = join(__dirname, '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** The text of `export type <name> = …;` in an engine file (balanced braces). */
function typeBlock(file: string, name: string): string {
  const src = read(`engine/${file}`);
  const i = src.indexOf(`export type ${name} =`);
  if (i < 0) throw new Error(`${name} not found in ${file}`);
  let d = 0;
  let j = i + name.length + 13;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{' || c === '(') d++;
    else if (c === '}' || c === ')') d--;
    else if (c === ';' && d === 0) break;
  }
  return src.slice(i, j);
}

/** The engine file that declares `export type <name> =`. */
function fileOfType(name: string): string | undefined {
  return readdirSync(join(SRC, 'engine')).find((f) => f.endsWith('.ts') && read(`engine/${f}`).includes(`export type ${name} =`));
}

/** The discriminant values of a union's members (`| { type: 'x'; … }`), following member aliases (`| LuxAction`). */
function opsOf(file: string, name: string, disc: string): string[] {
  const lines = typeBlock(file, name).split('\n');
  const re = new RegExp(`\\{\\s*${disc}: '(\\w+)'`, 'g');
  const out = lines.flatMap((l) => [...l.matchAll(re)].map((m) => m[1]));
  for (const l of lines) {
    const alias = /^\s*\|\s*([A-Z]\w+)\s*$/.exec(l)?.[1];
    const f = alias ? fileOfType(alias) : undefined;
    if (alias && f) out.push(...opsOf(f, alias, disc));
  }
  return [...new Set(out)];
}

const PLAYER_ACTION_KINDS = [...typeBlock('types.ts', 'PlayerAction').matchAll(/\{ kind: '(\w+)'/g)].map((m) => m[1]);

/** The kinds whose orders are a union of ops, and where that union lives. */
const OP_UNIONS: Record<string, [file: string, type: string, disc: string, exclude?: string[]]> = {
  econ: ['econState.ts', 'EconAction', 'type'],
  pol: ['polState.ts', 'PolAction', 'op'],
  travel: ['travelState.ts', 'TravelAction', 'type'],
  bones: ['bonesState.ts', 'BonesAction', 'op'],
  tribute: ['tributeOps.ts', 'TributeAction', 'op'],
  ears: ['earsState.ts', 'EarsAction', 'op'],
  // LedgerAction = LedgerOp without the private note.
  ledger: ['ledgerbookState.ts', 'LedgerOp', 'op', ['note']],
  dev: ['develop.ts', 'DevAction', 't'],
  dating: ['dating.ts', 'DatingAction', 'op'],
  nightlife: ['nightlife.ts', 'NightAction', 'op'],
  bond: ['bonds.ts', 'BondAction', 'op'],
  mymen: ['myMen.ts', 'MenAction', 'op'],
  dynasty: ['familyState.ts', 'DynAction', 'type'],
  power: ['powerState.ts', 'PowerAction', 'op'],
  living: ['livingAsk.ts', 'LivingAction', 'op'],
  talk: ['talks.ts', 'TalkOp', 't'],
  hood: ['hood.ts', 'HoodAction', 'type'],
  spend: ['spendState.ts', 'SpendAction', 'op'],
  nyc: ['nyc.ts', 'NycAction', 'op'],
  paper: ['paper.ts', 'PaperAction', 'op'],
  work: ['bizRacket.ts', 'WorkAction', 'op'],
  intrigue: ['intrigueState.ts', 'IntrigueAction', 'op'],
  army: ['armyState.ts', 'ArmyAction', 'op'],
  protect: ['protect.ts', 'ProtectAction', 'op'],
  women: ['women.ts', 'WomenAction', 'op'],
  honey: ['honey.ts', 'HoneyAction', 'op'],
};

const SPECIAL_AT = new Set(['person', 'place', 'map', 'office', 'event']);

describe('declutter: every order is still reachable', () => {
  it('reads the engine: 50+ kinds of order, the op unions parse', () => {
    expect(PLAYER_ACTION_KINDS.length).toBeGreaterThan(45);
    expect(PLAYER_ACTION_KINDS).toContain('dating');
    for (const [k, [f, t, d, ex]] of Object.entries(OP_UNIONS)) {
      const ops = opsOf(f, t, d).filter((o) => !ex?.includes(o));
      expect(ops.length, k).toBeGreaterThan(0);
    }
  });

  it('every PlayerAction kind has at least one entry point', () => {
    for (const k of PLAYER_ACTION_KINDS) expect(ACTION_ENTRIES.some((e) => e.kind === k), `${k} has no entry in actionEntries.ts`).toBe(true);
    for (const e of ACTION_ENTRIES) expect(PLAYER_ACTION_KINDS, e.label).toContain(e.kind);
  });

  it('every op of every kind with ops has an entry point', () => {
    for (const [k, [f, t, d, ex]] of Object.entries(OP_UNIONS)) {
      const covered = new Set(ACTION_ENTRIES.filter((e) => e.kind === k).flatMap((e) => e.ops ?? []));
      for (const op of opsOf(f, t, d).filter((o) => !ex?.includes(o))) expect(covered.has(op), `${k}.${op} has no entry`).toBe(true);
      // ...and the registry names no op the engine does not have.
      for (const op of covered) expect(opsOf(f, t, d), `${k}.${op}`).toContain(op);
    }
  });

  it('each entry is really wired: its sources exist and build that order', () => {
    for (const e of ACTION_ENTRIES) {
      const srcs = e.files.map((f) => {
        expect(existsSync(join(SRC, f)), `${e.label}: ${f}`).toBe(true);
        return read(f);
      });
      if (e.proof) { expect(srcs.some((x) => x.includes(e.proof!)), `${e.label}: ${e.proof}`).toBe(true); continue; }
      if (!e.ops) {
        expect(srcs.some((x) => new RegExp(`kind: ?'${e.kind}'`).test(x)), `${e.label}: kind '${e.kind}' built in ${e.files.join(', ')}`).toBe(true);
        continue;
      }
      const disc = OP_UNIONS[e.kind]?.[2];
      for (const op of e.ops) {
        const re = new RegExp(`(${disc}: ?'${op}'|'${op}'[^\\n]*as const|\\['[^\\]]*'${op}')`);
        expect(srcs.some((x) => re.test(x)), `${e.kind}.${op} built in ${e.files.join(', ')}`).toBe(true);
      }
    }
  });

  it('each entry points at a real place: a screen that resolves, or a person, a place, the map, the office', () => {
    for (const e of ACTION_ENTRIES) {
      expect(e.at.length, e.label).toBeGreaterThan(0);
      expect(e.label.length, e.label).toBeGreaterThan(5);
      for (const at of e.at) {
        if (SPECIAL_AT.has(at)) continue;
        const r = resolveRoute(at);
        expect(r.home, `${e.label}: ${at}`).toBeDefined();
        expect(r.key, `${e.label}: ${at}`).toBeDefined();
      }
    }
  });
});

describe('declutter: one home per screen, old routes land', () => {
  it('every section in nav has exactly one home', () => {
    for (const k of [...REGISTRY_KEYS, ...NAV_ONLY]) {
      const homes = HOME_IDS.filter((h) => NAV_TREE[h].some((g) => g.items.some((it) => it.keys.includes(k) || it.aliases?.includes(k))));
      expect(homes.length, k).toBe(1);
      expect(itemOf(k)?.home, k).toBe(homes[0]);
    }
  });

  it('legacy routes resolve: every old tab id, every "panel.section"', () => {
    for (const tab of Object.keys(LEGACY_TAB_ROUTE)) {
      if (tab === 'map') continue;
      expect(resolveRoute(tab).home, tab).toBeDefined();
    }
    for (const k of REGISTRY_KEYS) {
      const r = resolveRoute(k);
      expect(r.key, k).toBeDefined();
      expect(itemOf(r.key!)!.keys, k).toContain(r.key);
    }
  });
  it('fewer places than before (52 → 35), and no home over ten', () => {
    expect(NAV_ITEMS.length).toBeLessThanOrEqual(35);
    for (const h of HOME_IDS) expect(NAV_TREE[h].flatMap((g) => g.items).length, h).toBeLessThanOrEqual(10);
  });

});

describe('declutter: Deal with [person] offers everything the old entry points did', () => {
  it('his sheet\'s old extras (travel, dirty work, dating) are in the one menu, used everywhere', async () => {
    const { playWeeks } = await import('./helpers');
    const { menuFor } = await import('../src/ui/sheet/menuCatalog');
    const { jobsForPerson } = await import('../src/engine/dirtyWork');
    const { isAdult } = await import('../src/engine/dating');
    const { leaderBlock } = await import('../src/engine/travel');
    const s = playWeeks('declutter-deal', 8);
    let dirty = 0, trip = 0, dating = 0;
    for (const c of Object.values(s.characters).filter((x) => x.alive && x.id !== s.playerId).slice(0, 80)) {
      const keys = new Set(menuFor(s, c).flatMap((x) => x.items.map((it) => it.key)));
      if (jobsForPerson(s, c.id).length) { dirty++; expect(keys.has('dirty'), `${c.firstName}: dirty work`).toBe(true); }
      const why = leaderBlock(s, c.id);
      if (c.faction === 'player' && why !== 'Not one of yours to send' && why !== 'Not among the living') { trip++; expect(keys.has('trip'), `${c.firstName}: trip`).toBe(true); }
      if (isAdult(s, c) && !(c.dynasty && s.characters[s.playerId]?.spouseId !== c.id)) { dating++; expect(keys.has('dating'), `${c.firstName}: dating`).toBe(true); }
    }
    expect(dirty + trip + dating).toBeGreaterThan(5);
  });

  it('the sheet opens Deal with as one panel: Best now first, every category, a find box', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { playWeeks } = await import('./helpers');
    const { CharacterSheet } = await import('../src/ui/components/CharacterSheet');
    const { menuFor } = await import('../src/ui/sheet/menuCatalog');
    const s = playWeeks('declutter-sheet', 6);
    const man = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'capo')!;
    const html = renderToString(createElement(CharacterSheet, { s, id: man.id, onClose: () => {}, initialTab: 'actions' }));
    expect(html).toContain('data-testid="interaction-menu"');
    expect(html).toContain('data-testid="menu-cat-best"');
    expect(html).toContain('data-testid="menu-find"');
    expect(html).toContain(`Deal with ${man.firstName}`);
    for (const cat of menuFor(s, man)) expect(html, cat.id).toContain(`data-testid="menu-cat-${cat.id}"`);
    // Folded rows, not tall cards.
    expect(html).toContain('data-testid="action-row"');
  });
});

describe('declutter: This place offers what the old place cards did', () => {
  it('every lot: buy, buy the business, lease, dirty work, go in and a meeting — or the reason why not', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { playWeeks } = await import('./helpers');
    const { PlaceVerbs } = await import('../src/ui/hood/PlaceVerbs');
    const { jobsForPlace } = await import('../src/engine/dirtyWork');
    const { placeActions } = await import('../src/engine/placeEligibility');
    const s = playWeeks('declutter-place', 6);
    const lots = (s.econ?.lots ?? []).slice(0, 60);
    expect(lots.length).toBeGreaterThan(20);
    let sale = 0, lease = 0, dirty = 0;
    for (const l of lots) {
      const mine = l.status === 'owned' || l.status === 'leased';
      const biz = mine && l.bizId ? s.businesses.find((b) => b.id === l.bizId) : undefined;
      const html = renderToString(createElement(PlaceVerbs, { s, lot: l, biz, on: { goIn: () => {}, meeting: () => {} } }));
      // The old walk card: go in, a meeting here.
      expect(html, l.id).toContain('data-testid="walk-call-meeting"');
      if (placeActions(s, l, biz).some((a) => a.id === 'goIn')) expect(html, l.id).toContain('data-testid="walk-go-in"');
      // The old walk card and lot panel: an offer when it is for sale, a lease when it is for rent.
      if (l.status === 'sale') { sale++; expect(html, l.id).toContain('data-testid="make-offer"'); }
      if (l.status === 'lease') { lease++; expect(html, l.id).toContain('Lease the storefront'); }
      // The old dirty-here row.
      if (jobsForPlace(s, l, biz).length) { dirty++; expect(html, l.id).toContain('data-testid="dirty-here"'); }
      // Whatever does not fit says why.
      if (placeActions(s, l, biz).some((a) => a.why && ['offer', 'buyBusiness', 'lease', 'renovate'].includes(a.id))) expect(html, l.id).toContain('data-testid="place-not-now"');
    }
    expect(sale + lease + dirty).toBeGreaterThan(3);
  });
});

describe('declutter: Find… reaches screens, people, places and things to do', () => {
  it('finds by what you want to do, by screen, by name, by place', async () => {
    const { newGame } = await import('../src/engine/newGame');
    const { findAll } = await import('../src/ui/shell/find');
    const { displayName } = await import('../src/engine/characters');
    const s = newGame('declutter-find');
    const lend = findAll(s, 'lend');
    expect(lend.some((r) => r.kind === 'do' && r.go.to === 'route')).toBe(true);
    // A match in the words people would use counts, not only in the title (lend → the shylock book).
    expect(lend.filter((r) => r.kind === 'do').length).toBeGreaterThanOrEqual(2);
    const council = findAll(s, 'council');
    expect(council.some((r) => r.kind === 'screen' && r.go.to === 'route' && r.go.key === 'borgata.council')).toBe(true);
    const ub = Object.values(s.characters).find((c) => c.alive && c.rank === 'underboss')!;
    expect(findAll(s, ub.lastName).some((r) => r.kind === 'person' && r.go.to === 'sheet' && r.go.id === ub.id)).toBe(true);
    expect(findAll(s, displayName(ub)).some((r) => r.kind === 'person')).toBe(true);
    const d = s.districts[0];
    expect(findAll(s, d.name).some((r) => r.kind === 'place')).toBe(true);
    // Every registered screen and every view can be found by its own name.
    const { NAV_ITEMS } = await import('../src/ui/shell/nav');
    for (const it of NAV_ITEMS) expect(findAll(s, it.label, { limit: 50 }).some((r) => r.kind === 'screen' && r.go.to === 'route' && it.keys.includes(r.go.key)), it.label).toBe(true);
    // Every thing to do lands somewhere real.
    for (const r of findAll(s, 'a', { limit: 500 }).filter((x) => x.kind === 'do')) expect(r.go.to).toBeDefined();
    expect(findAll(s, 'x')).toEqual([]);
  });
});

describe('declutter: a calm frame', () => {
  it('the top bar has one loop button, Office, orders and Find; the map has one dock', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { App } = await import('../src/ui/App');
    const html = renderToString(createElement(App, { startOn: 'game' }));
    expect(html).toContain('data-testid="waiting-button"');
    expect(html).toContain('data-testid="office-button"');
    expect(html).toContain('data-testid="orders-button"');
    expect(html).toContain('data-testid="find-button"');
    // The four old loop buttons are lines in the Waiting menu now, not buttons on the bar.
    const bar = html.slice(html.indexOf('data-testid="topbar"'), html.indexOf('data-testid="map-area"'));
    for (const id of ['decisions-button', 'sitdown-button', 'desk-button']) expect(bar, id).not.toContain(`data-testid="${id}"`);
    // Today, the club and (on phones) the next goal share one dock.
    const dock = html.slice(html.indexOf('data-testid="map-dock"'));
    expect(html).toContain('data-testid="map-dock"');
    expect(dock).toContain('data-testid="club-on-map"');
    expect(html.split('data-testid="club-on-map"').length).toBe(2);
  });
});
