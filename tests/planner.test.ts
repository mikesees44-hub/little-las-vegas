import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGameWith } from '../src/engine/starts';
import { advanceDay } from '../src/engine/daily';
import { scheduleInto } from '../src/engine/schedule';
import { seedThreat, ensureThreats, type Tip } from '../src/engine/threats';
import { crew, capos, player } from '../src/engine/characters';
import { holder } from '../src/engine/council';
import { opinion } from '../src/engine/relations';
import { setTie, ensureDeeds } from '../src/engine/deeds/state';
import { buildAsk } from '../src/engine/deeds/asks';
import { dial } from '../src/engine/phoneMeet';
import { setLevel } from '../src/engine/lieutenants';
import { upgradeSave } from '../src/engine/upgradeSave';
import { absDay } from '../src/engine/timeCost';
import { dailyBrief, oldManPick, recommendations, briefDue } from '../src/engine/planner/brief';
import { audienceRequests, closeness, desperation, gateBias, gatekeeper, grantAudience, moneyPart, turnAway, BIAS_BRIBE, BIAS_FRIEND, BIAS_RIVAL } from '../src/engine/planner/audience';
import { cancelEntry, dayEntries, dayPage, moveEntry, monthPage, planWith, weekPage } from '../src/engine/planner/datebook';
import { blackBook, favorsLedger } from '../src/engine/planner/blackbook';
import { edictOrder, splitOrder, standingOrders } from '../src/engine/planner/orders';
import { sourceGrade, tipConfidence } from '../src/engine/planner/intel';
import { freeOn } from '../src/engine/planner/hours';
import { ensurePlanner, markBrief, plannerOf, setNote } from '../src/engine/planner/state';
import type { Character, GameState } from '../src/engine/types';

function game(seed = 'plan1', start: Parameters<typeof newGameWith>[1] = 'olddon'): GameState {
  const s = newGameWith(seed, start);
  s.pendingEvents = [];
  s.eventQueue = [];
  return s;
}

function men(s: GameState): Character[] {
  const g = gatekeeper(s).id;
  return crew(s).filter((c) => c.alive && !c.dynasty && c.id !== g && c.id !== s.playerId && !c.imprisonedUntil && !c.outside);
}

/** A tip, out on the clock today. */
function tip(s: GameState, sourceId: string, truth: Tip['truth'], kind: Tip['kind'] = 'raid'): Tip {
  const biz = s.businesses.find((b) => b.owner === 'player');
  const t = seedThreat(s, truth === 'false' ? undefined : { kind, by: 'police', bizId: biz?.id, due: s.week + 1 }, { kind, by: 'police', bizId: biz?.id }, sourceId, truth, s.week + 1)!;
  delete t.rel;
  t.dueDay = 3;
  t.hour = 23;
  t.deadline = s.week;
  return t;
}

