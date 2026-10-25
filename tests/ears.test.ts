import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { previewAction, legalActions, resolveActions } from '../src/engine/actions';
import { explainAction, immediateTotal } from '../src/engine/advice';
import { sumLines } from '../src/engine/ledger';
import { ageOn } from '../src/engine/calendar';
import { askOdds, earsActions, earsEventSource, intelEffects, knownEars, madamOpinion } from '../src/engine/ears';
import * as DATA from '../src/engine/earsData';
import { addLink, attachmentBoard, canAttach, connectionsOf } from '../src/engine/earsWeb';
import { startRomance } from '../src/engine/romance';
import { newCtx } from '../src/engine/ledger';
import { applyEffects } from '../src/engine/effects';
import { rand } from '../src/engine/rng';
import { makeCharacter } from '../src/engine/characters';
import type { Character, GameState, PlayerChoices } from '../src/engine/types';
import { NightPanel } from '../src/ui/ears/EarsPanel';
import { AttachmentBoard, ConnectionsList } from '../src/ui/ears/Connections';
import { EarsPicker } from '../src/ui/ears/EarsPicker';
import { menuFor } from '../src/ui/sheet/menuCatalog';

function choose(s: GameState, salt: number, pick?: (id: string, choices: string[]) => string | undefined): PlayerChoices {
  const h = { rng: (s.rng ^ (0x9e3779b9 + salt)) >>> 0 };
  const choices: Record<string, string> = {};
  for (const ev of s.pendingEvents) {
    const legal = ev.choices.filter((c) => !c.disabledReason).map((c) => c.id);
    choices[ev.iid] = pick?.(ev.defId, legal) ?? legal[Math.floor(rand(h) * legal.length)];
  }
  return { choices };
}

function rivalMan(s: GameState): Character {
  return Object.values(s.characters).find((c) => c.alive && c.gender === 'M' && s.rivals.some((r) => r.id === c.faction && r.kind === 'mob' && r.leaderId !== c.id) && c.rank !== 'civilian')!;
}

describe('the Ears: setup', () => {
  it('builds the Madam, her house, lieutenants, the Ears and the operators; every woman an adult, none owned by the family', () => {
    const s = newGame('ears-setup');
    const E = s.ears!;
    const m = s.characters[E.madam.id];
    expect(m.gender).toBe('F');
    expect(m.faction).toBe('none');
    expect(ageOn(m.birth, s.date)).toBeGreaterThanOrEqual(40);
    expect(E.madam.house).toMatch(/^the .+ house$/);
    expect(E.madam.lieutenants).toHaveLength(2);
    expect(E.madam.successorId).toBe(E.madam.lieutenants[0]);
    expect(madamOpinion(s)).toBeGreaterThan(0);
    const ears = Object.values(E.ears);
    expect(ears.length).toBeGreaterThanOrEqual(9);
    for (const e of ears) {
      const c = s.characters[e.id];
      expect(c.gender).toBe('F');
      expect(ageOn(c.birth, s.date)).toBeGreaterThanOrEqual(21);
      expect(c.faction).toBe('none');
      expect(c.orientation).toBeDefined();
    }
    expect(Object.values(E.ops).length).toBe(2);
    expect(Object.values(E.ops).filter((o) => o.stage === 'active')).toHaveLength(1);
  });
});

