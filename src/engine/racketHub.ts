import { CATALOG } from './catalog';
import { countKind, expectedTake, idleMen, newBusiness, owned } from './business';
import { canHold } from './earners';
import { isInSeason } from './calendar';
import { LAW_DEFS as LAWS } from './polData';
import { inForce } from './polLaws';
import { RACKETS, type RacketInfo } from './racketData';
import { bestDistrict, bestRunner, startLocks } from './racketLife';
import { nextStep, tree } from './rackets';
import { CUT_INFO } from './earsState';
import type { Business, BusinessKind, Character, GameState, PlayerAction } from './types';

/**
 * The Rackets hub, as data for the screen: every racket as a card (what it
 * is, what it takes, what it pays, the heat, the ladder, who runs it, the
 * law), the locks with how to open them, and "Which racket should I start?"
 * ranked for the situation right now with the reasons. Pure: never mutates.
 */

/** Hub order: the rackets a new boss can start first come first. */
export const HUB_ORDER: BusinessKind[] = ['protection', 'numbers', 'bookmaking', 'cardgame', 'loansharking', 'cigarettes', 'bootleg', 'afterhours', 'court', 'fencing', 'cargo', 'chopshop', 'bidrig', 'labor', 'insurance', 'washing', 'taxdodge', 'bustout', 'blackmail', 'jewel', 'bankcrew', 'stag', 'guns', 'counterfeit', 'payoff', 'vice', 'narcotics'];

export interface HubCard {
  kind: BusinessKind;
  name: string;
  line: string;
  pays: string;
  cost: number;
  /** ~ weekly take in season / off-season, as bought. */
  inSeason: number;
  offSeason: number;
  /** Earns by the score: the take is an average of big, rare scores. */
  byScore?: boolean;
  upkeep: number;
  /** Local heat a week, rounded for display (0.3 = "some"). */
  heat: number;
  fed: number;
  men: number;
  ladder: string[];
  owned: Business[];
  locks: { why: string; how: string }[];
  /** Soft warnings (Philadelphia forbids it, no free men ...). */
  warns: string[];
  laws: string[];
  start?: PlayerAction;
  /** The Madam's arrangement is not a place you own. */
  madam?: boolean;
}

const START = (kind: BusinessKind): PlayerAction => ({ kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind } } });

/** Laws on the books that touch a racket, in plain words. */
export function lawsFor(s: GameState, kind: BusinessKind): string[] {
  const out: string[] = [];
  for (const l of LAWS) {
    if (!inForce(s, l.id)) continue;
    for (const e of l.effects) if (e.kind === 'income' && e.biz.includes(kind)) out.push(`${l.name}: take ${e.pct > 0 ? '+' : ''}${e.pct}%`);
  }
  return out;
}

/** The card's two numbers: racketWeek's, after upkeep. */
function hubTake(s: GameState, kind: BusinessKind): { inSeason: number; offSeason: number; byScore?: boolean } {
  const w = racketWeek(s, kind);
  return { inSeason: w.inSeason, offSeason: w.offSeason, ...(w.byScore ? { byScore: true } : {}) };
}

export function hubCards(s: GameState): HubCard[] {
  return HUB_ORDER.map((kind) => {
    const def = CATALOG[kind];
    const info = RACKETS[kind];
    if (kind === 'vice') return madamCard(s);
    const warns: string[] = [];
    if (kind === 'narcotics') warns.push('Philadelphia forbids it. When they find out, there is a reckoning.');
    const men = idleMen(s).length;
    if (def.staff > men) warns.push(`Needs ${def.staff} free m${def.staff > 1 ? 'en' : 'an'} to run it at full speed (you have ${men} free); short-handed it makes 40%.`);
    if (info?.pairs?.length && !info.pairs.some((k) => countKind(s, k))) warns.push(`Better with ${info.pairs.map((k) => CATALOG[k].name.toLowerCase()).join(' or ')}.`);
    const locks = startLocks(s, kind);
    return {
      kind, name: def.name, line: info?.line ?? def.blurb, pays: info?.pays ?? '', cost: def.cost,
      ...hubTake(s, kind), upkeep: def.upkeep,
      heat: def.heat, fed: def.fedHeat, men: def.staff, ladder: tree(kind).map((t) => t.name),
      owned: owned(s).filter((b) => b.kind === kind), locks, warns, laws: lawsFor(s, kind),
      start: kind === 'narcotics' ? undefined : START(kind),
    };
  });
}

