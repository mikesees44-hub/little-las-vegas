import { capoSummary, shortName } from './briefing';
import { idleMen } from './business';
import { capos, hasTrait, isFree } from './characters';
import { applyEffects } from './effects';
import { regime } from './hierarchy';
import type { Ctx } from './ledger';
import { opinion } from './relations';
import { roll } from './roundsPersonal';
import { DAY_NAMES, missedMornings } from './days';
import type { Character, Effect, GameState, RivalId } from './types';

/**
 * The morning check-in: every day the boss meets his capos. It is built in,
 * free and quick: each capo gives one line about his district (the share,
 * the kick-up, idle men, the cops), and some mornings he brings a problem
 * with two or three one-tap answers — one of them "your call", which hands
 * the job to him.
 *
 * Everything is read off the state at the start of the week (deterministic
 * dice, never the game's RNG), so the planner can show the whole week ahead
 * and `advanceWeek` resolves exactly what the player saw. A morning the boss
 * misses (away, in hiding, inside, in the hospital, or skipped) or a problem
 * he never answers: the capo does it his own way, and the ones who don't
 * love him skim; miss enough mornings and they grumble.
 *
 * The bigger business (a man to put up, a district to push) stays with the
 * Sit-Down (briefing.ts); a capo who has something for it says so.
 */

export interface CheckAnswer { id: string; label: string; hint: string; effects: Effect[] }
export interface CheckProblem {
  /** The kind ("idle", "cops", "rival", "sore", "short", "treat"). */
  kind: string;
  text: string;
  urgent: boolean;
  answers: CheckAnswer[];
  /** What he does if you don't answer (his own way). */
  own: string;
}
export interface CheckIn {
  /** "d:capoId": the answers' key. */
  key: string;
  day: number;
  capoId: string;
  name: string;
  /** "Capo · Pine Avenue". */
  title: string;
  /** His one-line report. */
  line: string;
  problem?: CheckProblem;
}

const op = (from: string, to: string, amount: number, reason: string): Effect => ({ type: 'opinion', from, to, amount, reason, label: reason });
const cash = (amount: number, label: string): Effect => ({ type: 'money', amount, category: 'event', label });

function crewOf(s: GameState, k: Character): Character[] {
  return regime(s, k.id).filter((c) => c.id !== k.id && isFree(s, c));
}

function shortLast(s: GameState, capoId: string): number {
  const r = s.tribute?.reports;
  const last = r && r.length ? r[r.length - 1] : undefined;
  return last?.crews?.find((x) => x.capoId === capoId)?.short ?? 0;
}

