import type { ActionPreview } from './actions';
import { crew } from './characters';
import { fmtMoney } from './effects';
import type { Ctx } from './ledger';
import { pocketPrice } from './pocket';
import { inflation } from './property';
import { addOpinion } from './relations';
import { purseOf } from './crewPurse';
import { ensureSpend, type ShareSplit, type SpendAction } from './spendState';
import { xfer } from './tribute';
import type { Character, Effect, GameState, Rank } from './types';

/**
 * SHARE THE WEALTH: one button that spreads a sum over the people a boss is
 * supposed to look after. Crew bonuses (by rank, or by merit: what each man
 * brought in lately), envelopes for the widows of the men who died for the
 * family, a donation to the church, and turkeys for the neighborhood. The
 * preview shows each envelope and what it does: loyalty, respect, the
 * neighborhood's goodwill, the cops' families' turkeys (local heat), and the
 * IRS (only the visible part: a church gift and a truck of turkeys are seen;
 * an envelope is not).
 *
 * The money moves through the weekly take's journal (Family money or your
 * Pocket → each man's own money), so every dollar is accounted.
 *
 * Exported for other systems (the crew-care screens): sharePlan,
 * shareAction, SHARE_PRESETS, previewShare.
 */

const $ = (n: number) => fmtMoney(Math.round(n));

export const SHARE_PRESETS: { id: string; label: string; text: string; split: ShareSplit }[] = [
  { id: 'crew', label: 'All to the men', text: 'Every dollar in an envelope for the crew.', split: { crew: 100, widows: 0, church: 0, hood: 0 } },
  { id: 'oldway', label: 'The old way', text: 'The men first, the widows never forgotten, something for the church and the street.', split: { crew: 60, widows: 15, church: 10, hood: 15 } },
  { id: 'saint', label: 'The neighborhood saint', text: 'The church and the neighborhood see the most of it.', split: { crew: 30, widows: 20, church: 25, hood: 25 } },
  { id: 'widows', label: 'For the widows', text: 'The families of the men who died for us.', split: { crew: 20, widows: 70, church: 10, hood: 0 } },
];

export const SHARE_AMOUNTS = [1000, 2500, 5000, 10000, 25000];

/** What a share is worth by rank (rank mode). */
export const RANK_WEIGHT: Partial<Record<Rank, number>> = { underboss: 5, consigliere: 4, capo: 3, soldier: 1.5, associate: 1 };

export interface ShareLine {
  kind: 'man' | 'widow' | 'church' | 'hood';
  id?: string;
  name: string;
  amount: number;
  /** What it does to his (her) opinion of you. */
  opinion: number;
  note?: string;
}

export interface SharePlan {
  total: number;
  lines: ShareLine[];
  crew: number;
  widows: number;
  church: number;
  hood: number;
  turkeys: number;
  /** Average opinion change among the men. */
  loyalty: number;
  respect: number;
  /** Local heat (negative: the cops' families got turkeys too) and federal (a big visible show). */
  localHeat: number;
  fedHeat: number;
  influence: number;
  churchGoodwill: number;
  townGoodwill: number;
  /** What the IRS sees of it (the church and the turkeys; envelopes are cash). */
  seen: number;
  /** Men who feel slighted (merit mode: a thin envelope next to a fat one). */
  slighted: string[];
  notes: string[];
}

/** The men an envelope goes to (everyone of yours but the boss). */
export function shareMen(s: GameState): Character[] {
  return crew(s).filter((c) => c.id !== s.playerId && c.alive);
}

/** Widows of the family's men who died in the last five years. */
export function shareWidows(s: GameState): Character[] {
  const out: Character[] = [];
  for (const c of Object.values(s.characters)) {
    if (c.alive || c.faction !== 'player' || c.rank === 'civilian' || c.id === s.playerId || !c.spouseId) continue;
    if (c.death && s.week - c.death.week > 260) continue;
    const w = s.characters[c.spouseId];
    if (w?.alive && !out.includes(w)) out.push(w);
  }
  return out;
}

/** What each man brought in over the last eight weeks (merit mode). */
export function meritOf(s: GameState, id: string): number {
  return purseOf(s, id).slice(-8).reduce((a, w) => a + Math.max(0, w.earned), 0);
}

function norm(split: ShareSplit): ShareSplit {
  const t = Math.max(1, split.crew + split.widows + split.church + split.hood);
  return { crew: split.crew / t, widows: split.widows / t, church: split.church / t, hood: split.hood / t };
}

