import { displayName } from './characters';
import { applyEffects } from './effects';
import type { Ctx } from './ledger';
import { getPerson } from './polPeople';
import { OFFICE_BY_ID } from './polData';
import { fullName } from './polState';
import { hashSeed, rand, randInt, weightedPick } from './rng';
import { themeFactor, themeShares, type Theme } from './storyDirector';
import type { Character, Choice, Effect, EventInstance, GameState, PlayerChoices } from './types';

/**
 * Living stories: slow-burn storylines that run for months or years.
 * Translated from the "Living Stories" prototype (imports/chatgpt/living-
 * stories) into the engine's conventions: its own seeded stream, engine
 * Effects (so everything posts to the one ledger and shows as chips), the
 * chronicle, and the ONE popup pipeline (registered as an event source, so
 * the story director's budget and theme mix apply).
 *
 *  - An arc is a template (livingStoryData.ts) bound to EXISTING people:
 *    the boss, his house, his crew, the officials of the politics layer.
 *    Nobody is created for an arc; an arc whose cast cannot be found does
 *    not start.
 *  - Stages advance with the world clock. An autonomous stage resolves on
 *    its own when its wait is over, reading the cast's own state (opinions,
 *    traits, grievances) so the NPCs act for themselves. A choice stage
 *    becomes a popup; the boss's answer moves the arc on.
 *  - Everything lives in `GameState.arcs` (plain data), so saves resume
 *    mid-arc exactly. Each stage fires once: an arc only moves forward.
 *  - The history shown in the Storylines tracker is what the boss saw or was
 *    told, never the hidden truth (a suspected rat's real status stays hidden).
 */

export interface ArcEntry {
  week: number;
  text: string;
}

export interface ArcInstance {
  id: string;
  tpl: string;
  /** role -> character id (or `pol:<person id>` for a politics-layer person). */
  roles: Record<string, string>;
  stage: string;
  /** Week the current stage becomes due. */
  due: number;
  started: number;
  status: 'active' | 'done';
  /** Stage id -> choice id the boss picked. */
  picks: Record<string, string>;
  history: ArcEntry[];
  ending?: string;
  ended?: number;
  /** Small per-arc memory (numbers only). */
  mem: Record<string, number>;
}

export interface ArcsState {
  rng: number;
  next: number;
  active: ArcInstance[];
  done: ArcInstance[];
  lastStart: number;
  lastBeat: number;
  /** Template id -> week it last started. */
  started: Record<string, number>;
  /** Arcs one story asked for (the prototype's story_seed), started when their turn comes. */
  seeds: { tpl: string; roles: Record<string, string>; week: number }[];
}

/** What a stage function sees. */
export interface ArcView {
  s: GameState;
  arc: ArcInstance;
  /** Cast as characters (politics people resolve to their materialized character, if any). */
  c: Record<string, Character | undefined>;
  /** Display name of a role. */
  n: (role: string) => string;
  /** First name of a role. */
  f: (role: string) => string;
}

export interface ArcChoiceDef {
  id: string;
  label: string;
  detail?: string;
  because: string;
  effects?: (v: ArcView) => Effect[];
  disabled?: (v: ArcView) => string | undefined;
  /** What the tracker records. */
  note: (v: ArcView) => string;
  next?: string;
  /** Ends the arc with this epilogue. */
  finish?: (v: ArcView) => string;
  /** Start another arc later (the prototype's story_seed). */
  seed?: (v: ArcView) => { tpl: string; roles: Record<string, string> } | undefined;
}

export interface ArcAuto {
  note: string;
  effects?: Effect[];
  next?: string;
  finish?: string;
  seed?: { tpl: string; roles: Record<string, string> };
}

export interface ArcStageDef {
  id: string;
  title: string;
  /** Weeks [min, max] from entering this stage until it is due. */
  wait: [number, number];
  /** Popup text (choice stages). */
  text?: (v: ArcView) => string;
  choices?: ArcChoiceDef[];
  /** Autonomous resolution: the world moves on its own. */
  auto?: (v: ArcView, roll: () => number) => ArcAuto;
}

export interface ArcTemplate {
  id: string;
  name: string;
  theme: Theme;
  synopsis: string;
  /** Labels for the tracker (role -> "the underboss"). */
  roleLabels: Record<string, string>;
  minWeek: number;
  weight: number;
  /** Weeks before the same template may start again. */
  cooldown?: number;
  /** Find the cast among existing people; undefined = not now. */
  bind: (s: GameState, pick: <T>(xs: T[]) => T | undefined) => Record<string, string> | undefined;
  stages: ArcStageDef[];
}

