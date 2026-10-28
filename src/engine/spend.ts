import type { ActionPreview } from './actions';
import { owned as ownedBiz } from './business';
import { ageOn } from './calendar';
import { CATALOG } from './catalog';
import { capos, crew } from './characters';
import { legitIncome } from './develop';
import { fmtMoney } from './effects';
import { addStress } from './familyStress';
import { owned as ownedLux, LUX_BY_ID } from './goodlife';
import { activeGoomars } from './goomar';
import { heat, money, type Ctx } from './ledger';
import { earnPocket, pocketPrice, spendPocket } from './pocket';
import { inflation } from './property';
import { addOpinion } from './relations';
import { rand } from './rng';
import { GROUP_LABEL, SPEND, SPEND_BY_ID, type GiftFor, type SpendCat, type SpendGroup, type SpendItem, type SpendReq } from './spendData';
import { ensureSpend, spendMod, type SpendAction, type SpendOwned } from './spendState';
import { commitRace, counterOffer, financeTerms, giftFit, haggleFloor, luxCount, ownershipOf, previewRace, styleEffects } from './store';
import { commitShare, previewShare } from './storeShare';
import type { Character, Effect, GameState, RivalId } from './types';

export type { SpendAction };

/**
 * SPEND: money finally buys something (MAKE_IT_GREAT #2: "money piles up with
 * nothing to buy"). The catalog is spendData.ts: cars, boats, clothes,
 * jewelry, the house, staff, society, the children's occasions, vice, the
 * business of power and the crew. Each thing has a price, upkeep, effects
 * that land in systems the game already has (respect, the family's and the
 * wife's opinion, the crew, stress, health, heat, the groups of the town,
 * perk-style modifiers through lifestyle.perkMod) and a pot that pays: the
 * boss's Pocket or the Family's money.
 *
 * The catch is the IRS. The government cannot prove the rackets, but it can
 * count: what the boss is seen to spend against the income he can explain
 * (his straight businesses, a vending company salary, a laundromat in a
 * cousin's name). Every visible purchase raises audit pressure, more when the
 * feds are already watching or dirty money is piling up; living beyond the
 * declared income raises it every week. At 100 comes a net-worth audit: back
 * taxes, penalties, federal heat and a sleepless boss. An accountant, a
 * respectable return, a company to own the cars: the ways out cost money too.
 *
 * Everything rolls on Spend's own stream (s.spend.rng), so buying a mink never
 * reshuffles the main dice. The state is optional: no purchase, no state.
 */

const $ = (n: number) => fmtMoney(Math.round(n));
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/* ------------------------------------------------------------------ */
/* People an item is for                                                */
/* ------------------------------------------------------------------ */

function bossOf(s: GameState): Character | undefined {
  return s.characters[s.playerId];
}

function kids(s: GameState): Character[] {
  const b = bossOf(s);
  return (b?.childrenIds ?? []).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
}

const age = (s: GameState, c: Character) => ageOn(c.birth, s.date);

/** The people who make an item make sense (a communion needs a child of seven or eight). */
export function reqTargets(s: GameState, req: SpendReq): Character[] {
  const b = bossOf(s);
  if (!b) return [];
  const k = kids(s);
  switch (req) {
    case 'spouse': { const w = b.spouseId ? s.characters[b.spouseId] : undefined; return w?.alive ? [w] : []; }
    case 'goomar': return activeGoomars(s).map((g) => s.characters[g.id]).filter((c): c is Character => !!c?.alive);
    case 'daughter': return k.filter((c) => c.gender === 'F');
    case 'son16': return k.filter((c) => c.gender === 'M' && age(s, c) >= 16);
    case 'kid': return k.filter((c) => age(s, c) >= 5 && age(s, c) <= 17);
    case 'baby': return k.filter((c) => age(s, c) < 1);
    case 'communion': return k.filter((c) => age(s, c) >= 7 && age(s, c) <= 8);
    case 'confirmation': return k.filter((c) => age(s, c) >= 12 && age(s, c) <= 14);
    case 'sixteen': return k.filter((c) => c.gender === 'F' && age(s, c) >= 15 && age(s, c) <= 16);
    case 'adultChild': return k.filter((c) => age(s, c) >= 18);
    case 'marriedChild': return k.filter((c) => !!c.spouseId);
    case 'parent': return [b.motherId, b.fatherId].map((id) => (id ? s.characters[id] : undefined)).filter((c): c is Character => !!c?.alive);
    case 'fallen': return Object.values(s.characters).filter((c) => !c.alive && c.faction === 'player' && c.id !== s.playerId && c.rank !== 'civilian' && !!c.death && s.week - c.death.week <= 26);
  }
}

const REQ_TEXT: Record<SpendReq, string> = {
  spouse: 'Needs a wife', goomar: 'Needs a goomar', daughter: 'Needs a daughter', son16: 'Needs a son of sixteen or more', kid: 'Needs a child of school age',
  baby: 'Needs a new baby', communion: 'Needs a child of seven or eight', confirmation: 'Needs a child of twelve to fourteen', sixteen: 'Needs a daughter of fifteen or sixteen',
  adultChild: 'Needs a grown child', marriedChild: 'Needs a married child', parent: 'Needs a living parent', fallen: 'Needs one of your men buried in the last six months',
};

