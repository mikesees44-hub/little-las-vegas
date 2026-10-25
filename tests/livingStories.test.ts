import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { arcTemplates, ensureArcs, startArc, storylines } from '../src/engine/livingStories';
import { ARC_TEMPLATES } from '../src/engine/livingStoryData';
import { MAX_FAMILY_POPUPS, MAX_POPUPS, isFamilyEvent } from '../src/engine/events';
import { newGame } from '../src/engine/newGame';
import { opinion } from '../src/engine/relations';
import type { GameState, PlayerChoices } from '../src/engine/types';
import { playWeeks, randomChoices } from './helpers';

/** Answer every popup at random, except arc beats, which get the given answer. */
function answer(s: GameState, salt: number, arcPick: Record<string, string>): PlayerChoices {
  const base = randomChoices(s, salt);
  for (const e of s.pendingEvents) if (e.meta?.arc && arcPick[String(e.meta.stage)]) base.choices![e.iid] = arcPick[String(e.meta.stage)];
  return base;
}

describe('living storylines', () => {
  it('registers the eleven storylines, each with consistent stages', () => {
    expect(ARC_TEMPLATES.length).toBe(11);
    expect(arcTemplates().length).toBe(11);
    for (const t of ARC_TEMPLATES) {
      const ids = new Set(t.stages.map((x) => x.id));
      expect(ids.size, t.id).toBe(t.stages.length);
      for (const st of t.stages) {
        expect(!!st.auto || !!st.choices?.length, `${t.id}:${st.id}`).toBe(true);
        if (st.choices) expect(st.text, `${t.id}:${st.id} text`).toBeTruthy();
        for (const c of st.choices ?? []) {
          expect(!!c.next || !!c.finish, `${t.id}:${st.id}:${c.id}`).toBe(true);
          if (c.next) expect(ids.has(c.next), `${t.id}:${st.id}:${c.id} -> ${c.next}`).toBe(true);
        }
      }
    }
  });

  it('plays "Whispers of a Rat" end to end, stage by stage, through a save/load round trip, without double effects', () => {
    let s = playWeeks('arc-rat', 12);
    const t = ARC_TEMPLATES.find((x) => x.id === 'rat')!;
    const roles = t.bind(s, (xs) => xs[0])!;
    expect(roles).toBeTruthy();
    // The cast are people who already exist: nobody is created for the arc.
    const before = Object.keys(s.characters).length;
    for (const id of Object.values(roles)) expect(s.characters[id]?.alive).toBe(true);
    // Keep other arcs out of the way so this one is the only thread.
    const st = ensureArcs(s);
    st.active = [];
    st.lastStart = s.week + 999;
    const arc = startArc(s, 'rat', roles);
    expect(Object.keys(s.characters).length).toBe(before);
    const picks = { rumor: 'speak', judgment: 'keep' };
    const seen: string[] = [];
    let saved: string | undefined;
    let opBefore = 0;
    for (let w = 0; w < 30 && !s.gameOver; w++) {
      const beat = s.pendingEvents.find((e) => e.meta?.arc === arc.id);
      if (beat) {
        seen.push(String(beat.meta!.stage));
        // Only one beat a week, and the pipeline still holds its caps.
        expect(s.pendingEvents.filter((e) => e.meta?.arc).length).toBeLessThanOrEqual(1);
        if (beat.meta!.stage === 'judgment') opBefore = opinion(s, roles.suspect, s.playerId);
      }
      expect(s.pendingEvents.length).toBeLessThanOrEqual(MAX_POPUPS);
      expect(s.pendingEvents.filter(isFamilyEvent).length).toBeLessThanOrEqual(MAX_FAMILY_POPUPS);
      // Save mid-arc (after the first answer, before the autonomous stage), load, and continue on both copies.
      if (!saved && s.arcs!.active.find((a) => a.id === arc.id)?.stage === 'reply') saved = JSON.stringify(s);
      s = advanceWeek(s, answer(s, w, picks)).state;
      if (saved && s.week === JSON.parse(saved).week + 1) {
        const loaded = JSON.parse(saved) as GameState;
        const a = advanceWeek(loaded, answer(loaded, w, picks)).state;
        expect(JSON.stringify(a.arcs)).toBe(JSON.stringify(s.arcs));
      }
      if (s.arcs!.done.some((a) => a.id === arc.id)) break;
    }
    const done = s.arcs!.done.find((a) => a.id === arc.id)!;
    expect(done, 'the arc finished').toBeTruthy();
    expect(seen).toEqual(['rumor', 'judgment']);
    expect(done.picks).toEqual({ rumor: 'speak', judgment: 'keep' });
    // Every stage left exactly one line: begins, the answer, the autonomous stage, the answer, the ending.
    expect(done.history.length).toBe(5);
    expect(done.history[2].text).toContain('Two stories now');
    // The keep answer moved his opinion once (+8, give or take the week's other news), not twice.
    expect(opinion(s, roles.suspect, s.playerId) - opBefore).toBeLessThan(16);
    // The chronicle carries the autonomous stage and the ending.
    expect(s.chronicle.some((c) => c.text.startsWith('Whispers of a Rat: Two stories now'))).toBe(true);
    // The tracker never prints the hidden truth.
    const line = storylines(s).find((x) => x.arc.id === arc.id)!;
    const text = JSON.stringify(line.arc.history);
    expect(text).not.toMatch(/informant|is a rat\b|FBI agent|plant/i);
    expect(line.cast.map((c) => c.label)).toContain('the man they talk about');
  });

  it('arcs start on their own, bind existing people, advance with the clock, and reach their endings', () => {
    const started = new Set<string>();
    let finished = 0;
    for (const seed of ['arcs-a', 'arcs-b']) {
      let s = newGame(seed);
      for (let w = 0; w < 120 && !s.gameOver; w++) {
        const ids = new Set(Object.keys(s.characters));
        const prevArcs = s.arcs?.active.map((a) => a.id) ?? [];
        s = advanceWeek(s, randomChoices(s, w)).state;
        for (const a of s.arcs?.active ?? []) {
          if (prevArcs.includes(a.id)) continue;
          started.add(a.tpl);
          for (const id of Object.values(a.roles)) if (!id.includes(':')) expect(ids.has(id), `${a.tpl} cast ${id} existed before`).toBe(true);
        }
        expect(s.arcs?.active.length ?? 0).toBeLessThanOrEqual(3);
      }
      finished += s.arcs?.done.length ?? 0;
    }
    expect(started.size).toBeGreaterThanOrEqual(5);
    expect(finished).toBeGreaterThanOrEqual(6);
  });
});
