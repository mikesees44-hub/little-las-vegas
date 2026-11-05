import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { FACES } from '../src/engine/faces';
import { newCtx } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { applyShowOp, ensureShowbiz, mine, previewShowbiz, signOdds, talent } from '../src/engine/showbiz';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { GameState } from '../src/engine/types';

const free = (s: GameState) => talent(s).filter((a) => !a.by);

describe('showbiz: the bench', () => {
  it('a new game seeds a bench of adult performers, Black performers among them, with photos', () => {
    const s = newGame('sb-bench');
    const S = s.showbiz!;
    const acts = Object.values(S.acts);
    expect(acts.length).toBeGreaterThanOrEqual(25);
    expect(acts.length).toBeLessThanOrEqual(40);
    for (const a of acts) {
      const c = s.characters[a.id];
      expect(c?.alive).toBe(true);
      expect(s.date.y - c.birth.y).toBeGreaterThanOrEqual(18);
    }
    expect(acts.filter((a) => s.characters[a.id].ethnicity === 'Black').length).toBeGreaterThanOrEqual(8);
    // Sepia photos only for Black performers.
    for (const a of acts) if (a.ph?.startsWith('pb')) expect(s.characters[a.id].ethnicity).toBe('Black');
    expect(acts.some((a) => a.loc)).toBe(true);
    // The save is already in its final form.
    const raw = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw)))).toBe(raw);
  });

  it('the reserved faces go to Black performers, and only to them', () => {
    for (const start of ['classic', 'olddon', 'associate'] as const) {
      let s = newGameWith(`sb-faces-${start}`, start as never);
      for (let w = 0; w < 2; w++) s = advanceWeek(s).state;
      const black = new Set(FACES.filter((f) => f.eth === 'Black').map((f) => f.k));
      expect(black.has('s05') && black.has('s08') && black.has('q04')).toBe(true);
      let held = 0;
      for (const c of Object.values(s.characters)) {
        if (!c.alive || !c.appearance?.face) continue;
        if (black.has(c.appearance.face)) { held++; expect(c.ethnicity, `${c.firstName} ${c.lastName}`).toBe('Black'); expect(s.showbiz?.acts[c.id], c.firstName).toBeTruthy(); }
        if (c.ethnicity === 'Black') expect(black.has(c.appearance.face)).toBe(true);
      }
      expect(held).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('showbiz: signing', () => {
  it('odds rise with the asker\'s rank and the money on the table', () => {
    const s = newGame('sb-odds');
    const a = free(s).find((x) => x.fame >= 10)!;
    const boss = signOdds(s, a, 20, 52, 400).chance;
    const lowball = signOdds(s, a, 35, 156, 0).chance;
    const generous = signOdds(s, a, 15, 26, 2000).chance;
    expect(generous).toBeGreaterThan(boss);
    expect(boss).toBeGreaterThan(lowball);
    const so = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'soldier');
    if (so) {
      const viaSoldier = signOdds(s, a, 20, 52, 400, so.id);
      expect(viaSoldier.chance).toBeLessThanOrEqual(boss);
    }
    // A rival office's act cannot be signed straight: buy out or lean.
    const held = talent(s).find((x) => x.by === 'manno' || x.by === 'feldstein')!;
    expect(previewShowbiz(s, { op: 'sign', id: held.id, pct: 20, weeks: 52, adv: 0 }).disabledReason).toMatch(/buy them out|lean/);
    expect(previewShowbiz(s, { op: 'lean', id: held.id }).warning).toBeTruthy();
  });
});

describe('showbiz: the books', () => {
  it('reconcile over 12 weeks with a signed act, a gig and a record', () => {
    let s = newGame('sb-books');
    s.money += 20000;
    const a = free(s).find((x) => x.k === 'singer')!;
    const ctx = newCtx(s);
    applyShowOp(ctx, { op: 'sign', id: a.id, pct: 25, weeks: 52, adv: 300 });
    applyShowOp(ctx, { op: 'label', home: 'Wildwood' });
    applyShowOp(ctx, { op: 'book', id: a.id, rung: 0 });
    applyShowOp(ctx, { op: 'press', id: a.id, radio: 2 });
    expect(mine(s).map((x) => x.id)).toContain(a.id);
    expect(s.showbiz!.acts[a.id].gig).toBeTruthy();
    const lines: string[] = [];
    for (let w = 0; w < 12; w++) {
      const r = advanceWeek(s, {});
      s = r.state;
      for (const l of r.report.lines) if (l.stat === 'money') lines.push(l.label);
      const act = s.showbiz!.acts[a.id];
      if (act && act.by === 'p' && !act.gig && w < 8) {
        const c2 = newCtx(s);
        applyShowOp(c2, { op: 'book', id: a.id, rung: 0 });
      }
    }
    expect(lines.some((l) => /% of the week at/.test(l))).toBe(true);
    expect(lines.some((l) => /copies/.test(l))).toBe(true);
    expect(lines.some((l) => /disc jockeys/.test(l))).toBe(true);
    expect(s.showbiz!.acts[a.id]?.earn ?? 0).toBeGreaterThan(0);
    expect(s.showbiz!.label!.recs[0].sold).toBeGreaterThan(0);
  });

  it('a queued signing goes through the week and the act decides', () => {
    let s = newGame('sb-queue');
    s.money += 5000;
    const a = free(s)[0];
    s = advanceWeek(s, { actions: [{ kind: 'showbiz', op: { op: 'sign', id: a.id, pct: 10, weeks: 26, adv: 1500 } }] }).state;
    const act = s.showbiz!.acts[a.id];
    expect(act.by === 'p' || act.h.some(([, t]) => /Turned down/.test(t))).toBe(true);
  });
});

describe('showbiz: the artists\' will', () => {
  it('an unhappy act leaves when the contract runs out; a happy one re-signs', () => {
    let s = newGame('sb-leave');
    const [a, b] = free(s);
    const ctx = newCtx(s);
    applyShowOp(ctx, { op: 'sign', id: a.id, pct: 35, weeks: 26, adv: 0 });
    applyShowOp(ctx, { op: 'sign', id: b.id, pct: 15, weeks: 26, adv: 0 });
    const S = ensureShowbiz(s);
    S.acts[a.id].con = 20;
    S.acts[a.id].scene = s.week + 100;
    S.acts[a.id].deal!.until = s.week + 1;
    S.acts[b.id].con = 90;
    S.acts[b.id].deal!.until = s.week + 1;
    for (let w = 0; w < 2; w++) s = advanceWeek(s).state;
    expect(s.showbiz!.acts[a.id].by).not.toBe('p');
    expect(s.showbiz!.acts[a.id].h.some(([, t]) => /Left you/.test(t))).toBe(true);
    expect(s.showbiz!.acts[b.id].by).toBe('p');
    expect(s.showbiz!.stats.left).toBeGreaterThanOrEqual(1);
  });

  it('new talent arrives each season and the bench stays compact', () => {
    let s = newGame('sb-season');
    const before = s.showbiz!.stats.arrived;
    for (let w = 0; w < 14; w++) s = advanceWeek(s).state;
    expect(s.showbiz!.stats.arrived).toBeGreaterThan(before);
    expect(Object.keys(s.showbiz!.acts).length).toBeLessThanOrEqual(40);
    expect(JSON.stringify(s.showbiz).length).toBeLessThan(30000);
  });
});
