import { owned } from './business';
import { monthKey } from './calendar';
import { CATALOG } from './catalog';
import { crew, isFree } from './characters';
import { applyEffects, fmtMoney } from './effects';
import { rand, type RngHolder } from './rng';
import {
  eraPrice, GEAR, GEAR_BY_ID, MANDATES, PATHS, PATHS_BY_ID, TIERS, tiersOf,
  type GearCat, type PathId, type Prereq, type TierDef,
} from './devData';
import { devWearMult, ensureDev, pathEff, respFor, tierOf, type DevState, type GearStack, type RivalDev } from './devState';
import { crewStrength, gearHolders, holderName } from './strength';
import type { Ctx } from './ledger';
import type { ActionPreview } from './actions';
import type { Character, Effect, GameState, Rival, RivalId } from './types';

/**
 * FAMILY DEVELOPMENT: technology & connections, and crew equipment.
 *
 * Six paths (devData.ts), each a ladder of tiers that open with the years
 * and with what the family has: a hire with the right skill, a business, a
 * contact, something that happened. A tier costs money up front and every
 * week, has a man who answers for it, and does one concrete thing in a
 * system the game already has (orders carried out, skims caught, crew
 * strength, the odds on a score, heat, clean money). Some have a catch.
 *
 * Equipment is bought in lots for one crew at a time and is in exactly one
 * crew; it wears, costs upkeep, and only counts where there are men to use
 * it (strength.ts). Buying heavy draws heat and resentment, and raises fear.
 * Capos given a mandate keep their men equipped from Family money within a
 * monthly budget.
 *
 * The other families develop on their own, by their money, their goals and
 * their boss's temper, each a little behind or ahead of the times; you hear
 * about it from the Ears or the street.
 *
 * Every roll is on this layer's own stream, so it never reshuffles the main dice.
 */

export type DevAction =
  | { t: 'adopt'; path: PathId; who?: string }
  | { t: 'drop'; path: PathId }
  | { t: 'resp'; path: PathId; who: string }
  | { t: 'buy'; cat: GearCat; n: number; holder: string }
  | { t: 'assign'; stack: string; holder: string; n?: number }
  | { t: 'repair'; stack: string }
  | { t: 'scrap'; stack: string }
  | { t: 'mandate'; capo: string; level: 0 | 1 | 2 };

const year = (s: GameState) => s.date.y;

/* ------------------------------------------------------------------ */
/* Prerequisites and opportunities                                     */
/* ------------------------------------------------------------------ */

const fronts = (s: GameState) => owned(s).filter((b) => CATALOG[b.kind]?.category === 'front').length;

/** Does the family meet this condition? With the words for "Available because …" or "Needs …". */
export function prereqMet(s: GameState, p: Prereq): { ok: boolean; text: string } {
  switch (p.k) {
    case 'tier': {
      const t = tiersOf(p.path).find((x) => x.tier === p.tier);
      return { ok: tierOf(s, p.path) >= p.tier, text: `you have ${t?.name.toLowerCase() ?? `${PATHS_BY_ID[p.path].label} ${p.tier}`}` };
    }
    case 'hire': {
      const ok = crew(s).some((c) => isFree(s, c) && ((p.spec && c.specialty === p.spec) || (p.skill && c.attributes[p.skill] >= (p.min ?? 60))));
      return { ok, text: p.text };
    }
    case 'biz': {
      const n = owned(s).filter((b) => p.kinds.includes(b.kind)).length;
      return { ok: n >= (p.count ?? 1), text: p.text };
    }
    case 'fronts': return { ok: fronts(s) >= p.count, text: `you own ${p.count} straight businesses` };
    case 'contact': {
      const ok = (p.outside ?? []).some((r) => crew(s).some((c) => c.outside === r && isFree(s, c)) || Object.values(s.characters).some((c) => c.alive && c.outside === r && c.faction === 'player'))
        || owned(s).some((b) => (p.kinds ?? []).includes(b.kind));
      return { ok, text: p.text };
    }
    case 'event': return { ok: p.any.some((e) => (s.dev?.events[e] ?? 0) > 0), text: p.text };
  }
}

export type TierStatus = 'held' | 'available' | 'locked' | 'future';

export interface TierView {
  def: TierDef;
  status: TierStatus;
  /** What opened it ("you hired an experienced bookkeeper"). */
  because: string[];
  /** What is still missing. */
  needs: string[];
  cost: number;
  upkeep: number;
  /** The man who would answer for it. */
  resp?: Character;
  /** How well it would work in his hands (0.6 nobody .. 1.15). */
  eff: number;
  dated: boolean;
}

