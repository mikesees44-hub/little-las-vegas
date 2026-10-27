import { previewAction } from './actions';
import { compareChoices, explainAction, type ActionExplanation } from './advice';
import { selfInterest, tieTo } from './advisors';
import { rankCandidates, type Candidate, type Role } from './candidates';
import { CATALOG } from './catalog';
import { ZONES_BY_ID } from './property';
import { capos, displayName, hasTrait, isFree } from './characters';
import { holder, SEAT_INFO } from './council';
import { crewFor, JOBS_BY_ID, targetsFor } from './dirtyWork';
import { isRivalMob } from './ears';
import { fmtMoney } from './effects';
import { bestDistrict } from './racketLife';
import { runnersFor, startSummary } from './racketMenu';
import { opinion } from './relations';
import { hashSeed } from './rng';
import { knownPromises } from './shadow';
import { talkOdds, TALKS } from './talks';
import type { Character, Effect, EventInstance, GameState, PlayerAction, RivalId, Seat } from './types';

/**
 * ADVISER BRIEFINGS. Click on a racket, a job, a place, a man, a seat, a talk
 * or a decision, and one of your people tells you what it gets you, what it
 * takes, what stands in the way, whom he would put on it and why, and who
 * might answer it — the rivals, the crews, the cops.
 *
 * An adviser is a person, not an oracle:
 *  - he speaks from what HE knows. Facts the player can see are "known";
 *    his reads of odds, takes and moods are "estimates" (worse the weaker his
 *    skill, and they can be wrong); what nobody in the family has heard is
 *    "unknown" and is said to be unknown, never filled in.
 *  - his personality colours the advice (a consigliere is careful, a capo
 *    pushes, a greedy man counts money), and his loyalties tilt his pick of
 *    candidates. A tilt is only LABELLED when the player could know of it
 *    (his own kin, his own men, a promise the player has heard of); a private
 *    friendship tilts him without a label.
 *  - retaliation is never certain: plausible reactions with their reasons.
 *
 * Pure and deterministic: the same state, subject and adviser give the same
 * briefing. Nothing here executes anything; the briefing only points at the
 * order the player may queue himself.
 *
 * Built so the leadership team's mandates can plug in later: a mandate source
 * (registerMandateSource) can say what an officer may decide on his own, and
 * the briefing then says whether this matter is within his authority.
 */

export type Certainty = 'known' | 'estimate' | 'unknown';
export type AdviserRole = 'underboss' | 'consigliere' | 'capo' | 'bagman' | 'fixer' | 'enforcer';
export type Stance = 'cautious' | 'bold' | 'steady' | 'money';
export type Topic = 'racket' | 'dirty' | 'buy' | 'appoint' | 'talk' | 'event' | 'other';

export type AdviceSubject =
  | { kind: 'action'; action: PlayerAction }
  | { kind: 'seat'; seat: Seat }
  | { kind: 'capo'; district: string }
  | { kind: 'event'; iid: string };

export interface BriefLine { text: string; k: Certainty }

export interface AdviserRef {
  role: AdviserRole;
  charId: string;
  name: string;
  /** "Your underboss", "Capo of Rio Grande". */
  title: string;
  stance: Stance;
}

export interface BriefCandidate {
  charId: string;
  name: string;
  /** Why he would (or would not) be the man: skills, availability, relationship. */
  why: BriefLine[];
  /** His odds or take, as the adviser reads them. */
  outlook?: BriefLine;
  pick: boolean;
  /** A possible bias the player could know of ("one of his own men"). Never set for a tie the player can't see. */
  bias?: string;
  /** The order that puts him on it. */
  action?: PlayerAction;
  unavailable?: string;
}

export type Likelihood = 'unlikely' | 'possible' | 'likely';
export interface Reaction {
  who: string;
  whoId?: string;
  kind: 'rival' | 'crew' | 'cops' | 'philly' | 'town' | 'family';
  text: string;
  likelihood: Likelihood;
  reasons: string[];
  k: Certainty;
}

export interface AdviserMandate {
  /** 1 Ask me first · 2 Handle routine · 3 Broad discretion within limits · 4 Acting boss. */
  level: 1 | 2 | 3 | 4;
  /** What he may spend without asking. */
  spendLimit: number;
}
export type MandateSource = (s: GameState, adviserId: string) => AdviserMandate | undefined;
let mandateSource: MandateSource | undefined;
/** The leadership team (later) says what each officer may decide alone. */
export function registerMandateSource(f: MandateSource | undefined): void { mandateSource = f; }

export interface AdviceBrief {
  /** Stable for (subject, adviser): the UI recomputes when it changes. */
  key: string;
  topic: Topic;
  /** A full panel (true) or a short note (routine). */
  major: boolean;
  title: string;
  adviser: AdviserRef;
  /** "Ask another adviser". */
  others: AdviserRef[];
  /** One or two sentences in his voice. */
  opener: string;
  verdict: { text: string; tone: 'go' | 'wait' | 'no' | 'blocked' };
  accomplishes: BriefLine[];
  /** Requirements, prep, cost and who pays, timing. */
  requirements: BriefLine[];
  /** Obstacles and conflicting commitments. */
  obstacles: BriefLine[];
  candidates: BriefCandidate[];
  /** What he recommends doing: an order to queue, or an option of a decision. */
  recommendation?: { text: string; action?: PlayerAction; choiceId?: string; charId?: string };
  reactions: Reaction[];
  /** What nobody in the family knows. */
  unknowns: BriefLine[];
  /** A labelled possible bias (only what the player could know). */
  bias?: string;
  /** With a mandate source: whether he could handle this on his own authority. */
  authority?: { mandate: AdviserMandate; within: boolean; note: string };
  /** The plan he is talking about (View plan). */
  plan?: PlayerAction;
}

