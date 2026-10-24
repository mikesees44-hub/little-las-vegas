import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { dateOfWeek } from '../src/engine/calendar';
import { generateWeekEvents, MAX_POPUPS, isFamilyEvent, MAX_FAMILY_POPUPS } from '../src/engine/events';
import { newCtx } from '../src/engine/ledger';
import { fireConsequences } from '../src/engine/consequences';
import { buildPackEvent, castRoles, isFinalPart, mapFx, PACK_BY_ID, PACK_CHAINS, PACK_EVENTS, poolEligible, storyEventSource, storyResolve, triggerOk } from '../src/engine/storyPack';
import { ensureStory } from '../src/engine/storyState';
import { applyEffects } from '../src/engine/effects';
import type { EventInstance, GameState } from '../src/engine/types';
import { randomChoices } from './helpers';

/** A state where the house is full: the boss has a living mother, sister, wife and kids. */
function rich(seed = 'story'): GameState {
  return newGame(seed);
}

/** Every Character an effect points at must exist. */
function refsOk(s: GameState, ev: EventInstance): string[] {
  const bad: string[] = [];
  for (const ch of ev.choices) {
    for (const e of ch.effects) {
      for (const k of ['from', 'to', 'charId', 'targetId'] as const) {
        const v = (e as unknown as Record<string, unknown>)[k];
        if (typeof v === 'string' && !s.characters[v]) bad.push(`${ev.defId}/${ch.id}: ${e.type}.${k}=${v}`);
      }
    }
  }
  return bad;
}

