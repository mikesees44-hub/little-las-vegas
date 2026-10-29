import { ageOn, isInSeason } from '../calendar';
import { displayName, hasTrait, isFree, player } from '../characters';
import { applyEffects } from '../effects';
import type { Ctx } from '../ledger';
import { mindOf } from '../minds/state';
import { opinion } from '../relations';
import type { Character, Choice, Effect, EventInstance, GameState, HeatBar, Trait } from '../types';
import { deedPreview } from '../deeds/resolve';
import { d01, ensureDeeds, tieOf } from '../deeds/state';
import type { DeedId, TieKind } from '../deeds/types';
import { freshness } from '../storyDirector';
import type { Next, Role, SChoice, Scene, SEffect } from './format';
import { SCENES, SCENES_BY_ID } from './library';
import { compare } from './validate';

/**
 * AUTHORED SCENES AT RUN TIME. A scene whose `when` holds and whose roles can
 * be cast from the people of the world becomes an ordinary popup in the one
 * pipeline (template `scene_<id>`, so the story director's cooldowns, theme
 * mix and caps apply). Choices map onto whitelisted Effects; a choice with
 * odds rolls when the boss's answer lands (the deeds' own dice), and its
 * success or failure effects follow; `next` schedules the following part
 * with the same cast. At most one scene a week.
 */

export type Cast = Record<string, string>;

/** Weekly chance a random scene is offered at all (when one fits). */
export const SCENE_CHANCE = 0.4;
const PRIORITY_NEXT = 52;
const PRIORITY_RANDOM = 43;
/** A follow-up that cannot be cast for this long is dropped. */
const DUE_WAIT = 8;

/* ------------------------------------------------------------------ */
/* Conditions                                                          */
/* ------------------------------------------------------------------ */

export function whenOk(s: GameState, sc: Scene): boolean {
  const w = sc.when ?? {};
  const D = s.deeds;
  const last = D?.sc[sc.id];
  if (w.once && last !== undefined) return false;
  if (last !== undefined && s.week - last < (w.cooldown ?? 26)) return false;
  if (w.years && (s.date.y < w.years[0] || s.date.y > w.years[1])) return false;
  if (w.season && (w.season === 'summer') !== isInSeason(s.date)) return false;
  if (w.months && !w.months.includes(s.date.m)) return false;
  if (w.week?.min !== undefined && s.week < w.week.min) return false;
  if (w.week?.max !== undefined && s.week > w.week.max) return false;
  if (w.flags && !w.flags.every((f) => (s.flags[f] ?? 0) > 0)) return false;
  if (w.notFlags && w.notFlags.some((f) => (s.flags[f] ?? 0) > 0)) return false;
  if (w.money !== undefined && !compare(s.money, w.money)) return false;
  if (w.respect !== undefined && !compare(s.respect, w.respect)) return false;
  for (const [bar, c] of Object.entries(w.heat ?? {})) if (c !== undefined && !compare(s.heat[bar as HeatBar] ?? 0, c)) return false;
  const boss = player(s);
  if (w.boss?.traits?.some((t) => !hasTrait(boss, t as Trait))) return false;
  if (w.boss?.notTraits?.some((t) => hasTrait(boss, t as Trait))) return false;
  if (w.location && (s.districts.find((d) => d.id === w.location)?.influence.player ?? 0) < 20) return false;
  return true;
}

function pool(s: GameState, r: Role): Character[] {
  const boss = player(s);
  const all = Object.values(s.characters).filter((c) => c.alive && c.id !== s.playerId && isFree(s, c));
  switch (r.pool) {
    case 'crew': return all.filter((c) => c.faction === 'player' && c.rank !== 'civilian');
    case 'capo': return all.filter((c) => c.faction === 'player' && c.rank === 'capo');
    case 'family': return all.filter((c) => c.dynasty);
    case 'wife': return all.filter((c) => c.id === boss.spouseId);
    case 'kin': return all.filter((c) => c.dynasty || !!c.kinRoles?.length || c.fatherId === boss.id || boss.fatherId !== undefined && c.fatherId === boss.fatherId);
    case 'rival': return all.filter((c) => s.rivals.some((rv) => rv.id === c.faction && rv.kind === 'mob' && rv.leaderId !== c.id));
    case 'rivalBoss': return all.filter((c) => s.rivals.some((rv) => rv.leaderId === c.id && rv.kind === 'mob'));
    case 'official': return all.filter((c) => !!c.office);
    case 'anyone': return all.filter((c) => ageOn(c.birth, s.date) >= 16);
  }
  return [];
}