/** Most arcs running at once. */
export const MAX_ACTIVE = 3;
/** Weeks between two arcs starting. */
export const START_GAP = 6;
/** Chance per week (after the gap) that a new arc begins. */
export const START_CHANCE = 0.3;
/** Weeks between two arc popups. */
export const BEAT_GAP = 2;
const DEFAULT_COOLDOWN = 156;
const HISTORY_KEEP = 12;

let TEMPLATES: ArcTemplate[] = [];
let BY_ID: Record<string, ArcTemplate> = {};

/** The data file registers its templates (keeps the engine free of a data import cycle). */
export function registerArcTemplates(ts: ArcTemplate[]): void {
  TEMPLATES = [...TEMPLATES.filter((t) => !ts.some((x) => x.id === t.id)), ...ts];
  BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
}

export function arcTemplates(): ArcTemplate[] {
  return TEMPLATES;
}

export function ensureArcs(s: GameState): ArcsState {
  if (!s.arcs) s.arcs = { rng: hashSeed(`${s.seed}:arcs`), next: 1, active: [], done: [], lastStart: 0, lastBeat: -99, started: {}, seeds: [] };
  return s.arcs;
}

/* ------------------------------------------------------------------ */
/* Cast helpers                                                        */
/* ------------------------------------------------------------------ */

export function roleChar(s: GameState, id: string | undefined): Character | undefined {
  if (!id) return undefined;
  if (id.startsWith('pol:')) {
    const p = getPerson(s, id.slice(4)) as (ReturnType<typeof getPerson> & { charId?: string }) | undefined;
    return p?.charId ? s.characters[p.charId] : undefined;
  }
  return s.characters[id];
}

/** Non-person roles: `biz:<business id>`, `rom:<romance id>`, `office:<office id>@<when>`. */
function thingName(s: GameState, id: string): string | undefined {
  if (id.startsWith('biz:')) return s.businesses.find((b) => b.id === id.slice(4))?.name ?? 'the place';
  if (id.startsWith('rom:')) return 'a private matter';
  if (id.startsWith('office:')) return OFFICE_BY_ID[id.slice(7).split('@')[0]]?.title ?? 'the office';
  return undefined;
}

function thingAlive(s: GameState, id: string): boolean | undefined {
  if (id.startsWith('biz:')) return s.businesses.some((b) => b.id === id.slice(4) && b.owner === 'player');
  if (id.startsWith('rom:')) return !!s.romance?.rels.some((r) => r.id === id.slice(4) && r.ended === undefined);
  if (id.startsWith('office:')) return true;
  return undefined;
}

export function roleName(s: GameState, id: string | undefined): string {
  if (!id) return 'someone';
  const thing = thingName(s, id);
  if (thing) return thing;
  if (id.startsWith('pol:')) {
    const p = getPerson(s, id.slice(4));
    return p ? fullName(p) : 'a politician';
  }
  const c = s.characters[id];
  return c ? displayName(c) : 'someone';
}

function roleAlive(s: GameState, id: string): boolean {
  const thing = thingAlive(s, id);
  if (thing !== undefined) return thing;
  if (id.startsWith('pol:')) {
    const p = getPerson(s, id.slice(4)) as { alive?: boolean } | undefined;
    return !!p && p.alive !== false;
  }
  return !!s.characters[id]?.alive;
}

export function view(s: GameState, arc: ArcInstance): ArcView {
  const c: Record<string, Character | undefined> = {};
  for (const [k, id] of Object.entries(arc.roles)) c[k] = roleChar(s, id);
  return {
    s, arc, c,
    n: (r) => roleName(s, arc.roles[r]),
    f: (r) => {
      const ch = c[r];
      if (ch) return ch.firstName;
      return roleName(s, arc.roles[r]).split(' ')[0];
    },
  };
}

/* ------------------------------------------------------------------ */
/* The weekly tick                                                     */
/* ------------------------------------------------------------------ */

function stageOf(arc: ArcInstance): ArcStageDef | undefined {
  return BY_ID[arc.tpl]?.stages.find((x) => x.id === arc.stage);
}

