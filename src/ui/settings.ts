/**
 * Player settings (title screen): music, reduced motion, text speed and the
 * clock's autopause rules. Per-browser conveniences, kept in localStorage
 * behind try/catch; the game runs on the defaults without storage.
 */
export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export interface Settings {
  reducedMotion: boolean;
  textSpeed: TextSpeed;
  /** Stop the clock when a decision is waiting. */
  pauseOnDecision: boolean;
  /** Stop the clock on a new warning or a cutscene. */
  pauseOnWarning: boolean;
}

const KEY = 'llv.settings';
export const DEFAULT_SETTINGS: Settings = { reducedMotion: false, textSpeed: 'normal', pauseOnDecision: true, pauseOnWarning: true };
export const TEXT_CPS: Record<TextSpeed, number> = { slow: 22, normal: 38, fast: 80, instant: 10000 };

let cached: Settings | undefined;

export function getSettings(): Settings {
  if (cached) return cached;
  let s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...s, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* defaults */
  }
  cached = s;
  return s;
}

export function setSettings(patch: Partial<Settings>): Settings {
  cached = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* not remembered */
  }
  applySettings();
  return cached;
}

/** Reflect settings on the document (the reduced-motion class). */
export function applySettings(): void {
  try {
    document.documentElement.classList.toggle('llv-reduce', getSettings().reducedMotion);
  } catch {
    /* no document */
  }
}
