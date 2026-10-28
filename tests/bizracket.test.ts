import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { upgradeSave } from '../src/engine/upgradeSave';
import { timeCost } from '../src/engine/timeCost';
import {
  buyoutPrice, commitWork, ensureWork, ownerOf, pitchView, placeById, placeTrade, pressView, protectorOf, reactionOdds, schemesFor, schemeView,
  workActions, workPlace, type WorkPlace,
} from '../src/engine/bizRacket';
import type { GameState } from '../src/engine/types';
import type { Lot } from '../src/engine/econState';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;
const base = newGame('bizracket');

function lotOf(s: GameState, use: string): Lot {
  const l = s.econ!.lots.find((x) => x.use === use && x.owner === 'private' && !!x.tenant);
  if (!l) throw new Error(`no ${use}`);
  return l;
}
function placeOf(s: GameState, use: string): WorkPlace {
  return workPlace(s, lotOf(s, use))!;
}
function soldier(s: GameState): string {
  return Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'soldier')!.id;
}

describe('work this place: the sheet', () => {
  it('a business has an owner, a trade, a cash estimate and who protects it; homes and the city are not businesses', () => {
    const p = placeOf(base, 'diner');
    expect(p.family).toBe('restaurant');
    const o = ownerOf(base, p);
    expect(o.name.length).toBeGreaterThan(3);
    expect(o.traits.length).toBeGreaterThan(0);
    expect(o.fear).toBeGreaterThanOrEqual(0);
    const t = placeTrade(base, p);
    expect(t.lo).toBeLessThan(t.hi);
    expect(t.exact).toBe(false);
    expect(['none', 'rival', 'police', 'player']).toContain(protectorOf(base, p).kind);
    // The same owner every time (pure, seeded).
    expect(ownerOf(base, p)).toEqual(o);
    const home = base.econ!.lots.find((l) => l.use === 'bungalow')!;
    expect(workPlace(base, home)).toBeUndefined();
  });

  it('the rackets differ by trade: a bar is not a laundromat is not a pier ride is not a motel', () => {
    const ids = (use: string) => schemesFor(placeOf(base, use)).map((d) => d.id);
    const bar = ids('hoodclub'), wash = ids('laundromat'), ride = ids('ride'), motel = ids('motel'), pizza = ids('pizza');
    for (const x of [bar, wash, ride, motel, pizza]) expect(x).toEqual(expect.arrayContaining(['skim', 'backdoor', 'vig', 'noshow', 'front']));
    expect(bar).toEqual(expect.arrayContaining(['machines', 'cardgame', 'license']));
    expect(motel).toEqual(expect.arrayContaining(['hourly', 'stash']));
    expect(ride).toEqual(expect.arrayContaining(['concessions', 'wheel']));
    expect(pizza).toContain('supply');
    expect(wash).not.toContain('cardgame');
    expect(ride).not.toContain('license');
    expect(bar).not.toContain('hourly');
    // What goes out the back door fits the trade.
    const who = soldier(base);
    expect(schemeView(base, placeOf(base, 'hoodclub'), 'backdoor', who).line).toMatch(/liquor/);
    expect(schemeView(base, placeOf(base, 'pizza'), 'backdoor', who).line).toMatch(/meat/);
    expect(schemeView(base, placeOf(base, 'motel'), 'backdoor', who).line).toMatch(/television/i);
  });

  it('every option says its cost, weekly take, hours, heat, odds and what he thinks', () => {
    const s = base;
    const p = placeOf(s, 'hoodclub');
    const who = soldier(s);
    for (const a of workActions(s, p)) {
      const pv = previewAction(s, a);
      expect(pv.title.length, JSON.stringify(a)).toBeGreaterThan(5);
      expect(timeCost(a, s)).toBeGreaterThan(0);
      if (a.kind === 'work' && a.op.op === 'scheme') {
        const v = schemeView(s, p, a.op.scheme, who);
        expect(v.take).toBeGreaterThanOrEqual(0);
        expect(v.thinks.length).toBeGreaterThan(5);
        expect(v.heat.length).toBeGreaterThan(3);
      }
    }
    // A skim needs an in.
    expect(schemeView(s, p, 'skim', who).lock).toMatch(/in first/);
  });

  it('a place of your own has no owner to ask: only the rackets you can run there yourself', () => {
    const s = clone(base);
    const b = s.businesses.find((x) => x.owner === 'player' && x.kind === 'club')!;
    const p = workPlace(s, undefined, b)!;
    expect(p.mine).toBe(true);
    const ids = schemesFor(p).map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(['machines', 'cardgame']));
    expect(ids).not.toContain('skim');
    expect(ids).not.toContain('vig');
    expect(schemeView(s, p, 'cardgame', soldier(s)).odds).toBe(1);
    expect(pitchView(s, p, soldier(s), 'fair').lock).toBe('It is yours');
  });
});

