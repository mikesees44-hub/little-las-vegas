import { counsel, type CounselSubject, type Voice as CounselVoice } from '../../engine/counsel';
import type { GameState } from '../../engine/types';
import type { Voice } from './DecisionCard';

/** A line of counsel without the quote marks it may already carry (the card adds its own). */
export function bareQuote(x: string): string {
  return x.trim().replace(/^["“”']+|["“”']+$/g, '').trim();
}

/** Underboss and consigliere first, then whoever else sits at the table on this (at most three);
 * two people saying the same words is one voice (the playtest saw three identical "Don't"s). */
export function pickVoices(vs: CounselVoice[]): CounselVoice[] {
  const order = (v: CounselVoice) => (v.adviser.role === 'underboss' ? 0 : v.adviser.role === 'consigliere' ? 1 : 2);
  const seen = new Set<string>();
  return [...vs].sort((a, b) => order(a) - order(b)).filter((v) => {
    const k = bareQuote(v.says).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}

/** The card's voices: one line each, the ones who disagree kept (never a "best" badge). */
export function voicesFor(s: GameState, sub: CounselSubject): Voice[] {
  let vs: CounselVoice[] = [];
  try { vs = pickVoices(counsel(s, sub)?.voices ?? []); } catch { vs = []; }
  return vs.map((v) => ({
    who: `${v.adviser.title} ${v.adviser.name.split(' ')[0]}`,
    says: `${bareQuote(v.says)}${v.backsLabel ? ` (${v.backsLabel})` : ''}`,
    tone: v.verdict === 'do' || v.verdict === 'doBut' ? 'do' : v.verdict === 'dont' ? 'dont' : 'wait',
  }));
}
