import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { upgradeSave } from '../src/engine/upgradeSave';
import { timeCost } from '../src/engine/timeCost';
import { opinion, getRelation } from '../src/engine/relations';
import { visitRisks } from '../src/engine/visit';
import { ensureDating } from '../src/engine/datingState';
import { ageOn } from '../src/engine/calendar';
import {
  activeGuards, applyProtectOp, assignmentsFor, canSee, createGuard, createInquiry, discovered, ensureProtect, findingsAbout, guardAttrs, isMinor,
  npcAssignments, protectionFor, protectLog, recommendGuards, reportIn, reportsAbout, reportsFor, travelCover, type ProtectAction,
} from '../src/engine/protect';
import { KID_LINES, MAX_CUT, TEEN_LINES } from '../src/engine/protectData';
import type { Character, GameState, PlayerAction } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;
const P = (op: ProtectAction): PlayerAction => ({ kind: 'protect', op });
const men = (s: GameState, rank: string) => Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.rank === rank).sort((a, b) => a.id.localeCompare(b.id));
const week = (s: GameState, actions: PlayerAction[] = []) => advanceWeek(s, { actions });

function setup() {
  const s = newGame('protect');
  const boss = s.characters[s.playerId];
  const wife = s.characters[boss.spouseId!];
  const [g1, g2, g3] = men(s, 'soldier');
  const capo = men(s, 'capo')[0];
  return { s, boss, wife, g1, g2, g3, capo };
}

