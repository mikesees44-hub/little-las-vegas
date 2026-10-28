import { agingOf, OLD_TRAITS, traitLabel, undiagnosed, type OldTrait } from './aging';
import { ageOn } from './calendar';
import { crew, displayName, hasTrait, player } from './characters';
import { madamOf } from './ears';
import { adultOn } from './datingState';
import { fam } from './familyState';
import { heatBand } from './heat';
import { convictionOdds, LAWYER, OPEN_FILE, RETAINER_CAP, RETAINER_EARLY_CAP, stageLabel } from './longgame';
import { opinion } from './relations';
import type { Character, Effect, GameState, PlayerAction } from './types';

/**
 * Your Rounds, the boss's own affairs: the lawyer, the doctor, the head
 * doctor, and an evening the Madam arranges. Each is a Round (rounds.ts):
 * one evening, paid from the boss's Pocket, named effects through the one
 * ledger. The readings (what the lawyer and the doctor tell him) are pure and
 * read straight off the systems that already exist: the heat bars, the Long
 * Game (longgame.ts), each man's evidence file, the boss's health and
 * conditions.
 *
 * Content: non-explicit. The evening with a companion is arranged through the
 * Madam between adults; the woman decides, and may say no; nothing happens on
 * screen, the report says only that the evening happened (or didn't) and what
 * it cost.
 */

