import { hasTrait, relatives, relationLabel } from '../characters';
import { tiesOf } from '../deeds/state';
import { axesOf, TRAIT_WEIGHTS } from '../deeds/weights';
import type { Axis } from '../deeds/types';
import type { Character, Choice, Effect, EventInstance, GameState, Rank, RivalId, Trait } from '../types';
import type { Decision, Reaction, RxRole, RxTone } from './types';

/**
 * WHO CARES, AND HOW MUCH. Pure: the same state and the same decision give
 * the same reactions (no dice), so the card can show them before the boss
 * chooses and the window shows the same numbers after.
 *
 * His nature is read through the one weight table (deeds/weights.ts): pride
 * makes a "no" land harder (Hot-headed, Vengeful), patience softer; power and
 * money make a man jealous when another is favored; loyalty makes blood and
 * friends take it personally.
 */

const RANK_W: Partial<Record<Rank, number>> = { underboss: 1.4, consigliere: 1.3, capo: 1.25, boss: 1.4, soldier: 0.9, associate: 0.7, civilian: 0.6 };
const ROLE_W: Record<RxRole, number> = { target: 1.2, wife: 1.3, family: 1.3, philly: 1.4, passed: 1.1, capo: 1, kin: 1, friend: 0.8, enemy: 0.7, peer: 0.9 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The trait that pulls hardest on an axis (sign: +1 the most, -1 the least). */
function topTrait(c: Character, axis: Axis, sign: 1 | -1): Trait | undefined {
  let best: [Trait, number] | undefined;
  for (const t of c.traits) {
    const v = (TRAIT_WEIGHTS[t]?.[axis] ?? 0) * sign;
    if (v > 0 && (!best || v > best[1])) best = [t, v];
  }
  return best?.[0];
}

/**
 * How a slight lands on him: his pride (Hot-headed +30, Vengeful +25,
 * Patient −15) scales it. `strong`: a proposal turned down to his face.
 */
export function prideShape(c: Character, v: number, strong: boolean): { v: number; trait?: Trait } {
  if (v >= 0) {
    const loyal = axesOf(c).loyalty;
    const m = 1 + Math.max(0, loyal) / 100;
    return { v: Math.round(v * m), ...(loyal > 0 && Math.round(v * m) !== v ? { trait: topTrait(c, 'loyalty', 1) } : {}) };
  }
  const p = axesOf(c).pride;
  const m = clamp(1 + p / (strong ? 50 : 100), 0.5, strong ? 2.2 : 1.6);
  const out = Math.round(v * m);
  const trait = out < v ? topTrait(c, 'pride', 1) : out > v ? topTrait(c, 'pride', -1) : undefined;
  return { v: out, ...(trait ? { trait } : {}) };
}

/** What addOpinion will do to it (Loyal-to-a-fault halves a slight from the boss). */
export function asLanded(s: GameState, who: string, v: number): number {
  const c = s.characters[who];
  if (v < 0 && c && hasTrait(c, 'Loyal-to-a-fault')) return Math.round(v / 2) || 0;
  return v;
}

export function toneOf(v: number): RxTone {
  return v <= -15 ? 'furious' : v < 0 ? 'displeased' : 'pleased';
}

export function leaderOf(s: GameState, id: RivalId): Character | undefined {
  const r = s.rivals.find((x) => x.id === id);
  const c = r ? s.characters[r.leaderId] : undefined;
  return c?.alive ? c : undefined;
}

function isLeader(s: GameState, id: string): boolean {
  return s.rivals.some((r) => r.leaderId === id);
}

function wifeOf(s: GameState): Character | undefined {
  const w = s.characters[s.characters[s.playerId]?.spouseId ?? ''];
  return w?.alive ? w : undefined;
}

function isMajor(s: GameState, r: Reaction): boolean {
  const c = s.characters[r.who];
  if (r.tone === 'furious') return true;
  if (r.v <= -10 && c && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere') && c.faction === 'player') return true;
  if ((r.role === 'family' || r.role === 'philly') && Math.abs(r.v) >= 8) return true;
  if (r.role === 'wife' && r.v <= -6) return true;
  return false;
}

/** How much a reaction matters (for the window's order). */
export function weightOf(s: GameState, r: Reaction): number {
  const c = s.characters[r.who];
  return Math.abs(r.v) * ROLE_W[r.role] * (RANK_W[c?.rank ?? 'civilian'] ?? 1) + (r.major ? 100 : 0) + (r.v < 0 ? 1 : 0);
}

/**
 * Everyone who cares about decision `d`, and how. Pure. The most important
 * first. Direct reactions (in the choice's own effects) come as they are.
 */
export function reactionsTo(s: GameState, d: Decision): Reaction[] {
  const B = s.playerId;
  const out = new Map<string, Reaction>();
  const add = (who: string | undefined, role: RxRole, v: number, why: string, trait?: string, extra: Partial<Reaction> = {}) => {
    if (!who || who === B || out.has(who)) return;
    const c = s.characters[who];
    if (!c?.alive) return;
    const landed = extra.direct ? v : asLanded(s, who, v);
    if (!landed && !extra.fear) return;
    out.set(who, { who, role, v: landed, why: why.slice(0, 60), tone: toneOf(landed), major: false, ...(trait ? { trait } : {}), ...extra });
  };
  const ch = (id?: string) => (id ? s.characters[id] : undefined);
  // 1. What the choice itself does to people (already in its effects).
  for (const [id, [v, why]] of Object.entries(d.direct ?? {}).sort((a, b) => a[0].localeCompare(b[0]))) {
    const c = ch(id);
    const fam = c ? s.rivals.find((r) => r.leaderId === id) : undefined;
    const role: RxRole = id === d.t ? 'target' : id === d.over ? 'passed' : fam ? (fam.kind === 'philly' ? 'philly' : 'family') : id === wifeOf(s)?.id ? 'wife' : 'target';
    add(id, role, v, why, undefined, { direct: 1 });
  }
  // 2. The man himself (his nature shapes it).
  const t = ch(d.t);
  let tv = d.t ? out.get(d.t)?.v : undefined;
  if (t && d.v !== undefined && !out.has(t.id)) {
    const sh = prideShape(t, d.v, !!d.pride);
    const role: RxRole = t.id === wifeOf(s)?.id ? 'wife' : isLeader(s, t.id) ? (s.rivals.find((r) => r.leaderId === t.id)?.kind === 'philly' ? 'philly' : 'family') : 'target';
    add(t.id, role, sh.v, d.y ?? (d.v < 0 ? 'Went against me' : 'Did right by me'), sh.trait);
    tv = out.get(t.id)?.v ?? sh.v;
  }
  // A dead man has no opinion, but his people do: what was done to him still counts.
  if (t && !t.alive && d.v !== undefined) tv = d.v;
  // 3. The man passed over / sided against.
  const o = ch(d.over);
  if (o && !out.has(o.id)) {
    const base = d.overV ?? -Math.max(6, Math.round(Math.abs(tv ?? d.v ?? 10) * 0.8));
    const sh = prideShape(o, base, !!d.pride);
    add(o.id, 'passed', sh.v, d.overY ?? `Favored ${t?.firstName ?? 'another'} over me`, sh.trait);
  }
  // 4. Families and Philadelphia, directly.
  for (const f of d.fam ?? []) {
    const L = leaderOf(s, f.id);
    if (!L) continue;
    const sh = f.v < 0 ? prideShape(L, f.v, !!d.pride) : { v: f.v, trait: undefined };
    add(L.id, f.id === 'philly' ? 'philly' : 'family', sh.v, f.y, sh.trait);
  }
  // 4b. Other people, directly.
  for (const [id, v, why] of d.more ?? []) {
    const c = ch(id);
    if (!c) continue;
    const sh = v < 0 ? prideShape(c, v, !!d.pride) : { v, trait: undefined };
    add(id, id === wifeOf(s)?.id ? 'wife' : c.faction === 'player' && (c.rank === 'capo' || c.rank === 'underboss') ? 'peer' : 'target', sh.v, why, sh.trait);
  }
  // 5. The wife, directly.
  const W = wifeOf(s);
  if (d.wife && W) {
    const sh = d.wife.v < 0 ? prideShape(W, d.wife.v, !!d.pride) : { v: d.wife.v, trait: undefined };
    add(W.id, 'wife', sh.v, d.wife.y, sh.trait);
  }
  // 6. The people around him.
  if (t && tv !== undefined && Math.abs(tv) >= 4) {
    const fn = t.firstName;
    const killed = d.k === 'punish' && !t.alive;
    // His blood.
    for (const k of relatives(s, t).sort((a, b) => a.id.localeCompare(b.id))) {
      if (k.id === B) continue;
      const rel = relationLabel(s, k, t);
      const loyal = 1 + Math.max(0, axesOf(k).loyalty) / 100;
      const v = Math.round(tv * 0.5 * loyal);
      const sh = prideShape(k, v, false);
      add(k.id, k.id === W?.id ? 'wife' : 'kin', sh.v, tv < 0 ? (killed ? `Killed my ${rel}` : d.k === 'punish' ? `Came down on my ${rel}` : `Slighted my ${rel}`) : `Did right by my ${rel}`, sh.trait);
    }
    // His capo.
    if (t.capoId && t.capoId !== t.id) {
      const k = ch(t.capoId);
      if (k) {
        const sh = prideShape(k, Math.round(tv * 0.4), false);
        add(k.id, 'capo', sh.v, tv < 0 ? `Went hard on my man ${fn}` : `Looked after my man ${fn}`, sh.trait);
      }
    }
    // His friends and his enemies.
    for (const { other, tie } of tiesOf(s, t.id).sort((a, b) => a.other.localeCompare(b.other))) {
      if (other === B) continue;
      const k = ch(other);
      if (!k) continue;
      if (tie.k === 'friend' || tie.k === 'ally' || tie.k === 'lovers') {
        const sh = prideShape(k, Math.round(tv * 0.5), false);
        add(k.id, 'friend', sh.v, tv < 0 ? `Wronged my friend ${fn}` : `Good to my friend ${fn}`, sh.trait);
      } else {
        add(k.id, 'enemy', Math.round(-tv * 0.4), tv < 0 ? `Put ${fn} in his place` : `Favored ${fn}, of all people`);
      }
    }
    // The other capos: jealousy when one is favored, precedent when one is punished.
    if (t.faction === 'player' && t.rank !== 'civilian') {
      const peers = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== t.id && c.id !== B && (c.rank === 'capo' || c.rank === 'underboss')).sort((a, b) => a.id.localeCompare(b.id));
      for (const k of peers) {
        if (tv >= 8 && (d.k === 'promote' || d.k === 'grant' || d.k === 'favor' || d.k === 'accept')) {
          const ax = axesOf(k);
          const want = ax.power + ax.money / 2;
          if (want <= 0) continue;
          const v = -Math.max(2, Math.round(tv * 0.25 * (1 + want / 50)));
          add(k.id, 'peer', v, `Favored ${fn} over me`, topTrait(k, 'power', 1) ?? topTrait(k, 'money', 1));
        } else if (tv <= -15 && (d.k === 'punish' || d.k === 'demote')) {
          if (hasTrait(k, 'Cruel')) add(k.id, 'peer', 2, 'Kept the men in line', 'Cruel');
          else if (hasTrait(k, 'Loyal-to-a-fault')) add(k.id, 'peer', 0, '', undefined, { fear: 3 });
          else add(k.id, 'peer', -2, 'Could be me next', undefined, { fear: 4 });
        }
      }
    }
    // His family, when he is one of theirs (not the boss of it).
    if (t.faction !== 'player' && !isLeader(s, t.id)) {
      const r = s.rivals.find((x) => x.id === t.faction);
      const L = r ? leaderOf(s, r.id) : undefined;
      if (L) add(L.id, r!.kind === 'philly' ? 'philly' : 'family', Math.round(tv * 0.5), tv < 0 ? `Insulted one of ours (${fn})` : `Treated ${fn} right`);
    }
  }
  // 7. War and peace: the island and Philadelphia watch.
  if (d.k === 'war' || d.k === 'peace') {
    const against = new Set((d.fam ?? []).map((f) => f.id));
    if (d.k === 'war') {
      for (const r of s.rivals) if (r.kind === 'mob' && !against.has(r.id)) add(leaderOf(s, r.id)?.id, 'family', -3, 'Started a war on the island');
      add(leaderOf(s, 'philly' as RivalId)?.id, 'philly', -6, 'Broke the peace');
    } else {
      add(leaderOf(s, 'philly' as RivalId)?.id, 'philly', 4, 'Kept the peace');
      for (const k of Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.rank === 'capo').sort((a, b) => a.id.localeCompare(b.id))) {
        if (hasTrait(k, 'Hot-headed')) add(k.id, 'peer', -4, 'Made peace when we should fight', 'Hot-headed');
      }
    }
  }
  const list = [...out.values()].filter((r) => r.v !== 0 || r.fear);
  for (const r of list) {
    r.major = r.v < 0 ? isMajor(s, r) : false;
    if (r.v < 0 && !r.direct) r.smooth = 1;
    if (r.v < 0 && r.direct && r.v <= -8) r.smooth = 1;
  }
  return list.sort((a, b) => weightOf(s, b) - weightOf(s, a) || a.who.localeCompare(b.who));
}

