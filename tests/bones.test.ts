import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { applyEffects } from '../src/engine/effects';
import { newCtx } from '../src/engine/ledger';
import { crew } from '../src/engine/characters';
import { opinion } from '../src/engine/relations';
import { bonesFromScheme, bonesWeek, bonesLine, bonesOutcome, buildBonesOffer, FAVOR_COST, hasBones, mayPropose, oldTimers, recordBones } from '../src/engine/bones';
import { ensureBones } from '../src/engine/bonesState';
import type { Character, GameState } from '../src/engine/types';

function prospect(s: GameState): Character {
  return crew(s).find((c) => c.rank === 'associate' && !c.specialty && !c.dynasty)!;
}

describe('making your bones', () => {
  it('a prospect without bones cannot be proposed — by order, interaction, or a direct effect', () => {
    let s = newGame('bones-gate');
    s.money = 50000;
    const a = prospect(s);
    expect(hasBones(a)).toBe(false);
    expect(mayPropose(s, a)).toBe(false);
    expect(previewAction(s, { kind: 'propose', charId: a.id }).disabledReason).toMatch(/bones/);
    expect(previewAction(s, { kind: 'interact', id: 'make', target: a.id }).disabledReason).toMatch(/bones/);
    // Even a stray effect does not get his name to Philadelphia.
    const ctx = newCtx(s);
    applyEffects(ctx, [{ type: 'propose', charId: a.id, voucherId: s.playerId }], { label: 't', because: 't' });
    expect(s.characters[a.id].proposedWeek).toBeUndefined();
    s = advanceWeek(s, { actions: [{ kind: 'propose', charId: a.id }] }).state;
    expect(s.characters[a.id].proposedWeek).toBeUndefined();
    // With bones on his record he can.
    recordBones(s, s.characters[a.id], 'Garden Pier job', 'heist', 'on the crew', 'Did the job.');
    expect(previewAction(s, { kind: 'propose', charId: a.id }).disabledReason).toBeUndefined();
    s = advanceWeek(s, { actions: [{ kind: 'propose', charId: a.id }] }).state;
    expect(s.characters[a.id].proposedWeek).toBeDefined();
  });

  it('the favor path: Philadelphia makes him without bones, and the old-timers remember', () => {
    let s = newGame('bones-favor');
    s.money = 50000;
    const a = prospect(s);
    const olds = oldTimers(s);
    expect(olds.length).toBeGreaterThan(0);
    const before = Object.fromEntries(olds.map((m) => [m.id, opinion(s, m.id, s.playerId)]));
    const philly = s.rivals.find((r) => r.id === 'philly')!;
    const pBefore = opinion(s, philly.leaderId, s.playerId);
    const p = previewAction(s, { kind: 'bones', op: { op: 'favor', charId: a.id } });
    expect(p.disabledReason).toBeUndefined();
    expect(p.cost).toBe(FAVOR_COST);
    const r = advanceWeek(s, { actions: [{ kind: 'bones', op: { op: 'favor', charId: a.id } }] });
    s = r.state;
    expect(s.characters[a.id].proposedWeek).toBeDefined();
    expect(hasBones(s.characters[a.id])).toBe(false);
    expect(s.bones!.waived[a.id]).toBeDefined();
    expect(r.report.lines.some((l) => l.stat === 'money' && l.amount === -FAVOR_COST && /favor/i.test(l.label))).toBe(true);
    expect(opinion(s, philly.leaderId, s.playerId)).toBeLessThan(pBefore);
    const hurt = olds.filter((m) => s.characters[m.id].alive && s.relations[`${m.id}>${s.playerId}`]?.modifiers.some((x) => /without his bones/.test(x.reason)));
    expect(hurt.length).toBe(olds.filter((m) => s.characters[m.id].alive).length);
    expect(hurt.some((m) => opinion(s, m.id, s.playerId) <= before[m.id])).toBe(true);
  });

  it('a bones job resolves deterministically and goes on his record with the date and the job', () => {
    const base = newGame('bones-job');
    base.money = 50000;
    const a = prospect(base);
    const play = () => {
      let s = cloneState(base);
      s = advanceWeek(s, { actions: [{ kind: 'bones', op: { op: 'assign', charId: a.id, kind: 'heist' } }] }).state;
      expect(s.bones!.jobs.some((j) => j.prospectId === a.id)).toBe(true);
      for (let w = 0; w < 5 && s.bones!.jobs.some((j) => j.prospectId === a.id); w++) s = advanceWeek(s, {}).state;
      return s;
    };
    const s1 = play();
    const s2 = play();
    const h1 = s1.bones!.history.find((h) => h.prospectId === a.id)!;
    const h2 = s2.bones!.history.find((h) => h.prospectId === a.id)!;
    expect(h1).toBeTruthy();
    expect(h1).toEqual(h2);
    expect(s1.characters[a.id].bones).toEqual(s2.characters[a.id].bones);
    const job = s1.bones!.history.find((h) => h.prospectId === a.id)!;
    const c = s1.characters[a.id];
    const receipt = s1.ledgerBook!.receipts.find((r) => r.byId === a.id)!;
    expect(receipt).toBeTruthy();
    if (hasBones(c)) {
      const e = c.bones![0];
      expect(e.job).toBe(job.name);
      expect(e.year).toBeGreaterThanOrEqual(1960);
      expect(bonesLine(e)).toMatch(/^Made his bones: 19\d\d, the .+ job$/);
      // Only an honest report of freezing keeps the bones off; a lie puts them on unverified.
      if (job.outcome === 'froze') expect(e.verified).toBe(false);
    } else expect(job.outcome).toBe('froze');
  });

  it('his traits decide: cowards freeze, hotheads go too hard, drinkers talk', () => {
    const s = newGame('bones-traits');
    const a = prospect(s);
    const count = (c: Character) => {
      const n: Record<string, number> = { clean: 0, froze: 0, talked: 0, hothead: 0 };
      for (let i = 0; i < 300; i++) n[bonesOutcome(s, c, `j${i}`, 'heist')]++;
      return n;
    };
    const coward: Character = { ...a, id: 'coward', traits: ['Cowardly'], attributes: { ...a.attributes, force: 20, discipline: 30 }, attrs: undefined };
    const hot: Character = { ...a, id: 'hot', traits: ['Hot-headed', 'Cruel'], attributes: { ...a.attributes, force: 75, discipline: 40 }, attrs: undefined };
    const talker: Character = { ...a, id: 'talker', traits: ['Drinker', 'Charming'], attributes: { ...a.attributes, force: 60, discipline: 50 }, attrs: undefined };
    const cw = count(coward);
    const ht = count(hot);
    const tk = count(talker);
    expect(cw.froze).toBeGreaterThan(ht.froze);
    expect(ht.hothead).toBeGreaterThan(cw.hothead);
    expect(tk.talked).toBeGreaterThan(ht.talked / 2);
    // Pure: the same man and job always come out the same.
    expect(bonesOutcome(s, hot, 'j7', 'heist')).toBe(bonesOutcome(s, hot, 'j7', 'heist'));
  });

  it('the sponsor brings the job: the decision lists the jobs with the odds', () => {
    const s = newGame('bones-offer');
    const a = prospect(s);
    const ev = buildBonesOffer(s, a);
    expect(ev.defId).toBe('bones_offer');
    expect(ev.choices.map((c) => c.id)).toEqual(expect.arrayContaining(['heist', 'collection', 'wait']));
    expect(ev.choices.find((c) => c.id === 'heist')!.detail).toMatch(/Does it: \d+%/);
  });

  it('a hit or a heist he was on makes his bones, and so does a pinch where he stood up', () => {
    const s = newGame('bones-scheme');
    const [a, b] = crew(s).filter((c) => c.rank === 'associate' && !c.specialty);
    const ctx = newCtx(s);
    const sc = { id: 'sc-test', kind: 'heist' as const, owner: 'player' as const, ownerId: s.playerId, agents: [a.id], opts: { depth: 'planned' as const, heist: 'jewelry' as const }, progress: 100, startWeek: 1, discovered: false, because: 'robbed a jewelry exchange' };
    bonesFromScheme(ctx, sc, [a], true);
    const out = s.bones!.history.find((h) => h.prospectId === a.id)!;
    expect(out.kind).toBe('heist');
    expect(hasBones(a) || out.outcome === 'froze').toBe(true);
    applyEffects(ctx, [{ type: 'bones', op: { op: 'pinch', charId: b.id } }], { label: 'stood up', because: 'stood up' });
    expect(b.bones?.[0].kind).toBe('pinch');
    expect(b.bones?.[0].role).toBe('stood up');
  });

  it('rival families make bones too, and some of it lands on your people', () => {
    let s = newGame('bones-rivals');
    for (let w = 0; w < 104 && !s.gameOver; w++) s = advanceWeek(s, {}).state;
    const b = ensureBones(s);
    expect(b.stats.rivalJobs).toBeGreaterThan(0);
    const rivalDone = b.history.filter((h) => h.owner !== 'player');
    expect(rivalDone.length).toBeGreaterThan(0);
    // A rival prospect who did it is made in his own family, with his bones on his record.
    const made = rivalDone.filter((h) => h.outcome !== 'froze').map((h) => s.characters[h.prospectId]);
    for (const m of made) {
      expect(hasBones(m)).toBe(true);
      expect(m.faction).not.toBe('player');
    }
  });

  it('a man with bones and no opening in the books gets restless; a man made ahead of him is a grievance', () => {
    const s = newGame('bones-restless');
    const [a, b] = crew(s).filter((c) => c.rank === 'associate' && !c.specialty);
    recordBones(s, a, 'Hunt\'s Pier job', 'collection', 'collector', 'Stood there and did not blink.');
    s.week = 40;
    s.books = { open: false, slots: 0, nextChange: 999 };
    bonesWeek(newCtx(s));
    const mods = s.relations[`${a.id}>${s.playerId}`]?.modifiers ?? [];
    expect(mods.some((m) => /still waiting/.test(m.reason))).toBe(true);
    expect(s.bones!.stats.restless).toBe(1);
    // Only once in a while, not every week.
    bonesWeek(newCtx(s));
    expect(s.bones!.stats.restless).toBe(1);
    // The other one is made ahead of him without bones (a favor): a passed-over grievance.
    const ctx = newCtx(s);
    applyEffects(ctx, [{ type: 'making', charId: b.id }], { label: 'made', because: 'made' });
    expect(s.characters[b.id].madeWeek).toBe(s.week);
    bonesWeek(ctx);
    expect(s.power?.grievances.some((g) => g.charId === a.id && g.post === 'membership' && g.winnerId === b.id)).toBe(true);
  });
});
