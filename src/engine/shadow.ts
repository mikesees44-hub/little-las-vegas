import { ageOn, monthKey } from './calendar';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { attr, viewAttrs } from './attrs';
import { holder } from './council';
import { bloodLine, chooseHeir } from './dynasty';
import { fam } from './familyState';
import { capability, publicHeir } from './heir';
import type { Reason } from './interactions';
import type { Ctx } from './ledger';
import { bossInside } from './longgame';
import { pwView } from './powerState';
import { addOpinion, changeMeter, getRelation, opinion } from './relations';
import { chance, hashSeed, rand, randInt, type RngHolder } from './rng';
import { ensureShadow, shadowView, type BackSeen, type Belief, type KnowLvl, type PetSubject, type PetTo, type PlanGoal, type PrivatePlan, type ShadowState, type ShPetition, type ShPromise, type ShSession, type Whisper } from './shadowState';
import { ensureTribute, favorsTo, noteFavor, type UbAuthority } from './tributeState';
import { ubGoal, type UbGoal } from './underboss';
import type { Character, GameState } from './types';

/**
 * THE AGING DON, THE SHADOW COURT & THE SUCCESSION WAR (the engine).
 *
 * Every week, after the power pillar (power.ts calls `shadowWeek`):
 *  1. a change of Don since last week is a TRANSITION: who backs whom decides
 *     whether the heir's first weeks are peaceful, run by a kingmaker,
 *     contested, split — or whether the underboss takes the family;
 *  2. men with a need bring PETITIONS — to the Don if he is around and they
 *     trust him, otherwise to the underboss, the consigliere or their capo;
 *  3. the underboss holds his own COURT when real petitions are waiting:
 *     he settles, raises with the Don, promises, or decides beyond his
 *     authority. Every meeting is a persistent record;
 *  4. what was said SPREADS (some of it distorted) and reaches the Don only
 *     through real channels: the underboss's own report, a capo at the
 *     morning meeting, a plant, an Ear, the consigliere, a rival's warning;
 *  5. monthly, every man re-weighs his PRIVATE PLAN for the future (loyalty,
 *     opinions, money he owes, promises, grievances, age), rival families
 *     read the succession, and the history is kept for the screen.
 * The story templates (shadowStories.ts) run on top of these records.
 *
 * Its own dice (`shadow.rng`); reads of the state never roll the main RNG.
 */

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

/* ------------------------------------------------------------------ */
/* Who is who                                                          */
/* ------------------------------------------------------------------ */

export function theUb(s: GameState): Character | undefined {
  return holder(s, 'underboss') ?? crew(s).find((c) => c.rank === 'underboss' && isFree(s, c));
}

export function theCons(s: GameState): Character | undefined {
  return holder(s, 'consigliere') ?? crew(s).find((c) => c.rank === 'consigliere' && isFree(s, c));
}

/** The heir the crew believes in: the public designation, else whoever the law would pick today. */
export function declaredHeir(s: GameState): Character | undefined {
  const boss = player(s);
  if (!boss) return undefined;
  const pub = publicHeir(s);
  if (pub?.alive && pub.id !== boss.id) return pub;
  const h = chooseHeir(s, boss).heir;
  return h && h.id !== boss.id ? h : undefined;
}

/** The eldest grown blood heir (the son the capos measure). */
export function bloodHeir(s: GameState): Character | undefined {
  const boss = player(s);
  return bloodLine(s, boss).find((c) => ageOn(c.birth, s.date) >= 18);
}

/** Everyone with a claim the men weigh: the declared heir, the underboss, the blood heir, the secret heir. */
export function claimants(s: GameState): Character[] {
  const out: Character[] = [];
  const add = (c?: Character) => { if (c?.alive && c.id !== s.playerId && !out.includes(c)) out.push(c); };
  add(declaredHeir(s));
  add(theUb(s));
  add(bloodHeir(s));
  const sec = pwView(s).designation.secretId;
  add(sec ? s.characters[sec] : undefined);
  return out;
}

/** The men whose plans matter: the made men and associates of the family (and an old Don in retirement). */
export function members(s: GameState): Character[] {
  const out = crew(s).filter((c) => isFree(s, c) && ageOn(c.birth, s.date) >= 18);
  const em = s.shadow?.emeritus ? s.characters[s.shadow.emeritus.id] : undefined;
  if (em?.alive && !out.includes(em) && em.id !== s.playerId) out.push(em);
  return out;
}

const WEIGHT: Record<string, number> = { underboss: 3, capo: 3, consigliere: 2, soldier: 1, associate: 0.5, civilian: 1, boss: 0 };

export function nameOf(s: GameState, id?: string): string {
  const c = id ? s.characters[id] : undefined;
  return c ? (c.nickname && c.nickname.split(' ').length <= 2 ? c.nickname.replace(/^the /i, '') : c.firstName) : 'somebody';
}

function memo(s: GameState, sh: ShadowState, id: string, text: string): void {
  const m = (sh.mem[id] ??= []);
  m.push({ week: s.week, text });
  if (m.length > 12) sh.mem[id] = m.slice(-12);
}

/** Persistent memory of the succession (kept beyond the short character story). */
export function remember(s: GameState, id: string, text: string): void {
  memo(s, ensureShadow(s), id, text);
}

/* ------------------------------------------------------------------ */
/* The Don's standing                                                  */
/* ------------------------------------------------------------------ */

export interface Score { score: number; reasons: Reason[] }

function scored(parts: [string, number][], base = 0): Score {
  const reasons = parts.filter(([, v]) => Math.round(v) !== 0).map(([label, v]) => ({ label, value: Math.round(v) }));
  return { score: clamp(base + reasons.reduce((a, r) => a + r.value, 0)), reasons };
}

export function ubAuthority(s: GameState): UbAuthority {
  const sh = s.shadow;
  if (sh?.actingUntil !== undefined && sh.actingUntil >= s.week) return 'acting';
  return s.tribute?.ub.authority ?? 'routine';
}

export const AUTH_LEVEL: Record<UbAuthority, number> = { routine: 1, operational: 2, executive: 3, acting: 4, shadow: 5 };
export const AUTH_TEXT: Record<UbAuthority, string> = {
  routine: 'Routine: small money disputes, schedules, ordinary crew matters',
  operational: 'Operational: crew investments, who manages what, deals within limits',
  executive: 'Executive: promotions, real money, the family\'s policy',
  acting: 'Acting boss: he leads while you cannot',
  shadow: 'Shadow boss: second in rank, first in practice',
};