describe('protection & intelligence: the working example', () => {
  it('a guard on the boss, another on his wife; wages weekly; double-booking refused; risk down, never zero', () => {
    const { s: s0, wife, g1, g2 } = setup();
    const a1 = P({ op: 'guard', subject: s0.playerId, who: [g1.id], kind: 'bodyguard', shift: 'around', weeks: 10 });
    const a2 = P({ op: 'guard', subject: wife.id, who: [g2.id], kind: 'driver', shift: 'day', weeks: 10, reportsTo: 'both' });
    expect(previewAction(s0, a1).disabledReason).toBeUndefined();
    const before = protectionFor(s0, s0.playerId).cut;
    expect(before).toBe(0);
    const r1 = week(s0, [a1, a2]);
    let s = r1.state;
    const live = assignmentsFor(s).filter((a) => a.status === 'active');
    expect(live.length).toBe(2);
    expect(activeGuards(s, s.playerId).map((x) => x.guard.id)).toEqual([g1.id]);
    expect(activeGuards(s, wife.id).map((x) => x.guard.id)).toEqual([g2.id]);
    // The wages are on the books every week, paid to the men.
    const wages = (lines: { label: string; amount: number; stat: string }[]) => lines.filter((l) => l.stat === 'money' && l.label.startsWith('Bodyguards:')).reduce((t, l) => t + l.amount, 0);
    const bill = live.reduce((t, a) => t + a.wage, 0);
    expect(bill).toBeGreaterThan(0);
    expect(wages(r1.report.lines)).toBe(-bill);
    const r2 = week(s);
    s = r2.state;
    expect(wages(r2.report.lines)).toBe(-bill);
    // Paid into the men's own pockets, through the weekly journal.
    expect(s.tribute!.books.at(-1)!.x.some((x) => x[1] === `wealth:${g1.id}` && x[3] === 'expense')).toBe(true);
    // Off his other work.
    expect((s.characters[g1.id].busyUntil ?? 0)).toBeGreaterThan(s.week);
    // The same man cannot be booked twice on overlapping hours.
    const dbl = previewAction(s, P({ op: 'guard', subject: wife.id, who: [g1.id], kind: 'escort', shift: 'day', weeks: 4 }));
    expect(dbl.disabledReason).toMatch(/double-booked/);
    // Protection is a share off the danger, never all of it, wherever the danger comes from.
    const cut = protectionFor(s, s.playerId).cut;
    expect(cut).toBeGreaterThan(0);
    expect(cut).toBeLessThanOrEqual(MAX_CUT);
    expect(protectionFor(s, wife.id).cut).toBeGreaterThan(0);
    // Days only: no cover at night.
    expect(protectionFor(s, wife.id, 'night').cut).toBe(0);
    const bare = clone(s);
    delete bare.protect;
    const withG = visitRisks(s, 'nyc', 'cars', 0).ambush;
    const without = visitRisks(bare, 'nyc', 'cars', 0).ambush;
    expect(withG).toBeLessThan(without);
    expect(withG).toBeGreaterThan(0);
    expect(travelCover(s)).toBeGreaterThan(0);
  });

  it('the adviser recommends a man and names the trade-off; guard attributes come from his own', () => {
    const { s, wife, g1 } = setup();
    const recs = recommendGuards(s, wife.id, 'day', 3);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].line).toMatch(/\./);
    expect(recs[0].adviser?.rank).toBe('underboss');
    const g = guardAttrs(s, g1);
    for (const k of ['awareness', 'composure', 'judgment', 'discretion', 'reliability', 'loyalty', 'physical'] as const) { expect(g[k]).toBeGreaterThanOrEqual(0); expect(g[k]).toBeLessThanOrEqual(100); }
    // A man who drives for his capo leaves him without a driver.
    const driver = clone(s);
    driver.characters[g1.id].craft = 'driver';
    const r = recommendGuards(driver, wife.id, 'day', 30).find((x) => x.guard.id === g1.id);
    expect(r?.line).toMatch(/needs another driver|you need another driver/);
  });

  it('investigating a capo\'s financial discrepancy: uncertain reports, grounded only in what is really there', () => {
    const { s: s0, capo, g3 } = setup();
    const s1 = clone(s0);
    s1.characters[capo.id].skimmed = 2400;
    delete s1.characters[capo.id].arrears;
    if (s1.tribute?.life) delete s1.tribute.life[capo.id];
    let s = week(s1, [P({ op: 'investigate', subject: capo.id, purpose: 'money', who: g3.id, weeks: 12 })]).state;
    for (let i = 0; i < 12; i++) s = week(s).state;
    const reps = reportsAbout(s, capo.id);
    expect(reps.length).toBeGreaterThan(0);
    const got = reps.find((r) => r.grounds.some((g) => g.src === 'skimmed'));
    expect(got, JSON.stringify(reps.map((r) => r.observation))).toBeDefined();
    // Observation apart from interpretation, with confidence, source, alternatives, the subject's knowledge, advice.
    expect(got!.observation).not.toBe(got!.interpretation);
    expect(['low', 'moderate']).toContain(got!.confidence);
    expect(got!.alternatives.length).toBeGreaterThan(0);
    expect(['no', 'suspects', 'yes']).toContain(got!.subjectKnows);
    expect(got!.advice.length).toBeGreaterThan(10);
    expect(got!.source).toContain(g3.firstName);
    // Nothing is manufactured: a clean capo gives nothing grounded but his own clean record.
    const clean = clone(s0);
    for (const k of Object.values(clean.characters)) { delete k.skimmed; delete k.arrears; delete k.debtTo; }
    if (clean.tribute) clean.tribute.life = {};
    expect(findingsAbout(clean, capo.id, 'money')).toEqual([]);
    const ctx = newCtx(clean);
    const asg = createInquiry(ctx, capo.id, 'money', g3.id, 6, clean.playerId, [clean.playerId]);
    clean.week += 6;
    const rep = reportIn(ctx, asg, true)!;
    expect(rep.status).toBe('inconclusive');
    expect(rep.grounds).toEqual([]);
    // Every received report in the long run rests on something real (or says plainly it is someone's say-so).
    for (const r of reportsFor(s)) if (r.status === 'received' && r.purpose !== 'guard') expect(r.grounds.length > 0 || r.falseClaim).toBe(true);
  });

  it('a false claim from a man with a grudge says whose word it is', () => {
    const { s, capo, g3 } = setup();
    for (const k of Object.values(s.characters)) { delete k.skimmed; delete k.arrears; delete k.debtTo; }
    if (s.tribute) s.tribute.life = {};
    s.relations[`${g3.id}>${capo.id}`] = { from: g3.id, to: capo.id, modifiers: [{ id: 'mx', reason: 'Old beef', value: -60, decay: 0, week: 0 }], fear: 0, trust: 0, grievance: 70 };
    const ctx = newCtx(s);
    const asg = createInquiry(ctx, capo.id, 'money', g3.id, 8, s.playerId, [s.playerId]);
    let claim;
    for (let i = 0; i < 12 && !claim; i++) { s.week += 2; const r = reportIn(ctx, asg); if (r?.falseClaim) claim = r; }
    expect(claim).toBeDefined();
    expect(claim!.grounds).toEqual([]);
    expect(claim!.reliability).toBe('shaky');
    expect(claim!.alternatives.join(' ')).toMatch(/grudge/);
  });

  it('intrusive monitoring found out: trust and opinion fall; a guard on safety only costs nothing of the kind', () => {
    const { s, wife, g2 } = setup();
    const ctx = newCtx(s);
    const a = createGuard(ctx, { op: 'guard', subject: wife.id, who: [g2.id], kind: 'driver', shift: 'day', weeks: 10, remit: 'monitor' }, s.playerId, 'agreed', 70);
    const op0 = opinion(s, wife.id, s.playerId);
    const tr0 = getRelation(s, wife.id, s.playerId)?.trust ?? 30;
    discovered(ctx, a);
    expect(a.known).toBe(s.week);
    expect(opinion(s, wife.id, s.playerId)).toBeLessThan(op0);
    expect(getRelation(s, wife.id, s.playerId)!.trust).toBeLessThan(tr0);
    expect(opinion(s, wife.id, g2.id)).toBeLessThan(0);
    expect(protectLog(s).some((l) => /found out/.test(l.t))).toBe(true);
  });

  it('"She Asked Me Not to Tell You": the guard knows something private and real; the answer decides his job', () => {
    const { s: s0, wife, g2 } = setup();
    // Something private that really exists: her own secret.
    s0.secrets.push({ id: 'xs1', ownerId: wife.id, kind: 'debt', text: `${wife.firstName} owes a dressmaker more than she has said`, knownBy: [], week: 0 });
    let s = week(s0, [P({ op: 'guard', subject: wife.id, who: [g2.id], kind: 'driver', shift: 'day', weeks: 30 })]).state;
    let found;
    for (let i = 0; i < 25 && !found; i++) {
      found = s.pendingEvents.find((e) => e.defId === 'protect_asked');
      if (!found) s = week(s).state;
    }
    expect(found, 'the event comes').toBeDefined();
    expect(found!.choices.map((c) => c.id)).toEqual(['safety', 'tell', 'ask']);
    // Tell me: he reports on her now, and you read what she asked him to keep.
    const t = clone(s);
    const asg = t.protect!.asg.find((x) => x.subjects[0] === wife.id && x.status === 'active')!;
    applyProtectOp(newCtx(t), { op: 'asked', id: asg.id, choice: 'tell' });
    const told = t.protect!.asg.find((x) => x.id === asg.id)!;
    expect(told.remit).toBe('monitor');
    const rep = reportsAbout(t, wife.id).at(-1)!;
    expect(rep.grounds[0]).toEqual({ src: 'secret', ref: 'xs1' });
    expect(rep.access).toEqual([t.playerId]);
    // Her safety only: he keeps it, she trusts him more, you learn nothing.
    const k = clone(s);
    const n0 = reportsAbout(k, wife.id).length;
    applyProtectOp(newCtx(k), { op: 'asked', id: asg.id, choice: 'safety' });
    expect(k.protect!.asg.find((x) => x.id === asg.id)!.remit).toBe('safety');
    expect(reportsAbout(k, wife.id).length).toBe(n0);
    expect(opinion(k, wife.id, g2.id)).toBeGreaterThan(opinion(s, wife.id, g2.id));
  });
});

