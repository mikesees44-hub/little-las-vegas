import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { capos, crew, makeCharacter } from '../src/engine/characters';
import { upgradeSave } from '../src/engine/upgradeSave';
import { addOpinion, opinion } from '../src/engine/relations';
import { answerOffer } from '../src/engine/godfatherAct';
import { baptismChoices, branchOdds, godchildrenOf, openOffer, openOffers, weddingChoices } from '../src/engine/godfather';
import { allocatePoint, allocBlock, bskOf, focusSkill, practice, PT_XP, setSkillFocus, skillMod, skillOfDeed } from '../src/engine/bossSkills';
import { perkMod } from '../src/engine/lifestyle';
import { floaterText, loyaltyTrend } from '../src/engine/loyalty';
import { crewStandings, crewWord, standingLevel, yourMenByCapo } from '../src/engine/crewStanding';
import { dayEntries } from '../src/engine/planner/datebook';
import type { Character, EventInstance, GameState, RivalId } from '../src/engine/types';

const weeks = (s: GameState, n: number) => { for (let i = 0; i < n && !s.gameOver; i++) s = advanceWeek(s, {}).state; return s; };
const fileTitles = (s: GameState) => (s.journal?.e ?? []).map((e) => e.t);

function man(s: GameState): Character {
  return capos(s)[0] ?? crew(s)[0];
}

function offer(s: GameState, c: Character, k: 'w' | 'b', fr?: RivalId): EventInstance {
  const iid = `ev${s.nextId++}`;
  const ev: EventInstance = k === 'w'
    ? { iid, defId: 'gf_wedding', week: s.week, mandatory: false, priority: 44, title: 'Rosa\'s wedding', text: 'A wedding.', choices: weddingChoices(s, c, 'Rosa', fr), defaultChoiceId: 'stay', meta: { charId: c.id, gf: 'w', nm: 'Rosa', sex: 0 }, actors: [c.id] }
    : { iid, defId: 'gf_baptism', week: s.week, mandatory: false, priority: 44, title: 'A christening: Paulie', text: 'A baby.', choices: baptismChoices(s, c, 'Paulie', 1, fr), defaultChoiceId: 'gift', meta: { charId: c.id, gf: 'b', nm: 'Paulie', sex: 1 }, actors: [c.id] };
  s.pendingEvents.push(ev);
  return ev;
}

describe('new state stays optional', () => {
  it('a fresh game has no godfather or skills state, and loading changes nothing', () => {
    const s = newGame('gf-fresh');
    expect(s.gf).toBeUndefined();
    expect(s.bsk).toBeUndefined();
    expect(s.loyal).toBeUndefined(); // the opinions dealt at the start are not news
    const raw = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw)))).toBe(raw);
    const played = weeks(s, 3);
    const raw2 = JSON.stringify(played);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw2)))).toBe(raw2);
  });
});

