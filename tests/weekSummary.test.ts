import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { weekBrief } from '../src/engine/weekSummary';
import { ReportModal } from '../src/ui/components/ReportModal';
import type { GameState, WeeklyReport } from '../src/engine/types';

function played(seed: string, n: number): { s: GameState; reports: WeeklyReport[] } {
  let s = newGame(seed);
  const reports: WeeklyReport[] = [];
  for (let i = 0; i < n && !s.gameOver; i++) { const r = advanceWeek(s, {}); s = r.state; reports.push(r.report); }
  return { s, reports };
}

describe('the week in brief', () => {
  it('every lieutenant log entry and every quiet item of the week appears exactly once', () => {
    for (const seed of ['brief-a', 'brief-b']) {
      const { s, reports } = played(seed, 8);
      for (const r of reports.slice(-3)) {
        const b = weekBrief(s, [r]);
        expect(b.lines.length).toBe(3);
        const lt = (s.briefing?.lt?.log ?? []).filter((e) => e.week === r.week);
        for (const e of lt) expect(b.handled.filter((h) => h.src === 'lt' && h.text === e.text).length, e.text).toBe(lt.filter((x) => x.text === e.text).length);
        for (const q of r.motion ?? []) expect(b.handled.filter((h) => h.src === 'quiet' && h.text === q).length).toBe((r.motion ?? []).filter((x) => x === q).length);
      }
    }
  });
  it('the report leads with the brief and folds the ledger', () => {
    const { s, reports } = played('brief-r', 3);
    const html = renderToString(createElement(ReportModal, { s, reports: reports.slice(-1), onClose: () => {} }));
    expect(html).toContain('data-testid="week-brief"');
    expect(html.indexOf('week-brief')).toBeLessThan(html.indexOf('report-ledger'));
  });
});
