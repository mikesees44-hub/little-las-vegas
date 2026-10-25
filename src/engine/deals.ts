import { previewAction, type ActionPreview } from './actions';
import { CATALOG } from './catalog';
import { player } from './characters';
import { addStory } from './hierarchy';
import { commitEcon, placeName } from './econ';
import { ensureEcon, type Lot, type Manager, type ManagerSource, type ZoneId } from './econState';
import { fmtMoney } from './effects';
import type { Ctx } from './ledger';
import { managerFromChar, managerFromPro, proCandidates, rankManagers } from './managers';
import { getPerson } from './polPeople';
import { goodwill, inflation, lotName, USES_BY_ID, ZONES_BY_ID } from './property';
import { hashSeed, rand } from './rng';
import type { BusinessKind, Effect, GameState, PlayerAction } from './types';
import { ALL_PEOPLE, type WorldPerson } from '../worldpack';

/**
 * The Deal: buying a business or a property is a contract across a desk, not
 * a button. A named seller from the island's population (a realtor or a bank
 * man for honest property, a fence, a fixer or a numbers banker for a racket)
 * names a price. You pay it, haggle (the odds and the reasons are shown; a
 * failed haggle sours him and the price goes up), or pay part of it in cash
 * under the table (cheaper, spends dirty money, and the IRS gets curious).
 * Then you decide who runs the place, and sign.
 *
 * Pure and deterministic: a haggle is decided by the game seed, the property
 * and the month (the seller remembers for the month), so the window can show
 * the outcome the moment you push, and the order resolves the same way when
 * the week turns. The purchase itself is one order (`{ kind: 'econ', op:
 * { type: 'deal' } }`) with named ledger lines.
 */

export type DealTarget = { kind: 'lot'; lotId: string; going?: boolean } | { kind: 'biz'; biz: BusinessKind; district: string };

/** Who runs the place: a man of yours, a hired local, the old owner (going concerns), or nobody. */
export type DealManager = { source: ManagerSource; charId?: string; pro?: number } | { keep: true };

export interface DealTerms {
  /** Haggle attempts made (0..2). Rounds stop at the first one that fails. */
  haggles: number;
  /** Share of the agreed price paid in cash under the table. */
  cash: 0 | 0.25 | 0.5;
  mgr?: DealManager;
}

export const MAX_HAGGLES = 2;
export const CASH_SHARES = [0, 0.25, 0.5] as const;
/** The seller knocks this much off the part he never has to declare. */
export const CASH_DISCOUNT = 0.2;
const HAGGLE_CUT = [0.1, 0.06];
const SOUR_RISE = 0.05;

export interface Seller {
  id: string;
  name: string;
  /** "Real estate agent, Wexler Realty" */
  role: string;
  /** What kind of seller: a realtor (or bank) for honest property, a street seller for a racket. */
  shady: boolean;
  traits: string[];
  /** One line on how he deals. */
  line: string;
  /** For the sign: what he says as the pen goes down. */
  lastLine: (soured: boolean, cash: number) => string;
  /** Selling on someone's behalf (a going concern's old owner). */
  forWhom?: string;
}

export interface HaggleRound {
  chance: number;
  reasons: { label: string; value: number }[];
  ok: boolean;
  /** Price after this round. */
  price: number;
}

export interface DealView {
  key: string;
  target: DealTarget;
  place: string;
  where: string;
  seller: Seller;
  asking: number;
  rounds: HaggleRound[];
  soured: boolean;
  /** Price after haggling (before the cash discount). */
  agreed: number;
  cashPart: number;
  booksPart: number;
  /** Total paid. */
  price: number;
  /** Odds for the next haggle (if one is still possible). */
  next?: { chance: number; reasons: { label: string; value: number }[] };
  /** Why cash is refused (an honest seller). */
  cashBlock?: string;
  /** Federal heat from the cash. */
  fedHeat: number;
  /** Expected weekly take, for the manager step (0 when there is nothing to run). */
  take: number;
  /** Is there a place to run (a business, a going concern)? */
  runs: boolean;
  /** Why there is no one to pick (vacant land, a tenant's own shop). */
  runsWhy?: string;
  /** A going concern's old owner can stay on. */
  oldOwner?: string;
  /** Key for the manager's pro candidates (the hired locals). */
  mgrKey: string;
}

