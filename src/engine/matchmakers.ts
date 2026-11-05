import { ageOn } from './calendar';
import { charmReasons } from './newSkills';
import { displayName, hasTrait, player } from './characters';
import { stageOf as datingStage } from './dating';
import { alliedHouse } from './familyHouses';
import { dowryFor, marriageAcceptance, marriageBlock, matchCandidates, ourMarriageable } from './familyMarriage';
import { fam, houseOf, houseById, type House } from './familyState';
import { kidsWish, nudge, remember, ensureTie } from './bonds';
import { applyEffects } from './effects';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Ctx } from './ledger';
import { activeRomances } from './romance';
import { addOpinion, opinion } from './relations';
import type { Character, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * THE MATCHMAKERS: the women of the house arrange the children's marriages.
 *
 * Before this, a match came to the boss (a house's offer, the Marriages
 * screen) and he decided. Now the boss's wife (or, without one, his mother,
 * then the eldest woman of the house) does the arranging. She picks by what
 * she weighs (love, money, an alliance, the Church, keeping the kids out of
 * the life), drawn from her traits and her own wishes, settles the terms over
 * coffee with the other family's mother, and brings it to him as a card with
 * her reasons. He can:
 *   - bless it (she is pleased; her standing rises),
 *   - grumble but accept (her standing still rises; she thinks a little less of him),
 *   - veto it (certain: she thinks much less of him, the women talk, her standing drops),
 *   - name his own candidate (it goes through her: she may push back).
 * The young person always decides too: nobody is married against their will.
 * Every answer is settled in the moment (a 'bond' order on her: deeds/now.ts),
 * with the odds and their reasons on the card, and lands in Your File.
 *
 * Her standing (`circle`) grows with every match: favors owed by the other
 * families' mothers, which she can call in (a peace feeler, a word to the
 * priest, what the wives say), and at 40+ a voice in the succession (oldDon
 * claimStrengths). Matches she made without a veto turn out well a year on:
 * the "mom knows best" beat (an event).
 *
 * Lives on `GameState.matchmakers` (optional: made the first week she has a
 * match to bring; upgradeSave only tops up a save that already has it). Every
 * roll is a hash of (seed, week, purpose, ids): no dice stream of its own.
 * Adults only (18+), no coercion, nobody real.
 */

export type Weigh = 'love' | 'money' | 'alliance' | 'church' | 'out';

export const WEIGH_TEXT: Record<Weigh, { label: string; line: string }> = {
  love: { label: 'Love', line: 'she wants them happy' },
  money: { label: 'Money', line: 'she wants them comfortable' },
  alliance: { label: 'An alliance', line: 'she wants the family safe' },
  church: { label: 'The Church', line: 'she wants it blessed and proper' },
  out: { label: 'Out of the life', line: 'she wants the kids out of the life' },
};

export type MatchAnswer = 'bless' | 'grumble' | 'veto' | 'own';

export interface Proposal {
  id: string;
  week: number;
  /** The woman who arranged it. */
  by: string;
  memberId: string;
  spouseId: string;
  houseId: string;
  weigh: Weigh;
  /** Her reasons, in her words. */
  why: string[];
  /** The other family's mother: a character id, or just a name. */
  mother: string;
}

export interface Favor {
  houseId: string;
  /** Who owes it (the other mother's name). */
  from: string;
  week: number;
}

export interface Circle {
  /** 0-100: her standing among the women of the shore. */
  standing: number;
  favors: Favor[];
  made: number;
  vetoed: number;
  called: number;
}

export interface MadeMatch {
  memberId: string;
  spouseId: string;
  houseId: string;
  by: string;
  week: number;
  weigh: Weigh;
  /** How it went through: blessed, grumbled, his own pick, or she went ahead on her own. */
  how: 'bless' | 'grumble' | 'own' | 'hers';
  checked?: boolean;
}

export interface MatchState {
  v: 1;
  open?: Proposal;
  circle: Record<string, Circle>;
  made: MadeMatch[];
  /** Week of her last proposal. */
  last?: number;
  /** Member id → week before which she won't bring him another match (after a veto or a no). */
  rest: Record<string, number>;
  log: [number, string][];
}

export function ensureMatchmakers(s: GameState): MatchState {
  if (!s.matchmakers) s.matchmakers = { v: 1, circle: {}, made: [], rest: {}, log: [] };
  const M = s.matchmakers;
  M.circle ??= {};
  M.made ??= [];
  M.rest ??= {};
  M.log ??= [];
  return M;
}

/* ------------------------------------------------------------------ */
/* Who arranges                                                        */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const roll = (str: string): number => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};
const ageOf = (s: GameState, c: Character) => ageOn(c.birth, s.date);

/** The woman who arranges the house's matches: the wife, else his mother, else the eldest woman of the house. */
export function matronOf(s: GameState): Character | undefined {
  const boss = player(s);
  if (!boss) return undefined;
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife?.alive && wife.gender === 'F' && ageOf(s, wife) >= 18 && datingStage(s, wife.id) !== 'separated') return wife;
  const mom = boss.motherId ? s.characters[boss.motherId] : undefined;
  if (mom?.alive && mom.gender === 'F') return mom;
  const women = Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.gender === 'F' && c.id !== boss.id && c.faction === 'player' && ageOf(s, c) >= 30);
  women.sort((a, b) => ageOf(s, b) - ageOf(s, a) || a.id.localeCompare(b.id));
  return women[0];
}

