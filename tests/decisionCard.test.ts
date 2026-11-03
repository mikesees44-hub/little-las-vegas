import { describe, expect, it } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { capos } from '../src/engine/characters';
import { advanceWeek } from '../src/engine/engine';
import { EVENT_DEFS } from '../src/engine/events';
import { newGame } from '../src/engine/newGame';
import { oddsOfChoice, oddsOfPreview, worstOfPreview } from '../src/engine/decide';
import { previewAction } from '../src/engine/actions';
import type { EventInstance, GameState } from '../src/engine/types';
import { EventModal } from '../src/ui/components/EventModal';
import { ActionCard } from '../src/ui/components/Orders';
import { SheetContext } from '../src/ui/components/People';
import { DecisionCard } from '../src/ui/decide/DecisionCard';

/** STREAMLINE S10: one decision card standard, every surface. */
const html = (node: ReactNode) => renderToString(createElement(SheetContext.Provider, { value: { open: () => {}, menu: () => {} } }, node));
const count = (h: string, needle: string) => h.split(needle).length - 1;

/** 50 decisions: every event whose condition holds in a few games a few weeks in, plus what the weeks brought. */
function sample(n: number): { s: GameState; ev: EventInstance }[] {
  const out: { s: GameState; ev: EventInstance }[] = [];
  const seen = new Set<string>();
  for (const seed of ['dc-a', 'dc-b', 'dc-c', 'dc-d', 'dc-e']) {
    let s = newGame(seed);
    for (let w = 0; w < 8 && out.length < n; w++) {
      for (const d of EVENT_DEFS) {
        if (out.length >= n) break;
        const k = `${d.id}|${w % 4}`;
        if (seen.has(k)) continue;
        try {
          const c = structuredClone(s);
          if (!d.condition(c)) continue;
          const ev = d.build(c);
          if (!ev?.choices?.length) continue;
          seen.add(k);
          out.push({ s: c, ev });
        } catch { /* a def that needs more of the world than this week has */ }
      }
      for (const ev of s.pendingEvents) if (out.length < n && !seen.has(ev.iid + seed)) { seen.add(ev.iid + seed); out.push({ s, ev }); }
      s = advanceWeek(s, {}).state;
    }
    if (out.length >= n) break;
  }
  return out;
}

describe('the decision card (STREAMLINE §4.1)', () => {
  const evs = sample(50);

  it('samples enough decisions', () => {
    expect(evs.length).toBeGreaterThanOrEqual(30);
  });

  it('every choice of every sampled decision shows odds, "certain" or "no roll", and the card has one primary and no "Best value"', () => {
    for (const { s, ev } of evs) {
      const h = html(createElement(EventModal, { s, ev, index: 0, total: 1, onChoose: () => {}, onClose: () => {} }));
      expect(count(h, 'data-testid="odds-label"'), ev.defId).toBe(ev.choices.length);
      expect(count(h, 'btn-primary'), ev.defId).toBe(1);
      expect(h).not.toContain('Best value');
      expect(h).not.toContain('data-testid="priority-picker"');
      for (const c of ev.choices) {
        const o = oddsOfChoice(c);
        expect(o.known || o.label === 'certain' || o.label.startsWith('no roll'), `${ev.defId}/${c.id}`).toBe(true);
      }
    }
  });

  it('an order with tiers shows its odds, its top reasons and the worst tier, on a card with one primary', () => {
    const s = newGame('dc-deed');
    const k = capos(s)[0];
    const a = { kind: 'deed' as const, id: 'befriend' as const, target: k.id };
    const p = previewAction(s, a);
    expect(p.oddsKnown).toBe(true);
    expect(oddsOfPreview(p).known).toBe(true);
    expect(worstOfPreview(p)?.label).toBeTruthy();
    const h = html(createElement(ActionCard, { s, action: a }));
    expect(h).toContain('data-testid="odds-bar"');
    expect(h).toContain('data-testid="odds-reasons"');
    expect(h).toContain('data-testid="worst-tier"');
    expect(count(h, 'btn-primary')).toBe(1);
  });

  it('an order with no roll says "certain"; never a blank', () => {
    const s = newGame('dc-certain');
    const p = previewAction(s, { kind: 'edict', edict: 'lowprofile', on: true });
    expect(p.oddsKnown).toBeFalsy();
    expect(['certain', 'no roll']).toContain(oddsOfPreview(p).label);
  });

  it('dirty work and the dig show their odds now (they used to be in the words)', () => {
    const s = newGame('dc-dirty');
    const k = capos(s)[0];
    const d = previewAction(s, { kind: 'dirty', op: { job: 'hijack', who: k.id } });
    expect(d.oddsKnown).toBe(true);
    expect(d.odds!.chance).toBeGreaterThan(0);
  });

  it('the heavy state: "Are you sure?" is the card turned over, not another window', () => {
    const s = newGame('dc-heavy');
    const h = html(createElement(DecisionCard, {
      s, options: [{ id: 'x', label: 'Whack him', odds: { known: false, label: 'certain', reasons: [] } }], onDecide: () => {},
      confirmFor: () => ({ title: 'Whack him', lines: ['A man dies.'], yes: 'Yes, do it' }),
    }));
    expect(count(h, 'btn-primary')).toBe(1);
    expect(h).toContain('data-testid="decision-primary"');
  });
});

describe('one source for a recommendation (playthrough: Red recommended it, then said "Don\'t")', () => {
  it('the man who recommends an order at the sit-down backs it when the order is weighed', async () => {
    const { briefing } = await import('../src/engine/briefing');
    const { counsel } = await import('../src/engine/counsel');
    let checked = 0;
    for (const seed of ['rec-a', 'rec-b', 'rec-c']) {
      let s = newGame(seed);
      for (let w = 0; w < 3; w++) {
        for (const it of briefing(s).items) {
          const rec = it.options.find((o) => o.id === it.recommended);
          if (!rec?.action) continue;
          const v = counsel(s, { kind: 'action', action: rec.action })?.voices.find((x) => x.adviser.role === it.role);
          if (!v) continue;
          expect(['do', 'doBut'], `${it.id}`).toContain(v.verdict);
          checked++;
        }
        s = advanceWeek(s, {}).state;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
