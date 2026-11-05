import { addFedEvidence, ensureFeds } from './fedsState';
import { isOperating } from './placeEligibility';
import { offerCut } from './cutScore';
import { isInSeason } from './calendar';
import { devJobBonus } from './devState';
import { dirtyXp, xpEvidenceMult, xpJobOdds, xpRatMult, xpTakeMult } from './crewXp';
import { crewStrength } from './strength';
import { ageOn } from './calendar';
import { crew, displayName, hasTrait, isFree } from './characters';
import { owned } from './business';
import { CATALOG } from './catalog';
import { applyEffects } from './effects';
import { schemeOdds } from './schemes';
import { OFFICE_BRIBE } from './interactions';
import { lotName, ZONES_BY_ID } from './property';
import { opinion } from './relations';
import { hashSeed, rand, type RngHolder } from './rng';
import { FACTION_NAMES } from './world';
import type { Ctx } from './ledger';
import type { ActionPreview } from './actions';
import type { Lot } from './econState';
import type { Attributes, Business, Character, Effect, GameState, PlayerAction, RivalId, SchemeOptions, Specialty } from './types';

/**
 * DIRTY WORK: easy one-off illegal jobs, in one obvious place. Four tiles
 * (Scores, Muscle, Fixes, Moving goods); each job is pick it -> who does it
 * (his fit: skill, nerve, loyalty, heat) -> a target when it needs one ->
 * one plain summary (the take, the odds, the heat, the risk of an arrest, a
 * witness or a rat, who objects, who pays) -> one "Do it" button.
 *
 * Jobs the game already had are wrapped, not copied: the jewel and payroll
 * jobs are the heist scheme, a hit is the murder scheme, the bust-out is the
 * racket, a bribe is the interaction. The rest are data here and resolve in
 * `commitDirty` (inside advanceWeek's orders) on this layer's own seeded
 * stream, so they never reshuffle the main dice.
 *
 * Abstract on purpose: money, odds, heat and who objects, never method.
 * Violence is implied. Adults only. Nobody is trafficked or coerced into
 * anything. Landmarks (Club Avalon, the Boardwalk Chapel) are never targets.
 */

export type DirtyTile = 'scores' | 'muscle' | 'fixes' | 'goods';
export type DirtyJobId =
  | 'hijack' | 'cardgame' | 'jewel' | 'payroll' | 'warehouse' | 'cars' | 'torch' | 'bustout'
  | 'shakedown' | 'welsher' | 'runoff' | 'breakgame' | 'beating' | 'hit'
  | 'bribe' | 'fixrace' | 'rigbid' | 'juror' | 'witness' | 'evidence'
  | 'smokes' | 'booze' | 'guns' | 'dope' | 'fence';

/** What a job is aimed at (the target step). */
export type TargetKind = 'route' | 'fix' | 'shop' | 'rivalLot' | 'rival' | 'person' | 'official' | 'loan' | 'mine';

/** The queued order: the job, the man, the target, who pays. */
export interface DirtyAction {
  job: DirtyJobId;
  who: string;
  target?: string;
  /** 'pocket': the boss pays from his own money and the take is his. */
  pay?: 'pocket';
}

export interface DirtyResult {
  week: number;
  job: DirtyJobId;
  who: string;
  target?: string;
  outcome: 'clean' | 'messy' | 'bust' | 'pinched';
  take: number;
  text: string;
  /** He talked (a rat). */
  rat?: boolean;
  /** The odds it went clean (0..1) and the roll (0..99, under the odds wins): the result card shows the dice. */
  odds?: number;
  roll?: number;
  /** Who did it, for the card ("You" or his name), and the job's title with its target. */
  label?: string;
}

export interface DirtyState {
  rng: number;
  /** Job (or job:target) -> the week it was last done. */
  cool: Record<string, number>;
  /** Men on a job this week (charId -> week). */
  busy: Record<string, number>;
  /** The latest results, newest last (kept short). */
  log: DirtyResult[];
  stats: { jobs: number; clean: number; messy: number; bust: number; pinched: number; rats: number; take: number };
}

export function ensureDirty(s: GameState): DirtyState {
  if (!s.dirty) s.dirty = { rng: hashSeed(`${s.seed}:dirty`), cool: {}, busy: {}, log: [], stats: { jobs: 0, clean: 0, messy: 0, bust: 0, pinched: 0, rats: 0, take: 0 } };
  const d = s.dirty;
  d.cool ??= {};
  d.busy ??= {};
  d.log ??= [];
  d.stats ??= { jobs: 0, clean: 0, messy: 0, bust: 0, pinched: 0, rats: 0, take: 0 };
  return d;
}

/* ------------------------------------------------------------------ */
/* The jobs                                                            */
/* ------------------------------------------------------------------ */

export const TILES: { id: DirtyTile; icon: string; label: string; blurb: string }[] = [
  { id: 'scores', icon: '💰', label: 'Scores', blurb: 'A truck off the docks, a card game, a jewel job, a payroll, a warehouse, cars for the chop shop.' },
  { id: 'muscle', icon: '✊', label: 'Muscle', blurb: 'Shake down a shop, lean on a welsher, run off a rival\'s operation, send a message, a hit.' },
  { id: 'fixes', icon: '🤝', label: 'Fixes', blurb: 'Bribe a cop or a judge, fix a fight or a race, rig a bid, buy a juror, make a witness forget.' },
  { id: 'goods', icon: '📦', label: 'Moving goods', blurb: 'A load of untaxed smokes or liquor, a gun shipment, the forbidden one, fencing a hot load.' },
];

type Skill = keyof Attributes;

export interface JobDef {
  id: DirtyJobId;
  tile: DirtyTile;
  icon: string;
  title: string;
  line: string;
  fit: Skill;
  /** A specialist who helps (+10 to the odds). */
  spec?: Specialty;
  target?: TargetKind;
  /** The target is optional (the job also works without one). */
  targetOptional?: boolean;
  cost: number;
  take: [number, number];
  /** Base odds of a clean job, %. */
  odds: number;
  /** A clean job turns messy (a witness): chance. */
  witness: number;
  /** A failed job ends in an arrest: chance. */
  arrest: number;
  heat: { local?: number; federal?: number; family?: number };
  /** Evidence on the man when it goes messy or he is picked up. */
  evidence: number;
  /** Weeks before the same job (or the same target) again. */
  cool: number;
  /** Bigger in the summer season. */
  seasonal?: boolean;
  objects: string;
  risk: string;
  philly?: string;
  /** An existing system does it: the order is that system's own. */
  wrap?: 'heist-jewelry' | 'heist-armored' | 'bustout' | 'hit' | 'bribe';
  /** The boss does it himself (no "who" step): an envelope. */
  noWho?: boolean;
}

const J = (d: JobDef) => d;

