import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { capos, player } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import { upgradeSave } from '../src/engine/upgradeSave';
import { addOpinion, opinion } from '../src/engine/relations';
import { mindsWeek } from '../src/engine/minds';
import { previewAction } from '../src/engine/actions';
import { timeCost, hasTimeCost } from '../src/engine/timeCost';
import {
  acceptance, buildAsk, clashReasons, clashWeek, DEEDS, deedPreview, deedsEventSource, deedsWeek, ensureDeeds, rawSum, relationsWeb,
  tierOdds, tierOf, TRAIT_WEIGHTS, weigh,
} from '../src/engine/deeds';
import { pushAsk } from '../src/engine/deeds/npc';
import { knowledge, leansView } from '../src/engine/deeds/leans';
import { checkVoice, voicePrompt } from '../src/engine/deeds/voice';
import { menuFor } from '../src/ui/sheet/menuCatalog';
import type { Character, GameState, Trait } from '../src/engine/types';
import { playWeeks } from './helpers';

function game(seed = 'deeds-a'): GameState {
  const s = newGame(seed);
  mindsWeek(newCtx(s));
  return s;
}
/** A capo who is not of the boss's own blood (threats are not for family). */
const capo = (s: GameState, i = 0): Character => capos(s).filter((c) => !c.dynasty)[i] ?? capos(s)[i];
function set(c: Character, traits: Trait[]): void { c.traits = traits; }

describe('deeds: the acceptance breakdown', () => {
  it('the total is the sum of its itemized reasons (clamped 5-95%)', () => {
    const s = game();
    let n = 0;
    for (const k of capos(s)) for (const id of Object.keys(DEEDS) as (keyof typeof DEEDS)[]) {
      const p = deedPreview(s, id, s.playerId, k.id);
      if (!p?.acceptance) continue;
      n++;
      const sum = rawSum(p.acceptance);
      expect(p.acceptance.chance).toBeCloseTo(Math.max(5, Math.min(95, Math.round(sum))) / 100, 5);
      expect(p.acceptance.reasons[0].label).toMatch(/Base|The odds/);
      for (const r of p.acceptance.reasons.slice(1)) expect(r.value).not.toBe(0);
      // The four outcomes add up to 1.
      const o = tierOdds(p.def, p.chance);
      expect(o.crit + o.success + o.fail + o.critFail).toBeCloseTo(1, 6);
    }
    expect(n).toBeGreaterThan(10);
  });

  it('it changes with his traits (the one weight table), his opinion and your hooks', () => {
    const s = game();
    const k = capo(s);
    set(k, []);
    const plain = deedPreview(s, 'befriend', s.playerId, k.id)!.acceptance!;
    set(k, ['Paranoid']);
    const para = deedPreview(s, 'befriend', s.playerId, k.id)!.acceptance!;
    const r = para.reasons.find((x) => x.label === 'Paranoid')!;
    // Paranoid: trust −30 × befriend's recv.trust 0.8 = −24 (the same number "How he leans" shows).
    expect(r.value).toBe(Math.round((TRAIT_WEIGHTS.Paranoid.trust ?? 0) * DEEDS.befriend.recv.trust!));
    expect(para.chance).toBeLessThan(plain.chance);
    set(k, ['Cowardly']);
    const scared = deedPreview(s, 'threaten', s.playerId, k.id)!.acceptance!;
    set(k, ['Hot-headed']);
    const hot = deedPreview(s, 'threaten', s.playerId, k.id)!.acceptance!;
    expect(scared.chance).toBeGreaterThan(hot.chance);
    set(k, []);
    addOpinion(s, k.id, s.playerId, 'Test: thinks the world of you', 60, 0);
    const liked = deedPreview(s, 'befriend', s.playerId, k.id)!.acceptance!;
    expect(liked.chance).toBeGreaterThan(plain.chance);
    expect(liked.reasons.some((x) => x.label === 'Opinion of you' && x.value > 0)).toBe(true);
    // A strong hook, leaned on.
    s.hooks.push({ id: 'kx', holder: 'player', targetId: k.id, strong: true, reason: 'Knows about the second book', week: 0 });
    const hooked = deedPreview(s, 'askFavor', s.playerId, k.id, { hook: true })!.acceptance!;
    const unhooked = deedPreview(s, 'askFavor', s.playerId, k.id)!.acceptance!;
    expect(hooked.reasons.some((x) => x.label.startsWith('Strong hook') && x.value === 80)).toBe(true);
    expect(rawSum(hooked) - rawSum(unhooked)).toBe(80);
  });

  it('rank, blood, grudges and ties are reasons too; the same engine judges NPC to NPC', () => {
    const s = game();
    const [a, b] = capos(s);
    const boss = deedPreview(s, 'askFavor', s.playerId, a.id)!.acceptance!;
    expect(boss.reasons.some((x) => x.label === "You're his boss" && x.value === 15)).toBe(true);
    ensureDeeds(s).ties[[a.id, b.id].sort().join('|')] = { k: 'feud', w: 0, y: 'Test' };
    const npc = acceptance(s, a, b, { mode: 'consent', base: 30, recv: DEEDS.befriend.recv, friendly: true });
    expect(npc.reasons.some((x) => x.label.startsWith('Blood feud') && x.value === -40)).toBe(true);
    expect(npc.reasons.some((x) => x.label.includes(a.firstName))).toBe(true);
  });

  it('outcome tiers follow the roll', () => {
    const def = DEEDS.befriend;
    expect(tierOf(def, 0.6, 0.0)).toBe('crit');
    expect(tierOf(def, 0.6, 0.5)).toBe('success');
    expect(tierOf(def, 0.6, 0.7)).toBe('fail');
    expect(tierOf(def, 0.6, 0.999)).toBe('critFail');
    expect(tierOf(DEEDS.recognize, 0.1, 0.99)).toBe('success');
  });
});

