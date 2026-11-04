import { ageOn } from './calendar';
import { courtWord } from './matchmakers';
import { capos, crew, displayName, isFree, player } from './characters';
import { buildFactionDemand } from './crewlife';
import { applyEffects } from './effects';
import { regime } from './hierarchy';
import { ensureIntrigue, pairKey } from './intrigueState';
import type { Ctx } from './ledger';
import { believe, startRumor } from './minds/beliefs';
import { ensureMinds } from './minds/state';
import type { AmbitionKind, Mind } from './minds/types';
import { pwView } from './powerState';
import { addOpinion, opinion } from './relations';
import { chance, hashSeed, pick, rand, randInt, shuffle } from './rng';
import { claimants, sidelined, support } from './shadow';
import { ensureShadow, shadowView } from './shadowState';
import { SCENES_BY_ID } from './authored/library';
import { buildScene, castScene } from './authored/run';
import { ensureDeeds } from './deeds/state';
import type { Character, EventInstance, Faction, GameState, RivalId } from './types';

/**
 * THE OLD DON (1960): the recommended start's own layer.
 *
 * Ten years in the chair, rich, loved on the island, and everyone is posting
 * up. This file keeps the start's HIDDEN HANDS (who is really moving, and
 * who only looks like it), the fog over how big the coming move is, the
 * opening weeks' scheduled scenes (scenes/olddon.json and the conspiracy
 * chain), the succession's claim strengths, and the verdict on the first year.
 *
 * Nothing here moves against the boss by itself: every real plot escalates
 * only through the game's existing systems, each with its own warnings (a
 * faction's demand, then an ultimatum, then Philadelphia, then a coup; a
 * rival's planned move with tips at the urgent meetings; an informant the
 * consigliere can find). A man of the boss's is never handed over or killed
 * except by a choice the boss makes himself.
 *
 * Lives on `GameState.oldDon` (only this start has it); its dice are its own.
 */

/** Who is moving (or seems to be). Hostile roles: capo, ub, young, rival, sal, rat, kman. Loyal: cons, old, wife. */
export type HandRole = 'capo' | 'ub' | 'young' | 'rival' | 'sal' | 'rat' | 'kman' | 'cons' | 'old' | 'wife';
export const HOSTILE_ROLES: HandRole[] = ['capo', 'ub', 'young', 'rival', 'sal', 'rat', 'kman'];
export const LOYAL_ROLES: HandRole[] = ['cons', 'old', 'wife'];

export interface Hand {
  role: HandRole;
  /** The man (or woman) behind it. */
  id?: string;
  rival?: RivalId;
  /** The truth: really against the boss (never shown until proven). */
  real: boolean;
  /** Men he could bring to the move. */
  men: number;
  /** What the boss knows: 0 nothing, 1 a whisper, 2 a rumor with a name, 3 proof. */
  know: 0 | 1 | 2 | 3;
  /** The boss's own odds that it is real (0-100). */
  belief: number;
  /** Week it was defused. */
  x?: number;
  /** Week it escalated into an existing system. */
  fired?: number;
}

export interface OdAgenda { scene: string; at: number; cast: Record<string, string> }

export type YearOutcome = 'own_terms' | 'holding' | 'retired' | 'pushed' | 'dead';

export interface OldDonState {
  v: 1;
  rng: number;
  /** The old Don himself, and the week the start began. */
  donId: string;
  w0: number;
  hands: Hand[];
  /** Week the big move comes (if the men behind it are still in it). */
  due: number;
  youngAt: number;
  salAt: number;
  /** How much the talk on Pacific Avenue inflates the move (rumors run hot). */
  bias: number;
  agenda: OdAgenda[];
  coups0: number;
  /** The true size of the move when it came, and what the boss had heard. */
  landed?: { week: number; men: number; lo: number; hi: number };
  year?: { week: number; outcome: YearOutcome; text: string; heirId?: string };
  /** The fallout after the chair changed hands. */
  fallout?: number;
}

export const YEAR_WEEKS = 52;

export function oldDonOf(s: GameState): OldDonState | undefined {
  return s.oldDon;
}