describe('protection & intelligence: the rules', () => {
  it('children: guardian-approved safety only, never looked into, and only age-appropriate events', () => {
    const { s: s0, g1 } = setup();
    const boss = s0.characters[s0.playerId];
    const kid = s0.characters[boss.childrenIds.find((id) => ageOn(s0.characters[id].birth, s0.date) < 12)!];
    expect(isMinor(s0, kid)).toBe(true);
    expect(previewAction(s0, P({ op: 'guard', subject: kid.id, who: [g1.id], kind: 'family', shift: 'day', weeks: 8, remit: 'monitor' })).disabledReason).toMatch(/child/);
    expect(previewAction(s0, P({ op: 'investigate', subject: kid.id, purpose: 'personal', who: g1.id, weeks: 4 })).disabledReason).toMatch(/child/);
    const ok = P({ op: 'guard', subject: kid.id, who: [g1.id], kind: 'family', shift: 'day', weeks: 40 });
    expect(previewAction(s0, ok).disabledReason).toBeUndefined();
    let s = week(s0, [ok]).state;
    const asg = s.protect!.asg[0];
    expect(asg.consent).toBe('guardian');
    expect(asg.remit).toBe('safety');
    for (let i = 0; i < 30; i++) s = week(s).state;
    const lines = (s.protect?.log ?? []).filter((l) => l.kid);
    expect(lines.length).toBeGreaterThan(0);
    const allowed = [...KID_LINES, ...TEEN_LINES].map((t) => new RegExp(`^${t.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{g\}|\{k\}/g, '[\\w\' -]+')}$`));
    for (const l of lines) expect(allowed.some((re) => re.test(l.t)), l.t).toBe(true);
    expect((s.protect?.reports ?? []).filter((r) => r.subject === kid.id)).toEqual([]);
    expect(s.pendingEvents.concat(s.eventQueue).filter((e) => e.defId.startsWith('protect_') && (e.actors ?? []).includes(kid.id))).toEqual([]);
  });

  it('following a woman for romantic interest gives no attraction, does not undo a no, and frightens her when found out', () => {
    const { s, g3 } = setup();
    const her = Object.values(s.characters).find((c) => c.alive && c.gender === 'F' && c.faction !== 'player' && !c.dynasty && ageOn(c.birth, s.date) >= 21 && ageOn(c.birth, s.date) <= 45) as Character;
    expect(her).toBeDefined();
    const D = ensureDating(s);
    D.bonds[her.id] = { id: her.id, aff: 30, rung: 'acquaintance', dates: 0, since: 0, gifts: [], via: 'test', no: { week: 0, what: 'a date' } } as never;
    const before = { ...D.bonds[her.id] };
    const op0 = opinion(s, her.id, s.playerId);
    const ctx = newCtx(s);
    const asg = createInquiry(ctx, her.id, 'romance', g3.id, 6, s.playerId, [s.playerId]);
    for (let i = 0; i < 3; i++) { s.week += 2; reportIn(ctx, asg); }
    expect(D.bonds[her.id].aff).toBeLessThanOrEqual(before.aff);
    expect(D.bonds[her.id].rung).toBe(before.rung);
    for (const r of reportsAbout(s, her.id)) expect(r.observation + r.interpretation).not.toMatch(/likes you|attracted|interested in you/i);
    discovered(ctx, asg);
    expect(D.bonds[her.id].aff).toBeLessThan(before.aff);
    expect(D.bonds[her.id].rung).toBe('acquaintance');
    expect(D.bonds[her.id].no?.what).toMatch(/followed/);
    expect(opinion(s, her.id, s.playerId)).toBeLessThan(op0);
    expect(getRelation(s, her.id, s.playerId)!.fear).toBeGreaterThan(0);
    expect(asg.status).toBe('ended');
  });

  it('reports are shown only to those with access: the underboss\'s own inquiry stays his', () => {
    const { s, capo, g3 } = setup();
    s.characters[capo.id].skimmed = 3000;
    const ub = s.characters[s.council.underboss.holderId!];
    const ctx = newCtx(s);
    const asg = createInquiry(ctx, capo.id, 'money', g3.id, 8, ub.id, [ub.id], true);
    expect(canSee(s, asg, s.playerId)).toBe(false);
    expect(canSee(s, asg, ub.id)).toBe(true);
    let rep;
    for (let i = 0; i < 8 && !rep; i++) { s.week += 2; rep = reportIn(ctx, asg); }
    expect(rep).toBeDefined();
    expect(rep!.access).toEqual([ub.id]);
    expect(reportsFor(s, s.playerId)).toEqual([]);
    expect(reportsFor(s, ub.id).length).toBeGreaterThan(0);
    expect(protectLog(s, s.playerId).some((l) => l.who.includes(capo.id))).toBe(false);
  });

  it('NPCs make their own: a threatened capo puts one of his men on himself', () => {
    const { s } = setup();
    const capo = men(s, 'capo').find((k) => men(s, 'soldier').concat(men(s, 'associate')).some((m) => m.capoId === k.id))!;
    s.characters[capo.id].wealth = 20000;
    const rival = s.rivals.find((r) => r.kind === 'mob')!;
    s.schemes.push({ id: 'sc-test', kind: 'murder', owner: rival.id, ownerId: rival.leaderId, targetId: capo.id, agents: [], opts: { depth: 'planned' }, progress: 10, startWeek: 0, discovered: false, because: 'test' } as never);
    let made;
    for (let m = 0; m < 12 && !made; m++) {
      s.week = 1 + m * 4;
      npcAssignments(newCtx(s));
      made = s.protect?.asg.find((a) => a.by === capo.id);
    }
    expect(made).toBeDefined();
    expect(made!.subjects).toEqual([capo.id]);
    expect(protectionFor(s, capo.id).cut).toBeGreaterThan(0);
    expect(ensureProtect(s).stats.npc).toBeGreaterThan(0);
  });

  it('orders take the boss\'s time; the state saves and loads; old saves are untouched', () => {
    const { s: s0, g1 } = setup();
    expect(timeCost(P({ op: 'guard', subject: s0.playerId, who: [g1.id], kind: 'bodyguard', shift: 'day', weeks: 4 }))).toBe(0.5);
    expect(timeCost(P({ op: 'end', id: 'x' }))).toBe(0.25);
    // An old save (no protect) loads unchanged, and a week with nobody guarded leaves it unmade.
    const old = clone(s0);
    expect(upgradeSave(clone(old))).toEqual(old);
    expect(week(old).state.protect).toBeUndefined();
    let s = week(s0, [P({ op: 'guard', subject: s0.playerId, who: [g1.id], kind: 'bodyguard', shift: 'around', weeks: 6 })]).state;
    s = week(s).state;
    const round = clone(s);
    expect(round).toEqual(s);
    expect(upgradeSave(clone(round))).toEqual(s);
    // The same choices give the same game.
    const again = week(round).state;
    expect(week(clone(s)).state.protect).toEqual(again.protect);
  });
});

