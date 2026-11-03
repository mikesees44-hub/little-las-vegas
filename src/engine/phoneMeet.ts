import { capos, crew, displayName, hasTrait, isFree, player } from './characters';
import { holder as seatHolder } from './council';
import { applyEffects, fmtMoney } from './effects';
import { newCtx, type Ctx } from './ledger';
// The state copy that keeps the big copy-on-write parts shared (houses, politics, the Book): the screens' caches stay warm.
import { cloneState } from './engine';
import { journal, type JCat } from './journal';
import { opinion } from './relations';
import { DAY_NAMES, today } from './days';
import { wifeOf } from './bonds';
import { activeGoomars } from './goomar';
import { hourText, whenText } from './threats';
import { registerDelivery, scheduleInto, type MomentView, type ScheduledItem } from './schedule';
import { clockHour, spendTime, timeBlock } from './timeCost';
import { cannotArgue, openArgument } from './argue';
import { lineAt, LINE_LABEL, offTape, onTape, phoneSweep, roll, tapeRisk, tapped } from './phone';
import { ensurePhone, pushLog, type Line } from './phoneState';
import type { NowResult } from './deeds/now';
import type { Character, Effect, GameState, PlayerAction, RivalId } from './types';

/**
 * THE PHONE BOOK AND THE MEET (PHONE.md): the boss picks up the phone himself.
 *
 *  - The phone book: the people he knows and has a number for (his wife, his goomar, his seats and
 *    capos, the cops on the pad, the rival bosses and Philadelphia, the phone company man).
 *  - A call: a purpose (set a meet, check in, give an order, sweet-talk, threaten, check the line),
 *    rolled now with its odds, on a line (his own, or a pay phone: slower and safer), plain or in code.
 *    A quarter hour of his day (timeCost.ts 'phone:call'; a pay phone is half an hour).
 *  - A meet: a place and a day and hour. At that hour the clock stops for it (schedule.ts kind 'meet'):
 *    he shows or he doesn't, he brings company, or it is a set-up (his opinion, the plots against
 *    the boss, his nature, and the place: a car is safest, the boardwalk is public, the church is
 *    neutral ground). Leaning on a man of yours who won't be leaned on turns into an argument
 *    (argue/run.ts). A rat at a meet is wearing a wire.
 *
 * Pure: every exported transform returns a new state. Rolls are hashed off the seed and the item.
 */

const r2 = (v: number) => Math.round(Math.max(0.02, Math.min(0.98, v)) * 100) / 100;

/* ------------------------------------------------------------------ */
/* The book                                                            */
/* ------------------------------------------------------------------ */

export type Purpose = 'meet' | 'checkin' | 'order' | 'sweet' | 'threaten' | 'sweep';
export const PURPOSE_LABEL: Record<Purpose, string> = { meet: 'Set a meet', checkin: 'Check in', order: 'Give an order', sweet: 'Sweet-talk', threaten: 'Threaten', sweep: 'Have him check the line' };

export type BookGroup = 'family' | 'crew' | 'outfits' | 'services';
export interface BookEntry { id: string; name: string; role: string; group: BookGroup; purposes: Purpose[] }

/** The phone company man (not a character: a service). */
export const PHONE_MAN = 'phoneman';
export const SWEEP_PRICE = 300;
export const SWEEP_ODDS = 0.75;

export function phoneBook(s: GameState): BookEntry[] {
  const out: BookEntry[] = [];
  const wife = wifeOf(s);
  if (wife) out.push({ id: wife.id, name: displayName(wife), role: 'Your wife', group: 'family', purposes: ['meet', 'checkin', 'sweet'] });
  for (const g of activeGoomars(s)) {
    const c = s.characters[g.id];
    if (c?.alive) out.push({ id: c.id, name: displayName(c), role: 'Your goomar', group: 'family', purposes: ['meet', 'checkin', 'sweet'] });
  }
  const ub = seatHolder(s, 'underboss');
  const cons = seatHolder(s, 'consigliere');
  const men: Character[] = [...(ub ? [ub] : []), ...(cons ? [cons] : []), ...capos(s).filter((c) => isFree(s, c) && c.id !== ub?.id && c.id !== cons?.id)];
  for (const c of men) out.push({ id: c.id, name: displayName(c), role: c.id === ub?.id ? 'Your underboss' : c.id === cons?.id ? 'Your consigliere' : `Capo${s.districts.find((d) => d.capoId === c.id) ? ` · ${s.districts.find((d) => d.capoId === c.id)!.name}` : ''}`, group: 'crew', purposes: ['meet', 'checkin', 'order', 'sweet', 'threaten'] });
  for (const c of crew(s).filter((x) => x.outside === 'cop' && isFree(s, x))) out.push({ id: c.id, name: displayName(c), role: 'A cop on the pad', group: 'crew', purposes: ['meet', 'checkin', 'sweet', 'threaten'] });
  for (const r of s.rivals) {
    if (r.kind === 'law') continue;
    const c = s.characters[r.leaderId];
    if (!c?.alive || c.id === s.playerId) continue;
    out.push({ id: c.id, name: displayName(c), role: r.kind === 'philly' ? 'Philadelphia' : `Boss of ${r.name}`, group: 'outfits', purposes: ['meet', 'checkin', 'sweet', 'threaten'] });
  }
  out.push({ id: PHONE_MAN, name: 'The phone company man', role: 'Checks a line for a tap, quietly', group: 'services', purposes: ['sweep'] });
  return out;
}