/* ---------------- the target ---------------- */

export function dealKey(t: DealTarget): string {
  return t.kind === 'lot' ? `lot:${t.lotId}${t.going ? ':going' : ''}` : `biz:${t.biz}:${t.district}`;
}

/** The plain order a deal wraps (its checks and effects are reused). */
export function baseAction(t: DealTarget): PlayerAction {
  return t.kind === 'lot' ? { kind: 'econ', op: { type: 'buyLot', lotId: t.lotId, going: t.going } } : { kind: 'buyBusiness', biz: t.biz, district: t.district };
}

/** The deal for a plain buy order (undefined for anything else). */
export function targetOf(a: PlayerAction): DealTarget | undefined {
  if (a.kind === 'buyBusiness') return { kind: 'biz', biz: a.biz, district: a.district };
  if (a.kind === 'econ' && a.op.type === 'buyLot') return { kind: 'lot', lotId: a.op.lotId, going: a.op.going };
  if (a.kind === 'econ' && a.op.type === 'deal') return a.op.target;
  return undefined;
}

export function sameTarget(a: DealTarget, b: DealTarget): boolean {
  return dealKey(a) === dealKey(b);
}

function lotOf(s: GameState, t: DealTarget): Lot | undefined {
  return t.kind === 'lot' ? s.econ?.lots.find((l) => l.id === t.lotId) : undefined;
}

function isShady(t: DealTarget): boolean {
  if (t.kind === 'lot') return false;
  return CATALOG[t.biz].category === 'racket';
}

/* ---------------- the seller ---------------- */

const REALTY_IDS = ['civ_sylvia_wexler', 'civ_harold_vogel', 'civ_patrick_loftus', 'civ_elliott_burnside', 'law_hollis_mather'];
const STREET_SPECS = new Set(['fence', 'fixer', 'shylock', 'numbers-banker', 'club-owner']);

function alive(s: GameState, w: WorldPerson): boolean {
  if (w.deathYear !== undefined && w.deathYear <= s.date.y) return false;
  if (w.activeFrom && w.activeFrom > s.date.y) return false;
  if (s.date.y - w.birthYear < 21) return false;
  const p = s.pol ? getPerson(s, w.id) : undefined;
  return !p || (p.alive && !p.retired);
}

let poolCache: { legit: WorldPerson[]; owners: WorldPerson[]; street: WorldPerson[] } | undefined;
function pools() {
  if (!poolCache) {
    const by = new Map(ALL_PEOPLE.map((p) => [p.id, p]));
    poolCache = {
      legit: REALTY_IDS.map((id) => by.get(id)).filter((p): p is WorldPerson => !!p),
      owners: ALL_PEOPLE.filter((p) => p.institution === 'business' && /^Owner/.test(p.office) && !!p.civilian?.establishment),
      street: ALL_PEOPLE.filter((p) => p.institution === 'street' && STREET_SPECS.has(p.street?.specialty ?? '') && (p.street?.currentlyWith ?? 'none') === 'none'),
    };
  }
  return poolCache;
}

const TRAIT_LINES: Record<string, string> = {
  Greedy: 'Every number out of {his} mouth has a little extra on it.',
  Cunning: '{He} reads the room before {he} reads the contract.',
  Patient: '{He} will sit there all afternoon. {He} has nowhere else to be.',
  Discreet: '{He} never says a name out loud, and expects the same.',
  Charming: '{He} makes you feel like the deal was your idea.',
  Ambitious: '{He} wants this off {his} hands so {he} can buy something bigger.',
  Honest: '{He} shows you the books, the real ones. Cash under the table insults {him}.',
  Cowardly: '{He} keeps looking at the door, and at your driver.',
  Paranoid: '{He} checks the window twice before naming a figure.',
  'Hot-headed': 'Push {him} and {he} pushes back harder.',
  Gambler: '{He} likes a little action, even on the price.',
  Vain: '{He} wants you to admire the place before {he} talks money.',
  Sentimental: '{He} built this. Letting it go costs {him} something you can\'t pay for.',
  Brave: '{He} has said no to tougher men than you.',
  'Loyal-to-a-fault': '{He} wants to know the people {he} sold to will be looked after.',
  Vengeful: '{He} remembers every man who ever shorted {him}.',
  Pious: '{He} crosses {himself} before {he} signs anything.',
  Drinker: '{He} pours two before the first number comes up.',
};

