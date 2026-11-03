import { CATALOG, seasonalMult } from './catalog';
import { isInSeason } from './calendar';
import { countKind, idleMen, isBusy, owned } from './business';
import { capos, isFree } from './characters';
import { CUT_INFO, type CutTier } from './earsState';
import { canHold, earnerOf, EARNER_STEADY, steadyWord, yearMult } from './earners';
import { lawsFor, racketWeek } from './racketHub';
import { bestDistrict, bestRunner, startLocks } from './racketLife';
import { racketInfo, type Fit } from './racketData';
import { opinion } from './relations';
import { ZONES_BY_ID } from './property';
import type { BusinessKind, Character, GameState, PlayerAction } from './types';

/**
 * "START A RACKET": every classic operation in five plain groups, each a
 * three-step start (what -> who runs it -> where) and one plain summary:
 * the cost, the weekly take, the heat, the risk and who objects. Pure, for
 * the screen (src/ui/econ/StartRacket.tsx); the order it builds is the
 * racket engine's own `{ c: 'start' }` (racketLife.ts).
 *
 * Abstract on purpose: money, heat, odds and who objects; never method.
 * The Madam's arrangement is her network, protected for a cut: the family
 * runs nobody, and "starting" it means agreeing a cut with her.
 */

export type MenuGroup = 'street' | 'vice' | 'contraband' | 'system' | 'payoffs';

export const MENU_GROUPS: { id: MenuGroup; icon: string; label: string; blurb: string }[] = [
  { id: 'street', icon: '💵', label: 'Street money', blurb: 'Envelopes, the numbers, the book, the shylock, card games, the machines.' },
  { id: 'vice', icon: '🌙', label: 'Vice', blurb: 'The Madam\'s arrangement, after-hours rooms, untaxed liquor and smokes, stag reels.' },
  { id: 'contraband', icon: '📦', label: 'Contraband', blurb: 'Dope, guns, hot goods, hijacked loads, stolen cars, funny money.' },
  { id: 'system', icon: '🏛', label: 'Working the system', blurb: 'Unions, bids, concrete, carting, claims, bust-outs, the books.' },
  { id: 'payoffs', icon: '🤝', label: 'Payoffs & protection', blurb: 'The pad, the sit-down court, the files on officials.' },
];

export type MenuKey = BusinessKind | 'madam';

export interface MenuItemDef {
  key: MenuKey;
  group: MenuGroup;
  icon: string;
  title: string;
  /** What it does, in one line. */
  line: string;
  /** Who objects. */
  objects: string;
  /** The risk, in a few words. */
  risk: string;
  /** "Good first racket": cheap, low risk, a new boss can start it in week 1. */
  first?: boolean;
}

const I = (key: MenuKey, group: MenuGroup, icon: string, title: string, line: string, objects: string, risk: string, first?: boolean): MenuItemDef => ({ key, group, icon, title, line, objects, risk, first });

