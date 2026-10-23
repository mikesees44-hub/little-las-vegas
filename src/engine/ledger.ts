import type { GameState, HeatBar, LedgerCategory, ReportLine, Stat } from './types';

/**
 * THE ledger. Every change to money, respect or a heat bar anywhere in the
 * engine goes through `post()`. It applies the change (with clamping for
 * bounded stats) and records a labelled report line with the amount that was
 * actually applied. Reconciliation (sum of lines == actual delta) therefore
 * holds by construction, and the test-suite + simulator verify nothing in the
 * engine bypasses it.
 */

export interface Ctx {
  s: GameState;
  lines: ReportLine[];
  log: string[];
  /** Gross income earned this week (before costs). Used for rival caps and tribute. */
  gross: number;
  /** Money taken from the player by rivals this week (for capping). */
  rivalMoney: number;
  /** Heat added to the player by rivals this week, per bar (for capping). */
  rivalHeat: Record<HeatBar, number>;
  /** Positive heat gained this week per bar (decides whether the week was "quiet"). */
  heatGained: Record<HeatBar, number>;
  /** Number of event popups surfaced this week. */
  popups: number;
}

export function newCtx(s: GameState): Ctx {
  return {
    s,
    lines: [],
    log: [],
    gross: 0,
    rivalMoney: 0,
    rivalHeat: { local: 0, family: 0, federal: 0 },
    heatGained: { local: 0, family: 0, federal: 0 },
    popups: 0,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function post(ctx: Ctx, stat: Stat, requested: number, label: string, category: LedgerCategory): number {
  const s = ctx.s;
  requested = Math.round(requested);
  if (requested === 0) return 0;
  let applied: number;
  if (stat === 'money') {
    s.money += requested;
    applied = requested;
  } else if (stat === 'respect') {
    const before = s.respect;
    s.respect = clamp(before + requested, 0, 100);
    applied = s.respect - before;
  } else {
    const bar = stat.slice(5) as HeatBar;
    const before = s.heat[bar];
    s.heat[bar] = clamp(before + requested, 0, 100);
    applied = s.heat[bar] - before;
    if (applied > 0) ctx.heatGained[bar] += applied;
  }
  const line: ReportLine = { stat, amount: applied, label, category };
  if (applied !== requested) line.requested = requested;
  ctx.lines.push(line);
  return applied;
}

export const money = (ctx: Ctx, amount: number, label: string, category: LedgerCategory) => post(ctx, 'money', amount, label, category);
export const respect = (ctx: Ctx, amount: number, label: string, category: LedgerCategory) => post(ctx, 'respect', amount, label, category);
export const heat = (ctx: Ctx, bar: HeatBar, amount: number, label: string, category: LedgerCategory) =>
  post(ctx, `heat.${bar}`, amount, label, category);

/** Sum of report lines per stat. */
export function sumLines(lines: readonly ReportLine[]): Record<Stat, number> {
  const out: Record<string, number> = { money: 0, respect: 0, 'heat.local': 0, 'heat.family': 0, 'heat.federal': 0 };
  for (const l of lines) out[l.stat] += l.amount;
  return out as Record<Stat, number>;
}

/** Returns a list of human-readable reconciliation failures (empty = OK). */
export function reconcile(report: {
  start: { money: number; respect: number; heat: Record<HeatBar, number> };
  end: { money: number; respect: number; heat: Record<HeatBar, number> };
  lines: readonly ReportLine[];
}): string[] {
  const sums = sumLines(report.lines);
  const errs: string[] = [];
  const check = (stat: Stat, a: number, b: number) => {
    const delta = b - a;
    if (Math.abs(sums[stat] - delta) > 1e-9) errs.push(`${stat}: lines sum ${sums[stat]} but actual delta ${delta}`);
  };
  check('money', report.start.money, report.end.money);
  check('respect', report.start.respect, report.end.respect);
  for (const bar of ['local', 'family', 'federal'] as HeatBar[]) check(`heat.${bar}`, report.start.heat[bar], report.end.heat[bar]);
  return errs;
}

/**
 * Rival-caused money loss, capped so that total rival losses in a week never
 * exceed `capFraction` of the week's gross earnings.
 */
export function rivalMoneyHit(ctx: Ctx, amount: number, label: string, capFraction: number): number {
  const cap = Math.max(0, Math.floor(ctx.gross * capFraction) - ctx.rivalMoney);
  const take = Math.min(Math.abs(amount), cap);
  if (take <= 0) {
    ctx.log.push(`${label} — the crew covered it, no money lost.`);
    return 0;
  }
  ctx.rivalMoney += take;
  return -money(ctx, -take, label, 'rival');
}

export function rivalHeatHit(ctx: Ctx, bar: HeatBar, amount: number, label: string, capPerBar: number): number {
  const room = Math.max(0, capPerBar - ctx.rivalHeat[bar]);
  const add = Math.min(amount, room);
  if (add <= 0) return 0;
  ctx.rivalHeat[bar] += add;
  return heat(ctx, bar, add, label, 'rival');
}
