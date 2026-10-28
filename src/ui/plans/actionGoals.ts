import type { ActionPreview } from '../../engine/actions';
import type { PlayerAction } from '../../engine/types';
import { ACTION_ENTRIES, type ActionEntry } from '../shell/actionEntries';

/**
 * THE FIVE GOALS: every order the boss can give, sorted by what he wants out
 * of it, in plain verbs. Find's front page and the Underboss's picks use them
 * so the menu reads "Make money / Protect what's yours / Grow your power /
 * Family & personal / Deal with a threat" instead of the engine's kinds.
 */
export type GoalId = 'money' | 'protect' | 'power' | 'family' | 'threat';

export const GOALS: { id: GoalId; label: string; verb: string; glyph: string }[] = [
  { id: 'money', label: 'Make money', verb: 'Earn', glyph: '$' },
  { id: 'protect', label: 'Protect what\'s yours', verb: 'Protect', glyph: '⛨' },
  { id: 'power', label: 'Grow your power', verb: 'Grow', glyph: '♛' },
  { id: 'family', label: 'Family & personal', verb: 'Family', glyph: '♥' },
  { id: 'threat', label: 'Deal with a threat', verb: 'Answer', glyph: '⚔' },
];

const BY_KIND: Partial<Record<PlayerAction['kind'], GoalId>> = {
  buyBusiness: 'money', sellBusiness: 'money', lend: 'money', findFrontMan: 'protect', charterBank: 'money', casino: 'money',
  econ: 'money', dirty: 'money', hood: 'money', tribute: 'money', ledger: 'money',
  scheme: 'threat', cancelScheme: 'threat', declareWar: 'threat', raid: 'threat', terms: 'threat', raiseDispute: 'threat', lobby: 'power',
  askPermission: 'power', pushDistrict: 'power', appoint: 'power', councilTask: 'power', policy: 'power', contract: 'money', edict: 'power',
  hire: 'power', dynasty: 'family', power: 'power', lifestyle: 'family', legal: 'protect', underbelly: 'threat', officeHours: 'power', perk: 'family',
  reassign: 'power', propose: 'power', background: 'protect', order: 'money', living: 'power', talk: 'power', mission: 'power', travel: 'power',
  pol: 'power', bones: 'power', ears: 'protect', dev: 'power', dating: 'family', nightlife: 'family', bond: 'family', interact: 'power',
} as Partial<Record<PlayerAction['kind'], GoalId>>;

/** Some ops sit better under another goal than their kind. */
const BY_OP: Record<string, GoalId> = {
  'econ:hq': 'protect', 'econ:sweep': 'protect', 'econ:gift': 'power', 'econ:invite': 'power', 'econ:leverage': 'power', 'econ:project': 'power',
  'econ:luxBuy': 'family', 'econ:luxSell': 'family', 'econ:audit': 'protect', 'econ:oversight': 'protect', 'econ:slowRival': 'threat',
  'travel:flee': 'protect', 'travel:lam': 'protect', 'ears:job': 'threat',
  'interact:whack': 'threat', 'interact:threaten': 'threat', 'interact:expose': 'threat', 'interact:court': 'family', 'interact:affair': 'family',
  'interact:proposeMarriage': 'family', 'interact:separate': 'family', 'interact:endRomance': 'family', 'interact:dinner': 'family',
  'interact:gift_small': 'power', 'interact:gift_large': 'power', 'interact:bribe': 'protect',
  'scheme:heist': 'money', 'scheme:envoy': 'power',
};

function opOf(a: PlayerAction): string | undefined {
  if (a.kind === 'interact') return a.id;
  if (a.kind === 'scheme') return a.scheme;
  const op = (a as { op?: unknown }).op;
  if (op && typeof op === 'object') {
    const o = op as { type?: string; op?: string; t?: string };
    return o.type ?? o.op ?? o.t;
  }
  return typeof op === 'string' ? op : undefined;
}

export function goalOfAction(a: PlayerAction): GoalId {
  const op = opOf(a);
  return (op && BY_OP[`${a.kind}:${op}`]) || BY_KIND[a.kind] || 'power';
}

export function goalOfEntry(e: ActionEntry): GoalId {
  for (const op of e.ops ?? []) { const g = BY_OP[`${e.kind}:${op}`]; if (g) return g; }
  if (/threat|hit|war|whack|plot|scheme|raid|dispute|rival/i.test(`${e.label} ${e.words}`) && BY_KIND[e.kind] !== 'money') return 'threat';
  return BY_KIND[e.kind] ?? 'power';
}

/** Every thing to do, by goal (the registry's order kept inside a goal). */
export function entriesByGoal(): Record<GoalId, ActionEntry[]> {
  const out: Record<GoalId, ActionEntry[]> = { money: [], protect: [], power: [], family: [], threat: [] };
  for (const e of ACTION_ENTRIES) out[goalOfEntry(e)].push(e);
  return out;
}

/**
 * The main risk of an order, in two or three words, from its own preview:
 * heat it raises, a man it sours, the chance they say no, its warning.
 */
export function mainRisk(p: ActionPreview): string | undefined {
  let heat: { bar: string; amount: number } | undefined;
  let sour = 0;
  for (const e of p.effects) {
    if (e.type === 'heat' && e.amount > 0 && (!heat || e.amount > heat.amount)) heat = { bar: e.bar, amount: e.amount };
    if ((e.type === 'opinion' || e.type === 'crewOpinion' || e.type === 'familyOpinion') && e.amount < 0) sour = Math.min(sour, e.amount);
  }
  if (heat && heat.amount >= 3) return `+${heat.amount} ${heat.bar} heat`;
  const odds = p.odds ?? p.acceptance;
  if (odds && odds.chance < 0.5) return p.odds ? `${Math.round((1 - odds.chance) * 100)}% it fails` : 'they may say no';
  if (sour <= -5) return 'sours someone';
  if (p.warning) return p.warning.length > 28 ? `${p.warning.slice(0, 27)}…` : p.warning;
  if (heat) return `+${heat.amount} ${heat.bar} heat`;
  return undefined;
}
