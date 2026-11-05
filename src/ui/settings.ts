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
  /** "Running clock": the days tick by (Crusader Kings style); "Turn-based": one turn (1, 2 or 4 weeks) at a time. */
  timeMode?: TimeMode;
  /** The player picked the time mode himself (Settings): no default ever moves him again. */
  timeModeChosen?: boolean;
  /** The time mode was set by a new game's default (Story: turns), not by the player: the next new game may set it again. */
  timeModeAuto?: boolean;
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
  /** Stop the clock on an alarm (live alerts): a rival strikes, a plot or a blown scheme, an arrest, the heat boiling over. */
  pauseOnAlarm?: boolean;
  /** Stop the clock when something red lands on the Desk (clockPolicy.ts). */
  pauseOnRed?: boolean;
  /** Stop the clock when someone asks for an urgent meeting. */
  pauseOnUrgent?: boolean;
  /** Stop the clock on a battle or a war declared. */
  pauseOnWar?: boolean;
  /** Stop the clock when a plot against you is uncovered. */
  pauseOnPlot?: boolean;
  /** Stop the clock when a threat strikes on its day and hour (a decision with odds, now). */
  pauseOnStrike?: boolean;
  /** The running clock became the default for everyone once (v2): the stored turn-based setting was moved over. */
  clockV?: number;
  /** Live alerts: keep the small news out of the strip and the good news out of the pop-ups. */
  quietLowAlerts?: boolean;
  /** Developer inspector: show the engine's internal ids (agreements) next to their names. */
  devIds?: boolean;
  /** Ask "Are you sure?" before an order is given (default on). */
  confirmOrders?: boolean;
  /** How much the game explains: Guided (every tip, briefings on big moves), Standard, Experienced (quiet). */
  helpLevel?: HelpLevel;
  /** Adviser briefings that open by themselves: on big moves (default), on everything, or only when asked. */
  autoBriefings?: AutoBriefings;
  /** What matters most to you right now: decision advice is weighed by it. */
  priority?: 'money' | 'heat' | 'loyalty' | 'family';
  /** Map: the lighting of the illustrated island (time of day). */
  mapLighting?: 'day' | 'dusk' | 'night' | 'auto';
  /** Where each week starts: the Boss's Office, the Desk, or the map. Unset: Office for new games, Desk for older saves. */
  weekStart?: WeekStart;
  /** Simple or Full view, for every screen (unset: Simple for Story difficulty and new games, Full for older saves). */
  view?: ViewMode;
  /** One screen's own Simple / Full, over the global one. */
  viewBy?: Record<string, ViewMode>;
}
/** Simple: the consigliere's top 3 and the 5 most-used actions, "More…" one tap away. Full: everything, as before. Nothing is removed. */
export type ViewMode = 'simple' | 'full';
/** The flag a new game carries (set when it is created) so it opens in Simple view. */
export const SIMPLE_VIEW_FLAG = 'simpleView';

/** The view for one screen: its own setting, else the global one, else Simple for Story and new games. */
export function viewMode(screen: string, s?: { difficulty?: string; flags?: Record<string, number> }): ViewMode {
  const st = getSettings();
  return st.viewBy?.[screen] ?? st.view ?? (s && (s.difficulty === 'story' || s.flags?.[SIMPLE_VIEW_FLAG]) ? 'simple' : 'full');
}

/** Set the view: for one screen (it overrides the global one), or for all (screen undefined: clears the per-screen ones). */
export function setViewMode(screen: string | undefined, v: ViewMode): void {
  if (!screen) { setSettings({ view: v, viewBy: {} }); return; }
  setSettings({ viewBy: { ...(getSettings().viewBy ?? {}), [screen]: v } });
}
export type WeekStart = 'office' | 'desk' | 'map';

/** The flag a new game carries (set when it is created) so the Office is its default home. */
export const OFFICE_HOME_FLAG = 'officeHome';
/** Set in the save once the opening card has played (a Continue in week 1 never replays it). */
export const OPENING_SEEN_FLAG = 'openingSeen';

/** Where this game starts each week: the setting, else Office for games begun with the Office, Desk for older saves. */
export function weekStart(s: { flags: Record<string, number> }): WeekStart {
  return getSettings().weekStart ?? (s.flags[OFFICE_HOME_FLAG] ? 'office' : 'desk');
}
export type HelpLevel = 'guided' | 'standard' | 'experienced';
export type AutoBriefings = 'major' | 'all' | 'off';

export const HELP_LEVELS: { id: HelpLevel; label: string; blurb: string }[] = [
  { id: 'guided', label: 'Guided', blurb: 'Every tip and lesson, who-what-when on every order, and your underboss speaks up on big moves.' },
  { id: 'standard', label: 'Standard', blurb: 'No lessons or who-what-when lines; a short word from your underboss on big moves.' },
  { id: 'experienced', label: 'Experienced', blurb: 'Quiet: no tips, no automatic briefings. "Ask for advice" is still on every order.' },
];