export function hand(s: GameState, role: HandRole): Hand | undefined {
  return s.oldDon?.hands.find((h) => h.role === role);
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const alive = (s: GameState, id?: string) => !!id && !!s.characters[id]?.alive;

/* ------------------------------------------------------------------ */
/* Setup (starts.ts calls it once the crew is in place)                 */
/* ------------------------------------------------------------------ */

function mindFor(s: GameState, c: Character, amb?: AmbitionKind): Mind {
  const M = ensureMinds(s);
  const m: Mind = M.minds[c.id] ?? { id: c.id, sat: [], mood: 'content', mv: 0, goals: [], bel: {}, facts: [], mem: [], why: [], th: s.week - 1 };
  if (amb) m.amb = { k: amb, p: amb === 'chair' ? 25 : 10, w: s.week };
  const op = opinion(s, c.id, s.playerId);
  m.bel[s.playerId] = { t: Math.round(op / 2), tc: 0.4, u: s.week };
  M.minds[c.id] = m;
  return m;
}

/**
 * Deal the hidden hands. At least three really hostile, the consigliere,
 * the old capo and the wife really loyal; who is who varies by seed, and
 * every hand starts as a whisper at most.
 */
export function seedOldDon(s: GameState, opts: { kmanId?: string } = {}): OldDonState {
  const od: OldDonState = { v: 1, rng: hashSeed(`${s.seed}:olddon`), donId: s.playerId, w0: s.week, hands: [], due: 0, youngAt: 0, salAt: 0, bias: 1, agenda: [], coups0: s.crewStats?.coups ?? 0 };
  s.oldDon = od;
  const boss = player(s);
  const ub = crew(s).find((c) => c.rank === 'underboss');
  const cons = crew(s).find((c) => c.rank === 'consigliere');
  const ks = capos(s).filter((c) => !c.dynasty).sort((a, b) => a.id.localeCompare(b.id));
  const [kCapo, kYoung, kOld] = shuffle(od, ks);
  const rivalId: RivalId = chance(od, 0.55) ? 'kessler' : 'manno';
  const real: Record<string, boolean> = {
    capo: chance(od, 0.7), ub: chance(od, 0.55), young: chance(od, 0.7), rival: chance(od, 0.55), sal: chance(od, 0.5), rat: chance(od, 0.55),
  };
  // Every year has pressure: at least three real hands.
  const order = shuffle(od, ['capo', 'young', 'rival', 'ub', 'sal', 'rat']);
  for (const k of order) if (Object.values(real).filter(Boolean).length < 3) real[k] = true;
  const belief = (r: boolean) => clamp((r ? 42 : 30) + randInt(od, 0, 28));
  const add = (h: Omit<Hand, 'know' | 'belief'> & { know?: Hand['know']; belief?: number }) => {
    od.hands.push({ know: 0, belief: belief(h.real), ...h });
  };

  /* -- the people -- */
  if (kCapo) {
    kCapo.traits = ['Ambitious', 'Charming', real.capo ? 'Greedy' : 'Patient'];
    kCapo.birth = { ...kCapo.birth, y: s.date.y - randInt(od, 44, 50) };
    kCapo.ambition = 'Sit in the chair when the old man goes';
    addOpinion(s, kCapo.id, boss.id, real.capo ? 'The old man is yesterday' : 'The old man is a little slow these days', real.capo ? -18 : -6, 0);
    if (real.capo) kCapo.courtedBy = { rival: 'philly', week: s.week };
    add({ role: 'capo', id: kCapo.id, real: real.capo, men: regime(s, kCapo.id).length + 1 + (real.sal ? 3 : 0), know: 1 });
    mindFor(s, kCapo, real.capo ? 'chair' : 'capo');
  }
  if (ub) {
    ub.traits = real.ub ? ['Patient', 'Ambitious', 'Charming'] : ['Patient', 'Honest'];
    ub.birth = { ...ub.birth, y: s.date.y - randInt(od, 50, 56) };
    ub.ambition = real.ub ? 'Be the man in the room when the chair is empty' : 'Keep the family whole';
    addOpinion(s, ub.id, boss.id, 'Ten years of running things for him', real.ub ? 2 : 14, 0);
    add({ role: 'ub', id: ub.id, real: real.ub, men: randInt(od, 2, 4) });
    mindFor(s, ub, real.ub ? 'chair' : 'keep');
  }
  if (kYoung) {
    kYoung.traits = ['Hot-headed', 'Greedy', 'Ambitious'];
    kYoung.birth = { ...kYoung.birth, y: s.date.y - randInt(od, 31, 35) };
    kYoung.ambition = 'Make real money while the old man counts nickels';
    addOpinion(s, kYoung.id, boss.id, 'An old man\'s rules: no narcotics', real.young ? -16 : -4, 0);
    for (const m of regime(s, kYoung.id)) {
      m.birth = { ...m.birth, y: s.date.y - randInt(od, 21, 29) };
      addOpinion(s, m.id, boss.id, 'An old man\'s rules: no narcotics', -10, 0);
    }
    add({ role: 'young', id: kYoung.id, real: real.young, men: regime(s, kYoung.id).length + 1, know: 1 });
    mindFor(s, kYoung, 'rich');
  }
  if (kOld) {
    kOld.traits = ['Loyal-to-a-fault', 'Patient'];
    kOld.birth = { ...kOld.birth, y: s.date.y - randInt(od, 71, 74) };
    kOld.health = Math.min(kOld.health, randInt(od, 38, 50));
    kOld.ambition = 'Die in his own bed, with the old man still in the chair';
    addOpinion(s, kOld.id, boss.id, 'We came up together on Pacific Avenue', 30, 0);
    add({ role: 'old', id: kOld.id, real: false, men: 0 });
    mindFor(s, kOld, 'keep');
  }
  if (cons) {
    cons.traits = ['Loyal-to-a-fault', 'Paranoid'];
    cons.birth = { ...cons.birth, y: s.date.y - randInt(od, 68, 71) };
    cons.ambition = 'See the old man out the right way';
    addOpinion(s, cons.id, boss.id, 'Thirty years at his side', 30, 0);
    add({ role: 'cons', id: cons.id, real: false, men: 0 });
    mindFor(s, cons, 'keep');
  }
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife?.alive) {
    add({ role: 'wife', id: wife.id, real: false, men: 0 });
    mindFor(s, wife);
  }
  const rv = s.rivals.find((r) => r.id === rivalId);
  if (rv) {
    add({ role: 'rival', rival: rivalId, id: rv.leaderId, real: real.rival, men: randInt(od, 5, 9), know: 1 });
    addOpinion(s, rv.leaderId, boss.id, real.rival ? 'The old man is soft; his ground is ripe' : 'An old man who keeps the peace', real.rival ? -15 : 0, 0);
    if (real.rival) rv.goal = 'conquer';
  }
  const philly = s.rivals.find((r) => r.id === 'philly');
  if (philly) {
    add({ role: 'sal', id: philly.leaderId, rival: 'philly', real: real.sal, men: 4, know: 1 });
    addOpinion(s, philly.leaderId, boss.id, real.sal ? 'Too old for the chair; who comes next?' : 'Ten years of envelopes, never light', real.sal ? -8 : 10, 0);
    const sh = ensureShadow(s);
    sh.rivals.philly = { stance: real.sal ? 'court' : 'probe', ...(kCapo ? { favor: real.sal ? kCapo.id : ub?.id } : {}), thinks: 50, w: s.week, moves: real.sal ? 2 : 0 };
  }
  const assocs = crew(s).filter((c) => c.rank === 'associate' && !c.dynasty && c.capoId !== kYoung?.id);
  const rat = assocs.length ? pick(od, assocs) : undefined;
  if (rat) {
    add({ role: 'rat', id: rat.id, real: real.rat, men: 0 });
    if (real.rat) s.flags.informant = Number(rat.id.slice(1));
  }

  /* -- a decade of peace makes friends -- */
  for (const c of crew(s)) if (c.id !== boss.id && !c.dynasty && c.capoId !== kYoung?.id && c.id !== kYoung?.id) addOpinion(s, c.id, boss.id, 'Ten years of peace on the island', 8, 0);
  for (const c of Object.values(s.characters)) if (c.alive && c.office && c.faction === 'none') addOpinion(s, c.id, boss.id, 'Ten quiet summers', 10, 0);

  /* -- the minds: what each of them believes, true or not -- */
  const M = ensureMinds(s);
  const cm = cons ? M.minds[cons.id] : undefined;
  if (cm && kCapo) believe(s, cm, { k: 'plot', by: kCapo.id, on: boss.id, c: 0.45, src: 'told', tr: real.capo });
  if (cm && rat && real.rat) believe(s, cm, { k: 'rat', by: rat.id, c: 0.25, src: 'rumor', tr: true });
  const ym = kYoung ? M.minds[kYoung.id] : undefined;
  // The red herring: the young crew tells the island the old capo is the one plotting.
  if (ym && kOld) startRumor(s, M, ym, { k: 'plot', by: kOld.id, on: boss.id, tr: false }, true);
  const um = ub ? M.minds[ub.id] : undefined;
  if (um && kCapo) believe(s, um, { k: 'courted', by: kCapo.id, c: 0.5, src: 'saw', tr: real.capo });

  /* -- the families: a cold season with the shore family, what the boss was told -- */
  const I = ensureIntrigue(s);
  const tr = I.eras[pairKey('player', rivalId)];
  if (tr) {
    tr.era = real.rival ? 'cold' : 'tension';
    tr.tension = real.rival ? 64 : 48;
    tr.cause = 'Testing the fences of an old man\'s island';
    tr.hist.push([s.week, tr.era, tr.cause]);
  }
  if (rv) {
    const lead = s.characters[rv.leaderId];
    I.intel.push({ id: `in${I.nextId++}`, week: s.week, sourceId: kOld?.id, about: rivalId, kind: 'plan', told: `${lead ? displayName(lead) : rv.shortName} is buying guns in Camden and asking which of your corners are thin.`, truth: real.rival ? `${rv.shortName} was planning a move on you.` : `${rv.shortName} was bluffing: talk to see who flinched.`, true: real.rival, learnAt: s.week + randInt(od, 10, 16) });
  }
  I.intel.push({ id: `in${I.nextId++}`, week: s.week, sourceId: ub?.id, about: 'philly', kind: 'plan', told: 'Philadelphia is happy with the island. Sal says so every month.', truth: real.sal ? 'Philadelphia was weighing who should replace the old man.' : 'Philadelphia was content.', true: !real.sal, learnAt: s.week + randInt(od, 12, 20) });

  /* -- the kessler man married into the goomar's family -- */
  const km = opts.kmanId ? s.characters[opts.kmanId] : undefined;
  if (km) add({ role: 'kman', id: km.id, rival: 'kessler', real: rivalId === 'kessler' && real.rival, men: 0 });

  /* -- the clock -- */
  od.due = s.week + randInt(od, 16, 26);
  od.youngAt = s.week + randInt(od, 8, 12);
  od.salAt = s.week + randInt(od, 9, 13);
  od.bias = 1.15 + rand(od) * 0.5;
  return od;
}

