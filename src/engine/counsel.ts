import { previewAction } from './actions';
import { explainAction, explainChoice, preSeason, type ActionExplanation } from './advice';
import { adviceBrief, advisersFor, biasLabel, moneyRead, readSubject, type AdviceBrief, type AdviceSubject, type AdviserRef, type Certainty, type Reaction, type Stance } from './adviceBrief';
import { briefing, type BriefItem, type BriefOption } from './briefing';
import { idleMen } from './business';
import { isInSeason } from './calendar';
import { rankCandidates, type Candidate, type Role } from './candidates';
import { CATALOG } from './catalog';
import { displayName, hasTrait } from './characters';
import { JOBS_BY_ID, jobSummary } from './dirtyWork';
import { fmtMoney } from './effects';
import { publicHeir } from './heir';
import { MENU, startSummary } from './racketMenu';
import { recurringOfAll } from './recurring';
import { opinion } from './relations';
import { hashSeed } from './rng';
import { obligations } from './tribute';
import type { Character, Choice, Effect, GameState, PlayerAction } from './types';

/**
 * THE TABLE. One question, put to everyone who has a say: the underboss, the
 * consigliere, the capo whose ground or men it touches, and the bagman, fixer
 * or enforcer when it is their trade. Each man gives a verdict (Do it / Do it,
 * but… / Wait / Don't) with how sure he is, his pros and cons — concrete, tied
 * to the numbers the player can see (money from the Family or the pocket, the
 * weekly money, local and federal heat, named men's loyalty, rivals and
 * Philadelphia with how likely and why, the law, the household, the
 * succession, what else the money or the men could do, the season) — and,
 * when he disagrees, what he would do instead.
 *
 * Built on the adviser briefings (adviceBrief.ts): each voice reads the same
 * subject through that man's own briefing (his skill-coloured reads, his
 * reactions, his pick, his knowable bias), then weighs it with his stance and
 * his interests. So the table disagrees when the men do.
 *
 * Rules kept from the briefings:
 *  - a man speaks only from what HE knows: facts on the player's screen are
 *    "known"; his reads are "estimates"; a man outside his crew's loyalty is a
 *    guess unless he is the underboss or consigliere (who see every crew);
 *    nothing hidden (undiscovered plots, private ambitions) is ever used;
 *  - a bias is labelled only when the player could know it (his kin, his own
 *    men, his own ground, a promise the player has heard of);
 *  - pure and deterministic: never changes the state, never draws a random
 *    number; memoized per state object.
 */

export type CounselSubject = AdviceSubject | { kind: 'brief'; itemId: string };
export type CounselVerdict = 'do' | 'doBut' | 'wait' | 'dont';
export const VERDICT_LABEL: Record<CounselVerdict, string> = { do: 'Do it', doBut: 'Do it, but…', wait: 'Wait', dont: 'Don\'t' };

export type PointAbout =
  | 'money' | 'weekly' | 'gain' | 'respect' | 'heat' | 'federal' | 'law' | 'loyalty'
  | 'rivals' | 'philly' | 'family' | 'succession' | 'opportunity' | 'timing';

export const ABOUT_WORD: Record<PointAbout, string> = {
  money: 'the money', weekly: 'the weekly money', gain: 'what it brings', respect: 'your name on the street',
  heat: 'local heat', federal: 'federal heat', law: 'legal exposure', loyalty: 'the men\'s loyalty',
  rivals: 'the other families', philly: 'Philadelphia', family: 'your household', succession: 'the succession',
  opportunity: 'what else it ties up', timing: 'the timing',
};

export interface CounselPoint {
  text: string;
  k: Certainty;
  about: PointAbout;
  /** How much it weighs with this man (his stance and interests): the list is sorted by it. */
  weight: number;
}

export interface CounselOpinion {
  verdict: CounselVerdict;
  label: string;
  /** Net weight of his pros against his cons (for sorting; not shown as a number). */
  score: number;
  /** 0..100: how sure he is (his margin, and his skill for this kind of thing). */
  confidence: number;
  confidenceWord: 'Sure' | 'Fairly sure' | 'Unsure';
  pros: CounselPoint[];
  cons: CounselPoint[];
  /** "Do it, but…": the but. */
  but?: string;
  /** When he disagrees: what he would do instead, in one line. */
  instead?: string;
  /** His biggest con. */
  worry?: PointAbout;
}

export interface Voice extends CounselOpinion {
  adviser: AdviserRef;
  /** One or two sentences in his own voice. */
  says: string;
  /** A possible bias the player could know of. Never set for a tie the player can't see. */
  bias?: string;
  /** Option subjects: the option he backs. */
  backs?: string;
  backsLabel?: string;
  /** What he cannot see from where he sits. */
  blind: string;
}

export interface Tally { for: number; but: number; wait: number; against: number }

export interface CounselOption {
  id: string;
  label: string;
  disabled?: string;
  action?: PlayerAction;
  choiceId?: string;
  /** Each adviser on this option. */
  voices: Voice[];
  tally: Tally;
  /** How many advisers back this option over the others. */
  backers: number;
}

export type CounselTopic = 'racket' | 'dirty' | 'buy' | 'appoint' | 'talk' | 'event' | 'succession' | 'sitdown' | 'other';

export interface Counsel {
  key: string;
  kind: CounselSubject['kind'];
  topic: CounselTopic;
  title: string;
  /** "Why this matters", one sentence. */
  why: string;
  summary: { tally: Tally; worry?: PointAbout; worryWord?: string; line: string };
  voices: Voice[];
  /** Option subjects (decisions, sit-down items, appointments): rows of the matrix. */
  options?: CounselOption[];
  /** Single-action subjects: the order being weighed. */
  plan?: PlayerAction;
  /** Decisions: what happens if nobody decides. */
  defaultLabel?: string;
}

/* ------------------------------------------------------------------ */
/* Weights: stance, role and traits                                    */
/* ------------------------------------------------------------------ */

type Mult = Partial<Record<PointAbout, number>>;
const STANCE_MULT: Record<Stance, Mult> = {
  cautious: { heat: 1.6, federal: 1.8, law: 1.7, philly: 1.5, rivals: 1.4, family: 1.3, timing: 1.3, gain: 0.8, weekly: 0.85, respect: 0.6 },
  bold: { heat: 0.55, federal: 0.75, law: 0.6, philly: 0.7, rivals: 0.6, timing: 0.6, gain: 1.3, respect: 1.6, opportunity: 0.7 },
  money: { money: 1.5, weekly: 1.6, gain: 1.3, opportunity: 1.3, respect: 0.6, loyalty: 0.8 },
  steady: { loyalty: 1.5, family: 1.2, succession: 1.2 },
};
const ROLE_MULT: Record<AdviserRef['role'], Mult> = {
  underboss: { loyalty: 1.3, opportunity: 1.1 },
  consigliere: { philly: 1.4, law: 1.3, rivals: 1.2, succession: 1.2 },
  capo: { gain: 1.2, weekly: 1.1, opportunity: 1.2 },
  bagman: { money: 1.4, weekly: 1.4, opportunity: 1.2 },
  fixer: { heat: 1.3, federal: 1.3, law: 1.2 },
  enforcer: { respect: 1.3, rivals: 0.8 },
};

