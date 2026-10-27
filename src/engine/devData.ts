import type { BusinessKind, OutsideRole, Specialty } from './types';

/**
 * FAMILY DEVELOPMENT: the data. Six development paths, each a short ladder
 * of era-gated tiers, and the broad crew-equipment categories.
 *
 * Abstract on purpose: a tier is a way of doing business (a private line, a
 * bookkeeper's office, a dispatcher), and equipment is four broad game
 * categories with game stats only — no makes, models or how-to.
 */

export type PathId = 'comm' | 'books' | 'wheels' | 'gear' | 'info' | 'legit';

/** Who answers for a path, best first: a council seat, a rank, a specialty, or the best man at a skill. */
export type RespRole = 'consigliere' | 'underboss' | 'bagman' | 'enforcer' | 'fixer' | 'keeper';

export interface PathDef {
  id: PathId;
  icon: string;
  label: string;
  blurb: string;
  /** Who is put in charge, in order of preference. */
  resp: RespRole[];
  /** The skill that makes him good at it (the fallback picks the best man at it). */
  skill: 'leadership' | 'business' | 'diplomacy' | 'intrigue' | 'force' | 'discipline';
  spec?: Specialty;
}

export const PATHS: PathDef[] = [
  { id: 'comm', icon: '☏', label: 'Communications', blurb: 'How word gets from you to your capos and back: a private line, radios, later pagers and car phones.', resp: ['consigliere', 'underboss'], skill: 'diplomacy' },
  { id: 'books', icon: '✍', label: 'Business & finance', blurb: 'How the money is counted: a bookkeeper\'s office, an accounting staff, later records on a computer.', resp: ['bagman', 'keeper'], skill: 'business', spec: 'accountant' },
  { id: 'wheels', icon: '⛟', label: 'Transportation', blurb: 'Cars for the crew, a garage with a dispatcher, a fleet. Men get where they are needed.', resp: ['enforcer'], skill: 'force', spec: 'wheelman' },
  { id: 'gear', icon: '⚙', label: 'Equipment', blurb: 'Where the crews\' equipment is kept and who supplies it: a locker, a quiet supplier, protective gear.', resp: ['enforcer'], skill: 'force', spec: 'torpedo' },
  { id: 'info', icon: '☍', label: 'Information', blurb: 'Knowing what others know: a card file on people, a friend at the phone company, sweeping for bugs.', resp: ['consigliere', 'fixer'], skill: 'intrigue' },
  { id: 'legit', icon: '▣', label: 'Legitimate business', blurb: 'Running the straight businesses well: motel management, vending equipment, warehouse systems.', resp: ['bagman'], skill: 'business' },
];
export const PATHS_BY_ID = Object.fromEntries(PATHS.map((p) => [p.id, p])) as Record<PathId, PathDef>;

/** One condition for a tier. Each one has the words the opportunity uses ("Available because …"). */
export type Prereq =
  | { k: 'tier'; path: PathId; tier: number }
  | { k: 'hire'; spec?: Specialty; skill?: 'business' | 'force' | 'intrigue'; min?: number; text: string }
  | { k: 'biz'; kinds: BusinessKind[]; count?: number; text: string }
  | { k: 'fronts'; count: number }
  | { k: 'contact'; outside?: OutsideRole[]; kinds?: BusinessKind[]; text: string }
  | { k: 'event'; any: DevEventId[]; text: string };

export type DevEventId = 'war' | 'bug' | 'fed30';

export interface TierDef {
  id: string;
  path: PathId;
  /** 1-based rung on the path. */
  tier: number;
  name: string;
  line: string;
  /** First year it can be had. */
  from: number;
  /** After this year it is dated (still works, no better). */
  dated?: number;
  req: Prereq[];
  cost: number;
  upkeep: number;
  /** The concrete effect, in one line, for the card. */
  effect: string;
  /** The catch (upkeep is always shown; this is the other price). */
  catch?: string;
}

const T = (d: TierDef) => d;