/** The opening weeks: who sits in which scene (the hands' own people). */
export function scheduleOpening(s: GameState, goomarId?: string, envoyId?: string): void {
  const od = s.oldDon;
  if (!od) return;
  ensureDeeds(s);
  const id = (r: HandRole) => hand(s, r)?.id;
  const ub = id('ub');
  const capo = id('capo');
  const old = id('old');
  const cons = id('cons');
  const young = id('young');
  const wife = id('wife');
  const kman = id('kman');
  const at: OdAgenda[] = [];
  if (ub && capo && old && cons) at.push({ scene: 'od_birthday', at: 2, cast: { ub, capo, old, cons } });
  if (cons && capo && ub) at.push({ scene: 'od_consigliere_warning', at: 3, cast: { cons, capo, ub } });
  const later: OdAgenda[] = [];
  if (envoyId) later.push({ scene: 'od_sal_envoy', at: 0, cast: { envoy: envoyId } });
  const loud = young ? regime(s, young).sort((a, b) => a.id.localeCompare(b.id))[0] : undefined;
  if (young && loud) later.push({ scene: 'od_young_proposal', at: 0, cast: { young, loud: loud.id } });
  if (wife && ub) later.push({ scene: 'od_wife_heard', at: 0, cast: { wife, ub } });
  if (goomarId && kman) later.push({ scene: 'od_goomar_brother', at: 0, cast: { her: goomarId, kman } });
  const kid = player(s).childrenIds.map((x) => s.characters[x]).filter((c) => c?.alive && c.gender === 'M').sort((a, b) => a.birth.y - b.birth.y);
  const priest = Object.values(s.characters).find((c) => c.alive && c.office === 'Pastor of St. Ann\'s');
  if (priest && kid.length >= 2) later.push({ scene: 'od_sunday_dinner', at: 0, cast: { quiet: kid[0].id, hot: kid[kid.length - 1].id, priest: priest.id } });
  shuffle(od, later).forEach((a, i) => at.push({ ...a, at: 4 + i }));
  // The existing conspiracy chain, early: the ambitious capo and the young one, if they are really in it.
  const ear = old ? regime(s, old).find((m) => m.rank === 'soldier' || m.rank === 'associate') : undefined;
  if (hand(s, 'capo')?.real && capo && young && ear) {
    addOpinion(s, ear.id, s.playerId, 'The old man stood godfather to my boy', 20, 0);
    at.push({ scene: 'plot_whispers', at: 4 + later.length + randInt(od, 1, 3), cast: { lead: capo, second: young, ear: ear.id } });
  }
  od.agenda = at;
}

