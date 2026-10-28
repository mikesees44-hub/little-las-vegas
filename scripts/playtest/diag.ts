/**
 * Money diagnosis for one long-play game: the biggest single-week swings, and each year's top money
 * lines by label (what the Family earns from and spends on).
 *   npx tsx scripts/playtest/diag.ts --bot passive --seed s2 --years 6
 */
import { newGameWith } from '../../src/engine/starts';
import { advanceWeek } from '../../src/engine/engine';
import { familyCash } from '../../src/engine/tributeState';
import { botChoices, type BotId } from './bots';

function arg(n: string, d: string): string { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
const bot = arg('bot', 'passive') as BotId;
const seed = arg('seed', 's1');
const years = Number(arg('years', '3'));
const big = Number(arg('big', '40000'));
let s = newGameWith(seed, 'classic');
let byLabel: Record<string, number> = {};
for (let w = 0; w < years * 52 && !s.gameOver; w++) {
  const before = familyCash(s);
  const r = advanceWeek(s, botChoices(s, bot, w).choices);
  s = r.state;
  for (const l of r.report.lines) {
    if (l.stat !== 'money') continue;
    const k = l.label.replace(/\d[\d,]*/g, '#').slice(0, 70);
    byLabel[k] = (byLabel[k] ?? 0) + l.amount;
    if (Math.abs(l.amount) >= big) console.log(`  wk${s.week} BIG ${l.amount} ${l.label}`);
  }
  const d = familyCash(s) - before;
  if (Math.abs(d) >= big) console.log(`wk${s.week} family cash ${before} -> ${familyCash(s)} (${d})`);
  if (w % 52 === 51) {
    const top = Object.entries(byLabel).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, Number(arg("top", "14")));
    console.log(`== ${bot}/${seed} year ${Math.floor(w / 52) + 1}: family ${familyCash(s)} pocket ${s.tribute?.acct.personal ?? 0}`);
    for (const [k, v] of top) console.log(`   ${v > 0 ? '+' : ''}${Math.round(v)}  ${k}`);
    byLabel = {};
  }
}
if (s.gameOver) console.log('GAME OVER', s.gameOver.reason, s.week);
