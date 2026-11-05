import { fundingBlock, previewAction, settleOrderNow, type ActionPreview } from '../actions';
import { floaterText, loyaltyMark, loyaltySince } from '../loyalty';
import { practiceDeed } from '../bossSkills';
import { displayName } from '../characters';
import { applyEffects } from '../effects';
import { cloneState } from '../engine';
import { bookMark, bookOrder } from '../journal';
import { newCtx, type Ctx } from '../ledger';
import { mindOf } from '../minds/state';
import { getRelation, opinion } from '../relations';
import { spendTime, timeBlock } from '../timeCost';
import { freezeWeek } from '../days';
import type { Effect, GameState, PlayerAction } from '../types';
import { applyDeed, deedPreview, tierOf } from './resolve';
import { d01, ensureDeeds, owedBy, tiesOf } from './state';
import { TIE_LABEL, type Tier } from './types';

/**
 * IN THE MOMENT. A person interaction is settled the moment the boss makes
 * it: the odds (with every reason) were on the card before he chose; the roll
 * happens now, on the deeds' own dice; the effects land now through the same
 * application as the week's turn (settleOrderNow), so nothing is queued and
 * nothing is applied twice; only the action's own hours pass. The result card
 * says the roll against the odds ("62% — she said yes"), what changed, and
 * what it may lead to. Critical ends have teeth: an insult can start a feud, a
 * refused envelope can go to the cops, a refused advance is remembered.
 */

export interface NowResult {
  ok: boolean;
  error?: string;
  title: string;
  who?: string;
  /** 0..1 when there were odds. */
  chance?: number;
  /** The roll, 0-99 (under the odds wins). */
  roll?: number;
  tier: Tier;
  headline: string;
  line: string;
  changes: string[];
  leadsTo: string[];
  /** What he will remember (the memory written to his mind), in his words. */
  remember?: string;
  /** His opinion of the boss moved by this much. */
  opinionDelta?: number;
  /** The ripple: everyone else whose loyalty moved ("+5 Sal (you backed him)"), loyalty.ts. */
  ripple?: string[];
  /** When it was settled, for the card's header: "done now" unless it came at the week's turn. */
  when?: string;
  /** A picture for the card's top (ui/decide/ResultCard.tsx RESULT_ART). */
  art?: string;
  /** She said yes to an evening: the card offers to spend it talking (dateTalk.ts). */
  dateWith?: string;
  /** The order it was (set by the screen that gave it): the card can offer to make it standing ("Same time next week?"). */
  again?: { who: string; action: PlayerAction };
}

/** The tier's banner (STREAMLINE §4.3). */
export const TIER_BANNER: Record<Tier, string> = { crit: 'Better than hoped', success: 'Success', fail: 'Failure', critFail: 'Disaster' };

/** An order's fingerprint for the once-a-week guard. */
export function nowKey(a: PlayerAction): string {
  return JSON.stringify(a);
}

/** Already settled this week (the same order, the same week): a double click is one order. */
export function settledThisWeek(s: GameState, a: PlayerAction): boolean {
  const n = s.deeds?.now;
  return !!n && n.w === s.week && n.k.includes(nowKey(a));
}

/** The person an order is aimed at, if it is a person interaction. */
export function personOf(s: GameState, a: PlayerAction): string | undefined {
  const r = a as { target?: unknown; op?: Record<string, unknown> };
  const plan = r.op?.plan as { id?: unknown } | undefined;
  const ids = [r.target, r.op?.to, r.op?.id, r.op?.who, r.op?.target, r.op?.charId, plan?.id];
  for (const x of ids) if (typeof x === 'string' && s.characters[x] && x !== s.playerId) return x;
  return undefined;
}

/** Kinds that are settled in the moment (person to person). */
const NOW_KINDS = new Set(['deed', 'interact', 'women', 'dating', 'nightlife', 'bond', 'payroll', 'herway', 'talk']);
const NOW_ECON = new Set(['gift', 'invite', 'leverage']);

