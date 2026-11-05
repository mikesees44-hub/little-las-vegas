import { fundingBlock, previewAction, settleOrderNow } from './actions';
import { ageOn } from './calendar';
import { displayName, hasTrait, player } from './characters';
import { affectionWord, bondOf, DATE_INFO, datingBlock, ensureBond, isAdult, stageOf, type DateKind } from './dating';
import { adultOn, datingSettings, ensureDating, PROVIDER_LABEL, STAGE_LABEL, type Bond } from './datingState';
import { freezeWeek } from './days';
import { nowKey, settledThisWeek, TIER_BANNER, type NowResult } from './deeds/now';
import { d01, ensureDeeds } from './deeds/state';
import type { Tier } from './deeds/types';
import { earOf } from './ears';
import { GOAL_TEXT, WORK_LABEL } from './earsState';
import { cloneState } from './engine';
import type { Acceptance, Reason } from './interactions';
import { newCtx } from './ledger';
import { mindView } from './minds/view';
import { addOpinion, opinion } from './relations';
import { hashSeed } from './rng';
import { activeRomances, attraction } from './romance';
import { spendTime, timeBlock } from './timeCost';
import type { Character, GameState, PlayerAction } from './types';

/**
 * ON THE DATE. The evening as a conversation: the boss takes her out (or just
 * talks with her) and the two of them talk, eight to ten exchanges, in the
 * two-way window (ui/dating/DateTalk.tsx). He picks a tone (charm, listen,
 * joke, compliment, talk business, be honest, brag, walk her home) or says it
 * in his own words; she answers as herself: Claude's lines when the page can
 * ask (the artifact's `sample` capability), her scripted lines otherwise.
 *
 * Her meters: CHEMISTRY (how the evening is going for her) and ANNOYANCE. The
 * model's answer is data: `validateDate` clamps it, whitelists the mood, keeps
 * the reply short, and rejects any name that is not in her brief (the line
 * falls back to her scripted one). The model never decides anything.
 *
 * THE OUTCOME is the existing engine's: the step's order (dating.ts: a coffee,
 * dinner, a night out, getting to know her, asking a working woman out as
 * himself, a paid evening) with her existing odds (herDecision / the booking's
 * acceptance), plus ONE bounded modifier from how the conversation went
 * (±15 at most; ±5 for a paid evening, which stays business by the existing
 * rules), shown as a named reason ("The conversation: she laughed at your
 * jokes") so the odds stay visible. The roll and the effects go through
 * settleOrderNow exactly as a tap on the order card would (deeds/now.ts), so
 * nothing is applied twice and the order can't be given again this week.
 *
 * She decides. Pushy or coercive words end the evening on the spot (she walks,
 * the answer is no, she remembers it); nothing ever makes her comply. Adults
 * only (isAdult on both, re-checked at open and at the end). Non-explicit: a
 * good night may fade to black only where the engine already allows it
 * (mature content on, both adults, a relationship, her choice); with mature
 * content Off there is no such line and no paid evening at all.
 *
 * Memory: a line per evening on the bond (capped at 3), which her brief and
 * her opening line use next time ("You never did tell me about your mother").
 * Deterministic: every roll is a hash of (seed, week, her, round).
 */

export type DateStep = 'talk' | 'invite' | 'askOut' | 'paid' | 'after';
export type DateTone = 'charm' | 'listen' | 'joke' | 'compliment' | 'business' | 'honest' | 'brag' | 'home';
export type DateMood = 'warmer' | 'same' | 'cooler';
export type DateEnd = 'home' | 'walkout' | 'done';

export const DATE_TONES: DateTone[] = ['charm', 'listen', 'joke', 'compliment', 'business', 'honest', 'brag', 'home'];
export const DATE_TONE_LABEL: Record<DateTone, string> = {
  charm: 'Charm her', listen: 'Listen', joke: 'Joke', compliment: 'Compliment her', business: 'Talk business', honest: 'Be honest', brag: 'Brag', home: 'Walk her home',
};

/** Most the conversation moves her answer, either way (percentage points). */
export const DATE_MOD_CAP = 15;
/** A paid evening stays business: the conversation moves it this much at most. */
export const PAID_MOD_CAP = 5;
export const NOTES_CAP = 3;
export const MAX_WORDS = 60;
export const MAX_SAY = 300;

export interface DateLine { who: 'boss' | 'her' | 'narrator'; text: string; tone?: DateTone }

