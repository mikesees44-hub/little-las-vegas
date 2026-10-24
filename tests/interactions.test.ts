import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { previewAction } from '../src/engine/actions';
import { alerts } from '../src/engine/alerts';
import { crew } from '../src/engine/characters';
import { advanceWeek } from '../src/engine/engine';
import { interactionsFor, previewInteraction } from '../src/engine/interactions';
import { newGame } from '../src/engine/newGame';
import { addOpinion, opinion } from '../src/engine/relations';
import { Portrait } from '../src/ui/portrait/Portrait';

describe('character interactions', () => {
  it('every interaction is named, and acceptance odds are bounded with a breakdown', () => {
    const s = newGame('inter');
    for (const c of Object.values(s.characters).filter((x) => x.alive && x.id !== s.playerId)) {
      for (const p of interactionsFor(s, c.id)) {
        expect(p.title.length).toBeGreaterThan(3);
        const a = previewAction(s, { kind: 'interact', id: p.id, target: c.id });
        for (const e of a.effects) expect(e.label).toBeTruthy();
        if (p.acceptance) {
          expect(p.acceptance.chance).toBeGreaterThanOrEqual(0.05);
          expect(p.acceptance.chance).toBeLessThanOrEqual(0.95);
          expect(p.acceptance.reasons[0].label).toBe('Base');
        }
      }
    }
  });
  it('the boss cannot interact with himself', () => {
    const s = newGame('self');
    expect(interactionsFor(s, s.playerId)).toEqual([]);
  });
  it('a gift raises opinion under a named reason', () => {
    const s = newGame('gift');
    const c = crew(s)[0];
    const before = opinion(s, c.id, s.playerId);
    const r = advanceWeek(s, { actions: [{ kind: 'interact', id: 'gift_large', target: c.id }] });
    expect(opinion(r.state, c.id, r.state.playerId)).toBeGreaterThan(before);
    expect(r.report.lines.some((l) => l.label === `Gift to ${c.firstName}`)).toBe(true);
  });
  it('requests can be refused, and refusal has its own consequences', () => {
    let accepted = 0;
    let refused = 0;
    for (let i = 0; i < 40; i++) {
      const s = newGame(`dem${i}`);
      const c = crew(s).find((x) => x.rank === 'capo')!;
      c.wealth = 10000;
      const r = advanceWeek(s, { actions: [{ kind: 'interact', id: 'demand', target: c.id }] });
      if (r.log.some((l) => l.endsWith('— accepted.'))) accepted++;
      if (r.log.some((l) => l.endsWith('— refused.'))) {
        refused++;
        expect(r.report.lines.some((l) => l.label.includes('refused'))).toBe(true);
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
  });
  it('making a man, exiling and whacking work through the right systems', () => {
    let s = newGame('orders2');
    const assoc = crew(s).find((x) => x.rank === 'associate')!;
    const soldier = crew(s).find((x) => x.rank === 'soldier')!;
    s.money = 50000;
    s = advanceWeek(s, { actions: [{ kind: 'interact', id: 'make', target: assoc.id }, { kind: 'interact', id: 'exile', target: soldier.id }] }).state;
    // Making goes through the membership pipeline: proposed, then made when Philadelphia's books open.
    expect(s.characters[assoc.id].rank).toBe('associate');
    expect(s.characters[assoc.id].proposedWeek).toBeDefined();
    expect(s.characters[soldier.id].faction).toBe('none');
    s.books = { open: true, slots: 2, nextChange: s.week + 30 };
    for (let w = 0; w < 6 && s.characters[assoc.id].rank === 'associate'; w++) {
      const ev = s.pendingEvents.find((e) => e.defId === 'making' && e.meta?.charId === assoc.id);
      s = advanceWeek(s, ev ? { choices: { [ev.iid]: 'make' } } : {}).state;
    }
    expect(s.characters[assoc.id].rank).toBe('soldier');
    const victim = crew(s).find((x) => x.rank === 'soldier' && x.id !== assoc.id)!;
    s = advanceWeek(s, { actions: [{ kind: 'interact', id: 'whack', target: victim.id }] }).state;
    expect(s.characters[victim.id].alive).toBe(false);
    expect(s.characters[victim.id].death?.killer).toBe('player');
  });
  it('pushing into a district raises your share there', () => {
    const s = newGame('push');
    const d = s.districts.find((x) => x.id === 'crest')!;
    const before = d.influence.player ?? 0;
    const r = advanceWeek(s, { actions: [{ kind: 'pushDistrict', district: 'crest' }] });
    expect(r.state.districts.find((x) => x.id === 'crest')!.influence.player).toBeGreaterThan(before);
  });
  it('recruiting a rival soldier needs his consent', () => {
    const s = newGame('poach');
    const capo = crew(s)[0];
    expect(previewInteraction(s, 'recruit', capo.id)).toBeUndefined();
  });
});

describe('alerts', () => {
  it('flags an unhappy capo with a link to him', () => {
    const s = newGame('alert');
    const c = crew(s).find((x) => x.rank === 'capo')!;
    addOpinion(s, c.id, s.playerId, 'Test grudge', -80, 0);
    const a = alerts(s).find((x) => x.kind === 'unhappy' && x.charId === c.id);
    expect(a).toBeTruthy();
  });
});

describe('portraits', () => {
  it('are deterministic per seed and character, and differ between people', () => {
    const s = newGame('faces');
    const [a, b] = Object.values(s.characters);
    const r = (id: string, seed: string) => renderToString(createElement(Portrait, { c: s.characters[id], seed, date: s.date }));
    expect(r(a.id, s.seed)).toBe(r(a.id, s.seed));
    expect(r(a.id, s.seed)).not.toBe(r(b.id, s.seed));
  });
});
