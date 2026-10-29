import { describe, expect, it } from 'vitest';
import { ageOn } from '../src/engine/calendar';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { newGameWith, type StartId } from '../src/engine/starts';
import { validateHierarchy } from '../src/engine/hierarchy';
import { AGE_RANGE, BUDGET, creatorBase, pointsSpent, traitCost, validateCharOptions, type CharOptions } from '../src/engine/charCreate';
import { NICKNAMES } from '../src/engine/names';
import { nicknameOrigin, suggestNickname } from '../src/engine/nicknames';
import { deleteSlot, listSlots, loadSlot, migrateLegacy, saveSlot, type KV } from '../src/ui/save';
import { genesOf, LOCI, registerAppearances, setGeneOverride } from '../src/ui/portrait/genes';
import type { GameState } from '../src/engine/types';

const STARTS: StartId[] = ['classic', 'sees', 'rise', 'associate', 'soldier', 'capo'];

function custom(start: StartId): CharOptions {
  const [lo, hi] = AGE_RANGE[start];
  return {
    firstName: 'Michele', nickname: 'Taffy', sex: 'M', age: Math.round((lo + hi) / 2), birthplace: 'calabria', houseName: 'Avalon',
    appearance: { genes: { nose: 0.3, hair: 0.1 }, hair: 'pomp', stache: 'pencil' },
    skills: { force: 4, business: 3 }, groups: { criminal: 2 }, traits: ['Patient', 'Greedy'], lifestyle: 'muscle',
    background: 'docks', vice: 'horses', married: true, spouseName: 'Loretta', kids: start === 'sees' ? 4 : 2, motherAlive: false,
  };
}

function play(s: GameState, weeks: number) {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    const r = advanceWeek(s, {});
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
  }
  return s;
}

