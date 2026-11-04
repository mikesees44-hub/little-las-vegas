import { crew, displayName, hasTrait, isFree } from './characters';
import { holder } from './council';
import { purseFlags } from './crewPurse';
import { journal } from './journal';
import type { Ctx } from './ledger';
import { mindOf } from './minds/state';
import { remember } from './minds/memory';
import { activeAssignments } from './protect';
import { addOpinion, changeMeter, getRelation, opinion, opinionBreakdown } from './relations';
import { hashSeed } from './rng';
import { needsSanction, sanctioned, schemeOdds } from './schemes';
import { sideOf, type Side } from './sides';
import type { Character, Effect, GameState, SchemeOptions } from './types';

/**
 * THE PEOPLE LEDGER: the boss's private read on everyone he knows (imports/queue/PEOPLE_LEDGER.md).
 *
 * Two suspicions are KEPT (they are beliefs, and beliefs have a history): "Flipped?" (talking to the
 * Feds or a rival) and "Stealing?" (skimming, short envelopes, living above his end). They move only
 * when evidence the game actually shows the boss lands:
 *   - tells (the undercover's habits the bar talks about),
 *   - a quick release after a serious pinch (a charge like that does not go away),
 *   - the Ears and the boss's own inquiries (protect.ts reports, false claims included),
 *   - secrets the house holds (an informant, a skim),
 *   - the envelope coming up short, a man living above his end (crewPurse.ts flags),
 *   - the books' discrepancies and the reports that did not hold up (ledgerbook),
 *   - tips (the feds working on him, a family courting him) and the word in the crew (minds' facts,
 *     told by men who would tell the boss),
 *   - and anything another system hands in through `addSuspicion` (payroll's quiet envelopes).
 * Never the hidden truth itself: a real rat with nothing on him reads clean, and a loyal man with a
 * bad week can read like a thief. Suspicion fades slowly (3% a week).
 *
 * Everything else on a row (beef, trust, loyalty, fear, favors) is READ from the game as it stands.
 *
 * State: `s.reads` (optional; made by the first evidence; upgradeSave only tops up a save that has it).
 * Dice: hashes of (seed, week, man, purpose), never the main stream.
 */

export type SuspKind = 'flip' | 'steal';
export const SUSP_LABEL: Record<SuspKind, string> = { flip: 'Flipped?', steal: 'Stealing?' };

/** One line of evidence: when, which suspicion, how much it moved, why (in the boss's words), where it came from. */
export interface ReadEv { w: number; k: SuspKind; a: number; why: string; src: string }

export interface PersonRead {
  /** Suspicion he talks (0-100). */
  f: number;
  /** Suspicion he steals (0-100). */
  st: number;
  /** The evidence, most recent last (capped). */
  ev: ReadEv[];
  /** Week the boss cleared him. */
  cl?: number;
  /** Week of the last canary test / sit-down (one each a few weeks). */
  tst?: number;
  sat?: number;
}

export interface ReadsState {
  v: 1;
  p: Record<string, PersonRead>;
  /** Evidence keys already counted (bounded). */
  seen: string[];
}

export const EV_CAP = 8;
export const SEEN_CAP = 400;
/** Weekly fade of a suspicion. */
export const READ_DECAY = 0.97;
/** Weeks between two canary tests / two sit-downs on the same man. */
export const TEST_COOLDOWN = 6;
export const SIT_COOLDOWN = 3;

export function ensureReads(s: GameState): ReadsState {
  const R = (s.reads ??= { v: 1, p: {}, seen: [] });
  R.p ??= {};
  R.seen ??= [];
  for (const r of Object.values(R.p)) {
    r.f ??= 0;
    r.st ??= 0;
    r.ev ??= [];
  }
  return R;
}

