import { journalNow } from './journal';
import type { Ctx } from './ledger';
import type { PerkKey } from './lifestyle';
import { isNewSkill, NEW_SKILL_NAME, NEW_SKILLS, newSkillOfDeed, skillValue, type NewSkill } from './newSkillsCore';
import type { Attributes, GameState } from './types';

/**
 * THE BOSS'S SKILLS GROW FROM WHAT HE DOES (GODFATHER_LOYALTY_SKILLS.md §D).
 *
 * The six attributes (types.ts Attributes). Every order he gives, every
 * decision he answers, and the week itself (the envelopes, the books, a war,
 * a quiet week) is practice in one of them, read off its words (skillOfDeed).
 * Practice turns into points (every PT_XP), and the boss puts each point
 * where he wants: +1 to that skill. Points put into one skill open its small
 * perk tree at 3, 6 and 10 (SKILL_PERKS): modest bonuses read at the point of
 * use through lifestyle.perkMod (no balance constant changes). One FOCUS
 * doubles the practice in its area (defaults to his lifestyle's skill).
 *
 * This sits beside, and never replaces, crewXp.ts (levels, +2 points per
 * level, specialties: the boss's and every man's) and lifestyle.ts (the CK
 * lifestyle trees). His men grow through crewXp: their points are spent on
 * their own sheets' Skills tab.
 *
 * The skills belong to the man: an heir in the chair starts his own practice
 * (what was put in stays in his attributes). Compact: numbers and a six-line
 * log. `GameState.bsk` is optional, made by the first practice.
 */

export type Skill = keyof Attributes;
export const SKILLS: Skill[] = ['leadership', 'business', 'diplomacy', 'intrigue', 'force', 'discipline'];
/**
 * The six attributes and the five newer skills (newSkillsCore.ts: Charm,
 * Streetwise, Politics, Showbiz, Gambling). The newer ones practice, take
 * points and open their 3/6/10 trees exactly like the six; a point adds +1 to
 * `Character.sk` (never to the attributes).
 */
export type AnySkill = Skill | NewSkill;
export const ALL_SKILLS: AnySkill[] = [...SKILLS, ...NEW_SKILLS];
export const SKILL_NAME: Record<AnySkill, string> = { leadership: 'Leadership', business: 'Business', diplomacy: 'Diplomacy', intrigue: 'Intrigue', force: 'Muscle', discipline: 'Discipline', ...NEW_SKILL_NAME };

/** The boss's value in any skill (an attribute, or a newer skill's base plus what he added). */
export function bossSkillValue(s: GameState, k: AnySkill): number {
  const c = s.characters[s.playerId];
  if (!c) return 0;
  return isNewSkill(k) ? skillValue(c, k) : c.attributes[k];
}

/** [week, skill, xp, why]. */
export type PracticeLine = [number, AnySkill, number, string];

export interface BskState {
  v: 1;
  /** The man these belong to (the boss when they were earned). */
  id: string;
  /** Practice toward the next point. */
  x: number;
  /** Lifetime practice per area. */
  px: Partial<Record<AnySkill, number>>;
  /** Points to put in. */
  p: number;
  /** Points put in, per skill (the perk trees read these). */
  inv: Partial<Record<AnySkill, number>>;
  /** The focus: double practice here. */
  foc?: AnySkill;
  /** The last few lessons, oldest first. */
  lg: PracticeLine[];
  /** This week's practice so far (the weekly cap). */
  wk?: number;
  wx?: number;
}

/** Practice per point. */
export const PT_XP = 30;
/** Most practice in one week (a busy week teaches, but only so much). */
export const BSK_WEEK_CAP = 24;
const LOG_KEEP = 6;
/** Points in one skill that open each perk. */
export const PERK_AT = [3, 6, 10] as const;

export interface SkillPerk { id: string; skill: AnySkill; at: number; name: string; text: string; mods: Partial<Record<PerkKey, number>> }

const SP = (skill: AnySkill, at: number, id: string, name: string, text: string, mods: SkillPerk['mods']): SkillPerk => ({ id, skill, at, name, text, mods });

