import { displayName } from './characters';
import { registerEventSource } from './events';
import { hashSeed, rand, type RngHolder } from './rng';
import { director, freshness, themeFactor, type Theme } from './storyDirector';
import { dueBeat, ensureOpening } from './openings';
import { situationById, SITUATIONS, type Cast, type LetChoice, type Situation, type Tone } from './storyletData';
import type { Choice, Effect, EventInstance, GameState } from './types';
import './sceneFamilies';

/**
 * PROCEDURAL STORYLETS: situations built from the living world.
 *
 * A storylet is SITUATION x CAST x SETTING x COMPLICATION:
 *  - the situation is read from real state (storyletData.ts): two of your
 *    men feuding over a racket you actually own, the incumbent actually up
 *    for re-election, the widow of a man who actually died, a rival's newest
 *    business, your own kid's age and school, the season's weather, last
 *    month's arrests and funerals, the books, the Senate hearings, RICO ...;
 *  - the cast are the real people involved (their names, their history);
 *  - the setting is one of ~40 places and moments, by season, never the same
 *    twice in a row;
 *  - the complication (a reporter, the Prosecutor's car, a feast day,
 *    Philadelphia already knows, a recent funeral) changes the text AND adds
 *    a small extra chip to the choices of one tone (hard, soft, sly ...).
 * Every outcome is made of existing effect chips. With ~30 situations, 2-4
 * tellings each, 40 settings and 24 complications there are tens of
 * thousands of combinations before the cast is even counted.
 *
 * One candidate a week at most; the story director holds each situation to
 * its usual template cooldown and yearly cap. Its dice are its own.
 */

export function letRng(s: GameState, salt: string): RngHolder {
  return { rng: hashSeed(`${s.seed}:${s.week}:let:${salt}`) };
}

export function pickOf<T>(h: RngHolder, xs: readonly T[]): T {
  return xs[Math.floor(rand(h) * xs.length)];
}

const seasonOf = (m: number) => (m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'fall' : m === 12 || m <= 2 ? 'winter' : 'spring');

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

interface Setting { t: string; when?: (s: GameState) => boolean }
const summer = (s: GameState) => s.date.m >= 6 && s.date.m <= 8;
const offSeason = (s: GameState) => s.date.m >= 10 || s.date.m <= 4;
const months = (...ms: number[]) => (s: GameState) => ms.includes(s.date.m);

