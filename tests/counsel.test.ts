import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { advisersFor } from '../src/engine/adviceBrief';
import { briefing } from '../src/engine/briefing';
import { CATALOG } from '../src/engine/catalog';
import { capos, crew } from '../src/engine/characters';
import { counsel, type Counsel, type CounselSubject } from '../src/engine/counsel';
import { jobSummary, targetsFor } from '../src/engine/dirtyWork';
import { fmtMoney } from '../src/engine/effects';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { recurringOfAll } from '../src/engine/recurring';
import { setModifier } from '../src/engine/relations';
import type { Choice, EventInstance, GameState, PlayerAction } from '../src/engine/types';
import { CounselPanel } from '../src/ui/advice/CounselTable';

const racket = (district?: string, runner?: string): CounselSubject => ({ kind: 'action', action: { kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind: 'numbers', ...(district ? { district } : {}), ...(runner ? { runner } : {}) } } } });
const dirty = (s: GameState): CounselSubject => ({ kind: 'action', action: { kind: 'dirty', op: { job: 'hijack', who: crew(s).find((c) => c.rank === 'soldier')!.id, target: targetsFor(s, 'hijack')[0]?.id } } });
const all = (c: Counsel) => [...c.voices, ...(c.options ?? []).flatMap((o) => o.voices)];
const texts = (c: Counsel) => all(c).flatMap((v) => [...v.pros, ...v.cons].map((p) => p.text));

/** A decision on the desk with real numbers in it (money, federal heat, a standing contract change, a rival). */
function withDecision(s: GameState): { s: GameState; ev: EventInstance } {
  const k = capos(s).find((c) => s.districts.some((d) => d.capoId === c.id))!;
  const rival = s.rivals.find((r) => r.kind === 'mob')!;
  const choices: Choice[] = [
    { id: 'pay', label: 'Pay him off', because: 'paid', effects: [{ type: 'money', amount: -1500 }, { type: 'heat', bar: 'federal', amount: 4 }] },
    { id: 'raise', label: 'Give him 35%', because: 'gave more', effects: [{ type: 'contract', charId: k.id, keep: 0.35 }, { type: 'opinion', from: k.id, to: s.playerId, amount: 8, reason: 'a raise' }] },
    { id: 'refuse', label: 'Refuse', because: 'refused', effects: [{ type: 'respect', amount: 2 }, { type: 'rivalOpinion', rival: rival.id, amount: -12, reason: 'refused' }] },
  ];
  const ev: EventInstance = { iid: 'test-ev-1', defId: 'test_decision', title: 'A test decision', text: 'Something needs deciding.', week: s.week, choices, defaultChoiceId: 'pay', actors: [k.id], meta: { charId: k.id }, priority: 5, mandatory: false } as unknown as EventInstance;
  s.pendingEvents = [...s.pendingEvents, ev];
  return { s, ev };
}