/** How present the Don is in his own family (0-100). */
export function involvement(s: GameState): Score {
  const t = s.tribute;
  const boss = player(s);
  const held = (t?.held ?? []).filter((w) => s.week - w <= 8).length;
  const court = s.week - (s.flags.pwr_court ?? -99) <= 8;
  const council = s.shadow?.council !== undefined && s.week - s.shadow.council <= 12;
  const recent = (s.shadow?.aud ?? []).slice(-8).reduce((a, r) => a + r[1], 0);
  return scored([
    ['Holds the Monday audience himself', held * 4],
    ['Held court lately', court ? 10 : 0],
    ['Called the family together', council ? 8 : 0],
    ['Petitions he heard himself', Math.min(12, recent * 2)],
    ['Weeks the underboss ran the envelope alone', -Math.min(25, (t?.ub.absent ?? 0) * 1.2)],
    ['Inside', bossInside(s) ? -30 : 0],
    ['Sick', boss.health < 50 ? -(50 - boss.health) * 0.6 : 0],
    ['Someone else is acting for him', ubAuthority(s) === 'acting' ? -15 : 0],
  ], 50);
}

/** Support for each claimant (shares 0-100 of the weighted men), the truth or as the Don knows it. */
export function support(s: GameState, known = false): { shares: Record<string, number>; unknown: number; total: number } {
  const sh = shadowView(s);
  const shares: Record<string, number> = {};
  let total = 0;
  let unknown = 0;
  for (const m of members(s)) {
    const w = WEIGHT[m.rank] ?? 1;
    total += w;
    const pref = known ? sh.views[m.id]?.prefer : sh.plans[m.id]?.prefer;
    if (known && !sh.views[m.id]) { unknown += w; continue; }
    const k = pref ?? 'none';
    shares[k] = (shares[k] ?? 0) + w;
  }
  if (total > 0) for (const k of Object.keys(shares)) shares[k] = Math.round((shares[k] / total) * 100);
  return { shares, unknown: total ? Math.round((unknown / total) * 100) : 0, total };
}

/** Succession pressure (0-100): an indicator of how much the men are thinking past the Don, never a countdown. */
export function pressure(s: GameState): Score {
  const boss = player(s);
  const age = ageOn(boss.birth, s.date);
  const heir = declaredHeir(s);
  const sup = heir ? support(s).shares[heir.id] ?? 0 : 0;
  const d = pwView(s).designation;
  const sh = shadowView(s);
  const inv = involvement(s).score;
  const sessions = sh.sessions.filter((x) => s.week - x.week <= 26).length;
  const griev = (s.power?.grievances ?? []).filter((g) => g.status === 'open' && g.byId === boss.id).length;
  const clarity = d.mode === 'none' || d.mode === 'multiple' ? 10 : d.mode === 'private' || d.mode === 'unwritten' ? 6 : d.mode === 'committee' ? 4 : 0;
  return scored([
    ['The Don\'s age', Math.max(0, Math.min(30, (age - 55) * 1.2))],
    ['His health', Math.max(0, Math.min(30, (70 - boss.health) * 0.6))],
    [heir ? 'Thin support for the heir' : 'No heir anybody can name', heir ? Math.max(0, (50 - sup) * 0.4) : 15],
    ['Nobody is sure how the heir is named', clarity],
    ['The Don is not around much', Math.max(0, (50 - inv) * 0.3)],
    ['The underboss holds his own court', Math.min(12, sessions * 1.5)],
    ['Grudges against the Don', Math.min(10, griev * 2)],
    ['Broken promises', Math.min(12, ((s.power?.stats.brokenPromises ?? 0) + sh.stats.broken) * 3)],
    ['A shaky reputation', s.respect < 40 ? (40 - s.respect) * 0.2 : 0],
  ], 5);
}

/* ------------------------------------------------------------------ */
/* Knowledge                                                           */
/* ------------------------------------------------------------------ */

/** What one person believes about a record (undefined = unknown). */
export function belief(s: GameState, viewer: string, recId: string): Belief | undefined {
  return s.shadow?.know[viewer]?.[recId];
}

/** The Don's knowledge level of a record: 'unknown' | 'rumor' | 'confirmed'. */
export function donKnows(s: GameState, recId: string): KnowLvl | 'unknown' {
  return belief(s, s.playerId, recId)?.lvl ?? 'unknown';
}

function recWeek(sh: ShadowState, recId: string): number | undefined {
  return sh.sessions.find((x) => x.id === recId)?.week ?? sh.promises.find((x) => x.id === recId)?.week;
}

/** Someone learns (or confirms) a record. Never downgrades. Returns true when it is news to him. */
export function learn(s: GameState, viewer: string, recId: string, lvl: KnowLvl, via: string, txt?: string, wrong?: boolean): boolean {
  const sh = ensureShadow(s);
  const k = (sh.know[viewer] ??= {});
  const was = k[recId];
  if (was && (was.lvl === 'confirmed' || lvl === 'rumor')) return false;
  k[recId] = { lvl, w: s.week, via, ...(txt ? { txt } : {}), ...(wrong && lvl === 'rumor' ? { wrong: 1 as const } : {}) };
  if (viewer === s.playerId && !was) {
    sh.stats.learned++;
    const w0 = recWeek(sh, recId);
    if (w0 !== undefined) {
      const lag = s.week - w0;
      if (lag >= 8) sh.stats.lateLearned++;
      sh.stats.maxLag = Math.max(sh.stats.maxLag, lag);
    }
    // A promise heard of tells the Don who its holder is likely backing.
    const pr = sh.promises.find((x) => x.id === recId);
    if (pr && pr.maker !== viewer) seeBacking(s, pr.to, pr.maker, 'rumor', via);
  }
  return true;
}

/**
 * Someone hears of a fact from the living district (livingKnow.ts). The same
 * record of belief and the same rule as `learn` (never downgrades; a rumor may
 * carry a distorted version), kept in the same map so "what the boss knows" is
 * one place; the succession court's own statistics are left alone.
 */
export function learnFact(s: GameState, viewer: string, recId: string, lvl: KnowLvl, via: string, txt?: string, wrong?: boolean): boolean {
  const sh = ensureShadow(s);
  const k = (sh.know[viewer] ??= {});
  const was = k[recId];
  if (was && (was.lvl === 'confirmed' || lvl === 'rumor')) return false;
  k[recId] = { lvl, w: s.week, via, ...(txt && lvl === 'rumor' ? { txt } : {}), ...(wrong && lvl === 'rumor' ? { wrong: 1 as const } : {}) };
  return true;
}

/** Forget beliefs about records that no longer exist (the living district prunes old facts). */
export function forgetFacts(s: GameState, keep: (recId: string) => boolean, prefix: string): void {
  const sh = s.shadow;
  if (!sh) return;
  for (const viewer of Object.keys(sh.know)) {
    const k = sh.know[viewer];
    for (const id of Object.keys(k)) if (id.startsWith(prefix) && !keep(id)) delete k[id];
    if (!Object.keys(k).length) delete sh.know[viewer];
  }
}