/* ------------------------------------------------------------------ */
/* The fog: how big is the move?                                        */
/* ------------------------------------------------------------------ */

function liveHostile(s: GameState, h: Hand): boolean {
  if (!HOSTILE_ROLES.includes(h.role) || h.x !== undefined) return false;
  if (h.rival) return !!s.rivals.find((r) => r.id === h.rival);
  const c = h.id ? s.characters[h.id] : undefined;
  return !!c?.alive && (c.faction === 'player' || h.role === 'kman');
}

/** How sure the boss's picture is (0-100): rumors with names, proof, men inside the other families. */
export function oldDonIntel(s: GameState): number {
  const od = s.oldDon;
  if (!od) return 0;
  const k = od.hands.reduce((a, h) => a + (h.know === 3 ? 22 : h.know === 2 ? 10 : 0), 0);
  const spies = (s.intrigue?.spies ?? []).filter((x) => x.master === 'player' && !x.ended).length;
  return clamp(5 + k + spies * 10 + Math.min(10, Math.floor((s.flags.intel ?? 0) / 10)));
}

/** The coming move as the boss can estimate it: a range that narrows with intel. `real` is the truth (tests and the year's verdict only). */
export function attackEstimate(s: GameState): { lo: number; hi: number; intel: number; real: number } {
  const od = s.oldDon;
  if (!od) return { lo: 0, hi: 0, intel: 0, real: 0 };
  const hs = od.hands.filter((h) => liveHostile(s, h));
  const real = hs.filter((h) => h.real).reduce((a, h) => a + h.men, 0);
  const told = Math.round(hs.reduce((a, h) => a + h.men, 0) * od.bias);
  const intel = oldDonIntel(s);
  const i = intel / 100;
  const center = told * (1 - i) + real * i;
  const band = 0.1 + 0.6 * (1 - i);
  return { lo: Math.max(0, Math.floor(center * (1 - band))), hi: Math.ceil(center * (1 + band)), intel, real };
}

