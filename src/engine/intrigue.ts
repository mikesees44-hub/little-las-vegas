import { displayName, hasTrait, isFree } from './characters';
import { applyEffects, fmtMoney } from './effects';
import { addStory } from './hierarchy';
import type { Ctx } from './ledger';
import { pressItem } from './paper';
import { addOpinion, changeMeter, opinion } from './relations';
import { remember } from './bonds';
import { killCharacter } from './dynasty';
import { strengthTotal, rivalStrength } from './strength';
import { FACTION_NAMES } from './world';
import {
  ensureIntrigue, ERA_LABEL, ERA_ORDER, pairKey, type Era, type EraTrack, type Intel, type IntelKind, type IntrigueState, type Lie, type Plot, type Spy, type WarLedger,
} from './intrigueState';
import type { Character, Choice, EventInstance, FactionId, GameState, PlayerChoices, Rival, RivalId, War } from './types';

/**
 * THE DYNAMICS LAYER: drama, intrigue, lies, spies, wars and peace between
 * the families. It reads the real events of the week (strikes, pushes onto
 * corners, bodies, wars, pacts) and turns them into:
 *
 *  - ERAS for every pair of families: Peace → Tension → Cold war → Open war →
 *    Truce/Settlement → Peace. Each era has its own rules (peace pays in money
 *    and respect; a war that wins takes rackets, ground and tribute, with a
 *    war ledger that shows what the violence bought);
 *  - SPIES both ways: the boss's men inside other families (planted or
 *    turned), whose intelligence can be false if the spy was doubled; the
 *    rivals' and the FBI's men inside his crew, found by suspicion, a canary
 *    trap, questioning, and dealt with only by the boss's own choice;
 *  - LIES: the boss's denials, bluffs, false flags, rumors and forgeries, and
 *    the NPCs' lies to him (including his own men's self-serving reports),
 *    each with a chance of coming out later ("what you were told" vs "what
 *    you later learned");
 *  - DRAMA: coups in rival families, a capo talking to a rival, a wife's
 *    brother informing, hotheads, double-crosses in deals.
 *
 * Decisions reach the boss through the one event pipeline (the story
 * director's caps and the inbox), at most one a week from here. Its dice are
 * its own (a hash of the seed, the week and a key), never the game's RNG, so
 * it does not move the other systems' luck.
 *
 * Nothing here ever hands over, harms or removes one of the player's men
 * without the boss's explicit choice: every default answer is "watch".
 */

/* ------------------------------------------------------------------ */
/* Dice, ids, the log, listeners                                        */
/* ------------------------------------------------------------------ */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
/** The layer's own deterministic dice for this week. */
export function dice(s: GameState, key: string): number {
  return hash(`${s.seed}|${s.week}|intr|${key}`);
}
function pickOf<T>(s: GameState, key: string, xs: readonly T[]): T | undefined {
  return xs.length ? xs[Math.floor(dice(s, key) * xs.length) % xs.length] : undefined;
}
function between(s: GameState, key: string, lo: number, hi: number): number {
  return lo + Math.floor(dice(s, key) * (hi - lo + 1));
}
function newId(I: IntrigueState, p: string): string {
  return `${p}${I.nextId++}`;
}
function note(s: GameState, text: string): void {
  const I = ensureIntrigue(s);
  I.log.push([s.week, text.charAt(0).toUpperCase() + text.slice(1)]);
  if (I.log.length > 60) I.log.splice(0, I.log.length - 60);
}

export type IntrigueSignal =
  | { type: 'era'; key: string; from: Era; to: Era; cause: string }
  | { type: 'lie'; lie: Lie; discovered: boolean }
  | { type: 'spy'; spy: Spy; what: 'placed' | 'doubled' | 'burned' | 'recalled' }
  | { type: 'intel'; intel: Intel }
  | { type: 'plot'; plot: Plot };

const LISTENERS: ((s: GameState, e: IntrigueSignal) => void)[] = [];
/** For other layers (the NPC minds): be told when an era changes, a lie is told or found out, a spy is placed or burned. */
export function onIntrigue(fn: (s: GameState, e: IntrigueSignal) => void): () => void {
  LISTENERS.push(fn);
  return () => { const i = LISTENERS.indexOf(fn); if (i >= 0) LISTENERS.splice(i, 1); };
}
function emit(s: GameState, e: IntrigueSignal): void {
  for (const fn of LISTENERS) try { fn(s, e); } catch { /* a listener never breaks the week */ }
}

/**
 * The simple NPC decisions this layer makes, as plain scoring functions so a
 * smarter mind layer can replace them (assign a new function) after merge.
 * Each returns a probability 0..1.
 */
export const INTRIGUE_DECIDERS = {
  /** A rival boss at cold war decides to go to war with the player this week. */
  declareWar(s: GameState, r: Rival, t: EraTrack): number {
    const L = s.characters[r.leaderId];
    if (!L) return 0;
    let p = 0.06 + Math.max(0, t.tension - 85) / 100;
    if (r.goal === 'conquer' || r.goal === 'revenge') p += 0.06;
    if (hasTrait(L, 'Hot-headed') || hasTrait(L, 'Vengeful')) p += 0.05;
    if (hasTrait(L, 'Cowardly') || hasTrait(L, 'Patient')) p -= 0.05;
    if (rivalStrength(s, r) < strengthTotal(s) * 0.7) p -= 0.08;
    return Math.max(0, Math.min(0.3, p));
  },
  /** A family finds the spy inside it this week. */
  findSpy(s: GameState, sp: Spy): number {
    const L = sp.inside === 'player' ? undefined : s.characters[s.rivals.find((r) => r.id === sp.inside)?.leaderId ?? ''];
    let p = (100 - sp.cover) / 500;
    if (L && hasTrait(L, 'Paranoid')) p *= 1.6;
    return Math.min(0.25, p);
  },
  /** A family that found a spy turns him around instead of burning him. */
  doubleBack(s: GameState, inside: FactionId): number {
    const L = s.characters[s.rivals.find((r) => r.id === inside)?.leaderId ?? ''];
    return L && (hasTrait(L, 'Patient') || hasTrait(L, 'Paranoid') || hasTrait(L, 'Charming')) ? 0.65 : 0.35;
  },
  /** A man of the player's tells him something self-serving instead of the truth. */
  selfServing(s: GameState, c: Character): number {
    let p = 0.2;
    if (hasTrait(c, 'Greedy') || hasTrait(c, 'Ambitious')) p += 0.2;
    if (hasTrait(c, 'Honest') || hasTrait(c, 'Loyal-to-a-fault')) p -= 0.15;
    if (opinion(s, c.id, s.playerId) < 0) p += 0.15;
    return Math.max(0.02, Math.min(0.8, p));
  },
  /** A coup inside a family succeeds. */
  coup(_s: GameState, p: Plot): number {
    return Math.max(0.1, Math.min(0.9, 0.45 + (p.backed === 'pretender' ? 0.25 : p.backed === 'boss' ? -0.35 : 0)));
  },
};

/* ------------------------------------------------------------------ */
/* Tracks and eras                                                     */
/* ------------------------------------------------------------------ */

export function track(s: GameState, a: FactionId, b: FactionId): EraTrack | undefined {
  return ensureIntrigue(s).eras[pairKey(a, b)];
}
/** The player's era with a family (peace when there is no track yet). */
export function eraWith(s: GameState, rival: FactionId): Era {
  return s.intrigue?.eras[pairKey('player', rival)]?.era ?? 'peace';
}

/** Move the tension between two families, remembering why. */
export function bumpTension(s: GameState, a: FactionId, b: FactionId, amount: number, cause: string): void {
  const t = track(s, a, b);
  if (!t) return;
  t.tension = Math.max(0, Math.min(100, Math.round(t.tension + amount)));
  if (Math.abs(amount) >= 6) t.cause = cause;
}

function mobs(s: GameState): Rival[] {
  return s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
}
function rname(id: FactionId): string {
  return FACTION_NAMES[id] ?? id;
}
/** "the Kessler family" from "The Kessler family" */
function lname(id: FactionId): string {
  return famName(id);
}
/** "the Kessler family", "Philadelphia", "the law". */
export function famName(id: FactionId): string {
  if (id === 'philly') return 'Philadelphia';
  if (id === 'law') return 'the law';
  if (id === 'player') return 'your family';
  return `the ${FACTION_NAMES[id] ?? id} family`;
}
function pairLabel(t: EraTrack): string {
  return t.a === 'player' ? `with ${lname(t.b)}` : `between ${lname(t.a)} and ${lname(t.b)}`;
}

function setEra(ctx: Ctx, t: EraTrack, era: Era, cause: string): void {
  const s = ctx.s;
  if (t.era === era) return;
  const from = t.era;
  t.era = era;
  t.since = s.week;
  t.cause = cause;
  t.hist.push([s.week, era, cause]);
  if (t.hist.length > 12) t.hist.splice(0, t.hist.length - 12);
  const text = `${ERA_LABEL[era]} ${pairLabel(t)}: ${cause}.`;
  note(s, text);
  emit(s, { type: 'era', key: t.key, from, to: era, cause });
  if (t.a === 'player') {
    ctx.log.push(`Era: ${text.charAt(0).toUpperCase() + text.slice(1)}`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'rival' });
    if (era === 'war') pressItem(s, { s: 'front', h: 'GANGLAND WAR FEARED ON THE ISLAND', b: 'Police are bracing for trouble after a week of incidents that detectives will only call "connected." Businessmen on Pacific Avenue say they are keeping their doors locked after dark.', p: 72, a: 'family' });
    if (era === 'truce') pressItem(s, { s: 'spout', b: 'Spout Off: Funny how quiet Pacific Ave got all of a sudden. Somebody must have sat down to dinner with somebody.', p: 25 });
  } else if (era === 'war') {
    pressItem(s, { s: 'blotter', h: 'TWO MEN HURT IN BAR BRAWL', b: 'Police say a fight that started over "a personal matter" spilled onto the street. Neither man would say who started it. Detectives believe it is part of a dispute between rival business interests.', p: 40, a: 'rival' });
  }
}

/** The worst era the player is in, for the top bar: "Cold war with the Kessler family". */
export function eraHeadline(s: GameState): { era: Era; rival?: RivalId; text: string; cause?: string } {
  const I = s.intrigue;
  if (!I) return { era: 'peace', text: 'Peace with the families' };
  let worst: EraTrack | undefined;
  for (const t of Object.values(I.eras)) {
    if (t.a !== 'player') continue;
    if (!s.characters[s.rivals.find((r) => r.id === t.b)?.leaderId ?? '']?.alive) continue;
    if (!worst || ERA_ORDER[t.era] > ERA_ORDER[worst.era] || (t.era === worst.era && t.tension > worst.tension)) worst = t;
  }
  if (!worst || worst.era === 'peace') return { era: 'peace', text: 'Peace with the families', cause: worst?.cause };
  return { era: worst.era, rival: worst.b, text: `${ERA_LABEL[worst.era]} with ${lname(worst.b)}`, cause: worst.cause };
}