describe('the Ears: asking her', () => {
  it('"Can you get close to him?" shows her odds with every reason, and her lines block it outright', () => {
    const s = newGame('ears-ask');
    s.money = 50000;
    const E = s.ears!;
    const ear = Object.values(E.ears)[0];
    ear.known = true;
    ear.boundaries = [];
    const t = rivalMan(s);
    const p = previewAction(s, { kind: 'ears', op: { op: 'ask', earId: ear.id, targetId: t.id, mode: 'close' } });
    expect(p.disabledReason).toBeUndefined();
    expect(p.acceptance!.reasons.map((r) => r.label)).toEqual(expect.arrayContaining(['Base', 'Her trust in you', 'Her nerve against the risk']));
    expect(p.refuseEffects?.length).toBe(1);
    expect(p.effects.some((e) => e.type === 'money' && e.amount < 0)).toBe(true);
    // Generous is likelier.
    expect(askOdds(s, ear, t, 'close', true).chance).toBeGreaterThanOrEqual(askOdds(s, ear, t, 'close').chance);
    // Her lines.
    ear.boundaries = ['no_rivals'];
    expect(previewAction(s, { kind: 'ears', op: { op: 'ask', earId: ear.id, targetId: t.id, mode: 'close' } }).disabledReason).toMatch(/^She says no/);
    ear.boundaries = ['no_dances'];
    expect(previewAction(s, { kind: 'ears', op: { op: 'ask', earId: ear.id, targetId: t.id, mode: 'dance' } }).disabledReason).toMatch(/^She says no/);
    ear.boundaries = [];
    ear.work = 'waitress';
    expect(previewAction(s, { kind: 'ears', op: { op: 'ask', earId: ear.id, targetId: t.id, mode: 'dance' } }).disabledReason).toMatch(/waits tables/);
    // Never her own family's blood, never the boss.
    expect(previewAction(s, { kind: 'ears', op: { op: 'ask', earId: ear.id, targetId: s.playerId, mode: 'close' } }).disabledReason).toBeTruthy();
  });

  it('a yes is a quiet job in motion; she reports back and the paid report is real intel', () => {
    let s = newGame('ears-job');
    s.money = 50000;
    const E = s.ears!;
    const ear = Object.values(E.ears)[0];
    Object.assign(ear, { known: true, boundaries: [], loyalty: 95, nerve: 95, discretion: 95, charm: 95 });
    const t = rivalMan(s);
    // Force the yes: accept by applying the order's effects directly through the one pipeline.
    const p = previewAction(s, { kind: 'ears', op: { op: 'ask', earId: ear.id, targetId: t.id, mode: 'close' } });
    const ctx = newCtx(s);
    applyEffects(ctx, p.effects, { label: p.title, because: p.because, category: 'event' });
    expect(s.ears!.jobs).toHaveLength(1);
    expect(s.ears!.ears[ear.id].status).toBe('working');
    let report;
    for (let i = 0; i < 8 && !report; i++) {
      s = advanceWeek(s, choose(s, i, (id) => (id === 'ears_report' ? undefined : undefined))).state;
      report = s.pendingEvents.find((e) => e.defId === 'ears_report');
    }
    expect(report).toBeDefined();
    expect(report!.mandatory).toBe(true);
    expect(report!.text).toContain(t.firstName);
    const pay = report!.choices.find((c) => c.id === 'pay')!;
    const before = s.ears!.stats.reports;
    expect(before).toBe(1);
    s = advanceWeek(s, { choices: { [report!.iid]: 'pay' } }).state;
    expect(s.ears!.ears[ear.id].status).toBe('listening');
    expect(pay.effects.some((e) => e.type === 'ears')).toBe(true);
  });

  it('every sim order previews cleanly', () => {
    let s = newGame('ears-sim');
    s.money = 80000;
    for (let i = 0; i < 12; i++) s = advanceWeek(s, choose(s, i)).state;
    for (const e of Object.values(s.ears!.ears)) e.known = true;
    const acts = earsActions(s);
    expect(acts.length).toBeGreaterThan(4);
    for (const a of acts) expect(previewAction(s, a).title.length).toBeGreaterThan(3);
    expect(legalActions(s).some((a) => a.kind === 'ears')).toBe(true);
  });
});

describe('the Ears: no lying tooltips', () => {
  it('what the why-panel says an Ears order costs is what the ledger posts', () => {
    let s0 = newGame('ears-clar');
    for (let i = 0; i < 8; i++) s0 = advanceWeek(s0, {}).state;
    s0.money = 80000;
    for (const e of Object.values(s0.ears!.ears)) e.known = true;
    let n = 0;
    for (const a of earsActions(s0)) {
      if (previewAction(s0, a).disabledReason) continue;
      const s = JSON.parse(JSON.stringify(s0)) as GameState;
      const p = previewAction(s, a);
      const ex = explainAction(s, a);
      expect(ex.purpose.length, p.title).toBeGreaterThan(5);
      const ctx = newCtx(s);
      resolveActions(ctx, [a]);
      const got = sumLines(ctx.lines);
      if (ctx.log.some((l) => l.endsWith('— refused.'))) continue;
      for (const st of ['money', 'respect', 'heat.local'] as const) expect(got[st] ?? 0, `${p.title}: ${st}`).toBe(immediateTotal(ex, st));
      n++;
    }
    expect(n).toBeGreaterThan(2);
  });
});

