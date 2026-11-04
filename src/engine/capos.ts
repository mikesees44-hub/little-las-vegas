import type { ActionPreview } from './actions';
import { capos, crew, displayName, hasTrait, isFree, makeCharacter, pickNickname, player, usedNicknames } from './characters';
import { grantXp, level } from './crewXp';
import { applyEffects, fmtMoney, shiftInfluence } from './effects';
import { ourMarriageable, performMarriage } from './familyMarriage';
import { addEvidence, addStory, assignTo, giveBio, regime } from './hierarchy';
import type { Acceptance, Reason } from './interactions';
import { bumpTension, eraHeadline } from './intrigue';
import { heat, money, respect, type Ctx } from './ledger';
import { mindOf } from './minds/state';
import { remember } from './minds/memory';
import { isSchemer } from './minds/psyche';
import { backMeter } from './myMen';
import { defectTo } from './regimes';
import { maybePlant } from './rivalcrew';
import { addOpinion, changeMeter, getRelation, opinion } from './relations';
import { rand } from './rng';
import { addSecret } from './secrets';
import { changeScore } from './war';
import { FACTION_NAMES } from './world';
import type { Character, Choice, Effect, EventInstance, GameState, RivalId } from './types';
import {
  ensureCapos, GROOM_CAP, GROOM_STAGES, GROOM_WEEKS, INTEL_CAP, LOG_CAP, newBook, PLOT_LABEL, REPORT_CAP, REQ_CAP, SIGN_CAP,
  type CapoAction, type CapoBook, type CapoIntel, type CapoLog, type CapoOp, type CapoPlot, type CapoReport, type CapoRequest, type CaposState,
  type IntelKind, type PlotKind, type ReqAnswer, type SignKind, type Stance,
} from './caposState';
import { CAPO_SEAT_MIN } from './regimes';

export * from './caposState';

/**
 * THE CAPOS: the men who run the street.
 *
 * The boss holds the heat and the big calls (war, buying and selling, who
 * gets made, who holds what ground). The capos run everything below that,
 * each in his own territory with his own judgment:
 *
 *  - THE STREET: each capo's grip on his ground (his leadership, his head for
 *    business, his men, his years) sets how much his corners bring in, how
 *    much heat his crew puts on the family, and whether his district grows or
 *    bleeds to the rival families. A good capo is worth more than any racket.
 *  - THE MEN: capos ask the boss for men ("I need two more guys on Pacific"),
 *    naming a kid off the street, an outside guy, or somebody else's man; the
 *    boss says yes, no, or "take this one instead". Capos groom their
 *    associates (errands, jobs, trust, vouched for, proposed) and the man's
 *    loyalty grows to HIM. The capo puts the name up; the boss decides;
 *    Philadelphia's books decide when.
 *  - THE STREETS' SECRETS: each capo hears things in his territory the boss
 *    doesn't. What he passes up depends on where he stands: an honest capo
 *    tells it straight, a hedging one keeps back what touches him, a schemer
 *    slants it. The boss sees "what Sal tells you", and later, sometimes,
 *    what was true.
 *  - THE TIDE: every capo reads the family's strength (the war, the heat, the
 *    money, Philadelphia's mood, whether the boss has his men's back) against
 *    what he gets (his contract, the boss's word, slights and rewards). When
 *    the tide runs out he hedges (skims, side deals, drinks with rivals);
 *    when it runs out far enough he turns (to another family, to the FBI, to
 *    a coup with the underboss). It shows first: late envelopes, a new car,
 *    the wrong bar. In a crisis a loyal capo can save the family.
 *
 * Nothing here kills a man or hands him over: that is always the boss's own
 * explicit order (handover.ts). A capo leaving is his own choice.
 *
 * Own dice (CaposState.rng): the main simulation's rolls are untouched by
 * anything decided here.
 */

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const r01 = (C: CaposState) => rand(C);
const roll = (C: CaposState, p: number) => rand(C) < p;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const nm = (c: Character) => displayName(c);
const fn = (c: Character) => c.firstName;

function nid(C: CaposState, p: string): string {
  return `${p}${C.n++}`;
}

function pickC<T>(C: CaposState, arr: readonly T[]): T | undefined {
  return arr.length ? arr[Math.floor(r01(C) * arr.length)] : undefined;
}

function note(s: GameState, who: string, k: CapoLog['k'], t: string): void {
  const C = ensureCapos(s);
  C.log.push({ w: s.week, t: t.slice(0, 160), who, k });
  if (C.log.length > LOG_CAP) C.log = C.log.slice(-LOG_CAP);
}

/** A working capo of the family (alive, ours, not the boss). */
export function isCapo(s: GameState, id: string | undefined): Character | undefined {
  const c = id ? s.characters[id] : undefined;
  return c && c.alive && c.faction === 'player' && c.rank === 'capo' && c.id !== s.playerId ? c : undefined;
}

export function bookOf(s: GameState, id: string): CapoBook | undefined {
  return s.capos?.books[id];
}

function book(s: GameState, id: string): CapoBook {
  const C = ensureCapos(s);
  return (C.books[id] ??= newBook(s.week));
}

export function districtOf(s: GameState, k: Character) {
  return s.districts.find((d) => d.capoId === k.id);
}

function liveRivals(s: GameState): { id: RivalId; leaderId: string; shortName: string; name: string }[] {
  return s.rivals.filter((r) => r.kind === 'mob' && r.id !== 'philly' && s.characters[r.leaderId]?.alive);
}

function rivalName(s: GameState, id: string | undefined): string {
  return s.rivals.find((r) => r.id === id)?.shortName ?? FACTION_NAMES[id as RivalId] ?? 'another family';
}

/** The rival with the most ground in his district (or courting him). */
function rivalNear(s: GameState, k: Character): RivalId | undefined {
  if (k.courtedBy && s.characters[s.rivals.find((r) => r.id === k.courtedBy!.rival)?.leaderId ?? '']?.alive) return k.courtedBy.rival;
  const d = districtOf(s, k);
  const rs = liveRivals(s);
  if (!rs.length) return undefined;
  if (!d) return rs[0].id;
  return rs.slice().sort((a, b) => (d.influence[b.id] ?? 0) - (d.influence[a.id] ?? 0) || a.id.localeCompare(b.id))[0].id;
}

/* ------------------------------------------------------------------ */
/* The street: his grip                                                */
/* ------------------------------------------------------------------ */

/** How well he runs his ground, 0-100 (his skill, his men, his years; a man looking for the door runs it worse). */
export function gripOf(s: GameState, k: Character): { v: number; reasons: Reason[] } {
  const a = k.attributes;
  const men = regime(s, k.id).filter((m) => isFree(s, m)).length;
  const b = s.capos?.books[k.id];
  const reasons: Reason[] = [
    { label: 'Leadership', value: Math.round(a.leadership * 0.35) },
    { label: 'Head for business', value: Math.round(a.business * 0.25) },
    { label: 'Discipline', value: Math.round((a.discipline ?? 40) * 0.1) },
    { label: `His men (${men})`, value: Math.min(6, men) * 3 - 6 },
    { label: 'His level', value: Math.min(10, level(s, k.id)) * 1.5 },
  ];
  if (hasTrait(k, 'Patient')) reasons.push({ label: 'Patient', value: 5 });
  if (hasTrait(k, 'Drinker')) reasons.push({ label: 'Drinks', value: -5 });
  if (hasTrait(k, 'Gambler')) reasons.push({ label: 'Gambles', value: -3 });
  const yrs = b ? Math.min(52, s.week - b.since) : 0;
  if (yrs >= 12) reasons.push({ label: 'Knows his corners', value: Math.round(yrs / 10) });
  if (b?.st === 'hedging') reasons.push({ label: 'His mind is elsewhere', value: -6 });
  if (b?.st === 'turning') reasons.push({ label: 'His mind is elsewhere', value: -12 });
  const v = clamp(Math.round(reasons.reduce((x, r) => x + r.value, 0)), 0, 100);
  return { v, reasons };
}

/** The multiplier on his corners' take (tribute.ts): 0.9 at no grip, 1.0 at an ordinary capo, 1.1 at the best. */
export function capoStreetMult(s: GameState, k: Character): number {
  if (!s.capos) return 1;
  return 0.9 + gripOf(s, k).v / 500;
}

/** What his stance adds to the share he skims (economy.ts skimRate). */
export function capoSkimAdd(s: GameState, k: Character): number {
  const b = s.capos?.books[k.id];
  return b?.st === 'turning' ? 0.08 : b?.st === 'hedging' ? 0.04 : 0;
}

/** What his stance and his last crisis move do to his levy (army.ts willingness). */
export function capoLevyReasons(s: GameState, k: Character): Reason[] {
  const b = s.capos?.books[k.id];
  if (!b) return [];
  const out: Reason[] = [];
  if ((b.rally ?? -1) >= s.week) out.push({ label: `${fn(k)} rallied his men for you`, value: 20 });
  if (b.st === 'hedging') out.push({ label: 'Slow to send his men', value: -10 });
  if (b.st === 'turning') out.push({ label: 'Keeps his men home', value: -25 });
  return out;
}