export type Mood = 'friendly' | 'businesslike' | 'wary' | 'cold' | 'hostile' | 'at war';
/** Each family's mood toward the boss: opinion and tension together. */
export function moodOf(s: GameState, rival: RivalId): { mood: Mood; tension: number; opinion: number; era: Era } {
  const r = s.rivals.find((x) => x.id === rival);
  const op = r ? opinion(s, r.leaderId, s.playerId) : 0;
  const t = s.intrigue?.eras[pairKey('player', rival)];
  const tension = t?.tension ?? 15;
  const era = t?.era ?? 'peace';
  const v = op - tension;
  const mood: Mood = era === 'war' ? 'at war' : v >= 25 ? 'friendly' : v >= 0 ? 'businesslike' : v >= -30 ? 'wary' : v >= -60 ? 'cold' : 'hostile';
  return { mood, tension, opinion: op, era };
}

/* ------------------------------------------------------------------ */
/* Moles, secrets, suspicion                                           */
/* ------------------------------------------------------------------ */

/** The boss KNOWS he talks to someone else (the informant secret, shared with sides.ts). */
export function confirmedMole(s: GameState, charId: string): boolean {
  return s.secrets.some((x) => x.ownerId === charId && x.kind === 'informant' && x.knownBy.includes('player'));
}
export function confirmMole(s: GameState, c: Character): void {
  const sec = s.secrets.find((x) => x.ownerId === c.id && x.kind === 'informant');
  if (sec) { if (!sec.knownBy.includes('player')) sec.knownBy.push('player'); }
  else if (c.informantFor) s.secrets.push({ id: `x${s.nextId++}`, ownerId: c.id, kind: 'informant', text: `${c.firstName} ${c.lastName} informs for ${c.informantFor === 'law' ? 'the FBI' : FACTION_NAMES[c.informantFor]}`, knownBy: ['player'], week: s.week });
  ensureIntrigue(s).suspect[c.id] = 100;
}
function suspicionUp(s: GameState, id: string, n: number): void {
  const I = ensureIntrigue(s);
  I.suspect[id] = Math.max(0, Math.min(100, (I.suspect[id] ?? 0) + n));
}
/** A man of the player's family who reports elsewhere (the truth, not what the boss knows). */
function isMole(c: Character | undefined): boolean {
  return !!c && c.alive && c.faction === 'player' && !!c.informantFor && c.informantFor !== 'player';
}
function ourMen(s: GameState): Character[] {
  const out: Character[] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (c.alive && c.faction === 'player' && c.rank !== 'civilian' && c.id !== s.playerId && isFree(s, c)) out.push(c);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
function theirMen(s: GameState, rival: FactionId): Character[] {
  const r = s.rivals.find((x) => x.id === rival);
  const out: Character[] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (c.alive && c.faction === rival && c.id !== r?.leaderId && c.rank !== 'civilian') out.push(c);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* The war ledger and settlements                                      */
/* ------------------------------------------------------------------ */

export function ledgerOf(s: GameState, warId: string): WarLedger | undefined {
  return s.intrigue?.ledgers.find((l) => l.warId === warId);
}
function ensureLedger(s: GameState, w: War): WarLedger {
  const I = ensureIntrigue(s);
  let l = I.ledgers.find((x) => x.warId === w.id);
  if (!l) {
    const d = s.districts.find((x) => x.id === w.district);
    l = { warId: w.id, rival: w.rival, district: w.district, startWeek: w.startWeek, spent: 0, gained: 0, menLost: 0, theirsLost: 0, startInf: d?.influence.player ?? 0, influence: 0, respect: 0, notes: [] };
    I.ledgers.push(l);
    if (I.ledgers.length > 12) I.ledgers.splice(0, I.ledgers.length - 12);
  }
  return l;
}
function ledgerNote(l: WarLedger, week: number, text: string): void {
  l.notes.push([week, text]);
  if (l.notes.length > 16) l.notes.splice(0, l.notes.length - 16);
}

/**
 * Called by war.ts when a war ends: the ledger closes and the settlement is
 * set. A won war takes their book in the district (a weekly tribute for a
 * season); a lost one costs a weekly payment; a white peace draws a border.
 */
export function noteWarEnd(ctx: Ctx, w: War, outcome: 'won' | 'lost' | 'white'): void {
  const s = ctx.s;
  if (s.week < 2 && !s.intrigue) return;
  const I = ensureIntrigue(s);
  const l = ensureLedger(s, w);
  l.endWeek = s.week;
  l.outcome = outcome;
  const d = s.districts.find((x) => x.id === w.district);
  l.influence = (d?.influence.player ?? 0) - l.startInf;
  const r = s.rivals.find((x) => x.id === w.rival);
  const t = I.eras[pairKey('player', w.rival)];
  if (!t || !r) return;
  const weekly = outcome === 'won' ? Math.max(200, Math.min(900, Math.round(Math.max(0, r.money) / 25 / 50) * 50)) : outcome === 'lost' ? -200 : 0;
  const weeks = outcome === 'won' ? 13 : outcome === 'lost' ? 6 : 10;
  const text = outcome === 'won'
    ? `${rname(w.rival)}'s book in ${d?.name ?? 'the district'} kicks up to you: ${fmtMoney(weekly)} a week for a season, and the line is drawn where you say`
    : outcome === 'lost' ? `you pay ${rname(w.rival)} ${fmtMoney(-weekly)} a week for ${weeks} weeks, and stay out of ${d?.name ?? 'the district'}`
    : `nobody pays; ${d?.name ?? 'the district'} is split down the middle, and the line holds`;
  t.settlement = { week: s.week, until: s.week + weeks, weekly, border: w.district, text, paid: 0 };
  t.tension = outcome === 'won' ? 45 : outcome === 'lost' ? 30 : 35;
  ledgerNote(l, s.week, `Peace: ${text}.`);
  setEra(ctx, t, 'truce', outcome === 'won' ? 'They sued for peace' : outcome === 'lost' ? 'You gave them what they wanted' : 'A white peace at the Table');
}

/* ------------------------------------------------------------------ */
/* Spies & intelligence                                                */
/* ------------------------------------------------------------------ */

/** The newest piece of intelligence a spy brought (for the minds layer and the board). */
export function spyReport(s: GameState, spyId: string): Intel | undefined {
  const xs = s.intrigue?.intel.filter((i) => i.spyId === spyId) ?? [];
  return xs[xs.length - 1];
}

/**
 * Put a false (or true) belief in front of the boss: what he is told now and
 * what is really so. Other layers (the NPC minds) use this to feed him gossip.
 */
export function plantFalseBelief(s: GameState, b: { about: FactionId; told: string; truth: string; sourceId?: string; kind?: IntelKind; learnIn?: number; motive?: string; isTrue?: boolean }): Intel {
  const I = ensureIntrigue(s);
  const it: Intel = { id: newId(I, 'in'), week: s.week, sourceId: b.sourceId, about: b.about, kind: b.kind ?? 'report', told: b.told, truth: b.truth, true: !!b.isTrue, learnAt: s.week + (b.learnIn ?? 6), motive: b.motive };
  pushIntel(s, it);
  return it;
}
function pushIntel(s: GameState, it: Intel): void {
  const I = ensureIntrigue(s);
  I.intel.push(it);
  if (I.intel.length > 40) I.intel.splice(0, I.intel.length - 40);
  emit(s, { type: 'intel', intel: it });
}

/** A fact about a family, true or false. */
function intelFact(s: GameState, r: Rival, kind: IntelKind, falsehood: boolean, key: string): { told: string; truth: string; subjectId?: string } {
  const mine = strengthTotal(s);
  const theirs = rivalStrength(s, r);
  const t = s.intrigue?.eras[pairKey('player', r.id)];
  switch (kind) {
    case 'money': {
      const real = Math.max(0, Math.round(r.money / 1000)) * 1000;
      const said = falsehood ? Math.max(1000, Math.round((real * (dice(s, key + 'm') < 0.5 ? 0.3 : 2.5)) / 1000) * 1000) : real;
      return { told: `${rname(r.id)} is sitting on about ${fmtMoney(said)}.`, truth: `${rname(r.id)} had about ${fmtMoney(real)}.` };
    }
    case 'strength': {
      const weak = theirs < mine;
      const saysWeak = falsehood ? !weak : weak;
      return { told: saysWeak ? `${rname(r.id)} is thin on men: half of them would not stand up in a fight.` : `${rname(r.id)} has been bringing in muscle from Philadelphia. They are stronger than they look.`, truth: weak ? `${rname(r.id)} was the weaker side.` : `${rname(r.id)} was the stronger side.` };
    }
    case 'plan': {
      const hostile = (t?.tension ?? 0) >= 60 || r.goal === 'conquer' || r.goal === 'revenge';
      const says = falsehood ? !hostile : hostile;
      return { told: says ? `${displayName(s.characters[r.leaderId])} is planning a move on you. He talks about your corners at every dinner.` : `${displayName(s.characters[r.leaderId])} wants no trouble with you this year. He is busy with his own house.`, truth: hostile ? `${rname(r.id)} was planning against you.` : `${rname(r.id)} had no plans against you.` };
    }
    case 'weakman': {
      const men = theirMen(s, r.id).filter((c) => c.informantFor !== 'player');
      const m = pickOf(s, key + 'w', men);
      if (!m) return intelFact(s, r, 'money', falsehood, key);
      const weak = opinion(s, m.id, r.leaderId) < 20 || hasTrait(m, 'Greedy');
      const says = falsehood ? !weak : weak;
      return { subjectId: m.id, told: says ? `${displayName(m)} is sore at his boss and short on money. He could be turned.` : `${displayName(m)} would take a bullet for his boss. Don't try.`, truth: weak ? `${displayName(m)} was ripe to be turned.` : `${displayName(m)} was loyal to his boss.` };
    }
    default:
      return { told: '', truth: '' };
  }
}

/** Does the boss hold true word that this man can be turned (+) or false word (−)? */
export function weakManIntel(s: GameState, charId: string): Intel | undefined {
  const xs = s.intrigue?.intel.filter((i) => i.kind === 'weakman' && i.subjectId === charId) ?? [];
  return xs[xs.length - 1];
}

function spiesWeek(ctx: Ctx): void {
  const s = ctx.s;
  const I = ensureIntrigue(s);
  for (const sp of I.spies) {
    if (sp.ended) continue;
    const c = s.characters[sp.charId];
    if (!c?.alive) { sp.ended = s.week; sp.endedWhy = 'He is gone.'; continue; }
    // The boss's men inside other families.
    if (sp.master === 'player') {
      sp.cover = Math.max(0, sp.cover - (sp.how === 'planted' ? 2 : 1));
      if (!sp.doubled && dice(s, `find:${sp.id}`) < INTRIGUE_DECIDERS.findSpy(s, sp)) {
        if (dice(s, `dbl:${sp.id}`) < INTRIGUE_DECIDERS.doubleBack(s, sp.inside)) {
          // Found and turned around: he keeps coming to you, with their words in his mouth. You do not know.
          sp.doubled = sp.inside;
          emit(s, { type: 'spy', spy: sp, what: 'doubled' });
        } else {
          sp.ended = s.week;
          sp.endedWhy = 'His cover was blown.';
          if (sp.how === 'planted') {
            c.health = Math.max(5, c.health - 10);
            addStory(s, c, `His cover inside ${rname(sp.inside)} was blown. He got out, and does not talk about how.`);
          } else c.informantFor = undefined;
          bumpTension(s, 'player', sp.inside, 15, `They caught your man ${displayName(c)} inside their family`);
          note(s, `${displayName(c)}'s cover inside ${rname(sp.inside)} was blown.`);
          ctx.log.push(`Your man inside ${rname(sp.inside)}, ${displayName(c)}, was found out.`);
          emit(s, { type: 'spy', spy: sp, what: 'burned' });
          continue;
        }
      }
      // A report every few weeks.
      if (dice(s, `rep:${sp.id}`) < 0.4) {
        const r = s.rivals.find((x) => x.id === sp.inside);
        if (!r) continue;
        const kind = pickOf(s, `kind:${sp.id}`, ['money', 'strength', 'plan', 'weakman'] as IntelKind[])!;
        const falsehood = sp.doubled ? dice(s, `lie:${sp.id}`) < 0.9 : dice(s, `garble:${sp.id}`) < 0.12;
        const f = intelFact(s, r, kind, falsehood, sp.id);
        pushIntel(s, { id: newId(I, 'in'), week: s.week, spyId: sp.id, sourceId: sp.charId, about: sp.inside, kind, told: f.told, truth: f.truth, true: !falsehood, subjectId: f.subjectId, learnAt: s.week + between(s, `learn:${sp.id}`, 4, 10) });
      }
    } else if (sp.inside === 'player' && sp.doubled === 'player') {
      // A mole the boss feeds: his masters act on the tales.
      const r = s.rivals.find((x) => x.id === sp.master);
      if (r && dice(s, `fed:${sp.id}`) < 0.12) {
        const lost = between(s, `fedamt:${sp.id}`, 1500, 4000);
        r.money = Math.max(0, r.money - lost);
        r.muscle = Math.max(5, r.muscle - 2);
        note(s, `${rname(r.id)} acted on a tale you fed ${displayName(c)}: a truck that was never there, ${fmtMoney(lost)} of theirs wasted.`);
        ctx.log.push(`${rname(r.id)} fell for the story you fed through ${displayName(c)}.`);
      } else if (sp.master === 'law' && dice(s, `fedlaw:${sp.id}`) < 0.1) {
        applyEffects(ctx, [{ type: 'heat', bar: 'federal', amount: -2, label: `The FBI chases a story you fed ${displayName(c)}` }], { label: 'Fed the FBI a story', because: 'fed the FBI a story' });
      }
      if (dice(s, `wise:${sp.id}`) < 0.03) {
        sp.ended = s.week;
        sp.endedWhy = 'His masters stopped believing him.';
        note(s, `${rname(sp.master)} stopped believing what ${displayName(c)} brings them.`);
      }
    }
  }
  I.spies = I.spies.filter((x) => !x.ended || s.week - x.ended < 26);

  // The moles inside the boss's crew leak, and leave a trail of suspicion.
  const men = ourMen(s);
  for (const m of men) {
    if (!isMole(m) || I.spies.some((x) => x.charId === m.id && !x.ended && x.doubled === 'player')) continue;
    if (dice(s, `leak:${m.id}`) >= 0.08) continue;
    const master = m.informantFor!;
    const decoys = men.filter((x) => x.id !== m.id && (x.capoId === m.capoId || x.rank === m.rank));
    const d1 = pickOf(s, `decoy1:${m.id}`, decoys);
    const d2 = pickOf(s, `decoy2:${m.id}`, decoys.filter((x) => x !== d1));
    suspicionUp(s, m.id, 12);
    for (const d of [d1, d2]) if (d) suspicionUp(s, d.id, 6);
    const what = pickOf(s, `what:${m.id}`, ['the Thursday collection', 'where the card game moved', 'the new drop at the garage', 'who you had dinner with', 'what was said at the sit-down'])!;
    const who = master === 'law' ? 'The FBI' : rname(master);
    note(s, `${who} knew about ${what}. Only a few men knew: ${[m, d1, d2].filter(Boolean).map((x) => displayName(x!)).sort().join(', ')}.`);
    if (master !== 'law') bumpTension(s, 'player', master, 2, `They knew about ${what}`);
  }
}

/* ------------------------------------------------------------------ */
/* Lies                                                                */
/* ------------------------------------------------------------------ */

/** Record a lie (the boss's, an NPC's). */
export function tellLie(s: GameState, l: Omit<Lie, 'id' | 'week' | 'until'> & { until?: number }): Lie {
  const I = ensureIntrigue(s);
  const lie: Lie = { ...l, id: newId(I, 'lie'), week: s.week, until: l.until ?? s.week + 26 };
  I.lies.push(lie);
  if (I.lies.length > 40) I.lies.splice(0, I.lies.length - 40);
  emit(s, { type: 'lie', lie, discovered: false });
  return lie;
}

/** Their chance of finding out goes up with a man of theirs inside the boss's crew. */
function lieRisk(s: GameState, l: Lie): number {
  const mole = ourMen(s).some((c) => c.informantFor === l.to);
  return l.risk * (mole ? 2 : 1);
}

function liesWeek(ctx: Ctx): void {
  const s = ctx.s;
  const I = ensureIntrigue(s);
  for (const l of I.lies) {
    if (l.discovered || s.week > l.until || l.week === s.week) continue;
    if (dice(s, `lie:${l.id}`) >= lieRisk(s, l)) continue;
    l.discovered = s.week;
    emit(s, { type: 'lie', lie: l, discovered: true });
    if (l.teller === 'player' && l.to !== 'player') {
      const r = s.rivals.find((x) => x.id === l.to);
      if (!r) continue;
      addOpinion(s, r.leaderId, s.playerId, 'Lied to my face', -20, 1);
      bumpTension(s, 'player', r.id, 18, `They found out you lied: ${l.text}`);
      const tie = s.bonds?.ties[r.leaderId];
      if (tie) remember(s, tie, 'lie', `the lie: ${l.text.toLowerCase()}`, -15);
      if (l.blame) {
        bumpTension(s, 'player', l.blame, 12, `You tried to pin it on them`);
        const b = s.rivals.find((x) => x.id === l.blame);
        if (b) addOpinion(s, b.leaderId, s.playerId, 'Tried to pin his work on us', -15, 1);
        // The families you set against each other make it up.
        const rk = s.talks?.rivalRel;
        if (rk) { const k = r.id < l.blame ? `${r.id}|${l.blame}` : `${l.blame}|${r.id}`; rk[k] = Math.min(100, (rk[k] ?? 0) + 20); }
      }
      applyEffects(ctx, [{ type: 'respect', amount: -2, label: `Caught in a lie by ${r.shortName}` }], { label: 'A lie came out', because: 'were caught in a lie' });
      note(s, `${rname(r.id)} found out: ${l.text} (the truth: ${l.truth}).`);
      ctx.log.push(`${rname(r.id)} found out you lied to them.`);
    } else if (l.to === 'player') {
      // What the boss later learned: their lie gives him a grievance the Table recognises.
      const r = s.rivals.find((x) => x.id === l.teller);
      if (r) {
        s.flags[`grievance_${r.id}`] = 1;
        bumpTension(s, 'player', r.id, 10, `You learned they lied to you`);
      }
      note(s, `What you later learned: ${l.truth} (you were told: ${l.text}).`);
      ctx.log.push(`What you later learned: ${l.truth}`);
    }
  }
  // Intel whose truth comes out.
  for (const it of I.intel) {
    if (it.learned || it.learnAt > s.week) continue;
    it.learned = s.week;
    if (it.true) continue;
    note(s, `What you later learned: ${it.truth} (you were told: ${it.told})`);
    ctx.log.push(`What you later learned: ${it.truth}`);
    const src = it.sourceId ? s.characters[it.sourceId] : undefined;
    const sp = it.spyId ? I.spies.find((x) => x.id === it.spyId) : undefined;
    if (sp && sp.doubled && !sp.ended) {
      const falses = I.intel.filter((x) => x.spyId === sp.id && x.learned && !x.true).length;
      if (falses >= 2) {
        sp.ended = s.week;
        sp.endedWhy = 'Doubled: they were feeding you lies through him.';
        if (src && sp.how !== 'planted') src.informantFor = sp.inside;
        note(s, `${src ? displayName(src) : 'Your man'} was doubled: ${rname(sp.inside)} has been feeding you lies through him.`);
        ctx.log.push(`Your spy inside ${rname(sp.inside)} was doubled.`);
      }
    } else if (src && src.faction === 'player' && it.motive) {
      changeMeter(s, s.playerId, src.id, 'trust', -10);
      const tie = s.bonds?.ties[src.id];
      if (tie) remember(s, tie, 'lie', `what he told you: "${it.told}"`, -8);
      addStory(s, src, `Told the boss something that was not so.`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Your men's reports: what you were told                              */
/* ------------------------------------------------------------------ */

function reportsWeek(s: GameState): void {
  const I = ensureIntrigue(s);
  if (dice(s, 'report') >= 0.25) return;
  const tellers = ourMen(s).filter((c) => c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere');
  const c = pickOf(s, 'reporter', tellers);
  if (!c) return;
  const self = dice(s, `self:${c.id}`) < INTRIGUE_DECIDERS.selfServing(s, c);
  const d = s.districts.find((x) => x.capoId === c.id);
  if ((c.skimmed ?? 0) > 500 && self) {
    pushIntel(s, { id: newId(I, 'in'), week: s.week, sourceId: c.id, about: 'player', kind: 'report', told: `${displayName(c)}: "Slow week${d ? ` on ${d.name}` : ''}. The tourists aren't spending."`, truth: `${displayName(c)} had skimmed about ${fmtMoney(c.skimmed ?? 0)} for himself.`, true: false, learnAt: s.week + between(s, `sk:${c.id}`, 3, 7), motive: 'his own pocket' });
    return;
  }
  if (c.courtedBy && self) {
    pushIntel(s, { id: newId(I, 'in'), week: s.week, sourceId: c.id, about: c.courtedBy.rival, kind: 'report', told: `${displayName(c)}: "Nobody's been in my ear, boss. Nobody."`, truth: `${rname(c.courtedBy.rival)} had been courting ${displayName(c)} since week ${c.courtedBy.week}.`, true: false, learnAt: s.week + between(s, `ct:${c.id}`, 3, 8), motive: 'covering for himself' });
    return;
  }
  const r = pickOf(s, `rr:${c.id}`, mobs(s));
  if (!r) return;
  const hot = hasTrait(c, 'Hot-headed') || hasTrait(c, 'Ambitious');
  const weak = rivalStrength(s, r) < strengthTotal(s);
  // A hothead wants a war to make his name: he says they are soft whether they are or not.
  const saysWeak = hot && self ? true : weak;
  pushIntel(s, { id: newId(I, 'in'), week: s.week, sourceId: c.id, about: r.id, kind: 'strength', told: saysWeak ? `${displayName(c)}: "${rname(r.id)} is soft. Give me the word and we take their corners in a week."` : `${displayName(c)}: "Don't go near ${rname(r.id)} right now. They're stronger than they look."`, truth: weak ? `${rname(r.id)} was the weaker side.` : `${rname(r.id)} was the stronger side.`, true: saysWeak === weak, learnAt: s.week + between(s, `st:${c.id}`, 4, 9), motive: hot && self ? 'wants a war to make his name' : undefined });
}

/* ------------------------------------------------------------------ */
/* Canary traps                                                        */
/* ------------------------------------------------------------------ */

const TALES = ['a cash drop at the Ocean Avenue garage on Thursday night', 'a shipment of cigarettes coming in at the bay docks', 'you meeting Philadelphia at the Shamrock on Sunday', 'the card game moving to the back of the laundromat', 'a new bookie opening on Cresse Avenue', 'money hidden in the church hall\'s boiler room'];
export function taleFor(s: GameState, i: number, charId: string): string {
  return TALES[(i + Math.floor(hash(`${s.seed}|tale|${charId}`) * TALES.length)) % TALES.length];
}

function canariesWeek(ctx: Ctx): void {
  const s = ctx.s;
  const I = ensureIntrigue(s);
  for (const k of I.canaries) {
    if (k.result || k.checkWeek > s.week) continue;
    const caught = k.entries.find((e) => isMole(s.characters[e.charId]) && dice(s, `canary:${k.id}:${e.charId}`) < 0.85);
    if (caught) {
      const c = s.characters[caught.charId];
      const who = c.informantFor === 'law' ? 'The FBI' : rname(c.informantFor!);
      k.caught = c.id;
      k.result = `${who} acted on ${caught.tale}: only ${displayName(c)} had heard that one.`;
      confirmMole(s, c);
      for (const e of k.entries) if (e.charId !== c.id) I.suspect[e.charId] = Math.max(0, (I.suspect[e.charId] ?? 0) - 25);
      note(s, `The canary sang: ${k.result}`);
      ctx.log.push(`The canary trap caught ${displayName(c)}.`);
      queue(s, moleEvent(s, c, k.result));
    } else {
      k.result = 'Nothing came back. None of the tales reached anyone.';
      for (const e of k.entries) I.suspect[e.charId] = Math.max(0, (I.suspect[e.charId] ?? 0) - 25);
      note(s, `The canary trap: nothing came back from ${k.entries.map((e) => displayName(s.characters[e.charId])).join(', ')}.`);
    }
  }
  I.canaries = I.canaries.filter((k) => !k.result || s.week - k.checkWeek < 20);
}

/* ------------------------------------------------------------------ */
/* Events (the boss's decisions)                                       */
/* ------------------------------------------------------------------ */

function queue(s: GameState, ev: EventInstance | undefined): void {
  if (!ev) return;
  ev.meta = { ...(ev.meta ?? {}), theme: 'rivals' };
  s.eventQueue.push(ev);
  ensureIntrigue(s).cd.lastEvent = s.week;
}
function canQueue(s: GameState): boolean {
  const I = ensureIntrigue(s);
  if ((I.cd.lastEvent ?? -99) >= s.week) return false;
  return !s.eventQueue.some((e) => e.defId.startsWith('intrigue_')) && !s.pendingEvents.some((e) => e.defId.startsWith('intrigue_'));
}
function ev(s: GameState, defId: string, title: string, text: string, choices: Choice[], def: string, meta: Record<string, string | number>, actors: string[] = [], priority = 58): EventInstance {
  return { iid: `ev${s.nextId++}`, defId, week: s.week, mandatory: false, priority, title, text, choices, defaultChoiceId: def, meta: { intr: defId, ...meta }, actors };
}

/** A man of yours is known to talk to someone else. The default never harms him. */
export function moleEvent(s: GameState, c: Character, why: string): EventInstance {
  const who = c.informantFor === 'law' ? 'the FBI' : lname(c.informantFor ?? 'none');
  return ev(s, 'intrigue_mole', `${displayName(c)} talks to ${who}`, `${why} What do you want done about ${c.firstName}? Nothing happens to him unless you say so.`, [
    { id: 'watch', label: 'Say nothing. Watch him.', detail: 'He does not know you know. Decide later (the Intrigue board).', because: `kept quiet about ${displayName(c)}`, effects: [] },
    { id: 'feed', label: 'Keep him, and feed him lies', detail: 'His masters act on your stories. Dangerous if he works it out.', because: `fed ${displayName(c)} stories for his masters`, effects: [] },
    { id: 'exile', label: 'Send him away from Wildwood', detail: 'He leaves the family. He will hate you for it.', because: `sent ${displayName(c)} away`, effects: [{ type: 'exile', charId: c.id }] },
  ], 'watch', { charId: c.id }, [c.id], 66);
}

function accuseEvent(s: GameState, r: Rival, guilty: boolean, what: string): EventInstance {
  const L = s.characters[r.leaderId];
  const others = mobs(s).filter((x) => x.id !== r.id);
  const third = pickOf(s, `third:${r.id}`, others);
  const strong = strengthTotal(s) >= rivalStrength(s, r);
  const choices: Choice[] = [
    { id: 'truth', label: guilty ? 'Own it, and pay for the damage' : 'Tell him the truth: it wasn\'t you', detail: guilty ? 'Costs money; cools things down.' : 'True, and he may believe it.', because: guilty ? `owned up to ${r.shortName}` : `told ${r.shortName} the truth`, effects: guilty ? [{ type: 'money', amount: -2000, label: `Reparations to ${r.shortName}` }, { type: 'respect', amount: -1, label: 'Paid for the damage' }] : [] },
    { id: 'deny', label: guilty ? 'Deny it to his face' : 'Deny it, and be insulted he asked', detail: guilty ? 'A lie. It may come out later.' : 'True.', because: `denied it to ${r.shortName}`, effects: [] },
  ];
  if (third) choices.push({ id: 'blame', label: `Point him at ${third.shortName}`, detail: 'A false flag: set them on each other. If it comes out, both come for you.', because: `pointed ${r.shortName} at ${third.shortName}`, effects: [] });
  choices.push({ id: 'bluff', label: strong ? 'Remind him who is stronger' : 'Bluff: tell him you have more men than he thinks', detail: strong ? 'True. He may back off, or not.' : 'A bluff. If he tests it, it costs you.', because: `leaned on ${r.shortName}`, effects: [{ type: 'respect', amount: 1, label: 'Stood up to them' }] });
  return ev(s, 'intrigue_accuse', `${r.shortName} wants an answer`, `${displayName(L)} sends a man to the Shamrock: they know about ${what}, and they want to hear it from you.`, choices, 'deny', { rival: r.id, guilty: guilty ? 1 : 0, third: third?.id ?? '', strong: strong ? 1 : 0 }, [r.leaderId], 60);
}

function denialEvent(s: GameState, r: Rival, real: RivalId, what: string): EventInstance {
  const L = s.characters[r.leaderId];
  return ev(s, 'intrigue_denial', `${r.shortName}: "It wasn't us"`, `${displayName(L)} sends word before you can ask: ${what} was not his doing, on his mother's grave.`, [
    { id: 'believe', label: 'Take him at his word', because: `took ${r.shortName} at his word`, effects: [] },
    { id: 'doubt', label: 'Tell him you\'ll find out', detail: 'Tension goes up; if he lied, you will learn it.', because: `told ${r.shortName} you would find out`, effects: [{ type: 'respect', amount: 1, label: 'Not fooled' }] },
  ], 'believe', { rival: r.id, real }, [r.leaderId], 54);
}

function marriageEvent(s: GameState, r: Rival): EventInstance {
  const L = s.characters[r.leaderId];
  return ev(s, 'intrigue_marriage', `A match with the ${r.shortName}s`, `${displayName(L)}'s wife has a niece of marrying age, and your cousin's boy has been seen walking her home from Mass. ${L.firstName} says a wedding between the families would be good for business.`, [
    { id: 'bless', label: 'Bless the match (pay for the wedding)', detail: 'Peace for years: tension falls, his opinion rises.', because: `blessed a marriage with the ${r.shortName}s`, effects: [{ type: 'money', amount: -2500, label: 'A wedding between the families' }, { type: 'respect', amount: 2, label: 'A wedding between the families' }, { type: 'rivalOpinion', rival: r.id, amount: 15, reason: 'Our families are joined' }] },
    { id: 'decline', label: 'Not this year', because: `turned down a match with the ${r.shortName}s`, effects: [] },
  ], 'decline', { rival: r.id }, [r.leaderId], 52);
}

function ventureEvent(s: GameState, r: Rival, skim: boolean): EventInstance {
  const L = s.characters[r.leaderId];
  return ev(s, 'intrigue_venture', `${r.shortName} offers a joint venture`, `${displayName(L)} has a piece of the new vending route on the boardwalk and wants a partner: ${fmtMoney(4000)} in, and ${fmtMoney(350)} a week back for twenty weeks. His word is good. Probably.`, [
    { id: 'in', label: `Go in (${fmtMoney(4000)})`, detail: 'Peace pays: a weekly take. If he skims, you may find out.', because: `went into business with ${r.shortName}`, effects: [{ type: 'money', amount: -4000, label: `Joint venture with ${r.shortName}` }] },
    { id: 'out', label: 'Pass', because: `passed on ${r.shortName}'s venture`, effects: [] },
  ], 'out', { rival: r.id, skim: skim ? 1 : 0 }, [r.leaderId], 52);
}

function hotheadEvent(s: GameState, c: Character, r: Rival, ours: boolean): EventInstance {
  if (ours) return ev(s, 'intrigue_hothead', `${displayName(c)} started something`, `${displayName(c)} put one of ${r.shortName}'s men through the window of the Anchor Bar over a remark about his sister. ${r.shortName} wants to know if it was your idea.`, [
    { id: 'discipline', label: 'Make him apologize; send flowers', detail: 'Cools it. He will sulk.', because: `made ${displayName(c)} apologize to ${r.shortName}`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -8, reason: 'Made me apologize to them' }, { type: 'money', amount: -500, label: 'Flowers and a doctor' }] },
    { id: 'back', label: 'Back your man', detail: 'The crew loves it. The families inch toward war.', because: `backed ${displayName(c)} against ${r.shortName}`, effects: [{ type: 'respect', amount: 2, label: 'Backed his man' }, { type: 'crewOpinion', amount: 2, reason: 'The boss stands behind his men' }] },
  ], 'discipline', { rival: r.id, charId: c.id, ours: 1 }, [c.id, r.leaderId], 57);
  return ev(s, 'intrigue_hothead', `${displayName(c)} of the ${r.shortName}s`, `${displayName(c)}, ${r.shortName}'s hothead, slapped one of your soldiers in front of the whole Anchor Bar and said your family was finished.`, [
    { id: 'demand', label: 'Demand an apology from his boss', detail: 'They may give it. Or not.', because: `demanded an apology from ${r.shortName}`, effects: [{ type: 'respect', amount: 1, label: 'Demanded an apology' }] },
    { id: 'answer', label: 'Answer in kind', detail: 'Respect now, a step closer to war.', because: `answered ${r.shortName}'s insult`, effects: [{ type: 'respect', amount: 2, label: 'Answered the insult' }, { type: 'heat', bar: 'local', amount: 2, label: 'A brawl on Pacific Avenue' }] },
    { id: 'let', label: 'Let it go', because: `let ${r.shortName}'s insult go`, effects: [{ type: 'respect', amount: -1, label: 'Let an insult go' }] },
  ], 'demand', { rival: r.id, charId: c.id, ours: 0 }, [c.id], 57);
}

function coupEvent(s: GameState, p: Plot, r: Rival): EventInstance {
  const pr = s.characters[p.actorId];
  const L = s.characters[r.leaderId];
  return ev(s, 'intrigue_coup', `A chair is shaking in the ${r.shortName} family`, `${displayName(pr)} has been counting votes among ${r.shortName}'s capos. He wants ${displayName(L)}'s chair, and he has sent word that a friend in your family would be remembered.`, [
    { id: 'pretender', label: `Back ${pr.firstName} (${fmtMoney(3000)})`, detail: 'If he wins, the new boss owes you. If he loses, the old one knows.', because: `backed ${displayName(pr)}'s play`, effects: [{ type: 'money', amount: -3000, label: `Backing ${pr.lastName}` }] },
    { id: 'boss', label: `Warn ${L.firstName}`, detail: 'The old boss will remember it.', because: `warned ${displayName(L)} about ${pr.firstName}`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: 20, reason: 'Warned me about the knife at my back' }] },
    { id: 'out', label: 'Stay out of it', because: `stayed out of ${r.shortName}'s trouble`, effects: [] },
  ], 'out', { rival: r.id, plot: p.id }, [p.actorId, r.leaderId], 62);
}

function betrayalEvent(s: GameState, p: Plot, c: Character, r: Rival): EventInstance {
  return ev(s, 'intrigue_betrayal', `${displayName(c)} and the ${r.shortName}s`, `Your driver saw ${displayName(c)} getting out of ${r.shortName}'s consigliere's Lincoln twice this month. It could be nothing. Nothing happens to him unless you say so.`, [
    { id: 'watch', label: 'Watch him. Say nothing.', because: `kept an eye on ${displayName(c)}`, effects: [] },
    { id: 'confront', label: 'Ask him straight out', detail: 'If he is clean, he will not forgive the question.', because: `asked ${displayName(c)} straight out`, effects: [] },
    { id: 'tale', label: 'Tell him a story and see where it goes', detail: 'A canary trap: in three weeks you will know.', because: `told ${displayName(c)} a story to see where it went`, effects: [] },
  ], 'watch', { rival: r.id, plot: p.id, charId: c.id }, [c.id], 63);
}

function inlawEvent(s: GameState, p: Plot, c: Character): EventInstance {
  return ev(s, 'intrigue_inlaw', `Your wife's brother`, `Somebody told the FBI who came to the christening. The guest list was in your wife's handwriting, and her brother ${displayName(c)} had it for an afternoon. He has been flush lately. Nothing happens to him unless you say so.`, [
    { id: 'nothing', label: 'Say nothing for now', because: 'kept quiet about your brother-in-law', effects: [] },
    { id: 'wife', label: 'Tell your wife', detail: 'She will deal with her own brother. It will cost her.', because: 'told your wife about her brother', effects: [{ type: 'opinion', from: s.characters[s.playerId].spouseId ?? s.playerId, to: s.playerId, amount: -5, reason: 'Told me my brother was a rat' }] },
    { id: 'freeze', label: 'Keep him away from family business', detail: 'The leak stops. He will feel it.', because: 'froze out your brother-in-law', effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -20, reason: 'Shut me out of the family' }] },
    { id: 'feed', label: 'Let him carry a story to the FBI', detail: 'They chase it; it buys time.', because: 'fed your brother-in-law a story for the FBI', effects: [{ type: 'heat', bar: 'federal', amount: -4, label: 'The FBI chases a false story' }] },
  ], 'nothing', { plot: p.id, charId: c.id }, [c.id], 63);
}

/** Answer the decisions this layer raised, after the week's choices are applied. */
export function intrigueResolve(ctx: Ctx, resolved: readonly EventInstance[], choices: PlayerChoices): void {
  const s = ctx.s;
  if (!s.intrigue) return;
  for (const e of resolved) {
    const kind = e.meta?.intr ? String(e.meta.intr) : undefined;
    if (!kind) continue;
    const wanted = choices.choices?.[e.iid];
    const ch = (e.choices.find((c) => c.id === wanted && !c.disabledReason) ?? e.choices.find((c) => c.id === e.defaultChoiceId) ?? e.choices[0])?.id;
    const r = e.meta?.rival ? s.rivals.find((x) => x.id === e.meta!.rival) : undefined;
    const c = e.meta?.charId ? s.characters[String(e.meta.charId)] : undefined;
    const I = s.intrigue;
    switch (kind) {
      case 'intrigue_accuse': {
        if (!r) break;
        const guilty = e.meta?.guilty === 1;
        if (ch === 'truth') bumpTension(s, 'player', r.id, guilty ? -18 : -6, guilty ? 'You owned it and paid' : 'You told them the truth');
        else if (ch === 'deny') {
          bumpTension(s, 'player', r.id, -6, 'You denied it');
          if (guilty) tellLie(s, { teller: 'player', to: r.id, kind: 'deny', text: 'You told them it was not you', truth: 'It was you', risk: 0.05, via: 'sitdown' });
        } else if (ch === 'blame') {
          const third = String(e.meta?.third ?? '') as RivalId;
          bumpTension(s, 'player', r.id, -10, `You pointed them at ${rname(third)}`);
          bumpTension(s, r.id, third, 25, `${rname(r.id)} believes ${rname(third)} did it`);
          const rk = s.talks?.rivalRel;
          if (rk && third) { const k = r.id < third ? `${r.id}|${third}` : `${third}|${r.id}`; rk[k] = Math.max(-100, (rk[k] ?? 0) - 25); }
          tellLie(s, { teller: 'player', to: r.id, kind: 'falseflag', text: `You told them ${rname(third)} did it`, truth: guilty ? 'It was you' : 'Nobody knows who did it', blame: third, risk: 0.07, via: 'sitdown' });
        } else if (ch === 'bluff') {
          const strong = e.meta?.strong === 1;
          if (strong || dice(s, `bluff:${e.iid}`) < 0.5) bumpTension(s, 'player', r.id, -4, 'They backed off');
          else bumpTension(s, 'player', r.id, 12, 'They called your bluff');
          if (!strong) tellLie(s, { teller: 'player', to: r.id, kind: 'bluff', text: 'You told them you had more men than you do', truth: 'They had more muscle', risk: 0.06, via: 'sitdown' });
        }
        break;
      }
      case 'intrigue_denial': {
        if (!r) break;
        const real = String(e.meta?.real ?? r.id) as RivalId;
        if (ch === 'doubt') bumpTension(s, 'player', r.id, 6, 'You doubted their word');
        if (real === r.id) tellLie(s, { teller: r.id, to: 'player', kind: 'deny', text: `${rname(r.id)} said it was not them`, truth: `It was ${rname(r.id)}`, risk: ch === 'doubt' ? 0.15 : 0.06, via: 'word' });
        break;
      }
      case 'intrigue_marriage':
        if (r && ch === 'bless') { bumpTension(s, 'player', r.id, -25, 'A wedding joined the families'); note(s, `A wedding between your family and ${lname(r.id)}.`); }
        break;
      case 'intrigue_venture':
        if (r && ch === 'in') {
          const p: Plot = { id: newId(I, 'pl'), kind: 'venture', faction: r.id, actorId: r.leaderId, stage: 0, startWeek: s.week, nextWeek: s.week + 20, known: true, weekly: 350, skim: e.meta?.skim === 1 };
          I.plots.push(p);
          bumpTension(s, 'player', r.id, -6, 'Partners in a venture');
        }
        break;
      case 'intrigue_hothead': {
        if (!r) break;
        const ours = e.meta?.ours === 1;
        if (ours) bumpTension(s, 'player', r.id, ch === 'back' ? 14 : -6, ch === 'back' ? `You backed your man ${c ? displayName(c) : ''}` : 'Your man apologized');
        else if (ch === 'demand') {
          if (dice(s, `apol:${e.iid}`) < 0.5) { bumpTension(s, 'player', r.id, -4, 'They apologized'); note(s, `${rname(r.id)} sent an apology for its hothead.`); }
          else bumpTension(s, 'player', r.id, 8, 'They refused to apologize');
        } else if (ch === 'answer') bumpTension(s, 'player', r.id, 15, 'You answered their insult in kind');
        else bumpTension(s, 'player', r.id, -2, 'You let it go');
        break;
      }
      case 'intrigue_coup': {
        const p = I.plots.find((x) => x.id === e.meta?.plot);
        if (p && (ch === 'pretender' || ch === 'boss')) p.backed = ch;
        break;
      }
      case 'intrigue_betrayal': {
        const p = I.plots.find((x) => x.id === e.meta?.plot);
        if (!c || !p) break;
        const guilty = isMole(c) || !!c.courtedBy;
        if (ch === 'confront') {
          if (isMole(c)) { confirmMole(s, c); note(s, `${displayName(c)} broke down: he has been talking to ${c.informantFor === 'law' ? 'the FBI' : rname(c.informantFor!)}. What happens to him is your call (the Intrigue board).`); }
          else if (guilty) { c.courtedBy = undefined; addOpinion(s, c.id, s.playerId, 'The boss knew. He let me off.', 5, 1); note(s, `${displayName(c)} swore he only listened to their offer. He will not listen again.`); }
          else { addOpinion(s, c.id, s.playerId, 'The boss thought I was a rat', -15, 1); note(s, `${displayName(c)} was clean, and he will remember that you asked.`); }
          p.ended = s.week;
          p.outcome = 'confronted';
        } else if (ch === 'tale') {
          I.canaries.push({ id: newId(I, 'cn'), week: s.week, checkWeek: s.week + 3, entries: [{ charId: c.id, tale: taleFor(s, 0, c.id) }] });
          p.ended = s.week;
          p.outcome = 'tested';
        }
        if (guilty) suspicionUp(s, c.id, 10);
        break;
      }
      case 'intrigue_inlaw': {
        const p = I.plots.find((x) => x.id === e.meta?.plot);
        if (!c || !p) break;
        if (ch === 'wife' || ch === 'freeze') { if (c.informantFor === 'law' && c.faction !== 'player') c.informantFor = undefined; p.ended = s.week; p.outcome = ch; }
        else if (ch === 'feed') { tellLie(s, { teller: 'player', to: 'law', kind: 'canary', text: 'A story carried to the FBI by your brother-in-law', truth: 'There was nothing to it', risk: 0.03, via: 'word' }); }
        break;
      }
      case 'intrigue_mole': {
        if (!c) break;
        if (ch === 'feed' && c.informantFor) feedMole(s, c);
        break;
      }
    }
  }
}

/** The boss keeps a known mole and feeds his masters lies (his explicit choice). */
export function feedMole(s: GameState, c: Character): void {
  const I = ensureIntrigue(s);
  if (I.spies.some((x) => x.charId === c.id && !x.ended)) return;
  const sp: Spy = { id: newId(I, 'sp'), charId: c.id, master: c.informantFor!, inside: 'player', how: 'planted', since: s.week, cover: 60, doubled: 'player' };
  I.spies.push(sp);
  note(s, `${displayName(c)} carries your stories to ${c.informantFor === 'law' ? 'the FBI' : rname(c.informantFor!)} now.`);
  emit(s, { type: 'spy', spy: sp, what: 'doubled' });
}

/* ------------------------------------------------------------------ */
/* Plots                                                               */
/* ------------------------------------------------------------------ */

function plotsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const I = ensureIntrigue(s);
  // New plots.
  for (const r of mobs(s)) {
    const cdk = `coup:${r.id}`;
    if (s.week - (I.cd[cdk] ?? -999) < 52 || I.plots.some((p) => p.kind === 'coup' && p.faction === r.id && !p.ended)) continue;
    const L = s.characters[r.leaderId];
    const old = L ? s.date.y - L.birth.y >= 66 : false;
    const unrest = s.week - (I.cd[`unrest:${r.id}`] ?? -999) < 12;
    const p0 = 0.01 + (old ? 0.02 : 0) + (r.muscle < 30 ? 0.01 : 0) + (unrest ? 0.08 : 0);
    if (dice(s, cdk) >= p0) continue;
    const men = theirMen(s, r.id);
    const pr = men.find((c) => hasTrait(c, 'Ambitious')) ?? pickOf(s, `pr:${r.id}`, men);
    if (!pr) continue;
    I.cd[cdk] = s.week;
    const spy = I.spies.some((x) => x.master === 'player' && x.inside === r.id && !x.ended && !x.doubled);
    const p: Plot = { id: newId(I, 'pl'), kind: 'coup', faction: r.id, actorId: pr.id, targetId: r.leaderId, stage: 0, startWeek: s.week, nextWeek: s.week + 4, known: spy || dice(s, `known:${r.id}`) < 0.35 };
    I.plots.push(p);
    if (p.known) note(s, `${displayName(pr)} is counting chairs in ${lname(r.id)}${spy ? ' (from your man inside)' : ' (the street talks)'}.`);
    emit(s, { type: 'plot', plot: p });
  }
  // One of your capos and a rival.
  if (s.week - (I.cd.betrayal ?? -999) >= 26) {
    const c = ourMen(s).find((m) => (m.rank === 'capo' || m.rank === 'underboss') && ((m.courtedBy && opinion(s, m.id, s.playerId) < 15) || (m.informantFor && m.informantFor !== 'player' && m.informantFor !== 'law')));
    const fac = c ? (c.courtedBy?.rival ?? c.informantFor) as FactionId : undefined;
    if (c && fac && dice(s, `betray:${c.id}`) < 0.2) {
      I.cd.betrayal = s.week;
      I.plots.push({ id: newId(I, 'pl'), kind: 'betrayal', faction: fac, actorId: c.id, stage: 0, startWeek: s.week, nextWeek: s.week + 3, known: false });
    }
  }
  // Your wife's brother and the FBI.
  if (!I.cd.inlaw && s.heat.federal >= 25 && dice(s, 'inlaw') < 0.03) {
    const boss = s.characters[s.playerId];
    const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
    const fa = wife?.fatherId ? s.characters[wife.fatherId] : undefined;
    const bro = fa?.childrenIds.map((id) => s.characters[id]).find((x) => x && x.alive && x.gender === 'M' && x.id !== wife?.id && x.faction !== 'player');
    if (bro) {
      I.cd.inlaw = s.week;
      bro.informantFor = 'law';
      I.plots.push({ id: newId(I, 'pl'), kind: 'inlaw', faction: 'law', actorId: bro.id, stage: 0, startWeek: s.week, nextWeek: s.week + 3, known: false });
    }
  }

  // Plots move.
  for (const p of I.plots) {
    if (p.ended) continue;
    const r = s.rivals.find((x) => x.id === p.faction);
    const actor = s.characters[p.actorId];
    if (!actor?.alive) { p.ended = s.week; p.outcome = 'gone'; continue; }
    if (p.kind === 'venture') {
      if (!r || !s.characters[r.leaderId]?.alive || s.week >= p.nextWeek) { p.ended = s.week; p.outcome = 'done'; continue; }
      const pay = p.skim ? Math.round((p.weekly ?? 0) * 0.6) : p.weekly ?? 0;
      applyEffects(ctx, [{ type: 'money', amount: pay, category: 'business', label: `Joint venture with ${r.shortName}` }], { label: 'Joint venture', because: 'took your share of the venture', category: 'business' });
      if (p.skim && p.stage === 0 && s.week - p.startWeek >= 6) {
        p.stage = 1;
        tellLie(s, { teller: r.id, to: 'player', kind: 'report', text: `${rname(r.id)} said the venture's take was all there`, truth: `${rname(r.id)} skimmed four dollars of every ten from the venture`, risk: I.spies.some((x) => x.master === 'player' && x.inside === r.id && !x.ended && !x.doubled) ? 0.5 : 0.1, via: 'word' });
      }
      continue;
    }
    if (s.week < p.nextWeek) continue;
    if (p.kind === 'coup' && r) {
      if (p.stage === 0) {
        p.stage = 1;
        p.nextWeek = s.week + between(s, `cst:${p.id}`, 5, 8);
        r.muscle = Math.max(5, r.muscle - 4);
        if (p.known && canQueue(s)) queue(s, coupEvent(s, p, r));
        else if (!p.known && dice(s, `late:${p.id}`) < 0.5) { p.known = true; note(s, `${lname(r.id)} is split: ${displayName(actor)} against ${displayName(s.characters[r.leaderId])}.`); }
      } else {
        const old = s.characters[r.leaderId];
        const win = dice(s, `coup:${p.id}`) < INTRIGUE_DECIDERS.coup(s, p);
        p.ended = s.week;
        if (win && old) {
          old.faction = 'none';
          old.rank = 'civilian';
          addStory(s, old, `Lost his chair to ${displayName(actor)} and retired to Florida.`);
          actor.rank = 'boss';
          r.leaderId = actor.id;
          p.outcome = 'won';
          const t = I.eras[pairKey('player', r.id)];
          if (p.backed === 'pretender') { addOpinion(s, actor.id, s.playerId, 'Backed me when it counted', 35, 0); if (t) t.tension = Math.max(0, t.tension - 30); }
          else if (p.backed === 'boss') addOpinion(s, actor.id, s.playerId, 'Warned the old man about me', -30, 0);
          const text = `${displayName(actor)} took ${lname(r.id)} from ${displayName(old)}${p.backed === 'pretender' ? ', with your money behind him' : ''}.`;
          note(s, text);
          ctx.log.push(text);
          s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'rival' });
          pressItem(s, { s: 'blotter', h: 'LOCAL MAN MOVES SOUTH', b: `${old.firstName} ${old.lastName}, described by neighbors as a retired businessman, has sold his house on Juniper Avenue and moved to Florida. He left in a hurry, they said.`, p: 35, a: 'rival' });
        } else {
          p.outcome = 'failed';
          if (p.backed === 'pretender' && old) { addOpinion(s, old.id, s.playerId, 'Backed the knife at my back', -30, 0); bumpTension(s, 'player', r.id, 25, 'You backed the man who tried to take their chair'); }
          const text = `${displayName(actor)} made his play for ${lname(r.id)} and lost. He has not been seen since.`;
          // Off-screen: the family settles its own affairs.
          import_kill(ctx, actor.id, r.id);
          note(s, text);
          ctx.log.push(text);
        }
        emit(s, { type: 'plot', plot: p });
      }
    } else if (p.kind === 'betrayal' && r) {
      if (p.stage === 0) {
        p.stage = 1;
        p.known = true;
        p.nextWeek = s.week + 6;
        suspicionUp(s, actor.id, 15);
        if (canQueue(s)) queue(s, betrayalEvent(s, p, actor, r));
      } else {
        // Left alone, he takes their money for your secrets: never his own crew, never without your word.
        p.ended = s.week;
        p.outcome = 'skimmed';
        actor.skimmed = (actor.skimmed ?? 0) + 1500;
        bumpTension(s, 'player', r.id, 5, `${rname(r.id)} knows more about your business than it should`);
        suspicionUp(s, actor.id, 10);
        note(s, `${displayName(actor)} has been selling ${rname(r.id)} what he hears at your table.`);
      }
    } else if (p.kind === 'inlaw') {
      if (p.stage === 0) {
        p.stage = 1;
        p.known = true;
        p.nextWeek = s.week + 12;
        if (canQueue(s)) queue(s, inlawEvent(s, p, actor));
      } else {
        p.ended = s.week;
        p.outcome = 'went on';
        if (actor.informantFor === 'law') applyEffects(ctx, [{ type: 'heat', bar: 'federal', amount: 2, label: 'Your brother-in-law talks to the FBI' }], { label: 'A leak at home', because: 'let a leak at home go on' });
      }
    }
  }
  I.plots = I.plots.filter((p) => !p.ended || s.week - p.ended < 40);
}

