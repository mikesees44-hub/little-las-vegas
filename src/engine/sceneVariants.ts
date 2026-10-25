import { ageOn, seasonMultiplier } from './calendar';
import { displayName, player } from './characters';
import { hashSeed, rand, type RngHolder } from './rng';
import { director } from './storyDirector';
import type { Character, Choice, EventInstance, GameState } from './types';

/**
 * SCENE VARIANTS: the same situation is never told the same way twice.
 *
 * A recurring popup (the bagman, a rival's proposition, a sponsor's kid who
 * wants to make his bones, Sunday dinner, a man drifting...) belongs to a
 * FAMILY of scenes: different places (a diner, the church steps, the pier,
 * a car, the racetrack, a wake, a barbershop), different speakers drawn from
 * the people actually involved, different stakes, and text that reads the
 * current state (season, weather, a war, the heat, who died lately, the
 * man's history with you). When a popup is shown, the family picks a scene
 * this game has NOT shown yet; only when every scene that fits has been used
 * does the family start over.
 *
 * Families live in sceneFamilies.ts (they register themselves); the crew's
 * own decisions get a setting from a shared pool so that no two read alike.
 * Choices keep their ids and effects (the sim, the chips and the odds stay
 * honest); a scene may relabel them, scale a deal's money a little, or add
 * one extra answer built from existing effect chips.
 */

export type Season = 'summer' | 'fall' | 'winter' | 'spring';

/** What a scene can read about the world right now. */
export interface SceneCtx {
  s: GameState;
  ev: EventInstance;
  boss: Character;
  /** The man the popup is about (meta.charId, else the first actor). */
  who?: Character;
  season: Season;
  /** True in the summer season (Memorial Day to Labor Day, roughly). */
  summer: boolean;
  month: number;
  year: number;
  /** One short weather phrase for the month ("a nor'easter coming up the coast"). */
  weather: string;
  /** Local + federal heat, coarse. */
  heat: 'quiet' | 'warm' | 'hot';
  /** A mob rival you are at war or feuding with, by short name. */
  war?: string;
  /** The most recent death among your people (last 10 weeks). */
  dead?: { name: string; first: string; weeks: number };
  /** How many times this family has been shown this game before. */
  times: number;
  /** The scene's own dice (seeded, never the engine's stream). */
  h: RngHolder;
}

export interface Scene {
  /** May this scene be told now? */
  when?: (c: SceneCtx) => boolean;
  title: (c: SceneCtx) => string;
  text: (c: SceneCtx) => string;
  /** Relabel / re-detail choices by id, scale money, or add an answer. */
  choices?: (c: SceneCtx, choices: Choice[]) => Choice[];
}

export interface Family {
  id: string;
  /** Which popups belong to the family. */
  match: (ev: EventInstance) => boolean;
  scenes: Scene[];
  /** Rebuild the whole popup from the scene (title, text and choices) instead of just retelling it. */
  rebuild?: boolean;
}

const FAMILIES: Family[] = [];

export function registerFamily(f: Family): void {
  if (!FAMILIES.some((x) => x.id === f.id)) FAMILIES.push(f);
}

export function familyOf(ev: EventInstance): Family | undefined {
  return FAMILIES.find((f) => f.match(ev));
}

export function allFamilies(): readonly Family[] {
  return FAMILIES;
}

/* ------------------------------------------------------------------ */
/* The world, read for a scene                                         */
/* ------------------------------------------------------------------ */

const WEATHER: Record<number, string[]> = {
  1: ['ice on the bay and a wind that cuts', 'snow on the boardwalk planks, nobody on them'],
  2: ['a gray February rain that never quite stops', 'frost on every windshield on Pacific Avenue'],
  3: ['a raw March wind off the ocean', 'the first thaw, the gutters running'],
  4: ['an April shower that chases everybody under the awnings', 'the first warm afternoon of the year'],
  5: ['the first real beach weather', 'fog coming in off the water by four'],
  6: ['a June evening that smells like suntan oil and fried dough', 'a thunderstorm rolling in from the bay side'],
  7: ['a July heat wave, the tar soft on the streets', 'a hot night, every window on the island open'],
  8: ['August, humid enough to wring out the air', 'a heat lightning night out over the ocean'],
  9: ['a September blow, the flags straight out on the piers', 'a hurricane warning on the radio'],
  10: ['a clear October day, the island emptying out', 'leaves blowing down Atlantic Avenue'],
  11: ["a nor'easter coming up the coast", 'a cold November rain'],
  12: ['Christmas lights on the shuttered stands', 'a December wind that rattles the boarded-up windows'],
};

function seasonOf(m: number): Season {
  return m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'fall' : m === 12 || m <= 2 ? 'winter' : 'spring';
}

export function sceneRng(s: GameState, salt: string): RngHolder {
  return { rng: hashSeed(`${s.seed}:${s.week}:${s.nextId}:${salt}`) };
}

export function pickWith<T>(h: RngHolder, xs: readonly T[]): T {
  return xs[Math.floor(rand(h) * xs.length)];
}

