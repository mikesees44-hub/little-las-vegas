import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { crew } from '../src/engine/characters';
import { upgradeSave } from '../src/engine/upgradeSave';
import { ageCurve } from '../src/engine/aging';
import { CREW_PERK_LXP, FOCI, manMod, natureFocus } from '../src/engine/lifestyle';
import { ensureXp, growthMonth, hasPerk, monthlyLxp, nextBranch, pinBranch, setFocus, tracked, xpOf, xpEventSource } from '../src/engine/crewXp';
import type { Character, GameState } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));
const men = (s: GameState) => Object.values(s.characters).filter((c) => tracked(s, c) && c.id !== s.playerId);
function soldier(s: GameState, i = 0): Character {
  return crew(s).filter((x) => !x.outside && x.rank === 'soldier').sort((a, b) => a.id.localeCompare(b.id))[i];
}
function months(s: GameState, n: number, only?: Character[]): void {
  for (let i = 0; i < n; i++) growthMonth(newCtx(s), only ?? men(s));
}
function bornAt(s: GameState, c: Character, age: number): void {
  c.birth = { ...s.date, y: s.date.y - age };
}

describe('passive growth: the focus', () => {
  it('every tracked man has a focus after the first month, and no XP popup while the family rule is on', () => {
    let s = newGame('grow-focus');
    let popups = 0;
    for (let w = 0; w < 10; w++) {
      popups += s.pendingEvents.filter((e) => e.defId === 'xp_perk').length;
      s = advanceWeek(s, {}).state;
    }
    expect(s.xp?.auto).toBe(true);
    for (const c of men(s)) expect(xpOf(s, c.id)?.fo, c.id).toBeDefined();
    expect(popups).toBe(0);
    expect(xpEventSource(s)).toBeUndefined();
  });
  it('setting a focus is pure; matching his nature pleases him, against it does not', () => {
    const s = newGame('grow-set');
    const c = soldier(s);
    const nat = natureFocus(s, c);
    const other = (['muscle', 'money', 'brains', 'diplomacy', 'leadership'] as const).find((f) => f !== nat)!;
    const a = setFocus(s, c.id, nat);
    const b = setFocus(s, c.id, other);
    expect(xpOf(s, c.id)?.fo).toBeUndefined();
    expect(xpOf(a, c.id)?.fo).toBe(nat);
    expect(xpOf(b, c.id)?.fs).toBe(1);
  });
});

describe('passive growth: the age curve and the skills', () => {
  it('a 20-year-old outgrows a 50-year-old with the same skills (about 1.5 / 0.7)', () => {
    const s = newGame('grow-age');
    const y = soldier(s, 0);
    const o = soldier(s, 1);
    o.attributes = { ...y.attributes };
    o.traits = [...y.traits];
    bornAt(s, y, 20);
    bornAt(s, o, 50);
    ensureXp(s);
    s.xp!.men[y.id] = { xp: 0, lvl: 1, fo: 'muscle' };
    s.xp!.men[o.id] = { xp: 0, lvl: 1, fo: 'muscle' };
    months(s, 12, [y, o]);
    const ly = xpOf(s, y.id)!.lx!;
    const lo = xpOf(s, o.id)!.lx!;
    expect(ly / lo).toBeGreaterThan(1.7);
    expect(ly / lo).toBeLessThan(2.6);
    expect(ageCurve(20) / ageCurve(50)).toBeCloseTo(1.5 / 0.7, 5);
  });
  it('a prime-age soldier gains +1 to +3 in his focus skill in a year (three seeds)', () => {
    for (const seed of ['grow-p1', 'grow-p2', 'grow-p3']) {
      const s = newGame(seed);
      const c = soldier(s);
      bornAt(s, c, 32);
      const f = natureFocus(s, c);
      const k = FOCI[f].skill;
      const before = c.attributes[k];
      months(s, 12, [c]);
      const gain = c.attributes[k] - before;
      expect(gain, `${seed} ${f} ${before}`).toBeGreaterThanOrEqual(1);
      expect(gain, `${seed} ${f} ${before}`).toBeLessThanOrEqual(3);
    }
  });
});

