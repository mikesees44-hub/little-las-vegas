import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { ageOn } from '../src/engine/calendar';
import { makeCharacter, player } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { startRomance } from '../src/engine/romance';
import { setDatingSettings } from '../src/engine/datingState';
import { providerRows } from '../src/engine/dating';
import { upgradeSave } from '../src/engine/upgradeSave';
import { previewAction } from '../src/engine/actions';
import {
  applyNightOp, ensureNightlife, nightRoster, nightActionsFor, previewNight, promiseRows, roleShown, nightLog,
} from '../src/engine/nightlife';
import { activeGoomars, goomarBlock, isGoomar } from '../src/engine/goomar';
import { appeal, baseLooks, looksOf } from '../src/engine/looks';
import { callingCard } from '../src/engine/callingCard';
import { ADULT_ROLES } from '../src/engine/nightlifeState';
import type { Character, GameState } from '../src/engine/types';

const weeks = (s: GameState, n: number) => { for (let i = 0; i < n && !s.gameOver; i++) s = advanceWeek(s, {}).state; return s; };
const age = (s: GameState, c: Character) => ageOn(c.birth, s.date);
const op = (s: GameState, o: Parameters<typeof applyNightOp>[1]) => { const ctx = newCtx(s); applyNightOp(ctx, o); return ctx; };

/** Every person the nightlife layer or its lists show is an adult on the day. */
function allAdult(s: GameState): void {
  for (const p of Object.values(s.nightlife!.people)) {
    const c = s.characters[p.id];
    expect(c, p.id).toBeDefined();
    expect(age(s, c), `${c.firstName} ${c.lastName}`).toBeGreaterThanOrEqual(18);
  }
  for (const r of nightRoster(s, 'all')) expect(r.age).toBeGreaterThanOrEqual(18);
  for (const r of providerRows(s)) expect(r.age).toBeGreaterThanOrEqual(18);
  for (const g of s.nightlife!.npc) { expect(age(s, s.characters[g.man])).toBeGreaterThanOrEqual(18); expect(age(s, s.characters[g.her])).toBeGreaterThanOrEqual(18); }
}

describe('nightlife: the cast', () => {
  it('a big, varied adult cast from the first screen: every list, several madams, rival families\' houses', () => {
    const s = newGame('nl-cast');
    allAdult(s);
    const all = nightRoster(s, 'all');
    expect(all.length).toBeGreaterThan(40);
    for (const f of ['young', 'mature', 'callgirl', 'street', 'dancer', 'singer', 'barfly', 'date', 'madam', 'rivals'] as const) expect(nightRoster(s, f).length, f).toBeGreaterThan(0);
    for (const r of nightRoster(s, 'young')) expect(r.age).toBeLessThanOrEqual(25);
    for (const r of nightRoster(s, 'mature')) expect(r.age).toBeGreaterThanOrEqual(26);
    // Several madams, each with her own house, territory and deal.
    const houses = Object.values(s.nightlife!.houses);
    expect(houses.length).toBeGreaterThanOrEqual(6);
    expect(new Set(houses.map((h) => h.with)).size).toBeGreaterThanOrEqual(3);
    // Lives of their own: husbands as people, kids, ailing mothers; what he knows.
    const ppl = Object.values(s.nightlife!.people);
    expect(ppl.some((p) => p.fam.st === 'married' && p.fam.partnerId && s.characters[p.fam.partnerId]?.spouseId === p.id)).toBe(true);
    expect(ppl.some((p) => p.fam.kids.length > 0)).toBe(true);
    expect(ppl.some((p) => p.fam.away)).toBe(true);
    expect(new Set(ppl.map((p) => p.fam.knows).filter(Boolean)).size).toBeGreaterThanOrEqual(3);
    // Kids are names on her card, never people in any adult list.
    expect(ppl.flatMap((p) => p.fam.kids).every((k) => typeof k.n === 'string')).toBe(true);
  });

  it('ages: over the years she stays the same person; prices, roles and careers change; adults only, always', () => {
    let s = newGame('nl-aging');
    const young = nightRoster(s, 'young').filter((r) => r.age === 25)[0] ?? nightRoster(s, 'young').sort((a, b) => b.age - a.age)[0];
    const before = { ...s.nightlife!.people[young.id], fam: JSON.stringify(s.nightlife!.people[young.id].fam) };
    const roles0 = Object.fromEntries(Object.values(s.nightlife!.people).map((p) => [p.id, p.role]));
    const price0 = Object.fromEntries(Object.values(s.nightlife!.people).map((p) => [p.id, p.price]));
    s = weeks(s, 120);
    allAdult(s);
    const c = s.characters[young.id];
    expect(age(s, c)).toBe(young.age + 2);
    const now = s.nightlife!.people[young.id];
    // Turning 26 leaves the 18-25 list but keeps everything she is.
    expect(nightRoster(s, 'young').some((r) => r.id === young.id)).toBe(false);
    if (now.role === 'escort' && now.status === 'active') expect(nightRoster(s, 'mature').some((r) => r.id === young.id)).toBe(true);
    expect(now.since).toBe(before.since);
    expect(now.fam.kids.length).toBeGreaterThanOrEqual(JSON.parse(before.fam).kids.length);
    const N = s.nightlife!;
    expect(N.stats.arrived).toBeGreaterThan(0);
    expect(Object.values(N.people).filter((p) => roles0[p.id] && roles0[p.id] !== p.role).length + N.stats.married).toBeGreaterThan(0);
    expect(Object.values(N.people).some((p) => price0[p.id] !== undefined && price0[p.id] !== p.price)).toBe(true);
    // Newcomers are adults when they arrive, and every young-list newcomer is 18-25.
    for (const r of nightRoster(s, 'young')) expect(r.age).toBeGreaterThanOrEqual(18);
  }, 120_000);
});

