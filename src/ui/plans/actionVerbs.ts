import type { PlayerAction } from '../../engine/types';
import type { MenuCategoryId } from '../sheet/menuCatalog';
import { ACTION_ENTRIES, type ActionEntry } from '../shell/actionEntries';
import { HOMES_BY_ID, itemOf } from '../shell/nav';

/**
 * THE EIGHT VERBS (STREAMLINE_2 §3.4): every order the boss can give, sorted
 * by what he does: Talk, Pay, Order, Plan, Buy, Travel, Hurt, Protect. Find's
 * front page ("Do something…") lists them as tabs; the five goals
 * (actionGoals.ts) stay as the "What do you want?" view of the same entries.
 *
 * Derived, like actionGoals.ts, so a branch that adds an entry never breaks
 * it: an entry's verb comes from its first op that has one, then its kind,
 * then the words it is found by, then Plan.
 */
export type Verb = 'talk' | 'pay' | 'order' | 'plan' | 'buy' | 'travel' | 'hurt' | 'protect';

export const VERBS: { id: Verb; label: string; glyph: string; blurb: string; words: string[]; cat: Exclude<MenuCategoryId, 'best'> }[] = [
  { id: 'talk', label: 'Talk', glyph: '☏', blurb: 'A word, a dinner, the phone, an audience, courting, a match', words: ['talk', 'phone', 'call', 'meet', 'ask', 'dinner', 'court', 'date', 'see'], cat: 'talk' },
  { id: 'pay', label: 'Pay', glyph: '$', blurb: 'The envelope, gifts, bribes, patronage, wages, loans out, tribute', words: ['pay', 'give', 'gift', 'bribe', 'envelope', 'tip', 'lend', 'reward'], cat: 'business' },
  { id: 'order', label: 'Order', glyph: '☞', blurb: 'Standing orders, family rules, the council, capos, who earns how, hiring', words: ['order', 'appoint', 'promote', 'assign', 'hire', 'seat', 'tell', 'make'], cat: 'crew' },
  { id: 'plan', label: 'Plan', glyph: '✎', blurb: 'Jobs, spies and lies, pushes, dirty work, Ocean City, the big cases', words: ['plan', 'scheme', 'plot', 'frame', 'blackmail', 'spy', 'turn'], cat: 'pressure' },
  { id: 'buy', label: 'Buy', glyph: '⌂', blurb: 'The Store, businesses, property, hotels, gear, the casino, a bank', words: ['buy', 'sell', 'purchase', 'invest', 'partner'], cat: 'business' },
  { id: 'travel', label: 'Travel', glyph: '✈', blurb: 'Trips, envoys, New York, on the lam', words: ['travel', 'trip', 'send', 'visit', 'go', 'move'], cat: 'move' },
  { id: 'hurt', label: 'Hurt', glyph: '⚔', blurb: 'A hit (by family), discipline, a squeeze, war, a raid, terms', words: ['hit', 'whack', 'kill', 'hurt', 'beat', 'squeeze', 'threaten', 'discipline', 'rub', 'clip'], cat: 'pressure' },
  { id: 'protect', label: 'Protect', glyph: '⛨', blurb: 'Guards, inquiries, the lawyer, HQ sweeps, the mattresses, a front man', words: ['protect', 'guard', 'bodyguard', 'hide', 'watch', 'shield', 'check'], cat: 'crew' },
];

export const VERB_BY_ID = Object.fromEntries(VERBS.map((v) => [v.id, v])) as Record<Verb, (typeof VERBS)[number]>;

const BY_KIND: Partial<Record<PlayerAction['kind'], Verb>> = {
  buyBusiness: 'buy', sellBusiness: 'buy', lend: 'pay', findFrontMan: 'protect', charterBank: 'buy', casino: 'buy',
  econ: 'buy', spend: 'buy', hood: 'buy', intrigue: 'plan', army: 'hurt', paper: 'plan', capo: 'order', protect: 'protect',
  work: 'plan', oc: 'plan', dirty: 'plan', dev: 'buy', tribute: 'pay', ledger: 'order', bones: 'hurt',
  appoint: 'order', councilTask: 'order', policy: 'order', contract: 'order', edict: 'order', order: 'order', hire: 'order',
  reassign: 'order', propose: 'order', background: 'protect', interact: 'talk', deed: 'talk', talk: 'talk',
  scheme: 'plan', cancelScheme: 'plan', mission: 'plan', declareWar: 'hurt', raid: 'hurt', terms: 'hurt',
  raiseDispute: 'talk', lobby: 'talk', askPermission: 'talk', pushDistrict: 'plan', dynasty: 'order', power: 'order',
  bond: 'talk', mymen: 'pay', dating: 'talk', lifestyle: 'order', perk: 'order', officeHours: 'talk', legal: 'protect',
  travel: 'travel', nyc: 'travel', pol: 'pay', underbelly: 'hurt', living: 'talk', ears: 'talk', payroll: 'pay',
  nightlife: 'talk', showbiz: 'buy', herway: 'pay', women: 'talk', honey: 'protect',
} as Partial<Record<PlayerAction['kind'], Verb>>;