/** What she is to the boss, in a word. */
export function matronRole(s: GameState, c: Character): string {
  const boss = player(s);
  if (boss?.spouseId === c.id) return 'your wife';
  if (boss?.motherId === c.id) return 'your mother';
  return 'the eldest woman of the house';
}

export function circleOf(s: GameState, id: string): Circle | undefined {
  return s.matchmakers?.circle[id];
}

function ensureCircle(s: GameState, id: string): Circle {
  const M = ensureMatchmakers(s);
  M.circle[id] ??= { standing: 10, favors: [], made: 0, vetoed: 0, called: 0 };
  return M.circle[id];
}

/** Move a woman's standing among the women of the shore (single.ts: the boss's own match). */
export function bumpStanding(s: GameState, id: string, d: number): number {
  const c = ensureCircle(s, id);
  c.standing = clamp(c.standing + d);
  return c.standing;
}

export function standingTitle(n: number): string {
  return n >= 60 ? 'Queen mother of the shore' : n >= 40 ? 'The women listen to her' : n >= 20 ? 'Her circle is growing' : 'A wife of the house';
}

/** A seat in the succession: at 40+ the women's word counts for the heir she favors. */
export const COURT_STANDING = 40;

/* ------------------------------------------------------------------ */
/* What she weighs, and whom she picks                                 */
/* ------------------------------------------------------------------ */

export function weighOf(s: GameState, matron: Character, member: Character): Weigh {
  const r = (k: string) => roll(`${s.seed}|weigh|${matron.id}|${member.id}|${k}`) * 20;
  const boss = player(s);
  const path = s.dyn?.people[member.id]?.path;
  const war = s.rivals.some((x) => x.war || x.feud);
  const sc: Record<Weigh, number> = {
    love: 20 + (hasTrait(matron, 'Charming') ? 12 : 0) + (hasTrait(matron, 'Honest') ? 5 : 0) + r('love'),
    money: 10 + (hasTrait(matron, 'Greedy') ? 28 : 0) + (hasTrait(matron, 'Ambitious') ? 5 : 0) + r('money'),
    alliance: 10 + (hasTrait(matron, 'Ambitious') ? 20 : 0) + (war ? 15 : 0) + r('alliance'),
    church: 10 + (hasTrait(matron, 'Pious') ? 30 : 0) + r('church'),
    out: 8 + (boss?.spouseId === matron.id && kidsWish(s, matron.id) === 'college' ? 22 : 0) + (path === 'straight' || path === 'priest' || path === 'politics' ? 15 : path === 'life' ? -15 : 0) + r('out'),
  };
  return (Object.keys(sc) as Weigh[]).sort((a, b) => sc[b] - sc[a])[0];
}

/** How well a candidate answers what she weighs (0-100ish), with her reason. */
export function herScore(s: GameState, w: Weigh, member: Character, cand: Character, house: House): { v: number; why: string } {
  const gap = Math.abs(ageOf(s, member) - ageOf(s, cand));
  const sweet = roll(`${s.seed}|sweet|${[member.id, cand.id].sort().join('|')}`);
  const pious = hasTrait(cand, 'Pious');
  const same = member.ethnicity === cand.ethnicity;
  const mobby = house.kind === 'mob' || house.kind === 'philly';
  const r = s.rivals.find((x) => x.id === house.faction);
  switch (w) {
    case 'love': return { v: 30 + sweet * 45 + (same ? 8 : 0) - Math.max(0, gap - 4) * 2, why: sweet > 0.55 ? `${member.firstName} and ${cand.firstName} have been sweet on each other since the Holy Name dance` : `${cand.firstName} is kind, and ${member.firstName} laughs around ${cand.gender === 'F' ? 'her' : 'him'}` };
    case 'money': return { v: 20 + Math.min(40, house.dowry / 100) + (house.kind === 'legit' || house.kind === 'political' ? 12 : 0), why: `with ${house.name} comes money, and a name that opens doors on Pacific Avenue` };
    case 'alliance': return { v: 15 + house.strength / 2 + (mobby ? 12 : 0) + (r?.war || r?.feud ? 18 : 0) + (alliedHouse(s, house.id) ? -10 : 0), why: r?.war || r?.feud ? `a wedding ends a war faster than a funeral: make ${house.name} family` : `with ${house.name} as family, we never stand alone` };
    case 'church': return { v: 25 + (same ? 22 : 0) + (pious ? 25 : 0) + (house.kind === 'legit' ? 6 : 0), why: pious ? `${cand.firstName} never misses the nine o'clock Mass` : `the same parish, the same saints: Father will be pleased` };
    case 'out': return { v: 30 + (house.kind === 'legit' ? 30 : house.kind === 'political' ? 12 : -28), why: house.kind === 'legit' ? `a decent family, ${house.name}, with a business in the daylight: ${member.firstName} gets out of this life` : `${house.name}: politics, not our business` };
  }
}

/** Her ranked picks for one of ours (best first). */
export function herPicks(s: GameState, matron: Character, member: Character): { c: Character; house: House; v: number; why: string; ok: number }[] {
  const w = weighOf(s, matron, member);
  return matchCandidates(s, member)
    .filter((x) => !marriageBlock(s, member, x.c))
    .map((x) => {
      const h = herScore(s, w, member, x.c, x.house);
      const ok = marriageAcceptance(s, member, x.c).chance;
      return { c: x.c, house: x.house, v: h.v + ok * 30, why: h.why, ok };
    })
    .sort((a, b) => b.v - a.v || a.c.id.localeCompare(b.c.id));
}

