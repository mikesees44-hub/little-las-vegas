import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { upgradeSave } from '../src/engine/upgradeSave';
import { previewAction } from '../src/engine/actions';
import { actNow } from '../src/engine/deeds/now';
import { ensureDating } from '../src/engine/datingState';
import { ageOn } from '../src/engine/calendar';
import { applyHerOp, askerOf, earnerOf, herAcceptance, herActionsFor, herRows, herwayWeek, incomeOf, joinFamily } from '../src/engine/herway';
import { newCtx } from '../src/engine/ledger';
import { opinion } from '../src/engine/relations';
import { timeCost } from '../src/engine/timeCost';
import type { GameState, PlayerAction } from '../src/engine/types';

const find = (s: GameState, path: string) => Object.values(s.herway!.e).find((e) => e.path === path && e.status === 'active')!;
const act = (op: string, id: string) => ({ kind: 'herway', op: { op, id } }) as PlayerAction;

describe('her way: women earners', () => {
  it('a new game is seeded with women on every path, adults, with income; current saves load unchanged', () => {
    const s = newGame('her-seed');
    const H = s.herway!;
    expect(H).toBeDefined();
    const paths = new Set(Object.values(H.e).map((e) => e.path));
    for (const p of ['numbers', 'books', 'fronts', 'politics', 'info']) expect(paths.has(p as never), p).toBe(true);
    for (const e of Object.values(H.e)) {
      const c = s.characters[e.id];
      expect(c.gender).toBe('F');
      expect(ageOn(c.birth, s.date)).toBeGreaterThanOrEqual(18);
    }
    // A councilwoman is an existing pol office held by a woman.
    const inOffice = Object.values(H.e).filter((e) => e.path === 'politics' && e.rung === 3);
    expect(inOffice.length).toBeGreaterThan(0);
    expect(s.pol!.people[inOffice[0].polId!].seat).toBeTruthy();
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
    const played = advanceWeek(s, {}).state;
    const raw = JSON.stringify(played);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw)))).toBe(raw);
  });

  it('an older save without the layer gets it with its first week', () => {
    const s = newGame('her-old');
    delete s.herway;
    const after = upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(after.herway).toBeUndefined();
    const w = advanceWeek(after, {}).state;
    expect(Object.keys(w.herway!.e).length).toBeGreaterThan(5);
  });

  it('every order shows its odds before he chooses; a squeeze is barred while she owes', () => {
    const s = newGame('her-odds');
    const e = find(s, 'numbers');
    expect(herActionsFor(s, e.id).length).toBe(8);
    const p = previewAction(s, act('protect', e.id));
    expect(p.acceptance!.chance).toBeGreaterThan(0);
    expect(p.acceptance!.reasons.length).toBeGreaterThan(1);
    const sq = previewAction(s, act('squeeze', e.id));
    expect(sq.odds).toBeDefined();
    expect(sq.warning).toMatch(/enemy/);
    e.loan = { left: 500, weekly: 50, missed: 0 };
    expect(previewAction(s, act('squeeze', e.id)).disabledReason).toMatch(/owes/);
    // Never removed: not-applicable orders say why.
    expect(previewAction(s, act('hire', e.id)).disabledReason).toMatch(/books/);
    expect(previewAction(s, act('back', e.id)).disabledReason).toMatch(/politics/);
  });

  it('protection pays the Family a weekly cut through the books; settled in the moment and in Your File', () => {
    const s = newGame('her-protect');
    const e = find(s, 'fronts');
    const r = actNow(s, act('protect', e.id));
    expect(r.result.ok).toBe(true);
    expect(r.result.chance).toBeDefined();
    const s2 = r.state;
    const e2 = earnerOf(s2, e.id)!;
    expect(s2.journal?.e.some((x) => x.w === s2.week)).toBe(true);
    if (r.result.tier === 'success' || r.result.tier === 'crit') {
      expect(e2.deal).toBe('protect');
      const ctx = newCtx(s2);
      const m0 = s2.money;
      herwayWeek(ctx);
      if (!e2.pinched) expect(s2.money).toBeGreaterThan(m0);
    } else expect(e2.deal).toBe('none');
  });

  it('a hired bookkeeper knows more each week, and a squeeze makes an enemy', () => {
    const s = newGame('her-books');
    const e = find(s, 'books');
    joinFamily(s, e, 'hired');
    const ctx = newCtx(s);
    herwayWeek(ctx);
    expect(e.knows!).toBeGreaterThan(10);
    const n = find(s, 'numbers');
    const op0 = opinion(s, n.id, s.playerId);
    const p = previewAction(s, act('squeeze', n.id));
    for (const f of p.effects) if (f.type === 'herway') applyHerOp(ctx, f.op);
    expect(n.enemy).toBe(s.week);
    expect(previewAction(s, act('squeeze', n.id)).disabledReason).toMatch(/not long ago/);
    expect(opinion(s, n.id, s.playerId)).toBeLessThanOrEqual(op0);
  });

  it('backing a politician puts her in the pol layer and makes a friend in City Hall', () => {
    const s = newGame('her-pol');
    const e = Object.values(s.herway!.e).find((x) => x.path === 'politics' && x.rung < 3)!;
    applyHerOp(newCtx(s), { op: 'back', id: e.id, fund: 2500 });
    expect(e.polId).toBeTruthy();
    expect(s.pol!.people[e.polId!].charId).toBe(e.id);
    expect(s.pol!.ctl[e.polId!].personal).toBeGreaterThanOrEqual(25);
  });

  it('a loan she cannot pay is written off: nobody holds a debt over her', () => {
    const s = newGame('her-loan');
    const e = find(s, 'info');
    applyHerOp(newCtx(s), { op: 'lend', id: e.id, amount: 1000 });
    e.savings = 0;
    e.income = 0;
    e.pinched = s.week + 20;
    let t = s;
    for (let i = 0; i < 4; i++) { const ctx = newCtx(t); herwayWeek(ctx); t = ctx.s; }
    expect(earnerOf(t, e.id)!.loan).toBeUndefined();
  });

  it('women rise and fall over the years, some kick up to rivals', () => {
    let s = newGame('her-years');
    const rung0 = Object.fromEntries(Object.values(s.herway!.e).map((e) => [e.id, e.rung]));
    for (let i = 0; i < 80; i++) s = advanceWeek(s, {}).state;
    const H = s.herway!;
    const moved = Object.values(H.e).filter((e) => e.rung !== rung0[e.id] || e.status === 'out').length;
    expect(H.stats.rose + H.stats.fell + H.stats.pinched + moved).toBeGreaterThan(0);
    expect(Object.values(H.e).some((e) => e.side !== 'player' && e.side !== 'none')).toBe(true);
    for (const e of Object.values(H.e)) expect(incomeOf(e)).toBeLessThan(1000);
  }, 120000);

  it('the street path (the madams) is hidden with mature content Off', () => {
    const s = newGame('her-mature');
    expect(herRows(s).some((r) => r.path === 'street')).toBe(true);
    const madam = herRows(s).find((r) => r.path === 'street' && r.side !== 'player')!;
    expect(herActionsFor(s, madam.id).some((a) => a.kind === 'nightlife')).toBe(true);
    ensureDating(s).settings.mature = 'off';
    expect(herRows(s).some((r) => r.path === 'street')).toBe(false);
  });

  it('his own women choose their own path, shown as a card', () => {
    let s = newGame('her-own');
    const boss = s.characters[s.playerId];
    const d = Object.values(s.characters).find((c) => c.dynasty && c.gender === 'F' && c.alive && (c.fatherId === boss.id) && ageOn(c.birth, s.date) >= 21);
    if (!d) return;
    applyHerOp(newCtx(s), { op: 'beat', id: d.id, kind: 'politics', how: 'bless' });
    const e = earnerOf(s, d.id)!;
    expect(e.path).toBe('politics');
    expect(e.own).toBe('daughter');
    expect(s.pol!.kids[d.id]).toBeDefined();
    s = advanceWeek(s, {}).state;
    expect(earnerOf(s, d.id)!.status).toBe('active');
  });

  it('starts that reshape the family still begin with the women of the town', () => {
    for (const st of ['olddon', 'associate'] as const) {
      const s = newGameWith(`her-${st}`, st);
      expect(Object.keys(s.herway!.e).length).toBeGreaterThan(5);
    }
  });

  it('renders the women of the town', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { HerBook } = await import('../src/ui/town/HerBook');
    const s = newGame('her-ui');
    const html = renderToString(createElement(HerBook, { s }));
    expect(html).toContain('data-testid="her-book"');
    expect(html).toContain('data-testid="her-card"');
    expect(html).toContain('data-testid="action-row"');
  });

  it('the boss in person and a bigger offer each raise her odds; the breakdown says why; her rival loyalty caps it', () => {
    const s = newGame('her-offer');
    const e = Object.values(s.herway!.e).find((x) => x.path === 'fronts' && x.side === 'none' && x.status === 'active')!;
    for (const op of ['partner', 'protect', 'lend', 'ears'] as const) {
      const boss = herAcceptance(s, e.id, op, 'boss', 'fair').chance;
      const soldier = herAcceptance(s, e.id, op, 'soldier', 'fair').chance;
      expect(boss, op).toBeGreaterThan(soldier);
      const low = herAcceptance(s, e.id, op, 'boss', 'low').chance;
      const fair = herAcceptance(s, e.id, op, 'boss', 'fair').chance;
      const gen = herAcceptance(s, e.id, op, 'boss', 'generous').chance;
      const name = herAcceptance(s, e.id, op, 'boss', 'name').chance;
      expect(low, op).toBeLessThan(fair);
      expect(gen, op).toBeGreaterThanOrEqual(fair);
      expect(name, op).toBeGreaterThanOrEqual(gen);
      // Diminishing returns: the last step buys less than the one before it.
      expect(name - gen, op).toBeLessThanOrEqual(gen - fair + 1e-9);
    }
    const p = previewAction(s, { kind: 'herway', op: { op: 'protect', id: e.id, via: 'boss', offer: 'generous' } } as PlayerAction);
    const labels = p.acceptance!.reasons.map((x) => x.label).join(' | ');
    expect(labels).toMatch(/The boss himself/);
    expect(labels).toMatch(/Generous/);
    // Asking in person costs the boss his hours; sending a man costs a word.
    if (askerOf(s, 'capo')) expect(timeCost({ kind: 'herway', op: { op: 'protect', id: e.id, via: 'capo' } } as PlayerAction)).toBeLessThan(timeCost({ kind: 'herway', op: { op: 'protect', id: e.id, via: 'boss' } } as PlayerAction));
    // A woman who works for a rival family: no offer buys more than the cap, and it is never a sure thing.
    const dot = Object.values(s.herway!.e).find((x) => x.side === 'manno')!;
    const best = herAcceptance(s, dot.id, 'protect', 'boss', 'name');
    expect(best.chance).toBeLessThanOrEqual(0.6);
    expect(best.reasons.map((x) => x.label).join(' | ')).toMatch(/Works for/);
    expect(herAcceptance(s, e.id, 'protect', 'boss', 'name').chance).toBeLessThan(1);
  });

  it('the terms she takes are the terms she keeps', () => {
    const s = newGame('her-terms');
    const e = find(s, 'fronts');
    const p = previewAction(s, { kind: 'herway', op: { op: 'protect', id: e.id, offer: 'generous' } } as PlayerAction);
    for (const f of p.effects) if (f.type === 'herway') applyHerOp(newCtx(s), f.op);
    expect(e.deal).toBe('protect');
    expect(e.terms?.cut).toBe(0.15);
  });

  it('his allure counts in her odds: half weight in business, full weight otherwise; never a sure thing', async () => {
    const { allure } = await import('../src/engine/looks');
    const s = newGame('her-allure');
    const boss = s.characters[s.playerId];
    const e = find(s, 'fronts');
    const her = s.characters[e.id];
    boss.traits = [...boss.traits.filter((t) => t !== 'Charming' && t !== 'Womanizer')];
    const plain = herAcceptance(s, e.id, 'ears').reasons.reduce((a, x) => a + x.value, 0);
    const plainP = herAcceptance(s, e.id, 'partner').reasons.reduce((a, x) => a + x.value, 0);
    boss.traits = [...boss.traits.slice(0, 1), 'Charming', 'Womanizer'];
    const al = allure(s, boss, her).reasons.filter((x) => /Charming|ladies/.test(x.label)).reduce((a, x) => a + x.value, 0);
    const charmedR = herAcceptance(s, e.id, 'ears').reasons;
    expect(charmedR.map((x) => x.label).join(' | ')).toMatch(/Your allure: charming/);
    expect(charmedR.reduce((a, x) => a + x.value, 0) - plain).toBeGreaterThanOrEqual(al - 1);
    const pr = herAcceptance(s, e.id, 'partner').reasons;
    expect(pr.map((x) => x.label).join(' | ')).toMatch(/half: business first/);
    expect(pr.reduce((a, x) => a + x.value, 0) - plainP).toBeLessThan(al);
    expect(herAcceptance(s, e.id, 'ears', 'boss', 'name').chance).toBeLessThan(1);
  });
});