export function readOf(s: GameState, id: string): PersonRead | undefined {
  return s.reads?.p[id];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const h01 = (s: GameState, key: string) => hashSeed(`${s.seed}|reads|${key}`) / 4294967296;

/**
 * THE HOOK: evidence from anywhere moves the boss's suspicion of a man. `amount` is signed (a clean
 * report lowers it). `why` is the line the boss sees under "why do I think this?". Returns the new value.
 * Payroll's quiet envelopes, a tip, a talk: anything the boss heard can call this.
 */
export function addSuspicion(s: GameState, charId: string, kind: SuspKind, amount: number, why: string, src = 'other'): number {
  const c = s.characters[charId];
  if (!c || charId === s.playerId || !amount) return readOf(s, charId)?.[kind === 'flip' ? 'f' : 'st'] ?? 0;
  const R = ensureReads(s);
  const r = (R.p[charId] ??= { f: 0, st: 0, ev: [] });
  const key = kind === 'flip' ? 'f' : 'st';
  const before = r[key];
  // Evidence piles up with diminishing room at the top: a second solid line firms it, it never quite hits 100 on talk alone.
  const next = amount > 0 ? before + amount * (1 - before / 140) : before + amount;
  r[key] = Math.round(clamp(next, 0, 100) * 10) / 10;
  r.ev.push({ w: s.week, k: kind, a: Math.round((r[key] - before) * 10) / 10, why: why.slice(0, 160), src });
  if (r.ev.length > EV_CAP) r.ev.splice(0, r.ev.length - EV_CAP);
  return r[key];
}

/** Count a piece of evidence once (by key). */
function once(R: ReadsState, key: string): boolean {
  if (R.seen.includes(key)) return false;
  R.seen.push(key);
  if (R.seen.length > SEEN_CAP) R.seen.splice(0, R.seen.length - SEEN_CAP);
  return true;
}

function nm(s: GameState, id: string | undefined): string {
  const c = id ? s.characters[id] : undefined;
  return c ? displayName(c) : 'somebody';
}

/* ------------------------------------------------------------------ */
/* The week: what the boss saw, heard and was told                     */
/* ------------------------------------------------------------------ */

/** Candidate evidence found this week (a key so it counts once). */
interface Found { key: string; id: string; k: SuspKind; a: number; why: string; src: string }

/** Everything the game shows the boss right now that bears on a man's loyalty or honesty (pure). */
export function evidenceNow(s: GameState): Found[] {
  const out: Found[] = [];
  const mine = (id: string | undefined): id is string => !!id && id !== s.playerId && s.characters[id]?.alive === true && s.characters[id]?.faction === 'player';
  // 1. Secrets the house holds: an informant, a skim (the Ears, the consigliere, a confession).
  for (const x of s.secrets) {
    if (!x.knownBy.includes('player') || !mine(x.ownerId)) continue;
    if (x.kind === 'informant') out.push({ key: `sec:${x.id}`, id: x.ownerId, k: 'flip', a: 55, why: `You hold it as a fact: ${x.text}.`, src: 'secret' });
    if (x.kind === 'skimming') out.push({ key: `sec:${x.id}`, id: x.ownerId, k: 'steal', a: 45, why: 'Word reached you that he keeps two counts.', src: 'secret' });
  }
  // 2. Tells: the undercover's habits the bar talks about (feds.ts journals each one).
  const B = s.feds?.brasco;
  if (B && !B.end && mine(B.id)) {
    for (const t of B.tells) out.push({ key: `tell:${B.id}:${t}`, id: B.id, k: 'flip', a: 12, why: `A tell: the talk is he ${TELL_SHORT[t] ?? 'does not add up'}.`, src: 'tell' });
  }
  // 3. A pinch, and how fast he was home: a serious charge that goes away in weeks does not usually go away.
  for (const p of s.feds?.pinches ?? []) {
    if (p.stage !== 'done' || !mine(p.charId)) continue;
    const c = s.characters[p.charId];
    if ((c.imprisonedUntil ?? 0) > s.week) continue;
    const gone = s.week - p.w;
    if (p.serious && p.outcome === 'flipped' && gone <= 12) out.push({ key: `pinch:${p.id}`, id: p.charId, k: 'flip', a: 28, why: `Picked up for ${p.crime} (years on the line) and back on the street in ${Math.max(1, gone)} week${gone === 1 ? '' : 's'}. His case was "continued".`, src: 'pinch' });
    else if (!p.serious && p.outcome === 'dropped') out.push({ key: `pinch:${p.id}`, id: p.charId, k: 'flip', a: 5, why: `Picked up for ${p.crime}; home by lunch, the charge gone.`, src: 'pinch' });
  }
  // 4. Tips: the feds working on him; a family courting him.
  for (const t of s.threats?.tips ?? []) {
    if (!mine(t.targetId) || t.status === 'waiting' && !t.seen) continue;
    if (t.kind === 'fed_flip') out.push({ key: `tip:${t.id}`, id: t.targetId, k: 'flip', a: 12, why: `A tip from ${t.sourceName}: the feds are working on him.`, src: 'tip' });
    else if (t.kind === 'poach') out.push({ key: `tip:${t.id}`, id: t.targetId, k: 'flip', a: 8, why: `A tip from ${t.sourceName}: another family is courting him.`, src: 'tip' });
  }
  // 5. The boss's own inquiries (protect.ts), true or not: the report says what it says.
  for (const r of s.protect?.reports ?? []) {
    if (!r.access.includes(s.playerId) || !mine(r.subject)) continue;
    const g = new Set(r.grounds.map((x) => x.src));
    const conf = r.confidence === 'high' ? 1 : r.confidence === 'moderate' ? 0.7 : 0.45;
    const src = r.purpose === 'guard' ? 'guard' : 'inquiry';
    if (g.has('informant') || g.has('defect')) out.push({ key: `rep:${r.id}:f`, id: r.subject, k: 'flip', a: Math.round(35 * conf), why: `${nm(s, r.by)}'s report: ${clip(r.observation)}`, src });
    else if (g.has('courted')) out.push({ key: `rep:${r.id}:f`, id: r.subject, k: 'flip', a: Math.round(15 * conf), why: `${nm(s, r.by)}'s report: ${clip(r.observation)}`, src });
    if (g.has('skimmed') || g.has('arrears')) out.push({ key: `rep:${r.id}:s`, id: r.subject, k: 'steal', a: Math.round(28 * conf), why: `${nm(s, r.by)}'s report: ${clip(r.observation)}`, src });
    else if (g.has('spend') || g.has('debtTo') || g.has('debt')) out.push({ key: `rep:${r.id}:s`, id: r.subject, k: 'steal', a: Math.round(10 * conf), why: `${nm(s, r.by)}'s report: ${clip(r.observation)}`, src });
    // A report with nothing under it but a man's word (the boss cannot tell a grudge from the truth).
    if (!r.grounds.length && r.status === 'received' && (r.purpose === 'loyalty' || r.purpose === 'money')) out.push({ key: `rep:${r.id}:w`, id: r.subject, k: r.purpose === 'loyalty' ? 'flip' : 'steal', a: Math.round(14 * conf), why: `${r.source || nm(s, r.by)} says so (${clip(r.observation)})`, src });
    // Nothing found: a little easier in his mind.
    if (r.status === 'inconclusive' && (r.purpose === 'loyalty' || r.purpose === 'money')) out.push({ key: `rep:${r.id}:n`, id: r.subject, k: r.purpose === 'loyalty' ? 'flip' : 'steal', a: -6, why: `${nm(s, r.by)} looked into him and came back with nothing.`, src });
  }
  // 6. The envelope and the life: short this week, living above his end.
  const T = s.tribute;
  for (const c of crew(s)) {
    if (c.id === s.playerId) continue;
    const hist = T?.shortHist?.[c.id] ?? [];
    for (const w of hist) if (w >= s.week - 1) out.push({ key: `short:${c.id}:${w}`, id: c.id, k: 'steal', a: 6, why: `His envelope came up short (week ${w}).`, src: 'envelope' });
    let flags: string[] = [];
    try { flags = purseFlags(s, c); } catch { flags = []; }
    if (flags.includes('above')) out.push({ key: `above:${c.id}:${Math.floor(s.week / 8)}`, id: c.id, k: 'steal', a: 10, why: 'He lives above his envelope: more money than his end explains.', src: 'lifestyle' });
  }
  // 7. The books: a discrepancy flagged, a report that did not hold up, an audit.
  for (const d of s.ledgerBook?.discrepancies ?? []) {
    if (!mine(d.whoId) || d.settled === 'forgiven') continue;
    out.push({ key: `disc:${d.id}`, id: d.whoId, k: 'steal', a: d.kind === 'skim' ? clamp(Math.round(8 + d.amount / 150), 8, 25) : 10, why: `The books: ${clip(d.text)}`, src: 'books' });
  }
  for (const r of s.ledgerBook?.receipts ?? []) {
    if (!r.checked || !mine(r.byId)) continue;
    out.push({ key: `rcpt:${r.id}`, id: r.byId, k: 'steal', a: r.checked.caught ? 15 : -5, why: r.checked.caught ? `His report on ${r.job} did not hold up when it was checked.` : `His report on ${r.job} checked out.`, src: 'books' });
  }
  for (const [id, k] of Object.entries(s.econ?.cases ?? {})) {
    if (!mine(id) || k.week < 0) continue;
    out.push({ key: `case:${id}:${k.week}`, id, k: 'steal', a: k.skimming ? 50 : -25, why: k.skimming ? `The audit caught him skimming ($${k.shortfall.toLocaleString('en-US')}).` : 'The audit: his books checked out.', src: 'audit' });
  }
  // 8. The word in the crew: what a man who would tell the boss believes about another (it can be a lie that grew in the telling).
  for (const [tid, m] of Object.entries(s.minds?.minds ?? {})) {
    if (!mine(tid) || opinion(s, tid, s.playerId) < 20) continue;
    for (const f of m.facts) {
      if (f.src === 'lie' || f.c < 0.4 || !mine(f.by) || f.by === tid) continue;
      const k: SuspKind | undefined = f.k === 'rat' || f.k === 'courted' ? 'flip' : f.k === 'skim' ? 'steal' : undefined;
      if (!k) continue;
      const what = f.k === 'rat' ? 'talks to the law' : f.k === 'courted' ? 'is being courted by another family' : 'skims';
      out.push({ key: `word:${tid}:${f.by}:${f.k}`, id: f.by, k, a: Math.round((f.k === 'courted' ? 8 : 14) * f.c), why: `${nm(s, tid)} told you he ${f.c >= 0.75 ? 'is sure' : 'thinks'} he ${what}.`, src: 'word' });
    }
  }
  return out;
}

const TELL_SHORT: Record<string, string> = {
  upstairs: 'never takes a girl upstairs at the Starlight',
  days: 'is never around the same two days a month',
  uncle: 'has an uncle back home nobody there has heard of',
  notes: 'remembers every number anybody says out loud',
};

function clip(t: string, n = 110): string {
  const x = t.replace(/\s+/g, ' ').trim();
  return x.length > n ? `${x.slice(0, n - 1)}…` : x;
}

/** The week's read: new evidence counted once, every suspicion fades a little. Runs at the end of the week. */
export function readsWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.reads) {
    for (const [id, r] of Object.entries(s.reads.p)) {
      if (!s.characters[id]?.alive) { delete s.reads.p[id]; continue; }
      r.f = Math.round(r.f * READ_DECAY * 10) / 10;
      r.st = Math.round(r.st * READ_DECAY * 10) / 10;
      if (r.f < 1) r.f = 0;
      if (r.st < 1) r.st = 0;
      // A man with nothing on him and nothing on file needs no page.
      if (!r.f && !r.st && r.ev.every((e) => s.week - e.w > 52) && r.cl === undefined && r.tst === undefined && r.sat === undefined) delete s.reads.p[id];
    }
  }
  const found = evidenceNow(s);
  if (!found.length) return;
  const seen = new Set(s.reads?.seen ?? []);
  const fresh = found.filter((f) => !seen.has(f.key));
  if (!fresh.length) return;
  const R = ensureReads(s);
  for (const f of fresh) {
    if (!once(R, f.key)) continue;
    const before = readOf(s, f.id)?.[f.k === 'flip' ? 'f' : 'st'] ?? 0;
    const after = addSuspicion(s, f.id, f.k, f.a, f.why, f.src);
    // Crossing into "suspected": the boss notes it in his file.
    if (before < SUSPECT && after >= SUSPECT) {
      journal(s, { c: 'intrigue', t: `You have your doubts about ${nm(s, f.id)}`, x: `${f.k === 'flip' ? 'Is he talking?' : 'Is he stealing?'} ${f.why}`, p: [f.id], src: 'reads' });
    }
  }
}

