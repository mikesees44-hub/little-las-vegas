/**
 * Core game-state types. Everything here is plain, JSON-serializable data:
 * no classes, no functions, no Dates. The whole GameState can be stored in
 * localStorage and restored byte-for-byte.
 */

import type { DynAction, DynOp, DynState } from './familyState';
import type { LineageState } from './houses';
import type { ExtAttrs, PowerAction, PowerOp, PowerState } from './powerState';
import type { Orientation, RomanceState, StoryOp, StoryState } from './storyState';
import type { PolAction, PolOp, PolState } from './polState';
import type { MgState, MinigameId } from './minigame';
import type { EconAction, EconOp, EconState } from './econState';
import type { HoodAction } from './hood';
import type { HoodState } from './hoodState';
import type { TownState } from './towns';
import type { TalkOp, TalkState } from './talks';
import type { MissionOp, MissionState } from './missions';
import type { TravelAction, TravelOp, TravelState } from './travelState';
import type { BonesAction, BonesEntry, BonesOp, BonesState } from './bonesState';
import type { LedgerAction, LedgerBookState, LedgerOp } from './ledgerbookState';
import type { EarsAction, EarsOp, EarsState } from './earsState';

export interface GameDate {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export type HeatBar = 'local' | 'family' | 'federal';
export const HEAT_BARS: HeatBar[] = ['local', 'family', 'federal'];

export type Stat = 'money' | 'respect' | `heat.${HeatBar}`;

export type Rank = 'boss' | 'underboss' | 'consigliere' | 'capo' | 'soldier' | 'associate' | 'civilian';

export type Trait =
  | 'Greedy'
  | 'Hot-headed'
  | 'Patient'
  | 'Ambitious'
  | 'Loyal-to-a-fault'
  | 'Paranoid'
  | 'Pious'
  | 'Womanizer'
  | 'Gambler'
  | 'Honest'
  | 'Cruel'
  | 'Cowardly'
  | 'Charming'
  | 'Vengeful'
  | 'Drinker';

/** Family roles cast on the living extended family of the houses (housesKin.ts). */
export type KinRole =
  | 'matriarch' | 'uncle' | 'aunt' | 'cousin' | 'priest' | 'cop' | 'wantsIn' | 'inlaw' | 'godchild'
  | 'front' | 'church' | 'numbers' | 'advisor' | 'match' | 'power';

export interface Attributes {
  leadership: number;
  business: number;
  diplomacy: number;
  intrigue: number;
  force: number;
  discipline: number;
}

export type Ethnicity = 'Italian' | 'Irish' | 'Jewish';

/** Faction ids. 'player' is the player's crew; the rest are rival organisations. */
export type FactionId = 'player' | 'manno' | 'feldstein' | 'kessler' | 'philly' | 'law' | 'none';
export type RivalId = Exclude<FactionId, 'player' | 'none'>;

export interface Death {
  week: number;
  date: GameDate;
  cause: string;
  killer?: FactionId;
}

export interface Character {
  id: string;
  firstName: string;
  lastName: string;
  maidenName?: string;
  nickname?: string;
  gender: 'M' | 'F';
  ethnicity: Ethnicity;
  birth: GameDate;
  health: number; // 0-100
  conditions: string[];
  attributes: Attributes;
  traits: Trait[];
  ambition: string;
  rank: Rank;
  faction: FactionId;
  wealth: number;
  /** Member of the player's house (bloodline or married/adopted in). */
  dynasty: boolean;
  spouseId?: string;
  fatherId?: string;
  motherId?: string;
  childrenIds: string[];
  alive: boolean;
  death?: Death;
  imprisonedUntil?: number; // absolute week
  /** Week a natural-death warning was issued (natural death requires a prior warning). */
  warnedWeek?: number;
  /** Hidden running total of money this capo has skimmed since last confronted. */
  skimmed?: number;
  /** Kick-ups a slow-paying capo held back over the winter and still owes. */
  arrears?: number;
  /** Away on a job until this absolute week. */
  busyUntil?: number;
  /** Hired specialist (safecracker, wheelman ...). Specialists don't hustle or staff rackets. */
  specialty?: Specialty;
  /** Arrests/convictions on his sheet. A front man must have none. */
  record?: number;
  /** A clean civilian who fronts licenses and charters for the family. */
  frontMan?: boolean;
  /** What the law has on him, 0-100 (grand jury at 60, indictment at 80). */
  evidence?: number;
  /** Weeks without the boss's attention (associates/soldiers). */
  neglect?: number;
  /** 0 none · 1 seen with a rival · 2 about to walk. */
  defectStage?: number;
  /** Soldiers/associates: how much of his hustle you take. */
  policy?: CrewPolicy;
  /** Capos: share of his district's take he keeps (the contract). */
  keep?: number;
  /** Specialists: weekly fee. */
  fee?: number;
  /** Week of the last "getting too big" event. */
  bigWeek?: number;
  /** Public office held by a fictional official (police sergeant, judge ...). */
  office?: string;
  /** This man secretly informs for another faction. */
  informantFor?: FactionId;
  /** The lifestyle this man lives (the boss chooses his). */
  lifestyle?: LifestyleState;

