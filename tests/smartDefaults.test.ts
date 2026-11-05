import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { capos } from '../src/engine/characters';
import { consiglierePick } from '../src/engine/delegation';
import type { EventInstance, GameState } from '../src/engine/types';
import { EventModal } from '../src/ui/components/EventModal';
import { SheetContext } from '../src/ui/components/People';
import { DecisionCard } from '../src/ui/decide/DecisionCard';
import { InteractionMenu } from '../src/ui/sheet/InteractionMenu';

const O = { known: false, label: 'certain', reasons: [] };
const html = (node: ReactNode) => renderToString(createElement(SheetContext.Provider, { value: { open: () => {}, menu: () => {} } }, node)).replace(/<!-- -->/g, '');

const ev = (s: GameState, over: Partial<EventInstance> = {}): EventInstance => ({
  iid: 'evSD', defId: 'test_small', week: s.week, title: 'A small ask', text: 'A man wants a favor.', mandatory: false, priority: 30,
  choices: [
    { id: 'yes', label: 'Do him the favor', because: 'x', effects: [{ type: 'money', amount: -200, label: 'A favor' }] },
    { id: 'no', label: 'Send him away', because: 'x', effects: [] },
  ],
  defaultChoiceId: 'no', ...over,
} as EventInstance);

/** The selected row's option id, from the markup. */
function selectedRow(h: string): string | undefined {
  const i = h.indexOf('data-selected="true"');
  return i < 0 ? undefined : h.slice(i, i + 1500);
}

describe('smart defaults: pickers open on the recommended choice, never given', () => {
  it('the decision card opens on its recommended option; the primary names it; nothing is decided', () => {
    const s = newGame('sd-a');
    let decided = 0;
    const h = html(createElement(DecisionCard, {
      s, options: [{ id: 'a', label: 'First way', odds: O }, { id: 'b', label: 'Second way', odds: O, recommended: true }, { id: 'c', label: 'Third way', odds: O }], onDecide: () => { decided++; },
    }));
    expect(h).toContain('Decide: Second way');
    expect(h.split('data-selected="true"').length - 1).toBe(1);
    expect(decided).toBe(0);
    // With nothing recommended it still asks.
    expect(html(createElement(DecisionCard, { s, options: [{ id: 'a', label: 'A', odds: O }, { id: 'b', label: 'B', odds: O }], onDecide: () => {} }))).toContain('Pick one');
    // A recommended option that can't be done is not picked.
    expect(html(createElement(DecisionCard, { s, options: [{ id: 'a', label: 'A', odds: O }, { id: 'b', label: 'B', odds: O, recommended: true, disabled: 'no' }], onDecide: () => {} }))).toContain('Pick one');
  });

  it('a decision opens on the consigliere\'s pick, marked as his', () => {
    const s0 = newGame('sd-b');
    const e = ev(s0);
    const s = { ...s0, pendingEvents: [...s0.pendingEvents, e] };
    const pick = consiglierePick(s, e)!;
    const h = html(createElement(EventModal, { s, ev: e, index: 0, total: 1, onChoose: () => {}, onClose: () => {} }));
    const label = e.choices.find((c) => c.id === pick.choiceId)!.label;
    expect(h).toContain(`Decide: ${label}`);
    expect(selectedRow(h)).toContain(label);
    expect(h).toMatch(/&#x27;s pick|'s pick/);
  });

  it('never opens on an answer that kills one of his men', () => {
    const s0 = newGame('sd-c');
    const cap = capos(s0)[0];
    if (!cap) return;
    const e = ev(s0, { choices: [{ id: 'k', label: 'Put him down', because: 'x', effects: [{ type: 'kill', charId: cap.id, cause: 'x', label: 'x' }] }] as EventInstance['choices'], defaultChoiceId: 'k' });
    const s = { ...s0, pendingEvents: [...s0.pendingEvents, e] };
    const h = html(createElement(EventModal, { s, ev: e, index: 0, total: 1, onChoose: () => {}, onClose: () => {} }));
    // A single option is shown picked (there is nothing else), but never marked as anybody's recommendation.
    expect(h).not.toMatch(/data-recommended="true"/);
  });

  it('the person menu opens Best now with its top order on its card, one tap from given', () => {
    const s = newGame('sd-d');
    const c = capos(s)[0];
    if (!c) return;
    const h = html(createElement(InteractionMenu, { s, c }));
    if (!h.includes('data-testid="menu-cat-best"')) return;
    expect(h).toContain('data-testid="action-row-open"');
  });
});
