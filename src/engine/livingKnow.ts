import type { Ctx } from './ledger';
import { ensureEars } from './ears';
import { HOODS_BY_ID } from './hoodData';
import { forgetFacts, learnFact } from './shadow';
import type { Belief, KnowLvl } from './shadowState';
import { clamp, pname, present, roll, type FactKind, type LivingState, type Tf, type Tp } from './livingState';
import type { Character, GameState } from './types';

/**
 * WHAT REALLY HAPPENED, AND WHO KNOWS IT (B11).
 *
 * Three layers, the same as the succession court's (shadowState.ts):
 *  1. the truth: `living.facts`, the world-event ledger. Never shown as such;
 *  2. what people believe: each fact's actors and `kn` (witnesses, people who
 *     were told). Word spreads along real ties, month by month; a secret
 *     spreads slower than a wedding, and a story told third-hand can be wrong;
 *  3. what the boss knows: `shadow.know[boss][factId]` (`learnFact`), reached
 *     only through real channels: it was public, he was there, the capo of the
 *     district heard it and said so at the morning meeting, an Ear heard it at
 *     night, a request brought it to him, or he had someone ask around.
 * Every player surface reads `seenFacts` / `factSeen`; nothing else.
 */

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

export interface FactOpts {
  at?: string;
  c?: (string | undefined)[];
  amt?: number;
  /** Witnesses besides the actors. */
  kn?: string[];
  st?: string;
}

/** Record something that really happened. Actors remember it. Returns the fact id. */
export function fact(s: GameState, L: LivingState, k: FactKind, actors: string[], txt: string, sec: Tf['sec'], o: FactOpts = {}): string {
  const id = `tf${L.next++}`;
  const f: Tf = { id, w: s.week, k, a: actors.filter(Boolean), txt, sec, kn: [] };
  if (o.at) f.at = o.at;
  const c = (o.c ?? []).filter((x): x is string => !!x);
  if (c.length) f.c = c;
  if (o.amt !== undefined) f.amt = Math.round(o.amt);
  if (o.kn?.length) f.kn = [...new Set(o.kn.filter((x) => x && !f.a.includes(x)))];
  if (o.st) f.st = o.st;
  L.facts.push(f);
  L.stats.facts++;
  for (const a of f.a) remember(L, a, s.week, '', id);
  return id;
}

export function factById(L: LivingState, id: string | undefined): Tf | undefined {
  if (!id) return undefined;
  // Facts are appended in id order; a binary search would do, but recent ones are what is asked for.
  for (let i = L.facts.length - 1; i >= 0; i--) if (L.facts[i].id === id) return L.facts[i];
  return undefined;
}

/** A memory: the fact itself when there is one (no copy of its words), else a few words. */
export function remember(L: LivingState, id: string, week: number, txt: string, fid?: string): void {
  const p = L.people[id];
  if (!p) return;
  p.mem.push([week, fid ?? txt]);
  if (p.mem.length > 6) p.mem.splice(0, p.mem.length - 6);
}

export function memText(L: LivingState, m: [number, string]): string | undefined {
  return m[1].startsWith('tf') ? factById(L, m[1])?.txt : m[1];
}

export function knows(f: Tf, id: string): boolean {
  return f.a.includes(id) || f.kn.includes(id);
}

export function tell(f: Tf, id: string): boolean {
  if (knows(f, id)) return false;
  f.kn.push(id);
  return true;
}

/* ------------------------------------------------------------------ */
/* What the boss knows (layer 3)                                       */
/* ------------------------------------------------------------------ */

export type Seen = { lvl: 'public' | KnowLvl; via: string; w: number; txt?: string; wrong?: boolean };

/** How the boss knows a fact, if he does. Public facts are known to anyone who reads the paper. */
export function factSeen(s: GameState, f: Tf): Seen | undefined {
  if (f.a.includes(s.playerId) || f.kn.includes(s.playerId)) return { lvl: 'confirmed', via: 'you were there', w: f.w };
  const b: Belief | undefined = s.shadow?.know[s.playerId]?.[f.id];
  if (b) return { lvl: b.lvl, via: b.via, w: b.w, ...(b.txt ? { txt: b.txt } : {}), ...(b.wrong ? { wrong: true } : {}) };
  if (f.sec === 0) return { lvl: 'public', via: 'the street', w: f.w };
  return undefined;
}

/** The boss hears of a fact. Never downgrades. */
export function bossLearns(s: GameState, f: Tf, lvl: KnowLvl, via: string, txt?: string, wrong?: boolean): boolean {
  if (f.sec === 0 && lvl === 'rumor') return false;
  return learnFact(s, s.playerId, f.id, lvl, via, txt, wrong);
}

