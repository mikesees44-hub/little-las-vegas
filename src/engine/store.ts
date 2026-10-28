import type { ActionPreview } from './actions';
import { CATALOG } from './catalog';
import { capos, crew, hasTrait } from './characters';
import { fmtMoney } from './effects';
import { owned as ownedLux } from './goodlife';
import { heat, money, post, type Ctx } from './ledger';
import { earnPocket, pocketPrice, spendPocket } from './pocket';
import { inflation } from './property';
import { addOpinion, opinion } from './relations';
import { hashSeed, rand } from './rng';
import { effectSummary, spendBlock, spendOwned, spendPrice, whoNotices } from './spend';
import { SPEND, SPEND_BY_ID, type SpendItem } from './spendData';
import { ensureSpend, type RaceRecord, type SpendOwned, type StoreLoan, type StoreNpcState } from './spendState';
import { CAT_TAB, ID_TAB, LEGACY_HORSE, LUX_ALIAS, type BizType, type PurchaseModel, type StoreHorse, type StoreStyle, type StoreTab } from './storeData';
import { xfer } from './tribute';
import { entourageWeek } from './vacPlanner';
import type { BusinessKind, Character, Effect, GameState } from './types';

/**
 * THE STORE (under You): the Spend catalog organized as a shop with eight
 * tabs and the Luxury highlights, every line a purchase card:
 *   price · down payment · weekly expenses · current revenue · profit range ·
 *   manager · condition · location · the adviser's assessment ·
 *   Inspect · Ask adviser · Negotiate · Buy · Finance.
 *
 * This module adds what a shop needs beyond Spend: the tabs, the cards, an
 * adviser's line, a counter-offer (negotiate), financing (a quarter down,
 * weekly payments, repossession after four missed), the legitimate businesses
 * the store runs (revenue in and out of season; equipment raises capacity,
 * never demand), investments (estimated, never promised), the races (horses
 * at Atlantic City, Garden State, Monmouth; race cars at Sebring), and the
 * other buyers (capos and rivals flexing with their own money: envy and the
 * IRS). Spend still owns buying, upkeep and the IRS's count.
 *
 * Deterministic: weekly draws come from `hashFrac` of the seed and the week
 * (or the Spend stream when a purchase already made the state), so the store
 * never touches the main dice; NPC buys never create the Spend state.
 */

const $ = (n: number) => fmtMoney(Math.round(n));
const roundPrice = (v: number) => (v >= 1000 ? Math.round(v / 50) * 50 : Math.round(v / 5) * 5);
export const hashFrac = (key: string): number => rand({ rng: hashSeed(key) });

/* ------------------------------------------------------------------ */
/* Tabs                                                                 */
/* ------------------------------------------------------------------ */

export type StoreView = StoreTab | 'luxury';

export function storeTab(it: SpendItem): StoreTab {
  return it.tab ?? ID_TAB[it.id] ?? CAT_TAB[it.cat];
}

export function storeItems(tab: StoreTab): SpendItem[] {
  return SPEND.filter((it) => storeTab(it) === tab);
}

/** Businesses bought the existing way (Rackets & Businesses: a storefront in a district you hold). */
export const LINKED_BIZ: BusinessKind[] = (Object.keys(CATALOG) as BusinessKind[]).filter((k) => {
  const d = CATALOG[k];
  return d.category !== 'racket' && !d.hidden && !d.hubOnly && d.cost > 0;
});

/** Everything on the shelves: the catalog plus the businesses bought through the districts. */
export function storeSize(): number {
  return SPEND.length + LINKED_BIZ.length;
}

/** The Luxury highlights: the showpieces (penthouse, mansion, yacht, race cars, racehorses, the big stones). */
export function luxuryItems(): SpendItem[] {
  return SPEND.filter((it) => it.pot === 'pocket' && it.kind === 'own' && (it.flash >= 7 || it.price >= 9000 || !!it.horse || it.racer !== undefined))
    .sort((a, b) => b.price - a.price);
}

/* ------------------------------------------------------------------ */
/* Seasons, revenue, capacity                                           */
/* ------------------------------------------------------------------ */

/** The shore's season: June-August in, May and September half, the rest out. */
export function seasonShare(m: number): number {
  return m >= 6 && m <= 8 ? 1 : m === 5 || m === 9 ? 0.5 : 0;
}

/** Equipment capacity (%) for a business type: what the kitchen, the machines, the lights add (at most +100%). */
export function equipCap(s: GameState, type: BizType): number {
  let v = 0;
  for (const o of spendOwned(s)) {
    const e = SPEND_BY_ID[o.id]?.equip;
    if (e && e.types.includes(type)) v += e.cap;
  }
  return Math.min(100, v);
}

/** This week's demand for a store business (1960 dollars), before capacity. */
export function bizDemand(s: GameState, it: SpendItem, key = ''): number {
  const b = it.biz!;
  const sh = seasonShare(s.date.m);
  const base = b.rev[1] + (b.rev[0] - b.rev[1]) * sh;
  const noise = key ? 0.85 + 0.3 * hashFrac(`${s.seed}:biz:${key}:${s.week}`) : 1;
  return base * noise;
}

/** What it can serve a week: three-quarters of a peak week, plus equipment. Equipment never adds customers. */
export function bizCapacity(s: GameState, it: SpendItem): number {
  const b = it.biz!;
  return b.rev[0] * 0.75 * (1 + equipCap(s, b.type) / 100);
}

/** The week's take of a store business (today's dollars): what came, up to what it can serve; a business with no one minding it does worse. */
export function bizTake(s: GameState, it: SpendItem, key = ''): number {
  if (!it.biz) return 0;
  let v = Math.min(bizDemand(s, it, key), bizCapacity(s, it));
  if (it.biz.mgr > 0 && !spendOwned(s).some((o) => o.id === 'st_bizmanager' || o.id === 'st_propmanager')) v *= 0.85;
  return Math.round(v * inflation(s));
}

/** Weekly profit range (today's dollars): a winter week to a July week, upkeep off. */
export function bizRange(s: GameState, it: SpendItem): [number, number] {
  const b = it.biz!;
  const up = Math.round(it.up * inflation(s));
  const hi = Math.min(b.rev[0], b.rev[0] * 0.75 * (1 + equipCap(s, b.type) / 100));
  return [Math.round(b.rev[1] * 0.85 * inflation(s)) - up, Math.round(hi * inflation(s)) - up];
}

/* ------------------------------------------------------------------ */
/* Old Good Life items still count                                      */
/* ------------------------------------------------------------------ */

