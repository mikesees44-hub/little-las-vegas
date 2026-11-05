import { displayName } from '../characters';
import { cloneState } from '../engine';
import { bumpTension } from '../intrigue';
import { journal } from '../journal';
import { addOpinion } from '../relations';
import { ensureTalks, logTalk, type Pact } from '../talks';
import type { GameState, RivalId } from '../types';
import { FACTION_NAMES } from '../world';
import { noteBroken, noteWordTravels } from './familyWord';

/**
 * BREAKING YOUR WORD, ON PURPOSE. An explicit action on a pact the boss
 * shook on (break the truce, stop paying, move into the district): the
 * confirm spells out the cost before he does it, and the cost is real.
 * Your word drops with every family (word gets around), Philadelphia thinks
 * less of you, and that family has cause for war (their boss's opinion and
 * the tension between the houses, intrigue.ts, which is what takes a family
 * to the mattresses). Pure.
 */

export const BREAK_PHILLY = -10;
export const BREAK_OPINION = -25;
export const BREAK_TENSION = 35;

/** The verb on the button. */
export function breakLabel(p: Pact): string {
  switch (p.kind) {
    case 'truce': return 'Break the truce';
    case 'alliance': return 'Break the alliance';
    case 'partnership': return 'Walk out on the partnership';
    case 'tribute': return 'Stop paying';
    case 'handsoff': return p.bound === 'player' ? 'Move into the district' : 'Release them from their word';
    case 'split': return p.payer === 'player' ? 'Stop paying the split' : 'End the split';
    case 'muscle': return p.payer === 'player' ? 'Call your men back' : 'Send their men home';
  }
}

/** Pacts the boss can break: his own with a family, in force. Releasing a family from its own promise is not breaking yours. */
export function breakablePacts(s: GameState, rival?: string): Pact[] {
  return (s.talks?.pacts ?? []).filter((p) => p.a === 'player' && p.until > s.week && (!rival || p.b === rival) && !(p.kind === 'handsoff' && p.bound !== 'player'));
}

/** What breaking it costs, line by line (the confirm). */
export function breakCost(s: GameState, pactId: string): string[] {
  const p = breakablePacts(s).find((x) => x.id === pactId);
  if (!p) return [];
  const fam = FACTION_NAMES[p.b as RivalId] ?? p.b;
  const out = [
    `Your word with ${fam} is broken (it counts heavily against you with them).`,
    'Your word with every other family drops too: word gets around.',
    `Philadelphia thinks less of you (${BREAK_PHILLY}).`,
    `${fam} has cause for war: their boss ${BREAK_OPINION}, tension between the houses +${BREAK_TENSION}.`,
  ];
  if (p.kind === 'truce' || p.kind === 'alliance' || p.kind === 'partnership' || p.kind === 'tribute') out.push(`${fam} is free to move on you again.`);
  return out;
}

export function breakPact(input: GameState, pactId: string): { state: GameState; ok: boolean; text: string } {
  const p0 = breakablePacts(input).find((x) => x.id === pactId);
  if (!p0) return { state: input, ok: false, text: 'No such pact in force' };
  const s = cloneState(input);
  const t = ensureTalks(s);
  const p = t.pacts.find((x) => x.id === pactId)!;
  const rival = p.b as RivalId;
  const fam = FACTION_NAMES[rival] ?? rival;
  p.until = s.week - 1;
  noteBroken(s, rival, `you broke the ${p.kind} on purpose`);
  noteWordTravels(s);
  const r = s.rivals.find((x) => x.id === rival);
  const boss = r ? s.characters[r.leaderId] : undefined;
  if (boss?.alive) addOpinion(s, boss.id, s.playerId, `Broke the ${p.kind} with us`, BREAK_OPINION, 1);
  const ph = s.rivals.find((x) => x.id === 'philly');
  if (ph && s.characters[ph.leaderId]?.alive && ph.id !== rival) addOpinion(s, ph.leaderId, s.playerId, 'Broke his word to a family', BREAK_PHILLY, 1);
  bumpTension(s, 'player', rival, BREAK_TENSION, `You broke the ${p.kind}`);
  s.flags[`wronged_${rival}`] = s.week;
  const text = `You broke your word to ${fam}: ${breakLabel(p).toLowerCase()}.`;
  logTalk(s, text, 'pact', boss?.id);
  journal(s, { t: text, x: `${p.terms}. ${breakCost(input, pactId).join(' ')}`, ...(boss ? { p: [boss.id] } : {}), c: 'rivals', src: 'talk', ln: 'diplomacy.pacts', mine: 1 });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${boss ? displayName(boss) : fam} will not forget: you broke the ${p.kind}.`, kind: 'rival' });
  return { state: s, ok: true, text };
}