export function tierView(s: GameState, t: TierDef): TierView {
  const held = tierOf(s, t.path) >= t.tier;
  const checks = t.req.map((r) => ({ r, ...prereqMet(s, r) }));
  const prevOk = t.tier === 1 || tierOf(s, t.path) >= t.tier - 1;
  const needs = checks.filter((c) => !c.ok).map((c) => c.text);
  if (!prevOk && !t.req.some((r) => r.k === 'tier' && r.path === t.path)) needs.unshift(`the step before it on this path`);
  const future = year(s) < t.from;
  const status: TierStatus = held ? 'held' : future ? 'future' : needs.length ? 'locked' : 'available';
  const because = checks.filter((c) => c.ok && c.r.k !== 'tier').map((c) => c.text);
  return { def: t, status, because, needs, cost: eraPrice(t.cost, Math.max(year(s), t.from)), upkeep: t.upkeep, resp: respFor(s, t.path), eff: pathEff(s, t.path), dated: !!t.dated && year(s) > t.dated };
}

export interface PathView { def: (typeof PATHS)[number]; tier: number; tiers: TierView[]; next?: TierView; resp?: Character; eff: number }

export function pathViews(s: GameState): PathView[] {
  return PATHS.map((p) => {
    const tiers = tiersOf(p.id).map((t) => tierView(s, t));
    return { def: p, tier: tierOf(s, p.id), tiers, next: tiers.find((t) => t.status !== 'held'), resp: respFor(s, p.id), eff: pathEff(s, p.id) };
  });
}

/** The opportunities: next tiers the family can take now, with why. */
export function devOpportunities(s: GameState): TierView[] {
  return pathViews(s).map((p) => p.next).filter((t): t is TierView => !!t && t.status === 'available');
}

export function opportunityText(v: TierView): string {
  return v.because.length ? `Available because ${v.because.join(' and ')}.` : `Available since ${v.def.from}.`;
}

/* ------------------------------------------------------------------ */
/* Equipment helpers                                                   */
/* ------------------------------------------------------------------ */

export interface GearOffer { def: (typeof GEAR)[number]; price: number; open: boolean; why?: string }

export function gearOffers(s: GameState): GearOffer[] {
  return GEAR.map((g) => {
    const why = year(s) < g.from ? `Not until about ${g.from}` : g.needs && !heldTier(s, g.needs) ? `Needs ${TIERS.find((t) => t.id === g.needs)!.name.toLowerCase()} (Equipment)` : undefined;
    return { def: g, price: eraPrice(g.cost, year(s)), open: !why, why };
  });
}

function heldTier(s: GameState, id: string): boolean {
  const t = TIERS.find((x) => x.id === id);
  return !!t && tierOf(s, t.path) >= t.tier;
}

export function weeklyUpkeep(s: GameState): { tiers: number; gear: number } {
  const d = s.dev;
  if (!d) return { tiers: 0, gear: 0 };
  let tiers = 0;
  for (const t of TIERS) if (tierOf(s, t.path) >= t.tier) tiers += t.upkeep;
  const gear = d.gear.reduce((a, g) => a + g.n * GEAR_BY_ID[g.cat].upkeep, 0);
  return { tiers, gear: Math.round(gear) };
}

const stackOf = (s: GameState, id: string): GearStack | undefined => s.dev?.gear.find((g) => g.id === id);

export function repairCost(s: GameState, g: GearStack): number {
  const per = eraPrice(GEAR_BY_ID[g.cat].cost, year(s)) * (1 - g.cond) * (tierOf(s, 'gear') >= 2 ? 0.35 : 0.5);
  return Math.max(10, Math.round(per * g.n / 10) * 10);
}

/** Validates the inventory: unique ids, positive counts, every holder real. Exported for the tests. */
export function validateGear(s: GameState): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  const holders = new Set(gearHolders(s));
  for (const g of s.dev?.gear ?? []) {
    if (ids.has(g.id)) errs.push(`stack ${g.id} twice`);
    ids.add(g.id);
    if (!(g.n > 0)) errs.push(`stack ${g.id} has ${g.n} units`);
    if (!holders.has(g.holder)) errs.push(`stack ${g.id} held by ${g.holder}, who has no crew`);
  }
  return errs;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