export const LET_SETTINGS: Setting[] = [
  { t: 'Friday night at the Shamrock, the jukebox playing Bobby Rydell.' },
  { t: 'A booth at the back of the Admiral diner, the waitress refilling coffee nobody asked for.' },
  { t: 'Sunday after the ten o\'clock Mass, on the steps of St. Ann\'s.' },
  { t: 'Parked on the bay side of West Wildwood with the windows cracked.' },
  { t: 'The clubhouse at Atlantic City Race Course, the fifth race going off.', when: months(4, 5, 6, 7, 8, 9, 10) },
  { t: 'A wake on New Jersey Avenue, the men smoking on the porch.' },
  { t: 'Nardi\'s barbershop on Rio Grande Avenue, the radio on the ball game.' },
  { t: 'The boardwalk at midnight, the rides shut down and the lights still on.', when: summer },
  { t: 'The boardwalk in the off-season, plywood on every stand.', when: offSeason },
  { t: 'Under the Hunt\'s Pier, out of the wind, the tide coming in.' },
  { t: 'A restaurant in South Philadelphia with a back room and one door, and everyone watching who sits facing it.' },
  { t: 'The kitchen of the house on Glenwood Avenue, after everyone has gone to bed.' },
  { t: 'Otten\'s Harbor at dawn, the charter boats going out.' },
  { t: 'The steam room at the Hotel Dorset, the attendant sent out for towels.' },
  { t: 'The bar at the Riptide, a slow Tuesday.' },
  { t: 'A church basement in Rio Grande on bingo night.' },
  { t: 'Outside the Wildwood courthouse, where everybody pretends to wait for somebody else.' },
  { t: 'The Fourth of July on the beach, fireworks over the ocean.', when: months(7) },
  { t: 'The Feast of the Assumption, the Madonna carried down Pacific Avenue with dollar bills pinned to her ribbons.', when: months(8) },
  { t: 'Labor Day weekend, the last crowds, the stands selling off their stock.', when: months(9) },
  { t: 'A Thanksgiving week rain on Atlantic Avenue.', when: months(11) },
  { t: 'Christmas week, the lights strung across Pacific Avenue.', when: months(12) },
  { t: 'The ferry lot at Cape May, the heater running.', when: offSeason },
  { t: 'The Convention Hall fights, Friday night, the smoke hanging under the lights.' },
  { t: 'A booth at the Olympia luncheonette, under the photo of the Acropolis.' },
  { t: 'The Wildwood Elks, the bowling league crashing away downstairs.' },
  { t: 'A motel room at the Crest with the air conditioner rattling.', when: summer },
  { t: 'The Cape May County fair in Cape May Court House, the smell of fried dough and livestock.', when: months(7, 8) },
  { t: 'The parking lot of the Acme, two cars side by side.' },
  { t: 'A table at the 500 Club in Atlantic City, the late show starting.' },
  { t: 'The Inlet jetty, fishing lines out, nobody catching anything.' },
  { t: 'A front porch on Spencer Avenue, the screen door banging.' },
  { t: 'A gas station on Route 9, both men pretending to check their oil.' },
  { t: 'The high school football game under the lights, the band out of tune.', when: months(9, 10, 11) },
  { t: 'A snowbound Saturday, everybody stuck inside the Shamrock.', when: months(1, 2) },
  { t: 'The first warm Sunday of spring, the boardwalk half open.', when: months(4, 5) },
  { t: 'The back office at Kaplan\'s Hardware, among the paint cans.' },
  { t: 'A table in the back of a pizzeria on the Boardwalk, the oven roaring.' },
  { t: 'Over the phone, late, a pay phone on Ocean Avenue.' },
  { t: 'The Cold Spring cemetery on a Sunday, visiting graves.' },
];

/* ------------------------------------------------------------------ */
/* Complications                                                       */
/* ------------------------------------------------------------------ */

interface Complication {
  t: (s: GameState, k: Cast) => string;
  when?: (s: GameState, k: Cast) => boolean;
  /** An extra chip for every choice of this tone. */
  tone?: Tone;
  fx?: (s: GameState, k: Cast) => Effect;
}

const recentDeath = (s: GameState) => Object.values(s.characters).find((c) => !c.alive && c.faction === 'player' && c.death && s.week - c.death.week <= 6);