describe('work this place: the owner decides', () => {
  it('a frightened man pays; a proud one with a family behind him says no', () => {
    const s = clone(base);
    const p = placeOf(s, 'diner');
    const who = soldier(s);
    const calm = pitchView(s, p, who, 'fair').accept;
    ensureWork(s).places[p.id] = { fear: 60, hurt: 0, pride: 0, steps: 0, holds: [] };
    const scared = pitchView(s, p, who, 'fair').accept;
    expect(scared).toBeGreaterThan(calm);
    s.work!.places[p.id] = { fear: 0, hurt: 0, pride: 40, steps: 0, holds: [] };
    expect(pitchView(s, p, who, 'fair').accept).toBeLessThan(calm);
    // A bigger envelope is a harder yes.
    expect(pitchView(s, p, who, 'heavy').accept).toBeLessThan(pitchView(s, p, who, 'light').accept);
  });

  it('another family protecting him makes the yes harder and the move a move against them', () => {
    const s = clone(base);
    const p = placeOf(s, 'diner');
    const who = soldier(s);
    const d = s.districts.find((x) => x.id === p.district)!;
    d.influence = { ...d.influence, player: 0, manno: 0, kessler: 0, feldstein: 0 };
    const free = protectorOf(s, p).kind === 'rival' ? undefined : pitchView(s, p, who, 'fair');
    d.influence.manno = 90;
    // The hash decides between the family and nobody at the margin; try neighbors until one is theirs.
    const lots = s.econ!.lots.filter((l) => l.zone === p.lot!.zone && l.owner === 'private' && l.tenant && !l.home);
    const theirs = lots.map((l) => workPlace(s, l)).find((x) => x && protectorOf(s, x).kind === 'rival');
    expect(theirs).toBeDefined();
    const v = pitchView(s, theirs!, who, 'fair');
    expect(v.rivalNote).toMatch(/move against them/);
    expect(v.reasons.some((r) => /protects him/.test(r.label) && r.value < 0)).toBe(true);
    if (free) expect(free.rivalNote).toBeUndefined();
  });

  it('his traits change the odds of a racket: a gambler takes the loan, an honest man will not cook the books', () => {
    const s = clone(base);
    const who = soldier(s);
    const places = s.econ!.lots.filter((l) => l.owner === 'private' && l.tenant && !l.home).map((l) => workPlace(s, l)).filter((x): x is WorkPlace => !!x);
    const gambler = places.find((p) => ownerOf(s, p).traits.includes('Gambler'));
    const honest = places.find((p) => ownerOf(s, p).traits.includes('Honest'));
    expect(gambler && honest).toBeTruthy();
    expect(schemeView(s, gambler!, 'vig', who).reasons.some((r) => /Gambler/.test(r.label))).toBe(true);
    expect(schemeView(s, honest!, 'backdoor', who).reasons.some((r) => /Honest/.test(r.label) && r.value < 0)).toBe(true);
  });

  it('a yes puts an envelope on your books; a no opens the way to put him out of business', () => {
    let yes = 0, no = 0;
    for (let i = 0; i < 40 && (!yes || !no); i++) {
      const s = clone(base);
      const p = placeOf(s, 'diner');
      ensureWork(s).rng = 1000 + i * 7919;
      const before = s.businesses.length;
      commitWork(newCtx(s), { op: 'pitch', place: p.id, who: soldier(s), ask: 'fair' });
      const rec = s.work!.places[p.id];
      if (rec.stance === 'pays') {
        yes++;
        expect(s.businesses.length).toBe(before + 1);
        expect(s.businesses.at(-1)!.kind).toBe('protection');
        expect(rec.rate).toBeGreaterThan(0);
        expect(placeTrade(s, placeById(s, p.id)!).exact).toBe(false);
      } else {
        no++;
        expect(rec.stance).toBe('refused');
        expect(pressView(s, placeById(s, p.id)!, 'lean', soldier(s)).lock).toBeUndefined();
      }
    }
    expect(yes).toBeGreaterThan(0);
    expect(no).toBeGreaterThan(0);
  });
});

