import { addDays, dateOfWeek, laborDay, memorialDay, monthName, toDays } from '../calendar';
import { capos, crew, displayName, isFree, player } from '../characters';
import { holder } from '../council';
import { DAY_NAMES, DAY_SHORT, dayBlock, setEvening, today, weekPlan } from '../days';
import type { NowResult } from '../deeds/now';
import { journal, type JCat, type JEntry } from '../journal';
import { whosPlaying } from '../paper';
import { phoneClone } from '../phone';
import { placeOf } from '../phoneMeet';
import { can, inTheRanks } from '../rankView';
import { addOpinion, opinion, relKey } from '../relations';
import { roundOptions } from '../rounds';
import { registerDelivery, scheduleInto, type ScheduledItem } from '../schedule';
import { stormName } from '../setPieces';
import { absDay, DAY_HOURS, DAY_START, formatClock, hoursLabel } from '../timeCost';
import { above, chiefOf, quotaNow } from '../valente';
import { wifeOf } from '../bonds';
import type { Character, GameDate, GameState } from '../types';
import { bookHours, freeOn, nowHour, PLAN_HOURS, slotBlock, weekLeft, type PlanKind } from './hours';
import { byName, knownTips, tipConfidence, tipLine, type Conf, type Go } from './intel';
import { ensurePlanner, plannerOf, pushDone } from './state';

/**
 * THE DATEBOOK (DONS_PLANNER.md §1): a leather planner on the desk. Two pages: today hour by hour (8 AM
 * to 2 AM) and the week at a glance; a month view and the past pages. It holds everything already on the
 * clock, read off the systems that keep it (nothing is copied):
 *
 *  - the scheduler (schedule.ts): meets set by phone, the handler's meet (in hidden ink), the boss's own plans;
 *  - the evenings (days.ts weekPlan), Monday's envelope and the Sit-Down, the quota and the capo's orders below the chair;
 *  - court dates (the trial docket), the season's set-pieces and the storm once it is warned;
 *  - KNOWN threats with their countdowns (urgent meetings that are out; an unknown one stays off the book);
 *  - birthdays and saints' days, the paper's "who's playing";
 *  - the done ticks (planner state) and what Your File has for the day.
 *
 * Planning from an empty slot: a meet (the phone's dial window, pre-filled), a dinner, a visit, an evening
 * (the existing rounds), or an audience. The boss's own plans are `plan` items on the scheduler; their
 * hours come off the day they are on (hours.ts), and when the day comes they are done, with one line in Your File.
 */

export type EntryKind = 'meet' | 'audience' | 'dinner' | 'visit' | 'evening' | 'envelope' | 'sitdown' | 'quota' | 'orders' | 'court' | 'handler'
  | 'setpiece' | 'storm' | 'threat' | 'family' | 'saint' | 'paper' | 'done';

export interface BookEntry {
  id: string;
  kind: EntryKind;
  w: number;
  d: number;
  /** Clock hour (8 … 26). */
  h: number;
  /** Hours it takes (0: a mark, not a block of time). */
  dur: number;
  title: string;
  sub?: string;
  /** Your File category / domain key (ui/domain.ts domainOf). */
  dom: JCat | 'church' | 'shore';
  who?: string;
  /** Written in hidden ink (the handler: only the boss can read it). */
  hidden?: true;
  /** A countdown ("in 3 days", "tonight"). */
  count?: string;
  conf?: Conf;
  done?: { r: string; jid?: string };
  /** A scheduled item that can be moved or cancelled. */
  sid?: string;
  move?: true;
  cancel?: true;
  go?: Go;
}

/** Absolute day <-> week and day. */
export const absOf = (w: number, d: number) => w * 7 + d;
export const wdOf = (abs: number) => ({ w: Math.floor(abs / 7), d: ((abs % 7) + 7) % 7 });
export function dateOf(w: number, d: number): GameDate {
  return addDays(dateOfWeek(w), d);
}
/** The absolute day of a date. */
export function absOfDate(dt: GameDate): number {
  return absOf(1, 0) + (toDays(dt) - toDays(dateOfWeek(1)));
}

/* ------------------------------------------------------------------ */
/* What is on a day                                                    */
/* ------------------------------------------------------------------ */

