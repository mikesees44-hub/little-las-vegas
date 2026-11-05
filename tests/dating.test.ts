import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { makeCharacter } from '../src/engine/characters';
import { applyEffects } from '../src/engine/effects';
import { newCtx } from '../src/engine/ledger';
import { previewAction, resolveActions } from '../src/engine/actions';
import { addOpinion, opinion } from '../src/engine/relations';
import { bloodChildren, romanceBetween, romanceMonth, startRomance } from '../src/engine/romance';
import { ensureRomance } from '../src/engine/storyState';
import { roundOptions, roundSlots, roundsWeek } from '../src/engine/rounds';
import { ageOn } from '../src/engine/calendar';
import { officePhone } from '../src/engine/bossOffice';
import { upgradeSave } from '../src/engine/upgradeSave';
import {
  applyDatingOp, conceptionOdds, datingPhone, datingView, datingWeek, herDecision, peopleYouKnow, previewDating, providerRows, stageOf,
  type DatingAction,
} from '../src/engine/dating';
import { ensureDating, setDatingSettings } from '../src/engine/datingState';
import type { Character, GameState, PlayerAction } from '../src/engine/types';
import { playWeeks } from './helpers';

/** A game a week in (the dating layer and its roster exist), the boss unmarried, money in his pocket. */
function fresh(seed = 'dating-a', married = false): GameState {
  let s = newGame(seed);
  s = advanceWeek(s, {}).state;
  const boss = s.characters[s.playerId];
  boss.orientation = 'straight';
  if (!married && boss.spouseId) {
    const w = s.characters[boss.spouseId];
    w.alive = false;
    boss.spouseId = undefined;
  }
  s.tribute!.acct.personal = 5000;
  return s;
}

function woman(s: GameState, age = 28, extra: Partial<Character> = {}): Character {
  const c = makeCharacter(s, { gender: 'F', age, rank: 'civilian', faction: 'none', nickname: false, traits: [] });
  c.orientation = 'straight';
  Object.assign(c, extra);
  ensureDating(s).met[c.id] = s.week;
  return c;
}

const act = (op: DatingAction): PlayerAction => ({ kind: 'dating', op });

/** Apply an order as if she said yes (the effects of its preview). */
function accept(s: GameState, op: DatingAction): string[] {
  const ctx = newCtx(s);
  const p = previewDating(s, op);
  expect(p.disabledReason).toBeUndefined();
  applyEffects(ctx, p.effects, { label: p.title, because: p.because, category: 'event' });
  return ctx.log;
}

const street = (s: GameState) => Object.values(s.dating!.providers).find((p) => p.kind === 'street' && p.status === 'working')!;

