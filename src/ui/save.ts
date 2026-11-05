import { displayName } from '../engine/characters';
import { upgradeSave } from '../engine/upgradeSave';
import type { GameState, PlayerAction } from '../engine/types';
import LZ from 'lz-string';

/** Saves are stored compressed (about a tenth the size); old plain-JSON saves still load. */
const LZ_TAG = 'LZ1:';
export function packSave(json: string): string {
  try { return LZ_TAG + LZ.compressToUTF16(json); } catch { return json; }
}
export function unpackSave(raw: string): string {
  if (!raw.startsWith(LZ_TAG)) return raw;
  const out = LZ.decompressFromUTF16(raw.slice(LZ_TAG.length));
  if (out == null || out === '') throw new Error('corrupt compressed save');
  return out;
}

/**
 * Three save slots in localStorage. Every read and write is wrapped: in a
 * private window or with storage blocked the game still runs, it just does
 * not remember. The old single save (v2 key) becomes slot 1 on first load.
 * A small meta record per slot keeps the title screen from parsing whole
 * games just to list them.
 */

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const LEGACY = 'little-las-vegas:save:v2';
const SLOT = (n: number) => `little-las-vegas:slot:${n}`;
const META = (n: number) => `little-las-vegas:slotmeta:${n}`;
const CURRENT = 'little-las-vegas:slot:current';
export const SLOTS = [1, 2, 3] as const;

