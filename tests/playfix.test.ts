import { describe, expect, it } from 'vitest';
import { player } from '../src/engine/characters';
import { briefing } from '../src/engine/briefing';
import { newGameWith } from '../src/engine/starts';
import { docketOf, ltDecide, pendingAsks } from '../src/engine/lieutenants';
import { inbox } from '../src/engine/inbox';
import { officeVisitors } from '../src/engine/bossOffice';
import { moneyAtStake } from '../src/engine/attention';
import { creatorBase, pointsSpent, BUDGET } from '../src/engine/charCreate';
import { SHOWBIZ } from '../src/engine/storyData2Showbiz';
import { mapFx } from '../src/engine/storyPack';
import { SCENES_BY_ID } from '../src/engine/authored/library';
import { buildScene, castScene } from '../src/engine/authored/run';
import { explainChoice } from '../src/engine/advice';
import { visibleItems, sitdownSpeakers } from '../src/ui/sitdown/SitDown';
import { nextConfirms } from '../src/ui/confirmQueue';
import type { PlayerAction } from '../src/engine/types';

const SEED = 'rmppm6q1';

describe('Playtest fixes: The Old Don', () => {
  it('"Hear him out" opens the Sit-Down on that item, even past the first weeks\' two-item cap', () => {
    for (const seed of [SEED, 'od-a', 'od-b']) {
      const s = newGameWith(seed, 'olddon');
      const b = briefing(s);
      const plain = visibleItems(s, b);
      const hidden = b.items.find((i) => !plain.has(i.id));
      if (!hidden) continue;
      const shown = visibleItems(s, b, hidden.id);
      expect(shown.has(hidden.id)).toBe(true);
      const sp = sitdownSpeakers(b, shown, b.speakers.find((x) => x.items.some((i) => i.id === hidden.id))!.key);
      expect(sp[0].items.some((i) => i.id === hidden.id)).toBe(true);
      return;
    }
    throw new Error('no seed had a hidden sit-down item');
  });

  it('the married children are married: nobody looks for a match for Paolo or Teresa', () => {
    for (const seed of [SEED, 'od-a', 'od-c']) {
      const s = newGameWith(seed, 'olddon');
      const [paolo, teresa, nicky] = player(s).childrenIds.map((id) => s.characters[id]);
      expect(paolo.spouseId && s.characters[paolo.spouseId].alive).toBeTruthy();
      expect(teresa.spouseId && s.characters[teresa.spouseId].alive).toBeTruthy();
      expect(nicky.spouseId).toBeUndefined();
      const b = briefing(s);
      expect(b.items.some((i) => i.id === `match:${paolo.id}` || i.id === `match:${teresa.id}`)).toBe(false);
      expect(s.pendingEvents.some((e) => e.defId === 'dyn_proposal' && (e.text.includes('Paolo') || e.text.includes('Teresa')))).toBe(false);
    }
  });

  it('two confirms in a row wait in line (the second never replaces the first)', () => {
    const a: PlayerAction = { kind: 'interact', id: 'dinner', target: 'c1' } as PlayerAction;
    const b: PlayerAction = { kind: 'interact', id: 'gift_small', target: 'c2' } as PlayerAction;
    let q = nextConfirms([], a);
    q = nextConfirms(q, b);
    q = nextConfirms(q, a);
    expect(q).toEqual([a, b]);
    q = nextConfirms(q, undefined);
    expect(q).toEqual([b]);
  });

  it('an approved proposal does not come back on the Desk as a sit-down item', () => {
    let s = newGameWith(SEED, 'olddon');
    const asks = pendingAsks(s);
    expect(asks.length).toBeGreaterThan(0);
    for (const a of asks) s = ltDecide(s, a.id, 'approve');
    const subjects = new Set(asks.map((a) => a.id.slice(a.id.indexOf(':') + 1)));
    const rows = inbox(s);
    expect(rows.filter((r) => r.ref.brief && subjects.has(r.ref.brief))).toEqual([]);
    expect(docketOf(s).length).toBeGreaterThan(0);
  });

  it('the creator never shows more points left than the pool', () => {
    for (const start of ['olddon', 'classic'] as const) {
      const s = newGameWith('cc-pf', start);
      const base = creatorBase(s, start);
      expect(base.budget).toBe(BUDGET);
      const keep = pointsSpent(base, { traits: base.traits, vice: base.vices?.length ? undefined : 'none' });
      expect(keep).toBe(0);
    }
    const base = creatorBase(newGameWith('cc-pf', 'olddon'), 'olddon');
    // Giving up the start's vices costs what a vice refunds.
    expect(pointsSpent(base, { vice: 'none' })).toBe(2);
  });

  it('buying the pressing plant grants a pressing plant, by name', () => {
    const ev = SHOWBIZ.find((e) => e.id === 'p2_kin_1')!;
    const opt = ev.options.find((o) => o.text.includes('pressing plant'))!;
    const s = newGameWith(SEED, 'olddon');
    const fx = opt.effects!.find((f) => f.k === 'business')!;
    const out = mapFx(s, ev, { district: 'causeway' } as never, fx);
    const add = out.find((e) => e.type === 'addBusiness');
    expect(add && add.type === 'addBusiness' && add.business.name).toBe('Kincaid Record Pressing');
  });

  it('the Desk money chip shows the amounts the card shows', () => {
    expect(moneyAtStake([-5400, -3200, -7300])).toBe('$3,200–$7,300 on the line');
    expect(moneyAtStake([-2500])).toBe('$2,500 on the line');
  });

  it('the birthday is the Don\'s own matter, and no option prints its line twice', () => {
    const s = newGameWith(SEED, 'olddon');
    const ag = s.oldDon!.agenda.find((a) => a.scene === 'od_birthday')!;
    const sc = SCENES_BY_ID.od_birthday;
    const cast = castScene(s, sc, ag.cast)!;
    const ev = buildScene(s, sc, cast)!;
    s.pendingEvents.push(ev);
    const v = officeVisitors(s).find((x) => x.ref.event === ev.iid)!;
    expect(v.name).toBe('Sixty-six candles');
    for (const ch of ev.choices) if (ch.detail) expect(explainChoice(s, ch).purpose).not.toBe(ch.detail);
  });
});

