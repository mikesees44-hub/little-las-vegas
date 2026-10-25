import { hashSeed, rand, type RngHolder } from './rng';
import { director } from './storyDirector';
import type { Choice, Effect, EventInstance, GameState, PlayerChoices } from './types';

/**
 * PACING: fewer, better popups.
 *
 * The boss's desk gets about two things a week (a weekly "attention budget"
 * of 1-3 seats; mandatory beats always fit, up to MAX_POPUPS). Routine
 * business does not interrupt him: it is settled the way it usually is and
 * shows up as a line in the books and an "In motion" note in the week's
 * report:
 *  - a score brought in the ordinary way (your end comes in an envelope);
 *  - a sponsor putting his kid on a collection to make his bones;
 *  - a capo's light envelope (the consigliere starts asking questions);
 *  - a crew wedding or christening (the usual envelope goes with a driver);
 *  - a rival's deal you already answered (an accepted arrangement keeps
 *    paying; a refused one is not worth a meeting yet).
 * Something that is DIFFERENT this time (the first of its kind, a dispute
 * over the credit, a hit on the table, a new rival, a long silence) still
 * gets a popup.
 *
 * Its dice are its own (seeded from the game seed and the week), so pacing
 * never shifts the rest of the simulation's random stream.
 */

/** Weekly seat budget: P(1)=0.2, P(2)=0.6, P(3)=0.2 → about 2 seats, plus mandatory beats beyond it. */
export function weekBudget(s: GameState): number {
  if (s.week <= 2) return 3;
  const r = rand(paceRng(s, 'budget'));
  return r < 0.2 ? 1 : r < 0.8 ? 2 : 3;
}

export function paceRng(s: GameState, salt: string): RngHolder {
  return { rng: hashSeed(`${s.seed}:${s.week}:${salt}`) };
}

export interface QuietItem {
  title: string;
  because: string;
  note: string;
  effects: Effect[];
  category?: 'event' | 'kickup';
}

interface QuietRule {
  /** The choice that is "how it usually goes". */
  choice: string;
  /** The "In motion" note. */
  note: (ev: EventInstance, ch: Choice) => string;
  /** Is this one routine (may be settled quietly)? Defaults to: always. */
  routine?: (s: GameState, ev: EventInstance) => boolean;
  /** Keep only some of the choice's effects (an arrangement that carries on, not a new decision). */
  keep?: (e: Effect) => boolean;
}

