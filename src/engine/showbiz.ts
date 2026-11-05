import { showbizReasons } from './newSkills';
import type { ActionPreview } from './actions';
import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, makeCharacter } from './characters';
import { fmtMoney } from './effects';
import { addFedEvidence } from './fedsState';
import { relationToYou } from './housesView';
import type { Acceptance, Reason } from './interactions';
import { heat, money, respect, type Ctx } from './ledger';
import { pressItem } from './paper';
import { allureReasons, askerReason, askers } from './payroll';
import { addOpinion, opinion } from './relations';
import { rand, type RngHolder } from './rng';
import { BENCH, COMEDY_LP, GROUP_A, GROUP_B, LABEL_NAMES, MANAGER_LABEL, PHOTOS, SONG_A, SONG_B, type BenchSeed } from './showbizData';
import {
  blankShowbiz, KIND_LABEL, RECORDS, ROOMS, RUNGS,
  type Act, type ActKind, type Manager, type Rec, type RoomId, type ShowbizAction, type ShowbizState, type ShowOp,
} from './showbizState';
import type { Character, Choice, Effect, Ethnicity, EventInstance, GameState, RivalId } from './types';

/**
 * SHOWBIZ: sign the acts, book them up the ladder, press their records
 * (showbizState.ts has the shape and the rules). Every act decides for
 * itself; the money moves through the one ledger.
 */

export const ADULT = 18;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const CLUB_KINDS = ['club', 'supperclub', 'gentsclub', 'hoodclub', 'afterhours'];
/** The act's history and the log are capped (the save is near its limit). */
const HIST = 6;
const LOG = 30;
const BENCH_CAP = 40;
export const SEASON = 13;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function withRng<T>(s: GameState, S: ShowbizState, fn: () => T): T {
  const main = s.rng;
  s.rng = S.rng;
  try { return fn(); } finally { S.rng = s.rng; s.rng = main; }
}

function slog(s: GameState, S: ShowbizState, text: string): void {
  S.log.push([s.week, text]);
  if (S.log.length > LOG) S.log.splice(0, S.log.length - LOG);
}

function hist(s: GameState, a: Act, text: string): void {
  a.h.push([s.week, text]);
  if (a.h.length > HIST) a.h.splice(0, a.h.length - HIST);
}

const pickH = <T,>(h: RngHolder, arr: readonly T[]): T => arr[Math.floor(rand(h) * arr.length) % arr.length];

/** Creates the layer and its bench the first time (a new game, or an older save's first week). Idempotent after. */
export function ensureShowbiz(s: GameState): ShowbizState {
  if (!s.showbiz) {
    s.showbiz = blankShowbiz(s);
    seedBench(s, s.showbiz);
  }
  return s.showbiz;
}

function stageOffice(k: ActKind, n?: string): string {
  return n ? `${KIND_LABEL[k]}, ${n}` : k === 'singer' ? 'Singer' : k === 'band' ? 'Bandleader' : KIND_LABEL[k];
}

function makeAct(s: GameState, S: ShowbizState, x: BenchSeed): Act {
  const c = withRng(s, S, () => makeCharacter(s, {
    gender: x.g, ethnicity: x.eth, age: x.age, firstName: x.f, lastName: x.l, rank: 'civilian', faction: 'none', nickname: false,
    ...(x.t ? { traits: x.t } : {}), wealth: Math.round(300 + x.fame * x.fame * 2),
  }));
  if (x.nick) c.nickname = x.nick;
  c.office = stageOffice(x.k, x.n);
  if (x.loc) c.ambition = 'Get off the island and onto a real stage';
  else c.ambition = x.amb >= 80 ? 'Top of the bill in Las Vegas, then the pictures' : x.amb >= 55 ? 'A record on the radio and a room in New York' : 'Steady work and a good room every summer';
  const a: Act = {
    id: c.id, k: x.k, tal: x.tal, draw: clamp(x.fame * 0.8 + x.tal * 0.2), fame: x.fame, amb: x.amb, con: 55, top: x.fame >= 40 ? 1 : 0,
    earn: 0, arr: s.week, h: [[s.week, x.who]],
  };
  if (x.n) a.n = x.n;
  if (x.by) a.by = x.by;
  if (x.loc) a.loc = 1;
  if (x.ph) a.ph = x.ph;
  S.acts[c.id] = a;
  return a;
}

function seedBench(s: GameState, S: ShowbizState): void {
  for (const x of BENCH) makeAct(s, S, x);
  // The singers already working the island's clubs (nightlife.ts) are on the bench too.
  const N = s.nightlife;
  const singers = Object.values(N?.people ?? {}).filter((p) => p.role === 'singer' && p.status === 'active' && s.characters[p.id]?.alive).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, 3);
  for (const p of singers) {
    const c = s.characters[p.id];
    if (!c || ageOn(c.birth, s.date) < ADULT || S.acts[c.id]) continue;
    S.acts[c.id] = { id: c.id, k: 'singer', tal: clamp(p.talent), draw: clamp(p.talent * 0.35), fame: clamp(p.talent * 0.25), amb: p.dream === 'record' ? 80 : 55, con: 55, top: 0, earn: 0, arr: s.week, h: [[s.week, `Sings at ${p.venue}.`]] };
  }
  for (const a of Object.values(S.acts)) if (!a.ph) a.ph = freePhoto(s, S, a);
  S.stats.arrived = Object.keys(S.acts).length;
}

