import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { crew } from '../src/engine/characters';
import { holder } from '../src/engine/council';
import { opinion } from '../src/engine/relations';
import { upgradeSave } from '../src/engine/upgradeSave';
import { ltCandidates } from '../src/engine/lieutenants';
import { inbox } from '../src/engine/inbox';
import { timeCost } from '../src/engine/timeCost';
import {
  canHoldSpot, incomeSources, kickupChain, kickupMonth, rivalSpotsUp, setupAction, spotLtCands, spotOf, spotOffers, SPOTS, FREELANCE_AFTER,
} from '../src/engine/kickup';
import { askAction, assessAsk, myPlaces, openAsks, quickRackets, suggestAll, tenantAction, tenantsOf, troubled, type PlaceAsk } from '../src/engine/placeAsks';
import { memoriesOf, spotLock } from '../src/engine/kickup';
import { newCtx } from '../src/engine/ledger';
import { OrdersContext } from '../src/ui/components/Orders';
import { SetUpsPanel } from '../src/ui/econ/SetUps';
import type { GameState, PlayerAction } from '../src/engine/types';

const week = (s: GameState, actions: PlayerAction[] = []) => advanceWeek(s, { choices: {}, actions }).state;
const run = (s: GameState, n: number) => { for (let i = 0; i < n && !s.gameOver; i++) s = week(s); return s; };
const bare = (s: GameState) => crew(s).filter((c) => canHoldSpot(s, c) && !spotOf(s, c.id) && (c.rank === 'soldier' || c.rank === 'associate')).sort((a, b) => (a.id < b.id ? -1 : 1));

function rich(seed: string): GameState {
  const s = newGame(seed);
  s.money = 60000;
  return s;
}

describe('set someone up: the boss, the underboss and the consigliere', () => {
  it('each can set a man up; the man is loyal to his sponsor and the sponsor gets his piece', () => {
    let s = rich('kick-sponsors');
    const ub = holder(s, 'underboss')!;
    const cons = holder(s, 'consigliere')!;
    expect(ub && cons).toBeTruthy();
    const [a, b, c] = bare(s);
    const before = { a: opinion(s, a.id, s.playerId), b: opinion(s, b.id, ub.id), c: opinion(s, c.id, cons.id) };
    const acts = [setupAction(a.id, 'numbers'), setupAction(b.id, 'cards', ub.id), setupAction(c.id, 'machines', cons.id)];
    for (const x of acts) {
      const p = previewAction(s, x);
      expect(p.disabledReason, p.title).toBeUndefined();
      expect(p.detail).toMatch(/keeps \d+%, kicks up \d+%/);
      expect(p.detail).toMatch(/Risk:/);
      expect(p.cost).toBeGreaterThan(0);
      expect(timeCost(x, s)).toBe(1);
    }
    s = week(s, acts);
    expect(spotOf(s, a.id)?.by).toBe(s.playerId);
    expect(spotOf(s, b.id)?.by).toBe(ub.id);
    expect(spotOf(s, c.id)?.by).toBe(cons.id);
    expect(opinion(s, a.id, s.playerId)).toBeGreaterThan(before.a);
    expect(opinion(s, b.id, ub.id)).toBeGreaterThan(before.b);
    expect(opinion(s, c.id, cons.id)).toBeGreaterThan(before.c);
    // A man owes his sponsor: the favor is on the books.
    expect(s.tribute!.favors.some((f) => f.byId === ub.id && f.toId === b.id)).toBe(true);
    const ubWealth = s.characters[ub.id].wealth;
    s = week(s);
    const book = s.tribute!.books[s.tribute!.books.length - 1];
    const pieces = book.x.filter((x) => x[0] === `ext:spot:${a.id}` && x[1] === 'personal');
    expect(pieces.length, 'the boss\'s piece goes to his Pocket').toBe(1);
    expect(book.x.some((x) => x[0] === `ext:spot:${b.id}` && x[1] === `wealth:${ub.id}`), 'the underboss\'s piece').toBe(true);
    expect(s.characters[ub.id].wealth).toBeGreaterThan(0);
    void ubWealth;
  });

  it('nobody else can sponsor, nobody sponsors himself, and a stake must be affordable', () => {
    const s = rich('kick-rules');
    const [a, b] = bare(s);
    expect(previewAction(s, setupAction(a.id, 'numbers', b.id)).disabledReason).toMatch(/underboss|consigliere/);
    const ub = holder(s, 'underboss')!;
    expect(previewAction(s, setupAction(ub.id, 'numbers', ub.id)).disabledReason).toMatch(/himself/);
    s.money = 100;
    expect(previewAction(s, setupAction(a.id, 'numbers')).disabledReason).toMatch(/Needs/);
  });

  it('the offers say what he would earn, his share, the risk; the sheet menu and the lieutenants offer set-ups', () => {
    const s = rich('kick-offers');
    const [a] = bare(s);
    const o = spotOffers(s, a, s.playerId);
    expect(o.length).toBe(Object.keys(SPOTS).length);
    for (const x of o) expect(x.keep + x.up + x.piece).toBe(100);
    const c = spotLtCands(s);
    expect(c.some((x) => x.seat === 'underboss' && x.id.startsWith('setup:'))).toBe(true);
    expect(ltCandidates(s).some((x) => x.id.startsWith('setup:'))).toBe(true);
  });
});