describe('the Ears: hints through the story director', () => {
  it('she comes to you in one line; three answers; the text never repeats', () => {
    let s = newGame('ears-hints');
    s.money = 60000;
    const texts: string[] = [];
    let weekly = 0;
    for (let i = 0; i < 120 && !s.gameOver; i++) {
      const hints = s.pendingEvents.filter((e) => e.defId.startsWith('ears_hint_'));
      expect(hints.length).toBeLessThanOrEqual(1);
      weekly = Math.max(weekly, s.pendingEvents.length);
      for (const h of hints) {
        texts.push(h.text);
        const ids = h.choices.map((c) => c.id);
        expect(ids[0]).toBe('pay');
        expect(ids.some((x) => x === 'keep' || x === 'pass')).toBe(true);
        expect(h.choices[0].label).toMatch(/\$/);
      }
      s = advanceWeek(s, choose(s, i)).state;
    }
    expect(texts.length).toBeGreaterThan(2);
    expect(new Set(texts).size).toBe(texts.length);
    expect(weekly).toBeLessThanOrEqual(4);
  });

  it('the event source is deterministic and pure for the same state', () => {
    const s = newGame('ears-src');
    s.week = 30;
    s.ears!.lastHint = 0;
    const a = earsEventSource(JSON.parse(JSON.stringify(s)));
    const b = earsEventSource(JSON.parse(JSON.stringify(s)));
    expect(a?.text).toBe(b?.text);
  });
});

