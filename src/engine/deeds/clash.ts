import { displayName, hasTrait } from '../characters';
import type { Ctx } from '../ledger';
import { mindOf } from '../minds/state';
import { addOpinion, getRelation, opinion } from '../relations';
import type { Character, GameState, Trait } from '../types';
import { pushAsk } from './npc';
import { ensureDeeds, pairKey, setTie, tieOf } from './state';
import { TIE_LABEL, type TieKind } from './types';

/**
 * PERSONALITY CLASHES. People who share a crew, a family or a table rub
 * along or rub each other raw, on their own: two hotheads in one room, a
 * crook and a churchgoer, two ambitious capos who want the same chair; two
 * drinkers become drinking buddies. Once a month each such pair's nature
 * (and their ambitions) moves what they think of each other (named opinion
 * modifiers, so every point has a reason); when it goes far enough a TIE
 * forms (friends, rivals, a blood feud), which the NPCs' own deeds then feed
 * (npc.ts: rivals insult and plant stories, friends lend and stand by). The
 * ties that matter to the boss come to his desk: two of his own at each
 * other's throats, one of his own gone friendly with a rival boss.
 */

export interface ClashRule { a: Trait; b: Trait; v: number; y: string; peers?: boolean }

export const CLASH_RULES: ClashRule[] = [
  { a: 'Hot-headed', b: 'Hot-headed', v: -10, y: 'Two hotheads in one room' },
  { a: 'Greedy', b: 'Pious', v: -8, y: 'A crook and a churchgoer' },
  { a: 'Greedy', b: 'Honest', v: -8, y: 'One counts the money, the other counts it twice' },
  { a: 'Cruel', b: 'Pious', v: -8, y: 'Cannot stomach his cruelty' },
  { a: 'Paranoid', b: 'Charming', v: -6, y: 'Never trusts a smooth talker' },
  { a: 'Ambitious', b: 'Ambitious', v: -9, y: 'Both want the same chair', peers: true },
  { a: 'Vengeful', b: 'Hot-headed', v: -5, y: 'Old scores and short fuses' },
  { a: 'Honest', b: 'Womanizer', v: -4, y: 'Disapproves of his carrying on' },
  { a: 'Cowardly', b: 'Cruel', v: -6, y: 'Afraid of him' },
  { a: 'Loyal-to-a-fault', b: 'Loyal-to-a-fault', v: 7, y: 'Both bleed for the family', peers: true },
  { a: 'Pious', b: 'Pious', v: 6, y: 'The same pew at St. Ann\'s' },
  { a: 'Drinker', b: 'Drinker', v: 7, y: 'Drinking buddies' },
  { a: 'Gambler', b: 'Gambler', v: 6, y: 'The same card table' },
  { a: 'Patient', b: 'Honest', v: 4, y: 'Steady men, both' },
];

/** Weeks between two weighings. */
export const CLASH_GAP = 4;
/** Most people weighed (the important ones). */
export const CLASH_POOL = 30;
/** A modifier from one clash reason stops growing at this many points. */
export const CLASH_CAP = 30;

function peers(a: Character, b: Character): boolean {
  const top = (c: Character) => c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' || c.rank === 'soldier';
  return a.faction === b.faction && top(a) && top(b) && (a.rank === b.rank || (a.rank !== 'soldier' && b.rank !== 'soldier'));
}

/** Do these two have anything to do with each other? */
function near(s: GameState, a: Character, b: Character): boolean {
  if (a.faction === b.faction && a.faction !== 'law' && (a.rank !== 'civilian' || b.rank !== 'civilian')) return true;
  if (a.capoId === b.id || b.capoId === a.id) return true;
  if (a.spouseId === b.id || a.fatherId === b.id || b.fatherId === a.id || (!!a.fatherId && a.fatherId === b.fatherId)) return true;
  const lead = (c: Character) => s.rivals.some((r) => r.leaderId === c.id && r.kind === 'mob');
  if (lead(a) && lead(b)) return true;
  return !!tieOf(s, a.id, b.id);
}