describe('work this place: putting him out of business', () => {
  function refused(seed: number, hurt = 0): { s: GameState; p: WorkPlace } {
    const s = clone(base);
    const p = placeOf(s, 'diner');
    const W = ensureWork(s);
    W.rng = seed;
    W.places[p.id] = { fear: 0, hurt, pride: 0, steps: 2, holds: [], stance: 'refused' };
    return { s, p };
  }

  it('nothing to escalate until he says no', () => {
    const s = clone(base);
    const p = placeOf(s, 'diner');
    expect(pressView(s, p, 'brick', soldier(s)).lock).toMatch(/has not said no/);
  });

  it('each step shows odds, heat, the paper and what he might do; damage makes him likelier to sell or fold', () => {
    const { s, p } = refused(1);
    const lean = reactionOdds(s, p, 'lean');
    const sum = Object.values(lean).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    const hurt = refused(1, 60);
    const later = reactionOdds(hurt.s, hurt.p, 'supplies');
    expect(later.sells).toBeGreaterThan(lean.sells);
    expect(later.folds).toBeGreaterThan(lean.folds);
    const v = pressView(s, p, 'fire', soldier(s));
    expect(v.paperNote).toMatch(/front page/);
    expect(v.innocents).toBeGreaterThan(0);
    expect(pressView(s, p, 'lean', soldier(s)).paperNote).toMatch(/Nothing/);
  });

  it('the chain ends every way: he pays, sells, folds, talks or fights', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300 && seen.size < 5; i++) {
      const { s, p } = refused(7 + i * 104729, 50);
      const heat = s.heat.local;
      commitWork(newCtx(s), { op: 'press', place: p.id, step: 'supplies', who: soldier(s) });
      const st = s.work!.places[p.id].stance!;
      seen.add(st);
      expect(s.heat.local).toBeGreaterThanOrEqual(heat);
      if (st === 'folded') {
        const l = s.econ!.lots.find((x) => x.id === p.id)!;
        expect(l.tenant).toBeUndefined();
        expect(l.status).toBe('sale');
        expect(s.paper!.wire.some((w) => /CLOSES ITS DOORS/.test(w.h ?? ''))).toBe(true);
      }
      if (st === 'informant') expect(s.characters[s.playerId].evidence ?? 0).toBeGreaterThan(base.characters[s.playerId].evidence ?? 0);
    }
    for (const x of ['pays', 'selling', 'folded', 'informant', 'fighting']) expect(seen, x).toContain(x);
  });

  it('a brick through the window makes the blotter; a fire makes the front page and leaves ashes you can buy', () => {
    let brick = false;
    for (let i = 0; i < 30 && !brick; i++) {
      const { s, p } = refused(3 + i * 31);
      commitWork(newCtx(s), { op: 'press', place: p.id, step: 'brick', who: soldier(s) });
      brick = s.paper!.wire.some((w) => /WINDOW SMASHED/.test(w.h ?? ''));
    }
    expect(brick).toBe(true);
    let burned: { s: GameState; p: WorkPlace } | undefined;
    for (let i = 0; i < 40 && !burned; i++) {
      const x = refused(11 + i * 7);
      const heat = x.s.heat.local;
      commitWork(newCtx(x.s), { op: 'press', place: x.p.id, step: 'fire', who: soldier(x.s) });
      if (x.s.econ!.lots.find((l) => l.id === x.p.id)!.use === undefined) { burned = x; expect(x.s.heat.local).toBeGreaterThan(heat + 5); }
    }
    expect(burned).toBeDefined();
    const { s, p } = burned!;
    const l = s.econ!.lots.find((x) => x.id === p.id)!;
    expect(l.past?.at(-1)?.why).toBe('burned');
    expect(s.paper!.wire.some((w) => /FIRE GUTS/.test(w.h ?? '') && w.s === 'front')).toBe(true);
    if (s.work!.places[p.id].stance === 'selling') {
      const price = buyoutPrice(s, p);
      s.money = Math.max(s.money, price + 100);
      expect(pressView(s, p, 'buyout', soldier(s)).lock).toBeUndefined();
      commitWork(newCtx(s), { op: 'press', place: p.id, step: 'buyout', who: s.playerId });
      expect(l.owner).toBe('player');
      expect(s.work!.places[p.id].stance).toBe('sold');
    }
  });

  it('a man who wants out sells you the going concern cheap', () => {
    const { s, p } = refused(5, 60);
    s.work!.places[p.id].stance = 'selling';
    const price = buyoutPrice(s, p);
    expect(price).toBeLessThan(Math.max(1000, p.lot!.price * 2));
    s.money = price + 1000;
    const money = s.money;
    commitWork(newCtx(s), { op: 'press', place: p.id, step: 'buyout', who: s.playerId });
    const l = s.econ!.lots.find((x) => x.id === p.id)!;
    expect(l.owner).toBe('player');
    expect(l.status).toBe('owned');
    expect(s.money).toBe(money - price);
  });

  it('a family\'s own place: the move is against them, and they may hit back', () => {
    const s = clone(base);
    const l = s.econ!.lots.find((x) => x.status === 'rival' && x.use && s.rivals.some((r) => r.id === x.owner && r.kind === 'mob'))!;
    const p = workPlace(s, l)!;
    expect(p.rival).toBeDefined();
    expect(pitchView(s, p, soldier(s), 'fair').accept).toBeLessThan(0.05);
    expect(pressView(s, p, 'brick', soldier(s)).lock).toBeUndefined();
    expect(pressView(s, p, 'buyout', soldier(s)).lock).toMatch(/will not sell/);
    const op = s.rivals.find((r) => r.id === p.rival)!;
    const before = JSON.stringify(op);
    ensureWork(s).rng = 99;
    commitWork(newCtx(s), { op: 'press', place: p.id, step: 'brick', who: soldier(s) });
    expect(s.scheduled.some((x) => x.key === 'retaliation') || JSON.stringify(s.rivals.find((r) => r.id === p.rival)) !== before).toBe(true);
  });
});