export const JOBS: JobDef[] = [
  // ---- Scores ----
  J({ id: 'hijack', tile: 'scores', icon: '🚛', title: 'Hijack a truck', line: 'A load that goes missing off the Bay Docks or Route 9. A tip, a truck, a quiet buyer.', fit: 'force', spec: 'wheelman', target: 'route', cost: 500, take: [3500, 8000], odds: 52, witness: 0.2, arrest: 0.4, heat: { local: 4, federal: 2 }, evidence: 10, cool: 5, seasonal: true, objects: 'The trucking company\'s insurers, the Waterfront Commission', risk: 'a driver who remembers a face' }),
  J({ id: 'cardgame', tile: 'scores', icon: '🃏', title: 'Rob a card game', line: 'Take the pot off a high-stakes game: an out-of-town game at a motel, or a rival\'s.', fit: 'force', target: 'rivalLot', targetOptional: true, cost: 200, take: [1500, 5000], odds: 62, witness: 0.3, arrest: 0.25, heat: { local: 4 }, evidence: 6, cool: 5, seasonal: true, objects: 'The players (and the house, if it is a rival\'s game)', risk: 'a player who knows your man' }),
  J({ id: 'jewel', tile: 'scores', icon: '💎', title: 'A jewel job', line: 'A jewelry exchange in Philadelphia after closing. Planned over a few weeks.', fit: 'intrigue', spec: 'safecracker', cost: 0, take: [8000, 15000], odds: 0, witness: 0, arrest: 0, heat: { local: 6 }, evidence: 0, cool: 0, objects: 'The Philadelphia police; the jewelers\' insurers', risk: 'a long plan someone can find out about', wrap: 'heist-jewelry' }),
  J({ id: 'payroll', tile: 'scores', icon: '🏦', title: 'A payroll job', line: 'The armored car with the mainland factories\' payroll. Big, planned, federal.', fit: 'force', spec: 'wheelman', cost: 0, take: [15000, 30000], odds: 0, witness: 0, arrest: 0, heat: { federal: 8 }, evidence: 0, cool: 0, objects: 'The FBI', risk: 'federal agents', wrap: 'heist-armored' }),
  J({ id: 'warehouse', tile: 'scores', icon: '🏚', title: 'A warehouse job', line: 'A warehouse on the mainland, emptied over a weekend.', fit: 'intrigue', spec: 'safecracker', cost: 400, take: [3000, 7500], odds: 62, witness: 0.15, arrest: 0.35, heat: { local: 5 }, evidence: 8, cool: 6, objects: 'The owner\'s insurers, the state police', risk: 'a night watchman' }),
  J({ id: 'cars', tile: 'scores', icon: '🚗', title: 'Steal cars for the chop shop', line: 'A few good cars from the summer lots, gone by morning.', fit: 'intrigue', spec: 'wheelman', cost: 300, take: [1500, 3500], odds: 70, witness: 0.15, arrest: 0.35, heat: { local: 3 }, evidence: 6, cool: 3, seasonal: true, objects: 'The state police auto squad', risk: 'a man caught behind the wheel' }),
  J({ id: 'torch', tile: 'scores', icon: '🔥', title: 'An insurance fire', line: 'One of your own places has a fire nobody can explain, and the insurer pays. The place is gone.', fit: 'intrigue', target: 'mine', cost: 300, take: [0, 0], odds: 66, witness: 0.1, arrest: 0.45, heat: { local: 6 }, evidence: 14, cool: 26, objects: 'The insurer\'s investigators, the fire marshal', risk: 'an arson investigator who does not believe it' }),
  J({ id: 'bustout', tile: 'scores', icon: '📉', title: 'A bust-out', line: 'Run up a failing store\'s credit, empty it, let it go under. Runs a few weeks as a racket.', fit: 'business', cost: 0, take: [0, 0], odds: 0, witness: 0, arrest: 0, heat: {}, evidence: 0, cool: 0, objects: 'Creditors, a bankruptcy trustee', risk: 'heat when it folds', wrap: 'bustout' }),
  // ---- Muscle ----
  J({ id: 'shakedown', tile: 'muscle', icon: '🏪', title: 'Shake down a shop', line: 'One shop, one visit: they pay, this time.', fit: 'force', target: 'shop', cost: 0, take: [400, 1400], odds: 82, witness: 0.2, arrest: 0.15, heat: { local: 3 }, evidence: 4, cool: 6, seasonal: true, objects: 'The shopkeeper (he may go to the Herald)', risk: 'a complaint' }),
  J({ id: 'welsher', tile: 'muscle', icon: '📒', title: 'Lean on a welsher', line: 'Somebody is late on the book. Your man reminds him.', fit: 'force', target: 'loan', targetOptional: true, cost: 0, take: [800, 2500], odds: 75, witness: 0.15, arrest: 0.15, heat: { local: 2 }, evidence: 3, cool: 3, objects: 'The borrower, if he goes to the police', risk: 'a borrower who talks' }),
  J({ id: 'runoff', tile: 'muscle', icon: '🚪', title: 'Run off a rival\'s operation', line: 'Make one of their places close its doors and stay closed.', fit: 'force', target: 'rivalLot', cost: 500, take: [0, 0], odds: 60, witness: 0.25, arrest: 0.3, heat: { local: 5 }, evidence: 6, cool: 8, objects: 'That family, who may hit back', risk: 'a war' }),
  J({ id: 'breakgame', tile: 'muscle', icon: '🎲', title: 'Break up a rival\'s card game', line: 'Your men walk into their game. The pot leaves with them; the game does not come back for a while.', fit: 'force', target: 'rival', cost: 200, take: [800, 2500], odds: 66, witness: 0.3, arrest: 0.25, heat: { local: 4 }, evidence: 5, cool: 6, objects: 'That family, who may hit back', risk: 'retaliation' }),
  J({ id: 'beating', tile: 'muscle', icon: '👊', title: 'Send a message', line: 'A man who needs reminding gets a visit he will remember. Nobody dies.', fit: 'force', target: 'person', cost: 0, take: [0, 0], odds: 80, witness: 0.25, arrest: 0.25, heat: { local: 3 }, evidence: 5, cool: 8, objects: 'Him, his friends, and his family if he has one', risk: 'an assault charge' }),
  J({ id: 'hit', tile: 'muscle', icon: '☠', title: 'A hit', line: 'The murder plot: your man, a quiet place, the body never found. Planned over weeks.', fit: 'force', spec: 'torpedo', target: 'person', cost: 0, take: [0, 0], odds: 0, witness: 0, arrest: 0, heat: {}, evidence: 0, cool: 0, objects: 'His people, and the Table without a sanction', risk: 'a war, a murder case', wrap: 'hit' }),
  // ---- Fixes ----
  J({ id: 'bribe', tile: 'fixes', icon: '👮', title: 'Bribe a cop or a judge', line: 'An envelope to a sergeant, the Chief, a judge, a councilman or the tax man.', fit: 'diplomacy', target: 'official', cost: 0, take: [0, 0], odds: 0, witness: 0, arrest: 0, heat: {}, evidence: 0, cool: 0, objects: 'Nobody, if he takes it', risk: 'an honest man', wrap: 'bribe', noWho: true }),
  J({ id: 'fixrace', tile: 'fixes', icon: '🏇', title: 'Fix a fight or a race', line: 'A fighter who goes down in the fourth, a horse that does not run, a ballgame that is closer than it looks.', fit: 'diplomacy', target: 'fix', cost: 1500, take: [2500, 7000], odds: 60, witness: 0.15, arrest: 0.3, heat: { local: 3 }, evidence: 6, cool: 6, objects: 'The racing and athletic commissions, the bookmakers who get stuck', risk: 'a fighter who talks' }),
  J({ id: 'rigbid', tile: 'fixes', icon: '📐', title: 'Rig a bid', line: 'One city contract goes to the right contractor, and he remembers who.', fit: 'business', cost: 1000, take: [3000, 8000], odds: 62, witness: 0.15, arrest: 0.3, heat: { local: 3 }, evidence: 8, cool: 10, objects: 'The losing bidders, the state auditor', risk: 'an audit' }),
  J({ id: 'juror', tile: 'fixes', icon: '⚖', title: 'Buy a juror', line: 'One juror who will not vote to convict. Only while the boss\'s case is before a jury.', fit: 'diplomacy', cost: 5000, take: [0, 0], odds: 55, witness: 0.1, arrest: 0.35, heat: { federal: 4 }, evidence: 15, cool: 8, objects: 'The judge and the prosecutor: jury tampering is its own case', risk: 'a tampering charge' }),
  J({ id: 'witness', tile: 'fixes', icon: '🤐', title: 'Pay off a witness', line: 'Somebody who saw something remembers nothing. The case against the boss gets thinner.', fit: 'diplomacy', target: 'person', targetOptional: true, cost: 2500, take: [0, 0], odds: 68, witness: 0.1, arrest: 0.25, heat: { local: 2 }, evidence: 10, cool: 4, objects: 'The prosecutor', risk: 'an obstruction charge' }),
  J({ id: 'evidence', tile: 'fixes', icon: '🗄', title: 'Lose the evidence', line: 'A box in the property room goes missing. Easier with a cop on the pad.', fit: 'intrigue', cost: 4000, take: [0, 0], odds: 50, witness: 0.1, arrest: 0.3, heat: { local: 3, federal: 2 }, evidence: 10, cool: 10, objects: 'The prosecutor, Internal Affairs', risk: 'a clerk who keeps notes' }),
  // ---- Moving goods ----
  J({ id: 'smokes', tile: 'goods', icon: '🚬', title: 'A load of untaxed cigarettes', line: 'Cartons from where the tax is low, sold cheap to the bars and the stands.', fit: 'business', cost: 1500, take: [2100, 3300], odds: 84, witness: 0.1, arrest: 0.3, heat: { local: 1 }, evidence: 3, cool: 2, seasonal: true, objects: 'The state tax office, barely', risk: 'a seized load' }),
  J({ id: 'booze', tile: 'goods', icon: '🥃', title: 'A load of untaxed liquor', line: 'Cases with no tax stamp, sold to the bars under the counter.', fit: 'business', cost: 2000, take: [2800, 4400], odds: 80, witness: 0.1, arrest: 0.3, heat: { local: 2, federal: 1 }, evidence: 4, cool: 2, seasonal: true, objects: 'The Treasury\'s tax men', risk: 'a seized load' }),
  J({ id: 'guns', tile: 'goods', icon: '🧰', title: 'A gun shipment', line: 'Crates off a boat, sold out of state. Federal if it goes wrong.', fit: 'business', cost: 4000, take: [6000, 11000], odds: 68, witness: 0.1, arrest: 0.45, heat: { federal: 5, family: 1 }, evidence: 10, cool: 8, objects: 'Federal agents; Philadelphia frowns', risk: 'a federal case', philly: 'Tolerated, quietly, until it is in the newspapers.' }),
  J({ id: 'dope', tile: 'goods', icon: '☠', title: 'A dope shipment (the forbidden one)', line: 'One load through the docks to outside buyers. The most money on the island, and Philadelphia forbids it.', fit: 'business', cost: 6000, take: [16000, 30000], odds: 72, witness: 0.1, arrest: 0.45, heat: { federal: 7, family: 3 }, evidence: 12, cool: 6, objects: 'Philadelphia, your own old-timers, federal narcotics agents', risk: 'a rat, a reckoning', philly: 'Forbidden. If word reaches Philadelphia there is a reckoning.' }),
  J({ id: 'fence', tile: 'goods', icon: '🎁', title: 'Fence a hot load', line: 'Buy what fell off somebody else\'s truck cheap, sell it far away.', fit: 'business', cost: 1000, take: [1800, 4200], odds: 74, witness: 0.1, arrest: 0.3, heat: { local: 2 }, evidence: 5, cool: 3, objects: 'The state police (stings)', risk: 'a sting' }),
];

