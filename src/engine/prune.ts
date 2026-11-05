import type { GameState } from './types';

/**
 * THE SAVE ON A DIET (DECADE_BALANCE Top 10 #1): a ten-year game grew to 4.4–6.3 MB because nothing was
 * ever let go. Twice a year (pruneSave, from the week turn):
 *
 *  - DEAD MINOR CHARACTERS: a man dead PRUNE_AFTER weeks who was not of the house, not the player's, and is
 *    named nowhere else in the save is folded into a stub (`s.departed`: name, years, cause) and leaves
 *    `characters`, `relations` and every record keyed by him. The family tree keeps the house (lineage).
 *  - ARCHIVES: the Book's folded weeks (`journal.old`), the hood's log, and the empire's closed venues are
 *    held to a window like the chronicle.
 *
 * A save from before keeps loading (upgradeSave): `departed` is optional and filled on the next prune.
 */

export const PRUNE_AFTER = 104;
export const DEPARTED_MAX = 1500;
export const JOURNAL_OLD_MAX = 156;
export const VENUE_MONTHS_KEEP = 13;
export const LOT_HISTORY = 6;
export const REPORT_TALK = 8;

export interface Departed {
  id: string;
  /** "First Last". */
  n: string;
  /** Born, died (years), and how. */
  by: number;
  dy: number;
  c: string;
}

/** Layers never scanned for references (text-only archives, the copy-on-write layers, and the lists being pruned). */
const SKIP_SCAN = new Set(['characters', 'relations', 'journal', 'chronicle', 'dynastyHistory', 'news', 'lastReport', 'departed']);
/** Copy-on-write layers: never written here (engine.ts cloneState shares them between states). */
const NO_WRITE = new Set(['lineage', 'pol', 'ledgerBook', 'journal', 'characters', 'relations', 'departed']);

const ID_RX = /"(c\d+)"(?!\s*:)/g;

/** The name of a man who may have been pruned (the Book, the history). */
export function departedName(s: GameState, id: string): string | undefined {
  const c = s.characters[id];
  if (c) return `${c.firstName} ${c.lastName}`;
  return s.departed?.find((d) => d.id === id)?.n;
}

/** Every character id named somewhere in the save outside the characters themselves (values, not map keys). */
function referenced(s: GameState): Set<string> {
  const out = new Set<string>();
  const src = s as unknown as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    if (SKIP_SCAN.has(k)) continue;
    const v = src[k];
    if (v === null || typeof v !== 'object') continue;
    const json = JSON.stringify(v);
    for (const m of json.matchAll(ID_RX)) out.add(m[1]);
  }
  if (s.playerId) out.add(s.playerId);
  if (s.designatedHeirId) out.add(s.designatedHeirId);
  // Family links among the characters kept.
  for (const c of Object.values(s.characters)) {
    if (c.spouseId) out.add(c.spouseId);
    if (c.fatherId) out.add(c.fatherId);
    if (c.motherId) out.add(c.motherId);
    for (const x of c.childrenIds) out.add(x);
    if (c.capoId) out.add(c.capoId);
  }
  for (const e of [...s.pendingEvents, ...s.eventQueue]) {
    for (const a of e.actors ?? []) out.add(a);
  }
  return out;
}

/** Drop map entries keyed by a pruned id, in the layers a week may write. */
function dropKeyed(v: unknown, gone: Set<string>, depth: number): void {
  if (depth > 4 || v === null || typeof v !== 'object') return;
  if (Array.isArray(v)) { for (const x of v) dropKeyed(x, gone, depth + 1); return; }
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (gone.has(k)) { delete o[k]; continue; }
    dropKeyed(o[k], gone, depth + 1);
  }
}

/** Fold dead minor characters into stubs. Returns how many left `characters`. Works on the week's own copy. */
export function pruneDead(s: GameState): number {
  const cand = Object.values(s.characters).filter((c) => !c.alive && !c.dynasty && c.death && s.week - c.death.week >= PRUNE_AFTER && c.id !== s.playerId);
  if (!cand.length) return 0;
  const refs = referenced(s);
  const gone = new Set(cand.filter((c) => !refs.has(c.id)).map((c) => c.id));
  if (!gone.size) return 0;
  const stubs: Departed[] = [];
  for (const id of gone) {
    const c = s.characters[id];
    stubs.push({ id, n: `${c.firstName} ${c.lastName}`, by: c.birth.y, dy: c.death!.date.y, c: c.death!.cause.slice(0, 60) });
    delete s.characters[id];
  }
  s.departed = [...(s.departed ?? []), ...stubs].slice(-DEPARTED_MAX);
  for (const [k, r] of Object.entries(s.relations)) if (gone.has(r.from) || gone.has(r.to)) delete s.relations[k];
  const src = s as unknown as Record<string, unknown>;
  for (const k of Object.keys(src)) if (!NO_WRITE.has(k)) dropKeyed(src[k], gone, 0);
  return gone.size;
}

/** The archives held to a window. */
export function capArchives(s: GameState): void {
  if (s.journal && s.journal.old.length > JOURNAL_OLD_MAX) s.journal = { ...s.journal, old: s.journal.old.slice(-JOURNAL_OLD_MAX) };
  // A venue's months beyond the last year (older saves kept 36).
  const E = s.empire;
  if (E) for (const v of Object.values(E.venues)) if (v.months.length > VENUE_MONTHS_KEEP) v.months = v.months.slice(-VENUE_MONTHS_KEEP);
  // A lot's deed history: the last few hands it passed through.
  for (const l of s.econ?.lots ?? []) { const h = (l as { history?: unknown[] }).history; if (h && h.length > LOT_HISTORY) (l as { history?: unknown[] }).history = h.slice(-LOT_HISTORY); }
  // Philadelphia's old envelopes: the totals stay, the talk at the table goes.
  const T = s.tribute;
  if (T) T.reports.forEach((r, i) => { if (i < T.reports.length - REPORT_TALK) { if (r.talk.length || r.issues.length) { r.talk = []; r.issues = []; } } });
  // What the living thought of the long dead.
  for (const [k, r] of Object.entries(s.relations)) {
    const a = s.characters[r.from]; const b = s.characters[r.to];
    const deadLong = (c: typeof a) => !!c && !c.alive && !!c.death && s.week - c.death.week >= 52;
    if (deadLong(a) || deadLong(b)) delete s.relations[k];
  }
}

/** Twice a year from the week turn. */
export function pruneSave(s: GameState): void {
  // The archive caps every week (cheap, and what loading a save does), so a save is always in its final form.
  try { capArchives(s); } catch { /* a prune is never worth a crash */ }
  if (s.week % 26 !== 0) return;
  try { pruneDead(s); } catch { /* idem */ }
  try { capArchives(s); } catch { /* idem */ }
}
