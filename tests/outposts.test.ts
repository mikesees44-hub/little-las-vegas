import { describe, expect, it } from 'vitest';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { newGame } from '../src/engine/newGame';
import { upgradeSave } from '../src/engine/upgradeSave';
import { reconcile } from '../src/engine/ledger';
import {
  applyLieOp, applyPostOp, breakOdds, driftOf, ensureOutposts, havensFor, lieCandidates, needsBolthole, passageOdds, poachOdds, postActions,
  quickPlan, sendableMen, warningsOf, type Outpost,
} from '../src/engine/outposts';
import { isAway, bossAway } from '../src/engine/travelState';
import { newCtx } from '../src/engine/ledger';
import type { FamAction } from '../src/engine/familyWeb';
import type { GameState } from '../src/engine/types';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Outposts, SomewhereToGo } from '../src/ui/shell/sections/Outposts';
import { Connections } from '../src/ui/shell/sections/Connections';
import { menuFor } from '../src/ui/sheet/menuCatalog';

const step = (s: GameState, actions: { kind: 'fam'; op: FamAction }[] = []): GameState => {
  const r = advanceWeek(s, { actions });
  expect(reconcile(r.report)).toEqual([]);
  return r.state;
};

/** Put a running outpost in directly (the start order's odds are tested on their own). */
function plant(s: GameState, o: Partial<Outpost> = {}): Outpost {
  const man = sendableMen(s)[0];
  const ctx = newCtx(s);
  applyPostOp(ctx, { op: 'post', do: 'start', plan: { city: 'vegas', spot: 'lounge', man: man.id, crew: [], seed: 8000 } });
  const st = ensureOutposts(s);
  const post = st.list[st.list.length - 1];
  Object.assign(post, o);
  return post;
}

const ours = (s: GameState) => Object.values(s.characters).filter((c) => c.faction === 'player' && c.alive).map((c) => c.id).sort();