// The off-screen end of a failed pretender (kept in one place).
function import_kill(ctx: Ctx, id: string, by: RivalId): void {
  killCharacter(ctx, id, 'was never seen again after a failed bid for his boss\'s chair', by);
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

const PLAYER_ENTER: [Era, number, number][] = [['cold', 72, 60], ['tension', 42, 32]];

function nextEraByTension(t: EraTrack): Era {
  // Hysteresis: easy to stay, harder to cross.
  for (const [era, enter, leave] of PLAYER_ENTER) {
    const at = ERA_ORDER[t.era] >= ERA_ORDER[era] && t.era !== 'war' && t.era !== 'truce' ? leave : enter;
    if (t.tension >= at) return era;
  }
  return 'peace';
}

/** The real events of the week that move the eras. */
function readTheWeek(ctx: Ctx): void {
  const s = ctx.s;
  const I = ensureIntrigue(s);
  for (const r of mobs(s)) {
    const t = I.eras[pairKey('player', r.id)];
    if (!t) continue;
    const m = r.lastMove;
    if (m && m.week === s.week && m.target === 'player') {
      if (m.move === 'strike') { bumpTension(s, 'player', r.id, 12, `${r.shortName} struck at one of your places`); I.cd[`struck:${r.id}`] = s.week; }
      else if (m.move === 'expand') bumpTension(s, 'player', r.id, 6, `${r.shortName} pushed onto your corners`);
      else if (m.move === 'inform' || m.move === 'bribe') bumpTension(s, 'player', r.id, 4, `${r.shortName} worked against you`);
    }
    // The player pushing into their ground.
    for (const d of s.districts) {
      if ((d.influence[r.id] ?? 0) < 8) continue;
      const was = I.seen.inf[d.id];
      const now = d.influence.player ?? 0;
      if (was !== undefined && now > was) {
        const border = t.settlement && t.settlement.until > s.week && t.settlement.border === d.id;
        bumpTension(s, 'player', r.id, Math.min(12, (now - was) * (border ? 4 : 2)), border ? `You crossed the border in ${d.name}` : `You pushed into ${d.name}`);
        I.cd[`guilty:${r.id}`] = s.week;
        I.cd[`guiltyWhat:${r.id}`] = s.districts.indexOf(d);
      }
    }
    // Baseline from how their boss feels about you; pacts calm things.
    const op = opinion(s, r.leaderId, s.playerId);
    const pact = s.talks?.pacts.some((p) => p.until > s.week && ((p.a === 'player' && p.b === r.id) || (p.b === 'player' && p.a === r.id)));
    const base = Math.max(5, Math.min(60, 20 - Math.round(op / 2))) - (pact ? 10 : 0);
    if (t.era !== 'war') {
      if (t.tension > base) t.tension = Math.max(base, t.tension - (pact ? 4 : 2));
      else if (t.tension < base && s.week % 2 === 0) t.tension += 1;
    }
  }
  // Bodies.
  for (const id in s.characters) {
    const c = s.characters[id];
    if (c.alive || !c.death || c.death.week < I.seen.week || c.death.week > s.week) continue;
    const k = c.death.killer;
    if (k === 'player' && mobs(s).some((r) => r.id === c.faction)) {
      bumpTension(s, 'player', c.faction, 25, `One of theirs, ${displayName(c)}, turned up dead`);
      I.cd[`guilty:${c.faction}`] = s.week;
      I.cd[`guiltyHit:${c.faction}`] = s.week;
      for (const l of I.ledgers) if (!l.endWeek && l.rival === c.faction) { l.theirsLost++; ledgerNote(l, s.week, `${displayName(c)} of ${rname(c.faction)} is gone.`); }
    } else if (c.faction === 'player' && k && mobs(s).some((r) => r.id === k)) {
      bumpTension(s, 'player', k, 20, `They killed your man ${displayName(c)}`);
      for (const l of I.ledgers) if (!l.endWeek && l.rival === k) { l.menLost++; ledgerNote(l, s.week, `You lost ${displayName(c)}.`); }
    }
  }
  // The families among themselves: their own relations drive their eras.
  const rel = s.talks?.rivalRel ?? {};
  for (const t of Object.values(I.eras)) {
    if (t.a === 'player') continue;
    const k = t.a < t.b ? `${t.a}|${t.b}` : `${t.b}|${t.a}`;
    const target = Math.max(0, Math.min(100, Math.round(15 - (rel[k] ?? 0) * 0.9)));
    t.tension = Math.round(t.tension + (target - t.tension) * 0.35);
  }
}

function erasWeek(ctx: Ctx): void {
  const s = ctx.s;
  const I = ensureIntrigue(s);
  for (const t of Object.values(I.eras)) {
    if (t.a === 'player') {
      const r = s.rivals.find((x) => x.id === t.b);
      if (!r || !s.characters[r.leaderId]?.alive) continue;
      const w = s.wars.find((x) => x.rival === r.id);
      if (w) {
        ensureLedger(s, w);
        if (t.era !== 'war') setEra(ctx, t, 'war', t.tension >= 80 ? t.cause : 'The mattresses came out');
        t.tension = Math.max(t.tension, 85);
        continue;
      }
      if (t.era === 'war') {
        // A war ended without terms (the Table, a dead boss): a plain truce.
        if (!t.settlement || t.settlement.week < s.week - 1) t.settlement = { week: s.week, until: s.week + 8, weekly: 0, text: 'nobody pays; the Table keeps the peace', paid: 0 };
        t.tension = Math.min(t.tension, 45);
        setEra(ctx, t, 'truce', 'The shooting stopped');
        continue;
      }
      if (t.era === 'truce') {
        if (t.tension >= 80) { t.settlement = undefined; setEra(ctx, t, 'cold', 'The truce broke'); }
        else if (!t.settlement || t.settlement.until <= s.week) { t.settlement = undefined; t.tension = Math.min(t.tension, 25); setEra(ctx, t, t.tension >= 42 ? 'tension' : 'peace', 'The settlement ran its course'); }
        continue;
      }
      const next = nextEraByTension(t);
      if (next !== t.era) setEra(ctx, t, next, t.cause);
      // NPC ambition: a cold war becomes a shooting war.
      if (t.era === 'cold' && s.week - t.since >= 6 && t.tension >= 85 && dice(s, `declare:${r.id}`) < INTRIGUE_DECIDERS.declareWar(s, r, t)) rivalDeclares(ctx, r, t);
    } else {
      // Two families: war at the top, a truce after.
      const next: Era = t.era === 'war' ? (t.tension < 70 ? 'truce' : 'war') : t.era === 'truce' ? (s.week - t.since >= 8 ? (t.tension >= 42 ? 'tension' : 'peace') : 'truce') : t.tension >= 88 ? 'war' : t.tension >= 65 ? 'cold' : t.tension >= 40 ? 'tension' : 'peace';
      if (next !== t.era) setEra(ctx, t, next, next === 'war' ? 'A hothead\'s fight turned into a war' : next === 'truce' ? 'They sat down and split the ground' : t.cause);
    }
  }
}

function rivalDeclares(ctx: Ctx, r: Rival, t: EraTrack): void {
  const s = ctx.s;
  const contested = s.districts.filter((d) => (d.influence[r.id] ?? 0) >= 5 && (d.influence.player ?? 0) >= 5).sort((a, b) => (b.influence[r.id] ?? 0) - (a.influence[r.id] ?? 0));
  const d = contested[0] ?? s.districts.find((x) => x.id === r.homeDistrict) ?? s.districts[0];
  const w: War = { id: `w${s.nextId++}`, rival: r.id, district: d.id, cb: 'feud', sanctioned: false, score: 0, startWeek: s.week, by: r.id };
  s.wars.push(w);
  r.war = true;
  ensureLedger(s, w);
  const text = `${displayName(s.characters[r.leaderId])} went to the mattresses: ${r.name} is at war with you over ${d.name}.`;
  ctx.log.push(text);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'rival' });
  if (s.cutscenes.length < 2) s.cutscenes.push({ key: 'sitdown', title: 'War', text, week: s.week });
  setEra(ctx, t, 'war', `${r.shortName} declared war`);
}

