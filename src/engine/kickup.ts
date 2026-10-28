import { isInSeason } from './calendar';
import { crew, isFree } from './characters';
import { holder } from './council';
import { ensureEcon } from './econState';
import { hasEarner } from './earners';
import { ownsKind } from './business';
import { heat, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { hashSeed } from './rng';
import { noteFavor, type AcctId, type Issue, type MemberLine, type TributeReport } from './tributeState';
import { xfer } from './tribute';
import type { ActionPreview } from './actions';
import { askAction, commitAsk, commitTenant, openAsks, previewAsk, previewTenant, replacementFor, tenantAction, troubled, TRADES, TROUBLE_WORD, type PlaceAskAction, type TenantCallAction } from './placeAsks';
import type { Attributes, Character, Craft, Effect, FactionId, GameState, PlayerAction, Rival, Trait } from './types';

/**
 * THE KICK-UP CHAIN: every man has a spot of his own, and the money goes up.
 *
 * A "spot" is a man's own racket: a numbers route, a card game, a shylock
 * book, a bar's machines, a protection stop, a no-show union job, a fencing
 * outlet. The boss, the underboss and the consigliere can each SET A MAN UP
 * with one (a stake from the Family; the sponsor gets the man's loyalty and a
 * piece, and the man owes him). Every week the spot earns from the man's
 * skills, his traits and the hold on his district; he keeps his end and
 * kicks the rest up: a crew man to his capo's crew account, a capo (and the
 * underboss and the consigliere) straight to the underboss's count, which
 * goes in the Don's envelope; the Don's family pays Philadelphia from what it
 * earns (events.envelopeSize). It is the tribute engine's money (tribute.ts
 * collectTake calls `spotsTake`): every dollar moves through `xfer`, short and
 * late envelopes are the envelope's own shortfalls and arrears.
 *
 * A man working his own spot spends less time on his capo's corners
 * (CORNER_SHARE of what his spot grosses comes off the district's take), so a
 * set-up is worth most for a man who fits it, and for the men with no
 * corners at all (the council, the staff of a place, a capo with no district).
 *
 * The month (kickupMonth): a man with nothing of his own for FREELANCE_AFTER
 * weeks finds a hustle by himself (a freelance spot that pays the family
 * little, and he drifts: rivals court him); a spot that pays little gets him
 * leaned on; a man short again and again is noticed (talk, fine, take his
 * spot: never more without the boss's own order); a big earner grows and
 * wants a bigger end. The lieutenants propose set-ups and answers in their
 * domains (lieutenants.ts calls `spotLtCands`).
 *
 * The rival families run the same: each of their men has a spot, kicks up to
 * his boss, and the sum is the non-territory half of the family's income
 * (rivalBooks.rivalTake): hitting or poaching their earners costs them.
 *
 * Saved on the econ layer (`econ.spots`, `econ.spotless`: optional, one small
 * record per living man). Rolls are hashes of (seed, week, man, purpose): no
 * stream's dice are moved.
 */

export type SpotKind = 'numbers' | 'cards' | 'shylock' | 'machines' | 'stop' | 'noshow' | 'fence';

export interface SpotDef {
  /** "a numbers route". */
  what: string;
  /** One line on it. */
  line: string;
  /** Weekly gross for a soldier who fits it (before season). */
  base: number;
  /** Default kick-up, percent of the gross. */
  up: number;
  /** The stake to set him up (Family money). */
  stake: number;
  risk: 'none' | 'low' | 'some' | 'real';
  /** Local heat a week (fractions add up). */
  heat: number;
  /** Weekly odds he is pinched (times the local heat). */
  pinch: number;
  attr: keyof Attributes;
  crafts: Craft[];
  traits: Partial<Record<Trait, number>>;
  /** Season multipliers: summer, winter. */
  sw: [number, number];
  /** Week-to-week swing (±). */
  spread: number;
}

export const SPOTS: Record<SpotKind, SpotDef> = {
  numbers: { what: 'a numbers route', line: 'Policy slips from the barbershops and the candy stores, every day; it barely notices the winter.', base: 80, up: 45, stake: 700, risk: 'low', heat: 0.008, pinch: 0.0008, attr: 'business', crafts: ['earner', 'bookmaker'], traits: { Patient: 0.1, Honest: 0.05, Gambler: -0.1 }, sw: [1.1, 0.95], spread: 0.15 },
  cards: { what: 'a card game', line: 'A back-room game a few nights a week: the house takes a cut of every pot.', base: 75, up: 40, stake: 500, risk: 'some', heat: 0.015, pinch: 0.0015, attr: 'diplomacy', crafts: ['bookmaker', 'talker'], traits: { Charming: 0.15, Gambler: -0.15, Drinker: -0.1 }, sw: [0.95, 1.1], spread: 0.45 },
  shylock: { what: 'a shylock book', line: 'Money on the street at six-for-five; somebody has to collect the vig.', base: 95, up: 45, stake: 1500, risk: 'some', heat: 0.02, pinch: 0.0015, attr: 'force', crafts: ['collector', 'muscle'], traits: { Cruel: 0.1, 'Hot-headed': 0.05, Patient: 0.05 }, sw: [1, 1], spread: 0.2 },
  machines: { what: 'a bar\'s machines', line: 'The jukebox, the pinball and the cigarette machine in a tavern: quarters every week.', base: 60, up: 45, stake: 900, risk: 'low', heat: 0.004, pinch: 0.0003, attr: 'business', crafts: ['earner', 'driver'], traits: { Patient: 0.1 }, sw: [1.25, 0.8], spread: 0.1 },
  stop: { what: 'a protection stop', line: 'Work this place: an envelope from the owner every Friday, and nobody breaks his window.', base: 65, up: 50, stake: 300, risk: 'some', heat: 0.015, pinch: 0.001, attr: 'force', crafts: ['muscle', 'collector'], traits: { Cruel: 0.05, Charming: 0.05 }, sw: [1.3, 0.75], spread: 0.15 },
  noshow: { what: 'a no-show union job', line: 'A paycheck from the local for a job he never shows up to. Clean, steady, small.', base: 55, up: 30, stake: 500, risk: 'none', heat: 0, pinch: 0, attr: 'diplomacy', crafts: ['talker'], traits: { Pious: 0.05 }, sw: [1, 1], spread: 0 },
  fence: { what: 'a fencing outlet', line: 'A garage that moves what fell off a truck: furs, radios, cigarettes.', base: 80, up: 40, stake: 800, risk: 'real', heat: 0.02, pinch: 0.002, attr: 'intrigue', crafts: ['burglar', 'driver'], traits: { Greedy: 0.05, Paranoid: 0.05 }, sw: [1.15, 0.9], spread: 0.4 },
};

export const SPOT_KINDS = Object.keys(SPOTS) as SpotKind[];

/** The sponsor's piece of the gross (not for a freelance spot). */
export const SPONSOR_PIECE = 0.1;
/** A freelance spot (he found it himself): smaller, and the family sees little of it. */
export const FREE_MULT = 0.65;
export const FREE_UP = 20;
/** Share of a crew man's spot gross that comes off his capo's corners (he works his spot, not the corners). */
export const CORNER_SHARE = 0.4;
/** Weeks with nothing of his own before a man finds a hustle by himself. */
export const FREELANCE_AFTER = 8;
/** A rival family's man: his spot is his whole crew's own rackets (the families are smaller on paper). */
export const RIVAL_SCALE = 2.2;
/** Rival kick-up percent. */
export const RIVAL_UP = 55;

const RANK_MULT: Partial<Record<Character['rank'], number>> = { associate: 0.75, soldier: 1, capo: 1.3, underboss: 1.4, consigliere: 1.2 };
const SPOT_RANKS: Character['rank'][] = ['associate', 'soldier', 'capo', 'underboss', 'consigliere'];

export interface Spot {
  k: SpotKind;
  /** The sponsor (who set him up); his own id on a freelance spot. */
  by: string;
  /** Week he was set up. */
  w: number;
  /** The faction it was set up in (it is gone if he changes sides). */
  f: FactionId;
  /** The district it works. */
  d?: string;
  /** Kick-up percent. */
  up: number;
  /** Its name: "the Pacific Ave numbers route". */
  nm: string;
  /** Grown: 0-2 (+20% each). */
  lv?: number;
  /** He found it himself. */
  free?: 1;
  /** Last week: gross, the sponsor's piece, what he paid up, what came up short. */
  g?: number;
  p?: number;
  u?: number;
  s?: number;
  /** Running average of the gross. */
  a?: number;
  /** Short weeks lately (decays a step a month). */
  sh?: number;
  /** Months it has paid little. */
  low?: number;
  /** Week the boss (or the underboss) talked to him about his envelopes. */
  warn?: number;
  /** A big earner: week he started wanting a bigger end. */
  want?: number;
}

/** What the participants remember (CATALOG_DEEP §8 Legacy): the last 30 turns of the family's rackets. */
export interface RackMemory { w: number; text: string; who: string[] }

export function remember(s: GameState, text: string, who: string[]): void {
  const e = ensureEcon(s);
  const log = (e.rackLog ??= []);
  log.push({ w: s.week, text, who: who.filter(Boolean) });
  if (log.length > 30) e.rackLog = log.slice(-30);
}

/** What a man remembers of the family's rackets (his sheet, the chain). */
export function memoriesOf(s: GameState, id: string): RackMemory[] {
  return (s.econ?.rackLog ?? []).filter((m) => m.who.includes(id));
}

/* ------------------------------------------------------------------ */
/* Who, what, how much                                                  */
/* ------------------------------------------------------------------ */

function roll(s: GameState, id: string, k: string): number {
  return hashSeed(`${s.seed}|spot|${s.week}|${id}|${k}`) / 4294967296;
}

function spots(s: GameState): Record<string, Spot> {
  return s.econ?.spots ?? {};
}

/** May this man hold a spot (alive, a made man or an associate of some family)? */
export function spotRank(c: Character | undefined): c is Character {
  return !!c && c.alive && SPOT_RANKS.includes(c.rank);
}

/** His spot, if he has one (and it is still his: same side, alive). */
export function spotOf(s: GameState, id: string): Spot | undefined {
  const sp = spots(s)[id];
  const c = s.characters[id];
  if (!sp || !spotRank(c) || c.faction !== sp.f || id === s.playerId) return undefined;
  return sp;
}

/** A player's man who can be set up. */
export function canHoldSpot(s: GameState, c: Character | undefined): c is Character {
  return spotRank(c) && c.faction === 'player' && c.id !== s.playerId && isFree(s, c);
}

/** Who may set a man up: the boss, the sitting underboss, the sitting consigliere. */
export function sponsors(s: GameState): Character[] {
  const out: Character[] = [];
  const boss = s.characters[s.playerId];
  if (boss?.alive) out.push(boss);
  for (const seat of ['underboss', 'consigliere'] as const) {
    const h = holder(s, seat);
    if (h) out.push(h);
  }
  return out;
}

export function sponsorWord(s: GameState, id: string): string {
  if (id === s.playerId) return 'you';
  const c = s.characters[id];
  const seat = holder(s, 'underboss')?.id === id ? 'the underboss' : holder(s, 'consigliere')?.id === id ? 'the consigliere' : '';
  return c ? `${c.firstName} ${c.lastName}${seat ? ` (${seat})` : ''}` : 'somebody';
}

/** The district his spot works: his own (a capo), his capo's, or where his family is strongest. */
export function spotDistrict(s: GameState, c: Character): string | undefined {
  const own = s.districts.find((d) => d.capoId === c.id);
  if (own) return own.id;
  const k = c.capoId ? s.districts.find((d) => d.capoId === c.capoId) : undefined;
  if (k) return k.id;
  const f = c.faction;
  let best: { id: string; v: number } | undefined;
  for (const d of s.districts) {
    const v = d.influence[f] ?? 0;
    if (v > 0 && (!best || v > best.v)) best = { id: d.id, v };
  }
  return best?.id;
}

/** How well he fits a kind of spot: 0.5-1.5. */
export function spotFit(c: Character, k: SpotKind): number {
  const D = SPOTS[k];
  let f = 0.7 + (c.attributes[D.attr] ?? 50) / 200;
  if (c.craft && D.crafts.includes(c.craft)) f += 0.15;
  for (const t of c.traits) f += D.traits[t] ?? 0;
  return Math.max(0.5, Math.min(1.5, f));
}

function terr(s: GameState, f: FactionId, d?: string): number {
  const dd = d ? s.districts.find((x) => x.id === d) : undefined;
  const v = dd ? dd.influence[f] ?? 0 : 0;
  return 0.6 + Math.min(100, v) / 250;
}

/** His weekly gross from a kind of spot (the year's average, before the week's swing). */
export function spotGross(s: GameState, c: Character, k: SpotKind, sp?: Pick<Spot, 'lv' | 'free' | 'd'>): number {
  const D = SPOTS[k];
  const rival = c.faction !== 'player' ? RIVAL_SCALE : 1;
  const v = D.base * spotFit(c, k) * (RANK_MULT[c.rank] ?? 1) * terr(s, c.faction, sp?.d ?? spotDistrict(s, c)) * (1 + 0.2 * (sp?.lv ?? 0)) * (sp?.free ? FREE_MULT : 1) * rival;
  return Math.round(v);
}

function seasonOf(s: GameState, k: SpotKind): number {
  return isInSeason(s.date) ? SPOTS[k].sw[0] : SPOTS[k].sw[1];
}

/** "the Pacific Ave numbers route". */
function spotName(s: GameState, k: SpotKind, d: string | undefined, id: string): string {
  const dn = s.districts.find((x) => x.id === d)?.name ?? 'the island';
  const n = Math.floor((hashSeed(`${s.seed}|spotnm|${id}|${k}`) / 4294967296) * 3);
  switch (k) {
    case 'numbers': return `the ${dn} numbers route`;
    case 'cards': return ['the card game over the bakery', 'the Tuesday game in the back room', 'the card game at the Elks'][n] + ` (${dn})`;
    case 'shylock': return `a shylock book in ${dn}`;
    case 'machines': return ['the machines at a tavern', 'the jukebox and pinball at a bar', 'the cigarette machines at a club'][n] + ` (${dn})`;
    case 'stop': return ['the stops on the avenue', 'an envelope from the bakeries', 'the Friday stops'][n] + ` (${dn})`;
    case 'noshow': return ['a no-show at the Laborers\' local', 'a no-show on the city paving crew', 'a no-show with the Teamsters'][n];
    case 'fence': return `a fencing garage in ${dn}`;
  }
}

/** Where his kick-up goes: his capo (a crew man), or the underboss's count (a capo, the council). */
export function kickTo(s: GameState, c: Character): { acct: AcctId; whoId?: string; word: string } {
  const k = c.capoId ? s.characters[c.capoId] : undefined;
  if ((c.rank === 'soldier' || c.rank === 'associate') && k && k.rank === 'capo' && k.faction === c.faction && isFree(s, k) && k.alive && k.id !== s.playerId) {
    return { acct: `crew:${k.id}`, whoId: k.id, word: `${k.firstName} (his capo)` };
  }
  const ub = holder(s, 'underboss');
  return { acct: 'clearing', whoId: ub?.id, word: ub && ub.id !== c.id ? `${ub.firstName} (the underboss's count)` : 'the count (your envelope)' };
}

/**
 * Not every spot is open from the start (CATALOG_DEEP §7): the shylock book wants a family with
 * standing or a loan business already, the fence a fence of your own or months on the street, the
 * union no-show a family that matters or a labor racket.
 */
export function spotLock(s: GameState, k: SpotKind): string | undefined {
  if (k === 'shylock' && s.respect < 35 && !ownsKind(s, 'loansharking')) return 'Not yet: the street lends through a family with standing (respect 35) or one already in the loan business';
  if (k === 'fence' && s.week < 20 && !ownsKind(s, 'fencing')) return 'Not yet: you need a fence of your own first, or a few months on the street';
  if (k === 'noshow' && s.respect < 45 && !ownsKind(s, 'labor')) return 'Not yet: the union locals deal with a family that matters (respect 45) or one with a labor racket';
  return undefined;
}

/** Work a man refuses (his conscience): pushed into it anyway, he remembers, and so does the succession. */
export function spotObjection(c: Character, k: SpotKind): string | undefined {
  if (c.traits.includes('Pious') && (k === 'shylock' || k === 'cards')) return 'He is a churchgoer: he won\'t bleed people with a book or a card game';
  if (c.traits.includes('Honest') && (k === 'fence' || k === 'shylock')) return 'He won\'t touch stolen goods or a loan book; he says so to your face';
  return undefined;
}

export interface SpotOffer {
  k: SpotKind;
  what: string;
  gross: number;
  summer: number;
  winter: number;
  up: number;
  piece: number;
  keep: number;
  stake: number;
  risk: SpotDef['risk'];
  fit: number;
  /** Not open to you yet, and why. */
  lock?: string;
  /** He would refuse it, and why. */
  objects?: string;
}

/** What each kind of spot would pay him, best first (the fit, then the money, less the risk). */
export function spotOffers(s: GameState, c: Character, by?: string): SpotOffer[] {
  const piece = by && by !== c.id ? Math.round(SPONSOR_PIECE * 100) : 0;
  const riskW = { none: 1.05, low: 1, some: 0.93, real: 0.85 };
  return SPOT_KINDS.map((k) => {
    const D = SPOTS[k];
    const gross = spotGross(s, c, k);
    const lock = spotLock(s, k);
    const objects = spotObjection(c, k);
    return { k, what: D.what, gross, summer: Math.round(gross * D.sw[0]), winter: Math.round(gross * D.sw[1]), up: D.up, piece, keep: 100 - D.up - piece, stake: D.stake, risk: D.risk, fit: spotFit(c, k), ...(lock ? { lock } : {}), ...(objects ? { objects } : {}) };
  }).sort((a, b) => Number(!!a.lock || !!a.objects) - Number(!!b.lock || !!b.objects) || b.gross * riskW[b.risk] - a.gross * riskW[a.risk] || (a.k < b.k ? -1 : 1));
}

export const RISK_WORD: Record<SpotDef['risk'], string> = {
  none: 'no risk to speak of',
  low: 'low (a little heat)',
  some: 'some (heat, and a pinch now and then)',
  real: 'real (heat; a pinch is likelier)',
};

/** Every source of a man's own money: his spot, a capo's corners, a steady earner. */
export function incomeSources(s: GameState, c: Character): string[] {
  const out: string[] = [];
  const sp = spotOf(s, c.id);
  if (sp) out.push(sp.free ? `freelance: ${sp.nm}` : sp.nm);
  if (c.rank === 'capo' && s.districts.some((d) => d.capoId === c.id && (d.influence[c.faction] ?? 0) > 0)) out.push('his district\'s corners');
  if (c.faction === 'player' && hasEarner(s, c.id)) out.push('his steady earner');
  return out;
}

/* ------------------------------------------------------------------ */
/* Orders: set a man up; answer a short envelope or a big earner        */
/* ------------------------------------------------------------------ */

export type SpotCall = 'talk' | 'fine' | 'pull' | 'raise' | 'hold';

/** Player orders (inside `{ kind: 'econ', op }`). */
export type KickupAction =
  | { type: 'setup'; who: string; spot: SpotKind; by?: string }
  | { type: 'spotCall'; who: string; how: SpotCall }
  /** A man asks to run his racket out of one of your places (placeAsks.ts). */
  | PlaceAskAction
  /** Trouble at a tenant's racket: keep him, put your own man in, or close it (placeAsks.ts). */
  | TenantCallAction;

export function setupAction(who: string, spot: SpotKind, by?: string): PlayerAction {
  return { kind: 'econ', op: { type: 'setup', who, spot, ...(by ? { by } : {}) } };
}

export function spotCallAction(who: string, how: SpotCall): PlayerAction {
  return { kind: 'econ', op: { type: 'spotCall', who, how } };
}

const noop = (title: string, why: string): ActionPreview => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' });
const note = (text: string): Effect => ({ type: 'econ', op: { op: 'note', text } });
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function previewKickup(s: GameState, a: KickupAction): ActionPreview {
  if (a.type === 'setup') return previewSetup(s, a);
  if (a.type === 'placeAsk') return previewAsk(s, a);
  if (a.type === 'tenantCall') return previewTenant(s, a);
  return previewCall(s, a);
}

function previewSetup(s: GameState, a: Extract<KickupAction, { type: 'setup' }>): ActionPreview {
  const c = s.characters[a.who];
  const by = a.by ?? s.playerId;
  const D = SPOTS[a.spot];
  if (!D) return noop('Set him up', 'No such spot');
  if (!canHoldSpot(s, c)) return noop('Set him up', 'Only one of your own men, free and on the street, can be set up');
  const sp = sponsors(s).find((x) => x.id === by);
  const title = by === s.playerId ? `Set ${c.firstName} up with ${D.what}` : `${s.characters[by]?.firstName ?? 'He'} sets ${c.firstName} up with ${D.what}`;
  if (!sp) return noop(title, 'Only you, the underboss or the consigliere can set a man up');
  if (by === c.id) return noop(title, 'He can\'t sponsor himself');
  const cur = spotOf(s, c.id);
  const d = spotDistrict(s, c);
  const gross = spotGross(s, c, a.spot, { d });
  const piece = Math.round(SPONSOR_PIECE * 100);
  const to = kickTo(s, c);
  const sw = `${$(gross * D.sw[0])} in the season, ${$(gross * D.sw[1])} off`;
  const detail = `${D.line} About ${$(gross)} a week for ${c.firstName} (${sw}). He keeps ${100 - D.up - piece}%, kicks up ${D.up}% to ${to.word}, and ${piece}% goes to ${by === s.playerId ? 'your Pocket' : sponsorWord(s, by)} for setting him up. Risk: ${RISK_WORD[D.risk]}. Stake: ${$(D.stake)} from the Family.${cur ? ` (Replaces ${cur.free ? 'the hustle he found himself' : cur.nm}.)` : ''}${CORNER_SHARE && (c.rank === 'soldier' || c.rank === 'associate' || c.rank === 'capo') && d && s.districts.find((x) => x.id === d)?.capoId ? ' He works the corners less while he works his spot.' : ''}`;
  const label = title;
  const objects = spotObjection(c, a.spot);
  const effects: Effect[] = [
    { type: 'money', amount: -D.stake, label },
    ...(objects ? [{ type: 'opinion', from: c.id, to: by, amount: -12, reason: 'Pushed me into work I refused', decay: 0, label } as Effect]
      : [{ type: 'opinion', from: c.id, to: by, amount: 10, reason: 'Set me up with a spot of my own', decay: 0.5, label } as Effect]),
    ...(by !== s.playerId ? [{ type: 'opinion', from: c.id, to: s.playerId, amount: 3, reason: 'The family looks after me', decay: 0.5, label } as Effect] : []),
    note(`${c.firstName}: ~${$(gross)}/wk from ${D.what}; ${D.up}% up, ${piece}% to the sponsor`),
  ];
  const why = cur && cur.k === a.spot && !cur.free ? `He already runs ${cur.nm}` : spotLock(s, a.spot) ?? (s.money < D.stake ? `Needs ${$(D.stake)}` : undefined);
  return { title, detail, effects, cost: D.stake, because: `set ${c.firstName} ${c.lastName} up with ${D.what}`, disabledReason: why, category: 'event', verb: `Set him up — ${$(D.stake)}`, ...(objects ? { warning: `${objects}. Push him into it and he holds it against ${by === s.playerId ? 'you' : 'the man who did'} for good.` } : {}) };
}

/** What a fine takes from him: what he owes and a little more, out of his own pocket. */
export function fineOf(s: GameState, c: Character): number {
  const owed = s.tribute?.arrears[c.id] ?? 0;
  const sp = spotOf(s, c.id);
  const want = Math.max(200, owed + Math.round((sp?.a ?? sp?.g ?? 100) * 1.5));
  return Math.max(0, Math.min(Math.round(c.wealth), Math.round(want / 50) * 50));
}

function previewCall(s: GameState, a: Extract<KickupAction, { type: 'spotCall' }>): ActionPreview {
  const c = s.characters[a.who];
  const sp = c ? spotOf(s, c.id) : undefined;
  if (!c || c.faction !== 'player' || !sp) return noop('His spot', 'He has no spot of his own');
  const first = c.firstName;
  const label = `${first}'s spot`;
  switch (a.how) {
    case 'talk': return {
      title: `Talk to ${first} about his envelopes`, detail: `A quiet word: the family knows what ${sp.nm} does, and it expects its end on time. For a couple of months he is careful.`,
      effects: [note('He comes up short far less for two months'), { type: 'opinion', from: c.id, to: s.playerId, amount: -1, reason: 'Talked to me about my envelopes', decay: 1, label }],
      cost: 0, because: `talked to ${first} about his envelopes`, category: 'event',
    };
    case 'fine': {
      const f = fineOf(s, c);
      return {
        title: `Fine ${first} ${$(f)}`, detail: `He pays what he owes and a little more, out of his own pocket. He won't forget it, and neither will the men.`,
        effects: [note(`+${$(f)} from his pocket to the Family; his arrears are cleared`), { type: 'opinion', from: c.id, to: s.playerId, amount: -8, reason: 'Fined me', decay: 1, label }],
        cost: 0, because: `fined ${first} ${$(f)}`, category: 'event', disabledReason: f < 50 ? 'He has nothing to pay with' : undefined,
      };
    }
    case 'pull': return {
      title: `Take ${first}'s spot away`, detail: `${sp.nm} goes back to the family; he has nothing of his own until somebody sets him up again. A man with nothing drifts. Nobody lays a hand on him.`,
      effects: [note('His spot is gone (give it to someone else)'), { type: 'opinion', from: c.id, to: s.playerId, amount: -18, reason: 'Took my spot away', decay: 0.5, label }],
      cost: 0, because: `took ${first}'s spot away`, category: 'event',
    };
    case 'raise': return {
      title: `Give ${first} a bigger end`, detail: `${sp.nm} is doing well; he keeps 10 points more of it (kicks up ${Math.max(20, sp.up - 10)}% instead of ${sp.up}%).`,
      effects: [note(`Kick-up ${sp.up}% → ${Math.max(20, sp.up - 10)}%`), { type: 'opinion', from: c.id, to: s.playerId, amount: 8, reason: 'Gave me a bigger end', decay: 0.5, label }],
      cost: 0, because: `gave ${first} a bigger end of his spot`, category: 'event', disabledReason: sp.up <= 20 ? 'He already keeps all he can' : undefined,
    };
    case 'hold': return {
      title: `Tell ${first} to wait`, detail: 'He has done well; his end stays where it is for now. He takes it, mostly.',
      effects: [note('His end stays the same'), { type: 'opinion', from: c.id, to: s.playerId, amount: -4, reason: 'Told me to wait for my end', decay: 1, label }],
      cost: 0, because: `told ${first} to wait for a bigger end`, category: 'event', disabledReason: sp.want === undefined ? 'He has not asked' : undefined,
    };
  }
}

export function commitKickup(ctx: Ctx, a: KickupAction): void {
  const s = ctx.s;
  if (a.type === 'placeAsk') { commitAsk(ctx, a); return; }
  if (a.type === 'tenantCall') { commitTenant(ctx, a); return; }
  const c = s.characters[a.who];
  if (!c) return;
  if (a.type === 'setup') {
    const by = a.by ?? s.playerId;
    if (!canHoldSpot(s, c) || !sponsors(s).some((x) => x.id === by) || by === c.id) return;
    const e = ensureEcon(s);
    const d = spotDistrict(s, c);
    const D = SPOTS[a.spot];
    (e.spots ??= {})[c.id] = { k: a.spot, by, w: s.week, f: 'player', ...(d ? { d } : {}), up: D.up, nm: spotName(s, a.spot, d, c.id) };
    if (e.spotless) delete e.spotless[c.id];
    noteFavor(s, { byId: by, toId: c.id, kind: 'assistance', amount: D.stake, authority: by === s.playerId ? 'don' : 'delegated', truth: `set him up with ${D.what}` });
    const obj = spotObjection(c, a.spot);
    remember(s, obj ? `${c.firstName} ${c.lastName} was pushed into ${D.what} he said he would not run` : `${c.firstName} ${c.lastName} was set up with ${D.what} by ${by === s.playerId ? 'the boss' : sponsorWord(s, by)}`, [c.id, by]);
    ctx.log.push(`${c.firstName} ${c.lastName} is set up with ${e.spots[c.id].nm}; he owes ${by === s.playerId ? 'you' : sponsorWord(s, by)} for it.`);
    return;
  }
  const sp = spotOf(s, c.id);
  if (!sp || c.faction !== 'player') return;
  switch (a.how) {
    case 'talk': sp.warn = s.week; sp.sh = 0; break;
    case 'fine': {
      const f = fineOf(s, c);
      const got = xfer(ctx, `wealth:${c.id}`, 'treasury', f, 'arrears', `w${s.week}:fine:${c.id}`, { label: `${c.firstName} ${c.lastName} pays a fine (his envelopes)`, category: 'kickup', note: 'a fine' });
      if (got && s.tribute) delete s.tribute.arrears[c.id];
      sp.sh = 0;
      sp.warn = s.week;
      break;
    }
    case 'pull': {
      const e = ensureEcon(s);
      delete e.spots![c.id];
      (e.spotless ??= {})[c.id] = s.week;
      addOpinion(s, c.id, s.playerId, 'Nothing of his own', -2, 0);
      ctx.log.push(`${c.firstName} ${c.lastName} lost his spot. He has nothing of his own now.`);
      remember(s, `${c.firstName} ${c.lastName}'s spot (${sp.nm}) was taken from him over his envelopes`, [c.id, s.playerId]);
      break;
    }
    case 'raise': sp.up = Math.max(20, sp.up - 10); sp.want = undefined; remember(s, `${c.firstName} ${c.lastName} was given a bigger end of ${sp.nm}`, [c.id, s.playerId]); break;
    case 'hold': sp.want = undefined; break;
  }
}

/* ------------------------------------------------------------------ */
/* The week: every man's spot earns, he keeps his end and kicks up      */
/* ------------------------------------------------------------------ */

/** Short-envelope odds of a man with a spot (tribute.shortOdds): talked to, he is careful; a big earner kept waiting skims. */
export function spotShortOdds(s: GameState, c: Character, p: number, w: Partial<Record<string, number>>): number {
  const sp = spotOf(s, c.id);
  if (!sp) return p;
  if (sp.warn !== undefined && s.week - sp.warn < 9) p *= 0.4;
  if (sp.free) p += 0.02;
  if (sp.want !== undefined && s.week - sp.want >= 4) {
    p += 0.05;
    w.lying = (w.lying ?? 0) + 2;
  }
  return p;
}

const POCKETED = new Set(['lying', 'grievance', 'investigation', 'mistake']);

export interface SpotsTake {
  lines: { capoId?: string; line: MemberLine }[];
  /** Per capo: what comes off his district's corners (his men work their spots). */
  carve: Record<string, number>;
  paid: number;
  n: number;
}

/**
 * Called from tribute.collectTake (after the men's hustle, before the corners). `pay` is the
 * envelope's own contribute(): the due goes up or comes up short (and late) like any man's.
 */
export function spotsTake(ctx: Ctx, pay: (m: Character, earned: number, due: number, terms: string, to: AcctId, srcKey: string) => MemberLine): SpotsTake {
  const s = ctx.s;
  const out: SpotsTake = { lines: [], carve: {}, paid: 0, n: 0 };
  const all = s.econ?.spots;
  if (!all) return out;
  let heatAdd = 0;
  for (const id of Object.keys(all).sort()) {
    const sp = all[id];
    const m = s.characters[id];
    if (sp.f !== 'player' || !canHoldSpot(s, m) || spotOf(s, id) !== sp) continue;
    const D = SPOTS[sp.k];
    // A pinch: he goes away for a few weeks, and the spot with him.
    if (D.pinch > 0 && roll(s, id, 'pinch') < D.pinch * (1 + s.heat.local / 50)) {
      m.imprisonedUntil = s.week + 4 + Math.floor(roll(s, id, 'pinchw') * 7);
      m.record = (m.record ?? 0) + 1;
      delete all[id];
      ctx.log.push(`${m.firstName} ${m.lastName} was pinched working ${sp.nm}; he is inside till week ${m.imprisonedUntil} and the spot is gone.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${m.firstName} ${m.lastName} was pinched working ${sp.nm}.`, kind: 'heat' });
      continue;
    }
    const swing = 1 + (roll(s, id, 'swing') * 2 - 1) * D.spread;
    const g = Math.max(0, Math.round(spotGross(s, m, sp.k, sp) * seasonOf(s, sp.k) * swing));
    sp.a = Math.round(sp.a === undefined ? g : sp.a * 0.8 + g * 0.2);
    sp.g = g;
    heatAdd += D.heat;
    if (g <= 0) { sp.p = 0; sp.u = 0; sp.s = 0; continue; }
    const sponsor = sp.free || sp.by === id ? undefined : sp.by === s.playerId ? s.characters[s.playerId] : s.characters[sp.by];
    const pieceTo: AcctId | undefined = !sponsor?.alive ? undefined : sponsor.id === s.playerId ? 'personal' : sponsor.faction === 'player' ? `wealth:${sponsor.id}` : undefined;
    const piece = pieceTo ? Math.round(g * SPONSOR_PIECE) : 0;
    const due = Math.round(g * sp.up / 100);
    const keep = g - piece - due;
    xfer(ctx, `ext:spot:${id}`, `wealth:${id}`, keep, 'member_keep', `w${s.week}:spotkeep:${id}`, { note: `${m.firstName} ${m.lastName} keeps his end of ${sp.nm}` });
    if (piece > 0) xfer(ctx, `ext:spot:${id}`, pieceTo!, piece, pieceTo === 'personal' ? 'don_personal_share' : 'capo_distribution', `w${s.week}:spotpiece:${id}`, { note: `The sponsor's piece of ${m.firstName} ${m.lastName}'s ${SPOTS[sp.k].what}` });
    const to = kickTo(s, m);
    const line = pay(m, g, due, `${sp.up}% of his ${SPOTS[sp.k].what}`, to.acct, `spot:${id}`);
    sp.p = piece;
    sp.u = line.paid;
    sp.s = Math.max(0, line.due - line.paid);
    if (sp.s > 0) sp.sh = (sp.sh ?? 0) + 1;
    out.paid += line.paid;
    out.n++;
    // A capo's own spot sits with his crew in the books (its money goes straight to the count).
    out.lines.push({ capoId: m.rank === 'capo' ? m.id : to.acct.startsWith('crew:') ? to.acct.slice(5) : undefined, line });
    // He works his spot, not the corners: part of it comes off his capo's district.
    const capoId = m.rank === 'capo' ? m.id : m.capoId;
    if (capoId && (m.rank === 'capo' || m.rank === 'soldier' || m.rank === 'associate') && s.districts.some((d) => d.capoId === capoId)) out.carve[capoId] = (out.carve[capoId] ?? 0) + g * CORNER_SHARE;
  }
  // The heat of the men's own spots (cards, the book, the fence).
  const f = (s.flags.spotHeat ?? 0) + heatAdd;
  const whole = Math.floor(f);
  s.flags.spotHeat = f - whole;
  if (whole > 0) heat(ctx, 'local', whole, 'The men\'s own spots (card games, the shylock books, the fences)', 'heat');
  return out;
}