describe("the Don's daily brief", () => {
  it('is one stamped page with every section, and every line goes somewhere', () => {
    const s = game();
    const b = dailyBrief(s);
    expect(b.stamp).toBe('EYES ONLY · THE DON');
    expect(b.low).toBe(false);
    expect(b.situation.length).toBeGreaterThan(0);
    expect(b.threats.length).toBeGreaterThan(0);
    expect(b.money[0].text).toMatch(/Family money/);
    expect(b.people.length).toBeGreaterThan(0);
    expect(b.recommended.length).toBeLessThanOrEqual(3);
    for (const l of [...b.situation, ...b.money, ...b.people.filter((p) => p.id !== 'p:none')]) expect(l.go, l.text).toBeTruthy();
    for (const r of b.recommended) { expect(r.why.length).toBeGreaterThan(5); expect(r.go).toBeTruthy(); }
  });

  it('marks each threat confirmed, likely or rumor by its source, and can be wrong when the source is bad', () => {
    const s = game('plan-conf');
    const ub = holder(s, 'underboss')!;
    // A loyal underboss passing on a planted story, and the night clerk with the real thing.
    ensureThreats(s);
    s.relations[`${ub.id}>${s.playerId}`] = { from: ub.id, to: s.playerId, modifiers: [{ reason: 'Loyal', value: 80, decay: 0 } as never], fear: 0, trust: 80, grievance: 0 };
    ub.attributes.intrigue = 90;
    const planted = tip(s, ub.id, 'false');
    const street = s.businesses.find((b) => b.owner === 'player' && ['motel', 'bar', 'restaurant', 'pizza', 'club', 'stand', 'arcade', 'boarding', 'laundromat', 'carlot'].includes(b.kind));
    const real = tip(s, street ? `biz:${street.id}` : 'nobody', 'solid', 'stakeout');
    const a = tipConfidence(s, planted);
    const b = tipConfidence(s, real);
    expect(sourceGrade(s, planted).grade).toMatch(/[AB]/);
    expect(a.est).toBeGreaterThan(b.est);
    // The planted story reads as more than a rumor: the brief is wrong, because the source looked good.
    expect(a.conf).not.toBe('rumor');
    const brief = dailyBrief(s);
    const line = brief.threats.find((l) => l.id === `thr:${planted.id}`)!;
    expect(line.conf).toBe(a.conf);
    expect(line.src).toMatch(/^[AB] · /);
    expect(line.go?.tip).toBe(planted.id);
    // A second source on the same claim makes it surer.
    const before = tipConfidence(s, real).est;
    const t2 = tip(s, ub.id, 'solid', 'stakeout');
    void t2;
    expect(tipConfidence(s, real).est).toBeGreaterThan(before);
    expect(tipConfidence(s, real).corroborated).toBe(true);
  });

  it('below the chair, the capo hands over a scaled-down brief', () => {
    const s = game('plan-low', 'associate');
    const b = dailyBrief(s);
    expect(b.low).toBe(true);
    expect(b.stamp).toMatch(/FROM THE CAPO/);
    expect(b.audience.total).toBe(0);
    expect(b.from).toMatch(/capo/i);
  });

  it('opens once a day, and recommends with reasons; the old man picks the first', () => {
    let s = game('plan-old');
    expect(briefDue(s)).toBe(true);
    s = markBrief(s, absDay(s));
    expect(briefDue(s)).toBe(false);
    const ub = holder(s, 'underboss')!;
    const t = tip(s, ub.id, 'solid');
    t.status = 'waiting';
    const recs = recommendations(s);
    expect(recs[0].go.tip).toBe(t.id);
    const om = oldManPick(s);
    expect(om.rec?.id).toBe(recs[0].id);
    expect(om.voice).toMatch(/old man/);
  });
});