export const TIERS: TierDef[] = [
  // ---- Communications ----
  T({ id: 'comm1', path: 'comm', tier: 1, name: 'A private line and an answering service', line: 'A line nobody else in the building uses, and a woman who takes messages and asks no questions.', from: 1960, req: [], cost: 1200, upkeep: 20, effect: 'Orders through your people are carried out as given more often (+4%).' }),
  T({ id: 'comm2', path: 'comm', tier: 2, name: 'Radios in the crew cars', line: 'Two-way sets in the cars, a base set at the club.', from: 1963, req: [{ k: 'tier', path: 'comm', tier: 1 }, { k: 'tier', path: 'wheels', tier: 1 }], cost: 3500, upkeep: 45, effect: 'Orders +7% as given; crews coordinate (+1 crew strength).' }),
  T({ id: 'comm3', path: 'comm', tier: 3, name: 'Pagers for the capos', line: 'A beeper on every capo\'s belt; a call back from a pay phone.', from: 1974, req: [{ k: 'tier', path: 'comm', tier: 2 }], cost: 5000, upkeep: 70, effect: 'Orders +10% as given; +2 crew strength.' }),
  T({ id: 'comm4', path: 'comm', tier: 4, name: 'Car phones', line: 'A telephone in the capos\' cars.', from: 1981, req: [{ k: 'tier', path: 'comm', tier: 3 }], cost: 9000, upkeep: 140, effect: 'Orders +12% as given; +3 crew strength.', catch: 'A phone can be listened to: +1 federal heat a month, unless you sweep for bugs.' }),
  // ---- Business & finance ----
  T({ id: 'books1', path: 'books', tier: 1, name: 'A real bookkeeper\'s office', line: 'A back room, adding machines, a man who knows double entry.', from: 1960, req: [{ k: 'hire', spec: 'accountant', skill: 'business', min: 65, text: 'you have an experienced bookkeeper' }], cost: 1000, upkeep: 25, effect: 'The books catch a skimming capo sooner (+12%) and the reports are closer to the truth.' }),
  T({ id: 'books2', path: 'books', tier: 2, name: 'An accounting staff', line: 'Two clerks and a proper accountant who comes in twice a week.', from: 1963, req: [{ k: 'tier', path: 'books', tier: 1 }, { k: 'fronts', count: 3 }], cost: 4500, upkeep: 80, effect: 'Skims caught +25%; reports much closer to the truth.' }),
  T({ id: 'books3', path: 'books', tier: 3, name: 'Computer records (a service bureau)', line: 'The figures go out on punch cards and come back printed.', from: 1971, req: [{ k: 'tier', path: 'books', tier: 2 }, { k: 'biz', kinds: ['bank', 'construction', 'trucking', 'concrete'], text: 'you own a business big enough to need it' }], cost: 14000, upkeep: 180, effect: 'Skims caught +45%; reports nearly exact.', catch: 'A paper trail: +1 federal heat a month, unless you sweep for bugs.' }),
  // ---- Transportation ----
  T({ id: 'wheels1', path: 'wheels', tier: 1, name: 'Good cars for the crew', line: 'Big sedans that start every time, in plain colors.', from: 1960, req: [], cost: 2500, upkeep: 35, effect: '+2 crew strength; scores and loads go better (+3 on the odds).' }),
  T({ id: 'wheels2', path: 'wheels', tier: 2, name: 'A garage and a dispatcher', line: 'Your own garage, a man on the phone who knows where every car is.', from: 1962, req: [{ k: 'tier', path: 'wheels', tier: 1 }, { k: 'biz', kinds: ['towing', 'taxi', 'carlot', 'chopshop'], text: 'you own a garage' }], cost: 4000, upkeep: 60, effect: '+3 crew strength; scores and loads +5; collections come in quicker (late loans shrink).' }),
  T({ id: 'wheels3', path: 'wheels', tier: 3, name: 'A fleet and a body shop', line: 'Trucks and cars on your own books, repainted in your own shop.', from: 1968, req: [{ k: 'tier', path: 'wheels', tier: 2 }, { k: 'biz', kinds: ['trucking', 'chopshop', 'towing'], text: 'you own trucks or a body shop' }], cost: 9000, upkeep: 110, effect: '+4 crew strength; scores and loads +7.' }),
  // ---- Equipment ----
  T({ id: 'gear1', path: 'gear', tier: 1, name: 'A locker at the club', line: 'The crews\' equipment kept in one place, looked after.', from: 1960, req: [], cost: 700, upkeep: 10, effect: 'Equipment wears out 35% slower.' }),
  T({ id: 'gear2', path: 'gear', tier: 2, name: 'A quiet supplier', line: 'A man who can get things and does not keep records.', from: 1961, req: [{ k: 'tier', path: 'gear', tier: 1 }, { k: 'contact', outside: ['fence'], kinds: ['guns', 'fencing', 'cargo'], text: 'you know a fence or run a trade in goods' }], cost: 2000, upkeep: 25, effect: 'Long guns can be bought; equipment wears 50% slower; repairs cost less.' }),
  T({ id: 'gear3', path: 'gear', tier: 3, name: 'Protective gear', line: 'A supplier of the protective gear the police have started to wear.', from: 1975, req: [{ k: 'tier', path: 'gear', tier: 2 }], cost: 4000, upkeep: 40, effect: 'Protective gear can be bought for the crews.' }),
  // ---- Information ----
  T({ id: 'info1', path: 'info', tier: 1, name: 'A card file on people', line: 'Who owes whom, who drinks where, whose cousin is a cop. Kept in a locked drawer.', from: 1960, req: [], cost: 500, upkeep: 8, effect: 'Your estimates of the other families are closer (±20% instead of ±30%).' }),
  T({ id: 'info2', path: 'info', tier: 2, name: 'A friend at the phone company', line: 'Somebody who knows which lines have a second listener.', from: 1963, req: [{ k: 'tier', path: 'info', tier: 1 }, { k: 'contact', outside: ['cop', 'politician'], text: 'you have a cop or a politician on the pad' }], cost: 2500, upkeep: 40, effect: 'Estimates ±12%; federal heat cools faster (−0.5 a week above 15).' }),
  T({ id: 'info3', path: 'info', tier: 3, name: 'Sweeping for bugs', line: 'A man who goes over the club, the cars and the phones every week.', from: 1967, req: [{ k: 'tier', path: 'info', tier: 2 }, { k: 'event', any: ['bug', 'fed30', 'war'], text: 'you have learned the hard way that somebody is listening' }], cost: 5000, upkeep: 70, effect: 'Estimates ±6%; the feds get a bug into headquarters half as often; no heat from car phones or computer records.' }),
  // ---- Legitimate business ----
  T({ id: 'legit1', path: 'legit', tier: 1, name: 'Motel management', line: 'Reservations, linen service, a manager who knows the trade.', from: 1960, req: [{ k: 'biz', kinds: ['motel'], text: 'you own a motel' }], cost: 1500, upkeep: 20, effect: '+$35 a week of clean money for each motel you own.' }),
  T({ id: 'legit2', path: 'legit', tier: 2, name: 'Vending equipment', line: 'New machines on a route, serviced on a schedule.', from: 1962, req: [{ k: 'biz', kinds: ['vending', 'arcade', 'bar'], text: 'you own a vending route, an arcade or a bar' }], cost: 3000, upkeep: 30, effect: '+$30 a week of clean money for each bar, arcade, stand, pizza parlor or vending route.' }),
  T({ id: 'legit3', path: 'legit', tier: 3, name: 'Warehouse systems', line: 'A warehouse with shelves, a clerk and a loading schedule.', from: 1966, req: [{ k: 'tier', path: 'legit', tier: 2 }, { k: 'biz', kinds: ['trucking', 'cargo', 'construction', 'lumber'], text: 'you move goods for a living' }], cost: 7000, upkeep: 70, effect: '+$25 a week of clean money for each straight business you own (up to 12).' }),
];
export const TIERS_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t])) as Record<string, TierDef>;
export const tiersOf = (p: PathId): TierDef[] => TIERS.filter((t) => t.path === p);

