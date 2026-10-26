import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { previewAction } from '../src/engine/actions';
import { briefing, delegatedActions, MAX_ITEMS, MAX_PER_SPEAKER, recommendedActions, setTrust, type Briefing } from '../src/engine/briefing';
import { holder } from '../src/engine/council';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { addOpinion } from '../src/engine/relations';
import { neglect, roundOptions, roundSlots, usualWeek } from '../src/engine/rounds';
import type { GameState } from '../src/engine/types';
import { SitDown } from '../src/ui/sitdown/SitDown';
import { SitDownCard } from '../src/ui/sitdown/SitDownCard';
import { randomChoices } from './helpers';

/** A few weeks into a game, played with random answers and the advisors' picks every other week. */
function played(seed: string, weeks: number): GameState[] {
  let s = newGame(seed);
  const out: GameState[] = [s];
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    const rec = i % 2 ? recommendedActions(s).map((r) => r.action) : [];
    s = advanceWeek(s, { ...randomChoices(s, i), actions: rec }).state;
    out.push(s);
  }
  return out;
}

const states = played('sitdown-a', 24);

function busyIds(s: GameState): Set<string> {
  const ids = new Set<string>();
  for (const e of s.pendingEvents) {
    for (const a of e.actors ?? []) ids.add(a);
    if (e.meta?.charId) ids.add(String(e.meta.charId));
  }
  ids.delete(s.playerId);
  return ids;
}

describe('the Sit-Down', () => {
  it('every item is a sentence with real, valid orders, a recommendation and a reason', () => {
    let items = 0;
    for (const s of states) {
      const b = briefing(s);
      expect(b.items.length).toBeLessThanOrEqual(MAX_ITEMS);
      const lines = new Set<string>();
      for (const sp of b.speakers) {
        expect(sp.items.length).toBeLessThanOrEqual(MAX_PER_SPEAKER);
        if (sp.empty) expect(sp.nudge?.text).toBeTruthy();
      }
      for (const it of b.items) {
        items++;
        expect(it.line.length).toBeGreaterThan(10);
        expect(lines.has(it.line), it.line).toBe(false);
        lines.add(it.line);
        expect(it.options.some((o) => o.id === it.recommended)).toBe(true);
        expect(it.options[it.options.length - 1].id === 'wait' || !it.options.some((o) => o.id === 'wait')).toBe(true);
        expect(it.reason).toMatch(/says: /);
        for (const o of it.options) {
          if (o.action) expect(previewAction(s, o.action).disabledReason, `${it.id}/${o.id}`).toBeUndefined();
          else expect(o.id === 'wait' || !!o.link).toBe(true);
        }
      }
    }
    expect(items).toBeGreaterThan(10);
  });

  it('never repeats a decision already on the desk', () => {
    for (const s of states) {
      const busy = busyIds(s);
      const b = briefing(s);
      for (const it of b.items) if (it.charId && !it.id.startsWith('pressure') && !it.id.startsWith('faction')) expect(busy.has(it.charId), it.id).toBe(false);
      if (s.pendingEvents.some((e) => e.defId === 'tribute_audience')) expect(b.items.some((i) => i.id.startsWith('short:'))).toBe(false);
    }
  });

  it('"Do what they recommend" queues each pick once, within the money, and the week carries them out', () => {
    const s = states.find((x) => recommendedActions(x).length >= 2)!;
    expect(s).toBeTruthy();
    const recs = recommendedActions(s);
    const keys = recs.map((r) => JSON.stringify(r.action));
    expect(new Set(keys).size).toBe(keys.length);
    expect(recs.reduce((a, r) => a + r.option.cost, 0)).toBeLessThanOrEqual(Math.max(0, s.money));
    // Already queued: not queued twice.
    expect(recommendedActions(s, undefined, [recs[0].action]).some((r) => JSON.stringify(r.action) === keys[0])).toBe(false);
    // "Not now" leaves an item out.
    expect(recommendedActions(s, undefined, [], [recs[0].item.id]).some((r) => r.item.id === recs[0].item.id)).toBe(false);
    const r = advanceWeek(s, { actions: recs.map((x) => x.action) });
    const titles = recs.map((x) => previewAction(s, x.action).title);
    const notDone = r.log.filter((l) => l.startsWith('Order not carried out') && titles.some((t) => l.includes(t)));
    expect(notDone.length).toBeLessThan(recs.length);
  });

  it('a trusted advisor handles his routine items himself, logs it, and respects "not now"', () => {
    let found: { s: GameState; key: string } | undefined;
    for (const s0 of states) {
      for (const sp of briefing(s0).speakers) {
        const s = setTrust(s0, sp.key, true);
        if (delegatedActions(s).length) { found = { s, key: sp.key }; break; }
      }
      if (found) break;
    }
    expect(found).toBeTruthy();
    const { s, key } = found!;
    const d = delegatedActions(s);
    expect(d.every((x) => x.by.key === key && x.item.routine)).toBe(true);
    const r = advanceWeek(s, {});
    expect(r.state.briefing!.log.filter((e) => e.week === s.week).length).toBe(d.length);
    expect(r.report.rounds?.some((l) => l.includes('took care of it'))).toBe(true);
    // Not now: he leaves it alone.
    const r2 = advanceWeek(s, { briefingSkip: d.map((x) => x.item.id) });
    expect(r2.state.briefing!.log.filter((e) => e.week === s.week).length).toBe(0);
    // Untrusted: nothing happens on its own.
    expect(delegatedActions(setTrust(s, key, false)).length).toBe(0);
  });

  it('a weak, disloyal advisor steers wrong more often than a sharp, loyal one', () => {
    const tally = (good: boolean) => {
      let biased = 0;
      let n = 0;
      for (const s0 of states.slice(2)) {
        const s = structuredClone(s0) as GameState;
        const ub = holder(s, 'underboss');
        if (!ub) continue;
        for (const k of Object.keys(ub.attributes) as (keyof typeof ub.attributes)[]) ub.attributes[k] = good ? 95 : 10;
        ub.traits = good ? ['Honest', 'Loyal-to-a-fault'] : ['Greedy', 'Ambitious'];
        addOpinion(s, ub.id, s.playerId, 'test', good ? 80 : -80, 0);
        for (const it of briefing(s).items.filter((i) => i.speaker === 'underboss' && i.options.length >= 2)) {
          n++;
          if (it.biased) biased++;
          if (good) expect(it.tell).toBeUndefined();
        }
      }
      return { biased, n };
    };
    const good = tally(true);
    const bad = tally(false);
    expect(good.n).toBeGreaterThan(3);
    expect(good.biased).toBe(0);
    expect(bad.biased).toBeGreaterThan(0);
  });

  it('an empty seat says nobody is there to tell you, and points at the council', () => {
    const s = structuredClone(states[3]) as GameState;
    s.council.consigliere = { ...s.council.consigliere, holderId: undefined };
    const sp = briefing(s).speakers.find((x) => x.role === 'consigliere')!;
    expect(sp.empty).toBe(true);
    expect(sp.items.length).toBe(0);
    expect(sp.nudge?.link.tab).toBe('council');
  });

  it('saves and loads: trust, the log and the rounds survive JSON, and the week replays the same', () => {
    let s = setTrust(states[6], 'underboss', true);
    s = advanceWeek(s, { rounds: usualWeek(s) }).state;
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(loaded.briefing).toEqual(s.briefing);
    expect(loaded.rounds).toEqual(s.rounds);
    expect(briefing(loaded)).toEqual(briefing(s));
    const a = advanceWeek(s, {});
    const b = advanceWeek(loaded, {});
    expect(b.state.money).toBe(a.state.money);
    expect(b.report.rounds).toEqual(a.report.rounds);
  });

  it('renders the council and the rounds, with the advisor\'s pick marked', () => {
    const s = states.find((x) => briefing(x).items.length >= 2)!;
    const props = { s, rounds: undefined, setRounds: () => {}, skip: [], setSkip: () => {}, onTrust: () => {}, onLink: () => {}, onDecisions: () => {}, onClose: () => {} };
    const html = renderToString(createElement(SitDown, props));
    expect(html).toContain('data-testid="sitdown"');
    expect(html).toContain('data-testid="advisor-underboss"');
    expect(html).toContain('data-recommended="true"');
    expect(html).toContain('Do what they recommend');
    expect(renderToString(createElement(SitDown, { ...props, initialTab: 'rounds' }))).toContain('data-testid="lane-family"');
    const b: Briefing = briefing(s);
    expect(renderToString(createElement(SitDownCard, { s, b, onOpen: () => {}, onRounds: () => {} }))).toContain('Hear them');
  });
});

