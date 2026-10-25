import { ALL_BY_ID } from './storyPacks';
import type { PackEvent } from './storyDataSchema';
import type { EventInstance, GameState } from './types';

/**
 * The story director: ONE novelty layer over every event source in the
 * popup pipeline (the bagman, queued reports and deals, crew decisions,
 * situational events, the family, the content packs, economy, politics...).
 *
 * It remembers what the boss was shown (template id + theme, the last 60
 * weeks) and uses that to:
 *  - hold a per-TEMPLATE global cooldown (not just per character): a
 *    non-mandatory template does not come back within TEMPLATE_COOLDOWN
 *    weeks, and at most YEAR_CAP times in 52 weeks;
 *  - weight every weighted pick by freshness (never seen > seen long ago >
 *    seen recently), so sources reach for what the player has not had yet;
 *  - keep a weekly theme mix (crew / family / romance / rivals / law / town /
 *    business / story chain / world): a theme that has had more than its
 *    share lately ranks lower, a starved one ranks higher, and no theme
 *    takes more than MAX_PER_THEME seats in one week;
 *  - make the bagman an institution rather than a weekly face: he comes in
 *    person about once a season (or when Philadelphia is unhappy), and in the
 *    other months the envelope goes through the drop on its own.
 *
 * Mandatory events (funerals, ceremonies, dated history beats) and chain
 * continuations are never blocked: they are the story itself.
 */

export type Theme = 'crew' | 'family' | 'romance' | 'rivals' | 'law' | 'town' | 'business' | 'chain' | 'world' | 'institution';

export const THEMES: Theme[] = ['crew', 'family', 'romance', 'rivals', 'law', 'town', 'business', 'chain', 'world', 'institution'];

/** Weeks before the same template (defId) can be shown again. */
export const TEMPLATE_COOLDOWN = 10;
/** Most times one template may be shown in any 52 weeks (the monthly bagman excepted). */
export const YEAR_CAP = 5;
/** Templates that recur on a fixed cadence and are exempt from the cap. */
export const INSTITUTIONAL = new Set(['bagman']);
/** Most seats one theme may take in a week (mandatory events excepted). */
export const MAX_PER_THEME = 2;
/** The bagman comes in person at most once in this many weeks, about once a season (unless Philadelphia is unhappy). */
export const BAGMAN_VISIT_GAP = 11;
/** How far back the history goes. */
const HISTORY = 60;
/** The window the theme mix is measured over. */
const MIX_WINDOW = 8;

/** The share of popups each theme should get over a few weeks (roughly). */
export const THEME_TARGET: Record<Theme, number> = {
  crew: 0.3, family: 0.11, romance: 0.04, rivals: 0.12, law: 0.08, town: 0.1, business: 0.1, chain: 0.1, world: 0.05, institution: 0.05,
};

export interface DirectorState {
  /** [week, template id, theme] for every popup shown, oldest first. */
  hist: [number, string, Theme][];
  /** Week the bagman last came in person. */
  bagVisit?: number;
  /** Every monthly collection: [week, envelope, 1 = in person / 0 = the drop]. */
  tribute: [number, number, number][];
  /** This week's envelope going through the drop (posted by the engine with the week's ledger). */
  drop?: number;
  /** Scene variants already shown this game, per family (sceneVariants.ts): never the same scene twice until all are used. */
  scenes?: Record<string, number[]>;
  /** The player's last answer per template, [week, choice id] (storyPace.ts: deal renewals). */
  answers?: Record<string, [number, string]>;
  /** Routine business settled quietly this week, applied with the week's ledger (storyPace.ts). */
  quiet?: import('./storyPace').QuietItem[];
  /** The last "In motion" notes: [week, text]. */
  motion?: [number, string][];
  /** How this game opened (openings.ts). */
  opening?: import('./openings').OpeningPlan;
  /** Storylet parts already used (storylets.ts): settings and complications, by index. */
  lets?: Record<string, number[]>;
}

export function director(s: GameState): DirectorState {
  if (!s.director) s.director = { hist: [], tribute: [] };
  return s.director;
}

/* ------------------------------------------------------------------ */
/* Themes                                                              */
/* ------------------------------------------------------------------ */

const PACK_THEME: Record<string, Theme> = {
  crew: 'crew', family: 'family', rivals: 'rivals', law: 'law', town: 'town', season: 'town', history: 'world', vice: 'business',
  table: 'rivals', 'romance-nonexplicit': 'romance', church: 'town', politics: 'town', boardwalk: 'business',
};