describe('every man earns on his own', () => {
  it('after a few months every made man and associate has an income source', () => {
    let s = newGame('kick-every');
    const start = new Set(crew(s).map((c) => c.id));
    s = run(s, FREELANCE_AFTER + 16); // (time enough for a man who was away or busy through a month's turn)
    const men = crew(s).filter((c) => start.has(c.id) && canHoldSpot(s, c));
    expect(men.length).toBeGreaterThan(5);
    // (A man who lost his spot recently is still inside his grace period: he finds his own hustle later.)
    const less = s.econ?.spotless ?? {};
    for (const c of men) {
      if (less[c.id] !== undefined && s.week - less[c.id] < FREELANCE_AFTER + 5) continue;
      expect(incomeSources(s, c).length, `${c.firstName} (${c.rank})`).toBeGreaterThan(0);
    }
    // ...including the underboss and the consigliere.
    for (const seat of ['underboss', 'consigliere'] as const) { const h = holder(s, seat); if (h) expect(incomeSources(s, h).length, seat).toBeGreaterThan(0); }
  });

  it('the kick-up chain reconciles with the journal: no money created or lost', () => {
    let s = rich('kick-chain');
    const men = bare(s).slice(0, 4);
    s = week(s, men.map((m, i) => setupAction(m.id, (['numbers', 'cards', 'stop', 'machines'] as const)[i])));
    s = week(s);
    const ch = kickupChain(s)!;
    const rep = s.tribute!.reports[s.tribute!.reports.length - 1];
    const book = s.tribute!.books.find((b) => b.week === rep.week)!;
    const all = [...book.x.map((x) => [x[0], x[1], x[2]] as const), ...(book.hx ?? []).map((x) => [x[0], x[1], x[2]] as const)];
    let spotRows = 0;
    for (const m of men) {
      const sp = s.econ!.spots![m.id];
      if (!sp || !sp.g) continue;
      spotRows++;
      const out = all.filter((x) => x[0] === `ext:spot:${m.id}`).reduce((a, x) => a + x[2], 0);
      const pocketed = all.filter((x) => x[0] === `ext:spot:${m.id}` && x[1] === `wealth:${m.id}`).reduce((a, x) => a + x[2], 0);
      const up = all.filter((x) => x[0] === `ext:spot:${m.id}` && (x[1].startsWith('crew:') || x[1] === 'clearing')).reduce((a, x) => a + x[2], 0);
      // Every dollar the spot paid went to him, his sponsor, or up the chain; what came up short was never paid out.
      expect(out).toBe(pocketed + (sp.p ?? 0) + up);
      expect(up).toBe(sp.u);
      expect(out).toBeLessThanOrEqual(sp.g);
      expect(sp.g - out).toBeLessThanOrEqual(sp.s ?? 0);
    }
    expect(spotRows).toBeGreaterThan(1);
    // The chain's rows add up to its crews, and its crews to the count, and the count to the envelope.
    for (const cl of ch.crews) {
      const lines = rep.crews.find((x) => x.capoId === cl.capoId)!.members;
      expect(cl.men.reduce((a, r) => a + r.up, 0)).toBe(lines.reduce((a, l) => a + l.paid + (l.back ?? 0), 0));
      expect(lines.reduce((a, l) => a + l.paid, 0)).toBe(cl.paidIn);
    }
    expect(ch.collected).toBe(rep.collected);
    expect(rep.ubShare + rep.ubSkim + rep.presented + ch.late).toBe(rep.collected);
  });
});

