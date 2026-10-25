/**
 * Little Las Vegas: World Pack schema.
 *
 * A "WorldPerson" is anyone in the living world outside the player's crew:
 * politicians, cops, firemen, lawyers and judges, street toughs who can be
 * recruited, entertainers and notable townsfolk. Everything is plain,
 * JSON-serializable data (no classes, no Dates), like the engine's GameState.
 *
 * Mapping onto the engine's Character (little-las-vegas/src/engine/types.ts):
 *   name.first/last/maiden -> firstName/lastName/maidenName
 *   nickname               -> nickname
 *   sex                    -> gender
 *   gameEthnicity          -> ethnicity (the engine's 3-value union; `origin` keeps the full truth)
 *   birthYear              -> birth { y: birthYear, m, d } (pick m/d from the id hash)
 *   attributes.leadership..discipline -> attributes (the six game skills, same names)
 *   traits (GameTrait only) -> traits; WorldTrait extras are dropped or mapped (see TRAIT_FALLBACK)
 *   gameRank               -> rank ('civilian' for everyone not in a crime family)
 *   office                 -> office
 *   wealth                 -> wealth
 *   vices -> crew Vice via VICE_TO_GAME; street.specialty -> Craft/Specialty via SPECIALTY_TO_GAME
 *   relationships spouse/parent/child -> spouseId/fatherId/motherId/childrenIds
 *   attributes.loyalty     -> seed opinion toward patron (see lifecycle.md "Opinion seeding")
 *   secrets                -> engine Secret (kind mapped via SECRET_TO_GAME)
 */

/* ------------------------------------------------------------------ */
/* Engine-compatible enums (kept in sync with the engine by hand)       */
/* ------------------------------------------------------------------ */

/** The engine's Trait union, copied verbatim. */
export type GameTrait =
  | 'Greedy' | 'Hot-headed' | 'Patient' | 'Ambitious' | 'Loyal-to-a-fault' | 'Paranoid' | 'Pious' | 'Womanizer'
  | 'Gambler' | 'Honest' | 'Cruel' | 'Cowardly' | 'Charming' | 'Vengeful' | 'Drinker';

export const GAME_TRAITS: readonly GameTrait[] = [
  'Greedy', 'Hot-headed', 'Patient', 'Ambitious', 'Loyal-to-a-fault', 'Paranoid', 'Pious', 'Womanizer',
  'Gambler', 'Honest', 'Cruel', 'Cowardly', 'Charming', 'Vengeful', 'Drinker',
];

/** World-only traits. The engine ignores them unless it adopts them. */
export type ExtraTrait =
  | 'Idealist' | 'Vain' | 'Discreet' | 'Ruthless' | 'Lazy' | 'Zealous' | 'Reckless' | 'Cunning' | 'Sentimental' | 'Brave' | 'Flirt';

export type WorldTrait = GameTrait | ExtraTrait;

/** How to fold an ExtraTrait into the engine's list when the engine has no slot for it. */
export const TRAIT_FALLBACK: Record<ExtraTrait, GameTrait | null> = {
  Idealist: 'Honest', Vain: null, Discreet: 'Patient', Ruthless: 'Cruel', Lazy: null, Zealous: 'Vengeful',
  Reckless: 'Hot-headed', Cunning: 'Paranoid', Sentimental: null, Brave: null, Flirt: 'Charming',
};

/** Same opposition pairs as characters.ts, plus a few for the extras. */
export const OPPOSED_TRAITS: [WorldTrait, WorldTrait][] = [
  ['Greedy', 'Honest'], ['Hot-headed', 'Patient'], ['Cruel', 'Pious'], ['Cowardly', 'Hot-headed'],
  ['Loyal-to-a-fault', 'Ambitious'], ['Pious', 'Womanizer'], ['Cowardly', 'Vengeful'],
  ['Cowardly', 'Brave'], ['Idealist', 'Greedy'], ['Lazy', 'Zealous'], ['Discreet', 'Vain'], ['Reckless', 'Patient'],
];