export const COMPLICATIONS: Complication[] = [
  { t: () => 'A reporter from the Wildwood Leader has already been asking about it.', tone: 'hard', fx: () => ({ type: 'heat', bar: 'local', amount: 3 }) },
  { t: () => 'The County Prosecutor\'s car has been parked across the street all week.', tone: 'sly', fx: () => ({ type: 'heat', bar: 'local', amount: 2 }) },
  { t: () => 'Philadelphia has heard about it already; Philadelphia hears everything.', tone: 'hard', fx: () => ({ type: 'heat', bar: 'family', amount: 2 }) },
  { t: () => 'Half the crew is watching to see how you handle it.', tone: 'away', fx: () => ({ type: 'respect', amount: -1 }) },
  { t: () => 'Everybody on the island will know your answer by Sunday.', tone: 'soft', fx: () => ({ type: 'respect', amount: 1 }) },
  { t: (s) => `${recentDeath(s)!.firstName} would have known what to do. Everybody is thinking it.`, when: (s) => !!recentDeath(s), tone: 'soft', fx: () => ({ type: 'crewOpinion', amount: 2, reason: 'Did right by us in a bad month' }) },
  { t: () => 'Your wife already knows, and has opinions.', when: (s) => !!s.characters[s.playerId]?.spouseId, tone: 'hard', fx: () => ({ type: 'familyOpinion', amount: -2, reason: 'Brought trouble home' }) },
  { t: () => 'Money is tight this month, and everybody knows it.', when: (s) => s.money < 12000, tone: 'money', fx: () => ({ type: 'respect', amount: 1 }) },
  { t: () => 'The papers are full of the Senate hearings, and every man on the island is looking at the man next to him.', when: (s) => s.date.y >= 1963 && s.date.y <= 1965, tone: 'sly', fx: () => ({ type: 'heat', bar: 'federal', amount: 2 }) },
  { t: () => 'Since the new federal racketeering law, every lawyer in Philadelphia says the same word: distance.', when: (s) => s.date.y >= 1971, tone: 'hard', fx: () => ({ type: 'heat', bar: 'federal', amount: 2 }) },
  { t: () => 'There is a hurricane warning on the radio, and nobody can think about anything else.', when: months(9) },
  { t: () => 'It is the week before Labor Day; nobody wants trouble until the season is counted.', when: months(8, 9), tone: 'hard', fx: () => ({ type: 'crewOpinion', amount: -1, reason: 'Made trouble in the season' }) },
  { t: () => 'It is Christmas week, and a man is supposed to be generous.', when: months(12), tone: 'soft', fx: () => ({ type: 'respect', amount: 1 }) },
  { t: () => 'A Philadelphia made man on vacation is sitting two stools down, listening.', tone: 'sly', fx: () => ({ type: 'heat', bar: 'family', amount: 2 }) },
  { t: () => 'The books in Philadelphia are closed again, and everybody is touchy about who is in and who is not.' },
  { t: () => 'Somebody has already tipped the state police, which nobody can explain.', tone: 'away', fx: () => ({ type: 'heat', bar: 'local', amount: -2 }) },
  { t: (_s, k) => `${k.rivalBoss ?? 'Atlantic City'} is said to be watching how it comes out.`, tone: 'hard', fx: (_s, k) => (k.rival ? { type: 'rivalOpinion', rival: k.rival, amount: -3, reason: 'Throws his weight around' } : { type: 'respect', amount: 1 }) },
  { t: () => 'The old-timers at the Elks say it never would have happened in the old man\'s day.', tone: 'soft', fx: () => ({ type: 'crewOpinion', amount: 0, reason: 'Soft', traitMods: { Cruel: -3, Pious: 3 } }) },
  { t: () => 'An old-timer who was at the big meeting on the Atlantic City boardwalk in 1929 says he has seen this before, and tells you how it ended.' },
  { t: () => 'The FBI has a new man in the Atlantic City office who introduces himself to everybody, which is new.', when: (s) => s.date.y >= 1962, tone: 'sly', fx: () => ({ type: 'heat', bar: 'federal', amount: 2 }) },
  { t: () => 'A priest at St. Ann\'s mentioned it, without names, in Sunday\'s sermon.', tone: 'hard', fx: () => ({ type: 'familyOpinion', amount: -1, reason: 'The priest preached about it' }) },
  { t: () => 'It has rained for a week and the whole island is short-tempered.' },
  { t: () => 'Nobody wants to be the one to say it out loud, so everybody says it twice.' },
  { t: () => 'Everybody since that gangster movie came out thinks he knows how this is supposed to go.', when: (s) => s.date.y >= 1972 },
];

/* ------------------------------------------------------------------ */
/* Building one                                                        */
/* ------------------------------------------------------------------ */

function usedOf(s: GameState, key: string): number[] {
  const d = director(s);
  return ((d.lets ??= {})[key] ??= []);
}

/** Pick an index this game has not used lately for this part (settings / complications / bodies). */
function freshIdx(s: GameState, h: RngHolder, key: string, n: number, ok: (i: number) => boolean, memory: number): number | undefined {
  const used = usedOf(s, key);
  const all = Array.from({ length: n }, (_, i) => i).filter(ok);
  if (!all.length) return undefined;
  const fresh = all.filter((i) => !used.includes(i));
  const i = pickOf(h, fresh.length ? fresh : all);
  used.push(i);
  if (used.length > memory) used.splice(0, used.length - memory);
  return i;
}

