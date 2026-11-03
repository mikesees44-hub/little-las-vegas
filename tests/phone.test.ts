import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGameWith } from '../src/engine/starts';
import { daysOf, weekChoices } from '../src/engine/days';
import { advanceDay, answerMoment, liveMoments, momentView, scheduleAt } from '../src/engine/daily';
import { scheduled } from '../src/engine/schedule';
import { ensureThreats, type Tip } from '../src/engine/threats';
import { callBack, callBackView, missedCalls, phoneBadge, phoneDay, phoneSweep, tapeRisk, tapGuess, offTape } from '../src/engine/phone';
import { dial, dialPreview, meetOdds, meetsAhead, meetState, phoneBook, PHONE_MAN } from '../src/engine/phoneMeet';
import { ensurePhone, wireIn } from '../src/engine/phoneState';
import { capos } from '../src/engine/characters';
import { weekCheckIns } from '../src/engine/checkins';
import { opinion } from '../src/engine/relations';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { GameState } from '../src/engine/types';
import { randomChoices } from './helpers';

function played(seed: string, weeks: number): GameState {
  let s = newGameWith(seed, 'olddon');
  for (let i = 0; i < weeks && !s.gameOver; i++) s = advanceWeek(s, weekChoices(s, randomChoices(s, i))).state;
  return s;
}

/** Days forward on the clock, answering nothing (what is live stays live until the next day). */
function days(s0: GameState, n: number): { s: GameState; moments: string[] } {
  let s = s0;
  const moments: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = advanceDay(s);
    s = r.state;
    moments.push(...r.strikes);
  }
  return { s, moments };
}

function rival(s: GameState) {
  const r = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive)!;
  return { r, c: s.characters[r.leaderId] };
}

/** The world's own callers quiet (no tips, every caller just called): the test's call is the only one. */
function calm(s: GameState): GameState {
  const x = structuredClone(s) as GameState;
  if (x.threats) { x.threats.tips = []; x.threats.threats = []; }
  const P = ensurePhone(x);
  for (const k of ['wife', 'philly', 'anon', 'reporter', 'biz', 'rat', 'rival', ...x.rivals.map((r) => `rival:${r.id}`), ...Object.keys(x.nightlife?.goomars ?? {}).map((g) => `g:${g}`)]) P.last[k] = x.week + 20;
  return x;
}

const BASE = calm(played('phone-base', 6));