/** The Don comes to believe a man backs someone (a rumor may be wrong). */
export function seeBacking(s: GameState, manId: string, prefer: string | undefined, lvl: KnowLvl, via: string, goal?: PlanGoal): void {
  const sh = ensureShadow(s);
  const was = sh.views[manId];
  if (was && was.lvl === 'confirmed' && lvl === 'rumor' && s.week - was.w < 26) return;
  const v: BackSeen = { lvl, w: s.week, via };
  if (prefer) v.prefer = prefer;
  if (goal) v.goal = goal;
  sh.views[manId] = v;
}

/** Everyone who knows a record (any level). */
export function knowers(sh: ShadowState, recId: string): string[] {
  return Object.keys(sh.know).filter((id) => sh.know[id][recId]);
}

/* ------------------------------------------------------------------ */
/* Private plans (monthly)                                             */
/* ------------------------------------------------------------------ */

function ubFavors(s: GameState, manId: string, ubId: string): { n: number; amount: number } {
  const fs = favorsTo(s, manId).filter((f) => f.byId === ubId);
  return { n: fs.length, amount: fs.reduce((a, f) => a + f.amount, 0) };
}

/** Score each possible next boss for one man (higher = he backs him). Pure. */
export function weighCandidates(s: GameState, m: Character, cands: Character[]): { id: string; score: number; why: [string, number][] }[] {
  const sh = shadowView(s);
  const boss = player(s);
  const heir = declaredHeir(s);
  const ub = theUb(s);
  const x = viewAttrs(s, m).v;
  const plan = sh.plans[m.id];
  const myCapo = m.capoId ? sh.plans[m.capoId] : undefined;
  const toBoss = opinion(s, m.id, boss.id);
  const griev = getRelation(s, m.id, boss.id)?.grievance ?? 0;
  const out: { id: string; score: number; why: [string, number][] }[] = [];
  for (const c of cands) {
    if (c.id === m.id) continue;
    const why: [string, number][] = [];
    why.push([`What he thinks of ${nameOf(s, c.id)}`, opinion(s, m.id, c.id) * 0.6]);
    if (heir && c.id === heir.id) {
      why.push(['The Don named him', toBoss * 0.25 + (x.loyalty - 50) * 0.2]);
      if (c.dynasty && m.dynasty) why.push(['Blood', 20]);
      why.push(['Can he run it?', (capability(s, c).score - 50) * 0.35]);
      const age = ageOn(c.birth, s.date);
      if (age < 26) why.push(['Too young', -10]);
      if (griev > 20) why.push(['A grudge against the Don', -griev * 0.2]);
    }
    if (ub && c.id === ub.id) {
      const f = ubFavors(s, m.id, ub.id);
      if (f.n) why.push([f.amount ? `Owes ${nameOf(s, ub.id)} $${f.amount.toLocaleString('en-US')}` : `${nameOf(s, ub.id)} did him favors`, Math.min(28, f.n * 4 + f.amount / 250)]);
      const base = s.tribute?.ub.base ?? 0;
      why.push([`${nameOf(s, ub.id)} delivers for the earners`, base * 0.15]);
      if (s.tribute?.ub.callsFirst.includes(m.id)) why.push(['Calls the underboss first', 10]);
      if (griev > 20) why.push(['A grudge against the Don', griev * 0.15]);
      if (toBoss < 0) why.push(['Tired of the old man', -toBoss * 0.15]);
    }
    const promised = sh.promises.find((p) => p.to === m.id && p.maker === c.id && p.status === 'outstanding');
    if (promised) why.push([`${nameOf(s, c.id)} promised him ${promised.role}`, 26]);
    const broke = sh.promises.find((p) => p.to === m.id && p.maker === c.id && p.status === 'broken');
    if (broke) why.push([`${nameOf(s, c.id)} broke a promise to him`, -22]);
    if (myCapo?.prefer === c.id && m.rank !== 'capo') why.push(['His capo backs him', 12]);
    if (m.courtedBy && sh.rivals[m.courtedBy.rival]?.favor === c.id) why.push(['The other family likes him', 8]);
    if (plan?.prefer === c.id) why.push(['Already committed', 8]);
    out.push({ id: c.id, score: why.reduce((a, [, v]) => a + v, 0), why });
  }
  // Himself.
  if ((m.rank === 'capo' || m.rank === 'underboss') && !m.dynasty) {
    const amb = x.ambition;
    const self: [string, number][] = [['His own ambition', (amb - 58) * 0.9], ['Men who would follow him', (m.attrs?.followers ?? 0) * 2], ['Age', ageOn(m.birth, s.date) > 62 ? -15 : 0]];
    if (plan?.prefer === m.id) self.push(['Already committed', 8]);
    out.push({ id: m.id, score: self.reduce((a, [, v]) => a + v, 0), why: self });
  }
  return out.sort((a, b) => b.score - a.score);
}

function goalFor(s: GameState, m: Character, prefer: string | undefined, margin: number): PlanGoal {
  const x = viewAttrs(s, m).v;
  const age = ageOn(m.birth, s.date);
  const heir = declaredHeir(s);
  const ub = theUb(s);
  const toBoss = opinion(s, m.id, s.playerId);
  if (toBoss <= -40 && x.loyalty < 45 && !m.dynasty) return 'leave_organization';
  if (prefer === m.id) return 'seek_leadership';
  if ((getRelation(s, m.id, s.playerId)?.grievance ?? 0) >= 40 && x.patience >= 55) return 'repair_grievance';
  if (age < 40 && x.ambition >= 55 && m.rank !== 'capo') return x.entrepreneurship >= 60 ? 'build_business' : 'seek_promotion';
  if (age < 40 && x.ambition >= 60) return 'build_influence';
  if (!prefer || margin < 6) return 'remain_neutral';
  if (heir && prefer === heir.id) return 'support_heir';
  if (ub && prefer === ub.id) return 'support_underboss';
  return 'build_influence';
}

