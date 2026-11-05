import { owned, staffNeed, expectedTake, isOpen } from './business';
import { crew, displayName, hasTrait, isFree } from './characters';
import { holder, seatOf } from './council';
import { level } from './crewXp';
import { crewFor, jobAction, jobLock, JOBS_BY_ID, targetsFor, weekTip } from './dirtyWork';
import { earnerAction, earnerOf, freeEarners, suggestFor, earnerWeekly } from './earners';
import { applyEffects, fmtMoney } from './effects';
import { bonesOdds, hasBones } from './bones';
import { journal } from './journal';
import type { Ctx } from './ledger';
import { debtsOf } from './myMen';
import { addSuspicion, readOf } from './peopleRead';
import { turnOf } from './planner/gateCore';
import { addOpinion, opinion } from './relations';
import { hashSeed, rand } from './rng';
import type { ActionPreview } from './actions';
import type { Attributes, Character, Craft, Effect, GameState, PlayerAction, RivalId } from './types';

/**
 * LET THEM EAT: the men are hungry for work, and they come to the boss with it.
 *
 *  - HUNGER (0-100) is read off the man every time, never stored: how long he
 *    has gone without real work (a place to run, a job, an earner, a seat), what
 *    he brings in against the men of his rank, what he wants out of life, his
 *    nature (Greedy, Ambitious), his debts, and whether the boss fed him lately.
 *  - THEIR OWN PITCHES: now and then a hungry man brings his own thing (a load
 *    of cigarettes, a card game, his cousin's bar, "put me on the numbers").
 *    It waits in Let them eat, and his capo brings it to a morning check-in
 *    on a free morning: no new popup. Back him (the Family's money, or for a
 *    piece), go in with him, give it to somebody else, or say no. Every answer
 *    is rolled on its own dice and written in Your File, with the odds.
 *  - OPEN JOBS: what needs a man now (an unmanned racket, a capo's steady
 *    earner, a slot in a thin crew, a collection for a prospect, this week's
 *    score, a place to offer protection). Each gets the consigliere's three
 *    best men, by skill, ability, loyalty, heat, load and who he is tight
 *    with, with his reasons, and a "Do it" that is the existing order.
 *  - TEETH: a man kept working is loyal and kicks up a little more; a starving
 *    man grumbles, skims, drinks with a rival or starts freelancing; a man
 *    given too much gets careless or gets ideas. The right man on a racket
 *    adds a little to its take.
 *
 * State `s.eat` is optional (made by the first week): when each man last
 * worked, who was fed when, the pitches, the men put on rackets from here.
 * Dice are hashes of (seed, week, purpose): the main stream is never touched.
 */

export type PitchKind = 'score' | 'game' | 'partner' | 'hustle' | 'racket';
export type PitchHow = 'back' | 'piece' | 'join' | 'other' | 'no';

export interface Pitch {
  id: string;
  /** The man pitching. */
  by: string;
  kind: PitchKind;
  /** His words. */
  text: string;
  /** Short name ("the cigarettes"). */
  what: string;
  /** What the Family puts up. */
  stake: number;
  /** Return on the stake when it comes off. */
  ret: number;
  week: number;
  /** Week it lapses unanswered. */
  due: number;
  /** For a racket ask: the place. */
  biz?: string;
}

export interface EatState {
  /** Last week each man had real work. */
  since: Record<string, number>;
  /** Week the boss last fed each man (backed his pitch, put him on something from here). */
  fed: Record<string, number>;
  pitches: Pitch[];
  /** Men put on a racket from here, with how well they fit it: bizId -> [charId, fit]. */
  put: Record<string, [string, number]>;
  /** Week of the last starving/overloaded consequence per man. */
  hit: Record<string, number>;
  /** Last pitch week per man (one in a while). */
  last: Record<string, number>;
  /** Calendar month of the last monthly pass. */
  month?: string;
  next: number;
}

export function ensureEat(s: GameState): EatState {
  const e = (s.eat ??= { since: {}, fed: {}, pitches: [], put: {}, hit: {}, last: {}, next: 1 });
  e.since ??= {};
  e.fed ??= {};
  e.pitches ??= [];
  e.put ??= {};
  e.hit ??= {};
  e.last ??= {};
  e.next ??= 1;
  return e;
}