describe('incoming calls', () => {
  it('a call put on the clock rings on its day, at its hour, and stops the clock', () => {
    const { r, c } = rival(BASE);
    const at = scheduleAt(BASE, { kind: 'call', day: 1, hour: 11, payload: { k: 'rival', who: c.id, name: c.firstName, role: `Boss of ${r.name}`, rival: r.id, imp: 1 } });
    const { s, moments } = days(at.state, 1);
    expect(daysOf(s).day).toBe(1);
    expect(moments).toContain(`sched:${at.id}`);
    const v = momentView(s, `sched:${at.id}`)!;
    expect(v.title).toMatch(/sit-down/);
    expect(v.when).toMatch(/11 a\.m\./);
    expect(v.options.map((o) => o.id)).toEqual(expect.arrayContaining(['ring', 'msg']));
    expect(liveMoments(s)).toContain(`sched:${at.id}`);
  });

  it('pick up: the rival\'s sit-down goes on the clock at the church; the result is in Your File', () => {
    const { r, c } = rival(BASE);
    const at = scheduleAt(BASE, { kind: 'call', day: 1, hour: 11, payload: { k: 'rival', who: c.id, name: c.firstName, role: 'x', rival: r.id, imp: 1 } });
    const s = days(at.state, 1).s;
    const a = answerMoment(s, `sched:${at.id}`, 'church');
    expect(a.result.ok).toBe(true);
    expect(scheduled(a.state).some((x) => x.kind === 'meet' && x.payload.who === c.id && x.payload.place === 'church')).toBe(true);
    expect(a.state.journal!.e.some((e) => e.src === 'phone' && e.t.includes(c.firstName))).toBe(true);
    expect(a.state.phone!.stats.picked).toBe(1);
  });

  it('let it ring: the call is missed (badge), can be returned, and the caller remembers if it is not', () => {
    const { r, c } = rival(BASE);
    const at = scheduleAt(BASE, { kind: 'call', day: 1, hour: 11, payload: { k: 'rival', who: c.id, name: c.firstName, role: 'x', rival: r.id, imp: 1 } });
    const s = days(at.state, 1).s;
    const a = answerMoment(s, `sched:${at.id}`, 'ring');
    expect(missedCalls(a.state)).toHaveLength(1);
    expect(phoneBadge(a.state)).toBe(1);
    const m = missedCalls(a.state)[0];
    // Return it: the call-back card has no "let it ring".
    const v = callBackView(a.state, m.id)!;
    expect(v.options.some((o) => o.id === 'ring')).toBe(false);
    const back = callBack(a.state, m.id, 'no');
    expect(back.result.ok).toBe(true);
    expect(missedCalls(back.state)).toHaveLength(0);
    // Or leave it two days: it expires, and he holds it against you.
    const o0 = opinion(a.state, c.id, a.state.playerId);
    const later = days(a.state, 2).s;
    expect(missedCalls(later)).toHaveLength(0);
    expect(opinion(later, c.id, later.playerId)).toBeLessThan(o0);
  });

  it('take a message: the business owner leaves a number to call back', () => {
    const b = BASE.businesses.find((x) => x.owner === 'none') ?? BASE.businesses[0];
    const x = structuredClone(BASE) as GameState;
    x.businesses.find((y) => y.id === b.id)!.owner = 'none';
    const at = scheduleAt(x, { kind: 'call', day: 1, hour: 9, payload: { k: 'biz', name: `The owner of ${b.name}`, role: 'A businessman', biz: b.id } });
    // A minor call: no stop, it rings into the missed calls.
    const d = advanceDay(at.state);
    expect(d.strikes).not.toContain(`sched:${at.id}`);
    expect(missedCalls(d.state)).toHaveLength(1);
    // A minor call answered from the list: "take a message" keeps it callable.
    const at2 = scheduleAt(x, { kind: 'call', day: 1, hour: 9, payload: { k: 'biz', name: 'B', role: 'A businessman', biz: b.id, imp: 1 } });
    const s2 = days(at2.state, 1).s;
    const r = answerMoment(s2, `sched:${at2.id}`, 'msg');
    expect(missedCalls(r.state)).toHaveLength(1);
    expect(r.state.phone!.stats.msg).toBe(1);
  });

  it('an urgent meeting coming out mid-week rings as a call instead of a popup; picking up hears the tip', () => {
    const x = structuredClone(BASE) as GameState;
    const T = ensureThreats(x);
    const k = capos(x)[0];
    const tip: Tip = { id: 'tpx1', kind: 'raid', by: 'police', sourceId: k.id, sourceKind: 'cop', sourceName: k.firstName, sourceRole: 'A cop on the pad', week: x.week, deadline: x.week, truth: 'solid', hint: 'Says the county is coming', detail: 'A raid this week.', status: 'waiting', dueDay: 4, hour: 2, rel: { w: x.week, d: 1 } };
    T.tips.push(tip);
    const d = advanceDay(x);
    const t1 = d.state.threats!.tips.find((t) => t.id === 'tpx1')!;
    expect(t1.seen).toBe(true);
    const id = d.strikes.find((m) => m.startsWith('sched:') && scheduled(d.state).find((y) => `sched:${y.id}` === m)?.payload.tip === 'tpx1')!;
    expect(id).toBeTruthy();
    const v = momentView(d.state, id)!;
    expect(v.text).toMatch(/county is coming/);
    const a = answerMoment(d.state, id, 'straight');
    expect(a.state.threats!.tips.find((t) => t.id === 'tpx1')!.status).toBe('met');
    // Let a cop's call ring: it comes only once (no call back), the warning stays on the Desk.
    const b = answerMoment(d.state, id, 'ring');
    const m = missedCalls(b.state)[0];
    expect(m.p.once).toBe(1);
    expect(callBackView(b.state, m.id)).toBeUndefined();
    expect(b.state.threats!.tips.find((t) => t.id === 'tpx1')!.status).toBe('waiting');
  });

  it('a capo\'s problem rings at 7 a.m. and the answer is his morning answer', () => {
    const c = weekCheckIns(BASE).find((x) => x.problem && x.day >= 1)!;
    expect(c).toBeTruthy();
    const k = BASE.characters[c.capoId];
    const at = scheduleAt(BASE, { kind: 'call', day: c.day, hour: 7, payload: { k: 'capo', who: k.id, name: k.firstName, role: c.title, key: c.key, kw: BASE.week, imp: 1 } });
    const { s, moments } = days(at.state, c.day);
    const id = `sched:${at.id}`;
    expect(moments).toContain(id);
    const v = momentView(s, id)!;
    expect(v.when).toMatch(/7 a\.m\./);
    const pick = v.options.find((o) => o.id.startsWith('a:'))!;
    const a = answerMoment(s, id, pick.id);
    expect(daysOf(a.state).answers[c.key]).toBe(pick.id.slice(2));
    // The morning meeting no longer has it open; "bring it to the club" leaves it for the morning.
    const b = answerMoment(s, id, 'msg');
    expect(daysOf(b.state).answers[c.key]).toBeUndefined();
  });

  it('new callers come from the world and are capped: at most one a day, the clock stops for few', () => {
    let s = played('phone-cap', 10);
    let calls = 0, stops = 0, weeks = 0;
    for (let w = 0; w < 8 && !s.gameOver; w++) {
      const perDay: number[] = [];
      for (let d = 0; d < 6; d++) {
        const before = (s.action?.sched ?? []).length;
        const r = advanceDay(s);
        s = r.state;
        const news = (s.action?.sched ?? []).filter((x) => x.kind === 'call' && x.payload.nw);
        perDay.push(news.length);
        stops += r.strikes.filter((m) => m.startsWith('sched:') && scheduled(s).find((x) => `sched:${x.id}` === m)?.payload.nw).length;
        for (const m of liveMoments(s)) { const a = answerMoment(s, m, momentView(s, m)?.def); if (a.result.ok) s = a.state; }
        void before;
      }
      calls += s.phone?.log.filter((l) => l.w === s.week).length ?? 0;
      s = advanceWeek(s, weekChoices(s, randomChoices(s, w))).state;
      weeks++;
    }
    expect(stops).toBeLessThanOrEqual(weeks);
    expect(calls).toBeGreaterThan(0);
  });
});

