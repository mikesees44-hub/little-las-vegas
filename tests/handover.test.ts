/**
 * NEVER HAND OVER A MAN WITHOUT THE BOSS'S WORD (engine/handover.ts).
 *
 * Every default (what an unanswered decision does), every routine the desk or an
 * advisor settles, and every actor who works on his own (the underboss, the
 * consigliere, the trusted advisors, Philadelphia enforcing a ruling) is audited:
 * none of them may kill, run off, leave to rot or hand over one of the boss's
 * men. Only an explicit choice does that.
 */
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { rand } from '../src/engine/rng';
import { getRelation } from '../src/engine/relations';
import { crew } from '../src/engine/characters';
import { holder } from '../src/engine/council';
import { CREW_EVENTS, buildPlantFound } from '../src/engine/crewEvents';
import { EVENT_DEFS } from '../src/engine/events';
import { buildRulingAgainst, newDispute, openDispute } from '../src/engine/table';
import { fireConsequences } from '../src/engine/consequences';
import { isSurrender, safeDefault, surrenderedBy, actionSurrenders, guardDefaults } from '../src/engine/handover';
import { DOMAIN_IDS, lieutenantsWeek, setLevel, type LtAct } from '../src/engine/lieutenants';
import { isRoutine } from '../src/engine/briefing';
import { revealIntel } from '../src/engine/crewlife';
import type { EventInstance, GameState, PlayerChoices } from '../src/engine/types';

/** Every player man alive now (id → name). */
const men = (s: GameState) => new Map(crew(s).map((c) => [c.id, `${c.firstName} ${c.lastName}`]));

/** Who of `before` is gone from the family by the boss's hand, a handover, or a running-off. */
function handedOver(prev: GameState, next: GameState): string[] {
  const out: string[] = [];
  for (const [id, name] of men(prev)) {
    const c = next.characters[id];
    if (!c) continue;
    if (!c.alive && c.death?.week === prev.week && (c.death.killer === 'player' || /given up|handed|Table|sanction/i.test(c.death.cause))) out.push(`${name}: ${c.death.cause}`);
    // Run off the island (the exile effect leaves its mark on what he thinks of the boss); a retirement he asked for is not this.
    const exiled = getRelation(next, id, next.playerId)?.modifiers.some((m) => m.reason === 'Exiled me from Wildwood' && m.week === prev.week);
    if (c.alive && c.faction === 'none' && prev.characters[id].faction === 'player' && exiled) out.push(`${name}: run off`);
  }
  return out;
}

/** The default must never be a surrender when a non-surrender answer exists. */
function checkDefaults(s: GameState, where: string): void {
  for (const ev of s.pendingEvents) {
    const def = ev.choices.find((c) => c.id === ev.defaultChoiceId);
    const way = ev.choices.some((c) => !c.disabledReason && !isSurrender(s, c));
    if (way) expect(isSurrender(s, def), `${where}: ${ev.defId} defaults to "${def?.label}"`).toBe(false);
  }
}

/** A random answer that is never a surrender. */
function safeRandom(s: GameState, salt: number): PlayerChoices {
  const h = { rng: (s.rng ^ (0x51ed27 + salt)) >>> 0 };
  const choices: Record<string, string> = {};
  for (const ev of s.pendingEvents) {
    const legal = ev.choices.filter((c) => !c.disabledReason && !isSurrender(s, c));
    if (legal.length) choices[ev.iid] = legal[Math.floor(rand(h) * legal.length)].id;
  }
  return { choices };
}

