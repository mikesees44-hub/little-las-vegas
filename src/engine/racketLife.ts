import { availableIn, CATALOG } from './catalog';
import { countKind, expectedTake, idleMen, isOpen, newBusiness, owned, playerSlots, staffNeed } from './business';
import { crew, displayName, isFree } from './characters';
import { ensureEcon } from './econState';
import { addEvidence } from './hierarchy';
import { heat, money, respect, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { chance, hashSeed, rand, randInt, type RngHolder } from './rng';
import { RACKETS, r50, racketInfo, type Fit, type RacketInfo, type SitCtx, type Situation } from './racketData';
import type { Dial, DialOpt, RacketCmd, RacketOp, RacketOutcome } from './racketState';
import { racketOf, racketMut, applyTreeHeat } from './rackets';
import { dressScene, registerFamily, sceneCtx } from './sceneVariants';
import type { ActionPreview } from './actions';
import type { Business, BusinessKind, Character, Effect, EventInstance, GameState, PlayerAction } from './types';

/**
 * THE LIVING RACKETS. Every racket is a small system with its own standing
 * decisions ("dials": the numbers bank's reserve, whether the book lays off
 * to Philadelphia, who the shylock lends to, whether the card game has a
 * mechanic...) and its own situations (a heavily played number, a fixed-game
 * rumor, a borrower who cannot pay, a union election, a city tender, a
 * score with odds). Dials move the take, the heat, the raid odds and a few
 * racket-specific knobs; situations come through the shared popup pipeline,
 * told as a fresh scene each time, and every gamble shows its odds as a chip.
 *
 * The player never runs women: the old "call service" is now the Madam's
 * arrangement (the family protects her independent network for a cut — the
 * Ears' Madam, ears.ts). Old saves are migrated by migrateVice().
 *
 * Dice: the layer uses the econ layer's own dice, and a hashed roll to offer
 * situations, so the rest of the game's stream is untouched.
 */

export const SIT_GAP = 10; // weeks between situations at one racket
export const SIT_GLOBAL_GAP = 3; // weeks between racket situations at all
export const SIT_CHANCE = 0.4;

/* ------------------------------------------------------------------ */
/* Dials                                                               */
/* ------------------------------------------------------------------ */

export function dialsOf(kind: BusinessKind): Dial[] {
  return racketInfo(kind)?.dials ?? [];
}

/** The option set for one dial at one racket (default when never set). */
export function dialOf(s: GameState, b: Business, id: string): string {
  const d = dialsOf(b.kind).find((x) => x.id === id);
  return racketOf(s, b).dials?.[id] ?? d?.def ?? '';
}

export function optOf(s: GameState, b: Business, d: Dial): DialOpt {
  const id = dialOf(s, b, d.id);
  return d.opts.find((o) => o.id === id) ?? d.opts.find((o) => o.id === d.def) ?? d.opts[0];
}

export function chosenOpts(s: GameState, b: Business): DialOpt[] {
  return dialsOf(b.kind).map((d) => optOf(s, b, d));
}

/** Income multiplier from the dials and any temporary boost (1 = as set). Pure. */
export function dialIncome(s: GameState, b: Business): number {
  let m = 1 + chosenOpts(s, b).reduce((a, o) => a + (o.income ?? 0), 0);
  const bo = racketOf(s, b).boost;
  if (bo && bo.until > s.week) m += bo.pct / 100;
  return Math.max(0.3, m);
}

export function dialHeat(s: GameState, b: Business): number {
  return Math.max(0.2, 1 + chosenOpts(s, b).reduce((a, o) => a + (o.heat ?? 0), 0));
}

export function dialRaid(s: GameState, b: Business): number {
  return chosenOpts(s, b).reduce((a, o) => a * (o.raid ?? 1), 1);
}

/** A racket-specific knob: the product of what the dials set (1 when none does). */
export function dialK(s: GameState, b: Business, key: string, d = 1): number {
  let m = d;
  let seen = false;
  for (const o of chosenOpts(s, b)) {
    const v = o.k?.[key];
    if (v === undefined) continue;
    m = seen ? m * v : v;
    seen = true;
  }
  return m;
}

/** The first open book of a kind (the shylock book's terms, ...). */
export function firstOf(s: GameState, kind: BusinessKind): Business | undefined {
  return owned(s).find((b) => b.kind === kind && isOpen(s, b));
}

/** Shylock terms from the book's dials: vig and risk on new loans, collection pressure on all. */
export function shylockTerms(s: GameState): { vig: number; risk: number; collect: number } {
  const b = firstOf(s, 'loansharking');
  if (!b || !s.econ) return { vig: 1, risk: 1, collect: 1 };
  return { vig: dialK(s, b, 'vig'), risk: dialK(s, b, 'risk'), collect: dialK(s, b, 'collect') };
}

/** Scores per week for a crew that works by the score (jewel, bank). */
export function paceOf(s: GameState, b: Business): number {
  return s.econ ? dialK(s, b, 'pace') : 1;
}

/** Share of the blackmail ring's favors that still come (1 = favors, 0.3 = cash). */
export function favorShare(s: GameState, b: Business): number {
  return s.econ ? dialK(s, b, 'favor') : 1;
}

/** Weekly cost of the dials across every racket (pads, the hall, the inspector). */
export function dialCosts(s: GameState): { b: Business; o: DialOpt; d: Dial }[] {
  const out: { b: Business; o: DialOpt; d: Dial }[] = [];
  for (const b of owned(s)) for (const d of dialsOf(b.kind)) { const o = optOf(s, b, d); if (o.weekly) out.push({ b, o, d }); }
  return out;
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

const E = (s: GameState): RngHolder => ensureEcon(s);
function bump(s: GameState, k: 'rkSits' | 'rkRolls' | 'rkWins' | 'rkStarts' | 'rkDials'): void {
  const st = ensureEcon(s).stats;
  st[k] = (st[k] ?? 0) + 1;
}

/** Weekly: the dials' bills, federal interest, Philadelphia's mood, the mechanic, the Madam's protection heat. */
export function racketLifeWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.econ) return;
  migrateVice(s, ctx);
  for (const { b, o, d } of dialCosts(s)) {
    if (!isOpen(s, b)) continue;
    money(ctx, -o.weekly!, `${d.name}: ${o.label.toLowerCase()} (${b.name})`, 'cost');
  }
  let fed = 0;
  for (const b of owned(s)) {
    if (!isOpen(s, b)) continue;
    for (const o of chosenOpts(s, b)) fed += o.fed ?? 0;
    // A mechanic's hands are seen, sooner or later.
    if (b.kind === 'cardgame' && dialOf(s, b, 'mechanic') === 'mechanic' && chance(E(s), dialK(s, b, 'caught', 0))) {
      b.closedUntil = s.week + 3;
      respect(ctx, -2, `${b.name}: a player saw the mechanic's hands`, 'event');
      heat(ctx, 'local', 2, `${b.name}: a crooked game, talked about`, 'heat');
      ctx.log.push(`A player caught the mechanic at ${b.name}. The game is shut for three weeks.`);
    }
  }
  s.flags.rkFed = (s.flags.rkFed ?? 0) + fed;
  if (s.flags.rkFed >= 1) {
    const w = Math.floor(s.flags.rkFed);
    s.flags.rkFed -= w;
    heat(ctx, 'federal', w, 'Federal interest: how your rackets are run (the fund, the routes, the points)', 'heat');
  }
  // The Madam's arrangement: the family protects her houses, and the vice squad knows whose they are.
  const M = s.ears?.madam;
  if (M && s.characters[M.id]?.alive && M.cut > 0 && !M.ally && (M.cutPausedUntil ?? 0) <= s.week) {
    s.flags.rkVice = (s.flags.rkVice ?? 0) + 0.05 * M.cut;
    if (s.flags.rkVice >= 1) {
      s.flags.rkVice -= 1;
      heat(ctx, 'local', 1, `The Madam's arrangement: the vice squad watches whose houses you protect`, 'heat');
    }
  }
  // Monthly: Philadelphia's mood, the numbers players drifting, a contractor's favor.
  if (s.date.d <= 7) {
    const ph = s.rivals.find((r) => r.id === 'philly');
    for (const b of owned(s)) {
      const p = chosenOpts(s, b).reduce((a, o) => a + (o.philly ?? 0), 0);
      if (p && ph && s.characters[ph.leaderId]?.alive) addOpinion(s, ph.leaderId, s.playerId, 'Sends business our way', p, 0);
      if (b.kind === 'numbers') {
        const pl = dialK(s, b, 'players', 0);
        if (pl && chance(E(s), 0.35)) {
          const r = racketMut(s, b);
          r.runners = Math.max(2, Math.min(20, (r.runners ?? 6) + pl));
        }
      }
      if (b.kind === 'loansharking' && dialK(s, b, 'favor', 0) && chance(E(s), 0.15)) {
        s.favors += 1;
        ctx.log.push(`A contractor the book carried did the family a favor at City Hall.`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Situations                                                          */
/* ------------------------------------------------------------------ */

/** A week's good take: the money scale of a racket's situations. */
export function sitScale(s: GameState, b: Business): number {
  const info = racketInfo(b.kind);
  const base = info?.scale ?? b.weeklyBase * CATALOG[b.kind].season[0] * 0.8;
  return Math.max(120, r50(base * Math.min(2, 1 + 0.15 * racketOf(s, b).tier)));
}

export function sitCtx(s: GameState, b: Business): SitCtx {
  const r = racketOf(s, b);
  const runner = (b.staffIds ?? []).map((id) => s.characters[id]).find((c): c is Character => !!c?.alive);
  const d = s.districts.find((x) => x.id === b.districtId);
  const capo = d?.capoId ? s.characters[d.capoId] : undefined;
  return {
    s, b, t: sitScale(s, b), runner, capo: capo?.alive ? capo : undefined,
    dial: (id) => dialOf(s, b, id),
    v: (key, dv = 0) => {
      const rec = r as unknown as Record<string, unknown>;
      const x = r.vars?.[key] ?? rec[key];
      return typeof x === 'number' ? x : dv;
    },
    owns: (k) => owned(s).some((x) => x.kind === k),
  };
}

let familiesReady = false;
/** The situations' scenes, registered with the scene director (lazily, to stay out of import cycles). */
export function ensureRacketFamilies(): void {
  if (familiesReady) return;
  familiesReady = true;
  for (const info of Object.values(RACKETS)) {
    if (!info) continue;
    for (const sit of info.sits) {
      const id = sitDefId(info.kind, sit.id);
      registerFamily({
        id,
        match: (ev) => ev.defId === id,
        scenes: sit.scenes.map((sc) => ({
          when: sc.when ? (c) => { const x = ctxOfEv(c.s, c.ev); return !!x && sc.when!(c, x); } : undefined,
          title: (c) => sc.title(c, ctxOfEv(c.s, c.ev)!),
          text: (c) => sc.text(c, ctxOfEv(c.s, c.ev)!),
        })),
      });
    }
  }
}

function ctxOfEv(s: GameState, ev: EventInstance): SitCtx | undefined {
  const b = s.businesses.find((x) => x.id === ev.meta?.biz);
  return b ? sitCtx(s, b) : undefined;
}

export const sitDefId = (kind: BusinessKind, sit: string) => `rk_${kind}_${sit}`;

/** Every situation that may happen at a racket now. */
export function openSits(s: GameState, b: Business): Situation[] {
  const info = racketInfo(b.kind);
  if (!info || !isOpen(s, b)) return [];
  const x = sitCtx(s, b);
  return info.sits.filter((st) => !st.when || st.when(x));
}

/** At most one racket situation a week, offered to the shared popup pipeline. */
export function racketEventSource(s: GameState): EventInstance | undefined {
  if (!s.econ) return undefined;
  ensureRacketFamilies();
  // The gap counts from the last racket scene the boss actually saw (one crowded out does not count).
  const seen = (s.director?.hist ?? []).filter((h) => h[1].startsWith('rk_')).pop()?.[0] ?? -99;
  if (s.week - seen < SIT_GLOBAL_GAP) return undefined;
  const h = { rng: hashSeed(`${s.seed}:rk:${s.week}`) };
  if (rand(h) > SIT_CHANCE) return undefined;
  const due = owned(s).filter((b) => racketInfo(b.kind) && s.week - (racketOf(s, b).sitWeek ?? b.boughtWeek ?? 0) >= SIT_GAP && openSits(s, b).length);
  if (!due.length) return undefined;
  const b = due[Math.floor(rand(h) * due.length)];
  const sits = openSits(s, b);
  const tot = sits.reduce((a, x) => a + (x.weight ?? 1), 0);
  let roll = rand(h) * tot;
  const sit = sits.find((x) => (roll -= x.weight ?? 1) <= 0) ?? sits[0];
  const ev = buildSitEvent(s, b, sit);
  if (!ev) return undefined;
  racketMut(s, b).sitWeek = s.week;
  s.flags.rkSit = s.week;
  bump(s, 'rkSits');
  return ev;
}

export function buildSitEvent(s: GameState, b: Business, sit: Situation): EventInstance | undefined {
  ensureRacketFamilies();
  const x = sitCtx(s, b);
  let choices;
  try { choices = sit.choices(x); } catch { return undefined; }
  if (!choices.length) return undefined;
  const ev: EventInstance = {
    iid: `ev${s.nextId++}`, defId: sitDefId(b.kind, sit.id), title: b.name, text: '', week: s.week,
    mandatory: false, priority: 44, choices, defaultChoiceId: sit.def,
    meta: { theme: 'business', biz: b.id, sit: sit.id },
    actors: x.runner ? [x.runner.id] : undefined,
  };
  if (!dressScene(s, ev)) {
    const sc = sit.scenes[0];
    const c = sceneCtx(s, ev, ev.defId);
    ev.title = sc.title(c, x);
    ev.text = sc.text(c, x);
  }
  if (!ev.choices.some((c) => c.id === ev.defaultChoiceId && !c.disabledReason)) ev.defaultChoiceId = (ev.choices.find((c) => !c.disabledReason) ?? ev.choices[0]).id;
  return ev;
}

/* ------------------------------------------------------------------ */
/* Effect ops                                                          */
/* ------------------------------------------------------------------ */

const fmt = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

export function outcomeText(o: RacketOutcome): string {
  const p: string[] = [];
  if (o.money) p.push(`${o.money > 0 ? '+' : '−'}${fmt(o.money)}`);
  if (o.heat) p.push(`heat ${o.heat > 0 ? '+' : ''}${o.heat}`);
  if (o.fed) p.push(`federal heat +${o.fed}`);
  if (o.evidence) p.push(`evidence on you +${o.evidence}`);
  if (o.respect) p.push(`respect ${o.respect > 0 ? '+' : ''}${o.respect}`);
  if (o.philly) p.push(`Philadelphia ${o.philly > 0 ? '+' : ''}${o.philly}`);
  if (o.close) p.push(`padlocked ${o.close} wks`);
  if (o.jail) p.push('a man arrested');
  if (o.boost) p.push(`take ${o.boost[0] > 0 ? '+' : ''}${o.boost[0]}% for ${o.boost[1]} wks`);
  if (o.favor) p.push(`+${o.favor} favor`);
  if (o.v) p.push(`${o.v[0]} ${o.v[1] > 0 ? '+' : ''}${o.v[1]}`);
  return p.length ? p.join(', ') : 'nothing happens';
}

export function describeRacketOp(s: GameState, op: RacketOp): string {
  const b = s.businesses.find((x) => x.id === op.bizId);
  switch (op.cmd) {
    case 'roll': return `${Math.round(op.p * 100)}%: ${outcomeText(op.win)} · else (${Math.round((1 - op.p) * 100)}%): ${outcomeText(op.lose)}`;
    case 'boost': return `${b?.name ?? 'The racket'}: take ${op.pct > 0 ? '+' : ''}${op.pct}% for ${op.weeks} wks`;
    case 'var': return `${op.key} ${op.amount > 0 ? '+' : ''}${op.amount}`;
    case 'dial': {
      const d = b ? dialsOf(b.kind).find((x) => x.id === op.dial) : undefined;
      const o = d?.opts.find((x) => x.id === op.opt);
      return `${d?.name ?? 'Set'}: ${o?.label ?? op.opt}${o ? ` (${optEffects(o)})` : ''}`;
    }
  }
}

/** One option's effects in words: "take +8%, heat −20%, $60/wk". */
export function optEffects(o: DialOpt): string {
  const p: string[] = [];
  if (o.income) p.push(`take ${o.income > 0 ? '+' : '−'}${Math.round(Math.abs(o.income) * 100)}%`);
  if (o.heat) p.push(`heat ${o.heat > 0 ? '+' : '−'}${Math.round(Math.abs(o.heat) * 100)}%`);
  if (o.raid && o.raid < 1) p.push(`raids ×${o.raid}`);
  if (o.weekly) p.push(`${fmt(o.weekly)}/wk`);
  if (o.fed) p.push('federal interest');
  if (o.philly) p.push('Philadelphia likes it');
  if (o.risk) p.push(o.risk);
  return p.length ? p.join(', ') : 'as usual';
}

export function applyRacketOp(ctx: Ctx, op: RacketOp, label: string): void {
  const s = ctx.s;
  const b = s.businesses.find((x) => x.id === op.bizId && x.owner === 'player');
  if (!b) return;
  const r = racketMut(s, b);
  switch (op.cmd) {
    case 'roll': {
      const won = chance(E(s), op.p);
      const o = won ? op.win : op.lose;
      bump(s, 'rkRolls');
      if (won) bump(s, 'rkWins');
      applyOutcome(ctx, b, o, `${b.name}: ${op.what}`);
      ctx.log.push(`${b.name}: ${o.text}`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${b.name}: ${o.text}`, kind: 'misc' });
      break;
    }
    case 'boost': r.boost = { pct: op.pct, until: s.week + op.weeks }; break;
    case 'var': {
      const rec = r as unknown as Record<string, number>;
      if (['runners', 'contacts', 'markers', 'bank', 'placements', 'competition'].includes(op.key)) rec[op.key] = Math.max(0, (rec[op.key] ?? 0) + op.amount);
      else (r.vars ??= {})[op.key] = (r.vars[op.key] ?? 0) + op.amount;
      break;
    }
    case 'dial': {
      (r.dials ??= {})[op.dial] = op.opt;
      bump(s, 'rkDials');
      applyTreeHeat(s, b);
      break;
    }
  }
  void label;
}

function applyOutcome(ctx: Ctx, b: Business, o: RacketOutcome, label: string): void {
  const s = ctx.s;
  if (o.money) money(ctx, o.money, `${label}: ${o.money > 0 ? 'came good' : 'went wrong'}`, 'business');
  if (o.heat) heat(ctx, 'local', o.heat, label, 'heat');
  if (o.fed) heat(ctx, 'federal', o.fed, label, 'heat');
  if (o.respect) respect(ctx, o.respect, label, 'event');
  if (o.evidence) addEvidence(s, s.characters[s.playerId], o.evidence);
  if (o.philly) {
    const ph = s.rivals.find((x) => x.id === 'philly');
    if (ph && s.characters[ph.leaderId]?.alive) addOpinion(s, ph.leaderId, s.playerId, o.philly > 0 ? 'Did right by us' : 'Embarrassed us', o.philly, 1);
  }
  if (o.close) b.closedUntil = Math.max(b.closedUntil ?? 0, s.week + o.close);
  if (o.jail) {
    const men = (b.staffIds ?? []).map((id) => s.characters[id]).filter((c): c is Character => !!c && isFree(s, c));
    const m = men.length ? men[randInt(E(s), 0, men.length - 1)] : undefined;
    if (m) {
      m.imprisonedUntil = s.week + randInt(E(s), 20, 45);
      m.record = (m.record ?? 0) + 1;
      ctx.log.push(`${displayName(m)} was arrested (${b.name}).`);
    }
  }
  if (o.boost) racketMut(s, b).boost = { pct: o.boost[0], until: s.week + o.boost[1] };
  if (o.v) applyRacketOp(ctx, { op: 'racket', cmd: 'var', bizId: b.id, key: o.v[0], amount: o.v[1] }, label);
  if (o.favor) s.favors = Math.max(0, s.favors + o.favor);
}

/* ------------------------------------------------------------------ */
/* Starting a racket: the best district, the best man                  */
/* ------------------------------------------------------------------ */

const FIT_OF = (kind: BusinessKind): Fit => racketInfo(kind)?.fit ?? 'business';

/** The man best suited to run a racket: idle, not jailed, with the racket's attribute. */
export function bestRunner(s: GameState, kind: BusinessKind): Character | undefined {
  const fit = FIT_OF(kind);
  return idleMen(s).sort((a, b) => b.attributes[fit] - a.attributes[fit] || (a.id < b.id ? -1 : 1))[0];
}

/** The best district to open a racket in: a free storefront, the most control, a capo in place. */
export function bestDistrict(s: GameState, kind: BusinessKind): string | undefined {
  const def = CATALOG[kind];
  const score = (id: string) => {
    const d = s.districts.find((x) => x.id === id)!;
    const capo = d.capoId && s.characters[d.capoId]?.alive ? 30 : 0;
    const same = owned(s).filter((b) => b.districtId === id && b.kind === kind).length * 15;
    return (d.influence.player ?? 0) + capo - same;
  };
  return s.districts.filter((d) => (d.influence.player ?? 0) >= 20 && (def.category === 'property' || (() => { const sl = playerSlots(s, d.id); return sl.used < sl.max; })()))
    .map((d) => d.id).sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1))[0];
}

/** Every reason a racket cannot be started now, each with how to fix it. */
export function startLocks(s: GameState, kind: BusinessKind): { why: string; how: string }[] {
  const def = CATALOG[kind];
  const info = racketInfo(kind);
  const out: { why: string; how: string }[] = [];
  if (def.hidden && kind !== 'vice') out.push({ why: 'Not for sale', how: 'It comes from the story.' });
  if (!availableIn(kind, s.date.y)) out.push({ why: `Not before ${def.minYear}`, how: 'Wait for the times to change.' });
  if (countKind(s, kind) >= (def.max ?? 3)) out.push({ why: `You already run ${def.max ?? 3}`, how: 'Upgrade the ones you have.' });
  if (s.money < def.cost) out.push({ why: `Needs ${fmt(def.cost)} (you have ${fmt(Math.max(0, s.money))})`, how: 'Wait for the season\'s money, or sell something slow.' });
  if (!bestDistrict(s, kind)) out.push({ why: 'No free storefront in a district you hold 20% of', how: 'Push into a district (Holdings › a district on the map) or take more of one you have.' });
  if (info?.respect && s.respect < info.respect) out.push({ why: `Needs respect ${info.respect} (you have ${Math.round(s.respect)})`, how: 'The people involved deal only with a real power: win disputes, make men, keep the envelope full.' });
  if (info?.blessing !== undefined) {
    const ph = s.rivals.find((r) => r.id === 'philly');
    const op = ph && s.characters[ph.leaderId]?.alive ? opinion(s, ph.leaderId, s.playerId) : 0;
    if (op < info.blessing) out.push({ why: `Needs the Table's blessing: Philadelphia thinks ${op} of you (needs ${info.blessing})`, how: 'Pay the envelope in full, send a gift, lay bets off to Philadelphia.' });
  }
  if (kind === 'narcotics' && s.edicts?.nojunk) out.push({ why: 'Your own edict bans narcotics', how: 'You would have to lift it.' });
  return out;
}

function noop(title: string, why: string): ActionPreview {
  return { title, detail: why, effects: [], cost: 0, because: title, disabledReason: why, category: 'event' };
}

export function previewRacket(s: GameState, cmd: RacketCmd): ActionPreview {
  switch (cmd.c) {
    case 'start': {
      const def = CATALOG[cmd.kind];
      const district = cmd.district ?? bestDistrict(s, cmd.kind);
      const d = s.districts.find((x) => x.id === district);
      const b = newBusiness(s, cmd.kind, district ?? s.districts[0].id);
      const man = bestRunner(s, cmd.kind);
      const locks = startLocks(s, cmd.kind);
      const label = `Start: ${def.name}${d ? ` in ${d.name}` : ''}`;
      const effects: Effect[] = [{ type: 'money', amount: -def.cost, label }, { type: 'addBusiness', business: b, label }];
      effects.push({ type: 'econ', op: { op: 'note', text: man ? `${displayName(man)} runs it (best ${FIT_OF(cmd.kind)} among your free men)` : `No free man to run it: it limps at 40% until one is` }, label });
      if (cmd.kind === 'narcotics') effects.push({ type: 'schedule', key: 'narcotics_rumor', minWeeks: 3, maxWeeks: 8, chance: 0.35, hint: 'word may reach Philadelphia', label });
      const capo = d?.capoId ? s.characters[d.capoId] : undefined;
      return {
        title: label,
        detail: `${racketInfo(cmd.kind)?.line ?? def.blurb} ~${fmt(def.base * def.season[0])}/wk in season, ${fmt(def.base * def.season[1])} off · upkeep ${fmt(def.upkeep)}/wk${capo?.alive ? ` · under ${capo.firstName} ${capo.lastName}` : ''}.`,
        effects, cost: def.cost, because: `started ${b.name}`, disabledReason: locks[0]?.why, category: 'event',
      };
    }
    case 'dial': {
      const b = s.businesses.find((x) => x.id === cmd.bizId && x.owner === 'player');
      if (!b) return noop('Set', 'Not yours');
      const d = dialsOf(b.kind).find((x) => x.id === cmd.dial);
      const o = d?.opts.find((x) => x.id === cmd.opt);
      if (!d || !o) return noop('Set', 'No such choice');
      const label = `${b.name}: ${o.label.toLowerCase()}`;
      return {
        title: `${b.name} — ${d.name}: ${o.label}`, detail: o.blurb,
        effects: [{ type: 'econ', op: { op: 'racket', cmd: 'dial', bizId: b.id, dial: d.id, opt: o.id }, label }],
        cost: 0, because: `set ${b.name} to ${o.label.toLowerCase()}`,
        disabledReason: dialOf(s, b, d.id) === o.id ? 'That is how it runs now' : undefined, category: 'event',
      };
    }
    case 'advice': {
      const b = s.businesses.find((x) => x.id === cmd.bizId && x.owner === 'player');
      if (!b) return noop('Take the advice', 'Not yours');
      const adv = adviseDials(s, b);
      const changes = adv.filter((a) => dialOf(s, b, a.dial.id) !== a.opt.id);
      return {
        title: `${b.name}: take the advice`, detail: changes.map((a) => `${a.dial.name}: ${a.opt.label} — ${a.why}`).join(' · ') || 'It already runs the way your people would run it.',
        effects: changes.map((a) => ({ type: 'econ', op: { op: 'racket', cmd: 'dial', bizId: b.id, dial: a.dial.id, opt: a.opt.id }, label: b.name }) as Effect),
        cost: 0, because: `took your people's advice on ${b.name}`, disabledReason: changes.length ? undefined : 'Nothing to change', category: 'event',
      };
    }
  }
}

export function commitRacket(ctx: Ctx, cmd: RacketCmd): void {
  const s = ctx.s;
  if (cmd.c !== 'start') return;
  // The newest of its kind, opened this week: give it the best-fit man.
  const b = [...owned(s)].reverse().find((x) => x.kind === cmd.kind && x.boughtWeek === s.week);
  if (!b) return;
  racketMut(s, b);
  bump(s, 'rkStarts');
  const need = staffNeed(b);
  while ((b.staffIds ?? []).length < need) {
    const m = bestRunner(s, cmd.kind);
    if (!m) break;
    (b.staffIds ??= []).push(m.id);
    ctx.log.push(`${displayName(m)} now runs ${b.name}.`);
  }
}

/** What your people would set: cool it when the heat is up, squeeze it when money is short, otherwise the usual. */
export function adviseDials(s: GameState, b: Business): { dial: Dial; opt: DialOpt; why: string }[] {
  const hot = s.heat.local >= 55 || s.heat.federal >= 45;
  const broke = s.money < 3000;
  const rich = s.money > 40000;
  return dialsOf(b.kind).map((d) => {
    const safest = [...d.opts].sort((a, c) => (a.heat ?? 0) + (a.fed ?? 0) * 5 - (c.heat ?? 0) - (c.fed ?? 0) * 5)[0];
    const richest = [...d.opts].filter((o) => !o.weekly).sort((a, c) => (c.income ?? 0) - (a.income ?? 0))[0];
    if (d.id === 'pad') {
      const o = hot && !broke ? d.opts.find((x) => x.id === 'precinct')! : rich && s.heat.local >= 35 ? d.opts.find((x) => x.id === 'precinct')! : d.opts.find((x) => x.id === d.def)!;
      return { dial: d, opt: o, why: o.id === 'none' ? 'the heat is low; save the envelope' : 'the heat is up; a pad pays for itself' };
    }
    if (hot) return { dial: d, opt: safest, why: 'the heat is up: run it quiet' };
    if (broke && richest && !richest.risk) return { dial: d, opt: richest, why: 'money is short: squeeze it' };
    if (b.kind === 'bookmaking' && d.id === 'layoff' && s.money < 15000) return { dial: d, opt: d.opts.find((o) => o.id === 'layoff')!, why: 'a small treasury cannot carry a bad Saturday' };
    if (b.kind === 'numbers' && d.id === 'reserve' && s.money < 8000) return { dial: d, opt: d.opts.find((o) => o.id === 'deep')!, why: 'one big hit would sink you' };
    return { dial: d, opt: d.opts.find((o) => o.id === d.def)!, why: 'the way it is usually run' };
  });
}

/* ------------------------------------------------------------------ */
/* The sim's random player, and old saves                              */
/* ------------------------------------------------------------------ */

const RK = (cmd: RacketCmd): PlayerAction => ({ kind: 'econ', op: { type: 'racket', cmd } });

/** Racket orders for the random player: a dial on one of its rackets, the advice, a new racket. */
export function racketActions(s: GameState): PlayerAction[] {
  const out: PlayerAction[] = [];
  const mine = owned(s).filter((b) => dialsOf(b.kind).length);
  if (mine.length) {
    const b = mine[s.week % mine.length];
    const ds = dialsOf(b.kind);
    const d = ds[s.week % ds.length];
    const o = d.opts[(s.week >> 1) % d.opts.length];
    if (dialOf(s, b, d.id) !== o.id) out.push(RK({ c: 'dial', bizId: b.id, dial: d.id, opt: o.id }));
    out.push(RK({ c: 'advice', bizId: b.id }));
  }
  const kinds = (Object.keys(RACKETS) as BusinessKind[]).filter((k) => k !== 'narcotics' && !startLocks(s, k).length);
  if (kinds.length) out.push(RK({ c: 'start', kind: kinds[s.week % kinds.length] }));
  return out;
}

/**
 * The family never runs women. An old save's "call service" becomes the
 * Madam's arrangement: the place goes back to her network, the family keeps
 * protecting it for a cut (her cut goes up a step), and the money paid for it
 * comes back as her thanks.
 */
export function migrateVice(s: GameState, ctx?: Ctx): void {
  const vice = s.businesses.filter((b) => b.owner === 'player' && b.kind === 'vice');
  if (!vice.length) return;
  s.businesses = s.businesses.filter((b) => !(b.owner === 'player' && b.kind === 'vice'));
  for (const b of vice) if (s.econ) delete s.econ.rackets[b.id];
  const M = s.ears?.madam;
  if (M) {
    M.cut = Math.min(3, Math.max(M.cut, 1) + 1) as typeof M.cut;
    addOpinion(s, M.id, s.playerId, 'Handed her people back to her', 10, 0);
  }
  const back = Math.round(vice.reduce((a, b) => a + (b.cost ?? CATALOG.vice.cost) * 0.5, 0));
  if (ctx) money(ctx, back, 'The Madam\'s thanks: the call service went back to her network', 'business');
  else s.money += back;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: 'The call service went back to the Madam\'s own network. The family protects it now, for a cut, and runs nobody.', kind: 'misc' });
}

/** Expected weekly take of every racket you run (for the hub's header). */
export function racketTake(s: GameState): number {
  return owned(s).filter((b) => racketInfo(b.kind)).reduce((a, b) => a + expectedTake(s, b), 0);
}

export function crewFree(s: GameState): number {
  return crew(s).length ? idleMen(s).length : 0;
}

export type { RacketInfo };