/** The rules of each era, each week. */
function eraRulesWeek(ctx: Ctx): void {
  const s = ctx.s;
  const I = ensureIntrigue(s);
  let peaceful = 0;
  for (const t of Object.values(I.eras)) {
    const r = s.rivals.find((x) => x.id === t.b);
    if (!r || !s.characters[r.leaderId]?.alive) continue;
    if (t.a !== 'player') {
      // Two families at war bleed each other: an opening for the boss.
      if (t.era === 'war') {
        for (const f of [t.a, t.b]) {
          const x = s.rivals.find((y) => y.id === f);
          if (x) { x.muscle = Math.max(5, x.muscle - 1); x.money = Math.max(0, Math.round(x.money * 0.98)); }
        }
      }
      continue;
    }
    if (t.era === 'peace') {
      peaceful++;
      if (s.week - t.since >= 13 && (s.week - t.since) % 13 === 0) applyEffects(ctx, [{ type: 'respect', amount: 1, label: `A season of peace with ${r.shortName}` }], { label: 'Peace', because: 'kept the peace' });
    } else if (t.era === 'war') {
      const w = s.wars.find((x) => x.rival === r.id);
      if (!w) continue;
      const l = ensureLedger(s, w);
      // What the war cost this week: the raids, the mattresses.
      for (const line of ctx.lines) if (line.stat === 'money' && line.amount < 0 && /^Raid on /.test(line.label) && line.label.includes(r.shortName)) l.spent += -line.amount;
      // Rackets taken: while you are winning, their book in the district comes to you.
      if (w.score > 0) {
        const d = s.districts.find((x) => x.id === w.district);
        const take = Math.min(Math.max(0, Math.round(r.money * 0.05)), Math.round((d?.streetBase ?? 200) * (w.score / 100) * 4));
        if (take >= 50) {
          r.money -= take;
          applyEffects(ctx, [{ type: 'money', amount: take, category: 'street', label: `Rackets taken from ${r.shortName} in ${d?.name ?? 'the district'}` }], { label: 'Spoils of war', because: `took ${r.shortName}'s rackets`, category: 'street' });
          l.gained += take;
        }
      }
      if (s.week % 2 === 0) {
        applyEffects(ctx, [{ type: 'heat', bar: 'local', amount: 1, label: `Open war with ${r.shortName}: cops on every corner` }], { label: 'Open war', because: '' });
      }
      if ((s.week - w.startWeek) > 0 && (s.week - w.startWeek) % 4 === 0) {
        applyEffects(ctx, [{ type: 'heat', bar: 'family', amount: 1, label: 'Philadelphia is worried about the noise' }], { label: 'The Commission is worried', because: '' });
        ledgerNote(l, s.week, 'Philadelphia sent word: the noise is bad for everybody.');
      }
    } else if (t.era === 'truce' && t.settlement && t.settlement.until > s.week && t.settlement.weekly) {
      const st = t.settlement;
      const amt = st.weekly > 0 ? Math.min(st.weekly, Math.max(0, r.money)) : st.weekly;
      if (amt) {
        r.money -= amt;
        applyEffects(ctx, [{ type: 'money', amount: amt, category: 'tribute', label: amt > 0 ? `Tribute from ${r.shortName} (the settlement)` : `Reparations to ${r.shortName} (the settlement)` }], { label: 'The settlement', because: 'kept the settlement', category: 'tribute' });
        st.paid += amt;
        const l = I.ledgers.filter((x) => x.rival === r.id && x.endWeek !== undefined).slice(-1)[0];
        if (l) { if (amt > 0) l.gained += amt; else l.spent += -amt; }
      }
    } else if (t.era === 'cold') {
      // Sabotage: a load goes missing.
      if (dice(s, `sab:${r.id}`) < 0.08) {
        const lost = Math.min(Math.max(0, Math.round(s.money * 0.02)), between(s, `sabamt:${r.id}`, 400, 1500));
        if (lost > 0) {
          applyEffects(ctx, [{ type: 'money', amount: -lost, category: 'rival', label: `Sabotage: a load went missing (${r.shortName}?)` }], { label: 'Sabotage', because: '', category: 'rival' });
          note(s, `A load of yours went into the bay. Nobody saw anything. Everybody thinks ${r.shortName}.`);
        }
      }
      // Their spies get busy.
      if (!s.flags[`plant_${r.id}`] && dice(s, `spies:${r.id}`) < 0.08) s.flags[`plant_${r.id}`] = s.week;
    }
  }
  // Peace pays: business between the families, every month.
  if (peaceful && s.week % 4 === 0) applyEffects(ctx, [{ type: 'money', amount: 150 * peaceful, category: 'business', label: `Peace dividend: business with ${peaceful} famil${peaceful > 1 ? 'ies' : 'y'}` }], { label: 'Peace pays', because: 'did business in peacetime', category: 'business' });
}

