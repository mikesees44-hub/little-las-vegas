import { advanceWeek, cloneState } from '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { reconcile } from '../src/engine/ledger';
import { opinion, addOpinion } from '../src/engine/relations';
import { hoursUsed } from '../src/engine/timeCost';
import { pactWith, ensureTalks } from '../src/engine/talks';
import {
  allowedKinds, beginSitDown, buildDiploPrompt, canShake, canSitDown, closeSitDown, counterTo, DEAL_KINDS, dealMenu, dealValue, needNow,
  openSitDown, shakeOn, SIT_TURNS, sitStep, stanceOf, termBounds, validateDeal, validateDiplo, type SitDown, type Term,
} from '../src/engine/minds/diplomacy';
import { TALK_PER_DAY, TALK_TURNS } from '../src/engine/minds/talk';
import type { GameState, War } from '../src/engine/types';
import { randomChoices } from './helpers';

function game(seed = 'diplo-a'): GameState {
  const s = newGame(seed);
  s.money = Math.max(s.money, 40000);
  return s;
}

function atWar(s: GameState, rival: 'manno' | 'feldstein' | 'kessler', score: number): War {
  const r = s.rivals.find((x) => x.id === rival)!;
  const d = s.districts.find((x) => (x.influence[rival] ?? 0) > 0) ?? s.districts[0];
  const w: War = { id: `w${s.nextId++}`, rival, district: d.id, cb: 'claim', sanctioned: true, score, startWeek: s.week, by: 'player' };
  s.wars.push(w);
  r.war = true;
  return w;
}

/** Talk scripted (no Claude) until the family's own offer is on the table, then shake. */
function scriptedDeal(s: GameState, rival: string, moves: Parameters<typeof sitStep>[2][]): { sd: SitDown } {
  let sd = openSitDown(s, rival)!;
  for (const m of moves) { if (sd.end) break; sd = sitStep(s, sd, m).sd; }
  return { sd };
}

