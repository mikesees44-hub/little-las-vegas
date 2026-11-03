import { ageOn } from './calendar';
import { capos, crew, displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { applyEffects } from './effects';
import { addStory, capoOf } from './hierarchy';
import { newCtx, type Ctx } from './ledger';
import { addOpinion, getRelation, opinion } from './relations';
import { registerDelivery, scheduleInto, scheduled, type MomentView, type ScheduledItem } from './schedule';
import { DAY_NAMES, today } from './days';
import { journal } from './journal';
import { pressItem } from './paper';
import { addSecret } from './secrets';
import { npcFlipReasons, sumP } from './trialCase';
import { bookOf } from './capos';
import { grievanceLoad } from './heir';
import { killCharacter } from './dynasty';
import { tryScene } from './authored/run';
import { buildPlantFound } from './crewEvents';
import type { NowResult } from './deeds/now';
import type { Character, Effect, EventInstance, Faction, GameState, RivalId } from './types';
import {
  addFedEvidence, bossHasFlipped, ensureFeds, fid, fr, informantsAround, isInformant,
  type Brasco, type FedsState, type Pinch,
} from './fedsState';

export { addFedEvidence, bossHasFlipped, ensureFeds, informantsAround, isInformant };

/**
 * FEDS AND FLIPPING (imports/queue/FEDS_AND_FLIPPING.md). One arc built on what was already there:
 *
 *  1. PINCHES. Serious acts leave evidence on the men who did them (dirtyWork, schemes, the wire:
 *     `addFedEvidence`). When a man's file plus the heat crosses the line he is picked up AT AN HOUR
 *     (schedule.ts: the knock is a moment): bail, a lawyer, the charge and the years. A small charge
 *     can go away; a serious one is years.
 *  2. FLIPPING. A man facing serious time weighs the government's offer (trialCase.npcFlipReasons plus
 *     the years, his oath, his grievances, and what the family did for him). The visiting room is a
 *     moment with the odds on every answer: the envelope, a visit, his capo, a word through a guard, a
 *     faster trial — or, as the boss's own explicit choice, a hit. A man who flips comes back out and
 *     wears a wire (Character.informantFor = 'law', a secret the investigations can find): he pushes
 *     the boss to talk (a meeting on the clock), and the tapes pile up into an indictment wave (a day).
 *     A man who stands up does his time and comes home to respect and a promotion.
 *  3. THE BOSS'S DEAL (trial.ts): once only. Witness protection (the end), the heir under a cloud, or the
 *     secret informant who keeps the chair: monthly meets with a handler, exposure, and if it comes out,
 *     a death sentence, a coup or a run.
 *  4. THE HOLLOW CROWN: the capos run the family and he holds the title. A meter of how much of the
 *     family answers to him; orders quietly ignored (hierarchy.obeyOdds shows the odds); light
 *     envelopes; meetings without him; the conspiracy scenes. Ways out: win capos back one at a time,
 *     make an example, a purge, step aside, or be clipped (the existing coup).
 *  5. THE TIP-OFF: a hit or a coup on the boss heard on a wire: two agents at the bakery at seven.
 *  6. THE UNDERCOVER: a jewel fence from out of town, vouched for by one of yours. Tells, a sponsorship,
 *     the discovery and the boss's call — or the indictment wave when the Bureau pulls him out.
 */

/* ------------------------------------------------------------------ */
/* Tuning                                                               */
/* ------------------------------------------------------------------ */

/** A man's file plus the heat at which he can be picked up. */
export const PINCH_LINE = 58;
/** Weeks between pinches (spread out). */
export const PINCH_GAP = 6;
/** Evidence at which a charge is serious (years, and the government's offer). */
export const SERIOUS = 35;
/** Wire evidence that brings an indictment wave. */
export const WAVE_AT = 55;
/** Weeks before the government decides whether a held man has come over. */
export const DECIDE_WEEKS = 3;
/** Weekly chance an undercover operation starts (when the FBI is working the family). */
export const BRASCO_CHANCE = 0.006;
/** Weekly chance the hollow crown sets in when enough lines up. */
export const HOLLOW_CHANCE = [0, 0, 0, 0.06, 0.16, 0.3];

/** What the Feds care about (a op is just a note: the real work is in the standard effects). */
export type FedsOp = { op: 'note'; text: string };

export function applyFedsOp(ctx: Ctx, op: FedsOp): void {
  if (op.op === 'note') ctx.log.push(op.text);
}

export function describeFedsOp(_s: GameState, op: FedsOp): string | undefined {
  return op.op === 'note' ? undefined : undefined;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

const nm = (c: Character | undefined) => (c ? displayName(c) : 'somebody');
const pc = (p: number) => `${Math.round(p * 100)}%`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hourText = (h: number) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} a.m.` : `${h - 12} p.m.`);

function chron(s: GameState, text: string, kind: 'heat' | 'misc' | 'succession' | 'death' = 'heat'): void {
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind });
}

function mine(s: GameState, c: Character | undefined): c is Character {
  return !!c && c.alive && c.faction === 'player' && c.id !== s.playerId;
}

/** A free day for a feds moment (one a day at most; never two of ours on the same day). */
function freeDay(s: GameState, w: number, from: number, to: number, F: FedsState): number {
  const used = new Set(scheduled(s).filter((x) => x.w === w && x.kind.startsWith('feds_')).map((x) => x.d));
  const days: number[] = [];
  for (let d = from; d <= to; d++) if (!used.has(d)) days.push(d);
  if (!days.length) return to;
  return days[Math.floor(fr(F) * days.length) % days.length];
}

/** Put a feds moment on the clock: `wOff` weeks ahead (at the turn the week has not moved yet: 1 = the coming week). */
function put(s: GameState, kind: string, w: number, day: number, hour: number, payload: Record<string, unknown>): string {
  return scheduleInto(s, { kind, w, day, hour, payload });
}

/** The week a moment set during the turn lands in (the turn has not moved the week yet). */
function nextW(s: GameState, atTurn: boolean): number {
  return atTurn ? s.week + 1 : s.week;
}

/* ------------------------------------------------------------------ */
/* 1. Pinches                                                           */
/* ------------------------------------------------------------------ */

/** How close the law is to picking him up: his file and the heat on the family. */
export function pinchScore(s: GameState, c: Character): number {
  return (c.evidence ?? 0) + s.heat.federal * 0.2 + s.heat.local * 0.12 + Math.min(10, (c.record ?? 0) * 2);
}

const CRAFT_CRIME: Record<string, string> = {
  muscle: 'assault and extortion', earner: 'receiving stolen goods', driver: 'interstate transport of stolen property',
  bookmaker: 'bookmaking and conspiracy', collector: 'extortionate collection of credit', burglar: 'breaking and entering', talker: 'conspiracy',
};

function crimeOf(s: GameState, c: Character): string {
  const F = ensureFeds(s);
  const last = [...F.log].reverse().find((x) => x.id === c.id && !x.why.startsWith('wire'));
  if (last) return last.why;
  return CRAFT_CRIME[c.craft ?? 'talker'] ?? 'conspiracy';
}

function yearsFor(c: Character, crime: string): number {
  const ev = c.evidence ?? 0;
  let y = 2 + Math.round(ev / 11);
  if (/hit|murder|killing/.test(crime)) y += 8;
  if (/hijack|interstate|guns|dope|narcotic/.test(crime)) y += 2;
  return clamp(y, 2, 25);
}

function canPinch(s: GameState, c: Character, F: FedsState): boolean {
  return mine(s, c) && isFree(s, c) && c.informantFor !== 'law' && F.brasco?.id !== c.id && !F.pinches.some((p) => p.charId === c.id && p.stage !== 'done');
}

/** Start a pinch: the knock is put on the clock (a real day and hour). */
export function startPinch(s: GameState, c: Character, why?: string, atTurn = true, wave = false): Pinch {
  const F = ensureFeds(s);
  const crime = why ?? crimeOf(s, c);
  const serious = (c.evidence ?? 0) >= SERIOUS || /hit|murder/.test(crime) || wave;
  const p: Pinch = { id: fid(F, 'pn'), charId: c.id, crime, w: s.week, stage: 'coming', serious, years: serious ? yearsFor(c, crime) : 0, care: [], ...(wave ? { wave: 1 as const } : {}) };
  F.pinches.push(p);
  F.lastPinch = s.week;
  F.stats.pinches++;
  if (serious) F.stats.serious++;
  if (!wave) {
    const w = nextW(s, atTurn);
    const day = freeDay(s, w, atTurn ? 1 : Math.min(5, today(s) + 1), 5, F);
    const hour = [5, 6, 6, 7, 15, 22][Math.floor(fr(F) * 6)];
    put(s, 'feds_knock', w, day, hour, { pid: p.id });
  }
  return p;
}

/** Every week: who crosses the line (one at a time, spread out), and the rivals' men. */
function pinchWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  if (s.week - F.lastPinch >= PINCH_GAP) {
    const cands = crew(s).filter((c) => canPinch(s, c, F) && pinchScore(s, c) >= PINCH_LINE).sort((a, b) => pinchScore(s, b) - pinchScore(s, a));
    const c = cands[0];
    if (c && fr(F) < clamp(0.05 + (pinchScore(s, c) - PINCH_LINE) / 140, 0.05, 0.35)) startPinch(s, c);
  }
  // The rivals' men get picked up too (the papers).
  for (const r of s.rivals) {
    if (r.kind !== 'mob' || (r.exposure ?? 0) < 45) continue;
    if (fr(F) > 0.012 + ((r.exposure ?? 0) - 45) / 2500) continue;
    const men = Object.values(s.characters).filter((x) => x.alive && x.faction === r.id && x.id !== r.leaderId && x.rank !== 'civilian' && isFree(s, x));
    const m = men[Math.floor(fr(F) * men.length)];
    if (!m) continue;
    const years = 2 + Math.floor(fr(F) * 6);
    m.imprisonedUntil = s.week + years * 26;
    m.record = (m.record ?? 0) + 1;
    F.pinches.push({ id: fid(F, 'pn'), charId: m.id, crime: 'racketeering', w: s.week, stage: 'done', serious: true, years, care: [], rival: r.id as RivalId, outcome: 'stood' });
    F.stats.rivalPinches++;
    const line = `Federal agents picked up ${nm(m)} of ${r.name}: ${years} years if it sticks.`;
    ctx.log.push(line);
    chron(s, line);
    pressItem(s, { s: 'blotter', h: `${r.shortName.toUpperCase()} MAN ARRESTED`, b: line, p: 70 });
    break;
  }
}

function knockView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const F = s.feds;
  const p = F?.pinches.find((x) => x.id === it.payload.pid);
  const c = p ? s.characters[p.charId] : undefined;
  if (!p || p.stage !== 'coming' || !mine(s, c) || !isFree(s, c)) return undefined;
  const fed = s.heat.federal >= s.heat.local;
  const who = fed ? 'Two FBI agents and a U.S. Marshal' : 'Three county detectives';
  const what = p.serious ? `The charge: ${p.crime}. He is looking at ${p.years} years.` : `The charge: ${p.crime}. A small one: a good lawyer can make it go away.`;
  const can = (n: number) => (s.money >= n ? undefined : `Needs $${n.toLocaleString('en-US')}`);
  return {
    id: `sched:${it.id}`, title: `The knock: ${nm(c)}`, when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: false,
    text: `${who} at ${c!.firstName}'s door. ${c!.household?.wife ? `${c!.household.wife} in her robe on the stairs.` : 'The neighbors\' lights come on.'} ${what} His one phone call is to you.`,
    options: p.serious
      ? [
        { id: 'lindner', label: 'The best lawyer in Camden, tonight (−$2,500)', hint: 'Bail by morning; the family came through', odds: 0.8, blocked: can(2500) },
        { id: 'house', label: 'The house lawyer (−$800)', hint: 'He may make bail', odds: 0.45, blocked: can(800) },
        { id: 'nothing', label: 'Let him sit', hint: 'No bail. A long time to think in a cell', odds: 0 },
      ]
      : [
        { id: 'lindner', label: 'The best lawyer in Camden (−$2,500)', hint: 'The charge likely goes away', odds: 0.8, blocked: can(2500) },
        { id: 'house', label: 'The house lawyer (−$800)', hint: 'It may go away', odds: 0.5, blocked: can(800) },
        { id: 'nothing', label: 'Let him handle it', hint: 'A public defender', odds: 0.15 },
      ],
    def: s.money >= 800 ? 'house' : 'nothing',
  };
}

/** A moment answered: the common frame (clone, apply, the card, Your File). */
function moment(
  input: GameState, it: ScheduledItem, opt: string, title: string,
  run: (ctx: Ctx, F: FedsState) => { line: string; chance?: number; ok: boolean; crit?: boolean; leads?: string[]; who?: string; extra?: { h: string; b: string }; people?: string[] },
): { state: GameState; result: NowResult; extra?: { h: string; b: string } } {
  const s = structuredClone(input) as GameState;
  const F = ensureFeds(s);
  const ctx = newCtx(s);
  const before = { money: s.money, respect: s.respect, heat: { ...s.heat } };
  const r = run(ctx, F);
  const changes: string[] = [];
  const sg = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;
  if (s.money !== before.money) changes.push(`Money ${s.money > before.money ? '+' : '−'}$${Math.abs(s.money - before.money).toLocaleString('en-US')}`);
  if (s.respect !== before.respect) changes.push(`Respect ${sg(s.respect - before.respect)}`);
  for (const k of ['local', 'family', 'federal'] as const) if (s.heat[k] !== before.heat[k]) changes.push(`${k[0].toUpperCase()}${k.slice(1)} heat ${sg(s.heat[k] - before.heat[k])}`);
  const when = `${DAY_NAMES[it.d]}, ${hourText(it.h)}`;
  journal(s, {
    d: today(s), tm: hourText(it.h), c: 'law', t: `${when}: ${title}`, r: [`You chose: ${opt}.`, r.line, ...ctx.log].slice(0, 8),
    m: s.money - before.money, st: { respect: s.respect - before.respect, local: s.heat.local - before.heat.local, family: s.heat.family - before.heat.family, federal: s.heat.federal - before.heat.federal },
    src: 'feds', mine: 1, ...(r.people?.length ? { p: r.people } : {}),
  });
  const roll = r.chance !== undefined ? Math.floor(fr(F) * 100) : undefined;
  return {
    state: s,
    ...(r.extra ? { extra: r.extra } : {}),
    result: {
      ok: true, title: `${when}: ${title}`, ...(r.who ? { who: r.who } : {}), ...(r.chance !== undefined ? { chance: r.chance, roll } : {}),
      tier: r.ok ? (r.crit ? 'crit' : 'success') : 'fail', headline: r.chance !== undefined ? `${pc(r.chance)} — ${r.ok ? 'it went your way' : 'it did not'}` : r.ok ? 'Done' : 'It went wrong',
      line: r.line, changes, leadsTo: r.leads ?? [],
    },
  };
}

function knockAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'The knock', (ctx, F) => {
    const s = ctx.s;
    const p = F.pinches.find((x) => x.id === it.payload.pid)!;
    const c = s.characters[p.charId];
    const v = knockView(input, it);
    const o = v?.options.find((x) => x.id === opt && !x.blocked) ?? v?.options.find((x) => x.id === 'nothing')!;
    const id = o?.id ?? 'nothing';
    const cost = id === 'lindner' ? 2500 : id === 'house' ? 800 : 0;
    if (cost) applyEffects(ctx, [{ type: 'money', amount: -cost, category: 'cost' }], { label: `A lawyer for ${c.firstName}`, because: `got ${c.firstName} a lawyer`, category: 'cost' });
    if (cost) p.care.push('lawyer');
    const odds = o?.odds ?? 0;
    const ok = fr(F) < odds;
    c.record = (c.record ?? 0) + 1;
    if (!p.serious) {
      if (ok) {
        p.stage = 'done';
        p.outcome = 'dropped';
        F.stats.dropped++;
        c.evidence = Math.max(0, (c.evidence ?? 0) - 10);
        addStory(s, c, `Picked up for ${p.crime}; the charge went away.`);
        addOpinion(s, c.id, s.playerId, cost ? 'The boss got me a lawyer the same night' : 'Beat a charge', cost ? 6 : 2, 1);
        chron(s, `${nm(c)} was picked up for ${p.crime}. By noon the charge was gone.`);
        return { line: `${c.firstName} was home by lunch. The charge went away.`, chance: odds, ok: true, who: nm(c), people: [c.id] };
      }
      const wk = 4 + Math.floor(fr(F) * 8);
      p.stage = 'done';
      p.outcome = 'stood';
      c.imprisonedUntil = s.week + wk;
      for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
      addStory(s, c, `Did ${wk} weeks in the county jail for ${p.crime}.`);
      if (!cost) addOpinion(s, c.id, s.playerId, 'Left me to a public defender', -5, 1);
      chron(s, `${nm(c)} got ${wk} weeks in the county jail for ${p.crime}.`);
      return { line: `The judge gave ${c.firstName} ${wk} weeks in the county jail. Small time.`, chance: odds, ok: false, who: nm(c), people: [c.id] };
    }
    // Serious: years. Bail or a cell; the government will come to him with an offer.
    p.stage = 'held';
    p.decide = s.week + DECIDE_WEEKS;
    if (ok) { p.care.push('bail'); c.imprisonedUntil = undefined; } else {
      c.imprisonedUntil = s.week + DECIDE_WEEKS + 1;
      for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
    }
    addStory(s, c, `Arrested for ${p.crime}: facing ${p.years} years.`);
    if (!cost) addOpinion(s, c.id, s.playerId, 'Nobody came for me the night they took me', -8, 1);
    chron(s, `${nm(c)} was arrested for ${p.crime}. He is facing ${p.years} years.`);
    // The visiting room: next week, in visiting hours (one moment, a different day).
    const w = s.week + 1;
    put(s, 'feds_visit', w, freeDay(s, w, 1, 4, F), 14, { pid: p.id });
    return {
      line: ok ? `${c.firstName} made bail. He is home, facing ${p.years} years — and the government will come to him with an offer.` : `No bail. ${c.firstName} is in a cell, facing ${p.years} years. The agents will come with coffee and an offer.`,
      chance: odds, ok, who: nm(c), people: [c.id], leads: ['Visiting hours next week: what the family does for him matters'],
      extra: { h: `${c.lastName.toUpperCase()} HELD IN ${/hit|murder/.test(p.crime) ? 'SLAYING' : 'RACKETS CASE'}`, b: `${nm(c)} was arrested at ${hourText(it.h)} and charged with ${p.crime}. Prosecutors say he faces ${p.years} years.` },
    };
  });
}

/* ------------------------------------------------------------------ */
/* 2. Will he flip?                                                     */
/* ------------------------------------------------------------------ */

const CARE: Record<string, { label: string; value: number }> = {
  lawyer: { label: 'The family sent a lawyer', value: -0.05 },
  bail: { label: 'The family made his bail', value: -0.06 },
  envelope: { label: 'An envelope for his wife every Friday', value: -0.12 },
  visit: { label: 'The boss came to see him himself', value: -0.1 },
  capo: { label: 'His capo sat with him', value: -0.06 },
  word: { label: 'Word got in: the family is with him', value: -0.07 },
  speed: { label: 'A faster trial (less time to think)', value: -0.06 },
};

/** The odds a pinched man takes the government's offer, with every reason (shown to the boss). */
export function flipReasons(s: GameState, p: Pick<Pinch, 'charId' | 'years' | 'care'>, extra: string[] = []): { label: string; value: number }[] {
  const c = s.characters[p.charId];
  if (!c) return [];
  const out = npcFlipReasons(s, c, c.evidence ?? 0, false).filter((r) => !r.label.startsWith('Already talking'));
  out.push({ label: `Facing ${p.years} years`, value: Math.max(-0.02, (p.years - 4) * 0.012) });
  if (c.rank === 'associate') out.push({ label: 'Not made: no oath to break', value: 0.06 });
  else if (c.rank !== 'civilian') out.push({ label: 'A made man: he took the oath', value: -0.08 });
  const g = grievanceLoad(s, c);
  if (g > 0) out.push({ label: 'Grievances against the boss', value: Math.min(0.15, g * 0.02) });
  const care = [...new Set([...p.care, ...extra])];
  for (const k of care) if (CARE[k]) out.push(CARE[k]);
  if (!care.length) out.push({ label: 'Nobody from the family has come', value: 0.08 });
  return out;
}

export function flipOdds(s: GameState, p: Pick<Pinch, 'charId' | 'years' | 'care'>, extra: string[] = []): number {
  return sumP(flipReasons(s, p, extra), 0.02, 0.85);
}

function visitView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const F = s.feds;
  const p = F?.pinches.find((x) => x.id === it.payload.pid);
  const c = p ? s.characters[p.charId] : undefined;
  if (!p || p.stage !== 'held' || !mine(s, c)) return undefined;
  const now = flipOdds(s, p);
  const after = (k: string) => 1 - flipOdds(s, p, [k]);
  const k = capoOf(s, c!);
  const signs: string[] = [];
  if (now >= 0.2) signs.push(`${c!.household?.wife ?? 'His wife'} has stopped coming to Sunday dinner.`);
  if (now >= 0.3) signs.push('The agents have been to see him twice; the second time they stayed an hour.');
  if (now >= 0.45) signs.push('His lawyer says he asked how long "cooperation" takes.');
  if (!signs.length) signs.push('He sends word he is fine. He sends it twice.');
  const can = (n: number) => (s.money >= n ? undefined : `Needs $${n.toLocaleString('en-US')}`);
  const clipOdds = clamp(0.45 + (s.respect - 50) / 300, 0.25, 0.7);
  return {
    id: `sched:${it.id}`, title: `Visiting hours: ${nm(c)}`, when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: true,
    text: `${c!.firstName} is facing ${p.years} years for ${p.crime}. ${signs.join(' ')} The odds he takes their deal: ${pc(now)}. (Each answer shows the odds he holds.)`,
    options: [
      { id: 'envelope', label: 'An envelope for his wife every Friday (−$1,200)', hint: `He holds: ${pc(after('envelope'))}`, odds: after('envelope'), blocked: can(1200) },
      { id: 'visit', label: 'Go see him yourself', hint: `He holds: ${pc(after('visit'))}. You are seen at the jail`, odds: after('visit') },
      ...(k && k.id !== c!.id && isFree(s, k) ? [{ id: 'capo', label: `Send ${k.firstName} to sit with him`, hint: `He holds: ${pc(after('capo'))}`, odds: after('capo') }] : []),
      { id: 'word', label: 'Get word in through a guard (−$500)', hint: `He holds: ${pc(after('word'))}, if the guard delivers`, odds: after('word'), blocked: can(500) },
      { id: 'speed', label: 'Move his trial up: a judge owes a favor (−$3,000)', hint: `He holds: ${pc(after('speed'))}, if the judge moves it`, odds: after('speed'), blocked: can(3000) },
      { id: 'trust', label: 'Trust him', hint: `He holds: ${pc(1 - now)}`, odds: 1 - now },
      { id: 'clip', label: 'Have him killed before he talks', hint: `${pc(clipOdds)} it is done inside; your own explicit order. If it fails, he talks for sure`, odds: clipOdds },
    ],
    def: 'trust',
  };
}

function visitAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'Visiting hours', (ctx, F) => {
    const s = ctx.s;
    const p = F.pinches.find((x) => x.id === it.payload.pid)!;
    const c = s.characters[p.charId];
    const v = visitView(input, it);
    const o = v?.options.find((x) => x.id === opt && !x.blocked) ?? v?.options.find((x) => x.id === 'trust')!;
    const id = o?.id ?? 'trust';
    const label = `Visiting hours: ${c.firstName}`;
    const before = flipOdds(s, p);
    if (before >= 0.25 && !p.scare) { p.scare = 1; F.stats.scares++; }
    if (id === 'clip') {
      const odds = o.odds;
      const ok = fr(F) < odds;
      if (ok) {
        p.stage = 'done';
        p.outcome = 'clipped';
        F.stats.clipped++;
        applyEffects(ctx, [
          { type: 'kill', charId: c.id, cause: 'killed in the county jail before he could testify', killer: 'player' },
          { type: 'heat', bar: 'local', amount: 10 }, { type: 'heat', bar: 'federal', amount: 8 },
          { type: 'evidence', charId: s.playerId, amount: 6 },
          { type: 'crewOpinion', amount: -4, reason: `${c.firstName} was killed inside on the boss's word`, traitMods: { 'Loyal-to-a-fault': -6, Cruel: 3 } },
        ], { label, because: `had ${c.firstName} killed before he could talk`, category: 'event' });
        for (const m of crew(s)) { const r = getRelation(s, m.id, s.playerId); if (r) r.fear = Math.min(100, (r.fear ?? 0) + 6); }
        return { line: `${c.firstName} was found in the shower block. Nobody saw anything. Every man in the family knows why.`, chance: odds, ok: true, who: nm(c), people: [c.id], extra: { h: 'INMATE SLAIN IN COUNTY JAIL', b: `${nm(c)}, awaiting trial on federal charges, was found dead in the county jail.` } };
      }
      // It failed: he knows. He goes to them tonight.
      applyEffects(ctx, [{ type: 'evidence', charId: s.playerId, amount: 10 }, { type: 'heat', bar: 'federal', amount: 6 }], { label, because: `tried to have ${c.firstName} killed`, category: 'event' });
      flipNow(ctx, F, p, true);
      return { line: `The man you sent missed his chance. ${c.firstName} asked for the agents by name that night: he is a government witness now.`, chance: odds, ok: false, who: nm(c), people: [c.id] };
    }
    const cost = id === 'envelope' ? 1200 : id === 'word' ? 500 : id === 'speed' ? 3000 : 0;
    if (cost) applyEffects(ctx, [{ type: 'money', amount: -cost, category: 'cost' }], { label, because: `took care of ${c.firstName}`, category: 'cost' });
    // Each answer has its own chance to land as meant (the guard pockets it, the judge says no).
    const lands = id === 'word' ? 0.7 : id === 'speed' ? 0.55 : id === 'capo' ? clamp(0.6 + opinion(s, c.id, capoOf(s, c)?.id ?? '') / 200, 0.3, 0.95) : id === 'trust' ? 1 : 0.95;
    const ok = fr(F) < lands;
    if (ok && id !== 'trust') p.care.push(id);
    if (id === 'visit') applyEffects(ctx, [{ type: 'heat', bar: 'federal', amount: 2 }, { type: 'evidence', charId: s.playerId, amount: 2 }, { type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: 'The boss came to see me inside', decay: 1 }], { label, because: `went to see ${c.firstName} in jail`, category: 'event' });
    if (id === 'envelope' && ok) addOpinion(s, c.id, s.playerId, 'The boss is taking care of my family', 10, 1);
    if (id === 'speed' && ok) p.decide = Math.max(s.week + 1, (p.decide ?? s.week) - 1);
    const holds = 1 - flipOdds(s, p);
    const line = !ok ? (id === 'word' ? 'The guard took the money and never said a word to him.' : id === 'speed' ? 'The judge would not move the date.' : `${capoOf(s, c)?.firstName ?? 'His capo'} came back and said nothing. It did not go well.`)
      : id === 'trust' ? `You leave it to him. The odds he holds: ${pc(holds)}.` : `It reached him. The odds he holds now: ${pc(holds)}.`;
    return { line, chance: id === 'trust' ? undefined : lands, ok, who: nm(c), people: [c.id], leads: [`The government decides about ${c.firstName} in ${Math.max(1, (p.decide ?? s.week) - s.week)} weeks`] };
  });
}