describe('requests for an audience', () => {
  it('ranks by closeness, desperation and money, with the reasons', () => {
    const s = game('aud1');
    const [a, b] = men(s);
    const close0 = closeness(s, b).v;
    b.dynasty = true;
    expect(closeness(s, b).v).toBeGreaterThan(close0);
    expect(closeness(s, b).why.join()).toMatch(/Blood/);
    const d0 = desperation(s, a, 'decision', false).v;
    a.debtTo = { rival: s.rivals.find((r) => r.kind === 'mob')!.id, amount: 2500, week: s.week };
    const d1 = desperation(s, a, 'decision', false);
    expect(d1.v).toBeGreaterThan(d0);
    expect(d1.why.join()).toMatch(/shylock/);
    // Money: the ask itself.
    const ev = buildAsk(s, { id: 'dkx', d: 'askLoan', a: a.id, n: 4000, p: 50, w: s.week })!;
    s.pendingEvents = [ev];
    expect(moneyPart(s, { event: ev.iid }).v).toBeGreaterThan(50);
    const reqs = audienceRequests(s);
    const r = reqs.find((x) => x.charId === a.id)!;
    expect(r).toBeTruthy();
    expect(r.base).toBe(Math.round(0.4 * r.close.v + 0.35 * r.desp.v + 0.25 * r.money.v));
    for (let i = 1; i < reqs.length; i++) expect(reqs[i - 1].score).toBeGreaterThanOrEqual(reqs[i].score);
  });

  it("shows the gatekeeper's bias: friends up, rivals buried, an envelope moves a man up", () => {
    const s = game('aud2');
    const g = gatekeeper(s);
    expect(g.id).toBeTruthy();
    const [a, b, c] = men(s);
    setTie(s, g.id!, a.id, 'friend', 'Grew up on the same block');
    setTie(s, g.id!, b.id, 'feud', 'An old business');
    expect(gateBias(s, g, a, 0)[0]).toMatchObject({ kind: 'friend', v: BIAS_FRIEND });
    expect(gateBias(s, g, b, 0)[0]).toMatchObject({ kind: 'rival', v: BIAS_RIVAL });
    // The envelope: a greedy gatekeeper, a man with money and trouble.
    s.characters[g.id!].traits = [...s.characters[g.id!].traits, 'Greedy'];
    c.wealth = 6000;
    let bribed = 0;
    for (let w = 1; w <= 12; w++) { s.week = w; if (gateBias(s, g, c, 60).some((x) => x.kind === 'bribe' && x.v === BIAS_BRIBE && (x.amount ?? 0) >= 100)) bribed++; }
    expect(bribed).toBeGreaterThan(0);
    expect(bribed).toBeLessThan(12);
  });

  it('the bias moves the order against the fair rank', () => {
    const s = game('aud3');
    const g = gatekeeper(s);
    const [a, b] = men(s);
    s.pendingEvents = [buildAsk(s, { id: 'k1', d: 'askFavor', a: a.id, n: 300, p: 50, w: s.week })!, buildAsk(s, { id: 'k2', d: 'askFavor', a: b.id, n: 300, p: 50, w: s.week })!];
    setTie(s, g.id!, b.id, 'feud', 'Bad blood');
    const r = audienceRequests(s).find((x) => x.charId === b.id)!;
    expect(r.score).toBe(Math.max(0, r.base + BIAS_RIVAL));
    expect(r.bias[0].text).toMatch(/buried/);
  });

  it('a man turned away reacts, and a man turned away again and again escalates', () => {
    let s = game('aud4');
    const [a] = men(s);
    s.pendingEvents = [buildAsk(s, { id: 'k1', d: 'askFavor', a: a.id, n: 300, p: 50, w: s.week })!];
    const before = opinion(s, a.id, s.playerId);
    const r = audienceRequests(s).find((x) => x.charId === a.id)!;
    const out = turnAway(s, r);
    expect(out.result.ok).toBe(true);
    s = out.state;
    expect(opinion(s, a.id, s.playerId)).toBeLessThan(before);
    expect(plannerOf(s).refused[a.id]).toBe(1);
    expect(audienceRequests(s).some((x) => x.charId === a.id)).toBe(false);
    expect(s.pendingEvents.length).toBe(1);
    expect(s.journal!.e.some((e) => e.t.startsWith('You turned') && e.p?.includes(a.id))).toBe(true);
    // Twice: a grudge. Three times: something stupid.
    for (let i = 0; i < 2; i++) {
      s.week++;
      const again = audienceRequests(s).find((x) => x.charId === a.id)!;
      s = turnAway(s, again).state;
    }
    const c = s.characters[a.id];
    expect(plannerOf(s).refused[a.id]).toBe(3);
    const escalated = !!c.courtedBy || (c.skimmed ?? 0) > 0 || (ensureDeeds(s).asks.some((k) => k.a === a.id && k.d === 'insult'));
    expect(escalated).toBe(true);
  });

  it('giving a man an hour books it in the datebook with its hours', () => {
    const s = game('aud5');
    const [a] = men(s);
    s.pendingEvents = [buildAsk(s, { id: 'k1', d: 'askFavor', a: a.id, n: 300, p: 50, w: s.week })!];
    const r = audienceRequests(s).find((x) => x.charId === a.id)!;
    const free = freeOn(s, s.week * 7 + 2);
    const g = grantAudience(s, r, { w: s.week, d: 2, h: 15 });
    expect(g.result.ok).toBe(true);
    expect(freeOn(g.state, s.week * 7 + 2)).toBe(free - 1);
    expect(dayEntries(g.state, s.week, 2).some((e) => e.kind === 'audience' && e.who === a.id && e.h === 15)).toBe(true);
    expect(audienceRequests(g.state).find((x) => x.charId === a.id)!.booked).toBeTruthy();
  });
});

