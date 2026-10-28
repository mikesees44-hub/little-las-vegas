import { describe, expect, it } from 'vitest';
import { ageOn } from '../src/engine/calendar';
import { crew, player } from '../src/engine/characters';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { briefing } from '../src/engine/briefing';
import { weekCheckIns } from '../src/engine/checkins';
import { newCtx } from '../src/engine/ledger';
import { commitPower } from '../src/engine/power';
import { declaredHeir, donKnows, knownSessions, pressure, support, theUb } from '../src/engine/shadow';
import { shadowActions } from '../src/engine/shadowOps';
import { TEMPLATE_IDS } from '../src/engine/shadowStories';
import { newGameWith } from '../src/engine/starts';
import { tidyState } from '../src/engine/tidy';
import { upgradeSave } from '../src/engine/upgradeSave';
import { ensureTribute } from '../src/engine/tributeState';
import type { GameState } from '../src/engine/types';
import { build1975, donDies, runYears, succWeek } from './successionScenario';
import { randomChoices } from './helpers';

const SEEDS = ['acc-1', 'acc-2', 'acc-3'];
const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

describe('the 1975 acceptance organization', () => {
  it('is built to the spec', () => {
    const s = build1975('acc-1');
    const men = crew(s);
    expect(s.date.y).toBe(1975);
    expect(ageOn(player(s).birth, s.date)).toBe(65);
    expect(men.filter((c) => c.rank === 'underboss')).toHaveLength(1);
    expect(men.filter((c) => c.rank === 'consigliere')).toHaveLength(1);
    expect(men.filter((c) => c.rank === 'capo')).toHaveLength(3);
    expect(men.filter((c) => c.rank === 'soldier')).toHaveLength(12);
    expect(men.filter((c) => c.rank === 'associate')).toHaveLength(8);
    expect(player(s).childrenIds.filter((id) => s.characters[id].dynasty && ageOn(s.characters[id].birth, s.date) >= 30)).toHaveLength(2);
    expect(s.rivals.filter((r) => r.kind === 'mob')).toHaveLength(2);
    expect(declaredHeir(s)?.dynasty).toBe(true);
  });
});

