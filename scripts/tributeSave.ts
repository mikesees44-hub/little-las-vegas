/** Dev helper: play until the underboss's audience is waiting with something on the desk, and write the save. */
import { writeFileSync } from 'node:fs';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { randomChoices } from '../tests/helpers';
let s = newGame(process.argv[3] ?? 'office');
for (let i = 0; i < 200; i++) {
  const ch = randomChoices(s, i);
  for (const e of s.pendingEvents) if (e.defId === 'tribute_audience') ch.choices![e.iid] = 'policy';
  s = advanceWeek(s, ch).state;
  const t = s.tribute!;
  const rep = t.reports[t.reports.length - 1];
  if (i > 8 && rep.status === 'presented' && rep.crews.some((c) => c.short > 0) && rep.talk.length >= 8) break;
}
writeFileSync(process.argv[2], JSON.stringify(s));
const rep = s.tribute!.reports[s.tribute!.reports.length - 1];
console.log('week', s.week, rep.status, rep.presented, rep.talk.map((x) => x.text).join(' | '));