/** He takes the deal. Open: a witness against the family. Quiet: he comes back out wearing a wire. */
function flipNow(ctx: Ctx, F: FedsState, p: Pinch, open: boolean): void {
  const s = ctx.s;
  const c = s.characters[p.charId];
  p.stage = 'done';
  p.outcome = 'flipped';
  F.stats.flips++;
  if (open) {
    applyEffects(ctx, [{ type: 'flip', charId: c.id }], { label: `${c.firstName} took the deal`, because: `${c.firstName} took the government's deal`, category: 'event' });
    return;
  }
  // The quiet kind: the charges are "continued" and he is back on the street, wired.
  c.informantFor = 'law';
  c.imprisonedUntil = undefined;
  addSecret(s, c, 'informant');
  addFedEvidence(s, s.playerId, 6, 'wire: what he told them the first night');
  addStory(s, c, 'The charges against him were continued. He was back on the street in weeks.');
  ctx.log.push(`The charges against ${nm(c)} were continued; he is back on the street. Charges like his do not usually go away.`);
  chron(s, `${nm(c)} is back on the street; his case was continued.`);
}

/** He stood up: years inside, and the family knows it. */
function standUp(ctx: Ctx, F: FedsState, p: Pinch): void {
  const s = ctx.s;
  const c = s.characters[p.charId];
  p.stage = 'done';
  p.outcome = 'stood';
  F.stats.stood++;
  // Game time compressed: a year in the game is the months he actually serves before parole.
  const serve = clamp(Math.round(p.years * 52 * 0.22), 20, 150);
  c.imprisonedUntil = s.week + serve;
  p.home = s.week + serve;
  c.evidence = Math.round((c.evidence ?? 0) * 0.3);
  for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
  const k = capoOf(s, c);
  applyEffects(ctx, [
    { type: 'respect', amount: 2 },
    { type: 'opinion', from: c.id, to: s.playerId, amount: 6, reason: 'I stood up and the family knows it', decay: 1 },
    { type: 'crewOpinion', amount: 2, reason: `${c.firstName} stood up` },
    { type: 'bones', op: { op: 'pinch', charId: c.id } },
    ...(k && k.id !== c.id ? [{ type: 'opinion', from: k.id, to: c.id, amount: 10, reason: 'Stood up like a man', decay: 1 } as Effect] : []),
  ], { label: `${c.firstName} stood up`, because: `${c.firstName} stood up`, category: 'event' });
  addStory(s, c, `Stood up: took ${p.years} years for ${p.crime} and never said a word.`);
  const line = `${nm(c)} stood up. He took the plea and ${p.years} years for ${p.crime}, and never said a word about anybody.`;
  ctx.log.push(line);
  chron(s, line);
}

function decideWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  for (const p of F.pinches) {
    if (p.stage !== 'held' || p.rival || (p.decide ?? 0) > s.week) continue;
    const c = s.characters[p.charId];
    if (!mine(s, c)) { p.stage = 'done'; p.outcome = 'gone'; continue; }
    const odds = flipOdds(s, p);
    if (odds >= 0.25 && !p.scare) { p.scare = 1; F.stats.scares++; }
    if (fr(F) < odds) flipNow(ctx, F, p, !!p.wave || c.rank === 'capo' && fr(F) < 0.3);
    else standUp(ctx, F, p);
  }
}

/* ------------------------------------------------------------------ */
/* Loyalty pays: the homecoming                                          */
/* ------------------------------------------------------------------ */

export function buildHomecoming(s: GameState, c: Character, p: Pinch): EventInstance {
  const label = `${c.firstName} comes home`;
  const freeDistrict = s.districts.find((d) => !d.capoId || !s.characters[d.capoId]?.alive);
  const promo: Effect[] = c.rank === 'associate'
    ? [{ type: 'propose', charId: c.id, voucherId: s.playerId, label }]
    : c.rank === 'soldier' && freeDistrict
      ? [{ type: 'rank', charId: c.id, rank: 'capo', district: freeDistrict.id, label }]
      : [{ type: 'wealth', charId: c.id, amount: 4000, label }, { type: 'money', amount: -4000, label }];
  const promoText = c.rank === 'associate' ? 'and his name goes to Philadelphia for the books' : c.rank === 'soldier' && freeDistrict ? `and a crew of his own in ${freeDistrict.name}` : 'and a piece of the vending route ($4,000)';
  return {
    iid: `ev${s.nextId++}`, defId: 'feds_homecoming', week: s.week, mandatory: false, priority: 72, actors: [c.id],
    meta: { crew: 1, charId: c.id, feds: 1 },
    title: `${c.firstName} comes home`,
    text: `${nm(c)} walks out of the gate after doing his time for ${p.crime}. ${p.years} years on the sheet and not one word to anybody. The whole family is watching what the boss does now.`,
    defaultChoiceId: 'party',
    choices: [
      { id: 'party', label: `A dinner in his honor, ${promoText}`, detail: 'Loyalty pays, and everybody sees it.', because: `honored ${c.firstName} for standing up`,
        effects: [...promo, { type: 'respect', amount: 3, label }, { type: 'crewOpinion', amount: 4, reason: `${c.firstName} stood up and the boss took care of him`, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 20, reason: 'The boss took care of me when I came home', decay: 0, label }, { type: 'story', charId: c.id, text: 'Came home to a dinner in his honor.', label }] },
      { id: 'envelope', label: 'A fat envelope ($3,000) and a week at the shore', detail: 'Quiet, generous.', because: `gave ${c.firstName} an envelope`, disabledReason: s.money < 3000 ? 'Needs $3,000' : undefined,
        effects: [{ type: 'money', amount: -3000, label }, { type: 'wealth', charId: c.id, amount: 3000, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 10, reason: 'An envelope when I came home', decay: 1, label }, { type: 'crewOpinion', amount: 1, reason: `${c.firstName} came home`, label }] },
      { id: 'handshake', label: 'A handshake. Back to work', detail: 'Men do their time. Nobody gets a parade.', because: `gave ${c.firstName} a handshake`,
        effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -10, reason: 'Did my time and got a handshake', decay: 1, label }, { type: 'crewOpinion', amount: -2, reason: 'A stand-up guy got a handshake', label }] },
    ],
  };
}

function homeWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  for (const p of F.pinches) {
    if (p.outcome !== 'stood' || !p.home || p.home > s.week + 1 || p.rival) continue;
    const c = s.characters[p.charId];
    p.outcome = 'home';
    if (!mine(s, c)) continue;
    c.imprisonedUntil = undefined;
    F.stats.homecomings++;
    if (p.serious) s.eventQueue.push(buildHomecoming(s, c, p));
    chron(s, `${nm(c)} came home after doing his time. He never said a word.`, 'misc');
  }
  F.pinches = F.pinches.filter((p) => p.stage !== 'done' || s.week - p.w < 260 || (p.outcome === 'stood' && (p.home ?? 0) > s.week)).slice(-40);
}

/* ------------------------------------------------------------------ */
/* The man with the wire: he pushes the boss to talk; the waves         */
/* ------------------------------------------------------------------ */

function wireWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  const rats = informantsAround(s).filter((c) => isFree(s, c) && F.brasco?.id !== c.id);
  for (const c of rats) {
    addFedEvidence(s, s.playerId, 0.8, `wire: ${c.firstName} ${c.lastName}`);
    const k = capoOf(s, c);
    if (k && k.id !== c.id) addFedEvidence(s, k.id, 1, `wire: ${c.firstName} ${c.lastName}`);
    F.wire = Math.min(200, F.wire + 1.5);
  }
  // He pushes the boss to talk (a meeting at an hour); one at a time, a few weeks apart.
  const pending = scheduled(s).some((x) => x.kind === 'feds_push');
  if (!pending && rats.length && fr(F) < 0.2) {
    const c = rats[Math.floor(fr(F) * rats.length)];
    const w = nextW(s, true);
    put(s, 'feds_push', w, freeDay(s, w, 1, 5, F), 21, { cid: c.id });
  }
  // The tapes pile up into an indictment wave (a day: the dawn raids).
  if (F.wire >= WAVE_AT && !scheduled(s).some((x) => x.kind === 'feds_wave')) {
    const w = nextW(s, true);
    put(s, 'feds_wave', w, freeDay(s, w, 1, 3, F), 6, { why: 'wire' });
  }
}

const PUSH_TOPICS = ['the truck that went missing on Route 9', 'the envelope from the councilman', 'what happened to the fella from Atlantic City', 'the bookmaker who stopped paying', 'the cigarette loads'];

function pushView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const c = s.characters[String(it.payload.cid)];
  if (!mine(s, c) || !isFree(s, c)) return undefined;
  const topic = PUSH_TOPICS[(c.id.length + it.w) % PUSH_TOPICS.length];
  const pat = clamp(0.3 + (hasTrait(player(s), 'Paranoid') ? 0.2 : 0) + (hasTrait(c, 'Cowardly') ? 0.1 : 0), 0.1, 0.75);
  return {
    id: `sched:${it.id}`, title: `${c!.firstName} wants to talk`, when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: false,
    text: `${nm(c)} asks for a sit-down at the Shamrock, the back booth. He has a deal to bring you, he says — and he keeps coming back to ${topic}. He wants to hear you say it. He has been asking a lot of questions lately.`,
    options: [
      { id: 'talk', label: 'Hear him out and talk business', hint: 'He brings a good deal (+$1,000). You say a lot', odds: 1 },
      { id: 'riddles', label: 'Walk and talk on the boardwalk; say nothing plain', hint: 'Nothing usable on anybody\'s tape, if you are careful', odds: 0.7 },
      { id: 'pat', label: 'Hug him hello, and feel for a wire', hint: 'If there is something under his shirt, you will know', odds: pat },
      { id: 'skip', label: 'Tell him you are busy', hint: 'He will ask again', odds: 1 },
    ],
    def: 'riddles',
  };
}

function pushAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'A sit-down at the Shamrock', (ctx, F) => {
    const s = ctx.s;
    const c = s.characters[String(it.payload.cid)];
    const v = pushView(input, it);
    const o = v?.options.find((x) => x.id === opt) ?? v?.options.find((x) => x.id === 'riddles')!;
    const id = o?.id ?? 'riddles';
    F.stats.pushes++;
    const wired = c.informantFor === 'law';
    const label = `${c.firstName} wants to talk`;
    if (id === 'talk') {
      applyEffects(ctx, [{ type: 'money', amount: 1000, category: 'street' }], { label, because: `talked business with ${c.firstName}`, category: 'street' });
      if (wired) addFedEvidence(s, s.playerId, 9, `wire: the boss on tape with ${c.firstName}`);
      return { line: `A good deal and a long talk. You said more than you meant to.`, ok: true, who: nm(c), people: [c.id] };
    }
    if (id === 'riddles') {
      const ok = fr(F) < o.odds;
      if (wired) addFedEvidence(s, s.playerId, ok ? 1 : 5, `wire: ${c.firstName} on the boardwalk`);
      return { line: ok ? 'You talked about the weather and the Phillies. He looked disappointed.' : 'You slipped once. A name, a number. He nodded too fast.', chance: o.odds, ok, who: nm(c), people: [c.id] };
    }
    if (id === 'pat') {
      const ok = fr(F) < o.odds;
      if (ok && wired) {
        const sec = s.secrets.find((x) => x.ownerId === c.id && x.kind === 'informant');
        if (sec && !sec.knownBy.includes('player')) sec.knownBy.push('player');
        s.eventQueue.push(buildPlantFound(s, c));
        return { line: `Under his shirt, against his back: tape and a wire. ${c.firstName} goes white. What happens to him now is your call.`, chance: o.odds, ok: true, crit: true, who: nm(c), people: [c.id], leads: ['What to do about him is on your desk'] };
      }
      if (wired) addFedEvidence(s, s.playerId, 3, `wire: ${c.firstName}`);
      addOpinion(s, c.id, s.playerId, 'The boss frisked me like a stranger', -4, 1);
      return { line: ok ? 'Nothing under his shirt. He knows what you were doing, and he does not like it.' : 'You held him a second too long and felt nothing. He laughed. You did not.', chance: o.odds, ok: false, who: nm(c), people: [c.id] };
    }
    return { line: `${c.firstName} said he would come by next week.`, ok: true, who: nm(c), people: [c.id] };
  });
}

/** The government indicts: the men with the thickest files are picked up at dawn on the same day. */
function waveView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const F = s.feds;
  if (!F) return undefined;
  const can = (n: number) => (s.money >= n ? undefined : `Needs $${n.toLocaleString('en-US')}`);
  return {
    id: `sched:${it.id}`, title: 'Indictments', when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: false,
    text: `${it.payload.why === 'brasco' ? 'The man you knew as a jewel fence was a federal agent. Today the Bureau pulled him out, and ' : ''}A federal grand jury in Camden has handed up indictments. Agents are knocking on doors all over the island at once. Your phone will not stop ringing.`,
    options: [
      { id: 'lawyers', label: 'Every lawyer you know, on retainer, now (−$5,000)', hint: 'Each man\'s odds of making bail', odds: 0.65, blocked: can(5000) },
      { id: 'warn', label: 'Get word to whoever has not been picked up yet', hint: 'Some of them stay ahead of it', odds: 0.35 },
      { id: 'ride', label: 'Wait for the lawyers to call', hint: 'Nothing to roll', odds: 0 },
    ],
    def: s.money >= 5000 ? 'lawyers' : 'ride',
  };
}

function waveAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'Indictments', (ctx, F) => {
    const v = waveView(input, it);
    const o = v?.options.find((x) => x.id === opt && !x.blocked) ?? v?.options.find((x) => x.id === 'ride')!;
    if (o.id === 'lawyers') applyEffects(ctx, [{ type: 'money', amount: -5000, category: 'cost' }], { label: 'Indictments: the lawyers', because: 'put every lawyer on retainer', category: 'cost' });
    const r = indictmentWave(ctx, F, String(it.payload.why ?? 'wire'), o.id);
    return {
      line: r.text, chance: o.odds || undefined, ok: r.bailed > 0 || r.missed > 0, people: r.ids,
      extra: { h: `U.S. INDICTS ${r.n} IN WILDWOOD RACKETS`, b: r.text },
      leads: ['The men held will each weigh the government\'s offer', 'The case on you is thicker'],
    };
  });
}

/** The wave itself (also run quietly when nobody answers). */
export function indictmentWave(ctx: Ctx, F: FedsState, why: string, how = 'ride'): { n: number; bailed: number; missed: number; ids: string[]; text: string } {
  const s = ctx.s;
  F.stats.waves++;
  const take = why === 'brasco' ? (F.brasco?.take ?? 30) : F.wire;
  const n = clamp(2 + Math.floor(take / 30), 2, 5);
  const men = crew(s).filter((c) => isFree(s, c) && c.informantFor !== 'law' && F.brasco?.id !== c.id && !F.pinches.some((p) => p.charId === c.id && p.stage !== 'done'))
    .sort((a, b) => (b.evidence ?? 0) + (b.rank === 'capo' ? 15 : 0) - ((a.evidence ?? 0) + (a.rank === 'capo' ? 15 : 0))).slice(0, n);
  let bailed = 0;
  let missed = 0;
  const ids: string[] = [];
  let first: Pinch | undefined;
  for (const c of men) {
    if (how === 'warn' && fr(F) < 0.35) { missed++; addStory(s, c, 'Stayed a step ahead of the indictment wave.'); continue; }
    addFedEvidence(s, c.id, 12, 'the grand jury');
    const p = startPinch(s, c, 'racketeering conspiracy', false, true);
    p.stage = 'held';
    p.decide = s.week + DECIDE_WEEKS + 1;
    if (how === 'lawyers') p.care.push('lawyer');
    if (how === 'lawyers' && fr(F) < 0.65) { p.care.push('bail'); bailed++; } else {
      c.imprisonedUntil = s.week + DECIDE_WEEKS + 2;
      for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
    }
    c.record = (c.record ?? 0) + 1;
    addStory(s, c, `Indicted for racketeering conspiracy: facing ${p.years} years.`);
    ids.push(c.id);
    first ??= p;
  }
  // The visiting room for the one most likely to talk (one moment, not one per man).
  const worst = F.pinches.filter((p) => ids.includes(p.charId) && p.stage === 'held').sort((a, b) => flipOdds(s, b) - flipOdds(s, a))[0];
  if (worst) put(s, 'feds_visit', s.week + 1, freeDay(s, s.week + 1, 1, 4, F), 14, { pid: worst.id });
  addFedEvidence(s, s.playerId, why === 'brasco' ? 22 : 14, 'the grand jury');
  applyEffects(ctx, [{ type: 'heat', bar: 'federal', amount: 8 }, { type: 'respect', amount: -3 }], { label: 'Indictments', because: 'the government indicted your people', category: 'event' });
  // The wired man is pulled out: a witness now, in the open.
  if (why === 'wire') {
    for (const c of informantsAround(s).filter((x) => F.brasco?.id !== x.id)) applyEffects(ctx, [{ type: 'flip', charId: c.id }], { label: 'Indictments', because: `${c.firstName} wore a wire`, category: 'event' });
    F.wire = 0;
  }
  const names = ids.map((id) => nm(s.characters[id])).join(', ');
  const text = `${ids.length ? `Indicted and picked up: ${names}.` : 'Nobody was home when they knocked.'}${bailed ? ` ${bailed} made bail by night.` : ''}${missed ? ` ${missed} got the word and stayed ahead of it.` : ''}`;
  chron(s, `Federal indictments came down on the family: ${ids.length} men picked up.`);
  ctx.log.push(text);
  return { n: ids.length, bailed, missed, ids, text };
}

/* ------------------------------------------------------------------ */
/* 3. The boss's deal (from the arraignment: trial.ts)                   */
/* ------------------------------------------------------------------ */

/** The boss took the deal: record it (he can never do it again). The witness and heir paths are trial.bossTurns. */
export function bossCooperates(ctx: Ctx, path: 'witness' | 'heir' | 'informant'): void {
  const s = ctx.s;
  const F = ensureFeds(s);
  if (F.flippers.includes(s.playerId)) return;
  F.flippers.push(s.playerId);
  F.boss = { id: s.playerId, w: s.week, path };
  F.stats.bossFlips++;
  if (path !== 'informant') return;
  // The secret: the case goes quiet, and he keeps the chair. The Bureau wants names every month.
  const b = player(s);
  b.evidence = Math.min(b.evidence ?? 0, 10);
  b.imprisonedUntil = undefined;
  if (s.legal) Object.assign(s.legal, { stage: 'quiet', defense: 0, since: s.week, next: undefined, bail: undefined });
  F.boss.exposure = 8;
  F.boss.next = s.week + 4;
  F.boss.given = 0;
  F.boss.missed = 0;
  applyEffects(ctx, [{ type: 'heat', bar: 'federal', amount: -12 }], { label: 'The deal', because: 'made a deal with the government', category: 'event' });
  ctx.log.push('The charges against you were dismissed "in the interest of justice." Only you and two men in Newark know why.');
  chron(s, `The federal case against ${nm(b)} was dismissed.`);
}

function handlerWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  const B = F.boss;
  if (!B || B.path !== 'informant' || B.burned || B.w === s.week) return;
  if (B.id !== s.playerId) { B.burned = s.week; return; }
  // What it buys: his file shrinks, the Bureau looks the other way.
  const b = player(s);
  b.evidence = Math.max(0, (b.evidence ?? 0) - 2);
  if (s.heat.federal > 10) s.heat.federal = Math.max(10, s.heat.federal - 1);
  if ((B.next ?? 0) <= s.week + 1 && !scheduled(s).some((x) => x.kind === 'feds_handler')) {
    const w = nextW(s, true);
    put(s, 'feds_handler', w, freeDay(s, w, 1, 5, F), 23, {});
    B.next = s.week + 5;
  }
  // Every meet, every slip: somebody may put it together.
  const x = B.exposure ?? 0;
  if (x >= 55 && fr(F) < (x - 45) / 120 && !scheduled(s).some((y) => y.kind === 'feds_burned')) {
    const w = nextW(s, true);
    put(s, 'feds_burned', w, freeDay(s, w, 1, 5, F), 20, {});
  }
}