/* ------------------------------------------------------------------ */
/* Advisers                                                            */
/* ------------------------------------------------------------------ */

const ROLE_TITLE: Record<AdviserRole, string> = { underboss: 'Your underboss', consigliere: 'Your consigliere', capo: 'Capo', bagman: 'Your bagman', fixer: 'Your fixer', enforcer: 'Your enforcer' };
const BASE_STANCE: Record<AdviserRole, Stance> = { underboss: 'steady', consigliere: 'cautious', capo: 'bold', bagman: 'money', fixer: 'cautious', enforcer: 'bold' };

function stanceOf(c: Character, role: AdviserRole): Stance {
  if (hasTrait(c, 'Hot-headed') || hasTrait(c, 'Cruel')) return 'bold';
  if (hasTrait(c, 'Patient') || hasTrait(c, 'Paranoid') || hasTrait(c, 'Cowardly')) return 'cautious';
  if (hasTrait(c, 'Greedy') && role !== 'consigliere') return 'money';
  return BASE_STANCE[role];
}

const usable = (s: GameState, c: Character | undefined): c is Character => !!c && c.alive && c.id !== s.playerId && c.faction === 'player' && isFree(s, c);

function ref(s: GameState, c: Character, role: AdviserRole, district?: string): AdviserRef {
  const d = district ? s.districts.find((x) => x.id === district) : s.districts.find((x) => x.capoId === c.id);
  return { role, charId: c.id, name: displayName(c), title: role === 'capo' ? `Capo${d ? ` of ${d.name}` : ''}` : ROLE_TITLE[role], stance: stanceOf(c, role) };
}

function underbossOf(s: GameState): Character | undefined {
  const h = holder(s, 'underboss');
  return usable(s, h) ? h : Object.values(s.characters).find((c) => usable(s, c) && c.rank === 'underboss');
}
function consigliereOf(s: GameState): Character | undefined {
  const h = holder(s, 'consigliere');
  return usable(s, h) ? h : Object.values(s.characters).find((c) => usable(s, c) && c.rank === 'consigliere');
}

/** The topic, the district and the money/muscle/law flavour of a subject. */
function readSubject(s: GameState, sub: AdviceSubject): { topic: Topic; district?: string; action?: PlayerAction; ev?: EventInstance; rival?: RivalId; targetId?: string } {
  if (sub.kind === 'seat') return { topic: 'appoint' };
  if (sub.kind === 'capo') return { topic: 'appoint', district: sub.district };
  if (sub.kind === 'event') {
    const ev = s.pendingEvents.find((e) => e.iid === sub.iid);
    const cid = ev?.meta?.charId ? String(ev.meta.charId) : ev?.actors?.[0];
    const c = cid ? s.characters[cid] : undefined;
    const district = c ? s.districts.find((d) => d.capoId === (c.rank === 'capo' ? c.id : c.capoId))?.id : undefined;
    return { topic: 'event', ev, district, targetId: cid, rival: c ? isRivalMob(s, c) : undefined };
  }
  const a = sub.action;
  switch (a.kind) {
    case 'econ':
      if (a.op.type === 'racket' && a.op.cmd.c === 'start') return { topic: 'racket', action: a, district: a.op.cmd.district ?? bestDistrict(s, a.op.cmd.kind) };
      if (a.op.type === 'buyLot' || a.op.type === 'leaseLot') {
        const lotId = a.op.lotId;
        const lot = s.econ?.lots.find((l) => l.id === lotId);
        return { topic: 'buy', action: a, district: lot ? ZONES_BY_ID[lot.zone]?.district : undefined };
      }
      if (a.op.type === 'deal') return { topic: 'buy', action: a };
      return { topic: 'other', action: a };
    case 'buyBusiness': return { topic: 'buy', action: a, district: a.district };
    case 'dirty': {
      const t = a.op.target ? targetsFor(s, a.op.job).find((x) => x.id === a.op.target) : undefined;
      return { topic: 'dirty', action: a, district: t?.district, rival: t?.rival, targetId: a.op.target && s.characters[a.op.target] ? a.op.target : undefined };
    }
    case 'scheme': {
      const c = a.targetId ? s.characters[a.targetId] : undefined;
      return { topic: a.scheme === 'envoy' ? 'talk' : 'dirty', action: a, targetId: a.targetId, rival: c ? isRivalMob(s, c) : undefined };
    }
    case 'appoint': return { topic: 'appoint', action: a };
    case 'talk': {
      const c = a.op.t === 'ask' ? s.characters[a.op.target] : undefined;
      return { topic: 'talk', action: a, targetId: c?.id, rival: c ? isRivalMob(s, c) : undefined };
    }
    case 'interact': {
      const c = s.characters[a.target];
      const hostile = ['whack', 'threaten', 'demand', 'expose'].includes(a.id);
      return { topic: hostile ? 'dirty' : a.id === 'promote' ? 'appoint' : 'talk', action: a, targetId: a.target, rival: c ? isRivalMob(s, c) : undefined };
    }
    case 'pushDistrict': case 'declareWar': return { topic: 'dirty', action: a, district: a.district, rival: a.kind === 'declareWar' ? a.rival : undefined };
    default: return { topic: 'other', action: a };
  }
}

