import type { ActionPreview } from './actions';
import { isInSeason } from './calendar';
import { displayName, makeCharacter } from './characters';
import { shiftInfluence } from './effects';
import { alliedWithFaction } from './familyHouses';
import type { Acceptance, Reason } from './interactions';
import { journal } from './journal';
import { heat, money, type Ctx } from './ledger';
import { matronOf } from './matchmakers';
import { ensureNyc, nycOf } from './nyc';
import { NYC_FAMILIES, NYC_FAMILY_IDS, type NycFamilyId } from './nycData';
import { addOpinion, opinion } from './relations';
import { hashSeed, rand } from './rng';
import { logTalk } from './talks';
import type { Character, Effect, EventInstance, GameState, Rank, Rival, RivalId } from './types';
import { noteKept } from './minds/familyWord';
import { endWar } from './war';
import {
  FAMILY_BY_ID, FAMILY_DEFS, FAM_KEYS, GRUDGE_TIE, SEED_EXTRAS, SEED_TIES, TIE_LABEL, TIE_SIGN,
  type FamDef, type FamGroup, type FamKey, type RosterMan, type SeedTie, type TieKind,
} from './familyWebData';

/**
 * THE FAMILIES' WEB: who is tied to whom, and how (familyWebData.ts holds
 * the families, their rosters and the 1960 ties).
 *
 * - Every family starts with at least one concrete tie to another: a
 *   marriage, blood, partners, a shared racket, a sponsor ("Philadelphia
 *   made them"), a debt, a truce, a broken truce, a feud. The boss's house is
 *   in the web too (Philadelphia made it).
 * - Ties MATTER: a family's stance toward the boss (`stanceTo`) is what it
 *   thinks of him plus what its ties say (allies of his friends warm to him,
 *   allies of his enemies cool); the rivals' moves read the ties (rivals.ts:
 *   a feud flares, an ally does not strike its ally); the sit-down and its AI
 *   brief carry them (minds/diplomacy.ts); an ally sends men to a family at
 *   war with the boss, and Philadelphia takes a side by its ties and its view.
 * - Ties change: a marriage is made, a debt paid, a feud ends or flares, a
 *   partner cheats (monthly, on the web's own dice).
 * - The boss builds ties (the 'fam' order): an envoy, a favor done, a
 *   partnership, a marriage through the matchmaker of his house, a truce he
 *   brokers between two families. Each shows its odds; results land in Your File.
 * - Philadelphia, the Atlantic City crew and New York are involved every
 *   week: Philadelphia's man checks the books, it wants its summer end, asks
 *   favors, rewards and punishes by its view; Manno's men press the boardwalk
 *   in season and bring offers; New York sends emissaries in summer, offers
 *   partnerships, and the Commission recognizes new bosses and wants long
 *   wars ended.
 *
 * Lives on `s.families` (optional; made at new game, and at load for an old
 * save that lacks it). Its dice are its own (`families.rng`), so the rest of
 * the game never reshuffles. Nobody of the boss's is harmed or handed over:
 * every ask here is money, a word, a favor or a game.
 */

export interface Tie {
  id: string;
  a: FamKey;
  b: FamKey;
  kind: TieKind;
  /** The year it began. */
  since: number;
  /** 1 … 100. */
  strength: number;
  story: string;
  by?: 'a' | 'b';
  /** Derived from the game (a marriage alliance, a pact): not stored. */
  live?: boolean;
}

export interface FamDeal { fam: FamKey; weekly: number; until: number; what: string }
export interface FamLog { w: number; t: string; tone?: 'good' | 'bad' | 'neutral' }

export interface FamState {
  rng: number;
  next: number;
  ties: Tie[];
  /** What the families without a man on the board think of the boss (−100 … 100). */
  view: Record<string, number>;
  /** Deals paying the boss weekly. */
  deals: FamDeal[];
  log: FamLog[];
  /** Cooldowns (key → the week it is free again). */
  cd: Record<string, number>;
  /** The bosses the Commission has recognized (rival → leader id). */
  bosses: Record<string, string>;
  /** Each outfit's strength now: men in all (made men and associates). Starts at its 1960 size. */
  size: Record<string, number>;
  /** Named men of an outfit the boss has met, made into full characters on demand (`fam:slot` → id). */
  minted: Record<string, string>;
  month?: string;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const LOG_MAX = 40;

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

function fromSeed(t: SeedTie, id: string, jitter: number): Tie {
  return { id, a: t.a, b: t.b, kind: t.kind, since: t.since, strength: clamp(t.strength + jitter, 10, 95), story: t.story, ...(t.by ? { by: t.by } : {}) };
}

/** The web as it stands on Memorial Day 1960 (new game; an old save at load). Its own dice, from the seed. */
export function ensureFamilies(s: GameState): FamState {
  if (s.families) return s.families;
  const st: FamState = { rng: hashSeed(`${s.seed}:families`), next: 1, ties: [], view: {}, deals: [], log: [], cd: {}, bosses: {}, size: {}, minted: {} };
  for (const d of FAMILY_DEFS) st.size[d.id] = d.men;
  const jit = () => Math.round((rand(st) - 0.5) * 16);
  for (const t of SEED_TIES) st.ties.push(fromSeed(t, `t${st.next++}`, jit()));
  const extra = SEED_EXTRAS[Math.floor(rand(st) * SEED_EXTRAS.length)];
  st.ties.push(fromSeed(extra, `t${st.next++}`, jit()));
  if (s.flags?.problem_grudge) st.ties.push(fromSeed(GRUDGE_TIE, `t${st.next++}`, 0));
  for (const r of s.rivals ?? []) if (r.kind !== 'law') st.bosses[r.id] = r.leaderId;
  // Philadelphia's capos and the far families come to the boss with a first look at him.
  st.cd = { 'philly:visit': 5, 'philly:favor': 9, 'ac:offer': 7, 'nyc:any': 3, 'reward': 13 };
  s.families = st;
  return st;
}

export function famOf(s: GameState): FamState | undefined {
  return s.families;
}

function note(st: FamState, w: number, t: string, tone: FamLog['tone'] = 'neutral'): void {
  st.log.push({ w, t, tone });
  if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
}

/* ------------------------------------------------------------------ */
/* Who they are                                                         */
/* ------------------------------------------------------------------ */

export function famDef(f: FamKey): FamDef | undefined {
  return f === 'player' ? undefined : FAMILY_BY_ID[f];
}

export function famName(s: GameState, f: FamKey): string {
  if (f === 'player') return s.houseName ? `the house of ${s.houseName}` : 'your house';
  return famDef(f)?.short ?? f;
}

const isRival = (f: FamKey): f is Exclude<RivalId, 'law'> => f === 'manno' || f === 'feldstein' || f === 'kessler' || f === 'philly';
const isNyc = (f: FamKey): f is NycFamilyId => (NYC_FAMILY_IDS as string[]).includes(f);

/** An outfit's strength now (men in all), and its size in words ("~300 men, 110 made, 20 crews"). */
export function sizeOf(s: GameState, f: FamKey): number {
  return s.families?.size[f] ?? famDef(f)?.men ?? 0;
}
export function sizeLine(s: GameState, f: FamKey): string {
  const d = famDef(f);
  if (!d) return '';
  const n = sizeOf(s, f);
  const crews = Math.max(1, Math.round((d.crews * n) / Math.max(1, d.men)));
  return `~${n} men${d.made ? `, ${Math.round((d.made * n) / Math.max(1, d.men))} made` : ''}, ${crews} crew${crews === 1 ? '' : 's'}`;
}

const RANK_OF: Record<RosterMan['role'], Rank> = { boss: 'boss', underboss: 'underboss', consigliere: 'consigliere', capo: 'capo', soldier: 'soldier' };

/**
 * One named man of an outfit, made a full character the first time the boss
 * deals with him (an emissary at his door, a man asking for help), on dice of
 * his own (seed + outfit + slot) so the rest of the game never reshuffles.
 * Kept from then on. Never the offstage old man.
 */
export function mintMan(s: GameState, f: FamKey, slot: number): Character | undefined {
  const d = famDef(f);
  const m = d?.roster[slot];
  if (!d || !m || m.offstage) return undefined;
  const st = ensureFamilies(s);
  const key = `${f}:${slot}`;
  const have = st.minted[key] ? s.characters[st.minted[key]] : undefined;
  if (have) return have.alive ? have : undefined;
  const nick = /"([^"]+)"/.exec(m.name)?.[1];
  const parts = m.name.replace(/\s*"[^"]+"\s*/, ' ').trim().split(/\s+/);
  const first = parts[0];
  const last = parts.slice(1).join(' ') || d.short;
  const saved = s.rng;
  s.rng = hashSeed(`${s.seed}:man:${key}`);
  const role = m.role;
  const age = role === 'boss' ? 58 : role === 'underboss' || role === 'consigliere' ? 52 : role === 'capo' ? 46 : 34;
  const c = makeCharacter(s, { firstName: first, lastName: last, ethnicity: m.eth ?? d.eth, rank: RANK_OF[role], faction: isRival(f) ? f : 'none', age: age + Math.floor(rand(st) * 8) - 4, nickname: false });
  s.rng = saved;
  if (nick) c.nickname = nick;
  c.office = `${role === 'boss' ? 'Boss' : role === 'underboss' ? 'Underboss' : role === 'consigliere' ? 'Consigliere' : role === 'capo' ? 'Capo' : 'Soldier'}, ${d.short}`;
  st.minted[key] = c.id;
  return c;
}

/** The slot of a roster man by role (the first of that role that is not offstage). */
function slotOf(f: FamKey, roles: RosterMan['role'][], pickN = 0): number {
  const d = famDef(f);
  if (!d) return -1;
  const idx = d.roster.map((m, i) => (roles.includes(m.role) && !m.offstage ? i : -1)).filter((i) => i >= 0);
  return idx.length ? idx[pickN % idx.length] : -1;
}

export function rivalFor(s: GameState, f: FamKey): Rival | undefined {
  return isRival(f) ? s.rivals.find((r) => r.id === f) : undefined;
}

export interface RosterLine extends RosterMan { charId?: string }