describe('fifteen simulated years (1975-1990), seeded', () => {
  const runs = SEEDS.map((seed) => runYears(build1975(seed), 15));

  it('runs fifteen years without a crash', () => {
    for (const s of runs) {
      expect(s.date.y).toBeGreaterThanOrEqual(1990);
      const sh = s.shadow!;
      // The court keeps a monthly record for as long as the player holds the chair.
      // A seed may end with the underboss taking the family (a real outcome, not a
      // crash): then the record stops at the fall, and the fall is on the books.
      if ((s.power?.station ?? 'boss') === 'boss') expect(sh.hist.length).toBeGreaterThan(150);
      else {
        expect(sh.successions.some((x) => x.outcome === 'usurped' || x.outcome === 'contested')).toBe(true);
        const fell = s.power!.fallenWeek ?? sh.successions[sh.successions.length - 1].week;
        expect(sh.hist[sh.hist.length - 1][0]).toBeGreaterThanOrEqual(fell - 5);
      }
    }
    // Most seeds keep the chair the whole fifteen years.
    expect(runs.filter((s) => s.shadow!.hist.length > 150).length).toBeGreaterThanOrEqual(2);
  });

  it('the underboss holds meetings without the player', () => {
    for (const s of runs) {
      const sh = s.shadow!;
      expect(sh.stats.sessions).toBeGreaterThan(20);
      for (const ses of sh.sessions) {
        expect(ses.participants).not.toContain(ses.presiding);
        expect(ses.petitions.length).toBeGreaterThan(0);
      }
      // Every meeting has participants, decisions and a place; none was the Don's.
      expect(sh.sessions.every((x) => x.participants.length > 0 && x.where && x.petitions.every((p) => p.status !== 'submitted'))).toBe(true);
    }
  });

  it('private promises are made, and the Don does not hear of them when they are made', () => {
    const ps = runs.flatMap((s) => s.shadow!.promises.filter((p) => p.maker !== s.playerId && p.confidential).map((p) => ({ s, p })));
    expect(ps.length).toBeGreaterThan(5);
    // At least one was unknown to the Don at the moment it was made (learned later, or never).
    expect(ps.some(({ s, p }) => { const b = s.shadow!.know[s.playerId]?.[p.id]; return !b || b.w > p.week; })).toBe(true);
  });

  it('younger members develop ambitions of their own', () => {
    const young = runs.flatMap((s) => Object.entries(s.shadow!.plans).filter(([id, p]) => ageOn(s.characters[id].birth, s.date) < 40 && ['seek_promotion', 'build_influence', 'build_business', 'seek_leadership'].includes(p.goal)));
    expect(young.length).toBeGreaterThan(0);
  });

  it('rival families react to the succession', () => {
    for (const s of runs) {
      expect(s.shadow!.stats.rivalMoves).toBeGreaterThan(0);
      expect(Object.values(s.shadow!.rivals).some((r) => r.moves > 0)).toBe(true);
    }
  });

  it('a declared heir loses support', () => {
    expect(runs.some((s) => s.shadow!.stats.heirLostBackers > 0)).toBe(true);
    // ...visible in the history: a month where the heir's support fell 10+ points.
    expect(runs.some((s) => s.shadow!.hist.some((h, i, a) => i > 0 && a[i - 1][2] - h[2] >= 10))).toBe(true);
  });

  it('money the underboss lends buys loyalty', () => {
    for (const s of runs) expect(s.shadow!.stats.financialTies).toBeGreaterThan(0);
    const tied = runs.flatMap((s) => Object.values(s.shadow!.mem).flat()).filter((m) => /owes him money/.test(m.text));
    expect(tied.length).toBeGreaterThan(0);
  });

  it('a private decision reaches the Don months or years later', () => {
    for (const s of runs) expect(s.shadow!.stats.lateLearned).toBeGreaterThan(0);
    expect(Math.max(...runs.map((s) => s.shadow!.stats.maxLag))).toBeGreaterThanOrEqual(26);
    // Through real channels, each named.
    const vias = new Set(runs.flatMap((s) => Object.values(s.shadow!.know[s.playerId] ?? {}).map((b) => b.via.replace(/^.*?(morning meeting|report|digging|Ear|warning|coffee|council|to your face|man in the room|still hears).*$/, '$1'))));
    expect(vias.size).toBeGreaterThan(2);
  });

  it('the story templates play out with outcomes', () => {
    const tpls = new Set(runs.flatMap((s) => s.shadow!.stories.filter((x) => x.outcome).map((x) => x.tpl)));
    expect(tpls.size).toBeGreaterThanOrEqual(5);
    expect(TEMPLATE_IDS).toHaveLength(12);
  });

  it('characters keep their memories for years', () => {
    for (const s of runs) {
      const old = Object.entries(s.shadow!.mem).filter(([id, ms]) => s.characters[id]?.alive && ms.some((m) => s.week - m.week >= 260));
      expect(old.length).toBeGreaterThan(0);
    }
  });

  it('the Don only sees what he knows: the known view never counts more than the truth', () => {
    for (const s of runs) {
      const known = support(s, true);
      expect(known.unknown).toBeGreaterThanOrEqual(0);
      for (const ks of knownSessions(s)) expect(donKnows(s, ks.ses.id)).not.toBe('unknown');
    }
  });
});