/** Good Life items (the older catalog) owned that are the same thing as this store item. */
export function luxCount(s: GameState, id: string): number {
  return ownedLux(s).filter((o) => LUX_ALIAS[o.id] === id).length;
}

/* ------------------------------------------------------------------ */
/* Finance                                                              */
/* ------------------------------------------------------------------ */

export interface FinanceTerms { down: number; weeks: number; pay: number; total: number; rate: number; lender: string }

export function financeable(it: SpendItem): boolean {
  return it.kind === 'own' && it.price >= 2000 && !it.inv && !it.gift && (it.resale ?? 0) > 0;
}

/** A quarter down; two years (three for $20,000 and up) at 6% (10% from a finance company when the feds are close). */
export function financeTerms(s: GameState, it: SpendItem, price = spendPrice(s, it)): FinanceTerms | undefined {
  if (!financeable(it)) return undefined;
  const down = roundPrice(price * 0.25);
  const weeks = price >= 20000 ? 156 : 104;
  const hot = s.heat.federal >= 60;
  const rate = hot ? 0.1 : 0.06;
  const total = Math.round((price - down) * (1 + rate * (weeks / 52)));
  return { down, weeks, pay: Math.ceil(total / weeks), total, rate, lender: hot ? 'a finance company in Camden' : it.cat === 'biz' || it.cat === 'property' ? 'the Marine National Bank' : "the dealer's finance plan" };
}

/** Weekly payments due, by pot. */
export function loanPayments(s: GameState): { pocket: number; family: number } {
  const out = { pocket: 0, family: 0 };
  for (const l of s.spend?.loans ?? []) out[l.pot] += Math.min(l.pay, l.left);
  return out;
}

/* ------------------------------------------------------------------ */
/* Negotiate                                                            */
/* ------------------------------------------------------------------ */

export function negotiable(it: SpendItem): boolean {
  return it.kind === 'own' && it.price >= 500 && !it.inv;
}

/** The lowest price the seller takes this week (a hidden number; the counter-offer reveals it). */
export function haggleFloor(s: GameState, it: SpendItem, price = spendPrice(s, it)): number {
  if (!negotiable(it)) return price;
  let d = 0.04 + 0.08 * hashFrac(`${s.seed}:haggle:${it.id}:${s.week}`);
  if (it.stock !== undefined) d *= 0.3;
  if (it.cat === 'biz' || it.cat === 'property') d += 0.03;
  if (it.biz && it.biz.rev[0] > it.biz.rev[1] * 2 && seasonShare(s.date.m) === 0) d += 0.05;
  const b = s.characters[s.playerId];
  if (b) d += (b.attributes.diplomacy - 50) / 1000;
  return roundPrice(price * (1 - Math.max(0, Math.min(0.25, d))));
}

export interface Counter { ok: boolean; price: number; text: string }

/** Make an offer: he takes it, meets you at his floor, or laughs and holds the price. */
export function counterOffer(s: GameState, it: SpendItem, offer: number): Counter {
  const list = spendPrice(s, it);
  const floor = haggleFloor(s, it, list);
  if (!negotiable(it)) return { ok: false, price: list, text: 'The price is the price: nobody haggles over this.' };
  if (offer >= list) return { ok: true, price: list, text: 'He shakes your hand at the asking price, a little surprised.' };
  if (offer >= floor) return { ok: true, price: roundPrice(offer), text: `He thinks it over, sighs, and takes ${$(offer)}.` };
  if (offer >= floor * 0.9) return { ok: false, price: floor, text: `"I can't do ${$(offer)}. For you, ${$(floor)}, and I'm losing money."` };
  return { ok: false, price: list, text: `He laughs. "${$(list)}. Come back when you're serious."` };
}

/** Three offers to try: ten, fifteen and twenty-five percent off. */
export function offerSteps(s: GameState, it: SpendItem): number[] {
  const list = spendPrice(s, it);
  return [0.9, 0.85, 0.75].map((f) => roundPrice(list * f));
}

/* ------------------------------------------------------------------ */
/* The adviser                                                          */
/* ------------------------------------------------------------------ */

export function adviserOf(s: GameState): Character | undefined {
  const all = crew(s);
  return all.find((c) => c.rank === 'consigliere') ?? all.find((c) => c.rank === 'underboss');
}

/** The adviser's assessment of a purchase, one or two sentences. */
export function adviserLine(s: GameState, it: SpendItem): string {
  if (it.advice) return it.advice;
  const out: string[] = [];
  const price = spendPrice(s, it);
  if (it.biz) {
    const [lo, hi] = it.biz.rev;
    if (hi < lo * 0.3) out.push("Strong summer business. We'll need enough cash to survive winter.");
    else if (hi > lo) out.push('It does better in the winter than the summer. Steady money.');
    else out.push('Year-round money, not much of it, every week.');
    if (it.biz.mgr) out.push('Somebody has to mind it, or it leaks.');
  } else if (it.inv) {
    out.push(it.inv.risk === 'high' ? 'Most of these lose. The ones that win pay for the others.' : it.inv.risk === 'medium' ? `Decent, if ${it.inv.partner.split(',')[0]} is honest.` : 'Safe, slow, and the IRS likes it.');
    if (it.inv.liq === 'years') out.push("The money's locked up for years.");
  } else if (it.horse) {
    out.push('A horse eats every day and wins once in a while.');
  } else if (it.racer !== undefined) {
    out.push('A race car is a fast way to spend money. Sebring needs a team behind it.');
  } else if (it.equip) {
    out.push(it.equip.cap ? 'It lets us serve more when the people come. It does not bring the people.' : 'Insurance you can touch.');
  } else if (it.arms) {
    out.push('More guns is not more strength. Training and judgment are.');
  } else if (it.kind === 'svc') {
    out.push(it.up * 52 > price * 10 ? `${$(Math.round(it.up * inflation(s) * 52))} a year. Make sure he's worth it.` : 'Cheap for what it does.');
  }
  if (it.flash >= 7) out.push('Every man at the IRS will see this one.');
  else if (it.flash >= 5 && !out.length) out.push('People will notice. Some of them carry badges.');
  if (it.kind === 'own' && !it.biz && !it.inv && (it.resale ?? 0) <= 0.5 && price >= 3000) out.push('It loses half its value the day you take it home.');
  if (it.kind === 'own' && (it.drift ?? 0) > 0.02 && !it.inv) out.push('It goes up in value.');
  if (it.up > 0 && it.up * 52 >= price * 0.2 && it.kind === 'own') out.push(`Upkeep is ${$(Math.round(it.up * inflation(s)))} a week: think of the winters.`);
  if (!out.length) out.push(it.gift ? 'A nice thought. Whether it lands depends on who gets it.' : 'If you want it, buy it. It does no harm.');
  return out.join(' ');
}