/** The whole distribution, line by line, and what it does (pure). */
export function sharePlan(s: GameState, total: number, split: ShareSplit, by: 'rank' | 'merit'): SharePlan {
  const infl = inflation(s);
  const men = shareMen(s);
  const wids = shareWidows(s);
  const n = norm(split);
  let crewAmt = Math.round(total * n.crew);
  let widAmt = Math.round(total * n.widows);
  let churchAmt = Math.round(total * n.church);
  let hoodAmt = total - crewAmt - widAmt - churchAmt;
  const notes: string[] = [];
  if (!wids.length && widAmt) { notes.push('No widows to look after: their share goes to the men.'); crewAmt += widAmt; widAmt = 0; }
  if (!men.length && crewAmt) { notes.push('No men to pay: their share goes to the neighborhood.'); hoodAmt += crewAmt; crewAmt = 0; }
  const lines: ShareLine[] = [];
  const slighted: string[] = [];
  if (crewAmt > 0) {
    const w = men.map((c) => (by === 'merit' ? 50 + meritOf(s, c.id) : RANK_WEIGHT[c.rank] ?? 1));
    const sum = w.reduce((a, x) => a + x, 0) || 1;
    const avg = crewAmt / men.length;
    let left = crewAmt;
    men.forEach((c, i) => {
      const amt = i === men.length - 1 ? left : Math.round((crewAmt * w[i]) / sum);
      left -= amt;
      let op = Math.max(1, Math.min(15, Math.round(2 + amt / infl / 100)));
      let note: string | undefined;
      if (by === 'merit' && amt < avg * 0.35) { op = -2; note = 'Crumbs, next to the others'; slighted.push(c.firstName); }
      lines.push({ kind: 'man', id: c.id, name: `${c.firstName} ${c.lastName}`, amount: amt, opinion: op, note });
    });
  }
  if (widAmt > 0) {
    const each = Math.floor(widAmt / wids.length);
    wids.forEach((c, i) => lines.push({ kind: 'widow', id: c.id, name: `${c.firstName} ${c.lastName}`, amount: i === wids.length - 1 ? widAmt - each * (wids.length - 1) : each, opinion: Math.min(20, Math.round(5 + each / infl / 100)) }));
  }
  if (churchAmt > 0) lines.push({ kind: 'church', name: 'The church (St. Ann\'s)', amount: churchAmt, opinion: 0 });
  const turkeys = Math.floor(hoodAmt / (6 * infl));
  if (hoodAmt > 0) lines.push({ kind: 'hood', name: `Turkeys and coal for the neighborhood (${turkeys.toLocaleString('en-US')} families)`, amount: hoodAmt, opinion: 0 });
  const menLines = lines.filter((l) => l.kind === 'man');
  const loyalty = menLines.length ? Math.round((menLines.reduce((a, l) => a + l.opinion, 0) / menLines.length) * 10) / 10 : 0;
  const real = (v: number) => v / infl;
  const respect = Math.min(8, Math.floor(real(total) / 2500) + (real(churchAmt) >= 1000 ? 1 : 0) + (real(hoodAmt) >= 1000 ? 1 : 0));
  const influence = Math.min(10, Math.round(real(hoodAmt) / 300));
  const churchGoodwill = Math.min(10, Math.round(real(churchAmt) / 500));
  const townGoodwill = Math.min(10, Math.round(real(hoodAmt) / 400));
  const localHeat = -Math.min(3, Math.floor(real(hoodAmt) / 2000));
  const seen = Math.round((churchAmt + hoodAmt) * 0.5);
  const fedHeat = real(churchAmt + hoodAmt) >= 10000 ? 1 : 0;
  if (slighted.length) notes.push(`${slighted.slice(0, 3).join(', ')}${slighted.length > 3 ? ' and others' : ''} will feel the thin envelope.`);
  if (widAmt) notes.push('Every man sees the widows looked after: it could be his wife.');
  return { total, lines, crew: crewAmt, widows: widAmt, church: churchAmt, hood: hoodAmt, turkeys, loyalty, respect, localHeat, fedHeat, influence, churchGoodwill, townGoodwill, seen, slighted, notes };
}

/** The order for a distribution (one click; the confirm window shows the preview). */
export function shareAction(total: number, split: ShareSplit, by: 'rank' | 'merit' = 'rank', pot: 'family' | 'pocket' = 'family'): { kind: 'spend'; op: SpendAction } {
  return { kind: 'spend', op: { op: 'share', total: Math.round(total), split, by, pot } };
}

function mainDistrict(s: GameState): string | undefined {
  let best: string | undefined;
  let v = -1;
  for (const d of s.districts) if ((d.influence.player ?? 0) > v) { v = d.influence.player ?? 0; best = d.id; }
  return best;
}

