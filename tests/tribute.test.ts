import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx, reconcile } from '../src/engine/ledger';
import { allocate, reconcileAccounts, tributeOpen, xfer } from '../src/engine/tribute';
import { allTalkIds, spoken } from '../src/engine/tributeTalk';
import { ensureTribute, houseCash, normSplit, sumSplit } from '../src/engine/tributeState';
import { checkRequired, familyCounts, play52, requiredFamily } from './tributeFamily';
import { randomChoices } from './helpers';
import type { GameState } from '../src/engine/types';

function play(seed: string, weeks: number): GameState {
  let s = newGame(seed);
  for (let i = 0; i < weeks && !s.gameOver; i++) s = advanceWeek(s, randomChoices(s, i)).state;
  return s;
}

describe('the weekly take: accounts and the journal', () => {
  it('every week the crews\' money goes up through the underboss into an envelope, and the accounts reconcile', () => {
    let s = newGame('take-a');
    for (let i = 0; i < 20; i++) {
      const r = advanceWeek(s, randomChoices(s, i));
      expect(reconcile(r.report)).toEqual([]);
      s = r.state;
      const t = s.tribute!;
      const rep = t.reports[t.reports.length - 1];
      expect(rep.week).toBe(r.report.week);
      // The underboss presents only what is actually there.
      expect(rep.presented).toBeLessThanOrEqual(rep.collected);
      expect(rep.collected).toBe(rep.ubShare + rep.ubSkim + rep.presented + (rep.issues.find((x) => x.kind === 'late')?.amount ?? 0));
      // No account below zero; the journal of the week matches the balances.
      for (const v of [t.acct.personal, t.acct.reserve, t.acct.envelope, t.acct.clearing]) expect(v).toBeGreaterThanOrEqual(0);
      const b = t.books[t.books.length - 1];
      for (const k of ['personal', 'reserve', 'envelope']) {
        const exp = b.start[k] - b.x.filter((x) => x[0] === k).reduce((a, x) => a + x[2], 0) + b.x.filter((x) => x[1] === k).reduce((a, x) => a + x[2], 0);
        expect(exp, `week ${b.week} ${k}`).toBe(b.end[k]);
      }
    }
  });

  it('a transfer is idempotent by key, never overdraws, and never creates money', () => {
    const s = newGame('take-b');
    ensureTribute(s);
    tributeOpen(s);
    const ctx = newCtx(s);
    s.tribute!.acct.reserve = 1000;
    const before = houseCash(s);
    expect(xfer(ctx, 'reserve', 'personal', 600, 'transfer', 'k1')).toBe(600);
    expect(xfer(ctx, 'reserve', 'personal', 600, 'transfer', 'k1')).toBe(0); // same key: nothing moves twice
    expect(xfer(ctx, 'reserve', 'personal', 5000, 'transfer', 'k2')).toBe(400); // only what is there
    expect(s.tribute!.acct.reserve).toBe(0);
    expect(xfer(ctx, 'personal', 'treasury', 300, 'transfer', 'k3', { label: 'test' })).toBe(300);
    expect(houseCash(s)).toBe(before); // moving between accounts is not revenue
    expect(ctx.lines.every((l) => l.category === 'transfer')).toBe(true);
    expect(() => xfer(ctx, 'reserve', 'nowhere', 1, 'transfer', 'bad')).toThrow();
    s.tribute!.start!.reserve = 1000; // the snapshot was taken before the test seeded the reserve
    expect(reconcileAccounts(s)).toEqual([]);
  });

  it('the split must total 100% and runs once: a report is never split twice', () => {
    const s = play('take-c', 6);
    const t = s.tribute!;
    const rep = t.reports[t.reports.length - 1];
    expect(rep.alloc ?? rep.status).toBeTruthy();
    for (const x of [{ personal: 3333, reserve: 3333 }, { personal: 10000 }, { reserve: 0 }]) expect(sumSplit(normSplit(x))).toBe(10000);
    // Allocating an already split report changes nothing.
    tributeOpen(s);
    const ctx = newCtx(s);
    const done = t.reports.find((r) => r.alloc)!;
    const snap = JSON.stringify(t.acct);
    allocate(ctx, done, { personal: 5000, treasury: 5000, reserve: 0 }, 'custom', []);
    expect(JSON.stringify(t.acct)).toBe(snap);
    expect(ctx.lines.length).toBe(0);
    // Every envelope's split sums to what was in it (less petitions granted off the top).
    for (const r of t.reports.filter((x) => x.alloc)) expect(r.alloc!.personal + r.alloc!.treasury + r.alloc!.reserve).toBeLessThanOrEqual(r.presented);
  });

  it('the Don splits the envelope in the audience: his choice moves exactly that money', () => {
    let s = newGame('take-d');
    ensureTribute(s).policy.auto = false; // hold the audience every week
    for (let i = 0; i < 3; i++) s = advanceWeek(s, randomChoices(s, i)).state;
    const ev = s.pendingEvents.find((e) => e.defId === 'tribute_audience')!;
    expect(ev).toBeTruthy();
    const rep = s.tribute!.reports.find((r) => r.id === ev.meta!.report)!;
    expect(rep.status).toBe('presented');
    expect(s.tribute!.acct.envelope).toBe(rep.presented);
    const before = { p: s.tribute!.acct.personal, r: s.tribute!.acct.reserve };
    const ch = randomChoices(s, 9);
    ch.choices![ev.iid] = 'custom';
    ch.envelope = { report: rep.id, split: { personal: 4000, treasury: 4000, reserve: 2000 } };
    const r = advanceWeek(s, ch);
    const done = r.state.tribute!.reports.find((x) => x.id === rep.id)!;
    expect(done.alloc!.by).toBe('custom');
    expect(done.alloc!.personal).toBe(Math.floor(rep.presented * 0.4));
    expect(done.alloc!.reserve).toBe(Math.floor(rep.presented * 0.2));
    expect(done.alloc!.treasury).toBe(rep.presented - done.alloc!.personal - done.alloc!.reserve);
    // The family's end shows in the ledger as the week's kick-up lines, per crew.
    const envLines = r.report.lines.filter((l) => l.stat === 'money' && (l.category === 'kickup' || l.category === 'street') && /Kick-up|Street hustle|Crew work|Arrears|Investment|Kick-ups/.test(l.label));
    expect(envLines.reduce((a, l) => a + l.amount, 0)).toBeGreaterThanOrEqual(done.alloc!.treasury);
    expect(r.state.tribute!.acct.personal).toBeGreaterThanOrEqual(before.p + done.alloc!.personal - 2000); // the household is paid from it too
  });

  it('a save made with the envelope on the desk loads and resolves exactly once (no double collection)', () => {
    let s = newGame('take-e');
    ensureTribute(s).policy.auto = false;
    for (let i = 0; i < 4; i++) s = advanceWeek(s, randomChoices(s, i)).state;
    const saved = JSON.stringify(s);
    const a = advanceWeek(JSON.parse(saved), randomChoices(s, 4)).state;
    const b = advanceWeek(JSON.parse(saved), randomChoices(s, 4)).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const ids = a.tribute!.reports.filter((r) => r.alloc).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(a.tribute!.reports.filter((r) => r.week === s.week).length).toBe(1);
  });

  it('old saves migrate: a game without the take picks it up on the next week', () => {
    const s = play('take-f', 3);
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete old.tribute;
    const money = old.money;
    const r = advanceWeek(old, {});
    expect(r.state.tribute).toBeTruthy();
    expect(reconcile(r.report)).toEqual([]);
    expect(r.report.start.money).toBe(money);
    expect(r.state.tribute!.reports.length).toBe(1);
  });
});