function rivalOf(s: GameState, id: string): GameState['rivals'][number] | undefined {
  return s.rivals.find((r) => r.leaderId === id && r.kind !== 'law');
}

/* ------------------------------------------------------------------ */
/* The places                                                          */
/* ------------------------------------------------------------------ */

export type PlaceId = 'club' | 'diner' | 'boardwalk' | 'car' | 'church' | 'hotel';
export interface MeetPlace { id: PlaceId; name: string; hint: string; show: number; setup: number; talk: number; lean: number; safe: number }

/** The places (the club, a diner and a motel are his own when he has them on the map). */
export function meetPlaces(s: GameState): MeetPlace[] {
  const own = (kinds: string[]) => s.businesses.find((b) => b.owner === 'player' && kinds.includes(b.kind));
  const diner = own(['deli', 'restaurant', 'pizza']);
  const motel = own(['motel', 'boarding', 'hotel']);
  return [
    { id: 'club', name: 'the social club', hint: 'Your ground: easy to lean, harder to get him to come. The club may be bugged.', show: -0.25, setup: 0.3, talk: 0, lean: 0.1, safe: 0.2 },
    { id: 'diner', name: diner ? `the back booth at ${diner.name}` : 'a diner on Pacific Avenue', hint: diner ? 'Your place: your people at the counter' : 'Neutral, public enough', show: 0, setup: diner ? 0.5 : 0.8, talk: 0.05, lean: 0, safe: diner ? 0.15 : 0.05 },
    { id: 'boardwalk', name: 'the boardwalk', hint: 'Public: nobody tries anything, and everybody sees you together', show: 0.05, setup: 0.4, talk: 0.05, lean: -0.1, safe: 0.15 },
    { id: 'car', name: 'a car on the beach block', hint: 'Safest: nothing on the walls. Nobody likes getting in a car.', show: -0.15, setup: 0.2, talk: 0, lean: 0.05, safe: 0.3 },
    { id: 'church', name: 'a back pew at the church', hint: 'Neutral ground: he comes, and nobody draws in church', show: 0.2, setup: 0.1, talk: 0.1, lean: -0.15, safe: 0.35 },
    { id: 'hotel', name: motel ? `a room at ${motel.name}` : 'a room at a motel on Ocean Avenue', hint: 'Private: good for secrets and for set-ups', show: -0.05, setup: 1.5, talk: 0.1, lean: 0, safe: -0.1 },
  ];
}

export function placeOf(s: GameState, id: string): MeetPlace {
  const ps = meetPlaces(s);
  return ps.find((p) => p.id === id) ?? ps[0];
}

/** The days a meet can be set for: tomorrow to Sunday, then next Tuesday to Thursday (Monday is the Sit-Down). */
export function meetDays(s: GameState): { w: number; d: number; label: string }[] {
  const d0 = today(s);
  const out: { w: number; d: number; label: string }[] = [];
  for (let d = d0 + 1; d <= 6; d++) out.push({ w: s.week, d, label: d === d0 + 1 ? `Tomorrow (${DAY_NAMES[d]})` : DAY_NAMES[d] });
  for (let d = 1; d <= 3 && out.length < 6; d++) out.push({ w: s.week + 1, d, label: `Next ${DAY_NAMES[d]}` });
  return out;
}
export const MEET_HOURS = [9, 11, 13, 15, 18, 21, 23];

/* ------------------------------------------------------------------ */
/* Dialing                                                             */
/* ------------------------------------------------------------------ */

export interface DialSpec {
  who: string;
  purpose: Purpose;
  /** 'pay': walk to a pay phone (safer, half an hour). Otherwise his own line (the club by day, the house at night). */
  pay?: boolean;
  code?: boolean;
  place?: PlaceId;
  w?: number;
  d?: number;
  hour?: number;
}