/** Monthly: every man re-weighs the future. */
export function plansMonth(ctx: Ctx): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const cands = claimants(s);
  const heir = declaredHeir(s);
  const ub = theUb(s);
  const alive = new Set<string>();
  // Capos first, so their men can lean on their capo's choice.
  const ms = members(s).sort((a, b) => (b.rank === 'capo' ? 1 : 0) - (a.rank === 'capo' ? 1 : 0) || a.id.localeCompare(b.id));
  for (const m of ms) {
    alive.add(m.id);
    // The old Don in retirement backs whom he handed the chair to.
    if (sh.emeritus?.id === m.id) {
      sh.plans[m.id] = { goal: 'support_heir', prefer: s.playerId, conf: 70, since: sh.plans[m.id]?.since ?? s.week, why: ['He handed the chair over himself'] };
      continue;
    }
    const ranked = weighCandidates(s, m, cands);
    const top = ranked[0];
    const second = ranked[1];
    const margin = top ? top.score - (second?.score ?? 0) : 0;
    const prefer = top && top.score > 4 ? top.id : undefined;
    const goal = goalFor(s, m, prefer, margin);
    const why = (top?.why ?? []).filter(([, v]) => Math.abs(v) >= 3).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([l, v]) => `${l} (${v > 0 ? '+' : ''}${Math.round(v)})`);
    const old = sh.plans[m.id];
    const p: PrivatePlan = { goal, conf: clamp(Math.abs(margin) * 2 + (top?.score ?? 0) * 0.5, 5, 95), since: old && old.prefer === prefer ? old.since : s.week, why };
    if (prefer) p.prefer = prefer;
    if (old && old.prefer !== prefer) {
      if (old.prefer) p.was = old.prefer;
      p.changed = s.week;
      sh.stats.planChanges++;
      if (heir && old.prefer === heir.id) {
        sh.stats.heirLostBackers++;
        memo(s, sh, m.id, `Stopped backing ${nameOf(s, heir.id)} for the chair${prefer ? ` (now ${nameOf(s, prefer)})` : ''}.`);
      } else if (prefer) memo(s, sh, m.id, `Started backing ${prefer === m.id ? 'himself' : nameOf(s, prefer)} for the chair: ${why[0] ?? 'his own reasons'}.`);
    } else if (old) {
      if (old.was) p.was = old.was;
      if (old.changed !== undefined) p.changed = old.changed;
    }
    if (ub && prefer === ub.id && why.some((w) => /^Owes /.test(w)) && sh.cool[`tie:${m.id}`] === undefined) {
      sh.cool[`tie:${m.id}`] = s.week;
      sh.stats.financialTies++;
      memo(s, sh, m.id, `Backs ${nameOf(s, ub.id)} for the chair, and owes him money.`);
    }
    sh.plans[m.id] = p;
  }
  for (const id of Object.keys(sh.plans)) if (!alive.has(id)) delete sh.plans[id];
  for (const id of Object.keys(sh.views)) if (!s.characters[id]?.alive) delete sh.views[id];
  for (const id of Object.keys(sh.mem)) if (!s.characters[id]?.alive && s.week - (s.characters[id]?.death?.week ?? s.week) > 520) delete sh.mem[id];
}

/* ------------------------------------------------------------------ */
/* Petitions (weekly)                                                  */
/* ------------------------------------------------------------------ */

const NEED: Record<PetSubject, number> = { financial_dispute: 1, member_grievance: 1, business_opportunity: 2, promotion: 3, organizational_policy: 3, succession: 9 };

function subjectFor(s: GameState, h: RngHolder, m: Character): PetSubject {
  const x = viewAttrs(s, m).v;
  const opts: [PetSubject, number][] = [
    ['financial_dispute', 3 + ((s.tribute?.arrears[m.id] ?? 0) > 0 ? 6 : 0) + (m.debtTo ? 4 : 0)],
    ['promotion', m.rank === 'soldier' || m.rank === 'associate' ? 1 + Math.max(0, x.ambition - 45) / 6 : m.rank === 'capo' ? Math.max(0, x.ambition - 60) / 8 : 0],
    ['business_opportunity', 1 + Math.max(0, x.entrepreneurship - 45) / 8 + Math.max(0, x.greed - 50) / 10],
    ['member_grievance', (getRelation(s, m.id, s.playerId)?.grievance ?? 0) / 10 + ((s.power?.grievances ?? []).some((g) => g.charId === m.id && g.status === 'open') ? 4 : 0)],
    ['succession', pressure(s).score >= 40 ? (pressure(s).score - 30) / 10 : 0],
    ['organizational_policy', m.rank === 'capo' ? 1.5 : 0.2],
  ];
  const tot = opts.reduce((a, [, w]) => a + w, 0);
  let r = rand(h) * tot;
  for (const [k, w] of opts) { if (r < w) return k; r -= w; }
  return 'financial_dispute';
}

const PET_TEXT: Record<PetSubject, ((s: GameState, m: Character) => string)[]> = {
  financial_dispute: [
    (_s, m) => `${m.firstName} wants a few more weeks on what he owes`,
    (s, m) => `${m.firstName} and another man can't agree how to split a $${(randFor(s, m.id, 'fd') * 1200 + 300 | 0).toLocaleString('en-US')} score`,
    (_s, m) => `${m.firstName} needs money to cover a bad week at the window`,
  ],
  promotion: [
    (_s, m) => `${m.firstName} wants to know when he gets his own crew`,
    (_s, m) => `${m.firstName} wants to be put up when the books open`,
    (_s, m) => `${m.firstName} thinks he's earned a seat at the table`,
  ],
  business_opportunity: [
    (_s, m) => `${m.firstName} wants an okay to go in with a jukebox man in Cape May`,
    (_s, m) => `${m.firstName} has a piece of a motel on offer and wants a yes`,
    (_s, m) => `${m.firstName} wants to put a card game in the back of a bar on Pacific Avenue`,
  ],
  member_grievance: [
    (_s, m) => `${m.firstName} is sore that the boss's people got the good routes`,
    (_s, m) => `${m.firstName} says he was cheated on his end last summer`,
    (_s, m) => `${m.firstName} feels passed over and wants somebody to hear it`,
  ],
  succession: [
    (_s, m) => `${m.firstName} wants to know where he stands when the old man steps down`,
    (_s, m) => `${m.firstName} asks, quietly, who is going to be boss`,
  ],
  organizational_policy: [
    (_s, m) => `${m.firstName} wants the crews to split the summer corners differently`,
    (_s, m) => `${m.firstName} wants a rule about who works the boardwalk in season`,
  ],
};

function randFor(s: GameState, id: string, key: string): number {
  return (hashSeed(`${s.seed}|${s.week}|${id}|${key}`) % 10000) / 10000;
}

/** Where a man takes his problem (weights). */
export function petitionWeights(s: GameState, m: Character): Record<PetTo, number> {
  const boss = player(s);
  const ub = theUb(s);
  const cons = theCons(s);
  const sh = shadowView(s);
  const inv = involvement(s).score;
  const f = (o: number) => Math.max(0.05, (o + 60) / 60);
  const lvl = AUTH_LEVEL[ubAuthority(s)];
  const capo = m.capoId ? s.characters[m.capoId] : undefined;
  return {
    don: (inv / 50) * f(opinion(s, m.id, boss.id)) * (m.rank === 'capo' ? 1.2 : 0.6) * (bossInside(s) ? 0.1 : 1),
    ub: ub && ub.id !== m.id ? (((s.tribute?.ub.base ?? 0) + 20) / 40) * f(opinion(s, m.id, ub.id)) * (sh.plans[m.id]?.prefer === ub.id ? 1.8 : 1) * (1 + (lvl - 1) * 0.25) * (inv < 40 ? 1.5 : 1) * (1 + pressure(s).score / 100) : 0,
    cons: cons && cons.id !== m.id ? 0.4 * f(opinion(s, m.id, cons.id)) : 0,
    capo: capo?.alive && capo.id !== m.id && m.rank !== 'capo' ? 0.9 * f(opinion(s, m.id, capo.id)) : 0,
  };
}