/** Some ops sit better under another verb than their kind. */
const BY_OP: Record<string, Verb> = {
  'econ:setup': 'order', 'econ:spotCall': 'order', 'econ:placeAsk': 'order', 'econ:tenantCall': 'order', 'econ:manager': 'order',
  'econ:bank': 'pay', 'econ:hq': 'protect', 'econ:sweep': 'protect', 'econ:gift': 'pay', 'econ:invite': 'pay', 'econ:project': 'pay',
  'spend:give': 'pay', 'spend:share': 'pay',
  'intrigue:canary': 'protect', 'intrigue:question': 'protect', 'intrigue:front': 'hurt',
  'mymen:guard': 'protect', 'mymen:safety': 'protect', 'mymen:lawyer': 'protect', 'mymen:answer': 'protect', 'mymen:pitch': 'order',
  'mymen:warn': 'hurt', 'mymen:fine': 'hurt', 'mymen:demote': 'hurt', 'mymen:kill': 'hurt',
  'dynasty:marry': 'talk', 'dynasty:host': 'talk', 'dynasty:legacy': 'buy',
  'power:shadow': 'protect', 'power:amends': 'talk', 'power:blitz': 'protect', 'power:mattresses': 'protect', 'power:bodyguards': 'protect',
  'power:low': 'talk', 'power:front': 'protect', 'power:climb': 'plan', 'power:audience': 'talk',
  'nightlife:payroll': 'pay', 'ears:opDig': 'hurt',
  'interact:whack': 'hurt', 'interact:threaten': 'hurt', 'interact:exile': 'hurt', 'interact:bribe': 'pay', 'interact:gift_small': 'pay',
  'interact:gift_large': 'pay', 'interact:recruit': 'order', 'interact:promote': 'order', 'interact:demote': 'hurt', 'interact:make': 'order',
  'scheme:hit': 'hurt', 'travel:flee': 'travel', 'army:raise': 'hurt',
};

/** Words that point to a verb when neither the op nor the kind says (a branch's new entry). */
const BY_WORDS: [RegExp, Verb][] = [
  [/\b(hit|whack|kill|war|squeeze|discipline|raid)\b/i, 'hurt'],
  [/\b(guard|protect|lawyer|hide|sweep)\b/i, 'protect'],
  [/\b(trip|travel|new york|lam)\b/i, 'travel'],
  [/\b(pay|gift|bribe|envelope|wage|lend|tribute)\b/i, 'pay'],
  [/\b(buy|sell|store|property)\b/i, 'buy'],
  [/\b(talk|phone|dinner|date|court|marry|match)\b/i, 'talk'],
  [/\b(order|rule|appoint|hire|council|capo)\b/i, 'order'],
];

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

/** The verb of a single order (a recommendation, a pinned order). */
export function verbOfAction(a: PlayerAction): Verb {
  const op = opOf(a);
  return (op && BY_OP[`${a.kind}:${op}`]) || BY_KIND[a.kind] || 'plan';
}

/** The verb of a registry entry: its first op that has one, then its kind, then its words. */
export function verbOfEntry(e: ActionEntry): Verb {
  const op = e.ops?.[0];
  if (op && BY_OP[`${e.kind}:${op}`]) return BY_OP[`${e.kind}:${op}`];
  const k = BY_KIND[e.kind];
  if (k) return k;
  const text = `${e.label} ${e.words}`;
  for (const [re, v] of BY_WORDS) if (re.test(text)) return v;
  return 'plan';
}

/** Every thing to do, by verb (the registry's order kept inside a verb). */
export function entriesByVerb(): Record<Verb, ActionEntry[]> {
  const out = Object.fromEntries(VERBS.map((v) => [v.id, [] as ActionEntry[]])) as Record<Verb, ActionEntry[]>;
  for (const e of ACTION_ENTRIES) out[verbOfEntry(e)].push(e);
  return out;
}

/** A typed word that names a verb ("pay", "whack", "phone"), or undefined. */
export function verbOfWord(w: string): Verb | undefined {
  const x = w.toLowerCase();
  return VERBS.find((v) => v.words.includes(x))?.id;
}

/** Where an entry is done, as the verb tab's subhead: the home it lives in, or "With a person". */
export function entryWhere(e: ActionEntry): string {
  const at = e.at[0];
  if (at === 'person') return 'With a person (Deal with…)';
  if (at === 'place' || at === 'map') return 'On the map';
  if (at === 'office' || at === 'event') return 'The Office';
  const it = itemOf(at);
  return it ? HOMES_BY_ID[it.home].label : 'Elsewhere';
}
