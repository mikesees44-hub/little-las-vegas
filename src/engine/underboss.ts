import { attr } from './attrs';
import { hasTrait } from './characters';
import { honesty } from './ledgerbook';
import { opinion } from './relations';
import { ubSkill, ubType } from './tribute';
import { ensureTribute, type UbType } from './tributeState';
import type { Character, GameState } from './types';

/**
 * THE UNDERBOSS AS A PERSON (module 9; the seam for a shadow court).
 *
 * `ubProfile` gathers everything that makes him who he is, from the records:
 * financial skill, judgment, loyalty (his opinion of the Don), ambition,
 * honesty, reputation (standing among the earners), his own money, his
 * relationship history (favors he did and received), competing obligations
 * (whom he owes), and his career goal. The goal is chosen once per man from
 * his nature and kept (`tribute.ubGoals`), so it never flips week to week.
 *
 * `tribute.ub.helped` is the persistent patronage record of the sitting
 * underboss (who he helped, how often, how much, and whether the Don knew),
 * kept apart from the capped favor list; `tribute.ubHist` remembers every man
 * who held the envelope and how his time ended. What is TRUE (the favor),
 * what was SAID (his report) and what each man BELIEVES are kept apart on the
 * Favor's Telling and the MemberLine (truth / said / believed / revealed).
 */

/** What he wants out of his life in the family (the next spec's legacy ambitions). */
export type UbGoal = 'serve' | 'become_boss' | 'kingmaker' | 'get_out' | 'get_rich';

export const UB_GOAL_LABEL: Record<UbGoal, string> = {
  serve: 'serve his Don and retire with honor',
  become_boss: 'sit in the chair himself one day',
  kingmaker: 'decide who sits in the chair (and run it from beside him)',
  get_out: 'keep his children out of this life',
  get_rich: 'get rich and stay rich',
};

export interface HelpedRecord {
  n: number;
  amount: number;
  last: number;
  /** Favors the Don was not told about. */
  unknownToDon: number;
}

export interface UbRecord {
  id: string;
  from: number;
  to: number;
  /** How it ended: replaced, died, resigned, removed. */
  ended: string;
  base: number;
  favors: number;
  goal?: UbGoal;
}

export interface UbProfile {
  id: string;
  type: UbType;
  financialSkill: number;
  judgment: number;
  loyalty: number;
  ambition: number;
  honesty: number;
  reputation: number;
  wealth: number;
  goal: UbGoal;
  /** Favors he did, by whom (most first). */
  helped: [string, HelpedRecord][];
  /** Men he owes (favors done for him). */
  owes: string[];
  callsFirst: string[];
  authority: string;
  disagreements: number;
  /** Weeks he has carried the envelope. */
  tenure: number;
}

function pickGoal(s: GameState, c: Character): UbGoal {
  const amb = attr(s, c, 'ambition');
  const loy = attr(s, c, 'loyalty');
  const greed = attr(s, c, 'greed');
  const kids = (c.household?.kids?.length ?? 0) + (c.childrenIds?.length ?? 0);
  if (hasTrait(c, 'Loyal-to-a-fault') || (loy >= 70 && amb < 55)) return 'serve';
  if (c.goal === 'take_chair' || hasTrait(c, 'Ambitious') || amb >= 72) return attr(s, c, 'patience') >= 65 && attr(s, c, 'manipulation') >= 55 ? 'kingmaker' : 'become_boss';
  if (c.goal === 'get_out' || (kids >= 2 && attr(s, c, 'conscience') >= 60)) return 'get_out';
  if (hasTrait(c, 'Greedy') || greed >= 65 || c.goal === 'get_rich') return 'get_rich';
  return amb >= 55 ? 'kingmaker' : 'serve';
}

/** His career goal, chosen once from his nature and remembered. */
export function ubGoal(s: GameState, c: Character): UbGoal {
  const t = ensureTribute(s);
  t.ubGoals ??= {};
  return (t.ubGoals[c.id] ??= pickGoal(s, c));
}

/** A new man carries the envelope: remember the last one. */
export function closeUbRecord(s: GameState, ended: string): void {
  const t = ensureTribute(s);
  const id = t.ub.id;
  if (!id) return;
  t.ubHist ??= [];
  t.ubHist.push({ id, from: t.ub.since, to: s.week, ended, base: Math.round(t.ub.base), favors: Object.values(t.ub.helped ?? {}).reduce((a, h) => a + h.n, 0), goal: t.ubGoals?.[id] });
  if (t.ubHist.length > 20) t.ubHist.shift();
}

export function ubProfile(s: GameState, c: Character): UbProfile {
  const t = ensureTribute(s);
  const sitting = t.ub.id === c.id;
  const helped = Object.entries(sitting ? t.ub.helped ?? {} : {}).sort((a, b) => b[1].n - a[1].n);
  const owes = Array.from(new Set(t.favors.filter((f) => f.toId === c.id).map((f) => f.byId)));
  return {
    id: c.id,
    type: ubType(s, c, false),
    financialSkill: Math.round(ubSkill(s, c) * 100),
    judgment: attr(s, c, 'judgment'),
    loyalty: Math.round(opinion(s, c.id, s.playerId)),
    ambition: attr(s, c, 'ambition'),
    honesty: Math.round(honesty(s, c)),
    reputation: sitting ? Math.round(t.ub.base) : 0,
    wealth: Math.round(c.wealth),
    goal: ubGoal(s, c),
    helped,
    owes,
    callsFirst: sitting ? t.ub.callsFirst : [],
    authority: t.ub.authority ?? 'routine',
    disagreements: sitting ? t.ub.disagreements : 0,
    tenure: sitting ? s.week - t.ub.since : 0,
  };
}