function fits(s: GameState, c: Character, r: Role, cast: Cast): boolean {
  if (r.rank !== undefined && !(Array.isArray(r.rank) ? r.rank : [r.rank]).includes(c.rank)) return false;
  if (r.traits?.some((t) => !hasTrait(c, t as Trait))) return false;
  if (r.notTraits?.some((t) => hasTrait(c, t as Trait))) return false;
  if (r.gender && c.gender !== r.gender) return false;
  const age = ageOn(c.birth, s.date);
  if (r.age && (age < r.age[0] || age > r.age[1])) return false;
  if (r.mood !== undefined) {
    const m = mindOf(s, c.id);
    if (!m || !(Array.isArray(r.mood) ? r.mood : [r.mood]).includes(m.mood)) return false;
  }
  if (r.opinionOfBoss !== undefined && !compare(opinion(s, c.id, s.playerId), r.opinionOfBoss)) return false;
  for (const [other, cmp] of Object.entries(r.opinionOf ?? {})) {
    const oid = other === 'boss' ? s.playerId : cast[other];
    if (oid === undefined) continue; // checked again from the other side once both are cast
    if (!compare(opinion(s, c.id, oid), cmp)) return false;
  }
  if (r.sameSideAs) {
    const oid = r.sameSideAs === 'boss' ? s.playerId : cast[r.sameSideAs];
    if (oid !== undefined && s.characters[oid]?.faction !== c.faction) return false;
  }
  for (const [other, kind] of Object.entries(r.tie ?? {})) {
    const oid = other === 'boss' ? s.playerId : cast[other];
    if (oid === undefined) continue;
    if (tieOf(s, c.id, oid)?.k !== kind) return false;
  }
  return true;
}

/** Cast every role (deterministic on the deeds' dice); `carried` keeps a chain's people. */
export function castScene(s: GameState, sc: Scene, carried: Cast = {}): Cast | undefined {
  const D = ensureDeeds(s);
  const cast: Cast = {};
  const used = new Set<string>([s.playerId]);
  const roles = Object.entries(sc.who ?? {});
  for (const [key, r] of roles) {
    const keep = carried[key] ? s.characters[carried[key]] : undefined;
    if (keep?.alive && !used.has(keep.id)) { cast[key] = keep.id; used.add(keep.id); continue; }
    const cands = pool(s, r).filter((c) => !used.has(c.id) && fits(s, c, r, cast)).sort((a, b) => a.id.localeCompare(b.id));
    if (!cands.length) return undefined;
    const c = cands[Math.floor(d01(D) * cands.length)];
    cast[key] = c.id;
    used.add(c.id);
  }
  // Conditions between roles cast after them, checked now that everyone is cast.
  for (const [key, r] of roles) if (!fits(s, s.characters[cast[key]], r, cast)) return undefined;
  return cast;
}

/* ------------------------------------------------------------------ */
/* Text and effects                                                    */
/* ------------------------------------------------------------------ */

function who(s: GameState, cast: Cast, role: string): Character | undefined {
  return role === 'boss' ? player(s) : s.characters[cast[role]];
}

export function fill(s: GameState, cast: Cast, text: string): string {
  const boss = player(s);
  const held = s.districts.filter((d) => (d.influence.player ?? 0) >= 20).sort((a, b) => (b.influence.player ?? 0) - (a.influence.player ?? 0))[0];
  return text.replace(/\{([^}]*)\}/g, (m, body: string) => {
    const [r, f] = body.split('.');
    if (!f) return r === 'district' ? held?.name ?? 'the island' : r === 'house' ? s.houseName : m;
    const c = r === 'boss' ? boss : s.characters[cast[r]];
    if (!c) return m;
    const F = c.gender === 'F';
    switch (f) {
      case 'name': return `${c.firstName} ${c.lastName}`;
      case 'first': return c.firstName;
      case 'last': return c.lastName;
      case 'nick': return c.nickname ?? c.firstName;
      case 'call': return displayName(c);
      case 'he': return F ? 'she' : 'he';
      case 'He': return F ? 'She' : 'He';
      case 'his': return F ? 'her' : 'his';
      case 'His': return F ? 'Her' : 'His';
      case 'him': return F ? 'her' : 'him';
    }
    return m;
  });
}