/** At most one decision a week from here, through the director. */
function eventsWeek(s: GameState): void {
  const I = ensureIntrigue(s);
  if (!canQueue(s) || s.week - (I.cd.lastEvent ?? -99) < 3) return;
  for (const r of mobs(s)) {
    const t = I.eras[pairKey('player', r.id)];
    if (!t) continue;
    // They struck you: they get their denial in first, sometimes for another family's work.
    if ((I.cd[`struck:${r.id}`] ?? -99) === s.week && t.era !== 'war' && dice(s, `deny:${r.id}`) < 0.4) {
      const other = mobs(s).find((x) => x.id !== r.id && dice(s, `ff:${x.id}`) < 0.3);
      if (other) {
        // An NPC false flag: you are told it was someone else.
        plantFalseBelief(s, { about: r.id, told: `The word on the docks: it was ${rname(other.id)} who hit your place.`, truth: `It was ${rname(r.id)}, dressed up to look like ${rname(other.id)}.`, kind: 'report', learnIn: between(s, `ffl:${r.id}`, 5, 10) });
        note(s, `The word on the docks says ${rname(other.id)} hit your place.`);
        return;
      }
      queue(s, denialEvent(s, r, r.id, 'the fire at your place'));
      return;
    }
    // You did something to them: they want an answer.
    if ((t.era === 'tension' || t.era === 'cold') && s.week - (I.cd[`guilty:${r.id}`] ?? -99) <= 2 && s.week - (I.cd[`accuse:${r.id}`] ?? -99) >= 8 && dice(s, `acc:${r.id}`) < 0.6) {
      I.cd[`accuse:${r.id}`] = s.week;
      const hit = s.week - (I.cd[`guiltyHit:${r.id}`] ?? -99) <= 2;
      const d = s.districts[I.cd[`guiltyWhat:${r.id}`] ?? -1];
      queue(s, accuseEvent(s, r, true, hit ? 'what happened to their man' : `your people on their corners in ${d?.name ?? 'their district'}`));
      return;
    }
    // A false accusation: someone is setting you against them.
    if (t.era === 'tension' && s.week - (I.cd[`accuse:${r.id}`] ?? -99) >= 12 && dice(s, `facc:${r.id}`) < 0.05) {
      I.cd[`accuse:${r.id}`] = s.week;
      queue(s, accuseEvent(s, r, false, 'the truck of theirs that went into the bay'));
      return;
    }
    // Peace: a marriage, a venture.
    if (t.era === 'peace' && s.week - t.since >= 8) {
      if (s.week - (I.cd[`marry:${r.id}`] ?? -999) >= 52 && dice(s, `marry:${r.id}`) < 0.04) { I.cd[`marry:${r.id}`] = s.week; queue(s, marriageEvent(s, r)); return; }
      if (s.week - (I.cd[`venture:${r.id}`] ?? -999) >= 26 && dice(s, `vent:${r.id}`) < 0.05) {
        I.cd[`venture:${r.id}`] = s.week;
        const L = s.characters[r.leaderId];
        const skim = hasTrait(L, 'Greedy') || opinion(s, L.id, s.playerId) < 0 || dice(s, `skim:${r.id}`) < 0.25;
        queue(s, ventureEvent(s, r, skim));
        return;
      }
    }
    // Hotheads.
    if ((t.era === 'tension' || t.era === 'cold') && s.week - (I.cd.hothead ?? -99) >= 10 && dice(s, `hot:${r.id}`) < 0.07) {
      I.cd.hothead = s.week;
      const ours = ourMen(s).filter((c) => hasTrait(c, 'Hot-headed') && c.rank !== 'consigliere');
      const theirs = theirMen(s, r.id).filter((c) => hasTrait(c, 'Hot-headed'));
      const mine = dice(s, `hotside:${r.id}`) < 0.5 ? ours[0] : undefined;
      const c = mine ?? theirs[0] ?? ours[0];
      if (c) { queue(s, hotheadEvent(s, c, r, c.faction === 'player')); bumpTension(s, 'player', r.id, 8, `${displayName(c)} started a fight`); return; }
    }
  }
}