export const MENU: MenuItemDef[] = [
  I('protection', 'street', '🏪', 'Protection', 'Shops and bars on a block pay a weekly envelope.', 'The shopkeepers, if you lean too hard', 'complaints to the precinct', true),
  I('numbers', 'street', '🎟', 'Numbers bank', 'The working man\'s lottery: a penny a play, every day.', 'The vice squad (a pad fixes most of it)', 'a hot number that hits', true),
  I('loansharking', 'street', '💰', 'Shylock book', 'Money on the street at points a week.', 'Borrowers who go to the police', 'defaults'),
  I('bookmaking', 'street', '📞', 'Bookmaking', 'A wire room: horses, fights, ballgames.', 'The vice squad; the Wire Act from 1961', 'a bad Saturday'),
  I('cardgame', 'street', '🃏', 'Card & dice game', 'A floating game; the house takes a cut of every pot.', 'Sore losers and their wives', 'a raid, a scandal'),
  I('vending', 'street', '🎰', 'Jukebox & machine route', 'Jukeboxes, pinball and cigarette machines in every bar.', 'Rival routes', 'competition'),
  I('madam', 'vice', '🕶', 'The Madam\'s arrangement', 'Protection for her independent escort network, for a cut. She runs it.', 'The vice squad; the church, if it is loud', 'vice heat'),
  I('afterhours', 'vice', '🔔', 'After-hours club', 'A bar that pours after legal closing time.', 'The state liquor board', 'a raid'),
  I('bootleg', 'vice', '🥃', 'Untaxed liquor', 'Cases with no tax stamp, sold to the bars cheap.', 'The Treasury\'s tax men', 'a seizure'),
  I('cigarettes', 'vice', '🚬', 'Untaxed cigarettes', 'Cartons from where the tax is low.', 'The state tax office, barely', 'very little', true),
  I('stag', 'vice', '🎞', 'Stag-film route', 'Reels in plain cans for private clubs.', 'Postal inspectors', 'federal interest'),
  I('narcotics', 'contraband', '☠', 'Narcotics (the forbidden one)', 'Dope through the docks to outside buyers. Philadelphia forbids it.', 'Philadelphia, your own old-timers, federal narcotics agents', 'a rat, a reckoning'),
  I('guns', 'contraband', '🧰', 'Guns', 'Crates off the trucks and boats, sold out of state.', 'Federal agents; Philadelphia frowns', 'a federal case'),
  I('fencing', 'contraband', '💎', 'Fence', 'Buys what fell off a truck and sells it far away.', 'The state police (stings)', 'a sting'),
  I('cargo', 'contraband', '🚛', 'Hijacking & cargo', 'Loads that go missing off the docks, Route 9 and the Parkway.', 'The Waterfront Commission', 'a man arrested'),
  I('chopshop', 'contraband', '🔧', 'Chop shop', 'Stolen cars in whole, out as parts.', 'The state police', 'a warrant'),
  I('counterfeit', 'contraband', '🖨', 'Counterfeit bills & stamps', 'Funny money passed far from the island.', 'The Secret Service', 'a federal case'),
  I('jewel', 'contraband', '🪜', 'Jewel-thief crew', 'Second-story men who work the summer cottages.', 'The state police', 'big, rare scores'),
  I('bankcrew', 'contraband', '🏦', 'Bank-robbery crew', 'Out-of-town banks. Huge, rare, federal.', 'The FBI', 'the FBI'),
  I('labor', 'system', '🛠', 'Labor racketeering', 'A union local: labor peace, no-show jobs, the welfare fund.', 'Reformers, federal labor auditors', 'an election lost'),
  I('bidrig', 'system', '📐', 'Bid-rigging', 'Contractors take turns low-bidding; the family takes a point.', 'The state auditor', 'an audit'),
  I('concrete', 'system', '🧱', 'Concrete & ready-mix', 'Every foundation on the island poured by your trucks.', 'Nobody much', 'slow money'),
  I('waste', 'system', '🗑', 'Garbage carting', 'Every restaurant\'s cans, one carter.', 'Nobody much', 'slow money'),
  I('insurance', 'system', '📋', 'Insurance fraud', 'An adjuster on the arrangement; claims get paid.', 'Insurance investigators', 'an adjuster who talks'),
  I('bustout', 'system', '📉', 'Bust-out', 'Run up a failing store\'s credit, empty it, let it go under. One score.', 'Creditors, a bankruptcy trustee', 'heat when it folds'),
  I('washing', 'system', '🧺', 'Money laundering', 'Other outfits\' money through your books, for a fee.', 'Federal auditors', 'very little'),
  I('taxdodge', 'system', '🧾', 'False invoices', 'A front\'s books that show less than it made.', 'The IRS, eventually', 'an audit'),
  I('payoff', 'payoffs', '👮', 'The pad', 'A cop, an inspector, a zoning man on an envelope: every racket runs cooler.', 'Nobody (that is the point)', 'none; it costs money'),
  I('court', 'payoffs', '⚖', 'The sit-down court', 'Settle local operators\' disputes for a fee.', 'Nobody', 'none to speak of'),
  I('blackmail', 'payoffs', '📷', 'Files on officials', 'Hotel registers and a camera: officials turned into favors.', 'The men in the files', 'enemies'),
];

export const MENU_BY_KEY = Object.fromEntries(MENU.map((m) => [m.key, m])) as Record<MenuKey, MenuItemDef>;

export interface MenuRow extends MenuItemDef {
  cost: number;
  /** ~ weekly take this season, as it would run (0 for the pad: it is a cost). */
  weekly: number;
  steady: boolean;
  heat: 'none' | 'low' | 'some' | 'high';
  locked?: string;
  running: number;
}

const heatWord = (h: number): MenuRow['heat'] => (h >= 0.45 ? 'high' : h >= 0.25 ? 'some' : h > 0.03 ? 'low' : 'none');