/** A small tree per skill (modest: a perk is a nudge at the point of use, never a new rule). */
export const SKILL_PERKS: Record<AnySkill, SkillPerk[]> = {
  leadership: [
    SP('leadership', 3, 'sk_l3', 'A Steady Hand', 'Your men think 1 better of you every month.', { crewOpinion: 1 }),
    SP('leadership', 6, 'sk_l6', 'Nobody Feels Forgotten', 'Men you have not seen in a while drift away slower.', { defection: 1 }),
    SP('leadership', 10, 'sk_l10', 'Capos Stand Behind You', 'Every capo thinks 2 better of you every month.', { capoLoyal: 2 }),
  ],
  business: [
    SP('business', 3, 'sk_b3', 'Head for Numbers', 'Business income +2%.', { income: 2 }),
    SP('business', 6, 'sk_b6', 'Lean Books', 'Upkeep −5%.', { upkeep: 5 }),
    SP('business', 10, 'sk_b10', 'Books That Explain', 'Your books explain more income: wash capacity +10%.', { launder: 10 }),
  ],
  diplomacy: [
    SP('diplomacy', 3, 'sk_d3', 'A Good Listener', 'People are a little more likely to say yes (+2).', { accept: 2 }),
    SP('diplomacy', 6, 'sk_d6', 'Favor Bank', 'Favors come 15% more often.', { favor: 15 }),
    SP('diplomacy', 10, 'sk_d10', 'Sit-down Man', 'At a sit-down, the other side settles 5 points closer to you.', { sitdown: 5 }),
  ],
  intrigue: [
    SP('intrigue', 3, 'sk_i3', 'Careful', 'Schemes +4 secrecy.', { secrecy: 4 }),
    SP('intrigue', 6, 'sk_i6', 'Ears', 'Digging +15%.', { intel: 15 }),
    SP('intrigue', 10, 'sk_i10', 'The Quiet Envelope', 'A woman who turns down your quiet envelope tells her man 15 points less often.', { quietEnv: 15 }),
  ],
  force: [
    SP('force', 3, 'sk_f3', 'A Hard Look', '+5 resistance to murder.', { guard: 5 }),
    SP('force', 6, 'sk_f6', 'Steady Aim', 'Hits +3 power.', { hitPower: 3 }),
    SP('force', 10, 'sk_f10', 'Clean Work', 'Hits are cleaner: +8 secrecy on a hit.', { cleanHit: 8 }),
  ],
  discipline: [
    SP('discipline', 3, 'sk_x3', 'Tight Lips', 'Schemes +3 secrecy.', { secrecy: 3 }),
    SP('discipline', 6, 'sk_x6', 'Early to Bed', 'Local heat −1 every other week.', { localHeat: 1 }),
    SP('discipline', 10, 'sk_x10', 'Nobody Skims Under Me', 'Your men come up short 20% less often.', { skim: 20 }),
  ],
  // The five newer skills (newSkills.ts reads each where it lands).
  charm: [
    SP('charm', 3, 'sk_c3', 'First Impressions', '+5 when you ask a woman out or for an evening.', { firstImp: 5 }),
    SP('charm', 6, 'sk_c6', 'Smooth It Over', 'A third less chance your wife or the island hears about your nights.', { smooth: 33 }),
    SP('charm', 10, 'sk_c10', 'Leading Man', '+4 on every romantic answer and every match; your wife thinks 1 better of you every month.', { charm: 4, wifeOp: 1 }),
  ],
  streetwise: [
    SP('streetwise', 3, 'sk_s3', 'Nose for Cops', 'Raids, stake-outs and wires come to nothing 8% more often.', { cops: 8 }),
    SP('streetwise', 6, 'sk_s6', 'Knows Every Corner', 'Your men\'s own scores +4%, and a quarter less likely to end in a pinch.', { streetOdds: 4, pinch: 25 }),
    SP('streetwise', 10, 'sk_s10', 'Smells a Rat', 'Having a man checked for a badge or a wire: +15%.', { ratNose: 15 }),
  ],
  politics: [
    SP('politics', 3, 'sk_p3', 'Friends Downtown', 'Bribes and the pad (cops, politicians, clerks) cost 5% less.', { bribe: 5, padCost: 5 }),
    SP('politics', 6, 'sk_p6', 'The Fix Is In', 'Officials +5 to take your envelope; favors come 15% more often.', { bribeOdds: 5, favor: 15 }),
    SP('politics', 10, 'sk_p10', 'Friends in Trenton', 'The federal case against you builds 15% slower.', { fedCase: 15 }),
  ],
  showbiz: [
    SP('showbiz', 3, 'sk_w3', 'Knows the Acts', '+5 when an act signs with you or a room books one.', { booking: 5 }),
    SP('showbiz', 6, 'sk_w6', 'Packed House', 'Your clubs and venues take 4% more.', { venue: 4 }),
    SP('showbiz', 10, 'sk_w10', 'Name on the Marquee', 'Clubs and venues 4% more again; +5 more on signings and bookings.', { venue: 4, booking: 5 }),
  ],
  gambling: [
    SP('gambling', 3, 'sk_g3', 'Reads the Table', 'Books, numbers, card games and the casino take 3% more.', { gamble: 3 }),
    SP('gambling', 6, 'sk_g6', 'House Edge', 'The games take 4% more again.', { gamble: 4 }),
    SP('gambling', 10, 'sk_g10', 'The House Always Wins', 'A losing week at the book loses a third less; the games 3% more.', { gamble: 3, bookLoss: 33 }),
  ],
};