/** The truth of a spot man's short this week was money he kept (for the chain's reconciliation). */
export function pocketedShort(line: MemberLine): number {
  return line.truth && POCKETED.has(line.truth) ? Math.max(0, line.due - line.paid) : 0;
}

/* ------------------------------------------------------------------ */
/* The month: nothing of his own, low earners, shorts, big earners      */
/* ------------------------------------------------------------------ */

function bestFree(s: GameState, c: Character): SpotKind {
  // A man on his own picks what he knows, never the shylock book (no capital).
  return spotOffers(s, c).filter((o) => o.k !== 'shylock' && !o.objects)[0]?.k ?? 'numbers';
}

/** The strongest rival in his district (who courts a drifting man). */
function nearRival(s: GameState, c: Character): Rival | undefined {
  const d = s.districts.find((x) => x.id === spotDistrict(s, c));
  const rs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  return rs.sort((a, b) => (d?.influence[b.id] ?? 0) - (d?.influence[a.id] ?? 0) || (a.id < b.id ? -1 : 1))[0];
}

/** Weekly after the take (economy.runEconomy): the month's reckoning on its first week. */
export function kickupMonth(ctx: Ctx): void {
  const s = ctx.s;
  if (s.date.d > 7 || !s.econ) return;
  const e = s.econ;
  const all = (e.spots ??= {});
  const less = (e.spotless ??= {});
  // Records for men who are gone, or changed sides.
  for (const id of Object.keys(all)) if (!spotOf(s, id)) delete all[id];
  for (const id of Object.keys(less)) { const c = s.characters[id]; if (!spotRank(c) || id === s.playerId) delete less[id]; }
  const rep = s.tribute?.reports[s.tribute.reports.length - 1];
  const issue = (i: Issue) => { if (rep && rep.week === s.week) rep.issues.push(i); };
  for (const c of crew(s).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!canHoldSpot(s, c)) continue;
    const sp = spotOf(s, c.id);
    if (!sp) {
      if (incomeSources(s, c).length) { delete less[c.id]; continue; }
      const since = (less[c.id] ??= s.week);
      const weeks = s.week - since;
      if (weeks >= FREELANCE_AFTER) {
        // He finds his own hustle: small, and the family sees little of it.
        const k = bestFree(s, c);
        const d = spotDistrict(s, c);
        all[c.id] = { k, by: c.id, w: s.week, f: 'player', ...(d ? { d } : {}), up: FREE_UP, nm: spotName(s, k, d, c.id), free: 1 };
        delete less[c.id];
        addOpinion(s, c.id, s.playerId, 'Had to find my own hustle', -3, 0.5);
        ctx.log.push(`${c.firstName} ${c.lastName} found his own hustle (${SPOTS[k].what}): nobody set him up, so he kicks up little of it.`);
        // A man left to fend for himself listens when another family calls.
        const r = nearRival(s, c);
        if (r && !c.courtedBy && opinion(s, c.id, s.playerId) < 10 && roll(s, c.id, 'court') < 0.3) c.courtedBy = { rival: r.id, week: s.week };
      } else if (weeks >= 4) {
        const mod = addOpinion(s, c.id, s.playerId, 'Nothing of his own', -2, 0);
        if (mod) mod.value = Math.max(mod.value, -8);
      }
      continue;
    }
    if (sp.free) continue;
    const r = s.relations[`${c.id}>${s.playerId}`];
    if (r) r.modifiers = r.modifiers.filter((x) => x.reason !== 'Nothing of his own');
    if (sp.sh) sp.sh = Math.max(0, sp.sh - 1);
    const exp = spotGross(s, c, sp.k, sp);
    const avg = sp.a ?? exp;
    // He earns little: his capo (or his sponsor) leans on him.
    if (s.week - sp.w >= 6 && avg < exp * 0.6) {
      sp.low = (sp.low ?? 0) + 1;
      if (sp.low >= 2) {
        const over = c.capoId && s.characters[c.capoId]?.alive ? c.capoId : sp.by;
        if (over && over !== c.id) addOpinion(s, c.id, over, 'Leaning on me about my spot', -3, 1);
        issue({ kind: 'short', who: c.id, amount: avg, severity: 1, text: `${c.firstName} ${c.lastName}'s ${SPOTS[sp.k].what} is barely paying (~${$(avg)} a week). He is being leaned on; a different spot might suit him.` });
      }
    } else sp.low = 0;
    // A big earner: the spot grows, he gains standing, and he wants a bigger end.
    if (s.week - sp.w >= 8 && avg >= exp * 1.15 && (sp.lv ?? 0) < 2 && roll(s, c.id, 'grow') < 0.5) {
      sp.lv = (sp.lv ?? 0) + 1;
      const capo = c.capoId ? s.characters[c.capoId] : undefined;
      if (capo?.alive) addOpinion(s, capo.id, c.id, 'A real earner', 4, 0.5);
      if (sp.want === undefined && sp.up > 20) {
        sp.want = s.week;
        issue({ kind: 'dispute', who: c.id, amount: avg, severity: 1, text: `${c.firstName} ${c.lastName}'s ${SPOTS[sp.k].what} is doing ~${$(avg)} a week; he wants a bigger end of it (Give him more, or tell him to wait).` });
      }
    }
    // Short again and again: noticed.
    const hist = (s.tribute?.shortHist[c.id] ?? []).filter((w) => s.week - w < 8).length;
    if (hist >= 2 && (sp.warn === undefined || s.week - sp.warn >= 9)) {
      issue({ kind: 'short', who: c.id, amount: s.tribute?.arrears[c.id] ?? 0, severity: hist >= 3 ? 2 : 1, text: `${c.firstName} ${c.lastName}'s envelope from ${sp.nm} came up short ${hist} times in two months. Talk to him, fine him, or take his spot.` });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The rival families: their men's spots are their money                */
/* ------------------------------------------------------------------ */

function rivalMen(s: GameState, r: Rival): Character[] {
  const out: Character[] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (c.faction === r.id && c.id !== r.leaderId && spotRank(c) && isFree(s, c)) out.push(c);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export interface RivalSpotRow { id: string; name: string; rank: string; spot: string; gross: number; kept: number; up: number; short: number }

/** Last week's rows of a rival family's chain (from its men's spots). */
export function rivalChain(s: GameState, r: Rival): RivalSpotRow[] {
  return rivalMen(s, r).flatMap((c) => {
    const sp = spotOf(s, c.id);
    if (!sp) return [{ id: c.id, name: `${c.firstName} ${c.lastName}`, rank: c.rank, spot: 'nothing of his own', gross: 0, kept: 0, up: 0, short: 0 }];
    const g = sp.g ?? 0;
    return [{ id: c.id, name: `${c.firstName} ${c.lastName}`, rank: c.rank, spot: sp.nm, gross: g, kept: Math.max(0, g - (sp.u ?? 0)), up: sp.u ?? 0, short: sp.s ?? 0 }];
  });
}

/**
 * One rival family's week of its men's spots (rivalBooks.rivalTake). Every man is set up by his boss
 * (a man whose spot was taken waits FREELANCE_AFTER weeks); each earns, keeps his end and kicks up
 * (or comes up short when he thinks little of his boss). Returns the family's kick-up: the first three
 * men's in full, the rest at half (a bigger family carries more mouths). A family with no men: the
 * boss's own little racket.
 */
export function rivalSpotsUp(s: GameState, r: Rival): number {
  if (r.kind !== 'mob') return 0;
  const e = ensureEcon(s);
  const all = (e.spots ??= {});
  const less = (e.spotless ??= {});
  const ups: number[] = [];
  for (const c of rivalMen(s, r)) {
    let sp = spotOf(s, c.id);
    if (!sp) {
      const since = less[c.id];
      if (since !== undefined && s.week - since < FREELANCE_AFTER) continue;
      const k = (spotOffers(s, c).find((o) => !o.objects) ?? spotOffers(s, c)[0]).k;
      const d = spotDistrict(s, c);
      sp = all[c.id] = { k, by: r.leaderId, w: s.week, f: r.id, ...(d ? { d } : {}), up: RIVAL_UP, nm: spotName(s, k, d, c.id) };
      delete less[c.id];
    }
    const D = SPOTS[sp.k];
    const g = Math.max(0, Math.round(spotGross(s, c, sp.k, sp) * seasonOf(s, sp.k) * (1 + (roll(s, c.id, 'rswing') * 2 - 1) * D.spread)));
    const due = Math.round(g * sp.up / 100);
    const op = opinion(s, c.id, r.leaderId);
    const short = roll(s, c.id, 'rshort') < 0.03 + Math.max(0, -op) / 200 ? Math.round(due * (0.3 + roll(s, c.id, 'rfrac') * 0.4)) : 0;
    sp.g = g;
    sp.u = due - short;
    sp.s = short;
    sp.a = Math.round(sp.a === undefined ? g : sp.a * 0.8 + g * 0.2);
    if (short) sp.sh = (sp.sh ?? 0) + 1;
    else if (sp.sh && s.date.d <= 7) sp.sh--;
    // Short again and again: his boss takes the spot; a big earner's grows.
    if ((sp.sh ?? 0) >= 3) {
      delete all[c.id];
      less[c.id] = s.week;
      addOpinion(s, c.id, r.leaderId, 'Took my spot away', -15, 0.5);
    } else if (s.date.d <= 7 && s.week - sp.w >= 8 && (sp.a ?? 0) >= spotGross(s, c, sp.k, sp) * 1.15 && (sp.lv ?? 0) < 2) sp.lv = (sp.lv ?? 0) + 1;
    ups.push(sp.u);
  }
  ups.sort((a, b) => b - a);
  const sum = ups.reduce((a, u, i) => a + (i < 3 ? u : u * 0.5), 0);
  return Math.round(Math.max(60, sum));
}

/** For the recruit odds (interactions.ts): a rival's man with nothing of his own is hungry; one with a good spot is not. */
export function spotRecruitReasons(s: GameState, c: Character): { label: string; value: number }[] {
  if (c.faction === 'player' || !spotRank(c)) return [];
  const sp = spotOf(s, c.id);
  if (!sp) return [{ label: 'Nothing of his own over there', value: 15 }];
  if ((sp.sh ?? 0) >= 2) return [{ label: 'Leaned on about his envelopes', value: 8 }];
  if ((sp.lv ?? 0) >= 1) return [{ label: 'A good spot of his own', value: -10 }];
  return [];
}

/* ------------------------------------------------------------------ */
/* The kick-up chain (the view)                                          */
/* ------------------------------------------------------------------ */

export interface ChainRow {
  id: string;
  rank: string;
  /** What he grossed for the week (his spot, his share of the corners, his hustle, crew work). */
  gross: number;
  /** His end (gross less what he owed, less the sponsor's piece). */
  kept: number;
  /** The sponsor's piece of his spot. */
  piece: number;
  /** What he passed up (paid, plus arrears made good). */
  up: number;
  /** Owed and not paid this week. */
  short: number;
  /** His spot, if any. */
  spot?: string;
  sponsor?: string;
  free?: boolean;
  /** Owes from earlier weeks. */
  arrears: number;
}

export interface ChainCrew {
  capoId: string;
  district?: string;
  men: ChainRow[];
  /** What his men (and his own share of the corners) paid into his crew. */
  paidIn: number;
  /** His end of the district under contract. */
  kept: number;
  /** Held back (winter, owed). */
  held: number;
  /** What reached the underboss's count. */
  remitted: number;
  short: number;
}

export interface KickupChain {
  week: number;
  crews: ChainCrew[];
  /** Men who pay the count directly (the council, men with no capo). */
  direct: ChainRow[];
  /** Into the underboss's count. */
  collected: number;
  ubId?: string;
  ubShare: number;
  /** In the Don's envelope. */
  presented: number;
  /** Not counted by Monday (comes next week). */
  late: number;
  /** The sponsors' pieces that went to your Pocket. */
  bossPieces: number;
  /** Philadelphia's end, a week (its monthly envelope over 4.33). */
  philly: number;
  /** Men with nothing of their own. */
  idle: string[];
  /** Men short this week. */
  shortIds: string[];
}

/** The chain as last week's envelope recorded it (tribute report + the spots). */
export function kickupChain(s: GameState, philly = 0): KickupChain | undefined {
  const rep: TributeReport | undefined = s.tribute?.reports[s.tribute.reports.length - 1];
  if (!rep) return undefined;
  const arrears = s.tribute?.arrears ?? {};
  const rowOf = (lines: MemberLine[]): ChainRow[] => {
    const by = new Map<string, ChainRow>();
    for (const l of lines) {
      const c = s.characters[l.id];
      const r = by.get(l.id) ?? { id: l.id, rank: c?.rank ?? '?', gross: 0, kept: 0, piece: 0, up: 0, short: 0, arrears: arrears[l.id] ?? 0 };
      r.gross += l.earned;
      r.up += l.paid + (l.back ?? 0);
      r.short += Math.max(0, l.due - l.paid);
      r.kept += Math.max(0, l.earned - l.due);
      by.set(l.id, r);
    }
    for (const r of by.values()) {
      const sp = spotOf(s, r.id);
      if (!sp) continue;
      r.spot = sp.nm;
      r.free = !!sp.free;
      if (!sp.free && sp.by !== r.id) r.sponsor = sp.by;
      if (sp.p && rep.week === s.week - 1) { r.piece = sp.p; r.kept = Math.max(0, r.kept - sp.p); }
    }
    return [...by.values()].sort((a, b) => b.gross - a.gross || (a.id < b.id ? -1 : 1));
  };
  const crews: ChainCrew[] = rep.crews.map((cl) => ({
    capoId: cl.capoId, district: cl.districtId, men: rowOf(cl.members), paidIn: cl.paid, kept: cl.kept, held: cl.held, remitted: cl.remitted, short: cl.short,
  }));
  const late = rep.issues.filter((i) => i.kind === 'late').reduce((a, i) => a + (i.amount ?? 0), 0);
  const bossPieces = Object.values(s.econ?.spots ?? {}).filter((sp) => sp.f === 'player' && sp.by === s.playerId && !sp.free).reduce((a, sp) => a + (sp.p ?? 0), 0);
  const idle = crew(s).filter((c) => canHoldSpot(s, c) && !incomeSources(s, c).length).map((c) => c.id);
  const shortIds = [...crews.flatMap((c) => c.men), ...rowOf(rep.direct)].filter((r) => r.short > 0).map((r) => r.id);
  return {
    week: rep.week, crews, direct: rowOf(rep.direct), collected: rep.collected, ubId: rep.ubId, ubShare: rep.ubShare, presented: rep.presented, late, bossPieces, philly: Math.round(philly), idle, shortIds,
  };
}

/* ------------------------------------------------------------------ */
/* The lieutenants' proposals (lieutenants.ts ltCandidates)             */
/* ------------------------------------------------------------------ */

export interface SpotCand {
  id: string;
  seat: 'underboss' | 'consigliere';
  domain: 'rackets' | 'mediation' | 'collections' | 'crews' | 'families';
  topic: string;
  says: string[];
  priority: number;
  charId: string;
  specs: { id: string; label: string; action: PlayerAction; why: string; bonus?: number }[];
}

/** The set-ups and the answers the underboss and the consigliere would propose this week. */
export function spotLtCands(s: GameState): SpotCand[] {
  const out: SpotCand[] = [];
  const ub = holder(s, 'underboss');
  const cons = holder(s, 'consigliere');
  const less = s.econ?.spotless ?? {};
  const men = crew(s).filter((c) => canHoldSpot(s, c)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const bare = men.filter((c) => !spotOf(s, c.id) && !incomeSources(s, c).length)
    .sort((a, b) => (less[a.id] ?? s.week) - (less[b.id] ?? s.week) || (a.id < b.id ? -1 : 1));
  const offers = (c: Character, by: string) => spotOffers(s, c, by).filter((o) => !o.lock && !o.objects && o.stake <= Math.max(0, s.money)).slice(0, 2)
    .map((o, i) => ({ id: o.k, label: `Set ${c.firstName} up with ${o.what}`, action: setupAction(c.id, o.k, by), why: `~${$(o.gross)}/wk, ${o.up}% up`, bonus: 300 + o.gross * 6 - i * 50 }));
  // The underboss: men with nothing of their own (his crews' rackets).
  if (ub) {
    for (const c of bare.filter((x) => x.id !== ub.id).slice(0, 2)) {
      const specs = offers(c, ub.id);
      if (!specs.length) continue;
      const weeks = s.week - (less[c.id] ?? s.week);
      out.push({ id: `setup:${c.id}`, seat: 'underboss', domain: 'rackets', topic: `${c.firstName} ${c.lastName}: a spot of his own`, charId: c.id, priority: 240 + weeks * 15 + (c.rank === 'soldier' ? 20 : 0),
        says: [`${c.firstName} has nothing of his own. A man with nothing goes looking. Let me set him up.`, `${c.firstName} is sitting around. I've got a spot for him: ${SPOTS[specs[0].id as SpotKind].what}.`], specs });
    }
    // Short again and again: collections.
    for (const c of men) {
      const sp = spotOf(s, c.id);
      if (!sp || sp.free || c.id === ub.id) continue;
      const hist = (s.tribute?.shortHist[c.id] ?? []).filter((w) => s.week - w < 8).length;
      if (hist < 2 || (sp.warn !== undefined && s.week - sp.warn < 9)) continue;
      out.push({ id: `spotshort:${c.id}`, seat: 'underboss', domain: 'collections', topic: `${c.firstName}'s envelopes`, charId: c.id, priority: 330 + hist * 40,
        says: [`${c.firstName}'s envelope from ${sp.nm} keeps coming up short. Somebody has to say something.`],
        specs: [
          { id: 'talk', label: `Talk to ${c.firstName}`, action: spotCallAction(c.id, 'talk'), why: 'a word first; he is careful after', bonus: 400 },
          { id: 'fine', label: `Fine ${c.firstName}`, action: spotCallAction(c.id, 'fine'), why: 'he pays what he owes and more', bonus: 250 + fineOf(s, c) },
          { id: 'pull', label: `Take ${c.firstName}'s spot`, action: spotCallAction(c.id, 'pull'), why: 'the spot goes to somebody who pays', bonus: hist >= 3 ? 300 : 0 },
        ] });
    }
    // A big earner who wants more: the crews.
    for (const c of men) {
      const sp = spotOf(s, c.id);
      if (!sp || sp.want === undefined || c.id === ub.id) continue;
      out.push({ id: `spotwant:${c.id}`, seat: 'underboss', domain: 'crews', topic: `${c.firstName} wants a bigger end`, charId: c.id, priority: 300 + (s.week - sp.want) * 20,
        says: [`${c.firstName}'s ${SPOTS[sp.k].what} is the best thing going in his crew. He wants a bigger end, and he's earned it.`],
        specs: [
          { id: 'raise', label: `Give ${c.firstName} more`, action: spotCallAction(c.id, 'raise'), why: 'a big earner stays happy', bonus: 450 },
          { id: 'hold', label: `Tell ${c.firstName} to wait`, action: spotCallAction(c.id, 'hold'), why: 'the family keeps its end', bonus: 300 },
        ] });
    }
  }
  // Men asking to run their thing out of your places: your own and the independents are the underboss's
  // (the rackets), another family's man is the consigliere's (the other families).
  for (const a of openAsks(s)) {
    const seat = a.from === 'rival' ? 'consigliere' : 'underboss';
    if (!(seat === 'underboss' ? ub : cons)) continue;
    const T = TRADES[a.trade];
    const yours = Math.round(a.gross * a.cut / 100);
    const risky = a.from === 'rival' || a.rep < 30;
    out.push({ id: `place:${a.id}`, seat, domain: seat === 'underboss' ? 'rackets' : 'families', topic: `${a.name} at ${a.placeName}`, charId: a.who ?? '', priority: 280 + yours,
      says: [`${a.name} wants to run ${T.what} out of ${a.placeName}, ${a.cut}% to us.${a.from === 'rival' ? ' He is their man; I don\'t love it.' : a.cop ? ' His sister\'s husband is the desk sergeant.' : ''}`],
      specs: [
        { id: 'accept', label: `Let ${a.name} in`, action: askAction(a.id, 'accept'), why: `~$${yours}/wk`, bonus: risky ? yours * 2 : 300 + yours * 6 },
        { id: 'counter', label: `Counter at ${a.cut + 10}%`, action: askAction(a.id, 'counter', a.cut + 10), why: 'more for us, if he takes it', bonus: 250 + yours * 5 },
        { id: 'refuse', label: `Turn ${a.name} down`, action: askAction(a.id, 'refuse'), why: risky ? 'nobody we don\'t trust under our roof' : 'we keep the place clean', bonus: risky ? 400 : 100 },
      ] });
  }
  // Trouble at a tenant's racket: the underboss sees to the rackets.
  if (ub) for (const [id, t] of troubled(s)) {
    out.push({ id: `trouble:${id}`, seat: 'underboss', domain: 'rackets', topic: `Trouble at ${t.placeName}`, charId: t.who ?? '', priority: 340 + (s.week - t.trouble!.w) * 30,
      says: [`${t.placeName}: ${TROUBLE_WORD[t.trouble!.k]}. We keep him, put one of ours in, or close it.`],
      specs: [
        { id: 'keep', label: `Keep ${t.name}`, action: tenantAction(id, 'keep'), why: 'the money keeps coming', bonus: t.trouble!.k === 'claim' ? 150 : 350 },
        ...(replacementFor(s, t) ? [{ id: 'replace', label: 'Put one of ours in', action: tenantAction(id, 'replace'), why: 'our man, our count', bonus: t.rival || t.trouble!.k === 'short' ? 450 : 250 }] : []),
        { id: 'withdraw', label: 'Close it', action: tenantAction(id, 'withdraw'), why: 'no more trouble from it', bonus: t.trouble!.k === 'law' ? 450 : 100 },
      ] });
  }
  // The consigliere: sore and drifting men (quarrels in the family): a spot settles a man down.
  if (cons) {
    const sore = men.filter((c) => c.id !== cons.id && (!spotOf(s, c.id) || spotOf(s, c.id)?.free) && (opinion(s, c.id, s.playerId) < 10 || c.courtedBy))
      .filter((c) => !out.some((x) => x.charId === c.id)).slice(0, 1);
    for (const c of sore) {
      const specs = offers(c, cons.id);
      if (!specs.length) continue;
      out.push({ id: `csetup:${c.id}`, seat: 'consigliere', domain: 'mediation', topic: `${c.firstName} ${c.lastName} is drifting`, charId: c.id, priority: 320 + (c.courtedBy ? 200 : 0),
        says: [`${c.firstName} is sore${c.courtedBy ? ', and another family is talking to him' : ''}. Give him something of his own and he remembers who gave it.`], specs });
    }
  }
  return out;
}

/** One set-up to offer (the bots' list, the hub's first suggestion): the longest-waiting man and his best spot. */
export function nextSetup(s: GameState): PlayerAction | undefined {
  const less = s.econ?.spotless ?? {};
  const c = crew(s).filter((x) => canHoldSpot(s, x) && (!spotOf(s, x.id) || spotOf(s, x.id)?.free) && !(x.rank === 'capo' && incomeSources(s, x).length > 0 && !spotOf(s, x.id)))
    .sort((a, b) => (less[a.id] ?? s.week) - (less[b.id] ?? s.week) || (a.id < b.id ? -1 : 1))[0];
  if (!c) return undefined;
  const o = spotOffers(s, c, s.playerId).find((x) => !x.lock && !x.objects);
  return o ? setupAction(c.id, o.k) : undefined;
}
