import { payFromPersonal } from './tribute';
import { pocketPrice } from './pocket';
import type { ActionPreview } from './actions';
import { ensureEcon } from './econState';
import { fmtMoney } from './effects';
import { heat, type Ctx } from './ledger';
import { inflation } from './property';
import { chance } from './rng';
import type { Effect, GameState, RivalId } from './types';

/**
 * The Good Life: what the boss buys for himself and the house (separate from
 * gifts). Homes from a rowhouse to a mansion on the bay, a garage of period
 * cars, trucks (the trucking outfit uses them), a boat at Otten's Harbor, and
 * the toys of the age — a hi-fi, a jukebox, a color TV once there is color to
 * watch, a racehorse, a fur for the wife.
 *
 * Each thing buys respect, the family's good opinion and some peace of mind,
 * and costs upkeep. It holds some of its value when sold, and it belongs to
 * the house, so it passes to the heir. The risk: conspicuous wealth. A man
 * with no explainable income and a Cadillac draws the IRS (federal heat),
 * rivals notice, and after RICO (October 1970) the government can seize what
 * it can tie to the rackets.
 */

export type LuxCat = 'home' | 'car' | 'truck' | 'boat' | 'toy';

export interface LuxItem {
  id: string;
  name: string;
  cat: LuxCat;
  /** 1960 dollars (inflated by year). */
  price: number;
  blurb: string;
  minYear?: number;
  maxYear?: number;
  /** Weekly upkeep (1960 dollars). */
  upkeep: number;
  respect: number;
  family: number;
  /** Stress the boss sheds when he buys it. */
  relief: number;
  /** Resale: share of the price, and how much it loses each year (cars) or gains (homes). */
  resale: number;
  drift: number;
  /** Where it shows on the map (homes and the boat). */
  pin?: { lat: number; lon: number; place: string };
  /** One per house (homes are each unique; cars can be several). */
  unique?: boolean;
}