/** Templates whose theme is not what their prefix says (crew decisions that are really about money, rivals, the law ...). */
const TEMPLATE_THEME: Record<string, Theme> = {
  crew_score: 'business', score_number: 'business', score_salvage: 'business', score_fight: 'business', score_lot: 'business', score_tourist: 'business', crew_bar: 'business', crew_cut: 'business', crew_loan: 'business',
  crew_debt: 'rivals', crew_courted: 'rivals', crew_beef: 'rivals', crew_proposal: 'rivals', crew_offer_reported: 'rivals',
  crew_pinched: 'law', crew_wife: 'law', plant_found: 'law',
  pitch_cardgame: 'business', pitch_hijack: 'business', pitch_horse: 'business', pitch_bookie: 'business', pitch_contractor: 'business',
  pitch_jukebox: 'rivals', pitch_turncoat: 'rivals', pitch_inspector: 'town', pitch_widow: 'town',
  score_hot: 'business', score_welsh: 'rivals', score_flash: 'law', beef_joke: 'rivals', beef_town: 'town',
  law_trooper: 'law', law_subpoena: 'law', courted_vegas: 'world', kid_draft: 'world',
};

const PREFIX_THEME: [RegExp, Theme][] = [
  [/^(bagman|sitdown|tribute)/, 'institution'],
  [/^(rom_|npc_|romance)/, 'romance'],
  [/^(dyn_|act_|sunday|health)/, 'family'],
  [/^(deal_|rival|retaliation|war|underbelly|trip_rival|faction_)/, 'rivals'],
  [/^(hearing|indictment|trial|grand_jury|bug|rat_|plant_|ruling|raid|arrest|heat|npc_trial|rival_trial|power_prison)/, 'law'],
  [/^(pol_|office_|favor|council)/, 'town'],
  [/^(econ_|aud_|card_game|biz|skimming|too_big|heist|score)/, 'business'],
  [/^(trip_|world|news)/, 'world'],
  [/^(crew_|making|made_|funeral|recruit|drifting|dispute|power_|plot_)/, 'crew'],
];

/** The theme of a pack event (before it is cast). */
export function packTheme(e: PackEvent): Theme {
  return PACK_THEME[e.category] ?? 'town';
}

/** The theme of a popup: chain continuations are 'chain'; pack events by category; the rest by id. */
export function themeOf(e: EventInstance): Theme {
  const pack = e.meta?.pack ? ALL_BY_ID[String(e.meta.pack)] : undefined;
  if (pack) {
    if (pack.chain && pack.chain.part > 1) return 'chain';
    return PACK_THEME[pack.category] ?? 'town';
  }
  if (typeof e.meta?.theme === 'string' && (THEMES as string[]).includes(e.meta.theme)) return e.meta.theme as Theme;
  if (e.meta?.family) return 'family';
  if (TEMPLATE_THEME[e.defId]) return TEMPLATE_THEME[e.defId];
  for (const [re, th] of PREFIX_THEME) if (re.test(e.defId)) return th;
  return e.meta?.crew ? 'crew' : 'town';
}

/** The template a popup was made from (variants that share a defId share a template). */
export function templateOf(e: EventInstance): string {
  return e.defId;
}

/* ------------------------------------------------------------------ */
/* History queries                                                     */
/* ------------------------------------------------------------------ */

export function lastShown(s: GameState, id: string): number | undefined {
  const h = s.director?.hist;
  if (!h) return undefined;
  for (let i = h.length - 1; i >= 0; i--) if (h[i][1] === id) return h[i][0];
  return undefined;
}

export function shownIn(s: GameState, id: string, weeks: number): number {
  const h = s.director?.hist;
  if (!h) return 0;
  let n = 0;
  for (let i = h.length - 1; i >= 0 && s.week - h[i][0] < weeks; i--) if (h[i][1] === id) n++;
  return n;
}

/**
 * Warnings about one particular man (a rival is courting him, he is
 * drifting, he holds a grievance, he owes a rival's shylock) are the boss's
 * only chance to keep him: they come back sooner, because each one is about
 * somebody else (the per-man cooldown still keeps the same man from repeating).
 */
export const WARNINGS: Record<string, { cooldown: number; cap: number }> = {
  crew_courted: { cooldown: 4, cap: 5 }, drifting: { cooldown: 4, cap: 5 }, power_grievance: { cooldown: 4, cap: 5 },
  crew_debt: { cooldown: 5, cap: 5 }, crew_offer_reported: { cooldown: 5, cap: 5 },
  // Each is a different associate's name going to Philadelphia: the books only open so often.
  crew_vouch: { cooldown: 5, cap: 5 },
};

/** Is a template on the director's global cooldown or over its yearly cap? */
export function templateBlocked(s: GameState, id: string, cooldown?: number): boolean {
  if (INSTITUTIONAL.has(id)) return false;
  const rule = WARNINGS[id];
  const cd = cooldown ?? rule?.cooldown ?? TEMPLATE_COOLDOWN;
  const last = lastShown(s, id);
  if (last !== undefined && s.week - last < cd) return true;
  return shownIn(s, id, 52) >= (rule?.cap ?? YEAR_CAP);
}

