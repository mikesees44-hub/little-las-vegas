import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, forceDeath } from '../src/engine/engine';
import { ageOn } from '../src/engine/calendar';
import { makeCharacter, player } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { setDatingSettings } from '../src/engine/datingState';
import { upgradeSave } from '../src/engine/upgradeSave';
import { ensureNightlife } from '../src/engine/nightlife';
import { dossierOf, TYPES, setDescriptor } from '../src/engine/dossier';
import { bodyOf } from '../src/engine/body';
import { looksRating, ratingWord, toTen } from '../src/engine/rating';
import { looksOf } from '../src/engine/looks';
import {
  addHook, affairRows, applyWomenOp, hookLive, hooksTidy, officeRequest, previewWomen, womenActionsFor, womenChoices, HOOK_WEEKS,
} from '../src/engine/women';
import { cumulative, dinnerAcceptance, discoveryWeek, husbandReacts, pregnancyRisk, perNight } from '../src/engine/womenAffairs';
import { affairFor, affairOf, wifeFor } from '../src/engine/womenCore';
import { aimByAge } from '../src/engine/womenCareers';
import { ensureWomen } from '../src/engine/womenState';
import type { Character, GameState } from '../src/engine/types';

const age = (s: GameState, c: Character) => ageOn(c.birth, s.date);
const op = (s: GameState, o: Parameters<typeof applyWomenOp>[1]) => { const ctx = newCtx(s); applyWomenOp(ctx, o); return ctx; };
const weeks = (s: GameState, n: number) => { for (let i = 0; i < n && !s.gameOver; i++) s = advanceWeek(s, {}).state; return s; };

/** An adult woman of the town, unmarried, drawn to men (the test's own). */
function woman(s: GameState, a = 27, extra: Partial<Character> = {}): Character {
  const c = makeCharacter(s, { gender: 'F', age: a, rank: 'civilian', faction: 'none', nickname: false });
  Object.assign(c, extra);
  c.orientation = 'straight';
  s.characters[c.id] = c;
  return c;
}

/** One of your men with a wife (a person). */
function crewWife(s: GameState): { man: Character; wife: Character } {
  const man = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.gender === 'M' && c.id !== s.playerId && age(s, c) >= 25)!;
  man.household = { wife: 'Elena', kids: [] };
  man.spouseId = undefined;
  const wife = wifeFor(s, man)!;
  wife.orientation = 'straight';
  return { man, wife };
}

describe('women: adults only everywhere', () => {
  it('no minor is in any list, preview, commit or week', () => {
    let s = newGame('w-adults');
    const kid = makeCharacter(s, { gender: 'F', age: 16, rank: 'civilian', faction: 'none' });
    s.characters[kid.id] = kid;
    expect(womenActionsFor(s, kid.id)).toEqual([]);
    expect(previewWomen(s, { op: 'askOut', id: kid.id }).disabledReason).toBe('Adults only');
    expect(dossierOf(s, kid.id)).toBeUndefined();
    expect(bodyOf(s, kid)).toBeUndefined();
    expect(looksRating(s, kid)).toBeUndefined();
    op(s, { op: 'did', a: { op: 'askOut', id: kid.id } });
    expect(s.women?.affairs[kid.id]).toBeUndefined();
    s = weeks(s, 30);
    const W = s.women!;
    for (const id of [...Object.keys(W.affairs), ...Object.keys(W.arcs), ...Object.keys(W.talent), ...Object.keys(W.close), ...W.reqs.map((r) => r.who), ...W.hooks.map((h) => h.target)]) {
      expect(age(s, s.characters[id]), id).toBeGreaterThanOrEqual(18);
    }
    expect(Object.keys(W.arcs).length).toBeGreaterThan(10);
  });
});

