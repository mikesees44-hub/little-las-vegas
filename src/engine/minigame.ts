import { applyEffects } from './effects';
import { hashSeed, rand, type RngHolder } from './rng';
import type { Choice, Effect, EventInstance, GameState } from './types';
import type { Ctx } from './ledger';

/**
 * MINI-GAMES: key moments of the story played as a full-screen, turn-based
 * scene (a trial, a card game in the back room, a sit-down, a collection
 * round, a heist, a bug sweep, election night).
 *
 * The contract:
 *  - A popup choice carries a `{ type: 'minigame' }` effect. The UI opens the
 *    scene when the player picks it; the clock is paused while it is open.
 *  - A session is a plain, serializable object driven by its OWN seeded
 *    stream (`ses.rng`, from the game seed + the event iid), so it never
 *    reshuffles the main simulation's dice and is replayable: the same game
 *    state + the same moves always give the same outcome.
 *  - The player's moves travel to the engine in `PlayerChoices.minigames`;
 *    `advanceWeek` replays them (an illegal move falls back to the default
 *    play) and applies the outcome's effects through the normal effects and
 *    the one ledger.
 *  - "Let it play out": with no moves (or after the last one) the session
 *    finishes with its default play — the SAME engine, the same odds. The
 *    simulator's random player and an unanswered popup both take this road.
 */

export type MinigameId = 'arraignment' | 'trial' | 'cards' | 'sitdown' | 'collection' | 'heist' | 'sweep' | 'election' | 'madeboss' | 'ceremony';

export interface MgOption {
  id: string;
  label: string;
  detail?: string;
  /** Odds of success shown on the button (0..1). */
  odds?: number;
  /** Visible cost or stake. */
  cost?: number;
  disabled?: string;
  /** Ends the run or the dynasty (the sim's random player never picks it). */
  drastic?: boolean;
  tone?: 'safe' | 'risky' | 'dirty';
}

export interface MgBeat {
  text: string;
  tone?: 'good' | 'bad' | 'info' | 'quote';
  who?: string;
}

export interface MgOutcome {
  title: string;
  text: string;
  tone: 'good' | 'bad' | 'mixed';
  effects: Effect[];
  headline?: { paper: string; headline: string; body: string };
  /** Short closing cards (the witness epilogue). */
  epilogue?: string[];
}

export interface MgIntro {
  title: string;
  kicker: string;
  text: string;
  /** Scene key for the noir still (src/ui/minigames/MgStill.tsx). */
  scene: string;
}

export interface MgSession<D = any> {
  game: MinigameId;
  iid: string;
  rng: number;
  params: Record<string, string | number>;
  parts: Record<string, Effect[]>;
  intro: MgIntro;
  phase: string;
  done: boolean;
  beats: MgBeat[];
  moves: string[];
  outcome?: MgOutcome;
  d: D;
}

export interface MinigameDef<D = any> {
  id: MinigameId;
  /** Build the game data from the state (read-only) and the session's own dice. */
  init: (s: GameState, ses: MgSession<D>) => { d: D; intro: MgIntro; phase: string };
  options: (s: GameState, ses: MgSession<D>) => MgOption[];
  /** Advance by one legal move (mutates the session only). */
  step: (s: GameState, ses: MgSession<D>, move: string) => void;
  /** The default play: what happens when you let it play out. */
  auto: (s: GameState, ses: MgSession<D>) => string;
  /** Anything beyond the outcome's effects (legal state, succession, records). */
  apply?: (ctx: Ctx, ses: MgSession<D>) => void;
  /** The numbers behind the odds, for the screen. */
  odds?: (s: GameState, ses: MgSession<D>) => { label: string; value: string; tone?: 'good' | 'bad' }[];
}

const DEFS: Partial<Record<MinigameId, MinigameDef>> = {};

export function registerMinigame<D>(def: MinigameDef<D>): void {
  DEFS[def.id] = def as MinigameDef;
}

export function minigameDef(id: MinigameId): MinigameDef {
  const d = DEFS[id];
  if (!d) throw new Error(`Unknown mini-game ${id}`);
  return d;
}

/* ---------------------------------------------------------------- */
/* Persistent mini-game state                                        */
/* ---------------------------------------------------------------- */

export interface MgRecord {
  week: number;
  game: MinigameId;
  title: string;
  text: string;
  tone: MgOutcome['tone'];
  headline?: string;
  personId?: string;
}

/** A cooperating witness: who he can hurt, and how believable he is. */
export interface Witness {
  id: string;
  name: string;
  against: string[];
  week: number;
  credibility: number;
  /** He was the boss (the betrayal storyline). */
  boss?: boolean;
}