/** The serious acts (the charge they bring, feds.ts). */
export const SERIOUS_JOBS: Partial<Record<DirtyJobId, string>> = {
  hijack: 'a truck hijacking', torch: 'arson', warehouse: 'a warehouse burglary', guns: 'gun running', dope: 'narcotics trafficking', booze: 'running untaxed liquor', juror: 'jury tampering', cardgame: 'armed robbery',
};

export const JOBS_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j])) as Record<DirtyJobId, JobDef>;

/** "Tie-ins" the screen links to instead of a Do-it button (the racket version of the bust-out). */
export const RACKET_LINK: Partial<Record<DirtyJobId, string>> = { bustout: 'bustout', smokes: 'cigarettes', booze: 'bootleg', guns: 'guns', dope: 'narcotics', fence: 'fencing', cars: 'chopshop', hijack: 'cargo' };

/* ------------------------------------------------------------------ */
/* Targets                                                             */
/* ------------------------------------------------------------------ */

export interface TargetChoice { id: string; name: string; note: string; rival?: RivalId; district?: string }

const LANDMARK = /avalon|chapel/i;
const MOB_RIVALS = (s: GameState) => s.rivals.filter((r) => r.kind === 'mob');

export const ROUTES: TargetChoice[] = [
  { id: 'docks', name: 'Off the Bay Docks', note: 'Bigger loads; the Waterfront Commission watches the piers.' },
  { id: 'route9', name: 'On Route 9', note: 'Interstate freight: a federal crime, but fewer eyes.' },
];
export const FIXES: TargetChoice[] = [
  { id: 'fight', name: 'A fight at the Convention Hall', note: 'A fighter who goes down in the fourth.' },
  { id: 'race', name: 'A race at the Atlantic City track', note: 'A horse that does not run its race.' },
  { id: 'ball', name: 'A semi-pro ballgame', note: 'A game that is closer than it looks.' },
];

function lotDistrict(l: Lot): string | undefined {
  return (ZONES_BY_ID as Record<string, { district?: string } | undefined>)[l.zone]?.district;
}

/** A private shop on the island that can be shaken down (not public, not yours, not a landmark). */
export function shopOk(l: Lot | undefined): l is Lot {
  // Only a going concern (placeEligibility): a shop that closed has nobody to shake down.
  return !!l && l.owner === 'private' && l.status !== 'public' && !!l.use && isOperating(l) && !LANDMARK.test(`${l.name ?? ''} ${l.address} ${l.tenant ?? ''}`);
}

function rivalLotOk(s: GameState, l: Lot | undefined): l is Lot {
  return !!l && s.rivals.some((r) => r.id === l.owner && r.kind === 'mob') && !LANDMARK.test(`${l.name ?? ''} ${l.address}`);
}

/** May this person be the target of a people job? Adults, men, never the law or office-holders (Philadelphia's rule), never yourself. */
export function personOk(s: GameState, c: Character | undefined, job: DirtyJobId): c is Character {
  if (!c || !c.alive || c.id === s.playerId) return false;
  if (ageOn(c.birth, s.date) < 21) return false;
  if (job === 'witness') return c.faction !== 'player' && !c.office;
  if (c.gender !== 'M' || c.office || c.faction === 'law') return false;
  if (job === 'beating' || job === 'hit') return c.faction !== 'player' && !c.dynasty;
  return true;
}

function shopTake(s: GameState, l: Lot): number {
  return Math.round(Math.max(400, Math.min(2200, 300 + l.rent * 2.2)) * (isInSeason(s.date) ? 1.2 : 0.7) / 50) * 50;
}

/** Everything the job could be aimed at, best first. */
export function targetsFor(s: GameState, job: DirtyJobId): TargetChoice[] {
  const j = JOBS_BY_ID[job];
  switch (j.target) {
    case 'route': return ROUTES;
    case 'fix': return FIXES;
    case 'shop': {
      const recent = (l: Lot) => (s.dirty?.cool[`shakedown:${l.id}`] ?? -99) > s.week - j.cool;
      return (s.econ?.lots ?? []).filter(shopOk).sort((a, b) => Number(recent(a)) - Number(recent(b)) || shopTake(s, b) - shopTake(s, a) || (a.id < b.id ? -1 : 1)).slice(0, 40)
        .map((l) => ({ id: l.id, name: l.name ?? lotName(l), note: `${l.address} · about $${shopTake(s, l).toLocaleString('en-US')}${recent(l) ? ' · shaken down lately' : ''}`, district: lotDistrict(l) }));
    }
    case 'rivalLot': return (s.econ?.lots ?? []).filter((l) => rivalLotOk(s, l)).map((l) => ({ id: l.id, name: l.name ?? lotName(l), note: `${FACTION_NAMES[l.owner as RivalId]} · ${l.address}`, rival: l.owner as RivalId, district: lotDistrict(l) })).slice(0, 40);
    case 'rival': return MOB_RIVALS(s).map((r) => ({ id: r.id, name: r.name, note: `Muscle ${Math.round(r.muscle)} · ${r.war ? 'at war with you' : 'at peace'}`, rival: r.id }));
    case 'person': {
      const out: TargetChoice[] = [];
      for (const c of Object.values(s.characters)) {
        if (!personOk(s, c, job)) continue;
        if (job !== 'witness' && !MOB_RIVALS(s).some((r) => r.id === c.faction)) continue;
        if (job === 'witness' && c.faction !== 'none') continue;
        out.push({ id: c.id, name: displayName(c), note: job === 'witness' ? 'Somebody who saw something' : `${FACTION_NAMES[c.faction]} · ${c.rank}`, rival: c.faction as RivalId });
      }
      const rank = (t: TargetChoice) => ['soldier', 'associate', 'capo', 'underboss', 'boss'].indexOf(s.characters[t.id]?.rank ?? '');
      return out.sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : 1)).slice(0, 30);
    }
    case 'official': return Object.values(s.characters).filter((c) => c.alive && c.office && OFFICE_BRIBE[c.office]).map((c) => ({ id: c.id, name: displayName(c), note: `${c.office} · $${OFFICE_BRIBE[c.office!].cost.toLocaleString('en-US')}` }));
    case 'loan': return s.loans.filter((l) => l.weeksLate > 0).map((l) => ({ id: l.id, name: l.borrower.split(',')[0], note: `$${l.principal.toLocaleString('en-US')} out, ${l.weeksLate} week${l.weeksLate > 1 ? 's' : ''} late` }));
    case 'mine': return owned(s).filter((b) => torchable(s, b)).map((b) => ({ id: b.id, name: b.name, note: `Insured for about $${insurance(s, b).toLocaleString('en-US')}`, district: b.districtId }));
    default: return [];
  }
}

