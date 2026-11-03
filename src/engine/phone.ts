import { crew, displayName, isFree, player } from './characters';
import { holder as seatHolder } from './council';
import { applyEffects, fmtMoney } from './effects';
import { newCtx, type Ctx } from './ledger';
// The state copy that keeps the big copy-on-write parts shared (houses, politics, the Book): the screens' caches stay warm.
import { cloneState } from './engine';
import { journal, type JCat } from './journal';
import { opinion } from './relations';
import { answerCheckIn, daysOf, DAY_NAMES, today } from './days';
import { urgentOn, dayCheckIns } from './checkins';
import { wifeOf } from './bonds';
import { activeGoomars } from './goomar';
import { addSecret } from './secrets';
import { hourText, meetTip, tipOut, whenText, type Tip } from './threats';
import { liveItems, registerDelivery, scheduleInto, scheduled, type MomentView, type ScheduledItem } from './schedule';
import { spendTime } from './timeCost';
import { ensurePhone, wireIn, MISSED_MAX, pushLog, type CallerKind, type CallPayload, type Line, type MissedCall, type PhoneState } from './phoneState';
import type { NowResult } from './deeds/now';
import type { Character, Effect, GameState, PlayerAction, RivalId } from './types';

/**
 * THE PHONE RINGS (PHONE.md): incoming calls on the day/hour clock (schedule.ts kind 'call').
 *
 * Who calls is read off the world, never a stranger out of nowhere:
 *  - REPLACING popups that were there before: an urgent meeting (threats.ts Tip: a cop on the pad
 *    tipping a raid, a capo who heard something) now rings as a call on its day, and a capo's urgent
 *    morning problem (checkins.ts) rings at 7 a.m. Neither adds a stop: they are the stop they were.
 *  - New callers, at most one a day and a couple a week: the goomar, the wife asking where he is,
 *    Philadelphia when the island is in the papers, a rival boss proposing a sit-down, an anonymous
 *    voice at 2 a.m. when somebody is planning something, a reporter, a businessman who wants
 *    protection, and a rat who wants it said on the phone.
 *
 * Important calls stop the clock (one a day, within the week's budget); minor ones ring and go to
 * the missed-calls badge. Every call offers: pick up (a short exchange with odds, rolled now), let it
 * ring (the caller remembers if it is not returned by the end of the next day; some calls come only
 * once), or have someone take a message.
 *
 * THE WIRE: talking business on a tapped line puts the boss on tape (evidence, federal or local heat).
 * Code words cut the risk, the club's back-room line is safer, a pay phone safest. The odds shown are
 * what the boss can know: his guess that the line is tapped (the clicks, the federal heat) times the
 * chance a sentence lands on tape. A sweep or the phone company man finds the tap (phoneSweep).
 *
 * Pure: every exported transform returns a new state. Rolls are hashed off the seed and the call.
 */

export { wireIn };

/**
 * The copy a call works on: cloneState, keeping the parts no call ever touches (the city, the
 * neighborhoods, the night life, the ears) as they were, so the map and the screens keep their caches.
 * A call moves money, respect, heat, opinions, evidence, a rival's standing, the day's hours and the
 * phone's own records, nothing else.
 */
const UNTOUCHED = ['econ', 'hood', 'nightlife', 'dating', 'ears', 'districts', 'businesses', 'empire', 'towns'] as const;
export function phoneClone(s: GameState): GameState {
  const c = cloneState(s) as unknown as Record<string, unknown>;
  const src = s as unknown as Record<string, unknown>;
  for (const k of UNTOUCHED) if (k in src) c[k] = src[k];
  return c as unknown as GameState;
}

export function roll(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(clamp(v, 0.02, 0.98) * 100) / 100;

/* ------------------------------------------------------------------ */
/* The lines and the wire                                              */
/* ------------------------------------------------------------------ */

/** Which line rings at this hour: the house at night, the club by day. */
export function lineAt(h: number): Line {
  return h >= 20 || h < 8 ? 'home' : 'club';
}

/** The club's line is the back-room line when the headquarters is a social club. */
export function backRoom(s: GameState): boolean {
  return (s.econ?.hq.kind ?? 'social') === 'social';
}

export const LINE_LABEL: Record<Line, string> = { home: 'the house phone', club: 'the club\'s back-room line', pay: 'a pay phone' };

/** The chance a sentence of business lands on tape, if the line is tapped. */
export function tapeRisk(s: GameState, line: Line, code: boolean): number {
  if (line === 'pay') return code ? 0.04 : 0.1;
  let r = code ? 0.2 : 0.6;
  if (line === 'club' && backRoom(s)) r *= 0.5;
  return r;
}

/** What the boss can guess about a tap: the clicks on the line, the federal heat, the FBI's campaign. */
export function tapGuess(s: GameState): number {
  if (s.phone?.tap?.clicks) return 0.7;
  const fed = s.threats?.fed.stage ?? 0;
  return clamp(0.04 + s.heat.federal / 200 + (fed >= 2 ? 0.15 : 0) + (s.heat.local >= 40 ? 0.08 : 0), 0, 0.5);
}

/** Is this line tapped? (A pay phone never is.) */
export function tapped(s: GameState, line: Line): boolean {
  return !!s.phone?.tap && line !== 'pay';
}

/** "Off the tape" odds the card shows for business on this line. */
export function offTape(s: GameState, line: Line, code: boolean): number {
  return 1 - tapGuess(s) * tapeRisk(s, line, code);
}

/** The weekly rumor: a tapped line clicks (the boss may notice). Mutates. */
export function phoneWeek(s: GameState): void {
  const P = s.phone;
  if (!P) return;
  if (P.tap && !P.tap.clicks && roll(`${s.seed}|${s.week}|clicks`) < 0.35) P.tap.clicks = 1;
  // The county's tap comes out after a season; the FBI's stays until somebody finds it.
  if (P.tap?.by === 'county' && s.week - P.tap.since >= 12) delete P.tap;
  for (const k of Object.keys(P.stops)) if (Number(k) < fortnight(s.week) - 2) delete P.stops[k];
  for (const k of Object.keys(P.talked)) if (P.talked[k] < s.week - 1) delete P.talked[k];
  P.rung = P.rung.filter((x) => Number(x.split(':')[0]) >= s.week - 2);
}

/** A sweep of the lines (econ.ts 'sweep', the phone company man): finds the tap with `p`. Mutates; returns the line it found or ''. */
export function phoneSweep(s: GameState, p: number, key: string): string {
  const P = s.phone;
  if (!P?.tap) return '';
  if (roll(`${s.seed}|${s.week}|sweep|${key}`) >= p) return '';
  const by = P.tap.by;
  const weeks = s.week - P.tap.since;
  delete P.tap;
  P.stats.found++;
  const text = `The phone company man found a tap on your line: ${by === 'fbi' ? 'a federal wire' : 'the county\'s'}, in for ${weeks} week${weeks === 1 ? '' : 's'}.`;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'heat' });
  return text;
}