/** For an `each` item: the next person it has not been done for. */
export function nextTarget(s: GameState, it: SpendItem): Character | undefined {
  if (!it.req) return undefined;
  const done = s.spend?.done ?? {};
  return reqTargets(s, it.req).find((c) => done[`${it.id}:${c.id}`] === undefined);
}

/** Who the `wife` opinion goes to. */
function recipients(s: GameState, it: SpendItem, target?: Character): Character[] {
  const g: GiftFor | undefined = it.gift;
  if (target && (g === 'daughter' || g === 'son')) return [target];
  if (g === 'goomar') return reqTargets(s, 'goomar').slice(0, 1);
  if (g === 'daughter') return reqTargets(s, 'daughter');
  if (g === 'son') return reqTargets(s, 'son16').slice(0, 1);
  if (g === 'mother') return reqTargets(s, 'parent').sort((a, b) => (a.gender === 'F' ? -1 : 0) - (b.gender === 'F' ? -1 : 0)).slice(0, 1);
  return reqTargets(s, 'spouse');
}

/* ------------------------------------------------------------------ */
/* Prices, ownership, value                                             */
/* ------------------------------------------------------------------ */

export function heads(s: GameState, it: SpendItem): number {
  switch (it.per) {
    case 'crew': return Math.max(3, crew(s).length);
    case 'capo': return Math.max(1, capos(s).length);
    case 'daughter': return Math.max(1, reqTargets(s, 'daughter').length);
    case 'child': return Math.max(1, kids(s).length);
    default: return 1;
  }
}

const roundPrice = (v: number) => (v >= 1000 ? Math.round(v / 50) * 50 : Math.round(v / 5) * 5);

export function spendPrice(s: GameState, it: SpendItem): number {
  return roundPrice(it.price * heads(s, it) * inflation(s));
}

export function spendUpkeep(s: GameState, it: SpendItem): number {
  return Math.round(it.up * inflation(s));
}

export function spendOwned(s: GameState): SpendOwned[] {
  return s.spend?.owned ?? [];
}

export function ownedCount(s: GameState, id: string): number {
  // The older Good Life catalog is folded in: what was bought there still counts here.
  return spendOwned(s).filter((o) => o.id === id).length + luxCount(s, id);
}

/** What it would fetch today (services fetch nothing). */
export function spendResale(s: GameState, o: SpendOwned): number {
  const it = SPEND_BY_ID[o.id];
  if (!it || it.kind !== 'own') return 0;
  const years = Math.max(0, s.date.y - o.year);
  return roundPrice(o.paid * (it.resale ?? 0) * Math.pow(1 + (it.drift ?? 0), years));
}

/** Weekly upkeep by pot, for everything owned or retained. */
export function spendUpkeepByPot(s: GameState): { pocket: number; family: number } {
  const out = { pocket: 0, family: 0 };
  for (const o of spendOwned(s)) {
    const it = SPEND_BY_ID[o.id];
    if (it) out[o.pot] += spendUpkeep(s, it);
  }
  return out;
}

/** Tags the house has: a boat (from the Spend catalog or the Good Life), a pool, a slip, a plane share… */
export function spendTags(s: GameState): Set<string> {
  const t = new Set<string>();
  for (const o of spendOwned(s)) for (const u of SPEND_BY_ID[o.id]?.unl ?? []) t.add(u);
  for (const o of ownedLux(s)) {
    const it = LUX_BY_ID[o.id];
    if (it?.cat === 'car' || it?.cat === 'truck') t.add('car');
    if (it?.cat === 'boat') { t.add('boat'); if (o.id === 'cruiser') t.add('bigboat'); }
    if (o.id === 'florida') t.add('florida');
    if (o.id === 'racehorse') t.add('horse');
  }
  return t;
}

const TAG_TEXT: Record<string, string> = {
  car: 'a car', boat: 'a boat', bigboat: 'a cabin cruiser or a sportfisherman', slip: 'a slip at the harbor', plane: 'a share in a plane', pool: 'a pool', club: 'a country club membership',
  horse: 'a racehorse', tux: 'a tuxedo', limo: 'a limousine', florida: 'a place in Florida', summer: 'a summer house', camp: 'a camp', safehouse: 'a safehouse',
};

/** Items with a limited stock: how many are left on the island. */
export function stockLeft(s: GameState, it: SpendItem): number | undefined {
  if (it.stock === undefined) return undefined;
  return Math.max(0, it.stock - (s.spend?.gone[it.id] ?? 0));
}

/* ------------------------------------------------------------------ */
/* The IRS: what is seen against what can be explained                  */
/* ------------------------------------------------------------------ */

