import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { crew } from '../src/engine/characters';
import { advanceWeek } from '../src/engine/engine';
import { previewInteraction } from '../src/engine/interactions';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { buildPlotUncovered, schemeOdds } from '../src/engine/schemes';
import { addSecret } from '../src/engine/secrets';
import type { Character, GameState, SchemeOptions } from '../src/engine/types';

function lieutenant(s: GameState, rival = 'manno'): Character {
  const r = s.rivals.find((x) => x.id === rival)!;
  return Object.values(s.characters).find((c) => c.alive && c.faction === rival && c.id !== r.leaderId)!;
}

function agents(s: GameState, n = 2): string[] {
  return crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'capo').slice(0, n).map((c) => c.id);
}

const HIT: SchemeOptions = { depth: 'planned', location: 'car', disposal: 'disappear', equipment: 'street' };

function runToEnd(s: GameState, maxWeeks = 20): GameState {
  for (let w = 0; w < maxWeeks && s.schemes.some((x) => x.owner === 'player'); w++) {
    const r = advanceWeek(s, {});
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
  }
  return s;
}

describe('scheme odds', () => {
  it('are bounded, explained, and meticulous planning buys odds with time', () => {
    const s = newGame('odds');
    const t = lieutenant(s);
    const a = agents(s);
    const rushed = schemeOdds(s, 'murder', t.id, a, { ...HIT, depth: 'rushed' });
    const careful = schemeOdds(s, 'murder', t.id, a, { ...HIT, depth: 'meticulous' });
    for (const o of [rushed, careful]) {
      expect(o.chance).toBeGreaterThanOrEqual(0.05);
      expect(o.chance).toBeLessThanOrEqual(0.95);
      expect(o.reasons[0].label).toBe('Base');
    }
    expect(careful.chance).toBeGreaterThan(rushed.chance);
    expect(careful.weeks).toBeGreaterThan(rushed.weeks);
    expect(careful.cost).toBeGreaterThan(rushed.cost);
  });
  it('officials and the law are off-limits', () => {
    const s = newGame('offlimits');
    const cop = Object.values(s.characters).find((c) => c.office === 'Police sergeant')!;
    expect(schemeOdds(s, 'murder', cop.id, agents(s), HIT).disabledReason).toMatch(/no cops/);
  });
});