export function settlesNow(s: GameState, a: PlayerAction): boolean {
  // Ocean City's orders (oceanCity.ts) are the boss's big decisions: decided, and rolled, in the moment.
  if (a.kind === 'oc') return true;
  // The climb from below (valente.ts): asking a made man to vouch, coffee with him, the sit-down: in the moment.
  if (a.kind === 'power' && (a.op.op === 'low' || (a.op.op === 'climb' && !!s.power?.above))) return true;
  if (a.kind === 'econ') return NOW_ECON.has((a.op as { type: string }).type) && !!personOf(s, a);
  if (a.kind === 'interact' && (a.id === 'whack' || a.id === 'exile' || a.id === 'make' || a.id === 'promote' || a.id === 'demote')) return false;
  return NOW_KINDS.has(a.kind) && !!personOf(s, a);
}

interface Snap {
  money: number; pocket: number; respect: number; heat: Record<string, number>; favors: number; hooks: number;
  op?: number; fear?: number; trust?: number; grievance?: number; ties: string[]; owes: number; mem: number; evidence: number;
}
function snap(s: GameState, t?: string): Snap {
  const r = t ? getRelation(s, t, s.playerId) : undefined;
  return {
    money: s.money, pocket: Math.round(s.tribute?.acct.personal ?? 0), respect: s.respect, heat: { ...s.heat }, favors: s.favors,
    hooks: t ? s.hooks.filter((h) => h.holder === 'player' && h.targetId === t).length : 0,
    ...(t ? { op: opinion(s, t, s.playerId), fear: r?.fear ?? 0, trust: r?.trust ?? 30, grievance: r?.grievance ?? 0 } : {}),
    ties: t ? tiesOf(s, t).map((x) => `${x.other}:${x.tie.k}`) : [],
    owes: t ? owedBy(s, t, s.playerId) : 0,
    mem: t ? (mindOf(s, t)?.mem.length ?? 0) : 0,
    evidence: s.characters[s.playerId]?.evidence ?? 0,
  };
}

const sign = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;
const money$ = (n: number) => `${n > 0 ? '+' : '−'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

function diff(s: GameState, a: Snap, b: Snap, t?: string): { changes: string[]; leadsTo: string[] } {
  const ch: string[] = [];
  const lead: string[] = [];
  const name = t ? s.characters[t]?.firstName ?? 'He' : 'He';
  if (b.money !== a.money) ch.push(`Family money ${money$(b.money - a.money)}`);
  if (b.pocket !== a.pocket) ch.push(`Your pocket ${money$(b.pocket - a.pocket)}`);
  if (b.respect !== a.respect) ch.push(`Respect ${sign(b.respect - a.respect)}`);
  for (const k of Object.keys(b.heat)) if (b.heat[k] !== a.heat[k]) { ch.push(`${k[0].toUpperCase()}${k.slice(1)} heat ${sign(b.heat[k] - a.heat[k])}`); if (b.heat[k] > a.heat[k]) lead.push(k === 'federal' ? 'The feds may take an interest.' : 'The police may take an interest.'); }
  if (b.favors !== a.favors) ch.push(`Favors ${sign(b.favors - a.favors)}`);
  if (b.evidence > a.evidence) { ch.push(`Evidence against you ${sign(b.evidence - a.evidence)}`); lead.push('Something went into a file somewhere.'); }
  if (b.op !== undefined && a.op !== undefined && b.op !== a.op) ch.push(`${name}'s opinion of you ${sign(b.op - a.op)} (now ${b.op})`);
  if (b.fear !== undefined && a.fear !== undefined && b.fear !== a.fear) ch.push(`${name}'s fear of you ${sign(b.fear - a.fear)}`);
  if (b.trust !== undefined && a.trust !== undefined && b.trust !== a.trust) ch.push(`${name}'s trust ${sign(b.trust - a.trust)}`);
  if (b.grievance !== undefined && a.grievance !== undefined && b.grievance !== a.grievance) {
    ch.push(`${name}'s grievance ${sign(b.grievance - a.grievance)}`);
    if (b.grievance > a.grievance && b.grievance >= 25) lead.push(`${name} is nursing a grievance: he may act on it.`);
  }
  if (b.hooks > a.hooks) { ch.push(`A hook on ${name}`); lead.push('Lean on the hook later: it can make him say yes.'); }
  if (b.hooks < a.hooks) ch.push(`Your hook on ${name} is spent`);
  if (b.owes > a.owes) { ch.push(`${name} owes you a favor`); lead.push('Call it in when you need it.'); }
  for (const x of b.ties.filter((y) => !a.ties.includes(y))) {
    const [other, k] = x.split(':');
    const who = other === s.playerId ? 'you' : s.characters[other]?.firstName ?? '?';
    ch.push(`${name} & ${who}: ${TIE_LABEL[k as keyof typeof TIE_LABEL].toLowerCase()}`);
    if (k === 'feud') lead.push(`A feud: ${name} will come after ${who === 'you' ? 'you' : who}, one way or another.`);
    if (k === 'rival') lead.push(`Rivals now: expect insults, stories, a knife in the back.`);
    if (k === 'friend' || k === 'ally') lead.push(`${name} will stand with ${who === 'you' ? 'you' : who} when it counts.`);
  }
  if (b.mem > a.mem) ch.push(`${name} will remember this`);
  return { changes: ch, leadsTo: [...new Set(lead)] };
}