const money = (ch: Choice) => ch.effects.filter((e): e is Extract<Effect, { type: 'money' }> => e.type === 'money').reduce((a, e) => a + e.amount, 0);
const $ = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const first = (ev: EventInstance) => ev.title.split(/[ ']/)[0];

const SCORE_IDS = ['crew_score', 'score_number', 'score_salvage', 'score_fight', 'score_lot', 'score_tourist'];

const RULES: Record<string, QuietRule> = {
  bones_offer: {
    choice: 'collection',
    // A hit on the table, or the first offer of the game, is worth the boss's time.
    routine: (s, ev) => !ev.choices.some((c) => c.id === 'hit') && seenTemplate(s, 'bones_offer'),
    note: (ev) => `${first(ev)} is out on a collection to make his bones; his sponsor vouches for the job.`,
  },
  aud_kickup: {
    choice: 'investigate',
    routine: (s) => seenTemplate(s, 'aud_kickup'),
    note: (ev) => `${ev.title.replace('The audience chamber: ', '')}. Questions are being asked, quietly.`,
  },
  crew_wedding: {
    choice: 'envelope',
    routine: (s) => seenTemplate(s, 'crew_wedding'),
    note: (ev, ch) => `${ev.title}. Your driver took the envelope to the hall (${$(money(ch))}).`,
  },
  crew_christening: {
    choice: 'gift',
    routine: (s) => seenTemplate(s, 'crew_christening'),
    note: (ev, ch) => `${ev.title}. A gift went to the house (${$(money(ch))}).`,
  },
  econ_bigscore: {
    choice: 'standard',
    routine: (s, ev) => ev.actors?.length === 1 && seenTemplate(s, 'econ_bigscore'),
    note: (_ev, ch) => `A big score came in the ordinary way: ${$(money(ch))} for the house.`,
  },
  card_game: { choice: 'decline', note: () => 'The card game in the back room went on without you.' },
};
for (const id of SCORE_IDS) {
  RULES[id] = {
    choice: 'end',
    routine: (s) => seenTemplate(s, id) || seenTemplate(s, 'crew_score'),
    note: (ev, ch) => `${ev.title}. Your end came in an envelope (${$(money(ch))}).`,
  };
}

function seenTemplate(s: GameState, id: string): boolean {
  return (s.director?.hist ?? []).some((h) => h[1] === id);
}

/** The deal a rival already had an answer to (an arrangement carrying on, or a door still shut). */
function dealRoutine(s: GameState, ev: EventInstance): QuietRule | undefined {
  if (!ev.defId.startsWith('deal_')) return undefined;
  const a = director(s).answers?.[ev.defId];
  if (!a || s.week - a[0] > 30) return undefined;
  const who = ev.title;
  if (a[1] === 'accept' && ev.choices.some((c) => c.id === 'accept')) {
    return {
      choice: 'accept',
      keep: (e) => e.type === 'money' || e.type === 'rivalOpinion',
      note: (_e, ch) => `${who}: the arrangement you made carries on${money(ch) ? ` (${money(ch) > 0 ? '+' : '−'}${$(money(ch))})` : ''}. Nobody needed a meeting.`,
    };
  }
  return { choice: '', keep: () => false, note: () => `${who}: they asked again through a cousin. Your answer has not changed, and nobody pressed it.` };
}

/** May this popup be settled quietly instead (routine), and how? */
export function quietRule(s: GameState, ev: EventInstance): QuietRule | undefined {
  if (ev.mandatory || ev.meta?.due) return undefined;
  const d = dealRoutine(s, ev);
  if (d) return d;
  const r = RULES[ev.defId];
  if (!r) return undefined;
  if (r.routine && !r.routine(s, ev)) return undefined;
  return r;
}

/** Settle a popup quietly: the usual answer goes on the books next to the week's ledger. */
export function settleQuietly(s: GameState, ev: EventInstance, rule: QuietRule): void {
  const ch = ev.choices.find((c) => c.id === (rule.choice || ev.defaultChoiceId)) ?? ev.choices.find((c) => c.id === ev.defaultChoiceId);
  if (!ch) return;
  const d = director(s);
  const effects = rule.keep ? ch.effects.filter(rule.keep) : ch.effects;
  (d.quiet ??= []).push({ title: ev.title, because: ch.because, note: rule.note(ev, ch), effects, category: ev.defId === 'econ_bigscore' ? 'kickup' : 'event' });
}

/** Has this week's routine already been decided (shown in the report)? */
export function takeQuiet(s: GameState): QuietItem[] {
  const d = s.director;
  if (!d?.quiet?.length) return [];
  const out = d.quiet;
  d.quiet = [];
  const notes = out.map((q) => q.note);
  d.motion = [...(d.motion ?? []), ...notes.map((n) => [s.week, n] as [number, string])].slice(-30);
  return out;
}

/** Remember the player's answer to templates whose next visit may be routine (deals). */
export function noteAnswers(s: GameState, resolving: readonly EventInstance[], choices: PlayerChoices): void {
  for (const ev of resolving) {
    if (!ev.defId.startsWith('deal_')) continue;
    const wanted = choices.choices?.[ev.iid];
    const ch = ev.choices.find((c) => c.id === wanted && !c.disabledReason) ?? ev.choices.find((c) => c.id === ev.defaultChoiceId);
    if (ch) (director(s).answers ??= {})[ev.defId] = [s.week, ch.id];
  }
}

/** The last few "In motion" notes (UI). */
export function motionNotes(s: GameState, weeks = 6): { week: number; text: string }[] {
  return (s.director?.motion ?? []).filter((m) => s.week - m[0] <= weeks).map(([week, text]) => ({ week, text })).reverse();
}
