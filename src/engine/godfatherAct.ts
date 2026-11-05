import { practiceDeed } from './bossSkills';
import { applyEffects } from './effects';
import { cloneState } from './engine';
import { journal } from './journal';
import { newCtx } from './ledger';
import type { GameState } from './types';

/*
 * Kept apart from godfather.ts: effects.ts imports godfather.ts for the 'gf'
 * effect, and this needs the engine (cloneState), which would close the loop.
 */

/** Answer an offer now, from his sheet (pure): its effects land, it leaves the week's cards, and Your File has it. */
export function answerOffer(input: GameState, iid: string, choiceId: string): GameState {
  const ev = input.pendingEvents.find((e) => e.iid === iid);
  const ch = ev?.choices.find((c) => c.id === choiceId && !c.disabledReason);
  if (!ev || !ch) return input;
  const s = cloneState(input);
  s.pendingEvents = s.pendingEvents.filter((e) => e.iid !== iid);
  const ctx = newCtx(s);
  applyEffects(ctx, ch.effects, { label: `${ev.title}: ${ch.label}`, because: ch.because, category: 'event' });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You ${ch.because}.`, kind: 'decision' });
  practiceDeed(s, `${ev.title} ${ch.label} ${ch.because}`, 2);
  journal(s, { t: `${ev.title}: ${ch.label}`, x: `You ${ch.because}.`, p: ev.actors, c: 'family', src: 'gf', mine: 1, ...(s.days && s.days.week === s.week ? { d: s.days.day } : {}) });
  return s;
}