export const LUX: LuxItem[] = [
  { id: 'rowhouse', name: 'A rowhouse on Pacific Avenue', cat: 'home', price: 6500, blurb: 'Two bedrooms over a stoop. Where everybody starts.', upkeep: 8, respect: 0, family: 2, relief: 2, resale: 0.95, drift: 0.02, unique: true, pin: { lat: 38.9905, lon: -74.8165, place: 'Wildwood' } },
  { id: 'cresthouse', name: 'A house in the Crest', cat: 'home', price: 18000, blurb: 'A split-level on a corner lot, two blocks from the beach. The wife picks the wallpaper.', upkeep: 22, respect: 3, family: 8, relief: 6, resale: 0.95, drift: 0.03, unique: true, pin: { lat: 38.9745, lon: -74.8345, place: 'Wildwood Crest' } },
  { id: 'baymansion', name: 'A mansion on the bay', cat: 'home', price: 65000, blurb: 'Columns, a dock, a wall around it. Everybody on the island knows whose it is.', upkeep: 70, respect: 8, family: 12, relief: 8, resale: 0.9, drift: 0.03, unique: true, pin: { lat: 38.9965, lon: -74.8295, place: 'on the bay' } },
  { id: 'cottage', name: 'A shore cottage in Cape May', cat: 'home', price: 12000, blurb: 'A Victorian with a porch and a view of the lighthouse. Sundays only.', upkeep: 15, respect: 1, family: 6, relief: 8, resale: 0.95, drift: 0.04, unique: true, pin: { lat: 38.9351, lon: -74.9060, place: 'Cape May' } },
  { id: 'florida', name: 'A place in Florida', cat: 'home', price: 30000, blurb: 'A ranch house in Surfside with a pool. Where men from Philadelphia winter, and talk.', upkeep: 30, respect: 3, family: 8, relief: 10, resale: 0.9, drift: 0.04, unique: true, pin: { lat: 25.8787, lon: -80.1253, place: 'Surfside, Florida' } },
  { id: 'pocono', name: 'A lodge in the Poconos', cat: 'home', price: 15000, blurb: 'Stone fireplace, a lake, no telephone. The kids learn to fish.', upkeep: 16, respect: 1, family: 7, relief: 10, resale: 0.9, drift: 0.03, unique: true, pin: { lat: 41.1087, lon: -75.3735, place: 'the Poconos' } },
  { id: 'cadillac', name: 'A Cadillac Eldorado', cat: 'car', price: 7400, blurb: 'Fins, chrome and a white top. Nothing says it louder.', upkeep: 12, respect: 3, family: 3, relief: 3, resale: 0.6, drift: -0.1 },
  { id: 'lincoln', name: 'A Lincoln Continental', cat: 'car', price: 6100, blurb: 'Suicide doors, black on black. A car for funerals and sit-downs.', minYear: 1961, upkeep: 11, respect: 3, family: 2, relief: 2, resale: 0.6, drift: -0.1 },
  { id: 'imperial', name: 'A Chrysler Imperial', cat: 'car', price: 5400, blurb: 'Big, quiet, and nobody looks twice.', upkeep: 10, respect: 2, family: 2, relief: 2, resale: 0.55, drift: -0.1 },
  { id: 'tbird', name: 'A Thunderbird convertible', cat: 'car', price: 4000, blurb: 'Top down on Ocean Avenue in July.', upkeep: 8, respect: 1, family: 4, relief: 4, resale: 0.6, drift: -0.08 },
  { id: 'corvette', name: 'A Corvette', cat: 'car', price: 3900, blurb: 'For the son who earned it, or the boss who didn\'t.', upkeep: 8, respect: 1, family: 3, relief: 4, resale: 0.65, drift: -0.06 },
  { id: 'mustang', name: 'A Mustang', cat: 'car', price: 2600, blurb: 'Brand new and everybody wants one.', minYear: 1964, upkeep: 6, respect: 0, family: 4, relief: 3, resale: 0.65, drift: -0.08 },
  { id: 'pickup', name: 'A Ford pickup', cat: 'truck', price: 2100, blurb: 'For the yard, the lumber, and the things you don\'t ask about.', upkeep: 5, respect: 0, family: 0, relief: 0, resale: 0.6, drift: -0.08 },
  { id: 'boxtruck', name: 'A box truck', cat: 'truck', price: 5000, blurb: 'A twenty-foot International. Your trucking outfit puts it to work.', upkeep: 12, respect: 0, family: 0, relief: 0, resale: 0.6, drift: -0.08 },
  { id: 'runabout', name: 'A Chris-Craft runabout', cat: 'boat', price: 4500, blurb: 'Mahogany and chrome. Out the inlet on a Sunday.', upkeep: 10, respect: 1, family: 5, relief: 6, resale: 0.6, drift: -0.05, unique: true, pin: { lat: 38.9989, lon: -74.8121, place: 'Otten\'s Harbor' } },
  { id: 'cruiser', name: 'A cabin cruiser', cat: 'boat', price: 28000, blurb: 'Forty feet, a galley, a captain. Where the important conversations happen.', upkeep: 45, respect: 4, family: 6, relief: 10, resale: 0.6, drift: -0.05, unique: true, pin: { lat: 38.9992, lon: -74.8131, place: 'Otten\'s Harbor' } },
  { id: 'hifi', name: 'A hi-fi console', cat: 'toy', price: 400, blurb: 'Walnut cabinet, Sinatra on Saturday nights.', upkeep: 0, respect: 0, family: 3, relief: 2, resale: 0.3, drift: -0.1, unique: true },
  { id: 'jukebox', name: 'A Seeburg jukebox for the basement', cat: 'toy', price: 1200, blurb: 'A hundred selections and a nickel slot nobody uses.', upkeep: 1, respect: 1, family: 3, relief: 3, resale: 0.5, drift: -0.03, unique: true },
  { id: 'pooltable', name: 'A Brunswick pool table', cat: 'toy', price: 800, blurb: 'The crew plays for quarters. The boss never loses.', upkeep: 0, respect: 1, family: 1, relief: 3, resale: 0.5, drift: -0.03, unique: true },
  { id: 'colortv', name: 'A color television', cat: 'toy', price: 500, blurb: 'NBC in living color. The whole block comes over for Bonanza.', minYear: 1965, upkeep: 1, respect: 1, family: 5, relief: 2, resale: 0.3, drift: -0.12, unique: true },
  { id: 'racehorse', name: 'A racehorse at Garden State Park', cat: 'toy', price: 15000, blurb: 'Three-year-old colt, a trainer, a box at the track. Sometimes he even wins.', upkeep: 60, respect: 4, family: 2, relief: 5, resale: 0.4, drift: -0.15, unique: true },
  { id: 'fur', name: 'A mink for the wife', cat: 'toy', price: 3000, blurb: 'Full length, for church and the Latin Casino.', upkeep: 1, respect: 1, family: 8, relief: 3, resale: 0.3, drift: -0.05, unique: true },
];

