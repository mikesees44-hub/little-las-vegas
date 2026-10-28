import { fertility } from './aging';
import { displayName, hasTrait, player } from './characters';
import { datingSettings, ensureDating, type PregnancySetting } from './datingState';
import { applyEffects } from './effects';
import { appeal } from './looks';
import { pressItem } from './paper';
import { protectionFor } from './protect';
import { defectTo } from './regimes';
import { addOpinion, changeMeter, opinionBreakdown } from './relations';
import { drawnTo } from './romance';
import { addSecret } from './secrets';
import { ensureRomance } from './storyState';
import {
  $, affairOf, ageOf, clamp, isAdultC, manOf, marriedOf, nameOf, roll, WX, wlog,
} from './womenCore';
import { MOTIVE_TEXT, SETTING_INFO, SETTINGS, type Affair, type Motive, type Setting, type WomenState } from './womenState';
import type { Acceptance, Reason } from './interactions';
import type { Ctx } from './ledger';
import type { Character, Choice, Effect, EventInstance, FactionId, GameState, RivalId } from './types';

/**
 * AFFAIRS, CK3 style, every step hers to decide.
 *
 *  - A dinner on the town (public: people see), then, if she wants it, an
 *    affair; nights in a setting the boss proposes and she agrees to (the
 *    office, the car, her place, a motel, a grand hotel), or she says where
 *    she would rather, or no. Fade to black; one line.
 *  - Her feelings grow with time, gifts, money and nights, each with
 *    diminishing returns; her guilt grows beside them (her husband, his place
 *    in your crew). She can end it ("this is the last night") and that is
 *    final: no gift or repeated ask changes it.
 *  - Who knows: a witness, then gossip, then a line in Spout Off, one of your
 *    men, her husband. Her husband reacts as the man he is: he confronts
 *    her, separates, goes to a rival, to the cops (evidence: the law system
 *    takes it from there), comes for the boss, or swallows it.
 *  - Pregnancy: each night is its own chance at the player's setting, so the
 *    total climbs with every night (1 - (1-p)^n); her decisions are hers.
 *  - Women proposition the boss too (the good life, power, protection, love).
 *
 * Help with money is a different thing entirely (women.ts requests): the
 * gratitude it earns is kept out of every romantic odds here.
 */

/** The opinion reason a request's help leaves: never counted toward any romantic odds. */
export const HELP_REASON = 'Helped my household';

/** Per-night chance at each pregnancy setting (game numbers, not medicine). */
export const PER_NIGHT: Record<PregnancySetting, number> = { off: 0, rare: 0.03, normal: 0.06 };

/** The total chance over n nights at a per-night chance p. */
export function cumulative(p: number, n: number): number {
  return 1 - Math.pow(1 - p, Math.max(0, n));
}

/** Her opinion of the boss with the gratitude for help taken out (help never buys romance). */
export function romanticOpinion(s: GameState, id: string): number {
  const b = opinionBreakdown(s, id, s.playerId);
  return Math.max(-100, Math.min(100, b.total - b.mods.filter((m) => m.reason === HELP_REASON).reduce((a, m) => a + m.value, 0)));
}

