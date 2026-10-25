import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { compareChoices } from '../src/engine/advice';
import { crew } from '../src/engine/characters';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { CandidatePicker, ChoiceWhy, GlossaryOverlay, TaskAdvice, Tip, WhatToDoPanel, WhyPanel } from '../src/ui/clarity';

describe('clarity UI', () => {
  it('renders the picker with Recommended and Alternative badges and the advisors', () => {
    const s = newGame('clar-ui');
    const html = renderToString(createElement(CandidatePicker, { s, role: { kind: 'seat', seat: 'bagman' } }));
    expect(html).toContain('data-testid="candidate-picker"');
    expect(html).toContain('Recommended');
    expect(html).toContain('data-testid="badge-alternative"');
    expect(html).toContain('Who should be bagman?');
  });
  it('renders the why panel, a decision option, the what-to-do panel, task advice, tooltips and the glossary', () => {
    let s = newGame('clar-ui2');
    for (let i = 0; i < 10 && !s.pendingEvents.length; i++) s = advanceWeek(s, {}).state;
    const c = crew(s)[0];
    expect(renderToString(createElement(WhyPanel, { s, action: { kind: 'interact', id: 'dinner', target: c.id } }))).toContain('data-testid="verdict"');
    const ev = s.pendingEvents[0];
    if (ev) expect(renderToString(createElement(ChoiceWhy, { a: compareChoices(s, ev.choices)[0] }))).toContain('why?');
    expect(renderToString(createElement(WhatToDoPanel, { s }))).toContain('What should I do?');
    expect(renderToString(createElement(TaskAdvice, { s, seat: 'fixer' }))).toContain('data-testid="task-advice"');
    expect(renderToString(createElement(Tip, { term: 'heat.local', children: 'x' }))).toContain('Wildwood police');
    expect(renderToString(createElement(GlossaryOverlay, { onClose: () => {} }))).toContain('The Table');
  });
});
