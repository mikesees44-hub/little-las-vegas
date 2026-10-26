import { CATALOG } from './catalog';
import { capos, isFree } from './characters';
import { expectedTake, isOpen, owned } from './business';
import { ensureEcon } from './econState';
import type { Ctx } from './ledger';
import { addOpinion } from './relations';
import { xfer } from './tribute';
import type { Business, BusinessKind, Character, Effect, GameState } from './types';

/**
 * STEADY EARNERS. Every capo, and the boss himself, can have ONE signature
 * earner: a racket or a business that is his, that brings consistent weekly
 * dough ("Sal's numbers bank", "Your piece of the Flyer").
 *
 *  - It pays its expected take every week with no swings (no hit numbers, no
 *    bad Saturdays, no missed loads) and a little more (+15%: the man watches
 *    it himself).
 *  - A capo keeps 15% of it as his end and kicks the rest up, one line in the
 *    week's books: "Sal kicked up $1,200 — his numbers bank".
 *  - The boss's own earner pays straight into his Pocket.
 *  - A capo with one is more loyal and kicks up more reliably (he skims half as
 *    much, never drags his feet with the winter envelope, and his corners
 *    swing less); a capo without one grumbles a little more every month.
 *
 * Stored as charId -> businessId on the econ layer (optional: old saves have none).
 */

/** The capo's own end of his earner. */
export const EARNER_KEEP = 0.15;
/** The take goes up when the man watches it himself. */
export const EARNER_STEADY = 0.15;
/** Opinion while he has one (a standing modifier, not stacking). */
export const EARNER_LOYALTY = 8;
/** He grumbles 2 a month without one, down to this. */
export const EARNER_GRUMBLE_MIN = -8;
const R_HAS = 'His own steady earner';
const R_NONE = 'No steady earner of his own';

/** Kinds that cannot be anybody's steady earner: crews that work by the score, a one-shot, a pure cost. */
export const NOT_EARNER: BusinessKind[] = ['jewel', 'bankcrew', 'bustout', 'payoff', 'vice', 'safehouse', 'casino'];

/** How well a kind suits a steady earner: the best are the low-variance ones. */
export const STEADY_KINDS: BusinessKind[] = ['numbers', 'loansharking', 'protection', 'cigarettes', 'court', 'vending', 'waste', 'labor', 'washing', 'taxdodge', 'laundromat', 'bootleg', 'bidrig'];

export function steadyWord(kind: BusinessKind): 'steady' | 'swings' | 'scores' {
  if (NOT_EARNER.includes(kind)) return 'scores';
  return STEADY_KINDS.includes(kind) ? 'steady' : 'swings';
}

function map(s: GameState): Record<string, string> {
  return s.econ?.earners ?? {};
}

/** May this man hold a steady earner? The boss, or a capo of the family. */
export function canHold(s: GameState, c: Character | undefined): c is Character {
  return !!c && c.alive && c.faction === 'player' && (c.id === s.playerId || c.rank === 'capo');
}

/** May this business be somebody's steady earner? */
export function eligible(b: Business): boolean {
  return b.owner === 'player' && !NOT_EARNER.includes(b.kind);
}

/** Who holds a business as his steady earner (the boss or a capo), if anyone. Cheap: called by expectedTake. */
export function holderOf(s: GameState, bizId: string): string | undefined {
  const m = s.econ?.earners;
  if (!m) return undefined;
  for (const id in m) if (m[id] === bizId && canHold(s, s.characters[id])) return id;
  return undefined;
}

/** A man's steady earner, if he has one (and it still exists). */
export function earnerOf(s: GameState, charId: string): Business | undefined {
  const id = map(s)[charId];
  if (!id || !canHold(s, s.characters[charId])) return undefined;
  const b = s.businesses.find((x) => x.id === id && x.owner === 'player');
  return b && eligible(b) ? b : undefined;
}

export function hasEarner(s: GameState, charId: string): boolean {
  return !!earnerOf(s, charId);
}

/** "numbers bank", "protection", "guns": the kind in two or three plain words. */
export function kindWord(kind: BusinessKind): string {
  return CATALOG[kind].name.replace(/ \(.*\)$/, '').replace(/^The /, '').toLowerCase();
}

/** "Sal's numbers bank" / "Your piece of Pacific Ave numbers bank". */
export function earnerName(s: GameState, c: Character, b: Business): string {
  return c.id === s.playerId ? `Your piece of ${b.name}` : `${c.firstName}'s ${kindWord(b.kind)}`;
}