/* ------------------------------------------------------------------ */
/* Who calls                                                          */
/* ------------------------------------------------------------------ */


function pickHour(s: GameState, key: string, hs: readonly number[]): number {
  return hs[Math.floor(roll(`${s.seed}|${key}|h`) * hs.length) % hs.length];
}

function rivalLeader(s: GameState, id: string): Character | undefined {
  const r = s.rivals.find((x) => x.id === id);
  const c = r ? s.characters[r.leaderId] : undefined;
  return c?.alive ? c : undefined;
}

function tipCaller(s: GameState, t: Tip): Pick<CallPayload, 'who' | 'name' | 'role'> {
  return { ...(s.characters[t.sourceId] ? { who: t.sourceId } : {}), name: t.sourceName, role: t.sourceRole };
}

/** The new callers who could ring today (each with a weight), read off the world. */
function candidates(s: GameState, P: PhoneState): { key: string; w: number; p: CallPayload; hours: number[] }[] {
  const out: { key: string; w: number; p: CallPayload; hours: number[] }[] = [];
  const cool = (key: string, weeks: number) => (P.last[key] ?? -99) > s.week - weeks;
  // The goomar: when will she see him?
  for (const g of activeGoomars(s)) {
    const c = s.characters[g.id];
    if (!c?.alive || cool(`g:${g.id}`, 5)) continue;
    out.push({ key: `g:${g.id}`, w: 3, p: { k: 'goomar', who: c.id, name: displayName(c), role: 'Your goomar' }, hours: [13, 15, 21, 22] });
  }
  // The wife: he is late again.
  const wife = wifeOf(s);
  if (wife && !cool('wife', 4) && ((s.hours?.late ?? 0) > 0 || (s.hours?.missed ?? 0) > 0 || activeGoomars(s).length > 0)) {
    out.push({ key: 'wife', w: 2, p: { k: 'wife', who: wife.id, name: displayName(wife), role: 'Your wife' }, hours: [19, 20, 21, 22] });
  }
  // Philadelphia: the island is in the papers.
  const philly = s.rivals.find((r) => r.id === 'philly');
  const pl = philly ? rivalLeader(s, 'philly') : undefined;
  if (pl && s.heat.family >= 35 && !cool('philly', 6)) out.push({ key: 'philly', w: 2 + s.heat.family / 30, p: { k: 'philly', who: pl.id, name: displayName(pl), role: 'Philadelphia', rival: 'philly', ...(s.heat.family >= 60 ? { imp: 1 as const } : {}) }, hours: [10, 11, 14] });
  // A rival boss proposing a sit-down: at war, or cool enough to talk.
  for (const r of s.rivals) {
    if (r.kind !== 'mob' || cool('rival', 5) || cool(`rival:${r.id}`, 10)) continue;
    const c = rivalLeader(s, r.id);
    if (!c) continue;
    const o = opinion(s, c.id, s.playerId);
    if (!(r.war || r.feud || (o > -40 && o < 25 && roll(`${s.seed}|${s.week}|rv|${r.id}`) < 0.2))) continue;
    out.push({ key: `rival:${r.id}`, w: r.war ? 2 : 0.8, p: { k: 'rival', who: c.id, name: displayName(c), role: `Boss of ${r.name}`, rival: r.id, ...(r.war || r.feud ? { imp: 1 as const } : {}) }, hours: [11, 12, 16] });
  }
  // An anonymous voice at 2 a.m.: somebody is planning something.
  const plan = (s.threats?.threats ?? []).find((t) => t.kind === 'hit' && t.targetId === s.playerId && !t.schemeId && t.due >= s.week);
  const feud = s.rivals.some((r) => r.feud || r.war);
  if ((plan || feud) && !cool('anon', 6)) out.push({ key: 'anon', w: plan ? 2.5 : 1, p: { k: 'anon', name: 'A voice you don\'t know', role: 'No name', once: 1, imp: 1 }, hours: [2] });
  // A reporter: the island is in the paper.
  if ((s.heat.local >= 30 || (s.action?.stats.extras ?? 0) > 0 && roll(`${s.seed}|${s.week}|rep`) < 0.3) && !cool('reporter', 5)) {
    out.push({ key: 'reporter', w: 1, p: { k: 'reporter', name: 'A reporter from the Leader', role: 'The paper', once: 1 }, hours: [10, 15, 17] });
  }
  // A businessman who wants protection: a place nobody runs, in a district that is yours.
  const mine = new Set(s.districts.filter((d) => d.capoId && s.characters[d.capoId]?.faction === 'player').map((d) => d.id));
  const free = s.businesses.filter((b) => b.owner === 'none' && mine.has(b.districtId));
  if (free.length && !cool('biz', 4)) {
    const b = free[Math.floor(roll(`${s.seed}|${s.week}|biz`) * free.length) % free.length];
    out.push({ key: 'biz', w: 1.2, p: { k: 'biz', name: `The owner of ${b.name}`, role: 'A businessman', biz: b.id }, hours: [9, 11, 16] });
  }
  // A rat who wants it said on the phone.
  const rat = crew(s).find((c) => c.informantFor === 'law' && isFree(s, c));
  if (rat && !cool('rat', 5)) out.push({ key: 'rat', w: 2, p: { k: 'rat', who: rat.id, name: displayName(rat), role: rat.rank === 'capo' ? 'Capo' : rat.rank === 'soldier' ? 'Soldier' : 'One of yours' }, hours: [21, 22, 23] });
  return out.filter((x) => !x.p.who || x.p.who !== s.playerId);
}

/** No new callers before this week (the first weeks are for learning the island). */
export const PHONE_GRACE = 3;
/** The chance a new caller rings on a given day (Tuesday … Saturday). */
export const CALL_DAY_ODDS = 0.25;
/** New important calls that may stop the clock in a fortnight (the calls that replaced a popup are not counted). */
export const NEW_STOPS_WEEK = 1;
const fortnight = (w: number) => Math.floor(w / 2);

