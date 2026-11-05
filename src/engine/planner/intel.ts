import { pctRead } from '../adviceBrief';
import { attr } from '../attrs';
import { displayName, isFree } from '../characters';
import { holder } from '../council';
import { opinion } from '../relations';
import { isPoliceKind, KIND_LABEL, tipOut, whenText, type SourceKind, type Tip } from '../threats';
import { today } from '../days';
import type { GameState, PlayerAction } from '../types';
import { slantOf } from './gateCore';

/**
 * WHAT THE DON IS TOLD, AND HOW SURE HIS PEOPLE ARE. A threat line in the brief is a claim from a
 * source, never the truth: the consigliere grades the source (A reliable … D not usually reliable, the
 * way an intelligence service grades a report) and says how sure he is (confirmed, likely, rumor).
 * The grade is read off what the source IS (his place, his loyalty, his wits), as the threat layer itself
 * rates him, and the consigliere's own judgment colours it. So a planted story from a loyal-looking
 * man can come in as "likely", and a true one from the night clerk as a "rumor": the brief can be wrong
 * when the sources are bad, as it should be.
 */

export type Conf = 'confirmed' | 'likely' | 'rumor';
export const CONF_LABEL: Record<Conf, string> = { confirmed: 'Confirmed', likely: 'Likely', rumor: 'Rumor' };

/** Where a line of the brief (or an entry of the book) takes the boss. */
export interface Go {
  event?: string;
  tip?: string;
  day?: number;
  brief?: string;
  char?: string;
  tab?: string;
  file?: true;
  audience?: true;
  datebook?: true;
  phone?: { who?: string };
  order?: PlayerAction;
  office?: true;
  sitdown?: true;
}

export interface SourceGrade { q: number; grade: 'A' | 'B' | 'C' | 'D'; word: string }

const BASE: Record<SourceKind, number> = { underboss: 0.75, consigliere: 0.8, capo: 0.7, soldier: 0.55, cop: 0.7, official: 0.6, ear: 0.65, street: 0.5 };
const GRADE_WORD = { A: 'reliable', B: 'usually reliable', C: 'fairly reliable', D: 'not usually reliable' } as const;

/** The source's reliability as his place, loyalty and wits make it (the threat layer's own rating). */
export function sourceGrade(s: GameState, t: Pick<Tip, 'sourceId' | 'sourceKind' | 'kind'>): SourceGrade {
  const c = s.characters[t.sourceId];
  let loyalty = 10;
  let wits = 45;
  if (c) { loyalty = opinion(s, c.id, s.playerId); wits = c.attributes.intrigue; }
  else if (t.sourceId.startsWith('pol:')) {
    const id = t.sourceId.slice(4);
    const ctl = s.pol?.ctl[id];
    const p = s.pol?.people[id];
    if (ctl) loyalty = Math.round((ctl.financial + ctl.personal) / 2 - ctl.resentment);
    if (p) wits = p.competence;
  }
  let q = BASE[t.sourceKind] + loyalty / 250 + (wits - 45) / 200;
  if (t.sourceKind === 'cop' && (isPoliceKind(t.kind) || t.kind === 'setup')) q += 0.15;
  q = Math.max(0.25, Math.min(0.95, q));
  const grade = q >= 0.8 ? 'A' : q >= 0.65 ? 'B' : q >= 0.5 ? 'C' : 'D';
  return { q, grade, word: GRADE_WORD[grade] };
}

/** Who reads the reports: the consigliere, else the boss himself (with more guesswork). */
export function reader(s: GameState) {
  const cons = holder(s, 'consigliere');
  const c = cons && isFree(s, cons) && cons.id !== s.playerId ? cons : undefined;
  return c ?? s.characters[s.playerId];
}

export interface TipRead { conf: Conf; est: number; src: SourceGrade; corroborated: boolean; by: string }

/** How sure the house is of a warning: the source's grade read by the consigliere, a second source, a meeting. */
export function tipConfidence(s: GameState, t: Tip): TipRead {
  const src = sourceGrade(s, t);
  const r = reader(s);
  const skill = r ? (attr(s, r, 'judgment') + attr(s, r, 'awareness')) / 2 : 40;
  let est = r ? pctRead(r, `brief:${t.id}`, skill, src.q) / 100 : src.q;
  const T = s.threats;
  const corroborated = !!T?.tips.some((o) => o.id !== t.id && o.sourceId !== t.sourceId && o.kind === t.kind && o.by === t.by && (o.targetId ?? o.bizId ?? o.district) === (t.targetId ?? t.bizId ?? t.district) && o.status !== 'done');
  if (corroborated) est += 0.15;
  if (t.status === 'met' || t.status === 'sent') est += 0.08;
  est = Math.max(0.05, Math.min(0.97, est));
  // A turned gatekeeper types the brief (gateCore.ts slantOf): a real warning against the boss comes in as a rumor, a planted story as confirmed.
  const sl = slantOf(s, t);
  if (sl === 'down') est = Math.min(est, 0.4);
  if (sl === 'up') est = Math.max(est, 0.86);
  const conf: Conf = est >= 0.8 ? 'confirmed' : est >= 0.58 ? 'likely' : 'rumor';
  return { conf, est, src, corroborated, by: r ? displayName(r) : 'You' };
}

/** The warnings the house knows about (out on the clock, not settled). */
export function knownTips(s: GameState): Tip[] {
  return (s.threats?.tips ?? []).filter((t) => tipOut(s, t) && t.status !== 'done' && t.status !== 'missed' && t.status !== 'ignored' && t.deadline >= s.week);
}

export function byName(s: GameState, by: Tip['by']): string {
  if (by === 'police') return 'The county detectives';
  if (by === 'fbi') return 'The FBI';
  return s.rivals.find((r) => r.id === by)?.shortName ?? 'Somebody';
}

/** "Manno: A hit · Friday night, 2 a.m. (3 days)" */
export function tipLine(s: GameState, t: Tip): { text: string; when: string; days?: number } {
  const days = t.dueDay !== undefined ? (t.deadline - s.week) * 7 + t.dueDay - today(s) : undefined;
  const when = t.dueDay !== undefined ? `${whenText(t.dueDay, t.hour)}${t.deadline > s.week ? ' next week' : ''}` : t.deadline <= s.week ? 'this week' : `within ${t.deadline - s.week} weeks`;
  const tgt = t.targetId && s.characters[t.targetId] ? (t.targetId === s.playerId ? 'you' : s.characters[t.targetId].firstName) : undefined;
  const biz = t.bizId ? s.businesses.find((b) => b.id === t.bizId)?.name : undefined;
  return { text: `${byName(s, t.by)}: ${KIND_LABEL[t.kind].toLowerCase()}${tgt ? ` on ${tgt}` : biz ? ` at ${biz}` : ''}`, when, days };
}
