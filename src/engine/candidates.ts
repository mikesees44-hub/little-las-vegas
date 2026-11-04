import { ageOn } from './calendar';
import { seatEligibility } from './eligibility';
import { owned, expectedTake } from './business';
import { capos, crew, displayName, hasTrait, isFree, player, relationLabel, relatives } from './characters';
import { holder, SEAT_INFO, seatOf, seatPower, TASKS } from './council';
import { CAPO_CUT, districtTake, NO_CAPO_EFFICIENCY, skimRate } from './economy';
import { fmtMoney } from './effects';
import { bloodLine, chooseHeir } from './dynasty';
import { HOUSE_KIND_LABEL } from './familyHouses';
import { dowryFor, marriageAcceptance, matchCandidates, marriageBlock } from './familyMarriage';
import { fam } from './familyState';
import { capoLoyalty, capoOf, regime } from './hierarchy';
import { placeName } from './econ';
import { kinCandidates, relationTo, workload } from './applicants';
import { crewCandidates, honestyOf, managerFromChar, managerFromPro, managerMult, managerOf, managing, proCandidates } from './managers';
import type { Manager } from './econState';
import { propertyNet } from './property';
import { getRelation, opinion } from './relations';
import { CITIES, SCHEME_INFO, schemeOdds } from './schemes';
import { bonesBlock, bonesOdds, hasBones, JOB_INFO } from './bones';
import { capability, challengePressure, successionCandidates, WANT_TEXT } from './heir';
import { pwView } from './powerState';
import { keeper } from './ledgerbook';
import { controlIndex } from './polIntegrity';
import { nameOf, peekCtl } from './polGov';
import { envelope, favorsFor, payrollAcceptance, topOffice } from './polPuppets';
import { isOfficial } from './polPeople';
import { FAVORS, OFFICE_DEFS } from './polData';
import { forecast } from './table';
import { FACTION_NAMES } from './world';
import { previewAction } from './actions';
import type { Attributes, Character, GameState, PlayerAction, RivalId, SchemeKind, SchemeOptions, Seat } from './types';
import { CAPO_SEAT_MIN } from './regimes';

/**
 * Picking a person (CK's "who should I send?"). One function ranks the
 * candidates for every kind of decision — a council seat, a capo, a man to
 * propose, who vouches for him, a manager, an envoy, a hit team, an heir, a
 * marriage, which Table member to lobby — and explains each in plain words:
 * a predicted outcome, the top three pros and cons, the risk flags, what it
 * costs to pull him from what he does now, and a Recommended pick plus an
 * Alternative with a different trade-off.
 *
 * Pure and deterministic. It uses only what the player can see (hidden
 * informants and a stranger's real honesty stay hidden).
 */

export type Role =
  | { kind: 'seat'; seat: Seat }
  | { kind: 'capo'; district?: string }
  | { kind: 'make' }
  | { kind: 'voucher'; charId: string }
  /** `base`/`place`: a place not bought yet (the Deal window). */
  | { kind: 'manager'; key: string; base?: number; place?: string }
  | { kind: 'agent'; scheme: SchemeKind; targetId?: string; opts: SchemeOptions; with?: string[] }
  | { kind: 'envoy'; city: string; depth?: SchemeOptions['depth'] }
  | { kind: 'heir'; /** Include senior men outside the blood (the Power tab's succession candidates). */ wide?: boolean }
  | { kind: 'marriage'; memberId: string; matrilineal?: boolean }
  | { kind: 'lobby'; disputeId: string }
  /** Which official to work on (City Hall). */
  | { kind: 'official' }
  /** Who keeps the books (The Books). */
  | { kind: 'keeper' }
  /** Who should make his bones on this kind of job. */
  | { kind: 'bones'; job: 'heist' | 'collection' | 'hit' };

