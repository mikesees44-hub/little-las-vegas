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
import { canHoldSpot, remember, spotLock, spotOf, SPOTS, type SpotKind } from './kickup';
import { holder } from './council';
import { honesty } from './ledgerbook';
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

/** A tenant's trouble (CATALOG_DEEP §8 Complication): a claim on the place, a bad count, the law, a quarrel. */
export type TroubleKind = 'claim' | 'short' | 'law' | 'quarrel';
export const TROUBLE_WORD: Record<TroubleKind, string> = {
  claim: 'a neighboring crew says the place falls under their agreement',
  short: 'his count has come up light for weeks: he says business is bad',
  law: 'the vice squad has been asking about the place',
  quarrel: 'he and your people at the place are at each other',
};

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
  /** A rival family that claims the place (it answered for it). */
  claim?: RivalId;
  /** Trouble waiting on your word, and since when. */
  trouble?: { k: TroubleKind; w: number };
  /** Who let him in (the boss, or the lieutenant he delegated it to). */
  by?: string;
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

/** Not every trade comes knocking from the start (CATALOG_DEEP §7): it follows your standing and what you already run. */
export function tradeLock(s: GameState, t: AskTrade): string | undefined {
  if (t === 'shylock') return spotLock(s, 'shylock');
  if (t === 'fence') return spotLock(s, 'fence');
  if (t === 'hourly' && s.respect < 30) return 'Not yet: nobody brings that to a family without standing';
  return undefined;
}