describe('protection & intelligence: the screens', () => {
  it('the central screen lists assignments, reports (observation, interpretation, confidence) and both windows; the sheet has Assign protection', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { Protection, ProtectSection } = await import('../src/ui/borgata/Protection');
    const { s, wife, capo, g1, g3 } = setup();
    s.characters[capo.id].skimmed = 2000;
    const ctx = newCtx(s);
    createGuard(ctx, { op: 'guard', subject: wife.id, who: [g1.id], kind: 'driver', shift: 'day', weeks: 8 }, s.playerId, 'agreed', 70);
    const asg = createInquiry(ctx, capo.id, 'money', g3.id, 8, s.playerId, [s.playerId]);
    for (let i = 0; i < 8 && !reportsFor(s).length; i++) { s.week += 2; reportIn(ctx, asg); }
    const html = renderToString(createElement(Protection, { s }));
    expect(html).toContain('data-testid="protection"');
    expect(html).toContain('data-testid="protect-asg"');
    expect(html).toContain('data-testid="assign-protection"');
    expect(html).toContain('data-testid="assign-inquiry"');
    expect(html).toContain('data-testid="protect-rec"');
    expect(html).toContain('data-testid="protect-report"');
    for (const w of ['Observation:', 'Interpretation:', 'Confidence:', 'Source:', 'What you can conclude:', 'Adviser&#x27;s recommendation']) expect(html).toContain(w);
    const sheet = renderToString(createElement(ProtectSection, { s, c: s.characters[wife.id] }));
    expect(sheet).toContain('data-testid="sheet-assign-protection"');
    expect(sheet).toContain(`Guarded by ${g1.firstName}`);
  });
});