describe('Your Rounds', () => {
  it('evenings follow the boss: a usual week fits them and the money', () => {
    for (const s of states.slice(0, 12)) {
      const { slots } = roundSlots(s);
      expect(slots).toBeGreaterThanOrEqual(1);
      expect(slots).toBeLessThanOrEqual(6);
      const u = usualWeek(s);
      const opts = roundOptions(s);
      expect(u.length).toBeLessThanOrEqual(slots);
      expect(u.every((id) => opts.some((r) => r.id === id))).toBe(true);
      expect(new Set(opts.map((r) => r.id)).size).toBe(opts.length);
    }
    const old = structuredClone(states[2]) as GameState;
    old.characters[old.playerId].birth = { ...old.characters[old.playerId].birth, y: 1888 };
    old.characters[old.playerId].health = 30;
    expect(roundSlots(old).slots).toBeLessThan(roundSlots(states[2]).slots);
  });

  it('the rounds land in the report as short lines, on the books', () => {
    const s = states[4];
    const ids = usualWeek(s);
    const r = advanceWeek(s, { rounds: ids });
    expect(r.report.rounds?.length).toBeGreaterThanOrEqual(1);
    expect(r.state.rounds!.history.at(-1)!.ids.length).toBeGreaterThan(0);
  });

  it('a lane left empty for weeks is noticed, gently, and costs something', () => {
    let s = advanceWeek(states[4], { rounds: usualWeek(states[4]) }).state;
    const wife = s.characters[s.characters[s.playerId].spouseId ?? '']?.id;
    for (let i = 0; i < 4; i++) s = advanceWeek(s, { ...randomChoices(s, 50 + i), rounds: [] }).state;
    const fam = neglect(s).find((n) => n.lane === 'family')!;
    expect(fam.weeks).toBeGreaterThanOrEqual(3);
    expect(fam.line).toMatch(/haven't been home for dinner/);
    if (wife) expect(s.relations[`${wife}>${s.playerId}`]?.modifiers.some((m) => /Never home/.test(m.reason))).toBe(true);
  });

  it('stays off for games that never use it (old saves and the default)', () => {
    const r = advanceWeek(states[3], {});
    expect(r.state.rounds).toBeUndefined();
  });
});