function pickTrade(s: GameState, p: WorkPlace, k: string): AskTrade | undefined {
  const ok = TRADE_IDS.filter((t) => TRADES[t].fits.includes(p.family) && !tradeLock(s, t));
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
  } else if (r < 0.55 && s.week >= 12) {
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
    t.paid = xfer(ctx, `ext:tenant:${id}`, 'treasury', Math.round(t.g * t.cut / 100 * (t.trouble?.k === 'short' ? 0.5 : 1)), 'business_income', `w${s.week}:tenant:${id}`, { label: `Tenant: ${t.name}'s ${TRADES[t.trade].what} at ${t.placeName} (your ${t.cut}%)`, category: 'business' });
    h += TRADES[t.trade].heat;
    if (t.trouble?.k === 'short') { /* he pays half while it lasts (below) */ }
    // A month: the cop's relative keeps the beat cops off; a rival's man is a foothold and a pair of ears.
    if (s.date.d <= 7) {
      troubleMonth(ctx, id, t);
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

/** A month of a tenant: trouble comes (more with a claim on the place or a man with a bad name), and trouble left alone gets worse. */
function troubleMonth(ctx: Ctx, id: string, t: Tenant): void {
  const s = ctx.s;
  const r = (k: string) => hashSeed(`${s.seed}|trouble|${s.week}|${id}|${k}`) / 4294967296;
  if (t.trouble) {
    if (s.week - t.trouble.w < 4) return;
    // Nobody answered: it lands.
    const k = t.trouble.k;
    if (k === 'claim' && t.claim) {
      const p = placeById(s, t.place);
      const d = p ? s.districts.find((x) => x.id === p.district) : undefined;
      if (d) d.influence[t.claim] = Math.min(100, (d.influence[t.claim] ?? 0) + 2);
      const R = s.rivals.find((x) => x.id === t.claim);
      if (R) addOpinion(s, R.leaderId, s.playerId, 'Ignored our claim on the place', -4, 1);
    }
    if (k === 'law') heat(ctx, 'local', 2, `The vice squad at ${t.placeName}: nobody saw to it`, 'heat');
    if (k === 'quarrel' && t.who && s.characters[t.who]) addOpinion(s, t.who, s.playerId, 'Nobody settled my quarrel at his place', -4, 1);
    remember(s, `Trouble at ${t.placeName} (${t.name}'s ${TRADES[t.trade].what}) was left alone and got worse`, [t.who ?? '', t.by ?? s.playerId]);
    t.trouble = { k, w: s.week };
    return;
  }
  const p = 0.08 + (t.claim ? 0.1 : 0) + (t.rival ? 0.05 : 0);
  if (r('come') > p) return;
  const k: TroubleKind = t.claim && r('k') < 0.6 ? 'claim' : (['short', 'law', 'quarrel'] as const)[Math.floor(r('k2') * 3)];
  t.trouble = { k, w: s.week };
  ctx.log.push(`Trouble at ${t.placeName}: ${TROUBLE_WORD[k]} (${t.name}'s ${TRADES[t.trade].what}).`);
}

/* ------------------------------------------------------------------ */
/* Assessment: your people disagree                                    */
/* ------------------------------------------------------------------ */

export interface Advice { role: string; who?: string; says: string; lean: -1 | 0 | 1 }

/** The rival family whose crew says the place falls within an agreement of theirs (strong enough in its district). */
export function claimOn(s: GameState, placeId: string, except?: RivalId): RivalId | undefined {
  const p = placeById(s, placeId);
  const d = p ? s.districts.find((x) => x.id === p.district) : undefined;
  if (!d) return undefined;
  const r = s.rivals.filter((x) => x.kind === 'mob' && x.id !== except && s.characters[x.leaderId]?.alive && (d.influence[x.id] ?? 0) >= 15)
    .sort((a, b) => (d.influence[b.id] ?? 0) - (d.influence[a.id] ?? 0) || (a.id < b.id ? -1 : 1))[0];
  return r?.id;
}

/**
 * Before you answer (CATALOG_DEEP §8 Assessment): the money man on the profit, the underboss on the man,
 * the lawyer on the exposure, and a neighboring crew on its claim. They do not always agree.
 */
export function assessAsk(s: GameState, a: PlaceAsk): Advice[] {
  const T = TRADES[a.trade];
  const yours = Math.round(a.gross * a.cut / 100);
  const cons = holder(s, 'consigliere');
  const ub = holder(s, 'underboss');
  const out: Advice[] = [];
  out.push({ role: 'The money', who: cons?.id, lean: yours >= 45 && T.heat < 0.06 ? 1 : yours < 30 ? -1 : 0,
    says: yours >= 45 && T.heat < 0.06 ? `~$${yours} a week for a room we already pay for. Take it.` : yours < 30 ? `~$${yours} a week? It doesn't pay for the trouble it brings.` : `~$${yours} a week. It pays, if he counts straight.` });
  const c = a.who ? s.characters[a.who] : undefined;
  if (a.from === 'own' && c) {
    const ok = opinion(s, c.id, s.playerId) >= 0 && honesty(s, c) >= 45;
    out.push({ role: 'The underboss on the man', who: ub?.id, lean: ok ? 1 : -1, says: ok ? `${c.firstName} is solid. I'd trust him with it.` : `${c.firstName}? His envelopes are light enough already.` });
  } else if (a.from === 'rival') out.push({ role: 'The underboss on the man', who: ub?.id, lean: -1, says: `He's ${FACTION_NAMES[a.rival!]}'s. Whatever he hears in that room goes home with him.` });
  else out.push({ role: 'The underboss on the man', who: ub?.id, lean: a.rep >= 55 ? 1 : a.rep < 30 ? -1 : 0, says: a.rep >= 55 ? `${a.name} pays on time; people speak well of him.` : a.rep < 30 ? `${a.name} has welshed before. I wouldn't.` : `Nobody knows much about ${a.name}. Watch him the first months.` });
  const hot = s.heat.local >= 50;
  out.push({ role: 'The lawyer', lean: a.cop ? 1 : hot || T.heat >= 0.06 ? -1 : 0,
    says: a.cop ? 'With the sergeant in the family, the beat cops look the other way. It even helps.' : hot ? 'The precinct is already watching us. Another back room is another warrant.' : T.heat >= 0.06 ? 'This kind of thing draws the vice squad, sooner or later.' : 'Quiet enough. Keep it off the books.' });
  const claim = claimOn(s, a.place, a.rival);
  if (claim) {
    const R = s.rivals.find((x) => x.id === claim)!;
    out.push({ role: `${R.shortName}'s crew next door`, who: R.leaderId, lean: -1, says: `They say ${a.placeName} falls within their agreement. Let him in and they'll want a word.` });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Answering                                                           */
/* ------------------------------------------------------------------ */

export type AskHow = 'accept' | 'counter' | 'refuse' | 'later' | 'delegate';
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
  const views = assessAsk(s, ask).map((v) => `${v.role}: "${v.says}"`).join(' ');
  const head = `${ask.name} wants to run ${T.what} out of ${ask.placeName}: about $${ask.gross.toLocaleString('en-US')} a week, ${ask.cut}% to you (~$${yours}). Heat: ${T.heat >= 0.06 ? 'steady' : T.heat >= 0.03 ? 'some' : 'little'}. His name: ${repWord(ask.rep)}. ${askMeans(s, ask)} ${views}`;
  const gone = !placeById(s, ask.place)?.mine ? 'The place is not yours any more' : ask.until < s.week ? 'He took it elsewhere' : undefined;
  switch (a.how) {
    case 'accept': return { title: `Let ${ask.name} run ${T.what} at ${ask.placeName}`, detail: head, effects: [note(`~$${yours}/wk to you while it runs`), ...(ask.from === 'own' && ask.who ? [{ type: 'opinion', from: ask.who, to: s.playerId, amount: 6, reason: 'Let me run my thing at his place', decay: 0.5, label: 'A request' } as Effect] : [])], cost: 0, because: `let ${ask.name} run ${T.what} at ${ask.placeName}`, category: 'event', disabledReason: gone };
    case 'counter': {
      const cut = Math.max(ask.cut + 1, Math.min(70, a.cut ?? ask.cut + 10));
      return { title: `Counter ${ask.name}: ${cut}%`, detail: `${head} He takes ${cut}% about ${Math.round(counterOdds(ask, cut) * 100)}% of the time; otherwise he meets you halfway or walks.`, effects: [note(`${Math.round(counterOdds(ask, cut) * 100)}%: he runs it at ${cut}%`)], cost: 0, because: `countered ${ask.name} at ${cut}%`, category: 'event', disabledReason: gone ?? (ask.countered ? 'He already came back once; take it or leave it' : undefined) };
    }
    case 'refuse': return { title: `Turn ${ask.name} down`, detail: head, effects: [note('He takes it somewhere else'), ...(ask.from === 'rival' && ask.rival ? [{ type: 'rivalOpinion', rival: ask.rival, amount: -2, reason: 'Turned our man away', label: 'A request' } as Effect] : [])], cost: 0, because: `turned ${ask.name} down`, category: 'event' };
    case 'delegate': {
      const seat = ask.from === 'rival' ? 'consigliere' : 'underboss';
      const h = holder(s, seat);
      return { title: `Let your ${seat} decide on ${ask.name}`, detail: `${head} ${h ? `${h.firstName} weighs it his own way and answers in your name; it is his call, and his to answer for.` : ''}`, effects: [note(h ? `${h.firstName} decides` : 'Nobody in the seat')], cost: 0, because: `left ${ask.name}'s request to your ${seat}`, category: 'event', disabledReason: gone ?? (h ? undefined : `Nobody holds the ${seat}'s seat`) };
    }
    case 'later': return { title: `Tell ${ask.name} to come back later`, detail: head, effects: [note('He asks again in a month, if he is still looking')], cost: 0, because: `told ${ask.name} to come back later`, category: 'event', disabledReason: gone };
  }
}

export function commitAsk(ctx: Ctx, a: PlaceAskAction): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  const ask = (e.asks ?? []).find((x) => x.id === a.id);
  if (!ask || ask.until < s.week || !placeById(s, ask.place)?.mine) return;
  const drop = () => { e.asks = (e.asks ?? []).filter((x) => x.id !== ask.id); };
  if (a.how === 'delegate') {
    const seat = ask.from === 'rival' ? 'consigliere' : 'underboss';
    const h = holder(s, seat);
    if (!h) return;
    // His call: the advice as he weighs it (a greedy man likes the money, a careful one the lawyer).
    const v = assessAsk(s, ask).reduce((acc, x) => acc + x.lean * (x.role === 'The money' && h.traits.includes('Greedy') ? 2 : x.role === 'The lawyer' && h.traits.includes('Paranoid') ? 2 : 1), 0);
    drop();
    if (v >= 1) { takeIn(ctx, ask, ask.cut, h.id); ctx.log.push(`${h.firstName} ${h.lastName} let ${ask.name} in at ${ask.placeName}.`); }
    else { refused(ctx, ask, h.id); ctx.log.push(`${h.firstName} ${h.lastName} turned ${ask.name} away from ${ask.placeName}.`); }
    return;
  }
  if (a.how === 'refuse') { drop(); refused(ctx, ask, s.playerId); ctx.log.push(`${ask.name} takes his ${TRADES[ask.trade].what} somewhere else.`); return; }
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

/** Turned away: one of yours remembers it. */
function refused(ctx: Ctx, ask: PlaceAsk, by: string): void {
  const s = ctx.s;
  if (ask.from === 'own' && ask.who && s.characters[ask.who]) addOpinion(s, ask.who, by, 'Turned down my request', -3, 1);
  remember(s, `${ask.name} was turned away from ${ask.placeName}`, [ask.who ?? '', by]);
}

function takeIn(ctx: Ctx, ask: PlaceAsk, cut: number, by?: string): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  const T = TRADES[ask.trade];
  const c = ask.who ? s.characters[ask.who] : undefined;
  const who = by ?? s.playerId;
  // A neighboring crew that claims the place remembers; men of conscience object to rooms by the hour.
  const claim = claimOn(s, ask.place, ask.rival);
  if (claim) { const R = s.rivals.find((x) => x.id === claim); if (R) addOpinion(s, R.leaderId, s.playerId, 'Took a place under our agreement', -3, 1); }
  if (ask.trade === 'hourly') for (const m of crew(s).filter((x) => x.traits.includes('Pious') && (x.rank === 'capo' || x.rank === 'underboss' || x.rank === 'consigliere'))) addOpinion(s, m.id, s.playerId, 'Rooms by the hour under the family\'s roof', -4, 0);
  remember(s, `${ask.name} was let in to run ${T.what} at ${ask.placeName} (${cut}%)${by && by !== s.playerId ? ` by ${s.characters[by]?.firstName}` : ''}`, [ask.who ?? '', who]);
  if (ask.from === 'own' && c && canHoldSpot(s, c)) {
    // One of yours: it is his spot (kickup.ts), at your place, at the agreed cut.
    const p = placeById(s, ask.place);
    (e.spots ??= {})[c.id] = { k: T.spot, by: who, w: s.week, f: 'player', ...(p?.district && s.districts.some((d) => d.id === p.district) ? { d: p.district } : {}), up: cut, nm: `${T.what} at ${ask.placeName}`, lv: 1 };
    if (e.spotless) delete e.spotless[c.id];
    ctx.log.push(`${c.firstName} ${c.lastName} runs ${T.what} at ${ask.placeName}; ${cut}% comes up.`);
    return;
  }
  const all = (e.tenants ??= {});
  if (Object.keys(all).length >= MAX_TENANTS) return;
  all[ask.id] = { name: ask.name, ...(ask.who ? { who: ask.who } : {}), ...(ask.rival ? { rival: ask.rival } : {}), trade: ask.trade, place: ask.place, placeName: ask.placeName, cut, gross: ask.gross, ...(ask.cop ? { cop: 1 as const } : {}), ...(claim ? { claim } : {}), by: who, w: s.week };
  ctx.log.push(`${ask.name} runs ${T.what} at ${ask.placeName}: ${cut}% of it is yours every week.`);
}

/* ------------------------------------------------------------------ */
/* Resolution: keep him, put your own man in, or close it              */
/* ------------------------------------------------------------------ */

export type TenantHow = 'keep' | 'replace' | 'withdraw';
export type TenantCallAction = { type: 'tenantCall'; id: string; how: TenantHow };

export function tenantAction(id: string, how: TenantHow): PlayerAction {
  return { kind: 'econ', op: { type: 'tenantCall', id, how } };
}

/** Tenants with trouble waiting on your word. */
export function troubled(s: GameState): [string, Tenant][] {
  return Object.entries(s.econ?.tenants ?? {}).filter(([, t]) => !!t.trouble).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** The man of yours who would take over a tenant's racket. */
export function replacementFor(s: GameState, t: Tenant): Character | undefined {
  const k = TRADES[t.trade].spot;
  return crew(s).filter((c) => canHoldSpot(s, c) && (!spotOf(s, c.id) || spotOf(s, c.id)?.free) && !(c.traits.includes('Pious') && (k === 'shylock' || k === 'cards')))
    .sort((a, b) => b.attributes.business - a.attributes.business || (a.id < b.id ? -1 : 1))[0];
}

export function previewTenant(s: GameState, a: TenantCallAction): ActionPreview {
  const t = s.econ?.tenants?.[a.id];
  if (!t) return { title: 'A tenant', effects: [], cost: 0, because: '', disabledReason: 'Gone', category: 'event' };
  const T = TRADES[t.trade];
  const note = (text: string): Effect => ({ type: 'econ', op: { op: 'note', text } });
  const tr = t.trouble ? ` Trouble: ${TROUBLE_WORD[t.trouble.k]}.` : '';
  switch (a.how) {
    case 'keep': return { title: `Keep ${t.name} at ${t.placeName}`, detail: `It goes on as it is.${tr}${t.trouble?.k === 'claim' ? ' The neighbors will take it badly.' : ''}`, effects: [note('It goes on; the trouble is answered'), ...(t.trouble?.k === 'claim' && t.claim ? [{ type: 'rivalOpinion', rival: t.claim, amount: -3, reason: 'Kept the place we claim', label: t.placeName } as Effect] : [])], cost: 0, because: `kept ${t.name} at ${t.placeName}`, category: 'event' };
    case 'replace': {
      const m = replacementFor(s, t);
      return { title: `Put your own man in for ${t.name}`, detail: `${m ? `${m.firstName} ${m.lastName} runs ${T.what} at ${t.placeName} as his spot` : 'Nobody free to take it'}; ${t.name} is out, and remembers it.${tr}`, effects: [note(m ? `${m.firstName} takes it over` : 'Nobody to take it'), ...(t.rival ? [{ type: 'rivalOpinion', rival: t.rival, amount: -4, reason: 'Pushed our man out', label: t.placeName } as Effect] : [])], cost: 0, because: `put your own man in at ${t.placeName}`, category: 'event', disabledReason: m ? undefined : 'Nobody free to take it over' };
    }
    case 'withdraw': return { title: `Close ${t.name}'s ${T.what} at ${t.placeName}`, detail: `The racket stops; your end of it stops too.${tr}`, effects: [note(`−~$${Math.round(t.gross * t.cut / 100)}/wk`)], cost: 0, because: `closed ${t.name}'s ${T.what}`, category: 'event' };
  }
}

export function commitTenant(ctx: Ctx, a: TenantCallAction): void {
  const s = ctx.s;
  const all = s.econ?.tenants;
  const t = all?.[a.id];
  if (!all || !t) return;
  const T = TRADES[t.trade];
  if (a.how === 'keep') {
    if (t.trouble?.k === 'quarrel' && t.who && s.characters[t.who]) addOpinion(s, t.who, s.playerId, 'He backed me in the quarrel', 4, 1);
    remember(s, `${t.name} kept ${T.what} at ${t.placeName} through ${t.trouble ? TROUBLE_WORD[t.trouble.k].split(':')[0] : 'it all'}`, [t.who ?? '', s.playerId]);
    delete t.trouble;
    return;
  }
  delete all[a.id];
  if (t.who && s.characters[t.who]) addOpinion(s, t.who, s.playerId, a.how === 'replace' ? 'Pushed me out of my own game' : 'Closed my game at his place', a.how === 'replace' ? -10 : -5, 0.5);
  if (a.how === 'replace') {
    const m = replacementFor(s, t);
    if (m) {
      const e = ensureEcon(s);
      const p = placeById(s, t.place);
      (e.spots ??= {})[m.id] = { k: T.spot, by: s.playerId, w: s.week, f: 'player', ...(p?.district && s.districts.some((d) => d.id === p.district) ? { d: p.district } : {}), up: SPOTS[T.spot].up, nm: `${T.what} at ${t.placeName}`, lv: 1 };
      if (e.spotless) delete e.spotless[m.id];
      remember(s, `${m.firstName} ${m.lastName} took over ${T.what} at ${t.placeName} from ${t.name}`, [m.id, t.who ?? '', s.playerId]);
      ctx.log.push(`${m.firstName} ${m.lastName} runs ${T.what} at ${t.placeName} now; ${t.name} is out.`);
      return;
    }
  }
  remember(s, `${t.name}'s ${T.what} at ${t.placeName} was closed`, [t.who ?? '', s.playerId]);
  ctx.log.push(`${t.name}'s ${T.what} at ${t.placeName} is closed.`);
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
