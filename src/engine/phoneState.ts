import type { GameState } from './types';

/**
 * THE PHONE (PHONE.md): the small state the telephone keeps. The calls themselves ride the day/hour
 * scheduler (schedule.ts: kinds 'call' and 'meet'); this is what is left once a call is over.
 *
 *  - `missed`: calls nobody picked up. Most can be returned until the end of the next day; after that
 *    the caller remembers. Some calls come only once (`once`): they stay in the list, but cannot be returned.
 *  - `log`: the last calls in and out (the phone's own list; every result also lands in Your File).
 *  - `tap`: a wire on the boss's lines (the county's or the FBI's), hidden until a sweep or the phone
 *    company man finds it; `clicks` is the rumor that the line clicks.
 *
 * Optional: made by the first call (or by upgradeSave for an old save).
 */

export type CallerKind = 'tip' | 'capo' | 'goomar' | 'wife' | 'philly' | 'rival' | 'anon' | 'reporter' | 'biz' | 'rat';
export type Line = 'home' | 'club' | 'pay';

export interface CallPayload {
  k: CallerKind;
  /** The caller (a character id) when he is one. */
  who?: string;
  name: string;
  role: string;
  /** Important: the clock stops for it (within the day's pause budget). */
  imp?: 1;
  /** It comes only once: it cannot be returned. */
  once?: 1;
  /** The urgent meeting it carries (threats.ts Tip id). */
  tip?: string;
  /** The capo's urgent problem (checkins.ts key) and its week. */
  key?: string;
  kw?: number;
  /** A rival outfit (rival, philly). */
  rival?: string;
  /** A business (the businessman who wants protection). */
  biz?: string;
  /** Which line rang. */
  line?: Line;
  [k: string]: unknown;
}

export interface MissedCall {
  id: string;
  p: CallPayload;
  w: number;
  d: number;
  h: number;
  /** The last absolute day (week*7+day) it can be returned. */
  until: number;
  /** The badge has been seen. */
  seen?: 1;
}

export interface CallLog {
  w: number;
  d: number;
  h: number;
  /** in: a call that came; out: a call he made; meet: a meet that happened. */
  dir: 'in' | 'out' | 'meet' | 'missed';
  name: string;
  t: string;
}

export interface PhoneState {
  v: 1;
  n: number;
  missed: MissedCall[];
  log: CallLog[];
  /** A wire on the boss's phones (hidden). */
  tap?: { by: 'county' | 'fbi'; since: number; clicks?: 1 };
  /** Times a caller was let ring (caller id -> count). */
  snub: Record<string, number>;
  /** Caller-kind cooldowns ("philly", "rival:<id>") -> the week of the last call. */
  last: Record<string, number>;
  /** Important calls that stopped the clock this week (week -> n). */
  stops: Record<string, number>;
  /** Check-ins already rung about ("<week>:<key>"), tips already rung about. */
  rung: string[];
  /** People he talked to on the phone this week (no second check-in the same week). */
  talked: Record<string, number>;
  stats: { in: number; out: number; picked: number; rang: number; msg: number; meets: number; noShow: number; setups: number; taped: number; code: number; found: number };
}

export function ensurePhone(s: GameState): PhoneState {
  if (!s.phone) s.phone = { v: 1, n: 0, missed: [], log: [], snub: {}, last: {}, stops: {}, rung: [], talked: {}, stats: { in: 0, out: 0, picked: 0, rang: 0, msg: 0, meets: 0, noShow: 0, setups: 0, taped: 0, code: 0, found: 0 } };
  const P = s.phone;
  P.v = 1;
  P.n ??= 0;
  P.missed ??= [];
  P.log ??= [];
  P.snub ??= {};
  P.last ??= {};
  P.stops ??= {};
  P.rung ??= [];
  P.talked ??= {};
  P.stats ??= { in: 0, out: 0, picked: 0, rang: 0, msg: 0, meets: 0, noShow: 0, setups: 0, taped: 0, code: 0, found: 0 };
  for (const k of ['in', 'out', 'picked', 'rang', 'msg', 'meets', 'noShow', 'setups', 'taped', 'code', 'found'] as const) P.stats[k] ??= 0;
  return P;
}

/** The upgradeSave step: a phone from an older build gets the fields added since (no calls are invented for the past). */
export function ensurePhoneSave(s: GameState): void {
  ensurePhone(s);
}

/** Keep the lists short: the save keeps a phone, not an exchange. */
export const LOG_MAX = 40;
export const MISSED_MAX = 12;

export function pushLog(P: PhoneState, e: CallLog): void {
  P.log.push(e);
  if (P.log.length > LOG_MAX) P.log.splice(0, P.log.length - LOG_MAX);
}

/** A wire lands on the boss's phones (threats.ts: the county's tap or the federal wire was not stopped). Mutates. */
export function wireIn(s: GameState, by: 'county' | 'fbi'): void {
  const P = ensurePhone(s);
  if (P.tap && P.tap.by === 'fbi') return;
  P.tap = { by, since: s.week };
}