/** One group's rows, cheapest to start first. Pure. */
export function menuRows(s: GameState, group: MenuGroup): MenuRow[] {
  return MENU.filter((m) => m.group === group).map((m) => row(s, m)).sort((a, b) => a.cost - b.cost || (a.title < b.title ? -1 : 1));
}

function row(s: GameState, m: MenuItemDef): MenuRow {
  if (m.key === 'madam') {
    const M = s.ears?.madam;
    const alive = !!(M && s.characters[M.id]?.alive);
    const next = M ? (Math.min(3, M.cut + 1) as CutTier) : 1;
    return { ...m, cost: 0, weekly: CUT_INFO[next].weekly, steady: false, heat: 'low', locked: !alive ? 'There is no Madam on the island right now' : M!.cut >= 3 ? 'Her cut is already as heavy as it goes' : undefined, running: M && M.cut > 0 ? 1 : 0 };
  }
  const def = CATALOG[m.key];
  const locks = startLocks(s, m.key);
  return { ...m, cost: def.cost, weekly: estimate(s, m.key).weekly, steady: steadyWord(m.key) === 'steady', heat: heatWord(def.heat + def.fedHeat), locked: locks[0]?.why, running: countKind(s, m.key) };
}

/** What it would make a week now, as it would run (the best man, the best district), and in the other season: racketWeek (racketHub.ts), the one estimate. */
export function estimate(s: GameState, kind: BusinessKind, district?: string, runnerId?: string): { weekly: number; other: number; byScore?: string } {
  const w = racketWeek(s, kind, district, runnerId);
  return { weekly: w.weekly, other: w.other, ...(w.byScore ? { byScore: w.byScore } : {}) };
}

/* ------------------------------------------------------------------ */
/* Who runs it                                                         */
/* ------------------------------------------------------------------ */

export interface RunnerChoice {
  c: Character;
  role: 'boss' | 'capo' | 'soldier' | 'associate';
  /** His attribute for this racket (0-100). */
  skill: number;
  fit: Fit;
  /** What he thinks of you (undefined for the boss). */
  loyalty?: number;
  /** Rackets he already runs or holds. */
  load: number;
  /** He has no steady earner yet: this can be his. */
  canEarn: boolean;
  best?: boolean;
  note: string;
}

/** Everybody who could run it: you, your capos, and the free soldiers and associates. Best fit first within each rank. */
export function runnersFor(s: GameState, kind: BusinessKind): RunnerChoice[] {
  const fit = racketInfo(kind)?.fit ?? 'business';
  const best = bestRunner(s, kind);
  const loadOf = (c: Character) => owned(s).filter((b) => (b.staffIds ?? []).includes(c.id)).length + (earnerOf(s, c.id) ? 1 : 0);
  const out: RunnerChoice[] = [];
  const boss = s.characters[s.playerId];
  const earnable = steadyWord(kind) !== 'scores';
  if (boss?.alive) out.push({ c: boss, role: 'boss', skill: boss.attributes[fit], fit, load: loadOf(boss), canEarn: earnable && !earnerOf(s, boss.id), note: earnerOf(s, boss.id) ? 'You already have your own earner' : earnable ? 'Yours: your piece of it pays into your Pocket' : 'You keep an eye on it' });
  for (const k of capos(s).filter((c) => c.faction === 'player' && isFree(s, c)).sort((a, b) => b.attributes[fit] - a.attributes[fit] || (a.id < b.id ? -1 : 1))) {
    const has = earnerOf(s, k.id);
    out.push({ c: k, role: 'capo', skill: k.attributes[fit], fit, loyalty: opinion(s, k.id, s.playerId), load: loadOf(k), canEarn: earnable && !has, note: has ? `Already has his ${has.name}` : earnable ? 'No steady earner yet: this could be his' : 'His crew runs it' });
  }
  for (const m of idleMen(s).sort((a, b) => b.attributes[fit] - a.attributes[fit] || (a.id < b.id ? -1 : 1))) {
    out.push({ c: m, role: m.rank === 'soldier' ? 'soldier' : 'associate', skill: m.attributes[fit], fit, loyalty: opinion(s, m.id, s.playerId), load: loadOf(m), canEarn: false, best: m.id === best?.id, note: isBusy(s, m) ? 'Busy this week' : 'Free to run it' });
  }
  return out;
}