export interface Chip {
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

export interface Candidate {
  /** Character id, or "pro:N" for a hired professional. */
  id: string;
  name: string;
  charId?: string;
  /** Predicted outcome, 0..100 (higher is better for you). */
  score: number;
  /** The predicted outcome in words: "≈ +$420/wk", "62% success". */
  outcome: string;
  /** 0..100: how little can go wrong with him. */
  safety: number;
  /** 0..100: the best case, ignoring risk. */
  upside: number;
  /** What he thinks of you (if a person you know). */
  opinion?: number;
  /** What he thinks of his capo (soldiers and associates). */
  capoLoyalty?: number;
  pros: Chip[];
  cons: Chip[];
  /** Risk flags: evidence, debts, secrets, rivals courting him ... */
  flags: Chip[];
  /** What you lose by pulling him from what he does now. */
  opportunityCost?: string;
  /** The order that puts him in (queue it to pick him). */
  action?: PlayerAction;
  disabledReason?: string;
}

export interface Ranking {
  role: Role;
  title: string;
  /** "Who should be bagman?" */
  question: string;
  /** Sorted best first. */
  candidates: Candidate[];
  recommendedId?: string;
  alternativeId?: string;
  /** "Safest choice" / "Highest upside" / "Next best". */
  alternativeWhy?: string;
}

/* ------------------------------------------------------------------ */
/* Shared reading of a man                                             */
/* ------------------------------------------------------------------ */

const SKILL_NAME: Record<keyof Attributes, string> = { leadership: 'Leadership', business: 'Business', diplomacy: 'Diplomacy', intrigue: 'Intrigue', force: 'Muscle', discipline: 'Discipline' };

interface W extends Chip {
  w: number;
}

const pro = (text: string, w: number): W => ({ text, tone: 'good', w });
const con = (text: string, w: number): W => ({ text, tone: 'bad', w });

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** What a man is already doing for you (for the opportunity cost). */
export function jobsOf(s: GameState, c: Character): string[] {
  const out: string[] = [];
  const st = seatOf(s, c.id);
  if (st) out.push(`${SEAT_INFO[st].name} (×${seatPower(s, st).toFixed(2)})`);
  const d = s.districts.find((x) => x.capoId === c.id);
  if (d && c.rank === 'capo') out.push(`Capo of ${d.name}`);
  const m = managing(s, c.id);
  if (m) out.push(`Runs ${placeName(s, m)}`);
  if (s.schemes.some((x) => x.owner === 'player' && x.agents.includes(c.id))) out.push('On a scheme');
  const staffed = owned(s).filter((b) => (b.staffIds ?? []).includes(c.id));
  if (staffed.length) out.push(`Works ${staffed.map((b) => b.name).slice(0, 2).join(', ')}`);
  return out;
}

function opportunityCost(s: GameState, c: Character, except?: string): string | undefined {
  const jobs = jobsOf(s, c).filter((j) => !except || !j.startsWith(except));
  if (jobs.length) return `Pulled from: ${jobs.join('; ')}`;
  if ((c.lastEarn ?? 0) > 0) return `His hustle (${fmtMoney(c.lastEarn ?? 0)} last week) may slow`;
  return undefined;
}

/** The risk flags anyone can see on his sheet. */
function flagsOf(s: GameState, c: Character): { flags: Chip[]; penalty: number } {
  const flags: Chip[] = [];
  let penalty = 0;
  const ev = Math.round(c.evidence ?? 0);
  if (ev >= 40) { flags.push({ text: `The law has a file on him (${ev})`, tone: 'bad' }); penalty += ev >= 65 ? 20 : 10; }
  if (c.debtTo) { flags.push({ text: `Owes a ${FACTION_NAMES[c.debtTo.rival]} shylock ${fmtMoney(c.debtTo.amount)}`, tone: 'bad' }); penalty += 12; }
  if (c.courtedBy) { flags.push({ text: `${FACTION_NAMES[c.courtedBy.rival]} is courting him`, tone: 'bad' }); penalty += 15; }
  if ((c.defectStage ?? 0) > 0) { flags.push({ text: 'Seen with a rival crew', tone: 'bad' }); penalty += 15; }
  if (s.factions.some((f) => f.memberIds.includes(c.id))) { flags.push({ text: 'In a faction against you', tone: 'bad' }); penalty += 20; }
  const secrets = s.secrets.filter((x) => x.ownerId === c.id);
  if (secrets.some((x) => x.knownBy.some((k) => k !== 'player'))) { flags.push({ text: 'A rival knows one of his secrets', tone: 'bad' }); penalty += 8; }
  if (secrets.some((x) => x.knownBy.includes('player'))) flags.push({ text: 'You know a secret of his (leverage)', tone: 'neutral' });
  if (s.hooks.some((h) => h.holder === 'player' && h.targetId === c.id)) flags.push({ text: 'You hold a hook on him', tone: 'neutral' });
  if (!isFree(s, c)) { flags.push({ text: `In jail until week ${c.imprisonedUntil}`, tone: 'bad' }); penalty += 30; }
  if (c.health < 40) { flags.push({ text: `Poor health (${c.health})`, tone: 'bad' }); penalty += 8; }
  return { flags, penalty };
}

/** Loyalty and character, read for a given kind of job. */
function character(s: GameState, c: Character, focus: 'money' | 'command' | 'muscle' | 'talk' | 'blood'): { pros: W[]; cons: W[]; risk: number } {
  const pros: W[] = [];
  const cons: W[] = [];
  let risk = 0;
  if (c.id === s.playerId) return { pros, cons, risk };
  const op = opinion(s, c.id, s.playerId);
  if (op >= 40) pros.push(pro(`Loyal to you (+${op})`, 18));
  else if (op >= 15) pros.push(pro(`Likes you (+${op})`, 8));
  else if (op <= -20) { cons.push(con(`Dislikes you (${op})`, 20)); risk += 15; }
  const cl = capoLoyalty(s, c);
  const k = capoOf(s, c);
  if (cl !== undefined && k && cl > op + 10) { cons.push(con(`Loyal to his capo ${k.firstName}, not you`, 12)); risk += 6; }
  if (hasTrait(c, 'Loyal-to-a-fault')) pros.push(pro('Loyal to a fault', 14));
  if (hasTrait(c, 'Ambitious') || c.goal === 'take_chair') {
    const w = focus === 'command' ? 22 : 8;
    cons.push(con(c.goal === 'take_chair' ? 'Ambitious: wants your chair' : 'Ambitious: may want your seat', w));
    risk += focus === 'command' ? 15 : 5;
  }
  if (focus === 'money') {
    if (hasTrait(c, 'Honest')) pros.push(pro('Honest: won\'t skim', 14));
    if (hasTrait(c, 'Greedy')) { cons.push(con('Greedy: his hand will be in the till', 16)); risk += 10; }
    if (hasTrait(c, 'Gambler')) { cons.push(con('Gambles: money goes missing', 10)); risk += 6; }
  }
  if (focus === 'talk') {
    if (hasTrait(c, 'Charming')) pros.push(pro('Charming: people open up', 12));
    if (hasTrait(c, 'Hot-headed')) { cons.push(con('Hot-headed: says the wrong thing', 12)); risk += 6; }
  }
  if (focus === 'muscle') {
    if (hasTrait(c, 'Cowardly')) { cons.push(con('Cowardly: may freeze', 14)); risk += 8; }
    if (hasTrait(c, 'Cruel')) pros.push(pro('Cruel: nobody argues with him', 6));
  }
  if (focus === 'command') {
    if (hasTrait(c, 'Patient')) pros.push(pro('Patient: keeps a cool head', 8));
    if (hasTrait(c, 'Hot-headed')) { cons.push(con('Hot-headed: starts fights', 10)); risk += 5; }
  }
  if (hasTrait(c, 'Drinker')) { cons.push(con('Drinks: talks too much', focus === 'talk' || focus === 'muscle' ? 10 : 6)); risk += 5; }
  if (c.dynasty && focus !== 'blood') pros.push(pro('Blood of the house', 8));
  // Kin on the other side.
  for (const r of relatives(s, c)) {
    if (s.rivals.some((x) => x.id === r.faction && x.kind !== 'law')) {
      cons.push(con(`His ${relationLabel(s, c, r)} is a ${FACTION_NAMES[r.faction]} man`, 12));
      risk += 6;
      break;
    }
  }
  const g = getRelation(s, c.id, s.playerId)?.grievance ?? 0;
  if (g >= 40) { cons.push(con(`Holds a grudge (${g})`, 12)); risk += 8; }
  return { pros, cons, risk };
}

function top3(xs: W[]): Chip[] {
  return [...xs].sort((a, b) => b.w - a.w).slice(0, 3).map(({ text, tone }) => ({ text, tone }));
}

interface Raw {
  id: string;
  name: string;
  charId?: string;
  /** Raw outcome 0..100 ignoring risk. */
  upside: number;
  outcome: string;
  pros: W[];
  cons: W[];
  risk: number;
  flags?: Chip[];
  opportunityCost?: string;
  action?: PlayerAction;
  disabledReason?: string;
  /** A job that does not count against him (the seat he would keep). */
  keepJob?: string;
}

function finish(s: GameState, raw: Raw): Candidate {
  const c = raw.charId ? s.characters[raw.charId] : undefined;
  const fl = c ? flagsOf(s, c) : { flags: [], penalty: 0 };
  const jobs = c ? jobsOf(s, c) : [];
  // Chips go where their tone says, whichever list a role put them in.
  const all = [...raw.pros, ...raw.cons];
  const pros = all.filter((x) => x.tone !== 'bad');
  const cons = all.filter((x) => x.tone === 'bad');
  if (!all.length) pros.push({ text: 'Nothing stands out either way', tone: 'neutral', w: 0 });
  if (jobs.length >= 2) cons.push(con(`Already running ${jobs.length === 2 ? 'two' : jobs.length} things`, 10));
  const risk = raw.risk + fl.penalty + (jobs.length >= 2 ? 5 : 0);
  const safety = clamp(100 - risk);
  // Every job he already does is something you give up.
  const busy = c ? jobsOf(s, c).filter((j) => !raw.keepJob || !j.startsWith(raw.keepJob)).length : 0;
  const score = clamp(raw.upside * 0.7 + safety * 0.3 - busy * 5 - (raw.disabledReason ? 40 : 0));
  return {
    id: raw.id, name: raw.name, charId: raw.charId, score, outcome: raw.outcome, safety, upside: clamp(raw.upside),
    opinion: c && c.id !== s.playerId ? opinion(s, c.id, s.playerId) : undefined,
    capoLoyalty: c ? capoLoyalty(s, c) : undefined,
    pros: top3(pros), cons: top3(cons), flags: [...(raw.flags ?? []), ...fl.flags],
    opportunityCost: raw.opportunityCost, action: raw.action, disabledReason: raw.disabledReason,
  };
}

/** Where a skill sits among the pool: "best in the family" etc. */
function skillChip(pool: Character[], c: Character, k: keyof Attributes, label?: string): W {
  const v = c.attributes[k];
  const best = Math.max(...pool.map((x) => x.attributes[k]));
  const what = label ?? SKILL_NAME[k];
  if (v >= best && pool.length > 1) return pro(`${what} ${v}: the best of them`, 20);
  if (v >= 70) return pro(`${what} ${v}: strong`, 14);
  if (v >= 55) return pro(`${what} ${v}`, 6);
  return con(`${what} only ${v}`, v < 40 ? 16 : 8);
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

const SEAT_FOCUS: Record<Seat, 'money' | 'command' | 'muscle' | 'talk'> = { underboss: 'command', consigliere: 'talk', bagman: 'money', enforcer: 'muscle', fixer: 'talk' };

function seatRole(s: GameState, seat: Seat, pool: Character[]): Raw[] {
  const info = SEAT_INFO[seat];
  const cur = holder(s, seat);
  const curPow = seatPower(s, seat);
  return pool.map((c) => {
    const v = c.attributes[info.skill];
    const pow = Math.max(0.2, v / 60);
    const ch = character(s, c, SEAT_FOCUS[seat]);
    const pros = [skillChip(pool, c, info.skill), ...ch.pros];
    const cons = [...ch.cons];
    if (seat === 'bagman' || seat === 'consigliere') pros.push(c.attributes.discipline >= 60 ? pro(`Discipline ${c.attributes.discipline}: keeps quiet`, 6) : con(`Discipline ${c.attributes.discipline}: loose lips`, 4));
    const sitting = cur?.id === c.id;
    if (sitting) pros.push(pro('In the seat now: no change, no hard feelings', 12));
    else if (cur && pow < curPow) cons.push(con(`Worse at it than ${cur.firstName} (×${curPow.toFixed(2)} now)`, 18));
    const task = TASKS[s.council[seat].task];
    return {
      id: c.id, name: displayName(c), charId: c.id,
      upside: 30 + v * 0.7 - (cur && !sitting && pow < curPow ? (curPow - pow) * 60 : 0),
      outcome: sitting ? `In the seat: ${task.name} at ×${pow.toFixed(2)}` : `${task.name} at ×${pow.toFixed(2)}${cur ? ` (now ×${curPow.toFixed(2)})` : ''}`,
      pros, cons, risk: ch.risk,
      opportunityCost: sitting ? undefined : opportunityCost(s, c, info.name),
      keepJob: info.name,
      action: sitting ? undefined : { kind: 'appoint', seat, charId: c.id },
      // The same rule as every other Appoint button (eligibility.ts).
      disabledReason: sitting ? undefined : seatEligibility(s, seat, c.id).why,
    };
  });
}

/** The district a new capo would take (the same rule as the promotion). */
export function capoDistrict(s: GameState, district?: string) {
  if (district) return s.districts.find((d) => d.id === district);
  return s.districts.find((x) => (!x.capoId || !s.characters[x.capoId]?.alive) && (x.influence.player ?? 0) >= CAPO_SEAT_MIN);
}

/** What a capo with this business skill would kick up a week from the district, after his share and his skim. */
export function capoKickup(s: GameState, c: Character, districtId: string): number {
  const take = districtTake(s, districtId) * (0.85 + c.attributes.business / 400);
  return Math.round(take * (1 - CAPO_CUT) * (1 - skimRate(s, c)));
}

/** What the district pays you now, with nobody running it. */
export function leaderlessTake(s: GameState, districtId: string): number {
  return Math.round(districtTake(s, districtId) * NO_CAPO_EFFICIENCY);
}

function capoRole(s: GameState, pool: Character[], district?: string): Raw[] {
  const d = capoDistrict(s, district);
  return pool.map((c) => {
    const ch = character(s, c, 'command');
    const kick = d ? capoKickup(s, c, d.id) : 0;
    const now = d ? leaderlessTake(s, d.id) : 0;
    const lead = c.attributes.leadership;
    const pros = [skillChip(pool, c, 'leadership'), skillChip(pool, c, 'business'), ...ch.pros];
    if (c.attributes.force >= 65) pros.push(pro(`Muscle ${c.attributes.force}: holds the corners`, 8));
    const k = capoOf(s, c);
    const own = k ? regime(s, k.id).length : 0;
    const cons = [...ch.cons];
    if (k && own <= 2) cons.push(con(`${k.firstName}'s crew is thin without him`, 6));
    if (skimRate(s, c) >= 0.08) cons.push(con(`Will skim ~${Math.round(skimRate(s, c) * 100)}%`, 12));
    return {
      id: c.id, name: displayName(c), charId: c.id,
      upside: 25 + lead * 0.4 + c.attributes.business * 0.3 + c.attributes.force * 0.1,
      outcome: d ? `Kicks up ≈ ${fmtMoney(kick)}/wk (${kick >= now ? '+' : '−'}${fmtMoney(Math.abs(kick - now))} vs. now)` : 'No district needs a capo',
      pros, cons, risk: ch.risk + Math.round(skimRate(s, c) * 60),
      opportunityCost: opportunityCost(s, c),
      action: { kind: 'interact', id: 'promote', target: c.id },
      disabledReason: !d ? 'Every district you hold already has a capo' : !isFree(s, c) ? 'He is in jail' : undefined,
    };
  });
}

function makeRole(s: GameState, pool: Character[]): Raw[] {
  const maxEarn = Math.max(1, ...pool.map((c) => c.lastEarn ?? 0));
  return pool.map((c) => {
    const ch = character(s, c, 'command');
    const earn = c.lastEarn ?? 0;
    const pros: W[] = [...ch.pros];
    const cons: W[] = [...ch.cons];
    if (earn >= maxEarn && pool.length > 1 && earn > 0) pros.push(pro(`Best earner (${fmtMoney(earn)} last week)`, 18));
    else if (earn > 0) pros.push(pro(`Earned ${fmtMoney(earn)} last week`, 6));
    if (c.checkedWeek === undefined && !c.dynasty) cons.push(con('Nobody has checked him out', 10));
    if ((c.record ?? 0) >= 2) cons.push(con(`${c.record} arrests on his sheet`, 8));
    if (c.goal === 'get_made') pros.push(pro('It is all he wants', 10));
    if (hasBones(c)) pros.push(pro(`Made his bones (${c.bones?.[0]?.job ?? 'a job'})`, 12));
    const k = capoOf(s, c);
    const v = k ?? player(s);
    const action: PlayerAction = { kind: 'propose', charId: c.id };
    return {
      id: c.id, name: displayName(c), charId: c.id,
      upside: 30 + (earn / maxEarn) * 35 + c.attributes.discipline * 0.2 + c.attributes.force * 0.1,
      outcome: `${v.id === s.playerId ? 'You vouch' : `${v.firstName} vouches`}; ${s.books?.open ? 'the books are open' : 'waits for the books'}`,
      pros, cons, risk: ch.risk + (c.checkedWeek === undefined && !c.dynasty ? 8 : 0),
      opportunityCost: undefined,
      action,
      // The same check the order card makes (bones, money, the books), so the picker never offers what the card refuses.
      disabledReason: c.proposedWeek !== undefined ? 'Already proposed' : previewAction(s, action).disabledReason,
    };
  });
}

function voucherRole(s: GameState, assocId: string, pool: Character[]): Raw[] {
  const a = s.characters[assocId];
  return pool.map((v) => {
    const isBoss = v.id === s.playerId;
    const op = a ? opinion(s, v.id, a.id) : 0;
    const pros: W[] = [];
    const cons: W[] = [];
    if (a?.capoId === v.id) pros.push(pro('His own capo: knows him best', 16));
    if (op >= 20) pros.push(pro(`Thinks well of ${a?.firstName} (+${op})`, 10));
    if (op <= -10) cons.push(con(`Doesn't like ${a?.firstName} (${op})`, 12));
    if (isBoss) cons.push(con('If he goes bad, it is on you', 14));
    else {
      const ch = character(s, v, 'command');
      pros.push(...ch.pros.slice(0, 1));
      cons.push(...ch.cons.slice(0, 1));
      if ((v.evidence ?? 0) >= 40) cons.push(con('His own file is thick: a bad vouch could sink him', 8));
    }
    return {
      id: v.id, name: isBoss ? 'You' : displayName(v), charId: v.id,
      upside: 40 + op * 0.3 + (a?.capoId === v.id ? 20 : 0) + v.attributes.discipline * 0.2,
      outcome: isBoss ? 'You stand for him yourself' : `${v.firstName} stands for him`,
      pros, cons, risk: isBoss ? 10 : 0,
      action: a ? { kind: 'propose', charId: a.id, voucherId: v.id } : undefined,
    };
  });
}

function placeBase(s: GameState, key: string): number {
  if (key.startsWith('lot:')) {
    const l = s.econ?.lots.find((x) => `lot:${x.id}` === key);
    return l ? Math.max(0, propertyNet(s, l, 1).rev) : 0;
  }
  const b = s.businesses.find((x) => x.id === key);
  if (!b) return 0;
  const cur = managerOf(s, key);
  return expectedTake(s, b) / managerMult(cur);
}

/** A stranger's honesty as his references suggest it (the truth stays hidden). */
function apparentHonesty(hint: string): number {
  return hint.startsWith('References glowing') ? 75 : hint.startsWith('References fine') ? 55 : 30;
}

function managerNet(base: number, m: Manager, honesty: number): number {
  const skimEst = honesty >= 60 ? 0 : ((60 - honesty) / 60) * 0.18 * 0.6 * (m.loyalty < 40 ? 1.3 : 1);
  return Math.round(base * (managerMult(m) - 1) - m.salary - base * m.share - base * Math.min(0.3, skimEst));
}

function managerRole(s: GameState, key: string, pool: Character[], given?: number): Raw[] {
  const base = given ?? placeBase(s, key);
  const cur = managerOf(s, key);
  const curNet = cur ? managerNet(base, cur, cur.source === 'pro' ? 55 : cur.honesty) : 0;
  const out: Raw[] = [];
  for (const c of pool) {
    const source = c.dynasty ? 'family' : 'crew';
    const m = managerFromChar(s, c, source);
    const work = workload(s, c, key);
    m.effort = work.effort;
    const net = managerNet(base, m, m.honesty);
    const ch = character(s, c, 'money');
    const pros: W[] = [skillChip(pool, c, 'business'), ...ch.pros];
    const cons: W[] = [...ch.cons];
    if (c.dynasty || source === 'family') pros.push(pro(`Family: ${relationTo(s, c).replace(/^your /, 'your ')}`, 6));
    if (work.time < 60) cons.push(con(`Busy: ${work.jobs[0] ?? 'other work'} (time ${work.time})`, 10));
    else if (work.time >= 90) pros.push(pro(`Has the time (${work.time})`, 6));
    if (work.energy < 60) cons.push(con(`Worn down: ${work.tired.join(', ')} (energy ${work.energy})`, 10));
    if (m.honesty >= 75 && !hasTrait(c, 'Honest')) pros.push(pro(`Honest enough (${m.honesty})`, 8));
    if (m.honesty < 45 && !hasTrait(c, 'Greedy')) cons.push(con(`Honesty ${m.honesty}: may skim`, 12));
    if (m.share) cons.push(con(`Takes ${Math.round(m.share * 100)}% of the take`, 4));
    out.push({
      id: c.id, name: displayName(c), charId: c.id,
      upside: 50 + (net / Math.max(200, base)) * 100,
      outcome: `≈ ${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}/wk net${cur ? ` (now ${curNet >= 0 ? '+' : '−'}${fmtMoney(Math.abs(curNet))})` : ''}`,
      pros, cons, risk: ch.risk + Math.max(0, 60 - honestyOf(c)) / 2,
      opportunityCost: opportunityCost(s, c),
      action: { kind: 'econ', op: { type: 'manager', key, source, charId: c.id } },
      disabledReason: managing(s, c.id) && managing(s, c.id) !== key ? 'Already runs another place' : undefined,
    });
  }
  proCandidates(s, key).forEach((p, i) => {
    const m = managerFromPro(s, p);
    const h = apparentHonesty(p.hint);
    const net = managerNet(base, m, h);
    const pros: W[] = [];
    const cons: W[] = [];
    if (p.skill >= 70) pros.push(pro(`Business ${p.skill}: a real professional`, 18)); else if (p.skill < 45) cons.push(con(`Business only ${p.skill}`, 12));
    if (h >= 70) pros.push(pro('Glowing references', 10)); else if (h < 40) cons.push(con('His references don\'t call back', 16));
    cons.push(con('A stranger: honesty unknown until you audit', 8));
    if (p.loyalty < 40) cons.push(con(`Little loyalty (${p.loyalty})`, 8));
    pros.push(pro('No ties to the crew or the house', 4));
    out.push({
      id: `pro:${i}`, name: p.name,
      upside: 50 + (net / Math.max(200, base)) * 100,
      outcome: `≈ ${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}/wk net, if the references are right`,
      pros, cons, risk: 15 + Math.max(0, 60 - h) / 2,
      action: { kind: 'econ', op: { type: 'manager', key, source: 'pro', pro: i } },
    });
  });
  return out;
}

function agentRole(s: GameState, kind: SchemeKind, targetId: string | undefined, opts: SchemeOptions, others: string[], pool: Character[]): Raw[] {
  const team = others.filter((id) => s.characters[id]);
  const base = team.length ? schemeOdds(s, kind, targetId, team, opts) : undefined;
  const talk = kind === 'envoy' || kind === 'befriend' || kind === 'sway' || kind === 'informant';
  return pool.map((c) => {
    const ids = team.includes(c.id) ? team : [...team, c.id].slice(-4);
    const o = schemeOdds(s, kind, targetId, ids, opts);
    const alone = schemeOdds(s, kind, targetId, [c.id], opts);
    const gain = base ? o.chance - base.chance : alone.chance;
    const ch = character(s, c, talk ? 'talk' : 'muscle');
    const pros: W[] = [...ch.pros];
    const cons: W[] = [...ch.cons];
    const mine = alone.reasons.filter((r) => r.label.startsWith(c.firstName) || r.label.includes('agent'));
    if (talk) { pros.push(skillChip(pool, c, 'diplomacy')); } else { pros.push(skillChip(pool, c, 'force')); }
    pros.push(skillChip(pool, c, 'intrigue'));
    for (const r of mine) if (r.value >= 10 && !r.label.includes('agent')) pros.push(pro(`${r.label} (+${r.value})`, 16));
    if (c.specialty) pros.push(pro(`A ${c.specialty}`, 6));
    if (kind === 'envoy' && c.dynasty) pros.push(pro(c.id === s.playerId ? 'You go yourself: it shows respect' : 'Family goes: it shows respect', 14));
    if (hasTrait(c, 'Drinker') && SCHEME_INFO[kind].hostile) cons.push(con('Drinks: secrecy −8', 10));
    if ((c.evidence ?? 0) >= 50 && SCHEME_INFO[kind].hostile) cons.push(con('If he is picked up, he has a lot to trade', 8));
    if (c.id === s.playerId) cons.push(con('Away from Wildwood for weeks', 6));
    return {
      id: c.id, name: c.id === s.playerId ? 'You' : displayName(c), charId: c.id,
      upside: o.chance * 100,
      outcome: team.includes(c.id) ? `On the team: ${Math.round(o.chance * 100)}%` : `${Math.round(o.chance * 100)}% with him${base ? ` (${gain >= 0 ? '+' : '−'}${Math.abs(Math.round(gain * 100))})` : ''} · secrecy ${o.secrecy}`,
      pros, cons, risk: ch.risk + (SCHEME_INFO[kind].hostile ? Math.max(0, 60 - o.secrecy) / 3 : 0),
      opportunityCost: c.id === s.playerId ? 'You are away: no office hours, slower answers' : opportunityCost(s, c),
      disabledReason: s.schemes.some((x) => x.owner === 'player' && x.agents.includes(c.id)) ? 'Already on another scheme' : !isFree(s, c) ? 'In jail' : undefined,
    };
  });
}

function heirRole(s: GameState, pool: Character[]): Raw[] {
  const boss = player(s);
  const blood = chooseHeir({ ...s, successionLaw: 'blood' }, boss).heir;
  const cs = capos(s);
  return pool.map((c) => {
    const age = ageOn(c.birth, s.date);
    const pros: W[] = [];
    const cons: W[] = [];
    const lead = c.attributes.leadership;
    pros.push(lead >= 60 ? pro(`Leadership ${lead}`, 14) : con(`Leadership only ${lead}`, 12));
    const capoView = cs.length ? Math.round(cs.reduce((a, k) => a + opinion(s, k.id, c.id), 0) / cs.length) : 0;
    if (capoView >= 15) pros.push(pro(`The capos respect him (+${capoView})`, 16));
    else if (capoView <= -10) cons.push(con(`The capos don't respect him (${capoView})`, 16));
    const op = opinion(s, c.id, boss.id);
    if (op >= 30) pros.push(pro(`Loves you (+${op})`, 8)); else if (op <= -15) cons.push(con(`Resents you (${op})`, 12));
    if (age < 21) cons.push(con(`Only ${age}: the capos won't follow a boy`, 18));
    else if (age >= 25 && age <= 50) pros.push(pro(`${age}: the right age`, 6));
    else if (age > 60) cons.push(con(`${age}: he won't sit long`, 10));
    if (c.health < 50) cons.push(con(`Health ${c.health}`, 12));
    if (blood?.id === c.id) pros.push(pro('The blood heir anyway: no claimants', 10));
    else if (blood && c.dynasty) cons.push(con(`${blood.firstName} has the stronger claim by blood`, 8));
    const goal = fam(s, c.id).goal;
    if (goal === 'get_out') cons.push(con('Wants out of the life', 16));
    if (goal === 'the_chair') pros.push(pro('Wants the chair', 8));
    if (c.rank !== 'civilian') pros.push(pro(`Knows the business (${c.rank})`, 10));
    // The heir paradox: how good a boss he would be, and how hard he is pushing for it now.
    const cap = capability(s, c).score;
    const press = challengePressure(s, c).score;
    if (cap >= 60) pros.push(pro(`Would make a strong boss (capability ${cap})`, 16));
    else if (cap < 40) cons.push(con(`Would make a weak boss (capability ${cap})`, 14));
    if (press >= 60) cons.push(con(`Pushing for the chair now (pressure ${press}): naming him may hurry him`, 14));
    else if (press < 30 && cap >= 50) pros.push(pro(`Patient: no push for the chair (pressure ${press})`, 8));
    const amb = pwView(s).ambitions[c.id];
    if (amb?.revealed) (amb.want === 'out' ? cons : pros).push(amb.want === 'out' ? con(`He ${WANT_TEXT[amb.want]}`, 16) : pro(`He ${WANT_TEXT[amb.want]}`, amb.want === 'chair' ? 6 : 2));
    if (!c.dynasty) cons.push(con(`Not of the blood: ${blood ? `${blood.firstName} keeps a claim` : 'the house may not accept him'}`, 14));
    return {
      id: c.id, name: displayName(c), charId: c.id,
      upside: (c.dynasty ? 12 : 4) + lead * 0.25 + c.attributes.diplomacy * 0.1 + c.attributes.intrigue * 0.05 + cap * 0.25 + capoView * 0.3 + (age >= 21 ? 10 : 0),
      outcome: `${c.dynasty ? relationLabel(s, boss, c) : c.rank}, ${age} · capability ${cap} · pressure ${press}`,
      pros, cons, risk: (age < 21 ? 15 : 0) + (c.health < 50 ? 15 : 0) + (op < -15 ? 10 : 0) + (goal === 'get_out' ? 15 : 0) + Math.max(0, press - 50) * 0.4,
    };
  });
}

function marriageRole(s: GameState, memberId: string, matri: boolean): Raw[] {
  const m = s.characters[memberId];
  if (!m) return [];
  return matchCandidates(s, m).map(({ house, c }) => {
    const acc = marriageAcceptance(s, m, c, matri);
    const dowry = dowryFor(s, m, house, matri);
    const pros: W[] = [];
    const cons: W[] = [];
    const fac = house.faction && s.rivals.some((r) => r.id === house.faction) ? (house.faction as RivalId) : undefined;
    if (fac && house.leads) pros.push(pro(`Allies you with ${FACTION_NAMES[fac]}: no strikes from them`, 22));
    else if (fac) pros.push(pro(`A tie to ${FACTION_NAMES[fac]}`, 10));
    if (house.kind === 'philly') pros.push(pro('Philadelphia family: Table votes lean your way', 18));
    if (house.kind === 'political') pros.push(pro('Political family: favors at City Hall', 14));
    if (house.kind === 'legit') pros.push(pro('A respectable name', 8));
    if (house.strength >= 60) pros.push(pro(`A strong house (${house.strength})`, 10));
    if (dowry > 0) pros.push(pro(`They pay a ${fmtMoney(dowry)} dowry`, 6 + dowry / 1000)); else if (dowry < 0) cons.push(con(`You pay a ${fmtMoney(-dowry)} dowry`, 6 + -dowry / 1000));
    for (const r of acc.reasons.filter((x) => x.value < 0 && x.label !== 'Base').sort((a, b) => a.value - b.value).slice(0, 2)) cons.push(con(`${r.label} (${r.value})`, -r.value / 2));
    const block = marriageBlock(s, m, c);
    return {
      id: c.id, name: `${displayName(c)} (${house.name})`, charId: c.id,
      upside: acc.chance * 55 + house.strength * 0.35 + (fac && house.leads ? 12 : 0) + (house.kind === 'philly' ? 10 : 0),
      outcome: `${Math.round(acc.chance * 100)}% they accept · ${HOUSE_KIND_LABEL[house.kind]}`,
      pros, cons, risk: Math.round((1 - acc.chance) * 30),
      action: { kind: 'dynasty', op: { type: 'marry', memberId, spouseId: c.id, matrilineal: matri || undefined } },
      disabledReason: block,
    };
  });
}

function lobbyRole(s: GameState, disputeId: string): Raw[] {
  const d = s.disputes.find((x) => x.id === disputeId);
  if (!d || d.ruling) return [];
  const leans = forecast(s, d);
  const yes = leans.filter((l) => l.value > 0).length;
  return leans.map((l) => {
    const v = l.value;
    const flips = v <= 0 && v + 20 > 0;
    const pros: W[] = [];
    const cons: W[] = [];
    if (flips) pros.push(pro('An envelope flips his vote', 24));
    else if (v <= 0 && v + 40 > 0) pros.push(pro('A favor or a hook would flip him', 12));
    if (v > 0 && v <= 15) pros.push(pro('With you, barely: shore him up', 10));
    if (v > 15) cons.push(con('Already with you', 18));
    if (v + 40 <= 0) cons.push(con('Too far gone to flip', 20));
    for (const r of l.reasons.filter((x) => x.value <= -10).sort((a, b) => a.value - b.value).slice(0, 1)) cons.push(con(`${r.label} (${r.value})`, 6));
    for (const r of l.reasons.filter((x) => x.value >= 10).sort((a, b) => b.value - a.value).slice(0, 1)) pros.push(pro(`${r.label} (+${r.value})`, 4));
    const swing = flips ? 95 : v <= 0 && v + 40 > 0 ? 65 : v > 0 && v <= 15 ? 45 : v > 15 ? 10 : 15;
    return {
      id: l.member.id, name: displayName(l.member), charId: l.member.id,
      upside: swing,
      outcome: `Leans ${v > 0 ? '+' : ''}${v} → ${v + 20 > 0 ? '+' : ''}${v + 20} with an envelope · ${yes} of ${leans.length} with you now`,
      pros, cons, risk: 0,
      action: { kind: 'lobby', disputeId, memberId: l.member.id, mode: 'money' },
    };
  });
}

/** City Hall: whom to work on. Payroll odds, what his offices can do for you, and the scrutiny on him. */
function officialRole(s: GameState): Raw[] {
  const pol = s.pol;
  if (!pol) return [];
  const seen = new Set<string>();
  const out: Raw[] = [];
  for (const d of OFFICE_DEFS) {
    if (!d.reach) continue;
    for (const id of pol.offices[d.id]?.holders ?? []) {
      const p = id ? pol.people[id] : undefined;
      if (!p || !p.alive || seen.has(p.id) || !isOfficial(p)) continue;
      seen.add(p.id);
      const ctl = peekCtl(s, p.id);
      const idx = ctl ? controlIndex(ctl) : 0;
      const favs = favorsFor(s, p);
      const top = topOffice(s, p);
      const pay = ctl?.payroll ? undefined : payrollAcceptance(s, p);
      const pros: W[] = [];
      const cons: W[] = [];
      if (favs.length) pros.push(pro(`Can do: ${favs.slice(0, 3).map((f) => FAVORS[f.kind].name.toLowerCase()).join(', ')}`, 6 + favs.length * 4));
      else cons.push(con('His office does no favors you need', 14));
      if (idx >= 70) pros.push(pro(`Already yours (control ${idx})`, 6));
      else if (idx >= 40) pros.push(pro(`Half yours (control ${idx}): a push makes him reliable`, 14));
      if (p.integrity < 45) pros.push(pro(`Takes envelopes (integrity ${p.integrity})`, 14));
      else if (p.integrity >= 70) cons.push(con(`Clean (integrity ${p.integrity}): money may offend him`, 14));
      if (p.traits.includes('Greedy')) pros.push(pro('Greedy', 8));
      if (p.traits.includes('Honest')) cons.push(con('Honest', 12));
      const scr = Math.round(ctl?.exposure ?? 0);
      if (scr >= 30) cons.push(con(`Under scrutiny (${scr}): the papers are watching him`, 14));
      if (ctl?.owner) cons.push(con(`Also owned by ${ctl.owner === 'philly' ? 'Philadelphia' : FACTION_NAMES[ctl.owner] ?? ctl.owner}`, 10));
      if (ctl?.flipped) cons.push(con('Talking to investigators', 30));
      if ((ctl?.resentment ?? 0) >= 30) cons.push(con(`Resents you (${Math.round(ctl!.resentment)})`, 10));
      const value = (top?.rung ?? 1) * 6 + favs.length * 8;
      const ease = pay ? pay.chance * 100 : idx;
      const done = idx >= 70;
      const action: PlayerAction = !ctl?.payroll && pay && pay.chance >= 0.45
        ? { kind: 'pol', op: { op: 'payroll', id: p.id, on: true } }
        : { kind: 'pol', op: { op: 'cultivate', id: p.id, how: 'dinner' } };
      out.push({
        id: p.id, name: `${nameOf(s, p)} (${top?.short ?? p.title})`,
        upside: done ? 20 + value * 0.3 : Math.min(100, value * 0.9 + ease * 0.35),
        outcome: ctl?.payroll ? `On your payroll ($${ctl.payroll}/wk) · control ${idx}` : `${Math.round((pay?.chance ?? 0) * 100)}% takes the payroll ($${envelope(p)}/wk) · control ${idx}`,
        pros, cons, risk: scr * 0.6 + (ctl?.flipped ? 40 : 0) + (ctl?.owner ? 10 : 0) + (p.integrity >= 70 ? 10 : 0),
        flags: ctl?.dirt ? [{ text: 'You have something on him', tone: 'neutral' }] : [],
        action,
        opportunityCost: action.kind === 'pol' && action.op.op === 'payroll' ? `$${envelope(p)} a week for as long as he is on it` : undefined,
      });
    }
  }
  return out;
}

/** The Books: who keeps them. Skill with money, what you can see of his honesty, and the file he would carry. */
function keeperRole(s: GameState, pool: Character[]): Raw[] {
  const cur = keeper(s);
  return pool.map((c) => {
    const pros: W[] = [];
    const cons: W[] = [];
    pros.push(skillChip(pool, c, 'business'));
    if (c.specialty === 'accountant') pros.push(pro('A real accountant', 20));
    if (hasTrait(c, 'Honest')) pros.push(pro('Honest: covers for nobody', 14));
    if (hasTrait(c, 'Greedy')) cons.push(con('Greedy: will cook the books', 18));
    if (hasTrait(c, 'Gambler')) cons.push(con('Gambles: money goes missing', 12));
    if (hasTrait(c, 'Cowardly')) cons.push(con('Cowardly: may walk the books to the feds if pinched', 14));
    if (c.debtTo) cons.push(con('In debt to a rival shylock', 14));
    const ev = Math.round(c.evidence ?? 0);
    if (ev < 20) pros.push(pro('A thin file: the feds don\'t know him', 8));
    const ch = character(s, c, 'money');
    const busy = s.council.bagman?.holderId === c.id;
    return {
      id: c.id, name: displayName(c), charId: c.id,
      upside: c.attributes.business * 0.7 + (c.specialty === 'accountant' ? 25 : 0) + (hasTrait(c, 'Honest') ? 10 : 0) - (hasTrait(c, 'Greedy') ? 20 : 0),
      outcome: cur?.id === c.id ? 'Keeps the books now' : `Business ${c.attributes.business}${c.specialty === 'accountant' ? ' · accountant' : ''}`,
      pros: [...pros, ...ch.pros], cons: [...cons, ...ch.cons], risk: ch.risk + (ev >= 40 ? 10 : 0) + (hasTrait(c, 'Cowardly') ? 10 : 0),
      action: cur?.id === c.id ? undefined : { kind: 'ledger', op: { op: 'keeper', charId: c.id } },
      opportunityCost: opportunityCost(s, c),
      keepJob: busy ? 'Bagman' : undefined,
    };
  });
}

/** Making his bones: who should go on this job, from his odds of holding up and the risk he talks or loses his head. */
function bonesRole(s: GameState, job: 'heist' | 'collection' | 'hit', pool: Character[]): Raw[] {
  return pool.map((c) => {
    const o = bonesOdds(s, c, job);
    const pros: W[] = [];
    const cons: W[] = [];
    for (const r of o.reasons.filter((x) => x.label !== 'Base' && x.label !== JOB_INFO[job].name)) (r.value > 0 ? pros : cons).push(r.value > 0 ? pro(`${r.label} (+${r.value})`, r.value) : con(`${r.label} (${r.value})`, -r.value));
    if (o.hot >= 0.3) cons.push(con(`${Math.round(o.hot * 100)}% he goes too far`, o.hot * 30));
    if (o.talk >= 0.3) cons.push(con(`${Math.round(o.talk * 100)}% he talks about it after`, o.talk * 30));
    const action: PlayerAction = { kind: 'bones', op: { op: 'assign', charId: c.id, kind: job } };
    const ch = character(s, c, 'muscle');
    return {
      id: c.id, name: displayName(c), charId: c.id,
      upside: o.chance * 100,
      outcome: `${Math.round(o.chance * 100)}% he holds up on ${JOB_INFO[job].name.toLowerCase()}`,
      pros: [...pros, ...ch.pros], cons: [...cons, ...ch.cons], risk: ch.risk + o.hot * 25 + o.talk * 25,
      action, disabledReason: previewAction(s, action).disabledReason,
      opportunityCost: opportunityCost(s, c),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Pools and the public function                                       */
/* ------------------------------------------------------------------ */

function men(s: GameState): Character[] {
  return crew(s).filter((c) => !c.specialty);
}

export function defaultPool(s: GameState, role: Role): Character[] {
  switch (role.kind) {
    case 'seat': return men(s).filter((c) => isFree(s, c) && c.rank !== 'associate');
    case 'capo': return men(s).filter((c) => c.rank === 'soldier' && isFree(s, c));
    case 'make': return men(s).filter((c) => c.rank === 'associate' && isFree(s, c) && c.proposedWeek === undefined);
    case 'voucher': {
      const made = men(s).filter((c) => ['soldier', 'capo', 'underboss', 'consigliere'].includes(c.rank) && isFree(s, c));
      return [player(s), ...made];
    }
    case 'manager': return [...kinCandidates(s), ...crewCandidates(s).filter((c) => !c.dynasty)];
    case 'agent':
    case 'envoy': {
      const busy = new Set(s.schemes.filter((x) => x.owner === 'player').flatMap((x) => x.agents));
      const kind = role.kind === 'envoy' ? 'envoy' : role.scheme;
      const family = kind === 'envoy' ? Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.faction === 'player' && c.rank === 'civilian' && ageOn(c.birth, s.date) >= 18 && !busy.has(c.id)) : [];
      const boss = kind === 'envoy' && !busy.has(s.playerId) ? [player(s)] : [];
      const keep = role.kind === 'agent' ? new Set(role.with ?? []) : new Set<string>();
      return [...boss, ...family, ...crew(s).filter((c) => isFree(s, c) && (!busy.has(c.id) || keep.has(c.id)))];
    }
    case 'heir': {
      const blood = bloodLine(s, player(s)).filter((c) => ageOn(c.birth, s.date) >= 16);
      if (!role.wide) return blood;
      const ids = new Set(blood.map((c) => c.id));
      return [...blood, ...successionCandidates(s).filter((c) => !ids.has(c.id))];
    }
    case 'keeper': {
      const out = men(s).filter((c) => isFree(s, c) && c.rank !== 'civilian');
      const accts = crew(s).filter((c) => c.specialty === 'accountant' && isFree(s, c));
      return [...new Set([...accts, ...out.filter((c) => c.attributes.business >= 50 || s.council.bagman?.holderId === c.id)])];
    }
    case 'bones': return men(s).filter((c) => c.rank === 'associate' && isFree(s, c) && !hasBones(c) && !!bonesBlock(s, c));
    case 'marriage':
    case 'lobby':
    case 'official': return [];
  }
}

const TITLES: Record<Role['kind'], string> = {
  seat: 'Council seat', capo: 'A new capo', make: 'Propose for membership', voucher: 'Who vouches for him', manager: 'A manager',
  agent: 'The team', envoy: 'The envoy', heir: 'The heir', marriage: 'A match', lobby: 'Whom to lobby',
  official: 'An official', keeper: 'The bookkeeper', bones: 'Making his bones',
};

function question(s: GameState, role: Role): string {
  switch (role.kind) {
    case 'seat': return `Who should be ${SEAT_INFO[role.seat].name.toLowerCase()}?`;
    case 'capo': { const d = capoDistrict(s, role.district); return d ? `Who should run ${d.name}?` : 'Who should be the next capo?'; }
    case 'make': return 'Whose name goes to Philadelphia?';
    case 'voucher': return `Who stands for ${s.characters[role.charId]?.firstName ?? 'him'}?`;
    case 'manager': return `Who should run ${role.place ?? placeName(s, role.key)}?`;
    case 'agent': return `Who goes on the ${SCHEME_INFO[role.scheme].name.toLowerCase()}?`;
    case 'envoy': return `Who goes to ${CITIES[role.city]?.name ?? 'the city'}?`;
    case 'heir': return 'Who should inherit the chair?';
    case 'marriage': return `Whom should ${s.characters[role.memberId]?.firstName ?? 'they'} marry?`;
    case 'lobby': return 'Whose vote can you still win?';
    case 'official': return 'Which official is worth owning?';
    case 'keeper': return 'Who should keep the books?';
    case 'bones': return `Who should make his bones on ${JOB_INFO[role.job].name.toLowerCase()}?`;
  }
}

/**
 * Rank the people for a decision. `pool` limits it to these ids (otherwise
 * the usual candidates for the role). Deterministic for a given state.
 */
export function rankCandidates(s: GameState, role: Role, pool?: readonly string[]): Ranking {
  const people = pool ? pool.map((id) => s.characters[id]).filter((c): c is Character => !!c && c.alive) : defaultPool(s, role);
  let raws: Raw[];
  switch (role.kind) {
    case 'seat': raws = seatRole(s, role.seat, people); break;
    case 'capo': raws = capoRole(s, people, role.district); break;
    case 'make': raws = makeRole(s, people); break;
    case 'voucher': raws = voucherRole(s, role.charId, people); break;
    case 'manager': raws = managerRole(s, role.key, people, role.base); break;
    case 'agent': raws = agentRole(s, role.scheme, role.targetId, role.opts, role.with ?? [], people); break;
    case 'envoy': raws = agentRole(s, 'envoy', undefined, { depth: role.depth ?? 'planned', city: role.city }, [], people); break;
    case 'heir': raws = heirRole(s, people); break;
    case 'marriage': raws = marriageRole(s, role.memberId, !!role.matrilineal); break;
    case 'lobby': raws = lobbyRole(s, role.disputeId); break;
    case 'official': raws = officialRole(s).filter((r) => !pool || pool.includes(r.id)); break;
    case 'keeper': raws = keeperRole(s, people); break;
    case 'bones': raws = bonesRole(s, role.job, people); break;
  }
  const candidates = raws.map((r) => finish(s, r)).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const ok = candidates.filter((c) => !c.disabledReason);
  const rec = ok[0];
  let alt: Candidate | undefined;
  let why: string | undefined;
  if (rec) {
    const rest = ok.slice(1);
    const safest = [...rest].sort((a, b) => b.safety - a.safety || b.score - a.score)[0];
    const boldest = [...rest].sort((a, b) => b.upside - a.upside || b.score - a.score)[0];
    if (safest && safest.safety >= rec.safety + 8) { alt = safest; why = 'Safest choice'; }
    else if (boldest && boldest.upside > rec.upside + 3) { alt = boldest; why = 'Highest upside'; }
    else if (rest[0]) { alt = rest[0]; why = 'Next best'; }
  }
  return { role, title: TITLES[role.kind], question: question(s, role), candidates, recommendedId: rec?.id, alternativeId: alt?.id, alternativeWhy: why };
}