/** What the boss's desk shows: the pressure points he knows of, each with his own odds that it is real. */
export interface PressurePoint { role: HandRole; title: string; detail: string; odds: number; know: Hand['know'] }

const WHISPER: Record<HandRole, string> = {
  capo: 'Somebody at your table has been eating in Philadelphia',
  ub: 'The men bring their problems to someone else first',
  young: 'The young ones want the old rules changed',
  rival: 'A shore family is testing the fences',
  sal: 'Philadelphia asks after your health',
  rat: 'Somebody close is talking to the government',
  kman: 'A North Wildwood man asks what time you come and go',
  cons: 'Your consigliere has been meeting people quietly',
  old: 'The young crew says an old friend is plotting',
  wife: 'Your wife has been asking questions',
};

export function pressurePoints(s: GameState): PressurePoint[] {
  const od = s.oldDon;
  if (!od || od.donId !== s.playerId) return [];
  return od.hands.filter((h) => h.know > 0 && h.x === undefined && (h.id ? alive(s, h.id) : true)).map((h) => {
    const c = h.id ? s.characters[h.id] : undefined;
    const who = c ? displayName(c) : 'someone';
    const title = h.know === 1 ? WHISPER[h.role] : `${WHISPER[h.role]}: ${who}`;
    const odds = HOSTILE_ROLES.includes(h.role) ? h.belief : 100 - h.belief;
    const detail = h.know === 3 ? (h.real ? 'You have proof. It is real.' : 'You have proof. There is nothing to it.') : `${odds}% it is real, by what you have heard${h.know === 1 ? ' (a whisper, no name you trust)' : ''}.`;
    return { role: h.role, title, detail, odds: h.know === 3 ? (h.real ? 100 : 0) : odds, know: h.know };
  }).sort((a, b) => b.odds - a.odds);
}

/* ------------------------------------------------------------------ */
/* The succession: claims you can see                                   */
/* ------------------------------------------------------------------ */

export interface ClaimPart { label: string; value: number }
export interface Claim { id: string; name: string; total: number; parts: ClaimPart[]; sidelined: boolean }

/**
 * Every claimant's strength (0-100): blood, the capos' backing as the boss
 * has heard it, Philadelphia's favor, money, and respect in the family.
 */