/** The boss, then every capo: the men who can hold a steady earner. */
export function holders(s: GameState): Character[] {
  const boss = s.characters[s.playerId];
  return [...(canHold(s, boss) ? [boss] : []), ...capos(s).filter((c) => c.faction === 'player').sort((a, b) => (a.id < b.id ? -1 : 1))];
}

/** Businesses that could be given to somebody now (eligible, open or not, held by nobody). */
export function freeEarners(s: GameState): Business[] {
  return owned(s).filter((b) => eligible(b) && !holderOf(s, b.id));
}

/** What the business would pay as a steady earner a week (its expected take, steadied). */
export function earnerWeekly(s: GameState, b: Business): number {
  const held = !!holderOf(s, b.id);
  const t = expectedTake(s, b);
  return Math.round(held ? t : t * (1 + EARNER_STEADY));
}

/**
 * The best free business for a man: steady kinds first, then the bigger take,
 * then one in his own district. Undefined when there is nothing to give.
 */
export function suggestFor(s: GameState, c: Character, exclude: ReadonlySet<string> = new Set()): Business | undefined {
  const d = s.districts.find((x) => x.capoId === c.id);
  const score = (b: Business) => (expectedTake(s, b) + 40) * (steadyWord(b.kind) === 'steady' ? 1.5 : 1) * (d && b.districtId === d.id ? 1.3 : 1) * (isOpen(s, b) ? 1 : 0.5);
  return freeEarners(s).filter((b) => !exclude.has(b.id)).sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1))[0];
}

/** The one-tap order: give a man his steady earner (or take it back with bizId ''). */
export function earnerAction(who: string, bizId: string) {
  return { kind: 'econ' as const, op: { type: 'racket' as const, cmd: { c: 'earner' as const, who, bizId } } };
}

/** Preview pieces of the order (racketLife.previewRacket wraps them). */
export function earnerPreview(s: GameState, who: string, bizId: string): { title: string; detail: string; effects: Effect[]; because: string; disabledReason?: string } {
  const c = s.characters[who];
  const b = bizId ? s.businesses.find((x) => x.id === bizId && x.owner === 'player') : undefined;
  const cur = c ? earnerOf(s, c.id) : undefined;
  const boss = who === s.playerId;
  const op: Effect = { type: 'econ', op: { op: 'racket', cmd: 'earner', who, bizId }, label: 'Steady earner' };
  if (!canHold(s, c)) return { title: 'Steady earner', detail: '', effects: [], because: '', disabledReason: 'Only the boss or a capo holds a steady earner' };
  if (!bizId) {
    return {
      title: `Take back ${cur ? earnerName(s, c, cur) : 'his earner'}`, detail: 'The money goes back to the family.', effects: [op, ...(!boss ? [{ type: 'opinion', from: c.id, to: s.playerId, amount: -6, reason: 'Took my earner away', decay: 1, label: 'Steady earner' } as Effect] : [])],
      because: `took back ${c.firstName}'s steady earner`, disabledReason: cur ? undefined : 'He has none',
    };
  }
  const title = boss ? `Make ${b?.name ?? 'it'} your own earner` : `Give ${c.firstName} ${b?.name ?? 'it'}`;
  const why = !b ? 'Not yours' : !eligible(b) ? 'A crew that works by the score, a one-shot or a cost cannot be a steady earner' : cur?.id === b.id ? 'It is already his' : holderOf(s, b.id) && holderOf(s, b.id) !== who ? `It is already ${s.characters[holderOf(s, b.id)!]?.firstName}'s` : undefined;
  const wk = b ? earnerWeekly(s, b) : 0;
  const detail = boss
    ? `About $${wk.toLocaleString('en-US')}/wk, every week, straight into your Pocket instead of the Family.`
    : `About $${wk.toLocaleString('en-US')}/wk, every week: he keeps ${Math.round(EARNER_KEEP * 100)}% and kicks up the rest. He is more loyal and kicks up more reliably.${cur ? ` (Replaces ${earnerName(s, c, cur)}.)` : ''}`;
  const effects: Effect[] = [op];
  if (!boss && !cur) effects.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 4, reason: 'Gave me something of my own', decay: 1, label: 'Steady earner' });
  return { title, detail, effects, because: boss ? `took ${b?.name} as your own earner` : `gave ${c.firstName} ${b?.name} as his steady earner`, disabledReason: why };
}