/** His crew's weekly heat, before the dice: a hothead's crew is loud, a patient capo's is quiet. */
export function heatLean(s: GameState, k: Character): number {
  // Centered on an ordinary capo: as many keep it quiet as make noise.
  let h = -0.08;
  if (hasTrait(k, 'Hot-headed')) h += 0.3;
  if (hasTrait(k, 'Cruel')) h += 0.2;
  if (k.craft === 'muscle' || k.craft === 'collector') h += 0.08;
  if (hasTrait(k, 'Patient')) h -= 0.25;
  if (hasTrait(k, 'Charming')) h -= 0.15;
  if (hasTrait(k, 'Honest')) h -= 0.1;
  h -= (gripOf(s, k).v - 50) / 200;
  return Math.round(h * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* The tide                                                            */
/* ------------------------------------------------------------------ */

/** The family's strength as any capo reads it (shared by all of them). */
export function familyStrength(s: GameState): Reason[] {
  const out: Reason[] = [];
  out.push({ label: `The family's name (respect ${s.respect})`, value: Math.round((s.respect - 40) / 3) });
  if (s.money < 0) out.push({ label: 'The family is broke', value: -15 });
  else if (s.money < 5000) out.push({ label: 'Money is short', value: -5 });
  else if (s.money > 50000) out.push({ label: 'Money in the bank', value: 5 });
  const hot = Math.max(s.heat.local, s.heat.federal, s.heat.family);
  if (hot >= 70) out.push({ label: 'The heat is on the boss', value: -12 });
  else if (hot >= 50) out.push({ label: 'The heat is up', value: -5 });
  for (const w of s.wars) {
    if (w.score <= -30) out.push({ label: `Losing the war with ${rivalName(s, w.rival)}`, value: -15 });
    else if (w.score >= 30) out.push({ label: `Winning the war with ${rivalName(s, w.rival)}`, value: 6 });
    else out.push({ label: `At war with ${rivalName(s, w.rival)}`, value: -3 });
  }
  // The changing tides between the families (intrigue.ts eras).
  const era = eraHeadline(s);
  if (!s.wars.length && (era.era === 'cold' || era.era === 'war')) out.push({ label: era.text, value: era.era === 'war' ? -5 : -2 });
  const boss = player(s);
  if (!isFree(s, boss)) out.push({ label: 'The boss is inside', value: -20 });
  else if (boss.health < 40) out.push({ label: 'The boss is sick', value: -8 });
  const philly = s.rivals.find((r) => r.id === 'philly');
  const po = philly ? opinion(s, philly.leaderId, s.playerId) : 0;
  if (po < -20) out.push({ label: 'Philadelphia is unhappy with the boss', value: -8 });
  else if (po > 30) out.push({ label: 'Philadelphia likes the boss', value: 4 });
  const back = backMeter(s);
  if (Math.abs(back - 50) >= 5) out.push({ label: 'Does the boss have our back?', value: Math.round((back - 50) / 5) });
  return out.filter((r) => r.value !== 0);
}

/** One capo's reading of the tide: does staying loyal pay? -100..100, with every reason. */
export function tideOf(s: GameState, k: Character, fam = familyStrength(s)): { v: number; reasons: Reason[] } {
  const b = s.capos?.books[k.id];
  const reasons: Reason[] = [...fam];
  const op = opinion(s, k.id, s.playerId);
  reasons.push({ label: `What he thinks of the boss (${op})`, value: Math.round(op / 2) });
  if (b?.rw) reasons.push({ label: 'The boss has been good to him', value: Math.round(Math.min(20, b.rw * 4)) });
  if (b?.sl) reasons.push({ label: 'Slighted lately', value: -Math.round(Math.min(25, b.sl * 5)) });
  const keep = k.keep ?? 0.3;
  if (keep < 0.3) reasons.push({ label: 'His contract was squeezed', value: -Math.round((0.3 - keep) * 100) });
  if (keep > 0.3) reasons.push({ label: 'A generous contract', value: Math.round((keep - 0.3) * 60) });
  if (hasTrait(k, 'Loyal-to-a-fault')) reasons.push({ label: 'Loyal to a fault', value: 30 });
  if (hasTrait(k, 'Honest')) reasons.push({ label: 'Honest', value: 8 });
  if (hasTrait(k, 'Ambitious')) reasons.push({ label: 'Ambitious', value: -8 });
  if (hasTrait(k, 'Greedy')) reasons.push({ label: 'Greedy', value: -6 });
  if (k.courtedBy) reasons.push({ label: `${rivalName(s, k.courtedBy.rival)} is courting him`, value: -10 });
  if (b?.tied) reasons.push({ label: `Family now (${b.tied.how})`, value: 15 });
  const m = mindOf(s, k.id);
  if (m) {
    if (m.mood === 'angry' || m.mood === 'scheming') reasons.push({ label: m.mood === 'angry' ? 'Angry' : 'Scheming', value: -8 });
    else if (m.mood === 'loyal' || m.mood === 'proud') reasons.push({ label: m.mood === 'loyal' ? 'Devoted' : 'Proud', value: 6 });
  }
  const v = clamp(Math.round(reasons.reduce((x, r) => x + r.value, 0)), -100, 100);
  return { v, reasons: reasons.filter((r) => r.value !== 0) };
}

/** Could he ever turn? (Loyal-to-a-fault never does; it takes an angle or a grudge.) */
export function canTurn(s: GameState, k: Character): boolean {
  if (hasTrait(k, 'Loyal-to-a-fault') || k.dynasty) return false;
  return hasTrait(k, 'Ambitious') || hasTrait(k, 'Greedy') || isSchemer(k) || opinion(s, k.id, s.playerId) <= -30;
}

/** Where his reading of the tide puts him (with a little stickiness). */
export function stanceFor(s: GameState, k: Character, tide: number, prev: Stance): Stance {
  const h = (st: Stance) => (prev === st ? 5 : 0);
  if (tide >= 25 - h('loyal')) return 'loyal';
  if (tide >= -12 - h('steady')) return 'steady';
  if (tide >= -40 - h('hedging') || !canTurn(s, k)) return 'hedging';
  return 'turning';
}

/* ------------------------------------------------------------------ */
/* The crisis                                                          */
/* ------------------------------------------------------------------ */

export interface Crisis { k: 'war' | 'heat' | 'money' | 'jail' | 'faction'; why: string; warId?: string; rival?: RivalId }

/** Is the family in a crisis (the weeks a capo saves it, or sinks it)? */
export function crisisOf(s: GameState): Crisis | undefined {
  const w = s.wars.filter((x) => x.score <= -25).sort((a, b) => a.score - b.score)[0];
  if (w) return { k: 'war', why: `Losing the war with ${rivalName(s, w.rival)}`, warId: w.id, rival: w.rival };
  if (!isFree(s, player(s))) return { k: 'jail', why: 'The boss is inside' };
  if (Math.max(s.heat.local, s.heat.federal) >= 75) return { k: 'heat', why: 'The heat is at the door' };
  if (s.money < -2000) return { k: 'money', why: 'The family is broke' };
  const f = s.factions.find((x) => (x.stage ?? 0) >= 1);
  if (f) return { k: 'faction', why: `${s.characters[f.leaderId]?.firstName ?? 'A faction'}'s people have stopped waiting` };
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Signs                                                               */
/* ------------------------------------------------------------------ */

const SIGN_TEXT: Record<SignKind, (s: GameState, k: Character, r?: string) => string> = {
  late: (_s, k) => `${fn(k)}'s envelope came in late, and light`,
  car: (_s, k) => `${fn(k)} is driving a new Cadillac: more than his end buys`,
  seen: (s, k, r) => `${fn(k)} was seen at a ${rivalName(s, r)} place, more than once`,
  sullen: (_s, k) => `${fn(k)} sat at the Saturday table and said nothing`,
  quiet: (_s, k) => `${fn(k)} has stopped bringing you news from his corners`,
  family: (_s, k) => `${fn(k)} sent his wife and kids to her mother's in Philadelphia`,
  proud: (_s, k) => `${fn(k)} tells anyone who'll listen what the boss did for him`,
  generous: (_s, k) => `${fn(k)} picked up the whole table's check, and toasted you`,
};
export const BAD_SIGNS: SignKind[] = ['late', 'car', 'seen', 'sullen', 'quiet', 'family'];

function addSign(s: GameState, k: Character, kind: SignKind, tr: 0 | 1, rival?: string): void {
  const b = book(s, k.id);
  if (b.signs.some((x) => x.k === kind && s.week - x.w < 6)) return;
  const t = SIGN_TEXT[kind](s, k, rival);
  b.signs.push({ w: s.week, k: kind, t, tr });
  if (b.signs.length > SIGN_CAP) b.signs = b.signs.slice(-SIGN_CAP);
}

/** What the boss can read off him (signs of the last 10 weeks; never his true stance). */
export function readOn(s: GameState, k: Character): { word: string; tone: 'good' | 'plain' | 'warn' | 'bad'; bad: number } {
  const b = s.capos?.books[k.id];
  const recent = (b?.signs ?? []).filter((x) => s.week - x.w <= 10);
  const bad = recent.filter((x) => BAD_SIGNS.includes(x.k)).length;
  const good = recent.length - bad;
  if (b?.plot?.known) return { word: 'You know what he is doing', tone: 'bad', bad };
  if (bad >= 3) return { word: 'Something is wrong with him', tone: 'bad', bad };
  if (bad >= 2) return { word: 'Something is off', tone: 'warn', bad };
  if (bad === 1) return { word: 'Something on his mind', tone: 'plain', bad };
  if (good > 0) return { word: 'Solid', tone: 'good', bad };
  return { word: 'Steady, as far as you can tell', tone: 'plain', bad };
}

/* ------------------------------------------------------------------ */
/* Intel: what a capo hears on his corners                             */
/* ------------------------------------------------------------------ */

function intelKey(i: Pick<CapoIntel, 'k' | 'about' | 'ref' | 'rival'>): string {
  return `${i.k}:${i.about ?? ''}:${i.ref ?? ''}:${i.rival ?? ''}`;
}

/** What is true in his territory right now that the boss does not know. */
export function streetTruths(s: GameState, k: Character): Omit<CapoIntel, 'id' | 'w'>[] {
  const out: Omit<CapoIntel, 'id' | 'w'>[] = [];
  const d = districtOf(s, k);
  const men = regime(s, k.id);
  const near = new Set<string>([...men.map((m) => m.id), k.id]);
  // Secrets about his men, his rival neighbours, the officials on his ground.
  for (const sec of s.secrets) {
    if (sec.knownBy.includes('player') || sec.kind === 'plot') continue;
    const o = s.characters[sec.ownerId];
    if (!o?.alive) continue;
    const rivalHere = d && o.faction !== 'player' && (d.influence[o.faction] ?? 0) >= 8;
    if (near.has(o.id) || rivalHere) out.push({ k: 'secret', about: o.id, ref: sec.id, truth: sec.text });
  }
  for (const m of men) {
    if (m.informantFor) out.push({ k: 'rat', about: m.id, truth: `${nm(m)} talks to ${m.informantFor === 'law' ? 'the FBI' : rivalName(s, m.informantFor)}` });
    if (m.courtedBy) out.push({ k: 'courted', about: m.id, rival: m.courtedBy.rival, truth: `${rivalName(s, m.courtedBy.rival)} is courting ${nm(m)}` });
    if ((m.skimmed ?? 0) >= 300) out.push({ k: 'skim', about: m.id, truth: `${nm(m)} is holding back on his envelopes` });
  }
  // Other capos: who is talking to whom (he hears it at the same bars).
  for (const o of capos(s)) {
    if (o.id === k.id || !isFree(s, o)) continue;
    const ob = s.capos?.books[o.id];
    if (ob && (ob.st === 'turning' || (ob.st === 'hedging' && ob.hedge >= 25)) && opinion(s, k.id, o.id) < 40) {
      out.push({ k: 'hedge', about: o.id, rival: rivalNear(s, o), truth: ob.plot ? `${nm(o)} is ${PLOT_LABEL[ob.plot.k].toLowerCase()}` : `${nm(o)} has been sitting down with ${rivalName(s, rivalNear(s, o))}` });
    }
  }
  if (d) {
    for (const r of liveRivals(s)) {
      if ((d.influence[r.id] ?? 0) >= 12) out.push({ k: 'rival', rival: r.id, about: r.leaderId, truth: `${r.shortName} is moving men onto the corners of ${d.name}` });
    }
    if (s.heat.local >= 30) out.push({ k: 'cops', truth: `A new detective is working ${d.name}: he takes his coffee at the same diner every morning, and he is building a book on the family` });
  }
  return out;
}

/** Does this piece of news touch him (his men, his friends, himself)? */
function touchesHim(s: GameState, k: Character, i: Pick<CapoIntel, 'about'>): boolean {
  if (!i.about) return false;
  if (i.about === k.id) return true;
  const o = s.characters[i.about];
  return !!o && (o.capoId === k.id || opinion(s, k.id, o.id) >= 40);
}

/** A man who bends what he passes up (a schemer, unless he is honest or loyal to a fault). */
function slanter(k: Character): boolean {
  return isSchemer(k) && !hasTrait(k, 'Honest') && !hasTrait(k, 'Loyal-to-a-fault');
}

/** Odds he tells it straight. */
function honestOdds(s: GameState, k: Character, b: CapoBook, i: CapoIntel): number {
  let p = b.st === 'loyal' ? 0.92 : b.st === 'steady' ? 0.78 : b.st === 'hedging' ? 0.45 : 0.15;
  if (hasTrait(k, 'Honest')) p += 0.12;
  if (hasTrait(k, 'Loyal-to-a-fault')) p += 0.1;
  if (slanter(k)) p -= 0.15;
  if (touchesHim(s, k, i)) p -= b.st === 'loyal' ? 0.1 : b.st === 'steady' ? 0.25 : 0.35;
  if ((b.watch ?? -1) >= s.week) p += 0.05;
  return clamp(p, 0.03, 0.98);
}

/** A slanted version: a schemer points it somewhere else, or makes it smaller. */
function slant(s: GameState, k: Character, i: CapoIntel): { told: string; about?: string } {
  const C = ensureCapos(s);
  if (i.k === 'rat' || i.k === 'skim') {
    const others = crew(s).filter((m) => m.id !== i.about && m.id !== k.id && (m.rank === 'soldier' || m.rank === 'associate') && m.capoId !== k.id && isFree(s, m));
    const scape = pickC(C, others);
    if (scape) return { told: i.k === 'rat' ? `${nm(scape)} talks to the FBI` : `${nm(scape)} is holding back on his envelopes`, about: scape.id };
  }
  if (i.k === 'hedge' && i.about) {
    const o = s.characters[i.about];
    if (o) return { told: `${fn(o)} is fine. Grumbles, like everybody`, about: o.id };
  }
  if (i.k === 'rival') return { told: `${rivalName(s, i.rival)} is quiet. A few of their guys drinking on our side, nothing more` };
  if (i.k === 'courted' && i.about) return { told: `${s.characters[i.about]?.firstName ?? 'He'} had a drink with an old friend, that's all` };
  return { told: 'A quiet week on the corners' };
}

/** He passes one piece of news up (or doesn't). */
function report(ctx: Ctx, k: Character, i: CapoIntel, forceHonest = false): CapoReport {
  const s = ctx.s;
  const C = ensureCapos(s);
  const b = book(s, k.id);
  i.told = 1;
  const honest = forceHonest || roll(C, honestOdds(s, k, b, i));
  let rep: CapoReport;
  if (honest) {
    rep = { id: nid(C, 'cr'), capo: k.id, w: s.week, k: i.k, told: i.truth, truth: i.truth, kind: 'honest', about: i.about };
    C.stats.honest++;
    tellTruth(ctx, k, i);
  } else if (slanter(k) || b.st === 'turning' || (b.st === 'hedging' && r01(C) < 0.5)) {
    const sl = slant(s, k, i);
    rep = { id: nid(C, 'cr'), capo: k.id, w: s.week, k: i.k, told: sl.told, truth: i.truth, kind: 'slant', about: i.about };
    C.stats.slants++;
    // A name thrown to the boss sticks to the man it was thrown at.
    if (sl.about && sl.about !== i.about && (i.k === 'rat' || i.k === 'skim')) addOpinion(s, s.playerId, sl.about, `${fn(k)} says he ${i.k === 'rat' ? 'talks' : 'skims'}`, -6, 1);
  } else {
    rep = { id: nid(C, 'cr'), capo: k.id, w: s.week, k: i.k, told: 'Nothing worth your time this week', truth: i.truth, kind: 'withheld', about: i.about };
    C.stats.withheld++;
  }
  C.reports.push(rep);
  if (C.reports.length > REPORT_CAP) C.reports = C.reports.slice(-REPORT_CAP);
  return rep;
}

/** The boss now knows it: what that changes. */
function tellTruth(ctx: Ctx, k: Character, i: Pick<CapoIntel, 'k' | 'about' | 'ref' | 'rival'>): void {
  const s = ctx.s;
  if (i.k === 'secret' && i.ref) {
    const sec = s.secrets.find((x) => x.id === i.ref);
    if (sec && !sec.knownBy.includes('player')) sec.knownBy.push('player');
  } else if (i.k === 'rat' && i.about) {
    const m = s.characters[i.about];
    if (m?.alive) {
      const sec = addSecret(s, m, 'informant');
      if (!sec.knownBy.includes('player')) sec.knownBy.push('player');
    }
  } else if (i.k === 'skim' && i.about) {
    const m = s.characters[i.about];
    if (m?.alive) {
      const sec = addSecret(s, m, 'skimming');
      if (!sec.knownBy.includes('player')) sec.knownBy.push('player');
    }
  } else if (i.k === 'cops') {
    if (s.heat.local > 5) heat(ctx, 'local', -2, `${fn(k)}'s tip on the new detective: the crew stays out of his way`, 'heat');
  } else if (i.k === 'hedge' && i.about) {
    const ob = s.capos?.books[i.about];
    if (ob?.plot && !ob.plot.known) ob.plot.known = s.week;
  }
  addOpinion(s, s.playerId, k.id, 'Brings me the truth from the street', 2, 1);
}

/** The truth of a report comes out. */
function reveal(s: GameState, r: CapoReport, how: string): void {
  if (r.rev !== undefined || r.kind === 'honest') return;
  const C = ensureCapos(s);
  r.rev = s.week;
  r.how = how;
  C.stats.revealed++;
  const k = s.characters[r.capo];
  if (k) {
    addOpinion(s, s.playerId, k.id, r.kind === 'slant' ? 'Lied to me about the street' : 'Kept things from me', r.kind === 'slant' ? -8 : -4, 1);
    note(s, k.id, 'intel', `${fn(k)} said: "${r.told}". The truth: ${r.truth}.`);
  }
}

/** The truth of one report comes out (protect.ts inquiries, the boss's questions). */
export function revealReport(s: GameState, id: string, how: string): void {
  const r = s.capos?.reports.find((x) => x.id === id);
  if (r) reveal(s, r, how);
}

/* ------------------------------------------------------------------ */
/* The weekly turn                                                     */
/* ------------------------------------------------------------------ */

export function caposWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const C = ensureCapos(s);
  const list = capos(s).filter((k) => k.id !== s.playerId);
  // Books for the capos there are; the rest go.
  for (const id of Object.keys(C.books)) if (!isCapo(s, id)) delete C.books[id];
  const fam = familyStrength(s);
  const crisis = crisisOf(s);
  for (const k of list) {
    const b = book(s, k.id);
    if (!isFree(s, k)) { b.doing = 'Inside: his crew runs itself'; continue; }
    // A squeeze on his contract is a slight he remembers.
    const keep = k.keep ?? 0.3;
    if (b.keep !== undefined && keep < b.keep - 0.001) slight(s, k, 'Squeezed my contract', 1.5);
    b.keep = keep;
    // His reading of the tide.
    const t = tideOf(s, k, fam).v;
    b.tide = Math.round(b.tide * 0.7 + t * 0.3);
    const was = b.st;
    b.st = stanceFor(s, k, b.tide, b.st);
    if (b.st !== was) note(s, k.id, 'tide', `${fn(k)}: ${was} → ${b.st} (tide ${b.tide})`);
    streetWeek(ctx, k, b);
    standWeek(ctx, k, b, crisis);
    intelWeek(ctx, k, b);
    requestsWeek(ctx, k, b);
    b.sl = Math.max(0, Math.round((b.sl * 0.96) * 100) / 100);
    b.rw = Math.max(0, Math.round((b.rw * 0.96) * 100) / 100);
  }
  groomWeek(ctx);
  lapseRequests(ctx);
  revealWeek(s);
}

/** His day-to-day: the corners, the disputes, the cops, his crew's noise. */
function streetWeek(ctx: Ctx, k: Character, b: CapoBook): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  const d = districtOf(s, k);
  const g = gripOf(s, k).v;
  // The take, as his corners paid it this week (tribute.ts set it).
  b.take.push(Math.round(k.lastEarn ?? 0));
  if (b.take.length > 8) b.take = b.take.slice(-8);
  // His crew's noise.
  const lean = heatLean(s, k);
  let h = 0;
  if (lean > 0 && roll(C, Math.min(0.6, lean * 0.8))) h = 1;
  else if (lean < 0 && s.heat.local > 2 && roll(C, Math.min(0.6, -lean * 0.8))) h = -1;
  if (h) heat(ctx, 'local', h, h > 0 ? `${fn(k)}'s crew: loud on the corners` : `${fn(k)} keeps his crew quiet`, 'heat');
  b.heat = h;
  b.heat8.push(h);
  if (b.heat8.length > 8) b.heat8 = b.heat8.slice(-8);
  // His grip holds his ground (or lets it go) against the families pushing on it.
  if (d) {
    const r = rivalNear(s, k);
    const p = Math.abs(g - 50) / 450;
    if (r && (d.influence[r] ?? 0) > 0 && g > 55 && roll(C, p)) {
      const got = shiftInfluence(s, d.id, 'player', 1);
      if (got) note(s, k.id, 'street', `${fn(k)} pushed ${rivalName(s, r)} off a corner in ${d.name}.`);
    } else if (r && g < 45 && (d.influence.player ?? 0) > 20 && roll(C, p)) {
      const lost = -shiftInfluence(s, d.id, 'player', -1);
      if (lost) shiftInfluence(s, d.id, r, lost);
      if (lost) note(s, k.id, 'street', `${rivalName(s, r)} took a corner in ${d.name} off ${fn(k)}'s crew.`);
    }
  }
  b.doing = doingLine(s, k, b, g);
}

function doingLine(s: GameState, k: Character, b: CapoBook, g: number): string {
  const C = ensureCapos(s);
  const d = districtOf(s, k)?.name ?? 'his corners';
  const gr = C.groom.find((x) => x.capo === k.id);
  const opts: string[] = [];
  if (b.plot && b.plot.st >= 1) opts.push(`Away a lot: "family business" in Philadelphia`);
  if (b.st === 'hedging') opts.push(`Keeping his own counsel on ${d}`);
  if (gr) opts.push(`Bringing ${s.characters[gr.id]?.firstName ?? 'a kid'} along: ${GROOM_STAGES[gr.st].toLowerCase()}`);
  if (g >= 60) opts.push(`Settling a beef between two bookmakers on ${d}`, `Making the collections on ${d}, on time`);
  else opts.push(`Chasing the collections on ${d}`, `Patching up a fight between his own guys`);
  if (s.heat.local >= 30) opts.push(`Keeping his guys away from the new detective on ${d}`);
  return opts[Math.floor(r01(C) * opts.length)] ?? `Running ${d}`;
}

/** Where he stands: the hedging, the signs, a plot, and the crisis. */
function standWeek(ctx: Ctx, k: Character, b: CapoBook, crisis: Crisis | undefined): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  // Noise: a loyal man buys a car too, sometimes.
  if (b.st === 'loyal' && roll(C, 0.03)) addSign(s, k, pickC(C, ['proud', 'generous'] as SignKind[])!, 1);
  if (b.st === 'loyal' && roll(C, 0.01)) addSign(s, k, 'car', 0);
  if (b.st === 'steady' && roll(C, 0.01)) addSign(s, k, 'sullen', 0);
  if (b.st === 'hedging' || b.st === 'turning') {
    // Skimming a little more, a side deal, a drink with the other side.
    if (roll(C, 0.3)) {
      const amt = 150 + Math.floor(r01(C) * 350);
      k.skimmed = (k.skimmed ?? 0) + amt;
      k.wealth += amt;
      b.hedge = Math.min(100, b.hedge + 3);
      if (roll(C, 0.35)) addSign(s, k, 'late', 1);
    }
    if (roll(C, 0.12)) {
      b.hedge = Math.min(100, b.hedge + 8);
      k.wealth += 300 + Math.floor(r01(C) * 700);
      if (roll(C, 0.5)) addSign(s, k, 'car', 1);
      note(s, k.id, 'tide', `${fn(k)} made a side deal nobody told you about.`);
    }
    const r = rivalNear(s, k);
    if (r && !k.courtedBy && roll(C, b.st === 'turning' ? 0.15 : 0.06)) {
      k.courtedBy = { rival: r, week: s.week };
      b.hedge = Math.min(100, b.hedge + 10);
      if (roll(C, 0.6)) addSign(s, k, 'seen', 1, r);
    }
    if (roll(C, 0.08)) addSign(s, k, pickC(C, ['sullen', 'quiet'] as SignKind[])!, 1);
  } else {
    // Steady and loyal men let the side business go.
    b.hedge = Math.max(0, b.hedge - 2);
  }
  // A plot: started when he turns, dropped when the tide comes back, carried out when it is ready.
  if (b.st === 'turning' && !b.plot && roll(C, 0.25)) startPlot(ctx, k, b);
  if (b.plot) workPlot(ctx, k, b, crisis);
  // The crisis: the weeks that show who a man is.
  if (crisis && s.week - (b.crisis ?? -99) >= 8) crisisMove(ctx, k, b, crisis);
}