/**
 * THE weekly estimate of a racket, the one every screen shows (the Rackets card, the order's chips, the
 * advisors' reads start from it): as it would run now (the best man, the best district), after upkeep,
 * this week and in the other season. `inSeason`/`offSeason` are the same two numbers by season.
 */
export function racketWeek(s: GameState, kind: BusinessKind, district?: string, runnerId?: string): { weekly: number; other: number; inSeason: number; offSeason: number; byScore?: string } {
  const def = CATALOG[kind];
  const inS = isInSeason(s.date);
  const out = (weekly: number, other: number, byScore?: string) => ({ weekly, other, inSeason: inS ? weekly : other, offSeason: inS ? other : weekly, ...(byScore ? { byScore } : {}) });
  if (kind === 'jewel') return { weekly: inS ? 1200 : 480, other: inS ? 480 : 1200, inSeason: 1200, offSeason: 480, byScore: 'an average: big, rare scores' };
  if (kind === 'bankcrew') return out(735, 735, 'an average: huge, rare scores');
  if (kind === 'bustout') return out(0, 0, `nothing for 6 weeks, then one score of about $${Math.round(def.cost * 3.1).toLocaleString('en-US')}`);
  if (kind === 'payoff') return out(-def.upkeep, -def.upkeep, 'a cost: every racket\'s heat runs 0.6 a week cooler');
  const d = district ?? bestDistrict(s, kind) ?? s.districts.find((x) => (x.influence.player ?? 0) > 0)?.id ?? s.districts[0].id;
  const b = newBusiness(s, kind, d);
  const pick = runnerId ? s.characters[runnerId] : undefined;
  const man = pick && !canHold(s, pick) ? pick : bestRunner(s, kind);
  b.staffIds = def.staff ? [man?.id, ...idleMen(s).filter((c) => c.id !== man?.id).map((c) => c.id)].filter((x): x is string => !!x).slice(0, def.staff) : [];
  const take = expectedTake(s, b);
  const [a, z] = def.season;
  const ratio = (inS ? z : a) / Math.max(0.01, inS ? a : z);
  return out(Math.round(take - def.upkeep), Math.round(take * ratio - def.upkeep));
}

/** Crews that work by the score show their average week (jewel: 30% a week in season, 12% off, ~$4,000 a case; bank: 7%, ~$10,500). */
export function crewTake(kind: BusinessKind, inS: number, off: number): { inSeason: number; offSeason: number; byScore?: boolean } {
  if (kind === 'jewel') return { inSeason: 1200, offSeason: 480, byScore: true };
  if (kind === 'bankcrew') return { inSeason: 735, offSeason: 735, byScore: true };
  return { inSeason: Math.round(inS), offSeason: Math.round(off) };
}

/** The Madam's arrangement: protection for her network, for a cut (ears.ts runs it). */
function madamCard(s: GameState): HubCard {
  const M = s.ears?.madam;
  const mc = M ? s.characters[M.id] : undefined;
  const cut = M ? CUT_INFO[M.cut] : undefined;
  const locks = !mc?.alive ? [{ why: 'There is no Madam on the island right now', how: 'Her successor takes over the house in time.' }] : [];
  return {
    kind: 'vice', madam: true, name: 'The Madam\'s arrangement',
    line: `Protection for the Madam's independent network, for a cut. She runs her houses and her people; the family runs nobody.`,
    pays: cut ? `${cut.name} now: about $${cut.weekly}/wk, more in season, more when her network grows.` : 'A protection cut, set with her.',
    cost: 0, inSeason: Math.round((cut?.weekly ?? 0) * 1.25), offSeason: Math.round((cut?.weekly ?? 0) * 0.75), upkeep: 0,
    heat: 0.05 * (M?.cut ?? 0), fed: 0, men: 0, ladder: ['No cut', 'A light cut', 'The standard cut', 'A heavy cut'],
    owned: [], locks, warns: M && M.cut >= 3 ? ['A heavy cut sours her on you, month after month.'] : [], laws: lawsFor(s, 'vice'),
  };
}

