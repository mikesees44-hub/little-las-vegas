/**
 * LITTLE LAS VEGAS — EVENT CONTENT PACK · SCHEMA
 *
 * A neutral, engine-agnostic description of story events. Every event is
 * plain JSON-serializable data: no functions, no engine imports. The small
 * helper constructors at the bottom of this file only build those objects
 * so the content files stay readable; the exported arrays are pure data.
 *
 * Calendar note (matches src/engine/calendar.ts): week 1 = Memorial Day,
 * Monday 30 May 1960. "summer" = Memorial Day..Labor Day (the Season).
 *
 * Text placeholders (resolved by the integrator):
 *   {<role>.name}      full name, e.g. "Vito Scarpa"
 *   {<role>.first}     first name
 *   {<role>.last}      last name
 *   {<role>.nickname}  nickname, falling back to first name
 *   {<role>.call}      first name + quoted nickname if any: Vito "the Clam"
 *   {<role>.boss}      (rival-pool roles) name of that faction's leader
 *   {<role>.org}       (rival-pool roles) faction display name
 *   {player.*}         the boss (always defined, no role entry needed)
 *   {district}         the event's district (trigger.district, else the
 *                      actor's district, else a district the player holds)
 *   {house}            the player's house name (surname)
 */

/* ------------------------------------------------------------------ */
/* Vocabulary (mirrors src/engine/types.ts, duplicated to stay neutral) */
/* ------------------------------------------------------------------ */

export type Category =
  | 'crew' | 'family' | 'rivals' | 'law' | 'town' | 'season' | 'history' | 'vice'
  | 'table' | 'romance-nonexplicit' | 'church' | 'politics' | 'boardwalk';

export type Rank = 'boss' | 'underboss' | 'consigliere' | 'capo' | 'soldier' | 'associate' | 'civilian';

export type Trait =
  | 'Greedy' | 'Hot-headed' | 'Patient' | 'Ambitious' | 'Loyal-to-a-fault' | 'Paranoid' | 'Pious'
  | 'Womanizer' | 'Gambler' | 'Honest' | 'Cruel' | 'Cowardly' | 'Charming' | 'Vengeful' | 'Drinker';

export type HeatBar = 'local' | 'family' | 'federal';
export type RivalId = 'manno' | 'feldstein' | 'kessler' | 'philly' | 'law';
export type DistrictId = 'boardwalk' | 'pacific' | 'piers' | 'downtown' | 'docks' | 'crest' | 'north' | 'causeway';
export type SecretKind = 'affair' | 'skimming' | 'informant' | 'drugs' | 'debt' | 'murder' | 'bastard' | 'plot';
export type BusinessKind =
  | 'restaurant' | 'pizza' | 'stand' | 'motel' | 'bar' | 'construction' | 'vending' | 'laundromat' | 'carlot'
  | 'arcade' | 'boarding' | 'club' | 'numbers' | 'bookmaking' | 'loansharking' | 'cardgame' | 'fencing';

export interface YM { y: number; m: number }

/* ------------------------------------------------------------------ */
/* Trigger: when may this event fire? All present fields must hold.    */
/* ------------------------------------------------------------------ */

export interface Trigger {
  /** Only fires when scheduled by a `followup` effect (chain parts 2+). */
  chainOnly?: boolean;
  /** Fires at most once per campaign. */
  once?: boolean;
  /** Shorthand: the `actor` role must hold this rank / have this trait. */
  rank?: Rank | Rank[];
  trait?: Trait;
  /** The boss himself must have this trait. */
  playerTrait?: Trait;
  season?: 'summer' | 'offseason';
  /** Calendar months (1-12) in which it may fire. */
  months?: number[];
  minWeek?: number;
  maxWeek?: number;
  /** Inclusive calendar window (history events). */
  between?: { from: YM; to: YM };
  heatAbove?: Partial<Record<HeatBar, number>>;
  heatBelow?: Partial<Record<HeatBar, number>>;
  moneyAbove?: number;
  respectAbove?: number;
  respectBelow?: number;
  /** Rival faction's leader must be alive. */
  rivalAlive?: RivalId;
  /** The player must own at least one business of this kind. */
  hasBusiness?: BusinessKind;
  /** District the event is about (binds {district}). */
  district?: DistrictId;
  /** Flags set by earlier `flag` effects. */
  flag?: string;
  notFlag?: string;
  /** Relative weight in the random pool (default 10). Ignored for chainOnly. */
  weight?: number;
  /** Weeks before it may fire again (default 26; once-events ignore). */
  cooldownWeeks?: number;
  /** Must be shown, cannot be dismissed (history beats, chain climaxes). */
  mandatory?: boolean;
}

/* ------------------------------------------------------------------ */
/* Roles: who is in the scene                                          */
/* ------------------------------------------------------------------ */

