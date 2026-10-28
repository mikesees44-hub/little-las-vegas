import type { ActionPreview } from './actions';
import { hasPermission, standing } from './cities';
import { displayName, isFree } from './characters';
import { heat, money, type Ctx } from './ledger';
import { NYC_DISTRICTS, NYC_DISTRICTS_BY_ID, NYC_FAMILIES, NYC_FAMILY_IDS, NYC_RACKETS, type NycDistrict, type NycFamilyId, type NycRacketKind } from './nycData';
import { hashSeed, rand, randInt } from './rng';
import { isAway } from './travelState';
import type { Reason } from './interactions';
import type { Character, Effect, EventInstance, GameState } from './types';

/**
 * NEW YORK: the house works the city itself (the visit system, visit.ts,
 * puts the boss there; this puts his men there for good).
 *
 * - Open a crew in a neighborhood: a capo and one to four of his men move
 *   up, take an apartment and a storefront ({ op: 'crew' }). They earn on
 *   the street from the first week and cost their keep.
 * - Buy into the neighborhood's rackets ({ op: 'racket' }): the docks, the
 *   Garment Center's trucks, policy, the fish market, air cargo at
 *   Idlewild, the produce yards. Each pays weekly and draws its own heat:
 *   the Waterfront Commission on the piers, the Senate rackets committee on
 *   the garment trucks, the Bureau and Customs on the airport.
 * - The five New York families (fictional) own most of it. Ask the owner's
 *   blessing in person ({ op: 'bless' }, the boss has to be in New York) and
 *   pay a tribute on what you earn there, or move in without asking: the
 *   family's grievance grows every week you stay, and at 60 the Commission
 *   calls a sit-down. Pay the reparations or give the ground back
 *   ({ op: 'sitdown' }); stay away and it is war. In a war your crews are
 *   hit and their rackets burned, and a crew that holds a neighborhood with
 *   two rackets for six weeks takes it.
 * - Tribute ({ op: 'tribute' }) sweetens a family; pulling a crew out
 *   ({ op: 'recall' }) brings the men home.
 *
 * Everything lives in `s.nyc`, optional (old saves have none, upgradeSave
 * leaves it be). Previews are pure; the weekly tick (`nycWeek`) rolls on its
 * own seeded stream so New York never reshuffles the rest of the game.
 */

export type NycAction =
  | { op: 'crew'; district: string; capoId: string; soldiers: string[] }
  | { op: 'racket'; district: string; racket: NycRacketKind }
  | { op: 'bless'; family: NycFamilyId }
  | { op: 'tribute'; family: NycFamilyId; amount: number }
  | { op: 'sitdown'; family: NycFamilyId; offer: 'pay' | 'cede' }
  | { op: 'recall'; district: string };

/** State changes carried by effects (event choices, refusals). */
export type NycOp =
  | { op: 'opinion'; family: NycFamilyId; amount: number }
  | { op: 'grievance'; family: NycFamilyId; amount: number }
  | { op: 'settle'; family: NycFamilyId; how: 'pay' | 'cede' | 'defy' };

export interface NycCrew {
  district: string;
  capoId: string;
  soldiers: string[];
  since: number;
  rackets: NycRacketKind[];
  /** Weeks held, in a war, with two rackets running (six takes the neighborhood). */
  hold?: number;
}

export interface NycLogLine { week: number; text: string; tone?: 'good' | 'bad' | 'neutral' }

export interface NycState {
  rng: number;
  crews: NycCrew[];
  /** Family → the last week its blessing covers. */
  blessed: Partial<Record<NycFamilyId, number>>;
  /** Family → what it thinks of you (−100 … 100). */
  opinion: Partial<Record<NycFamilyId, number>>;
  /** Family → how much they hold against you (0 … 100). */
  grievance: Partial<Record<NycFamilyId, number>>;
  war: NycFamilyId[];
  /** Neighborhoods taken from a family in a war: yours now. */
  taken: string[];
  /** The Commission has called a sit-down. */
  summons?: { family: NycFamilyId; due: number; reparations: number };
  stats: { earned: number; tribute: number; hearings: number; sitdowns: number };
  log: NycLogLine[];
}

export const SUMMONS_AT = 60;
export const TAKE_WEEKS = 6;
export const CREW_SETUP = 2500;
export const MAX_SOLDIERS = 4;
/** A blessing covers half a year. */
export const BLESS_WEEKS = 26;
/** The owner's cut of what a blessed crew earns in his neighborhood. */
export const TRIBUTE_RATE = 0.15;