export function claimStrengths(s: GameState): Claim[] {
  const boss = player(s);
  if (!boss) return [];
  const ids = new Set<string>(claimants(s).map((c) => c.id));
  for (const id of boss.childrenIds) { const k = s.characters[id]; if (k?.alive && ageOn(k.birth, s.date) >= 18) ids.add(k.id); }
  for (const h of s.oldDon?.hands ?? []) if ((h.role === 'capo' || h.role === 'young') && h.id && alive(s, h.id) && s.characters[h.id].faction === 'player') ids.add(h.id);
  const known = support(s, true).shares;
  const philly = s.rivals.find((r) => r.id === 'philly');
  const favor = shadowView(s).rivals.philly?.favor;
  const men = crew(s).filter((c) => isFree(s, c) && c.id !== boss.id);
  const out: Claim[] = [];
  for (const id of ids) {
    const c = s.characters[id];
    if (!c?.alive || id === boss.id) continue;
    const blood = boss.childrenIds.includes(id) ? 100 : c.dynasty ? 50 : 0;
    const backing = clamp((known[id] ?? 0) * 2);
    const ph = clamp(50 + (philly ? opinion(s, philly.leaderId, id) : 0) + (favor === id ? 25 : 0));
    const money = clamp(c.wealth / 200);
    const others = men.filter((m) => m.id !== id);
    const resp = clamp(50 + (others.length ? others.reduce((a, m) => a + opinion(s, m.id, id), 0) / others.length : 0) + (c.rank === 'underboss' ? 15 : c.rank === 'capo' ? 8 : 0));
    const side = sidelined(s, id);
    const parts: ClaimPart[] = [
      { label: 'Blood', value: Math.round(blood * 0.25) },
      { label: 'The capos\' backing (as you hear it)', value: Math.round(backing * 0.25) },
      { label: 'Philadelphia\'s favor', value: Math.round(ph * 0.2) },
      { label: 'Money', value: Math.round(money * 0.1) },
      { label: 'Respect in the family', value: Math.round(resp * 0.2) },
      ...(side ? [{ label: 'Put out to pasture', value: -25 }] : []),
      // The women's side of the court (matchmakers.ts): a mother with standing speaks for her own.
      ...(courtWord(s, id) ? [{ label: 'His mother\'s circle', value: courtWord(s, id) }] : []),
    ];
    out.push({ id, name: displayName(c), total: clamp(parts.reduce((a, p) => a + p.value, 0)), parts, sidelined: side });
  }
  return out.sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

function readFlags(s: GameState, od: OldDonState): void {
  const take = (k: string) => { const v = (s.flags[k] ?? 0) > 0; if (k in s.flags) delete s.flags[k]; return v; };
  for (const h of od.hands) {
    if (take(`od_p_${h.role}`)) { h.know = 3; h.belief = h.real ? 95 : 5; }
    if (take(`od_k_${h.role}`) && h.know < 2) {
      h.know = 2;
      // A rumor usually leans the right way; sometimes it lies.
      const right = rand(od) < 0.8 ? h.real : !h.real;
      const loyal = LOYAL_ROLES.includes(h.role);
      h.belief = clamp(h.belief + (right !== loyal ? 18 : -18), 5, 90);
    }
    if (take(`od_x_${h.role}`) && h.x === undefined) h.x = s.week;
  }
  const sal = hand(s, 'sal');
  if (sal?.real && take('od_sal_reassured') && rand(od) < 0.5) sal.real = false;
  if (sal?.real && take('od_sal_paid') && rand(od) < 0.7) sal.real = false;
  if (take('od_spoke_future')) for (const r of ['ub', 'capo'] as HandRole[]) { const h = hand(s, r); if (h?.id && alive(s, h.id)) addOpinion(s, h.id, s.playerId, 'The old man is thinking about tomorrow', 4, 1); }
  if (take('od_feed_rival')) {
    const rv = hand(s, 'rival');
    for (const t of s.threats?.threats ?? []) if (t.by === rv?.rival) t.blunt = Math.max(t.blunt, 0.6);
  }
  if (take('od_watch')) { const h = hand(s, 'capo'); if (h && h.know < 2) { h.know = 2; h.belief = clamp(h.belief + (h.real ? 15 : -10)); } }
}

function runAgenda(s: GameState, od: OldDonState): void {
  const D = ensureDeeds(s);
  for (const a of [...od.agenda]) {
    if (a.at > s.week + 1) continue;
    const sc = SCENES_BY_ID[a.scene];
    if (!sc || D.sc[a.scene] !== undefined && a.scene !== 'plot_whispers') { od.agenda = od.agenda.filter((x) => x !== a); continue; }
    const cast = castScene(s, sc, a.cast);
    const ev = cast ? buildScene(s, sc, cast, true) : undefined;
    if (!ev) { if (s.week - a.at > 6) od.agenda = od.agenda.filter((x) => x !== a); continue; }
    ev.mandatory = true;
    ev.priority = 64;
    ev.meta = { ...(ev.meta ?? {}), od: 1 };
    s.eventQueue.push(ev);
    od.agenda = od.agenda.filter((x) => x !== a);
    break; // one a week
  }
}

function factionFor(s: GameState, leader: Character, members: string[], agenda: Faction['agenda'], demand: Faction['demand'], name: string, candidateId?: string): Faction | undefined {
  if (s.factions.some((f) => f.memberIds.includes(leader.id))) return undefined;
  const ids = [leader.id, ...members.filter((x) => x !== leader.id && alive(s, x) && s.characters[x].faction === 'player' && !s.factions.some((f) => f.memberIds.includes(x)))].slice(0, 6);
  if (ids.length < 2) return undefined;
  const f: Faction = { id: `f${s.nextId++}`, leaderId: leader.id, memberIds: ids, demand, agenda, ...(candidateId ? { candidateId } : {}), since: s.week, stage: 0, stageWeek: s.week, name };
  s.factions.push(f);
  s.eventQueue.push(buildFactionDemand(s, f));
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(leader)} and ${ids.length - 1} other${ids.length > 2 ? 's' : ''} came out in the open: ${name}.`, kind: 'misc' });
  return f;
}

function escalate(ctx: Ctx, od: OldDonState): void {
  const s = ctx.s;
  const boss = player(s);
  const ready = (h?: Hand) => !!h && h.real && h.x === undefined && h.fired === undefined && liveHostile(s, h);
  // The young crew asks for narcotics in the open.
  const y = hand(s, 'young');
  if (ready(y) && s.week >= od.youngAt && opinion(s, y!.id!, boss.id) < 35) {
    const c = s.characters[y!.id!];
    if (factionFor(s, c, [c.id, ...regime(s, c.id).map((m) => m.id)], 'narcotics', 'contracts', `${c.firstName}'s young crew`)) y!.fired = s.week;
    else y!.fired = s.week;
  }
  // Philadelphia leans.
  const sal = hand(s, 'sal');
  if (ready(sal) && s.week >= od.salAt) {
    sal!.fired = s.week;
    const sh = ensureShadow(s);
    const capo = hand(s, 'capo');
    const rd = sh.rivals.philly;
    if (rd) { rd.stance = 'court'; rd.moves += 1; if (capo?.id && alive(s, capo.id)) rd.favor = capo.id; }
    applyEffects(ctx, [{ type: 'rivalOpinion', rival: 'philly', amount: -8, reason: 'An old man who will not name his heir' }], { label: 'Philadelphia weighs it', because: 'kept Philadelphia guessing', category: 'event' });
  }
  // The rival's real push, a little before the big move.
  const rv = hand(s, 'rival');
  if (ready(rv) && s.week >= od.due - 2 && rv!.rival) {
    rv!.fired = s.week;
    const ground = s.districts.filter((d) => (d.influence.player ?? 0) > 8);
    const d = ground.length ? pick(od, ground) : undefined;
    if (d) {
      const T = s.threats;
      if (T && !T.threats.some((t) => t.by === rv!.rival)) T.threats.push({ id: `th${T.n++}`, kind: 'move', by: rv!.rival, district: d.id, start: s.week, due: s.week + randInt(od, 2, 3), blunt: 0 });
    }
  }
  // The big move: the ambitious capo (and the underboss, if he is in it) come out in the open.
  const capo = hand(s, 'capo');
  const ub = hand(s, 'ub');
  if (ready(capo) && s.week >= od.due) {
    const c = s.characters[capo!.id!];
    const est = attackEstimate(s);
    const withUb = ready(ub) ? ub!.id : undefined;
    const mem = [c.id, ...regime(s, c.id).map((m) => m.id), ...(withUb ? [withUb] : []), ...(ready(y) || y?.fired ? [y!.id!] : [])];
    factionFor(s, c, mem, withUb ? 'underboss' : 'abdicate', 'abdicate', `${c.firstName} ${c.lastName}'s people`, withUb ?? c.id);
    capo!.fired = s.week;
    if (withUb) ub!.fired = s.week;
    od.landed = { week: s.week, men: est.real, lo: est.lo, hi: est.hi };
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The move came: ${est.real} men behind it. You had heard ${est.lo}–${est.hi}.`, kind: 'misc' });
  }
}

function outcomeText(s: GameState, od: OldDonState, outcome: YearOutcome, heir?: Character): string {
  const old = s.characters[od.donId];
  const name = old ? displayName(old) : 'The old Don';
  const est = od.landed ? ` The move, when it came, was ${od.landed.men} men; you had heard ${od.landed.lo}–${od.landed.hi}.` : '';
  switch (outcome) {
    case 'own_terms': return `${name} kept the chair through the year, the family whole, and named ${heir ? displayName(heir) : 'his successor'} on his own terms.${est}`;
    case 'holding': return `${name} is still in the chair a year on, but the question of who comes next is not settled, and the men know it.${est}`;
    case 'retired': return `${name} stepped down${old?.faction === 'player' ? ' and stayed on the island' : ' and went to Florida'}. ${heir ? displayName(heir) : 'The heir'} sits in the chair now.${est}`;
    case 'pushed': return `${name} was pushed out of his own chair. ${heir ? displayName(heir) : 'Somebody else'} runs Wildwood now.${est}`;
    case 'dead': return `${name} is buried at Cold Spring${old?.death?.cause ? ` (${old.death.cause})` : ''}. ${heir ? displayName(heir) : 'The heir'} inherits the chair and everything that comes with it.${est}`;
  }
}

function yearEvent(s: GameState, od: OldDonState): EventInstance {
  const y = od.year!;
  const titles: Record<YearOutcome, string> = { own_terms: 'On your terms', holding: 'Still standing', retired: 'Florida', pushed: 'Pushed out', dead: 'The old man is gone' };
  return {
    iid: `ev${s.nextId++}`, defId: 'olddon_year', week: s.week, mandatory: true, priority: 90, title: `The Old Don's year: ${titles[y.outcome]}`, text: y.text,
    defaultChoiceId: 'ok', meta: { od: 1 }, actors: [od.donId, ...(y.heirId ? [y.heirId] : [])].filter((x) => s.characters[x]),
    choices: [{ id: 'ok', label: 'Close the book on the year', because: 'closed the book on the old Don\'s year', effects: [] }],
  };
}