function pronouns(text: string, female: boolean): string {
  return text.replace(/\{He\}/g, female ? 'She' : 'He').replace(/\{he\}/g, female ? 'she' : 'he').replace(/\{his\}/g, female ? 'her' : 'his').replace(/\{him\}/g, female ? 'her' : 'him').replace(/\{himself\}/g, female ? 'herself' : 'himself');
}

function lastLines(w: WorldPerson, shady: boolean): (soured: boolean, cash: number) => string {
  const f = w.sex === 'F';
  return (soured, cash) => {
    if (soured) return shady ? '"You got what you wanted. Don\'t come back for a favor."' : `"Pleasure, I'm sure." ${f ? 'She' : 'He'} doesn't offer a hand.`;
    if (cash > 0) return shady ? '"Cash. Like a gentleman. Nobody\'s ever heard of either of us."' : '"The envelope stays between us. The deed says what the deed says."';
    if (w.traits.includes('Sentimental')) return '"Take care of it. It took care of me."';
    if (w.traits.includes('Greedy')) return '"Pleasure doing business. Remember who sold it to you."';
    return shady ? '"It\'s yours. What happens there now is your business, not mine."' : '"Congratulations. The keys are in the envelope."';
  };
}

/** The seller across the desk: the same person for the same property. */
export function sellerFor(s: GameState, t: DealTarget): Seller {
  const shady = isShady(t);
  const l = lotOf(s, t);
  const p = pools();
  const front = t.kind === 'biz' && CATALOG[t.biz].category !== 'racket';
  const list = (shady ? p.street : front ? [...p.owners, ...p.legit] : p.legit).filter((w) => alive(s, w));
  const fallback = p.legit[0];
  const h = { rng: hashSeed(`${s.seed}:seller:${dealKey(t)}`) };
  const w = list.length ? list[Math.floor(rand(h) * list.length)] : fallback;
  const female = w.sex === 'F';
  const traits = w.traits.filter((x) => TRAIT_LINES[x]);
  const lineTrait = traits[0];
  const role = shady ? `${w.office}${w.street?.specialty === 'fence' ? '' : ''}` : w.office;
  const reputation = w.publicReputation.replace(/\.$/, '');
  return {
    id: w.id,
    name: `${w.name.first} ${w.name.last}`,
    role,
    shady,
    traits,
    line: `${reputation}. ${lineTrait ? pronouns(TRAIT_LINES[lineTrait], female) : ''}`.trim(),
    lastLine: lastLines(w, shady),
    forWhom: l && t.kind === 'lot' && t.going && l.tenant ? l.tenant : undefined,
  };
}

/* ---------------- the price ---------------- */

/** The asking price before any haggling (a greedy seller asks a little more). */
export function askingPrice(s: GameState, t: DealTarget, seller = sellerFor(s, t)): number {
  let base: number;
  if (t.kind === 'lot') {
    const l = lotOf(s, t);
    base = l ? l.price + (t.going ? goodwill(s, l) : 0) : 0;
  } else base = CATALOG[t.biz].cost;
  const mark = seller.traits.includes('Greedy') ? 1.08 : 1;
  return Math.round((base * mark) / 50) * 50;
}

function zoneOf(s: GameState, t: DealTarget): ZoneId | undefined {
  const l = lotOf(s, t);
  if (l) return l.zone;
  if (t.kind === 'biz') return (Object.keys(ZONES_BY_ID) as ZoneId[]).find((z) => ZONES_BY_ID[z].district === t.district);
  return undefined;
}