/** A publicity photo nobody living has (Black performers the sepia sheet; dancers and singers the glamour shots first). */
function freePhoto(s: GameState, S: ShowbizState, a: Act): string | undefined {
  const c = s.characters[a.id];
  if (!c) return undefined;
  const age = ageOn(c.birth, s.date);
  const taken = new Set(Object.values(S.acts).map((x) => x.ph).filter(Boolean));
  const black = c.ethnicity === 'Black';
  const fits = PHOTOS.filter((p) => !taken.has(p.k) && p.m === (c.gender === 'M') && !!p.b === black && age >= p.age[0] - 2 && age <= p.age[1] + 3);
  const glam = a.k === 'dancer' || a.k === 'singer';
  return (fits.find((p) => !!p.glam === glam) ?? fits[0])?.k;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export function actName(s: GameState, a: Act): string {
  const c = s.characters[a.id];
  if (a.n) return a.n;
  return c ? (c.nickname ? `${c.firstName} "${c.nickname}" ${c.lastName}` : `${c.firstName} ${c.lastName}`) : 'An act';
}
/** The billing: the group, or the singer's name. */
export const billOf = (s: GameState, a: Act) => (a.n ?? (s.characters[a.id] ? `${s.characters[a.id].firstName} ${s.characters[a.id].lastName}` : 'An act'));

export function actAdult(s: GameState, a: Act): boolean {
  const c = s.characters[a.id];
  return !!c?.alive && ageOn(c.birth, s.date) >= ADULT;
}

/** The rung the act dreams of (0 the shore ... 5 the pictures). */
export const ambRung = (a: Act) => Math.min(5, Math.round(a.amb / 20));

export function mine(s: GameState): Act[] {
  return Object.values(s.showbiz?.acts ?? {}).filter((a) => a.by === 'p' && actAdult(s, a)).sort((a, b) => b.fame - a.fame || (a.id < b.id ? -1 : 1));
}

export function talent(s: GameState): Act[] {
  return Object.values(s.showbiz?.acts ?? {}).filter((a) => a.by !== 'p' && actAdult(s, a)).sort((a, b) => b.fame - a.fame || (a.id < b.id ? -1 : 1));
}

export const managerLabel = (a: Act) => (a.by ? MANAGER_LABEL[a.by] ?? 'Somebody' : 'Nobody: a free agent');

const ownsClub = (s: GameState) => s.businesses.find((b) => b.owner === 'player' && CLUB_KINDS.includes(b.kind) && (b.closedUntil ?? 0) <= s.week);
const routes = (s: GameState) => s.businesses.filter((b) => b.owner === 'player' && b.kind === 'vending' && (b.closedUntil ?? 0) <= s.week).length;
const favorsOwed = (s: GameState) => (s.deeds?.owed ?? []).filter((o) => o.to === s.playerId).length;
const rivalOffice = (by?: Manager): by is RivalId => !!by && by !== 'p' && by !== 'ind';

/** The boss's pull for a booking at a rung: every reason, and the total. */
export function pullOf(s: GameState, rung: number, act?: Act): { total: number; reasons: Reason[] } {
  const r: Reason[] = [];
  const S = s.showbiz;
  const room = RUNGS[rung]?.id;
  const club = ownsClub(s);
  if (club && rung <= 2) r.push({ label: `A stage of your own (${club.name})`, value: 1 });
  if (room === 'ac' || room === 'ny' || room === 'vegas') {
    if (S?.pts[room] !== undefined) r.push({ label: `A point in ${ROOMS[room].room}`, value: 2 });
  } else if (rung >= 4) {
    const pts = Object.keys(S?.pts ?? {}).length;
    if (pts) r.push({ label: `Points in ${pts} room${pts > 1 ? 's' : ''}: the outfits hear your name`, value: Math.min(2, pts) });
  }
  if (rung === 2) {
    const h = s.lineage?.houses.h_ruggeri;
    const rel = h ? relationToYou(s, h) : undefined;
    if (rel && rel.tone === 'good') r.push({ label: `The Ruggeris of Brooklyn: ${rel.label.toLowerCase()}`, value: 1 });
  }
  const stars = Object.values(s.payroll?.hires ?? {}).filter((h) => h.job === 'celebrity').length;
  const friends = Object.values(S?.acts ?? {}).filter((a) => a.friend !== undefined && a.by === 'p' && a.id !== act?.id && actAdult(s, a)).length;
  if (stars + friends) r.push({ label: `A famous friend${stars + friends > 1 ? ` (${stars + friends})` : ''} puts in a word`, value: Math.min(2, stars + friends) });
  const fav = favorsOwed(s);
  if (fav >= 2) r.push({ label: `Favors owed to you (${fav})`, value: 1 });
  if (s.respect >= 60) r.push({ label: 'Your name carries', value: 1 });
  if (act?.hit !== undefined && s.week - act.hit <= 26) r.push({ label: 'A hit record this year', value: 1 });
  if (s.heat.federal >= 70) r.push({ label: 'The government is watching you: rooms keep their distance', value: -1 });
  return { total: r.reduce((x, y) => x + y.value, 0), reasons: r };
}

export function expectedAdvance(a: Act): number {
  return Math.round((100 + a.fame * a.fame * 0.25 + a.tal * 2) / 50) * 50;
}

export function buyoutPrice(a: Act): number {
  return Math.round((1000 + a.fame * a.fame + a.tal * 10) / 100) * 100;
}

function cap(base: number, reasons: Reason[], hi = 0.9): Acceptance {
  const sum = reasons.reduce((x, r) => x + r.value, base);
  return { chance: Math.max(0.05, Math.min(hi, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

/** The terms' weight: the percentage, the length, the advance. */
function termReasons(a: Act, pct: number, weeks: number, adv: number): Reason[] {
  const r: Reason[] = [];
  r.push({ label: `${pct}% for the agent`, value: Math.round((20 - pct) * 1.5) });
  const exp = expectedAdvance(a);
  if (!adv) r.push({ label: 'No advance', value: -20 });
  else r.push({ label: adv >= exp ? `A good advance (${fmtMoney(adv)})` : `A thin advance (${fmtMoney(adv)})`, value: Math.max(-20, Math.min(25, Math.round((adv / exp - 1) * 30))) });
  if (weeks > 52) r.push({ label: `${Math.round(weeks / 52)} years is a long time to an ambitious act`, value: -Math.round((weeks / 52 - 1) * a.amb / 10) });
  else if (weeks <= 26) r.push({ label: 'A short contract: little to lose', value: 5 });
  return r;
}

/** Their odds of signing with the boss, every reason (who asks, how much, what he can do for them, their own mind). */
export function signOdds(s: GameState, a: Act, pct: number, weeks: number, adv: number, via?: string): Acceptance {
  const c = s.characters[a.id];
  const r: Reason[] = [askerReason(s, via), ...termReasons(a, pct, weeks, adv)];
  const op = c ? opinion(s, c.id, s.playerId) : 0;
  if (op) r.push({ label: op > 0 ? 'Thinks well of you' : 'Thinks little of you', value: Math.round(op * 0.3) });
  const pull = pullOf(s, Math.min(5, a.top + 1), a).total;
  if (pull >= 2) r.push({ label: 'You can get them out of the shore clubs', value: 10 });
  else if (ownsClub(s)) r.push({ label: 'You have a stage to offer', value: 6 });
  if (s.showbiz?.label && RECORDS.includes(a.k)) r.push({ label: `You own a label (${s.showbiz.label.name})`, value: 8 });
  if (c && c.wealth < 800) r.push({ label: 'Needs the money', value: 10 });
  if (a.fame >= 60) r.push({ label: 'Big enough to be choosy', value: -10 });
  if (a.by === 'ind') r.push({ label: a.con >= 60 ? 'Happy with their agent' : 'Tired of their agent', value: a.con >= 60 ? -15 : 5 });
  if (a.grudge !== undefined) r.push({ label: 'Holds a grudge against you', value: -30 });
  if (c && hasTrait(c, 'Honest') && s.heat.federal >= 50) r.push({ label: 'Does not want the papers to put them with you', value: -10 });
  if (c && hasTrait(c, 'Greedy')) r.push({ label: 'Likes money', value: adv >= expectedAdvance(a) ? 8 : -5 });
  r.push(...allureReasons(s, c, via, r));
  r.push(...showbizReasons(s));
  return cap(35, r);
}

/** A rival office selling an act's contract, and the act wanting out. */
export function buyoutOdds(s: GameState, a: Act, pct: number, weeks: number, adv: number): Acceptance {
  const rv = rivalOffice(a.by) ? s.rivals.find((x) => x.id === a.by) : undefined;
  const r: Reason[] = [];
  if (rv) {
    const op = opinion(s, rv.leaderId, s.playerId);
    if (op) r.push({ label: `${rv.shortName} ${op > 0 ? 'thinks well of you' : 'does not like you'}`, value: Math.round(op * 0.3) });
    if (rv.feud) r.push({ label: 'A blood feud', value: -30 });
    if (rv.money < 3000) r.push({ label: `The ${rv.shortName} office needs the money`, value: 10 });
  }
  r.push({ label: 'Your standing', value: Math.round((s.respect - 50) / 3) });
  r.push({ label: a.con < 50 ? 'The act wants out of their contract' : 'The act is happy where they are', value: Math.round((55 - a.con) * 0.5) });
  r.push(...termReasons(a, pct, weeks, adv).map((x) => ({ ...x, value: Math.round(x.value / 2) })));
  return cap(40, r, 0.85);
}

/** The room says yes: the act's draw over what it needs, the boss's pull over what it wants. */
export function bookOdds(s: GameState, a: Act, rung: number): Acceptance {
  const R = RUNGS[rung];
  if (rung === 0) return { chance: 0.92, reasons: [{ label: 'The shore clubs always need an act', value: 92 }] };
  const p = pullOf(s, rung, a);
  const r: Reason[] = [
    { label: `Draw ${a.draw} against the ${R.draw} the room wants`, value: Math.round((a.draw - R.draw) * 0.8) },
    { label: `Your pull ${p.total} against the ${R.pull} it takes`, value: (p.total - R.pull) * 8 },
  ];
  if (a.top >= rung) r.push({ label: 'They have played this room before', value: 10 });
  if (a.fame >= 60) r.push({ label: 'A name the room knows', value: 6 });
  r.push(...showbizReasons(s));
  return cap(50, r, 0.92);
}

/** Why a booking cannot be made (undefined: it can). */
export function bookBlock(s: GameState, a: Act, rung: number): string | undefined {
  const R = RUNGS[rung];
  if (!R) return 'No such room';
  if (a.by !== 'p') return 'Not your act';
  if (!actAdult(s, a)) return 'Adults only';
  const c = s.characters[a.id];
  if (c && !isFree(s, c)) return 'Not free to travel';
  if (a.gig) return `Already booked (${a.gig.room})`;
  if (rung > a.top + 1) return 'One step at a time: they have not played the rung below';
  if (a.draw < R.draw) return `Needs a draw of ${R.draw} (they have ${a.draw})`;
  const p = pullOf(s, rung, a).total;
  if (p < R.pull) return `Needs pull ${R.pull} (you have ${p}): a point in the room, a club, favors, a famous friend`;
  if (rung === 5 && a.k !== 'actor' && a.k !== 'singer' && a.k !== 'comic') return 'The studios want singers, comics and actors';
  return undefined;
}

function pointOdds(s: GameState, room: RoomId): Acceptance {
  const R = ROOMS[room];
  const r: Reason[] = [{ label: 'Your standing', value: Math.round((s.respect - 50) / 2) }];
  if (R.rival) {
    const rv = s.rivals.find((x) => x.id === R.rival);
    if (rv) { const op = opinion(s, rv.leaderId, s.playerId); if (op) r.push({ label: `Philadelphia ${op > 0 ? 'is pleased with you' : 'is cool on you'}`, value: Math.round(op * 0.3) }); }
  }
  if (R.house) {
    const h = s.lineage?.houses[R.house];
    const rel = h ? relationToYou(s, h) : undefined;
    if (rel?.tone === 'good') r.push({ label: `${h!.name}: ${rel.label.toLowerCase()}`, value: 20 });
    if (rel?.tone === 'bad') r.push({ label: `${h!.name}: ${rel.label.toLowerCase()}`, value: -40 });
  }
  if (Object.keys(s.showbiz?.pts ?? {}).length) r.push({ label: 'You already have a point in a room', value: 8 });
  return cap(45, r);
}

function pointBlock(s: GameState, room: RoomId): string | undefined {
  const R = ROOMS[room];
  if (s.showbiz?.pts[room] !== undefined) return 'You already have a point there';
  if (s.respect < R.respect) return `Needs respect ${R.respect}: they do not sell to nobodies`;
  if (R.rival && s.rivals.find((x) => x.id === R.rival)?.war) return 'At war with them';
  if (s.money < R.cost) return `Needs ${fmtMoney(R.cost)}`;
  return undefined;
}

/** A record's title. */
function title(S: ShowbizState, a: Act): string {
  if (a.k === 'comic') return pickH(S, COMEDY_LP);
  return `${pickH(S, SONG_A)} ${pickH(S, SONG_B)}`;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

const SX = (op: ShowOp, label: string): Effect => ({ type: 'showbiz', op, label }) as Effect;
const he = (c?: Character) => (c?.gender === 'F' ? 'She' : 'He');

function base(title: string, because: string): ActionPreview {
  return { title, effects: [], cost: 0, because, category: 'event' };
}

export const PCTS = [10, 15, 20, 25, 30, 35];
export const LENGTHS = [26, 52, 104, 156];

export function previewShowbiz(s: GameState, a: ShowbizAction): ActionPreview {
  const S = s.showbiz;
  const act = 'id' in a ? S?.acts[a.id] : undefined;
  const c = act ? s.characters[act.id] : undefined;
  const nm = act ? billOf(s, act) : 'Nobody';
  const they = act?.k === 'group' || act?.k === 'band' ? 'They' : he(c);
  const noAct = !act || !c?.alive ? 'Nobody by that name' : !actAdult(s, act) ? 'Adults only' : undefined;
  switch (a.op) {
    case 'sign': {
      const asker = a.via ? s.characters[a.via] : undefined;
      return {
        ...base(`Sign ${nm}: ${a.pct}%, ${a.weeks} weeks, ${fmtMoney(a.adv)} advance${asker ? `, through ${asker.firstName}` : ''}`, `offered ${nm} a management contract`),
        cost: a.adv, category: 'cost',
        detail: act ? `${KIND_LABEL[act.k]}. You become their agent: you book the rooms, you take ${a.pct}% of what they make, for ${a.weeks} weeks. The advance is theirs to keep. ${they} decide${they === 'They' ? '' : 's'}.` : '',
        effects: [{ type: 'money', amount: -a.adv, category: 'cost', label: `${nm}: the advance` }, SX(a, `${nm} signs with you`)],
        acceptance: act ? signOdds(s, act, a.pct, a.weeks, a.adv, a.via) : undefined, oddsLabel: `${they} sign${they === 'They' ? '' : 's'}`,
        refuseEffects: [SX({ op: 'no', id: a.id, what: 'sign' }, `${nm} said no`)],
        disabledReason: noAct ?? (act!.by === 'p' ? 'Already yours' : rivalOffice(act!.by) ? `Under contract to ${managerLabel(act!)}: buy them out, or lean on the office` : undefined)
          ?? (!PCTS.includes(a.pct) || !LENGTHS.includes(a.weeks) ? 'Not terms anybody signs' : undefined) ?? (s.money < a.adv ? `Needs ${fmtMoney(a.adv)}` : undefined)
          ?? (a.via && !askers(s).some((x) => x.id === a.via) ? 'He cannot make the offer now' : undefined),
      };
    }
    case 'buyout': {
      const price = act ? buyoutPrice(act) : 0;
      const rv = act && rivalOffice(act.by) ? s.rivals.find((x) => x.id === act.by) : undefined;
      return {
        ...base(`Buy out ${nm}'s contract from ${managerLabel(act ?? ({} as Act)).toLowerCase()} (${fmtMoney(price)})`, `bought out ${nm}'s contract`),
        cost: price + a.adv, category: 'cost',
        detail: `${fmtMoney(price)} to the office for the paper, then your own terms: ${a.pct}%, ${a.weeks} weeks, ${fmtMoney(a.adv)} advance. The office has to sell, and the act has to want it.`,
        effects: [{ type: 'money', amount: -(price + a.adv), category: 'cost', label: `${nm}: the buyout and the advance` }, SX(a, `${nm}: contract bought out`)],
        acceptance: act ? buyoutOdds(s, act, a.pct, a.weeks, a.adv) : undefined, oddsLabel: 'The office sells',
        refuseEffects: [SX({ op: 'no', id: a.id, what: 'buyout' }, `${nm}: the office would not sell`)],
        disabledReason: noAct ?? (!rv && act!.by !== 'ind' ? 'Nobody to buy them from' : undefined) ?? (rv?.war ? 'At war with them' : undefined) ?? (s.money < price + a.adv ? `Needs ${fmtMoney(price + a.adv)}` : undefined),
      };
    }
    case 'lean': {
      const rv = act && rivalOffice(act.by) ? s.rivals.find((x) => x.id === act.by) : undefined;
      return {
        ...base(`Lean on ${rv ? `the ${rv.shortName} office` : 'their office'} for ${nm}'s contract`, `leaned on the office that had ${nm}`),
        detail: `Your choice, and yours alone: your men pay the office a visit and the contract changes hands for nothing. ${nm} will know how it was done: they start resentful, may sue, and may talk to the papers or the government. The ${rv?.shortName ?? 'other'} family will not forget it.`,
        warning: 'Strong-arm: heat, a family\'s grudge, and an artist who knows how you got them.',
        effects: [
          SX(a, `${nm}: the contract changed hands`), { type: 'heat', bar: 'local', amount: 3, label: `Leaning on an office for ${nm}` },
          ...(rv ? [{ type: 'rivalOpinion', rival: rv.id, amount: -25, reason: `Leaned on our office for ${nm}`, label: `${rv.shortName} remembers` } as Effect] : []),
        ],
        acceptance: { chance: Math.max(0.3, Math.min(0.85, 0.6 + (s.respect - 50) / 200)), reasons: [{ label: 'Your men are persuasive', value: 60 }, { label: 'Your standing', value: Math.round((s.respect - 50) / 2) }] },
        oddsLabel: 'The office folds',
        refuseEffects: [SX({ op: 'no', id: a.id, what: 'lean' }, `${nm}: the office would not fold`), { type: 'heat', bar: 'family', amount: 2, label: 'Philadelphia hears about the visit' }, ...(rv ? [{ type: 'rivalOpinion', rival: rv.id, amount: -15, reason: 'Sent men to our office', label: `${rv.shortName} remembers` } as Effect] : [])],
        disabledReason: noAct ?? (!rv ? 'Not under a rival family\'s contract' : undefined),
      };
    }
    case 'book': {
      const R = RUNGS[a.rung];
      const fee = R?.fee ?? 0;
      return {
        ...base(`Book ${nm} at ${R?.room ?? '?'} (${R?.name ?? '?'})`, `booked ${nm} at ${R?.room ?? 'a room'}`),
        cost: fee, category: 'cost',
        detail: R ? `${R.weeks} week${R.weeks > 1 ? 's' : ''}. The act grosses about ${fmtMoney(Math.round(R.pay * (0.5 + (act?.draw ?? 0) / 100)))} a week; you take ${act?.deal?.pct ?? 0}%. A good notice raises their draw and fame; a flop costs both.` : '',
        effects: [...(fee ? [{ type: 'money', amount: -fee, category: 'cost', label: `${nm}: the booking (${R.name})` } as Effect] : []), SX(a, `${nm} booked: ${R?.room}`)],
        acceptance: act && R ? bookOdds(s, act, a.rung) : undefined, oddsLabel: 'The room says yes',
        refuseEffects: [SX({ op: 'no', id: a.id, what: 'book', rung: a.rung }, `${nm}: the room passed`)],
        disabledReason: noAct ?? bookBlock(s, act!, a.rung) ?? (s.money < fee ? `Needs ${fmtMoney(fee)}` : undefined),
      };
    }
    case 'renew': {
      const acc: Acceptance | undefined = act ? cap(Math.round(act.con - 10), [...termReasons(act, a.pct, a.weeks, 0).filter((r) => r.label !== 'No advance'), ...(act.friend !== undefined ? [{ label: 'A friend of yours', value: 10 }] : [])], 0.95) : undefined;
      return {
        ...base(`New terms for ${nm}: ${a.pct}%, ${a.weeks} more weeks`, `offered ${nm} new terms`),
        detail: `Their contract runs to week ${act?.deal?.until ?? '?'}. Content acts stay; unhappy ones wait for the paper to run out.`,
        effects: [SX(a, `${nm}: new terms`)], acceptance: acc, oddsLabel: `${they} agree${they === 'They' ? '' : 's'}`,
        refuseEffects: [SX({ op: 'no', id: a.id, what: 'renew' }, `${nm} would not re-sign`)],
        disabledReason: noAct ?? (act!.by !== 'p' ? 'Not your act' : undefined) ?? (!PCTS.includes(a.pct) || !LENGTHS.includes(a.weeks) ? 'Not terms anybody signs' : undefined),
      };
    }
    case 'release':
      return {
        ...base(`Let ${nm} go`, `released ${nm} from the contract`),
        detail: 'The contract is torn up. They are free to sign with anybody. Acts remember who let them go clean.',
        effects: [SX(a, `${nm} released`)], disabledReason: noAct ?? (act!.by !== 'p' ? 'Not your act' : undefined),
      };
    case 'bonus':
      return {
        ...base(`A present for ${nm} (${fmtMoney(a.amount)})`, `gave ${nm} a present`), cost: a.amount, category: 'cost',
        detail: 'A watch, a fur, a new arrangement for the act. Contented acts stay, work harder and say nice things to the columnists.',
        effects: [{ type: 'money', amount: -a.amount, category: 'cost', label: `${nm}: a present` }, SX(a, `${nm}: a present`)],
        disabledReason: noAct ?? (act!.by !== 'p' ? 'Not your act' : undefined) ?? (s.money < a.amount ? `Needs ${fmtMoney(a.amount)}` : undefined),
      };
    case 'point': {
      const R = ROOMS[a.room];
      return {
        ...base(`Buy a point in ${R.room}, through ${R.through} (${fmtMoney(R.cost)})`, `bought a point in ${R.room}`), cost: R.cost, category: 'cost',
        detail: `A piece of the room: about ${fmtMoney(R.div)} a week, and your acts get a hearing there. The people who own the rest decide whether to sell.`,
        effects: [{ type: 'money', amount: -R.cost, category: 'cost', label: `A point in ${R.room}` }, SX(a, `A point in ${R.room}`)],
        acceptance: pointOdds(s, a.room), oddsLabel: 'They sell',
        refuseEffects: [SX({ op: 'no', id: '', what: 'point', room: a.room }, `${R.through} would not sell`)],
        disabledReason: pointBlock(s, a.room),
      };
    }
    case 'label': {
      const cost = a.home === 'Philadelphia' ? 7000 : 4000;
      return {
        ...base(`Start a record label in ${a.home} (${fmtMoney(cost)})`, `started a record label in ${a.home}`), cost, category: 'cost',
        detail: a.home === 'Philadelphia' ? 'An office on Broad Street, a distributor, and the Philadelphia disc jockeys a phone call away: records reach further.' : 'A back office on Pacific Avenue and a pressing deal in Camden. Cheaper; the records stay closer to home.',
        effects: [{ type: 'money', amount: -cost, category: 'cost', label: 'A record label' }, SX(a, 'A record label')],
        disabledReason: S?.label ? `You already own ${S.label.name}` : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined,
      };
    }
    case 'press': {
      const L = S?.label;
      const recent = L?.recs.some((r) => r.act === a.id && s.week - r.wk < SEASON);
      const pay = a.radio === 2 ? 180 : a.radio === 1 ? 60 : 0;
      return {
        ...base(`Press a record for ${nm}${a.radio ? (a.radio === 2 ? ', with the full treatment on the radio' : ', with a little something for the disc jockeys') : ''}`, `pressed a record for ${nm}`), cost: 400, category: 'cost',
        detail: `$400 for the session and the pressing. ${routes(s) ? `Your jukebox route${routes(s) > 1 ? 's' : ''} put it in the machines.` : 'No jukebox route of your own: the machines belong to other people.'} ${pay ? `Payola: ${fmtMoney(pay)} a week to the disc jockeys while it runs, and the government is asking disc jockeys about envelopes.` : 'No payola: it rises or sinks on its own.'}`,
        effects: [{ type: 'money', amount: -400, category: 'cost', label: `${nm}: a record` }, SX(a, `${nm}: a record`)],
        warning: a.radio ? 'Payola: heat with the government, and a chance of an investigation.' : undefined,
        disabledReason: noAct ?? (!L ? 'You need a label first' : undefined) ?? (act!.by !== 'p' ? 'Not your act' : undefined) ?? (!RECORDS.includes(act!.k) ? 'Not an act that makes records' : undefined) ?? (recent ? 'One record a season' : undefined) ?? (s.money < 400 ? 'Needs $400' : undefined),
      };
    }
    case 'payola': {
      const rec = S?.label?.recs.find((r) => r.id === a.rec);
      return {
        ...base(a.radio ? `Payola for "${rec?.title ?? '?'}": ${a.radio === 2 ? 'the full treatment' : 'a little something'}` : `Stop the payola on "${rec?.title ?? '?'}"`, a.radio ? 'put money behind a record on the radio' : 'stopped the payola'),
        detail: a.radio ? `${fmtMoney(a.radio === 2 ? 180 : 60)} a week to the disc jockeys while it runs.` : 'It plays if they like it.',
        effects: [SX(a, 'The radio')], warning: a.radio ? 'Payola: heat with the government.' : undefined,
        disabledReason: !rec || rec.done ? 'Not a record that is out' : rec.radio === a.radio ? 'Already so' : undefined,
      };
    }
  }
}

export function describeShowOp(s: GameState, o: ShowOp): string | undefined {
  const a = 'id' in o && o.id ? s.showbiz?.acts[o.id] : undefined;
  const nm = a ? billOf(s, a) : 'the act';
  switch (o.op) {
    case 'sign': return `${nm} signs with you (${o.pct}%, ${o.weeks} weeks)`;
    case 'buyout': return `${nm}'s contract is yours (${o.pct}%)`;
    case 'lean': return `${nm}'s contract changes hands`;
    case 'book': return `${nm} plays ${RUNGS[o.rung]?.room}`;
    case 'renew': return `${nm}: ${o.pct}% for ${o.weeks} more weeks`;
    case 'release': return `${nm} is free`;
    case 'bonus': return `${nm} is pleased`;
    case 'point': return `A point in ${ROOMS[o.room].room}`;
    case 'label': return 'Your own record label';
    case 'press': return `A record for ${nm}`;
    case 'payola': return o.radio ? 'Money behind a record on the radio' : 'No more payola';
    default: return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Carrying it out                                                     */
/* ------------------------------------------------------------------ */

function sign(s: GameState, S: ShowbizState, a: Act, pct: number, weeks: number, adv: number, con: number): void {
  a.by = 'p';
  a.deal = { pct, until: s.week + weeks, adv, since: s.week };
  a.con = clamp(con);
  delete a.spurned;
  a.idle = s.week;
  const c = s.characters[a.id];
  if (c && adv) c.wealth += adv;
  S.stats.signed++;
}

export function applyShowOp(ctx: Ctx, o: ShowOp): void {
  const s = ctx.s;
  const S = ensureShowbiz(s);
  const a = 'id' in o && o.id ? S.acts[o.id] : undefined;
  const c = a ? s.characters[a.id] : undefined;
  const nm = a ? billOf(s, a) : '';
  const B = s.playerId;
  switch (o.op) {
    case 'sign':
      if (!a || !c) return;
      sign(s, S, a, o.pct, o.weeks, o.adv, 60 + Math.round((o.adv / expectedAdvance(a) - 1) * 10) + (20 - o.pct) / 2);
      addOpinion(s, c.id, B, 'Signed with him', 6, 1);
      hist(s, a, `Signed with you: ${o.pct}%, ${o.weeks} weeks, ${fmtMoney(o.adv)} advance.`);
      slog(s, S, `${nm} signed with you.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${nm} signed a management contract with you.`, kind: 'decision' });
      return;
    case 'buyout': {
      if (!a || !c) return;
      const rv = rivalOffice(a.by) ? s.rivals.find((x) => x.id === a.by) : undefined;
      if (rv) rv.money += buyoutPrice(a);
      const from = managerLabel(a).toLowerCase();
      sign(s, S, a, o.pct, o.weeks, o.adv, 62 + (20 - o.pct) / 2);
      addOpinion(s, c.id, B, 'Bought out my contract', 10, 1);
      hist(s, a, `You bought the contract from ${from}.`);
      slog(s, S, `You bought ${nm}'s contract from ${from}.`);
      return;
    }
    case 'lean':
      if (!a || !c) return;
      sign(s, S, a, 35, 104, 0, 25);
      a.lean = s.week;
      a.grudge = s.week;
      addOpinion(s, c.id, B, 'He had my office leaned on', -25, 0);
      hist(s, a, 'Your men leaned on their office; the contract is yours. They know how.');
      slog(s, S, `Your men leaned on the office; ${nm} is yours now, and resents it.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `Your men leaned on a rival office until ${nm}'s contract changed hands.`, kind: 'decision' });
      return;
    case 'book': {
      if (!a || bookBlock(s, a, o.rung)) return;
      const R = RUNGS[o.rung];
      const club = o.rung === 0 ? ownsClub(s) : undefined;
      a.gig = { r: o.rung, room: club ? club.name : R.room, until: s.week + R.weeks, ...(club ? { own: 1 as const } : {}) };
      hist(s, a, `Booked at ${a.gig.room} for ${R.weeks} week${R.weeks > 1 ? 's' : ''}.`);
      slog(s, S, `${nm} booked at ${a.gig.room}.`);
      return;
    }
    case 'renew':
      if (!a?.deal) return;
      a.deal.pct = o.pct;
      a.deal.until = Math.max(a.deal.until, s.week) + o.weeks;
      a.con = clamp(a.con + 5 + (20 - o.pct) / 2);
      hist(s, a, `New terms: ${o.pct}%, through week ${a.deal.until}.`);
      return;
    case 'release':
      if (!a) return;
      a.by = undefined;
      delete a.deal;
      delete a.gig;
      a.con = clamp(Math.max(a.con, 50) + 10);
      if (c) addOpinion(s, c.id, B, 'Let me go clean', 8, 1);
      hist(s, a, 'You let them go.');
      slog(s, S, `You let ${nm} go.`);
      S.stats.left++;
      return;
    case 'bonus':
      if (!a) return;
      a.con = clamp(a.con + Math.min(20, o.amount / 25));
      if (c) { c.wealth += o.amount; addOpinion(s, c.id, B, 'A present from him', Math.min(10, Math.round(o.amount / 50)), 1); }
      hist(s, a, `A present from you (${fmtMoney(o.amount)}).`);
      return;
    case 'point':
      S.pts[o.room] = s.week;
      slog(s, S, `You own a point in ${ROOMS[o.room].room}.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You bought a point in ${ROOMS[o.room].room} through ${ROOMS[o.room].through}.`, kind: 'decision' });
      return;
    case 'label': {
      if (S.label) return;
      const name = withRng(s, S, () => pickH(s, LABEL_NAMES[o.home]));
      S.label = { name, home: o.home, since: s.week, recs: [], heat: 0, hits: 0 };
      slog(s, S, `${name} opens its doors in ${o.home}.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You started a record label, ${name}, in ${o.home}.`, kind: 'decision' });
      return;
    }
    case 'press': {
      const L = S.label;
      if (!L || !a) return;
      const rec: Rec = { id: `r${++S.seq}`, act: a.id, title: title(S, a), wk: s.week, radio: o.radio, jb: Math.min(4, routes(s) * 2), reach: 0, sold: 0, roy: 0 };
      L.recs.push(rec);
      if (L.recs.length > 8) L.recs.splice(0, L.recs.length - 8);
      hist(s, a, `Cut a record for ${L.name}: "${rec.title}".`);
      slog(s, S, `${L.name} pressed "${rec.title}" by ${nm}.`);
      return;
    }
    case 'payola': {
      const rec = S.label?.recs.find((r) => r.id === o.rec);
      if (rec && !rec.done) rec.radio = o.radio;
      return;
    }
    case 'no':
      if (a) {
        if (o.what === 'book') { a.con = clamp(a.con - 3); hist(s, a, `${RUNGS[o.rung ?? 0]?.room ?? 'The room'} passed on them.`); }
        else if (o.what === 'renew') hist(s, a, 'Would not sign new terms.');
        else hist(s, a, o.what === 'sign' ? 'Turned down your contract.' : o.what === 'lean' ? 'Their office stood up to your men.' : 'Their office would not sell the contract.');
      }
      slog(s, S, o.what === 'point' && o.room ? `${ROOMS[o.room].through} would not sell you a point.` : `${nm || 'They'}: no.`);
      return;
    case 'buyme':
      if (!a) return;
      if (o.take) {
        a.by = undefined; delete a.deal; delete a.gig;
        a.con = 70;
        hist(s, a, `Bought themselves out of your contract (${fmtMoney(o.price)}).`);
        slog(s, S, `${nm} bought out the contract.`);
        S.stats.left++;
      } else {
        a.spurned = s.week;
        a.con = clamp(a.con - 10);
        a.grudge = a.grudge ?? s.week;
        if (c) addOpinion(s, c.id, B, 'He would not let me buy my way out', -12, 0);
        hist(s, a, 'You would not let them buy their way out.');
      }
      return;
    case 'suit':
      if (!a) return;
      if (o.how === 'settle') { a.con = clamp(a.con + 8); hist(s, a, `You settled their suit (${fmtMoney(o.price)}).`); }
      else if (o.how === 'release') {
        a.by = undefined; delete a.deal; delete a.gig; a.con = 65;
        hist(s, a, 'You let them out of the contract rather than go to court.');
        S.stats.left++;
      } else {
        const win = withRng(s, S, () => rand(s)) < 0.5 + (s.respect - 50) / 200;
        if (win) { a.con = clamp(a.con - 15); a.grudge = s.week; hist(s, a, 'Lost their suit against you.'); slog(s, S, `${nm} lost the suit.`); }
        else {
          a.by = undefined; delete a.deal; delete a.gig; a.con = 60;
          respect(ctx, -2, `${nm} won the suit against you`, 'consequence');
          hist(s, a, 'Won their suit: the contract is void.');
          slog(s, S, `${nm} won the suit; the contract is void.`);
          s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${nm} beat you in court; the contract is void.`, kind: 'consequence' });
          S.stats.left++;
        }
      }
      return;
    case 'probe': {
      const L = S.label;
      if (!L) return;
      if (o.how === 'lawyer') L.heat = clamp(L.heat - 30);
      else if (o.how === 'dj') {
        L.heat = clamp(L.heat - 20);
        for (const x of Object.values(S.acts)) if (x.by === 'p' && L.recs.some((r) => r.act === x.id)) x.con = clamp(x.con - 8);
      } else { L.heat = clamp(L.heat - 10); addFedEvidence(s, B, 3, 'Payola at your label'); }
      slog(s, S, o.how === 'lawyer' ? 'The lawyers answered the subcommittee.' : o.how === 'dj' ? 'A disc jockey took the fall for the label.' : 'You stonewalled the investigators.');
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Their own scenes                                                    */
/* ------------------------------------------------------------------ */

function buymeEvent(s: GameState, a: Act, price: number): EventInstance {
  const nm = billOf(s, a);
  const choices: Choice[] = [
    { id: 'take', label: `"Take the money. Good luck to you." (+${fmtMoney(price)})`, detail: 'The contract is torn up; they owe you nothing.', because: `let ${nm} buy out the contract`, effects: [{ type: 'money', amount: price, category: 'business', label: `${nm}: the buyout` }, SX({ op: 'buyme', id: a.id, take: true, price }, `${nm}: bought out`)] },
    { id: 'no', label: '"You signed a contract."', detail: 'They stay, and they stay unhappy. Unhappy acts sue, and talk.', because: `would not let ${nm} buy out`, effects: [SX({ op: 'buyme', id: a.id, take: false, price }, `${nm}: no buyout`)] },
  ];
  return { iid: `ev${s.nextId++}`, defId: 'showbiz_buyme', week: s.week, mandatory: false, priority: 30, title: `${nm} wants out`, text: `${nm} came to see you with a lawyer's letter and a cashier's check for ${fmtMoney(price)}. They want to buy back their contract. They are polite about it. They have made up their mind.`, choices, defaultChoiceId: 'take', actors: [a.id] };
}

function suitEvent(s: GameState, a: Act, price: number): EventInstance {
  const nm = billOf(s, a);
  const choices: Choice[] = [
    { id: 'settle', label: `Settle quietly (${fmtMoney(price)})`, detail: 'They drop it and stay under contract.', because: `settled ${nm}'s suit`, effects: [{ type: 'money', amount: -price, category: 'consequence', label: `${nm}: the settlement` }, SX({ op: 'suit', id: a.id, how: 'settle', price }, `${nm}: settled`)] },
    { id: 'release', label: 'Let them out of the contract', detail: 'No court, no papers. They go.', because: `let ${nm} out rather than go to court`, effects: [SX({ op: 'suit', id: a.id, how: 'release', price }, `${nm}: released`)] },
    { id: 'fight', label: 'Fight it in court ($800 for the lawyers)', detail: 'Win, and they are yours and furious. Lose, and the contract is void and the papers have it.', because: `fought ${nm}'s suit`, effects: [{ type: 'money', amount: -800, category: 'consequence', label: `${nm}'s suit: the lawyers` }, { type: 'heat', bar: 'local', amount: 1, label: `${nm}'s suit in the papers` }, SX({ op: 'suit', id: a.id, how: 'fight', price }, `${nm}: in court`)] },
  ];
  return { iid: `ev${s.nextId++}`, defId: 'showbiz_suit', week: s.week, mandatory: false, priority: 32, title: `${nm} is suing you`, text: `${nm}'s lawyer filed in Camden: an unfair contract, money owed, bookings promised and never made. The columnists will have it by Friday.`, choices, defaultChoiceId: 'settle', actors: [a.id] };
}

function probeEvent(s: GameState, L: NonNullable<ShowbizState['label']>): EventInstance {
  const choices: Choice[] = [
    { id: 'lawyer', label: 'Lawyers and a clean set of books ($1,500)', detail: 'It goes away, mostly.', because: 'answered the payola investigators with lawyers', effects: [{ type: 'money', amount: -1500, category: 'consequence', label: `${L.name}: the lawyers` }, { type: 'heat', bar: 'federal', amount: 2, label: 'The payola investigation' }, SX({ op: 'probe', how: 'lawyer' }, 'The payola investigation')] },
    { id: 'dj', label: 'Let a disc jockey take the fall', detail: 'He loses his show; your acts see how you treat the people who help you.', because: 'let a disc jockey take the payola fall', effects: [{ type: 'respect', amount: -2, label: 'Hung a disc jockey out to dry' }, SX({ op: 'probe', how: 'dj' }, 'The payola investigation')] },
    { id: 'stonewall', label: 'Stonewall them', detail: 'Free, today. They write your name down.', because: 'stonewalled the payola investigators', effects: [{ type: 'heat', bar: 'federal', amount: 6, label: 'Stonewalled the payola investigators' }, SX({ op: 'probe', how: 'stonewall' }, 'The payola investigation')] },
  ];
  return { iid: `ev${s.nextId++}`, defId: 'showbiz_probe', week: s.week, mandatory: false, priority: 40, title: `Payola: questions about ${L.name}`, text: `A man from the House subcommittee's staff has been asking the Philadelphia disc jockeys who pays them to play ${L.name}'s records. Two of them have lawyers now. One of them has your name.`, choices, defaultChoiceId: 'lawyer' };
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

const ETHS: Ethnicity[] = ['Italian', 'Italian', 'Irish', 'Jewish', 'Black', 'Black'];
const KINDS: ActKind[] = ['singer', 'singer', 'group', 'comic', 'band', 'dancer', 'dancer', 'actor'];

/** New talent: one to three acts a season, some of them the island's own kids (all adults). */
function newTalent(s: GameState, S: ShowbizState): void {
  const live = Object.values(S.acts).filter((a) => actAdult(s, a)).length;
  const n = withRng(s, S, () => 1 + Math.floor(rand(s) * 2) + (live < 25 ? 1 : 0));
  for (let i = 0; i < n && Object.keys(S.acts).length < BENCH_CAP; i++) {
    const x = withRng(s, S, (): BenchSeed => {
      const k = pickH(s, KINDS);
      const eth = pickH(s, ETHS);
      const g: 'M' | 'F' = k === 'band' || k === 'comic' ? (rand(s) < 0.85 ? 'M' : 'F') : k === 'dancer' ? (rand(s) < 0.7 ? 'F' : 'M') : rand(s) < 0.5 ? 'M' : 'F';
      const loc = rand(s) < 0.4;
      const age = loc ? 18 + Math.floor(rand(s) * 4) : 19 + Math.floor(rand(s) * 22);
      const groupName = k === 'group' ? `${pickH(s, GROUP_A)}${pickH(s, GROUP_B)}` : undefined;
      return {
        k, g, eth, age, f: '', l: '', tal: 45 + Math.floor(rand(s) * 40), fame: loc ? Math.floor(rand(s) * 6) : Math.floor(rand(s) * 30), amb: 40 + Math.floor(rand(s) * 55),
        ...(loc ? { loc: 1 as const } : {}), ...(groupName ? { n: groupName } : {}),
        who: loc ? 'A kid from the island with talent: works days, sings nights.' : `New on the shore circuit this season (${KIND_LABEL[k].toLowerCase()}).`,
      };
    });
    // A blank name: makeCharacter draws one for the background.
    const a = makeAct(s, S, { ...x, f: undefined as unknown as string, l: undefined as unknown as string });
    a.ph = freePhoto(s, S, a);
    S.stats.arrived++;
    slog(s, S, `New on the circuit: ${actName(s, a)} (${KIND_LABEL[a.k].toLowerCase()}${a.loc ? ', a local kid' : ''}).`);
  }
}

/** The bench stays near its size: old, forgotten acts drift out of the business (the character lives on). */
function retire(s: GameState, S: ShowbizState): void {
  for (const a of Object.values(S.acts)) {
    const c = s.characters[a.id];
    if (!c?.alive) { delete S.acts[a.id]; continue; }
    if (a.by === 'p') continue;
    const age = ageOn(c.birth, s.date);
    if (age >= 68 || (Object.keys(S.acts).length > BENCH_CAP - 4 && a.fame < 12 && age >= 40)) {
      slog(s, S, `${actName(s, a)} left the business.`);
      delete S.acts[a.id];
      if (c.office && /Singer|Comic|Dancer|Actor|Bandleader|Vocal group/.test(c.office)) c.office = `Retired ${c.office.split(',')[0].toLowerCase()}`;
    }
  }
}

function friendCheck(ctx: Ctx, S: ShowbizState, a: Act): void {
  const s = ctx.s;
  const c = s.characters[a.id];
  if (!c) return;
  if (a.friend === undefined && a.by === 'p' && a.fame >= 55 && a.con >= 75 && a.grudge === undefined) {
    a.friend = s.week;
    addOpinion(s, c.id, s.playerId, 'He made me', 15, 0);
    respect(ctx, 1, `${billOf(s, a)} tells everyone who made them`, 'event');
    hist(s, a, 'A grateful star: tells everybody who made them.');
    slog(s, S, `${billOf(s, a)} is a friend for life.`);
  } else if (a.friend !== undefined && a.con < 45) {
    delete a.friend;
    hist(s, a, 'Not your friend any more.');
  }
  if (a.friend === undefined || a.by !== 'p') return;
  const age = s.week - a.friend;
  const club = ownsClub(s);
  if (club && age > 0 && age % 4 === 0) money(ctx, Math.round(a.fame * 3), `${billOf(s, a)} dropped in at ${club.name}: the room filled`, 'business');
  if (age > 0 && age % SEASON === 0) {
    const pol = Object.values(s.characters).filter((x) => x.alive && x.office && x.rank === 'civilian' && !S.acts[x.id] && /mayor|commission|council|judge|senator|assembl|chief/i.test(x.office)).sort((x, y) => (x.id < y.id ? -1 : 1));
    const who = pol.length ? pol[(s.week + a.fame) % pol.length] : undefined;
    if (who) {
      addOpinion(s, who.id, s.playerId, `Met him through ${billOf(s, a)}`, 8, 1);
      slog(s, S, `${billOf(s, a)} introduced you to ${displayName(who)} (${who.office}).`);
    }
  }
}

function gigWeek(ctx: Ctx, S: ShowbizState, a: Act): void {
  const s = ctx.s;
  const g = a.gig!;
  const R = RUNGS[g.r];
  const nm = billOf(s, a);
  const c = s.characters[a.id];
  const gross = Math.round(R.pay * (0.5 + a.draw / 100));
  a.wk = gross;
  if (a.by === 'p' && a.deal) {
    const cut = Math.round((gross * a.deal.pct) / 100);
    if (cut > 0) money(ctx, cut, `${nm}: your ${a.deal.pct}% of the week at ${g.room}`, 'business');
    a.earn += cut;
    if (c) c.wealth += gross - cut;
    if (g.own) money(ctx, Math.round(a.draw * 2.5), `${g.room}: a full house for ${nm}`, 'business');
  }
  if (s.week + 1 < g.until) return;
  // The notices.
  const ok = withRng(s, S, () => rand(s)) < Math.max(0.1, Math.min(0.92, 0.45 + (a.tal - R.diff) / 100 + (a.con - 50) / 300));
  if (ok) {
    a.draw = clamp(a.draw + 3 + g.r * 2);
    a.fame = clamp(a.fame + 2 + g.r * 3);
    a.con = clamp(a.con + 6);
    if (g.r > a.top) { a.top = g.r; slog(s, S, `${nm} made it to ${R.name}.`); }
    hist(s, a, `Good notices at ${g.room}.`);
    if (g.r >= 2 && a.by === 'p') pressItem(s, { s: 'ent', h: `${nm} a hit in ${R.name}`, b: `${nm}, a Wildwood favorite, closed a run at ${g.room} to the kind of notices the shore only reads about.`, a: 'town' });
  } else {
    a.draw = clamp(a.draw - 3);
    a.fame = clamp(a.fame - 1);
    a.con = clamp(a.con - 5);
    hist(s, a, `Flopped at ${g.room}.`);
  }
  S.stats.gigs++;
  delete a.gig;
  a.idle = s.week;
}

/** Contentment, the contract running out, and the scenes an unhappy act makes. */
function willWeek(ctx: Ctx, S: ShowbizState, a: Act): void {
  const s = ctx.s;
  const c = s.characters[a.id];
  if (!c) return;
  const nm = billOf(s, a);
  if (a.by !== 'p' || !a.deal) {
    // Away from you: the act drifts toward content, and works the circuit on its own.
    if (s.week % 4 === 0) {
      a.con = clamp(a.con + Math.sign(55 - a.con) * 2);
      const d = withRng(s, S, () => Math.floor(rand(s) * 5) - 2);
      a.draw = clamp(a.draw + d + (a.tal > a.draw + 20 ? 1 : 0));
      if (a.by && a.by !== 'ind') a.fame = clamp(a.fame + (a.tal >= 70 && d > 0 ? 1 : 0));
    }
    if (a.grudge !== undefined && s.week - a.grudge > 104) delete a.grudge;
    return;
  }
  const odd = s.week % 2 === 0;
  let d = 0;
  if (a.gig) d += a.gig.r >= ambRung(a) - 1 ? 1 : odd ? -1 : 0;
  else if (s.week - (a.idle ?? a.deal.since) > 6) d -= 1;
  if (a.deal.pct > 30 && odd) d -= 1;
  if (a.deal.pct <= 15 && odd) d += 1;
  a.con = clamp(a.con + d);
  if (a.lean !== undefined && s.week - a.lean < 52) a.con = Math.min(a.con, 50);
  friendCheck(ctx, S, a);
  // The contract runs out: they stay if they are happy.
  if (s.week >= a.deal.until) {
    if (a.con >= 65 && a.grudge === undefined) {
      a.deal.until = s.week + 52;
      hist(s, a, 'Re-signed for another year.');
      slog(s, S, `${nm} re-signed with you for another year.`);
    } else {
      const R = withRng(s, S, () => rand(s));
      a.by = R < 0.35 ? 'manno' : R < 0.6 ? 'feldstein' : undefined;
      delete a.deal; delete a.gig; delete a.friend;
      a.con = 55;
      hist(s, a, `Left you when the contract ran out${a.by ? ` (signed with ${managerLabel(a).toLowerCase()})` : ''}.`);
      slog(s, S, `${nm} walked when the contract ran out.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${nm} did not re-sign with you when the contract ran out.`, kind: 'consequence' });
      S.stats.left++;
    }
    return;
  }
  if (a.scene !== undefined && s.week - a.scene < 10) return;
  const r = withRng(s, S, () => rand(s));
  const left = a.deal.until - s.week;
  if (a.con <= 30 && a.spurned === undefined && a.fame >= 20 && r < 0.12) {
    const weekly = a.earn / Math.max(1, s.week - a.deal.since);
    const price = Math.max(500, Math.round((left * weekly * 0.6 + a.deal.adv) / 100) * 100);
    s.eventQueue.push(buymeEvent(s, a, price));
    a.scene = s.week;
  } else if ((a.con <= 20 || (a.spurned !== undefined && a.con <= 35)) && r < 0.1) {
    s.eventQueue.push(suitEvent(s, a, Math.max(800, Math.round(a.fame * 40 / 100) * 100)));
    a.scene = s.week;
  } else if ((a.grudge !== undefined || a.lean !== undefined) && a.con <= 25 && r < 0.06) {
    a.scene = s.week;
    const feds = hasTrait(c, 'Honest') || r < 0.02;
    if (feds) {
      addFedEvidence(s, s.playerId, 4, `${nm} told the FBI about the contract`);
      heat(ctx, 'federal', 3, `${nm} talked to the FBI`, 'consequence');
      slog(s, S, `${nm} talked to the FBI about how you do business.`);
    } else {
      pressItem(s, { s: 'ent', h: `${nm} tells all`, b: `${nm} told a columnist this week who really books the shore acts, and what happens to an act that says no.`, a: 'boss', fx: { resp: -2, heat: [['local', 2]] } });
      slog(s, S, `${nm} talked to a columnist about you.`);
    }
    hist(s, a, feds ? 'Talked to the FBI.' : 'Talked to the papers.');
  }
}

function labelWeek(ctx: Ctx, S: ShowbizState): void {
  const s = ctx.s;
  const L = S.label;
  if (!L) return;
  money(ctx, -40, `${L.name}: the office and the promo man`, 'cost');
  let radio = 0;
  for (const rec of L.recs) {
    if (rec.done) continue;
    const a = S.acts[rec.act];
    if (!a || s.week - rec.wk >= 10) { rec.done = 1; continue; }
    const noise = withRng(s, S, () => Math.floor(rand(s) * 17) - 8);
    const score = 0.4 * a.tal + 0.4 * a.draw + rec.jb * 6 + rec.radio * 14 + (L.home === 'Philadelphia' ? 6 : 0) + noise;
    const reach: 0 | 1 | 2 = score >= 88 ? 2 : score >= 72 ? 1 : 0;
    const sales = Math.round((score * score) / 12) * (reach === 2 ? 3 : 1);
    rec.sold += sales;
    const take = Math.round(sales * 0.1);
    if (take > 0) money(ctx, take, `${L.name}: "${rec.title}" (${sales.toLocaleString()} copies)`, 'business');
    rec.roy += take;
    const c = s.characters[a.id];
    if (c) c.wealth += Math.round(sales * 0.02);
    if (sales > 250 && a.by === 'p') a.con = clamp(a.con + 1);
    if (rec.radio) {
      money(ctx, rec.radio === 2 ? -180 : -60, `${L.name}: the disc jockeys ("${rec.title}")`, 'cost');
      radio = Math.max(radio, rec.radio);
    }
    if (reach > rec.reach) {
      const nm = billOf(s, a);
      rec.reach = reach;
      if (reach === 2) {
        a.fame = clamp(a.fame + 10); a.draw = clamp(a.draw + 12); a.hit = s.week;
        L.hits++; S.stats.hits++;
        hist(s, a, `"${rec.title}" went national.`);
        slog(s, S, `"${rec.title}" by ${nm} is a national hit.`);
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `"${rec.title}" by ${nm}, on your ${L.name}, went national.`, kind: 'misc' });
        pressItem(s, { s: 'ent', h: `Wildwood record goes national`, b: `"${rec.title}" by ${nm} (${L.name}) is on the national charts this week.`, a: 'town' });
      } else {
        a.fame = clamp(a.fame + 4); a.draw = clamp(a.draw + 5);
        hist(s, a, `"${rec.title}" is a regional hit.`);
        slog(s, S, `"${rec.title}" by ${nm} is climbing the Philadelphia charts.`);
      }
    }
  }
  // Payola: the disc jockeys talk, and the government listens.
  if (radio) {
    L.heat = clamp(L.heat + radio * 2);
    if (radio === 2 ? s.week % 2 === 0 : s.week % 4 === 0) heat(ctx, 'federal', 1, `Payola at ${L.name}`, 'heat');
  } else L.heat = clamp(L.heat - 1);
  if (L.heat >= 45 && (L.probe === undefined || s.week - L.probe > 26) && withRng(s, S, () => rand(s)) < (L.heat - 35) / 150) {
    L.probe = s.week;
    s.eventQueue.push(probeEvent(s, L));
  }
}

/** Rival offices sign the free agents with a name (a season's business). */
function rivalsSign(s: GameState, S: ShowbizState): void {
  for (const a of Object.values(S.acts)) {
    if (a.by || a.fame < 30 || !actAdult(s, a)) continue;
    const r = withRng(s, S, () => rand(s));
    if (r < 0.2) {
      a.by = r < 0.1 ? 'manno' : 'feldstein';
      a.con = 55;
      hist(s, a, `Signed with ${managerLabel(a).toLowerCase()}.`);
    }
  }
}

export function showbizWeek(ctx: Ctx): void {
  const s = ctx.s;
  const S = ensureShowbiz(s);
  retire(s, S);
  for (const a of Object.values(S.acts).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (!actAdult(s, a)) continue;
    if (a.gig) gigWeek(ctx, S, a);
    willWeek(ctx, S, a);
  }
  for (const room of Object.keys(S.pts) as RoomId[]) money(ctx, ROOMS[room].div, `Your point in ${ROOMS[room].room}`, 'business');
  labelWeek(ctx, S);
  if (s.week > 0 && s.week % SEASON === 0) {
    newTalent(s, S);
    rivalsSign(s, S);
  }
}

/** The acts the paper bills this week (the boss's acts at the shore). */
export function billings(s: GameState): { room: string; act: string; own: boolean }[] {
  return mine(s).filter((a) => a.gig && a.gig.r === 0).map((a) => ({ room: a.gig!.room, act: billOf(s, a), own: !!a.gig!.own }));
}