interface DialOpt { p: number; biz: boolean; hint: string; cost?: Effect[]; ok: Effect[]; bad: Effect[]; okText: string; badText: string; blocked?: string; then?: (x: GameState, ok: boolean, ctx: Ctx) => string | void }

/** The line he would call on now. */
export function dialLine(s: GameState, pay?: boolean): Line {
  return pay ? 'pay' : lineAt(Math.floor(clockHour(s)) % 24);
}

const opE = (s: GameState, who: string, amount: number, reason: string): Effect[] => (s.characters[who]?.alive ? [{ type: 'opinion', from: who, to: s.playerId, amount, reason, label: reason }] : []);

function dialSpec(s: GameState, sp: DialSpec): DialOpt | undefined {
  const boss = player(s);
  if (sp.who === PHONE_MAN) {
    if (sp.purpose !== 'sweep') return undefined;
    return {
      p: s.phone?.tap ? SWEEP_ODDS : 1, biz: false, hint: `−${fmtMoney(SWEEP_PRICE)} · ${Math.round(SWEEP_ODDS * 100)}% he finds a tap, if there is one`,
      cost: [{ type: 'money', amount: -SWEEP_PRICE, category: 'heat', label: 'The phone company man checked the line' }], ok: [], bad: [],
      okText: 'He checked the line.', badText: 'He checked the line and found nothing.', blocked: s.money < SWEEP_PRICE ? `Needs ${fmtMoney(SWEEP_PRICE)}` : undefined,
      then: (x, ok) => { if (!ok) return 'The line is clean, he says.'; const t = phoneSweep(x, 1, `man${x.week}`); return t || 'The line is clean, he says.'; },
    };
  }
  const c = s.characters[sp.who];
  if (!c?.alive || !phoneBook(s).some((e) => e.id === c.id && e.purposes.includes(sp.purpose))) return undefined;
  const o = opinion(s, c.id, s.playerId);
  const rv = rivalOf(s, c.id);
  const P = s.phone;
  const once = (P?.talked[`${sp.purpose}:${c.id}`] ?? -1) === s.week;
  const codeMinus = sp.code ? 0.1 : 0;
  switch (sp.purpose) {
    case 'meet': return { p: 1, biz: false, hint: 'He gets the place and the hour', ok: [], bad: [], okText: `${c.firstName} will be there.`, badText: '' };
    case 'checkin': return {
      p: r2(0.8 + o / 300), biz: false, hint: rv ? 'Pay your respects: his outfit +2' : 'He likes being asked (+3)',
      ok: rv ? [{ type: 'rivalOpinion', rival: rv.id as RivalId, amount: 2, reason: 'Paid his respects on the phone' }] : opE(s, c.id, 3, 'The boss called to see how I am'), bad: [],
      okText: `${c.firstName} was glad you called.`, badText: `${c.firstName} kept it short.`, blocked: once ? 'You talked this week' : undefined,
    };
    case 'order': {
      const d = s.districts.find((x) => x.capoId === c.id);
      const amt = Math.max(300, Math.round(((d ? 900 : 500) + boss.attributes.leadership * 6) / 50) * 50);
      return {
        p: r2(0.45 + o / 200 + boss.attributes.leadership / 400 - codeMinus), biz: true, hint: `Push his crew this week: +${fmtMoney(amt)} · if not, he grumbles (−3)`,
        ok: [{ type: 'money', amount: amt, category: 'event', label: `${c.firstName} pushed his crew on your call` }], bad: opE(s, c.id, -3, 'The boss leaned on me over the phone'),
        okText: `${c.firstName} sent up an extra envelope: ${fmtMoney(amt)}.`, badText: `${c.firstName} said he'd see what he could do. Nothing came.`, blocked: once ? 'You already pushed him this week' : undefined,
      };
    }
    case 'sweet': return {
      p: r2(0.45 + boss.attributes.diplomacy / 250 + o / 300), biz: false, hint: `He warms to you (+5)${rv ? ', his outfit +3' : ''}`,
      ok: [...opE(s, c.id, 5, 'He called me, friendly'), ...(rv ? [{ type: 'rivalOpinion', rival: rv.id as RivalId, amount: 3, reason: 'A friendly call' } as Effect] : [])], bad: opE(s, c.id, -1, 'He laid it on thick'),
      okText: `${c.firstName} warmed up by the end of it.`, badText: `${c.firstName} heard what you wanted.`, blocked: once ? 'You talked this week' : undefined,
    };
    case 'threaten': {
      const p = r2(0.35 + boss.attributes.force / 300 + s.respect / 400 - c.attributes.force / 400 - codeMinus);
      const canArgue = !rv && c.faction === 'player' && !cannotArgue(s, { t: c.id });
      return {
        p, biz: true, hint: `He backs down: respect +1${rv ? ', his outfit −6' : ', his fear +10'}${canArgue ? ' · if not, it turns into a shouting match' : ' · if not, respect −1'}`,
        ok: [{ type: 'respect', amount: 1, label: `${c.firstName} backed down on the phone` }, ...(rv ? [{ type: 'rivalOpinion', rival: rv.id as RivalId, amount: -6, reason: 'Threatened on the phone' } as Effect] : [{ type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 10 } as Effect]), ...opE(s, c.id, -6, 'He threatened me on the phone')],
        bad: [...opE(s, c.id, -8, 'He threatened me on the phone'), ...(canArgue ? [] : [{ type: 'respect', amount: -1, label: `${c.firstName} laughed at a threat` } as Effect])],
        okText: `${c.firstName} went quiet, then said he understood.`, badText: canArgue ? `${c.firstName} shouted back. It is not over.` : `${c.firstName} laughed and hung up.`,
        then: (x, ok) => { if (!ok && canArgue) { const y = openArgument(x, { k: 'insult', t: c.id, label: 'A threat on the phone', src: 'phone' }); x.argue = y.argue; } },
      };
    }
    default: return undefined;
  }
}