  /* ---- Crew & hierarchy (crew-life pillar) ---- */
  /** Soldiers, associates and outside guys: the capo whose regime he belongs to (undefined = unassigned). */
  capoId?: string;
  /** What he is good at on the street. */
  craft?: Craft;
  /** Outside guys (not members): bookie, fence, numbers runner, a cop or politician on the pad. */
  outside?: OutsideRole;
  /** What he wants out of life. */
  goal?: PersonalGoal;
  /** Weaknesses (kept non-explicit). */
  vices?: Vice[];
  /** Wife and kids, by name (lightweight: not full characters). */
  household?: Household;
  /** What he brought in last week (gross, before your cut). */
  lastEarn?: number;
  /** His personal chronicle (most recent last, capped). */
  story?: StoryEntry[];
  /** Who this person is to their house (housesKin.ts): 'matriarch', 'uncle', 'cousin', 'inlaw', 'godchild' ... */
  kinRoles?: KinRole[];
  /** The made man who vouched for him (responsible if he goes bad). */
  vouchedBy?: string;
  /** Proposed to Philadelphia for membership on this week (waiting for the books). */
  proposedWeek?: number;
  /** A background check has been run on him (week). */
  checkedWeek?: number;
  /** He owes a rival's shylock. */
  debtTo?: { rival: RivalId; amount: number; week: number };
  /** A rival has been courting him (since week). */
  courtedBy?: { rival: RivalId; week: number };
  /** Week he was last the subject of a popup (per-character cooldown). */
  lastAskWeek?: number;
  /** Took the oath (week). */
  madeWeek?: number;
  /** Expanded attributes (power pillar): six groups, ~38 values 0-100. */
  attrs?: ExtAttrs;
  /** His record of achievements (separate from the attributes). */
  success?: StoryEntry[];