/**
 * Weekly, after the rivals, the wars and the Table have moved: read the
 * week, move the eras, apply their rules, run the spies, the lies, the
 * canaries and the plots, and raise at most one decision.
 */
export function intrigueWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.week < 2 || s.gameOver) return;
  const I = ensureIntrigue(s);
  readTheWeek(ctx);
  erasWeek(ctx);
  eraRulesWeek(ctx);
  spiesWeek(ctx);
  liesWeek(ctx);
  canariesWeek(ctx);
  reportsWeek(s);
  plotsWeek(ctx);
  eventsWeek(s);
  // Snapshot for next week's diff.
  I.seen = { inf: Object.fromEntries(s.districts.map((d) => [d.id, d.influence.player ?? 0])), week: s.week + 1 };
}

/* ------------------------------------------------------------------ */
/* Views for the board and the war room                                */
/* ------------------------------------------------------------------ */

export interface WebEdge { from: FactionId; to: FactionId; charId: string; label: string; status: 'yours' | 'doubled?' | 'suspected' | 'known' | 'fed'; note: string }

/** Who spies on whom, as far as the boss knows. */
export function spyWeb(s: GameState): WebEdge[] {
  const I = s.intrigue;
  const out: WebEdge[] = [];
  if (!I) return out;
  for (const sp of I.spies) {
    if (sp.ended) continue;
    const c = s.characters[sp.charId];
    if (!c) continue;
    if (sp.master === 'player') {
      const falses = I.intel.filter((x) => x.spyId === sp.id && x.learned && !x.true).length;
      out.push({ from: 'player', to: sp.inside, charId: c.id, label: displayName(c), status: falses ? 'doubled?' : 'yours', note: `${sp.how === 'planted' ? 'Planted' : 'Turned'} week ${sp.since} · cover ${sp.cover}${falses ? ` · ${falses} report${falses > 1 ? 's' : ''} turned out false` : ''}` });
    } else if (sp.doubled === 'player') out.push({ from: sp.master, to: 'player', charId: c.id, label: displayName(c), status: 'fed', note: 'You know. He carries your stories.' });
  }
  for (const c of Object.values(s.characters)) {
    if (!c.alive || c.faction !== 'player' || out.some((e) => e.charId === c.id)) continue;
    if (confirmedMole(s, c.id) && c.informantFor) out.push({ from: c.informantFor, to: 'player', charId: c.id, label: displayName(c), status: 'known', note: 'You know he talks.' });
    else if ((I.suspect[c.id] ?? 0) >= 20) out.push({ from: 'none', to: 'player', charId: c.id, label: displayName(c), status: 'suspected', note: `Suspicion ${I.suspect[c.id]}` });
  }
  // Their men on your payroll that are not yet tracked as spies (turned by an old scheme).
  for (const c of Object.values(s.characters)) {
    if (!c.alive || c.faction === 'player' || c.informantFor !== 'player' || out.some((e) => e.charId === c.id)) continue;
    if (c.faction === 'none' || c.faction === 'law') continue;
    out.push({ from: 'player', to: c.faction, charId: c.id, label: displayName(c), status: 'yours', note: 'On your payroll' });
  }
  return out;
}