const P = (title: string, o: Partial<ActionPreview>): ActionPreview => ({ title, effects: [], cost: 0, because: '', category: 'cost', ...o });

export function previewDev(s: GameState, a: DevAction): ActionPreview {
  const label = 'Family development';
  switch (a.t) {
    case 'adopt': {
      const p = PATHS_BY_ID[a.path];
      const next = p ? tiersOf(a.path).find((t) => t.tier === tierOf(s, a.path) + 1) : undefined;
      if (!next) return P('Family development', { disabledReason: 'Nothing further on this path' });
      const v = tierView(s, next);
      const who = (a.who && s.characters[a.who]) || v.resp;
      const block = v.status === 'future' ? `Not until about ${next.from}` : v.status === 'locked' ? `Needs ${v.needs.join('; ')}` : s.money < v.cost ? `Needs ${fmtMoney(v.cost)}` : undefined;
      return P(`${p.label}: ${next.name}`, {
        detail: `${next.effect} ${fmtMoney(v.upkeep)} a week upkeep.${next.catch ? ` ${next.catch}` : ''} ${who ? `${who.firstName} ${who.lastName} answers for it.` : 'Nobody to answer for it: it works at 60%.'}`,
        effects: [{ type: 'money', amount: -v.cost, category: 'cost', label: `${p.label}: ${next.name}` }],
        cost: v.cost, because: `set up ${next.name.charAt(0).toLowerCase()}${next.name.slice(1)}`, disabledReason: block, verb: `Set it up — ${fmtMoney(v.cost)}`,
      });
    }
    case 'drop': {
      const t = tierOf(s, a.path);
      const def = tiersOf(a.path).find((x) => x.tier === t);
      return P(`Give up ${def?.name.toLowerCase() ?? 'it'}`, { detail: `Saves ${fmtMoney(def?.upkeep ?? 0)} a week; what it did stops. Nothing comes back.`, because: `gave up ${def?.name.toLowerCase() ?? 'a development'}`, disabledReason: def ? undefined : 'Nothing to give up', verb: 'Give it up' });
    }
    case 'resp': {
      const c = s.characters[a.who];
      const ok = c && c.alive && c.faction === 'player' && c.id !== s.playerId && isFree(s, c);
      return P(`Put ${c?.firstName ?? '?'} in charge of ${PATHS_BY_ID[a.path]?.label.toLowerCase() ?? '?'}`, { detail: 'He answers for it; how well it works depends on him.', because: `put ${c?.firstName ?? 'a man'} in charge of ${PATHS_BY_ID[a.path]?.label.toLowerCase()}`, disabledReason: ok ? undefined : 'Not one of your free men', verb: 'Put him in charge' });
    }
    case 'buy': {
      const off = gearOffers(s).find((o) => o.def.id === a.cat);
      const n = Math.max(1, Math.min(20, Math.round(a.n)));
      if (!off) return P(label, { disabledReason: 'No such equipment' });
      const cost = off.price * n;
      const heavy = off.def.heat >= 0.3;
      const fx: Effect[] = [{ type: 'money', amount: -cost, category: 'cost', label: `Equipment: ${n} ${off.def.label.toLowerCase()}` }];
      const local = Math.round(off.def.heat * n);
      if (local > 0) fx.push({ type: 'heat', bar: 'local', amount: local, label: 'Arming up: people notice' });
      if (n >= 8 || (a.cat === 'rifles' && n >= 4)) fx.push({ type: 'heat', bar: 'federal', amount: 1, label: 'Arming up: a big order gets noticed' });
      if (heavy && n >= 4) for (const r of s.rivals) if (r.kind === 'mob') fx.push({ type: 'rivalOpinion', rival: r.id, amount: -1, reason: 'Arming up', label: 'Arming up' });
      const holders = gearHolders(s);
      const block = !off.open ? off.why : !holders.includes(a.holder) ? 'That crew is gone' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined;
      return P(`Buy ${n} ${off.def.label.toLowerCase()} for ${holderName(s, a.holder).replace(/^Your own men$/, 'your own men')}`, {
        detail: `${fmtMoney(off.price)} each; ${fmtMoney(Math.round(off.def.upkeep * n))} a week to keep.${heavy ? ' Heavy equipment: more fear on the street, more heat, and the neighborhoods resent it.' : ''}`,
        effects: fx, cost, because: `bought ${n} ${off.def.label.toLowerCase()} for ${holderName(s, a.holder).toLowerCase()}`, disabledReason: block, verb: `Buy — ${fmtMoney(cost)}`,
      });
    }
    case 'assign': {
      const g = stackOf(s, a.stack);
      const n = g ? Math.max(1, Math.min(g.n, a.n ?? g.n)) : 0;
      const block = !g ? 'That equipment is gone' : !gearHolders(s).includes(a.holder) ? 'That crew is gone' : g.holder === a.holder ? 'Already there' : undefined;
      return P(`Move ${n} ${g ? GEAR_BY_ID[g.cat].label.toLowerCase() : ''} to ${holderName(s, a.holder).toLowerCase()}`, { detail: 'It leaves the other crew: one piece, one crew.', because: `moved equipment to ${holderName(s, a.holder).toLowerCase()}`, disabledReason: block, verb: 'Move it', category: 'cost' });
    }
    case 'repair': {
      const g = stackOf(s, a.stack);
      const cost = g ? repairCost(s, g) : 0;
      return P(`Repair ${g ? `${g.n} ${GEAR_BY_ID[g.cat].label.toLowerCase()}` : 'equipment'}`, {
        detail: 'Back to good condition.', effects: g ? [{ type: 'money', amount: -cost, category: 'cost', label: `Equipment repairs` }] : [], cost,
        because: 'had equipment repaired', disabledReason: !g ? 'That equipment is gone' : g.cond >= 0.95 ? 'It is in good shape' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined, verb: `Repair — ${fmtMoney(cost)}`,
      });
    }
    case 'scrap': {
      const g = stackOf(s, a.stack);
      return P(`Get rid of ${g ? `${g.n} ${GEAR_BY_ID[g.cat].label.toLowerCase()}` : 'equipment'}`, { detail: 'Into the bay: no more upkeep, nothing back.', because: 'got rid of equipment', disabledReason: g ? undefined : 'That equipment is gone', verb: 'Get rid of it' });
    }
    case 'mandate': {
      const c = s.characters[a.capo];
      const m = MANDATES[a.level];
      const ok = c && c.alive && c.rank === 'capo' && c.faction === 'player';
      return P(`${c?.firstName ?? '?'}'s mandate on equipment: ${m?.label ?? '?'}`, { detail: m?.text, because: `told ${c?.firstName ?? 'a capo'} how to equip his crew`, disabledReason: !ok ? 'Not one of your capos' : !m ? 'No such mandate' : (s.dev?.mandates[a.capo] ?? 0) === a.level ? 'That is his mandate already' : undefined, verb: 'Tell him' });
    }
  }
}