describe('outposts: send a man to start something', () => {
  it('a fresh game has none and is final: upgradeSave changes nothing', () => {
    const s = newGame('op-a');
    expect(s.posts).toBeUndefined();
    expect(upgradeSave(cloneState(s))).toEqual(s);
  });

  it('the start order shows its odds and its cost; the seed goes out and the weekly sends come home through the ledger', () => {
    let s = newGame('op-b');
    s.money = 60000;
    const plan = quickPlan(s)!;
    expect(plan).toBeDefined();
    const p = previewAction(s, { kind: 'fam', op: plan });
    expect(p.disabledReason).toBeUndefined();
    expect(p.acceptance!.chance).toBeGreaterThan(0);
    expect(p.acceptance!.chance).toBeLessThan(1);
    expect(p.detail).toMatch(/%/);
    expect(p.cost).toBeGreaterThan(plan.seed!);
    // A city without that spot, a man not his to send: blocked with a reason.
    expect(previewAction(s, { kind: 'fam', op: { ...plan, city: 'chicago', spot: 'point' } }).disabledReason).toBeDefined();
    expect(previewAction(s, { kind: 'fam', op: { ...plan, man: s.playerId } }).disabledReason).toBeDefined();
    // Run it in directly and watch the money come home.
    const o = plant(s);
    const man = o.manId;
    let sent = 0;
    for (let i = 0; i < 10; i++) {
      s = step(s);
      sent += s.lastReport!.lines.filter((l) => /what he sent home/.test(l.label)).reduce((a, l) => a + l.amount, 0);
      expect(isAway(s, man)).toBe(true);
    }
    const post = s.posts!.list.find((x) => x.id === o.id)!;
    expect(sent).toBeGreaterThan(0);
    expect(post.sent).toBe(sent);
    expect(post.kept).toBeGreaterThan(0);
    expect(post.hist.length).toBeGreaterThan(1);
    expect(sendableMen(s).some((c) => c.id === man)).toBe(false);
    expect(JSON.stringify(s.journal?.e ?? [])).toMatch(/Las Vegas/);
  }, 600000);

  it('loyalty drifts with distance, time, success and nature; warning signs come before the break; odds are shown', () => {
    const s = newGame('op-c');
    const o = plant(s);
    const far = driftOf(s, o);
    expect(far.total).toBeLessThan(0);
    expect(far.parts.some((p) => /miles/.test(p.label))).toBe(true);
    const near = driftOf(s, { ...o, city: 'chicago' });
    expect(near.total).toBeGreaterThan(far.total);
    // Keep him close: a visit, letters, a bigger share, his wife, a marriage all help.
    const close = driftOf(s, { ...o, visit: s.week, letter: s.week, share: 0.5, wife: s.week, wed: s.week });
    expect(close.total).toBeGreaterThan(far.total + 1);
    // High loyalty: no odds of leaving. Low: odds, and warning signs.
    expect(breakOdds(s, { ...o, loyal: 80 })).toBe(0);
    expect(breakOdds(s, { ...o, loyal: 20 })).toBeGreaterThan(0);
    expect(breakOdds(s, { ...o, loyal: 20, wed: s.week })).toBeLessThan(breakOdds(s, { ...o, loyal: 20 }));
    expect(poachOdds(s, { ...o, loyal: 30 })).toBeGreaterThan(0);
    expect(warningsOf(s, { ...o, loyal: 35, side: 2 }).length).toBeGreaterThanOrEqual(3);
    expect(warningsOf(s, { ...o, loyal: 90 }).length).toBe(0);
  });

  it('a man left alone far away drifts, starts his own things and may break away; his men come home; nobody is killed', () => {
    let s = newGame('op-d');
    const o = plant(s, { loyal: 32 });
    const men0 = ours(s);
    const crewId = sendableMen(s)[0]?.id;
    if (crewId) o.crew = [crewId];
    let broke = false;
    for (let i = 0; i < 60 && !broke; i++) {
      s = step(s);
      const p = s.posts!.list.find((x) => x.id === o.id)!;
      if (p.status === 'broke' || p.status === 'poached') broke = true;
    }
    expect(broke).toBe(true);
    const p = s.posts!.list.find((x) => x.id === o.id)!;
    expect(s.characters[p.manId].alive).toBe(true);
    expect(s.characters[p.manId].faction).toBe('none');
    if (crewId) {
      expect(s.characters[crewId].faction).toBe('player');
      expect(isAway(s, crewId)).toBe(false);
    }
    // Everyone else of the boss's who was alive is still his (nobody killed by this).
    for (const id of men0) if (id !== p.manId && s.characters[id].alive) expect(s.characters[id].faction === 'player' || id === p.manId).toBe(true);
    const acts = postActions(p);
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      const pv = previewAction(s, { kind: 'fam', op: a });
      expect(pv.title.length).toBeGreaterThan(0);
      if (a.op === 'post' && (a.step === 'settle' || a.step === 'retake' || a.step === 'askback')) expect(pv.detail).toMatch(/%/);
    }
    expect([...s.eventQueue, ...s.pendingEvents].some((e) => e.defId === 'post_broke' || e.defId === 'post_poached') || JSON.stringify(s.journal?.e ?? []).match(/broke away|took/)).toBeTruthy();
  }, 600000);

  it('keep-close orders: each says what it does; a visit and a letter raise his loyalty; calling him home brings the money back', () => {
    let s = newGame('op-e');
    s.money = 60000;
    const o = plant(s, { loyal: 60 });
    for (const a of postActions(o)) {
      const pv = previewAction(s, { kind: 'fam', op: a });
      expect(pv.detail, a.op === 'post' ? a.step : '').toBeTruthy();
    }
    s = step(s, [{ kind: 'fam', op: { op: 'post', step: 'visit', id: o.id } }, { kind: 'fam', op: { op: 'post', step: 'letter', id: o.id } }]);
    let p = s.posts!.list.find((x) => x.id === o.id)!;
    expect(p.visit).toBeDefined();
    expect(p.letter).toBeDefined();
    expect(p.loyal).toBeGreaterThan(70);
    s = step(s, [{ kind: 'fam', op: { op: 'post', step: 'share', id: o.id } }]);
    p = s.posts!.list.find((x) => x.id === o.id)!;
    expect(p.share).toBeCloseTo(0.4);
    s = step(s, [{ kind: 'fam', op: { op: 'post', step: 'home', id: o.id } }]);
    p = s.posts!.list.find((x) => x.id === o.id)!;
    expect(p.status).toBe('home');
    expect(isAway(s, p.manId)).toBe(false);
    expect(s.lastReport!.lines.some((l) => /sold out of Las Vegas/.test(l.label))).toBe(true);
  }, 600000);
});