/** The odds and the hint the dial window shows for a call, before he makes it. */
export function dialPreview(s: GameState, sp: DialSpec): { odds: number; hint: string; blocked?: string; line: Line; tape?: string } | undefined {
  const o = dialSpec(s, sp);
  if (!o) return undefined;
  const line = dialLine(s, sp.pay);
  const odds = Math.round(o.p * (o.biz ? offTape(s, line, !!sp.code) : 1) * 100) / 100;
  const tb = timeBlock(s, { kind: 'phone', op: { op: sp.pay ? 'pay' : 'call' } } as unknown as PlayerAction);
  return { odds, hint: o.hint, blocked: o.blocked ?? tb ?? (s.gameOver ? 'The game is over' : undefined), line, ...(o.biz ? { tape: `Business on ${LINE_LABEL[line]}: if it's tapped, ${Math.round(tapeRisk(s, line, !!sp.code) * 100)}% it's on tape` } : {}) };
}

/** Make the call. Pure. */
export function dial(input: GameState, sp: DialSpec): { state: GameState; result: NowResult } {
  const fail = (error: string): { state: GameState; result: NowResult } => ({ state: input, result: { ok: false, error, title: 'The phone', tier: 'fail', headline: error, line: '', changes: [], leadsTo: [] } });
  const pv = dialPreview(input, sp);
  const o = dialSpec(input, sp);
  if (!pv || !o) return fail('Nobody at that number');
  if (pv.blocked) return fail(pv.blocked);
  if (sp.purpose === 'meet' && (sp.place === undefined || sp.d === undefined || sp.hour === undefined)) return fail('Pick a place and a time');
  const line = pv.line;
  const t = spendTime(input, { kind: 'phone', op: { op: sp.pay ? 'pay' : 'call' } } as unknown as PlayerAction);
  const s = cloneState(t.state);
  const P = ensurePhone(s);
  const ctx = newCtx(s);
  const before = { money: s.money + Math.round(s.tribute?.acct.personal ?? 0), respect: s.respect, heat: { ...s.heat } };
  const key = `out${P.n + 1}|${s.week}|${today(s)}`;
  P.n++;
  const rv = roll(`${s.seed}|${key}|ex`);
  const ok = rv < o.p;
  if (o.cost?.length) applyEffects(ctx, o.cost, { label: PURPOSE_LABEL[sp.purpose], because: PURPOSE_LABEL[sp.purpose].toLowerCase(), category: 'event' });
  const eff = ok ? o.ok : o.bad;
  const name = sp.who === PHONE_MAN ? 'The phone company man' : displayName(s.characters[sp.who]);
  if (eff.length) applyEffects(ctx, eff, { label: `On the phone with ${name}`, because: PURPOSE_LABEL[sp.purpose].toLowerCase(), category: 'event' });
  const lines = [ok ? o.okText : o.badText];
  const more = o.then?.(s, ok, ctx);
  if (more) lines.push(more);
  if (sp.purpose === 'meet') {
    const pl = placeOf(s, sp.place!);
    scheduleInto(s, { kind: 'meet', day: sp.d!, hour: sp.hour!, w: sp.w ?? s.week, payload: { who: sp.who, place: pl.id, purpose: 'meet' } });
    lines[0] = `${s.characters[sp.who].firstName} will meet you at ${pl.name}, ${whenText(sp.d!, sp.hour!)}${(sp.w ?? s.week) > s.week ? ' next week' : ''}.`;
  }
  if (o.biz && tapped(s, line) && roll(`${s.seed}|${key}|tape`) < tapeRisk(s, line, !!sp.code)) lines.push(onTape(s, ctx, sp.who, !!sp.code));
  if (sp.code) P.stats.code++;
  P.stats.out++;
  if (sp.who !== PHONE_MAN) P.talked[`${sp.purpose}:${sp.who}`] = s.week;
  pushLog(P, { w: s.week, d: today(s), h: Math.floor(t.from) % 24, dir: 'out', name, t: `${PURPOSE_LABEL[sp.purpose]}${sp.pay ? ' (pay phone)' : ''}${sp.code ? ' (in code)' : ''}: ${lines[0]}` });
  journal(s, {
    d: today(s), tm: hourText(Math.floor(t.from) % 24), c: catOf(s, sp.who), t: `You called ${name}: ${PURPOSE_LABEL[sp.purpose].toLowerCase()}`,
    r: [`On ${LINE_LABEL[line]}${sp.code ? ', in code' : ''}.`, ...lines, ...ctx.log].slice(0, 8), src: 'phone', mine: 1, ...(s.characters[sp.who] ? { p: [sp.who] } : {}),
  });
  const odds = pv.odds;
  return { state: s, result: result(s, before, `You called ${name}`, s.characters[sp.who] ? name : undefined, odds, rv, ok || sp.purpose === 'meet', lines.join(' ')) };
}