describe('passive growth: the perk trees', () => {
  it('perks come in branch order, one every 100 lifestyle XP; a pinned branch is respected; old specialties resolve', () => {
    const s = newGame('grow-perks');
    const c = soldier(s);
    bornAt(s, c, 30);
    ensureXp(s).men[c.id] = { xp: 0, lvl: 1, fo: 'muscle' };
    const b0 = nextBranch(s, c)!;
    let total = 0;
    for (let i = 0; i < 24; i++) {
      total += monthlyLxp(s, c);
      growthMonth(newCtx(s), [c]);
      expect(xpOf(s, c.id)!.gp?.length ?? 0).toBe(Math.min(12, Math.floor(total / CREW_PERK_LXP)));
    }
    const gp = xpOf(s, c.id)!.gp!;
    const branch = FOCI.muscle.branches[b0].perks.map((p) => p.id);
    expect(gp.slice(0, Math.min(4, gp.length))).toEqual(branch.slice(0, Math.min(4, gp.length)));
    // The first node of every muscle branch is an old specialty: hasPerk sees it.
    const first = FOCI.muscle.branches[b0].perks[0];
    expect(first.xp && hasPerk(s, c, first.xp)).toBe(true);
    // Pinned: the next perk comes from the pinned branch.
    const t = newGame('grow-pin');
    const d = soldier(t);
    bornAt(t, d, 30);
    ensureXp(t).men[d.id] = { xp: 0, lvl: 1, fo: 'money', lp: CREW_PERK_LXP - 1 };
    const pinned = ((nextBranch(t, d)! + 1) % 3) as 0 | 1 | 2;
    const u = pinBranch(t, d.id, pinned);
    growthMonth(newCtx(u), [u.characters[d.id]]);
    expect(xpOf(u, d.id)!.gp![0]).toBe(FOCI.money.branches[pinned].perks[0].id);
  });
  it('manMod sums one man\'s perks only', () => {
    const s = newGame('grow-mod');
    const c = soldier(s);
    ensureXp(s).men[c.id] = { xp: 0, lvl: 1, fo: 'money', gp: ['$_margin', '$_steady'] };
    expect(manMod(s, c, 'hustle')).toBe(15);
    expect(manMod(s, soldier(s, 1), 'hustle')).toBe(0);
  });
});

describe('passive growth: determinism and the save', () => {
  it('deterministic, never moves the main dice, round-trips, stays small', () => {
    const s = newGame('grow-det');
    for (const c of men(s)) bornAt(s, c, 30);
    const a = clone(s);
    const b = clone(s);
    const rng = a.rng;
    months(a, 6);
    months(b, 6);
    expect(a.rng).toBe(rng);
    expect(JSON.stringify(a.xp)).toBe(JSON.stringify(b.xp));
    const back = upgradeSave(clone(a));
    expect(JSON.stringify(back.xp)).toBe(JSON.stringify(a.xp));
    // The growth keys only: under 2 KB for 40 men.
    const ms = Object.values(a.xp!.men);
    const per = ms.map((m) => JSON.stringify({ fo: m.fo, fs: m.fs, lx: m.lx, lp: m.lp, br: m.br, gp: m.gp, acc: m.acc }).length);
    const avg = per.reduce((x, y) => x + y, 0) / per.length;
    expect(avg * 40).toBeLessThan(2048 * 2);
    expect(JSON.stringify(a.xp!.grew ?? []).length).toBeLessThan(3000);
  });
  it('upgradeSave changes nothing on a current save (focus comes with the first monthly pass)', () => {
    const s = newGame('grow-up');
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(clone(s)))).toBe(before);
  });
});

describe('growth at a glance', () => {
  it('a chart node shows his rank, level, focus icon and newest perk', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { TreeNode } = await import('../src/ui/components/CrewTree');
    const s = newGame('grow-node');
    const c = soldier(s);
    ensureXp(s).men[c.id] = { xp: 30, lvl: 2, fo: 'muscle', gp: ['m_wheel', 'm_steady'] };
    const html = renderToString(createElement(TreeNode, { s, c, size: 44 }));
    expect(html).toContain('data-testid="xp-pip"');
    expect(html).toContain('>2<');
    expect(html).toContain('data-testid="growth-focus"');
    expect(html).toContain('✊');
    expect(html).toContain('Steady Hand');
    expect(html.toLowerCase()).toContain('soldier');
  });
  it('the week in brief lists at most 5 growth lines, with "+n more"', async () => {
    const { growthLines } = await import('../src/engine/weekSummary');
    const s = newGame('grow-brief');
    const x = ensureXp(s);
    x.grew = men(s).slice(0, 8).flatMap((c) => [{ w: s.week, id: c.id, t: '+1 Force (Muscle)', k: 'skill' as const }, { w: s.week, id: c.id, t: '+1 Force (Muscle)', k: 'skill' as const }, { w: s.week, id: c.id, t: 'earned Steady Hand', k: 'perk' as const }]);
    const g = growthLines(s, s.week);
    const n = Math.min(8, men(s).length);
    expect(g.lines.length).toBe(Math.min(5, n));
    expect(g.more).toBe(Math.max(0, n - 5));
    expect(g.lines[0].text).toContain('+2 Force (Muscle); earned Steady Hand');
  });
});