/**
 * The morning turns (daily.ts advanceDay, after the threats): put today's calls on the clock.
 * Mutates the day's working copy. `busy`: something else stops the clock today (a strike, the storm).
 */
export function phoneDay(s: GameState): GameState {
  if (s.gameOver) return s;
  const d = today(s);
  if (d < 1) return s;
  const abs = s.week * 7 + d;
  // Missed calls nobody returned: the caller remembers (opinions move: a real copy of the state).
  const gone = (s.phone?.missed ?? []).filter((m) => m.until < abs);
  const base = gone.length ? phoneClone(s) : s;
  const x: GameState = { ...base, phone: structuredClone(s.phone) ?? undefined, threats: s.threats ? { ...s.threats, tips: s.threats.tips.map((t) => ({ ...t })) } : s.threats, action: structuredClone(s.action) ?? undefined };
  const P = ensurePhone(x);
  if (gone.length) {
    const ctx = newCtx(x);
    for (const m of gone) {
      const eff = rememberEffects(x, m.p);
      if (eff.length) applyEffects(ctx, eff, { label: `${m.p.name}: you never called back`, because: 'never called back', category: 'event' });
    }
    P.missed = P.missed.filter((m) => m.until >= abs);
  }
  // 1. An urgent meeting coming out today rings as a call (it was a popup).
  for (const t of x.threats?.tips ?? []) {
    if (t.seen || t.status !== 'waiting' || !tipOut(x, t) || P.rung.includes(`${x.week}:${t.id}`)) continue;
    t.seen = true;
    P.rung.push(`${x.week}:${t.id}`);
    const soon = t.dueDay !== undefined && t.deadline <= x.week && t.dueDay - d <= 1;
    const h = soon ? 2 : pickHour(x, t.id, t.sourceKind === 'cop' || t.sourceKind === 'official' ? [22, 23, 0, 1] : [9, 11, 21, 22]);
    scheduleInto(x, { kind: 'call', day: d, hour: h, payload: { k: 'tip', tip: t.id, ...tipCaller(x, t), imp: 1, ...(t.sourceKind === 'cop' || t.sourceKind === 'official' ? { once: 1 } : {}) } });
  }
  // 2. A capo's urgent problem this morning rings at 7 a.m. (it was a morning stop).
  const u = urgentOn(x, d, daysOf(x).answers);
  if (u && !P.rung.includes(`${x.week}:${u.key}`)) {
    P.rung.push(`${x.week}:${u.key}`);
    const k = x.characters[u.capoId];
    if (k) scheduleInto(x, { kind: 'call', day: d, hour: 7, payload: { k: 'capo', who: k.id, name: displayName(k), role: u.title, key: u.key, kw: x.week, imp: 1 } });
  }
  // 3. Somebody else calls (at most one a day).
  if (x.week >= PHONE_GRACE && d <= 5 && roll(`${x.seed}|${x.week}|${d}|ring`) < CALL_DAY_ODDS) {
    const cs = candidates(x, P);
    const tot = cs.reduce((a, c) => a + c.w, 0);
    if (tot > 0) {
      let r = roll(`${x.seed}|${x.week}|${d}|who`) * tot;
      const c = cs.find((y) => (r -= y.w) < 0) ?? cs[cs.length - 1];
      P.last[c.key] = x.week;
      if (c.key.startsWith('rival:')) P.last.rival = x.week;
      scheduleInto(x, { kind: 'call', day: d, hour: pickHour(x, `${x.week}|${d}|${c.key}`, c.hours), payload: { ...c.p, nw: 1 } });
    }
  }
  return x;
}

/** What the caller holds against him when a call is never returned. */
function rememberEffects(s: GameState, p: CallPayload): Effect[] {
  const op = (amount: number, reason: string): Effect[] => (p.who && s.characters[p.who]?.alive ? [{ type: 'opinion', from: p.who, to: s.playerId, amount, reason, label: reason }] : []);
  switch (p.k) {
    case 'capo': return op(-2, 'The boss never called me back');
    case 'goomar': return op(-2, 'He never called me back');
    case 'wife': return op(-1, 'He never called back');
    case 'rival': return [...op(-2, 'He would not take my call'), ...(p.rival ? [{ type: 'rivalOpinion', rival: p.rival as RivalId, amount: -1, reason: 'He would not take the call' } as Effect] : [])];
    case 'philly': return [{ type: 'heat', bar: 'family', amount: 3, label: 'Philadelphia does not call twice' }];
    case 'tip': return op(-1, 'He never called me back');
    default: return [];
  }
}

/* ------------------------------------------------------------------ */
/* The exchange                                                        */
/* ------------------------------------------------------------------ */

interface Opt {
  id: string;
  label: string;
  hint: string;
  /** The exchange's own odds (1: it just happens). */
  p: number;
  /** Business on the line: the wire can hear it. */
  biz?: boolean;
  code?: boolean;
  blocked?: string;
  cost?: Effect[];
  ok?: Effect[];
  bad?: Effect[];
  okText: string;
  badText?: string;
  /** Extra state work after the roll (mutates the working copy). */
  then?: (s: GameState, ok: boolean, ctx: Ctx) => string | void;
}

const opEff = (s: GameState, who: string | undefined, amount: number, reason: string): Effect[] => (who && s.characters[who]?.alive ? [{ type: 'opinion', from: who, to: s.playerId, amount, reason, label: reason }] : []);

function seatTaker(s: GameState): Character | undefined {
  return seatHolder(s, 'consigliere') ?? seatHolder(s, 'underboss');
}