/** Every fact the boss knows (any level), newest first. */
export function seenFacts(s: GameState, limit = 200): { f: Tf; seen: Seen }[] {
  const L = s.living;
  if (!L) return [];
  const out: { f: Tf; seen: Seen }[] = [];
  for (let i = L.facts.length - 1; i >= 0 && out.length < limit; i--) {
    const f = L.facts[i];
    const seen = factSeen(s, f);
    if (seen) out.push({ f, seen });
  }
  return out;
}

/** The text the boss has of a fact: a distorted rumor shows the version he heard. */
export function seenText(f: Tf, seen: Seen): string {
  return seen.txt ?? f.txt;
}

/* ------------------------------------------------------------------ */
/* Word gets around (layer 2), monthly                                 */
/* ------------------------------------------------------------------ */

const SPREAD: Record<Tf['sec'], number> = { 0: 0, 1: 0.45, 2: 0.18, 3: 0.04 };

/** How likely a man repeats what he knows: warm, loose-lipped men talk; the people in it keep quieter. */
function talkative(p: Tp, isActor: boolean): number {
  return (0.5 + p.t[2] / 200 + p.t[3] / 250 - p.t[1] / 400) * (isActor ? 0.5 : 1);
}

export function gossipMonth(s: GameState, L: LivingState): void {
  const recent = L.facts.filter((f) => f.sec > 0 && s.week - f.w <= 12);
  for (const f of recent) {
    const holders = [...f.a, ...f.kn].slice(0, 14);
    for (const h of holders) {
      const p = L.people[h];
      if (!present(p, s.week)) continue;
      // He tells the people closest to him, never the subject of a secret against them.
      const close = Object.entries(p.ties).filter(([, t]) => t.a >= 30 || !!t.k).map(([id]) => id).sort();
      for (const id of close) {
        if (knows(f, id) || (f.sec === 3 && f.a.includes(id))) continue;
        const r = roll(L, s.week, `tell:${f.id}:${h}:${id}`);
        if (r < SPREAD[f.sec] * talkative(p, f.a.includes(h))) tell(f, id);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Channels to the boss (weekly)                                       */
/* ------------------------------------------------------------------ */

/** The capo the district reports through (the player's man there), if any. */
export function districtCapo(s: GameState, hood: string): Character | undefined {
  const did = HOODS_BY_ID[hood as keyof typeof HOODS_BY_ID]?.district;
  const d = did ? s.districts.find((x) => x.id === did) : undefined;
  const c = d?.capoId ? s.characters[d.capoId] : undefined;
  return c && c.alive && c.faction === 'player' && c.imprisonedUntil === undefined ? c : undefined;
}

/** A rumor told third-hand can come out wrong: the amount doubled, the name lost. */
function distort(L: LivingState, s: GameState, f: Tf): string | undefined {
  const r = roll(L, s.week, `distort:${f.id}`);
  if (r < 0.7) return undefined;
  if (f.amt && r < 0.85) return f.txt.replace(/\$[\d,]+/, `$${Math.round(f.amt * 2).toLocaleString('en-US')}`);
  return f.txt.replace(/^[A-Z][a-z]+ [A-Z][A-Za-z'’-]+/, 'Somebody on the Boardwalk');
}

/**
 * The channels. The district's capo: people bring him their troubles, he
 * hears the street, and at the morning meeting he passes some of it on
 * (what involves the family's men or money first). The Ears hear the night:
 * affairs, a man drinking his wages, a thief spending. Public facts need no
 * channel. A participant (a crew lender) knows his own business.
 */
export function channelsWeek(ctx: Ctx, L: LivingState): void {
  const s = ctx.s;
  const recent = L.facts.filter((f) => f.sec > 0 && s.week - f.w <= 16 && !factSeen(s, f));
  if (!recent.length) return;
  const crewIds = new Set(Object.values(s.characters).filter((c) => c.alive && c.faction === 'player').map((c) => c.id));
  for (const hood of L.hoods) {
    const capo = districtCapo(s, hood);
    // The capo learns what his people learn, and what anyone tells a man of his.
    if (capo) {
      for (const f of recent) {
        if (knows(f, capo.id)) continue;
        const crewKnows = [...f.a, ...f.kn].some((id) => crewIds.has(id));
        const p = crewKnows ? 0.6 : f.sec === 1 ? 0.12 : f.sec === 2 ? 0.05 : 0.01;
        if (roll(L, s.week, `capo:${f.id}`) < p) tell(f, capo.id);
      }
      // At the morning meeting he passes on what concerns the family first.
      const told = recent.filter((f) => knows(f, capo.id)).sort((a, b) => weight(b, crewIds) - weight(a, crewIds) || a.id.localeCompare(b.id));
      let n = 0;
      for (const f of told) {
        if (n >= 3) break;
        if (roll(L, s.week, `meet:${f.id}`) > 0.55) continue;
        const firsthand = f.a.includes(capo.id) || [...f.a].some((id) => crewIds.has(id));
        const wrong = firsthand ? undefined : distort(L, s, f);
        if (bossLearns(s, f, firsthand ? 'confirmed' : 'rumor', `${capo.firstName} ${capo.lastName} at the morning meeting`, wrong, !!wrong)) n++;
      }
    }
  }
  // The Ears hear the night: affairs, vice, a thief with money to spend.
  const E = s.ears ? ensureEars(s) : undefined;
  if (E && E.madam) {
    for (const f of recent) {
      if (!(f.k === 'affair' || f.k === 'thief' || f.k === 'skim' || f.k === 'revenge_prep' || f.k === 'talked_cops')) continue;
      if (roll(L, s.week, `ear:${f.id}`) < 0.06) bossLearns(s, f, 'rumor', 'an Ear, late one night');
    }
  }
}

function weight(f: Tf, crew: Set<string>): number {
  return ([...f.a, ...f.kn].some((id) => crew.has(id)) ? 10 : 0) + (f.amt ?? 0) / 100 + (f.k === 'default' || f.k === 'talked_cops' || f.k === 'theft' ? 5 : 0);
}

/**
 * The boss has someone ask around about a person (a command): existing facts
 * only, never invented. What the street knows comes back as rumor or better;
 * a secret rarely does.
 */
export function askAround(s: GameState, L: LivingState, pid: string, via: string): number {
  let n = 0;
  for (const f of L.facts) {
    if (!f.a.includes(pid) || factSeen(s, f)) continue;
    const spread = f.kn.length;
    const p = f.sec === 1 ? 0.85 : f.sec === 2 ? clamp(30 + spread * 10, 0, 85) / 100 : clamp(8 + spread * 6, 0, 40) / 100;
    if (roll(L, s.week, `ask:${f.id}`) < p) {
      if (bossLearns(s, f, f.sec === 1 ? 'confirmed' : 'rumor', via)) n++;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Keeping it small                                                    */
/* ------------------------------------------------------------------ */

const KEEP_WEEKS = 104;
const KEEP_MAX = 1200;

/** Old facts go (unless an open story still needs them); the boss's beliefs about them go too. */
export function pruneFacts(s: GameState, L: LivingState): void {
  const live = new Set<string>();
  for (const st of L.stories) if (st.open || s.week - (st.w1 ?? st.w0) < KEEP_WEEKS) for (const id of st.f) live.add(id);
  for (const d of L.debts) if (d.st === 'open') live.add(d.fid);
  for (const p of Object.values(L.people)) if (p.plan?.fid) live.add(p.plan.fid);
  const before = L.facts.length;
  // A year of everything; two years of what mattered (a death, a wedding, a shop changing hands) and of what the boss learned.
  const major = new Set(['died', 'born', 'married', 'opened', 'closed', 'sold', 'inherited', 'default', 'talked_cops', 'moved_in', 'moved_out']);
  const bossKnows = s.shadow?.know[s.playerId] ?? {};
  L.facts = L.facts.filter((f) => s.week - f.w < 52 || live.has(f.id) || (s.week - f.w < KEEP_WEEKS && (major.has(f.k) || !!bossKnows[f.id])));
  if (L.facts.length > KEEP_MAX) {
    const drop = L.facts.length - KEEP_MAX;
    let i = 0;
    L.facts = L.facts.filter((f) => (live.has(f.id) || i++ >= drop));
  }
  if (L.facts.length !== before) {
    const ids = new Set(L.facts.map((f) => f.id));
    forgetFacts(s, (id) => ids.has(id), 'tf');
  }
}

export function personName(s: GameState, id: string): string {
  const p = s.living?.people[id];
  if (p) return pname(p);
  const c = s.characters[id];
  if (c) return `${c.firstName} ${c.lastName}`;
  if (id === 'family') return `the House of ${s.houseName}`;
  if (id.startsWith('rival:')) return s.rivals.find((r) => r.id === id.slice(6))?.name ?? 'another family';
  return 'someone';
}