export interface MgState {
  history: MgRecord[];
  witnesses: Witness[];
  /** Lawyer retained per defendant. */
  lawyer: Record<string, string>;
  /** Defendants with a trial on the docket. */
  open: string[];
  /** Per-person week of the last trial. */
  cool: Record<string, number>;
  lastNpcTrial?: number;
  /** Obstruction counts added after a tampering scandal. */
  obstruction: Record<string, number>;
  /** The old boss turned: the heir's betrayal storyline. */
  betrayal?: { ratId: string; heirId: string; week: number; stage: number };
  /** Witnesses scheduled to take the stand against someone (week due). */
  testimony: { witnessId: string; targetId: string; due: number }[];
  /** Week of the last time each kind of scene was offered. */
  offered: Record<string, number>;
  /** Law-faction men already on the witness list. */
  known: Record<string, number>;
  /** Retrials and delayed cases (a hung jury, a mistrial): who, when, which kind. */
  docket: { defendantId: string; due: number; mode: 'crew' | 'rival'; weeks: number }[];
  /** This week's front pages for the newspaper reel (reels.ts). */
  reels?: import('./reels').Reel[];
}

export function mgOf(s: GameState): MgState {
  if (!s.mg) s.mg = { history: [], witnesses: [], lawyer: {}, open: [], cool: {}, obstruction: {}, testimony: [], offered: {}, known: {}, docket: [] };
  if (!s.mg.docket) s.mg.docket = [];
  return s.mg;
}

/** Read-only view (never initialises the live state from a render). */
export function mgView(s: GameState): MgState {
  return s.mg ?? { history: [], witnesses: [], lawyer: {}, open: [], cool: {}, obstruction: {}, testimony: [], offered: {}, known: {}, docket: [] };
}

/* ---------------------------------------------------------------- */
/* Sessions                                                          */
/* ---------------------------------------------------------------- */

export function sessionSeed(s: GameState, game: MinigameId, iid: string): number {
  return hashSeed(`${s.seed}|mg|${game}|${iid}`);
}

export function startSession(s: GameState, game: MinigameId, iid: string, params: Record<string, string | number> = {}, parts: Record<string, Effect[]> = {}): MgSession {
  const def = minigameDef(game);
  const ses: MgSession = { game, iid, rng: sessionSeed(s, game, iid), params: { ...params }, parts: JSON.parse(JSON.stringify(parts)), intro: { title: '', kicker: '', text: '', scene: 'courtroom' }, phase: '', done: false, beats: [], moves: [], d: undefined };
  const r = def.init(s, ses);
  ses.d = r.d;
  ses.intro = r.intro;
  ses.phase = r.phase;
  return ses;
}

export function sessionOptions(s: GameState, ses: MgSession): MgOption[] {
  if (ses.done) return [];
  return minigameDef(ses.game).options(s, ses);
}

/** One move (copy-on-write). An illegal move becomes the default play. */
export function stepSession(s: GameState, ses: MgSession, move?: string): MgSession {
  if (ses.done) return ses;
  const def = minigameDef(ses.game);
  const next: MgSession = JSON.parse(JSON.stringify(ses));
  const legal = def.options(s, next).filter((o) => !o.disabled);
  const m = move !== undefined && legal.some((o) => o.id === move) ? move : def.auto(s, next);
  next.moves.push(m);
  def.step(s, next, m);
  return next;
}

const MAX_STEPS = 400;

/** Let it play out: the default play to the end. */
export function autoFinish(s: GameState, ses: MgSession): MgSession {
  let x = ses;
  for (let i = 0; i < MAX_STEPS && !x.done; i++) x = stepSession(s, x);
  if (!x.done) throw new Error(`Mini-game ${ses.game} did not finish`);
  return x;
}

/** Replay the player's moves, then let the rest play out. */
export function playSession(s: GameState, game: MinigameId, iid: string, params: Record<string, string | number>, parts: Record<string, Effect[]> = {}, moves?: readonly string[]): MgSession {
  let ses = startSession(s, game, iid, params, parts);
  for (const m of moves ?? []) {
    if (ses.done) break;
    ses = stepSession(s, ses, m);
  }
  return autoFinish(s, ses);
}

/** The sim's random player: a random legal (non-drastic) move. */
export function randomMoves(s: GameState, game: MinigameId, iid: string, params: Record<string, string | number>, parts: Record<string, Effect[]> | undefined, h: RngHolder): string[] {
  let ses = startSession(s, game, iid, params, parts ?? {});
  for (let i = 0; i < MAX_STEPS && !ses.done; i++) {
    const opts = sessionOptions(s, ses).filter((o) => !o.disabled && !o.drastic);
    const m = opts.length ? opts[Math.floor(rand(h) * opts.length)].id : undefined;
    ses = stepSession(s, ses, m);
  }
  return ses.moves;
}