function subjects(s0: GameState): [string, CounselSubject, GameState][] {
  const { s } = withDecision(structuredClone(s0));
  const rival = s.rivals.find((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive)!;
  const it = briefing(s).items.find((x) => x.options.some((o) => o.action))!;
  const heirMan = capos(s)[0];
  return [
    ['racket start', racket(), s],
    ['dirty job', dirty(s), s],
    ['purchase', { kind: 'action', action: { kind: 'buyBusiness', biz: 'bar', district: s.districts[0].id } as PlayerAction }, s],
    ['talk with a rival', { kind: 'action', action: { kind: 'talk', op: { t: 'ask', talk: 'meeting', target: rival.leaderId } } }, s],
    ['appointment (seat)', { kind: 'seat', seat: 'bagman' }, s],
    ['appointment (capo)', { kind: 'capo', district: s.districts[0].id }, s],
    ['event decision', { kind: 'event', iid: 'test-ev-1' }, s],
    ['sit-down item', { kind: 'brief', itemId: it.id }, s],
    ['succession move', { kind: 'action', action: { kind: 'power', op: { op: 'designate', mode: 'named', charId: heirMan.id } } as PlayerAction }, s],
  ];
}

describe('The Table: every entry kind', () => {
  const s0 = newGame('counsel-1');
  for (const [name, sub, s] of subjects(s0)) {
    it(`${name}: every voice gives a verdict, 2–5 pros, 2–5 cons, each tagged; a summary and why it matters`, () => {
      const c = counsel(s, sub)!;
      expect(c, name).toBeTruthy();
      expect(c.voices.length).toBeGreaterThanOrEqual(2);
      expect(c.voices.map((v) => v.adviser.role)).toContain('underboss');
      expect(c.voices.map((v) => v.adviser.role)).toContain('consigliere');
      expect(c.summary.line.length).toBeGreaterThan(4);
      expect(c.why.length).toBeGreaterThan(20);
      for (const v of all(c)) {
        expect(['do', 'doBut', 'wait', 'dont']).toContain(v.verdict);
        expect(v.pros.length, `${name} ${v.adviser.role} pros`).toBeGreaterThanOrEqual(2);
        expect(v.pros.length).toBeLessThanOrEqual(5);
        expect(v.cons.length, `${name} ${v.adviser.role} cons`).toBeGreaterThanOrEqual(2);
        expect(v.cons.length).toBeLessThanOrEqual(5);
        for (const p of [...v.pros, ...v.cons]) { expect(['known', 'estimate', 'unknown']).toContain(p.k); expect(p.text.length).toBeGreaterThan(5); }
        expect(v.confidence).toBeGreaterThan(0);
        expect(v.confidence).toBeLessThanOrEqual(100);
        expect(v.says).toMatch(/^".+"$/);
        if (v.verdict === 'doBut') expect(v.but).toMatch(/^but /);
        if (v.verdict === 'wait' || v.verdict === 'dont') expect(v.instead?.length ?? 0).toBeGreaterThan(5);
      }
      // Retaliation is never certain.
      expect(JSON.stringify(c)).not.toMatch(/\bwill certainly\b|\b100%/);
      if (sub.kind === 'event' || sub.kind === 'brief' || sub.kind === 'seat' || sub.kind === 'capo') {
        expect(c.options!.length).toBeGreaterThanOrEqual(2);
        for (const o of c.options!) expect(o.voices.length).toBe(c.voices.length);
        expect(c.voices.every((v) => c.options!.some((o) => o.id === v.backs))).toBe(true);
        expect(c.summary.line).toMatch(/backs? “/);
      } else {
        expect(c.summary.line).toMatch(/for|wait|against/);
      }
    });
  }

  it('the capos the matter touches sit in: the capo of the racket\'s district, and the enforcer on dirty work', () => {
    const s = structuredClone(s0);
    const d = s.districts.find((x) => x.capoId)!;
    const c = counsel(s, racket(d.id))!;
    expect(c.voices.some((v) => v.adviser.role === 'capo' && v.adviser.charId === d.capoId)).toBe(true);
    const roles = advisersFor(s, dirty(s) as never).map((a) => a.role);
    expect(counsel(s, dirty(s))!.voices.map((v) => v.adviser.role)).toEqual(roles);
  });
});

describe('The Table: the numbers are the previews\' numbers', () => {
  it('a racket: the cost, who pays, what is left, the upkeep every week', () => {
    const s = newGame('counsel-num');
    const sub = racket();
    const a = (sub as { action: PlayerAction }).action;
    const p = previewAction(s, a);
    const t = texts(counsel(s, sub)!);
    expect(t).toContain(`${fmtMoney(p.cost)} from Family money: leaves ${fmtMoney(Math.round(s.money) - p.cost)}`);
    expect(t.some((x) => x.startsWith(`Upkeep ${fmtMoney(CATALOG.numbers.upkeep)} a week`))).toBe(true);
    // The take is his read, and marked so.
    const take = all(counsel(s, sub)!).flatMap((v) => v.pros).find((p) => /\/wk now/.test(p.text))!;
    expect(take.k).toBe('estimate');
  });

  it('a dirty job: the odds, the arrest chance and the heat are the job summary\'s', () => {
    const s = newGame('counsel-dirty');
    const sub = dirty(s);
    const a = (sub as { action: Extract<PlayerAction, { kind: 'dirty' }> }).action;
    const js = jobSummary(s, a.op.job, a.op.who, a.op.target);
    const t = texts(counsel(s, sub)!);
    expect(t.some((x) => x.includes(`${js.odds}% it goes clean`))).toBe(true);
    expect(t.some((x) => x.includes(`${js.arrest}% it ends in an arrest`))).toBe(true);
    expect(t.some((x) => x.includes(`It draws ${js.heat} heat`))).toBe(true);
    expect(t.some((x) => x.includes(`${fmtMoney(js.take[0])}–${fmtMoney(js.take[1])}`))).toBe(true);
  });

  it('a decision: money, federal heat and the recurring weekly change match the option\'s effects', () => {
    const { s, ev } = withDecision(newGame('counsel-ev'));
    const c = counsel(s, { kind: 'event', iid: ev.iid })!;
    const pay = c.options!.find((o) => o.id === 'pay')!;
    const pt = pay.voices.flatMap((v) => v.cons.map((p) => p.text));
    expect(pt).toContain(`${fmtMoney(1500)} from Family money: leaves ${fmtMoney(Math.round(s.money) - 1500)}`);
    expect(pt).toContain(`+4 federal heat (now ${Math.round(s.heat.federal)})`);
    const raise = c.options!.find((o) => o.id === 'raise')!;
    const rec = recurringOfAll(s, ev.choices[1].effects)[0];
    expect(raise.voices.flatMap((v) => [...v.pros, ...v.cons]).some((p) => p.text === rec.text && p.k === 'known')).toBe(true);
    const refuse = c.options!.find((o) => o.id === 'refuse')!;
    expect(refuse.voices.flatMap((v) => v.cons).some((p) => /^−12 with /.test(p.text))).toBe(true);
    expect(c.defaultLabel).toBe('Pay him off');
    expect(c.why).toMatch(/Pay him off/);
  });
});

describe('The Table: each man speaks from what he knows', () => {
  it('a capo reads another crew\'s man only as a guess; the underboss and consigliere know', () => {
    const s = newGame('counsel-know');
    const d = s.districts.find((x) => x.capoId)!;
    const k = s.characters[d.capoId!]!;
    const other = crew(s).find((c) => (c.rank === 'soldier' || c.rank === 'associate') && c.capoId && c.capoId !== k.id)!;
    setModifier(s, other.id, s.playerId, 'Sore about money', -60);
    const c = counsel(s, racket(d.id, other.id))!;
    const capo = c.voices.find((v) => v.adviser.charId === k.id)!;
    const ub = c.voices.find((v) => v.adviser.role === 'underboss')!;
    const about = (v: typeof capo) => [...v.pros, ...v.cons].filter((p) => p.about === 'loyalty' && p.text.includes(other.firstName));
    expect(about(capo).length).toBeGreaterThan(0);
    for (const p of about(capo)) { expect(p.k).toBe('estimate'); expect(p.text).not.toMatch(/thinks [+−-]?\d/); }
    expect(about(ub).some((p) => p.k === 'known' && /thinks −\d+ of you/.test(p.text))).toBe(true);
  });

  it('what nobody in the family knows changes nothing: an undiscovered plot, a secret not found', () => {
    const s = newGame('counsel-hidden');
    const before = JSON.stringify(subjects(s).map(([, sub, st]) => counsel(st, sub)));
    const s2 = structuredClone(s);
    const man = crew(s2).find((c) => c.rank === 'soldier')!;
    const rival = s2.rivals.find((r) => r.kind === 'mob')!;
    s2.schemes.push({ id: 'plot-x', kind: 'murder' as never, owner: rival.id, ownerId: rival.leaderId, targetId: s2.playerId, agents: [rival.leaderId], opts: {} as never, progress: 40, startWeek: 1, discovered: false, because: 'a grudge' });
    s2.secrets.push({ id: 'sx9', ownerId: man.id, kind: 'affair' as never, text: 'meets the Feldstein bookkeeper at the Starlite every Tuesday', knownBy: [], week: 1 });
    const after = JSON.stringify(subjects(s2).map(([, sub, st]) => counsel(st, sub)));
    expect(after).not.toContain('Feldstein bookkeeper');
    expect(after).toBe(before);
  });

  it('every voice says what he can\'t see', () => {
    const s = newGame('counsel-blind');
    for (const v of counsel(s, dirty(s))!.voices) expect(v.blind.length).toBeGreaterThan(10);
  });
});

describe('The Table: men disagree when their stances and interests differ', () => {
  it('a hot-headed capo and a careful consigliere split on a loud job when the feds are watching', () => {
    const s = newGame('counsel-split');
    const cons = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'consigliere')!;
    cons.traits = [...cons.traits.filter((t) => t !== 'Hot-headed' && t !== 'Cruel'), 'Paranoid'];
    for (const k of capos(s)) k.traits = [...k.traits.filter((t) => !['Patient', 'Paranoid', 'Cowardly'].includes(t)), 'Hot-headed'];
    s.heat.federal = 45;
    const c = counsel(s, dirty(s))!;
    const cv = c.voices.find((v) => v.adviser.role === 'consigliere')!;
    const bold = c.voices.find((v) => v.adviser.stance === 'bold')!;
    expect(bold).toBeTruthy();
    expect(cv.score).toBeLessThan(bold.score);
    expect(new Set(c.voices.map((v) => v.verdict)).size).toBeGreaterThan(1);
    // The one who disagrees says what he'd do instead.
    const against = c.voices.find((v) => v.verdict === 'wait' || v.verdict === 'dont')!;
    expect(against.instead).toBeTruthy();
    expect(c.summary.worry).toBeTruthy();
    expect(c.summary.line).toMatch(/main worry/);
  });

  it('a capo leans toward a racket on his own ground, and the table says why', () => {
    const s = newGame('counsel-ground');
    const d = s.districts.find((x) => x.capoId)!;
    const c = counsel(s, racket(d.id))!;
    const capo = c.voices.find((v) => v.adviser.charId === d.capoId)!;
    expect(capo.pros.some((p) => /my ground/.test(p.text))).toBe(true);
    expect(capo.bias).toMatch(/his own ground/);
  });
});

