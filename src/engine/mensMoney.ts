import { purseOf } from './crewPurse';
import { eaters, openJobs } from './eat';
import { moneyNeedOf, type MoneyLevel, type MoneyNeed } from './moneyNeed';
import { debtsOf } from './myMen';
import type { Character, GameState } from './types';

/**
 * YOUR MEN'S MONEY: one easy report. For every man: what he has, what he has
 * earned, kicked up, kept and spent a week lately (his last four weeks), what
 * he owes, which way his money is going, and the one best way to help him if
 * he needs it (moneyNeed.ts). Pure.
 */

export interface MoneyRow {
  c: Character;
  has: number;
  /** Per week, his last four weeks. */
  earned: number;
  up: number;
  kept: number;
  spent: number;
  owes: number;
  /** His money now against four weeks ago. */
  trend: number;
  level: MoneyLevel;
  need: MoneyNeed;
}

const LEVEL_ORDER: MoneyLevel[] = ['broke', 'tight', 'ok', 'flush'];

export function mensMoney(s: GameState): { rows: MoneyRow[]; total: { has: number; up: number; owes: number; broke: number; tight: number } } {
  const jobs = openJobs(s);
  const rows = eaters(s).map((c) => {
    const p = purseOf(s, c.id).slice(-4);
    const avg = (k: 'earned' | 'up' | 'kept' | 'spent') => (p.length ? Math.round(p.reduce((a, x) => a + x[k], 0) / p.length) : 0);
    const need = moneyNeedOf(s, c, jobs);
    const has = Math.round(c.wealth);
    return { c, has, earned: avg('earned'), up: avg('up'), kept: avg('kept'), spent: avg('spent'), owes: debtsOf(s, c).total, trend: p.length ? has - Math.round(p[0].wealth) : 0, level: need.level, need };
  }).sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.has - b.has || (a.c.id < b.c.id ? -1 : 1));
  return {
    rows,
    total: { has: rows.reduce((a, r) => a + r.has, 0), up: rows.reduce((a, r) => a + r.up, 0), owes: rows.reduce((a, r) => a + r.owes, 0), broke: rows.filter((r) => r.level === 'broke').length, tight: rows.filter((r) => r.level === 'tight').length },
  };
}