export const LUX_BY_ID: Record<string, LuxItem> = Object.fromEntries(LUX.map((x) => [x.id, x]));
export const LUX_CAT_LABEL: Record<LuxCat, string> = { home: 'Homes', car: 'The garage', truck: 'Trucks', boat: 'The boat', toy: 'Toys' };

export interface Owned {
  uid: string;
  id: string;
  paid: number;
  year: number;
  week: number;
}

/** RICO's forfeiture provisions (Organized Crime Control Act, signed October 15, 1970). */
export function forfeitureLaw(s: GameState): boolean {
  return s.date.y > 1970 || (s.date.y === 1970 && s.date.m >= 10);
}

export function luxPrice(s: GameState, it: LuxItem): number {
  return Math.round((it.price * inflation(s)) / 50) * 50;
}

export function owned(s: GameState): Owned[] {
  return s.econ?.goodLife ?? [];
}

export function resaleValue(s: GameState, o: Owned): number {
  const it = LUX_BY_ID[o.id];
  if (!it) return 0;
  const years = Math.max(0, s.date.y - o.year);
  return Math.max(Math.round(o.paid * 0.1), Math.round((o.paid * it.resale * Math.pow(1 + it.drift, years)) / 50) * 50);
}

export function weeklyUpkeep(s: GameState): number {
  return owned(s).reduce((a, o) => a + Math.round((LUX_BY_ID[o.id]?.upkeep ?? 0) * inflation(s)), 0);
}

/** What the IRS sees: the price against the income the books can explain. */
export function conspicuous(s: GameState, price: number): { heat: number; why: string } {
  const wash = s.businesses.filter((b) => b.owner === 'player').length;
  let h = Math.round(price / 9000);
  const why: string[] = [];
  if (h) why.push('a big purchase');
  if (s.unwashed > 20000) { h += 1; why.push('dirty money piling up'); }
  if (wash < 2 && price >= 5000) { h += 2; why.push('no legitimate business to explain it'); }
  return { heat: Math.min(10, h), why: why.join(', ') };
}

/** Rivals with the most to resent a show of money. */
function rivalsWhoNotice(s: GameState): RivalId[] {
  return s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive).map((r) => r.id).slice(0, 2);
}

export type LuxAction = { type: 'luxBuy'; item: string } | { type: 'luxSell'; uid: string };