/** The family's men: its living characters on the board first (boss, capos), then the rest of the roster. */
export function rosterOf(s: GameState, f: FamKey): RosterLine[] {
  const d = famDef(f);
  if (!d) return [];
  const out: RosterLine[] = [];
  const r = rivalFor(s, f);
  if (r) {
    const boss = s.characters[r.leaderId];
    if (boss?.alive) out.push({ name: displayName(boss), role: f === 'philly' ? 'capo' : 'boss', note: f === 'philly' ? 'South Jersey; chairs the Table' : undefined, charId: boss.id });
    const men = Object.values(s.characters).filter((c) => c.alive && c.faction === f && c.id !== r.leaderId && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere'))
      .sort((x, y) => x.id.localeCompare(y.id)).slice(0, 4);
    for (const c of men) out.push({ name: displayName(c), role: c.rank === 'underboss' ? 'underboss' : c.rank === 'consigliere' ? 'consigliere' : 'capo', note: c.office ?? (f === 'manno' ? 'in Wildwood' : undefined), charId: c.id });
  }
  for (const [i, m] of d.roster.entries()) {
    if (out.some((x) => x.name === m.name)) continue;
    const id = s.families?.minted[`${f}:${i}`];
    out.push(id && s.characters[id] ? { ...m, charId: id } : m);
  }
  const order = { boss: 0, underboss: 1, consigliere: 2, capo: 3, soldier: 4 };
  return out.sort((x, y) => order[x.role] - order[y.role]).map((x) => (x.note === undefined ? (({ note: _n, ...rest }) => rest)(x) : x));
}

/** The boss's name, as the boss would say it. */
export function bossName(s: GameState, f: FamKey): string {
  const r = rivalFor(s, f);
  if (r && f !== 'philly') { const c = s.characters[r.leaderId]; if (c) return displayName(c); }
  if (f === 'philly') return 'the old man in South Philadelphia';
  return famDef(f)?.boss ?? famName(s, f);
}

/* ------------------------------------------------------------------ */
/* The ties                                                             */
/* ------------------------------------------------------------------ */

/** The ties the game itself makes: a marriage alliance with a family on the board, pacts in force. */
function liveTies(s: GameState): Tie[] {
  const out: Tie[] = [];
  for (const f of ['manno', 'feldstein', 'kessler', 'philly'] as const) {
    if (alliedWithFaction(s, f)) out.push({ id: `live:m:${f}`, a: 'player', b: f, kind: 'marriage', since: s.date.y, strength: 70, story: `Your house is allied to ${famName(s, f)} by marriage.`, live: true });
  }
  for (const p of s.talks?.pacts ?? []) {
    if (p.until <= s.week) continue;
    const kind: TieKind | undefined = p.kind === 'alliance' || p.kind === 'partnership' ? 'partners' : p.kind === 'truce' ? 'truce' : undefined;
    if (!kind) continue;
    const a = p.a === 'player' ? 'player' : p.a;
    if (!(a === 'player' || isRival(a as FamKey)) || !isRival(p.b as FamKey)) continue;
    out.push({ id: `live:p:${p.id}`, a: a as FamKey, b: p.b as FamKey, kind, since: s.date.y, strength: p.kind === 'alliance' ? 60 : 45, story: `A ${p.kind} in force until week ${p.until}: ${p.terms}.`, live: true });
  }
  return out;
}

export function allTies(s: GameState): Tie[] {
  return [...(s.families?.ties ?? []), ...liveTies(s)];
}

export function tiesOf(s: GameState, f: FamKey): Tie[] {
  return allTies(s).filter((t) => t.a === f || t.b === f);
}

export function otherEnd(t: Tie, f: FamKey): FamKey {
  return t.a === f ? t.b : t.a;
}

export function tieBetween(s: GameState, a: FamKey, b: FamKey): Tie[] {
  return allTies(s).filter((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a));
}

/** The tie in words, from one side ("Marriage with Saladino — …"). */
export function tieLine(s: GameState, t: Tie, from: FamKey): string {
  const o = otherEnd(t, from);
  const who = o === 'player' ? 'your house' : famName(s, o);
  let what = TIE_LABEL[t.kind];
  if (t.kind === 'sponsor') what = t.a === from ? `Made ${who}` : `Made by ${who}`;
  else if (t.kind === 'debt') what = (t.by === 'a' ? t.a : t.b) === from ? `Owes ${who}` : `${who === 'your house' ? 'Your house owes them' : `${who} owes them`}`;
  else what = `${what} with ${who}`;
  return what;
}

/** How warm the tie is for the two ends (−1 … 1), weighted by its strength. */
export function tieWeight(t: Tie): number {
  return TIE_SIGN[t.kind] * (t.strength / 100);
}

/** Sum of the ties between two families (−1 … 1 each). */
export function bond(s: GameState, a: FamKey, b: FamKey): number {
  return tieBetween(s, a, b).reduce((x, t) => x + tieWeight(t), 0);
}

/* ------------------------------------------------------------------ */
/* Their view of the boss, and their stance                             */
/* ------------------------------------------------------------------ */

/** What a family thinks of the boss before its ties (−100 … 100). */
export function viewOf(s: GameState, f: FamKey): number {
  if (f === 'player') return 100;
  const r = rivalFor(s, f);
  if (r) return s.characters[r.leaderId]?.alive ? opinion(s, r.leaderId, s.playerId) : 0;
  if (isNyc(f)) return nycOf(s).opinion[f] ?? 0;
  return s.families?.view[f] ?? 0;
}

export interface Stance { value: number; base: number; shift: number; parts: Reason[] }

/**
 * A family's stance toward the boss: its own view, then its ties (a direct
 * tie with the house counts in full; a tie to a third family carries that
 * family's view of the boss: allies of his friends warm to him, allies of
 * his enemies cool, a feud with his friend cools them, a feud with his enemy
 * warms them).
 */
export function stanceTo(s: GameState, f: FamKey): Stance {
  const base = Math.round(viewOf(s, f));
  const parts: Reason[] = [{ label: 'What they think of you', value: base }];
  let shift = 0;
  for (const t of tiesOf(s, f)) {
    const o = otherEnd(t, f);
    let v: number;
    let label: string;
    if (o === 'player') {
      v = TIE_SIGN[t.kind] * t.strength * 0.3;
      label = tieLine(s, t, f);
    } else {
      const ov = viewOf(s, o);
      v = tieWeight(t) * 0.3 * ov;
      label = `${tieLine(s, t, f)}, who ${ov >= 10 ? 'thinks well of you' : ov <= -10 ? 'thinks ill of you' : 'has no view of you'}`;
    }
    v = Math.round(v);
    if (!v) continue;
    shift += v;
    parts.push({ label, value: v });
  }
  shift = clamp(shift, -35, 35);
  return { value: clamp(base + shift, -100, 100), base, shift, parts };
}

/** The ties' share of a rival's stance, for the sit-down (diplomacy.ts) and the rivals' moves (rivals.ts). */
export function tieShift(s: GameState, f: FamKey): number {
  return s.families ? stanceTo(s, f).shift : 0;
}

export function stanceWord(v: number): string {
  return v >= 40 ? 'friendly' : v >= 12 ? 'warm' : v > -12 ? 'wary' : v > -40 ? 'cool' : 'hostile';
}

/** The ties for the sit-down's AI brief: one compact line. */
export function tiesBrief(s: GameState, f: FamKey): string {
  const ts = tiesOf(s, f);
  if (!ts.length) return '';
  return `Your family's ties: ${ts.slice(0, 6).map((t) => `${tieLine(s, t, f)} (${t.strength}/100: ${t.story})`).join(' ')} Bring one up if it fits; an ally's friend is half a friend, an enemy's friend is not.`;
}

/**
 * How a rival's move against a target reads its ties (rivals.ts scoreMoves):
 * a feud makes a strike likelier, kin and partners almost never strike; an
 * ally at war with the boss makes a strike on him likelier.
 */
export function moveTieMult(s: GameState, r: Rival, target: string, move: string): number {
  if (!s.families || r.kind === 'law') return 1;
  const me = r.id as FamKey;
  if (target === 'player') {
    if (move !== 'strike' && move !== 'expand') return 1;
    let m = 1;
    // An ally of a family at war with the boss joins in.
    for (const w of s.wars) { const b = bond(s, me, w.rival as FamKey); if (w.rival !== r.id && b > 0.3) m *= 1 + Math.min(1, b); }
    const sh = tieShift(s, me);
    m *= clamp(1 - sh / 60, 0.5, 1.6);
    return m;
  }
  const b = bond(s, me, target as FamKey);
  if (!b) return 1;
  if (move === 'strike' || move === 'expand' || move === 'inform') return b < 0 ? 1 + Math.min(1.5, -b * 1.5) : Math.max(0.15, 1 - b);
  if (move === 'ally') return b > 0 ? 1 + b : Math.max(0.2, 1 + b);
  return 1;
}

/* ------------------------------------------------------------------ */
/* Effects: the 'fam' op                                                */
/* ------------------------------------------------------------------ */

export type FamOp =
  | { op: 'view'; fam: FamKey; amount: number; reason?: string; cd?: string; weeks?: number }
  | { op: 'tie'; a: FamKey; b: FamKey; kind: TieKind; strength: number; story: string; by?: 'a' | 'b' }
  | { op: 'retie'; id: string; kind: TieKind; story: string; strength?: number }
  | { op: 'deal'; fam: FamKey; weekly: number; weeks: number; what: string }
  | { op: 'haggle'; fam: FamKey; chance: number; amount: number }
  | { op: 'peace'; rival: RivalId }
  | { op: 'cd'; key: string; weeks: number }
  /** The boss took a side: the other side and its friends cool on him. */
  | { op: 'side'; fam: FamKey; against: FamKey }
  /** Men of his lent for a week (his explicit choice; never harmed, never handed over). */
  | { op: 'lend'; ids: string[]; fam: FamKey }
  /** A tie weakens (or breaks). */
  | { op: 'weaken'; a: FamKey; b: FamKey; amount: number }
  /** An outfit's strength changes. */
  | { op: 'size'; fam: FamKey; amount: number };

export function describeFamOp(s: GameState, o: FamOp): string {
  switch (o.op) {
    case 'view': return `${famName(s, o.fam)} think${o.amount >= 0 ? 's better' : 's less'} of you (${o.amount > 0 ? '+' : ''}${o.amount})`;
    case 'tie': return `A new tie: ${TIE_LABEL[o.kind].toLowerCase()} between ${famName(s, o.a)} and ${famName(s, o.b)}`;
    case 'retie': return `The tie becomes ${TIE_LABEL[o.kind].toLowerCase()}`;
    case 'deal': return `${famName(s, o.fam)} pays you ${fmt(o.weekly)} a week for ${o.weeks} weeks (${o.what})`;
    case 'haggle': return `${Math.round(o.chance * 100)}% they take half (${fmt(o.amount / 2)}); otherwise they take it as a no`;
    case 'peace': return `The war with ${famName(s, o.rival as FamKey)} ends in a white peace`;
    case 'cd': return '';
    case 'side': return `${famName(s, o.against)} and its friends cool on you`;
    case 'lend': return `${o.ids.length} of your men busy for a week with ${famName(s, o.fam)} (they come back unharmed)`;
    case 'weaken': return `Your tie with ${famName(s, o.a === 'player' ? o.b : o.a)} weakens`;
    case 'size': return `${famName(s, o.fam)} ${o.amount >= 0 ? '+' : ''}${o.amount} men`;
  }
}

function setView(s: GameState, f: FamKey, amount: number, reason: string): void {
  if (!amount || f === 'player') return;
  const r = rivalFor(s, f);
  if (r) { if (s.characters[r.leaderId]?.alive) addOpinion(s, r.leaderId, s.playerId, reason, amount, amount < 0 ? 1 : 2); return; }
  if (isNyc(f)) { const n = ensureNyc(s); n.opinion[f] = clamp((n.opinion[f] ?? 0) + amount, -100, 100); return; }
  const st = ensureFamilies(s);
  st.view[f] = clamp((st.view[f] ?? 0) + amount, -100, 100);
}

/** Add a tie, or strengthen the same kind already there. */
export function addTie(s: GameState, a: FamKey, b: FamKey, kind: TieKind, strength: number, story: string, by?: 'a' | 'b'): Tie {
  const st = ensureFamilies(s);
  const old = st.ties.find((t) => t.kind === kind && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
  if (old) { old.strength = clamp(old.strength + Math.round(strength / 3), 1, 100); old.story = story; return old; }
  const t: Tie = { id: `t${st.next++}`, a, b, kind, since: s.date.y, strength: clamp(strength, 1, 100), story, ...(by ? { by } : {}) };
  st.ties.push(t);
  return t;
}

export function applyFamOp(ctx: Ctx, o: FamOp, label?: string): void {
  const s = ctx.s;
  const st = ensureFamilies(s);
  switch (o.op) {
    case 'view':
      setView(s, o.fam, o.amount, o.reason ?? label ?? 'Dealings between the families');
      if (o.cd) st.cd[o.cd] = s.week + (o.weeks ?? 4);
      break;
    case 'tie': {
      addTie(s, o.a, o.b, o.kind, o.strength, o.story, o.by);
      note(st, s.week, o.story, 'good');
      break;
    }
    case 'retie': {
      const t = st.ties.find((x) => x.id === o.id);
      if (!t) break;
      t.kind = o.kind;
      t.story = o.story;
      if (o.strength) t.strength = clamp(o.strength, 1, 100);
      delete t.by;
      t.since = s.date.y;
      note(st, s.week, o.story, TIE_SIGN[o.kind] >= 0 ? 'good' : 'bad');
      break;
    }
    case 'deal':
      st.deals.push({ fam: o.fam, weekly: Math.round(o.weekly), until: s.week + o.weeks, what: o.what });
      note(st, s.week, `A deal with ${famName(s, o.fam)}: ${o.what}, ${fmt(o.weekly)} a week.`, 'good');
      break;
    case 'haggle': {
      const ok = rand(st) < o.chance;
      const fam = famName(s, o.fam);
      if (ok) {
        money(ctx, -Math.round(o.amount / 2), `Half the summer end to ${fam}`, 'tribute');
        setView(s, o.fam, -2, 'Paid half and asked for patience');
        ctx.log.push(`${fam} took half and said they would be patient.`);
        journal(s, { t: `${fam} took half the summer end`, x: `You paid ${fmt(o.amount / 2)} and asked for patience; they took it.`, c: 'rivals', src: 'families', ln: 'diplomacy.board', m: -Math.round(o.amount / 2) });
      } else {
        setView(s, o.fam, -10, 'Short-changed them on the summer end');
        heat(ctx, 'family', 6, `${fam} took it as a no`, 'heat');
        ctx.log.push(`${fam} would not take half: they took it as a no.`);
        journal(s, { t: `${fam} would not take half`, x: 'They took it as a no. They think less of you, and family heat rose.', c: 'rivals', src: 'families', ln: 'diplomacy.board' });
      }
      break;
    }
    case 'peace': {
      const w = s.wars.find((x) => x.rival === o.rival);
      if (w) {
        endWar(ctx, w, 'white', 'white');
        note(st, s.week, `The Commission's word ended your war with ${famName(s, o.rival as FamKey)}: a white peace.`, 'neutral');
      }
      break;
    }
    case 'cd':
      st.cd[o.key] = s.week + o.weeks;
      break;
    case 'side': {
      setView(s, o.against, -6, `Sided with ${famName(s, o.fam)} against us`);
      for (const t of tiesOf(s, o.against)) {
        const x = otherEnd(t, o.against);
        if (x === 'player' || x === o.fam || tieWeight(t) < 0.3) continue;
        setView(s, x, -3, `Sided against our friends, ${famName(s, o.against)}`);
      }
      if (isRival(o.fam)) noteKept(s, o.fam, `you stood with them against ${famName(s, o.against)}`);
      break;
    }
    case 'lend':
      for (const id of o.ids) { const c = s.characters[id]; if (c?.alive) c.busyUntil = Math.max(c.busyUntil ?? 0, s.week + 1); }
      break;
    case 'weaken':
      for (const t of st.ties) {
        if (!((t.a === o.a && t.b === o.b) || (t.a === o.b && t.b === o.a)) || TIE_SIGN[t.kind] <= 0) continue;
        t.strength = clamp(t.strength - o.amount, 1, 100);
      }
      break;
    case 'size':
      st.size[o.fam] = Math.max(3, sizeOf(s, o.fam) + o.amount);
      break;
  }
}

/* ------------------------------------------------------------------ */
/* The boss builds ties: the 'fam' order                               */
/* ------------------------------------------------------------------ */

export type FamAction =
  | { op: 'envoy'; fam: FamKey }
  | { op: 'favor'; fam: FamKey }
  | { op: 'partner'; fam: FamKey }
  | { op: 'marry'; fam: FamKey }
  | { op: 'broker'; tie: string };

export const ENVOY_COST: Record<1 | 2 | 3, number> = { 1: 400, 2: 1200, 3: 2500 };
export const FAVOR_COST: Record<1 | 2 | 3, number> = { 1: 900, 2: 1600, 3: 2400 };
export const PARTNER_STAKE: Record<1 | 2 | 3, number> = { 1: 3000, 2: 5000, 3: 8000 };
export const WEDDING_COST = 2500;

function famBlock(s: GameState, f: FamKey): string | undefined {
  const d = famDef(f);
  if (!d) return 'Not a family';
  const r = rivalFor(s, f);
  if (r && !s.characters[r.leaderId]?.alive) return 'Their boss is gone';
  if (s.wars.some((w) => w.rival === f)) return 'You are at war with them';
  return undefined;
}

function odds(base: number, parts: Reason[]): Acceptance {
  const sum = base + parts.reduce((a, p) => a + p.value, 0);
  return { chance: clamp(sum, 5, 92) / 100, reasons: [{ label: 'Base', value: base }, ...parts.filter((p) => p.value)] };
}

function stanceReason(s: GameState, f: FamKey, k: number): Reason {
  const st = stanceTo(s, f);
  return { label: `Their stance: ${stanceWord(st.value)} (${st.value > 0 ? '+' : ''}${st.value})`, value: Math.round(st.value * k) };
}

const cdLeft = (s: GameState, key: string) => Math.max(0, (s.families?.cd[key] ?? 0) - s.week);

export function previewFam(s: GameState, a: FamAction): ActionPreview {
  const st = s.families;
  if (a.op === 'broker') {
    const t = st?.ties.find((x) => x.id === a.tie);
    const title = t ? `Broker a truce between ${famName(s, t.a)} and ${famName(s, t.b)}` : 'Broker a truce';
    if (!t || (t.kind !== 'feud' && t.kind !== 'broken') || t.a === 'player' || t.b === 'player') return { title, effects: [], cost: 0, because: 'brokered a truce', category: 'cost', disabledReason: 'Only a feud or a broken truce between two other families' };
    const reach = Math.max(famDef(t.a)?.reach ?? 1, famDef(t.b)?.reach ?? 1) as 1 | 2 | 3;
    const cost = 1000 * reach;
    const sa = stanceTo(s, t.a).value, sb = stanceTo(s, t.b).value;
    const acc = odds(25, [
      { label: `${famName(s, t.a)}'s stance`, value: Math.round(sa * 0.25) },
      { label: `${famName(s, t.b)}'s stance`, value: Math.round(sb * 0.25) },
      { label: 'Your respect', value: Math.round((s.respect - 50) * 0.3) },
      { label: `How deep the bad blood runs (${t.strength})`, value: -Math.round(t.strength * 0.2) },
    ]);
    const story = `Your house brokered a truce between ${famName(s, t.a)} and ${famName(s, t.b)} in ${s.date.y}. The old trouble: ${t.story}`;
    return {
      title, cost, category: 'cost', because: `brokered a truce between ${famName(s, t.a)} and ${famName(s, t.b)}`,
      detail: `Two dinners, a neutral table, gifts for both sides (${fmt(cost)}). If they shake, the feud becomes a truce and both owe you a little.`,
      effects: [
        { type: 'money', amount: -cost, category: 'cost', label: 'Gifts and the dinners' },
        { type: 'fam', op: { op: 'retie', id: t.id, kind: 'truce', story, strength: 40 } },
        { type: 'fam', op: { op: 'view', fam: t.a, amount: 6, reason: 'Brokered our truce' } },
        { type: 'fam', op: { op: 'view', fam: t.b, amount: 6, reason: 'Brokered our truce', cd: `broker:${t.id}`, weeks: 8 } },
      ],
      refuseEffects: [{ type: 'fam', op: { op: 'cd', key: `broker:${t.id}`, weeks: 8 } }],
      acceptance: acc, oddsLabel: 'They shake',
      ...(cdLeft(s, `broker:${t.id}`) ? { disabledReason: `They will not sit again so soon (${cdLeft(s, `broker:${t.id}`)} weeks)` } : {}),
    };
  }
  const f = a.fam;
  const d = famDef(f);
  const name = famName(s, f);
  const reach = (d?.reach ?? 1) as 1 | 2 | 3;
  const block = famBlock(s, f);
  const base = { effects: [] as Effect[], cost: 0, category: 'cost' as const };
  switch (a.op) {
    case 'envoy': {
      const cost = ENVOY_COST[reach];
      const cd = cdLeft(s, `envoy:${f}`);
      const hasTie = tiesOf(s, f).some((t) => otherEnd(t, f) === 'player');
      const acc = odds(50, [stanceReason(s, f, 0.4), ...(hasTie ? [{ label: 'Already tied to your house', value: 10 }] : []), { label: reach === 3 ? 'A long way to send a man' : reach === 2 ? 'New York is not the Shore' : 'A short drive', value: reach === 3 ? -10 : reach === 2 ? -5 : 5 }]);
      const effects: Effect[] = [
        { type: 'money', amount: -cost, category: 'cost', label: `Envoy to ${name}` },
        { type: 'fam', op: { op: 'view', fam: f, amount: 10, reason: 'Sent a man with respect and gifts', cd: `envoy:${f}`, weeks: 4 } },
      ];
      if (!hasTie) effects.push({ type: 'fam', op: { op: 'tie', a: f, b: 'player', kind: 'friends', strength: 30, story: `Your envoy sat with ${bossName(s, f)} in ${s.date.y}: the start of a friendship.` } });
      return {
        ...base, title: `Send an envoy to ${name}`, cost, effects, acceptance: acc, oddsLabel: 'He is well received',
        because: `sent an envoy to ${name}`,
        detail: `A trusted man goes ${d?.seat ? `to ${d.seat}` : ''} with gifts and your respects (${fmt(cost)}). Received well, they think better of you${hasTie ? '' : ' and a friendship begins (a tie)'}; turned away, the gifts are still spent.`,
        refuseEffects: [{ type: 'money', amount: -cost, category: 'cost', label: `Envoy to ${name}` }, { type: 'fam', op: { op: 'view', fam: f, amount: -2, reason: 'Sent a man we did not want', cd: `envoy:${f}`, weeks: 4 } }],
        ...(block ? { disabledReason: block } : cd ? { disabledReason: `Your last envoy was there recently (${cd} weeks)` } : {}),
      };
    }
    case 'favor': {
      const cost = FAVOR_COST[reach];
      const owes = tieBetween(s, f, 'player').some((t) => t.kind === 'debt' && (t.by === 'a' ? t.a : t.b) === f);
      return {
        ...base, title: `Do ${name} a favor`, cost, because: `did ${name} a favor`,
        detail: `A job for a nephew, a hotel room nobody asks about, a problem with an inspector made to go away (${fmt(cost)}). Certain: they owe you (a debt tie) and think better of you.`,
        effects: [
          { type: 'money', amount: -cost, category: 'cost', label: `A favor for ${name}` },
          { type: 'fam', op: { op: 'tie', a: f, b: 'player', kind: 'debt', strength: 40, by: 'a', story: `${name} owes your house for a favor done in ${s.date.y}.` } },
          { type: 'fam', op: { op: 'view', fam: f, amount: 5, reason: 'Did us a favor', cd: `favor:${f}`, weeks: 6 } },
        ],
        ...(block ? { disabledReason: block } : owes ? { disabledReason: 'They already owe you one' } : cdLeft(s, `favor:${f}`) ? { disabledReason: `You did them one lately (${cdLeft(s, `favor:${f}`)} weeks)` } : {}),
      };
    }
    case 'partner': {
      const stake = PARTNER_STAKE[reach];
      const weekly = Math.round(stake * 0.05);
      const what = (d?.rackets[0] ?? 'their business').replace(/^the /, '');
      const sv = stanceTo(s, f).value;
      const acc = odds(30, [stanceReason(s, f, 0.5), { label: 'Your respect', value: Math.round((s.respect - 50) * 0.2) }]);
      return {
        ...base, title: `Propose a partnership to ${name}`, cost: stake, because: `went into partnership with ${name}`,
        detail: `Put ${fmt(stake)} into ${what}; ${fmt(weekly)} a week back for half a year, and a partner's tie. Turned down, the money stays home.`,
        effects: [
          { type: 'money', amount: -stake, category: 'cost', label: `Your stake with ${name}` },
          { type: 'fam', op: { op: 'deal', fam: f, weekly, weeks: 26, what } },
          { type: 'fam', op: { op: 'tie', a: f, b: 'player', kind: 'partners', strength: 45, story: `Partners since ${s.date.y}: your money in ${what}.` } },
          { type: 'fam', op: { op: 'view', fam: f, amount: 4, reason: 'A partner', cd: `partner:${f}`, weeks: 13 } },
        ],
        refuseEffects: [{ type: 'fam', op: { op: 'cd', key: `partner:${f}`, weeks: 6 } }],
        acceptance: acc, oddsLabel: 'They take your money',
        ...(block ? { disabledReason: block } : sv < 0 ? { disabledReason: 'They will not do business with you now (stance below zero)' } : cdLeft(s, `partner:${f}`) ? { disabledReason: `Not again so soon (${cdLeft(s, `partner:${f}`)} weeks)` } : {}),
      };
    }
    case 'marry': {
      const m = matronOf(s);
      const married = tieBetween(s, f, 'player').some((t) => t.kind === 'marriage');
      const sv = stanceTo(s, f).value;
      const acc = odds(35, [stanceReason(s, f, 0.5), ...(tieBetween(s, f, 'player').some((t) => TIE_SIGN[t.kind] < 0) ? [{ label: 'Bad blood between you', value: -20 }] : [])]);
      const who = m ? displayName(m) : 'the matchmaker';
      return {
        ...base, title: `A marriage with ${name}, through ${m ? m.firstName : 'the matchmaker'}`, cost: WEDDING_COST, because: `arranged a marriage with ${name}`,
        detail: `${who} finds a match among the grown cousins of both houses; both say yes or nothing happens. The wedding is on you (${fmt(WEDDING_COST)}). A marriage is the strongest tie there is.`,
        effects: [
          { type: 'money', amount: -WEDDING_COST, category: 'cost', label: `The wedding with ${name}` },
          { type: 'fam', op: { op: 'tie', a: f, b: 'player', kind: 'marriage', strength: 65, story: `${who} arranged it in ${s.date.y}: a grown cousin of your house married into ${name}.` } },
          { type: 'fam', op: { op: 'view', fam: f, amount: 12, reason: 'Family now, by marriage' } },
        ],
        refuseEffects: [{ type: 'fam', op: { op: 'cd', key: `marry:${f}`, weeks: 13 } }],
        acceptance: acc, oddsLabel: 'Both families say yes',
        ...(block ? { disabledReason: block } : !m ? { disabledReason: 'No woman of your house to arrange it' } : married ? { disabledReason: 'Already tied by marriage' } : sv < -10 ? { disabledReason: 'They would not hear of it now (stance below −10)' } : cdLeft(s, `marry:${f}`) ? { disabledReason: `They said no lately (${cdLeft(s, `marry:${f}`)} weeks)` } : {}),
      };
    }
  }
}

/** The orders the bots may give (tests). */
export function famActions(s: GameState): { kind: 'fam'; op: FamAction }[] {
  if (!s.families) return [];
  return FAM_KEYS.slice(0, 6).map((fam) => ({ kind: 'fam' as const, op: { op: 'envoy' as const, fam } }));
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

const free = (st: FamState, key: string, w: number) => (st.cd[key] ?? 0) <= w;
const roll = (st: FamState, p: number) => rand(st) < p;
const pickOf = <T,>(st: FamState, xs: readonly T[]): T => xs[Math.floor(rand(st) * xs.length)];

function famEvent(s: GameState, defId: string, title: string, text: string, choices: EventInstance['choices'], opts: { mandatory?: boolean; priority?: number; fam: string; actors?: string[] }): EventInstance {
  return {
    iid: `ev${s.nextId++}`, defId, week: s.week, mandatory: !!opts.mandatory, priority: opts.priority ?? 48,
    title, text, choices, defaultChoiceId: choices[0].id, meta: { faction: opts.fam, asked: 1 }, actors: opts.actors ?? [],
  };
}

function pendingFam(s: GameState, defId: string): boolean {
  return s.eventQueue.some((e) => e.defId === defId) || s.pendingEvents.some((e) => e.defId === defId);
}

function alive(s: GameState, f: FamKey): boolean {
  const r = rivalFor(s, f);
  return !r || !!s.characters[r.leaderId]?.alive;
}

/**
 * The web's week (engine.ts, after the Table): the deals pay, the ties move
 * once a month, an ally sends men to a family at war with the boss and
 * Philadelphia takes a side, Philadelphia, Atlantic City and New York come
 * to the boss, and the Commission recognizes new bosses.
 */
export function familiesWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.rivals?.length) return;
  const st = ensureFamilies(s);
  const w = s.week;
  // The deals.
  for (const d of st.deals) {
    if (d.until <= w) continue;
    if (!alive(s, d.fam) || s.wars.some((x) => x.rival === d.fam)) continue;
    money(ctx, d.weekly, `${famName(s, d.fam)}: ${d.what}`, 'business');
  }
  const done = st.deals.filter((d) => d.until <= w);
  for (const d of done) note(st, w, `The deal with ${famName(s, d.fam)} (${d.what}) ran its term.`);
  st.deals = st.deals.filter((d) => d.until > w);
  // Once a month the ties move.
  const mk = `${s.date.y}-${s.date.m}`;
  if (st.month !== mk) { if (st.month) tiesMonth(ctx, st); st.month = mk; }
  warsWeek(ctx, st);
  commissionWeek(ctx, st);
  if (s.gameOver) return;
  jockeyWeek(ctx, st);
  phillyWeek(ctx, st);
  acWeek(ctx, st);
  nycWeekly(ctx, st);
  rewardWeek(ctx, st);
}

/** The month: strengths drift, and one thing may change in the web. */
function tiesMonth(ctx: Ctx, st: FamState): void {
  const s = ctx.s;
  for (const t of st.ties) {
    let d = Math.round((rand(st) - 0.5) * 4);
    // Ground both want sharpens a feud on the island.
    if (t.kind === 'feud' && isRival(t.a) && isRival(t.b) && s.districts.some((x) => (x.influence[t.a as RivalId] ?? 0) >= 10 && (x.influence[t.b as RivalId] ?? 0) >= 10)) d += 2;
    t.strength = clamp(t.strength + d, 5, 100);
  }
  // The ties feed the families' own relations (talks.ts rivalRel).
  if (s.talks) for (const t of st.ties) {
    if (!isRival(t.a) || !isRival(t.b) || t.a === 'philly' || t.b === 'philly') continue;
    const k = t.a < t.b ? `${t.a}|${t.b}` : `${t.b}|${t.a}`;
    s.talks.rivalRel[k] = clamp((s.talks.rivalRel[k] ?? 0) + Math.round(tieWeight(t) * 4), -100, 100);
  }
  if (!roll(st, 0.45)) return;
  const fams = FAM_KEYS.filter((f) => alive(s, f));
  const kind = pickOf(st, ['marriage', 'debt', 'feudEnds', 'betrayal', 'flare'] as const);
  const say = (t: string, tone: FamLog['tone']) => { note(st, s.week, t, tone); logTalk(s, t, 'rivals'); ctx.log.push(t); };
  switch (kind) {
    case 'marriage': {
      const a = pickOf(st, fams);
      const cands = fams.filter((b) => b !== a && !tieBetween(s, a, b).some((t) => t.kind === 'marriage' || TIE_SIGN[t.kind] < 0));
      if (!cands.length) return;
      const b = pickOf(st, cands);
      const story = `A daughter of the ${famName(s, a)} people married a nephew of ${famName(s, b)} in ${s.date.y}.`;
      addTie(s, a, b, 'marriage', 45, story);
      say(`A wedding between families: ${story}`, 'neutral');
      return;
    }
    case 'debt': {
      const t = pickOf(st, st.ties.filter((x) => x.kind === 'debt'));
      if (!t) return;
      const story = `${famName(s, t.by === 'b' ? t.b : t.a)} paid its debt in ${s.date.y}; now the two do business.`;
      Object.assign(t, { kind: 'partners' as TieKind, story, strength: 40, since: s.date.y });
      delete t.by;
      say(`A debt paid: ${story}`, t.a === 'player' || t.b === 'player' ? 'good' : 'neutral');
      return;
    }
    case 'feudEnds': {
      const t = st.ties.filter((x) => x.kind === 'feud' && x.strength < 40 && x.a !== 'player' && x.b !== 'player').sort((x, y) => x.strength - y.strength)[0];
      if (!t) return;
      Object.assign(t, { kind: 'truce' as TieKind, story: `A sit-down in ${s.date.y} ended the feud between ${famName(s, t.a)} and ${famName(s, t.b)}. Nobody calls it friendship.`, strength: 35, since: s.date.y });
      say(`A feud ends: ${t.story}`, 'neutral');
      return;
    }
    case 'betrayal': {
      const t = st.ties.filter((x) => (x.kind === 'partners' || x.kind === 'truce' || x.kind === 'racket') && x.strength < 40 && x.a !== 'player' && x.b !== 'player')[0];
      if (!t) return;
      const [cheat, cheated] = roll(st, 0.5) ? [t.a, t.b] : [t.b, t.a];
      Object.assign(t, { kind: 'broken' as TieKind, story: `${famName(s, cheat)} cheated ${famName(s, cheated)} on the count in ${s.date.y}. The old arrangement is dead.`, strength: 45, since: s.date.y });
      say(`A betrayal: ${t.story}`, 'bad');
      return;
    }
    case 'flare': {
      const t = st.ties.filter((x) => x.kind === 'feud' || x.kind === 'broken').sort((x, y) => y.strength - x.strength)[0];
      if (!t) return;
      t.kind = 'feud';
      t.strength = clamp(t.strength + 15, 5, 100);
      if (isRival(t.a) && isRival(t.b) && s.talks) { const k = t.a < t.b ? `${t.a}|${t.b}` : `${t.b}|${t.a}`; s.talks.rivalRel[k] = clamp((s.talks.rivalRel[k] ?? 0) - 10, -100, 100); }
      say(`A feud flares: ${famName(s, t.a)} and ${famName(s, t.b)} are at each other again (${t.strength}/100).`, t.a === 'player' || t.b === 'player' ? 'bad' : 'neutral');
      return;
    }
  }
}

/** The boss's wars, read through the web: allies send men, Philadelphia takes a side. */
function warsWeek(ctx: Ctx, st: FamState): void {
  const s = ctx.s;
  for (const war of s.wars) {
    const foe = s.rivals.find((r) => r.id === war.rival);
    if (!foe || foe.kind !== 'mob') continue;
    // An ally of the family at war with the boss sends men (once a war).
    for (const t of tiesOf(s, war.rival as FamKey)) {
      const o = otherEnd(t, war.rival as FamKey);
      if (o === 'player' || o === 'philly' || TIE_SIGN[t.kind] < 0.5) continue;
      const key = `join:${war.id}:${o}`;
      if (!free(st, key, s.week) || !alive(s, o)) continue;
      st.cd[key] = s.week + 999;
      if (!roll(st, 0.3 + tieWeight(t) * 0.4)) continue;
      foe.muscle = clamp(foe.muscle + 5, 5, 100);
      const ally = rivalFor(s, o);
      if (ally) ally.muscle = clamp(ally.muscle - 2, 5, 100);
      const text = `${famName(s, o)} sent men to stand with ${famName(s, foe.id as FamKey)} in the war with you (${tieLine(s, t, o).toLowerCase()}).`;
      note(st, s.week, text, 'bad');
      ctx.log.push(text);
      journal(s, { t: `${famName(s, o)} joined ${famName(s, foe.id as FamKey)}'s side`, x: `${t.story} Their muscle +5.`, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    }
    // Philadelphia takes a side two weeks in (once a war), by its ties and its view.
    const pk = `side:${war.id}`;
    const philly = s.rivals.find((r) => r.id === 'philly');
    if (!philly || !s.characters[philly.leaderId]?.alive || !free(st, pk, s.week) || s.week - war.startWeek < 2) continue;
    st.cd[pk] = s.week + 999;
    const you = stanceTo(s, 'philly').value;
    const them = Math.round(bond(s, 'philly', war.rival as FamKey) * 40 + opinion(s, philly.leaderId, foe.leaderId) * 0.5);
    const reasons = [`Philadelphia's stance toward you: ${you}`, `toward ${famName(s, foe.id as FamKey)}: ${them} (ties and the old man's view)`];
    if (you - them > 10) {
      foe.muscle = clamp(foe.muscle - 6, 5, 100);
      heat(ctx, 'family', -3, 'Philadelphia is on your side', 'heat');
      const text = `Philadelphia sided with you against ${famName(s, foe.id as FamKey)}: they were told to pull their men back.`;
      note(st, s.week, text, 'good');
      ctx.log.push(text);
      journal(s, { t: 'Philadelphia took your side', x: `${famName(s, foe.id as FamKey)} was told to pull back (their muscle −6).`, r: reasons, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    } else if (them - you > 10) {
      foe.muscle = clamp(foe.muscle + 6, 5, 100);
      heat(ctx, 'family', 4, 'Philadelphia leans the other way', 'heat');
      const text = `Philadelphia leaned toward ${famName(s, foe.id as FamKey)} in your war: men and money went their way.`;
      note(st, s.week, text, 'bad');
      ctx.log.push(text);
      journal(s, { t: `Philadelphia leaned toward ${famName(s, foe.id as FamKey)}`, x: 'Their muscle +6; family heat on you +4.', r: reasons, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    } else {
      note(st, s.week, `Philadelphia stays out of your war with ${famName(s, foe.id as FamKey)}, for now.`);
    }
  }
}

/** The Commission: it recognizes a new boss, and wants a long war ended. */
function commissionWeek(ctx: Ctx, st: FamState): void {
  const s = ctx.s;
  for (const r of s.rivals) {
    if (r.kind === 'law') continue;
    const was = st.bosses[r.id];
    if (was === r.leaderId) continue;
    st.bosses[r.id] = r.leaderId;
    const c = s.characters[r.leaderId];
    if (!was || !c?.alive) continue;
    const text = `The Commission in New York recognized ${displayName(c)} as the new head of ${famName(s, r.id as FamKey)}. The ties of the old boss pass to him.`;
    note(st, s.week, text);
    ctx.log.push(text);
    journal(s, { t: `The Commission recognized ${displayName(c)}`, x: text, p: [c.id], c: 'rivals', src: 'families', ln: 'diplomacy.board' });
  }
  for (const war of s.wars) {
    const key = `commission:${war.id}`;
    if (s.week - war.startWeek < 8 || !free(st, key, s.week) || pendingFam(s, 'fam_commission')) continue;
    st.cd[key] = s.week + 26;
    const foe = famName(s, war.rival as FamKey);
    const nyc = NYC_FAMILY_IDS.map((f) => ({ type: 'fam' as const, op: { op: 'view' as const, fam: f as FamKey, amount: -5, reason: 'Ignored the Commission' } }));
    s.eventQueue.push(famEvent(s, 'fam_commission', 'The Commission wants your war ended',
      `A lawyer comes down from New York with a message from the Commission: your war with ${foe} is bad for everybody's summer. They want it over. Philadelphia has been told.`,
      [
        { id: 'peace', label: 'Make peace (a white peace)', detail: `Certain: the war with ${foe} ends, nobody takes anything. New York and Philadelphia think better of you.`, because: `made peace with ${foe} at the Commission's word`, effects: [{ type: 'fam', op: { op: 'peace', rival: war.rival } }, ...NYC_FAMILY_IDS.map((f) => ({ type: 'fam' as const, op: { op: 'view' as const, fam: f as FamKey, amount: 4, reason: 'Listened to the Commission' } })), { type: 'rivalOpinion', rival: 'philly', amount: 4, reason: 'Kept the peace when asked' }] },
        { id: 'refuse', label: 'Tell them it is a local matter', detail: 'Certain: the war goes on. Every New York family thinks less of you (−5), Philadelphia too (−4).', because: 'told the Commission the war was a local matter', effects: [...nyc, { type: 'rivalOpinion', rival: 'philly', amount: -4, reason: 'Ignored the Commission' }, { type: 'respect', amount: 1 }] },
      ], { mandatory: true, priority: 60, fam: 'nyc' }));
  }
}

/** Philadelphia: a man to check the books, the summer end, a favor asked. */
function phillyWeek(ctx: Ctx, st: FamState): void {
  const s = ctx.s;
  const philly = s.rivals.find((r) => r.id === 'philly');
  if (!philly || !s.characters[philly.leaderId]?.alive) return;
  const w = s.week;
  const roster = FAMILY_BY_ID.philly.roster.filter((m) => !m.offstage && m.role !== 'boss');
  const stance = stanceTo(s, 'philly').value;
  // A man to check on things.
  if (free(st, 'philly:visit', w) && !pendingFam(s, 'fam_philly_visit')) {
    st.cd['philly:visit'] = w + 7 + Math.floor(rand(st) * 4);
    const man = pickOf(st, roster.filter((m) => m.role === 'soldier' || m.role === 'capo'));
    const who = mintMan(s, 'philly', FAMILY_BY_ID.philly.roster.indexOf(man));
    const env = Math.round((300 + s.week * 4) / 50) * 50;
    s.eventQueue.push(famEvent(s, 'fam_philly_visit', 'Philadelphia sends a man to look around',
      `${man.name}${man.note ? ` (${man.note})` : ''} comes down the White Horse Pike for Jimmy Chairs Lauritano, the underboss: a look at the books, a walk on the boards, a word about who is making money. Philadelphia's stance toward you: ${stanceWord(stance)}.`,
      [
        { id: 'open', label: 'Open the books to him', detail: 'Certain: Philadelphia thinks a little better of you (+4), family heat −3.', because: 'opened the books to Philadelphia\'s man', effects: [{ type: 'rivalOpinion', rival: 'philly', amount: 4, reason: 'Opened the books to our man' }, { type: 'heat', bar: 'family', amount: -3 }] },
        { id: 'envelope', label: `An envelope for his trouble (${fmt(env)})`, detail: `Certain: Philadelphia thinks better of you (+8), family heat −4.`, because: 'gave Philadelphia\'s man an envelope', effects: [{ type: 'money', amount: -env, category: 'tribute' }, { type: 'rivalOpinion', rival: 'philly', amount: 8, reason: 'Took care of our man' }, { type: 'heat', bar: 'family', amount: -4 }] },
        { id: 'door', label: 'Keep him at the door', detail: 'Certain: your men like it (respect +1); Philadelphia thinks less of you (−8), family heat +5.', because: 'kept Philadelphia\'s man at the door', effects: [{ type: 'respect', amount: 1 }, { type: 'rivalOpinion', rival: 'philly', amount: -8, reason: 'Kept our man at the door' }, { type: 'heat', bar: 'family', amount: 5 }] },
      ], { mandatory: true, priority: 55, fam: 'philly', actors: who ? [who.id] : [] }));
    return;
  }
  // The summer end: once a summer, July or August.
  const sk = `philly:summer:${s.date.y}`;
  if ((s.date.m === 7 || s.date.m === 8) && free(st, sk, w) && !pendingFam(s, 'fam_philly_summer')) {
    st.cd[sk] = w + 999;
    const amt = Math.max(1000, Math.round((s.money * 0.04) / 100) * 100);
    const chance = clamp(0.45 + stance / 200, 0.1, 0.85);
    s.eventQueue.push(famEvent(s, 'fam_philly_summer', 'Philadelphia wants a bigger end of the summer',
      `The Table met in South Philadelphia. The summer is good on the island, and the old man wants it shared: ${fmt(amt)} on top of the tribute, by Labor Day.`,
      [
        { id: 'pay', label: `Pay it (${fmt(amt)})`, detail: 'Certain: Philadelphia thinks better of you (+6), the sponsor tie strengthens.', because: 'paid Philadelphia its summer end', effects: [{ type: 'money', amount: -amt, category: 'tribute' }, { type: 'rivalOpinion', rival: 'philly', amount: 6, reason: 'Paid the summer end' }, { type: 'fam', op: { op: 'tie', a: 'philly', b: 'player', kind: 'sponsor', strength: 15, story: 'Philadelphia put your house on the island, and your house pays its end.' } }] },
        { id: 'half', label: `Pay half and ask for patience (${Math.round(chance * 100)}%)`, detail: `${Math.round(chance * 100)}% they take ${fmt(amt / 2)} (by their stance: ${stanceWord(stance)}); otherwise they take it as a no: −10, family heat +6.`, because: 'offered Philadelphia half the summer end', effects: [{ type: 'fam', op: { op: 'haggle', fam: 'philly', chance, amount: amt } }] },
        { id: 'refuse', label: 'Tell them the summer was slow', detail: 'Certain: Philadelphia thinks much less of you (−15), family heat +8.', because: 'refused Philadelphia its summer end', effects: [{ type: 'rivalOpinion', rival: 'philly', amount: -15, reason: 'Refused the summer end' }, { type: 'heat', bar: 'family', amount: 8 }] },
      ], { mandatory: true, priority: 58, fam: 'philly' }));
    return;
  }
  // A favor asked.
  if (free(st, 'philly:favor', w) && !pendingFam(s, 'fam_philly_favor')) {
    st.cd['philly:favor'] = w + 10 + Math.floor(rand(st) * 5);
    const asks = [
      { t: 'Put the underboss\'s nephew on a payroll for the summer', x: 'Jimmy Chairs Lauritano has a nephew home from the Army. A summer job at one of your places, a real one.', cost: 900 },
      { t: 'Put up a guest from Philadelphia for a week', x: 'A man from South Philadelphia needs a week at the shore where nobody knows his face. A room, meals, no questions.', cost: 600 },
      { t: 'Carry a message to Atlantic City', x: 'The consigliere, Ottavio Massaro, wants a word carried to Carmine Manno by somebody the Table trusts. A drive and a dinner.', cost: 200 },
    ];
    const a = pickOf(st, asks);
    s.eventQueue.push(famEvent(s, 'fam_philly_favor', `Philadelphia asks a favor: ${a.t.toLowerCase()}`, a.x,
      [
        { id: 'do', label: `Do it (${fmt(a.cost)})`, detail: 'Certain: Philadelphia owes your house (a debt tie) and thinks better of you (+6).', because: `did Philadelphia a favor (${a.t.toLowerCase()})`, effects: [{ type: 'money', amount: -a.cost, category: 'cost' }, { type: 'rivalOpinion', rival: 'philly', amount: 6, reason: 'Did us a favor' }, { type: 'fam', op: { op: 'tie', a: 'philly', b: 'player', kind: 'debt', by: 'a', strength: 35, story: `Philadelphia owes your house a favor from ${s.date.y}: ${a.t.toLowerCase()}.` } }] },
        { id: 'no', label: 'Beg off', detail: 'Certain: Philadelphia thinks less of you (−6).', because: 'begged off a favor for Philadelphia', effects: [{ type: 'rivalOpinion', rival: 'philly', amount: -6, reason: 'Begged off a favor' }] },
      ], { priority: 50, fam: 'philly' }));
  }
}

/** The Atlantic City crew: the boardwalk in season, and offers or a squeeze by its stance. */
function acWeek(ctx: Ctx, st: FamState): void {
  const s = ctx.s;
  const manno = s.rivals.find((r) => r.id === 'manno');
  if (!manno || !s.characters[manno.leaderId]?.alive) return;
  const w = s.week;
  // In season, Manno's boardwalk men press south.
  if (isInSeason(s.date) && !s.wars.some((x) => x.rival === 'manno') && roll(st, 0.2)) {
    const d = s.districts.find((x) => x.id === 'boardwalk');
    if (d && (d.influence.manno ?? 0) < 30) {
      shiftInfluence(s, 'boardwalk', 'manno', 1);
      note(st, w, 'Manno\'s boardwalk men opened another wheel of chance on the Wildwood boards.', 'bad');
    }
  }
  if (!free(st, 'ac:offer', w) || pendingFam(s, 'fam_ac')) return;
  st.cd['ac:offer'] = w + 9 + Math.floor(rand(st) * 5);
  if (s.wars.some((x) => x.rival === 'manno')) return;
  const stance = stanceTo(s, 'manno').value;
  const roster = FAMILY_BY_ID.manno.roster;
  if (stance >= 5) {
    const capo = roster.find((m) => m.note?.includes('numbers')) ?? roster[0];
    const stake = 3000;
    const weekly = 160;
    s.eventQueue.push(famEvent(s, 'fam_ac', 'Atlantic City offers a piece of its numbers',
      `${capo.name}, who runs the numbers for Carmine Manno in Atlantic City, comes down with an offer: put ${fmt(stake)} into the inlet bank, take ${fmt(weekly)} a week for half a year. Manno's stance toward you: ${stanceWord(stance)}.`,
      [
        { id: 'in', label: `Buy in (${fmt(stake)})`, detail: `Certain: ${fmt(weekly)} a week for 26 weeks, a partners' tie with Atlantic City, Manno +5.`, because: 'bought into the Atlantic City numbers', effects: [{ type: 'money', amount: -stake, category: 'cost' }, { type: 'fam', op: { op: 'deal', fam: 'manno', weekly, weeks: 26, what: 'the inlet numbers bank' } }, { type: 'fam', op: { op: 'tie', a: 'manno', b: 'player', kind: 'partners', strength: 40, story: `Partners in the Atlantic City numbers since ${s.date.y}.` } }, { type: 'rivalOpinion', rival: 'manno', amount: 5, reason: 'Came in with us' }] },
        { id: 'pass', label: 'Pass, politely', detail: 'Certain: nothing changes.', because: 'passed on the Atlantic City numbers', effects: [{ type: 'rivalOpinion', rival: 'manno', amount: -1, reason: 'Passed on our offer' }] },
      ], { priority: 46, fam: 'manno' }));
  } else {
    const capo = roster.find((m) => m.note?.includes('boardwalk')) ?? roster[0];
    const tax = 800;
    s.eventQueue.push(famEvent(s, 'fam_ac', 'Atlantic City wants a summer tax on the boards',
      `${capo.name}, Manno's man for the boardwalk games, says the wheels and the auction houses from Atlantic City to Cape May pay Atlantic City something. He wants ${fmt(tax)}. Manno's stance toward you: ${stanceWord(stance)}.`,
      [
        { id: 'pay', label: `Pay it (${fmt(tax)})`, detail: 'Certain: Manno thinks better of you (+6); your men think a little less (respect −1).', because: 'paid Atlantic City its boardwalk tax', effects: [{ type: 'money', amount: -tax, category: 'tribute' }, { type: 'rivalOpinion', rival: 'manno', amount: 6, reason: 'Paid the boardwalk tax' }, { type: 'respect', amount: -1 }] },
        { id: 'philly', label: 'Take it to Philadelphia\'s Table', detail: 'Certain: Philadelphia likes being asked (+3); Manno thinks less of you (−4).', because: 'took Atlantic City\'s boardwalk tax to the Table', effects: [{ type: 'rivalOpinion', rival: 'philly', amount: 3, reason: 'Brought it to the Table' }, { type: 'rivalOpinion', rival: 'manno', amount: -4, reason: 'Went to Philadelphia over us' }] },
        { id: 'no', label: 'Send him back up the Shore', detail: 'Certain: respect +1; Manno thinks less of you (−8).', because: 'sent Atlantic City\'s collector home', effects: [{ type: 'respect', amount: 1 }, { type: 'rivalOpinion', rival: 'manno', amount: -8, reason: 'Sent our man home empty' }] },
      ], { priority: 46, fam: 'manno' }));
  }
}

/** New York: summer emissaries who want a piece of the Shore, and partnership offers. */
function nycWeekly(ctx: Ctx, st: FamState): void {
  const s = ctx.s;
  const w = s.week;
  if (!free(st, 'nyc:any', w) || pendingFam(s, 'fam_nyc')) return;
  const summer = s.date.m >= 6 && s.date.m <= 8;
  if (!roll(st, summer ? 0.35 : 0.08)) return;
  const ready = NYC_FAMILY_IDS.filter((f) => free(st, `nyc:${f}`, w));
  if (!ready.length) return;
  const f = pickOf(st, ready);
  const fam = NYC_FAMILIES[f];
  st.cd['nyc:any'] = w + 5;
  st.cd[`nyc:${f}`] = w + 26;
  const slot = slotOf(f, ['capo', 'underboss']);
  const minted = slot >= 0 ? mintMan(s, f, slot) : undefined;
  const man = { name: minted ? displayName(minted) : fam.boss };
  const actors = minted ? [minted.id] : [];
  const stance = stanceTo(s, f).value;
  const withPhilly = bond(s, f, 'philly');
  if (summer) {
    const weekly = 120 + Math.round(rand(st) * 4) * 20;
    const weeks = Math.max(4, 36 - w % 52);
    s.eventQueue.push(famEvent(s, 'fam_nyc', `New York: the ${fam.short} family wants a piece of the Shore`,
      `${man.name} of the ${fam.short} family drives down from ${f === 'saladino' || f === 'corvino' ? 'Brooklyn' : f === 'lobianco' ? 'the Bronx' : 'Manhattan'}: a summer game on the Wildwood boards for their people, and they pay you for the corner. Their stance toward you: ${stanceWord(stance)}. Philadelphia ${withPhilly > 0.2 ? 'is friendly with them' : withPhilly < -0.2 ? 'has bad blood with them' : 'does not like New York on the Shore'}.`,
      [
        { id: 'game', label: `Give them a summer game (${fmt(weekly)} a week)`, detail: `Certain: ${fmt(weekly)} a week for ${weeks} weeks, a shared racket with the ${fam.short}s (+10). Philadelphia ${withPhilly > 0.2 ? 'does not mind' : 'thinks less of you (−5)'}.`, because: `gave the ${fam.short} family a summer game`, effects: [{ type: 'fam', op: { op: 'deal', fam: f, weekly, weeks, what: 'a summer game on the boards' } }, { type: 'fam', op: { op: 'view', fam: f, amount: 10, reason: 'Gave us a summer game' } }, { type: 'fam', op: { op: 'tie', a: f, b: 'player', kind: 'racket', strength: 35, story: `The ${fam.short} family has run a summer game on your boards since ${s.date.y}.` } }, ...(withPhilly > 0.2 ? [] : [{ type: 'rivalOpinion' as const, rival: 'philly' as const, amount: -5, reason: 'Let New York onto the Shore' }])] },
        { id: 'philly', label: 'Send him to Philadelphia', detail: `Certain: Philadelphia likes it (+5); the ${fam.short}s think less of you (−5).`, because: `sent the ${fam.short} family's man to Philadelphia`, effects: [{ type: 'rivalOpinion', rival: 'philly', amount: 5, reason: 'Sent New York to us' }, { type: 'fam', op: { op: 'view', fam: f, amount: -5, reason: 'Sent us to Philadelphia' } }] },
        { id: 'closed', label: 'The Shore is closed', detail: `Certain: respect +1; the ${fam.short}s think much less of you (−12).`, because: `told the ${fam.short} family the Shore was closed`, effects: [{ type: 'respect', amount: 1 }, { type: 'fam', op: { op: 'view', fam: f, amount: -12, reason: 'Closed the Shore to us' } }] },
      ], { priority: 47, fam: f, actors }));
    return;
  }
  const stake = 5000;
  const weekly = 260;
  s.eventQueue.push(famEvent(s, 'fam_nyc', `New York: the ${fam.short} family offers a partnership`,
    `A letter by hand from ${fam.boss}: ${fmt(stake)} into ${FAMILY_BY_ID[f].rackets[0].toLowerCase()}, ${fmt(weekly)} a week back for half a year. Their stance toward you: ${stanceWord(stance)}.`,
    [
      { id: 'in', label: `Put the money in (${fmt(stake)})`, detail: `Certain: ${fmt(weekly)} a week for 26 weeks; partners with the ${fam.short}s (+6).`, because: `went into partnership with the ${fam.short} family`, effects: [{ type: 'money', amount: -stake, category: 'cost' }, { type: 'fam', op: { op: 'deal', fam: f, weekly, weeks: 26, what: FAMILY_BY_ID[f].rackets[0].toLowerCase() } }, { type: 'fam', op: { op: 'view', fam: f, amount: 6, reason: 'Came in with us' } }, { type: 'fam', op: { op: 'tie', a: f, b: 'player', kind: 'partners', strength: 40, story: `Partners with the ${fam.short} family since ${s.date.y}.` } }] },
      { id: 'pass', label: 'Thank him and pass', detail: 'Certain: nothing changes.', because: `passed on the ${fam.short} family's offer`, effects: [{ type: 'fam', op: { op: 'view', fam: f, amount: -1, reason: 'Passed on our offer' } }] },
    ], { priority: 44, fam: f, actors }));
}

/** Once a season, Philadelphia rewards or punishes by its stance. */
function rewardWeek(ctx: Ctx, st: FamState): void {
  const s = ctx.s;
  if (!free(st, 'reward', s.week)) return;
  st.cd.reward = s.week + 13;
  const philly = s.rivals.find((r) => r.id === 'philly');
  if (!philly || !s.characters[philly.leaderId]?.alive) return;
  const sv = stanceTo(s, 'philly');
  const why = sv.parts.map((p) => `${p.label}: ${p.value > 0 ? '+' : ''}${p.value}`);
  if (sv.value >= 40) {
    const amt = 1500 + Math.round(rand(st) * 15) * 100;
    money(ctx, amt, 'Philadelphia sent business your way', 'business');
    const t = `Philadelphia sent business your way: a Camden contractor\'s card game moved to your place (${fmt(amt)}).`;
    note(st, s.week, t, 'good');
    ctx.log.push(t);
    journal(s, { t: 'Philadelphia rewarded you', x: t, r: why, m: amt, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
  } else if (sv.value <= -30) {
    heat(ctx, 'family', 6, 'Philadelphia leans on you', 'heat');
    const sp = s.families?.ties.find((x) => x.kind === 'sponsor' && x.a === 'philly' && x.b === 'player');
    if (sp) sp.strength = clamp(sp.strength - 10, 5, 100);
    const t = 'Philadelphia leaned on you: the bagman counted twice, and the Table talks about who else could run the island.';
    note(st, s.week, t, 'bad');
    ctx.log.push(t);
    journal(s, { t: 'Philadelphia leaned on you', x: `${t} Family heat +6.`, r: why, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
  }
}

/** Your men who could be lent for a week (as minds/familyAsks.ts lendableMen; not imported: that module reaches the engine). */
function lendableMen(s: GameState): Character[] {
  return Object.values(s.characters)
    .filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && (c.rank === 'soldier' || c.rank === 'associate') && (c.imprisonedUntil ?? 0) <= s.week && (c.busyUntil ?? 0) <= s.week)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* The jockeying: the families against each other, and asking for help  */
/* ------------------------------------------------------------------ */

/** Who counts as a neighbor for a fight (the Shore and Philadelphia, the Shore and North Jersey, New York with North Jersey...). */
const NEAR: Record<FamGroup, FamGroup[]> = {
  local: ['local', 'ac', 'philly'],
  philly: ['philly', 'ac', 'local'],
  ac: ['ac', 'local', 'philly', 'nj'],
  nj: ['nj', 'nyc', 'ac'],
  nyc: ['nyc', 'nj'],
  out: ['out', 'nyc'],
};

export interface JockeyLine { w: number; t: string; a: FamKey; b: FamKey; kind: 'poach' | 'skirmish' | 'court' | 'help' | 'refuse' }

/** Does this matter to the boss (a family tied to his house, or one on his island)? */
function matters(s: GameState, f: FamKey): boolean {
  return isRival(f) || tieBetween(s, f, 'player').length > 0;
}

/**
 * Every week the families jockey: a racket poached, a skirmish, enemies of
 * an enemy finding each other; the family hit asks a friend for help (who
 * sends men or says no, and the tie shows it), or asks the boss. Their
 * strength (men) moves with it. On the web's own dice.
 */
function jockeyWeek(ctx: Ctx, st: FamState): void {
  const s = ctx.s;
  const fams = FAM_KEYS.filter((f) => alive(s, f));
  if (fams.length < 2 || !roll(st, 0.7)) return;
  const tot = fams.reduce((a, f) => a + Math.sqrt(sizeOf(s, f)), 0);
  let x = rand(st) * tot;
  let agg = fams[0];
  for (const f of fams) { x -= Math.sqrt(sizeOf(s, f)); if (x <= 0) { agg = f; break; } }
  const g = famDef(agg)!.group;
  const hostile = tiesOf(s, agg).filter((t) => TIE_SIGN[t.kind] < 0 && otherEnd(t, agg) !== 'player' && alive(s, otherEnd(t, agg)));
  const near = fams.filter((f) => f !== agg && NEAR[g].includes(famDef(f)!.group) && bond(s, agg, f) < 0.4);
  let tgt: FamKey | undefined = hostile.length && roll(st, 0.7) ? otherEnd(pickOf(st, hostile), agg) : near.length ? pickOf(st, near) : undefined;
  if (!tgt) return;
  const say = (t: string, a: FamKey, b: FamKey, tone: FamLog['tone'], why?: string) => {
    note(st, s.week, t, tone);
    logTalk(s, t, 'rivals');
    if (matters(s, a) || matters(s, b)) { ctx.log.push(t); journal(s, { t, ...(why ? { x: why } : {}), c: 'rivals', src: 'families', ln: 'diplomacy.board', k: 'heard' }); }
  };
  const A = famName(s, agg), B = famName(s, tgt);
  const enemy = bond(s, agg, tgt) < 0;
  const kind = enemy ? pickOf(st, ['skirmish', 'skirmish', 'poach'] as const) : pickOf(st, ['poach', 'court', 'skirmish'] as const);
  if (kind === 'court') {
    // Enemies of an enemy find each other.
    const foes = tiesOf(s, agg).filter((t) => TIE_SIGN[t.kind] < 0).map((t) => otherEnd(t, agg)).filter((f) => f !== 'player');
    const fr = fams.filter((f) => f !== agg && !tieBetween(s, agg, f).length && foes.some((e) => bond(s, f, e) < 0));
    if (!fr.length) return;
    const y = pickOf(st, fr);
    const e = foes.find((q) => bond(s, y, q) < 0)!;
    addTie(s, agg, y, 'friends', 30, `${A} and ${famName(s, y)} found a common enemy in ${famName(s, e)} (${s.date.y}).`);
    say(`${A} and ${famName(s, y)} are getting friendly: they share an enemy in ${famName(s, e)}.`, agg, y, 'neutral');
    return;
  }
  const racket = pickOf(st, famDef(tgt)!.rackets);
  if (kind === 'poach') {
    const n = Math.max(1, Math.round(Math.sqrt(sizeOf(s, tgt)) / 3));
    st.size[agg] = sizeOf(s, agg) + n;
    st.size[tgt] = Math.max(3, sizeOf(s, tgt) - n);
    if (!enemy) addTie(s, agg, tgt, 'feud', 20, `${A} poached a piece of ${B}'s ${racket} in ${s.date.y}.`);
    else for (const t of tieBetween(s, agg, tgt)) if (TIE_SIGN[t.kind] < 0) t.strength = clamp(t.strength + 5, 1, 100);
    say(`${A} poached a piece of ${B}'s ${racket.replace(/^the /, '')} (${n} ${n === 1 ? 'man' : 'men'} went over).`, agg, tgt, 'neutral');
  } else {
    const la = Math.max(1, Math.round(Math.sqrt(sizeOf(s, agg)) / 4));
    const lb = Math.max(1, Math.round(Math.sqrt(sizeOf(s, tgt)) / 3));
    st.size[agg] = Math.max(3, sizeOf(s, agg) - la);
    st.size[tgt] = Math.max(3, sizeOf(s, tgt) - lb);
    const old = tieBetween(s, agg, tgt).find((t) => TIE_SIGN[t.kind] < 0 && !t.live);
    if (old) { old.kind = 'feud'; old.strength = clamp(old.strength + 8, 1, 100); } else addTie(s, agg, tgt, 'feud', 30, `${A} and ${B} came to blows over ${racket} in ${s.date.y}.`);
    // On the island the fight is over ground.
    if (isRival(agg) && isRival(tgt) && agg !== 'philly' && tgt !== 'philly') {
      const d = s.districts.filter((q) => (q.influence[agg] ?? 0) > 0 && (q.influence[tgt] ?? 0) > 0)[0];
      if (d) { shiftInfluence(s, d.id, agg, 1); shiftInfluence(s, d.id, tgt, -1); }
    }
    say(`${A} hit ${B} over ${racket.replace(/^the /, '')}: a small war (${la} and ${lb} men out of action).`, agg, tgt, 'bad');
    askForHelp(ctx, st, tgt, agg, say);
  }
}

/** The family that was hit asks for help: the boss (an event) or a friend of theirs. */
function askForHelp(ctx: Ctx, st: FamState, from: FamKey, against: FamKey, say: (t: string, a: FamKey, b: FamKey, tone: FamLog['tone'], why?: string) => void): void {
  const s = ctx.s;
  const sv = stanceTo(s, from).value;
  const tiedToYou = tieBetween(s, from, 'player').some((t) => TIE_SIGN[t.kind] > 0);
  if ((tiedToYou || sv >= 10) && free(st, `help:${from}`, s.week) && free(st, 'help:any', s.week) && !pendingFam(s, 'fam_help') && !s.wars.some((w) => w.rival === from) && roll(st, 0.45)) {
    st.cd[`help:${from}`] = s.week + 10;
    st.cd['help:any'] = s.week + 3;
    s.eventQueue.push(helpEvent(s, st, from, against));
    return;
  }
  const friends = tiesOf(s, from).filter((t) => tieWeight(t) > 0.2).map((t) => otherEnd(t, from)).filter((f) => f !== 'player' && f !== against && alive(s, f));
  if (!friends.length) return;
  const y = pickOf(st, friends);
  const lean = bond(s, y, from) - Math.max(0, bond(s, y, against));
  const F = famName(s, from), Y = famName(s, y), X = famName(s, against);
  if (rand(st) < clamp(0.3 + lean * 0.6, 0.05, 0.9)) {
    const n = Math.max(1, Math.round(Math.sqrt(sizeOf(s, y)) / 4));
    st.size[y] = Math.max(3, sizeOf(s, y) - 1);
    st.size[from] = sizeOf(s, from) + n;
    for (const t of tieBetween(s, y, from)) if (TIE_SIGN[t.kind] > 0) t.strength = clamp(t.strength + 6, 1, 100);
    addTie(s, y, against, 'feud', 15, `${Y} sent men to ${F} against ${X} in ${s.date.y}.`);
    say(`${F} asked ${Y} for muscle against ${X}; ${Y} sent ${n} ${n === 1 ? 'man' : 'men'}.`, from, y, 'neutral');
  } else {
    for (const t of tieBetween(s, y, from)) if (TIE_SIGN[t.kind] > 0) {
      t.strength = clamp(t.strength - 12, 1, 100);
      if (t.strength < 12 && t.kind !== 'marriage' && t.kind !== 'blood') Object.assign(t, { kind: 'broken' as TieKind, story: `${Y} would not help ${F} against ${X} in ${s.date.y}. ${F} calls it a betrayal.` });
    }
    say(`${F} asked ${Y} for muscle against ${X}; ${Y} said no, and ${F} will remember it.`, from, y, 'bad');
  }
}

/** A family asks the boss for help against another: money, muscle, a hideout, an introduction, a ruling. */
function helpEvent(s: GameState, st: FamState, from: FamKey, against: FamKey): EventInstance {
  const F = famName(s, from), X = famName(s, against);
  const d = famDef(from)!;
  const slot = slotOf(from, ['underboss', 'capo', 'consigliere'], Math.floor(rand(st) * 3));
  const man = slot >= 0 ? mintMan(s, from, slot) : undefined;
  const who = man ? displayName(man) : bossName(s, from);
  const sv = stanceTo(s, from).value;
  const side: Effect = { type: 'fam', op: { op: 'side', fam: from, against } };
  const refuse = { id: 'no', label: 'Tell him it is not your fight', detail: `Certain: ${F} thinks less of you (−6) and your tie with them weakens; ${X} never hears you were asked.`, because: `refused ${F} help against ${X}`, effects: [{ type: 'fam' as const, op: { op: 'view' as const, fam: from, amount: -6, reason: 'Would not help us' } }, { type: 'fam' as const, op: { op: 'weaken' as const, a: from, b: 'player' as FamKey, amount: 8 } }] };
  const amt = Math.round((600 + Math.sqrt(sizeOf(s, from)) * 150) / 100) * 100;
  const men = lendableMen(s).slice(0, 2);
  const friend = tiesOf(s, 'player').map((t) => otherEnd(t, 'player')).find((f) => f !== from && f !== against && f !== 'player' && TIE_SIGN[tieBetween(s, f, 'player')[0]?.kind ?? 'feud'] > 0 && !tieBetween(s, f, from).length);
  const kinds = ['money', 'hideout', 'ruling', ...(men.length ? ['muscle'] : []), ...(friend ? ['intro'] : [])] as const;
  const k = pickOf(st, kinds as readonly string[]);
  const text0 = `${who} of ${d.name} (${sizeLine(s, from)}) comes to you: ${X} hit them over their rackets. Their stance toward you: ${stanceWord(sv)}. Whatever you do, ${X} will hear of it.`;
  const base = { mandatory: false, priority: 52, fam: from as string, actors: man ? [man.id] : [] };
  switch (k) {
    case 'muscle':
      return famEvent(s, 'fam_help', `${F} asks you for muscle against ${X}`, `${text0} He wants ${men.map((c) => displayName(c)).join(' and ')} for a week: drive, stand at a door, look big.`, [
        { id: 'lend', label: `Lend ${men.map((c) => c.firstName).join(' and ')} for a week`, detail: `Your explicit choice: they are busy for a week and come back unharmed (his word). ${F} +10, they owe you; ${X} and its friends cool on you.`, because: `lent ${F} muscle against ${X}`, effects: [{ type: 'fam', op: { op: 'lend', ids: men.map((c) => c.id), fam: from } }, { type: 'fam', op: { op: 'view', fam: from, amount: 10, reason: 'Lent us men' } }, { type: 'fam', op: { op: 'tie', a: from, b: 'player', kind: 'debt', by: 'a', strength: 35, story: `${F} owes your house for men lent against ${X} in ${s.date.y}.` } }, { type: 'fam', op: { op: 'size', fam: from, amount: 2 } }, side] },
        refuse,
      ], base);
    case 'hideout':
      return famEvent(s, 'fam_help', `${F} asks you to hide a man`, `${text0} One of their men is on the lam after it. They want him kept out of sight on the island for a few weeks.`, [
        { id: 'hide', label: 'Put him up in a motel in the Crest', detail: `Certain: local heat +3; ${F} owes you and thinks better of you (+8); ${X} cools on you a little.`, because: `hid a man for ${F}`, effects: [{ type: 'heat', bar: 'local', amount: 3 }, { type: 'fam', op: { op: 'view', fam: from, amount: 8, reason: 'Hid our man' } }, { type: 'fam', op: { op: 'tie', a: from, b: 'player', kind: 'debt', by: 'a', strength: 30, story: `${F} owes your house for hiding one of its men in ${s.date.y}.` } }, { type: 'fam', op: { op: 'view', fam: against, amount: -3, reason: 'Hid a man we want' } }] },
        refuse,
      ], base);
    case 'intro': {
      const Z = famName(s, friend!);
      return famEvent(s, 'fam_help', `${F} asks for an introduction to ${Z}`, `${text0} They want to meet ${Z}, who is a friend of your house, to find allies against ${X}.`, [
        { id: 'intro', label: `Introduce them to ${Z}`, detail: `Certain: a friendship between ${F} and ${Z}; ${F} +6, ${Z} +2 for the business; ${X} cools on you.`, because: `introduced ${F} to ${Z}`, effects: [{ type: 'fam', op: { op: 'tie', a: from, b: friend!, kind: 'friends', strength: 35, story: `Your house introduced ${F} to ${Z} in ${s.date.y}.` } }, { type: 'fam', op: { op: 'view', fam: from, amount: 6, reason: 'Introduced us' } }, { type: 'fam', op: { op: 'view', fam: friend!, amount: 2, reason: 'Brought us business' } }, side] },
        refuse,
      ], base);
    }
    case 'ruling':
      return famEvent(s, 'fam_help', `${F} asks you to settle it with ${X}`, `${text0} They want a man both sides respect to rule on it. ${X} has agreed to hear you.`, [
        { id: 'for', label: `Rule for ${F}`, detail: `Certain: ${F} +8; ${X} −8 and its friends cool on you.`, because: `ruled for ${F} against ${X}`, effects: [{ type: 'fam', op: { op: 'view', fam: from, amount: 8, reason: 'Ruled for us' } }, side] },
        { id: 'against', label: `Rule for ${X}`, detail: `Certain: ${X} +8; ${F} −8 and its friends cool on you.`, because: `ruled for ${X} against ${F}`, effects: [{ type: 'fam', op: { op: 'view', fam: against, amount: 8, reason: 'Ruled for us' } }, { type: 'fam', op: { op: 'side', fam: against, against: from } }] },
        { id: 'split', label: 'Split it down the middle', detail: `Certain: both +2; the feud between them cools (−15).`, because: `split the quarrel between ${F} and ${X}`, effects: [{ type: 'fam', op: { op: 'view', fam: from, amount: 2, reason: 'A fair ruling' } }, { type: 'fam', op: { op: 'view', fam: against, amount: 2, reason: 'A fair ruling' } }, ...tieBetween(s, from, against).filter((t) => TIE_SIGN[t.kind] < 0 && !t.live).map((t) => ({ type: 'fam' as const, op: { op: 'retie' as const, id: t.id, kind: t.strength <= 30 ? 'truce' as const : 'feud' as const, story: `Your house split their quarrel in ${s.date.y}. ${t.story}`, strength: Math.max(5, t.strength - 15) } }))] },
      ], base);
    default:
      return famEvent(s, 'fam_help', `${F} asks you for money against ${X}`, `${text0} They need ${fmt(amt)} to pay their men through it.`, [
        { id: 'lend', label: `Lend it (${fmt(amt)})`, detail: `Certain: ${F} owes you (a debt tie) and thinks better of you (+8); ${X} and its friends cool on you.`, because: `lent ${F} money against ${X}`, effects: [{ type: 'money', amount: -amt, category: 'cost' }, { type: 'fam', op: { op: 'view', fam: from, amount: 8, reason: 'Lent us money' } }, { type: 'fam', op: { op: 'tie', a: from, b: 'player', kind: 'debt', by: 'a', strength: 40, story: `${F} owes your house ${fmt(amt)} from ${s.date.y}.` } }, { type: 'fam', op: { op: 'size', fam: from, amount: 2 } }, side] },
        refuse,
      ], base);
  }
}

/* ------------------------------------------------------------------ */
/* Views for the screens                                                */
/* ------------------------------------------------------------------ */

export interface FamCard {
  id: Exclude<FamKey, 'player'>;
  def: FamDef;
  boss: string;
  bossId?: string;
  stance: Stance;
  ties: { tie: Tie; line: string; other: FamKey }[];
  roster: RosterLine[];
  deals: FamDeal[];
  size: string;
}

export function famCard(s: GameState, f: Exclude<FamKey, 'player'>): FamCard {
  const def = FAMILY_BY_ID[f];
  const r = rivalFor(s, f);
  return {
    id: f, def, boss: bossName(s, f), ...(r && f !== 'philly' ? { bossId: r.leaderId } : {}),
    stance: stanceTo(s, f),
    ties: tiesOf(s, f).map((tie) => ({ tie, line: tieLine(s, tie, f), other: otherEnd(tie, f) })),
    roster: rosterOf(s, f),
    deals: (s.families?.deals ?? []).filter((d) => d.fam === f && d.until > s.week),
    size: sizeLine(s, f),
  };
}

export function famCards(s: GameState): FamCard[] {
  return FAMILY_DEFS.map((d) => famCard(s, d.id));
}