/* ------------------------------------------------------------------ */
/* Which racket should I start?                                        */
/* ------------------------------------------------------------------ */

export interface RacketPick {
  kind: BusinessKind;
  score: number;
  reasons: { label: string; value: number }[];
}

/** Startable rackets ranked for right now, best first, with the reasons. */
export function whichRacket(s: GameState): RacketPick[] {
  const out: RacketPick[] = [];
  const summer = isInSeason(s.date);
  const heatNow = s.heat.local + s.heat.federal;
  for (const kind of HUB_ORDER) {
    if (kind === 'vice' || kind === 'narcotics' || kind === 'bustout' || kind === 'payoff') continue;
    if (startLocks(s, kind).length) continue;
    const def = CATALOG[kind];
    const info = RACKETS[kind] as RacketInfo;
    const reasons: { label: string; value: number }[] = [];
    const ct = crewTake(kind, def.base * def.season[0], def.base * def.season[1]);
    const avg = (ct.inSeason + ct.offSeason) / 2;
    const payback = def.cost / Math.max(1, avg - def.upkeep);
    reasons.push({ label: `Pays back in ~${Math.round(payback)} wks`, value: Math.round(Math.max(-20, 30 - payback)) });
    if (def.season[1] >= 0.8) reasons.push({ label: 'Earns through the winter', value: summer ? 4 : 10 });
    else if (!summer) reasons.push({ label: 'Slow until Memorial Day', value: -6 });
    const have = countKind(s, kind);
    if (!have) reasons.push({ label: 'Something new for the family', value: 8 });
    else reasons.push({ label: `You already run ${have}`, value: -12 * have });
    if (info.pairs?.some((k) => countKind(s, k))) reasons.push({ label: `Works with your ${CATALOG[info.pairs.find((k) => countKind(s, k))!].name.toLowerCase()}`, value: 12 });
    if (['numbers', 'bookmaking', 'cardgame'].includes(kind) && owned(s).filter((b) => CATALOG[b.kind].category === 'racket').length < 3) reasons.push({ label: 'A first racket every crew knows how to run', value: 6 });
    const free = idleMen(s).length;
    if (def.staff > 1 && free < def.staff) reasons.push({ label: `Needs ${def.staff} men, ${free} free`, value: -8 * (def.staff - free) });
    if (def.fedHeat >= 0.15) reasons.push({ label: 'The FBI takes an interest', value: -Math.round(def.fedHeat * 80) });
    const h = def.heat * 30;
    if (heatNow > 60 && h > 6) reasons.push({ label: 'The heat is already up', value: -Math.round(h) });
    else if (h > 12) reasons.push({ label: 'Draws heat', value: -Math.round(h / 2) });
    const man = bestRunner(s, kind);
    if (!man && def.staff) reasons.push({ label: 'Nobody free to run it', value: -15 });
    else if (man) reasons.push({ label: `${man.firstName} would run it (${info.fit} ${man.attributes[info.fit]})`, value: Math.round((man.attributes[info.fit] - 50) / 5) });
    if (s.money < def.cost * 2) reasons.push({ label: 'Takes most of your cash', value: -8 });
    const laws = lawsFor(s, kind);
    if (laws.length) reasons.push({ label: laws[0], value: -6 });
    out.push({ kind, score: reasons.reduce((a, r) => a + r.value, 0), reasons });
  }
  return out.sort((a, b) => b.score - a.score || (a.kind < b.kind ? -1 : 1));
}

/** One-line status of a racket you run: who runs it, under which capo, this week. */
export function runningLine(s: GameState, b: Business): { runner?: Character; capo?: Character; take: number; district: string } {
  const runner = (b.staffIds ?? []).map((id) => s.characters[id]).find((c) => c?.alive);
  const d = s.districts.find((x) => x.id === b.districtId);
  const capo = d?.capoId ? s.characters[d.capoId] : undefined;
  return { runner, capo: capo?.alive ? capo : undefined, take: expectedTake(s, b), district: d?.name ?? '' };
}

/** The ladder's next step for a racket you run (for the card's one-click). */
export function nextOf(s: GameState, b: Business) {
  return nextStep(s, b);
}

export { bestDistrict };
