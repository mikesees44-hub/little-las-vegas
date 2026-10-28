import { isIncapable } from './aging';
import { isFree } from './characters';
import { holder, SEAT_INFO } from './council';
import { isMade } from './hierarchy';
import type { Character, Effect, GameState, Seat } from './types';

/**
 * CENTRAL ELIGIBILITY for appointments. One function says whether a man can
 * take a council seat, and one builds the preview. Every entry point uses
 * them: the council's Appoint button, the sheet's "Seat him as …" menu and
 * the "Make him underboss" promotion. An appointment means the same thing,
 * with the same permission and cost, wherever it is clicked.
 *
 * Rank, seat and district are separate records (Character.rank,
 * s.council[seat].holderId, District.capoId). The underboss and consigliere
 * seats are also ranks: the `seat` effect keeps the two in step, and takes a
 * capo's district off him. The bagman, enforcer and fixer are jobs a man
 * holds while keeping his rank.
 */

export interface Eligibility {
  /** Why he can't be appointed (undefined: he can). */
  why?: string;
  /** The man who loses the seat if this goes through. */
  replaces?: Character;
}

/** Seats that are also a rank: only a made man can hold them. */
export const RANK_SEATS: readonly Seat[] = ['underboss', 'consigliere'];

export function seatEligibility(s: GameState, seat: Seat, charId: string): Eligibility {
  const c = s.characters[charId];
  if (!c || !c.alive || c.faction !== 'player' || c.id === s.playerId || c.rank === 'civilian') return { why: 'Not one of your men' };
  if (!isFree(s, c)) return { why: 'He is in jail' };
  if (isIncapable(s, c.id)) return { why: 'He can no longer look after his own affairs (Incapable)' };
  if (s.council?.[seat]?.holderId === c.id) return { why: `He is already the ${SEAT_INFO[seat].name.toLowerCase()}` };
  if (RANK_SEATS.includes(seat) && !isMade(c)) return { why: `Only a made man can be ${SEAT_INFO[seat].name.toLowerCase()}` };
  const prev = holder(s, seat);
  return { replaces: prev && prev.id !== c.id ? prev : undefined };
}

export interface SeatPreview {
  title: string;
  detail: string;
  effects: Effect[];
  because: string;
  disabledReason?: string;
  warning?: string;
}

/** The one preview for putting a man in a seat (the effect is the `seat` effect, applied in effects.ts). */
export function seatPreview(s: GameState, seat: Seat, charId: string): SeatPreview {
  const c = s.characters[charId];
  const info = SEAT_INFO[seat];
  const el = seatEligibility(s, seat, charId);
  const name = info.name.toLowerCase();
  const who = c?.firstName ?? '?';
  const prev = el.replaces;
  const title = prev ? `Make ${who} ${name} in ${prev.firstName}'s place` : `Make ${who} ${name}`;
  const label = `Appoint ${who} ${name}`;
  const rankNote = RANK_SEATS.includes(seat)
    ? ` It is a rank as well as a seat: he becomes ${name}${c?.rank === 'capo' ? ' and gives up his district' : ''}.`
    : ' He keeps his rank; the seat is a job on top of it.';
  return {
    title,
    detail: `${info.blurb} Uses his ${info.skill} (${c?.attributes[info.skill] ?? 0}).${rankNote}`,
    effects: c ? [{ type: 'seat', seat, charId: c.id, label }] : [],
    because: `made ${who} ${name}`,
    disabledReason: el.why,
    warning: prev ? `${prev.firstName} ${prev.lastName} loses the seat and holds it against you (−15 opinion)${RANK_SEATS.includes(seat) ? `, and goes back to soldier` : ''}.` : undefined,
  };
}

/** Places (map, street, walk and interior cards): the same central check, in placeEligibility.ts. */
export { placeActions, placeAction, placeCondition, isOperating, placeOwnerLabel, placeRunByLabel } from './placeEligibility';