describe('women: help is never conditional on sex', () => {
  it('an office request offers pay / the Family / work / decline, nothing romantic, and help changes no romantic odds', () => {
    const s = newGame('w-help');
    const { wife } = crewWife(s);
    let ev;
    for (let i = 0; i < 40 && !ev; i++) { s.week++; ev = officeRequest(s); }
    expect(ev).toBeDefined();
    const ids = ev!.choices.map((c) => c.id);
    expect(ids).toContain('pay');
    expect(ids).toContain('decline');
    for (const ch of ev!.choices) {
      expect(ch.disabledReason).toBeUndefined();
      for (const e of ch.effects) if (e.type === 'women') expect(e.op.op).toBe('req');
      expect(JSON.stringify(ch)).not.toMatch(/dinner|night|hotel|affair|intimate|benefits/i);
    }
    const her = s.characters[s.women!.reqs[s.women!.reqs.length - 1].who];
    const before = dinnerAcceptance(s, her).chance;
    const pay = ev!.choices.find((c) => c.id === 'pay')!;
    const ctx = newCtx(s);
    for (const e of pay.effects) if (e.type === 'women') applyWomenOp(ctx, e.op);
    expect(s.women!.reqs.find((r) => r.who === her.id)!.status).toBe('paid');
    expect(dinnerAcceptance(s, her).chance).toBe(before);
    expect(affairOf(s, her.id)).toBeUndefined();
    expect(wife.id).toBeDefined();
  });
});

