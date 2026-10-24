import { ageOn, isInSeason } from './calendar';
import { displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { callName } from './crewEvents';
import { chooseHeir } from './dynasty';
import { newBusiness } from './business';
import { applyEffects, describeEffect } from './effects';
import type { Ctx } from './ledger';
import { rand, weightedPick } from './rng';
import { gateLabel, type Fx, type Option, type PackEvent, type RoleSpec, type Spawn } from './storyData';
import { ALL_BY_ID as EVENTS_BY_ID, ALL_CHAINS as CHAINS, ALL_EVENTS as EVENTS, PACK_DEFS, PACK_OF, STORY_PACKS } from './storyPacks';
import { ensureStory, type StoryState } from './storyState';
import { FACTION_NAMES, RIVALS } from './world';
import type { Character, Choice, Effect, EventInstance, FactionId, GameState, RivalId, ScheduledConsequence } from './types';

/**
 * The content pack adapter. The pack (storyData*.ts, copied verbatim from
 * the content-pack) is engine-neutral data: declarative triggers, roles to
 * cast, `{role.field}` placeholders and `Fx` effects. This file turns a pack
 * event into a normal EventInstance for the ONE popup pipeline:
 *
 *  - triggers are evaluated against the game state;
 *  - roles are cast from real characters (rank, trait, relation, regime,
 *    rival boss); townies, officials and named rival men are created as
 *    characters (and reused if the event is offered again);
 *  - placeholders are filled; rival bosses named in the prose are swapped for
 *    the current leader if the original is gone (or the event waits while a
 *    faction has no living leader);
 *  - Fx become engine Effects (shown as chips), `followup` becomes a
 *    `schedule` consequence keyed `pack:<event>` that carries every role;
 *  - the four Fx without an old equivalent go to the systems that now exist:
 *    stress -> dynasty stress, evidence -> the character's one evidence file,
 *    secret -> a Secret (blackmail and exposure read it), alliance -> a
 *    dynasty alliance with the house that leads the rival.
 *
 * The story source offers at most ONE candidate a week: a due chain part
 * first, then a dated history beat, else (sometimes) a random-pool event.
 * Chain parts and mandatory beats outrank crew decisions; random pack events
 * rank below them so the pack never floods out the crew or the family.
 */

const PRIORITY_MANDATORY = 60;
const PRIORITY_CHAIN = 52;
const PRIORITY_RANDOM = 40;
/** Weeks between two random-pool pack events, and the weekly chance after that. */
export const RANDOM_GAP = 3;
export const RANDOM_CHANCE = 0.4;
/** A chain part that cannot be cast for this long is dropped (the chain ends). */
const DUE_MAX_WAIT = 16;
/** The first year: random pack events come less often and their costs are halved. */
const FIRST_YEAR = 52;

export type Cast = Record<string, string>;

interface Bound {
  roles: Cast;
  district: string;
}

/* ---------------------------------------------------------------- */
/* Hard-coded rival names                                             */
/* ---------------------------------------------------------------- */

interface NameRule {
  rival: RivalId;
  full: RegExp[];
  first: RegExp;
  last?: RegExp;
}

const NAME_RULES: NameRule[] = RIVALS.map((d) => {
  const firsts = d.id === 'philly' ? ['Salvatore', 'Sal'] : [d.leader.first];
  return {
    rival: d.id as RivalId,
    full: firsts.map((f) => new RegExp(`\\b${f} (?:"[^"]+" )?${d.leader.last}\\b`, 'g')),
    first: new RegExp(`\\b(?:${firsts.join('|')})\\b`, 'g'),
    last: d.kind === 'law' ? new RegExp(`\\b${d.leader.last}\\b`, 'g') : undefined,
  };
});

const TEXT_CACHE = new Map<string, RivalId[]>();

/** Rival factions whose original leader the event names in its prose. */
export function namedRivals(e: PackEvent): RivalId[] {
  const hit = TEXT_CACHE.get(e.id);
  if (hit) return hit;
  const text = [e.title, e.body, ...e.options.flatMap((o) => [o.text, o.preview])].join('\n');
  const out = NAME_RULES.filter((r) => r.full.some((re) => new RegExp(re.source).test(text)) || (r.last && new RegExp(r.last.source).test(text))).map((r) => r.rival);
  TEXT_CACHE.set(e.id, out);
  return out;
}

function leaderOf(s: GameState, rival: RivalId): Character | undefined {
  const r = s.rivals.find((x) => x.id === rival);
  const c = r ? s.characters[r.leaderId] : undefined;
  return c?.alive ? c : undefined;
}

/** Swap an original rival boss's name for whoever leads that faction now. */
function swapNames(s: GameState, text: string): string {
  let out = text;
  for (const rule of NAME_RULES) {
    const def = RIVALS.find((d) => d.id === rule.rival)!;
    const now = leaderOf(s, rule.rival);
    if (!now || (now.firstName === def.leader.first && now.lastName === def.leader.last)) continue;
    for (const re of rule.full) out = out.replace(re, `${now.firstName} ${now.lastName}`);
    if (now.firstName !== def.leader.first) out = out.replace(rule.first, now.firstName);
    if (rule.last && now.lastName !== def.leader.last) out = out.replace(rule.last, now.lastName);
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Triggers                                                           */
/* ---------------------------------------------------------------- */

function ymVal(y: number, m: number): number {
  return y * 12 + m;
}

/** The trigger's non-role conditions (calendar, heat, money, flags, rivals). */
export function triggerOk(s: GameState, e: PackEvent): boolean {
  const t = e.trigger;
  if (t.season === 'summer' && !isInSeason(s.date)) return false;
  if (t.season === 'offseason' && isInSeason(s.date)) return false;
  if (t.months && !t.months.includes(s.date.m)) return false;
  if (t.minWeek !== undefined && s.week < t.minWeek) return false;
  if (t.maxWeek !== undefined && s.week > t.maxWeek) return false;
  if (t.between) {
    const now = ymVal(s.date.y, s.date.m);
    if (now < ymVal(t.between.from.y, t.between.from.m) || now > ymVal(t.between.to.y, t.between.to.m)) return false;
  }
  if (t.heatAbove) for (const [b, v] of Object.entries(t.heatAbove)) if (s.heat[b as 'local'] <= (v ?? 0)) return false;
  if (t.heatBelow) for (const [b, v] of Object.entries(t.heatBelow)) if (s.heat[b as 'local'] >= (v ?? 100)) return false;
  if (t.moneyAbove !== undefined && s.money <= t.moneyAbove) return false;
  if (t.respectAbove !== undefined && s.respect <= t.respectAbove) return false;
  if (t.respectBelow !== undefined && s.respect >= t.respectBelow) return false;
  if (t.rivalAlive && !leaderOf(s, t.rivalAlive)) return false;
  if (t.hasBusiness && !s.businesses.some((b) => b.owner === 'player' && b.kind === t.hasBusiness && (b.closedUntil ?? 0) <= s.week)) return false;
  if (t.flag && !(s.flags[t.flag] > 0)) return false;
  if (t.notFlag && s.flags[t.notFlag] > 0) return false;
  if (t.playerTrait && !hasTrait(player(s), t.playerTrait)) return false;
  // Prose that names a rival boss needs that faction to have a living leader (his successor's name is swapped in).
  for (const r of namedRivals(e)) if (!leaderOf(s, r)) return false;
  return true;
}

/** May this event come from the random pool / history beats right now? (ignores roles) */
export function poolEligible(s: GameState, e: PackEvent, st: StoryState): boolean {
  const t = e.trigger;
  if (t.chainOnly) return false;
  const last = st.fired[e.id];
  if (last !== undefined && (t.once || s.week - last < (t.cooldownWeeks ?? 26))) return false;
  if (e.chain && chainActive(s, st, e.chain.id)) return false;
  if (st.queued.includes(e.id)) return false;
  return triggerOk(s, e);
}

function chainActive(s: GameState, st: StoryState, chainId: string): boolean {
  if (st.due.some((d) => EVENTS_BY_ID[d.event]?.chain?.id === chainId)) return true;
  return s.scheduled.some((x) => x.key.startsWith('pack:') && EVENTS_BY_ID[x.key.slice(5)]?.chain?.id === chainId);
}

/* ---------------------------------------------------------------- */
/* Casting                                                            */
/* ---------------------------------------------------------------- */

function adultAge(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}

function fitsBasics(s: GameState, c: Character, spec: RoleSpec, extra: { rank?: RoleSpec['rank']; trait?: RoleSpec['trait'] }): boolean {
  const ranks = [spec.rank, extra.rank].filter((x): x is NonNullable<RoleSpec['rank']> => !!x);
  for (const r of ranks) if (Array.isArray(r) ? !r.includes(c.rank) : c.rank !== r) return false;
  for (const t of [spec.trait, extra.trait]) if (t && !hasTrait(c, t)) return false;
  if (spec.notTrait && hasTrait(c, spec.notTrait)) return false;
  if (spec.gender && c.gender !== spec.gender) return false;
  if (spec.age) {
    const a = adultAge(s, c);
    if (a < spec.age[0] || a > spec.age[1]) return false;
  }
  return true;
}

function relatives(s: GameState, rel: NonNullable<RoleSpec['relation']>): Character[] {
  const boss = player(s);
  const alive = (ids: (string | undefined)[]) => ids.map((id) => (id ? s.characters[id] : undefined)).filter((c): c is Character => !!c?.alive && c.id !== boss.id);
  const kids = alive(boss.childrenIds);
  const sibs = boss.fatherId ? Object.values(s.characters).filter((o) => o.alive && o.id !== boss.id && o.fatherId === boss.fatherId) : [];
  switch (rel) {
    case 'spouse': return alive([boss.spouseId]);
    case 'heir': {
      const h = chooseHeir(s, boss).heir;
      return h && h.id !== boss.id ? [h] : [];
    }
    case 'child': return kids.slice().sort((a, b) => adultAge(s, a) - adultAge(s, b));
    case 'son': return kids.filter((k) => k.gender === 'M');
    case 'daughter': return kids.filter((k) => k.gender === 'F');
    case 'sibling': return sibs;
    case 'sister': return sibs.filter((x) => x.gender === 'F');
    case 'parent': return alive([boss.fatherId, boss.motherId]);
    case 'mother': return alive([boss.motherId]);
    case 'father': return alive([boss.fatherId]);
    case 'nephew': return sibs.flatMap((x) => alive(x.childrenIds)).filter((k) => k.gender === 'M');
  }
}

/** Create a character for a role on the story's own dice. */
function spawnChar(s: GameState, st: StoryState, sp: Spawn, office?: string): Character {
  const main = s.rng;
  s.rng = st.rng;
  try {
    const age = sp.age ? sp.age[0] + Math.floor(rand(s) * (sp.age[1] - sp.age[0] + 1)) : undefined;
    const faction: FactionId = sp.faction === 'player' ? 'player' : sp.faction && sp.faction !== 'none' ? sp.faction : 'none';
    const c = makeCharacter(s, {
      gender: sp.gender ?? 'M',
      ethnicity: sp.ethnicity,
      firstName: sp.first,
      lastName: sp.last,
      age,
      rank: sp.rank ?? (faction !== 'none' && faction !== 'player' ? 'soldier' : 'civilian'),
      faction,
      nickname: false,
      traits: sp.traits ? [...sp.traits] : undefined,
    });
    if (sp.nickname) c.nickname = sp.nickname;
    if (office ?? sp.office) c.office = office ?? sp.office;
    return c;
  } finally {
    st.rng = s.rng;
    s.rng = main;
  }
}

function sameRegime(c: Character, other: Character): boolean {
  if (other.rank === 'capo') return c.capoId === other.id;
  return !!other.capoId && c.capoId === other.capoId;
}

/**
 * Cast every role of the event. `carried` holds role bindings from earlier
 * chain parts (`role_<key>`). Returns undefined if a role cannot be filled:
 * the event is then skipped. Characters are created only once every
 * non-created role has been found.
 */
export function castRoles(s: GameState, e: PackEvent, carried: Record<string, string | number> = {}): Bound | undefined {
  const st = ensureStory(s);
  const roles: Cast = {};
  const used = new Set<string>([s.playerId]);
  const toSpawn: [string, RoleSpec][] = [];
  const take = (key: string, c: Character) => {
    roles[key] = c.id;
    used.add(c.id);
  };
  const pickFrom = (cands: Character[]) => (cands.length ? cands[Math.floor(rand(st) * cands.length)] : undefined);
  for (const [key, spec] of Object.entries(e.roles)) {
    const extra = key === 'actor' ? { rank: e.trigger.rank, trait: e.trigger.trait } : {};
    const not = new Set((spec.notRole ?? []).map((k) => roles[k]).filter(Boolean));
    const ok = (c: Character) => c.alive && !used.has(c.id) && !not.has(c.id) && fitsBasics(s, c, spec, extra);
    if (spec.worldId || spec.pool === 'world') {
      const w = spec.worldId ? castWorld(s, spec.worldId) : undefined;
      if (w && w.alive && !used.has(w.id)) {
        take(key, w);
        continue;
      }
      if (spec.pool === 'world') return undefined;
    }
    switch (spec.pool) {
      case 'chain': {
        const id = carried[`role_${key}`];
        const c = id !== undefined ? s.characters[String(id)] : undefined;
        if (!c?.alive || c.id === s.playerId) return undefined;
        roles[key] = c.id;
        used.add(c.id);
        break;
      }
      case 'crew': {
        const other = spec.sameRegimeAs ? s.characters[roles[spec.sameRegimeAs]] : undefined;
        if (spec.sameRegimeAs && !other) return undefined;
        const c = pickFrom(Object.values(s.characters).filter((x) => x.faction === 'player' && x.rank !== 'civilian' && x.rank !== 'boss' && isFree(s, x) && ok(x) && (!other || sameRegime(x, other))));
        if (c) take(key, c);
        else if (spec.spawn) toSpawn.push([key, spec]);
        else return undefined;
        break;
      }
      case 'family': {
        const c = relatives(s, spec.relation ?? 'child').find(ok);
        if (c) take(key, c);
        else if (spec.spawn) toSpawn.push([key, spec]);
        else return undefined;
        break;
      }
      case 'rival': {
        const faction = spec.faction;
        if (!faction) return undefined;
        if (spec.leader) {
          const L = leaderOf(s, faction);
          if (!L || used.has(L.id)) return undefined;
          take(key, L);
          break;
        }
        const sp = spec.spawn;
        const named = sp?.first && sp.last ? Object.values(s.characters).find((x) => x.alive && x.firstName === sp.first && x.lastName === sp.last && !used.has(x.id)) : undefined;
        if (named) {
          take(key, named);
          break;
        }
        if (sp?.first && sp.last) {
          toSpawn.push([key, spec]);
          break;
        }
        const r = s.rivals.find((x) => x.id === faction);
        const c = pickFrom(Object.values(s.characters).filter((x) => x.faction === faction && x.id !== r?.leaderId && ok(x)));
        if (c) take(key, c);
        else if (sp) toSpawn.push([key, spec]);
        else return undefined;
        break;
      }
      case 'official': {
        const office = (spec.office ?? spec.spawn?.office ?? '').toLowerCase();
        const c = Object.values(s.characters).find((x) => x.office && x.office.toLowerCase() === office && ok(x));
        if (c) take(key, c);
        else if (spec.spawn) toSpawn.push([key, spec]);
        else return undefined;
        break;
      }
      case 'town':
        toSpawn.push([key, spec]);
        break;
    }
  }
  // Everyone who exists has been found: now create (or reuse) the rest.
  for (const [key, spec] of toSpawn) {
    const ck = `${e.id}:${key}`;
    const prev = st.spawned[ck] ? s.characters[st.spawned[ck]] : undefined;
    if (prev?.alive && !used.has(prev.id)) {
      take(key, prev);
      continue;
    }
    const sp: Spawn = { ...(spec.spawn ?? {}) };
    if (spec.pool === 'rival' && !sp.faction) sp.faction = spec.faction;
    if (!sp.gender && spec.gender) sp.gender = spec.gender;
    if (!sp.age && spec.age) sp.age = spec.age;
    const c = spawnChar(s, st, sp, spec.office);
    if (spec.pool === 'family' && spec.relation === 'nephew') {
      const sister = relatives(s, 'sister')[0] ?? relatives(s, 'sibling')[0];
      if (sister) {
        if (sister.gender === 'F') c.motherId = sister.id;
        else c.fatherId = sister.id;
        if (!sister.childrenIds.includes(c.id)) sister.childrenIds.push(c.id);
        if (sister.gender === 'M') c.lastName = sister.lastName;
      }
    }
    st.spawned[ck] = c.id;
    take(key, c);
  }
  const district = pickDistrict(s, e, roles, carried);
  return { roles, district };
}

function pickDistrict(s: GameState, e: PackEvent, roles: Cast, carried: Record<string, string | number>): string {
  if (e.trigger.district) return e.trigger.district;
  if (carried.district) return String(carried.district);
  const actor = roles.actor ? s.characters[roles.actor] : undefined;
  if (actor) {
    const d = s.districts.find((x) => x.capoId === actor.id || (actor.capoId && x.capoId === actor.capoId));
    if (d) return d.id;
  }
  return [...s.districts].sort((a, b) => (b.influence.player ?? 0) - (a.influence.player ?? 0))[0]?.id ?? 'boardwalk';
}

/* ---------------------------------------------------------------- */
/* Placeholders                                                       */
/* ---------------------------------------------------------------- */

function factionOfRole(s: GameState, e: PackEvent, key: string, b: Bound): RivalId | undefined {
  const spec = e.roles[key];
  if (spec?.pool === 'rival' && spec.faction) return spec.faction;
  const c = s.characters[b.roles[key]];
  return c && s.rivals.some((r) => r.id === c.faction) ? (c.faction as RivalId) : undefined;
}

function field(c: Character, f: string): string {
  switch (f) {
    case 'name': return `${c.firstName} ${c.lastName}`;
    case 'first': return c.firstName;
    case 'last': return c.lastName;
    case 'nickname': return c.nickname ?? c.firstName;
    case 'call': return callName(c);
    default: return displayName(c);
  }
}

/** Fill `{role.field}`, `{player.*}`, `{district}` and `{house}`. */
export function fillText(s: GameState, e: PackEvent, b: Bound, text: string): string {
  return swapNames(s, text).replace(/\{([a-z0-9]+)(?:\.([a-z]+))?\}/gi, (m, key: string, f?: string) => {
    if (!f) {
      if (key === 'district') return s.districts.find((d) => d.id === b.district)?.name ?? 'the island';
      if (key === 'house') return s.houseName;
      return m;
    }
    if (key === 'player') {
      const boss = player(s);
      if (f === 'boss') return displayName(boss);
      if (f === 'org') return `the house of ${s.houseName}`;
      return field(boss, f);
    }
    const c = s.characters[b.roles[key]];
    if (!c) return m;
    if (f === 'boss' || f === 'org') {
      const fac = factionOfRole(s, e, key, b);
      const r = fac ? s.rivals.find((x) => x.id === fac) : undefined;
      if (!r) return f === 'boss' ? 'his boss' : 'his people';
      if (f === 'org') return r.name;
      const L = s.characters[r.leaderId];
      return L ? `${L.firstName} ${L.lastName}` : r.shortName;
    }
    return field(c, f);
  });
}

/* ---------------------------------------------------------------- */
/* Effects                                                            */
/* ---------------------------------------------------------------- */

function stressSource(e: PackEvent): 'irs' | 'paranoia' | 'honor' | 'domestic' {
  switch (e.category) {
    case 'family': case 'romance-nonexplicit': return 'domestic';
    case 'law': case 'politics': return 'irs';
    case 'church': case 'history': return 'honor';
    default: return 'paranoia';
  }
}

function chainTitle(e: PackEvent): string {
  return CHAINS.find((c) => c.id === e.chain?.id)?.title ?? 'The story';
}

/** Map one pack Fx onto engine Effects (empty when the target is missing). */
export function mapFx(s: GameState, e: PackEvent, b: Bound, fx: Fx, carried: Record<string, string | number> = {}): Effect[] {
  const P = s.playerId;
  const id = (role: string): string | undefined => (role === 'player' ? P : b.roles[role]);
  const reason = e.title;
  switch (fx.k) {
    case 'money':
      // The first season the house is still finding its feet: the pack's bills come in at half.
      return [{ type: 'money', amount: fx.amount < 0 && s.week <= FIRST_YEAR ? Math.round(fx.amount / 2 / 50) * 50 : fx.amount }];
    case 'respect': return [{ type: 'respect', amount: fx.amount }];
    case 'heat': return [{ type: 'heat', bar: fx.bar, amount: fx.amount }];
    case 'opinion': {
      const from = id(fx.role);
      const to = fx.toward ? id(fx.toward) : P;
      return from && to && from !== to ? [{ type: 'opinion', from, to, amount: fx.amount, reason, decay: 1 }] : [];
    }
    case 'crewOpinion': return [{ type: 'crewOpinion', amount: fx.amount, reason }];
    case 'familyOpinion': return [{ type: 'familyOpinion', amount: fx.amount, reason }];
    case 'rivalOpinion': return [{ type: 'rivalOpinion', rival: fx.rival, amount: fx.amount, reason }];
    case 'stress': return [{ type: 'dyn', op: { op: 'stress', charId: P, amount: fx.amount, source: stressSource(e) } }];
    case 'evidence': {
      const c = id(fx.role);
      return c ? [{ type: 'evidence', charId: c, amount: fx.amount }] : [];
    }
    case 'hook': {
      const c = id(fx.role);
      return c && c !== P ? [{ type: 'hook', targetId: c, strong: !!fx.strong, reason: fx.reason }] : [];
    }
    case 'secret': {
      const c = id(fx.role);
      return c ? [{ type: 'storyOp', op: { op: 'secret', charId: c, kind: fx.kind, knownBy: [fx.knownBy ?? 'player'] } }] : [];
    }
    case 'followup': {
      const params: Record<string, string | number> = { ...carried, district: b.district };
      for (const [k, v] of Object.entries(b.roles)) params[`role_${k}`] = v;
      return [{ type: 'schedule', key: `pack:${fx.event}`, minWeeks: fx.minWeeks, maxWeeks: fx.maxWeeks, chance: fx.chance, hint: `${chainTitle(e)} continues`, params }];
    }
    case 'flag': return [{ type: 'flag', key: fx.key, value: fx.value }];
    case 'influence': {
      const d = fx.district === '{district}' ? b.district : fx.district;
      return [{ type: 'influence', district: d, faction: fx.faction ?? 'player', amount: fx.amount }];
    }
    case 'health': {
      const c = id(fx.role);
      return c ? [{ type: 'health', charId: c, amount: fx.amount }] : [];
    }
    case 'prison': {
      const c = id(fx.role);
      return c && c !== P ? [{ type: 'imprison', charId: c, weeks: fx.weeks }] : [];
    }
    case 'leave': {
      const c = id(fx.role);
      const ch = c ? s.characters[c] : undefined;
      if (!c || !ch || c === P) return [];
      if (fx.how === 'dies') return [{ type: 'kill', charId: c, cause: `${reason} (off the island, and never spoken of)`, killer: 'player' }];
      if (fx.how === 'retires' && ch.faction === 'player') return [{ type: 'retire', charId: c }];
      return [{ type: 'exile', charId: c }];
    }
    case 'rank': {
      const c = id(fx.role);
      return c && c !== P ? [{ type: 'rank', charId: c, rank: fx.rank }] : [];
    }
    case 'recruit': {
      const c = id(fx.role);
      if (!c || c === P) return [];
      const out: Effect[] = [{ type: 'recruit', charId: c }];
      if (fx.rank) out.push({ type: 'rank', charId: c, rank: fx.rank });
      return out;
    }
    case 'debt': return [{ type: 'debt', lender: FACTION_NAMES[fx.lender as FactionId] ?? fx.lender, principal: fx.principal, weeklyPayment: fx.weeklyPayment, weeks: fx.weeks }];
    case 'rivalResource': return [{ type: 'rivalResource', rival: fx.rival, money: fx.money, muscle: fx.muscle, exposure: fx.exposure }];
    case 'feud': return [{ type: 'feud', rival: fx.rival }];
    case 'underbelly': return [{ type: 'underbelly', op: fx.op, amount: fx.amount }];
    case 'business': {
      if (fx.op === 'add') {
        const d = !fx.district || fx.district === '{district}' ? b.district : fx.district;
        return [{ type: 'addBusiness', business: newBusiness(s, fx.kind, d) }];
      }
      const biz = s.businesses.find((x) => x.owner === 'player' && x.kind === fx.kind);
      return biz ? [{ type: 'closeBusiness', businessId: biz.id, weeks: fx.weeks ?? 4 }] : [];
    }
    case 'wealth': {
      const c = id(fx.role);
      return c ? [{ type: 'wealth', charId: c, amount: fx.amount }] : [];
    }
    case 'favor': return [{ type: 'favor', amount: fx.amount }];
    case 'unwashed': return [{ type: 'unwashed', amount: fx.amount }];
    case 'alliance': {
      const house = s.dyn?.houses.find((h) => h.leads && h.faction === fx.rival);
      const out: Effect[] = [{ type: 'rivalOpinion', rival: fx.rival, amount: 20, reason: 'Our families are joined' }];
      if (house) out.unshift({ type: 'dyn', op: { op: 'alliance', houseId: house.id, weeks: 520 } });
      else out.push({ type: 'flag', key: `alliance_${fx.rival}`, value: 1 });
      return out;
    }
  }
}

function mapAll(s: GameState, e: PackEvent, b: Bound, fxs: readonly Fx[] | undefined, carried: Record<string, string | number>): Effect[] {
  return (fxs ?? []).flatMap((fx) => mapFx(s, e, b, fx, carried));
}

/* ---------------------------------------------------------------- */
/* Building an event                                                  */
/* ---------------------------------------------------------------- */

function gateBlock(s: GameState, o: Option): string | undefined {
  const g = o.gate;
  if (!g) return undefined;
  if (g.money !== undefined && s.money < g.money) return `Needs $${g.money.toLocaleString('en-US')}`;
  if (g.respect !== undefined && s.respect < g.respect) return `Needs ${g.respect} respect`;
  if (g.flag && !(s.flags[g.flag] > 0)) return 'You have not laid the groundwork';
  return undefined;
}

function traitVisible(s: GameState, o: Option): boolean {
  const boss = player(s);
  if (o.gate?.trait && !hasTrait(boss, o.gate.trait)) return false;
  if (o.gate?.notTrait && hasTrait(boss, o.gate.notTrait)) return false;
  return true;
}

function becauseOf(text: string): string {
  const first = text.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '');
  const short = first.length > 70 ? `${first.slice(0, 67).trimEnd()}...` : first;
  return `chose "${short}"`;
}

/**
 * Build a concrete EventInstance for a pack event, or undefined if its roles
 * cannot be cast. `carried` are the role bindings of earlier chain parts.
 */
export function buildPackEvent(s: GameState, e: PackEvent, carried: Record<string, string | number> = {}, dueId?: string): EventInstance | undefined {
  const b = castRoles(s, e, carried);
  if (!b) return undefined;
  const fill = (t: string) => fillText(s, e, b, t);
  const choices: Choice[] = [];
  e.options.forEach((o, i) => {
    if (!traitVisible(s, o)) return;
    choices.push({
      id: `o${i}`,
      label: fill(gateLabel(o)),
      detail: fill(o.preview),
      effects: mapAll(s, e, b, o.effects, carried),
      because: becauseOf(fill(o.text)),
      disabledReason: gateBlock(s, o),
    });
  });
  const open = choices.filter((c) => !c.disabledReason);
  if (!open.length) return undefined;
  const ungated = open.find((c) => !e.options[Number(c.id.slice(1))].gate) ?? open[0];
  const immediate = mapAll(s, e, b, e.immediate, carried).map((x) => describeEffect(s, x)).filter(Boolean);
  const text = fill(e.body) + (immediate.length ? `\n\nAlready: ${immediate.join(', ')}.` : '');
  const mandatory = !!e.trigger.mandatory;
  const priority = mandatory ? PRIORITY_MANDATORY : e.trigger.chainOnly ? PRIORITY_CHAIN : PRIORITY_RANDOM;
  const actor = b.roles.actor ?? Object.values(b.roles)[0];
  const meta: Record<string, string | number> = { pack: e.id, cast: JSON.stringify(b.roles), district: b.district, carried: JSON.stringify(carried) };
  if (dueId) meta.due = dueId;
  if (e.chain) meta.chain = e.chain.id;
  if (e.category === 'family' || e.category === 'romance-nonexplicit') meta.family = 1;
  if (e.category === 'crew' && actor && s.characters[actor]?.faction === 'player') {
    meta.crew = 1;
    meta.charId = actor;
  }
  const actors = Object.values(b.roles).filter((id) => id !== s.playerId).slice(0, 3);
  return {
    iid: `ev${s.nextId++}`,
    defId: `pack_${e.id}`,
    title: fill(e.title),
    text,
    week: s.week,
    choices,
    defaultChoiceId: ungated.id,
    mandatory,
    priority,
    meta,
    actors,
  };
}

/* ---------------------------------------------------------------- */
/* The weekly source and the bookkeeping                              */
/* ---------------------------------------------------------------- */

/** One pack candidate a week: a due chain part, a dated history beat, or (sometimes) a random event. */
export function storyEventSource(s: GameState): EventInstance | undefined {
  if (s.gameOver) return undefined;
  const st = ensureStory(s);
  // 1. Chain parts that came due (oldest first).
  for (const d of [...st.due]) {
    const e = EVENTS_BY_ID[d.event];
    if (!e) {
      st.due = st.due.filter((x) => x !== d);
      continue;
    }
    if (st.queued.includes(e.id)) continue;
    if (!triggerOk(s, e)) {
      if (s.week - d.since > DUE_MAX_WAIT) dropDue(st, d.id);
      continue;
    }
    const ev = buildPackEvent(s, e, d.params, d.id);
    if (ev) return ev;
    dropDue(st, d.id);
  }
  // 2. Dated history beats (mandatory, the calendar decides).
  for (const e of EVENTS) {
    if (!e.trigger.mandatory || e.trigger.chainOnly || !poolEligible(s, e, st)) continue;
    const ev = buildPackEvent(s, e);
    if (ev) return ev;
  }
  // 3. The random pool, now and then.
  if (s.week < 6 || s.week - st.lastRandom < (s.week <= FIRST_YEAR ? RANDOM_GAP * 2 : RANDOM_GAP)) return undefined;
  if (rand(st) > (s.week <= FIRST_YEAR ? RANDOM_CHANCE / 2 : RANDOM_CHANCE)) return undefined;
  const spent = packSpend(s, st);
  const pool = EVENTS.filter((e) => !e.trigger.mandatory && (spent[PACK_OF[e.id]] ?? 0) < (PACK_DEFS[PACK_OF[e.id]]?.budget ?? 99) && poolEligible(s, e, st));
  for (let tries = 0; tries < 3 && pool.length; tries++) {
    const e = weightedPick(st, pool, (x) => (x.trigger.weight ?? 10) * (PACK_DEFS[PACK_OF[x.id]]?.weight ?? 1));
    if (!e) break;
    const ev = buildPackEvent(s, e);
    if (ev) return ev;
    pool.splice(pool.indexOf(e), 1);
  }
  return undefined;
}

/** A chain part none of whose options lead anywhere. */
export function isFinalPart(e: PackEvent): boolean {
  return !e.options.some((o) => o.effects.some((fx) => fx.k === 'followup'));
}

/** Random-pool events shown per pack in the last 52 weeks (each pack's budget). */
export function packSpend(s: GameState, st: StoryState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, w] of Object.entries(st.fired)) {
    const e = EVENTS_BY_ID[id];
    if (!e || e.trigger.chainOnly || e.trigger.mandatory || s.week - w >= 52) continue;
    out[PACK_OF[id]] = (out[PACK_OF[id]] ?? 0) + 1;
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* World-pack people (the population, when the politics layer runs)   */
/* ---------------------------------------------------------------- */

type WorldMaterializer = (s: GameState, worldId: string) => Character | undefined;
let worldMaterializer: WorldMaterializer | undefined;

/**
 * The population layer (when present) registers how to turn a world-pack
 * person into an engine Character. Without it, world roles fall back to
 * their pool (or the event is skipped for pool 'world').
 */
export function registerWorldMaterializer(fn: WorldMaterializer): void {
  worldMaterializer = fn;
}

/** A world-pack person as an engine character: already materialized, else via the population layer, else nobody. */
export function castWorld(s: GameState, worldId: string): Character | undefined {
  const pop = (s as GameState & { pol?: { people?: Record<string, { charId?: string; alive?: boolean }> } }).pol;
  const rec = pop?.people?.[worldId];
  if (rec?.charId) {
    const c = s.characters[rec.charId];
    return c?.alive ? c : undefined;
  }
  if (rec && rec.alive === false) return undefined;
  const st = ensureStory(s);
  const cached = st.spawned[`world:${worldId}`];
  if (cached && s.characters[cached]?.alive) return s.characters[cached];
  if (!pop || !worldMaterializer) return undefined;
  const c = worldMaterializer(s, worldId);
  if (c) st.spawned[`world:${worldId}`] = c.id;
  return c;
}

function dropDue(st: StoryState, id: string): void {
  st.due = st.due.filter((x) => x.id !== id);
  st.stats.skipped++;
}

/** Consequence handler for `pack:<event>`: the next chain part is now due. */
export function packConsequence(ctx: Ctx, sc: ScheduledConsequence): undefined {
  const s = ctx.s;
  const st = ensureStory(s);
  const event = sc.key.slice(5);
  if (!EVENTS_BY_ID[event]) return undefined;
  st.due.push({ id: `d${s.nextId++}`, event, params: sc.params, since: s.week, because: sc.because });
  return undefined;
}

/**
 * Engine hook, right after the week's choices were applied: pack events that
 * were shown are recorded (once / cooldown / chain progress), their
 * `immediate` effects post to the ledger, and finished chains are counted.
 */
export function storyResolve(ctx: Ctx, resolved: readonly EventInstance[]): void {
  const s = ctx.s;
  const st = ensureStory(s);
  for (const ev of resolved) {
    const id = ev.meta?.pack ? String(ev.meta.pack) : undefined;
    const e = id ? EVENTS_BY_ID[id] : undefined;
    if (!e) continue;
    st.fired[e.id] = ev.week;
    st.stats.shown++;
    if (!e.trigger.chainOnly && !e.trigger.mandatory) st.lastRandom = ev.week;
    if (e.trigger.mandatory && !e.chain) st.stats.history++;
    if (ev.meta?.due) st.due = st.due.filter((x) => x.id !== String(ev.meta!.due));
    const roles = JSON.parse(String(ev.meta?.cast ?? '{}')) as Cast;
    const carried = JSON.parse(String(ev.meta?.carried ?? '{}')) as Record<string, string | number>;
    const b: Bound = { roles, district: String(ev.meta?.district ?? 'boardwalk') };
    const imm = mapAll(s, e, b, e.immediate, carried);
    if (imm.length) applyEffects(ctx, imm, { label: ev.title, because: `lived through "${ev.title}"`, category: 'event' });
    if (e.chain) {
      const ch = st.chains[e.chain.id] ?? { started: ev.week, last: ev.week };
      if (e.chain.part > 1) st.stats.chainParts++;
      ch.last = ev.week;
      st.chains[e.chain.id] = ch;
      if (!chainActive(s, st, e.chain.id)) {
        ch.done = s.week;
        if (isFinalPart(e)) st.stats.chainsDone++;
        else st.stats.chainsEnded++;
      }
    }
  }
  // Mandatory pack events crowded out this week wait in the queue: don't offer them twice.
  st.queued = s.eventQueue.filter((x) => x.meta?.pack).map((x) => String(x.meta!.pack));
  // The content pack's integrator rule: took Manno's cut AND lied to Philadelphia about it.
  if (s.flags.pw_took_cut > 0 && s.flags.pw_lied > 0 && !(s.flags.pw_sanctioned > 0)) {
    s.flags.pw_sanctioned = 1;
    applyEffects(ctx, [
      { type: 'heat', bar: 'family', amount: 25 },
      { type: 'rivalOpinion', rival: 'philly', amount: -30, reason: 'Lied about the powder' },
    ], { label: 'Philadelphia learned you lied about the powder', because: 'took Manno\'s cut and lied about it', category: 'event' });
  }
}

/** Every pack event id, for tests and the sim. */
export const PACK_IDS = EVENTS.map((e) => e.id);
export { CHAINS as PACK_CHAINS, EVENTS as PACK_EVENTS, EVENTS_BY_ID as PACK_BY_ID, STORY_PACKS };
