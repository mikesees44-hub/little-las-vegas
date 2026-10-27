import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { capos, crew } from '../src/engine/characters';
import { devOpportunities, legitIncome, tierView, validateGear, weeklyUpkeep, type DevAction } from '../src/engine/develop';
import { TIERS_BY_ID } from '../src/engine/devData';
import { devKeeperMult, devObeyBonus, ensureDev } from '../src/engine/devState';
import { crewStrength, gearCount, rivalEstimate, rivalStrength } from '../src/engine/strength';
import { playerMuscle, raidOdds } from '../src/engine/war';
import { upgradeSave } from '../src/engine/upgradeSave';
import { tidyState } from '../src/engine/tidy';
import { adviceBrief } from '../src/engine/adviceBrief';
import type { GameState, PlayerAction } from '../src/engine/types';

const dev = (op: DevAction): PlayerAction => ({ kind: 'dev', op });
const week = (s: GameState, actions: PlayerAction[] = []) => advanceWeek(s, { actions });
const part = (s: GameState, key: string) => crewStrength(s).parts.find((p) => p.key === key)!;

function fresh(seed = 'dev-a'): GameState {
  const s = newGame(seed);
  ensureDev(s);
  s.money = 60000;
  return s;
}

describe('development paths', () => {
  it('an opportunity appears only when its prerequisites are met, and says why', () => {
    const s = fresh();
    for (const c of crew(s)) { c.specialty = c.specialty === 'accountant' ? undefined : c.specialty; c.attributes.business = Math.min(c.attributes.business, 60); }
    expect(tierView(s, TIERS_BY_ID.books1).status).toBe('locked');
    expect(devOpportunities(s).map((v) => v.def.id)).not.toContain('books1');
    expect(previewAction(s, dev({ t: 'adopt', path: 'books' })).disabledReason).toMatch(/bookkeeper/);
    crew(s)[3].specialty = 'accountant';
    const v = tierView(s, TIERS_BY_ID.books1);
    expect(v.status).toBe('available');
    expect(v.because.join(' ')).toMatch(/experienced bookkeeper/);
    expect(devOpportunities(s).map((x) => x.def.id)).toContain('books1');
    // Era: pagers are not for 1960; the step before is needed too.
    expect(tierView(s, TIERS_BY_ID.comm3).status).toBe('future');
    expect(tierView(s, TIERS_BY_ID.comm2).status).toBe('future');
    // A business opens a tier: the motel.
    s.businesses = s.businesses.filter((b) => !(b.owner === 'player' && b.kind === 'motel'));
    expect(tierView(s, TIERS_BY_ID.legit1).status).toBe('locked');
  });

  it('adopting a tier costs money, upkeep every week, and does its concrete thing', () => {
    let s = fresh();
    crew(s)[3].specialty = 'accountant';
    const obey0 = devObeyBonus(s);
    const m0 = devKeeperMult(s);
    const r = week(s, [dev({ t: 'adopt', path: 'comm' }), dev({ t: 'adopt', path: 'books' })]);
    s = r.state;
    expect(s.dev!.tiers.comm).toBe(1);
    expect(s.dev!.tiers.books).toBe(1);
    expect(devObeyBonus(s)).toBeGreaterThan(obey0);
    expect(devKeeperMult(s)).toBeGreaterThan(m0);
    const paid = r.report.lines.filter((l) => l.stat === 'money' && /Communications|Business & finance/.test(l.label));
    expect(paid.reduce((a, l) => a + l.amount, 0)).toBe(-(1200 + 1000));
    const r2 = week(s);
    const up = r2.report.lines.find((l) => l.label === 'Family development: upkeep');
    expect(up?.amount).toBe(-(20 + 25));
  });
});

describe('rivals develop on their own', () => {
  it('without the player, at their own pace, and you hear about it', () => {
    let s = fresh('dev-rivals');
    const start = JSON.stringify(s.dev!.rivals);
    for (let i = 0; i < 160 && !s.gameOver; i++) s = week(s).state;
    expect(JSON.stringify(s.dev!.rivals)).not.toBe(start);
    expect(s.dev!.tiers).toEqual({});
    expect(s.dev!.heard.length).toBeGreaterThan(0);
    // No two families on the same schedule.
    const lags = Object.values(s.dev!.rivals).map((d) => JSON.stringify(d!.lag));
    expect(new Set(lags).size).toBeGreaterThan(1);
    const weeks = s.dev!.heard.map((h) => `${h.week}:${h.text.replace(/The \w+ crew/, '')}`);
    expect(new Set(weeks).size).toBe(weeks.length);
    // Estimates are labeled and bracket the truth.
    const r = s.rivals.find((x) => x.kind === 'mob')!;
    const e = rivalEstimate(s, r);
    expect(e.label).toMatch(/^Estimate/);
    expect(e.lo).toBeLessThanOrEqual(Math.round(rivalStrength(s, r)) + 1);
    expect(e.hi).toBeGreaterThanOrEqual(Math.round(rivalStrength(s, r)) - 1);
  });
});