describe('the datebook', () => {
  it('shows what is on the clock: a phone meet, the envelope and the Sit-Down, an evening, a known threat with its countdown', () => {
    const s = game('book1');
    const k = capos(s)[0];
    scheduleInto(s, { kind: 'meet', day: 2, hour: 21, payload: { who: k.id, place: 'diner', purpose: 'meet' } });
    const ub = holder(s, 'underboss')!;
    const t = tip(s, ub.id, 'solid');
    const mon = dayEntries(s, s.week, 0);
    expect(mon.some((e) => e.kind === 'envelope')).toBe(true);
    expect(mon.some((e) => e.kind === 'sitdown')).toBe(true);
    const wed = dayEntries(s, s.week, 2);
    expect(wed.some((e) => e.kind === 'meet' && e.who === k.id && e.h === 21 && e.move && e.cancel)).toBe(true);
    const thu = dayEntries(s, s.week, 3);
    const th = thu.find((e) => e.kind === 'threat')!;
    expect(th.id).toBe(`tip:${t.id}`);
    expect(th.count).toBe('in 3 days');
    expect(th.conf).toBeTruthy();
    const week = weekPage(s, s.week);
    expect(week.days.length).toBe(7);
    expect(week.days.some((d) => d.entries.some((e) => e.kind === 'evening'))).toBe(true);
    expect(week.left).toBeGreaterThan(0);
  });

  it('says when two things on a day clash', () => {
    const s = game('book-clash');
    const day = weekPage(s, s.week).days.find((p) => p.d > 0 && p.entries.some((e) => e.kind === 'evening'))!;
    scheduleInto(s, { kind: 'meet', day: day.d, hour: 21, payload: { who: capos(s)[0].id, place: 'diner', purpose: 'meet' } });
    const es = dayEntries(s, s.week, day.d);
    expect(es.find((e) => e.kind === 'meet')!.clash).toBeTruthy();
    expect(es.find((e) => e.kind === 'evening')!.clash).toMatch(/Meet/);
  });

  it('a threat nobody warned him about stays off the book', () => {
    const s = game('book2');
    const T = ensureThreats(s);
    T.threats.push({ id: 'thx', kind: 'raid', by: 'police', start: s.week, due: s.week, blunt: 0, dueDay: 2, hour: 22 });
    expect(dayEntries(s, s.week, 2).some((e) => e.kind === 'threat')).toBe(false);
  });

  it('a meet planned from a slot goes through the phone and lands on the page; moving and cancelling give the hours back', () => {
    let s = game('book3');
    const k = capos(s)[0];
    const r = dial(s, { who: k.id, purpose: 'meet', place: 'church', w: s.week, d: 3, hour: 15 });
    expect(r.result.ok).toBe(true);
    s = r.state;
    const e = dayEntries(s, s.week, 3).find((x) => x.kind === 'meet')!;
    expect(e.title).toMatch(k.firstName);
    // A dinner on Friday: its hours are booked; moved to Saturday they move; cancelled they come back.
    const fri = s.week * 7 + 4;
    const sat = s.week * 7 + 5;
    const f0 = freeOn(s, fri);
    s = planWith(s, 'dinner', k.id, { w: s.week, d: 4, h: 19 }).state;
    expect(freeOn(s, fri)).toBe(f0 - 3);
    const din = dayEntries(s, s.week, 4).find((x) => x.kind === 'dinner')!;
    s = moveEntry(s, din, { w: s.week, d: 5, h: 19 });
    expect(freeOn(s, fri)).toBe(f0);
    expect(freeOn(s, sat)).toBe(f0 - 3);
    const moved = dayEntries(s, s.week, 5).find((x) => x.kind === 'dinner')!;
    s = cancelEntry(s, moved);
    expect(freeOn(s, sat)).toBe(f0);
    expect(dayEntries(s, s.week, 5).some((x) => x.kind === 'dinner')).toBe(false);
  });

  it('when the day comes, a plan is ticked done with one line in Your File', () => {
    let s = game('book4');
    s.days = { week: s.week, day: 0, answers: {}, skipped: [] };
    const k = capos(s)[0];
    const op0 = opinion(s, k.id, s.playerId);
    s = planWith(s, 'dinner', k.id, { w: s.week, d: 1, h: 19 }).state;
    s = advanceDay(s).state;
    const done = dayEntries(s, s.week, 1).find((e) => e.kind === 'done')!;
    expect(done).toBeTruthy();
    expect(done.done!.r).toMatch(/Dinner/);
    expect(s.journal!.e.some((e) => e.id === done.done!.jid)).toBe(true);
    expect(opinion(s, k.id, s.playerId)).toBeGreaterThan(op0);
    const page = dayPage(s, s.week, 1);
    expect(page.today).toBe(true);
  });

  it('keeps margin notes, and has a month view', () => {
    let s = game('book5');
    s = setNote(s, absDay(s), 'Call the lawyer about Sal.');
    expect(dayPage(s, s.week, 0).note).toBe('Call the lawyer about Sal.');
    const m = monthPage(s, s.date.y, s.date.m);
    expect(m.cells.length).toBeGreaterThanOrEqual(28);
    expect(m.cells.some((c) => c.today)).toBe(true);
  });
});