function settleYear(s: GameState, od: OldDonState, outcome: YearOutcome, heir?: Character): void {
  od.year = { week: s.week, outcome, text: outcomeText(s, od, outcome, heir), ...(heir ? { heirId: heir.id } : {}) };
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: od.year.text, kind: 'succession' });
  s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text: od.year.text });
  s.eventQueue.push(yearEvent(s, od));
}

/** The losers of a succession: a strong claimant who did not get the chair may come out against the heir. */
function fallout(ctx: Ctx, od: OldDonState): void {
  const s = ctx.s;
  od.fallout = s.week;
  const boss = player(s);
  const losers = claimStrengths(s).filter((c) => c.total >= 35 && s.characters[c.id]?.faction === 'player' && !boss.childrenIds.includes(c.id) && opinion(s, c.id, boss.id) < 15);
  const top = losers[0];
  if (!top) return;
  const c = s.characters[top.id];
  const backers = Object.entries(ensureShadow(s).plans).filter(([, p]) => p.prefer === c.id).map(([id]) => id);
  const f = factionFor(s, c, [c.id, ...backers, ...regime(s, c.id).map((m) => m.id)], 'underboss', 'abdicate', `${c.firstName} ${c.lastName}'s people`, c.id);
  if (!f && !c.courtedBy) c.courtedBy = { rival: od.hands.find((h) => h.role === 'rival')?.rival ?? 'manno', week: s.week };
  ctx.log.push(`${displayName(c)} expected the chair and did not get it.`);
}