describe('Playtest fixes: dates', () => {
  it('a relationship seeded from before the game reads as a date, never a negative week', async () => {
    const { sinceWeek } = await import('../src/ui/format');
    expect(sinceWeek(5)).toBe('Since week 5');
    const old = sinceWeek(-93, 3);
    expect(old).not.toMatch(/-\d/);
    expect(old).toMatch(/^For 1?\d years \(since \w+ 19[45]\d\)$|^Since \w+ 19[45]\d$/);
    expect(sinceWeek(-200, 3)).toMatch(/^For 3 years \(since /);
  });
});

describe('Playtest fixes: an evening with the goomar', () => {
  it('her card does not offer the same evening again at new odds, and a goomar of years is likely to say yes', async () => {
    const { defaultPlan, eveningBlock, inviteAcceptance, approachText } = await import('../src/engine/evening');
    const { actNow } = await import('../src/engine/deeds/now');
    let s = newGameWith(SEED, 'olddon');
    const gid = Object.keys(s.nightlife!.goomars)[0];
    const plan = { ...defaultPlan(s, gid), approach: 'queen' as const };
    expect(eveningBlock(s, plan)).toBeUndefined();
    expect(inviteAcceptance(s, s.characters[gid], plan).chance).toBeGreaterThanOrEqual(0.5);
    expect(approachText(s, gid, 'something')).not.toMatch(/road to/);
    const r = actNow(s, { kind: 'nightlife', op: { op: 'invite', plan } });
    expect(r.result.ok).toBe(true);
    s = r.state;
    expect(eveningBlock(s, plan)).toMatch(/already had your evening/);
  });
});

describe('Playtest fixes: Ready to advance?', () => {
  it('the Family total after the week subtracts the weekly bills listed above it', async () => {
    const { readyReview } = await import('../src/engine/desk');
    const s = newGameWith(SEED, 'olddon');
    const r = readyReview(s, {});
    expect(r.costs.bills).toBeGreaterThan(0);
    expect(r.costs.familyAfter).toBe(Math.round(s.money - r.costs.orders - r.costs.bills));
  });
});