/** The other family's mother: the head's wife if we know her, else just "Mrs. <name>". */
function otherMother(s: GameState, house: House, cand: Character): string {
  const head = s.characters[house.headId];
  const w = head?.spouseId ? s.characters[head.spouseId] : undefined;
  if (w?.alive && w.gender === 'F') return w.id;
  const mom = cand.motherId ? s.characters[cand.motherId] : undefined;
  if (mom?.alive) return mom.id;
  return `Mrs. ${head?.lastName ?? cand.lastName}`;
}

export function motherName(s: GameState, m: string): string {
  const c = s.characters[m];
  return c ? `${c.firstName} ${c.lastName}` : m;
}

/** Members of the house she would arrange for: grown, free, not the boss himself, not resting after a no. */
export function arrangeable(s: GameState): Character[] {
  const matron = matronOf(s);
  const rest = s.matchmakers?.rest ?? {};
  return ourMarriageable(s).filter((c) => c.id !== s.playerId && c.id !== matron?.id && ageOf(s, c) <= 40 && (rest[c.id] ?? -1) <= s.week);
}

function makeProposal(s: GameState, matron: Character, member: Character): Proposal | undefined {
  const pick = herPicks(s, matron, member)[0];
  if (!pick) return undefined;
  const w = weighOf(s, matron, member);
  const why = [pick.why, `${WEIGH_TEXT[w].line}`];
  if (pick.ok >= 0.6) why.push(`she has already asked ${pick.house.name}, the way women ask, and they lean yes`);
  return { id: `mm${s.week}_${member.id}`, week: s.week, by: matron.id, memberId: member.id, spouseId: pick.c.id, houseId: pick.house.id, weigh: w, why, mother: otherMother(s, pick.house, pick.c) };
}

/** Is the open proposal still possible? */
export function openProposal(s: GameState): Proposal | undefined {
  const p = s.matchmakers?.open;
  if (!p) return undefined;
  const m = s.characters[p.memberId];
  const sp = s.characters[p.spouseId];
  const by = s.characters[p.by];
  if (!by?.alive || marriageBlock(s, m, sp)) return undefined;
  return p;
}

/* ------------------------------------------------------------------ */
/* The odds                                                            */
/* ------------------------------------------------------------------ */

type Side = 'them' | 'young' | 'her';
interface SideReason extends Reason { side: Side }

/** Her coffee terms: she gets a better dowry than the house asks, more as her standing grows. */
export function coffeeDowry(s: GameState, member: Character, house: House, by: string, matrilineal = false): number {
  const base = dowryFor(s, member, house, matrilineal);
  const st = circleOf(s, by)?.standing ?? 10;
  const k = 1 + st / 250;
  return Math.round((base > 0 ? base * k : base / k) / 100) * 100;
}

function reasonsFor(s: GameState, by: Character, member: Character, spouse: Character, answer: MatchAnswer, weigh: Weigh): SideReason[] {
  const out: SideReason[] = [];
  const house = houseOf(s, spouse.id);
  const theirs = marriageAcceptance(s, member, spouse).chance;
  out.push({ side: 'them', label: `${house?.name ?? 'Their family'}, over coffee`, value: Math.round((theirs * 100 - 50) * 0.6) });
  const c = circleOf(s, by.id);
  const st = c?.standing ?? 10;
  if (st >= 15) out.push({ side: 'them', label: `${by.firstName}'s standing among the women`, value: Math.round(st / 5) });
  if (house && c?.favors.some((f) => f.houseId === house.id)) out.push({ side: 'them', label: `${house.name}'s mother owes ${by.firstName} a favor`, value: 8 });
  // The young person's own mind.
  if (weigh === 'love' && answer !== 'own') out.push({ side: 'young', label: `${member.firstName} likes ${spouse.firstName}`, value: 10 });
  const seeing = activeRomances(s, member.id).length > 0;
  if (seeing) out.push({ side: 'young', label: `${member.firstName} is seeing someone else`, value: -25 });
  if (fam(s, member.id).goal === 'marry_well') out.push({ side: 'young', label: `${member.firstName} wants to marry well`, value: 8 });
  const gap = Math.abs(ageOf(s, member) - ageOf(s, spouse));
  if (gap > 10) out.push({ side: 'young', label: `${gap} years apart`, value: -10 });
  const trust = opinion(s, member.id, by.id);
  if (trust) out.push({ side: 'young', label: `${member.firstName} ${trust >= 0 ? 'trusts' : 'does not trust'} ${by.firstName}'s eye`, value: clamp(trust / 5, -10, 10) });
  if (answer === 'bless') out.push({ side: 'young', label: 'Your blessing', value: 5 });
  if (answer === 'grumble') out.push({ side: 'young', label: 'You grumbled at the table', value: -3 });
  if (answer === 'own') {
    // It goes through her: she may push back.
    const best = herPicks(s, by, member)[0];
    const mine = house ? herScore(s, weigh, member, spouse, house).v + theirs * 30 : 0;
    const diff = best ? best.v - mine : 0;
    if (best && best.c.id === spouse.id) out.push({ side: 'her', label: `${by.firstName} had the same one in mind`, value: 10 });
    else if (diff > 5) out.push({ side: 'her', label: `${by.firstName} has her doubts: not who she would pick`, value: -Math.min(25, Math.round(diff / 2)) });
    else out.push({ side: 'her', label: `${by.firstName} can live with your pick`, value: 3 });
    const op = opinion(s, by.id, s.playerId);
    out.push({ side: 'her', label: `What ${by.firstName} thinks of you`, value: clamp(op / 5, -12, 12) });
  }
  return out.filter((r) => r.value !== 0);
}