function catOf(s: GameState, who: string): JCat {
  if (who === PHONE_MAN) return 'law';
  if (rivalOf(s, who)) return 'rivals';
  if (wifeOf(s)?.id === who) return 'family';
  if (activeGoomars(s).some((g) => g.id === who)) return 'romance';
  return 'crew';
}

function result(s: GameState, before: { money: number; respect: number; heat: GameState['heat'] }, title: string, who: string | undefined, odds: number, rv: number, ok: boolean, line: string): NowResult {
  const changes: string[] = [];
  const sgn = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;
  const money = s.money + Math.round(s.tribute?.acct.personal ?? 0);
  if (money !== before.money) changes.push(`Money ${money > before.money ? '+' : '−'}$${Math.abs(money - before.money).toLocaleString('en-US')}`);
  if (s.respect !== before.respect) changes.push(`Respect ${sgn(s.respect - before.respect)}`);
  for (const k of ['local', 'family', 'federal'] as const) if (s.heat[k] !== before.heat[k]) changes.push(`${k[0].toUpperCase()}${k.slice(1)} heat ${sgn(s.heat[k] - before.heat[k])}`);
  // A sure thing (no odds to speak of) shows no roll.
  if (odds >= 0.995) return { ok: true, title, ...(who ? { who } : {}), tier: 'success', headline: 'Done', line: line.replace(/\.\.+/g, '.'), changes: [...changes], leadsTo: [] };
  return { ok: true, title, ...(who ? { who } : {}), chance: odds, roll: Math.floor(rv * 100), tier: ok ? (rv < odds * 0.3 ? 'crit' : 'success') : 'fail', headline: `${Math.round(odds * 100)}% — ${ok ? 'it went your way' : 'it did not'}`, line: line.replace(/\.\.+/g, '.'), changes, leadsTo: [] };
}

/* ------------------------------------------------------------------ */
/* The meet (schedule.ts kind 'meet')                                  */
/* ------------------------------------------------------------------ */

export type MeetState = 'show' | 'late' | 'company' | 'setup' | 'noshow';

interface MeetPay { who: string; place: PlaceId; purpose: 'meet' | 'sitdown' }

/** What waits at the meet (hashed off the item: the same every time the card is drawn). */
export function meetOdds(s: GameState, p: MeetPay): { show: number; setup: number; company: number } {
  const c = s.characters[p.who];
  const pl = placeOf(s, p.place);
  if (!c) return { show: 0, setup: 0, company: 0 };
  const o = opinion(s, c.id, s.playerId);
  const rv = rivalOf(s, c.id);
  const close = wifeOf(s)?.id === c.id || activeGoomars(s).some((g) => g.id === c.id);
  let show = close ? 0.93 : rv ? 0.45 + o / 200 + pl.show + (p.purpose === 'sitdown' ? 0.35 : 0) - (rv.war ? 0.1 : 0) : 0.9 + Math.min(0, o / 100) + pl.show / 2;
  show = Math.max(0.1, Math.min(0.98, show));
  // A set-up: a rival who wants him dead, a man of his who sold him, a nature that does it.
  const plots = (s.schemes ?? []).some((x) => x.kind === 'murder' && x.targetId === s.playerId && (x.ownerId === c.id || (rv && x.owner === rv.id)));
  let setup = 0;
  if (rv) setup = (o < -20 ? 0.12 : 0.03) + (rv.war ? 0.1 : 0);
  else if (!close && c.informantFor && c.informantFor !== 'law' && c.informantFor !== 'player') setup = 0.15;
  if (plots) setup += 0.35;
  if (setup > 0 && (hasTrait(c, 'Cruel') || hasTrait(c, 'Vengeful'))) setup += 0.05;
  if (setup > 0 && hasTrait(c, 'Honest')) setup /= 2;
  setup = Math.min(0.7, setup * pl.setup);
  const company = close ? 0 : rv ? 0.4 : 0.1;
  return { show, setup, company };
}

