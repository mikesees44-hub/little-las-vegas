import { displayName, hasTrait } from '../characters';
import { opinion } from '../relations';
import type { Character, GameState } from '../types';
import { remember } from './memory';
import { clamp, r01, rivalLedBy, roll } from './state';
import {
  BEL_CAP, FACT_CAP, FACT_TEXT, RUMOR_CAP, type Belief, type Fact, type FactKind, type Mind, type MindsState, type Rumor,
} from './types';

/**
 * Beliefs: theory of mind. What each man BELIEVES about the others (their
 * loyalty, strength and money; who did what), with how sure he is. Beliefs
 * come from looking (noisy: a sharp man sees better, a paranoid man sees
 * rats), from gossip (it passes along friendships and crews, losing
 * certainty at every mouth and sometimes changing on the way: the name,
 * or the deed), and from lies (a schemer puts a story in a friendly ear).
 */

/** The truth about someone, as the world has it (never shown as such). */
export function truthOf(s: GameState, id: string, look: { bossStrength: number }): { t: number; s: number; w: number } {
  const c = s.characters[id];
  const r = rivalLedBy(s, id);
  if (id === s.playerId) return { t: 50, s: clamp(look.bossStrength, 0, 100), w: clamp(s.money / 2000, 0, 100) };
  if (r) return { t: 30, s: clamp(r.muscle, 0, 100), w: clamp(r.money / 600, 0, 100) };
  if (!c) return { t: 0, s: 0, w: 0 };
  const loyal = c.informantFor ? -80 : c.courtedBy ? Math.min(0, opinion(s, c.id, s.playerId)) - 20 : opinion(s, c.id, s.playerId);
  const muscle = c.attributes.force * 0.6 + (c.rank === 'capo' ? 30 : c.rank === 'soldier' ? 15 : 5);
  return { t: clamp(loyal, -100, 100), s: clamp(muscle, 0, 100), w: clamp(c.wealth / 150, 0, 100) };
}

/** How well he reads people (0.2-0.9): wits, and a man inside the other camp. */
export function acuity(s: GameState, c: Character, about: string): number {
  let a = 0.25 + c.attributes.intrigue / 160;
  if (s.characters[about]?.faction === c.faction) a += 0.15;
  const r = rivalLedBy(s, c.id);
  // A rival with a plant in your crew reads you well.
  if (r && about === s.playerId && Object.values(s.characters).some((x) => x.alive && x.faction === 'player' && x.informantFor === r.id)) a += 0.3;
  return clamp(a, 0.2, 0.9);
}

function nudge(v: number | undefined, obs: number, w: number): number {
  return Math.round(v === undefined ? obs : v + (obs - v) * w);
}

/** He takes a look at someone: beliefs move toward a noisy reading of the truth. */
export function observe(s: GameState, M: MindsState, m: Mind, c: Character, about: string, look: { bossStrength: number }): void {
  const truth = truthOf(s, about, look);
  const a = acuity(s, c, about);
  const noise = (1 - a) * 50;
  const b: Belief = m.bel[about] ?? { u: s.week };
  const paranoid = hasTrait(c, 'Paranoid') ? -15 : 0;
  // What he sees of loyalty is colored by how he feels about the man.
  const feel = opinion(s, c.id, about) / 5;
  const obsT = clamp(truth.t + (r01(M) - 0.5) * noise * 2 + paranoid + feel, -100, 100);
  const obsS = clamp(truth.s + (r01(M) - 0.5) * noise * 2, 0, 100);
  const obsW = clamp(truth.w + (r01(M) - 0.5) * noise * 2, 0, 100);
  b.t = nudge(b.t, obsT, 0.5);
  b.s = nudge(b.s, obsS, 0.5);
  b.w = nudge(b.w, obsW, 0.5);
  b.tc = Math.round(clamp(((b.tc ?? 0) + a) / 2 + 0.05, 0, 0.95) * 100) / 100;
  b.sc = Math.round(clamp(((b.sc ?? 0) + a) / 2 + 0.05, 0, 0.95) * 100) / 100;
  b.wc = Math.round(clamp(((b.wc ?? 0) + a * 0.8) / 2, 0, 0.9) * 100) / 100;
  b.u = s.week;
  m.bel[about] = b;
  capBeliefs(s, m);
}

function capBeliefs(s: GameState, m: Mind): void {
  const keys = Object.keys(m.bel);
  if (keys.length <= BEL_CAP) return;
  // Keep the boss, then the freshest.
  keys.sort((a, b) => (a === s.playerId ? -1 : b === s.playerId ? 1 : m.bel[b].u - m.bel[a].u || a.localeCompare(b)));
  for (const k of keys.slice(BEL_CAP)) delete m.bel[k];
}