function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('character creator', () => {
  it('applies charOptions deterministically', () => {
    const a = newGameWith('cc1', 'classic', custom('classic'));
    const b = newGameWith('cc1', 'classic', custom('classic'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const boss = a.characters[a.playerId];
    expect(boss.firstName).toBe('Michele');
    expect(boss.nickname).toBe('Taffy');
    expect(a.houseName).toBe('Avalon');
    expect(boss.lastName).toBe('Avalon');
    expect(boss.traits).toEqual(['Patient', 'Greedy']);
    expect(boss.vices).toEqual(['horses']);
    expect(boss.lifestyle?.focus).toBe('muscle');
    expect(boss.appearance?.hair).toBe('pomp');
    expect(ageOn(boss.birth, a.date)).toBe(46);
    const base = newGameWith('cc1', 'classic').characters[a.playerId];
    expect(boss.attributes.force).toBe(Math.min(95, base.attributes.force + 4 + 3 + 4)); // picks + Calabria + docks
    const sp = a.characters[boss.spouseId!];
    expect(sp.firstName).toBe('Loretta');
    expect(boss.childrenIds.filter((id) => a.characters[id]?.alive)).toHaveLength(2);
    expect(a.characters[boss.motherId!].alive).toBe(false);
    // The docks background: a secret on the councilman and a hook.
    const dough = Object.values(a.characters).find((c) => c.office === 'City councilman')!;
    expect(a.secrets.some((x) => x.ownerId === dough.id && x.knownBy.includes('player'))).toBe(true);
    expect(a.hooks.some((h) => h.targetId === dough.id && h.holder === 'player')).toBe(true);
    expect(a.chronicle[0].text).toContain('Michele');
    expect(boss.story?.some((e) => e.text.includes('Taffy'))).toBe(true);
  });

  it('enforces the point budget', () => {
    const s = newGameWith('cc2', 'classic');
    const base = creatorBase(s, 'classic');
    const keep = pointsSpent(base, {});
    expect(keep).toBe(base.budget - BUDGET);
    const over: CharOptions = { traits: ['Patient', 'Charming', 'Ambitious'], skills: { leadership: 10, business: 10, diplomacy: 10, intrigue: 10 } };
    expect(validateCharOptions(base, over).some((e) => e.startsWith('Over budget'))).toBe(true);
    expect(() => newGameWith('cc2', 'classic', over)).toThrow(/Over budget/);
    // Flaws and a vice buy points back.
    const bought: CharOptions = { traits: ['Patient', 'Drinker', 'Cowardly'], vice: 'cards', skills: { leadership: 10, business: 10 } };
    // Counted against the start as written: its own traits are free.
    expect(pointsSpent(base, bought)).toBe(6 - 5 - 6 - 2 + 20 - traitCost(base.traits));
    expect(validateCharOptions(base, { skills: { force: 11 } }).length).toBeGreaterThan(0);
    expect(validateCharOptions(base, { age: 90 }).length).toBeGreaterThan(0);
  });

  it('rejects opposite traits and too many traits', () => {
    const base = creatorBase(newGameWith('cc3', 'classic'), 'classic');
    expect(validateCharOptions(base, { traits: ['Patient', 'Hot-headed'] })).toContain('Hot-headed and Patient are opposites.');
    expect(validateCharOptions(base, { traits: ['Greedy', 'Honest'] }).some((e) => e.includes('opposites'))).toBe(true);
    expect(validateCharOptions(base, { traits: ['Greedy', 'Drinker', 'Gambler', 'Cruel'] }).some((e) => e.includes('At most'))).toBe(true);
    expect(() => newGameWith('cc3', 'classic', { traits: ['Pious', 'Womanizer'] })).toThrow(/opposites/);
  });

  it('every start honors custom options and plays', () => {
    for (const st of STARTS) {
      const o = custom(st);
      const s = newGameWith(`cc4-${st}`, st, o);
      const boss = s.characters[s.playerId];
      expect(boss.firstName, st).toBe('Michele');
      expect(s.houseName, st).toBe('Avalon');
      expect(boss.traits, st).toEqual(['Patient', 'Greedy']);
      expect(ageOn(boss.birth, s.date), st).toBe(o.age);
      expect(boss.childrenIds.filter((id) => s.characters[id]?.alive).length, st).toBe(o.kids);
      expect(s.flags[`start_${st}`] ?? (st === 'classic' ? 1 : 0), st).toBe(1);
      expect(validateHierarchy(s), st).toEqual([]);
      play(s, 8);
    }
  });

  it('a woman boss, single with children, an Irish house, hard economy', () => {
    const plain = newGameWith('cc5', 'rise');
    const s = newGameWith('cc5', 'rise', { sex: 'F', firstName: 'Kathleen', nickname: 'Duchess', birthplace: 'cork', married: false, kids: 1, hard: true, age: 30 });
    const boss = s.characters[s.playerId];
    expect(boss.gender).toBe('F');
    expect(boss.ethnicity).toBe('Irish');
    expect(s.flags.ironman).toBe(1);
    expect(s.money).toBe(Math.round(plain.money * 0.6));
    expect(s.debts.length).toBe(plain.debts.length + 1);
    const kids = boss.childrenIds.map((id) => s.characters[id]).filter((k) => k?.alive);
    expect(kids).toHaveLength(1);
    expect(kids[0].motherId).toBe(boss.id);
    if (boss.spouseId) expect(s.characters[boss.spouseId].alive).toBe(false);
    play(s, 6);
  });

  it('a created character flows into the Made-the-Boss opening scene on every start', () => {
    for (const st of STARTS) {
      const s = newGameWith(`cc7-${st}`, st, custom(st));
      const ev = s.pendingEvents[0];
      expect(ev.defId, st).toBe('made_boss');
      expect(s.pendingEvents.filter((e) => e.defId === 'made_boss'), st).toHaveLength(1);
      expect(ev.actors?.[0], st).toBe(s.playerId);
      expect(s.characters[ev.actors![0]].firstName, st).toBe('Michele');
      expect(s.pendingEvents.length, st).toBeLessThanOrEqual(4);
    }
  });

  it('nicknames come with an origin story', () => {
    for (const n of NICKNAMES) expect(nicknameOrigin(n), n).toBeTruthy();
    const a = suggestNickname('x', false);
    expect(a).toEqual(suggestNickname('x', false));
    expect(a.origin.length).toBeGreaterThan(10);
    expect(suggestNickname('y', true).origin).toBeTruthy();
  });

  it('chosen genes drive the portrait and pass to children', () => {
    const genes = Object.fromEntries(LOCI.map((l) => [l, 0.123]));
    const s = newGameWith('cc6', 'classic', { appearance: { genes } });
    const boss = s.characters[s.playerId];
    expect(genesOf(s.seed, boss).nose).toBe(0.123);
    const kid = s.characters[boss.childrenIds[0]];
    const before = genesOf(s.seed, kid);
    registerAppearances(s.seed, s.characters);
    const after = genesOf(s.seed, kid);
    expect(Object.values(after).some((v) => v === 0.123)).toBe(true);
    expect(after).not.toEqual(before);
    setGeneOverride(s.seed, boss.id, undefined);
  });
});

describe('save slots', () => {
  it('round-trip three slots, list them, delete one', () => {
    const kv = memKV();
    const a = newGameWith('slot1', 'classic');
    const b = newGameWith('slot2', 'sees');
    expect(saveSlot(1, a, kv)).toBe(true);
    expect(saveSlot(3, b, kv)).toBe(true);
    expect(JSON.stringify(loadSlot(1, kv))).toBe(JSON.stringify(a));
    expect(JSON.stringify(loadSlot(3, kv))).toBe(JSON.stringify(b));
    const list = listSlots(kv);
    expect(list[0]?.house).toBe(a.houseName);
    expect(list[1]).toBeUndefined();
    expect(list[2]?.house).toBe('Sees');
    expect(list[2]?.boss).toContain('Salvatore');
    deleteSlot(1, kv);
    expect(loadSlot(1, kv)).toBeUndefined();
    expect(listSlots(kv)[0]).toBeUndefined();
  });

  it('the old single save becomes slot 1', () => {
    const kv = memKV();
    const a = newGameWith('legacy', 'classic');
    kv.setItem('little-las-vegas:save:v2', JSON.stringify(a));
    migrateLegacy(kv);
    expect(loadSlot(1, kv)?.seed).toBe('legacy');
    expect(kv.getItem('little-las-vegas:save:v2')).toBeNull();
  });

  it('survives broken storage', () => {
    const bad: KV = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('x'); } };
    expect(saveSlot(1, newGameWith('bad', 'classic'), bad)).toBe(false);
    expect(loadSlot(1, bad)).toBeUndefined();
    expect(listSlots(bad)).toEqual([undefined, undefined, undefined]);
    expect(() => deleteSlot(1, bad)).not.toThrow();
  });
});
