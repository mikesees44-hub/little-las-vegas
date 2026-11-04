import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { player } from '../src/engine/characters';
import { setDatingSettings } from '../src/engine/datingState';
import { eveningCost, previewInvite } from '../src/engine/evening';
import { fleeDrain } from '../src/engine/fugitive';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { herTargets, nightPlans, pocketGroups, pocketOwned, pocketShelves, pocketGiven, POCKET_GROUPS } from '../src/engine/pocketShop';
import { startRomance } from '../src/engine/romance';
import { giftBlock, giftTargets, spendBlock, spendOwned } from '../src/engine/spend';
import { SPEND_BY_ID } from '../src/engine/spendData';
import { ownsFloridaPlace } from '../src/engine/spendState';
import { quoteTrip, suggestPlan } from '../src/engine/travel';
import { FLEE_DESTS } from '../src/engine/travelDests';
import type { Character, GameState, PlayerAction } from '../src/engine/types';

const buy = (item: string, extra: Record<string, unknown> = {}): PlayerAction => ({ kind: 'spend', op: { op: 'buy', item, ...extra }, fund: 'family' } as PlayerAction);

function rich(seed: string): GameState {
  const s = newGame(seed);
  s.money = 600000;
  s.tribute!.acct.personal = 400000;
  return s;
}

/** A wife (if the seed gave him none) and a woman he is seeing, both adults. */
function withLover(s: GameState): { wife: Character; lover: Character } {
  const B = player(s);
  const women = Object.values(s.characters).filter((c) => c.alive && c.gender === 'F' && !c.dynasty && c.id !== B.spouseId && c.faction !== 'player' && !c.spouseId && s.date.y - c.birth.y >= 21 && s.date.y - c.birth.y <= 40);
  let wife = B.spouseId ? s.characters[B.spouseId] : undefined;
  if (!wife?.alive) { wife = women.shift()!; B.spouseId = wife.id; wife.spouseId = B.id; }
  const lover = women.find((c) => c.id !== wife!.id)!;
  lover.traits = [];
  startRomance(s, B.id, lover.id);
  return { wife, lover };
}