export type GameRank = 'boss' | 'underboss' | 'consigliere' | 'capo' | 'soldier' | 'associate' | 'civilian';
export type GameEthnicity = 'Italian' | 'Irish' | 'Jewish';
export type GameFaction = 'player' | 'manno' | 'feldstein' | 'kessler' | 'philly' | 'law' | 'none';

/** llv-crew Vice. */
export type GameVice = 'horses' | 'women' | 'booze' | 'cards' | 'debt';
export type WorldVice = GameVice | 'men' | 'dice' | 'pills' | 'spending' | 'heroin' | 'fame';
export const VICE_TO_GAME: Record<WorldVice, GameVice | null> = {
  horses: 'horses', women: 'women', booze: 'booze', cards: 'cards', debt: 'debt',
  men: 'women', dice: 'cards', pills: 'booze', spending: 'debt', heroin: 'booze', fame: null,
};

/** llv-crew Craft and engine Specialty. */
export type GameCraft = 'muscle' | 'earner' | 'driver' | 'bookmaker' | 'collector' | 'burglar' | 'talker';
export type GameSpecialty = 'safecracker' | 'wheelman' | 'torpedo' | 'accountant' | 'lawyer' | 'forger' | 'doctor';

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export type Sex = 'M' | 'F';

export type Origin = 'Italian' | 'Irish' | 'Jewish' | 'Polish' | 'Black' | 'WASP' | 'Greek' | 'PuertoRican' | 'German';

/** The engine only knows three ethnicities; this is the lossy fallback until it is widened. */
export const ORIGIN_TO_GAME: Record<Origin, GameEthnicity> = {
  Italian: 'Italian', Irish: 'Irish', Jewish: 'Jewish', Polish: 'Irish', Black: 'Irish', WASP: 'Irish', Greek: 'Italian',
  PuertoRican: 'Italian', German: 'Irish',
};

export type Domain = 'political' | 'police' | 'fire' | 'legal' | 'street' | 'entertainment' | 'civilian';

export type Party = 'D' | 'R' | 'Nonpartisan' | 'Ind';
export type Ideology =
  | 'machine' | 'reform' | 'labor' | 'business' | 'establishment' | 'law-and-order' | 'populist' | 'civil-rights' | 'old-money' | 'none';

/** 0-100 each. The last six are the engine's skills, same names. */
export interface WorldAttributes {
  loyalty: number;
  ambition: number;
  greed: number;
  courage: number;
  competence: number;
  corruption: number;
  morality: number;
  charisma: number;
  leadership: number;
  business: number;
  diplomacy: number;
  intrigue: number;
  force: number;
  discipline: number;
}
export type AttrKey = keyof WorldAttributes;
export const ATTR_KEYS: AttrKey[] = [
  'loyalty', 'ambition', 'greed', 'courage', 'competence', 'corruption', 'morality', 'charisma',
  'leadership', 'business', 'diplomacy', 'intrigue', 'force', 'discipline',
];

export interface CareerStep {
  year: number;
  title: string;
}

export type SecretKind =
  // engine SecretKind
  | 'affair' | 'skimming' | 'informant' | 'drugs' | 'debt' | 'murder' | 'bastard' | 'plot'
  // world extras
  | 'bribe' | 'fraud' | 'arson' | 'cover-up' | 'past' | 'illness' | 'vote-fraud' | 'family';

export const SECRET_TO_GAME: Record<SecretKind, 'affair' | 'skimming' | 'informant' | 'drugs' | 'debt' | 'murder' | 'bastard' | 'plot'> = {
  affair: 'affair', skimming: 'skimming', informant: 'informant', drugs: 'drugs', debt: 'debt', murder: 'murder', bastard: 'bastard', plot: 'plot',
  bribe: 'skimming', fraud: 'skimming', arson: 'plot', 'cover-up': 'plot', past: 'plot', illness: 'plot', 'vote-fraud': 'plot', family: 'bastard',
};

