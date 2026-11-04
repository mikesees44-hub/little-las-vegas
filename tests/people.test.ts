import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { crew } from '../src/engine/characters';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import {
  addSuspicion, evidenceNow, hitLine, ownHitConsequences, ownHitFallout, peopleLedger, personView, readAct, readsWeek, SUSPECT, sitOdds, testOdds,
} from '../src/engine/peopleRead';
import { schemeOdds } from '../src/engine/schemes';
import { addSecret } from '../src/engine/secrets';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { Character, GameState } from '../src/engine/types';

function soldier(s: GameState, n = 0): Character {
  return crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate').sort((a, b) => a.id.localeCompare(b.id))[n];
}

function week(s: GameState): void {
  readsWeek(newCtx(s));
}

describe('the boss\'s read is a belief, not the truth', () => {
  it('a fresh game has no read at all (its final form: nothing to fill in on load)', () => {
    const s = newGame('people-fresh');
    expect(s.reads).toBeUndefined();
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
  });

  it('a real informant with no evidence reads clean; suspicion rises when evidence lands', () => {
    const s = newGame('people-rat');
    const rat = soldier(s);
    rat.informantFor = 'law';
    week(s);
    expect(evidenceNow(s).filter((e) => e.id === rat.id)).toEqual([]);
    expect(personView(s, rat.id)!.flip.v).toBeLessThan(15);
    // The Ears bring it in: a secret the house now holds.
    addSecret(s, rat, 'informant', ['player']);
    week(s);
    const v = personView(s, rat.id)!;
    expect(v.flip.v).toBeGreaterThanOrEqual(SUSPECT);
    expect(v.flip.why.join(' ')).toMatch(/talks to the FBI/);
    // Counted once: another week does not count the same secret again (it only fades).
    const was = v.flip.v;
    week(s);
    expect(personView(s, rat.id)!.flip.v).toBeLessThan(was);
  });

  it('a loyal man can look like a thief: a short envelope raises suspicion of stealing', () => {
    const s = newGame('people-short');
    const m = soldier(s, 1);
    expect(m.skimmed ?? 0).toBe(0);
    s.tribute!.shortHist[m.id] = [s.week];
    week(s);
    expect(personView(s, m.id)!.steal.v).toBeGreaterThan(0);
    expect(personView(s, m.id)!.steal.why[0]).toMatch(/short/);
  });

  it('suspicion decays slowly and the hook takes any evidence', () => {
    const s = newGame('people-decay');
    const m = soldier(s);
    addSuspicion(s, m.id, 'flip', 50, 'His wife\'s envelope says he meets a man from Newark', 'payroll');
    const v0 = personView(s, m.id)!.flip.v;
    expect(v0).toBeGreaterThanOrEqual(SUSPECT);
    for (let i = 0; i < 4; i++) week(s);
    const v4 = personView(s, m.id)!.flip.v;
    expect(v4).toBeLessThan(v0);
    expect(v4).toBeGreaterThan(v0 * 0.8);
    expect(personView(s, m.id)!.flip.why.join(' ')).toMatch(/Newark/);
  });

  it('weeks of play keep the read bounded and the save loads unchanged', () => {
    let s = newGame('people-weeks');
    for (let i = 0; i < 6; i++) s = advanceWeek(s, {}).state;
    for (const r of Object.values(s.reads?.p ?? {})) {
      expect(r.f).toBeGreaterThanOrEqual(0);
      expect(r.f).toBeLessThanOrEqual(100);
      expect(r.ev.length).toBeLessThanOrEqual(8);
    }
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
  });
});

describe('the ledger and its row actions', () => {
  it('everyone grouped by family, your own first, with every meter explained', () => {
    const s = newGame('people-ledger');
    const groups = peopleLedger(s);
    expect(groups[0].group).toBe('yours');
    const keys = groups.map((g) => g.group);
    expect(keys).toContain('manno');
    expect(keys.indexOf('manno')).toBeLessThan(keys.indexOf('philly') < 0 ? 99 : keys.indexOf('philly'));
    for (const g of groups) for (const v of g.rows) {
      for (const m of [v.trust, v.flip, v.steal, v.loyalty, v.fear]) expect(m.why.length).toBeGreaterThan(0);
      expect(v.beef.why.length).toBeGreaterThan(0);
    }
    expect(peopleLedger(s, { fight: true }).flatMap((g) => g.rows).every((v) => v.beef.level !== 'none')).toBe(true);
    expect(peopleLedger(s, { suspected: true }).flatMap((g) => g.rows)).toEqual([]);
  });

  it('sit him down, test him and clear him settle now, purely, into Your File', () => {
    const s = newGame('people-acts');
    const m = soldier(s);
    const frozen = JSON.stringify(s);
    expect(sitOdds(s, m.id).chance).toBeGreaterThan(0);
    expect(testOdds(s, m.id).ifTalks).toBeGreaterThan(testOdds(s, m.id).ifClean);
    const sit = readAct(s, m.id, 'sit');
    expect(sit.result.ok).toBe(true);
    expect(sit.result.chance).toBeGreaterThan(0);
    expect(JSON.stringify(s)).toBe(frozen);
    expect(sit.state.journal!.e.some((e) => e.src === 'reads' && e.p?.includes(m.id))).toBe(true);
    expect(readAct(sit.state, m.id, 'sit').result.ok).toBe(false);
    const t = readAct(sit.state, m.id, 'test');
    expect(t.result.ok).toBe(true);
    const c = readAct(t.state, m.id, 'clear');
    expect(personView(c.state, m.id)!.flip.v).toBe(0);
    expect(personView(c.state, m.id)!.cleared).toBe(s.week);
  });

  it('a hit on one of your own is possible, priced, and its consequences are named', () => {
    const s = newGame('people-hit');
    const m = soldier(s);
    const line = hitLine(s, m.id);
    expect(line.own).toBe(true);
    expect(line.blocked).toBeUndefined();
    expect(line.chance).toBeGreaterThan(0);
    expect(schemeOdds(s, 'murder', m.id, line.team, { depth: 'planned' }).disabledReason).toBeUndefined();
    expect(ownHitConsequences(s, m.id).join(' ')).toMatch(/crew/);
    const fx = ownHitFallout(s, m, true);
    expect(fx.some((e) => e.type === 'crewOpinion')).toBe(true);
  });

  it('when the hit on your own man lands, the crew and his family feel it', () => {
    for (let i = 0; i < 10; i++) {
      const s = newGame(`people-ownhit-${i}`);
      const m = soldier(s, 2);
      const team = crew(s).filter((c) => c.id !== m.id && (c.rank === 'soldier' || c.rank === 'capo')).sort((a, b) => b.attributes.force - a.attributes.force).slice(0, 4).map((c) => c.id);
      s.schemes.push({ id: 'scx', kind: 'murder', owner: 'player', ownerId: s.playerId, targetId: m.id, agents: team, opts: { depth: 'meticulous', location: 'car', disposal: 'public', equipment: 'untraceable', alibi: true }, progress: 99, startWeek: s.week, discovered: false, because: 'he talked' });
      const n = advanceWeek(s, {}).state;
      if (n.characters[m.id].alive) continue;
      const other = crew(n).find((c) => c.id !== m.id && !team.includes(c.id))!;
      expect(Object.values(n.relations).some((r) => r.from === other.id && r.modifiers.some((x) => /had .* killed/.test(x.reason)))).toBe(true);
      return;
    }
    throw new Error('no hit landed in ten tries');
  });
});
