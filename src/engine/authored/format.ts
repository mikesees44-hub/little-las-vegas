/**
 * THE SCENE FORMAT (authored scenes): what a writer puts in /scenes/*.json.
 * Plain JSON, no code. See docs/SCENES.md for the guide with examples; the
 * validator (validate.ts) checks every field and explains what is wrong in
 * plain words, with a "did you mean" for typos.
 *
 * A file holds one scene, a list of scenes, or { "scenes": [...] }.
 */

export type SceneTheme = 'crew' | 'family' | 'romance' | 'rivals' | 'law' | 'town' | 'business' | 'world';
export const SCENE_THEMES: SceneTheme[] = ['crew', 'family', 'romance', 'rivals', 'law', 'town', 'business', 'world'];

/** A comparison written as text: "<0", ">=40", "=3", "!=0", or a bare number (meaning ">="). */
export type Compare = string | number;

export interface When {
  /** Calendar years, inclusive: [1960, 1964]. */
  years?: [number, number];
  /** "summer" = Memorial Day to Labor Day (the Season); "offseason" = the rest. */
  season?: 'summer' | 'offseason';
  /** Calendar months 1-12. */
  months?: number[];
  /** Game weeks since the start (week 1 = Memorial Day 1960). */
  week?: { min?: number; max?: number };
  /** Story flags that must be set / must not be set (set them with the "flag" effect). */
  flags?: string[];
  notFlags?: string[];
  money?: Compare;
  respect?: Compare;
  heat?: { local?: Compare; family?: Compare; federal?: Compare };
  /** The boss himself. */
  boss?: { traits?: string[]; notTraits?: string[] };
  /** A district the boss holds a stake in (influence 20+): boardwalk, pacific, piers, downtown, docks, crest, north, causeway. */
  location?: string;
  /** Once everything else holds, the chance it comes up in a week (default 1). */
  chance?: number;
  /** Weight among the other scenes that could come up (default 10). */
  weight?: number;
  /** Weeks before it may come up again (default 26). */
  cooldown?: number;
  /** Only ever once. */
  once?: boolean;
}

export type RolePool = 'crew' | 'capo' | 'family' | 'wife' | 'kin' | 'rival' | 'rivalBoss' | 'official' | 'anyone';
export const ROLE_POOLS: RolePool[] = ['crew', 'capo', 'family', 'wife', 'kin', 'rival', 'rivalBoss', 'official', 'anyone'];

export interface Role {
  /** Where to look: your crew, your capos, your house, your wife, the extended family, a rival's man, a rival boss, an official, anyone with a name. */
  pool: RolePool;
  rank?: string | string[];
  traits?: string[];
  notTraits?: string[];
  gender?: 'M' | 'F';
  /** Inclusive: [18, 40]. */
  age?: [number, number];
  /** His mood (needs a mind): content, proud, restless, angry, afraid, greedy, grieving, scheming, loyal. */
  mood?: string | string[];
  /** What he thinks of the boss: "<0", ">=40". */
  opinionOfBoss?: Compare;
  /** What he thinks of another role: { "other": "<-20" }. */
  opinionOf?: Record<string, Compare>;
  /** A standing tie with another role: { "other": "feud" } (friend, ally, rival, feud, lovers). */
  tie?: Record<string, string>;
  /** On the same side (faction) as another role: a rival boss's own man. */
  sameSideAs?: string;
}

/** One effect: an object with exactly one key (the whitelisted effect types). */
export type SEffect =
  | { money: number }
  | { respect: number }
  | { heat: { local?: number; family?: number; federal?: number } }
  | { opinion: { of: string; toward: string; by: number; why?: string } }
  | { fear: { of: string; toward: string; by: number } }
  | { trust: { of: string; toward: string; by: number } }
  | { grievance: { of: string; toward: string; by: number } }
  | { crew: { by: number; why?: string } }
  | { family: { by: number; why?: string } }
  | { flag: string }
  | { unflag: string }
  | { tie: { a: string; b: string; kind: string; why?: string } }
  | { memory: { who: string; about: string; text: string; weight: number } }
  | { wealth: { role: string; by: number } }
  | { hook: { on: string; strong?: boolean; why?: string } }
  | { owes: { who: string; to: string } }
  | { deed: { id: string; actor: string; target: string } }
  | { evidence: { role: string; by: number } }
  | { jail: { role: string; weeks: number } }
  /** The boss's own order on a man's life (only ever from a choice the player picks). */
  | { whack: { role: string; why?: string } }
  /** He gets away: runs off, out of the family (never the boss). */
  | { runs: { role: string } };

export const EFFECT_KEYS = ['money', 'respect', 'heat', 'opinion', 'fear', 'trust', 'grievance', 'crew', 'family', 'flag', 'unflag', 'tie', 'memory', 'wealth', 'hook', 'owes', 'deed', 'evidence', 'jail', 'whack', 'runs'] as const;

/** A condition for an odds bonus. */
export interface PlusIf { role?: string; trait?: string; bossTrait?: string; flag?: string; opinionOfBoss?: Compare }

export interface Odds {
  /** 0-100 (ignored when `deed` is given: the deed's own acceptance is the base). */
  base?: number;
  /** Use a deed's acceptance (with every reason): e.g. "sway", actor "boss", target "capo". */
  deed?: string;
  actor?: string;
  target?: string;
  plus?: { if: PlusIf; add: number; why: string }[];
}

export interface Next {
  scene: string;
  /** Weeks later: a number or a range [min, max] (default [1, 3]). */
  after?: number | [number, number];
  /** When it follows: always (default), only on success, only on failure. */
  on?: 'always' | 'success' | 'failure';
}

export interface SChoice {
  label: string;
  /** One line under the button. */
  hint?: string;
  requires?: { money?: number; respect?: number; favors?: number; flag?: string; trait?: string; notTrait?: string };
  odds?: Odds;
  /** Always (the up-front part when there are odds). */
  effects?: SEffect[];
  success?: SEffect[];
  failure?: SEffect[];
  /** Lines for the log and the chronicle. */
  result?: string;
  failText?: string;
  next?: Next | Next[];
}

export interface Scene {
  id: string;
  title: string;
  theme?: SceneTheme;
  /** Only comes up as somebody's `next` (a later part of a chain). */
  followup?: boolean;
  when?: When;
  who?: Record<string, Role>;
  text: string;
  choices: SChoice[];
}