export function meetState(s: GameState, it: ScheduledItem): MeetState {
  const p = it.payload as unknown as MeetPay;
  const m = meetOdds(s, p);
  if (roll(`${s.seed}|${it.id}|setup`) < m.setup) return 'setup';
  if (roll(`${s.seed}|${it.id}|show`) >= m.show) return 'noshow';
  if (roll(`${s.seed}|${it.id}|co`) < m.company) return 'company';
  return 'show';
}

interface MeetOpt { id: string; label: string; hint: string; p: number; biz?: boolean; blocked?: string; cost?: Effect[]; ok: Effect[]; bad: Effect[]; okText: string; badText: string; then?: (x: GameState, ok: boolean) => void }

function meetOpts(s: GameState, it: ScheduledItem): { st: MeetState; opts: MeetOpt[] } | undefined {
  const p = it.payload as unknown as MeetPay;
  const c = s.characters[p.who];
  if (!c?.alive || s.gameOver) return undefined;
  const boss = player(s);
  const pl = placeOf(s, p.place);
  const rv = rivalOf(s, c.id);
  const close = wifeOf(s)?.id === c.id || activeGoomars(s).some((g) => g.id === c.id);
  const o = opinion(s, c.id, s.playerId);
  const st = meetState(s, it);
  const nm = c.firstName;
  const hurt = (n: number, label: string): Effect => ({ type: 'health', charId: s.playerId, amount: -n, label });
  if (st === 'setup') {
    return { st, opts: [
      { id: 'walk', label: 'Walk out, now', hint: 'If you\'re quick, nothing happens · if not, you are shot at', p: r2(0.55 + pl.safe), ok: [], bad: [hurt(15, 'Shot at walking out of a meet'), { type: 'heat', bar: 'local', amount: 4, label: 'Shots at a meet' }], okText: 'You were out the door before anybody moved.', badText: 'Two shots as you reached the car. One found you.' },
      { id: 'draw', label: 'Move first', hint: `Respect +3${rv ? `, the ${rv.shortName} lose men` : ''} · if not, you are hurt badly`, p: r2(0.3 + boss.attributes.force / 250 + pl.safe / 2), ok: [{ type: 'respect', amount: 3, label: 'You turned a set-up around' }, { type: 'heat', bar: 'local', amount: 5, label: 'Gunfire at a meet' }, ...(rv ? [{ type: 'rivalResource', rival: rv.id, muscle: -6, label: 'Their men at the meet' } as Effect] : [])], bad: [hurt(25, 'Hurt in a set-up'), { type: 'respect', amount: -1, label: 'Walked into a set-up' }, { type: 'heat', bar: 'local', amount: 5, label: 'Gunfire at a meet' }], okText: 'You moved first. They were not ready for it.', badText: 'You moved first, and so did they.' },
      { id: 'talk', label: 'Talk your way out', hint: 'Respect +1 · if not, a beating', p: r2(0.3 + boss.attributes.diplomacy / 250 + pl.safe / 2), ok: [{ type: 'respect', amount: 1, label: 'You talked your way out of a set-up' }], bad: [hurt(10, 'Beaten at a meet')], okText: 'You talked. They listened long enough for you to leave.', badText: 'They let you talk, then they did what they came to do.' },
    ] };
  }
  if (st === 'noshow') {
    return { st, opts: [
      { id: 'wait', label: 'Wait another hour', hint: '30% he comes late (+3); if not, it was a long hour', p: 0.3, ok: opE(s, c.id, 3, 'He waited for me'), bad: rv ? [{ type: 'respect', amount: -1, label: `${nm} stood you up` }] : [], okText: `${nm} came in late, out of breath, full of apologies.`, badText: `${nm} never came.` },
      { id: 'leave', label: 'Leave', hint: 'He stood you up: he will hear about it', p: 1, ok: close || rv ? [] : opE(s, c.id, -2, 'I missed the boss\'s meet'), bad: [], okText: `${nm} never came. You left.`, badText: '' },
    ] };
  }
  const co = st === 'company';
  const bug = p.place === 'club' && !!s.econ?.hq.bug && (s.econ?.hq.kind ?? 'social') === 'social';
  const rat = !close && c.informantFor === 'law';
  const offer = close ? 300 : rv ? 1500 : 500;
  const canArgue = !rv && !close && c.faction === 'player' && !cannotArgue(s, { t: c.id });
  const talkP = r2(0.55 + boss.attributes.diplomacy / 300 + o / 300 + pl.talk + (p.purpose === 'sitdown' ? 0.1 : 0));
  const leanP = r2(0.4 + boss.attributes.force / 300 + s.respect / 400 - (co ? 0.1 : 0) + pl.lean);
  const wired = (x: GameState): void => {
    // A rat wears a wire; the club's bug hears the back room.
    const ev = (rat ? 5 : 0) + (bug ? 2 : 0);
    if (ev) { const b = x.characters[x.playerId]; b.evidence = Math.min(100, (b.evidence ?? 0) + ev); }
  };
  const opts: MeetOpt[] = [
    { id: 'talk', label: close ? 'A quiet hour together' : p.purpose === 'sitdown' ? 'Talk it through: keep the peace' : 'Talk it through', hint: `He comes away better (+6)${rv ? `, his outfit +4${p.purpose === 'sitdown' ? ', family heat −2' : ''}` : ''}`, p: talkP,
      ok: [...opE(s, c.id, 6, close ? 'An hour with him' : 'We talked it through'), ...(rv ? [{ type: 'rivalOpinion', rival: rv.id as RivalId, amount: 4, reason: 'A good sit-down' } as Effect, ...(p.purpose === 'sitdown' ? [{ type: 'heat', bar: 'family', amount: -2, label: 'Philadelphia likes a quiet Shore' } as Effect] : [])] : [])],
      bad: opE(s, c.id, -2, 'We got nowhere'), okText: close ? `An hour with ${nm}, and nobody looking for you.` : `You and ${nm} came to an understanding.`, badText: `You and ${nm} went around in circles.`, then: (x) => { if (!close) wired(x); } },
    { id: 'press', label: 'Lean on him', hint: close ? 'Not with her' : `Respect +1, his fear +10${rv ? `, his outfit −4` : ''}${co ? ' · he brought company' : ''}${canArgue ? ' · if not, a shouting match' : ' · if not, he walks out (respect −1)'}`, p: leanP, biz: true, blocked: close ? 'Not with her' : undefined,
      ok: [{ type: 'respect', amount: 1, label: `You leaned on ${nm}` }, { type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 10 } as Effect, ...opE(s, c.id, -4, 'He leaned on me at the meet'), ...(rv ? [{ type: 'rivalOpinion', rival: rv.id as RivalId, amount: -4, reason: 'Leaned on at a meet' } as Effect] : [])],
      bad: [...opE(s, c.id, -8, 'He tried to lean on me'), ...(canArgue ? [] : [{ type: 'respect', amount: -1, label: `${nm} walked out on you` } as Effect])],
      okText: `${nm} heard you. He did not like it, and he heard you.`, badText: canArgue ? `${nm} stood up and raised his voice.` : `${nm} walked out on you.`,
      then: (x, ok) => { wired(x); if (!ok && canArgue) { const y = openArgument(x, { k: 'insult', t: c.id, label: `The meet at ${pl.name}`, src: 'phone' }); x.argue = y.argue; } } },
    { id: 'offer', label: close ? 'Bring her something' : 'Make him an offer', hint: `−${fmtMoney(offer)} · ${close ? 'she lights up (+10)' : `he warms up (+10)${rv ? ', his outfit +6' : ''}`}`, p: r2(0.75 + o / 400), blocked: s.money < offer ? `Needs ${fmtMoney(offer)}` : undefined,
      cost: [{ type: 'money', amount: -offer, category: 'event', label: `At the meet with ${nm}` }],
      ok: [...opE(s, c.id, 10, close ? 'He brought me something' : 'He made me a fair offer'), ...(rv ? [{ type: 'rivalOpinion', rival: rv.id as RivalId, amount: 6, reason: 'A fair offer at a meet' } as Effect] : [])], bad: opE(s, c.id, 2, 'He tried to buy me'),
      okText: close ? `${nm} put it on right there.` : `${nm} took it, and meant it.`, badText: `${nm} took the money. That is all he took.` },
    { id: 'leave', label: 'Cut it short', hint: 'Nothing settled (−1)', p: 1, ok: opE(s, c.id, -1, 'He cut our meet short'), bad: [], okText: 'You cut it short.', badText: '' },
  ];
  return { st, opts };
}