function newStackId(s: GameState): string {
  return `g${s.nextId++}`;
}

export function commitDev(ctx: Ctx, a: DevAction): void {
  const s = ctx.s;
  const d = ensureDev(s);
  switch (a.t) {
    case 'adopt': {
      const next = tiersOf(a.path).find((t) => t.tier === tierOf(s, a.path) + 1);
      if (!next) return;
      d.tiers[a.path] = next.tier;
      const who = a.who && s.characters[a.who]?.alive ? s.characters[a.who] : respFor(s, a.path);
      if (who) d.resp[a.path] = who.id;
      d.stats.spentTech += tierView(s, next).cost;
      d.seen[next.id] ??= s.week;
      ctx.log.push(`Family development: ${next.name}${who ? ` (${who.firstName} answers for it)` : ''}.`);
      break;
    }
    case 'drop': {
      const t = tierOf(s, a.path);
      if (t > 0) d.tiers[a.path] = t - 1;
      if (!d.tiers[a.path]) delete d.tiers[a.path];
      break;
    }
    case 'resp': d.resp[a.path] = a.who; break;
    case 'buy': {
      const def = GEAR_BY_ID[a.cat];
      const n = Math.max(1, Math.min(20, Math.round(a.n)));
      addGear(s, d, a.cat, n, a.holder, 1);
      d.stats.spentGear += eraPrice(def.cost, year(s)) * n;
      arming(d, a.cat, n);
      break;
    }
    case 'assign': {
      const g = d.gear.find((x) => x.id === a.stack);
      if (!g) return;
      const n = Math.max(1, Math.min(g.n, a.n ?? g.n));
      if (n >= g.n) g.holder = a.holder;
      else {
        g.n -= n;
        d.gear.push({ id: newStackId(s), cat: g.cat, n, cond: g.cond, holder: a.holder, since: s.week });
      }
      mergeGear(d);
      break;
    }
    case 'repair': { const g = d.gear.find((x) => x.id === a.stack); if (g) g.cond = 1; break; }
    case 'scrap': d.gear = d.gear.filter((x) => x.id !== a.stack); break;
    case 'mandate':
      if (a.level) d.mandates[a.capo] = a.level;
      else delete d.mandates[a.capo];
      break;
  }
}