function petitionsWeek(ctx: Ctx, row: [number, number, number, number, number]): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const boss = player(s);
  const pr = pressure(s).score;
  for (const m of members(s)) {
    if (m.id === sh.emeritus?.id) continue;
    const base = m.rank === 'capo' ? 0.09 : m.rank === 'soldier' ? 0.05 : m.rank === 'consigliere' || m.rank === 'underboss' ? 0.02 : 0.025;
    if (!chance(sh, base * (1 + pr / 100))) continue;
    const subject = subjectFor(s, sh, m);
    const w = petitionWeights(s, m);
    const tot = w.don + w.ub + w.cons + w.capo;
    if (tot <= 0) continue;
    let r = rand(sh) * tot;
    let to: PetTo = 'don';
    for (const k of ['don', 'ub', 'cons', 'capo'] as PetTo[]) { if (r < w[k]) { to = k; break; } r -= w[k]; }
    const texts = PET_TEXT[subject];
    const pet: ShPetition = { id: `pt${s.nextId++}`, by: m.id, subject, text: texts[randInt(sh, 0, texts.length - 1)](s, m), week: s.week, status: 'submitted' };
    sh.stats.petitions++;
    const t = ensureTribute(s);
    if (to === 'don') {
      row[1]++;
      sh.stats.toDon++;
      t.petitionsTo[boss.id] = (t.petitionsTo[boss.id] ?? 0) + 1;
      addOpinion(s, m.id, boss.id, 'The boss heard me himself', 2, 1);
    } else if (to === 'ub') {
      row[2]++;
      sh.stats.toUb++;
      pet.status = 'under_review';
      sh.pending.push(pet);
    } else if (to === 'cons') {
      row[3]++;
      const c = theCons(s);
      if (c) addOpinion(s, m.id, c.id, 'The consigliere listened', 2, 1);
    } else {
      row[4]++;
      if (m.capoId) addOpinion(s, m.id, m.capoId, 'My capo took care of it', 2, 1);
    }
  }
  if (sh.pending.length > 8) sh.pending = sh.pending.slice(-8);
}

/* ------------------------------------------------------------------ */
/* The underboss's court                                               */
/* ------------------------------------------------------------------ */

const WHERE = [
  'the back room of a bakery on Pacific Avenue', 'a motel office on Atlantic Avenue after the season', 'a corner booth at a diner on New Jersey Avenue',
  'the bocce court behind the church', 'a boat tied up at Otten\'s Harbor', 'the kitchen of his sister\'s house in Rio Grande', 'a card table above a tavern on Spencer Avenue',
];

function roleFor(m: Character): string {
  return m.rank === 'capo' ? 'the underboss seat' : m.rank === 'soldier' ? 'his own crew' : 'his button';
}

export function makePromise(s: GameState, maker: string, to: string, role: string, terms: string, condition: string, witnesses: string[], sessionId?: string, confidential = true): ShPromise {
  const sh = ensureShadow(s);
  const p: ShPromise = { id: `sp${s.nextId++}`, week: s.week, maker, to, role, terms, condition, status: 'outstanding', witnesses: witnesses.filter((w) => w !== maker && w !== to), confidential };
  if (sessionId) p.sessionId = sessionId;
  sh.promises.push(p);
  sh.stats.promises++;
  for (const id of [maker, to, ...p.witnesses]) learn(s, id, p.id, 'confirmed', id === maker || id === to ? 'made it' : 'was there');
  memo(s, sh, to, `${nameOf(s, maker)} promised him ${role} (${condition}).`);
  if (sh.promises.length > 60) {
    const keep = sh.promises.filter((x) => x.status === 'outstanding' || s.week - x.week < 520);
    sh.promises = keep.slice(-60);
  }
  return p;
}

/** The underboss decides one petition (the truth). */
function decide(ctx: Ctx, ub: Character, pet: ShPetition, ses: ShSession, goal: UbGoal): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const m = s.characters[pet.by];
  if (!m?.alive) { pet.status = 'rejected'; return; }
  const lvl = AUTH_LEVEL[ubAuthority(s)];
  const loyal = opinion(s, ub.id, s.playerId);
  const r = rand(sh);
  const ambitious = goal === 'become_boss' || goal === 'kingmaker';
  const U = nameOf(s, ub.id);
  const promiseIt = (role: string, terms: string, condition: string) => {
    const p = makePromise(s, ub.id, m.id, role, terms, condition, ses.participants, ses.id);
    pet.status = 'promised';
    pet.authorized = false;
    pet.promiseId = p.id;
    pet.decision = `${U} promised ${m.firstName} ${role} — "${terms}"`;
    addOpinion(s, m.id, ub.id, `${U} made me a promise`, 10, 1);
  };
  // He does not promise the same man twice, and keeps the number of open promises he can be held to small.
  const held = sh.promises.filter((p) => p.maker === ub.id && p.status === 'outstanding');
  const canPromise = !held.some((p) => p.to === m.id) && held.length < 6;
  if (pet.subject === 'succession' || (pet.subject === 'promotion' && lvl < 3)) {
    if (ambitious && canPromise && r < 0.62) {
      promiseIt(roleFor(m), goal === 'kingmaker' ? 'Whoever sits in that chair, you\'ll be taken care of. I\'ll see to it.' : 'When I have the chair, you\'re the first one I call.', goal === 'kingmaker' ? 'when the old man steps down' : `when ${U} has the chair`);
      return;
    }
    if (goal === 'get_rich' && canPromise && r < 0.3) {
      promiseIt('a bigger end', 'Stick with me and your end goes up. Next summer.', 'after the season');
      return;
    }
    if (goal === 'serve' || loyal >= 10) {
      pet.status = 'raised';
      pet.decision = `${U} told ${m.firstName} he would take it to the boss`;
      sh.raised.push({ id: `rz${s.nextId++}`, week: s.week, by: ub.id, petId: pet.id, sessionId: ses.id });
      addOpinion(s, m.id, ub.id, `${U} spoke up for me`, 1, 1);
      return;
    }
    pet.status = 'rejected';
    pet.decision = `${U} told ${m.firstName} to be patient`;
    addOpinion(s, m.id, ub.id, `${U} brushed me off`, -3, 1);
    return;
  }
  const need = NEED[pet.subject];
  const within = lvl >= need;
  const freelance = !within && (ambitious || goal === 'get_rich' || loyal < 0) && r < 0.6;
  if (within || freelance) {
    pet.status = 'resolved';
    pet.authorized = within;
    if (!within) sh.stats.unauthorized++;
    switch (pet.subject) {
      case 'financial_dispute': {
        const amount = Math.max(100, Math.min(Math.round(ub.wealth / 4), randInt(sh, 2, 15) * 100));
        if (ub.wealth >= amount) {
          ub.wealth -= amount;
          m.wealth += amount;
          pet.amount = amount;
          noteFavor(s, { byId: ub.id, toId: m.id, kind: 'advance', amount, authority: within ? 'delegated' : 'unauthorized', truth: `${U} lent ${m.firstName} $${amount.toLocaleString('en-US')} out of his own pocket` });
          pet.decision = `${U} lent ${m.firstName} $${amount.toLocaleString('en-US')} out of his own pocket and settled it`;
        } else pet.decision = `${U} split the difference and told both men to shake hands`;
        break;
      }
      case 'member_grievance':
        if (ambitious && rand(sh) < 0.5) {
          pet.decision = `${U} told ${m.firstName} the old man doesn't see the men anymore — "but I do"`;
          changeMeter(s, m.id, s.playerId, 'grievance', 3);
        } else {
          pet.decision = `${U} calmed ${m.firstName} down and fixed what he could`;
          changeMeter(s, m.id, s.playerId, 'grievance', -6);
        }
        break;
      case 'business_opportunity':
        pet.decision = `${U} gave ${m.firstName} the okay${within ? '' : ' — not his to give'}, for a piece`;
        ub.wealth += 150;
        break;
      case 'promotion':
        pet.decision = `${U} moved ${m.firstName} up in his crew's pecking order${within ? '' : ', without asking anybody'}`;
        break;
      default:
        pet.decision = `${U} set a new rule for the summer corners${within ? '' : ' on his own say-so'}`;
        break;
    }
    addOpinion(s, m.id, ub.id, within ? `${U} settled it for me` : `${U} got it done when nobody else would`, within ? 4 : 6, 1);
    return;
  }
  pet.status = 'raised';
  pet.decision = `${U} said this one is for the boss`;
  sh.raised.push({ id: `rz${s.nextId++}`, week: s.week, by: ub.id, petId: pet.id, sessionId: ses.id });
  addOpinion(s, m.id, ub.id, `${U} spoke up for me`, 1, 1);
}

