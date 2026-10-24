import { isInSeason } from './calendar';
import { capos, crew, displayName, hasTrait, isFree, shortName } from './characters';
import { CAPO_CUT } from './economy';
import { ensureEcon } from './econState';
import { fmtMoney } from './effects';
import type { Ctx } from './ledger';
import { chance, pick, randInt } from './rng';
import type { Character, Choice, EventInstance, GameState } from './types';

/**
 * Kick-ups and big scores. Crews find opportunities on their own; a big score
 * brings a kick-up decision (the capo's contract from regimes.ts sets the
 * standard end) and sometimes a credit dispute between the capo and the
 * soldier who says it was his.
 *
 * Each month the bagman's numbers also flag a capo who came up short. He may
 * be skimming, or the month may really have been bad: the clues lean the
 * right way more often than not, and the books can be checked.
 */

const SCORES = [
  'a trailer of Scotch off the Black Horse Pike',
  'a crooked card game with a Baltimore car dealer',
  'a jewelry salesman\'s sample case',
  'a load of cigarettes headed for New York',
  'a contractor who needed a strike to go away',
  'a payroll from a Vineland glass plant',
  'a warehouse of televisions in Pennsauken',
  'a bust-out of a restaurant supply company',
];

/** Weekly odds a capo's crew lands a big score. */
export function scoreOdds(s: GameState, k: Character): number {
  const men = crew(s).filter((m) => m.capoId === k.id && isFree(s, m)).length;
  return Math.min(0.03, 0.006 + men * 0.0015 + k.attributes.business / 10000);
}

/** Rolls the week's big scores (at most one) and queues the kick-up decision. */
export function bigScoresWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  // The first two months the crews are still sizing up the new boss.
  if (s.week < 10 || s.week - (e.cooldowns.bigScore ?? -99) < 6) return;
  for (const k of capos(s)) {
    if (!isFree(s, k) || !chance(e, scoreOdds(s, k))) continue;
    const value = randInt(e, 20, 90) * 100 * (isInSeason(s.date) ? 1.2 : 1);
    const what = pick(e, SCORES);
    const men = crew(s).filter((m) => m.capoId === k.id && isFree(s, m) && (m.rank === 'soldier' || m.rank === 'associate'));
    const claimant = men.length && chance(e, 0.4) ? men[randInt(e, 0, men.length - 1)] : undefined;
    e.cooldowns.bigScore = s.week;
    e.stats.bigScores++;
    s.eventQueue.push(buildScoreEvent(s, k, Math.round(value), what, claimant));
    break;
  }
}

