import type { GameState, RivalId } from '../types';
import { FACTION_NAMES } from '../world';

/**
 * The families' asks as the Desk sees them (a leaf: types and names only, so
 * inbox.ts, attention.ts and desk.ts can read it without pulling in the
 * sit-down engine). The asks themselves are made and settled in
 * minds/familyAsks.ts.
 */

export type AskKind = 'grievance' | 'partnership' | 'tribute' | 'peace' | 'table' | 'collect';

/** What a family wants when it comes to collect a favor the boss owes (bounded; never a man's life). */
export type FavorKind = 'lookaway' | 'game' | 'vote' | 'muscle';

export interface FavorAsk {
  kind: FavorKind;
  district?: string;
  weeks?: number;
  /** A game in your territory: what it pays you a week. */
  cut?: number;
  /** Lend muscle: one or two of your men, busy for a week (never harmed, never handed over). */
  menIds?: string[];
  /** Vote with them at the Table: against whom. */
  against?: RivalId;
}

export interface FamAsk {
  id: string;
  rival: RivalId;
  kind: AskKind;
  /** The week it came in, and the last week it waits (it lapses when that week turns). */
  w: number;
  until: number;
  /** Their agenda, in his words. */
  text: string;
  district?: string;
  /** One of the boss's men it is about. */
  charId?: string;
  /** Their opening offer (validated again when the sit-down opens), and in words. */
  offer: { kind: string; amount?: number; district?: string; weeks?: number; dir?: 'them' | 'you' }[];
  offerText?: string;
  /** A favor they came to collect. */
  favor?: FavorAsk;
}

export const ASK_LABEL: Record<AskKind, string> = {
  grievance: 'a grievance', partnership: 'a partnership pitch', tribute: 'a demand for tribute', peace: 'a peace feeler', table: 'Philadelphia calls you both to the Table', collect: 'the favor you owe',
};

const dn = (s: GameState, id?: string) => s.districts.find((d) => d.id === id)?.name ?? 'the district';

export function openAsks(s: GameState): FamAsk[] {
  return (s.talks?.asks ?? []).filter((a) => a.until >= s.week);
}

/** The open ask from this family, if any. */
export function askFor(s: GameState, rival: string): FamAsk | undefined {
  return openAsks(s).find((a) => a.rival === rival);
}

/** What happens if the boss ignores it, in words. */
export function ignoreText(s: GameState, a: FamAsk): string {
  const fam = FACTION_NAMES[a.rival];
  switch (a.kind) {
    case 'grievance': return `${fam} takes it as an insult and moves on ${dn(s, a.district)} on its own`;
    case 'tribute': return `${fam} takes it as a no: tension rises, and they think less of you`;
    case 'peace': return 'the war goes on, and they will not ask again soon';
    case 'table': return 'Philadelphia marks it down: their view of you drops, family heat rises';
    case 'partnership': return `${fam} takes the business elsewhere, and thinks a little less of you`;
    case 'collect': return 'silence is a no: your word with every family who hears of it suffers, and they think much less of you';
  }
}

/** The title of the Desk row. */
export function askTitle(a: FamAsk): string {
  const fam = FACTION_NAMES[a.rival];
  if (a.kind === 'table') return `Philadelphia calls you and ${fam} to the Table`;
  if (a.kind === 'collect') return `${fam} comes to collect the favor you owe`;
  return `${fam} asks for a sit-down: ${ASK_LABEL[a.kind]}`;
}

/** One line for the Desk: the agenda and their opening. */
export function askWhy(_s: GameState, a: FamAsk): string {
  return `"${a.text}"${a.offerText ? ` Their opening: ${a.offerText}.` : ''}`;
}

/** Things the Desk lists as lapsing when the week turns (desk.ts lapsesThisWeek). */
export function askLapses(s: GameState): { key: string; title: string; what: string }[] {
  return openAsks(s).filter((a) => a.until <= s.week).map((a) => ({ key: `famask:${a.id}`, title: askTitle(a), what: `If you leave it: ${ignoreText(s, a)}. (Rivals ▸ The Board)` }));
}
