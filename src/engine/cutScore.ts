import { capos, hasTrait, shortName } from './characters';
import { applyEffect, fmtMoney } from './effects';
import { money, type Ctx } from './ledger';
import { inflation } from './property';
import type { Decision } from './reactions/types';
import { commitShare, previewShare, SHARE_PRESETS, shareMen, sharePlan, type SharePlan } from './storeShare';
import type { ShareSplit } from './spendState';
import { xfer } from './tribute';
import type { Character, Choice, Effect, EventInstance, GameState } from './types';

/**
 * CUTTING UP THE SCORE. After any big score or windfall that lands in Family
 * money (a crew's score kicked up, a heist, a bust-out folding on schedule,
 * a bank crew's job, a dirty-work take), the boss decides how it is cut up:
 *
 *  - the lion's share (his cut is big; the men grumble, the greedy capos
 *    resent it and, for a while, help themselves more: skimRate);
 *  - by the book (down the line by rank);
 *  - spread around (a smaller cut, loyalty, respect on the street);
 *  - make it rain (a party and bonuses; his cut is the least, the loyalty the
 *    most, and the flashy spending draws the local cops);
 *  - the widows and the church (the Share the Wealth "saint" split).
 *
 * The men's part runs through Share the Wealth's own plan (sharePlan /
 * previewShare / commitShare): every envelope is a journal transfer, so
 * every dollar is accounted. The boss's cut is a transfer from Family money
 * to his Pocket; what the house keeps stays in Family money. The capo (or
 * the man) who brought the score reacts, and the other capos compare
 * (reactions/: the card shows it before the boss picks).
 */

export type CutWay = 'lion' | 'book' | 'spread' | 'rain' | 'church';
export const CUT_WAYS: CutWay[] = ['lion', 'book', 'spread', 'rain', 'church'];

export interface CutState {
  /** Weeks the boss ate the lion's share (the capos remember, for a while). */
  lion: number[];
  /** The last offer's week (one cut-up decision at a time). */
  last?: number;
  log: [number, string][];
  n: number;
}

export type CutOp = { op: 'cut'; way: CutWay; total: number; by?: string; what: string; key: string };

export function ensureCut(s: GameState): CutState {
  if (!s.cut) s.cut = { lion: [], log: [], n: 0 };
  const c = s.cut;
  c.lion ??= [];
  c.log ??= [];
  c.n ??= 0;
  return c;
}

/** The size that counts as a big score: $3,000 in 1960 dollars, more for a bigger family. */
export function cutThreshold(s: GameState): number {
  const men = shareMen(s).length;
  return Math.round((3000 * inflation(s) * (1 + Math.min(1.5, men / 40))) / 100) * 100;
}

/** How each way cuts the pot: the boss, the house (Family money keeps it), the share (envelopes), the party. */
export const CUT_SPLIT: Record<CutWay, { boss: number; house: number; share: number; party: number; label: string; text: string }> = {
  lion: { boss: 0.65, house: 0.25, share: 0.1, party: 0, label: 'Keep the lion\'s share', text: 'It is your island. The men get a taste.' },
  book: { boss: 0.35, house: 0.25, share: 0.4, party: 0, label: 'By the book', text: 'Down the line by rank, the way it has always been done.' },
  spread: { boss: 0.2, house: 0.15, share: 0.65, party: 0, label: 'Spread it around', text: 'The men eat, and the street hears the boss is generous.' },
  rain: { boss: 0.1, house: 0.1, share: 0.5, party: 0.3, label: 'Make it rain', text: 'A party for the whole family and bonuses all around. People will talk about it.' },
  church: { boss: 0.2, house: 0.15, share: 0.65, party: 0, label: 'The widows and the church', text: 'The neighborhood saint: the widows, St. Ann\'s, the street, then the men.' },
};

/** The men's part of each way, as a Share the Wealth split. */
function splitOf(way: CutWay): ShareSplit {
  if (way === 'church') return SHARE_PRESETS.find((p) => p.id === 'saint')!.split;
  if (way === 'spread') return { crew: 80, widows: 0, church: 0, hood: 20 };
  return SHARE_PRESETS.find((p) => p.id === 'crew')!.split;
}

export interface CutPlan {
  way: CutWay;
  total: number;
  boss: number;
  house: number;
  party: number;
  share: number;
  plan: SharePlan;
  /** Respect and heat beyond what the share itself does. */
  respect: number;
  localHeat: number;
  crew: number;
}