/** He comes to believe a fact (or believes it more). Returns the fact as he holds it. */
export function believe(s: GameState, m: Mind, f: Omit<Fact, 'w'> & { w?: number }): Fact {
  const ex = m.facts.find((x) => x.k === f.k && x.by === f.by && x.on === f.on);
  if (ex) {
    ex.c = Math.round(clamp(ex.c + f.c * (1 - ex.c), 0, 0.98) * 100) / 100;
    ex.w = f.w ?? s.week;
    return ex;
  }
  const fact: Fact = { k: f.k, by: f.by, ...(f.on ? { on: f.on } : {}), c: Math.round(clamp(f.c, 0.05, 0.98) * 100) / 100, src: f.src, ...(f.from ? { from: f.from } : {}), w: f.w ?? s.week, tr: f.tr, ...(f.r ? { r: f.r } : {}) };
  m.facts.push(fact);
  if (m.facts.length > FACT_CAP) {
    let worst = 0;
    for (let i = 1; i < m.facts.length; i++) if (m.facts[i].c < m.facts[worst].c || (m.facts[i].c === m.facts[worst].c && m.facts[i].w < m.facts[worst].w)) worst = i;
    m.facts.splice(worst, 1);
  }
  // A damning fact lowers what he believes of the man's loyalty.
  if (f.k === 'rat' || f.k === 'skim' || f.k === 'plot' || f.k === 'courted') {
    const b = m.bel[f.by] ?? { u: s.week };
    b.t = Math.round(clamp((b.t ?? 0) - 40 * fact.c, -100, 100));
    b.tc = Math.round(clamp(Math.max(b.tc ?? 0, fact.c * 0.8), 0, 0.95) * 100) / 100;
    b.u = s.week;
    m.bel[f.by] = b;
    capBeliefs(s, m);
  }
  if (f.k === 'weak') {
    const b = m.bel[f.by] ?? { u: s.week };
    b.s = Math.round(clamp((b.s ?? 50) - 25 * fact.c, 0, 100));
    b.sc = Math.max(b.sc ?? 0, Math.round(fact.c * 70) / 100);
    b.u = s.week;
    m.bel[f.by] = b;
  }
  return fact;
}

/** Does he hold that someone did this to him or his own (conf >= c)? */
export function blames(m: Mind, k: FactKind, minC = 0.5): Fact[] {
  return m.facts.filter((f) => f.k === k && f.c >= minC);
}

/** Start a rumor (true, or a lie). The teller believes it (or knows it is a lie). */
export function startRumor(s: GameState, M: MindsState, teller: Mind, f: { k: FactKind; by: string; on?: string; tr: boolean }, lie = false): Rumor {
  const ex = M.rumors.find((r) => r.k === f.k && r.by === f.by && r.on === f.on && r.tr === f.tr);
  if (ex) {
    if (!ex.h.includes(teller.id)) ex.h.push(teller.id);
    return ex;
  }
  const r: Rumor = { id: `ru${M.n++}`, k: f.k, by: f.by, ...(f.on ? { on: f.on } : {}), tr: f.tr, o: teller.id, w: s.week, h: [teller.id] };
  M.rumors.push(r);
  M.stats.rumors++;
  if (lie) M.stats.lies++;
  if (!lie) believe(s, teller, { k: f.k, by: f.by, on: f.on, c: 0.7, src: 'saw', tr: f.tr, r: r.id });
  else teller.facts.push({ k: f.k, by: f.by, ...(f.on ? { on: f.on } : {}), c: 0, src: 'lie', w: s.week, tr: false, r: r.id });
  if (teller.facts.length > FACT_CAP) teller.facts.splice(0, teller.facts.length - FACT_CAP);
  if (M.rumors.length > RUMOR_CAP) M.rumors.splice(0, M.rumors.length - RUMOR_CAP);
  return r;
}

/** Who a man talks to among the people with minds: his crew, his friends, his family. */
export function earsOf(s: GameState, id: string, pool: readonly string[]): string[] {
  const c = s.characters[id];
  if (!c) return [];
  const out: string[] = [];
  for (const o of pool) {
    if (o === id) continue;
    const oc = s.characters[o];
    if (!oc?.alive) continue;
    const sameSide = oc.faction === c.faction && c.faction !== 'none';
    const close = opinion(s, id, o) >= 10 || c.spouseId === o || oc.spouseId === id;
    if (sameSide || close) out.push(o);
  }
  return out;
}

