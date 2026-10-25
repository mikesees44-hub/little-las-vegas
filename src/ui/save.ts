import { displayName } from '../engine/characters';
import { upgradeSave } from '../engine/upgradeSave';
import type { GameState } from '../engine/types';

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
      return metaOf(JSON.parse(raw) as GameState, n);
    } catch {
      return undefined;
    }
  });
}

export function loadSlot(n: number, kv: KV | undefined = store()): GameState | undefined {
  migrateLegacy(kv);
  try {
    const raw = get(kv, SLOT(n));
    if (!raw) return undefined;
    const s = JSON.parse(raw) as GameState;
    return s && s.version === 2 ? upgradeSave(s) : undefined;
  } catch {
    return undefined;
  }
}

export function saveSlot(n: number, s: GameState, kv: KV | undefined = store()): boolean {
  let raw: string;
  try {
    raw = JSON.stringify(s);
  } catch {
    return false;
  }
  if (!set(kv, SLOT(n), raw)) return false;
  set(kv, META(n), JSON.stringify(metaOf(s, n)));
  return true;
}

export function deleteSlot(n: number, kv: KV | undefined = store()): void {
  del(kv, SLOT(n));
  del(kv, META(n));
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