function torchable(s: GameState, b: Business): boolean {
  return b.owner === 'player' && (b.closedUntil ?? 0) <= s.week && CATALOG[b.kind].category !== 'racket' && b.kind !== 'casino' && b.kind !== 'safehouse' && (b.cost ?? CATALOG[b.kind].cost) > 0 && !LANDMARK.test(b.name);
}
function insurance(s: GameState, b: Business): number {
  const ins = owned(s).some((x) => x.kind === 'insurance');
  return Math.round((b.cost ?? CATALOG[b.kind].cost) * (ins ? 1.0 : 0.75) / 50) * 50;
}

/** The target's display name (or undefined). */
export function targetName(s: GameState, job: DirtyJobId, id: string | undefined): string | undefined {
  if (!id) return undefined;
  const j = JOBS_BY_ID[job];
  switch (j.target) {
    case 'route': return ROUTES.find((t) => t.id === id)?.name;
    case 'fix': return FIXES.find((t) => t.id === id)?.name;
    case 'shop': { const l = s.econ?.lots.find((x) => x.id === id); return shopOk(l) ? l.name ?? lotName(l) : undefined; }
    case 'rivalLot': { const l = s.econ?.lots.find((x) => x.id === id); return rivalLotOk(s, l) ? l.name ?? lotName(l) : undefined; }
    case 'rival': return MOB_RIVALS(s).find((r) => r.id === id)?.name;
    case 'person': return personOk(s, s.characters[id], job) ? displayName(s.characters[id]) : undefined;
    case 'official': { const c = s.characters[id]; return c?.alive && c.office && OFFICE_BRIBE[c.office] ? displayName(c) : undefined; }
    case 'loan': return s.loans.find((l) => l.id === id)?.borrower.split(',')[0];
    case 'mine': { const b = s.businesses.find((x) => x.id === id); return b && torchable(s, b) ? b.name : undefined; }
    default: return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Who                                                                 */
/* ------------------------------------------------------------------ */

export interface CrewChoice {
  c: Character;
  role: 'boss' | 'capo' | 'soldier' | 'associate' | 'specialist';
  skill: number;
  nerve: number;
  loyalty?: number;
  /** What the law has on him. */
  heat: number;
  /** His odds on this job (%). */
  odds: number;
  best?: boolean;
  note: string;
  busy?: string;
}

export function nerveOf(c: Character): number {
  let n = c.attributes.force * 0.6 + c.attributes.discipline * 0.4;
  if (hasTrait(c, 'Hot-headed')) n += 10;
  if (hasTrait(c, 'Cruel')) n += 5;
  if (hasTrait(c, 'Cowardly')) n -= 25;
  if (hasTrait(c, 'Patient')) n += 4;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Why a man can't go on a job this week. */
export function manBlock(s: GameState, c: Character | undefined): string | undefined {
  if (!c || !c.alive) return 'He is gone';
  if (c.faction !== 'player') return 'Not one of yours';
  if (!isFree(s, c)) return c.id === s.playerId ? 'You are inside' : 'He is inside';
  if (s.dirty?.busy[c.id] === s.week) return 'Already on a job this week';
  if (c.id !== s.playerId && (c.busyUntil ?? 0) > s.week) return 'Away on a job';
  return undefined;
}

/** Everybody who could do it: the boss, the capos, the men and the specialists. Best odds first within each rank. */
export function crewFor(s: GameState, job: DirtyJobId): CrewChoice[] {
  const j = JOBS_BY_ID[job];
  const boss = s.characters[s.playerId];
  const pool = [boss, ...crew(s).filter((c) => c.rank !== 'civilian')].filter((c): c is Character => !!c && c.alive && isFree(s, c));
  const roleOf = (c: Character): CrewChoice['role'] => (c.id === s.playerId ? 'boss' : c.specialty ? 'specialist' : c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' ? 'capo' : c.rank === 'soldier' ? 'soldier' : 'associate');
  const out = pool.map((c): CrewChoice => {
    const o = jobOdds(s, job, c.id);
    const role = roleOf(c);
    const busy = manBlock(s, c);
    const stuff = owned(s).filter((b) => (b.staffIds ?? []).includes(c.id)).length;
    return {
      c, role, skill: c.attributes[j.fit], nerve: nerveOf(c), loyalty: c.id === s.playerId ? undefined : opinion(s, c.id, s.playerId), heat: Math.round(c.evidence ?? 0), odds: Math.round(o.chance * 100),
      note: busy ?? (c.id === s.playerId ? 'Your own fingerprints on it' : c.specialty ? `A ${c.specialty}` : stuff ? `Runs ${stuff} place${stuff > 1 ? 's' : ''}: he does it on the side` : 'Free'), busy,
    };
  });
  const order = { boss: 0, capo: 1, soldier: 2, associate: 3, specialist: 4 };
  const best = out.filter((x) => !x.busy && x.role !== 'boss').sort((a, b) => b.odds - a.odds || (a.c.id < b.c.id ? -1 : 1))[0];
  if (best) best.best = true;
  return out.sort((a, b) => order[a.role] - order[b.role] || b.odds - a.odds || (a.c.id < b.c.id ? -1 : 1));
}

export function defaultMan(s: GameState, job: DirtyJobId): CrewChoice | undefined {
  const all = crewFor(s, job);
  return all.find((x) => x.best) ?? all.find((x) => !x.busy);
}

/* ------------------------------------------------------------------ */
/* Odds and the summary                                                */
/* ------------------------------------------------------------------ */

export interface DirtyOdds { chance: number; reasons: { label: string; value: number }[] }

/** This week's tip: one job that is worth more this week (pure: the seed and the week). */
export function weekTip(s: GameState): { job: DirtyJobId; text: string } | undefined {
  const h = hashSeed(`${s.seed}:tip:${s.week}`);
  if (h % 100 >= 45) return undefined;
  const tips: [DirtyJobId, string][] = [
    ['hijack', 'A dispatcher at the Bay Docks says a load of television sets goes out this week.'],
    ['warehouse', 'A night watchman on the mainland is taking his vacation this week.'],
    ['cardgame', 'Salesmen from Philadelphia are running a big game at a motel this week.'],
    ['cars', 'A car dealer in Rio Grande has a lot full of new models and one old lock.'],
    ['smokes', 'A load from down south can be had cheap this week.'],
    ['fixrace', 'A fighter on Saturday\'s card owes money to the wrong people.'],
    ['fence', 'Somebody else\'s hot load needs a buyer this week, cheap.'],
  ];
  const [job, text] = tips[(h >>> 8) % tips.length];
  return { job, text };
}
const TIP_TAKE = 1.3;
const TIP_ODDS = 8;

/** The odds of a clean job, with every reason. Pure. */
export function jobOdds(s: GameState, job: DirtyJobId, whoId: string, target?: string): DirtyOdds {
  const j = JOBS_BY_ID[job];
  const c = s.characters[whoId];
  const reasons: { label: string; value: number }[] = [{ label: 'Base', value: j.odds }];
  if (c) {
    reasons.push({ label: `His ${j.fit} (${c.attributes[j.fit]})`, value: Math.round((c.attributes[j.fit] - 50) * 0.3) });
    reasons.push({ label: `His nerve (${nerveOf(c)})`, value: Math.round((nerveOf(c) - 50) * 0.15) });
    if (j.spec && c.specialty === j.spec) reasons.push({ label: `A ${j.spec}`, value: 12 });
    if (c.id === s.playerId) reasons.push({ label: 'You do it yourself', value: 5 });
    // His level and his specialty (crewXp.ts).
    reasons.push(...xpJobOdds(s, c, job, j.tile));
  }
  // Family development: cars for scores and loads, the crews' equipment for muscle.
  const wheels = j.tile === 'scores' || j.tile === 'goods' ? devJobBonus(s) : 0;
  if (wheels) reasons.push({ label: 'Your cars and garage (Transportation)', value: wheels });
  const kit = j.tile === 'muscle' && !j.wrap ? Math.min(6, Math.round((crewStrength(s).parts.find((p) => p.key === 'gear')?.value ?? 0) / 2)) : 0;
  if (kit) reasons.push({ label: 'Your crews\' equipment', value: kit });
  const bar = j.heat.federal && !j.heat.local ? 'federal' : 'local';
  const h = s.heat[bar];
  if (h > 20) reasons.push({ label: `${bar === 'federal' ? 'Federal' : 'Local'} heat on you (${Math.round(h)})`, value: -Math.round((h - 20) / 4) });
  if (weekTip(s)?.job === job) reasons.push({ label: 'A tip this week', value: TIP_ODDS });
  if (job === 'smokes' && owned(s).some((b) => b.kind === 'cigarettes')) reasons.push({ label: 'Your cigarette racket has the buyers', value: 5 });
  if (job === 'booze' && owned(s).some((b) => b.kind === 'bootleg')) reasons.push({ label: 'Your liquor racket has the buyers', value: 5 });
  if (job === 'fence' && (owned(s).some((b) => b.kind === 'fencing') || Object.values(s.characters).some((x) => x.alive && x.outside === 'fence'))) reasons.push({ label: 'You have a fence', value: 8 });
  if (job === 'evidence' && (owned(s).some((b) => b.kind === 'payoff') || s.hooks.some((k) => k.holder === 'player' && !!s.characters[k.targetId]?.office?.includes('Police')))) reasons.push({ label: 'A cop on the pad', value: 15 });
  if (job === 'hijack' && target === 'route9') reasons.push({ label: 'Fewer eyes on Route 9', value: 4 });
  if (job === 'runoff' || job === 'breakgame') {
    const rid = rivalOf(s, job, target);
    const r = rid ? s.rivals.find((x) => x.id === rid) : undefined;
    if (r) reasons.push({ label: `${r.shortName}'s muscle (${Math.round(r.muscle)})`, value: -Math.round(r.muscle / 8) });
  }
  if (job === 'beating' && target && s.characters[target]) reasons.push({ label: 'His own muscle', value: -Math.round(s.characters[target].attributes.force / 8) });
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.1, Math.min(j.tile === 'scores' ? 0.85 : 0.92, sum / 100)), reasons };
}

function rivalOf(s: GameState, job: DirtyJobId, target?: string): RivalId | undefined {
  if (!target) return undefined;
  const j = JOBS_BY_ID[job];
  if (j.target === 'rival') return target as RivalId;
  if (j.target === 'rivalLot') { const l = s.econ?.lots.find((x) => x.id === target); return l && rivalLotOk(s, l) ? (l.owner as RivalId) : undefined; }
  if (j.target === 'person') { const f = s.characters[target]?.faction; return f && s.rivals.some((r) => r.id === f && r.kind === 'mob') ? (f as RivalId) : undefined; }
  if (j.target === 'shop') {
    const l = s.econ?.lots.find((x) => x.id === target);
    const d = l ? s.districts.find((x) => x.id === lotDistrict(l)) : undefined;
    if (!d) return undefined;
    const top = MOB_RIVALS(s).sort((a, b) => (d.influence[b.id] ?? 0) - (d.influence[a.id] ?? 0))[0];
    return top && (d.influence[top.id] ?? 0) > (d.influence.player ?? 0) ? top.id : undefined;
  }
  return undefined;
}

/** The take range for this job, this week, at this target (before a messy job's cut). */
export function takeRange(s: GameState, job: DirtyJobId, target?: string): [number, number] {
  const j = JOBS_BY_ID[job];
  let [lo, hi] = j.take;
  if (job === 'shakedown') {
    const l = s.econ?.lots.find((x) => x.id === target);
    const t = l ? shopTake(s, l) : 800;
    return [Math.round(t * 0.7), Math.round(t * 1.2)];
  }
  if (job === 'welsher') {
    const loan = s.loans.find((x) => x.id === target);
    if (loan) return [Math.round(loan.principal * 0.7), loan.principal];
  }
  if (job === 'torch') {
    const b = s.businesses.find((x) => x.id === target);
    const v = b ? insurance(s, b) : 0;
    return [v, v];
  }
  let m = 1;
  if (j.seasonal) m *= isInSeason(s.date) ? 1.15 : 0.85;
  if (weekTip(s)?.job === job) m *= TIP_TAKE;
  if (job === 'hijack' && target === 'docks') m *= 1.15;
  if (job === 'cardgame' && rivalOf(s, job, target)) m *= 1.3;
  if (job === 'cars' && owned(s).some((b) => b.kind === 'chopshop')) m *= 1.6;
  if (job === 'fixrace' && owned(s).some((b) => b.kind === 'bookmaking')) m *= 1.3;
  lo = Math.round(lo * m / 50) * 50;
  hi = Math.round(hi * m / 50) * 50;
  return [lo, hi];
}

/** Why the job can't be done now (and how to fix it). */
export function jobLock(s: GameState, job: DirtyJobId, target?: string): { why: string; how: string } | undefined {
  const j = JOBS_BY_ID[job];
  const d = s.dirty;
  if (s.gameOver) return { why: 'The game is over', how: '' };
  if (j.cool) {
    const key = j.target && !['route', 'fix'].includes(j.target) && target ? `${job}:${target}` : job;
    const last = d?.cool[key];
    if (last !== undefined && s.week - last < j.cool) return { why: `Too soon: ${j.target && key !== job ? 'that target was hit' : 'this was done'} ${s.week - last === 0 ? 'this week' : `${s.week - last} week${s.week - last > 1 ? 's' : ''} ago`}`, how: `Wait ${j.cool - (s.week - last)} more week${j.cool - (s.week - last) > 1 ? 's' : ''}; everybody is watching for it.` };
  }
  if (job === 'juror' && !['indicted', 'trial'].includes(s.legal?.stage ?? 'quiet')) return { why: 'There is no jury to reach', how: 'Only while the boss is indicted or on trial.' };
  if ((job === 'witness' || job === 'evidence') && (s.characters[s.playerId]?.evidence ?? 0) < (job === 'evidence' ? 15 : 8) && (s.legal?.stage ?? 'quiet') === 'quiet') return { why: 'Nobody is building a case on you yet', how: 'When the law has evidence on the boss, this cuts it.' };
  if (job === 'rigbid' && !s.districts.some((x) => (x.influence.player ?? 0) >= 40)) return { why: 'You do not run a district', how: 'Hold 40% of a district and its contracts are yours to steer.' };
  if (job === 'welsher' && !s.loans.some((l) => l.weeksLate > 0) && !owned(s).some((b) => b.kind === 'loansharking')) return { why: 'Nobody owes you', how: 'Put money on the street (a shylock book, or Money › Lend) and somebody will be late.' };
  if (job === 'dope' && s.edicts.nojunk) return { why: 'You laid down the law: no junk', how: 'Lift the edict in Crew › Council & standing orders.' };
  if ((job === 'shakedown' || job === 'cardgame') && target) {
    // Aimed at a going concern: a place that closed has no till and no game (placeEligibility).
    const l = s.econ?.lots.find((x) => x.id === target);
    if (l && !isOperating(l)) return { why: 'It closed: nobody is running it', how: 'Pick a place that is open for business.' };
  }
  if (j.target && !j.targetOptional && !j.wrap && !targetsFor(s, job).length) return { why: 'Nothing to aim it at right now', how: j.target === 'rivalLot' ? 'The other families have no places on the island.' : j.target === 'mine' ? 'You own no place that could burn for the insurance.' : 'Try again later.' };
  return undefined;
}

export interface DirtySummary {
  title: string;
  job: JobDef;
  target?: string;
  targetName?: string;
  cost: number;
  pot: 'family' | 'pocket';
  take: [number, number];
  /** % chances. */
  odds: number;
  witness: number;
  arrest: number;
  rat: number;
  reasons: { label: string; value: number }[];
  heat: string;
  evidence: string;
  objects: string;
  philly?: string;
  warns: string[];
  lock?: { why: string; how: string };
  tip?: string;
  action?: PlayerAction;
  /** A wrapped job: the existing system's preview (title, odds) shown as is. */
  wrapped?: string;
  weeks?: number;
}

const pct = (x: number) => Math.round(x * 100);

function ratChance(s: GameState, c: Character | undefined): number {
  if (!c || c.id === s.playerId) return 0;
  const op = opinion(s, c.id, s.playerId);
  let p = 0.12 + Math.max(0, 10 - op) / 100;
  if (c.rank === 'associate') p += 0.08;
  if (hasTrait(c, 'Loyal-to-a-fault')) p = 0.02;
  if (hasTrait(c, 'Cowardly')) p += 0.1;
  if (s.edicts.omerta) p *= 0.6;
  const jaw = xpRatMult(s, c);
  return jaw < 1 ? Math.max(0.005, Math.min(0.6, p) * jaw) : Math.max(0.02, Math.min(0.6, p));
}

function heatWords(j: JobDef): string {
  const p: string[] = [];
  if (j.heat.local) p.push(`+${j.heat.local} local`);
  if (j.heat.federal) p.push(`+${j.heat.federal} federal`);
  if (j.heat.family) p.push(`+${j.heat.family} with Philadelphia`);
  return p.length ? `${p.join(' · ')} (more if it goes wrong)` : 'none to speak of';
}

/** The second man on a heist: the best other free man at force and wits. */
function secondMan(s: GameState, who: string): string | undefined {
  return crew(s).filter((c) => c.id !== who && isFree(s, c) && !manBlock(s, c) && !s.schemes.some((x) => x.agents.includes(c.id)))
    .sort((a, b) => (b.attributes.force + b.attributes.intrigue) - (a.attributes.force + a.attributes.intrigue) || (a.id < b.id ? -1 : 1))[0]?.id;
}

/** The order the job builds: the dirty-work order, or the wrapped system's own. */
export function jobAction(s: GameState, job: DirtyJobId, who: string, target?: string, pay?: 'pocket'): PlayerAction | undefined {
  const j = JOBS_BY_ID[job];
  switch (j.wrap) {
    case 'heist-jewelry':
    case 'heist-armored': {
      const two = secondMan(s, who);
      const opts: SchemeOptions = { depth: 'planned', heist: j.wrap === 'heist-jewelry' ? 'jewelry' : 'armored' };
      return { kind: 'scheme', scheme: 'heist', agents: two ? [who, two] : [who], opts };
    }
    case 'hit':
      return target ? { kind: 'scheme', scheme: 'murder', targetId: target, agents: [who], opts: { depth: 'planned', location: 'car', disposal: 'disappear', equipment: 'street' } } : undefined;
    case 'bustout':
      return { kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind: 'bustout', ...(who !== s.playerId ? { runner: who } : {}) } } };
    case 'bribe':
      return target ? { kind: 'interact', id: 'bribe', target } : undefined;
    default:
      return { kind: 'dirty', op: { job, who, ...(target ? { target } : {}), ...(pay ? { pay } : {}) } };
  }
}