/* ------------------------------------------------------------------ */
/* Gifts depend on the recipient                                        */
/* ------------------------------------------------------------------ */

/**
 * How well a present lands with this person (multiplier on its opinion
 * effect): a necklace does not repair broken trust, a pious mother prefers
 * the church to a fur, a greedy goomar loves the stones, and somebody who
 * just wants your time takes the day off over the bracelet.
 */
export function giftFit(s: GameState, it: SpendItem, who: Character): { mult: number; why?: string } {
  let mult = 1;
  let why: string | undefined;
  const trust = opinion(s, who.id, s.playerId);
  const pricey = it.price >= 1000;
  if (trust <= -40 && pricey) { mult *= 0.4; why = `${who.firstName} does not trust you: a present that size reads as a guilty conscience.`; }
  if (hasTrait(who, 'Greedy') && (it.cat === 'jewelry' || pricey)) { mult *= 1.4; why ??= `${who.firstName} loves the expensive things.`; }
  if (hasTrait(who, 'Pious') && it.cat === 'jewelry' && pricey) { mult *= 0.7; why ??= `${who.firstName} would rather see that money at the church.`; }
  if (hasTrait(who, 'Honest') && it.id === 'st_time_together') { mult *= 1.5; why ??= `What ${who.firstName} wants is you.`; }
  else if (hasTrait(who, 'Honest') && pricey) { mult *= 0.8; why ??= `${who.firstName} would rather have time than things.`; }
  // Repeating presents wears thin; after a betrayal a present is sent back (it does not buy forgiveness).
  const recent = (s.spend?.gifts?.[who.id] ?? []).filter((w) => s.week - w < 26).length;
  if (recent) { mult *= Math.pow(0.75, recent); why ??= `Another present for ${who.firstName}: each one means a little less.`; }
  if (trust <= -60 && it.id !== 'st_time_together') { mult = 0; why = `${who.firstName} sends it back. Things won't fix this.`; }
  return { mult: Math.round(mult * 100) / 100, why };
}

/* ------------------------------------------------------------------ */
/* The purchase card                                                    */
/* ------------------------------------------------------------------ */

export interface StoreCard {
  id: string;
  name: string;
  tab: StoreTab;
  price: number;
  down?: number;
  /** Upkeep a week (today's dollars), and the payment if financed. */
  weekly: number;
  finance?: FinanceTerms;
  revenue?: number;
  profit?: [number, number];
  manager?: string;
  condition?: string;
  location?: string;
  stake?: string;
  adviser: string;
  negotiable: boolean;
  /** Investment lines: risk, return, liquidity, management, partner. */
  inv?: { risk: string; ret: string; liq: string; mgmt: string; partner: string };
  hire?: { skill: number; rep: string; avail: string; conflict?: string };
  /** One short line on what it unlocks (equipment, the armory). */
  note?: string;
  block?: string;
  model: PurchaseModel;
  ownership: string;
  requirements: string[];
  style?: string;
  adult?: SpendItem['adult'];
}

/* ------------------------------------------------------------------ */
/* Styles: impress some, irritate others                                */
/* ------------------------------------------------------------------ */

/** Styles of the older catalog's clothes and jewels. */
export const STYLE_OF: Record<string, StoreStyle> = {
  sp_suit: 'traditional', sp_suits12: 'flamboyant', sp_brooks: 'understated', sp_camel: 'traditional', sp_cashmere: 'understated', sp_fedoras: 'traditional', sp_homburg: 'traditional',
  sp_cufflinks: 'traditional', sp_stickpin: 'flamboyant', sp_pinky: 'flamboyant', sp_patek: 'understated', sp_rolex: 'fashionable', sp_moneyclip: 'flamboyant', sp_gators: 'flamboyant',
  sp_shirts: 'traditional', sp_tux: 'traditional', sp_cigcase: 'flamboyant', st_submariner: 'practical', st_dayDate: 'flamboyant', st_seamaster: 'practical', st_speedmaster: 'practical',
  st_cartier: 'fashionable', st_vacheron: 'understated', st_hamilton: 'fashionable', st_audemars: 'understated', st_ringyou: 'flamboyant',
};

export function styleOf(it: SpendItem): StoreStyle | undefined {
  return it.style ?? STYLE_OF[it.id];
}

/** Who a style impresses and who it irritates (shown on the card; applied when bought). */
export function styleEffects(s: GameState, it: SpendItem, label: string): Effect[] {
  const st = styleOf(it);
  if (!st) return [];
  const philly = s.rivals.some((r) => r.id === 'philly');
  const out: Effect[] = [];
  switch (st) {
    case 'flamboyant':
      out.push({ type: 'crewOpinion', amount: 1, reason: 'The boss looks like a boss', label });
      if (philly) out.push({ type: 'rivalOpinion', rival: 'philly', amount: -1, reason: 'The old man hates flash', label });
      break;
    case 'understated':
      if (philly) out.push({ type: 'rivalOpinion', rival: 'philly', amount: 1, reason: 'A man who doesn\'t show off', label });
      break;
    case 'fashionable':
      out.push({ type: 'crewOpinion', amount: 1, reason: 'The young men copy him', label });
      break;
    case 'traditional':
    case 'practical':
      break;
  }
  return out;
}

export const STYLE_TEXT: Record<StoreStyle, string> = {
  understated: 'Understated: the old men approve; nobody else notices',
  traditional: 'Traditional: nobody minds',
  fashionable: 'Fashionable: the young men copy it',
  flamboyant: 'Flamboyant: the crew loves it; Philadelphia frowns',
  practical: 'Practical: a man who works',
};

/* ------------------------------------------------------------------ */
/* One shared catalog structure (CATALOG_DEEP §14)                      */
/* ------------------------------------------------------------------ */

export type Ownership = 'player' | 'household' | 'recipient' | 'company' | 'organization';

export interface CatalogEntry {
  id: string;
  category: StoreTab;
  /** Available years, and where. */
  years: [number, number];
  where: string;
  model: PurchaseModel;
  upfront: number;
  recurring: number;
  condition?: string;
  capacity?: string;
  requirements: string[];
  ownership: Ownership;
  benefits: string[];
  drawbacks: string[];
  visibility: string[];
  exit: string;
  hooks: string[];
}

export function ownershipOf(it: SpendItem): Ownership {
  if (it.owner) return it.owner;
  if (it.gift && it.gift !== 'anyone' && it.kind === 'own') return 'recipient';
  if (it.biz || it.inv || it.cat === 'equip') return it.pot === 'family' ? 'organization' : 'company';
  if (it.pot === 'family') return 'organization';
  if (it.cat === 'home' || it.cat === 'family') return 'household';
  return 'player';
}

