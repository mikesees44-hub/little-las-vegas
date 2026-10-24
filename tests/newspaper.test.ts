import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { BACKDROP, BULLETIN, LEADER, frontPage } from '../src/engine/newspaper';
import { newGame } from '../src/engine/newGame';
import type { GameState } from '../src/engine/types';
import { Newspapers } from '../src/ui/components/Newspaper';

function weeks(s: GameState, n: number) {
  for (let i = 0; i < n; i++) s = advanceWeek(s, {}).state;
  return s;
}

describe('the newspapers', () => {
  it('the Leader prints every week, and front pages render', () => {
    const s = weeks(newGame('news1'), 6);
    const weeksPrinted = new Set(s.news.filter((n) => n.paper === LEADER).map((n) => n.week));
    expect(weeksPrinted.size).toBeGreaterThanOrEqual(5);
    expect(frontPage(s, LEADER).length).toBeGreaterThan(0);
    const html = renderToString(createElement(Newspapers, { s }));
    expect(html).toContain('The Wildwood Leader');
  });

  it('a killing on the boss\'s orders makes the front page and costs named heat', () => {
    let s = newGame('news2');
    s = advanceWeek(s, {}).state;
    const victim = Object.values(s.characters).find((c) => c.alive && c.faction !== 'player' && !c.dynasty)!;
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${victim.firstName} ${victim.lastName} was killed at the barbershop.`, because: 'ordered a hit', becauseWeek: s.week, kind: 'death' });
    const r = advanceWeek(s, {});
    const story = r.state.news.find((n) => n.week === s.week && n.kind === 'murder');
    expect(story?.headline).toMatch(/KILLING/);
    const line = r.report.lines.find((l) => l.label.startsWith('Headline:'));
    expect(line?.stat).toBe('heat.local');
    expect(reconcile(r.report)).toEqual([]);
  });

  it('history makes the Bulletin when its day comes, once', () => {
    let s = newGame('news3');
    while (s.date.y < 1960 || (s.date.y === 1960 && s.date.m < 11) || (s.date.m === 11 && s.date.d < 9)) s = advanceWeek(s, {}).state;
    s = weeks(s, 2);
    const kennedy = s.news.filter((n) => n.headline === BACKDROP[0].headline);
    expect(kennedy).toHaveLength(1);
    expect(kennedy[0].paper).toBe(BULLETIN);
  });

  it('no headline names a living real person or a Godfather name', () => {
    const text = JSON.stringify(BACKDROP);
    for (const bad of ['Corleone', 'Barzini', 'Tattaglia', 'Bruno', 'Nixon']) expect(text).not.toContain(bad);
  });
});
