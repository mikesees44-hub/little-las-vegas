import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { makeCharacter } from '../src/engine/characters';
import { ageOn, dateOfWeek } from '../src/engine/calendar';
import { applyEffects } from '../src/engine/effects';
import { newCtx } from '../src/engine/ledger';
import { previewAction, resolveActions } from '../src/engine/actions';
import { opinion, getRelation } from '../src/engine/relations';
import {
  activeRomances, attraction, bloodChildren, buildChildEvent, drawnTo, orientationOf, paternityRumored, previewRomance,
  romanceAcceptance, romanceMonth, startRomance,
} from '../src/engine/romance';
import { ensureRomance, orientationFor } from '../src/engine/storyState';
import { genesOf, LOCI } from '../src/ui/portrait/genes';
import { interactionsFor } from '../src/engine/interactions';
import type { Character, GameState } from '../src/engine/types';
import { randomChoices } from './helpers';

function adult(s: GameState, gender: 'M' | 'F', orientation: Character['orientation'], extra: Partial<Character> = {}): Character {
  const c = makeCharacter(s, { gender, age: 30, rank: 'civilian', faction: 'none', nickname: false, traits: [] });
  c.orientation = orientation;
  Object.assign(c, extra);
  return c;
}

describe('orientation', () => {
  it('is fixed at birth from the seed and id, independent of traits, with all four kinds present', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) counts[orientationFor('seed', `c${i}`)] = (counts[orientationFor('seed', `c${i}`)] ?? 0) + 1;
    expect(counts.straight).toBeGreaterThan(3200);
    expect(counts.gay).toBeGreaterThan(100);
    expect(counts.bi).toBeGreaterThan(80);
    expect(counts.ace).toBeGreaterThan(20);
    expect(counts.ace).toBeLessThan(counts.bi);
    const s = newGame('orient');
    for (const c of Object.values(s.characters)) expect(c.orientation).toBe(orientationFor(s.seed, c.id));
  });

  it('gates attraction', () => {
    const s = newGame('attract');
    const m = adult(s, 'M', 'straight');
    const w = adult(s, 'F', 'straight');
    const g = adult(s, 'M', 'gay');
    const g2 = adult(s, 'M', 'gay');
    const bi = adult(s, 'F', 'bi');
    const ace = adult(s, 'F', 'ace');
    expect(drawnTo(s, m, w)).toBe(true);
    expect(drawnTo(s, m, g)).toBe(false);
    expect(drawnTo(s, g, g2)).toBe(true);
    expect(drawnTo(s, g, w)).toBe(false);
    expect(drawnTo(s, bi, w)).toBe(true);
    expect(drawnTo(s, bi, m)).toBe(true);
    expect(drawnTo(s, ace, m)).toBe(false);
    expect(attraction(s, g, w).value).toBe(-100);
    expect(romanceAcceptance(s, w, g, 'court').chance).toBe(0);
    expect(romanceAcceptance(s, m, ace, 'court').chance).toBe(0);
    expect(romanceAcceptance(s, g, g2, 'court').chance).toBeGreaterThan(0);
    // No relationship forms across a mismatch, even when forced.
    expect(startRomance(s, m.id, g.id)).toBeUndefined();
    expect(startRomance(s, m.id, ace.id)).toBeUndefined();
    expect(startRomance(s, g.id, g2.id)?.kind).toBe('lovers');
    expect(startRomance(s, g.id, g2.id)).toBeUndefined();
  });
});

describe('consent', () => {
  it('no relationship forms without the other adult accepting', () => {
    const base = newGame('consent');
    const boss = base.characters[base.playerId];
    const target = adult(base, boss.gender === 'M' ? 'F' : 'M', 'straight', { traits: ['Pious', 'Honest'] });
    boss.orientation = 'straight';
    let formed = 0;
    let refused = 0;
    for (let i = 0; i < 40; i++) {
      const s = cloneState(base);
      s.rng = (s.rng + i * 7919) >>> 0;
      const a = { kind: 'interact' as const, id: 'affair' as const, target: target.id };
      const p = previewAction(s, a);
      expect(p.acceptance).toBeTruthy();
      expect(p.acceptance!.reasons.some((r) => r.label === 'Pious')).toBe(true);
      const ctx = newCtx(s);
      resolveActions(ctx, [a]);
      if (activeRomances(s, boss.id).length) formed++;
      else refused++;
    }
    expect(refused).toBeGreaterThan(formed);
    expect(formed + refused).toBe(40);
  });

  it('minors are never part of it', () => {
    const s = newGame('minor');
    const boss = s.characters[s.playerId];
    const kid = makeCharacter(s, { gender: boss.gender === 'M' ? 'F' : 'M', age: 16, rank: 'civilian', faction: 'none' });
    kid.orientation = 'straight';
    expect(previewRomance(s, 'court', kid)).toBeUndefined();
    expect(previewRomance(s, 'affair', kid)).toBeUndefined();
    expect(romanceAcceptance(s, boss, kid, 'affair').chance).toBe(0);
    expect(startRomance(s, boss.id, kid.id)).toBeUndefined();
    // NPC months never pair anyone under 18.
    let st = newGame('minor-npc');
    for (let w = 0; w < 104; w++) st = advanceWeek(st, randomChoices(st, w)).state;
    for (const r of st.romance?.rels ?? []) {
      for (const id of [r.a, r.b]) expect(ageOn(st.characters[id].birth, dateOfWeek(r.since))).toBeGreaterThanOrEqual(18);
    }
  });

  it('the boss sees his romance options with acceptance reasons in the interactions menu', () => {
    const s = newGame('menu');
    const boss = s.characters[s.playerId];
    const target = adult(s, boss.gender === 'M' ? 'F' : 'M', 'straight');
    boss.orientation = 'bi';
    const ids = interactionsFor(s, target.id).map((p) => p.id);
    expect(ids).toContain('affair');
    const p = interactionsFor(s, target.id).find((x) => x.id === 'affair')!;
    expect(p.acceptance!.reasons.length).toBeGreaterThan(1);
    const spouse = boss.spouseId ? s.characters[boss.spouseId] : undefined;
    if (spouse) expect(interactionsFor(s, spouse.id).map((x) => x.id)).toContain('separate');
  });
});