/**
 * A rival's courtship has ripened (regimes.ts): a capo makes his deal over
 * weeks instead of walking out overnight: a plot to go over with his crew,
 * with its signs, its chance of being found out, and the boss's counters.
 */
export function capoCourted(ctx: Ctx, k: Character, rival: RivalId): boolean {
  const s = ctx.s;
  if (!s.capos) return false;
  const b = book(s, k.id);
  if (!b.plot) {
    b.plot = { k: 'defect', rival, st: 1, w: s.week, sw: s.week };
    ensureCapos(s).stats.plots++;
    note(s, k.id, 'sink', `${fn(k)} is making his deal with ${rivalName(s, rival)}.`);
    addSign(s, k, 'seen', 1, rival);
  }
  return true;
}

function startPlot(ctx: Ctx, k: Character, b: CapoBook): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  const r = rivalNear(s, k);
  const ub = crew(s).find((c) => c.rank === 'underboss' && isFree(s, c));
  const opts: { k: PlotKind; w: number }[] = [];
  if (r) opts.push({ k: 'defect', w: 3 + (k.courtedBy ? 3 : 0) });
  // A man with a thick file (or a weak stomach) thinks about the deal the FBI offers.
  if ((k.evidence ?? 0) >= 25 || hasTrait(k, 'Cowardly') || s.heat.federal >= 40) opts.push({ k: 'fbi', w: 1 + (k.evidence ?? 0) / 25 + (hasTrait(k, 'Cowardly') ? 2 : 0) + (s.heat.federal >= 40 ? 1 : 0) });
  if (hasTrait(k, 'Ambitious') && (s.factions.length > 0 || (ub && ub.id !== k.id && opinion(s, ub.id, s.playerId) < -10))) opts.push({ k: 'coup', w: 3 });
  if (!opts.length) return;
  const tot = opts.reduce((a, o) => a + o.w, 0);
  let x = r01(C) * tot;
  const pick = opts.find((o) => (x -= o.w) < 0) ?? opts[0];
  b.plot = { k: pick.k, ...(pick.k === 'defect' && r ? { rival: r } : {}), st: 0, w: s.week, sw: s.week };
  C.stats.plots++;
  note(s, k.id, 'sink', `${fn(k)} started ${PLOT_LABEL[pick.k].toLowerCase()}.`);
  const m = mindOf(s, k.id);
  if (m) remember(m, { w: s.week, k: 'betrayal', who: s.playerId, t: 'decided the boss is finished', v: -12 });
}