/** At or above this a man is "suspected" (the filter, the row's mark). */
export const SUSPECT = 35;

/* ------------------------------------------------------------------ */
/* The read: every meter, with "why do I think this?"                 */
/* ------------------------------------------------------------------ */

export type BeefLevel = 'none' | 'tension' | 'feud' | 'war' | 'blood';
export const BEEF_LABEL: Record<BeefLevel, string> = { none: 'None', tension: 'Tension', feud: 'Feud', war: 'War', blood: 'Blood' };
const BEEF_RANK: Record<BeefLevel, number> = { none: 0, tension: 1, feud: 2, war: 3, blood: 4 };

export interface Meter { v: number; label: string; why: string[] }

export interface PersonView {
  id: string;
  name: string;
  rank: string;
  side: Side;
  /** Group key for the ledger (yours, manno, …, law, town, other). */
  group: string;
  district?: string;
  beef: { level: BeefLevel; why: string[] };
  trust: Meter;
  flip: Meter;
  steal: Meter;
  loyalty: Meter;
  fear: Meter;
  favors: { owesMe: number; iOwe: number; why: string[] };
  watched?: string;
  cleared?: number;
}

/** The family/faction group of a person, in the ledger's order. */
export const GROUP_ORDER = ['yours', 'manno', 'feldstein', 'kessler', 'philly', 'law', 'town', 'other'] as const;
export type PeopleGroup = (typeof GROUP_ORDER)[number];
export const GROUP_NAME: Record<PeopleGroup, string> = {
  yours: 'Your family', manno: 'The Manno family', feldstein: 'The Feldstein family', kessler: 'The Kessler family', philly: 'Philadelphia',
  law: 'The law', town: 'The town: officials, the night, civilians', other: 'Others',
};