export interface DateTalk {
  id: string;
  step: DateStep;
  date?: DateKind;
  /** Where they are (one line). */
  setting: string;
  round: number;
  max: number;
  chem: number;
  annoy: number;
  /** Where chemistry started. */
  c0: number;
  log: DateLine[];
  /** Times each tone was used (the same thing three times gets old). */
  used: Partial<Record<DateTone, number>>;
  /** Net chemistry each tone earned (for the reason's words). */
  net: Partial<Record<DateTone, number>>;
  /** What they talked about. */
  topics: string[];
  /** Her question, waiting for an answer. */
  open?: string;
  /** Her questions he never answered (the next evening remembers one). */
  unanswered: string[];
  pushy: number;
  coerced?: boolean;
  end?: DateEnd;
  /** Lines Claude voiced (for the books). */
  ai: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const H = (k: string) => hashSeed(k) / 4294967296;
const pick = <T>(xs: readonly T[], k: string): T => xs[Math.floor(H(k) * xs.length) % xs.length];

/* ------------------------------------------------------------------ */
/* The step: which order the evening is                                */
/* ------------------------------------------------------------------ */

/** The order the evening settles (undefined for the talk after a date, which settles nothing new). */
export function stepAction(id: string, step: DateStep, date?: DateKind): PlayerAction | undefined {
  switch (step) {
    case 'talk': return { kind: 'dating', op: { op: 'talk', id } };
    case 'invite': return { kind: 'dating', op: { op: 'invite', id, date: date ?? 'dinner' } };
    case 'askOut': return { kind: 'dating', op: { op: 'askOut', id } };
    case 'paid': return { kind: 'dating', op: { op: 'paid', id } };
    case 'after': return undefined;
  }
}

/** The step a dating order is, if it can be an evening of talk. */
export function stepOf(a: PlayerAction): { id: string; step: DateStep; date?: DateKind } | undefined {
  if (a.kind !== 'dating') return undefined;
  const o = a.op as { op: string; id?: string; date?: DateKind };
  if (!o.id) return undefined;
  if (o.op === 'talk' || o.op === 'askOut' || o.op === 'paid') return { id: o.id, step: o.op };
  if (o.op === 'invite') return { id: o.id, step: 'invite', date: o.date };
  return undefined;
}

export const SETTINGS: Record<DateKind | 'talk' | 'askOut' | 'paid' | 'after', string> = {
  coffee: 'Coffee and a pastry at the Doo Wop diner, a booth by the window, the Boulevard going by.',
  dinner: 'Dinner at the Admiral, a corner table, then the boardwalk at night with the lights on the water.',
  night: 'A table at the Rhumba Terrace: the band, the dance floor, then the drive down to Cape May with the windows down.',
  talk: 'A few minutes where she is: the bakery on Pacific, the steps after Mass, the coat check.',
  askOut: 'Dinner off the clock, as yourselves, at a quiet place on the bay where nobody from the clubs goes.',
  paid: 'An evening\'s company, agreed and paid: a late supper and a long talk, at her pace and on her terms.',
  after: 'Later the same night, on the boardwalk: the arcades closing, the sea out in the dark.',
};

const MAX_ROUNDS: Record<DateKind | 'talk' | 'askOut' | 'paid' | 'after', number> = { coffee: 8, dinner: 10, night: 10, talk: 6, askOut: 9, paid: 8, after: 6 };

/** Can the boss spend this evening talking with her? (and why not). Adults only, every time. */
export function canDateTalk(s: GameState, id: string, step: DateStep, date?: DateKind): { ok: boolean; why?: string } {
  const c = s.characters[id];
  const boss = player(s);
  if (s.gameOver) return { ok: false, why: 'The game is over' };
  if (!c || !boss) return { ok: false, why: 'Nobody to talk to' };
  if (!isAdult(s, c) || !isAdult(s, boss)) return { ok: false, why: 'Adults only' };
  const blk = datingBlock(s, c);
  if (blk) return { ok: false, why: blk };
  if (step === 'paid' && !adultOn(s)) return { ok: false, why: 'Adult services are turned off in Settings' };
  if (step === 'after') {
    const b = bondOf(s, id);
    if (!b || b.last !== s.week) return { ok: false, why: `No evening with ${c.firstName} this week` };
    if (b.talkW === s.week) return { ok: false, why: 'You already talked the night through' };
    return { ok: true };
  }
  const a = stepAction(id, step, date)!;
  const p = previewAction(s, a);
  if (p.disabledReason) return { ok: false, why: p.disabledReason };
  if (settledThisWeek(s, a)) return { ok: false, why: 'Already done this week' };
  const tb = timeBlock(s, a);
  if (tb) return { ok: false, why: tb };
  const fb = fundingBlock(s, a, p);
  if (fb) return { ok: false, why: `Not enough: ${fb}` };
  return { ok: true };
}

/** The evening to offer from her card: the first date-like order in her list (a date, asking her out, a talk). */
export function dateStepFor(s: GameState, id: string, actions: readonly PlayerAction[]): { step: DateStep; date?: DateKind } | undefined {
  for (const a of actions) {
    const st = stepOf(a);
    if (st && st.id === id && st.step !== 'paid' && canDateTalk(s, id, st.step, st.date).ok) return { step: st.step, date: st.date };
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Her brief: who she is, truthfully, from the game                    */
/* ------------------------------------------------------------------ */

function husband(s: GameState, c: Character): Character | undefined {
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  return sp?.alive ? sp : undefined;
}

function otherMan(s: GameState, c: Character): Character | undefined {
  const r = activeRomances(s, c.id).find((x) => x.a !== s.playerId && x.b !== s.playerId);
  return r ? s.characters[r.a === c.id ? r.b : r.a] : undefined;
}

/** Her work, in a few words. */
export function jobOf(s: GameState, c: Character): string {
  const p = s.dating?.providers[c.id];
  const ear = earOf(s, c.id);
  if (p && adultOn(s)) return `${PROVIDER_LABEL[p.kind].toLowerCase()} (${p.venue})`;
  if (ear) return `${WORK_LABEL[ear.work].toLowerCase()} at ${ear.venue}`;
  const tp = Object.entries(s.dating?.tp ?? {}).find(([, cid]) => cid === c.id)?.[0];
  const L = s.living;
  const lp = tp ? L?.people[tp] : undefined;
  if (lp) return lp.job && L?.biz[lp.job] ? 'works on the Boardwalk' : lp.job === 'home' ? 'keeps house for her family' : lp.job === 'school' ? 'finishing school' : 'looking for work';
  if (s.characters[s.playerId]?.spouseId === c.id) return 'the boss\'s wife; keeps the house';
  if (c.rank !== 'civilian') return `${c.rank} in the life`;
  return 'a woman of the island';
}

/** Her goals and ambitions (the ear goal, her ambition line). */
export function goalsOf(s: GameState, c: Character): string[] {
  const out: string[] = [];
  const ear = earOf(s, c.id);
  if (ear) out.push(`she ${GOAL_TEXT[ear.goal]}`);
  if (c.ambition && !out.some((x) => x.includes(c.ambition))) out.push(c.ambition.replace(/\.$/, ''));
  return out.slice(0, 2);
}

/** The names she may say: hers, the boss's, the people in her brief. Anything else in a reply is rejected. */
export function briefNames(s: GameState, id: string): string[] {
  const c = s.characters[id];
  const boss = player(s);
  const ppl = [c, boss, c && husband(s, c), boss?.spouseId ? s.characters[boss.spouseId] : undefined, c && otherMan(s, c)].filter((x): x is Character => !!x);
  const out: string[] = [];
  for (const p of ppl) out.push(p.firstName, p.lastName, ...(p.nickname ? [p.nickname] : []));
  return [...new Set(out.filter(Boolean))];
}

/** Her persona for the prompt: true to the game state, nothing invented. */
export function dateBrief(s: GameState, dt: DateTalk): string {
  const c = s.characters[dt.id];
  const boss = player(s);
  if (!c || !boss) return '';
  const st = stageOf(s, c.id);
  const b = bondOf(s, c.id);
  const aff = b?.aff ?? clamp(10 + Math.round(opinion(s, c.id, boss.id) / 4), 0, 40);
  const op = opinion(s, c.id, boss.id);
  const v = mindView(s, c.id);
  const L: string[] = [];
  L.push(`HER: ${displayName(c)}, ${ageOn(c.birth, s.date)}, a woman; ${jobOf(s, c)}. Traits: ${c.traits.join(', ') || 'none in particular'}.${v ? ` Mood: ${v.moodText}.` : ''}`);
  const g = goalsOf(s, c);
  if (g.length) L.push(`What she wants from life: ${g.join('; ')}.`);
  const hub = husband(s, c);
  if (hub && hub.id !== boss.id) L.push(`She is married to ${hub.firstName} ${hub.lastName}${opinion(s, c.id, hub.id) < 0 ? ' (an unhappy marriage)' : ''}.`);
  const om = otherMan(s, c);
  if (om) L.push(`She is also seeing ${om.firstName} ${om.lastName}.`);
  L.push(`THE BOSS: ${displayName(boss)}, ${ageOn(boss.birth, s.date)}. What she knows of him: ${s.respect >= 40 ? 'everybody on the island knows who he is and what he runs' : 'people say he is connected'}.`);
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife?.alive && wife.id !== c.id) L.push(`He is married to ${wife.firstName}; she knows it.`);
  if (wife?.id === c.id) L.push(`She IS his wife${st === 'separated' ? ' (they are separated)' : ''}.`);
  const rum = (s.dating?.rumors ?? []).filter((r) => r.about === boss.id && (r.heard.includes(c.id) || r.heard.includes('island'))).slice(-2);
  for (const r of rum) L.push(`A rumor she may have heard (unconfirmed): ${r.text}`);
  L.push(`Between them: ${STAGE_LABEL[st].toLowerCase()}; her feelings ${affectionWord(aff)} (${aff}/100); she thinks ${op >= 0 ? '+' : ''}${op} of him (-100..100); ${b?.dates ?? 0} evenings together.${b?.no && s.week - b.no.week < 4 ? ` She said no to ${b.no.what} lately.` : ''}`);
  const notes = b?.notes ?? [];
  if (notes.length) L.push(`What she remembers of their last talks: ${notes.map((n) => n.t).join(' | ')}`);
  L.push(`TONIGHT: ${dt.setting}`);
  L.push(`Her meters now: chemistry ${dt.chem}/100, annoyance ${dt.annoy}/100. Exchange ${dt.round + 1} of ${dt.max}.`);
  return L.join('\n');
}

/* ------------------------------------------------------------------ */
/* Opening the evening                                                 */
/* ------------------------------------------------------------------ */

export function startDateTalk(s: GameState, id: string, step: DateStep, date?: DateKind): DateTalk {
  const c = s.characters[id];
  const boss = player(s);
  const b = bondOf(s, id);
  const op = opinion(s, id, s.playerId);
  const aff = b?.aff ?? clamp(10 + Math.round(op / 4), 0, 40);
  const att = c && boss ? attraction(s, c, boss).value : 0;
  const chem = Math.round(clamp(28 + aff / 2 + att / 3 + (step === 'paid' ? 10 : 0), 5, 85));
  const annoy = Math.round(clamp(Math.max(0, -op / 3) + (b?.no && s.week - b.no.week < 2 ? 8 : 0), 0, 50));
  const key = step === 'invite' ? (date ?? 'dinner') : step;
  const dt: DateTalk = {
    id, step, ...(step === 'invite' ? { date: date ?? 'dinner' } : {}), setting: SETTINGS[key], round: 0, max: MAX_ROUNDS[key],
    chem, annoy, c0: chem, log: [], used: {}, net: {}, topics: [], unanswered: [], pushy: 0, ai: 0,
  };
  dt.log.push({ who: 'narrator', text: dt.setting });
  const last = b?.notes?.[b.notes.length - 1];
  if (last?.open) {
    dt.log.push({ who: 'her', text: `You never did tell me about ${TOPIC_TEXT[last.open] ?? last.open}.` });
    dt.open = last.open;
  } else dt.log.push({ who: 'her', text: pick(OPENERS[step === 'paid' ? 'paid' : stageOf(s, id) === 'married' ? 'wife' : (b?.dates ?? 0) > 0 ? 'again' : 'first'], `${s.seed}|${s.week}|open|${id}`) });
  return dt;
}

const OPENERS: Record<'first' | 'again' | 'wife' | 'paid', string[]> = {
  first: ['So this is what the famous man does on a weeknight.', 'I almost didn\'t come. Then I thought, why not.', 'You clean up nice. I\'ll give you that.', 'All right. You have my attention, for now.'],
  again: ['Look who it is. I wondered if you\'d call.', 'Back again? People will start to talk.', 'I wore the blue one. You said you liked it.', 'I told my sister I was going to the pictures.'],
  wife: ['When\'s the last time we sat like this, just us?', 'The kids are asleep. Talk to me.', 'You look tired. Sit down.', 'So. Do I get my husband tonight, or the boss?'],
  paid: ['Evening. We keep it nice and easy, all right?', 'You\'re a gentleman, I hear. Let\'s see.', 'Supper first. I like to know who I\'m sitting with.', 'Long week? You look like you could use a quiet hour.'],
};

/* ------------------------------------------------------------------ */
/* Reading his words                                                   */
/* ------------------------------------------------------------------ */

export const TOPIC_TEXT: Record<string, string> = {
  mother: 'your mother', father: 'your father', work: 'what you really do', dreams: 'what you want, someday', war: 'the war', island: 'growing up on the island',
  family: 'your family', music: 'the music you like', church: 'whether you still go to Mass', her: 'her own plans',
};

const TOPIC_RX: [string, RegExp][] = [
  ['mother', /\b(mother|mom|mama|my ma)\b/i], ['father', /\b(father|pop|dad|papa)\b/i], ['work', /\b(work|job|business|what i do)\b/i],
  ['dreams', /\b(dream|someday|future|plans?|want to be)\b/i], ['war', /\b(war|army|navy|korea|service)\b/i], ['island', /\b(island|boardwalk|beach|shore|grew up)\b/i],
  ['family', /\b(family|kids|children|brother|sister)\b/i], ['music', /\b(music|band|song|sing|dance|dancing)\b/i], ['church', /\b(church|mass|god|priest)\b/i],
  ['her', /\b(you want|your plans|about you|tell me about you|your (shop|place|singing|school))\b/i],
];

/** Coercion: pressure, debts held over her, threats. She ends the evening, every time. */
const COERCE = /\b(you owe me|owe me (this|that|something)|or else|you have to|you(?:'ve| have)? got to|don'?t (you )?(dare )?say no|can'?t say no|not taking no|no isn'?t an answer|whether you like it or not|i'?m not asking|do what i (say|tell you)|get in the car|after (all )?(what )?i (spent|paid)|i paid for (this|dinner|you|it)|make you|force you|hurt you|slap|hit you|shut up|drink (up|more) so|you('ll)? do as)\b/i;
/** Too forward (a first time is a misstep; twice is pressure, and that ends it). */
const PUSHY = /\b(bed|sleep with|your room|my room|motel room|undress|take (it|that) off|come upstairs|spend the night)\b/i;

export interface WordsRead { tone: DateTone; coercive: boolean; pushy: boolean; topics: string[]; question: boolean }

/** The tone his own words carry (the engine's reading; Claude only voices her). */
export function readWords(text: string): WordsRead {
  const t = String(text);
  const topics = TOPIC_RX.filter(([, rx]) => rx.test(t)).map(([k]) => k);
  const coercive = COERCE.test(t);
  const pushy = PUSHY.test(t);
  const question = /\?\s*$|\b(tell me|what about you|how about you|what do you|do you|are you|what'?s your)\b/i.test(t);
  let tone: DateTone = 'charm';
  if (/\b(good ?night|walk you home|take you home|call it a night|get you home|it'?s late)\b/i.test(t)) tone = 'home';
  else if (/\b(truth|honest|honestly|i('m| am) married|my wife|to be straight|level with you|i won'?t lie)\b/i.test(t)) tone = 'honest';
  else if (/\b(i own|i run|my (car|cadillac|club|money|boys|men)|everybody knows me|i'?m the boss|nobody tells me)\b/i.test(t)) tone = 'brag';
  else if (/\b(business|money|racket|numbers|deal|cops|feds|the family|crew|envelope|casino|the take)\b/i.test(t)) tone = 'business';
  else if (/\b(beautiful|pretty|lovely|gorgeous|dress|your eyes|your smile|your hair|look(ing)? (nice|great|swell|good))\b/i.test(t)) tone = 'compliment';
  else if (/\b(ha|haha|joke|funny|laugh|kidding|get this|you hear the one)\b/i.test(t)) tone = 'joke';
  else if (question || topics.includes('her')) tone = 'listen';
  return { tone, coercive, pushy, topics, question };
}

/* ------------------------------------------------------------------ */
/* How a tone lands on her                                             */
/* ------------------------------------------------------------------ */

export interface ToneEff { chem: number; annoy: number }

export function dateToneEffect(s: GameState, dt: DateTalk, tone: DateTone): ToneEff {
  const c = s.characters[dt.id];
  const base: Record<DateTone, ToneEff> = {
    charm: { chem: 6, annoy: 1 }, listen: { chem: 5, annoy: -3 }, joke: { chem: 5, annoy: -1 }, compliment: { chem: 5, annoy: 0 },
    business: { chem: -1, annoy: 3 }, honest: { chem: 3, annoy: -1 }, brag: { chem: 1, annoy: 3 }, home: { chem: 0, annoy: 0 },
  };
  const e = { ...base[tone] };
  if (!c || tone === 'home') return e;
  const has = (t: Parameters<typeof hasTrait>[1]) => hasTrait(c, t);
  const ear = earOf(s, c.id);
  const st = stageOf(s, c.id);
  const bossMarried = !!player(s)?.spouseId && player(s).spouseId !== c.id && !!s.characters[player(s).spouseId!]?.alive;
  if (has('Honest') || has('Pious')) { if (tone === 'honest') e.chem += 4; if (tone === 'brag') { e.chem -= 4; e.annoy += 3; } }
  if (has('Pious') && tone === 'charm') e.chem -= 2;
  if (has('Ambitious') || has('Greedy')) { if (tone === 'business') e.chem += 7; if (tone === 'brag') { e.chem += 5; e.annoy -= 2; } }
  if (has('Charming')) { if (tone === 'joke') e.chem += 3; if (tone === 'charm') e.chem += 2; }
  if (has('Paranoid')) { if (tone === 'business') { e.chem -= 3; e.annoy += 3; } if (tone === 'compliment') e.chem -= 2; }
  if (has('Hot-headed') && tone === 'joke') e.chem += 2;
  if (has('Patient') && tone === 'listen') e.chem += 3;
  if (has('Drinker') && tone === 'joke' && (dt.date === 'night' || dt.date === 'dinner')) e.chem += 2;
  if (has('Cowardly') && tone === 'business') e.annoy += 4;
  if (ear) {
    if (['own_place', 'records', 'school', 'vegas', 'send_home'].includes(ear.goal) && tone === 'listen') e.chem += 3;
    if (ear.goal === 'own_place' && tone === 'business') e.chem += 3;
    if (ear.goal === 'marry' && (tone === 'honest' || tone === 'charm')) e.chem += 2;
    if (ear.goal === 'leave_life' && tone === 'business') { e.chem -= 4; e.annoy += 4; }
  }
  if (st === 'acquaintance' && tone === 'compliment') e.chem -= 2;
  if (st === 'married' || st === 'separated') { if (tone === 'honest') e.chem += 3; if (tone === 'business') { e.chem -= 2; e.annoy += 3; } }
  if (bossMarried && tone === 'honest') { if (has('Honest')) e.chem += 3; else { e.chem -= 2; e.annoy -= 2; } }
  if (dt.step === 'paid' && tone === 'business') e.annoy -= 2; // she has heard worse at work
  const v = mindView(s, c.id);
  if (v?.mood === 'grieving') { if (tone === 'joke') { e.chem -= 6; e.annoy += 3; } if (tone === 'listen') e.chem += 4; }
  if (v?.mood === 'angry' && tone === 'joke') e.chem -= 3;
  // Her question is waiting: answering it counts; talking past it doesn't.
  if (dt.open) { if (tone === 'listen' || tone === 'honest') e.chem += 2; else if (tone === 'brag' || tone === 'business') e.chem -= 2; }
  // The same thing a third time gets old.
  const n = (dt.used[tone] ?? 0) + 1;
  if (n >= 2 && e.chem > 0) e.chem = Math.round(e.chem / n);
  if (n >= 3) e.annoy += 2 * (n - 2);
  return { chem: Math.round(e.chem), annoy: Math.round(e.annoy) };
}

/** The tone buttons, each with a hint of its likely effect. */
export function dateToneOptions(s: GameState, dt: DateTalk): { tone: DateTone; label: string; hint: string }[] {
  if (dt.end) return [];
  return DATE_TONES.map((tone) => {
    if (tone === 'home') return { tone, label: dt.step === 'talk' ? 'Say goodbye' : DATE_TONE_LABEL.home, hint: 'ends the evening' };
    const e = dateToneEffect(s, dt, tone);
    const bits: string[] = [];
    if (e.chem >= 6) bits.push('warms her'); else if (e.chem >= 3) bits.push('a little warmer'); else if (e.chem <= -3) bits.push('cools her');
    if (e.annoy >= 4) bits.push('annoys her'); else if (e.annoy <= -2) bits.push('puts her at ease');
    if ((dt.used[tone] ?? 0) >= 2) bits.push('getting old');
    return { tone, label: DATE_TONE_LABEL[tone], hint: bits.join(', ') || 'little either way' };
  });
}

/* ------------------------------------------------------------------ */
/* Her scripted lines (no Claude)                                      */
/* ------------------------------------------------------------------ */

type Bucket = 'good' | 'flat' | 'bad';
const LINES: Record<Exclude<DateTone, 'home'>, Record<Bucket, string[]>> = {
  charm: {
    good: ['You\'re smoother than you look, you know that?', 'Keep talking like that and I might forget to go home.', 'Well. Aren\'t you something.'],
    flat: ['Mm-hm. I bet you say that on every corner of the boardwalk.', 'That\'s a nice line. Where\'d you get it?', 'Easy, tiger.'],
    bad: ['Save the sweet talk. I\'m not a girl in the chorus line.', 'You can turn that off now.', 'I\'ve heard that one in three accents.'],
  },
  listen: {
    good: ['Nobody asks me that. You really want to know?', 'You\'re a good listener for a man who talks for a living.', 'All right, I\'ll tell you. But you have to promise not to laugh.'],
    flat: ['Oh, there\'s not much to tell. Work, home, the same as everybody.', 'You first. Then maybe me.', 'It\'s a long story. Maybe another night.'],
    bad: ['Is this a conversation or an interview?', 'Why do you want to know so much?', 'I don\'t talk about that with strangers.'],
  },
  joke: {
    good: ['Stop it, you\'re going to make me spill my drink.', 'Ha! Oh, that\'s terrible. Tell me another.', 'You\'re a riot. Who knew?'],
    flat: ['Was that a joke? I\'ll laugh later, I promise.', 'Cute.', 'My uncle tells that one better.'],
    bad: ['That\'s not funny.', 'Is everything a gag to you?', 'Read the room, mister.'],
  },
  compliment: {
    good: ['You noticed. Most men don\'t notice anything.', 'Well, thank you. I wore it for luck.', 'Flattery will get you a second cup of coffee.'],
    flat: ['That\'s sweet. A little much, but sweet.', 'Uh-huh. And?', 'You don\'t know me well enough to say that yet.'],
    bad: ['Look at my face when you talk to me.', 'I\'m more than a dress, you know.', 'Slow down. We just sat down.'],
  },
  business: {
    good: ['Now that\'s interesting. A man with a head for it.', 'You know, I\'ve got some ideas of my own about that.', 'Go on. I like hearing how things really work.'],
    flat: ['Do you ever stop working?', 'Shop talk. Lovely.', 'I\'ll take your word for it.'],
    bad: ['I don\'t want to know about any of that.', 'Not at the table. Please.', 'That kind of talk makes me nervous.'],
  },
  honest: {
    good: ['Thank you for being straight with me. That counts for something.', 'I like that you didn\'t dress it up.', 'You surprise me. I expected a line.'],
    flat: ['Well. At least you said it.', 'I appreciate it, I think.', 'Honest is fine. Honest is a start.'],
    bad: ['You could have told me that before the soup.', 'That\'s a lot to put on a girl tonight.', 'Honest, sure. And now I\'m supposed to say what?'],
  },
  brag: {
    good: ['A man who\'s going places. I can see that.', 'Big talk. You might even mean it.', 'Oh, you own the joint too? Of course you do.'],
    flat: ['Mm. And what do you do for fun?', 'That\'s nice. Is there anything you don\'t run?', 'You want a medal, or the check?'],
    bad: ['Do you ever talk about anything but yourself?', 'I came to dinner, not to a speech.', 'My, my. And so modest.'],
  },
};
const QUESTIONS: [string, string][] = [
  ['mother', 'So tell me about your mother. Every man has a mother story.'], ['dreams', 'What do you want, someday? Not the business. You.'],
  ['war', 'Were you in the war? You have that look.'], ['island', 'Did you grow up here? On the island?'], ['music', 'What do you listen to, when nobody\'s around?'],
  ['work', 'What is it you really do? And don\'t say "a little of this."'], ['father', 'Were you close with your father?'],
];

/** Her line when Claude is not there: by tone, how it landed, her nature; sometimes a question of her own. */
export function scriptedLine(s: GameState, dt: DateTalk, tone: DateTone, eff: ToneEff, read?: WordsRead): { text: string; ask?: string } {
  const c = s.characters[dt.id];
  const key = `${s.seed}|${s.week}|dtl|${dt.id}|${dt.round}|${tone}`;
  if (tone === 'home') return { text: '' };
  const bucket: Bucket = eff.chem >= 4 && eff.annoy < 4 ? 'good' : eff.chem <= -2 || eff.annoy >= 5 ? 'bad' : 'flat';
  let text = pick(LINES[tone][bucket], key);
  if (read?.topics.includes('mother') && bucket !== 'bad') text = pick(['Your mother sounds like a saint. Mine would like you, God help me.', 'A man who talks about his mother like that can\'t be all bad.'], key);
  else if (read?.topics.includes('her') && bucket !== 'bad') {
    const g = c ? goalsOf(s, c)[0] : undefined;
    if (g) text = `Me? ${g.replace(/^she /, 'I ').replace(/\bher\b/g, 'my').replace(/^./, (x) => x.toUpperCase())}. Someday.`;
  }
  // A question of her own, on a warm night, every few rounds.
  if (bucket !== 'bad' && dt.round % 3 === 1 && !dt.open) {
    const q = QUESTIONS.find(([k]) => !dt.topics.includes(k) && !dt.unanswered.includes(k) && H(`${key}|q|${k}`) < 0.6);
    if (q) return { text: `${text} ${q[1]}`, ask: q[0] };
  }
  return { text };
}

/* ------------------------------------------------------------------ */
/* Claude's line: the prompt and the validator                          */
/* ------------------------------------------------------------------ */

const RULES = `You voice ONE woman in "Little Las Vegas", a fictional game set in Wildwood, New Jersey, around 1960 (the boardwalk, the supper clubs, the motels, the summer crowds). The player is a mob boss on an evening out with her; you speak ONLY as her.
Rules:
- Period voice, early-1960s Jersey Shore: natural, witty or guarded as she feels; no modern slang.
- She is an adult with her own mind, job, history and wants. SHE decides how she feels. If he is pushy, crude or pressures her, she gets cooler, says no plainly, and may end the evening. She never gives in to pressure.
- Nothing explicit, ever. Flirting is fine between adults; anything more fades out (she may say goodnight at the door).
- Everyone is fictional. Never mention real people, real celebrities, real crime families, song lyrics or film quotes. Name NOBODY except the people named in her brief.
- Violence only implied; never real-world crime instructions.
- Reply in at most 60 words: one to three sentences.
Reply with ONLY one JSON object, no other text:
{"reply": string, "mood": "warmer"|"same"|"cooler", "interest_delta": integer -8..8, "topics": [up to 3 short words: what they talked about], "leaves": boolean}
"leaves": true only if she is ending the evening now.`;

export interface DateAi { reply: string; mood: DateMood; delta: number; topics: string[]; leaves: boolean }

/** The whole input for one exchange: the rules, her brief, the evening so far, his words (or his tone). */
export function datePrompt(s: GameState, dt: DateTalk, say: string, tone: DateTone): { role: 'user' | 'assistant'; content: string }[] {
  const c = s.characters[dt.id];
  const mature = datingSettings(s).mature;
  const content = mature === 'off' ? 'Content setting: mature content is OFF: keep it chaste; no innuendo.' : 'Content setting: fade to black only; never explicit.';
  const hist = dt.log.slice(-8).map((l) => `${l.who === 'boss' ? 'Him' : l.who === 'her' ? (c?.firstName ?? 'Her') : 'Narrator'}: ${l.text}`).join('\n');
  const words = say ? `"${clean(say, MAX_SAY)}"` : `(${DATE_TONE_LABEL[tone].toLowerCase()})`;
  return [{ role: 'user', content: `${RULES}\n${content}\n\n${dateBrief(s, dt)}\n\nSo far:\n${hist || '(nothing yet)'}\n\nHe says ${words}\nAnswer as ${c?.firstName ?? 'her'}, with only the JSON object.` }];
}

export function clean(t: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Capitalized words any line may use (places of the setting, days, titles, God). */
const COMMON = new Set(('I I\'m I\'d I\'ll I\'ve OK Okay Mr Mrs Miss Mister Ma Pop Mom Dad Mama Papa Daddy Mother Father Sister Brother Doctor Officer Father Monsignor God Lord Jesus Christ Heaven Mass ' +
  'Sunday Monday Tuesday Wednesday Thursday Friday Saturday January February March April May June July August September October November December Christmas Easter Thanksgiving ' +
  'America American Italian Irish Jewish Polish Catholic English French Jersey New York Philadelphia Philly Atlantic City Wildwood Wildwoods Cape Ocean Boardwalk Shore Boulevard Pacific Avenue ' +
  'Hollywood Vegas Las Florida Miami Paris Italy Rome Europe Navy Army Marines Korea War Admiral Rhumba Terrace Doo Wop Pier Bay Island Crest North South West East Diner Club').split(/\s+/));

/** Names in the reply that are not in her brief (empty: the line may stand). */
export function strayNames(s: GameState, id: string, text: string, brief: string): string[] {
  const ok = new Set([...briefNames(s, id), ...COMMON]);
  for (const w of brief.match(/\b[A-Z][a-zA-Z'’-]+/g) ?? []) ok.add(w);
  const known = new Set<string>();
  for (const c of Object.values(s.characters)) { known.add(c.firstName); known.add(c.lastName); }
  const bad: string[] = [];
  // Every capitalized word that does not start a sentence, and every game name anywhere.
  const re = /(^|[.!?:;"“”—]\s*|\s)([A-Z][a-zA-Z'’-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const w = m[2].replace(/['’]s$/, '');
    const start = m[1] !== ' ' && m[1].trim() !== '' || m.index === 0;
    if (ok.has(w) || ok.has(m[2])) continue;
    if (known.has(w) || !start) bad.push(w);
  }
  return [...new Set(bad)];
}

/** The model's answer as data: bounded, whitelisted; a stray name rejects the line. */
export function validateDate(raw: unknown, s: GameState, dt: DateTalk): { ok: true; out: DateAi } | { ok: false; why: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, why: 'not an object' };
  const o = raw as Record<string, unknown>;
  if (typeof o.reply !== 'string') return { ok: false, why: 'no reply' };
  let reply = clean(o.reply, 600).replace(/^["“]|["”]$/g, '');
  const words = reply.split(' ');
  if (words.length > MAX_WORDS) {
    reply = words.slice(0, MAX_WORDS).join(' ');
    const cut = Math.max(reply.lastIndexOf('.'), reply.lastIndexOf('!'), reply.lastIndexOf('?'));
    reply = cut > 20 ? reply.slice(0, cut + 1) : `${reply}...`;
  }
  if (!reply) return { ok: false, why: 'empty reply' };
  const stray = strayNames(s, dt.id, reply, dateBrief(s, dt));
  if (stray.length) return { ok: false, why: `names not in the brief: ${stray.join(', ')}` };
  const mood: DateMood = o.mood === 'warmer' || o.mood === 'cooler' ? o.mood : 'same';
  const n = Number(o.interest_delta);
  let delta = Number.isFinite(n) ? Math.round(clamp(n, -8, 8)) : 0;
  delta = mood === 'warmer' ? clamp(delta, 0, 8) : mood === 'cooler' ? clamp(delta, -8, 0) : clamp(delta, -3, 3);
  const topics = Array.isArray(o.topics)
    ? o.topics.filter((x): x is string => typeof x === 'string').map((x) => clean(x, 30).toLowerCase().replace(/[^a-z '-]/g, '').trim()).filter((x) => x.length >= 2).slice(0, 3)
    : [];
  return { ok: true, out: { reply, mood, delta, topics, leaves: o.leaves === true } };
}

/* ------------------------------------------------------------------ */
/* One exchange                                                        */
/* ------------------------------------------------------------------ */

const WALK_LINES = ['I think I\'d like to go home now. Alone.', 'No. And I\'m leaving. Don\'t follow me.', 'That\'s it. Good night.', 'You\'ve got the wrong girl. Good night.'];
const COERCED_LINES = ['Nobody talks to me like that. Not you, not anybody. Good night.', 'I don\'t owe you a thing. I\'m going home.', 'No. I said no, and I\'m leaving.'];
const HOME_LINES: Record<'good' | 'ok' | 'cool', string[]> = {
  good: ['This was nice. Really nice. Call me?', 'You can walk me to the door. Just the door. For now.', 'I had a wonderful time. Don\'t make me wait too long.'],
  ok: ['Thanks for tonight. It was pleasant.', 'Good night. Drive careful.', 'I\'ll see you around, I expect.'],
  cool: ['Good night.', 'Thanks for the dinner.', 'I can get home from here.'],
};

/**
 * One round: his tone (or his own words, read for their tone), her reaction on
 * the meters (Claude's read may shade it, bounded), her line, and maybe the
 * end. Coercion ends it at once. Pure.
 */
export function stepDate(s: GameState, dt0: DateTalk, input: { tone?: DateTone; say?: string; ai?: DateAi }): { dt: DateTalk; dc: number; da: number } {
  const dt: DateTalk = { ...dt0, log: dt0.log.slice(), used: { ...dt0.used }, net: { ...dt0.net }, topics: dt0.topics.slice(), unanswered: dt0.unanswered.slice() };
  if (dt.end) return { dt, dc: 0, da: 0 };
  const say = input.say ? clean(input.say, MAX_SAY) : '';
  const read = say ? readWords(say) : undefined;
  const tone: DateTone = input.tone ?? read?.tone ?? 'charm';
  const key = `${s.seed}|${s.week}|dt|${dt.id}|${dt.round}`;
  dt.log.push({ who: 'boss', text: say || bossLine(tone, dt), tone });
  dt.round++;
  // Coercion, or a second push: she ends it. Never complies.
  if (read && (read.coercive || (read.pushy && dt.pushy >= 1))) {
    dt.coerced = true;
    dt.annoy = 100;
    dt.chem = Math.max(0, dt.chem - 30);
    dt.end = 'walkout';
    dt.log.push({ who: 'her', text: pick(COERCED_LINES, key) });
    dt.log.push({ who: 'narrator', text: `${s.characters[dt.id]?.firstName ?? 'She'} gets her coat and leaves. That is her answer.` });
    return { dt, dc: dt.chem - dt0.chem, da: 100 - dt0.annoy };
  }
  if (tone === 'home') {
    dt.end = 'home';
    const b: 'good' | 'ok' | 'cool' = dt.chem >= 65 && dt.annoy < 40 ? 'good' : dt.chem >= 40 ? 'ok' : 'cool';
    dt.log.push({ who: 'her', text: input.ai?.reply ?? pick(HOME_LINES[b], key) });
    return { dt, dc: 0, da: 0 };
  }
  const e = dateToneEffect(s, dt, tone);
  if (read?.pushy) {
    dt.pushy++;
    const warm = dt.chem >= 75 && ['dating', 'committed', 'married'].includes(stageOf(s, dt.id));
    e.chem = warm ? 0 : -6;
    e.annoy = warm ? 4 : 14;
  }
  // His words answered her question, or talked past it.
  if (dt.open) {
    const answered = tone === 'listen' || tone === 'honest' || !!read?.topics.includes(dt.open);
    if (answered) { dt.topics.push(dt.open); e.chem += read?.topics.includes(dt.open) ? 2 : 0; }
    else dt.unanswered.push(dt.open);
    dt.open = undefined;
  }
  const aiC = input.ai ? clamp(input.ai.delta, -8, 8) : 0;
  const aiA = input.ai ? (input.ai.mood === 'cooler' ? 3 : input.ai.mood === 'warmer' ? -1 : 0) : 0;
  const dc = Math.round(clamp(e.chem + aiC + (H(key + 'c') - 0.5) * 3, -14, 14));
  const da = Math.round(clamp(e.annoy + aiA + (H(key + 'a') - 0.5) * 2, -10, 20));
  dt.chem = Math.round(clamp(dt.chem + dc, 0, 100));
  dt.annoy = Math.round(clamp(dt.annoy + da, 0, 100));
  dt.used[tone] = (dt.used[tone] ?? 0) + 1;
  dt.net[tone] = (dt.net[tone] ?? 0) + dc;
  for (const t of read?.topics ?? []) if (!dt.topics.includes(t)) dt.topics.push(t);
  let line: string;
  if (input.ai) {
    line = input.ai.reply;
    dt.ai++;
    for (const t of input.ai.topics) if (!dt.topics.includes(t)) dt.topics.push(t);
    if (/\?\s*$/.test(line)) {
      const k = TOPIC_RX.find(([, rx]) => rx.test(line))?.[0];
      if (k && !dt.topics.includes(k)) dt.open = k;
    }
  } else {
    const sl = scriptedLine(s, dt, tone, { chem: dc, annoy: da }, read);
    line = sl.text;
    if (sl.ask) dt.open = sl.ask;
  }
  // She can always end it: past the line, or when Claude's read says she is going and she is annoyed enough.
  if (dt.annoy >= 70 || (input.ai?.leaves && dt.annoy >= 40)) {
    dt.end = 'walkout';
    if (!input.ai) line = pick(WALK_LINES, key);
    dt.log.push({ who: 'her', text: line });
    dt.log.push({ who: 'narrator', text: `${s.characters[dt.id]?.firstName ?? 'She'} calls it a night.` });
    return { dt, dc, da };
  }
  dt.log.push({ who: 'her', text: line });
  if (dt.round >= dt.max) {
    dt.end = 'done';
    dt.log.push({ who: 'narrator', text: 'The evening runs out on its own: the check, the coats, the walk to her door.' });
  }
  return { dt, dc, da };
}

function bossLine(tone: DateTone, dt: DateTalk): string {
  switch (tone) {
    case 'charm': return 'You know, this place got a lot better when you walked in.';
    case 'listen': return dt.open ? `You asked about ${TOPIC_TEXT[dt.open] ?? dt.open}. All right, I'll tell you.` : 'Tell me about you. The real stuff.';
    case 'joke': return 'A fella walks into a joint on the Boulevard with a lobster on a leash...';
    case 'compliment': return 'That color suits you. I mean it.';
    case 'business': return 'Things are moving on the island. A man has to keep up.';
    case 'honest': return 'I\'ll be straight with you. I\'m not a simple man, and my life isn\'t simple.';
    case 'brag': return 'Half the Boulevard pays its respects to me, you know.';
    case 'home': return dt.step === 'talk' ? 'I should let you go. It was good to see you.' : 'Come on. I\'ll walk you home.';
  }
}

/* ------------------------------------------------------------------ */
/* The outcome: her existing answer, plus the conversation, bounded      */
/* ------------------------------------------------------------------ */

const TONE_WORDS: Record<Exclude<DateTone, 'home'>, [string, string]> = {
  charm: ['you charmed her', 'your lines fell flat'],
  listen: ['you listened, and she noticed', 'too many questions'],
  joke: ['she laughed at your jokes', 'your jokes fell flat'],
  compliment: ['your compliments landed', 'the compliments were too much'],
  business: ['she liked hearing how you do business', 'you talked shop all night'],
  honest: ['you were straight with her', 'the truth was a lot for one night'],
  brag: ['she likes a man who is going places', 'you talked about yourself all night'],
};

/** How the conversation went, as one named, bounded reason ("The conversation: she laughed at your jokes"). */
export function conversationMod(dt: DateTalk): Reason {
  const cap = dt.step === 'paid' ? PAID_MOD_CAP : DATE_MOD_CAP;
  if (dt.coerced) return { label: 'The conversation: you pushed, and she ended it', value: -cap };
  if (dt.end === 'walkout') return { label: 'The conversation: you got on her nerves, and she left', value: -cap };
  if (dt.round === 0) return { label: 'The conversation: you barely spoke', value: 0 };
  const raw = (dt.chem - dt.c0) * 0.45 - Math.max(0, dt.annoy - 25) * 0.35;
  const value = Math.round(clamp(raw, -cap, cap));
  const tones = (Object.entries(dt.net) as [DateTone, number][]).filter(([t]) => t !== 'home');
  let words: string;
  if (value >= 2) {
    const best = tones.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    words = best && best[1] > 0 ? TONE_WORDS[best[0] as Exclude<DateTone, 'home'>][0] : 'she warmed to you';
  } else if (value <= -2) {
    if (dt.annoy >= 45) words = 'you got on her nerves';
    else {
      const worst = tones.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0];
      words = worst && worst[1] < 0 ? TONE_WORDS[worst[0] as Exclude<DateTone, 'home'>][1] : 'it never caught fire';
    }
  } else words = 'pleasant, nothing more';
  return { label: `The conversation: ${words}`, value };
}

/** Her answer at the end of the evening: the step's own odds and reasons, plus the conversation (visible). */
export function dateAcceptance(s: GameState, dt: DateTalk): Acceptance | undefined {
  const a = stepAction(dt.id, dt.step, dt.date);
  if (!a) return undefined;
  const p = previewAction(s, a);
  const acc = p.acceptance ?? p.odds;
  const mod = conversationMod(dt);
  if (dt.end === 'walkout') return { chance: 0, reasons: [...(acc?.reasons ?? []), mod, { label: 'She ended the evening', value: -100 }] };
  if (!acc) return { chance: 1, reasons: [mod] };
  if (acc.chance <= 0) return { chance: 0, reasons: [...acc.reasons, mod] };
  const chance = clamp(acc.chance + mod.value / 100, 0.05, Math.max(acc.chance, 0.95));
  return { chance: Math.round(chance * 1000) / 1000, reasons: [...acc.reasons, ...(mod.value ? [mod] : [])] };
}

/** A line she remembers, for the bond (and the next evening's brief). */
export function noteOf(s: GameState, dt: DateTalk, mod: Reason): { w: number; t: string; open?: string } {
  const where = dt.step === 'invite' ? DATE_INFO[dt.date ?? 'dinner'].label : dt.step === 'talk' ? 'A talk' : dt.step === 'askOut' ? 'Dinner off the clock' : dt.step === 'paid' ? 'A paid evening' : 'Late on the boardwalk';
  const bits: string[] = [mod.label.replace(/^The conversation: /, '')];
  const talked = dt.topics.filter((t) => TOPIC_TEXT[t]).slice(0, 2).map((t) => (t === 'her' ? 'her plans' : TOPIC_TEXT[t].replace(/^your /, 'his ').replace(/^you /, 'he ').replace(/what you /, 'what he ')));
  if (talked.length) bits.push(`talked about ${talked.join(' and ')}`);
  const open = dt.unanswered[dt.unanswered.length - 1];
  if (open) bits.push(`he never answered about ${(TOPIC_TEXT[open] ?? open).replace(/^your /, 'his ').replace(/^what you /, 'what he ')}`);
  if (dt.end === 'walkout') bits.push(dt.coerced ? 'he pushed and she left' : 'she left early');
  return { w: s.week, t: clean(`${where}, week ${s.week}: ${bits.join('; ')}.`, 160), ...(open ? { open } : {}) };
}

/** Fade to black: only where the engine already allows it (mature on, both adults, a relationship, a good night), and only if she chooses. */
export function fadeAllowed(s: GameState, dt: DateTalk, accepted: boolean): boolean {
  const c = s.characters[dt.id];
  const boss = player(s);
  if (!accepted || dt.end === 'walkout' || !adultOn(s) || !isAdult(s, c) || !isAdult(s, boss)) return false;
  if (dt.step === 'talk' || dt.step === 'paid' || dt.date === 'coffee') return false;
  const st = stageOf(s, dt.id);
  if (!['dating', 'committed', 'married'].includes(st) && !(st === 'attracted' && dt.chem >= 80)) return false;
  if (dt.chem < 70 || dt.annoy >= 30) return false;
  // Her choice: she decides, on her own dice.
  return H(`${s.seed}|${s.week}|fade|${dt.id}`) < (dt.chem - 50) / 60;
}

function addNote(b: Bond, n: { w: number; t: string; open?: string }, week: number): void {
  b.notes = [...(b.notes ?? []), n].slice(-NOTES_CAP);
  b.talkW = week;
}

export interface DateSettle { state: GameState; result: NowResult; reason: Reason; accepted: boolean; fade: boolean }

/**
 * The end of the evening: the step's order is settled now with her existing
 * odds plus the conversation's reason (the deeds' dice, settleOrderNow: same
 * effects, chronicle, Book entry, once-a-week guard as a tap on the card).
 * A walk-out is a no, and she remembers why. The talk after a date settles
 * nothing new: her feelings move a little (bounded) and she remembers it.
 * Pure: a new state and the result card.
 */
export function settleDateTalk(input0: GameState, dt: DateTalk): DateSettle {
  const input = freezeWeek(input0);
  const c0 = input.characters[dt.id];
  const reason = conversationMod(dt);
  const name = c0?.firstName ?? 'She';
  const failed = (why: string): DateSettle => ({ state: input0, reason, accepted: false, fade: false, result: { ok: false, error: why, title: 'On the date', tier: 'fail', headline: why, line: '', changes: [], leadsTo: [] } });
  if (!c0 || !isAdult(input, c0) || !isAdult(input, player(input))) return failed('Adults only');
  const a = stepAction(dt.id, dt.step, dt.date);
  if (a) {
    const why = canDateTalk(input, dt.id, dt.step, dt.date);
    if (!why.ok) return failed(why.why ?? 'Not now');
  }
  // The evening's hours come off his day (as a tap on the order card would).
  const s = a ? spendTime(cloneState(input), a).state : cloneState(input);
  const D = ensureDating(s);
  const before = { op: opinion(s, dt.id, s.playerId), aff: bondOf(s, dt.id)?.aff ?? 0, stage: stageOf(s, dt.id), pocket: Math.round(s.tribute?.acct.personal ?? 0) };
  const ctx = newCtx(s);
  let accepted = true;
  let chance: number | undefined;
  let roll: number | undefined;
  let tier: Tier = 'success';
  let title = `An evening with ${name}`;
  if (a) {
    title = previewAction(s, a).title;
    const acc = dateAcceptance(input, dt)!;
    const DD = ensureDeeds(s);
    DD.now = DD.now && DD.now.w === s.week ? DD.now : { w: s.week, k: [] };
    DD.now.k.push(nowKey(a));
    const r = d01(DD);
    chance = acc.chance;
    roll = Math.floor(r * 100);
    accepted = dt.end !== 'walkout' && r < acc.chance;
    tier = accepted ? (r < acc.chance * 0.15 ? 'crit' : 'success') : 'fail';
    settleOrderNow(ctx, a, accepted);
  } else {
    // The talk after a date: her feelings move a little, either way.
    const b = ensureBond(s, D, dt.id, 'You are seeing each other');
    b.aff = clamp(b.aff + Math.round(clamp(reason.value / 3, -5, 5)), 0, 100);
    accepted = dt.end !== 'walkout' && reason.value >= 0;
    tier = accepted ? 'success' : 'fail';
  }
  if (dt.end === 'walkout') {
    addOpinion(s, dt.id, s.playerId, dt.coerced ? 'Would not take no for an answer' : 'Got on my nerves all evening', dt.coerced ? -12 : -5, 1);
    if (dt.coerced) ctx.log.push(`${name} ended the evening and went home. She will remember why.`);
  }
  const b = ensureBond(s, D, dt.id, 'You have met');
  addNote(b, noteOf(s, dt, reason), s.week);
  const fade = fadeAllowed(s, dt, accepted);
  const after = { op: opinion(s, dt.id, s.playerId), aff: bondOf(s, dt.id)?.aff ?? 0, stage: stageOf(s, dt.id), pocket: Math.round(s.tribute?.acct.personal ?? 0) };
  const changes: string[] = [];
  if (after.pocket !== before.pocket) changes.push(`Your pocket ${after.pocket > before.pocket ? '+' : '−'}$${Math.abs(after.pocket - before.pocket).toLocaleString('en-US')}`);
  if (after.aff !== before.aff) changes.push(`${name}'s feelings ${after.aff > before.aff ? '+' : '−'}${Math.abs(after.aff - before.aff)} (${affectionWord(after.aff)})`);
  if (after.op !== before.op) changes.push(`${name}'s opinion of you ${after.op > before.op ? '+' : '−'}${Math.abs(after.op - before.op)}`);
  const leadsTo: string[] = [];
  const climbed = after.stage !== before.stage && STAGE_ORDER.indexOf(after.stage) > STAGE_ORDER.indexOf(before.stage);
  if (climbed) leadsTo.push(`Next rung: ${STAGE_LABEL[after.stage]}.`);
  else if (accepted && dt.step !== 'paid') leadsTo.push(`${name} would see you again.`);
  if (!accepted && dt.end !== 'walkout') leadsTo.push('Give it a week or two before you ask again.');
  const line = dt.end === 'walkout'
    ? (dt.coerced ? `${name} got up and left. Nobody pushes her into anything, and she will remember that you tried.` : `${name} had had enough and called it a night.`)
    : !accepted ? `A pleasant enough evening, but ${name} said good night at the door and meant it.`
    : climbed ? `It went well. ${STAGE_LABEL[after.stage] === 'Attraction' ? `${name} looks at you differently now.` : `${name} and you: ${STAGE_LABEL[after.stage].toLowerCase()}.`}`
    : dt.step === 'paid' ? `${name} kept to her terms, and the evening was good company.${adultOn(s) ? ' Then it was morning.' : ''}`
    : `It went well. ${name} would see you again.`;
  const fadeLine = fade ? `At her door she doesn't say good night right away. She decides to ask you in. The rest is yours and hers; then it is morning.` : '';
  const D2 = ensureDating(s);
  D2.log.push({ week: s.week, text: `On the date with ${name}: ${reason.label.replace(/^The conversation: /, '')}.`, kind: 'date', charId: dt.id });
  if (D2.log.length > 60) D2.log.splice(0, D2.log.length - 60);
  const pct = chance !== undefined ? Math.round(chance * 100) : undefined;
  const verdict = tier === 'crit' ? 'she said yes, gladly' : accepted ? (dt.step === 'after' ? 'a good night' : 'she said yes') : dt.end === 'walkout' ? 'she ended it' : 'she said no';
  const result: NowResult = {
    ok: true, title, who: displayName(c0), tier,
    headline: pct !== undefined ? `${pct}% — ${verdict}` : TIER_BANNER[tier],
    line: [line, fadeLine].filter(Boolean).join(' '),
    changes: [`${reason.value >= 0 ? '+' : '−'}${Math.abs(reason.value)} ${reason.label}`, ...changes],
    leadsTo, remember: b.notes![b.notes!.length - 1].t,
    ...(chance !== undefined ? { chance, roll } : {}),
    when: 'on the date',
  };
  return { state: s, result, reason, accepted, fade };
}

const STAGE_ORDER = ['ended', 'acquaintance', 'friends', 'attracted', 'dating', 'committed', 'married', 'separated'];

/** The next rung after a good evening (go steady, make it exclusive), with the conversation in her odds; undefined if none is open. */
export function nextRung(s: GameState, dt: DateTalk): { action: PlayerAction; title: string; acceptance: Acceptance } | undefined {
  const st = stageOf(s, dt.id);
  const op = st === 'attracted' ? 'steady' : st === 'dating' ? 'commit' : undefined;
  if (!op || dt.end === 'walkout') return undefined;
  const a: PlayerAction = { kind: 'dating', op: { op, id: dt.id } };
  const p = previewAction(s, a);
  if (p.disabledReason || !p.acceptance || settledThisWeek(s, a)) return undefined;
  const mod = conversationMod(dt);
  const chance = clamp(p.acceptance.chance + mod.value / 100, 0.05, Math.max(p.acceptance.chance, 0.93));
  return { action: a, title: p.title, acceptance: { chance: Math.round(chance * 1000) / 1000, reasons: [...p.acceptance.reasons, ...(mod.value ? [mod] : [])] } };
}

/** Ask the next rung now, with the evening's conversation in her odds (the deeds' dice; settled like a tap on the card). */
export function settleNextRung(input0: GameState, dt: DateTalk): { state: GameState; result: NowResult } | undefined {
  const input = freezeWeek(input0);
  const n = nextRung(input, dt);
  const c = input.characters[dt.id];
  if (!n || !c || !isAdult(input, c)) return undefined;
  const s = cloneState(input);
  const DD = ensureDeeds(s);
  DD.now = DD.now && DD.now.w === s.week ? DD.now : { w: s.week, k: [] };
  DD.now.k.push(nowKey(n.action));
  const r = d01(DD);
  const ok = r < n.acceptance.chance;
  const ctx = newCtx(s);
  settleOrderNow(ctx, n.action, ok);
  const tier: Tier = ok ? (r < n.acceptance.chance * 0.15 ? 'crit' : 'success') : 'fail';
  const pct = Math.round(n.acceptance.chance * 100);
  return {
    state: s,
    result: {
      ok: true, title: n.title, who: displayName(c), tier, chance: n.acceptance.chance, roll: Math.floor(r * 100),
      headline: `${pct}% — ${ok ? 'she said yes' : 'she said not yet'}`,
      line: ok ? `${c.firstName} said yes. ${STAGE_LABEL[stageOf(s, dt.id)]}.` : `${c.firstName} said not yet. That is her right.`,
      changes: [`${conversationMod(dt).value >= 0 ? '+' : '−'}${Math.abs(conversationMod(dt).value)} ${conversationMod(dt).label}`],
      leadsTo: [], when: 'on the date',
    },
  };
}