describe('NPC romance', () => {
  it('NPCs court, take lovers, have affairs and end them on their own', () => {
    const totals = { courtships: 0, affairs: 0, ended: 0, marriages: 0, rejected: 0 };
    for (const seed of ['npc-a', 'npc-b']) {
      let s = newGame(seed);
      for (let w = 0; w < 260; w++) s = advanceWeek(s, randomChoices(s, w)).state;
      const st = s.romance!.stats;
      totals.courtships += st.courtships;
      totals.affairs += st.affairs;
      totals.ended += st.ended;
      totals.marriages += st.marriages;
      totals.rejected += st.rejected;
      // Everyone in an active romance is alive and of age.
      for (const r of activeRomances(s)) for (const id of [r.a, r.b]) expect(s.characters[id].alive).toBe(true);
    }
    expect(totals.courtships).toBeGreaterThan(0);
    expect(totals.affairs).toBeGreaterThan(0);
    expect(totals.ended).toBeGreaterThan(0);
    expect(totals.rejected).toBeGreaterThan(0);
  });
});

describe('paternity', () => {
  it('a child of an affair is passed off as the husband\'s; the portrait follows the biological father', () => {
    const s = newGame('paternity');
    const ctx = newCtx(s);
    const boss = s.characters[s.playerId];
    boss.gender = 'M';
    boss.orientation = 'straight';
    const husband = adult(s, 'M', 'straight');
    const wife = adult(s, 'F', 'straight', { spouseId: husband.id });
    husband.spouseId = wife.id;
    const r = startRomance(s, boss.id, wife.id)!;
    expect(r.kind).toBe('affair');
    expect(r.secret).toBe(true);
    const R = ensureRomance(s);
    R.pregnancies.push({ id: 'pg1', motherId: wife.id, fatherId: boss.id, romanceId: r.id, dueWeek: s.week });
    romanceMonth(ctx);
    const child = Object.values(s.characters).find((c) => c.motherId === wife.id)!;
    expect(child).toBeTruthy();
    expect(child.fatherId).toBe(husband.id);
    expect(child.bioFatherId).toBe(boss.id);
    expect(husband.childrenIds).toContain(child.id);
    expect(boss.childrenIds).not.toContain(child.id);
    expect(bloodChildren(s, boss).map((c) => c.id)).toContain(child.id);
    expect(paternityRumored(s, child)).toBe(true);
    // The boss is asked what to do about his child.
    expect(s.eventQueue.some((e) => e.defId === 'rom_child' && e.meta?.subject === child.id)).toBe(true);
    // Portrait genes: same as if the real father were the father of record, not the husband's.
    const g = genesOf(s.seed, child);
    const asBio = genesOf(s.seed, { id: child.id, fatherId: boss.id, motherId: wife.id });
    const asLegal = genesOf(s.seed, { id: child.id, fatherId: husband.id, motherId: wife.id });
    expect(g).toEqual(asBio);
    expect(LOCI.some((l) => g[l] !== asLegal[l])).toBe(true);
  });

  it('acknowledge, legitimize, pay or deny each do what they say', () => {
    const setup = () => {
      const s = newGame('child-opts');
      const boss = s.characters[s.playerId];
      boss.gender = 'M';
      const husband = adult(s, 'M', 'straight');
      const wife = adult(s, 'F', 'straight', { spouseId: husband.id });
      husband.spouseId = wife.id;
      const child = makeCharacter(s, { gender: 'M', age: 0, rank: 'civilian', faction: 'none', nickname: false });
      child.fatherId = husband.id;
      child.motherId = wife.id;
      child.bioFatherId = boss.id;
      husband.childrenIds.push(child.id);
      wife.childrenIds.push(child.id);
      return { s, boss, husband, wife, child, ev: buildChildEvent(s, child) };
    };
    const pick = (id: string) => {
      const x = setup();
      const ch = x.ev.choices.find((c) => c.id === id)!;
      applyEffects(newCtx(x.s), ch.effects, { label: 't', because: 't' });
      return x;
    };
    const ids = setup().ev.choices.map((c) => c.id);
    expect(ids).toEqual(['pay', 'ack', 'legit', 'deny']);
    const legit = pick('legit');
    expect(legit.child.fatherId).toBe(legit.boss.id);
    expect(legit.child.dynasty).toBe(true);
    expect(legit.child.bioFatherId).toBeUndefined();
    expect(legit.husband.childrenIds).not.toContain(legit.child.id);
    expect(opinion(legit.s, legit.husband.id, legit.boss.id)).toBeLessThan(-30);
    const pay = pick('pay');
    expect(pay.child.fatherId).toBe(pay.husband.id);
    expect(pay.s.secrets.some((x) => x.ownerId === pay.boss.id && x.kind === 'bastard')).toBe(true);
    const deny = pick('deny');
    expect(opinion(deny.s, deny.wife.id, deny.boss.id)).toBeLessThan(0);
    expect(deny.s.dyn?.people[deny.child.id]?.bastardOf).toBe(deny.boss.id);
    const ack = pick('ack');
    expect(opinion(ack.s, ack.wife.id, ack.boss.id)).toBeGreaterThan(0);
  });
});