/** Held only when real petitions are waiting and he has the time (the scheduling condition). */
function courtWeek(ctx: Ctx): ShSession | undefined {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const ub = theUb(s);
  sh.pending = sh.pending.filter((p) => s.characters[p.by]?.alive && s.week - p.week <= 6);
  if (!ub || ub.id === s.playerId || !sh.pending.length) return undefined;
  const inv = involvement(s).score;
  const busy = (ub.busyUntil ?? 0) > s.week;
  const odds = sh.pending.length >= 2 ? 0.75 : 0.3 + (inv < 40 ? 0.25 : 0);
  if (busy || !chance(sh, odds)) return undefined;
  const pets = sh.pending.splice(0, Math.min(3, sh.pending.length));
  const goal = ubGoal(s, ub);
  const people = Array.from(new Set(pets.map((p) => p.by)));
  // A capo who calls him first sits in.
  const friend = (s.tribute?.ub.callsFirst ?? []).find((id) => !people.includes(id) && s.characters[id]?.alive && isFree(s, s.characters[id]));
  if (friend && chance(sh, 0.5)) people.push(friend);
  // The Don's plant, a man in the room.
  if (sh.plant && sh.plant.kind === 'man' && !sh.plant.blown && sh.plant.until >= s.week && s.characters[sh.plant.id]?.alive && !people.includes(sh.plant.id)) people.push(sh.plant.id);
  const auth = ubAuthority(s) === 'acting' ? 'acting_authority' : 'delegated';
  const ses: ShSession = { id: `ss${s.nextId++}`, week: s.week, presiding: ub.id, participants: people, petitions: pets, auth, where: WHERE[randInt(sh, 0, WHERE.length - 1)] };
  for (const p of pets) decide(ctx, ub, p, ses, goal);
  if (pets.some((p) => p.authorized === false) && auth !== 'acting_authority') ses.auth = 'unauthorized';
  sh.sessions.push(ses);
  sh.stats.sessions++;
  for (const id of [ub.id, ...people]) learn(s, id, ses.id, 'confirmed', 'was there');
  const t = ensureTribute(s);
  t.petitionsTo[ub.id] = (t.petitionsTo[ub.id] ?? 0) + pets.length;
  // A loyal underboss reports his meetings (the unauthorized parts only if he is loyal to a fault).
  const loyal = opinion(s, ub.id, s.playerId);
  const reports = goal === 'serve' ? true : goal === 'kingmaker' || goal === 'become_boss' ? false : loyal >= 30;
  if (reports && (ses.auth !== 'unauthorized' || (goal === 'serve' && loyal >= 40) || hasTrait(ub, 'Loyal-to-a-fault'))) learn(s, s.playerId, ses.id, 'confirmed', `${nameOf(s, ub.id)}'s own report`);
  // The plant reports.
  plantReport(ctx, ses);
  if (sh.sessions.length > 60) sh.sessions = sh.sessions.slice(-60);
  return ses;
}

function plantReport(ctx: Ctx, ses: ShSession): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const pl = sh.plant;
  if (!pl || pl.blown || pl.until < s.week || !s.characters[pl.id]?.alive) return;
  const ub = s.characters[ses.presiding];
  const eyes = ub ? attr(s, ub, 'awareness') : 50;
  if (chance(sh, 0.04 + Math.max(0, eyes - 50) / 400 + (pl.kind === 'man' ? 0.02 : 0))) {
    pl.blown = s.week;
    if (ub) {
      addOpinion(s, ub.id, s.playerId, 'Put a spy at my table', -18, 1);
      changeMeter(s, ub.id, s.playerId, 'grievance', 15);
      memo(s, sh, ub.id, `Caught ${nameOf(s, pl.id)} carrying his meetings back to the Don.`);
    }
    ctx.log.push(`${nameOf(s, ses.presiding)} found out ${nameOf(s, pl.id)} was carrying his meetings back to you.`);
    return;
  }
  const via = pl.kind === 'ear' ? `${nameOf(s, pl.id)} (an Ear)` : `${nameOf(s, pl.id)}, your man in the room`;
  if (chance(sh, pl.kind === 'man' ? 0.9 : 0.7)) {
    learn(s, s.playerId, ses.id, 'confirmed', via);
    for (const p of ses.petitions) if (p.promiseId) learn(s, s.playerId, p.promiseId, 'confirmed', via);
    pl.reports++;
  }
}

/* ------------------------------------------------------------------ */
/* Spreading and learning (weekly)                                     */
/* ------------------------------------------------------------------ */

function distort(s: GameState, sh: ShadowState, recId: string): string | undefined {
  const p = sh.promises.find((x) => x.id === recId);
  if (p) return chance(sh, 0.5) ? `${nameOf(s, p.maker)} promised ${nameOf(s, p.to)} the chair itself` : `${nameOf(s, p.maker)} promised half the crew things nobody can give`;
  const ses = sh.sessions.find((x) => x.id === recId);
  if (ses) return chance(sh, 0.5) ? `${nameOf(s, ses.presiding)} is telling people the old man is finished` : `${nameOf(s, ses.presiding)} had every capo in the family at his table`;
  return undefined;
}