export interface WorldSecret {
  kind: SecretKind;
  text: string;
  /** 1 embarrassing · 2 career-ending · 3 prison or worse. */
  severity: 1 | 2 | 3;
  /** Where the proof physically is (a ledger, a photo, a witness). Blackmail schemes target this. */
  proof?: string;
  /** Who already knows: person ids, 'game:<key>' or a faction id. */
  knownTo?: string[];
  /** Passes to the heir on death (inherited secrets drive the dynasty plots). */
  inheritable?: boolean;
}

export interface WorldDebt {
  /** Person id, 'game:<key>', faction id or a plain description. */
  to: string;
  kind: 'money' | 'favor' | 'loyalty';
  /** Dollars (1960) for money debts; 1-3 weight for favors. */
  amount: number;
  note?: string;
}

/**
 * Relationship target: a WorldPerson id in this pack, or 'game:<key>' for a
 * character the engine already creates (see GAME_REFS).
 */
export type PersonRef = string;

export type RelKind =
  | 'spouse' | 'parent' | 'child' | 'sibling' | 'cousin' | 'in-law' | 'relative' | 'grandparent' | 'grandchild'
  | 'patron' | 'protege' | 'rival' | 'enemy' | 'ally' | 'friend' | 'lover' | 'ex-spouse'
  | 'employer' | 'employee' | 'handler' | 'informant' | 'partner' | 'mentor';

/**
 * A relationship reads "the target is my <kind>": { kind: 'parent', id: X }
 * means X is my parent; { kind: 'patron', id: Y } means Y is my patron;
 * { kind: 'employee', id: Z } means Z works for me. index.ts adds the
 * inverse on the other person automatically (see INVERSE_REL).
 */
export interface Relationship {
  kind: RelKind;
  id: PersonRef;
  note?: string;
}

export type TieKind = 'crime' | 'union' | 'press' | 'prosecutor' | 'fbi' | 'business' | 'church' | 'party' | 'showbiz' | 'police';

export interface Tie {
  kind: TieKind;
  /** A game faction id, a person ref, or a named body ("HERE Local 54", "Wildwood Leader"). */
  target: string;
  /** -100 hostile .. +100 owned. */
  strength: number;
  note?: string;
}

/* --- domain blocks --- */

export type PoliceBranch =
  | 'patrol' | 'detective' | 'vice' | 'narcotics' | 'homicide' | 'organized-crime' | 'intelligence' | 'internal-affairs'
  | 'command' | 'county' | 'state' | 'federal' | 'boardwalk';
/** The pad (on the take), reformers, careerists who go where the wind blows, and the federal hawks. */
export type PoliceFaction = 'pad' | 'reform' | 'neutral' | 'careerist' | 'federal';

export interface PoliceInfo {
  branch: PoliceBranch;
  faction: PoliceFaction;
  /** Weekly envelope in dollars if on the pad (0 = clean). */
  padWeekly: number;
  badge?: string;
}

export type FireRole =
  | 'chief' | 'officer' | 'firefighter' | 'volunteer' | 'marshal' | 'inspector' | 'arson-investigator' | 'adjuster' | 'lifeguard';

export interface FireInfo {
  role: FireRole;
  /** 0-100: how good he is at finding an arson. */
  arsonEye: number;
  /** Will he sign off on a building or a fire report for money? */
  signsForCash: boolean;
}

export type LegalRole =
  | 'mob-lawyer' | 'defense' | 'assigned-counsel' | 'public-defender' | 'prosecutor' | 'judge' | 'clerk' | 'bail-bondsman'
  | 'civil' | 'labor-lawyer' | 'jury-commissioner' | 'probation' | 'magistrate' | 'investigator';
export type CourtLevel = 'municipal' | 'county' | 'superior' | 'appellate' | 'supreme' | 'federal' | 'philadelphia';

