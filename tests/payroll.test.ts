import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { makeCharacter } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { applyEffects } from '../src/engine/effects';
import { setDatingSettings } from '../src/engine/datingState';
import { ensureNightlife } from '../src/engine/nightlife';
import { upgradeSave } from '../src/engine/upgradeSave';
import { previewAction } from '../src/engine/actions';
import { ensureThreats } from '../src/engine/threats';
import { buildAsk } from '../src/engine/deeds/asks';
import {
  applyPayOp, askers, favorJobChoice, hire, hireAction, hushItem, hushTarget, jobsFor, nightPeople, offerAcceptance, payrollRoster, payrollWeek, socialCircle, withFavorJobs, workingWomen,
} from '../src/engine/payroll';
import { addOpinion } from '../src/engine/relations';
import { timeCost } from '../src/engine/timeCost';
import type { Character, GameState } from '../src/engine/types';

const weeks = (s: GameState, n: number) => { for (let i = 0; i < n && !s.gameOver; i++) s = advanceWeek(s, {}).state; return s; };

/** A civilian man of the island (an adult, outside the Family). */
function civilian(s: GameState, f = false): Character {
  return makeCharacter(s, { gender: f ? 'F' : 'M', age: 34, rank: 'civilian', faction: 'none', nickname: false });
}

/** A woman married to a man of a rival family. */
function rivalWife(s: GameState): { her: Character; him: Character } {
  const rv = s.rivals.find((r) => r.kind === 'mob')!;
  const him = makeCharacter(s, { gender: 'M', age: 40, rank: 'soldier', faction: rv.id, nickname: false });
  const her = makeCharacter(s, { gender: 'F', age: 36, rank: 'civilian', faction: 'none', nickname: false });
  her.spouseId = him.id;
  him.spouseId = her.id;
  return { her, him };
}

describe('the civilian payroll', () => {
  it('a fresh game has no payroll, and loading it changes nothing', () => {
    const s = newGame('payroll-fresh');
    expect(s.payroll).toBeUndefined();
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
  });

  it('the books reconcile over 10 weeks with a payroll: wages out, the ends in', () => {
    let s = newGame('payroll-books');
    const a = civilian(s);
    const b = civilian(s);
    const q = rivalWife(s);
    expect(hire(s, a.id, 'bookie')).toBeDefined();
    expect(hire(s, b.id, 'cop')).toBeDefined();
    expect(hire(s, q.her.id, 'hush')).toBeDefined();
    s.payroll!.main = a.id;
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = advanceWeek(s, {}); // throws if the ledger or the accounts do not reconcile
      s = r.state;
      lines.push(...r.report.lines.filter((l) => l.stat === 'money').map((l) => l.label));
    }
    expect(lines.some((l) => l.startsWith('Payroll: '))).toBe(true);
    expect(lines.some((l) => / end \(bookie\)/.test(l))).toBe(true);
    const rows = payrollRoster(s);
    expect(rows.some((r) => r.source === 'payroll' && r.job === 'bookie' && r.main)).toBe(true);
  });

  it('a hire is offered with its odds and settled through the order', () => {
    const s = newGame('payroll-offer');
    const c = civilian(s);
    const jobs = jobsFor(s, c);
    expect(jobs.length).toBeGreaterThan(3);
    const a = hireAction(s, c.id, jobs[0]);
    const p = previewAction(s, a);
    expect(p.acceptance?.chance).toBeGreaterThan(0);
    expect(p.disabledReason).toBeUndefined();
    const ctx = newCtx(s);
    applyEffects(ctx, p.effects, { label: p.title, because: p.because, category: 'cost' });
    expect(s.payroll?.hires[c.id]?.job).toBe(jobs[0]);
    // The Family and minors are never offered a job.
    const capo = Object.values(s.characters).find((x) => x.alive && x.faction === 'player' && x.rank === 'capo')!;
    expect(jobsFor(s, capo)).toEqual([]);
    const kid = makeCharacter(s, { gender: 'M', age: 15, rank: 'civilian', faction: 'none' });
    expect(jobsFor(s, kid)).toEqual([]);
  });

  it('the unpaid and the badly treated quit', () => {
    let s = newGame('payroll-quit');
    const c = civilian(s);
    hire(s, c.id, 'runner');
    s.payroll!.hires[c.id].loyalty = 3;
    s.payroll!.hires[c.id].unpaid = 4;
    for (let i = 0; i < 25 && s.payroll!.hires[c.id]; i++) s = weeks(s, 1);
    expect(s.payroll!.hires[c.id]).toBeUndefined();
    expect(s.payroll!.gone.some((g) => g.id === c.id)).toBe(true);
    expect(s.payroll!.stats.quit).toBeGreaterThan(0);
  });

  it('Mature content Off hides the sex-work jobs everywhere', () => {
    let s = newGame('payroll-mature');
    const N = ensureNightlife(s);
    const her = Object.values(N.people).find((p) => p.role === 'callgirl' && p.status === 'active' && !p.bounds.includes('no_payroll'))!;
    expect(jobsFor(s, s.characters[her.id])).toContain('girl');
    hire(s, her.id, 'girl');
    expect(N.people[her.id].payroll).toBeDefined();
    expect(payrollRoster(s).some((r) => r.charId === her.id && r.source === 'night')).toBe(true);
    s = setDatingSettings(s, { mature: 'off' });
    expect(jobsFor(s, s.characters[her.id])).not.toContain('girl');
    expect(jobsFor(s, s.characters[her.id])).not.toContain('madam');
    expect(payrollRoster(s).some((r) => r.job === 'girl' || r.job === 'madam')).toBe(false);
    const other = Object.values(s.nightlife!.people).find((p) => p.role === 'escort' && !p.payroll)!;
    expect(hire(s, other.id, 'girl')).toBeUndefined();
    expect(s.nightlife!.people[other.id].payroll).toBeUndefined();
  });

  it('the social circle counts its rings and gives a depth', () => {
    const s = newGame('payroll-circle');
    const c = civilian(s);
    hire(s, c.id, 'barber');
    const sc = socialCircle(s);
    expect(sc.rings.map((r) => r.id)).toEqual(['blood', 'made', 'associates', 'payroll', 'friends', 'acquaintances']);
    expect(sc.rings.find((r) => r.id === 'payroll')!.ids).toContain(c.id);
    expect(sc.depth).toBeGreaterThan(0);
  });
});

