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
  /** Open the Sit-Down at the start of every week (default on). */
  sitdownEachWeek?: boolean;
  /** "Running clock": the days tick by (Crusader Kings style); "Turn-based": one Advance Week at a time. */
  timeMode?: TimeMode;
  /** Stop the clock on a hit or a killing in your family. */
  pauseOnViolence?: boolean;
  /** Stop the clock when one of yours is arrested. */
  pauseOnArrest?: boolean;
  /** Stop the clock on a birth or a death in your house. */
  pauseOnLife?: boolean;
  /** Stop the clock when a capo brings an urgent problem to the morning meeting. */
  pauseOnCapo?: boolean;
  /** Stop the clock after each of your evenings (the report scene). */
  pauseOnEvening?: boolean;
  /** Developer inspector: show the engine's internal ids (agreements) next to their names. */
  devIds?: boolean;
}
export type TimeMode = 'clock' | 'turns';

/** The autopause list (Settings): what stops the running clock by itself. */
export const AUTO_PAUSE: { key: keyof Settings; label: string }[] = [
  { key: 'pauseOnDecision', label: 'When a decision is waiting' },
  { key: 'pauseOnCapo', label: 'When a capo has an urgent problem' },
  { key: 'pauseOnViolence', label: 'On a hit or a killing' },
  { key: 'pauseOnArrest', label: 'When one of yours is arrested' },
  { key: 'pauseOnLife', label: 'On a birth or a death in your house' },
  { key: 'pauseOnWarning', label: 'On a new warning or a cutscene' },
  { key: 'pauseOnEvening', label: 'After each of your evenings' },
];

/** The running clock is the default for new players. */
export function timeMode(): TimeMode {
  return getSettings().timeMode ?? 'clock';
}

/** An autopause rule (the new ones default on, the evening report off). */
export function pausesOn(key: keyof Settings): boolean {
  const v = getSettings()[key];
  return v === undefined ? key !== 'pauseOnEvening' : !!v;
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