function note(s: GameState, arc: ArcInstance, text: string, chronicle = true): void {
  arc.history.push({ week: s.week, text });
  if (arc.history.length > HISTORY_KEEP) arc.history.splice(1, arc.history.length - HISTORY_KEEP);
  if (chronicle) s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${BY_ID[arc.tpl]?.name ?? 'A story'}: ${text}`, kind: 'misc' });
}

function enter(st: ArcsState, s: GameState, arc: ArcInstance, stageId: string): void {
  const t = BY_ID[arc.tpl];
  const stage = t?.stages.find((x) => x.id === stageId);
  if (!stage) throw new Error(`Arc ${arc.tpl}: unknown stage ${stageId}`);
  arc.stage = stageId;
  arc.due = s.week + randInt(st, stage.wait[0], stage.wait[1]);
}

function finish(st: ArcsState, s: GameState, arc: ArcInstance, ending: string): void {
  arc.status = 'done';
  arc.ending = ending;
  arc.ended = s.week;
  note(s, arc, ending);
  st.active = st.active.filter((a) => a !== arc);
  st.done.push(arc);
  if (st.done.length > 30) st.done.shift();
}

function queueSeed(st: ArcsState, s: GameState, seed: { tpl: string; roles: Record<string, string> } | undefined): void {
  if (seed && BY_ID[seed.tpl] && Object.values(seed.roles).every((id) => roleAlive(s, id))) st.seeds.push({ ...seed, week: s.week });
}

export function startArc(s: GameState, tplId: string, roles: Record<string, string>): ArcInstance {
  const st = ensureArcs(s);
  const t = BY_ID[tplId];
  if (!t) throw new Error(`Unknown arc template ${tplId}`);
  const arc: ArcInstance = { id: `arc${st.next++}`, tpl: tplId, roles: { ...roles }, stage: t.stages[0].id, due: s.week, started: s.week, status: 'active', picks: {}, history: [], mem: {} };
  enter(st, s, arc, t.stages[0].id);
  st.active.push(arc);
  st.started[tplId] = s.week;
  st.lastStart = s.week;
  note(s, arc, `It begins: ${t.synopsis}`, false);
  return arc;
}

function eligibleTemplates(s: GameState, st: ArcsState): ArcTemplate[] {
  return TEMPLATES.filter((t) => s.week >= t.minWeek && !st.active.some((a) => a.tpl === t.id) && (st.started[t.id] === undefined || s.week - st.started[t.id] >= (t.cooldown ?? DEFAULT_COOLDOWN)));
}

/** Engine hook, once a week after the choices and consequences: arcs start, wait, and move on their own. */
export function arcsWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver || !TEMPLATES.length) return;
  const st = ensureArcs(s);
  // 1. Arcs whose people are gone end quietly (the world moved on).
  for (const arc of [...st.active]) {
    const gone = Object.entries(arc.roles).find(([, id]) => id !== s.playerId && !roleAlive(s, id));
    if (gone) {
      const who = s.characters[gone[1]];
      finish(st, s, arc, who || gone[1].startsWith('pol:') ? `${roleName(s, gone[1])} is gone, and the story ends with ${who?.gender === 'F' ? 'her' : 'him'}.` : 'What it was about is gone, and so is the story.');
    }
    else if (arc.roles.boss && arc.roles.boss !== s.playerId) finish(st, s, arc, 'A new boss sits at the head of the table; the old quarrel is buried with the old reign.');
  }
  // 2. Autonomous stages that came due.
  for (const arc of [...st.active]) {
    const stage = stageOf(arc);
    if (!stage?.auto || s.week < arc.due) continue;
    const v = view(s, arc);
    const out = stage.auto(v, () => rand(st));
    if (out.note) note(s, arc, out.note);
    if (out.effects?.length) applyEffects(ctx, out.effects, { label: `${BY_ID[arc.tpl].name}: ${stage.title}`, because: `let "${BY_ID[arc.tpl].name}" run its course`, category: 'event' });
    queueSeed(st, s, out.seed);
    if (out.finish) finish(st, s, arc, out.finish);
    else if (out.next) enter(st, s, arc, out.next);
    else finish(st, s, arc, 'The matter fades.');
  }
  // 3. New arcs: seeded ones first, then now and then a fresh one bound to whoever fits.
  if (st.active.length >= MAX_ACTIVE || s.week - st.lastStart < START_GAP || s.week < 6) return;
  const seed = st.seeds.find((x) => !st.active.some((a) => a.tpl === x.tpl));
  if (seed) {
    st.seeds = st.seeds.filter((x) => x !== seed);
    if (Object.values(seed.roles).every((id) => roleAlive(s, id))) startArc(s, seed.tpl, seed.roles);
    return;
  }
  if (rand(st) > START_CHANCE) return;
  const shares = themeShares(s, 16);
  const pool = eligibleTemplates(s, st);
  for (let tries = 0; tries < 4 && pool.length; tries++) {
    const t = weightedPick(st, pool, (x) => x.weight * themeFactor(s, x.theme, shares));
    if (!t) break;
    const roles = t.bind(s, <T,>(xs: T[]) => (xs.length ? xs[Math.floor(rand(st) * xs.length)] : undefined));
    if (roles && Object.values(roles).every((id) => roleAlive(s, id))) {
      startArc(s, t.id, roles);
      return;
    }
    pool.splice(pool.indexOf(t), 1);
  }
}

/* ------------------------------------------------------------------ */
/* Beats in the popup pipeline                                         */
/* ------------------------------------------------------------------ */

function buildBeat(s: GameState, arc: ArcInstance): EventInstance | undefined {
  const t = BY_ID[arc.tpl];
  const stage = stageOf(arc);
  if (!t || !stage?.choices || !stage.text) return undefined;
  const v = view(s, arc);
  const label = `${t.name}: ${stage.title}`;
  const fill = (t: string | undefined) => t?.replace(/\{([a-z]+)\}/g, (_, r: string) => v.f(r));
  const choices: Choice[] = stage.choices.map((c) => ({
    id: c.id, label: fill(c.label)!, detail: fill(c.detail), because: c.because,
    effects: (c.effects?.(v) ?? []).map((e) => ({ ...e, label: e.label ?? label })),
    disabledReason: c.disabled?.(v),
  }));
  const open = choices.filter((c) => !c.disabledReason);
  if (!open.length) return undefined;
  const actors = Object.values(arc.roles).filter((id) => id !== s.playerId && !id.startsWith('pol:') && s.characters[id]).slice(0, 3);
  return {
    iid: `ev${s.nextId++}`,
    defId: `arc_${arc.tpl}_${arc.stage}`,
    week: s.week,
    mandatory: false,
    priority: 51,
    title: `${t.name}: ${stage.title}`,
    text: stage.text(v),
    choices,
    defaultChoiceId: open[0].id,
    meta: { arc: arc.id, stage: arc.stage, due: arc.id, theme: t.theme },
    actors,
  };
}

/** One beat a week at most (the oldest due), and not two weeks running. */
export function arcEventSource(s: GameState): EventInstance | undefined {
  if (s.gameOver || !s.arcs) return undefined;
  const st = s.arcs;
  if (s.week - st.lastBeat < BEAT_GAP) return undefined;
  const due = st.active.filter((a) => stageOf(a)?.choices && s.week >= a.due).sort((a, b) => a.due - b.due);
  for (const arc of due) {
    const ev = buildBeat(s, arc);
    if (ev) return ev;
  }
  return undefined;
}

/** Engine hook right after the week's choices: answered beats move their arcs on. */
export function arcsResolve(ctx: Ctx, resolved: readonly EventInstance[], choices: PlayerChoices): void {
  const s = ctx.s;
  if (!s.arcs) return;
  const st = s.arcs;
  for (const ev of resolved) {
    const id = ev.meta?.arc ? String(ev.meta.arc) : undefined;
    const arc = id ? st.active.find((a) => a.id === id) : undefined;
    if (!arc || arc.stage !== ev.meta?.stage || arc.picks[arc.stage]) continue;
    const stage = stageOf(arc);
    const wanted = choices.choices?.[ev.iid];
    const ch = ev.choices.find((c) => c.id === wanted && !c.disabledReason) ?? ev.choices.find((c) => c.id === ev.defaultChoiceId) ?? ev.choices[0];
    const def = stage?.choices?.find((c) => c.id === ch?.id);
    if (!stage || !def) continue;
    st.lastBeat = ev.week;
    arc.picks[stage.id] = def.id;
    const v = view(s, arc);
    note(s, arc, def.note(v), false);
    queueSeed(st, s, def.seed?.(v));
    if (def.finish) finish(st, s, arc, def.finish(v));
    else if (def.next) enter(st, s, arc, def.next);
    else finish(st, s, arc, 'The matter is settled.');
  }
}

/** For the tracker: active and finished arcs, newest first, with what the boss knows. */
export function storylines(s: GameState): { arc: ArcInstance; tpl: ArcTemplate; stage?: ArcStageDef; cast: { label: string; name: string }[] }[] {
  const st = s.arcs;
  if (!st) return [];
  return [...st.active, ...[...st.done].reverse()].filter((a) => BY_ID[a.tpl]).map((arc) => {
    const tpl = BY_ID[arc.tpl];
    return {
      arc, tpl, stage: arc.status === 'active' ? stageOf(arc) : undefined,
      cast: Object.entries(arc.roles).filter(([, id]) => id !== s.playerId && !id.startsWith('rom:')).map(([r, id]) => ({ label: tpl.roleLabels[r] ?? r, name: roleName(s, id) })),
    };
  });
}