/** What two people's natures (and ambitions) do to each other, strongest first. Pure. */
export function clashReasons(s: GameState, a: Character, b: Character): { y: string; v: number }[] {
  const out: { y: string; v: number }[] = [];
  for (const r of CLASH_RULES) {
    const hit = (hasTrait(a, r.a) && hasTrait(b, r.b)) || (hasTrait(a, r.b) && hasTrait(b, r.a));
    if (!hit) continue;
    if (r.peers && !peers(a, b)) continue;
    out.push({ y: r.y, v: r.v });
  }
  const ma = mindOf(s, a.id)?.amb;
  const mb = mindOf(s, b.id)?.amb;
  if (ma && mb && ma.k === mb.k && (ma.k === 'chair' || ma.k === 'capo') && a.faction === b.faction) out.push({ y: ma.k === 'chair' ? 'Both have an eye on the boss\'s chair' : 'Both want a crew of their own', v: -8 });
  if (ma?.k === 'avenge' && ma.t === b.id) out.push({ y: 'Swore to avenge his blood on him', v: -12 });
  if (mb?.k === 'avenge' && mb.t === a.id) out.push({ y: 'Swore to avenge his blood on him', v: -12 });
  if (out.length === 0 && a.faction === b.faction && (hasTrait(a, 'Charming') || hasTrait(b, 'Charming'))) out.push({ y: 'Good company', v: 3 });
  return out.sort((x, y) => Math.abs(y.v) - Math.abs(x.v) || x.y.localeCompare(y.y));
}

/** The tie their mutual opinion (and natures) add up to, if any. */
export function tieFor(s: GameState, a: Character, b: Character): TieKind | undefined {
  const ab = opinion(s, a.id, b.id);
  const ba = opinion(s, b.id, a.id);
  const lo = Math.min(ab, ba);
  const hi = Math.max(ab, ba);
  const hot = (c: Character) => hasTrait(c, 'Hot-headed') || hasTrait(c, 'Vengeful') || hasTrait(c, 'Cruel');
  if (lo <= -45 && hi <= -25 && (hot(a) || hot(b))) return 'feud';
  if (lo <= -25 && hi <= -5) return 'rival';
  if (lo >= 35) return 'friend';
  return undefined;
}

/** The pool of people whose clashes are weighed (bounded, deterministic). */
export function clashPool(s: GameState): Character[] {
  const ids = new Set<string>(Object.keys(s.minds?.minds ?? {}));
  for (const c of Object.values(s.characters)) if (c.alive && c.faction === 'player' && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere')) ids.add(c.id);
  for (const r of s.rivals) if (r.kind === 'mob' && s.characters[r.leaderId]?.alive) ids.add(r.leaderId);
  ids.delete(s.playerId);
  return [...ids].map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive).sort((x, y) => x.id.localeCompare(y.id)).slice(0, CLASH_POOL);
}

/** One weighing of the clashes (every CLASH_GAP weeks). Returns lines worth telling. */
export function clashWeek(ctx: Ctx): string[] {
  const s = ctx.s;
  const D = ensureDeeds(s);
  if (s.week - D.cw < CLASH_GAP) return [];
  D.cw = s.week;
  const pool = clashPool(s);
  const lines: string[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      if (!near(s, a, b)) continue;
      // Natures move opinion, a little a month, up to a cap per reason.
      for (const r of clashReasons(s, a, b).slice(0, 2)) {
        for (const [x, y] of [[a, b], [b, a]] as const) {
          const mod = getRelation(s, x.id, y.id)?.modifiers.find((m) => m.reason === r.y);
          if (mod && Math.abs(mod.value) >= CLASH_CAP) continue;
          addOpinion(s, x.id, y.id, r.y, Math.sign(r.v) * Math.max(2, Math.round(Math.abs(r.v) / 2)), 1);
        }
      }
      // A tie forms, or fades.
      const now = tieFor(s, a, b);
      const prev = tieOf(s, a.id, b.id);
      if (prev && (prev.k === 'ally' || prev.k === 'lovers')) continue;
      if (now && now !== prev?.k) {
        const why = clashReasons(s, a, b)[0]?.y ?? (now === 'friend' ? 'Years of good turns' : 'Too many slights');
        setTie(s, a.id, b.id, now, why);
        const line = tieLine(a, b, now, why);
        lines.push(line);
        surface(s, a, b, now, why, line);
      } else if (!now && prev) {
        const ab = opinion(s, a.id, b.id);
        const ba = opinion(s, b.id, a.id);
        const fade = prev.k === 'friend' ? Math.min(ab, ba) < 10 : prev.k === 'rival' ? Math.max(ab, ba) > 5 && Math.min(ab, ba) > -10 : Math.min(ab, ba) > -10;
        if (fade) setTie(s, a.id, b.id, undefined, '');
      }
    }
  }
  if (lines.length) ctx.log.push(...lines.slice(0, 3));
  return lines;
}

