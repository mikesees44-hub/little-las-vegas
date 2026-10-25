import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { legalActions, previewAction, resolveActions } from '../src/engine/actions';
import { explainAction, immediateTotal } from '../src/engine/advice';
import { pillarPurpose } from '../src/engine/advicePillars';
import { bonesActions, needsBones } from '../src/engine/bones';
import { rankCandidates, type Role } from '../src/engine/candidates';
import { crew } from '../src/engine/characters';
import { advanceWeek } from '../src/engine/engine';
import { capability, challengePressure, DESIGNATION_MODES } from '../src/engine/heir';
import { ledgerActions } from '../src/engine/ledgerbook';
import { newCtx, sumLines } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { whatShouldIDo } from '../src/engine/opportunities';
import { polActions } from '../src/engine/politics';
import { powerActions } from '../src/engine/power';
import { romanceActions } from '../src/engine/romance';
import { suggestPlan } from '../src/engine/travel';
import type { GameState, PlayerAction } from '../src/engine/types';
import { HeirCompare, KeeperPicker, OfficialPicker, TripWhy } from '../src/ui/clarity';

/**
 * The clarity layer on the newer pillars: power, politics, romance, bones,
 * the books and travel. The why-panels must agree with what the orders
 * actually do, and the pickers must only offer orders the cards accept.
 */

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

function midGame(seed: string, weeks = 10): GameState {
  let s = newGame(seed);
  for (let i = 0; i < weeks; i++) s = advanceWeek(s, {}).state;
  s.money = 80000;
  return s;
}

/** A broad sample of orders from every newer pillar. */
function pillarSample(s: GameState): PlayerAction[] {
  const men = crew(s);
  const assoc = men.filter((c) => c.rank === 'associate');
  const kin = Object.values(s.characters).find((c) => c.dynasty && c.alive && c.id !== s.playerId);
  return [
    ...polActions(s), ...romanceActions(s),
    ...Object.values(s.characters).filter((c) => c.alive && c.id !== s.playerId && !c.dynasty).slice(0, 30).flatMap((c) => (['court', 'affair'] as const).map((id) => ({ kind: 'interact', id, target: c.id }) as PlayerAction)), ...bonesActions(s), ...ledgerActions(s), ...powerActions(s),
    ...(['heist', 'collection'] as const).flatMap((k) => assoc.map((c) => ({ kind: 'bones', op: { op: 'assign', charId: c.id, kind: k } }) as PlayerAction)),
    ...assoc.map((c) => ({ kind: 'bones', op: { op: 'favor', charId: c.id } }) as PlayerAction),
    ...(['head', 'coded', 'full'] as const).map((mode) => ({ kind: 'ledger', op: { op: 'mode', mode } }) as PlayerAction),
    ...men.slice(0, 4).map((c) => ({ kind: 'ledger', op: { op: 'keeper', charId: c.id } }) as PlayerAction),
    { kind: 'travel', op: { type: 'trip', plan: suggestPlan(s, s.playerId) } },
    { kind: 'travel', op: { type: 'trip', plan: suggestPlan(s, s.playerId, 'philadelphia', 'business') } },
    ...DESIGNATION_MODES.map((mode) => ({ kind: 'power', op: { op: 'designate', mode, charId: kin?.id } }) as PlayerAction),
    ...men.slice(0, 3).map((c) => ({ kind: 'power', op: { op: 'read', charId: c.id } }) as PlayerAction),
    ...(['intel', 'crews', 'safehouses'] as const).map((kind) => ({ kind: 'power', op: { op: 'prep', kind } }) as PlayerAction),
    { kind: 'power', op: { op: 'mattresses', on: true } }, { kind: 'power', op: { op: 'bodyguards', on: true } }, { kind: 'power', op: { op: 'audience' } },
  ];
}

describe('clarity on the newer pillars: explainAction', () => {
  it('matches what actually gets applied for power, politics, romance, bones, books and travel orders (no lying tooltips)', () => {
    const checked: Record<string, number> = {};
    for (const seed of ['clar-pil1', 'clar-pil2']) {
      const s0 = midGame(seed);
      for (const a of pillarSample(s0)) {
        if (previewAction(s0, a).disabledReason) continue;
        for (let k = 0; k < 3; k++) {
          const s = clone(s0);
          s.rng = (s.rng + k * 7919) >>> 0;
          const p = previewAction(s, a);
          const ex = explainAction(s, a);
          const ctx = newCtx(s);
          resolveActions(ctx, [a]);
          const got = sumLines(ctx.lines);
          if (ctx.log.some((l) => l.endsWith('— refused.'))) {
            const want = (p.refuseEffects ?? []).reduce((x, e) => x + (e.type === 'money' ? e.amount : 0), 0);
            expect(got.money ?? 0, `${p.title} (refused)`).toBe(want);
            checked[a.kind] = (checked[a.kind] ?? 0) + 1;
            continue;
          }
          for (const st of ['money', 'respect', 'heat.local', 'heat.family', 'heat.federal'] as const) {
            expect(got[st] ?? 0, `${p.title}: ${st}`).toBe(immediateTotal(ex, st));
          }
          checked[a.kind] = (checked[a.kind] ?? 0) + 1;
        }
      }
    }
    for (const kind of ['power', 'pol', 'bones', 'ledger', 'travel', 'interact']) expect(checked[kind] ?? 0, kind).toBeGreaterThan(2);
  });

  it('says why for every pillar order, and never touches the state', () => {
    const s = midGame('clar-pil-why');
    const before = JSON.stringify(s);
    for (const a of pillarSample(s)) {
      const ex = explainAction(s, a);
      if (a.kind !== 'interact') expect(pillarPurpose(a), `${a.kind} ${JSON.stringify(a)}`).toBeTruthy();
      expect(ex.purpose.length).toBeGreaterThan(10);
      expect(ex.verdict.label.length).toBeGreaterThan(3);
    }
    expect(JSON.stringify(s)).toBe(before);
  });

  it('a trip is explained with its cost, and what is risky about it', () => {
    const s = midGame('clar-pil-trip');
    const a: PlayerAction = { kind: 'travel', op: { type: 'trip', plan: suggestPlan(s, s.playerId) } };
    const ex = explainAction(s, a);
    expect(ex.purpose).toMatch(/stress/);
    expect(ex.bestWhen.some((c) => c.text.includes('No war'))).toBe(true);
  });
});