export function previewShare(s: GameState, a: Extract<SpendAction, { op: 'share' }>): ActionPreview {
  const p = sharePlan(s, a.total, a.split, a.by);
  const title = `Share the wealth: ${$(a.total)}`;
  const outside = p.church + p.hood;
  const effects: Effect[] = [];
  let why: string | undefined;
  if (a.total < 100) why = 'At least $100';
  const have = a.pot === 'pocket' ? Math.max(0, s.tribute?.acct.personal ?? 0) : Math.max(0, s.money);
  if (!why && have < a.total) why = `Needs ${$(a.total)} of ${a.pot === 'pocket' ? 'your pocket' : 'Family money'} (there is ${$(have)})`;
  if (outside > 0) {
    if (a.pot === 'pocket') effects.push(...pocketPrice(s, outside, `${title}: the church and the neighborhood`).effects);
    else effects.push({ type: 'money', amount: -outside, label: `${title}: the church and the neighborhood` });
  }
  if (p.crew + p.widows > 0) effects.push({ type: 'econ', op: { op: 'note', text: `Envelopes: ${$(p.crew)} to ${p.lines.filter((l) => l.kind === 'man').length} men (loyalty ${p.loyalty >= 0 ? '+' : ''}${p.loyalty} on average)${p.widows ? `, ${$(p.widows)} to ${p.lines.filter((l) => l.kind === 'widow').length} widow${p.lines.filter((l) => l.kind === 'widow').length === 1 ? '' : 's'}` : ''}, from ${a.pot === 'pocket' ? 'your pocket' : 'Family money'}` }, label: title } as Effect);
  if (p.respect) effects.push({ type: 'respect', amount: p.respect, label: `${title}: the town talks` });
  if (p.widows) effects.push({ type: 'crewOpinion', amount: 2, reason: 'The boss looks after the widows', label: title });
  const d = mainDistrict(s);
  if (p.influence && d) effects.push({ type: 'influence', district: d, faction: 'player', amount: p.influence, label: `${title}: turkeys on every stoop` });
  if (p.localHeat) effects.push({ type: 'heat', bar: 'local', amount: p.localHeat, label: `${title}: the cops' families got turkeys too` });
  if (p.fedHeat) effects.push({ type: 'heat', bar: 'federal', amount: p.fedHeat, label: `${title}: a big show of money` });
  const notes = [...p.notes];
  if (p.churchGoodwill) notes.push(`The Church +${p.churchGoodwill}`);
  if (p.townGoodwill) notes.push(`The town +${p.townGoodwill}`);
  if (p.seen) notes.push(`The IRS sees ${$(p.seen)} of it`);
  if (notes.length) effects.push({ type: 'econ', op: { op: 'note', text: notes.join(' · ') }, label: title } as Effect);
  return {
    title, detail: p.lines.slice(0, 6).map((l) => `${l.name} ${$(l.amount)}`).join(' · ') + (p.lines.length > 6 ? ` · and ${p.lines.length - 6} more` : ''),
    effects, cost: a.total, pot: a.pot === 'pocket' ? 'pocket' : undefined, because: `shared ${$(a.total)} with the family and the neighborhood`,
    disabledReason: why, category: 'event', verb: `Share it — ${$(a.total)}`,
  };
}

export function commitShare(ctx: Ctx, a: Extract<SpendAction, { op: 'share' }>): void {
  const s = ctx.s;
  const p = sharePlan(s, a.total, a.split, a.by);
  const from = a.pot === 'pocket' ? 'personal' : 'treasury';
  for (const l of p.lines) {
    if ((l.kind !== 'man' && l.kind !== 'widow') || !l.id || l.amount <= 0) continue;
    xfer(ctx, from, `wealth:${l.id}`, l.amount, 'assistance', `w${s.week}:share:${l.id}`, { note: l.kind === 'widow' ? `An envelope for ${l.name}` : `A bonus for ${l.name}`, category: 'cost' });
    addOpinion(s, l.id, s.playerId, l.opinion < 0 ? 'A thin envelope next to a fat one' : l.kind === 'widow' ? 'He never forgot my husband' : 'The boss shared the wealth', l.opinion, 1);
  }
  const sp = ensureSpend(s);
  if (p.churchGoodwill) sp.standing.church = (sp.standing.church ?? 0) + p.churchGoodwill;
  if (p.townGoodwill) sp.standing.town = (sp.standing.town ?? 0) + p.townGoodwill;
  if (p.seen) { sp.seen.push([s.week, p.seen]); sp.seen = sp.seen.filter(([w]) => s.week - w < 52); }
  sp.spent[a.pot] += a.total;
  sp.last.share = s.week;
  const text = `Shared ${$(a.total)}: ${p.crew ? `${$(p.crew)} to the men` : ''}${p.widows ? `, ${$(p.widows)} to the widows` : ''}${p.church ? `, ${$(p.church)} to the church` : ''}${p.hood ? `, ${p.turkeys.toLocaleString('en-US')} turkeys` : ''}.`.replace(': , ', ': ');
  sp.log.push([s.week, text]);
  if (sp.log.length > 40) sp.log.splice(0, sp.log.length - 40);
  ctx.log.push(text);
}