/** Who can advise on this, the default first: the underboss, the consigliere, the capo it concerns, then the bagman, fixer or enforcer when it is their trade. */
export function advisersFor(s: GameState, sub: AdviceSubject): AdviserRef[] {
  const r = readSubject(s, sub);
  const out: AdviserRef[] = [];
  const add = (c: Character | undefined, role: AdviserRole, district?: string) => { if (usable(s, c) && !out.some((x) => x.charId === c.id)) out.push(ref(s, c, role, district)); };
  add(underbossOf(s), 'underboss');
  add(consigliereOf(s), 'consigliere');
  const d = r.district ? s.districts.find((x) => x.id === r.district) : undefined;
  if (d?.capoId) add(s.characters[d.capoId], 'capo', d.id);
  if (r.topic === 'racket' || r.topic === 'buy') add(holder(s, 'bagman'), 'bagman');
  if (r.topic === 'talk' || r.topic === 'buy' || r.topic === 'event') add(holder(s, 'fixer'), 'fixer');
  if (r.topic === 'dirty') add(holder(s, 'enforcer'), 'enforcer');
  // No capo for this ground: the capo who knows the street best can still speak.
  if (!out.some((x) => x.role === 'capo') && (r.topic === 'dirty' || r.topic === 'racket')) add(capos(s).filter((k) => usable(s, k)).sort((a, b) => b.attributes.leadership - a.attributes.leadership || (a.id < b.id ? -1 : 1))[0], 'capo');
  if (!out.length) add(capos(s).find((k) => usable(s, k)), 'capo');
  return out;
}

/* ------------------------------------------------------------------ */
/* His reads: estimates coloured by skill (and sometimes off)          */
/* ------------------------------------------------------------------ */

/** A deterministic error for one adviser on one thing: up to ±40% with no skill, none at 100. */
function readErr(adv: Character, key: string, skill: number): number {
  const h = hashSeed(`${adv.id}|${key}`) % 1000;
  return ((h / 1000) - 0.5) * 2 * Math.max(0, 100 - skill) / 250;
}
const pctRead = (adv: Character, key: string, skill: number, p: number) => Math.max(2, Math.min(97, Math.round(p * 100 * (1 + readErr(adv, key, skill)))));
const moneyRead = (adv: Character, key: string, skill: number, v: number) => Math.round((v * (1 + readErr(adv, key, skill))) / 10) * 10;

const SKILL_WORD: Record<string, string> = { leadership: 'Leadership', business: 'Business', diplomacy: 'Diplomacy', intrigue: 'Intrigue', force: 'Muscle', discipline: 'Discipline' };

const LIKE: Likelihood[] = ['unlikely', 'possible', 'likely'];
const likeOf = (score: number): Likelihood => (score >= 60 ? 'likely' : score >= 30 ? 'possible' : 'unlikely');

/* ------------------------------------------------------------------ */
/* Reactions: plausible, with reasons, never certain                   */
/* ------------------------------------------------------------------ */

function rivalReaction(s: GameState, adv: Character, rid: RivalId, what: string, base: number, why: string[]): Reaction | undefined {
  const r = s.rivals.find((x) => x.id === rid);
  if (!r || r.kind === 'law') return undefined;
  const lead = s.characters[r.leaderId];
  const reasons = [...why];
  let v = base;
  const op = lead ? opinion(s, lead.id, s.playerId) : 0;
  if (op <= -20) { v += 20; reasons.push(`${r.shortName} already thinks badly of you (${op})`); }
  else if (op >= 25) { v -= 20; reasons.push(`${r.shortName} is friendly with you (${op})`); }
  if (r.war) { v += 25; reasons.push('you are at war'); }
  if (r.feud) { v += 20; reasons.push('there is blood between you'); }
  if (lead && (hasTrait(lead, 'Hot-headed') || hasTrait(lead, 'Vengeful'))) { v += 15; reasons.push(`${lead.firstName} is ${hasTrait(lead, 'Hot-headed') ? 'hot-headed' : 'vengeful'}`); }
  if (lead && (hasTrait(lead, 'Patient') || hasTrait(lead, 'Cowardly'))) { v -= 12; reasons.push(`${lead.firstName} is ${hasTrait(lead, 'Patient') ? 'patient' : 'careful'}: he waits`); }
  if (r.muscle >= 60) { v += 8; reasons.push(`they have the muscle (${Math.round(r.muscle)})`); }
  else if (r.muscle < 30) { v -= 10; reasons.push('they are short of muscle'); }
  // His read of a rival is as good as his intrigue: the number moves, the reasons stay.
  v = v * (1 + readErr(adv, `riv:${rid}:${what}`, adv.attributes.intrigue));
  return { who: r.shortName, whoId: r.leaderId, kind: r.id === 'philly' ? 'philly' : 'rival', text: what, likelihood: likeOf(v), reasons, k: 'estimate' };
}

function copsReaction(s: GameState, effects: readonly Effect[], extra = 0, why?: string): Reaction | undefined {
  const local = effects.reduce((a, e) => a + (e.type === 'heat' && e.bar === 'local' ? Math.max(0, e.amount) : 0), 0) + extra;
  const fed = effects.reduce((a, e) => a + (e.type === 'heat' && e.bar === 'federal' ? Math.max(0, e.amount) : 0), 0);
  if (local + fed <= 0) return undefined;
  const reasons: string[] = [];
  if (why) reasons.push(why);
  if (local) reasons.push(`+${local} local heat on top of ${Math.round(s.heat.local)}`);
  if (fed) reasons.push(`+${fed} federal heat on top of ${Math.round(s.heat.federal)}`);
  const v = (s.heat.local + local) * 0.6 + (s.heat.federal + fed) * 0.8 - 10;
  return { who: fed ? 'The cops and the feds' : 'The Wildwood police', kind: 'cops', text: fed ? 'A closer look from the feds: a file opened, a man followed' : 'More patrols, a raid on the place most exposed', likelihood: likeOf(v), reasons, k: 'estimate' };
}