const LEGIT = new Set(['bar', 'motel', 'pizza', 'arcade', 'stand', 'vending', 'restaurant', 'diner', 'laundromat']);

/** The income the boss can explain, a week: a salary on somebody's books, his straight businesses, his clean money. */
export function declaredWeekly(s: GameState): number {
  let straight = 0;
  for (const b of ownedBiz(s)) if (CATALOG[b.kind]?.category === 'front' || LEGIT.has(b.kind)) straight++;
  let legit = 0;
  try { legit = legitIncome(s); } catch { legit = 0; }
  return Math.round((100 + 40 * Math.min(15, straight) + spendMod(s, 'declared')) * inflation(s) + legit);
}

/** How much the watchers multiply what they see: the feds already looking, dirty money piling up. */
export function watchMult(s: GameState): number {
  return 1 + Math.max(0, s.heat.federal) / 100 + (s.unwashed > 20000 ? 0.3 : 0);
}

const shield = (s: GameState) => Math.min(0.75, spendMod(s, 'irsShield') / 100);

/** What the IRS sees of one purchase: the visible dollars. */
export function seenOf(s: GameState, it: SpendItem): number {
  return Math.round((spendPrice(s, it) * it.flash) / 10);
}

/** The federal heat and the audit pressure a purchase adds. */
export function irsCost(s: GameState, it: SpendItem): { heat: number; pressure: number; why: string } {
  const seen = seenOf(s, it);
  if (!seen) return { heat: 0, pressure: 0, why: '' };
  const year = declaredWeekly(s) * 52;
  const ratio = seen / Math.max(1, year);
  const w = watchMult(s);
  const sh = 1 - shield(s);
  let h = Math.round(ratio * 8 * w * sh);
  if (!h && it.flash >= 7 && seen >= 2000) h = 1;
  const why: string[] = [`seen ${$(seen)} against ${$(year)} a year you can explain`];
  if (s.heat.federal >= 40) why.push('the feds are already watching');
  if (s.unwashed > 20000) why.push('dirty money piling up');
  return { heat: Math.min(10, h), pressure: Math.round(Math.min(40, ratio * 30 * w * sh)), why: why.join('; ') };
}

/** The lifestyle the IRS sees a week: visible spending over the last year, and the visible upkeep. */
export function seenWeekly(s: GameState): number {
  const sp = s.spend;
  if (!sp) return 0;
  const bought = sp.seen.filter(([w]) => s.week - w < 52).reduce((a, [, v]) => a + v, 0) / 52;
  const kept = sp.owned.reduce((a, o) => { const it = SPEND_BY_ID[o.id]; return a + (it ? (spendUpkeep(s, it) * it.flash) / 10 : 0); }, 0);
  return Math.round(bought + kept);
}

/** Living beyond the declared income: seen lifestyle / explainable income (1 = exactly what you can explain). */
export function lavishness(s: GameState): number {
  return seenWeekly(s) / Math.max(1, declaredWeekly(s));
}

/* ------------------------------------------------------------------ */
/* Groups                                                                */
/* ------------------------------------------------------------------ */

function mainDistrict(s: GameState): string | undefined {
  let best: string | undefined;
  let v = -1;
  for (const d of s.districts) if ((d.influence.player ?? 0) > v) { v = d.influence.player ?? 0; best = d.id; }
  return best;
}

function groupEffects(s: GameState, g: Partial<Record<SpendGroup, number>>, title: string): Effect[] {
  const out: Effect[] = [];
  let respect = 0;
  let favors = 0;
  let local = 0;
  let infl = 0;
  for (const [k, a] of Object.entries(g) as [SpendGroup, number][]) {
    if (!a) continue;
    switch (k) {
      case 'church': respect += a / 4; infl += a / 3; break;
      case 'town': respect += a / 4; infl += a / 2; break;
      case 'society': respect += a / 3; break;
      case 'pols': favors += a / 3; break;
      case 'labor': favors += a / 4; infl += a / 4; break;
      case 'cops': local += a / 2; break;
      case 'press': local += a / 3; break;
      case 'philly': if (s.rivals.some((r) => r.id === 'philly')) out.push({ type: 'rivalOpinion', rival: 'philly', amount: a, reason: 'Pays his respects', label: `${title}: Philadelphia` }); break;
    }
  }
  const r = Math.round(respect);
  if (r) out.push({ type: 'respect', amount: r, label: `${title}: the town talks` });
  const f = Math.floor(favors);
  if (f) out.push({ type: 'favor', amount: f, label: `${title}: the politicians remember` });
  const l = Math.round(local);
  if (l) out.push({ type: 'heat', bar: 'local', amount: -l, label: `${title}: friends downtown` });
  const d = mainDistrict(s);
  const i = Math.round(infl);
  if (i && d) out.push({ type: 'influence', district: d, faction: 'player', amount: i, label: `${title}: goodwill in the neighborhood` });
  return out;
}

/* ------------------------------------------------------------------ */
/* Who notices                                                           */
/* ------------------------------------------------------------------ */