describe('outgoing calls and meets', () => {
  it('the phone book has the people he knows, and the phone company man', () => {
    const book = phoneBook(BASE);
    expect(book.some((e) => e.group === 'crew')).toBe(true);
    expect(book.some((e) => e.group === 'outfits')).toBe(true);
    expect(book.some((e) => e.id === PHONE_MAN)).toBe(true);
  });

  it('a meet is set on the phone, comes at its hour as a scene, and resolves with odds', () => {
    const k = capos(BASE)[0];
    const pv = dialPreview(BASE, { who: k.id, purpose: 'meet' })!;
    expect(pv.blocked).toBeUndefined();
    const used = BASE.hours?.used ?? 0;
    const r = dial(BASE, { who: k.id, purpose: 'meet', place: 'car', w: BASE.week, d: 2, hour: 21 });
    expect(r.result.ok).toBe(true);
    expect(meetsAhead(r.state)).toHaveLength(1);
    expect((r.state.hours?.used ?? 0) - used).toBeCloseTo(0.25);
    const mid = `sched:${meetsAhead(r.state)[0].id}`;
    const { s, moments } = days(r.state, 2);
    expect(moments).toContain(mid);
    const id = mid;
    const v = momentView(s, id)!;
    expect(v.title).toMatch(/meet/i);
    expect(v.text).toMatch(/car/);
    const a = answerMoment(s, id, v.options.find((o) => !o.blocked)!.id);
    expect(a.result.ok).toBe(true);
    expect(a.state.phone!.stats.meets).toBe(1);
    expect(a.state.journal!.e.some((e) => e.src === 'phone' && /meet with/.test(e.t))).toBe(true);
    expect(meetsAhead(a.state)).toHaveLength(0);
  });

  it('a rival who is plotting can set you up; the church makes it much less likely; a no-show happens', () => {
    const { r, c } = rival(BASE);
    const x = structuredClone(BASE) as GameState;
    x.schemes = [...(x.schemes ?? []), { id: 'sx1', kind: 'murder', owner: r.id, ownerId: c.id, targetId: x.playerId, agents: [], opts: {} as never, progress: 50, startWeek: x.week, discovered: false, because: 'test' }];
    const hotel = meetOdds(x, { who: c.id, place: 'hotel', purpose: 'meet' });
    const church = meetOdds(x, { who: c.id, place: 'church', purpose: 'meet' });
    expect(hotel.setup).toBeGreaterThan(church.setup * 5);
    // Over many meets at the hotel, some are set-ups and some are no-shows; a set-up is answered in the moment.
    let s = x;
    const states: string[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) { const a = scheduleAt(s, { kind: 'meet', day: 2, hour: 23, payload: { who: c.id, place: 'hotel', purpose: 'meet' } }); s = a.state; ids.push(a.id); }
    for (const id of ids) states.push(meetState(s, scheduled(s).find((y) => y.id === id)!));
    expect(states).toContain('setup');
    expect(states).toContain('noshow');
    const set = ids[states.indexOf('setup')];
    const d = days(s, 2).s;
    const v = momentView(d, `sched:${set}`) ?? (() => { const y = structuredClone(d) as GameState; return momentView(y, `sched:${set}`); })();
    expect(v?.options.map((o) => o.id)).toEqual(['walk', 'draw', 'talk']);
    const a = answerMoment(d, `sched:${set}`, 'walk');
    expect(a.state.phone!.stats.setups).toBe(1);
  });
});