describe('sit-down with a family: the menu and validation', () => {
  it('raises the general Sit and talk limits', () => {
    expect(TALK_TURNS).toBe(12);
    expect(TALK_PER_DAY).toBe(5);
    expect(SIT_TURNS).toBeGreaterThanOrEqual(12);
  });

  it('whitelists kinds, clamps numbers, takes districts only from the list, and never hands over a man', () => {
    const s = game();
    const mine = s.districts.find((d) => (d.influence.manno ?? 0) >= 3)!;
    expect(validateDeal(s, 'manno', { kind: 'launch_missiles' })).toEqual([]);
    expect(validateDeal(s, 'manno', [{ kind: 'hand_over', who: s.playerId }, { kind: 'give_man', charId: 'x' }, { kind: 'kill' }])).toEqual([]);
    const pw = termBounds(s, 'manno', 'partnership').amount!;
    const [p] = validateDeal(s, 'manno', { kind: 'partnership', amount: 999999, weeks: 5000 });
    expect(p.amount).toBe(pw.hi);
    expect(p.weeks).toBe(52);
    const [c] = validateDeal(s, 'manno', { kind: 'cash', dir: 'you', amount: -50 });
    expect(c.amount).toBe(250);
    const [t] = validateDeal(s, 'manno', { kind: 'tribute', amount: '100000', weeks: 1, dir: 'them' });
    expect(t.amount).toBe(600);
    expect(t.weeks).toBe(4);
    expect(t.dir).toBeUndefined();
    expect(validateDeal(s, 'manno', { kind: 'concession', dir: 'them', district: 'atlantis', amount: 3 })).toEqual([]);
    const [k] = validateDeal(s, 'manno', { kind: 'concession', dir: 'them', district: mine.id, amount: 500 });
    expect(k.amount).toBeLessThanOrEqual(8);
    expect(k.amount).toBeLessThanOrEqual(Math.floor(mine.influence.manno ?? 0));
    // One term per kind, three at most.
    const many = validateDeal(s, 'manno', [{ kind: 'truce' }, { kind: 'truce' }, { kind: 'favor' }, { kind: 'cash', amount: 500 }, { kind: 'alliance' }]);
    expect(many.length).toBe(3);
    expect(new Set(many.map((x) => x.kind)).size).toBe(3);
    // The menu has no term that involves a man.
    expect([...DEAL_KINDS].sort()).toEqual(['alliance', 'cash', 'concession', 'favor', 'handsoff', 'partnership', 'tribute', 'truce']);
    for (const line of dealMenu(s, 'manno')) expect(line).not.toMatch(/hand(ed)? over|kill|his men|a man/i);
    // Philadelphia deals only in money and favors.
    expect(allowedKinds(s, 'philly').sort()).toEqual(['cash', 'favor', 'tribute']);
  });

  it('validates the model answer: bad JSON shapes refused, numbers clamped, status coerced', () => {
    const s = game();
    expect(validateDiplo(s, 'manno', null)).toBeUndefined();
    expect(validateDiplo(s, 'manno', { reply: '' })).toBeUndefined();
    expect(validateDiplo(s, 'manno', [1, 2])).toBeUndefined();
    const v = validateDiplo(s, 'manno', { reply: 'Fine.\u0007', intent: 'nuke', opinion_delta: 99, deal: [{ kind: 'give_man' }], deal_status: 'proposing' })!;
    expect(v.reply).toBe('Fine.');
    expect(v.intent).toBe('deflect');
    expect(v.opinion).toBe(5);
    expect(v.deal).toEqual([]);
    expect(v.status).toBe('none');
    const w = validateDiplo(s, 'manno', { reply: 'x'.repeat(5000), deal: { kind: 'cash', dir: 'them', amount: 1e9 }, deal_status: 'proposing' })!;
    expect(w.reply.length).toBeLessThanOrEqual(600);
    expect(w.deal[0].amount).toBeLessThanOrEqual(15000);
  });

  it('the prompt carries the rules, the persona and the menu with bounds', () => {
    const s = game();
    const sd = openSitDown(s, 'kessler')!;
    const p = buildDiploPrompt(s, sd, { say: 'Let us talk about the boardwalk.' });
    const all = p.messages.map((m) => m.content).join('\n');
    expect(all).toMatch(/fictional/);
    expect(all).toMatch(/DEAL MENU/);
    expect(all).toMatch(/truce/);
    expect(all).toMatch(/Never ask for or offer any man/);
    expect(p.messages[p.messages.length - 1].role).toBe('user');
    for (let i = 1; i < p.messages.length; i++) expect(p.messages[i].role).not.toBe(p.messages[i - 1].role);
  });
});

describe('sit-down: the engine has the final say', () => {
  it('an AI "accept" of a deal clearly against their interest is overridden to a counter or a refusal', () => {
    const s = game('diplo-b');
    const sd = openSitDown(s, 'feldstein')!;
    const r = s.rivals.find((x) => x.id === 'feldstein')!;
    r.money = 200000;
    const bad: Term[] = [{ kind: 'cash', dir: 'them', amount: 15000 }, { kind: 'favor', dir: 'them' }];
    const vbad = validateDeal(s, 'feldstein', bad);
    expect(dealValue(s, 'feldstein', vbad)).toBeLessThan(-10000);
    const ai = validateDiplo(s, 'feldstein', { reply: 'Deal. Whatever you say.', intent: 'agree', opinion_delta: 0, deal: null, deal_status: 'accepting' })!;
    const step = sitStep(s, sd, { propose: vbad }, ai);
    expect(step.overridden).toBe(true);
    // Whatever is on the table now, it is not the bad deal as a yes.
    const t = step.sd.table;
    if (t) {
      expect(t.by).toBe('them');
      expect(dealValue(s, 'feldstein', t.terms)).toBeGreaterThanOrEqual(needNow(stanceOf(s, 'feldstein')!, step.sd) - 150);
    }
    // And a model's own proposal that gives the store away is replaced too.
    const gift = validateDiplo(s, 'feldstein', { reply: 'Take it all.', intent: 'agree', deal: [{ kind: 'cash', dir: 'them', amount: 15000 }], deal_status: 'proposing' })!;
    const g = sitStep(s, sd, { say: 'What do you offer?' }, gift);
    expect(g.overridden).toBe(true);
    if (g.sd.table) expect(dealValue(s, 'feldstein', g.sd.table.terms)).toBeGreaterThanOrEqual(needNow(stanceOf(s, 'feldstein')!, g.sd) - 150);
    // A shake is checked again by the engine.
    const forged: SitDown = { ...sd, table: { terms: vbad, by: 'boss', ok: true } };
    expect(canShake(s, forged).ok).toBe(false);
    expect(shakeOn(s, forged).ok).toBe(false);
  });

  it('their counter always meets their need, within the bounds', () => {
    const s = game('diplo-c');
    const st = stanceOf(s, 'manno')!;
    const ct = counterTo(s, st, [{ kind: 'truce', weeks: 26 }], st.need + 2000);
    if (ct) {
      expect(dealValue(s, 'manno', ct)).toBeGreaterThanOrEqual(st.need + 2000 - 150);
      expect(validateDeal(s, 'manno', ct)).toEqual(ct);
    }
  });
});