export function matchOdds(s: GameState, by: Character, member: Character, spouse: Character, answer: MatchAnswer, weigh: Weigh): Acceptance {
  const rs: { label: string; value: number }[] = reasonsFor(s, by, member, spouse, answer, weigh).map(({ label, value }) => ({ label, value }));
  // The boss asking himself: his charm (newSkills.ts).
  if (by.id === s.playerId) rs.push(...charmReasons(s, 'match'));
  const base = 62;
  const sum = rs.reduce((a, r) => a + r.value, base);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons: [{ label: 'Base', value: base }, ...rs] };
}

/** Who said no: weighted by which side's reasons ran lowest. */
function whoRefused(s: GameState, by: Character, member: Character, spouse: Character, answer: MatchAnswer, weigh: Weigh, key: string): Side {
  const rs = reasonsFor(s, by, member, spouse, answer, weigh);
  const sides: Side[] = answer === 'own' ? ['them', 'young', 'her'] : ['them', 'young'];
  const w = sides.map((sd) => Math.max(5, 40 - rs.filter((r) => r.side === sd).reduce((a, r) => a + r.value, 0)));
  let x = roll(`${s.seed}|${s.week}|whono|${key}`) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < sides.length; i++) { x -= w[i]; if (x < 0) return sides[i]; }
  return sides[0];
}

/* ------------------------------------------------------------------ */
/* Orders (bond ops on her: bonds.ts delegates here)                   */
/* ------------------------------------------------------------------ */

export type MatchAction =
  | { op: 'match'; id: string; answer: MatchAnswer; memberId?: string; spouseId?: string; /** His pick only: the husband joins our house. */ matrilineal?: boolean }
  | { op: 'herFavor'; id: string; kind: FavorKind; houseId: string };

export type MatchOp = MatchAction
  | { op: 'matchNo'; id: string; answer: MatchAnswer; memberId: string; spouseId: string }
  | { op: 'knewBest'; id: string; good: boolean; quiet?: boolean };

export type FavorKind = 'peace' | 'priest' | 'word';
export const FAVOR_TEXT: Record<FavorKind, { label: string; detail: string }> = {
  peace: { label: 'A peace feeler', detail: 'The two mothers talk; the men follow. Their family thinks better of yours.' },
  priest: { label: 'A word to the priest', detail: 'The other mother has the monsignor\'s ear. A sermon about forgiveness; the town cools.' },
  word: { label: 'What the wives say', detail: 'Kitchen talk about their husband: something you can use.' },
};

// The chip says it all (describeMatchOp names her): the label is her name, so it is not repeated.
const X = (op: MatchOp, who: string): Effect => ({ type: 'bond', op, label: who }) as Effect;

/** Which match an answer is about: the open proposal, or his own pick. */
function subject(s: GameState, a: Extract<MatchAction, { op: 'match' }>): { member?: Character; spouse?: Character; weigh: Weigh; prop?: Proposal } {
  const prop = openProposal(s);
  const by = s.characters[a.id];
  if (a.answer === 'own') {
    const member = a.memberId ? s.characters[a.memberId] : undefined;
    const spouse = a.spouseId ? s.characters[a.spouseId] : undefined;
    return { member, spouse, weigh: by && member ? weighOf(s, by, member) : 'love', prop: prop && prop.memberId === a.memberId ? prop : undefined };
  }
  return { member: prop ? s.characters[prop.memberId] : undefined, spouse: prop ? s.characters[prop.spouseId] : undefined, weigh: prop?.weigh ?? 'love', prop };
}

export const ANSWER_TITLE: Record<MatchAnswer, string> = {
  bless: 'Bless the match', grumble: 'Grumble, but let her have it', veto: 'Put your foot down', own: 'Ask her to arrange your pick',
};