function handlerView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const B = s.feds?.boss;
  if (!B || B.path !== 'informant' || B.burned) return undefined;
  const own = crew(s).filter((c) => isFree(s, c) && c.informantFor !== 'law').sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId))[0];
  const rival = s.rivals.find((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  return {
    id: `sched:${it.id}`, title: 'Your handler wants names', when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: true,
    text: `A motel off Route 9, room 14, the curtains shut. Special Agent Halloran has a thermos and a legal pad. "Give us something this month." Every one of these meets is a risk (how close the family is to knowing: ${B.exposure ?? 0}/100).`,
    options: [
      ...(rival ? [{ id: 'rival', label: `Give them ${rival.shortName}'s business`, hint: 'They like it; somebody over there gets picked up', odds: 0.75 }] : []),
      ...(own ? [{ id: 'own', label: `Give them ${nm(own)}`, hint: 'Your own man: your explicit choice. He gets picked up', odds: 0.95 }] : []),
      { id: 'scraps', label: 'Give them scraps', hint: 'If they buy it, it costs nothing', odds: 0.45 },
      { id: 'skip', label: 'Do not show up', hint: 'They will lean on you', odds: 0 },
    ],
    def: 'scraps',
  };
}

function handlerAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'The handler', (ctx, F) => {
    const s = ctx.s;
    const B = F.boss!;
    const v = handlerView(input, it);
    const o = v?.options.find((x) => x.id === opt) ?? v?.options.find((x) => x.id === 'scraps')!;
    const seen = 2 + Math.floor(fr(F) * 5);
    B.exposure = clamp((B.exposure ?? 0) + (o.id === 'skip' ? 0 : seen), 0, 100);
    const ok = fr(F) < o.odds;
    if (o.id === 'rival') {
      const r = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
      if (r) { r.exposure = Math.min(100, (r.exposure ?? 0) + 20); }
      B.given = (B.given ?? 0) + 1;
      if (!ok) B.exposure = clamp(B.exposure + 6, 0, 100);
      return { line: ok ? `Halloran wrote it all down. ${r?.shortName ?? 'The other outfit'} will have a bad spring.` : 'He wanted more than that. He made you say it twice.', chance: o.odds, ok };
    }
    if (o.id === 'own') {
      const c = crew(s).filter((x) => isFree(s, x) && x.informantFor !== 'law').sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId))[0];
      if (c) { addFedEvidence(s, c.id, 30, 'what the boss told the Bureau'); startPinch(s, c, 'racketeering conspiracy', false); }
      B.given = (B.given ?? 0) + 2;
      return { line: `You gave them ${nm(c)}. You drove home the long way.`, chance: o.odds, ok: true, people: c ? [c.id] : [] };
    }
    if (o.id === 'scraps') {
      if (!ok) { addFedEvidence(s, s.playerId, 8, 'the handler leans'); B.exposure = clamp(B.exposure + 4, 0, 100); }
      return { line: ok ? 'Scraps, and he took them.' : '"You think we\'re stupid?" He put your old file on the bed where you could see it.', chance: o.odds, ok };
    }
    B.missed = (B.missed ?? 0) + 1;
    addFedEvidence(s, s.playerId, 6, 'the handler leans');
    if ((B.missed ?? 0) >= 3) B.exposure = clamp(B.exposure + 25, 0, 100);
    return { line: (B.missed ?? 0) >= 3 ? 'Three missed meets. Somebody at the Bureau let your name slip where the wrong people could hear it.' : 'You did not go. The next morning a gray Ford sat outside the bakery for an hour.', ok: false };
  });
}

function burnedView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const B = s.feds?.boss;
  if (!B || B.path !== 'informant' || B.burned) return undefined;
  const face = faceOdds(s);
  return {
    id: `sched:${it.id}`, title: 'They know', when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: true,
    text: 'Your underboss does not come to Sunday dinner. Two capos are at the Shamrock with men from Philadelphia, and the bartender turns the radio up when you walk in. Somebody has put it together: the boss is talking to the government.',
    options: [
      { id: 'face', label: 'Face them down at the Saturday table', hint: 'Deny everything, look every man in the eye', odds: face },
      { id: 'step', label: 'Step aside for the heir and disappear', hint: 'The house lives on under a cloud; you are a witness in hiding', odds: 1 },
      { id: 'run', label: 'Call Halloran: take witness protection tonight', hint: 'The end of the House in Wildwood', odds: 1 },
    ],
    def: 'face',
  };
}

function faceOdds(s: GameState): number {
  const ks = capos(s);
  const loyal = ks.length ? ks.filter((k) => opinion(s, k.id, s.playerId) >= 30).length / ks.length : 0;
  return clamp(0.2 + (s.respect - 50) / 250 + loyal * 0.35, 0.1, 0.7);
}

function burnedAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'They know', (ctx, F) => {
    const s = ctx.s;
    const B = F.boss!;
    B.burned = s.week;
    const b = player(s);
    if (opt === 'run') {
      bossTurnsHook(ctx, b, 'witness', [`${b.firstName} ${b.lastName} took the marshals' offer that night. The House of ${s.houseName} was finished in Wildwood; for years men from Philadelphia asked after his sons.`]);
      return { line: 'A motel in Pennsylvania, four marshals, a folder with a new name in it.', ok: true };
    }
    if (opt === 'step') {
      bossTurnsHook(ctx, b, 'heir');
      return { line: 'You are gone by morning. The heir sits in your chair under a cloud, and Philadelphia sends for him.', ok: true };
    }
    const odds = faceOdds(input);
    const ok = fr(F) < odds;
    if (ok) {
      applyEffects(ctx, [{ type: 'crewOpinion', amount: -12, reason: 'Talk that the boss is a rat' }, { type: 'heat', bar: 'family', amount: 15 }, { type: 'respect', amount: -6 }], { label: 'They know', because: 'faced down the talk', category: 'event' });
      B.exposure = 40;
      return { line: 'You stared them down. Nobody said the word out loud. Nobody believes you, either — but nobody is sure.', chance: odds, ok: true };
    }
    killCharacter(ctx, b.id, 'murdered by his own people: they found out he was talking to the government', 'none');
    return { line: 'They let you finish your coffee.', chance: odds, ok: false, extra: { h: 'REPUTED RACKETS BOSS SLAIN', b: `${nm(b)} was shot to death leaving a restaurant. Police say his own associates are suspected.` } };
  });
}

/** trial.bossTurns, registered by trial.ts (the two modules import each other). */
let bossTurnsHook: (ctx: Ctx, b: Character, path: 'heir' | 'witness', epi?: string[]) => void = () => undefined;
export function setBossTurns(f: typeof bossTurnsHook): void { bossTurnsHook = f; }

/* ------------------------------------------------------------------ */
/* 4. The hollow crown                                                   */
/* ------------------------------------------------------------------ */

/** What lines up against the boss (three or more and the capos start running the family without him). */
export function hollowFactors(s: GameState): { label: string; on: boolean }[] {
  const b = player(s);
  const ks = capos(s);
  const sore = ks.filter((k) => grievanceLoad(s, k) > 0 || opinion(s, k.id, s.playerId) < 0 || ['hedging', 'turning'].includes(bookOf(s, k.id)?.st ?? '')).length;
  const ub = crew(s).find((c) => c.rank === 'underboss' && isFree(s, c));
  const age = ageOn(b.birth, s.date);
  return [
    { label: `Respect is low (${Math.round(s.respect)})`, on: s.respect < 45 },
    { label: 'A war going badly', on: s.wars.some((w) => w.score <= -25) },
    { label: age >= 68 ? `The old man is ${age}` : b.health < 45 ? 'The boss is sick' : 'The boss is inside', on: age >= 68 || b.health < 45 || !isFree(s, b) },
    { label: `${sore} capos with grievances`, on: sore >= 2 },
    { label: ub ? `${ub.firstName}, the underboss, wants more` : 'An ambitious underboss', on: !!ub && (hasTrait(ub, 'Ambitious') || opinion(s, ub.id, s.playerId) < 0) && opinion(s, ub.id, s.playerId) < 20 },
  ];
}

/** How much of the family actually answers to him (0-100), capo by capo. */
export function answersToHim(s: GameState, won: string[] = []): number {
  const ks = capos(s).filter((k) => isFree(s, k));
  if (!ks.length) return 100;
  const st: Record<string, number> = { loyal: 1, steady: 0.8, hedging: 0.4, turning: 0.1 };
  let sum = 0;
  for (const k of ks) {
    if (won.includes(k.id)) { sum += 1; continue; }
    const op = clamp((opinion(s, k.id, s.playerId) + 40) / 80, 0, 1);
    sum += op * (st[bookOf(s, k.id)?.st ?? 'steady'] ?? 0.8);
  }
  return Math.round((sum / ks.length) * 100);
}

function hollowWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  const H = F.hollow;
  if (!H) {
    if (capos(s).length < 2 || s.week - (F.hollowEnd ?? -99) < 40) return;
    const n = hollowFactors(s).filter((f) => f.on).length;
    const p = HOLLOW_CHANCE[Math.min(5, n)] * (s.oldDon ? 1.5 : 1);
    if (!p || fr(F) > p) return;
    const lead = capos(s).filter((k) => isFree(s, k)).sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId))[0];
    F.hollow = { since: s.week, boss: s.playerId, meter: Math.min(60, answersToHim(s) - 10), won: [], next: s.week + 1, ...(lead ? { leadId: lead.id } : {}) };
    F.stats.hollow++;
    const line = `The capos have started meeting without you. ${lead ? `${nm(lead)} runs the table.` : ''} You still have the chair; you no longer have the family.`;
    ctx.log.push(line);
    chron(s, 'The capos began running the family without the boss: Don in name only.', 'misc');
    if (s.cutscenes.length < 3) s.cutscenes.push({ key: 'betrayal_confrontation', title: 'The hollow crown', text: 'The Saturday table, and your chair at the head of it. They wait for you to sit before they start. Then they talk to each other.', week: s.week });
    // The existing conspiracy chain, if it can be cast now.
    try { const ev = tryScene(s, 'plot_whispers'); if (ev) s.eventQueue.push(ev); } catch { /* no scene library outside the game */ }
    const w = nextW(s, true);
    put(s, 'feds_crown', w, freeDay(s, w, 1, 4, F), 18, {});
    F.hollow.next = s.week + 3;
    return;
  }
  // It ends on its own when the chair changes hands or he is gone.
  if (!player(s)?.alive || (H.boss && H.boss !== s.playerId)) return endHollow(ctx, F, 'succession');
  // They moved and it did not finish him (the coup failed or became a walk-out): the air clears a little.
  if (H.move && H.move < s.week && !s.scheduled.some((x) => x.key === 'coup')) { H.move = undefined; H.meter = clamp(H.meter + 12, 0, 100); }
  H.meter = clamp(Math.round(H.meter * 0.7 + answersToHim(s, H.won) * 0.3), 0, 100);
  if (H.meter >= 75) return endHollow(ctx, F, 'won');
  // The envelope shrinks: the capos keep more.
  const light = Math.round((100 - H.meter) * 12);
  if (light > 0) applyEffects(ctx, [{ type: 'money', amount: -light, category: 'street' }], { label: 'The envelopes came in light (the hollow crown)', because: 'the capos keep more while you hold the title', category: 'street' });
  // Meetings without him.
  if (fr(F) < 0.35) {
    const ks = capos(s).filter((k) => !H.won.includes(k.id));
    const k = ks[Math.floor(fr(F) * ks.length)];
    if (k) journal(s, { c: 'crew', t: `The capos met at ${['the Shamrock', 'a clam bar in Rio Grande', 'a motel in Cape May', 'the back of the bakery'][Math.floor(fr(F) * 4)]} without you`, x: `${nm(k)} was there. Nobody called you.`, src: 'feds', k: 'heard', p: [k.id] });
  }
  // The crisis meeting on the clock, every few weeks.
  if (H.next <= s.week + 1 && !scheduled(s).some((x) => x.kind === 'feds_crown')) {
    const w = nextW(s, true);
    put(s, 'feds_crown', w, freeDay(s, w, 1, 5, F), 18, {});
    H.next = s.week + 3 + Math.floor(fr(F) * 2);
  }
  // Too far gone: they set a date (the existing coup). The Feds may hear of it (the tip-off).
  if (H.meter < 25 && !H.move) {
    const f = ensureCoupFaction(s, H);
    if (f) {
      H.move = s.week + 3;
      s.scheduled.push({ id: `sc${s.nextId++}`, key: 'coup', dueWeek: H.move, because: 'let the capos run the family', sourceWeek: s.week, params: { faction: f.id } });
      ctx.log.push('Talk on the street: the capos have set a date.');
    }
  }
}

function ensureCoupFaction(s: GameState, H: { leadId?: string }): Faction | undefined {
  const ex = s.factions.find((f) => f.agenda === 'abdicate' || f.demand === 'abdicate' || f.demand === 'head');
  if (ex) return ex;
  const lead = H.leadId ? s.characters[H.leadId] : undefined;
  if (!lead?.alive || lead.faction !== 'player') return undefined;
  const others = capos(s).filter((k) => k.id !== lead.id && opinion(s, k.id, s.playerId) < 20).slice(0, 2);
  const f: Faction = { id: `f${s.nextId++}`, leaderId: lead.id, memberIds: [lead.id, ...others.map((k) => k.id)], demand: 'abdicate', agenda: 'abdicate', since: s.week, stage: 1, stageWeek: s.week, name: `${lead.lastName}'s table` };
  s.factions.push(f);
  return f;
}