/** The default pick: a capo with no earner when this would make a good one, else the best-fit free man, else you. */
export function defaultRunner(s: GameState, kind: BusinessKind): RunnerChoice | undefined {
  const all = runnersFor(s, kind);
  if (steadyWord(kind) === 'steady') {
    const k = all.find((r) => r.role === 'capo' && r.canEarn);
    if (k) return k;
  }
  return all.find((r) => r.best) ?? all.find((r) => r.role === 'capo') ?? all[0];
}

/* ------------------------------------------------------------------ */
/* Where                                                               */
/* ------------------------------------------------------------------ */

export interface WhereChoice { id: string; name: string; control: number; capo?: string; same: number; best: boolean }

export function whereFor(s: GameState, kind: BusinessKind): WhereChoice[] {
  const best = bestDistrict(s, kind);
  return s.districts.filter((d) => (d.influence.player ?? 0) >= 20 && fits(s, kind, d.id)).map((d) => {
    const capo = d.capoId ? s.characters[d.capoId] : undefined;
    return { id: d.id, name: d.name, control: Math.round(d.influence.player ?? 0), capo: capo?.alive ? `${capo.firstName} ${capo.lastName}` : undefined, same: owned(s).filter((b) => b.districtId === d.id && b.kind === kind).length, best: d.id === best };
  }).sort((a, b) => Number(b.best) - Number(a.best) || b.control - a.control);
}

function fits(s: GameState, kind: BusinessKind, districtId: string): boolean {
  // A district fits if, restricted to it, bestDistrict would pick it.
  const only = { ...s, districts: s.districts.filter((d) => d.id === districtId) } as GameState;
  return bestDistrict(only, kind) === districtId;
}

/* ------------------------------------------------------------------ */
/* The summary                                                         */
/* ------------------------------------------------------------------ */

export interface StartSummary {
  title: string;
  cost: number;
  weekly: number;
  other: number;
  byScore?: string;
  /** As a steady earner: the same every week, summer and winter. */
  steady?: boolean;
  heat: MenuRow['heat'];
  federal: MenuRow['heat'];
  risk: string;
  objects: string;
  /** Philadelphia / the Commission's view, in one line. */
  philly: string;
  /** The hard trade-offs, plainly (narcotics, guns ...). */
  warns: string[];
  laws: string[];
  locks: { why: string; how: string }[];
  earner?: string;
  action?: PlayerAction;
}

const PHILLY: Partial<Record<BusinessKind, string>> = {
  narcotics: 'Forbidden. Philadelphia\'s rule is no dope, and when they find out there is a reckoning.',
  guns: 'Tolerated, quietly. If the crates end up in the newspapers, Philadelphia likes you less every month.',
  counterfeit: 'Tolerated, but nobody in Philadelphia will help you when the Secret Service comes.',
  bankcrew: 'They think it is a young man\'s game, and federal.',
  labor: 'Needs the Table\'s blessing: the unions are Philadelphia\'s business too.',
  bidrig: 'Needs the Table\'s blessing.',
  bookmaking: 'They like it when you lay big bets off to their book.',
  numbers: 'Fine by them. Everybody runs numbers.',
  court: 'They approve: a family that keeps the peace is a family that earns.',
  payoff: 'They approve. Everybody pays somebody.',
};