/* ------------------------------------------------------------------ */
/* Crew equipment                                                      */
/* ------------------------------------------------------------------ */

export type GearCat = 'handguns' | 'shotguns' | 'rifles' | 'armor' | 'cars';

export interface GearDef {
  id: GearCat;
  icon: string;
  label: string;
  /** "a piece" / "a set" / "a car". */
  unit: string;
  blurb: string;
  /** 1960 price per unit (rises with the years). */
  cost: number;
  /** Weekly upkeep per unit. */
  upkeep: number;
  /** Game stat: what one unit adds for one man (weapons), or its share (armor, cars). */
  power: number;
  /** Condition lost a week (0..1). */
  wear: number;
  /** Local heat per unit bought; federal heat for a big order. */
  heat: number;
  /** Resentment in the neighborhoods per unit bought. */
  resent: number;
  from: number;
  /** The development tier that must be held first. */
  needs?: string;
  role: 'weapon' | 'armor' | 'car';
}

export const GEAR: GearDef[] = [
  { id: 'handguns', icon: '◆', label: 'Handguns', unit: 'piece', blurb: 'What most of the men carry. Cheap, easy to keep, draws little notice.', cost: 120, upkeep: 1, power: 1.0, wear: 0.004, heat: 0.15, resent: 0.1, from: 1960, role: 'weapon' },
  { id: 'shotguns', icon: '◈', label: 'Shotguns', unit: 'piece', blurb: 'Heavier. The kind of thing that gets talked about.', cost: 180, upkeep: 1.5, power: 1.25, wear: 0.004, heat: 0.35, resent: 0.3, from: 1960, role: 'weapon' },
  { id: 'rifles', icon: '▲', label: 'Long guns', unit: 'piece', blurb: 'The heaviest a crew keeps. Only through a quiet supplier; the police take it very seriously.', cost: 350, upkeep: 3, power: 1.5, wear: 0.005, heat: 0.7, resent: 0.6, from: 1960, needs: 'gear2', role: 'weapon' },
  { id: 'armor', icon: '⬢', label: 'Protective gear', unit: 'set', blurb: 'Protective vests for the men who go through the door first.', cost: 300, upkeep: 2, power: 1, wear: 0.006, heat: 0.1, resent: 0, from: 1975, needs: 'gear3', role: 'armor' },
  { id: 'cars', icon: '⛟', label: 'Crew cars', unit: 'car', blurb: 'A car for every three men. Getaways, pickups, being somewhere fast.', cost: 2200, upkeep: 20, power: 1, wear: 0.005, heat: 0, resent: 0, from: 1960, role: 'car' },
];
export const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g])) as Record<GearCat, GearDef>;

/** Prices rise with the years (about 4% a year). */
export function eraPrice(base: number, year: number): number {
  return Math.round(base * (1 + 0.04 * Math.max(0, year - 1960)) / 10) * 10;
}

/** Capo mandates for buying gear on his own: monthly budget from Family money. */
export const MANDATES: { level: 0 | 1 | 2; label: string; text: string; budget: number }[] = [
  { level: 0, label: 'Ask me first', text: 'He buys nothing on his own.', budget: 0 },
  { level: 1, label: 'Keep them equipped', text: 'He keeps his men equipped with the basics, up to $600 a month of Family money.', budget: 600 },
  { level: 2, label: 'Arm them heavy', text: 'He buys heavier equipment as he sees fit, up to $1,500 a month. More heat, more talk.', budget: 1500 },
];

/** Estimate band (±) on a rival's strength, by Information tier. */
export const ESTIMATE_BAND = [0.3, 0.2, 0.12, 0.06];