/** Fear and resentment from arming up. */
function arming(d: DevState, cat: GearCat, n: number): void {
  const def = GEAR_BY_ID[cat];
  d.resent = Math.min(100, d.resent + def.resent * n);
  if (def.role === 'weapon') d.fear = Math.min(100, d.fear + n * (def.power - 0.8));
}

function addGear(s: GameState, d: DevState, cat: GearCat, n: number, holder: string, cond: number): void {
  const same = d.gear.find((g) => g.cat === cat && g.holder === holder && Math.abs(g.cond - cond) < 0.05);
  if (same) {
    same.cond = (same.cond * same.n + cond * n) / (same.n + n);
    same.n += n;
  } else d.gear.push({ id: newStackId(s), cat, n, cond, holder, since: s.week });
}

/** Two lots of the same thing in the same crew, in about the same shape, become one. */
function mergeGear(d: DevState): void {
  const out: GearStack[] = [];
  for (const g of d.gear) {
    const m = out.find((x) => x.cat === g.cat && x.holder === g.holder && Math.abs(x.cond - g.cond) < 0.05);
    if (m) { m.cond = (m.cond * m.n + g.cond * g.n) / (m.n + g.n); m.n += g.n; }
    else out.push(g);
  }
  d.gear = out;
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

const LEGIT_KINDS2 = ['bar', 'arcade', 'stand', 'pizza', 'vending'];

/** Clean money the legitimate-business path brings this week. */
export function legitIncome(s: GameState): number {
  const t = tierOf(s, 'legit');
  if (!t) return 0;
  const eff = pathEff(s, 'legit');
  const mine = owned(s).filter((b) => (b.closedUntil ?? 0) <= s.week);
  let v = mine.filter((b) => b.kind === 'motel').length * 35;
  if (t >= 2) v += mine.filter((b) => LEGIT_KINDS2.includes(b.kind)).length * 30;
  if (t >= 3) v += Math.min(12, mine.filter((b) => CATALOG[b.kind]?.category === 'front').length) * 25;
  return Math.round(v * eff);
}

export function devWeek(ctx: Ctx): void {
  const s = ctx.s;
  const d = ensureDev(s);
  const r: RngHolder = d;
  // Things that open tiers.
  if (s.wars.length) d.events.war ??= s.week;
  if ((s.econ?.hq.found ?? 0) > 0) d.events.bug ??= s.week;
  if (s.heat.federal >= 30) d.events.fed30 ??= s.week;
  // The man in charge, re-picked when he is gone.
  for (const p of Object.keys(d.resp) as PathId[]) {
    const c = s.characters[d.resp[p]!];
    if (!c || !c.alive || c.faction !== 'player' || !isFree(s, c)) delete d.resp[p];
  }
  // Equipment held by a crew that is gone goes back to the boss's own men.
  const holders = new Set(gearHolders(s));
  let back = 0;
  for (const g of d.gear) if (!holders.has(g.holder)) { g.holder = 'family'; back += g.n; }
  if (back) { mergeGear(d); ctx.log.push(`Equipment: ${back} piece${back > 1 ? 's' : ''} from a crew that is no more went back to your own men.`); }
  for (const k of Object.keys(d.mandates)) if (s.characters[k]?.rank !== 'capo' || !s.characters[k]?.alive) delete d.mandates[k];

  // Upkeep and what the paths do this week.
  const up = weeklyUpkeep(s);
  const fx: Effect[] = [];
  if (up.tiers) fx.push({ type: 'money', amount: -up.tiers, category: 'cost', label: 'Family development: upkeep' });
  if (up.gear) fx.push({ type: 'money', amount: -up.gear, category: 'cost', label: 'Crew equipment: upkeep' });
  const inc = legitIncome(s);
  if (inc) fx.push({ type: 'money', amount: inc, category: 'business', label: 'Legitimate business: better-run places' });
  if (tierOf(s, 'info') >= 2 && s.heat.federal > 15 && s.week % 2 === 0) fx.push({ type: 'heat', bar: 'federal', amount: -1, label: 'A friend at the phone company: you know which lines to stay off' });
  const sweep = tierOf(s, 'info') >= 3;
  if (!sweep && s.week % 4 === 0) {
    if (tierOf(s, 'comm') >= 4) fx.push({ type: 'heat', bar: 'federal', amount: 1, label: 'Car phones: somebody is listening' });
    if (tierOf(s, 'books') >= 3) fx.push({ type: 'heat', bar: 'federal', amount: 1, label: 'Computer records: a paper trail' });
  }
  if (fx.length) applyEffects(ctx, fx, { label: 'Family development', because: 'kept up the family\'s development', category: 'cost' });
  d.stats.upkeep += up.tiers + up.gear;
  d.stats.income += inc;

  // Dispatch: late loans come in quicker.
  if (tierOf(s, 'wheels') >= 2) for (const l of s.loans) if (l.weeksLate > 0 && rand(r) < 0.25 * pathEff(s, 'wheels')) l.weeksLate -= 1;

  // Wear (twice as fast at war).
  const wear = (s.wars.length ? 2 : 1) * devWearMult(s);
  for (const g of d.gear) g.cond = Math.max(0.05, Math.round((g.cond - GEAR_BY_ID[g.cat].wear * wear) * 1000) / 1000);

  capoPurchases(ctx, d);

  // Fear drifts toward what the street sees; resentment fades.
  const a = crewStrength(s);
  const men = a.crews.reduce((x, c) => x + c.men, 0);
  const armed = a.crews.reduce((x, c) => x + c.gear.armed, 0);
  const heavy = d.gear.filter((g) => g.cat === 'shotguns' || g.cat === 'rifles').reduce((x, g) => x + g.n, 0);
  const target = 10 + 35 * (men ? armed / men : 0) + 10 * Math.min(1, men ? heavy / men : 0) + (s.wars.length ? 8 : 0);
  d.fear = Math.round((d.fear + (target - d.fear) * 0.08) * 10) / 10;
  d.resent = Math.max(0, Math.round((d.resent - 0.5) * 10) / 10);

  // Newly available: said once.
  for (const v of devOpportunities(s)) {
    if (d.seen[v.def.id] !== undefined) continue;
    d.seen[v.def.id] = s.week;
    if (s.week <= 1) continue;
    const text = `New for the family: ${v.def.name} (${PATHS_BY_ID[v.def.path].label}). ${opportunityText(v)}`;
    ctx.log.push(text);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'decision' });
  }

  rivalsDevelop(ctx, d);
}