export type RolePool =
  /** A member of the player's organisation. */
  | 'crew'
  /** A member of the player's house (relation picks who). */
  | 'family'
  /** A man of a rival faction (`faction`; `leader` = its boss). */
  | 'rival'
  /** A fictional official: cop, judge, commissioner, clerk ... */
  | 'official'
  /** A townsperson; generated from `spawn` if no fitting NPC exists. */
  | 'town'
  /** Same character who held this role key earlier in the chain. */
  | 'chain';

export type Relation = 'spouse' | 'heir' | 'child' | 'daughter' | 'son' | 'sibling' | 'sister' | 'parent' | 'mother' | 'father' | 'nephew';

export interface Spawn {
  first?: string;
  last?: string;
  nickname?: string;
  gender?: 'M' | 'F';
  ethnicity?: 'Italian' | 'Irish' | 'Jewish';
  age?: [number, number];
  traits?: Trait[];
  rank?: Rank;
  faction?: RivalId | 'player' | 'none';
  office?: string;
}

export interface RoleSpec {
  /** Human-readable casting note, e.g. "a capo with trait Greedy". */
  desc: string;
  pool: RolePool;
  rank?: Rank | Rank[];
  trait?: Trait;
  notTrait?: Trait;
  relation?: Relation;
  faction?: RivalId;
  leader?: boolean;
  office?: string;
  gender?: 'M' | 'F';
  age?: [number, number];
  /** Must belong to the same capo's regime as this other role key. */
  sameRegimeAs?: string;
  /** Must be a different person from these role keys. */
  notRole?: string[];
  /** Create this person if nobody fits (always used for pool 'town'). */
  spawn?: Spawn;
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

export type Fx =
  | { k: 'money'; amount: number }
  | { k: 'respect'; amount: number }
  | { k: 'heat'; bar: HeatBar; amount: number }
  /** Change `role`'s opinion of `toward` (default: the player). */
  | { k: 'opinion'; role: string; amount: number; toward?: string }
  | { k: 'crewOpinion'; amount: number }
  | { k: 'familyOpinion'; amount: number }
  | { k: 'rivalOpinion'; rival: RivalId; amount: number }
  /** The boss's stress (engine has none yet; see README for mapping). */
  | { k: 'stress'; amount: number }
  /** What the law has on `role` ('player' = the federal case). */
  | { k: 'evidence'; role: string; amount: number }
  /** Leverage over `role`. Weak hooks are spent on use. */
  | { k: 'hook'; role: string; strong?: boolean; reason: string }
  /** Gives `role` a secret, known to `knownBy` (default: player). */
  | { k: 'secret'; role: string; kind: SecretKind; knownBy?: 'player' | RivalId }
  /** Schedule another event of this pack. Roles carry over by key. */
  | { k: 'followup'; event: string; minWeeks: number; maxWeeks: number; chance: number }
  | { k: 'flag'; key: string; value: number }
  | { k: 'influence'; district: DistrictId | '{district}'; amount: number; faction?: RivalId }
  | { k: 'health'; role: string; amount: number }
  | { k: 'prison'; role: string; weeks: number }
  /** A character leaves the board. Always narrated off-screen, never shown. */
  | { k: 'leave'; role: string; how: 'exile' | 'dies' | 'retires' | 'defects' }
  | { k: 'rank'; role: string; rank: Rank }
  /** Character joins the player's crew (generated townies included). */
  | { k: 'recruit'; role: string; rank?: Rank }
  | { k: 'debt'; lender: string; principal: number; weeklyPayment: number; weeks: number }
  | { k: 'rivalResource'; rival: RivalId; money?: number; muscle?: number; exposure?: number }
  | { k: 'feud'; rival: RivalId }
  /** The Underbelly antagonist (villain-only predatory outfit). */
  | { k: 'underbelly'; op: 'strength' | 'exposure' | 'expose' | 'runout'; amount?: number }
  | { k: 'business'; op: 'add' | 'close'; kind: BusinessKind; district?: DistrictId | '{district}'; weeks?: number }
  | { k: 'wealth'; role: string; amount: number }
  /** Political favors owed to the player. */
  | { k: 'favor'; amount: number }
  /** Dirty money that still has to be laundered. */
  | { k: 'unwashed'; amount: number }
  /** Marriage/betrothal alliance between the house and a rival faction. */
  | { k: 'alliance'; rival: RivalId; via: string };

export interface Gate {
  /** The boss must have this trait. Shown CK3-style: "[Cruel] ..." */
  trait?: Trait;
  notTrait?: Trait;
  money?: number;
  respect?: number;
  flag?: string;
}

export interface Option {
  text: string;
  gate?: Gate;
  effects: Fx[];
  /** One-line consequence preview shown under the button. */
  preview: string;
}

export interface PackEvent {
  id: string;
  category: Category;
  /** Chain membership: parts may branch (two events can share a part number). */
  chain?: { id: string; part: number };
  trigger: Trigger;
  roles: Record<string, RoleSpec>;
  title: string;
  body: string;
  /** Applied when the event fires, before the player chooses (the bad news). */
  immediate?: Fx[];
  options: Option[];
}

export interface ChainInfo {
  id: string;
  title: string;
  summary: string;
  /** Event ids in story order (branches listed in the order written). */
  events: string[];
}

/* ------------------------------------------------------------------ */
/* Authoring helpers (produce plain data)                              */
/* ------------------------------------------------------------------ */

export const money = (amount: number): Fx => ({ k: 'money', amount });
export const respect = (amount: number): Fx => ({ k: 'respect', amount });
export const heat = (bar: HeatBar, amount: number): Fx => ({ k: 'heat', bar, amount });
export const op = (role: string, amount: number, toward?: string): Fx =>
  toward ? { k: 'opinion', role, amount, toward } : { k: 'opinion', role, amount };
export const crewOp = (amount: number): Fx => ({ k: 'crewOpinion', amount });
export const famOp = (amount: number): Fx => ({ k: 'familyOpinion', amount });
export const rivOp = (rival: RivalId, amount: number): Fx => ({ k: 'rivalOpinion', rival, amount });
export const stress = (amount: number): Fx => ({ k: 'stress', amount });
export const evidence = (role: string, amount: number): Fx => ({ k: 'evidence', role, amount });
export const hook = (role: string, reason: string, strong = false): Fx => ({ k: 'hook', role, strong, reason });
export const secret = (role: string, kind: SecretKind, knownBy?: 'player' | RivalId): Fx =>
  knownBy ? { k: 'secret', role, kind, knownBy } : { k: 'secret', role, kind };
/** Named `thenFx` in the engine copy: a module exporting `then` is a thenable, and awaiting its namespace hangs (vite-node). */
export const thenFx = (event: string, minWeeks: number, maxWeeks: number, chance = 1): Fx =>
  ({ k: 'followup', event, minWeeks, maxWeeks, chance });
export const flag = (key: string, value = 1): Fx => ({ k: 'flag', key, value });
export const infl = (district: DistrictId | '{district}', amount: number, faction?: RivalId): Fx =>
  faction ? { k: 'influence', district, amount, faction } : { k: 'influence', district, amount };
export const health = (role: string, amount: number): Fx => ({ k: 'health', role, amount });
export const prison = (role: string, weeks: number): Fx => ({ k: 'prison', role, weeks });
export const leave = (role: string, how: 'exile' | 'dies' | 'retires' | 'defects'): Fx => ({ k: 'leave', role, how });
export const rank = (role: string, r: Rank): Fx => ({ k: 'rank', role, rank: r });
export const recruit = (role: string, r?: Rank): Fx => (r ? { k: 'recruit', role, rank: r } : { k: 'recruit', role });
export const rivRes = (rival: RivalId, o: { money?: number; muscle?: number; exposure?: number }): Fx => ({ k: 'rivalResource', rival, ...o });
export const feud = (rival: RivalId): Fx => ({ k: 'feud', rival });
export const under = (o: 'strength' | 'exposure' | 'expose' | 'runout', amount?: number): Fx =>
  amount === undefined ? { k: 'underbelly', op: o } : { k: 'underbelly', op: o, amount };
export const biz = (o: 'add' | 'close', kind: BusinessKind, district?: DistrictId | '{district}', weeks?: number): Fx => {
  const fx: Fx = { k: 'business', op: o, kind };
  if (district) fx.district = district;
  if (weeks !== undefined) fx.weeks = weeks;
  return fx;
};
export const wealth = (role: string, amount: number): Fx => ({ k: 'wealth', role, amount });
export const favor = (amount: number): Fx => ({ k: 'favor', amount });
export const unwashed = (amount: number): Fx => ({ k: 'unwashed', amount });
export const debt = (lender: string, principal: number, weeklyPayment: number, weeks: number): Fx =>
  ({ k: 'debt', lender, principal, weeklyPayment, weeks });
export const alliance = (rival: RivalId, via: string): Fx => ({ k: 'alliance', rival, via });

/** Role constructors. */
export const crewRole = (desc: string, o: Partial<RoleSpec> = {}): RoleSpec => ({ desc, pool: 'crew', ...o });
export const famRole = (desc: string, relation: Relation, o: Partial<RoleSpec> = {}): RoleSpec => ({ desc, pool: 'family', relation, ...o });
export const rivalBoss = (faction: RivalId, desc?: string): RoleSpec =>
  ({ desc: desc ?? `the leader of ${faction}`, pool: 'rival', faction, leader: true });
export const rivalMan = (faction: RivalId, desc: string, spawn?: Spawn): RoleSpec =>
  spawn ? { desc, pool: 'rival', faction, spawn } : { desc, pool: 'rival', faction };
export const official = (desc: string, office: string, spawn: Spawn): RoleSpec => ({ desc, pool: 'official', office, spawn: { office, ...spawn } });
export const townie = (desc: string, spawn: Spawn): RoleSpec => ({ desc, pool: 'town', spawn });
export const carried = (desc: string): RoleSpec => ({ desc, pool: 'chain' });

/** Prefix "[Trait] " for gated option text in UIs that want it. */
export function gateLabel(o: Option): string {
  return o.gate?.trait ? `[${o.gate.trait}] ${o.text}` : o.text;
}