export const OWNERSHIP_TEXT: Record<Ownership, string> = {
  player: 'Yours (the boss\'s own)', household: 'The household (it passes with the house)', recipient: 'Theirs: it belongs to the person it was for',
  company: 'A company in your name', organization: 'The Family (the organization\'s, not yours)',
};

export function modelOf(it: SpendItem): PurchaseModel {
  return it.model ?? (it.inv ? 'share' : it.kind === 'svc' ? (it.hire ? 'hire' : 'subscribe') : 'buy');
}

/** The one structure every purchase answers to (for the card, the tests and other systems). */
export function catalogEntry(s: GameState, it: SpendItem): CatalogEntry {
  const price = spendPrice(s, it);
  const reqs: string[] = [];
  if (it.quals) reqs.push(it.quals);
  for (const n of it.needs ?? []) reqs.push(`Needs ${n.replace('_lic', ' (licensed)')}`);
  if (it.req) reqs.push(`Needs: ${it.req}`);
  if (it.biz?.mgr) reqs.push(`A manager or ${it.biz.mgr} man${it.biz.mgr > 1 ? 'men' : ''}`.replace('manmen', 'men'));
  if (it.adult) reqs.push(it.adult.legal);
  const benefits = effectLines(it);
  const drawbacks: string[] = [];
  if (it.up) drawbacks.push(`${$(Math.round(it.up * inflation(s)))}/wk ${it.kind === 'svc' ? 'retainer' : 'upkeep, insurance and repairs'}`);
  if (it.flash >= 5) drawbacks.push('The IRS counts it');
  if (it.risk) drawbacks.push(it.risk.text);
  if (it.inv?.risk === 'high') drawbacks.push('It can lose everything');
  if (it.adult) drawbacks.push('Licensing, the vice squad and the Church');
  const exit = it.kind === 'svc' ? 'Cancel any week (no refund)' : it.kind === 'once' ? 'Spent: nothing to sell' : it.inv?.exit ?? ((it.resale ?? 0) > 0 ? `Sell for about ${Math.round((it.resale ?? 0) * 100)}% (${(it.drift ?? 0) >= 0 ? 'holding its value' : 'losing value each year'})` : 'Worth nothing used');
  const hooks = [...(it.hooks ?? [])];
  if (it.biz && it.biz.rev[1] < it.biz.rev[0] * 0.3) hooks.push('A bad summer, and the winter bills');
  if (it.horse) hooks.push('A race, a claim slip, a breakdown');
  if (it.flash >= 7) hooks.push('Somebody envies it');
  return {
    id: it.id, category: storeTab(it), years: [it.minYear ?? 1950, it.maxYear ?? 1999], where: it.where ?? it.biz?.loc ?? 'Wildwood and the shore',
    model: modelOf(it), upfront: price, recurring: Math.round(it.up * inflation(s)), condition: it.biz?.cond, capacity: it.biz ? `${$(Math.round(it.biz.rev[0] * 0.75 * inflation(s)))}/wk at the peak, before equipment` : it.equip?.cap ? `+${it.equip.cap}% capacity` : undefined,
    requirements: reqs, ownership: ownershipOf(it), benefits, drawbacks, visibility: whoNotices(it), exit, hooks,
  };
}

