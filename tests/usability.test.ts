import { describe, expect, it } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { capos, crew } from '../src/engine/characters';
import { bossDesk, readyReview } from '../src/engine/desk';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { previewAction } from '../src/engine/actions';
import type { GameState, PlayerAction } from '../src/engine/types';
import { actionFacts, specificButton } from '../src/ui/actionFacts';
import { CharacterSheet } from '../src/ui/components/CharacterSheet';
import { chartMatches, CrewTree } from '../src/ui/components/CrewTree';
import { EventModal } from '../src/ui/components/EventModal';
import { Face, SheetContext } from '../src/ui/components/People';
import { RacketHub } from '../src/ui/econ/RacketHub';
import { WeeklyTake } from '../src/ui/tribute/WeeklyTake';
import { findOnMap } from '../src/ui/hood/MapControls';
import { itemsOf } from '../src/ui/hood/Buildings';
import { placeAll } from '../src/engine/hoodGeo';
import { ISO } from '../src/ui/hood/iso';
import { BossDesk, ReadyToAdvance } from '../src/ui/desk/BossDesk';
import { autoBriefings, helpLevel } from '../src/ui/settings';
import { AdvicePanel } from '../src/ui/advice/AdviceButton';
import { quickActionsFor } from '../src/ui/sheet/QuickActions';
import { recurringOf } from '../src/engine/recurring';

const withSheet = (node: ReactNode) => createElement(SheetContext.Provider, { value: { open: () => {}, menu: () => {} } }, node);
const html = (node: ReactNode) => renderToString(withSheet(node));

function withEvent(s: GameState): GameState {
  for (let i = 0; i < 12 && !s.pendingEvents.length; i++) s = advanceWeek(s, {}).state;
  return s;
}

describe('1-2: the Boss\'s Desk and the Ready-to-advance review', () => {
  const s = withEvent(newGame('ux-desk'));
  const dinner: PlayerAction = { kind: 'interact', id: 'dinner', target: crew(s)[0].id };
  it('groups decisions, sit-down recommendations, orders, bills and what is coming, each with what happens if left', () => {
    const g = bossDesk(s, { orders: [dinner] });
    const kinds = g.map((x) => x.kind);
    if (s.pendingEvents.length) {
      // A decision is either on Needs you (with what happens if left) or handled for you (with who does what).
      const d = g.flatMap((x) => x.items).find((x) => x.ref.event === s.pendingEvents[0].iid)!;
      expect(d).toBeDefined();
      expect(d.ifNothing ?? d.handled?.does).toBeTruthy();
    }
    expect(kinds).toContain('order');
    expect(kinds).toContain('bill');
    const out = html(createElement(BossDesk, { s, ui: { orders: [dinner] }, api: { onEvent: () => {}, onDay: () => {}, onSitDown: () => {}, onCancelOrder: () => {}, onMoney: () => {}, onChar: () => {} } }));
    expect(out).toContain('data-testid="boss-desk"');
    expect(out).toContain('The Desk');
  });
  it('the review lists unanswered decisions with their defaults, the orders, and the known costs', () => {
    const r = readyReview(s, { orders: [dinner] });
    expect(r.clear).toBe(false);
    for (const u of r.unanswered) expect(u.becomes.length).toBeGreaterThan(0);
    expect(r.orders.length).toBe(1);
    expect(r.costs.orders).toBe(previewAction(s, dinner).cost);
    const answered = Object.fromEntries(s.pendingEvents.map((e) => [e.iid, e.choices[0].id]));
    expect(readyReview(s, { answers: answered }).unanswered.length).toBe(0);
    const out = html(createElement(ReadyToAdvance, { s, ui: { orders: [dinner] }, onReview: () => {}, onAdvance: () => {}, onClose: () => {} }));
    expect(out).toContain('Ready to advance');
    expect(out).toMatch(/Advance anyway|Advance ▸/);
  });
});

describe('3: the rackets in four tabs', () => {
  it('My Operations · Start a Racket · Assign Earners · One-Time Jobs, with where the estimates come from and the season', () => {
    const s = newGame('ux-rackets');
    const out = html(createElement(RacketHub, { s }));
    for (const t of ['ops', 'start', 'earners', 'jobs']) expect(out).toContain(`data-testid="hub-tab-${t}"`);
    expect(out).toContain('data-testid="estimate-note"');
    expect(out).toMatch(/season/i);
    expect(html(createElement(RacketHub, { s, initial: 'earners' }))).toContain('data-testid="steady-earners"');
    expect(html(createElement(RacketHub, { s, initial: 'jobs' }))).toContain('data-testid="dirty-work"');
  });
});