const EMPTY: NycState = { rng: 0, crews: [], blessed: {}, opinion: {}, grievance: {}, war: [], taken: [], stats: { earned: 0, tribute: 0, hearings: 0, sitdowns: 0 }, log: [] };

/** Read-only view (never creates the layer). */
export function nycOf(s: GameState): NycState {
  return s.nyc ?? EMPTY;
}

export function ensureNyc(s: GameState): NycState {
  if (!s.nyc) s.nyc = { ...structuredClone(EMPTY), rng: hashSeed(`${s.seed}:nyc`) };
  return s.nyc;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/* ------------------------------------------------------------------ */
/* Reading the city                                                    */
/* ------------------------------------------------------------------ */

export function crewIn(s: GameState, district: string): NycCrew | undefined {
  return nycOf(s).crews.find((c) => c.district === district);
}

export function isBlessed(s: GameState, f: NycFamilyId): boolean {
  return (nycOf(s).blessed[f] ?? -1) >= s.week;
}

export function atWar(s: GameState, f: NycFamilyId): boolean {
  return nycOf(s).war.includes(f);
}

export function familyOpinion(s: GameState, f: NycFamilyId): number {
  return nycOf(s).opinion[f] ?? 0;
}

export function grievanceOf(s: GameState, f: NycFamilyId): number {
  return nycOf(s).grievance[f] ?? 0;
}

/** Who runs a neighborhood now: a family, you, or nobody. */
export type NycController = NycFamilyId | 'player' | 'open';
export function controllerOf(s: GameState, district: string): NycController {
  const d = NYC_DISTRICTS_BY_ID[district];
  if (!d) return 'open';
  if (nycOf(s).taken.includes(district)) return 'player';
  if (!d.family) return crewIn(s, district)?.rackets.length ? 'player' : 'open';
  return d.family;
}

/** The family whose permission a crew here needs (none: open ground, or yours). */
export function ownerToAsk(s: GameState, district: string): NycFamilyId | undefined {
  const c = controllerOf(s, district);
  return c === 'player' || c === 'open' ? undefined : c;
}

/** Is a crew here working without the owner's blessing? */
export function unasked(s: GameState, district: string): boolean {
  const f = ownerToAsk(s, district);
  return !!f && !isBlessed(s, f);
}

/** The boss is in New York this week (a visit there, arrived and not left). */
export function inNewYork(s: GameState): boolean {
  const w0 = s.week * 7;
  const w1 = w0 + 7;
  return !!s.travel?.visits?.some((v) => v.cityId === 'newyork' && !v.over && v.arriveDay < w1 && (v.leaveDay === undefined || v.leaveDay > w0));
}

function busyInNyc(s: GameState, id: string): boolean {
  return nycOf(s).crews.some((c) => c.capoId === id || c.soldiers.includes(id));
}

function freeMan(s: GameState, c: Character | undefined): c is Character {
  return !!c && c.alive && c.faction === 'player' && c.id !== s.playerId && isFree(s, c) && !isAway(s, c.id) && !busyInNyc(s, c.id);
}

/** Capos who could take a crew to New York. */
export function capoPool(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.rank === 'capo' && freeMan(s, c)).sort((a, b) => a.id.localeCompare(b.id));
}

/** Soldiers and associates who could go with him (his own crew first). */
export function soldierPool(s: GameState, capoId?: string): Character[] {
  return Object.values(s.characters)
    .filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && freeMan(s, c))
    .sort((a, b) => Number(b.capoId === capoId) - Number(a.capoId === capoId) || a.id.localeCompare(b.id));
}

/** What a racket pays a week in this neighborhood (before the owner's tribute). */
export function racketIncome(s: GameState, crew: NycCrew, kind: NycRacketKind): number {
  const d = NYC_DISTRICTS_BY_ID[crew.district];
  const r = NYC_RACKETS[kind];
  const men = clamp(0.8 + 0.07 * crew.soldiers.length, 0.8, 1.1);
  const fam = ownerToAsk(s, crew.district);
  const war = fam && atWar(s, fam) ? 0.5 : 1;
  return Math.round(r.income * (d?.rich ?? 1) * men * war);
}

/** A crew's week: street money, rackets, keep, tribute. */
export function crewLedger(s: GameState, crew: NycCrew): { street: number; rackets: number; keep: number; tribute: number; net: number } {
  const street = 60 * crew.soldiers.length + 80;
  const rackets = crew.rackets.reduce((a, k) => a + racketIncome(s, crew, k), 0);
  const keep = 120 + 45 * crew.soldiers.length;
  const fam = ownerToAsk(s, crew.district);
  const tribute = fam && isBlessed(s, fam) ? Math.round((street + rackets) * TRIBUTE_RATE) : 0;
  return { street, rackets, keep, tribute, net: street + rackets - keep - tribute };
}