function effectLines(it: SpendItem): string[] {
  const out = effectSummary(it);
  if (it.biz) out.push(`Revenue ${$(it.biz.rev[1])}-${$(it.biz.rev[0])}/wk (1960 dollars)`);
  if (it.inv) out.push(`Return ${it.inv.ret[0]}% to ${it.inv.ret[1]}% (an estimate)`);
  if (it.equip?.cap) out.push(`Capacity +${it.equip.cap}%`);
  const st = styleOf(it);
  if (st) out.push(STYLE_TEXT[st]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Can he keep it up?                                                   */
/* ------------------------------------------------------------------ */

/** The weekly bills the store's things run up (upkeep and payments), against what he has. */
export function upkeepStrain(s: GameState): { weekly: number; cash: number; weeks: number } {
  const sp = s.spend;
  if (!sp) return { weekly: 0, cash: 0, weeks: Infinity };
  let weekly = 0;
  for (const o of sp.owned) weekly += Math.round((SPEND_BY_ID[o.id]?.up ?? 0) * inflation(s));
  const lp = loanPayments(s);
  weekly += lp.pocket + lp.family;
  const cash = Math.max(0, s.tribute?.acct.personal ?? 0) + Math.max(0, s.money);
  return { weekly, cash, weeks: weekly ? cash / weekly : Infinity };
}

export function strainWeek(ctx: Ctx): void {
  const s = ctx.s;
  const sp = s.spend;
  if (!sp) return;
  const st = upkeepStrain(s);
  if (st.weeks >= 6 || (sp.strained !== undefined && s.week - sp.strained < 13)) return;
  sp.strained = s.week;
  const big = [...sp.owned].sort((a, b) => (SPEND_BY_ID[b.id]?.up ?? 0) - (SPEND_BY_ID[a.id]?.up ?? 0))[0];
  const name = big ? SPEND_BY_ID[big.id]?.name.replace(/^An? /, 'the ').toLowerCase() : 'the things';
  const text = `The bills: ${$(st.weekly)} a week in upkeep and payments, and money for maybe ${Math.max(0, Math.floor(st.weeks))} weeks. Sell ${name}, or quietly ask somebody for help.`;
  ctx.log.push(text);
  slog(s, text);
}

const STAKE_TEXT = { building: 'The building (you collect rent)', business: 'The business (you run it)', share: 'A share (somebody else runs it)' } as const;

export function storeCard(s: GameState, it: SpendItem): StoreCard {
  const price = spendPrice(s, it);
  const up = Math.round(it.up * inflation(s));
  const fin = financeTerms(s, it, price);
  const e = catalogEntry(s, it);
  const st = styleOf(it);
  const card: StoreCard = {
    id: it.id, name: it.name, tab: storeTab(it), price, weekly: up, finance: fin, down: fin?.down, adviser: adviserLine(s, it), negotiable: negotiable(it), block: spendBlock(s, it),
    model: e.model, ownership: OWNERSHIP_TEXT[e.ownership], requirements: e.requirements, style: st ? STYLE_TEXT[st] : undefined, adult: it.adult,
  };
  if (it.biz) {
    card.revenue = Math.round(Math.min(bizDemand(s, it), bizCapacity(s, it)) * inflation(s));
    card.profit = bizRange(s, it);
    card.manager = it.biz.mgr ? `Needs a manager (${it.biz.mgr === 1 ? 'one man' : `${it.biz.mgr} men`})` : 'Runs itself';
    card.condition = it.biz.cond;
    card.location = it.biz.loc;
    card.stake = STAKE_TEXT[it.biz.stake];
  }
  if (it.inv) {
    const [lo, hi] = it.inv.ret;
    card.inv = {
      risk: it.inv.risk, ret: it.inv.term ? `${lo}% to ${hi}% over ${Math.round(it.inv.term / 4.3)} months (an estimate)` : lo === hi ? `${lo}% a year` : `${lo}% to ${hi}% a year (an estimate)`,
      liq: { cash: 'Cash on demand', weeks: 'Sold in a week or two', months: 'Months to get out', years: 'Locked up for years' }[it.inv.liq], mgmt: it.inv.mgmt, partner: it.inv.partner,
    };
    card.stake = 'A share (somebody else runs it)';
  }
  if (it.hire) card.hire = it.hire;
  if (it.equip) card.note = it.equip.cap ? `Capacity +${it.equip.cap}% for ${it.equip.types.join(', ')} businesses (not more customers)` : 'Protects what you have';
  if (it.arms) card.note = it.arms.pts ? `Armory +${it.arms.pts} (diminishing returns)${it.arms.carry ? ' · carried, it is seen' : ''}` : it.arms.train ? `Training +${Math.round(it.arms.train * 100)}%: the guns you have work better` : 'Keeps the armory out of sight';
  if (it.horse) card.note = `${it.horse.cls === 'stakes' ? 'A stakes horse' : it.horse.cls === 'allowance' ? 'An allowance horse' : 'A claimer'} (speed ${it.horse.speed})`;
  if (it.racer !== undefined) card.note = `A race car (pace ${it.racer})`;
  return card;
}

/** The card of a business bought through the districts (Rackets & Businesses). */
export interface BizCard { kind: BusinessKind; name: string; price: number; weekly: number; revenue: number; profit: [number, number]; manager: string; adviser: string; district?: string; districtName?: string; block?: string; launder: number }

export function bizCard(s: GameState, kind: BusinessKind): BizCard {
  const d = CATALOG[kind];
  const sh = seasonShare(s.date.m);
  const inSeason = d.base * d.season[0];
  const off = d.base * d.season[1];
  const best = bestDistrict(s);
  const adviser = d.season[1] < 0.3 ? "Strong summer business. We'll need enough cash to survive winter." : d.season[1] >= 0.9 ? 'Year-round money. Boring is good.' : d.launder >= 1000 ? 'It washes a lot of money, which matters more than what it makes.' : 'A good front, busy in July, quiet in February.';
  return {
    kind, name: d.name, price: d.cost, weekly: d.upkeep, revenue: Math.round(off + (inSeason - off) * sh), profit: [Math.round(off - d.upkeep), Math.round(inSeason - d.upkeep)],
    manager: d.staff ? `Needs ${d.staff} of your men` : 'Runs itself', adviser, district: best?.id, districtName: best?.name, launder: d.launder,
    block: best ? undefined : 'You need 20% of a district first (push in on the map)',
  };
}

/** The district where you could open a place (most of your influence). */
export function bestDistrict(s: GameState): { id: string; name: string } | undefined {
  const ds = s.districts.filter((d) => (d.influence.player ?? 0) >= 20).sort((a, b) => (b.influence.player ?? 0) - (a.influence.player ?? 0));
  return ds[0] ? { id: ds[0].id, name: ds[0].name } : undefined;
}

/* ------------------------------------------------------------------ */
/* The races                                                            */
/* ------------------------------------------------------------------ */

export interface Race {
  id: string;
  name: string;
  track: string;
  kind: 'horse' | 'car';
  months: number[];
  /** 1960 dollars. */
  purse: number;
  fee: number;
  /** How good the field is (the horses or cars you have to beat). */
  field: number;
  claiming?: boolean;
  needs?: string;
}

export const RACES: Race[] = [
  { id: 'ac_claim', name: 'A claiming race at Atlantic City Race Course', track: 'Atlantic City Race Course', kind: 'horse', months: [6, 7, 8, 9], purse: 2500, fee: 50, field: 52, claiming: true },
  { id: 'gs_allow', name: 'An allowance race at Garden State Park', track: 'Garden State Park', kind: 'horse', months: [4, 5, 6, 9, 10, 11], purse: 6000, fee: 150, field: 64 },
  { id: 'mon_hcap', name: 'A handicap at Monmouth Park', track: 'Monmouth Park', kind: 'horse', months: [6, 7, 8], purse: 15000, fee: 300, field: 70 },
  { id: 'jersey_derby', name: 'The Jersey Derby', track: 'Garden State Park', kind: 'horse', months: [5], purse: 100000, fee: 1000, field: 80 },
  { id: 'un_hcap', name: 'The United Nations Handicap', track: 'Atlantic City Race Course', kind: 'horse', months: [7, 8], purse: 100000, fee: 1000, field: 82 },
  { id: 'gs_stakes', name: 'The Garden State Stakes', track: 'Garden State Park', kind: 'horse', months: [10, 11], purse: 250000, fee: 2000, field: 84 },
  { id: 'bridgehampton', name: 'A sports-car race at Bridgehampton', track: 'Bridgehampton, Long Island', kind: 'car', months: [5, 6, 9], purse: 3000, fee: 200, field: 70 },
  { id: 'sebring', name: 'The Sebring 12 Hours', track: 'Sebring, Florida', kind: 'car', months: [3], purse: 10000, fee: 1500, field: 86, needs: 'raceteam' },
  { id: 'watkins', name: 'The Watkins Glen Grand Prix', track: 'Watkins Glen, New York', kind: 'car', months: [9, 10], purse: 8000, fee: 800, field: 82, needs: 'raceteam' },
];
export const RACE_BY_ID: Record<string, Race> = Object.fromEntries(RACES.map((r) => [r.id, r]));

export interface Runner { uid: string; id: string; name: string; kind: 'horse' | 'car'; speed: number; horse?: StoreHorse; legacy?: boolean }

/** Everything you own that can race: horses (the store's, Spend's, the Good Life's) and race cars. */
export function runners(s: GameState): Runner[] {
  const out: Runner[] = [];
  for (const o of spendOwned(s)) {
    const it = SPEND_BY_ID[o.id];
    const h = it?.horse ?? LEGACY_HORSE[o.id];
    if (h) out.push({ uid: o.uid, id: o.id, name: it.name, kind: 'horse', speed: h.speed, horse: h });
    else if (it?.racer !== undefined) out.push({ uid: o.uid, id: o.id, name: it.name, kind: 'car', speed: it.racer });
  }
  for (const o of ownedLux(s)) if (o.id === 'racehorse') out.push({ uid: o.uid, id: 'sp_racehorse', name: 'Your colt at Garden State Park', kind: 'horse', speed: 68, horse: { cls: 'allowance', speed: 68 }, legacy: true });
  return out;
}

/** Trainer, groom, jockey, the farm: every horse in the barn runs faster. */
export function barnBoost(s: GameState): number {
  return spendOwned(s).reduce((a, o) => a + (SPEND_BY_ID[o.id]?.horseBoost ?? 0), 0);
}

export function raceBlock(s: GameState, uid: string, raceId: string): string | undefined {
  const r = RACE_BY_ID[raceId];
  const run = runners(s).find((x) => x.uid === uid);
  if (!r) return 'No such race';
  if (!run) return 'Not yours to run';
  if (run.kind !== r.kind) return r.kind === 'horse' ? 'That race is for horses' : 'That race is for cars';
  if (!r.months.includes(s.date.m)) return `${r.track}: not this month`;
  if (r.needs && !spendOwned(s).some((o) => SPEND_BY_ID[o.id]?.unl?.includes(r.needs!))) return 'Sebring and the Glen need a team: drivers and a pit crew';
  const rec = s.spend?.races?.[uid];
  if (rec && s.week - rec.last < 2) return 'He ran last week: two weeks between races';
  return undefined;
}

/** Odds before the gate (a quick, fixed estimate): win and in the money (top three). */
export function raceOdds(s: GameState, uid: string, raceId: string): { win: number; top3: number } {
  const r = RACE_BY_ID[raceId];
  const run = runners(s).find((x) => x.uid === uid);
  if (!r || !run) return { win: 0, top3: 0 };
  const me = run.speed + (run.kind === 'horse' ? barnBoost(s) : 0);
  const h = { rng: hashSeed(`odds:${raceId}:${me}`) };
  let win = 0;
  let top = 0;
  for (let i = 0; i < 300; i++) {
    const pos = finish(h, me, r.field);
    if (pos === 1) win++;
    if (pos <= 3) top++;
  }
  return { win: win / 300, top3: top / 300 };
}

const FIELD = 9;
function finish(h: { rng: number }, me: number, field: number): number {
  const mine = me + (rand(h) - 0.5) * 30;
  let pos = 1;
  for (let i = 0; i < FIELD; i++) if (field + (rand(h) - 0.5) * 30 > mine) pos++;
  return pos;
}

const SHARE = [0, 0.6, 0.2, 0.1, 0.05];

export function previewRace(s: GameState, uid: string, raceId: string): ActionPreview {
  const r = RACE_BY_ID[raceId];
  const run = runners(s).find((x) => x.uid === uid);
  const title = r && run ? `${run.name.replace(/^An? /, 'Your ')}: ${r.name}` : 'A race';
  if (!r || !run) return { title, effects: [], cost: 0, because: '', disabledReason: raceBlock(s, uid, raceId) ?? 'No such race', category: 'event' };
  const fee = roundPrice(r.fee * inflation(s));
  const pp = pocketPrice(s, fee, `${title}: the entry`);
  const odds = raceOdds(s, uid, raceId);
  const purse = roundPrice(r.purse * inflation(s));
  const effects: Effect[] = [...pp.effects, { type: 'econ', op: { op: 'note', text: `Purse ${$(purse)} (the winner takes 60%) · about ${Math.round(odds.win * 100)}% to win, ${Math.round(odds.top3 * 100)}% in the money${r.claiming && run.horse ? ' · in a claiming race he can be claimed' : ''}` }, label: title } as Effect];
  return {
    title, detail: `${r.track}. ${run.kind === 'horse' ? `Speed ${run.speed}${barnBoost(s) ? ` + ${barnBoost(s)} from the barn` : ''}` : `Pace ${run.speed}`} against a field of about ${r.field}.`,
    effects, cost: fee, pot: 'pocket', because: `ran ${run.name.replace(/^An? /, 'his ').toLowerCase()} in ${r.name.replace(/^An? /, 'a ').replace(/^The /, 'the ')}`,
    disabledReason: raceBlock(s, uid, raceId) ?? pp.why, category: 'event', verb: `Enter — ${$(fee)}`,
  };
}

export function commitRace(ctx: Ctx, uid: string, raceId: string): void {
  const s = ctx.s;
  const r = RACE_BY_ID[raceId];
  const run = runners(s).find((x) => x.uid === uid);
  if (!r || !run) return;
  const sp = ensureSpend(s);
  const me = run.speed + (run.kind === 'horse' ? barnBoost(s) : 0);
  const pos = finish(sp, me, r.field);
  const purse = roundPrice(r.purse * inflation(s));
  const won = Math.round(purse * (SHARE[pos] ?? 0));
  const races = (sp.races ??= {});
  const rec: RaceRecord = races[uid] ??= { starts: 0, wins: 0, places: 0, earned: 0, last: s.week, hist: [] };
  rec.starts++;
  rec.last = s.week;
  if (pos === 1) rec.wins++;
  if (pos <= 3) rec.places++;
  rec.earned += won;
  rec.hist.push([s.week, raceId, pos]);
  if (rec.hist.length > 6) rec.hist.splice(0, rec.hist.length - 6);
  const what = run.name.replace(/^An? /, 'your ').replace(/^Your /, 'your ');
  if (won > 0) earnPocket(ctx, won, `${r.name}: ${pos === 1 ? 'a winner' : `finished ${ORD[pos]}`}`, `race${sp.nextId++}`);
  let text = pos === 1 ? `${r.name}: ${what} won. ${$(won)} and a picture in the winner's circle.` : pos <= 4 ? `${r.name}: ${what} finished ${ORD[pos]} (${$(won)}).` : `${r.name}: ${what} finished ${ORD[pos] ?? `${pos}th`} of ten. Nothing.`;
  if (pos === 1) {
    const big = r.purse >= 50000;
    post(ctx, 'respect', big ? 4 : 1, `${r.name}: the winner's circle`, 'event');
    if (big) s.chronicle.push({ week: s.week, date: { ...s.date }, text: `Your ${run.kind === 'horse' ? 'horse' : 'car'} won ${r.name}. The papers ran the picture.`, kind: 'misc' });
  }
  // A claimer in a claiming race can be claimed; a horse can break down; a car can crash.
  const risk = rand(sp);
  if (run.horse && r.claiming && run.horse.cls === 'claimer' && risk < 0.15) {
    const claim = roundPrice(3500 * inflation(s));
    removeRunner(s, run);
    earnPocket(ctx, claim, `${r.name}: your horse was claimed`, `claim${sp.nextId++}`);
    text += ` Somebody dropped a claim slip: he's theirs now, for ${$(claim)}.`;
  } else if (run.kind === 'horse' && risk > 0.975) {
    removeRunner(s, run);
    text += ' He pulled up lame in the stretch. He will never race again; the farm takes him.';
  } else if (run.kind === 'car' && risk > 0.95) {
    const o = spendOwned(s).find((x) => x.uid === uid);
    const bill = roundPrice((o?.paid ?? 5000) * 0.2);
    spendPocket(ctx, bill, `${r.name}: the crash, the repairs`, `crash${sp.nextId++}`);
    text += ` A crash in the esses: the car is rebuilt for ${$(bill)}; the driver walked away.`;
  }
  ctx.log.push(text);
  const sl = sp.log;
  sl.push([s.week, text]);
  if (sl.length > 40) sl.splice(0, sl.length - 40);
}

const ORD: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth' };

function removeRunner(s: GameState, run: Runner): void {
  if (run.legacy) {
    if (s.econ?.goodLife) s.econ.goodLife = s.econ.goodLife.filter((o) => o.uid !== run.uid);
  } else if (s.spend) s.spend.owned = s.spend.owned.filter((o) => o.uid !== run.uid);
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

function slog(s: GameState, text: string): void {
  const sp = s.spend;
  if (!sp) return;
  sp.log.push([s.week, text]);
  if (sp.log.length > 40) sp.log.splice(0, sp.log.length - 40);
}

/** Pay into the pot that paid for it (a gain), or out of it (a loss). */
function toPot(ctx: Ctx, pot: 'pocket' | 'family', amount: number, label: string, key: string): void {
  const a = Math.round(amount);
  if (!a) return;
  if (pot === 'pocket') { if (a > 0) earnPocket(ctx, a, label, key); else spendPocket(ctx, -a, label, key, true); } else money(ctx, a, label, a > 0 ? 'business' : 'cost');
}

/** Investments: the weekly yield (an estimate made real by the week's draw), or a venture's one payout. */
export function investWeek(ctx: Ctx): void {
  const s = ctx.s;
  const sp = s.spend;
  if (!sp) return;
  for (const o of [...sp.owned]) {
    const inv = SPEND_BY_ID[o.id]?.inv;
    if (!inv) continue;
    const [lo, hi] = inv.ret;
    const r = lo + (hi - lo) * hashFrac(`${s.seed}:inv:${o.uid}:${inv.term ? 'end' : s.week}`);
    if (inv.term) {
      if (s.week - o.week < inv.term) continue;
      const back = Math.max(0, Math.round(o.paid * (1 + r / 100)));
      sp.owned = sp.owned.filter((x) => x !== o);
      const name = SPEND_BY_ID[o.id].name;
      if (back > 0) toPot(ctx, o.pot, back, `Investment paid out: ${name}`, `inv${o.uid}`);
      const text = back >= o.paid ? `${name}: it paid off. ${$(back)} back on ${$(o.paid)}.` : back > 0 ? `${name}: it came back short, ${$(back)} of ${$(o.paid)}.` : `${name}: it lost everything.`;
      ctx.log.push(text);
      slog(s, text);
      continue;
    }
    const y = (o.paid * r) / 100 / 52;
    if (Math.abs(y) >= 1) toPot(ctx, o.pot, y, `Investments: ${SPEND_BY_ID[o.id].name}`, `inv${o.uid}`);
  }
}

/** The store's businesses: the week's take into Family money. */
export function storeBizWeek(ctx: Ctx): void {
  const s = ctx.s;
  const sp = s.spend;
  if (!sp) return;
  let total = 0;
  for (const o of sp.owned) {
    const it = SPEND_BY_ID[o.id];
    if (!it?.biz) continue;
    total += bizTake(s, it, o.uid);
  }
  if (total > 0) money(ctx, total, 'The Store: your legitimate businesses', 'business');
}

/** Weekly payments on what was financed; four missed and they come for it. */
export function loansWeek(ctx: Ctx): void {
  const s = ctx.s;
  const sp = s.spend;
  if (!sp?.loans?.length) return;
  for (const l of [...sp.loans]) {
    const due = Math.min(l.pay, l.left);
    const have = l.pot === 'pocket' ? (s.tribute?.acct.personal ?? 0) + Math.max(0, s.money) : s.money;
    if (have >= due) {
      if (l.pot === 'pocket') spendPocket(ctx, due, `Payments: ${SPEND_BY_ID[l.item]?.name ?? 'a purchase'} (${l.lender})`, `loan${l.uid}`, true);
      else money(ctx, -due, `Payments: ${SPEND_BY_ID[l.item]?.name ?? 'a purchase'} (${l.lender})`, 'debt');
      l.left -= due;
      l.missed = 0;
    } else l.missed++;
    if (l.left <= 0) {
      sp.loans = sp.loans.filter((x) => x !== l);
      slog(s, `Paid off: ${SPEND_BY_ID[l.item]?.name ?? 'a purchase'}.`);
    } else if (l.missed >= 4) {
      sp.loans = sp.loans.filter((x) => x !== l);
      sp.owned = sp.owned.filter((o) => o.uid !== l.uid);
      const text = `Repossessed: ${SPEND_BY_ID[l.item]?.name ?? 'a purchase'}. Four payments missed; ${l.lender} sent a truck.`;
      ctx.log.push(text);
      slog(s, text);
    }
  }
}

/** A big armory carried around, with no place to hide it, draws the cops now and then. */
export function armoryWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.spend || s.week % 4 !== 0) return;
  let pts = 0;
  let carry = false;
  let hidden = false;
  for (const o of s.spend.owned) {
    const a = SPEND_BY_ID[o.id]?.arms;
    if (!a) continue;
    pts += a.pts;
    carry ||= !!a.carry;
    if (o.id === 'st_gunroom') hidden = true;
  }
  if (pts >= 15 && carry && !hidden) heat(ctx, 'local', 1, 'The armory: men carrying, and the cops notice', 'heat');
}

/* ------------------------------------------------------------------ */
/* Other buyers: the capos and the rivals flex                         */
/* ------------------------------------------------------------------ */

/** What other men buy when they have money: cars, watches, a fur for the wife, a boat, a claimer. */
export const NPC_WANTS = ['sp_eldorado', 'sp_sedandeville', 'st_olds98', 'st_bonneville', 'st_dayDate', 'sp_pinky', 'sp_mink', 'st_claimer', 'sp_runabout', 'st_cottage', 'sp_imperial', 'st_cartier'];
/** What a soldier or an associate buys when he has a good year. */
export const NPC_WANTS_SMALL = ['st_belair', 'st_fury', 'sp_rolex', 'st_submariner', 'sp_suit', 'st_skiff', 'st_harley', 'sp_camel'];
/** Small legit businesses a capo buys for himself. */
export const NPC_BIZ = ['st_barber', 'st_candy', 'st_bait', 'st_newsstand', 'st_florist', 'st_beauty', 'st_diner', 'st_liquor', 'st_gasstation'];

function npcState(s: GameState): StoreNpcState {
  return (s.store ??= { v: 1, buys: [], biz: [] });
}

/** The week's flexes: who bought what with his own money (rolled from the seed and the week, never the main dice). */
export function npcBuyWeek(ctx: Ctx): void {
  const s = ctx.s;
  const infl = inflation(s);
  // Everyone buys by his money and his place: the brass and the capos cars, furs and businesses; soldiers and associates smaller things.
  const men = crew(s).filter((c) => c.id !== s.playerId && c.rank !== 'civilian');
  for (const c of men) {
    const big = c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere';
    if (hashFrac(`${s.seed}:npc:${s.week}:${c.id}`) >= (big ? 0.05 : 0.02)) continue;
    const bizRoll = big && hashFrac(`${s.seed}:npcb:${s.week}:${c.id}`) < 0.3;
    const pool = bizRoll ? NPC_BIZ : big ? NPC_WANTS : NPC_WANTS_SMALL;
    const id = pool[Math.floor(hashFrac(`${s.seed}:npcw:${s.week}:${c.id}`) * pool.length)];
    const it = SPEND_BY_ID[id];
    if (!it) continue;
    const price = roundPrice(it.price * infl);
    if (c.wealth < price * 2) continue;
    if (s.store?.biz.some(([o, i]) => o === c.id && i === id)) continue;
    const paid = xfer(ctx, `wealth:${c.id}`, 'ext:store', price, 'expense', `w${s.week}:npc:${c.id}`, { note: `${c.firstName} ${c.lastName} bought ${it.name.replace(/^An? /, 'a ').toLowerCase()}` });
    if (!paid) continue;
    const st = npcState(s);
    st.buys.push([s.week, c.id, id, paid]);
    if (st.buys.length > 30) st.buys.splice(0, st.buys.length - 30);
    if (it.biz) {
      st.biz.push([c.id, id, s.week]);
      if (st.biz.length > 20) st.biz.splice(0, st.biz.length - 20);
    }
    // Envy: the other capos see the new car in the lot; the flashier, the worse.
    if (it.flash >= 3) for (const k of capos(s)) if (k.id !== c.id) addOpinion(s, k.id, c.id, `Flashing ${it.name.replace(/^An? /, 'a ').toLowerCase()}`, -Math.min(6, Math.ceil(it.flash / 2)), 1);
    // The IRS counts other people's Cadillacs too.
    if (it.flash >= 6) c.evidence = (c.evidence ?? 0) + 1;
    ctx.log.push(`${c.firstName} ${c.lastName} bought ${it.name.replace(/^An? /, 'a ').toLowerCase()} with his own money. ${it.flash >= 6 ? 'The other capos noticed; so did somebody with a notebook.' : 'The other capos noticed.'}`);
  }
  // Their businesses pay them, monthly.
  if (s.week % 4 === 0 && s.store?.biz.length) {
    for (const [owner, id] of s.store.biz) {
      const c = s.characters[owner];
      const it = SPEND_BY_ID[id];
      if (!c?.alive || !it?.biz) continue;
      const take = Math.round(((it.biz.rev[0] + it.biz.rev[1]) / 2) * 4 * 0.6 * infl);
      xfer(ctx, 'ext:store', `wealth:${owner}`, take, 'business_income', `w${s.week}:npcbiz:${owner}:${id}`, { note: `${c.firstName} ${c.lastName}: his ${it.name.replace(/^An? /, '').toLowerCase()}` });
    }
  }
  // A rival boss flexes: his own money, his own heat.
  for (const r of s.rivals) {
    if (r.kind !== 'mob' || !s.characters[r.leaderId]?.alive) continue;
    if (hashFrac(`${s.seed}:npcr:${s.week}:${r.id}`) >= 0.03) continue;
    const id = NPC_WANTS[Math.floor(hashFrac(`${s.seed}:npcrw:${s.week}:${r.id}`) * NPC_WANTS.length)];
    const it = SPEND_BY_ID[id];
    const price = roundPrice(it.price * infl);
    if (r.money < price * 4) continue;
    r.money -= price;
    r.exposure = Math.min(100, r.exposure + Math.ceil(it.flash / 3));
    const st = npcState(s);
    st.buys.push([s.week, `rival:${r.id}`, id, price]);
    if (st.buys.length > 30) st.buys.splice(0, st.buys.length - 30);
    ctx.log.push(`${r.shortName}'s boss was seen in ${it.name.replace(/^An? /, 'a new ').replace(/^A new A /, 'a new ').toLowerCase()}. Your men talk about it.`);
  }
}

/** The weekly store tick (engine.ts, after Spend's week). */
export function storeWeek(ctx: Ctx): void {
  storeBizWeek(ctx);
  investWeek(ctx);
  loansWeek(ctx);
  armoryWeek(ctx);
  npcBuyWeek(ctx);
  entourageWeek(ctx);
  strainWeek(ctx);
}

/* ------------------------------------------------------------------ */
/* For the UI                                                           */
/* ------------------------------------------------------------------ */

export function ownedOf(s: GameState, id: string): SpendOwned[] {
  return spendOwned(s).filter((o) => o.id === id);
}

export function loanFor(s: GameState, uid: string): StoreLoan | undefined {
  return s.spend?.loans?.find((l) => l.uid === uid);
}

/** Recent flexes for the store's "Around town" line. */
export function recentFlexes(s: GameState, n = 6): { week: number; who: string; item: string; price: number }[] {
  return [...(s.store?.buys ?? [])].reverse().slice(0, n).map(([w, who, id, price]) => {
    const name = who.startsWith('rival:') ? `${s.rivals.find((r) => r.id === who.slice(6))?.shortName ?? 'A rival'}'s boss` : (() => { const c = s.characters[who]; return c ? `${c.firstName} ${c.lastName}` : 'Somebody'; })();
    return { week: w, who: name, item: SPEND_BY_ID[id]?.name ?? id, price };
  });
}
