import { isInSeason } from './calendar';
import { crew, isFree } from './characters';
import { ensureEcon } from './econState';
import { heat, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { hashSeed } from './rng';
import { xfer } from './tribute';
import { placeBlock, placeById, schemesFor, schemeView, whoBlock, workPlace, type WorkPlace } from './bizRacket';
import type { WorkSchemeId } from './bizRacketData';
import { isMineLot } from './placeEligibility';
import { canHoldSpot, spotOf, SPOTS, type SpotKind } from './kickup';
import { FACTION_NAMES } from './world';
import type { ActionPreview } from './actions';
import type { Character, Effect, GameState, PlayerAction, RivalId } from './types';

/**
 * YOUR PLACES, OTHER MEN'S RACKETS, AND THE TWO-CLICK SET-UP.
 *
 * 1. Requests. Now and then (about one every few weeks, never more than two open) a man asks to run
 *    his thing out of one of YOUR places: one of your own men, a rival family's man, or an
 *    independent (a bookie, a shylock, a fence, a card-game operator, a numbers banker, a jukebox and
 *    cigarette-machine vendor, a man who wants rooms by the hour at your motel). Each says what,
 *    where, the cut he offers you, the heat it draws, his reputation, and what it means (a rival's man
 *    in your place is a foothold and a pair of ears; the desk sergeant's brother-in-law keeps the beat
 *    cops away). Accept, counter (he may take it, meet you halfway or walk), refuse, or "come back
 *    later". They wait in the inbox; the underboss (your own men, independents) and the consigliere
 *    (other families' men) field them per what you delegated (kickup.spotLtCands).
 *    Accepted: one of your men gets it as his spot (kickup.ts: he earns, keeps his end, kicks up the
 *    agreed cut); an outsider becomes a tenant who pays you his cut every week through the ledger.
 *
 * 2. Set up a racket here in two clicks: for any place you own, the three rackets that fit its
 *    trade, each with the man who fits it and its take and cost pre-filled (the Work-this-place
 *    order, bizRacket.ts), and the same for every place of yours with nothing running.
 *
 * State on the econ layer (`econ.asks`, `econ.tenants`; optional, small and capped). Rolls are hashes.
 */

export type AskTrade = 'bookie' | 'shylock' | 'fence' | 'cards' | 'numbers' | 'machines' | 'hourly';
export type AskFrom = 'own' | 'rival' | 'independent';

interface TradeDef {
  what: string;
  /** Who he is ("a bookie"). */
  man: string;
  base: number;
  /** Cut he usually offers, percent. */
  cut: number;
  heat: number;
  /** Which trades of place it fits. */
  fits: WorkPlace['family'][];
  spot: SpotKind;
}

export const TRADES: Record<AskTrade, TradeDef> = {
  bookie: { what: 'a book on the back-room phone', man: 'a bookie', base: 260, cut: 20, heat: 0.06, fits: ['bar', 'restaurant', 'service', 'shop', 'club'], spot: 'numbers' },
  shylock: { what: 'a shylock desk', man: 'a shylock', base: 220, cut: 20, heat: 0.05, fits: ['bar', 'club', 'restaurant', 'shop', 'garage', 'service', 'laundromat'], spot: 'shylock' },
  fence: { what: 'a fencing counter', man: 'a fence', base: 240, cut: 18, heat: 0.07, fits: ['shop', 'garage', 'service', 'arcade', 'wholesale'], spot: 'fence' },
  cards: { what: 'a card game in the back', man: 'a card-game operator', base: 230, cut: 25, heat: 0.05, fits: ['bar', 'club', 'restaurant', 'motel'], spot: 'cards' },
  numbers: { what: 'a numbers bank', man: 'a numbers banker', base: 280, cut: 20, heat: 0.04, fits: ['shop', 'service', 'laundromat', 'restaurant', 'bar'], spot: 'numbers' },
  machines: { what: 'his jukebox and cigarette machines', man: 'a machine vendor', base: 150, cut: 30, heat: 0.01, fits: ['bar', 'club', 'restaurant', 'arcade', 'laundromat', 'motel', 'garage'], spot: 'machines' },
  hourly: { what: 'rooms by the hour', man: 'a man who rents rooms by the hour', base: 200, cut: 30, heat: 0.05, fits: ['motel'], spot: 'stop' },
};
export const TRADE_IDS = Object.keys(TRADES) as AskTrade[];

export interface PlaceAsk {
  id: string;
  from: AskFrom;
  /** A character (your man, a rival's man), or a name only (an independent). */
  who?: string;
  name: string;
  rival?: RivalId;
  trade: AskTrade;
  place: string;
  placeName: string;
  /** Percent of his gross he offers you. */
  cut: number;
  /** His weekly gross there (the year's average). */
  gross: number;
  /** 0-100. */
  rep: number;
  /** Related to a cop. */
  cop?: 1;
  week: number;
  /** Gone after this week (he takes it elsewhere). */
  until: number;
  /** "Come back later": not before this week. */
  later?: number;
  /** He met you halfway once. */
  countered?: 1;
}

export interface Tenant {
  name: string;
  who?: string;
  rival?: RivalId;
  trade: AskTrade;
  place: string;
  placeName: string;
  cut: number;
  gross: number;
  cop?: 1;
  w: number;
  /** Last week's gross and your end. */
  g?: number;
  paid?: number;
}

const INDEP = ['Benny Kaplan', 'Sol Weiss', 'Red Doherty', 'Mickey Flynn', 'Lou Fortunato', 'Hymie Gold', 'Artie Shea', 'Dutch Muller', 'Gus Pappas', 'Eddie Rourke', 'Moe Feinberg', 'Sully Burke'];
const MAX_OPEN = 2;
const MAX_TENANTS = 12;

function roll(s: GameState, k: string): number {
  return hashSeed(`${s.seed}|ask|${s.week}|${k}`) / 4294967296;
}

/** Your places that can be worked (each once: a lot of yours, or a business with no lot). */
export function myPlaces(s: GameState): WorkPlace[] {
  const out: WorkPlace[] = [];
  const seen = new Set<string>();
  for (const l of s.econ?.lots ?? []) {
    if (!isMineLot(l)) continue;
    const p = workPlace(s, l);
    if (p && !placeBlock(s, p)) { out.push(p); if (l.bizId) seen.add(l.bizId); }
  }
  for (const b of s.businesses) {
    if (b.owner !== 'player' || seen.has(b.id)) continue;
    const p = workPlace(s, undefined, b);
    if (p && !placeBlock(s, p)) out.push(p);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function asksOf(s: GameState): PlaceAsk[] {
  return s.econ?.asks ?? [];
}

/** The requests waiting on an answer now (not snoozed, not expired, the place still yours). */
export function openAsks(s: GameState): PlaceAsk[] {
  return asksOf(s).filter((a) => a.until >= s.week && (a.later ?? 0) <= s.week && !!placeById(s, a.place)?.mine);
}

export function tenantsOf(s: GameState): Tenant[] {
  return Object.values(s.econ?.tenants ?? {});
}

export const repWord = (r: number) => (r >= 75 ? 'a square operator: pays on time' : r >= 50 ? 'known on the avenue; nothing bad said' : r >= 30 ? 'a sharp one: watch his count' : 'known to welsh and to talk');

/** What taking him in means (the foothold, the protection), in words. */
export function askMeans(s: GameState, a: Pick<PlaceAsk, 'from' | 'rival' | 'cop' | 'who' | 'rep'>): string {
  void s;
  if (a.from === 'rival') return `${FACTION_NAMES[a.rival!]}'s man under your roof: a foothold for them, and a pair of ears in your place.`;
  if (a.cop) return 'His sister is married to the desk sergeant: the beat cops leave the place alone.';
  if (a.from === 'own') return 'One of yours: it becomes his spot, and he kicks up to you like any spot.';
  return a.rep < 30 ? 'An outsider with a bad name: short counts are likely, and he talks.' : 'An outsider: he pays rent on the racket and is nobody\'s man.';
}

function pickTrade(s: GameState, p: WorkPlace, k: string): AskTrade | undefined {
  const ok = TRADE_IDS.filter((t) => TRADES[t].fits.includes(p.family));
  return ok.length ? ok[Math.floor(roll(s, k) * ok.length)] : undefined;
}

/** Weekly (economy.runEconomy): new requests now and then; the tenants pay their cut; the requests age. */
export function placeAsksWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.econ;
  if (!e) return;
  // Requests that ran out.
  if (e.asks) e.asks = e.asks.filter((a) => a.until >= s.week && !!placeById(s, a.place)?.mine);
  tenantsWeek(ctx);
  const places = myPlaces(s);
  if (!places.length || s.week < 4 || openAsks(s).length >= MAX_OPEN || (e.asks?.length ?? 0) >= 4) return;
  if (roll(s, 'new') > 0.3) return;
  const p = places[Math.floor(roll(s, 'place') * places.length)];
  if (tenantsOf(s).some((t) => t.place === p.id) || (e.asks ?? []).some((a) => a.place === p.id)) return;
  const trade = pickTrade(s, p, 'trade');
  if (!trade) return;
  const T = TRADES[trade];
  const r = roll(s, 'from');
  let ask: PlaceAsk | undefined;
  const id = `ask${s.week}`;
  const base = { id, trade, place: p.id, placeName: p.name, week: s.week, until: s.week + 3 };
  const gross = Math.round(T.base * (0.8 + roll(s, 'gross') * 0.4) / 10) * 10;
  if (r < 0.35) {
    const men = crew(s).filter((c) => canHoldSpot(s, c) && (!spotOf(s, c.id) || spotOf(s, c.id)?.free) && (c.rank === 'soldier' || c.rank === 'associate')).sort((a, b) => (a.id < b.id ? -1 : 1));
    const c = men.length ? men[Math.floor(roll(s, 'man') * men.length)] : undefined;
    if (c) ask = { ...base, from: 'own', who: c.id, name: `${c.firstName} ${c.lastName}`, cut: SPOTS[T.spot].up, gross: Math.round(gross * 0.5), rep: Math.max(10, Math.min(95, 50 + opinion(s, c.id, s.playerId) / 2)) };
  } else if (r < 0.55) {
    const rv = s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
    const men = Object.values(s.characters).filter((c) => c.alive && rv.some((x) => x.id === c.faction) && c.id !== s.rivals.find((x) => x.id === c.faction)?.leaderId && ['soldier', 'associate', 'capo'].includes(c.rank)).sort((a, b) => (a.id < b.id ? -1 : 1));
    const c = men.length ? men[Math.floor(roll(s, 'rman') * men.length)] : undefined;
    if (c) ask = { ...base, from: 'rival', who: c.id, rival: c.faction as RivalId, name: `${c.firstName} ${c.lastName}`, cut: T.cut + 5, gross, rep: 40 + Math.floor(roll(s, 'rrep') * 40) };
  }
  if (!ask) {
    const nm = INDEP[Math.floor(roll(s, 'name') * INDEP.length)];
    ask = { ...base, from: 'independent', name: nm, cut: T.cut, gross, rep: 15 + Math.floor(roll(s, 'rep') * 80), ...(roll(s, 'cop') < 0.15 ? { cop: 1 as const } : {}) };
  }
  (e.asks ??= []).push(ask);
  ctx.log.push(`${ask.name} (${ask.from === 'own' ? 'one of yours' : ask.from === 'rival' ? `${FACTION_NAMES[ask.rival!]}'s man` : T.man}) asks to run ${T.what} out of ${p.name}, offering ${ask.cut}%.`);
}

function tenantsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const all = s.econ?.tenants;
  if (!all) return;
  let h = 0;
  for (const id of Object.keys(all).sort()) {
    const t = all[id];
    const p = placeById(s, t.place);
    const c = t.who ? s.characters[t.who] : undefined;
    if (!p?.mine || placeBlock(s, p) || (t.who && (!c?.alive || (t.rival && c.faction !== t.rival)))) {
      delete all[id];
      ctx.log.push(`${t.name}'s ${TRADES[t.trade].what} at ${t.placeName} is finished.`);
      continue;
    }
    if (c && !isFree(s, c)) continue;
    const season = isInSeason(s.date) ? 1.15 : 0.9;
    const swing = 0.8 + (hashSeed(`${s.seed}|tenant|${s.week}|${id}`) / 4294967296) * 0.4;
    t.g = Math.round(t.gross * season * swing);
    t.paid = xfer(ctx, `ext:tenant:${id}`, 'treasury', Math.round(t.g * t.cut / 100), 'business_income', `w${s.week}:tenant:${id}`, { label: `Tenant: ${t.name}'s ${TRADES[t.trade].what} at ${t.placeName} (your ${t.cut}%)`, category: 'business' });
    h += TRADES[t.trade].heat;
    // A month: the cop's relative keeps the beat cops off; a rival's man is a foothold and a pair of ears.
    if (s.date.d <= 7) {
      if (t.cop && s.heat.local > 0) heat(ctx, 'local', -1, `${t.name}'s brother-in-law at the precinct keeps the beat cops off ${t.placeName}`, 'heat');
      if (t.rival && c) {
        const d = s.districts.find((x) => x.id === p.district);
        if (d) d.influence[t.rival] = Math.min(100, (d.influence[t.rival] ?? 0) + 1);
        const R = s.rivals.find((x) => x.id === t.rival);
        if (R && hashSeed(`${s.seed}|tenantears|${s.week}|${id}`) / 4294967296 < 0.25) {
          addOpinion(s, R.leaderId, s.playerId, 'Our man hears things in his place', 2, 1);
          R.money += 150;
          ctx.log.push(`Word from ${t.placeName} reaches ${R.shortName}: ${t.name} keeps his ears open under your roof.`);
        }
      }
    }
  }
  s.flags.spotHeat = (s.flags.spotHeat ?? 0) + h;
}

/* ------------------------------------------------------------------ */
/* Answering                                                           */
/* ------------------------------------------------------------------ */

export type AskHow = 'accept' | 'counter' | 'refuse' | 'later';
export type PlaceAskAction = { type: 'placeAsk'; id: string; how: AskHow; cut?: number };

export function askAction(id: string, how: AskHow, cut?: number): PlayerAction {
  return { kind: 'econ', op: { type: 'placeAsk', id, how, ...(cut !== undefined ? { cut } : {}) } };
}

/** The odds he takes your counter (the further over his offer, the worse; a man with a good name has options). */
export function counterOdds(a: PlaceAsk, cut: number): number {
  return Math.max(0.05, Math.min(0.9, 0.85 - Math.max(0, cut - a.cut) * 0.06 - (a.rep >= 70 ? 0.1 : 0) + (a.from === 'own' ? 0.1 : 0)));
}

export function previewAsk(s: GameState, a: PlaceAskAction): ActionPreview {
  const ask = asksOf(s).find((x) => x.id === a.id);
  const noop = (t: string, why: string): ActionPreview => ({ title: t, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' });
  if (!ask) return noop('A request', 'Gone: he took it elsewhere');
  const T = TRADES[ask.trade];
  const note = (text: string): Effect => ({ type: 'econ', op: { op: 'note', text } });
  const yours = Math.round(ask.gross * ask.cut / 100);
  const head = `${ask.name} wants to run ${T.what} out of ${ask.placeName}: about $${ask.gross.toLocaleString('en-US')} a week, ${ask.cut}% to you (~$${yours}). Heat: ${T.heat >= 0.06 ? 'steady' : T.heat >= 0.03 ? 'some' : 'little'}. His name: ${repWord(ask.rep)}. ${askMeans(s, ask)}`;
  const gone = !placeById(s, ask.place)?.mine ? 'The place is not yours any more' : ask.until < s.week ? 'He took it elsewhere' : undefined;
  switch (a.how) {
    case 'accept': return { title: `Let ${ask.name} run ${T.what} at ${ask.placeName}`, detail: head, effects: [note(`~$${yours}/wk to you while it runs`), ...(ask.from === 'own' && ask.who ? [{ type: 'opinion', from: ask.who, to: s.playerId, amount: 6, reason: 'Let me run my thing at his place', decay: 0.5, label: 'A request' } as Effect] : [])], cost: 0, because: `let ${ask.name} run ${T.what} at ${ask.placeName}`, category: 'event', disabledReason: gone };
    case 'counter': {
      const cut = Math.max(ask.cut + 1, Math.min(70, a.cut ?? ask.cut + 10));
      return { title: `Counter ${ask.name}: ${cut}%`, detail: `${head} He takes ${cut}% about ${Math.round(counterOdds(ask, cut) * 100)}% of the time; otherwise he meets you halfway or walks.`, effects: [note(`${Math.round(counterOdds(ask, cut) * 100)}%: he runs it at ${cut}%`)], cost: 0, because: `countered ${ask.name} at ${cut}%`, category: 'event', disabledReason: gone ?? (ask.countered ? 'He already came back once; take it or leave it' : undefined) };
    }
    case 'refuse': return { title: `Turn ${ask.name} down`, detail: head, effects: [note('He takes it somewhere else'), ...(ask.from === 'rival' && ask.rival ? [{ type: 'rivalOpinion', rival: ask.rival, amount: -2, reason: 'Turned our man away', label: 'A request' } as Effect] : [])], cost: 0, because: `turned ${ask.name} down`, category: 'event' };
    case 'later': return { title: `Tell ${ask.name} to come back later`, detail: head, effects: [note('He asks again in a month, if he is still looking')], cost: 0, because: `told ${ask.name} to come back later`, category: 'event', disabledReason: gone };
  }
}

export function commitAsk(ctx: Ctx, a: PlaceAskAction): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  const ask = (e.asks ?? []).find((x) => x.id === a.id);
  if (!ask || ask.until < s.week || !placeById(s, ask.place)?.mine) return;
  const drop = () => { e.asks = (e.asks ?? []).filter((x) => x.id !== ask.id); };
  if (a.how === 'refuse') { drop(); ctx.log.push(`${ask.name} takes his ${TRADES[ask.trade].what} somewhere else.`); return; }
  if (a.how === 'later') { ask.later = s.week + 4; ask.until = s.week + 7; return; }
  let cut = ask.cut;
  if (a.how === 'counter') {
    const want = Math.max(ask.cut + 1, Math.min(70, a.cut ?? ask.cut + 10));
    const r = hashSeed(`${s.seed}|counter|${s.week}|${ask.id}`) / 4294967296;
    if (r < counterOdds(ask, want)) cut = want;
    else if (!ask.countered && r < counterOdds(ask, want) + 0.35) {
      ask.cut = Math.round((ask.cut + want) / 2);
      ask.countered = 1;
      ctx.log.push(`${ask.name} won't do ${want}%; he comes back with ${ask.cut}%.`);
      return;
    } else { drop(); ctx.log.push(`${ask.name} walked: ${want}% is too rich for him.`); return; }
  }
  drop();
  takeIn(ctx, ask, cut);
}

function takeIn(ctx: Ctx, ask: PlaceAsk, cut: number): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  const T = TRADES[ask.trade];
  const c = ask.who ? s.characters[ask.who] : undefined;
  if (ask.from === 'own' && c && canHoldSpot(s, c)) {
    // One of yours: it is his spot (kickup.ts), at your place, at the agreed cut.
    const p = placeById(s, ask.place);
    (e.spots ??= {})[c.id] = { k: T.spot, by: s.playerId, w: s.week, f: 'player', ...(p?.district && s.districts.some((d) => d.id === p.district) ? { d: p.district } : {}), up: cut, nm: `${T.what} at ${ask.placeName}`, lv: 1 };
    if (e.spotless) delete e.spotless[c.id];
    ctx.log.push(`${c.firstName} ${c.lastName} runs ${T.what} at ${ask.placeName}; ${cut}% comes up.`);
    return;
  }
  const all = (e.tenants ??= {});
  if (Object.keys(all).length >= MAX_TENANTS) return;
  all[ask.id] = { name: ask.name, ...(ask.who ? { who: ask.who } : {}), ...(ask.rival ? { rival: ask.rival } : {}), trade: ask.trade, place: ask.place, placeName: ask.placeName, cut, gross: ask.gross, ...(ask.cop ? { cop: 1 as const } : {}), w: s.week };
  ctx.log.push(`${ask.name} runs ${T.what} at ${ask.placeName}: ${cut}% of it is yours every week.`);
}

/* ------------------------------------------------------------------ */
/* Set up a racket here: two clicks                                    */
/* ------------------------------------------------------------------ */

export interface QuickRacket {
  scheme: WorkSchemeId;
  title: string;
  line: string;
  who: string;
  whoName: string;
  take: number;
  cost: number;
  heat: string;
  action: PlayerAction;
}

/** The man who fits a racket: free, the best at its skill, a man with nothing of his own first. */
function fitMan(s: GameState, fit: keyof Character['attributes'], used: Set<string>): Character | undefined {
  const men = crew(s).filter((c) => c.rank !== 'civilian' && !whoBlock(s, c.id) && !used.has(c.id));
  const score = (c: Character) => c.attributes[fit] + (spotOf(s, c.id) ? 0 : 12) - ((c.busyUntil ?? 0) > s.week ? 50 : 0);
  return men.sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1))[0];
}