export function groupOf(s: GameState, id: string, side = sideOf(s, id)): PeopleGroup {
  if (side.kind === 'yours') return 'yours';
  if (side.kind === 'rival' || side.kind === 'philly') return (GROUP_ORDER as readonly string[]).includes(side.factionId) ? side.factionId as PeopleGroup : 'other';
  if (side.kind === 'law') return 'law';
  return 'town';
}

function rankWord(s: GameState, c: Character): string {
  if (s.rivals.some((r) => r.leaderId === c.id)) return 'Boss';
  if (c.office) return c.office;
  if (c.rank !== 'civilian') return c.rank[0].toUpperCase() + c.rank.slice(1);
  if (c.outside) return c.outside === 'cop' ? 'Cop on the pad' : c.outside === 'politician' ? 'Politician on the pad' : c.outside[0].toUpperCase() + c.outside.slice(1);
  return c.dynasty ? 'Your house' : 'Civilian';
}

export function districtName(s: GameState, c: Character): string | undefined {
  const d = s.districts.find((x) => x.capoId === c.id) ?? (c.capoId ? s.districts.find((x) => x.capoId === c.capoId) : undefined);
  return d?.name;
}

/** Are we in a fight, and how bad: grudge, feud, war, blood. */
export function beefWith(s: GameState, c: Character): { level: BeefLevel; why: string[] } {
  const B = s.playerId;
  let level: BeefLevel = 'none';
  const why: string[] = [];
  const up = (l: BeefLevel, line: string) => { if (BEEF_RANK[l] > BEEF_RANK[level]) level = l; why.push(line); };
  const r = s.rivals.find((x) => x.id === c.faction && x.kind !== 'law');
  if (r?.war) up('war', `${r.shortName} and your family are at war.`);
  else if (r?.feud) up('feud', `${r.shortName} and your family are in a feud.`);
  // Blood: a death between you (his kin by your hand, yours by his family's).
  const mods = [...opinionBreakdown(s, c.id, B).mods, ...opinionBreakdown(s, B, c.id).mods];
  for (const m of mods) if (/killed my|had my|murder/i.test(m.reason)) up('blood', `"${m.reason}" (${m.value > 0 ? '+' : ''}${Math.round(m.value)}).`);
  for (const k of [c.spouseId, c.fatherId, ...(c.childrenIds ?? [])]) {
    const d = k ? s.characters[k] : undefined;
    if (d && !d.alive && d.death?.killer === 'player') up('blood', `Your people killed his ${d.id === c.spouseId ? 'wife' : d.id === c.fatherId ? 'father' : 'child'}, ${d.firstName}.`);
  }
  // Personal: a blood feud or a rivalry tie (deeds), the bonds' rival.
  for (const [k, t] of Object.entries(s.deeds?.ties ?? {})) {
    const [a, b] = k.split('|');
    if (!((a === B && b === c.id) || (b === B && a === c.id))) continue;
    if (t.k === 'feud') up('feud', 'A blood feud between you and him.');
    else if (t.k === 'rival') up('tension', 'He is your rival, man to man.');
  }
  if (s.bonds?.ties?.[c.id]?.role === 'rival') up('tension', 'Your rival (bonds).');
  // A grudge: he hates you, or nurses a grievance.
  const op = opinion(s, c.id, B);
  const g = getRelation(s, c.id, B)?.grievance ?? 0;
  if (op <= -40) up('tension', `He hates you (opinion ${op}).`);
  else if (op <= -20) up('tension', `No love lost (opinion ${op}).`);
  if (g >= 30) up('tension', `He nurses a grievance (${Math.round(g)}).`);
  const m = mindOf(s, c.id);
  const grudge = m?.mem.filter((x) => x.who === B && x.v < 0).reduce((a, x) => a + -x.v * x.s, 0) ?? 0;
  if (grudge >= 25) up('tension', `He remembers what you did (grudge ${Math.round(grudge)}).`);
  if (!why.length) why.push('Nothing between you that you know of.');
  return { level, why };
}

const FLIP_WORDS = (v: number) => (v >= 70 ? 'You are nearly sure' : v >= SUSPECT ? 'You suspect it' : v >= 15 ? 'A doubt' : 'No reason to think so');

