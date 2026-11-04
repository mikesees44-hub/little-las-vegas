import { ageOn, isInSeason } from './calendar';
import { displayName, hasTrait, isFree, player } from './characters';
import { herDecision, maybeConceive } from './dating';
import { adultOn, datingEvenings, ensureDating } from './datingState';
import { applyEffects } from './effects';
import { activeGoomars, isGoomar } from './goomar';
import { appeal } from './looks';
import { addOpinion, opinion } from './relations';
import { drawnTo, kin, romanceBetween, startRomance } from './romance';
import { roundSlots } from './rounds';
import { hashSeed } from './rng';
import { addSecret } from './secrets';
import { registerLoverSource } from './travelState';
import { ADULT_ROLES, type NightlifeState } from './nightlifeState';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Ctx } from './ledger';
import type { NightOp } from './nightlife';
import type { Character, Effect, FactionId, GameState } from './types';

/**
 * AN EVENING WITH HER, as a short choice flow (ui/nightlife/EveningFlow.tsx):
 *
 *  1. The kind of evening (just the release, a night on the town, a romantic
 *     getaway with a cover story for your wife, or the club with your
 *     people) and the approach (treat her like a queen, one night, make it
 *     something).
 *  2. With a professional (an escort, a call girl, a dancer who offers
 *     company, a street worker): her price for the night, and the haggle
 *     (accept, counter, sweeten it, a line, or walk). She has heard every
 *     line.
 *  3. Tonight: one small thing happens (a capo's wife at the next table, a
 *     photographer, a rival, she asks for something) and you choose; on the
 *     warmer evenings she asks, "But do you want me, or just my body?";
 *     and you may ask her to stay. She decides that too.
 *
 * Everything the player picks travels in one order (NightOp 'invite'), so
 * the week resolves it once, deterministically, and her yes is rolled like
 * every other "she decides" in the game. The pure helpers here show each
 * card's numbers before the choice.
 *
 * Rules: adults only (checked on the day, at every step and when it
 * happens); she can say no (her price, her mood, how you have treated her,
 * the danger of being seen with you), and then nothing is paid; no
 * coercion, nobody is a gift; non-explicit one-line reports that fade; with
 * mature content Off the paid evenings are not offered and nobody is asked
 * to stay.
 */

export type EveningKind = 'release' | 'town' | 'getaway' | 'club';
export type Approach = 'queen' | 'night' | 'something';
export type Dest = 'capemay' | 'ac' | 'nyc';
export type Cover = 'business' | 'fishing' | 'sitdown';
export type Answer = 'you' | 'paid' | 'both' | 'dunno';
export type BeatId = 'capowife' | 'photo' | 'rival' | 'asks';

export interface EveningPlan {
  id: string;
  kind: EveningKind;
  /** Just the release: where (a motel on Route 9: a room for the night, cheap, and nobody asks). */
  at?: 'office' | 'hotel' | 'motel';
  dest?: Dest;
  cover?: Cover;
  approach: Approach;
  /** A professional's fee for the night, as agreed in the haggle. */
  price?: number;
  /** A tip promised on top (sweetening the deal). */
  tip?: number;
  /** Your answer to her question (when she asks it). */
  answer?: Answer;
  /** Tonight's beat and what you did. */
  beat?: BeatId;
  pick?: string;
  stay: boolean;
}

/** A motel room on Route 9 for the night (1960 dollars): cash, a key on a plastic diamond, no questions. */
export const MOTEL_ROOM = 12;