export const ALL_SKILL_PERKS: SkillPerk[] = ALL_SKILLS.flatMap((k) => SKILL_PERKS[k]);

/** The boss's skill state, if it is his (an heir's chair starts fresh). */
export function bskOf(s: GameState): BskState | undefined {
  return s.bsk && s.bsk.id === s.playerId ? s.bsk : undefined;
}

export function ensureBsk(s: GameState): BskState {
  if (!s.bsk || s.bsk.id !== s.playerId) s.bsk = { v: 1, id: s.playerId, x: 0, px: {}, p: 0, inv: {}, lg: [] };
  const b = s.bsk;
  b.px ??= {};
  b.inv ??= {};
  b.lg ??= [];
  b.x ??= 0;
  b.p ??= 0;
  return b;
}

/** For upgradeSave: fills in a save that has the key, never makes one. */
export function ensureBskSave(s: GameState): BskState | undefined {
  const b = s.bsk;
  if (!b) return undefined;
  b.px ??= {};
  b.inv ??= {};
  b.lg ??= [];
  b.x ??= 0;
  b.p ??= 0;
  return b;
}

/** The focus: his own pick, else his lifestyle's skill. */
export function focusSkill(s: GameState): AnySkill | undefined {
  const b = bskOf(s);
  if (b?.foc) return b.foc;
  const ls = s.characters[s.playerId]?.lifestyle?.focus;
  return ls ? ({ muscle: 'force', money: 'business', politics: 'diplomacy', family: 'leadership', shadows: 'intrigue' } as const)[ls] : undefined;
}

/** Which skill a deed teaches, read off its words. */
export function skillOfDeed(text: string): Skill | undefined {
  const t = text.toLowerCase();
  if (/\b(hit|whack|kill|murder|beat|rough|muscle|raid|war\b|strike|threat|scare|lesson|bones|enforc|shake|torch|burn|gun|guard|fight|break)/.test(t)) return 'force';
  if (/(scheme|spy|dig|secret|wire|tail|watch|blackmail|ears?\b|hook|rat\b|inform|quiet envelope|hush|leverage|plant|bug|frame|tip|inquir|suspect|test him|sleuth)/.test(t)) return 'intrigue';
  if (/(sit[- ]?down|talk|peace|truce|table|friend|gift|wedding|godfather|christen|baptis|marr|match|envoy|vote|petition|favor|city hall|bribe|dinner|invite|visit|apolog|charm|court|date|drink|toast|compare|mayor|council|judge|paper|newspaper)/.test(t)) return 'diplomacy';
  if (/(buy|sell|business|racket|loan|wash|launder|book|invest|build|price|bank|store|shop|money|wage|raise|hire|lease|stake|earn|take\b|vig|shylock|property|license|front)/.test(t)) return 'business';
  if (/(capo|promot|recogni|reward|crew|soldier|made|seat|assign|order|underboss|consigliere|regime|associate|kick|envelope|men\b|man\b)/.test(t)) return 'leadership';
  if (/(refus|declin|\bno\b|wait|pass\b|forgiv|patien|stay|church|mass\b|confess|save|turn(ed)? down|too busy|skip|let it go|kept|quiet|home|rest|sober)/.test(t)) return 'discipline';
  return undefined;
}