const STAGE_SIGN: Record<PlotKind, SignKind[]> = { defect: ['seen', 'car', 'family'], fbi: ['quiet', 'sullen', 'family'], coup: ['sullen', 'seen', 'late'] };

function workPlot(ctx: Ctx, k: Character, b: CapoBook, crisis: Crisis | undefined): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  const p = b.plot!;
  // The tide came back in: he thinks better of it (before it is done).
  if (b.st === 'loyal' || (b.st === 'steady' && (b.tide > 0 || roll(C, 0.3))) || (b.st === 'hedging' && b.tide > -25 && roll(C, 0.2))) {
    b.plot = undefined;
    C.stats.foiled++;
    note(s, k.id, 'counter', `${fn(k)} thought better of ${PLOT_LABEL[p.k].toLowerCase()}.`);
    return;
  }
  if (roll(C, 0.45)) addSign(s, k, STAGE_SIGN[p.k][Math.min(2, p.st)], 1, p.rival);
  // Found out: by the man on him, by the street, by chance.
  if (!p.known && roll(C, 0.03 + p.st * 0.04 + ((b.watch ?? -1) >= s.week ? 0.25 : 0))) {
    p.known = s.week;
    note(s, k.id, 'counter', `You know what ${fn(k)} is doing: ${PLOT_LABEL[p.k].toLowerCase()}.`);
  }
  const stageWeeks = 4 + (p.st === 2 ? 0 : 1);
  const hurry = crisis ? 2 : 0;
  if (s.week - p.sw >= stageWeeks - hurry && p.st < 2) {
    p.st++;
    p.sw = s.week;
    return;
  }
  if (p.st >= 2 && s.week - p.sw >= 2 && roll(C, crisis ? 0.5 : 0.3)) carryOut(ctx, k, b);
}

/** The betrayal lands. */
function carryOut(ctx: Ctx, k: Character, b: CapoBook): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  const p = b.plot!;
  b.plot = undefined;
  const d = districtOf(s, k);
  if (p.k === 'coup') {
    const f = s.factions[0];
    if (f) {
      if (!f.memberIds.includes(k.id)) f.memberIds.push(k.id);
      C.stats.coups++;
      const text = `${nm(k)} has thrown in with ${s.characters[f.leaderId]?.firstName ?? 'the'}'s faction against you.`;
      ctx.log.push(text);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
      note(s, k.id, 'sink', text);
      addStory(s, k, 'Threw in with the faction against the boss.');
      return;
    }
    const ub = crew(s).find((c) => c.rank === 'underboss' && isFree(s, c));
    if (ub && opinion(s, ub.id, s.playerId) < -25 && opinion(s, k.id, s.playerId) < -25) {
      s.factions.push({ id: `f${s.nextId++}`, leaderId: ub.id, memberIds: [ub.id, k.id], demand: 'abdicate', agenda: 'abdicate', since: s.week, stage: 0, stageWeek: s.week, name: `${ub.lastName} and ${k.lastName}` });
      C.stats.coups++;
      const text = `${nm(ub)} and ${nm(k)} have been counting votes: they want you out of the chair.`;
      ctx.log.push(text);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
      note(s, k.id, 'sink', text);
      return;
    }
    // No one to move with: he goes to the other side instead.
    p.k = 'defect';
    p.rival = rivalNear(s, k);
  }
  if (p.k === 'fbi') {
    k.informantFor = 'law';
    addSecret(s, k, 'informant');
    addEvidence(s, player(s), 12);
    heat(ctx, 'federal', 6, `Somebody close to the family is talking to the FBI`, 'heat');
    C.stats.fbi++;
    note(s, k.id, 'sink', `${fn(k)} went to the FBI.`);
    addSign(s, k, 'quiet', 1);
    return;
  }
  const r = p.rival ?? rivalNear(s, k);
  if (!r) return;
  const before = d ? d.influence.player ?? 0 : 0;
  const followers = defectTo(ctx, k, r, 'courted');
  if (d && before > 0) {
    const lost = -shiftInfluence(s, d.id, 'player', -Math.min(15, Math.round(before / 2)));
    if (lost) shiftInfluence(s, d.id, r, lost);
  }
  C.stats.defected++;
  note(s, k.id, 'sink', `${nm(k)} went over to ${rivalName(s, r)}${followers.length ? ` with ${followers.length} of his men` : ''}${d ? `, and took a piece of ${d.name}` : ''}.`);
}

/** In a crisis: a loyal man saves the family; a turning one sinks it. */
function crisisMove(ctx: Ctx, k: Character, b: CapoBook, cr: Crisis): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  if (b.st === 'turning' || b.st === 'hedging') {
    if (b.st === 'hedging' && !b.plot && canTurn(s, k) && b.tide < -20 && roll(C, 0.25)) startPlot(ctx, k, b);
    if (b.plot && b.plot.st < 2 && roll(C, 0.3)) { b.plot.st++; b.plot.sw = s.week; }
    b.crisis = s.week;
    return;
  }
  const p = b.st === 'loyal' ? 0.3 : 0.1;
  if (!roll(C, p + (hasTrait(k, 'Loyal-to-a-fault') ? 0.15 : 0))) return;
  b.crisis = s.week;
  C.stats.saves++;
  const d = districtOf(s, k);
  let text = '';
  if (cr.k === 'war' && cr.warId) {
    const how = pickC(C, ['rally', 'front', 'intel'] as const)!;
    if (how === 'rally') {
      b.rally = s.week + 8;
      changeScore(s, cr.warId, 4);
      text = `${nm(k)} called every man he has to the clubhouse: his crew is with you, all of them.`;
    } else if (how === 'front' && d) {
      shiftInfluence(s, d.id, 'player', 4);
      changeScore(s, cr.warId, 6);
      text = `${nm(k)} held ${d.name} when ${rivalName(s, cr.rival)} came at it. Not a corner lost.`;
    } else {
      changeScore(s, cr.warId, 8);
      if (cr.rival) bumpTension(s, 'player', cr.rival, -6, `${fn(k)} found out where they were coming from`);
      text = `${nm(k)} found out where ${rivalName(s, cr.rival)} keep their guns, and when. Your men were waiting.`;
    }
  } else if (cr.k === 'heat') {
    if (s.heat.local > 8) heat(ctx, 'local', -6, `${fn(k)} took the heat for the family`, 'heat');
    addEvidence(s, k, 4);
    text = `${nm(k)} told the detectives it was his business, not the boss's.`;
  } else if (cr.k === 'money') {
    const amt = Math.min(3000, Math.round(k.wealth * 0.3 / 100) * 100);
    if (amt >= 200) {
      k.wealth -= amt;
      money(ctx, amt, `${fn(k)} put his own money in when the family was short`, 'kickup');
      text = `${nm(k)} put ${fmtMoney(amt)} of his own on your desk. "Pay me back when you can."`;
    }
  } else if (cr.k === 'jail') {
    if (d) shiftInfluence(s, d.id, 'player', 2);
    text = `${nm(k)} kept the crews in line while you were inside. Nobody moved on your chair.`;
  } else if (cr.k === 'faction') {
    const f = s.factions.find((x) => (x.stage ?? 0) >= 1);
    if (f && f.leaderId !== k.id) {
      f.memberIds = f.memberIds.filter((id) => id === f.leaderId || roll(C, 0.6));
      text = `${nm(k)} talked sense into some of ${s.characters[f.leaderId]?.firstName ?? 'the'}'s people. Not all of them will go through with it.`;
    }
  }
  if (!text) return;
  respect(ctx, 1, `${fn(k)} stood up for the family`, 'event');
  addOpinion(s, s.playerId, k.id, 'Stood by me when it counted', 15, 1);
  addStory(s, k, text);
  ctx.log.push(text);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
  note(s, k.id, 'save', text);
}

/** What he hears this week, and what he tells you. */
function intelWeek(ctx: Ctx, k: Character, b: CapoBook): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  // Old news goes stale; news the boss has learned elsewhere goes too.
  b.intel = b.intel.filter((i) => s.week - i.w <= 16 && !(i.k === 'secret' && s.secrets.find((x) => x.id === i.ref)?.knownBy.includes('player')));
  if (roll(C, 0.3 + gripOf(s, k).v / 400)) {
    const have = new Set(b.intel.map(intelKey));
    const fresh = streetTruths(s, k).filter((x) => !have.has(intelKey(x)) && !C.reports.some((r) => r.capo === k.id && r.truth === x.truth && s.week - r.w < 16));
    const i = pickC(C, fresh);
    if (i) {
      b.intel.push({ ...i, id: nid(C, 'ci'), w: s.week });
      if (b.intel.length > INTEL_CAP) b.intel = b.intel.slice(-INTEL_CAP);
    }
  }
  const untold = b.intel.find((i) => !i.told);
  if (untold && roll(C, b.st === 'loyal' ? 0.8 : 0.5)) report(ctx, k, untold);
}

/** Old slants and silences come out. */
function revealWeek(s: GameState): void {
  const C = ensureCapos(s);
  for (const r of C.reports) {
    if (r.kind === 'honest' || r.rev !== undefined) continue;
    const b = C.books[r.capo];
    // The secret came out some other way.
    if (r.k === 'secret' && s.secrets.some((x) => x.text === r.truth && x.knownBy.includes('player'))) { reveal(s, r, 'You found out another way'); continue; }
    const p = 0.02 + ((b?.watch ?? -1) >= s.week ? 0.12 : 0) + Math.min(0.06, (s.week - r.w) * 0.003);
    if (roll(C, p)) reveal(s, r, (b?.watch ?? -1) >= s.week ? 'The man you put on him' : 'It came out on the street');
  }
}

/* ------------------------------------------------------------------ */
/* Grooming                                                            */
/* ------------------------------------------------------------------ */

/** Weeks a stage takes under this capo. */
export function groomWeeks(k: Character, st: number): number {
  return Math.max(3, Math.round((GROOM_WEEKS[st] ?? 6) * (1.3 - k.attributes.leadership / 200)));
}