/** The boss's read on one man (pure). */
export function personView(s: GameState, id: string): PersonView | undefined {
  const c = s.characters[id];
  if (!c || !c.alive || id === s.playerId) return undefined;
  const B = s.playerId;
  const side = sideOf(s, id);
  const r = readOf(s, id);
  const ev = (k: SuspKind) => (r?.ev ?? []).filter((e) => e.k === k).slice().reverse().map((e) => `${e.a >= 0 ? '▲' : '▼'} ${e.why} (week ${e.w})`);
  const fv = Math.round(r?.f ?? 0);
  const sv = Math.round(r?.st ?? 0);
  const flipWhy = ev('flip');
  const stealWhy = ev('steal');
  if (side.double && side.double.factionId !== 'player' && side.kind === 'yours') flipWhy.unshift(`What you know: he ${side.double.text}.`);
  if (!flipWhy.length) flipWhy.push(c.faction === 'player' ? 'Nothing on him. That is not the same as nothing there.' : 'Not one of yours: what he says is his own family\'s business.');
  if (!stealWhy.length) stealWhy.push(c.faction === 'player' ? 'His envelopes add up, as far as you can see.' : 'He does not kick up to you.');
  if (r?.cl !== undefined) { flipWhy.push(`You cleared him (week ${r.cl}).`); stealWhy.push(`You cleared him (week ${r.cl}).`); }
  // Loyalty: his opinion of you, as it shows on his face.
  const op = opinion(s, id, B);
  const bd = opinionBreakdown(s, id, B).mods.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 4);
  const loyalty: Meter = { v: op, label: op >= 60 ? 'Devoted' : op >= 30 ? 'Warm' : op >= 10 ? 'Friendly' : op > -10 ? 'Cool' : op > -30 ? 'Sore' : op > -60 ? 'Hostile' : 'Hates you', why: bd.length ? bd.map((m) => `${m.value > 0 ? '+' : ''}${Math.round(m.value)} ${m.reason}`) : ['No strong feelings either way.'] };
  const rel = getRelation(s, id, B);
  const fearV = Math.round(rel?.fear ?? 0);
  const fear: Meter = { v: fearV, label: fearV >= 60 ? 'Terrified' : fearV >= 30 ? 'Wary' : fearV >= 10 ? 'Careful' : 'Not afraid', why: [fearV ? `Fear of you: ${fearV}/100 (threats, examples made, what he has seen).` : 'He has never had a reason to be afraid of you.'] };
  if (hasTrait(c, 'Cowardly')) fear.why.push('A coward by nature.');
  // Favors both ways (deeds' ledger).
  const owed = s.deeds?.owed ?? [];
  const owesMe = owed.filter((o) => o.by === id && o.to === B);
  const iOwe = owed.filter((o) => o.by === B && o.to === id);
  const hooks = s.hooks.filter((h) => h.holder === 'player' && h.targetId === id);
  const favors = { owesMe: owesMe.length, iOwe: iOwe.length, why: [...owesMe.map((f) => `He owes you: ${f.y} (week ${f.w})`), ...iOwe.map((f) => `You owe him: ${f.y} (week ${f.w})`), ...hooks.map((h) => `${h.strong ? 'A strong' : 'A weak'} hook: ${h.reason}`)] };
  if (!favors.why.length) favors.why.push('Nothing owed either way.');
  // Trust: built from what he shows, what you suspect, what ties you.
  const tw: string[] = [];
  let tv = 50;
  const add = (n: number, line: string) => { if (!n) return; tv += n; tw.push(`${n > 0 ? '+' : ''}${n} ${line}`); };
  add(Math.round(op / 3), `what he shows you (opinion ${op})`);
  if (fv) add(-Math.round(fv * 0.6), `you suspect he talks (${fv})`);
  if (sv) add(-Math.round(sv * 0.4), `you suspect he steals (${sv})`);
  const blood = c.dynasty || c.spouseId === B || s.characters[B]?.childrenIds.includes(id);
  if (blood) add(15, 'your blood');
  if (c.faction !== 'player' && side.kind !== 'yours') add(c.faction === 'law' ? -30 : side.kind === 'rival' || side.kind === 'philly' ? -25 : -5, c.faction === 'law' ? 'the law' : side.kind === 'rival' || side.kind === 'philly' ? 'another family\'s man' : 'an outsider');
  if (side.relation === 'allied' || side.relation === 'partners') add(10, 'his family is with you');
  if (hooks.some((h) => h.strong)) add(8, 'you have something on him');
  if (hasTrait(c, 'Honest')) add(6, 'known to be straight');
  if (hasTrait(c, 'Greedy')) add(-6, 'known to be greedy');
  tv = clamp(Math.round(tv), 0, 100);
  const trust: Meter = { v: tv, label: tv >= 75 ? 'With your life' : tv >= 55 ? 'You trust him' : tv >= 40 ? 'Up to a point' : tv >= 20 ? 'Careful' : 'Not at all', why: tw.length ? tw : ['Nothing to go on.'] };
  const watch = activeAssignments(s).find((a) => a.type === 'investigate' && a.by === B && a.subjects.includes(id));
  return {
    id, name: displayName(c), rank: rankWord(s, c), side, group: groupOf(s, id, side), district: districtName(s, c),
    beef: beefWith(s, c), trust,
    flip: { v: fv, label: FLIP_WORDS(fv), why: flipWhy },
    steal: { v: sv, label: sv >= 70 ? 'You are nearly sure' : sv >= SUSPECT ? 'You suspect it' : sv >= 15 ? 'A doubt' : 'No reason to think so', why: stealWhy },
    loyalty, fear, favors,
    ...(watch ? { watched: `${nm(s, watch.agents[0])} is looking into him` } : {}),
    ...(r?.cl !== undefined ? { cleared: r.cl } : {}),
  };
}

/** Everyone alive the boss knows of: his people, the families, the law, the town's people who matter. */
export function peopleKnown(s: GameState): string[] {
  const known = new Set(s.secrets.filter((x) => x.knownBy.includes('player')).map((x) => x.ownerId));
  const dealt = new Set((s.journal?.e ?? []).slice(-300).filter((e) => e.mine).flatMap((e) => e.p ?? []));
  const out: string[] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.alive || id === s.playerId) continue;
    if (s.date.y - c.birth.y < 16) continue;
    const side = sideOf(s, id);
    if (side.kind === 'civilian' && !c.office && !c.outside && !c.dynasty && !known.has(id) && !dealt.has(id) && !s.reads?.p[id] && side.label === 'Civilian') continue;
    out.push(id);
  }
  return out;
}

/** Ledger filters. */
export interface PeopleFilter { q?: string; group?: PeopleGroup | 'all'; suspected?: boolean; fight?: boolean }

export function matchesFilter(v: PersonView, f: PeopleFilter): boolean {
  if (f.group && f.group !== 'all' && v.group !== f.group) return false;
  if (f.suspected && Math.max(v.flip.v, v.steal.v) < SUSPECT) return false;
  if (f.fight && v.beef.level === 'none') return false;
  const q = f.q?.trim().toLowerCase();
  if (q && !`${v.name} ${v.rank} ${v.side.label} ${v.district ?? ''}`.toLowerCase().includes(q)) return false;
  return true;
}

const RANK_ORD: Record<string, number> = { boss: 0, underboss: 1, consigliere: 2, capo: 3, soldier: 4, associate: 5, civilian: 6 };