/** Odds that haggle `i` (0-based) works, with the reasons. */
export function haggleOdds(s: GameState, t: DealTarget, i: number, seller = sellerFor(s, t)): { chance: number; reasons: { label: string; value: number }[] } {
  const me = s.characters[s.playerId] ? player(s) : undefined;
  const reasons: { label: string; value: number }[] = [{ label: 'Base', value: 40 }];
  if (me) {
    const d = Math.round((me.attributes.diplomacy - 50) / 2);
    if (d) reasons.push({ label: `Your diplomacy ${me.attributes.diplomacy}`, value: d });
  }
  if (seller.shady) {
    const r = Math.round((s.respect - 40) / 3);
    if (r) reasons.push({ label: r > 0 ? `Your respect ${s.respect}: he knows who you are` : `Respect ${s.respect}: nobody's afraid of you yet`, value: r });
  } else {
    const z = zoneOf(s, t);
    const rep = z ? s.econ?.zones[z]?.rep ?? 0 : 0;
    if (rep >= 10) reasons.push({ label: 'The neighborhood speaks well of you', value: Math.min(10, Math.round(rep / 5)) });
    if (s.heat.local >= 50) reasons.push({ label: 'Your name is in the papers: she wants this over with', value: -8 });
  }
  const tr = seller.traits;
  if (tr.includes('Greedy')) reasons.push({ label: 'Greedy: hates to give an inch', value: -10 });
  if (tr.includes('Cunning')) reasons.push({ label: 'Cunning: has done this before', value: -8 });
  if (tr.includes('Patient')) reasons.push({ label: 'Patient: can wait for a better buyer', value: -6 });
  if (tr.includes('Cowardly')) reasons.push({ label: 'Nervous around you', value: 12 });
  if (tr.includes('Gambler') || tr.includes('Drinker')) reasons.push({ label: 'Likes a little action', value: 6 });
  if (tr.includes('Sentimental')) reasons.push({ label: 'Wants it in good hands, not the best price', value: 6 });
  if (tr.includes('Hot-headed') || tr.includes('Brave')) reasons.push({ label: 'Doesn\'t scare', value: -6 });
  if (t.kind === 'lot' && lotOf(s, t)?.bidder) reasons.push({ label: 'Another buyer is bidding', value: -12 });
  if (i > 0) reasons.push({ label: 'You already pushed once', value: -15 });
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.1, Math.min(0.85, sum / 100)), reasons };
}

function haggleRoll(s: GameState, t: DealTarget, i: number): number {
  const h = { rng: hashSeed(`${s.seed}:haggle:${dealKey(t)}:${s.date.y}-${s.date.m}:${i}`) };
  return rand(h);
}