/** Practice in one skill (the one entry point). Returns what he got after the focus and the weekly cap. */
export function practice(s: GameState, k: AnySkill, n: number, why: string): number {
  if (s.gameOver || !(n > 0) || !s.characters[s.playerId]?.alive) return 0;
  const b0 = ensureBsk(s);
  // Copy on write (a pure action may hold a shallow copy of the state).
  const b: BskState = { ...b0, px: { ...b0.px }, lg: b0.lg.map((l) => [...l] as PracticeLine) };
  s.bsk = b;
  if (b.wk !== s.week) { b.wk = s.week; b.wx = 0; }
  const want = Math.round(n * (focusSkill(s) === k ? 2 : 1));
  const got = Math.min(want, BSK_WEEK_CAP - (b.wx ?? 0));
  if (got <= 0) return 0;
  b.wx = (b.wx ?? 0) + got;
  b.px[k] = (b.px[k] ?? 0) + got;
  b.x += got;
  const y = why.length > 40 ? `${why.slice(0, 39)}…` : why;
  const last = b.lg[b.lg.length - 1];
  if (last && last[0] === s.week && last[1] === k && last[3] === y) last[2] += got;
  else b.lg.push([s.week, k, got, y]);
  if (b.lg.length > LOG_KEEP) b.lg.splice(0, b.lg.length - LOG_KEEP);
  while (b.x >= PT_XP) {
    b.x -= PT_XP;
    b.p += 1;
  }
  return got;
}

/** An order given or a decision answered: practice in what it was about (and in a newer skill its words touch, too). */
export function practiceDeed(s: GameState, text: string, n = 3): void {
  const k = skillOfDeed(text);
  const why = text.replace(/\s+/g, ' ').trim();
  if (k) practice(s, k, n, why);
  else practice(s, 'leadership', Math.max(1, n - 2), why);
  const nk = newSkillOfDeed(text);
  if (nk) practice(s, nk, n, why);
}

/** The week: what running the family taught him. */
export function bossSkillsWeek(ctx: Ctx, before?: GameState): void {
  const s = ctx.s;
  if (s.gameOver || s.week < 2) return;
  const had = bskOf(s)?.p ?? 0;
  const rep = s.tribute?.reports.find((r) => r.week === s.week);
  if (rep && rep.crews.length && rep.crews.every((c) => c.short <= 0)) practice(s, 'leadership', 2, 'Every crew\'s envelope came in full');
  if (before && s.money > before.money) practice(s, 'business', 2, 'The books came out ahead');
  if (s.wars.length) practice(s, 'force', 2, 'Ran a war');
  if (before && s.respect > before.respect) practice(s, 'diplomacy', 1, 'The town respects you more');
  if (s.schemes.some((x) => x.owner === 'player')) practice(s, 'intrigue', 2, 'A plan in motion');
  if (s.heat.local < 25 && s.heat.federal < 25) practice(s, 'discipline', 1, 'Kept a low profile');
  // The newer skills: what the family's places and friends teach him.
  const own = s.businesses.filter((x) => x.owner === 'player' && !x.leasedTo);
  if (own.some((x) => GAMBLING_KINDS.has(x.kind))) practice(s, 'gambling', 1, 'The books and the games ran');
  if (own.some((x) => SHOWBIZ_KINDS.has(x.kind))) practice(s, 'showbiz', 1, 'The clubs were open');
  if (Object.values(s.payroll?.hires ?? {}).some((h) => h.job === 'cop' || h.job === 'politician')) practice(s, 'politics', 1, 'Friends on the pad');
  const b = bskOf(s);
  if (b && b.p > had) ctx.log.push(`You learned something running the family: ${b.p} skill point${b.p > 1 ? 's' : ''} to put in (your sheet, Skills).`);
}