export function tieLine(a: Character, b: Character, k: TieKind, why: string): string {
  const an = displayName(a);
  const bn = displayName(b);
  switch (k) {
    case 'friend': return `${an} and ${bn} have become friends. ${why}.`;
    case 'rival': return `${an} and ${bn} cannot stand each other. ${why}.`;
    case 'feud': return `${an} and ${bn}: it is a feud now. ${why}.`;
    default: return `${an} and ${bn}: ${TIE_LABEL[k].toLowerCase()}.`;
  }
}

/** The ties the boss should hear about: two of his own at odds; one of his own friendly with a rival boss. */
function surface(s: GameState, a: Character, b: Character, k: TieKind, why: string, line: string): void {
  const D = ensureDeeds(s);
  const key = `${pairKey(a.id, b.id)}:${k}`;
  if (D.told[key] !== undefined && s.week - D.told[key] < 26) return;
  const top = (c: Character) => c.faction === 'player' && c.rank !== 'civilian' && c.rank !== 'associate';
  const rivalBoss = (c: Character) => s.rivals.some((r) => r.leaderId === c.id && r.kind === 'mob');
  const boss = s.characters[s.playerId];
  const kin = (c: Character) => c.dynasty || boss?.spouseId === c.id;
  let ask = false;
  if ((k === 'rival' || k === 'feud') && top(a) && top(b)) ask = true;
  if (k === 'friend' && ((top(a) && rivalBoss(b)) || (top(b) && rivalBoss(a)))) ask = true;
  if ((k === 'feud') && (kin(a) || kin(b))) ask = true;
  if (!ask) {
    if (top(a) || top(b) || kin(a) || kin(b)) s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'misc' });
    return;
  }
  D.told[key] = s.week;
  const [first, second] = top(a) ? [a, b] : [b, a];
  pushAsk(s, { d: 'clash', a: first.id, t: second.id, p: 0, y: `${k}:${why}` });
}

/* ------------------------------------------------------------------ */
/* The relationships web                                               */
/* ------------------------------------------------------------------ */

export interface WebNode { id: string; name: string; rank: string; faction: string; boss: boolean }
export interface WebEdge { a: string; b: string; kind: TieKind | 'likes' | 'hates'; why: string; v: number }

/**
 * The web of who stands where with whom among the people who matter: ties
 * (friends, allies, rivals, feuds, sweethearts) and the strong one-way
 * feelings (|opinion| ≥ 40). Around one man (`center`) or everyone. Pure.
 */
export function relationsWeb(s: GameState, center?: string, max = 18): { nodes: WebNode[]; edges: WebEdge[] } {
  const ids = new Set<string>([s.playerId, ...clashPool(s).map((c) => c.id)]);
  if (center) ids.add(center);
  const edges: WebEdge[] = [];
  for (const [k, t] of Object.entries(s.deeds?.ties ?? {})) {
    const [a, b] = k.split('|');
    if (!s.characters[a]?.alive || !s.characters[b]?.alive) continue;
    if (center && a !== center && b !== center) continue;
    ids.add(a);
    ids.add(b);
    edges.push({ a, b, kind: t.k, why: t.y, v: t.k === 'friend' || t.k === 'ally' || t.k === 'lovers' ? 1 : -1 });
  }
  const list = [...ids].filter((id) => s.characters[id]?.alive);
  for (const a of list) {
    for (const b of list) {
      if (a === b || (center && a !== center && b !== center)) continue;
      if (edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) continue;
      const op = opinion(s, a, b);
      if (Math.abs(op) < 40) continue;
      const mod = getRelation(s, a, b)?.modifiers.slice().sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0];
      edges.push({ a, b, kind: op > 0 ? 'likes' : 'hates', why: mod?.reason ?? '', v: op });
    }
  }
  const deg = new Map<string, number>();
  for (const e of edges) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); }
  const keep = list.filter((id) => id === s.playerId || id === center || deg.has(id))
    .sort((x, y) => (y === center ? 1 : 0) - (x === center ? 1 : 0) || (deg.get(y) ?? 0) - (deg.get(x) ?? 0) || x.localeCompare(y)).slice(0, max);
  const set = new Set(keep);
  const nodes = keep.map((id) => {
    const c = s.characters[id];
    return { id, name: displayName(c), rank: c.rank, faction: c.faction, boss: id === s.playerId };
  });
  return { nodes, edges: edges.filter((e) => set.has(e.a) && set.has(e.b)) };
}