export interface LegalInfo {
  role: LegalRole;
  court?: CourtLevel;
  /** 0-100: chance-weight that he can be "reached" (bribed, leaned on, flattered). */
  reachable: number;
  /** Weekly retainer in dollars for lawyers who take the family's work. */
  retainer?: number;
}

export type StreetSpecialty =
  | 'boxer' | 'wheelman' | 'safecracker' | 'bookie-runner' | 'numbers-kid' | 'card-sharp' | 'muscle' | 'fixer' | 'smooth-talker'
  | 'bookkeeper' | 'numbers-banker' | 'fence' | 'club-owner' | 'forger' | 'burglar' | 'shylock' | 'mechanic' | 'torch';

export const SPECIALTY_TO_GAME: Record<StreetSpecialty, { craft: GameCraft; specialty?: GameSpecialty }> = {
  boxer: { craft: 'muscle' }, wheelman: { craft: 'driver', specialty: 'wheelman' }, safecracker: { craft: 'burglar', specialty: 'safecracker' },
  'bookie-runner': { craft: 'bookmaker' }, 'numbers-kid': { craft: 'earner' }, 'card-sharp': { craft: 'earner' }, muscle: { craft: 'muscle' },
  fixer: { craft: 'talker' }, 'smooth-talker': { craft: 'talker' }, bookkeeper: { craft: 'earner', specialty: 'accountant' },
  'numbers-banker': { craft: 'earner' }, fence: { craft: 'earner' }, 'club-owner': { craft: 'earner' }, forger: { craft: 'earner', specialty: 'forger' },
  burglar: { craft: 'burglar' }, shylock: { craft: 'collector' }, mechanic: { craft: 'driver' }, torch: { craft: 'burglar' },
};

export type StreetOrigin = 'Wildwood' | 'North Wildwood' | 'Rio Grande' | 'South Philly' | 'Atlantic City' | 'Camden' | 'Vineland' | 'Cape May' | 'Kensington';

export interface StreetInfo {
  origin: StreetOrigin;
  specialty: StreetSpecialty;
  /** 0-100: ceiling as a leader (capo material at 70+, boss material at 85+). */
  leadershipPotential: number;
  /** 0-100: how readily he takes direction and grows under a mentor. */
  groomability: number;
  /** Arrests on his sheet (engine `record`). */
  record: number;
  /** Who he runs with now: a game faction, or 'none' for free agents. */
  currentlyWith: GameFaction;
  /** One-line personal arc: where he goes if nobody intervenes. */
  arc: string;
}

export type ShowbizCategory =
  | 'doo-wop' | 'rock-and-roll' | 'lounge-singer' | 'jazz' | 'comic' | 'bandleader' | 'dancer' | 'tv-host' | 'dj' | 'actress' | 'actor'
  | 'producer' | 'director' | 'club-owner' | 'agent' | 'columnist' | 'songwriter' | 'record-man' | 'promoter' | 'photographer';
export type Trajectory = 'rising' | 'peaking' | 'fading' | 'comeback' | 'retired';
export type MobIntersect =
  | 'bookings' | 'debt' | 'payola' | 'film-investment' | 'blackmail' | 'protection' | 'jukebox' | 'liquor-license' | 'skim' | 'courier'
  | 'front' | 'records' | 'contract-buyout' | 'marriage';
export type Circuit = 'Wildwood' | 'Atlantic City' | 'Philadelphia' | 'New York' | 'Las Vegas' | 'Hollywood' | 'Miami' | 'Catskills';

export interface ShowbizInfo {
  category: ShowbizCategory;
  /** Group name for singers in groups; stage name lives in `nickname`. */
  act?: string;
  circuit: Circuit[];
  trajectory: Trajectory;
  /** 0-100 fame. */
  fame: number;
  /** Projected year of peak (the lifecycle curves fame toward it). */
  peakYear: number;
  /** 0-100: annual weight of a public scandal. */
  scandalRisk: number;
  mobIntersect: MobIntersect[];
  /** Typical fee for a week's booking in a Wildwood club (1960 dollars). */
  weekFee?: number;
}