/** Everything the summary shows. Pure. */
export function jobSummary(s: GameState, job: DirtyJobId, who: string, target?: string, pay?: 'pocket'): DirtySummary {
  const j = JOBS_BY_ID[job];
  const c = s.characters[who];
  const tName = targetName(s, job, target);
  const title = `${j.title}${tName ? `: ${tName}` : ''}`;
  const warns: string[] = [];
  const rid = rivalOf(s, job, target);
  let objects = j.objects;
  if (rid && j.tile === 'muscle' && job === 'shakedown') objects = `${objects}; ${FACTION_NAMES[rid]}, whose street it is`;
  const lock = jobLock(s, job, target) ?? (j.target && !j.targetOptional && !target ? { why: 'Pick a target', how: '' } : undefined);
  const tip = weekTip(s)?.job === job ? weekTip(s)!.text : undefined;
  const action = jobAction(s, job, who, target, pay);
  if (j.wrap) {
    const sum: DirtySummary = { title, job: j, target, targetName: tName, cost: 0, pot: 'family', take: j.take, odds: 0, witness: 0, arrest: 0, rat: 0, reasons: [], heat: heatWords(j), evidence: '', objects, philly: j.philly, warns, lock, action };
    if (j.wrap === 'heist-jewelry' || j.wrap === 'heist-armored' || j.wrap === 'hit') {
      const a = action as Extract<PlayerAction, { kind: 'scheme' }> | undefined;
      if (a) {
        const o = schemeOdds(s, a.scheme, a.targetId, a.agents, a.opts);
        sum.odds = pct(o.chance); sum.reasons = o.reasons; sum.cost = o.cost; sum.weeks = o.weeks;
        sum.wrapped = `A ${a.scheme === 'murder' ? 'murder plot' : 'heist'} (the Plan-a-job system): about ${o.weeks} week${o.weeks > 1 ? 's' : ''} of planning, then one roll. ${a.agents.length > 1 ? `${s.characters[a.agents[1]]?.firstName} goes along.` : ''}`;
        if (o.disabledReason && !sum.lock) sum.lock = { why: o.disabledReason, how: '' };
      }
      if (j.wrap === 'hit') { sum.take = [0, 0]; sum.heat = 'a body, or no body: a murder case if it goes wrong'; warns.push('Philadelphia\'s rule: a made man needs the Table\'s sanction, and never a cop, a prosecutor, a politician or a reporter.'); }
      if (j.wrap === 'heist-armored') warns.push('Federal: the FBI comes for an armored car.');
    } else if (j.wrap === 'bustout') {
      sum.cost = CATALOG.bustout.cost; sum.take = [Math.round(CATALOG.bustout.cost * 2.6), Math.round(CATALOG.bustout.cost * 3.5)];
      sum.wrapped = 'The bust-out racket (Start a racket): nothing for six weeks, then one score. The store is finished when it pays.';
      sum.odds = 100;
    } else if (j.wrap === 'bribe') {
      const off = target ? s.characters[target] : undefined;
      sum.cost = off?.office ? OFFICE_BRIBE[off.office]?.cost ?? 0 : 0;
      sum.wrapped = 'An envelope, discreetly (the Bribe interaction): he takes it or he does not.';
      sum.heat = off?.office === 'IRS agent' ? 'federal heat down, dirty cash washed' : off?.office?.includes('Police') ? 'local heat down' : 'a favor owed';
    }
    return sum;
  }
  const o = jobOdds(s, job, who, target);
  const p = o.chance;
  const take = takeRange(s, job, target);
  const rat = ratChance(s, c);
  const cost = j.cost;
  if (job === 'dope') warns.push('The trade-off: the biggest single score on the island, and the worst heat. Your old-timers think less of you (crew −3), federal agents watch the docks, and if word reaches Philadelphia there is a reckoning.');
  if (job === 'guns') warns.push('Federal business: a man picked up with the crates is a federal case.');
  if (job === 'torch') warns.push('Your place is gone for good, and the insurer\'s money is clean.');
  if (job === 'runoff' || job === 'breakgame' || (job === 'cardgame' && rid) || (job === 'beating' && rid)) warns.push(`${FACTION_NAMES[rid ?? 'manno']} may hit back.`);
  if (who === s.playerId) warns.push('You do it yourself: whatever goes wrong goes on your file.');
  if (pay === 'pocket') warns.push('Your own score: you pay from your pocket and the take goes to your pocket, not the Family.');
  return {
    title, job: j, target, targetName: tName, cost, pot: pay === 'pocket' ? 'pocket' : 'family', take, odds: pct(p), witness: pct(p * j.witness), arrest: pct((1 - p) * j.arrest), rat: pct((1 - p) * j.arrest * rat),
    reasons: o.reasons, heat: heatWords(j), evidence: j.evidence ? `+${j.evidence} on ${who === s.playerId ? 'you' : c?.firstName ?? 'him'} if it goes messy or he is picked up` : 'none', objects, philly: j.philly, warns, lock, tip, action,
  };
}

