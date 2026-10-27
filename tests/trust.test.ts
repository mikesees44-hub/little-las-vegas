import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { advanceWeek } from '../src/engine/engine';
import { newGameWith } from '../src/engine/starts';
import { player } from '../src/engine/characters';
import { pocketCash } from '../src/engine/tributeState';
import { netWorth, ownMoney, wealthOf } from '../src/engine/wealth';
import { CharacterSheet } from '../src/ui/components/CharacterSheet';
import { fundingBlock, previewAction } from '../src/engine/actions';
import { seatEligibility } from '../src/engine/eligibility';
import { RETAINER_CAP, RETAINER_EARLY_CAP } from '../src/engine/longgame';
import { verbOf } from '../src/ui/verbs';
import type { GameState, PlayerAction } from '../src/engine/types';
import { fam } from '../src/engine/familyState';
import { famGoalBlock, personalGoalBlock } from '../src/engine/goalRules';
import { upgradeSave } from '../src/engine/upgradeSave';
import { roundOptions } from '../src/engine/rounds';
import { agreementHistoryLine, agreementName } from '../src/engine/agreements';
import { WeeklyTake } from '../src/ui/tribute/WeeklyTake';
import { lotAccessibleName } from '../src/ui/map/lotPins';
import { EmptyState } from '../src/ui/components/EmptyState';
import { dayBlock, formatDay, layoutWeek, setEvening, weekPlan } from '../src/engine/days';