  /* ---- Story & romance pillar ---- */
  /** Fixed at birth (see storyState.orientationFor). */
  orientation?: Orientation;
  /** The real biological father, when it is not the father of record (hidden paternity). */
  bioFatherId?: string;
  /** Made his bones: the jobs on his record (bones.ts). */
  bones?: BonesEntry[];
  /** Chosen look (character creator): overrides the portrait genes and styles. */
  appearance?: Appearance;
}

/** Portrait overrides: gene values 0..1 by locus, plus a hair style and moustache. */
export interface Appearance {
  genes?: Record<string, number>;
  hair?: string;
  stache?: string;
  /** 'fedora' or 'none' (otherwise as his station dresses him). */
  hat?: string;
}

export type Craft = 'muscle' | 'earner' | 'driver' | 'bookmaker' | 'collector' | 'burglar' | 'talker';
export type OutsideRole = 'bookie' | 'fence' | 'runner' | 'cop' | 'politician';
export type PersonalGoal = 'get_made' | 'own_bar' | 'become_capo' | 'get_out' | 'get_rich' | 'take_chair';
export type Vice = 'horses' | 'women' | 'booze' | 'cards' | 'debt';

export interface Household {
  wife?: string;
  kids: { name: string; male: boolean; born: number }[];
}

export interface StoryEntry {
  week: number;
  text: string;
}

/** Philadelphia's membership books. */
export interface Books {
  open: boolean;
  /** Makings left while open. */
  slots: number;
  /** Week the books next open or close. */
  nextChange: number;
}

/** How an order reaches the street. */
export type OrderVia = 'direct' | 'underboss' | 'capo';

/** Counters for the simulator and the chronicle. */
export interface CrewStats {
  defections: number;
  coups: number;
  flips: number;
  makings: number;
  rivalCrewMoves: number;
}

/** The Long Game: the federal case against the boss. */
export type LegalStage = 'quiet' | 'investigation' | 'grandjury' | 'indicted' | 'trial' | 'prison' | 'parole';
export interface LegalState {
  stage: LegalStage;
  /** The man the case is against (a new boss starts clean-ish). */
  personId: string;
  /** The evidence lives on the person (Character.evidence): one file per man. */
  defense: number;
  since: number;
  /** Week of the next step (grand jury vote, trial, parole hearing, end of parole). */
  next?: number;
  bail?: boolean;
  sentence?: number;
  rico?: boolean;
  /** Weeks of prison already served (for parole). */
  served?: number;
}
export type LegalOp = 'defense' | 'evidence' | 'bail' | 'jail' | 'plea' | 'fight' | 'verdict' | 'parole';

/** The Underbelly: an antagonist outfit that preys on people. Villain only. */
export type UnderbellyOp = 'investigate' | 'expose' | 'runout' | 'ally';
export interface UnderbellyState {
  stage: 'waiting' | 'active' | 'gone' | 'entrenched';
  /** How dug-in it is (0 = gone). */
  strength: number;
  /** What you can prove (0–100). */
  exposure: number;
  districts: string[];
  since: number;
  arrives: number;
  ally?: RivalId;
  outcome?: string;
}

export type LifestyleId = 'muscle' | 'money' | 'politics' | 'family' | 'shadows';
export interface LifestyleState {
  focus: LifestyleId;
  xp: number;
  points: number;
  perks: string[];
}

export type Specialty = 'safecracker' | 'wheelman' | 'torpedo' | 'accountant' | 'lawyer' | 'forger' | 'doctor';

/** How the boss treats a soldier's own hustle. */
export type CrewPolicy = 'tax' | 'earn' | 'squeeze';

export type Seat = 'underboss' | 'consigliere' | 'bagman' | 'enforcer' | 'fixer';
export type CouncilTask =
  | 'ub_discipline' | 'ub_streets' | 'ub_guard'
  | 'cons_relations' | 'cons_secrets' | 'cons_table'
  | 'bag_launder' | 'bag_tax' | 'bag_book'
  | 'enf_collect' | 'enf_intimidate' | 'enf_protect'
  | 'fix_cops' | 'fix_favors' | 'fix_feds';

export interface CouncilSeat {
  holderId?: string;
  task: CouncilTask;
  /** For tasks aimed at someone (improve relations with a rival). */
  target?: string;
}

export type EdictId = 'omerta' | 'blitz' | 'nojunk' | 'lowprofile';

/** Someone available to hire this month (created as a character when hired). */
export interface HireSpec {
  id: string;
  kind: 'recruit' | Specialty;
  firstName: string;
  lastName: string;
  ethnicity: Ethnicity;
  age: number;
  skill: number;
  cost: number;
  /** Weekly fee for specialists. */
  fee: number;
  traits: Trait[];
}

/** Discontented men who have banded together (CK factions). */
export interface Faction {
  id: string;
  leaderId: string;
  memberIds: string[];
  demand: 'contracts' | 'abdicate' | 'head';
  /** Target of a 'head' demand. */
  targetId?: string;
  since: number;
  ultimatumWeek?: number;
  /** What they say they want (CK faction agenda). Defaults from `demand`. */
  agenda?: FactionAgenda;
  /** For 'underboss': the man they want in the seat. */
  candidateId?: string;
  /** 0 demand · 1 ultimatum · 2 gone to Philadelphia behind your back · 3 coup. */
  stage?: number;
  /** Week of the last escalation. */
  stageWeek?: number;
  /** Display name: "the Boardwalk guys". */
  name?: string;
}

export type FactionAgenda = 'kickup' | 'underboss' | 'narcotics' | 'contracts' | 'abdicate' | 'head';

export interface OpinionModifier {
  id: string;
  reason: string;
  value: number;
  /** Absolute amount the modifier moves toward 0 each month. 0 = permanent. */
  decay: number;
  week: number;
}

export interface Relation {
  from: string;
  to: string;
  modifiers: OpinionModifier[];
  fear: number; // 0-100
  trust: number; // 0-100
  grievance: number; // 0-100
}

/** Legit fronts wash money; rackets earn dirty money; properties do neither. */
export type BusinessCategory = 'front' | 'racket' | 'property';

export type BusinessKind =
  // fronts
  | 'restaurant' | 'pizza' | 'stand' | 'motel' | 'bar' | 'construction' | 'vending' | 'laundromat' | 'carlot'
  | 'arcade' | 'boarding' | 'club' | 'bank' | 'casino'
  // rackets
  | 'numbers' | 'bookmaking' | 'loansharking' | 'cardgame' | 'vice' | 'stag' | 'blackmail' | 'jewel' | 'bankcrew'
  | 'fencing' | 'narcotics'
  // property
  | 'safehouse'
  // economy pillar (wave 2): transport, services, entertainment, nightlife
  | 'cargo' | 'trucking' | 'towing' | 'waste' | 'cleaning' | 'bidrig' | 'labor' | 'taxi' | 'pawn' | 'label' | 'talent'
  | 'burlesque' | 'gentsclub' | 'hoodclub' | 'supperclub' | 'adulttheater' | 'filmdist' | 'deli' | 'concrete' | 'lumber'
  // the Start-a-Racket menu (racketMenu.ts): every classic operation, abstract
  | 'protection' | 'afterhours' | 'bootleg' | 'cigarettes' | 'guns' | 'counterfeit' | 'insurance' | 'bustout'
  | 'washing' | 'chopshop' | 'court' | 'payoff' | 'taxdodge';

export interface Business {
  id: string;
  name: string;
  kind: BusinessKind;
  districtId: string;
  owner: FactionId;
  weeklyBase: number; // pre-season-multiplier gross
  upkeep: number; // weekly flat cost
  heat: number; // local heat generated per week
  closedUntil?: number; // absolute week; raided businesses close for a while
  category?: BusinessCategory;
  /** Crew assigned to run it (rackets need made men; most fronts run on civilians). */
  staffIds?: string[];
  boughtWeek?: number;
  /** What it cost, for resale. */
  cost?: number;
}

/** A shylock loan on the street. */
export interface Loan {
  id: string;
  borrower: string;
  /** What he put up, if anything (a bar, a car lot ...) — can be taken over on default. */
  collateral?: BusinessKind;
  collateralName?: string;
  principal: number;
  /** Weekly vig in dollars. */
  vig: number;
  /** Chance per week he misses a payment. */
  risk: number;
  weeksLate: number;
  dueWeek: number;
  week: number;
}

export interface NewsItem {
  week: number;
  date: GameDate;
  paper: string;
  headline: string;
  body: string;
  kind: string;
}

/** Long-term ambitions: a bank charter, and the casino dream. */
export interface Goals {
  bankWeek?: number;
  /** 0 none · 1 land optioned · 2 license applied · 3 licensed (waiting to open) · 4 open */
  casinoStage: number;
  casinoSince?: number;
  landSold?: boolean;
}

export interface District {
  id: string;
  name: string;
  streetBase: number;
  /** influence per faction, sum <= 100 */
  influence: Partial<Record<FactionId, number>>;
  capoId?: string;
  description: string;
}

export type RivalGoal = 'conquer' | 'enrich' | 'revenge' | 'legitimacy' | 'survive' | 'headline' | 'squeeze';
export type RivalMove = 'expand' | 'ally' | 'strike' | 'offer_deal' | 'hide' | 'bribe' | 'inform';

export interface Rival {
  id: RivalId;
  name: string;
  shortName: string;
  kind: 'mob' | 'philly' | 'law';
  leaderId: string;
  goal: RivalGoal;
  money: number;
  muscle: number; // 0-100
  exposure: number; // 0-100, the rival's own heat
  homeDistrict?: string;
  lastMove?: { week: number; move: RivalMove; target: string; text: string };
  moveCooldowns: Partial<Record<RivalMove, number>>;
  /** Blood feud with the player (an unsanctioned killing). */
  feud?: boolean;
  /** At war with the player (see war.ts). */
  war?: boolean;
}

export interface EffectBase {
  /** Optional override label used in the weekly report. */
  label?: string;
}

export type Effect =
  | ({ type: 'money'; amount: number; category?: LedgerCategory; /** 'pocket': the boss's own money pays (the rest from the Family); a gain goes into his pocket. */ pot?: 'pocket' } & EffectBase)
  | ({ type: 'respect'; amount: number } & EffectBase)
  | ({ type: 'heat'; bar: HeatBar; amount: number } & EffectBase)
  | ({ type: 'opinion'; from: string; to: string; amount: number; reason: string; decay?: number } & EffectBase)
  | ({ type: 'meter'; from: string; to: string; meter: 'fear' | 'trust' | 'grievance'; amount: number } & EffectBase)
  | ({ type: 'crewOpinion'; amount: number; reason: string; traitMods?: Partial<Record<Trait, number>> } & EffectBase)
  | ({ type: 'familyOpinion'; amount: number; reason: string } & EffectBase)
  | ({ type: 'rivalOpinion'; rival: RivalId; amount: number; reason: string } & EffectBase)
  | ({ type: 'influence'; district: string; faction: FactionId; amount: number } & EffectBase)
  | ({ type: 'schedule'; key: string; minWeeks: number; maxWeeks: number; chance: number; hint: string; params?: Record<string, string | number> } & EffectBase)
  | ({ type: 'kill'; charId: string; cause: string; killer?: FactionId } & EffectBase)
  | ({ type: 'imprison'; charId: string; weeks: number } & EffectBase)
  | ({ type: 'rank'; charId: string; rank: Rank; district?: string } & EffectBase)
  | ({ type: 'closeBusiness'; businessId: string; weeks: number } & EffectBase)
  | ({ type: 'recruit'; charId: string } & EffectBase)
  | ({ type: 'health'; charId: string; amount: number } & EffectBase)
  | ({ type: 'debt'; lender: string; principal: number; weeklyPayment: number; weeks: number } & EffectBase)
  | ({ type: 'skimReset'; charId: string } & EffectBase)
  | ({ type: 'addBusiness'; business: Business } & EffectBase)
  | ({ type: 'flag'; key: string; value: number } & EffectBase)
  | ({ type: 'rivalResource'; rival: RivalId; money?: number; muscle?: number; exposure?: number } & EffectBase)
  | ({ type: 'removeBusiness'; businessId: string } & EffectBase)
  | ({ type: 'loan'; amount: number } & EffectBase)
  | ({ type: 'frontMan' } & EffectBase)
  | ({ type: 'favor'; amount: number } & EffectBase)
  | ({ type: 'goal'; key: 'bank' | 'land' | 'sellLand' | 'license' } & EffectBase)
  | ({ type: 'unwashed'; amount: number } & EffectBase)
  | ({ type: 'loanResolve'; loanId: string; mode: 'collect' | 'grace' | 'writeoff' } & EffectBase)
  | ({ type: 'exile'; charId: string } & EffectBase)
  | ({ type: 'wealth'; charId: string; amount: number } & EffectBase)
  | ({ type: 'seat'; seat: Seat; charId?: string; task?: CouncilTask; target?: string } & EffectBase)
  | ({ type: 'policy'; charId: string; policy: CrewPolicy } & EffectBase)
  | ({ type: 'lifestyle'; focus: LifestyleId } & EffectBase)
  | ({ type: 'legal'; op: LegalOp; amount?: number } & EffectBase)
  | ({ type: 'underbelly'; op: 'strength' | 'exposure' | 'ally' | 'expose' | 'runout'; amount?: number; rival?: RivalId } & EffectBase)
  | ({ type: 'perk'; perk: string } & EffectBase)
  | ({ type: 'contract'; charId: string; keep: number } & EffectBase)
  | ({ type: 'edict'; edict: EdictId; on: boolean } & EffectBase)
  | ({ type: 'hire'; specId: string } & EffectBase)
  | ({ type: 'attention'; charId: string } & EffectBase)
  | ({ type: 'faction'; factionId: string; outcome: 'disband' } & EffectBase)
  | ({ type: 'hook'; targetId: string; strong: boolean; reason: string; spend?: boolean } & EffectBase)
  | ({ type: 'secretKnown'; secretId: string } & EffectBase)
  | ({ type: 'startScheme'; scheme: Omit<Scheme, 'id' | 'progress' | 'startWeek' | 'discovered'> } & EffectBase)
  | ({ type: 'endScheme'; schemeId: string } & EffectBase)
  | ({ type: 'claim'; district: string; against: FactionId; reason: string } & EffectBase)
  | ({ type: 'feud'; rival: RivalId } & EffectBase)
  | ({ type: 'warStart'; rival: RivalId; district: string; cb: CasusBelli; sanctioned: boolean } & EffectBase)
  | ({ type: 'warScore'; warId: string; amount: number } & EffectBase)
  | ({ type: 'warEnd'; warId: string; outcome: 'won' | 'lost' | 'white'; terms?: 'district' | 'tribute' | 'white' } & EffectBase)
  | ({ type: 'dispute'; dispute: Omit<Dispute, 'id' | 'raisedWeek' | 'hearingWeek' | 'lobby' | 'plea'> } & EffectBase)
  | ({ type: 'lobby'; disputeId: string; memberId: string; amount: number } & EffectBase)
  | ({ type: 'plea'; disputeId: string; amount: number } & EffectBase)
  | ({ type: 'sanction'; targetId: string; weeks: number } & EffectBase)
  | ({ type: 'ruling'; disputeId: string; comply: boolean } & EffectBase)
  | ({ type: 'permit'; city: string; weeks: number } & EffectBase)
  | ({ type: 'standing'; city: string; amount: number } & EffectBase)
  /** The dynasty layer (familyState.ts / family.ts). */
  | ({ type: 'dyn'; op: DynOp } & EffectBase)
  /** The power pillar (power.ts): succession, heirs, grievances, crises, blitzes, fronts, petitions. */
  | ({ type: 'power'; op: PowerOp } & EffectBase)
  /** Politics, law-makers and the living world (politics.ts). */
  | ({ type: 'pol'; op: PolOp } & EffectBase)
  | ({ type: 'evidence'; charId: string; amount: number } & EffectBase)
  | ({ type: 'assign'; charId: string; capoId?: string } & EffectBase)
  | ({ type: 'story'; charId: string; text: string } & EffectBase)
  | ({ type: 'propose'; charId: string; voucherId: string } & EffectBase)
  | ({ type: 'making'; charId: string } & EffectBase)
  | ({ type: 'courted'; charId: string; rival?: RivalId } & EffectBase)
  | ({ type: 'debtTo'; charId: string; clear: true } & EffectBase)
  | ({ type: 'household'; charId: string; wife?: string; kid?: { name: string; male: boolean } } & EffectBase)
  | ({ type: 'goalSet'; charId: string; goal?: PersonalGoal } & EffectBase)
  | ({ type: 'flip'; charId: string } & EffectBase)
  | ({ type: 'retire'; charId: string } & EffectBase)
  | ({ type: 'faction2'; factionId: string; op: 'stage' | 'remove' | 'promote'; memberId?: string } & EffectBase)
  | ({ type: 'checkBackground'; charId: string } & EffectBase)
  /** The story pillar: pack secrets, romance, paternity (storyOps.ts). */
  | ({ type: 'storyOp'; op: StoryOp } & EffectBase)
  /** A mini-game (minigame.ts): played full-screen, or auto-resolved with the same odds ("let it play out"). */
  | ({ type: 'minigame'; game: MinigameId; iid: string; params: Record<string, string | number>; parts?: Record<string, Effect[]> } & EffectBase)
  /** The economy & property layer (econState.ts / econ.ts). */
  | ({ type: 'econ'; op: EconOp } & EffectBase)
  /** Travel, trips and flight (travelState.ts / travel.ts / fugitive.ts). */
  | ({ type: 'travel'; op: TravelOp } & EffectBase)
  /** New York (nyc.ts): the five families' opinion, grievance, a settlement. */
  | ({ type: 'nyc'; op: import('./nyc').NycOp } & EffectBase)
  /** Making your bones (bones.ts). */
  | ({ type: 'bones'; op: BonesOp } & EffectBase)
  /** The boss's books and the receipts (ledgerbook.ts). */
  | ({ type: 'ledger'; op: LedgerOp } & EffectBase)
  /** The weekly take (tributeOps.ts). */
  | ({ type: 'tribute'; op: import('./tributeOps').TributeOp } & EffectBase)
  /** The Ears: the Madam, the nightlife workers, the connection web (ears.ts). */
  | ({ type: 'ears'; op: EarsOp } & EffectBase)
  /** The living district: requests from its people, asking around, help (livingAsk.ts). */
  | ({ type: 'living'; op: import('./livingAsk').LivingOp } & EffectBase)
  /** Relationships & Dating: dates, gifts, paid company, introductions (dating.ts). */
  | ({ type: 'dating'; op: import('./dating').DatingOp } & EffectBase)
  /** Nightlife: payroll, promises, the goomar, houses (nightlife.ts). */
  | ({ type: 'nightlife'; op: import('./nightlife').NightOp } & EffectBase)
  /** Your People: the deep relationships (bonds.ts). */
  | ({ type: 'bond'; op: import('./bonds').BondOp } & EffectBase);

export interface Choice {
  id: string;
  label: string;
  /** Short flavour/explanation for the button. */
  detail?: string;
  effects: Effect[];
  /** Short phrase used in the chronicle: "because you <because>". */
  because: string;
  disabledReason?: string;
}

export interface EventInstance {
  iid: string;
  defId: string;
  title: string;
  text: string;
  week: number;
  choices: Choice[];
  defaultChoiceId: string;
  /** True for events that must be shown (bagman, funerals, sit-down) */
  mandatory: boolean;
  /** Higher shows first */
  priority: number;
  meta?: Record<string, string | number>;
  /** Characters shown with portraits on the event card. */
  actors?: string[];
}

export type SchemeKind = 'murder' | 'claim' | 'blackmail' | 'informant' | 'heist' | 'envoy' | 'befriend' | 'sway' | 'flip' | 'frame';
export type HitLocation = 'barbershop' | 'boardwalk' | 'car' | 'restaurant';
export type SchemeDepth = 'rushed' | 'planned' | 'meticulous';
export type HeistKind = 'jewelry' | 'armored' | 'bank';

export interface SchemeOptions {
  depth: SchemeDepth;
  location?: HitLocation;
  disposal?: 'disappear' | 'public';
  frame?: RivalId;
  equipment?: 'street' | 'clean' | 'untraceable';
  alibi?: boolean;
  secretId?: string;
  heist?: HeistKind;
  city?: string;
  district?: string;
}

/** A plan in motion (CK scheme): agents, weekly progress, secrecy, a final roll. */
export interface Scheme {
  id: string;
  kind: SchemeKind;
  owner: FactionId;
  ownerId: string;
  targetId?: string;
  agents: string[];
  opts: SchemeOptions;
  progress: number;
  startWeek: number;
  /** Known to the other side. */
  discovered: boolean;
  because: string;
}

export type SecretKind = 'affair' | 'skimming' | 'informant' | 'drugs' | 'debt' | 'murder' | 'bastard' | 'plot';

export interface Secret {
  id: string;
  ownerId: string;
  kind: SecretKind;
  text: string;
  /** Factions that know it ('player' = your house). */
  knownBy: FactionId[];
  week: number;
}

/** Leverage over someone: weak hooks are spent when used; strong ones last. */
export interface Hook {
  id: string;
  holder: FactionId;
  targetId: string;
  strong: boolean;
  reason: string;
  week: number;
  usedWeek?: number;
}

/** A casus belli on a district held by someone else. */
export interface Claim {
  district: string;
  against: FactionId;
  week: number;
  reason: string;
}

/** Your foothold in another city (envoys open them). */
export interface Outpost {
  /** City id (see cities.ts). */
  city: string;
  kind: 'contact' | 'partner' | 'franchise';
  income: number;
  since: number;
  envoyId?: string;
}

export type CasusBelli = 'claim' | 'grievance' | 'feud' | 'sanction';

export interface War {
  id: string;
  rival: RivalId;
  /** The district being fought over. */
  district: string;
  cb: CasusBelli;
  sanctioned: boolean;
  /** −100 (they are winning) .. +100 (you are winning). */
  score: number;
  startWeek: number;
}

export type DisputeKind = 'district' | 'sanction' | 'reparations' | 'peace' | 'war';

/** A matter before the Table (Philadelphia's South Jersey sit-down). */
export interface Dispute {
  id: string;
  kind: DisputeKind;
  plaintiff: FactionId;
  defendant: FactionId;
  /** One line each: what each side says. */
  claim: string;
  defense: string;
  district?: string;
  targetId?: string;
  amount?: number;
  warId?: string;
  raisedWeek: number;
  hearingWeek: number;
  /** Extra weight bought for the player's side, per Table member id. */
  lobby: Record<string, number>;
  /** Bonus from the plea the player made at the hearing. */
  plea: number;
  /** Set once the vote has happened. */
  ruling?: { forPlayer: boolean; votes: Record<string, boolean>; week: number };
}

/** A full-screen title card the UI shows after the week (video slot optional). */
export interface CutsceneCue {
  key: string;
  title: string;
  text: string;
  week: number;
}

export interface ScheduledConsequence {
  id: string;
  key: string;
  dueWeek: number;
  because: string;
  sourceWeek: number;
  params: Record<string, string | number>;
}

export interface ChronicleEntry {
  week: number;
  date: GameDate;
  text: string;
  because?: string;
  becauseWeek?: number;
  kind: 'decision' | 'consequence' | 'death' | 'succession' | 'rival' | 'family' | 'heat' | 'misc';
}

export interface DynastyEntry {
  week: number;
  date: GameDate;
  text: string;
}

export type SuccessionLaw = 'blood' | 'appointed' | 'capos_elect' | 'underboss';

export interface Debt {
  id: string;
  lender: string;
  principal: number;
  weeklyPayment: number;
  weeksLeft: number;
}

export type LedgerCategory =
  | 'street'
  | 'business'
  | 'kickup'
  | 'cost'
  | 'tribute'
  | 'debt'
  | 'event'
  | 'rival'
  | 'heat'
  | 'consequence'
  | 'drift'
  /** Money moved between the family's own accounts (tribute.ts): never revenue. */
  | 'transfer';

export interface ReportLine {
  stat: Stat;
  /** Amount actually applied (after clamping). */
  amount: number;
  /** Amount requested before clamping, if different. */
  requested?: number;
  label: string;
  category: LedgerCategory;
  /** Who paid it / was paid (character id), for the boss's books. */
  who?: string;
  /** Which racket, business or district (id), for the boss's books. */
  src?: string;
}

export interface WeeklyReport {
  week: number;
  date: GameDate;
  seasonLabel: string;
  multiplier: number;
  grossIncome: number;
  start: { money: number; respect: number; heat: Record<HeatBar, number> };
  end: { money: number; respect: number; heat: Record<HeatBar, number> };
  lines: ReportLine[];
  log: string[];
  /** Routine business settled without a popup this week ("In motion", storyPace.ts). */
  motion?: string[];
  /** Your Rounds and the trusted advisors' work, as short lines. */
  rounds?: string[];
}

export interface GameOver {
  week: number;
  reason: 'no_heir' | 'witness';
  text: string;
}

export interface GameState {
  version: 2;
  /** Save migrations applied (trustMigrations.ts SCHEMA); absent in older saves. */
  schema?: number;
  seed: string;
  rng: number;
  nextId: number;
  /** Absolute week index, starting at 1 (Memorial Day 1960). */
  week: number;
  date: GameDate;
  money: number;
  respect: number;
  heat: Record<HeatBar, number>;
  playerId: string;
  houseName: string;
  successionLaw: SuccessionLaw;
  designatedHeirId?: string;
  characters: Record<string, Character>;
  relations: Record<string, Relation>;
  districts: District[];
  businesses: Business[];
  rivals: Rival[];
  debts: Debt[];
  pendingEvents: EventInstance[];
  /** Events waiting to be surfaced (e.g. funerals queued by the death function). */
  eventQueue: EventInstance[];
  scheduled: ScheduledConsequence[];
  cooldowns: Record<string, number>; // defId -> week last fired
  lastSitDownOrders: string[];
  lastBagmanMonth?: string; // "1960-6"
  incomeHistory: number[]; // gross income per week, most recent last (kept short)
  weeksInRed: number;
  flags: Record<string, number>;
  chronicle: ChronicleEntry[];
  dynastyHistory: DynastyEntry[];
  lastReport?: WeeklyReport;
  startingProblem: string;
  gameOver?: GameOver;
  /** How much of the treasury is unwashed (dirty) cash. Never more than the treasury. */
  unwashed: number;
  loans: Loan[];
  /** Political favors owed to you (from bribes, blackmail, favors done). */
  favors: number;
  /** A clean front man with no record (needed for a bank charter and a casino license). */
  frontManId?: string;
  goals: Goals;
  news: NewsItem[];
  council: Record<Seat, CouncilSeat>;
  edicts: Partial<Record<EdictId, boolean>>;
  hirePool: HireSpec[];
  factions: Faction[];
  /** Title cards raised this week (cleared at the start of each week). */
  cutscenes: CutsceneCue[];
  /** The Long Game (absent in old saves until the first week runs). */
  legal?: LegalState;
  underbelly?: UnderbellyState;
  schemes: Scheme[];
  secrets: Secret[];
  hooks: Hook[];
  claims: Claim[];
  outposts: Outpost[];
  /** Table sanctions to kill someone (target id -> until week). */
  sanctions: Record<string, number>;
  wars: War[];
  disputes: Dispute[];
  /** Your standing in other cities (city id -> 0..100). */
  cityStanding: Record<string, number>;
  /** Philadelphia's permission to operate in a city (city id -> until week). */
  permits: Record<string, number>;
  /** The CK dynasty layer: houses, alliances, renown, legacies, activities (optional for old saves). */
  dyn?: DynState;
  /** Every house's tree and history (houses.ts; optional for old saves). Shared between weeks copy-on-write. */
  lineage?: LineageState;
  /** Power, succession & ambition (optional for old saves). */
  power?: PowerState;
  /** Philadelphia's membership books (optional for old saves). */
  books?: Books;
  /** Crew counters (defections, coups, flips, makings). */
  crewStats?: CrewStats;
  /** Event key -> week last shown (per-event cooldowns for crew decisions). */
  eventCooldowns?: Record<string, number>;
  /** The story director's memory (storyDirector.ts): what was shown, the bagman's visits. */
  director?: import('./storyDirector').DirectorState;
  /** Living storylines (livingStories.ts): slow-burn arcs and their stages. */
  arcs?: import('./livingStories').ArcsState;
  /** The content pack's bookkeeping (storyPack.ts). */
  story?: StoryState;
  /** Courtships, lovers, affairs, pregnancies (romance.ts). */
  romance?: RomanceState;
  /** Politics, law-makers and the living world (optional for old saves). */
  pol?: PolState;
  /** Mini-games: trials, witnesses, records (minigame.ts; optional for old saves). */
  mg?: MgState;
  /** Economy & property empire: rackets, lots, managers, HQ, gifts (optional for old saves). */
  econ?: EconState;
  /** The neighborhoods: their economy, reputation, police, history; the looks of other people's places (hoodState.ts; optional for old saves). */
  hood?: HoodState;
  /** Towns away from home that someone of yours has visited: their lots, materialized from the town package (towns.ts; optional for old saves). */
  towns?: Record<string, TownState>;
  /** Places added from the town editor's "Add a Place" into this game, by stable id (addPlace.ts; optional for old saves). */
  addedPlaces?: import('./addPlace').AddedPlaces;
  /** The living neighborhood: townsfolk, households, businesses, debts, the world-event ledger, causal stories (livingState.ts; optional for old saves). */
  living?: import('./livingState').LivingState;
  /** The town's houses: families saving, buying lots, building, moving in (housing.ts; optional for old saves). */
  housing?: import('./housing').HousingState;
  /** The real-estate market's listings (market.ts): when each came up and why. Made on first use. */
  market?: import('./market').MarketState;
  /** The Family's loan desk: the bank's or the book's lending policy, applicants, defaults (familyBank.ts; optional for old saves). */
  fbank?: import('./familyBank').FbState;
  /** Talks with people, pacts with families, the families' own diplomacy (talks.ts; optional for old saves). */
  talks?: TalkState;
  /** The Mission Board's cases (missions.ts; optional for old saves). */
  missions?: MissionState;
  /** Travel, trips and fugitives (optional for old saves). */
  travel?: TravelState;
  /** New York (nyc.ts): crews, rackets and the five families. Optional: made by the first New York order. */
  nyc?: import('./nyc').NycState;
  /** Making your bones: jobs, favors, rival prospects (optional for old saves). */
  bones?: BonesState;
  /** The boss's private ledger (optional for old saves). */
  ledgerBook?: LedgerBookState;
  /** The weekly take: accounts, agreements, the underboss's envelope (tribute.ts; optional for old saves). */
  tribute?: import('./tributeState').TributeState;
  /** The aging Don, the underboss's shadow court and the succession war (shadow.ts; optional for old saves). */
  shadow?: import('./shadowState').ShadowState;
  /** The Empire Designer: properties, buildings, venues, staff, supplies (empireState.ts; optional for old saves). */
  empire?: import('./empireState').EmpireState;
  /** The Ears: the Madam, the nightlife workers, operators, the connection web (optional for old saves). */
  ears?: EarsState;
  /** Relationships & Dating: bonds, providers, rumors, content settings (datingState.ts; optional for old saves). */
  dating?: import('./datingState').DatingState;
  /** Nightlife: the cast of the night, the madams' houses, promises, goomars, stored looks (nightlifeState.ts; optional for old saves). */
  nightlife?: import('./nightlifeState').NightlifeState;
  /** Your People: axes, memories and stages of the boss's closest ties (bondsState.ts; optional for old saves). */
  bonds?: import('./bondsState').BondsState;
  /** Spend: the catalog's purchases, retainers, the IRS's count (spendState.ts; optional: absent until the first purchase). */
  spend?: import('./spendState').SpendState;
  /** Aging & life traits: old-age conditions, learned vs effective skills, family/earned traits (aging.ts; optional, made by the monthly update). */
  aging?: import('./aging').AgingState;
  /** The Sit-Down: advisors trusted with their small stuff, and what they did (briefing.ts; optional for old saves). */
  briefing?: import('./briefing').BriefingState;
  /** Your Rounds: the boss's evenings, the lanes' neglect, the advisors' free hand (rounds.ts; optional, starts when used). */
  rounds?: import('./rounds').RoundsState;
  /** The week as days: the clock's day, the evenings and the check-in answers (days.ts; optional, dropped when the week turns). */
  days?: import('./days').DaysState;
  /** Planned moves against the boss and the urgent meetings that warn of them (threats.ts; optional for old saves). */
  threats?: import('./threats').ThreatsState;
  /** The boss's hours today: what his orders have spent, what is booked ahead, late nights and missed dinners (timeCost.ts; optional, starts when used). */
  hours?: import('./timeCost').HoursState;
  /** Dirty work: one-off jobs, their cooldowns and results (dirtyWork.ts; optional, starts when used). */
  dirty?: import('./dirtyWork').DirtyState;
  /** Family development: technology, connections, crew equipment, the other families' progress (devState.ts; optional for old saves). */
  dev?: import('./devState').DevState;
  /** The town papers: the Daily Tide and the Weekly Leader, their archive, the boss's ads, plants and suits (paper.ts; optional, made by the weekly update). */
  paper?: import('./paper').PaperState;
}

export interface PlayerChoices {
  /** eventInstance iid -> choice id. Unanswered events take their default choice. */
  choices?: Record<string, string>;
  /** Orders the player queued this week (buy a business, launch a job ...). Resolved in order. */
  actions?: PlayerAction[];
  successionLaw?: SuccessionLaw;
  designatedHeirId?: string;
  /** Mini-games the player played this week: event iid -> the moves he made (replayed by the engine). */
  minigames?: Record<string, string[]>;
  /** The Monday envelope split the Don chose in the audience (tribute.ts), and the petitions he granted. */
  envelope?: import('./tributeOps').EnvelopeChoice;
  /** Sit-Down items the boss said "not now" to (trusted advisors leave them alone). */
  briefingSkip?: string[];
  /** Your Rounds: the evenings the boss lives this week (round ids from rounds.ts). */
  rounds?: string[];
  /** The morning check-ins (checkins.ts): "day:capoId" -> answer id. Undefined: the layer is off this week. */
  checkins?: Record<string, string>;
  /** Mornings the boss skipped the check-in (0 Monday … 6 Sunday). */
  skipDays?: number[];
}

/**
 * How an order may be paid. A boss's-own-things order is paid from his Pocket;
 * `fund: 'family'` is the player's explicit consent (given on the button that
 * names the amount) for the Family to pay what the Pocket can't. Without it a
 * pocket order that comes up short at settlement is not carried out.
 */
export interface ActionFunding { fund?: 'family' }

export type PlayerAction = ActionFunding & (
  | { kind: 'buyBusiness'; biz: BusinessKind; district: string }
  | { kind: 'sellBusiness'; businessId: string }
  | { kind: 'lend'; amount: number }
  | { kind: 'findFrontMan' }
  | { kind: 'charterBank' }
  | { kind: 'casino'; sell?: boolean }
  | { kind: 'interact'; id: InteractionId; target: string; useHook?: boolean }
  | { kind: 'scheme'; scheme: SchemeKind; targetId?: string; agents: string[]; opts: SchemeOptions }
  | { kind: 'cancelScheme'; schemeId: string }
  | { kind: 'declareWar'; rival: RivalId; district: string }
  | { kind: 'raid'; warId: string }
  | { kind: 'terms'; warId: string; terms: 'district' | 'tribute' | 'white' }
  | { kind: 'raiseDispute'; dispute: DisputeKind; rival: RivalId; district?: string; targetId?: string; warId?: string }
  | { kind: 'lobby'; disputeId: string; memberId: string; mode: 'money' | 'favor' | 'hook' }
  | { kind: 'askPermission'; city: string }
  | { kind: 'pushDistrict'; district: string }
  | { kind: 'appoint'; seat: Seat; charId: string }
  | { kind: 'councilTask'; seat: Seat; task: CouncilTask; target?: string }
  | { kind: 'policy'; charId: string; policy: CrewPolicy }
  | { kind: 'contract'; charId: string; keep: number }
  | { kind: 'edict'; edict: EdictId; on: boolean }
  | { kind: 'hire'; specId: string }
  | { kind: 'dynasty'; op: DynAction }
  | { kind: 'power'; op: PowerAction }
  | { kind: 'lifestyle'; focus: LifestyleId }
  | { kind: 'legal'; op: 'retainer' | 'lielow' }
  | { kind: 'underbelly'; op: UnderbellyOp; rival?: RivalId }
  | { kind: 'officeHours' }
  | { kind: 'perk'; perk: string }
  | { kind: 'reassign'; charId: string; capoId: string }
  | { kind: 'propose'; charId: string; voucherId?: string }
  | { kind: 'background'; charId: string }
  | { kind: 'order'; key: string; via: OrderVia }
  | { kind: 'econ'; op: EconAction }
  | { kind: 'hood'; op: HoodAction }
  /** The living district (livingAsk.ts): ask around about someone, help a family. */
  | { kind: 'living'; op: import('./livingAsk').LivingAction }
  | { kind: 'talk'; op: TalkOp }
  | { kind: 'mission'; op: MissionOp }
  | { kind: 'travel'; op: TravelAction }
  | { kind: 'pol'; op: PolAction }
  | { kind: 'bones'; op: BonesAction }
  | { kind: 'ledger'; op: LedgerAction }
  | { kind: 'tribute'; op: import('./tributeOps').TributeAction }
  | { kind: 'ears'; op: EarsAction }
  /** Dirty work: a one-off job (dirtyWork.ts). */
  | { kind: 'dirty'; op: import('./dirtyWork').DirtyAction }
  /** Family development: technology, connections and crew equipment (develop.ts). */
  | { kind: 'dev'; op: import('./develop').DevAction }
  /** Relationships & Dating (dating.ts): invite, gifts, going steady, paid company, introductions. */
  | { kind: 'dating'; op: import('./dating').DatingAction }
  /** Nightlife (nightlife.ts): payroll, promises, the goomar, the madams' protection. She decides. */
  | { kind: 'nightlife'; op: import('./nightlife').NightAction }
  /** Your People (bonds.ts): your wife, your goomars, your kids, your friends, your enemies. They decide. */
  | { kind: 'bond'; op: import('./bonds').BondAction }
  /** Spend (spend.ts): buy from the catalog, or sell / let go what you have. */
  | { kind: 'spend'; op: import('./spendState').SpendAction }
  /** New York (nyc.ts): open a crew, buy into a racket, the families' blessing, tribute, the Commission. */
  | { kind: 'nyc'; op: import('./nyc').NycAction }
  /** The town papers (paper.ts): plant or spike a story, run an ad, buy the paper, sue it. */
  | { kind: 'paper'; op: import('./paper').PaperAction }
);

export type InteractionId =
  | 'gift_small' | 'gift_large' | 'demand' | 'threaten' | 'recruit' | 'favor' | 'dinner'
  | 'promote' | 'demote' | 'exile' | 'make' | 'whack' | 'bringIn' | 'bribe' | 'expose'
  /* romance (romance.ts) */
  | 'court' | 'affair' | 'endRomance' | 'proposeMarriage' | 'separate';

export interface AdvanceResult {
  state: GameState;
  report: WeeklyReport;
  log: string[];
}
