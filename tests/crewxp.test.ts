import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { upgradeSave } from '../src/engine/upgradeSave';
import { applyEffects } from '../src/engine/effects';
import { crew, player } from '../src/engine/characters';
import { commitDirty, jobOdds } from '../src/engine/dirtyWork';
import { bonesFromScheme } from '../src/engine/bones';
import { npcFlipReasons } from '../src/engine/trialCase';
import { poachScore } from '../src/engine/crewEvents';
import { opinion } from '../src/engine/relations';
import {
  ASSOC_CAP, AUTO_WEEKS, board, ensureXp, grantXp, hasPerk, level, levelFor, MAX_LEVEL, missionXp, perksOpen, perkSlots, pickPerk, pointsOpen, promotionCandidates,
  readyToBeMade, recognizeMan, setAutoPick, suggestPerks, titleOf, WEEK_CAP, XP_AT, xpCornersMult, xpEventSource, xpHustleMult, xpOf, xpWants, xpWeek, type XpPerk,
} from '../src/engine/crewXp';
import { playWeeks, randomChoices } from './helpers';
import type { Character, GameState } from '../src/engine/types';

function game(seed = 'xp'): GameState {
  const s = newGame(seed);
  s.money = 60000;
  return s;
}
/** A man of a given rank (an associate is promoted on the spot when needed). */
function aMan(s: GameState, rank: Character['rank'] = 'soldier', not: string[] = []): Character {
  const c = crew(s).find((x) => !x.specialty && !x.outside && x.rank !== 'capo' && x.rank !== 'underboss' && x.rank !== 'consigliere' && !not.includes(x.id))!;
  c.rank = rank;
  return c;
}
const why = (s: GameState, id: string) => (xpOf(s, id)?.log ?? []).map((l) => l.why).join(' | ');
/** Push a man to a lifetime XP (whatever the weekly cap). */
function setXp(s: GameState, c: Character, xp: number): void {
  const m = (ensureXp(s).men[c.id] ??= { xp: 0, lvl: 1 });
  m.xp = xp - 1;
  m.wk = -1;
  grantXp(s, c.id, 1, 'test');
}

describe('Crew XP: levels and titles', () => {
  it('thresholds climb, the top is level 10, and an associate is held until he takes the oath', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(XP_AT[1] - 1)).toBe(1);
    expect(levelFor(XP_AT[1])).toBe(2);
    expect(levelFor(99999)).toBe(MAX_LEVEL);
    for (let i = 1; i < XP_AT.length; i++) expect(XP_AT[i] - XP_AT[i - 1]).toBeGreaterThanOrEqual(XP_AT[Math.max(1, i - 1)] - XP_AT[Math.max(0, i - 2)]);
    const s = game();
    const a = aMan(s, 'associate');
    setXp(s, a, XP_AT[6]);
    expect(level(s, a.id)).toBe(ASSOC_CAP);
    expect(titleOf(s, a)).toBe('Earner');
    expect(readyToBeMade(s, a)).toBe(true);
    expect(promotionCandidates(s).make.map((c) => c.id)).toContain(a.id);
    a.rank = 'soldier';
    grantXp(s, a.id, 1, 'test');
    expect(level(s, a.id)).toBe(7);
    expect(titleOf(s, a)).toBe('Respected');
    expect(titleOf(s, player(s))).toBe('New in the chair');
  });

  it('every award has a reason; the weekly cap holds; the dead and outsiders earn nothing', () => {
    const s = game();
    const c = aMan(s);
    expect(grantXp(s, c.id, 5, 'A clean job: a test')).toBeGreaterThan(0);
    expect(why(s, c.id)).toContain('A clean job');
    let total = 0;
    for (let i = 0; i < 10; i++) total += grantXp(s, c.id, 10, 'Big week');
    expect(total + 5).toBeLessThanOrEqual(WEEK_CAP + 1);
    expect(xpOf(s, c.id)!.log!.length).toBeLessThanOrEqual(8);
    const civ = Object.values(s.characters).find((x) => x.faction !== 'player')!;
    expect(grantXp(s, civ.id, 10, 'nope')).toBe(0);
  });
});