/* ------------------------------------------------------------------ */
/* The order: preview and resolution                                   */
/* ------------------------------------------------------------------ */

export function previewDirty(s: GameState, a: DirtyAction): ActionPreview {
  const j = JOBS_BY_ID[a.job];
  if (!j || j.wrap) return { title: 'Dirty work', effects: [], cost: 0, because: '', disabledReason: 'No such job', category: 'street' };
  const c = s.characters[a.who];
  const sum = jobSummary(s, a.job, a.who, a.target, a.pay);
  const who = c ? (c.id === s.playerId ? 'you' : `${c.firstName} ${c.lastName}`) : '?';
  const title = `${sum.title} (${who})`;
  const block = manBlock(s, c) ?? sum.lock?.why ?? (j.target && a.target && !sum.targetName ? 'That target is gone' : undefined);
  const label = `Dirty work: ${j.title}`;
  const effects: Effect[] = [];
  if (sum.cost) effects.push({ type: 'money', amount: -sum.cost, label, category: 'cost', ...(a.pay === 'pocket' ? { pot: 'pocket' as const } : {}) });
  effects.push({ type: 'econ', op: { op: 'note', text: `${sum.odds}% clean · ${sum.take[1] ? `$${sum.take[0].toLocaleString('en-US')}–$${sum.take[1].toLocaleString('en-US')}` : 'no take'} · ${sum.arrest}% arrest` }, label });
  return {
    title,
    detail: `${sum.odds}% it goes clean. ${sum.take[1] ? `The take: $${sum.take[0].toLocaleString('en-US')}–$${sum.take[1].toLocaleString('en-US')}${a.pay === 'pocket' ? ' (yours)' : ''}. ` : ''}Arrest risk ${sum.arrest}%, a witness ${sum.witness}%. Done this week; the result is in the week's report.`,
    effects, cost: sum.cost, ...(a.pay === 'pocket' ? { pot: 'pocket' as const } : {}),
    because: `sent ${who === 'you' ? 'yourself' : who} on a job: ${j.title.toLowerCase()}`,
    disabledReason: block, category: 'street',
    // The odds were in the words; now they are on the card like every other roll (STREAMLINE S10).
    odds: { chance: sum.odds / 100, reasons: sum.reasons }, oddsLabel: 'It goes clean',
    warning: `If it goes messy: arrest risk ${sum.arrest}%, a witness ${sum.witness}%.`,
  };
}