export interface SlotMeta {
  slot: number;
  house: string;
  boss: string;
  date: string;
  week: number;
  ironman?: boolean;
  savedAt: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function store(): KV | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

function get(kv: KV | undefined, k: string): string | null {
  try {
    return kv ? kv.getItem(k) : null;
  } catch {
    return null;
  }
}
function set(kv: KV | undefined, k: string, v: string): boolean {
  try {
    if (!kv) return false;
    kv.setItem(k, v);
    return true;
  } catch {
    return false; /* storage full or unavailable: the game still runs */
  }
}
function del(kv: KV | undefined, k: string): void {
  try {
    kv?.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function metaOf(s: GameState, slot: number): SlotMeta {
  const b = s.characters[s.playerId];
  return {
    slot,
    house: s.houseName,
    boss: b ? displayName(b) : '',
    date: `${MONTHS[s.date.m - 1] ?? ''} ${s.date.d}, ${s.date.y}`,
    week: s.week,
    ironman: !!s.flags?.ironman,
    savedAt: Date.now(),
  };
}

/** Move the old single save into slot 1 (once). */
export function migrateLegacy(kv: KV | undefined = store()): void {
  const old = get(kv, LEGACY);
  if (!old || get(kv, SLOT(1))) return;
  try {
    const s = JSON.parse(old) as GameState;
    if (s?.version !== 2) return;
    if (set(kv, SLOT(1), old)) {
      set(kv, META(1), JSON.stringify(metaOf(s, 1)));
      if (!get(kv, CURRENT)) set(kv, CURRENT, '1');
      del(kv, LEGACY);
    }
  } catch {
    /* unreadable: leave it */
  }
}

export function currentSlot(kv: KV | undefined = store()): number {
  const n = Number(get(kv, CURRENT));
  return SLOTS.includes(n as 1) ? n : 1;
}

export function setCurrentSlot(n: number, kv: KV | undefined = store()): void {
  set(kv, CURRENT, String(n));
}

export function listSlots(kv: KV | undefined = store()): (SlotMeta | undefined)[] {
  migrateLegacy(kv);
  return SLOTS.map((n) => {
    try {
      const m = get(kv, META(n));
      if (m) return JSON.parse(m) as SlotMeta;
      const raw = get(kv, SLOT(n));
      if (!raw) return undefined;
      return metaOf(JSON.parse(unpackSave(raw)) as GameState, n);
    } catch {
      return undefined;
    }
  });
}

/**
 * One backup copy (saves are compressed; the browser allows about five megabytes): the stored save as it was before a load migrated it, or a save
 * that could not be read at all. `{ slot, why, at, raw }`.
 */
const BACKUP = 'little-las-vegas:backup';
export interface SaveBackup { slot: number; why: 'migration' | 'corrupt'; at: number; raw: string }

export function readBackup(kv: KV | undefined = store()): SaveBackup | undefined {
  try {
    const raw = get(kv, BACKUP);
    return raw ? (JSON.parse(raw) as SaveBackup) : undefined;
  } catch {
    return undefined;
  }
}

function keepBackup(kv: KV | undefined, b: SaveBackup): void {
  set(kv, BACKUP, JSON.stringify(b));
}

export function loadSlot(n: number, kv: KV | undefined = store()): GameState | undefined {
  migrateLegacy(kv);
  const raw = get(kv, SLOT(n));
  if (!raw) return undefined;
  let s: GameState;
  try {
    s = JSON.parse(unpackSave(raw)) as GameState;
  } catch {
    // Unreadable: keep the bytes (the slot may be overwritten next) and report no game.
    keepBackup(kv, { slot: n, why: 'corrupt', at: Date.now(), raw });
    return undefined;
  }
  if (!s || s.version !== 2) return undefined;
  const before = s.schema ?? 0;
  try {
    const up = upgradeSave(s);
    // A save from an older build: keep the stored copy before the migrated one is saved over it.
    if ((up.schema ?? 0) !== before) keepBackup(kv, { slot: n, why: 'migration', at: Date.now(), raw });
    return up;
  } catch {
    keepBackup(kv, { slot: n, why: 'corrupt', at: Date.now(), raw });
    return undefined;
  }
}

export function saveSlot(n: number, s: GameState, kv: KV | undefined = store()): boolean {
  let raw: string;
  try {
    raw = packSave(JSON.stringify(s));
  } catch {
    return false;
  }
  if (!set(kv, SLOT(n), raw)) {
    // Out of room: the backup goes first, never the game.
    del(kv, BACKUP);
    if (!set(kv, SLOT(n), raw)) return false;
  }
  set(kv, META(n), JSON.stringify(metaOf(s, n)));
  return true;
}

export function deleteSlot(n: number, kv: KV | undefined = store()): void {
  del(kv, SLOT(n));
  del(kv, META(n));
  del(kv, DESK(n));
}

/**
 * The week in progress on the boss's desk: orders queued, popups answered, mini-game moves, and the
 * scripted scenes that already opened by themselves. It lives beside the slot (not in the game state)
 * and belongs to one week of one game: a reload or Continue gets it back, a new week starts clean.
 * (Playtest #7: a reload lost a $9,000 order and replayed "Made the boss" from page 1.)
 */
export interface DeskState {
  seed: string;
  week: number;
  orders: PlayerAction[];
  answers: Record<string, string>;
  moves: Record<string, string[]>;
  /** Scenes left half-way: the moves so far (the scene resumes after them). */
  partial?: Record<string, string[]>;
  /** Event iids whose scene already opened by itself (Made the boss): never again on Continue. */
  auto: string[];
  /** The Round (turn mode): the homes whose front page he looked at this week. */
  visited?: string[];
}
const DESK = (n: number) => `little-las-vegas:slotdesk:${n}`;

export function saveDesk(n: number, d: DeskState, kv: KV | undefined = store()): boolean {
  const empty = !d.orders.length && !Object.keys(d.answers).length && !Object.keys(d.moves).length && !Object.keys(d.partial ?? {}).length && !d.auto.length;
  if (empty) { del(kv, DESK(n)); return true; }
  try {
    return set(kv, DESK(n), JSON.stringify(d));
  } catch {
    return false;
  }
}

/** The desk saved for this game and this week, else undefined (another game, or the week has turned). */
export function loadDesk(n: number, s: Pick<GameState, 'seed' | 'week'>, kv: KV | undefined = store()): DeskState | undefined {
  const raw = get(kv, DESK(n));
  if (!raw) return undefined;
  try {
    const d = JSON.parse(raw) as DeskState;
    if (!d || d.seed !== s.seed || d.week !== s.week) return undefined;
    return { seed: d.seed, week: d.week, orders: Array.isArray(d.orders) ? d.orders : [], answers: d.answers ?? {}, moves: d.moves ?? {}, partial: d.partial ?? {}, auto: Array.isArray(d.auto) ? d.auto : [] };
  } catch {
    return undefined;
  }
}

/** The first empty slot, else the current one. */
export function freeSlot(kv: KV | undefined = store()): number {
  const list = listSlots(kv);
  const i = list.findIndex((m) => !m);
  return i >= 0 ? SLOTS[i] : currentSlot(kv);
}

/* ---- the old single-save API, now on the current slot ---- */

export function loadGame(): GameState | undefined {
  return loadSlot(currentSlot());
}

export function saveGame(s: GameState): void {
  saveSlot(currentSlot(), s);
}

export function clearSave(): void {
  deleteSlot(currentSlot());
}