const SAINTS: [number, number, string][] = [
  [3, 19, 'St. Joseph\'s Day: zeppole on every table'], [6, 13, 'St. Anthony\'s feast'], [8, 15, 'The Assumption: the procession on Pacific Avenue'],
  [9, 19, 'San Gennaro: the feast in Philadelphia'], [11, 1, 'All Saints\''], [12, 24, 'Christmas Eve: the seven fishes'], [12, 25, 'Christmas'], [12, 31, 'New Year\'s Eve'],
];

function family(s: GameState): Character[] {
  const boss = player(s);
  const out = Object.values(s.characters).filter((c) => c.alive && c.dynasty);
  const w = boss?.spouseId ? s.characters[boss.spouseId] : undefined;
  if (w?.alive && !out.includes(w)) out.push(w);
  return out;
}

function inMonthDay(dt: GameDate, m: number, d: number): boolean {
  return dt.m === m && dt.d === d;
}

function sched(s: GameState): ScheduledItem[] {
  return s.action?.sched ?? [];
}

const KIND_DOM: Record<string, BookEntry['dom']> = { audience: 'crew', dinner: 'family', visit: 'crew', meet: 'crew' };

/** What a plan item on the scheduler shows. */
function planEntry(s: GameState, it: ScheduledItem): BookEntry {
  const p = it.payload as { pk: PlanKind; who?: string; name?: string; title?: string; why?: string; hours?: number; ref?: Go };
  const c = p.who ? s.characters[p.who] : undefined;
  const dom = p.pk === 'dinner' && c && !c.dynasty && c.id !== wifeOf(s)?.id ? (c.faction === 'player' ? 'crew' : 'town') : KIND_DOM[p.pk] ?? 'crew';
  return {
    id: `sched:${it.id}`, kind: p.pk === 'audience' ? 'audience' : p.pk === 'dinner' ? 'dinner' : 'visit', w: it.w, d: it.d, h: it.h, dur: p.hours ?? PLAN_HOURS[p.pk] ?? 1,
    title: p.title ?? 'Plans', sub: p.why, dom, who: c?.id, sid: it.id, move: true, cancel: true,
    go: p.ref && (p.ref.event || p.ref.day !== undefined || p.ref.brief || p.ref.tip) ? p.ref : c ? { char: c.id } : undefined,
  };
}