function groomWeek(ctx: Ctx): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  // Tracks that ended: made, gone, moved to another crew.
  C.groom = C.groom.filter((g) => {
    const m = s.characters[g.id];
    const k = isCapo(s, g.capo);
    if (!m?.alive || m.faction !== 'player' || !k) return false;
    if (m.rank !== 'associate') {
      if (m.rank === 'soldier') { C.stats.groomed++; note(s, k.id, 'groom', `${fn(m)} got his button: ${fn(k)} brought him all the way.`); }
      return false;
    }
    return m.capoId === k.id;
  });
  // Each capo brings one or two along.
  for (const k of capos(s)) {
    if (!isFree(s, k) || k.id === s.playerId) continue;
    const mine = C.groom.filter((g) => g.capo === k.id).length;
    if (mine >= GROOM_CAP) continue;
    const cands = regime(s, k.id).filter((m) => m.rank === 'associate' && isFree(s, m) && !C.groom.some((g) => g.id === m.id))
      .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
    for (const m of cands.slice(0, GROOM_CAP - mine)) C.groom.push({ id: m.id, capo: k.id, st: 0, w: s.week, sw: s.week, xp: 0 });
  }
  for (const g of C.groom) {
    const m = s.characters[g.id];
    const k = s.characters[g.capo];
    if (!m || !k || !isFree(s, m) || !isFree(s, k)) continue;
    if (g.st >= 3) continue;
    const what = ['Errands', 'Jobs', 'Trusted work'][g.st];
    const n = grantXp(s, m.id, 2 + g.st + Math.round(k.attributes.leadership / 40), `${what} for ${fn(k)}`);
    g.xp += n;
    addOpinion(s, m.id, k.id, 'Brought me along', 1 + (hasTrait(k, 'Charming') || hasTrait(k, 'Patient') ? 1 : 0), 1);
    if (s.week - g.sw < groomWeeks(k, g.st)) continue;
    // Trust has to be earned both ways before a capo vouches.
    if (g.st === 2 && (opinion(s, m.id, k.id) < 20 || (m.evidence ?? 0) >= 55 || m.informantFor && roll(C, 0.5))) continue;
    g.st = (g.st + 1) as typeof g.st;
    g.sw = s.week;
    addStory(s, m, `${fn(k)} moved him up: ${GROOM_STAGES[g.st].toLowerCase()}.`);
    note(s, k.id, 'groom', `${fn(k)} moved ${fn(m)} up: ${GROOM_STAGES[g.st].toLowerCase()}.`);
    if (g.st === 3) fileRequest(s, k, { k: 'make', who: m.id, y: `${fn(m)} is ready. I'll stand for him. Put his name up.` });
  }
}

function score(m: Character): number {
  const a = m.attributes;
  return a.leadership + a.business + a.force + (hasTrait(m, 'Ambitious') ? 15 : 0) - (m.evidence ?? 0) / 2;
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

function fileRequest(s: GameState, k: Character, r: Omit<CapoRequest, 'id' | 'capo' | 'w'>): CapoRequest | undefined {
  const C = ensureCapos(s);
  if (C.req.some((x) => !x.ans && x.capo === k.id && x.k === r.k && (x.who === r.who || r.k !== 'make'))) return undefined;
  const q: CapoRequest = { id: nid(C, 'rq'), capo: k.id, w: s.week, ...r };
  C.req.push(q);
  C.stats.req++;
  book(s, k.id).req = s.week;
  if (C.req.length > REQ_CAP) {
    const settled = C.req.filter((x) => x.ans);
    C.req = [...C.req.filter((x) => !x.ans), ...settled.slice(-Math.max(0, REQ_CAP - C.req.filter((x) => !x.ans).length))];
  }
  note(s, k.id, 'request', `${fn(k)}: "${r.y}"`);
  return q;
}

/** How many men he wants, for the ground he holds. */
export function crewTarget(s: GameState, k: Character): number {
  return 3 + Math.floor(gripOf(s, k).v / 30) + (hasTrait(k, 'Ambitious') ? 1 : 0);
}

/**
 * A capo wants men: he names a man and asks (regimes.ts calls this instead of
 * bringing a kid in on his own). Returns true if a request was filed.
 */
export function capoWantsMen(ctx: Ctx, k: Character): boolean {
  const s = ctx.s;
  if (!s.capos) return false;
  const C = ensureCapos(s);
  if (C.req.some((x) => !x.ans && x.capo === k.id && (x.k === 'men' || x.k === 'transfer'))) return true;
  const have = regime(s, k.id).length;
  const want = crewTarget(s, k) - have;
  if (want <= 0) return true;
  const d = districtOf(s, k)?.name ?? 'my corners';
  const howMany = want >= 3 ? 'three more guys' : want === 2 ? 'two more guys' : 'one more guy';
  // Somebody else's man who would rather be with him.
  const poach = crew(s).filter((m) => m.capoId && m.capoId !== k.id && m.rank !== 'capo' && isFree(s, m) && (m.rank === 'associate' || m.rank === 'soldier') && opinion(s, m.id, k.id) > opinion(s, m.id, m.capoId) + 5)
    .sort((a, b) => opinion(s, b.id, k.id) - opinion(s, a.id, k.id) || a.id.localeCompare(b.id))[0];
  if (poach && roll(C, 0.3)) {
    const from = s.characters[poach.capoId!];
    fileRequest(s, k, { k: 'transfer', who: poach.id, from: poach.capoId, y: `I need ${howMany} on ${d}. ${fn(poach)} is wasted with ${from ? fn(from) : 'his crew'}: give him to me.` });
    return true;
  }
  // An outside guy he already uses: bring him in.
  const out = Object.values(s.characters).filter((c) => c.alive && c.outside && c.faction === 'none' && c.capoId === k.id && (c.outside === 'runner' || c.outside === 'bookie' || c.outside === 'fence') && c.gender === 'M')
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (out && roll(C, 0.35)) {
    fileRequest(s, k, { k: 'men', who: out.id, y: `I need ${howMany} on ${d}. ${fn(out)} has been working with us for months: let me bring him in.` });
    return true;
  }
  // A kid off the street.
  const kid = makeCharacter(s, { rank: 'civilian', faction: 'none', age: 18 + Math.floor(r01(C) * 9) });
  giveBio(s, kid);
  fileRequest(s, k, { k: 'men', who: kid.id, y: `I need ${howMany} on ${d}. There's a kid, ${nm(kid)}, hangs around the corner: hungry, keeps his mouth shut. Let me bring him along.` });
  return true;
}

function requestsWeek(ctx: Ctx, k: Character, b: CapoBook): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  if (s.week - (b.req ?? -99) < 4) return;
  // A rival on his corners: the call is the boss's.
  const d = districtOf(s, k);
  const r = rivalNear(s, k);
  if (d && r && (d.influence[r] ?? 0) >= 12 && !s.wars.some((w) => w.rival === r) && roll(C, (hasTrait(k, 'Hot-headed') || hasTrait(k, 'Ambitious') ? 0.12 : 0.05))) {
    fileRequest(s, k, { k: 'street', rival: r, d: d.id, y: `${rivalName(s, r)}'s guys are on my corners in ${d.name}. Say the word and I run them off.` });
  }
}

/** Requests nobody answered: the capo does what a capo does. */
function lapseRequests(ctx: Ctx): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  for (const q of C.req) {
    if (q.ans) continue;
    const k = isCapo(s, q.capo);
    const m = q.who ? s.characters[q.who] : undefined;
    if (!k || (q.who && !m?.alive)) { q.ans = 'no'; q.aw = s.week; continue; }
    if (q.k === 'make' && (m?.rank !== 'associate' || m?.proposedWeek !== undefined)) { q.ans = 'yes'; q.aw = s.week; continue; }
    if (q.k === 'transfer' && (m?.faction !== 'player' || m?.capoId !== q.from)) { q.ans = 'no'; q.aw = s.week; continue; }
    // A kid off the street waits two weeks for the boss's word; anything else, five.
    if (s.week - q.w < (q.k === 'men' && m?.faction === 'none' ? 2 : 5)) continue;
    // Silence: a kid off the street he brings in himself; a transfer lapses; a street call is his own.
    if (q.k === 'men' && m && m.faction === 'none') {
      bringIn(s, k, m, 'Brought in on his own when the boss never answered');
      q.ans = 'yes';
    } else if (q.k === 'street') {
      q.ans = 'later';
      if (hasTrait(k, 'Hot-headed')) streetCall(ctx, k, q, 'yes', true);
    } else if (q.k === 'make') {
      // The name waits for the boss's word (only he decides who is put up); the capo feels the wait.
      if (s.week - q.w >= 12 && !q.sl) { q.sl = 1; slight(s, k, 'Never answered about my man', 1); }
      continue;
    } else {
      q.ans = 'later';
      slight(s, k, 'Ignored my request', 0.5);
    }
    q.aw = s.week;
  }
}

function bringIn(s: GameState, k: Character, m: Character, why: string): void {
  if (m.faction === 'none') {
    // One name per crew: an outside guy's street name may already be taken in the family.
    if (m.nickname && usedNicknames(s, 'player').has(m.nickname)) m.nickname = pickNickname(s, 'player');
    m.faction = 'player';
    m.rank = 'associate';
    m.outside = undefined;
    giveBio(s, m);
    // A kid nobody checked may be somebody else's (rivalcrew.ts plants).
    maybePlant(s, m);
  }
  assignTo(s, m, k.id, `${why}: ${fn(k)}'s crew.`);
  addOpinion(s, m.id, k.id, 'Gave me my chance', 15, 1);
  addOpinion(s, m.id, s.playerId, 'The boss let me in', 4, 1);
  addStory(s, k, `Brought ${nm(m)} into his crew.`);
}

function slight(s: GameState, k: Character, why: string, n: number): void {
  const b = book(s, k.id);
  b.sl += n;
  addOpinion(s, k.id, s.playerId, why, -Math.round(3 * n) || -1, 1);
  const m = mindOf(s, k.id);
  if (m) remember(m, { w: s.week, k: 'slight', who: s.playerId, t: why.toLowerCase(), v: -Math.round(6 * n) });
}

function reward(s: GameState, k: Character, why: string, n: number, op = 0): void {
  const b = book(s, k.id);
  b.rw += n;
  if (op) addOpinion(s, k.id, s.playerId, why, op, 1);
  const m = mindOf(s, k.id);
  if (m) remember(m, { w: s.week, k: 'favor', who: s.playerId, t: why.toLowerCase(), v: Math.round(5 * n) });
}

/** A man the boss can send a capo instead (redirect): one reporting to nobody, or a kid off the street. */
export function redirectOptions(s: GameState, q: CapoRequest): Character[] {
  return crew(s).filter((m) => (m.rank === 'associate' || m.rank === 'soldier') && !m.specialty && isFree(s, m) && m.id !== q.who && (!m.capoId || !isCapo(s, m.capoId)))
    .slice(0, 4);
}

function streetCall(ctx: Ctx, k: Character, q: CapoRequest, a: ReqAnswer, own = false): void {
  const s = ctx.s;
  const d = s.districts.find((x) => x.id === q.d);
  const r = q.rival;
  if (!d || !r) return;
  if (a === 'yes') {
    const got = shiftInfluence(s, d.id, 'player', 4);
    heat(ctx, 'local', 2, `${fn(k)} ran ${rivalName(s, r)} off his corners in ${d.name}`, 'heat');
    bumpTension(s, 'player', r, 10, `${fn(k)}'s crew ran their guys off ${d.name}`);
    addStory(s, k, `Ran ${rivalName(s, r)}'s guys off ${d.name}${own ? ' on his own' : ' with the boss\'s word'}.`);
    note(s, k.id, 'street', `${fn(k)} ran ${rivalName(s, r)} off ${d.name}${got ? ` (+${got}%)` : ''}${own ? ' on his own' : ''}.`);
    if (!own) reward(s, k, 'Let me handle my corners', 0.5, 3);
  } else if (a === 'no') {
    bumpTension(s, 'player', r, -5, 'You sat down instead of fighting');
    shiftInfluence(s, d.id, 'player', -1);
    if (hasTrait(k, 'Hot-headed') || hasTrait(k, 'Ambitious')) slight(s, k, 'Made me look soft on my own corners', 1);
  } else if (a === 'redirect') {
    shiftInfluence(s, d.id, 'player', 1);
    note(s, k.id, 'street', `${fn(k)} held his corners in ${d.name}, no blood.`);
  }
}

/* ------------------------------------------------------------------ */
/* The capos' popups (one candidate a week into the one pipeline)       */
/* ------------------------------------------------------------------ */

