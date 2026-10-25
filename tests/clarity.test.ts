import { describe, expect, it } from 'vitest';
import { legalActions, previewAction, resolveActions } from '../src/engine/actions';
import { explainAction, explainChoice, immediateTotal } from '../src/engine/advice';
import { advisorPick } from '../src/engine/advisors';
import { rankCandidates } from '../src/engine/candidates';
import { crew } from '../src/engine/characters';
import { describeEffect } from '../src/engine/effects';
import { advanceWeek } from '../src/engine/engine';
import { effectHelp, GLOSSARY, statHelp } from '../src/engine/glossary';
import { HEAT_THRESHOLD } from '../src/engine/heat';
import { newCtx, sumLines } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { weekChecklist, whatShouldIDo } from '../src/engine/opportunities';
import { addOpinion, opinion } from '../src/engine/relations';
import type { Character, GameState, PlayerAction } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

function soldiers(s: GameState): Character[] {
  return crew(s).filter((c) => c.rank === 'soldier' && !c.specialty);
}

/** Two plain soldiers with no traits, identical except where a test says otherwise. */
function twoMen(s: GameState): [Character, Character] {
  const [a, b] = soldiers(s);
  for (const c of [a, b]) {
    c.traits = [];
    c.attributes = { leadership: 50, business: 50, diplomacy: 50, intrigue: 50, force: 50, discipline: 50 };
    c.evidence = 0;
    c.debtTo = undefined;
    c.courtedBy = undefined;
    c.defectStage = 0;
    c.goal = undefined;
    c.fatherId = undefined;
    c.motherId = undefined;
    c.spouseId = undefined;
    c.childrenIds = [];
    // No other jobs, so only the test's differences count.
    for (const biz of s.businesses) biz.staffIds = (biz.staffIds ?? []).filter((id) => id !== c.id);
    for (const st of Object.keys(s.council) as (keyof GameState['council'])[]) if (s.council[st].holderId === c.id) s.council[st].holderId = undefined;
  }
  return [a, b];
}