/** Everything on the book for a day (past days: the ticks and Your File; today and ahead: what is planned). Sorted by hour. */
export function dayEntries(s: GameState, w: number, d: number): BookEntry[] {
  const out: BookEntry[] = [];
  const abs = absOf(w, d);
  const now = absDay(s);
  const dt = dateOf(w, d);
  const P = plannerOf(s);
  // Done: the book's own ticks for the day.
  P.done.forEach((t, i) => {
    if (t.w === w && t.d === d) out.push({ id: `done:${i}`, kind: 'done', w, d, h: t.h, dur: 0, title: t.t, dom: t.k === 'dinner' ? 'family' : 'crew', who: t.who, done: { r: t.r, jid: t.jid }, go: { file: true } });
  });
  const live = abs >= now;
  if (live) {
    for (const it of sched(s)) {
      if (it.w !== w || it.d !== d) continue;
      if (it.kind === 'plan') out.push(planEntry(s, it));
      else if (it.kind === 'meet') {
        const p = it.payload as { who: string; place: string };
        const c = s.characters[p.who];
        out.push({ id: `sched:${it.id}`, kind: 'meet', w, d, h: it.h < DAY_START ? it.h + 24 : it.h, dur: PLAN_HOURS.meet, title: `Meet ${c ? displayName(c) : 'him'}`, sub: `At ${placeOf(s, p.place).name}. Set by phone.`, dom: c && s.rivals.some((r) => r.leaderId === c.id) ? 'rivals' : 'crew', who: c?.id, sid: it.id, move: true, cancel: true, go: c ? { char: c.id } : undefined });
      } else if (it.kind === 'feds_handler') {
        out.push({ id: `sched:${it.id}`, kind: 'handler', w, d, h: it.h < DAY_START ? it.h + 24 : it.h, dur: 2, title: 'A drive to Cape May', sub: 'The men from Newark. Nobody else may read this line.', dom: 'law', hidden: true });
      }
    }
  }
  // Monday: the envelope and the Sit-Down (the chair), or the kick-up and the capo's orders (the ranks).
  if (d === 0 && live) {
    if (inTheRanks(s)) {
      const q = quotaNow(s);
      const chief = chiefOf(s);
      if (q > 0) out.push({ id: `quota:${w}`, kind: 'quota', w, d, h: 9, dur: 1, title: `Kick-up due to ${chief ? chief.firstName : 'your capo'}: $${q.toLocaleString('en-US')}`, sub: (above(s)?.owed ?? 0) > 0 ? `Plus $${above(s)!.owed.toLocaleString('en-US')} you still owe.` : 'The quota, every Monday.', dom: 'money', go: { tab: 'borgata.place' } });
    } else {
      if (can(s, 'office')) out.push({ id: `env:${w}`, kind: 'envelope', w, d, h: 9, dur: 1, title: 'The envelope', sub: 'The week\'s count, at the club.', dom: 'money', go: { office: true } });
      if (can(s, 'sitdown')) out.push({ id: `sit:${w}`, kind: 'sitdown', w, d, h: 10, dur: 1, title: 'The Sit-Down', sub: 'Your people, around the table.', dom: 'crew', go: { sitdown: true } });
    }
  }
  if (live && inTheRanks(s)) {
    const a = above(s);
    if (a && a.nextOrder === w && d === 1) out.push({ id: `ord:${w}`, kind: 'orders', w, d, h: 11, dur: 1, title: `Orders from ${chiefOf(s)?.firstName ?? 'your capo'}`, sub: 'He sends for you. Be there.', dom: 'crew', go: { tab: 'borgata.place' } });
  }
  // The evenings (this week's plan).
  if (w === s.week && live) {
    const id = weekPlan(s)[d];
    if (id) {
      const r = roundOptions(s).find((x) => x.id === id);
      out.push({ id: `eve:${w}:${d}`, kind: 'evening', w, d, h: 20, dur: 4, title: r?.label ?? 'Your evening', sub: r?.text, dom: id.startsWith('fam') ? 'family' : id.startsWith('date') || id.includes('goomar') ? 'romance' : 'crew', move: true, cancel: true, ...(r?.who ? { who: r.who } : {}) });
    }
  }
  // Court dates.
  for (const x of s.mg?.docket ?? []) {
    const c = s.characters[x.defendantId];
    if (!c?.alive || x.due !== w || d !== 1 || !live) continue;
    if (c.faction !== 'player' && c.id !== s.playerId) continue;
    out.push({ id: `court:${c.id}:${w}`, kind: 'court', w, d, h: 10, dur: 0, title: `Court: ${c.id === s.playerId ? 'your' : `${c.firstName}'s`} trial`, sub: 'The federal courthouse in Camden.', dom: 'law', who: c.id, go: { char: c.id } });
  }
  // The secret informant's monthly meet (when no scheduled item says it yet): hidden ink.
  const coop = s.feds?.boss;
  if (live && coop?.path === 'informant' && !coop.burned && coop.next === w && d === 3 && !sched(s).some((x) => x.kind === 'feds_handler' && x.w === w)) {
    out.push({ id: `handler:${w}`, kind: 'handler', w, d, h: 15, dur: 2, title: 'A drive to Cape May', sub: 'The men from Newark. Nobody else may read this line.', dom: 'law', hidden: true });
  }
  // The season's set-pieces (the calendar's dates) and the storm (once it is warned).
  const y = dt.y;
  const pieces: [GameDate, string, string][] = [[memorialDay(y), 'Memorial Day: the season opens', 'The first crowds; the first envelope of the season.'], [{ y, m: 7, d: 4 }, 'The Fourth of July', 'The biggest crowd of the summer. The cops on overtime.'], [laborDay(y), 'Labor Day: the season\'s count', 'Philadelphia wants its bonus.']];
  for (const [pd, t, sub] of pieces) if (toDays(pd) === toDays(dt)) out.push({ id: `sp:${t}:${y}`, kind: 'setpiece', w, d, h: 12, dur: 0, title: t, sub, dom: 'shore' });
  if (s.flags.storm_week === w && !s.flags.storm_landed && d === (s.flags.storm_day ?? 1)) {
    out.push({ id: `storm:${w}`, kind: 'storm', w, d, h: 22, dur: 0, title: `Hurricane ${stormName(s, y)} comes ashore`, sub: 'Board up, or use the storm for cover.', dom: 'shore', count: countdown(abs - now) });
  }
  // KNOWN threats, with their countdowns.
  if (live) for (const t of knownTips(s)) {
    if (t.dueDay === undefined || t.deadline !== w || t.dueDay !== d) continue;
    const tl = tipLine(s, t);
    const read = tipConfidence(s, t);
    out.push({ id: `tip:${t.id}`, kind: 'threat', w, d, h: t.hour === undefined ? 23 : t.hour < DAY_START ? t.hour + 24 : t.hour, dur: 0, title: tl.text, sub: `From ${t.sourceName} (${read.src.grade}: ${read.src.word}).`, dom: t.by === 'police' || t.by === 'fbi' ? 'law' : 'rivals', count: countdown(abs - now), conf: read.conf, go: { tip: t.id } });
  }
  // Family dates and saints' days.
  for (const c of family(s)) {
    if (inMonthDay(dt, c.birth.m, c.birth.d)) out.push({ id: `bday:${c.id}:${y}`, kind: 'family', w, d, h: 18, dur: 0, title: c.id === s.playerId ? 'Your birthday' : `${c.firstName}'s birthday`, sub: c.id === s.playerId ? undefined : `${y - c.birth.y} years old.`, dom: 'family', who: c.id === s.playerId ? undefined : c.id, go: c.id === s.playerId ? undefined : { char: c.id } });
  }
  for (const c of Object.values(s.characters)) {
    if (!c.dynasty || c.alive || !c.death) continue;
    const fd = addDays(c.death.date, 3);
    if (toDays(fd) === toDays(dt)) out.push({ id: `fun:${c.id}`, kind: 'family', w, d, h: 10, dur: 3, title: `${c.firstName}'s funeral`, sub: 'St. Ann\'s, then the cemetery in Cape May Court House.', dom: 'church' });
  }
  for (const [m, dd, t] of SAINTS) if (inMonthDay(dt, m, dd)) out.push({ id: `saint:${m}:${dd}:${y}`, kind: 'saint', w, d, h: 8, dur: 0, title: t, dom: 'church' });
  // The paper's entertainment: Friday, who is playing in town (this week and next, as far as the paper knows).
  if (d === 4 && live && w <= s.week + 1) {
    let ls: ReturnType<typeof whosPlaying> = [];
    try { ls = whosPlaying(s, w).filter((x) => !x.film); } catch { ls = []; }
    if (ls.length) out.push({ id: `paper:${w}`, kind: 'paper', w, d, h: 21, dur: 0, title: `In town: ${ls[0].act} at ${ls[0].room}`, sub: ls.slice(1, 3).map((x) => `${x.act} at ${x.room}`).join(' · ') || undefined, dom: 'romance', go: { tab: 'chronicle.papers' } });
  }
  return out.sort((a, b) => a.h - b.h || (a.kind === 'done' ? 1 : 0) - (b.kind === 'done' ? 1 : 0) || a.id.localeCompare(b.id));
}

function countdown(days: number): string {
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** What Your File has for a day (his own doings first): the past pages. */
export function fileOn(s: GameState, w: number, d: number): JEntry[] {
  const es = (s.journal?.e ?? []).filter((e) => e.w === w && e.d === d);
  return es.sort((a, b) => (b.mine ?? 0) - (a.mine ?? 0)).slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* The pages                                                           */
/* ------------------------------------------------------------------ */

export interface DayPage {
  w: number;
  d: number;
  abs: number;
  /** "Wednesday, June 15, 1960". */
  label: string;
  short: string;
  past: boolean;
  today: boolean;
  entries: BookEntry[];
  /** Hours still free (0 for a day gone). */
  free: number;
  note?: string;
  file: JEntry[];
}

export function dayPage(s: GameState, w: number, d: number): DayPage {
  const abs = absOf(w, d);
  const now = absDay(s);
  const dt = dateOf(w, d);
  return {
    w, d, abs, label: `${DAY_NAMES[d]}, ${monthName(dt.m)} ${dt.d}, ${dt.y}`, short: `${DAY_SHORT[d]} ${dt.d}`,
    past: abs < now, today: abs === now, entries: dayEntries(s, w, d), free: freeOn(s, abs), note: plannerOf(s).notes[String(abs)],
    file: abs <= now ? fileOn(s, w, d) : [],
  };
}

export interface WeekPage { w: number; label: string; days: DayPage[]; left: number }

export function weekPage(s: GameState, w: number): WeekPage {
  const a = dateOf(w, 0);
  const b = dateOf(w, 6);
  return { w, label: `${monthName(a.m)} ${a.d} – ${a.m === b.m ? '' : `${monthName(b.m)} `}${b.d}, ${b.y}`, days: [0, 1, 2, 3, 4, 5, 6].map((d) => dayPage(s, w, d)), left: w === s.week ? weekLeft(s) : w > s.week ? [0, 1, 2, 3, 4, 5, 6].reduce((n, d) => n + freeOn(s, absOf(w, d)), 0) : 0 };
}

export interface MonthCell { abs: number; w: number; d: number; day: number; n: number; flags: EntryKind[]; past: boolean; today: boolean }
export interface MonthPage { y: number; m: number; label: string; lead: number; cells: MonthCell[] }

/** The month: each day with how much is on it (ticks and Your File for the past; the book ahead). */
export function monthPage(s: GameState, y: number, m: number): MonthPage {
  const firstDay: GameDate = { y, m, d: 1 };
  const now = absDay(s);
  const cells: MonthCell[] = [];
  for (let i = 0; i < 31; i++) {
    const dt = addDays(firstDay, i);
    if (dt.m !== m) break;
    const abs = absOfDate(dt);
    const { w, d } = wdOf(abs);
    let n = 0;
    let flags: EntryKind[] = [];
    if (w >= 1 && w <= s.week + 8) {
      const es = dayEntries(s, w, d);
      n = es.length + (abs <= now ? fileOn(s, w, d).filter((e) => e.mine).length : 0);
      flags = [...new Set(es.map((e) => e.kind))].filter((k) => k === 'threat' || k === 'family' || k === 'court' || k === 'storm' || k === 'setpiece' || k === 'audience' || k === 'meet');
    }
    cells.push({ abs, w, d, day: dt.d, n, flags, past: abs < now, today: abs === now });
  }
  // Monday-first grid: blanks before the 1st.
  const lead = cells.length ? cells[0].d : 0;
  return { y, m, label: `${monthName(m)} ${y}`, lead, cells };
}

/* ------------------------------------------------------------------ */
/* Planning from a slot                                                */
/* ------------------------------------------------------------------ */

export interface PlanWho { id: string; name: string; role: string }

/** Who he can have dinner with or call on: his wife and blood, his officers and capos, the other bosses. */
export function planPeople(s: GameState, kind: 'dinner' | 'visit'): PlanWho[] {
  const out: PlanWho[] = [];
  const seen = new Set<string>();
  const add = (c: Character | undefined, role: string) => { if (!c || !c.alive || seen.has(c.id) || c.id === s.playerId || !isFree(s, c)) return; seen.add(c.id); out.push({ id: c.id, name: displayName(c), role }); };
  add(wifeOf(s), 'Your wife');
  for (const c of family(s)) if (c.id !== s.playerId) add(c, 'Family');
  add(holder(s, 'underboss'), 'Your underboss');
  add(holder(s, 'consigliere'), 'Your consigliere');
  for (const c of capos(s)) add(c, 'Capo');
  if (inTheRanks(s)) add(chiefOf(s), 'Your capo');
  if (kind === 'visit') for (const c of crew(s).filter((x) => x.rank === 'soldier').sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId)).slice(0, 4)) add(c, 'Soldier');
  for (const r of s.rivals) if (r.kind === 'mob') add(s.characters[r.leaderId], `Boss of ${r.name}`);
  return out;
}

export interface EveningPick { id: string; label: string; text: string; blocked?: string }

/** The evenings that can go on this day (the rounds, with the existing rules). */
export function eveningPicks(s: GameState, w: number, d: number): EveningPick[] {
  if (w !== s.week) return [];
  return roundOptions(s).slice(0, 14).map((r) => ({ id: r.id, label: r.label, text: r.text, blocked: dayBlock(s, d, r.id) }));
}

const PLAN_GAIN: Record<'dinner' | 'visit', number> = { dinner: 6, visit: 3 };

/** Put a dinner or a visit on the book: the hours are booked on that day; it happens when the day comes. */
export function planWith(s: GameState, kind: 'dinner' | 'visit', who: string, slot: { w: number; d: number; h: number }): { state: GameState; result: NowResult } {
  const c = s.characters[who];
  const hours = PLAN_HOURS[kind];
  const fail = (e: string) => ({ state: s, result: { ok: false, error: e, title: 'The datebook', tier: 'fail' as const, headline: e, line: '', changes: [], leadsTo: [] } });
  if (!c?.alive) return fail('Nobody by that name');
  const block = slotBlock(s, slot.w, slot.d, slot.h, hours);
  if (block) return fail(block);
  const x = phoneClone(bookHours(s, absOf(slot.w, slot.d), hours));
  const title = kind === 'dinner' ? `Dinner with ${displayName(c)}` : `Call on ${displayName(c)}`;
  scheduleInto(x, { kind: 'plan', day: slot.d, hour: slot.h, w: slot.w, payload: { pk: kind, who, name: displayName(c), title, hours } });
  const jid = journal(x, { d: today(x), c: c.dynasty ? 'family' : c.faction === 'player' ? 'crew' : 'rivals', t: `On your book: ${title.toLowerCase()}, ${DAY_NAMES[slot.d]} ${formatClock(slot.h)}`, src: 'planner', mine: 1, p: [who] });
  void jid;
  return { state: x, result: { ok: true, title: 'In the datebook', who: displayName(c), tier: 'success', headline: 'Done', line: `${title}, ${DAY_NAMES[slot.d]}${slot.w > s.week ? ' next week' : ''} at ${formatClock(slot.h)}. ${hoursLabel(hours)} of that day are spoken for.`, changes: [], leadsTo: [] } };
}

/** An evening from the rounds put on a day (days.ts setEvening: its own rules decide). */
export function planEvening(s: GameState, d: number, id: string): GameState {
  const x = setEvening(s, d, id);
  if (x === s) return s;
  const r = roundOptions(s).find((o) => o.id === id);
  return journalPlan(x, `On your book: ${r?.label ?? 'an evening'}, ${DAY_NAMES[d]} evening`);
}

function journalPlan(s: GameState, t: string, who?: string): GameState {
  const x = { ...s, journal: s.journal ? { ...s.journal, e: s.journal.e.slice(), old: s.journal.old.slice() } : s.journal };
  journal(x, { d: today(x), c: 'crew', t, src: 'planner', mine: 1, ...(who ? { p: [who] } : {}) });
  return x;
}

/** Move an entry to another slot: a plan or a phone meet (its hours move with it), or an evening to another day. */
export function moveEntry(s: GameState, e: BookEntry, slot: { w: number; d: number; h: number }): GameState {
  if (e.kind === 'evening') {
    const id = weekPlan(s)[e.d];
    if (!id || slot.w !== s.week) return s;
    const x = setEvening(setEvening(s, e.d, null), slot.d, id);
    return x === s ? s : journalPlan(x, `Moved ${e.title.toLowerCase()} to ${DAY_NAMES[slot.d]}`);
  }
  if (!e.sid) return s;
  const it = sched(s).find((x) => x.id === e.sid);
  if (!it) return s;
  const hours = e.dur;
  const freed = bookHours(s, absOf(it.w, it.d), -hours);
  if (slotBlock(freed, slot.w, slot.d, slot.h, hours)) return s;
  let x = bookHours(freed, absOf(slot.w, slot.d), hours);
  x = { ...x, action: { ...x.action!, sched: sched(x).map((q) => (q.id === it.id ? { ...q, w: slot.w, d: slot.d, h: Math.min(23, slot.h) } : q)) } };
  if (e.who && it.kind === 'meet') x = withOpinion(x, e.who, -2, 'Moved our meet around');
  return journalPlan(x, `Moved ${e.title.toLowerCase()} to ${DAY_NAMES[slot.d]}${slot.w > s.week ? ' next week' : ''}, ${formatClock(slot.h)}`, e.who);
}

/** Cancel an entry: its hours come back; whoever was expecting him notices. */
export function cancelEntry(s: GameState, e: BookEntry): GameState {
  if (e.kind === 'evening') {
    const x = setEvening(s, e.d, null);
    return x === s ? s : journalPlan(x, `Called off ${e.title.toLowerCase()} (${DAY_NAMES[e.d]})`);
  }
  if (!e.sid) return s;
  const it = sched(s).find((x) => x.id === e.sid);
  if (!it) return s;
  let x = bookHours(s, absOf(it.w, it.d), -e.dur);
  x = { ...x, action: { ...x.action!, sched: sched(x).filter((q) => q.id !== it.id) } };
  if (e.who) x = withOpinion(x, e.who, it.kind === 'meet' ? -4 : -3, it.kind === 'meet' ? 'Called off our meet' : 'Cancelled on me');
  return journalPlan(x, `Called off: ${e.title.toLowerCase()}`, e.who);
}

/** The cost of cancelling, in words (shown before the click). */
export function cancelCost(s: GameState, e: BookEntry): string {
  const c = e.who ? s.characters[e.who] : undefined;
  if (e.kind === 'evening') return 'The evening is free again.';
  return `${e.dur ? `${hoursLabel(e.dur)} back. ` : ''}${c ? `${c.firstName} will notice (−${e.kind === 'meet' ? 4 : 3}).` : ''}`;
}

function withOpinion(s: GameState, who: string, v: number, why: string): GameState {
  const x = { ...s, relations: { ...s.relations } };
  const k = relKey(who, s.playerId);
  if (x.relations[k]) x.relations[k] = structuredClone(x.relations[k]);
  addOpinion(x, who, s.playerId, why, v, 2);
  return x;
}

/* ------------------------------------------------------------------ */
/* When the day comes                                                  */
/* ------------------------------------------------------------------ */

const RESULT: Record<string, (n: string) => string> = {
  audience: (n) => `Heard ${n} out.`,
  dinner: (n) => `Dinner with ${n}: the veal was good, and so was the talk.`,
  visit: (n) => `Called on ${n}. He will remember you came.`,
};

registerDelivery({
  kind: 'plan',
  moment: () => false,
  view: (_s, it) => ({ id: it.id, title: String(it.payload.title ?? 'Plans'), text: String(it.payload.why ?? ''), when: `${DAY_NAMES[it.d]}, ${formatClock(it.h)}`, warned: false, options: [{ id: 'go', label: 'Keep it', hint: '', odds: 1 }], def: 'go' }),
  answer: (s0, it) => {
    const s = phoneClone(s0);
    const p = it.payload as { pk: PlanKind; who?: string; name?: string; title?: string };
    const c = p.who ? s.characters[p.who] : undefined;
    const name = c ? c.firstName : p.name ?? 'him';
    const changes: string[] = [];
    if (c?.alive) {
      const v = p.pk === 'audience' ? 3 : PLAN_GAIN[p.pk as 'dinner' | 'visit'] ?? 2;
      addOpinion(s, c.id, s.playerId, p.pk === 'dinner' ? 'Took me to dinner' : p.pk === 'audience' ? 'The boss gave me his time' : 'Came to see me', v, 2);
      changes.push(`${c.firstName} +${v}`);
    }
    const r = (RESULT[p.pk] ?? RESULT.visit)(name);
    const jid = journal(s, { d: it.d, tm: formatClock(it.h), c: p.pk === 'dinner' && c?.dynasty ? 'family' : 'crew', t: String(p.title ?? 'Plans'), r: [r], src: 'planner', mine: 1, ...(c ? { p: [c.id] } : {}) });
    pushDone(ensurePlanner(s), { w: it.w, d: it.d, h: it.h, t: String(p.title ?? 'Plans'), r, jid, k: p.pk, ...(c ? { who: c.id } : {}) });
    return { state: s, result: { ok: true, title: String(p.title ?? 'Plans'), ...(c ? { who: displayName(c) } : {}), tier: 'success', headline: 'Done', line: r, changes, leadsTo: ['In Your File.'] } };
  },
});

/** Hours shown on the day's page (8 AM … 2 AM). */
export const PAGE_HOURS: number[] = Array.from({ length: DAY_HOURS }, (_, i) => DAY_START + i);
export { nowHour, byName };
