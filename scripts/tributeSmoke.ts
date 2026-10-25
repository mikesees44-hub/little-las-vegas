import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { randomChoices } from '../tests/helpers';
import { houseCash } from '../src/engine/tributeState';
let s = newGame(process.argv[2] ?? 'smoke');
let pops = 0;
for (let i = 0; i < Number(process.argv[3] ?? 60); i++) {
  const r = advanceWeek(s, randomChoices(s, i));
  s = r.state;
  const t = s.tribute!;
  const rep = t.reports[t.reports.length - 1];
  const aud = s.pendingEvents.filter((e) => e.defId === 'tribute_audience').length;
  pops += aud;
  if (i < 6 || i % 10 === 0) console.log(`wk${r.report.week} money ${Math.round(s.money)} pers ${t.acct.personal} res ${t.acct.reserve} env ${t.acct.envelope} | collected ${rep.collected} ub ${rep.ubShare}/${rep.ubSkim} pres ${rep.presented} ${rep.status} ${rep.ubType} crews ${rep.crews.length} short ${rep.crews.reduce((a, c) => a + c.short, 0)} pop ${aud} ev ${s.pendingEvents.map((e) => e.defId).filter(d=>d.startsWith('tr')).join(',')}`);
}
const t = s.tribute!;
console.log('house', houseCash(s), 'stats', JSON.stringify(t.stats), 'pops', pops, 'ub', JSON.stringify(t.ub));
console.log(t.reports[t.reports.length - 1].talk.map((x) => x.text).join('\n'));