export function buildScoreEvent(s: GameState, k: Character, value: number, what: string, claimant?: Character): EventInstance {
  const keep = k.keep ?? CAPO_CUT;
  const yours = Math.round(value * (1 - keep));
  const half = Math.round(value * 0.5);
  const kn = shortName(k);
  const label = `Big score: ${kn}'s crew`;
  const choices: Choice[] = [
    {
      id: 'standard', label: `Your end by his contract (${Math.round((1 - keep) * 100)}%)`, because: `took the standard end of ${k.firstName}'s score`,
      effects: [
        { type: 'money', amount: yours, label: `${label}: your end (${fmtMoney(yours)})`, category: 'kickup' },
        { type: 'wealth', charId: k.id, amount: value - yours, label },
        { type: 'econ', op: { op: 'credit', charId: k.id, amount: value }, label },
      ],
    },
    {
      id: 'more', label: 'Take more: it happened on your island', detail: 'He\'ll pay. He won\'t forget.', because: `took more than his share of ${k.firstName}'s score`,
      effects: [
        { type: 'money', amount: Math.max(yours, Math.round(value * 0.85)), label: `${label}: you took the lion's share`, category: 'kickup' },
        { type: 'opinion', from: k.id, to: s.playerId, amount: hasTrait(k, 'Greedy') ? -18 : -10, reason: 'Took my score', decay: 1 },
        { type: 'econ', op: { op: 'credit', charId: k.id, amount: value }, label },
      ],
    },
    {
      id: 'keep', label: 'Let him keep it all this time', detail: 'A gesture. The crew will hear about it.', because: `let ${k.firstName}'s crew keep their score`,
      effects: [
        { type: 'wealth', charId: k.id, amount: value, label },
        { type: 'opinion', from: k.id, to: s.playerId, amount: 15, reason: 'Let us keep our score', decay: 1 },
        { type: 'crewOpinion', amount: 2, reason: 'A generous boss' },
      ],
    },
  ];
  let text = `${displayName(k)}'s crew took ${what}: about ${fmtMoney(value)}. By his contract he keeps ${Math.round(keep * 100)}% and kicks up the rest (${fmtMoney(yours)}). Half would be ${fmtMoney(half)} to him.`;
  const actors = [k.id];
  if (claimant) {
    text += ` But ${displayName(claimant)} says it was his score from start to finish, and ${k.firstName} is taking the credit.`;
    actors.push(claimant.id);
    choices.push(
      {
        id: 'soldier', label: `Credit ${claimant.firstName}`, detail: `${k.firstName} loses face.`, because: `credited ${claimant.firstName} with the score over his capo`,
        effects: [
          { type: 'money', amount: yours, label: `${label}: your end`, category: 'kickup' },
          { type: 'wealth', charId: claimant.id, amount: Math.round((value - yours) / 2), label },
          { type: 'wealth', charId: k.id, amount: Math.round((value - yours) / 2), label },
          { type: 'opinion', from: claimant.id, to: s.playerId, amount: 15, reason: 'Gave me credit', decay: 1 },
          { type: 'opinion', from: k.id, to: s.playerId, amount: -12, reason: 'Embarrassed me in front of my crew', decay: 1 },
          { type: 'meter', from: k.id, to: claimant.id, meter: 'grievance', amount: 20 },
          { type: 'econ', op: { op: 'credit', charId: claimant.id, amount: value }, label },
        ],
      },
      {
        id: 'capo', label: `Back ${k.firstName}: the capo gets the credit`, detail: `${claimant.firstName} swallows it. For now.`, because: `backed ${k.firstName} over ${claimant.firstName}`,
        effects: [
          { type: 'money', amount: yours, label: `${label}: your end`, category: 'kickup' },
          { type: 'wealth', charId: k.id, amount: value - yours, label },
          { type: 'opinion', from: k.id, to: s.playerId, amount: 6, reason: 'Backed me', decay: 1 },
          { type: 'opinion', from: claimant.id, to: s.playerId, amount: -10, reason: 'Let my capo steal my score', decay: 1 },
          { type: 'econ', op: { op: 'credit', charId: k.id, amount: value }, label },
        ],
      },
    );
  }
  return {
    iid: `ev${s.nextId++}`, defId: 'econ_bigscore', title: claimant ? 'A big score, and a dispute' : 'A big score', text, week: s.week,
    choices, defaultChoiceId: 'standard', mandatory: false, priority: 34, actors, meta: { charId: k.id },
  };
}

/* ---------------- short or skimming? ---------------- */

/** The month's books on each capo: what he skimmed and how his district actually did. */
export function capoBooksWeek(s: GameState): void {
  const e = ensureEcon(s);
  if (s.week < 10) return;
  for (const k of capos(s)) {
    if (!isFree(s, k)) continue;
    const d = s.districts.find((x) => x.capoId === k.id);
    if (!d) continue;
    const b = e.capoBooks[k.id] ?? (e.capoBooks[k.id] = { skimStart: k.skimmed ?? 0, earned: 0, normal: 0, weeks: 0 });
    // A normal week for his district (no variance, his own skill).
    const normal = d.streetBase * ((d.influence.player ?? 0) / 100) * (isInSeason(s.date) ? 2.5 : 0.4) * (0.85 + k.attributes.business / 400);
    b.earned += k.lastEarn ?? 0;
    b.normal += normal;
    b.weeks++;
  }
}

export interface ShortCase {
  capoId: string;
  skimming: boolean;
  shortfall: number;
  skim: number;
}