/** The ledger: grouped by family, your own first, each group by rank (pure). */
export function peopleLedger(s: GameState, f: PeopleFilter = {}): { group: PeopleGroup; label: string; rows: PersonView[] }[] {
  const rows = peopleKnown(s).map((id) => personView(s, id)).filter((v): v is PersonView => !!v && matchesFilter(v, f));
  const leaders = new Set(s.rivals.map((r) => r.leaderId));
  const by = new Map<PeopleGroup, PersonView[]>();
  for (const v of rows) {
    const list = by.get(v.group as PeopleGroup) ?? [];
    list.push(v);
    by.set(v.group as PeopleGroup, list);
  }
  return GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({
    group: g,
    label: s.rivals.find((r) => r.id === g)?.name ?? GROUP_NAME[g],
    rows: by.get(g)!.sort((a, b) => Number(leaders.has(b.id)) - Number(leaders.has(a.id)) || (RANK_ORD[s.characters[a.id].rank] ?? 9) - (RANK_ORD[s.characters[b.id].rank] ?? 9) || a.name.localeCompare(b.name)),
  }));
}

/* ------------------------------------------------------------------ */
/* Plan a hit: the grouped picker's odds and heat                       */
/* ------------------------------------------------------------------ */

export interface HitLine { chance: number; heat: string; blocked?: string; own: boolean; team: string[] }

/** The default team for a hit (the planner's own first pick: the two best free men). */
export function defaultHitTeam(s: GameState, targetId: string): string[] {
  const busy = new Set(s.schemes.filter((x) => x.owner === 'player').flatMap((x) => x.agents));
  return crew(s).filter((c) => c.id !== targetId && isFree(s, c) && !busy.has(c.id))
    .sort((a, b) => (b.attributes.force + b.attributes.intrigue) - (a.attributes.force + a.attributes.intrigue) || a.id.localeCompare(b.id)).slice(0, 2).map((c) => c.id);
}

export const HIT_DEFAULTS: SchemeOptions = { depth: 'planned', location: 'barbershop', disposal: 'public', equipment: 'street', alibi: false };

/** The odds and heat of a planned hit on him with the default team (the planner shows the full picture). */
export function hitLine(s: GameState, targetId: string, team = defaultHitTeam(s, targetId)): HitLine {
  const t = s.characters[targetId];
  const o = schemeOdds(s, 'murder', targetId, team, HIT_DEFAULTS);
  const own = t?.faction === 'player';
  const parts = [`+${12} local`];
  if (t && needsSanction(s, t) && !sanctioned(s, t.id)) parts.push('+15 family (no sanction)');
  if (own) parts.push('your crew will know');
  return { chance: o.chance, heat: parts.join(', '), ...(o.disabledReason ? { blocked: o.disabledReason } : {}), own, team };
}

/** What happens when the boss has one of his own killed (shown before he confirms). */
export function ownHitConsequences(s: GameState, targetId: string): string[] {
  const c = s.characters[targetId];
  if (!c) return [];
  const kin = kinOf(s, c);
  return [
    'Every man in the family will know, and wonder if he is next: the crew\'s opinion of you falls (−10; −5 if the body is never found).',
    '"Does the boss have our back?" drops hard.',
    kin.length ? `His family grieves, and will not forget: ${kin.map((k) => k.firstName).join(', ')} (−40, for good).` : 'He leaves no close family behind.',
    kin.some((k) => kinAvenger(s, k)) ? 'A grown son or brother may want to avenge him.' : 'Nobody close enough to avenge him.',
    'It goes in the chronicle, and in the papers if he is found.',
  ];
}

function kinOf(s: GameState, c: Character): Character[] {
  return Object.values(s.characters).filter((x) => x.alive && x.id !== c.id && x.id !== s.playerId
    && (x.fatherId === c.id || c.fatherId === x.id || x.spouseId === c.id || c.spouseId === x.id || (!!x.fatherId && x.fatherId === c.fatherId)));
}

function kinAvenger(s: GameState, k: Character): boolean {
  return k.gender !== 'F' && s.date.y - k.birth.y >= 18;
}

/**
 * The boss had one of his own killed (schemes.ts, a successful hit on a man of his): the crew sees it,
 * his family grieves, and a grown son or brother may swear to get even (the minds' avenge ambition).
 */
export function ownHitFallout(s: GameState, c: Character, publicHit: boolean): Effect[] {
  const kin = kinOf(s, c);
  const fx: Effect[] = [
    { type: 'crewOpinion', amount: publicHit ? -10 : -5, reason: `The boss had ${c.firstName} killed`, traitMods: { Cruel: 8, 'Loyal-to-a-fault': -6 } },
    ...kin.map((x) => ({ type: 'opinion', from: x.id, to: s.playerId, amount: -40, reason: `You had my ${x.spouseId === c.id ? (c.gender === 'F' ? 'wife' : 'husband') : x.fatherId === c.id ? 'father' : c.fatherId === x.id ? 'son' : 'family'} killed`, decay: 0 }) as Effect),
  ];
  for (const x of kin) {
    const m = mindOf(s, x.id);
    if (!m) continue;
    remember(m, { w: s.week, k: 'grief', who: s.playerId, t: `the boss had ${c.firstName} killed`, v: -45 });
    if (kinAvenger(s, x) && (!m.amb || m.amb.k !== 'avenge')) m.amb = { k: 'avenge', t: s.playerId, p: 0, w: s.week };
  }
  return fx;
}

/* ------------------------------------------------------------------ */
/* Row actions, in the moment                                          */
/* ------------------------------------------------------------------ */

export interface ReadResult {
  ok: boolean;
  title: string;
  who?: string;
  chance?: number;
  roll?: number;
  tier: 'crit' | 'success' | 'fail' | 'critFail';
  headline: string;
  line: string;
  changes: string[];
  leadsTo: string[];
  error?: string;
}

/** Does he really talk / steal (the hidden truth: only the dice read it, never a screen). */
function talks(s: GameState, c: Character): boolean {
  return (!!c.informantFor && c.informantFor !== 'player' && c.informantFor !== c.faction) || (s.feds?.brasco?.id === c.id && !s.feds.brasco.end);
}
function steals(s: GameState, c: Character): boolean {
  return (c.skimmed ?? 0) > 0 || (s.ledgerBook?.receipts ?? []).some((r) => r.byId === c.id && r.lie && s.week - r.week <= 26);
}

