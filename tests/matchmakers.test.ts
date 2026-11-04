import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { previewAction, settleOrderNow } from '../src/engine/actions';
import { actNow } from '../src/engine/actNow';
import { alerts } from '../src/engine/alerts';
import { ageOn } from '../src/engine/calendar';
import { makeCharacter, player } from '../src/engine/characters';
import { marriageable } from '../src/engine/familyHouses';
import { ensureDynState, famMut, type House } from '../src/engine/familyState';
import { matchOfferSource } from '../src/engine/generations';
import { newCtx } from '../src/engine/ledger';
import {
  applyMatchOp, circleView, courtWord, ensureMatchmakers, matchmakersWeek, matchOdds, matronOf, momKnowsBestSource,
  openProposal, proposalView, weighOf, herPicks, type Proposal,
} from '../src/engine/matchmakers';
import { newGame } from '../src/engine/newGame';
import { opinion } from '../src/engine/relations';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { Character, GameState, PlayerAction } from '../src/engine/types';

function son(s: GameState, age = 24): Character {
  const boss = player(s);
  const c = makeCharacter(s, { gender: 'M', age, lastName: boss.lastName, ethnicity: 'Italian', dynasty: true, faction: 'player', rank: 'civilian', nickname: false });
  c.fatherId = boss.id;
  if (boss.spouseId) c.motherId = boss.spouseId;
  boss.childrenIds.push(c.id);
  if (boss.spouseId) s.characters[boss.spouseId].childrenIds.push(c.id);
  return c;
}

function bride(s: GameState, h: House): Character {
  const pool = marriageable(s, h).filter((c) => c.gender === 'F');
  if (pool.length) return pool[0];
  const head = s.characters[h.headId];
  const c = makeCharacter(s, { gender: 'F', age: 21, lastName: head.lastName, ethnicity: head.ethnicity, rank: 'civilian', faction: 'none', nickname: false });
  famMut(s, c.id).houseId = h.id;
  return c;
}

/** A game where the boss is married and has a grown son, with her proposal on the table. */
function withProposal(seed = 'mm'): { s: GameState; wife: Character; kid: Character; p: Proposal } {
  const s = newGame(seed);
  ensureDynState(s);
  const boss = player(s);
  const wife = s.characters[boss.spouseId!];
  son(s);
  for (let w = 0; w < 3000 && !s.matchmakers?.open; w++) { s.week++; matchmakersWeek(newCtx(s)); }
  const p = openProposal(s)!;
  return { s, wife, kid: s.characters[p.memberId], p };
}

const ans = (id: string, answer: 'bless' | 'grumble' | 'veto' | 'own', extra: { memberId?: string; spouseId?: string } = {}): PlayerAction => ({ kind: 'bond', op: { op: 'match', id, answer, ...extra } });

describe('the matchmakers: who arranges', () => {
  it('the wife arranges; without her, the boss\'s mother or the eldest woman of the house', () => {
    const s = newGame('mm-who');
    const boss = player(s);
    expect(boss.spouseId).toBeDefined();
    expect(matronOf(s)?.id).toBe(boss.spouseId);
    s.characters[boss.spouseId!].alive = false;
    const aunt = makeCharacter(s, { gender: 'F', age: 58, lastName: boss.lastName, dynasty: true, faction: 'player', rank: 'civilian', nickname: false });
    expect(matronOf(s)?.id).toBe(boss.motherId && s.characters[boss.motherId]?.alive ? boss.motherId : aunt.id);
  });

  it('a fresh game carries no matchmakers state, and loading it changes nothing', () => {
    const s = newGame('mm-fresh');
    expect(s.matchmakers).toBeUndefined();
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
  });

  it('the houses\' offers go to her: matchOfferSource is quiet while a woman of the house is there', () => {
    const s = newGame('mm-offer');
    ensureDynState(s);
    son(s);
    let ev;
    for (let w = 0; w < 600 && !ev; w++) { s.week++; ev = matchOfferSource(s); }
    expect(ev).toBeUndefined();
  });
});