/** Critical ends of the old verbs (interactions.ts, women, dating, nightlife, bonds, gifts): the teeth. */
/** The matchmaker's card (matchmakers.ts). */
function matchCard(a: PlayerAction): boolean {
  return (a.kind === 'bond' && (a.op.op === 'match' || a.op.op === 'herFavor')) || (a.kind === 'dating' && (a.op.op === 'come' || a.op.op === 'ma'));
}

/** The last line the order wrote to Your File (the matchmaker's own words for the result card). */
function lastLine(s: GameState): string | undefined {
  const e = s.journal?.e[s.journal.e.length - 1];
  return e && e.w === s.week && e.src === 'order' ? e.r?.filter((x) => !/^The answer was no\.$/.test(x)).slice(-1)[0] : undefined;
}

function legacyCrit(s: GameState, a: PlayerAction, t: string, tier: Tier): { fx: Effect[]; line?: string } {
  const c = s.characters[t];
  const B = s.playerId;
  if (!c) return { fx: [] };
  // The matchmaker's card: the roll is the families' and the young person's answer, not hers; her feelings are in the op.
  if (matchCard(a)) return { fx: [] };
  const n = c.firstName;
  const mem = (txt: string, v: number): Effect => ({ type: 'deed', op: { op: 'mem', who: t, about: B, t: txt, v } });
  if (tier === 'crit') return { fx: [{ type: 'opinion', from: t, to: B, amount: 10, reason: 'It went better than I hoped', decay: 1 }, mem('the boss did right by him', 8)], line: `${n} will talk about this one for a while, kindly.` };
  if (tier !== 'critFail') return { fx: [] };
  const id = a.kind === 'interact' ? a.id : (a as { op?: { op?: string; type?: string } }).op?.op ?? (a as { op?: { type?: string } }).op?.type ?? '';
  if (id === 'bribe' || id === 'leverage') return { fx: [{ type: 'heat', bar: 'local', amount: 4 }, { type: 'evidence', charId: B, amount: 3 }, { type: 'opinion', from: t, to: B, amount: -15, reason: 'Tried to buy me', decay: 0 }], line: `${n} did not just say no. ${c.gender === 'F' ? 'She' : 'He'} went to the police with it.` };
  if (a.kind === 'women' || a.kind === 'dating' || a.kind === 'nightlife' || id === 'court' || id === 'affair' || id === 'proposeMarriage') return { fx: [{ type: 'opinion', from: t, to: B, amount: -10, reason: 'Would not take the hint', decay: 1 }, mem('he made an advance she turned down', -12)], line: `${n} turned you down, and will remember that you asked.` };
  if (id === 'demand' || id === 'favor' || id === 'recruit') return { fx: [{ type: 'meter', from: t, to: B, meter: 'grievance', amount: 15 }, { type: 'opinion', from: t, to: B, amount: -10, reason: 'Took it badly', decay: 1 }], line: `${n} took it badly, and told people.` };
  return { fx: [{ type: 'opinion', from: t, to: B, amount: -10, reason: 'Took offense', decay: 1 }, mem('the boss gave offense', -8)], line: `${n} took offense.` };
}

