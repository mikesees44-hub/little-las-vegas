import { isInSeason } from './calendar';
import { CATALOG } from './catalog';
import { crew, displayName, isFree } from './characters';
import { commitEcon, marketValue } from './econ';
import type { Lot } from './econState';
import { applyEffects } from './effects';
import { yearMult } from './earners';
import { heatBand } from './heat';
import type { Ctx } from './ledger';
import { pressItem } from './paper';
import { isMineLot, isOperating } from './placeEligibility';
import { USES_BY_ID, ZONES_BY_ID } from './property';
import { hashSeed, rand, type RngHolder } from './rng';
import { FACTION_NAMES } from './world';
import type { ActionPreview } from './actions';
import type { Business, BusinessKind, Character, Effect, GameState, PlayerAction, RivalId, Trait } from './types';
import {
  pr, ASK_LABEL, ASK_PENALTY, ASK_SHARE, BACKDOOR_GOODS, FAMILY_FRONT, FAMILY_LABEL, familyOfKind, familyOfUse, OWNER_TRAITS, PRESS_BY_ID, PRESS_STEPS,
  WORK_BY_ID, WORK_SCHEMES, type AskLevel, type BizFamily, type OwnerTrait, type PressDef, type PressStep, type WorkSchemeDef, type WorkSchemeId,
} from './bizRacketData';

/**
 * WORK THIS PLACE: "Start a racket here" on a particular business opens a
 * sheet for THAT place — who owns it, what it takes in (as far as you know),
 * who protects it now, what kind of man the owner is — and the rackets that
 * fit its trade: protection, a skim, the back door, the owner's debts and
 * payroll and license, and what only a bar (or a motel, an arcade, a pier
 * ride, a laundromat) is good for. If he says no, the escalation is here too,
 * step by step, each with its odds, its heat and what the paper prints;
 * he may give in, sell to you, fold, fight back or go to the police.
 *
 * Every racket that comes of it is an ordinary business of yours (it pays,
 * draws heat and can be raided like any other); the place's own record (his
 * fear, the damage, his stance, what you run there) lives in `s.work`, made
 * the first time you work a place, with its own dice so the rest of the week
 * never reshuffles. Violence is implied and off-screen.
 */

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export type Stance = 'pays' | 'refused' | 'selling' | 'folded' | 'informant' | 'fighting' | 'sold' | 'burned';

export interface WorkHold {
  id: WorkSchemeId | 'protection' | 'piece';
  bizId?: string;
  loanId?: string;
  week: number;
}

export interface WorkPlaceRec {
  /** Fear you put in him (on top of his nature); fades. */
  fear: number;
  /** Damage to his trade, 0-100; fades. */
  hurt: number;
  /** Pride he found (a man who fought back once stands taller). */
  pride: number;
  stance?: Stance;
  /** The week the stance was set. */
  since?: number;
  /** The weekly envelope he pays. */
  rate?: number;
  /** Pressure steps taken against him. */
  steps: number;
  holds: WorkHold[];
}

export interface WorkResult { week: number; place: string; text: string; outcome: string }

export interface WorkState {
  rng: number;
  places: Record<string, WorkPlaceRec>;
  log: WorkResult[];
  stats: { pitched: number; paying: number; refused: number; pressed: number; folded: number; sold: number; burned: number; informants: number };
}

export function ensureWork(s: GameState): WorkState {
  if (!s.work) s.work = { rng: hashSeed(`${s.seed}:work`), places: {}, log: [], stats: { pitched: 0, paying: 0, refused: 0, pressed: 0, folded: 0, sold: 0, burned: 0, informants: 0 } };
  const W = s.work;
  W.places ??= {};
  W.log ??= [];
  W.stats ??= { pitched: 0, paying: 0, refused: 0, pressed: 0, folded: 0, sold: 0, burned: 0, informants: 0 };
  return W;
}

function recOf(s: GameState, id: string): WorkPlaceRec | undefined {
  return s.work?.places[id];
}
function ensureRec(s: GameState, id: string): WorkPlaceRec {
  const W = ensureWork(s);
  return (W.places[id] ??= { fear: 0, hurt: 0, pride: 0, steps: 0, holds: [] });
}

/* ------------------------------------------------------------------ */
/* The orders                                                          */
/* ------------------------------------------------------------------ */

export type WorkAction =
  | { op: 'pitch'; place: string; who: string; ask: AskLevel }
  | { op: 'scheme'; place: string; scheme: WorkSchemeId; who: string }
  | { op: 'press'; place: string; step: PressStep; who: string }
  | { op: 'drop'; place: string };

/* ------------------------------------------------------------------ */
/* The place                                                           */
/* ------------------------------------------------------------------ */

export interface WorkPlace {
  /** Lot id, or `biz:<id>` for a place of yours with no lot. */
  id: string;
  lot?: Lot;
  biz?: Business;
  name: string;
  address: string;
  /** What it is ("Diner"). */
  what: string;
  family: BizFamily;
  district: string;
  mine: boolean;
  /** A family owns the building and runs it. */
  rival?: RivalId;
}

const cap1 = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const LANDMARK = /avalon|chapel/i;

function districtOfLot(l: Lot): string {
  return (ZONES_BY_ID[l.zone] as { district?: string } | undefined)?.district ?? `zone:${l.zone}`;
}

/** The place a lot or a business of yours is, if it can be worked at all. */
export function workPlace(s: GameState, lot?: Lot, biz?: Business): WorkPlace | undefined {
  if (lot) {
    // A place you burned or closed keeps its record (the ashes can still be bought).
    const use = lot.use ?? (s.work?.places[lot.id] ? lot.past?.at(-1)?.use : undefined);
    const family = familyOfUse(use) ?? (lot.bizId ? familyOfKind(s.businesses.find((b) => b.id === lot.bizId)?.kind ?? 'bar') : undefined);
    if (!family || lot.home || lot.status === 'public' || lot.owner === 'city') return undefined;
    const u = use ? USES_BY_ID[use] : undefined;
    const rival = lot.status === 'rival' && s.rivals.some((r) => r.id === lot.owner && r.kind === 'mob') ? (lot.owner as RivalId) : undefined;
    const ownBiz = lot.bizId ? s.businesses.find((b) => b.id === lot.bizId) : undefined;
    const name = lot.name ?? ownBiz?.name ?? (lot.tenant ? cap1(lot.tenant) : u?.name ?? 'The place');
    return { id: lot.id, lot, biz: ownBiz, name, address: lot.address, what: u?.name ?? FAMILY_LABEL[family], family, district: districtOfLot(lot), mine: isMineLot(lot), rival };
  }
  if (biz) {
    const family = familyOfKind(biz.kind);
    if (!family || biz.owner !== 'player') return undefined;
    const d = s.districts.find((x) => x.id === biz.districtId);
    return { id: `biz:${biz.id}`, biz, name: biz.name, address: d?.name ?? '', what: CATALOG[biz.kind].name, family, district: biz.districtId, mine: true };
  }
  return undefined;
}

export function placeById(s: GameState, id: string): WorkPlace | undefined {
  if (id.startsWith('biz:')) return workPlace(s, undefined, s.businesses.find((b) => b.id === id.slice(4)));
  return workPlace(s, s.econ?.lots.find((l) => l.id === id));
}

/** Why this place cannot be worked now (closed, burned, a landmark), if it cannot. */
export function placeBlock(s: GameState, p: WorkPlace | undefined): string | undefined {
  if (!p) return 'Not a business';
  if (LANDMARK.test(`${p.name} ${p.address}`)) return 'A landmark: nobody works it';
  if (p.lot && !isOperating(p.lot)) return 'Nobody is running it';
  if (p.biz && p.mine && (p.biz.closedUntil ?? 0) > s.week) return 'It is padlocked';
  const st = recOf(s, p.id)?.stance;
  if (st === 'burned') return 'It burned down';
  if (st === 'folded') return pr('{He} closed up', ownerOf(s, p).he);
  return undefined;
}