describe('pay for the wedding, stand godfather', () => {
  it('paying for the whole wedding costs money, buys loyalty and a favor, and lands in Your File', () => {
    const s = newGame('gf-pay');
    s.money = 50000;
    const c = man(s);
    const ev = offer(s, c, 'w');
    expect(openOffer(s, c.id)?.iid).toBe(ev.iid);
    expect(openOffers(s).length).toBe(1);
    const before = opinion(s, c.id, s.playerId);
    const t = answerOffer(s, ev.iid, 'payall');
    expect(t).not.toBe(s);
    expect(t.money).toBe(s.money - 1500);
    expect(opinion(t, c.id, t.playerId)).toBeGreaterThan(before);
    expect(t.gf?.st.paid).toBe(1);
    expect(t.pendingEvents.some((e) => e.iid === ev.iid)).toBe(false);
    expect(fileTitles(t).some((x) => x.includes('Pay for the whole wedding'))).toBe(true);
    // The loyalty that moved is noted: a reason, a trend, a floater.
    const tr = loyaltyTrend(t, c.id);
    expect(tr.why[0]?.y).toMatch(/wedding/i);
    expect(tr.arrow).toBe('▲');
    const f = t.loyal!.f[t.loyal!.f.length - 1];
    expect(floaterText(t, f)).toMatch(new RegExp(`^\\+\\d+ ${c.firstName} \\(`));
    // The input is untouched (pure).
    expect(s.gf).toBeUndefined();
  });

  it('every option stays; another family\'s wedding shows its odds and rolls respect or insult', () => {
    const s = newGame('gf-rival');
    s.money = 50000;
    const rv = s.rivals.find((r) => r.kind === 'mob')!;
    const k = makeCharacter(s, { gender: 'M', age: 52, rank: 'capo', faction: rv.id, nickname: false });
    const chs = weddingChoices(s, k, 'Rosa', rv.id as RivalId);
    expect(chs.map((c) => c.id)).toEqual(['payall', 'envelope', 'attend', 'stay']);
    const p = branchOdds(s, rv.id as RivalId, k.id);
    expect(chs[0].label).toContain(`${Math.round(p * 100)}%`);
    const ev = offer(s, k, 'w', rv.id as RivalId);
    const t = answerOffer(s, ev.iid, 'payall');
    expect((t.gf?.st.branch ?? 0) + (t.gf?.st.insult ?? 0)).toBe(1);
    expect(fileTitles(t).some((x) => /took it as (respect|an insult)/.test(x))).toBe(true);
  });

  it('standing godfather makes a godchild for life; declining is still there', () => {
    const s = newGame('gf-god');
    s.money = 50000;
    const c = man(s);
    const ev = offer(s, c, 'b');
    expect(ev.choices.map((x) => x.id)).toEqual(['god', 'gift', 'decline']);
    const t = answerOffer(s, ev.iid, 'god');
    expect(godchildrenOf(t, c.id).map((g) => g[1])).toEqual(['Paulie']);
    expect(t.gf?.st.god).toBe(1);
    expect(t.deeds ? JSON.stringify(t.deeds).includes('godfather') : true).toBe(true);
  });

  it('the datebook shows the week\'s wedding on Saturday', () => {
    const s = newGame('gf-book');
    const c = man(s);
    offer(s, c, 'w');
    const sat = dayEntries(s, s.week, 5);
    expect(sat.some((e) => e.title === 'Rosa\'s wedding' && e.who === c.id)).toBe(true);
  });

  it('offers come up over a season of play, and saves stay compact', () => {
    let s = newGame('gf-season');
    s.money = 200000;
    let seen = 0;
    for (let i = 0; i < 30 && !s.gameOver; i++) {
      s = advanceWeek(s, {}).state;
      if (s.pendingEvents.some((e) => e.defId === 'gf_wedding' || e.defId === 'gf_baptism')) seen++;
    }
    expect(seen).toBeGreaterThan(0);
    expect(JSON.stringify(s.loyal ?? {}).length).toBeLessThan(20000);
    expect(JSON.stringify(s.bsk ?? {}).length).toBeLessThan(2000);
  });
});