/* ------------------------------------------------------------------ */
/* Candidates, with his tilt                                           */
/* ------------------------------------------------------------------ */

interface RawCand { c: Character; score: number; why: BriefLine[]; outlook?: BriefLine; action?: PlayerAction; unavailable?: string }

/** A bias the player could know of: kin, his own men, himself, or a promise the player has heard of. */
function knowableBias(s: GameState, adv: Character, c: Character, tie: string | undefined): string | undefined {
  const pr = knownPromises(s).find((x) => x.p.maker === adv.id && x.p.to === c.id && x.p.status === 'outstanding');
  if (pr) return `He promised ${c.firstName} ${pr.p.role} (you ${pr.b.lvl === 'confirmed' ? 'know it' : 'heard it as a rumor'})`;
  if (tie === 'himself') return 'He is recommending himself';
  if (tie === 'his own kin') return `${c.firstName} is his own kin`;
  if (tie === 'one of his own men') return `${c.firstName} is one of his own men`;
  const seen = s.shadow?.views?.[adv.id];
  if (seen?.prefer === c.id) return `You ${seen.lvl === 'confirmed' ? 'know' : 'heard'} he backs ${c.firstName} for the chair`;
  return undefined;
}

/** The label (if any) the player would see on this adviser's backing of this man. */
export function biasLabel(s: GameState, adviserId: string, candId: string): string | undefined {
  const a = s.characters[adviserId];
  const c = s.characters[candId];
  if (!a || !c) return undefined;
  return knowableBias(s, a, c, tieTo(s, a, c, false)?.text);
}

function pickCandidates(s: GameState, adv: Character, raw: RawCand[], stepUp = false): { list: BriefCandidate[]; bias?: string } {
  const live = raw.filter((x) => !x.unavailable);
  const w = selfInterest(s, adv);
  let best: { x: RawCand; v: number; tie?: string } | undefined;
  for (const x of live) {
    const t = tieTo(s, adv, x.c, stepUp);
    const op = x.c.id !== adv.id ? opinion(s, adv.id, x.c.id) : 0;
    const v = x.score + w * (op * 0.3 + (t?.bonus ?? 0) * 0.5);
    if (!best || v > best.v || (v === best.v && x.c.id < best.x.c.id)) best = { x, v, tie: t?.text };
  }
  const fair = [...live].sort((a, b) => b.score - a.score || (a.c.id < b.c.id ? -1 : 1))[0];
  const bias = best ? knowableBias(s, adv, best.x.c, best.tie) : undefined;
  const top = [...raw].sort((a, b) => Number(!!a.unavailable) - Number(!!b.unavailable) || b.score - a.score || (a.c.id < b.c.id ? -1 : 1)).slice(0, 4);
  if (best && !top.includes(best.x)) top.splice(3, 1, best.x);
  const list = top.map((x): BriefCandidate => ({
    charId: x.c.id, name: displayName(x.c), why: x.why, outlook: x.outlook, pick: x === best?.x,
    bias: x === best?.x ? bias : undefined, action: x.action, unavailable: x.unavailable,
  }));
  // He tells you when the man he names is not the strongest on paper.
  if (best && fair && best.x !== fair) {
    const p = list.find((y) => y.pick);
    if (p) p.why = [...p.why, { text: `On the numbers ${fair.c.firstName} looks stronger; he names ${best.x.c.firstName} anyway`, k: 'known' }];
  }
  return { list, bias };
}