/** What was said in a room spreads, some of it bent out of shape. */
function spreadWeek(s: GameState): void {
  const sh = ensureShadow(s);
  const ids = [...sh.sessions.filter((x) => s.week - x.week <= 156).map((x) => x.id), ...sh.promises.filter((x) => x.confidential && s.week - x.week <= 156).map((x) => x.id)];
  const men = crew(s).filter((c) => isFree(s, c));
  if (!men.length) return;
  for (const recId of ids) {
    const ks = knowers(sh, recId).filter((id) => id !== s.playerId && s.characters[id]?.alive);
    if (ks.length >= 14) continue;
    for (const k of ks) {
      if (!chance(sh, 0.035)) continue;
      const pool = [0, 1, 2].map(() => men[randInt(sh, 0, men.length - 1)]).filter((c) => c.id !== k && c.id !== s.playerId);
      const to = pool.sort((a, b) => opinion(s, k, b.id) - opinion(s, k, a.id))[0];
      if (!to) continue;
      const wrong = chance(sh, 0.25);
      learn(s, to.id, recId, 'rumor', `heard it from ${nameOf(s, k)}`, wrong ? distort(s, sh, recId) : undefined, wrong);
    }
  }
}

function recText(s: GameState, sh: ShadowState, recId: string): string {
  const ses = sh.sessions.find((x) => x.id === recId);
  if (ses) {
    const who = ses.participants.filter((id) => id !== ses.presiding).slice(0, 2).map((id) => nameOf(s, id));
    return `${nameOf(s, ses.presiding)} had ${who.join(' and ') || 'some of the men'} in ${ses.where}. Petitions, like he's the boss.`;
  }
  const p = sh.promises.find((x) => x.id === recId);
  if (p) return `${nameOf(s, p.to)} is walking around like somebody promised him ${p.role}. Somebody did: ${nameOf(s, p.maker)}.`;
  return 'People are talking.';
}

/** The morning meeting: capos who are loyal to the Don drop a line about what they know. */
function planWhispers(s: GameState): void {
  const sh = ensureShadow(s);
  const ub = theUb(s);
  const out: Whisper[] = [];
  for (const k of crew(s).filter((c) => c.rank === 'capo' && isFree(s, c)).sort((a, b) => a.id.localeCompare(b.id))) {
    if (out.length >= 2) break;
    if (opinion(s, k.id, s.playerId) < 15 || (ub && sh.plans[k.id]?.prefer === ub.id)) continue;
    const mine = sh.know[k.id] ?? {};
    const news = Object.keys(mine).filter((rid) => !belief(s, s.playerId, rid) && (rid.startsWith('ss') || rid.startsWith('sp')) && rid !== sh.plant?.id).sort();
    if (!news.length || !chance(sh, 0.18)) continue;
    const rid = news[randInt(sh, 0, news.length - 1)];
    const b = mine[rid];
    out.push({ capoId: k.id, day: randInt(sh, 0, 6), recId: rid, text: b.wrong && b.txt ? `${b.txt}. That's what I hear, anyway.` : recText(s, sh, rid) });
  }
  // A capo may also say where another man stands (sometimes wrongly).
  const caps = crew(s).filter((c) => c.rank === 'capo' && isFree(s, c) && opinion(s, c.id, s.playerId) >= 25);
  if (out.length < 2 && caps.length && chance(sh, 0.15)) {
    const k = caps[randInt(sh, 0, caps.length - 1)];
    const ms = members(s).filter((m) => m.id !== k.id && !sh.views[m.id] && sh.plans[m.id]?.prefer);
    if (ms.length) {
      const m = ms[randInt(sh, 0, ms.length - 1)];
      out.push({ capoId: k.id, day: randInt(sh, 0, 6), recId: `back:${m.id}`, text: `${nameOf(s, m.id)}? He's been sitting at ${nameOf(s, sh.plans[m.id]!.prefer)}'s table lately. Draw your own conclusions.` });
    }
  }
  sh.whispers = out;
}

/** Last week's morning lines become what the Don believes. */
function heardWhispers(s: GameState): void {
  const sh = ensureShadow(s);
  for (const w of sh.whispers) {
    const k = s.characters[w.capoId];
    if (!k?.alive) continue;
    const via = `${nameOf(s, k.id)} at the morning meeting`;
    if (w.recId.startsWith('back:')) {
      const mId = w.recId.slice(5);
      const truth = sh.plans[mId]?.prefer;
      // One time in five the capo has it wrong.
      const wrong = chance(sh, 0.2) ? claimants(s).find((c) => c.id !== truth && c.id !== mId)?.id : undefined;
      seeBacking(s, mId, wrong ?? truth, 'rumor', via);
      continue;
    }
    const b = sh.know[k.id]?.[w.recId];
    learn(s, s.playerId, w.recId, 'rumor', via, b?.txt, !!b?.wrong);
  }
  sh.whispers = [];
}

/** The check-in line a capo gives this morning about the court, if any (checkins.ts). */
export function whisperOn(s: GameState, capoId: string, day: number): string | undefined {
  return s.shadow?.whispers.find((w) => w.capoId === capoId && w.day === day)?.text;
}

function otherChannels(ctx: Ctx): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const unknown = [...sh.sessions.map((x) => x.id), ...sh.promises.filter((p) => p.maker !== s.playerId).map((x) => x.id)].filter((id) => !belief(s, s.playerId, id) && knowers(sh, id).length);
  if (!unknown.length) return;
  // The consigliere digging for secrets.
  const cons = theCons(s);
  if (cons && s.council?.consigliere?.task === 'cons_secrets' && chance(sh, 0.06)) {
    const rid = unknown[randInt(sh, 0, unknown.length - 1)];
    learn(s, s.playerId, rid, 'rumor', `${nameOf(s, cons.id)}, digging`);
  }
  // An old Don in retirement still hears everything.
  const em = sh.emeritus ? s.characters[sh.emeritus.id] : undefined;
  if (em?.alive && chance(sh, 0.05)) {
    const rid = unknown[randInt(sh, 0, unknown.length - 1)];
    learn(s, s.playerId, rid, 'rumor', `${nameOf(s, em.id)}, who still hears everything`);
  }
}

/* ------------------------------------------------------------------ */
/* Rival families (monthly)                                            */
/* ------------------------------------------------------------------ */

