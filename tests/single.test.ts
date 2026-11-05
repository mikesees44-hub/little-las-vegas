import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { actNow } from '../src/engine/actNow';
import { ageOn } from '../src/engine/calendar';
import { player } from '../src/engine/characters';
import { inbox } from '../src/engine/inbox';
import { newCtx } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { opinion } from '../src/engine/relations';
import { romanceBetween } from '../src/engine/romance';
import {
  approachRate, approachView, ensureSingle, fixerOf, fixView, isSingle, maOdds, maPicks, openFixOf, singleWeek, SINGLE_TEST,
} from '../src/engine/single';
import { upgradeSave } from '../src/engine/upgradeSave';
import { ensureDeeds } from '../src/engine/deeds/state';
import type { GameState, PlayerAction } from '../src/engine/types';

/** A game whose boss is a widower (his mother alive, so Ma is there to fix him up). */
function widower(seed: string): GameState {
  const s = newGame(seed);
  const b = player(s);
  b.orientation = 'straight';
  s.characters[b.spouseId!].alive = false;
  if (b.motherId) s.characters[b.motherId].alive = true;
  return s;
}

/** Weeks of the layer alone; each approach is counted and cleared (as if answered), so the next can come. */
function approachesOverWeeks(s: GameState, weeks: number): number {
  let n = 0;
  for (let w = 0; w < weeks; w++) {
    s.week++;
    singleWeek(newCtx(s));
    if (s.single?.open) { n++; s.single.open = undefined; }
  }
  return n;
}

const come = (id: string, a: 'out' | 'slow' | 'kind' | 'cold'): PlayerAction => ({ kind: 'dating', op: { op: 'come', id, a } });
const ma = (id: string, a: 'meet' | 'notNow' | 'own' | 'decide'): PlayerAction => ({ kind: 'dating', op: { op: 'ma', id, a } });

describe('single: the women who come to him', () => {
  it('a fresh game carries no single state, and loading it changes nothing', () => {
    const s = newGame('single-fresh');
    expect(s.single).toBeUndefined();
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
  });

  it('a single boss gets approached more than a married one over a year', () => {
    let single = 0;
    let married = 0;
    for (const seed of ['sg-a', 'sg-b', 'sg-c']) {
      const w = widower(seed);
      expect(isSingle(w)).toBe(true);
      single += approachesOverWeeks(w, 104);
      const m = newGame(seed);
      expect(isSingle(m)).toBe(false);
      married += approachesOverWeeks(m, 104);
    }
    expect(single).toBeGreaterThan(married * 2);
    expect(single).toBeGreaterThan(6);
  });

  it('allure raises the rate: Charming, a ladies\' man, his looks', () => {
    const s = widower('sg-allure');
    const b = player(s);
    b.traits = b.traits.filter((t) => t !== 'Charming' && t !== 'Womanizer');
    const plain = approachRate(s).perYear;
    b.traits = [...b.traits, 'Charming', 'Womanizer'];
    const charming = approachRate(s);
    expect(charming.perYear).toBeGreaterThan(plain);
    expect(charming.reasons.map((r) => r.label)).toContain('Charming');
    // A married man gets a small share.
    const m = newGame('sg-allure');
    expect(approachRate(m).perYear).toBeLessThan(approachRate(widower('sg-allure')).perYear);
  });

  it('her card: who she is, why, the odds; every answer lands in her feelings and the file', () => {
    const s = widower('sg-card');
    for (let w = 0; w < 400 && !s.single?.open; w++) { s.week++; singleWeek(newCtx(s)); }
    const v = approachView(s)!;
    expect(v).toBeDefined();
    expect(v.age).toBeGreaterThanOrEqual(18);
    expect(v.info.label.length).toBeGreaterThan(3);
    expect(v.odds.chance).toBeGreaterThan(0);
    expect(v.odds.chance).toBeLessThan(1);
    // On the Desk, as a request (not a popup).
    expect(inbox(s).some((x) => x.ref.single === 'come' && x.charId === v.c.id)).toBe(true);
    const p = previewAction(s, come(v.c.id, 'out'));
    expect(p.acceptance).toBeDefined();
    expect(p.refuseEffects?.length).toBeGreaterThan(0);
    for (const a of ['slow', 'kind', 'cold'] as const) expect(previewAction(s, come(v.c.id, a)).disabledReason).toBeUndefined();
    const before = opinion(s, v.c.id, s.playerId);
    const r = actNow(s, come(v.c.id, 'kind'));
    expect(r.result.ok).toBe(true);
    expect(r.state.single?.open).toBeUndefined();
    expect(opinion(r.state, v.c.id, s.playerId)).toBeGreaterThan(before);
    const cold = actNow(s, come(v.c.id, 'cold'));
    expect(opinion(cold.state, v.c.id, s.playerId)).toBeLessThan(before);
    expect(cold.state.dating?.log.some((l) => l.charId === v.c.id)).toBe(true);
  });
});