describe('her proposal', () => {
  it('she brings one of ours (18+) a match she picked by what she weighs, with her reasons and an alert', () => {
    const { s, wife, kid, p } = withProposal();
    expect(p).toBeDefined();
    expect(p.by).toBe(wife.id);
    expect(p.why.length).toBeGreaterThanOrEqual(2);
    expect(p.weigh).toBe(weighOf(s, wife, kid));
    expect(herPicks(s, wife, kid)[0].c.id).toBe(p.spouseId);
    const sp = s.characters[p.spouseId];
    expect(ageOn(sp.birth, s.date)).toBeGreaterThanOrEqual(18);
    expect(ageOn(kid.birth, s.date)).toBeGreaterThanOrEqual(18);
    expect(alerts(s).some((a) => a.title.startsWith(`${wife.firstName} has a match for`))).toBe(true);
    expect(proposalView(s)?.odds.chance).toBeGreaterThan(0);
  });

  it('every answer shows its odds and effects before he chooses; a veto is certain', () => {
    const { s, wife } = withProposal('mm-prev');
    const bless = previewAction(s, ans(wife.id, 'bless'));
    expect(bless.disabledReason).toBeUndefined();
    expect(bless.acceptance?.chance).toBeGreaterThan(0);
    expect(bless.acceptance!.reasons.some((r) => /over coffee/.test(r.label))).toBe(true);
    expect(bless.effects.some((e) => e.type === 'dyn')).toBe(true);
    expect(bless.refuseEffects?.length).toBe(1);
    const grumble = previewAction(s, ans(wife.id, 'grumble'));
    expect(grumble.acceptance!.chance).toBeLessThanOrEqual(bless.acceptance!.chance);
    const veto = previewAction(s, ans(wife.id, 'veto'));
    expect(veto.acceptance).toBeUndefined();
    expect(veto.effects.some((e) => e.type === 'dyn')).toBe(false);
  });

  it('bless: the marriage, her standing rises, a favor owed, she thinks better of him', () => {
    const { s, wife, kid, p } = withProposal('mm-bless');
    const op0 = opinion(s, wife.id, s.playerId);
    const st0 = s.matchmakers!.circle[wife.id].standing;
    settleOrderNow(newCtx(s), ans(wife.id, 'bless'), true);
    expect(kid.spouseId).toBe(p.spouseId);
    const c = s.matchmakers!.circle[wife.id];
    expect(c.standing).toBeGreaterThan(st0);
    expect(c.favors.some((f) => f.houseId === p.houseId)).toBe(true);
    expect(opinion(s, wife.id, s.playerId)).toBeGreaterThan(op0);
    expect(s.matchmakers!.open).toBeUndefined();
    expect(s.matchmakers!.made.at(-1)?.how).toBe('bless');
  });

  it('grumble: still married, her standing still rises, she thinks a little less of him', () => {
    const { s, wife, kid, p } = withProposal('mm-grumble');
    const op0 = opinion(s, wife.id, s.playerId);
    const st0 = s.matchmakers!.circle[wife.id].standing;
    settleOrderNow(newCtx(s), ans(wife.id, 'grumble'), true);
    expect(kid.spouseId).toBe(p.spouseId);
    expect(s.matchmakers!.circle[wife.id].standing).toBeGreaterThan(st0);
    expect(opinion(s, wife.id, s.playerId)).toBeLessThan(op0);
  });

  it('veto: no marriage, her opinion drops more, the women talk, her standing takes a hit; it lands in Your File', () => {
    const { s, wife, kid } = withProposal('mm-veto');
    const op0 = opinion(s, wife.id, s.playerId);
    const st0 = s.matchmakers!.circle[wife.id].standing;
    const r = actNow(s, ans(wife.id, 'veto'));
    expect(r.result.ok).toBe(true);
    const s2 = r.state;
    expect(s2.characters[kid.id].spouseId).toBeUndefined();
    expect(s2.matchmakers!.circle[wife.id].standing).toBeLessThan(st0);
    expect(opinion(s2, wife.id, s2.playerId)).toBeLessThanOrEqual(op0 - 6);
    const last = s2.journal!.e.at(-1)!;
    expect(last.r?.some((x) => /women talk/.test(x))).toBe(true);
    expect(r.result.line).toMatch(/women talk/);
  });

  it('a no is a story: the young person can refuse, and nobody is married', () => {
    const { s, wife, kid, p } = withProposal('mm-no');
    settleOrderNow(newCtx(s), ans(wife.id, 'bless'), false);
    expect(kid.spouseId).toBeUndefined();
    expect(s.matchmakers!.open).toBeUndefined();
    expect(s.matchmakers!.rest[kid.id]).toBeGreaterThan(s.week);
    expect(s.matchmakers!.log.at(-1)![1]).toMatch(/said no|promised elsewhere/);
    void p;
  });

  it('his own candidate goes through her: her side is in the odds, and she may push back', () => {
    const { s, wife, kid, p } = withProposal('mm-own');
    const picks = herPicks(s, wife, kid);
    const other = picks[picks.length - 1];
    const own = ans(wife.id, 'own', { memberId: kid.id, spouseId: other.c.id });
    const pv = previewAction(s, own);
    expect(pv.disabledReason).toBeUndefined();
    expect(pv.acceptance!.reasons.some((r) => r.label.startsWith(wife.firstName))).toBe(true);
    settleOrderNow(newCtx(s), own, false);
    expect(kid.spouseId).toBeUndefined();
    void p;
  });

  it('adults only: a match for a child of 17 is refused at the preview', () => {
    const { s, wife } = withProposal('mm-minor');
    const kid = son(s, 17);
    const h = s.dyn!.houses[0];
    const b = bride(s, h);
    const pv = previewAction(s, ans(wife.id, 'own', { memberId: kid.id, spouseId: b.id }));
    expect(pv.disabledReason).toBeDefined();
  });

  it('silence: after six weeks she goes ahead on her own (the young person still decides)', () => {
    const { s, wife, kid } = withProposal('mm-silence');
    const n0 = s.matchmakers!.made.length;
    for (let i = 0; i < 7 && s.matchmakers!.open; i++) { s.week++; matchmakersWeek(newCtx(s)); }
    expect(s.matchmakers!.open).toBeUndefined();
    if (kid.spouseId) expect(s.matchmakers!.made.length).toBe(n0 + 1);
    else expect(s.matchmakers!.rest[kid.id]).toBeGreaterThan(s.week - 1);
    void wife;
  });
});