/** The reparations the Commission would ask today. */
export function reparations(s: GameState, f: NycFamilyId): number {
  const n = nycOf(s);
  if (n.summons?.family === f) return n.summons.reparations;
  return Math.round((2500 + grievanceOf(s, f) * 100) / 100) * 100;
}

/** The gift that goes with asking a family's blessing. */
export function blessGift(s: GameState, f: NycFamilyId): number {
  const theirs = nycOf(s).crews.filter((c) => NYC_DISTRICTS_BY_ID[c.district]?.family === f && !nycOf(s).taken.includes(c.district)).length;
  return 2000 + 1000 * theirs;
}

/** The odds they say yes, and why. */
export function blessOdds(s: GameState, f: NycFamilyId): { chance: number; reasons: Reason[] } {
  const fam = NYC_FAMILIES[f];
  const reasons: Reason[] = [
    { label: 'Base', value: 40 },
    { label: `${fam.short}s' opinion of you`, value: Math.round(familyOpinion(s, f) / 2) },
    { label: 'Your respect', value: Math.round((s.respect - 30) / 3) },
    { label: 'Your standing in New York', value: Math.round(standing(s, 'newyork') / 2) },
    { label: 'What they hold against you', value: -Math.round(grievanceOf(s, f) / 2) },
    { label: 'Their pride', value: -Math.round(fam.pride * 20) },
    ...(hasPermission(s, 'newyork') ? [{ label: 'Philadelphia vouches for you', value: 10 }] : []),
  ];
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: clamp(sum / 100, 0.05, 0.95), reasons };
}

/* ------------------------------------------------------------------ */
/* The orders                                                          */
/* ------------------------------------------------------------------ */

const P = (title: string, o: Partial<ActionPreview>): ActionPreview => ({ title, effects: [], cost: 0, because: '', category: 'cost', ...o });

function dname(id: string): string {
  return NYC_DISTRICTS_BY_ID[id]?.name ?? id;
}

