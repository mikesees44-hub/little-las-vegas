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
  dynasty: ['familyState.ts', 'DynAction', 'type'],
  power: ['powerState.ts', 'PowerAction', 'op'],
  living: ['livingAsk.ts', 'LivingAction', 'op'],
  talk: ['talks.ts', 'TalkOp', 't'],
  hood: ['hood.ts', 'HoodAction', 'type'],
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