/** One authored effect as engine Effects (empty when its people are gone). */
export function mapEffect(s: GameState, sc: Scene, cast: Cast, fx: SEffect): Effect[] {
  const P = s.playerId;
  const id = (r: string) => (r === 'boss' ? P : cast[r]);
  const why = (x?: string) => (x ? fill(s, cast, x) : sc.title);
  const k = Object.keys(fx)[0];
  const v = (fx as Record<string, unknown>)[k] as never;
  switch (k) {
    case 'money': return [{ type: 'money', amount: v }];
    case 'respect': return [{ type: 'respect', amount: v }];
    case 'heat': return Object.entries(v as Record<string, number>).map(([bar, amount]) => ({ type: 'heat', bar: bar as HeatBar, amount }));
    case 'opinion': { const o = v as { of: string; toward: string; by: number; why?: string }; return id(o.of) && id(o.toward) ? [{ type: 'opinion', from: id(o.of), to: id(o.toward), amount: o.by, reason: why(o.why), decay: 1 }] : []; }
    case 'fear': case 'trust': case 'grievance': { const o = v as { of: string; toward: string; by: number }; return id(o.of) && id(o.toward) ? [{ type: 'meter', from: id(o.of), to: id(o.toward), meter: k, amount: o.by }] : []; }
    case 'crew': { const o = v as { by: number; why?: string }; return [{ type: 'crewOpinion', amount: o.by, reason: why(o.why) }]; }
    case 'family': { const o = v as { by: number; why?: string }; return [{ type: 'familyOpinion', amount: o.by, reason: why(o.why) }]; }
    case 'flag': return [{ type: 'flag', key: String(v), value: 1 }];
    case 'unflag': return [{ type: 'flag', key: String(v), value: -(s.flags[String(v)] ?? 0) }];
    case 'tie': { const o = v as { a: string; b: string; kind: string; why?: string }; return id(o.a) && id(o.b) ? [{ type: 'deed', op: { op: 'tie', a: id(o.a), b: id(o.b), ...(o.kind !== 'none' ? { k: o.kind as TieKind } : {}), y: why(o.why) } }] : []; }
    case 'memory': { const o = v as { who: string; about: string; text: string; weight: number }; return id(o.who) && id(o.about) ? [{ type: 'deed', op: { op: 'mem', who: id(o.who), about: id(o.about), t: fill(s, cast, o.text), v: o.weight } }] : []; }
    case 'wealth': { const o = v as { role: string; by: number }; return id(o.role) ? [o.role === 'boss' ? { type: 'money', amount: o.by } : { type: 'wealth', charId: id(o.role), amount: o.by }] : []; }
    case 'hook': { const o = v as { on: string; strong?: boolean; why?: string }; return id(o.on) && o.on !== 'boss' ? [{ type: 'hook', targetId: id(o.on), strong: !!o.strong, reason: why(o.why) }] : []; }
    case 'owes': { const o = v as { who: string; to: string }; return id(o.who) && id(o.to) ? [{ type: 'deed', op: { op: 'owe', by: id(o.who), to: id(o.to), y: sc.title } }] : []; }
    case 'deed': { const o = v as { id: string; actor: string; target: string }; return id(o.actor) && id(o.target) ? [{ type: 'deed', op: { op: 'npcDeed', id: o.id as DeedId, a: id(o.actor), t: id(o.target) } }] : []; }
    case 'evidence': { const o = v as { role: string; by: number }; return id(o.role) ? [{ type: 'evidence', charId: id(o.role), amount: o.by }] : []; }
    case 'jail': { const o = v as { role: string; weeks: number }; return id(o.role) && o.role !== 'boss' ? [{ type: 'imprison', charId: id(o.role), weeks: o.weeks }] : []; }
    case 'whack': { const o = v as { role: string; why?: string }; return id(o.role) && o.role !== 'boss' ? [{ type: 'kill', charId: id(o.role), cause: why(o.why ?? 'Disappeared. Nobody saw anything.') }, { type: 'heat', bar: 'local', amount: 4 }] : []; }
    case 'runs': { const o = v as { role: string }; return id(o.role) && o.role !== 'boss' ? [{ type: 'exile', charId: id(o.role) }] : []; }
  }
  return [];
}

function mapAll(s: GameState, sc: Scene, cast: Cast, list?: SEffect[]): Effect[] {
  return (list ?? []).flatMap((fx) => mapEffect(s, sc, cast, fx));
}

