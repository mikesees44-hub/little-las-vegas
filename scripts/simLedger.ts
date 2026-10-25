/**
 * Per-line money ledger for the simulator (`npm run sim -- --ledger 1`).
 * Every money report line is bucketed by year, ledger category and a
 * normalized label (numbers and names folded away), then printed as the mean
 * per game for year 1 and year 3, biggest drains and earners first.
 */
import { writeFileSync } from 'node:fs';
import type { ReportLine } from '../src/engine/types';

type Bucket = Record<string, number>;
const byYear: Bucket[] = [];
/** Year-1 lines of the games that went bankrupt in year 1 (to see what sank them). */
const broke: Bucket = {};
let cur: Bucket[] = [];
let games = 0;
let brokeGames = 0;

/** Folds the variable parts of a label so lines from different weeks and games share a bucket. */
export function normLabel(label: string): string {
  return label
    .replace(/\$[\d,.]+[KkMm]?/g, '$#')
    .replace(/\d[\d,.]*/g, '#')
    .replace(/["“][^"”]*["”]/g, '"…"')
    .replace(/\(([^)]*)\)/g, '(…)')
    .replace(/\b(?:[A-Z][a-z'’]+\s){1,3}(?=(?:the|a|an|is|at|on|in|for|to|from|—|-|'s|’s)\b)/g, 'NAME ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
}

/** System name for a line: the category, refined by label keywords. */
export function systemOf(l: ReportLine): string {
  if (l.amount > 0 && ['street', 'business', 'kickup'].includes(l.category)) return `income:${l.category}`;
  const t = l.label.toLowerCase();
  const rules: [RegExp, string][] = [
    [/off-season|off season|winter/, 'winter'],
    [/^upkeep|\bupkeep\b/, 'upkeep'],
    [/^wages|crew pay|salaries of the crew/, 'crew pay'],
    [/to philadelphia|tribute|beat cops/, 'tribute'],
    [/household|appearances/, 'household'],
    [/manager/, 'econ:managers'],
    [/\bbuy:|upgrade|\blot\b|lease|property|\bhq\b|project|leverage|renovat|casino dream/, 'econ'],
    [/ordinance|\blaw\b|council|mayor|commission|payroll|campaign|lobby|cultivat|permit|election|official|freeholder|chief of police|a favor is asked|puppet/, 'politics'],
    [/bodyguard|front|stipend|blitz|protégé|protege|\bheir\b|groom|amends|ladder|promise|petition|launder/, 'power'],
    [/bones|prospect|the books|skim/, 'bones'],
    [/trip|travel|vacation|flight|hotel|on the lam|exile/, 'travel'],
    [/romance|courting|affair|propos|separat|wedding/, 'romance'],
    [/gift/, 'gifts'],
    [/good life/, 'good life'],
    [/loan|feldstein/, 'debt'],
    [/inside|lawyer/, 'prison'],
    [/community:/, 'community'],
  ];
  for (const [re, name] of rules) if (re.test(t)) return name;
  return l.category;
}

export function ledgerTap(week: number, lines: readonly ReportLine[]) {
  const y = Math.floor((week - 1) / 52); // week = the week being played (1-based)
  if (y < 0) return;
  const b = (cur[y] ??= {});
  for (const l of lines) {
    if (l.stat !== 'money' || !l.amount) continue;
    const k = `${systemOf(l)}\t${l.category}\t${normLabel(l.label)}`;
    b[k] = (b[k] ?? 0) + l.amount;
  }
}

/** Up-front cost of the orders the random player gave, per year and order family. */
const orderSpend: Bucket[] = [];
export function orderTap(week: number, family: string, cost: number) {
  const y = Math.floor((week - 1) / 52);
  const b = (orderSpend[y] ??= {});
  b[family] = (b[family] ?? 0) + Math.max(0, cost);
  b[`#${family}`] = (b[`#${family}`] ?? 0) + 1;
}

export function ledgerGameDone(bankruptYear1 = false) {
  games++;
  cur.forEach((b, y) => {
    const t = (byYear[y] ??= {});
    for (const [k, v] of Object.entries(b ?? {})) t[k] = (t[k] ?? 0) + v;
  });
  if (bankruptYear1) {
    brokeGames++;
    for (const [k, v] of Object.entries(cur[0] ?? {})) broke[k] = (broke[k] ?? 0) + v;
  }
  cur = [];
}

const fmt = (n: number) => `${n < 0 ? '-' : '+'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

export function printLedger(years = [0, 2], top = 30) {
  if (!games) return;
  console.log(`\nLEDGER (mean $ per game; system / category / line)`);
  for (const y of years) {
    const b = byYear[y];
    if (!b) continue;
    const sys: Bucket = {};
    for (const [k, v] of Object.entries(b)) sys[k.split('\t')[0]] = (sys[k.split('\t')[0]] ?? 0) + v;
    const total = Object.values(b).reduce((a, v) => a + v, 0);
    console.log(`  YEAR ${y + 1}: net ${fmt(total / games)}`);
    console.log(`    by system: ${Object.entries(sys).sort((a, c) => a[1] - c[1]).map(([k, v]) => `${k} ${fmt(v / games)}`).join(', ')}`);
    const rows = Object.entries(b).sort((a, c) => a[1] - c[1]);
    console.log(`    biggest drains:`);
    for (const [k, v] of rows.filter(([, v]) => v < 0).slice(0, top)) console.log(`      ${fmt(v / games).padStart(10)}  ${k.replace(/\t/g, ' | ')}`);
    console.log(`    biggest earners:`);
    for (const [k, v] of rows.filter(([, v]) => v > 0).reverse().slice(0, 12)) console.log(`      ${fmt(v / games).padStart(10)}  ${k.replace(/\t/g, ' | ')}`);
  }
  for (const y of years) {
    const b = orderSpend[y];
    if (!b) continue;
    const fams = Object.keys(b).filter((k) => !k.startsWith('#')).sort((a, c) => b[c] - b[a]);
    console.log(`  ORDERS GIVEN, YEAR ${y + 1} (up-front cost / count per game): ${fams.map((k) => `${k} ${fmt(-b[k] / games)} /${(b[`#${k}`] / games).toFixed(1)}`).join(', ')}`);
  }
  if (brokeGames) {
    const sys: Bucket = {};
    for (const [k, v] of Object.entries(broke)) sys[k.split('\t')[0]] = (sys[k.split('\t')[0]] ?? 0) + v;
    console.log(`  YEAR 1 of the ${brokeGames} games bankrupt in year 1 (mean per game):`);
    console.log(`    by system: ${Object.entries(sys).sort((a, c) => a[1] - c[1]).map(([k, v]) => `${k} ${fmt(v / brokeGames)}`).join(', ')}`);
    for (const [k, v] of Object.entries(broke).sort((a, c) => a[1] - c[1]).slice(0, 15)) console.log(`      ${fmt(v / brokeGames).padStart(10)}  ${k.replace(/\t/g, ' | ')}`);
  }
}

/** Writes the mean-per-game buckets to a JSON file (for diffing two runs). */
export function dumpLedger(path: string) {
  const out = byYear.map((b) => Object.fromEntries(Object.entries(b ?? {}).map(([k, v]) => [k, Math.round(v / Math.max(1, games))])));
  writeFileSync(path, JSON.stringify(out));
}