export function whoNotices(it: SpendItem): string[] {
  const out: string[] = [];
  if (it.gift === 'goomar') out.push('The goomar');
  else if (it.gift === 'daughter') out.push('Your daughters');
  else if (it.gift === 'mother') out.push('Your mother');
  else if (it.wife) out.push('Your wife');
  if (it.fam) out.push('The family');
  if (it.crew) out.push('The crew');
  for (const k of Object.keys(it.g ?? {}) as SpendGroup[]) out.push(GROUP_LABEL[k]);
  if (it.flash >= 3) out.push('The IRS');
  if (it.flash >= 6) out.push('The FBI');
  if (it.price >= 15000 && it.flash >= 5) out.push('The other families');
  if (it.risk) out.push('Maybe your wife');
  for (const n of it.notice ?? []) if (!out.some((x) => n.startsWith(x))) out.push(n);
  return [...new Set(out)];
}

/** One line on what it does, for the catalog row. */
export function effectSummary(it: SpendItem): string[] {
  const out: string[] = [];
  const sg = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  if (it.respect) out.push(`Respect ${sg(it.respect)}`);
  if (it.fam) out.push(`Family ${sg(it.fam)}`);
  if (it.wife) out.push(`${it.gift === 'goomar' ? 'Goomar' : it.gift === 'daughter' ? 'Daughters' : it.gift === 'mother' ? 'Your mother' : it.gift === 'son' ? 'Your son' : 'Wife'} ${sg(it.wife)}`);
  if (it.crew) out.push(`Crew ${sg(it.crew)}`);
  if (it.relief) out.push(`Stress −${it.relief}`);
  if (it.health) out.push(`Health +${it.health}`);
  if (it.parentHealth) out.push(`Parent's health +${it.parentHealth}`);
  for (const [k, v] of Object.entries(it.g ?? {}) as [SpendGroup, number][]) out.push(`${GROUP_LABEL[k]} ${sg(v)}`);
  for (const [k, v] of Object.entries(it.mods ?? {})) out.push(MOD_TEXT[k]?.(v as number) ?? `${k} ${sg(v as number)}`);
  if (it.unl?.length) out.push(`Opens: ${it.unl.map((u) => TAG_TEXT[u] ?? u).join(', ')}`);
  if (it.gamble) out.push(`A bet: ${Math.round(it.gamble.p * 100)}% to win ${it.gamble.win}×`);
  if (it.irsRelief) out.push(`IRS pressure −${it.irsRelief}`);
  if (it.kidAttr) out.push(`Children's ${it.kidAttr.attr} +${it.kidAttr.amount}`);
  return out;
}

const MOD_TEXT: Record<string, (v: number) => string> = {
  guard: (v) => `Harder to kill +${v}`, localHeat: () => 'Local heat cools faster', fedHeat: () => 'Federal heat cools faster', intel: (v) => `Digging +${v}%`,
  secrecy: (v) => `Secrecy ${v > 0 ? '+' : ''}${v}`, defection: () => 'Men drift away slower', declared: (v) => `Explains $${v}/wk of income`, irsShield: (v) => `IRS sees ${v}% less`,
  launder: (v) => `Washing +${v}%`, income: (v) => `Business income +${v}%`, raid: (v) => `Raids +${v}%`, hitPower: (v) => `Hits +${v}`, strikeDamage: (v) => `Rival strikes cost ${v}% less`,
  heirGrowth: () => 'Children grow faster', accept: (v) => `People say yes more (+${v})`,
};

/* ------------------------------------------------------------------ */
/* Can it be bought now                                                 */
/* ------------------------------------------------------------------ */

const MONTH = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Why it can't be had right now, money aside (undefined: it can). */
export function spendBlock(s: GameState, it: SpendItem): string | undefined {
  const y = s.date.y;
  if ((it.minYear ?? 0) > y) return `Not before ${it.minYear}`;
  if ((it.maxYear ?? 9999) < y) return `Gone after ${it.maxYear}`;
  if (it.months && !it.months.includes(s.date.m)) return `Only in ${it.months.map((m) => MONTH[m]).join(', ')}`;
  const tags = spendTags(s);
  const missing = (it.needs ?? []).filter((n) => !tags.has(n));
  if (missing.length) return `Needs ${missing.map((n) => TAG_TEXT[n] ?? n).join(' and ')}`;
  if (it.req && !reqTargets(s, it.req).length) return REQ_TEXT[it.req];
  if (it.each && !nextTarget(s, it)) return 'Done for every one of them';
  if (it.kind !== 'once' && ownedCount(s, it.id) >= (it.limit ?? 1)) return it.kind === 'svc' ? 'Already on the payroll' : 'You already have it';
  const left = stockLeft(s, it);
  if (left === 0) return 'Sold out: there are no more on the island';
  const last = s.spend?.last[it.id];
  const cd = it.kind === 'once' ? it.cd ?? 1 : 0;
  if (last !== undefined && cd && s.week - last < cd) return `Not again so soon (in ${cd - (s.week - last)} week${cd - (s.week - last) === 1 ? '' : 's'})`;
  return undefined;
}

