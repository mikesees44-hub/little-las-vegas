import { describe, expect, it } from 'vitest';
import { advanceWeek, forceDeath } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { playSession, sessionOptions, startSession, stepSession, type MgSession } from '../src/engine/minigames';
import { newGameWith, type StartId } from '../src/engine/starts';
import { reelsWeek } from '../src/engine/reels';
import { newCtx } from '../src/engine/ledger';
import { cloneState } from '../src/engine/engine';
import { crew, player } from '../src/engine/characters';
import { getRelation } from '../src/engine/relations';
import { buildMaking } from '../src/engine/crewEvents';
import { attachMinigames } from '../src/engine/minigames';
import type { SceneData } from '../src/engine/scenes';
import type { GameState } from '../src/engine/types';

describe('Made the boss', () => {
  for (const start of ['classic', 'sees', 'rise'] as StartId[]) {
    it(`opens every new game (${start}) within the popup cap, and its choices are real effects`, () => {
      const s = newGameWith(`open-${start}`, start);
      expect(s.pendingEvents.length).toBeLessThanOrEqual(4);
      const ev = s.pendingEvents.find((e) => e.defId === 'made_boss')!;
      expect(ev).toBeTruthy();
      const params = (ev.choices[0].effects[0] as { params: Record<string, string | number> }).params;
      let ses = startSession(s, 'madeboss', ev.iid, params) as MgSession<SceneData>;
      let words = 0;
      const picks: string[] = [];
      while (!ses.done) {
        const o = sessionOptions(s, ses).filter((x) => !x.disabled);
        expect(o.length).toBeGreaterThan(0);
        expect(ses.d.card.text.length).toBeGreaterThan(40);
        words += ses.d.card.text.split(/\s+/).length;
        const pick = o.find((x) => x.id === 'sit' || x.id === 'philly_envelope' || x.id === 'w_generous') ?? o[0];
        picks.push(pick.id);
        ses = stepSession(s, ses, pick.id);
      }
      // Under ninety seconds to read (about 250 words a minute).
      expect(words).toBeLessThan(375);
      const r = advanceWeek(s, { choices: { [ev.iid]: 'play' }, minigames: { [ev.iid]: ses.moves } });
      expect(reconcile(r.report)).toEqual([]);
      expect(r.report.lines.some((l) => l.label === 'Made the boss')).toBe(true);
      if (picks.includes('w_generous')) expect(r.report.lines.some((l) => l.label === 'Made the boss' && l.stat === 'money' && l.amount <= -1500)).toBe(true);
    });
  }

  it('plays again when a new boss takes the chair', () => {
    let s = newGameWith('succ');
    s = advanceWeek(s, {}).state;
    const old = s.playerId;
    s = forceDeath(s, old, 'shot outside a Camden social club').state;
    s = advanceWeek(s, {}).state;
    const ev = [...s.pendingEvents, ...s.eventQueue].find((e) => e.defId === 'made_boss');
    expect(ev).toBeTruthy();
    expect((ev!.choices[0].effects[0] as { params: Record<string, string | number> }).params.variant).toBe('succession');
    const ses = playSession(s, 'madeboss', ev!.iid, { variant: 'succession', old, cause: 'shot' }) as MgSession<SceneData>;
    expect(ses.d.beats[0].card.text).toContain(s.characters[old].lastName);
  });
});

describe('the made-man ceremony', () => {
  it('replaces the single card: sponsor, oath, crew; the passed-over remember', () => {
    let s = newGameWith('cer');
    s = advanceWeek(s, {}).state;
    const c = crew(s).find((x) => x.rank === 'associate')!;
    const other = crew(s).find((x) => x.rank === 'associate' && x.id !== c.id);
    if (other) other.goal = 'get_made';
    s.pendingEvents = [buildMaking(s, c)];
    attachMinigames(s);
    const ev = s.pendingEvents[0];
    expect(ev.choices[0].id).toBe('ceremony');
    expect(ev.defaultChoiceId).toBe('ceremony_auto');
    const m = ev.choices[0].effects[0] as unknown as { params: Record<string, string | number>; parts: Record<string, never> };
    let ses = startSession(s, 'ceremony', ev.iid, m.params, m.parts) as MgSession<SceneData>;
    expect(ses.d.beats.some((b) => b.card.text.includes('As this saint burns, so burns my soul if I betray this family.'))).toBe(true);
    let crewPick = '';
    while (!ses.done) {
      const o = sessionOptions(s, ses);
      const pick = o.find((x) => x.id === 'sp_you') ?? o.find((x) => x.id === 'say_earn') ?? o.find((x) => x.id.startsWith('crew_')) ?? o[0];
      if (pick.id.startsWith('crew_')) crewPick = pick.id.slice(5);
      ses = stepSession(s, ses, pick.id);
    }
    const r = advanceWeek(s, { choices: { [ev.iid]: 'ceremony' }, minigames: { [ev.iid]: ses.moves } });
    expect(reconcile(r.report)).toEqual([]);
    const n = r.state.characters[c.id];
    expect(n.rank).toBe('soldier');
    if (crewPick) expect(n.capoId).toBe(crewPick);
    expect(getRelation(r.state, c.id, player(r.state).id)?.modifiers.some((x) => x.reason === 'The boss stood for me himself')).toBe(true);
    if (other && ses.d.passedOver?.includes(other.id)) expect(ses.beats.some((b) => b.text.includes('heard about the ceremony from a bartender'))).toBe(true);
  });
});

describe('the newspaper reel', () => {
  it('lands on a headline built from a real hit, with the real heat in the consequence line', () => {
    let s = newGameWith('reel');
    s = advanceWeek(s, {}).state;
    const prev = cloneState(s);
    const t = Object.values(s.characters).find((c) => c.alive && c.faction === 'manno')!;
    prev.schemes = [{ id: 'sc1', kind: 'murder', owner: 'player', ownerId: s.playerId, targetId: t.id, agents: [], opts: { depth: 'planned', location: 'car' }, progress: 100, startWeek: 1, discovered: false, because: 'x' }];
    const next = cloneState(s);
    next.schemes = [];
    next.characters[t.id].alive = false;
    next.characters[t.id].death = { week: prev.week, date: prev.date, cause: 'shot in his car', killer: 'player' };
    const ctx = newCtx(next);
    ctx.lines.push({ stat: 'heat.local', amount: 12, label: `Murder: ${t.firstName} ${t.lastName}`, category: 'event' });
    reelsWeek(ctx, prev);
    const reel = next.mg!.reels![0];
    expect(reel.headline).toBe(`${t.firstName} ${t.lastName} FOUND DEAD IN PARKED CAR`.toUpperCase());
    expect(reel.consequence).toMatch(/Local heat \+12/);
    expect(reel.photo).toBe('car');
  });
});

function _unused(_s: GameState) {}
void _unused;