describe('discovery', () => {
  it('a discovered affair has consequences: the husband, the wife, the crew and a usable secret', () => {
    const s = newGame('discover');
    const boss = s.characters[s.playerId];
    boss.gender = 'M';
    boss.orientation = 'straight';
    const capo = Object.values(s.characters).find((c) => c.faction === 'player' && c.rank === 'capo')!;
    const wife = adult(s, 'F', 'straight', { spouseId: capo.id });
    capo.spouseId = wife.id;
    const r = startRomance(s, wife.id, boss.id)!;
    expect(r).toBeTruthy();
    r.exposure = 100;
    const before = opinion(s, capo.id, boss.id);
    const respect0 = s.respect;
    // Run months until the exposure roll lands (it is 25% a month at full exposure).
    for (let i = 0; i < 80 && r.discovered === undefined; i++) {
      r.exposure = 100;
      r.ended = undefined;
      romanceMonth(newCtx(s));
    }
    expect(r.discovered).toBeDefined();
    expect(opinion(s, capo.id, boss.id)).toBeLessThan(before - 30);
    expect(getRelation(s, capo.id, boss.id)!.grievance).toBeGreaterThanOrEqual(40);
    expect(opinion(s, capo.id, wife.id)).toBeLessThan(0);
    expect(s.secrets.some((x) => x.ownerId === wife.id && x.kind === 'affair')).toBe(true);
    expect(s.respect).toBeLessThanOrEqual(respect0);
    expect(s.eventQueue.some((e) => e.defId === 'rom_found')).toBe(true);
    expect(s.romance!.alerts.length).toBeGreaterThan(0);
  });

  it('a same-sex couple is never a lever for the player: no secret is created, and the only answer is protection', () => {
    const s = newGame('dangerous');
    const capo = Object.values(s.characters).find((c) => c.faction === 'player' && c.rank === 'capo')!;
    capo.orientation = 'gay';
    const partner = adult(s, 'M', 'gay');
    const r = startRomance(s, capo.id, partner.id)!;
    expect(r.secret).toBe(true);
    for (let i = 0; i < 80 && r.discovered === undefined; i++) {
      r.exposure = 100;
      r.ended = undefined;
      romanceMonth(newCtx(s));
    }
    expect(r.discovered).toBeDefined();
    expect(s.secrets.some((x) => x.ownerId === capo.id || x.ownerId === partner.id)).toBe(false);
    const threat = s.eventQueue.find((e) => e.defId === 'rom_threat')!;
    expect(threat).toBeTruthy();
    for (const ch of threat.choices) for (const e of ch.effects) expect(['hook', 'secretKnown', 'startScheme']).not.toContain(e.type);
    expect(interactionsFor(s, capo.id).some((p) => p.id === 'expose')).toBe(false);
  });

  it('orientation never changes and is not affected by events', () => {
    let s = newGame('stable');
    const snap = Object.fromEntries(Object.values(s.characters).map((c) => [c.id, c.orientation]));
    for (let w = 0; w < 30; w++) s = advanceWeek(s, randomChoices(s, w)).state;
    for (const [id, o] of Object.entries(snap)) expect(orientationOf(s, s.characters[id])).toBe(o);
  });
});