describe('nightlife: the goomar', () => {
  it('needs an adult already in a relationship with the boss, and her yes; you can keep several', () => {
    const s = newGame('nl-goomar');
    const boss = player(s);
    const her = nightRoster(s, 'dancer').map((r) => s.characters[r.id]).find((c) => !c.spouseId && !s.nightlife!.people[c.id].bounds.includes('no_married'))!;
    // No relationship: no button, and the op does nothing even if forced.
    expect(goomarBlock(s, her.id)).toMatch(/already seeing/);
    expect(previewNight(s, { op: 'goomar', id: her.id }).disabledReason).toMatch(/already seeing/);
    op(s, { op: 'goomar', id: her.id, rent: 25, allowance: 75, where: 'an apartment' });
    expect(isGoomar(s, her.id)).toBe(false);
    // A paid evening never makes one: still blocked.
    expect(goomarBlock(s, her.id)).toBeDefined();
    // Seeing each other: she is asked; her answer is odds with reasons, never certain; a no costs nothing.
    her.orientation = 'straight';
    boss.orientation = 'straight';
    expect(startRomance(s, boss.id, her.id)).toBeDefined();
    const p = previewAction(s, { kind: 'nightlife', op: { op: 'goomar', id: her.id } });
    expect(p.disabledReason).toBeUndefined();
    expect(p.acceptance!.chance).toBeGreaterThan(0);
    expect(p.acceptance!.chance).toBeLessThanOrEqual(0.85);
    expect(p.refuseEffects?.length).toBeGreaterThan(0);
    expect(p.pot).toBe('pocket');
    expect(p.verb).toMatch(/\/wk/);
    op(s, { op: 'refused', id: her.id, what: 'being your goomar' });
    expect(isGoomar(s, her.id)).toBe(false);
    op(s, { op: 'goomar', id: her.id, rent: 25, allowance: 75, where: 'an apartment on Atlantic Avenue' });
    expect(isGoomar(s, her.id)).toBe(true);
    // Asking took one of the week's evenings.
    expect(s.dating!.evenings.n).toBeGreaterThanOrEqual(1);
    // A second one: allowed (her own consent, her own terms), and she knows about the first.
    const two = nightRoster(s, 'date').map((r) => s.characters[r.id]).find((c) => !c.spouseId && !s.nightlife!.people[c.id].bounds.includes('no_married'))!;
    two.orientation = 'straight';
    startRomance(s, boss.id, two.id);
    const p2 = previewNight(s, { op: 'goomar', id: two.id });
    expect(p2.acceptance!.reasons.some((r) => /already keep/.test(r.label))).toBe(true);
    op(s, { op: 'goomar', id: two.id, rent: 20, allowance: 75, where: 'a bungalow' });
    expect(activeGoomars(s).length).toBe(2);
    // A minor can never be asked.
    const kid = makeCharacter(s, { gender: 'F', age: 16, faction: 'none' });
    expect(goomarBlock(s, kid.id)).toBe('Adults only');
    expect(callingCard(s, kid.id)).toBeUndefined();
  });

  it('costs come from the pocket every week; she can leave; NPC bosses keep theirs', () => {
    let s = newGame('nl-goomar2');
    const boss = player(s);
    const her = nightRoster(s, 'date').map((r) => s.characters[r.id]).find((c) => !c.spouseId)!;
    her.orientation = 'straight'; boss.orientation = 'straight';
    startRomance(s, boss.id, her.id);
    op(s, { op: 'goomar', id: her.id, rent: 25, allowance: 75, where: 'an apartment' });
    // More than any pocket holds: the money doesn't come, and she notices.
    s.nightlife!.goomars[her.id].allowance = 50_000_000;
    s = weeks(s, 6);
    const g = s.nightlife!.goomars[her.id];
    expect(g.missed > 0 || !!g.ended).toBe(true);
    // Somebody's goomar among the NPC bosses, both adults.
    expect(s.nightlife!.npc.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('nightlife: promises, payroll, houses', () => {
  it('a promise is a tracked obligation: open, then kept or broken', () => {
    let s = newGame('nl-promise');
    const singer = nightRoster(s, 'singer')[0];
    const pv = previewNight(s, { op: 'promise', id: singer.id, kind: 'record' });
    expect(pv.disabledReason).toBeUndefined();
    expect(pv.acceptance!.chance).toBeGreaterThan(0.4);
    op(s, { op: 'promise', id: singer.id, kind: 'record' });
    const pr = s.nightlife!.promises.find((x) => x.who === singer.id)!;
    expect(pr.status).toBe('open');
    expect(pr.due).toBe(s.week + 26);
    expect(nightActionsFor(s, singer.id)[0]).toEqual({ kind: 'nightlife', op: { op: 'keep', pid: pr.id } });
    // Another woman's promise is left to lapse.
    const dancer = nightRoster(s, 'dancer')[0];
    op(s, { op: 'promise', id: dancer.id, kind: 'film' });
    const loyal0 = s.nightlife!.people[dancer.id].loyalty;
    op(s, { op: 'keep', pid: pr.id });
    expect(s.nightlife!.promises.find((x) => x.id === pr.id)!.status).toBe('kept');
    s = weeks(s, 28);
    const lapsed = s.nightlife!.promises.find((x) => x.who === dancer.id)!;
    expect(lapsed.status).toBe('broken');
    expect(s.nightlife!.people[dancer.id].loyalty).toBeLessThan(loyal0);
    expect(promiseRows(s).length).toBe(2);
  }, 60_000);

  it('adult pictures only for a woman who said so herself, and never with mature content Off', () => {
    const s = newGame('nl-adultfilm');
    const ppl = Object.values(s.nightlife!.people);
    const willing = ppl.find((p) => p.adultOk)!;
    const not = ppl.find((p) => !p.adultOk && p.role === 'dancer')!;
    expect(age(s, s.characters[willing.id])).toBeGreaterThanOrEqual(21);
    expect(previewNight(s, { op: 'promise', id: not.id, kind: 'adult' }).acceptance!.chance).toBe(0);
    op(s, { op: 'promise', id: not.id, kind: 'adult' });
    expect(s.nightlife!.promises.some((x) => x.who === not.id)).toBe(false);
    expect(previewNight(s, { op: 'promise', id: willing.id, kind: 'adult' }).acceptance!.chance).toBeGreaterThan(0.3);
    const off = setDatingSettings(s, { mature: 'off' });
    expect(previewNight(off, { op: 'promise', id: willing.id, kind: 'adult' }).disabledReason).toBeDefined();
  });

  it('payroll kicks back a share that grows with her earnings; protection pays; the economy runs', () => {
    let s = newGame('nl-econ');
    const dancers = nightRoster(s, 'dancer').filter((r) => !r.payroll).slice(0, 3);
    for (const d of dancers) op(s, { op: 'payroll', id: d.id });
    for (const d of dancers) expect(s.nightlife!.people[d.id].payroll).toBeDefined();
    const money0 = s.money;
    s = weeks(s, 4);
    expect(s.nightlife!.stats.kickback).toBeGreaterThan(0);
    expect(s.nightlife!.stats.protection).toBeGreaterThan(0);
    expect(s.money).not.toBe(money0);
  }, 60_000);
});

describe('nightlife: appearance traits', () => {
  it('everyone has looks; children inherit from their parents; they change with age; attraction is personal', () => {
    const s = newGame('nl-looks');
    for (const c of Object.values(s.characters).slice(0, 80)) {
      const l = looksOf(s, c);
      expect(l.physiqueLabel.length).toBeGreaterThan(0);
      if (age(s, c) >= 18) expect(l.tierLabel).toBeDefined(); else expect(l.tierLabel).toBeUndefined();
    }
    ensureNightlife(s);
    const mk = (b: number, g: 'M' | 'F') => { const c = makeCharacter(s, { gender: g, age: 30 }); s.nightlife!.looks[c.id] = { b }; return c; };
    const fair = [mk(92, 'M'), mk(90, 'F')];
    const plain = [mk(12, 'M'), mk(14, 'F')];
    const kids = (pa: Character[]) => Array.from({ length: 30 }, () => { const k = makeCharacter(s, { gender: 'F', age: 5 }); k.fatherId = pa[0].id; k.motherId = pa[1].id; return baseLooks(s, k); });
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(kids(fair)) - avg(kids(plain))).toBeGreaterThan(30);
    // A child has no adult measure of looks, and is never an observer or the observed.
    const child = makeCharacter(s, { gender: 'F', age: 10 });
    expect(appeal(s, player(s), child).value).toBe(0);
    // Age takes its toll, the same face.
    const w = mk(85, 'F');
    const young = looksOf(s, w).score!;
    w.birth = { ...w.birth, y: w.birth.y - 30 };
    expect(looksOf(s, w).score!).toBeLessThan(young);
    // Two observers can see the same woman differently.
    const men = Object.values(s.characters).filter((c) => c.gender === 'M' && age(s, c) >= 18).slice(0, 40);
    expect(new Set(men.map((m) => appeal(s, m, fair[1]).value)).size).toBeGreaterThan(1);
  });
});

describe('nightlife: calling cards, the mature setting, saves', () => {
  it('a calling card renders for adult women and men, summary first, details behind More…', async () => {
    const s = newGame('nl-card');
    const { CallingCard } = await import('../src/ui/nightlife/CallingCard');
    const { NightlifePanel } = await import('../src/ui/nightlife/NightlifePanel');
    const woman = nightRoster(s, 'callgirl').find((r) => s.nightlife!.people[r.id].fam.st === 'married') ?? nightRoster(s, 'callgirl')[0];
    const man = Object.values(s.characters).find((c) => c.alive && c.rank === 'capo')!;
    for (const id of [woman.id, man.id]) {
      const v = callingCard(s, id)!;
      expect(v.summary.length).toBeGreaterThanOrEqual(3);
      expect(v.looks.chips.length).toBeGreaterThanOrEqual(3);
      expect(v.skills.length).toBe(6);
      const html = renderToString(createElement(CallingCard, { s, id }));
      expect(html).toContain('data-testid="calling-card"');
      expect(html).toContain('data-testid="calling-card-summary"');
      expect(html).toContain('data-testid="calling-card-more"');
      const open = renderToString(createElement(CallingCard, { s, id, startOpen: true }));
      expect(open).toContain('data-testid="calling-card-details"');
      expect(open).toContain('Family &amp; household');
    }
    const panel = renderToString(createElement(NightlifePanel, { s }));
    expect(panel).toContain('data-testid="nightlife-panel"');
    expect(panel).toContain('High-end, 18–25');
    // The card is a tab on the sheet and an item in Deal with.
    const { menuFor } = await import('../src/ui/sheet/menuCatalog');
    const keys = menuFor(s, s.characters[woman.id]).flatMap((c) => c.items.map((i) => i.key));
    expect(keys).toContain('card');
    expect(keys).toContain('goomar');
    const { CharacterSheet } = await import('../src/ui/components/CharacterSheet');
    expect(renderToString(createElement(CharacterSheet, { s, id: woman.id, onClose: () => {}, initialTab: 'card' }))).toContain('data-testid="calling-card"');
  });

  it('mature content Off hides escorts, call girls, the street and adult pictures everywhere; on brings them back', async () => {
    const s0 = newGame('nl-mature');
    const s = setDatingSettings(s0, { mature: 'off' });
    for (const f of ['young', 'mature', 'callgirl', 'street'] as const) expect(nightRoster(s, f).length, f).toBe(0);
    for (const r of nightRoster(s, 'all')) expect(ADULT_ROLES).not.toContain(r.role);
    expect(roleShown(s, 'escort')).toBe(false);
    const esc = Object.values(s.nightlife!.people).find((p) => p.role === 'escort')!;
    expect(previewNight(s, { op: 'payroll', id: esc.id }).disabledReason).toMatch(/Mature content/);
    expect(callingCard(s, esc.id)!.role).toMatch(/private/);
    expect(callingCard(s, esc.id)!.summary.some((l) => /price/i.test(l.label))).toBe(false);
    expect(nightLog(s, 60).some((l) => /escort|call girl/i.test(l.text))).toBe(false);
    const { NightlifePanel } = await import('../src/ui/nightlife/NightlifePanel');
    const html = renderToString(createElement(NightlifePanel, { s }));
    expect(html).not.toContain('High-end escort');
    expect(html).not.toContain('High-end, 18–25');
    expect(nightRoster(s0, 'young').length).toBeGreaterThan(0);
  });

  it('save/load: deterministic, round-trips, and an old save without the layer gets it', () => {
    const a = newGame('nl-save');
    const b = newGame('nl-save');
    expect(JSON.stringify(a.nightlife)).toBe(JSON.stringify(b.nightlife));
    let s = weeks(a, 6);
    const back = upgradeSave(JSON.parse(JSON.stringify(s)) as GameState);
    expect(JSON.stringify(back.nightlife)).toBe(JSON.stringify(s.nightlife));
    expect(callingCard(back, nightRoster(back, 'all')[0].id)!.looks).toEqual(callingCard(s, nightRoster(s, 'all')[0].id)!.looks);
    const old = JSON.parse(JSON.stringify(newGame('nl-old'))) as GameState;
    delete old.nightlife;
    const up = upgradeSave(old);
    expect(up.nightlife).toBeUndefined();
    s = advanceWeek(up, {}).state;
    expect(nightRoster(s, 'all').length).toBeGreaterThan(30);
    allAdult(s);
  }, 60_000);
});

describe('nightlife: the evening, the car, the bold offer', () => {
  const pro = (s: GameState) => nightRoster(s, 'callgirl').concat(nightRoster(s, 'young')).map((r) => r.id).find((id) => !s.nightlife!.people[id].bounds.includes('no_married'))!;

  it('a professional names her price; the haggle is deterministic; below her floor she walks or says no', async () => {
    const { askingPrice, haggle, previewInvite, eveningKindOf, floorPrice } = await import('../src/engine/evening');
    const s = newGame('nl-haggle');
    const id = pro(s);
    expect(eveningKindOf(s, id)).toBe('paid');
    const ask = askingPrice(s, id, 'town').price;
    expect(ask).toBeGreaterThan(0);
    expect(haggle(s, id, 'town', 'accept', ask, 0)).toEqual(haggle(s, id, 'town', 'accept', ask, 0));
    expect(haggle(s, id, 'town', 'accept', ask, 0).price).toBe(ask);
    expect(haggle(s, id, 'town', 'counter', Math.round(ask * 0.3), 2).result).not.toBe('deal');
    expect(haggle(s, id, 'town', 'line', ask, 0).line.length).toBeGreaterThan(5);
    // No price agreed: no order; under her floor: she says no outright.
    const plan = { id, kind: 'town' as const, approach: 'night' as const, stay: false };
    expect(previewInvite(s, plan).disabledReason).toBe('Agree her price first');
    expect(previewInvite(s, { ...plan, price: floorPrice(s, id, 'town') - 50 }).acceptance!.chance).toBe(0);
    const ok = previewInvite(s, { ...plan, price: ask });
    expect(ok.disabledReason).toBeUndefined();
    expect(ok.acceptance!.chance).toBeGreaterThan(0.3);
    expect(ok.acceptance!.chance).toBeLessThan(1);
    expect(ok.pot).toBe('pocket');
  });

  it('the approach and the kind of evening matter; staying is hers to decide and never offered with mature content Off', async () => {
    const { askingPrice, applyInvite, stayOdds, beatFor, asksQuestion } = await import('../src/engine/evening');
    const s = newGame('nl-evening');
    const a = pro(s);
    const b = nightRoster(s, 'dancer').map((r) => r.id).find((id) => id !== a && s.nightlife!.people[id].price > 0) ?? nightRoster(s, 'street')[0].id;
    const N = s.nightlife!;
    const before = [N.people[a].attach, N.people[b].attach];
    applyInvite(newCtx(s), N, { id: a, kind: 'town', approach: 'queen', price: askingPrice(s, a, 'town').price, stay: false, answer: 'dunno' });
    applyInvite(newCtx(s), N, { id: b, kind: 'release', at: 'hotel', approach: 'night', price: askingPrice(s, b, 'release').price, stay: false });
    expect(N.people[a].attach - before[0]).toBeGreaterThan(N.people[b].attach - before[1]);
    expect(beatFor(s, { id: a, kind: 'release' })).toBeUndefined();
    expect(beatFor(s, { id: a, kind: 'town' })).toBeDefined();
    expect(asksQuestion(s, { id: a, kind: 'town', approach: 'queen' })).toBe(true);
    expect(asksQuestion(s, { id: a, kind: 'town', approach: 'night' })).toBe(false);
    const c = s.characters[a];
    expect(stayOdds(s, c, { id: a, kind: 'release', approach: 'queen' })).toBeGreaterThan(0);
    expect(stayOdds(s, c, { id: a, kind: 'release', approach: 'queen' })).toBeLessThan(1);
    // "Does it matter? You're getting paid." ends the road past one night.
    applyInvite(newCtx(s), N, { id: a, kind: 'town', approach: 'something', price: askingPrice(s, a, 'town').price, stay: false, answer: 'paid' });
    expect(s.dating!.bonds[a].pro).toBeGreaterThan(s.week);
    const off = setDatingSettings(s, { mature: 'off' });
    expect(stayOdds(off, off.characters[a], { id: a, kind: 'release', approach: 'queen' })).toBe(0);
    // Every line of the evening is a one-line report.
    for (const l of nightLog(s, 10)) expect(l.text.split('\n').length).toBe(1);
  });

  it('a getaway puts her on the trip planner\'s companion list; a minor can never be invited', async () => {
    const { askingPrice, applyInvite, previewInvite } = await import('../src/engine/evening');
    const { loversOf } = await import('../src/engine/travelState');
    const s = newGame('nl-getaway');
    const id = pro(s);
    applyInvite(newCtx(s), s.nightlife!, { id, kind: 'getaway', dest: 'capemay', cover: 'fishing', approach: 'queen', price: askingPrice(s, id, 'getaway').price, stay: false, answer: 'you' });
    expect(loversOf(s, s.playerId)).toContain(id);
    const kid = makeCharacter(s, { gender: 'F', age: 17, faction: 'none' });
    expect(previewInvite(s, { id: kid.id, kind: 'town', approach: 'night', stay: false }).disabledReason).toBe('Adults only');
  });

  it('the car: a cheaper price, mature content respected; the bold offer escalates, has lines no money crosses, and pays only on a yes', async () => {
    const { previewCar, previewBold, boldReply, boldLine, applyBold, boldAfters, boldScene, askAgainOdds, yourClub } = await import('../src/engine/quickies');
    const { askingPrice } = await import('../src/engine/evening');
    const s = newGame('nl-bold');
    const id = pro(s);
    expect(askingPrice(s, id, 'car').price).toBeLessThan(askingPrice(s, id, 'release').price);
    expect(previewCar(s, id).disabledReason).toBeUndefined();
    expect(previewCar(setDatingSettings(s, { mature: 'off' }), id).disabledReason).toMatch(/Mature/);
    expect(previewBold(setDatingSettings(s, { mature: 'off' }), id, 250).disabledReason).toMatch(/Mature/);
    s.tribute!.acct.personal = 5000;
    // Deterministic replies; raising moves her odds; the pocket caps it.
    expect(boldReply(s, id, 250, 0)).toEqual(boldReply(s, id, 250, 0));
    expect(previewBold(s, id, 6000).disabledReason).toMatch(/pocket/);
    // A woman with a line: no amount crosses it, and pressing on gets you shown the door.
    const lined = Object.values(s.nightlife!.people).map((p) => s.characters[p.id]).find((c) => boldLine(s, c))!;
    expect(boldReply(s, lined.id, 1000, 0).result).toBe('line');
    expect(boldReply(s, lined.id, 1000, 1).result).toBe('out');
    // Money only on a yes.
    let yesAt: number | undefined;
    for (const amt of [100, 250, 500, 750, 1000, 1500, 2000]) if (boldReply(s, id, amt, 0).result === 'yes') { yesAt = amt; break; }
    const pocket0 = s.tribute!.acct.personal;
    const noAt = [100, 250, 500].find((amt) => boldReply(s, id, amt, 0).result !== 'yes');
    if (noAt !== undefined) { applyBold(newCtx(s), s.nightlife!, id, noAt, 0, 'none'); expect(s.tribute!.acct.personal).toBe(pocket0); }
    if (yesAt !== undefined) { applyBold(newCtx(s), s.nightlife!, id, yesAt, 0, 'none'); expect(s.tribute!.acct.personal).toBe(pocket0 - yesAt); }
    // A scene in a club of yours: the bouncer, and three answers; asking again is still her choice.
    let found = false;
    for (const p of Object.values(s.nightlife!.people)) {
      if (!yourClub(s, p.id) || boldLine(s, s.characters[p.id])) continue;
      for (const amt of [100, 250, 500]) for (const r of [0, 1, 2]) {
        const sc = boldScene(s, p.id, amt, r);
        if (sc !== 'none' && sc !== 'bouncer' && !found) {
          found = true;
          expect(boldAfters(s, p.id, amt, r)).toEqual(['sorry', 'askAgain', 'getLost']);
          const odds = askAgainOdds(s, p.id, amt);
          expect(odds).toBeGreaterThan(0);
          expect(odds).toBeLessThan(1);
          applyBold(newCtx(s), s.nightlife!, p.id, amt, r, 'getLost');
          expect(s.nightlife!.people[p.id].grudge).toBe(s.week);
        }
      }
    }
    expect(found).toBe(true);
  });
});

describe('nightlife: her man, and her grudge', () => {
  it('what kind of man he is stays hidden until you ask; dealing with him changes what she thinks', async () => {
    const { previewPartner, previewAskMan, applyAskMan, applyPartner, temperOf, partnerKnown } = await import('../src/engine/nightPartners');
    const s = newGame('nl-partner');
    const p = Object.values(s.nightlife!.people).find((x) => x.fam.partnerId && ['jealous', 'volatile'].includes(temperOf(s, x) ?? ''))!;
    expect(p).toBeDefined();
    expect(partnerKnown(s, p)).toBeUndefined();
    expect(callingCard(s, p.id)!.family.join(' ')).toMatch(/you don't know/);
    expect(previewPartner(s, p.id, 'warn').disabledReason).toMatch(/ask around/);
    expect(previewAskMan(s, p.id).disabledReason).toBeUndefined();
    applyAskMan(newCtx(s), s.nightlife!, p.id);
    expect(partnerKnown(s, p)).toBeDefined();
    expect(previewPartner(s, p.id, 'crew').disabledReason).toBeUndefined();
    const op0 = s.characters[p.id] ? (await import('../src/engine/relations')).opinion(s, p.id, s.playerId) : 0;
    applyPartner(newCtx(s), s.nightlife!, p.id, 'crew');
    expect((await import('../src/engine/relations')).opinion(s, p.id, s.playerId)).not.toBe(op0);
    expect(s.characters[p.fam.partnerId!].alive).toBe(true);
  });

  it('a grudge talks: leaks to a rival family or the law are recorded; your people may warn you', () => {
    let s = newGame('nl-grudge');
    for (const p of Object.values(s.nightlife!.people).slice(0, 12)) p.grudge = s.week;
    s = weeks(s, 40);
    expect((s.nightlife!.leaks ?? []).length).toBeGreaterThan(0);
    for (const l of s.nightlife!.leaks!) expect(age(s, s.characters[l.from])).toBeGreaterThanOrEqual(18);
  }, 60_000);
});
