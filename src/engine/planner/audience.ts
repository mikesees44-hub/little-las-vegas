import { attr } from '../attrs';
import { officeVisitors, type OfficeUi, type VisitorKind } from '../bossOffice';
import { displayName, hasTrait, isFree } from '../characters';
import { holder } from '../council';
import { tieOf } from '../deeds/state';
import { pushAsk } from '../deeds/npc';
import type { NowResult } from '../deeds/now';
import { fmtMoney } from '../effects';
import { journal } from '../journal';
import { newCtx } from '../ledger';
import { remember } from '../minds/memory';
import { mindOf } from '../minds/state';
import { phoneClone } from '../phone';
import { applyDecision } from '../reactions/apply';
import { addOpinion, changeMeter, opinion } from '../relations';
import { inTheRanks } from '../rankView';
import { scheduleInto } from '../schedule';
import { ignoreTip, meetTip, urgentMeetings } from '../threats';
import { absDay, formatClock } from '../timeCost';
import { DAY_NAMES, today } from '../days';
import type { Character, Effect, GameState, RivalId } from '../types';
import { bookHours, nowHour, PLAN_HOURS, slotBlock } from './hours';
import { ensurePlanner, plannerOf, pushDone } from './state';

/**
 * REQUESTS FOR AN AUDIENCE (DONS_PLANNER.md §3). Everybody wants time with the Don and he has eighteen
 * hours a day, so the gatekeeper (the consigliere, else the underboss) lines them up. Nothing here is a
 * new visitor system: the requests ARE the existing items with a person in them (officeVisitors: the
 * decisions, the petitions, the capos' mornings, the sit-down items, the lawyer) and the urgent meetings
 * (threats.ts). This layer only ranks them and answers "who gets an hour".
 *
 * The rank is three readable parts (0-100 each):
 *  - CLOSENESS: blood, made rank, friendship (a tie), his opinion and the boss's, years of service;
 *  - DESPERATION: debts, a pinch (a court date, the evidence on him), a dying parent, a threat, an urgent matter;
 *  - MONEY: how much the ask is worth to the family.
 * Then the gatekeeper's own bias, shown, not hidden: he moves his friends up, buries his rivals, and a
 * man with money and trouble may slip him an envelope to get in.
 *
 * Giving a man an hour puts him in the datebook (a `plan` item on the scheduler, with the hours booked).
 * Turning him away lands through the reactions system (a named opinion modifier, a sulk, a man who takes
 * his idea to a rival), and a man turned away again and again escalates: a grudge, then something stupid.
 */

export const W_CLOSE = 0.4;
export const W_DESP = 0.35;
export const W_MONEY = 0.25;
export const BIAS_FRIEND = 12;
export const BIAS_RIVAL = -18;
export const BIAS_BRIBE = 15;

export type ReqKind = VisitorKind | 'warning';

export interface ReqPart { v: number; why: string[] }
export interface ReqBias { v: number; kind: 'friend' | 'rival' | 'bribe'; text: string; amount?: number }

export interface AudienceReq {
  key: string;
  kind: ReqKind;
  charId?: string;
  name: string;
  role: string;
  /** Why he is asking, one line. */
  why: string;
  urgent?: boolean;
  /** Where his matter lives (the decision, the morning, the sit-down item, the urgent meeting). */
  ref: { event?: string; day?: number; brief?: string; tip?: string };
  close: ReqPart;
  desp: ReqPart;
  money: ReqPart;
  /** The fair score (the three parts, weighted). */
  base: number;
  /** What the gatekeeper put him at. */
  score: number;
  bias: ReqBias[];
  /** Places moved by the gatekeeper (+ up, − down) against the fair order. */
  moved: number;
  /** Times turned away before. */
  refused: number;
  /** Already on the book (the scheduled item's id). */
  booked?: { id: string; w: number; d: number; h: number };
}