describe('1. she accepts or declines from her own state', () => {
  it('her odds follow her feelings, her marriage, her faith and her orientation; money never guarantees', () => {
    const s = fresh();
    const a = woman(s);
    const fond = woman(s);
    ensureDating(s).bonds[fond.id] = { id: fond.id, aff: 70, rung: 'friends', dates: 2, since: 0, gifts: [], via: 'test' };
    expect(herDecision(s, fond, 'date', 'dinner').chance).toBeGreaterThan(herDecision(s, a, 'date', 'dinner').chance);
    const notDrawn = woman(s, 30, { orientation: 'gay' });
    expect(herDecision(s, notDrawn, 'date', 'dinner').chance).toBe(0);
    // A baseline above the 5% floor, so the marriage and the faith can show.
    ensureDating(s).bonds[a.id] = { id: a.id, aff: 50, rung: 'friends', dates: 1, since: 0, gifts: [], via: 'test' };
    const before = herDecision(s, a, 'date', 'dinner').chance;
    expect(before).toBeGreaterThan(0.05);
    const hub = makeCharacter(s, { gender: 'M', age: 33, rank: 'civilian', faction: 'none' });
    a.spouseId = hub.id; hub.spouseId = a.id; a.traits = ['Pious'];
    expect(herDecision(s, a, 'date', 'dinner').chance).toBeLessThan(before);
    // Ten bracelets later she still decides: never above 90%, and no step is skipped.
    for (let i = 0; i < 10; i++) accept(s, { op: 'gift', id: fond.id, tier: 'jewelry' });
    expect(herDecision(s, fond, 'date', 'dinner').chance).toBeLessThanOrEqual(0.9);
    expect(previewDating(s, { op: 'steady', id: fond.id }).disabledReason).toBeTruthy();
  });

  it('a no costs nothing and is remembered', () => {
    const s = fresh();
    const c = woman(s);
    addOpinion(s, c.id, s.playerId, 'test', -20, 0);
    c.traits = ['Pious'];
    const pocket = s.tribute!.acct.personal;
    let refused = 0;
    let accepted = 0;
    expect(herDecision(s, c, 'date', 'dinner').chance).toBeLessThan(0.2);
    for (let i = 0; i < 20; i++) {
      s.rng = 1000 + i;
      s.week++;
      const ctx = newCtx(s);
      resolveActions(ctx, [act({ op: 'invite', id: c.id, date: 'dinner' })], { strictFunding: true });
      if (ctx.log.some((l) => l.includes('refused'))) refused++;
      if (ctx.log.some((l) => l.includes('accepted'))) accepted++;
    }
    expect(refused + accepted).toBeGreaterThanOrEqual(5);
    expect(refused).toBeGreaterThan(accepted);
    expect(s.dating!.bonds[c.id].no).toBeTruthy();
    expect(s.tribute!.acct.personal).toBe(pocket - accepted * 60);
  });
});

describe('2. paid company', () => {
  it('takes exactly the displayed price from the pocket and creates no feelings or relationship', () => {
    const s = fresh();
    const p = street(s);
    const prev = previewDating(s, { op: 'paid', id: p.id });
    expect(prev.cost).toBe(p.price);
    expect(prev.pot).toBe('pocket');
    expect(prev.warning).toMatch(/What can go wrong/);
    const pocket = s.tribute!.acct.personal;
    const family = s.money;
    accept(s, { op: 'paid', id: p.id });
    expect(s.tribute!.acct.personal).toBe(pocket - p.price);
    expect(s.money).toBe(family);
    expect(romanceBetween(s, s.playerId, p.id)).toBeUndefined();
    expect(s.dating!.bonds[p.id]).toBeUndefined();
    expect(stageOf(s, p.id)).toBe('acquaintance');
    expect(s.dating!.providers[p.id].visits).toContain(s.week);
    // No standing access: booking again needs a new agreement (and not twice in a week).
    expect(previewDating(s, { op: 'paid', id: p.id }).disabledReason).toMatch(/booked/);
  });

  it('a short pocket never dips into the Family without approval (orders and the Madam\'s evening)', () => {
    const s = fresh();
    const p = street(s);
    s.tribute!.acct.personal = 0;
    const family = s.money;
    const ctx = newCtx(s);
    resolveActions(ctx, [act({ op: 'paid', id: p.id })], { strictFunding: true });
    expect(ctx.log.join(' ')).toMatch(/not carried out.*approved Family money/);
    expect(s.money).toBe(family);
    // The Madam's evening (Your rounds): pocket only.
    const opts = roundOptions(s);
    const esc = opts.find((r) => r.id === 'fun:escort');
    expect(esc?.pocketOnly).toBe(true);
    const ctx2 = newCtx(s);
    const lines = roundsWeek(ctx2, ['fun:escort'], opts);
    expect(lines.join(' ')).toMatch(/pocket is short/);
    expect(s.money).toBe(family);
    // With approval (fund: 'family') the order may go ahead.
    s.rng = 7;
    const ctx3 = newCtx(s);
    resolveActions(ctx3, [{ ...act({ op: 'paid', id: p.id }), fund: 'family' }], { strictFunding: true });
    expect(ctx3.log.join(' ')).not.toMatch(/approved Family money/);
  });
});