/** The options for a call (the same whether it rings now or he calls back). */
function callOpts(s: GameState, p: CallPayload, line: Line): Opt[] | undefined {
  const boss = player(s);
  const who = p.who ? s.characters[p.who] : undefined;
  const nm = who?.firstName ?? p.name;
  const once = !!p.once;
  const ring: Opt = { id: 'ring', label: 'Let it ring', hint: once ? 'He will not call twice' : `${nm} remembers if you don't call back by tomorrow night`, p: 1, okText: `${nm === p.name ? p.name : nm} called. Nobody picked up.${once ? ' He will not call again.' : ` Call back by tomorrow night, or ${nm} remembers.`}` };
  const taker = seatTaker(s);
  const wife = wifeOf(s);
  const msgBy = line === 'home' ? (wife ? wife.firstName : undefined) : taker ? taker.firstName : 'the girl at the club';
  switch (p.k) {
    case 'tip': {
      const t = s.threats?.tips.find((x) => x.id === p.tip);
      if (!t || t.status !== 'waiting') return undefined;
      return [
        { id: 'straight', label: 'Pick up: let him say it', hint: 'You hear it all, now', p: 1, biz: true, okText: `${nm} told you what he heard.`, then: (x) => heard(x, t.id, 'boss') },
        { id: 'code', label: 'Pick up: talk around it', hint: 'Code words: 75% you follow him', p: 0.75, biz: true, code: true, okText: `${nm} said it the way you say things on the phone, and you got it.`, badText: `${nm} talked around it so carefully you lost him. He still wants to see you.`, then: (x, ok) => (ok ? heard(x, t.id, 'boss') : undefined) },
        { id: 'msg', label: taker ? `Have ${taker.firstName} take it` : 'Have someone take it', hint: taker ? `${taker.firstName} hears him out and tells you what he makes of it` : 'Nobody you trust to hear it', p: 1, blocked: taker ? undefined : 'No underboss or consigliere', okText: `${taker?.firstName ?? 'Your man'} took the call.`, then: (x) => heard(x, t.id, taker && seatHolder(x, 'consigliere')?.id === taker.id ? 'consigliere' : 'underboss') },
        { ...ring, hint: once ? 'A cop on the pad calls once. The warning stays on your Desk.' : 'He remembers. The warning stays on your Desk.' },
      ];
    }
    case 'capo': {
      if (p.kw !== s.week) return undefined;
      const c = dayCheckIns(s, Number(String(p.key).split(':')[0])).find((y) => y.key === p.key);
      if (!c?.problem || daysOf(s).answers[c.key]) return undefined;
      return [
        ...c.problem.answers.slice(0, 3).map((a): Opt => ({ id: `a:${a.id}`, label: `Tell him: ${a.label}`, hint: a.hint, p: 1, biz: true, okText: `You told ${nm}: ${a.label.toLowerCase()}.`, then: (x) => { const y = answerCheckIn(x, c.key, a.id); x.days = y.days; } })),
        { id: 'msg', label: 'Tell him to bring it to the club', hint: 'It waits for the morning meeting. Nothing said on the phone.', p: 1, okText: `${nm} will bring it to the club.` },
        ring,
      ];
    }
    case 'goomar': {
      if (!who?.alive) return undefined;
      const sweet = r2(0.55 + boss.attributes.diplomacy / 250 + opinion(s, who.id, s.playerId) / 300);
      const wifeHears = line === 'home' && !!wife;
      return [
        { id: 'sweet', label: 'Sweet-talk her', hint: `She feels better (+6) · if not, she hangs up on you`, p: sweet, ok: opEff(s, who.id, 6, 'He called me sweet on the phone'), bad: opEff(s, who.id, -2, 'He sounded like he had somewhere to be'), okText: `${nm} laughed at the end. She'll wait.`, badText: `${nm} heard the clock in your voice and hung up.` },
        { id: 'promise', label: 'Promise her the weekend', hint: 'She is happy now (+10); she will hold you to it', p: 1, ok: opEff(s, who.id, 10, 'He promised me the weekend'), okText: `You promised ${nm} the weekend.`, then: (x) => { x.flags[`goomar_promise_${who.id}`] = x.week; } },
        { id: 'msg', label: wifeHears ? `Let ${wife!.firstName} get it` : 'Have the girl at the club take it', hint: wifeHears ? `Your wife answers a woman's call: 55% she thinks nothing of it` : 'She hates leaving messages (−1)', p: wifeHears ? 0.55 : 1, ok: wifeHears ? [] : opEff(s, who.id, -1, 'He had a girl take my message'), bad: wifeHears ? [...opEff(s, wife!.id, -8, 'A woman called the house for him'), { type: 'familyOpinion', amount: -2, reason: 'A woman called the house', label: 'A woman called the house' } as Effect] : [], okText: wifeHears ? `${wife!.firstName} took a message from "a friend." She thought nothing of it.` : 'The girl at the club took a message.', badText: `${wife?.firstName ?? 'Your wife'} took a message from a woman who would not give her name. She has not stopped thinking about it.` },
        ring,
      ];
    }
    case 'wife': {
      if (!who?.alive) return undefined;
      const lie = r2(0.6 + opinion(s, who.id, s.playerId) / 250);
      return [
        { id: 'home', label: 'Tell her you\'re on your way home', hint: 'Two hours of your evening · she is glad (+6)', p: 1, ok: [...opEff(s, who.id, 6, 'He came home when I called'), { type: 'familyOpinion', amount: 1, reason: 'He came home', label: 'He came home' } as Effect], okText: `You went home. ${nm} kept a plate warm.`, then: (x) => { const t = spendTime(x, { kind: 'phone', op: { op: 'home' } } as unknown as PlayerAction); x.hours = t.state.hours; } },
        { id: 'late', label: 'Tell her you\'re working late', hint: 'She believes you (+2) · if not, she knows the voice (−4)', p: lie, ok: opEff(s, who.id, 2, 'He called to say he was working'), bad: opEff(s, who.id, -4, 'He lied to me on the phone'), okText: `${nm} sighed and said to drive carefully.`, badText: `${nm} was quiet for too long, then said goodnight.` },
        { id: 'msg', label: 'Have someone say you\'re in a meeting', hint: 'She hears it from a stranger (−2)', p: 1, ok: opEff(s, who.id, -2, 'He had somebody tell me he was in a meeting'), okText: `Somebody told ${nm} you were in a meeting.` },
        ring,
      ];
    }
    case 'philly': {
      const rv = p.rival as RivalId | undefined;
      const push = r2(0.3 + s.respect / 300);
      return [
        { id: 'yes', label: 'Yes, sir. It will be quiet.', hint: 'Family heat −5 · respect −1 (you bowed)', p: 1, biz: true, ok: [{ type: 'heat', bar: 'family', amount: -5, label: 'You told Philadelphia it would be quiet' }, { type: 'respect', amount: -1, label: 'You said yes, sir, on the phone' }], okText: 'Philadelphia said good, and hung up.' },
        { id: 'come', label: 'Say you\'ll come down and explain', hint: 'In code: 80% it satisfies them (family heat −3); if not, +2', p: 0.8, biz: true, code: true, ok: [{ type: 'heat', bar: 'family', amount: -3, label: 'Philadelphia will hear it in person' }], bad: [{ type: 'heat', bar: 'family', amount: 2, label: 'Philadelphia wanted an answer, not a visit' }], okText: 'They will hear it in person. For now that is enough.', badText: 'They wanted an answer, not a promise of a drive.' },
        { id: 'push', label: 'Tell them how it is down here', hint: `Respect +2, family heat −1 · if not: family heat +6`, p: push, biz: true, ok: [{ type: 'respect', amount: 2, label: 'You told Philadelphia how it is' }, { type: 'heat', bar: 'family', amount: -1, label: 'Philadelphia listened' }], bad: [{ type: 'heat', bar: 'family', amount: 6, label: 'You talked back to Philadelphia' }, ...(rv ? [{ type: 'rivalOpinion', rival: rv, amount: -6, reason: 'Talked back on the phone' } as Effect] : [])], okText: 'There was a silence, then a laugh. They let you have it.', badText: 'The silence on the line was the worst thing you heard all year.' },
        { id: 'msg', label: 'Have someone take a message', hint: 'Philadelphia does not leave messages (family heat +2)', p: 1, ok: [{ type: 'heat', bar: 'family', amount: 2, label: 'Philadelphia had to leave a message' }], okText: 'Philadelphia left a message. They did not like leaving it.' },
        { ...ring, hint: 'Philadelphia does not call twice (family heat +3 if you don\'t call back)' },
      ];
    }
    case 'rival': {
      const rv = p.rival as RivalId;
      const r = s.rivals.find((y) => y.id === rv);
      if (!r || !who?.alive) return undefined;
      const club = r2(0.3 + s.respect / 400 - (r.war ? 0.1 : 0));
      return [
        { id: 'church', label: 'Agree: the church, neutral ground', hint: 'A sit-down in two days at noon', p: 1, okText: `You will sit down with ${nm} at the church.`, then: (x) => { setMeet(x, who.id, 'church', 'sitdown', 2, 12); } },
        { id: 'club', label: 'Your club, or nothing', hint: 'On your ground: if he takes it, respect +1', p: club, ok: [{ type: 'respect', amount: 1, label: `${nm} agreed to come to you` }], bad: [{ type: 'rivalOpinion', rival: rv, amount: -4, reason: 'Wanted me to come to him' }], okText: `${nm} agreed to come to your club.`, badText: `${nm} hung up.`, then: (x, ok) => { if (ok) setMeet(x, who.id, 'club', 'sitdown', 2, 15); } },
        { id: 'no', label: 'There is nothing to talk about', hint: 'His outfit −5: they will take it as an answer', p: 1, ok: [{ type: 'rivalOpinion', rival: rv, amount: -5, reason: 'Turned down a sit-down' }], okText: `You told ${nm} there was nothing to talk about.` },
        { id: 'msg', label: 'Have someone take a message', hint: 'You can call him back tomorrow', p: 1, okText: `${nm} left a message: he wants to sit down.`, then: (x) => { keepMissed(x, p, 'msg'); } },
        ring,
      ];
    }
    case 'anon': {
      const plan = (s.threats?.threats ?? []).find((t) => t.kind === 'hit' && t.targetId === s.playerId && !t.schemeId && t.due >= s.week);
      const listen = r2(0.55 + boss.attributes.intrigue / 300);
      const back = r2(0.45 + boss.attributes.force / 300);
      return [
        { id: 'listen', label: 'Listen', hint: `${Math.round(listen * 100)}% he gives something away`, p: listen, okText: plan ? 'He said too much: a night, a car, a name you know. You are ready for it.' : 'Breathing, a laugh, a name you don\'t know. Somebody wants you scared.', badText: 'Breathing, then the line went dead.', then: (x, ok) => { if (ok && plan) { const t = x.threats?.threats.find((y) => y.id === plan.id); if (t) t.blunt = Math.min(1, t.blunt + 0.2); } } },
        { id: 'back', label: 'Tell him where he can go', hint: 'Respect +1 if your voice holds', p: back, ok: [{ type: 'respect', amount: 1, label: 'You did not scare on the phone' }], okText: 'Your voice held. He hung up first.', badText: 'He laughed and hung up.' },
        { id: 'msg', label: wife ? `Let ${wife.firstName} get it` : 'Let it go to the house', hint: wife ? 'She hears it (her −2)' : 'Nobody is there', p: 1, ok: wife ? opEff(s, wife.id, -2, 'A man called the house at 2 a.m.') : [], okText: wife ? `${wife.firstName} answered. She did not sleep after.` : 'Nobody answered.' },
        { ...ring, label: 'Let it ring' },
      ];
    }
    case 'reporter': {
      const rivals = s.rivals.filter((r) => r.kind === 'mob');
      const target = rivals[Math.floor(roll(`${s.seed}|${s.week}|feed`) * Math.max(1, rivals.length)) % Math.max(1, rivals.length)];
      const feed = r2(0.5 + boss.attributes.intrigue / 400);
      const lean = r2(0.45 + boss.attributes.force / 400);
      return [
        { id: 'nocomment', label: 'No comment', hint: 'Nothing happens', p: 1, okText: '"No comment." He wrote it down.' },
        ...(target ? [{ id: 'feed', label: `Give him a story about the ${target.shortName}`, hint: `Their heat +6, yours −2 · if not, your name is in it too (local heat +3)`, p: feed, ok: [{ type: 'rivalResource', rival: target.id, exposure: 6, label: 'A story about them in the Leader' } as Effect, { type: 'heat', bar: 'local', amount: -2, label: 'The paper looked the other way' }], bad: [{ type: 'heat', bar: 'local', amount: 3, label: 'The reporter printed your name too' }], okText: `The Leader ran it: the ${target.shortName}.`, badText: 'He ran it, with your name in the third paragraph.' } as Opt] : []),
        { id: 'lean', label: 'Lean on him', hint: 'Local heat −1 · if he does not scare: +4 and a story', p: lean, ok: [{ type: 'heat', bar: 'local', amount: -1, label: 'A reporter dropped a story' }], bad: [{ type: 'heat', bar: 'local', amount: 4, label: 'REPORTER SAYS HE WAS THREATENED' }], okText: 'He dropped it.', badText: 'He put the call in the paper.' },
        { id: 'msg', label: 'Have someone take a message', hint: 'He writes "could not be reached"', p: 1, okText: 'You could not be reached for comment.' },
        ring,
      ];
    }
    case 'biz': {
      const b = s.businesses.find((y) => y.id === p.biz);
      if (!b || b.owner !== 'none') return undefined;
      const env = Math.max(300, Math.round((b.weeklyBase * 0.6) / 50) * 50);
      return [
        { id: 'price', label: 'Name a price on the phone', hint: `+${fmtMoney(env)} the first month · respect +1`, p: 0.8, biz: true, ok: [{ type: 'money', amount: env, category: 'event', label: `${b.name}: the first month of protection` }, { type: 'respect', amount: 1, label: `${b.name} came to you` }], okText: `${b.name} pays the first month: ${fmtMoney(env)}.`, badText: 'He said he would think it over. He is still thinking.' },
        { id: 'club', label: 'Tell him to come by the club', hint: `Nothing on the phone · 65% he comes (+${fmtMoney(env)})`, p: 0.65, ok: [{ type: 'money', amount: env, category: 'event', label: `${b.name}: the first month of protection` }, { type: 'respect', amount: 1, label: `${b.name} came to you` }], okText: `He came by with an envelope: ${fmtMoney(env)}.`, badText: 'He lost his nerve on the way over.' },
        { id: 'msg', label: msgBy ? `Have ${msgBy} take a message` : 'Have someone take a message', hint: 'You can call him back tomorrow', p: 1, okText: 'He left a number.', then: (x) => { keepMissed(x, p, 'msg'); } },
        ring,
      ];
    }
    case 'rat': {
      if (!who?.alive) return undefined;
      const read = r2(0.2 + boss.attributes.intrigue / 300);
      return [
        { id: 'straight', label: 'Go over it with him', hint: 'He wants it on the phone, now', p: 1, biz: true, okText: `You went over it with ${nm}.`, then: (x) => { const b = x.characters[x.playerId]; b.evidence = Math.min(100, (b.evidence ?? 0) + 6); } },
        { id: 'not', label: 'Not on the phone. Come see me.', hint: `${Math.round(read * 100)}% you hear what is wrong with this call`, p: read, okText: `${nm} pushed too hard to have it said on the phone. Nobody pushes for that. You know what he is.`, badText: `${nm} said fine, tomorrow. Nothing in it.`, then: (x, ok) => { if (ok) addSecret(x, x.characters[who.id], 'informant', ['player']); } },
        { id: 'msg', label: 'Have someone take a message', hint: 'Nothing said', p: 1, okText: `${nm} left a message: call him.` },
        ring,
      ];
    }
  }
  return undefined;
}