/** Rivals with the most to resent a show of money. */
function rivalsWhoNotice(s: GameState): RivalId[] {
  return s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive).map((r) => r.id).slice(0, 2);
}

/* ------------------------------------------------------------------ */
/* Preview & commit                                                      */
/* ------------------------------------------------------------------ */

function verbFor(it: SpendItem): string {
  if (it.kind === 'svc') return 'Hire';
  if (it.gamble) return 'Play';
  if (it.kind === 'once') return 'Pay for';
  return 'Buy';
}

export function previewSpend(s: GameState, a: SpendAction): ActionPreview {
  if (a.op === 'buy') return previewBuy(s, a);
  if (a.op === 'race') return previewRace(s, a.uid, a.race);
  if (a.op === 'share') return previewShare(s, a);
  return previewSell(s, a.uid);
}

/** The agreed price of a buy order: the asking price, or an offer the seller accepted (store.ts). */
export function dealPrice(s: GameState, it: SpendItem, offer?: number): { price: number; why?: string } {
  const list = spendPrice(s, it);
  if (offer === undefined || offer >= list) return { price: list };
  const c = counterOffer(s, it, offer);
  if (c.ok) return { price: c.price };
  return { price: list, why: `He won't take ${$(offer)}: his best is ${$(haggleFloor(s, it, list))}` };
}

function previewBuy(s: GameState, a: Extract<SpendAction, { op: 'buy' }>): ActionPreview {
  const id = a.item;
  const it = SPEND_BY_ID[id];
  if (!it) return { title: 'Spend', effects: [], cost: 0, because: '', disabledReason: 'No such thing', category: 'event' };
  const deal = dealPrice(s, it, a.offer);
  const price = deal.price;
  const fin = a.finance ? financeTerms(s, it, price) : undefined;
  const pay = fin ? fin.down : price;
  const target = it.each ? nextTarget(s, it) : undefined;
  const forName = target ? ` (${target.firstName})` : '';
  const title = `${it.name}${forName}`;
  const effects: Effect[] = [];
  let why = spendBlock(s, it) ?? deal.why;
  if (a.finance && !fin) why ??= 'Nobody finances that';
  const payTitle = fin ? `${title}: the down payment` : title;
  if (it.pot === 'pocket') {
    const pp = pocketPrice(s, pay, payTitle);
    effects.push(...pp.effects);
    why ??= pp.why;
  } else {
    effects.push({ type: 'money', amount: -pay, label: payTitle });
    if (!why && s.money < pay) why = `Needs ${$(pay)} of Family money (the Family has ${$(Math.max(0, s.money))})`;
  }
  if (it.respect) effects.push({ type: 'respect', amount: it.respect, label: title });
  if (it.fam) effects.push({ type: 'familyOpinion', amount: it.fam, reason: it.fam > 0 ? 'Provides for the family' : 'The house is full of his men again', label: title });
  if (it.wife) for (const c of recipients(s, it, target)) {
    // A present lands differently with different people (store.ts giftFit).
    const fit = it.gift ? giftFit(s, it, c) : { mult: 1 };
    const amt = Math.round(it.wife * fit.mult);
    if (amt) effects.push({ type: 'opinion', from: c.id, to: s.playerId, amount: amt, reason: `${it.name.replace(/ for (your|the) .*$/, '')}`, label: title });
  }
  if (it.crew) effects.push({ type: 'crewOpinion', amount: it.crew, reason: it.crew > 0 ? 'The boss takes care of his own' : 'The boss spends on himself', label: title });
  if (it.relief) effects.push({ type: 'dyn', op: { op: 'stress', charId: s.playerId, amount: -it.relief, source: 'paranoia' }, label: title });
  if (it.health) effects.push({ type: 'health', charId: s.playerId, amount: it.health, label: title });
  if (it.parentHealth) for (const p of reqTargets(s, 'parent').slice(0, 1)) effects.push({ type: 'health', charId: p.id, amount: it.parentHealth, label: title });
  if (it.kidAttr) for (const k of target ? [target] : reqTargets(s, it.req ?? 'kid')) effects.push({ type: 'dyn', op: { op: 'attr', charId: k.id, attr: it.kidAttr.attr, amount: it.kidAttr.amount }, label: title });
  if (it.g) effects.push(...groupEffects(s, it.g, title));
  effects.push(...styleEffects(s, it, title));
  const irs = irsCost(s, it);
  if (irs.heat) effects.push({ type: 'heat', bar: 'federal', amount: irs.heat, label: `${title}: the IRS counts (${irs.why})` });
  if (spendPrice(s, it) >= 15000 && it.flash >= 5) for (const r of rivalsWhoNotice(s)) effects.push({ type: 'rivalOpinion', rival: r, amount: -2, reason: 'Flashing his money around', label: `${title}: the other families notice` });
  const notes: string[] = [];
  if (fin) notes.push(`${$(fin.down)} down, then ${$(fin.pay)}/wk for ${fin.weeks} weeks (${fin.lender}, ${Math.round(fin.rate * 100)}%)`);
  if (price < spendPrice(s, it)) notes.push(`Negotiated down from ${$(spendPrice(s, it))}`);
  const up = spendUpkeep(s, it);
  if (up) notes.push(it.kind === 'svc' ? `${$(up)}/wk until you let him go` : `Upkeep ${$(up)}/wk`);
  if (it.kind === 'own' && (it.resale ?? 0) > 0) notes.push(`Sells for about ${Math.round((it.resale ?? 0) * 100)}% later`);
  if (irs.pressure) notes.push(`IRS audit pressure +${irs.pressure}`);
  if (it.irsRelief) notes.push(`IRS audit pressure −${it.irsRelief}`);
  if (it.gamble) notes.push(`${Math.round(it.gamble.p * 100)}% to win ${$(price * it.gamble.win)}`);
  if (it.risk) notes.push(`${Math.round(it.risk.p * 100)}% your wife finds out`);
  const left = stockLeft(s, it);
  if (left !== undefined && left > 0) notes.push(left === 1 ? 'The last one on the island' : `${left} left on the island`);
  if (notes.length) effects.push({ type: 'econ', op: { op: 'note', text: notes.join(' · ') }, label: title } as Effect);
  const pot = it.pot === 'pocket' ? 'pocket' as const : undefined;
  return {
    title, detail: it.blurb, effects, cost: pay, pot,
    because: `${verbFor(it) === 'Hire' ? 'hired' : verbFor(it) === 'Play' ? 'played' : verbFor(it) === 'Pay for' ? 'paid for' : 'bought'} ${lower(it.name.replace(/^An? /, 'a '))}${forName}`,
    disabledReason: why, category: 'event', verb: fin ? `Finance — ${$(fin.down)} down` : `${verbFor(it)} — ${$(price)}`,
    warning: irs.heat >= 3 || (s.spend?.irs ?? 0) + irs.pressure >= 80 ? 'The IRS can count. Living past what your books explain ends in a net-worth audit.' : undefined,
  };
}