describe('clarity: explainAction', () => {
  it('is deterministic and never touches the state', () => {
    const s = newGame('clar-det');
    const before = JSON.stringify(s);
    const acts = legalActions(s).slice(0, 40);
    const a = acts.map((x) => explainAction(s, x));
    const b = acts.map((x) => explainAction(clone(s), x));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(s)).toBe(before);
    for (const ex of a) {
      expect(ex.purpose.length).toBeGreaterThan(5);
      expect(ex.verdict.label.length).toBeGreaterThan(3);
    }
  });

  it('lists every effect the order applies (nothing hidden behind the card)', () => {
    for (const seed of ['clar-all1', 'clar-all2']) {
      let s = newGame(seed);
      for (let i = 0; i < 6; i++) s = advanceWeek(s, {}).state;
      s.money = 60000;
      for (const a of legalActions(s)) {
        const p = previewAction(s, a);
        const ex = explainAction(s, a);
        const shown = new Set([...ex.gains, ...ex.costs, ...ex.changes].map((n) => n.text));
        const risks = ex.risks.map((r) => r.text).join(' | ');
        for (const e of p.effects) {
          const d = describeEffect(s, e);
          if (!d) continue;
          if (e.type === 'schedule') {
            if (e.key === 'delegated_order') expect(shown.has(e.hint), `${p.title}: ${e.hint}`).toBe(true);
            else expect(shown.has(d) || risks.includes(e.hint), `${p.title}: ${e.hint}`).toBe(true);
          } else expect(shown.has(d), `${p.title}: ${d}`).toBe(true);
        }
      }
    }
  });

  it('matches what actually gets applied (no lying tooltips)', () => {
    const s0 = newGame('clar-apply');
    s0.money = 50000;
    s0.heat = { local: 30, family: 30, federal: 20 };
    const c = crew(s0).find((x) => x.rank === 'capo')!;
    c.wealth = 9000;
    const district = s0.districts.find((d) => (d.influence.player ?? 0) < 90)!;
    const owned = s0.districts.find((d) => (d.influence.player ?? 0) >= 20)!;
    const sample: PlayerAction[] = [
      { kind: 'pushDistrict', district: district.id },
      { kind: 'buyBusiness', biz: 'pizza', district: owned.id },
      { kind: 'interact', id: 'gift_small', target: c.id },
      { kind: 'interact', id: 'dinner', target: c.id },
      { kind: 'interact', id: 'demand', target: c.id },
      { kind: 'interact', id: 'threaten', target: c.id },
      { kind: 'findFrontMan' },
      { kind: 'officeHours' },
      { kind: 'order', key: 'shakedown', via: 'direct' },
      { kind: 'order', key: 'parish', via: 'direct' },
      ...(s0.hirePool[0] ? [{ kind: 'hire', specId: s0.hirePool[0].id } as PlayerAction] : []),
    ];
    let checked = 0;
    for (const a of sample) {
      for (let k = 0; k < 4; k++) {
        const s = clone(s0);
        s.rng = (s.rng + k * 7919) >>> 0;
        const p = previewAction(s, a);
        if (p.disabledReason) break;
        const ex = explainAction(s, a);
        const ctx = newCtx(s);
        resolveActions(ctx, [a]);
        const got = sumLines(ctx.lines);
        const refused = ctx.log.some((l) => l.endsWith('— refused.'));
        if (refused) {
          const want = (p.refuseEffects ?? []).reduce((x, e) => x + (e.type === 'money' ? e.amount : 0), 0);
          expect(got.money, `${p.title} (refused)`).toBe(want);
        } else {
          expect(got.money, p.title).toBe(immediateTotal(ex, 'money'));
          expect(got.respect, p.title).toBe(immediateTotal(ex, 'respect'));
          expect(got['heat.local'], p.title).toBe(immediateTotal(ex, 'heat.local'));
          expect(got['heat.family'], p.title).toBe(immediateTotal(ex, 'heat.family'));
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('gives a blocked verdict with the reason when the order cannot be given', () => {
    const s = newGame('clar-block');
    s.money = 10;
    const ex = explainAction(s, { kind: 'findFrontMan' });
    expect(ex.verdict.tone).toBe('blocked');
    expect(ex.verdict.label).toMatch(/^Not yet: needs \$2,500/);
  });

  it('flags heat that would cross into raid territory', () => {
    const s = newGame('clar-heat');
    s.money = 50000;
    s.heat.local = 77;
    const ex = explainAction(s, { kind: 'order', key: 'shakedown', via: 'direct' });
    expect(ex.risks.some((r) => r.text.includes(`at ${HEAT_THRESHOLD} the police raid`))).toBe(true);
    expect(ex.verdict.label).not.toBe('Good idea now');
  });

  it('explains weekly decision options with a reason to pick each', () => {
    let s = newGame('clar-choice');
    for (let i = 0; i < 12 && !s.pendingEvents.length; i++) s = advanceWeek(s, {}).state;
    for (const ev of s.pendingEvents) for (const ch of ev.choices) {
      const ex = explainChoice(s, ch);
      expect(ex.purpose.length).toBeGreaterThan(5);
      const money = ch.effects.filter((e) => e.type === 'money').reduce((x, e) => x + (e.type === 'money' ? e.amount : 0), 0);
      expect(immediateTotal(ex, 'money')).toBe(money);
    }
  });
});

describe('clarity: rankCandidates', () => {
  it('puts a clearly better candidate first and recommends him', () => {
    const s = newGame('clar-rank');
    const [a, b] = twoMen(s);
    a.attributes.intrigue = 92;
    b.attributes.intrigue = 25;
    addOpinion(s, a.id, s.playerId, 'test', 30, 0);
    const r = rankCandidates(s, { kind: 'seat', seat: 'consigliere' }, [b.id, a.id]);
    expect(r.candidates[0].id).toBe(a.id);
    expect(r.recommendedId).toBe(a.id);
    expect(r.alternativeId).toBe(b.id);
    expect(r.candidates[0].pros.some((p) => p.text.startsWith('Intrigue 92'))).toBe(true);
    expect(r.candidates[1].cons.some((p) => p.text.startsWith('Intrigue only 25'))).toBe(true);
    expect(r.candidates[0].action).toEqual({ kind: 'appoint', seat: 'consigliere', charId: a.id });
  });

  it('is deterministic', () => {
    const s = newGame('clar-rank-det');
    const roles = [{ kind: 'seat', seat: 'bagman' }, { kind: 'capo' }, { kind: 'make' }, { kind: 'heir' }] as const;
    for (const role of roles) expect(JSON.stringify(rankCandidates(s, role))).toBe(JSON.stringify(rankCandidates(clone(s), role)));
  });

  it('pros and cons reflect traits, loyalties, kin and flags', () => {
    const s = newGame('clar-traits');
    const [a, b] = twoMen(s);
    a.traits = ['Honest'];
    b.traits = ['Greedy', 'Ambitious'];
    b.evidence = 70;
    // b's brother works for the Manno crew.
    const rivalMan = Object.values(s.characters).find((x) => x.alive && x.faction === 'manno' && x.gender === 'M')!;
    b.fatherId = 'test-father';
    rivalMan.fatherId = 'test-father';
    const bag = rankCandidates(s, { kind: 'seat', seat: 'bagman' }, [a.id, b.id]);
    const ca = bag.candidates.find((x) => x.id === a.id)!;
    const cb = bag.candidates.find((x) => x.id === b.id)!;
    expect(ca.pros.some((p) => p.text.includes('Honest'))).toBe(true);
    expect(cb.cons.some((p) => p.text.includes('Greedy'))).toBe(true);
    expect(cb.flags.some((f) => f.text.includes('file on him (70)'))).toBe(true);
    expect(ca.safety).toBeGreaterThan(cb.safety);
    expect(bag.recommendedId).toBe(a.id);
    const ub = rankCandidates(s, { kind: 'seat', seat: 'underboss' }, [a.id, b.id]);
    const ub2 = ub.candidates.find((x) => x.id === b.id)!;
    expect(ub2.cons.some((p) => p.text.startsWith('Ambitious'))).toBe(true);
    const all = [...ub2.cons, ...cb.cons].map((x) => x.text).join(' | ');
    expect(all).toMatch(/brother is a .*Manno|Manno.*brother/i);
  });

  it('shows loyalty to his capo over you as a con', () => {
    const s = newGame('clar-capo-loyal');
    const m = crew(s).find((c) => c.capoId && (c.rank === 'soldier' || c.rank === 'associate'))!;
    addOpinion(s, m.id, m.capoId!, 'test', 80, 0);
    const r = rankCandidates(s, { kind: 'seat', seat: 'enforcer' }, [m.id]);
    expect(r.candidates[0].cons.some((c) => c.text.startsWith('Loyal to his capo'))).toBe(true);
    expect(r.candidates[0].capoLoyalty).toBeGreaterThan(r.candidates[0].opinion ?? 0);
  });

  it('notes the opportunity cost of pulling a man off his job', () => {
    const s = newGame('clar-opp');
    const k = crew(s).find((c) => c.rank === 'capo' && s.districts.some((d) => d.capoId === c.id))!;
    const r = rankCandidates(s, { kind: 'seat', seat: 'fixer' }, [k.id]);
    expect(r.candidates[0].opportunityCost ?? '').toMatch(/Capo of/);
  });

  it('ranks every kind of pick without throwing', () => {
    let s = newGame('clar-roles');
    for (let i = 0; i < 8; i++) s = advanceWeek(s, {}).state;
    const biz = s.businesses.find((b) => b.owner === 'player')!;
    const ourKid = Object.values(s.characters).find((c) => c.alive && c.dynasty && c.id !== s.playerId && !c.spouseId);
    const assoc = crew(s).find((c) => c.rank === 'associate');
    const roles = [
      { kind: 'manager', key: biz.id },
      { kind: 'envoy', city: 'capemay' },
      { kind: 'agent', scheme: 'heist', opts: { depth: 'planned', heist: 'jewelry' } },
      ...(assoc ? [{ kind: 'voucher', charId: assoc.id }] : []),
      ...(ourKid ? [{ kind: 'marriage', memberId: ourKid.id }] : []),
    ] as const;
    for (const role of roles) {
      const r = rankCandidates(s, role as never);
      for (const c of r.candidates) {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
        expect(c.pros.length + c.cons.length).toBeGreaterThan(0);
        expect(c.pros.length).toBeLessThanOrEqual(3);
        expect(c.cons.length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('clarity: advisors', () => {
  it('a self-interested advisor steers you toward his friend, and shows it', () => {
    const s = newGame('clar-advisor');
    const [a, b] = twoMen(s);
    const cons = s.council.consigliere.holderId ? s.characters[s.council.consigliere.holderId] : undefined;
    const adv = cons && cons.id !== a.id && cons.id !== b.id ? cons : crew(s).find((c) => c.id !== a.id && c.id !== b.id && c.rank !== 'associate')!;
    s.council.consigliere.holderId = adv.id;
    a.attributes.business = 72;
    b.attributes.business = 64;
    // Honest and neutral: he backs the better man.
    adv.traits = ['Honest'];
    const r = rankCandidates(s, { kind: 'seat', seat: 'bagman' }, [a.id, b.id]);
    expect(r.recommendedId).toBe(a.id);
    const fair = advisorPick(s, 'consigliere', r)!;
    expect(fair.pickId).toBe(a.id);
    expect(fair.biased).toBe(false);
    // Greedy, ambitious, and b's friend: he backs b.
    adv.traits = ['Greedy', 'Ambitious'];
    addOpinion(s, adv.id, b.id, 'Came up together', 80, 0);
    const r2 = rankCandidates(s, { kind: 'seat', seat: 'bagman' }, [a.id, b.id]);
    const bent = advisorPick(s, 'consigliere', r2)!;
    expect(bent.pickId).toBe(b.id);
    expect(bent.biased).toBe(true);
    expect(bent.opinionOfPick).toBe(opinion(s, adv.id, b.id));
    expect(bent.tie).toMatch(/friend/);
    expect(bent.quote.length).toBeGreaterThan(5);
  });
});

describe('clarity: what should I do', () => {
  it('lists 3–5 ranked items whose actions can be given', () => {
    let s = newGame('clar-wsid');
    for (let i = 0; i < 4; i++) s = advanceWeek(s, {}).state;
    s.heat.local = 70;
    const list = whatShouldIDo(s);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.length).toBeLessThanOrEqual(5);
    expect(list.some((o) => o.id === 'heat:local')).toBe(true);
    for (const o of list) if (o.link.action) expect(previewAction(s, o.link.action).disabledReason).toBeUndefined();
    expect(JSON.stringify(whatShouldIDo(clone(s)))).toBe(JSON.stringify(list));
  });

  it('spots a district with no capo and names the best man for it', () => {
    const s = newGame('clar-nocapo');
    const d = s.districts.find((x) => x.capoId)!;
    d.capoId = undefined;
    d.influence.player = Math.max(50, d.influence.player ?? 0);
    const list = whatShouldIDo(s, 5);
    const o = list.find((x) => x.id === `capo:${d.id}`);
    expect(o).toBeTruthy();
    expect(o!.text).toMatch(/leaks/);
    expect(o!.link.role).toEqual({ kind: 'capo', district: d.id });
  });

  it('builds a checklist tied to the early-goals ladder', () => {
    const s = newGame('clar-check');
    const items = weekChecklist(s, { answered: 0, ordersQueued: 0 });
    expect(items.find((i) => i.id === 'order')!.done).toBe(false);
    expect(weekChecklist(s, { answered: 0, ordersQueued: 1 }).find((i) => i.id === 'order')!.done).toBe(true);
    expect(items.some((i) => i.id === 'ladder')).toBe(true);
  });
});

describe('clarity: glossary', () => {
  it('quotes the engine\'s real thresholds', () => {
    expect(statHelp('heat.local')).toContain(`${HEAT_THRESHOLD}+`);
    expect(effectHelp({ type: 'heat', bar: 'federal', amount: 2 })).toContain('FBI');
    for (const g of GLOSSARY) expect(g.short.length).toBeGreaterThan(20);
    for (const id of ['heat.local', 'heat.family', 'heat.federal', 'respect', 'opinion', 'table', 'scheme', 'kickup', 'unwashed', 'succession']) expect(GLOSSARY.some((g) => g.id === id)).toBe(true);
  });
});