function acc(base: number, reasons: Reason[], cap = 0.9): Acceptance {
  const sum = reasons.reduce((a, r) => a + r.value, base);
  return { chance: Math.max(0.03, Math.min(cap, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

function commonReasons(s: GameState, c: Character, a: Affair | undefined): Reason[] {
  const boss = player(s);
  const op = romanticOpinion(s, c.id);
  const m = manOf(s, c);
  const p = s.nightlife?.people[c.id];
  const r: Reason[] = [
    { label: 'What she thinks of you', value: Math.round(Math.max(-25, Math.min(25, op / 2))) },
    { label: 'How you look to her', value: Math.round(appeal(s, c, boss).value / 2) },
  ];
  if (a?.aff) r.push({ label: 'Her feelings', value: Math.round(a.aff / 3) });
  if (p?.attach) r.push({ label: 'She is attached to you', value: Math.round(p.attach / 5) });
  if (marriedOf(s, c)) r.push({ label: 'She is married', value: -12 });
  if (m?.faction === 'player') r.push({ label: 'Her husband works for you', value: -15 });
  else if (m && m.faction !== 'none') r.push({ label: 'Her husband is another family\'s man', value: -6 });
  if (hasTrait(c, 'Pious')) r.push({ label: 'Pious', value: -15 });
  if (hasTrait(c, 'Ambitious') || hasTrait(c, 'Greedy')) r.push({ label: 'You are the boss', value: 8 });
  if (p?.grudge !== undefined || (p?.afraid !== undefined && s.week - p.afraid < 52)) r.push({ label: 'She keeps away from you', value: -40 });
  if (a?.initiated) r.push({ label: 'She came to you first', value: 25 });
  return r;
}

/** Can he ask her anything now? A refusal is respected: weeks before asking again, and two closes the door. */
export function askBlock(s: GameState, c: Character): string | undefined {
  if (!drawnTo(s, c, player(s))) return 'She is not interested in men';
  const a = affairOf(s, c.id);
  if (!a) return undefined;
  if (a.closed !== undefined) return 'She closed the door. That is final unless she opens it';
  if (a.stage === 'ended') return a.ended?.by === 'her' || a.ended?.by === 'husband' ? 'She ended it. That is final unless she comes to you' : undefined;
  const last = a.refused[a.refused.length - 1];
  if (last !== undefined && s.week - last < 8) return `She said no in week ${last}: not before week ${last + 8}`;
  return undefined;
}

export function dinnerAcceptance(s: GameState, c: Character): Acceptance {
  const a = affairOf(s, c.id);
  return acc(25, [...commonReasons(s, c, a), ...(a?.dinners ? [{ label: 'You have had dinner before', value: 8 }] : [])]);
}

export function pursueAcceptance(s: GameState, c: Character): Acceptance {
  const a = affairOf(s, c.id);
  return acc(12, [...commonReasons(s, c, a), { label: 'Dinners together', value: Math.min(15, (a?.dinners ?? 0) * 5) }], 0.85);
}

/* ---------------- Where: her say ---------------- */

/** Her view of each setting: a fit (-40..+15), or a flat no with her reason. */
export function settingView(s: GameState, c: Character, at: Setting): { fit: number; no?: string } {
  const m = manOf(s, c);
  const p = s.nightlife?.people[c.id];
  const home = !!m && !p?.fam.away && (!m.imprisonedUntil || m.imprisonedUntil <= s.week);
  const high = p?.role === 'escort' || /Glamorous|Fashionable/.test(s.nightlife?.looks[c.id]?.st ?? '') ;
  switch (at) {
    case 'herplace':
      if (home && marriedOf(s, c)) return { fit: 0, no: 'Not in her husband\'s house' };
      return { fit: p?.fam.kids.length ? -10 : 10 };
    case 'office':
      if (m?.faction === 'player') return { fit: 0, no: 'Not where her husband\'s friends work' };
      return { fit: (p?.discretion ?? 50) >= 70 ? -15 : -5 };
    case 'car':
      if (high) return { fit: 0, no: 'Not in a car' };
      return { fit: -10 };
    case 'hotel': return { fit: 5 };
    case 'grand': return { fit: high ? 15 : 10 };
  }
}

/** Her favorite of the settings (what she says when she would rather somewhere else). */
export function herPick(s: GameState, c: Character): Setting {
  return [...SETTINGS].filter((x) => !settingView(s, c, x).no).sort((a, b) => settingView(s, c, b).fit - settingView(s, c, a).fit || SETTINGS.indexOf(b) - SETTINGS.indexOf(a))[0] ?? 'hotel';
}

export function nightAcceptance(s: GameState, c: Character, at: Setting): Acceptance {
  const a = affairOf(s, c.id);
  const v = settingView(s, c, at);
  const reasons: Reason[] = [
    { label: 'Her feelings', value: Math.round((a?.aff ?? 0) / 3) },
    { label: 'Her guilt', value: -Math.round((a?.guilt ?? 0) / 4) },
    { label: `${SETTING_INFO[at].label}: to her`, value: v.fit },
  ];
  if (a?.last1 !== undefined) reasons.push({ label: 'She said this is the last time', value: 10 });
  if (a?.fear && a.fear >= 50) reasons.push({ label: 'She is afraid of being found out', value: -10 });
  return acc(50, reasons, 0.92);
}

/* ---------------- Pregnancy ---------------- */

/** Per-night chance with her (0 when the setting is off, she is outside the years, or already expecting). */
export function perNight(s: GameState, c: Character): number {
  const p = PER_NIGHT[datingSettings(s).pregnancy];
  if (!p || !isAdultC(s, c) || ageOf(s, c) > 44) return 0;
  if ((s.romance?.pregnancies ?? []).some((x) => x.motherId === c.id)) return 0;
  const careful = s.nightlife?.people[c.id]?.bounds.includes('careful') ? 0.4 : 1;
  return p * careful * fertility(s, c) * fertility(s, player(s));
}

/** The chance after `n` nights in all, in words the boss could know (no hidden facts). */
export function pregnancyRisk(s: GameState, c: Character, n: number): { chance: number; word: 'none' | 'low' | 'moderate' | 'high' } {
  const ch = cumulative(perNight(s, c), n);
  return { chance: ch, word: ch <= 0 ? 'none' : ch < 0.08 ? 'low' : ch < 0.2 ? 'moderate' : 'high' };
}

function conceive(ctx: Ctx, W: WomenState, a: Affair, c: Character): void {
  const s = ctx.s;
  const p = perNight(s, c);
  if (!p || a.preg) return;
  if (roll(`${s.seed}|${s.week}|wconceive|${c.id}|${a.n}`) >= p) return;
  const boss = player(s);
  const R = ensureRomance(s);
  const id = `pg${s.nextId++}`;
  R.pregnancies.push({ id, motherId: c.id, fatherId: boss.id, dueWeek: s.week + 36 + Math.floor(roll(`${s.seed}|wdue|${id}`) * 4) });
  R.stats.pregnancies++;
  const D = ensureDating(s);
  D.stats.pregnancies++;
  D.preg.push({ id, motherId: c.id, week: s.week, knownBy: [c.id], tellAt: s.week + 7 });
  a.preg = id;
  a.pregWeek = s.week;
  W.stats.preg++;
}

/* ---------------- A night, a dinner ---------------- */

/** Someone sees: one of your men (by name) or the town. */
function witness(ctx: Ctx, W: WomenState, a: Affair, c: Character, expose: number, what: string): void {
  const s = ctx.s;
  const cut = protectionFor(s, s.playerId, 'night').cut * 0.5;
  if (roll(`${s.seed}|${s.week}|wsee|${c.id}|${what}|${a.n}|${a.dinners}`) >= expose * (1 - cut)) return;
  const men = Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && x.id !== s.playerId && x.gender === 'M' && isAdultC(s, x)).sort((x, y) => (x.id < y.id ? -1 : 1));
  const m = manOf(s, c);
  const k = Math.floor(roll(`${s.seed}|${s.week}|wwho|${c.id}`) * (men.length + 3));
  const w = men[k];
  if (w && w.id !== m?.id) a.known.push({ w: w.id, how: 'witness', week: s.week });
  else a.known.push({ w: 'town', how: 'witness', week: s.week });
  if (a.known.length > 8) a.known.splice(0, a.known.length - 8);
  a.fear = clamp(a.fear + 10);
  wlog(W, s, `Somebody saw you with ${c.firstName} (${what}).`);
}

export function applyDinner(ctx: Ctx, W: WomenState, a: Affair, c: Character): void {
  const s = ctx.s;
  a.dinners++;
  a.last = s.week;
  if (a.stage === 'interest') a.stage = 'dating';
  a.aff = clamp(a.aff + 10 / (1 + a.dinners * 0.25));
  if (marriedOf(s, c)) a.guilt = clamp(a.guilt + (manOf(s, c)?.faction === 'player' ? 8 : 4));
  addOpinion(s, c.id, s.playerId, 'A dinner on the town', 4, 1);
  W.stats.asked++;
  witness(ctx, W, a, c, 0.35, 'a dinner on the town');
  const line = `Dinner on the town with ${c.firstName} ${c.lastName}. Seen out together.`;
  wlog(W, s, line);
  ctx.log.push(line);
}

export function applyNight(ctx: Ctx, W: WomenState, a: Affair, c: Character, at: Setting): void {
  const s = ctx.s;
  a.n++;
  a.nights.push(s.week);
  if (a.nights.length > 12) a.nights.splice(0, a.nights.length - 12);
  a.last = s.week;
  a.aff = clamp(a.aff + 9 / (1 + a.n / 5));
  const m = manOf(s, c);
  if (marriedOf(s, c)) a.guilt = clamp(a.guilt + (m?.faction === 'player' ? 9 : 5));
  W.stats.nights++;
  witness(ctx, W, a, c, SETTING_INFO[at].expose, SETTING_INFO[at].label.toLowerCase());
  conceive(ctx, W, a, c);
  const line = `An evening with ${c.firstName} (${SETTING_INFO[at].label.toLowerCase()}). Then it was morning.`;
  wlog(W, s, line);
  ctx.log.push(line);
  // "This is the last night": she meant it.
  if (a.last1 !== undefined) endAffair(ctx, W, a, c, 'her', 'She said it was the last night, and it was.');
}

export function endAffair(ctx: Ctx, W: WomenState, a: Affair, c: Character, by: 'her' | 'boss' | 'husband', why: string): void {
  const s = ctx.s;
  if (a.stage === 'ended') return;
  a.stage = 'ended';
  a.ended = { week: s.week, by, why };
  a.arrangement = undefined;
  a.last1 = undefined;
  W.stats.ended++;
  if (by === 'boss') {
    if (a.aff >= 50) {
      addOpinion(s, c.id, s.playerId, 'He ended it', -15, 1);
      const p = s.nightlife?.people[c.id];
      if (p) p.scorned = s.week;
    } else addOpinion(s, c.id, s.playerId, 'He ended it kindly', 2, 1);
  }
  const line = `It is over with ${c.firstName} ${c.lastName}: ${why}`;
  wlog(W, s, line);
  ctx.log.push(line);
}

/* ---------------- Who finds out ---------------- */

/** Her husband's odds of learning this week, from what is out there. */
export function husbandOdds(s: GameState, a: Affair, c: Character): number {
  const m = manOf(s, c);
  if (!m || a.husbandKnew !== undefined) return 0;
  let v = 0;
  for (const k of a.known) v += k.how === 'witness' ? 0.03 : k.how === 'gossip' ? 0.06 : k.how === 'spout' ? 0.12 : k.how === 'guard' ? 0.15 : 0.05;
  if (a.preg && !m.imprisonedUntil && a.pregWeek !== undefined && s.week - a.pregWeek > 10) v += 0.08;
  if (m.faction === 'player') v *= 1.5;
  return Math.min(0.5, v);
}

function plot(W: WomenState, s: GameState, man: Character, her: Character, kind: 'revenge' | 'cops' | 'rival'): void {
  if (W.plots.some((x) => x.man === man.id && x.done === undefined)) return;
  W.plots.push({ man: man.id, her: her.id, since: s.week, kind, due: s.week + 4 + Math.floor(roll(`${s.seed}|wplot|${man.id}|${s.week}`) * 9) });
  if (W.plots.length > 12) W.plots.splice(0, W.plots.length - 12);
}

/** What kind of man he is about it (traits, his place, his means). */
export function husbandWay(s: GameState, m: Character): 'revenge' | 'cops' | 'rival' | 'leave' | 'separate' | 'swallow' {
  const r = roll(`${s.seed}:hway:${m.id}`);
  if (hasTrait(m, 'Hot-headed') || hasTrait(m, 'Vengeful') || hasTrait(m, 'Cruel')) return r < 0.6 ? 'revenge' : 'leave';
  if (hasTrait(m, 'Cowardly')) return r < 0.5 ? 'cops' : 'swallow';
  if (hasTrait(m, 'Pious') || hasTrait(m, 'Honest')) return 'separate';
  if (m.faction !== 'player' && m.faction !== 'none') return r < 0.5 ? 'rival' : 'revenge';
  if (m.faction === 'player') return r < 0.35 ? 'leave' : r < 0.55 ? 'rival' : r < 0.7 ? 'revenge' : 'swallow';
  return r < 0.4 ? 'separate' : r < 0.6 ? 'cops' : 'swallow';
}

/** He knows. `soft`: the boss apologized and paid (halves the worst); `hard`: the boss humiliated him. */
export function husbandReacts(ctx: Ctx, W: WomenState, a: Affair, c: Character, m: Character, mood: 'soft' | 'hard' | 'none' = 'none'): string {
  const s = ctx.s;
  const boss = player(s);
  a.husbandKnew ??= s.week;
  W.stats.found++;
  addOpinion(s, m.id, boss.id, 'Went with my wife', mood === 'soft' ? -35 : -60, 0);
  changeMeter(s, m.id, boss.id, 'grievance', mood === 'hard' ? 60 : mood === 'soft' ? 20 : 40);
  addOpinion(s, m.id, c.id, 'She lied to me', -30, 1);
  a.guilt = clamp(a.guilt + 25);
  a.fear = clamp(a.fear + 30);
  let way = husbandWay(s, m);
  if (mood === 'soft' && (way === 'revenge' || way === 'leave') && roll(`${s.seed}|wsoft|${m.id}`) < 0.5) way = 'swallow';
  if (mood === 'hard' && way === 'swallow') way = m.faction === 'player' ? 'leave' : 'revenge';
  const fx = (effects: Effect[], label: string) => applyEffects(ctx, effects, { label, because: `went with ${m.firstName}'s wife`, category: 'event' });
  let line: string;
  const fam = s.nightlife?.people[c.id]?.fam;
  switch (way) {
    case 'separate':
      ensureRomance(s).separations.push({ a: c.id, b: m.id, week: s.week });
      if (fam && fam.st === 'married') fam.st = 'separated';
      line = `${displayName(m)} found out about you and ${c.firstName}. He moved out.`;
      break;
    case 'leave':
      if (m.faction === 'player' && m.rank !== 'boss') {
        const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
        const to = roll(`${s.seed}|wleave|${m.id}`) < 0.5 ? mobs[0]?.id as RivalId | undefined : undefined;
        defectTo(ctx, m, to, 'desert');
        line = `${displayName(m)} found out about you and his wife, and walked out of the family.`;
      } else { plot(W, s, m, c, 'revenge'); line = `${displayName(m)} found out about you and ${c.firstName}. He has not said a word since.`; }
      break;
    case 'rival':
      plot(W, s, m, c, 'rival');
      line = `${displayName(m)} found out about you and ${c.firstName}. He has been seen with the other side.`;
      break;
    case 'cops':
      plot(W, s, m, c, 'cops');
      line = `${displayName(m)} found out about you and ${c.firstName}. Somebody saw him outside the county prosecutor's office.`;
      break;
    case 'revenge':
      plot(W, s, m, c, 'revenge');
      line = `${displayName(m)} found out about you and ${c.firstName}. He is telling people he will settle it.`;
      break;
    default:
      line = `${displayName(m)} found out about you and ${c.firstName}. He swallowed it. For now.`;
  }
  a.reaction = way;
  if (m.faction === 'player') fx([{ type: 'familyOpinion', amount: mood === 'hard' ? -4 : -2, reason: 'If he does that to a loyal man, what does loyalty buy the rest of us?', label: 'The crew heard' }, { type: 'respect', amount: -1, label: `${m.firstName}'s wife` }], 'The crew heard');
  else if (m.faction !== 'none') fx([{ type: 'rivalOpinion', rival: m.faction as RivalId, amount: -12, reason: 'The boss and one of our wives', label: `${m.firstName}'s family` } as Effect], 'Their family heard');
  // She may end it now (her call).
  if (a.stage !== 'ended' && roll(`${s.seed}|wendh|${c.id}|${s.week}`) < 0.5 + a.guilt / 300) endAffair(ctx, W, a, c, 'husband', 'Her husband found out; she ended it.');
  wlog(W, s, line);
  ctx.log.push(line);
  return line;
}

/** The weekly chain: witnesses talk, gossip reaches the paper, one of your men knows, her husband learns. */
export function discoveryWeek(ctx: Ctx, W: WomenState, a: Affair, c: Character): EventInstance | undefined {
  const s = ctx.s;
  if (a.stage === 'interest' || (a.stage === 'ended' && a.husbandKnew !== undefined)) return undefined;
  const r = (k: string) => roll(`${s.seed}|${s.week}|wdisc|${k}|${c.id}`);
  const has = (how: string) => a.known.some((k) => k.how === how);
  if (a.known.some((k) => k.how === 'witness') && !has('gossip') && r('g') < 0.25) {
    a.known.push({ w: 'town', how: 'gossip', week: s.week });
    ensureDating(s).rumors.push({ week: s.week, text: `${c.firstName} ${c.lastName} has been seen with the boss.`, about: c.id, heard: ['island'], true: true });
  }
  if (has('gossip') && !has('spout') && r('sp') < 0.15) {
    a.known.push({ w: 'paper', how: 'spout', week: s.week });
    pressItem(s, { s: 'spout', b: `Which married lady from ${s.nightlife?.people[c.id]?.venue ?? 'the island'} keeps turning up on the arm of a certain gentleman from the club? Ask her husband where she was Thursday.`, a: 'boss', fx: { wife: -3 } });
  }
  const m = manOf(s, c);
  const sawMan = a.known.find((k) => k.how === 'witness' && s.characters[k.w]?.faction === 'player');
  if (m?.faction === 'player' && sawMan && !has('guard') && r('gd') < 0.2) a.known.push({ w: sawMan.w, how: 'guard', week: s.week });
  if (a.known.length > 8) a.known.splice(0, a.known.length - 8);
  if (!m || r('h') >= husbandOdds(s, a, c)) return undefined;
  a.husbandKnew = s.week;
  a.known.push({ w: m.id, how: 'husband', week: s.week });
  // One of your own men: he comes to the office first. Anyone else acts.
  if (m.faction === 'player' && m.alive) return confrontEvent(s, c, m);
  husbandReacts(ctx, W, a, c, m);
  return undefined;
}

/* ---------------- Events ---------------- */

export function wev(s: GameState, key: string, title: string, text: string, choices: Choice[], actors: string[], mandatory = true, prio = 50): EventInstance {
  return { iid: `ev${s.nextId++}`, defId: key.startsWith('office_') ? key : `women_${key}`, week: s.week, mandatory, priority: prio, title, text, choices, defaultChoiceId: choices[choices.length - 1].id, meta: { asked: 1 }, actors: actors.slice(0, 3) };
}

function confrontEvent(s: GameState, c: Character, m: Character): EventInstance {
  return wev(s, 'husband', `${m.firstName} ${m.lastName} wants a word`, `${displayName(m)} is at the office door, hat in his hands and his jaw set. He knows about you and ${c.firstName}. He is one of your own men.`, [
    { id: 'apologize', label: '"I was wrong. Let me make it right."', detail: `$1,000 from your pocket and the truth. He may stay; he will not forget.`, because: `apologized to ${m.firstName}`, effects: [{ type: 'money', pot: 'pocket', amount: -1000, label: `${m.firstName}: an envelope` }, WX({ op: 'husband', id: c.id, how: 'apologize' }, `${m.firstName} came to the office`)] },
    { id: 'deny', label: '"Whoever told you that is a liar."', detail: 'He may believe you, if what he heard is thin.', because: `denied it to ${m.firstName}`, effects: [WX({ op: 'husband', id: c.id, how: 'deny' }, `${m.firstName} came to the office`)] },
    { id: 'nothing', label: '"That\'s between you and your wife."', detail: 'A humiliation in front of the club. The crew hears it.', because: `humiliated ${m.firstName}`, effects: [WX({ op: 'husband', id: c.id, how: 'nothing' }, `${m.firstName} came to the office`)] },
  ], [m.id, c.id]);
}

export function lastEvent(s: GameState, c: Character): EventInstance {
  const m = manOf(s, c);
  const why = m?.faction === 'player' ? `"My husband works for you. Every time he talks about how much he trusts you, I feel worse."` : m && m.faction !== 'none' ? `"He's with another family. If he finds out, this won't stay between the three of us."` : `"I can't keep doing this."`;
  return wev(s, 'last', `${c.firstName}: "This is the last time"`, `${c.firstName} ${c.lastName} asks to see you. ${why} "I care about you. I'm ending it."`, [
    { id: 'accept', label: '"I understand."', detail: 'She decides when: one last evening if she wants it, or now. It is over either way.', because: `let ${c.firstName} go`, effects: [WX({ op: 'last', id: c.id, how: 'accept' }, `${c.firstName} is ending it`)] },
    { id: 'talk', label: '"Can we talk about it?"', detail: 'She listens. She still decides; most of the time it is still over.', because: `asked ${c.firstName} to talk`, effects: [WX({ op: 'last', id: c.id, how: 'talk' }, `${c.firstName} is ending it`)] },
  ], [c.id]);
}

export function realEvent(s: GameState, c: Character): EventInstance {
  return wev(s, 'real', `${c.firstName}: "I want something real"`, `"I don't want another bracelet. I want to know whether there's a future here."`, [
    { id: 'more', label: '"I\'ll make the time. I mean it."', detail: 'Her hopes go up. Keep seeing her in the next twelve weeks, or it is a broken promise.', because: `promised ${c.firstName} more`, effects: [WX({ op: 'real', id: c.id, how: 'more' }, `${c.firstName} wants something real`)] },
    { id: 'honest', label: '"I can\'t give you that."', detail: 'Honest. She may end it; she will respect that you told her.', because: `told ${c.firstName} the truth`, effects: [WX({ op: 'real', id: c.id, how: 'honest' }, `${c.firstName} wants something real`)] },
  ], [c.id], false, 40);
}

export function babyEvent(s: GameState, c: Character): EventInstance {
  const married = marriedOf(s, c);
  const plan = married ? (roll(`${s.seed}:bplan:${c.id}`) < 0.6 ? 'his' : 'tell') : roll(`${s.seed}:bplan:${c.id}`) < 0.5 ? 'alone' : 'ask';
  const said = plan === 'his' ? 'She has decided: her husband will raise the baby as his. She wanted you to know, and nothing more.' : plan === 'tell' ? 'She is keeping the baby. She does not know yet what she will tell her husband.' : plan === 'alone' ? 'She is keeping the baby and raising it herself. She is not asking you for anything.' : 'She is keeping the baby. She is asking whether you will stand behind it.';
  return wev(s, 'baby', `${c.firstName}: "We need to talk about the baby"`, `${c.firstName} ${c.lastName} is expecting, and she says it is yours. ${said} Her decisions are hers.`, [
    { id: 'support', label: '"Whatever you need, you\'ll have."', detail: '$1,500 from your pocket now. Quiet.', because: `stood behind ${c.firstName}`, effects: [{ type: 'money', pot: 'pocket', amount: -1500, label: `${c.firstName}: for the baby` }, WX({ op: 'baby', id: c.id, how: 'support' }, `${c.firstName}'s baby`)] },
    { id: 'acknowledge', label: '"The child is mine, and people can know it."', detail: 'Public. Your wife, the parish, her husband if she has one: everybody hears. The child carries your name in the family books.', because: `acknowledged ${c.firstName}'s child`, effects: [WX({ op: 'baby', id: c.id, how: 'acknowledge' }, `${c.firstName}'s baby`)] },
    { id: 'distance', label: '"I can\'t be part of this."', detail: 'She will remember it.', because: `stepped back from ${c.firstName}'s baby`, effects: [WX({ op: 'baby', id: c.id, how: 'distance' }, `${c.firstName}'s baby`)] },
  ], [c.id]);
}

/* ---------------- She comes to him ---------------- */

/** Why she might (undefined: she wouldn't). Power and money attract some and put others off. */
export function motiveOf(s: GameState, c: Character): Motive | undefined {
  const boss = player(s);
  if (!drawnTo(s, c, boss) || romanticOpinion(s, c.id) < -5) return undefined;
  const p = s.nightlife?.people[c.id];
  const W = s.women;
  const amb = W?.arcs[c.id]?.amb;
  const pull = appeal(s, c, boss).value;
  if ((p?.attach ?? 0) >= 40 || (affairOf(s, c.id)?.aff ?? 0) >= 40 || pull >= 15) return 'love';
  if (hasTrait(c, 'Pious') || hasTrait(c, 'Honest')) return undefined;
  if (p?.fam.temper === 'volatile' || (p?.house && s.nightlife?.houses[p.house]?.squeeze)) return 'protection';
  if (hasTrait(c, 'Greedy') || amb === 'money' || amb === 'security') return 'goodlife';
  if (hasTrait(c, 'Ambitious') || amb === 'fame') return 'power';
  return pull >= 5 ? 'love' : undefined;
}

export function propEvent(s: GameState, c: Character, why: Motive): EventInstance {
  const lines: Record<Motive, string> = {
    goodlife: `"I like the good life. I'm not going to pretend the dinners and the beautiful places don't appeal to me."`,
    power: `"Everybody wants five minutes of your time. I was hoping for an evening."`,
    protection: `"I'd sleep better knowing somebody like you was looking out for me."`,
    love: `"I keep finding reasons to be where you are. I thought you should know."`,
  };
  return wev(s, 'prop', `${c.firstName} ${c.lastName} has a proposition`, `${lines[why]} (She wants ${MOTIVE_TEXT[why]}, as far as you can tell. Appearances don't always say.)`, [
    { id: 'yes', label: '"Let\'s see where it goes."', detail: 'It begins. She still decides every step after this.', because: `took ${c.firstName} up on it`, effects: [WX({ op: 'prop', id: c.id, how: 'yes', why }, `${c.firstName}'s proposition`)] },
    { id: 'pro', label: '"Let\'s keep it business."', detail: 'Clear, kind. She knows where she stands.', because: `kept it business with ${c.firstName}`, effects: [WX({ op: 'prop', id: c.id, how: 'pro', why }, `${c.firstName}'s proposition`)] },
    { id: 'no', label: '"I\'m flattered. No."', detail: 'A little sting.', because: `turned ${c.firstName} down`, effects: [WX({ op: 'prop', id: c.id, how: 'no', why }, `${c.firstName}'s proposition`)] },
  ], [c.id], false, 40);
}

/* ---------------- His slow answer ---------------- */

const COMES = [
  (m: Character) => `${m.firstName} came looking for you at the club; your men turned him around at the door.`,
  (m: Character) => `${m.firstName} came at you in the parking lot of the Bolero. Your driver got between you; you needed six stitches.`,
  (m: Character) => `Somebody slashed the tires on your Cadillac and left a note on the seat. Word is it was ${m.firstName}.`,
];

export function plotsWeek(ctx: Ctx, W: WomenState): void {
  const s = ctx.s;
  const boss = player(s);
  for (const pl of W.plots) {
    if (pl.done !== undefined || s.week < pl.due) continue;
    pl.done = s.week;
    const m = s.characters[pl.man];
    if (!m?.alive || !isAdultC(s, m)) continue;
    const fx = (effects: Effect[], label: string) => applyEffects(ctx, effects, { label, because: `went with ${m.firstName}'s wife`, category: 'event' });
    let line: string;
    if (pl.kind === 'cops') {
      fx([{ type: 'evidence', charId: boss.id, amount: 6, label: `${m.firstName} talked to the county prosecutor` }], 'He talked');
      line = `${displayName(m)} told the county prosecutor what he knows about your business. The law will take it from there.`;
    } else if (pl.kind === 'rival') {
      const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
      const rv = (m.faction !== 'player' && m.faction !== 'none' ? m.faction : mobs[0]?.id) as RivalId | undefined;
      if (rv) { const sec = addSecret(s, boss, 'affair', [rv as FactionId]); if (!sec.knownBy.includes(rv)) sec.knownBy.push(rv); }
      if (m.faction === 'player' && rv) defectTo(ctx, m, rv, 'desert');
      line = `${displayName(m)} gave the ${s.rivals.find((r) => r.id === rv)?.shortName ?? 'other'} people everything he knows about you and his wife.`;
    } else {
      const cut = protectionFor(s, boss.id, 'any').cut;
      const k = roll(`${s.seed}|wcome|${m.id}`) < cut ? 0 : 1 + (roll(`${s.seed}|wcome2|${m.id}`) < 0.5 ? 1 : 0);
      line = COMES[k](m);
      if (k === 1) boss.health = clamp(boss.health - 6, 1);
      if (s.dyn) fx([{ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: 8, source: 'domestic' }, label: `${m.firstName} came at you` } as Effect], 'Her husband');
    }
    wlog(W, s, line);
    ctx.log.push(line);
  }
  W.plots = W.plots.filter((x) => x.done === undefined || s.week - x.done < 52);
}

export { $, nameOf };