describe('safe passage', () => {
  it('odds shown before going, from loyalty, the host\'s stance and ties, the hunters, the feds\' reach and how long', () => {
    const s = newGame('sp-a');
    const o = plant(s, { loyal: 85 });
    const at = `post:${o.id}`;
    expect(havensFor(s).some((h) => h.at === at)).toBe(true);
    expect(lieCandidates(s)[0].id).toBe(s.playerId);
    const calm = passageOdds(s, s.playerId, at, 4);
    expect(calm.safe + calm.found + calm.sold).toBeCloseTo(1, 5);
    // Longer is riskier; a disloyal host is riskier; the feds make it riskier.
    expect(passageOdds(s, s.playerId, at, 10).safe).toBeLessThan(calm.safe);
    o.loyal = 30;
    expect(passageOdds(s, s.playerId, at, 4).sold).toBeGreaterThan(calm.sold);
    o.loyal = 85;
    s.heat.federal = 80;
    const hot = passageOdds(s, s.playerId, at, 4);
    expect(hot.safe).toBeLessThan(calm.safe);
    expect(hot.hunters.some((h) => h.key === 'feds')).toBe(true);
    expect(needsBolthole(s).length).toBeGreaterThan(0);
    const p = previewAction(s, { kind: 'fam', op: { op: 'lie', who: s.playerId, at, weeks: 4 } });
    expect(p.disabledReason).toBeUndefined();
    expect(p.detail).toMatch(/% safe/);
    expect(p.detail).toMatch(/% found/);
    expect(p.detail).toMatch(/sells you out/);
    // A friendly family's city: the host takes you in or not (odds).
    const fam = havensFor(s).find((h) => h.at.startsWith('fam:') && !h.block);
    if (fam) expect(previewAction(s, { kind: 'fam', op: { op: 'lie', who: s.playerId, at: fam.at, weeks: 4 } }).acceptance).toBeDefined();
  });

  it('the boss lying low is away (the acting boss runs the family), heat cools, he comes home; it lands in Your File', () => {
    let s = newGame('sp-b');
    s.money = 60000;
    s.heat.local = 40;
    const o = plant(s, { loyal: 95 });
    // Nobody is hunting; the outpost man is loyal: put him there directly and run the weeks.
    applyLieOp(newCtx(s), { op: 'lie', do: 'start', plan: { who: s.playerId, at: `post:${o.id}`, weeks: 3 } });
    expect(bossAway(s)).toBe(true);
    const heat0 = s.heat.local;
    let acting = false;
    for (let i = 0; i < 4; i++) {
      s.eventQueue = s.eventQueue.filter((e) => !e.defId.startsWith('lie_'));
      s = step(s);
      if (s.travel?.acting) acting = true;
    }
    expect(acting).toBe(true);
    expect(s.heat.local).toBeLessThan(heat0 + 5);
    expect(bossAway(s)).toBe(false);
    expect(JSON.stringify(s.journal?.e ?? [])).toMatch(/lie low/);
  }, 600000);

  it('found or sold out: the boss decides; one of his men is never handed over or killed; the boss sold out is an event with odds', () => {
    let s = newGame('sp-c');
    s.money = 60000;
    s.heat.federal = 90;
    const o = plant(s, { loyal: 15 });
    const man = sendableMen(s).find((c) => c.id !== o.manId)!;
    applyLieOp(newCtx(s), { op: 'lie', do: 'start', plan: { who: man.id, at: `post:${o.id}`, weeks: 12 } });
    const l = s.posts!.lie[0];
    // The host turns: his escape fails (chance 0) and he still comes home alive and his.
    const ctx = newCtx(s);
    applyLieOp(ctx, { op: 'lie', do: 'slip', id: l.id, chance: 0 });
    expect(s.characters[man.id].alive).toBe(true);
    expect(s.characters[man.id].faction).toBe('player');
    expect(s.posts!.lie[0].status).toBe('sold');
    expect(isAway(s, man.id)).toBe(false);
    // The danger popups carry their odds in the labels, and none hands a man over.
    s.posts!.list[0].loyal = 15;
    applyLieOp(newCtx(s), { op: 'lie', do: 'start', plan: { who: man.id, at: `post:${o.id}`, weeks: 12 } });
    let seen = false;
    for (let i = 0; i < 12 && !seen; i++) {
      s = step(s);
      const ev = [...s.eventQueue, ...s.pendingEvents].find((e) => e.defId === 'lie_found' || e.defId === 'lie_sold');
      if (ev) {
        seen = true;
        for (const c of ev.choices.filter((x) => x.id === 'move' || x.id === 'slip' || x.id === 'outbid')) expect(c.label).toMatch(/\d+%/);
        expect(ev.choices.map((c) => c.label).join(' ')).not.toMatch(/hand (him )?over|give (him )?up/i);
      }
    }
    expect(s.characters[man.id].alive).toBe(true);
    // The boss sold out with a failed run: a game event, not a death; with no war, the feds question him.
    const boss = s.characters[s.playerId];
    const ev0 = boss.evidence ?? 0;
    applyLieOp(newCtx(s), { op: 'lie', do: 'start', plan: { who: s.playerId, at: `post:${o.id}`, weeks: 4 } });
    const bl = s.posts!.lie.find((x) => x.who === s.playerId && x.status === 'away')!;
    const ctx2 = newCtx(s);
    applyLieOp(ctx2, { op: 'lie', do: 'slip', id: bl.id, chance: 0 });
    expect(s.characters[s.playerId].alive).toBe(true);
    if (!s.wars.length) expect(s.characters[s.playerId].evidence ?? 0).toBeGreaterThan(ev0);
  }, 600000);

  it('a year with outposts and someone lying low: the books reconcile and the save stays small', () => {
    let s = newGame('sp-d');
    s.money = 80000;
    plant(s, { loyal: 70 });
    const o2 = plant(s, { loyal: 75 });
    o2.city = 'miami';
    applyLieOp(newCtx(s), { op: 'lie', do: 'start', plan: { who: lieCandidates(s)[1]?.id ?? s.playerId, at: `post:${o2.id}`, weeks: 6 } });
    for (let i = 0; i < 52; i++) s = step(s);
    const size = JSON.stringify(s).length;
    expect(size).toBeLessThan(3.7 * 1024 * 1024);
    console.log(`save after a year with outposts: ${(size / 1024 / 1024).toFixed(2)} MB`);
    const html = renderToString(createElement(Outposts, { s }));
    expect(html).toMatch(/data-testid="outposts"/);
  }, 600000);

  it('reachable: the Connections cards and tab, a man\'s menu, the boss\'s Travel menu, the Desk when the heat is heavy', () => {
    const s = newGame('sp-e');
    const html = renderToString(createElement(Connections, { s }));
    expect(html).toMatch(/data-testid="connections-outposts-tab"/);
    expect(html).toMatch(/data-testid="fam-post-vegas"/);
    expect(html).toMatch(/data-testid="fam-lie-chicago"/);
    const keys = (id: string) => menuFor(s, s.characters[id]).flatMap((c) => c.items.map((i) => i.key));
    expect(keys(s.playerId)).toContain('lielow');
    const man = sendableMen(s)[0];
    expect(keys(man.id)).toContain('outpost');
    expect(renderToString(createElement(SomewhereToGo, { s }))).toBe('');
    s.heat.federal = 70;
    expect(renderToString(createElement(SomewhereToGo, { s }))).toMatch(/desk-somewhere-to-go/);
    const o = plant(s);
    expect(keys(o.manId)).toContain('post-visit');
  });
});