const capoFx = (op: CapoOp, label?: string): Effect => ({ type: 'capo', op, ...(label ? { label } : {}) } as Effect);

function ch(id: string, label: string, detail: string, because: string, effects: Effect[]): Choice {
  return { id, label, detail, because, effects };
}

export function buildRequestEvent(s: GameState, q: CapoRequest): EventInstance | undefined {
  const r = requestChoices(s, q);
  if (!r) return undefined;
  return { iid: `ev${s.nextId++}`, ...r };
}

/** The request as a decision (pure: previews read it too). */
export function requestChoices(s: GameState, q: CapoRequest): Omit<EventInstance, 'iid'> | undefined {
  const k = isCapo(s, q.capo);
  if (!k) return undefined;
  const m = q.who ? s.characters[q.who] : undefined;
  const d = districtOf(s, k);
  const choices: Choice[] = [];
  let title = `${fn(k)} wants a word`;
  let text = `"${q.y}"`;
  if (q.k === 'men' && m) {
    title = `${fn(k)} needs men on ${d?.name ?? 'his corners'}`;
    text += ` ${fn(m)}: ${m.faction === 'none' ? (m.outside ? `an outside guy (${m.outside}) who already works with his crew` : 'a kid off the street, not with anybody') : 'one of yours'}. Not made, not proposed: an associate in ${fn(k)}'s crew, his to bring along.`;
    choices.push(ch('yes', `Let him bring ${fn(m)} in`, `${fn(m)} joins ${fn(k)}'s crew as an associate. ${fn(k)} grooms him: errands, jobs, trust.`, `let ${fn(k)} bring ${fn(m)} in`, [capoFx({ op: 'answer', req: q.id, a: 'yes' })]));
    const alt = redirectOptions(s, q)[0];
    if (alt) choices.push(ch('redirect', `Give him ${fn(alt)} instead`, `${fn(alt)} reports to nobody: he goes to ${fn(k)}. The kid stays on the street.`, `sent ${fn(k)} ${fn(alt)} instead`, [capoFx({ op: 'answer', req: q.id, a: 'redirect', alt: alt.id })]));
    choices.push(ch('no', 'No. Not now', `${fn(k)} takes it as a slight, a small one.`, `turned ${fn(k)} down`, [capoFx({ op: 'answer', req: q.id, a: 'no' })]));
  } else if (q.k === 'transfer' && m) {
    const from = q.from ? s.characters[q.from] : undefined;
    title = `${fn(k)} wants ${fn(m)} from ${from ? `${fn(from)}'s` : 'another'} crew`;
    text += ` ${from ? `${fn(from)} will not like losing him.` : ''} ${fn(m)} thinks more of ${fn(k)} than of his own capo.`;
    choices.push(ch('yes', `Move ${fn(m)} to ${fn(k)}`, `${from ? `${fn(from)} takes it badly (him and ${fn(k)} both). ` : ''}${fn(m)} is glad.`, `moved ${fn(m)} to ${fn(k)}'s crew`, [capoFx({ op: 'answer', req: q.id, a: 'yes' })]));
    choices.push(ch('redirect', 'Find your own on the street', `No friction between your crews: ${fn(k)} gets a kid off the street instead.`, `told ${fn(k)} to find his own`, [capoFx({ op: 'answer', req: q.id, a: 'redirect' })]));
    choices.push(ch('no', `${fn(m)} stays where he is`, `${fn(k)} takes it as a slight.`, `kept ${fn(m)} with ${from ? fn(from) : 'his capo'}`, [capoFx({ op: 'answer', req: q.id, a: 'no' })]));
  } else if (q.k === 'make' && m) {
    const books = s.books?.open ? `The books are open (${s.books.slots} place${s.books.slots === 1 ? '' : 's'}).` : 'The books are closed: his name waits for Philadelphia.';
    title = `${fn(k)} wants ${fn(m)} made`;
    text += ` ${fn(k)} has brought him along for months: he is loyal to ${fn(k)} first. ${books}`;
    choices.push(ch('yes', `Put ${fn(m)}'s name up`, `$500 envelope to Philadelphia; ${fn(k)} vouches (and answers for him if he goes bad).`, `put ${fn(m)}'s name up on ${fn(k)}'s word`, [{ type: 'money', amount: -500, label: `${fn(m)}'s name to Philadelphia` }, capoFx({ op: 'answer', req: q.id, a: 'yes' })]));
    choices.push(ch('no', 'Not yet', `Back to trusted work. ${fn(k)} and ${fn(m)} both feel it.`, `told ${fn(k)} not yet about ${fn(m)}`, [capoFx({ op: 'answer', req: q.id, a: 'no' })]));
  } else if (q.k === 'street' && q.rival) {
    title = `${fn(k)}: ${rivalName(s, q.rival)} on ${d?.name ?? 'his corners'}`;
    text += ' His ground, your call: a push means heat and a sore rival.';
    choices.push(ch('yes', 'Run them off', 'More of the district; some heat; tension with them.', `let ${fn(k)} run ${rivalName(s, q.rival)} off`, [capoFx({ op: 'answer', req: q.id, a: 'yes' })]));
    choices.push(ch('redirect', 'Hold the corners, no blood', 'He holds what he has. No heat.', `told ${fn(k)} to hold, no blood`, [capoFx({ op: 'answer', req: q.id, a: 'redirect' })]));
    choices.push(ch('no', 'Sit down with them instead', 'Less tension; a corner given up; a hothead capo feels it.', `sat down with ${rivalName(s, q.rival)}`, [capoFx({ op: 'answer', req: q.id, a: 'no' })]));
  }
  if (!choices.length) return undefined;
  choices.push(ch('later', 'Let me think about it', 'He waits. Not forever.', `told ${fn(k)} to wait`, [capoFx({ op: 'answer', req: q.id, a: 'later' })]));
  return {
    defId: `capo_${q.k}`, title, text, week: s.week, choices, defaultChoiceId: 'later', mandatory: false, priority: q.k === 'make' ? 44 : 40,
    meta: { charId: k.id, crew: 1, theme: 'crew', capoReq: q.id }, actors: [k.id, ...(m ? [m.id] : [])].slice(0, 3),
  };
}

function buildPlotEvent(s: GameState, k: Character, b: CapoBook): EventInstance {
  const p = b.plot!;
  const signs = b.signs.filter((x) => BAD_SIGNS.includes(x.k)).slice(-2).map((x) => x.t);
  const what = p.k === 'defect' ? `has been meeting ${rivalName(s, p.rival)}: a place for him and his crew over there` : p.k === 'fbi' ? 'has been seen getting into a car with two men in gray suits' : 'has been counting votes among the capos';
  const choices: Choice[] = [
    ch('confront', 'Have it out with him', 'He comes back to you, or he lies, or he walks. His odds show when you pick it from his card.', `confronted ${fn(k)}`, [capoFx({ op: 'confront', capo: k.id })]),
    ch('buyback', 'Bring him back: $2,000 and a better word', 'An envelope and your respect, before he goes too far.', `brought ${fn(k)} back with an envelope`, [{ type: 'money', amount: -2000, label: `${fn(k)}: an envelope to bring him back` }, capoFx({ op: 'buyback', capo: k.id, amount: 2000 })]),
    ch('watch', 'Put a guy on him, say nothing', 'You watch who he sees. He does not know you know.', `put a man on ${fn(k)}`, [capoFx({ op: 'watch', capo: k.id })]),
    ch('nothing', 'Do nothing yet', 'It keeps going.', `let ${fn(k)} be`, []),
  ];
  return {
    iid: `ev${s.nextId++}`, defId: 'capo_plot', title: `${fn(k)} ${p.k === 'defect' ? 'is talking to the other side' : p.k === 'fbi' ? 'may be talking' : 'is counting votes'}`,
    text: `Word reached you: ${nm(k)} ${what}.${signs.length ? ` And you had noticed: ${signs.join('; ')}.` : ''}`,
    week: s.week, choices, defaultChoiceId: 'nothing', mandatory: false, priority: 58, meta: { charId: k.id, crew: 1, theme: 'crew', asked: 1, capoPlot: 1 }, actors: [k.id],
  };
}

function buildReportEvent(s: GameState, k: Character, r: CapoReport): EventInstance | undefined {
  const about = r.about ? s.characters[r.about] : undefined;
  const choices: Choice[] = [
    ch('thank', `Thank ${fn(k)}`, 'He brought it to you: that is what a capo is for.', `thanked ${fn(k)} for the word`, [capoFx({ op: 'thank', capo: k.id, report: r.id })]),
    ch('doubt', 'Have it checked', `You put a man on it. ${fn(k)} notices you didn't take his word.`, `had ${fn(k)}'s word checked`, [capoFx({ op: 'doubt', capo: k.id, report: r.id })]),
  ];
  return {
    iid: `ev${s.nextId++}`, defId: 'capo_word', title: `${fn(k)} has something from the street`, text: `"${r.told}." — ${nm(k)}.`,
    week: s.week, choices, defaultChoiceId: 'thank', mandatory: false, priority: 38, meta: { charId: k.id, crew: 1, theme: 'crew', capoReport: r.id }, actors: [k.id, ...(about && about.id !== k.id ? [about.id] : [])],
  };
}

/** The week's one candidate from the capos: a known plot, a request, or the word from the street. */
export function capoEventSource(s: GameState): EventInstance | undefined {
  const C = s.capos;
  if (!C || s.gameOver) return undefined;
  // A plot the boss has found out about, not yet put to him.
  for (const [id, b] of Object.entries(C.books)) {
    const k = isCapo(s, id);
    if (k && b.plot?.known && b.plot.known >= s.week - 1 && !s.pendingEvents.some((e) => e.meta?.charId === id && e.defId === 'capo_plot')) return buildPlotEvent(s, k, b);
  }
  const open = C.req.filter((q) => !q.ans && s.week - (q.shown ?? -99) >= 3).sort((a, b) => (a.k === 'make' ? 0 : 1) - (b.k === 'make' ? 0 : 1) || a.w - b.w);
  for (const q of open) {
    const ev = buildRequestEvent(s, q);
    if (ev) { q.shown = s.week; return ev; }
  }
  const r = C.reports.filter((x) => x.w >= s.week - 1 && x.kind !== 'withheld' && (x.k === 'rat' || x.k === 'hedge' || x.k === 'rival' || x.k === 'courted')).pop();
  const k = r ? isCapo(s, r.capo) : undefined;
  if (r && k) return buildReportEvent(s, k, r);
  return undefined;
}

/* ------------------------------------------------------------------ */
/* The capo Effect (answers to the popups, and the boss's orders)       */
/* ------------------------------------------------------------------ */

export function describeCapoOp(s: GameState, o: CapoOp): string | undefined {
  const k = 'capo' in o ? s.characters[o.capo] : s.characters[s.capos?.req.find((q) => q.id === o.req)?.capo ?? ''];
  const who = k ? fn(k) : 'the capo';
  switch (o.op) {
    case 'answer': return o.a === 'later' ? `${who} waits for your answer` : `Your answer to ${who}: ${o.a === 'yes' ? 'yes' : o.a === 'no' ? 'no' : 'someone else'}`;
    case 'watch': return `A man on ${who} for eight weeks`;
    case 'thank': return `${who} hears you took his word`;
    case 'doubt': return `${who}'s word gets checked`;
    case 'confront': return `You have it out with ${who}`;
    case 'buyback': return `${who} gets an envelope and your word`;
  }
  return undefined;
}