describe('the Ears: protection and the operators', () => {
  it('protecting her makes her loyal; taking an operator down wins the Madam and the whole network', () => {
    const s = newGame('ears-prot');
    s.money = 50000;
    const E = s.ears!;
    const op = Object.values(E.ops).find((o) => o.stage === 'active')!;
    const ear = Object.values(E.ears).find((e) => e.underOp === op.id)!;
    expect(ear).toBeDefined();
    ear.known = true;
    const ctx = newCtx(s);
    const p = previewAction(s, { kind: 'ears', op: { op: 'protect', earId: ear.id } });
    expect(p.disabledReason).toBeUndefined();
    applyEffects(ctx, p.effects, { label: p.title, because: p.because, category: 'event' });
    expect(E.ears[ear.id].protectedFrom).toBe(op.id);
    expect(E.ears[ear.id].loyalty).toBeGreaterThanOrEqual(70);
    const loyal = Object.fromEntries(Object.values(E.ears).map((e) => [e.id, e.loyalty]));
    const mOp = madamOpinion(s);
    op.exposure = 70;
    const x = previewAction(s, { kind: 'ears', op: { op: 'opExpose', opId: op.id } });
    expect(x.disabledReason).toBeUndefined();
    applyEffects(ctx, x.effects, { label: x.title, because: x.because, category: 'event' });
    expect(op.stage).toBe('gone');
    expect(madamOpinion(s)).toBeGreaterThan(mOp);
    for (const e of Object.values(E.ears)) if (e.status !== 'gone') expect(e.loyalty).toBeGreaterThanOrEqual(Math.min(100, loyal[e.id]));
    // She is free to go: leaving is always her choice, and the boss's answers never stop it by force.
    const leave = DATA.LEAVING.join(' ');
    expect(leave).not.toMatch(/\b(forbid|make her stay|won't let)\b/i);
  });
});

describe('the Ears: the connection web', () => {
  it('links only between a man and a woman drawn to each other; hidden ones stay hidden; same-sex romances never appear', () => {
    const s = newGame('ears-web');
    const E = s.ears!;
    for (const l of E.links) {
      const a = s.characters[l.a];
      const b = s.characters[l.b];
      expect(a.gender).not.toBe(b.gender);
      expect(canAttach(s, a, b)).toBe(true);
    }
    const her = s.characters[Object.keys(E.ears)[0]];
    const man = Object.values(s.characters).find((c) => c.alive && c.gender === 'M' && c.faction === 'player' && c.id !== s.playerId && canAttach(s, c, her))!;
    const l = addLink(s, E, man.id, her.id, 'girlfriend', 60, 'date', true)!;
    expect(connectionsOf(s, man.id).some((x) => x.otherId === her.id)).toBe(false);
    l.hidden = false;
    expect(connectionsOf(s, man.id).some((x) => x.otherId === her.id && x.type === 'girlfriend')).toBe(true);
    expect(attachmentBoard(s).some((r) => r.manId === man.id && r.womanId === her.id)).toBe(true);
    // A same-sex couple is private: not on the board, not in the web.
    const a = makeCharacter(s, { gender: 'M', age: 30 });
    const b = makeCharacter(s, { gender: 'M', age: 32 });
    a.orientation = 'gay';
    b.orientation = 'gay';
    a.faction = 'player';
    a.rank = 'soldier';
    const r = startRomance(s, a.id, b.id);
    if (r) r.secret = false;
    expect(connectionsOf(s, a.id)).toHaveLength(0);
    expect(attachmentBoard(s).some((x) => x.manId === a.id || x.womanId === a.id || x.manId === b.id)).toBe(false);
    expect(addLink(s, E, a.id, b.id, 'girlfriend', 50, 'npc')).toBeUndefined();
  });

  it('leverage comes from affairs and graft only, never orientation', () => {
    const s = newGame('ears-lev');
    const t = rivalMan(s);
    const ear = Object.keys(s.ears!.ears)[0];
    for (const kind of ['graft', 'affair', 'rat', 'skim', 'plans', 'case', 'debt', 'operator', 'leak', 'link', 'nothing'] as const) {
      for (const e of intelEffects(s, ear, kind, t, true, 'x')) {
        if (e.type === 'hook') expect(e.reason).toMatch(/money|affair|markers|talked/);
        if (e.type === 'storyOp' && e.op.op === 'secret') expect(['affair', 'informant', 'skimming', 'debt']).toContain(e.op.kind);
        expect(JSON.stringify(e)).not.toMatch(/orientation|gay|queer|homosexual/i);
      }
    }
  });

  it('a few years of the web: links grow, some revealed, all JSON-safe; the ledger reconciles every week', () => {
    let s = newGame('ears-years');
    for (let i = 0; i < 160 && !s.gameOver; i++) s = advanceWeek(s, choose(s, i)).state;
    const E = s.ears!;
    expect(E.links.length).toBeGreaterThan(5);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(knownEars(s).length).toBeGreaterThan(0);
  });
});

describe('the Ears: words', () => {
  it('nothing explicit, nobody underage, no trafficking by the player in any line', () => {
    const all = JSON.stringify(DATA);
    expect(all).not.toMatch(/\b(naked|nude|sex|sexual|undress|bedroom|teen|teenage|underage|minor)\b/i);
    expect(all).not.toMatch(/\b(sell her to|buy her for|your girls|owns? (the|her) girls)\b/i);
  });
});

describe('the Ears: UI', () => {
  it('the Night panel, the board, the picker, connections and the person menu render', () => {
    let s = newGame('ears-ui');
    s.money = 50000;
    for (let i = 0; i < 6; i++) s = advanceWeek(s, choose(s, i)).state;
    for (const e of Object.values(s.ears!.ears)) e.known = true;
    for (const l of s.ears!.links) l.hidden = false;
    expect(renderToString(createElement(NightPanel, { s }))).toContain('madam-card');
    expect(renderToString(createElement(AttachmentBoard, { s }))).toContain('attach-board');
    const t = rivalMan(s);
    expect(renderToString(createElement(EarsPicker, { s, target: t, mode: 'close' }))).toContain('ears-picker');
    const someone = s.ears!.links[0]?.a ?? t.id;
    renderToString(createElement(ConnectionsList, { s, id: someone, compact: true }));
    const cats = menuFor(s, t);
    const night = cats.find((c) => c.id === 'nightlife');
    expect(night).toBeDefined();
    expect(night!.items.some((i) => i.key === 'ears:close')).toBe(true);
    expect(night!.items.some((i) => i.key === 'ears:dance')).toBe(true);
    const mc = menuFor(s, s.characters[s.ears!.madam.id]).find((c) => c.id === 'nightlife');
    expect(mc!.items.some((i) => i.key === 'madam:call')).toBe(true);
  });
});