describe('Crew XP: what earns it', () => {
  it('dirty work: a job teaches, clean or not', () => {
    const s = game();
    const c = aMan(s);
    commitDirty(newCtx(s), { job: 'smokes', who: c.id });
    expect(why(s, c.id)).toMatch(/clean job|messy|hard way/);
    expect(xpOf(s, c.id)!.xp).toBeGreaterThan(0);
  });

  it('hits and heists: every man on the team', () => {
    const s = game();
    const a = aMan(s);
    const b = aMan(s, 'soldier', [a.id]);
    bonesFromScheme(newCtx(s), { id: 'scX', kind: 'heist', owner: 'player', ownerId: s.playerId, agents: [a.id, b.id], opts: { depth: 'planned' }, progress: 100, startWeek: 0, discovered: false, because: 'test' }, [a, b], true);
    expect(why(s, a.id)).toContain('heist');
    expect(why(s, b.id)).toContain('heist');
    const s2 = game();
    const a2 = aMan(s2);
    bonesFromScheme(newCtx(s2), { id: 'scY', kind: 'murder', owner: 'player', ownerId: s2.playerId, agents: [a2.id], opts: { depth: 'planned' }, progress: 100, startWeek: 0, discovered: false, because: 'test' }, [a2], false);
    expect(why(s2, a2.id)).toContain('hard way');
  });

  it('the envelope, the places, the lieutenants, the boss: the weekly pass', () => {
    let s = game('xp-week');
    for (let i = 0; i < 6; i++) s = advanceWeek(s, randomChoices(s, i)).state;
    const all = Object.keys(s.xp!.men).map((id) => why(s, id)).join(' | ');
    expect(all).toMatch(/Paid his envelope in full|Worked his corner/);
    expect(all).toMatch(/Ran the family another week/);
    expect(all).toMatch(/envelope came in full|short envelope|Ran /);
  });

  it('running a place; a lieutenant\'s good calls; war; New York', () => {
    const s = game();
    const c = aMan(s);
    const b = s.businesses.find((x) => x.owner === 'player')!;
    b.staffIds = [c.id];
    delete b.closedUntil;
    const k = crew(s).find((x) => x.rank === 'capo')!;
    s.briefing = { trust: {}, log: [], lt: { levels: {}, budget: {}, calls: {}, log: [{ week: s.week, day: 0, seat: 'underboss', byId: k.id, actId: 'a', domain: 'crews', text: 't', result: 'done', cost: 0, good: true }], rec: {}, hidden: [], found: [], rng: 1 } } as unknown as GameState['briefing'];
    s.wars = [{ id: 'w1', rival: s.rivals[0].id, district: s.districts[0].id, cb: 'insult' as never, sanctioned: true, score: 0, startWeek: s.week }];
    s.nyc = { crews: [{ district: 'x', capoId: k.id, soldiers: [c.id], since: 0, rackets: [] }] } as unknown as GameState['nyc'];
    const before = JSON.parse(JSON.stringify(s)) as GameState;
    xpWeek(newCtx(s), before);
    expect(why(s, c.id)).toContain(`Ran ${b.name}`);
    expect(why(s, c.id)).toContain('Working New York');
    expect(why(s, c.id)).toContain('war');
    expect(why(s, k.id)).toContain('Good calls');
    expect(why(s, k.id)).toContain('Running a crew in New York');
    // The war ends: the men who came through it.
    const b2 = JSON.parse(JSON.stringify(s)) as GameState;
    s.wars = [];
    s.week += 1;
    xpWeek(newCtx(s), b2);
    expect(why(s, c.id)).toContain('Came through the war');
  });

  it('doing time without talking; bringing a man in; the oath, and the man passed over', () => {
    const s = game();
    const c = aMan(s);
    c.imprisonedUntil = s.week + 10;
    xpWeek(newCtx(s));
    expect(xpOf(s, c.id)!.jail).toBe(s.week);
    s.week += 9;
    c.imprisonedUntil = s.week;
    xpWeek(newCtx(s));
    expect(why(s, c.id)).toContain('Did his time');

    const t = game('xp-oath');
    const voucher = aMan(t);
    const kid = aMan(t, 'associate', [voucher.id]);
    const vet = aMan(t, 'associate', [voucher.id, kid.id]);
    setXp(t, vet, XP_AT[5]);
    const before = JSON.parse(JSON.stringify(t)) as GameState;
    delete before.characters[kid.id];
    kid.vouchedBy = voucher.id;
    xpWeek(newCtx(t), before);
    expect(why(t, voucher.id)).toContain(`Brought in ${kid.firstName}`);
    // The kid takes the oath ahead of the veteran: the veteran is slighted.
    const b2 = JSON.parse(JSON.stringify(t)) as GameState;
    kid.rank = 'soldier';
    const op0 = opinion(t, vet.id, t.playerId);
    xpWeek(newCtx(t), b2);
    expect(why(t, kid.id)).toContain('Took the oath');
    expect(opinion(t, vet.id, t.playerId)).toBeLessThan(op0);
    expect(xpOf(t, vet.id)!.slight).toBe(t.week);
    expect(t.xp!.feed.some((f) => f.kind === 'slight')).toBe(true);
  });

  it('a delegated decision on a big case', () => {
    const s = game();
    const c = aMan(s);
    missionXp(s, c.id, 'Talk to the old man', true);
    expect(why(s, c.id)).toContain('big case');
  });
});