describe('the black book and standing orders', () => {
  it('has everyone he knows, by group, with mood, favors both ways and the phone', () => {
    const s = game('bb1');
    const D = ensureDeeds(s);
    const ub = holder(s, 'underboss')!;
    D.owed.push({ by: ub.id, to: s.playerId, w: s.week, y: 'The boss came through' });
    const book = blackBook(s);
    const u = book.find((c) => c.id === ub.id)!;
    expect(u.group).toBe('men');
    expect(u.owesMe.length).toBe(1);
    expect(u.phone?.purposes).toContain('meet');
    expect(typeof u.mood).toBe('number');
    expect(book.some((c) => c.group === 'rivals')).toBe(true);
    expect(book.some((c) => c.group === 'family')).toBe(true);
    expect(book.some((c) => c.id === s.playerId)).toBe(false);
    expect(favorsLedger(s).owed[0].c.id).toBe(ub.id);
    void player;
  });

  it('lists every policy in one place, and each row writes to the system that owns it', () => {
    let s = game('so1');
    const so = standingOrders(s);
    expect(so.domains.length).toBeGreaterThan(5);
    expect(so.edicts.map((e) => e.id)).toContain('nojunk');
    expect(so.split.personal).toBeGreaterThan(0);
    const d = so.domains[0];
    const other = d.level === 'handle' ? 'ask' : 'handle';
    s = setLevel(s, d.id, other);
    expect(standingOrders(s).domains[0].level).toBe(other);
    const o = splitOrder(s, 30) as { op: { split: { personal: number; treasury: number; reserve: number } } };
    expect(o.op.split.personal + o.op.split.treasury + o.op.split.reserve).toBe(10000);
    expect(o.op.split.personal).toBe(3000);
    expect(edictOrder('nojunk', true)).toEqual({ kind: 'edict', edict: 'nojunk', on: true });
  });
});

describe('the planner in the save', () => {
  it('round-trips through a save, and an old save is topped up', () => {
    let s = game('save1');
    s = setNote(s, absDay(s) + 1, 'Sunday: the christening.');
    const [a] = men(s);
    s.pendingEvents = [buildAsk(s, { id: 'k1', d: 'askFavor', a: a.id, n: 300, p: 50, w: s.week })!];
    s = turnAway(s, audienceRequests(s).find((x) => x.charId === a.id)!).state;
    const back = upgradeSave(JSON.parse(JSON.stringify(s)) as GameState);
    expect(plannerOf(back).notes[String(absDay(s) + 1)]).toBe('Sunday: the christening.');
    expect(plannerOf(back).refused[a.id]).toBe(1);
    // An old save with a partial record gets the rest.
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    old.planner = { v: 1 } as never;
    const up = upgradeSave(old);
    expect(up.planner!.done).toEqual([]);
    expect(up.planner!.auto).toBe(true);
    // A save with no planner stays without one until it is used.
    const none = JSON.parse(JSON.stringify(s)) as GameState;
    delete none.planner;
    expect(upgradeSave(none).planner).toBeUndefined();
    expect(ensurePlanner(none).turned).toEqual({});
  });
});

// ---- The pages render (ui/planner) ----
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { BriefFolder } from '../src/ui/planner/BriefFolder';
import { AudienceList } from '../src/ui/planner/AudienceList';
import { Datebook } from '../src/ui/planner/Datebook';
import { BlackBook } from '../src/ui/planner/BlackBook';
import { StandingOrders } from '../src/ui/planner/StandingOrders';
import { PlannerButton } from '../src/ui/planner/PlannerHost';

describe('the planner pages render', () => {
  it('the folder, the list, the datebook, the black book and the orders', () => {
    const s = game('ui1');
    const [a] = men(s);
    s.pendingEvents = [buildAsk(s, { id: 'k1', d: 'askFavor', a: a.id, n: 300, p: 50, w: s.week })!];
    const noop = () => {};
    const brief = renderToString(createElement(BriefFolder, { s, b: dailyBrief(s), old: oldManPick(s), onGo: noop, onOld: noop }));
    expect(brief).toContain('EYES ONLY · THE DON');
    expect(brief).toContain('data-testid="brief-recommended"');
    expect(brief).toContain('data-testid="old-man"');
    const reqs = audienceRequests(s);
    const aud = renderToString(createElement(AudienceList, { s, reqs, keeper: gatekeeper(s), onGrant: noop, onTurn: noop, onChar: noop }));
    expect(aud).toContain('data-testid="aud-row-0"');
    expect(aud).toContain('Give him an hour');
    const book = renderToString(createElement(Datebook, { s, reqs, api: { onGo: noop, onPhone: noop, onPlan: noop, onEvening: noop, onGrant: noop, onMove: noop, onCancel: noop, onNote: noop } }));
    expect(book).toContain('data-testid="book-day"');
    expect(book).toContain('data-testid="book-week"');
    expect(book).toContain('The envelope');
    const bb = renderToString(createElement(BlackBook, { s, onChar: noop, onPhone: noop, onOrder: noop }));
    expect(bb).toContain('data-testid="bb-card"');
    expect(bb).toContain('Cops &amp; politicians');
    const so = renderToString(createElement(StandingOrders, { s, act: noop, onOrder: noop }));
    expect(so).toContain('Who handles what');
    expect(so).toContain('No Junk in Wildwood');
    expect(renderToString(createElement(PlannerButton, { s, onOpen: noop }))).toContain('planner-dot');
  });
});