function recentDeath(s: GameState): SceneCtx['dead'] {
  let best: Character | undefined;
  for (const c of Object.values(s.characters)) {
    if (c.alive || !c.death || s.week - c.death.week > 10 || (c.faction !== 'player' && !c.dynasty)) continue;
    if (!best || c.death.week > best.death!.week) best = c;
  }
  return best ? { name: displayName(best), first: best.firstName, weeks: s.week - best.death!.week } : undefined;
}

export function sceneCtx(s: GameState, ev: EventInstance, family: string): SceneCtx {
  const m = s.date.m;
  const h = sceneRng(s, `${family}:${ev.iid}`);
  const charId = ev.meta?.charId ? String(ev.meta.charId) : ev.actors?.[0];
  const war = s.rivals.find((r) => r.kind === 'mob' && (r.war || r.feud) && s.characters[r.leaderId]?.alive);
  const hv = s.heat.local + s.heat.federal;
  return {
    s, ev, boss: player(s), who: charId ? s.characters[charId] : undefined,
    season: seasonOf(m), summer: seasonMultiplier(s.date) > 1, month: m, year: s.date.y,
    weather: pickWith(h, WEATHER[m] ?? WEATHER[6]),
    heat: hv >= 90 ? 'hot' : hv >= 45 ? 'warm' : 'quiet',
    war: war?.shortName,
    dead: recentDeath(s),
    times: (director(s).scenes?.[family] ?? []).length + (director(s).scenes?.[`${family}#cycles`]?.[0] ?? 0),
    h,
  };
}

/** "He" or "she" for a character. */
export const he = (c?: Character) => (c?.gender === 'F' ? 'she' : 'he');
export const his = (c?: Character) => (c?.gender === 'F' ? 'her' : 'his');
export const age = (s: GameState, c: Character) => ageOn(c.birth, s.date);
export const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/* ------------------------------------------------------------------ */
/* Choosing and applying a scene                                       */
/* ------------------------------------------------------------------ */

/** Pick a scene of the family this game has not shown yet (that fits now); start the cycle over only when all are used. */
export function chooseScene(s: GameState, fam: Family, c: SceneCtx): number | undefined {
  const d = director(s);
  const scenes = (d.scenes ??= {});
  const used = new Set(scenes[fam.id] ?? []);
  const fits = fam.scenes.map((sc, i) => [sc, i] as const).filter(([sc]) => !sc.when || sc.when(c));
  if (!fits.length) return undefined;
  let fresh = fits.filter(([, i]) => !used.has(i));
  if (!fresh.length) {
    // Every scene that fits has been told: start the cycle again (the ones that never fit stay "unused").
    scenes[fam.id] = (scenes[fam.id] ?? []).filter((i) => !fits.some(([, j]) => j === i));
    scenes[`${fam.id}#cycles`] = [(scenes[`${fam.id}#cycles`]?.[0] ?? 0) + fits.length];
    fresh = fits;
  }
  const [, idx] = pickWith(c.h, fresh);
  (scenes[fam.id] ??= []).push(idx);
  return idx;
}

/** Retell one popup as a fresh scene of its family. Returns true if it was dressed. */
export function dressScene(s: GameState, ev: EventInstance): boolean {
  if (ev.meta?.scene !== undefined && typeof ev.meta.scene === 'string') return false;
  const fam = familyOf(ev);
  if (!fam) return false;
  const c = sceneCtx(s, ev, fam.id);
  const idx = chooseScene(s, fam, c);
  if (idx === undefined) return false;
  const sc = fam.scenes[idx];
  try {
    const title = sc.title(c);
    const text = sc.text(c);
    const choices = sc.choices ? sc.choices(c, ev.choices) : ev.choices;
    ev.title = title;
    ev.text = text;
    ev.choices = choices;
    if (!ev.choices.some((x) => x.id === ev.defaultChoiceId)) ev.defaultChoiceId = ev.choices[0].id;
  } catch {
    // A scene that cannot be told with what is on the table keeps the original telling.
    return false;
  }
  ev.meta = { ...(ev.meta ?? {}), scene: `${fam.id}:${idx}` };
  return true;
}

/** The pipeline hook: dress every popup shown this week. */
export function dressScenes(s: GameState, out: EventInstance[]): void {
  for (const ev of out) dressScene(s, ev);
}

/** Relabel choices by id (label/detail/because), keeping their effects. */
export function relabel(choices: Choice[], map: Record<string, { label?: string; detail?: string; because?: string }>): Choice[] {
  return choices.map((ch) => (map[ch.id] ? { ...ch, ...Object.fromEntries(Object.entries(map[ch.id]).filter(([, v]) => v !== undefined)) } : ch));
}

/** Scale the money of one choice (a better or worse offer this time), rounded to $100. */
export function scaleMoney(choices: Choice[], id: string, k: number): Choice[] {
  return choices.map((ch) => (ch.id !== id ? ch : {
    ...ch,
    effects: ch.effects.map((e) => (e.type === 'money' ? { ...e, amount: Math.round((e.amount * k) / 100) * 100 } : e)),
  }));
}