describe('The Table: a bias is labelled only when the player could know it', () => {
  it('own ground and own men are labelled; a private friendship is not', () => {
    const s = newGame('counsel-bias');
    const d = s.districts.find((x) => x.capoId)!;
    const c = counsel(s, racket(d.id))!;
    for (const v of c.voices) if (v.adviser.charId !== d.capoId && v.adviser.role !== 'capo') expect(v.bias ?? '').not.toMatch(/own ground/);
    // A private friendship between the consigliere and a candidate tilts nothing visibly.
    const cons = c.voices.find((v) => v.adviser.role === 'consigliere')!;
    const seat = counsel(s, { kind: 'seat', seat: 'bagman' })!;
    const s2 = structuredClone(s);
    for (const o of seat.options!) if (o.id !== cons.adviser.charId) setModifier(s2, cons.adviser.charId, o.id, 'Old friends', 100);
    const seat2 = counsel(s2, { kind: 'seat', seat: 'bagman' })!;
    const cv2 = seat2.voices.find((v) => v.adviser.role === 'consigliere')!;
    expect(cv2.bias ?? '').not.toMatch(/friend/i);
    for (const o of seat2.options!) for (const v of o.voices) expect(v.bias ?? '').not.toMatch(/friend/i);
  });

  it('a decision about one of his own men is labelled on that capo', () => {
    const { s, ev } = withDecision(newGame('counsel-own'));
    const k = s.characters[ev.actors![0]]!;
    const own = crew(s).find((c) => c.capoId === k.id && c.id !== k.id)!;
    ev.actors = [own.id];
    ev.meta = { charId: own.id };
    const c = counsel(s, { kind: 'event', iid: ev.iid })!;
    const capo = c.voices.find((v) => v.adviser.charId === k.id);
    if (capo) expect(capo.bias).toMatch(/one of his own men/);
    for (const v of c.voices) if (v.adviser.charId !== k.id) expect(v.bias ?? '').not.toMatch(new RegExp(`${own.firstName} is one of his own men`));
  });
});