/** The tip is heard (on the phone, or by the man who took the message). */
function heard(x: GameState, tipId: string, via: 'boss' | 'underboss' | 'consigliere'): void {
  const y = meetTip(x, tipId, via, true);
  x.threats = y.threats;
}

/** A message that stays in the missed list (call him back). */
function keepMissed(x: GameState, p: CallPayload, _why: string): void {
  const P = ensurePhone(x);
  const d = today(x);
  P.missed.push({ id: `m${++P.n}`, p, w: x.week, d, h: 12, until: x.week * 7 + d + 1 });
  if (P.missed.length > MISSED_MAX) P.missed.splice(0, P.missed.length - MISSED_MAX);
}

/** Put a meet on the clock (phoneMeet.ts registers its delivery). Mutates. `inDays`: from today. */
export function setMeet(x: GameState, who: string, place: string, purpose: string, inDays: number, hour: number): string {
  const d0 = today(x) + inDays;
  const w = x.week + (d0 > 6 ? 1 : 0);
  const d = d0 > 6 ? Math.max(1, d0 - 7) : d0;
  return scheduleInto(x, { kind: 'meet', day: d, hour, w, payload: { who, place, purpose } });
}

/* ------------------------------------------------------------------ */
/* The card and the roll                                               */
/* ------------------------------------------------------------------ */