describe('3. a personal date with an escort or a dancer is its own invitation', () => {
  it('she can say no, keep it professional, or take it personally', () => {
    const s = fresh();
    const p = Object.values(s.dating!.providers).find((x) => x.kind === 'escort')!;
    expect(previewDating(s, { op: 'invite', id: p.id, date: 'dinner' }).disabledReason).toMatch(/personal date first/);
    const ask = previewDating(s, { op: 'askOut', id: p.id });
    expect(ask.acceptance).toBeTruthy();
    expect(ask.refuseEffects?.length).toBeTruthy();
    const kinds = new Set<string>();
    for (let w = 0; w < 40; w++) {
      const t = structuredClone(s);
      t.week = s.week + w;
      t.dating!.evenings = { week: t.week, n: 0 };
      accept(t, { op: 'askOut', id: p.id });
      const b = t.dating!.bonds[p.id];
      kinds.add(b.pro ? 'professional' : 'personal');
      expect(romanceBetween(t, t.playerId, p.id)).toBeUndefined();
    }
    expect(kinds).toEqual(new Set(['professional', 'personal']));
  });
});

describe('4. no minor in any choice', () => {
  it('a minor never appears in any list, preview or commit, even with bad data; turning 18 is rechecked', () => {
    const s = fresh();
    const kid = woman(s, 16);
    addOpinion(s, kid.id, s.playerId, 'test', 30, 0);
    const D = ensureDating(s);
    D.bonds[kid.id] = { id: kid.id, aff: 80, rung: 'attracted', dates: 3, since: 0, gifts: [], via: 'bad data' };
    D.providers[kid.id] = { id: kid.id, kind: 'dancer', venue: 'x', price: 100, offers: true, discretion: 50, via: 'club', since: 0, status: 'working', visits: [] };
    const v = datingView(s);
    const all = [...v.people, ...v.relationships, ...v.adult];
    expect(all.some((r) => r.id === kid.id)).toBe(false);
    for (const op of [{ op: 'talk', id: kid.id }, { op: 'invite', id: kid.id, date: 'dinner' }, { op: 'paid', id: kid.id }, { op: 'askOut', id: kid.id }, { op: 'gift', id: kid.id, tier: 'flowers' }] as DatingAction[]) {
      expect(previewDating(s, op).disabledReason).toBeTruthy();
    }
    expect(herDecision(s, kid, 'date').chance).toBe(0);
    expect(startRomance(s, s.playerId, kid.id)).toBeUndefined();
    const ctx = newCtx(s);
    applyDatingOp(ctx, { op: 'paid', id: kid.id, price: 100 });
    applyDatingOp(ctx, { op: 'date', id: kid.id, date: 'dinner' });
    expect(D.providers[kid.id].visits).toEqual([]);
    datingWeek(ctx);
    expect(s.dating!.bonds[kid.id]).toBeUndefined();
    // Revalidated as time passes: someone who turns 18 next month appears only then.
    const soon = woman(s, 18);
    const next = s.date.m === 12 ? { y: s.date.y + 1, m: 1 } : { y: s.date.y, m: s.date.m + 1 };
    soon.birth = { y: next.y - 18, m: next.m, d: 1 };
    expect(peopleYouKnow(s).some((c) => c.id === soon.id)).toBe(false);
    s.date = { ...s.date, y: next.y, m: next.m, d: 28 };
    expect(peopleYouKnow(s).some((c) => c.id === soon.id)).toBe(true);
  });

  it('a played game never lists anyone under 18 anywhere', () => {
    let s = playWeeks('dating-play', 30);
    for (let i = 0; i < 2; i++) s = advanceWeek(s, {}).state;
    const v = datingView(s);
    const ages = [...v.people, ...v.relationships].map((r) => r.age).concat(v.adult.map((p) => p.age), v.intros.map((x) => x.age));
    for (const a of ages) expect(a).toBeGreaterThanOrEqual(18);
    for (const d of datingPhone(s)) if (d.charId) expect(ageOn(s.characters[d.charId].birth, s.date)).toBeGreaterThanOrEqual(18);
  });
});

