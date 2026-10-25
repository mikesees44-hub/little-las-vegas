/** Dump one game's popups (title, text, choices) to stdout: npx tsx scripts/dumpPopups.ts --seed x --weeks 52 [--filter let_] */
import { newGameWith } from '../src/engine/starts';
import { advanceWeek } from '../src/engine/engine';
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
let s = newGameWith(arg('seed', 'dump'), 'classic');
const filter = arg('filter', '');
for (let w = 0; w < Number(arg('weeks', '52')) && !s.gameOver; w++) {
  for (const e of s.pendingEvents) {
    if (filter && !e.defId.startsWith(filter)) continue;
    console.log(`\n[wk ${s.week} ${s.date.m}/${s.date.y}] ${e.defId}${e.mandatory ? ' (mandatory)' : ''}  ${e.meta?.sv ?? ''}\n  ${e.title}\n  ${e.text}\n${e.choices.map((c) => `   - ${c.label}${c.detail ? ` (${c.detail})` : ''}`).join('\n')}`);
  }
  const r = advanceWeek(s, {});
  if (r.report.motion?.length) console.log(`\n[wk ${r.report.week}] IN MOTION: ${r.report.motion.join(' | ')}`);
  s = r.state;
}