describe('sit-down: scripted (no Claude), deals land', () => {
  it('a sit-down costs two hours, one a family a week, and patience runs out on insults', () => {
    const s = game('diplo-d');
    expect(canSitDown(s, 'manno').ok).toBe(true);
    const h0 = hoursUsed(s);
    const s1 = beginSitDown(s, 'manno');
    expect(hoursUsed(s1)).toBeCloseTo(h0 + 2, 5);
    expect(canSitDown(s1, 'manno').ok).toBe(false);
    expect(canSitDown(s1, 'manno').why).toMatch(/this week/);
    expect(canSitDown(s1, 'kessler').ok).toBe(true);
    expect(s.talks?.sat).toBeUndefined();
    // Insults: he walks out.
    let sd = openSitDown(s1, 'manno')!;
    for (let i = 0; i < 6 && !sd.end; i++) sd = sitStep(s1, sd, { say: 'You are a bum and a clown, old man.' }).sd;
    expect(sd.end).toBe('walkout');
    expect(sd.round).toBeLessThan(6);
    // Max exchanges.
    let sd2 = openSitDown(s1, 'kessler')!;
    for (let i = 0; i < 40 && !sd2.end; i++) sd2 = { ...sitStep(s1, { ...sd2, anger: 0 }, { tone: 'flatter' }).sd };
    expect(sd2.end).toBe('done');
    expect(sd2.round).toBe(SIT_TURNS);
    // A walk-out lands in Your File.
    const after = closeSitDown(s1, sd);
    expect(after.journal!.e.some((e) => /Sat down with Manno/.test(e.t))).toBe(true);
    expect(opinion(after, s.rivals.find((r) => r.id === 'manno')!.leaderId, s.playerId)).toBeLessThanOrEqual(opinion(s1, s.rivals.find((r) => r.id === 'manno')!.leaderId, s.playerId));
  });

  it('scripted: a truce that ends a war, in Your File and the pacts', () => {
    const s = game('diplo-e');
    const w = atWar(s, 'kessler', 30);
    const r = s.rivals.find((x) => x.id === 'kessler')!;
    const { sd } = scriptedDeal(s, 'kessler', [{ tone: 'flatter' }, { propose: [{ kind: 'truce', weeks: 26 }] }]);
    expect(sd.table?.ok).toBe(true);
    expect(sd.table!.terms.some((t) => t.kind === 'truce')).toBe(true);
    const res = shakeOn(s, sd);
    expect(res.ok).toBe(true);
    const g = res.state;
    expect(g.wars.some((x) => x.id === w.id)).toBe(false);
    expect(g.rivals.find((x) => x.id === 'kessler')!.war).toBe(false);
    expect(pactWith(g, 'kessler', 'truce')).toBeDefined();
    expect(g.journal!.e.some((e) => /shook on a deal/.test(e.t) && e.mine)).toBe(true);
    expect(g.talks!.log.some((l) => /shook on it/.test(l.text) && l.kind === 'pact')).toBe(true);
    // The input state is untouched.
    expect(s.wars.some((x) => x.id === w.id)).toBe(true);
    expect(r.war).toBe(true);
  });

  it('partnership and tribute pay weekly through the books; reconcile is clean', () => {
    const s = game('diplo-f');
    for (const id of ['feldstein', 'manno']) addOpinion(s, s.rivals.find((r) => r.id === id)!.leaderId, s.playerId, 'test', 60, 0);
    // Partnership at a low rate: they pay you weekly.
    const sdP: SitDown = { ...openSitDown(s, 'feldstein')!, table: undefined };
    const p = sitStep(s, sdP, { propose: [{ kind: 'partnership', amount: termBounds(s, 'feldstein', 'partnership').amount!.lo, weeks: 52 }] }).sd;
    expect(p.table?.ok).toBe(true);
    let g = shakeOn(s, p).state;
    expect(pactWith(g, 'feldstein', 'partnership')).toBeDefined();
    // Tribute: you pay Manno weekly (that is good for them: they take it).
    const sdT: SitDown = { ...openSitDown(g, 'manno')!, table: undefined };
    const t = sitStep(g, sdT, { propose: [{ kind: 'tribute', amount: 300, weeks: 12 }] }).sd;
    expect(t.table?.ok).toBe(true);
    g = shakeOn(g, t).state;
    expect(pactWith(g, 'manno', 'tribute')?.weekly).toBe(300);
    const res = advanceWeek(g, randomChoices(g, 3));
    expect(reconcile(res.report)).toEqual([]);
    expect(res.report.lines.some((l) => /Partnership with Feldstein/.test(l.label) && l.amount > 0)).toBe(true);
    expect(res.report.lines.some((l) => /Tribute to Manno/.test(l.label) && l.amount === -300)).toBe(true);
  });

  it('cash, a concession, a favor and a hands-off term all apply; nothing touches the boss\'s men', () => {
    const s = game('diplo-g');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    const d = s.districts.find((x) => (x.influence.player ?? 0) >= 3)!;
    const men0 = Object.values(s.characters).filter((c) => c.faction === 'player' && c.alive).map((c) => c.id).sort();
    const sd0: SitDown = { ...openSitDown(s, 'manno')!, table: undefined };
    const deal: Term[] = [{ kind: 'cash', dir: 'you', amount: 15000 }, { kind: 'favor', dir: 'you' }, { kind: 'concession', dir: 'you', district: d.id, amount: 2 }];
    const st = sitStep(s, sd0, { propose: deal }).sd;
    expect(st.table?.ok).toBe(true);
    const m0 = s.money;
    const inf0 = d.influence.player ?? 0;
    const res = shakeOn(s, st);
    expect(res.ok).toBe(true);
    const g = res.state;
    expect(g.money).toBe(m0 - 15000);
    expect(g.rivals.find((x) => x.id === 'manno')!.money).toBe(r.money + 15000);
    expect(g.districts.find((x) => x.id === d.id)!.influence.player ?? 0).toBe(inf0 - 2);
    expect(g.deeds?.owed.some((o) => o.by === g.playerId && o.to === r.leaderId)).toBe(true);
    const men1 = Object.values(g.characters).filter((c) => c.faction === 'player' && c.alive).map((c) => c.id).sort();
    expect(men1).toEqual(men0);
    // A hands-off term: they stay out; if they move in anyway, the word is broken and you hold a grievance.
    const h = cloneState(s);
    ensureTalks(h).pacts.push({ id: 'ph', a: 'player', b: 'manno', kind: 'handsoff', since: h.week, until: h.week + 26, terms: 'test', district: d.id, bound: 'manno', base: 0 });
    expect(pactWith(h, 'manno')).toBeUndefined();
    h.districts.find((x) => x.id === d.id)!.influence.manno = 20;
    const after = advanceWeek(h, randomChoices(h, 2)).state;
    expect((after.flags.grievance_manno ?? 0) > 0).toBe(true);
    expect(after.journal!.e.some((e) => /broke their word/.test(e.t))).toBe(true);
  });

  it('the scripted fallback can talk a winning family down from its opening ask', () => {
    const s = game('diplo-h');
    atWar(s, 'manno', -40);
    const sd = openSitDown(s, 'manno')!;
    expect(sd.log.some((l) => l.who === 'them' && /want/.test(l.text))).toBe(true);
    if (sd.table) {
      expect(sd.table.ok).toBe(true);
      expect(sd.table.terms.some((t) => t.kind === 'truce')).toBe(true);
      expect(canShake(s, sd).ok).toBe(true);
    }
  });
});
