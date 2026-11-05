import { bossSkillValue, GAMBLING_KINDS, invested, PERK_AT, SHOWBIZ_KINDS, type AnySkill } from './bossSkills';
import { manInvested } from './crewXp';
import { perkMod } from './lifestyle';
import { NEW_SKILL_NAME, skillEdge, skillValue, type NewSkill } from './newSkillsCore';
import type { Business, Character, GameState } from './types';

/**
 * WHERE THE FIVE NEWER SKILLS LAND (newSkillsCore.ts has the values;
 * bossSkills.ts the boss's practice, points and 3/6/10 trees; crewXp.ts the
 * men's). Every effect is read at its point of use, small (a skill swings
 * −5..+5 around an average man, a perk is +3..8), and named where odds exist:
 *
 *  - Charm: her answer to a date or asking her out (dating.ts herDecision),
 *    a paid evening's yes, what the wife and the island hear (paidRisks), a
 *    match (matchmakers.ts), the wife's opinion (Leading Man, lifestyle.ts).
 *  - Streetwise: a man's fit for street jobs and his own scores (eat.ts), the
 *    pinch, the cops' moves coming to nothing (threats.ts foilOdds), a mole
 *    found when he is checked (feds.ts brascoChecked).
 *  - Politics: the price of a bribe and of the pad (interactions.ts,
 *    payroll.ts), an official's yes, favors, the federal case (fedsState.ts).
 *  - Showbiz: an act signing and a room booking (showbiz.ts), the clubs' and
 *    venues' take (economy.ts runBusinesses: its own named line).
 *  - Gambling: the books', numbers', card games' and casino's take, and a
 *    losing week at the book (economy.ts runBusinesses: its own named line).
 *
 * Pure reads; no dice.
 */

export interface SkillReason { label: string; value: number }

/** How many of a skill's three perks this man holds (the boss's from his points; a man's from his). */
export function perksHeld(s: GameState, c: Character | string | undefined, k: AnySkill): number {
  const id = typeof c === 'string' ? c : c?.id;
  if (!id) return 0;
  const inv = id === s.playerId ? invested(s, k) : manInvested(s, id, k);
  return PERK_AT.filter((a) => inv >= a).length;
}

/** The boss's value in a newer skill. */
export const bossNs = (s: GameState, k: NewSkill): number => bossSkillValue(s, k);

/** The boss's skill as a named reason (only when it moves the number). */
function bossReason(s: GameState, k: NewSkill, label: string, scale = 1): SkillReason[] {
  const v = bossNs(s, k);
  const e = Math.round(skillEdge(v) * scale);
  return e ? [{ label: `${label} (${NEW_SKILL_NAME[k]} ${v})`, value: e }] : [];
}

/* ---------------- Charm ---------------- */

/** Her answer to the boss (dating.ts herDecision): his charm, First Impressions, Leading Man. */
export function charmReasons(s: GameState, what: string): SkillReason[] {
  const out = bossReason(s, 'charm', 'Your charm');
  const fi = perkMod(s, 'firstImp');
  if (fi && (what === 'askOut' || what === 'date' || what === 'paid')) out.push({ label: 'First Impressions', value: fi });
  const lm = perkMod(s, 'charm');
  if (lm && what !== 'talk') out.push({ label: 'Leading Man', value: lm });
  return out;
}

/** What the wife and the island hear of his nights (dating.ts paidRisks): Smooth It Over, and a smooth man's way. */
export function smoothMult(s: GameState): number {
  const e = Math.max(0, skillEdge(bossNs(s, 'charm')));
  return Math.max(0.4, 1 - perkMod(s, 'smooth') / 100 - e / 50);
}

/* ---------------- Streetwise ---------------- */

/** A man's newer skill as a part of his fit for a job that wants it (eat.ts fitOf), with his perks in it. */
export function fitParts(s: GameState, c: Character, ks: readonly NewSkill[] | undefined): SkillReason[] {
  if (!ks?.length) return [];
  const out: SkillReason[] = [];
  for (const k of ks) {
    const v = skillValue(c, k);
    const p = perksHeld(s, c, k);
    const val = Math.round((v - 50) * 0.25) + p * 3;
    if (val) out.push({ label: `His ${NEW_SKILL_NAME[k].toLowerCase()} (${v})`, value: val });
  }
  return out;
}

/** The boss's word on the street: his men's own scores (Knows Every Corner), in points of chance. */
export function streetOddsBonus(s: GameState): number {
  return perkMod(s, 'streetOdds') / 100;
}

/** A man's own score gone wrong ends in a pinch this often (eat.ts ownScore; base 0.2). */
export function pinchChance(s: GameState, c: Character, base = 0.2): number {
  const e = skillEdge(skillValue(c, 'streetwise'));
  return Math.max(0.05, base * (1 - e * 0.06) * (1 - perkMod(s, 'pinch') / 100) * (1 - perksHeld(s, c, 'streetwise') * 0.1));
}