function previewSell(s: GameState, uid: string): ActionPreview {
  const o = spendOwned(s).find((x) => x.uid === uid);
  const it = o ? SPEND_BY_ID[o.id] : undefined;
  if (!o || !it) return { title: 'Sell', effects: [], cost: 0, because: '', disabledReason: 'Not yours', category: 'event' };
  const svc = it.kind === 'svc';
  const v = spendResale(s, o);
  const holder = o.holder ? s.characters[o.holder] : undefined;
  const title = svc ? `Let go: ${lower(it.name)}` : `Sell ${lower(it.name.replace(/^An? /, 'the '))}`;
  const effects: Effect[] = [];
  if (v > 0) effects.push(o.pot === 'pocket' ? { type: 'money', amount: v, pot: 'pocket', label: title } : { type: 'money', amount: v, category: 'event', label: title });
  if ((it.fam ?? 0) >= 5) effects.push({ type: 'familyOpinion', amount: -Math.ceil((it.fam ?? 0) / 2), reason: svc ? 'Cut back on the house' : 'Sold something we loved', label: title });
  if ((it.crew ?? 0) >= 3) effects.push({ type: 'crewOpinion', amount: -Math.ceil((it.crew ?? 0) / 2), reason: 'The boss is cutting back on his men', label: title });
  if (!effects.length) effects.push({ type: 'econ', op: { op: 'note', text: svc ? 'No more upkeep' : 'It fetches nothing' }, label: title } as Effect);
  return {
    title, detail: svc ? `${$(spendUpkeep(s, it))}/wk saved.` : `Paid ${$(o.paid)} in ${o.year}; worth ${$(v)} today.`, effects, cost: 0,
    because: svc ? `let go ${lower(it.name)}` : `sold ${lower(it.name.replace(/^An? /, 'the '))}`, category: 'event', verb: svc ? 'Let go' : `Sell — ${$(v)}`,
    disabledReason: holder?.alive ? `It's ${holder.firstName}'s, not yours to sell` : undefined,
  };
}

function slog(s: GameState, text: string): void {
  const sp = ensureSpend(s);
  sp.log.push([s.week, text]);
  if (sp.log.length > 40) sp.log.splice(0, sp.log.length - 40);
}