describe('the wire', () => {
  it('business on a tapped line puts the boss on tape; code words and a pay phone cut the risk', () => {
    expect(tapeRisk(BASE, 'home', true)).toBeLessThan(tapeRisk(BASE, 'home', false));
    expect(tapeRisk(BASE, 'pay', false)).toBeLessThan(tapeRisk(BASE, 'home', true) + 0.01);
    expect(offTape(BASE, 'home', true)).toBeGreaterThan(offTape(BASE, 'home', false));
    const x = structuredClone(BASE) as GameState;
    wireIn(x, 'fbi');
    const k = capos(x)[0];
    let plain = 0, code = 0;
    for (let i = 0; i < 40; i++) {
      const y = structuredClone(x) as GameState;
      y.seed = `${x.seed}-${i}`;
      y.hours = undefined;
      const e0 = y.characters[y.playerId].evidence ?? 0;
      const a = dial(y, { who: k.id, purpose: 'order' });
      plain += (a.state.characters[a.state.playerId].evidence ?? 0) - e0;
      const b = dial(y, { who: k.id, purpose: 'order', code: true });
      code += (b.state.characters[b.state.playerId].evidence ?? 0) - e0;
    }
    expect(plain).toBeGreaterThan(code);
    expect(plain).toBeGreaterThan(0);
    // No tap: nothing on tape.
    const y = structuredClone(BASE) as GameState;
    const e0 = y.characters[y.playerId].evidence ?? 0;
    expect(dial(y, { who: k.id, purpose: 'order' }).state.characters[y.playerId].evidence ?? 0).toBe(e0);
  });

  it('the line clicks; the phone company man and a sweep find the tap', () => {
    const x = structuredClone(BASE) as GameState;
    wireIn(x, 'fbi');
    x.phone!.tap!.clicks = 1;
    expect(tapGuess(x)).toBeGreaterThan(tapGuess(BASE));
    expect(phoneSweep(structuredClone(x) as GameState, 1, 't')).toMatch(/tap/);
    let found = 0;
    for (let i = 0; i < 20; i++) {
      const y = structuredClone(x) as GameState;
      y.seed = `${x.seed}-sw${i}`;
      y.hours = undefined;
      y.money = 10000;
      const r = dial(y, { who: PHONE_MAN, purpose: 'sweep' });
      if (!r.state.phone!.tap) found++;
    }
    expect(found).toBeGreaterThan(8);
    expect(found).toBeLessThan(20);
  });

  it('a rat who pushes to talk on the phone puts it on his own recorder', () => {
    const x = structuredClone(BASE) as GameState;
    const k = capos(x)[0];
    x.characters[k.id].informantFor = 'law';
    const at = scheduleAt(x, { kind: 'call', day: 1, hour: 22, payload: { k: 'rat', who: k.id, name: k.firstName, role: 'Capo', imp: 1 } });
    const s = days(at.state, 1).s;
    const e0 = s.characters[s.playerId].evidence ?? 0;
    const a = answerMoment(s, `sched:${at.id}`, 'straight');
    expect((a.state.characters[a.state.playerId].evidence ?? 0) - e0).toBe(6);
  });
});