/** The cops' moves (raids, stake-outs, wires) coming to nothing: the boss's nose (threats.ts foilOdds). */
export function copsFoil(s: GameState): number {
  return Math.max(0, skillEdge(bossNs(s, 'streetwise'))) / 100 + perkMod(s, 'cops') / 100;
}

/** Having a man checked for a badge (feds.ts brascoChecked): Smells a Rat, and a streetwise boss. */
export function ratNose(s: GameState): number {
  return Math.max(0, skillEdge(bossNs(s, 'streetwise'))) / 100 + perkMod(s, 'ratNose') / 100;
}

/* ---------------- Politics ---------------- */

/** Percent off a bribe's price (interactions.ts; Friends Downtown comes through perkMod 'bribe'). */
export function bribeSkillPct(s: GameState): number {
  return Math.max(0, skillEdge(bossNs(s, 'politics')));
}

/** Percent off the pad's envelopes (payroll.ts: cops, politicians, clerks). */
export function padCostPct(s: GameState): number {
  return Math.max(0, skillEdge(bossNs(s, 'politics'))) + perkMod(s, 'padCost');
}

/** An official's answer to the boss's envelope (interactions.ts bribe): his politics, The Fix Is In. */
export function politicsReasons(s: GameState): SkillReason[] {
  const out = bossReason(s, 'politics', 'Knows how City Hall works');
  const f = perkMod(s, 'bribeOdds');
  if (f) out.push({ label: 'The Fix Is In', value: f });
  return out;
}

/** The federal case on the boss builds this much of what it would (fedsState.ts addFedEvidence). */
export function fedCaseMult(s: GameState): number {
  return Math.max(0.6, 1 - perkMod(s, 'fedCase') / 100 - Math.max(0, skillEdge(bossNs(s, 'politics'))) / 100);
}

/* ---------------- Showbiz ---------------- */

/** An act signing, a room booking (showbiz.ts): his showbiz, Knows the Acts, Name on the Marquee. */
export function showbizReasons(s: GameState): SkillReason[] {
  const out = bossReason(s, 'showbiz', 'Knows the business');
  const b = perkMod(s, 'booking');
  if (b) out.push({ label: 'Your name in showbiz (perks)', value: b });
  return out;
}

/* ---------------- Take: Showbiz and Gambling ---------------- */

export const isGamblingBiz = (b: Pick<Business, 'kind'>): boolean => GAMBLING_KINDS.has(b.kind);
export const isShowbizBiz = (b: Pick<Business, 'kind'>): boolean => SHOWBIZ_KINDS.has(b.kind);

/** The skill a place's take answers to (Gambling, Showbiz, or none). */
export function takeSkillOf(b: Pick<Business, 'kind'>): NewSkill | undefined {
  return isGamblingBiz(b) ? 'gambling' : isShowbizBiz(b) ? 'showbiz' : undefined;
}

/** Percent more on a place's take: the better of its runner's and the boss's skill (never less), and the boss's perks. */
export function takePct(s: GameState, b: Business): number {
  const k = takeSkillOf(b);
  if (!k) return 0;
  const runner = (b.staffIds ?? []).map((id) => s.characters[id]).find((c) => c?.alive);
  const v = Math.max(bossNs(s, k), runner ? skillValue(runner, k) : 0);
  const runnerPerks = runner && runner.id !== s.playerId ? perksHeld(s, runner, k) : 0;
  return Math.max(0, skillEdge(v)) + runnerPerks + perkMod(s, k === 'gambling' ? 'gamble' : 'venue');
}

/** A losing week at the book loses this share less (The House Always Wins). */
export function bookLossCut(s: GameState): number {
  return Math.min(0.6, perkMod(s, 'bookLoss') / 100);
}

/** The week's take lines (economy.ts runBusinesses): one adder per place, summed by skill. */
export class TakeTally {
  sum: Record<'gambling' | 'showbiz', { amt: number; n: number }> = { gambling: { amt: 0, n: 0 }, showbiz: { amt: 0, n: 0 } };
  /** A place's week (`amt` before the skill): returns what the skill adds (or saves on a loss). */
  add(s: GameState, b: Business, amt: number): number {
    const k = takeSkillOf(b);
    if (!k || k === 'charm') return 0;
    let extra = 0;
    if (amt > 0) extra = Math.round(amt * takePct(s, b) / 100);
    else if (amt < 0 && k === 'gambling') extra = Math.round(-amt * bookLossCut(s));
    if (extra > 0) { this.sum[k as 'gambling' | 'showbiz'].amt += extra; this.sum[k as 'gambling' | 'showbiz'].n++; }
    return extra;
  }
}
