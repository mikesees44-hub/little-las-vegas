import { actionSurrenders } from './handover';
import { previewAction, resolveActions } from './actions';
import { explainAction } from './advice';
import { attr } from './attrs';
import { seatDrafts, shortName, type BriefOption, type SeatDraft } from './briefing';
import { capos, displayName, hasTrait, isFree } from './characters';
import { holder, SEAT_INFO } from './council';
import { today, DAY_NAMES } from './days';
import { fmtMoney } from './effects';
import { honesty } from './ledgerbook';
import { money, respect, type Ctx } from './ledger';
import { proofs } from './paper';
import { addOpinion, opinion } from './relations';
import { hashSeed } from './rng';
import { timeCost } from './timeCost';
import { spotLtCands } from './kickup';
import { ensureTribute, noteFavor } from './tributeState';
import type { Character, GameState, PlayerAction, RivalId } from './types';

/**
 * THE LIEUTENANTS AT WORK: the underboss and the consigliere run their side of the business day to day.
 *
 * Each has domains. The underboss has operations: the crews (discipline, morale, recruiting), the
 * collections (envelopes, the book, the count), the rackets' upkeep and the street (corners, small
 * threats, guarding the boss). The consigliere has counsel and the outside world: the lawyers, the
 * pad, the other families (truces and wars), the Table and Philadelphia, the papers, the quarrels
 * between your own capos, and the legitimate places' paperwork.
 *
 * The boss says, per domain, how far each may go: "Handle it" (he acts; you may still stop him before
 * the day), "Ask me first" (he proposes; Approve, Change or Veto before his day comes, or he does it
 * his way), or "I'll do it" (he stays out). Each week, when it turns, each man reads the state and
 * plans up to a few jobs for the coming days (the docket): real orders the boss could give himself,
 * each with his pick among the ways to do it, a day, and his reason. He spends his own hours, not the
 * boss's, and the Family's money only up to the weekly budget the boss sets.
 *
 * His pick is his own: his skill and judgment (a weak man guesses), his temper (a hothead hits back, a
 * careful man goes to the Table), and his agenda (a greedy man likes jobs where the money passes through
 * his hands and keeps a little of it; an ambitious underboss does favors in his own name and builds his
 * following; a man cool toward the boss, or courted by another family, goes easy on that family and
 * makes a quiet understanding with it). The misdeeds are real and hidden; they come out weeks later.
 *
 * Delegating does not count as the boss running his family (neglect.ts still counts an idle boss), but
 * a good lieutenant covers his domains: the count is watched, the men are minded, the corners held,
 * the pad paid. A bad or disloyal one covers nothing and costs more.
 *
 * Saved under `s.briefing.lt` (optional; old saves have none and get the defaults). The docket is
 * planned when the week turns and kept for the week, so the boss's calls key on stable ids. Every roll
 * the lieutenants make (their orders' odds included) comes from their own seeded stream: the main
 * simulation's dice are never moved by them.
 */

export type LtSeat = 'underboss' | 'consigliere';
export type LtDomain = 'crews' | 'collections' | 'rackets' | 'street' | 'law' | 'pad' | 'families' | 'table' | 'press' | 'mediation' | 'paperwork';
export type LtLevel = 'handle' | 'ask' | 'self';

export const LT_SEATS: LtSeat[] = ['underboss', 'consigliere'];

export const DOMAINS: Record<LtDomain, { seat: LtSeat; name: string; blurb: string; def: LtLevel }> = {
  crews: { seat: 'underboss', name: 'The crews', blurb: 'Discipline, sore and wavering men, recruiting, who gets made.', def: 'ask' },
  collections: { seat: 'underboss', name: 'Collections', blurb: 'Short envelopes, the shylock book, the count, washing the cash.', def: 'handle' },
  rackets: { seat: 'underboss', name: 'Rackets upkeep', blurb: 'Staffing, how the places run, a capo\'s earner, a new racket.', def: 'ask' },
  street: { seat: 'underboss', name: 'The street', blurb: 'The corners, small threats, answering a rival\'s strike, guarding you.', def: 'ask' },
  law: { seat: 'consigliere', name: 'Lawyers & bail', blurb: 'The file, the lawyer, lying low.', def: 'ask' },
  pad: { seat: 'consigliere', name: 'The pad', blurb: 'Cops and politicians on the payroll, the heat.', def: 'handle' },
  families: { seat: 'consigliere', name: 'Other families', blurb: 'Negotiations, truces and terms, plans of ours that got out.', def: 'ask' },
  table: { seat: 'consigliere', name: 'The Table & Philadelphia', blurb: 'Disputes before the Table, keeping Philadelphia sweet.', def: 'ask' },
  press: { seat: 'consigliere', name: 'The papers', blurb: 'Spiking a story about us before it runs.', def: 'ask' },
  mediation: { seat: 'consigliere', name: 'Quarrels in the family', blurb: 'Grudges, capos at odds, a man getting too big.', def: 'ask' },
  paperwork: { seat: 'consigliere', name: 'Legitimate paperwork', blurb: 'Stop-work orders, inspectors, permits on your lots.', def: 'handle' },
};

export const DOMAIN_IDS = Object.keys(DOMAINS) as LtDomain[];
export const LEVEL_LABEL: Record<LtLevel, string> = { handle: 'Handle it', ask: 'Ask me first', self: 'I\'ll do it' };

/** Weekly Family money each may spend on his own (the boss sets it). */
export const DEFAULT_BUDGET: Record<LtSeat, number> = { underboss: 1000, consigliere: 750 };
export const BUDGET_STEPS = [0, 250, 500, 750, 1000, 1500, 3000, 6000];
/** His own hours for the Family's business in a week (the rest is his own crew and his own life). */
export const WEEK_HOURS = 16;
/** Jobs a man takes on in a week, at most. */
export const MAX_ACTS = 4;
/** Weeks he gives a job he did to work before he takes up the same subject again (unless it is pressing). */
export const REPEAT_WEEKS = 4;

export interface LtOpt {
  id: string;
  label: string;
  action: PlayerAction;
  cost: number;
  why: string;
  value: number;
  chance?: number;
}

export type LtMotive = 'skim' | 'standing' | 'rival' | 'caution' | 'temper' | 'guess';

export interface LtAct {
  /** `${seat}:${subject}`: stable for the week. */
  id: string;
  seat: LtSeat;
  byId: string;
  domain: LtDomain;
  topic: string;
  /** What he says about it, in his voice. */
  line: string;
  options: LtOpt[];
  /** His pick. */
  pick: string;
  /** The honest best (never shown before the fact). */
  best: string;
  /** Why he picked it, in his words. */
  why: string;
  /** What really drove a pick that is not the best (hidden; the UI shows the tell at most). */
  motive?: LtMotive;
  tell?: string;
  /** The day he acts (0 Monday … 6 Sunday): the deadline for the boss's word. */
  day: number;
  mode: 'handle' | 'ask';
  /** Over his budget: he will not do it without the boss's OK. */
  needsOk?: boolean;
  /** A big step (money out, new ground, a man made, a war move): asked and never answered, he waits for your word instead of acting. */
  waits?: boolean;
  hours: number;
  priority: number;
  charId?: string;
}