describe('dynamics: short envelopes, low earners, big earners', () => {
  it('a man short again and again is noticed through the envelope and the underboss (talk, fine, take his spot)', () => {
    let s = rich('kick-short');
    const [a] = bare(s);
    s = week(s, [setupAction(a.id, 'cards')]);
    s = run(s, 1);
    const t = cloneState(s);
    // Two short envelopes lately, and the month turns.
    t.tribute!.shortHist[a.id] = [t.week - 2, t.week - 1];
    t.date = { ...t.date, d: 1 };
    const ctx = newCtx(t);
    t.tribute!.reports[t.tribute!.reports.length - 1].week = t.week;
    kickupMonth(ctx);
    const rep = t.tribute!.reports[t.tribute!.reports.length - 1];
    expect(rep.issues.some((i) => i.who === a.id && /short/.test(i.text))).toBe(true);
    const cand = spotLtCands(t).find((c) => c.id === `spotshort:${a.id}`);
    expect(cand?.specs.map((x) => x.id)).toEqual(['talk', 'fine', 'pull']);
    // None of the answers is violence.
    for (const sp of cand!.specs) expect(JSON.stringify(sp.action)).not.toMatch(/whack|murder|hit/);
    // Take his spot: it is gone, and he has nothing of his own.
    const u = week(t, [{ kind: 'econ', op: { type: 'spotCall', who: a.id, how: 'pull' } }]);
    expect(spotOf(u, a.id)).toBeUndefined();
    expect(u.econ!.spotless![a.id]).toBeDefined();
  });

  it('short and late envelopes from spots show up as the envelope\'s own shortfalls and arrears', () => {
    let s = rich('kick-late');
    const men = bare(s).slice(0, 5);
    s = week(s, men.map((m) => setupAction(m.id, 'cards')));
    for (const m of men) { s.characters[m.id].traits = [...s.characters[m.id].traits.filter((x) => x !== 'Honest'), 'Gambler', 'Drinker']; s.characters[m.id].wealth = 0; }
    let shorts = 0;
    for (let i = 0; i < 12; i++) {
      s = week(s);
      const rep = s.tribute!.reports[s.tribute!.reports.length - 1];
      shorts += [...rep.crews.flatMap((c) => c.members), ...rep.direct].filter((l) => l.kind === 'spot' && l.paid < l.due).length;
    }
    expect(shorts).toBeGreaterThan(0);
  });
});