/** The problems a capo could bring this week, from his real situation. */
function candidates(s: GameState, k: Character): CheckProblem[] {
  const out: CheckProblem[] = [];
  const B = s.playerId;
  const nm = shortName(k);
  const d = s.districts.find((x) => x.capoId === k.id);
  const where = d?.name ?? 'my corners';
  const idle = idleMen(s).filter((c) => c.capoId === k.id);
  const own = (amount: number) => op(k.id, B, amount, 'The boss lets me run my crew');
  if (idle.length >= 2) {
    const n = Math.min(idle.length, 4);
    out.push({
      kind: 'idle', urgent: false, own: 'own',
      text: `${n} of my guys are standing around ${where} with nothing to do.`,
      answers: [
        { id: 'work', label: 'Put them on collections', hint: `+$${120 * n} · local heat +1`, effects: [cash(120 * n, `${nm}'s idle men on collections`), { type: 'heat', bar: 'local', amount: 1, label: `${nm}'s men on collections` }] },
        { id: 'own', label: `Your call, ${nm}`, hint: `${nm} +2 · +$${60 * n}`, effects: [own(2), cash(60 * n, `${nm} found his men work`)] },
        { id: 'rest', label: 'Let them be', hint: 'the men +1', effects: idle.slice(0, 3).map((c) => op(c.id, B, 1, 'The boss gave us a breather')) },
      ],
    });
  }
  if (s.heat.local >= 35) out.push({
    kind: 'cops', urgent: s.heat.local >= 60, own: 'own',
    text: `A sergeant is leaning on ${where}. He wants something or he wants a pinch.`,
    answers: [
      { id: 'pay', label: 'Take care of the sergeant', hint: '−$300 · local heat −3', effects: [cash(-300, `An envelope for the sergeant (${where})`), { type: 'heat', bar: 'local', amount: -3, label: `The sergeant on ${where} is taken care of` }] },
      { id: 'quiet', label: 'Go quiet a few nights', hint: '−$250 take · local heat −2', effects: [cash(-250, `${where} goes quiet a few nights`), { type: 'heat', bar: 'local', amount: -2, label: `${where} went quiet` }] },
      { id: 'own', label: `Handle it, ${nm}`, hint: `${nm} +1 · −$150 · local heat −1`, effects: [own(1), cash(-150, `${nm} handled the sergeant`), { type: 'heat', bar: 'local', amount: -1, label: `${nm} handled the sergeant` }] },
    ],
  });
  if (d) {
    const top = Object.entries(d.influence).filter(([f, v]) => f !== 'player' && (v ?? 0) >= 15 && s.rivals.some((r) => r.id === f && r.kind === 'mob')).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    const r = top ? s.rivals.find((x) => x.id === top[0]) : undefined;
    if (r) out.push({
      kind: 'rival', urgent: (top![1] ?? 0) >= 30, own: 'own',
      text: `${r.shortName}'s boys were on my corner in ${d.name} last night, like they own it.`,
      answers: [
        { id: 'push', label: 'Run them off', hint: `respect +1 · ${r.shortName} −4 · local heat +1`, effects: [{ type: 'respect', amount: 1, label: `Ran ${r.shortName} off ${d.name}` }, { type: 'rivalOpinion', rival: r.id as RivalId, amount: -4, reason: 'Ran our boys off', label: `Ran ${r.shortName} off` }, { type: 'heat', bar: 'local', amount: 1, label: `Trouble on ${d.name}` }, { type: 'influence', district: d.id, faction: 'player', amount: 1, label: `Held ${d.name}` }] },
        { id: 'talk', label: `Send word to ${r.shortName}`, hint: `${r.shortName} +2 · respect −1`, effects: [{ type: 'rivalOpinion', rival: r.id as RivalId, amount: 2, reason: 'Sent word instead of muscle', label: `Word to ${r.shortName}` }, { type: 'respect', amount: -1, label: `Let ${r.shortName} walk on ${d.name}` }] },
        { id: 'own', label: `Your call, ${nm}`, hint: `${nm} +2 · ${r.shortName} −2`, effects: [own(2), { type: 'rivalOpinion', rival: r.id as RivalId, amount: -2, reason: `${nm}'s men pushed back`, label: `${nm} pushed back` }, { type: 'heat', bar: 'local', amount: 1, label: `Trouble on ${d.name}` }] },
      ],
    });
  }
  const o = opinion(s, k.id, B);
  if (o < 0) out.push({
    kind: 'sore', urgent: o <= -30, own: 'own',
    text: `${nm} wants a word about his end. He's said it twice now.`,
    answers: [
      { id: 'hear', label: 'Hear him out', hint: `${nm} +5`, effects: [op(k.id, B, 5, 'The boss heard me out')] },
      { id: 'firm', label: 'Remind him whose table it is', hint: `${nm} −2 · fear +5`, effects: [op(k.id, B, -2, 'Put me in my place'), { type: 'meter', from: k.id, to: B, meter: 'fear', amount: 5, label: `Reminded ${nm}` }] },
      { id: 'own', label: 'Not today', hint: `${nm} −3`, effects: [op(k.id, B, -3, 'The boss wouldn\'t hear me')] },
    ],
  });
  const short = shortLast(s, k.id);
  if (short > 0) out.push({
    kind: 'short', urgent: false, own: 'grace',
    text: `I came up $${short.toLocaleString('en-US')} short. The rain killed Saturday.`,
    answers: [
      { id: 'grace', label: 'Give him the week', hint: `${nm} +3`, effects: [op(k.id, B, 3, 'The boss gave me the week')] },
      { id: 'lean', label: 'Lean on him', hint: `${nm} −4 · +$${Math.min(short, 400)}`, effects: [op(k.id, B, -4, 'Leaned on me over a short week'), cash(Math.min(short, 400), `${nm} made up the short`)] },
    ],
  });
  if (o >= 20 && !short) {
    const men = crewOf(s, k).slice(0, 4);
    if (men.length) out.push({
      kind: 'treat', urgent: false, own: 'no',
      text: 'Good week on my end. The men would like to see you pick up a dinner.',
      answers: [
        { id: 'yes', label: 'Dinner on the Family', hint: `−$200 · his men +2`, effects: [cash(-200, `Dinner for ${nm}'s crew`), ...men.map((c) => op(c.id, B, 2, 'The boss bought us dinner'))] },
        { id: 'no', label: 'Next time', hint: 'nothing', effects: [] },
      ],
    });
  }
  return out;
}