function rivalsMonth(ctx: Ctx): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const pr = pressure(s).score;
  const heir = declaredHeir(s);
  const ub = theUb(s);
  const boss = player(s);
  for (const r of s.rivals.filter((x) => x.kind === 'mob')) {
    const leader = s.characters[r.leaderId];
    if (!leader?.alive) continue;
    const read = (sh.rivals[r.id] ??= { stance: 'steady', thinks: pr, w: s.week, moves: 0 });
    // They read the family from outside: noisy.
    read.thinks = clamp(pr + (rand(sh) - 0.5) * 30);
    const toDon = opinion(s, leader.id, boss.id);
    if (read.thinks < 40) {
      if (read.stance !== 'steady') { read.stance = 'steady'; read.w = s.week; }
      continue;
    }
    if (!chance(sh, 0.25)) continue;
    // Some prefer the old man (predictable); some the inexperienced son (better terms); some the underboss.
    const heirCap = heir ? capability(s, heir).score : 0;
    const favor = toDon >= 25 ? undefined : heir && heirCap < 50 ? heir.id : ub && opinion(s, leader.id, ub.id) > opinion(s, leader.id, heir?.id ?? '') ? ub.id : heir?.id;
    if (favor) read.favor = favor;
    const unknown = sh.sessions.filter((x) => !belief(s, boss.id, x.id) && s.week - x.week <= 104);
    let stance: typeof read.stance;
    if (toDon >= 25 && unknown.length) stance = 'warn';
    else if (members(s).some((m) => sh.plans[m.id]?.goal === 'leave_organization' && !m.courtedBy)) stance = 'recruit';
    else if (favor && chance(sh, 0.5)) stance = 'court';
    else if (read.thinks >= 55) stance = 'renegotiate';
    else stance = 'probe';
    read.stance = stance;
    read.w = s.week;
    read.moves++;
    sh.stats.rivalMoves++;
    if (stance === 'warn') {
      const ses = unknown[unknown.length - 1];
      learn(s, boss.id, ses.id, 'confirmed', `a warning from ${r.shortName}`);
      read.known = 'confirmed';
      sh.stats.rivalWarnings++;
      ctx.log.push(`${displayName(leader)} of ${r.name} sent word: your underboss is holding meetings you were not at. They like things the way they are.`);
    } else if (stance === 'recruit') {
      const m = members(s).find((x) => sh.plans[x.id]?.goal === 'leave_organization' && !x.courtedBy);
      if (m) {
        m.courtedBy = { rival: r.id, week: s.week };
        addOpinion(s, m.id, leader.id, `${r.shortName} made me an offer`, 8, 1);
        memo(s, sh, m.id, `${r.name} offered him a place.`);
      }
    } else if (stance === 'court' && favor) {
      addOpinion(s, favor, leader.id, `${r.shortName} treats me like the next boss`, 6, 1);
      memo(s, sh, favor, `${r.name} has been courting him as the next boss.`);
    } else if (stance === 'renegotiate') {
      addOpinion(s, leader.id, boss.id, 'The old arrangement is up for discussion', -3, 1);
    }
    // The consigliere reads the other families.
    if (stance !== 'warn' && theCons(s) && chance(sh, 0.4)) read.known = 'rumor';
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

/** The weekly tick (power.ts calls it last). Self-contained, so a headless run can call it alone. */
export function shadowWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const sh = ensureShadow(s);
  if (!sh.donId) sh.donId = s.playerId;
  if (sh.donId !== s.playerId) {
    const old = sh.donId;
    sh.donId = s.playerId;
    if ((s.power?.station ?? 'boss') === 'boss') transitionHook?.(ctx, old);
  }
  if ((s.power?.station ?? 'boss') !== 'boss') return;
  heardWhispers(s);
  const row: [number, number, number, number, number] = [s.week, 0, 0, 0, 0];
  if (!Object.keys(sh.plans).length) plansMonth(ctx);
  petitionsWeek(ctx, row);
  courtWeek(ctx);
  sh.aud.push(row);
  if (sh.aud.length > 26) sh.aud = sh.aud.slice(-26);
  spreadWeek(s);
  otherChannels(ctx);
  if (sh.plant && (sh.plant.until < s.week || !s.characters[sh.plant.id]?.alive) && s.week - (sh.plant.blown ?? sh.plant.until) > 26) delete sh.plant;
  sh.raised = sh.raised.filter((x) => s.week - x.week <= 3);
  const mk = monthKey(s.date);
  if (sh.lastMonth !== mk) {
    sh.lastMonth = mk;
    plansMonth(ctx);
    rivalsMonth(ctx);
    const heir = declaredHeir(s);
    const truth = heir ? support(s).shares[heir.id] ?? 0 : 0;
    const known = heir ? support(s, true).shares[heir.id] ?? 0 : 0;
    if (heir && sh.heirOf !== heir.id) sh.heirOf = heir.id;
    sh.hist.push([s.week, pressure(s).score, truth, known]);
    if (sh.hist.length > 240) sh.hist = sh.hist.slice(-240);
  }
  storiesHook?.(ctx);
  planWhispers(s);
  const ubNow = theUb(s)?.id;
  if (ubNow) sh.ubWas = ubNow;
  else delete sh.ubWas;
}

/** Wired by shadowStories.ts (keeps the import graph one-way). */
let storiesHook: ((ctx: Ctx) => void) | undefined;
let transitionHook: ((ctx: Ctx, oldId: string) => void) | undefined;
export function registerShadowHooks(stories: (ctx: Ctx) => void, transition: (ctx: Ctx, oldId: string) => void): void {
  storiesHook = stories;
  transitionHook = transition;
}

/* ------------------------------------------------------------------ */
/* Views for the screens (only what the Don knows)                     */
/* ------------------------------------------------------------------ */

export interface KnownSession { ses: ShSession; b: Belief }
export function knownSessions(s: GameState): KnownSession[] {
  const sh = shadowView(s);
  return sh.sessions.map((ses) => ({ ses, b: belief(s, s.playerId, ses.id)! })).filter((x) => x.b).sort((a, b) => b.ses.week - a.ses.week);
}

export interface KnownPromise { p: ShPromise; b: Belief }
export function knownPromises(s: GameState): KnownPromise[] {
  const sh = shadowView(s);
  return sh.promises
    .map((p) => ({ p, b: p.maker === s.playerId ? ({ lvl: 'confirmed', w: p.week, via: 'you made it' } as Belief) : belief(s, s.playerId, p.id)! }))
    .filter((x) => x.b).sort((a, b) => b.p.week - a.p.week);
}

/** Petitions in the last N weeks, as the Don can count them: his own exactly, the underboss's only as far as he knows. */
export function audienceView(s: GameState, weeks = 8): { don: number; ubKnown: number; ubSessions: number; cons: number; capos: number } {
  const sh = shadowView(s);
  const rows = sh.aud.filter((r) => s.week - r[0] <= weeks);
  const ks = knownSessions(s).filter((x) => s.week - x.ses.week <= weeks);
  return { don: rows.reduce((a, r) => a + r[1], 0), ubKnown: ks.reduce((a, x) => a + x.ses.petitions.length, 0), ubSessions: ks.length, cons: rows.reduce((a, r) => a + r[3], 0), capos: rows.reduce((a, r) => a + r[4], 0) };
}

export function isRetiredDon(s: GameState, id: string): boolean {
  return fam(s, id).retired !== undefined;
}
