import type { GameState, RivalId } from '../types';

/**
 * EACH FAMILY'S RECORD OF YOU, and YOUR WORD WITH THEM. A family remembers
 * the sit-downs (when, how it ended, what was agreed, the insults), the
 * deals you kept and the ones you broke, the pacts that ran their full term,
 * and the favors they came to collect. "Your word with them" (0..100) is read
 * off that record; it feeds their stance (minds/diplomacy.ts: how much a deal
 * must be worth), what your promises are worth to them (`dealValue`), the
 * prompt (he brings up the last sit-down) and the scripted lines.
 *
 * A leaf module (types only): talks.ts and diplomacy.ts both write here.
 * State is optional (`s.talks.rec`, `s.talks.wordAll`): an old save reads as
 * a clean slate.
 */

export interface SitMemo {
  /** Week, and the date for the words. */
  w: number;
  y: number;
  m: number;
  how: 'deal' | 'walkout' | 'left' | 'done';
  /** What was agreed (words), on a deal. */
  terms?: string;
  insults?: number;
  /** He came to you (an ask): what about. */
  agenda?: string;
}

export interface FamRecord {
  sits: SitMemo[];
  /** Deals you kept: pacts that ran their term, favors you did when they came to collect. */
  kept: number;
  /** Deals you broke: a pact broken, tribute missed, a hands-off promise you moved through. */
  broken: number;
  /** Favors they came to collect and you refused. */
  refused: number;
  /** Their own broken word (a hands-off they moved through). */
  theyBroke: number;
  /** The last thing that happened to your word with them, in words. */
  last?: string;
}

export const MAX_SITS = 6;

function talksOf(s: GameState) {
  return s.talks;
}

export function recordOf(s: GameState, rival: string): FamRecord | undefined {
  return talksOf(s)?.rec?.[rival];
}

/** The family's record, created on first write (needs `s.talks`). */
export function recordMut(s: GameState, rival: string): FamRecord {
  const t = s.talks!;
  t.rec ??= {};
  return (t.rec[rival] ??= { sits: [], kept: 0, broken: 0, refused: 0, theyBroke: 0 });
}

export function noteSit(s: GameState, rival: string, memo: Omit<SitMemo, 'w' | 'y' | 'm'>): void {
  if (!s.talks) return;
  const r = recordMut(s, rival);
  r.sits.push({ w: s.week, y: s.date.y, m: s.date.m, ...memo });
  if (r.sits.length > MAX_SITS) r.sits.splice(0, r.sits.length - MAX_SITS);
}

export function noteKept(s: GameState, rival: string, what: string): void {
  if (!s.talks) return;
  const r = recordMut(s, rival);
  r.kept++;
  r.last = what;
}

export function noteBroken(s: GameState, rival: string, what: string, refused = false): void {
  if (!s.talks) return;
  const r = recordMut(s, rival);
  if (refused) r.refused++; else r.broken++;
  r.last = what;
}

export function noteTheyBroke(s: GameState, rival: string): void {
  if (!s.talks) return;
  recordMut(s, rival).theyBroke++;
}

/** A broken word travels: every family marks it down (deliberately breaking a pact). */
export function noteWordTravels(s: GameState): void {
  if (!s.talks) return;
  s.talks.wordAll = (s.talks.wordAll ?? 0) + 1;
}

export interface WordPart { label: string; value: number }

/** Your word with a family, 0..100 (50: no record either way), and why. */
export function wordWith(s: GameState, rival: string): { score: number; parts: WordPart[]; text: string } {
  const r = recordOf(s, rival);
  const parts: WordPart[] = [];
  if (r?.kept) parts.push({ label: `Kept your word ${r.kept} time${r.kept === 1 ? '' : 's'}`, value: Math.min(30, r.kept * 6) });
  if (r?.broken) parts.push({ label: `Broke your word ${r.broken} time${r.broken === 1 ? '' : 's'}`, value: -Math.min(60, r.broken * 20) });
  if (r?.refused) parts.push({ label: `Refused ${r.refused} favor${r.refused === 1 ? '' : 's'} you owed`, value: -Math.min(30, r.refused * 10) });
  const ins = (r?.sits ?? []).slice(-3).reduce((a, x) => a + (x.insults ?? 0), 0);
  if (ins) parts.push({ label: 'Insults at the table', value: -Math.min(15, ins * 4) });
  const lastSit = r?.sits[r.sits.length - 1];
  if (lastSit?.how === 'walkout') parts.push({ label: 'He walked out last time', value: -4 });
  if (r?.theyBroke) parts.push({ label: 'They broke their own word to you', value: Math.min(10, r.theyBroke * 5) });
  const all = talksOf(s)?.wordAll ?? 0;
  if (all) parts.push({ label: 'Word gets around: you broke a pact', value: -Math.min(30, all * 8) });
  const score = Math.max(0, Math.min(100, Math.round(50 + parts.reduce((a, x) => a + x.value, 0))));
  return { score, parts, text: wordText(score) };
}

export function wordText(score: number): string {
  return score >= 75 ? 'solid' : score >= 58 ? 'good' : score >= 43 ? 'untested' : score >= 25 ? 'shaky' : 'worthless';
}

/** How much your promises (tribute, staying out, a favor owed) are worth to them: 0.5 .. 1.25. */
export function trustMult(s: GameState, rival: string): number {
  return 0.5 + wordWith(s, rival).score / 100 * 0.75;
}

/** One line he could say about the last time (fallback lines and the window): undefined without a record. */
export function lastTimeLine(s: GameState, rival: RivalId | string): string | undefined {
  const r = recordOf(s, rival);
  const sit = r?.sits[r.sits.length - 1];
  const word = wordWith(s, rival).score;
  if (!sit && !r?.last) return undefined;
  const kept = word >= 58 ? ' and you kept your word. I remember that.' : word < 35 ? ' and you broke your word. I remember that too.' : '.';
  if (sit?.how === 'deal') return `Last time we shook on ${sit.terms ?? 'a deal'}${kept}`;
  if (sit?.how === 'walkout') return `Last time I walked out on you${sit.insults ? ' after what you said' : ''}. Let's see if today is different.`;
  if (sit?.how === 'left') return 'Last time you walked out on me. You came back, at least.';
  if (sit) return `Last time we talked and got nowhere${word < 35 ? ', and since then you broke your word' : ''}.`;
  return r?.last ? `I remember: ${r.last}.` : undefined;
}

/** The record in short, for the prompt and the family card. */
export function recordSummary(s: GameState, rival: string): string {
  const r = recordOf(s, rival);
  const w = wordWith(s, rival);
  const bits: string[] = [`His word with you: ${w.score}/100 (${w.text})`];
  if (r) {
    if (r.kept || r.broken || r.refused) bits.push(`deals kept ${r.kept}, broken ${r.broken}${r.refused ? `, favors refused ${r.refused}` : ''}`);
    const sit = r.sits[r.sits.length - 1];
    if (sit) bits.push(`last sit-down week ${sit.w}: ${sit.how === 'deal' ? `shook on ${sit.terms ?? 'a deal'}` : sit.how === 'walkout' ? 'you walked out on him' : sit.how === 'left' ? 'he walked out on you' : 'no deal'}${sit.insults ? `, ${sit.insults} insult${sit.insults === 1 ? '' : 's'}` : ''}`);
  }
  return bits.join('; ');
}