describe('deeds: the boss does them', () => {
  it('an order costs hours, rolls when the week turns, and goes on cooldown', () => {
    let s = game('deeds-order');
    const k = capo(s);
    const a = { kind: 'deed' as const, id: 'befriend' as const, target: k.id };
    expect(hasTimeCost('deed', 'befriend')).toBe(true);
    expect(timeCost(a)).toBe(2);
    const p = previewAction(s, a);
    expect(p.odds?.reasons.length).toBeGreaterThan(1);
    expect(p.outcomes?.length).toBe(4);
    expect(p.cooldown).toBe(DEEDS.befriend.cooldown);
    s = advanceWeek(s, { actions: [a] }).state;
    const log = s.deeds!.log.filter((l) => l.a === s.playerId && l.t === k.id && l.id === 'befriend');
    expect(log.length).toBe(1);
    expect(previewAction(s, a).disabledReason).toMatch(/Tried lately/);
  });

  it('the menu lists the deeds in their groups, with no duplicate threaten', () => {
    const s = game();
    const k = capo(s);
    const cats = menuFor(s, k);
    const keys = new Map(cats.flatMap((c) => c.items.map((it) => [it.key, c.id] as const)));
    expect(keys.get('d:befriend')).toBe('diplomacy');
    expect(keys.get('d:recognize')).toBe('crew');
    expect(keys.get('d:discipline')).toBe('crew');
    expect(keys.get('d:findSecrets')).toBe('intrigue');
    expect(keys.has('d:threaten')).toBe(true);
    expect(keys.has('i:threaten')).toBe(false);
    const rival = s.characters[s.rivals.find((r) => r.kind === 'mob')!.leaderId];
    const rk = new Set(menuFor(s, rival).flatMap((c) => c.items.map((it) => it.key)));
    expect(rk.has('d:alliance')).toBe(true);
    expect(rk.has('d:insult')).toBe(true);
  });
});

