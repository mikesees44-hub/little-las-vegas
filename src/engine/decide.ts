import type { ActionPreview } from './actions';
import type { Acceptance } from './interactions';
import type { Choice, Effect, GameState } from './types';

/**
 * ONE DECISION STANDARD (STREAMLINE §4.1), the pure half: what every option
 * of every decision shows, whatever screen it is on.
 *  - Odds on every option: the engine's chance and its top reasons, or, when
 *    nothing is rolled, "certain" (it happens as written) or "no roll"
 *    (nothing happens: waiting, letting it go, a game you play yourself).
 *  - The worst way it can go, always: the disaster tier, his answer if he
 *    says no, what a failure costs. Failure has a face.
 *  - The stakes up front: what is on the line across all the options.
 * The UI half is ui/decide/DecisionCard.tsx.
 */

export interface OddsView {
  /** The engine rolls for it. */
  known: boolean;
  /** 0..1 when known. */
  chance?: number;
  /** "He says yes", "It works", "certain", "no roll". */
  label: string;
  /** The reasons behind the odds, biggest first (the card shows three; tap for all). */
  reasons: { label: string; value: number }[];
}

export interface WorstView {
  /** "Disaster · 8%", "If he says no", "If it fails". */
  label: string;
  /** 0..1 when known. */
  chance?: number;
  text?: string;
  effects: Effect[];
}

const byWeight = (r: { label: string; value: number }[]) => r.filter((x) => x.label !== 'Base' && x.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.label.localeCompare(b.label));

function fromAcceptance(a: Acceptance, label: string): OddsView {
  return { known: true, chance: Math.max(0, Math.min(1, a.chance)), label, reasons: byWeight(a.reasons) };
}

/** Odds of an order (its preview): consent, a roll, the deed's tiers; else certain. */
export function oddsOfPreview(p: ActionPreview): OddsView {
  if (p.acceptance) return fromAcceptance(p.acceptance, p.oddsLabel ?? 'He says yes');
  if (p.odds) return fromAcceptance(p.odds, p.oddsLabel ?? 'It works');
  if (p.outcomes?.length) {
    const ok = p.outcomes.filter((o) => o.tier === 'crit' || o.tier === 'success').reduce((n, o) => n + o.chance, 0);
    return { known: true, chance: ok, label: 'It works', reasons: [] };
  }
  return { known: false, label: p.effects.length || p.cost ? 'certain' : 'no roll', reasons: [] };
}

/** The worst way an order can go, when it can go more than one way. */
export function worstOfPreview(p: ActionPreview): WorstView | undefined {
  if (p.outcomes && p.outcomes.length > 1) {
    const w = p.outcomes.find((o) => o.tier === 'critFail') ?? p.outcomes[p.outcomes.length - 1];
    return { label: w.label, chance: w.chance, text: w.text, effects: w.effects };
  }
  const odds = p.acceptance ?? p.odds;
  if (!odds) return undefined;
  const miss = Math.max(0, 1 - odds.chance);
  if (p.acceptance) return { label: 'If the answer is no', chance: miss, effects: p.refuseEffects ?? [], text: p.refuseEffects?.length ? undefined : 'Nothing comes of it; what you put in is spent.' };
  return { label: 'If it fails', chance: miss, effects: p.refuseEffects ?? [], text: p.warning ?? 'What you put in is spent, and nothing comes of it.' };
}

/** A decision's choice (events): a game you play has no fixed odds; the rest happen as written. */
export function oddsOfChoice(c: Choice): OddsView {
  if (c.effects.some((e) => e.type === 'minigame')) return { known: false, label: 'no roll: you play it out', reasons: [] };
  if (!c.effects.some((e) => e.type !== 'schedule')) return { known: false, label: c.effects.length ? 'certain' : 'no roll', reasons: [] };
  return { known: false, label: 'certain', reasons: [] };
}

/** What may follow a choice (its scheduled consequences), the worst first; its costs when nothing follows. */
export function worstOfChoice(c: Choice): WorstView | undefined {
  const later = c.effects.filter((e): e is Extract<Effect, { type: 'schedule' }> => e.type === 'schedule').sort((a, b) => b.chance - a.chance);
  if (later.length) return { label: 'It may come back', chance: later[0].chance, text: later.map((x) => `${x.hint}${x.chance < 1 ? ` (${Math.round(x.chance * 100)}%)` : ''}`).join(' · '), effects: [] };
  return undefined;
}

/** The effects that hurt (the chips a "what it costs" line shows). */
export function costsOf(effects: readonly Effect[]): Effect[] {
  return effects.filter((e) =>
    (e.type === 'money' && e.amount < 0) || (e.type === 'respect' && e.amount < 0) || (e.type === 'heat' && e.amount > 0) || e.type === 'kill' || e.type === 'imprison' || e.type === 'evidence'
    || ((e.type === 'opinion' || e.type === 'crewOpinion' || e.type === 'familyOpinion' || e.type === 'rivalOpinion') && e.amount < 0));
}

/** What is on the line across a decision's options: a life, the most money, standing, the people whose opinion moves, heat. */
export function stakesLine(s: GameState, options: readonly (readonly Effect[])[]): string[] {
  const out: string[] = [];
  const all = options.flat();
  if (all.some((e) => e.type === 'kill')) out.push('a man\'s life');
  if (all.some((e) => e.type === 'imprison')) out.push('a man\'s freedom');
  const money = Math.max(0, ...options.map((o) => Math.abs(o.filter((e) => e.type === 'money').reduce((n, e) => n + (e as { amount: number }).amount, 0))));
  if (money >= 100) out.push(`$${Math.round(money).toLocaleString('en-US')}`);
  if (all.some((e) => e.type === 'respect' && Math.abs(e.amount) >= 3)) out.push('your respect');
  const who = [...new Set(all.filter((e): e is Extract<Effect, { type: 'opinion' }> => e.type === 'opinion' && e.to === s.playerId && Math.abs(e.amount) >= 5).map((e) => e.from))];
  for (const id of who.slice(0, 2)) { const c = s.characters[id]; if (c) out.push(`${c.firstName}'s trust`); }
  if (all.some((e) => e.type === 'crewOpinion' && Math.abs(e.amount) >= 3)) out.push('the crew\'s loyalty');
  if (all.some((e) => e.type === 'heat' && e.amount >= 5)) out.push('heat');
  if (all.some((e) => e.type === 'rivalOpinion' || e.type === 'warStart' || e.type === 'feud')) out.push('peace with the families');
  return out.slice(0, 5);
}
