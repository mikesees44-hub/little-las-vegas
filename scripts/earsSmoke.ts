import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { legalActions, previewAction } from '../src/engine/actions';
import { rand } from '../src/engine/rng';
import type { GameState, PlayerAction } from '../src/engine/types';

const seed = process.argv[2] ?? 'ears1';
const weeks = Number(process.argv[3] ?? 104);
let s: GameState = newGame(seed);
const seen: string[] = [];
const h = { rng: 12345 };
for (let w = 0; w < weeks && !s.gameOver; w++) {
  const choices: Record<string, string> = {};
  for (const ev of s.pendingEvents) {
    if (ev.defId.startsWith('ears')) seen.push(`[wk ${s.week}] ${ev.defId} :: ${ev.title} :: ${ev.text}\n   -> ${ev.choices.map((c) => c.label).join(' | ')}`);
    const legal = ev.choices.filter((c) => !c.disabledReason);
    choices[ev.iid] = legal[Math.floor(rand(h) * legal.length)].id;
  }
  const actions: PlayerAction[] = [];
  if (rand(h) < 0.25) {
    const ea = legalActions(s).filter((a) => a.kind === 'ears');
    if (ea.length) { const a = ea[Math.floor(rand(h) * ea.length)]; actions.push(a); seen.push(`[wk ${s.week}] ORDER ${previewAction(s, a).title}`); }
  }
  const r = advanceWeek(s, { choices, actions });
  s = r.state;
  for (const l of r.log) if (/Ear|said no|Madam|plot|lean on/.test(l)) seen.push(`[wk ${s.week}] LOG ${l}`);
}
console.log(seen.join('\n'));
const E = s.ears!;
console.log('stats', JSON.stringify(E.stats));
console.log('links', E.links.length, 'hidden', E.links.filter((l) => l.hidden).length, 'notes', E.notes.slice(-8));
console.log('money', s.money);