const FLAVOR = (s: GameState, k: Character): string[] => {
  const idle = idleMen(s).filter((c) => c.capoId === k.id).length;
  const men = crewOf(s, k).length;
  const out = [
    men ? `${men} men working.` : 'Just me and the phone.',
    idle ? `${idle} of mine have nothing to do.` : 'Everybody\'s busy.',
    s.heat.local >= 50 ? 'The cops are everywhere.' : s.heat.local >= 30 ? 'The cops are sniffing.' : 'The cops are quiet.',
    'Nothing new.',
    'The boardwalk was packed last night.',
  ];
  const o = opinion(s, k.id, s.playerId);
  if (o < -10) out.push('He doesn\'t take his hat off.');
  if (o > 40) out.push('He brought you sfogliatelle.');
  return out;
};

const PROBLEM_ODDS = 0.4;

/** The whole week's check-ins (every capo, every day), from the state at the start of the week. */
export function weekCheckIns(s: GameState): CheckIn[] {
  if (s.gameOver) return [];
  const out: CheckIn[] = [];
  for (const k of capos(s).filter((c) => isFree(s, c)).sort((a, b) => a.id.localeCompare(b.id))) {
    const d = s.districts.find((x) => x.capoId === k.id);
    const cands = candidates(s, k);
    const used = new Set<string>();
    const fl = FLAVOR(s, k);
    const sum = capoSummary(s, k) ?? (d ? `${d.name}.` : 'No district of his own.');
    for (let day = 0; day < 7; day++) {
      const h = roll(`${s.seed}|${s.week}|ci|${k.id}|${day}`);
      const left = cands.filter((c) => !used.has(c.kind));
      // An urgent problem comes in on Monday; the rest when they come.
      const urgent = day === 0 ? left.find((c) => c.urgent) : undefined;
      const p = urgent ?? (h < PROBLEM_ODDS && left.length ? left[Math.floor(roll(`${s.seed}|${s.week}|cp|${k.id}|${day}`) * left.length) % left.length] : undefined);
      if (p) used.add(p.kind);
      const line = day === 0 ? sum : fl[Math.floor(h * 1000) % fl.length];
      out.push({ key: `${day}:${k.id}`, day, capoId: k.id, name: shortName(k), title: d ? `Capo · ${d.name}` : 'Capo', line, ...(p ? { problem: p } : {}) });
    }
  }
  return out;
}

export function dayCheckIns(s: GameState, day: number): CheckIn[] {
  return weekCheckIns(s).filter((c) => c.day === day);
}

/** An urgent problem waiting on this morning (the clock stops for it). */
export function urgentOn(s: GameState, day: number, answers: Record<string, string> = {}): CheckIn | undefined {
  return dayCheckIns(s, day).find((c) => c.problem?.urgent && !answers[c.key]);
}