describe('clarity on the newer pillars: rankCandidates', () => {
  const roles: Role[] = [{ kind: 'heir', wide: true }, { kind: 'official' }, { kind: 'keeper' }, { kind: 'bones', job: 'collection' }, { kind: 'bones', job: 'heist' }, { kind: 'make' }];

  it('ranks heirs, officials, bookkeepers and bones prospects, deterministically and without side effects', () => {
    const s = midGame('clar-pil-rank');
    const before = JSON.stringify(s);
    for (const role of roles) {
      const r = rankCandidates(s, role);
      expect(JSON.stringify(r)).toBe(JSON.stringify(rankCandidates(clone(s), role)));
      if (role.kind !== 'make') expect(r.candidates.length, role.kind).toBeGreaterThan(0);
      for (const c of r.candidates) {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
        expect(c.pros.length + c.cons.length).toBeGreaterThan(0);
      }
      if (r.recommendedId) expect(r.candidates.find((c) => !c.disabledReason)?.id).toBe(r.recommendedId);
    }
    expect(JSON.stringify(s)).toBe(before);
  });

  it('only offers orders the cards accept (no lying pickers)', () => {
    const s = midGame('clar-pil-legal');
    for (const role of roles) {
      for (const c of rankCandidates(s, role).candidates) {
        if (!c.action) continue;
        expect(previewAction(s, c.action).disabledReason, `${role.kind}: ${c.name}`).toBe(c.disabledReason);
      }
    }
  });

  it('membership respects the bones rule', () => {
    const s = midGame('clar-pil-bones');
    s.books = { ...(s.books ?? { open: true, slots: 2, nextChange: s.week + 10 }), open: true, slots: 2 };
    const pool = crew(s).filter((c) => c.rank === 'associate' && !c.specialty && c.proposedWeek === undefined);
    const unbloodied = pool.filter((c) => needsBones(s, c));
    expect(unbloodied.length).toBeGreaterThan(0);
    const r = rankCandidates(s, { kind: 'make' }, pool.map((c) => c.id));
    for (const c of unbloodied) expect(r.candidates.find((x) => x.id === c.id)?.disabledReason).toBeTruthy();
    // ...and "What should I do?" points at the bones picker instead.
    expect(whatShouldIDo(s, 8).some((o) => o.id === 'bones' && o.link.role?.kind === 'bones')).toBe(true);
  });

  it('reads the heir paradox: capability and pressure are the Power tab\'s numbers', () => {
    const s = midGame('clar-pil-heir');
    const r = rankCandidates(s, { kind: 'heir', wide: true });
    for (const c of r.candidates.slice(0, 5)) {
      const ch = s.characters[c.charId!];
      expect(c.outcome).toContain(`capability ${capability(s, ch).score}`);
      expect(c.outcome).toContain(`pressure ${challengePressure(s, ch).score}`);
    }
    // Men outside the blood say so.
    const outsider = r.candidates.find((c) => !s.characters[c.charId!].dynasty);
    if (outsider) expect(outsider.cons.some((x) => x.text.startsWith('Not of the blood'))).toBe(true);
  });

  it('a clean, honest official is harder to buy than a greedy one with a low integrity', () => {
    const s = midGame('clar-pil-off');
    const r = rankCandidates(s, { kind: 'official' });
    const easy = r.candidates.filter((c) => c.pros.some((p) => p.text.startsWith('Takes envelopes')));
    const clean = r.candidates.filter((c) => c.cons.some((p) => p.text.startsWith('Clean (integrity')));
    if (easy.length && clean.length) {
      const pct = (o: string) => Number(/^(\d+)%/.exec(o)?.[1] ?? 100);
      expect(Math.max(...easy.map((c) => pct(c.outcome)))).toBeGreaterThan(Math.min(...clean.map((c) => pct(c.outcome))));
    }
    expect(r.question).toBe('Which official is worth owning?');
  });
});

describe('clarity on the newer pillars: UI', () => {
  it('renders the ready-made pickers and the trip why-panel', () => {
    const s = midGame('clar-pil-ui', 6);
    expect(renderToString(createElement(OfficialPicker, { s, defaultOpen: true }))).toContain('Which official is worth owning?');
    expect(renderToString(createElement(KeeperPicker, { s }))).toContain('Who should keep the books?');
    const house = Object.values(s.characters).filter((c) => c.dynasty && c.alive && c.id !== s.playerId).map((c) => c.id);
    expect(renderToString(createElement(HeirCompare, { s, pool: house, onPick: () => {} }))).toContain('data-testid="heir-compare"');
    expect(renderToString(createElement(TripWhy, { s, action: { kind: 'travel', op: { type: 'trip', plan: suggestPlan(s, s.playerId) } } }))).toContain('data-testid="verdict"');
  });

  it('the legal-actions sample still explains itself after the merge', () => {
    const s = midGame('clar-pil-legal2', 4);
    for (const a of legalActions(s).slice(0, 60)) expect(explainAction(s, a).purpose.length).toBeGreaterThan(5);
  });
});