/** What the place takes in a week, as far as you know: exact once you have a man inside. */
export function placeTrade(s: GameState, p: WorkPlace): { gross: number; lo: number; hi: number; exact: boolean } {
  const season = isInSeason(s.date);
  let gross: number;
  const u = p.lot?.use ? USES_BY_ID[p.lot.use] : undefined;
  if (u && u.rev > 0) {
    const z = p.lot ? ZONES_BY_ID[p.lot.zone] : undefined;
    const m = u.seasonal && z ? (season ? z.season[0] : z.season[1]) : 1;
    gross = u.rev * m;
  } else {
    const kind = u?.biz ?? p.biz?.kind ?? FAMILY_FRONT[p.family];
    const d = CATALOG[kind];
    gross = d.base * (season ? d.season[0] : d.season[1]) * 1.8;
  }
  gross = Math.max(60, Math.round(gross / 10) * 10);
  const rec = recOf(s, p.id);
  if (rec?.hurt) gross = Math.round(gross * (1 - Math.min(0.8, rec.hurt / 125)) / 10) * 10;
  const exact = p.mine || !!rec?.holds.some((h) => h.id === 'skim' || h.id === 'noshow' || h.id === 'license' || h.id === 'piece');
  return exact ? { gross, lo: gross, hi: gross, exact } : { gross, lo: Math.round(gross * 0.75 / 10) * 10, hi: Math.round(gross * 1.3 / 10) * 10, exact };
}

/* ------------------------------------------------------------------ */
/* The owner and who protects him                                      */
/* ------------------------------------------------------------------ */

export type Protector = { kind: 'none' } | { kind: 'rival'; rival: RivalId } | { kind: 'police' } | { kind: 'player' };

export interface Owner {
  name: string;
  he: 'he' | 'she';
  charId?: string;
  traits: OwnerTrait[];
  /** 0-100 with what you have done to him. */
  fear: number;
  pride: number;
  protector: Protector;
  stance?: Stance;
  /** Who he answers to, for a family's front. */
  answers?: string;
}

const FIRST = ['Sal', 'Joe', 'Frank', 'Eddie', 'Tony', 'Walt', 'Harry', 'Gus', 'Lou', 'Mike', 'Stan', 'Ray', 'Nick', 'Carl', 'Al', 'Benny'];
const LAST = ['Pirelli', 'Kowalski', 'Brennan', 'Sorensen', 'Mahaffey', 'Lenz', 'Castellano', 'Hallahan', 'DiNardo', 'Papadakis', 'Kovacs', 'Russo', 'Doyle', 'Feeney', 'Schmidt', 'Amato'];

const TRAIT_FROM: Partial<Record<Trait, OwnerTrait>> = { Cowardly: 'Scared', 'Hot-headed': 'Hothead', Greedy: 'Greedy', Pious: 'Churchgoer', Gambler: 'Gambler', Honest: 'Honest', Patient: 'Stubborn', Ambitious: 'Proud', Paranoid: 'Scared' };