function endHollow(ctx: Ctx, F: FedsState, how: string): void {
  const s = ctx.s;
  if (!F.hollow) return;
  F.hollow = undefined;
  F.hollowEnd = s.week;
  F.stats.hollowEnds[how] = (F.stats.hollowEnds[how] ?? 0) + 1;
  const line = how === 'won' ? 'The capos come to you again. The crown has weight in it.' : how === 'purge' ? 'The table is quiet now. Nobody meets without you.' : how === 'stepped' ? 'You stepped aside.' : 'The hollow crown passed with the chair.';
  ctx.log.push(line);
  chron(s, line, 'misc');
}

function crownView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const H = s.feds?.hollow;
  if (!H || !player(s)?.alive) return undefined;
  const ks = capos(s).filter((k) => isFree(s, k) && !H.won.includes(k.id));
  const target = [...ks].sort((a, b) => winOdds(s, b) - winOdds(s, a))[0];
  const lead = H.leadId ? s.characters[H.leadId] : undefined;
  const weak = [...ks].filter((k) => k.id !== lead?.id).sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId))[0];
  const why = hollowFactors(s).filter((f) => f.on).map((f) => f.label.toLowerCase()).join('; ');
  return {
    id: `sched:${it.id}`, title: `The hollow crown: ${H.meter}% of the family answers to you`, when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: true,
    text: `Your orders go out and come back undone. ${lead?.alive ? `${nm(lead)} holds the real table.` : ''} ${why ? `Why: ${why}.` : ''} ${H.move ? 'They have set a date.' : ''}`.trim(),
    options: [
      ...(target ? [{ id: 'win', label: `Win back ${nm(target)}: a sit-down and an envelope (−$2,500)`, hint: 'One capo at a time', odds: winOdds(s, target), blocked: s.money < 2500 ? 'Needs $2,500' : undefined }] : []),
      ...(weak ? [{ id: 'example', label: `Make an example of ${nm(weak)}: busted down in front of everyone`, hint: 'Nobody dies. Everybody watches', odds: exampleOdds(s) }] : []),
      ...(lead?.alive && lead.faction === 'player' ? [{ id: 'purge', label: `A purge: have ${nm(lead)} killed`, hint: 'Your explicit order. If it fails, they move on you', odds: purgeOdds(s) }] : []),
      { id: 'step', label: 'Step aside gracefully for your heir', hint: 'The succession: a quiet exit with honor', odds: 1 },
      { id: 'wait', label: 'Wait it out', hint: 'It may pass. It may not', odds: 0 },
    ],
    def: 'wait',
  };
}

function winOdds(s: GameState, k: Character): number {
  let p = 0.4 + opinion(s, k.id, s.playerId) / 200;
  if (hasTrait(k, 'Greedy')) p += 0.15;
  if (hasTrait(k, 'Loyal-to-a-fault')) p += 0.15;
  if (hasTrait(k, 'Ambitious')) p -= 0.1;
  if (grievanceLoad(s, k) > 0) p -= 0.1;
  return clamp(p, 0.1, 0.9);
}
function exampleOdds(s: GameState): number { return clamp(0.4 + (s.respect - 40) / 200 + (hasTrait(player(s), 'Cruel') ? 0.1 : 0), 0.15, 0.85); }
function purgeOdds(s: GameState): number {
  const ks = capos(s);
  const loyal = ks.length ? ks.filter((k) => opinion(s, k.id, s.playerId) >= 20).length / ks.length : 0;
  return clamp(0.35 + loyal * 0.35 + (s.respect - 50) / 400, 0.15, 0.8);
}

function crownAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'The hollow crown', (ctx, F) => {
    const s = ctx.s;
    const H = F.hollow!;
    const v = crownView(input, it);
    const o = v?.options.find((x) => x.id === opt && !x.blocked) ?? v?.options.find((x) => x.id === 'wait')!;
    const label = 'The hollow crown';
    const ks = capos(s).filter((k) => isFree(s, k) && !H.won.includes(k.id));
    const lead = H.leadId ? s.characters[H.leadId] : undefined;
    const ok = fr(F) < o.odds;
    if (o.id === 'win') {
      const k = [...ks].sort((a, b) => winOdds(s, b) - winOdds(s, a))[0];
      applyEffects(ctx, [{ type: 'money', amount: -2500 }], { label, because: `sat down with ${k.firstName}`, category: 'event' });
      if (ok) {
        H.won.push(k.id);
        H.meter = clamp(H.meter + 14, 0, 100);
        addOpinion(s, k.id, s.playerId, 'The boss came to me himself', 20, 1);
        const b = bookOf(s, k.id);
        if (b) b.st = 'steady';
        if (H.leadId === k.id) H.leadId = undefined;
        if (H.meter >= 75) endHollow(ctx, F, 'won');
        return { line: `${k.firstName} took the envelope and kissed your cheek. He is with you again.`, chance: o.odds, ok: true, who: nm(k), people: [k.id] };
      }
      H.meter = clamp(H.meter - 3, 0, 100);
      return { line: `${k.firstName} took the envelope and told the others about it.`, chance: o.odds, ok: false, who: nm(k), people: [k.id] };
    }
    if (o.id === 'example') {
      const k = [...ks].filter((x) => x.id !== lead?.id).sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId))[0];
      if (ok) {
        applyEffects(ctx, [{ type: 'opinion', from: k.id, to: s.playerId, amount: -30, reason: 'Humiliated me in front of the family', decay: 1 }, { type: 'respect', amount: 3 }], { label, because: `made an example of ${k.firstName}`, category: 'event' });
        for (const x of capos(s)) { const r = getRelation(s, x.id, s.playerId); if (r) r.fear = Math.min(100, (r.fear ?? 0) + 12); }
        H.meter = clamp(H.meter + 12, 0, 100);
        if (H.meter >= 75) endHollow(ctx, F, 'won');
        return { line: `You took ${k.firstName}'s envelope, counted it at the table, and handed it back short. Nobody spoke. Everybody understood.`, chance: o.odds, ok: true, who: nm(k), people: [k.id] };
      }
      applyEffects(ctx, [{ type: 'respect', amount: -3 }], { label, because: `tried to make an example of ${k.firstName}`, category: 'event' });
      H.meter = clamp(H.meter - 10, 0, 100);
      return { line: `${k.firstName} stood up from the table and walked out, and two of them followed him.`, chance: o.odds, ok: false, who: nm(k), people: [k.id] };
    }
    if (o.id === 'purge' && lead) {
      if (ok) {
        applyEffects(ctx, [
          { type: 'kill', charId: lead.id, cause: 'shot in his car on the boss\'s order', killer: 'player' },
          { type: 'heat', bar: 'local', amount: 10 }, { type: 'heat', bar: 'family', amount: 8 }, { type: 'respect', amount: 5 },
        ], { label, because: `had ${lead.firstName} killed`, category: 'event' });
        for (const x of capos(s)) { const r = getRelation(s, x.id, s.playerId); if (r) r.fear = Math.min(100, (r.fear ?? 0) + 20); }
        s.factions = s.factions.filter((f) => f.leaderId !== lead.id);
        s.scheduled = s.scheduled.filter((x) => !(x.key === 'coup' && !s.factions.some((f) => f.id === x.params.faction)));
        endHollow(ctx, F, 'purge');
        return { line: `${lead.firstName} was found in his Buick behind the Shamrock. The next Saturday, every capo was early.`, chance: o.odds, ok: true, who: nm(lead), people: [lead.id], extra: { h: 'MAN SLAIN IN PARKED CAR', b: `${nm(lead)} was found shot in his car. Police call it a gangland killing.` } };
      }
      // It failed: they move now.
      addOpinion(s, lead.id, s.playerId, 'Tried to have me killed', -60, 0);
      const f = ensureCoupFaction(s, H);
      if (f && !s.scheduled.some((x) => x.key === 'coup')) { H.move = s.week + 1; s.scheduled.push({ id: `sc${s.nextId++}`, key: 'coup', dueWeek: s.week + 1, because: `tried to have ${lead.firstName} killed`, sourceWeek: s.week, params: { faction: f.id } }); }
      return { line: `${lead.firstName} saw the car. He is not hiding: he is counting votes.`, chance: o.odds, ok: false, who: nm(lead), people: [lead.id], leads: ['They will move on you soon'] };
    }
    if (o.id === 'step') {
      applyEffects(ctx, [{ type: 'dyn', op: { op: 'abdicate' } }, { type: 'respect', amount: 4 }], { label, because: 'stepped aside gracefully', category: 'event' });
      endHollow(ctx, F, 'stepped');
      return { line: 'You stood at the head of the table and gave them your heir. It was the last order they all obeyed.', ok: true };
    }
    H.meter = clamp(H.meter - 5, 0, 100);
    return { line: `You waited. They did not. (${H.meter}% answers to you.)`, ok: false };
  });
}

/* ------------------------------------------------------------------ */
/* 5. The tip-off                                                        */
/* ------------------------------------------------------------------ */

/** How well the Bureau can hear what is planned against him (a wire, an informant, his own deal). */
export function bureauEars(s: GameState): number {
  const stage = s.threats?.fed.stage ?? 0;
  let p = stage * 0.12 + Math.min(0.3, informantsAround(s).length * 0.15) + (s.feds?.brasco && !s.feds.brasco.end ? 0.2 : 0);
  if (s.feds?.boss?.path === 'informant' && !s.feds.boss.burned) p += 0.45;
  return clamp(p, 0, 0.8);
}

function tipWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  const ears = bureauEars(s);
  if (ears <= 0) return;
  const dangers: { key: string; w: number; day: number; text: string }[] = [];
  for (const t of s.threats?.threats ?? []) {
    if (t.kind !== 'hit' || t.targetId !== s.playerId || F.tipped.includes(t.id) || t.due > s.week + 2) continue;
    dangers.push({ key: t.id, w: t.due, day: t.dueDay ?? 6, text: `${s.rivals.find((r) => r.id === t.by)?.name ?? 'Somebody'} has a contract out on you` });
  }
  for (const x of s.scheduled) {
    if (x.key !== 'coup' || F.tipped.includes(x.id) || x.dueWeek > s.week + 3) continue;
    dangers.push({ key: x.id, w: x.dueWeek, day: 0, text: 'some of your own people mean to kill you' });
  }
  for (const d of dangers) {
    F.tipped.push(d.key);
    if (F.tipped.length > 30) F.tipped = F.tipped.slice(-30);
    if (fr(F) > ears) continue;
    // Before it happens: the coming week, a day before the night it is planned for (a coup lands at a week's turn).
    const w = nextW(s, true);
    if (d.w === w && d.day <= 1) continue;
    const last = d.w === w ? d.day - 1 : 5;
    put(s, 'feds_tip', w, freeDay(s, w, 1, last, F), 7, { key: d.key, text: d.text });
    F.stats.tipoffs++;
    break;
  }
}

function tipView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const key = String(it.payload.key);
  const live = (s.threats?.threats ?? []).some((t) => t.id === key) || s.scheduled.some((x) => x.id === key);
  if (!live) return undefined;
  const find = clamp(0.5 + (hasTrait(player(s), 'Paranoid') ? 0.1 : 0) + (hasTrait(player(s), 'Patient') ? 0.05 : 0), 0.2, 0.8);
  return {
    id: `sched:${it.id}`, title: 'Two men in a gray Ford', when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: false,
    text: `Outside the bakery on Pacific. The younger one shows a badge under the newspaper. "We have reason to believe your life is in danger." ${String(it.payload.text)}. They will not say how they know. They do not need to: a wire, or somebody wearing one. Being seen with them is its own danger.`,
    options: [
      { id: 'take', label: 'Take the warning (and owe them one)', hint: 'You change your habits. 75% nobody sees you with them', odds: 0.75 },
      { id: 'find', label: 'Use it: find out who', hint: 'Turn the warning into names', odds: find },
      { id: 'laugh', label: 'Laugh it off', hint: '"Fellas, I sell linen." Nothing changes', odds: 1 },
    ],
    def: 'take',
  };
}

function tipAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'The tip-off', (ctx, F) => {
    const s = ctx.s;
    const key = String(it.payload.key);
    const t = s.threats?.threats.find((x) => x.id === key);
    const coup = s.scheduled.find((x) => x.id === key);
    const v = tipView(input, it);
    const o = v?.options.find((x) => x.id === opt) ?? v?.options.find((x) => x.id === 'take')!;
    const ok = fr(F) < o.odds;
    const seen = () => {
      applyEffects(ctx, [{ type: 'heat', bar: 'family', amount: 8 }, { type: 'crewOpinion', amount: -4, reason: 'The boss was seen talking to FBI agents' }], { label: 'Seen with agents', because: 'was seen with FBI agents', category: 'event' });
      if (F.boss?.path === 'informant') F.boss.exposure = clamp((F.boss.exposure ?? 0) + 12, 0, 100);
    };
    if (o.id === 'laugh') {
      applyEffects(ctx, [{ type: 'respect', amount: 1 }], { label: 'The tip-off', because: 'laughed off the FBI', category: 'event' });
      return { line: 'They drove off. You finished your coffee. Whatever is coming is still coming.', ok: true };
    }
    if (o.id === 'take') {
      F.owed += 1;
      F.stats.tipTaken++;
      if (t) t.blunt = Math.max(t.blunt, 0.75);
      if (coup) { s.scheduled = s.scheduled.filter((x) => x !== coup); const f = s.factions.find((x) => x.id === coup.params.faction); if (f) { f.stage = 0; f.stageWeek = s.week; } if (F.hollow) F.hollow.move = undefined; }
      if (!ok) seen();
      return { line: `You took a different car and a different road for a week.${coup ? ' The night they had picked, you were not where they planned.' : ''} The Bureau has a marker on you now.${ok ? '' : ' And somebody saw you with them.'}`, chance: o.odds, ok, leads: ['You owe the Bureau one'] };
    }
    // Find out who.
    if (ok) {
      if (t) {
        t.blunt = Math.max(t.blunt, 0.55);
        const r = s.rivals.find((x) => x.id === t.by);
        return { line: `You worked it back: ${r?.name ?? 'an outfit across the water'} paid for it. Now you know where to look.`, chance: o.odds, ok: true };
      }
      if (coup) {
        const f = s.factions.find((x) => x.id === coup.params.faction);
        for (const id of f?.memberIds ?? []) { const b = bookOf(s, id); if (b?.plot) b.plot.known = s.week; }
        if (F.hollow && f) F.hollow.leadId = f.leaderId;
        const names = (f?.memberIds ?? []).map((id) => nm(s.characters[id])).join(', ');
        return { line: `Names, at last: ${names || 'the men at the back table'}. What you do with them is up to you.`, chance: o.odds, ok: true, people: f?.memberIds ?? [] };
      }
    }
    seen();
    return { line: 'You asked the wrong questions in the wrong bars. All anybody heard is that you were seen with the FBI.', chance: o.odds, ok: false };
  });
}

/* ------------------------------------------------------------------ */
/* 6. The undercover                                                     */
/* ------------------------------------------------------------------ */

const COVERS = [
  { cover: 'a jewel fence from out of town', town: 'Baltimore' },
  { cover: 'a jewel fence who moves stones up and down the coast', town: 'Providence' },
  { cover: 'a jewelry man with a cousin in the diamond district', town: 'Miami' },
];
const UNCLES = ['Uncle Sal, who runs a social club', 'his uncle Benny, a bookmaker', 'an uncle in the produce business'];
const ALIASES: [string, string][] = [['Tony', 'Navarra'], ['Frankie', 'Delmonte'], ['Vinnie', 'Sorella'], ['Rocco', 'Bellamy']];

export const TELLS: Record<string, string> = {
  upstairs: 'never takes a girl upstairs at the Starlight, not once, not even when it is on the house',
  days: 'is never around on the same two days a month, and never says where he goes',
  uncle: 'has an uncle back home that nobody there has ever heard of',
  notes: 'remembers every number anybody ever says out loud',
};

export function isBrasco(s: GameState, id: string): boolean {
  return !!s.feds?.brasco && s.feds.brasco.id === id && !s.feds.brasco.end;
}

function startBrasco(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  const vouchers = crew(s).filter((c) => isFree(s, c) && (c.rank === 'soldier' || c.rank === 'associate') && c.informantFor !== 'law' && capoOf(s, c));
  const v = vouchers.sort((a, b) => (hasTrait(b, 'Greedy') ? 1 : 0) - (hasTrait(a, 'Greedy') ? 1 : 0))[0];
  if (!v) return;
  const k = capoOf(s, v)!;
  const cv = COVERS[Math.floor(fr(F) * COVERS.length)];
  const [first, last] = ALIASES[Math.floor(fr(F) * ALIASES.length)];
  const c = makeCharacter(s, { rank: 'associate', faction: 'player', age: 30 + Math.floor(fr(F) * 8), traits: ['Charming', 'Patient'], firstName: first, lastName: last, ethnicity: 'Italian', nickname: false });
  c.capoId = k.id;
  c.craft = 'earner';
  addStory(s, c, `Came in through ${v.firstName} ${v.lastName}: ${cv.cover}, from ${cv.town}.`);
  F.brasco = { id: c.id, cover: cv.cover, town: cv.town, uncle: UNCLES[Math.floor(fr(F) * UNCLES.length)], voucherId: v.id, since: s.week, stage: 0, tells: [], pull: s.week + 44 + Math.floor(fr(F) * 16), take: 0 };
  F.stats.brasco++;
  addOpinion(s, k.id, c.id, 'Earns, and knows how to sit at a table', 15, 1);
  const line = `${nm(v)} brought a man around: ${nm(c)}, ${cv.cover} from ${cv.town}. He vouches for him.`;
  ctx.log.push(line);
  journal(s, { c: 'crew', t: `A new face in ${k.firstName}'s crew`, x: line, src: 'feds', k: 'heard', p: [c.id, v.id] });
}

function brascoWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  const B = F.brasco;
  if (!B || B.end) {
    const stage = s.threats?.fed.stage ?? 0;
    const since = s.week - (F.brascoEnd ?? -999);
    if ((stage >= 1 || s.heat.federal >= 30 || (player(s).evidence ?? 0) >= 25) && since >= 104 && s.week >= 30 && fr(F) < BRASCO_CHANCE) startBrasco(ctx, F);
    return;
  }
  const c = s.characters[B.id];
  if (!c?.alive || c.faction !== 'player') { B.end = 'pulled'; F.brascoEnd = s.week; return; }
  if (B.found) return;
  const age = s.week - B.since;
  // A great earner, well liked.
  applyEffects(ctx, [{ type: 'money', amount: 250 + Math.floor(fr(F) * 350), category: 'street' }], { label: `${c.firstName}'s jewelry business`, because: `${c.firstName} earns`, category: 'street' });
  const k = capoOf(s, c);
  if (k) addOpinion(s, k.id, c.id, 'A good earner', 2, 1);
  // What he gathers.
  if (B.feeding && B.feeding >= s.week) {
    B.take = Math.max(0, B.take - 2);
  } else {
    B.take += 2 + B.stage;
    if (age % 2 === 0) addFedEvidence(s, s.playerId, 1, `undercover: ${c.firstName} ${c.lastName}`);
    if (k) addFedEvidence(s, k.id, 1.5, `undercover: ${c.firstName} ${c.lastName}`);
  }
  if (age >= 14 && B.stage < 1) { B.stage = 1; ctx.log.push(`${nm(c)} is around every night now. ${k?.firstName ?? 'His capo'} trusts him with the count.`); }
  // Tells, noticed now and then.
  if (fr(F) < 0.07) {
    const left = ['upstairs', 'days', 'notes'].filter((x) => !B.tells.includes(x));
    const t = left[Math.floor(fr(F) * left.length)];
    if (t) {
      B.tells.push(t);
      journal(s, { c: 'crew', t: `Something about ${c.firstName} ${c.lastName}`, x: `The talk at the Shamrock: ${c.firstName} ${TELLS[t]}.`, src: 'feds', k: 'heard', p: [c.id] });
      ctx.log.push(`Talk at the bar: ${c.firstName} ${TELLS[t]}.`);
      if (B.tells.length >= 2 && !scheduled(s).some((x) => x.kind === 'feds_check')) {
        const w = nextW(s, true);
        put(s, 'feds_check', w, freeDay(s, w, 1, 5, F), 16, {});
      }
    }
  }
  // His capo wants to sponsor him.
  if (age >= 28 && B.stage === 1 && k && !scheduled(s).some((x) => x.kind === 'feds_sponsor')) {
    B.stage = 2;
    const w = nextW(s, true);
    put(s, 'feds_sponsor', w, freeDay(s, w, 1, 5, F), 17, {});
  }
  // The Bureau pulls him out: the wave.
  if (s.week >= B.pull && !scheduled(s).some((x) => x.kind === 'feds_wave')) {
    B.end = 'pulled';
    F.brascoEnd = s.week;
    F.stats.brascoPulled++;
    const w = nextW(s, true);
    put(s, 'feds_wave', w, freeDay(s, w, 1, 3, F), 6, { why: 'brasco' });
    // He is gone overnight.
    c.faction = 'law';
    c.rank = 'civilian';
    c.capoId = undefined;
    addStory(s, c, `Special Agent ${c.firstName === 'Tony' ? 'Anthony' : c.firstName} ${['Keller', 'Marsh', 'Doherty', 'Lund'][c.id.length % 4]}, FBI. Undercover for ${Math.round((s.week - B.since) / 4.3)} months.`);
    ctx.log.push(`${nm(c)} did not show up tonight. Nobody can find him.`);
    s.eventQueue.push(buildVoucher(s, B, 'pulled'));
  }
}

function checkOdds(s: GameState, B: Brasco): number {
  return clamp(0.3 + B.tells.length * 0.15 + (hasTrait(player(s), 'Paranoid') ? 0.1 : 0), 0.2, 0.9);
}

/** The boss had him checked (a moment, or the background check: crewConsequences). Returns true if found. */
export function brascoChecked(ctx: Ctx, bonus = 0, atTurn = false): boolean {
  const s = ctx.s;
  const F = ensureFeds(s);
  const B = F.brasco;
  if (!B || B.end || B.found) return false;
  if (!B.tells.includes('uncle')) B.tells.push('uncle');
  if (fr(F) < checkOdds(s, B) + bonus) {
    B.found = s.week;
    F.stats.brascoFound++;
    const late = !atTurn && today(s) >= 5;
    const w = atTurn || late ? s.week + 1 : s.week;
    put(s, 'feds_brasco', w, freeDay(s, w, atTurn || late ? 1 : today(s) + 1, 5, F), 22, {});
    return true;
  }
  return false;
}

function checkView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const B = s.feds?.brasco;
  const c = B ? s.characters[B.id] : undefined;
  if (!B || B.end || B.found || !c?.alive) return undefined;
  const v = s.characters[B.voucherId];
  return {
    id: `sched:${it.id}`, title: `Something about ${c.firstName}`, when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: true,
    text: `${nm(c)} is the best earner ${capoOf(s, c)?.firstName ?? 'that crew'} has had in years, and everybody likes him. But he ${B.tells.map((t) => TELLS[t]).join('; and he ')}. ${v ? `${v.firstName} vouched for him.` : ''}`,
    options: [
      { id: 'check', label: `Have ${B.uncle.split(',')[0]} checked out in ${B.town} (−$1,000)`, hint: 'A friend of a friend asks around', odds: checkOdds(s, B), blocked: s.money < 1000 ? 'Needs $1,000' : undefined },
      { id: 'ask', label: `Ask ${v?.firstName ?? 'the man who vouched'} how well he really knows him`, hint: 'He will be insulted if you are wrong', odds: clamp(checkOdds(s, B) - 0.15, 0.1, 0.8) },
      { id: 'drop', label: 'Forget it: he earns', hint: 'Talk is talk', odds: 1 },
    ],
    def: 'drop',
  };
}

function checkAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'Something about him', (ctx, F) => {
    const s = ctx.s;
    const B = F.brasco!;
    const c = s.characters[B.id];
    const v = checkView(input, it);
    const o = v?.options.find((x) => x.id === opt && !x.blocked) ?? v?.options.find((x) => x.id === 'drop')!;
    if (o.id === 'drop') return { line: `${c.firstName} brought you a watch for your wife's birthday. You let it go.`, ok: true, who: nm(c), people: [c.id] };
    if (o.id === 'check') applyEffects(ctx, [{ type: 'money', amount: -1000 }], { label: 'A check on the uncle', because: `had ${c.firstName}'s story checked`, category: 'event' });
    const found = brascoChecked(ctx, o.id === 'ask' ? -0.15 : 0);
    if (!found && o.id === 'ask') addOpinion(s, B.voucherId, s.playerId, 'The boss doubted my word', -6, 1);
    return {
      line: found ? `Nobody in ${B.town} ever heard of ${B.uncle.split(',')[0]}. Nobody. The man you call ${c.firstName} is somebody else.` : `It checked out, more or less. ${c.firstName} laughed when he heard you asked.`,
      chance: o.odds, ok: found, who: nm(c), people: [c.id], leads: found ? ['What to do about him: tonight'] : [],
    };
  });
}