/** The canary trap: the odds as the boss can know them (if he talks, if he does not). */
export function testOdds(s: GameState, id: string): { ifTalks: number; ifClean: number; block?: string } {
  const c = s.characters[id];
  const r = readOf(s, id);
  const cons = holder(s, 'consigliere');
  const ifTalks = clamp(0.55 + (cons ? cons.attributes.intrigue / 500 : 0), 0.4, 0.8);
  const block = !c?.alive ? 'Not among the living' : c.faction !== 'player' ? 'Only one of your own: he has to be close enough to hear it' : r?.tst !== undefined && s.week - r.tst < TEST_COOLDOWN ? `Not again so soon (week ${r.tst + TEST_COOLDOWN})` : !isFree(s, c) ? 'He is away' : undefined;
  return { ifTalks, ifClean: 0.08, ...(block ? { block } : {}) };
}

/** Sit him down: the odds you read him right. */
export function sitOdds(s: GameState, id: string): { chance: number; reasons: { label: string; value: number }[]; block?: string } {
  const c = s.characters[id];
  const boss = s.characters[s.playerId];
  const reasons: { label: string; value: number }[] = [{ label: 'Base', value: 45 }];
  if (c && boss) {
    reasons.push({ label: 'Your wits against his', value: Math.round((boss.attributes.intrigue - c.attributes.intrigue) / 3) });
    const fear = getRelation(s, id, s.playerId)?.fear ?? 0;
    if (fear >= 20) reasons.push({ label: 'He is afraid of you', value: Math.round(fear / 6) });
    if (hasTrait(c, 'Honest')) reasons.push({ label: 'Honest: it shows on him', value: 8 });
    if (hasTrait(c, 'Charming')) reasons.push({ label: 'A smooth talker', value: -10 });
    if (hasTrait(boss, 'Paranoid')) reasons.push({ label: 'You see rats everywhere', value: -8 });
  }
  const r = readOf(s, id);
  const block = !c?.alive ? 'Not among the living' : c.faction !== 'player' ? 'Only one of your own answers to you like that' : r?.sat !== undefined && s.week - r.sat < SIT_COOLDOWN ? `Not again so soon (week ${r.sat + SIT_COOLDOWN})` : !isFree(s, c) ? 'He is away' : undefined;
  return { chance: clamp(reasons.reduce((a, x) => a + x.value, 0) / 100, 0.15, 0.85), reasons, ...(block ? { block } : {}) };
}

function cloneForRead(s: GameState): GameState {
  const J = s.journal;
  return {
    ...s,
    reads: s.reads ? { ...s.reads, p: Object.fromEntries(Object.entries(s.reads.p).map(([k, v]) => [k, { ...v, ev: v.ev.slice() }])), seen: s.reads.seen.slice() } : undefined,
    relations: { ...s.relations },
    ...(J ? { journal: { ...J, e: J.e.slice(), old: J.old.slice() } } : {}),
  };
}

/** The relation he holds toward the boss, copied before it is changed (cloneForRead copies the map only). */
function ownRel(s: GameState, from: string): void {
  const k = `${from}>${s.playerId}`;
  const r = s.relations[k];
  if (r) s.relations[k] = { ...r, modifiers: r.modifiers.slice() };
}

export type ReadOp = 'test' | 'sit' | 'clear';

