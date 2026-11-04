import { addDelegationRule, addHandlerHook } from './attention';
import { displayName, isFree } from './characters';
import { holder } from './council';
import { counsel } from './counsel';
import { stakesLine } from './decide';
import { applyPreset, ltView, presetOf, setAlways, type LtPreset, type LtState } from './lieutenants';
import type { Character, Effect, EventInstance, GameState } from './types';

/**
 * DELEGATION LEVEL (EASIER_NOT_SHALLOWER #5, #6): how much of the family the boss runs himself, as ONE
 * setting with three values, mapped onto what already exists:
 *
 *  - Hands-on: the "Hands-on" preset of the chain of command (lieutenants.ts): every proposal asks first,
 *    and nothing is settled for him.
 *  - Balanced (the default): the lieutenants and capos handle the routine; the lawyers, the other families,
 *    the Table and every big step wait for him. Nothing else changes.
 *  - Chairman: the "Chairman" preset (they run it, big steps too), plus "always do this" for the three kinds
 *    of routine: the envelope (the underboss's advice on the cut), the small asks (a routine decision,
 *    settled with the consigliere's recommendation) and the capos' morning problems (each capo his own way).
 *    Only real decisions reach him: a life, a man's freedom, a war, real money, a red one that lands now.
 *
 * Nothing is hidden: every item settled for him is on the Desk's "Handled for you" list, with who settles it
 * and how, and "Take it back" moves it to Needs you. The same "always do this" switches sit on the cards
 * themselves ("Do what the consigliere says", "always for small asks"), so a Hands-on boss can hand off one
 * kind of thing at a time.
 *
 * Saved in the lieutenants' record (`s.briefing.lt.always`, optional). Pure; no dice.
 */

export type DelegationLevel = 'hands' | 'balanced' | 'chairman';
export type AlwaysCat = keyof NonNullable<LtState['always']>;

export const DELEGATION: Record<DelegationLevel, { name: string; blurb: string; preset: LtPreset; always: AlwaysCat[] }> = {
  hands: { name: 'Hands-on', blurb: 'You see everything. Your people propose; you say yes or no.', preset: 'hands', always: [] },
  balanced: { name: 'Balanced', blurb: 'Your people handle the routine. The lawyers, the other families, the Table and every big step wait for you.', preset: 'balanced', always: [] },
  chairman: { name: 'Chairman', blurb: 'Your underboss and capos settle the routine with the consigliere\'s advice. Only real decisions reach you. All of it stays on the Handled for you list.', preset: 'run', always: ['envelopes', 'asks', 'mornings'] },
};
export const DELEGATION_IDS: DelegationLevel[] = ['hands', 'balanced', 'chairman'];

export const ALWAYS_LABEL: Record<AlwaysCat, { name: string; line: string }> = {
  envelopes: { name: 'The envelope', line: 'The underboss splits the envelope by his own advice, even on a week with a short or a petition' },
  asks: { name: 'Small asks', line: 'Routine decisions are settled the way the consigliere recommends' },
  mornings: { name: 'Morning problems', line: 'Every capo settles his own morning problems his way' },
};

/** The boss's level (undefined: his own mix of the switches). */
export function delegationLevel(s: GameState): DelegationLevel | undefined {
  const p = presetOf(s);
  if (!p) return undefined;
  const a = ltView(s).always ?? {};
  const on = (Object.keys(a) as AlwaysCat[]).filter((k) => a[k]);
  const lvl = DELEGATION_IDS.find((l) => DELEGATION[l].preset === p)!;
  // A preset with the wrong "always" switches is his own mix (Balanced plus "always for envelopes" stays Balanced: one card's shortcut).
  if (lvl === 'chairman') return on.length === 3 ? 'chairman' : undefined;
  if (lvl === 'hands') return on.length === 0 ? 'hands' : undefined;
  return 'balanced';
}

/** Set the level: the preset and its "always" switches (pure). */
export function setDelegation(s: GameState, lvl: DelegationLevel): GameState {
  let out = applyPreset(s, DELEGATION[lvl].preset);
  for (const c of ['envelopes', 'asks', 'mornings'] as AlwaysCat[]) out = setAlways(out, c, DELEGATION[lvl].always.includes(c));
  return out;
}

export function alwaysOn(s: GameState, c: AlwaysCat): boolean {
  return !!ltView(s).always?.[c];
}

/** The consigliere (else the underboss): whose recommendation the routine is settled by. */
export function counselor(s: GameState): Character | undefined {
  const c = holder(s, 'consigliere');
  if (c && isFree(s, c)) return c;
  const u = holder(s, 'underboss');
  return u && isFree(s, u) ? u : undefined;
}

const HEAVY = new Set<string>(['kill', 'imprison', 'exile', 'warStart', 'feud', 'legal', 'minigame', 'seat', 'startScheme', 'dispute', 'making', 'propose']);
/** A small ask's money ceiling: more than this either way and it is the boss's. */
export const SMALL_MONEY = 2500;

