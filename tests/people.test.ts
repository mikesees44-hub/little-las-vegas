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

describe('close people (the ★)', () => {
  it('wife and kids are close from the start without any state; pin and unpin round-trip through a save', async () => {
    const { autoPins, closePeople, isPinned, pinnedIds, pinTag, togglePin } = await import('../src/engine/pins');
    const s = newGame('people-pins');
    expect(s.pins).toBeUndefined();
    const auto = autoPins(s);
    for (const id of auto) expect(isPinned(s, id)).toBe(true);
    const boss = s.characters[s.playerId];
    if (boss.spouseId) expect(pinTag(s, boss.spouseId)).toBe('Wife');
    const m = soldier(s);
    let n = togglePin(s, m.id);
    expect(s.pins).toBeUndefined();
    expect(isPinned(n, m.id)).toBe(true);
    if (auto[0]) n = togglePin(n, auto[0]);
    // Through a save.
    const loaded = upgradeSave(JSON.parse(JSON.stringify(n)));
    expect(isPinned(loaded, m.id)).toBe(true);
    if (auto[0]) expect(isPinned(loaded, auto[0])).toBe(false);
    expect(pinnedIds(loaded)).toEqual(pinnedIds(n));
    expect(closePeople(loaded).flatMap((g) => g.people.map((p) => p.id))).toContain(m.id);
    const back = togglePin(loaded, m.id);
    expect(isPinned(back, m.id)).toBe(false);
    if (auto[0]) expect(isPinned(togglePin(back, auto[0]), auto[0])).toBe(true);
  });
});

describe('the honey trap in a planned hit', () => {
  it('appears only with Mature content on and a candidate; raises the odds; who asks and how much matter', async () => {
    const H = await import('../src/engine/hitHoney');
    const s = newGame('people-honey');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    const t = Object.values(s.characters).find((c) => c.alive && c.faction === 'manno' && c.id !== r.leaderId && c.rank !== 'civilian')!;
    const women = H.honeyCandidates(s, t.id);
    expect(women.length).toBeGreaterThan(0);
    const off = { ...s, dating: { ...s.dating!, settings: { ...s.dating!.settings, mature: 'off' as const } } };
    expect(H.honeyCandidates(off, t.id)).toEqual([]);
    const noNight = { ...s, nightlife: { ...s.nightlife!, people: {} } };
    expect(H.honeyCandidates(noNight, t.id)).toEqual([]);
    const team = hitLine(s, t.id).team;
    const base = schemeOdds(s, 'murder', t.id, team, { depth: 'planned' });
    const w = women[0].id;
    const withHer = schemeOdds(s, 'murder', t.id, team, { depth: 'planned', honey: w });
    expect(withHer.chance).toBeGreaterThan(base.chance);
    expect(withHer.cost).toBeGreaterThan(base.cost);
    expect(schemeOdds(off, 'murder', t.id, team, { depth: 'planned', honey: w }).chance).toBe(base.chance);
    // The boss asking, and a generous offer, raise her odds; generous lowers the tip-off.
    const soldierAsk = crew(s).find((c) => c.rank === 'soldier')!;
    const lowSoldier = H.honeyOdds(s, w, t.id, { by: soldierAsk.id, pay: 'low' });
    const fairBoss = H.honeyOdds(s, w, t.id, { pay: 'fair' });
    const genBoss = H.honeyOdds(s, w, t.id, { pay: 'generous' });
    const nameBoss = H.honeyOdds(s, w, t.id, { pay: 'name' });
    expect(fairBoss.yes).toBeGreaterThan(lowSoldier.yes);
    expect(genBoss.yes).toBeGreaterThanOrEqual(fairBoss.yes);
    expect(genBoss.warn).toBeLessThan(fairBoss.warn);
    expect(nameBoss.yes - genBoss.yes).toBeLessThanOrEqual(genBoss.yes - fairBoss.yes + 1e-9);
    expect(fairBoss.reasons.map((x) => x.label).join(' ')).toMatch(/boss/);
    // Heavy fear of the target caps her.
    const scared = JSON.parse(JSON.stringify(s));
    scared.relations[`${w}>${t.id}`] = { from: w, to: t.id, modifiers: [], fear: 80, trust: 30, grievance: 0 };
    expect(H.honeyOdds(scared, w, t.id, { pay: 'name' }).yes).toBeLessThanOrEqual(0.35);
  });

  it('her answer is rolled: yes, a refusal, a tip-off and cold feet all happen', async () => {
    const H = await import('../src/engine/hitHoney');
    const o = { yes: 0.5, warn: 0.1, nerve: 0.1 };
    const got = new Set([0.05, 0.3, 0.55, 0.65, 0.95].map((r) => H.honeyAnswer(o, r)));
    expect([...got].sort()).toEqual(['nerve', 'no', 'warn', 'yes']);
    // And in a real game: across many jobs, some say no and some warn him.
    const s = newGame('people-honey-roll');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    const t = Object.values(s.characters).find((c) => c.alive && c.faction === 'manno' && c.id !== r.leaderId && c.rank !== 'civilian')!;
    const w = H.honeyCandidates(s, t.id)[0].id;
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const a = H.rollHoney(s, { id: `sc${i}`, kind: 'murder', owner: 'player', ownerId: s.playerId, targetId: t.id, agents: [], opts: { depth: 'planned', honey: w, honeyPay: 'low' }, progress: 100, startWeek: 0, discovered: false, because: '' });
      if (a) seen.add(a);
    }
    expect(seen.has('no')).toBe(true);
    expect(seen.has('warn')).toBe(true);
    expect(seen.has('yes')).toBe(true);
  });
});

describe('the honey trap reads looks and appetite', () => {
  it('a ladies\' man takes the bait more than a pious, faithful one; both show in the breakdown', async () => {
    const H = await import('../src/engine/hitHoney');
    const s = newGame('people-honey-bait');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    const t = Object.values(s.characters).find((c) => c.alive && c.faction === 'manno' && c.id !== r.leaderId && c.rank !== 'civilian')!;
    const w = H.honeyCandidates(s, t.id)[0].id;
    const rake = JSON.parse(JSON.stringify(s));
    rake.characters[t.id].traits = [...rake.characters[t.id].traits.filter((x: string) => x !== 'Pious'), 'Womanizer'];
    const saint = JSON.parse(JSON.stringify(s));
    saint.characters[t.id].traits = [...saint.characters[t.id].traits.filter((x: string) => x !== 'Womanizer'), 'Pious'];
    const a = H.honeyOdds(rake, w, t.id);
    const b = H.honeyOdds(saint, w, t.id);
    expect(a.bait).toBeGreaterThan(b.bait);
    expect(a.bonus).toBeGreaterThanOrEqual(b.bonus);
    expect(a.baitReasons.map((x) => x.label).join(' ')).toMatch(/ladies' man/);
    expect(b.baitReasons.map((x) => x.label).join(' ')).toMatch(/Pious/);
  });
});
