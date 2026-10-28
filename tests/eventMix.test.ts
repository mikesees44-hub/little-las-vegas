import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { isFamilyEvent } from '../src/engine/events';
import { newGame } from '../src/engine/newGame';
import { inbox } from '../src/engine/inbox';
import { groupOfId } from '../src/engine/storyDirector';
import { latestReport } from '../src/engine/tribute';
import { ensureTribute } from '../src/engine/tributeState';
import { randomChoices } from './helpers';

/**
 * MAKE_IT_GREAT #9, content repeats: the director's mix over two years of
 * three games. No template group (the envelope, the ears, the crew's
 * decisions, a content pack's category...) takes more than a fifth of the
 * popups; the kin come with several different kinds of business; and each
 * year shows plenty of different events.
 */
describe('the event mix', () => {
  it('3 seeds x 104 weeks: no group over 20%, the envelope is not a weekly popup, the kin get a seat, many distinct events a year', () => {
    const byGroup: Record<string, number> = {};
    const kin = new Set<string>();
    const perYear: number[] = [];
    let total = 0;
    let audience = 0;
    for (const seed of ['mix-1', 'mix-2', 'mix-3']) {
      let s = newGame(seed);
      let year = new Set<string>();
      let lastAudience = -99;
      let kinWeeks: number[] = [];
      for (let i = 0; i < 104 && !s.gameOver; i++) {
        s = advanceWeek(s, randomChoices(s, i)).state;
        expect(s.pendingEvents.filter(isFamilyEvent).length).toBeLessThanOrEqual(1);
        for (const e of s.pendingEvents) {
          total++;
          byGroup[groupOfId(e.defId)] = (byGroup[groupOfId(e.defId)] ?? 0) + 1;
          year.add(e.defId);
          if (e.defId.startsWith('kin_')) {
            kin.add(e.defId);
            kinWeeks.push(s.week);
          }
          if (e.defId === 'tribute_audience') {
            audience++;
            // Routine business is not a weekly face (a crisis audience is mandatory and may come any week).
            if (!e.mandatory) expect(s.week - lastAudience, `seed ${seed} week ${s.week}`).toBeGreaterThanOrEqual(4);
            lastAudience = s.week;
          }
        }
        if ((i + 1) % 52 === 0) {
          perYear.push(year.size);
          year = new Set();
        }
      }
      // The kin come to the door every couple of months, not once a game.
      expect(kinWeeks.length, `kin popups, seed ${seed}`).toBeGreaterThanOrEqual(6);
      kinWeeks = [];
    }
    expect(total).toBeGreaterThan(3 * 104 * 1.5);
    for (const [g, n] of Object.entries(byGroup)) expect(n / total, `group ${g}: ${n} of ${total}`).toBeLessThanOrEqual(0.2);
    expect(audience / total).toBeLessThanOrEqual(0.15);
    expect(kin.size).toBeGreaterThanOrEqual(4);
    for (const n of perYear) expect(n).toBeGreaterThanOrEqual(65);
  }, 300000);

  it('a Don who holds the audience every week finds the quiet envelopes on his desk, not in a popup every Monday', () => {
    let s = newGame('mix-asked');
    ensureTribute(s).policy.auto = false;
    let popups = 0;
    let desk = 0;
    for (let i = 0; i < 40 && !s.gameOver; i++) {
      s = advanceWeek(s, randomChoices(s, i)).state;
      ensureTribute(s).policy.auto = false;
      const shown = s.pendingEvents.some((e) => e.defId === 'tribute_audience');
      const rep = latestReport(s);
      if (shown) popups++;
      else if (rep?.status === 'presented') {
        desk++;
        expect(inbox(s).some((x) => x.kind === 'envelope')).toBe(true);
      }
    }
    expect(popups).toBeGreaterThan(0);
    expect(popups).toBeLessThanOrEqual(12);
    expect(desk).toBeGreaterThan(popups);
  }, 120000);
});