/** The whole cut, in dollars (pure). */
export function cutPlan(s: GameState, way: CutWay, total: number): CutPlan {
  const k = CUT_SPLIT[way];
  const boss = Math.round(total * k.boss);
  const party = Math.round(total * k.party);
  const share = Math.round(total * k.share);
  const house = Math.max(0, total - boss - party - share);
  const plan = sharePlan(s, share, splitOf(way), 'rank');
  const real = total / inflation(s);
  const big = real >= 8000 ? 1 : 0;
  const respect = way === 'spread' ? 2 + big : way === 'rain' ? 2 + big : way === 'lion' ? -1 : 0;
  const localHeat = way === 'rain' ? 3 + big * 2 : 0;
  const crew = way === 'lion' ? -2 - big : way === 'spread' ? 2 : way === 'rain' ? 3 + big : way === 'church' ? 1 : 0;
  return { way, total, boss, house, party, share, plan, respect, localHeat, crew };
}

/** How the man who brought it in takes each way (before his nature: the reaction engine adds that). */
function bringerTake(c: Character | undefined, way: CutWay): [number, string] {
  if (!c) return [0, ''];
  const greedy = hasTrait(c, 'Greedy') || hasTrait(c, 'Ambitious');
  switch (way) {
    case 'lion': return [greedy ? -14 : -9, 'Ate my score'];
    case 'book': return [greedy ? 0 : 4, 'Cut my score square'];
    case 'spread': return [greedy ? 3 : 7, 'Made my score a good week for everybody'];
    case 'rain': return [greedy ? -4 : 9, greedy ? 'Threw a party with my score' : 'Threw a party for my score'];
    case 'church': return [greedy ? -5 : 4, greedy ? 'Gave my score to the priests' : 'Put my score where it does good'];
  }
}

/** The other capos compare: a lion's share teaches them, a party wins them. */
function peerTake(s: GameState, way: CutWay, by?: string): [string, number, string][] {
  const out: [string, number, string][] = [];
  for (const k of capos(s)) {
    if (k.id === by || k.id === s.playerId || !k.alive) continue;
    const greedy = hasTrait(k, 'Greedy');
    if (way === 'lion') out.push([k.id, greedy ? -6 : -3, greedy ? 'The boss eats; why shouldn\'t I?' : 'The boss ate the whole score']);
    else if (way === 'rain') out.push([k.id, 4, 'The boss threw a party']);
    else if (way === 'spread') out.push([k.id, 2, 'The boss shares']);
  }
  return out;
}

/** The decision, for the reactions engine: who brought it, the others comparing. */
export function cutDecision(s: GameState, way: CutWay, what: string, by?: string): Decision | undefined {
  const c = by ? s.characters[by] : undefined;
  const [v, y] = bringerTake(c?.alive && c.faction === 'player' ? c : undefined, way);
  const more = peerTake(s, way, by);
  if (!v && !more.length) return undefined;
  return {
    k: v < 0 ? 'slight' : 'grant', label: `You cut up ${what}: ${CUT_SPLIT[way].label.toLowerCase()}`,
    ...(c && v ? { t: c.id, v, y } : {}), ...(more.length ? { more } : {}), src: 'cut_score',
  };
}

const $ = (n: number) => fmtMoney(Math.round(n));

/** One option's line: who gets what (top lines). */
export function cutLines(p: CutPlan, max = 3): string {
  const top = p.plan.lines.slice().sort((a, b) => b.amount - a.amount).slice(0, max).map((l) => `${l.kind === 'man' ? l.name.split(' ')[0] : l.name.replace(/ \(.*\)$/, '')} ${$(l.amount)}`);
  const more = p.plan.lines.length - top.length;
  const parts = [`Your cut ${$(p.boss)}`, `Family money keeps ${$(p.house)}`];
  if (p.share) parts.push(`envelopes ${$(p.share)}${top.length ? ` (${top.join(', ')}${more > 0 ? `, +${more} more` : ''})` : ''}`);
  if (p.party) parts.push(`the party ${$(p.party)}`);
  return parts.join(' · ');
}

/** The choice for one way. */
function cutChoice(s: GameState, way: CutWay, total: number, what: string, key: string, by?: string): Choice {
  const p = cutPlan(s, way, total);
  const k = CUT_SPLIT[way];
  const d = cutDecision(s, way, what, by);
  const effects: Effect[] = [];
  if (d) effects.push({ type: 'deed', op: { op: 'react', d } });
  effects.push({ type: 'cut', op: { op: 'cut', way, total, ...(by ? { by } : {}), what, key }, label: `Cut up the score: ${k.label}` });
  if (p.crew) effects.push({ type: 'crewOpinion', amount: p.crew, reason: way === 'lion' ? 'The boss ate the score' : way === 'rain' ? 'The boss made it rain' : 'The boss shares', label: k.label });
  if (p.respect) effects.push({ type: 'respect', amount: p.respect, label: `${k.label}: the street hears about it` });
  if (p.localHeat) effects.push({ type: 'heat', bar: 'local', amount: p.localHeat, label: `${k.label}: money thrown around in public` });
  const notes: string[] = [k.text, cutLines(p)];
  if (way === 'lion') notes.push('For a while the capos help themselves a little more.');
  if (p.plan.slighted.length) notes.push(`${p.plan.slighted.slice(0, 2).join(', ')} feel the thin envelope.`);
  return {
    id: way, label: `${k.label} — your cut ${$(p.boss)}`, detail: notes.join(' '), effects,
    because: `cut up ${what}: ${k.label.toLowerCase()} (your cut ${$(p.boss)})`,
  };
}