/* ------------------------------------------------------------------ */
/* Reading a decision off a choice's (or an order's) effects            */
/* ------------------------------------------------------------------ */

const RANK_N: Partial<Record<Rank, number>> = { boss: 6, underboss: 5, consigliere: 5, capo: 4, soldier: 3, associate: 2, civilian: 1 };

/** The `react` op in a list of effects, if the choice carries its own decision. */
export function reactOp(effects: readonly Effect[]): Decision | undefined {
  for (const e of effects) if (e.type === 'deed' && e.op.op === 'react') return e.op.d;
  return undefined;
}

/**
 * The decision a plain choice amounts to (no `react` op): read off its
 * effects. `subject`: the man the popup or the order is about. Undefined
 * when nobody in particular is touched.
 */
export function inferDecision(s: GameState, subject: string | undefined, effects: readonly Effect[], label: string, src?: string): Decision | undefined {
  if (reactOp(effects)) return undefined;
  const B = s.playerId;
  const direct: Record<string, [number, string]> = {};
  for (const e of effects) {
    if (e.type === 'opinion' && e.to === B && e.from !== B) {
      const prev = direct[e.from];
      direct[e.from] = [(prev?.[0] ?? 0) + asLanded(s, e.from, e.amount), prev?.[1] ?? e.reason];
    }
    if (e.type === 'rivalOpinion') {
      const L = leaderOf(s, e.rival);
      if (L) {
        const prev = direct[L.id];
        direct[L.id] = [(prev?.[0] ?? 0) + e.amount, prev?.[1] ?? e.reason];
      }
    }
  }
  for (const k of Object.keys(direct)) if (!direct[k][0]) delete direct[k];
  let t = subject && subject !== B && s.characters[subject] ? subject : undefined;
  let k: Decision['k'] | undefined;
  let v: number | undefined;
  let y: string | undefined;
  let over: string | undefined;
  const fam: Decision['fam'] = [];
  for (const e of effects) {
    if ((e.type === 'kill' || e.type === 'exile' || e.type === 'imprison') && e.charId !== B && s.characters[e.charId]) {
      t = e.charId;
      k = 'punish';
      v = e.type === 'kill' ? -40 : e.type === 'exile' ? -25 : -18;
      y = e.type === 'kill' ? 'Had me killed' : e.type === 'exile' ? 'Ran me out of town' : 'Let me go inside';
    } else if (e.type === 'rank' && e.charId !== B && s.characters[e.charId] && !k) {
      const c = s.characters[e.charId];
      const up = (RANK_N[e.rank] ?? 0) - (RANK_N[c.rank] ?? 0);
      if (up) { t = e.charId; k = up > 0 ? 'promote' : 'demote'; v = up > 0 ? 12 : -15; y = up > 0 ? 'Moved me up' : 'Took my stripes'; }
    } else if (e.type === 'warStart') {
      k = 'war';
      fam.push({ id: e.rival, v: 0, y: '' });
    } else if (e.type === 'warEnd') {
      k = 'peace';
    }
  }
  // Sided with one man against another.
  const npcs = Object.entries(direct).filter(([id]) => !s.rivals.some((r) => r.leaderId === id));
  const ups = npcs.filter(([, [x]]) => x >= 5);
  const downs = npcs.filter(([, [x]]) => x <= -5);
  if (!k && ups.length === 1 && downs.length === 1) {
    t = ups[0][0];
    over = downs[0][0];
    k = 'favor';
  }
  if (!k && t && direct[t]) k = direct[t][0] < 0 ? 'decline' : 'grant';
  if (!k && !t) {
    const top = npcs.sort((a, b) => Math.abs(b[1][0]) - Math.abs(a[1][0]) || a[0].localeCompare(b[0]))[0];
    if (top && Math.abs(top[1][0]) >= 5) { t = top[0]; k = top[1][0] < 0 ? 'decline' : 'grant'; }
  }
  if (!k) return undefined;
  const tv = t ? direct[t]?.[0] ?? v : v;
  if (k !== 'war' && k !== 'peace' && (tv === undefined || Math.abs(tv) < 5)) return undefined;
  return {
    k, label, ...(t ? { t } : {}), ...(v !== undefined && !(t && direct[t]) ? { v } : {}), ...(y ? { y } : {}), ...(over ? { over } : {}),
    ...(k === 'war' && fam.length ? { fam: fam.map((f) => ({ ...f, v: -10, y: 'Made war on us' })) } : {}),
    ...(Object.keys(direct).length ? { direct } : {}), ...(src ? { src } : {}),
  };
}