/** Weekly (engine.ts, after the rivals and the threats). */
export function oldDonWeek(ctx: Ctx): void {
  const s = ctx.s;
  const od = s.oldDon;
  if (!od || s.gameOver) return;
  if (od.donId !== s.playerId) {
    // The chair changed hands: say how, once, and let the losers decide what they do.
    if (!od.year) {
      const old = s.characters[od.donId];
      const sh = s.shadow;
      const last = sh?.successions[sh.successions.length - 1];
      const outcome: YearOutcome = !old?.alive ? 'dead' : last && last.fromId === od.donId && last.why === 'retire' ? 'retired' : 'pushed';
      settleYear(s, od, outcome, player(s));
    }
    if (od.fallout === undefined) fallout(ctx, od);
    return;
  }
  readFlags(s, od);
  runAgenda(s, od);
  escalate(ctx, od);
  if (!od.year && s.week - od.w0 >= YEAR_WEEKS) {
    const boss = player(s);
    const d = pwView(s).designation;
    const chosen = d.mode !== 'none' && d.mode !== 'multiple';
    const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
    const kids = boss.childrenIds.map((x) => s.characters[x]).filter(Boolean);
    const intact = (!wife || wife.alive) && kids.every((k) => k.alive) && (s.crewStats?.coups ?? 0) === od.coups0 && !(s.shadow?.splinters ?? []).some((x) => !x.back);
    const heirId = d.publicId ?? d.secretId ?? (d.mode === 'underboss' ? crew(s).find((c) => c.rank === 'underboss')?.id : undefined);
    settleYear(s, od, chosen && intact ? 'own_terms' : 'holding', heirId ? s.characters[heirId] : undefined);
  }
}
