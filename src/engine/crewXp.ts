import { ageCurve, xpMult } from './aging';
import { CREW_PERK_LXP, crewPerk, FOCI, FOCUS_IDS, manMod, natureBranch, natureFocus, type Focus } from './lifestyle';
import { ageOn } from './calendar';
import { monthKey } from './calendar';
import { displayName, hasTrait, isFree } from './characters';
import { addStory } from './hierarchy';
import type { Ctx } from './ledger';
import { addOpinion, opinion, relKey } from './relations';
import { hashSeed } from './rng';
import type { Attributes, Character, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * YOUR MEN COME UP (crew XP & progression).
 *
 * Every man in the family — associates, soldiers, capos, the underboss, the
 * consigliere and the boss himself — earns experience from what he actually
 * does in the engine: the envelope he pays in full, the place he runs, the
 * jobs he goes on (a clean one teaches, a busted one teaches too: "learned
 * the hard way"), the wars he comes through, the time he does without
 * talking, the kids he brings in, New York, the trips, the lieutenants' work.
 * Every award is logged with its reason.
 *
 * Levels carry titles that fit the life (Associate → Earner → Made man →
 * Trusted → Respected → Legend; captains have their own track), a skill
 * point per level (+2 to one of the six skills) and, for made men, a
 * specialty at levels 3, 5, 7 and 9 (Bookmaker, Enforcer, Iron jaw ...)
 * with real effects in the existing systems (dirty-work odds and take, the
 * law's evidence, rats and flippers, the hustle, the corners, poaching).
 * The boss picks them (a popup when a man comes up, or on his sheet); a man
 * left waiting finds his own way after a few weeks, by his nature.
 *
 * Progression drives the drama: promotion candidates, envy between men of
 * the same standing, veterans who want recognition, a bigger end, a crew of
 * their own (bonds.ts wants), rivals who court the best men, loyalty for the
 * rewarded and danger from the slighted.
 *
 * Balance: a working soldier comes up a few times in his first year, slower
 * after. A weekly cap per man bounds a big week. Save size: the per-man log
 * keeps 8 lines and the family feed 30; the dead and the departed are pruned
 * monthly. Deterministic: no dice from the main stream (rolls are hashes of
 * the seed, the man and the week). State lives on `s.xp`, optional, created
 * by the weekly update (a load changes nothing).
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Skill = keyof Attributes;
export const XP_SKILLS: Skill[] = ['leadership', 'business', 'diplomacy', 'intrigue', 'force', 'discipline'];

export type XpPerk =
  | 'bookmaker' | 'enforcer' | 'fixer' | 'wheelman' | 'safecracker' | 'talker'
  | 'ghost' | 'ironjaw' | 'rainmaker' | 'standup' | 'taskmaster' | 'mentor';

export interface XpLog { w: number; n: number; why: string }

export interface XpMan {
  /** Lifetime experience. */
  xp: number;
  /** Level (cached; an associate is held at ASSOC_CAP until he is made). */
  lvl: number;
  /** Week of the last level. */
  at?: number;
  /** Skill points spent, per skill (each point is +2). */
  sk?: Partial<Record<Skill, number>>;
  perks?: XpPerk[];
  /** A point or a specialty has been waiting since this week (auto-pick after AUTO_WEEKS). */
  pend?: number;
  /** The last awards, newest last. */
  log?: XpLog[];
  /** This week's total so far (the weekly cap). */
  wk?: number;
  wx?: number;
  /** Last honored by the boss: recognized, a specialty chosen, promoted. */
  hon?: number;
  /** Last passed over for a lesser man. */
  slight?: number;
  /** Last asked about in a popup. */
  asked?: number;
  /** In prison since (week), for the "did his time" award. */
  jail?: number;
  /** His lifestyle focus (lifestyle.ts FOCI): picked from his nature on the first monthly pass. */
  fo?: Focus;
  /** The boss set the focus himself (a promotion does not move it). */
  fs?: 1;
  /** Lifetime lifestyle XP, and what has built toward his next perk. */
  lx?: number;
  lp?: number;
  /** The branch the boss pinned (0..2); unset: the one that fits him. */
  br?: 0 | 1 | 2;
  /** Crew perks earned (lifestyle.ts crew trees; never lost). */
  gp?: string[];
  /** Skill accumulators in hundredths: each 100 is +1 to the skill. */
  acc?: Partial<Record<Skill, number>>;
}

export type XpFeedKind = 'level' | 'perk' | 'skill' | 'envy' | 'poach' | 'slight' | 'honor' | 'loyal';
export interface XpFeed { w: number; id: string; text: string; kind: XpFeedKind }

export interface XpState {
  v: 1;
  men: Record<string, XpMan>;
  /** The boss lets every man choose for himself (no waiting). */
  auto?: boolean;
  feed: XpFeed[];
  /** Month of the last monthly pass. */
  mon?: string;
  /** Week of the last XP popup. */
  ask?: number;
  /** What grew lately (skills ticked, perks earned, a new focus): the week in brief reads it. */
  grew?: XpGrew[];
  stats: { awards: number; xp: number; levels: number; perks: number; auto: number; envy: number; poached: number; slights: number };
}

/** One line of growth: "+1 Force (Muscle)", "earned Steady Hand". */
export interface XpGrew { w: number; id: string; t: string; k: 'skill' | 'perk' | 'focus' }

export type XpOp =
  | { op: 'focus'; charId: string; focus: Focus }
  | { op: 'branch'; charId: string; branch: 0 | 1 | 2 | null }
  | { op: 'perk'; charId: string; perk: XpPerk }
  | { op: 'auto'; charId: string }
  | { op: 'point'; charId: string; skill: Skill }
  | { op: 'recognize'; charId: string };

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

/** Lifetime XP at which each level starts (index 0 = level 1). */
export const XP_AT = [0, 25, 60, 110, 175, 255, 350, 465, 600, 760];
export const MAX_LEVEL = XP_AT.length;
/** An associate comes up no further than this until he takes the oath. */
export const ASSOC_CAP = 3;
/** Levels that open a specialty (made men). */
export const PERK_LEVELS = [3, 5, 7, 9];
/** The most a man can learn in one week. */
export const WEEK_CAP = 24;
/** Weeks a point or a specialty waits for the boss before the man picks for himself. */
export const AUTO_WEEKS = 8;
/** Weeks between two XP popups, and between two about the same man. */
const ASK_GAP = 3;
const ASK_MAN_GAP = 8;
/** Recognition lasts this long in a man's mind. */
export const HONOR_WEEKS = 26;
const LOG_CAP = 8;
const FEED_CAP = 30;

/** How a man earns XP: the tooltip and the board's legend. */
export const XP_HOWTO: string[] = [
  'Paying his envelope in full, and earning above his quota.',
  'Running a place or a racket for the family.',
  'Jobs: dirty work, scores, heists, hijacks, hits. A job that goes wrong still teaches a little (the hard way).',
  'Coming through a war or a blitz; standing up under arrest; doing his time without talking.',
  'Bringing in new men; taking the oath; New York; trips; the big cases.',
  'Capos: their crew\'s envelope. The underboss and consigliere: their day-to-day calls, done well.',
];

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function fresh(): XpState {
  // Every man spends his own points by his focus (the boss can turn it off and pick himself).
  return { v: 1, men: {}, auto: true, feed: [], stats: { awards: 0, xp: 0, levels: 0, perks: 0, auto: 0, envy: 0, poached: 0, slights: 0 } };
}

export function ensureXp(s: GameState): XpState {
  if (!s.xp) s.xp = fresh();
  const x = s.xp;
  x.men ??= {};
  x.feed ??= [];
  x.stats ??= fresh().stats;
  return x;
}

/** Read-only view of a man's record (never written). */
export function xpOf(s: GameState, id: string): XpMan | undefined {
  return s.xp?.men[id];
}

/** Everyone who comes up: living members of the family (not outside guys), the boss included. */
export function tracked(s: GameState, c: Character | undefined): c is Character {
  return !!c && c.alive && c.faction === 'player' && (c.id === s.playerId || (c.rank !== 'civilian' && !c.outside));
}

function made(s: GameState, c: Character): boolean {
  return c.id === s.playerId || (c.rank !== 'associate' && c.rank !== 'civilian');
}

/** Captains and up (the leadership track). */
export function leadTrack(s: GameState, c: Character): boolean {
  return c.id === s.playerId || c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' || c.rank === 'boss';
}

/* ------------------------------------------------------------------ */
/* Levels, titles                                                      */
/* ------------------------------------------------------------------ */

/** The level a lifetime XP buys (uncapped). */
export function levelFor(xp: number): number {
  let l = 1;
  for (let i = 0; i < XP_AT.length; i++) if (xp >= XP_AT[i]) l = i + 1;
  return l;
}

/** His level as the family counts it (an associate is held at ASSOC_CAP). */
export function levelOf(s: GameState, c: Character, xp: number): number {
  const l = levelFor(xp);
  return made(s, c) ? l : Math.min(ASSOC_CAP, l);
}

export function level(s: GameState, id: string): number {
  return s.xp?.men[id]?.lvl ?? 1;
}

/** Progress toward the next level, 0..1 (1 at the top or held at the associate cap). */
export function progress(s: GameState, c: Character): { lvl: number; xp: number; from: number; to?: number; frac: number; held: boolean } {
  const m = s.xp?.men[c.id];
  const xp = m?.xp ?? 0;
  const lvl = m?.lvl ?? levelOf(s, c, xp);
  const held = !made(s, c) && levelFor(xp) >= ASSOC_CAP && lvl >= ASSOC_CAP;
  const from = XP_AT[lvl - 1];
  const to = lvl < MAX_LEVEL && !held ? XP_AT[lvl] : undefined;
  return { lvl, xp, from, to, frac: to === undefined ? 1 : Math.max(0, Math.min(1, (xp - from) / (to - from))), held };
}

const STREET_TITLES: [number, string][] = [[9, 'Legend'], [7, 'Respected'], [5, 'Trusted'], [1, 'Made man']];
const LEAD_TITLES: [number, string][] = [[9, 'Legend'], [7, 'Pillar of the family'], [5, 'Old hand'], [3, 'Skipper'], [1, 'Green captain']];
const BOSS_TITLES: [number, string][] = [[9, 'Legend'], [7, 'Don'], [5, 'Respected boss'], [3, 'The boss'], [1, 'New in the chair']];

/** The title his level carries in the life. */
export function titleOf(s: GameState, c: Character, lvl = level(s, c.id)): string {
  if (c.id === s.playerId) return BOSS_TITLES.find(([l]) => lvl >= l)![1];
  if (!made(s, c)) return lvl <= 1 ? 'Associate' : 'Earner';
  const t = leadTrack(s, c) ? LEAD_TITLES : STREET_TITLES;
  return t.find(([l]) => lvl >= l)![1];
}

/** An associate who has come as far as he can without the oath. */
export function readyToBeMade(s: GameState, c: Character): boolean {
  return c.rank === 'associate' && !c.specialty && level(s, c.id) >= ASSOC_CAP;
}

/* ------------------------------------------------------------------ */
/* Specialties                                                         */
/* ------------------------------------------------------------------ */

export interface PerkDef {
  id: XpPerk;
  name: string;
  icon: string;
  /** What it does, in plain words (with the numbers). */
  text: string;
  /** Captains and up only. */
  lead?: boolean;
  /** Not before this level. */
  minLvl?: number;
  /** Means nothing for the boss himself (no hustle, no corners, nobody courts him). */
  noBoss?: boolean;
  /** How well it fits his nature (higher first). */
  nature: (s: GameState, c: Character) => number;
}

const craftIs = (c: Character, ...k: string[]) => (c.craft ? k.includes(c.craft) : false);
const tr = (c: Character, t: Character['traits'][number], v: number) => (hasTrait(c, t) ? v : 0);

export const PERKS: Record<XpPerk, PerkDef> = {
  bookmaker: { id: 'bookmaker', name: 'Bookmaker', icon: '📒', text: 'Knows the odds and the book: his own hustle brings in 15% more.', noBoss: true, nature: (_s, c) => c.attributes.business / 2 + (craftIs(c, 'bookmaker', 'earner') ? 30 : 0) + tr(c, 'Gambler', 8) },
  enforcer: { id: 'enforcer', name: 'Enforcer', icon: '✊', text: 'People pay when he asks: +8 on muscle jobs (shakedowns, welshers, runoffs, messages).', nature: (_s, c) => c.attributes.force / 2 + (craftIs(c, 'muscle', 'collector') ? 30 : 0) + tr(c, 'Cruel', 8) + tr(c, 'Hot-headed', 6) },
  fixer: { id: 'fixer', name: 'Fixer', icon: '🤝', text: 'Knows whose palm to grease: +8 on fixes (fights, races, bids, jurors, witnesses).', nature: (_s, c) => c.attributes.diplomacy / 2 + c.attributes.intrigue / 4 + (craftIs(c, 'talker') ? 12 : 0) },
  wheelman: { id: 'wheelman', name: 'Wheelman', icon: '🚗', text: 'Fast, quiet, never lost: +8 on scores and loads (hijacks, cars, smokes, liquor).', nature: (_s, c) => c.attributes.intrigue / 4 + c.attributes.discipline / 4 + (craftIs(c, 'driver') ? 35 : 0) },
  safecracker: { id: 'safecracker', name: 'Safecracker', icon: '🔐', text: 'Good hands, patient ears: +10 on warehouse, jewel and payroll jobs.', nature: (_s, c) => c.attributes.intrigue / 3 + (craftIs(c, 'burglar') ? 35 : 0) + tr(c, 'Patient', 6) },
  talker: { id: 'talker', name: 'Smooth talker', icon: '🎩', text: 'Could sell sand on the beach: +4 on every job, +6 more on fixes.', nature: (_s, c) => c.attributes.diplomacy / 2 + (craftIs(c, 'talker') ? 30 : 0) + tr(c, 'Charming', 20) },
  ghost: { id: 'ghost', name: 'Ghost', icon: '👤', text: 'Nobody remembers seeing him: half the evidence when a job goes wrong, and the law\'s file on him fades a little every other week.', nature: (_s, c) => c.attributes.intrigue / 3 + c.attributes.discipline / 3 + tr(c, 'Paranoid', 10) },
  ironjaw: { id: 'ironjaw', name: 'Iron jaw', icon: '🤐', text: 'Never talks: picked up, he says nothing (rat odds cut to a sixth); far less likely to flip at trial.', noBoss: true, nature: (_s, c) => c.attributes.discipline / 2 + tr(c, 'Loyal-to-a-fault', 25) + tr(c, 'Honest', 6) - tr(c, 'Cowardly', 40) },
  rainmaker: { id: 'rainmaker', name: 'Rainmaker', icon: '💰', text: 'Money finds him: +10% on every take he brings in (jobs and hustle).', minLvl: 5, nature: (_s, c) => c.attributes.business / 2 + (craftIs(c, 'earner') ? 15 : 0) + tr(c, 'Greedy', 6) },
  standup: { id: 'standup', name: 'Stand-up guy', icon: '🛡', text: 'A man of his word: the other families can\'t court him, and he thinks a little better of the boss every month.', noBoss: true, nature: (s, c) => c.attributes.discipline / 3 + tr(c, 'Loyal-to-a-fault', 30) + opinion(s, c.id, s.playerId) / 3 },
  taskmaster: { id: 'taskmaster', name: 'Taskmaster', icon: '⏱', text: 'Runs his corners tight: his district\'s take is 8% bigger.', lead: true, noBoss: true, nature: (_s, c) => c.attributes.leadership / 2 + c.attributes.business / 4 },
  mentor: { id: 'mentor', name: 'Mentor', icon: '🎓', text: 'Brings the young ones along: the men in his crew learn 25% faster.', lead: true, noBoss: true, nature: (_s, c) => c.attributes.leadership / 3 + c.attributes.diplomacy / 3 + tr(c, 'Patient', 10) },
};
export const PERK_IDS = Object.keys(PERKS) as XpPerk[];

export function hasPerk(s: GameState, c: Character | string | undefined, p: XpPerk): boolean {
  const id = typeof c === 'string' ? c : c?.id;
  return !!id && !!s.xp?.men[id]?.perks?.includes(p);
}

/** Specialties he has earned so far (made men: one at each of PERK_LEVELS). */
export function perkSlots(s: GameState, c: Character): number {
  if (!made(s, c)) return 0;
  const l = level(s, c.id);
  return PERK_LEVELS.filter((x) => x <= l).length;
}

export function perksOpen(s: GameState, c: Character): number {
  return Math.max(0, perkSlots(s, c) - (s.xp?.men[c.id]?.perks?.length ?? 0));
}

export function pointsOpen(s: GameState, c: Character): number {
  const m = s.xp?.men[c.id];
  if (!m) return 0;
  const spent = Object.values(m.sk ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  return Math.max(0, m.lvl - 1 - spent);
}

/** Why he can't take this specialty (undefined = he can). */
export function perkBlock(s: GameState, c: Character, p: XpPerk): string | undefined {
  const d = PERKS[p];
  if (!d) return 'Unknown';
  if (hasPerk(s, c, p)) return 'Already his';
  if (d.lead && !leadTrack(s, c)) return 'Captains and up';
  if (d.noBoss && c.id === s.playerId) return 'Not for the boss';
  if (d.minLvl && level(s, c.id) < d.minLvl) return `Level ${d.minLvl}`;
  if (!perksOpen(s, c)) return made(s, c) ? 'No specialty open: he comes up at levels 3, 5, 7, 9' : 'Made men only';
  return undefined;
}

/** The specialties that fit him, best first. */
export function suggestPerks(s: GameState, c: Character): XpPerk[] {
  return PERK_IDS.filter((p) => {
    const d = PERKS[p];
    return !hasPerk(s, c, p) && !(d.lead && !leadTrack(s, c)) && !(d.noBoss && c.id === s.playerId) && !(d.minLvl && level(s, c.id) < d.minLvl);
  }).sort((a, b) => PERKS[b].nature(s, c) - PERKS[a].nature(s, c) || (a < b ? -1 : 1));
}

/** The skill a point goes to when he picks for himself. */
export function natureSkill(s: GameState, c: Character): Skill {
  const m = s.xp?.men[c.id];
  const byCraft: Record<string, [Skill, Skill]> = {
    muscle: ['force', 'discipline'], earner: ['business', 'diplomacy'], driver: ['intrigue', 'force'], bookmaker: ['business', 'intrigue'],
    collector: ['force', 'business'], burglar: ['intrigue', 'discipline'], talker: ['diplomacy', 'business'],
  };
  let pair: [Skill, Skill];
  if (leadTrack(s, c)) pair = c.rank === 'consigliere' ? ['diplomacy', 'intrigue'] : ['leadership', 'business'];
  else if (c.craft && byCraft[c.craft]) pair = byCraft[c.craft];
  else {
    const best = [...XP_SKILLS].sort((a, b) => c.attributes[b] - c.attributes[a] || (a < b ? -1 : 1));
    pair = [best[0], best[1]];
  }
  const a = m?.sk?.[pair[0]] ?? 0;
  const b = m?.sk?.[pair[1]] ?? 0;
  return a <= b * 2 && c.attributes[pair[0]] < 100 ? pair[0] : pair[1];
}

/* ------------------------------------------------------------------ */
/* Earning XP                                                          */
/* ------------------------------------------------------------------ */

function man(s: GameState, id: string): XpMan {
  const x = ensureXp(s);
  const c = s.characters[id];
  return (x.men[id] ??= { xp: 0, lvl: c ? levelOf(s, c, 0) : 1 });
}

function feed(s: GameState, id: string, text: string, kind: XpFeedKind): void {
  const x = ensureXp(s);
  x.feed.push({ w: s.week, id, text, kind });
  if (x.feed.length > FEED_CAP) x.feed = x.feed.slice(-FEED_CAP);
}

/** How fast he learns (old age, his nature, his capo the mentor). */
export function learnRate(s: GameState, c: Character): number {
  let m = xpMult(s, c);
  if (hasTrait(c, 'Ambitious')) m *= 1.1;
  if (hasTrait(c, 'Drinker')) m *= 0.9;
  const k = c.capoId ? s.characters[c.capoId] : undefined;
  if (k?.alive && hasPerk(s, k, 'mentor')) m *= 1.25;
  return m;
}

/**
 * Give a man experience, with the reason (the one entry point: other systems
 * call this). Returns what he actually got after his rate and the weekly cap.
 */
export function grantXp(s: GameState, charId: string, amount: number, reason: string): number {
  const c = s.characters[charId];
  if (!tracked(s, c) || !(amount > 0)) return 0;
  const m = man(s, charId);
  if (m.wk !== s.week) { m.wk = s.week; m.wx = 0; }
  const want = Math.max(1, Math.round(amount * learnRate(s, c)));
  const n = Math.min(want, WEEK_CAP - (m.wx ?? 0));
  if (n <= 0) return 0;
  m.wx = (m.wx ?? 0) + n;
  m.xp += n;
  const log = (m.log ??= []);
  const last = log[log.length - 1];
  if (last && last.w === s.week && last.why === reason) last.n += n;
  else log.push({ w: s.week, n, why: reason });
  if (log.length > LOG_CAP) m.log = log.slice(-LOG_CAP);
  const x = ensureXp(s);
  x.stats.awards++;
  x.stats.xp += n;
  // What he does along his focus teaches the focus too (half of it).
  if (m.fo && charId !== s.playerId && deedFocus(reason) === m.fo) addLxp(s, c, m, Math.round(n / 2));
  settle(s, c, m);
  return n;
}

/** Which focus a deed teaches (by the award's reason). */
export function deedFocus(reason: string): Focus | undefined {
  const r = reason.toLowerCase();
  if (/crew's envelope|running a crew|brought in|short envelope/.test(r)) return 'leadership';
  if (/envelope|quota|ran |worked his corner/.test(r)) return 'money';
  if (/heist|piece of work|scheme|big case/.test(r)) return 'brains';
  if (/calls|family's business|trip|recognized/.test(r)) return 'diplomacy';
  if (/job|bones|war|pinch|empty on|picked up|did his time/.test(r)) return 'muscle';
  return undefined;
}

/** Bring his level up to date with his XP (and his rank: the oath lifts the associate's cap). */
function settle(s: GameState, c: Character, m: XpMan): void {
  const to = levelOf(s, c, m.xp);
  if (to <= m.lvl) { if (to < m.lvl) m.lvl = to; return; }
  const x = ensureXp(s);
  const oldTitle = titleOf(s, c, m.lvl);
  const from = m.lvl;
  m.lvl = to;
  m.at = s.week;
  x.stats.levels += to - from;
  const title = titleOf(s, c, to);
  const opened = PERK_LEVELS.some((l) => l > from && l <= to) && made(s, c);
  const name = c.id === s.playerId ? 'You' : displayName(c);
  const text = `${name} came up to level ${to}${title !== oldTitle ? `: ${title}` : ''}${opened ? ' — a specialty to pick' : ''}.`;
  feed(s, c.id, text, 'level');
  if (c.id !== s.playerId) addStory(s, c, `Came up to level ${to} (${title}).`);
  if (title !== oldTitle) s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${name} ${c.id === s.playerId ? 'are' : 'is'} ${/^[AEIOU]/.test(title) ? 'an' : 'a'} ${title.toLowerCase()} now.`, kind: 'misc' });
  if (m.pend === undefined && (pointsOpen(s, c) > 0 || perksOpen(s, c) > 0)) m.pend = s.week;
}

/* ---- Hooks the other systems call (each one line at its source) ---- */

const DIRTY_XP: Record<string, number> = { clean: 10, messy: 7, bust: 3, pinched: 3 };

/** Dirty work (dirtyWork.ts commitDirty): the job, how it went, whether he talked. */
export function dirtyXp(s: GameState, charId: string, title: string, outcome: 'clean' | 'messy' | 'bust' | 'pinched', rat: boolean, big = false): void {
  const base = DIRTY_XP[outcome] + (big ? 4 : 0);
  const job = title.toLowerCase();
  const why = outcome === 'clean' ? `A clean job: ${job}` : outcome === 'messy' ? `Pulled off ${job}, messy` : outcome === 'bust' ? `Came up empty on ${job} (the hard way)` : `Picked up on ${job} (the hard way)`;
  grantXp(s, charId, base, why);
  if (outcome === 'pinched' && !rat) grantXp(s, charId, 6, 'Took the pinch and said nothing');
}

/** A hit or a heist resolved (bones.ts bonesFromScheme): every man on it. */
export function schemeXp(s: GameState, kind: string, agentIds: readonly string[], success: boolean): void {
  const hit = kind === 'murder';
  for (const id of agentIds) {
    if (success) grantXp(s, id, hit ? 18 : 16, hit ? 'Was on the team for a piece of work' : 'Pulled off a heist');
    else grantXp(s, id, 5, hit ? 'A piece of work that fell apart (the hard way)' : 'A heist that went wrong (the hard way)');
  }
}

/** A prospect's bones job (bones.ts). */
export function bonesXp(s: GameState, charId: string, job: string, outcome: 'clean' | 'froze' | 'talked' | 'hothead'): void {
  if (outcome === 'froze') grantXp(s, charId, 3, `Froze on the ${job} (the hard way)`);
  else grantXp(s, charId, outcome === 'clean' ? 14 : 8, `Made his bones on the ${job}`);
}

/** A delegated decision on one of the big cases (missions.ts). */
export function missionXp(s: GameState, charId: string | undefined, label: string, ok: boolean): void {
  if (!charId) return;
  grantXp(s, charId, ok ? 10 : 3, ok ? `Handled it on the big case: ${label.toLowerCase()}` : `Fumbled it on the big case (the hard way): ${label.toLowerCase()}`);
}

/* ------------------------------------------------------------------ */
/* Perk effects (read by the existing systems)                         */
/* ------------------------------------------------------------------ */

const MUSCLE = new Set(['shakedown', 'welsher', 'runoff', 'breakgame', 'beating', 'hit']);
const SAFE = new Set(['warehouse', 'jewel', 'payroll']);

/** Extra reasons on a dirty job's odds: his specialty and his experience. */
export function xpJobOdds(s: GameState, c: Character | undefined, job: string, tile: string): { label: string; value: number }[] {
  if (!c || !s.xp?.men[c.id]) return [];
  const out: { label: string; value: number }[] = [];
  const l = level(s, c.id);
  const vet = Math.min(5, Math.max(0, l - 2));
  if (vet) out.push({ label: `His experience (level ${l})`, value: vet });
  if (hasPerk(s, c, 'enforcer') && (tile === 'muscle' || MUSCLE.has(job))) out.push({ label: 'Enforcer', value: 8 });
  if (hasPerk(s, c, 'fixer') && tile === 'fixes') out.push({ label: 'Fixer', value: 8 });
  if (hasPerk(s, c, 'wheelman') && (tile === 'scores' || tile === 'goods') && !SAFE.has(job)) out.push({ label: 'Wheelman', value: 8 });
  if (hasPerk(s, c, 'safecracker') && SAFE.has(job)) out.push({ label: 'Safecracker', value: 10 });
  if (hasPerk(s, c, 'talker')) out.push({ label: 'Smooth talker', value: tile === 'fixes' ? 10 : 4 });
  // His crew perks (lifestyle.ts FOCI), each with its own line.
  const add = (label: string, v: number) => { if (v) out.push({ label, value: v }); };
  add('His craft (perks)', manMod(s, c, 'jobs'));
  if (tile === 'muscle' || MUSCLE.has(job)) add('His muscle (perks)', manMod(s, c, 'muscleJobs'));
  if (tile === 'fixes') add('His connections (perks)', manMod(s, c, 'fixJobs'));
  if (tile === 'scores' || tile === 'goods' || SAFE.has(job)) add('His eye for a score (perks)', manMod(s, c, 'scoreJobs'));
  return out;
}

/** His chance to talk when he is picked up (Iron jaw). */
export function xpRatMult(s: GameState, c: Character | undefined): number {
  return (c && hasPerk(s, c, 'ironjaw') ? 1 / 6 : 1) * (1 - Math.min(90, manMod(s, c, 'rat')) / 100);
}

/** Evidence on him when a job goes wrong (Ghost). */
export function xpEvidenceMult(s: GameState, c: Character | undefined): number {
  return (c && hasPerk(s, c, 'ghost') ? 0.5 : 1) * (1 - Math.min(80, manMod(s, c, 'evidence')) / 100);
}

/** The take of a job he brings in (Rainmaker). */
export function xpTakeMult(s: GameState, c: Character | undefined): number {
  return (c && hasPerk(s, c, 'rainmaker') ? 1.1 : 1) * (1 + manMod(s, c, 'take') / 100);
}

/** His own hustle (Bookmaker, Rainmaker). */
export function xpHustleMult(s: GameState, c: Character | undefined): number {
  if (!c || !s.xp?.men[c.id]) return 1;
  return (hasPerk(s, c, 'bookmaker') ? 1.15 : 1) * (hasPerk(s, c, 'rainmaker') ? 1.1 : 1) * (1 + manMod(s, c, 'hustle') / 100);
}

/** A capo's district take (Taskmaster). */
export function xpCornersMult(s: GameState, capo: Character | undefined): number {
  return (capo && hasPerk(s, capo, 'taskmaster') ? 1.08 : 1) * (1 + manMod(s, capo, 'corners') / 100);
}

/** Reasons on a man's odds of flipping at trial (trialCase.ts). */
export function xpFlipReasons(s: GameState, c: Character): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  if (!s.xp?.men[c.id]) return out;
  if (hasPerk(s, c, 'ironjaw')) out.push({ label: 'Iron jaw: never talks', value: -0.25 });
  const fl = manMod(s, c, 'flip');
  if (fl) out.push({ label: 'He plays the long game (perks)', value: -fl / 100 });
  const l = level(s, c.id);
  if (l >= 5 && honored(s, c)) out.push({ label: `A ${titleOf(s, c).toLowerCase()} the boss looks after`, value: -0.05 });
  if (slighted(s, c)) out.push({ label: 'A veteran the boss slighted', value: 0.06 });
  return out;
}

/** How much more a rival wants him (poachScore in crewEvents.ts): the best men, unrewarded. */
export function xpPoachBonus(s: GameState, c: Character): number {
  if (!s.xp?.men[c.id]) return 0;
  if (hasPerk(s, c, 'standup')) return -999;
  const l = level(s, c.id);
  const less = manMod(s, c, 'poach');
  if (less) return xpPoachBase(s, c, l) - less;
  return xpPoachBase(s, c, l);
}

function xpPoachBase(s: GameState, c: Character, l: number): number {
  if (l < 4) return 0;
  if (honored(s, c)) return (l - 3) * 2 - 10;
  return (l - 3) * 5 + (slighted(s, c) ? 10 : 0);
}

/* ------------------------------------------------------------------ */
/* Standing: honored, slighted, wants                                  */
/* ------------------------------------------------------------------ */

/** The boss honored him lately (a word in front of the others, his specialty, a promotion). */
export function honored(s: GameState, c: Character): boolean {
  const m = s.xp?.men[c.id];
  return m?.hon !== undefined && s.week - m.hon <= HONOR_WEEKS;
}

/** A veteran (level 5+) left without a word for half a year since he came up, or passed over for a lesser man. */
export function slighted(s: GameState, c: Character): boolean {
  const m = s.xp?.men[c.id];
  if (!m || c.id === s.playerId) return false;
  if (m.slight !== undefined && s.week - m.slight <= HONOR_WEEKS) return true;
  if (m.lvl < 5) return false;
  const since = Math.max(m.hon ?? -999, m.at ?? 0);
  return s.week - since > HONOR_WEEKS;
}

/** What a man who has come up wants from the boss (bonds.ts wants, his sheet). */
export function xpWants(s: GameState, c: Character): { key: string; text: string; met: boolean }[] {
  const m = s.xp?.men[c.id];
  if (!m || c.id === s.playerId || c.faction !== 'player' || m.lvl < 5) return [];
  const t = titleOf(s, c);
  const out = [{ key: 'xp-recognition', text: `Recognition: he is ${/^[AEIOU]/.test(t) ? 'an' : 'a'} ${t.toLowerCase()} now, and wants the others to hear you say it`, met: honored(s, c) }];
  if (m.lvl >= 6 && (c.rank === 'soldier' || c.rank === 'associate')) out.push({ key: 'xp-end', text: 'A bigger end: let him keep more of what he earns', met: c.policy === 'earn' });
  if (m.lvl >= 7 && c.rank === 'soldier') out.push({ key: 'xp-crew', text: 'A crew of his own', met: false });
  if (m.lvl >= 6 && c.rank === 'capo') out.push({ key: 'xp-end', text: 'A bigger end of his district', met: (c.keep ?? 0.3) >= 0.35 });
  return out;
}

/** Who is ready for more. */
export function promotionCandidates(s: GameState): { make: Character[]; capo: Character[] } {
  const men = Object.values(s.characters).filter((c) => tracked(s, c) && c.id !== s.playerId && isFree(s, c) && !c.specialty);
  const by = (a: Character, b: Character) => level(s, b.id) - level(s, a.id) || (s.xp?.men[b.id]?.xp ?? 0) - (s.xp?.men[a.id]?.xp ?? 0) || (a.id < b.id ? -1 : 1);
  return {
    make: men.filter((c) => readyToBeMade(s, c)).sort(by),
    capo: men.filter((c) => c.rank === 'soldier' && level(s, c.id) >= 5).sort(by),
  };
}

/* ------------------------------------------------------------------ */
/* The boss's word: picks, points, recognition                         */
/* ------------------------------------------------------------------ */

function applyPerk(s: GameState, c: Character, p: XpPerk, auto: boolean): boolean {
  if (perkBlock(s, c, p)) return false;
  const m = man(s, c.id);
  (m.perks ??= []).push(p);
  if (!auto) m.hon = s.week;
  const x = ensureXp(s);
  x.stats.perks++;
  if (auto) x.stats.auto++;
  const name = c.id === s.playerId ? 'You' : displayName(c);
  feed(s, c.id, auto ? `${name} found his own way: ${PERKS[p].name}.` : `${name}: ${PERKS[p].name}. ${PERKS[p].text}`, 'perk');
  if (c.id !== s.playerId) addStory(s, c, `Known now as a${/^[AEIOU]/.test(PERKS[p].name) ? 'n' : ''} ${PERKS[p].name.toLowerCase()}.`);
  if (!auto && c.id !== s.playerId) addOpinion(s, c.id, s.playerId, 'The boss knows what I am good at', 4, 1);
  clearPend(s, c, m);
  return true;
}

function applyPoint(s: GameState, c: Character, k: Skill): boolean {
  if (pointsOpen(s, c) <= 0 || c.attributes[k] >= 100) return false;
  const m = man(s, c.id);
  (m.sk ??= {})[k] = (m.sk[k] ?? 0) + 1;
  c.attributes[k] = Math.min(100, c.attributes[k] + 2);
  clearPend(s, c, m);
  return true;
}

function clearPend(s: GameState, c: Character, m: XpMan): void {
  if (pointsOpen(s, c) <= 0 && perksOpen(s, c) <= 0) delete m.pend;
}

/** He picks for himself, by his nature: the open points and the open specialties. */
export function autoSpend(s: GameState, c: Character): void {
  for (let i = 0; i < 12 && pointsOpen(s, c) > 0; i++) if (!applyPoint(s, c, natureSkill(s, c))) break;
  for (let i = 0; i < 4 && perksOpen(s, c) > 0; i++) {
    const p = suggestPerks(s, c)[0];
    if (!p || !applyPerk(s, c, p, true)) break;
  }
}

function recognize(s: GameState, c: Character): boolean {
  if (c.id === s.playerId || !tracked(s, c)) return false;
  const m = man(s, c.id);
  if (m.hon !== undefined && s.week - m.hon < 8) return false;
  m.hon = s.week;
  delete m.slight;
  addOpinion(s, c.id, s.playerId, 'The boss recognized me in front of the others', 2 + Math.min(8, m.lvl), 1);
  grantXp(s, c.id, 2, 'Recognized by the boss');
  feed(s, c.id, `You recognized ${displayName(c)} in front of the others.`, 'honor');
  return true;
}

/** Why the boss can't recognize him now. */
export function recognizeBlock(s: GameState, c: Character): string | undefined {
  if (c.id === s.playerId || !tracked(s, c)) return 'Not one of your men';
  const m = s.xp?.men[c.id];
  if (m?.hon !== undefined && s.week - m.hon < 8) return `You did, in week ${m.hon}: too often and it means nothing`;
  return undefined;
}

/** Apply an op inside the week (popup choices). */
export function applyXpOp(ctx: Ctx, o: XpOp): void {
  const s = ctx.s;
  const c = s.characters[o.charId];
  if (!tracked(s, c)) return;
  switch (o.op) {
    case 'focus': applyFocus(s, c, o.focus); break;
    case 'branch': applyBranch(s, c, o.branch); break;
    case 'perk': applyPerk(s, c, o.perk, false); break;
    case 'auto': autoSpend(s, c); break;
    case 'point': applyPoint(s, c, o.skill); break;
    case 'recognize': recognize(s, c); break;
  }
}

export function describeXpOp(s: GameState, o: XpOp): string | undefined {
  const c = s.characters[o.charId];
  if (!c) return undefined;
  switch (o.op) {
    case 'focus': return `${c.firstName} turns to ${FOCI[o.focus].name}`;
    case 'branch': return o.branch === null ? `${c.firstName} follows his nature` : `${c.firstName}: ${FOCI[focusOf(s, c)].branches[o.branch].name}`;
    case 'perk': return `${c.firstName}: ${PERKS[o.perk].name}`;
    case 'auto': return `${c.firstName} picks for himself`;
    case 'point': return `${c.firstName}: +2 ${o.skill}`;
    case 'recognize': return `${c.firstName} hears it from you`;
  }
}

/** A new state with this man's record (and him) copied, changed by `f` (the UI's pure edits). */
function withMan(s: GameState, id: string, f: (t: GameState, c: Character) => boolean): GameState {
  const c0 = s.characters[id];
  if (!tracked(s, c0)) return s;
  const x0 = s.xp ?? fresh();
  const m0 = x0.men[id];
  const x: XpState = { ...x0, men: { ...x0.men }, feed: x0.feed.slice(), stats: { ...x0.stats } };
  if (m0) x.men[id] = { ...m0, ...(m0.sk ? { sk: { ...m0.sk } } : {}), ...(m0.perks ? { perks: m0.perks.slice() } : {}), ...(m0.log ? { log: m0.log.slice() } : {}), ...(m0.gp ? { gp: m0.gp.slice() } : {}), ...(m0.acc ? { acc: { ...m0.acc } } : {}) };
  if (x0.grew) x.grew = x0.grew.slice();
  const c: Character = { ...c0, attributes: { ...c0.attributes }, ...(c0.story ? { story: c0.story.slice() } : {}) };
  // Opinions change on a recognition or a pick (his of the boss): that relation gets its own copy.
  const relations = { ...s.relations };
  const k = relKey(id, s.playerId);
  const r = relations[k];
  if (r) relations[k] = { ...r, modifiers: r.modifiers.map((md) => ({ ...md })) };
  const t: GameState = { ...s, xp: x, characters: { ...s.characters, [id]: c }, chronicle: s.chronicle.slice(), relations };
  return f(t, c) ? t : s;
}

/** The boss picks his specialty (pure: a new state). */
export function pickPerk(s: GameState, id: string, p: XpPerk): GameState {
  return withMan(s, id, (t, c) => applyPerk(t, c, p, false));
}

/** The boss puts a point into a skill (pure). */
export function spendPoint(s: GameState, id: string, k: Skill): GameState {
  return withMan(s, id, (t, c) => applyPoint(t, c, k));
}

/** Let him pick for himself now (pure). */
export function letHimChoose(s: GameState, id: string): GameState {
  return withMan(s, id, (t, c) => { autoSpend(t, c); return true; });
}

/** A word from the boss in front of the others (pure). */
export function recognizeMan(s: GameState, id: string): GameState {
  return withMan(s, id, (t, c) => recognize(t, c));
}

/** The family-wide rule: every man picks for himself as soon as he comes up (pure). */
export function setAutoPick(s: GameState, on: boolean): GameState {
  const x0 = s.xp ?? fresh();
  return { ...s, xp: { ...x0, auto: on || undefined } };
}

/* ------------------------------------------------------------------ */
/* Passive growth: the focus, lifestyle XP, skills and perks (CK-style) */
/* ------------------------------------------------------------------ */

const GREW_CAP = 40;
/** Hundredths of a skill point per lifestyle XP: the focus skill, and the second one. */
const ACC_MAIN = 100 / 180;
const ACC_SECOND = 100 / 540;

function grew(s: GameState, id: string, t: string, k: XpGrew['k']): void {
  const x = ensureXp(s);
  (x.grew ??= []).push({ w: s.week, id, t, k });
  if (x.grew.length > GREW_CAP) x.grew = x.grew.slice(-GREW_CAP);
}

/** His focus (set, or what his nature would pick: never written by a read). */
export function focusOf(s: GameState, c: Character): Focus {
  return s.xp?.men[c.id]?.fo ?? natureFocus(s, c);
}

/** The branch his next perk comes from: the pinned one, else the one that fits him; a finished branch hands on to the next. */
export function nextBranch(s: GameState, c: Character, m: XpMan | undefined = s.xp?.men[c.id]): 0 | 1 | 2 | undefined {
  const f = m?.fo ?? natureFocus(s, c);
  const have = new Set(m?.gp ?? []);
  const first = m?.br ?? natureBranch(s, c, f);
  for (let i = 0; i < 3; i++) {
    const b = ((first + i) % 3) as 0 | 1 | 2;
    if (FOCI[f].branches[b].perks.some((p) => !have.has(p.id))) return b;
  }
  return undefined;
}

/** The next crew perk he will earn (undefined: the tree is done). */
export function nextCrewPerk(s: GameState, c: Character): { id: string; name: string; text: string; branch: number } | undefined {
  const m = s.xp?.men[c.id];
  const b = nextBranch(s, c, m);
  if (b === undefined) return undefined;
  const f = m?.fo ?? natureFocus(s, c);
  const have = new Set(m?.gp ?? []);
  const p = FOCI[f].branches[b].perks.find((x) => !have.has(x.id))!;
  return { id: p.id, name: p.name, text: p.text, branch: b };
}

/** The newest crew perk he earned. */
export function newestCrewPerk(s: GameState, id: string): { id: string; name: string } | undefined {
  const g = s.xp?.men[id]?.gp;
  const p = g?.length ? crewPerk(g[g.length - 1]) : undefined;
  return p ? { id: p.id, name: p.name } : undefined;
}

function earnCrewPerk(s: GameState, c: Character, m: XpMan): boolean {
  const nx = nextCrewPerk(s, c);
  if (!nx) return false;
  (m.gp ??= []).push(nx.id);
  const p = crewPerk(nx.id)!;
  // One of the twelve old specialties: it is his specialty too (every hasPerk() reads it).
  if (p.xp && !(m.perks ??= []).includes(p.xp)) { m.perks.push(p.xp); clearPend(s, c, m); }
  ensureXp(s).stats.perks++;
  grew(s, c.id, `earned ${p.name}`, 'perk');
  return true;
}

function addLxp(s: GameState, c: Character, m: XpMan, n: number): void {
  if (!(n > 0)) return;
  m.lx = (m.lx ?? 0) + n;
  m.lp = (m.lp ?? 0) + n;
  const f = FOCI[m.fo ?? natureFocus(s, c)];
  const acc = (m.acc ??= {});
  const tick = (k: Skill, per: number) => {
    acc[k] = Math.round((acc[k] ?? 0) + n * per);
    while ((acc[k] ?? 0) >= 100) {
      acc[k]! -= 100;
      if (c.attributes[k] >= 100) { acc[k] = 0; break; }
      c.attributes[k] = Math.min(100, c.attributes[k] + 1);
      grew(s, c.id, `+1 ${k[0].toUpperCase()}${k.slice(1)} (${f.name})`, 'skill');
    }
  };
  tick(f.skill, ACC_MAIN);
  tick(f.second, ACC_SECOND);
  for (let i = 0; i < 3 && (m.lp ?? 0) >= CREW_PERK_LXP; i++) {
    if (!earnCrewPerk(s, c, m)) { m.lp = Math.min(m.lp!, CREW_PERK_LXP); break; }
    m.lp! -= CREW_PERK_LXP;
  }
}

/** His lifestyle XP this month (before it is added): focus skill, his age, his mind, his capo. */
export function monthlyLxp(s: GameState, c: Character): number {
  const m = s.xp?.men[c.id];
  const f = FOCI[m?.fo ?? natureFocus(s, c)];
  const age = c.birth ? ageOn(c.birth, s.date) : 30;
  const curve = ageCurve(age);
  if (!curve) return 0;
  const k = c.capoId ? s.characters[c.capoId] : undefined;
  const km = k ? s.xp?.men[k.id] : undefined;
  const mentor = k?.alive && (hasPerk(s, k, 'mentor') || (km?.fo === f.id && (km.lvl ?? 1) >= 5)) ? 4 : 0;
  const learn = k?.alive ? manMod(s, k, 'crewLxp') / 100 : 0;
  return Math.max(0, Math.round((8 + 0.4 * c.attributes[f.skill] + mentor) * curve * xpMult(s, c) * (1 + learn)));
}

/**
 * The monthly growth pass (xpWeek, once a month): every man but the boss
 * gets a focus if he has none (his nature), a captain who never had his
 * focus set leads, and the month's lifestyle XP ticks his skills and earns
 * his perks. No popups: the week in brief lists what grew.
 */
export function growthMonth(ctx: Ctx, men: Character[]): void {
  const s = ctx.s;
  for (const c of men) {
    if (c.id === s.playerId) continue;
    const m = man(s, c.id);
    if (!m.fo) { m.fo = natureFocus(s, c); grew(s, c.id, `took up ${FOCI[m.fo].name}`, 'focus'); }
    else if (!m.fs && m.fo !== 'leadership' && (c.rank === 'capo' || c.rank === 'underboss')) { m.fo = 'leadership'; delete m.br; grew(s, c.id, 'leads now: Leadership', 'focus'); }
    addLxp(s, c, m, monthlyLxp(s, c));
    // His perks at work on people: the men's opinions, month by month.
    const lb = manMod(s, c, 'loyalBoss');
    if (lb) addOpinion(s, c.id, s.playerId, 'Growing into the life', lb, 0.5);
    const crewMen = c.rank === 'capo' ? men.filter((x) => x.capoId === c.id && x.id !== c.id) : [];
    const cl = manMod(s, c, 'crewLoyal');
    const pop = manMod(s, c, 'popular');
    for (const x of crewMen) {
      if (cl) addOpinion(s, x.id, s.playerId, `${c.firstName} speaks well of the boss`, cl, 0.5);
      if (pop) addOpinion(s, x.id, c.id, 'A good man to work for', pop, 0.5);
    }
  }
}

/** The boss sets a man's focus (pure). Matching his nature pleases him a little; going against it, the opposite. */
export function setFocus(s: GameState, id: string, f: Focus): GameState {
  return withMan(s, id, (t, c) => applyFocus(t, c, f));
}

/** Pin the branch his next perks come from (null: let him follow his nature) (pure). */
export function pinBranch(s: GameState, id: string, b: 0 | 1 | 2 | null): GameState {
  return withMan(s, id, (t, c) => applyBranch(t, c, b));
}

function applyFocus(s: GameState, c: Character, f: Focus): boolean {
  if (c.id === s.playerId || !FOCUS_IDS.includes(f)) return false;
  const m = man(s, c.id);
  if (m.fo === f && m.fs) return false;
  const nat = natureFocus(s, c);
  m.fo = f;
  m.fs = 1;
  delete m.br;
  addOpinion(s, c.id, s.playerId, f === nat ? 'The boss sees what I am good at' : 'The boss wants me to be something I am not', f === nat ? 3 : -3, 1);
  grew(s, c.id, `turned to ${FOCI[f].name}, on your word`, 'focus');
  return true;
}

function applyBranch(s: GameState, c: Character, b: 0 | 1 | 2 | null): boolean {
  if (c.id === s.playerId) return false;
  const m = man(s, c.id);
  if (b === null) delete m.br; else m.br = b;
  return true;
}

/** What grew since a week (newest last), for the week in brief. */
export function grewSince(s: GameState, week: number): XpGrew[] {
  return (s.xp?.grew ?? []).filter((g) => g.w >= week);
}

/* ------------------------------------------------------------------ */
/* The weekly pass                                                     */
/* ------------------------------------------------------------------ */

function roll(s: GameState, key: string): number {
  return (hashSeed(`${s.seed}:xp:${key}:${s.week}`) % 10000) / 10000;
}

/**
 * Weekly (engine.ts, after the money is in): the observed awards (the
 * envelope, the places, the lieutenants, wars, prison, recruits, the oath,
 * New York, trips), the auto-picks, and once a month the drama.
 * `before` is the week as the player left it (to see what changed).
 */
export function xpWeek(ctx: Ctx, before?: GameState): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const x = ensureXp(s);
  // The dead and the departed are forgotten.
  for (const id of Object.keys(x.men)) if (!tracked(s, s.characters[id])) delete x.men[id];
  const men = Object.values(s.characters).filter((c) => tracked(s, c));
  for (const c of men) settle(s, c, man(s, c.id));

  // 1. The envelope: paid in full, above his quota; a capo's crew in full.
  const rep = s.tribute?.reports.find((r) => r.week === s.week);
  const paidIn = new Set<string>();
  if (rep) {
    for (const ml of [...rep.direct, ...rep.crews.flatMap((cl) => cl.members)]) {
      if (ml.kind === 'capo' || paidIn.has(ml.id)) continue;
      const c = s.characters[ml.id];
      if (!tracked(s, c)) continue;
      paidIn.add(ml.id);
      if (ml.due > 0 && ml.paid >= ml.due) grantXp(s, c.id, 1, 'Paid his envelope in full');
      else if (ml.due > 0 && ml.paid < ml.due) continue;
      const quota = (c.rank === 'soldier' ? 32 : 18) * 1.35;
      if (ml.earned >= quota) grantXp(s, c.id, 1, 'Earned above his quota');
    }
    for (const cl of rep.crews) {
      const k = s.characters[cl.capoId];
      if (!tracked(s, k) || cl.due <= 0) continue;
      if (cl.short <= 0) grantXp(s, k.id, 3, 'His crew\'s envelope came in full');
      else if (s.week % 4 === 0) grantXp(s, k.id, 1, 'A short envelope (the hard way)');
    }
  } else {
    for (const c of men) if ((c.lastEarn ?? 0) > 0 && c.rank !== 'capo' && c.id !== s.playerId) grantXp(s, c.id, 1, 'Worked his corner');
  }

  // 2. Running a place or a racket.
  const ran = new Set<string>();
  for (const b of s.businesses) {
    if (b.owner !== 'player' || (b.closedUntil ?? 0) > s.week) continue;
    for (const id of b.staffIds ?? []) {
      if (ran.has(id)) continue;
      ran.add(id);
      grantXp(s, id, 2, `Ran ${b.name}`);
    }
  }

  // 3. The lieutenants' work this week.
  const ltWeek: Record<string, { good: number; done: number; failed: number }> = {};
  for (const e of s.briefing?.lt?.log ?? []) {
    if (e.week !== s.week) continue;
    const w = (ltWeek[e.byId] ??= { good: 0, done: 0, failed: 0 });
    if (e.result === 'done') { if (e.good) w.good++; else w.done++; } else if (e.result === 'failed') w.failed++;
  }
  for (const [id, w] of Object.entries(ltWeek)) {
    // Several calls a week: the week's work counts once (at most 5).
    if (w.good) grantXp(s, id, Math.min(4, 2 + w.good), 'Good calls on the family\'s business');
    else if (w.done) grantXp(s, id, 2, 'Saw to the family\'s business');
    if (w.failed) grantXp(s, id, 1, 'A call that didn\'t take (the hard way)');
  }

  // 4. War: the men who stand with the family; the ones who come through.
  const atWar = s.wars.length > 0 || !!s.power?.blitzes?.some((b) => !b.stopped && (b.attacker === 'player' || b.defender === 'player'));
  if (atWar) for (const c of men) if (c.rank !== 'associate' && isFree(s, c)) grantXp(s, c.id, 2, 'Stood with the family in a war');
  if (before) {
    const ended = before.wars.filter((w) => !s.wars.some((v) => v.id === w.id));
    for (const w of ended) {
      const r = s.rivals.find((y) => y.id === w.rival);
      for (const c of men) if (c.rank !== 'associate' && isFree(s, c)) grantXp(s, c.id, 8, `Came through the war with ${r?.shortName ?? 'them'}`);
    }
  }

  // 5. Prison: doing his time without talking.
  for (const c of men) {
    if (c.id === s.playerId) continue;
    const m = man(s, c.id);
    const inside = !isFree(s, c);
    if (inside) {
      if (m.jail === undefined) m.jail = s.week;
      else if ((s.week - m.jail) % 4 === 0 && c.informantFor !== 'law') grantXp(s, c.id, 1, 'Doing his time quietly');
    } else if (m.jail !== undefined) {
      const served = s.week - m.jail;
      delete m.jail;
      if (c.informantFor !== 'law') grantXp(s, c.id, 5 + Math.min(12, Math.floor(served / 4)), `Did his time (${served} weeks) and kept his mouth shut`);
    }
  }

  // 6. Recruits, the oath, promotions (and who was passed over).
  if (before) {
    for (const c of men) {
      const b = before.characters[c.id];
      if ((!b || b.faction !== 'player' || b.rank === 'civilian') && c.vouchedBy && c.id !== s.playerId) {
        const v = s.characters[c.vouchedBy];
        if (tracked(s, v)) grantXp(s, v.id, 4, `Brought in ${c.firstName} ${c.lastName}`);
      }
      if (!b || b.faction !== 'player' || c.id === s.playerId) continue;
      const up = RANK_UP[c.rank] > RANK_UP[b.rank];
      if (!up) continue;
      const m = man(s, c.id);
      m.hon = s.week;
      delete m.slight;
      grantXp(s, c.id, b.rank === 'associate' ? 10 : 8, b.rank === 'associate' ? 'Took the oath' : `Promoted to ${c.rank}`);
      settle(s, c, m);
      passedOver(ctx, c, b.rank);
    }
  }

  // 7. New York: the crews that work a neighborhood there.
  for (const nc of s.nyc?.crews ?? []) {
    grantXp(s, nc.capoId, 2, 'Running a crew in New York');
    for (const id of nc.soldiers) grantXp(s, id, 1, 'Working New York');
  }

  // 8. Trips home this week.
  if (before) {
    for (const t of s.travel?.trips ?? []) {
      if (!t.over || before.travel?.trips.find((y) => y.id === t.id)?.over) continue;
      for (const id of [t.leaderId, ...t.party, ...t.driverIds]) if (id !== s.playerId) grantXp(s, id, 3, `Back from the trip to ${t.destId}`);
    }
  }

  // 9. The boss himself: running the family, and the town's respect.
  if (isFree(s, s.characters[s.playerId])) grantXp(s, s.playerId, 1, 'Ran the family another week');
  if (before && s.respect > before.respect) grantXp(s, s.playerId, Math.min(4, Math.ceil(s.respect - before.respect)), 'The town respects you more');

  // 10. Ghosts: the file fades.
  if (s.week % 2 === 0) for (const c of men) if (hasPerk(s, c, 'ghost') && (c.evidence ?? 0) > 0) c.evidence = Math.max(0, (c.evidence ?? 0) - 1);

  // 11. The ones left waiting pick for themselves.
  for (const c of men) {
    const m = x.men[c.id];
    if (!m || (pointsOpen(s, c) <= 0 && perksOpen(s, c) <= 0)) { if (m) delete m.pend; continue; }
    m.pend ??= s.week;
    // Associates' points and the skill points of men the boss never looks at go by their nature.
    const waited = s.week - m.pend >= AUTO_WEEKS;
    if (x.auto || waited) {
      autoSpend(s, c);
      if (waited && !x.auto && c.id !== s.playerId) ctx.log.push(`${displayName(c)} waited for your word and picked for himself.`);
    } else if (!made(s, c)) {
      // An associate has no specialty to wait for: his points go where his nature takes him.
      for (let i = 0; i < 4 && pointsOpen(s, c) > 0; i++) if (!applyPoint(s, c, natureSkill(s, c))) break;
      clearPend(s, c, m);
    }
  }

  // 12. Monthly: the drama.
  const mk = monthKey(s.date);
  if (x.mon !== mk) {
    if (x.mon !== undefined) monthly(ctx, men);
    growthMonth(ctx, men);
    x.mon = mk;
  }
}

const RANK_UP: Record<Character['rank'], number> = { civilian: 0, associate: 1, soldier: 2, capo: 3, consigliere: 4, underboss: 4, boss: 5 };

/** A promotion: the peers of higher standing who were passed over take it hard. */
function passedOver(ctx: Ctx, c: Character, fromRank: Character['rank']): void {
  const s = ctx.s;
  // (Raw XP: an associate's level is held until he is made, his years are not.)
  const xc = s.xp?.men[c.id]?.xp ?? 0;
  const xpOfP = (p: Character) => s.xp?.men[p.id]?.xp ?? 0;
  const peers = Object.values(s.characters)
    .filter((p) => tracked(s, p) && p.id !== c.id && p.id !== s.playerId && p.rank === fromRank && !p.specialty && isFree(s, p) && xpOfP(p) >= XP_AT[3] && xpOfP(p) > xc * 1.25 + 10)
    .sort((a, b) => xpOfP(b) - xpOfP(a) || (a.id < b.id ? -1 : 1))
    .slice(0, 2);
  for (const p of peers) {
    const m = man(s, p.id);
    m.slight = s.week;
    const hit = -(3 + level(s, p.id));
    addOpinion(s, p.id, s.playerId, 'Passed over for a lesser man', hit, 1);
    addOpinion(s, p.id, c.id, 'Got what should have been mine', -6, 1);
    ensureXp(s).stats.slights++;
    feed(s, p.id, `${displayName(p)} (level ${level(s, p.id)}) watched ${c.firstName} go up ahead of him. He won't forget it.`, 'slight');
    ctx.log.push(`${displayName(p)} was passed over when ${displayName(c)} went up. He has more years in.`);
  }
}

function monthly(ctx: Ctx, men: Character[]): void {
  const s = ctx.s;
  const x = ensureXp(s);
  const boss = s.playerId;
  // Veterans: loyal when rewarded, dangerous when slighted; a stand-up guy thinks better of you.
  for (const c of men) {
    if (c.id === boss) continue;
    const l = level(s, c.id);
    if (hasPerk(s, c, 'standup')) addOpinion(s, c.id, boss, 'A man of his word', 1, 0.5);
    if (l < 5) continue;
    if (honored(s, c)) addOpinion(s, c.id, boss, 'The boss knows what I am worth', 2, 1);
    else if (slighted(s, c)) {
      addOpinion(s, c.id, boss, 'Years of work and not a word from the boss', -2, 1);
      if (roll(s, `grumble:${c.id}`) < 0.25) feed(s, c.id, `${displayName(c)} has been heard saying the boss doesn't know what he's got.`, 'slight');
    }
  }
  // Envy: two men of the same standing in the same crew, one honored, the other not.
  let envy = 0;
  const made = men.filter((c) => c.id !== boss && (c.rank === 'soldier' || c.rank === 'capo') && isFree(s, c) && level(s, c.id) >= 4)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (let i = 0; i < made.length && envy < 1; i++) {
    for (let j = 0; j < made.length && envy < 1; j++) {
      const a = made[i];
      const b = made[j];
      if (a === b || Math.abs(level(s, a.id) - level(s, b.id)) > 1) continue;
      const sameCrew = a.rank === 'capo' ? b.rank === 'capo' : a.capoId !== undefined && a.capoId === b.capoId;
      if (!sameCrew) continue;
      const ma = x.men[a.id];
      // a was honored lately (in the last two months), b not in half a year.
      if (!ma || ma.hon === undefined || s.week - ma.hon > 8 || honored(s, b)) continue;
      if (roll(s, `envy:${b.id}:${a.id}`) >= 0.45) continue;
      addOpinion(s, b.id, a.id, 'Thinks he is better than me', -6, 1);
      addOpinion(s, b.id, boss, 'The boss plays favorites', -2, 1);
      feed(s, b.id, `${displayName(b)} resents ${displayName(a)}: same years in, and only one of them hears it from the boss.`, 'envy');
      ctx.log.push(`Bad blood: ${displayName(b)} resents the attention ${displayName(a)} is getting.`);
      x.stats.envy++;
      envy++;
    }
  }
  // Rivals court the best men nobody rewards.
  const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  if (mobs.length) {
    const prey = men
      .filter((c) => c.id !== boss && !c.dynasty && !c.courtedBy && isFree(s, c) && (c.rank === 'soldier' || c.rank === 'associate') && !hasTrait(c, 'Loyal-to-a-fault') && !hasPerk(s, c, 'standup')
        && level(s, c.id) >= 6 && !honored(s, c) && opinion(s, c.id, boss) < 40)
      .sort((a, b) => level(s, b.id) - level(s, a.id) || (a.id < b.id ? -1 : 1))[0];
    if (prey && roll(s, `poach:${prey.id}`) < (slighted(s, prey) ? 0.3 : 0.15)) {
      const r = mobs[hashSeed(`${s.seed}:xp:who:${prey.id}:${s.week}`) % mobs.length];
      prey.courtedBy = { rival: r.id as RivalId, week: s.week };
      addOpinion(s, prey.id, r.leaderId, 'They know what I am worth', 8, 1);
      addStory(s, prey, `${r.name} came courting: they had heard what he can do.`);
      feed(s, prey.id, `${r.shortName} is courting ${displayName(prey)} — the best men get offers.`, 'poach');
      ctx.log.push(`[${r.shortName}] They're courting ${displayName(prey)}: word of a ${titleOf(s, prey).toLowerCase()} gets around.`);
      x.stats.poached++;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The popup: "Sonny made his bones — pick his specialty"              */
/* ------------------------------------------------------------------ */

/** The man the popup would ask about this week (exported for tests and the board). */
export function askAbout(s: GameState): Character | undefined {
  const x = s.xp;
  if (!x || x.auto) return undefined;
  return Object.values(s.characters)
    .filter((c) => tracked(s, c) && isFree(s, c) && perksOpen(s, c) > 0 && s.week - (x.men[c.id]?.asked ?? -99) >= ASK_MAN_GAP)
    .sort((a, b) => level(s, b.id) - level(s, a.id) || (a.id < b.id ? -1 : 1))[0];
}

export function buildPerkEvent(s: GameState, c: Character): EventInstance {
  const m = s.xp?.men[c.id];
  const first = !(m?.perks?.length);
  const isBoss = c.id === s.playerId;
  const t = titleOf(s, c);
  const sug = suggestPerks(s, c).slice(0, 3);
  const label = `${c.firstName}'s specialty`;
  const fx = (o: XpOp): Effect[] => [{ type: 'crewxp', op: o, label } as Effect];
  const choices: EventInstance['choices'] = sug.map((p) => ({
    id: p, label: `${PERKS[p].icon} ${PERKS[p].name}`, detail: PERKS[p].text, because: `made ${c.firstName} a${/^[AEIOU]/.test(PERKS[p].name) ? 'n' : ''} ${PERKS[p].name.toLowerCase()}`, effects: fx({ op: 'perk', charId: c.id, perk: p }),
  }));
  if (!isBoss) choices.push({ id: 'own', label: 'Let him find his own way', detail: `He goes where his nature takes him (${sug[0] ? PERKS[sug[0]].name : 'his best'}).`, because: `let ${c.firstName} pick for himself`, effects: fx({ op: 'auto', charId: c.id }) });
  choices.push({ id: 'later', label: 'Not now', detail: `Decide on his sheet; after ${AUTO_WEEKS} weeks he picks for himself.`, because: `put off ${c.firstName}'s specialty`, effects: [] });
  const title = isBoss ? 'You have come up — pick your specialty' : first && c.rank === 'soldier' ? `${c.firstName} made his bones — pick his specialty` : `${c.firstName} has come up — what is he known for now?`;
  const text = isBoss
    ? `Level ${level(s, c.id)}: ${t}. Years in the life teach a man what he is good at.`
    : `${displayName(c)} is level ${level(s, c.id)} now — ${/^[AEIOU]/.test(t) ? 'an' : 'a'} ${t.toLowerCase()}. The men talk about what he does best; say it, and it is his. A man whose boss names his gift remembers it.`;
  return {
    iid: `ev${s.nextId++}`, defId: 'xp_perk', title, text, week: s.week, mandatory: false, priority: 26,
    meta: { charId: c.id }, actors: [c.id], choices, defaultChoiceId: sug[0] ?? 'later',
  };
}

/** Event source (engine.ts registers it): at most one XP popup every few weeks. */
export function xpEventSource(s: GameState): EventInstance | undefined {
  const x = s.xp;
  if (!x || x.auto || s.week - (x.ask ?? -99) < ASK_GAP) return undefined;
  const c = askAbout(s);
  if (!c || !suggestPerks(s, c).length) return undefined;
  x.ask = s.week;
  man(s, c.id).asked = s.week;
  return buildPerkEvent(s, c);
}

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

export interface BoardRow {
  c: Character;
  lvl: number;
  xp: number;
  title: string;
  frac: number;
  next?: number;
  earn: number;
  loyalty: number;
  perks: XpPerk[];
  open: { points: number; perks: number };
  ready?: 'made' | 'capo';
  honored: boolean;
  slighted: boolean;
  last?: XpLog;
}

export type BoardSort = 'level' | 'earning' | 'loyalty';

/** "Your men": every man with his level, what he earns and what he thinks of you. */
export function board(s: GameState, sort: BoardSort = 'level'): BoardRow[] {
  const cand = promotionCandidates(s);
  const rows = Object.values(s.characters).filter((c) => tracked(s, c)).map((c): BoardRow => {
    const p = progress(s, c);
    const m = s.xp?.men[c.id];
    return {
      c, lvl: p.lvl, xp: p.xp, title: titleOf(s, c, p.lvl), frac: p.frac, next: p.to, earn: c.lastEarn ?? 0,
      loyalty: c.id === s.playerId ? 100 : opinion(s, c.id, s.playerId), perks: m?.perks ?? [],
      open: { points: pointsOpen(s, c), perks: perksOpen(s, c) },
      ready: cand.make.includes(c) ? 'made' : cand.capo.includes(c) ? 'capo' : undefined,
      honored: honored(s, c), slighted: slighted(s, c), last: m?.log?.[m.log.length - 1],
    };
  });
  const key = (r: BoardRow) => (sort === 'earning' ? r.earn : sort === 'loyalty' ? r.loyalty : r.lvl * 100000 + r.xp);
  return rows.sort((a, b) => key(b) - key(a) || (a.c.id < b.c.id ? -1 : 1));
}
