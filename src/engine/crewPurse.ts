import { attr } from './attrs';
import { crew, hasTrait, isFree } from './characters';
import type { Ctx } from './ledger';
import { rand } from './rng';
import { xfer } from './tribute';
import { boughtCar, boughtHome, closeEstate, financeWeek, lostAtTrack } from './crewFinance';
import { ensureTribute, type TributeReport, type TributeState } from './tributeState';
import type { Character, GameState } from './types';

/**
 * THE MEN'S OWN MONEY (the crew's purses).
 *
 * Every capo, soldier and associate keeps his end after kicking up, and it
 * builds in his own pocket (`Character.wealth`, the `wealth:<id>` account in
 * the weekly take's journal). He spends it too, modestly and abstractly: the
 * household, a car, a down payment on a house, a wedding envelope, what a
 * gambler loses at the track, a shylock's debt when the house costs more than
 * he has. Every movement is a journal transfer, so the board's figures are
 * the ledger's.
 *
 * Each week a PurseWeek per man records, from the week's report and journal:
 * earned (what his work brought in), owed (his assessment), up (kicked up,
 * arrears made good included), short, kept (what reached his pocket in the
 * open: his end of his hustle, his end of the corners, a capo's end, the
 * underboss's share, less what a capo paid down to his men), spent, and his
 * money at the end of the week. Hidden money (a skim, dues he pocketed) is
 * NOT in `kept`: it only shows in his money growing faster than his envelope.
 *
 * Money matters: a man in debt comes up short more (tribute.ts shortOdds), a
 * broke man with kids asks for help, a rich ambitious capo wants a bigger end
 * (tributeFlow.ts), a rich underboss gathers standing faster.
 */

export interface PurseWeek {
  w: number;
  earned: number;
  owed: number;
  up: number;
  short: number;
  kept: number;
  spent: number;
  /** His own money at the end of the week. */
  wealth: number;
}

export interface PurseLife {
  /** What he owes outside the family (a shylock, the credit man). */
  debt: number;
  /** Week he bought a car / put a down payment on a house. */
  car?: number;
  house?: number;
  /** Lifetime totals since the take began. */
  earned: number;
  up: number;
  kept: number;
  spent: number;
  /** The last thing he spent real money on. */
  last?: string;
}

export const PURSE_WEEKS = 8;

/** The bare weekly household by rank (a 1960 South Jersey family, before kids); a man also lives up to his income. */
const HOUSEHOLD: Record<string, number> = { associate: 5, soldier: 8, capo: 15, underboss: 20, consigliere: 15 };
/** Share of what he has been keeping (8-week average) that goes on the house. */
const LIVES_ON = 0.3;

export const CAR_PRICE = 1800;
export const HOUSE_DOWN = 9000;

export function purseOf(s: GameState, id: string): PurseWeek[] {
  return s.tribute?.purse?.[id] ?? [];
}

export function lifeOf(s: GameState, id: string): PurseLife | undefined {
  return s.tribute?.life?.[id];
}

/** Men whose purses the board follows. */
export function purseMen(s: GameState): Character[] {
  return crew(s).filter((c) => c.alive && c.id !== s.playerId && (c.rank === 'capo' || c.rank === 'soldier' || c.rank === 'associate' || c.rank === 'underboss' || c.rank === 'consigliere'));
}

const KEEP_CATS = new Set(['member_keep', 'capo_distribution', 'underboss_distribution']);

/** What reached each man's pocket in the open this week (journal), less what a capo paid down to his men. */
export function keptThisWeek(t: TributeState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of t.journal) {
    if (x.h || !KEEP_CATS.has(x.c)) continue;
    if (x.t.startsWith('wealth:')) out[x.t.slice(7)] = (out[x.t.slice(7)] ?? 0) + x.a;
    if (x.f.startsWith('wealth:') && x.c === 'capo_distribution') out[x.f.slice(7)] = (out[x.f.slice(7)] ?? 0) - x.a;
  }
  return out;
}

/** Sum a man's lines across the report (corners, hustle, crew work; any crew, or direct). */
export function linesOf(rep: TributeReport, id: string): { earned: number; owed: number; up: number; short: number } {
  const o = { earned: 0, owed: 0, up: 0, short: 0 };
  for (const ml of [...rep.crews.flatMap((c) => c.members), ...rep.direct]) {
    if (ml.id !== id) continue;
    o.earned += ml.earned;
    o.owed += ml.due;
    o.up += ml.paid + (ml.back ?? 0);
    o.short += Math.max(0, ml.due - ml.paid);
  }
  return o;
}

function spend(ctx: Ctx, c: Character, amount: number, what: string, key: string): number {
  return xfer(ctx, `wealth:${c.id}`, `ext:life:${what}`, amount, 'expense', `w${ctx.s.week}:life:${key}:${c.id}`, { note: `${c.firstName} ${c.lastName}: ${what}` });
}