const KIND_CAT: Record<CallerKind, JCat> = { tip: 'law', capo: 'crew', goomar: 'romance', wife: 'family', philly: 'rivals', rival: 'rivals', anon: 'rivals', reporter: 'paper', biz: 'rackets', rat: 'law' };

function openingLine(s: GameState, p: CallPayload, line: Line): string {
  const nm = p.who ? s.characters[p.who]?.firstName ?? p.name : p.name;
  const on = `on ${LINE_LABEL[line]}`;
  switch (p.k) {
    case 'tip': {
      const t = s.threats?.tips.find((x) => x.id === p.tip);
      return `${p.name} (${p.role.toLowerCase()}) ${on}. He won't say much: "${t?.hint ?? 'We need to talk.'}" He wants to tell you more.`;
    }
    case 'capo': {
      const c = dayCheckIns(s, Number(String(p.key).split(':')[0])).find((y) => y.key === p.key);
      return `${nm} calls the house before breakfast. It can't wait for the club. ${c?.problem?.text ?? ''}`;
    }
    case 'goomar': return `${nm} ${on}. She wants to know when she is going to see you. She has been looking at the clock.`;
    case 'wife': return `${nm} ${on}. Dinner was at six. She wants to know where you are, and the kids are asking.`;
    case 'philly': return `Philadelphia ${on}. ${p.name} does not say hello. The island has been in the papers, and they want to know why.`;
    case 'rival': return `${p.name}, ${p.role.toLowerCase()}, ${on}. Polite. He thinks the two of you should sit down and talk before something happens nobody wants.`;
    case 'anon': return `The phone at the house, in the middle of the night. Breathing, then a voice you don't know says your name and your wife's.`;
    case 'reporter': return `A reporter from the Leader ${on}. He is writing about the island and wants a comment from a "local businessman."`;
    case 'biz': return `${p.name} ${on}. He has heard who to talk to. He wants nobody bothering his place, and he will pay for it.`;
    case 'rat': return `${nm} ${on}. He wants to go over "that thing" from last week, all of it, right now, on the phone.`;
  }
}

const TITLES: Record<CallerKind, (p: CallPayload) => string> = {
  tip: (p) => `${p.name} is on the phone`, capo: (p) => `${p.name} calls the house`, goomar: (p) => `${p.name} is calling`, wife: () => 'Your wife is calling', philly: () => 'Philadelphia is on the line',
  rival: (p) => `${p.name} wants a sit-down`, anon: () => 'The phone at 2 a.m.', reporter: () => 'A reporter is calling', biz: (p) => `${p.name} is calling`, rat: (p) => `${p.name} is calling`,
};

function oddsOf(s: GameState, o: Opt, line: Line): number {
  return Math.round(o.p * (o.biz ? offTape(s, line, !!o.code) : 1) * 100) / 100;
}

function hintOf(s: GameState, o: Opt, line: Line): string {
  if (!o.biz) return o.hint;
  const r = Math.round(tapeRisk(s, line, !!o.code) * 100);
  return `${o.hint} · business on ${LINE_LABEL[line]}: if it's tapped, ${r}% it's on tape`;
}