function roll(s: GameState, k: string): number {
  return rand({ rng: hashSeed(`${s.seed}|eat|${s.week}|${k}`) });
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const weeksWord = (n: number) => `${n <= 12 ? NUM[n] : n} week${n === 1 ? '' : 's'}`;

export const CRAFT_WORD: Record<Craft, string> = {
  muscle: 'muscle', earner: 'an earner', driver: 'a wheelman', bookmaker: 'a bookmaker', collector: 'a collector', burglar: 'a second-story man', talker: 'a talker',
};

/* ------------------------------------------------------------------ */
/* Load and hunger                                                     */
/* ------------------------------------------------------------------ */

/** The men this is about: soldiers, associates and capos of the family (not specialists, not the boss). */
export function eaters(s: GameState): Character[] {
  return crew(s).filter((c) => c.id !== s.playerId && !c.specialty && (c.rank === 'soldier' || c.rank === 'associate' || c.rank === 'capo') && isFree(s, c));
}

/** What he is carrying now, each thing a line. */
export function loadOf(s: GameState, c: Character): string[] {
  const out: string[] = [];
  for (const b of owned(s)) if ((b.staffIds ?? []).includes(c.id)) out.push(`runs ${b.name}`);
  if (c.rank === 'capo') {
    const d = s.districts.find((x) => x.capoId === c.id);
    if (d) out.push(`has ${d.name}`);
  }
  const e = earnerOf(s, c.id);
  if (e) out.push(`his earner, ${e.name}`);
  if (seatOf(s, c.id)) out.push('a seat on the council');
  if ((c.busyUntil ?? 0) > s.week) out.push('away on a job');
  if (s.bones?.jobs.some((j) => j.prospectId === c.id)) out.push('a job for his bones');
  if (s.schemes.some((x) => x.owner === 'player' && x.agents.includes(c.id))) out.push('on a scheme');
  return out;
}

export interface Hunger {
  v: number;
  idle: number;
  load: number;
  word: 'starving' | 'hungry' | 'idle' | 'fed' | 'overworked' | 'earning';
  why: string[];
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

/** His hunger, read off the state (0 full .. 100 starving), with the reasons. */
export function hungerOf(s: GameState, c: Character, peers?: Character[]): Hunger {
  const load = loadOf(s, c).length;
  const e = s.eat;
  const idle = load ? 0 : Math.max(0, s.week - (e?.since[c.id] ?? s.week));
  const why: string[] = [];
  let v = 15;
  if (idle) { v += Math.min(40, idle * 5); why.push(`idle ${weeksWord(idle)}`); }
  if (!load) v += 8;
  const mates = (peers ?? eaters(s)).filter((x) => x.rank === c.rank && x.id !== c.id);
  const med = median(mates.map((x) => x.lastEarn ?? 0));
  if (med > 0 && (c.lastEarn ?? 0) < med * 0.8) { v += 10; why.push('earns less than the men of his rank'); }
  if (c.goal === 'get_rich' || c.goal === 'own_bar' || c.goal === 'become_capo' || c.goal === 'get_made') { v += 8; why.push(c.goal === 'get_rich' ? 'wants to get rich' : c.goal === 'own_bar' ? 'wants a place of his own' : c.goal === 'become_capo' ? 'wants a crew' : 'wants to get made'); }
  if (c.goal === 'get_out') v -= 10;
  if (hasTrait(c, 'Greedy')) { v += 10; why.push('greedy'); }
  if (hasTrait(c, 'Ambitious')) { v += 8; why.push('ambitious'); }
  if (hasTrait(c, 'Patient')) v -= 6;
  const debt = debtsOf(s, c).total;
  if (debt > 0) { v += Math.min(15, Math.round(debt / 100)); why.push(`owes ${fmtMoney(debt)}`); }
  const fed = e?.fed[c.id];
  if (fed !== undefined && s.week - fed < 8) { v -= 25 - (s.week - fed) * 3; why.push('the boss fed him lately'); }
  v -= load * 12;
  v = Math.max(0, Math.min(100, Math.round(v)));
  const top = med > 0 && (c.lastEarn ?? 0) >= med * 1.5;
  const word: Hunger['word'] = load >= 3 ? 'overworked' : v >= 70 ? 'starving' : v >= 45 ? 'hungry' : !load ? 'idle' : top ? 'earning' : 'fed';
  return { v, idle, load, word, why };
}

export const HUNGER_WORD: Record<Hunger['word'], string> = {
  starving: 'Starving', hungry: 'Hungry', idle: 'Idle', fed: 'Fed', overworked: 'Overworked', earning: 'Earning',
};

/* ------------------------------------------------------------------ */
/* The consigliere's read: how well a man fits a job                   */
/* ------------------------------------------------------------------ */

export interface JobNeed {
  crafts: Craft[];
  attrs: (keyof Attributes)[];
  /** The man the job sits next to (his capo, the partner): who he is tight with. */
  anchor?: string;
}

export interface Fit { score: number; why: string; parts: { label: string; value: number }[] }

/** How well a man fits a job, 0-100, with the parts and the consigliere's sentence. */
export function fitOf(s: GameState, c: Character, need: JobNeed, peers?: Character[]): Fit {
  const parts: { label: string; value: number }[] = [];
  const add = (label: string, v: number) => { const r = Math.round(v); if (r) parts.push({ label, value: r }); };
  const bits: string[] = [];
  const nm = c.nickname ?? c.firstName;
  // Skill: his craft, what he is good at, how far he has come.
  if (c.craft && need.crafts.includes(c.craft)) { add(`He is ${CRAFT_WORD[c.craft]}`, need.crafts[0] === c.craft ? 22 : 14); bits.push(`${nm}'s ${CRAFT_WORD[c.craft]}`); }
  const at = need.attrs.length ? need.attrs.reduce((a, k) => a + c.attributes[k], 0) / need.attrs.length : 50;
  add('His ability at it', (at - 50) * 0.45);
  if (at >= 70 && !bits.length) bits.push(`${nm} is good at this`);
  const lvl = level(s, c.id);
  if (lvl > 1) add(`Level ${lvl}`, Math.min(16, (lvl - 1) * 2.5));
  if (c.health < 50) add('In poor health', -10);
  // Loyalty and trust: what the boss suspects lowers it.
  const op = opinion(s, c.id, s.playerId);
  add(op >= 0 ? 'Loyal to you' : 'Cold to you', Math.max(-15, Math.min(15, op * 0.2)));
  const rd = readOf(s, c.id);
  const sus = Math.max(rd?.f ?? 0, rd?.st ?? 0);
  if (sus >= 10) { add('You have doubts about him', -sus * 0.35); if (sus >= 35) bits.push('but you have had doubts about him'); }
  // Heat.
  const ev = c.evidence ?? 0;
  if (ev >= 10) { add('The law has a file on him', -ev * 0.22); if (ev >= 40) bits.push('though the county has a file on him'); }
  // Load: the idle man is the hungry one.
  const h = hungerOf(s, c, peers);
  if (h.load) { add(`Already ${h.load === 1 ? 'has something' : `carries ${h.load} things`}`, -h.load * 11); if (h.load >= 2) bits.push(`he's already carrying ${NUM[h.load] ?? h.load} things`); }
  else if (h.idle >= 2) { add(`Idle ${weeksWord(h.idle)}`, Math.min(16, h.idle * 2)); bits.push(`he's been idle ${weeksWord(h.idle)}`); }
  else add('Free', 6);
  // Who he is tight with.
  const a = need.anchor ? s.characters[need.anchor] : undefined;
  if (a && a.id !== c.id) {
    const t = opinion(s, c.id, a.id);
    if (t >= 20) { add(`Tight with ${a.firstName}`, 7); bits.push(`he's tight with ${a.firstName}`); }
    else if (t <= -20) { add(`Bad blood with ${a.firstName}`, -10); bits.push(`he and ${a.firstName} don't get along`); }
  }
  const score = Math.max(0, Math.min(100, Math.round(40 + parts.reduce((x, p) => x + p.value, 0))));
  if (!bits.length) bits.push(score >= 60 ? `${nm} can do it` : `${nm} is who there is`);
  const why = `${bits[0].charAt(0).toUpperCase()}${bits[0].slice(1)}${bits.length > 1 ? ` and ${bits.slice(1, 3).join(', and ')}` : ''}.`;
  return { score, why, parts };
}

/** The consigliere who makes the picks (or the boss's own read without one). */
export function picker(s: GameState): Character | undefined {
  const c = holder(s, 'consigliere');
  return c && c.alive && isFree(s, c) && c.id !== s.playerId ? c : undefined;
}

/**
 * A turned consigliere's thumb on the scale (planner/gateCore turnOf): the men
 * on his side of it rise, the boss's most loyal sink. Hidden: the screen shows his picks, not why.
 */
function slant(s: GameState, c: Character): number {
  const k = picker(s);
  const t = k ? turnOf(s, k.id) : undefined;
  if (!t) return 0;
  if (t.with.includes(c.id) || (t.rival && c.courtedBy?.rival === t.rival)) return 18;
  return opinion(s, c.id, s.playerId) >= 30 ? -10 : 0;
}

/* ------------------------------------------------------------------ */
/* Open jobs                                                           */
/* ------------------------------------------------------------------ */

export type JobKind = 'staff' | 'earner' | 'crew' | 'bones' | 'score' | 'spot';

export interface JobPick { id: string; fit: Fit; action: PlayerAction; odds?: number }

export interface OpenJob {
  key: string;
  kind: JobKind;
  title: string;
  sub: string;
  picks: JobPick[];
}

const JOB_LIMIT = 8;

function rankPicks(s: GameState, pool: Character[], need: JobNeed, mk: (c: Character) => PlayerAction | undefined, peers: Character[], extra?: (c: Character) => number): JobPick[] {
  const out: JobPick[] = [];
  for (const c of pool) {
    const action = mk(c);
    if (!action) continue;
    const fit = fitOf(s, c, need, peers);
    const bonus = (extra?.(c) ?? 0) + slant(s, c);
    out.push({ id: c.id, fit: bonus ? { ...fit, score: Math.max(0, Math.min(100, fit.score + Math.round(bonus))) } : fit, action });
  }
  return out.sort((a, b) => b.fit.score - a.fit.score || (a.id < b.id ? -1 : 1)).slice(0, 3);
}

export const RACKET_NEED = (kind: string): JobNeed => {
  if (/numbers|book|policy|card|dice|bingo|court/.test(kind)) return { crafts: ['bookmaker', 'earner'], attrs: ['business', 'discipline'] };
  if (/loan|protection|collect|labor|waste/.test(kind)) return { crafts: ['collector', 'muscle'], attrs: ['force', 'discipline'] };
  if (/hijack|truck|cigar|bootleg|fence|cars/.test(kind)) return { crafts: ['driver', 'burglar'], attrs: ['intrigue', 'force'] };
  return { crafts: ['earner', 'talker'], attrs: ['business', 'diplomacy'] };
};

/** Everything that needs a man this week, each with the consigliere's three best. */
export function openJobs(s: GameState): OpenJob[] {
  const out: OpenJob[] = [];
  if (s.gameOver) return out;
  const men = eaters(s);
  const street = men.filter((c) => c.rank !== 'capo');
  // 1. A racket short of men.
  for (const b of owned(s)) {
    if (out.length >= JOB_LIMIT) break;
    const need = staffNeed(b);
    const have = (b.staffIds ?? []).filter((id) => s.characters[id]?.alive).length;
    if (!need || have >= need || !isOpen(s, b)) continue;
    const d = s.districts.find((x) => x.id === b.districtId);
    const n = { ...RACKET_NEED(b.kind), anchor: d?.capoId };
    const pool = street.filter((c) => !(b.staffIds ?? []).includes(c.id));
    const picks = rankPicks(s, pool, n, (c) => ({ kind: 'mymen', op: { op: 'staff', id: c.id, biz: b.id } }), men);
    if (picks.length) out.push({ key: `staff:${b.id}`, kind: 'staff', title: `${b.name} needs a man`, sub: `${have} of ${need} men on it; short-handed it makes less (about ${fmtMoney(expectedTake(s, b))} a week now).`, picks });
  }
  // 2. A capo with no steady earner of his own, and a place to give him.
  if (freeEarners(s).length) {
    const capos = men.filter((c) => c.rank === 'capo' && !earnerOf(s, c.id));
    const taken = new Set<string>();
    const picks: JobPick[] = [];
    for (const c of capos) {
      const b = suggestFor(s, c, taken);
      if (!b) continue;
      const fit = fitOf(s, c, { ...RACKET_NEED(b.kind) }, men);
      picks.push({ id: c.id, fit: { ...fit, why: `${fit.why.replace(/\.$/, '')}; ${b.name} would bring about ${fmtMoney(earnerWeekly(s, b))} a week.` }, action: earnerAction(c.id, b.id) });
    }
    picks.sort((a, b) => b.fit.score - a.fit.score || (a.id < b.id ? -1 : 1));
    if (picks.length) out.push({ key: 'earner', kind: 'earner', title: 'A steady earner for a capo', sub: `${capos.length} of your capos ${capos.length === 1 ? 'has' : 'have'} nothing steady of his own; a capo with one is more loyal and kicks up steadier.`, picks: picks.slice(0, 3) });
  }
  // 3. A thin crew and men with no crew.
  const loose = street.filter((c) => !c.capoId || !s.characters[c.capoId]?.alive);
  if (loose.length) {
    const thin = men.filter((c) => c.rank === 'capo').map((k) => ({ k, n: street.filter((c) => c.capoId === k.id).length })).sort((a, b) => a.n - b.n || (a.k.id < b.k.id ? -1 : 1))[0];
    if (thin) {
      const picks = rankPicks(s, loose, { crafts: ['muscle', 'collector', 'earner'], attrs: ['discipline', 'force'], anchor: thin.k.id }, (c) => ({ kind: 'reassign', charId: c.id, capoId: thin.k.id }), men);
      if (picks.length) out.push({ key: `crew:${thin.k.id}`, kind: 'crew', title: `A slot in ${thin.k.firstName}'s crew`, sub: `${thin.k.firstName} has ${thin.n} m${thin.n === 1 ? 'an' : 'en'}; ${loose.length} of yours answer to nobody.`, picks });
    }
  }
  // 4. A collection for a prospect (he makes his bones).
  const prospects = street.filter((c) => c.rank === 'associate' && !hasBones(c) && !s.bones?.jobs.some((j) => j.prospectId === c.id));
  if (prospects.length) {
    const picks = rankPicks(s, prospects, { crafts: ['collector', 'muscle'], attrs: ['force', 'discipline'] }, (c) => ({ kind: 'bones', op: { op: 'assign', charId: c.id, kind: 'collection' } }), men, (c) => (bonesOdds(s, c, 'collection').chance - 0.5) * 20);
    if (picks.length) out.push({ key: 'bones', kind: 'bones', title: 'A collection for a prospect', sub: 'An associate goes along on a collection to make his bones; then he can be proposed.', picks });
  }
  // 5. This week's score (the dirty-work tip).
  const tip = weekTip(s);
  if (tip && !jobLock(s, tip.job)) {
    const j = JOBS_BY_ID[tip.job];
    const tg = j.target && !j.targetOptional ? targetsFor(s, tip.job)[0]?.id : undefined;
    if (!j.target || j.targetOptional || tg) {
      const odds = new Map(crewFor(s, tip.job).filter((x) => !x.busy).map((x) => [x.c.id, x.odds]));
      const pool = street.filter((c) => odds.has(c.id));
      const need: JobNeed = { crafts: j.fit === 'force' ? ['muscle', 'driver'] : j.fit === 'intrigue' ? ['burglar', 'driver'] : j.fit === 'business' ? ['earner', 'bookmaker'] : ['talker', 'collector'], attrs: [j.fit] };
      const picks = rankPicks(s, pool, need, (c) => jobAction(s, tip.job, c.id, tg), men, (c) => ((odds.get(c.id) ?? 50) - 50) * 0.3).map((p) => ({ ...p, odds: odds.get(p.id) }));
      if (picks.length) out.push({ key: `score:${tip.job}`, kind: 'score', title: `This week's score: ${j.title.toLowerCase()}`, sub: tip.text, picks });
    }
  }
  return out.slice(0, JOB_LIMIT);
}

/** The top pick of every open job, one job per man (the "consigliere's way"). */
export function consigliereWay(s: GameState, jobs = openJobs(s)): { job: OpenJob; pick: JobPick }[] {
  const used = new Set<string>();
  const out: { job: OpenJob; pick: JobPick }[] = [];
  for (const job of jobs) {
    const p = job.picks.find((x) => !used.has(x.id));
    if (!p) continue;
    used.add(p.id);
    out.push({ job, pick: p });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Putting a man on a racket (the order Do it gives for a short racket) */
/* ------------------------------------------------------------------ */

export function previewStaff(s: GameState, id: string, bizId: string): ActionPreview {
  const c = s.characters[id];
  const b = s.businesses.find((x) => x.id === bizId && x.owner === 'player');
  const title = `Put ${c?.firstName ?? '?'} on ${b?.name ?? 'it'}`;
  const need = b ? staffNeed(b) : 0;
  const have = b ? (b.staffIds ?? []).filter((x) => s.characters[x]?.alive).length : 0;
  const d = b ? s.districts.find((x) => x.id === b.districtId) : undefined;
  const fit = c && b ? fitOf(s, c, { ...RACKET_NEED(b.kind), anchor: d?.capoId }) : undefined;
  const why = !c || !c.alive || c.faction !== 'player' ? 'Not one of your men'
    : !b ? 'Not yours'
      : (b.staffIds ?? []).includes(c.id) ? 'He is on it already'
        : have >= need ? 'It has the men it needs'
          : !isFree(s, c) ? 'He is inside'
            : c.specialty ? 'Specialists do not run rackets' : undefined;
  return {
    title, detail: `${fit ? fit.why : ''} He runs it with the others; ${fit && fit.score >= 70 ? 'the right man for it adds a little to the take.' : 'he keeps it going.'}`,
    effects: c && b ? [{ type: 'mymen', op: { op: 'staff', id: c.id, biz: b.id } } as Effect] : [],
    cost: 0, because: `put ${c?.firstName ?? 'a man'} on ${b?.name ?? 'a racket'}`, category: 'event', disabledReason: why,
    ...(fit ? { odds: { chance: fit.score / 100, reasons: fit.parts } } : {}),
  };
}

export function applyStaff(ctx: Ctx, id: string, bizId: string): void {
  const s = ctx.s;
  const c = s.characters[id];
  const b = s.businesses.find((x) => x.id === bizId && x.owner === 'player');
  if (!c?.alive || !b || (b.staffIds ?? []).includes(c.id)) return;
  (b.staffIds ??= []).push(c.id);
  const e = ensureEat(s);
  const d = s.districts.find((x) => x.id === b.districtId);
  e.put[b.id] = [c.id, fitOf(s, c, { ...RACKET_NEED(b.kind), anchor: d?.capoId }).score];
  e.since[c.id] = s.week;
  e.fed[c.id] = s.week;
  ctx.log.push(`${displayName(c)} now works ${b.name}.`);
}

/* ------------------------------------------------------------------ */
/* Pitches                                                             */
/* ------------------------------------------------------------------ */

export const HOW_LABEL: Record<PitchHow, string> = { back: 'Back him', piece: 'Back him for a piece', join: 'Go in with him', other: 'Give it to someone else', no: 'Say no' };

function pitchNeed(p: Pitch): JobNeed {
  switch (p.kind) {
    case 'score': return { crafts: ['driver', 'burglar', 'muscle'], attrs: ['intrigue', 'force'] };
    case 'game': return { crafts: ['bookmaker', 'earner'], attrs: ['business', 'discipline'] };
    case 'partner': return { crafts: ['earner', 'talker'], attrs: ['business', 'diplomacy'] };
    case 'racket': return { crafts: ['collector', 'earner', 'bookmaker'], attrs: ['business', 'discipline'] };
    default: return { crafts: ['collector', 'muscle', 'talker'], attrs: ['force', 'diplomacy'] };
  }
}

export function pitchById(s: GameState, id: string): Pitch | undefined {
  return s.eat?.pitches.find((p) => p.id === id);
}

export function openPitches(s: GameState): Pitch[] {
  return (s.eat?.pitches ?? []).filter((p) => s.characters[p.by]?.alive && s.characters[p.by].faction === 'player');
}

/** Who would do it instead (the consigliere's best other man). */
export function otherFor(s: GameState, p: Pitch): Character | undefined {
  const men = eaters(s).filter((c) => c.id !== p.by && c.rank !== 'capo');
  const need = pitchNeed(p);
  return men.map((c) => ({ c, f: fitOf(s, c, need, men).score + slant(s, c) })).sort((a, b) => b.f - a.f || (a.c.id < b.c.id ? -1 : 1))[0]?.c;
}

/** The odds it comes off, with every reason. */
export function pitchOdds(s: GameState, p: Pitch, how: PitchHow, doer = how === 'other' ? otherFor(s, p) : s.characters[p.by]): { chance: number; reasons: { label: string; value: number }[] } {
  const reasons: { label: string; value: number }[] = [{ label: 'Base', value: p.kind === 'score' ? 50 : p.kind === 'partner' ? 60 : 55 }];
  if (doer) {
    const f = fitOf(s, doer, pitchNeed(p));
    reasons.push({ label: `${doer.firstName} for the job (fit ${f.score})`, value: Math.round((f.score - 50) * 0.4) });
  }
  if (how === 'join') reasons.push({ label: 'You go in with him: your name opens doors', value: 15 });
  if (how === 'piece') reasons.push({ label: 'No money behind him', value: -6 });
  if (how === 'other') reasons.push({ label: 'Not his own line: the other man learns it cold', value: -6 });
  if (s.heat.local >= 50) reasons.push({ label: 'The cops are everywhere', value: -10 });
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.1, Math.min(0.9, sum / 100)), reasons };
}

/** What the Family gets back if it comes off. */
export function pitchTake(p: Pitch, how: PitchHow): number {
  if (how === 'piece') return Math.round(p.stake * p.ret * 0.5);
  if (how === 'join') return Math.round(p.stake * (1 + p.ret * 1.3));
  return Math.round(p.stake * (1 + p.ret));
}

export function stakeOf(p: Pitch, how: PitchHow): number {
  return how === 'back' || how === 'join' || how === 'other' ? p.stake : 0;
}

/** The answers that fit this pitch (a racket ask: put him on it, give it to someone else, or no). */
export function hows(p: Pitch): PitchHow[] {
  return p.kind === 'racket' ? ['back', 'other', 'no'] : ['back', 'piece', 'join', 'other', 'no'];
}

export function previewPitch(s: GameState, pid: string, how: PitchHow): ActionPreview {
  const p = pitchById(s, pid);
  const c = p ? s.characters[p.by] : undefined;
  const nm = c?.firstName ?? 'him';
  const X = (): Effect => ({ type: 'mymen', op: { op: 'pitch', pitch: pid, how } } as Effect);
  if (!p || !c) return { title: HOW_LABEL[how], effects: [], cost: 0, because: '', category: 'event', disabledReason: 'Nothing to answer' };
  const block = !c.alive ? 'He is gone' : !isFree(s, c) ? 'He is inside' : undefined;
  if (p.kind === 'racket') {
    const b = s.businesses.find((x) => x.id === p.biz && x.owner === 'player');
    const o = how === 'other' ? otherFor(s, p) : undefined;
    const title = how === 'back' ? `Put ${nm} on ${b?.name ?? 'it'}` : how === 'other' ? `Put ${o?.firstName ?? 'somebody else'} on ${b?.name ?? 'it'} instead` : `Tell ${nm} no`;
    const full = b ? (b.staffIds ?? []).filter((x) => s.characters[x]?.alive).length >= staffNeed(b) : true;
    return {
      title, detail: how === 'no' ? `${nm} stays on the street. He asked; he will remember he asked.` : how === 'other' ? `${nm} asked for it. He will remember who got it.` : `He wanted it; now it is his to run.`,
      effects: [X()], cost: 0, because: how === 'no' ? `told ${nm} no` : `answered ${nm}'s ask`, category: 'event',
      disabledReason: block ?? (how !== 'no' && (!b || full) ? 'The place has its men now' : how === 'other' && !o ? 'Nobody else for it' : undefined),
    };
  }
  const stake = stakeOf(p, how);
  const o = how === 'other' ? otherFor(s, p) : undefined;
  const odds = how === 'no' ? undefined : pitchOdds(s, p, how, o ?? c);
  const take = pitchTake(p, how);
  const pct = odds ? `${Math.round(odds.chance * 100)}%` : '';
  const title = how === 'back' ? `Back ${nm}: ${fmtMoney(p.stake)} on ${p.what}`
    : how === 'piece' ? `Back ${nm} for a piece of ${p.what}`
      : how === 'join' ? `Go in with ${nm} on ${p.what} (${fmtMoney(p.stake)})`
        : how === 'other' ? `Give ${p.what} to ${o?.firstName ?? 'somebody else'} (${fmtMoney(p.stake)})`
          : `Tell ${nm} no on ${p.what}`;
  const detail = how === 'no' ? `He goes back to the street with nothing. Hungry men remember.`
    : how === 'piece' ? `No money from you: he does it his way and the Family takes half his end. Comes off ${pct}: about ${fmtMoney(take)} to the Family. If it goes wrong, a little heat.`
      : how === 'join' ? `The Family's ${fmtMoney(p.stake)} and your name on it: better odds, a bigger end, and your fingerprints. Comes off ${pct}: ${fmtMoney(take)} back.`
        : how === 'other' ? `${o?.firstName ?? 'Somebody else'} does ${nm}'s thing. Comes off ${pct}: ${fmtMoney(take)} back. ${nm} will remember who got it.`
          : `The Family's ${fmtMoney(p.stake)}. Comes off ${pct}: ${fmtMoney(take)} back; if it goes wrong, the money is gone.`;
  return {
    title, detail, effects: [X()], cost: stake, because: how === 'no' ? `told ${nm} no` : `answered ${nm}'s pitch`, category: 'event',
    ...(odds ? { odds } : {}),
    disabledReason: block ?? (how === 'other' && !o ? 'Nobody else for it' : stake > 0 && s.money < stake ? `Needs ${fmtMoney(stake)}` : undefined),
  };
}

const opn = (s: GameState, c: Character, amount: number, reason: string, decay = 1): Effect => ({ type: 'opinion', from: c.id, to: s.playerId, amount, reason, decay });

/** The answer is carried out (an order at the week's turn, or a morning check-in). */
export function answerPitch(ctx: Ctx, pid: string, how: PitchHow): void {
  const s = ctx.s;
  const e = ensureEat(s);
  const p = pitchById(s, pid);
  if (!p) return;
  const c = s.characters[p.by];
  e.pitches = e.pitches.filter((x) => x.id !== pid);
  if (!c?.alive) return;
  const nm = displayName(c);
  const lbl = `${c.firstName}'s pitch: ${p.what}`;
  const book = (t: string, x: string, m = 0, ids: string[] = [c.id]) => journal(s, { t, x, p: ids, m, c: 'crew', src: 'eat', ln: 'borgata.eat', mine: 1 });
  if (how === 'no') {
    applyEffects(ctx, [opn(s, c, -4, 'The boss turned down my pitch')], { label: lbl, because: `told ${c.firstName} no`, category: 'event' });
    book(`You told ${nm} no on ${p.what}`, 'He went back to the street with nothing.');
    return;
  }
  if (p.kind === 'racket') {
    const o = how === 'other' ? otherFor(s, p) : c;
    if (!o || !p.biz) return;
    applyStaff(ctx, o.id, p.biz);
    const fx: Effect[] = how === 'back' ? [opn(s, c, 8, 'The boss gave me what I asked for')] : [opn(s, c, -6, `The boss gave my ask to ${o.firstName}`)];
    applyEffects(ctx, fx, { label: lbl, because: `answered ${c.firstName}'s ask`, category: 'event' });
    const b = s.businesses.find((x) => x.id === p.biz);
    book(how === 'back' ? `You put ${nm} on ${b?.name ?? 'the racket'}, as he asked` : `${nm} asked for ${b?.name ?? 'the racket'}; you put ${o.firstName} on it`, how === 'back' ? 'He asked for it and got it.' : `${c.firstName} will remember who got it.`, 0, [c.id, o.id]);
    return;
  }
  const doer = how === 'other' ? otherFor(s, p) : c;
  if (!doer) return;
  const stake = stakeOf(p, how);
  if (stake > s.money) { book(`${nm}'s pitch fell through`, `The Family did not have the ${fmtMoney(stake)}.`); return; }
  const odds = pitchOdds(s, p, how, doer);
  const ok = roll(s, `pitch:${pid}`) < odds.chance;
  const take = pitchTake(p, how);
  const pct = Math.round(odds.chance * 100);
  const fx: Effect[] = [];
  if (stake) fx.push({ type: 'money', amount: -stake, label: `${lbl}: the stake` });
  e.fed[doer.id] = s.week;
  e.since[doer.id] = s.week;
  if (ok) {
    fx.push({ type: 'money', amount: take, label: `${lbl}: it came off` });
    fx.push({ type: 'wealth', charId: doer.id, amount: Math.round(Math.max(take - stake, take * 0.5) * 0.4) });
    if (how === 'join') fx.push({ type: 'evidence', charId: s.playerId, amount: 3 });
  } else {
    if (how === 'piece') fx.push({ type: 'heat', bar: 'local', amount: 1 });
    if (how === 'join') fx.push({ type: 'evidence', charId: s.playerId, amount: 4 });
    if (roll(s, `pinch:${pid}`) < 0.15) fx.push({ type: 'evidence', charId: doer.id, amount: 8 });
  }
  if (how === 'other') {
    fx.push(opn(s, c, -6, `The boss gave my score to ${doer.firstName}`));
    fx.push(opn(s, doer, 4, 'The boss put me on something'));
  } else fx.push(opn(s, c, how === 'join' ? 10 : how === 'back' ? 8 : 5, how === 'join' ? 'The boss went in with me' : 'The boss backed me'));
  applyEffects(ctx, fx, { label: lbl, because: `answered ${c.firstName}'s pitch`, category: 'event' });
  const net = (ok ? take : 0) - stake;
  const who = how === 'other' ? `${doer.firstName} did ${c.firstName}'s thing` : how === 'join' ? `You went in with ${c.firstName}` : `You backed ${c.firstName}${how === 'piece' ? ' for a piece' : ''}`;
  book(`${who}: ${p.what} ${ok ? 'came off' : 'went wrong'} (${pct}%)`, ok ? `${fmtMoney(take)} back to the Family${stake ? ` on a ${fmtMoney(stake)} stake` : ''}.` : stake ? `The ${fmtMoney(stake)} is gone.` : 'Nothing came of it but a little heat.', net, [c.id, ...(doer.id !== c.id ? [doer.id] : [])]);
  ctx.log.push(`${who}: ${p.what} ${ok ? `came off, ${fmtMoney(take)} back` : 'went wrong'}.`);
}

/** What a hungry man pitches, from what he is. Pure (its own dice). */
function draftPitch(s: GameState, c: Character, id: string): Pitch {
  const r = roll(s, `kind:${c.id}`);
  const soldier = c.rank === 'soldier';
  const stake = Math.round(((soldier ? 600 : 300) + roll(s, `stake:${c.id}`) * (soldier ? 900 : 400)) / 50) * 50;
  const ret = Math.round((0.45 + roll(s, `ret:${c.id}`) * 0.55) * 100) / 100;
  const base = { id, by: c.id, stake, ret, week: s.week, due: s.week + 4 };
  // A racket short of men: "put me on it".
  const short = owned(s).find((b) => isOpen(s, b) && staffNeed(b) > (b.staffIds ?? []).filter((x) => s.characters[x]?.alive).length);
  if (short && (c.craft === 'collector' || c.craft === 'bookmaker' || c.craft === 'earner' || r < 0.3)) {
    return { ...base, kind: 'racket', stake: 0, ret: 0, biz: short.id, what: short.name, text: `"Put me on ${short.name}. It's running short, and I'm standing around."` };
  }
  const k = c.craft === 'driver' || c.craft === 'burglar' ? 'score' : c.craft === 'bookmaker' ? 'game' : c.craft === 'earner' || c.craft === 'talker' ? 'partner' : r < 0.5 ? 'score' : 'hustle';
  const pick = <T,>(xs: T[]) => xs[Math.floor(roll(s, `txt:${c.id}`) * xs.length) % xs.length];
  if (k === 'score') {
    const [what, text] = pick([
      ['a truckload of cigarettes', '"I got a line on a truckload of cigarettes off the Parkway. The driver\'s in on it. I need money for the drop."'],
      ['a load of television sets', '"A dispatcher at the Bay Docks owes me. A load of television sets goes out Thursday."'],
      ['a warehouse in Rio Grande', '"A warehouse in Rio Grande, full of appliances, one old lock and a watchman who drinks."'],
    ]);
    return { ...base, kind: 'score', what, text };
  }
  if (k === 'game') {
    const [what, text] = pick([
      ['a card game on Pacific', '"Let me run a card game on Pacific Avenue. Salesmen, summer people. I need a bank to start it."'],
      ['a crap game behind the Starlight', '"A crap game behind the Starlight, Saturday nights. I need a bank and a couple of chairs."'],
    ]);
    return { ...base, kind: 'game', what, text };
  }
  if (k === 'partner') {
    const [what, text] = pick([
      ['his cousin\'s bar', '"My cousin\'s bar on New Jersey Avenue needs a partner. A little money in, and we got a place."'],
      ['a jukebox route', '"A jukebox route in the Crest bars is for sale. The old man wants out. Back me and it\'s ours."'],
    ]);
    return { ...base, kind: 'partner', what, text };
  }
  const [what, text] = pick([
    ['the boardwalk stands', '"The new stands on the boardwalk don\'t pay anybody yet. Let me go talk to them."'],
    ['a shylock book in the Crest', '"Guys in the Crest need money before the season. Front me a book and I\'ll work it."'],
  ]);
  return { ...base, kind: 'hustle', what, text };
}

/** The open pitch of a capo's man that he would bring to a morning (one at a time, the oldest first). */
export function pitchForCapo(s: GameState, capoId: string): Pitch | undefined {
  return openPitches(s).filter((p) => s.characters[p.by]?.capoId === capoId).sort((a, b) => a.week - b.week || (a.id < b.id ? -1 : 1))[0];
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

/** Hunger of every man, worst first. */
export function hungerBoard(s: GameState): { c: Character; h: Hunger }[] {
  const men = eaters(s);
  return men.map((c) => ({ c, h: hungerOf(s, c, men) })).sort((a, b) => b.h.v - a.h.v || (a.c.id < b.c.id ? -1 : 1));
}

export function eatWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const e = ensureEat(s);
  const men = eaters(s);
  // Who worked this week.
  for (const c of men) {
    if (e.since[c.id] === undefined || loadOf(s, c).length) e.since[c.id] = s.week;
  }
  // The dead, the gone and the old records.
  for (const k of ['since', 'fed', 'hit', 'last'] as const) for (const id of Object.keys(e[k])) if (!s.characters[id]?.alive || s.characters[id].faction !== 'player') delete e[k][id];
  for (const id of Object.keys(e.fed)) if (s.week - e.fed[id] > 26) delete e.fed[id];
  for (const id of Object.keys(e.hit)) if (s.week - e.hit[id] > 26) delete e.hit[id];
  for (const id of Object.keys(e.last)) if (s.week - e.last[id] > 26) delete e.last[id];
  // The right man on a racket: a little more from it.
  let bonus = 0;
  const names: string[] = [];
  for (const [bid, [cid, fit]] of Object.entries(e.put)) {
    const b = s.businesses.find((x) => x.id === bid && x.owner === 'player');
    if (!b || !(b.staffIds ?? []).includes(cid) || !s.characters[cid]?.alive) { delete e.put[bid]; continue; }
    if (fit < 70 || !isOpen(s, b)) continue;
    const add = Math.round(expectedTake(s, b) * 0.04);
    if (add > 0) { bonus += add; names.push(s.characters[cid].firstName); }
  }
  if (bonus > 0) applyEffects(ctx, [{ type: 'money', amount: bonus, label: `The right men on the rackets (${names.join(', ')})` }], { label: 'The right man for it', because: 'put the right man on it', category: 'event' });
  // Pitches: the old ones lapse; a hungry man brings a new one now and then.
  for (const p of [...e.pitches]) {
    const c = s.characters[p.by];
    if (!c?.alive || c.faction !== 'player') { e.pitches = e.pitches.filter((x) => x !== p); continue; }
    if (s.week >= p.due) {
      e.pitches = e.pitches.filter((x) => x !== p);
      applyEffects(ctx, [opn(s, c, -2, 'The boss never answered my pitch')], { label: `${c.firstName}'s pitch`, because: 'never answered him', category: 'event' });
      journal(s, { t: `${displayName(c)}'s pitch went unanswered: ${p.what}`, x: 'He took it as a no.', p: [c.id], c: 'crew', src: 'eat', ln: 'borgata.eat' });
    }
  }
  if (e.pitches.length < 3 && roll(s, 'pitch') < 0.45) {
    const board = men.map((c) => ({ c, h: hungerOf(s, c, men) })).filter(({ c, h }) => c.rank !== 'capo' && h.v >= 45 && !e.pitches.some((p) => p.by === c.id) && s.week - (e.last[c.id] ?? -99) >= 8);
    board.sort((a, b) => b.h.v - a.h.v || (a.c.id < b.c.id ? -1 : 1));
    const who = board[Math.floor(roll(s, 'who') * Math.min(3, board.length))]?.c;
    if (who) {
      const p = draftPitch(s, who, `pi${e.next++}`);
      e.pitches.push(p);
      e.last[who.id] = s.week;
      ctx.log.push(`${displayName(who)} has a pitch for you: ${p.what} (Your men › Let them eat).`);
    }
  }
  // The month: the fed are loyal and kick up; the starving and the overloaded act.
  const mk = `${s.date.y}-${s.date.m}`;
  if (e.month !== mk) {
    e.month = mk;
    monthEat(ctx, men);
  }
}

const R_FED = 'The boss keeps me working';
const R_STARVE = 'Nobody gives me work';

/** The monthly teeth. Exported for tests. */
export function monthEat(ctx: Ctx, men = eaters(ctx.s)): string[] {
  const s = ctx.s;
  const e = ensureEat(s);
  const B = s.playerId;
  const out: string[] = [];
  let extra = 0;
  let fedN = 0;
  for (const c of men) {
    const h = hungerOf(s, c, men);
    const rel = s.relations[`${c.id}>${B}`];
    // A capo's own loyalty to a steady earner is earners.ts's: here only the street men.
    if (c.rank === 'capo') continue;
    if (h.load >= 1 && h.v < 35 && h.load < 3) {
      const m = addOpinion(s, c.id, B, R_FED, 2, 0);
      if (m) m.value = Math.min(m.value, 6);
      if (rel) rel.modifiers = rel.modifiers.filter((x) => x.reason !== R_STARVE);
      extra += c.rank === 'soldier' ? 30 : 15;
      fedN++;
      continue;
    }
    if (rel) rel.modifiers = rel.modifiers.filter((x) => x.reason !== R_FED);
    if (h.word === 'starving') {
      const m = addOpinion(s, c.id, B, R_STARVE, -2, 0);
      if (m) m.value = Math.max(m.value, -8);
      if (s.week - (e.hit[c.id] ?? -99) < 4) continue;
      const r = roll(s, `starve:${c.id}`);
      const nm = displayName(c);
      if (r < 0.3) {
        const amt = Math.min(200, 40 + Math.round(h.v));
        applyEffects(ctx, [{ type: 'money', amount: -amt, label: `${c.firstName} skimmed: nobody gives him work` }], { label: `${c.firstName} skimmed`, because: 'starved him of work', category: 'event' });
        addSuspicion(s, c.id, 'steal', 10, `${c.firstName} was short on the street money, and he has had no work in weeks`, 'eat');
        out.push(`${nm} skimmed ${fmtMoney(amt)}`);
      } else if (r < 0.5 && !c.courtedBy) {
        const rv = s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive).sort((a, b) => (a.id < b.id ? -1 : 1));
        const pick = rv[Math.floor(roll(s, `rival:${c.id}`) * rv.length)];
        if (pick) { c.courtedBy = { rival: pick.id as RivalId, week: s.week }; out.push(`${nm} has been drinking with ${pick.shortName}'s people`); }
      } else if (r < 0.62 && h.v >= 80 && opinion(s, c.id, B) < 10) {
        c.defectStage = Math.max(1, c.defectStage ?? 0);
        applyEffects(ctx, [{ type: 'evidence', charId: c.id, amount: 5 }, { type: 'heat', bar: 'local', amount: 1, label: `${c.firstName} freelancing` }], { label: `${c.firstName} went freelance`, because: 'starved him of work', category: 'event' });
        out.push(`${nm} has started doing his own scores without asking`);
      } else {
        out.push(`${nm} grumbles that nobody gives him work`);
      }
      e.hit[c.id] = s.week;
    } else if (h.word === 'overworked') {
      if (s.week - (e.hit[c.id] ?? -99) < 8) continue;
      const nm = displayName(c);
      if (c.rank === 'soldier' && c.goal !== 'become_capo' && roll(s, `over:${c.id}`) < 0.4) {
        c.goal = 'become_capo';
        out.push(`${nm} runs so much now he has an eye on a capo's seat`);
      } else {
        applyEffects(ctx, [{ type: 'evidence', charId: c.id, amount: 4 }, { type: 'heat', bar: 'local', amount: 1, label: `${c.firstName} spread too thin` }], { label: `${c.firstName} got careless`, because: 'gave him too much', category: 'event' });
        out.push(`${nm} is spread too thin and getting careless`);
      }
      e.hit[c.id] = s.week;
    }
  }
  if (extra > 0) applyEffects(ctx, [{ type: 'money', amount: extra, label: `The men you keep working kick up a little extra (${fedN})` }], { label: 'Let them eat', because: 'kept the men working', category: 'event' });
  for (const t of out) {
    ctx.log.push(`${t}.`);
    journal(s, { t, c: 'crew', src: 'eat', ln: 'borgata.eat' });
  }
  return out;
}