describe('her standing', () => {
  it('her circle shows; favors can be called in, and a call spends the favor', () => {
    const { s, wife, p } = withProposal('mm-favor');
    settleOrderNow(newCtx(s), ans(wife.id, 'bless'), true);
    const v = circleView(s)!;
    expect(v.matron.id).toBe(wife.id);
    expect(v.circle.made).toBe(1);
    const call: PlayerAction = { kind: 'bond', op: { op: 'herFavor', id: wife.id, kind: 'priest', houseId: p.houseId } };
    const pv = previewAction(s, call);
    expect(pv.disabledReason).toBeUndefined();
    expect(pv.effects.some((e) => e.type === 'heat')).toBe(true);
    settleOrderNow(newCtx(s), call, true);
    expect(s.matchmakers!.circle[wife.id].favors.some((f) => f.houseId === p.houseId)).toBe(false);
    expect(s.matchmakers!.circle[wife.id].called).toBe(1);
  });

  it('at 40+ her word counts in the succession for her own children', () => {
    const { s, wife } = withProposal('mm-court');
    const kid = son(s, 30);
    expect(courtWord(s, kid.id)).toBe(0);
    s.matchmakers!.circle[wife.id].standing = 64;
    expect(courtWord(s, kid.id)).toBeGreaterThan(0);
  });

  it('a year on, the mom knows best: her unvetoed match turned out well', () => {
    const { s, wife, kid, p } = withProposal('mm-year');
    settleOrderNow(newCtx(s), ans(wife.id, 'bless'), true);
    expect(kid.spouseId).toBe(p.spouseId);
    s.week += 53;
    const ev = momKnowsBestSource(s)!;
    expect(ev.defId).toBe('mom_knows_best');
    expect(ev.title).toBe('The mom knows best');
    expect(ev.choices.map((c) => c.id)).toEqual(['right', 'quiet']);
    const st0 = s.matchmakers!.circle[wife.id].standing;
    const ctx = newCtx(s);
    applyMatchOp(ctx, { op: 'knewBest', id: wife.id, good: true });
    expect(s.matchmakers!.circle[wife.id].standing).toBeGreaterThan(st0);
    expect(momKnowsBestSource(s)).toBeUndefined();
  });

  it('upgradeSave fills a partial matchmakers state without touching others', () => {
    const s = newGame('mm-up');
    (s as unknown as { matchmakers: unknown }).matchmakers = { v: 1, circle: {} };
    const s2 = upgradeSave(s);
    expect(s2.matchmakers!.made).toEqual([]);
    expect(s2.matchmakers!.rest).toEqual({});
    ensureMatchmakers(s2);
    expect(matchOdds).toBeTypeOf('function');
  });
});

describe('the screens', () => {
  it('the Marriages screen shows her match with its four answers, and her circle; her sheet shows her standing', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { MarriagePanel } = await import('../src/ui/family/MarriagePanel');
    const { CharacterSheet } = await import('../src/ui/components/CharacterSheet');
    const { s, wife, p } = withProposal('mm-ui');
    const html = renderToString(createElement(MarriagePanel, { s }));
    expect(html).toContain('data-testid="matchmakers"');
    expect(html).toContain('data-testid="her-match"');
    expect(html).toContain('data-testid="her-reasons"');
    expect(html).toContain('data-testid="her-circle"');
    expect(html).toContain('Bless');
    settleOrderNow(newCtx(s), ans(wife.id, 'bless'), true);
    const sheet = renderToString(createElement(CharacterSheet, { s, id: wife.id, onClose: () => {} }));
    expect(sheet).toContain('data-testid="her-standing"');
    void p;
  });
});