function mult(c: Character, ref: AdviserRef, about: PointAbout, pro: boolean): number {
  let m = (STANCE_MULT[ref.stance][about] ?? 1) * (ROLE_MULT[ref.role][about] ?? 1);
  if (hasTrait(c, 'Greedy') && (about === 'money' || about === 'weekly' || about === 'gain')) m *= 1.2;
  if (hasTrait(c, 'Paranoid') && (about === 'rivals' || about === 'law') && !pro) m *= 1.3;
  if (hasTrait(c, 'Hot-headed') && about === 'respect') m *= 1.4;
  if (hasTrait(c, 'Hot-headed') && about === 'rivals' && !pro) m *= 0.7;
  if (hasTrait(c, 'Ambitious') && about === 'gain') m *= 1.15;
  if (hasTrait(c, 'Pious') && about === 'family') m *= 1.2;
  return m;
}

/* ------------------------------------------------------------------ */
/* Raw points (before his weighting)                                   */
/* ------------------------------------------------------------------ */

interface Raw { text: string; k: Certainty; about: PointAbout; mag: number; pro: boolean }
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;

function pocketOf(s: GameState): number { return Math.round(s.tribute?.acct.personal ?? 0); }

function weeklyBills(s: GameState): number {
  return Math.max(1, obligations(s).filter((o) => o.weekly && o.kind !== 'receivable').reduce((a, o) => a + o.amount, 0));
}

/** Does this adviser know where this man stands? The underboss and consigliere see every crew; a capo his own; anyone himself. */
function knowsMan(_s: GameState, adv: Character, ref: AdviserRef, man: Character): boolean {
  if (man.id === adv.id) return true;
  if (ref.role === 'underboss' || ref.role === 'consigliere') return true;
  if (man.capoId === adv.id) return true;
  return man.capoId !== undefined && man.capoId === adv.capoId && ref.role !== 'capo';
}

function loyaltyRaw(s: GameState, adv: Character, ref: AdviserRef, man: Character, why: string): Raw | undefined {
  if (man.id === s.playerId) return undefined;
  const op = opinion(s, man.id, s.playerId);
  const known = knowsMan(s, adv, ref, man);
  const name = man.nickname ? `${man.firstName} "${man.nickname}"` : man.firstName;
  if (op >= 25) return { text: known ? `${name} thinks ${signed(op)} of you: he'll do it right ${why}` : `${name} seems solid with you, from what he hears (not his crew)`, k: known ? 'known' : 'estimate', about: 'loyalty', mag: 1.2, pro: true };
  if (op < 0) return { text: known ? `${name} thinks ${signed(op)} of you: a sore man ${why}` : `${name} seems sore at you, from what he hears (not his crew)`, k: known ? 'known' : 'estimate', about: 'loyalty', mag: clamp(-op / 12, 1, 4), pro: false };
  return undefined;
}