describe('murder schemes', () => {
  it('a hit runs for weeks with busy agents, then resolves with a cutscene', () => {
    let s = newGame('hit');
    s.money = 50000;
    const t = lieutenant(s);
    const team = agents(s);
    s = advanceWeek(s, { actions: [{ kind: 'scheme', scheme: 'murder', targetId: t.id, agents: team, opts: HIT }] }).state;
    expect(s.schemes.some((x) => x.owner === 'player' && x.targetId === t.id)).toBe(true);
    expect(team.every((id) => (s.characters[id].busyUntil ?? 0) > s.week - 1)).toBe(true);
    let cue = false;
    for (let w = 0; w < 20 && s.schemes.some((x) => x.owner === 'player'); w++) {
      const r = advanceWeek(s, {});
      if (r.state.cutscenes.some((c) => c.key.startsWith('hit_') || c.key === 'arrest_interrogation')) cue = true;
      s = r.state;
    }
    expect(s.schemes.some((x) => x.owner === 'player')).toBe(false);
    // Either he is dead, or it went wrong — and a went-wrong hit leaves its mark.
    const dead = !s.characters[t.id].alive;
    expect(dead || cue).toBe(true);
    expect(cue).toBe(true);
  });
  it('killing a made man without a sanction starts a blood feud; with one, it does not', () => {
    const tryOnce = (seed: string, sanction: boolean) => {
      let s = newGame(seed);
      s.money = 80000;
      const t = lieutenant(s);
      t.attributes.intrigue = 0;
      const r = s.rivals.find((x) => x.id === t.faction)!;
      r.muscle = 0;
      for (const id of agents(s, 4)) {
        s.characters[id].attributes.force = 100;
        s.characters[id].attributes.intrigue = 100;
      }
      if (sanction) s.sanctions[t.id] = s.week + 100;
      s = advanceWeek(s, { actions: [{ kind: 'scheme', scheme: 'murder', targetId: t.id, agents: agents(s, 4), opts: { ...HIT, depth: 'meticulous', equipment: 'untraceable', alibi: true } }] }).state;
      s = runToEnd(s);
      return { dead: !s.characters[t.id].alive, feud: !!s.rivals.find((x) => x.id === r.id)!.feud };
    };
    let checked = 0;
    for (let i = 0; i < 12 && checked < 2; i++) {
      const a = tryOnce(`feud${i}`, false);
      if (a.dead) {
        expect(a.feud).toBe(true);
        checked++;
      }
      const b = tryOnce(`feud${i}`, true);
      if (b.dead) expect(b.feud).toBe(false);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('hooks and secrets', () => {
  it('blackmail needs a secret you know, and a success gives a strong hook', () => {
    let s = newGame('bm');
    s.money = 50000;
    const t = lieutenant(s);
    expect(schemeOdds(s, 'blackmail', t.id, agents(s, 1), { depth: 'planned' }).disabledReason).toMatch(/secret/);
    const sec = addSecret(s, t, 'affair', ['player']);
    let got = false;
    for (let i = 0; i < 6 && !got; i++) {
      let x: GameState = JSON.parse(JSON.stringify(s));
      x.rng = (x.rng + i * 7919) >>> 0;
      x = advanceWeek(x, { actions: [{ kind: 'scheme', scheme: 'blackmail', targetId: t.id, agents: agents(x, 1), opts: { depth: 'meticulous', secretId: sec.id } }] }).state;
      x = runToEnd(x);
      got = x.hooks.some((h) => h.holder === 'player' && h.targetId === t.id && h.strong);
    }
    expect(got).toBe(true);
  });
  it('a hook raises acceptance odds, and the reason is named', () => {
    const s = newGame('hookodds');
    const lt = lieutenant(s);
    const plain = previewInteraction(s, 'favor', lt.id)!;
    s.hooks.push({ id: 'k1', holder: 'player', targetId: lt.id, strong: true, reason: 'Test', week: 1 });
    const hooked = previewInteraction(s, 'favor', lt.id, true)!;
    expect(hooked.acceptance!.chance).toBeGreaterThan(plain.acceptance!.chance);
    expect(hooked.acceptance!.reasons.some((r) => r.label.startsWith('Strong hook'))).toBe(true);
  });
  it('bribing Sgt. Healy is a named chip and a named ledger line', () => {
    const s = newGame('bribe');
    const healy = Object.values(s.characters).find((c) => c.office === 'Police sergeant')!;
    healy.traits = ['Greedy', 'Gambler'];
    const p = previewAction(s, { kind: 'interact', id: 'bribe', target: healy.id });
    expect(p.effects.find((e) => e.type === 'money')!.label).toBe('Bribe: Sgt. Healy');
    let accepted = false;
    for (let i = 0; i < 8 && !accepted; i++) {
      const x: GameState = JSON.parse(JSON.stringify(s));
      x.rng = (x.rng + i * 104729) >>> 0;
      const r = advanceWeek(x, { actions: [{ kind: 'interact', id: 'bribe', target: healy.id }] });
      accepted = r.report.lines.some((l) => l.label === 'Bribe: Sgt. Healy' && l.amount === -2000);
      if (accepted) expect(r.state.hooks.some((h) => h.targetId === healy.id && !h.strong)).toBe(true);
    }
    expect(accepted).toBe(true);
  });
});

describe('rival schemes', () => {
  it('an uncovered plot can be foiled for a strong hook on the plotter', () => {
    let s = newGame('plot');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    const capo = crew(s).find((c) => c.rank === 'capo')!;
    s.schemes.push({ id: 'scX', kind: 'murder', owner: 'manno', ownerId: r.leaderId, targetId: capo.id, agents: [r.leaderId], opts: { depth: 'planned' }, progress: 40, startWeek: 1, discovered: true, because: 'test' });
    const ev = buildPlotUncovered(s, s.schemes[0]);
    s.pendingEvents = [ev];
    s = advanceWeek(s, { choices: { [ev.iid]: 'foil' } }).state;
    expect(s.schemes.some((x) => x.id === 'scX')).toBe(false);
    expect(s.hooks.some((h) => h.holder === 'player' && h.targetId === r.leaderId && h.strong)).toBe(true);
  });
  it('rivals with a grudge eventually scheme, and the consigliere sometimes finds out', () => {
    let found = false;
    for (let g = 0; g < 4 && !found; g++) {
      let s = newGame(`grudge${g}`);
      for (const r of s.rivals) r.feud = r.kind === 'mob';
      s.council.consigliere.task = 'cons_secrets';
      for (let w = 0; w < 52 && !found && !s.gameOver; w++) {
        s = advanceWeek(s, {}).state;
        if (s.pendingEvents.some((e) => e.defId === 'plot_uncovered') || s.schemes.some((x) => x.owner !== 'player' && x.discovered)) found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('other schemes', () => {
  it('a successful envoy opens an outpost that pays weekly', () => {
    let done = false;
    for (let i = 0; i < 8 && !done; i++) {
      let s = newGame(`envoy${i}`);
      s.money = 50000;
      const team = agents(s, 1);
      s.characters[team[0]].attributes.diplomacy = 100;
      s = advanceWeek(s, { actions: [{ kind: 'scheme', scheme: 'envoy', agents: team, opts: { depth: 'meticulous', city: 'capemay' } }] }).state;
      s = runToEnd(s);
      if (s.outposts.length) {
        const r = advanceWeek(s, {});
        expect(r.report.lines.some((l) => l.label === 'Outpost: Cape May')).toBe(true);
        done = true;
      }
    }
    expect(done).toBe(true);
  });
});