/**
 * The week's purses (tributeFlow.ts, after the crews are counted): record
 * what each man earned, kicked up and kept; then he lives on it.
 */
export function purseWeek(ctx: Ctx, rep: TributeReport): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  t.purse ??= {};
  t.life ??= {};
  const kept = keptThisWeek(t);
  // Everyone in the family, and anyone who was in this week's envelope (a man who walked out after the count).
  const men = purseMen(s);
  const seen = new Set(men.map((c) => c.id));
  for (const ml of [...rep.crews.flatMap((c) => c.members), ...rep.direct]) {
    const c = s.characters[ml.id];
    if (c && !seen.has(c.id) && c.id !== s.playerId) { men.push(c); seen.add(c.id); }
  }
  const alive = new Set(men.map((c) => c.id));
  for (const c of men) {
    const l = linesOf(rep, c.id);
    const life = (t.life[c.id] ??= { debt: 0, earned: 0, up: 0, kept: 0, spent: 0 });
    const k = Math.max(0, kept[c.id] ?? 0);
    const prev = t.purse[c.id] ?? [];
    const avg = (prev.reduce((a, r) => a + r.kept, 0) + k) / (prev.length + 1);
    const spent = live(ctx, t, c, life, k, avg);
    const row: PurseWeek = { w: s.week, earned: l.earned, owed: l.owed, up: l.up, short: l.short, kept: k, spent, wealth: Math.round(c.wealth) };
    const rows = (t.purse[c.id] ??= []);
    if (rows.length && rows[rows.length - 1].w === s.week) rows[rows.length - 1] = row;
    else rows.push(row);
    if (rows.length > PURSE_WEEKS) rows.splice(0, rows.length - PURSE_WEEKS);
    life.earned += l.earned;
    life.up += l.up;
    life.kept += k;
    life.spent += spent;
    // His own financial life: savings, the mortgage, loans between the men, a stake in a business (crewFinance.ts).
    if (c.alive) financeWeek(ctx, c, life, k, spent);
  }
  // The dead and the departed: their purses close (the heir's inheritance is the dynasty's business).
  for (const id of Object.keys(t.purse)) if (!alive.has(id)) delete t.purse[id];
  // A dead man's books stay: his estate (assets, debts, history) is kept on the record.
  for (const id of Object.keys(t.life)) {
    if (alive.has(id)) continue;
    const c = s.characters[id];
    if (c && !c.alive && (t.life[id] as PurseLife & { fin?: unknown }).fin) closeEstate(s, c);
    else if (!c?.alive) delete t.life[id];
  }
}

/** He lives on what he has: the house, the debts, and now and then something bigger. */
function live(ctx: Ctx, t: TributeState, c: Character, life: PurseLife, kept: number, avg: number): number {
  const s = ctx.s;
  if (!isFree(s, c)) return 0;
  let spent = 0;
  const kids = c.household?.kids?.length ?? 0;
  const house = Math.round((HOUSEHOLD[c.rank] ?? 5) * (1 + 0.15 * kids + (c.household?.wife || c.spouseId ? 0.3 : 0)) + avg * LIVES_ON);
  const paid = spend(ctx, c, house, 'household', 'house');
  spent += paid;
  if (paid < house) {
    // He borrows the rest: a shylock, the credit man, his mother-in-law.
    life.debt += house - paid;
    if (!life.last || !life.last.startsWith('borrowed')) life.last = 'borrowed to cover the house';
  } else if (life.debt > 0) {
    const back = spend(ctx, c, Math.min(life.debt, Math.max(10, Math.round(kept * 0.3))), 'debts', 'debt');
    life.debt -= back;
    spent += back;
  }
  life.debt = Math.min(life.debt, 5000);
  // A gambler's week at the track.
  if (hasTrait(c, 'Gambler') && kept > 0 && rand(t) < 0.3) {
    const lost = spend(ctx, c, Math.round(kept * (0.2 + rand(t) * 0.4)), 'the track', 'track');
    if (lost) { life.last = `lost ${'$' + lost.toLocaleString('en-US')} at the track`; lostAtTrack(s, c, life, lost); }
    spent += lost;
  }
  if (hasTrait(c, 'Drinker') && kept > 0 && rand(t) < 0.25) spent += spend(ctx, c, Math.round(kept * 0.1), 'the bar tab', 'bar');
  // Something bigger, when he has it.
  if (!life.car && c.wealth > CAR_PRICE * 2 && rand(t) < 0.03) {
    const got = spend(ctx, c, CAR_PRICE, 'a new car', 'car');
    if (got) { life.car = s.week; life.last = 'bought a new Buick'; spent += got; boughtCar(s, c, life, got); }
  } else if (!life.house && c.wealth > HOUSE_DOWN * 2 && rand(t) < 0.02) {
    const got = spend(ctx, c, HOUSE_DOWN, 'a house', 'home');
    if (got) { life.house = s.week; life.last = 'put money down on a house'; spent += got; boughtHome(s, c, life, got); }
  } else if (c.wealth > 300 && rand(t) < 0.02) {
    const got = spend(ctx, c, 50 + Math.round(rand(t) * 150), 'a wedding envelope', 'gift');
    if (got) { life.last = 'gave at a wedding'; spent += got; }
  } else if (c.wealth > 25000 && (hasTrait(c, 'Greedy') || attr(s, c, 'ambition') >= 65) && rand(t) < 0.1) {
    const got = spend(ctx, c, Math.round(c.wealth * 0.01), 'the high life', 'high');
    if (got) { life.last = 'lives large'; spent += got; }
  }
  return spent;
}