export function previewLux(s: GameState, a: LuxAction): ActionPreview {
  if (a.type === 'luxBuy') {
    const it = LUX_BY_ID[a.item];
    if (!it) return { title: 'Buy', effects: [], cost: 0, because: '', disabledReason: 'No such thing', category: 'event' };
    const price = luxPrice(s, it);
    const title = `The Good Life: ${it.name}`;
    const c = conspicuous(s, price);
    // Your pocket pays; if it is short, the rest comes out of the Family (a dip the capos notice).
    const pp = pocketPrice(s, price, title);
    const effects: Effect[] = [...pp.effects];
    if (it.respect) effects.push({ type: 'respect', amount: it.respect, label: title });
    if (it.family) effects.push({ type: 'familyOpinion', amount: it.family, reason: `Bought ${it.name.replace(/^An? /, 'a ').toLowerCase()}`, label: title });
    if (it.relief) effects.push({ type: 'dyn', op: { op: 'stress', charId: s.playerId, amount: -it.relief, source: 'paranoia' }, label: title });
    if (c.heat) effects.push({ type: 'heat', bar: 'federal', amount: c.heat, label: `${title}: unexplained wealth (${c.why})` });
    if (price >= 15000) for (const r of rivalsWhoNotice(s)) effects.push({ type: 'rivalOpinion', rival: r, amount: -2, reason: 'Flashing his money around', label: `${title}: the rivals notice` });
    effects.push({ type: 'econ', op: { op: 'note', text: `Upkeep ${fmtMoney(Math.round(it.upkeep * inflation(s)))}/wk · passes to the heir` }, label: title });
    const have = owned(s).some((o) => o.id === it.id);
    const why = (it.minYear ?? 0) > s.date.y ? `Not before ${it.minYear}` : it.unique && have ? 'You already have one' : pp.why;
    return { title, detail: it.blurb, effects, cost: price, pot: 'pocket', because: `bought ${it.name.replace(/^An? /, 'a ').toLowerCase()}`, disabledReason: why, category: 'event', warning: forfeitureLaw(s) && c.heat >= 2 ? 'Under RICO, what the government can tie to the rackets it can seize.' : undefined };
  }
  const o = owned(s).find((x) => x.uid === a.uid);
  const it = o ? LUX_BY_ID[o.id] : undefined;
  if (!o || !it) return { title: 'Sell', effects: [], cost: 0, because: '', disabledReason: 'Not yours', category: 'event' };
  const v = resaleValue(s, o);
  const title = `Sell ${it.name.replace(/^An? /, 'the ').replace(/^A /, 'the ')}`;
  return {
    title, detail: `Paid ${fmtMoney(o.paid)} in ${o.year}.`,
    effects: [{ type: 'money', amount: v, pot: 'pocket', label: title }, ...(it.family >= 5 ? [{ type: 'familyOpinion', amount: -Math.ceil(it.family / 2), reason: 'Sold something we loved', label: title } as Effect] : [])],
    cost: 0, because: `sold ${it.name.replace(/^An? /, 'the ').toLowerCase()}`, category: 'event',
  };
}

export function commitLux(ctx: Ctx, a: LuxAction): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  if (a.type === 'luxBuy') {
    const it = LUX_BY_ID[a.item];
    if (!it) return;
    (e.goodLife ??= []).push({ uid: `gl${e.nextId++}`, id: it.id, paid: luxPrice(s, it), year: s.date.y, week: s.week });
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The house bought ${it.name.replace(/^An? /, 'a ').toLowerCase()}.`, kind: 'decision' });
  } else e.goodLife = (e.goodLife ?? []).filter((o) => o.uid !== a.uid);
}

/** Weekly: upkeep, and (after RICO, with the feds close) forfeiture. */
export function goodLifeWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.econ;
  if (!e?.goodLife?.length) return;
  const up = weeklyUpkeep(s);
  if (up > 0) payFromPersonal(ctx, up, `The Good Life: upkeep (${e.goodLife.length} thing${e.goodLife.length > 1 ? 's' : ''})`, 'goodlife');
  if (forfeitureLaw(s) && s.heat.federal >= 70 && chance(e, 0.04)) {
    const big = [...e.goodLife].sort((x, y) => y.paid - x.paid)[0];
    const it = LUX_BY_ID[big.id];
    e.goodLife = e.goodLife.filter((o) => o !== big);
    const text = `Federal marshals seized ${it.name.replace(/^An? /, 'the ').toLowerCase()} under RICO: "proceeds of racketeering."`;
    ctx.log.push(text);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
    heat(ctx, 'federal', -3, `Forfeiture: ${it.name} (the feds have their headline)`, 'heat');
  }
}

/** Box trucks put to work: +4% each to your trucking outfits (max +20%). */
export function truckBonus(s: GameState): number {
  const n = owned(s).filter((o) => o.id === 'boxtruck' || o.id === 'pickup').length;
  return 1 + Math.min(0.2, n * 0.04);
}

/** For the sim: something affordable to buy now and then. */
export function luxActions(s: GameState): LuxAction[] {
  const out: LuxAction[] = [];
  for (const it of LUX) {
    const p = previewLux(s, { type: 'luxBuy', item: it.id });
    if (!p.disabledReason && (luxPrice(s, it) <= (s.tribute?.acct.personal ?? 0) * 0.8 || luxPrice(s, it) * 6 <= s.money)) out.push({ type: 'luxBuy', item: it.id });
  }
  if (s.money < 3000) for (const o of owned(s)) out.push({ type: 'luxSell', uid: o.uid });
  return out;
}
