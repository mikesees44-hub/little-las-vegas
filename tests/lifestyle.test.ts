import { describe, expect, it } from 'vitest';
import { legalActions, previewAction } from '../src/engine/actions';
import { washCapacity } from '../src/engine/business';
import { alerts } from '../src/engine/alerts';
import { advanceWeek } from '../src/engine/engine';
import { INTERACTION_ORDER, previewInteraction } from '../src/engine/interactions';
import { reconcile } from '../src/engine/ledger';
import { LIFESTYLE_IDS, LIFESTYLES, XP_PER_POINT, allPerks, perkBlocked, perkMod } from '../src/engine/lifestyle';
import { newGame } from '../src/engine/newGame';
import type { GameState } from '../src/engine/types';

function boss(s: GameState) {
  return s.characters[s.playerId];
}

describe('lifestyles and perks', () => {
  it('five lifestyles, three trees each, about five perks a tree, unique ids', () => {
    expect(LIFESTYLE_IDS).toEqual(['muscle', 'money', 'politics', 'family', 'shadows']);
    for (const id of LIFESTYLE_IDS) {
      expect(LIFESTYLES[id].trees).toHaveLength(3);
      for (const t of LIFESTYLES[id].trees) expect(t.perks.length).toBeGreaterThanOrEqual(4);
    }
    const ids = allPerks().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of allPerks()) expect(Object.keys(p.mods).length).toBeGreaterThan(0);
  });

  it('a new boss has no lifestyle, and the alert rail asks him to choose', () => {
    const s = newGame('ls1');
    expect(boss(s).lifestyle).toBeUndefined();
    expect(alerts(s).some((a) => a.kind === 'lifestyle')).toBe(true);
  });

  it('choosing a lifestyle is an order with a named chip, and XP builds weekly', () => {
    let s = newGame('ls2');
    const p = previewAction(s, { kind: 'lifestyle', focus: 'money' });
    expect(p.disabledReason).toBeUndefined();
    expect(p.effects[0].label).toBe('Lifestyle: Money');
    s = advanceWeek(s, { actions: [{ kind: 'lifestyle', focus: 'money' }] }).state;
    expect(boss(s).lifestyle?.focus).toBe('money');
    const xp0 = boss(s).lifestyle!.xp;
    s = advanceWeek(s, {}).state;
    expect(boss(s).lifestyle!.xp + boss(s).lifestyle!.points * XP_PER_POINT).toBeGreaterThan(xp0);
  });

  it('perk points come every 100 XP and perks are bought in order down a tree', () => {
    let s = newGame('ls3');
    s = advanceWeek(s, { actions: [{ kind: 'lifestyle', focus: 'money' }] }).state;
    const b = boss(s);
    expect(perkBlocked(b, 'eye')).toMatch(/perk point/);
    b.lifestyle!.xp = XP_PER_POINT - 1;
    s = advanceWeek(s, {}).state;
    expect(boss(s).lifestyle!.points).toBe(1);
    expect(perkBlocked(boss(s), 'mogul')).toMatch(/First/);
    expect(perkBlocked(boss(s), 'marksman')).toMatch(/Muscle/);
    expect(perkBlocked(boss(s), 'eye')).toBeUndefined();
    expect(legalActions(s).some((a) => a.kind === 'perk')).toBe(true);
    const r = advanceWeek(s, { actions: [{ kind: 'perk', perk: 'eye' }] });
    expect(boss(r.state).lifestyle!.perks).toContain('eye');
    expect(boss(r.state).lifestyle!.points).toBe(0);
    expect(perkMod(r.state, 'income')).toBe(5);
  });

  it('switching keeps perks and points but loses the XP in progress', () => {
    let s = newGame('ls4');
    s = advanceWeek(s, { actions: [{ kind: 'lifestyle', focus: 'shadows' }] }).state;
    boss(s).lifestyle!.perks.push('ears');
    boss(s).lifestyle!.xp = 50;
    boss(s).lifestyle!.points = 2;
    expect(previewAction(s, { kind: 'lifestyle', focus: 'family' }).detail).toMatch(/loses 50 XP/);
    s = advanceWeek(s, { actions: [{ kind: 'lifestyle', focus: 'family' }] }).state;
    const ls = boss(s).lifestyle!;
    expect(ls.focus).toBe('family');
    expect(ls.perks).toContain('ears');
    expect(ls.points).toBe(2);
    expect(ls.xp).toBeLessThan(50);
  });

  it('money perks raise wash capacity and show income as a named, reconciled line', () => {
    const s = newGame('ls5');
    const before = washCapacity(s);
    s.characters[s.playerId].lifestyle = { focus: 'money', xp: 0, points: 0, perks: ['books', 'eye'] };
    expect(washCapacity(s)).toBeGreaterThan(before);
    const r = advanceWeek(s, {});
    const line = r.report.lines.find((l) => l.label.startsWith('Perks: an eye for a racket'));
    expect(line && line.amount).toBeGreaterThan(0);
    expect(reconcile(r.report)).toEqual([]);
  });

  it('acceptance perks show up as a reason, and murder perks make the boss harder to reach', () => {
    const s = newGame('ls6');
    let found: { id: (typeof INTERACTION_ORDER)[number]; target: string } | undefined;
    for (const c of Object.values(s.characters)) {
      for (const id of INTERACTION_ORDER) if (!found && previewInteraction(s, id, c.id)?.acceptance) found = { id, target: c.id };
    }
    expect(found).toBeTruthy();
    const before = previewInteraction(s, found!.id, found!.target)!;
    s.characters[s.playerId].lifestyle = { focus: 'muscle', xp: 0, points: 0, perks: ['shake', 'collector', 'hardcase', 'bodyguards'] };
    const after = previewInteraction(s, found!.id, found!.target)!;
    expect(after.acceptance!.reasons.some((r) => r.label.startsWith('Your perks'))).toBe(true);
    expect(after.acceptance!.chance).toBeGreaterThanOrEqual(before.acceptance!.chance);
    expect(perkMod(s, 'guard')).toBe(15);
  });
});