export function buildStorylet(s: GameState, sit: Situation, h: RngHolder, opts: { priority?: number; opening?: boolean } = {}): EventInstance | undefined {
  const k = sit.cast(s, h);
  if (!k) return undefined;
  const bodies = sit.body(s, k);
  const titles = sit.title(s, k);
  const bi = freshIdx(s, h, `b:${sit.id}`, bodies.length, () => true, Math.max(1, bodies.length - 1)) ?? 0;
  const si = sit.placed ? undefined : freshIdx(s, h, 'set', LET_SETTINGS.length, (i) => !LET_SETTINGS[i].when || LET_SETTINGS[i].when!(s), 30);
  const ci = freshIdx(s, h, 'cx', COMPLICATIONS.length, (i) => !COMPLICATIONS[i].when || COMPLICATIONS[i].when!(s, k), 18);
  const cx = ci === undefined ? undefined : COMPLICATIONS[ci];
  const setting = si === undefined ? '' : `${LET_SETTINGS[si].t} `;
  const label = titles[bi % titles.length];
  const raw: LetChoice[] = sit.choices(s, k, label);
  const choices: Choice[] = raw.map(({ tone, ...ch }) => {
    const extra = cx?.fx && cx.tone === tone ? [{ ...cx.fx(s, k), label } as Effect] : [];
    return { ...ch, effects: [...ch.effects.map((e) => ({ ...e, label: e.label ?? label }) as Effect), ...extra] };
  });
  return {
    iid: `ev${s.nextId++}`, defId: `let_${sit.id}`, week: s.week, mandatory: false, priority: opts.priority ?? 37,
    title: label,
    text: `${setting}${bodies[bi]}${cx ? ` ${cx.t(s, k)}` : ''}`,
    defaultChoiceId: choices[0].id, choices,
    actors: k.actors?.slice(0, 3),
    meta: { theme: sit.theme, let: sit.id, ...(k.charId ? { charId: k.charId } : {}), ...(opts.opening ? { opening: 1 } : {}), sv: `let:${sit.id}:${bi}:${si ?? '-'}:${ci ?? '-'}` },
  };
}

/** The weekly candidate. */
export function storyletSource(s: GameState): EventInstance | undefined {
  ensureOpening(s);
  if (s.week < 2) return undefined;
  const h = letRng(s, 'src');
  // The opening's beats (openings.ts) come first, in their weeks.
  const beat = dueBeat(s);
  const bs = beat ? situationById(beat) : undefined;
  if (bs && (!bs.when || bs.when(s))) {
    const ev = buildStorylet(s, bs, h, { priority: 52, opening: true });
    if (ev) return ev;
  }
  if (rand(h) > 0.6) return undefined;
  const elig = SITUATIONS.filter((x) => (!x.when || x.when(s)) && freshness(s, `let_${x.id}`) > 0);
  let total = 0;
  const w = elig.map((x) => {
    const v = x.weight * freshness(s, `let_${x.id}`) * themeFactor(s, x.theme as Theme);
    total += v;
    return v;
  });
  for (let tries = 0; tries < 3 && total > 0; tries++) {
    let r = rand(h) * total;
    let i = 0;
    while (i < elig.length - 1 && r >= w[i]) r -= w[i++];
    const ev = buildStorylet(s, elig[i], h);
    if (ev) return ev;
    total -= w[i];
    w[i] = 0;
  }
  return undefined;
}

registerEventSource(storyletSource);

/** For tests and the sim: every situation that could be told right now. */
export function situationsNow(s: GameState): Situation[] {
  return SITUATIONS.filter((x) => (!x.when || x.when(s)) && !!x.cast(s, letRng(s, `probe:${x.id}`)));
}

/** A cast's names, for the variety report. */
export function castName(s: GameState, id?: string): string {
  return id && s.characters[id] ? displayName(s.characters[id]) : '';
}

export { seasonOf };