/** The job happens: one roll on this layer's own stream, then the outcome through the one ledger. */
export function commitDirty(ctx: Ctx, a: DirtyAction): void {
  const s = ctx.s;
  const j = JOBS_BY_ID[a.job];
  const c = s.characters[a.who];
  if (!j || !c || j.wrap) return;
  const d = ensureDirty(s);
  const r: RngHolder = d;
  const sum = jobSummary(s, a.job, a.who, a.target, a.pay);
  const odds = sum.odds / 100;
  const boss = a.who === s.playerId;
  const tName = sum.targetName;
  const label = `Dirty work: ${j.title}${tName ? ` (${tName})` : ''}`;
  const name = boss ? 'You' : `${c.firstName} ${c.lastName}`;
  d.busy[c.id] = s.week;
  for (const k of Object.keys(d.busy)) if (d.busy[k] < s.week) delete d.busy[k];
  const key = j.target && !['route', 'fix'].includes(j.target) && a.target ? `${a.job}:${a.target}` : a.job;
  d.cool[key] = s.week;
  for (const k of Object.keys(d.cool)) if (s.week - d.cool[k] > 30) delete d.cool[k];

  const roll = rand(r);
  const ok = roll < odds;
  const messy = ok && rand(r) < j.witness;
  const pinched = !ok && rand(r) < j.arrest;
  const outcome: DirtyResult['outcome'] = ok ? (messy ? 'messy' : 'clean') : pinched ? 'pinched' : 'bust';
  const [lo, hi] = sum.take;
  let take = ok && hi > 0 ? Math.round((lo + (hi - lo) * rand(r)) * (messy ? 0.7 : 1) * xpTakeMult(s, c) / 10) * 10 : 0;
  const fx: Effect[] = [];
  const heatMul = outcome === 'clean' ? 1 : outcome === 'messy' ? 1.6 : outcome === 'bust' ? 1.2 : 2;
  if (j.heat.local) fx.push({ type: 'heat', bar: 'local', amount: Math.round(j.heat.local * heatMul) });
  if (j.heat.federal) fx.push({ type: 'heat', bar: 'federal', amount: Math.round(j.heat.federal * heatMul + (a.job === 'hijack' && a.target === 'route9' ? 2 : 0)) });
  if (j.heat.family) fx.push({ type: 'heat', bar: 'family', amount: Math.round(j.heat.family * heatMul) });
  let rat = false;
  let extra = '';

  // The money: the man's end (10%) to him, the rest to the Family (dirty) or your pocket.
  if (take > 0) {
    const end = boss ? 0 : Math.round(take * 0.1);
    const net = take - end;
    if (a.pay === 'pocket') fx.push({ type: 'money', amount: net, pot: 'pocket', category: 'street' });
    else {
      fx.push({ type: 'money', amount: net, category: 'street' });
      if (a.job !== 'torch') fx.push({ type: 'unwashed', amount: net });
    }
    if (end) fx.push({ type: 'wealth', charId: c.id, amount: end });
    take = net;
  }
  // The man.
  if (!boss) {
    if (outcome === 'clean') fx.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 3, reason: 'Put me on a good score', decay: 1 });
    if (outcome === 'pinched') fx.push({ type: 'opinion', from: c.id, to: s.playerId, amount: -6, reason: 'Left holding the bag', decay: 1 });
  } else if (outcome === 'clean' && j.tile !== 'fixes') fx.push({ type: 'respect', amount: 1 });
  if (outcome === 'messy' || outcome === 'pinched') fx.push({ type: 'evidence', charId: c.id, amount: Math.round((outcome === 'pinched' ? j.evidence * 1.5 : j.evidence) * xpEvidenceMult(s, c)) });
  if (boss && outcome === 'clean' && j.evidence) fx.push({ type: 'evidence', charId: c.id, amount: Math.round(j.evidence / 3) });
  // A serious act leaves something on the men who did it, clean or not (feds.ts: the pinch line).
  if (!boss && outcome === 'clean' && SERIOUS_JOBS[a.job]) addFedEvidence(s, c.id, Math.max(2, Math.round(j.evidence / 3)), SERIOUS_JOBS[a.job]!);
  else if (!boss && (outcome === 'messy' || outcome === 'pinched') && SERIOUS_JOBS[a.job]) ensureFeds(s).log.push({ w: s.week, id: c.id, a: j.evidence, why: SERIOUS_JOBS[a.job]! });
  if (outcome === 'pinched' && !boss) {
    const weeks = Math.round(4 + rand(r) * (j.heat.federal ? 14 : 8));
    fx.push({ type: 'imprison', charId: c.id, weeks });
    extra += ` He is held for ${weeks} weeks.`;
    if (rand(r) < ratChance(s, c)) {
      rat = true;
      fx.push({ type: 'evidence', charId: s.playerId, amount: 8 + Math.round(j.evidence / 2) }, { type: 'heat', bar: 'federal', amount: 3 });
      extra += ' He talked: the law has more on you now.';
    }
  }
  if (outcome === 'pinched' && boss) extra += ' You made bail by morning; the arrest is on your file.';

  // What the job does, by kind.
  const rid = rivalOf(s, a.job, a.target);
  if (ok) {
    switch (a.job) {
      case 'shakedown':
        fx.push({ type: 'schedule', key: 'shakedown_complaint', minWeeks: 1, maxWeeks: 3, chance: messy ? 0.4 : 0.15, hint: 'the shopkeeper may go to the Herald' });
        if (rid) fx.push({ type: 'rivalOpinion', rival: rid, amount: -5, reason: 'Shook down a shop on our street' });
        break;
      case 'welsher': {
        const loan = s.loans.find((x) => x.id === a.target);
        if (loan) s.loans = s.loans.filter((x) => x !== loan);
        fx.push({ type: 'respect', amount: 1 });
        break;
      }
      case 'runoff': {
        const l = s.econ?.lots.find((x) => x.id === a.target);
        const dist = l ? lotDistrict(l) : undefined;
        if (rid) fx.push({ type: 'rivalResource', rival: rid, money: -2500 }, { type: 'rivalOpinion', rival: rid, amount: -15, reason: 'Ran off our place' }, { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 4, chance: 0.45, hint: `${FACTION_NAMES[rid]} may hit back`, params: { rival: rid } });
        if (dist && rid) fx.push({ type: 'influence', district: dist, faction: 'player', amount: 3 }, { type: 'influence', district: dist, faction: rid, amount: -3 });
        fx.push({ type: 'respect', amount: 2 });
        break;
      }
      case 'breakgame':
        if (rid) fx.push({ type: 'rivalResource', rival: rid, money: -1500 }, { type: 'rivalOpinion', rival: rid, amount: -10, reason: 'Broke up our game' }, { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 4, chance: 0.3, hint: `${FACTION_NAMES[rid]} may hit back`, params: { rival: rid } });
        fx.push({ type: 'respect', amount: 1 });
        break;
      case 'cardgame':
        if (rid) fx.push({ type: 'rivalOpinion', rival: rid, amount: -12, reason: 'Robbed our game' }, { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 4, chance: 0.3, hint: `${FACTION_NAMES[rid]} may hit back`, params: { rival: rid } });
        break;
      case 'beating': {
        const t = a.target ? s.characters[a.target] : undefined;
        if (t?.alive) {
          fx.push({ type: 'meter', from: t.id, to: s.playerId, meter: 'fear', amount: 25 }, { type: 'opinion', from: t.id, to: s.playerId, amount: -20, reason: 'Sent me a message', decay: 1 }, { type: 'health', charId: t.id, amount: -6 });
          if (rid) fx.push({ type: 'rivalOpinion', rival: rid, amount: -8, reason: `Roughed up ${t.firstName} ${t.lastName}` }, { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 4, chance: 0.25, hint: `${FACTION_NAMES[rid]} may hit back`, params: { rival: rid } });
        }
        fx.push({ type: 'respect', amount: 1 });
        break;
      }
      case 'torch':
        if (a.target && s.businesses.some((b) => b.id === a.target && b.owner === 'player')) fx.push({ type: 'removeBusiness', businessId: a.target });
        break;
      case 'juror': fx.push({ type: 'legal', op: 'defense', amount: 15 }); extra += ' One juror will not vote to convict.'; break;
      case 'witness': fx.push({ type: 'evidence', charId: s.playerId, amount: -12 }); extra += ' The case against you is thinner.'; break;
      case 'evidence': fx.push({ type: 'evidence', charId: s.playerId, amount: -20 }); extra += ' A box in the property room went missing.'; break;
      case 'dope': fx.push({ type: 'crewOpinion', amount: -3, reason: 'Touched junk', traitMods: { Greedy: 4, Pious: -3 } }); break;
      default: break;
    }
  } else {
    if (a.job === 'torch' && outcome === 'pinched' && a.target) fx.push({ type: 'closeBusiness', businessId: a.target, weeks: 6 });
    if ((a.job === 'juror' || a.job === 'witness' || a.job === 'evidence') && outcome === 'pinched') fx.push({ type: 'evidence', charId: s.playerId, amount: 10 }, { type: 'heat', bar: 'federal', amount: 3 });
    if (a.job === 'dope') fx.push({ type: 'crewOpinion', amount: -3, reason: 'Touched junk', traitMods: { Greedy: 4, Pious: -3 } });
    if ((a.job === 'runoff' || a.job === 'breakgame' || a.job === 'beating') && rid) fx.push({ type: 'rivalOpinion', rival: rid, amount: -6, reason: 'Came at us and failed' });
  }
  if (a.job === 'dope' && !s.flags.brunoKnows && rand(r) < (outcome === 'clean' ? 0.25 : 0.45)) {
    fx.push({ type: 'flag', key: 'brunoKnows', value: s.week }, { type: 'schedule', key: 'narcotics_found_out', minWeeks: 1, maxWeeks: 2, chance: 1, hint: 'word may reach Philadelphia' });
    extra += ' Word is moving toward Philadelphia.';
  }

  applyEffects(ctx, fx.map((e) => ({ ...e, label: e.label ?? label })), { label, because: `sent ${boss ? 'yourself' : name} on a job`, category: 'street' });
  // A big take into Family money: the boss cuts it up (cutScore.ts).
  if (take > 0 && a.pay !== 'pocket') offerCut(s, take, `the ${j.title.toLowerCase()} job`, boss ? undefined : c.id);
  const how = outcome === 'clean' ? 'went clean' : outcome === 'messy' ? 'went through, but somebody saw something' : outcome === 'bust' ? 'came up empty' : `went wrong: ${boss ? 'you were' : 'he was'} picked up`;
  const money = take > 0 ? ` $${take.toLocaleString('en-US')} ${a.pay === 'pocket' ? 'into your pocket' : a.job === 'torch' ? 'from the insurer (clean money)' : 'to the Family (dirty cash)'}${!boss ? `; ${c.firstName} kept his end` : ''}.` : '';
  const text = `${j.title}${tName ? ` (${tName})` : ''}, ${boss ? 'you' : c.firstName}: ${how}.${money}${extra}`;
  ctx.log.push(`Dirty work — ${text}`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${boss ? 'You' : displayName(c)} ${outcome === 'clean' || outcome === 'messy' ? 'pulled off' : 'tried'} a job: ${j.title.toLowerCase()}${tName ? ` (${tName})` : ''}${outcome === 'pinched' ? ', and was picked up' : ''}.`, kind: outcome === 'pinched' ? 'heat' : 'decision' });
  d.log.push({ week: s.week, job: a.job, who: c.id, ...(a.target ? { target: a.target } : {}), outcome, take, text, ...(rat ? { rat } : {}), odds, roll: Math.min(99, Math.floor(roll * 100)), label: `${j.title}${tName ? ` (${tName})` : ''}` });
  if (d.log.length > 12) d.log = d.log.slice(-12);
  d.stats.jobs++; d.stats[outcome]++; d.stats.take += take; if (rat) d.stats.rats++;
  // He learns from it, whichever way it went (crewXp.ts).
  dirtyXp(s, c.id, j.title, outcome, rat, j.tile === 'scores' && hi >= 5000);
}

/** The jobs whose results came in with the last week (for the panel). */
export function lastResults(s: GameState): DirtyResult[] {
  const d = s.dirty;
  if (!d) return [];
  const w = Math.max(...d.log.map((x) => x.week), -1);
  return d.log.filter((x) => x.week === w && w >= s.week - 1);
}

/** Jobs a quick button can offer for a place (Walk and Street cards). */
export function jobsForPlace(s: GameState, lot: Lot | undefined, biz?: Business): { job: DirtyJobId; target: string; label: string }[] {
  const out: { job: DirtyJobId; target: string; label: string }[] = [];
  if (shopOk(lot)) out.push({ job: 'shakedown', target: lot.id, label: 'Shake them down' });
  if (rivalLotOk(s, lot)) {
    out.push({ job: 'runoff', target: lot.id, label: 'Run them off' });
    // There is a back-room game to rob only where the place is open.
    if (isOperating(lot)) out.push({ job: 'cardgame', target: lot.id, label: 'Rob their game' });
  }
  if (biz && torchable(s, biz)) out.push({ job: 'torch', target: biz.id, label: 'An insurance fire' });
  return out;
}

/** Jobs aimed at a person (the character card): lean on him, pay him off, buy him, a hit. */
export function jobsForPerson(s: GameState, charId: string): DirtyJobId[] {
  const c = s.characters[charId];
  if (!c || !c.alive || c.id === s.playerId) return [];
  const out: DirtyJobId[] = [];
  if (c.office && OFFICE_BRIBE[c.office]) out.push('bribe');
  if (personOk(s, c, 'beating')) out.push('beating', 'hit');
  if (personOk(s, c, 'witness') && c.faction === 'none') out.push('witness');
  return out;
}