export function previewMatchmaker(s: GameState, a: MatchAction): ActionPreview {
  const by = s.characters[a.id];
  const base: ActionPreview = { title: a.op === 'match' ? ANSWER_TITLE[a.answer] : 'Call in a favor', effects: [], cost: 0, because: 'answered the matchmaker', category: 'event' };
  if (!by?.alive) return { ...base, disabledReason: 'She is not here' };
  if (matronOf(s)?.id !== by.id) return { ...base, disabledReason: `${by.firstName} does not arrange the matches` };
  if (a.op === 'herFavor') return previewFavor(s, a, by, base);
  const { member, spouse, weigh, prop } = subject(s, a);
  if (!member || !spouse) return { ...base, disabledReason: a.answer === 'own' ? 'Pick one of ours and a match' : 'She has no match waiting' };
  const block = marriageBlock(s, member, spouse);
  if (block) return { ...base, disabledReason: block };
  if (ageOf(s, member) < 18 || ageOf(s, spouse) < 18) return { ...base, disabledReason: 'Too young to marry' };
  const house = houseOf(s, spouse.id);
  if (!house) return { ...base, disabledReason: 'Not from a house you can deal with' };
  const pair = `${member.firstName} and ${spouse.firstName} ${spouse.lastName}`;
  const title = `${ANSWER_TITLE[a.answer]}: ${pair}`;
  const mother = prop?.mother ?? otherMother(s, house, spouse);
  const label = `Marriage: ${pair}`;
  if (a.answer === 'veto') {
    return {
      ...base, title,
      effects: [X(a, by.firstName), ...(s.characters[house.headId]?.alive ? [{ type: 'opinion', from: house.headId, to: s.playerId, amount: -4, reason: 'Turned down our child', decay: 1, label: title } as Effect] : [])],
      detail: `No roll: it is your house. ${by.firstName} will not forget it, and by Sunday every kitchen on Pacific Avenue knows you overruled her. Her standing takes a hit; ${member.firstName} stays single for now.`,
      because: `overruled ${by.firstName} on ${member.firstName}'s match`,
      verb: 'Veto it',
    };
  }
  const matri = a.answer === 'own' && !!a.matrilineal && member.gender === 'F';
  const dowry = coffeeDowry(s, member, house, by.id, matri);
  const effects: Effect[] = [X(a, by.firstName), { type: 'dyn', op: { op: 'marry', memberId: member.id, spouseId: spouse.id, matrilineal: matri }, label }];
  if (dowry) effects.push({ type: 'money', amount: dowry, label: `${label}: dowry ${dowry > 0 ? 'received' : 'paid'}` });
  const acc = matchOdds(s, by, member, spouse, a.answer, weigh);
  const coffee = `Coffee in ${motherName(s, mother)}'s kitchen settles the terms: ${dowry > 0 ? `they pay a dowry of $${dowry.toLocaleString('en-US')}` : dowry < 0 ? `we pay $${(-dowry).toLocaleString('en-US')}` : 'no dowry'}, the church, the date.`;
  const words: Record<MatchAnswer, string> = {
    bless: `${by.firstName} is pleased; her standing rises.`,
    grumble: `Her standing still rises. She heard the grumble, and thinks a little less of you.`,
    veto: '',
    own: `It goes through ${by.firstName}: she may push back. A smaller rise in her standing; it was your pick.`,
  };
  return {
    ...base, title, effects, cost: dowry < 0 ? -dowry : 0,
    detail: `${coffee} ${words[a.answer]} ${member.firstName} decides too: nobody is married against their will.`,
    acceptance: acc,
    oddsLabel: 'They all say yes',
    refuseEffects: [X({ op: 'matchNo', id: by.id, answer: a.answer, memberId: member.id, spouseId: spouse.id }, by.firstName)],
    disabledReason: dowry < 0 && s.money < -dowry ? `Needs $${(-dowry).toLocaleString('en-US')} for the dowry` : undefined,
    because: a.answer === 'own' ? `asked ${by.firstName} to arrange ${member.firstName} and ${spouse.firstName}` : `${a.answer === 'bless' ? 'blessed' : 'grumbled at, and accepted,'} ${by.firstName}'s match for ${member.firstName}`,
    verb: a.answer === 'bless' ? 'Bless it' : a.answer === 'grumble' ? 'Grumble, accept' : 'Ask her',
  };
}

function favorHouse(s: GameState, by: string, houseId: string): { f?: Favor; house?: House } {
  const c = circleOf(s, by);
  return { f: c?.favors.find((x) => x.houseId === houseId), house: houseById(s, houseId) };
}

function previewFavor(s: GameState, a: Extract<MatchAction, { op: 'herFavor' }>, by: Character, base: ActionPreview): ActionPreview {
  const { f, house } = favorHouse(s, by.id, a.houseId);
  if (!f || !house) return { ...base, disabledReason: 'Nobody owes her that' };
  const head = s.characters[house.headId];
  const title = `${FAVOR_TEXT[a.kind].label}: ${f.from}`;
  const label = `${by.firstName} calls in a favor`;
  const fx: Effect[] = [X(a, by.firstName)];
  const rival = house.faction && house.faction !== 'player' && house.faction !== 'none' && house.faction !== 'law' ? house.faction as RivalId : undefined;
  if (a.kind === 'peace') {
    if (!head?.alive) return { ...base, title, disabledReason: 'Nobody at the head of that house' };
    fx.push({ type: 'opinion', from: head.id, to: s.playerId, amount: 12, reason: 'Our wives talked', decay: 1, label });
    if (rival) fx.push({ type: 'rivalOpinion', rival, amount: 8, reason: 'The mothers talked', label });
  } else if (a.kind === 'priest') {
    fx.push({ type: 'heat', bar: 'local', amount: -3, label }, { type: 'respect', amount: 1, label });
  } else {
    if (!head?.alive) return { ...base, title, disabledReason: 'Nobody at the head of that house' };
    fx.push({ type: 'hook', targetId: head.id, strong: false, reason: `what the wives say about ${head.firstName}`, label });
  }
  return { ...base, title, effects: fx, detail: `${FAVOR_TEXT[a.kind].detail} Spends the favor ${f.from} owes ${by.firstName}.`, because: `had ${by.firstName} call in a favor from ${f.from}`, verb: 'Ask her' };
}