function loyaltyLine(s: GameState, c: Character): BriefLine {
  const op = opinion(s, c.id, s.playerId);
  return { text: `Thinks ${op >= 0 ? '+' : ''}${op} of you`, k: 'known' };
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

function stanceScore(stance: Stance, ex: ActionExplanation): number {
  const risk = ex.risks.reduce((a, r) => a + r.chance * (r.severity === 'high' ? 3 : r.severity === 'mid' ? 2 : 1), 0);
  const money = [...ex.gains, ...ex.costs].filter((n) => n.stat === 'money').reduce((a, n) => a + ((n.min ?? 0) + (n.max ?? 0)) / 2 * (n.when === 'per week' ? 20 : 1), 0);
  const respect = [...ex.gains, ...ex.costs].filter((n) => n.stat === 'respect').reduce((a, n) => a + (n.min ?? 0), 0);
  switch (stance) {
    case 'cautious': return ex.value - risk * 2500;
    case 'bold': return ex.value * 1.1 + respect * 400 - risk * 600;
    case 'money': return money * 1.2 + ex.value * 0.3 - risk * 1000;
    default: return ex.value - risk * 1400;
  }
}

function verdictFor(stance: Stance, ex: ActionExplanation, blocked?: string): AdviceBrief['verdict'] {
  if (blocked) return { text: `Not yet: ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)}`, tone: 'blocked' };
  const v = stanceScore(stance, ex);
  if (v >= 600) return { text: 'He would do it', tone: 'go' };
  if (v >= -600) return { text: 'He could go either way', tone: 'wait' };
  return { text: 'He would not do it', tone: 'no' };
}

function opener(stance: Stance, verdict: AdviceBrief['verdict'], topic: Topic, loyal: number): string {
  const blunt = loyal < -20 ? ' You asked.' : '';
  if (verdict.tone === 'blocked') return `"It can't be done this week. ${verdict.text.replace(/^Not yet: /, '').replace(/^./, (x) => x.toUpperCase())}."`;
  const T: Record<Stance, Record<AdviceBrief['verdict']['tone'], string>> = {
    cautious: { go: 'It is sound. I would still do it quietly.', wait: 'I would wait. There is more we don\'t know than I like.', no: 'Don, I would leave this alone. The downside is bigger than it looks.', blocked: '' },
    bold: { go: 'Do it, and do it this week. Nobody respects a man who waits.', wait: 'I say go. The others will tell you to sit on it.', no: 'Even I say no to this one.', blocked: '' },
    money: { go: 'The numbers work. It pays for itself.', wait: 'The money is thin. Maybe, if you want it for other reasons.', no: 'It loses money, and that is the end of it for me.', blocked: '' },
    steady: { go: 'Good move. I can have it set up.', wait: 'Your call. I see it both ways.', no: 'I don\'t like it. Not now.', blocked: '' },
  };
  const line = T[stance][verdict.tone];
  const tail = topic === 'appoint' && verdict.tone !== 'no' ? ' Who gets it matters more than when.' : '';
  return `"${line}${tail}${blunt}"`;
}

/* ------------------------------------------------------------------ */
/* The brief                                                           */
/* ------------------------------------------------------------------ */

function costLines(s: GameState, a: PlayerAction): BriefLine[] {
  const p = previewAction(s, a);
  const out: BriefLine[] = [];
  out.push({ text: p.cost > 0 ? `${fmtMoney(p.cost)} from ${p.pot === 'pocket' ? 'your pocket' : 'Family money'} (Family money now ${fmtMoney(Math.round(s.money))})` : 'No money up front', k: 'known' });
  out.push({ text: 'Happens when you advance the week; you can cancel it until then', k: 'known' });
  return out;
}

function baseBrief(sub: AdviceSubject, adv: AdviserRef, others: AdviserRef[], topic: Topic): Omit<AdviceBrief, 'opener' | 'verdict' | 'title' | 'major'> {
  return { key: `${JSON.stringify(sub)}|${adv.charId}`, topic, adviser: adv, others, accomplishes: [], requirements: [], obstacles: [], candidates: [], reactions: [], unknowns: [] };
}

/**
 * The briefing on one subject from one adviser (default: the first of
 * advisersFor, normally the underboss). Undefined only when the family has
 * nobody free to advise.
 */
export function adviceBrief(s: GameState, sub: AdviceSubject, adviserId?: string): AdviceBrief | undefined {
  const all = advisersFor(s, sub);
  const me = (adviserId ? all.find((x) => x.charId === adviserId) : undefined) ?? all[0];
  if (!me) return undefined;
  const adv = s.characters[me.charId];
  const others = all.filter((x) => x.charId !== me.charId);
  const r = readSubject(s, sub);
  const b = baseBrief(sub, me, others, r.topic);
  let title = 'His advice';
  let ex: ActionExplanation | undefined;
  let blocked: string | undefined;
  let major = false;

  // ---- A decision on the desk ----
  if (sub.kind === 'event') {
    const ev = r.ev;
    if (!ev) return undefined;
    title = ev.title;
    major = ev.mandatory || ev.priority >= 5 || ev.choices.some((c) => c.effects.some((e) => e.type === 'kill' || e.type === 'warStart' || (e.type === 'money' && Math.abs(e.amount) >= 2000)));
    const adv2 = compareChoices(s, ev.choices);
    const live = ev.choices.map((c, i) => ({ c, ex: adv2[i].ex })).filter((x) => !x.c.disabledReason);
    const best = [...live].sort((x, y) => stanceScore(me.stance, y.ex) - stanceScore(me.stance, x.ex) || (x.c.id < y.c.id ? -1 : 1))[0];
    if (best) {
      ex = best.ex;
      b.recommendation = { text: `"${best.c.label}."`, choiceId: best.c.id };
      b.accomplishes.push({ text: best.ex.purpose, k: 'estimate' });
    }
    const dflt = ev.choices.find((c) => c.id === ev.defaultChoiceId);
    if (dflt) b.requirements.push({ text: `If you don't decide this week: "${dflt.label}"`, k: 'known' });
    for (const x of live) for (const e of x.c.effects) if (e.type === 'rivalOpinion' && e.amount < 0) {
      const rr = rivalReaction(s, adv, e.rival, `If you pick "${x.c.label}": ${s.rivals.find((y) => y.id === e.rival)?.shortName ?? 'they'} take it badly and may answer it`, 20 - e.amount, [`it costs ${-e.amount} with them`]);
      if (rr && !b.reactions.some((y) => y.whoId === rr.whoId)) b.reactions.push(rr);
    }
    const cops = best ? copsReaction(s, best.c.effects) : undefined;
    if (cops) b.reactions.push(cops);
    if (best?.c.effects.some((e) => e.type === 'crewOpinion' && e.amount < 0)) b.reactions.push({ who: 'The crews', kind: 'crew', text: 'Grumbling in the clubs; a man already sore may say it out loud', likelihood: 'possible', reasons: ['the crew likes it less'], k: 'estimate' });
    b.unknowns.push({ text: 'How the people in it feel when nobody is watching', k: 'unknown' });
    return finish(s, adv, me, b, title, major, ex, blocked);
  }

  // ---- A seat, or a district's capo ----
  if (sub.kind === 'seat' || sub.kind === 'capo' || r.topic === 'appoint') {
    const role: Role = sub.kind === 'seat' ? { kind: 'seat', seat: sub.seat } : sub.kind === 'capo' ? { kind: 'capo', district: sub.district } : sub.kind === 'action' && sub.action.kind === 'appoint' ? { kind: 'seat', seat: sub.action.seat } : { kind: 'capo' };
    const ranking = rankCandidates(s, role);
    title = ranking.question;
    major = true;
    const raw: RawCand[] = ranking.candidates.filter((c) => c.charId && s.characters[c.charId]).map((c) => candFromRanking(s, c));
    const stepUp = role.kind === 'capo' || (role.kind === 'seat' && (s.council[role.seat]?.holderId === adv.id || (role.seat === 'underboss' && me.role === 'consigliere')));
    const { list, bias } = pickCandidates(s, adv, raw, stepUp);
    b.candidates = list;
    b.bias = bias;
    const pick = list.find((x) => x.pick);
    if (pick) b.recommendation = { text: `"${pick.name}."`, action: pick.action, charId: pick.charId };
    b.accomplishes.push({ text: role.kind === 'seat' ? SEAT_INFO[role.seat].blurb : 'A capo runs the district\'s street and kicks up from it; without one the take leaks.', k: 'known' });
    b.requirements.push({ text: role.kind === 'seat' && (role.seat === 'underboss' || role.seat === 'consigliere') ? 'Only a made man can hold it; it is a rank as well as a seat' : 'Any of your men who is free', k: 'known' });
    if (role.kind === 'seat') {
      const cur = holder(s, role.seat);
      if (cur) {
        b.obstacles.push({ text: `${cur.firstName} ${cur.lastName} holds it now and would lose it`, k: 'known' });
        b.reactions.push({ who: displayName(cur), whoId: cur.id, kind: 'crew', text: 'Holds it against you; may look for friends who feel the same', likelihood: hasTrait(cur, 'Vengeful') || hasTrait(cur, 'Ambitious') ? 'likely' : 'possible', reasons: ['he loses the seat (−15 opinion)', ...(hasTrait(cur, 'Vengeful') ? ['he is vengeful'] : [])], k: 'estimate' });
      }
    }
    const wanting = Object.values(s.characters).filter((c) => usable(s, c) && (c.goal === 'become_capo' || c.goal === 'take_chair') && c.id !== pick?.charId).slice(0, 2);
    for (const w of wanting) b.reactions.push({ who: displayName(w), whoId: w.id, kind: 'crew', text: `Feels passed over: he wants ${w.goal === 'take_chair' ? 'the chair' : 'a crew of his own'}`, likelihood: 'possible', reasons: ['his ambition is no secret'], k: 'estimate' });
    b.unknowns.push({ text: 'What each man has been promised behind your back, beyond what you have heard', k: 'unknown' });
    const a = pick?.action;
    if (a) { ex = explainAction(s, a); b.plan = a; }
    return finish(s, adv, me, b, title, major, ex, blocked);
  }

  const a = r.action!;
  const p = previewAction(s, a);
  blocked = p.disabledReason;
  ex = explainAction(s, a);
  b.plan = a;
  title = p.title;
  b.accomplishes.push({ text: ex.purpose, k: 'known' });
  b.requirements.push(...costLines(s, a));
  if (blocked) b.obstacles.push({ text: blocked, k: 'known' });
  if (p.warning) b.obstacles.push({ text: p.warning, k: 'known' });

  if (r.topic === 'racket' && a.kind === 'econ' && a.op.type === 'racket' && a.op.cmd.c === 'start') {
    const kind = a.op.cmd.kind;
    const def = CATALOG[kind];
    major = true;
    const sum = startSummary(s, kind, a.op.cmd.runner, r.district);
    const d = s.districts.find((x) => x.id === r.district);
    b.accomplishes.push({ text: `About ${fmtMoney(moneyRead(adv, `take:${kind}`, adv.attributes.business, sum.weekly))}/wk now, ${fmtMoney(moneyRead(adv, `off:${kind}`, adv.attributes.business, sum.other))}/wk in the other season${sum.byScore ? ` (${sum.byScore})` : ''} — his read`, k: 'estimate' });
    b.requirements.push({ text: `${def.staff} m${def.staff === 1 ? 'an' : 'en'} on the street to run it${d ? `; opens in ${d.name}` : ''}`, k: 'known' });
    for (const l of sum.locks) b.obstacles.push({ text: `${l.why} — ${l.how}`, k: 'known' });
    for (const w of sum.warns) b.obstacles.push({ text: w, k: 'known' });
    const raw: RawCand[] = runnersFor(s, kind).filter((x) => x.role !== 'boss').map((x) => ({
      c: x.c, score: x.skill - x.load * 8 + (x.canEarn ? 6 : 0),
      why: [{ text: `${SKILL_WORD[x.fit] ?? x.fit} ${x.skill}`, k: 'known' }, { text: x.note, k: 'known' }, ...(x.loyalty !== undefined ? [loyaltyLine(s, x.c)] : [])],
      action: { kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind, ...(r.district ? { district: r.district } : {}), runner: x.c.id } } },
      unavailable: x.note === 'Busy this week' ? 'Busy this week' : undefined,
    }));
    const { list, bias } = pickCandidates(s, adv, raw);
    b.candidates = list; b.bias = bias;
    const pick = list.find((x) => x.pick);
    if (pick) b.recommendation = { text: `"Give it to ${pick.name.split(' ')[0]}."`, action: pick.action, charId: pick.charId };
    if (d) for (const [fid, inf] of Object.entries(d.influence)) {
      if (fid === 'player' || (inf ?? 0) < 15) continue;
      const rr = rivalReaction(s, adv, fid as RivalId, `${s.rivals.find((y) => y.id === fid)?.shortName ?? fid} may lean on it: a visit, a broken window, a man scared off`, 15 + (inf ?? 0) * 0.6, [`they hold ${Math.round(inf ?? 0)}% of ${d.name}`]);
      if (rr) b.reactions.push(rr);
    }
    b.reactions.push({ who: 'Philadelphia', kind: 'philly', text: sum.philly, likelihood: /Forbidden|reckoning/.test(sum.philly) ? 'likely' : /Tolerated|Needs/.test(sum.philly) ? 'possible' : 'unlikely', reasons: ['their stated view of this racket'], k: 'known' });
    const cops = copsReaction(s, [], Math.round(def.heat * 10), `a ${sum.heat}-heat racket`);
    if (cops) b.reactions.push(cops);
    b.unknowns.push({ text: 'Whether a rival already has a man inside this trade in that district', k: 'unknown' });
  } else if (r.topic === 'dirty' && a.kind === 'dirty') {
    const j = JOBS_BY_ID[a.op.job];
    major = true;
    const raw: RawCand[] = crewFor(s, j.id).filter((x) => x.role !== 'boss').map((x) => ({
      c: x.c, score: x.odds - x.heat * 0.3,
      why: [{ text: `${SKILL_WORD[j.fit] ?? j.fit} ${x.skill} · nerve ${x.nerve}`, k: 'known' }, { text: x.note, k: 'known' }, ...(x.heat >= 40 ? [{ text: `The law has a file on him (${x.heat})`, k: 'known' as const }] : []), ...(x.loyalty !== undefined ? [loyaltyLine(s, x.c)] : [])],
      outlook: { text: `About ${pctRead(adv, `odds:${j.id}:${x.c.id}`, adv.attributes.force, x.odds / 100)}% it goes clean (his read)`, k: 'estimate' },
      action: { kind: 'dirty', op: { ...a.op, who: x.c.id } }, unavailable: x.busy,
    }));
    const { list, bias } = pickCandidates(s, adv, raw);
    b.candidates = list; b.bias = bias;
    const pick = list.find((x) => x.pick);
    if (pick) b.recommendation = { text: `"Send ${pick.name.split(' ')[0]}."`, action: pick.action, charId: pick.charId };
    b.accomplishes.push({ text: `${j.line} The take: ${fmtMoney(j.take[0])}–${fmtMoney(j.take[1])}, if it goes right`, k: 'estimate' });
    if (j.philly) b.reactions.push({ who: 'Philadelphia', kind: 'philly', text: j.philly, likelihood: 'possible', reasons: ['their stated view of this kind of job'], k: 'known' });
    if (r.rival) { const rr = rivalReaction(s, adv, r.rival, 'They may hit back: one of your places, one of your men, or a complaint to the Table', 35, ['it is their ground or their man']); if (rr) b.reactions.push(rr); }
    const cops = copsReaction(s, [], (j.heat.local ?? 0) + (j.heat.federal ?? 0), `${Math.round(j.arrest * 100)}% of failed jobs end in an arrest`);
    if (cops) b.reactions.push(cops);
    b.unknowns.push({ text: 'Whether anyone on it talks if he is picked up', k: 'unknown' });
    b.unknowns.push({ text: 'Whether the target is expecting trouble', k: 'unknown' });
  } else if (r.topic === 'talk' && a.kind === 'talk' && a.op.t === 'ask') {
    const c = s.characters[a.op.target];
    major = !!r.rival;
    if (c) {
      const o = talkOdds(s, a.op.talk, c);
      const ag = pctRead(adv, `talk:${a.op.talk}:${c.id}`, adv.attributes.diplomacy, o.agree);
      b.accomplishes.push({ text: TALKS[a.op.talk].blurb, k: 'known' });
      b.requirements.push({ text: `About ${ag}% he says yes${o.counter > 0.05 ? `, ${Math.round(o.counter * 100)}% he names his own terms` : ''} (his read: ${o.reasons.filter((x) => x.value).slice(1, 4).map((x) => `${x.label} ${x.value > 0 ? '+' : ''}${x.value}`).join(', ') || 'nothing special'})`, k: 'estimate' });
      if (r.rival) {
        const others2 = s.rivals.filter((x) => x.id !== r.rival && x.kind === 'mob');
        for (const o2 of others2.slice(0, 2)) {
          const rr = rivalReaction(s, adv, o2.id, `${o2.shortName} may read the sit-down as you choosing a side`, 15, [`${o2.shortName} watches who you sit with`]);
          if (rr) b.reactions.push(rr);
        }
        const rr = rivalReaction(s, adv, r.rival, `${s.rivals.find((y) => y.id === r.rival)?.shortName} may take a refusal as an insult and say so in the street`, 10 + (100 - ag) * 0.3, ['a refused offer is talked about']);
        if (rr) b.reactions.push(rr);
      }
      b.unknowns.push({ text: `What ${c.firstName} wants out of it that he has not said`, k: 'unknown' });
    }
  } else if (r.topic === 'buy') {
    major = p.cost >= 3000;
    b.accomplishes.push({ text: ex.gains.length ? `It brings ${ex.gains.slice(0, 2).map((g) => g.text).join(', ')} (estimate)` : 'A place of your own on the island', k: 'estimate' });
    const d = r.district ? s.districts.find((x) => x.id === r.district) : undefined;
    if (d) {
      b.requirements.push({ text: `In ${d.name}: you hold ${Math.round(d.influence.player ?? 0)}% of it${d.capoId ? `; ${s.characters[d.capoId]?.firstName}'s ground` : '; no capo there'}`, k: 'known' });
      for (const [fid, inf] of Object.entries(d.influence)) {
        if (fid === 'player' || (inf ?? 0) < 25) continue;
        const rr = rivalReaction(s, adv, fid as RivalId, 'They may see it as you moving onto their ground', (inf ?? 0) * 0.5, [`they hold ${Math.round(inf ?? 0)}% of ${d.name}`]);
        if (rr) b.reactions.push(rr);
      }
    }
    if (a.kind === 'buyBusiness') {
      const raw: RawCand[] = runnersFor(s, a.biz).filter((x) => x.role !== 'boss').map((x) => ({ c: x.c, score: x.skill - x.load * 8, why: [{ text: `${SKILL_WORD[x.fit] ?? x.fit} ${x.skill}`, k: 'known' }, { text: x.note, k: 'known' }] }));
      const { list, bias } = pickCandidates(s, adv, raw);
      b.candidates = list; b.bias = bias;
    }
    b.reactions.push({ who: 'The town', kind: 'town', text: 'People talk about who bought what; the papers notice a big buy', likelihood: p.cost >= 10000 ? 'likely' : 'unlikely', reasons: [`a ${fmtMoney(p.cost)} purchase`], k: 'estimate' });
    b.unknowns.push({ text: 'What the seller is not telling you about the place', k: 'unknown' });
  } else {
    major = p.cost >= 2000 || ex.risks.some((x) => x.severity === 'high');
    if (r.rival) { const rr = rivalReaction(s, adv, r.rival, 'They will hear about it, and may answer it', 25, ['it touches their people']); if (rr) b.reactions.push(rr); }
    const cops = copsReaction(s, p.effects);
    if (cops) b.reactions.push(cops);
  }
  if (!b.recommendation && !blocked) b.recommendation = { text: verdictFor(me.stance, ex, blocked).tone === 'go' ? '"Go ahead."' : verdictFor(me.stance, ex, blocked).tone === 'no' ? '"Leave it."' : '"Your call."', action: a };
  return finish(s, adv, me, b, title, major, ex, blocked);
}

function candFromRanking(s: GameState, c: Candidate): RawCand {
  const ch = s.characters[c.charId!];
  return {
    c: ch, score: c.score,
    why: [...c.pros.slice(0, 2).map((x) => ({ text: x.text, k: 'known' as const })), ...c.cons.slice(0, 1).map((x) => ({ text: x.text, k: 'known' as const })), ...c.flags.slice(0, 1).map((x) => ({ text: x.text, k: 'known' as const })), ...(c.opinion !== undefined ? [{ text: `Thinks ${c.opinion >= 0 ? '+' : ''}${c.opinion} of you`, k: 'known' as const }] : [])],
    outlook: { text: c.outcome, k: 'estimate' }, action: c.action, unavailable: c.disabledReason,
  };
}

function finish(s: GameState, adv: Character, me: AdviserRef, b: Omit<AdviceBrief, 'opener' | 'verdict' | 'title' | 'major'>, title: string, major: boolean, ex: ActionExplanation | undefined, blocked: string | undefined): AdviceBrief {
  const verdict = ex ? verdictFor(me.stance, ex, blocked) : { text: blocked ? `Not yet: ${blocked}` : 'He has a name for you', tone: blocked ? 'blocked' as const : 'go' as const };
  const loyal = opinion(s, adv.id, s.playerId);
  // Conflicting commitments: men already on something this week.
  for (const c of b.candidates) if (c.unavailable) b.obstacles.push({ text: `${c.name}: ${c.unavailable}`, k: 'known' });
  // Reactions are never certain: at most "likely", and sorted so the likeliest is first.
  b.reactions.sort((x, y) => LIKE.indexOf(y.likelihood) - LIKE.indexOf(x.likelihood) || (x.who < y.who ? -1 : 1));
  // Only what he could know is in it: always say there is more he can't see.
  if (!b.unknowns.length) b.unknowns.push({ text: 'What the other side plans to do about it', k: 'unknown' });
  if (me.role !== 'consigliere' && adv.attributes.intrigue < 40) b.unknowns.push({ text: `${adv.firstName} hears less than he lets on: his reads of other families are guesses`, k: 'unknown' });
  const m = mandateSource?.(s, adv.id);
  const cost = b.plan ? previewAction(s, b.plan).cost : 0;
  const authority = m ? { mandate: m, within: m.level >= 2 && cost <= m.spendLimit && !major, note: m.level >= 2 && cost <= m.spendLimit && !major ? 'Within what he may decide on his own' : 'Beyond what he may decide on his own: he asks you' } : undefined;
  return {
    ...b, title, major, verdict,
    opener: opener(me.stance, verdict, b.topic, loyal),
    ...(authority ? { authority } : {}),
  };
}

/** Is a subject big enough for a briefing on its own (the automatic-briefings setting)? */
export function isMajorSubject(s: GameState, sub: AdviceSubject): boolean {
  const b = adviceBrief(s, sub);
  return !!b?.major;
}

/** The player's name for a role (for buttons: "Ask the consigliere"). */
export function askLabel(a: AdviserRef): string {
  return a.role === 'capo' ? `Ask ${a.name.split(' ')[0]} (${a.title})` : `Ask the ${a.role}`;
}