describe('no man is handed over without the boss\'s word', () => {
  it('weeks with no answers at all, the lieutenants on "Handle it" everywhere: nobody is given up', () => {
    for (const seed of ['hand-a', 'hand-b', 'hand-c']) {
      let s = newGame(seed);
      for (const d of DOMAIN_IDS) s = setLevel(s, d, 'handle');
      for (let i = 0; i < 70 && !s.gameOver; i++) {
        checkDefaults(s, `${seed} week ${s.week}`);
        const next = advanceWeek(s, {}).state;
        expect(handedOver(s, next), `${seed} week ${s.week}`).toEqual([]);
        s = next;
      }
    }
  }, 240000);

  it('a random policy that never picks a surrender: nobody is given up', () => {
    for (const seed of ['hand-r1', 'hand-r2']) {
      let s = newGame(seed);
      for (let i = 0; i < 60 && !s.gameOver; i++) {
        checkDefaults(s, `${seed} week ${s.week}`);
        const next = advanceWeek(s, safeRandom(s, i)).state;
        expect(handedOver(s, next), `${seed} week ${s.week}`).toEqual([]);
        s = next;
      }
    }
  }, 240000);

  it('every crew decision and situational event: its default never gives the man up', () => {
    const s = newGame('hand-defs');
    for (const def of CREW_EVENTS) {
      for (const c of def.subjects(s).slice(0, 4)) {
        const ev = def.build(JSON.parse(JSON.stringify(s)), c);
        if (!ev) continue;
        const safe = safeDefault(s, ev);
        const way = ev.choices.some((x) => !x.disabledReason && !isSurrender(s, x));
        if (way) expect(isSurrender(s, safe), `${def.key}`).toBe(false);
        // The builder's own default is already safe (the guard is a net, not the fix).
        const own = ev.choices.find((x) => x.id === ev.defaultChoiceId);
        if (way) expect(isSurrender(s, own), `${def.key} own default "${own?.label}"`).toBe(false);
      }
    }
    for (const d of EVENT_DEFS) {
      const t = JSON.parse(JSON.stringify(s)) as GameState;
      let ev: EventInstance | undefined;
      try { ev = d.build(t); } catch { ev = undefined; }
      if (!ev) continue;
      const own = ev.choices.find((x) => x.id === ev!.defaultChoiceId);
      if (ev.choices.some((x) => !x.disabledReason && !isSurrender(t, x))) expect(isSurrender(t, own), `${d.id}`).toBe(false);
    }
  });

  it('the Table: a sanction ruling defaults to paying, bargaining or defying, never to giving him up', () => {
    const s = newGame('hand-table');
    const man = crew(s).find((c) => c.rank === 'capo')!;
    for (const money of [200000, 5000, 0]) {
      const t = { ...JSON.parse(JSON.stringify(s)), money } as GameState;
      const d = openDispute(t, newDispute(t, 'sanction', 'kessler', 'player', { targetId: man.id }));
      const ev = buildRulingAgainst(t, d);
      expect(['pay', 'negotiate', 'defy']).toContain(ev.defaultChoiceId);
      const comply = ev.choices.find((c) => c.id === 'comply')!;
      expect(surrenderedBy(t, comply.effects)).toEqual([man.id]);
    }
  });

  it('Philadelphia enforcing a ruling does not just take him: the boss decides, and the default protects him', () => {
    const s = newGame('hand-enforce');
    const man = crew(s).find((c) => c.rank === 'capo')!;
    const ctx = newCtx(s);
    s.scheduled.push({ id: 'scX', key: 'table_enforce', dueWeek: s.week, because: 'defied the Table', sourceWeek: s.week, params: { charId: man.id } });
    fireConsequences(ctx);
    expect(s.characters[man.id].alive).toBe(true);
    const ev = s.eventQueue.find((e) => e.defId === 'philly_comes')!;
    expect(ev).toBeDefined();
    expect(isSurrender(s, ev.choices.find((c) => c.id === ev.defaultChoiceId))).toBe(false);
    expect(isSurrender(s, ev.choices.find((c) => c.id === 'giveup'))).toBe(true);
    // Unanswered, he lives.
    s.pendingEvents = [ev];
    const next = advanceWeek(s, {}).state;
    expect(next.characters[man.id].alive).toBe(true);
    expect(next.mymen!.back).toBeGreaterThan(50);
  });

  it('the rat and the plant: silence feeds him lies, it does not kill him', () => {
    const s = newGame('hand-rat');
    const rat = crew(s).find((c) => c.rank === 'soldier')!;
    s.flags.informant = Number(rat.id.slice(1));
    s.flags.intel = 200;
    const ev = revealIntel(newCtx(s));
    expect(ev?.defId).toBe('rat_found');
    expect(ev!.defaultChoiceId).toBe('feed');
    rat.informantFor = 'law';
    expect(buildPlantFound(s, rat).defaultChoiceId).toBe('feed');
  });

  it('the guard rewrites any default that would give a man up', () => {
    const s = newGame('hand-guard');
    const man = crew(s)[0];
    const ev: EventInstance = {
      iid: 'evX', defId: 'test', title: 't', text: 't', week: s.week, mandatory: true, priority: 1, defaultChoiceId: 'give',
      choices: [
        { id: 'give', label: 'Give him up', because: 'gave him up', effects: [{ type: 'kill', charId: man.id, cause: 'given up' }] },
        { id: 'pay', label: 'Pay', because: 'paid', effects: [{ type: 'money', amount: -100 }] },
      ],
    };
    expect(guardDefaults(s, [ev]).length).toBe(1);
    expect(ev.defaultChoiceId).toBe('pay');
    // "Let him sit" is a surrender; bail with his thanks is not.
    expect(surrenderedBy(s, [{ type: 'imprison', charId: man.id, weeks: 20 }])).toEqual([man.id]);
    expect(surrenderedBy(s, [{ type: 'imprison', charId: man.id, weeks: 20 }, { type: 'opinion', from: man.id, to: s.playerId, amount: 12, reason: 'x' }])).toEqual([]);
  });

  it('the underboss never gives up a man on his own, even on "Handle it": he waits for the boss', () => {
    const s = newGame('hand-lt');
    const ub = holder(s, 'underboss')!;
    expect(ub).toBeDefined();
    const victim = crew(s).find((c) => c.id !== ub.id && c.rank === 'soldier')!;
    let t = s;
    for (const d of DOMAIN_IDS) t = setLevel(t, d, 'handle');
    const act: LtAct = {
      id: 'underboss:test', seat: 'underboss', byId: ub.id, domain: 'crews', topic: `${victim.firstName}`, line: 'He has to go.',
      options: [{ id: 'whack', label: `Take care of ${victim.firstName}`, action: { kind: 'interact', id: 'whack', target: victim.id }, cost: 0, why: 'he talks', value: 1 }],
      pick: 'whack', best: 'whack', why: 'he talks', day: 0, mode: 'handle', hours: 1, priority: 1,
    };
    expect(actionSurrenders(t, act.options[0].action)).toBe(true);
    const ctx = newCtx(t);
    lieutenantsWeek(ctx, [act], {});
    expect(t.characters[victim.id].alive).toBe(true);
    expect(t.characters[victim.id].faction).toBe('player');
    // With the boss's explicit yes, the order is his and it goes through the usual way.
    const t2 = JSON.parse(JSON.stringify(t)) as GameState;
    lieutenantsWeek(newCtx(t2), [act], { [act.id]: { verdict: 'approve' } });
    expect(t2.briefing?.lt?.log.some((e) => e.actId === act.id && e.result !== 'skipped')).toBe(true);
  });

  it('a trusted advisor\'s routine and "do what they recommend" never include a man\'s life', () => {
    const s = newGame('hand-adv');
    const man = crew(s)[0];
    const item = { id: 'x', routine: true } as never;
    expect(isRoutine(s, item, { id: 'o', label: 'x', action: { kind: 'mymen', op: { op: 'kill', id: man.id, confirm: true } }, chips: [], cost: 0, why: '', value: 0 })).toBe(false);
    expect(isRoutine(s, item, { id: 'o', label: 'x', action: { kind: 'interact', id: 'exile', target: man.id }, chips: [], cost: 0, why: '', value: 0 })).toBe(false);
  });
});