/** The same deterministic dice the Sit-Down uses: never the game's RNG. */
export function roll(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ */
/* The lawyer                                                          */
/* ------------------------------------------------------------------ */

export interface Flip { id: string; name: string; why: string }
export interface LawyerMove { label: string; why: string; action?: PlayerAction; tab?: string }
export interface LawyerReading {
  lawyer: string;
  /** What he says, a few lines. */
  lines: string[];
  heat: { federal: number; local: number; family: number };
  stage: string;
  evidence: number;
  /** Odds a trial goes against you today (when there is a case). */
  conviction?: number;
  flips: Flip[];
  moves: LawyerMove[];
  /** What it costs to have him work the heat this week. */
  fixFee: number;
}

const OPEN = ['investigation', 'grandjury', 'indicted', 'trial'];

/** Who the lawyer worries about: men with a thick file, a cell, or no love for you. */
export function mightFlip(s: GameState): Flip[] {
  const boss = s.playerId;
  return crew(s)
    .filter((c) => c.alive && c.id !== boss)
    .map((c) => {
      const ev = c.evidence ?? 0;
      const op = opinion(s, c.id, boss);
      const inside = c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week;
      const score = ev / 10 + (inside ? 4 : 0) + (op < 0 ? -op / 10 : 0) - (hasTrait(c, 'Loyal-to-a-fault') ? 4 : 0);
      const why = inside ? `inside, and ${op < 10 ? 'he doesn\'t owe you much' : 'they\'re working on him'}` : ev >= 40 ? `the government has a thick file on him${op < 10 ? ' and he isn\'t fond of you' : ''}` : `he thinks ${op} of you`;
      return { c, score, why };
    })
    .filter((x) => x.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => ({ id: x.c.id, name: displayName(x.c), why: x.why }));
}

export function lawyerFee(s: GameState): number {
  return Math.round((900 + (s.heat.federal + s.heat.local) * 20) / 100) * 100;
}

export function lawyerReading(s: GameState): LawyerReading {
  const boss = player(s);
  const l = s.legal && s.legal.personId === boss.id ? s.legal : undefined;
  const open = !!l && OPEN.includes(l.stage);
  const evidence = Math.round(boss.evidence ?? 0);
  const heat = { federal: s.heat.federal, local: s.heat.local, family: s.heat.family };
  const lines: string[] = [];
  const band = (v: number) => heatBand(v);
  lines.push(`The feds: ${band(heat.federal)} (${heat.federal}). ${heat.federal >= 60 ? 'They have a man on you. Assume the phone is tapped.' : heat.federal >= 35 ? 'Your name comes up in Newark. Not loudly, yet.' : 'You are not their priority. Keep it that way.'}`);
  lines.push(`The local cops: ${band(heat.local)} (${heat.local}). ${heat.local >= 60 ? 'The chief needs an arrest to show the papers.' : heat.local >= 35 ? 'Some of the patrolmen are getting ideas.' : 'The sergeants are comfortable.'}`);
  if (!l || l.stage === 'quiet') lines.push(evidence >= OPEN_FILE * 0.6 ? `No case yet, but your file is ${evidence} thick. At ${OPEN_FILE} they open one.` : 'No case against you. Nothing I can see.');
  else if (l.stage === 'grandjury') lines.push(`A grand jury is sitting in Camden on you. Evidence ${evidence}, our defense ${l.defense}.`);
  else lines.push(`${stageLabel(l)}. Evidence ${evidence}, our defense ${l.defense}.`);
  const conviction = open && l ? Math.round(convictionOdds(s, l) * 100) : undefined;
  if (conviction !== undefined) lines.push(`If it went to trial today: ${conviction}% they convict.`);
  const flips = mightFlip(s);
  if (flips.length) lines.push(`Who might talk: ${flips.map((f) => f.name.split(' ')[0]).join(', ')}.`);
  if ((s.flags.informant ?? 0) > 0) lines.push('And they know things they shouldn\'t. Somebody close is talking. I can\'t tell you who.');
  const moves: LawyerMove[] = [];
  if (open) moves.push({ label: 'Lie low a while', why: 'No meetings, no photographs. The case starves.', action: { kind: 'legal', op: 'lielow' } });
  if (open && l && l.defense < RETAINER_CAP) moves.push({ label: `Put ${LAWYER.split(',')[0]} on retainer`, why: 'A defense built early is worth twice one built late.', action: { kind: 'legal', op: 'retainer' } });
  else if (!open && (!l || l.stage === 'quiet') && (l?.defense ?? 0) < RETAINER_EARLY_CAP && evidence >= OPEN_FILE * 0.6) moves.push({ label: `Put ${LAWYER.split(',')[0]} on retainer now`, why: 'No charge yet, but a defense started before one is worth more. It keeps for when they open a case.', action: { kind: 'legal', op: 'retainer' } });
  if (s.unwashed > 8000) moves.push({ label: 'Clean the cash through a front', why: `${Math.round(s.unwashed / 1000)}k nobody can explain is evidence waiting to happen.`, tab: 'books' });
  if (heat.local >= 35) moves.push({ label: 'Take care of the sergeant', why: 'An envelope at the precinct buys a quiet month.', tab: 'cityhall' });
  if (flips.length) moves.push({ label: `Keep ${flips[0].name.split(' ')[0]} close`, why: 'A man who feels looked after doesn\'t look for a deal.', tab: 'capos' });
  return { lawyer: LAWYER, lines, heat, stage: l ? stageLabel(l) : 'No case', evidence, conviction, flips, moves, fixFee: lawyerFee(s) };
}

/* ------------------------------------------------------------------ */
/* The doctor                                                          */
/* ------------------------------------------------------------------ */

export interface DoctorReading { lines: string[]; health: number; conditions: string[]; boost: number }

const ADVICE: Record<string, string> = {
  'Bad heart': 'Your heart works too hard. Fewer cigars, less salt, a walk on the boardwalk every morning.',
  "Drinker's liver": 'Your liver is tired. Two drinks, not six. I mean it.',
  "Smoker's cough": 'That cough is the cigarettes. You know it is.',
  'Sugar diabetes': 'Sugar diabetes. Watch the pastry. I will check you every month.',
};

const OLD_ADVICE: Record<OldTrait, string> = {
  infirm: 'You are slowing down. Walk every day, rest every afternoon, and let younger men carry things.',
  eyes: 'Your eyes are going. Glasses will help for a while. No more driving at night.',
  bones: 'Your bones are thin. A fall now would be serious: a rail on the stairs, and no ladders.',
  mind: 'Your memory is slipping. Keep a book of names. Keep your mind busy. Come back every few months.',
  heart: 'Your heart is tired. Less salt, fewer cigars, less aggravation. I mean the aggravation most of all.',
  incapable: 'He talks to your wife in the hallway, not to you.',
};
function drinkingWorsens(b: Character): boolean {
  return hasTrait(b, 'Drinker') || b.conditions.includes("Drinker's liver");
}

export function doctorReading(s: GameState): DoctorReading {
  const b = player(s);
  const age = ageOn(b.birth, s.date);
  const lines: string[] = [];
  lines.push(`Dr. Hensley in Cape May takes your pressure twice. ${b.health >= 75 ? '"You\'ll outlive me."' : b.health >= 50 ? '"Not bad for a man in your line of work."' : '"You need to slow down, and I don\'t say that to everybody."'}`);
  for (const c of b.conditions) lines.push(ADVICE[c] ?? `${c}: he writes you a prescription.`);
  if (!b.conditions.length) lines.push(age >= 45 ? 'Blood pressure a little high. Nothing yet he can name. Come back in the fall.' : 'Nothing he can find. Go home.');
  if (hasTrait(b, 'Drinker') && !b.conditions.includes("Drinker's liver")) lines.push('He smells the anisette and says nothing. Then he says something.');
  // Old age: he names what is there (a visit also slows it down for half a year).
  const old = agingOf(s, b.id);
  const named: string[] = [];
  for (const t of OLD_TRAITS) {
    const L = old.t[t];
    if (!L) continue;
    named.push(traitLabel(t, L));
    lines.push(`${traitLabel(t, L)}: ${OLD_ADVICE[t]}`);
  }
  if (drinkingWorsens(b) && named.length) lines.push('The drinking makes all of it come on faster. He says it twice.');
  const boost = Math.min(8, 3 + b.conditions.length * 2);
  return { lines, health: b.health, conditions: [...b.conditions, ...named], boost };
}

/* ------------------------------------------------------------------ */
/* Builders used by rounds.ts                                          */
/* ------------------------------------------------------------------ */

/** A minimal Round shape (rounds.ts owns the full type; this avoids a cycle). */
export interface PersonalRound {
  id: string;
  lane: 'self' | 'fun';
  label: string;
  text: string;
  who?: string;
  slots: number;
  effects: Effect[];
  risk?: { chance: number; text: string; effects: Effect[]; pocket?: number };
  decline?: { chance: number; text: string; effects: Effect[] };
  suggestedBy?: string;
  result: string[];
  cost: number;
  /** Which reading the report scene shows. */
  reading?: 'lawyer' | 'doctor';
  pocketOnly?: boolean;
  adult?: boolean;
}

const stressFx = (s: GameState, amount: number, label: string, source: 'domestic' | 'paranoia' = 'domestic'): Effect[] => (s.dyn ? [{ type: 'dyn', op: { op: 'stress', charId: s.playerId, amount, source }, label } as Effect] : []);

function weeksSince(s: GameState, id: string): number {
  const h = (s.rounds?.history ?? []).slice().reverse().find((x) => x.ids.includes(id));
  return h ? s.week - h.week : 99;
}

function visits(s: GameState, id: string, weeks: number): number {
  return (s.rounds?.history ?? []).filter((x) => x.week > s.week - weeks && x.ids.includes(id)).length;
}

export function personalRounds(s: GameState, wife: Character | undefined): PersonalRound[] {
  const out: PersonalRound[] = [];
  const boss = player(s);
  const B = boss.id;
  const free = boss.imprisonedUntil === undefined || boss.imprisonedUntil <= s.week;
  const lr = lawyerReading(s);
  const l = s.legal && s.legal.personId === B ? s.legal : undefined;
  const open = !!l && OPEN.includes(l.stage);
  const hot = s.heat.federal >= 45 || s.heat.local >= 50 || open;
  const lawyerName = LAWYER.split(',')[0];

  // The lawyer: in prison too (he visits).
  out.push({
    id: 'self:lawyer', lane: 'self', label: `Call ${lawyerName} about the heat`, slots: 1, reading: 'lawyer',
    text: `His office over the bank on Pacific Avenue. He reads you your exposure: the feds, the cops, ${open ? 'the case, ' : ''}who might talk.`,
    effects: [...stressFx(s, -3, 'The lawyer says it\'s handled', 'paranoia'), ...(open ? [{ type: 'legal', op: 'defense', amount: 2, label: 'An hour with the lawyer' } as Effect] : [])],
    result: [`${lawyerName} took his glasses off and told you where you stand.`, `An hour with ${lawyerName}. He billed you for two.`],
    cost: 250,
    suggestedBy: hot && weeksSince(s, 'self:lawyer') >= 4 ? `${lawyerName} wants to see you` : undefined,
  });
  if (s.heat.federal + s.heat.local >= 30 || open) out.push({
    id: 'self:lawyer-fix', lane: 'self', label: `Have ${lawyerName} work the heat`, slots: 1, reading: 'lawyer',
    text: 'A motion here, a lunch with an assistant prosecutor there, a reporter who decides the story isn\'t ready. It costs.',
    effects: [
      { type: 'heat', bar: 'federal', amount: -Math.min(6, Math.max(2, Math.round(s.heat.federal / 10))), label: `${lawyerName} works the heat` },
      { type: 'heat', bar: 'local', amount: -Math.min(5, Math.max(1, Math.round(s.heat.local / 12))), label: `${lawyerName} works the heat` },
      ...(open ? [{ type: 'legal', op: 'defense', amount: 4, label: `${lawyerName} works the case` } as Effect] : []),
    ],
    result: [`${lawyerName} made three phone calls from a booth so you wouldn't have to.`, `The fee was steep. ${lawyerName} says that's how you know it's working.`],
    cost: lr.fixFee,
  });
  if (!free) return out;

  // The doctor.
  const dr = doctorReading(s);
  out.push({
    id: 'self:doctor', lane: 'self', label: 'See the doctor', slots: 1, reading: 'doctor',
    text: 'A checkup in Cape May: the heart, the pressure, the drinking. He catches things early, if you let him.',
    effects: [{ type: 'health', charId: B, amount: dr.boost, label: 'A checkup, and doing what the doctor says' }, ...stressFx(s, -2, 'A clean bill, more or less'), { type: 'dyn', op: { op: 'aging', a: { k: 'checkup', charId: B } }, label: 'The doctor looks you over' }],
    result: ['The doctor listened to your chest for a long time, then wrote something down.', 'A checkup in Cape May. You promised him things you might even do.'],
    cost: 120,
    suggestedBy: (boss.health < 60 || boss.conditions.length > 0 || undiagnosed(s).length > 0) && weeksSince(s, 'self:doctor') >= 10 ? (wife?.alive ? `${wife.firstName} made you an appointment` : 'Your chest has been tight') : undefined,
  });

  // The head doctor, quietly.
  const n = visits(s, 'self:shrink', 8);
  const st = s.dyn ? fam(s, B).stress : 0;
  out.push({
    id: 'self:shrink', lane: 'self', label: 'See the head doctor (quietly)', slots: 1,
    text: 'A psychiatrist in Philadelphia, a back stair, the name "Mr. Russo" in his book. You talk; he listens. Nobody can know.',
    effects: [
      ...stressFx(s, -14, 'An hour with the head doctor', 'paranoia'),
      ...(wife?.alive ? [{ type: 'opinion', from: wife.id, to: B, amount: 3, reason: 'He\'s calmer lately', label: 'Calmer at home' } as Effect] : []),
    ],
    risk: {
      chance: Math.min(0.35, 0.08 + n * 0.05 + ((s.flags.informant ?? 0) > 0 ? 0.05 : 0)),
      text: 'Word gets out the boss sees a head doctor',
      effects: [
        { type: 'crewOpinion', amount: -3, reason: 'The boss talks to a head doctor. What does he tell him?', label: 'Talks to a head doctor' },
        { type: 'respect', amount: -2, label: 'Talks to a head doctor' },
      ],
    },
    result: ['"Mr. Russo" talked about his father for fifty minutes. The doctor took notes in a language you can\'t read.', 'The head doctor asked how you sleep. You told him the truth, for once.'],
    cost: 200,
    suggestedBy: undefined,
    ...(st >= 50 ? { text: 'You haven\'t slept right in weeks. A psychiatrist in Philadelphia, a back stair, the name "Mr. Russo" in his book. Nobody can know.' } : {}),
  });

  // An evening the Madam arranges (adults only, her choice, off-screen).
  const madam = madamOf(s);
  if (madam?.alive && opinion(s, madam.id, B) >= -10 && adultOn(s)) {
    const r = roll(`${s.seed}|${s.week}|escort-risk`);
    const rival = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
    const risks: { text: string; effects: Effect[]; pocket?: number }[] = [
      ...(wife?.alive ? [{ text: `${wife.firstName} finds out`, effects: [{ type: 'opinion', from: wife.id, to: B, amount: -10, reason: 'Heard where you spent the night', label: 'She found out' } as Effect, { type: 'familyOpinion', amount: -2, reason: 'The boss and his nights out', label: 'She found out' } as Effect] }] : []),
      { text: 'She is one of the Ears, and she talks', effects: [{ type: 'heat', bar: 'local', amount: 2, label: 'The island knows where the boss spends his nights' }, { type: 'respect', amount: -1, label: 'Gossip about the boss' }] },
      { text: 'Somebody has a photograph, and wants an envelope', effects: [], pocket: 1500 },
      ...(rival ? [{ text: `${rival.shortName} had a friend in the next room`, effects: [{ type: 'heat', bar: 'family', amount: 3, label: `${rival.shortName} heard what you said that night` } as Effect] }] : []),
    ];
    const risk = risks[Math.floor(r * risks.length) % risks.length];
    out.push({
      id: 'fun:escort', lane: 'fun', label: `Ask ${madam.firstName} to arrange company`, who: madam.id, slots: 1,
      text: `${madam.firstName} knows a grown woman who might like dinner and a quiet evening with you. She asks her; the lady decides. Nothing more is written down.`,
      effects: [...stressFx(s, -12, 'An evening away from everything'), { type: 'opinion', from: madam.id, to: B, amount: 2, reason: 'Paid well and asked nothing', label: 'The Madam' }],
      decline: { chance: 0.15, text: `The lady said no. That's her right, and ${madam.firstName} doesn't ask twice. You had a drink alone.`, effects: stressFx(s, -2, 'A drink alone') },
      risk: { chance: hasTrait(boss, 'Womanizer') ? 0.3 : 0.2, ...risk },
      result: ['Dinner somewhere in Cape May nobody knows you. You came home before the milk truck.', 'A quiet evening, arranged with care. The report ends there.'],
      cost: 350, pocketOnly: true, adult: true,
    });
  }
  return out;
}
