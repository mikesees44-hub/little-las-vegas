import type { GameState } from '../engine/types';

const KEY = 'little-las-vegas:save:v1';

export function loadGame(): GameState | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const s = JSON.parse(raw) as GameState;
    return s && s.version === 1 ? s : undefined;
  } catch {
    return undefined;
  }
}

export function saveGame(s: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or unavailable: the game still runs */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