describe('4: specific buttons and the facts before the click', () => {
  const s = newGame('ux-verbs');
  const man = crew(s).find((c) => c.rank === 'soldier')!;
  it('names the order and its object, and the price', () => {
    const b = specificButton(s, { kind: 'interact', id: 'dinner', target: man.id });
    expect(b).toMatch(new RegExp(`^Invite ${man.nickname ?? man.firstName} to dinner — \\$`));
    expect(specificButton(s, { kind: 'talk', op: { t: 'ask', talk: 'business', target: man.id } })).toMatch(/^Discuss business with /);
    expect(specificButton(s, { kind: 'talk', op: { t: 'ask', talk: 'succession', target: man.id } })).toMatch(/^Discuss the succession with /);
    expect(specificButton(s, { kind: 'talk', op: { t: 'ask', talk: 'advice', target: man.id } })).toMatch(/^Ask .* for advice/);
    for (const t of ['meeting', 'business', 'advice', 'grievance', 'social'] as const) expect(specificButton(s, { kind: 'talk', op: { t: 'ask', talk: t, target: man.id } })).not.toBe('Ask him');
  });
  it('says who acts, on whom, what it costs and from which account, when, what follows, and why not', () => {
    const f = actionFacts(s, { kind: 'interact', id: 'dinner', target: man.id });
    expect(f.actor).toBe('You');
    expect(f.target).toContain(man.lastName);
    expect(f.cost).toMatch(/from your pocket|from Family money/);
    expect(f.timing).toMatch(/advance the week/);
    const ub = crew(s).find((c) => c.rank === 'underboss')!;
    const blocked = actionFacts(s, { kind: 'appoint', seat: 'underboss', charId: ub.id });
    expect(blocked.unavailable).toMatch(/^Unavailable: /);
  });
});

describe('5: decision advice with priorities and recurring effects', () => {
  it('the decision card has the default, "Ask for advice", odds on every option and the weekly effect of a contract (the priority picker lives in Settings)', () => {
    let s = withEvent(newGame('ux-ev'));
    const k = capos(s).find((c) => s.districts.some((d) => d.capoId === c.id))!;
    s = { ...s, pendingEvents: [{ iid: 'ux1', defId: 'test', title: 'A bigger end', text: 'He wants more.', week: s.week, defaultChoiceId: 'no', mandatory: false, priority: 1,
      choices: [{ id: 'give', label: 'Give him 35%', because: 'gave', effects: [{ type: 'contract', charId: k.id, keep: 0.35 }] }, { id: 'no', label: 'No', because: 'said no', effects: [{ type: 'opinion', from: k.id, to: s.playerId, amount: -5, reason: 'No' }] }] }] };
    expect(recurringOf(s, { type: 'contract', charId: k.id, keep: 0.35 })).toBeTruthy();
    const out = html(createElement(EventModal, { s, ev: s.pendingEvents[0], index: 0, total: 1, onChoose: () => {}, onClose: () => {} }));
    expect(out).not.toContain('data-testid="priority-picker"');
    expect(out).toContain('data-testid="event-default"');
    expect(out.split('data-testid="odds-label"').length - 1).toBe(2);
    expect(out).toContain('data-testid="ask-advice"');
    expect(out).toContain('data-testid="recurring-note"');
    expect(out).toMatch(/Every week from now/);
    expect(out).not.toMatch(/Nothing much changes/);
  });
});

describe('6: the character sheet in tabs', () => {
  it('Overview, Relationships, Work & Money, Skills, Actions, History, quick actions on top, and an Actions handle on portraits', () => {
    const s = newGame('ux-sheet');
    const man = crew(s).find((c) => c.rank === 'soldier')!;
    const out = html(createElement(CharacterSheet, { s, id: man.id, onClose: () => {} }));
    for (const t of ['overview', 'relationships', 'work', 'skills', 'actions', 'history']) expect(out).toContain(`data-testid="sheet-tab-${t}"`);
    expect(out).toContain('data-testid="quick-actions"');
    expect(quickActionsFor(s, man).length).toBeGreaterThanOrEqual(2);
    for (const t of ['relationships', 'work', 'skills', 'actions', 'history'] as const) expect(html(createElement(CharacterSheet, { s, id: man.id, onClose: () => {}, initialTab: t })).length).toBeGreaterThan(500);
    expect(html(createElement(CharacterSheet, { s, id: man.id, onClose: () => {}, initialTab: 'actions' }))).toContain('data-testid="interaction-menu"');
    expect(html(createElement(Face, { s, c: man }))).toContain('data-testid="portrait-actions"');
  });
});