/** The decision behind one answer to a popup. */
export function decisionOfChoice(s: GameState, ev: EventInstance, ch: Choice): Decision | undefined {
  const own = reactOp(ch.effects);
  if (own) return own;
  const subject = ev.meta?.charId ? String(ev.meta.charId) : ev.actors?.[0];
  return inferDecision(s, subject, ch.effects, `You ${ch.because}`, ev.defId);
}

/** What one answer would stir up, before the boss chooses (the card's "Declining: Sal −15"). */
export function predictChoice(s: GameState, ev: EventInstance, ch: Choice): Reaction[] {
  const d = decisionOfChoice(s, ev, ch);
  return d ? reactionsTo(s, d) : [];
}

const sgn = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

/** A name the window and the card use: "Sal", "Philadelphia", "the Mannos", "your wife". */
export function rxName(s: GameState, r: Pick<Reaction, 'who' | 'role'>): string {
  const c = s.characters[r.who];
  if (r.role === 'philly') return 'Philadelphia';
  if (r.role === 'family') {
    const f = s.rivals.find((x) => x.leaderId === r.who);
    if (f) return f.shortName ?? f.name;
  }
  return c?.firstName ?? '?';
}

/** "Sal −15, furious (Hot-headed); Philadelphia +5". */
export function predictLine(s: GameState, list: readonly Reaction[], max = 3): string {
  return list.slice(0, max).map((r) => `${rxName(s, r)} ${sgn(r.v)}${r.tone === 'furious' ? ', furious' : ''}${r.trait && r.v < 0 ? ` (${r.trait})` : ''}${r.fear && !r.v ? ` fear +${r.fear}` : ''}`).join('; ');
}