/** What the rumor becomes in a new mouth: the name or the deed can change. */
function distort(s: GameState, M: MindsState, r: Rumor, hearer: Mind, hops: number): { k: FactKind; by: string; tr: boolean } {
  const p = Math.min(0.45, 0.12 + 0.08 * hops);
  if (!roll(M, p)) return { k: r.k, by: r.by, tr: r.tr };
  // People hear what they want to hear: the blame slides onto the man he already holds something against.
  const grudges = hearer.mem.filter((x) => x.v < 0 && x.who && x.who !== r.by && s.characters[x.who]?.alive && x.who !== s.playerId);
  if (grudges.length && roll(M, 0.6)) return { k: r.k, by: grudges[Math.floor(r01(M) * grudges.length)].who!, tr: false };
  const ESC: Partial<Record<FactKind, FactKind>> = { skim: 'rat', courted: 'plot', weak: 'weak', plot: 'rat' };
  const k = ESC[r.k] ?? r.k;
  return { k, by: r.by, tr: k === r.k ? r.tr : false };
}

/**
 * One week of talk: every rumor travels a little along who-talks-to-whom,
 * losing certainty and sometimes changing. Old rumors die out.
 */
export function gossipWeek(s: GameState, M: MindsState, pool: readonly string[]): number {
  let passed = 0;
  const ears = new Map<string, string[]>();
  const earsFor = (id: string) => { let e = ears.get(id); if (!e) { e = earsOf(s, id, pool); ears.set(id, e); } return e; };
  for (const r of M.rumors) {
    const hops = r.h.length;
    for (const teller of r.h.slice(-4)) {
      const tm = M.minds[teller];
      const tc = s.characters[teller];
      if (!tm || !tc?.alive) continue;
      const loose = hasTrait(tc, 'Charming') || hasTrait(tc, 'Drinker') ? 0.45 : hasTrait(tc, 'Honest') || hasTrait(tc, 'Patient') ? 0.2 : 0.32;
      if (!roll(M, loose)) continue;
      const cands = earsFor(teller).filter((x) => !r.h.includes(x) && x !== r.by);
      if (!cands.length) continue;
      const to = cands[Math.floor(r01(M) * cands.length)];
      const hm = M.minds[to];
      const hc = s.characters[to];
      if (!hm || !hc) continue;
      r.h.push(to);
      if (r.h.length > 12) r.h.splice(1, r.h.length - 12);
      passed++;
      const heard = distort(s, M, r, hm, hops);
      // How much he takes it in: how much he trusts the teller; a paranoid man swallows bad news whole.
      const trustT = clamp(0.5 + opinion(s, to, teller) / 200, 0.15, 0.9);
      const para = hasTrait(hc, 'Paranoid') ? 1.3 : 1;
      const c = clamp(0.75 * Math.pow(0.82, hops) * trustT * para, 0.05, 0.9);
      if (heard.by === to) continue; // A man does not believe it of himself.
      const f = believe(s, hm, { k: heard.k, by: heard.by, on: r.on, c, src: 'rumor', from: teller, tr: heard.tr, r: r.id });
      // Something done to his own: he remembers it, against the man he thinks did it.
      if ((f.k === 'hit' || f.k === 'killed') && f.c >= 0.4 && r.on && (s.characters[r.on]?.faction === hc.faction || hc.spouseId === r.on || hc.childrenIds.includes(r.on))) {
        remember(hm, { w: s.week, k: 'slight', who: heard.by, t: `heard ${nameOf(s, heard.by)} ${FACT_TEXT[f.k]}${r.on ? ` ${nameOf(s, r.on)}` : ''}`, v: -12 * f.c });
      }
    }
  }
  M.rumors = M.rumors.filter((r) => s.week - r.w <= 12 && s.characters[r.by]?.alive !== false);
  return passed;
}

export function nameOf(s: GameState, id: string | undefined): string {
  if (!id) return 'someone';
  if (id === s.playerId) return 'the boss';
  const c = s.characters[id];
  return c ? displayName(c) : 'someone';
}

/** "He's sure", "he thinks", "he's heard". */
export function sureWord(c: number): string {
  return c >= 0.75 ? 'is sure' : c >= 0.5 ? 'believes' : c >= 0.3 ? 'suspects' : 'has heard';
}

export function factText(s: GameState, f: Pick<Fact, 'k' | 'by' | 'on'>): string {
  return `${nameOf(s, f.by)} ${FACT_TEXT[f.k]}${f.on && (f.k === 'hit' || f.k === 'killed') ? ` ${nameOf(s, f.on)}` : ''}`;
}