describe('The Table: pure, deterministic, memoized', () => {
  it('never changes the state and gives the same table twice', () => {
    let s = newGame('counsel-pure');
    for (let i = 0; i < 3; i++) s = advanceWeek(s, {}).state;
    const subs = subjects(s);
    for (const [name, sub, st] of subs) {
      const before = JSON.stringify(st);
      const a = counsel(st, sub);
      expect(JSON.stringify(st), name).toBe(before);
      const twin = structuredClone(st);
      expect(JSON.stringify(counsel(twin, sub)), name).toBe(JSON.stringify(a));
      expect(counsel(st, sub)).toBe(a);
    }
  });

  it('with nobody free at the table there is no table (and nothing invented)', () => {
    const s = newGame('counsel-empty');
    for (const c of crew(s)) c.alive = false;
    expect(counsel(s, racket())).toBeUndefined();
  });
});

describe('The Table: the panel', () => {
  it('renders summary first, then the voices stacked on a phone (one column) and side by side from md up', () => {
    const { s, ev } = withDecision(newGame('counsel-ui'));
    const html = renderToString(createElement(CounselPanel, { s, subject: { kind: 'event', iid: ev.iid }, onClose: () => {}, onChoose: () => {} }));
    expect(html).toContain('data-testid="table-summary"');
    expect(html.indexOf('table-summary')).toBeLessThan(html.indexOf('table-voices'));
    expect(html).toContain('data-testid="table-matrix"');
    expect(html).toMatch(/grid grid-cols-1[^"]*md:grid-cols-2/);
    expect((html.match(/data-testid="table-voice"/g) ?? []).length).toBe(counsel(s, { kind: 'event', iid: ev.iid })!.voices.length);
    expect(html).toContain('data-testid="table-more"');
    expect(html).toContain('Why this matters');
    // No fixed widths wider than a phone.
    for (const m of html.matchAll(/w-\[(\d+)px\]/g)) expect(Number(m[1])).toBeLessThanOrEqual(358);
    const one = renderToString(createElement(CounselPanel, { s, subject: racket(), onClose: () => {} }));
    expect(one).toContain('data-testid="table-act"');
    expect(one).toContain('Give the order');
  });
});