/** The games (Gambling) and the rooms (Showbiz): the places each newer skill runs through. */
export const GAMBLING_KINDS: ReadonlySet<string> = new Set(['numbers', 'bookmaking', 'cardgame', 'casino', 'court']);
export const SHOWBIZ_KINDS: ReadonlySet<string> = new Set(['club', 'supperclub', 'burlesque', 'gentsclub', 'hoodclub', 'talent', 'label', 'afterhours']);

/** Points put into a skill. */
export function invested(s: GameState, k: AnySkill): number {
  return bskOf(s)?.inv[k] ?? 0;
}

/** The skill perks the boss has (from the points he put in). */
export function skillPerksOwned(s: GameState): SkillPerk[] {
  const b = bskOf(s);
  if (!b) return [];
  return ALL_SKILL_PERKS.filter((p) => (b.inv[p.skill] ?? 0) >= p.at);
}

/** Sum of a modifier across the skill perks (lifestyle.perkMod adds it). */
export function skillMod(s: GameState, key: PerkKey): number {
  const b = bskOf(s);
  if (!b) return 0;
  let v = 0;
  for (const p of ALL_SKILL_PERKS) if ((b.inv[p.skill] ?? 0) >= p.at) v += p.mods[key] ?? 0;
  return v;
}

/** Why a point can't go into this skill (undefined = it can). */
export function allocBlock(s: GameState, k: AnySkill): string | undefined {
  const b = bskOf(s);
  if (!b || b.p < 1) return 'No point to put in';
  if (!s.characters[s.playerId] || bossSkillValue(s, k) >= 100) return 'Already at 100';
  return undefined;
}

/** Put a point into a skill: +1, and toward its perks (pure; written to Your File). */
export function allocatePoint(s: GameState, k: AnySkill): GameState {
  if (allocBlock(s, k)) return s;
  const b0 = bskOf(s)!;
  const c0 = s.characters[s.playerId];
  const inv = (b0.inv[k] ?? 0) + 1;
  const b: BskState = { ...b0, p: b0.p - 1, inv: { ...b0.inv, [k]: inv }, lg: b0.lg.slice() };
  const v0 = bossSkillValue(s, k);
  // A newer skill grows in `sk` (what he added); the six in the attributes.
  const c = isNewSkill(k)
    ? { ...c0, sk: { ...c0.sk, [k]: (c0.sk?.[k] ?? 0) + 1 } }
    : { ...c0, attributes: { ...c0.attributes, [k]: Math.min(100, c0.attributes[k] + 1) } };
  const opened = SKILL_PERKS[k].find((p) => p.at === inv);
  const t: GameState = { ...s, bsk: b, characters: { ...s.characters, [c.id]: c } };
  const v1 = bossSkillValue(t, k);
  return journalNow(t, {
    t: opened ? `You learned ${opened.name}` : `${SKILL_NAME[k]} ${v1}: a point put in`,
    x: opened ? `${SKILL_NAME[k]}: ${inv} points put in. ${opened.text}` : `${SKILL_NAME[k]} ${v0} → ${v1}. ${inv} point${inv > 1 ? 's' : ''} in it${nextPerk(k, inv) ? `; ${nextPerk(k, inv)!.at - inv} more for ${nextPerk(k, inv)!.name}` : ''}.`,
    c: 'family', src: 'skills',
  });
}

/** The next perk up a skill's tree. */
export function nextPerk(k: AnySkill, inv: number): SkillPerk | undefined {
  return SKILL_PERKS[k].find((p) => p.at > inv);
}

/** Pick (or clear) the focus (pure). */
export function setSkillFocus(s: GameState, k: AnySkill | undefined): GameState {
  const b0 = s.bsk && s.bsk.id === s.playerId ? s.bsk : { v: 1 as const, id: s.playerId, x: 0, px: {}, p: 0, inv: {}, lg: [] };
  const b: BskState = { ...b0, lg: b0.lg.slice() };
  if (k) b.foc = k;
  else delete b.foc;
  return journalNow({ ...s, bsk: b }, { t: k ? `Your focus: ${SKILL_NAME[k]}` : 'No focus: you learn what the life teaches', x: k ? `Practice in ${SKILL_NAME[k].toLowerCase()} counts double.` : undefined, c: 'family', src: 'skills' });
}