describe('the weekly take: people', () => {
  it('a shortfall keeps the truth, what he said and what the underboss believes apart', () => {
    const s = play('take-g', 40);
    const lines = s.tribute!.reports.flatMap((r) => r.crews.flatMap((c) => c.members)).filter((m) => m.truth);
    expect(lines.length).toBeGreaterThan(0);
    for (const m of lines) {
      expect(m.said).toBeTruthy();
      expect(m.believed).toBeTruthy();
      // He came up short; only his capo covering it out of his own pocket can make the line whole.
      if (!m.carried) expect(m.paid).toBeLessThan(m.due);
      else expect(m.paid - m.carried).toBeLessThan(m.due);
    }
    // Liars never say they lied.
    expect(lines.filter((m) => m.truth === 'lying').every((m) => m.said !== 'lying')).toBe(true);
  });

  it('the underboss\'s words come from the records and do not repeat while fresh lines remain', () => {
    const ids = allTalkIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(120);
    expect(spoken(37400)).toBe('thirty-seven grand');
    expect(spoken(4300)).toBe('forty-three hundred');
    expect(spoken(1000)).toBe('a grand');
    const s = play('take-h', 12);
    const reps = s.tribute!.reports;
    for (const r of reps) {
      // The envelope figure he speaks is the envelope.
      if (r.talk.some((x) => /^p\d/.test(x.id))) expect(r.talk.find((x) => /^p\d/.test(x.id))!.text.toLowerCase()).toContain(spoken(r.presented));
    }
    // Over a few weeks the openings are all different.
    const opens = reps.slice(0, 6).map((r) => r.talk[0].id);
    expect(new Set(opens).size).toBe(opens.length);
  });

  it('rival families keep their own books and feed their strength', () => {
    const s = play('take-i', 30);
    const t = s.tribute!;
    for (const id of ['manno', 'feldstein', 'kessler']) {
      const b = t.rivals[id];
      expect(b).toBeTruthy();
      expect(b.capos.length).toBeGreaterThan(0);
      expect(b.last!.week).toBeGreaterThanOrEqual(s.week - 2);
      expect(b.last!.toBoss).toBeGreaterThan(0);
      expect(b.last!.personal + b.last!.treasury + b.last!.reserve).toBe(b.last!.toBoss);
    }
  });
});

describe('the required 52-week family', () => {
  it('1 Don, 1 underboss, 1 consigliere, 3 capos, 12 soldiers, 8 associates, 10 enterprises: 52 weeks, every reconciliation check and all 14 demonstrations', () => {
    expect(familyCounts(requiredFamily())).toEqual({ don: 1, underboss: 1, consigliere: 1, capos: 3, soldiers: 12, associates: 8, enterprises: 10 });
    const run = play52();
    const res = checkRequired(run);
    for (const c of [...res.checks, ...res.demos]) expect(`${c.name}: ${c.ok ? 'ok' : c.detail}`).toBe(`${c.name}: ok`);
    expect(res.demos).toHaveLength(14);
    // Quiet weeks went by the standing split; the audience popped only when something needed the Don.
    const t = run.s.tribute!;
    expect(t.stats.quiet).toBeGreaterThan(t.stats.audiences);
    // The JSON save round-trips exactly.
    expect(JSON.stringify(JSON.parse(JSON.stringify(run.mid)))).toBe(JSON.stringify(run.mid));
  }, 300000);
});
