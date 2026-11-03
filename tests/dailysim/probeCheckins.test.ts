/**
 * Probe: are the week's capo check-ins stable while the week is lived day by day?
 * advanceWeek resolves the mornings from weekCheckIns(input) at the END of the week (the state the
 * player sent), but the player answered them on the day from weekCheckIns(state-that-day).
 * Anything settled mid-week (actNow, an urgent meeting taken, a day ticking) changes the state.
 * Gated by DAILYSIM=1.
 */
import '../../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../../src/engine/engine';
import { newGameWith, type StartId } from '../../src/engine/starts';
import { tickDay, weekChoices } from '../../src/engine/days';
import { weekCheckIns } from '../../src/engine/checkins';
import { recommendedActions } from '../../src/engine/briefing';
import { instant, actNow } from '../../src/engine/actNow';
import { meetTip, unseenUrgent } from '../../src/engine/threats';
import type { GameState } from '../../src/engine/types';
import { EVENT_DEFS } from '../../src/engine/events';
import { CREW_EVENTS } from '../../src/engine/crewEvents';
import { writeFileSync } from 'node:fs';

const sig = (s: GameState) => weekCheckIns(s).filter((c) => c.problem).map((c) => `${c.key}=${c.problem!.kind}`).join(',');

describe.skipIf(process.env.DAILYSIM !== '1')('check-ins stable through the week', () => {
  it('reports how often the problems change mid-week', { timeout: 600_000 }, () => {
    const out: string[] = [];
    let changedTick = 0, changedAct = 0, changedTip = 0, weeks = 0;
    for (const start of ['classic', 'olddon'] as StartId[]) {
      let s = newGameWith('probe', start);
      for (let w = 0; w < 30 && !s.gameOver; w++) {
        weeks++;
        const s0 = sig(s);
        let t = tickDay(s);
        if (sig(t) !== s0) changedTick++;
        const tips = unseenUrgent(t);
        if (tips.length) { const t2 = meetTip(t, tips[0], 'underboss'); if (sig(t2) !== s0) changedTip++; t = t2; }
        const a = recommendedActions(t)[0]?.action;
        if (a && instant(t, a)) {
          const r = actNow(t, a);
          if (sig(r.state) !== sig(t)) { changedAct++; if (out.length < 5) out.push(`${start} wk${s.week} after ${a.kind}: ${sig(t).slice(0, 120)}  ->  ${sig(r.state).slice(0, 120)}`); }
        }
        s = advanceWeek(s, weekChoices(s, {})).state;
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[probe] weeks ${weeks}; check-ins changed by a day tick: ${changedTick}, by an urgent meeting: ${changedTip}, by an order settled now: ${changedAct}\n${out.join('\n')}`);
    if (process.env.SIM_DEFS) writeFileSync(process.env.SIM_DEFS, JSON.stringify({ events: EVENT_DEFS.map((d) => d.id), crew: CREW_EVENTS.map((d) => d.key) }));
    expect(weeks).toBeGreaterThan(0);
  });
});