/** The chance a choice with odds works, and why (pure). */
export function choiceOdds(s: GameState, ch: SChoice, cast: Cast): { p: number; why: string[] } | undefined {
  const o = ch.odds;
  if (!o) return undefined;
  const why: string[] = [];
  let p = (o.base ?? 50) / 100;
  if (o.deed && o.actor && o.target) {
    const a = who(s, cast, o.actor);
    const t = who(s, cast, o.target);
    const dp = a && t ? deedPreview(s, o.deed as DeedId, a.id, t.id) : undefined;
    if (dp?.acceptance) {
      p = dp.chance;
      why.push(...dp.acceptance.reasons.slice(1).sort((x, y) => Math.abs(y.value) - Math.abs(x.value)).slice(0, 3).map((r) => `${r.value > 0 ? '+' : '−'}${Math.abs(r.value)} ${r.label}`));
    }
  }
  for (const x of o.plus ?? []) {
    const c = x.if;
    const r = c.role ? who(s, cast, c.role) : player(s);
    let hit = true;
    if (c.trait && !(r && hasTrait(r, c.trait as Trait))) hit = false;
    if (c.bossTrait && !hasTrait(player(s), c.bossTrait as Trait)) hit = false;
    if (c.flag && !((s.flags[c.flag] ?? 0) > 0)) hit = false;
    if (c.opinionOfBoss !== undefined && !(r && compare(opinion(s, r.id, s.playerId), c.opinionOfBoss))) hit = false;
    if (hit) { p += x.add / 100; why.push(`${x.add > 0 ? '+' : '−'}${Math.abs(x.add)} ${fill(s, cast, x.why)}`); }
  }
  return { p: Math.max(0.05, Math.min(0.95, Math.round(p * 100) / 100)), why };
}

function nexts(ch: SChoice): Next[] {
  return ch.next === undefined ? [] : Array.isArray(ch.next) ? ch.next : [ch.next];
}

function afterOf(n: Next): [number, number] {
  return n.after === undefined ? [1, 3] : typeof n.after === 'number' ? [n.after, n.after] : n.after;
}

function requireBlock(s: GameState, ch: SChoice): string | undefined {
  const r = ch.requires;
  if (!r) return undefined;
  const boss = player(s);
  if (r.trait && !hasTrait(boss, r.trait as Trait)) return `[${r.trait}] only`;
  if (r.notTrait && hasTrait(boss, r.notTrait as Trait)) return `Not for a ${r.notTrait.toLowerCase()} man`;
  if (r.money !== undefined && s.money < r.money) return `Needs $${r.money.toLocaleString('en-US')}`;
  if (r.respect !== undefined && s.respect < r.respect) return `Needs ${r.respect} respect`;
  if (r.favors !== undefined && s.favors < r.favors) return `Needs ${r.favors} favor${r.favors === 1 ? '' : 's'}`;
  if (r.flag && !((s.flags[r.flag] ?? 0) > 0)) return 'You have not laid the groundwork';
  return undefined;
}

/** A concrete popup for a scene with its cast. */
export function buildScene(s: GameState, sc: Scene, cast: Cast, due = false): EventInstance | undefined {
  const choices: Choice[] = sc.choices.map((ch, i) => {
    const odds = choiceOdds(s, ch, cast);
    const always = nexts(ch).filter((n) => (n.on ?? 'always') === 'always');
    const effects: Effect[] = [
      ...mapAll(s, sc, cast, ch.effects),
      ...(odds ? [{ type: 'deed', op: { op: 'sceneRoll', id: sc.id, c: i, cast, p: Math.round(odds.p * 100) } } as Effect] : []),
      ...always.map((n) => ({ type: 'deed', op: { op: 'sceneNext', id: n.scene, after: afterOf(n), cast, from: sc.id } }) as Effect),
      { type: 'deed', op: { op: 'sceneFired', id: sc.id } },
    ];
    const hint = ch.hint ? fill(s, cast, ch.hint) : '';
    const oddsLine = odds ? `${Math.round(odds.p * 100)}% it goes your way${odds.why.length ? ` (${odds.why.join(', ')})` : ''}.` : '';
    return {
      id: `c${i}`,
      label: fill(s, cast, ch.label),
      detail: [hint, oddsLine].filter(Boolean).join(' '),
      effects,
      because: `chose "${fill(s, cast, ch.label)}"`,
      disabledReason: requireBlock(s, ch),
    };
  });
  const open = choices.filter((c) => !c.disabledReason);
  if (!open.length) return undefined;
  const crewRole = Object.entries(sc.who ?? {}).find(([, r]) => r.pool === 'crew' || r.pool === 'capo');
  const theme = sc.theme ?? 'town';
  return {
    iid: `ev${s.nextId++}`,
    defId: `scene_${sc.id}`,
    title: fill(s, cast, sc.title),
    text: fill(s, cast, sc.text),
    week: s.week,
    choices,
    defaultChoiceId: open[open.length - 1].id,
    mandatory: false,
    priority: due ? PRIORITY_NEXT : PRIORITY_RANDOM,
    meta: {
      scene: sc.id, cast: JSON.stringify(cast), theme,
      ...(theme === 'family' || theme === 'romance' ? { family: 1 } : {}),
      ...(crewRole && theme === 'crew' ? { crew: 1, charId: cast[crewRole[0]] } : {}),
      ...(due ? { due: `scene:${sc.id}` } : {}),
    },
    actors: Object.values(cast).slice(0, 3),
  };
}