function sponsorView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const B = s.feds?.brasco;
  const c = B ? s.characters[B.id] : undefined;
  const k = c ? capoOf(s, c) : undefined;
  if (!B || B.end || B.found || !c?.alive || !k) return undefined;
  return {
    id: `sched:${it.id}`, title: `${k.firstName} wants to sponsor ${c.firstName}`, when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: false,
    text: `${nm(k)} wants to put ${nm(c)}'s name in for the books when Philadelphia opens them. "The best earner I got. Never late, never short. I'd trust him with my sister."`,
    options: [
      { id: 'yes', label: 'Put his name in', hint: 'He gets closer: the inside of the family', odds: 1 },
      { id: 'wait', label: 'Not yet', hint: `${k.firstName} will sulk`, odds: 1 },
      { id: 'check', label: 'First, have his story checked back home (−$1,000)', hint: 'The careful way', odds: checkOdds(s, B), blocked: s.money < 1000 ? 'Needs $1,000' : undefined },
    ],
    def: 'wait',
  };
}

function sponsorAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'A sponsorship', (ctx, F) => {
    const s = ctx.s;
    const B = F.brasco!;
    const c = s.characters[B.id];
    const k = capoOf(s, c);
    if (opt === 'yes') {
      B.stage = 3;
      B.take += 20;
      if (k) addOpinion(s, k.id, s.playerId, 'The boss backed my man', 6, 1);
      applyEffects(ctx, [{ type: 'propose', charId: c.id, voucherId: k?.id ?? s.playerId }], { label: 'A sponsorship', because: `put ${c.firstName}'s name in`, category: 'event' });
      return { line: `${c.firstName}'s name goes in. He shook your hand with both of his.`, ok: true, who: nm(c), people: [c.id] };
    }
    if (opt === 'check' && s.money >= 1000) {
      applyEffects(ctx, [{ type: 'money', amount: -1000 }], { label: 'A check on the uncle', because: `had ${c.firstName}'s story checked`, category: 'event' });
      const found = brascoChecked(ctx);
      return { line: found ? `The uncle in ${B.town} does not exist. The man ${k?.firstName ?? 'your capo'} wants to sponsor is a federal agent.` : 'It checked out. You still say not yet.', chance: checkOdds(input, B), ok: found, who: nm(c), people: [c.id] };
    }
    if (k) addOpinion(s, k.id, s.playerId, 'The boss would not back my man', -5, 1);
    return { line: `"Not yet." ${k?.firstName ?? 'His capo'} did not like it.`, ok: true, who: nm(c), people: [c.id] };
  });
}

function brascoView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const B = s.feds?.brasco;
  const c = B ? s.characters[B.id] : undefined;
  if (!B || B.end || !B.found || !c?.alive) return undefined;
  const v = s.characters[B.voucherId];
  return {
    id: `sched:${it.id}`, title: `${c.firstName} is a federal agent`, when: `${DAY_NAMES[it.d]}, ${hourText(it.h)}`, warned: true,
    text: `Months at your tables, at your daughter's confirmation, in your car. ${v ? `${nm(v)} vouched for him.` : ''} He does not know you know. Killing a federal agent brings the whole government down on the island.`,
    options: [
      { id: 'freeze', label: 'Freeze him out: nobody talks around him', hint: 'The Bureau pulls him; what he already has, they keep', odds: 1 },
      { id: 'feed', label: 'Feed him false information', hint: 'Send the Bureau after the wrong people', odds: clamp(0.5 + (hasTrait(player(s), 'Patient') ? 0.1 : 0) + (hasTrait(player(s), 'Charming') ? 0.05 : 0), 0.3, 0.8) },
      { id: 'kill', label: 'Have him killed and buried in the Pines', hint: 'Your explicit order. Enormous heat even if the body is never found', odds: 0.5 },
    ],
    def: 'freeze',
  };
}

function brascoAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'The agent', (ctx, F) => {
    const s = ctx.s;
    const B = F.brasco!;
    const c = s.characters[B.id];
    const v = brascoView(input, it);
    const o = v?.options.find((x) => x.id === opt) ?? v?.options.find((x) => x.id === 'freeze')!;
    const ok = fr(F) < o.odds;
    const label = 'The undercover agent';
    s.eventQueue.push(buildVoucher(s, B, o.id === 'kill' ? 'killed' : 'found'));
    if (o.id === 'kill') {
      B.end = 'killed';
      F.brascoEnd = s.week;
      applyEffects(ctx, [
        { type: 'kill', charId: c.id, cause: ok ? 'disappeared; never found' : 'found shot in the Pine Barrens', killer: 'player' },
        { type: 'heat', bar: 'federal', amount: ok ? 30 : 45 }, { type: 'heat', bar: 'family', amount: 12 }, { type: 'evidence', charId: s.playerId, amount: ok ? 12 : 20 },
      ], { label, because: 'had a federal agent killed', category: 'event' });
      if (!ok) { const w = s.week + 1; put(s, 'feds_wave', w, freeDay(s, w, 1, 3, F), 6, { why: 'brasco' }); }
      return { line: ok ? `${c.firstName} went fishing off the inlet and never came back. Within a week there are forty agents in Cape May County.` : 'They found him in two days. The government is coming with everything it has.', chance: o.odds, ok, who: nm(c), people: [c.id], extra: ok ? undefined : { h: 'FBI AGENT FOUND SLAIN IN PINES', b: 'The body of an undercover federal agent was found in the Pine Barrens. The Bureau has sent dozens of agents to the shore.' } };
    }
    if (o.id === 'feed') {
      if (ok) {
        B.feeding = s.week + 8;
        B.take = Math.max(0, B.take - 15);
        B.end = 'fed';
        F.brascoEnd = s.week;
        const r = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
        if (r) r.exposure = Math.min(100, (r.exposure ?? 0) + 30);
        applyEffects(ctx, [{ type: 'heat', bar: 'federal', amount: -6 }], { label, because: 'fed the agent lies', category: 'event' });
        c.faction = 'law'; c.rank = 'civilian'; c.capoId = undefined;
        s.scheduled.push({ id: `sc${s.nextId++}`, key: 'rat_burned', dueWeek: s.week + 10, because: 'fed the agent false information', sourceWeek: s.week, params: { charId: c.id } });
        return { line: `For two months ${c.firstName} wrote down every lie you told him. ${r ? `The Bureau raided ${r.name}'s places on your word.` : ''} Then he was gone.`, chance: o.odds, ok: true, who: nm(c), people: [c.id] };
      }
      B.end = 'pulled';
      F.brascoEnd = s.week;
      c.faction = 'law'; c.rank = 'civilian'; c.capoId = undefined;
      const w = s.week + 1;
      put(s, 'feds_wave', w, freeDay(s, w, 1, 3, F), 6, { why: 'brasco' });
      return { line: `${c.firstName} smelled it on the second lie. He was gone by morning, and his notes went with him.`, chance: o.odds, ok: false, who: nm(c), people: [c.id], leads: ['Indictments are coming'] };
    }
    // Freeze: he is pulled; a smaller wave if he had enough.
    B.end = 'frozen';
    F.brascoEnd = s.week;
    c.faction = 'law'; c.rank = 'civilian'; c.capoId = undefined;
    B.take = Math.round(B.take * 0.5);
    if (B.take >= 25) { const w = s.week + 1; put(s, 'feds_wave', w, freeDay(s, w, 1, 3, F), 6, { why: 'brasco' }); }
    return { line: `Nobody talks around ${c.firstName}. In a week he stops coming around. ${B.take >= 25 ? 'What he already had, the Bureau keeps.' : 'He had less than he thought.'}`, ok: true, who: nm(c), people: [c.id] };
  });
}

/** The man who vouched for the agent is in deep trouble either way: the boss decides. */
export function buildVoucher(s: GameState, B: Brasco, how: 'pulled' | 'found' | 'killed'): EventInstance {
  const v = s.characters[B.voucherId];
  const a = s.characters[B.id];
  const label = `${v?.firstName ?? 'The voucher'} vouched for an agent`;
  const ok = !!v && mine(s, v);
  return {
    iid: `ev${s.nextId++}`, defId: 'feds_voucher', week: s.week, mandatory: true, priority: 80, actors: ok ? [v!.id] : [],
    meta: { crew: 1, ...(ok ? { charId: v!.id } : {}), feds: 1 },
    title: `${v?.firstName ?? 'He'} vouched for him`,
    text: `${ok ? nm(v) : 'The man who brought him in'} is the one who said ${a?.firstName ?? 'the agent'} was all right. ${how === 'pulled' ? 'Philadelphia already knows.' : 'Philadelphia will hear.'} Every family in the East has asked how a federal agent sat at your table. ${ok ? `${v!.firstName} swears he did not know.` : ''}`,
    defaultChoiceId: ok ? 'bust' : 'move',
    choices: ok ? [
      { id: 'forgive', label: 'He was fooled like everyone else', detail: 'Philadelphia will think you are soft.', because: `forgave ${v!.firstName}`, effects: [{ type: 'heat', bar: 'family', amount: 8, label }, { type: 'opinion', from: v!.id, to: s.playerId, amount: 15, reason: 'The boss stood by me when I was fooled', decay: 1, label }] },
      { id: 'bust', label: 'Bust him down and take his end for a year', detail: 'He lives; everybody sees what it costs.', because: `busted ${v!.firstName} down`, effects: [{ type: 'rank', charId: v!.id, rank: 'associate', label }, { type: 'wealth', charId: v!.id, amount: -Math.min(v!.wealth, 3000), label }, { type: 'money', amount: Math.min(v!.wealth, 3000), label }, { type: 'heat', bar: 'family', amount: -4, label }, { type: 'opinion', from: v!.id, to: s.playerId, amount: -15, reason: 'Busted me down over the agent', decay: 1, label }] },
      { id: 'clip', label: `Have ${v!.firstName} killed`, detail: 'Your explicit order. Philadelphia approves. His family will not.', because: `had ${v!.firstName} killed for vouching for an agent`, effects: [{ type: 'kill', charId: v!.id, cause: 'killed for vouching for an undercover agent', killer: 'player', label }, { type: 'heat', bar: 'family', amount: -10, label }, { type: 'heat', bar: 'local', amount: 6, label }, { type: 'crewOpinion', amount: -3, reason: `${v!.firstName} was killed for being fooled`, label }] },
    ] : [
      { id: 'move', label: 'Move on', because: 'moved on', effects: [{ type: 'heat', bar: 'family', amount: 6, label }] },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The week, and the deliveries                                          */
/* ------------------------------------------------------------------ */

/** The week turn: pinches, decisions, homecomings, the wire, the boss's deal, the hollow crown, the tip-off, the undercover. */
export function fedsWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver || !player(s)?.alive) return;
  const F = ensureFeds(s);
  decideWeek(ctx, F);
  homeWeek(ctx, F);
  pinchWeek(ctx, F);
  wireWeek(ctx, F);
  handlerWeek(ctx, F);
  hollowWeek(ctx, F);
  tipWeek(ctx, F);
  brascoWeek(ctx, F);
}

const DELIVERIES: [string, (s: GameState, it: ScheduledItem) => MomentView | undefined, (s: GameState, it: ScheduledItem, o: string) => { state: GameState; result: NowResult; extra?: { h: string; b: string } }][] = [
  ['feds_knock', knockView, knockAnswer],
  ['feds_visit', visitView, visitAnswer],
  ['feds_push', pushView, pushAnswer],
  ['feds_wave', waveView, waveAnswer],
  ['feds_handler', handlerView, handlerAnswer],
  ['feds_burned', burnedView, burnedAnswer],
  ['feds_crown', crownView, crownAnswer],
  ['feds_tip', tipView, tipAnswer],
  ['feds_check', checkView, checkAnswer],
  ['feds_sponsor', sponsorView, sponsorAnswer],
  ['feds_brasco', brascoView, brascoAnswer],
];
for (const [kind, view, answer] of DELIVERIES) registerDelivery({ kind, view, answer });

/** For tests and the screens: the moments of this module now on the clock. */
export function fedsMoments(s: GameState): ScheduledItem[] {
  return scheduled(s).filter((x) => x.kind.startsWith('feds_'));
}