/** A row action, settled now. Pure: returns the new state and the result card. */
export function readAct(s0: GameState, id: string, op: ReadOp): { state: GameState; result: ReadResult } {
  const c = s0.characters[id];
  const fail = (error: string, title = 'Not now'): { state: GameState; result: ReadResult } => ({ state: s0, result: { ok: false, error, title, tier: 'fail', headline: error, line: '', changes: [], leadsTo: [] } });
  if (!c || !c.alive || id === s0.playerId) return fail('Nobody to read');
  const s = cloneForRead(s0);
  const R = ensureReads(s);
  const r = (R.p[id] ??= { f: 0, st: 0, ev: [] });
  const who = displayName(c);
  const he = c.gender === 'F' ? 'she' : 'he';
  const fileIt = (t: string, x: string) => journal(s, { c: 'intrigue', t, x, p: [id], src: 'reads', mine: 1 });
  if (op === 'clear') {
    const was = `${Math.round(r.f)}/${Math.round(r.st)}`;
    r.f = 0;
    r.st = 0;
    r.cl = s.week;
    r.ev.push({ w: s.week, k: 'flip', a: 0, why: 'You decided to put it out of your mind.', src: 'cleared' });
    if (r.ev.length > EV_CAP) r.ev.splice(0, r.ev.length - EV_CAP);
    fileIt(`You cleared ${who}`, 'Whatever you thought, you put it away. He is with you.');
    return { state: s, result: { ok: true, title: `Clear ${c.firstName}`, who, tier: 'success', headline: 'Done', line: `You put your doubts about ${c.firstName} away.`, changes: [`Suspicion ${was} → 0/0`], leadsTo: ['New evidence will still count.'] } };
  }
  if (op === 'test') {
    const o = testOdds(s0, id);
    if (o.block) return fail(o.block, `Test ${c.firstName}`);
    r.tst = s.week;
    const guilty = talks(s, c);
    const p = guilty ? o.ifTalks : o.ifClean;
    const roll = h01(s, `test|${s.week}|${id}`);
    const leaked = roll < p;
    const story = STORIES[Math.floor(h01(s, `story|${s.week}|${id}`) * STORIES.length)];
    let line: string;
    const changes: string[] = [];
    if (leaked) {
      const v = addSuspicion(s, id, 'flip', 30, `The story you fed only him (${story}) came back to you from outside.`, 'test');
      line = `You told ${c.firstName} ${story}. ${guilty && c.informantFor === 'law' || (s.feds?.brasco?.id === id) ? 'Ten days later an agent asked about it.' : 'It came back to you from somewhere it should never have reached.'}`;
      changes.push(`Flipped? ${Math.round(v)}`);
      fileIt(`The story you fed ${who} came back`, line);
    } else {
      const v = addSuspicion(s, id, 'flip', -12, `You fed him a story (${story}); it went nowhere.`, 'test');
      line = `You told ${c.firstName} ${story}. Nothing came back. Either ${he} kept it to ${c.gender === 'F' ? 'herself' : 'himself'}, or ${he} is careful.`;
      changes.push(`Flipped? ${Math.round(v)}`);
      fileIt(`The story you fed ${who} went nowhere`, line);
    }
    return { state: s, result: { ok: true, title: `Test ${c.firstName}`, who, chance: undefined, tier: leaked ? 'success' : 'fail', headline: leaked ? 'It leaked' : 'Nothing came back', line, changes, leadsTo: [leaked ? 'A leak can still have come from another mouth: one test is not proof.' : 'A careful rat passes this too.'] } };
  }
  // Sit him down.
  const o = sitOdds(s0, id);
  if (o.block) return fail(o.block, `Sit ${c.firstName} down`);
  r.sat = s.week;
  const kind: SuspKind = r.st > r.f ? 'steal' : 'flip';
  const guilty = kind === 'flip' ? talks(s, c) : steals(s, c);
  const roll = h01(s, `sit|${s.week}|${id}`);
  const read = roll < o.chance;
  const changes: string[] = [];
  const leads: string[] = [];
  let line: string;
  let tier: ReadResult['tier'];
  ownRel(s, id);
  if (read && guilty) {
    const v = addSuspicion(s, id, kind, 22, kind === 'flip' ? 'You sat him down: his eyes went to the door every time you said "the government".' : 'You sat him down: his numbers changed twice in one sitting.', 'sitdown');
    changeMeter(s, id, s.playerId, 'fear', 10);
    line = `${c.firstName} sat across from you and sweated through his shirt. Something is there.`;
    changes.push(`${SUSP_LABEL[kind]} ${Math.round(v)}`, `${c.firstName}'s fear of you +10`);
    leads.push('He knows you are looking at him now.');
    tier = 'success';
  } else if (read) {
    const v = addSuspicion(s, id, kind, -22, 'You sat him down and looked him in the eye. You believe him.', 'sitdown');
    addOpinion(s, id, s.playerId, 'The boss asked me straight, man to man', 4, 1);
    line = `${c.firstName} looked you in the eye and answered everything. You believe ${c.gender === 'F' ? 'her' : 'him'}.`;
    changes.push(`${SUSP_LABEL[kind]} ${Math.round(v)}`, `${c.firstName}'s opinion of you +4`);
    tier = 'success';
  } else if (guilty) {
    const v = addSuspicion(s, id, kind, -10, 'You sat him down. He had an answer for everything.', 'sitdown');
    line = `${c.firstName} had an answer for everything. You could not read ${c.gender === 'F' ? 'her' : 'him'}.`;
    changes.push(`${SUSP_LABEL[kind]} ${Math.round(v)}`);
    leads.push('A man with an answer for everything is either clean or ready.');
    tier = 'fail';
  } else {
    const v = addSuspicion(s, id, kind, 8, 'You sat him down. He got angry. Too angry?', 'sitdown');
    addOpinion(s, id, s.playerId, 'The boss doubted me', -8, 1);
    changeMeter(s, id, s.playerId, 'grievance', 6);
    line = `${c.firstName} took it badly: "After everything?" He got loud. Too loud?`;
    changes.push(`${SUSP_LABEL[kind]} ${Math.round(v)}`, `${c.firstName}'s opinion of you −8`);
    leads.push('He will remember you doubted him.');
    tier = 'critFail';
  }
  fileIt(`You sat ${who} down`, line);
  return { state: s, result: { ok: true, title: `Sit ${c.firstName} down`, who, chance: o.chance, roll: Math.floor(roll * 100), tier, headline: `${Math.round(o.chance * 100)}% — ${read ? 'you read him' : 'you could not read him'}`, line, changes, leadsTo: leads } };
}

const STORIES = [
  'that a load of Canadian whiskey comes in at the Otten\'s Harbor dock Thursday night',
  'that you are moving the count to a new back room on Pacific Avenue',
  'that you mean to meet the Kessler underboss at the Diamond Beach motel',
  'that the Rio Grande card game is moving to a cottage in West Wildwood',
  'that a city councilman is about to take an envelope from you at the Starlight',
];

/* ------------------------------------------------------------------ */
/* Extra row actions from other branches                               */
/* ------------------------------------------------------------------ */

/** A row action another system adds (payroll's quiet envelope on his wife): it says when it applies and what it does. */
export interface LedgerActionDef {
  key: string;
  label: (s: GameState, id: string) => string;
  /** Undefined when it does not apply to him; a string is why it is greyed out. */
  available: (s: GameState, id: string) => boolean | string;
  /** Opens a window, or returns a new state and a line for Your File. */
  run: (s: GameState, id: string) => { state?: GameState; line?: string; open?: () => void } | void;
}
const EXTRA: LedgerActionDef[] = [];
export function registerLedgerAction(def: LedgerActionDef): void {
  if (!EXTRA.some((x) => x.key === def.key)) EXTRA.push(def);
}
export function ledgerActions(): readonly LedgerActionDef[] {
  return EXTRA;
}

/** The hit picker's targets, grouped like the ledger (your family first, then each family, the law and the town). */
export function hitTargetGroups(s: GameState): { group: PeopleGroup; label: string; ids: string[]; protectedIds: string[] }[] {
  const leaders = new Set(s.rivals.map((r) => r.leaderId));
  const by = new Map<PeopleGroup, string[]>();
  for (const id of peopleKnown(s)) {
    const c = s.characters[id];
    if (s.date.y - c.birth.y < 18) continue;
    const g = groupOf(s, id);
    (by.get(g) ?? by.set(g, []).get(g)!).push(id);
  }
  return GROUP_ORDER.filter((g) => by.has(g)).map((g) => {
    const ids = by.get(g)!.sort((a, b) => Number(leaders.has(b)) - Number(leaders.has(a)) || (RANK_ORD[s.characters[a].rank] ?? 9) - (RANK_ORD[s.characters[b].rank] ?? 9) || s.characters[a].lastName.localeCompare(s.characters[b].lastName));
    return { group: g, label: s.rivals.find((r) => r.id === g)?.name ?? GROUP_NAME[g], ids, protectedIds: ids.filter((id) => !!s.characters[id].office || s.characters[id].faction === 'law') };
  });
}
