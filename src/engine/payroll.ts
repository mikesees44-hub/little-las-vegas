import { ageOn, isInSeason } from './calendar';
import { perkMod } from './lifestyle';
import { displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { adultOn } from './datingState';
import { owedBy } from './deeds/state';
import { applyEffects, fmtMoney } from './effects';
import { addFedEvidence, isInformant } from './fedsState';
import { journal } from './journal';
import { heat, money, respect, type Ctx } from './ledger';
import { addOpinion, getRelation, opinion } from './relations';
import { hashSeed } from './rng';
import { allure } from './looks';
import { getPerson } from './polPeople';
import { mutP } from './polState';
import { addSecret } from './secrets';
import { ensureRomance } from './storyState';
import { ensureThreats, isPoliceKind, KIND_LABEL, tipFromOutside, type Threat, type TipTruth } from './threats';
import { ADULT_ROLES, ROLE_LABEL } from './nightlifeState';

import { applyNightOp, dealAcceptance, kickbackRate, nightBlock, payrollAcceptance as nightAcceptance, protectionOf } from './nightlife';
import { holder } from './council';
import { capos as allCapos, crew } from './characters';
import {
  ensurePayroll, JOB_ORDER, JOBS, PAY_INFO, type PayLevel, type Conf, type Hire, type Hush, type HushItem, type PayJob, type PayOp, type PayrollAction, type PayrollState,
} from './payrollState';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Character, Choice, Effect, EventInstance, FactionId, GameState, PlayerAction } from './types';

/**
 * THE CIVILIAN PAYROLL. Anyone outside the Family can be offered a job: the
 * barber gives you his back chair, the cook keeps his ears open, the cop owes
 * you a word before the county moves, a made man's wife runs the wives' table,
 * and a wife on the QUIET ENVELOPE tells you what her husband's side really
 * knows and plans. They are civilians: not made, not sworn.
 *
 *  - The offer: the odds they say yes (what they think of you, the money,
 *    fear, their own family's feelings, a loyalty to somebody else, a favor
 *    they owe), the wage, what they bring (money, ears, cover, votes,
 *    tip-offs) and the risk. Settled in the moment; the result is in Your File.
 *  - The week: wages out ("Payroll: …", cost), yields in ("…'s end", business),
 *    through the one ledger, so the books reconcile.
 *  - The teeth: a cop on the payroll can be caught; a civilian who knows too
 *    much can be pinched and flip (feds); the unpaid and the squeezed turn;
 *    a quiet envelope's husband can find out.
 *  - One view: payrollRoster reads the other payrolls where they live (the
 *    nightlife's women and madams, the pad at City Hall, the no-show jobs, the
 *    outside guys) and never copies them.
 *
 * API for other systems: `hireAction(s, id, job)` (the order to put on a card),
 * `hire(s, id, job)` (direct, for a scene that already settled it), `fire`,
 * `raise`, `jobsFor`, `bestJob`.
 *
 * HARD RULES: adults only (18+ on the day); they decide (every offer carries
 * its odds and nothing is forced); no debts held over anyone; the sex-work
 * jobs are hidden when Mature content is Off; non-explicit; nobody is real.
 */

export const ADULT = 18;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const roll = (k: string) => (hashSeed(k) % 100003) / 100003;
const POLICE = /police|patrolman|sergeant|detective|trooper|sheriff|constable|captain/i;
const OFFICIAL = /mayor|council|commission|senator|assembl|freeholder|clerk|governor|chairman|politic|ward|treasurer|board/i;
const CLUB_KINDS = ['club', 'supperclub', 'gentsclub', 'hoodclub', 'afterhours', 'bar'];
const HONEST_NO: PayJob[] = ['cop', 'politician', 'bookie', 'runner', 'fence', 'hush', 'attendant', 'bookkeeper'];

/* ------------------------------------------------------------------ */
/* Who                                                                 */
/* ------------------------------------------------------------------ */

function adult(s: GameState, c: Character | undefined): c is Character {
  return !!c && ageOn(c.birth, s.date) >= ADULT;
}

/** A sworn member, the boss's own blood, or his wife: the Family, never the payroll. */
export function inFamily(s: GameState, c: Character): boolean {
  if (c.id === s.playerId) return true;
  if (c.dynasty) return true;
  if (player(s)?.spouseId === c.id) return true;
  return c.faction === 'player' && c.rank !== 'civilian' && !c.outside;
}

function mobOf(s: GameState, f: FactionId | undefined) {
  return s.rivals.find((r) => r.id === f && r.kind === 'mob');
}

function polOf(s: GameState, charId: string) {
  return Object.values(s.pol?.people ?? {}).find((p) => p.charId === charId && p.alive && !p.retired);
}

const STAR_WORK = /crooner|comic|singer|bandleader|headliner|revue|actress|actor|entertainer|band\b|hoofer|musician/i;
/** Somebody with a name in show business: a world-pack entertainer, a showbiz house's people, a singer of the clubs. */
export function isStar(s: GameState, c: Character): boolean {
  if ((polOf(s, c.id)?.fame ?? 0) >= 20) return true;
  if (s.nightlife?.people[c.id]?.role === 'singer') return true;
  return STAR_WORK.test(c.office ?? '');
}

const isCop = (c: Character) => c.outside === 'cop' || POLICE.test(c.office ?? '');
const isPol = (s: GameState, c: Character) => c.outside === 'politician' || (OFFICIAL.test(c.office ?? '') && !POLICE.test(c.office ?? '')) || !!polOf(s, c.id);

/** Who her man is, for the quiet envelope: a rival's man, one of yours, a cop, a politician. */
export type HushSide = 'rival' | 'crew' | 'cop' | 'pol';

/** The man a quiet envelope would report on (her husband first, then her father or a brother). */
export function hushTarget(s: GameState, c: Character): { on: Character; rel: string; side: HushSide } | undefined {
  if (!adult(s, c) || inFamily(s, c)) return undefined;
  const cands: [Character | undefined, string][] = [];
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  cands.push([sp, c.gender === 'F' ? 'husband' : 'wife']);
  const fa = c.fatherId ? s.characters[c.fatherId] : undefined;
  cands.push([fa, 'father']);
  for (const o of Object.values(s.characters)) {
    if (o.id === c.id || !o.alive || o.gender !== 'M' || !c.fatherId || o.fatherId !== c.fatherId) continue;
    cands.push([o, 'brother']);
  }
  for (const [m, rel] of cands) {
    if (!m?.alive || m.id === s.playerId || m.dynasty) continue;
    const side: HushSide | undefined = mobOf(s, m.faction) && m.rank !== 'civilian' ? 'rival'
      : m.faction === 'player' && m.rank !== 'civilian' && !m.outside ? 'crew'
      : isCop(m) ? 'cop' : isPol(s, m) ? 'pol' : undefined;
    if (side) return { on: m, rel, side };
  }
  return undefined;
}

/** On some payroll already (this one or another system's). */
export function onAnyPayroll(s: GameState, id: string): string | undefined {
  if (s.payroll?.hires[id]) return `On your payroll (${JOBS[s.payroll.hires[id].job].label.toLowerCase()})`;
  if (s.nightlife?.people[id]?.payroll) return 'On your payroll (the night)';
  const h = s.nightlife?.houses[id];
  if (h && h.with === 'player' && h.deal !== 'none') return 'Her house is under your protection';
  const p = polOf(s, id);
  if (p && s.pol?.ctl[p.id]?.payroll) return 'On the pad at City Hall';
  if (s.econ?.jobs[id]) return 'Has a no-show job from you';
  const c = s.characters[id];
  if (c?.outside && c.faction === 'none' && c.capoId && s.characters[c.capoId]?.alive) return `Works with ${s.characters[c.capoId].firstName}'s crew`;
  return undefined;
}

/** Why nobody can offer this person a job (undefined: they can be asked). */
export function offerBlock(s: GameState, c: Character | undefined): string | undefined {
  if (!c) return 'Nobody';
  if (!c.alive) return 'Dead';
  if (!adult(s, c)) return 'Adults only';
  if (c.id === s.playerId) return 'Yourself';
  if (inFamily(s, c)) return c.dynasty || player(s)?.spouseId === c.id ? 'Your own family' : 'Already in the Family';
  if (s.rivals.some((r) => r.leaderId === c.id)) return 'He runs his own family';
  const b = player(s);
  if (!b?.alive) return 'You are not here';
  if (!isFree(s, b)) return 'You are inside';
  return undefined;
}

/** The jobs that fit this person (best first). The sex-work jobs only for women of the night, only with Mature content on. */
export function jobsFor(s: GameState, c: Character): PayJob[] {
  if (offerBlock(s, c)) return [];
  const out: PayJob[] = [];
  const F = c.gender === 'F';
  const n = s.nightlife?.people[c.id];
  const mature = adultOn(s);
  if (hushTarget(s, c)) out.push('hush');
  if (isStar(s, c)) out.push('celebrity');
  if (n && n.status === 'active' && mature && ['escort', 'callgirl', 'street'].includes(n.role)) out.push('girl');
  if (n && n.status === 'active' && mature && n.role === 'dancer') out.push('dancer');
  if (n && n.role === 'madam' && s.nightlife?.houses[c.id] && mature) out.push('madam');
  if (isCop(c)) out.push('cop');
  if (isPol(s, c) && !isCop(c)) out.push('politician');
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  if (F && sp?.alive && sp.faction === 'player' && sp.rank !== 'civilian' && !sp.outside && sp.id !== s.playerId) out.push('wife');
  if (c.outside === 'bookie' || c.craft === 'bookmaker') out.push('bookie');
  if (c.outside === 'runner') out.push('runner');
  if (c.outside === 'fence') out.push('fence');
  const job = `${c.ambition} ${c.office ?? ''}`.toLowerCase();
  const hint: [RegExp, PayJob][] = [[/barber/, 'barber'], [/cook|chef|kitchen|diner|counter/, 'cook'], [/bartend|bar\b|tavern/, 'bartender'], [/park|garage|lot/, 'parking'], [/driv|cab|truck/, 'driver'], [/clerk|office|county/, 'clerk'], [/book|account|ledger/, 'bookkeeper'], [/card|game|cigar/, 'attendant']];
  for (const [re, j] of hint) if (re.test(job) && !out.includes(j) && (JOBS[j].who !== 'man' || !F)) out.push(j);
  for (const j of ['bartender', 'cook', 'attendant', 'runner', 'clerk', 'bookkeeper', 'barber', 'parking', 'driver', 'bookie', 'fence'] as PayJob[]) {
    if (out.includes(j)) continue;
    if (JOBS[j].who === 'man' && F) continue;
    out.push(j);
  }
  return out.filter((j) => !JOBS[j].mature || mature);
}

export function bestJob(s: GameState, c: Character): PayJob | undefined {
  return jobsFor(s, c)[0];
}

/* ------------------------------------------------------------------ */
/* The offer                                                           */
/* ------------------------------------------------------------------ */