export function describeMatchOp(s: GameState, o: MatchOp): string | undefined {
  const by = s.characters[o.id];
  if (!by) return undefined;
  const n = by.firstName;
  if (o.op === 'herFavor') return `${n} spends a favor owed to her`;
  if (o.op === 'matchNo') return `Someone says no: ${n}'s standing barely moves, and nobody is forced`;
  if (o.op === 'knewBest') return o.good ? `${n}'s standing rises: the match was a good one` : `${n}'s standing`;
  switch (o.answer) {
    case 'bless': return `${n}'s standing +8 · she is pleased · a favor owed to her`;
    case 'grumble': return `${n}'s standing +6 · she heard you grumble, and thinks a little less of you`;
    case 'veto': return `${n}'s standing −6 · she is hurt · the women talk`;
    case 'own': return `${n}'s standing +3 · a favor owed to her`;
  }
}

function mlog(s: GameState, text: string): void {
  const M = ensureMatchmakers(s);
  M.log.push([s.week, text]);
  if (M.log.length > 30) M.log.splice(0, M.log.length - 30);
}

/** Opinion on her, and her tie with the boss when she is his wife. */
function feel(s: GameState, by: Character, reason: string, v: number, axes?: Parameters<typeof nudge>[1], mem?: string): void {
  addOpinion(s, by.id, s.playerId, reason, v, 1);
  const t = s.characters[s.playerId]?.spouseId === by.id ? ensureTie(s, by.id) : undefined;
  if (t && axes) nudge(t, axes);
  if (t && mem) remember(s, t, v >= 0 ? 'family' : 'fight', mem, v);
}

/** The match went through: her standing, the favor owed, the record for a year on. */
function madeIt(ctx: Ctx, by: Character, member: Character, spouse: Character, how: MadeMatch['how'], weigh: Weigh, mother: string): void {
  const s = ctx.s;
  const M = ensureMatchmakers(s);
  const c = ensureCircle(s, by.id);
  const house = houseOf(s, spouse.id);
  const gain = how === 'bless' ? 8 : how === 'grumble' ? 6 : how === 'hers' ? 7 : 3;
  c.standing = clamp(c.standing + gain);
  c.made++;
  const from = motherName(s, mother);
  if (house) {
    c.favors = c.favors.filter((f) => f.houseId !== house.id);
    c.favors.push({ houseId: house.id, from, week: s.week });
    if (c.favors.length > 8) c.favors.shift();
  }
  if (s.characters[mother]?.alive) addOpinion(s, mother, by.id, 'Our children are married', 15, 0);
  M.made.push({ memberId: member.id, spouseId: spouse.id, houseId: house?.id ?? '', by: by.id, week: s.week, weigh, how });
  if (M.made.length > 40) M.made.shift();
  if (M.open && M.open.memberId === member.id) M.open = undefined;
  const line = `${by.firstName} made the match: ${member.firstName} and ${spouse.firstName}. ${from} owes her a favor now; the women of the shore take note (standing ${c.standing}).`;
  ctx.log.push(line);
  mlog(s, line);
}