describe('work this place: the week and the save', () => {
  it('a racket started here pays through the books like any other, deterministically', () => {
    const run = () => {
      const s = clone(base);
      const p = placeOf(s, 'hoodclub');
      ensureWork(s).places[p.id] = { fear: 0, hurt: 0, pride: 0, steps: 0, holds: [], stance: 'pays', rate: 40 };
      const a = { kind: 'work' as const, op: { op: 'scheme' as const, place: p.id, scheme: 'machines' as const, who: soldier(s) } };
      let x = advanceWeek(s, { actions: [a] }).state;
      x = advanceWeek(x, {}).state;
      return x;
    };
    const a = run(), b = run();
    expect(JSON.stringify(a.work)).toBe(JSON.stringify(b.work));
    expect(a.money).toBe(b.money);
  });

  it('old saves are untouched; a save with the layer round-trips', () => {
    const fresh = clone(base);
    expect(upgradeSave(clone(fresh)).work).toBeUndefined();
    const s = clone(base);
    const p = placeOf(s, 'diner');
    ensureWork(s).rng = 1;
    commitWork(newCtx(s), { op: 'pitch', place: p.id, who: soldier(s), ask: 'light' });
    const back = upgradeSave(clone(s));
    expect(back.work).toEqual(s.work);
    expect(placeById(back, p.id)?.name).toBe(p.name);
  });

  it('a loan he cannot pay becomes a piece of the place', () => {
    const s = clone(base);
    const p = placeOf(s, 'diner');
    ensureWork(s).places[p.id] = { fear: 80, hurt: 0, pride: 0, steps: 0, holds: [], stance: 'pays', rate: 30 };
    s.money = 20000;
    for (let i = 0; i < 20 && !s.work!.places[p.id].holds.some((h) => h.id === 'vig'); i++) {
      s.work!.rng = 500 + i;
      commitWork(newCtx(s), { op: 'scheme', place: p.id, scheme: 'vig', who: soldier(s) });
    }
    const h = s.work!.places[p.id].holds.find((x) => x.id === 'vig')!;
    expect(h).toBeDefined();
    const loan = s.loans.find((l) => l.id === h.loanId)!;
    expect(loan.collateralName).toBe(p.name);
    loan.weeksLate = 4;
    const ctx = newCtx(s);
    // The week's own pass over the places.
    return import('../src/engine/bizRacket').then(({ workWeek }) => {
      workWeek(ctx);
      expect(s.work!.places[p.id].holds.some((x) => x.id === 'piece')).toBe(true);
      expect(s.loans.some((l) => l.id === loan.id)).toBe(false);
    });
  });
});

describe('work this place: the sheet on screen', () => {
  it('Start a racket here on a business opens the sheet for that business, by trade', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { WorkPlaceSheet } = await import('../src/ui/econ/WorkPlace');
    const s = clone(base);
    const bar = placeOf(s, 'hoodclub');
    const html = renderToString(createElement(WorkPlaceSheet, { s, place: bar.id, onClose: () => {} }));
    expect(html).toContain('data-testid="work-place"');
    expect(html).toContain('data-testid="work-owner"');
    expect(html).toContain('data-testid="work-protector"');
    expect(html).toContain('data-testid="work-cash"');
    for (const t of ['protect', 'skim', 'backdoor', 'exploit', 'extra', 'press']) expect(html, t).toContain(`data-testid="work-tab-${t}"`);
    expect(html).toContain('Offer protection');
    // He has not said no: the escalation opens only after.
    ensureWork(s).places[bar.id] = { fear: 0, hurt: 0, pride: 0, steps: 0, holds: [], stance: 'refused' };
    const pressed = renderToString(createElement(WorkPlaceSheet, { s, place: bar.id, onClose: () => {} }));
    for (const st of ['lean', 'loiter', 'stink', 'supplies', 'inspector', 'brick', 'fire', 'buyout']) expect(pressed, st).toContain(`data-testid="work-step-${st}"`);
    expect(pressed).toContain('Let it go');
  });

  it('the street and walk cards hand the business to the button', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['src/ui/hood/WalkCard.tsx', 'src/ui/hood/StreetCard.tsx']) expect(readFileSync(f, 'utf8')).toMatch(/StartHereButton[^\n]*lot=\{/);
  });
});