/** The whole deal, as the window shows it and the order pays it. */
export function dealView(s: GameState, t: DealTarget, terms: DealTerms): DealView {
  const seller = sellerFor(s, t);
  const asking = askingPrice(s, t, seller);
  let price = asking;
  const rounds: HaggleRound[] = [];
  let soured = false;
  const n = Math.max(0, Math.min(MAX_HAGGLES, terms.haggles));
  for (let i = 0; i < n && !soured; i++) {
    const o = haggleOdds(s, t, i, seller);
    const ok = haggleRoll(s, t, i) < o.chance;
    price = Math.round((ok ? price * (1 - HAGGLE_CUT[i]) : price * (1 + SOUR_RISE)) / 50) * 50;
    if (!ok) soured = true;
    rounds.push({ chance: o.chance, reasons: o.reasons, ok, price });
  }
  const cashBlock = seller.traits.includes('Honest') ? `${seller.name} is honest: no cash under the table` : undefined;
  const share = cashBlock ? 0 : terms.cash;
  const cashFace = Math.round((price * share) / 50) * 50;
  const cashPart = Math.round((cashFace * (1 - CASH_DISCOUNT)) / 50) * 50;
  const booksPart = price - cashFace;
  const l = lotOf(s, t);
  let take = 0;
  let runs = false;
  let runsWhy: string | undefined;
  let place: string;
  let where: string;
  let oldOwner: string | undefined;
  if (t.kind === 'biz') {
    const def = CATALOG[t.biz];
    take = Math.round(def.base * (def.season[0] + def.season[1]) / 2);
    runs = true;
    place = `${def.name}`;
    where = s.districts.find((d) => d.id === t.district)?.name ?? '';
  } else {
    place = l ? lotName(l) : 'a property';
    where = l ? ZONES_BY_ID[l.zone].name : '';
    if (l && t.going && l.tenant && l.use) {
      const u = USES_BY_ID[l.use];
      take = Math.round(u.biz ? CATALOG[u.biz].base * 1.2 : Math.max(0, u.rev - u.exp) * inflation(s));
      runs = true;
      oldOwner = l.tenant.split('\'s ')[0];
    } else if (l?.tenant) runsWhy = `${l.tenant} runs ${l.tenant.includes('\'s') ? 'it' : 'the shop'} and pays you rent: nobody of yours needs to.`;
    else if (l?.use) runsWhy = 'An empty building: pick a manager once something earns in it.';
    else runsWhy = 'Vacant land: nothing to run until you build.';
  }
  return {
    key: dealKey(t), target: t, place, where, seller, asking, rounds, soured, agreed: price,
    cashPart, booksPart, price: booksPart + cashPart,
    next: !soured && n < MAX_HAGGLES ? haggleOdds(s, t, n, seller) : undefined,
    cashBlock, fedHeat: share >= 0.5 ? 4 : share > 0 ? 2 : 0,
    take, runs, runsWhy, oldOwner, mgrKey: `deal:${dealKey(t)}`,
  };
}

/* ---------------- who runs it ---------------- */

function buildManager(s: GameState, v: DealView, m: DealManager | undefined): Manager | undefined {
  if (!m || 'keep' in m) return undefined;
  if (m.source === 'pro') {
    const p = proCandidates(s, v.mgrKey)[m.pro ?? 0];
    return p ? managerFromPro(s, p) : undefined;
  }
  const c = m.charId ? s.characters[m.charId] : undefined;
  return c?.alive ? managerFromChar(s, c, m.source) : undefined;
}

/** The crew's pick for a deal (the sim's players take it). */
export function suggestedManager(s: GameState, t: DealTarget): DealManager | undefined {
  const v = dealView(s, t, { haggles: 0, cash: 0 });
  if (!v.runs) return undefined;
  const best = rankManagers(s, v.mgrKey, v.take)[0];
  if (!best || best.value <= 0) return v.oldOwner ? { keep: true } : undefined;
  return { source: best.source, charId: best.charId, pro: best.pro };
}

/* ---------------- the order ---------------- */

const MONEY_NEEDS = /^Needs \$/;