describe('7: the family chart', () => {
  const s = newGame('ux-chart');
  it('searches and filters: family, capos, soldiers, associates, unemployed, potential heirs', () => {
    expect(chartMatches(s, 'capos', '').every((c) => c.rank === 'capo')).toBe(true);
    expect(chartMatches(s, 'soldiers', '').every((c) => c.rank === 'soldier')).toBe(true);
    expect(chartMatches(s, 'family', '').every((c) => c.dynasty)).toBe(true);
    const k = capos(s)[0];
    expect(chartMatches(s, 'all', k.lastName).some((c) => c.id === k.id)).toBe(true);
    expect(chartMatches(s, 'unemployed', '').every((c) => c.rank === 'soldier' || c.rank === 'associate')).toBe(true);
  });
  it('renders the tools, the view toggle and a tappable legend; no run-together labels; crew moves are labelled', () => {
    const out = html(createElement(CrewTree, { s, chartOnly: true }));
    expect(out).toContain('data-testid="chart-search"');
    expect(out).toContain('data-testid="chart-filters"');
    expect(out).toContain('data-testid="chart-view"');
    expect(out).toContain('aria-pressed');
    expect(out).not.toMatch(/>(Soldier|Associate|Capo|Bookie|Collector)<\/span>[A-Z]/);
    expect(out).toContain('Move to crew');
  });
});

describe('8: the envelope in five pages', () => {
  it('This Week · Who Paid · What Is Owed · Accounts · The Books, and old links still land', () => {
    const s = advanceWeek(newGame('ux-env'), {}).state;
    const out = html(createElement(WeeklyTake, { s }));
    for (const g of ['week', 'paid', 'owed', 'accounts', 'books']) expect(out).toContain(`data-testid="take-group-${g}"`);
    if (s.tribute?.reports.length) expect(out).toContain('data-testid="take-this-week"');
    expect(html(createElement(WeeklyTake, { s, initial: 'agreements' }))).toContain('data-testid="take-agreements"');
    expect(html(createElement(WeeklyTake, { s, initial: 'obligations' }))).toContain('data-testid="take-obligations"');
  });
});

describe('9: Find on the map', () => {
  it('finds a district, a place and a person', () => {
    const s = newGame('ux-map');
    const pr = ISO;
    const items = itemsOf(s, placeAll(s), pr);
    expect(findOnMap(s, items, 'board').some((h) => h.kind === 'district')).toBe(true);
    const it0 = items.find((x) => x.name.length > 4)!;
    expect(findOnMap(s, items, it0.name.slice(0, 5)).some((h) => h.id === it0.key)).toBe(true);
    const k = capos(s)[0];
    expect(findOnMap(s, items, k.lastName).some((h) => h.kind === 'person' && h.id === k.id)).toBe(true);
  });
});

describe('10: help levels and briefings', () => {
  it('Guided by default, and automatic briefings on big moves', () => {
    expect(helpLevel()).toBe('guided');
    expect(autoBriefings()).toBe('major');
  });
  it('the adviser panel has Accept, Choose someone else, Ask another adviser, View plan and Not now', () => {
    const s = newGame('ux-panel');
    const out = html(createElement(AdvicePanel, { s, subject: { kind: 'action', action: { kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind: 'numbers' } } } }, onClose: () => {} }));
    for (const id of ['advice-accept', 'advice-choose-other', 'advice-ask-other', 'advice-view-plan', 'advice-not-now', 'advice-reactions', 'advice-unknowns']) expect(out, id).toContain(`data-testid="${id}"`);
    expect(out).toMatch(/data-k="known"/);
    expect(out).toMatch(/data-k="estimate"/);
    expect(out).toMatch(/data-k="unknown"/);
  });
});
