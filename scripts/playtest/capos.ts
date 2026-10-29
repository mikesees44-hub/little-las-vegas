/**
 * Capos balance (capos.ts): how much the capos matter, and how rare betrayal is.
 *
 *   nice npx tsx scripts/playtest/capos.ts --seeds 6 --weeks 104
 *
 * Scenarios, same seeds:
 *  - base:    the game as dealt, the boss answers every capo popup with his default.
 *  - good:    every capo made a good one (leadership/business up, Patient, Honest);
 *  - bad:     every capo made a poor one (low skills, Greedy, Hot-headed, Drinker);
 *  - wellrun: base capos, a boss who says yes to his capos, rewards and recognizes them, asks them straight;
 *  - neglect: base capos, a boss who says no to everything and squeezes every contract.
 * Per scenario: income/week, local heat, district influence, defections/FBI/coups by capos, saves, plots, report honesty.
 */
import { newGame } from '../../src/engine/newGame';
import { advanceWeek } from '../../src/engine/engine';
import { capos } from '../../src/engine/characters';
import { randomChoices } from '../../tests/helpers';
import type { GameState, PlayerAction, Trait } from '../../src/engine/types';

function arg(n: string, d: string): string { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
const SEEDS = Number(arg('seeds', '6'));
const WEEKS = Number(arg('weeks', '104'));
const ONLY = arg('only', '');
type Sc = 'base' | 'good' | 'bad' | 'wellrun' | 'neglect';

function shape(s: GameState, sc: Sc): void {
  if (sc !== 'good' && sc !== 'bad') return;
  for (const k of capos(s)) {
    if (k.id === s.playerId) continue;
    const drop: Trait[] = ['Greedy', 'Hot-headed', 'Drinker', 'Patient', 'Honest', 'Ambitious', 'Loyal-to-a-fault', 'Gambler', 'Cruel'];
    k.traits = k.traits.filter((t) => !drop.includes(t));
    if (sc === 'good') { k.attributes.leadership = 80; k.attributes.business = 78; k.attributes.discipline = 70; k.traits.push('Patient', 'Honest'); }
    else { k.attributes.leadership = 25; k.attributes.business = 25; k.attributes.discipline = 20; k.traits.push('Greedy', 'Hot-headed', 'Drinker'); }
  }
}

function choicesFor(s: GameState, sc: Sc, i: number) {
  const c = randomChoices(s, i).choices!;
  for (const e of s.pendingEvents) {
    if (!e.defId.startsWith('capo_')) { if (sc === 'base' || sc === 'good' || sc === 'bad') continue; else continue; }
    if (sc === 'wellrun') c[e.iid] = e.choices.find((x) => x.id === 'yes' || x.id === 'buyback' || x.id === 'thank')?.id ?? e.defaultChoiceId;
    else if (sc === 'neglect') c[e.iid] = e.choices.find((x) => x.id === 'no' || x.id === 'nothing' || x.id === 'doubt')?.id ?? e.defaultChoiceId;
    else c[e.iid] = e.defaultChoiceId;
  }
  return c;
}

function orders(s: GameState, sc: Sc, w: number): PlayerAction[] {
  const ks = capos(s).filter((k) => k.id !== s.playerId);
  if (sc === 'wellrun' && ks.length) {
    const k = ks[w % ks.length];
    const a: PlayerAction[] = [];
    if (w % 6 === 0 && s.money > 6000) a.push({ kind: 'capo', op: { op: 'reward', capo: k.id, amount: 500 } });
    if (w % 4 === 1) a.push({ kind: 'capo', op: { op: 'recognize', capo: k.id } });
    if (w % 5 === 2) a.push({ kind: 'capo', op: { op: 'ask', capo: k.id } });
    return a;
  }
  if (sc === 'neglect' && w % 8 === 0) return ks.filter((k) => (k.keep ?? 0.3) > 0.2).map((k) => ({ kind: 'contract', charId: k.id, keep: Math.round(((k.keep ?? 0.3) - 0.05) * 100) / 100 }) as PlayerAction);
  return [];
}

interface Row { lost: number; inc: number; heat: number; infl: number; defected: number; fbi: number; coups: number; saves: number; plots: number; foiled: number; honest: number; slant: number; withheld: number; req: number; yes: number; groomed: number; proposed: number; hedgeWeeks: number; turnWeeks: number; capoWeeks: number; over: number }

function run(seed: string, sc: Sc): Row {
  let s = newGame(seed);
  shape(s, sc);
  let inc = 0, heatSum = 0, n = 0, hedge = 0, turn = 0, cw = 0;
  const wereCapos = new Set<string>();
  for (let w = 0; w < WEEKS && !s.gameOver; w++) {
    const r = advanceWeek(s, { choices: choicesFor(s, sc, w), actions: orders(s, sc, w) });
    s = r.state;
    inc += r.report.grossIncome; heatSum += s.heat.local; n++;
    for (const k of capos(s)) wereCapos.add(k.id);
    for (const b of Object.values(s.capos?.books ?? {})) { cw++; if (b.st === 'hedging') hedge++; if (b.st === 'turning') turn++; }
  }
  const st = s.capos!.stats;
  const infl = s.districts.reduce((a, d) => a + (d.influence.player ?? 0), 0) / s.districts.length;
  const lost = [...wereCapos].filter((id) => { const c = s.characters[id]; return c.alive && c.faction !== 'player' && c.faction !== 'none'; }).length;
  return { lost, inc: inc / n, heat: heatSum / n, infl, defected: st.defected, fbi: st.fbi, coups: st.coups, saves: st.saves, plots: st.plots, foiled: st.foiled, honest: st.honest, slant: st.slants, withheld: st.withheld, req: st.req, yes: st.yes, groomed: st.groomed, proposed: st.proposed, hedgeWeeks: hedge, turnWeeks: turn, capoWeeks: cw, over: s.gameOver ? 1 : 0 };
}

const scs: Sc[] = ONLY ? [ONLY as Sc] : ['base', 'good', 'bad', 'wellrun', 'neglect'];
for (const sc of scs) {
  const rows: Row[] = [];
  for (let i = 0; i < SEEDS; i++) rows.push(run(`capos-${i}`, sc));
  const avg = (k: keyof Row) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const sum = (k: keyof Row) => rows.reduce((a, r) => a + r[k], 0);
  console.log(`${sc.padEnd(8)} income/wk $${Math.round(avg('inc'))}  local heat ${avg('heat').toFixed(1)}  infl ${avg('infl').toFixed(1)}%  | capos gone over (any cause) ${sum('lost')} | capo-layer betrayals: defect ${sum('defected')} fbi ${sum('fbi')} coup ${sum('coups')} (plots ${sum('plots')}, dropped ${sum('foiled')})  saves ${sum('saves')}  | hedging ${(100 * sum('hedgeWeeks') / Math.max(1, sum('capoWeeks'))).toFixed(1)}% turning ${(100 * sum('turnWeeks') / Math.max(1, sum('capoWeeks'))).toFixed(1)}% of capo-weeks | reports honest ${sum('honest')} slant ${sum('slant')} withheld ${sum('withheld')} | req ${sum('req')} yes ${sum('yes')} groomed→made ${sum('groomed')} proposed ${sum('proposed')} | games over ${sum('over')}`);
}