/** Points straight from a set of effects (a preview or a decision's option): facts the player sees. */
function effectRaws(s: GameState, effects: readonly Effect[], cost: number, pot: 'family' | 'pocket' | undefined): Raw[] {
  const out: Raw[] = [];
  if (cost > 0) {
    const have = pot === 'pocket' ? pocketOf(s) : Math.round(s.money);
    const left = have - cost;
    out.push({ text: `${fmtMoney(cost)} from ${pot === 'pocket' ? 'your own pocket' : 'Family money'}: leaves ${fmtMoney(left)}`, k: 'known', about: pot === 'pocket' ? 'family' : 'money', mag: clamp(cost / Math.max(2500, have) * 15, 0.3, 7) + (left < 1000 ? 3 : 0) + (left < 0 ? 6 : 0), pro: false });
    const bills = weeklyBills(s);
    if (pot !== 'pocket' && bills > 1) {
      const wk = Math.round((cost / bills) * 10) / 10;
      out.push({ text: `The same ${fmtMoney(cost)} is ${wk} week${wk === 1 ? '' : 's'} of the Family's bills (${fmtMoney(bills)}/wk)`, k: 'known', about: 'opportunity', mag: clamp(cost / bills / 4, 0.2, 3), pro: false });
    }
  }
  let local = 0, fed = 0, fam = 0;
  for (const e of effects) {
    switch (e.type) {
      case 'money': if (e.amount > 0) out.push({ text: `${fmtMoney(e.amount)} in hand${e.pot === 'pocket' ? ', into your pocket' : ' for the Family'}`, k: 'known', about: 'money', mag: clamp(e.amount / 900, 0.4, 7), pro: true }); break;
      case 'heat': if (e.bar === 'local') local += e.amount; else if (e.bar === 'federal') fed += e.amount; else fam += e.amount; break;
      case 'respect': if (e.amount) out.push({ text: `${signed(e.amount)} respect: the street hears of it`, k: 'known', about: 'respect', mag: clamp(Math.abs(e.amount) / 2, 0.4, 5), pro: e.amount > 0 }); break;
      case 'crewOpinion': if (e.amount) out.push({ text: e.amount > 0 ? `The crews like it (${signed(e.amount)} with every man)` : `The crews like it less (${signed(e.amount)} with every man)`, k: 'known', about: 'loyalty', mag: clamp(Math.abs(e.amount) * 0.8, 0.5, 6), pro: e.amount > 0 }); break;
      case 'familyOpinion': if (e.amount) out.push({ text: e.amount > 0 ? `Your family at home likes it (${signed(e.amount)})` : `Your family at home won't like it (${signed(e.amount)})`, k: 'known', about: 'family', mag: clamp(Math.abs(e.amount) / 3, 0.5, 5), pro: e.amount > 0 }); break;
      case 'rivalOpinion': if (e.amount) { const r = s.rivals.find((x) => x.id === e.rival); out.push({ text: `${signed(e.amount)} with ${r?.shortName ?? 'a rival'}`, k: 'known', about: e.rival === 'philly' ? 'philly' : 'rivals', mag: clamp(Math.abs(e.amount) / 4, 0.5, 5), pro: e.amount > 0 }); } break;
      case 'influence': if (e.amount > 0) out.push({ text: `${signed(e.amount)}% of ${s.districts.find((d) => d.id === e.district)?.name ?? 'the district'}`, k: 'known', about: 'gain', mag: clamp(e.amount / 2, 0.5, 5), pro: true }); break;
      case 'evidence': if (e.amount > 0) { const c = s.characters[e.charId]; out.push({ text: `${e.amount} more in ${c?.id === s.playerId ? 'your own' : `${c?.firstName ?? 'his'}'s`} file with the law`, k: 'known', about: 'law', mag: clamp(e.amount / 6, 0.5, 5) * (e.charId === s.playerId ? 1.6 : 1), pro: false }); } break;
      case 'kill': out.push({ text: 'A body: a murder case if anyone ever talks', k: 'known', about: 'law', mag: 4.5, pro: false }); break;
      case 'warStart': out.push({ text: `It starts a war with ${s.rivals.find((x) => x.id === e.rival)?.shortName ?? 'them'}`, k: 'known', about: 'rivals', mag: 7, pro: false }); break;
      case 'feud': out.push({ text: 'Blood between the families: a feud', k: 'known', about: 'rivals', mag: 4.5, pro: false }); break;
      case 'favor': if (e.amount > 0) out.push({ text: `${e.amount} favor${e.amount > 1 ? 's' : ''} in the bank`, k: 'known', about: 'gain', mag: 1.5 * e.amount, pro: true }); break;
      case 'hook': out.push({ text: `Leverage on ${s.characters[e.targetId]?.firstName ?? 'him'}`, k: 'known', about: 'gain', mag: 1.8, pro: true }); break;
      default: break;
    }
  }
  if (local) out.push({ text: `${signed(local)} local heat (now ${Math.round(s.heat.local)})`, k: 'known', about: 'heat', mag: clamp(Math.abs(local) / 2 * (1 + s.heat.local / 60), 0.4, 7), pro: local < 0 });
  if (fed) out.push({ text: `${signed(fed)} federal heat (now ${Math.round(s.heat.federal)})`, k: 'known', about: 'federal', mag: clamp(Math.abs(fed) * 0.8 * (1 + s.heat.federal / 50), 0.4, 8), pro: fed < 0 });
  if (fam) out.push({ text: `${signed(fam)} heat with Philadelphia (now ${Math.round(s.heat.family)})`, k: 'known', about: 'philly', mag: clamp(Math.abs(fam) / 2, 0.4, 6), pro: fam < 0 });
  for (const r of recurringOfAll(s, effects)) {
    if (!r.weekly) { out.push({ text: r.text, k: 'known', about: 'weekly', mag: 0.6, pro: false }); continue; }
    out.push({ text: r.text, k: 'known', about: 'weekly', mag: clamp(Math.abs(r.weekly) * Math.min(26, r.weeks ?? 26) / 2500, 0.5, 7), pro: r.weekly > 0 });
  }
  return out;
}

function riskRaws(ex: ActionExplanation): Raw[] {
  return ex.risks.filter((r) => r.chance < 1).slice(0, 3).map((r) => ({
    text: `${Math.round(r.chance * 100)}%: ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)}`,
    k: 'estimate' as const,
    about: /feder|FBI|grand jury/i.test(r.text) ? 'federal' : /arrest|police|cop|raid|indict|file|trial/i.test(r.text) ? 'law' : /Philadelph|Table|Commission/i.test(r.text) ? 'philly' : /wife|home|son|daughter|family at home/i.test(r.text) ? 'family' : 'rivals',
    mag: (r.severity === 'high' ? 4 : r.severity === 'mid' ? 2 : 1) * (0.3 + r.chance * 1.5), pro: false,
  }));
}

const LIKE_MAG: Record<Reaction['likelihood'], number> = { likely: 4, possible: 2, unlikely: 0.7 };

/** His own reads of who answers it (from his briefing): estimates with their likelihood and why. */
function reactionRaws(reactions: readonly Reaction[]): Raw[] {
  const out: Raw[] = [];
  for (const r of reactions.slice(0, 4)) {
    const why = r.reasons.slice(0, 2).join('; ');
    const about: PointAbout = r.kind === 'philly' ? 'philly' : r.kind === 'cops' ? (/fed/i.test(r.who) ? 'federal' : 'heat') : r.kind === 'crew' ? 'loyalty' : r.kind === 'family' ? 'family' : r.kind === 'town' ? 'respect' : 'rivals';
    if (r.likelihood === 'unlikely') {
      out.push({ text: `${r.who}: unlikely to answer it${why ? ` (${why})` : ''}`, k: r.k, about, mag: 0.8, pro: true });
    } else {
      out.push({ text: `${r.who}: ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)} (${r.likelihood}${why ? `: ${why}` : ''})`, k: r.k, about, mag: LIKE_MAG[r.likelihood] * (r.kind === 'philly' ? 1.25 : 1), pro: false });
    }
  }
  return out;
}

function seasonRaws(s: GameState, seasonal: boolean, nowTake?: number, otherTake?: number): Raw[] {
  if (!seasonal) return [];
  const inS = isInSeason(s.date);
  if (inS) return [{ text: `It's the Season: the take is at its best right now${nowTake !== undefined ? ` (about ${fmtMoney(nowTake)}/wk, his read)` : ''}`, k: nowTake !== undefined ? 'estimate' : 'known', about: 'timing', mag: 1.6, pro: true }];
  if (preSeason(s)) return [{ text: 'The Season is weeks away: start now and it is running when the crowds come', k: 'known', about: 'timing', mag: 1.3, pro: true }];
  return [{ text: `Off-season: the island is quiet${otherTake !== undefined ? ` (about ${fmtMoney(otherTake)}/wk until summer, his read)` : ''}`, k: otherTake !== undefined ? 'estimate' : 'known', about: 'timing', mag: 1.4, pro: false }];
}

/* ------------------------------------------------------------------ */
/* One option, through one man's eyes                                  */
/* ------------------------------------------------------------------ */

interface Opt {
  id: string;
  label: string;
  action?: PlayerAction;
  choice?: Choice;
  /** Sit-down "Not now". */
  wait?: { item: BriefItem };
  /** Appointment candidate. */
  cand?: Candidate;
  disabled?: string;
}

interface Ctx {
  s: GameState;
  sub: CounselSubject;
  topic: CounselTopic;
  district?: string;
  /** The man the matter is about (an event's person, a talk's target). */
  aboutId?: string;
}

interface Eval { raws: Raw[]; brief?: AdviceBrief; bias?: string; blocked?: string; manId?: string; instead?: string; skill: number; seasonalKey?: string }

function skillFor(adv: Character, topic: CounselTopic): number {
  const a = adv.attributes;
  switch (topic) {
    case 'racket': case 'buy': return a.business;
    case 'dirty': return a.force;
    case 'talk': return a.diplomacy;
    case 'appoint': case 'succession': return a.leadership;
    default: return Math.round((a.intrigue + a.diplomacy) / 2);
  }
}

function evalAction(ctx: Ctx, adv: Character, ref: AdviserRef, a: PlayerAction): Eval {
  const { s } = ctx;
  const p = previewAction(s, a);
  const ex = explainAction(s, a);
  const brief = adviceBrief(s, { kind: 'action', action: a }, adv.id) ?? undefined;
  const raws: Raw[] = [];
  const blocked = p.disabledReason;
  let manId = brief?.recommendation?.charId;
  let instead: string | undefined;
  if (blocked) raws.push({ text: `Can't be done this week: ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)}`, k: 'known', about: 'timing', mag: 10, pro: false });
  if (p.warning) raws.push({ text: p.warning, k: 'known', about: 'law', mag: 2, pro: false });

  if (a.kind === 'econ' && a.op.type === 'racket' && a.op.cmd.c === 'start') {
    const kind = a.op.cmd.kind;
    const def = CATALOG[kind];
    const district = a.op.cmd.district ?? ctx.district;
    if (a.op.cmd.runner) manId = a.op.cmd.runner;
    const sum = startSummary(s, kind, a.op.cmd.runner ?? manId, district);
    const now = moneyRead(adv, `take:${kind}`, adv.attributes.business, sum.weekly);
    const other = moneyRead(adv, `off:${kind}`, adv.attributes.business, sum.other);
    raws.push(...effectRaws(s, [], p.cost, p.pot === 'pocket' ? 'pocket' : 'family'));
    raws.push({ text: `About ${fmtMoney(now)}/wk now, ${fmtMoney(other)}/wk in the other season: his read${sum.steady ? ' (a steady earner: the same all year)' : ''}`, k: 'estimate', about: 'weekly', mag: clamp(Math.max(now, other) * 0.8 / 120, 0.5, 8), pro: now + other > 0 });
    if (def.upkeep) raws.push({ text: `Upkeep ${fmtMoney(def.upkeep)} a week, busy or slow`, k: 'known', about: 'weekly', mag: clamp(def.upkeep / 40, 0.3, 3), pro: false });
    if (p.cost > 0 && now > 0) raws.push({ text: `Pays back its ${fmtMoney(p.cost)} in about ${Math.max(1, Math.round(p.cost / Math.max(1, (now + other) / 2)))} weeks, by his read`, k: 'estimate', about: 'money', mag: clamp(8 - p.cost / Math.max(1, (now + other) / 2) / 3, 0.5, 5), pro: true });
    const hw: Record<string, number> = { none: 0, low: 0.8, some: 1.5, mid: 2.2, medium: 2.2, high: 4 };
    if ((hw[sum.heat] ?? 1) > 0) raws.push({ text: `Draws ${sum.heat} heat from the police every week it runs (local heat now ${Math.round(s.heat.local)})`, k: 'known', about: 'heat', mag: (hw[sum.heat] ?? 1.5) * (1 + s.heat.local / 80), pro: false });
    else raws.push({ text: 'Barely draws the police', k: 'known', about: 'heat', mag: 0.8, pro: true });
    if ((hw[sum.federal] ?? 1) > 0) raws.push({ text: `Federal interest: ${sum.federal} (federal heat now ${Math.round(s.heat.federal)})`, k: 'known', about: 'federal', mag: (hw[sum.federal] ?? 1.5) * 1.2 * (1 + s.heat.federal / 60), pro: false });
    const idle = idleMen(s).length;
    raws.push({ text: `Ties up ${def.staff} of your ${idle} free m${idle === 1 ? 'an' : 'en'} on the street`, k: 'known', about: 'opportunity', mag: idle ? clamp(def.staff / idle * 3, 0.4, 4) : 4, pro: false });
    for (const w of sum.warns.slice(0, 1)) raws.push({ text: w, k: 'known', about: /Philadelphia/.test(w) ? 'philly' : /federal|feds/i.test(w) ? 'federal' : 'opportunity', mag: 3, pro: false });
    raws.push(...seasonRaws(s, def.season[0] > def.season[1] * 1.25 && !sum.steady, now, other));
    // His instead: a quieter racket, when the heat is what bothers him.
    const quiet = MENU.map((m) => m.key).filter((k): k is typeof kind => k !== 'madam' && k !== kind).map((k) => CATALOG[k]).filter((d) => d && d.base > 0 && d.heat + d.fedHeat < def.heat + def.fedHeat && d.cost <= s.money && !startSummary(s, d.kind).locks.length).sort((x, y) => (x.heat + x.fedHeat) - (y.heat + y.fedHeat) || y.base - x.base)[0];
    instead = quiet ? `Start something quieter: ${quiet.name} (${fmtMoney(quiet.cost)}).` : 'Keep the money for now and look again in the Season.';
  } else if (a.kind === 'dirty') {
    const j = JOBS_BY_ID[a.op.job];
    const who = a.op.who;
    const sum = jobSummary(s, a.op.job, who, a.op.target, a.op.pay);
    manId = who;
    raws.push(...effectRaws(s, [], p.cost, p.pot === 'pocket' ? 'pocket' : 'family'));
    const man = s.characters[who];
    if (sum.take[1] > 0) raws.push({ text: `${fmtMoney(sum.take[0])}–${fmtMoney(sum.take[1])} if it goes clean`, k: 'known', about: 'money', mag: clamp((sum.take[0] + sum.take[1]) / 2 * (sum.odds / 100) / 700, 0.5, 7), pro: true });
    if (sum.odds) raws.push({ text: `${sum.odds}% it goes clean with ${man?.id === s.playerId ? 'you' : man?.firstName ?? 'him'} on it`, k: 'known', about: 'gain', mag: clamp((sum.odds - 50) / 10, 0.3, 4), pro: sum.odds >= 55 });
    if (sum.arrest) raws.push({ text: `If it goes wrong, ${sum.arrest}% it ends in an arrest${sum.rat ? `, and ${sum.rat}% the man picked up talks` : ''}`, k: 'known', about: 'law', mag: clamp((100 - sum.odds) / 100 * (sum.arrest + sum.rat) / 12, 0.5, 6), pro: false });
    if (sum.heat) {
      const fed = /federal/i.test(sum.heat);
      raws.push({ text: `It draws ${sum.heat} heat (local now ${Math.round(s.heat.local)}${fed ? `, federal ${Math.round(s.heat.federal)}` : ''})`, k: 'known', about: fed ? 'federal' : 'heat', mag: clamp(((j.heat.local ?? 0) + (j.heat.federal ?? 0) * 1.6) / 2 * (1 + (fed ? s.heat.federal : s.heat.local) / 60), 0.5, 7), pro: false });
    }
    if (sum.philly) raws.push({ text: `Philadelphia's view: ${sum.philly}`, k: 'known', about: 'philly', mag: /forbid|never|sanction/i.test(sum.philly) ? 3.5 : 1.5, pro: false });
    if (who === s.playerId) raws.push({ text: 'Your own fingerprints on it: if it goes wrong, it is your name in the file and your wife reads the papers', k: 'known', about: 'family', mag: 3.5, pro: false });
    if (man && (man.evidence ?? 0) >= 40) raws.push({ text: `${man.firstName} already has a file with the law (${Math.round(man.evidence ?? 0)})`, k: 'known', about: 'law', mag: 2, pro: false });
    const heir = publicHeir(s);
    if (heir && heir.id === who) raws.push({ text: `${heir.firstName} is the man the crew sees as your heir: this puts him in the line of fire`, k: 'known', about: 'succession', mag: 2.5, pro: false });
    raws.push(...seasonRaws(s, !!j.seasonal));
    if (s.heat.local >= 55) raws.push({ text: `Local heat is already ${Math.round(s.heat.local)}: every job is louder right now`, k: 'known', about: 'timing', mag: 2, pro: false });
    instead = s.heat.local >= 45 || s.heat.federal >= 40 ? `Let the heat cool first (local ${Math.round(s.heat.local)}, federal ${Math.round(s.heat.federal)}), then do it.` : 'Send a man with no file and better odds, or pick a softer target.';
  } else {
    raws.push(...effectRaws(s, p.effects, p.cost, p.pot === 'pocket' ? 'pocket' : 'family'));
    raws.push(...riskRaws(ex));
    if (a.kind === 'talk' && a.op.t === 'ask') {
      const ag = brief?.requirements.find((l) => /says yes/.test(l.text));
      if (ag) raws.push({ text: ag.text.replace(/\(his read: /, '(').replace(/^About/, 'About'), k: 'estimate', about: 'gain', mag: 1.5, pro: /About (\d+)%/.test(ag.text) ? Number(/About (\d+)%/.exec(ag.text)![1]) >= 50 : true });
      instead = 'Send a gift or let the fixer feel them out first; sit down after.';
    }
    if (a.kind === 'power') {
      const op = a.op;
      if (op.op === 'designate' || op.op === 'groom' || op.op === 'promise') {
        const c = 'charId' in op && op.charId ? s.characters[op.charId] : undefined;
        raws.push({ text: op.op === 'designate' ? 'It settles who comes after you: the men stop guessing and stop picking sides' : op.op === 'groom' ? `${c?.firstName ?? 'He'} learns the chair while you still sit in it` : `A promise ${c?.firstName ?? 'he'} will hold you to`, k: 'known', about: 'succession', mag: 2.5, pro: op.op !== 'promise' });
        const ub = Object.values(s.characters).find((x) => x.alive && x.faction === 'player' && x.rank === 'underboss');
        if (c && ub && ub.id !== c.id) raws.push({ text: `${ub.firstName}, your underboss, is passed over: he thinks ${signed(opinion(s, ub.id, s.playerId))} of you now`, k: 'known', about: 'loyalty', mag: 2.5, pro: false });
        if (c && c.id === adv.id) raws.push({ text: 'It is him you are talking about', k: 'known', about: 'succession', mag: 0, pro: true });
      }
      instead = 'Keep it to yourself a while longer; name him when the crews are calm.';
    }
    if (!raws.some((r) => r.pro) && ex.purpose) raws.push({ text: ex.purpose, k: 'known', about: 'gain', mag: clamp(ex.value / 900, 0.6, 5), pro: true });
  }
  // The man he'd put on it, and how he sits with you (as far as this adviser knows).
  const man = manId ? s.characters[manId] : undefined;
  if (man && man.id !== adv.id) {
    const l = loyaltyRaw(s, adv, ref, man, 'on a thing like this');
    if (l) raws.push(l);
    if (ref.role === 'capo' && man.capoId === adv.id) raws.push({ text: `It takes ${man.firstName} off my crew's work`, k: 'known', about: 'opportunity', mag: 1.5, pro: false });
  }
  if (brief) raws.push(...reactionRaws(brief.reactions.filter((r) => r.kind !== 'cops' || !raws.some((x) => x.about === 'heat' && x.k === 'known'))));
  return { raws, brief, bias: brief?.bias, blocked, manId, instead, skill: skillFor(adv, ctx.topic) };
}

function evalChoice(ctx: Ctx, adv: Character, ref: AdviserRef, ch: Choice, evBrief: AdviceBrief | undefined): Eval {
  const { s } = ctx;
  const ex = explainChoice(s, ch);
  const cost = ch.effects.reduce((x, e) => x + (e.type === 'money' && e.amount < 0 && e.pot !== 'pocket' ? -e.amount : 0), 0);
  const pcost = ch.effects.reduce((x, e) => x + (e.type === 'money' && e.amount < 0 && e.pot === 'pocket' ? -e.amount : 0), 0);
  const eff = ch.effects.filter((e) => !(e.type === 'money' && e.amount < 0));
  const raws: Raw[] = [...effectRaws(s, eff, cost, 'family'), ...(pcost ? effectRaws(s, [], pcost, 'pocket') : []), ...riskRaws(ex)];
  if (ch.disabledReason) raws.push({ text: `Not open to you: ${ch.disabledReason}`, k: 'known', about: 'timing', mag: 10, pro: false });
  // The man in it, and what this option does to him.
  const c = ctx.aboutId ? s.characters[ctx.aboutId] : undefined;
  if (c && c.faction === 'player') {
    const delta = ch.effects.reduce((x, e) => x + (e.type === 'opinion' && e.from === c.id && e.to === s.playerId ? e.amount : 0), 0);
    if (delta) {
      const known = knowsMan(s, adv, ref, c);
      raws.push({ text: known ? `${c.firstName} ${delta > 0 ? 'likes' : 'resents'} it (${signed(delta)}; he thinks ${signed(opinion(s, c.id, s.playerId))} of you now)` : `${c.firstName} ${delta > 0 ? 'should like it' : 'may resent it'}, from what he hears`, k: known ? 'known' : 'estimate', about: 'loyalty', mag: clamp(Math.abs(delta) / 4, 0.6, 5), pro: delta > 0 });
    }
  }
  if (evBrief) raws.push(...reactionRaws(evBrief.reactions.filter((r) => r.text.startsWith(`If you pick "${ch.label}"`)).map((r) => ({ ...r, text: r.text.replace(/^If you pick "[^"]*": /, '') }))));
  if (!raws.some((r) => r.pro)) raws.push({ text: ex.purpose || 'It closes the matter', k: 'known', about: 'gain', mag: clamp(ex.value / 900, 0.4, 3), pro: true });
  return { raws, brief: evBrief, skill: skillFor(adv, 'event') };
}

function evalWait(_ctx: Ctx, adv: Character, it: BriefItem): Eval {
  return {
    raws: [
      { text: 'Costs nothing and commits you to nothing this week', k: 'known', about: 'money', mag: 1.2, pro: true },
      { text: 'Nothing in it the law or the other families can use', k: 'known', about: 'heat', mag: 0.8, pro: true },
      { text: `${it.topic} stays open: "${it.line.length > 90 ? `${it.line.slice(0, 89)}…` : it.line}"`, k: 'known', about: 'timing', mag: 0.5 + it.priority / 3, pro: false },
      { text: `${it.speaker} brought it to you: putting him off is noticed`, k: 'estimate', about: 'loyalty', mag: 0.7, pro: false },
    ],
    skill: skillFor(adv, 'sitdown'),
  };
}

function evalCandidate(ctx: Ctx, adv: Character, ref: AdviserRef, cand: Candidate, hisPick: string | undefined, hisBias: string | undefined): Eval {
  const { s } = ctx;
  const raws: Raw[] = [];
  const c = cand.charId ? s.characters[cand.charId] : undefined;
  for (const x of cand.pros.slice(0, 3)) raws.push({ text: x.text, k: 'known', about: /\$|earn|money|take/i.test(x.text) ? 'money' : /loyal|thinks|respect/i.test(x.text) ? 'loyalty' : 'gain', mag: 1.6, pro: true });
  for (const x of [...cand.cons.slice(0, 2), ...cand.flags.slice(0, 2)]) raws.push({ text: x.text, k: 'known', about: /file|evidence|law|arrest|cop/i.test(x.text) ? 'law' : /debt|money|\$/i.test(x.text) ? 'money' : /rival|courted|Manno|family/i.test(x.text) ? 'rivals' : 'loyalty', mag: 1.6, pro: false });
  raws.push({ text: `${cand.outcome}`, k: 'estimate', about: 'gain', mag: clamp((cand.score - 45) / 10, 0.3, 4), pro: cand.score >= 45 });
  if (cand.opportunityCost) raws.push({ text: cand.opportunityCost, k: 'known', about: 'opportunity', mag: 1.6, pro: false });
  if (c) {
    const l = loyaltyRaw(s, adv, ref, c, 'in a seat like this');
    if (l) raws.push(l);
    if (c.goal === 'take_chair') raws.push({ text: `${c.firstName} makes no secret he wants the chair one day`, k: 'known', about: 'succession', mag: 2, pro: false });
  }
  if (cand.charId && cand.charId === hisPick) raws.push({ text: `${c && c.id === adv.id ? 'He is recommending himself' : 'His own pick for it'}`, k: 'known', about: 'gain', mag: 2.5, pro: true });
  if (ctx.sub.kind === 'seat' && ctx.sub.seat === 'underboss') raws.push({ text: 'The men read the underboss as next in line', k: 'known', about: 'succession', mag: 1.2, pro: true });
  return { raws, bias: cand.charId === hisPick ? hisBias : undefined, blocked: cand.disabledReason, manId: cand.charId, skill: skillFor(adv, 'appoint') };
}

/* ------------------------------------------------------------------ */
/* Weighing                                                            */
/* ------------------------------------------------------------------ */

function confWord(c: number): CounselOpinion['confidenceWord'] { return c >= 70 ? 'Sure' : c >= 45 ? 'Fairly sure' : 'Unsure'; }

const BUT: Record<PointAbout, (ctx: Ctx, e: Eval) => string> = {
  money: (c) => `but keep a month of bills (${fmtMoney(weeklyBills(c.s) * 4)}) in the drawer for a bad week`,
  weekly: () => 'but check the weekly money after a month and close it if it doesn\'t pay',
  gain: () => 'but don\'t count the money before it\'s in the envelope',
  respect: () => 'but do it quietly; the street doesn\'t need to hear it from us',
  heat: (c) => `but keep it quiet while local heat is ${Math.round(c.s.heat.local)}`,
  federal: (c) => `but keep anything federal off it (federal heat is ${Math.round(c.s.heat.federal)})`,
  law: () => 'but use a man the law has no file on',
  loyalty: (c, e) => e.manId && c.s.characters[e.manId] ? `but give ${c.s.characters[e.manId]!.firstName} something; he'll feel it` : 'but talk to the crews first',
  rivals: () => 'but send word to the other families first, or expect a visit',
  philly: () => 'but tell Philadelphia before they hear it from someone else',
  family: () => 'but keep it away from the house',
  succession: () => 'but settle who comes after you before the men start choosing',
  opportunity: () => 'but not with men we need elsewhere this week',
  timing: () => 'but not this week',
};

function weigh(ctx: Ctx, adv: Character, ref: AdviserRef, e: Eval, interest = 0): CounselOpinion {
  const pts = e.raws.map((r) => ({ ...r, w: Math.round(r.mag * mult(adv, ref, r.about, r.pro) * 10) / 10 }));
  const pros = pts.filter((x) => x.pro).sort((a, b) => b.w - a.w);
  const cons = pts.filter((x) => !x.pro).sort((a, b) => b.w - a.w);
  // Fill to two each with real, plain facts when the matter is small.
  const fillPro: Raw[] = [
    { text: `Family money is ${fmtMoney(Math.round(ctx.s.money))}: it can stand it`, k: 'known', about: 'money', mag: 0.3, pro: true },
    { text: 'Nothing in it the law can use', k: 'known', about: 'law', mag: 0.3, pro: true },
  ];
  const fillCon: Raw[] = [
    { text: e.brief?.unknowns[0]?.text ? `Nobody knows: ${e.brief.unknowns[0].text.charAt(0).toLowerCase()}${e.brief.unknowns[0].text.slice(1)}` : 'Nobody knows what the other side does about it', k: 'unknown', about: 'rivals', mag: 0.3, pro: false },
    { text: `Every order is one more thing on the desk this week (local heat ${Math.round(ctx.s.heat.local)})`, k: 'known', about: 'opportunity', mag: 0.2, pro: false },
  ];
  for (const f of fillPro) if (pros.length < 2 && !pros.some((x) => x.about === f.about && !cons.some((y) => y.about === f.about))) pros.push({ ...f, w: 0.3 });
  for (const f of fillCon) if (cons.length < 2) cons.push({ ...f, w: 0.2 });
  const sumW = (xs: { w: number }[]) => xs.reduce((a, x) => a + x.w, 0);
  const score = sumW(pros) - sumW(cons) + interest;
  const topCon = cons[0];
  let verdict: CounselVerdict;
  if (e.blocked) verdict = 'wait';
  else if (score >= 3) verdict = topCon && topCon.w >= 3 ? 'doBut' : 'do';
  else if (score >= 0.5) verdict = topCon && topCon.w >= 1 ? 'doBut' : 'do';
  else if (score >= -2.5) verdict = 'wait';
  else verdict = 'dont';
  const skill = e.skill;
  const confidence = Math.round(clamp((40 + Math.min(45, Math.abs(score) * 5)) * (0.7 + skill / 330), 15, 95));
  const toPoint = (x: Raw & { w: number }): CounselPoint => ({ text: x.text, k: x.k, about: x.about, weight: x.w });
  const op: CounselOpinion = {
    verdict, label: VERDICT_LABEL[verdict], score: Math.round(score * 10) / 10, confidence, confidenceWord: confWord(confidence),
    pros: pros.slice(0, 5).map(toPoint), cons: cons.slice(0, 5).map(toPoint), worry: topCon && topCon.w >= 0.5 ? topCon.about : undefined,
  };
  if (verdict === 'doBut' && topCon) op.but = BUT[topCon.about](ctx, e);
  if ((verdict === 'wait' || verdict === 'dont') && e.blocked) op.instead = 'Clear what blocks it, then ask again next week.';
  else if (verdict === 'wait' || verdict === 'dont') op.instead = e.instead ?? (topCon?.about === 'timing' ? 'Ask again next week.' : 'Leave it this week and look again when things are calmer.');
  return op;
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

const LINES: Record<Stance, Record<CounselVerdict, string[]>> = {
  cautious: {
    do: ['It\'s sound. Even I can\'t find much wrong with it.', 'I looked for the trap in it, Don. I don\'t see one.'],
    doBut: ['It can work —', 'Yes, carefully —'],
    wait: ['I\'d let it sit a week, Don. There\'s more we don\'t know than I like.', 'Not yet. Let\'s see who moves first.'],
    dont: ['Leave this alone, Don. The downside is bigger than it looks.', 'With respect, no. This is how families end up in the newspapers.'],
  },
  bold: {
    do: ['Do it, and do it this week. Nobody respects a man who waits.', 'Say the word and it\'s done, Boss.'],
    doBut: ['Go —', 'I\'m for it —'],
    wait: ['I want to say go. Even I see a problem here.', 'I\'d hold off. Not long.'],
    dont: ['Even I say no to this one.', 'No. That\'s a fight we lose.'],
  },
  money: {
    do: ['The numbers work. It pays for itself.', 'I ran it twice. It makes money.'],
    doBut: ['The money\'s there —', 'It pays —'],
    wait: ['The money\'s thin. I\'d wait.', 'I can\'t make it add up yet.'],
    dont: ['It loses money, and that\'s the end of it for me.', 'You\'d be paying to have a problem.'],
  },
  steady: {
    do: ['Good move. I can have it set up by tomorrow.', 'The men will like it. Let\'s go.'],
    doBut: ['I\'m with you on it —', 'Fine by me —'],
    wait: ['Your call, but I\'d give it a week.', 'Let me talk to people first.'],
    dont: ['I don\'t like it. Not now, maybe not ever.', 'The men won\'t understand this one.'],
  },
};

function says(adv: Character, ref: AdviserRef, op: CounselOpinion, key: string, backsLabel?: string): string {
  const opts = LINES[ref.stance][op.verdict];
  let line = opts[hashSeed(`${adv.id}|${key}`) % opts.length];
  if (op.verdict === 'doBut' && op.but) line = `${line} ${op.but}.`;
  const top = op.verdict === 'do' || op.verdict === 'doBut' ? op.pros[0] : op.cons[0];
  const tail = top ? (op.verdict === 'do' || op.verdict === 'doBut' ? ` What I like is ${ABOUT_WORD[top.about]}.` : ` My worry is ${ABOUT_WORD[top.about]}.`) : '';
  const flavor = hasTrait(adv, 'Hot-headed') ? ' Let\'s stop talking.' : hasTrait(adv, 'Pious') && op.verdict === 'dont' ? ' God forgive me for saying it plain.' : hasTrait(adv, 'Paranoid') && op.verdict !== 'do' ? ' Somebody always talks.' : '';
  const pick = backsLabel ? (op.verdict === 'do' || op.verdict === 'doBut' ? ` I'd go with “${backsLabel}”.` : ` If you must pick one, “${backsLabel}”.`) : '';
  return `"${line}${pick}${tail}${flavor}"`;
}

function blindOf(ref: AdviserRef, adv: Character, brief?: AdviceBrief): string {
  const hears = brief?.unknowns.find((u) => /hears less/.test(u.text));
  if (hears) return hears.text;
  if (ref.role === 'capo') return 'He sees his own crew and his own streets; the other crews he knows by what he hears';
  if (ref.role === 'bagman') return 'He knows the money; the street and the other families he knows second-hand';
  if (ref.role === 'enforcer') return 'He knows the muscle; what the law and Philadelphia think he hears from others';
  if (ref.role === 'fixer') return 'He knows the police and the courthouse; the crews\' moods he hears second-hand';
  return brief?.unknowns[0]?.text ?? `${adv.firstName} can\'t see what the other side plans`;
}

/* ------------------------------------------------------------------ */
/* Subjects                                                            */
/* ------------------------------------------------------------------ */

function roleOf(sub: CounselSubject): Role | undefined {
  if (sub.kind === 'seat') return { kind: 'seat', seat: sub.seat };
  if (sub.kind === 'capo') return { kind: 'capo', district: sub.district };
  if (sub.kind === 'action' && sub.action.kind === 'appoint') return { kind: 'seat', seat: sub.action.seat };
  return undefined;
}

/** The advice subject used for "who sits at the table" (a sit-down item counts as its recommended order, or an event). */
function adviseSubject(s: GameState, sub: CounselSubject): AdviceSubject | undefined {
  if (sub.kind !== 'brief') return sub;
  const it = briefing(s).items.find((x) => x.id === sub.itemId);
  if (!it) return undefined;
  const rec = it.options.find((o) => o.id === it.recommended && o.action) ?? it.options.find((o) => o.action);
  if (rec?.action) return { kind: 'action', action: rec.action };
  if (it.open?.link.event) return { kind: 'event', iid: it.open.link.event };
  return { kind: 'seat', seat: 'underboss' };
}

function topicOf(s: GameState, sub: CounselSubject, a?: PlayerAction): CounselTopic {
  if (sub.kind === 'brief') return 'sitdown';
  if (sub.kind === 'event') return 'event';
  if (sub.kind === 'seat' || sub.kind === 'capo') return 'appoint';
  const act = a ?? sub.action;
  if (act.kind === 'power' && ['designate', 'groom', 'promise', 'announce'].includes(act.op.op)) return 'succession';
  const t = readSubject(s, sub).topic;
  return t === 'other' ? 'other' : t;
}

const WHY: Record<CounselTopic, (s: GameState, c: Counsel, extra: { cost?: number; take?: string; dflt?: string; seat?: string }) => string> = {
  racket: (_s, _c, x) => `A racket is money every week and a standing target every week: ${x.cost ? `${fmtMoney(x.cost)} up front` : 'no money up front'}, and it stays on the books until you close it.`,
  dirty: (_s, _c, x) => `One job, one roll: ${x.take ?? 'a payoff'} if it goes clean — a man in a cell and a file with your name in it if it doesn't.`,
  buy: (s, _c, x) => `${fmtMoney(x.cost ?? 0)} spent here is ${fmtMoney(x.cost ?? 0)} you can't spend on anything else this season (Family money ${fmtMoney(Math.round(s.money))}).`,
  appoint: (_s, _c, x) => `Whoever sits there speaks for you${x.seat ? ` as ${x.seat}` : ''}; the wrong man costs loyalty for years and the passed-over man remembers.`,
  talk: () => 'What you say to one family is heard by every family on the island, and by Philadelphia.',
  event: (_s, _c, x) => `If you don't decide before the week turns, it becomes "${x.dflt ?? 'the default'}" — so not choosing is a choice too.`,
  succession: () => 'Who comes after you decides who stays loyal now: a settled line keeps the crews from choosing sides.',
  sitdown: () => 'Your people brought this to the table because it won\'t go away on its own.',
  other: (_s, c) => `${c.title}: the table weighs what it gets you against what it costs and who might answer it.`,
};

function tallyOf(vs: { verdict: CounselVerdict }[]): Tally {
  return { for: vs.filter((v) => v.verdict === 'do').length, but: vs.filter((v) => v.verdict === 'doBut').length, wait: vs.filter((v) => v.verdict === 'wait').length, against: vs.filter((v) => v.verdict === 'dont').length };
}

function tallyLine(t: Tally): string {
  const parts: string[] = [];
  const f = t.for + t.but;
  if (f) parts.push(`${f} for${t.but ? ` (${t.but} with a but)` : ''}`);
  if (t.wait) parts.push(`${t.wait} wait`);
  if (t.against) parts.push(`${t.against} against`);
  return parts.join(', ') || 'Nobody to ask';
}

function worryOf(vs: CounselOpinion[]): PointAbout | undefined {
  const w: Partial<Record<PointAbout, number>> = {};
  for (const v of vs) for (const c of v.cons) if (c.k !== 'unknown') w[c.about] = (w[c.about] ?? 0) + c.weight;
  const top = (Object.entries(w) as [PointAbout, number][]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return top && top[1] >= 1 ? top[0] : undefined;
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

const memo = new WeakMap<GameState, Map<string, Counsel | null>>();

/** Everyone at the table on one subject. Undefined when the family has nobody free to ask, or the subject is gone. */
export function counsel(s: GameState, sub: CounselSubject): Counsel | undefined {
  const key = JSON.stringify(sub);
  let m = memo.get(s);
  if (!m) { m = new Map(); memo.set(s, m); }
  if (m.has(key)) return m.get(key) ?? undefined;
  const c = build(s, sub, key);
  m.set(key, c ?? null);
  return c;
}

function build(s: GameState, sub: CounselSubject, key: string): Counsel | undefined {
  const as = adviseSubject(s, sub);
  if (!as) return undefined;
  const refs = advisersFor(s, as);
  if (!refs.length) return undefined;
  const rs = readSubject(s, as);
  const ctx: Ctx = { s, sub, topic: topicOf(s, sub), district: rs.district, aboutId: rs.targetId };
  const men = refs.map((r) => ({ ref: r, adv: s.characters[r.charId] })).filter((x): x is { ref: AdviserRef; adv: Character } => !!x.adv);

  // ---- the options ----
  let opts: Opt[] = [];
  let title = '';
  let dflt: string | undefined;
  const extra: { cost?: number; take?: string; dflt?: string; seat?: string } = {};
  const picks: Record<string, { pick?: string; bias?: string }> = {};
  if (sub.kind === 'event') {
    const ev = s.pendingEvents.find((e) => e.iid === sub.iid);
    if (!ev) return undefined;
    title = ev.title;
    opts = ev.choices.map((c) => ({ id: c.id, label: c.label, choice: c, disabled: c.disabledReason }));
    dflt = ev.choices.find((c) => c.id === ev.defaultChoiceId)?.label;
    extra.dflt = dflt;
  } else if (sub.kind === 'brief') {
    const it = briefing(s).items.find((x) => x.id === sub.itemId)!;
    title = `${it.topic} (${it.speaker})`;
    opts = it.options.filter((o: BriefOption) => o.action || o.id === 'wait').map((o) => (o.id === 'wait' ? { id: o.id, label: o.label, wait: { item: it } } : { id: o.id, label: o.label, action: o.action, disabled: o.action ? previewAction(s, o.action).disabledReason : undefined }));
  } else if (roleOf(sub)) {
    const role = roleOf(sub)!;
    const ranking = rankCandidates(s, role);
    title = ranking.question;
    extra.seat = role.kind === 'seat' ? role.seat : 'capo';
    for (const { ref } of men) { const b = adviceBrief(s, as, ref.charId); const p = b?.candidates.find((x) => x.pick); picks[ref.charId] = { pick: p?.charId, bias: b?.bias }; }
    const live = ranking.candidates.filter((c) => c.charId && s.characters[c.charId] && !c.disabledReason);
    const chosen = live.slice(0, 3);
    for (const { pick } of Object.values(picks)) { const c = live.find((x) => x.charId === pick); if (c && !chosen.includes(c)) chosen.push(c); }
    if (sub.kind === 'action' && sub.action.kind === 'appoint') { const want = sub.action.charId; const c = live.find((x) => x.charId === want); if (c && !chosen.includes(c)) chosen.unshift(c); }
    opts = chosen.map((c) => ({ id: c.charId!, label: displayName(s.characters[c.charId!]!), action: c.action, cand: c }));
    if (!opts.length) return undefined;
  } else if (sub.kind === 'action') {
    const a = sub.action;
    const p = previewAction(s, a);
    title = p.title;
    opts = [{ id: 'go', label: p.title, action: a, disabled: p.disabledReason }];
    extra.cost = p.cost;
    if (a.kind === 'dirty') { const js = jobSummary(s, a.op.job, a.op.who, a.op.target, a.op.pay); extra.take = js.take[1] ? `${fmtMoney(js.take[0])}–${fmtMoney(js.take[1])} at ${js.odds}%` : `${js.odds}% odds`; }
  }

  if (!opts.length) return undefined;

  // ---- each man on each option ----
  const evBriefs: Record<string, AdviceBrief | undefined> = {};
  if (sub.kind === 'event') for (const { ref } of men) evBriefs[ref.charId] = adviceBrief(s, sub, ref.charId);
  const grid: { opt: Opt; ops: { ref: AdviserRef; adv: Character; op: CounselOpinion; e: Eval }[] }[] = opts.map((opt) => ({
    opt,
    ops: men.map(({ ref, adv }) => {
      let e: Eval;
      if (opt.choice) e = evalChoice(ctx, adv, ref, opt.choice, evBriefs[ref.charId]);
      else if (opt.wait) e = evalWait(ctx, adv, opt.wait.item);
      else if (opt.cand) e = evalCandidate(ctx, adv, ref, opt.cand, picks[ref.charId]?.pick, picks[ref.charId]?.bias);
      else e = evalAction(ctx, adv, ref, opt.action!);
      if (opt.disabled && !e.blocked) e.blocked = opt.disabled;
      // His interests: his own ground (knowable, so labelled), his own man in it.
      let interest = 0;
      let bias = e.bias;
      const d = ctx.district ? s.districts.find((x) => x.id === ctx.district) : undefined;
      if (ref.role === 'capo' && d?.capoId === adv.id && (ctx.topic === 'racket' || ctx.topic === 'buy')) {
        e.raws.push({ text: `It goes on my ground, ${d.name}: my crew runs it and earns`, k: 'known', about: 'gain', mag: 1.5, pro: true });
        interest += 1.5 + (hasTrait(adv, 'Greedy') ? 1.5 : 0);
        bias = bias ?? `It would be on his own ground (${d.name}): his crew earns from it`;
      }
      const about = ctx.aboutId ? s.characters[ctx.aboutId] : undefined;
      if (about && about.id !== adv.id && sub.kind === 'event') bias = bias ?? biasLabel(s, adv.id, about.id);
      const op = weigh(ctx, adv, ref, e, interest);
      (op as CounselOpinion & { bias?: string }).bias = bias;
      return { ref, adv, op, e };
    }),
  }));

  // ---- one choice among several: a man ranks the options against each other ----
  // The option he backs keeps its verdict; one clearly behind it is "Wait" (not this one), far behind "Don't".
  if (opts.length > 1) {
    men.forEach((_m, i) => {
      const live = grid.filter((g) => !g.opt.disabled);
      if (!live.length) return;
      const best = [...live].sort((a, b) => b.ops[i].op.score - a.ops[i].op.score || opts.indexOf(a.opt) - opts.indexOf(b.opt))[0];
      for (const g of grid) {
        if (g === best) continue;
        const op = g.ops[i].op;
        const gap = best.ops[i].op.score - op.score;
        if ((op.verdict === 'do' || op.verdict === 'doBut') && gap >= 1.5) {
          op.verdict = gap >= 5 ? 'dont' : 'wait';
          op.label = VERDICT_LABEL[op.verdict];
          op.but = undefined;
        }
        if (op.verdict === 'wait' || op.verdict === 'dont') op.instead = `“${best.opt.label}” instead.`;
      }
    });
  }

  // ---- a decision has to be made: the option a man backs is never just "wait" ----
  if (sub.kind === 'event' && opts.length > 1) {
    men.forEach((_m, i) => {
      const live = grid.filter((g) => !g.opt.disabled);
      const best = [...live].sort((a, b) => b.ops[i].op.score - a.ops[i].op.score || opts.indexOf(a.opt) - opts.indexOf(b.opt))[0];
      const op = best?.ops[i].op;
      if (!op || (op.verdict !== 'wait' && op.verdict !== 'dont')) return;
      op.but = op.verdict === 'dont' ? 'but only because the others are worse' : 'but it is a close call';
      op.verdict = 'doBut';
      op.label = VERDICT_LABEL.doBut;
      op.instead = undefined;
    });
  }

  // ---- voices ----
  const multi = opts.length > 1;
  const voices: Voice[] = men.map(({ ref, adv }, i) => {
    const mine = grid.map((g) => ({ opt: g.opt, x: g.ops[i] }));
    const live = mine.filter((m2) => !m2.opt.disabled);
    const bestM = multi ? [...(live.length ? live : mine)].sort((a, b) => b.x.op.score - a.x.op.score || (opts.indexOf(a.opt) - opts.indexOf(b.opt)))[0] : mine[0];
    const op = bestM.x.op;
    const backsLabel = multi ? bestM.opt.label : undefined;
    const v: Voice = {
      ...op, adviser: ref,
      says: says(adv, ref, op, key, backsLabel),
      bias: (op as CounselOpinion & { bias?: string }).bias,
      backs: multi ? bestM.opt.id : undefined, backsLabel,
      blind: blindOf(ref, adv, bestM.x.e.brief),
    };
    return v;
  });
  // On a decision, a man who backs another option says so as his "instead" on each option he passes over.
  const options: CounselOption[] | undefined = multi ? grid.map((g) => {
    const vs: Voice[] = g.ops.map((x, i) => {
      const v = voices[i];
      void v;
      return { ...x.op, adviser: x.ref, says: says(x.adv, x.ref, x.op, `${key}|${g.opt.id}`), bias: (x.op as CounselOpinion & { bias?: string }).bias, blind: blindOf(x.ref, x.adv, x.e.brief) };
    });
    return { id: g.opt.id, label: g.opt.label, disabled: g.opt.disabled, action: g.opt.action, choiceId: g.opt.choice?.id, voices: vs, tally: tallyOf(vs), backers: voices.filter((v) => v.backs === g.opt.id).length };
  }) : undefined;
  if (multi) for (const v of voices) if (v.verdict === 'wait' || v.verdict === 'dont') v.instead = v.instead ?? 'None of these, this week.';

  const tally = tallyOf(voices);
  const worry = worryOf(voices);
  const worryWord = worry ? ABOUT_WORD[worry] : undefined;
  let line: string;
  if (multi && options) {
    const backed = options.filter((o) => o.backers > 0).sort((a, b) => b.backers - a.backers || options.indexOf(a) - options.indexOf(b));
    line = backed.map((o) => `${o.backers} back${o.backers === 1 ? 's' : ''} “${o.label}”`).join(', ');
  } else line = tallyLine(tally);
  if (worryWord) line += ` — main worry: ${worryWord}`;
  const out: Counsel = {
    key, kind: sub.kind, topic: ctx.topic, title,
    why: '',
    summary: { tally, worry, worryWord, line },
    voices,
    ...(options ? { options } : {}),
    ...(sub.kind === 'action' && !multi ? { plan: sub.action } : {}),
    ...(dflt ? { defaultLabel: dflt } : {}),
  };
  out.why = WHY[ctx.topic](s, out, extra);
  return out;
}

/** The short take for a button ("2 for, 1 wait — main worry: federal heat"). */
export function counselLine(s: GameState, sub: CounselSubject): string | undefined {
  return counsel(s, sub)?.summary.line;
}

/** Subjects for "Ask the table" on the Ready-to-advance review and the office: every unanswered decision. */
export function tableSubjectsFor(s: GameState, answered: Record<string, string> = {}): CounselSubject[] {
  return s.pendingEvents.filter((e) => !answered[e.iid]).map((e) => ({ kind: 'event' as const, iid: e.iid }));
}