/** The text of the first element carrying this test id. */
function byTestId(html: string, id: string): string | undefined {
  const m = html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`));
  return m?.[1];
}

describe('A01: one answer for the boss\'s own money', () => {
  it('the boss\'s own money is his Pocket; savings and possessions are apart; net worth adds them up', () => {
    const s = newGameWith('trust-a01', 'sees');
    const boss = player(s);
    expect(boss.wealth).toBeGreaterThan(0); // the private savings the old sheet called "own money"
    expect(ownMoney(s, boss)).toBe(pocketCash(s));
    const w = wealthOf(s, boss);
    expect(w.isPocket).toBe(true);
    expect(w.savings).toBe(Math.round(boss.wealth));
    expect(w.net).toBe(w.own + w.savings + w.possessions);
    expect(netWorth(s, boss)).not.toBe(s.money + w.own); // Family money is never in it
  });
  it('anyone else\'s own money is his wealth, with no savings line', () => {
    const s = newGameWith('trust-a01b', 'classic');
    const c = Object.values(s.characters).find((x) => x.alive && x.rank === 'capo')!;
    expect(ownMoney(s, c)).toBe(Math.round(c.wealth));
    expect(wealthOf(s, c).savings).toBe(0);
  });
  it('the character sheet shows the same pocket as the top bar (before and after a week)', () => {
    let s = newGameWith('trust-a01c', 'sees');
    for (let i = 0; i < 2; i++) {
      const html = renderToString(createElement(CharacterSheet, { s, id: s.playerId, onClose: () => {} }));
      expect(byTestId(html, 'sheet-own-money')).toBe(`$${pocketCash(s).toLocaleString('en-US')}`);
      expect(html).not.toMatch(/Own money: <span[^>]*>\$/); // the old mislabeled line is gone for the boss
      s = advanceWeek(s, {}).state;
    }
  });
});

describe('A02: the lawyer\'s retainer means what it says', () => {
  it('can be signed before any charge, builds a capped defense that carries into a case', () => {
    const s = newGameWith('trust-a02', 'classic');
    expect(s.legal?.stage ?? 'quiet').toBe('quiet');
    const p = previewAction(s, { kind: 'legal', op: 'retainer' });
    expect(p.disabledReason).toBeUndefined();
    expect(p.detail).toMatch(/before anybody is charged/);
    const r = advanceWeek(s, { actions: [{ kind: 'legal', op: 'retainer' }] }).state;
    expect(r.legal!.defense).toBe(10);
    const r2 = advanceWeek(advanceWeek(r, { actions: [{ kind: 'legal', op: 'retainer' }] }).state, { actions: [{ kind: 'legal', op: 'retainer' }] }).state;
    expect(r2.legal!.defense).toBe(RETAINER_EARLY_CAP); // capped before a charge
    expect(previewAction(r2, { kind: 'legal', op: 'retainer' }).disabledReason).toMatch(/Before any charge/);
  });
  it('the disabled reason matches the state: in prison there is nothing to retain him for', () => {
    const s = newGameWith('trust-a02b', 'classic');
    s.legal = { stage: 'prison', personId: s.playerId, defense: 0, since: s.week };
    expect(previewAction(s, { kind: 'legal', op: 'retainer' }).disabledReason).toMatch(/serving your sentence/);
    s.legal = { stage: 'investigation', personId: s.playerId, defense: 45, since: s.week };
    const p = previewAction(s, { kind: 'legal', op: 'retainer' });
    expect(p.disabledReason).toBeUndefined();
    expect(p.effects.find((e) => e.type === 'legal')).toMatchObject({ amount: RETAINER_CAP - 45 });
  });
});

describe('A04: one appointment, one eligibility, every entry point', () => {
  it('"Make Donato underboss" and "Seat him as underboss" are the same preview, both enabled, both name who is replaced', () => {
    const s = newGameWith('trust-a04', 'sees');
    const donato = Object.values(s.characters).find((c) => c.firstName === 'Donato' && c.alive)!;
    const seat = previewAction(s, { kind: 'appoint', seat: 'underboss', charId: donato.id });
    const promote = previewAction(s, { kind: 'interact', id: 'promote', target: donato.id });
    expect(promote.disabledReason).toBe(seat.disabledReason);
    expect(promote.title).toBe(seat.title);
    expect(promote.effects.map((e) => e.type)).toEqual(seat.effects.map((e) => e.type));
    expect(seat.title).toMatch(/in Vito's place/);
    expect(seat.warning).toMatch(/Vito .* loses the seat/);
  });
  it('the picker, the menu and the order agree on who can\'t be seated', () => {
    const s = newGameWith('trust-a04b', 'classic');
    const assoc = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'associate')!;
    expect(seatEligibility(s, 'underboss', assoc.id).why).toMatch(/made man/);
    expect(previewAction(s, { kind: 'appoint', seat: 'underboss', charId: assoc.id }).disabledReason).toMatch(/made man/);
    expect(seatEligibility(s, 'bagman', assoc.id).why).toBeUndefined();
  });
  it('promoting a capo to underboss sets the rank AND the seat (they never drift apart)', () => {
    const s = newGameWith('trust-a04c', 'sees');
    const donato = Object.values(s.characters).find((c) => c.firstName === 'Donato' && c.alive)!;
    const r = advanceWeek(s, { actions: [{ kind: 'interact', id: 'promote', target: donato.id }] }).state;
    expect(r.characters[donato.id].rank).toBe('underboss');
    expect(r.council.underboss.holderId).toBe(donato.id);
    expect(Object.values(r.characters).filter((c) => c.alive && c.faction === 'player' && c.rank === 'underboss')).toHaveLength(1);
  });
});

describe('A07: the numbers runners order says what it does', () => {
  it('reads "Hire runners — $300" with cost, timing and consequences', () => {
    const s = newGameWith('trust-a07', 'classic');
    const b = s.businesses.find((x) => x.owner === 'player' && x.kind === 'numbers');
    expect(b).toBeDefined();
    const a: PlayerAction = { kind: 'econ', op: { type: 'collect', bizId: b!.id } };
    const p = previewAction(s, a);
    expect(p.verb).toBe('Hire runners — $300');
    expect(verbOf(a, p).verb).toBe('Hire runners — $300');
    expect(p.cost).toBe(300);
    expect(p.detail).toMatch(/From next week/);
    expect(p.detail).toMatch(/no weekly wage/);
    expect(verbOf(a).verb).not.toBe('Collect');
  });
});

describe('A13: the Family only covers a short pocket when the player says so', () => {
  const buy = (s: GameState): PlayerAction | undefined => {
    for (const id of ['rowhouse', 'cresthouse', 'cadillac']) {
      const a: PlayerAction = { kind: 'econ', op: { type: 'luxBuy', item: id } } as PlayerAction;
      const p = previewAction(s, a);
      if (!p.disabledReason && p.pot === 'pocket' && p.cost > pocketCash(s)) return a;
    }
    return undefined;
  };
  it('a short pocket order without consent is not carried out; with consent it dips, by name', () => {
    const s = newGameWith('trust-a13', 'classic');
    const a = buy(s)!;
    expect(a).toBeDefined();
    expect(fundingBlock(s, a)).toMatch(/not approved Family money/);
    const no = advanceWeek(s, { actions: [a] });
    expect(no.log.join('\n')).toMatch(/Order not carried out.*not approved Family money/);
    expect(no.state.econ?.goodLife?.length ?? 0).toBe(s.econ?.goodLife?.length ?? 0);
    const yes = advanceWeek(s, { actions: [{ ...a, fund: 'family' }] });
    expect(fundingBlock(s, { ...a, fund: 'family' })).toBeUndefined();
    expect((yes.state.econ?.goodLife?.length ?? 0)).toBe((s.econ?.goodLife?.length ?? 0) + 1);
    expect(yes.report.lines.some((l) => /from the Family/.test(l.label))).toBe(true);
  });
});

describe('A03: goals have prerequisites and are invalidated by rank changes', () => {
  const madeRanks = ['soldier', 'capo', 'underboss', 'consigliere', 'boss'];
  it('no made man starts with "Make his bones" (House of Sees and The House)', () => {
    for (const start of ['sees', 'classic'] as const) {
      const s = newGameWith(`trust-a03-${start}`, start);
      for (const c of Object.values(s.characters).filter((x) => x.alive && madeRanks.includes(x.rank))) {
        expect(fam(s, c.id)?.goal, `${c.firstName} ${c.lastName}`).not.toBe('make_bones');
        expect(c.ambition, `${c.firstName} ${c.lastName}`).not.toMatch(/make his bones/i);
        if (c.goal) expect(personalGoalBlock(s, c, c.goal)).toBeUndefined();
      }
      expect(famGoalBlock(s, player(s), fam(s, s.playerId)?.goal ?? 'protect_family')).toBeUndefined();
    }
  });
  it('a man who gets made loses "make his bones" the next week; a loaded old save is repaired', () => {
    const s = newGameWith('trust-a03b', 'sees');
    const donato = Object.values(s.characters).find((c) => c.firstName === 'Donato' && c.alive)!;
    // Simulate an old save: the capo still carries the stale goal.
    s.dyn!.people[donato.id].goal = 'make_bones';
    donato.ambition = 'Make his bones';
    expect(famGoalBlock(s, donato, 'make_bones')).toMatch(/already made/);
    const loaded = upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(loaded.dyn!.people[donato.id].goal).not.toBe('make_bones');
    expect(loaded.characters[donato.id].ambition).not.toMatch(/make his bones/i);
    // And the weekly update repairs it too.
    const next = advanceWeek(s, {}).state;
    expect(next.dyn!.people[donato.id].goal).not.toBe('make_bones');
  });
});

describe('A05: an evening is booked on the day it happens', () => {
  it('the Friday fights go on Friday, Sunday dinner on Sunday, and no other day accepts them', () => {
    const s = newGameWith('trust-a05', 'sees');
    const fights = roundOptions(s).find((r) => r.id === 'fun:fights')!;
    expect(fights.text).toMatch(/Friday/);
    expect(fights.day).toBe(4);
    const plan = layoutWeek(s, ['fun:fights', 'fam:sunday', 'fun:fights']);
    expect(plan[4]).toBe('fun:fights');
    expect(plan[6]).toBe('fam:sunday');
    for (const d of [0, 1, 2, 3, 5, 6]) expect(dayBlock(s, d, 'fun:fights')).toBe('Only on Friday');
    expect(dayBlock(s, 4, 'fun:fights')).toBeUndefined();
    // The planner can't move it: setEvening refuses a wrong day.
    expect(weekPlan(setEvening(s, 0, 'fun:fights'))[0]).not.toBe('fun:fights');
    expect(formatDay(s, 4)).toMatch(/^Fri /);
  });
});

describe('A06: agreements have human titles, not internal ids', () => {
  it('the Agreements page shows names and counterparties; the ids stay out of sight', () => {
    let s = newGameWith('trust-a06', 'sees');
    s = advanceWeek(s, {}).state;
    const html = renderToString(createElement(WeeklyTake, { s, initial: 'agreements' }));
    expect(html).toContain('data-testid="take-agreements"');
    const visible = html.replace(/data-agreement="[^"]*"/g, '');
    expect(visible).not.toMatch(/agr:(capo|member|ent|inv):/);
    const k = Object.values(s.characters).find((c) => c.alive && c.rank === 'capo')!;
    expect(agreementName(s, `agr:capo:${k.id}`).title).toMatch(/district contract/);
    expect(agreementName(s, `agr:capo:${k.id}`).party).toMatch(/capo/);
    expect(agreementHistoryLine(s, { week: 3, id: `agr:capo:${k.id}`, text: 'keeps 35%' })).not.toMatch(/agr:/);
  });
});

describe('A08: every map lot is a named button', () => {
  it('each lot has an accessible name: its name, what it is, whose', () => {
    const s = newGameWith('trust-a08', 'classic');
    const lots = s.econ?.lots ?? [];
    expect(lots.length).toBeGreaterThan(20);
    for (const l of lots) {
      const n = lotAccessibleName(l);
      expect(n.length).toBeGreaterThan(3);
      expect(n).toMatch(/yours|for sale|for lease|privately held|rival-owned|the city's/);
    }
  });
});

describe('A10: an empty money page says why it is empty', () => {
  it('before the first settlement the audience, crews, envelope and ledger say "not settled yet"; afterwards they fill in', () => {
    const s = newGameWith('trust-a10', 'sees');
    for (const tab of ['audience', 'crews', 'envelope', 'ledger'] as const) {
      const html = renderToString(createElement(WeeklyTake, { s, initial: tab }));
      expect(html, tab).toContain('data-testid="empty-pending"');
      expect(html, tab).toMatch(/after your first week settles/);
    }
    const next = advanceWeek(s, {}).state;
    const aud = renderToString(createElement(WeeklyTake, { s: next, initial: 'audience' }));
    expect(aud).toContain('data-testid="take-audience"');
    expect(aud).not.toContain('data-testid="empty-pending"');
    const crews = renderToString(createElement(WeeklyTake, { s: next, initial: 'crews' }));
    expect(crews).toContain('data-testid="take-crews"');
  });
  it('the four kinds look and read different', () => {
    const kinds = ['pending', 'none', 'unavailable', 'failed'] as const;
    const html = kinds.map((k) => renderToString(createElement(EmptyState, { kind: k, title: 't' })));
    expect(new Set(html.map((h) => h.match(/>([^<]+)<\/div><div class="font-semibold/)?.[1])).size).toBe(4);
  });
});