function verdict(tier: Tier, mode: 'consent' | 'odds' | 'order', she: boolean): string {
  const p = she ? 'she' : 'he';
  if (mode === 'order') return 'done';
  if (mode === 'consent') return tier === 'crit' ? `${p} said yes, gladly` : tier === 'success' ? `${p} said yes` : tier === 'fail' ? `${p} said no` : `${p} took offense`;
  return tier === 'crit' ? 'better than hoped' : tier === 'success' ? 'it worked' : tier === 'fail' ? 'it didn\'t work' : 'it blew up';
}

/**
 * Do it now. Pure: returns the new state (unchanged on an error) and the
 * result card. `fund`: the boss approved Family money for what his pocket lacks.
 */
export function actNow(input0: GameState, action: PlayerAction): { state: GameState; result: NowResult } {
  // The week's mornings are read before the order changes anything (DAILY_LOGIC B1).
  const input = freezeWeek(input0);
  const p0 = previewAction(input, action);
  const t = personOf(input, action);
  const fail = (error: string): { state: GameState; result: NowResult } => ({ state: input0, result: { ok: false, error, title: p0.title, tier: 'fail', headline: error, line: '', changes: [], leadsTo: [] } });
  if (input.gameOver) return fail('The game is over');
  if (settledThisWeek(input, action)) return fail('Already done this week');
  if (p0.disabledReason) return fail(p0.disabledReason);
  const tb = timeBlock(input, action);
  if (tb) return fail(tb);
  const funding = fundingBlock(input, action, p0);
  if (funding) return fail(`Not enough: ${funding}`);
  let s = cloneState(input);
  s = spendTime(s, action).state;
  const ctx: Ctx = newCtx(s);
  const before = snap(s, t);
  const lmark = loyaltyMark(s);
  const D = ensureDeeds(s);
  D.now = D.now && D.now.w === s.week ? D.now : { w: s.week, k: [] };
  D.now.k.push(nowKey(action));
  const mem0 = t ? (mindOf(s, t)?.mem.length ?? 0) : 0;
  const she = !!t && s.characters[t]?.gender === 'F';
  let tier: Tier = 'success';
  let chance: number | undefined;
  let roll: number | undefined;
  let line = '';
  let mode: 'consent' | 'odds' | 'order' = 'order';
  if (action.kind === 'deed') {
    const pd = deedPreview(s, action.id, s.playerId, action.target, { via: action.via, hook: action.hook })!;
    const r = d01(D);
    tier = tierOf(pd.def, pd.chance, r);
    mode = pd.def.mode;
    if (pd.acceptance) { chance = pd.chance; roll = Math.floor(r * 100); }
    const mark = bookMark(ctx);
    line = applyDeed(ctx, pd, tier);
    practiceDeed(s, `${action.id} ${pd.title}`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'decision' });
    bookOrder(ctx, mark, action, { title: pd.title, outcome: tier === 'fail' || tier === 'critFail' ? 'refused' : 'done' });
  } else if (action.kind === 'talk') {
    // A talk answers itself (talks.ts: agree, counter, think it over, refuse): one roll, his, and his words are the result.
    const n0 = ctx.log.length;
    settleOrderNow(ctx, action, true);
    const said = ctx.log.slice(n0).filter((x) => !/^You /.test(x));
    line = said[said.length - 1] ?? 'Done.';
    tier = /said no|refused/i.test(line) ? 'fail' : 'success';
  } else {
    const p = previewAction(s, action) as ActionPreview;
    const acc = p.acceptance ?? p.odds;
    const r = d01(D);
    let accepted = true;
    if (acc) {
      chance = acc.chance;
      roll = Math.floor(r * 100);
      mode = p.acceptance ? 'consent' : 'odds';
      accepted = r < acc.chance;
      // The critical ends: the best 15% of a yes, the worst 25% of a no.
      tier = accepted ? (r < acc.chance * 0.15 ? 'crit' : 'success') : (r >= acc.chance + (1 - acc.chance) * 0.75 ? 'critFail' : 'fail');
      // Her card: the families and the young person answer, not she; a no is just a no.
      if (matchCard(action)) { mode = 'odds'; if (tier === 'critFail') tier = 'fail'; }
    } else if (r < 0.1) tier = 'crit';
    settleOrderNow(ctx, action, accepted);
    const extra = t ? legacyCrit(s, action, t, tier) : { fx: [] };
    if (extra.fx.length) applyEffects(ctx, extra.fx, { label: `${p.title}: ${tier === 'crit' ? 'better than hoped' : 'it went badly'}`, because: p.because, category: 'event' });
    line = extra.line ?? (accepted ? `Done: ${p.title}.` : `${p.title}: the answer was no.`);
    if (extra.line) {
      const last = s.journal?.e[s.journal.e.length - 1];
      if (last && last.src === 'order' && last.w === s.week) last.r = [...(last.r ?? []), extra.line];
      else s.chronicle.push({ week: s.week, date: { ...s.date }, text: extra.line, kind: 'decision' });
    }
    if (matchCard(action)) line = lastLine(s) ?? line;
  }
  const after = snap(s, t);
  const d = diff(s, before, after, t);
  const cd = action.kind === 'deed' ? deedPreview(s, action.id, s.playerId, action.target)?.cooldown ?? 0 : 0;
  if (cd > 0) d.leadsTo.push(`Not again with ${t ? s.characters[t]?.firstName : 'him'} for ${cd} weeks.`);
  const pct = chance !== undefined ? Math.round(chance * 100) : undefined;
  const mems = t ? (mindOf(s, t)?.mem ?? []).slice(mem0).filter((m) => !m.who || m.who === s.playerId) : [];
  const remember = mems.length ? mems[mems.length - 1].t : undefined;
  const opinionDelta = before.op !== undefined && after.op !== undefined && after.op !== before.op ? after.op - before.op : undefined;
  const moved = loyaltySince(s, lmark).filter((f) => f[1] !== t);
  const ripple = moved.slice(-4).map((f) => floaterText(s, f));
  if (moved.length > 4) ripple.push(`and ${moved.length - 4} more`);
  // The night in the car, when she said yes: the owner's still of the car at night.
  const art = action.kind === 'nightlife' && (action.op as { op?: string }).op === 'car' && tier !== 'fail' ? 'car_night' : undefined;
  const headline = pct !== undefined ? `${pct}% — ${verdict(tier, mode, she)}` : verdict(tier, 'order', she) === 'done' ? 'Done' : verdict(tier, mode, she);
  return {
    state: s,
    result: { ok: true, title: p0.title, ...(t ? { who: displayName(s.characters[t]) } : {}), ...(chance !== undefined ? { chance, roll } : {}), tier, headline, line, changes: d.changes, leadsTo: d.leadsTo, ...(remember ? { remember } : {}), ...(opinionDelta !== undefined ? { opinionDelta } : {}), ...(ripple.length ? { ripple } : {}), ...(art ? { art } : {}), ...(t && action.kind === 'dating' && ['invite', 'askOut'].includes((action.op as { op?: string }).op ?? '') && (tier === 'success' || tier === 'crit') ? { dateWith: t } : {}) },
  };
}
