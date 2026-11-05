import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { crew } from '../src/engine/characters';
import { upgradeSave } from '../src/engine/upgradeSave';
import { allocatePoint, bossSkillValue, bskOf, ensureBsk, practice, practiceDeed, PT_XP, SKILL_PERKS } from '../src/engine/bossSkills';
import { derivedSkill, NEW_SKILLS, newSkillOfDeed, skillValue } from '../src/engine/newSkillsCore';
import {
  bribeSkillPct, charmReasons, copsFoil, fedCaseMult, fitParts, padCostPct, perksHeld, pinchChance, politicsReasons, ratNose, showbizReasons, smoothMult, streetOddsBonus, TakeTally, takePct,
} from '../src/engine/newSkills';
import { grantXp, manInvested, manPracticeOf, MAN_NS_XP, spendPoint } from '../src/engine/crewXp';
import { fitOf, ownScoreOdds, previewOwnScore } from '../src/engine/eat';
import { foilOdds, type Threat } from '../src/engine/threats';
import { addFedEvidence } from '../src/engine/fedsState';
import { herDecision } from '../src/engine/dating';
import { perkMod } from '../src/engine/lifestyle';
import type { Business, Character, GameState } from '../src/engine/types';

/** The boss with points to put in. */
function withPoints(s: GameState, n: number): GameState {
  const b = ensureBsk(s);
  b.p = n;
  return s;
}
function invest(s: GameState, k: Parameters<typeof allocatePoint>[1], n: number): GameState {
  let t = withPoints(s, n);
  for (let i = 0; i < n; i++) t = allocatePoint(t, k);
  return t;
}
function soldier(s: GameState): Character {
  return crew(s).find((c) => c.rank === 'soldier' || c.rank === 'associate')!;
}
const biz = (s: GameState, kind: Business['kind']): Business => ({ id: `b-${kind}`, name: `The ${kind}`, kind, districtId: s.districts[0].id, owner: 'player', weeklyBase: 1000, upkeep: 0, heat: 0, category: 'racket' });

describe('derived defaults: old saves and fresh games store nothing', () => {
  it('a fresh game has no sk on anyone, and a load changes nothing', () => {
    const s = newGame('ns-fresh');
    expect(Object.values(s.characters).some((c) => c.sk)).toBe(false);
    const raw = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw)))).toBe(raw);
  });

  it('every man has all five, read off what he is; traits and crafts lean them', () => {
    const s = newGame('ns-derive');
    for (const c of Object.values(s.characters).slice(0, 40)) for (const k of NEW_SKILLS) {
      const v = skillValue(c, k);
      expect(v).toBe(derivedSkill(c, k));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    const c = { ...soldier(s), traits: [], craft: undefined } as Character;
    expect(derivedSkill({ ...c, traits: ['Gambler'] }, 'gambling')).toBeGreaterThan(derivedSkill(c, 'gambling'));
    expect(derivedSkill({ ...c, craft: 'bookmaker' }, 'gambling')).toBeGreaterThan(derivedSkill(c, 'gambling'));
    expect(derivedSkill({ ...c, traits: ['Charming'] }, 'charm')).toBeGreaterThan(derivedSkill(c, 'charm'));
    expect(derivedSkill({ ...c, outside: 'politician' }, 'politics')).toBeGreaterThan(derivedSkill(c, 'politics'));
    expect(derivedSkill({ ...c, craft: 'burglar' }, 'streetwise')).toBeGreaterThan(derivedSkill(c, 'streetwise'));
    expect(derivedSkill({ ...c, craft: 'talker' }, 'showbiz')).toBeGreaterThan(derivedSkill(c, 'showbiz'));
    // What he added rides on top.
    expect(skillValue({ ...c, sk: { charm: 7 } }, 'charm')).toBe(Math.min(100, derivedSkill(c, 'charm') + 7));
  });
});

