import type { GameState } from '../../engine/types';
import type { Route } from './routes';

/** What the hint host knows about the screen right now. */
export interface HintUi {
  route: Route;
  motion: number;
  alerts: number;
  speed: number;
}

/** At most one bubble a minute (the first ten minutes teach four verbs, not forty). */
export const HINT_GAP_MS = 60_000;

/**
 * One-time, dismissable contextual hints (remembered per browser under
 * `llv-hint-<id>`). Never shown over cutscenes or modals.
 */
export interface Hint {
  id: string;
  when: (s: GameState, ui: HintUi) => boolean;
  /** Where the bubble sits. */
  anchor: 'drawer' | 'right' | 'bottom' | 'top' | 'center';
  text: string;
}

export const HINTS: Hint[] = [
  { id: 'desk', when: (_s, ui) => ui.route.home === 'desk', anchor: 'drawer', text: 'Red needs you. The rest your people handle; take any of it back.' },
  { id: 'rise', when: (_s, ui) => ui.route.home === 'org', anchor: 'drawer', text: 'Grow the family: the next rung is on the right.' },
  { id: 'drawer', when: (_s, ui) => !!ui.route.home, anchor: 'drawer', text: 'Each place opens over the map: first what needs you, then everything in it. Esc closes; the map keeps running.' },
  { id: 'alerts', when: (_s, ui) => ui.alerts > 0 && !ui.route.home, anchor: 'right', text: 'Red needs you now. Amber soon. Gold is a chance. Hover for why.' },
  { id: 'motion', when: (_s, ui) => ui.motion > 0 && !ui.route.home, anchor: 'bottom', text: 'Everything under way lives down here, soonest first. Click a chip to go to it.' },
  { id: 'faces', when: (s, ui) => s.week >= 2 && !!ui.route.home, anchor: 'center', text: 'Tap a face for everything you can do to him.' },
  { id: 'heat', when: (s) => Math.max(s.heat.local, s.heat.family, s.heat.federal) >= 50, anchor: 'top', text: 'The heat is up. Hover a heat number for why, and switch the map to Heat to see where.' },
  { id: 'speed', when: (_s, ui) => ui.speed > 0, anchor: 'top', text: 'Space pauses. Alerts and decisions pause the game for you.' },
];