describe('the rival families earn the same way', () => {
  it('their men have spots, and losing an earner costs the family', () => {
    const s = run(newGame('kick-rivals'), 3);
    const r = s.rivals.find((x) => x.kind === 'mob' && Object.values(s.characters).some((c) => c.faction === x.id && c.alive && c.rank === 'capo'))!;
    const men = Object.values(s.characters).filter((c) => c.faction === r.id && c.alive && c.rank === 'capo');
    expect(men.every((c) => spotOf(s, c.id))).toBe(true);
    const a = cloneState(s);
    const b = cloneState(s);
    const before = rivalSpotsUp(a, a.rivals.find((x) => x.id === r.id)!);
    b.characters[men[0].id].alive = false;
    const after = rivalSpotsUp(b, b.rivals.find((x) => x.id === r.id)!);
    expect(after).toBeLessThan(before);
    // Poached: he is ours now, and his spot over there is gone.
    const c = cloneState(s);
    c.characters[men[0].id].faction = 'player';
    expect(spotOf(c, men[0].id)).toBeUndefined();
    expect(rivalSpotsUp(c, c.rivals.find((x) => x.id === r.id)!)).toBeLessThan(before);
  });
});

describe('requests to do business at your places; two-click rackets', () => {
  it('requests arrive at a sensible rate, sit in the inbox, and an accepted one pays through the ledger', () => {
    let s = rich('kick-asks');
    expect(myPlaces(s).length).toBeGreaterThan(0);
    const seen = new Set<string>();
    let maxOpen = 0;
    let got: PlaceAsk | undefined;
    for (let i = 0; i < 40 && !got; i++) {
      s = week(s);
      for (const a of openAsks(s)) seen.add(a.id);
      maxOpen = Math.max(maxOpen, openAsks(s).length);
      got = openAsks(s).find((a) => a.from !== 'own');
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(seen.size).toBeLessThanOrEqual(15);
    expect(maxOpen).toBeLessThanOrEqual(2);
    expect(got).toBeDefined();
    // In the inbox (unless a lieutenant has it on his docket).
    const items = inbox(s).filter((x) => x.kind === 'request');
    const lt = ltCandidates(s).some((c) => c.id === `place:${got!.id}`);
    expect(items.length > 0 || lt).toBe(true);
    const p = previewAction(s, askAction(got!.id, 'accept'));
    expect(p.detail).toMatch(/His name/);
    s = week(s, [askAction(got!.id, 'accept')]);
    expect(tenantsOf(s).some((t) => t.name === got!.name)).toBe(true);
    s = week(s);
    expect(s.lastReport?.lines.some((l) => l.stat === 'money' && l.label.startsWith(`Tenant: ${got!.name}`)) || tenantsOf(s).length === 0).toBe(true);
  });

  it('every place of yours offers its three best rackets, man and take pre-filled; "set up all" covers the empty ones', () => {
    const s = rich('kick-quick');
    const places = myPlaces(s);
    let any = 0;
    for (const p of places) {
      const q = quickRackets(s, p.id);
      expect(q.length).toBeLessThanOrEqual(3);
      for (const o of q) {
        any++;
        expect(o.take).toBeGreaterThan(0);
        expect(previewAction(s, o.action).disabledReason, o.title).toBeUndefined();
      }
    }
    expect(any).toBeGreaterThan(0);
    const all = suggestAll(s);
    expect(all.length).toBeGreaterThan(0);
    const t = week(s, all.map((x) => x.pick.action));
    expect(Object.values(t.work?.places ?? {}).some((r) => r.holds.length > 0)).toBe(true);
  });
});

describe('determinism, save size, old saves, the screen', () => {
  it('the same seed gives the same spots', () => {
    const a = run(newGame('kick-det'), 14);
    const b = run(newGame('kick-det'), 14);
    expect(JSON.stringify(a.econ?.spots)).toBe(JSON.stringify(b.econ?.spots));
    expect(a.money).toBe(b.money);
  });

  it('the records stay small: one per living man, a few requests', () => {
    const s = run(newGame('kick-size'), 40);
    const e = s.econ!;
    const n = Object.keys(e.spots ?? {}).length;
    const alive = Object.values(s.characters).filter((c) => c.alive && c.rank !== 'civilian').length;
    expect(n).toBeLessThanOrEqual(alive);
    expect(JSON.stringify({ a: e.spots, b: e.spotless, c: e.asks, d: e.tenants }).length).toBeLessThan(25000);
    expect((e.asks ?? []).length).toBeLessThanOrEqual(4);
  });

  it('upgradeSave leaves a save with spots exactly as it is', () => {
    const s = run(newGame('kick-upgrade'), 12);
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
  });

  it('the Set-ups tab renders the men, the requests and the chain', () => {
    const s = run(rich('kick-ui'), 3);
    const html = renderToString(createElement(OrdersContext.Provider, { value: { orders: [], queue: () => {}, remove: () => {} } }, createElement(SetUpsPanel, { s })));
    expect(html).toContain('data-testid="setups-panel"');
    expect(html).toContain('data-testid="spot-line"');
    expect(html).toContain('data-testid="kickup-chain"');
    expect(html).toContain('data-testid="place-requests"');
  });
});

describe('the racket lifecycle (CATALOG_DEEP §7-8)', () => {
  it('not every spot is open at the start; a man of conscience objects, and it costs his loyalty for good', () => {
    let s = rich('kick-gate');
    s.respect = 20;
    expect(spotLock(s, 'shylock')).toMatch(/Not yet/);
    expect(spotLock(s, 'numbers')).toBeUndefined();
    const [a] = bare(s);
    expect(previewAction(s, setupAction(a.id, 'shylock')).disabledReason).toMatch(/Not yet/);
    s.characters[a.id].traits = [...s.characters[a.id].traits.filter((t) => t !== 'Pious'), 'Pious'];
    const p = previewAction(s, setupAction(a.id, 'cards'));
    expect(p.warning).toMatch(/churchgoer/);
    const before = opinion(s, a.id, s.playerId);
    s = week(s, [setupAction(a.id, 'cards')]);
    expect(opinion(s, a.id, s.playerId)).toBeLessThan(before);
    expect(memoriesOf(s, a.id).some((m) => /pushed into/.test(m.text))).toBe(true);
    // The lieutenants never propose what a man refuses.
    expect(spotLtCands(s).every((c) => !c.specs.some((x) => x.action.kind === 'econ' && x.action.op.type === 'setup' && x.action.op.who === a.id && x.action.op.spot === 'cards'))).toBe(true);
  });

  it('a request is weighed by your people, can be delegated, gets into trouble, and is resolved; the men remember', () => {
    let s = rich('kick-life');
    let got: PlaceAsk | undefined;
    for (let i = 0; i < 50 && !got; i++) { s = week(s); got = openAsks(s).find((a) => a.from !== 'own'); }
    expect(got).toBeDefined();
    const views = assessAsk(s, got!);
    expect(views.map((v) => v.role)).toEqual(expect.arrayContaining(['The money', 'The underboss on the man', 'The lawyer']));
    expect(previewAction(s, askAction(got!.id, 'delegate')).disabledReason).toBeUndefined();
    s = week(s, [askAction(got!.id, 'delegate')]);
    expect(openAsks(s).some((a) => a.id === got!.id)).toBe(false);
    expect((s.econ!.rackLog ?? []).some((m) => m.text.includes(got!.name))).toBe(true);
    // A tenant in trouble: it waits in the inbox, and keep / replace / close answer it.
    if (!tenantsOf(s).length) s = week(s, []);
    const id = Object.keys(s.econ!.tenants ?? {})[0];
    if (!id) return; // the lieutenant turned him away: covered above
    s.econ!.tenants![id].trouble = { k: 'short', w: s.week };
    expect(troubled(s).length).toBe(1);
    expect(inbox(s).some((x) => x.ref.trouble === id) || ltCandidates(s).some((c) => c.id === `trouble:${id}`)).toBe(true);
    const u = week(s, [tenantAction(id, 'keep')]);
    expect(u.econ!.tenants![id]?.trouble).toBeUndefined();
    const v = week(s, [tenantAction(id, 'withdraw')]);
    expect(v.econ!.tenants?.[id]).toBeUndefined();
  });
});