describe('Crew XP: points and specialties', () => {
  it('a made man opens a specialty at levels 3, 5, 7, 9; a point per level; points raise the skill', () => {
    const s = game();
    const c = aMan(s);
    setXp(s, c, XP_AT[2]);
    expect(level(s, c.id)).toBe(3);
    expect(perkSlots(s, c)).toBe(1);
    expect(pointsOpen(s, c)).toBe(2);
    setXp(s, c, XP_AT[8]);
    expect(perkSlots(s, c)).toBe(4);
    const a = aMan(s, 'associate', [c.id]);
    setXp(s, a, XP_AT[4]);
    expect(perkSlots(s, a)).toBe(0);
  });

  it('the popup: "made his bones — pick his specialty"; choosing applies it; the boss\'s pick is an honor', () => {
    const s = game();
    // Every man picks for himself by default now: the boss turned the family rule off to pick himself.
    ensureXp(s).auto = undefined;
    const c = aMan(s);
    setXp(s, c, XP_AT[2]);
    s.week += 1;
    const ev = xpEventSource(s)!;
    expect(ev.title).toContain(c.firstName);
    expect(ev.title).toMatch(/made his bones|come up/);
    const pick = ev.choices[0];
    expect(ev.choices.some((x) => x.id === 'own')).toBe(true);
    applyEffects(newCtx(s), pick.effects, { label: 'test', because: 'test' });
    expect(hasPerk(s, c, pick.id as XpPerk)).toBe(true);
    expect(xpOf(s, c.id)!.hon).toBe(s.week);
    // Only one popup every few weeks.
    expect(xpEventSource(s)).toBeUndefined();
  });

  it('left waiting, he picks for himself by his nature; the family rule makes it at once', () => {
    const s = game();
    ensureXp(s).auto = undefined;
    const c = aMan(s);
    c.craft = 'muscle';
    setXp(s, c, XP_AT[2]);
    xpWeek(newCtx(s));
    expect(perksOpen(s, c)).toBe(1);
    s.week += AUTO_WEEKS;
    xpWeek(newCtx(s));
    expect(perksOpen(s, c)).toBe(0);
    expect(pointsOpen(s, c)).toBe(0);
    expect(xpOf(s, c.id)!.perks![0]).toBe(suggestPerks({ ...s, xp: { ...s.xp!, men: {} } }, c)[0]);
    const t = setAutoPick(game('xp-auto'), true);
    const d = aMan(t);
    setXp(t, d, XP_AT[2]);
    xpWeek(newCtx(t));
    expect(perksOpen(t, d)).toBe(0);
  });

  it('pure edits: picking, recognizing leave the old state alone', () => {
    const s = game();
    const c = aMan(s);
    setXp(s, c, XP_AT[2]);
    const p = suggestPerks(s, c)[0];
    const t = pickPerk(s, c.id, p);
    expect(hasPerk(t, c.id, p)).toBe(true);
    expect(hasPerk(s, c.id, p)).toBe(false);
    expect(opinion(t, c.id, t.playerId)).toBeGreaterThan(opinion(s, c.id, s.playerId));
    expect(recognizeMan(t, c.id)).toBe(t); // the pick was his honor: not again so soon
    const u = recognizeMan(s, c.id);
    expect(opinion(u, c.id, u.playerId)).toBeGreaterThan(opinion(s, c.id, s.playerId));
    expect(xpOf(s, c.id)!.hon).toBeUndefined();
    // The boss never gets a perk that means nothing for him.
    const boss = player(s);
    setXp(s, boss, XP_AT[2]);
    expect(suggestPerks(s, boss)).not.toContain('bookmaker');
    expect(suggestPerks(s, boss)).not.toContain('standup');
  });
});