export function previewDeal(s: GameState, t: DealTarget, terms: DealTerms): ActionPreview {
  const v = dealView(s, t, terms);
  const base = previewAction(s, baseAction(t));
  const title = `Deal: ${t.kind === 'biz' ? base.title.replace(/^Buy: /, '') : v.place} from ${v.seller.name}`;
  const effects: Effect[] = [];
  if (v.booksPart > 0) effects.push({ type: 'money', amount: -v.booksPart, label: `${title} (on the books)` });
  if (v.cashPart > 0) {
    effects.push({ type: 'money', amount: -v.cashPart, label: `${title} (cash under the table)` });
    effects.push({ type: 'unwashed', amount: -v.cashPart, label: `${title}: the cash came out of the unwashed pile` });
    effects.push({ type: 'heat', bar: 'federal', amount: v.fedHeat, label: `${title}: a cash deal the IRS may ask about` });
  }
  // The plain order's other effects (the new business, a rival's resentment, the notes).
  for (const e of base.effects) if (e.type !== 'money') effects.push(e);
  if (v.soured) {
    const z = zoneOf(s, t);
    if (z && !v.seller.shady) effects.push({ type: 'econ', op: { op: 'zone', zone: z, rep: -1 }, label: `${title}: word gets around you squeeze` });
  }
  const m = buildManager(s, v, terms.mgr);
  if (m) effects.push({ type: 'econ', op: { op: 'note', text: `${m.name} runs it` }, label: title });
  else if (terms.mgr && 'keep' in terms.mgr && v.oldOwner) effects.push({ type: 'econ', op: { op: 'note', text: `${v.oldOwner} stays on to run it` }, label: title });
  let why = base.disabledReason;
  if (why && MONEY_NEEDS.test(why)) why = undefined;
  if (!why && s.money < v.price) why = `Needs ${fmtMoney(v.price)}`;
  if (!why && terms.mgr && !('keep' in terms.mgr) && !m) why = 'The manager you picked is gone';
  if (!why && terms.mgr && 'keep' in terms.mgr && !v.oldOwner) why = 'There is no old owner to keep on';
  const saved = v.asking - v.price;
  return {
    title,
    detail: `${v.seller.role}. Asking ${fmtMoney(v.asking)}${saved > 0 ? `, you pay ${fmtMoney(v.price)}` : saved < 0 ? `, it cost you ${fmtMoney(v.price)} after you soured ${v.seller.name.split(' ')[0]}` : ''}${v.cashPart ? ` (${fmtMoney(v.cashPart)} of it in cash)` : ''}.`,
    effects, cost: v.price, because: `signed for ${v.place} with ${v.seller.name}`, disabledReason: why, category: 'event',
    acceptance: base.acceptance, refuseEffects: base.refuseEffects,
  };
}

export function commitDeal(ctx: Ctx, t: DealTarget, terms: DealTerms): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  const v = dealView(s, t, terms);
  let key: string | undefined;
  if (t.kind === 'lot') {
    commitEcon(ctx, { type: 'buyLot', lotId: t.lotId, going: t.going });
    const l = e.lots.find((x) => x.id === t.lotId);
    if (l) {
      l.invested = v.price;
      key = l.bizId ?? (t.going ? `lot:${l.id}` : undefined);
    }
  } else {
    const b = [...s.businesses].reverse().find((x) => x.owner === 'player' && x.kind === t.biz && x.boughtWeek === s.week);
    if (b) {
      b.cost = v.price;
      key = b.id;
    }
  }
  const m = buildManager(s, v, terms.mgr);
  if (key && m) {
    e.managers[key] = m;
    if (m.charId) {
      const c = s.characters[m.charId];
      if (c) addStory(s, c, `Put in charge of ${placeName(s, key)}.`);
    }
  }
  e.stats.deals = (e.stats.deals ?? 0) + 1;
  if (v.rounds.some((r) => r.ok)) e.stats.haggled = (e.stats.haggled ?? 0) + 1;
  (e.dealLog ??= []).push({ week: s.week, seller: v.seller.name, sellerId: v.seller.id, place: v.place, asking: v.asking, price: v.price, cash: v.cashPart, soured: v.soured });
  if (e.dealLog.length > 40) e.dealLog.splice(0, e.dealLog.length - 40);
  ctx.log.push(`${v.seller.name} signs ${v.place} over to you for ${fmtMoney(v.price)}${v.soured ? ' (and does not shake your hand)' : ''}.`);
}

/* ---------------- the simulator's player ---------------- */

/**
 * Turns a plain buy into a deal the way a random boss would: haggles a
 * little, sometimes pays cash, and takes the crew's pick for a manager.
 */
export function autoDeal(s: GameState, a: PlayerAction, h: { rng: number }): PlayerAction {
  const t = targetOf(a);
  if (!t || (a.kind === 'econ' && a.op.type === 'deal')) return a;
  const r = rand(h);
  const haggles = r < 0.4 ? 0 : r < 0.8 ? 1 : 2;
  const c = rand(h);
  const cash: DealTerms['cash'] = c < 0.75 ? 0 : c < 0.92 ? 0.25 : 0.5;
  return { kind: 'econ', op: { type: 'deal', target: t, terms: { haggles, cash, mgr: suggestedManager(s, t) } } };
}