/** End of the month: is anyone short? Resets the books. */
export function capoBooksMonth(s: GameState): ShortCase | undefined {
  const e = ensureEcon(s);
  let worst: ShortCase | undefined;
  for (const id in e.capoBooks) {
    const k = s.characters[id];
    const b = e.capoBooks[id];
    if (!k?.alive || !isFree(s, k) || b.weeks < 3) continue;
    const skim = Math.max(0, (k.skimmed ?? 0) - b.skimStart);
    const slow = Math.max(0, b.normal - b.earned) * (1 - (k.keep ?? CAPO_CUT));
    const ratio = b.normal > 0 ? 1 - b.earned / b.normal : 0;
    const flagged = skim >= 250 || ratio >= 0.18;
    if (!flagged) continue;
    const c: ShortCase = { capoId: id, skimming: skim >= 250 && skim >= slow * 0.5, shortfall: Math.round(Math.max(skim, slow)), skim: Math.round(skim) };
    if (!worst || c.shortfall > worst.shortfall) worst = c;
  }
  e.capoBooks = {};
  for (const k of capos(s)) if (isFree(s, k)) e.capoBooks[k.id] = { skimStart: k.skimmed ?? 0, earned: 0, normal: 0, weeks: 0 };
  return worst;
}

const SKIM_CLUES = ['His wife wore a new mink to the eleven o\'clock Mass.', 'He paid cash for a Coupe de Ville last week.', 'Your bagman says the bars in his district had a fine month.', 'He has been playing in the big game at the Starlight, and losing.'];
const HONEST_CLUES = ['It rained every weekend; the boardwalk was empty.', 'His best earner has been in Cape May Court House hospital all month.', 'The state police set up on the Causeway and scared the out-of-towners.', 'Your bagman says the whole district was slow.'];

export function buildShortEvent(s: GameState, c: ShortCase): EventInstance | undefined {
  const k = s.characters[c.capoId];
  if (!k?.alive) return undefined;
  const e = ensureEcon(s);
  // The clue points the right way three times in four.
  const honestClue = c.skimming ? chance(e, 0.25) : chance(e, 0.75);
  const clue = pick(e, honestClue ? HONEST_CLUES : SKIM_CLUES);
  const amt = Math.min(Math.max(0, Math.round(k.wealth)), c.shortfall);
  e.cases[k.id] = { skimming: c.skimming, shortfall: c.shortfall, week: s.week };
  const label = `Short envelope: ${shortName(k)}`;
  return {
    iid: `ev${s.nextId++}`, defId: 'econ_short', title: `${shortName(k)} came up short`, week: s.week, mandatory: false, priority: 33, actors: [k.id], meta: { charId: k.id },
    text: `${displayName(k)}'s envelopes were about ${fmtMoney(c.shortfall)} light this month. ${clue} He swears it was a bad month. Is he short, or is he skimming?`,
    defaultChoiceId: 'word',
    choices: [
      {
        id: 'word', label: 'Take his word', detail: 'If he\'s honest he\'ll remember it. If he isn\'t, he\'ll keep going.', because: `took ${k.firstName}'s word about a short month`,
        effects: [{ type: 'opinion', from: k.id, to: s.playerId, amount: 4, reason: 'Believed me', decay: 1 }],
      },
      {
        id: 'squeeze', label: 'Make him cover the difference', detail: 'Out of his own pocket. If he really had a bad month, he will call you a thief to his crew.', because: `made ${k.firstName} cover a short month`,
        effects: [
          { type: 'money', amount: amt, label, category: 'kickup' },
          { type: 'wealth', charId: k.id, amount: -amt, label },
          { type: 'econ', op: { op: 'squeeze', charId: k.id }, label },
        ],
      },
      {
        id: 'books', label: 'Have the bookkeeper check his envelopes ($300)', detail: 'You will know for sure next week.', because: `had ${k.firstName}'s envelopes checked`,
        effects: [{ type: 'money', amount: -300, label: `${label}: the bookkeeper's fee` }, { type: 'econ', op: { op: 'auditCapo', charId: k.id }, label }],
        disabledReason: s.money < 300 ? 'Needs $300' : undefined,
      },
    ],
  };
}