function ownerName(p: WorkPlace, h: number): { name: string; he: 'he' | 'she' } {
  const t = p.lot?.tenant;
  const who = t?.split('\'s ')[0];
  if (who && /^[A-Z]/.test(who) && !/^the /i.test(who)) return { name: who, he: /^(Mrs\.|Miss|Mme|Mrs )/.test(who) ? 'she' : 'he' };
  const fam = who ? /the ([A-Z][\w'-]+) (family|brothers|estate|sisters)/.exec(who) : undefined;
  const last = fam?.[1] ?? LAST[(h >>> 3) % LAST.length];
  return { name: `${FIRST[(h >>> 7) % FIRST.length]} ${last}`, he: 'he' };
}

/** Who protects the place now: you, a family, the beat cop, or nobody. Pure. */
export function protectorOf(s: GameState, p: WorkPlace): Protector {
  if (p.mine) return { kind: 'player' };
  if (p.rival) return { kind: 'rival', rival: p.rival };
  if (recOf(s, p.id)?.stance === 'pays') return { kind: 'player' };
  const h = hashSeed(`${s.seed}:prot:${p.id}`);
  const d = s.districts.find((x) => x.id === p.district);
  if (d) {
    const top = s.rivals.filter((r) => r.kind === 'mob').sort((a, b) => (d.influence[b.id] ?? 0) - (d.influence[a.id] ?? 0) || (a.id < b.id ? -1 : 1))[0];
    const theirs = top ? d.influence[top.id] ?? 0 : 0;
    if (top && theirs > (d.influence.player ?? 0) && h % 10 < 7) return { kind: 'rival', rival: top.id };
    if (top && theirs >= 15 && h % 10 < 3) return { kind: 'rival', rival: top.id };
  }
  if ((h >>> 4) % 7 === 0) return { kind: 'police' };
  return { kind: 'none' };
}

export function protectorLabel(pr: Protector): string {
  switch (pr.kind) {
    case 'none': return 'Nobody';
    case 'player': return 'You';
    case 'police': return 'The cops (the beat cop gets an envelope at Christmas)';
    case 'rival': return FACTION_NAMES[pr.rival] ?? 'Another family';
  }
}

/** The owner: a man in the game if there is one by that name, else one made up to fit the place (the same every time). Pure. */
export function ownerOf(s: GameState, p: WorkPlace): Owner {
  const h = hashSeed(`${s.seed}:owner:${p.id}`);
  const rec = recOf(s, p.id);
  const protector = protectorOf(s, p);
  if (p.mine) return { name: s.characters[s.playerId] ? displayName(s.characters[s.playerId]) : 'You', he: 'he', charId: s.playerId, traits: [], fear: 0, pride: 0, protector };
  const { name, he: he0 } = ownerName(p, h);
  const c = Object.values(s.characters).find((x) => x.alive && `${x.firstName} ${x.lastName}` === name);
  const he: 'he' | 'she' = c ? (c.gender === 'F' ? 'she' : 'he') : he0;
  let traits: OwnerTrait[];
  if (c) traits = [...new Set(c.traits.map((t) => TRAIT_FROM[t]).filter((t): t is OwnerTrait => !!t))].slice(0, 3);
  else {
    const a = OWNER_TRAITS[(h >>> 11) % OWNER_TRAITS.length];
    const rest = OWNER_TRAITS.filter((t) => t !== a);
    traits = [a, rest[(h >>> 17) % rest.length]];
    // Scared and Hothead, Proud and Scared do not sit in the same man.
    if (traits.includes('Scared') && (traits.includes('Hothead') || traits.includes('Proud'))) traits = [a];
  }
  let fear = 12 + (h % 30) + (c ? Math.round((50 - c.attributes.force) / 4) : 0);
  let pride = 30 + ((h >>> 5) % 45);
  if (traits.includes('Scared')) fear += 20;
  if (traits.includes('Family first')) fear += 8;
  if (traits.includes('Proud')) pride += 15;
  if (traits.includes('Stubborn')) pride += 10;
  if (traits.includes('Hothead')) pride += 5;
  // What the street thinks of you, and how much of the street is yours.
  const d = s.districts.find((x) => x.id === p.district);
  fear += Math.round((s.respect - 40) / 4) + Math.round(((d?.influence.player ?? 0) - 30) / 6);
  fear += rec?.fear ?? 0;
  pride += rec?.pride ?? 0;
  return {
    name, he, charId: c?.id, traits, protector, stance: rec?.stance,
    fear: Math.max(0, Math.min(100, Math.round(fear))), pride: Math.max(0, Math.min(100, Math.round(pride))),
    answers: p.rival ? FACTION_NAMES[p.rival] : undefined,
  };
}

/** The neighborhood's heat: yours on the island, and who holds the street. */
export function hoodHeat(s: GameState, p: WorkPlace): { local: number; band: string; yours: number; top?: { rival: RivalId; share: number } } {
  const d = s.districts.find((x) => x.id === p.district);
  const top = d ? s.rivals.filter((r) => r.kind === 'mob').sort((a, b) => (d.influence[b.id] ?? 0) - (d.influence[a.id] ?? 0) || (a.id < b.id ? -1 : 1))[0] : undefined;
  return { local: Math.round(s.heat.local), band: heatBand(s.heat.local), yours: Math.round(d?.influence.player ?? 0), top: top && d && (d.influence[top.id] ?? 0) > 0 ? { rival: top.id, share: Math.round(d.influence[top.id] ?? 0) } : undefined };
}

/* ------------------------------------------------------------------ */
/* Your man                                                            */
/* ------------------------------------------------------------------ */

export function whoBlock(s: GameState, id: string | undefined): string | undefined {
  const c = id ? s.characters[id] : undefined;
  if (!c || !c.alive) return 'He is gone';
  if (c.faction !== 'player') return 'Not one of yours';
  if (!isFree(s, c)) return c.id === s.playerId ? 'You are inside' : 'He is inside';
  if (c.id !== s.playerId && (c.busyUntil ?? 0) > s.week) return 'Away on a job';
  return undefined;
}

/** Everybody who could go: the boss himself, then his men, the best at it first. */
export function workCrew(s: GameState, fit: keyof Character['attributes'] = 'force'): Character[] {
  const boss = s.characters[s.playerId];
  const men = crew(s).filter((c) => c.rank !== 'civilian' && !whoBlock(s, c.id)).sort((a, b) => b.attributes[fit] - a.attributes[fit] || (a.id < b.id ? -1 : 1));
  return [...(boss && !whoBlock(s, boss.id) ? [boss] : []), ...men];
}

export function defaultWho(s: GameState, fit: keyof Character['attributes'] = 'force'): string | undefined {
  const all = workCrew(s, fit);
  return all.find((c) => c.id !== s.playerId)?.id ?? all[0]?.id;
}

/* ------------------------------------------------------------------ */
/* Protection                                                          */
/* ------------------------------------------------------------------ */

export interface Reason { label: string; value: number }
export interface PitchView {
  rate: number;
  accept: number;
  haggle: number;
  decline: number;
  reasons: Reason[];
  lock?: string;
  thinks: string;
  /** The weekly envelope if he haggles. */
  haggled: number;
  rivalNote?: string;
}

const clampP = (x: number, lo = 0.02, hi = 0.9) => Math.max(lo, Math.min(hi, x));
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

/** Offer protection: what he will say, and why. Pure. */
export function pitchView(s: GameState, p: WorkPlace, who: string, ask: AskLevel): PitchView {
  const o = ownerOf(s, p);
  const t = placeTrade(s, p);
  const rate = r5(t.gross * ASK_SHARE[ask]);
  const c = s.characters[who];
  const rec = recOf(s, p.id);
  const reasons: Reason[] = [{ label: 'Base', value: 40 }];
  const add = (label: string, v: number) => { if (v) reasons.push({ label, value: Math.round(v) }); };
  const g = (x: string) => pr(x, o.he);
  add(g(`{His} fear (${o.fear})`), (o.fear - 40) * 0.6);
  add(g(`{His} pride (${o.pride})`), -(o.pride - 50) * 0.5);
  add(`Your name on the street (respect ${Math.round(s.respect)})`, (s.respect - 40) * 0.3);
  if (c) add(`${c.id === s.playerId ? 'You' : c.firstName}: force ${c.attributes.force}`, (c.attributes.force - 50) * 0.2);
  if (who === s.playerId) add('The boss comes himself', 8);
  add(g(ASK_LABEL[ask]), -ASK_PENALTY[ask]);
  if (o.protector.kind === 'rival') add(g(`${FACTION_NAMES[o.protector.rival]} protects {him}`), -30);
  if (o.protector.kind === 'police') add(g('{He} pays the beat cop'), -12);
  const T: Partial<Record<OwnerTrait, number>> = { Scared: 10, 'Family first': 6, Stubborn: -10, Connected: -8, Hothead: -6, Honest: -8, Proud: -4 };
  for (const tr of o.traits) if (T[tr]) add(tr, T[tr]!);
  if (rec?.hurt) add(g(`What {his} trade has lost (${Math.round(rec.hurt)})`), rec.hurt * 0.3);
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  let accept = clampP(sum / 100, 0.03, 0.9);
  let haggle = ask === 'light' ? 0 : Math.min(0.25, (1 - accept) * 0.4);
  if (p.rival) { accept = 0.02; haggle = 0; reasons.push({ label: `It is ${FACTION_NAMES[p.rival]}'s own place`, value: -60 }); }
  const lock = p.mine ? 'It is yours' : rec?.stance === 'pays' ? g(`{He} already pays you ${fmt(rec.rate ?? rate)} a week`) : rec?.stance === 'informant' ? g('{He} went to the police: a visit now is a pinch') : placeBlock(s, p) ?? whoBlock(s, who);
  const thinks = g(p.rival ? `"Tell your boss to talk to my boss." ${o.answers} runs this place.`
    : accept >= 0.6 ? '{He} has been waiting for somebody to come. {He} will pay, and be glad nothing happens.'
      : accept >= 0.35 ? `{He} will haggle. ${o.traits.includes('Greedy') ? '{He} counts every nickel.' : '{He} wants to know what {he} gets for it.'}`
        : o.protector.kind === 'rival' ? `{He} already pays ${FACTION_NAMES[o.protector.rival]}. Paying you too is paying twice.`
          : `{He} thinks {he} does not need protecting. ${o.traits.includes('Hothead') ? 'There is a bat under the counter.' : ''}`.trim());
  return {
    rate, accept, haggle, decline: Math.max(0, 1 - accept - haggle), reasons, lock, thinks, haggled: r5(rate * 0.65),
    rivalNote: o.protector.kind === 'rival' ? g(`${FACTION_NAMES[o.protector.rival]} protects {him}: taking {his} envelope is a move against them (they may hit back).`) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* The rackets at a place                                              */
/* ------------------------------------------------------------------ */

export interface SchemeView {
  def: WorkSchemeDef;
  /** The title, with the owner's pronouns. */
  title: string;
  line: string;
  cost: number;
  take: number;
  /** The odds he goes along (1 at a place of yours). */
  odds: number;
  reasons: Reason[];
  heat: string;
  lock?: string;
  thinks: string;
  kind?: BusinessKind;
}

/** The rackets this trade fits (a place of yours: the ones without an owner to ask). */
export function schemesFor(p: WorkPlace): WorkSchemeDef[] {
  return WORK_SCHEMES.filter((d) => (!d.only || d.only.includes(p.family)) && (p.mine ? d.mine : !d.mineOnly));
}

function schemeKind(p: WorkPlace, d: WorkSchemeDef): BusinessKind | undefined {
  if (d.kind === 'loan' || d.kind === 'stash') return undefined;
  if (d.id === 'backdoor') return p.family === 'bar' || p.family === 'club' ? 'bootleg' : p.family === 'pier' || p.family === 'service' ? 'cigarettes' : 'fencing';
  if (d.id === 'license') return FAMILY_FRONT[p.family];
  return d.kind;
}

/** Does he give you an in (he pays, he owes, your man is on his books, or he is that scared)? */
export function hasIn(s: GameState, p: WorkPlace): boolean {
  const rec = recOf(s, p.id);
  if (p.mine) return true;
  if (rec?.stance === 'pays') return true;
  if (rec?.holds.some((h) => h.id === 'noshow' || h.id === 'vig' || h.id === 'piece')) return true;
  return ownerOf(s, p).fear >= 70;
}

function heatText(h: { local?: number; federal?: number }, weekly: number): string {
  const p: string[] = [];
  if (h.local) p.push(`+${h.local} local now`);
  if (h.federal) p.push(`+${h.federal} federal now`);
  if (weekly >= 0.2) p.push('steady local heat while it runs');
  else if (weekly > 0) p.push('a little heat while it runs');
  return p.join(' · ') || 'none to speak of';
}

/** The weekly base a racket record needs to pay about `take` a week over the year. */
function baseFor(kind: BusinessKind, take: number): number {
  return Math.round(take / Math.max(0.3, yearMult(kind)));
}

/** One racket at this place: the setup, the take, his odds, the lock. Pure. */
export function schemeView(s: GameState, p: WorkPlace, id: WorkSchemeId, who: string): SchemeView {
  const d = WORK_BY_ID[id];
  const o = ownerOf(s, p);
  const t = placeTrade(s, p);
  const rec = recOf(s, p.id);
  const kind = schemeKind(p, d);
  const g = (x: string) => pr(x, o.he);
  const cost = Math.round((d.cost + (d.costShare ? t.gross * d.costShare : 0)) / 50) * 50;
  let take = Math.round((t.gross * d.share + (d.flat ?? 0)) / 5) * 5;
  if (d.kind === 'loan') take = Math.round(cost * 0.05);
  if (p.mine && d.id === 'backdoor') take = Math.round(take * 1.2);
  const reasons: Reason[] = [];
  let odds = 1;
  if (!p.mine) {
    reasons.push({ label: 'Base', value: 45 }, { label: g(d.title), value: d.coop });
    const add = (label: string, v: number) => { if (v) reasons.push({ label, value: Math.round(v) }); };
    add(g(`{His} fear (${o.fear})`), (o.fear - 40) * 0.5);
    add(g(`{His} pride (${o.pride})`), -(o.pride - 50) * 0.4);
    if (rec?.stance === 'pays') add(g('{He} already pays you'), 15);
    if (rec?.holds.some((h) => h.id === 'noshow')) add(g('Your man is on {his} payroll'), 10);
    if (o.traits.includes('Greedy') && ['backdoor', 'front', 'fence', 'machines', 'payouts', 'cardgame'].includes(id)) add(g('Greedy: there is money in it for {him}'), 12);
    if (o.traits.includes('Gambler') && id === 'vig') add(g('Gambler: {he} needs the money'), 25);
    if (id === 'vig' && !isInSeason(s.date)) add('Winter: the register is empty', 10);
    if (o.traits.includes('Honest')) add('Honest', -15);
    if (o.traits.includes('Churchgoer') && (id === 'hourly' || id === 'phone' || id === 'numbers' || id === 'payouts')) add(g('Churchgoer: not under {his} roof'), -20);
    if (o.protector.kind === 'rival') add(g(`${FACTION_NAMES[o.protector.rival]} protects {him}`), -20);
    odds = clampP(reasons.reduce((a, r) => a + r.value, 0) / 100, 0.03, 0.92);
  }
  const lock = placeBlock(s, p)
    ?? (p.rival ? `${FACTION_NAMES[p.rival]} runs it: nobody inside will deal with you` : undefined)
    ?? (rec?.stance === 'informant' ? g('{He} went to the police: anything you start here is evidence') : undefined)
    ?? (rec?.holds.some((h) => h.id === id) ? 'Already running here' : undefined)
    ?? (d.needsIn && !hasIn(s, p) ? g('You need an in first: {he} pays you protection, {he} owes you, or your man is on {his} payroll') : undefined)
    ?? (id === 'vig' && rec?.holds.some((h) => h.id === 'piece') ? g('You already own a piece of {him}') : undefined)
    ?? whoBlock(s, who);
  const line = g(d.id === 'backdoor' ? `${cap1(BACKDOOR_GOODS[p.family])}.` : d.id === 'front' && p.family === 'laundromat' ? `${d.line} A laundry counts in quarters: nobody can tell.` : d.line);
  const thinks = p.mine ? 'Your place: nobody to ask.' : g(
    odds >= 0.6 ? `{He} will go along${o.traits.includes('Greedy') ? ' and ask for a bigger end' : ''}.`
      : odds >= 0.35 ? '{He} might, if your man puts it right.'
        : `{He} will say no${o.traits.includes('Hothead') ? ', loudly' : ''}${rec?.stance === 'pays' ? '' : ', and may show your man the door'}.`);
  return { def: d, title: g(d.title), line, cost, take, odds, reasons, heat: heatText(d.heat, d.weekly), lock, thinks, kind };
}

/* ------------------------------------------------------------------ */
/* Putting him out of business                                         */
/* ------------------------------------------------------------------ */

export type Reaction = 'pays' | 'sells' | 'folds' | 'informant' | 'fights' | 'holds';
export const REACTION_LABEL: Record<Reaction, string> = {
  pays: 'Gives in and pays', sells: 'Offers to sell to you', folds: 'Closes up for good', informant: 'Goes to the police', fights: 'Fights back', holds: 'Holds out',
};

export interface PressView {
  def: PressDef;
  /** Title, line and the town's take, with the owner's pronouns. */
  title: string;
  line: string;
  town: string;
  /** Odds it goes off clean, %. */
  odds: number;
  cost: number;
  react: Record<Reaction, number>;
  lock?: string;
  /** What a family that protects him does. */
  rivalNote?: string;
  paperNote: string;
  /** Innocents at risk (the fire). */
  innocents: number;
  price?: number;
}

/** May you go after him now? He said no, he fought, he talked, or it is a family's place. */
export function pressOpen(s: GameState, p: WorkPlace): boolean {
  if (p.mine) return false;
  const st = recOf(s, p.id)?.stance;
  return !!p.rival || st === 'refused' || st === 'fighting' || st === 'informant' || st === 'selling';
}

/** The buyout price: less than the place was worth, less again the more he has lost. Pure. */
export function buyoutPrice(s: GameState, p: WorkPlace): number {
  if (!p.lot) return 0;
  const rec = recOf(s, p.id);
  const mv = marketValue(s, p.lot);
  const k = rec?.stance === 'selling' ? 0.45 : 0.7 - Math.min(0.25, (rec?.hurt ?? 0) / 300);
  return Math.max(500, Math.round(mv * k / 50) * 50);
}

/** What he does after a step, by likelihood (sums to 1). Pure. */
export function reactionOdds(s: GameState, p: WorkPlace, step: PressStep, clean = true): Record<Reaction, number> {
  const d = PRESS_BY_ID[step];
  const o = ownerOf(s, p);
  const rec = recOf(s, p.id);
  const F = Math.min(100, o.fear + d.fear);
  const H = Math.min(100, (rec?.hurt ?? 0) + d.hurt);
  const prot = o.protector.kind === 'rival' ? 25 : o.protector.kind === 'police' ? 10 : 0;
  const has = (t: OwnerTrait) => o.traits.includes(t);
  const out: Record<Reaction, number> = { pays: 0, sells: 0, folds: 0, informant: 0, fights: 0, holds: 0 };
  if (p.rival) {
    out.fights = clampP(0.2 + -d.rival / 100 + (step === 'fire' ? 0.3 : 0), 0, 0.8);
    out.holds = 1 - out.fights;
    return out;
  }
  out.pays = clampP((F + H * 0.4 - o.pride * 0.7 - prot + 10) / 100, 0.02, 0.7);
  out.sells = H >= 35 ? clampP(0.06 + (H - 35) / 250, 0, 0.3) : 0.02;
  out.folds = H >= 55 ? clampP((H - 55) / 180, 0, 0.3) : 0;
  out.informant = clampP(0.03 + (has('Honest') ? 0.08 : 0) + (has('Churchgoer') ? 0.04 : 0) + (o.protector.kind === 'police' ? 0.08 : 0) + (rec?.steps ?? 0) * 0.015 + (step === 'brick' ? 0.04 : step === 'fire' ? 0.1 : 0) + (clean ? 0 : 0.1) - (F > 70 ? 0.03 : 0), 0.01, 0.4);
  out.fights = clampP(0.04 + (has('Hothead') ? 0.1 : 0) + (has('Proud') ? 0.05 : 0) + (o.protector.kind === 'rival' ? 0.1 : 0) + (clean ? 0 : 0.05), 0.01, 0.35);
  if (step === 'fire') { out.pays = 0; out.folds = 0; out.sells = clampP(out.sells + 0.35, 0, 0.6); }
  if (step === 'buyout') return { pays: 0, sells: 1, folds: 0, informant: 0, fights: 0, holds: 0 };
  const sum = out.pays + out.sells + out.folds + out.informant + out.fights;
  if (sum > 0.98) { const k = 0.98 / sum; for (const r of Object.keys(out) as Reaction[]) out[r] *= k; }
  out.holds = Math.max(0, 1 - (out.pays + out.sells + out.folds + out.informant + out.fights));
  return out;
}

/** One step against him: the odds, the damage, the paper, who else cares. Pure. */
export function pressView(s: GameState, p: WorkPlace, step: PressStep, who: string): PressView {
  const d = PRESS_BY_ID[step];
  const o = ownerOf(s, p);
  const rec = recOf(s, p.id);
  const c = s.characters[who];
  let odds = d.odds;
  if (c && step !== 'buyout') odds += Math.round((c.attributes[step === 'inspector' || step === 'supplies' ? 'intrigue' : 'force'] - 50) * 0.2);
  if (s.heat.local > 40 && step !== 'buyout') odds -= Math.round((s.heat.local - 40) / 4);
  if (rec?.stance === 'informant' && step !== 'buyout') odds -= 15;
  if (step === 'supplies' && s.businesses.some((b) => b.owner === 'player' && (b.kind === 'trucking' || b.kind === 'waste' || b.kind === 'labor'))) odds += 10;
  if (step === 'inspector' && (s.favors > 0 || s.businesses.some((b) => b.owner === 'player' && b.kind === 'payoff'))) odds += 10;
  odds = Math.max(10, Math.min(step === 'buyout' ? 100 : 95, odds));
  const g = (x: string) => pr(x, o.he);
  const price = step === 'buyout' ? buyoutPrice(s, p) : undefined;
  let innocents = d.innocents ?? 0;
  if (innocents && (p.family === 'motel' || p.family === 'club')) innocents += 0.1;
  if (innocents && isInSeason(s.date)) innocents += 0.03;
  const lock = placeBlock(s, p) && !(step === 'buyout' && rec?.stance === 'selling')
    ? placeBlock(s, p)
    : !pressOpen(s, p) ? (p.mine ? 'It is yours' : g(rec?.stance === 'pays' ? '{He} pays you: leave {him} be' : 'Ask {him} first: {he} has not said no'))
      : step === 'buyout' && p.rival ? `${FACTION_NAMES[p.rival]} will not sell to you`
        : step === 'buyout' && rec?.stance !== 'selling' && (rec?.hurt ?? 0) < 40 ? g('{He} is not ready to sell: {his} trade has to hurt first (or {he} offers)')
          : step === 'buyout' && price !== undefined && s.money < price ? `Needs ${fmt(price)}`
            : step === 'lean' && !!p.rival ? 'Nobody to lean on: the family\'s manager laughs at a warning'
              : step === 'inspector' && p.rival && s.favors <= 0 ? 'The family has its own man at City Hall: you need a political favor'
                : whoBlock(s, who);
  const rivalNote = o.protector.kind === 'rival' && d.rival
    ? g(`${FACTION_NAMES[o.protector.rival]} protects {him}: a move against them (opinion ${d.rival}, ${Math.round(d.retaliate * 100)}% they hit back).`)
    : undefined;
  const paperNote = d.press >= 1 ? `The paper prints it (${d.sec === 'front' ? 'front page' : d.sec}).` : d.press > 0 ? `${Math.round(d.press * 100)}% the paper prints it (${d.sec === 'spout' ? 'Spout Off' : d.sec}).` : 'Nothing in the paper.';
  return { def: d, title: g(d.title), line: g(d.line), town: g(d.town), odds, cost: price ?? d.cost, react: reactionOdds(s, p, step), lock, rivalNote, paperNote, innocents, price };
}

/* ------------------------------------------------------------------ */
/* Previews                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const noop = (title: string, why: string): ActionPreview => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'street' });
const note = (text: string, _label?: string): Effect => ({ type: 'econ', op: { op: 'note', text } });

export function previewWork(s: GameState, a: WorkAction): ActionPreview {
  const p = placeById(s, a.place);
  if (!p) return noop('Work this place', 'No such place');
  const who = 'who' in a ? s.characters[a.who] : undefined;
  const whoName = who ? (who.id === s.playerId ? 'you' : `${who.firstName} ${who.lastName}`) : '';
  const g = (x: string) => pr(x, ownerOf(s, p).he);
  switch (a.op) {
    case 'pitch': {
      const v = pitchView(s, p, a.who, a.ask);
      const title = `Offer ${p.name} protection (${fmt(v.rate)}/wk)`;
      return {
        title,
        detail: `${whoName === 'you' ? 'You go' : `${who?.firstName ?? 'Your man'} goes`} by with the offer: ${fmt(v.rate)} a week and nothing bad happens. Yes ${pct(v.accept)}, haggles to ${fmt(v.haggled)} ${pct(v.haggle)}, no ${pct(v.decline)}.`,
        effects: [note(`Yes ${pct(v.accept)} · haggles ${pct(v.haggle)} · no ${pct(v.decline)}`, title)],
        odds: { chance: v.accept + v.haggle, reasons: v.reasons },
        warning: v.rivalNote, cost: 0, because: `offered ${p.name} protection`, disabledReason: v.lock, category: 'street',
      };
    }
    case 'scheme': {
      const v = schemeView(s, p, a.scheme, a.who);
      const title = `${v.title}: ${p.name}`;
      const fx: Effect[] = [note(v.def.kind === 'loan' ? `${fmt(v.cost)} out at five points: ${fmt(v.take)}/wk vig` : `~${fmt(v.take)}/wk · ${v.heat}`, title)];
      return {
        title,
        detail: `${v.line} Setup ${fmt(v.cost)} (paid only if ${p.mine ? 'it goes ahead' : g('{he} goes along')}); about ${fmt(v.take)} a week.${p.mine ? '' : g(` {He} goes along ${pct(v.odds)}.`)}`,
        effects: fx, ...(p.mine ? {} : { odds: { chance: v.odds, reasons: v.reasons } }),
        cost: v.cost, because: `${v.title.toLowerCase()} at ${p.name}`, disabledReason: v.lock ?? (s.money < v.cost ? `Needs ${fmt(v.cost)}` : undefined), category: 'street',
      };
    }
    case 'press': {
      const v = pressView(s, p, a.step, a.who);
      const title = `${v.title}: ${p.name}`;
      const r = v.react;
      return {
        title,
        detail: `${v.line} ${v.odds}% it goes off clean. ${v.paperNote}${v.innocents ? ` ${pct(v.innocents)} somebody innocent is hurt.` : ''}`,
        effects: [note(`After: pays ${pct(r.pays)} · sells ${pct(r.sells)} · folds ${pct(r.folds)} · talks ${pct(r.informant)} · fights ${pct(r.fights)}`, title)],
        odds: { chance: v.odds / 100, reasons: [{ label: v.title, value: v.odds }] },
        warning: v.rivalNote, cost: v.cost, because: `${a.step === 'buyout' ? 'bought out' : 'went after'} ${p.name}`, disabledReason: v.lock ?? (s.money < v.cost ? `Needs ${fmt(v.cost)}` : undefined), category: 'street',
      };
    }
    case 'drop': {
      const rec = recOf(s, p.id);
      return {
        title: `Let ${p.name} go`, detail: g('Leave {him} alone. The street sees you back off, a little.'),
        effects: rec?.steps ? [{ type: 'respect', amount: -1, label: `Backed off ${p.name}` }] : [], cost: 0, because: `let ${p.name} go`,
        disabledReason: !rec || !(rec.stance === 'refused' || rec.stance === 'fighting' || rec.stance === 'selling') ? 'Nothing to let go' : undefined, category: 'street',
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Commits                                                             */
/* ------------------------------------------------------------------ */

function log(ctx: Ctx, p: WorkPlace, outcome: string, text: string): void {
  const W = ensureWork(ctx.s);
  ctx.log.push(`${p.name} — ${text}`);
  W.log.push({ week: ctx.s.week, place: p.id, text, outcome });
  if (W.log.length > 20) W.log = W.log.slice(-20);
}

function holdBusiness(s: GameState, p: WorkPlace, kind: BusinessKind, name: string, take: number, cost: number, heat: number, who?: string): Business {
  const c = who ? s.characters[who] : undefined;
  const runner = c && (c.rank === 'soldier' || c.rank === 'associate') && c.faction === 'player' ? [c.id] : [];
  return {
    id: '', name, kind, districtId: p.district, owner: 'player', weeklyBase: baseFor(kind, take), upkeep: Math.round(CATALOG[kind].upkeep / 2),
    heat, category: CATALOG[kind].category, staffIds: runner, boughtWeek: s.week, cost,
  };
}

/** Adds the racket record and remembers it at the place. */
function addHold(ctx: Ctx, p: WorkPlace, id: WorkHold['id'], b: Business, label: string): void {
  const s = ctx.s;
  applyEffects(ctx, [{ type: 'addBusiness', business: b, label }], { label, because: label, category: 'street' });
  const added = s.businesses[s.businesses.length - 1];
  ensureRec(s, p.id).holds.push({ id, bizId: added?.id, week: s.week });
}

/** Ends what you run at a place (he folded, it burned, you bought it). */
function endHolds(ctx: Ctx, p: WorkPlace, which?: (h: WorkHold) => boolean): void {
  const s = ctx.s;
  const rec = recOf(s, p.id);
  if (!rec) return;
  const gone = rec.holds.filter((h) => !which || which(h));
  for (const h of gone) {
    if (h.bizId) s.businesses = s.businesses.filter((b) => b.id !== h.bizId);
    if (h.loanId) s.loans = s.loans.filter((l) => l.id !== h.loanId);
  }
  rec.holds = rec.holds.filter((h) => !gone.includes(h));
}

function rivalFx(o: Owner, p: WorkPlace, amount: number, retaliate: number, why: string): Effect[] {
  const rid = p.rival ?? (o.protector.kind === 'rival' ? o.protector.rival : undefined);
  if (!rid || !amount) return [];
  const fx: Effect[] = [{ type: 'rivalOpinion', rival: rid, amount, reason: why }];
  if (retaliate > 0) fx.push({ type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 4, chance: retaliate, hint: `${FACTION_NAMES[rid]} may hit back`, params: { rival: rid } });
  return fx;
}

export function commitWork(ctx: Ctx, a: WorkAction): void {
  const s = ctx.s;
  const p = placeById(s, a.place);
  if (!p) return;
  const W = ensureWork(s);
  const r: RngHolder = W;
  const rec = ensureRec(s, p.id);
  const o = ownerOf(s, p);
  const label = `Work this place: ${p.name}`;
  const ap = (fx: Effect[]) => { if (fx.length) applyEffects(ctx, fx.map((e) => ({ ...e, label: e.label ?? label })), { label, because: label, category: 'street' }); };
  const who = 'who' in a ? s.characters[a.who] : undefined;
  const whoName = who ? (who.id === s.playerId ? 'You' : who.firstName) : 'Your man';
  const g = (x: string) => pr(x, o.he);
  switch (a.op) {
    case 'pitch': {
      const v = pitchView(s, p, a.who, a.ask);
      W.stats.pitched++;
      const roll = rand(r);
      const fx: Effect[] = [];
      if (roll < v.accept + v.haggle) {
        const rate = roll < v.accept ? v.rate : v.haggled;
        rec.stance = 'pays'; rec.since = s.week; rec.rate = rate;
        W.stats.paying++;
        addHold(ctx, p, 'protection', holdBusiness(s, p, 'protection', `Protection: ${p.name}`, rate, 0, 0.1, a.who), label);
        fx.push(...rivalFx(o, p, -8, 0.35, `Took ${p.name}'s envelope off us`));
        if (o.protector.kind === 'police') fx.push({ type: 'heat', bar: 'local', amount: 2 });
        if (a.who === s.playerId) fx.push({ type: 'evidence', charId: s.playerId, amount: 1 });
        ap(fx);
        log(ctx, p, roll < v.accept ? 'pays' : 'haggled', roll < v.accept ? `${o.name} pays ${fmt(rate)} a week. Nothing will happen to the place.` : `${o.name} haggled ${whoName === 'You' ? 'you' : whoName} down to ${fmt(rate)} a week, and pays.`);
      } else {
        rec.stance = 'refused'; rec.since = s.week;
        W.stats.refused++;
        rec.pride += 3;
        log(ctx, p, 'refused', `${o.name} said no${o.traits.includes('Hothead') ? ' and showed the bat' : ''}. ${o.protector.kind === 'rival' ? `${FACTION_NAMES[o.protector.rival]} will hear you asked.` : 'What happens next is up to you.'}`);
        if (o.protector.kind === 'rival') ap(rivalFx(o, p, -3, 0, `Asked ${p.name} for an envelope`));
      }
      break;
    }
    case 'scheme': {
      const v = schemeView(s, p, a.scheme, a.who);
      const yes = p.mine || rand(r) < v.odds;
      if (!yes) {
        rec.pride += 2;
        if (rec.stance !== 'pays') { rec.stance = 'refused'; rec.since = s.week; W.stats.refused++; }
        log(ctx, p, 'refused', `${o.name} would not go along with ${v.title.toLowerCase()}${rec.stance === 'refused' ? ', and showed your man the door' : ''}.`);
        break;
      }
      const fx: Effect[] = [];
      if (v.cost && v.def.kind !== 'loan') fx.push({ type: 'money', amount: -v.cost, category: 'street' });
      if (v.def.heat.local) fx.push({ type: 'heat', bar: 'local', amount: v.def.heat.local });
      if (v.def.heat.federal) fx.push({ type: 'heat', bar: 'federal', amount: v.def.heat.federal });
      if (a.scheme === 'noshow') fx.push({ type: 'crewOpinion', amount: 1, reason: 'A paycheck for doing nothing' });
      fx.push(...rivalFx(o, p, v.def.group === 'extra' || v.def.group === 'backdoor' ? -4 : -2, 0, `Working ${p.name} on our street`));
      ap(fx);
      if (v.def.kind === 'loan') {
        const id = `l${s.nextId++}`;
        ap([{ type: 'money', amount: -v.cost, category: 'street' }]);
        s.loans.push({ id, borrower: `${o.name}, ${p.what.toLowerCase()}`, collateral: FAMILY_FRONT[p.family], collateralName: p.name, principal: v.cost, vig: v.take, risk: o.traits.includes('Gambler') ? 0.06 : 0.03, weeksLate: 0, dueWeek: s.week + 16, week: s.week });
        rec.holds.push({ id: 'vig', loanId: id, week: s.week });
        log(ctx, p, 'vig', `${o.name} took ${fmt(v.cost)} at five points. ${g('If {he} cannot pay')}, a piece of the place is yours.`);
      } else if (v.def.kind === 'stash') {
        rec.holds.push({ id: 'stash', week: s.week });
        log(ctx, p, 'stash', `A locked room at ${p.name} is yours now.`);
      } else if (v.kind) {
        addHold(ctx, p, a.scheme, holdBusiness(s, p, v.kind, `${v.title}: ${p.name}`, v.take, v.cost, v.def.weekly, a.who), label);
        log(ctx, p, a.scheme, p.mine ? `${v.title} is set up at ${p.name}.` : `${o.name} went along: ${v.title.toLowerCase()}. About ${fmt(v.take)} a week.`);
      }
      break;
    }
    case 'press': {
      const v = pressView(s, p, a.step, a.who);
      const d = v.def;
      W.stats.pressed++;
      rec.steps++;
      if (a.step === 'buyout') { buyout(ctx, p, o, v.price ?? 0); break; }
      const clean = rand(r) < v.odds / 100;
      const fx: Effect[] = [];
      if (d.cost) fx.push({ type: 'money', amount: -d.cost, category: 'street' });
      const heatK = clean ? 1 : 1.6;
      if (d.heat.local) fx.push({ type: 'heat', bar: 'local', amount: Math.round(d.heat.local * heatK) });
      if (d.heat.federal) fx.push({ type: 'heat', bar: 'federal', amount: Math.round(d.heat.federal * heatK) });
      if (!clean && who) fx.push({ type: 'evidence', charId: who.id, amount: d.evidence });
      if (who?.id === s.playerId) fx.push({ type: 'evidence', charId: s.playerId, amount: Math.max(1, Math.round(d.evidence / 3)) });
      fx.push(...rivalFx(o, p, d.rival, d.retaliate, `Went after ${p.name}, under our protection`));
      if (p.rival && clean) fx.push({ type: 'rivalResource', rival: p.rival, money: -Math.round(d.hurt * 30) });
      // The fire: what burns, and who might have been inside.
      let extra = '';
      if (a.step === 'fire' && rand(r) < v.innocents) {
        fx.push({ type: 'respect', amount: -5 }, { type: 'heat', bar: 'local', amount: 5 }, { type: 'crewOpinion', amount: -2, reason: 'Somebody innocent was hurt in that fire', traitMods: { Pious: -3 } });
        pressItem(s, { s: 'front', h: `NIGHT WATCHMAN HURT IN ${p.name.toUpperCase()} BLAZE`, b: `A man sleeping in the back of ${p.name} was carried out by firemen and taken to Burdette Tomlin Hospital. Monsignor spoke from the pulpit on Sunday about "the men who do this to our town."`, p: 95, a: 'town', fx: { resp: -2, wife: -3 } });
        extra += ' Somebody was inside: the town and the parish will not forget it.';
      }
      ap(fx);
      rec.fear += Math.round(d.fear * (clean ? 1 : 0.6));
      rec.hurt = Math.min(100, rec.hurt + Math.round(d.hurt * (clean ? 1 : 0.5)));
      if (rand(r) < d.press) paperStory(s, p, a.step, clean);
      if (a.step === 'fire' && clean) {
        burn(ctx, p, o);
        log(ctx, p, 'burned', `${p.name} burned down in the night. The fire marshal calls it suspicious.${extra}`);
        // After the fire: he sells you the ashes, or goes to the police.
        if (!p.rival && rand(r) < reactionOdds(s, p, 'fire').informant) informant(ctx, p, o, who);
        else if (!p.rival) { rec.stance = 'selling'; rec.since = s.week; }
        break;
      }
      // What he does now.
      const odds = reactionOdds(s, p, a.step, clean);
      const roll = rand(r);
      let acc = 0;
      let got: Reaction = 'holds';
      for (const k of ['pays', 'sells', 'folds', 'informant', 'fights', 'holds'] as Reaction[]) { acc += odds[k]; if (roll < acc) { got = k; break; } }
      const how = clean ? '' : `${whoName === 'You' ? 'You were' : `${whoName} was`} seen. `;
      switch (got) {
        case 'pays': {
          const rate = r5(placeTrade(s, p).gross * ASK_SHARE.fair);
          rec.stance = 'pays'; rec.since = s.week; rec.rate = rate;
          W.stats.paying++;
          addHold(ctx, p, 'protection', holdBusiness(s, p, 'protection', `Protection: ${p.name}`, rate, 0, 0.1, a.who), label);
          log(ctx, p, 'pays', `${how}${o.name} came around: ${fmt(rate)} a week from now on.${extra}`);
          break;
        }
        case 'sells': rec.stance = 'selling'; rec.since = s.week; log(ctx, p, 'selling', `${how}${o.name} has had enough: ${g('{he}')} will sell you the place, cheap.${extra}`); break;
        case 'folds': fold(ctx, p, o); log(ctx, p, 'folded', `${how}${o.name} closed ${p.name} for good.${extra}`); break;
        case 'informant': informant(ctx, p, o, who); break;
        case 'fights': fights(ctx, p, o, a.step); log(ctx, p, 'fighting', `${how}${o.name} is fighting back.${extra}`); break;
        default: log(ctx, p, 'holds', `${how}${o.name} is holding out. For now.${extra}`);
      }
      break;
    }
    case 'drop': {
      rec.stance = undefined; rec.since = s.week; rec.fear = Math.round(rec.fear / 2);
      log(ctx, p, 'dropped', `You let ${o.name} be.`);
      break;
    }
  }
}

function fold(ctx: Ctx, p: WorkPlace, o: Owner): void {
  const s = ctx.s;
  const rec = ensureRec(s, p.id);
  rec.stance = 'folded'; rec.since = s.week;
  ensureWork(s).stats.folded++;
  endHolds(ctx, p);
  const l = p.lot;
  if (l && !p.rival) {
    delete l.tenant;
    l.status = 'sale';
    l.price = Math.max(500, Math.round(marketValue(s, l) * 0.6 / 50) * 50);
  }
  pressItem(s, { s: 'business', h: `${p.name.toUpperCase()} CLOSES ITS DOORS`, b: `${o.name} has closed ${p.name} after ${3 + (hashSeed(p.id) % 25)} years. "Business is business," ${o.he} said, and would say no more. The building is for sale.`, p: 40, a: 'town' });
}

function burn(ctx: Ctx, p: WorkPlace, o: Owner): void {
  const s = ctx.s;
  const rec = ensureRec(s, p.id);
  const W = ensureWork(s);
  W.stats.burned++;
  endHolds(ctx, p);
  rec.stance = 'burned'; rec.since = s.week;
  const l = p.lot;
  if (l) {
    if (l.use) (l.past ??= []).push({ use: l.use, from: l.builtYear ?? 1955, to: s.date.y, why: 'burned' });
    delete l.use; delete l.tenant; delete l.name; delete l.operating;
    l.condition = 0;
    if (!p.rival) { l.status = 'sale'; l.price = Math.max(500, Math.round(marketValue(s, l) * 0.8 / 50) * 50); }
  }
  pressItem(s, { s: 'front', h: `FIRE GUTS ${p.name.toUpperCase()}; MARSHAL CALLS IT SUSPICIOUS`, b: `Fire swept through ${p.name} at ${p.address} early in the week. Firemen from three companies fought the blaze until dawn. The county fire marshal said the fire "did not start by itself" and asked anyone who saw a car on the block to come forward. ${o.name} could not be reached.`, p: 90, a: 'town', fx: { heat: [['local', 2]] } });
}

function informant(ctx: Ctx, p: WorkPlace, o: Owner, who: Character | undefined): void {
  const s = ctx.s;
  const rec = ensureRec(s, p.id);
  rec.stance = 'informant'; rec.since = s.week;
  ensureWork(s).stats.informants++;
  const fed = o.traits.includes('Honest') || rec.steps >= 3;
  const fx: Effect[] = [{ type: 'heat', bar: fed ? 'federal' : 'local', amount: fed ? 4 : 3 }, { type: 'evidence', charId: s.playerId, amount: who?.id === s.playerId ? 6 : 3 }];
  if (who && who.id !== s.playerId) fx.push({ type: 'evidence', charId: who.id, amount: 6 });
  applyEffects(ctx, fx.map((e) => ({ ...e, label: `${p.name}: the owner talked` })), { label: `${p.name}: the owner talked`, because: `pressed ${p.name}`, category: 'street' });
  log(ctx, p, 'informant', `${o.name} went to ${fed ? 'the FBI' : 'the police'} and named ${who && who.id !== s.playerId ? who.firstName : 'you'}. Anything you do there now is evidence.`);
}

function fights(ctx: Ctx, p: WorkPlace, o: Owner, step: PressStep): void {
  const s = ctx.s;
  const rec = ensureRec(s, p.id);
  rec.stance = 'fighting'; rec.since = s.week;
  rec.pride += 8;
  const fx: Effect[] = [];
  if (o.protector.kind === 'rival') fx.push(...rivalFx(o, p, -6, 0.5, `${o.name} came to us about you`));
  else fx.push({ type: 'heat', bar: 'local', amount: 1 });
  if (fx.length) applyEffects(ctx, fx.map((e) => ({ ...e, label: pr(`${p.name}: {he} fights back`, o.he) })), { label: pr(`${p.name}: {he} fights back`, o.he), because: `pressed ${p.name}`, category: 'street' });
  if (o.protector.kind !== 'rival' && !p.rival) pressItem(s, { s: 'spout', b: `To the men who think they can scare a ${o.he === 'she' ? 'businesswoman' : 'businessman'} on this island: I was here before you and I will be here after. — ${o.name}, ${p.name}`, p: 30, a: 'town' });
  void step;
}

function buyout(ctx: Ctx, p: WorkPlace, o: Owner, price: number): void {
  const s = ctx.s;
  const l = p.lot;
  const rec = ensureRec(s, p.id);
  if (!l || !price) return;
  const yes = rec.stance === 'selling' || rand(ensureWork(s)) < Math.min(0.9, 0.25 + rec.hurt / 150 + ownerOf(s, p).fear / 250);
  if (!yes) { log(ctx, p, 'refused', `${o.name} would not sell at ${fmt(price)}.`); return; }
  endHolds(ctx, p, (h) => h.id === 'protection' || h.id === 'skim' || h.id === 'license' || h.id === 'piece' || h.id === 'vig' || h.id === 'noshow');
  applyEffects(ctx, [{ type: 'money', amount: -price, label: `Bought out ${p.name}` }], { label: `Bought out ${p.name}`, because: `bought out ${p.name}`, category: 'street' });
  const going = !!l.tenant;
  l.status = 'sale';
  l.owner = 'private';
  l.price = price;
  commitEcon(ctx, { type: 'buyLot', lotId: l.id, going });
  rec.stance = 'sold'; rec.since = s.week;
  ensureWork(s).stats.sold++;
  pressItem(s, { s: 'business', h: `${p.name.toUpperCase()} CHANGES HANDS`, b: `${o.name} has sold ${p.name} at ${p.address}. Terms were not disclosed; neighbors say the price was low.`, p: 35, a: 'family' });
  log(ctx, p, 'sold', `${o.name} sold you ${p.name} for ${fmt(price)}.`);
}

function paperStory(s: GameState, p: WorkPlace, step: PressStep, clean: boolean): void {
  const N = p.name.toUpperCase();
  switch (step) {
    case 'loiter': pressItem(s, { s: 'spout', b: `Who are the men standing in front of ${p.name} every night? My husband won't take me there anymore. Somebody should call somebody. — A mother on ${p.address.replace(/^\d+\s*/, '')}`, p: 25, a: 'town' }); break;
    case 'stink': pressItem(s, { s: 'blotter', h: `DINERS FLEE ${N}`, b: `Patrons left ${p.name} on Saturday evening after what police described as "a foul odor of unknown origin." No one was hurt. No arrests.`, p: 30, a: 'town' }); break;
    case 'supplies': pressItem(s, { s: 'business', h: `${N} RUNS SHORT`, b: `${p.name} has been short of deliveries for a week. The owner blames "the distributors." The distributors decline to comment.`, p: 20, a: 'town' }); break;
    case 'inspector': pressItem(s, { s: 'blotter', h: `HEALTH DEPT. CITES ${N}`, b: `A city inspector cited ${p.name} for several violations this week. The owner says the place passed in the spring.`, p: 30, a: 'town' }); break;
    case 'brick': pressItem(s, { s: 'blotter', h: `WINDOW SMASHED AT ${N}`, b: `Someone threw a brick through the front window of ${p.name} at about three in the morning. ${clean ? 'No one saw anything.' : 'A neighbor reports a dark sedan.'} Police are investigating.`, p: 45, a: 'town', fx: { heat: [['local', 1]] } }); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

/** The places you work, week by week: fear and damage fade, the IRS looks at a skim, a late loan becomes a piece of the place. */
export function workWeek(ctx: Ctx): void {
  const s = ctx.s;
  const W = s.work;
  if (!W) return;
  const r: RngHolder = W;
  for (const id of Object.keys(W.places).sort()) {
    const rec = W.places[id];
    const p = placeById(s, id);
    const he = p ? ownerOf(s, p).he : 'he';
    rec.fear = Math.max(0, rec.fear - 2);
    rec.hurt = Math.max(0, rec.hurt - (rec.stance === 'refused' || rec.stance === 'fighting' ? 3 : 6));
    // Rackets you closed or sold yourself drop off the record.
    rec.holds = rec.holds.filter((h) => (h.bizId ? s.businesses.some((b) => b.id === h.bizId && b.owner === 'player') : true));
    if (rec.stance === 'pays' && !rec.holds.some((h) => h.id === 'protection')) rec.stance = undefined;
    if (rec.stance === 'informant' && s.week - (rec.since ?? s.week) >= 10) { rec.stance = 'refused'; rec.since = s.week; }
    if (!p) continue;
    for (const h of [...rec.holds]) {
      if (h.id === 'skim' && h.bizId) {
        const pAudit = 0.015 + (s.heat.federal > 40 ? 0.02 : 0);
        if (rand(r) < pAudit) {
          const b = s.businesses.find((x) => x.id === h.bizId);
          const runner = b?.staffIds?.[0];
          const fx: Effect[] = [{ type: 'heat', bar: 'federal', amount: 3 }, { type: 'removeBusiness', businessId: h.bizId }];
          if (runner) fx.push({ type: 'evidence', charId: runner, amount: 4 });
          applyEffects(ctx, fx.map((e) => ({ ...e, label: `${p.name}: an IRS audit` })), { label: `${p.name}: an IRS audit`, because: 'the skim', category: 'street' });
          rec.holds = rec.holds.filter((x) => x !== h);
          log(ctx, p, 'audit', `The IRS audited ${p.name}'s books. The skim is over, and the agents have questions.`);
        }
      }
      if (h.id === 'vig' && h.loanId) {
        const loan = s.loans.find((l) => l.id === h.loanId);
        if (!loan) { rec.holds = rec.holds.filter((x) => x !== h); log(ctx, p, 'paid', pr('{He} paid off the loan.', he)); continue; }
        if (loan.weeksLate >= 3) {
          s.loans = s.loans.filter((l) => l !== loan);
          rec.holds = rec.holds.filter((x) => x !== h);
          const take = Math.round(placeTrade(s, p).gross * 0.25 / 5) * 5;
          addHold(ctx, p, 'piece', holdBusiness(s, p, FAMILY_FRONT[p.family], `A piece of ${p.name}`, take, loan.principal, 0.05), `${p.name}: a piece of the place`);
          rec.fear += 10;
          log(ctx, p, 'piece', `${pr('{He}', he)} could not pay. A quarter of ${p.name} is yours now: about ${fmt(take)} a week.`);
        }
      }
      if (h.id === 'stash') {
        const fx: Effect[] = [{ type: 'money', amount: -40, category: 'street' }];
        if (s.week % 2 === 0 && s.heat.local > 0) fx.push({ type: 'heat', bar: 'local', amount: -1 });
        applyEffects(ctx, fx.map((e) => ({ ...e, label: `Stash room at ${p.name}` })), { label: `Stash room at ${p.name}`, because: 'the stash room', category: 'street' });
      }
    }
  }
}

/** What you run at a place, in words. */
export function holdsAt(s: GameState, id: string): { id: string; title: string; take?: number }[] {
  const rec = recOf(s, id);
  const p = placeById(s, id);
  if (!rec || !p) return [];
  const he = ownerOf(s, p).he;
  return rec.holds.map((h) => {
    const b = h.bizId ? s.businesses.find((x) => x.id === h.bizId) : undefined;
    const title = h.id === 'protection' ? `Protection: ${fmt(rec.rate ?? 0)} a week` : h.id === 'piece' ? 'A piece of the place' : h.id === 'vig' ? pr('{He} owes you money', he) : pr(WORK_BY_ID[h.id as WorkSchemeId]?.title ?? h.id, he);
    return { id: h.id, title, take: b ? Math.round(b.weeklyBase * yearMult(b.kind)) : undefined };
  });
}

export const STANCE_LABEL: Record<Stance, string> = {
  pays: 'Pays you', refused: 'Said no', selling: 'Will sell', folded: 'Closed up', informant: 'Talked to the police', fighting: 'Fighting back', sold: 'Sold to you', burned: 'Burned down',
};

/** Escalation steps in order (the UI lists them). */
export const STEPS: PressStep[] = PRESS_STEPS.map((x) => x.id);

/** Every order the sheet would show (tests and the sim). */
export function workActions(s: GameState, p: WorkPlace): PlayerAction[] {
  const who = defaultWho(s) ?? s.playerId;
  const out: PlayerAction[] = [];
  if (!p.mine) out.push({ kind: 'work', op: { op: 'pitch', place: p.id, who, ask: 'fair' } });
  for (const d of schemesFor(p)) out.push({ kind: 'work', op: { op: 'scheme', place: p.id, scheme: d.id, who } });
  if (pressOpen(s, p)) for (const st of STEPS) out.push({ kind: 'work', op: { op: 'press', place: p.id, step: st, who } });
  return out;
}