describe('single: Ma fixes him up', () => {
  it('his mother proposes a match when he is single and over 25, and never when he is married', () => {
    const s = widower('sg-ma');
    const b = player(s);
    expect(ageOn(b.birth, s.date)).toBeGreaterThanOrEqual(25);
    expect(fixerOf(s)?.id).toBe(b.motherId);
    for (let w = 0; w < 300 && !s.single?.fix; w++) { s.week++; singleWeek(newCtx(s)); }
    const f = fixView(s)!;
    expect(f).toBeDefined();
    expect(f.ma.id).toBe(b.motherId);
    expect(f.call).toBe('Ma');
    expect(f.f.why.length).toBeGreaterThan(0);
    expect(inbox(s).some((x) => x.ref.single === 'ma')).toBe(true);

    const m = newGame('sg-ma');
    if (m.characters[player(m).motherId!]) m.characters[player(m).motherId!].alive = true;
    for (let w = 0; w < 300; w++) { m.week++; singleWeek(newCtx(m)); }
    expect(m.single?.fix).toBeUndefined();
    expect(m.single?.n.fix ?? 0).toBe(0);
  });

  it('her match respects consent and the 18+ rule', () => {
    const s = widower('sg-consent');
    for (let w = 0; w < 300 && !s.single?.fix; w++) { s.week++; singleWeek(newCtx(s)); }
    const f = openFixOf(s)!;
    expect(f).toBeDefined();
    const her = s.characters[f.id];
    expect(ageOn(her.birth, s.date)).toBeGreaterThanOrEqual(18);
    for (const x of maPicks(s, s.characters[f.by])) expect(ageOn(x.c.birth, s.date)).toBeGreaterThanOrEqual(18);
    // She (and her family) decide: odds, never certain, and a no is a no.
    const meet = previewAction(s, ma(f.id, 'meet'));
    expect(meet.acceptance!.chance).toBeLessThan(1);
    expect(meet.refuseEffects?.length).toBeGreaterThan(0);
    expect(maOdds(s, f, 'decide').chance).toBeLessThanOrEqual(0.92);
    // Under 18 on the day: nothing is possible.
    const young = structuredClone(s);
    young.characters[f.id].birth = { ...young.date, y: young.date.y - 17 };
    expect(openFixOf(young)).toBeUndefined();
    expect(previewAction(young, ma(f.id, 'meet')).disabledReason).toBeDefined();
    // Let Ma decide: a yes starts a courtship; she is pleased.
    const ma0 = opinion(s, f.by, s.playerId);
    let yes: GameState | undefined;
    for (let i = 0; i < 12 && !yes; i++) {
      const t = structuredClone(s);
      ensureDeeds(t).rng = 1000 + i * 7919;
      const r = actNow(t, ma(f.id, 'decide'));
      if (r.state.characters[f.id] && romanceBetween(r.state, s.playerId, f.id)) yes = r.state;
    }
    expect(yes).toBeDefined();
    expect(opinion(yes!, f.by, s.playerId)).toBeGreaterThan(ma0);
    // A boss who is not drawn to women: Ma can still bring her to dinner, but she cannot arrange a courtship for him.
    const gay = structuredClone(s);
    player(gay).orientation = 'gay';
    expect(previewAction(gay, ma(f.id, 'decide')).disabledReason).toBeDefined();
    expect(previewAction(gay, ma(f.id, 'meet')).disabledReason).toBeUndefined();
    // "Not now, Ma": she thinks less of him, and nags.
    const put = actNow(s, ma(f.id, 'notNow')).state;
    expect(opinion(put, f.by, s.playerId)).toBeLessThan(ma0);
    expect(put.single?.nag).toBe(1);
    expect(put.single?.fix).toBeUndefined();
  });
});

describe('single: no extra popups', () => {
  it('a single boss sees no more popups with the layer than without it', () => {
    const count = (off: boolean) => {
      SINGLE_TEST.off = off;
      try {
        let s = widower('sg-pop');
        let n = 0;
        let cards = 0;
        for (let w = 0; w < 40; w++) {
          s = advanceWeek(s, {}).state;
          n += s.pendingEvents.length;
          expect(s.pendingEvents.some((e) => e.defId.startsWith('single'))).toBe(false);
          if (s.single?.open || s.single?.fix) cards++;
        }
        return { n, cards };
      } finally { SINGLE_TEST.off = false; }
    };
    const on = count(false);
    const off = count(true);
    expect(on.cards).toBeGreaterThan(0);
    expect(off.cards).toBe(0);
    expect(on.n).toBeLessThanOrEqual(off.n);
  });

  it('ensureSingle fills in only what is missing', () => {
    const s = widower('sg-ensure');
    const S = ensureSingle(s);
    S.nag = 2;
    expect(ensureSingle(s).nag).toBe(2);
  });
});