describe('deeds: the NPCs do them', () => {
  it('NPCs use interactions on each other and on the boss, and the boss is asked', () => {
    const s = playWeeks('deeds-npc', 36);
    const D = s.deeds!;
    expect(D.stats.npc).toBeGreaterThan(20);
    const npcOnNpc = D.log.filter((l) => l.a !== s.playerId && l.t !== s.playerId);
    expect(npcOnNpc.length).toBeGreaterThan(5);
    expect(new Set(D.log.map((l) => l.id)).size).toBeGreaterThan(4);
    expect(D.stats.asks).toBeGreaterThan(0);
    expect(s.director!.hist.some(([, id]) => id.startsWith('deed_'))).toBe(true);
  });

  it('weigh scores every deed from his nature, needs, grudges and the odds', () => {
    const s = game();
    const [a, b] = capos(s);
    set(a, ['Hot-headed', 'Vengeful']);
    addOpinion(s, a.id, b.id, 'Test: took my corner', -60, 0);
    const w = weigh(s, a.id, b.id);
    expect(w.length).toBeGreaterThan(3);
    const ins = w.find((x) => x.id === 'insult')!;
    const bef = w.find((x) => x.id === 'befriend')!;
    expect(ins.score).toBeGreaterThan(bef.score);
    expect(ins.score).toBe(ins.why.reduce((acc, x) => acc + x.value, 0));
    set(a, ['Charming']);
    addOpinion(s, a.id, b.id, 'Test: took my corner', 120, 0);
    addOpinion(s, a.id, b.id, 'Test: an old friend', 50, 0);
    const w2 = weigh(s, a.id, b.id);
    expect(w2.find((x) => x.id === 'befriend')!.score).toBeGreaterThan(w2.find((x) => x.id === 'insult')!.score);
  });

  it('an ask at the boss\'s door is a popup whose answer lands as effects', () => {
    let s = game('deeds-ask');
    const k = capo(s);
    pushAsk(s, { d: 'askLoan', a: k.id, p: 50, n: 1000 });
    const ev = deedsEventSource(s)!;
    expect(ev.defId).toBe('deed_askLoan');
    expect(ev.choices.length).toBe(3);
    s.pendingEvents = [ev];
    const before = opinion(s, k.id, s.playerId);
    s = advanceWeek(s, { choices: { [ev.iid]: 'lend' } }).state;
    expect(s.deeds!.asks.find((x) => x.a === k.id && x.d === 'askLoan')).toBeUndefined();
    expect(s.deeds!.ln.some((l) => l.to === k.id && l.by === s.playerId)).toBe(true);
    expect(opinion(s, k.id, s.playerId)).toBeGreaterThan(before - 5);
    for (const d of ['askFavor', 'alliance', 'partner', 'offerPiece', 'demandRespect', 'insult'] as const) {
      const e = buildAsk(s, { id: `t-${d}`, d, a: k.id, w: s.week, p: 50, n: 500 });
      expect(e?.choices.length, d).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('deeds: personality clashes', () => {
  it('two hotheads in one crew grow to dislike each other, and a tie forms and reaches the boss', () => {
    const s = game('deeds-clash');
    const [a, b] = capos(s);
    set(a, ['Hot-headed']);
    set(b, ['Hot-headed']);
    expect(clashReasons(s, a, b)[0].y).toBe('Two hotheads in one room');
    const ctx = newCtx(s);
    const D = ensureDeeds(s);
    const op0 = opinion(s, a.id, b.id);
    for (let i = 0; i < 4; i++) { D.cw = -99; clashWeek(ctx); }
    expect(opinion(s, a.id, b.id)).toBeLessThan(op0);
    addOpinion(s, a.id, b.id, 'Test: bad blood', -50, 0);
    addOpinion(s, b.id, a.id, 'Test: bad blood', -50, 0);
    D.cw = -99;
    clashWeek(ctx);
    const tie = D.ties[[a.id, b.id].sort().join('|')];
    expect(tie?.k === 'feud' || tie?.k === 'rival').toBe(true);
    expect(D.asks.some((x) => x.d === 'clash' && (x.a === a.id || x.a === b.id))).toBe(true);
    const web = relationsWeb(s);
    expect(web.edges.some((e) => (e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id))).toBe(true);
  });

  it('drinking buddies become friends', () => {
    const s = game('deeds-friends');
    const [a, b] = capos(s);
    set(a, ['Drinker']);
    set(b, ['Drinker']);
    addOpinion(s, a.id, b.id, 'Test: old pals', 30, 0);
    addOpinion(s, b.id, a.id, 'Test: old pals', 30, 0);
    const D = ensureDeeds(s);
    for (let i = 0; i < 3; i++) { D.cw = -99; clashWeek(newCtx(s)); }
    expect(D.ties[[a.id, b.id].sort().join('|')]?.k).toBe('friend');
  });
});

describe('deeds: how he leans', () => {
  it('shows his weights with numbers, fogged by how well you know him', () => {
    const s = game('deeds-leans');
    const k = capo(s);
    set(k, ['Hot-headed', 'Greedy']);
    const v = leansView(s, k.id)!;
    expect(v.know).toBeGreaterThanOrEqual(1);
    expect(v.weights.some((w) => w.text === 'Hot-headed +35 toward violence')).toBe(true);
    expect(v.weights.some((w) => w.text === 'Greedy +30 toward money')).toBe(true);
    // A rival's man you know nothing about: traits only.
    const stranger = Object.values(s.characters).find((c) => c.alive && s.rivals.some((r) => r.id === c.faction && r.leaderId !== c.id) && knowledge(s, c.id).v < 20)!;
    const sv = leansView(s, stranger.id)!;
    expect(sv.know).toBe(0);
    expect(sv.weights.length).toBe(0);
    expect(sv.weighing.length).toBe(0);
    // Read him fully: secrets, a hook, his trust.
    s.secrets.push({ id: 'sx1', ownerId: k.id, kind: 'skimming', text: 'skims', knownBy: ['player'], week: 0 }, { id: 'sx2', ownerId: k.id, kind: 'debt', text: 'owes', knownBy: ['player'], week: 0 });
    s.hooks.push({ id: 'kh', holder: 'player', targetId: k.id, strong: true, reason: 'test', week: 0 });
    const full = leansView(s, k.id)!;
    expect(full.know).toBe(3);
    expect(full.weighing.length).toBeGreaterThan(0);
    expect(full.weighing.length).toBeLessThanOrEqual(3);
    for (const w of full.weighing) expect(typeof w.score).toBe('number');
    const top = weigh(s, k.id, s.playerId)[0];
    expect(full.weighing[0].score).toBe(top.score);
  });
});

describe('deeds: the voice is checked', () => {
  it('a voiced line keeps the outcome, has no numbers, names only the people in it', () => {
    const s = playWeeks('deeds-voice', 12);
    const l = s.deeds!.log.find((x) => x.r === 'fail') ?? s.deeds!.log[0];
    expect(l).toBeDefined();
    expect(JSON.stringify(voicePrompt(s, l))).toContain(l.x.slice(0, 20));
    expect(checkVoice(s, l, { line: 'He kept his own counsel and walked out into the rain.' })).toBeTruthy();
    expect(checkVoice(s, l, { line: 'He paid $500 on the spot.' })).toBeUndefined();
    expect(checkVoice(s, l, 'nope')).toBeUndefined();
    expect(checkVoice(s, l, { line: 'x'.repeat(400) })).toBeUndefined();
    const other = Object.values(s.characters).find((c) => c.id !== l.a && c.id !== l.t && c.lastName.length >= 4)!;
    expect(checkVoice(s, l, { line: `${other.firstName} ${other.lastName} watched from the bar.` })).toBeUndefined();
    if (l.r === 'fail') expect(checkVoice(s, l, { line: 'He agreed at once.' })).toBeUndefined();
  });
});

describe('deeds: determinism and saves', () => {
  it('the same seed plays the same deeds', () => {
    const a = playWeeks('deeds-det', 20);
    const b = playWeeks('deeds-det', 20);
    expect(JSON.stringify(a.deeds)).toBe(JSON.stringify(b.deeds));
    expect(a.rng).toBe(b.rng);
  });

  it('a save round-trips, and plays on the same', () => {
    const s = playWeeks('deeds-save', 14);
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(JSON.stringify(copy.deeds)).toBe(JSON.stringify(s.deeds));
    const x = advanceWeek(s, {}).state;
    const y = advanceWeek(copy, {}).state;
    expect(JSON.stringify(x.deeds)).toBe(JSON.stringify(y.deeds));
  });

  it('upgradeSave leaves a save without deeds alone, and a save with deeds unchanged', () => {
    const s = newGame('deeds-up');
    const before = JSON.stringify(s);
    upgradeSave(s);
    expect(s.deeds).toBeUndefined();
    expect(JSON.stringify(s)).toBe(before);
    const p = playWeeks('deeds-up2', 6);
    const w = JSON.stringify(p.deeds);
    upgradeSave(p);
    expect(JSON.stringify(p.deeds)).toBe(w);
  });

  it('the deeds stay bounded', () => {
    const s = playWeeks('deeds-bound', 40);
    const D = s.deeds!;
    expect(D.log.length).toBeLessThanOrEqual(40);
    expect(Object.keys(D.ties).length).toBeLessThanOrEqual(120);
    expect(D.asks.length).toBeLessThanOrEqual(6);
    expect(JSON.stringify(D).length).toBeLessThan(40000);
    deedsWeek(newCtx(s));
    expect(player(s).alive).toBe(true);
  });
});