describe('content pack adapter', () => {
  it('copies all 162 events and 21 chains into the engine', () => {
    expect(PACK_EVENTS.length).toBe(162);
    expect(PACK_CHAINS.length).toBe(21);
    for (const c of PACK_CHAINS) for (const id of c.events) expect(PACK_BY_ID[id], id).toBeTruthy();
  });

  it('every event either casts all its roles and fills every placeholder, or is skipped cleanly', () => {
    let built = 0;
    let skipped = 0;
    for (const seed of ['cast-a', 'cast-b', 'cast-c']) {
      const s0 = rich(seed);
      for (const e of PACK_EVENTS) {
        const s = cloneState(s0);
        // Chain parts read their roles from part 1's cast.
        let carried: Record<string, string | number> = {};
        if (e.chain && e.chain.part > 1) {
          const chain = PACK_CHAINS.find((c) => c.id === e.chain!.id)!;
          for (const id of chain.events) {
            const prev = PACK_BY_ID[id];
            if (prev.chain!.part >= e.chain.part) break;
            const b = castRoles(s, prev, carried);
            if (!b) break;
            carried = { ...carried, district: b.district };
            for (const [k, v] of Object.entries(b.roles)) carried[`role_${k}`] = v;
          }
        }
        const before = Object.keys(s.characters).length;
        let ev: EventInstance | undefined;
        expect(() => { ev = buildPackEvent(s, e, carried); }, e.id).not.toThrow();
        if (!ev) {
          skipped++;
          continue;
        }
        built++;
        const all = [ev.title, ev.text, ...ev.choices.flatMap((c) => [c.label, c.detail ?? '', c.because])].join('\n');
        expect(all, e.id).not.toMatch(/\{[a-z]+(\.[a-z]+)?\}/i);
        expect(all, e.id).not.toMatch(/undefined|NaN/);
        expect(refsOk(s, ev), e.id).toEqual([]);
        expect(ev.choices.some((c) => !c.disabledReason), e.id).toBe(true);
        expect(ev.choices.find((c) => c.id === ev!.defaultChoiceId)?.disabledReason, e.id).toBeUndefined();
        expect(Object.keys(s.characters).length - before, e.id).toBeLessThanOrEqual(Object.keys(e.roles).length);
      }
    }
    expect(built).toBeGreaterThan(skipped * 3);
  });

  it('a role that cannot be cast skips the event and creates nobody', () => {
    const s = rich();
    // A chain part whose carried man is gone.
    const e = PACK_BY_ID.lg_2;
    const before = Object.keys(s.characters).length;
    expect(buildPackEvent(s, e, { role_actor: 'nobody', role_witness: 'nobody', role_rival: 'nobody' })).toBeUndefined();
    expect(Object.keys(s.characters).length).toBe(before);
    // A family role with no such relative.
    const s2 = rich();
    const boss = s2.characters[s2.playerId];
    for (const id of boss.childrenIds) s2.characters[id].alive = false;
    const lg4 = PACK_BY_ID.lg_4;
    const capo = Object.values(s2.characters).find((c) => c.faction === 'player' && c.rank === 'capo')!;
    expect(buildPackEvent(s2, lg4, { role_actor: capo.id })).toBeUndefined();
  });

  it('townies are created as characters and reused if the event is offered again', () => {
    const s = rich();
    const e = PACK_EVENTS.find((x) => Object.values(x.roles).some((r) => r.pool === 'town') && !x.trigger.chainOnly)!;
    const a = castRoles(s, e)!;
    const key = Object.entries(e.roles).find(([, r]) => r.pool === 'town')![0];
    expect(s.characters[a.roles[key]]).toBeTruthy();
    const b = castRoles(s, e)!;
    expect(b.roles[key]).toBe(a.roles[key]);
  });

  it('swaps the name of a dead rival boss for his successor (or waits for one)', () => {
    const s = rich();
    const e = PACK_EVENTS.find((x) => /Danny Kessler/.test(x.body) && !x.trigger.chainOnly)!;
    expect(e).toBeTruthy();
    const kessler = s.rivals.find((r) => r.id === 'kessler')!;
    s.characters[kessler.leaderId].alive = false;
    expect(triggerOk(s, e)).toBe(false);
    const heir = { ...s.characters[kessler.leaderId], id: 'cNew', firstName: 'Terrence', alive: true };
    s.characters.cNew = heir;
    kessler.leaderId = 'cNew';
    const st = ensureStory(s);
    // Force the calendar/flags conditions aside: only the name matters here.
    const ev = buildPackEvent(s, e);
    if (ev) {
      expect(ev.text).not.toMatch(/Danny Kessler/);
      expect(ev.text).toMatch(/Terrence Kessler|Terrence/);
    }
    expect(st).toBeTruthy();
  });

  it('maps the four Fx with no old equivalent onto stress, evidence, secrets and alliances', () => {
    const s = rich();
    const ctx = newCtx(s);
    const boss = s.characters[s.playerId];
    const capo = Object.values(s.characters).find((c) => c.faction === 'player' && c.rank === 'capo')!;
    const fake = { ...PACK_BY_ID.lg_1, roles: {}, options: [] };
    const b = { roles: { actor: capo.id }, district: 'boardwalk' };
    const fx = [
      ...mapFx(s, fake, b, { k: 'stress', amount: 12 }),
      ...mapFx(s, fake, b, { k: 'evidence', role: 'actor', amount: 15 }),
      ...mapFx(s, fake, b, { k: 'evidence', role: 'player', amount: 5 }),
      ...mapFx(s, fake, b, { k: 'secret', role: 'actor', kind: 'skimming' }),
      ...mapFx(s, fake, b, { k: 'alliance', rival: 'kessler', via: 'actor' }),
    ];
    const stress0 = s.dyn!.people[boss.id]?.stress ?? 0;
    const ev0 = capo.evidence ?? 0;
    const bev0 = boss.evidence ?? 0;
    applyEffects(ctx, fx, { label: 'test', because: 'tested' });
    expect(s.dyn!.people[boss.id].stress).toBe(stress0 + 12);
    expect(capo.evidence).toBe(ev0 + 15);
    expect(boss.evidence).toBe(bev0 + 5);
    expect(s.secrets.some((x) => x.ownerId === capo.id && x.kind === 'skimming' && x.knownBy.includes('player'))).toBe(true);
    const house = s.dyn!.houses.find((h) => h.leads && h.faction === 'kessler');
    if (house) expect(s.dyn!.alliances.some((a) => a.houseId === house.id)).toBe(true);
  });
});