export function applyCapoOp(ctx: Ctx, o: CapoOp): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  switch (o.op) {
    case 'answer': answer(ctx, o.req, o.a, o.alt); break;
    case 'watch': {
      const k = isCapo(s, o.capo);
      if (k) { book(s, k.id).watch = s.week + 8; note(s, k.id, 'counter', `You put a man on ${fn(k)}.`); }
      break;
    }
    case 'thank': {
      const k = isCapo(s, o.capo);
      if (k) reward(s, k, 'The boss takes my word', 0.5, 2);
      break;
    }
    case 'doubt': {
      const k = isCapo(s, o.capo);
      const r = C.reports.find((x) => x.id === o.report);
      if (k) {
        addOpinion(s, k.id, s.playerId, 'Doubted my word', -2, 1);
        if (r && r.kind !== 'honest' && roll(C, 0.6)) reveal(s, r, 'You had it checked');
        if (r?.kind === 'honest' && r.about) { const sec = s.secrets.find((x) => x.ownerId === r.about && x.knownBy.includes('player')); if (sec) note(s, k.id, 'intel', `Checked: ${fn(k)} told it straight.`); }
      }
      break;
    }
    case 'confront': {
      const k = isCapo(s, o.capo);
      if (k) confront(ctx, k);
      break;
    }
    case 'buyback': {
      const k = isCapo(s, o.capo);
      if (!k) break;
      k.wealth += o.amount;
      const b = book(s, k.id);
      reward(s, k, 'The boss made it right with me', 2, 10);
      b.tide = Math.min(100, b.tide + 20);
      if (b.plot && b.plot.st < 2 && roll(C, 0.7)) { b.plot = undefined; C.stats.foiled++; note(s, k.id, 'counter', `${fn(k)} took the envelope and came back to you.`); }
      break;
    }
  }
}

/** The boss's answer to a request. */
function answer(ctx: Ctx, id: string, a: ReqAnswer, alt?: string): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  const q = C.req.find((x) => x.id === id);
  if (!q || q.ans) return;
  const k = isCapo(s, q.capo);
  if (!k) { q.ans = 'no'; q.aw = s.week; return; }
  if (a === 'later') { q.shown = s.week; return; }
  const m = q.who ? s.characters[q.who] : undefined;
  q.ans = a;
  q.aw = s.week;
  if (a === 'yes') C.stats.yes++; else if (a === 'no') C.stats.no++; else C.stats.redirect++;
  switch (q.k) {
    case 'men': {
      if (a === 'yes' && m?.alive && (m.faction === 'none' || m.faction === 'player')) {
        bringIn(s, k, m, 'Brought in with the boss\'s word');
        reward(s, k, 'Gave me the men I asked for', 1, 4);
      } else if (a === 'redirect') {
        const x = alt ? s.characters[alt] : redirectOptions(s, q)[0];
        if (x?.alive && x.faction === 'player') {
          assignTo(s, x, k.id, `The boss sent him to ${fn(k)}'s crew.`);
          reward(s, k, 'Gave me a man', 0.5, 2);
        }
      } else if (a === 'no') slight(s, k, 'Turned down my request', hasTrait(k, 'Hot-headed') || hasTrait(k, 'Ambitious') ? 1.5 : 1);
      break;
    }
    case 'transfer': {
      const from = q.from ? isCapo(s, q.from) : undefined;
      if (a === 'yes' && m?.alive && m.faction === 'player') {
        assignTo(s, m, k.id, `The boss moved him to ${fn(k)}'s crew.`);
        addOpinion(s, m.id, k.id, 'Wanted me in his crew', 6, 1);
        reward(s, k, 'Gave me the man I asked for', 1, 5);
        if (from) {
          slight(s, from, `Gave my man to ${fn(k)}`, 1.5);
          addOpinion(s, from.id, k.id, 'Took my man', -10, 1);
        }
      } else if (a === 'redirect') {
        const kid = makeCharacter(s, { rank: 'associate', faction: 'player', age: 18 + Math.floor(r01(C) * 8) });
        giveBio(s, kid);
        bringIn(s, k, kid, 'Found on the street when the boss said find your own');
      } else if (a === 'no') slight(s, k, 'Kept a man from me', 1);
      break;
    }
    case 'make': {
      const g = C.groom.find((x) => x.id === q.who);
      if (a === 'yes' && m?.alive && m.rank === 'associate') {
        applyEffects(ctx, [{ type: 'propose', charId: m.id, voucherId: k.id }], { label: `${fn(m)}'s name goes up`, because: `put ${fn(m)}'s name up on ${fn(k)}'s word`, category: 'event' });
        if (g) { g.st = 4; g.sw = s.week; }
        C.stats.proposed++;
        reward(s, k, 'Put my man\'s name up', 1, 5);
        addOpinion(s, m.id, s.playerId, 'Put my name up', 6, 1);
      } else if (a === 'no') {
        if (g) { g.st = 2; g.sw = s.week; }
        slight(s, k, 'Turned my man down', 1);
        if (m) addOpinion(s, m.id, s.playerId, 'The boss said not yet', -5, 1);
      }
      break;
    }
    case 'street': streetCall(ctx, k, q, a); break;
  }
}

/** The boss has it out with him. */
function confront(ctx: Ctx, k: Character): void {
  const s = ctx.s;
  const C = ensureCapos(s);
  const b = book(s, k.id);
  const odds = confrontOdds(s, k);
  const x = r01(C);
  const tier = x < odds.crit ? 'crit' : x < odds.crit + odds.success ? 'success' : x < odds.crit + odds.success + odds.fail ? 'fail' : 'critFail';
  b.asked = s.week;
  if (tier === 'crit' || tier === 'success') {
    if (b.plot) { b.plot = undefined; C.stats.foiled++; }
    b.tide = Math.min(100, Math.max(b.tide, 0) + 20);
    b.hedge = 0;
    k.courtedBy = undefined;
    changeMeter(s, k.id, s.playerId, 'fear', tier === 'crit' ? 20 : 12);
    addOpinion(s, k.id, s.playerId, 'Called me on it, and gave me another chance', tier === 'crit' ? 8 : 3, 1);
    for (const r of C.reports.filter((y) => y.capo === k.id && y.kind !== 'honest' && y.rev === undefined)) reveal(s, r, 'He came clean');
    if (tier === 'crit') for (const i of b.intel.filter((y) => !y.told)) report(ctx, k, i, true);
    note(s, k.id, 'counter', tier === 'crit' ? `${fn(k)} broke down and told you everything. He is yours again.` : `${fn(k)} swore on his mother. He is back in line.`);
    ctx.log.push(`You had it out with ${nm(k)}: ${tier === 'crit' ? 'he told you everything' : 'he is back in line'}.`);
  } else if (tier === 'fail') {
    addOpinion(s, k.id, s.playerId, 'Accused me', -8, 1);
    b.sl += 1;
    if (b.plot && b.plot.st < 2) { b.plot.st++; b.plot.sw = s.week; }
    note(s, k.id, 'counter', `${fn(k)} denied everything, and looked you in the eye doing it.`);
    ctx.log.push(`You had it out with ${nm(k)}: he denied everything.`);
  } else {
    // He walks out, now (his choice; nobody is handed over).
    ctx.log.push(`You had it out with ${nm(k)}: he walked out of the room.`);
    if (b.plot || b.st === 'turning') {
      b.plot = { k: 'defect', rival: b.plot?.rival ?? rivalNear(s, k), st: 2, w: s.week, sw: s.week - 2, known: s.week };
      carryOut(ctx, k, b);
    } else {
      addOpinion(s, k.id, s.playerId, 'Treated me like a rat', -20, 1);
      b.sl += 2;
    }
  }
}

/** The odds of having it out with him (the four ends). */
export function confrontOdds(s: GameState, k: Character): { crit: number; success: number; fail: number; critFail: number; reasons: Reason[] } {
  const b = s.capos?.books[k.id];
  const op = opinion(s, k.id, s.playerId);
  const fear = getRelation(s, k.id, s.playerId)?.fear ?? 0;
  const reasons: Reason[] = [
    { label: 'Base', value: 45 },
    { label: 'What he thinks of you', value: Math.round(op / 3) },
    { label: 'He fears you', value: Math.round(fear / 4) },
  ];
  if (b?.plot) reasons.push({ label: 'He is in deep', value: -10 * (b.plot.st + 1) });
  if (b?.tied) reasons.push({ label: 'Family now', value: 15 });
  if (hasTrait(k, 'Honest')) reasons.push({ label: 'Honest', value: 10 });
  if (hasTrait(k, 'Hot-headed')) reasons.push({ label: 'Hot-headed', value: -10 });
  if (hasTrait(k, 'Cowardly')) reasons.push({ label: 'Cowardly', value: 10 });
  if (isSchemer(k)) reasons.push({ label: 'A schemer', value: -8 });
  const ok = clamp(reasons.reduce((a, r) => a + r.value, 0), 5, 92) / 100;
  const critFail = b?.plot || b?.st === 'turning' ? clamp(0.25 - ok * 0.2, 0.03, 0.25) : 0.03;
  const crit = ok * 0.25;
  const success = ok - crit;
  return { crit, success, fail: Math.max(0, 1 - ok - critFail), critFail, reasons };
}

/** Will he tell you straight when you ask what he hears? */
export function askOdds(s: GameState, k: Character): Acceptance {
  const b = s.capos?.books[k.id];
  const op = opinion(s, k.id, s.playerId);
  const trust = getRelation(s, k.id, s.playerId)?.trust ?? 0;
  const reasons: Reason[] = [
    { label: 'Base', value: 50 },
    { label: 'What he thinks of you', value: Math.round(op / 2) },
    { label: 'He trusts you', value: Math.round(trust / 4) },
  ];
  if (hasTrait(k, 'Honest')) reasons.push({ label: 'Honest', value: 15 });
  if (hasTrait(k, 'Loyal-to-a-fault')) reasons.push({ label: 'Loyal to a fault', value: 20 });
  if (isSchemer(k)) reasons.push({ label: 'Keeps his cards close', value: -10 });
  if (b && (b.st === 'hedging' || b.st === 'turning')) reasons.push({ label: 'Something makes him cagey', value: b.st === 'turning' ? -30 : -15 });
  if (b?.tied) reasons.push({ label: 'Family now', value: 10 });
  if (b?.asked !== undefined && s.week - b.asked < 6) reasons.push({ label: 'You asked him not long ago', value: -15 });
  const v = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: clamp(v / 100, 0.05, 0.95), reasons: reasons.filter((r) => r.value !== 0) };
}

/* ------------------------------------------------------------------ */
/* The boss's orders                                                   */
/* ------------------------------------------------------------------ */

function kinMatch(s: GameState, k: Character): { ours: Character; theirs: Character } | undefined {
  const theirs = [k, ...k.childrenIds.map((id) => s.characters[id])].filter((c): c is Character => !!c?.alive && !c.spouseId && !c.dynasty);
  for (const t of theirs) {
    const ours = ourMarriageable(s).find((o) => o.gender !== t.gender && o.id !== s.playerId);
    if (ours) return { ours, theirs: t };
  }
  return undefined;
}