/** Why a decision is not routine (undefined: it is a small ask the consigliere may settle). */
export function notRoutine(s: GameState, ev: EventInstance): string | undefined {
  if (ev.mandatory) return 'it lands now';
  if (ev.defId === 'tribute_audience') return 'the envelope';
  if ((ev.priority ?? 0) >= 80) return 'it is big';
  const effs: Effect[] = ev.choices.flatMap((c) => c.effects ?? []);
  if (effs.some((e) => HEAVY.has(e.type))) return 'a life, a man\'s freedom, a war or the law';
  const money = ev.choices.map((c) => (c.effects ?? []).reduce((a, e) => a + (e.type === 'money' ? e.amount : 0), 0));
  if (money.length && Math.max(...money.map(Math.abs)) > SMALL_MONEY) return 'real money';
  if (effs.some((e) => e.type === 'respect' && Math.abs(e.amount) >= 5)) return 'your name on the street';
  const st = stakesLine(s, ev.choices.map((c) => c.effects ?? []));
  if (st.includes('peace with the families')) return 'peace with the families';
  return undefined;
}

export function routineEvent(s: GameState, ev: EventInstance): boolean {
  return !notRoutine(s, ev);
}

export interface CounselPick { choiceId: string; label: string; by: string; byId?: string }

/** The consigliere's pick on a decision (his voice at the table), else the table's, else the default. */
export function consiglierePick(s: GameState, ev: EventInstance): CounselPick | undefined {
  const man = counselor(s);
  const ok = (id?: string) => (id ? ev.choices.find((c) => c.id === id && !c.disabledReason) : undefined);
  let c = undefined as ReturnType<typeof ok>;
  try {
    const t = counsel(s, { kind: 'event', iid: ev.iid });
    if (t && man) c = ok(t.voices.find((v) => v.adviser.charId === man.id)?.backs);
    if (!c && t?.options?.length) c = ok([...t.options].filter((o) => !o.disabled).sort((a, b) => b.backers - a.backers || a.id.localeCompare(b.id))[0]?.id);
  } catch { c = undefined; }
  c ??= ok(ev.defaultChoiceId) ?? ev.choices.find((x) => !x.disabledReason);
  if (!c) return undefined;
  return { choiceId: c.id, label: c.label, by: man ? displayName(man) : 'Your people', byId: man?.id };
}

/** A small ask his people settle for him (the "always" switch is on and it is routine). */
export function delegatedAsk(s: GameState, ev: EventInstance | undefined): boolean {
  return !!ev && alwaysOn(s, 'asks') && routineEvent(s, ev);
}

/**
 * The answers his people give when the week turns, for what is settled for him: small asks by the
 * consigliere's pick, the envelope by the underboss's advice. Never an item he took back or answered.
 */
export function delegatedAnswers(s: GameState, answers: Record<string, string> = {}, taken: readonly string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  const asks = alwaysOn(s, 'asks');
  const env = alwaysOn(s, 'envelopes');
  if (!asks && !env) return out;
  for (const ev of s.pendingEvents) {
    if (answers[ev.iid] || taken.includes(`ev:${ev.iid}`)) continue;
    if (ev.defId === 'tribute_audience') {
      if (env && !taken.includes('envelope') && ev.choices.some((c) => c.id === 'his' && !c.disabledReason)) out[ev.iid] = 'his';
      continue;
    }
    if (asks && routineEvent(s, ev)) {
      const p = consiglierePick(s, ev);
      if (p) out[ev.iid] = p.choiceId;
    }
  }
  return out;
}

// The Desk: small asks and the envelope go to "Handled for you" when the switch is on, with who and how.
addDelegationRule((s, it) => !!it.ref.event && delegatedAsk(s, s.pendingEvents.find((e) => e.iid === it.ref.event)));
addDelegationRule((s, it) => it.kind === 'envelope' && alwaysOn(s, 'envelopes'));
addHandlerHook((s, it) => {
  if (it.ref.event) {
    const ev = s.pendingEvents.find((e) => e.iid === it.ref.event);
    if (!delegatedAsk(s, ev)) return undefined;
    const p = consiglierePick(s, ev!);
    return p ? { by: p.by, byId: p.byId, does: `as the consigliere says: ${p.label.toLowerCase()}`, day: 6 } : undefined;
  }
  if (it.kind === 'envelope' && alwaysOn(s, 'envelopes')) {
    const ev = s.pendingEvents.find((e) => e.defId === 'tribute_audience');
    const his = ev?.choices.find((c) => c.id === 'his');
    return his ? { by: 'Your underboss', does: his.label.toLowerCase(), day: 0 } : undefined;
  }
  return undefined;
});

/** Upgrade step: a saved "always" record keeps only switches that are on (loading never adds one). */
export function ensureDelegation(s: GameState): void {
  const lt = s.briefing?.lt;
  if (!lt?.always) return;
  const a: NonNullable<LtState['always']> = {};
  for (const c of ['envelopes', 'asks', 'mornings'] as AlwaysCat[]) if (lt.always[c]) a[c] = 1;
  if (Object.keys(a).length) lt.always = a; else delete lt.always;
}