describe('practice: deeds teach the skill their words touch', () => {
  it('routes each kind of deed', () => {
    expect(newSkillOfDeed('date Ask Rosa out to dinner')).toBe('charm');
    expect(newSkillOfDeed('mymen Send Vinnie out to find a score')).toBe('streetwise');
    expect(newSkillOfDeed('interact Bribe the judge')).toBe('politics');
    expect(newSkillOfDeed('Put a cop on the pad')).toBe('politics');
    expect(newSkillOfDeed('showbiz Book the act at the supper club')).toBe('showbiz');
    expect(newSkillOfDeed('Open a card game in the back room')).toBe('gambling');
    expect(newSkillOfDeed('Buy into the numbers bank')).toBe('gambling');
    expect(newSkillOfDeed('Buy the laundromat')).toBeUndefined();
  });

  it('the boss practices a new skill beside the old one; practice becomes points', () => {
    const s = newGame('ns-practice');
    practiceDeed(s, 'Ask Rosa out to dinner');
    const b = bskOf(s)!;
    expect(b.px.charm).toBeGreaterThan(0);
    expect(b.px.diplomacy).toBeGreaterThan(0);
    const t = newGame('ns-practice2');
    practice(t, 'gambling', PT_XP, 'The book');
    expect(bskOf(t)!.p).toBeGreaterThanOrEqual(0);
    expect(bskOf(t)!.px.gambling).toBeGreaterThan(0);
  });

  it('a man practices from his XP reasons: every 30 is +1', () => {
    const s = newGame('ns-man-practice');
    const c = soldier(s);
    const v0 = skillValue(c, 'gambling');
    for (let w = 0; w < 6; w++) { s.week += 1; grantXp(s, c.id, 10, 'Ran the card game in the back'); }
    const pr = manPracticeOf(s, c.id, 'gambling');
    expect(pr.total).toBeGreaterThanOrEqual(MAN_NS_XP);
    expect(skillValue(s.characters[c.id], 'gambling')).toBeGreaterThan(v0);
  });
});

describe('points and perks', () => {
  it('the boss puts points into a new skill: +1 each, perks at 3/6/10, written to Your File', () => {
    const s = newGame('ns-points');
    const v0 = bossSkillValue(s, 'charm');
    const t = invest(s, 'charm', 3);
    expect(bossSkillValue(t, 'charm')).toBe(Math.min(100, v0 + 3));
    expect(t.characters[t.playerId].attributes).toEqual(s.characters[s.playerId].attributes);
    expect(bskOf(t)!.inv.charm).toBe(3);
    expect(perkMod(t, 'firstImp')).toBe(5);
    expect(perksHeld(t, t.playerId, 'charm')).toBe(1);
    expect((t.journal?.e ?? []).map((e) => e.t)).toContain('You learned First Impressions');
    expect(s.characters[s.playerId].sk).toBeUndefined(); // pure
    for (const k of NEW_SKILLS) expect(SKILL_PERKS[k].map((p) => p.at)).toEqual([3, 6, 10]);
  });

  it('a man\'s level points go into a new skill (+2) and open its tree', () => {
    const s = newGame('ns-man-points');
    const c = soldier(s);
    s.xp = s.xp ?? { v: 1, men: {}, feed: [], stats: { awards: 0, xp: 0, levels: 0, perks: 0, auto: 0, envy: 0, poached: 0, slights: 0 } };
    s.xp.men[c.id] = { xp: 999, lvl: 6 };
    const v0 = skillValue(c, 'streetwise');
    let t = s;
    for (let i = 0; i < 3; i++) t = spendPoint(t, c.id, 'streetwise');
    expect(skillValue(t.characters[c.id], 'streetwise')).toBe(Math.min(100, v0 + 6));
    expect(manInvested(t, c.id, 'streetwise')).toBe(3);
    expect(perksHeld(t, c.id, 'streetwise')).toBe(1);
    expect(s.characters[c.id].sk).toBeUndefined(); // pure
  });
});