describe('Your Pocket: the shop', () => {
  it('groups the owner\'s list out of the one catalog: homes (and Florida), cars, him, her, nights, her apartment', () => {
    const s = rich('pk-shelves');
    expect(POCKET_GROUPS.map((g) => g.id)).toEqual(['homes', 'cars', 'him', 'her', 'nights', 'goomar']);
    const flat = (g: Parameters<typeof pocketShelves>[1]) => pocketShelves(s, g).flatMap((x) => x.items.map((i) => i.id));
    expect(flat('homes')).toEqual(expect.arrayContaining(['st_cresthouse', 'sp_stoneharbor', 'st_miamicondo', 'sp_bayharbor']));
    expect(flat('cars')).toEqual(expect.arrayContaining(['sp_eldorado', 'st_belair']));
    expect(flat('him')).toEqual(expect.arrayContaining(['sp_rolex', 'sp_cufflinks', 'sp_suit', 'sp_pinky']));
    expect(flat('her')).toEqual(expect.arrayContaining(['sp_mink', 'st_diamondnecklace', 'sp_earrings_g']));
    expect(flat('nights')).toEqual(expect.arrayContaining(['sp_500club', 'st_dinner_bookbinders']));
    expect(flat('goomar')).toEqual(['st_goomar_flat']);
    // Every item is a real catalog item paid from the pocket (no second store).
    for (const g of POCKET_GROUPS) for (const it of pocketShelves(s, g.id).flatMap((x) => x.items)) {
      expect(SPEND_BY_ID[it.id], it.id).toBe(it);
      expect(it.pot, it.id).toBe('pocket');
    }
    // The new things are period, priced in 1960 dollars, with upkeep.
    expect(SPEND_BY_ID.st_miamicondo.price).toBeGreaterThan(5000);
    expect(SPEND_BY_ID.st_miamicondo.up).toBeGreaterThan(0);
    expect(SPEND_BY_ID.st_miamicondo.unl).toContain('florida');
  });

  it('Mature content Off hides the room for the night and the mistress\'s things', () => {
    let s = rich('pk-mature');
    const { lover } = withLover(s);
    expect(pocketGroups(s).map((g) => g.id)).toContain('goomar');
    expect(nightPlans(s, lover.id).map((p) => p.key)).toEqual(['motel', 'suite', 'town']);
    s = setDatingSettings(s, { mature: 'off' });
    expect(pocketGroups(s).map((g) => g.id)).not.toContain('goomar');
    expect(nightPlans(s, lover.id).map((p) => p.key)).toEqual(['town']);
    expect(pocketShelves(s, 'her').flatMap((x) => x.items).some((it) => it.gift === 'goomar')).toBe(false);
    expect(spendBlock(s, SPEND_BY_ID.st_goomar_flat)).toMatch(/Mature/);
  });

  it('a Rolex: the price from the pocket, respect, the IRS counts; then it is his, on the list of what he owns', () => {
    let s = rich('pk-rolex');
    const p = previewAction(s, buy('sp_rolex'));
    expect(p.disabledReason).toBeUndefined();
    expect(p.effects.some((e) => e.type === 'money' && (e as { pot?: string }).pot === 'pocket')).toBe(true);
    expect(p.effects.some((e) => e.type === 'respect')).toBe(true);
    const r = advanceWeek(s, { actions: [buy('sp_rolex')] });
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
    expect(pocketOwned(s).some((o) => o.id === 'sp_rolex')).toBe(true);
    // A Cadillac on a laborer's books: the IRS takes note (federal heat in the preview).
    s.heat.federal = 40;
    const cad = previewAction(s, buy('sp_eldorado'));
    expect(cad.effects.some((e) => e.type === 'heat' && (e as { bar: string }).bar === 'federal')).toBe(true);
  });

  it('for her: a present for the woman he is seeing lands with her, is hers, and can reach his wife', () => {
    let s = rich('pk-her');
    const { wife, lover } = withLover(s);
    const ts = herTargets(s);
    expect(ts.find((t) => t.id === wife.id)?.kind).toBe('wife');
    expect(ts.find((t) => t.id === lover.id)?.kind).toBe('lover');
    const a = buy('sp_bracelet', { to: lover.id });
    const p = previewAction(s, a);
    expect(p.disabledReason).toBeUndefined();
    expect(p.effects.some((e) => e.type === 'opinion' && e.from === lover.id && e.amount > 0)).toBe(true);
    expect(p.effects.some((e) => e.type === 'opinion' && e.from === wife.id)).toBe(false);
    expect(JSON.stringify(p.effects)).toMatch(/your wife finds out/);
    // The same bracelet for his wife carries no such risk.
    expect(JSON.stringify(previewAction(s, buy('sp_bracelet', { to: wife.id })).effects)).not.toMatch(/your wife finds out/);
    s = advanceWeek(s, { actions: [a] }).state;
    const o = spendOwned(s).find((x) => x.id === 'sp_bracelet')!;
    expect(o.holder).toBe(lover.id);
    // It is hers: he can't sell it.
    expect(previewAction(s, { kind: 'spend', op: { op: 'sell', uid: o.uid }, fund: 'family' } as PlayerAction).disabledReason).toMatch(/not yours/);
    // A daughter never gets the romantic stones.
    const d = giftTargets(s).find((t) => t.kind === 'daughter');
    if (d) expect(giftBlock(s, SPEND_BY_ID.st_diamondnecklace, d)).toBeDefined();
  });

  it('re-gifting: his own watch to somebody else is theirs, off his list, and he can buy another', () => {
    let s = rich('pk-give');
    const { lover } = withLover(s);
    s = advanceWeek(s, { actions: [buy('st_submariner')] }).state;
    const o = spendOwned(s).find((x) => x.id === 'st_submariner')!;
    expect(spendBlock(s, SPEND_BY_ID.st_submariner)).toMatch(/already/);
    const give: PlayerAction = { kind: 'spend', op: { op: 'give', uid: o.uid, to: lover.id }, fund: 'family' } as PlayerAction;
    const p = previewAction(s, give);
    expect(p.disabledReason).toBeUndefined();
    expect(p.effects.some((e) => e.type === 'opinion' && e.from === lover.id && e.amount > 0)).toBe(true);
    s = advanceWeek(s, { actions: [give] }).state;
    expect(spendOwned(s).some((x) => x.uid === o.uid)).toBe(false);
    expect(pocketGiven(s)[0].name).toMatch(/Submariner/);
    expect(spendBlock(s, SPEND_BY_ID.st_submariner)).toBeUndefined();
  });

  it('the Florida condo: a trip there needs no hotel, and lying low there costs half', () => {
    let s = rich('pk-florida');
    const plan = suggestPlan(s, s.playerId, 'miamibeach');
    plan.guests = [];
    const before = quoteTrip(s, plan);
    const drainBefore = fleeDrain(s, 'florida', s.playerId);
    expect(drainBefore).toBe(FLEE_DESTS.florida.drain);
    s = advanceWeek(s, { actions: [buy('st_miamicondo')] }).state;
    expect(ownsFloridaPlace(s)).toBe(true);
    const plan2 = { ...plan, departIn: Math.max(0, (plan.departIn ?? 0) - 1) };
    const after = quoteTrip(s, plan2);
    expect(after.lines.some((l) => /Your own place in Florida/.test(l.label))).toBe(true);
    expect(after.cost).toBeLessThan(before.cost);
    expect(fleeDrain(s, 'florida', s.playerId)).toBe(Math.round(FLEE_DESTS.florida.drain / 2));
    // Upkeep runs from the pocket every week.
    expect(pocketOwned(s).find((x) => x.id === 'st_miamicondo')!.upkeep).toBeGreaterThan(0);
  });

  it('a room for the night: the evening flow, her decision, a motel price, fade to morning', () => {
    const s = rich('pk-motel');
    const { lover } = withLover(s);
    const motel = nightPlans(s, lover.id).find((p) => p.key === 'motel')!;
    expect(eveningCost(s, motel.plan).lines.join(' ')).toMatch(/motel room/);
    const p = previewInvite(s, motel.plan);
    expect(p.title).toMatch(/A room for the night/);
    expect(p.acceptance).toBeDefined();
    expect(p.warning).toMatch(/night clerk/);
  });
});