export interface CivilianInfo {
  occupation: string;
  /** Named business, parish or paper. */
  establishment?: string;
  /** 0-100: what he can do for the family (fronts, permits, alibis, introductions). */
  usefulness: number;
}

/* --- the person --- */

export interface WorldPerson {
  id: string;
  /** `suffix` is a generational marker ("Jr.", "III"); the engine has no slot for it, so toEngineCharacter drops it. */
  name: { first: string; last: string; maiden?: string; suffix?: string };
  nickname?: string;
  sex: Sex;
  birthYear: number;
  /** Set if the person is already dead in 1960 (founders), or scheduled to die (an illness plot). */
  deathYear?: number;
  deathCause?: string;
  origin: Origin;
  gameEthnicity: GameEthnicity;
  hometown: string;
  domain: Domain;
  institution: InstitutionId;
  /** Title held in summer 1960 (or the last one held if dead/retired, or "student" etc. for heirs). */
  office: string;
  /** Position on an institution ladder (index into CareerLadder.rungs). */
  ladder?: { id: LadderId; rung: number };
  /** Seat he holds, if elected/appointed (ElectedOffice.id). */
  seat?: string;
  careerHistory: CareerStep[];
  party?: Party;
  ideology?: Ideology;
  /** 0-100 personal vote-getting strength (incumbency is added by the formula, not here). */
  electoralStrength?: number;
  publicReputation: string;
  hiddenPersonality: string;
  attributes: WorldAttributes;
  traits: WorldTrait[];
  vices: WorldVice[];
  secrets: WorldSecret[];
  debts: WorldDebt[];
  relationships: Relationship[];
  ties: Tie[];
  dynastyId?: string;
  /** Personal wealth, 1960 dollars. */
  wealth: number;
  /** One line of plot potential. */
  hook: string;
  /** First year the person is "in play" (heirs born 1940s enter around 21-25). Default: present in 1960. */
  activeFrom?: number;
  gameRank: GameRank;
  police?: PoliceInfo;
  fire?: FireInfo;
  legal?: LegalInfo;
  street?: StreetInfo;
  showbiz?: ShowbizInfo;
  civilian?: CivilianInfo;
  tags?: string[];
}

/* ------------------------------------------------------------------ */
/* Dynasties                                                           */
/* ------------------------------------------------------------------ */

export interface Dynasty {
  id: string;
  name: string;
  powerBase: string;
  identity: string;
  /** Dynasty ids (or 'game:<house>') this family is fated to fight. */
  enemies: string[];
  /** The founding arrangement whose evidence the heirs inherit. */
  foundingSecret: string;
  /** Where the evidence is kept (passed down the bloodline). */
  heirloom: string;
  seatOfPower: string;
  links?: string;
}

/* ------------------------------------------------------------------ */
/* Institutions, ladders, offices                                      */
/* ------------------------------------------------------------------ */

export type InstitutionId =
  // municipal
  | 'wildwood_city' | 'north_wildwood_city' | 'crest_borough' | 'cape_may_city' | 'middle_twp' | 'lower_twp' | 'west_wildwood'
  // county / party
  | 'cape_may_county' | 'cape_may_party_r' | 'cape_may_party_d' | 'atlantic_county'
  // state
  | 'nj_legislature' | 'nj_executive' | 'nj_agencies' | 'nj_party' | 'drpa'
  // federal elected
  | 'us_congress'
  // big cities
  | 'atlantic_city' | 'philadelphia_city' | 'philadelphia_ward'
  // police & investigators
  | 'wildwood_pd' | 'north_wildwood_pd' | 'crest_pd' | 'cmc_prosecutor_detectives' | 'cmc_sheriff' | 'nj_state_police'
  | 'atlantic_city_pd' | 'philadelphia_pd' | 'fbi_newark' | 'fbi_philadelphia' | 'federal_other'
  // fire
  | 'wildwood_fd' | 'north_wildwood_fd' | 'crest_fd' | 'county_fire' | 'state_fire' | 'insurance'
  // legal
  | 'cmc_prosecutor' | 'atlantic_prosecutor' | 'nj_attorney_general' | 'us_attorney_nj' | 'philadelphia_da'
  | 'municipal_court' | 'county_court' | 'superior_court' | 'nj_supreme_court' | 'federal_court' | 'philadelphia_courts'
  | 'private_bar' | 'bail'
  // street
  | 'street'
  // entertainment
  | 'showbiz'
  // civil society
  | 'business' | 'church' | 'press' | 'union' | 'medicine' | 'community';