/** The three rackets that fit this place best, each with its man, take and cost pre-filled. */
export function quickRackets(s: GameState, placeId: string, n = 3, used: Set<string> = new Set()): QuickRacket[] {
  const p = placeById(s, placeId);
  if (!p || placeBlock(s, p)) return [];
  const out: QuickRacket[] = [];
  for (const d of schemesFor(p)) {
    if (d.kind === 'loan' || d.kind === 'stash') continue;
    const m = fitMan(s, d.fit, used) ?? s.characters[s.playerId];
    const v = schemeView(s, p, d.id, m.id);
    if (v.lock || v.take <= 0) continue;
    out.push({ scheme: d.id, title: v.title, line: v.line, who: m.id, whoName: m.id === s.playerId ? 'you' : `${m.firstName} ${m.lastName}`, take: v.take, cost: v.cost, heat: v.heat, action: { kind: 'work', op: { op: 'scheme', place: p.id, scheme: d.id, who: m.id } } });
  }
  return out.sort((a, b) => (b.take * 10 - b.cost) - (a.take * 10 - a.cost) || (a.scheme < b.scheme ? -1 : 1)).slice(0, n);
}

/** Every place of yours with nothing running, and its best racket (for "Set up all suggested"). */
export function suggestAll(s: GameState): { place: WorkPlace; pick: QuickRacket }[] {
  const used = new Set<string>();
  const out: { place: WorkPlace; pick: QuickRacket }[] = [];
  for (const p of myPlaces(s)) {
    if ((s.work?.places[p.id]?.holds.length ?? 0) > 0) continue;
    const q = quickRackets(s, p.id, 1, used)[0];
    if (!q) continue;
    if (q.who !== s.playerId) used.add(q.who);
    out.push({ place: p, pick: q });
  }
  return out;
}