export interface Gatekeeper { id?: string; name: string; role: 'consigliere' | 'underboss' | 'none'; line: string }

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
function hroll(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const first = (c: Character | undefined) => (c ? (c.nickname ? `"${c.nickname}"` : c.firstName) : 'He');

/** Who keeps the door: the consigliere, else the underboss. */
export function gatekeeper(s: GameState): Gatekeeper {
  for (const role of ['consigliere', 'underboss'] as const) {
    const c = holder(s, role);
    if (c && isFree(s, c) && c.id !== s.playerId) {
      const greedy = hasTrait(c, 'Greedy') || attr(s, c, 'greed') >= 60;
      return { id: c.id, name: displayName(c), role, line: `${first(c)} keeps the door.${greedy ? ' He has been known to take an envelope.' : ''}` };
    }
  }
  return { name: 'Nobody', role: 'none', line: 'Nobody keeps the door: they line up in the order they came.' };
}

/* ------------------------------------------------------------------ */
/* The three parts                                                     */
/* ------------------------------------------------------------------ */

const RANK_CLOSE: Record<string, number> = { underboss: 24, consigliere: 24, capo: 18, soldier: 11, associate: 5 };

export function closeness(s: GameState, c: Character | undefined): ReqPart {
  if (!c) return { v: 10, why: ['A stranger to the house'] };
  const B = s.playerId;
  const why: string[] = [];
  let v = 0;
  const boss = s.characters[B];
  if (boss && (boss.spouseId === c.id || boss.childrenIds.includes(c.id) || c.childrenIds.includes(B))) { v += 40; why.push('Blood: his own family'); }
  else if (c.dynasty) { v += 30; why.push('Blood: the house'); }
  if (c.faction === 'player' && RANK_CLOSE[c.rank]) { v += RANK_CLOSE[c.rank]; why.push(`${c.rank[0].toUpperCase()}${c.rank.slice(1)}`); }
  else if (c.faction !== 'player' && s.rivals.some((r) => r.leaderId === c.id)) { v += 8; why.push('Head of another family'); }
  const tie = tieOf(s, B, c.id);
  if (tie && (tie.k === 'friend' || tie.k === 'ally')) { v += 14; why.push(tie.k === 'friend' ? 'An old friend' : 'An ally'); }
  if (tie && (tie.k === 'rival' || tie.k === 'feud')) { v -= 15; why.push('Bad blood with you'); }
  const his = opinion(s, c.id, B);
  const mine = opinion(s, B, c.id);
  const op = (his + mine) / 2;
  if (Math.abs(op) >= 5) { v += op / 4; why.push(`${op > 0 ? 'Warm' : 'Cold'} between you (${op > 0 ? '+' : ''}${Math.round(op)})`); }
  if (c.madeWeek !== undefined) {
    const yrs = Math.max(0, (s.week - c.madeWeek) / 52);
    const add = Math.min(12, 4 + yrs * 3);
    v += add;
    why.push(yrs >= 1 ? `Made ${Math.round(yrs)} year${Math.round(yrs) === 1 ? '' : 's'} ago` : 'A made man');
  }
  return { v: clamp(v), why };
}

export function desperation(s: GameState, c: Character | undefined, kind: ReqKind, urgent: boolean): ReqPart {
  const why: string[] = [];
  let v = 0;
  if (urgent) { v += 18; why.push('It cannot wait'); }
  if (kind === 'warning') { v += 22; why.push('He has a warning'); }
  if (!c) return { v: clamp(v), why };
  if (c.debtTo) { v += 26 + Math.min(14, c.debtTo.amount / 250); why.push(`Owes ${fmtMoney(c.debtTo.amount)} to a shylock`); }
  if ((c.arrears ?? 0) > 0) { v += 10; why.push('Behind on his envelope'); }
  if (s.mg?.docket?.some((x) => x.defendantId === c.id)) { v += 28; why.push('A court date coming'); }
  else if ((c.evidence ?? 0) >= 50) { v += 20; why.push('The law has a file on him'); }
  for (const pid of [c.motherId, c.fatherId, c.spouseId, ...c.childrenIds]) {
    const k = pid ? s.characters[pid] : undefined;
    if (k?.alive && k.health < 35) {
      v += 24;
      why.push(`${k.id === c.motherId ? 'His mother' : k.id === c.fatherId ? 'His father' : k.id === c.spouseId ? 'His wife' : 'His child'} is very sick`);
      break;
    }
  }
  if (s.threats?.tips.some((t) => t.targetId === c.id && (t.status === 'waiting' || t.status === 'met'))) { v += 20; why.push('A threat on his name'); }
  if (c.health < 40) { v += 8; why.push('In poor health'); }
  if (c.wealth < 150 && c.faction === 'player') { v += 8; why.push('Broke'); }
  return { v: clamp(v), why };
}

/** Dollars the ask is worth to the family (or costs it), read off the matter itself. */
function stake(s: GameState, ref: AudienceReq['ref']): number {
  let n = 0;
  const scan = (effs: readonly Effect[]) => { for (const e of effs) if (e.type === 'money') n = Math.max(n, Math.abs(e.amount)); };
  if (ref.event) {
    const ev = s.pendingEvents.find((e) => e.iid === ref.event);
    for (const ch of ev?.choices ?? []) scan(ch.effects);
  }
  if (ref.tip) {
    const t = s.threats?.tips.find((x) => x.id === ref.tip);
    const b = t?.bizId ? s.businesses.find((x) => x.id === t.bizId) : undefined;
    if (b) n = Math.max(n, b.weeklyBase * 4);
    if (t?.kind === 'hit' || t?.kind === 'fed_gj' || t?.kind === 'fed_flip') n = Math.max(n, 5000);
  }
  return n;
}

export function moneyPart(s: GameState, ref: AudienceReq['ref']): ReqPart {
  const n = stake(s, ref);
  if (!n) return { v: 0, why: ['No money in it'] };
  return { v: clamp(Math.sqrt(n) / Math.sqrt(10000) * 100), why: [`About ${fmtMoney(n)} at stake`] };
}

/** The gatekeeper's thumb on the scale: friends up, rivals down, an envelope moves a man up. */
export function gateBias(s: GameState, g: Gatekeeper, c: Character | undefined, desp: number): ReqBias[] {
  if (!g.id || !c || c.id === g.id) return [];
  const gk = s.characters[g.id];
  const out: ReqBias[] = [];
  const tie = tieOf(s, g.id, c.id);
  const op = opinion(s, g.id, c.id);
  if ((tie && (tie.k === 'friend' || tie.k === 'ally')) || op >= 30) out.push({ v: BIAS_FRIEND, kind: 'friend', text: `${first(gk)}'s friend: moved up` });
  else if ((tie && (tie.k === 'rival' || tie.k === 'feud')) || op <= -15) out.push({ v: BIAS_RIVAL, kind: 'rival', text: `${first(gk)} buried it: no love between them` });
  const greedy = hasTrait(gk, 'Greedy') || attr(s, gk, 'greed') >= 60;
  if (greedy && c.wealth >= 300 && desp >= 35 && hroll(`${s.seed}|${s.week}|bribe|${c.id}`) < 0.6) {
    const amount = Math.max(100, Math.min(1000, Math.round((c.wealth * 0.08) / 50) * 50));
    out.push({ v: BIAS_BRIBE, kind: 'bribe', amount, text: `Slipped ${first(gk)} ${fmtMoney(amount)} to get in` });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

interface Raw { key: string; kind: ReqKind; charId?: string; name: string; role: string; why: string; urgent?: boolean; ref: AudienceReq['ref'] }

function roleOf(s: GameState, c: Character | undefined): string {
  if (!c) return 'From town';
  if (c.dynasty) return 'Family';
  if (holder(s, 'underboss')?.id === c.id) return 'Your underboss';
  if (holder(s, 'consigliere')?.id === c.id) return 'Your consigliere';
  const r = s.rivals.find((x) => x.leaderId === c.id);
  if (r) return `Boss of ${r.name}`;
  if (c.faction === 'player') return c.outside ? `On the pad (${c.outside})` : c.rank[0].toUpperCase() + c.rank.slice(1);
  return 'From town';
}

function raws(s: GameState, ui: OfficeUi): Raw[] {
  const out: Raw[] = [];
  let vs: ReturnType<typeof officeVisitors> = [];
  try { vs = officeVisitors(s, ui); } catch { vs = []; }
  for (const v of vs) {
    const c = v.charId ? s.characters[v.charId] : undefined;
    out.push({ key: v.key, kind: v.kind, charId: c && c.id !== s.playerId ? c.id : undefined, name: v.name, role: c ? roleOf(s, c) : v.kind === 'lawyer' ? 'Your lawyer' : 'From town', why: v.why, urgent: v.urgent, ref: v.ref });
  }
  for (const u of urgentMeetings(s)) {
    if (u.status !== 'waiting') continue;
    out.push({ key: `tip:${u.id}`, kind: 'warning', charId: u.charId, name: u.who, role: u.role, why: `Wants an urgent word: ${u.hint}`, urgent: true, ref: { tip: u.id } });
  }
  return out;
}

/** The requests for an audience, as the gatekeeper ranks them (best first). Below the chair there is no door: none. */
export function audienceRequests(s: GameState, ui: OfficeUi = {}): AudienceReq[] {
  if (s.gameOver || inTheRanks(s)) return [];
  const g = gatekeeper(s);
  const P = plannerOf(s);
  const booked = new Map<string, { id: string; w: number; d: number; h: number }>();
  for (const it of s.action?.sched ?? []) if (it.kind === 'plan' && it.payload.pk === 'audience') booked.set(String(it.payload.key), { id: it.id, w: it.w, d: it.d, h: it.h });
  const list = raws(s, ui).filter((r) => P.turned[r.key] === undefined || P.turned[r.key] < s.week).map((r): AudienceReq => {
    const c = r.charId ? s.characters[r.charId] : undefined;
    const close = closeness(s, c);
    const desp = desperation(s, c, r.kind, !!r.urgent);
    const money = moneyPart(s, r.ref);
    const base = Math.round(W_CLOSE * close.v + W_DESP * desp.v + W_MONEY * money.v);
    const bias = gateBias(s, g, c, desp.v);
    const score = Math.max(0, Math.min(100, base + bias.reduce((a, b) => a + b.v, 0)));
    return { ...r, close, desp, money, base, score, bias, moved: 0, refused: c ? P.refused[c.id] ?? 0 : 0, ...(booked.has(r.key) ? { booked: booked.get(r.key) } : {}) };
  });
  const fair = list.slice().sort((a, b) => b.base - a.base || a.key.localeCompare(b.key)).map((x) => x.key);
  list.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  list.forEach((x, i) => { x.moved = fair.indexOf(x.key) - i; });
  return list;
}

/* ------------------------------------------------------------------ */
/* Giving an hour                                                      */
/* ------------------------------------------------------------------ */

export interface Slot { w: number; d: number; h: number }

const failed = (state: GameState, error: string): { state: GameState; result: NowResult } => ({ state, result: { ok: false, error, title: 'The audience', tier: 'fail', headline: error, line: '', changes: [], leadsTo: [] } });
const okResult = (title: string, who: string | undefined, line: string, changes: string[] = [], leadsTo: string[] = []): NowResult => ({ ok: true, title, ...(who ? { who } : {}), tier: 'success', headline: 'Done', line, changes, leadsTo });

function whenWords(s: GameState, sl: Slot): string {
  const rel = sl.w * 7 + sl.d - absDay(s);
  const day = rel === 0 ? 'today' : rel === 1 ? 'tomorrow' : `${DAY_NAMES[sl.d]}${sl.w > s.week ? ' next week' : ''}`;
  return `${day}, ${formatClock(sl.h)}`;
}

/**
 * Give him an hour: `'now'` hears him at once (the matter opens; the hour comes off today), a slot puts
 * him in the datebook (the hours are booked on that day; his hour comes on the clock).
 * An urgent warning is the urgent meeting itself (threats.ts meetTip: the boss meets him).
 */
export function grantAudience(s: GameState, r: AudienceReq, at: Slot | 'now'): { state: GameState; result: NowResult; open?: AudienceReq['ref'] } {
  if (r.booked) return failed(s, 'He is already on the book');
  const hours = PLAN_HOURS.audience;
  const c = r.charId ? s.characters[r.charId] : undefined;
  if (r.ref.tip) {
    const x = meetTip(s, r.ref.tip, 'boss');
    if (x === s) return failed(s, 'You cannot meet him now');
    const y = phoneClone(x);
    const P = ensurePlanner(y);
    const jid = journal(y, { d: today(y), c: 'law', t: `You gave ${r.name} the hour he asked for`, x: r.why, src: 'planner', mine: 1, ...(c ? { p: [c.id] } : {}) });
    pushDone(P, { w: y.week, d: today(y), h: Math.floor(nowHour(s)), t: `Audience: ${r.name}`, r: 'Heard his warning', jid, k: 'audience', ...(c ? { who: c.id } : {}) });
    return { state: y, result: okResult(`An hour for ${r.name}`, r.name, `You sat down with ${r.name}. Now: what to do about what he says.`), open: r.ref };
  }
  const slot: Slot = at === 'now' ? { w: s.week, d: today(s), h: Math.floor(nowHour(s)) } : at;
  const block = slotBlock(s, slot.w, slot.d, slot.h, hours);
  if (block) return failed(s, block);
  let x = bookHours(s, slot.w * 7 + slot.d, hours);
  x = phoneClone(x);
  const P = ensurePlanner(x);
  if (c) P.refused[c.id] = Math.max(0, (P.refused[c.id] ?? 0) - 1);
  if (at === 'now') {
    if (c) addOpinion(x, c.id, x.playerId, 'The boss gave me his time', 3, 2);
    const jid = journal(x, { d: today(x), c: c?.faction === 'player' ? 'crew' : 'town', t: `You gave ${r.name} an audience`, x: r.why, src: 'planner', mine: 1, ...(c ? { p: [c.id] } : {}) });
    pushDone(P, { w: x.week, d: today(x), h: slot.h, t: `Audience: ${r.name}`, r: 'Heard him out', jid, k: 'audience', ...(c ? { who: c.id } : {}) });
    return { state: x, result: okResult(`An hour for ${r.name}`, r.name, `${r.name} sits down across the desk. His matter is in front of you.`, c ? [`${c.firstName} +3: the boss gave me his time`] : []), open: r.ref };
  }
  scheduleInto(x, { kind: 'plan', day: slot.d, hour: slot.h, w: slot.w, payload: { pk: 'audience', key: r.key, who: c?.id ?? '', name: r.name, title: `Audience: ${r.name}`, why: r.why, hours, ref: r.ref } });
  if (c) addOpinion(x, c.id, x.playerId, 'The boss made time for me', 2, 2);
  journal(x, { d: today(x), c: 'crew', t: `${r.name} is on your book: ${whenWords(s, slot)}`, src: 'planner', mine: 1, ...(c ? { p: [c.id] } : {}) });
  return { state: x, result: okResult(`An hour for ${r.name}`, r.name, `${r.name} is on the book ${whenWords(s, slot)}. ${hours === 1 ? 'An hour' : `${hours} hours`} of that day are his.`) };
}

/* ------------------------------------------------------------------ */
/* Turning him away                                                    */
/* ------------------------------------------------------------------ */

/** The family a man turned away might take his business to. */
function rivalFor(s: GameState, c: Character): RivalId | undefined {
  if (c.courtedBy) return c.courtedBy.rival;
  if (c.debtTo) return c.debtTo.rival;
  const r = s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive).sort((a, b) => opinion(s, b.leaderId, c.id) - opinion(s, a.leaderId, c.id))[0];
  return r?.id;
}

/** What a man turned away this many times does. Pure read (the UI shows it before the click). */
export function refusalOutlook(s: GameState, r: AudienceReq): string {
  const c = r.charId ? s.characters[r.charId] : undefined;
  if (!c) return 'Nobody will hold it against you.';
  const n = r.refused + 1;
  const loss = 5 + 3 * n;
  if (n === 1) return `${c.firstName} takes it badly (about −${loss}).`;
  if (n === 2) return `Twice now: ${c.firstName} starts keeping score (−${loss} and a grudge).`;
  return `${n} times: ${c.firstName} may do something stupid (−${loss}, then ${c.debtTo ? 'back to the shylock' : hasTrait(c, 'Ambitious') || hasTrait(c, 'Greedy') || c.courtedBy ? 'to another family' : 'a scene in public'}).`;
}

/**
 * Turn him away: the request leaves the list for the week (his matter stays on the Desk, where it can still
 * be answered), and he reacts. A warning turned away is the urgent meeting brushed off (threats.ts ignoreTip).
 */
export function turnAway(s: GameState, r: AudienceReq): { state: GameState; result: NowResult } {
  let x = r.ref.tip ? ignoreTip(s, r.ref.tip) : s;
  x = phoneClone(x);
  const c = r.charId ? x.characters[r.charId] : undefined;
  const P = ensurePlanner(x);
  P.turned[r.key] = x.week;
  if (r.booked) x.action!.sched = (x.action!.sched ?? []).filter((it) => it.id !== r.booked!.id);
  const lines: string[] = [];
  const changes: string[] = [];
  if (c) {
    const n = (P.refused[c.id] ?? 0) + 1;
    P.refused[c.id] = n;
    P.lastRefused[c.id] = x.week;
    const ctx = newCtx(x);
    const v = -(5 + 3 * n);
    let landed = false;
    try {
      applyDecision(ctx, { k: 'decline', label: `You would not see ${r.name}`, t: c.id, v, y: n >= 2 ? 'Turned me away again' : 'The boss would not see me', pride: 1, go: rivalFor(x, c), src: 'audience' });
      landed = true;
    } catch { landed = false; }
    if (!landed) addOpinion(x, c.id, x.playerId, 'The boss would not see me', v, 1);
    changes.push(`${c.firstName}: turned away${n > 1 ? ` (${n} times)` : ''}`);
    if (n === 2) {
      changeMeter(x, c.id, x.playerId, 'grievance', 10);
      const m = mindOf(x, c.id);
      if (m) remember(m, { w: x.week, k: 'slight', who: x.playerId, t: 'turned away at the door, twice', v: -12 });
      lines.push(`${c.firstName} is keeping count now. It is a grudge.`);
    } else if (n >= 3) {
      if (c.debtTo) {
        c.debtTo = { ...c.debtTo, amount: c.debtTo.amount + 500 };
        c.skimmed = (c.skimmed ?? 0) + 300;
        lines.push(`${c.firstName} went back to the shylock, and has started skimming to pay him.`);
      } else if ((hasTrait(c, 'Ambitious') || hasTrait(c, 'Greedy') || c.courtedBy) && rivalFor(x, c)) {
        const rv = rivalFor(x, c)!;
        const L = x.characters[x.rivals.find((q) => q.id === rv)?.leaderId ?? ''];
        c.courtedBy = { rival: rv, week: x.week };
        c.defectStage = Math.max(c.defectStage ?? 0, 1);
        lines.push(`${c.firstName} took his business to ${L ? displayName(L) : 'another family'}.`);
      } else {
        pushAsk(x, { d: 'insult', a: c.id, p: 60, y: `${displayName(c)} told the whole bar on Pacific Avenue the boss has no time for his own people.` });
        lines.push(`${c.firstName} made a scene about it in public.`);
      }
    }
    lines.unshift(...ctx.log.slice(-1));
  }
  journal(x, { d: today(x), c: c?.faction === 'player' ? 'crew' : 'town', t: `You turned ${r.name} away`, x: r.why, r: lines, src: 'planner', mine: 1, ...(c ? { p: [c.id] } : {}) });
  return { state: x, result: okResult(`You would not see ${r.name}`, r.name, lines.join(' ') || 'He goes, with his hat in his hand.', changes) };
}