describe('crew equipment', () => {
  it('a capo with a mandate buys within his budget, from Family money', () => {
    let s = fresh('dev-capo');
    const k = capos(s)[0];
    expect(previewAction(s, dev({ t: 'mandate', capo: k.id, level: 1 })).disabledReason).toBeUndefined();
    s = week(s, [dev({ t: 'mandate', capo: k.id, level: 1 })]).state;
    const before = gearCount(s, k.id);
    for (let i = 0; i < 8; i++) s = week(s).state;
    expect(gearCount(s, k.id)).toBeGreaterThan(before);
    for (const [key, v] of Object.entries(s.dev!.spent)) if (key.startsWith(`${k.id}:`)) expect(v).toBeLessThanOrEqual(600);
    expect(s.dev!.stats.capoBuys).toBeGreaterThan(0);
    // Never more than his men can use.
    const c = crewStrength(s).crews.find((x) => x.holder === k.id)!;
    expect(gearCount(s, k.id, 'handguns')).toBeLessThanOrEqual(c.members);
  });

  it('a piece of equipment is in one crew only', () => {
    let s = fresh('dev-assign');
    const [a, b] = capos(s);
    s = week(s, [dev({ t: 'buy', cat: 'handguns', n: 4, holder: a.id })]).state;
    const total = gearCount(s);
    const st = s.dev!.gear.find((g) => g.holder === a.id)!;
    s = week(s, [dev({ t: 'assign', stack: st.id, holder: b.id, n: 3 })]).state;
    expect(gearCount(s, a.id, 'handguns')).toBe(1);
    expect(gearCount(s, b.id, 'handguns')).toBe(3);
    const st2 = s.dev!.gear.find((g) => g.holder === b.id)!;
    s = week(s, [dev({ t: 'assign', stack: st2.id, holder: 'family' })]).state;
    expect(gearCount(s, b.id)).toBe(0);
    expect(gearCount(s)).toBe(total);
    expect(validateGear(s)).toEqual([]);
    expect(new Set(s.dev!.gear.map((g) => g.id)).size).toBe(s.dev!.gear.length);
  });

  it('purchases and upkeep go through the books and reconcile', () => {
    let s = fresh('dev-books');
    const k = capos(s)[1];
    const p = previewAction(s, dev({ t: 'buy', cat: 'shotguns', n: 4, holder: k.id }));
    expect(p.disabledReason).toBeUndefined();
    const r = week(s, [dev({ t: 'buy', cat: 'shotguns', n: 4, holder: k.id })]);
    const bought = r.report.lines.filter((l) => l.stat === 'money' && l.label.startsWith('Equipment:'));
    expect(bought.reduce((a, l) => a + l.amount, 0)).toBe(-p.cost);
    expect(r.report.lines.some((l) => l.stat === 'heat.local' && /Arming up/.test(l.label))).toBe(true);
    expect(r.state.dev!.resent).toBeGreaterThan(0);
    s = r.state;
    const up = weeklyUpkeep(s).gear;
    const r2 = week(s);
    expect(r2.report.lines.find((l) => l.label === 'Crew equipment: upkeep')?.amount).toBe(-up);
  });
});