const STATE_TEXT: Record<MeetState, (nm: string) => string> = {
  show: (nm) => `${nm} is there, alone, on time.`,
  late: (nm) => `${nm} is there.`,
  company: (nm) => `${nm} is there, and he brought two men who stay standing.`,
  setup: (nm) => `${nm} is not where he should be. There is a car idling that should not be there, and a man by the door you have never seen.`,
  noshow: (nm) => `The hour comes and goes. No ${nm}.`,
};

export function meetView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const m = meetOpts(s, it);
  if (!m) return undefined;
  const p = it.payload as unknown as MeetPay;
  const c = s.characters[p.who];
  const pl = placeOf(s, p.place);
  return {
    id: it.id, title: `${p.purpose === 'sitdown' ? 'The sit-down' : 'The meet'}: ${displayName(c)}`,
    text: `${pl.name[0].toUpperCase()}${pl.name.slice(1)}. ${pl.hint}. ${STATE_TEXT[m.st](c.firstName)}`,
    when: whenText(it.d, it.h), warned: false,
    options: m.opts.map((o) => ({ id: o.id, label: o.label, hint: o.hint, odds: o.p, ...(o.blocked ? { blocked: o.blocked } : {}) })),
    def: m.st === 'setup' ? 'walk' : 'leave',
  };
}