export function previewNyc(s: GameState, a: NycAction): ActionPreview {
  const n = nycOf(s);
  switch (a.op) {
    case 'crew': {
      const d = NYC_DISTRICTS_BY_ID[a.district];
      const capo = s.characters[a.capoId];
      const men = a.soldiers.map((id) => s.characters[id]);
      const title = `Open a crew: ${d?.name ?? '?'}`;
      const fam = d ? ownerToAsk(s, d.id) : undefined;
      const noAsk = d ? unasked(s, d.id) : false;
      const philly = !hasPermission(s, 'newyork');
      let why: string | undefined;
      if (!d) why = 'No such neighborhood';
      else if (crewIn(s, d.id)) why = 'You already have a crew there';
      else if (!capo || capo.rank !== 'capo' || !freeMan(s, capo)) why = 'Pick a free capo to lead it';
      else if (!a.soldiers.length) why = 'Send at least one man with him';
      else if (a.soldiers.length > MAX_SOLDIERS) why = `At most ${MAX_SOLDIERS} men`;
      else if (new Set(a.soldiers).size !== a.soldiers.length || men.some((m) => !m || (m.rank !== 'soldier' && m.rank !== 'associate') || !freeMan(s, m))) why = 'One of the men is not free to go';
      else if (s.money < CREW_SETUP) why = `Needs ${fmt(CREW_SETUP)}`;
      const effects: Effect[] = [{ type: 'money', amount: -CREW_SETUP, category: 'cost', label: title }];
      if (philly && d) effects.push({ type: 'rivalOpinion', rival: 'philly', amount: -6, reason: 'Moved men into New York without asking us' });
      const warn = [
        noAsk && fam ? `Without the ${NYC_FAMILIES[fam].short} family's blessing: every week there adds to what they hold against you; at ${SUMMONS_AT} the Commission calls you in, and if you don't come it is war.` : '',
        philly ? 'Philadelphia has not given its blessing for New York: they will hear about it.' : '',
      ].filter(Boolean).join(' ');
      return P(title, {
        detail: `${capo ? displayName(capo) : 'A capo'} and ${a.soldiers.length || 'his'} m${a.soldiers.length === 1 ? 'an' : 'en'} take an apartment and a storefront in ${d?.name ?? 'the neighborhood'}: ${fmt(CREW_SETUP)} to set up, then they earn on the street and cost their keep.${fam && !noAsk ? ` The ${NYC_FAMILIES[fam].short}s have given their blessing (they take ${Math.round(TRIBUTE_RATE * 100)}% of what you earn there).` : ''}`,
        effects, cost: CREW_SETUP, because: `sent ${capo ? displayName(capo) : 'a crew'} to open a crew in ${d?.name ?? 'New York'}`,
        disabledReason: why, warning: warn || undefined, verb: noAsk ? `Move in without asking — ${fmt(CREW_SETUP)}` : `Open the crew — ${fmt(CREW_SETUP)}`,
      });
    }
    case 'racket': {
      const d = NYC_DISTRICTS_BY_ID[a.district];
      const r = NYC_RACKETS[a.racket];
      const crew = crewIn(s, a.district);
      const title = `Buy into ${r?.name.toLowerCase() ?? '?'}: ${d?.name ?? '?'}`;
      let why: string | undefined;
      if (!d || !r) why = 'Not here';
      else if (!crew) why = 'Open a crew there first';
      else if (!d.rackets.includes(a.racket)) why = 'Not a racket this neighborhood has';
      else if (crew.rackets.includes(a.racket)) why = 'You already have it';
      else if (s.money < r.cost) why = `Needs ${fmt(r.cost)}`;
      const fam = d ? ownerToAsk(s, d.id) : undefined;
      const est = crew && r ? racketIncome(s, crew, a.racket) : r?.income ?? 0;
      const riskTxt = r?.risk === 'waterfront' ? ' The Waterfront Commission watches every pier.' : r?.risk === 'federal' ? ' Customs and the Bureau watch the freight terminals.' : r?.risk === 'rackets' ? ' The Senate rackets committee has subpoenaed garment truckers before.' : '';
      return P(title, {
        detail: `${r?.text ?? ''} About ${fmt(est)} a week.${riskTxt}`,
        effects: [{ type: 'money', amount: -(r?.cost ?? 0), category: 'cost', label: title }],
        cost: r?.cost ?? 0, because: `bought into ${r?.name.toLowerCase() ?? 'a racket'} in ${d?.name ?? 'New York'}`, disabledReason: why,
        warning: fam && d && unasked(s, d.id) ? `On ${NYC_FAMILIES[fam].short} ground without their blessing: they will hold it against you.` : undefined,
        verb: `Buy in — ${fmt(r?.cost ?? 0)}`,
      });
    }
    case 'bless': {
      const fam = NYC_FAMILIES[a.family];
      const gift = blessGift(s, a.family);
      const title = `Ask the ${fam.short} family's blessing`;
      const odds = blessOdds(s, a.family);
      let why: string | undefined;
      if (!inNewYork(s)) why = 'You ask in person: go to New York';
      else if (atWar(s, a.family) || n.summons?.family === a.family) why = 'Past asking: it goes to a sit-down now';
      else if ((n.blessed[a.family] ?? -1) >= s.week + 4) why = 'You have it';
      else if (s.money < gift) why = `Needs ${fmt(gift)}`;
      return P(title, {
        detail: `${fam.boss} hears you out, and an envelope (${fmt(gift)}) goes on the table. If he says yes your crews may work his neighborhoods for ${BLESS_WEEKS} weeks, and he takes ${Math.round(TRIBUTE_RATE * 100)}% of what they earn there. If he says no, he keeps the envelope.`,
        effects: [{ type: 'money', amount: -gift, label: title }, { type: 'standing', city: 'newyork', amount: 2, label: title }],
        refuseEffects: [{ type: 'money', amount: -gift, label: `${title}: he kept the envelope` }, { type: 'nyc', op: { op: 'opinion', family: a.family, amount: -3 }, label: title }],
        acceptance: odds, cost: gift, because: `asked the ${fam.short} family's blessing`, disabledReason: why, category: 'event',
      });
    }
    case 'tribute': {
      const fam = NYC_FAMILIES[a.family];
      const amt = Math.round(a.amount);
      const title = `Send the ${fam.short}s a tribute (${fmt(amt)})`;
      let why: string | undefined;
      if (!(amt >= 250 && amt <= 20000)) why = 'Between $250 and $20,000';
      else if (s.money < amt) why = `Needs ${fmt(amt)}`;
      return P(title, {
        detail: `A bagman carries it to ${fam.boss} with your respects: their opinion of you up about ${Math.round(amt / 100)}, what they hold against you down about ${Math.round(amt / 50)}.`,
        effects: [{ type: 'money', amount: -amt, category: 'tribute', label: title }, { type: 'nyc', op: { op: 'opinion', family: a.family, amount: Math.round(amt / 100) }, label: title }, { type: 'nyc', op: { op: 'grievance', family: a.family, amount: -Math.round(amt / 50) }, label: title }],
        cost: amt, because: `sent the ${fam.short} family a tribute`, disabledReason: why, category: 'tribute',
      });
    }
    case 'sitdown': {
      const fam = NYC_FAMILIES[a.family];
      const owed = reparations(s, a.family);
      const title = a.offer === 'pay' ? `The Commission sit-down: pay the ${fam.short}s` : `The Commission sit-down: give the ${fam.short}s their ground back`;
      let why: string | undefined;
      if (n.summons?.family !== a.family && !atWar(s, a.family)) why = 'No sit-down called';
      else if (!inNewYork(s)) why = 'The Commission sits in New York: go there';
      else if (a.offer === 'pay' && s.money < owed) why = `Needs ${fmt(owed)}`;
      const theirs = n.crews.filter((c) => NYC_DISTRICTS_BY_ID[c.district]?.family === a.family).map((c) => dname(c.district));
      return P(title, {
        detail: a.offer === 'pay'
          ? `${fmt(owed)} in reparations to ${fam.boss}, before the go-between. Your crews stay, with the ${fam.short}s' blessing from now on; any war is over.`
          : `Your men come home from ${theirs.length ? theirs.join(', ') : 'their neighborhoods'}, and the neighborhoods you took go back. Nothing paid, but the whole Commission sees you back down.`,
        effects: a.offer === 'pay'
          ? [{ type: 'money', amount: -owed, category: 'tribute', label: title }, { type: 'nyc', op: { op: 'settle', family: a.family, how: 'pay' }, label: title }]
          : [{ type: 'respect', amount: -3, label: title }, { type: 'nyc', op: { op: 'settle', family: a.family, how: 'cede' }, label: title }],
        cost: a.offer === 'pay' ? owed : 0, because: a.offer === 'pay' ? `paid the ${fam.short} family's reparations at the Commission` : `gave the ${fam.short} family its ground back`,
        disabledReason: why, category: 'tribute',
      });
    }
    case 'recall': {
      const crew = crewIn(s, a.district);
      const title = `Bring the crew home: ${dname(a.district)}`;
      return P(title, {
        detail: `${crew ? displayName(s.characters[crew.capoId] ?? ({ firstName: 'The capo', lastName: '' } as Character)) : 'The capo'} and his men come back to Wildwood; the storefront is let go and the rackets there are dropped.${n.taken.includes(a.district) ? ' The neighborhood you took goes back to its family.' : ''}`,
        because: `brought the crew home from ${dname(a.district)}`, disabledReason: crew ? undefined : 'No crew there',
      });
    }
  }
}