/* ---------------------------------------------------------------- */
/* Session dice and helpers for the game modules                     */
/* ---------------------------------------------------------------- */

export function roll(ses: MgSession): number {
  return rand(ses);
}
export function hit(ses: MgSession, p: number): boolean {
  return rand(ses) < p;
}
export function between(ses: MgSession, lo: number, hi: number): number {
  return lo + Math.floor(rand(ses) * (hi - lo + 1));
}
export function choose<T>(ses: MgSession, xs: readonly T[]): T {
  return xs[Math.floor(rand(ses) * xs.length)];
}
export function beat(ses: MgSession, text: string, tone?: MgBeat['tone'], who?: string): void {
  ses.beats.push({ text, tone, who });
}
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

/* ---------------------------------------------------------------- */
/* The popup pipeline                                                */
/* ---------------------------------------------------------------- */

/** The effect that launches a mini-game from a popup choice. `play: 0` resolves it without opening the screen. */
export function mgEffect(game: MinigameId, iid: string, params: Record<string, string | number>, parts?: Record<string, Effect[]>, label?: string): Effect {
  return { type: 'minigame', game, iid, params, parts, label };
}

export function minigameOf(c: Choice): Extract<Effect, { type: 'minigame' }> | undefined {
  return c.effects.find((e): e is Extract<Effect, { type: 'minigame' }> => e.type === 'minigame');
}

/** Does picking this choice open the full-screen scene? */
export function opensScene(c: Choice): boolean {
  const m = minigameOf(c);
  return !!m && m.params.play !== 0;
}

export function eventHasMinigame(ev: EventInstance): boolean {
  return ev.choices.some((c) => !!minigameOf(c));
}

/** Chip text for a mini-game choice. */
export function describeMinigame(e: Extract<Effect, { type: 'minigame' }>): string {
  const NAMES: Record<MinigameId, string> = { arraignment: 'The arraignment', trial: 'The trial', cards: 'The card game', sitdown: 'The sit-down', collection: 'The collection round', heist: 'The job', sweep: 'The sweep', election: 'Election night', madeboss: 'The scene', ceremony: 'The ceremony' };
  return e.params.play === 0 ? `${NAMES[e.game]} plays out on its own` : `▶ ${NAMES[e.game]}: you play it (or let it play out)`;
}

/** Add-on choices for events built elsewhere (a sit-down at a Table hearing, a collection round ...). */
type Attacher = (s: GameState, ev: EventInstance) => Choice | undefined;
let ATTACHERS: Attacher[] | undefined;
export function registerAttacher(fn: Attacher): void {
  (ATTACHERS ??= []).push(fn);
}

/** Called once a week after the popups are chosen. */
export function attachMinigames(s: GameState): void {
  for (const ev of s.pendingEvents) {
    if (eventHasMinigame(ev)) continue;
    for (const fn of ATTACHERS ?? []) {
      const c = fn(s, ev);
      if (c) {
        ev.choices = [c, ...ev.choices];
        break;
      }
    }
  }
}

/* ---------------------------------------------------------------- */
/* Applying an outcome                                               */
/* ---------------------------------------------------------------- */

export function applyMinigameEffect(ctx: Ctx, e: Extract<Effect, { type: 'minigame' }>): MgSession {
  const s = ctx.s;
  const ses = playSession(s, e.game, e.iid, e.params, e.parts ?? {}, ctx.mgMoves?.[e.iid]);
  const o = ses.outcome!;
  if (o.effects.length) applyEffects(ctx, o.effects.map((x) => (x.label ? x : { ...x, label: o.title })), { label: o.title, because: o.title.toLowerCase(), category: 'event' });
  minigameDef(e.game).apply?.(ctx, ses);
  const mg = mgOf(s);
  mg.history.push({ week: s.week, game: e.game, title: o.title, text: o.text, tone: o.tone, headline: o.headline?.headline, personId: ses.params.defendant ? String(ses.params.defendant) : undefined });
  if (mg.history.length > 40) mg.history = mg.history.slice(-40);
  if (o.headline) {
    s.news.push({ week: s.week, date: { ...s.date }, paper: o.headline.paper, headline: o.headline.headline, body: o.headline.body, kind: 'minigame' });
  }
  ctx.log.push(`${o.title}: ${o.text}`);
  return ses;
}

/** Mini-game events resolve first in the week, so the engine replays them on the exact state the player saw. */
export function minigameFirst(evs: EventInstance[]): EventInstance[] {
  return [...evs.filter(eventHasMinigame), ...evs.filter((e) => !eventHasMinigame(e))];
}