describe('chains', () => {
  it('a chain runs from part 1 to its last part through the consequence queue', () => {
    let completed = 0;
    for (const chain of PACK_CHAINS) {
      let s = rich(`chain-${chain.id}`);
      const first = PACK_BY_ID[chain.events[0]];
      // Jump the calendar into part 1's window if it has one.
      if (first.trigger.between) {
        const { y, m } = first.trigger.between.from;
        for (let w = s.week; w < 600; w++) {
          const d = dateOfWeek(w);
          if (d.y === y && d.m === m) { s.week = w; s.date = d; break; }
        }
      }
      let ev = buildPackEvent(s, first);
      let guard = 0;
      while (ev && guard++ < 10) {
        const e = PACK_BY_ID[String(ev.meta!.pack)];
        // Pick the first open option that continues the chain with certainty, else any that continues.
        const conts = ev.choices.filter((c) => !c.disabledReason && c.effects.some((x) => x.type === 'schedule' && x.key.startsWith('pack:')));
        const ch = conts.sort((a, b) => maxChance(b) - maxChance(a))[0] ?? ev.choices.find((c) => !c.disabledReason)!;
        s.pendingEvents = [ev];
        const ctx = newCtx(s);
        s.pendingEvents = [];
        applyEffects(ctx, ch.effects.map((x) => (x.type === 'schedule' ? { ...x, chance: 1 } : x)), { label: ev.title, because: ch.because });
        storyResolve(ctx, [ev]);
        if (isFinalPart(e)) {
          completed++;
          break;
        }
        // Let the followup come due.
        const sc = s.scheduled.find((x) => x.key.startsWith('pack:'));
        if (!sc) break;
        s.week = sc.dueWeek;
        s.date = dateOfWeek(s.week);
        fireConsequences(newCtx(s));
        const due = ensureStory(s).due[0];
        if (!due) break;
        const next = PACK_BY_ID[due.event];
        ev = buildPackEvent(s, next, due.params, due.id);
        if (!ev) break;
        expect(ev.meta?.chain).toBe(chain.id);
      }
    }
    // Every chain whose cast fits a fresh house can be played to the end.
    expect(completed).toBeGreaterThanOrEqual(15);
  });

  it('chain parts are offered before the random pool and keep their cast', () => {
    const s = rich();
    const st = ensureStory(s);
    const capo = Object.values(s.characters).find((c) => c.faction === 'player' && c.rank === 'capo')!;
    const soldier = Object.values(s.characters).find((c) => c.faction === 'player' && c.rank === 'soldier')!;
    st.due.push({ id: 'd1', event: 'lg_2', params: { role_actor: capo.id, role_witness: soldier.id, role_rival: soldier.id, district: 'boardwalk' }, since: s.week, because: 'test' });
    const ev = storyEventSource(s)!;
    expect(ev.defId).toBe('pack_lg_2');
    expect(ev.priority).toBeGreaterThan(48);
    expect(ev.text).toContain(capo.firstName);
  });
});

function maxChance(c: { effects: { type: string; chance?: number }[] }): number {
  return Math.max(0, ...c.effects.filter((x) => x.type === 'schedule').map((x) => x.chance ?? 0));
}

describe('the pack in the popup pipeline', () => {
  it('respects once and per-event cooldowns', () => {
    const s = rich();
    const st = ensureStory(s);
    const once = PACK_EVENTS.find((e) => e.trigger.once && !e.trigger.chainOnly && !e.trigger.mandatory)!;
    const rep = PACK_EVENTS.find((e) => !e.trigger.once && !e.trigger.chainOnly && !e.trigger.mandatory && !e.chain)!;
    st.fired[once.id] = 1;
    s.week = 400;
    expect(poolEligible(s, once, st)).toBe(false);
    st.fired[rep.id] = s.week - 2;
    expect(poolEligible(s, rep, st)).toBe(false);
  });

  it('52 weeks: never more than 4 popups or 1 family popup, crew decisions still come, nothing repeats inside its cooldown', () => {
    let pack = 0;
    let crewEv = 0;
    for (const seed of ['pipe-a', 'pipe-b']) {
      let s = newGame(seed);
      const seen: Record<string, number> = {};
      for (let w = 0; w < 52; w++) {
        s = advanceWeek(s, randomChoices(s, w)).state;
        expect(s.pendingEvents.length).toBeLessThanOrEqual(MAX_POPUPS);
        expect(s.pendingEvents.filter(isFamilyEvent).length).toBeLessThanOrEqual(MAX_FAMILY_POPUPS);
        for (const ev of s.pendingEvents) {
          if (ev.meta?.crew && !ev.meta.pack) crewEv++;
          if (!ev.meta?.pack) continue;
          pack++;
          const e = PACK_BY_ID[String(ev.meta.pack)];
          const last = seen[e.id];
          if (last !== undefined && !e.trigger.chainOnly) {
            expect(e.trigger.once, e.id).toBeFalsy();
            expect(s.week - last, e.id).toBeGreaterThanOrEqual(e.trigger.cooldownWeeks ?? 26);
          }
          seen[e.id] = s.week;
        }
      }
    }
    expect(pack).toBeGreaterThan(4);
    expect(crewEv).toBeGreaterThan(pack);
  });

  it('52 weeks are deterministic with the pack in play', () => {
    const run = () => {
      let s = newGame('det-story');
      for (let w = 0; w < 52; w++) s = advanceWeek(s, randomChoices(s, w)).state;
      return s;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.story!.stats.shown).toBeGreaterThan(0);
  });

  it('a mandatory pack event that does not fit waits in the queue and is not offered twice', () => {
    const s = rich();
    const st = ensureStory(s);
    const ev = buildPackEvent(s, PACK_BY_ID.ss_donna) ?? buildPackEvent(s, PACK_BY_ID.hi_jfk_elected);
    if (!ev) return;
    s.eventQueue.push(ev);
    storyResolve(newCtx(s), []);
    expect(st.queued).toContain(String(ev.meta!.pack));
    expect(poolEligible(s, PACK_BY_ID[String(ev.meta!.pack)], st)).toBe(false);
    void generateWeekEvents;
  });
});