/** Applies the order (from the effect op): one earner per man, one man per business. */
export function setEarner(s: GameState, who: string, bizId: string): void {
  const e = ensureEcon(s);
  const m = (e.earners ??= {});
  if (!bizId) { delete m[who]; return; }
  for (const id of Object.keys(m)) if (m[id] === bizId) delete m[id];
  m[who] = bizId;
  const r = s.relations[`${who}>${s.playerId}`];
  if (r) r.modifiers = r.modifiers.filter((x) => x.reason !== R_NONE);
}

/**
 * The week of a steady earner's money (economy.runBusinesses, after the
 * business's own week): the boss's goes to his Pocket; a capo keeps his end
 * and the rest goes to the family as his kick-up. Returns what the family
 * gets and the line's label, or undefined if it is nobody's earner.
 */
export function routeEarner(ctx: Ctx, b: Business, amt: number): { amt: number; label: string; who: string } | undefined {
  const s = ctx.s;
  const who = holderOf(s, b.id);
  if (!who || amt <= 0) return undefined;
  const c = s.characters[who];
  const a = Math.round(amt);
  if (who === s.playerId) {
    xfer(ctx, `ext:earner:${b.id}`, 'personal', a, 'business_income', `w${s.week}:earner:${b.id}`, { note: `Your piece of ${b.name}` });
    return { amt: 0, label: '', who };
  }
  const keep = Math.round(a * EARNER_KEEP);
  xfer(ctx, `ext:earner:${b.id}`, `wealth:${c.id}`, keep, 'capo_distribution', `w${s.week}:earnerkeep:${b.id}`, { note: `${c.firstName} ${c.lastName} keeps his end of ${b.name}` });
  const up = a - keep;
  return { amt: up, who, label: `${c.firstName} kicked up $${up.toLocaleString('en-US')} — his ${kindWord(b.kind)} (${b.name})` };
}

/** Monthly: a capo with an earner is content; one without grumbles. Called from racketLifeWeek. */
export function earnersMonth(ctx: Ctx): void {
  const s = ctx.s;
  if (s.date.d > 7 || !s.econ) return;
  // Drop records for men or places that are gone.
  const m = s.econ.earners;
  if (m) for (const id of Object.keys(m)) if (!earnerOf(s, id)) delete m[id];
  for (const k of capos(s)) {
    if (k.faction !== 'player' || !isFree(s, k)) continue;
    const r = s.relations[`${k.id}>${s.playerId}`];
    if (hasEarner(s, k.id)) {
      const mod = addOpinion(s, k.id, s.playerId, R_HAS, 2, 0);
      if (mod) mod.value = Math.min(mod.value, EARNER_LOYALTY);
      if (r) r.modifiers = r.modifiers.filter((x) => x.reason !== R_NONE);
    } else if (s.week >= 8 && owned(s).length > 0) {
      const mod = addOpinion(s, k.id, s.playerId, R_NONE, -2, 0);
      if (mod) mod.value = Math.max(mod.value, EARNER_GRUMBLE_MIN);
      if (r) r.modifiers = r.modifiers.filter((x) => x.reason !== R_HAS);
      const sug = suggestFor(s, k);
      ctx.log.push(`${k.firstName} ${k.lastName} grumbles: he has nothing steady of his own.${sug ? ` (Give him ${sug.name}: Holdings › The Rackets › Steady earners.)` : ''}`);
    }
  }
}

/** The man whose kick-up is steadier: corners swing less (×0.5 spread) when he has an earner. */
export function steadyMult(s: GameState, charId: string): number {
  return hasEarner(s, charId) ? 0.5 : 1;
}

/** Last week's steady-earner lines, for the Earnings board: "Sal kicked up $1,200 — his numbers bank". */
export function earnerLines(s: GameState): { who: string; text: string; amount: number }[] {
  const out: { who: string; text: string; amount: number }[] = [];
  for (const l of s.lastReport?.lines ?? []) {
    if (l.stat !== 'money' || !l.who || !/ kicked up \$[\d,]+ — his /.test(l.label)) continue;
    out.push({ who: l.who, text: l.label.replace(/ \([^)]*\)$/, ''), amount: l.amount });
  }
  const boss = s.characters[s.playerId];
  const b = boss ? earnerOf(s, boss.id) : undefined;
  if (b) out.unshift({ who: boss.id, text: `${earnerName(s, boss, b)}: about $${earnerWeekly(s, b).toLocaleString('en-US')} a week into your Pocket`, amount: earnerWeekly(s, b) });
  return out;
}