export function commitSpend(ctx: Ctx, a: SpendAction): void {
  const s = ctx.s;
  const sp = ensureSpend(s);
  if (a.op === 'sell') {
    sp.owned = sp.owned.filter((o) => o.uid !== a.uid);
    if (sp.loans?.some((l) => l.uid === a.uid)) {
      // Selling something bought on time: the buyer's money pays the bank first (the rest of the loan is settled).
      const l = sp.loans.find((x) => x.uid === a.uid)!;
      if (l.pot === 'pocket') spendPocket(ctx, l.left, `Paid off on the sale: ${SPEND_BY_ID[l.item]?.name ?? 'a purchase'}`, `loanoff${l.uid}`, true);
      else money(ctx, -l.left, `Paid off on the sale: ${SPEND_BY_ID[l.item]?.name ?? 'a purchase'}`, 'debt');
      sp.loans = sp.loans.filter((x) => x !== l);
    }
    return;
  }
  if (a.op === 'race') { commitRace(ctx, a.uid, a.race); return; }
  if (a.op === 'share') { commitShare(ctx, a); return; }
  const it = SPEND_BY_ID[a.item];
  if (!it) return;
  const price = dealPrice(s, it, a.offer).price;
  const fin = a.finance ? financeTerms(s, it, price) : undefined;
  const target = it.each ? nextTarget(s, it) : undefined;
  const irs = irsCost(s, it);
  if (it.kind !== 'once') {
    const uid = `sp${sp.nextId++}`;
    // A present that is hers stays hers (the wife's jewelry is not the boss's to sell).
    const holder = ownershipOf(it) === 'recipient' ? (target ?? recipients(s, it, target)[0])?.id : undefined;
    sp.owned.push({ uid, id: it.id, paid: price, pot: it.pot, week: s.week, year: s.date.y, ...(holder ? { holder } : {}) });
    if (fin) (sp.loans ??= []).push({ uid, item: it.id, pot: it.pot, pay: fin.pay, left: fin.total, missed: 0, lender: fin.lender });
  }
  sp.last[it.id] = s.week;
  if (it.gift && it.wife) for (const c of recipients(s, it, target)) {
    const g = ((sp.gifts ??= {})[c.id] ??= []);
    g.push(s.week);
    if (g.length > 10) g.splice(0, g.length - 10);
  }
  if (it.stock !== undefined) sp.gone[it.id] = (sp.gone[it.id] ?? 0) + 1;
  if (target) sp.done[`${it.id}:${target.id}`] = s.week;
  const seen = seenOf(s, it);
  if (seen) sp.seen.push([s.week, seen]);
  sp.seen = sp.seen.filter(([w]) => s.week - w < 52);
  sp.spent[it.pot] += fin ? fin.down : price;
  for (const [k, v] of Object.entries(it.g ?? {}) as [SpendGroup, number][]) sp.standing[k] = (sp.standing[k] ?? 0) + v;
  sp.irs = Math.max(0, Math.min(100, sp.irs + irs.pressure - (it.irsRelief ?? 0)));
  if (sp.irs < 60) sp.warned = false;
  if (it.gamble) {
    if (rand(sp) < it.gamble.p) {
      const win = Math.round(price * it.gamble.win);
      if (it.pot === 'pocket') earnPocket(ctx, win, `${it.name}: a winner`, `spw${sp.nextId++}`);
      else money(ctx, win, `${it.name}: a winner`, 'event');
      const text = `${it.name}: you won ${$(win)}.`;
      ctx.log.push(text);
      slog(s, text);
    } else {
      slog(s, `${it.name}: you lost ${$(price)}.`);
    }
  }
  if (it.risk && rand(sp) < it.risk.p) {
    const w = reqTargets(s, 'spouse')[0];
    if (w) {
      addOpinion(s, w.id, s.playerId, it.risk.text, it.risk.wife, 0.5);
      ctx.log.push(it.risk.text);
      slog(s, it.risk.text);
    }
  }
  slog(s, `${verbFor(it) === 'Hire' ? 'Hired' : verbFor(it) === 'Play' ? 'Played' : verbFor(it) === 'Pay for' ? 'Paid for' : 'Bought'}: ${lower(it.name)}${target ? ` (${target.firstName})` : ''}, ${$(price)}.`);
}

/* ------------------------------------------------------------------ */
/* The week                                                              */
/* ------------------------------------------------------------------ */

/** Back taxes and penalties: a fifth of what was seen over the year, at least $2,000. */
export function auditBill(s: GameState): number {
  const seen = (s.spend?.seen ?? []).filter(([w]) => s.week - w < 52).reduce((a, [, v]) => a + v, 0);
  return roundPrice(Math.max(2000 * inflation(s), seen * 0.2));
}