describe('boss skills', () => {
  it('practice becomes points; a point is +1 and opens perks at 3', () => {
    let s = newGame('bsk-points');
    expect(allocBlock(s, 'diplomacy')).toBeDefined();
    for (let i = 0; i < 4; i++) { s = { ...s, week: s.week + i + 1 }; practice(s, 'diplomacy', 24, 'Sat down with a man'); }
    const b = bskOf(s)!;
    expect(b.p).toBe(Math.floor(96 / PT_XP));
    const v0 = s.characters[s.playerId].attributes.diplomacy;
    let t = s;
    for (let i = 0; i < 3; i++) t = allocatePoint(t, 'diplomacy');
    expect(t.characters[t.playerId].attributes.diplomacy).toBe(Math.min(100, v0 + 3));
    expect(bskOf(t)!.inv.diplomacy).toBe(3);
    expect(skillMod(t, 'accept')).toBe(2);
    expect(perkMod(t, 'accept')).toBeGreaterThanOrEqual(2);
    expect(fileTitles(t)).toContain('You learned A Good Listener');
    expect(bskOf(s)!.p).toBe(b.p); // pure
  });

  it('a focus doubles practice; the week caps it', () => {
    let s = newGame('bsk-focus');
    s = setSkillFocus(s, 'force');
    expect(focusSkill(s)).toBe('force');
    expect(practice(s, 'force', 5, 'A lesson')).toBe(10);
    expect(practice(s, 'business', 5, 'A deal')).toBe(5);
    expect(practice(s, 'business', 50, 'A big deal')).toBe(24 - 15);
  });

  it('deeds teach the skill their words are about', () => {
    expect(skillOfDeed('Order a hit on the bookmaker')).toBe('force');
    expect(skillOfDeed('Pay for the whole wedding')).toBe('diplomacy');
    expect(skillOfDeed('Buy the laundromat')).toBe('business');
  });
});

describe('crews at a glance', () => {
  it('every crew has a word, a meter and reasons; your men are grouped by capo', () => {
    const s = weeks(newGame('crews'), 2);
    const xs = crewStandings(s);
    expect(xs.some((x) => x.kind === 'yours')).toBe(true);
    expect(xs.some((x) => x.kind === 'family')).toBe(true);
    for (const x of xs) {
      expect(['tight', 'friendly', 'neutral', 'cold', 'war']).toContain(x.level);
      expect(x.why.length).toBeGreaterThan(0);
    }
    expect(standingLevel(50)).toBe('tight');
    expect(standingLevel(-40)).toBe('cold');
    expect(standingLevel(80, true)).toBe('war');
    const groups = yourMenByCapo(s);
    const placed = groups.flatMap((g) => [...(g.capo ? [g.capo.id] : []), ...g.men.map((m) => m.id)]);
    expect(new Set(placed).size).toBe(crew(s).length);
    const k = capos(s)[0];
    if (k) expect(crewWord(s, k)).toContain(`${k.firstName}'s crew`);
  });

  it('a crew\'s trend follows what you did for its capo', () => {
    const s = newGame('crews-trend');
    const k = capos(s)[0]!;
    addOpinion(s, k.id, s.playerId, 'You backed him', 8, 1);
    const x = crewStandings(s).find((c) => c.key === `capo:${k.id}`)!;
    expect(x.arrow).toBe('▲');
    expect(x.why.some((w) => w.includes('You backed him'))).toBe(true);
  });
});

describe('the screens', () => {
  it('the boss\'s Skills tab, the offer on a sheet, and the crew strip render', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { CharacterSheet } = await import('../src/ui/components/CharacterSheet');
    const { CrewStrip, MenByCapo } = await import('../src/ui/components/Loyalty');
    const s = weeks(newGame('gf-ui'), 2);
    s.money = 50000;
    practice(s, 'business', 24, 'Bought a place');
    practice(s, 'business', 10, 'Bought a place');
    const mine = renderToString(createElement(CharacterSheet, { s, id: s.playerId, onClose: () => {}, initialTab: 'skills' }));
    expect(mine).toContain('data-testid="boss-skills"');
    expect(mine).toContain('data-testid="bsk-put-business"');
    const c = man(s);
    offer(s, c, 'w');
    const his = renderToString(createElement(CharacterSheet, { s, id: c.id, onClose: () => {} }));
    expect(his).toContain('data-testid="gf-offer"');
    expect(his).toContain('data-testid="gf-choice-payall"');
    expect(his).toContain('data-testid="crew-badge"');
    expect(his).toContain('data-testid="loyalty-meter"');
    expect(renderToString(createElement(CrewStrip, { s }))).toContain('data-testid="crew-standing"');
    expect(renderToString(createElement(MenByCapo, { s }))).toContain('data-testid="capo-group"');
  });
});