/** Board flags from the records. */
export type PurseFlag = 'short' | 'rising' | 'debt' | 'rich' | 'above';

export function purseFlags(s: GameState, c: Character): PurseFlag[] {
  const rows = purseOf(s, c.id);
  const life = lifeOf(s, c.id);
  const out: PurseFlag[] = [];
  const last = rows[rows.length - 1];
  if (last && last.short > 0) out.push('short');
  if (rows.length >= 6) {
    const a = rows.slice(0, 3).reduce((x, r) => x + r.up, 0);
    const b = rows.slice(-3).reduce((x, r) => x + r.up, 0);
    if (b >= 150 && b > a * 1.3) out.push('rising');
  }
  if ((life?.debt ?? 0) > 0) out.push('debt');
  if (c.wealth >= 20000) out.push('rich');
  // His money grew by more than his open end and his spending explain (8 weeks).
  if (rows.length >= 4) {
    const grew = rows[rows.length - 1].wealth - rows[0].wealth + rows[0].kept - rows[0].spent;
    const open = rows.reduce((x, r) => x + r.kept - r.spent, 0);
    if (grew - open > Math.max(400, open * 0.5)) out.push('above');
  }
  return out;
}

export const FLAG_LABEL: Record<PurseFlag, string> = {
  short: 'came up short',
  rising: 'rising star',
  debt: 'in debt',
  rich: 'rich',
  above: 'lives above his envelope',
};

export interface BoardRow {
  id: string;
  rank: string;
  crewId?: string;
  earned: number;
  owed: number;
  up: number;
  short: number;
  kept: number;
  spent: number;
  wealth: number;
  trend: number[];
  flags: PurseFlag[];
  debt: number;
}

/** The family's earnings, one row a man, from the purses (last recorded week). */
export function earningsBoard(s: GameState): { week?: number; rows: BoardRow[] } {
  const men = purseMen(s);
  const weeks = men.flatMap((c) => purseOf(s, c.id).map((r) => r.w));
  const week = weeks.length ? Math.max(...weeks) : undefined;
  // A man who left after the count is still on this week's board.
  const ids = new Set(men.map((c) => c.id));
  for (const [id, rows] of Object.entries(s.tribute?.purse ?? {})) if (!ids.has(id) && rows.some((r) => r.w === week) && s.characters[id]) { men.push(s.characters[id]); ids.add(id); }
  const rows = men.map((c) => {
    const ps = purseOf(s, c.id);
    const r = ps.find((x) => x.w === week);
    return {
      id: c.id, rank: c.rank, crewId: c.rank === 'capo' ? c.id : c.capoId,
      earned: r?.earned ?? 0, owed: r?.owed ?? 0, up: r?.up ?? 0, short: r?.short ?? 0, kept: r?.kept ?? 0, spent: r?.spent ?? 0,
      wealth: Math.round(c.wealth), trend: ps.map((x) => x.up), flags: purseFlags(s, c), debt: lifeOf(s, c.id)?.debt ?? 0,
    };
  });
  return { week, rows };
}

/**
 * How the men's kick-ups become what reached the underboss (every figure from the report):
 * kicked up − skimmed − held back + a capo's late money + investments + last week's carry = collected.
 */
export function upToCollected(rep: TributeReport): { up: number; skim: number; held: number; late: number; inv: number; carry: number; collected: number; ok: boolean } {
  const up = [...rep.crews.flatMap((c) => c.members), ...rep.direct].reduce((a, m) => a + m.paid + (m.back ?? 0), 0);
  const skim = rep.crews.reduce((a, c) => a + c.skim, 0);
  const held = rep.crews.reduce((a, c) => a + c.held, 0);
  const late = rep.crews.reduce((a, c) => a + (c.late ?? 0), 0);
  const inv = rep.inv ?? 0;
  const carry = rep.carry ?? 0;
  return { up, skim, held, late, inv, carry, collected: rep.collected, ok: up - skim - held + late + inv + carry === rep.collected };
}