export function startSummary(s: GameState, key: MenuKey, runnerId?: string, district?: string, earner = true): StartSummary {
  const m = MENU_BY_KEY[key];
  if (key === 'madam') {
    const M = s.ears?.madam;
    const next = M ? (Math.min(3, M.cut + 1) as CutTier) : 1;
    const alive = !!(M && s.characters[M.id]?.alive);
    return {
      title: m.title, cost: 0, weekly: CUT_INFO[next].weekly, other: Math.round(CUT_INFO[next].weekly * 0.6), heat: 'low', federal: 'none', risk: m.risk, objects: m.objects,
      philly: 'Not their business. The Madam runs her own house; the family only protects it.',
      warns: ['She runs her houses and her people. They are adults working for themselves and for her; the family protects the network and takes a cut. A heavy cut sours her on you.'],
      laws: lawsFor(s, 'vice'),
      locks: !alive ? [{ why: 'There is no Madam on the island right now', how: 'Her successor takes over the house in time.' }] : M!.cut >= 3 ? [{ why: 'Her cut is already as heavy as it goes', how: 'Ease it in Holdings › The Rackets.' }] : [],
      action: alive && M!.cut < 3 ? { kind: 'ears', op: { op: 'madamCut', tier: next } } : undefined,
    };
  }
  const kind = key;
  const def = CATALOG[kind];
  const est = estimate(s, kind, district, runnerId);
  const pick = runnerId ? s.characters[runnerId] : undefined;
  const holder = pick && canHold(s, pick) ? pick : undefined;
  const asEarner = !!holder && earner && steadyWord(kind) !== 'scores' && !earnerOf(s, holder.id);
  const warns: string[] = [];
  if (kind === 'narcotics') warns.push('The trade-off: the most money on the island, and the most heat. Federal agents watch the docks, a man on the pipeline can be picked up and talk, your own old-timers think less of you (crew −3), and Philadelphia forbids it outright.');
  if (kind === 'guns') warns.push('Federal business: every crate is a federal case if it goes wrong.');
  if (kind === 'bustout') warns.push('One-shot: the store is finished when it pays.');
  if (kind === 'payoff') warns.push('It earns nothing. It costs $' + def.upkeep + ' a week and cools every racket you run.');
  if (def.staff > idleMen(s).length) warns.push(`Needs ${def.staff} free m${def.staff > 1 ? 'en' : 'an'} on the street (you have ${idleMen(s).length}); short-handed it makes 40%.`);
  // A steady earner pays the year's average season every week, +15%.
  const now = seasonalMult(kind, isInSeason(s.date));
  const gross = est.weekly + def.upkeep;
  const steadyWk = asEarner && now > 0 ? Math.round((gross * yearMult(kind) / now) * (1 + EARNER_STEADY) - def.upkeep) : undefined;
  return {
    title: m.title, cost: def.cost, weekly: steadyWk ?? est.weekly, other: steadyWk ?? est.other, byScore: est.byScore, steady: steadyWk !== undefined,
    heat: heatWord(def.heat), federal: heatWord(def.fedHeat), risk: m.risk, objects: m.objects,
    philly: PHILLY[kind] ?? 'Nothing to say: it is your island.',
    warns, laws: lawsFor(s, kind), locks: startLocks(s, kind),
    earner: asEarner ? (holder!.id === s.playerId ? 'Your own steady earner: your piece (half) pays straight into your Pocket every week, no swings; the rest goes to the Family.' : `${holder!.firstName}'s steady earner: he keeps 15%, kicks up the rest every week, and is more loyal for it.`) : undefined,
    action: { kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind, ...(district ? { district } : {}), ...(runnerId ? { runner: runnerId } : {}), ...(asEarner ? { earner: true } : {}) } } },
  };
}

/* ------------------------------------------------------------------ */
/* "Start a racket here" (Walk and Street cards), and what is missing   */
/* ------------------------------------------------------------------ */

/** A place on the island (a zone or a district id) as the district a racket would open in, with the cheapest kinds that fit there now. */
export function placeStart(s: GameState, place: string | undefined): { district: string; name: string; picks: MenuRow[] } | undefined {
  if (!place) return undefined;
  const district = s.districts.some((d) => d.id === place) ? place : (ZONES_BY_ID as Record<string, { district?: string } | undefined>)[place]?.district;
  const d = district ? s.districts.find((x) => x.id === district) : undefined;
  if (!d) return undefined;
  const picks: MenuRow[] = [];
  for (const g of MENU_GROUPS) for (const r of menuRows(s, g.id)) {
    if (r.key === 'madam' || r.locked) continue;
    if (!fits(s, r.key, d.id)) continue;
    picks.push(r);
  }
  picks.sort((a, b) => Number(!!b.first) - Number(!!a.first) || a.cost - b.cost);
  return picks.length ? { district: d.id, name: d.name, picks: picks.slice(0, 3) } : undefined;
}

/** Why the boss should start a racket now: too few rackets, or men without a steady earner. Pure. */
export function racketGaps(s: GameState): { rackets: number; noEarner: Character[] } {
  const rackets = owned(s).filter((b) => CATALOG[b.kind].category === 'racket').length + (s.ears?.madam && s.ears.madam.cut > 0 ? 1 : 0);
  const noEarner = [s.characters[s.playerId], ...capos(s).filter((c) => c.faction === 'player')].filter((c) => c && canHold(s, c) && !earnerOf(s, c.id));
  return { rackets, noEarner };
}