describe('crew strength', () => {
  it('changes with personnel, condition, equipment and leadership, and says why', () => {
    const s = fresh('dev-str');
    const k = capos(s)[0];
    const base = crewStrength(s);
    expect(base.parts.map((p) => p.key)).toEqual(expect.arrayContaining(['men', 'gear', 'lead', 'cohesion', 'fear', 'rep', 'local']));
    expect(playerMuscle(s)).toBe(base.total);
    const crewK = base.crews.find((c) => c.holder === k.id)!;
    // Equipment in the hands of men who can use it.
    const d = s.dev!;
    d.gear.push({ id: 'gx', cat: 'handguns', n: crewK.men, cond: 1, holder: k.id, since: s.week });
    const armed = crewStrength(s);
    expect(armed.total).toBeGreaterThan(base.total);
    expect(armed.parts.find((p) => p.key === 'gear')!.value).toBeGreaterThan(part({ ...s, dev: { ...d, gear: d.gear.filter((g) => g.id !== 'gx') } }, 'gear').value);
    // Beyond the personnel: nothing more, and it says so.
    d.gear.find((g) => g.id === 'gx')!.n = crewK.men + 10;
    const over = crewStrength(s);
    expect(over.total).toBeCloseTo(armed.total, 5);
    expect(over.crews.find((c) => c.holder === k.id)!.shortages.join(' ')).toMatch(/spare/);
    // Worn equipment counts for less.
    d.gear.find((g) => g.id === 'gx')!.n = crewK.men;
    d.gear.find((g) => g.id === 'gx')!.cond = 0.3;
    expect(crewStrength(s).total).toBeLessThan(armed.total);
    d.gear.find((g) => g.id === 'gx')!.cond = 1;
    // A man inside is not there to fight.
    const man = crew(s).find((c) => c.capoId === k.id) ?? k;
    man.imprisonedUntil = s.week + 20;
    const jailed = crewStrength(s);
    expect(jailed.parts[0].value).toBeLessThan(armed.parts[0].value);
    expect(jailed.parts[0].why).toMatch(/inside/);
    man.imprisonedUntil = undefined;
    // Leadership.
    const lead0 = part(s, 'lead').value;
    k.attributes.leadership = 99;
    for (const c of capos(s)) if (c.id !== k.id) c.attributes.leadership = 99;
    expect(part(s, 'lead').value).toBeGreaterThan(lead0);
    // Raid odds read it.
    s.wars.push({ id: 'w1', rival: 'manno', district: 'boardwalk', cb: 'claim', sanctioned: true, score: 0, startWeek: s.week });
    const o1 = raidOdds(s, s.wars[0]);
    d.gear.find((g) => g.id === 'gx')!.n = 0.0001 as unknown as number;
    d.gear = d.gear.filter((g) => g.id !== 'gx');
    expect(raidOdds(s, s.wars[0])).toBeLessThan(o1);
    // Fear is its own number.
    const f = part(s, 'fear').value;
    d.fear = 80;
    expect(part(s, 'fear').value).toBeGreaterThan(f);
    expect(part(s, 'rep').value).toBe(part({ ...s, dev: { ...d, fear: 20 } }, 'rep').value);
  });
});

describe('saves', () => {
  it('development, equipment, assignments and rival progress persist across save/load and the new year', () => {
    let s = fresh('dev-save');
    crew(s)[3].specialty = 'accountant';
    const k = capos(s)[0];
    s = week(s, [dev({ t: 'adopt', path: 'wheels' }), dev({ t: 'buy', cat: 'handguns', n: 3, holder: k.id }), dev({ t: 'mandate', capo: k.id, level: 1 })]).state;
    while (s.date.y === 1960 && !s.gameOver) s = week(s).state;
    expect(s.date.y).toBe(1961);
    const json = JSON.stringify(s);
    const back = upgradeSave(JSON.parse(json) as GameState);
    expect(back.dev).toEqual(s.dev);
    tidyState(back);
    expect(JSON.parse(JSON.stringify(back)).dev).toEqual(back.dev);
    expect(back.dev!.tiers.wheels).toBe(1);
    expect(back.dev!.mandates[k.id]).toBe(1);
    expect(gearCount(back, k.id)).toBeGreaterThanOrEqual(3);
    // Deterministic: the same week from the save and from memory.
    const a = week(s).state;
    const b = week(back).state;
    expect(JSON.stringify(a.dev)).toBe(JSON.stringify(b.dev));
    expect(a.money).toBe(b.money);
  });

  it('an old save without the layer loads, and the next week creates it', () => {
    const s = newGame('dev-old');
    delete s.dev;
    const back = upgradeSave(JSON.parse(JSON.stringify(s)) as GameState);
    expect(back.dev).toBeUndefined();
    const n = week(back).state;
    expect(n.dev).toBeDefined();
    expect(Object.keys(n.dev!.rivals).length).toBeGreaterThan(0);
  });
});

describe('advice and balance', () => {
  it('the man in charge briefs a development order; a capo briefs his gear', () => {
    const s = fresh('dev-adv');
    crew(s)[3].specialty = 'accountant';
    const k = capos(s)[0];
    const b = adviceBrief(s, { kind: 'action', action: dev({ t: 'buy', cat: 'shotguns', n: 6, holder: k.id }) });
    expect(b?.adviser.charId).toBe(k.id);
    expect(b?.accomplishes.some((l) => /men/.test(l.text))).toBe(true);
    const bb = adviceBrief(s, { kind: 'action', action: dev({ t: 'adopt', path: 'books' }) });
    expect(bb?.requirements.some((l) => /a week/.test(l.text))).toBe(true);
  });

  it('legitimate business pays only with the places to go with it', () => {
    const s = fresh('dev-legit');
    s.dev!.tiers.legit = 1;
    const withMotels = legitIncome(s);
    s.businesses = s.businesses.filter((b) => b.kind !== 'motel');
    expect(legitIncome(s)).toBe(0);
    expect(withMotels).toBeGreaterThanOrEqual(0);
  });
});