describe('Crew XP: specialties have real effects', () => {
  function withPerk(p: XpPerk, rank: Character['rank'] = 'soldier') {
    const s = game();
    const c = aMan(s, rank);
    setXp(s, c, XP_AT[4]);
    ensureXp(s).men[c.id].perks = [p];
    return { s, c };
  }
  it('Enforcer, Fixer, Wheelman, Safecracker, Smooth talker: the odds', () => {
    for (const [p, job, label] of [['enforcer', 'shakedown', 'Enforcer'], ['fixer', 'rigbid', 'Fixer'], ['wheelman', 'smokes', 'Wheelman'], ['safecracker', 'warehouse', 'Safecracker'], ['talker', 'fixrace', 'Smooth talker']] as const) {
      const { s, c } = withPerk(p);
      const o = jobOdds(s, job, c.id);
      expect(o.reasons.find((r) => r.label === label)?.value, p).toBeGreaterThan(0);
      ensureXp(s).men[c.id].perks = [];
      expect(jobOdds(s, job, c.id).chance, p).toBeLessThanOrEqual(o.chance);
    }
    const { s, c } = withPerk('enforcer');
    expect(jobOdds(s, 'shakedown', c.id).reasons.some((r) => /experience/.test(r.label))).toBe(true);
  });

  it('Iron jaw: far less likely to flip; Ghost: half the evidence; Rainmaker and Bookmaker: the money; Taskmaster: the corners', () => {
    const j = withPerk('ironjaw');
    expect(npcFlipReasons(j.s, j.c, 40, false).find((r) => /Iron jaw/.test(r.label))?.value).toBeLessThan(0);
    const g = withPerk('ghost');
    g.c.evidence = 10;
    const ev0 = g.c.evidence;
    g.s.week = 2 * Math.ceil(g.s.week / 2);
    xpWeek(newCtx(g.s));
    expect(g.c.evidence).toBeLessThan(ev0);
    expect(xpHustleMult(withPerk('bookmaker').s, withPerk('bookmaker').c)).toBeCloseTo(1.15);
    const r = withPerk('rainmaker');
    expect(xpHustleMult(r.s, r.c)).toBeCloseTo(1.1);
    const k = withPerk('taskmaster', 'capo');
    expect(xpCornersMult(k.s, k.c)).toBeCloseTo(1.08);
  });

  it('Stand-up guy: nobody can court him; an unrewarded veteran is a target, a rewarded one less so', () => {
    const st = withPerk('standup');
    expect(poachScore(st.s, st.c)).toBe(0);
    const s = game();
    const c = aMan(s);
    const base = poachScore(s, c);
    setXp(s, c, XP_AT[6]);
    ensureXp(s).men[c.id].at = s.week - 40;
    expect(poachScore(s, c)).toBeGreaterThan(base);
    const t = recognizeMan(s, c.id);
    expect(poachScore(t, t.characters[c.id])).toBeLessThan(poachScore(s, c));
  });
});

