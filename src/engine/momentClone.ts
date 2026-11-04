import { cloneLedgerBook } from './ledgerbookState';
import { clonePol } from './polState';
import type { GameState } from './types';

/**
 * COPY-ON-WRITE FOR MOMENTS (DECADE_BALANCE Top 10 #2): a strike, a feds call, the storm's night
 * used to `structuredClone` the whole state, 2–4 times a game day; at 6 MB that was the 3–25× growth
 * of the day step over a decade. A moment only ever writes the small layers (money, respect, heat,
 * characters, relations, districts, businesses, its own module's state), so the big world layers it
 * never writes are SHARED with the input, and the rest is deep-copied as before.
 *
 * The rule for a moment's code: never write to a layer in MOMENT_SHARED (tests/balance2.test.ts
 * freezes them and plays the clock to prove it). The week turn (engine.ts cloneState) copies them.
 */
export const MOMENT_SHARED: ReadonlySet<string> = new Set([
  'empire', 'econ', 'hood', 'living', 'shadow', 'nightlife', 'dating', 'ears', 'towns', 'dev', 'lastReport', 'lineage',
]);

function deepCopy(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepCopy(v[i]);
    return out;
  }
  const out: Record<string, unknown> = {};
  const o = v as Record<string, unknown>;
  for (const k in o) {
    const x = o[k];
    if (k === 'story' && Array.isArray(x)) out[k] = x.slice();
    else if (x !== undefined) out[k] = deepCopy(x);
  }
  return out;
}

export function momentClone(s: GameState): GameState {
  const src = s as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k in src) {
    const v = src[k];
    if (v === undefined) continue;
    if (MOMENT_SHARED.has(k)) out[k] = v;
    else if (k === 'chronicle' || k === 'dynastyHistory' || k === 'news') out[k] = (v as unknown[]).slice();
    else if (k === 'journal') { const j = v as { e: unknown[]; old: unknown[] }; out[k] = { ...j, e: j.e.slice(), old: j.old.slice() }; }
    else if (k === 'pol') out[k] = clonePol(v as never);
    else if (k === 'ledgerBook') out[k] = cloneLedgerBook(v as never);
    else out[k] = deepCopy(v);
  }
  return out as unknown as GameState;
}