/** The card for a call (ringing now, or a call back from the missed list). */
export function callView(s: GameState, id: string, p: CallPayload, d: number, h: number, back = false): MomentView | undefined {
  const line = back ? 'club' : p.line ?? lineAt(h);
  const opts = callOpts(s, p, line);
  if (!opts) return undefined;
  const list = back ? opts.filter((o) => o.id !== 'ring' && o.id !== 'msg') : opts;
  return {
    id, title: back ? `Call back: ${p.name}` : TITLES[p.k](p),
    text: back ? `You call ${p.name} back from the club. ${openingLine(s, p, line).replace(/^[^.]*\. /, '')}` : openingLine(s, p, line),
    when: back ? `${DAY_NAMES[today(s)]}, now` : `${whenText(d, h)}${h === 2 ? ' · bad news' : ''}`,
    warned: false,
    options: list.map((o) => ({ id: o.id, label: o.label, hint: hintOf(s, o, line), odds: oddsOf(s, o, line), ...(o.blocked ? { blocked: o.blocked } : {}) })),
    def: back ? list[list.length - 1].id : 'ring',
  };
}

function nowResult(s: GameState, before: { money: number; respect: number; heat: GameState['heat'] }, title: string, who: string | undefined, odds: number, rv: number, ok: boolean, line: string, extra: string[]): NowResult {
  const changes: string[] = [];
  const sgn = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;
  const money = s.money + Math.round(s.tribute?.acct.personal ?? 0);
  if (money !== before.money) changes.push(`Money ${money > before.money ? '+' : '−'}$${Math.abs(money - before.money).toLocaleString('en-US')}`);
  if (s.respect !== before.respect) changes.push(`Respect ${sgn(s.respect - before.respect)}`);
  for (const k of ['local', 'family', 'federal'] as const) if (s.heat[k] !== before.heat[k]) changes.push(`${k[0].toUpperCase()}${k.slice(1)} heat ${sgn(s.heat[k] - before.heat[k])}`);
  // A sure thing (no odds to speak of) shows no roll.
  if (odds >= 0.995) return { ok: true, title, ...(who ? { who } : {}), tier: 'success', headline: 'Done', line: line.replace(/\.\.+/g, '.'), changes: [...changes, ...extra], leadsTo: [] };
  return { ok: true, title, ...(who ? { who } : {}), chance: odds, roll: Math.floor(rv * 100), tier: ok ? (rv < odds * 0.3 ? 'crit' : 'success') : 'fail', headline: `${Math.round(odds * 100)}% — ${ok ? 'it went your way' : 'it did not'}`, line: line.replace(/\.\.+/g, '.'), changes: [...changes, ...extra], leadsTo: [] };
}

/** Answer a call (or return one). Pure. */
export function answerCall(input: GameState, key: string, p: CallPayload, d: number, h: number, optId: string, back = false): { state: GameState; result: NowResult } {
  const fail = (error: string): { state: GameState; result: NowResult } => ({ state: input, result: { ok: false, error, title: 'The phone', tier: 'fail', headline: error, line: '', changes: [], leadsTo: [] } });
  const line: Line = back ? 'club' : p.line ?? lineAt(h);
  const opts = callOpts(input, p, line);
  if (!opts) return fail('The line is dead');
  let o = opts.find((x) => x.id === optId && !x.blocked) ?? opts.find((x) => x.id === 'ring')!;
  if (back && (o.id === 'ring' || o.id === 'msg')) o = opts.find((x) => x.id !== 'ring' && x.id !== 'msg' && !x.blocked) ?? o;
  const s = phoneClone(input);
  const P = ensurePhone(s);
  const ctx = newCtx(s);
  const before = { money: s.money + Math.round(s.tribute?.acct.personal ?? 0), respect: s.respect, heat: { ...s.heat } };
  const rv = roll(`${s.seed}|${key}|${o.id}|ex`);
  const ok = rv < o.p;
  const lines: string[] = [];
  if (o.cost?.length) applyEffects(ctx, o.cost, { label: o.label, because: o.label.toLowerCase(), category: 'event' });
  const eff = ok ? o.ok : o.bad;
  if (eff?.length) applyEffects(ctx, eff, { label: `${p.name}: ${o.label}`, because: o.label.toLowerCase(), category: 'event' });
  const more = o.then?.(s, ok, ctx);
  lines.push(ok ? o.okText : o.badText ?? o.okText);
  if (more) lines.push(more);
  // The wire: business on a tapped line.
  const extra: string[] = [];
  if (o.biz && (o.id !== 'code' || ok) && tapped(s, line)) {
    const tr = roll(`${s.seed}|${key}|${o.id}|tape`);
    if (tr < tapeRisk(s, line, !!o.code)) lines.push(onTape(s, ctx, p.who, !!o.code));
  }
  if (o.code) P.stats.code++;
  if (o.id === 'ring') {
    P.stats.rang++;
    if (p.who) P.snub[p.who] = (P.snub[p.who] ?? 0) + 1;
    if (!back) {
      P.missed.push({ id: `m${++P.n}`, p, w: s.week, d, h, until: s.week * 7 + Math.max(d, today(s)) + 1 });
      if (P.missed.length > MISSED_MAX) P.missed.splice(0, P.missed.length - MISSED_MAX);
    }
  } else if (o.id === 'msg') P.stats.msg++;
  else P.stats.picked++;
  if (!back) P.stats.in++; else P.stats.out++;
  const title = `${back ? 'You called back' : whenText(d, h)}: ${p.name}`;
  const text = `${o.label}${o.p < 1 ? ` (${Math.round(oddsOf(input, o, line) * 100)}%)` : ''}`;
  pushLog(P, { w: s.week, d: back ? today(s) : d, h: back ? 12 : h, dir: o.id === 'ring' && !back ? 'missed' : back ? 'out' : 'in', name: p.name, t: `${text}: ${lines[0]}` });
  journal(s, {
    d: back ? today(s) : d, tm: back ? undefined : hourText(h), c: KIND_CAT[p.k], t: `On the phone: ${p.name}`, r: [`${back ? 'You called back' : 'The phone rang'}. You chose: ${o.label}.`, ...lines, ...ctx.log].slice(0, 8),
    src: 'phone', mine: 1, ...(p.who ? { p: [p.who] } : {}), ...(p.biz ? { pl: [`b:${p.biz}`] } : {}),
  });
  return { state: s, result: nowResult(s, before, title, p.who && s.characters[p.who] ? displayName(s.characters[p.who]) : undefined, oddsOf(input, o, line), rv, ok, lines.join(' '), extra) };
}