describe('5. pregnancy from evenings together (casual and paid nights at lower odds)', () => {
  it('never from talks, gifts or introductions; lower for paid company; at the setting from dates', () => {
    const s = setDatingSettings(fresh(), { pregnancy: 'normal' });
    const c = woman(s, 26);
    const R = ensureRomance(s);
    startRomance(s, s.playerId, c.id);
    const p = street(s);
    // A casual or paid night is possible but less likely than a relationship's (owner, 2026-11-05).
    expect(conceptionOdds(s, s.characters[p.id])).toBeLessThan(conceptionOdds(s, c));
    for (let w = 0; w < 120; w++) {
      s.week++;
      const ctx = newCtx(s);
      applyDatingOp(ctx, { op: 'talk', id: c.id });
      applyDatingOp(ctx, { op: 'gift', id: c.id, tier: 'flowers' });
    }
    expect(R.pregnancies.length).toBe(0);
    // A date inside the relationship is the appropriate event.
    for (let w = 0; w < 200 && !R.pregnancies.length; w++) {
      s.week++;
      applyDatingOp(newCtx(s), { op: 'date', id: c.id, date: 'dinner' });
    }
    expect(R.pregnancies.length).toBe(1);
    expect(R.pregnancies[0].motherId).toBe(c.id);
    // Off means never.
    const t = setDatingSettings(fresh('dating-b'), { pregnancy: 'off' });
    const d = woman(t, 26);
    startRomance(t, t.playerId, d.id);
    for (let w = 0; w < 300; w++) { t.week++; applyDatingOp(newCtx(t), { op: 'date', id: d.id, date: 'dinner' }); }
    expect(t.romance!.pregnancies.length).toBe(0);
  });
});

describe('6. a child is a consistent, persistent person', () => {
  it('valid parents, birth date, family records, the boss\'s decision; never on a dating list', () => {
    const s = fresh();
    const c = woman(s, 27);
    const r = startRomance(s, s.playerId, c.id)!;
    const R = ensureRomance(s);
    R.pregnancies.push({ id: 'pgX', motherId: c.id, fatherId: s.playerId, romanceId: r.id, dueWeek: s.week });
    const ctx = newCtx(s);
    romanceMonth(ctx);
    const child = Object.values(s.characters).find((k) => k.motherId === c.id)!;
    expect(child).toBeTruthy();
    expect(child.alive).toBe(true);
    expect(child.birth).toEqual(s.date);
    expect(child.bioFatherId).toBe(s.playerId);
    expect(c.childrenIds).toContain(child.id);
    expect(bloodChildren(s, s.characters[s.playerId]).map((k) => k.id)).toContain(child.id);
    expect(s.eventQueue.some((e) => e.defId === 'rom_child' && e.meta?.subject === child.id)).toBe(true);
    const v = datingView(s);
    expect(v.family.children.some((l) => l.charId === child.id)).toBe(true);
    expect([...v.people, ...v.relationships, ...v.adult].some((x) => x.id === child.id)).toBe(false);
    // Persistent: still there, still consistent, after a save round trip.
    const loaded = upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(loaded.characters[child.id].motherId).toBe(c.id);
  });
});

describe('7. privacy: nothing becomes public by itself', () => {
  it('she knows first; she tells the boss in her own time; nobody else is told', () => {
    const s = setDatingSettings(fresh('dating-c', true), { pregnancy: 'normal' });
    const boss = s.characters[s.playerId];
    const wife = s.characters[boss.spouseId!];
    const c = woman(s, 25);
    startRomance(s, boss.id, c.id);
    for (let w = 0; w < 300 && !s.romance!.pregnancies.length; w++) { s.week++; applyDatingOp(newCtx(s), { op: 'date', id: c.id, date: 'dinner' }); }
    expect(s.romance!.pregnancies.length).toBe(1);
    const k = s.dating!.preg[0];
    expect(k.knownBy).toEqual([c.id]);
    expect(datingView(s).family.pregnancies.length).toBe(0);
    expect(s.chronicle.some((e) => /expecting|pregnan/i.test(e.text))).toBe(false);
    s.week = k.tellAt;
    datingWeek(newCtx(s));
    if (k.knownBy.includes(boss.id)) expect(datingView(s).family.pregnancies[0].label).toBe('Private');
    expect(k.knownBy).not.toContain(wife.id);
    expect(s.chronicle.some((e) => /expecting|pregnan/i.test(e.text))).toBe(false);
  });
});