export const KIND_INFO: Record<EveningKind, { label: string; text: string; hours: number; evenings: number }> = {
  release: { label: 'Just the release', text: 'A quiet night in: no dinner, no talk. The most stress off you, the cheapest, the shortest (about 2 hours). Little attachment.', hours: 2, evenings: 1 },
  town: { label: 'A night on the town', text: 'Dinner, the clubs, drinks, seen out together. Fun, a lot of stress off you, and the likeliest way for your wife and her people to hear; gossip, rivals and cops notice.', hours: 4, evenings: 1 },
  getaway: { label: 'A romantic getaway', text: 'You take her away for a day or two. Money and two of your evenings; she gets attached. You need a cover story for your wife, and it can unravel.', hours: 30, evenings: 2 },
  club: { label: 'Bring her to the club with your people', text: 'You don\'t care who sees. Some of the young men like the swagger; the old-school capos and the consigliere do not. Your wife will almost surely hear, and the other families learn your weakness.', hours: 4, evenings: 1 },
};
export const APPROACH_LABEL: Record<Approach, string> = { queen: 'Treat her like a queen', night: 'One night', something: 'Make it something' };
export const APPROACH_TEXT: Record<Approach, string> = {
  queen: 'The best of everything, a gift, all your attention. Costs more; she warms to you and may start to see you differently.',
  night: 'Keep it simple, no promises. Cheaper; she knows the score. It can sting if she wanted more.',
  something: 'You want this to go somewhere. It can start something real (the road to seeing each other, and a goomar), and it raises her hopes and the jealousy around you.',
};
export const DEST_INFO: Record<Dest, { label: string; cost: number }> = {
  capemay: { label: 'An inn in Cape May', cost: 150 }, ac: { label: 'A suite in Atlantic City', cost: 260 }, nyc: { label: 'New York: the Plaza and a show', cost: 520 },
};
export const COVER_INFO: Record<Cover, { label: string; unravel: number }> = {
  business: { label: 'A business trip to Philadelphia', unravel: 0.15 }, fishing: { label: 'Fishing with the boys off Cape May', unravel: 0.25 }, sitdown: { label: 'A sit-down out of town', unravel: 0.1 },
};
export const ANSWER_INFO: Record<Answer, { label: string; text: string }> = {
  you: { label: '"You."', text: 'Honest, if you mean it: her attachment grows; she may test it.' },
  paid: { label: '"Does it matter? You\'re getting paid."', text: 'Cold. Fine for one night; it ends any road past that.' },
  both: { label: '"Both."', text: 'A charm roll: she laughs, or she doesn\'t.' },
  dunno: { label: '"I don\'t know yet."', text: 'Honest; a small plus.' },
};
export const BEAT_INFO: Record<BeatId, { title: string; text: string; picks: { id: string; label: string; text: string; cost?: number }[] }> = {
  capowife: { title: 'A capo\'s wife at the next table', text: 'Your capo\'s wife is two tables over, and she has seen you.', picks: [
    { id: 'greet', label: 'Say hello, introduce her as a friend', text: 'Bold. She may believe it; she may tell your wife.' },
    { id: 'leave', label: 'Pay up and take her somewhere else', text: 'Safer. The evening is shorter; she notices you hid her.' },
    { id: 'ignore', label: 'Pretend you didn\'t see', text: 'She saw you. Talk is likelier.' },
  ] },
  photo: { title: 'A photographer', text: 'A man from the Leader with a Speed Graphic gets a shot of the two of you.', picks: [
    { id: 'pay', label: 'Buy the film ($100)', text: 'The picture goes away. Probably.', cost: 100 },
    { id: 'ignore', label: 'Let it go', text: 'It may run; a rival may buy it.' },
    { id: 'rough', label: 'Have your driver take the camera', text: 'The picture is gone; the cops hear about it, and she is shaken.' },
  ] },
  rival: { title: 'A rival at the next table', text: 'One of the other family\'s men is at the next table, and he is enjoying the view.', picks: [
    { id: 'bottle', label: 'Send over a bottle', text: 'Class. He remembers you were gracious, and who you were with.' },
    { id: 'nod', label: 'A nod, nothing more', text: 'Cool. He knows something about you now.' },
    { id: 'leave', label: 'Leave', text: 'Nothing for him to see; she wonders why.' },
  ] },
  asks: { title: 'She asks for something', text: 'Over the second drink she asks you for something.', picks: [
    { id: 'money', label: 'Help with her mother\'s doctor ($200)', text: 'She won\'t forget it.', cost: 200 },
    { id: 'intro', label: 'Promise her an introduction', text: 'A real promise: 26 weeks to keep it.' },
    { id: 'no', label: 'Tell her no, kindly', text: 'She takes it well. Mostly.' },
  ] },
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const NX = (op: NightOp, label: string): Effect => ({ type: 'nightlife', op, label }) as Effect;
const roll = (k: string) => (hashSeed(k) % 100003) / 100003;
const adult = (s: GameState, c: Character | undefined): c is Character => !!c && ageOn(c.birth, s.date) >= 18;
const r10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

/* ------------------------------------------------------------------ */
/* Who                                                                 */
/* ------------------------------------------------------------------ */

function workerOf(s: GameState, id: string) {
  const p = s.nightlife?.people[id];
  return p && p.status === 'active' && (ADULT_ROLES.includes(p.role) || p.role === 'dancer') && p.price > 0 ? p : undefined;
}

function datesHim(s: GameState, c: Character): boolean {
  const boss = player(s);
  const b = s.dating?.bonds[c.id];
  if (romanceBetween(s, boss.id, c.id) || isGoomar(s, c.id)) return true;
  if (!b || b.ended || (b.pro && b.pro > s.week)) return false;
  // A professional stays a professional until it is personal (she said yes to a date as herself).
  return workerOf(s, c.id) ? b.dates > 0 : b.rung !== 'acquaintance' || b.dates > 0;
}

/** 'paid': a professional, paid for her evening. 'date': someone you date or keep. Undefined: not this. */
export function eveningKindOf(s: GameState, id: string): 'paid' | 'date' | undefined {
  const c = s.characters[id];
  const boss = player(s);
  if (!c || !adult(s, c) || c.id === boss.id || c.id === boss.spouseId || kin(boss, c)) return undefined;
  if (workerOf(s, id) && !datesHim(s, c)) return adultOn(s) ? 'paid' : undefined;
  return datesHim(s, c) ? 'date' : undefined;
}

/** She asks her question on the warmer evenings (professionals). */
export function asksQuestion(s: GameState, plan: Pick<EveningPlan, 'id' | 'kind' | 'approach'>): boolean {
  return eveningKindOf(s, plan.id) === 'paid' && (plan.approach !== 'night' || plan.kind === 'getaway');
}

/** Tonight's beat (fixed for her, this week, this kind of evening). Just the release has none. */
export function beatFor(s: GameState, plan: Pick<EveningPlan, 'id' | 'kind'>): BeatId | undefined {
  if (plan.kind === 'release') return undefined;
  const ids: BeatId[] = ['capowife', 'photo', 'rival', 'asks'];
  return ids[hashSeed(`${s.seed}|${s.week}|beat|${plan.id}|${plan.kind}`) % ids.length];
}

/* ------------------------------------------------------------------ */
/* Her price, and the haggle                                           */
/* ------------------------------------------------------------------ */

/** What she asks for the night (a professional), and why. */
export function askingPrice(s: GameState, id: string, kind: EveningKind | 'car'): { price: number; why: string[] } {
  const p = workerOf(s, id);
  const c = s.characters[id];
  if (!p || !c) return { price: 0, why: [] };
  const boss = player(s);
  const why: string[] = [];
  let v = p.price * (kind === 'car' ? 0.45 : kind === 'getaway' ? 2 : kind === 'release' ? 0.8 : 1.1);
  if (kind === 'car') why.push('a few minutes, in a car');
  if (kind === 'getaway') why.push('two days of her time');
  if (kind === 'town' || kind === 'club') why.push('seen out with you, all evening');
  if (isInSeason(s.date)) { v *= 1.15; why.push('the summer is busy'); }
  const visits = s.dating?.providers[id]?.visits.length ?? 0;
  if (visits >= 3) { v *= 0.9; why.push('you are a regular'); }
  if (hasTrait(boss, 'Cruel')) { v *= 1.3; why.push('your reputation'); }
  if (kind === 'club') { v *= 1.2; why.push('your people, your club'); }
  return { price: r10(v), why };
}

/** The least she will take tonight (hidden; the haggle finds it). */
export function floorPrice(s: GameState, id: string, kind: EveningKind | 'car'): number {
  const c = s.characters[id];
  const ask = askingPrice(s, id, kind).price;
  if (!c) return ask;
  let f = 0.8;
  if (hasTrait(c, 'Greedy')) f = 0.95;
  if (hasTrait(c, 'Patient')) f -= 0.05;
  if (!isInSeason(s.date)) f -= 0.07;
  const like = opinion(s, id, s.playerId) + appeal(s, c, player(s)).value;
  f -= Math.max(-0.05, Math.min(0.08, like / 400));
  return r10(ask * Math.max(0.6, Math.min(0.97, f)));
}

export type HaggleMove = 'accept' | 'counter' | 'sweeten' | 'line';
export interface HaggleReply { result: 'deal' | 'counter' | 'walk'; price: number; line: string }

const LINES_DRY = ['Honey, I\'ve heard that one since Truman.', 'That\'s sweet. The price is the price.', 'Save it for your wife.', 'Every man on this island says that.'];

/**
 * One round of the haggle (pure: the same move on the same night gets the same answer).
 * `offer`: your counter (for 'counter'), the price plus a tip (for 'sweeten').
 */
export function haggle(s: GameState, id: string, kind: EveningKind | 'car', move: HaggleMove, offer: number, round: number, current?: number): HaggleReply {
  const ask = current ?? askingPrice(s, id, kind).price;
  const floor = floorPrice(s, id, kind);
  const c = s.characters[id];
  const boss = player(s);
  const k = `${s.seed}|${s.week}|haggle|${id}|${round}|${move}|${offer}`;
  if (move === 'accept') return { result: 'deal', price: ask, line: 'Then we understand each other.' };
  if (move === 'line') {
    if (hasTrait(boss, 'Charming') && roll(k) < 0.35) return { result: 'counter', price: r10(Math.max(floor, ask * 0.92)), line: `${c?.firstName ?? 'She'} laughs despite herself. "All right. For you."` };
    return { result: 'counter', price: ask, line: LINES_DRY[hashSeed(k) % LINES_DRY.length] };
  }
  if (move === 'sweeten') return { result: 'deal', price: ask, line: 'Now you\'re talking.' };
  // A counter.
  if (offer >= ask) return { result: 'deal', price: ask, line: 'Then we understand each other.' };
  if (offer >= floor) return { result: 'deal', price: offer, line: round === 0 ? '"Fine. Because I like your face."' : '"Fine. Don\'t tell the other girls."' };
  if (offer < floor * 0.75 || round >= 2) {
    if (hasTrait(c ?? boss, 'Hot-headed') || roll(k) < 0.5) return { result: 'walk', price: ask, line: `"Find yourself a cheaper girl." She picks up her purse.` };
    return { result: 'counter', price: r10(ask * 1.1), line: '"Now it\'s more. Keep talking and it goes up again."' };
  }
  return { result: 'counter', price: r10((ask + floor) / 2 + 10), line: `"${$(r10((ask + floor) / 2 + 10))}. That's as low as I go tonight."` };
}

/* ------------------------------------------------------------------ */
/* Cost, odds, risks                                                   */
/* ------------------------------------------------------------------ */

export function eveningCost(s: GameState, plan: EveningPlan): { total: number; lines: string[] } {
  const paid = eveningKindOf(s, plan.id) === 'paid';
  const lines: string[] = [];
  let total = 0;
  if (paid) { const fee = plan.price ?? askingPrice(s, plan.id, plan.kind).price; total += fee; lines.push(`her price ${$(fee)}`); if (plan.tip) { total += plan.tip; lines.push(`a tip ${$(plan.tip)}`); } }
  const k = plan.kind === 'release' ? 0.5 : 1;
  const extra = Math.round((paid ? { queen: 250, night: 0, something: 120 } : { queen: 250, night: 40, something: 90 })[plan.approach] * k);
  if (extra) { total += extra; lines.push(`${plan.approach === 'queen' ? 'champagne and a gift' : 'dinner and drinks'} ${$(extra)}`); }
  if (plan.kind === 'release' && plan.at === 'hotel') { total += 35; lines.push('the room $35'); }
  if (plan.kind === 'release' && plan.at === 'motel') { total += MOTEL_ROOM; lines.push(`a motel room ${$(MOTEL_ROOM)}`); }
  if (plan.kind === 'town') { total += 60; lines.push('the clubs $60'); }
  if (plan.kind === 'getaway') { const d = DEST_INFO[plan.dest ?? 'capemay']; total += d.cost; lines.push(`${d.label.toLowerCase()} ${$(d.cost)}`); }
  if (plan.beat && plan.pick) { const pk = BEAT_INFO[plan.beat].picks.find((x) => x.id === plan.pick); if (pk?.cost) { total += pk.cost; lines.push(`${pk.label.toLowerCase()}`); } }
  return { total, lines };
}

function eveningsLeft(s: GameState): number {
  return roundSlots(s).slots - datingEvenings(s);
}

export function inviteAcceptance(s: GameState, c: Character, plan: EveningPlan): Acceptance {
  const boss = player(s);
  const p = s.nightlife?.people[c.id];
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (p?.bounds.includes('no_married') && wife?.alive) return { chance: 0, reasons: [{ label: 'Will not get involved with a married man', value: -100 }] };
  if (p?.bounds.includes('no_rough') && hasTrait(boss, 'Cruel')) return { chance: 0, reasons: [{ label: 'Will not see a man known to get rough', value: -100 }] };
  const paid = eveningKindOf(s, c.id) === 'paid';
  if (paid && (plan.price ?? 0) < floorPrice(s, c.id, plan.kind)) return { chance: 0, reasons: [{ label: 'That is not her price', value: -100 }] };
  const reasons: Reason[] = [];
  let base: number;
  if (paid) {
    base = { queen: 85, night: 78, something: 65 }[plan.approach];
    const op = opinion(s, c.id, boss.id);
    if (op) reasons.push({ label: op > 0 ? 'Thinks well of you' : 'Thinks little of you', value: Math.round(op * 0.4) });
    if (plan.tip) reasons.push({ label: 'A tip promised', value: 5 });
  } else {
    base = Math.round(herDecision(s, c, 'date').chance * 100);
    if (plan.approach === 'queen') reasons.push({ label: 'The best of everything', value: 8 });
    if (plan.approach === 'something' && (s.dating?.bonds[c.id]?.aff ?? 0) >= 40) reasons.push({ label: 'She hoped you would say that', value: 10 });
    // A goomar of years says yes to her patron's evening far more often than a stranger would.
    if (isGoomar(s, c.id)) reasons.push({ label: 'She is your goomar: this is your arrangement', value: 25 });
  }
  if (hasTrait(boss, 'Cruel')) reasons.push({ label: 'People say you can be cruel', value: -25 });
  if (s.heat.local >= 60 || s.heat.federal >= 50) reasons.push({ label: 'Your name is in the papers; being seen with you is a risk', value: -15 });
  if (plan.kind === 'club') reasons.push({ label: 'In front of your people: not every woman wants that', value: -15 });
  if (plan.kind === 'release' && plan.at === 'office') reasons.push({ label: 'Your office: not her idea of a night', value: -6 });
  if (plan.kind === 'release' && plan.at === 'motel' && plan.approach === 'queen') reasons.push({ label: 'The best of everything, at a motel?', value: -4 });
  if (plan.kind === 'getaway' && p?.fam.kids.some((k) => s.date.y - k.y < 14)) reasons.push({ label: 'Her kids: two days away is hard', value: -15 });
  if (plan.kind === 'getaway' && (p?.fam.st === 'married' || p?.fam.st === 'steady') && p.fam.knows !== 'accepts') reasons.push({ label: 'Two days away: her husband would ask', value: -15 });
  const b = s.dating?.bonds[c.id];
  if (b?.no && s.week - b.no.week < 3) reasons.push({ label: 'You asked her very recently', value: -15 });
  if (p?.scorned && s.week - p.scorned < 26) reasons.push({ label: 'What you said last time', value: -20 });
  const sum = reasons.reduce((x, r) => x + r.value, base);
  return { chance: Math.max(0.05, Math.min(0.9, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

/** If you ask her to stay: her odds (shown before, rolled on the evening). 0 when the setting or the plan rules it out. */
export function stayOdds(s: GameState, c: Character, plan: Pick<EveningPlan, 'id' | 'kind' | 'approach' | 'answer'>): number {
  if (!adultOn(s)) return 0;
  const boss = player(s);
  const p = s.nightlife?.people[c.id];
  const paid = eveningKindOf(s, c.id) === 'paid';
  const aff = s.dating?.bonds[c.id]?.aff ?? 20;
  let v = (paid ? 0.6 : 0.25) + { queen: 0.1, night: 0, something: 0.06 }[plan.approach] + opinion(s, c.id, boss.id) / 300 + (p?.attach ?? 0) / 300 + (paid ? 0 : (aff - 30) / 150);
  if (plan.kind === 'release') v += 0.1;
  if (plan.kind === 'getaway') v += 0.15;
  if (plan.answer === 'paid' && plan.approach !== 'night') v -= 0.3;
  if (hasTrait(c, 'Pious')) v -= 0.2;
  if (isGoomar(s, c.id)) v += 0.2;
  return Math.max(0.05, Math.min(0.92, v));
}

function wifeOdds(s: GameState, plan: EveningPlan, stayed: boolean): number {
  const boss = player(s);
  const v = ({ release: 0.04, town: 0.16, getaway: 0.06, club: 0.85 }[plan.kind] + (plan.kind === 'release' && plan.at === 'motel' ? 0.02 : 0)) * (plan.approach === 'something' ? 1.3 : 1) * (stayed ? 1.4 : 1) * (hasTrait(boss, 'Womanizer') ? 1.2 : 1);
  return Math.min(0.9, v);
}

export function eveningRisks(s: GameState, c: Character, plan: EveningPlan): string[] {
  const boss = player(s);
  const out: string[] = [];
  if (boss.spouseId && s.characters[boss.spouseId]?.alive) out.push(`your wife may hear (${Math.round(wifeOdds(s, plan, false) * 100)}%${plan.kind === 'club' ? '' : ', more if she stays'})`);
  if (plan.kind === 'getaway') out.push(`your cover story may unravel (${Math.round(COVER_INFO[plan.cover ?? 'business'].unravel * 100)}%)`);
  if (activeGoomars(s).some((g) => g.id !== c.id)) out.push('your goomar may hear and be jealous');
  if (plan.kind === 'town') out.push('gossip; the other families and the cops notice who you are seen with');
  if (plan.kind === 'club') out.push('the old-school capos and the consigliere think less of you; the other families learn your weakness');
  if (plan.kind === 'release' && plan.at === 'hotel') out.push('a vice cop or a federal man may see her leave the hotel');
  if (plan.kind === 'release' && plan.at === 'motel') out.push('the night clerk knows your car');
  out.push('you never really know who she talks to');
  return out;
}

/* ------------------------------------------------------------------ */
/* The order                                                           */
/* ------------------------------------------------------------------ */

export function eveningBlock(s: GameState, plan: EveningPlan): string | undefined {
  const c = s.characters[plan.id];
  const boss = player(s);
  if (!c || !adult(s, c) || !adult(s, boss)) return 'Adults only';
  if (kin(boss, c)) return 'Family';
  const kind = eveningKindOf(s, plan.id);
  if (!kind) return workerOf(s, plan.id) && !adultOn(s) ? 'Mature content is Off in Settings' : `Get to know ${c.firstName} first (Relationships & Dating)`;
  if (!c.alive || !isFree(s, c)) return `${c.firstName} is not free`;
  if (!boss.alive || !isFree(s, boss)) return 'You are not free';
  if (eveningsLeft(s) < KIND_INFO[plan.kind].evenings) return KIND_INFO[plan.kind].evenings > 1 ? `A getaway needs ${KIND_INFO[plan.kind].evenings} free evenings this week` : 'No evenings left this week';
  if (kind === 'paid' && plan.price === undefined) return 'Agree her price first';
  // One evening with her a week: after tonight the card says so, instead of offering it again at new odds.
  if (s.dating?.bonds[plan.id]?.last === s.week) return `You already had your evening with ${c.firstName} this week`;
  return undefined;
}

/** How you play it, said for her: "make it something" to a woman who is already your goomar is not "the road to a goomar". */
export function approachText(s: GameState, id: string, a: Approach): string {
  if (a === 'something' && isGoomar(s, id)) return 'Tell her she is more than an arrangement: it means something to her after all these years, and it raises her hopes (and the jealousy around you).';
  return APPROACH_TEXT[a];
}

export function previewInvite(s: GameState, plan: EveningPlan): ActionPreview {
  const c = s.characters[plan.id];
  const base: ActionPreview = { title: 'An evening', effects: [], cost: 0, because: 'invited her out', category: 'event' };
  if (!c) return { ...base, disabledReason: 'Not here' };
  const kind = eveningKindOf(s, plan.id);
  const cost = eveningCost(s, plan);
  const stayP = stayOdds(s, c, plan);
  const block = eveningBlock(s, plan);
  const info = KIND_INFO[plan.kind];
  const fade = plan.stay && stayP > 0 ? ` You ask her to stay the night: she decides (about ${Math.round(stayP * 100)}%); if she does, the report fades to morning.` : '';
  const op: NightOp = { op: 'invite', plan: { ...plan, stay: plan.stay && stayP > 0 } };
  return {
    ...base,
    title: plan.kind === 'release' && plan.at === 'motel' ? `A room for the night: ${c.firstName}` : `${info.label}, ${APPROACH_LABEL[plan.approach].toLowerCase()}: ${c.firstName}`,
    because: `took ${c.firstName} out`,
    cost: cost.total, pot: 'pocket',
    detail: `${displayName(c)}, ${ageOn(c.birth, s.date)}. ${info.text} ${approachText(s, plan.id, plan.approach)} ${kind === 'paid' ? 'She is paid for her evening; it is an agreed arrangement between adults, and she can still say no (then nothing is paid).' : 'A personal evening: she says yes or no as herself.'}${cost.lines.length ? ` Cost: ${cost.lines.join(', ')}, from your pocket.` : ''} Takes ${info.evenings === 1 ? 'one of your evenings' : `${info.evenings} of your evenings`} (about ${info.hours} hours).${plan.kind === 'getaway' ? ` Cover story: ${COVER_INFO[plan.cover ?? 'business'].label.toLowerCase()}.` : ''}${fade}`,
    effects: [{ type: 'money', pot: 'pocket', amount: -cost.total, label: `An evening with ${c.firstName}` }, NX(op, `An evening with ${c.firstName}`)],
    acceptance: block ? undefined : inviteAcceptance(s, c, plan),
    refuseEffects: [NX({ op: 'refused', id: plan.id, what: 'the evening' }, `${c.firstName} said no`)],
    warning: `What can go wrong: ${eveningRisks(s, c, plan).join('; ')}.`,
    disabledReason: block,
    verb: `Invite ${c.firstName}${cost.total ? ` — ${$(cost.total)}` : ''}`,
  };
}

/** A sensible default plan (the menus' one-tap row; the flow offers every choice). */
export function defaultPlan(s: GameState, id: string): EveningPlan {
  const paid = eveningKindOf(s, id) === 'paid';
  const kind: EveningKind = paid ? 'release' : 'town';
  const plan: EveningPlan = { id, kind, at: paid ? 'hotel' : undefined, approach: paid ? 'night' : 'something', stay: false };
  if (paid) plan.price = askingPrice(s, id, kind).price;
  const beat = beatFor(s, plan);
  if (beat) { plan.beat = beat; plan.pick = BEAT_INFO[beat].picks[BEAT_INFO[beat].picks.length - 1].id; }
  return plan;
}

/* ------------------------------------------------------------------ */
/* The evening happens                                                 */
/* ------------------------------------------------------------------ */

function nlog(N: NightlifeState, s: GameState, text: string): void {
  N.log.push([s.week, text]);
  if (N.log.length > 60) N.log.splice(0, N.log.length - 60);
}

export function applyInvite(ctx: Ctx, N: NightlifeState, plan: EveningPlan): void {
  const s = ctx.s;
  const boss = player(s);
  const c = s.characters[plan.id];
  // Adults only, she is free, still the same arrangement: checked again now.
  if (!adult(s, c) || !adult(s, boss) || !c.alive || kin(boss, c)) return;
  const kind = eveningKindOf(s, plan.id);
  if (!kind) return;
  if (kind === 'paid' && (plan.price ?? 0) < floorPrice(s, plan.id, plan.kind)) return;
  const D = ensureDating(s);
  const p = N.people[plan.id];
  const key = `${s.seed}|${s.week}|inv|${plan.id}`;
  if (D.evenings.week !== s.week) D.evenings = { week: s.week, n: 0 };
  D.evenings.n += KIND_INFO[plan.kind].evenings;
  let b = D.bonds[plan.id];
  if (!b) { b = { id: plan.id, aff: kind === 'paid' ? 15 : 25, rung: 'acquaintance', dates: 0, since: s.week, gifts: [], via: p ? 'The night' : 'You have met' }; D.bonds[plan.id] = b; D.met[plan.id] ??= s.week; }
  b.last = s.week;
  if (kind === 'date') b.dates++;
  if (kind === 'paid') { const pr = D.providers[plan.id]; if (pr) pr.visits = [...pr.visits.filter((w) => s.week - w < 52), s.week]; D.stats.paid++; }
  if (p) p.met = true;
  const lines: string[] = [];
  const fx = (effects: Effect[], label: string) => applyEffects(ctx, effects, { label, because: `took ${c.firstName} out`, category: 'event' });
  const stress = (n: number, label: string) => { if (s.dyn) fx([{ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: -n, source: 'domestic' }, label } as Effect], label); };

  // The kind of evening.
  const where = plan.kind === 'release' ? (plan.at === 'office' ? 'your office, after the building emptied' : plan.at === 'motel' ? 'a room for the night at a motel on Route 9, paid in cash' : 'a room at the Royal Palm') : plan.kind === 'town' ? 'dinner at the Admiral, the Rhumba Terrace, the boardwalk after' : plan.kind === 'getaway' ? DEST_INFO[plan.dest ?? 'capemay'].label.toLowerCase() : 'the social club, your people at every table';
  if (plan.kind === 'release') { stress(14, 'A quiet night in'); lines.push(`A quiet night in, ${where}.`); }
  if (plan.kind === 'town') { stress(10, 'A night on the town'); lines.push(`A night on the town with ${c.firstName}: ${where}.`); }
  if (plan.kind === 'getaway') { stress(10, 'Away from the island'); if (p) p.attach = clamp(p.attach + 20); b.aff = clamp(b.aff + 10); lines.push(`Two days away with ${c.firstName}: ${where}.`); N.companions ??= {}; N.companions[plan.id] = s.week + 8; }
  if (plan.kind === 'club') {
    stress(6, 'An evening at the club');
    lines.push(`You walked ${c.firstName} into the social club on your arm.`);
    const capos = Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && (x.rank === 'capo' || x.rank === 'consigliere') && adult(s, x));
    const young = Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && (x.rank === 'soldier' || x.rank === 'associate')).slice(0, 6);
    const eff: Effect[] = [];
    for (const x of capos) if (ageOn(x.birth, s.date) >= 45 || x.rank === 'consigliere' || hasTrait(x, 'Pious')) eff.push({ type: 'opinion', from: x.id, to: boss.id, amount: -6, reason: 'Paraded a woman in front of the men', decay: 1, label: 'The old school' });
    for (const x of young) if (hasTrait(x, 'Womanizer') || ageOn(x.birth, s.date) < 32) eff.push({ type: 'opinion', from: x.id, to: boss.id, amount: 3, reason: 'The boss lives like a boss', decay: 1, label: 'Swagger' });
    if (eff.length) fx(eff, 'At the club');
    for (const r of s.rivals.filter((x) => x.kind === 'mob')) { const sec = addSecret(s, boss, 'affair', [r.id as FactionId]); if (!sec.knownBy.includes(r.id as FactionId)) sec.knownBy.push(r.id as FactionId); }
    lines.push('The young men grinned; the old ones looked at their coffee. The other families will know by morning.');
  }

  // The approach.
  if (plan.approach === 'queen') {
    b.aff = clamp(b.aff + 12);
    if (p) p.attach = clamp(p.attach + 15);
    addOpinion(s, c.id, boss.id, 'He treated me like a queen', 10, 1);
    lines.push(`Champagne, a bracelet in a box: ${c.firstName} was treated like a queen.`);
    if (kind === 'paid' && plan.answer !== 'paid' && roll(`${key}|differ`) < 0.3 + (p?.attach ?? 0) / 200) { b.pro = undefined; if (b.rung === 'acquaintance') b.rung = 'friends'; lines.push('By the end of the night she looked at you differently.'); }
  } else if (plan.approach === 'night') {
    b.aff = clamp(b.aff + 2);
    if (p) p.attach = clamp(p.attach + (plan.kind === 'release' ? 1 : 3));
    lines.push(`No promises; ${c.firstName} knew the score.`);
    if ((p && p.attach >= 50) || (b.aff >= 50 && kind === 'date') || p?.goal === 'marry') { addOpinion(s, c.id, boss.id, 'Just one night, to him', -5, 1); if (p) p.attach = clamp(p.attach - 5); lines.push('It stung a little: she wanted more than one night.'); }
  } else {
    b.aff = clamp(b.aff + 8);
    if (p) { p.attach = clamp(p.attach + 10); p.expects = s.week + 12; }
    addOpinion(s, c.id, boss.id, 'He wants it to be something', 6, 1);
    lines.push(`You told ${c.firstName} you want to see her again.`);
  }

  // Her question.
  if (plan.answer && asksQuestion(s, plan)) {
    const r = roll(`${key}|answer`);
    if (plan.answer === 'you') {
      const believes = r < 0.45 + (p?.attach ?? 0) / 200 + (hasTrait(c, 'Paranoid') ? -0.2 : 0);
      if (p) p.attach = clamp(p.attach + (believes ? 12 : 4));
      if (believes) { b.aff = clamp(b.aff + 8); b.pro = undefined; lines.push('"But do you want me, or just my body?" "You." She looked at you a long time, and believed it.'); }
      else { if (p) p.tests = s.week + 8; lines.push('"But do you want me, or just my body?" "You." "We\'ll see," she said. She will test it.'); }
    } else if (plan.answer === 'paid') {
      if (p) { p.attach = clamp(p.attach - 15); p.scorned = s.week; }
      b.pro = s.week + 52;
      lines.push('"But do you want me, or just my body?" "Does it matter? You\'re getting paid." "No," she said. "I suppose it doesn\'t." Business, from now on.');
    } else if (plan.answer === 'both') {
      const charm = r < (hasTrait(boss, 'Charming') ? 0.7 : 0.4);
      if (charm) { b.aff = clamp(b.aff + 6); if (p) p.attach = clamp(p.attach + 8); lines.push('"Both." She laughed, and it was a real laugh.'); }
      else { if (p) p.attach = clamp(p.attach - 3); lines.push('"Both." "Cute," she said, not laughing.'); }
    } else {
      b.aff = clamp(b.aff + 3);
      if (p) p.attach = clamp(p.attach + 3);
      lines.push('"I don\'t know yet." "Honest, at least," she said.');
    }
  }

  // Tonight's beat (the same one the flow showed; anything else is ignored).
  const beat = beatFor(s, plan);
  if (beat && plan.beat === beat) {
    const pick = plan.pick;
    const rr = roll(`${key}|beat`);
    const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
    if (beat === 'capowife') {
      if (pick === 'greet' && rr < 0.35 && wife?.alive) { fx([{ type: 'opinion', from: wife.id, to: boss.id, amount: -10, reason: 'A capo\'s wife saw him with a woman', decay: 1, label: 'Talk among the wives' }], 'The wives talk'); lines.push('Your capo\'s wife smiled too long. The wives will talk.'); }
      else if (pick === 'leave') { addOpinion(s, c.id, boss.id, 'He hid me', -4, 1); lines.push('You left early; she noticed why.'); }
      else if (pick === 'ignore' && rr < 0.5 && wife?.alive) { fx([{ type: 'opinion', from: wife.id, to: boss.id, amount: -8, reason: 'Heard he was out with someone', decay: 1, label: 'Talk among the wives' }], 'The wives talk'); lines.push('Your capo\'s wife saw everything.'); }
      else lines.push('Your capo\'s wife looked away, and so did you.');
    } else if (beat === 'photo') {
      if (pick === 'pay') lines.push('You bought the film. The picture went away.');
      else if (pick === 'rough') { fx([{ type: 'heat', bar: 'local', amount: 2, label: 'Your driver took a photographer\'s camera' }], 'A camera taken'); addOpinion(s, c.id, boss.id, 'Frightened me', -6, 1); lines.push('Your driver took the camera. She went quiet after that.'); }
      else if (rr < 0.4) { const rv = s.rivals.find((x) => x.kind === 'mob'); if (rv) { const sec = addSecret(s, boss, 'affair', [rv.id as FactionId]); if (!sec.knownBy.includes(rv.id as FactionId)) sec.knownBy.push(rv.id as FactionId); } lines.push('The picture ended up with the other family.'); }
      else lines.push('The picture never ran.');
    } else if (beat === 'rival') {
      const rv = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
      if (pick === 'bottle' && rv) { fx([{ type: 'rivalOpinion', rival: rv.id, amount: 3, reason: 'Sent a bottle over', label: 'Gracious' }], 'Gracious'); lines.push(`You sent the ${rv.shortName} man a bottle. Gracious; he noted who you were with.`); }
      else if (pick === 'leave') lines.push('You left before he could get a good look.');
      else { if (rv && rr < 0.5) { const sec = addSecret(s, boss, 'affair', [rv.id as FactionId]); if (!sec.knownBy.includes(rv.id as FactionId)) sec.knownBy.push(rv.id as FactionId); } lines.push('A nod across the room. He knows something about you now.'); }
    } else if (beat === 'asks') {
      if (pick === 'money') { addOpinion(s, c.id, boss.id, 'Helped with my mother', 10, 1); if (p) p.loyalty = clamp(p.loyalty + 10); lines.push('You helped with her mother\'s doctor. She won\'t forget it.'); }
      else if (pick === 'intro' && p && !N.promises.some((x) => x.who === c.id && x.status === 'open')) { N.promises.push({ id: `np${s.nextId++}`, who: c.id, kind: p.dream === 'film' ? 'film' : 'record', made: s.week, due: s.week + 26, status: 'open' }); p.loyalty = clamp(p.loyalty + 6); lines.push('You promised her an introduction. Now keep it.'); }
      else lines.push('You told her no, kindly. She took it well, mostly.');
    }
  }

  // "Make it something": the road to seeing each other (she decides).
  if (plan.approach === 'something' && plan.answer !== 'paid' && !romanceBetween(s, boss.id, c.id) && drawnTo(s, c, boss) && drawnTo(s, boss, c) && b.aff >= 35 && roll(`${key}|track`) < 0.35 + (b.aff - 35) / 100) {
    if (startRomance(s, boss.id, c.id)) { b.pro = undefined; if (b.rung !== 'attracted') b.rung = 'attracted'; lines.push('She said yes: you are seeing each other now.'); }
  }
  if (b.rung === 'acquaintance' && b.aff >= 25) b.rung = 'friends';

  // Staying the night: she decides.
  let stayed = false;
  if (plan.stay) {
    stayed = roll(`${key}|stay`) < stayOdds(s, c, plan);
    if (stayed) {
      lines.push('She stayed. Then it was morning.');
      stress(6, 'A night away from everything');
      // A child only inside a relationship (the dating rules); she may be careful.
      maybeConceive(s, D, c, `invite:${plan.kind}`, p?.bounds.includes('careful') ? 0.4 : 1);
      if (p) p.attach = clamp(p.attach + 4);
    } else lines.push('She kissed your cheek and took a cab home.');
  }

  // The risks.
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (plan.kind === 'getaway' && wife?.alive && roll(`${key}|cover`) < COVER_INFO[plan.cover ?? 'business'].unravel) {
    fx([{ type: 'opinion', from: wife.id, to: boss.id, amount: -25, reason: 'His story didn\'t hold up', decay: 1, label: `${wife.firstName} caught the lie` }], 'The cover story');
    lines.push(`${COVER_INFO[plan.cover ?? 'business'].label}: ${wife.firstName} didn't believe a word of it.`);
  } else if (wife?.alive && roll(`${key}|wife`) < wifeOdds(s, plan, stayed)) {
    fx([{ type: 'opinion', from: wife.id, to: boss.id, amount: plan.kind === 'club' ? -25 : stayed ? -15 : -8, reason: plan.kind === 'club' ? 'He paraded a woman at his club' : stayed ? 'He was out all night' : 'He was out with someone', decay: 1, label: `${wife.firstName} heard` }], `${wife.firstName} heard`);
    D.rumors.push({ week: s.week, text: `The boss was out with ${c.firstName} ${c.lastName}${stayed ? ' and didn\'t come home' : ''}.`, about: boss.id, heard: [wife.id], true: true });
    lines.push(`${wife.firstName} heard about it.`);
  }
  for (const g of activeGoomars(s)) {
    if (g.id === c.id) continue;
    const gc = s.characters[g.id];
    const odds = 0.08 * (plan.approach === 'something' ? 2 : 1) * (stayed ? 1.5 : 1) * (plan.kind === 'club' || plan.kind === 'town' ? 2 : 1);
    if (gc && roll(`${key}|gjeal|${g.id}`) < odds) { const gb = D.bonds[g.id]; if (gb) gb.aff = clamp(gb.aff - 10); addOpinion(s, gc.id, boss.id, `He was out with ${c.firstName}`, -8, 1); lines.push(`${gc.firstName} found out, and she is not happy.`); }
  }
  if (roll(`${key}|gossip`) < { release: 0.08, town: 0.35, getaway: 0.12, club: 0.9 }[plan.kind]) D.rumors.push({ week: s.week, text: `The boss was seen with ${c.firstName} ${c.lastName}.`, about: boss.id, heard: ['island'], true: true });
  if ((plan.kind === 'town' || (plan.kind === 'release' && plan.at === 'hotel')) && roll(`${key}|cop`) < 0.06 + s.heat.federal / 1000) {
    const fed = s.heat.federal >= 40;
    fx([{ type: 'heat', bar: fed ? 'federal' : 'local', amount: fed ? 1 : 2, label: fed ? 'A federal man saw you with her' : 'A vice cop saw you with her' }], 'Seen');
    lines.push(fed ? 'A man with a federal haircut was in the lobby.' : 'A vice cop saw the two of you.');
  }
  // She may be talking to someone: the boss never sees it; the file does.
  if (c.informantFor && c.informantFor !== 'player' && (stayed || plan.kind !== 'release' || plan.at === 'office')) fx([{ type: 'evidence', charId: boss.id, amount: 3, label: 'Someone is talking' }], 'Someone is talking');
  const line = lines.join(' ');
  if (p) { p.hist.push([s.week, `${KIND_INFO[plan.kind].label} with you (${APPROACH_LABEL[plan.approach].toLowerCase()}).`]); if (p.hist.length > 10) p.hist.splice(0, p.hist.length - 10); }
  nlog(N, s, `${c.firstName} ${c.lastName}: ${line}`);
  ctx.log.push(line);
}

/** The women who said they would come along: on the trip planner's companion list until the date passes. */
registerLoverSource((s, charId) => {
  if (charId !== s.playerId) return [];
  const C = s.nightlife?.companions;
  return C ? Object.entries(C).filter(([id, until]) => until >= s.week && adult(s, s.characters[id])).map(([id]) => id) : [];
});