function capAcc(base: number, reasons: Reason[], cap = 0.9): Acceptance {
  const sum = reasons.reduce((a, r) => a + r.value, base);
  return { chance: Math.max(0.05, Math.min(cap, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

/** Her odds of saying yes, with every reason. `favor`: they owe the boss for a favor done now. */
export function hireAcceptance(s: GameState, c: Character, job: PayJob, favor = false): Acceptance {
  const B = s.playerId;
  const r: Reason[] = [];
  const he = c.gender === 'F' ? 'She' : 'He';
  const op = opinion(s, c.id, B);
  if (op) r.push({ label: op > 0 ? 'Thinks well of you' : 'Thinks little of you', value: Math.round(op * 0.35) });
  if (c.wealth < 600) r.push({ label: 'Needs the money', value: 15 });
  else if (c.wealth > 20000) r.push({ label: 'Does not need your money', value: -15 });
  const fear = getRelation(s, c.id, B)?.fear ?? 0;
  if (fear > 10) r.push({ label: 'Wary of saying no to you', value: Math.min(10, Math.round(fear * 0.15)) });
  const fam = [c.spouseId, c.fatherId].map((x) => (x ? s.characters[x] : undefined)).filter((x): x is Character => !!x?.alive && x.id !== B);
  if (job !== 'hush') for (const f of fam.slice(0, 1)) {
    const o = opinion(s, f.id, B);
    if (Math.abs(o) >= 10) r.push({ label: `${c.spouseId === f.id ? (c.gender === 'F' ? 'Her husband' : 'His wife') : `${he === 'She' ? 'Her' : 'His'} father`} ${o > 0 ? 'thinks well of you' : 'wants nothing to do with you'}`, value: Math.round(o * 0.2) });
  }
  const rv = mobOf(s, c.faction);
  if (rv) r.push({ label: `Loyal to the ${rv.shortName} family`, value: -35 });
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  if (job !== 'hush' && sp && mobOf(s, sp.faction)) r.push({ label: `Married into the ${mobOf(s, sp.faction)!.shortName} family`, value: -15 });
  if (owedBy(s, c.id, B) > 0) r.push({ label: 'Owes you a favor', value: 15 });
  if (favor) r.push({ label: 'You are doing them a favor right now', value: 22 });
  if (hasTrait(c, 'Honest') && HONEST_NO.includes(job)) r.push({ label: 'An honest sort', value: -20 });
  if (hasTrait(c, 'Greedy')) r.push({ label: 'Likes money', value: 10 });
  if (job === 'cop' || job === 'politician') r.push({ label: 'Has a badge or an office to lose', value: -10 });
  if (job === 'celebrity') {
    const fame = polOf(s, c.id)?.fame ?? 40;
    r.push({ label: 'A name to protect from the papers', value: -10 });
    if (fame >= 60) r.push({ label: 'Big enough not to need you', value: -10 });
    if (s.businesses.some((b) => b.owner === 'player' && CLUB_KINDS.includes(b.kind))) r.push({ label: 'You have a stage to offer', value: 12 });
  }
  if (job === 'hush') {
    const t = hushTarget(s, c);
    if (t) {
      const o = opinion(s, c.id, t.on.id);
      if (o < 0) r.push({ label: `Unhappy with her ${t.rel}`, value: Math.round(-o * 0.4) });
      else if (o > 40) r.push({ label: `Devoted to her ${t.rel}`, value: -20 });
      if (s.nightlife?.npc.some((g) => g.man === t.on.id && !g.ended)) r.push({ label: `Her ${t.rel} keeps a goomar`, value: 15 });
      if (t.side === 'crew') r.push({ label: 'He is one of yours: she worries what you would do with it', value: -10 });
      if (hasTrait(c, 'Loyal-to-a-fault')) r.push({ label: 'Loyal to a fault', value: -25 });
      r.push({ label: 'Telling on her own family', value: -10 });
    }
  }
  const n = s.nightlife?.people[c.id];
  if (n?.bounds.includes('no_payroll')) return { chance: 0, reasons: [{ label: 'Works for herself, on nobody\'s payroll', value: -100 }] };
  return capAcc(job === 'hush' ? 30 : 35, r);
}

/** What the job brings, in a line ("~$60/wk, ears, cover"). */
export function yieldText(job: PayJob, wage?: number): string {
  const j = JOBS[job];
  const bits: string[] = [];
  if (j.money) bits.push(`~${fmtMoney(j.money)}/wk in season`);
  if (j.ears) bits.push(j.ears >= 2 ? 'good ears' : 'ears');
  if (j.tips) bits.push('raid tip-offs');
  if (j.cover) bits.push(j.coverBar === 'federal' ? 'clean books (federal cover)' : 'cover');
  if (j.votes && job !== 'celebrity') bits.push('a vote at City Hall');
  if (job === 'hush') bits.push('what her husband\'s side really knows and plans');
  if (job === 'celebrity') bits.push('respect, a draw for your club, introductions to people in power');
  if (job === 'girl' || job === 'dancer') bits.push('a cut of what she makes (she keeps the rest)');
  if (job === 'madam') bits.push('protection money from her house');
  const w = wage ?? j.wage;
  return `${bits.join(', ') || 'a friend'}${w ? ` · wage ${fmtMoney(w)}/wk` : ''}`;
}

export function riskText(job: PayJob): string {
  if (job === 'cop') return 'He can be caught taking it; the county comes looking.';
  if (job === 'politician') return 'An investigator can follow the money to you.';
  if (job === 'celebrity') return 'Bad press, and the federal kind of attention that comes of being photographed with you.';
  if (job === 'hush') return 'Her husband may find out: a grudge, a warning to his side, and she may get hurt (offstage).';
  if (job === 'girl') return 'Vice heat; she keeps her share and can quit any time.';
  if (job === 'dancer') return 'A raid on the club; she keeps her share and can quit any time.';
  if (job === 'madam') return 'Raids; a rival family may squeeze her house.';
  return JOBS[job].risk >= 20 ? 'Knows enough to hurt you if the law pinches him.' : 'Little: a civilian who sees a few things.';
}

/** The order that offers this person this job, wherever that payroll lives (the nightlife's, City Hall's, or this one). */
export function hireAction(s: GameState, id: string, job: PayJob, pay?: PayLevel, via?: string): PlayerAction {
  const p = polOf(s, id);
  if (p && (job === 'cop' || job === 'politician')) return { kind: 'pol', op: { op: 'payroll', id: p.id, on: true } };
  return { kind: 'payroll', op: { op: 'hire', id, job, ...(pay && pay !== 'fair' ? { pay } : {}), ...(via ? { via } : {}) } };
}

/* ------------------------------------------------------------------ */
/* Who asks, and how much: the offer                                   */
/* ------------------------------------------------------------------ */

export interface Asker { id?: string; label: string; rank: 'boss' | 'underboss' | 'consigliere' | 'capo' | 'soldier' | 'associate' }

/** Who can make the offer: the boss in person (it takes his hour), or one of his men (a quarter of an hour). */
export function askers(s: GameState): Asker[] {
  const out: Asker[] = [{ label: 'You, in person', rank: 'boss' }];
  const ub = holder(s, 'underboss');
  const cons = holder(s, 'consigliere');
  const free = (c?: Character) => !!c && c.alive && c.id !== s.playerId && isFree(s, c);
  if (free(ub)) out.push({ id: ub!.id, label: `${displayName(ub!)}, your underboss`, rank: 'underboss' });
  if (free(cons)) out.push({ id: cons!.id, label: `${displayName(cons!)}, your consigliere`, rank: 'consigliere' });
  const k = allCapos(s).filter((c) => c.faction === 'player' && free(c) && c.id !== ub?.id && c.id !== cons?.id).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (k) out.push({ id: k.id, label: `${displayName(k)}, a capo`, rank: 'capo' });
  const so = crew(s).filter((c) => c.rank === 'soldier' && free(c)).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (so) out.push({ id: so.id, label: `${displayName(so)}, a soldier`, rank: 'soldier' });
  const as = crew(s).filter((c) => c.rank === 'associate' && free(c) && !c.specialty).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (as) out.push({ id: as.id, label: `${displayName(as)}, an associate`, rank: 'associate' });
  return out;
}

const RANK_ODDS: Record<Asker['rank'], number> = { boss: 15, underboss: 10, consigliere: 10, capo: 7, soldier: 3, associate: 0 };

/** The asker's weight: his place in the Family, and the Family's respect. */
export function askerReason(s: GameState, via?: string): Reason {
  const c = via ? s.characters[via] : undefined;
  const rk: Asker['rank'] = !c ? 'boss' : c.id === holder(s, 'underboss')?.id ? 'underboss' : c.id === holder(s, 'consigliere')?.id ? 'consigliere' : c.rank === 'capo' ? 'capo' : c.rank === 'soldier' ? 'soldier' : 'associate';
  const resp = Math.round((s.respect - 50) / (rk === 'boss' ? 8 : 16));
  const label = !c ? 'Asked by the boss himself' : `Asked by ${displayName(c)} (${rk})`;
  return { label: resp ? `${label}, with the Family's respect behind it` : label, value: RANK_ODDS[rk] + resp };
}

/** The offer's size against what they need and expect: diminishing for the comfortable and the famous. */
export function payReason(_s: GameState, c: Character | undefined, pay: PayLevel = 'fair', fame = 0): Reason | undefined {
  const v = PAY_INFO[pay].odds;
  if (!v) return undefined;
  const need = !c ? 1 : c.wealth < 600 || c.debtTo ? 1.3 : c.wealth > 20000 ? 0.5 : c.wealth > 6000 ? 0.75 : 1;
  const f = v > 0 ? need * (fame >= 60 ? 0.6 : 1) : 1 / need;
  return { label: `${PAY_INFO[pay].label} offer`, value: Math.round(v * f) };
}

/** Money cannot buy a man truly loyal to another family away from it. */
function loyaltyCap(s: GameState, c: Character | undefined): { cap: number; why?: string } {
  if (!c) return { cap: 0.9 };
  const rv = mobOf(s, c.faction);
  if (rv) {
    const love = opinion(s, c.id, rv.leaderId);
    return love >= 40 ? { cap: 0.2, why: `Loyal to the ${rv.shortName} family, heart and soul` } : { cap: 0.35, why: `Loyal to the ${rv.shortName} family` };
  }
  return { cap: 0.9 };
}

const RANK_ALLURE = /boss's name opens doors|man of standing/;

/**
 * A man asking a woman: his looks to her, his charm, a ladies' man's practice, his appetite (looks.ts allure).
 * The asker's own when he is sent, the boss's when he goes himself. Rank is already counted (askerReason) and
 * Charming once. It raises the odds; it never decides for her.
 */
export function allureReasons(s: GameState, c: Character | undefined, via: string | undefined, have: Reason[] = []): Reason[] {
  const man = via ? s.characters[via] : player(s);
  if (!c || !man || man.gender !== 'M' || c.gender !== 'F') return [];
  const out = allure(s, man, c).reasons.filter((r) => !RANK_ALLURE.test(r.label) && !(r.label === 'Charming' && have.some((h) => /charming/i.test(h.label))));
  let sum = 0;
  return out.map((r) => {
    const v = Math.max(-25 - sum, Math.min(40 - sum, r.value));
    sum += v;
    return { label: via ? `${r.label} (${man.firstName})` : r.label, value: Math.round(v) };
  }).filter((r) => r.value !== 0);
}

/** Puts the asker and the amount on top of the person's own odds, and caps what money can do. */
function withOffer(s: GameState, c: Character | undefined, acc: Acceptance, pay: PayLevel | undefined, via: string | undefined, fame = 0): Acceptance {
  if (acc.chance <= 0) return acc;
  const extra = [askerReason(s, via), payReason(s, c, pay, fame)].filter((x): x is Reason => !!x && x.value !== 0);
  extra.push(...allureReasons(s, c, via, acc.reasons));
  const reasons = [...acc.reasons, ...extra];
  const lc = loyaltyCap(s, c);
  const sum = reasons.reduce((a, r) => a + r.value, 0) / 100;
  const chance = Math.max(0.05, Math.min(lc.cap, sum));
  return { chance, reasons: lc.cap < 0.9 && sum > lc.cap ? [...reasons, { label: `${lc.why}: no amount buys more`, value: Math.round((lc.cap - sum) * 100) }] : reasons };
}

/** The odds of an offer as the card shows them, every reason (the person's own, who asks, how much). */
export function offerAcceptance(s: GameState, c: Character, job: PayJob, opts: { pay?: PayLevel; via?: string; favor?: boolean } = {}): Acceptance {
  let acc: Acceptance;
  const n = s.nightlife?.people[c.id];
  const h = s.nightlife?.houses[c.id];
  if ((job === 'girl' || job === 'dancer') && n) acc = nightAcceptance(s, n, c);
  else if (job === 'madam' && h) acc = dealAcceptance(s, h, 'protect');
  else acc = hireAcceptance(s, c, job, opts.favor);
  return withOffer(s, c, acc, opts.pay, opts.via, polOf(s, c.id)?.fame ?? 0);
}

/** The wage (or, for the night's women, the signing envelope) at a pay level. */
export function offerMoney(job: PayJob, pay: PayLevel = 'fair'): { wage: number; sign: number } {
  const m = PAY_INFO[pay].mult;
  const j = JOBS[job];
  if (job === 'girl' || job === 'dancer') return { wage: 0, sign: Math.round(200 * m / 10) * 10 };
  if (job === 'madam') return { wage: 0, sign: Math.round(300 * m / 10) * 10 };
  return { wage: Math.round(j.wage * m / 5) * 5, sign: 0 };
}

const PX = (op: PayOp, label: string): Effect => ({ type: 'payroll', op, label }) as Effect;

function base(title: string, because: string): ActionPreview {
  return { title, effects: [], cost: 0, because, category: 'event' };
}

export function previewPayroll(s: GameState, a: PayrollAction): ActionPreview {
  const aid = a.op === 'star' ? '' : a.id;
  const c = s.characters[aid];
  const P = s.payroll;
  const h = P?.hires[aid];
  const nm = c ? c.firstName : 'Nobody';
  switch (a.op) {
    case 'hire': {
      const j = JOBS[a.job];
      const blk = offerBlock(s, c);
      const on = c ? onAnyPayroll(s, c.id) : undefined;
      const fits = c ? jobsFor(s, c).includes(a.job) : false;
      const t = c && a.job === 'hush' ? hushTarget(s, c) : undefined;
      const night = a.job === 'girl' || a.job === 'dancer' || a.job === 'madam';
      const om = offerMoney(a.job, a.pay);
      const up = om.wage || om.sign;
      const asker = a.via ? s.characters[a.via] : undefined;
      const title = `${a.job === 'hush' ? `A quiet envelope for ${nm}` : a.job === 'madam' ? `Offer ${nm}'s house the Family's protection` : `Offer ${nm} a job: ${j.label.toLowerCase()}`}${a.pay && a.pay !== 'fair' ? ` (${PAY_INFO[a.pay].label.toLowerCase()})` : ''}${asker ? `, through ${asker.firstName}` : ''}`;
      const p: ActionPreview = {
        ...base(title, a.job === 'hush' ? `offered ${nm} a quiet envelope` : `offered ${nm} a job (${j.label.toLowerCase()})`),
        cost: up, category: 'cost',
        detail: c ? `${displayName(c)}, ${ageOn(c.birth, s.date)}. ${j.blurb}.${t ? ` She would tell you what her ${t.rel}, ${displayName(t.on)}, hears and plans (${t.side === 'rival' ? `${mobOf(s, t.on.faction)?.shortName} family` : t.side === 'crew' ? 'one of your own' : t.side === 'cop' ? 'a cop' : 'City Hall'}).` : ''} Brings: ${yieldText(a.job)}. Risk: ${riskText(a.job)} The first week's envelope now; a civilian, not made. ${c.gender === 'F' ? 'She' : 'He'} decides.` : '',
        effects: [{ type: 'money', amount: -up, category: 'cost', label: night ? `${nm}: a signing envelope` : `${nm}: the first envelope` }, PX({ op: 'hire', id: a.id, job: a.job, wage: om.wage, ...(om.sign ? { sign: om.sign } : {}) }, `${nm} on the payroll`)],
        acceptance: c ? offerAcceptance(s, c, a.job, { pay: a.pay, via: a.via }) : undefined,
        refuseEffects: [PX({ op: 'refused', id: a.id, job: a.job }, `${nm} said no`)],
        oddsLabel: c?.gender === 'F' ? 'She says yes' : 'He says yes',
        warning: a.job === 'hush' ? 'If she says no, she may tell her husband.' : c && mobOf(s, c.faction) ? 'The other family will take it as poaching if they hear.' : undefined,
        disabledReason: blk ?? on ?? (!fits ? (JOBS[a.job].mature && !adultOn(s) ? 'Mature content is Off in Settings' : 'Not a job that fits') : undefined) ?? (c && !isFree(s, c) ? 'In jail' : undefined) ?? (s.money < up ? `Needs ${fmtMoney(up)}` : undefined) ?? (a.via && !askers(s).some((x) => x.id === a.via) ? 'He cannot make the offer now' : undefined),
      };
      // The night's women decide by the night's own rules too (her bounds, her house, adults only, Mature content).
      if (night && c) p.disabledReason = nightBlock(s, c.id) ?? p.disabledReason;
      if (night) p.detail = `${p.detail} The night's payroll: she keeps her share and kicks back a cut for the protection, and she can quit any time.`;
      return p;
    }
    case 'fire':
      return {
        ...base(`Let ${nm} go`, `let ${nm} go from the payroll`),
        detail: h?.hush ? 'The envelope stops. She keeps what she knows.' : `The envelope stops. ${h && h.knows >= 40 ? 'He knows a fair amount: a sore man who knows things can talk.' : 'No hard feelings, maybe.'}`,
        effects: [PX({ op: 'fire', id: a.id }, `${nm} let go`)],
        disabledReason: !h ? 'Not on this payroll' : undefined,
      };
    case 'raise': {
      const up = a.amount > 0;
      return {
        ...base(up ? `A raise for ${nm} (+${fmtMoney(a.amount)}/wk)` : `Cut ${nm}'s envelope (${fmtMoney(a.amount)}/wk)`, up ? `gave ${nm} a raise` : `cut ${nm}'s envelope`),
        detail: up ? 'More loyal, and they remember who was good to them.' : 'Cheaper. Squeezed people remember too, and some of them turn.',
        effects: [PX({ op: 'raise', id: a.id, amount: a.amount }, up ? `A raise for ${nm}` : `${nm}'s envelope cut`)],
        disabledReason: !h ? 'Not on this payroll' : h.wage + a.amount < 10 ? 'Already as low as it goes' : h.wage + a.amount > 400 ? 'That is more than the job is worth' : undefined,
      };
    }
    case 'star': {
      const st = starOf(s, a.ref);
      const j = JOBS.celebrity;
      const fame = st?.fame ?? 40;
      const om = offerMoney('celebrity', a.pay);
      const reasons: Reason[] = [{ label: 'A name to protect from the papers', value: -10 }];
      if (fame >= 60) reasons.push({ label: 'Big enough not to need you', value: -10 });
      if (s.businesses.some((b) => b.owner === 'player' && CLUB_KINDS.includes(b.kind))) reasons.push({ label: 'You have a stage to offer', value: 12 });
      return {
        ...base(`${st?.name ?? 'A star'}: a friend of the family${a.pay && a.pay !== 'fair' ? ` (${PAY_INFO[a.pay].label.toLowerCase()})` : ''}`, `offered ${st?.name ?? 'a star'} a retainer`), cost: om.wage, category: 'cost',
        detail: st ? `${st.name}, ${st.title}. ${j.blurb}. Brings: ${yieldText('celebrity')}. Risk: ${riskText('celebrity')} The first week's retainer now. ${st.sex === 'F' ? 'She' : 'He'} decides.` : '',
        effects: [{ type: 'money', amount: -om.wage, category: 'cost', label: `${st?.name ?? 'A star'}: the first retainer` }, PX({ op: 'star', ref: a.ref, wage: om.wage }, `${st?.name ?? 'A star'}: a friend of the family`)],
        acceptance: withOffer(s, undefined, capAcc(40, reasons), a.pay, a.via, fame), oddsLabel: st?.sex === 'F' ? 'She says yes' : 'He says yes',
        disabledReason: !st ? 'Nobody by that name' : st.age < ADULT ? 'Adults only' : Object.values(s.payroll?.hires ?? {}).some((h) => h.ref === a.ref) ? 'Already a friend of the family' : s.money < om.wage ? `Needs ${fmtMoney(om.wage)}` : undefined,
      };
    }
    case 'main':
      return {
        ...base(`Name ${nm} your main earner`, `named ${nm} your main earner`),
        detail: 'The one you count on: a bigger end on what they bring in (+20%), and they know it (loyalty).',
        effects: [PX({ op: 'main', id: a.id }, `${nm}: main earner`)],
        disabledReason: !c?.alive ? 'Nobody' : P?.main === a.id ? 'Already your main earner' : !onAnyPayroll(s, a.id) ? 'Not on any payroll' : undefined,
      };
  }
}

export function describePayOp(s: GameState, o: PayOp): string | undefined {
  const n = (id?: string) => (id && s.characters[id] ? displayName(s.characters[id]) : 'someone');
  switch (o.op) {
    case 'hire': return `${n(o.id)} goes on the payroll (${JOBS[o.job].label.toLowerCase()}, ${o.wage ? `${fmtMoney(o.wage)}/wk` : o.job === 'madam' ? 'her house pays for protection' : 'she keeps her share and kicks back a cut'})`;
    case 'refused': return `${n(o.id)} turned down the job`;
    case 'fire': return `${n(o.id)} off the payroll`;
    case 'raise': return `${n(o.id)}'s envelope ${o.amount > 0 ? '+' : ''}${fmtMoney(o.amount)}/wk`;
    case 'main': return `${n(o.id)} is your main earner`;
    case 'star': return `${starOf(s, o.ref)?.name ?? 'A star'} becomes a friend of the family`;
    case 'favor': return `In return, ${o.name ?? n(o.id)} works for you (${JOBS[o.job].label.toLowerCase()}, ${Math.round(o.chance * 100)}% yes)`;
    case 'protect': return `${n(o.id)}: ${o.how === 'move' ? 'moved out' : o.how === 'relocate' ? 'relocated' : 'you denied it'}`;
  }
}

/* ------------------------------------------------------------------ */
/* The API (direct)                                                    */
/* ------------------------------------------------------------------ */

function plog(P: PayrollState, s: GameState, text: string): void {
  P.log.push([s.week, text]);
  if (P.log.length > 60) P.log.splice(0, P.log.length - 60);
}

function newHush(s: GameState, c: Character): Hush | undefined {
  const t = hushTarget(s, c);
  if (!t) return undefined;
  const o = opinion(s, c.id, t.on.id);
  const close = clamp(55 + o / 2);
  const access = clamp((t.rel === 'husband' ? 55 : 35) + close / 4 + (t.side === 'rival' && t.on.rank === 'capo' ? 10 : 0) + (hashSeed(`${s.seed}:acc:${c.id}`) % 20) - 10);
  const nerve = clamp(35 + c.attributes.intrigue * 2 + (hasTrait(c, 'Cowardly') ? -15 : 0) - (hasTrait(c, 'Paranoid') ? 10 : 0));
  return { on: t.on.id, rel: t.rel, access, close, nerve, heat: 0 };
}

/**
 * Put someone on the payroll now (a scene or another system that already
 * settled it: womenearn's "hire her", a favor's price). Routes the night's
 * women and madams to the night's own payroll. No money moves here: the
 * caller's order pays the first envelope; the week pays the rest.
 */
export function hire(s: GameState, id: string, job: PayJob, opts: { wage?: number; fav?: boolean } = {}): Hire | undefined {
  const c = s.characters[id];
  if (!c?.alive || !adult(s, c) || inFamily(s, c)) return undefined;
  if (JOBS[job].mature && !adultOn(s)) return undefined;
  const n = s.nightlife?.people[id];
  if ((job === 'girl' || job === 'dancer') && n) { n.payroll ??= { since: s.week, paid: 0 }; n.side = 'player'; n.met = true; return undefined; }
  const hh = s.nightlife?.houses[id];
  if (job === 'madam' && hh) { hh.deal = 'protect'; hh.with = 'player'; return undefined; }
  const P = ensurePayroll(s);
  if (P.hires[id]) return P.hires[id];
  const h: Hire = { id, job, wage: opts.wage ?? JOBS[job].wage, since: s.week, loyalty: clamp(40 + opinion(s, id, s.playerId) / 3 + (opts.fav ? 10 : 0)), knows: job === 'cop' || job === 'bookkeeper' ? 15 : 5, unpaid: 0, paid: 0, made: 0 };
  if (opts.fav) h.fav = 1;
  if (job === 'hush') { const hs = newHush(s, c); if (!hs) return undefined; h.hush = hs; }
  P.hires[id] = h;
  P.stats.hired++;
  plog(P, s, `${displayName(c)} went on the payroll: ${JOBS[job].label.toLowerCase()}.`);
  return h;
}

function leave(s: GameState, P: PayrollState, h: Hire, why: string): void {
  delete P.hires[h.id];
  if (P.main === h.id) P.main = undefined;
  P.gone.push({ id: h.id, job: h.job, week: s.week, why });
  if (P.gone.length > 30) P.gone.splice(0, P.gone.length - 30);
}

export function fire(s: GameState, id: string): boolean {
  const P = s.payroll;
  const h = P?.hires[id];
  if (!P || !h) return false;
  leave(s, P, h, 'Let go');
  P.stats.fired++;
  return true;
}

export function raise(s: GameState, id: string, amount: number): boolean {
  const h = s.payroll?.hires[id];
  if (!h) return false;
  h.wage = Math.max(10, h.wage + Math.round(amount));
  if (amount > 0) { h.loyalty = clamp(h.loyalty + Math.min(15, amount / 4)); h.squeezed = undefined; } else { h.loyalty = clamp(h.loyalty + amount / 2); h.squeezed = s.week; }
  return true;
}

/* ------------------------------------------------------------------ */
/* Effect ops                                                          */
/* ------------------------------------------------------------------ */

export function applyPayOp(ctx: Ctx, o: PayOp): void {
  const s = ctx.s;
  const B = s.playerId;
  switch (o.op) {
    case 'hire': {
      // The night's women and madams: the night's own payroll and protection (poaching, her loyalty) take it.
      if ((o.job === 'girl' || o.job === 'dancer') && s.nightlife?.people[o.id]) { applyNightOp(ctx, { op: 'payroll', id: o.id }); return; }
      if (o.job === 'madam' && s.nightlife?.houses[o.id]) { applyNightOp(ctx, { op: 'deal', house: o.id, deal: 'protect' }); return; }
      const h = hire(s, o.id, o.job, { wage: o.wage, fav: !!o.fav });
      const c = s.characters[o.id];
      if (h && c) {
        addOpinion(s, c.id, B, o.job === 'hush' ? 'The quiet envelope' : 'On your payroll', 6, 1);
        ctx.log.push(`${displayName(c)} is on your payroll: ${JOBS[o.job].label.toLowerCase()}.`);
      }
      return;
    }
    case 'refused': {
      const c = s.characters[o.id];
      const P = ensurePayroll(s);
      P.stats.refused++;
      if (!c || o.job !== 'hush') return;
      const t = hushTarget(s, c);
      if (!t) return;
      // She may tell him (her call, her nerves): a grudge, and a warning to his side.
      // The quiet envelope (bossSkills.ts, Intrigue 10): asked the right way, she keeps it to herself more often.
      const tell = Math.max(0.05, 0.3 + (opinion(s, c.id, t.on.id) > 20 ? 0.25 : 0) + (hasTrait(c, 'Honest') ? 0.15 : 0) - perkMod(s, 'quietEnv') / 100);
      if (roll(`${s.seed}|${s.week}|hushtell|${c.id}`) >= tell) { plog(P, s, `${c.firstName} said no to the envelope, and kept it to herself.`); return; }
      const fx: Effect[] = [{ type: 'opinion', from: t.on.id, to: B, amount: -15, reason: `Tried to buy my ${t.rel === 'husband' ? 'wife' : 'family'}`, decay: 1, label: `${c.firstName} told her ${t.rel}` }];
      const rv = mobOf(s, t.on.faction);
      if (rv) fx.push({ type: 'rivalOpinion', rival: rv.id, amount: -6, reason: 'Went after one of our wives', label: `${c.firstName} told her ${t.rel}` });
      if (t.side === 'crew') fx.push({ type: 'meter', from: t.on.id, to: B, meter: 'grievance', amount: 12, label: `${c.firstName} told her ${t.rel}` });
      applyEffects(ctx, fx, { label: 'The quiet envelope', because: `asked ${c.firstName} to report on her ${t.rel}`, category: 'event' });
      const line = `${c.firstName} said no, and told her ${t.rel}, ${displayName(t.on)}. He knows you asked.`;
      plog(P, s, line);
      ctx.log.push(line);
      journal(s, { t: `${displayName(c)} told her ${t.rel} you offered her an envelope`, x: `${displayName(t.on)} knows now.${rv ? ` So will the ${rv.shortName} family.` : ''}`, p: [c.id, t.on.id], src: 'payroll', c: rv ? 'rivals' : 'crew' });
      return;
    }
    case 'fire': {
      const P = s.payroll;
      const h = P?.hires[o.id];
      const c = s.characters[o.id];
      if (!P || !h || !c) return;
      fire(s, o.id);
      addOpinion(s, c.id, B, 'Let me go', h.knows >= 40 ? -10 : -4, 1);
      plog(P, s, `You let ${displayName(c)} go.`);
      return;
    }
    case 'raise': {
      if (raise(s, o.id, o.amount)) plog(s.payroll!, s, `${displayName(s.characters[o.id])}: ${o.amount > 0 ? 'a raise' : 'a cut'} (${fmtMoney(o.amount)}/wk).`);
      return;
    }
    case 'main': {
      const P = ensurePayroll(s);
      P.main = o.id;
      const c = s.characters[o.id];
      if (c) addOpinion(s, c.id, B, 'The boss counts on me', 6, 1);
      const h = P.hires[o.id];
      if (h) h.loyalty = clamp(h.loyalty + 6);
      const n = s.nightlife?.people[o.id];
      if (n) n.loyalty = clamp(n.loyalty + 6);
      return;
    }
    case 'star': {
      const c = starBody(s, o.ref);
      if (!c) return;
      const h = hire(s, c.id, 'celebrity', { wage: o.wage });
      if (h) { h.ref = o.ref; addOpinion(s, c.id, B, 'A friend of the family', 6, 1); ctx.log.push(`${displayName(c)} is a friend of the family now.`); }
      return;
    }
    case 'favor': {
      let c = o.id ? s.characters[o.id] : undefined;
      const r = roll(`${s.seed}|${s.week}|favorjob|${o.key}`);
      if (!c && o.name) {
        if (r >= o.chance) { ctx.log.push(`${o.name} took the favor and said no to the job. He owes you one.`); return; }
        const [first, ...rest] = o.name.split(' ');
        c = makeCharacter(s, { gender: o.f ? 'F' : 'M', firstName: first, lastName: rest.join(' ') || undefined, rank: 'civilian', faction: 'none', nickname: false, age: 30 + (hashSeed(o.key) % 25) });
        if (ageOn(c.birth, s.date) < ADULT) return;
      }
      if (!c) return;
      if (r < o.chance && !offerBlock(s, c) && !onAnyPayroll(s, c.id)) {
        hire(s, c.id, o.job, { fav: true });
        addOpinion(s, c.id, B, 'The boss came through; now I work for him', 6, 1);
        const line = `${displayName(c)} took the favor and the job: ${JOBS[o.job].label.toLowerCase()} (${Math.round(o.chance * 100)}% — yes).`;
        ctx.log.push(line);
        journal(s, { t: `${displayName(c)} works for you now: ${JOBS[o.job].label.toLowerCase()}`, x: 'The price of the favor.', p: [c.id], src: 'payroll', c: 'crew' });
      } else {
        // The favor stands; the marker is owed.
        applyEffects(ctx, [{ type: 'deed', op: { op: 'owe', by: c.id, to: B, y: 'Took the favor, not the job' } }], { label: 'A marker', because: `did ${c.firstName} a favor`, category: 'event' });
        const line = `${displayName(c)} took the favor and said no to the job (${Math.round(o.chance * 100)}% — no). ${c.gender === 'F' ? 'She' : 'He'} owes you a marker.`;
        ctx.log.push(line);
        journal(s, { t: `${displayName(c)} said no to the job, and owes you a marker`, p: [c.id], src: 'payroll', c: 'crew' });
      }
      return;
    }
    case 'protect': {
      const P = s.payroll;
      const h = P?.hires[o.id];
      const c = s.characters[o.id];
      if (!P || !h?.hush || !c) return;
      const on = s.characters[h.hush.on];
      if (o.how === 'deny') {
        const ok = roll(`${s.seed}|${s.week}|deny|${o.id}`) < (o.chance ?? 0.4);
        if (ok) {
          h.hush.found = undefined;
          h.hush.heat = Math.round(h.hush.heat / 3);
          h.loyalty = clamp(h.loyalty + 5);
          const line = `You denied it to ${on ? displayName(on) : 'him'}, and he believed you. ${c.firstName} keeps her envelope, for now.`;
          ctx.log.push(line);
          journal(s, { t: 'He believed the denial', x: line, p: [c.id, ...(on ? [on.id] : [])], src: 'payroll', c: 'intrigue' });
        } else {
          leave(s, P, h, 'Her husband found out; your denial did not hold');
          if (on) applyEffects(ctx, [{ type: 'opinion', from: on.id, to: s.playerId, amount: -10, reason: 'Lied to my face about my wife', decay: 1 }, ...(mobOf(s, on.faction) ? [{ type: 'rivalOpinion', rival: mobOf(s, on.faction)!.id, amount: -6, reason: 'Lied about one of our wives' } as Effect] : [])], { label: 'The denial', because: 'denied it', category: 'event' });
          const line = `${on ? displayName(on) : 'He'} did not believe you. ${c.firstName}'s envelope is over.`;
          ctx.log.push(line);
          journal(s, { t: 'The denial did not hold', x: line, p: [c.id, ...(on ? [on.id] : [])], src: 'payroll', c: 'intrigue' });
        }
        return;
      }
      leave(s, P, h, o.how === 'move' ? 'Moved out, under your protection' : 'Relocated out of town');
      addOpinion(s, c.id, s.playerId, o.how === 'move' ? 'He took care of me when it came out' : 'He got me out', 15, 1);
      if (on && c.spouseId === on.id) ensureRomance(s).separations.push({ a: c.id, b: on.id, week: s.week });
      const line = o.how === 'move' ? `${c.firstName} moved into a room at one of your places. Nobody bothers her there.` : `${c.firstName} took the train to her sister's, with money to start over.`;
      ctx.log.push(line);
      journal(s, { t: o.how === 'move' ? `You moved ${c.firstName} out` : `You relocated ${c.firstName}`, x: line, p: [c.id], src: 'payroll', c: 'intrigue' });
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The quiet envelope: what she brings                                 */
/* ------------------------------------------------------------------ */

function confOf(rel: number): Conf {
  return rel >= 70 ? 'confirmed' : rel >= 45 ? 'likely' : 'rumor';
}

/** How good her reports are, 0-100: her access, how close she is to him, her nerve. */
export function hushReliability(h: Hush): number {
  return clamp(h.access * 0.45 + h.close * 0.25 + h.nerve * 0.3);
}

function sideOf(s: GameState, on: Character): HushSide | undefined {
  return mobOf(s, on.faction) && on.rank !== 'civilian' ? 'rival' : on.faction === 'player' && on.rank !== 'civilian' ? 'crew' : isCop(on) ? 'cop' : isPol(s, on) ? 'pol' : undefined;
}

/**
 * One item of REAL intelligence from her man's side, read off the game's own
 * hidden state, revealed through the paths the game already has: a warning
 * (threats.ts Tip: the urgent meeting, the brief's Threats, its blunting), a
 * secret the house now knows (secrets), a plot now known (intrigue), dirt on
 * an official (City Hall's coerce), a rival's books (the war ledger).
 * `truth` decides whether she got it right; a false one is told as true.
 */
export function hushItem(s: GameState, h: Hire, key: string): HushItem | undefined {
  const H = h.hush;
  const her = s.characters[h.id];
  const on = H ? s.characters[H.on] : undefined;
  if (!H || !her || !on?.alive) return undefined;
  const side = sideOf(s, on);
  if (!side) return undefined;
  const rel = hushReliability(H);
  const r = roll(`${key}|truth`);
  const truth: TipTruth = r < rel / 100 ? 'solid' : r < rel / 100 + 0.15 ? 'garbled' : 'false';
  const conf = confOf(rel);
  const P = ensurePayroll(s);
  const id = `hi${++P.n}`;
  const src = { id: her.id, kind: (side === 'cop' ? 'cop' : side === 'pol' ? 'official' : 'ear') as 'cop' | 'official' | 'ear', name: displayName(her), role: 'A wife on the quiet payroll' };
  const mk = (kind: HushItem['kind'], text: string, extra: Partial<HushItem> = {}): HushItem => ({ id, week: s.week, from: her.id, on: on.id, kind, text, conf, truth, ...extra });
  const T = s.threats ? ensureThreats(s) : undefined;
  const rv = mobOf(s, on.faction);
  const open = (t: Threat) => t.due >= s.week && !t.live;
  // 1. A move in motion (the plan, the raid): the real threat, told to you as a warning.
  const plans = (T?.threats ?? []).filter((t) => open(t) && (side === 'rival' ? t.by === on.faction : side === 'cop' ? isPoliceKind(t.kind) : side === 'pol' ? t.by === 'police' : false));
  const tries: (() => HushItem | undefined)[] = [];
  if (plans.length && truth !== 'false') tries.push(() => {
    const t = plans[hashSeed(`${key}|plan`) % plans.length];
    const tip = tipFromOutside(s, t.id, { kind: t.kind, by: t.by, targetId: t.targetId, bizId: t.bizId, district: t.district }, src, truth, t.due);
    if (!tip) return undefined;
    return mk(side === 'cop' ? 'raid' : 'plan', `${KIND_LABEL[tip.kind]}: ${tip.detail}`, { tip: tip.id });
  });
  if (side === 'rival' && rv && truth === 'false') tries.push(() => {
    // Fed a lie (or she heard it wrong): a warning with nothing behind it.
    const ours = s.businesses.filter((b) => b.owner === 'player');
    const b = ours.length ? ours[hashSeed(`${key}|lie`) % ours.length] : undefined;
    const tip = tipFromOutside(s, undefined, { kind: b ? 'racket' : 'move', by: rv.id, bizId: b?.id, district: b?.districtId ?? s.districts[0]?.id }, src, 'false', s.week + 2);
    return tip ? mk('plan', `${KIND_LABEL[tip.kind]}: ${tip.detail}`, { tip: tip.id }) : undefined;
  });
  // 2. A rival's books and its war chest (real numbers, a little off when she got it wrong).
  const lately = (k: HushItem['kind']) => (s.payroll?.intel ?? []).some((x) => x.on === on.id && x.kind === k && s.week - x.week < 6);
  if (side === 'rival' && rv && !lately('books') && !lately('war')) tries.push(() => {
    const f = truth === 'solid' ? 1 : truth === 'garbled' ? 1.35 : 0.6;
    const text = `The ${rv.shortName} family has about ${fmtMoney(Math.round(rv.money * f / 500) * 500)} put away and ${Math.round(rv.muscle * f)} on the muscle scale${rv.war ? '; they are counting on outlasting you' : ''}.`;
    return mk(rv.war || rv.feud ? 'war' : 'books', text);
  });
  // 3. A plot he is in (the intrigue layer): known now.
  const plot = (s.intrigue?.plots ?? []).find((p) => !p.ended && !p.known && (p.actorId === on.id || p.targetId === s.playerId && p.faction === on.faction));
  if (plot && truth !== 'false') tries.push(() => {
    if (truth === 'solid') plot.known = true;
    return mk('plot', `${displayName(on)} is in on something: ${plot.kind}${plot.targetId && s.characters[plot.targetId] ? ` against ${displayName(s.characters[plot.targetId])}` : ''}.`);
  });
  // 4. One of yours: his grievance, his skim.
  if (side === 'crew') {
    const op = opinion(s, on.id, s.playerId);
    if (op < 0 || truth === 'false') tries.push(() => mk('grievance', truth === 'false' ? `${on.firstName} says nothing bad about you at home. Not one word.` : `${on.firstName} complains about you at the dinner table (what he thinks of you: ${truth === 'garbled' ? op - 10 : op}).`));
    if ((on.skimmed ?? 0) > 0 && truth === 'solid') tries.push(() => {
      const sec = addSecret(s, on, 'skimming');
      if (!sec.knownBy.includes('player')) sec.knownBy.push('player');
      return mk('secret', `${on.firstName} has been holding back: about ${fmtMoney(on.skimmed ?? 0)} that never reached the envelope.`, { secret: sec.id });
    });
  }
  // 5. Who talks to the law: rarely, and never the whole of it.
  if (isInformant(s, on.id) && roll(`${key}|rat`) < 0.25) tries.push(() => {
    if (truth === 'solid' && rel >= 70) {
      const sec = addSecret(s, on, 'informant');
      if (!sec.knownBy.includes('player')) sec.knownBy.push('player');
      return mk('informant', `${on.firstName} meets two men in a car behind the church on Sundays. She thinks they are federal.`, { secret: sec.id, conf: 'likely' });
    }
    return mk('informant', `${on.firstName} has been taking calls he will not take in the house.`, { conf: 'rumor' });
  });
  // 6. City Hall: his vote, and the dirt that buys it.
  const pp = polOf(s, on.id);
  const ctl = pp ? s.pol?.ctl[pp.id] : undefined;
  if (side === 'pol' && pp && ctl && !ctl.dirt && truth !== 'false') tries.push(() => {
    if (truth === 'solid') ctl.dirt = 'his wife says where the campaign money really went';
    return mk('vote', `${on.firstName} will vote the way the money goes; she says where his campaign money really went${truth === 'solid' ? ' (dirt you can use at City Hall)' : ''}.`);
  });
  // 7. A secret of his (or of his side's men) the house did not know.
  const hidden = s.secrets.filter((x) => !x.knownBy.includes('player') && x.kind !== 'plot' && (x.ownerId === on.id || (rv && s.characters[x.ownerId]?.faction === rv.id)) && s.characters[x.ownerId]?.alive);
  if (hidden.length && truth === 'solid') tries.push(() => {
    const sec = hidden[hashSeed(`${key}|sec`) % hidden.length];
    sec.knownBy.push('player');
    return mk('secret', `${sec.text}.`, { secret: sec.id });
  });
  if (!tries.length) return undefined;
  const start = hashSeed(`${key}|pick`) % tries.length;
  for (let i = 0; i < tries.length; i++) {
    const it = tries[(start + i) % tries.length]();
    if (it) return it;
  }
  return undefined;
}

function hushWeek(ctx: Ctx, P: PayrollState, h: Hire): void {
  const s = ctx.s;
  const H = h.hush!;
  const her = s.characters[h.id];
  const on = s.characters[H.on];
  if (!her || H.found !== undefined) return;
  if (!on?.alive) { leave(s, P, h, `Her ${H.rel} is gone; she has nothing more to tell`); return; }
  const key = `${s.seed}|${s.week}|hush|${h.id}`;
  if (roll(`${key}|item`) < 0.35 + H.access / 250) {
    const it = hushItem(s, h, key);
    if (it) {
      P.intel.push(it);
      if (P.intel.length > 30) P.intel.splice(0, P.intel.length - 30);
      P.stats.items++;
      h.made++;
      const line = `A quiet envelope (${it.conf}): ${it.text}`;
      ctx.log.push(line);
      journal(s, { t: `From a wife on the quiet payroll: ${it.text}`, x: `${displayName(her)} on her ${H.rel}, ${displayName(on)}. ${it.conf[0].toUpperCase()}${it.conf.slice(1)}.`, p: [her.id, on.id], src: 'payroll', c: 'intrigue', ln: 'borgata.chart' });
    }
  }
  // The suspicion at home builds, slowly; the chance he finds out grows with it.
  H.heat = clamp(H.heat + 2 + (100 - H.nerve) / 50 + (H.close > 60 ? 1 : 0));
  if (roll(`${key}|found`) >= Math.min(0.25, 0.01 + H.heat / 600)) return;
  H.found = s.week;
  P.stats.found++;
  const side = sideOf(s, on);
  const rv = mobOf(s, on.faction);
  const fx: Effect[] = [{ type: 'opinion', from: on.id, to: s.playerId, amount: -20, reason: 'Paid my wife to spy on me', decay: 1 }];
  if (rv) fx.push({ type: 'rivalOpinion', rival: rv.id, amount: -10, reason: 'Had one of our wives on his payroll' });
  if (side === 'crew') fx.push({ type: 'meter', from: on.id, to: s.playerId, meter: 'grievance', amount: 20 });
  if (side === 'cop' || side === 'pol') fx.push({ type: 'heat', bar: 'local', amount: 2 });
  addOpinion(s, on.id, her.id, 'Went behind my back', -30, 1);
  // Offstage: she was hurt, or he walked out. Never shown.
  const rough = hasTrait(on, 'Cruel') || hasTrait(on, 'Hot-headed');
  const what = rough && roll(`${key}|rough`) < 0.5 ? 'hurt' : 'left';
  if (what === 'hurt') her.health = Math.max(20, her.health - 15);
  applyEffects(ctx, fx, { label: `${displayName(on)} found out`, because: 'had his wife on the quiet payroll', category: 'event' });
  const line = `${displayName(on)} found out about ${her.firstName}'s envelope.${rv ? ` He went to his people: the ${rv.shortName} family knows.` : ''} ${what === 'hurt' ? 'She was hurt. She will not say how.' : 'He walked out of the house.'}`;
  ctx.log.push(line);
  journal(s, { t: `${displayName(on)} found out about ${her.firstName}`, x: line, p: [her.id, on.id], src: 'payroll', c: rv ? 'rivals' : 'intrigue' });
  s.eventQueue.push(hushFoundEvent(s, h));
}

/** Her husband found out: the boss's answer, with the odds on the denial. */
export function denyOdds(s: GameState, h: Hire): number {
  const H = h.hush!;
  const trust = opinion(s, H.on, s.playerId);
  return Math.max(0.1, Math.min(0.75, 0.3 + H.nerve / 250 + trust / 300 - H.heat / 400));
}

export function hushFoundEvent(s: GameState, h: Hire): EventInstance {
  const her = s.characters[h.id];
  const on = s.characters[h.hush!.on];
  const nm = her.firstName;
  const p = denyOdds(s, h);
  const L = `${nm}: he found out`;
  return {
    iid: `ev${s.nextId++}`, defId: 'payroll_found', week: s.week, mandatory: true, priority: 70,
    title: `${on ? displayName(on) : 'Her husband'} found out about ${nm}`,
    text: `${displayName(her)} gets word to you: ${on?.firstName ?? 'he'} knows about the envelope. What do you do for her?`,
    choices: [
      { id: 'move', label: 'Move her out ($1,500)', detail: 'A room at one of your places, your people on the door. The envelope ends; she is safe.', because: `moved ${nm} out`, effects: [{ type: 'money', amount: -1500, label: L }, PX({ op: 'protect', id: h.id, how: 'move' }, L)] },
      { id: 'relocate', label: 'Pay to relocate her ($3,000)', detail: 'A train out of town and money to start over. The envelope ends.', because: `relocated ${nm}`, effects: [{ type: 'money', amount: -3000, label: L }, PX({ op: 'protect', id: h.id, how: 'relocate' }, L)] },
      { id: 'deny', label: `Deny it to his face (${Math.round(p * 100)}% he believes you)`, detail: 'If he believes you, she keeps the envelope. If not, it is over and he hates you for the lie.', because: `denied it to ${on?.firstName ?? 'him'}`, effects: [PX({ op: 'protect', id: h.id, how: 'deny', chance: p }, L)] },
    ],
    defaultChoiceId: 'deny',
    meta: { charId: h.id },
    actors: [h.id, ...(on ? [on.id] : [])],
  };
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

export function payrollWeek(ctx: Ctx): void {
  const s = ctx.s;
  const P = s.payroll;
  if (!P || s.gameOver) return;
  const boss = player(s);
  const season = isInSeason(s.date) ? 1 : 0.7;
  const cover: Record<'local' | 'federal', number> = { local: 0, federal: 0 };
  let votes = 0;
  for (const h of Object.values(P.hires).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const c = s.characters[h.id];
    const j = JOBS[h.job];
    const key = `${s.seed}|${s.week}|pay|${h.id}`;
    if (!c?.alive) { leave(s, P, h, 'Died'); continue; }
    if (!adult(s, c)) { leave(s, P, h, 'Not of age'); continue; }
    if (!isFree(s, c)) continue;
    const nm = displayName(c);
    // The envelope.
    if (h.wage > 0) {
      if (s.money >= h.wage) {
        money(ctx, -h.wage, `Payroll: ${nm} (${j.label.toLowerCase()})`, 'cost');
        c.wealth += h.wage;
        h.paid += h.wage;
        P.stats.wages += h.wage;
        h.unpaid = 0;
      } else {
        h.unpaid++;
        h.loyalty = clamp(h.loyalty - 8);
        ctx.log.push(`${nm}'s envelope did not come this week (${h.unpaid} in a row).`);
      }
    }
    // What they bring in.
    const main = P.main === h.id;
    if (j.money && h.unpaid === 0) {
      const amt = Math.round(j.money * season * (0.85 + roll(`${key}|y`) * 0.3) * (main ? 1.2 : 1) * (0.6 + h.loyalty / 250));
      if (amt > 0) {
        money(ctx, amt, `${nm}'s end (${j.label.toLowerCase()})${main ? ', your main earner' : ''}`, 'business');
        h.made += amt;
        P.stats.yield += amt;
      }
    }
    if (h.unpaid === 0) { cover[j.coverBar ?? 'local'] += j.cover; votes += j.votes; }
    // A friend of the family: the draw at your club, the respect of being seen together, and the papers.
    if (h.job === 'celebrity' && h.unpaid === 0) {
      const club = s.businesses.find((b) => b.owner === 'player' && CLUB_KINDS.includes(b.kind));
      if (club && isInSeason(s.date)) {
        const draw = Math.round((60 + (polOf(s, c.id)?.fame ?? 40)) * (0.85 + roll(`${key}|draw`) * 0.3));
        money(ctx, draw, `${nm} drew a crowd at ${club.name}`, 'business');
        h.made += draw;
        P.stats.yield += draw;
      }
      if (s.week % 4 === 0) {
        respect(ctx, j.respect ?? 1, `Seen with ${nm}`, 'event');
        if (roll(`${key}|press`) < (j.press ?? 0)) heat(ctx, 'federal', 1, `The papers ran a picture of ${nm} with you`, 'heat');
      }
    }
    // Loyalty and what they know.
    if (h.unpaid === 0 && (h.squeezed === undefined || s.week - h.squeezed > 12) && s.week % 4 === 0) h.loyalty = clamp(h.loyalty + 1 + (main ? 1 : 0));
    if (h.squeezed !== undefined && s.week - h.squeezed <= 12 && s.week % 4 === 0) h.loyalty = clamp(h.loyalty - 2);
    h.knows = clamp(h.knows + (['cop', 'bookkeeper', 'driver', 'politician'].includes(h.job) ? 1.5 : 0.7));
    if (h.hush) { hushWeek(ctx, P, h); if (!P.hires[h.id]) continue; }
    // The unpaid and the squeezed turn.
    if ((h.unpaid >= 3 || h.loyalty < 15) && roll(`${key}|quit`) < 0.35) {
      const rivals = s.rivals.filter((r) => r.kind === 'mob');
      if (h.knows >= 40 && h.loyalty < 15 && rivals.length && !h.hush) {
        const rv = rivals[hashSeed(key) % rivals.length];
        c.informantFor = rv.id;
        leave(s, P, h, `Turned: talks to the ${rv.shortName} family now`);
        P.stats.quit++;
        const line = `${nm} quit your payroll sore, and took what he knows to the ${rv.shortName} family.`;
        ctx.log.push(line);
        journal(s, { t: `${nm} turned`, x: line, p: [c.id], src: 'payroll', c: 'rivals' });
      } else {
        leave(s, P, h, h.unpaid >= 3 ? 'Quit: the envelope stopped coming' : 'Quit: how he was treated');
        P.stats.quit++;
        addOpinion(s, c.id, s.playerId, h.unpaid >= 3 ? 'Stopped paying me' : 'Treated me like nothing', -10, 1);
        const line = `${nm} quit your payroll (${h.unpaid >= 3 ? 'the envelope stopped coming' : 'how he was treated'}).`;
        ctx.log.push(line);
        journal(s, { t: line, p: [c.id], src: 'payroll', c: 'crew' });
      }
      continue;
    }
    // A cop taking it can be caught.
    if (h.job === 'cop' && roll(`${key}|caught`) < 0.006 + s.heat.local / 4000 + h.knows / 8000) {
      leave(s, P, h, 'Caught taking it; off the force');
      P.stats.caught++;
      c.office = c.office ? `Former ${c.office.toLowerCase()}` : 'Former patrolman';
      heat(ctx, 'local', 4, `${nm} was caught taking an envelope`, 'heat');
      const flips = h.loyalty < 45 && roll(`${key}|copflip`) < 0.5;
      if (flips) { c.informantFor = 'law'; addFedEvidence(s, s.playerId, 4, `a cop on the pad talked: ${nm}`); P.stats.flipped++; }
      const line = `${nm} was caught taking an envelope and is off the force.${flips ? ' He is talking to keep his pension.' : ' He kept his mouth shut.'}`;
      ctx.log.push(line);
      journal(s, { t: `${nm} was caught on the pad`, x: line, p: [c.id], src: 'payroll', c: 'law' });
      continue;
    }
    // A civilian who knows too much can be pinched, and flip.
    if (h.knows >= 50 && !h.hush && roll(`${key}|pinch`) < 0.003 + s.heat.local / 6000 + s.heat.federal / 5000) {
      c.imprisonedUntil = s.week + 4 + (hashSeed(key) % 8);
      const flips = h.loyalty < 50 && roll(`${key}|flip`) < 0.6 - h.loyalty / 200;
      if (flips) {
        c.informantFor = 'law';
        addFedEvidence(s, s.playerId, 3 + Math.round(h.knows / 25), `a civilian on the payroll talked: ${nm}`);
        leave(s, P, h, 'Pinched, and talked');
        P.stats.flipped++;
      } else h.loyalty = clamp(h.loyalty + 5);
      const line = `${nm} was pinched. ${flips ? 'He knew too much, and he is talking.' : 'He stood up and said nothing.'}`;
      ctx.log.push(line);
      journal(s, { t: `${nm} was pinched`, x: line, p: [c.id], src: 'payroll', c: 'law' });
    }
  }
  // Cover: an alibi, a car moved, the clean books (monthly, a few points).
  if (s.week % 4 === 0) {
    for (const bar of ['local', 'federal'] as const) if (cover[bar] > 0) heat(ctx, bar, -Math.min(3, cover[bar]), 'Your people on the payroll covered for you', 'event');
  }
  // Votes at the ward meeting: a favor at City Hall now and then.
  if (votes > 0 && s.week % 8 === 0) s.favors += Math.min(2, votes);
  // The main earner from another payroll: they know they are counted on.
  if (P.main && !P.hires[P.main]) {
    const n = s.nightlife?.people[P.main];
    if (n?.payroll && s.week % 4 === 0) n.loyalty = clamp(n.loyalty + 1);
    if (!onAnyPayroll(s, P.main) || !s.characters[P.main]?.alive) P.main = undefined;
  }
  void boss;
}

/* ------------------------------------------------------------------ */
/* One view of every payroll                                           */
/* ------------------------------------------------------------------ */

export type PaySource = 'payroll' | 'night' | 'house' | 'pol' | 'job' | 'outside';

export interface PayRow {
  id: string;
  /** The character, when it is one (City Hall's people may not be). */
  charId?: string;
  name: string;
  job: PayJob;
  /** "Barber", or the other system's own words ("Call girl", "Zoning board member"). */
  title: string;
  source: PaySource;
  wage: number;
  /** What they bring, in words, and last week's money from them. */
  yields: string;
  money: number;
  loyalty: number;
  /** 0-100. */
  risk: number;
  main: boolean;
  /** The order to let them go, wherever their payroll lives. */
  fire?: PlayerAction;
  raise?: PlayerAction;
  cut?: PlayerAction;
  makeMain?: PlayerAction;
  note?: string;
  hush?: { on: string; rel: string; rel100: number; heat: number; found?: boolean };
}

const PA = (op: PayrollAction): PlayerAction => ({ kind: 'payroll', op });

/** Everyone on any payroll of the boss's, read where each one lives (no copies). Mature content Off hides the adult work. */
export function payrollRoster(s: GameState): PayRow[] {
  const out: PayRow[] = [];
  const P = s.payroll;
  const main = P?.main;
  const mature = adultOn(s);
  for (const h of Object.values(P?.hires ?? {})) {
    const c = s.characters[h.id];
    if (!c?.alive) continue;
    const j = JOBS[h.job];
    const on = h.hush ? s.characters[h.hush.on] : undefined;
    out.push({
      id: h.id, charId: h.id, name: displayName(c), job: h.job, title: j.label, source: 'payroll', wage: h.wage, yields: yieldText(h.job, h.wage), money: Math.round(j.money * (isInSeason(s.date) ? 1 : 0.7)),
      loyalty: h.loyalty, risk: clamp(j.risk + h.knows / 3 + (h.hush ? h.hush.heat / 2 : 0) + (h.unpaid ? 20 : 0)), main: main === h.id,
      fire: PA({ op: 'fire', id: h.id }), raise: PA({ op: 'raise', id: h.id, amount: 10 }), cut: PA({ op: 'raise', id: h.id, amount: -10 }), makeMain: PA({ op: 'main', id: h.id }),
      note: h.unpaid ? `Unpaid ${h.unpaid} week${h.unpaid === 1 ? '' : 's'}` : h.squeezed !== undefined && s.week - h.squeezed <= 12 ? 'Squeezed: remembers it' : h.fav ? 'Came on for a favor' : undefined,
      ...(h.hush && on ? { hush: { on: displayName(on), rel: h.hush.rel, rel100: hushReliability(h.hush), heat: h.hush.heat, found: h.hush.found !== undefined } } : {}),
    });
  }
  const N = s.nightlife;
  for (const p of Object.values(N?.people ?? {})) {
    const c = s.characters[p.id];
    if (!p.payroll || p.status !== 'active' || !c?.alive || ageOn(c.birth, s.date) < ADULT) continue;
    const adultRole = ADULT_ROLES.includes(p.role);
    if (adultRole && !mature) continue;
    const k = Math.round(p.earn * kickbackRate(p.earn));
    out.push({
      id: p.id, charId: p.id, name: displayName(c), job: adultRole ? 'girl' : p.role === 'dancer' ? 'dancer' : 'celebrity', title: ROLE_LABEL[p.role], source: 'night', wage: 0,
      yields: `kicks back ${Math.round(kickbackRate(p.earn) * 100)}% (~${fmtMoney(k)} last week); she keeps the rest`, money: k, loyalty: p.loyalty, risk: clamp(p.role === 'street' ? 45 : 25 + (100 - p.discretion) / 4),
      main: main === p.id, fire: { kind: 'nightlife', op: { op: 'release', id: p.id } }, makeMain: PA({ op: 'main', id: p.id }), note: 'She can quit any time',
    });
  }
  for (const h of Object.values(N?.houses ?? {})) {
    const c = s.characters[h.id];
    if (!c?.alive || h.with !== 'player' || h.deal === 'none' || h.ears || !mature) continue;
    const pay = protectionOf(h);
    out.push({
      id: h.id, charId: h.id, name: displayName(c), job: 'madam', title: `Madam · ${h.name}`, source: 'house', wage: 0, yields: `${h.deal === 'partner' ? 'partners with you' : 'pays for protection'}: ~${fmtMoney(pay)} last week`, money: pay,
      loyalty: clamp(50 + opinion(s, c.id, s.playerId) / 2), risk: clamp(h.heat + (h.squeeze ? 25 : 0)), main: main === h.id,
      fire: { kind: 'nightlife', op: { op: 'deal', house: h.id, deal: 'none' } }, makeMain: PA({ op: 'main', id: h.id }), note: h.squeeze ? 'A rival family is squeezing her house' : undefined,
    });
  }
  for (const [id, ctl] of Object.entries(s.pol?.ctl ?? {})) {
    const p = s.pol?.people[id];
    if (!ctl.payroll || !p?.alive || p.retired) continue;
    const law = /_pd|police|sheriff|prosecutor|fbi|federal|attorney/.test(p.inst);
    out.push({
      id: `pol:${id}`, charId: p.charId && s.characters[p.charId] ? p.charId : undefined, name: `${p.first} ${p.last}`, job: law ? 'cop' : 'politician', title: p.title, source: 'pol', wage: ctl.payroll,
      yields: law ? 'favors, a word before the county moves' : 'favors, his vote', money: 0, loyalty: clamp((ctl.financial + ctl.personal) / 2 - ctl.resentment + 30), risk: clamp(ctl.exposure),
      main: main === `pol:${id}` || (!!p.charId && main === p.charId), fire: { kind: 'pol', op: { op: 'payroll', id, on: false } }, note: ctl.owner ? 'Somebody else owns a piece of him' : undefined,
    });
  }
  for (const [id, salary] of Object.entries(s.econ?.jobs ?? {})) {
    const c = s.characters[id];
    if (!c?.alive || out.some((r) => r.charId === id)) continue;
    out.push({ id, charId: id, name: displayName(c), job: 'clerk', title: 'A no-show job', source: 'job', wage: salary, yields: 'goodwill; it really is no-show', money: 0, loyalty: clamp(50 + opinion(s, id, s.playerId) / 2), risk: 5, main: main === id, makeMain: PA({ op: 'main', id }) });
  }
  for (const c of Object.values(s.characters)) {
    if (!c.alive || !c.outside || c.faction !== 'none' || out.some((r) => r.charId === c.id)) continue;
    const job: PayJob = c.outside === 'bookie' ? 'bookie' : c.outside === 'runner' ? 'runner' : c.outside === 'fence' ? 'fence' : c.outside === 'cop' ? 'cop' : 'politician';
    const k = c.capoId ? s.characters[c.capoId] : undefined;
    out.push({
      id: c.id, charId: c.id, name: displayName(c), job, title: `${JOBS[job].label}${k ? ` · works with ${k.firstName}'s crew` : ''}`, source: 'outside', wage: 0,
      yields: c.outside === 'cop' || c.outside === 'politician' ? 'on the pad through his capo' : 'works through his capo\'s crew', money: c.lastEarn ?? 0,
      loyalty: clamp(50 + opinion(s, c.id, s.playerId) / 2), risk: clamp(JOBS[job].risk + (c.evidence ?? 0) / 2), main: main === c.id, makeMain: PA({ op: 'main', id: c.id }),
    });
  }
  const order = (j: PayJob) => JOB_ORDER.indexOf(j);
  return out.sort((a, b) => order(a.job) - order(b.job) || Number(b.main) - Number(a.main) || a.name.localeCompare(b.name));
}

/** The roster grouped by job, in the crew screen's order (the quiet envelopes first, as "Quiet envelopes"). */
export function payrollGroups(s: GameState): { job: PayJob; label: string; rows: PayRow[] }[] {
  const rows = payrollRoster(s);
  const out: { job: PayJob; label: string; rows: PayRow[] }[] = [];
  for (const j of JOB_ORDER) {
    const r = rows.filter((x) => x.job === j);
    if (r.length) out.push({ job: j, label: JOBS[j].group, rows: r });
  }
  return out;
}

export function payrollTotals(s: GameState): { people: number; wages: number; money: number; main?: string } {
  const rows = payrollRoster(s);
  const m = rows.find((r) => r.main);
  return { people: rows.length, wages: rows.reduce((a, r) => a + r.wage, 0), money: rows.reduce((a, r) => a + r.money, 0), main: m?.name };
}

/** What the quiet envelopes brought lately (newest first), for the crew screen and the brief. */
export function recentIntel(s: GameState, weeks = 4): HushItem[] {
  return (s.payroll?.intel ?? []).filter((x) => s.week - x.week < weeks).slice().reverse();
}

/* ------------------------------------------------------------------ */
/* The social circle                                                   */
/* ------------------------------------------------------------------ */

export type RingId = 'blood' | 'made' | 'associates' | 'payroll' | 'friends' | 'acquaintances';
export const RING_LABEL: Record<RingId, string> = {
  blood: 'Blood family', made: 'The Family (made men)', associates: 'Associates', payroll: 'Civilians on the payroll', friends: 'Friends & favors', acquaintances: 'Acquaintances',
};
const RING_WEIGHT: Record<RingId, number> = { blood: 3, made: 4, associates: 2.5, payroll: 2, friends: 1.5, acquaintances: 0.5 };

export interface Ring { id: RingId; label: string; count: number; ids: string[] }

/** How deep the boss's circle goes: the rings, a count each, and a depth score (0-100). */
export function socialCircle(s: GameState): { rings: Ring[]; total: number; depth: number; word: string } {
  const B = s.playerId;
  const used = new Set<string>([B]);
  const take = (id: RingId, ids: string[]): Ring => {
    const list = [...new Set(ids)].filter((x) => !used.has(x) && s.characters[x]?.alive);
    for (const x of list) used.add(x);
    return { id, label: RING_LABEL[id], count: list.length, ids: list };
  };
  const all = Object.values(s.characters).filter((c) => c.alive);
  const blood = take('blood', all.filter((c) => c.dynasty || player(s)?.spouseId === c.id).map((c) => c.id));
  const made = take('made', all.filter((c) => c.faction === 'player' && ['boss', 'underboss', 'consigliere', 'capo', 'soldier'].includes(c.rank)).map((c) => c.id));
  const assoc = take('associates', all.filter((c) => (c.faction === 'player' && c.rank === 'associate') || (c.outside && c.faction === 'none')).map((c) => c.id));
  const pay = take('payroll', payrollRoster(s).map((r) => r.charId).filter((x): x is string => !!x));
  const owed = (s.deeds?.owed ?? []).flatMap((o) => (o.to === B ? [o.by] : o.by === B ? [o.to] : []));
  const ties = Object.entries(s.deeds?.ties ?? {}).filter(([k, t]) => k.split('|').includes(B) && (t.k === 'friend' || t.k === 'ally')).flatMap(([k]) => k.split('|').filter((x) => x !== B));
  const warm = all.filter((c) => c.faction !== 'player' && opinion(s, c.id, B) >= 30).map((c) => c.id);
  const friends = take('friends', [...owed, ...ties, ...warm]);
  const met = new Set<string>();
  for (const e of (s.journal?.e ?? []).slice(-300)) if (e.mine) for (const id of e.p ?? []) met.add(id);
  for (const p of Object.values(s.nightlife?.people ?? {})) if (p.met && (adultOn(s) || !ADULT_ROLES.includes(p.role))) met.add(p.id);
  const acq = take('acquaintances', [...met]);
  const rings = [blood, made, assoc, pay, friends, acq];
  const total = rings.reduce((a, r) => a + r.count, 0);
  const raw = rings.reduce((a, r) => a + Math.sqrt(r.count) * RING_WEIGHT[r.id], 0);
  const depth = clamp(100 * (1 - Math.exp(-raw / 55)));
  const word = depth >= 75 ? 'The whole island owes you something' : depth >= 55 ? 'Deep: you hear things before the papers' : depth >= 35 ? 'Solid: people pick up when you call' : depth >= 15 ? 'Thin: a few people outside the Family' : 'Shallow: nobody outside the Family';
  return { rings, total, depth, word };
}

/* ------------------------------------------------------------------ */
/* The night people: working girls, dancers, celebrities, madams       */
/* ------------------------------------------------------------------ */

export interface Star { name: string; sex: 'M' | 'F'; born: number; age: number; eth: Character['ethnicity']; title: string; fame: number }

/** A star by world record ('pol:<id>' a world-pack entertainer, 'lin:<id>' a showbiz house's person). */
export function starOf(s: GameState, ref: string): Star | undefined {
  if (ref.startsWith('pol:')) {
    const p = getPerson(s, ref.slice(4));
    if (!p?.alive) return undefined;
    return { name: `${p.first} ${p.last}`, sex: p.sex, born: p.born, age: s.date.y - p.born, eth: p.eth, title: p.title, fame: p.fame ?? 30 };
  }
  if (ref.startsWith('lin:')) {
    const p = s.lineage?.people[ref.slice(4)];
    if (!p || p.dy) return undefined;
    const h = p.house ? s.lineage?.houses[p.house] : undefined;
    return { name: `${p.first} ${p.last}`, sex: p.g, born: p.by, age: s.date.y - p.by, eth: p.eth, title: p.titles?.[0] ?? (h ? `of the ${h.name} family of show business` : 'In show business'), fame: 50 };
  }
  return undefined;
}

/** The star's engine body (made the first time the boss puts them on a retainer). */
function starBody(s: GameState, ref: string): Character | undefined {
  const st = starOf(s, ref);
  if (!st || st.age < ADULT) return undefined;
  const pid = ref.slice(4);
  if (ref.startsWith('pol:')) { const cid = getPerson(s, pid)?.charId; if (cid && s.characters[cid]?.alive) return s.characters[cid]; }
  if (ref.startsWith('lin:') && s.characters[pid]?.alive) return s.characters[pid];
  const done = Object.values(s.payroll?.hires ?? {}).find((h) => h.ref === ref);
  if (done && s.characters[done.id]?.alive) return s.characters[done.id];
  const h = hashSeed(ref);
  const c: Character = {
    id: `c${s.nextId++}`, firstName: st.name.split(' ')[0], lastName: st.name.split(' ').slice(1).join(' ') || st.name, gender: st.sex, ethnicity: st.eth,
    birth: { y: st.born, m: 1 + (h % 12), d: 1 + ((h >> 4) % 28) }, health: 90, conditions: [],
    attributes: { leadership: 8, business: 9, diplomacy: 14, intrigue: 9, force: 4, discipline: 10 }, traits: ['Ambitious'],
    ambition: 'Top billing, and to stay there', rank: 'civilian', faction: 'none', wealth: 6000 + st.fame * 200, dynasty: false, childrenIds: [], alive: true, office: st.title,
  };
  s.characters[c.id] = c;
  if (ref.startsWith('pol:') && s.pol?.people[pid]) mutP(s, pid)!.charId = c.id;
  return c;
}

export type NightKind = 'girl' | 'dancer' | 'celebrity' | 'madam';
export const NIGHT_KIND_LABEL: Record<NightKind, string> = { girl: 'Working girls', dancer: 'Dancers', celebrity: 'Celebrities', madam: 'Madams & houses' };

export interface NightRow {
  /** The character id, or 'pol:<id>' / 'lin:<id>' for a star without an engine body yet. */
  id: string;
  charId?: string;
  kind: NightKind;
  name: string;
  /** Where she works or he plays. */
  where: string;
  house?: string;
  /** 'player' (yours: your payroll or a house you protect), a rival family's id, or 'self' (her own). */
  employer: string;
  employerName: string;
  onPayroll: boolean;
  earns: string;
  /** The offer (her decision), when there is one to make. */
  action?: PlayerAction;
  note?: string;
}

const NIGHT_KIND_OF: Partial<Record<string, NightKind>> = { escort: 'girl', callgirl: 'girl', street: 'girl', dancer: 'dancer', singer: 'celebrity', madam: 'madam' };

/**
 * Everyone of the night the boss can find: the working girls, the dancers at
 * the clubs, the celebrities playing them this season (the world pack's
 * entertainers, the showbiz houses, the singers of the clubs), the madams and
 * their houses. Adults only. Mature content Off hides the girls, the dancers
 * and the madams; celebrities always show. The honey trap and the payroll
 * read this one list.
 */
export function nightPeople(s: GameState, kind?: NightKind): NightRow[] {
  const out: NightRow[] = [];
  const mature = adultOn(s);
  const N = s.nightlife;
  const fam = (f: FactionId) => s.rivals.find((r) => r.id === f)?.shortName;
  for (const p of Object.values(N?.people ?? {})) {
    const c = s.characters[p.id];
    const k = NIGHT_KIND_OF[p.role];
    if (!k || p.status !== 'active' || !c?.alive || !adult(s, c)) continue;
    if (k !== 'celebrity' && !mature) continue;
    if (kind && k !== kind) continue;
    const h = p.house ? N?.houses[p.house] : k === 'madam' ? N?.houses[p.id] : undefined;
    const mine = !!p.payroll || (k === 'madam' && !!h && h.with === 'player' && h.deal !== 'none');
    const rival = !mine && p.side !== 'player' && p.side !== 'none' ? p.side : undefined;
    const prot = !mine && !rival && h?.with === 'player';
    const employer = mine || prot ? 'player' : rival ?? 'self';
    const employerName = mine ? (k === 'madam' ? `Her house pays you (${h?.deal === 'partner' ? 'partners' : 'protection'})` : 'On your payroll') : rival ? `The ${fam(rival) ?? 'other'} family` : prot ? 'Works a house you protect' : 'Her own';
    const earns = k === 'madam' ? `her house took ~${fmtMoney(h?.take ?? 0)} last week` : p.earn ? `~${fmtMoney(p.earn)} last week` : p.price ? `${fmtMoney(p.price)} an evening` : 'between bookings';
    const action: PlayerAction | undefined = mine || s.payroll?.hires[p.id] ? undefined : k === 'madam' ? (h ? hireAction(s, h.id, 'madam') : undefined) : hireAction(s, p.id, k === 'celebrity' ? 'celebrity' : k);
    out.push({
      id: p.id, charId: p.id, kind: k, name: displayName(c), where: h ? `${h.name}${k === 'madam' ? ` · ${h.front}` : ''}` : p.venue, house: h?.name,
      employer, employerName, onPayroll: mine, earns, action, note: N?.goomars[p.id] && !N.goomars[p.id].ended ? 'Your goomar' : p.bounds.includes('no_payroll') ? 'Works for herself, on nobody\'s payroll' : undefined,
    });
  }
  if (!kind || kind === 'celebrity') {
    const P = s.payroll;
    const hired = (charId?: string, ref?: string) => Object.values(P?.hires ?? {}).find((h) => (charId && h.id === charId) || (ref && h.ref === ref));
    const stars = Object.values(s.pol?.people ?? {}).filter((p) => p.alive && !p.retired && (p.fame ?? 0) >= 20 && s.date.y - p.born >= ADULT).sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0)).slice(0, 40);
    for (const p of stars) {
      const cid = p.charId && s.characters[p.charId]?.alive ? p.charId : undefined;
      const ref = `pol:${p.id}`;
      const h = hired(cid, ref);
      out.push({
        id: cid ?? ref, charId: h?.id ?? cid, kind: 'celebrity', name: `${p.first} ${p.last}`, where: p.title, employer: h ? 'player' : 'self', employerName: h ? 'A friend of the family (your retainer)' : 'Independent',
        onPayroll: !!h, earns: `fame ${p.fame}`, action: h ? undefined : cid ? hireAction(s, cid, 'celebrity') : { kind: 'payroll', op: { op: 'star', ref } },
      });
    }
    for (const hs of Object.values(s.lineage?.houses ?? {})) {
      if (hs.type !== 'showbiz' || hs.extinct || !hs.headId) continue;
      const lp = s.lineage!.people[hs.headId];
      if (!lp || lp.dy || s.date.y - lp.by < ADULT || out.some((r) => r.name === `${lp.first} ${lp.last}`)) continue;
      const ref = `lin:${lp.id}`;
      const cid = s.characters[lp.id]?.alive ? lp.id : undefined;
      const h = hired(cid, ref);
      out.push({
        id: cid ?? ref, charId: h?.id ?? cid, kind: 'celebrity', name: `${lp.first} ${lp.last}`, where: lp.titles?.[0] ?? `The ${hs.name} family · ${hs.seat}`, house: hs.name,
        employer: h ? 'player' : 'self', employerName: h ? 'A friend of the family (your retainer)' : 'Independent', onPayroll: !!h, earns: 'plays the clubs this season',
        action: h ? undefined : cid ? hireAction(s, cid, 'celebrity') : { kind: 'payroll', op: { op: 'star', ref } },
      });
    }
  }
  const ord: NightKind[] = ['girl', 'dancer', 'celebrity', 'madam'];
  return out.sort((a, b) => ord.indexOf(a.kind) - ord.indexOf(b.kind) || Number(b.onPayroll) - Number(a.onPayroll) || a.name.localeCompare(b.name));
}

/** The working women (girls and madams), for the honey trap and the payroll: who, her house, on your payroll, who she works for. Empty when Mature content is Off. */
export function workingWomen(s: GameState): { id: string; house?: string; onPayroll: boolean; employer: string }[] {
  return nightPeople(s).filter((r) => (r.kind === 'girl' || r.kind === 'madam') && r.charId).map((r) => ({ id: r.charId!, house: r.house, onPayroll: r.onPayroll, employer: r.employer }));
}

/* ------------------------------------------------------------------ */
/* "I'll do it, and in return you work for me": the favor asks         */
/* ------------------------------------------------------------------ */

const FAVOR_DEF = /^(deed_askFavor|deed_askLoan|office_|aud_)/;
const NO_IDS = new Set(['no', 'decline', 'dismiss', 'refuse', 'let', 'insult', 'word', 'against', 'investigate', 'remind', 'half']);

/** Who is asking (a character), or a petitioner who is only a name (office visitors). */
function askerOf(s: GameState, ev: EventInstance): { c?: Character; name?: string; f?: boolean } | undefined {
  const id = typeof ev.meta?.charId === 'string' ? ev.meta.charId : undefined;
  if (id && s.characters[id]) return { c: s.characters[id] };
  if (typeof ev.meta?.who === 'string' && ev.meta.who) return { name: ev.meta.who, f: !!ev.meta.whoF };
  const a = (ev.actors ?? []).find((x) => x !== s.playerId && s.characters[x]);
  return a ? { c: s.characters[a] } : undefined;
}

/** The extra option for a favor ask, or undefined where it makes no sense (the Family, a minor, the boss's own wife). */
export function favorJobChoice(s: GameState, ev: EventInstance): Choice | undefined {
  if (!FAVOR_DEF.test(ev.defId) || ev.choices.some((c) => c.id === 'payjob')) return undefined;
  const who = askerOf(s, ev);
  if (!who) return undefined;
  const grant = ev.choices.find((c) => c.id !== ev.defaultChoiceId && !NO_IDS.has(c.id));
  if (!grant) return undefined;
  const key = `${ev.iid}:${who.c?.id ?? who.name}`;
  let job: PayJob | undefined;
  let chance: number;
  let nm: string;
  let he: string;
  let reasons = '';
  if (who.c) {
    const c = who.c;
    if (offerBlock(s, c) || onAnyPayroll(s, c.id)) return undefined;
    job = bestJob(s, c);
    if (!job || job === 'girl' || job === 'dancer' || job === 'madam') job = jobsFor(s, c).find((j) => j !== 'girl' && j !== 'dancer' && j !== 'madam');
    if (!job) return undefined;
    const acc = offerAcceptance(s, c, job, { favor: true });
    chance = acc.chance;
    nm = c.firstName;
    he = c.gender === 'F' ? 'she' : 'he';
    const top = acc.reasons.filter((r) => r.label !== 'Base').sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    if (top) reasons = ` Mostly: ${top.label.toLowerCase()} (${top.value > 0 ? '+' : ''}${top.value}).`;
  } else {
    job = who.f ? 'cook' : (['barber', 'bartender', 'parking', 'driver'] as PayJob[])[hashSeed(key) % 4];
    chance = Math.min(0.9, 0.6 + askerReason(s).value / 100);
    nm = who.name!.split(' ')[0];
    he = who.f ? 'she' : 'he';
  }
  const pct = Math.round(chance * 100);
  // Copies, never the grant's own objects (a save round-trip must play the same).
  const keepFx = (JSON.parse(JSON.stringify(grant.effects)) as Effect[]).filter((e) => !(e.type === 'deed' && (e.op as { op?: string }).op === 'owe'));
  return {
    id: 'payjob',
    label: job === 'hush' ? `Do it, and in return ${he} keeps you informed (a quiet envelope)` : `Do it, and in return ${he} works for you (${JOBS[job].label.toLowerCase()})`,
    detail: `${pct}% ${he} says yes.${reasons} Brings: ${yieldText(job)}. Risk: ${riskText(job)} If ${he} says no, the favor still stands and ${nm} owes you a marker.`,
    because: `did ${nm} a favor, with a job as the price`,
    effects: [...keepFx, PX({ op: 'favor', ...(who.c ? { id: who.c.id } : { name: who.name, ...(who.f ? { f: 1 as const } : {}) }), job, chance, key }, `${nm}: the price of the favor`)],
  };
}

/** Adds the option to every favor ask in a list (pure for the list; the events are copied when changed). */
export function withFavorJobs(s: GameState, evs: EventInstance[]): EventInstance[] {
  return evs.map((ev) => {
    const ch = favorJobChoice(s, ev);
    if (!ch) return ev;
    const i = ev.choices.findIndex((c) => c.id === ev.defaultChoiceId);
    const choices = [...ev.choices];
    choices.splice(i >= 0 ? i : choices.length, 0, ch);
    return { ...ev, choices };
  });
}

/** Every payroll order for one person (the person menu, the black book). */
export function payrollActionsFor(s: GameState, id: string): PlayerAction[] {
  const c = s.characters[id];
  if (!c) return [];
  const out: PlayerAction[] = [];
  if (s.payroll?.hires[id]) {
    out.push(PA({ op: 'raise', id, amount: 10 }), PA({ op: 'raise', id, amount: -10 }), PA({ op: 'fire', id }));
    if (s.payroll.main !== id) out.push(PA({ op: 'main', id }));
    return out;
  }
  if (onAnyPayroll(s, id)) { if (s.payroll?.main !== id) out.push(PA({ op: 'main', id })); return out; }
  for (const j of jobsFor(s, c).slice(0, 3)) out.push(hireAction(s, id, j));
  return out;
}

export type { PayJob, PayrollAction, PayOp, Hire, HushItem } from './payrollState';
export { JOBS } from './payrollState';