/** May this candidate be shown this week? Mandatory events and chain continuations always may. */
export function allowed(s: GameState, e: EventInstance): boolean {
  if (e.mandatory || e.meta?.due) return true;
  return !templateBlocked(s, templateOf(e));
}

/**
 * Freshness multiplier for a weighted pick: never seen 4, seen long ago 1.4,
 * seen in the last half-year less (divided by how often this year), and 0 while on cooldown or over the cap.
 */
export function freshness(s: GameState, id: string): number {
  if (templateBlocked(s, id)) return 0;
  // A warning about one man is about a different man each time: it is not "the same story again".
  if (WARNINGS[id]) return 2.5;
  const last = lastShown(s, id);
  if (last === undefined) return 4;
  const n = shownIn(s, id, 52);
  const ago = s.week - last;
  const base = ago >= 26 ? 1.4 : ago >= 16 ? 0.8 : 0.45;
  return base / Math.max(1, n);
}

/** Share of each theme among popups of the last `weeks` weeks. */
export function themeShares(s: GameState, weeks = MIX_WINDOW): Record<Theme, number> {
  const out = Object.fromEntries(THEMES.map((t) => [t, 0])) as Record<Theme, number>;
  const h = s.director?.hist ?? [];
  let n = 0;
  for (let i = h.length - 1; i >= 0 && s.week - h[i][0] < weeks; i--) {
    out[h[i][2]]++;
    n++;
  }
  if (n) for (const t of THEMES) out[t] /= n;
  return out;
}

/** A multiplier (0.4 .. 1.8) that favors starved themes in a weighted pick. */
export function themeFactor(s: GameState, th: Theme, shares = themeShares(s)): number {
  const d = THEME_TARGET[th] - shares[th];
  return Math.max(0.4, Math.min(1.8, 1 + d * 4));
}

/** The pipeline's ordering score: priority, nudged by novelty and the theme mix. */
export function directorScore(s: GameState, e: EventInstance, shares = themeShares(s)): number {
  if (e.mandatory) return e.priority;
  const id = templateOf(e);
  const last = lastShown(s, id);
  const novelty = last === undefined ? 5 : Math.min(4, (s.week - last) / 8);
  const th = themeOf(e);
  const mix = Math.max(-8, Math.min(6, (THEME_TARGET[th] - shares[th]) * 30));
  return e.priority + novelty + mix;
}

/* ------------------------------------------------------------------ */
/* The pipeline hooks                                                  */
/* ------------------------------------------------------------------ */

/**
 * Order this week's candidates for the pipeline: drop non-mandatory ones the
 * director holds back, sort by score (mandatory first among equals). The
 * caller still applies MAX_POPUPS and the family cap.
 */
export function directCandidates(s: GameState, cands: EventInstance[]): EventInstance[] {
  const shares = themeShares(s);
  const ok = cands.filter((e) => allowed(s, e));
  // Never two candidates of the same non-mandatory template in one week.
  const seen = new Set<string>();
  const uniq = ok.filter((e) => {
    if (e.mandatory || e.meta?.due) return true;
    const id = templateOf(e);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const score = new Map(uniq.map((e) => [e, directorScore(s, e, shares)]));
  return uniq.sort((a, b) => score.get(b)! - score.get(a)! || Number(b.mandatory) - Number(a.mandatory));
}

/** Would adding this popup break the weekly theme cap? */
export function themeFull(e: EventInstance, chosen: readonly EventInstance[]): boolean {
  if (e.mandatory || e.meta?.due) return false;
  const th = themeOf(e);
  return chosen.filter((x) => !x.mandatory && themeOf(x) === th).length >= MAX_PER_THEME;
}

/** Record what was shown this week. */
export function recordShown(s: GameState, shown: readonly EventInstance[]): void {
  const d = director(s);
  for (const e of shown) d.hist.push([s.week, templateOf(e), themeOf(e)]);
  while (d.hist.length && s.week - d.hist[0][0] > HISTORY) d.hist.shift();
}

/**
 * Does the bagman come in person this month? The first time, about once a season
 * month, and whenever Philadelphia has reason to look the boss in the eye
 * (family heat, a short envelope last time).
 */
export function bagmanInPerson(s: GameState): boolean {
  const d = director(s);
  if (d.bagVisit === undefined) return true;
  if (s.heat.family >= 65) return true;
  if ((s.flags.bag_short ?? 0) > 0) return true;
  return s.week - d.bagVisit >= BAGMAN_VISIT_GAP;
}

export function recordTribute(s: GameState, envelope: number, inPerson: boolean): void {
  const d = director(s);
  d.tribute.push([s.week, envelope, inPerson ? 1 : 0]);
  if (d.tribute.length > 14) d.tribute.shift();
  if (inPerson) d.bagVisit = s.week;
}