export function spendWeek(ctx: Ctx): void {
  const s = ctx.s;
  const sp = s.spend;
  if (!sp) return;
  // Services whose reason is gone (no wife for the maid, the parent passed) end themselves.
  for (const o of [...sp.owned]) {
    const it = SPEND_BY_ID[o.id];
    if (!it) { sp.owned = sp.owned.filter((x) => x !== o); continue; }
    if (it.kind === 'svc' && it.req && !reqTargets(s, it.req).length && it.req !== 'fallen') {
      sp.owned = sp.owned.filter((x) => x !== o);
      slog(s, `No more need for ${lower(it.name)}: let go.`);
    }
  }
  // Upkeep, by pot.
  const up = spendUpkeepByPot(s);
  const n = sp.owned.length;
  if (up.pocket > 0) spendPocket(ctx, up.pocket, `Spend: upkeep and staff (${n} thing${n === 1 ? '' : 's'})`, 'spendup', true);
  if (up.family > 0) money(ctx, -up.family, 'Spend: the pad, retainers and upkeep', 'cost');
  // A nurse keeps a parent going.
  if (s.week % 4 === 0) {
    const nurse = sp.owned.some((o) => (SPEND_BY_ID[o.id]?.parentHealth ?? 0) > 0 && SPEND_BY_ID[o.id]?.kind === 'svc');
    if (nurse) for (const p of reqTargets(s, 'parent')) p.health = Math.min(100, p.health + 1);
  }
  // Goodwill fades.
  if (s.week % 4 === 0) for (const k of Object.keys(sp.standing) as SpendGroup[]) { const v = sp.standing[k] ?? 0; sp.standing[k] = v > 0 ? v - 1 : v < 0 ? v + 1 : 0; }
  // Somebody else buys one of the last ones.
  for (const it of SPEND) {
    const left = stockLeft(s, it);
    if (!left) continue;
    if (rand(sp) < 0.004) {
      sp.gone[it.id] = (sp.gone[it.id] ?? 0) + 1;
      const r = s.rivals.filter((x) => x.kind === 'mob')[Math.floor(rand(sp) * Math.max(1, s.rivals.filter((x) => x.kind === 'mob').length))];
      slog(s, `${r?.shortName ?? 'Somebody from Philadelphia'} bought ${left === 1 ? 'the last' : 'one of the'} ${lower(it.name.replace(/^An? /, ''))}${left === 1 ? ' on the island' : ''}.`);
    }
  }
  sp.seen = sp.seen.filter(([w]) => s.week - w < 52);
  // The IRS: living past the declared income.
  const lav = lavishness(s);
  const sh = 1 - shield(s);
  if (lav > 1.2) sp.irs = Math.min(100, sp.irs + Math.min(6, (lav - 1) * 3) * watchMult(s) * sh);
  else sp.irs = Math.max(0, sp.irs - 1.5);
  sp.irs = Math.round(sp.irs * 10) / 10;
  if (sp.irs >= 60 && !sp.warned) {
    sp.warned = true;
    const text = 'A man from the IRS was at the bank asking about your accounts. Your banker called you from a pay phone.';
    ctx.log.push(text);
    slog(s, text);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
  }
  if (sp.irs >= 100) {
    const bill = auditBill(s);
    spendPocket(ctx, bill, 'The IRS: back taxes and penalties (a net-worth audit)', 'irsaudit');
    heat(ctx, 'federal', 8, 'The IRS: a net-worth audit (your lifestyle against your returns)', 'heat');
    if (bossOf(s)?.alive) addStress(s, s.playerId, 10, 'irs');
    sp.irs = 30;
    sp.warned = false;
    sp.audits++;
    const text = `The IRS did a net-worth audit: what you own and spend against what you declared. Back taxes and penalties: ${$(bill)}. The file goes to the FBI.`;
    ctx.log.push(text);
    slog(s, text);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
  }
}

/* ------------------------------------------------------------------ */
/* For other systems                                                    */
/* ------------------------------------------------------------------ */

export interface GiftableItem {
  id: string;
  name: string;
  cat: SpendCat;
  /** Today's price (inflated, per head where it applies). */
  price: number;
  for: GiftFor;
  blurb: string;
  /** How much the recipient's opinion moves (the catalog's own number). */
  opinion: number;
  /** How visible (0-10): the IRS counts presents too. */
  flash: number;
}

/**
 * The gift catalog: everything in Spend that can be given to a person (jewelry,
 * furs, watches, cars, cufflinks). Other systems (deep relationships) can list
 * and price presents from here; giving one is theirs to model.
 */
export function giftableItems(s?: GameState, who?: GiftFor): GiftableItem[] {
  return SPEND.filter((it) => it.gift && (!who || it.gift === who || it.gift === 'anyone') && (!s || ((it.minYear ?? 0) <= s.date.y && (it.maxYear ?? 9999) >= s.date.y)))
    .map((it) => ({ id: it.id, name: it.name, cat: it.cat, price: s ? roundPrice(it.price * inflation(s)) : it.price, for: it.gift!, blurb: it.blurb, opinion: it.wife ?? Math.max(2, it.respect ?? 0), flash: it.flash }));
}

/** For the sim: something affordable and sensible to buy now and then. */
export function spendActions(s: GameState): SpendAction[] {
  const out: SpendAction[] = [];
  for (const it of SPEND) {
    if (spendBlock(s, it)) continue;
    const p = spendPrice(s, it);
    if (it.pot === 'pocket' ? p <= (s.tribute?.acct.personal ?? 0) * 0.5 : p * 5 <= s.money) out.push({ op: 'buy', item: it.id });
  }
  return out;
}

/** The pocket-paid things the boss owns, for his net worth. */
export function spendPossessions(s: GameState): number {
  return spendOwned(s).filter((o) => o.pot === 'pocket').reduce((a, o) => a + spendResale(s, o), 0);
}