function note(n: NycState, week: number, text: string, tone: NycLogLine['tone'] = 'neutral'): void {
  n.log.push({ week, text, tone });
  if (n.log.length > 40) n.log = n.log.slice(-40);
}

function bump(rec: Partial<Record<NycFamilyId, number>>, f: NycFamilyId, amount: number, lo: number, hi: number): void {
  rec[f] = clamp(Math.round((rec[f] ?? 0) + amount), lo, hi);
}

/** Close a crew (the men come home). */
function closeCrew(n: NycState, district: string): void {
  n.crews = n.crews.filter((c) => c.district !== district);
  n.taken = n.taken.filter((d) => d !== district);
}

export function commitNyc(ctx: Ctx, a: NycAction): void {
  const s = ctx.s;
  const n = ensureNyc(s);
  switch (a.op) {
    case 'crew': {
      const d = NYC_DISTRICTS_BY_ID[a.district]!;
      n.crews.push({ district: d.id, capoId: a.capoId, soldiers: [...a.soldiers], since: s.week, rackets: [] });
      const fam = ownerToAsk(s, d.id);
      if (fam && !isBlessed(s, fam)) {
        bump(n.grievance, fam, 30 * NYC_FAMILIES[fam].pride, 0, 100);
        bump(n.opinion, fam, -15, -100, 100);
        note(n, s.week, `A crew moved into ${d.name} without asking the ${NYC_FAMILIES[fam].short}s. They noticed the same day.`, 'bad');
      } else note(n, s.week, `A crew opened in ${d.name}.`, 'good');
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The house opened a crew in ${d.name}, New York.`, kind: 'misc' });
      break;
    }
    case 'racket': {
      const crew = n.crews.find((c) => c.district === a.district);
      if (!crew || crew.rackets.includes(a.racket)) return;
      crew.rackets.push(a.racket);
      const fam = ownerToAsk(s, a.district);
      if (fam && !isBlessed(s, fam)) {
        bump(n.grievance, fam, 15 * NYC_FAMILIES[fam].pride, 0, 100);
        bump(n.opinion, fam, -5, -100, 100);
      }
      note(n, s.week, `Bought into ${NYC_RACKETS[a.racket].name.toLowerCase()} in ${dname(a.district)}.`, 'good');
      break;
    }
    case 'bless': {
      n.blessed[a.family] = s.week + BLESS_WEEKS;
      bump(n.grievance, a.family, -30, 0, 100);
      bump(n.opinion, a.family, 10, -100, 100);
      note(n, s.week, `${NYC_FAMILIES[a.family].boss} gave his blessing: your crews may work ${NYC_FAMILIES[a.family].short} ground until week ${s.week + BLESS_WEEKS}.`, 'good');
      break;
    }
    case 'tribute': {
      n.stats.tribute += Math.round(a.amount);
      note(n, s.week, `A tribute went to the ${NYC_FAMILIES[a.family].short}s (${fmt(a.amount)}).`);
      break;
    }
    case 'sitdown':
      n.stats.sitdowns++;
      break;
    case 'recall': {
      const crew = n.crews.find((c) => c.district === a.district);
      if (!crew) return;
      closeCrew(n, a.district);
      note(n, s.week, `The crew in ${dname(a.district)} came home.`);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Effects (event choices, refusals)                                   */
/* ------------------------------------------------------------------ */

export function describeNycOp(op: NycOp): string {
  const f = NYC_FAMILIES[op.family]?.short ?? '?';
  switch (op.op) {
    case 'opinion': return `${f}s' opinion of you ${op.amount >= 0 ? '+' : ''}${op.amount}`;
    case 'grievance': return `What the ${f}s hold against you ${op.amount >= 0 ? '+' : ''}${op.amount}`;
    case 'settle': return op.how === 'pay' ? `Settled with the ${f}s: their blessing, the war over` : op.how === 'cede' ? `Your crews leave ${f} ground` : `War with the ${f} family`;
  }
}

export function applyNycOp(ctx: Ctx, op: NycOp): void {
  const s = ctx.s;
  const n = ensureNyc(s);
  const fam = NYC_FAMILIES[op.family];
  if (!fam) return;
  switch (op.op) {
    case 'opinion': bump(n.opinion, op.family, op.amount, -100, 100); break;
    case 'grievance': bump(n.grievance, op.family, op.amount, 0, 100); break;
    case 'settle': {
      if (n.summons?.family === op.family) delete n.summons;
      if (op.how === 'defy') {
        if (!n.war.includes(op.family)) n.war.push(op.family);
        bump(n.opinion, op.family, -30, -100, 100);
        note(n, s.week, `War with the ${fam.short} family. The Commission washed its hands of it.`, 'bad');
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The house went to war with the ${fam.short} family in New York.`, kind: 'misc' });
        ctx.log.push(`New York: war with the ${fam.short} family.`);
        return;
      }
      n.war = n.war.filter((f) => f !== op.family);
      n.grievance[op.family] = 0;
      if (op.how === 'pay') {
        n.blessed[op.family] = s.week + BLESS_WEEKS;
        bump(n.opinion, op.family, 5, -100, 100);
        note(n, s.week, `Settled with the ${fam.short}s before the Commission: reparations paid, their blessing given.`, 'good');
      } else {
        for (const c of [...n.crews]) if (NYC_DISTRICTS_BY_ID[c.district]?.family === op.family) closeCrew(n, c.district);
        note(n, s.week, `Your men left ${fam.short} ground. The Commission called it settled.`, 'neutral');
      }
      ctx.log.push(`New York: the ${fam.short} business is settled.`);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

function summonsEvent(s: GameState, f: NycFamilyId, owed: number, due: number): EventInstance {
  const fam = NYC_FAMILIES[f];
  const label = `New York: the ${fam.short} family`;
  return {
    iid: `ev${s.nextId++}`, defId: 'nyc_summons', week: s.week, mandatory: true, priority: 62,
    title: 'New York: the Commission calls you in',
    text: `Word comes down from Arthur Avenue: ${fam.boss} has taken your men on his ground to the Commission. They will sit down with you in New York before week ${due + 1} — reparations of ${fmt(owed)}, or your crews off ${fam.short} ground. A man who does not come to the table has no table.`,
    choices: [
      { id: 'go', label: 'Tell them you will be there', detail: 'Go to New York before the date and sit down (the city screen, or the New York map).', because: 'agreed to a Commission sit-down', effects: [{ type: 'nyc', op: { op: 'opinion', family: f, amount: 3 }, label }] },
      { id: 'pay', label: `Pay through the go-between (${fmt(Math.round(owed * 1.25))})`, detail: 'Settled without the trip, at a quarter more: the go-between takes his piece.', because: 'paid reparations through the go-between', effects: [{ type: 'money', amount: -Math.round(owed * 1.25), category: 'tribute', label }, { type: 'nyc', op: { op: 'settle', family: f, how: 'pay' }, label }] },
      { id: 'defy', label: 'Tell them to go to hell', detail: `War with the ${fam.short} family, on their streets.`, because: `defied the Commission over the ${fam.short} family`, effects: [{ type: 'respect', amount: 2, label }, { type: 'nyc', op: { op: 'settle', family: f, how: 'defy' }, label }] },
    ],
    defaultChoiceId: 'go', meta: { nyc: f }, actors: [],
  };
}

/**
 * New York, one week (engine.ts calls it after the travel tick): the crews
 * earn and pay their keep and the owners' tribute, the rackets draw their
 * heat and their hearings, the families keep score, the Commission calls
 * its sit-downs, and the wars are fought.
 */
export function nycWeek(ctx: Ctx): void {
  const s = ctx.s;
  const n = s.nyc;
  if (!n) return;
  // The men: a dead or jailed capo brings the crew home; the dead and jailed drop off.
  for (const c of [...n.crews]) {
    const capo = s.characters[c.capoId];
    c.soldiers = c.soldiers.filter((id) => { const m = s.characters[id]; return !!m && m.alive && isFree(s, m); });
    if (!capo?.alive || !isFree(s, capo) || !c.soldiers.length) {
      closeCrew(n, c.district);
      note(n, s.week, `The crew in ${dname(c.district)} broke up${capo && !capo.alive ? `: ${displayName(capo)} is dead` : capo && !isFree(s, capo) ? `: ${displayName(capo)} is inside` : ''}. The men came home.`, 'bad');
    }
  }
  let net = 0;
  for (const c of n.crews) {
    const d = NYC_DISTRICTS_BY_ID[c.district];
    if (!d) continue;
    const fam = ownerToAsk(s, d.id);
    const L = crewLedger(s, c);
    // Racket risks: a hearing takes that week's money from the racket.
    let lost = 0;
    for (const k of c.rackets) {
      const r = NYC_RACKETS[k];
      if (r.risk && rand(n) < (r.risk === 'waterfront' ? 0.08 : r.risk === 'federal' ? 0.06 : 0.05)) {
        lost += racketIncome(s, c, k);
        n.stats.hearings++;
        const who = s.characters[c.capoId];
        const text = r.risk === 'waterfront'
          ? `The Waterfront Commission held hearings on the ${d.name} piers: the hiring boss was suspended for a week.`
          : r.risk === 'federal'
            ? `Customs and the Bureau went through the freight sheds at ${d.name}: the cargo stopped moving for a week.`
            : `The Senate rackets committee subpoenaed the garment truckers${who ? `; ${displayName(who)} was named` : ''}.`;
        note(n, s.week, text, 'bad');
        ctx.log.push(`New York: ${text}`);
        heat(ctx, 'federal', r.risk === 'federal' ? 3 : 2, `New York: ${r.name.toLowerCase()} under investigation`, 'heat');
        if (r.risk === 'rackets' && who) ctx.s.characters[who.id].evidence = (ctx.s.characters[who.id].evidence ?? 0) + 1;
      }
      heat(ctx, 'federal', r.heat.federal * 0.5, `New York: ${r.name.toLowerCase()} (${d.name})`, 'heat');
      heat(ctx, 'local', r.heat.local * 0.25, `New York: ${r.name.toLowerCase()} (${d.name})`, 'heat');
    }
    const earned = L.street + L.rackets - lost;
    money(ctx, earned, `New York: the ${d.name} crew`, 'street');
    money(ctx, -L.keep, `New York: the ${d.name} crew's keep`, 'cost');
    if (L.tribute) {
      const t = Math.round(earned * TRIBUTE_RATE);
      money(ctx, -t, `New York: the ${NYC_FAMILIES[fam!].short}s' cut (${d.name})`, 'tribute');
      n.stats.tribute += t;
      net -= t;
    }
    ctx.gross += earned;
    s.unwashed += Math.max(0, earned);
    n.stats.earned += earned;
    net += earned - L.keep;
    // On their ground without asking: the grievance grows.
    if (fam && !isBlessed(s, fam) && !atWar(s, fam)) {
      bump(n.grievance, fam, 5 * NYC_FAMILIES[fam].pride + 2 * c.rackets.length, 0, 100);
      bump(n.opinion, fam, -2, -100, 100);
    }
    // War: the crews are hit, the rackets burned; a neighborhood held long enough is taken.
    if (fam && atWar(s, fam)) {
      const roll = rand(n);
      if (roll < 0.25 && c.soldiers.length) {
        const victim = s.characters[c.soldiers[randInt(n, 0, c.soldiers.length - 1)]];
        const hurt = randInt(n, 10, 35);
        if (victim) {
          victim.health = Math.max(1, victim.health - hurt);
          const text = `The ${NYC_FAMILIES[fam].short}s caught ${displayName(victim)} outside the ${d.name} storefront (health −${hurt}).`;
          note(n, s.week, text, 'bad');
          ctx.log.push(`New York: ${text}`);
        }
      } else if (roll < 0.35 && c.rackets.length) {
        const k = c.rackets[randInt(n, 0, c.rackets.length - 1)];
        c.rackets = c.rackets.filter((x) => x !== k);
        c.hold = 0;
        const text = `The ${NYC_FAMILIES[fam].short}s burned you out of ${NYC_RACKETS[k].name.toLowerCase()} in ${d.name}.`;
        note(n, s.week, text, 'bad');
        ctx.log.push(`New York: ${text}`);
      }
      if (c.rackets.length >= 2) {
        c.hold = (c.hold ?? 0) + 1;
        if (c.hold >= TAKE_WEEKS && !n.taken.includes(d.id)) {
          n.taken.push(d.id);
          bump(n.opinion, fam, -25, -100, 100);
          const text = `${d.name} is yours: the ${NYC_FAMILIES[fam].short}s pulled their people out.`;
          note(n, s.week, text, 'good');
          ctx.log.push(`New York: ${text}`);
          s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The house took ${d.name} from the ${NYC_FAMILIES[fam].short} family.`, kind: 'misc' });
        }
      }
    }
  }
  // The families keep score.
  for (const f of NYC_FAMILY_IDS) {
    const present = n.crews.some((c) => ownerToAsk(s, c.district) === f);
    if (!present) {
      if ((n.grievance[f] ?? 0) > 0) bump(n.grievance, f, -2, 0, 100);
      // A war with nobody left on their ground winds down.
      if (n.war.includes(f) && !n.crews.some((c) => NYC_DISTRICTS_BY_ID[c.district]?.family === f)) {
        n.war = n.war.filter((x) => x !== f);
        n.grievance[f] = Math.round((n.grievance[f] ?? 0) / 2);
        note(n, s.week, `The ${NYC_FAMILIES[f].short}s stood down: none of your men left on their ground.`, 'neutral');
      }
    }
    const op = n.opinion[f] ?? 0;
    if (op) n.opinion[f] = op > 0 ? op - 1 : op + 1;
  }
  // The Commission: a sit-down called; one ignored is war.
  if (n.summons && n.summons.due < s.week) {
    const f = n.summons.family;
    applyNycOp(ctx, { op: 'settle', family: f, how: 'defy' });
    note(n, s.week, `You never came to the sit-down. The ${NYC_FAMILIES[f].short}s took it as an answer.`, 'bad');
  } else if (!n.summons) {
    const f = NYC_FAMILY_IDS.find((x) => !n.war.includes(x) && (n.grievance[x] ?? 0) >= SUMMONS_AT);
    if (f) {
      const owed = reparations(s, f);
      n.summons = { family: f, due: s.week + 3, reparations: owed };
      note(n, s.week, `The Commission has called a sit-down over the ${NYC_FAMILIES[f].short} family's grievance.`, 'bad');
      s.eventQueue.push(summonsEvent(s, f, owed, n.summons.due));
    }
  }
  if (n.crews.length) ctx.log.push(`New York: ${n.crews.length} crew${n.crews.length > 1 ? 's' : ''} working, ${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} this week.`);
}

/** The orders the sim's random player could give in New York. */
export function nycActions(s: GameState): NycAction[] {
  const out: NycAction[] = [];
  const capo = capoPool(s)[0];
  const men = capo ? soldierPool(s, capo.id).slice(0, 2).map((c) => c.id) : [];
  const d = NYC_DISTRICTS.find((x) => !crewIn(s, x.id) && !x.family) ?? NYC_DISTRICTS.find((x) => !crewIn(s, x.id));
  if (capo && men.length && d) out.push({ op: 'crew', district: d.id, capoId: capo.id, soldiers: men });
  for (const c of nycOf(s).crews) {
    const k = NYC_DISTRICTS_BY_ID[c.district]?.rackets.find((r) => !c.rackets.includes(r));
    if (k) out.push({ op: 'racket', district: c.district, racket: k });
  }
  return out;
}

/** Neighborhoods a city place (visitData.ts) belongs to. */
export function districtOfPlace(placeId: string): NycDistrict | undefined {
  return NYC_DISTRICTS.find((d) => d.places?.includes(placeId));
}