export function applyMatchOp(ctx: Ctx, o: MatchOp): void {
  const s = ctx.s;
  const by = s.characters[o.id];
  if (!by?.alive) return;
  if (o.op === 'knewBest') { applyKnewBest(ctx, o.id, o.good, o.quiet); return; }
  const M = ensureMatchmakers(s);
  const c = ensureCircle(s, by.id);
  if (o.op === 'herFavor') {
    const { f } = favorHouse(s, by.id, o.houseId);
    if (!f) return;
    c.favors = c.favors.filter((x) => x !== f);
    c.called++;
    const line = `${by.firstName} called in ${f.from}'s favor: ${FAVOR_TEXT[o.kind].label.toLowerCase()}.`;
    ctx.log.push(line);
    mlog(s, line);
    return;
  }
  if (o.op === 'matchNo') {
    const member = s.characters[o.memberId];
    const spouse = s.characters[o.spouseId];
    if (!member || !spouse) return;
    const weigh = M.open?.memberId === member.id ? M.open.weigh : weighOf(s, by, member);
    const who = whoRefused(s, by, member, spouse, o.answer, weigh, `${member.id}|${spouse.id}`);
    let line: string;
    if (who === 'young') {
      line = `${member.firstName} said no to ${spouse.firstName}. Nobody makes ${member.gender === 'F' ? 'her' : 'him'}; ${by.firstName} says the right one will come.`;
      c.standing = clamp(c.standing + 1);
    } else if (who === 'her') {
      line = `${by.firstName} would not carry it. "Not that family," she said, and poured the coffee.`;
      feel(s, by, 'Pushed a match I did not want', -3);
    } else {
      line = `Over coffee, ${spouse.firstName}'s mother said ${spouse.gender === 'F' ? 'her daughter' : 'her son'} is promised elsewhere. Polite, and final.`;
      c.standing = clamp(c.standing - 2);
    }
    if (M.open?.memberId === member.id) M.open = undefined;
    M.rest[member.id] = s.week + 13;
    ctx.log.push(line);
    mlog(s, line);
    return;
  }
  const { member, spouse, weigh, prop } = subject(s, o);
  if (!member || !spouse) return;
  if (o.answer === 'veto') {
    c.standing = clamp(c.standing - 6);
    c.vetoed++;
    feel(s, by, 'Put his foot down on my match', -12, { resent: 10, aff: -5, respect: -3 }, `the match for ${member.firstName} he would not allow`);
    M.open = undefined;
    M.rest[member.id] = s.week + 26;
    const line = `You overruled ${by.firstName}: no match for ${member.firstName}. The women talk: by Sunday every kitchen on Pacific Avenue knows it.`;
    ctx.log.push(line);
    mlog(s, line);
    return;
  }
  // Accepted: the marriage itself is the 'dyn marry' effect after this one.
  if (marriageBlock(s, member, spouse)) return;
  if (o.answer === 'bless') feel(s, by, 'Trusted me with the children', 6, { respect: 5, aff: 3, trust: 3 }, `the day he blessed ${member.firstName}'s match`);
  else if (o.answer === 'grumble') feel(s, by, 'Grumbled at my match', -4, { resent: 3, aff: -1 });
  else if (prop && prop.spouseId !== spouse.id) feel(s, by, 'Set my match aside', -3, { resent: 2 });
  madeIt(ctx, by, member, spouse, o.answer === 'own' ? 'own' : o.answer, weigh, prop?.mother ?? otherMother(s, houseOf(s, spouse.id)!, spouse));
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

export const PROPOSAL_YEARLY = 0.6;
export const PROPOSAL_GAP = 8;
/** Weeks of silence before she goes ahead on her own. */
export const SILENCE_WEEKS = 6;

export function matchmakersWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver || !s.dyn?.houses?.length || s.week < 4) return;
  const matron = matronOf(s);
  if (!matron) return;
  const M0 = s.matchmakers;
  // A proposal left unanswered: the mom knows best; she goes ahead.
  if (M0?.open) {
    const p = openProposal(s);
    if (!p || p.by !== matron.id) { M0.open = undefined; return; }
    if (s.week - p.week < SILENCE_WEEKS) return;
    const member = s.characters[p.memberId];
    const spouse = s.characters[p.spouseId];
    const acc = matchOdds(s, matron, member, spouse, 'bless', p.weigh);
    if (roll(`${s.seed}|${s.week}|silence|${p.id}`) < acc.chance) {
      const house = houseOf(s, spouse.id)!;
      const dowry = coffeeDowry(s, member, house, matron.id);
      ctx.log.push(`You never answered ${matron.firstName} about ${member.firstName}, so she took it as a yes.`);
      applyMatchOpSilent(ctx, matron, member, spouse, p, dowry);
    } else {
      applyMatchOp(ctx, { op: 'matchNo', id: matron.id, answer: 'bless', memberId: member.id, spouseId: spouse.id });
    }
    return;
  }
  if (M0?.last !== undefined && s.week - M0.last < PROPOSAL_GAP) return;
  const young = arrangeable(s);
  if (!young.length) return;
  const p = 1 - Math.pow(1 - PROPOSAL_YEARLY, young.length / 52);
  if (roll(`${s.seed}|${s.week}|hermatch`) > p) return;
  young.sort((a, b) => ageOf(s, b) - ageOf(s, a) || a.id.localeCompare(b.id));
  const member = young[Math.floor(roll(`${s.seed}|${s.week}|hermatchwho`) * Math.min(3, young.length))];
  const prop = makeProposal(s, matron, member);
  if (!prop) return;
  const M = ensureMatchmakers(s);
  ensureCircle(s, matron.id);
  M.open = prop;
  M.last = s.week;
  const sp = s.characters[prop.spouseId];
  const line = `${matron.firstName} has found a match for ${member.firstName}: ${sp.firstName} ${sp.lastName}. She wants your answer.`;
  ctx.log.push(line);
  mlog(s, line);
}

/** She went ahead without his answer: the marriage, the dowry, her standing. */
function applyMatchOpSilent(ctx: Ctx, matron: Character, member: Character, spouse: Character, p: Proposal, dowry: number): void {
  // The marriage through the same engine path as an order (the dyn op → familyMarriage).
  applyEffects(ctx, [
    { type: 'dyn', op: { op: 'marry', memberId: member.id, spouseId: spouse.id, matrilineal: false }, label: `Marriage: ${member.firstName} and ${spouse.firstName}` },
    ...(dowry ? [{ type: 'money', amount: dowry, label: `Marriage: dowry ${dowry > 0 ? 'received' : 'paid'}` } as Effect] : []),
  ], { label: `${matron.firstName} made the match`, because: `let ${matron.firstName} have her way`, category: 'event' });
  if (!member.spouseId) return;
  madeIt(ctx, matron, member, spouse, 'hers', p.weigh, p.mother);
}

/* ------------------------------------------------------------------ */
/* A year on: the mom knows best                                       */
/* ------------------------------------------------------------------ */