/* ------------------------------------------------------------------ */
/* Rolls and chains (the `deed` effect ops)                            */
/* ------------------------------------------------------------------ */

/** The odds of a scene's choice roll as the answer lands. */
export function sceneRoll(ctx: Ctx, id: string, c: number, cast: Cast, p: number): void {
  const s = ctx.s;
  const sc = SCENES_BY_ID[id];
  const ch = sc?.choices[c];
  if (!sc || !ch) return;
  const D = ensureDeeds(s);
  const ok = d01(D) < p / 100;
  const fx = mapAll(s, sc, cast, ok ? ch.success : ch.failure);
  const line = ok ? (ch.result ? fill(s, cast, ch.result) : `${fill(s, cast, sc.title)}: it went your way.`) : (ch.failText ? fill(s, cast, ch.failText) : `${fill(s, cast, sc.title)}: it did not go your way.`);
  if (fx.length) applyEffects(ctx, fx, { label: fill(s, cast, sc.title), because: `chose "${fill(s, cast, ch.label)}"`, category: 'event' });
  ctx.log.push(line);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'decision' });
  for (const n of nexts(ch)) if ((n.on === 'success' && ok) || (n.on === 'failure' && !ok)) sceneNext(s, n.scene, afterOf(n), cast, sc.id);
}

export function sceneNext(s: GameState, id: string, after: [number, number], cast: Cast, from: string): void {
  const D = ensureDeeds(s);
  if (!SCENES_BY_ID[id]) return;
  const at = s.week + after[0] + Math.floor(d01(D) * (after[1] - after[0] + 1));
  D.due.push({ id, at, cast, from });
  if (D.due.length > 12) D.due.splice(0, D.due.length - 12);
}

/* ------------------------------------------------------------------ */
/* The event source                                                    */
/* ------------------------------------------------------------------ */

/** One scene a week at most: a follow-up that came due first, else (sometimes) a fresh one. */
export function sceneEventSource(s: GameState): EventInstance | undefined {
  if (s.gameOver || !SCENES.length || (s.week < 3 && !s.deeds)) return undefined;
  const D = ensureDeeds(s);
  const pending = new Set(s.pendingEvents.map((e) => String(e.meta?.scene ?? '')));
  // 1. Follow-ups (they ignore cooldowns: the story is already moving).
  for (const d of [...D.due].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))) {
    if (d.at > s.week || pending.has(d.id)) continue;
    const sc = SCENES_BY_ID[d.id];
    if (!sc) { D.due = D.due.filter((x) => x !== d); continue; }
    const cast = castScene(s, sc, d.cast);
    const ev = cast ? buildScene(s, sc, cast, true) : undefined;
    if (ev) { D.due = D.due.filter((x) => x !== d); return ev; }
    if (s.week - d.at > DUE_WAIT) D.due = D.due.filter((x) => x !== d);
  }
  // 2. A fresh scene, now and then.
  if (s.week < 3 || d01(D) > SCENE_CHANCE) return undefined;
  const pool = SCENES.filter((sc) => !sc.followup && !pending.has(sc.id) && whenOk(s, sc) && freshness(s, `scene_${sc.id}`) > 0);
  const weights = pool.map((sc) => (sc.when?.weight ?? 10) * Math.min(2, freshness(s, `scene_${sc.id}`)));
  for (let tries = 0; tries < 3 && pool.length; tries++) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let r = d01(D) * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= weights[i]; if (r < 0) break; }
    const sc = pool[i];
    if (sc.when?.chance === undefined || d01(D) < sc.when.chance) {
      const cast = castScene(s, sc);
      const ev = cast ? buildScene(s, sc, cast) : undefined;
      if (ev) return ev;
    }
    pool.splice(i, 1);
    weights.splice(i, 1);
  }
  return undefined;
}

/** For tests and the editor: build one scene now if it fits (conditions and cast). */
export function tryScene(s: GameState, id: string): EventInstance | undefined {
  const sc = SCENES_BY_ID[id];
  if (!sc || !whenOk(s, sc)) return undefined;
  const cast = castScene(s, sc);
  return cast ? buildScene(s, sc, cast) : undefined;
}