/** Capos with a mandate keep their men equipped from Family money, within the month's budget. */
function capoPurchases(ctx: Ctx, d: DevState): void {
  const s = ctx.s;
  const mk = monthKey(s.date);
  for (const k of Object.keys(d.spent)) if (!k.endsWith(`:${mk}`)) delete d.spent[k];
  const a = crewStrength(s);
  for (const [capoId, level] of Object.entries(d.mandates)) {
    if (!level) continue;
    const capo = s.characters[capoId];
    const c = a.crews.find((x) => x.holder === capoId);
    if (!capo || !c || !isFree(s, capo)) continue;
    const budget = MANDATES[level].budget;
    const key = `${capoId}:${mk}`;
    const left = budget - (d.spent[key] ?? 0);
    const short = c.men - c.gear.armed;
    if (short <= 0 || left <= 0 || s.money <= 2000) continue;
    const cat: GearCat = level === 2 && gearOffers(s).find((o) => o.def.id === 'rifles')?.open ? 'rifles' : level === 2 ? 'shotguns' : 'handguns';
    const price = eraPrice(GEAR_BY_ID[cat].cost, year(s));
    const n = Math.min(short, Math.floor(left / price), Math.floor((s.money - 2000) / price));
    if (n <= 0) continue;
    const cost = n * price;
    const fx: Effect[] = [{ type: 'money', amount: -cost, category: 'cost', label: `${capo.firstName} equips his crew (his mandate)` }];
    const local = Math.round(GEAR_BY_ID[cat].heat * n);
    if (local) fx.push({ type: 'heat', bar: 'local', amount: local, label: `${capo.firstName} arms up his crew` });
    applyEffects(ctx, fx, { label: `${capo.firstName} equips his crew`, because: `${capo.firstName} bought equipment under his mandate`, category: 'cost' });
    addGear(s, d, cat, n, capoId, 1);
    arming(d, cat, n);
    d.spent[key] = (d.spent[key] ?? 0) + cost;
    d.stats.capoBuys += cost;
    d.stats.spentGear += cost;
    ctx.log.push(`${capo.firstName} ${capo.lastName} bought ${n} ${GEAR_BY_ID[cat].label.toLowerCase()} for his crew (${fmtMoney(cost)} of Family money; ${fmtMoney(budget - d.spent[key])} left of his ${fmtMoney(budget)} this month).`);
  }
}

