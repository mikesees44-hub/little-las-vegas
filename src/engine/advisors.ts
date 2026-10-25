import { displayName, hasTrait, relatives } from './characters';
import { holder } from './council';
import type { Candidate, Ranking } from './candidates';
import { opinion } from './relations';
import type { Character, GameState, Seat } from './types';

/**
 * Advisor voices. The consigliere and the underboss each give a one-line
 * recommendation, in character. They are not neutral: each scores the
 * candidates with his own interests mixed in — his friends, his own men,
 * his kin, himself — more so when he is greedy or ambitious or cool toward
 * you. His opinion of the man he backs is shown, so the player can tell
 * advice from lobbying.
 */

export type AdvisorSeat = Extract<Seat, 'consigliere' | 'underboss'>;

export interface AdvisorAdvice {
  advisorId: string;
  advisorName: string;
  seat: AdvisorSeat;
  pickId: string;
  pickName: string;
  /** The line, in his voice. */
  quote: string;
  /** He is steering you away from the best pick for his own reasons. */
  biased: boolean;
  /** What he thinks of the man he backs. */
  opinionOfPick: number;
  /** Why he might be partial: "his own capo", "his nephew", "his friend (+45)". */
  tie?: string;
  /** How much his own interest weighs, 0..1. */
  selfInterest: number;
  agrees: boolean;
}

/** How much a man lets his own interests into his advice (0..0.8). */
export function selfInterest(s: GameState, a: Character): number {
  let w = 0.2;
  if (hasTrait(a, 'Greedy')) w += 0.25;
  if (hasTrait(a, 'Ambitious')) w += 0.2;
  if (hasTrait(a, 'Gambler')) w += 0.05;
  if (hasTrait(a, 'Honest')) w -= 0.15;
  if (hasTrait(a, 'Loyal-to-a-fault')) w -= 0.1;
  const op = opinion(s, a.id, s.playerId);
  if (op < 0) w += Math.min(0.25, -op / 200);
  return Math.max(0, Math.min(0.8, w));
}

/** Why an advisor might favour this man. */
export function tieTo(s: GameState, a: Character, c: Character, wantsIt = false): { text: string; bonus: number } | undefined {
  // He only puts himself forward for a step up; otherwise he'd be leaving his own seat.
  if (a.id === c.id) return wantsIt ? { text: 'himself', bonus: 60 } : { text: 'himself', bonus: -400 };
  const kin = relatives(s, a).find((r) => r.id === c.id);
  if (kin) return { text: `his own kin`, bonus: 45 };
  if (c.capoId === a.id) return { text: 'one of his own men', bonus: 35 };
  const op = opinion(s, a.id, c.id);
  if (op >= 30) return { text: `his friend (+${op})`, bonus: op * 0.6 };
  return undefined;
}

function firstName(s: GameState, c: Candidate): string {
  const ch = c.charId ? s.characters[c.charId] : undefined;
  return ch ? (ch.id === s.playerId ? 'yourself' : ch.nickname ?? ch.firstName) : c.name.replace(/ \(.*\)$/, '');
}

const MONEY_ROLES = new Set(['manager', 'keeper', 'capo', 'make', 'official']);

