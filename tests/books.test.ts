import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { applyEffects } from '../src/engine/effects';
import { newCtx } from '../src/engine/ledger';
import { capos, crew, player } from '../src/engine/characters';
import { previewAction } from '../src/engine/actions';
import { booksRaid, capoTrends, detectChance, fileReceipt, filterLines, MODE_INFO, reconcileBooks, visibleWeeks, archiveWeek } from '../src/engine/ledgerbook';
import { ensureLedgerBook, type BooksMode } from '../src/engine/ledgerbookState';
import { emptyReport } from '../src/engine/engine';
import { evidenceGain } from '../src/engine/longgame';
import { randomChoices } from './helpers';
import type { GameState } from '../src/engine/types';

function played(seed: string, weeks: number, mode: BooksMode = 'full'): GameState {
  let s = newGame(seed);
  ensureLedgerBook(s).mode = mode;
  for (let w = 0; w < weeks && !s.gameOver; w++) s = advanceWeek(s, randomChoices(s, w)).state;
  return s;
}

describe('the books (the receipts)', () => {
  it('the books match the ledger exactly: every money line, every week, reconciled to the treasury', () => {
    let s = newGame('books-recon');
    ensureLedgerBook(s).mode = 'full';
    for (let w = 0; w < 30; w++) {
      const r = advanceWeek(s, randomChoices(s, w));
      s = r.state;
      const last = s.ledgerBook!.weeks[s.ledgerBook!.weeks.length - 1];
      expect(last.week).toBe(r.report.week);
      const ledger = r.report.lines.filter((l) => l.stat === 'money' && l.amount !== 0);
      expect(last.lines.map((l) => [l.a, l.l, l.c])).toEqual(ledger.map((l) => [l.amount, l.label, l.category]));
      expect(last.end - last.start).toBe(r.report.end.money - r.report.start.money);
    }
    const rec = reconcileBooks(s);
    expect(rec.length).toBeGreaterThan(20);
    for (const x of rec) expect(x.ok, `week ${x.week}: lines ${x.lines} vs delta ${x.delta}`).toBe(true);
  });

  it('every envelope says who and from where: kick-ups carry the capo and his district', () => {
    const s = played('books-who', 12);
    const kicks = filterLines(s, { section: 'kickup' });
    expect(kicks.length).toBeGreaterThan(0);
    for (const k of kicks.filter((x) => x.line.l.startsWith('Kick-up:'))) {
      expect(s.characters[k.line.w!]).toBeTruthy();
      expect(s.districts.some((d) => d.id === k.line.s)).toBe(true);
    }
    // Filters by person and by week narrow it down; the per-capo trend adds up to the lines.
    const k0 = capoTrends(s)[0];
    const mine = filterLines(s, { who: k0.id, section: 'kickup' });
    expect(mine.reduce((a, x) => a + x.line.a, 0)).toBe(k0.total);
    const wk = visibleWeeks(s)[0].week;
    expect(filterLines(s, { week: wk }).every((x) => x.week === wk)).toBe(true);
  });

  it('discrepancy detection is stronger with the full books', () => {
    expect(detectChance('full', 1, 0.2)).toBeGreaterThan(detectChance('coded', 1, 0.2));
    expect(detectChance('coded', 1, 0.2)).toBeGreaterThan(detectChance('head', 1, 0.2));
    const caught = (mode: BooksMode) => {
      const s = newGame('books-detect');
      const b = ensureLedgerBook(s);
      b.mode = mode;
      const k = capos(s)[0];
      const d = s.districts.find((x) => x.capoId === k.id) ?? s.districts[0];
      let found = 0;
      for (let w = 1; w <= 200; w++) {
        s.week = w;
        b.cur = [{ k: k.id, d: d.id, owed: 1000, paid: 800, held: 0, skim: 200 }];
        archiveWeek(s, { ...emptyReport(s), week: w });
        const open = b.discrepancies.find((x) => x.whoId === k.id && !x.settled);
        if (open) {
          found++;
          open.settled = 'forgiven';
        }
      }
      return found;
    };
    const head = caught('head');
    const full = caught('full');
    expect(full).toBeGreaterThan(head * 2);
  });

  it('a raid that seizes the full books adds more evidence than one on a coded ledger, and your head holds nothing', () => {
    const base = played('books-raid', 15, 'full');
    const hit = (mode: BooksMode) => {
      const s = cloneState(base);
      ensureLedgerBook(s).mode = mode;
      const before = player(s).evidence ?? 0;
      const ctx = newCtx(s);
      booksRaid(ctx, 'fbi', true);
      return (player(s).evidence ?? 0) - before;
    };
    const full = hit('full');
    const coded = hit('coded');
    const head = hit('head');
    expect(full).toBeGreaterThan(coded);
    expect(coded).toBeGreaterThan(head);
    expect(head).toBe(0);
    // The seized books are gone from your side.
    const s = cloneState(base);
    booksRaid(newCtx(s), 'police', true);
    expect(s.ledgerBook!.weeks.length).toBe(0);
    expect(s.ledgerBook!.seizures.length).toBe(1);
    expect(MODE_INFO.full.raid.boss).toBeGreaterThan(MODE_INFO.coded.raid.boss);
  });

  it('keeping books is evidence week to week, shown as a reason on the federal case', () => {
    const s = newGame('books-reason');
    s.heat.federal = 50;
    ensureLedgerBook(s).mode = 'full';
    const full = evidenceGain(s).reasons;
    ensureLedgerBook(s).mode = 'head';
    const head = evidenceGain(s).reasons;
    expect(full.find((r) => /books/.test(r.label))?.value ?? 0).toBeGreaterThan(head.find((r) => /books/.test(r.label))?.value ?? 0);
  });

  it('a bad report can be checked; a caught skim is a discrepancy the boss can confront, and the money comes back through the ledger', () => {
    let s = newGame('books-receipt');
    s.money = 20000;
    const liar = crew(s).find((c) => c.rank === 'soldier')!;
    liar.wealth = 5000;
    const r = fileReceipt(s, { byId: liar.id, job: 'the Garden Pier job', kind: 'heist', actual: 3000, reported: 2000, outcome: 'clean', jobId: 'test-job' });
    expect(r.lie).toBe(true);
    // Check through the consigliere and the enforcer until one of them gets it (both are deterministic).
    for (const via of ['consigliere', 'enforcer'] as const) {
      const rec = s.ledgerBook!.receipts.find((x) => x.id === r.id)!;
      if (rec.checked) break;
      const p = previewAction(s, { kind: 'ledger', op: { op: 'check', receiptId: r.id, via } });
      if (p.disabledReason) continue;
      expect(p.odds?.chance).toBeGreaterThan(0);
      s = advanceWeek(s, { actions: [{ kind: 'ledger', op: { op: 'check', receiptId: r.id, via } }] }).state;
    }
    const rec = s.ledgerBook!.receipts.find((x) => x.id === r.id)!;
    expect(rec.checked).toBeDefined();
    if (rec.checked!.caught) {
      const d = s.ledgerBook!.discrepancies.find((x) => x.receiptId === r.id)!;
      expect(d.amount).toBe(1000);
      const res = advanceWeek(s, { actions: [{ kind: 'ledger', op: { op: 'confront', discId: d.id } }] });
      const line = res.report.lines.find((l) => l.stat === 'money' && /made it good/.test(l.label));
      expect(line?.amount).toBe(1000);
      expect(res.state.ledgerBook!.discrepancies.find((x) => x.id === d.id)!.settled).toBe('confronted');
    }
  });

  it('a skimming capo shows up in the books sooner with the full books (integration)', () => {
    const run = (mode: BooksMode) => {
      let s = newGame('books-skim');
      ensureLedgerBook(s).mode = mode;
      for (const k of capos(s)) {
        k.traits = ['Greedy', 'Ambitious'];
        applyEffects(newCtx(s), [{ type: 'opinion', from: k.id, to: s.playerId, amount: -40, reason: 'Test: resents you', decay: 0 }], { label: 't', because: 't' });
      }
      for (let w = 0; w < 40; w++) s = advanceWeek(s, {}).state;
      return s.ledgerBook!.stats.skimsFound;
    };
    expect(run('full')).toBeGreaterThanOrEqual(run('head'));
  });
});