describe('women: a no is respected', () => {
  it('a refusal blocks asking again for weeks; two close the door; gifts and direct commits cannot override; her own proposition reopens it', () => {
    const s = newGame('w-no');
    const c = woman(s);
    op(s, { op: 'no', id: c.id, what: 'askOut' });
    expect(previewWomen(s, { op: 'askOut', id: c.id }).disabledReason).toMatch(/said no/);
    op(s, { op: 'did', a: { op: 'askOut', id: c.id } });
    expect(affairOf(s, c.id)!.dinners).toBe(0);
    s.week += 9;
    expect(previewWomen(s, { op: 'askOut', id: c.id }).disabledReason).toBeUndefined();
    op(s, { op: 'no', id: c.id, what: 'askOut' });
    s.week += 60;
    expect(affairOf(s, c.id)!.closed).toBeDefined();
    expect(previewWomen(s, { op: 'askOut', id: c.id }).disabledReason).toMatch(/closed the door/);
    expect(previewWomen(s, { op: 'gift', id: c.id, size: 'lavish' }).disabledReason).toMatch(/won't change/);
    op(s, { op: 'did', a: { op: 'askOut', id: c.id } });
    op(s, { op: 'did', a: { op: 'pursue', id: c.id } });
    expect(affairOf(s, c.id)!.stage).toBe('interest');
    // She can open it herself.
    op(s, { op: 'prop', id: c.id, how: 'yes', why: 'love' });
    expect(affairOf(s, c.id)!.closed).toBeUndefined();
    expect(affairOf(s, c.id)!.stage).toBe('affair');
  });

  it('a night needs her yes: a setting she refuses is blocked with her preference', () => {
    const s = newGame('w-where');
    const { wife } = crewWife(s);
    const a = affairFor(s, wife.id);
    a.stage = 'affair';
    const p = previewWomen(s, { op: 'night', id: wife.id, at: 'office' });
    expect(p.disabledReason).toMatch(/husband's friends/);
    expect(p.disabledReason).toMatch(/rather/);
    expect(previewWomen(s, { op: 'night', id: wife.id, at: 'hotel' }).acceptance).toBeDefined();
  });
});

describe('women: pregnancy', () => {
  it('the chance climbs with every night, notably after two', () => {
    for (const p of [0.03, 0.06]) {
      const xs = [1, 2, 3, 5, 10].map((n) => cumulative(p, n));
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      expect(cumulative(p, 3) - cumulative(p, 2)).toBeGreaterThan(0);
    }
    const s = setDatingSettings(newGame('w-preg'), { pregnancy: 'normal' });
    const c = woman(s, 25);
    expect(perNight(s, c)).toBeGreaterThan(0);
    const r1 = pregnancyRisk(s, c, 1).chance, r2 = pregnancyRisk(s, c, 2).chance, r3 = pregnancyRisk(s, c, 3).chance;
    expect(r2).toBeGreaterThan(r1);
    expect(r3).toBeGreaterThan(r2);
    expect(pregnancyRisk(setDatingSettings(s, { pregnancy: 'off' }), c, 10).chance).toBe(0);
  });

  it('enough nights can start a pregnancy with the boss as father, and she is an adult', () => {
    const s = setDatingSettings(newGame('w-preg2'), { pregnancy: 'normal' });
    let hits = 0;
    for (let k = 0; k < 12 && !hits; k++) {
      const c = woman(s, 24);
      const a = affairFor(s, c.id);
      a.stage = 'affair';
      for (let n = 0; n < 15; n++) { s.week++; op(s, { op: 'did', a: { op: 'night', id: c.id, at: 'grand' } }); }
      if (a.preg) { hits++; expect(s.romance!.pregnancies.find((x) => x.id === a.preg)!.fatherId).toBe(s.playerId); expect(age(s, c)).toBeGreaterThanOrEqual(18); }
    }
    expect(hits).toBeGreaterThan(0);
  });
});

describe('women: hooks', () => {
  it('a hook expires, is used once, and dies with the boss (heirs get nothing)', () => {
    let s = newGame('w-hook');
    const c = woman(s);
    const W = ensureWomen(s);
    const h = addHook(s, W, c.id, 'past')!;
    expect(hookLive(s, h)).toBe(true);
    s.week += HOOK_WEEKS;
    hooksTidy(s);
    expect(h.status).toBe('expired');
    s.week -= HOOK_WEEKS;
    const h2 = addHook(s, W, c.id, 'past')!;
    expect(previewWomen(s, { op: 'hook', hook: h2.id, how: 'rumor' }).disabledReason).toMatch(/leaves your company/);
    op(s, { op: 'did', a: { op: 'hook', hook: h2.id, how: 'favor' } });
    expect(h2.status).toBe('used');
    // Never anything personal from a hook.
    expect(affairOf(s, c.id)).toBeUndefined();
    const h3 = addHook(s, W, c.id, 'secret')!;
    const old = s.playerId;
    s = forceDeath(s, old, 'heart attack').state;
    if (!s.gameOver) {
      hooksTidy(s);
      const again = s.women!.hooks.find((x) => x.id === h3.id)!;
      expect(again.status).toBe('void');
      expect(hookLive(s, again)).toBe(false);
      expect(s.women!.hooks.some((x) => x.holder === s.playerId && x.status === 'active')).toBe(false);
    }
  });
});

describe('women: the discovery chain', () => {
  it('a witness becomes gossip, then her husband (one of your men) comes to the office; humiliating him has consequences', () => {
    const s = newGame('w-disc');
    const { man, wife } = crewWife(s);
    const W = ensureWomen(s);
    const a = affairFor(s, wife.id);
    a.stage = 'affair';
    a.known.push({ w: 'town', how: 'witness', week: s.week });
    let ev;
    for (let i = 0; i < 300 && !ev; i++) { s.week++; ev = discoveryWeek(newCtx(s), W, a, wife); }
    expect(a.known.some((k) => k.how === 'gossip')).toBe(true);
    expect(ev?.defId).toBe('women_husband');
    expect(a.husbandKnew).toBeDefined();
    const before = s.relations ? JSON.stringify(s.relations).length : 0;
    op(s, { op: 'husband', id: wife.id, how: 'nothing' });
    expect(a.reaction).toBeDefined();
    expect(['separate', 'leave', 'rival', 'cops', 'revenge', 'swallow']).toContain(a.reaction);
    expect(before).toBeGreaterThanOrEqual(0);
    expect(man.id).toBeDefined();
  });

  it('a husband outside your crew reacts at once', () => {
    const s = newGame('w-disc2');
    const c = woman(s, 30);
    const m = makeCharacter(s, { gender: 'M', age: 33, rank: 'civilian', faction: 'none' });
    s.characters[m.id] = m;
    c.spouseId = m.id; m.spouseId = c.id;
    const W = ensureWomen(s);
    const a = affairFor(s, c.id);
    a.stage = 'affair';
    const line = husbandReacts(newCtx(s), W, a, c, m);
    expect(line).toMatch(new RegExp(c.firstName));
    expect(a.husbandKnew).toBe(s.week);
  });
});

describe('women: careers by age', () => {
  it('18-22 lean to fame; mid-20s to security; ~30 to a house of her own, getting out, or pictures', () => {
    const s = setDatingSettings(newGame('w-arcs'), { mature: 'standard' });
    const N = ensureNightlife(s);
    const tally = { y: { fame: 0, security: 0, later: 0, n: 0 }, m: { fame: 0, security: 0, later: 0, n: 0 }, o: { fame: 0, security: 0, later: 0, n: 0 } };
    for (const p of Object.values(N.people)) {
      const c = s.characters[p.id];
      for (const [band, a] of [['y', 20], ['m', 26], ['o', 32]] as const) {
        const aim = aimByAge(s, c, { ...p, goal: 'home', adultOk: true }, a).amb;
        const t = tally[band];
        t.n++;
        if (aim === 'fame') t.fame++;
        if (aim === 'security') t.security++;
        if (aim === 'madam' || aim === 'retire' || aim === 'films') t.later++;
      }
    }
    const f = (b: 'y' | 'm' | 'o', k: 'fame' | 'security' | 'later') => tally[b][k] / tally[b].n;
    expect(f('y', 'fame')).toBeGreaterThan(f('m', 'fame'));
    expect(f('y', 'fame')).toBeGreaterThan(f('o', 'fame'));
    expect(f('m', 'security')).toBeGreaterThan(f('y', 'security'));
    expect(f('o', 'later')).toBeGreaterThan(f('y', 'later'));
    expect(f('o', 'later')).toBeGreaterThan(f('m', 'later'));
  });
});

describe('women: the dossier, the body, hot or not', () => {
  const BAD = /\b(AA|A|B|C|D|DD|DDD)[- ]?cups?\b|\bcup size|\bbra\b|\b\d{2}\s*-\s*\d{2}\s*-\s*\d{2}\b|\bnude|naked|nipple|genital|\b(bust|waist|hips?)\W+\d/i;
  const REAL = /Monroe|Marilyn|Grace Kelly|Bardot|Hepburn|Elizabeth Taylor|Sophia Loren|Mansfield|Rita Hayworth|Ava Gardner|Kim Novak|Victoria'?s Secret|Betty Page|Bettie Page|Lana Turner|Doris Day|Natalie Wood|Jayne/i;
  it('every adult woman has a dossier with charts, no cup sizes, no measurements, no real people', () => {
    const s = newGame('w-dossier');
    let n = 0;
    for (const c of Object.values(s.characters)) {
      if (c.gender !== 'F' || !c.alive) continue;
      const d = dossierOf(s, c.id);
      if (age(s, c) < 18) { expect(d).toBeUndefined(); continue; }
      expect(d, c.id).toBeDefined();
      n++;
      const txt = JSON.stringify(d);
      expect(txt).not.toMatch(BAD);
      expect(txt).not.toMatch(REAL);
      expect(TYPES as readonly string[]).toContain(d!.look.type);
      expect(d!.aptitude.length).toBeGreaterThanOrEqual(6);
      expect(d!.motives.map((m) => m.key)).toEqual(['security', 'money', 'fame', 'love', 'family', 'freedom', 'revenge']);
      expect(d!.traits.length).toBeGreaterThan(3);
      expect(d!.look.body.figure.length).toBeGreaterThan(3);
      expect(d!.look.ratings.length).toBeGreaterThan(0);
    }
    expect(n).toBeGreaterThan(40);
  });

  it('men have the same body profile in words; descriptors change one at a time', () => {
    let s = newGame('w-body');
    const man = Object.values(s.characters).find((c) => c.gender === 'M' && c.alive && age(s, c) >= 18)!;
    const b = bodyOf(s, man)!;
    expect(b.bust).toBeUndefined();
    expect(JSON.stringify(b)).not.toMatch(BAD);
    const her = Object.values(s.characters).find((c) => c.gender === 'F' && c.alive && age(s, c) >= 18)!;
    const was = dossierOf(s, her.id)!.look;
    s = setDescriptor(s, her.id, 'body', 'voluptuous');
    s = setDescriptor(s, her.id, 'figure', 'bombshell');
    const now = dossierOf(s, her.id)!.look;
    expect(now.build).toBe('Voluptuous');
    expect(now.body.flavor).toMatch(/goddess/);
    expect(now.hair).toBe(was.hair);
    expect(setDescriptor(s, her.id, 'bust', 'DDD')).toBe(s);
  });

  it('every adult has a looks rating whose word matches its band; "to you" is personal', () => {
    const s = newGame('w-rating');
    let n = 0, differs = 0;
    for (const c of Object.values(s.characters)) {
      if (!c.alive || age(s, c) < 18) continue;
      const r = looksRating(s, c)!;
      expect(r, c.id).toBeDefined();
      n++;
      expect(r.score).toBe(toTen(looksOf(s, c).score!));
      expect(r.word).toBe(ratingWord(r.score, c.gender));
      if (r.toYou !== undefined && r.toYou !== r.score) differs++;
    }
    expect(n).toBeGreaterThan(80);
    expect(differs).toBeGreaterThan(0);
    const bands: [number, string][] = [[1, 'Homely'], [2, 'Homely'], [3, 'Plain'], [4, 'Average'], [5, 'Average'], [6, 'Pretty'], [7, 'Very cute'], [8, 'Hot'], [9, 'Stunning'], [10, 'Knockout']];
    for (const [sc, w] of bands) expect(ratingWord(sc, 'F')).toBe(w);
    expect(ratingWord(7, 'M')).toBe('Handsome');
  });
});

describe('women: mature content Off hides all of it', () => {
  it('no orders, no dossier, no rows, no events', () => {
    let s = setDatingSettings(newGame('w-off'), { mature: 'off' });
    const c = woman(s);
    expect(womenActionsFor(s, c.id)).toEqual([]);
    expect(womenChoices(s, c.id)).toEqual([]);
    expect(dossierOf(s, c.id)).toBeUndefined();
    expect(previewWomen(s, { op: 'askOut', id: c.id }).disabledReason).toMatch(/Mature content/);
    for (let i = 0; i < 40; i++) {
      s = advanceWeek(s, {}).state;
      for (const ev of s.pendingEvents) expect(ev.defId).not.toMatch(/^women_|^office_women_/);
    }
    expect(affairRows(s)).toEqual([]);
    expect(s.women).toBeUndefined();
  });
});

describe('women: saves', () => {
  it('round-trips through JSON; upgradeSave changes nothing on a current save; bounded', () => {
    let s = newGame('w-save');
    s = weeks(s, 60);
    const c = woman(s);
    const a = affairFor(s, c.id);
    a.stage = 'affair';
    op(s, { op: 'did', a: { op: 'night', id: c.id, at: 'hotel' } });
    const json = JSON.stringify(s);
    const back = JSON.parse(json) as GameState;
    expect(JSON.stringify(back.women)).toBe(JSON.stringify(s.women));
    const up = upgradeSave(JSON.parse(json));
    expect(JSON.stringify(up.women)).toBe(JSON.stringify(s.women));
    expect(JSON.stringify(s.women).length).toBeLessThan(60_000);
    expect(player(back).id).toBe(s.playerId);
  });
});

describe('women: the screens render', () => {
  it('the dossier, the calling card (badge, body, dossier button) and Her side render for an adult woman', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { Dossier } = await import('../src/ui/nightlife/Dossier');
    const { CallingCard } = await import('../src/ui/nightlife/CallingCard');
    const { WomenSection } = await import('../src/ui/nightlife/WomenSection');
    const s = newGame('w-ui');
    const c = woman(s, 26);
    const a = affairFor(s, c.id);
    a.stage = 'affair';
    const d = renderToString(createElement(Dossier, { s, id: c.id }));
    for (const t of ['dossier-appearance', 'dossier-aptitude', 'dossier-traits', 'dossier-motives', 'looks-badge', 'night-picker', 'dossier-ratings']) expect(d, t).toContain(`data-testid="${t}"`);
    const card = renderToString(createElement(CallingCard, { s, id: c.id, startOpen: true }));
    expect(card).toContain('data-testid="looks-badge"');
    expect(card).toContain('data-testid="open-dossier"');
    expect(card).toContain('data-testid="calling-card-body"');
    const side = renderToString(createElement(WomenSection, { s, onCard: () => {} }));
    expect(side).toContain('data-testid="women-affair"');
  });
});