/** The help level (new players: Guided). */
export function helpLevel(): HelpLevel {
  return getSettings().helpLevel ?? 'guided';
}

/** When briefings open by themselves: the setting, else what the help level implies. */
export function autoBriefings(): AutoBriefings {
  const v = getSettings().autoBriefings;
  if (v) return v;
  const h = helpLevel();
  return h === 'experienced' ? 'off' : 'major';
}
export type TimeMode = 'clock' | 'turns';

/** The autopause list (Settings): what stops the running clock by itself. */
export const AUTO_PAUSE: { key: keyof Settings; label: string }[] = [
  { key: 'pauseOnRed', label: 'Something red lands on the Desk' },
  { key: 'pauseOnUrgent', label: 'Someone asks for an urgent meeting' },
  { key: 'pauseOnWar', label: 'A battle, or a war is declared' },
  { key: 'pauseOnPlot', label: 'A plot against you is uncovered' },
  { key: 'pauseOnStrike', label: 'A threat strikes on its night (a raid, a hit): your call, now' },
  { key: 'pauseOnDecision', label: 'Any decision waiting, even a routine one (off: only red ones)' },
  { key: 'pauseOnCapo', label: 'When a capo has an urgent problem' },
  { key: 'pauseOnViolence', label: 'On a hit or a killing' },
  { key: 'pauseOnArrest', label: 'When one of yours is arrested' },
  { key: 'pauseOnLife', label: 'On a birth or a death in your house' },
  { key: 'pauseOnWarning', label: 'On a new warning or a cutscene' },
  { key: 'pauseOnAlarm', label: 'On an alarm: a rival strikes, a plot, an arrest, the heat boils over' },
  { key: 'pauseOnEvening', label: 'After each of your evenings' },
];

/** The running clock is the default for new players. */
export function timeMode(): TimeMode {
  return getSettings().timeMode ?? 'clock';
}

/**
 * A new game's default time mode (STREAMLINE_2 §5.3): Story plays in turns (a two-week turn and the
 * Round, the gentlest way to meet every part of the game once); Don and Grand Strategy keep the
 * running clock. Only for a player who never chose: a mode he picked in Settings (timeModeChosen), or
 * any mode stored from before this default existed, is never moved.
 */
export function newGameTimeMode(difficulty: 'story' | 'don' | 'grand'): TimeMode {
  const st = getSettings();
  if (st.timeModeChosen || (st.timeMode !== undefined && !st.timeModeAuto)) return timeMode();
  const want: TimeMode = difficulty === 'story' ? 'turns' : 'clock';
  if (st.timeMode !== want || !st.timeModeAuto) setSettings({ timeMode: want, timeModeAuto: true });
  return want;
}

/** The player picks the time mode himself (Settings): remembered as his choice. */
export function chooseTimeMode(m: TimeMode): Settings {
  return setSettings({ timeMode: m, timeModeChosen: true, timeModeAuto: undefined });
}

/** An autopause rule (the new ones default on, the evening report off). */
export function pausesOn(key: keyof Settings): boolean {
  const v = getSettings()[key];
  return v === undefined ? key !== 'pauseOnEvening' : !!v;
}

const KEY = 'llv.settings';
export const DEFAULT_SETTINGS: Settings = { reducedMotion: false, textSpeed: 'normal', pauseOnDecision: false, pauseOnWarning: true, clockV: 2 };
// Faster than it was (the playthrough timed ~30 s for the three-line intro at 38): normal reads at a brisk pace, a click finishes the line.
export const TEXT_CPS: Record<TextSpeed, number> = { slow: 30, normal: 70, fast: 140, instant: 10000 };

let cached: Settings | undefined;

export function getSettings(): Settings {
  if (cached) return cached;
  let s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = migrateClock({ ...s, clockV: undefined, ...(JSON.parse(raw) as Partial<Settings>) });
  } catch {
    /* defaults */
  }
  cached = s;
  return s;
}

/**
 * Once, for a player from before: the running clock becomes the default (turn-based stays one
 * click away in Settings), and only red decisions stop it (any decision, if he turns that back on).
 */
export function migrateClock(s: Settings): Settings {
  if ((s.clockV ?? 0) >= 2) return s;
  const out = { ...s, timeMode: 'clock' as TimeMode, pauseOnDecision: false, clockV: 2 };
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* not remembered */ }
  return out;
}

/** Forget the cached settings (read again from storage next time): tests, and another tab's change. */
export function reloadSettings(): Settings {
  cached = undefined;
  return getSettings();
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