describe('the quiet envelope', () => {
  it('a delivered item reveals real hidden state: the rival\'s real plan becomes a warning', () => {
    const s = newGame('payroll-hush');
    const { her, him } = rivalWife(s);
    expect(hushTarget(s, her)?.on.id).toBe(him.id);
    const h = hire(s, her.id, 'hush')!;
    Object.assign(h.hush!, { access: 100, close: 100, nerve: 100 });
    const T = ensureThreats(s);
    const th = { id: 'thTest', kind: 'move' as const, by: him.faction as string, district: s.districts[0].id, start: s.week, due: s.week + 2, blunt: 0 };
    T.threats.push(th as never);
    let plan;
    for (let i = 0; i < 40 && !plan; i++) {
      const it = hushItem(s, h, `k${i}`);
      if (it?.kind === 'plan') plan = it;
      else if (it?.kind === 'books') expect(it.text).toContain('family has about');
    }
    expect(plan).toBeDefined();
    expect(plan!.truth).toBe('solid');
    expect(plan!.conf).toBe('confirmed');
    const tip = T.tips.find((t) => t.id === plan!.tip)!;
    expect(tip.threatId).toBe('thTest');
    expect(tip.sourceRole).toBe('A wife on the quiet payroll');
  });

  it('a hidden secret of her husband becomes one the house knows', () => {
    const s = newGame('payroll-hush-secret');
    const { her, him } = rivalWife(s);
    const h = hire(s, her.id, 'hush')!;
    Object.assign(h.hush!, { access: 100, close: 100, nerve: 100 });
    s.secrets.push({ id: 'xs1', ownerId: him.id, kind: 'debt', text: `${him.firstName} owes a shylock`, knownBy: [], week: s.week });
    let got;
    for (let i = 0; i < 40 && !got; i++) { const it = hushItem(s, h, `s${i}`); if (it?.kind === 'secret') got = it; }
    expect(got?.secret).toBe('xs1');
    expect(s.secrets.find((x) => x.id === 'xs1')!.knownBy).toContain('player');
  });

  it('refusals are rolled: some wives tell, some keep it to themselves', () => {
    const outcomes = new Set<boolean>();
    for (let w = 0; w < 30; w++) {
      const s = newGame('payroll-refuse');
      s.week += w;
      const { her, him } = rivalWife(s);
      const ctx = newCtx(s);
      applyPayOp(ctx, { op: 'refused', id: her.id, job: 'hush' });
      outcomes.add((s.relations[`${him.id}>${s.playerId}`]?.modifiers ?? []).some((m) => /Tried to buy/.test(m.reason)));
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('discovery is rolled, grows with suspicion, and brings the decision to protect her', () => {
    const s = newGame('payroll-found');
    const { her } = rivalWife(s);
    const h = hire(s, her.id, 'hush')!;
    h.hush!.heat = 100;
    for (let i = 0; i < 40 && h.hush!.found === undefined; i++) { s.week++; payrollWeek(newCtx(s)); }
    expect(h.hush!.found).toBeDefined();
    const ev = s.eventQueue.find((e) => e.defId === 'payroll_found')!;
    expect(ev.choices.map((c) => c.id)).toEqual(['move', 'relocate', 'deny']);
    expect(ev.choices[2].label).toMatch(/\d+% he believes you/);
    applyEffects(newCtx(s), ev.choices[0].effects, { label: 'x', because: 'x', category: 'event' });
    expect(s.payroll!.hires[her.id]).toBeUndefined();
  });
});

describe('"I\'ll do it, and in return you work for me"', () => {
  it('a favor ask from a civilian carries the option, and taking it puts them on the payroll', () => {
    const s = newGame('payroll-favor');
    const c = civilian(s);
    const ev = buildAsk(s, { id: 'ak1', d: 'askFavor', a: c.id, w: s.week, p: 50, n: 400 })!;
    const [dec] = withFavorJobs(s, [ev]);
    const ch = dec.choices.find((x) => x.id === 'payjob')!;
    expect(ch).toBeDefined();
    expect(ch.detail).toMatch(/\d+% he says yes/);
    expect(dec.choices.length).toBe(ev.choices.length + 1);
    const fx = ch.effects.map((e) => (e.type === 'payroll' && e.op.op === 'favor' ? { ...e, op: { ...e.op, chance: 1 } } : e));
    applyEffects(newCtx(s), fx, { label: 'x', because: 'x', category: 'event' });
    expect(s.payroll?.hires[c.id]?.fav).toBe(1);
  });

  it('a refused job still grants the favor, and leaves a marker', () => {
    const s = newGame('payroll-favor-no');
    const c = civilian(s);
    const ev = buildAsk(s, { id: 'ak2', d: 'askFavor', a: c.id, w: s.week, p: 50, n: 400 })!;
    const ch = favorJobChoice(s, ev)!;
    const fx = ch.effects.map((e) => (e.type === 'payroll' && e.op.op === 'favor' ? { ...e, op: { ...e.op, chance: 0 } } : e));
    const money0 = s.money;
    applyEffects(newCtx(s), fx, { label: 'x', because: 'x', category: 'event' });
    expect(s.payroll?.hires[c.id]).toBeUndefined();
    expect(s.money).toBe(money0 - 400);
    expect(s.deeds!.owed.some((o) => o.by === c.id && o.to === s.playerId)).toBe(true);
  });

  it('no option for the Family', () => {
    const s = newGame('payroll-favor-fam');
    const capo = Object.values(s.characters).find((x) => x.alive && x.faction === 'player' && x.rank === 'capo')!;
    const ev = buildAsk(s, { id: 'ak3', d: 'askFavor', a: capo.id, w: s.week, p: 50, n: 400 })!;
    expect(favorJobChoice(s, ev)).toBeUndefined();
  });
});

describe('who asks, and how much', () => {
  it('the boss in person beats a man of lower rank, and a generous offer beats a low one', () => {
    const s = newGame('payroll-odds');
    const c = civilian(s);
    s.respect = 50;
    const men = askers(s);
    const assoc = men.find((m) => m.rank === 'associate') ?? men[men.length - 1];
    const boss = offerAcceptance(s, c, 'bartender', {});
    const low = offerAcceptance(s, c, 'bartender', { via: assoc.id });
    expect(boss.chance).toBeGreaterThan(low.chance);
    expect(boss.reasons.some((r) => r.label.startsWith('Asked by the boss himself'))).toBe(true);
    const cheap = offerAcceptance(s, c, 'bartender', { pay: 'low', via: assoc.id });
    const rich = offerAcceptance(s, c, 'bartender', { pay: 'generous', via: assoc.id });
    const top = offerAcceptance(s, c, 'bartender', { pay: 'top', via: assoc.id });
    expect(rich.chance).toBeGreaterThan(cheap.chance);
    expect(top.chance).toBeGreaterThanOrEqual(rich.chance);
    // The wage follows the amount; a man sent costs the boss a quarter of an hour, in person the hour.
    const pv = previewAction(s, { kind: 'payroll', op: { op: 'hire', id: c.id, job: 'bartender', pay: 'generous' } });
    expect(pv.cost).toBeGreaterThan(previewAction(s, { kind: 'payroll', op: { op: 'hire', id: c.id, job: 'bartender' } }).cost);
    expect(timeCost({ kind: 'payroll', op: { op: 'hire', id: c.id, job: 'bartender', via: assoc.id } }, s)).toBeLessThan(timeCost({ kind: 'payroll', op: { op: 'hire', id: c.id, job: 'bartender' } }, s));
  });

  it('heavy loyalty to a rival caps what money and rank can do', () => {
    const s = newGame('payroll-cap');
    const rv = s.rivals.find((r) => r.kind === 'mob')!;
    const m = makeCharacter(s, { gender: 'M', age: 33, rank: 'soldier', faction: rv.id, nickname: false });
    addOpinion(s, m.id, rv.leaderId, 'Made me', 60, 0);
    s.respect = 100;
    const acc = offerAcceptance(s, m, 'bartender', { pay: 'top' });
    expect(acc.chance).toBeLessThanOrEqual(0.2);
    expect(acc.reasons.some((r) => /no amount buys more/.test(r.label))).toBe(true);
  });
});

describe('the night people', () => {
  it('girls, dancers, celebrities and madams in one finder; Mature Off leaves only the celebrities', () => {
    let s = newGame('payroll-night');
    ensureNightlife(s);
    const all = nightPeople(s);
    for (const k of ['girl', 'dancer', 'celebrity', 'madam']) expect(all.some((r) => r.kind === k), k).toBe(true);
    for (const r of all) if (r.charId) expect(s.date.y - s.characters[r.charId].birth.y).toBeGreaterThanOrEqual(18);
    const ww = workingWomen(s);
    expect(ww.length).toBeGreaterThan(3);
    expect(ww.every((w) => typeof w.onPayroll === 'boolean' && !!w.employer)).toBe(true);
    // Offer a girl a job through the payroll: the night's own payroll records it.
    const g = all.find((r) => r.kind === 'girl' && !r.onPayroll && r.action && !r.note)!;
    const pv = previewAction(s, g.action!);
    expect(pv.acceptance!.chance).toBeGreaterThan(0);
    applyEffects(newCtx(s), pv.effects, { label: 'x', because: 'x', category: 'cost' });
    expect(s.nightlife!.people[g.charId!].payroll).toBeDefined();
    // A star without a body gets one on the retainer.
    const star = all.find((r) => r.kind === 'celebrity' && r.action?.kind === 'payroll' && r.action.op.op === 'star');
    if (star) {
      const sp = previewAction(s, star.action!);
      applyEffects(newCtx(s), sp.effects, { label: 'x', because: 'x', category: 'cost' });
      expect(Object.values(s.payroll!.hires).some((h) => h.job === 'celebrity' && h.ref === (star.action as { op: { ref: string } }).op.ref)).toBe(true);
    }
    s = setDatingSettings(s, { mature: 'off' });
    const off = nightPeople(s);
    expect(off.every((r) => r.kind === 'celebrity')).toBe(true);
    expect(workingWomen(s)).toEqual([]);
  });
});
