/**
 * Core game-state types. Everything here is plain, JSON-serializable data:
 * no classes, no functions, no Dates. The whole GameState can be stored in
 * localStorage and restored byte-for-byte.
 */

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
}

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

export type BusinessKind = 'club' | 'numbers' | 'bookmaking' | 'arcade' | 'loansharking' | 'fencing' | 'boarding' | 'restaurant';

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
}

export interface EffectBase {
  /** Optional override label used in the weekly report. */
  label?: string;
}

export type Effect =
  | ({ type: 'money'; amount: number; category?: LedgerCategory } & EffectBase)
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
  | ({ type: 'rivalResource'; rival: RivalId; money?: number; muscle?: number; exposure?: number } & EffectBase);

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
  | 'drift';

export interface ReportLine {
  stat: Stat;
  /** Amount actually applied (after clamping). */
  amount: number;
  /** Amount requested before clamping, if different. */
  requested?: number;
  label: string;
  category: LedgerCategory;
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
}

export interface GameOver {
  week: number;
  reason: 'no_heir';
  text: string;
}

export interface GameState {
  version: 1;
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
}

export interface PlayerChoices {
  /** eventInstance iid -> choice id. Unanswered events take their default choice. */
  choices?: Record<string, string>;
  successionLaw?: SuccessionLaw;
  designatedHeirId?: string;
}

export interface AdvanceResult {
  state: GameState;
  report: WeeklyReport;
  log: string[];
}