export function previewCapo(s: GameState, a: CapoAction): ActionPreview {
  const base = { effects: [] as Effect[], cost: 0, category: 'event' as const };
  if (a.op === 'answer') {
    const q = s.capos?.req.find((x) => x.id === a.req);
    const k = q ? isCapo(s, q.capo) : undefined;
    const why = !q ? 'No such request' : q.ans ? 'Already answered' : !k ? 'He is not a capo now' : undefined;
    const ev = q && k ? requestChoices(s, q) : undefined;
    const c = ev?.choices.find((x) => x.id === a.a);
    return { ...base, title: c ? `${k ? fn(k) : ''}: ${c.label}` : 'Answer a capo', detail: c?.detail, effects: c ? c.effects.filter((e) => e.type !== 'capo') : [], cost: c?.effects.reduce((x, e) => x + (e.type === 'money' && e.amount < 0 ? -e.amount : 0), 0) ?? 0, because: c?.because ?? 'answered a capo', disabledReason: why ?? (c ? undefined : 'Not an answer to this request') };
  }
  const k = isCapo(s, a.capo);
  if (!k) return { ...base, title: 'Your capo', because: 'dealt with a capo', disabledReason: 'Not one of your capos' };
  const b = s.capos?.books[k.id];
  switch (a.op) {
    case 'reward': {
      const amt = Math.max(100, Math.round(a.amount / 100) * 100);
      return { ...base, title: `An envelope for ${fn(k)}: ${fmtMoney(amt)}`, detail: 'For doing right on his corners. He remembers who looks after him.', effects: [{ type: 'money', amount: -amt, label: `An envelope for ${fn(k)}` }, { type: 'wealth', charId: k.id, amount: amt }, { type: 'opinion', from: k.id, to: s.playerId, amount: Math.min(15, Math.round(amt / 250) + 3), reason: 'The boss looked after me', decay: 1 }], cost: amt, because: `gave ${fn(k)} an envelope`, disabledReason: amt > s.money ? `Needs ${fmtMoney(amt)}` : undefined };
    }
    case 'recognize':
      return { ...base, title: `Recognize ${fn(k)} in front of the capos`, detail: 'A toast at the Saturday table. The ambitious ones notice.', effects: [{ type: 'opinion', from: k.id, to: s.playerId, amount: 8, reason: 'Recognized me in front of the capos', decay: 1 }], because: `recognized ${fn(k)} in front of the capos` };
    case 'territory': {
      const d = s.districts.find((x) => x.id === a.district);
      const other = d?.capoId ? isCapo(s, d.capoId) : undefined;
      const why = !d ? 'No such district' : (d.influence.player ?? 0) < 40 ? 'You do not hold it' : d.capoId === k.id ? 'He already runs it' : undefined;
      return { ...base, title: `Give ${fn(k)} ${d?.name ?? 'more ground'}`, detail: other ? `${fn(other)} loses it: he will not forget it.` : 'Ground nobody is running: his to run.', effects: [{ type: 'opinion', from: k.id, to: s.playerId, amount: 12, reason: 'Gave me more ground', decay: 1 }, ...(other ? [{ type: 'opinion', from: other.id, to: s.playerId, amount: -15, reason: `Gave my ground to ${fn(k)}`, decay: 1 } as Effect] : [])], because: `gave ${fn(k)} ${d?.name ?? 'ground'}`, disabledReason: why };
    }
    case 'kin': {
      const mt = kinMatch(s, k);
      const why = b?.tied ? `Already family (${b.tied.how})` : 500 > s.money ? 'Needs $500' : undefined;
      return { ...base, title: mt ? `A match: ${fn(mt.ours)} and ${fn(mt.theirs)}` : `Stand godfather to ${fn(k)}'s child`, detail: mt ? `Your ${mt.ours.gender === 'F' ? 'girl' : 'boy'} marries into ${fn(k)}'s family: he is family now, for good.` : `Compare: you hold his child at the font. He is family now, for good.`, effects: [{ type: 'money', amount: -500, label: mt ? 'The wedding' : 'The christening' }, { type: 'opinion', from: k.id, to: s.playerId, amount: 20, reason: mt ? 'Our families are joined' : 'My compare', decay: 0 }], cost: 500, because: mt ? `married into ${fn(k)}'s family` : `stood godfather to ${fn(k)}'s child`, disabledReason: why };
    }
    case 'watch':
      return { ...base, title: `Put a guy on ${fn(k)}`, detail: 'Eight weeks: who he sees, where he goes. If he is up to something, you will likely know. If he spots the tail, he will not like it.', effects: [{ type: 'money', amount: -300, label: `A man on ${fn(k)}` }], cost: 300, because: `put a man on ${fn(k)}`, disabledReason: (b?.watch ?? -1) >= s.week ? 'You already have a man on him' : 300 > s.money ? 'Needs $300' : undefined };
    case 'ask': {
      const acc = askOdds(s, k);
      return { ...base, title: `Ask ${fn(k)}: what do you hear on the street?`, detail: 'If he talks, he tells you everything he knows, and what he kept back before.', acceptance: acc, oddsLabel: 'He tells it straight', refuseEffects: [{ type: 'opinion', from: k.id, to: s.playerId, amount: -2, reason: 'Pushed me for answers', decay: 1 }], because: `asked ${fn(k)} what he hears`, disabledReason: (b?.asked ?? -99) === s.week ? 'You asked him this week' : undefined };
    }
    case 'confront': {
      const o = confrontOdds(s, k);
      const why = b?.plot?.known || (b?.signs.filter((x) => BAD_SIGNS.includes(x.k) && s.week - x.w <= 12).length ?? 0) >= 2 || (s.capos?.reports.some((r) => r.capo === k.id && r.rev !== undefined && s.week - r.rev <= 26))
        ? undefined : 'You have nothing to put to him (a few signs, a lie found out, or word of what he is doing)';
      return {
        ...base, title: `Have it out with ${fn(k)}`, detail: 'You put what you know on the table.', because: `had it out with ${fn(k)}`, disabledReason: why,
        odds: { chance: o.crit + o.success, reasons: o.reasons }, oddsLabel: 'He comes back to you',
        outcomes: [
          { tier: 'crit', label: 'Better than hoped', chance: o.crit, text: 'He breaks down, tells you everything, and is yours again.', effects: [] },
          { tier: 'success', label: 'Success', chance: o.success, text: 'He swears on his mother and gets back in line.', effects: [] },
          { tier: 'fail', label: 'Failure', chance: o.fail, text: 'He denies it and resents being asked.', effects: [] },
          { tier: 'critFail', label: 'Disaster', chance: o.critFail, text: 'He walks out of the room, and maybe out of the family.', effects: [] },
        ],
      };
    }
  }
  return { ...base, title: 'Your capo', because: 'dealt with a capo' };
}

export function commitCapo(ctx: Ctx, a: CapoAction): void {
  const s = ctx.s;
  if (a.op === 'answer') { answer(ctx, a.req, a.a, a.alt); return; }
  const k = isCapo(s, a.capo);
  if (!k) return;
  const b = book(s, k.id);
  switch (a.op) {
    case 'reward': reward(s, k, 'An envelope from the boss', Math.min(4, a.amount / 500)); break;
    case 'recognize': {
      reward(s, k, 'Recognized me in front of the capos', 1);
      for (const o of capos(s)) if (o.id !== k.id && hasTrait(o, 'Ambitious')) addOpinion(s, o.id, k.id, 'The boss\'s favorite', -3, 1);
      addStory(s, k, 'The boss raised a glass to him at the Saturday table.');
      break;
    }
    case 'territory': {
      const d = s.districts.find((x) => x.id === a.district);
      if (!d) break;
      const other = d.capoId ? isCapo(s, d.capoId) : undefined;
      d.capoId = k.id;
      reward(s, k, 'Gave me more ground', 3);
      if (other) slight(s, other, `Gave my ground to ${fn(k)}`, 2);
      addStory(s, k, `The boss gave him ${d.name} to run.`);
      ctx.log.push(`${nm(k)} runs ${d.name} now${other ? ` (${fn(other)} lost it)` : ''}.`);
      break;
    }
    case 'kin': {
      const mt = kinMatch(s, k);
      if (mt && performMarriage(s, mt.ours.id, mt.theirs.id, false, ctx.log)) b.tied = { w: s.week, how: 'a marriage' };
      else { b.tied = { w: s.week, how: 'compare' }; addStory(s, k, 'The boss stood godfather to his child.'); }
      reward(s, k, 'Family now', 3);
      break;
    }
    case 'watch': b.watch = s.week + 8; note(s, k.id, 'counter', `You put a man on ${fn(k)}.`); break;
    case 'ask': {
      b.asked = s.week;
      for (const r of ensureCapos(s).reports.filter((y) => y.capo === k.id && y.kind !== 'honest' && y.rev === undefined)) reveal(s, r, 'He told you when you asked him straight');
      for (const i of b.intel.filter((y) => !y.told)) report(ctx, k, i, true);
      // He hears more when the boss asks: one more thing off the street, told straight.
      const have = new Set(b.intel.map(intelKey));
      const extra = streetTruths(s, k).find((x) => !have.has(intelKey(x)));
      if (extra) { const i: CapoIntel = { ...extra, id: nid(ensureCapos(s), 'ci'), w: s.week }; b.intel.push(i); report(ctx, k, i, true); }
      break;
    }
    case 'confront': confront(ctx, k); break;
  }
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export interface CapoCard {
  c: Character;
  district?: string;
  men: number;
  grooming: { id: string; name: string; stage: string }[];
  take: number;
  /** Take trend: last 4 weeks against the 4 before (−1..1). */
  trend: number;
  takes: number[];
  heat: number;
  heatLabel: string;
  grip: number;
  mood: string;
  ambition: string;
  loyalty: number;
  read: ReturnType<typeof readOn>;
  signs: { w: number; t: string }[];
  doing: string;
  requests: CapoRequest[];
  reports: CapoReport[];
  watched: boolean;
  tied?: string;
  /** The truth (dev view only). */
  truth: { stance: Stance; tide: number; plot?: string; hedge: number };
}

const AMB: Record<string, string> = { get_made: 'Get made', become_capo: 'Run a crew', take_chair: 'The boss\'s chair', get_rich: 'Get rich', get_out: 'Get out', avenge: 'Get even' };

export function capoCard(s: GameState, k: Character): CapoCard {
  const b = s.capos?.books[k.id] ?? newBook(s.week);
  const takes = b.take;
  const last4 = takes.slice(-4);
  const prev4 = takes.slice(-8, -4);
  const avg = (x: number[]) => (x.length ? x.reduce((a, y) => a + y, 0) / x.length : 0);
  const trend = prev4.length ? clamp((avg(last4) - avg(prev4)) / Math.max(1, avg(prev4)), -1, 1) : 0;
  const m = mindOf(s, k.id);
  const heat8 = b.heat8.reduce((a, x) => a + x, 0);
  return {
    c: k, district: districtOf(s, k)?.name, men: regime(s, k.id).length,
    grooming: (s.capos?.groom ?? []).filter((g) => g.capo === k.id).map((g) => ({ id: g.id, name: s.characters[g.id] ? nm(s.characters[g.id]) : '?', stage: GROOM_STAGES[g.st] })),
    take: Math.round(avg(last4)), trend: Math.round(trend * 100) / 100, takes,
    heat: heat8, heatLabel: heat8 >= 3 ? 'Loud' : heat8 >= 1 ? 'Some noise' : heat8 <= -2 ? 'Keeps it quiet' : 'Quiet',
    grip: gripOf(s, k).v, mood: m?.mood ?? 'content', ambition: m?.amb ? m.amb.k : AMB[k.goal ?? ''] ?? k.goal ?? '—',
    loyalty: opinion(s, k.id, s.playerId), read: readOn(s, k), signs: b.signs.slice(-3).reverse().map((x) => ({ w: x.w, t: x.t })), doing: b.doing,
    requests: (s.capos?.req ?? []).filter((q) => q.capo === k.id && !q.ans),
    reports: (s.capos?.reports ?? []).filter((r) => r.capo === k.id).slice(-4).reverse(),
    watched: (b.watch ?? -1) >= s.week, tied: b.tied?.how,
    truth: { stance: b.st, tide: b.tide, plot: b.plot ? `${PLOT_LABEL[b.plot.k]} (stage ${b.plot.st + 1}/3${b.plot.known ? ', known' : ''})` : undefined, hedge: b.hedge },
  };
}

export function capoCards(s: GameState): CapoCard[] {
  return capos(s).filter((k) => k.id !== s.playerId).map((k) => capoCard(s, k));
}

/** The boss's orders for a capo, for his card and the "Deal with" menu. */
export function capoActionsFor(s: GameState, id: string): CapoAction[] {
  const k = isCapo(s, id);
  if (!k) return [];
  const out: CapoAction[] = [{ op: 'ask', capo: id }, { op: 'recognize', capo: id }, { op: 'reward', capo: id, amount: 1000 }, { op: 'watch', capo: id }, { op: 'confront', capo: id }, { op: 'kin', capo: id }];
  const d = s.districts.find((x) => !isCapo(s, x.capoId) && (x.influence.player ?? 0) >= CAPO_SEAT_MIN);
  if (d) out.push({ op: 'territory', capo: id, district: d.id });
  return out;
}

export function intelKindLabel(k: IntelKind): string {
  return { secret: 'A secret', rat: 'A rat', courted: 'Courted', hedge: 'A capo talking', rival: 'Rival moves', cops: 'The cops', skim: 'Skimming' }[k];
}

export type { CapoPlot };