export function answerMeet(input: GameState, it: ScheduledItem, optId: string): { state: GameState; result: NowResult } {
  const m = meetOpts(input, it);
  if (!m) return { state: input, result: { ok: false, error: 'It is over', title: 'The meet', tier: 'fail', headline: 'It is over', line: '', changes: [], leadsTo: [] } };
  const o = m.opts.find((x) => x.id === optId && !x.blocked) ?? m.opts.find((x) => x.id === (m.st === 'setup' ? 'walk' : 'leave'))!;
  const p = it.payload as unknown as MeetPay;
  const t = spendTime(input, { kind: 'phone', op: { op: 'meet' } } as unknown as PlayerAction);
  const s = cloneState(t.state);
  const P = ensurePhone(s);
  const ctx = newCtx(s);
  const c = s.characters[p.who];
  const pl = placeOf(s, p.place);
  const before = { money: s.money + Math.round(s.tribute?.acct.personal ?? 0), respect: s.respect, heat: { ...s.heat } };
  const rv = roll(`${s.seed}|${it.id}|${o.id}|ex`);
  const ok = rv < o.p;
  if (o.cost?.length) applyEffects(ctx, o.cost, { label: o.label, because: o.label.toLowerCase(), category: 'event' });
  const eff = ok ? o.ok : o.bad;
  if (eff.length) applyEffects(ctx, eff, { label: `The meet with ${c.firstName}`, because: o.label.toLowerCase(), category: 'event' });
  o.then?.(s, ok);
  P.stats.meets++;
  if (m.st === 'noshow') P.stats.noShow++;
  if (m.st === 'setup') P.stats.setups++;
  const lines = [STATE_TEXT[m.st](c.firstName), ok ? o.okText : o.badText || o.okText];
  pushLog(P, { w: s.week, d: it.d, h: it.h, dir: 'meet', name: displayName(c), t: `${pl.name}: ${lines[1]}` });
  journal(s, {
    d: it.d, tm: hourText(it.h), c: catOf(s, c.id), t: `The meet with ${displayName(c)} at ${pl.name}`, r: [`You chose: ${o.label}.`, ...lines, ...ctx.log].slice(0, 8),
    src: 'phone', mine: 1, p: [c.id],
  });
  const extra = m.st === 'setup' && !ok ? { h: 'SHOTS AT A MEETING; LOCAL MAN HURT', b: `${pl.name[0].toUpperCase()}${pl.name.slice(1)}: ${lines[1]}` } : undefined;
  return { ...(extra ? { extra } : {}), state: s, result: result(s, before, `${whenText(it.d, it.h)}: the meet with ${c.firstName}`, displayName(c), o.p, rv, ok, lines.join(' ')) } as { state: GameState; result: NowResult };
}

registerDelivery({
  kind: 'meet',
  moment: () => true,
  view: meetView,
  answer: (s, it, opt) => {
    const r = answerMeet(s, it, opt);
    const extra = (r as { extra?: { h: string; b: string } }).extra;
    return { state: r.state, result: r.result, ...(extra ? { extra } : {}) };
  },
});

/** The meets on the clock (for the phone window). */
export function meetsAhead(s: GameState): { id: string; who: string; place: string; when: string }[] {
  return (s.action?.sched ?? []).filter((x) => x.kind === 'meet').map((x) => {
    const p = x.payload as unknown as MeetPay;
    const c = s.characters[p.who];
    return { id: x.id, who: c ? displayName(c) : '?', place: placeOf(s, p.place).name, when: `${whenText(x.d, x.h)}${x.w > s.week ? ' next week' : ''}` };
  });
}