function line(s: GameState, a: Character, pick: Candidate, biased: boolean, self: boolean, roleKind: string, seat?: string): string {
  const who = self ? 'me' : firstName(s, pick);
  const she = pick.charId && s.characters[pick.charId]?.gender === 'F';
  const money = MONEY_ROLES.has(roleKind) || seat === 'bagman';
  const pro = pick.pros[0]?.text ?? '';
  // "Honest: won't skim" → "honest"; but keep "Can do: a pardon" whole (the head alone says nothing).
  const head = pro.replace(/:.*$/, '');
  const reason = (head.split(' ').length <= 2 && pro.includes(':') && /^(can|is|has|he)\b/i.test(head) ? pro : head).toLowerCase();
  const r = reason ? ` ${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` : '';
  if (self) return hasTrait(a, 'Ambitious') ? `"You want it done right? Give it to ${who}."` : `"If it's all the same to you, I'll take it on myself."`;
  if (hasTrait(a, 'Honest')) return `"${who[0].toUpperCase()}${who.slice(1)}.${r} I'd stake my name on it."`;
  if (hasTrait(a, 'Greedy')) return money ? `"Put ${who} on it. ${she ? 'She' : 'He'} knows where the money is.${biased ? ' Trust me.' : ''}"` : `"${who[0].toUpperCase()}${who.slice(1)}. The rest is talk.${biased ? ' Trust me.' : ''}"`;
  if (hasTrait(a, 'Hot-headed')) return `"${who[0].toUpperCase()}${who.slice(1)}, and let's stop talking about it."`;
  if (hasTrait(a, 'Paranoid')) return `"${who[0].toUpperCase()}${who.slice(1)}. The others — I don't know who they talk to."`;
  if (hasTrait(a, 'Charming')) return `"Everybody likes ${who}. That counts for something.${r}"`;
  if (hasTrait(a, 'Patient')) return `"Take your time. But when you decide, it's ${who}.${r}"`;
  if (hasTrait(a, 'Cruel')) return `"${who[0].toUpperCase()}${who.slice(1)}. Nobody crosses ${she ? 'her' : 'him'} twice."`;
  if (hasTrait(a, 'Pious')) return `"${who[0].toUpperCase()}${who.slice(1)}, God willing.${r}"`;
  return `"If you're asking me — ${who}.${r}"`;
}

/** One advisor's pick for a ranking, with his reasons and his bias. */
export function advisorPick(s: GameState, seat: AdvisorSeat, ranking: Ranking): AdvisorAdvice | undefined {
  const a = holder(s, seat);
  if (!a) return undefined;
  const ok = ranking.candidates.filter((c) => !c.disabledReason);
  if (!ok.length) return undefined;
  const w = selfInterest(s, a);
  // He backs himself for a step up, or to keep the seat he already has.
  const keeps = ranking.role.kind === 'seat' && s.council[ranking.role.seat]?.holderId === a.id;
  const stepUp = keeps || (ranking.role.kind === 'seat' && ranking.role.seat === 'underboss' && seat === 'consigliere') || ranking.role.kind === 'capo' || ranking.role.kind === 'heir';
  let best: { c: Candidate; v: number; tie?: string } | undefined;
  for (const c of ok) {
    const ch = c.charId ? s.characters[c.charId] : undefined;
    const t = ch ? tieTo(s, a, ch, stepUp) : undefined;
    const op = ch && ch.id !== a.id ? opinion(s, a.id, ch.id) : 0;
    const v = c.score + w * (op * 0.5 + (t?.bonus ?? 0));
    if (!best || v > best.v || (v === best.v && c.id < best.c.id)) best = { c, v, tie: t?.text };
  }
  const pick = best!.c;
  const pickChar = pick.charId ? s.characters[pick.charId] : undefined;
  const self = pickChar?.id === a.id;
  const biased = pick.id !== ranking.recommendedId;
  return {
    advisorId: a.id,
    advisorName: displayName(a),
    seat,
    pickId: pick.id,
    pickName: pick.name,
    quote: line(s, a, pick, biased, self, ranking.role.kind, ranking.role.kind === 'seat' ? ranking.role.seat : undefined),
    biased,
    opinionOfPick: pickChar && !self ? opinion(s, a.id, pickChar.id) : 0,
    tie: best!.tie,
    selfInterest: w,
    agrees: !biased,
  };
}

/** Both advisors' picks (whoever sits in the seats). */
export function advisorAdvice(s: GameState, ranking: Ranking): AdvisorAdvice[] {
  return (['consigliere', 'underboss'] as const).map((st) => advisorPick(s, st, ranking)).filter((x): x is AdvisorAdvice => !!x);
}