describe('each skill lands at its point of use', () => {
  it('Charm: her answer, the perk, what the wife hears', () => {
    const s = newGame('ns-charm');
    const her = Object.values(s.characters).find((c) => c.alive && c.gender === 'F' && c.id !== s.characters[s.playerId].spouseId && herDecision(s, c, 'talk').chance > 0.1 && herDecision(s, c, 'talk').chance < 0.9)!;
    const before = herDecision(s, her, 'talk').chance;
    s.characters[s.playerId] = { ...s.characters[s.playerId], sk: { charm: 40 } };
    const after = herDecision(s, her, 'talk');
    expect(after.chance).toBeGreaterThan(before);
    expect(after.reasons.some((r) => r.label.startsWith('Your charm'))).toBe(true);
    const t = invest(newGame('ns-charm2'), 'charm', 10);
    expect(charmReasons(t, 'askOut').map((r) => r.label)).toEqual(expect.arrayContaining(['First Impressions', 'Leading Man']));
    expect(smoothMult(t)).toBeLessThan(smoothMult(newGame('ns-charm2')));
  });

  it('Streetwise: a man\'s own score, his pinch, the cops, the mole', () => {
    const s = newGame('ns-street');
    const c = soldier(s);
    const o0 = ownScoreOdds(s, c).chance;
    const p0 = pinchChance(s, c);
    s.characters[c.id] = { ...c, sk: { streetwise: 40 } };
    const c1 = s.characters[c.id];
    expect(ownScoreOdds(s, c1).chance).toBeGreaterThan(o0);
    expect(pinchChance(s, c1)).toBeLessThan(p0);
    expect(previewOwnScore(s, c.id).odds!.reasons.some((r) => r.label.includes('streetwise'))).toBe(true);
    const t = invest(newGame('ns-street2'), 'streetwise', 10);
    expect(copsFoil(t)).toBeGreaterThan(copsFoil(newGame('ns-street2')));
    expect(ratNose(t)).toBeGreaterThanOrEqual(0.15);
    expect(streetOddsBonus(t)).toBe(0.04);
    const raid: Threat = { id: 'th1', kind: 'raid', by: 'police', start: 1, due: 2, blunt: 0 } as Threat;
    expect(foilOdds(t, raid)).toBeGreaterThan(foilOdds(newGame('ns-street2'), raid));
  });

  it('Politics: bribes and the pad cost less, officials say yes, the case builds slower', () => {
    const s0 = newGame('ns-pol');
    const t = invest(newGame('ns-pol'), 'politics', 10);
    expect(padCostPct(t)).toBeGreaterThan(padCostPct(s0));
    expect(perkMod(t, 'bribe')).toBeGreaterThanOrEqual(5);
    expect(politicsReasons(t).some((r) => r.label === 'The Fix Is In')).toBe(true);
    expect(fedCaseMult(t)).toBeLessThan(fedCaseMult(s0));
    const a = addFedEvidence(s0, s0.playerId, 10, 'test');
    const b = addFedEvidence(t, t.playerId, 10, 'test');
    expect(b).toBeLessThan(a);
    t.characters[t.playerId] = { ...t.characters[t.playerId], sk: { politics: 60 } };
    expect(bribeSkillPct(t)).toBeGreaterThan(0);
    expect(politicsReasons(t).some((r) => r.label.startsWith('Knows how City Hall works'))).toBe(true);
  });

  it('Showbiz: signings and bookings, and the clubs\' take', () => {
    const s0 = newGame('ns-show');
    const t = invest(newGame('ns-show'), 'showbiz', 10);
    expect(showbizReasons(t).some((r) => r.label.includes('perks'))).toBe(true);
    const club = biz(t, 'club');
    expect(takePct(t, club)).toBeGreaterThan(takePct(s0, club));
    expect(takePct(t, biz(t, 'laundromat'))).toBe(0);
  });

  it('Gambling: the games\' take, and a losing week at the book', () => {
    const s0 = newGame('ns-gam');
    const t = invest(newGame('ns-gam'), 'gambling', 10);
    const b = biz(t, 'numbers');
    expect(takePct(t, b)).toBeGreaterThan(takePct(s0, b));
    const tally = new TakeTally();
    expect(tally.add(t, b, 1000)).toBeGreaterThan(new TakeTally().add(s0, b, 1000));
    expect(tally.add(t, biz(t, 'bookmaking'), -900)).toBe(297);
    expect(tally.sum.gambling.n).toBe(2);
  });

  it('a man\'s new skill counts toward his fit for the jobs that want it', () => {
    const s = newGame('ns-fit');
    const c = soldier(s);
    const need = { crafts: [], attrs: ['business' as const], sk: ['gambling' as const] };
    const f0 = fitOf(s, c, need).score;
    s.characters[c.id] = { ...c, sk: { gambling: 50 } };
    const f1 = fitOf(s, s.characters[c.id], need);
    expect(f1.score).toBeGreaterThan(f0);
    expect(f1.parts.some((p) => p.label.startsWith('His gambling'))).toBe(true);
    expect(fitParts(s, s.characters[c.id], undefined)).toEqual([]);
  });
});

describe('the screens', () => {
  it('the boss\'s Skills tab and a man\'s sheet show the five', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { CharacterSheet } = await import('../src/ui/components/CharacterSheet');
    const s = withPoints(newGame('ns-ui'), 2);
    const mine = renderToString(createElement(CharacterSheet, { s, id: s.playerId, onClose: () => {}, initialTab: 'skills' }));
    expect(mine).toContain('data-testid="bsk-new"');
    for (const k of NEW_SKILLS) expect(mine).toContain(`data-testid="bsk-put-${k}"`);
    const c = soldier(s);
    s.xp = s.xp ?? { v: 1, men: {}, feed: [], stats: { awards: 0, xp: 0, levels: 0, perks: 0, auto: 0, envy: 0, poached: 0, slights: 0 } };
    s.xp.men[c.id] = { xp: 200, lvl: 4 };
    const his = renderToString(createElement(CharacterSheet, { s, id: c.id, onClose: () => {}, initialTab: 'skills' }));
    expect(his).toContain('data-testid="ns-man"');
    expect(his).toContain('data-testid="ns-put-streetwise"');
    expect(his).toContain('data-testid="xp-point-gambling"');
  });
});
