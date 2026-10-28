/**
 * Balance tables from long-play logs (longplay.ts --dir): markdown to stdout.
 *   npx tsx scripts/playtest/tables.ts <dir>
 */
import { readdirSync, readFileSync } from 'node:fs';
import type { GameLog } from './longplay';

const dir = process.argv[2] ?? '.';
const games: GameLog[] = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const bots = [...new Set(games.map((g) => g.bot))];
const k = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}K`);
const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };
const at = (g: GameLog, y: number) => g.years.find((x) => x.year === y);

console.log(`Games: ${games.length} (${bots.join(', ')}), seeds ${[...new Set(games.map((g) => g.seed))].join(', ')}\n`);
console.log('### Outcome by style (median across seeds; "ended" = dynasty over before year 10)\n');
console.log('| Style | Fam cash Y1 | Y3 | Y5 | Y10 (or last) | Pocket Y10 | Loyalty Y1→last | Crew Y1→last | Deaths (house+crew) | Successions | Ended | Peak heat L/F/D |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const b of bots) {
  const gs = games.filter((g) => g.bot === b);
  const last = (g: GameLog) => g.years[g.years.length - 1];
  const col = (y: number) => { const xs = gs.map((g) => at(g, y)?.familyCash ?? NaN).filter((x) => !Number.isNaN(x)); return xs.length ? k(med(xs)) + (xs.length < gs.length ? ` (${xs.length}/${gs.length} alive)` : '') : '—'; };
  const deaths = gs.map((g) => g.years.reduce((a, y) => a + y.deaths, 0));
  const succ = gs.map((g) => g.years.reduce((a, y) => a + y.successions, 0));
  const peak = (bar: string) => Math.max(...gs.flatMap((g) => g.years.map((y) => y.heatMax[bar] ?? 0)));
  console.log(`| ${b} | ${col(1)} | ${col(3)} | ${col(5)} | ${k(med(gs.map((g) => last(g)?.familyCash ?? 0)))} | ${k(med(gs.map((g) => last(g)?.pocket ?? 0)))} | ${med(gs.map((g) => g.years[0]?.loyaltyMean ?? 0))}→${med(gs.map((g) => last(g)?.loyaltyMean ?? 0))} | ${med(gs.map((g) => g.years[0]?.crew ?? 0))}→${med(gs.map((g) => last(g)?.crew ?? 0))} | ${deaths.join('/')} | ${succ.join('/')} | ${gs.filter((g) => g.gameOver).map((g) => `${g.seed}:y${g.years.length}`).join(' ') || '—'} | ${peak('local')}/${peak('family')}/${peak('federal')} |`);
}

console.log('\n### Decisions and variety by style (mean per year)\n');
console.log('| Style | Popups/yr | Distinct popups/yr (Y1→Y10) | Same event within 8 wks | Meaningful popups/wk (Y1→last) | Dead-end weeks/yr | Orders queued/yr | Legal orders on offer | Rival moves/yr |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const b of bots) {
  const ys = games.filter((g) => g.bot === b).flatMap((g) => g.years);
  const m = (f: (y: (typeof ys)[0]) => number) => (ys.reduce((a, y) => a + f(y), 0) / Math.max(1, ys.length));
  const y1 = ys.filter((y) => y.year === 1); const yl = games.filter((g) => g.bot === b).map((g) => g.years[g.years.length - 1]).filter(Boolean);
  const mm = (xs: typeof ys, f: (y: (typeof ys)[0]) => number) => (xs.length ? (xs.reduce((a, y) => a + f(y), 0) / xs.length) : NaN);
  console.log(`| ${b} | ${m((y) => y.popups).toFixed(0)} | ${mm(y1, (y) => y.distinctPopups).toFixed(0)}→${mm(yl, (y) => y.distinctPopups).toFixed(0)} | ${m((y) => y.repeat8).toFixed(0)} | ${mm(y1, (y) => y.meaningfulPerWeek).toFixed(2)}→${mm(yl, (y) => y.meaningfulPerWeek).toFixed(2)} | ${m((y) => y.deadEndWeeks).toFixed(1)} | ${m((y) => y.ordersQueued).toFixed(0)} | ${m((y) => y.legalOrdersMean).toFixed(0)} | ${m((y) => Object.values(y.rivalMoves).reduce((a, v) => a + v, 0)).toFixed(0)} |`);
}

console.log('\n### Most-repeated popup titles (all games)\n');
const t: Record<string, number> = {};
for (const g of games) for (const [n, c] of g.titleRepeats) t[n] = (t[n] ?? 0) + c;
const total = games.reduce((a, g) => a + g.allTitles, 0);
for (const [n, c] of Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`- ${n}: ${c} (${((100 * c) / total).toFixed(1)}% of all popups)`);
console.log(`\nDistinct titles per game (median): ${med(games.map((g) => g.distinctTitles))} of ${med(games.map((g) => g.allTitles))} popups`);

console.log('\n### Integrity\n');
for (const g of games) {
  const nan = g.years.flatMap((y) => y.nanFlags);
  if (g.crashed || nan.length) console.log(`- ${g.bot}/${g.seed}: ${g.crashed ?? ''} ${nan.join(' ')}`);
}
console.log(`- crashes: ${games.filter((g) => g.crashed).length}, NaN flags: ${games.flatMap((g) => g.years.flatMap((y) => y.nanFlags)).length}`);
const ms = games.flatMap((g) => g.years.map((y) => y.msMax));
console.log(`- engine week time: p50-of-year-medians ${med(games.flatMap((g) => g.years.map((y) => y.msP50)))}ms, worst single week ${Math.max(...ms)}ms`);

console.log('\n### Deaths by cause (all games)\n');
const dc: Record<string, number> = {};
for (const g of games) for (const y of g.years) for (const d of y.deathCauses) dc[`${g.bot}: ${d}`] = (dc[`${g.bot}: ${d}`] ?? 0) + 1;
for (const [n, c] of Object.entries(dc).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`- ${n} ×${c}`);