/** The "Cut up the score" decision. */
export function buildCutEvent(s: GameState, total: number, what: string, by?: string): EventInstance {
  const iid = `ev${s.nextId++}`;
  const key = `cut${iid}`;
  const c = by ? s.characters[by] : undefined;
  const who = c ? `${shortName(c)} brought it in. ` : '';
  return {
    iid, defId: 'cut_score', title: 'Cut up the score', week: s.week, mandatory: false, priority: 33, actors: c ? [c.id] : [], meta: c ? { charId: c.id, cut: total } : { cut: total },
    text: `${what}: ${$(total)} came into Family money. ${who}The whole family knows the number. How you cut it up is what they will remember: your end is bigger or smaller depending on how you do it.`,
    choices: CUT_WAYS.map((w) => cutChoice(s, w, total, what, key, by)),
    defaultChoiceId: 'book',
  };
}

/**
 * A windfall landed in Family money: offer the cut-up when it is big enough
 * (one at a time, at most every three weeks). Returns the event when queued.
 */
export function offerCut(s: GameState, value: number, what: string, by?: string): EventInstance | undefined {
  const v = Math.round(value);
  if (!(v >= cutThreshold(s)) || s.gameOver) return undefined;
  const st = ensureCut(s);
  if (st.last !== undefined && s.week - st.last < 3) return undefined;
  if ([...s.eventQueue, ...s.pendingEvents].some((e) => e.defId === 'cut_score')) return undefined;
  st.last = s.week;
  const ev = buildCutEvent(s, v, what, by && s.characters[by]?.alive && by !== s.playerId ? by : undefined);
  s.eventQueue.push(ev);
  return ev;
}

/** A boss who ate the lion's share lately: the capos' skim leans this much higher (fades over 13 weeks). */
export function cutSkim(s: GameState): number {
  const l = s.cut?.lion;
  if (!l?.length) return 0;
  const recent = l.filter((w) => s.week - w < 13).length;
  return Math.min(0.08, recent * 0.04);
}

export function describeCutOp(s: GameState, o: CutOp): string | undefined {
  const p = cutPlan(s, o.way, o.total);
  return `Your Pocket +${$(p.boss)} · envelopes ${$(p.share)}${p.party ? ` · party ${$(p.party)}` : ''}`;
}

/** Cut it up: the boss's cut to his Pocket, the envelopes through Share the Wealth, the party paid. */
export function applyCutOp(ctx: Ctx, o: CutOp): void {
  const s = ctx.s;
  const st = ensureCut(s);
  // Only what is still in Family money can be cut up (the week may have spent some of it).
  const total = Math.min(Math.round(o.total), Math.max(0, Math.round(s.money)));
  if (total <= 0) { ctx.log.push(`Cut up ${o.what}: the money was already gone.`); return; }
  const p = cutPlan(s, o.way, total);
  const k = CUT_SPLIT[o.way];
  if (p.boss > 0) xfer(ctx, 'treasury', 'personal', p.boss, 'don_personal_share', `${o.key}:boss`, { note: `Your cut of ${o.what}`, label: `Cut up the score: your cut of ${o.what}`, category: 'transfer' });
  if (p.share > 0) {
    const a = { op: 'share' as const, total: p.share, split: splitOf(o.way), by: 'rank' as const, pot: 'family' as const };
    const fx = previewShare(s, a).effects.filter((e) => e.type !== 'respect');
    for (const e of fx) applyEffect(ctx, e, { label: `Cut up the score: ${k.label}`, because: `cut up ${o.what}`, category: 'event' });
    commitShare(ctx, a, o.key);
  }
  if (p.party > 0) money(ctx, -p.party, `Cut up the score: the party (${o.what})`, 'event');
  if (o.way === 'lion') { st.lion.push(s.week); st.lion = st.lion.filter((w) => s.week - w < 26); }
  st.n++;
  const by = o.by ? s.characters[o.by] : undefined;
  const text = `Cut up ${o.what} (${$(total)}): ${k.label.toLowerCase()}. Your cut ${$(p.boss)}, the house ${$(p.house)}, envelopes ${$(p.share)}${p.party ? `, the party ${$(p.party)}` : ''}${by ? `; ${by.firstName} brought it in` : ''}.`;
  st.log.push([s.week, text]);
  if (st.log.length > 30) st.log.splice(0, st.log.length - 30);
  ctx.log.push(text);
}