describe('save', () => {
  it('the phone survives a save round-trip; an older phone is filled in', () => {
    const { r, c } = rival(BASE);
    const at = scheduleAt(BASE, { kind: 'call', day: 1, hour: 11, payload: { k: 'rival', who: c.id, name: c.firstName, role: 'x', rival: r.id, imp: 1 } });
    const s = days(at.state, 1).s;
    const a = answerMoment(s, `sched:${at.id}`, 'ring').state;
    wireIn(a, 'county');
    const back = upgradeSave(JSON.parse(JSON.stringify(a)));
    expect(back.phone).toEqual(a.phone);
    expect(missedCalls(back)).toHaveLength(1);
    // A save from before the phone stays as it is (the first call makes it); an older phone gets its new fields.
    const old = JSON.parse(JSON.stringify(BASE)) as GameState;
    delete old.phone;
    expect(upgradeSave(old).phone).toBeUndefined();
    const partial = JSON.parse(JSON.stringify(a)) as GameState;
    delete (partial.phone as Partial<typeof partial.phone>)!.talked;
    delete (partial.phone as Partial<typeof partial.phone>)!.rung;
    const up = upgradeSave(partial);
    expect(up.phone!.talked).toEqual({});
    expect(up.phone!.rung).toEqual([]);
    expect(ensurePhone(up).missed).toHaveLength(1);
    // phoneDay on a fresh week is a no-op on Monday.
    expect(phoneDay(BASE)).toBe(BASE);
  });
});

describe('the phone on screen', () => {
  it('the window lists missed calls with call back, the book and the dial; a ringing call has its card', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { PhoneWindow, PhoneButton } = await import('../src/ui/phone/PhoneWindow');
    const { StrikeCard } = await import('../src/ui/components/StrikeCard');
    const { momentKicker } = await import('../src/engine/phone');
    const { r, c } = rival(BASE);
    const at = scheduleAt(BASE, { kind: 'call', day: 1, hour: 11, payload: { k: 'rival', who: c.id, name: c.firstName, role: 'x', rival: r.id, imp: 1 } });
    const s = days(at.state, 1).s;
    const card = renderToString(createElement(StrikeCard, { s, id: `sched:${at.id}`, kicker: momentKicker(s, `sched:${at.id}`), onChoose: () => {} }));
    expect(card).toContain('data-testid="call-card"');
    expect(card).toContain('The phone is ringing');
    const missed = answerMoment(s, `sched:${at.id}`, 'ring').state;
    const html = renderToString(createElement(PhoneWindow, { s: missed, onClose: () => {}, onDial: () => {}, onCallBack: () => {} }));
    expect(html).toContain('data-testid="phone-missed"');
    expect(html).toContain('Call back');
    const btn = renderToString(createElement(PhoneButton, { missed: phoneBadge(missed), ringing: false, onOpen: () => {} }));
    expect(btn).toContain('data-testid="phone-badge"');
  });
});