/* ------------------------------------------------------------------ */
/* The other families                                                  */
/* ------------------------------------------------------------------ */

const HEARD: Record<PathId, string[]> = {
  comm: ['put in a private line and an answering service', 'has radios in its cars', 'gave its capos pagers', 'has telephones in its cars'],
  books: ['hired a real bookkeeper', 'has an accounting staff now', 'keeps its books on a computer'],
  wheels: ['bought new cars', 'set up a garage with a dispatcher', 'runs its own fleet'],
  gear: ['keeps its equipment in one place now', 'found a quiet supplier', 'is buying protective gear'],
  info: ['keeps a card file on people', 'has a friend at the phone company', 'sweeps for bugs'],
  legit: ['is running its motels properly', 'put new vending machines on a route', 'set up a warehouse'],
};

/** How much a family wants each path (its goal and its boss). */
function rivalWant(s: GameState, rv: Rival, p: PathId): number {
  const g = rv.goal;
  const lead = s.characters[rv.leaderId];
  let w = 1;
  if (p === 'wheels' || p === 'gear') w = g === 'conquer' || g === 'revenge' ? 2 : g === 'squeeze' ? 1.3 : 0.8;
  if (p === 'books' || p === 'legit') w = g === 'enrich' || g === 'legitimacy' ? 2 : 0.8;
  if (p === 'info') w = g === 'survive' ? 2 : 1;
  if (lead?.traits.includes('Paranoid') && p === 'info') w *= 1.8;
  if (lead?.traits.includes('Greedy') && (p === 'books' || p === 'legit')) w *= 1.4;
  if (lead?.traits.includes('Hot-headed') && p === 'gear') w *= 1.4;
  return w;
}

const GEAR_WANT: Record<string, number> = { conquer: 1, revenge: 1, squeeze: 0.85, enrich: 0.6, legitimacy: 0.5, survive: 0.65, headline: 0 };

function hearIt(ctx: Ctx, d: DevState, rv: Rival, what: string): void {
  const s = ctx.s;
  const ears = Object.values(s.ears?.ears ?? {}).some((e) => e.known && e.status !== 'gone');
  // Without ears or a card file, half of it never reaches you.
  if (!ears && tierOf(s, 'info') === 0 && rand(d) < 0.5) return;
  const via = ears ? 'the Ears' : 'the street';
  const text = `The ${rv.shortName} crew ${what}.`;
  d.heard.push({ week: s.week, rival: rv.id, text, via });
  if (d.heard.length > 24) d.heard = d.heard.slice(-24);
  ctx.log.push(`Word from ${via}: ${text}`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `Word from ${via}: ${text}`, kind: 'rival' });
}