/** Suspects among the boss's men, highest first (confirmed moles at 100). */
export function suspects(s: GameState): { c: Character; level: number; confirmed: boolean }[] {
  const I = s.intrigue;
  return ourMen(s).map((c) => ({ c, level: confirmedMole(s, c.id) ? 100 : I?.suspect[c.id] ?? 0, confirmed: confirmedMole(s, c.id) })).filter((x) => x.level > 0).sort((a, b) => b.level - a.level);
}

export interface WarFront { district: string; name: string; mine: number; theirs: number; main: boolean }
export interface WarRoomView { war: War; rival: Rival; fronts: WarFront[]; menAvailable: number; ours: number; theirs: number; ledger?: WarLedger }

export function warRoom(s: GameState): WarRoomView[] {
  return s.wars.map((w) => {
    const r = s.rivals.find((x) => x.id === w.rival)!;
    const fronts = s.districts.filter((d) => d.id === w.district || ((d.influence[w.rival] ?? 0) >= 5 && (d.influence.player ?? 0) >= 5))
      .map((d) => ({ district: d.id, name: d.name, mine: d.influence.player ?? 0, theirs: d.influence[w.rival] ?? 0, main: d.id === w.district }));
    return { war: w, rival: r, fronts, menAvailable: ourMen(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate' || c.rank === 'capo').length, ours: strengthTotal(s), theirs: r ? rivalStrength(s, r) : 0, ledger: ledgerOf(s, w.id) };
  }).filter((v) => !!v.rival);
}

/** Lies and rumors still out there (the boss's, and the ones told to him he has since found out). */
export function liesInPlay(s: GameState): Lie[] {
  return (s.intrigue?.lies ?? []).filter((l) => l.teller === 'player' || l.discovered).slice().reverse();
}

/** "What you were told" vs "what you later learned", newest first. */
export function toldAndLearned(s: GameState): Intel[] {
  return (s.intrigue?.intel ?? []).slice().reverse();
}

export { ensureIntrigue };