describe('Crew XP: the drama', () => {
  it('a veteran wants recognition, a bigger end, a crew of his own', () => {
    const s = game();
    const c = aMan(s);
    setXp(s, c, XP_AT[6]);
    const keys = xpWants(s, c).map((w) => w.key);
    expect(keys).toEqual(expect.arrayContaining(['xp-recognition', 'xp-end', 'xp-crew']));
    const t = recognizeMan(s, c.id);
    expect(xpWants(t, t.characters[c.id]).find((w) => w.key === 'xp-recognition')?.met).toBe(true);
  });

  it('envy between two men of the same standing; rivals court the best men nobody rewards', () => {
    const s = game('xp-envy');
    const k = crew(s).find((x) => x.rank === 'capo')!;
    const a = aMan(s);
    const b = aMan(s, 'soldier', [a.id]);
    a.capoId = k.id;
    b.capoId = k.id;
    setXp(s, a, XP_AT[4]);
    setXp(s, b, XP_AT[4]);
    let envied = false;
    for (let i = 0; i < 24 && !envied; i++) {
      s.week += 4;
      ensureXp(s).men[a.id].hon = s.week;
      delete ensureXp(s).men[b.id].hon;
      s.xp!.mon = 'x';
      xpWeek(newCtx(s));
      envied = s.xp!.stats.envy > 0;
    }
    expect(envied).toBe(true);
    expect(opinion(s, b.id, a.id)).toBeLessThan(0);

    const t = game('xp-poach');
    const p = aMan(t);
    setXp(t, p, XP_AT[6]);
    let courted = false;
    for (let i = 0; i < 40 && !courted; i++) {
      t.week += 4;
      ensureXp(t).men[p.id].at = t.week - 40;
      t.xp!.mon = 'x';
      xpWeek(newCtx(t));
      courted = !!p.courtedBy;
    }
    expect(courted).toBe(true);
    expect(t.xp!.stats.poached).toBeGreaterThan(0);
  });

  it('the board sorts by level, earning, loyalty and marks who is ready', () => {
    const s = game();
    const c = aMan(s, 'associate');
    setXp(s, c, XP_AT[3]);
    const rows = board(s, 'level');
    expect(rows[0].c.id).toBe(c.id);
    expect(rows[0].ready).toBe('made');
    const byLoyalty = board(s, 'loyalty');
    for (let i = 1; i < byLoyalty.length; i++) expect(byLoyalty[i - 1].loyalty).toBeGreaterThanOrEqual(byLoyalty[i].loyalty);
  });
});

describe('Crew XP: saves', () => {
  it('a save without XP loads unchanged; a save with it round-trips; deterministic; bounded', () => {
    const s = newGame('xp-save');
    const u = upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(u.xp).toBeUndefined();
    const a = playWeeks('xp-det', 30);
    const b = playWeeks('xp-det', 30);
    expect(JSON.stringify(a.xp)).toBe(JSON.stringify(b.xp));
    const r = upgradeSave(JSON.parse(JSON.stringify(a)));
    expect(JSON.stringify(r.xp)).toBe(JSON.stringify(a.xp));
    expect(a.xp!.feed.length).toBeLessThanOrEqual(30);
    for (const m of Object.values(a.xp!.men)) expect((m.log ?? []).length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(a.xp).length).toBeLessThan(40000);
    // Only the living men of the family are kept.
    for (const id of Object.keys(a.xp!.men)) expect(a.characters[id]?.alive).toBe(true);
  }, 120000);
});

describe('Crew XP: the screens', () => {
  it('the board, the sheet section and the badge render; the board is on the Family menu', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { ProgressBoard, XpSection, XpBadge } = await import('../src/ui/borgata/CrewXp');
    const { NAV } = await import('../src/ui/shell/nav');
    const s = game('xp-ui');
    const c = aMan(s);
    setXp(s, c, XP_AT[4]);
    const html = renderToString(createElement(ProgressBoard, { s }));
    expect(html).toContain('xp-board');
    expect(html).toContain(c.lastName);
    expect(html).toContain('Waiting on your word');
    const sheet = renderToString(createElement(XpSection, { s, c }));
    expect(sheet).toContain('sheet-xp');
    expect(sheet).toContain('xp-perks');
    expect(renderToString(createElement(XpBadge, { s, c }))).toMatch(/Lv (<!-- -->)?5/);
    expect(NAV.family.flatMap((g) => g.items).some((i) => i.keys.includes('borgata.progress'))).toBe(true);
   }, 60000);
});