describe('succession outcomes (seeded scenarios)', () => {
  it('the same family can end several ways', () => {
    const outcomes = new Set<string>();
    for (const seed of SEEDS) {
      const base = runYears(build1975(seed), 4);
      for (const goal of ['serve', 'kingmaker', 'become_boss', 'get_out'] as const) {
        const s = clone(base);
        const ub = theUb(s);
        if (!ub) continue;
        ensureTribute(s).ubGoals![ub.id] = goal;
        // The elder son is the named heir again (the underboss is not).
        const son = player(s).childrenIds.map((id) => s.characters[id]).find((c) => c?.alive && c.dynasty && c.id !== ub.id);
        if (son) commitPower(newCtx(s), { op: 'designate', mode: 'named', charId: son.id });
        if (goal === 'become_boss') for (const m of crew(s)) if (m.id !== ub.id && s.shadow!.plans[m.id]) s.shadow!.plans[m.id].prefer = ub.id;
        donDies(s, 3);
        const last = s.shadow!.successions[s.shadow!.successions.length - 1];
        if (last) outcomes.add(last.outcome);
      }
    }
    expect(outcomes.size).toBeGreaterThanOrEqual(3);
    // The heir did not simply become boss every time.
    expect([...outcomes].some((o) => o !== 'peaceful')).toBe(true);
  });

  it('play passes to the heir and the game continues', () => {
    const s = runYears(build1975('acc-2'), 2);
    const before = s.playerId;
    donDies(s, 8);
    expect(s.gameOver).toBeFalsy();
    expect(s.playerId).not.toBe(before);
    expect(s.shadow!.donId).toBe(s.playerId);
    runYears(s, 1);
    expect(s.shadow!.sessions.some((x) => x.week > s.week - 52) || s.shadow!.stats.petitions > 0).toBe(true);
  });
});

describe('saving and loading', () => {
  it('a save mid-succession loads and plays on exactly the same', () => {
    const s = runYears(build1975('acc-3'), 7);
    tidyState(s);
    const json = JSON.stringify(s);
    expect(JSON.parse(json)).toEqual(s);
    const a = JSON.parse(json) as GameState;
    const b = upgradeSave(JSON.parse(json) as GameState);
    for (let i = 0; i < 52; i++) { succWeek(a); succWeek(b); }
    tidyState(a);
    tidyState(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('an old save with no shadow court loads and runs; tidyState round-trips', () => {
    let s = newGameWith('succ-old', 'sees');
    for (let i = 0; i < 3; i++) s = advanceWeek(s, randomChoices(s, i)).state;
    const old = clone(s);
    delete old.shadow;
    let t = upgradeSave(old);
    for (let i = 0; i < 6; i++) t = advanceWeek(t, randomChoices(t, i)).state;
    expect(t.shadow).toBeDefined();
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });
});

describe('in the full game', () => {
  it('an old Don\'s family runs the court through advanceWeek, the orders preview, the Sit-Down and check-ins read it', () => {
    let s = newGameWith('succ-full', 'sees');
    for (let i = 0; i < 30 && !s.gameOver; i++) {
      const acts = shadowActions(s).filter((a) => !previewAction(s, a).disabledReason).slice(0, 1);
      s = advanceWeek(s, { ...randomChoices(s, i), actions: acts }).state;
      briefing(s);
      weekCheckIns(s);
    }
    expect(s.shadow!.stats.petitions).toBeGreaterThan(5);
    expect(pressure(s).score).toBeGreaterThan(0);
    for (const a of shadowActions(s)) expect(previewAction(s, a).title.length).toBeGreaterThan(3);
  });
});

describe('the Succession screen', () => {
  it('renders, and shows only what the Don knows', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { ShadowCourt } = await import('../src/ui/power/ShadowCourt');
    const s = runYears(build1975('acc-1'), 6);
    const html = renderToString(createElement(ShadowCourt, { s }));
    expect(html).toContain('data-testid="shadow-court"');
    expect(html).toContain('data-testid="crew-support"');
    const sh = s.shadow!;
    // A decision the Don has not confirmed is never printed.
    const hidden = sh.sessions.flatMap((x) => (donKnows(s, x.id) === 'confirmed' ? [] : x.petitions.map((p) => p.decision ?? ''))).filter((d) => d && !sh.sessions.some((y) => donKnows(s, y.id) === 'confirmed' && y.petitions.some((p) => p.decision?.includes(d))));
    expect(hidden.length).toBeGreaterThan(0);
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    for (const d of hidden) expect(html).not.toContain(esc(d));
  });
});