/**
 * Resolve the week's mornings (called by `advanceWeek` after the rounds).
 * `list` and `missed` are read off the week as the player saw it.
 */
export function checkinsWeek(ctx: Ctx, list: CheckIn[], answers: Record<string, string>, missed: Record<number, string>): string[] {
  const s = ctx.s;
  if (s.gameOver || !list.length) return [];
  const B = s.playerId;
  const lines: string[] = [];
  let answered = 0;
  let ignored = 0;
  const ownWay: string[] = [];
  for (const c of list) {
    const k = s.characters[c.capoId];
    if (!k?.alive || !isFree(s, k) || !c.problem) continue;
    const p = c.problem;
    const pick = !missed[c.day] ? p.answers.find((a) => a.id === answers[c.key]) : undefined;
    const label = `${DAY_NAMES[c.day]} morning with ${c.name}`;
    if (pick) {
      answered++;
      if (pick.effects.length) applyEffects(ctx, pick.effects, { label, because: `told ${c.name}: ${pick.label.toLowerCase()}`, category: 'event' });
      continue;
    }
    // Nobody answered him: he does it his own way.
    const mine = p.answers.find((a) => a.id === p.own);
    if (mine?.effects.length) applyEffects(ctx, mine.effects, { label: `${c.name} did it his own way`, because: `left ${c.name} to it`, category: 'event' });
    if (!missed[c.day]) {
      ignored++;
      applyEffects(ctx, [op(k.id, B, -1, 'The boss didn\'t answer me')], { label: `${c.name} waited for an answer`, because: 'never answered him', category: 'event' });
    }
    ownWay.push(c.name);
  }
  const days = Object.keys(missed).map(Number);
  const held = 7 - days.length;
  if (days.length >= 2) {
    // The boss wasn't around: the men who don't love him help themselves; enough of it and they grumble.
    const skimmers: string[] = [];
    for (const k of capos(s).filter((c) => isFree(s, c))) {
      if (opinion(s, k.id, B) < 20 || hasTrait(k, 'Greedy')) {
        const amt = Math.min(600, 60 * days.length * (hasTrait(k, 'Greedy') ? 2 : 1));
        applyEffects(ctx, [cash(-amt, `${shortName(k)} skimmed while you weren't there`)], { label: `${shortName(k)} skimmed`, because: 'was never at the morning meeting', category: 'event' });
        skimmers.push(`${shortName(k)} (−$${amt})`);
      }
      if (days.length >= 3) applyEffects(ctx, [op(k.id, B, -2, 'The boss is never around')], { label: 'Never at the morning meeting', because: 'was never at the morning meeting', category: 'event' });
    }
    const why = [...new Set(Object.values(missed))].join(', ').toLowerCase();
    lines.push(`You missed ${days.length} mornings with your capos (${why}).${skimmers.length ? ` ${skimmers.join(', ')} helped themselves.` : ''}${days.length >= 3 ? ' They grumble that you are never around.' : ''}`);
  } else if (held === 7 && answered > 0) {
    lines.push(`Every morning with your capos this week; ${answered} problem${answered > 1 ? 's' : ''} settled at the table.`);
  }
  const who = [...new Set(ownWay)];
  if (ignored) lines.push(`${ignored} problem${ignored > 1 ? 's' : ''} you never answered: ${who.join(', ')} handled ${ignored > 1 ? 'them' : 'it'} ${who.length > 1 ? 'their' : 'his'} own way.`);
  return lines;
}

/** The engine's entry: the week's check-ins as the player saw them (undefined while the layer is off). */
export function checkinPlan(s: GameState, answers: Record<string, string> | undefined, skipDays: readonly number[] | undefined): { list: CheckIn[]; missed: Record<number, string> } | undefined {
  if (answers === undefined) return undefined;
  return { list: weekCheckIns(s), missed: missedMornings(s, skipDays ?? []) };
}