export interface Institution {
  id: InstitutionId;
  name: string;
  domain: Domain;
  jurisdiction: string;
  /** Historical note (real 1960 structure) or "plausible" when invented to fit. */
  note: string;
  ladder?: LadderId;
}

export type LadderId =
  | 'municipal_police' | 'big_city_police' | 'state_police' | 'county_detectives' | 'sheriff' | 'fbi'
  | 'fire_paid' | 'fire_volunteer' | 'inspector'
  | 'prosecutor_office' | 'federal_prosecutor' | 'bar' | 'bench_nj' | 'bench_federal' | 'court_staff'
  | 'local_politics' | 'county_politics' | 'state_politics' | 'federal_politics' | 'party_machine' | 'ward_politics'
  | 'street' | 'showbiz_performer' | 'showbiz_business' | 'civilian';

export interface LadderRung {
  title: string;
  /** Minimum years in the rung before promotion is possible. */
  minYears: number;
  /** Base annual promotion chance to the next rung (before modifiers, see lifecycle.md). */
  promote: number;
  /** Base annual chance of a disqualifying scandal (scaled by corruption, see lifecycle.md). */
  scandal: number;
  /** Mandatory or customary retirement age (0 = none). */
  retireAge: number;
  /** Annual voluntary retirement chance once past retireAge - 5. */
  retire: number;
  /** Annual salary (1960 dollars). */
  salary: number;
  /** Typical weekly bribe/envelope he expects if he can be bought. */
  envelope: number;
  /** How many people hold this rung in a typical institution (vacancies gate promotions). */
  slots: number;
}

export interface CareerLadder {
  id: LadderId;
  name: string;
  rungs: LadderRung[];
  /** Annual pay raise once in a rung (fraction). */
  raise: number;
}

export interface ElectedOffice {
  id: string;
  title: string;
  institution: InstitutionId;
  seats: number;
  /** Years per term. 0 = appointed at pleasure. */
  termYears: number;
  /** 'elected' (partisan or not), 'appointed', 'life'. */
  selection: 'elected' | 'appointed' | 'life' | 'chosen-by-body';
  partisan: boolean;
  /** Who appoints (if appointed). */
  appointedBy?: string;
  /** First election (or reappointment) year at or after summer 1960; repeats every termYears. */
  nextYear: number;
  /** Election month (5 = May municipal, 11 = November general, 4 = Philadelphia/PA primary). */
  month: number;
  /** -1 strongly Republican .. +1 strongly Democratic (0 for nonpartisan). Drifts per lifecycle.md. */
  lean: number;
  /** Max consecutive terms (0 = none). */
  termLimit: number;
  /** One line on why it matters to the player. */
  leverage: string;
  /** Real-structure note. */
  note: string;
}

/** Characters the engine already creates; WorldPeople link to them with 'game:<key>'. */
export interface GameRef {
  key: string;
  name: string;
  role: string;
  /** Where the engine creates him. */
  source: string;
}

/* The data that goes with these types (institutions, ladders, offices, dynasties, engine links). */
export { INSTITUTIONS, LADDERS, OFFICES, DYNASTIES, GAME_REFS } from './institutions';