describe('8. save and load', () => {
  it('bonds, providers, settings, rumors and pregnancies survive a save round trip and the game goes on', () => {
    let s = setDatingSettings(fresh(), { mature: 'standard', pregnancy: 'rare' });
    const c = woman(s);
    accept(s, { op: 'talk', id: c.id });
    accept(s, { op: 'paid', id: street(s).id });
    const loaded = upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(loaded.dating).toEqual(s.dating);
    expect(datingView(loaded)).toEqual(datingView(s));
    s = advanceWeek(loaded, {}).state;
    expect(s.dating!.settings).toEqual({ mature: 'standard', pregnancy: 'rare' });
    expect(s.dating!.bonds[c.id]).toBeTruthy();
  });
});

describe('9. the mature-content setting, at every entry point', () => {
  it('Off removes adult services from the screen, the phone, the evenings, the previews and the week', () => {
    const on = fresh();
    const p = street(on);
    expect(providerRows(on).length).toBeGreaterThan(0);
    expect(roundOptions(on).some((r) => r.id === 'fun:escort')).toBe(true);
    expect(officePhone(on).some((x) => x.kind === 'company')).toBe(true);
    const s = setDatingSettings(on, { mature: 'off' });
    expect(on.dating!.settings.mature).toBe('fade');
    expect(datingView(s).adult).toEqual([]);
    expect(providerRows(s)).toEqual([]);
    expect(peopleYouKnow(s).some((c) => c.id === p.id)).toBe(false);
    expect(previewDating(s, { op: 'paid', id: p.id }).disabledReason).toMatch(/turned off/);
    expect(roundOptions(s).some((r) => r.id === 'fun:escort')).toBe(false);
    expect(datingPhone(s).some((x) => x.adult)).toBe(false);
    expect(officePhone(s).some((x) => x.kind === 'company')).toBe(false);
    // An order or an evening queued before the switch is not carried out.
    const pocket = s.tribute!.acct.personal;
    const ctx = newCtx(s);
    resolveActions(ctx, [act({ op: 'paid', id: p.id })], { strictFunding: true });
    expect(s.tribute!.acct.personal).toBe(pocket);
    const lines = roundsWeek(newCtx(s), ['fun:escort'], roundOptions(on));
    expect(lines.join(' ')).not.toMatch(/Madam|company/);
    expect(s.tribute!.acct.personal).toBe(pocket);
  });

  it('Fade-out reports only the fade; Standard adds a short, non-explicit scene', () => {
    const fade = fresh();
    const std = setDatingSettings(fresh(), { mature: 'standard' });
    const a = accept(fade, { op: 'paid', id: street(fade).id }).join(' ');
    const b = accept(std, { op: 'paid', id: street(std).id }).join(' ');
    expect(a).toMatch(/Then it was morning/);
    expect(b).toMatch(/Then it was morning/);
    expect(b.length).toBeGreaterThan(a.length);
  });
});

describe('the ladder and the boss\'s evenings', () => {
  it('climbs only by her feelings; dates take evenings from the week', () => {
    const s = fresh();
    const c = woman(s);
    expect(stageOf(s, c.id)).toBe('acquaintance');
    const slots = previewAction(s, act({ op: 'invite', id: c.id, date: 'dinner' }));
    expect(slots.pot).toBe('pocket');
    for (let i = 0; i < 4; i++) { s.week++; accept(s, { op: 'invite', id: c.id, date: 'dinner' }); }
    expect(['friends', 'attracted']).toContain(stageOf(s, c.id));
    expect(opinion(s, c.id, s.playerId)).toBeGreaterThan(0);
    const before = roundOptions(s).length;
    expect(before).toBeGreaterThan(0);
    const w0 = roundSlots(s).slots;
    accept(s, { op: 'invite', id: c.id, date: 'coffee' });
    expect(roundSlots(s).slots).toBe(w0 - 1);
  });
});