function rivalsDevelop(ctx: Ctx, d: DevState): void {
  const s = ctx.s;
  for (const rv of s.rivals) {
    if (rv.kind !== 'mob' || !s.characters[rv.leaderId]?.alive) continue;
    const rd = d.rivals[rv.id];
    if (!rd) continue;
    rd.cond = Math.max(0.1, Math.round((rd.cond - 0.003 * (rv.war ? 2 : 1)) * 1000) / 1000);
    // Legitimate and book-keeping development pays a little.
    const earn = 25 * (rd.tiers.legit ?? 0) + 15 * (rd.tiers.books ?? 0);
    if (earn) rv.money += earn;
    // Worn equipment replaced.
    if (rd.cond < 0.55 && rv.money > 4000 && rand(d) < 0.12) {
      rv.money -= 900;
      rd.cond = 0.95;
      hearIt(ctx, d, rv, 'replaced its worn equipment');
      continue;
    }
    // More equipment, by temper and money.
    const want = GEAR_WANT[rv.goal] ?? 0.6;
    if (rd.gear < want && rv.money > 5000 && rand(d) < 0.05 * (rv.war ? 3 : 1)) {
      rv.money -= 1500;
      rd.gear = Math.round(Math.min(1.2, rd.gear + 0.15) * 100) / 100;
      rd.cond = Math.min(1, (rd.cond + 1) / 2);
      rv.exposure = Math.min(100, rv.exposure + 2);
      hearIt(ctx, d, rv, rd.gear >= 0.9 ? 'is buying heavy equipment' : 'is buying equipment for its men');
      continue;
    }
    // One step on one path at most a week.
    const opts: { p: PathId; t: TierDef; w: number }[] = [];
    for (const p of PATHS) {
      const cur = rd.tiers[p.id] ?? 0;
      const t = tiersOf(p.id).find((x) => x.tier === cur + 1);
      if (!t || year(s) < t.from + (rd.lag[p.id] ?? 0)) continue;
      if (rv.money < t.cost * 1.5 + 2000) continue;
      opts.push({ p: p.id, t, w: rivalWant(s, rv, p.id) });
    }
    if (!opts.length) continue;
    const tot = opts.reduce((x, o) => x + o.w, 0);
    if (rand(d) >= 0.015 * tot) continue;
    let roll = rand(d) * tot;
    const pick = opts.find((o) => (roll -= o.w) < 0) ?? opts[opts.length - 1];
    rv.money -= pick.t.cost;
    rd.tiers[pick.p] = pick.t.tier;
    hearIt(ctx, d, rv, HEARD[pick.p][pick.t.tier - 1] ?? `took up ${pick.t.name.toLowerCase()}`);
  }
}

/** What the other families have, as far as you know (heard), and what they really have (for tests). */
export function rivalDevOf(s: GameState, id: RivalId): RivalDev | undefined {
  return s.dev?.rivals[id];
}

/* ------------------------------------------------------------------ */
/* The adviser's words                                                 */
/* ------------------------------------------------------------------ */

/** Who should be asked about a development order: the man in charge of it (bagman for the books, a capo for gear). */
export function devAdviserIds(s: GameState, a: DevAction): string[] {
  const out: string[] = [];
  const add = (c: Character | undefined) => { if (c && c.alive && c.faction === 'player' && c.id !== s.playerId && isFree(s, c) && !out.includes(c.id)) out.push(c.id); };
  if (a.t === 'adopt' || a.t === 'drop' || a.t === 'resp') add(respFor(s, a.path));
  if (a.t === 'buy' || a.t === 'assign') {
    const h = a.holder !== 'family' ? s.characters[a.holder] : undefined;
    add(h);
    add(respFor(s, 'gear'));
  }
  if (a.t === 'mandate') add(s.characters[a.capo]);
  return out;
}

/** Lines for the briefing: what it does, what it costs to keep, what is in the way. */
export function devBriefLines(s: GameState, a: DevAction): { does: string[]; needs: string[]; catches: string[] } {
  const does: string[] = [];
  const needs: string[] = [];
  const catches: string[] = [];
  if (a.t === 'adopt') {
    const next = tiersOf(a.path).find((t) => t.tier === tierOf(s, a.path) + 1);
    if (next) {
      const v = tierView(s, next);
      does.push(next.effect);
      needs.push(`${fmtMoney(v.upkeep)} a week, every week, on top of ${fmtMoney(v.cost)} up front`);
      if (v.status === 'available' && v.because.length) needs.push(opportunityText(v));
      for (const n of v.needs) needs.push(`Still needs: ${n}`);
      if (next.catch) catches.push(next.catch);
      if (!v.resp) catches.push('Nobody to answer for it: it would run at 60%');
    }
  }
  if (a.t === 'buy') {
    const st = crewStrength(s);
    const c = st.crews.find((x) => x.holder === a.holder);
    if (c) {
      const free = c.men - c.gear.armed;
      does.push(free > 0 ? `${c.name}: ${free} of ${c.men} men have no equipment; up to ${free} pieces make them tougher` : `${c.name}: every man already has something; more only helps if it is better or the old is worn`);
      if (a.n > Math.max(0, free) && GEAR_BY_ID[a.cat].role === 'weapon') catches.push(`${a.n - Math.max(0, free)} of these would sit unused: more than the men can carry adds nothing`);
    }
    if (GEAR_BY_ID[a.cat].heat >= 0.3) catches.push('Heavy equipment: the police notice, the neighborhoods resent it, the other families take it as a message');
    needs.push(`${fmtMoney(Math.round(GEAR_BY_ID[a.cat].upkeep * a.n))} a week to keep`);
  }
  return { does, needs, catches };
}