export interface LtCall {
  verdict: 'approve' | 'veto' | 'change';
  option?: string;
}

export type LtResult = 'done' | 'failed' | 'vetoed' | 'skipped';

export interface LtLogEntry {
  week: number;
  day: number;
  seat: LtSeat;
  byId: string;
  actId: string;
  domain: LtDomain;
  text: string;
  result: LtResult;
  /** A sound call (his pick was the right one and it went through). */
  good?: boolean;
  /** The boss said yes (or picked the way himself). */
  approved?: boolean;
  cost: number;
}

export interface LtRecord {
  acts: number;
  good: number;
  bad: number;
  vetoed: number;
  /** Weeks the boss vetoed him (the last few). */
  vetoWeeks: number[];
  /** Misdeeds that came out. */
  caught: number;
}

export interface LtHidden {
  id: string;
  kind: 'skim' | 'side';
  byId: string;
  seat: LtSeat;
  week: number;
  amount: number;
  rival?: RivalId;
  /** The week it comes out. */
  due: number;
  /** What happened, in plain words (shown once it is found). */
  text: string;
}

export interface LtFound {
  week: number;
  byId: string;
  kind: LtHidden['kind'];
  amount: number;
  text: string;
  /** Who found it out. */
  via: string;
}

export interface LtState {
  levels: Partial<Record<LtDomain, LtLevel>>;
  budget: Partial<Record<LtSeat, number>>;
  docket?: { week: number; acts: LtAct[] };
  /** The boss's word on this week's docket (act id -> call). */
  calls: Record<string, LtCall>;
  log: LtLogEntry[];
  rec: Record<string, LtRecord>;
  hidden: LtHidden[];
  found: LtFound[];
  rng: number;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function fresh(s: GameState): LtState {
  return { levels: {}, budget: {}, calls: {}, log: [], rec: {}, hidden: [], found: [], rng: hashSeed(`${s.seed}:lieutenants`) };
}

/** Read-only: the save's record, or the defaults (never written). */
export function ltView(s: GameState): LtState {
  return s.briefing?.lt ?? fresh(s);
}

/** The record on a working copy (created on first use). */
export function ensureLt(s: GameState): LtState {
  s.briefing ??= { trust: {}, log: [] };
  return (s.briefing.lt ??= fresh(s));
}

/** A new state with a fresh copy of the lieutenants' record, changed by `f` (for the UI's edits). */
function withLt(s: GameState, f: (lt: LtState) => void): GameState {
  const prev = s.briefing ?? { trust: {}, log: [] };
  const lt0 = prev.lt ?? fresh(s);
  const lt: LtState = { ...lt0, levels: { ...lt0.levels }, budget: { ...lt0.budget }, calls: { ...lt0.calls } };
  // The week's docket is fixed from the first word the boss gives (a level or a budget changed mid-week
  // never reshuffles the days: it is read when they act, and next week is planned with it).
  if (!lt.docket || lt.docket.week !== s.week) { lt.docket = { week: s.week, acts: docketOf(s) }; lt.calls = {}; }
  f(lt);
  return { ...s, briefing: { ...prev, lt } };
}

export function levelOf(s: GameState, d: LtDomain): LtLevel {
  return ltView(s).levels[d] ?? DOMAINS[d].def;
}

export function budgetOf(s: GameState, seat: LtSeat): number {
  return ltView(s).budget[seat] ?? DEFAULT_BUDGET[seat];
}

export function setLevel(s: GameState, d: LtDomain, level: LtLevel): GameState {
  return withLt(s, (lt) => { if (level === DOMAINS[d].def) delete lt.levels[d]; else lt.levels[d] = level; });
}

export function setBudget(s: GameState, seat: LtSeat, amount: number): GameState {
  return withLt(s, (lt) => { lt.budget[seat] = Math.max(0, Math.round(amount)); });
}

/* ------------------------------------------------------------------ */
/* The men                                                             */
/* ------------------------------------------------------------------ */

export interface LtProfile {
  seat: LtSeat;
  c: Character;
  /** 0..1: seat skill and judgment. */
  competence: number;
  /** His opinion of the boss. */
  loyalty: number;
  honesty: number;
  greedy: boolean;
  ambitious: boolean;
  cautious: boolean;
  temper: boolean;
  /** A family courting him, or that he quietly favors. */
  rival?: RivalId;
  disloyal: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function ltProfile(s: GameState, seat: LtSeat): LtProfile | undefined {
  const c = holder(s, seat);
  if (!c) return undefined;
  const skill = c.attributes[SEAT_INFO[seat].skill];
  const judg = attr(s, c, 'judgment');
  const competence = Math.round(clamp01(((skill + judg) / 2 - 30) / 55) * 100) / 100;
  const loyalty = Math.round(opinion(s, c.id, s.playerId));
  const hon = honesty(s, c);
  // His career goal as remembered (underboss.ts), else read off his nature (never written here: this is pure).
  const goal = seat === 'underboss' ? s.tribute?.ubGoals?.[c.id] : undefined;
  const greedy = hasTrait(c, 'Greedy') || goal === 'get_rich' || (!goal && attr(s, c, 'greed') >= 65) || hon < 35;
  const ambitious = hasTrait(c, 'Ambitious') || goal === 'become_boss' || goal === 'kingmaker' || (!goal && (c.goal === 'take_chair' || attr(s, c, 'ambition') >= 72));
  const cautious = hasTrait(c, 'Patient') || hasTrait(c, 'Paranoid') || hasTrait(c, 'Cowardly') || (seat === 'consigliere' && !hasTrait(c, 'Hot-headed'));
  const temper = hasTrait(c, 'Hot-headed') || hasTrait(c, 'Cruel');
  const disloyal = !hasTrait(c, 'Loyal-to-a-fault') && (loyalty <= -15 || !!c.courtedBy);
  return { seat, c, competence, loyalty, honesty: hon, greedy, ambitious, cautious, temper, rival: c.courtedBy?.rival, disloyal };
}

export function competenceWord(q: number): string {
  return q >= 0.75 ? 'Sharp' : q >= 0.55 ? 'Steady' : q >= 0.35 ? 'Uneven' : 'Out of his depth';
}

/* ------------------------------------------------------------------ */
/* What there is to do                                                 */
/* ------------------------------------------------------------------ */

/** Which domain a sit-down subject belongs to (undefined: the boss's own business). */
export function domainOf(s: GameState, d: Pick<SeatDraft, 'id' | 'from'>): LtDomain | undefined {
  const [head, rest] = d.id.split(':');
  switch (head) {
    case 'short': case 'loans': case 'broke': case 'unwashed': return 'collections';
    case 'earner': case 'racket': case 'run': return 'rackets';
    case 'staff': case 'unhappy': case 'drift': case 'make': case 'bones': return 'crews';
    case 'push': case 'plot': return 'street';
    case 'rival': {
      const r = s.rivals.find((x) => x.id === rest);
      return r?.lastMove?.move === 'strike' ? 'street' : 'families';
    }
    case 'war': case 'blown': return 'families';
    case 'dispute': return 'table';
    case 'law': return 'law';
    case 'heat': return rest === 'family' ? 'table' : 'pad';
    case 'grudge': case 'pressure': case 'faction': return 'mediation';
    default: return undefined;
  }
}

function violent(a: PlayerAction): boolean {
  if (a.kind === 'interact') return ['threaten', 'whack', 'demand', 'exile'].includes(a.id);
  if (a.kind === 'order') return ['shakedown', 'hitback', 'expand'].includes(a.key);
  return a.kind === 'raid' || a.kind === 'declareWar' || a.kind === 'pushDistrict';
}

/** Money that passes through his hands (where a greedy man keeps a little). */
function handlesCash(a: PlayerAction): boolean {
  if (a.kind === 'order') return ['shakedown', 'shylock', 'launder'].includes(a.key);
  return a.kind === 'interact' && (a.id === 'threaten' || a.id === 'demand');
}

/** A big step a man asked about does not happen on silence (only on "Handle it" or the boss's yes). */
export function bigStep(a: PlayerAction, cost: number): boolean {
  if (cost > 1000) return true;
  if (a.kind === 'econ' && a.op.type === 'racket') return a.op.cmd.c === 'start' || a.op.cmd.c === 'earner';
  return ['buyBusiness', 'sellBusiness', 'pushDistrict', 'propose', 'declareWar', 'raid', 'terms', 'raiseDispute', 'scheme', 'lend'].includes(a.kind)
    || (a.kind === 'interact' && ['whack', 'exile', 'demote', 'promote', 'make'].includes(a.id));
}

/** A favor to a man, which a lieutenant does in his own name. */
function favorTo(a: PlayerAction): string | undefined {
  return a.kind === 'interact' && ['dinner', 'gift_small', 'gift_large'].includes(a.id) ? a.target : undefined;
}

function rivalOf(s: GameState, a: PlayerAction, subject: string): RivalId | undefined {
  if (a.kind === 'raid' || a.kind === 'terms') return s.wars.find((w) => w.id === a.warId)?.rival as RivalId | undefined;
  if (a.kind === 'raiseDispute' || a.kind === 'declareWar') return a.rival;
  if (a.kind === 'councilTask' && a.task === 'cons_relations') return a.target as RivalId | undefined;
  const [head, rest] = subject.split(':');
  if (head === 'rival') return rest as RivalId;
  if (head === 'war') return s.wars.find((w) => w.id === rest)?.rival as RivalId | undefined;
  return undefined;
}

export interface LtCand {
  id: string;
  seat: LtSeat;
  domain: LtDomain;
  topic: string;
  says: string[];
  priority: number;
  charId?: string;
  opts: LtOpt[];
  /** The draft's own "his reasons" weight per option. */
  self: Record<string, number>;
}

function toOpt(o: BriefOption & { self?: number }): LtOpt {
  return { id: o.id, label: o.label, action: o.action!, cost: o.cost, why: o.why, value: o.value, ...(o.chance !== undefined ? { chance: o.chance } : {}) };
}

/** Extra subjects the sit-down does not carry: the papers, the lots, the standing tasks, capos at odds. */
function extraCands(s: GameState, seatOf: (d: LtDomain) => boolean): LtCand[] {
  const out: LtCand[] = [];
  const mk = (seat: LtSeat, domain: LtDomain, id: string, topic: string, says: string[], priority: number, specs: { id: string; label: string; action: PlayerAction; why: string; bonus?: number }[], charId?: string) => {
    if (!seatOf(domain)) return;
    const opts: LtOpt[] = [];
    for (const sp of specs) {
      const r = realizeOne(s, sp);
      if (r) opts.push(r);
    }
    if (opts.length) out.push({ id, seat, domain, topic, says, priority, opts, self: {}, charId });
  };
  // The papers: a story about us that has not run yet.
  try {
    for (const { it } of proofs(s).slice(0, 1)) {
      mk('consigliere', 'press', `press:${it.id}`, 'A story about us', [`The Tide has something on us for later this week: "${(it.h ?? it.b).slice(0, 60)}". The night editor takes envelopes.`, 'There\'s a story in the galleys with our name in it. I can make it go away.'], 520,
        [{ id: 'kill', label: 'Spike the story', action: { kind: 'paper', op: { op: 'kill', item: it.id } }, why: 'it never runs', bonus: 900 }]);
    }
  } catch { /* no paper yet */ }
  // The lots: stop-work orders and an inspector holding up a permit.
  for (const l of (s.econ?.lots ?? []).filter((x) => x.status === 'owned' || x.status === 'leased')) {
    if (l.stopWork) {
      mk('consigliere', 'paperwork', `lot:${l.id}`, l.address, [`The city hung a stop-work order on ${l.address}. Paperwork, mostly.`, `${l.address} is shut down over the code. I'll see to it.`], 460,
        [{ id: 'fix', label: 'Fix the violations', action: { kind: 'econ', op: { type: 'fixCode', lotId: l.id } }, why: 'clean, and it stays fixed', bonus: 600 },
          { id: 'bribe', label: 'An envelope for the inspector', action: { kind: 'econ', op: { type: 'bribeInspector', lotId: l.id } }, why: 'cheaper, if he takes it' }]);
    } else if (l.stage === 'permits' && (l.permit?.inspector ?? 0) > 0) {
      mk('consigliere', 'paperwork', `lot:${l.id}`, l.address, [`The permit for ${l.address} is sitting on the inspector's desk.`], 380,
        [{ id: 'bribe', label: 'An envelope for the inspector', action: { kind: 'econ', op: { type: 'bribeInspector', lotId: l.id } }, why: 'it gets signed this week', bonus: 400 }]);
    }
  }
  // Capos at odds with each other.
  const ks = capos(s).filter((k) => isFree(s, k));
  let worst: { a: Character; b: Character; v: number } | undefined;
  for (const a of ks) for (const b of ks) if (a.id < b.id) {
    const v = Math.min(opinion(s, a.id, b.id), opinion(s, b.id, a.id));
    if (v <= -25 && (!worst || v < worst.v)) worst = { a, b, v };
  }
  if (worst) {
    const sore = opinion(s, worst.a.id, s.playerId) <= opinion(s, worst.b.id, s.playerId) ? worst.a : worst.b;
    mk('consigliere', 'mediation', `feud:${worst.a.id}:${worst.b.id}`, `${shortName(worst.a)} and ${shortName(worst.b)}`, [`${shortName(worst.a)} and ${shortName(worst.b)} can't be in the same room. Before it turns into something, let me sit them down.`, `Your capos ${shortName(worst.a)} and ${shortName(worst.b)} are at each other. It's the kind of thing that ends in a car trunk.`], 500 - worst.v * 4,
      [{ id: 'dinner', label: `Sit ${shortName(sore)} down`, action: { kind: 'interact', id: 'dinner', target: sore.id }, why: 'hear him out before he does something', bonus: 500 },
        { id: 'gift', label: `Something for ${shortName(sore)}`, action: { kind: 'interact', id: 'gift_small', target: sore.id }, why: 'a sign he is not forgotten' }], sore.id);
  }
  // The underboss's standing job (the council task): the one that fits the week.
  const ub = holder(s, 'underboss');
  if (ub) {
    const sore = ks.filter((k) => opinion(s, k.id, s.playerId) < 0).length;
    const plot = s.schemes.some((x) => x.owner !== 'player' && x.discovered && x.kind === 'murder' && x.targetId === s.playerId);
    const want = plot ? 'ub_guard' : sore >= 2 ? 'ub_discipline' : 'ub_streets';
    const dom: LtDomain = want === 'ub_discipline' ? 'crews' : 'street';
    if (s.council.underboss.task !== want) {
      const label = want === 'ub_guard' ? 'Stay close to you' : want === 'ub_discipline' ? 'Tighten up the crews' : 'Work the corners';
      mk('underboss', dom, `task:${want}`, 'My own time', [want === 'ub_guard' ? 'With what we heard, I want to be next to you, not on the corners.' : want === 'ub_discipline' ? `${sore} of the capos are sore. I'll spend my weeks on the crews.` : 'Things are quiet. I\'ll put my time into the corners, where the money is.'], plot ? 1400 : 300,
        [{ id: 'task', label, action: { kind: 'councilTask', seat: 'underboss', task: want }, why: want === 'ub_guard' ? 'nobody gets close' : want === 'ub_discipline' ? 'the crews stay in line' : 'a share of the week\'s gross', bonus: plot ? 3000 : 400 }]);
    }
  }
  // The consigliere's standing job.
  const cons = holder(s, 'consigliere');
  if (cons) {
    const war = s.wars[0];
    const want = s.heat.family >= 30 ? 'cons_table' : war ? 'cons_relations' : 'cons_secrets';
    const target = want === 'cons_relations' ? war!.rival : undefined;
    const cur = s.council.consigliere;
    // Working on a family he already has a line to is never undone for a quiet week's digging.
    if ((cur.task !== want || (target && cur.target !== target)) && !(want === 'cons_secrets' && cur.task === 'cons_relations')) {
      const r = target ? s.rivals.find((x) => x.id === target) : undefined;
      const dom: LtDomain = want === 'cons_table' ? 'table' : want === 'cons_relations' ? 'families' : 'mediation';
      mk('consigliere', dom, `task:${want}`, 'My own time', [want === 'cons_table' ? 'Philadelphia is unhappy. I\'ll spend my time keeping them sweet.' : want === 'cons_relations' ? `I want to open a line to ${r?.shortName ?? 'them'}. Wars end at a table.` : 'Quiet weeks are for listening. I\'ll find out what people are saying.'], 280,
        [{ id: 'task', label: want === 'cons_table' ? 'Work the Table' : want === 'cons_relations' ? `Open a line to ${r?.shortName ?? 'them'}` : 'Dig for secrets', action: { kind: 'councilTask', seat: 'consigliere', task: want, target }, why: want === 'cons_table' ? 'family heat cools, votes lean our way' : want === 'cons_relations' ? 'slowly wins them over' : 'plots, skimmers and informants come out', bonus: 350 }]);
    }
  }
  return out;
}

function realizeOne(s: GameState, sp: { id: string; label: string; action: PlayerAction; why: string; bonus?: number }): LtOpt | undefined {
  try {
    const p = previewAction(s, sp.action);
    if (p.disabledReason || p.cost > Math.max(0, s.money)) return undefined;
    const ex = explainAction(s, sp.action);
    return { id: sp.id, label: sp.label, action: sp.action, cost: p.cost, why: sp.why, value: ex.value + (sp.bonus ?? 0), ...(ex.chance < 0.995 ? { chance: ex.chance } : {}) };
  } catch {
    return undefined;
  }
}

/** Everything on the table this week, by domain, for the seats that are filled. */
export function ltCandidates(s: GameState): LtCand[] {
  if (s.gameOver) return [];
  const filled: Record<LtSeat, Character | undefined> = { underboss: holder(s, 'underboss'), consigliere: holder(s, 'consigliere') };
  const ok = (d: LtDomain) => !!filled[DOMAINS[d].seat] && levelOf(s, d) !== 'self';
  const out: LtCand[] = [];
  for (const d of seatDrafts(s)) {
    const domain = domainOf(s, d);
    if (!domain || !ok(domain)) continue;
    const seat = DOMAINS[domain].seat;
    const me = filled[seat]!;
    // He does not take himself to dinner, or lean on himself.
    if (d.charId === me.id) continue;
    // Nor does he set another seat's job (the underboss does not tell the consigliere what to work on).
    const opts = d.opts.filter((o) => !(o.action && 'target' in o.action && o.action.target === me.id) && !(o.action?.kind === 'councilTask' && o.action.seat !== seat)).map(toOpt);
    // A war he would end: give him the terms to choose from.
    if (d.id.startsWith('war:')) {
      const w = s.wars.find((x) => `war:${x.id}` === d.id);
      if (w && w.score > 0 && !opts.some((o) => o.id === 'district')) {
        const r = realizeOne(s, { id: 'district', label: 'Demand the district', action: { kind: 'terms', warId: w.id, terms: 'district' }, why: 'we are winning: make them pay for it', bonus: w.score * 20 });
        if (r) opts.push(r);
      }
    }
    if (!opts.length) continue;
    out.push({ id: d.id, seat, domain, topic: d.topic, says: d.says, priority: d.priority, opts, self: Object.fromEntries(d.opts.map((o) => [o.id, o.self])), charId: d.charId });
  }
  out.push(...extraCands(s, ok));
  // The men's own spots (kickup.ts): set-ups, short envelopes, a big earner who wants more.
  for (const c of spotLtCands(s)) {
    if (!ok(c.domain) || filled[c.seat]?.id === c.charId) continue;
    const opts = c.specs.map((sp) => realizeOne(s, sp)).filter((o): o is LtOpt => !!o);
    if (opts.length) out.push({ id: c.id, seat: c.seat, domain: c.domain, topic: c.topic, says: c.says, priority: c.priority, opts, self: {}, ...(c.charId ? { charId: c.charId } : {}) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* How he chooses                                                      */
/* ------------------------------------------------------------------ */

function h01(str: string): number {
  return hashSeed(str) / 4294967296;
}

const TELLS: Record<LtMotive, string[]> = {
  skim: ['He wants to handle the money himself.', 'He offers to count it personally.'],
  standing: ['He says he\'ll take care of it himself.', 'He\'d rather the man heard it from him.'],
  rival: ['He doesn\'t want to make this bigger than it is.', 'He says the other side is reasonable people.'],
  caution: ['He wants to go slow.', 'He doesn\'t like the risk.'],
  temper: ['He\'s already angry about it.', 'He wants to send a message.'],
  guess: ['He isn\'t sure, and it shows.', 'He changes his mind once on the way.'],
};

/** His pick among the ways to do it, and what drove it. Deterministic. */
export function choose(s: GameState, p: LtProfile, c: LtCand): { pick: LtOpt; best: LtOpt; motive?: LtMotive; skip?: boolean } {
  const best = c.opts.reduce((a, b) => (b.value > a.value ? b : a), c.opts[0]);
  const values = c.opts.map((o) => o.value);
  const spread = Math.max(400, Math.max(...values) - Math.min(...values));
  let top = -Infinity;
  let pick = best;
  const partsOf = new Map<string, Partial<Record<LtMotive, number>>>();
  for (const o of c.opts) {
    const parts: Partial<Record<LtMotive, number>> = {};
    const add = (m: LtMotive, v: number) => { parts[m] = (parts[m] ?? 0) + v; };
    add('guess', (h01(`${s.seed}|${s.week}|${c.id}|${o.id}|${p.c.id}`) - 0.5) * spread * (1 - p.competence) * 1.6);
    if (p.cautious && (violent(o.action) || (o.chance ?? 1) < 0.6)) add('caution', -spread * 0.6);
    if (p.temper && violent(o.action)) add('temper', spread * 0.5);
    if (p.greedy && handlesCash(o.action)) add('skim', spread * 0.45);
    if (p.ambitious && p.seat === 'underboss' && favorTo(o.action)) add('standing', spread * 0.45);
    const rv = rivalOf(s, o.action, c.id);
    if (p.disloyal && rv && (!p.rival || p.rival === rv)) add('rival', violent(o.action) || (o.action.kind === 'terms' && o.action.terms !== 'white') || o.action.kind === 'raiseDispute' ? -spread * 0.8 : spread * 0.4);
    add('guess', (c.self[o.id] ?? 0) * (p.greedy || p.ambitious ? 0.5 : 0.15));
    partsOf.set(o.id, parts);
    const v = o.value + Object.values(parts).reduce((a, x) => a + (x ?? 0), 0);
    if (v > top) { top = v; pick = o; }
  }
  // What tipped it: the part that most favored his pick over the best way.
  let motive: LtMotive | undefined;
  if (pick !== best) {
    const pp = partsOf.get(pick.id) ?? {};
    const pb = partsOf.get(best.id) ?? {};
    let gap = 0;
    for (const m of ['guess', 'caution', 'temper', 'skim', 'standing', 'rival'] as LtMotive[]) {
      const g = (pp[m] ?? 0) - (pb[m] ?? 0);
      if (g > gap) { gap = g; motive = m; }
    }
    motive ??= 'guess';
  }
  // A careful man drops a job that is all violence; a man who favors a family drops a job against it.
  const skip = (p.cautious && !p.temper && c.opts.every((o) => violent(o.action)) && c.priority < 1000)
    || (p.disloyal && c.opts.every((o) => { const rv = rivalOf(s, o.action, c.id); return !!rv && (!p.rival || p.rival === rv) && violent(o.action); }));
  return { pick, best, motive, skip };
}

/* ------------------------------------------------------------------ */
/* The docket                                                          */
/* ------------------------------------------------------------------ */

const plans = new WeakMap<GameState, LtAct[]>();

/** Plan the week's jobs from the state as it is (deterministic). */
export function planDocket(s: GameState): LtAct[] {
  const memo = plans.get(s);
  if (memo) return memo;
  const out = plan(s);
  plans.set(s, out);
  return out;
}

function plan(s: GameState): LtAct[] {
  const out: LtAct[] = [];
  const cands = ltCandidates(s);
  for (const seat of LT_SEATS) {
    const p = ltProfile(s, seat);
    if (!p) continue;
    const mine = cands.filter((c) => c.seat === seat).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    let hours = 0;
    let spend = 0;
    const budget = budgetOf(s, seat);
    let nHandle = 0;
    let nAsk = 0;
    const recent = new Set((s.briefing?.lt?.log ?? []).filter((e) => e.result === 'done' && s.week - e.week <= REPEAT_WEEKS).map((e) => e.actId));
    for (const c of mine) {
      if (out.filter((a) => a.seat === seat).length >= MAX_ACTS) break;
      // He saw to it lately: give it time to work.
      if (recent.has(`${seat}:${c.id}`) && c.priority < 1000) continue;
      const ch = choose(s, p, c);
      if (ch.skip) continue;
      const hrs = timeCost(ch.pick.action, s);
      if (hours + hrs > WEEK_HOURS) continue;
      hours += hrs;
      const level = levelOf(s, c.domain);
      // Giving up one of the boss's men is never his to do: he proposes it and waits for the boss (handover.ts).
      const surrender = actionSurrenders(s, ch.pick.action);
      const over = surrender || spend + ch.pick.cost > budget;
      if (!over) spend += ch.pick.cost;
      const mode: LtAct['mode'] = level === 'handle' && !over ? 'handle' : 'ask';
      const day = mode === 'handle' ? Math.min(5, nHandle++) : Math.min(5, 2 + nAsk++);
      const lineSeed = Math.floor(h01(`${s.seed}|${s.week}|${c.id}|line`) * c.says.length);
      out.push({
        id: `${seat}:${c.id}`, seat, byId: p.c.id, domain: c.domain, topic: c.topic, line: c.says[lineSeed] ?? c.says[0] ?? c.topic,
        options: c.opts, pick: ch.pick.id, best: ch.best.id, why: ch.pick.why, ...(ch.motive ? { motive: ch.motive } : {}),
        ...(ch.motive && ch.motive !== 'guess' ? { tell: TELLS[ch.motive][Math.floor(h01(`${s.seed}|${c.id}|tell`) * 2)] } : ch.motive === 'guess' && p.competence < 0.45 ? { tell: TELLS.guess[Math.floor(h01(`${s.seed}|${c.id}|tell`) * 2)] } : {}),
        day, mode, ...(over ? { needsOk: true } : {}), ...(bigStep(ch.pick.action, ch.pick.cost) ? { waits: true } : {}), hours: hrs, priority: Math.round(c.priority), ...(c.charId ? { charId: c.charId } : {}),
      });
    }
  }
  return out;
}

/** This week's docket: the one planned when the week turned, or (a new game, an old save) planned now. */
export function docketOf(s: GameState): LtAct[] {
  const d = s.briefing?.lt?.docket;
  // A man who has left the seat since it was planned does none of it.
  if (d && d.week === s.week) return d.acts.filter((a) => holder(s, a.seat)?.id === a.byId);
  return planDocket(s);
}

/** Planned when the week turns (on the working copy, after next week's events are drawn). */
export function planNextWeek(s: GameState): void {
  if (s.gameOver) return;
  // Never the memo: this working copy has changed all week.
  const acts = plan(s);
  const lt = s.briefing?.lt;
  // A save that never had a lieutenant act and has nothing to plan stays as it was.
  if (!lt && !acts.length) return;
  const l = ensureLt(s);
  l.docket = { week: s.week, acts };
  l.calls = {};
}

/** Ask me first (or over budget: he needs the OK) vs Handle it, as the domain is set now. */
export function modeOf(s: GameState, a: LtAct): LtAct['mode'] {
  return a.needsOk || levelOf(s, a.domain) !== 'handle' ? 'ask' : 'handle';
}

/** Past his day: the boss's word can no longer reach him. */
export function actLocked(s: GameState, a: LtAct): boolean {
  return today(s) > a.day;
}

/** What the boss said about one job this week. */
export function callOf(s: GameState, id: string): LtCall | undefined {
  return ltView(s).calls[id];
}

/** The option he will use (the boss's change, else his own pick). */
export function chosenOpt(s: GameState, a: LtAct): LtOpt | undefined {
  const call = callOf(s, a.id);
  const id = call?.verdict === 'change' && call.option ? call.option : a.pick;
  return a.options.find((o) => o.id === id) ?? a.options.find((o) => o.id === a.pick);
}

/** Proposals waiting for the boss's word (Ask me first, or over budget), not yet past their day. */
export function pendingAsks(s: GameState): LtAct[] {
  if (s.gameOver) return [];
  const calls = ltView(s).calls;
  return docketOf(s).filter((a) => modeOf(s, a) === 'ask' && !calls[a.id] && !actLocked(s, a) && levelOf(s, a.domain) !== 'self');
}

/** The boss's word on a job: approve, veto, or change how (another of the ways). Returns a new state. */
export function ltDecide(s: GameState, id: string, verdict: LtCall['verdict'] | undefined, option?: string): GameState {
  const a = docketOf(s).find((x) => x.id === id);
  if (!a || actLocked(s, a)) return s;
  if (verdict === 'change' && !a.options.some((o) => o.id === option)) return s;
  return withLt(s, (lt) => {
    if (!verdict) delete lt.calls[id];
    else lt.calls[id] = verdict === 'change' ? { verdict, option } : { verdict };
  });
}

/* ------------------------------------------------------------------ */
/* The week: they do it                                                */
/* ------------------------------------------------------------------ */

/** "Lean on him" -> "lean on him" (names keep their capitals). */
export const lc = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);

const sameAction = (a: PlayerAction, b: PlayerAction) => JSON.stringify({ ...a, fund: undefined }) === JSON.stringify({ ...b, fund: undefined });

function rec(lt: LtState, id: string): LtRecord {
  return (lt.rec[id] ??= { acts: 0, good: 0, bad: 0, vetoed: 0, vetoWeeks: [], caught: 0 });
}

/** Run a lieutenant's order on his own dice (the main stream is put back untouched). */
function onOwnDice(s: GameState, lt: LtState, f: () => void): void {
  const main = s.rng;
  s.rng = lt.rng;
  try { f(); } finally { lt.rng = s.rng; s.rng = main; }
}

/**
 * The week turns: each job on the docket is done, stopped or let go, by the boss's word and the rules.
 * `docket` and `calls` are read off the week as the player saw it; `queued` are the boss's own orders
 * and the trusted advisors' (a job already ordered is not done twice).
 */
export function lieutenantsWeek(ctx: Ctx, docket: readonly LtAct[], calls: Record<string, LtCall>, queued: readonly PlayerAction[] = []): string[] {
  const s = ctx.s;
  const lines: string[] = [];
  if (s.gameOver || (!docket.length && !s.briefing?.lt)) return lines;
  const lt = ensureLt(s);
  const spent: Record<LtSeat, number> = { underboss: 0, consigliere: 0 };
  const vetoes: Record<LtSeat, number> = { underboss: 0, consigliere: 0 };
  const boss = s.playerId;
  for (const a of [...docket].sort((x, y) => x.day - y.day || y.priority - x.priority)) {
    if (s.gameOver) break;
    const c = s.characters[a.byId];
    const who = c ? shortName(c) : 'He';
    const title = a.seat === 'underboss' ? 'underboss' : 'consigliere';
    const call = calls[a.id];
    const log = (result: LtResult, text: string, extra: Partial<LtLogEntry> = {}) => {
      lt.log.push({ week: s.week, day: a.day, seat: a.seat, byId: a.byId, actId: a.id, domain: a.domain, text, result, cost: 0, ...extra });
      lines.push(text);
    };
    // The seat changed hands, or he is gone.
    if (!c || holder(s, a.seat)?.id !== a.byId) continue;
    if (levelOf(s, a.domain) === 'self') { log('skipped', `${who} left "${a.topic}" to you, as you said.`); continue; }
    if (call?.verdict === 'veto') {
      vetoes[a.seat]++;
      const r = rec(lt, a.byId);
      r.vetoed++;
      r.vetoWeeks = [...r.vetoWeeks.filter((w) => s.week - w < 4), s.week];
      log('vetoed', `You stopped ${who} (${title}): ${lc(chosenOpt(s, a)?.label ?? a.topic)} (${a.topic}).`);
      continue;
    }
    const approved = call?.verdict === 'approve' || call?.verdict === 'change';
    // Asked about a big step and never answered: he waits for your word (unless you told him to handle it).
    if (a.waits && !approved && levelOf(s, a.domain) !== 'handle') { lt.log.push({ week: s.week, day: a.day, seat: a.seat, byId: a.byId, actId: a.id, domain: a.domain, text: `${who} held off on "${a.topic}": a step that big waits for your word.`, result: 'skipped', cost: 0 }); continue; }
    if (a.needsOk && !approved) { lt.log.push({ week: s.week, day: a.day, seat: a.seat, byId: a.byId, actId: a.id, domain: a.domain, text: `${who} let "${a.topic}" go: over his budget, and you never said yes.`, result: 'skipped', cost: 0 }); continue; }
    const o = chosenOpt(s, a);
    if (!o) continue;
    // Never on his own word: a man is given up only on the boss's explicit yes, whatever the domain's level.
    if (actionSurrenders(s, o.action) && !approved) { lt.log.push({ week: s.week, day: a.day, seat: a.seat, byId: a.byId, actId: a.id, domain: a.domain, text: `${who} did not ${lc(o.label)}: a man's life waits for your word.`, result: 'skipped', cost: 0 }); continue; }
    if (queued.some((q) => sameAction(q, o.action))) { log('skipped', `${who} stood down on "${a.topic}": you had already given the order.`); continue; }
    if (!approved && spent[a.seat] + o.cost > budgetOf(s, a.seat)) { log('skipped', `${who} let "${a.topic}" go: the week's budget was spent.`); continue; }
    if (o.cost > Math.max(0, s.money)) { log('skipped', `${who} couldn't ${lc(o.label)}: the Family is short.`); continue; }
    // He does it, in the boss's name, with the Family's money.
    const before = ctx.log.length;
    const money0 = s.money;
    const action = { ...o.action, fund: 'family' as const };
    const target = favorTo(o.action);
    if (target && !approved) {
      // A dinner or a gift he gives on his own is his, not the boss's: the Family pays, the man owes him.
      if (o.cost > 0) money(ctx, -o.cost, `Your ${title} ${who}: ${lc(o.label)} (${a.topic})`, 'cost');
    } else onOwnDice(s, lt, () => resolveActions(ctx, [action], { strictFunding: true }));
    const said = ctx.log.slice(before);
    const failed = said.some((l) => / refused\.$|^Order not carried out/.test(l));
    const cost = Math.max(0, money0 - s.money);
    spent[a.seat] += cost;
    const good = !failed && o.id === a.best;
    const r = rec(lt, a.byId);
    r.acts++;
    if (good) r.good++; else r.bad++;
    const day = DAY_NAMES[a.day];
    const verdict = failed ? 'it didn\'t take' : good ? 'done' : 'done, though it was not the best way';
    log(failed ? 'failed' : 'done', `${day}: ${who} (${title}) ${call?.verdict === 'change' ? 'did it your way' : approved ? 'had your OK' : 'acted'}: ${lc(o.label)} (${a.topic}): ${verdict}.`, { good, approved, cost });
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `Your ${title} ${who} saw to "${a.topic}": ${lc(o.label)}${failed ? ' (it didn\'t take)' : ''}.`, kind: 'decision' });
    // The boss signed off on a bad call: it is his too.
    if (call?.verdict === 'approve' && !good) respect(ctx, -1, `You signed off on ${who}'s call: ${lc(o.label)} (${a.topic})`, 'event');
    if (call?.verdict === 'approve' && c) addOpinion(s, c.id, boss, 'The boss backs my calls', 2, 1);
    // His standing: the work is seen as his.
    if (!approved) standing(ctx, lt, a, o, c, good, failed);
    // A greedy man keeps a little of what passes through his hands.
    const p = ltProfile(s, a.seat);
    if (p && !failed && handlesCash(o.action) && (a.motive === 'skim' || (p.greedy && p.honesty < 50))) {
      const amt = Math.round(Math.min(1500, 250 + (1 - p.honesty / 100) * 900) / 50) * 50;
      money(ctx, -amt, `${a.seat === 'underboss' ? 'Collection' : 'Arrangement'} costs (per the ${title})`, 'cost');
      hide(s, lt, { kind: 'skim', byId: c.id, seat: a.seat, amount: amt, text: `${displayName(c)} kept ${fmtMoney(amt)} of the money from "${lc(o.label)}" (week ${s.week}) and booked it as costs.` });
    }
    // A man who favors another family makes a quiet understanding with it.
    if (p && a.motive === 'rival') {
      const rv = rivalOf(s, o.action, a.id.split(':').slice(1).join(':')) ?? p.rival;
      const R = rv ? s.rivals.find((x) => x.id === rv) : undefined;
      if (R && s.characters[R.leaderId]?.alive) {
        addOpinion(s, R.leaderId, c.id, 'A reasonable man to deal with', 8, 0.5);
        addOpinion(s, c.id, R.leaderId, 'They treat me with respect', 6, 0.5);
        hide(s, lt, { kind: 'side', byId: c.id, seat: a.seat, amount: 0, rival: R.id as RivalId, text: `${displayName(c)} went easy on ${R.shortName} over "${a.topic}" and has an understanding with ${s.characters[R.leaderId] ? displayName(s.characters[R.leaderId]) : 'their boss'}.` });
      }
    }
  }
  // Second-guessed at every turn: a man notices.
  for (const seat of LT_SEATS) {
    const c = holder(s, seat);
    if (!c || !vetoes[seat]) continue;
    const r = rec(lt, c.id);
    const recent = r.vetoWeeks.length;
    if (vetoes[seat] >= 2 || recent >= 3) {
      addOpinion(s, c.id, boss, 'The boss second-guesses everything I do', -(2 + vetoes[seat]), 0.5);
      lines.push(`${shortName(c)} takes the vetoes personally: he says you don't trust him.`);
    }
  }
  discover(ctx, lt, lines);
  if (lt.log.length > 40) lt.log = lt.log.slice(-40);
  return lines;
}

function standing(ctx: Ctx, lt: LtState, a: LtAct, o: LtOpt, c: Character, good: boolean, failed: boolean): void {
  const s = ctx.s;
  const t = s.tribute ? ensureTribute(s) : undefined;
  const target = favorTo(o.action);
  if (a.seat === 'underboss') {
    if (t && t.ub.id === c.id) t.ub.base = Math.max(0, Math.min(100, t.ub.base + (failed ? -1 : good ? 0.3 : 0.1)));
    // A favor done by him, in his name: the man owes him, not the boss.
    if (target && s.characters[target]?.alive && target !== s.playerId && t && t.ub.id === c.id) {
      const amb = ltProfile(s, 'underboss')?.ambitious;
      noteFavor(s, { byId: c.id, toId: target, kind: 'assistance', amount: o.cost, authority: 'delegated', ...(amb ? {} : { knownBy: [s.playerId] }) });
      addOpinion(s, target, c.id, amb ? `${shortName(c)} looked after me` : 'The underboss saw to it', amb ? 8 : 5, 0.5);
      // A loyal man says it came from the boss; an ambitious one lets it be his.
      if (!amb) addOpinion(s, target, s.playerId, 'The boss sent his underboss', 2, 1);
    }
  } else if (target && s.characters[target]?.alive) {
    addOpinion(s, target, c.id, 'The consigliere heard me out', 5, 0.5);
    if (!ltProfile(s, 'consigliere')?.disloyal) addOpinion(s, target, s.playerId, 'The boss sent his consigliere', 2, 1);
  }
  void lt;
}

function hide(s: GameState, lt: LtState, h: Omit<LtHidden, 'id' | 'week' | 'due'>): void {
  // Who might find out, and how soon: a loyal, sharp man in the other seat, the bagman counting, the consigliere digging.
  const other = ltProfile(s, h.seat === 'underboss' ? 'consigliere' : 'underboss');
  let wait = 9;
  if (other && !other.disloyal) wait -= Math.round(other.competence * 4);
  if (s.council.bagman.task === 'bag_tax' && holder(s, 'bagman')) wait -= 2;
  if (s.council.consigliere.task === 'cons_secrets' && h.seat === 'underboss' && other) wait -= 1;
  wait = Math.max(2, wait + Math.floor(h01(`${s.seed}|${s.week}|${h.byId}|${h.kind}`) * 4));
  lt.hidden.push({ ...h, id: `lh${s.week}_${lt.hidden.length}`, week: s.week, due: s.week + wait });
  if (lt.hidden.length > 30) lt.hidden = lt.hidden.slice(-30);
}

/** What was hidden comes out when its week comes (honestly told; what the boss does about it is his). */
function discover(ctx: Ctx, lt: LtState, lines: string[]): void {
  const s = ctx.s;
  const due = lt.hidden.filter((h) => h.due <= s.week);
  if (!due.length) return;
  lt.hidden = lt.hidden.filter((h) => h.due > s.week);
  // Same man, same kind: told as one.
  const groups = new Map<string, LtHidden[]>();
  for (const h of due) groups.set(`${h.byId}|${h.kind}`, [...(groups.get(`${h.byId}|${h.kind}`) ?? []), h]);
  for (const hs of groups.values()) {
    const h = hs[0];
    const c = s.characters[h.byId];
    const other = holder(s, h.seat === 'underboss' ? 'consigliere' : 'underboss');
    const via = other && other.id !== h.byId && opinion(s, other.id, s.playerId) > -15 ? `${shortName(other)} (your ${h.seat === 'underboss' ? 'consigliere' : 'underboss'})` : 'the books';
    const amount = hs.reduce((a, x) => a + x.amount, 0);
    const text = h.kind === 'skim'
      ? `${via === 'the books' ? 'The books don\'t add up' : `${via} found it`}: ${c ? displayName(c) : 'your man'} skimmed ${fmtMoney(amount)} over ${hs.length} job${hs.length > 1 ? 's' : ''} he ran for you.`
      : `${via === 'the books' ? 'Word gets back to you' : `${via} heard it`}: ${hs[0].text}`;
    lt.found.push({ week: s.week, byId: h.byId, kind: h.kind, amount, text, via });
    if (lt.found.length > 20) lt.found = lt.found.slice(-20);
    rec(lt, h.byId).caught += hs.length;
    ctx.log.push(text);
    lines.push(text);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'decision' });
    if (c?.alive) addOpinion(s, s.playerId, c.id, h.kind === 'skim' ? 'He skimmed from me' : 'He made his own deal with another family', -15, 0.5);
    if (other && via !== 'the books') addOpinion(s, other.id, h.byId, 'I told the boss what he did', -10, 0.5);
  }
}

/* ------------------------------------------------------------------ */
/* Neglect: what a good lieutenant covers                               */
/* ------------------------------------------------------------------ */

export interface LtCover {
  /** The count (collections). */
  count: number;
  /** The men (crews). */
  men: number;
  /** The corners (street). */
  corners: number;
  /** The pad. */
  cops: number;
}

function coverBy(s: GameState, d: LtDomain): number {
  const lv = levelOf(s, d);
  if (lv === 'self') return 0;
  const p = ltProfile(s, DOMAINS[d].seat);
  if (!p) return 0;
  // A skimmer watching the count is no watch at all; a disloyal man covers nothing.
  if (p.disloyal || (d === 'collections' && p.greedy && p.honesty < 50)) return 0;
  const loyal = clamp01((p.loyalty + 40) / 100);
  return Math.round(clamp01(p.competence * 0.7 + loyal * 0.3) * (lv === 'handle' ? 1 : 0.85) * 100) / 100;
}

/** How much of an absent boss's cost each domain's lieutenant takes off (0 none … 1 all of it). */
export function ltCover(s: GameState): LtCover {
  return { count: coverBy(s, 'collections'), men: coverBy(s, 'crews'), corners: coverBy(s, 'street'), cops: coverBy(s, 'pad') };
}

/* ------------------------------------------------------------------ */
/* The boss's view                                                     */
/* ------------------------------------------------------------------ */

export interface MorningReport {
  seat: LtSeat;
  title: string;
  name?: string;
  charId?: string;
  competence: number;
  competenceWord: string;
  /** "9 good calls, 3 bad, 1 caught out". */
  record?: string;
  /** His standing among the men (underboss: his base; consigliere: capos' opinion of him). */
  standing?: number;
  budget: number;
  /** Planned to spend this week (his own picks). */
  planned: number;
  yesterday: LtAct[];
  todayActs: LtAct[];
  coming: LtAct[];
  /** Waiting on the boss (asks, over budget). */
  needs: LtAct[];
  /** Last week's results (shown on Monday). */
  lastWeek: LtLogEntry[];
  found: LtFound[];
  /** Domains he handles, and the ones the boss kept. */
  handles: LtDomain[];
  kept: LtDomain[];
  empty?: string;
}

export function morningReport(s: GameState, seat: LtSeat): MorningReport {
  const lt = ltView(s);
  const p = ltProfile(s, seat);
  const doms = DOMAIN_IDS.filter((d) => DOMAINS[d].seat === seat);
  const handles = doms.filter((d) => levelOf(s, d) !== 'self');
  const kept = doms.filter((d) => levelOf(s, d) === 'self');
  const budget = budgetOf(s, seat);
  const base = { seat, title: SEAT_INFO[seat].name, budget, handles, kept, yesterday: [], todayActs: [], coming: [], needs: [], lastWeek: [], found: [], planned: 0, competence: 0, competenceWord: '' };
  if (!p) return { ...base, empty: seat === 'underboss' ? 'Nobody is underboss: the crews and the collections are all yours.' : 'Nobody is consigliere: the lawyers, the Table and the other families are all yours.' };
  const d = today(s);
  const calls = lt.calls;
  const acts = docketOf(s).filter((a) => a.seat === seat && a.byId === p.c.id && levelOf(s, a.domain) !== 'self' && calls[a.id]?.verdict !== 'veto');
  const r = lt.rec[p.c.id];
  const t = s.tribute;
  const standingV = seat === 'underboss' ? (t?.ub.id === p.c.id ? Math.round(t.ub.base) : undefined) : (() => {
    const ks = capos(s).filter((k) => k.id !== p.c.id);
    return ks.length ? Math.round(ks.reduce((a, k) => a + opinion(s, k.id, p.c.id), 0) / ks.length) : undefined;
  })();
  return {
    ...base,
    name: displayName(p.c), charId: p.c.id, competence: p.competence, competenceWord: competenceWord(p.competence),
    record: r && r.acts + r.caught > 0 ? `${r.good} sound call${r.good === 1 ? '' : 's'}, ${r.bad} poor${r.caught ? `, caught out ${r.caught}×` : ''}` : undefined,
    standing: standingV,
    planned: acts.filter((a) => !a.needsOk).reduce((x, a) => x + (chosenOpt(s, a)?.cost ?? 0), 0),
    yesterday: acts.filter((a) => a.day === d - 1),
    todayActs: acts.filter((a) => a.day === d && !(modeOf(s, a) === 'ask' && !calls[a.id])),
    coming: acts.filter((a) => a.day > d && !(modeOf(s, a) === 'ask' && !calls[a.id])),
    needs: acts.filter((a) => modeOf(s, a) === 'ask' && !calls[a.id] && a.day >= d),
    lastWeek: d === 0 ? lt.log.filter((e) => e.week === s.week - 1 && e.seat === seat) : [],
    found: lt.found.filter((f) => s.week - f.week <= 1),
  };
}

/** "Underboss plans: lean on Vito — Thursday." */
export function actTitle(s: GameState, a: LtAct): string {
  const o = chosenOpt(s, a);
  return `${a.seat === 'underboss' ? 'Underboss' : 'Consigliere'} plans: ${lc(o?.label ?? a.topic)} (${a.topic}) — ${DAY_NAMES[a.day]}`;
}

/** What happens if the boss says nothing. */
export function ifSilent(a: LtAct): string {
  return a.needsOk ? 'Over his budget: without your OK he lets it go.' : a.waits ? 'A big step: without your word he waits.' : `If you say nothing, he does it ${DAY_NAMES[a.day]}.`;
}

/** The record of one man as the boss's lieutenant. */
export function ltRecordOf(s: GameState, charId: string): LtRecord | undefined {
  return ltView(s).rec[charId];
}