export function momKnowsBestSource(s: GameState): EventInstance | undefined {
  const M = s.matchmakers;
  if (!M || s.gameOver) return undefined;
  const m = M.made.find((x) => !x.checked && s.week - x.week >= 52);
  if (!m) return undefined;
  m.checked = true;
  const a = s.characters[m.memberId];
  const b = s.characters[m.spouseId];
  const by = s.characters[m.by];
  if (!a?.alive || !b?.alive || a.spouseId !== b.id || !by?.alive) return undefined;
  const house = houseById(s, m.houseId);
  const head = house ? s.characters[house.headId] : undefined;
  const hers = m.how !== 'own';
  const good = hers || roll(`${s.seed}|yearon|${a.id}|${b.id}`) < 0.5;
  const label = `A year on: ${a.firstName} and ${b.firstName}`;
  const fx: Effect[] = good
    ? [
      { type: 'opinion', from: a.id, to: b.id, amount: 10, reason: 'A good marriage', decay: 0, label },
      { type: 'opinion', from: b.id, to: a.id, amount: 10, reason: 'A good marriage', decay: 0, label },
      ...(head?.alive ? [{ type: 'opinion', from: head.id, to: s.playerId, amount: 8, reason: 'The match was a good one', decay: 1, label } as Effect] : []),
    ]
    : [
      { type: 'opinion', from: a.id, to: b.id, amount: -8, reason: 'Fights in the kitchen', decay: 1, label },
      ...(head?.alive ? [{ type: 'opinion', from: head.id, to: s.playerId, amount: -4, reason: 'Our child is unhappy', decay: 1, label } as Effect] : []),
    ];
  const W = WEIGH_TEXT[m.weigh].label.toLowerCase();
  const text = good
    ? hers
      ? `A year since ${by.firstName} made the match. ${a.firstName} and ${b.firstName} are happy, ${m.weigh === 'money' ? 'comfortable' : m.weigh === 'alliance' ? `and ${house?.name ?? 'their family'} stands with yours` : m.weigh === 'church' ? 'in the front pew every Sunday' : m.weigh === 'out' ? 'and nowhere near this life' : 'and it shows'}. She weighed ${W}, and she was right. The mom knows best.`
      : `A year since your pick. ${a.firstName} and ${b.firstName} are getting along fine. ${by.firstName} says nothing, which is how you know she is surprised.`
    : `A year since your pick, and it is not going well. ${a.firstName} and ${b.firstName} fight in the kitchen; ${b.firstName}'s mother has called ${by.firstName} twice. ${by.firstName} says nothing. She does not have to.`;
  const iid = `ev${s.nextId++}`;
  const right = { type: 'bond', op: { op: 'knewBest', id: by.id, good }, label } as Effect;
  return {
    iid, defId: 'mom_knows_best', week: s.week, mandatory: false, priority: 40,
    title: good && hers ? 'The mom knows best' : label, text,
    defaultChoiceId: 'quiet', actors: [by.id, a.id, b.id], meta: { who: by.id, theme: 'family' },
    choices: [
      { id: 'right', label: good ? `Tell ${by.firstName} she was right` : `Tell ${by.firstName} she was right all along`, detail: 'She will remember you said it.', because: `told ${by.firstName} she was right`, effects: [...fx, right, { type: 'opinion', from: by.id, to: s.playerId, amount: 8, reason: 'Told me I was right', decay: 1, label }] },
      { id: 'quiet', label: 'Keep it to yourself', detail: 'She knows anyway.', because: `kept quiet about ${a.firstName}'s marriage`, effects: [...fx, { ...right, op: { op: 'knewBest', id: by.id, good, quiet: true } } as Effect] },
    ],
  };
}

/** The year-on beat's own op: her standing. */
export function applyKnewBest(ctx: Ctx, id: string, good: boolean, quiet?: boolean): void {
  const s = ctx.s;
  if (!s.characters[id]?.alive) return;
  const c = ensureCircle(s, id);
  c.standing = clamp(c.standing + (good ? (quiet ? 2 : 4) : -1));
  if (good) mlog(s, `${s.characters[id].firstName}'s match turned out well; the women of the shore say so.`);
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

/** Her standing's place in the succession: at COURT_STANDING+ her word counts for her own children. */
export function courtWord(s: GameState, claimantId: string): number {
  const matron = matronOf(s);
  const c = matron ? circleOf(s, matron.id) : undefined;
  if (!matron || !c || c.standing < COURT_STANDING) return 0;
  const k = s.characters[claimantId];
  if (!k || (k.motherId !== matron.id && !matron.childrenIds.includes(k.id))) return 0;
  return Math.min(10, Math.round(c.standing / 8));
}

export interface CircleView {
  matron: Character;
  role: string;
  circle: Circle;
  title: string;
  court: boolean;
  recent: [number, string][];
}

export function circleView(s: GameState, id?: string): CircleView | undefined {
  const matron = id ? s.characters[id] : matronOf(s);
  if (!matron) return undefined;
  const c = circleOf(s, matron.id);
  if (!c) return undefined;
  return { matron, role: matronRole(s, matron), circle: c, title: standingTitle(c.standing), court: c.standing >= COURT_STANDING, recent: (s.matchmakers?.log ?? []).slice(-5).reverse() };
}

export function proposalView(s: GameState): { p: Proposal; by: Character; member: Character; spouse: Character; house: House; odds: Acceptance; dowry: number } | undefined {
  const p = openProposal(s);
  if (!p) return undefined;
  const by = s.characters[p.by];
  const member = s.characters[p.memberId];
  const spouse = s.characters[p.spouseId];
  const house = houseById(s, p.houseId);
  if (!house) return undefined;
  return { p, by, member, spouse, house, odds: matchOdds(s, by, member, spouse, 'bless', p.weigh), dowry: coffeeDowry(s, member, house, by.id) };
}

export { displayName };