/** Business on tape: evidence on the boss (and the man on the other end), heat by who holds the wire. Mutates. */
export function onTape(s: GameState, ctx: Ctx, other: string | undefined, code: boolean): string {
  const P = ensurePhone(s);
  const by = P.tap?.by ?? 'county';
  const amt = code ? 2 : 4;
  const eff: Effect[] = [{ type: 'evidence', charId: s.playerId, amount: amt }, { type: 'heat', bar: by === 'fbi' ? 'federal' : 'local', amount: code ? 1 : 3, label: by === 'fbi' ? 'The federal wire heard you' : 'The county wire heard you' }];
  if (other && s.characters[other]?.alive && s.characters[other].faction === 'player') eff.push({ type: 'evidence', charId: other, amount: Math.ceil(amt / 2) });
  applyEffects(ctx, eff, { label: 'On tape', because: 'talked business on a tapped line', category: 'heat' });
  P.stats.taped++;
  return code ? '(Somewhere, a tape was rolling. In code it will take them a while.)' : '(Somewhere, a tape was rolling.)';
}

/* ------------------------------------------------------------------ */
/* The delivery (schedule.ts kind 'call')                              */
/* ------------------------------------------------------------------ */

function payloadOf(it: ScheduledItem): CallPayload {
  return it.payload as unknown as CallPayload;
}

/** Stops this week by new important callers. */
function newStops(s: GameState): number {
  return s.phone?.stops[fortnight(s.week)] ?? 0;
}

registerDelivery({
  kind: 'call',
  moment: (s, it) => {
    const p = payloadOf(it);
    if (!p.imp) return false;
    // One stop a day: a threat striking, the storm or another call already holds the clock.
    if ((s.threats?.threats ?? []).some((t) => t.live)) return false;
    if (s.flags.storm_week === s.week && !s.flags.storm_landed && today(s) === s.flags.storm_day) return false;
    if (liveItems(s).length) return false;
    // A new caller (not a call that replaced a popup) stops the clock at most NEW_STOPS_WEEK times a week.
    if (p.nw && newStops(s) >= NEW_STOPS_WEEK) return false;
    if (p.nw && s.phone) s.phone.stops[fortnight(s.week)] = newStops(s) + 1;
    return true;
  },
  view: (s, it) => callView(s, it.id, payloadOf(it), it.d, it.h),
  answer: (s, it, opt) => answerCall(s, it.id, payloadOf(it), it.d, it.h, opt),
});

/* ------------------------------------------------------------------ */
/* The missed calls                                                    */
/* ------------------------------------------------------------------ */

export function missedCalls(s: GameState): MissedCall[] {
  const abs = s.week * 7 + today(s);
  return (s.phone?.missed ?? []).filter((m) => m.until >= abs);
}

/** The badge: missed calls not yet looked at, and calls ringing now. */
export function phoneBadge(s: GameState): number {
  return missedCalls(s).filter((m) => !m.seen).length;
}

export function markMissedSeen(s: GameState): GameState {
  if (!s.phone?.missed.some((m) => !m.seen)) return s;
  return { ...s, phone: { ...s.phone, missed: s.phone.missed.map((m) => ({ ...m, seen: 1 as const })) } };
}

/** Can this missed call be returned? */
export function canCallBack(s: GameState, m: MissedCall): string | undefined {
  if (m.p.once) return 'He will not call twice';
  if (!callOpts(s, m.p, 'club')) return 'It is over';
  return undefined;
}

/** The card for calling back. */
export function callBackView(s: GameState, id: string): MomentView | undefined {
  const m = missedCalls(s).find((x) => x.id === id);
  if (!m || canCallBack(s, m)) return undefined;
  return callView(s, `back:${id}`, m.p, m.d, m.h, true);
}

/** Call him back (a quarter hour of the boss's day). Pure. */
export function callBack(input: GameState, id: string, opt: string): { state: GameState; result: NowResult } {
  const m = missedCalls(input).find((x) => x.id === id);
  if (!m || canCallBack(input, m)) return { state: input, result: { ok: false, error: 'It is over', title: 'The phone', tier: 'fail', headline: 'It is over', line: '', changes: [], leadsTo: [] } };
  const t = spendTime(input, { kind: 'phone', op: { op: 'call' } } as unknown as PlayerAction);
  const r = answerCall(t.state, `back:${id}:${input.week}`, m.p, m.d, m.h, opt, true);
  if (!r.result.ok) return r;
  const P = r.state.phone!;
  P.missed = P.missed.filter((x) => x.id !== id);
  return r;
}

/** Calls ringing now (scheduled calls that stopped the clock). */
export function ringing(s: GameState): ScheduledItem[] {
  return liveItems(s).filter((x) => x.kind === 'call');
}

/** The scheduled calls still to come today (for the dev panel and tests). */
export function callsAhead(s: GameState): ScheduledItem[] {
  return scheduled(s).filter((x) => x.kind === 'call' && !x.live);
}

/** Tip ids the phone has carried (a call that rang), for the App: after a pick-up, the urgent meeting opens for the answer. */
export function tipOfMoment(s: GameState, momentId: string): string | undefined {
  if (!momentId.startsWith('sched:')) return undefined;
  const it = scheduled(s).find((x) => x.id === momentId.slice(6));
  const p = it ? payloadOf(it) : undefined;
  return p?.k === 'tip' ? p.tip : undefined;
}


/** The kicker over a moment's card when it is the phone or a meet (undefined: a strike, the storm). */
export function momentKicker(s: GameState, momentId: string): string | undefined {
  if (!momentId.startsWith('sched:')) return undefined;
  const it = scheduled(s).find((x) => x.id === momentId.slice(6));
  if (!it) return undefined;
  if (it.kind === 'meet') return 'The meet';
  if (it.kind !== 'call') return undefined;
  const p = payloadOf(it);
  return `The phone is ringing: ${LINE_LABEL[p.line ?? lineAt(it.h)]}`;
}

/** What the boss can tell about his line. */
export function lineStatus(s: GameState): string {
  if (s.phone?.tap?.clicks) return 'The line clicks when you pick up. Somebody may be listening.';
  const g = tapGuess(s);
  return g >= 0.3 ? 'With the federal heat on you, assume somebody is listening.' : g >= 0.12 ? 'Probably nobody is listening. Probably.' : 'The line sounds clean.';
}
