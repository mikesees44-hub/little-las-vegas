import { isInSeason } from './calendar';
import { mgEffect } from './minigame';
import { crew, displayName, isFree, makeCharacter, player } from './characters';
import { applyEffects } from './effects';
import { addStory, tidyRegimes } from './hierarchy';
import { addSuccess } from './attrs';
import type { Acceptance, Reason } from './interactions';
import { money, respect, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { chance } from './rng';
import { pw, type Station } from './powerState';
import { aStation, RANK_LADDER, stationOf, unlocksBetween } from './rankView';
import type { Character, Effect, EventInstance, GameState, Trait } from './types';

/**
 * THE FAMILY ABOVE YOU (LOW START DESIGN). When the player starts below the
 * chair he is somebody in a real family: Don Cosimo Valente, his underboss,
 * his consigliere, three capos with made men under them, the Don's son and the
 * other kids waiting for the books. They are named people (faction 'none',
 * not the player's men) listed here, so the org chart, the map legend, the
 * Rivals screen and the scenes can show them.
 *
 * The climb lives here too: STANDING with the family (0-100), the weekly
 * QUOTA your chief expects in the kick-up, ORDERS that come down, the made
 * men who VOUCH for you, and the sit-downs where you are moved up. Every
 * result is written to the chronicle (Your File).
 */

export interface AboveFamily {
  /** The family's name ("Valente"). */
  name: string;
  bossId: string;
  underbossId?: string;
  consigliereId?: string;
  capoIds: string[];
  /** Each capo's men (made men and associates), by capo id. */
  regimes: Record<string, string[]>;
  /** The capo whose crew you are in (associate, soldier). */
  myCapoId?: string;
  /** The Don's son. */
  sonId?: string;
  /** The other kid waiting for the same slot (associate). */
  rivalId?: string;
  /** Your standing with the family, 0-100. */
  standing: number;
  /** Made men who agreed to stand up for you. */
  sponsors: string[];
  /** What your chief expects in the kick-up every Monday. */
  quota: number;
  /** Short weeks carried, still owed. */
  owed: number;
  /** Weeks in a row the quota was met. */
  streak: number;
  /** Weeks the quota was missed (all told). */
  missed: number;
  /** Last week's kick-up. */
  lastKick?: number;
  /** The last in-season kick-ups (the quota is sized to them: Top 10 #4b). */
  kicks?: number[];
  /** When the next order comes down. */
  nextOrder: number;
  /** Orders that came down so far. */
  orders: number;
  /** The week you asked at the open books (one ask per opening). */
  booksAsked?: number;
  /** The week you reached this rung. */
  rungSince: number;
  /** Standing moves, most recent last (capped). */
  log: { w: number; t: string; d: number }[];
}

/** The quota at each rung (a base; it rises with a good record). */
/** The weekly kick-up the chief expects, by rung (Top 10 #4b: the associate's was 300, missed 17 times a year). */
export const QUOTA: Partial<Record<Station, number>> = { associate: 150, soldier: 400, capo: 600, underboss: 0 };
/** The most standing a short Monday costs (was 3). */
export const SHORT_LOSS = 2;
/** The quota never goes below this; a short chief settles for this share of the man's average in-season kick. */
export const QUOTA_MIN = 30;
export const QUOTA_FAIR = 0.8;
/** After this many "Short on Monday" cards with the debt still open, no more cards: the debt stands on its own. */
export const SHORT_CARDS = 3;
/** The standing an associate needs before his name can go up. */
export const MADE_STANDING = 35;
/** The standing a man needs before the boss will hear him ask to move up. */
export const CALLIN_STANDING = 55;

export function above(s: GameState): AboveFamily | undefined {
  return s.power?.above;
}

/** Everyone in the family above (alive or dead). */
export function aboveIds(s: GameState): string[] {
  const a = above(s);
  if (!a) return [];
  const ids = [a.bossId, a.underbossId, a.consigliereId, ...a.capoIds, ...Object.values(a.regimes).flat(), a.sonId, a.rivalId];
  return [...new Set(ids.filter((x): x is string => !!x))];
}

export function inAbove(s: GameState, id: string): boolean {
  return aboveIds(s).includes(id);
}

export type AboveRole = 'boss' | 'underboss' | 'consigliere' | 'capo' | 'soldier' | 'associate';

/** His place in the family above (undefined: not one of them). */
export function aboveRole(s: GameState, id: string): AboveRole | undefined {
  const a = above(s);
  if (!a) return undefined;
  if (id === a.bossId) return 'boss';
  if (id === a.underbossId) return 'underboss';
  if (id === a.consigliereId) return 'consigliere';
  if (a.capoIds.includes(id)) return 'capo';
  if (!inAbove(s, id)) return undefined;
  const c = s.characters[id];
  return c?.rank === 'associate' ? 'associate' : 'soldier';
}

/** The words next to his name: "capo, Valente family". */
export function aboveLabel(s: GameState, id: string): string | undefined {
  const r = aboveRole(s, id);
  const a = above(s);
  if (!r || !a) return undefined;
  const son = id === a.sonId ? ', the Don\'s son' : '';
  return r === 'boss' ? `boss of the ${a.name} family` : `${r}${son}, ${a.name} family`;
}

/** The man the player answers to: his capo, else the underboss, else the Don. */
export function chiefOf(s: GameState): Character | undefined {
  const a = above(s);
  if (!a) return undefined;
  const st = stationOf(s);
  const ids = st === 'associate' || st === 'soldier' ? [a.myCapoId, a.underbossId, a.bossId] : st === 'capo' ? [a.underbossId, a.bossId] : [a.bossId];
  for (const id of ids) {
    const c = id ? s.characters[id] : undefined;
    if (c?.alive) return c;
  }
  return undefined;
}

/** The Don (alive or not). */
export function donOf(s: GameState): Character | undefined {
  const a = above(s);
  const id = a?.bossId ?? s.power?.overId;
  return id ? s.characters[id] : undefined;
}

/* ------------------------------------------------------------------ */
/* Building the family                                                 */
/* ------------------------------------------------------------------ */

const STAFF: { first: string; last: string; nick?: string; age: number; traits: Trait[] }[] = [
  { first: 'Aldo', last: 'Ferrante', nick: 'the Deacon', age: 54, traits: ['Patient', 'Ambitious'] },
  { first: 'Benedetto', last: 'Sacco', nick: 'Professor', age: 66, traits: ['Patient', 'Honest'] },
  { first: 'Nunzio', last: 'Lombardi', nick: 'Fat Nunzi', age: 47, traits: ['Greedy', 'Gambler'] },
  { first: 'Carmine', last: 'Pastore', nick: 'the Pope', age: 51, traits: ['Pious', 'Cruel'] },
  { first: 'Rocco', last: 'DiNapoli', nick: 'Bad Eye', age: 43, traits: ['Hot-headed', 'Loyal-to-a-fault'] },
];
const SON = { first: 'Cosimo', last: 'Valente', nick: 'Junior', age: 26, traits: ['Hot-headed', 'Womanizer'] as Trait[] };

function quiet<T>(s: GameState, migrate: boolean, fn: () => T): T {
  // A save migrated at load must not move the main dice.
  const r = s.rng;
  const out = fn();
  if (migrate) s.rng = r;
  return out;
}

function member(s: GameState, rank: Character['rank'], name: { first: string; last: string; nick?: string; age: number; traits: Trait[] } | undefined): Character {
  const c = makeCharacter(s, { firstName: name?.first, lastName: name?.last, gender: 'M', ethnicity: 'Italian', age: name?.age, rank, faction: 'none', nickname: !name || !!name.nick, traits: name?.traits });
  if (name?.nick) c.nickname = name.nick;
  c.wealth = rank === 'capo' ? 12000 : rank === 'underboss' || rank === 'consigliere' ? 20000 : rank === 'soldier' ? 4000 : 900;
  return c;
}

/**
 * Build the family above for a low start: the Don (the existing over-boss, or
 * a new one), an underboss, a consigliere, three capos (one of them `myCapo`,
 * reused when given), made men under each, the Don's son, and (for an
 * associate) another kid waiting on the same books.
 */
export function buildAbove(s: GameState, st: Station, opts: { myCapoId?: string; migrate?: boolean } = {}): AboveFamily {
  return quiet(s, !!opts.migrate, () => {
    const p = pw(s);
    const boss = p.overId && s.characters[p.overId] ? s.characters[p.overId] : member(s, 'boss', { first: 'Cosimo', last: 'Valente', nick: 'the Undertaker', age: 58, traits: ['Patient', 'Paranoid'] });
    boss.rank = 'boss';
    boss.faction = 'none';
    boss.office = undefined;
    p.overId = boss.id;
    const ub = member(s, 'underboss', STAFF[0]);
    const cons = member(s, 'consigliere', STAFF[1]);
    const capoIds: string[] = [];
    const regimes: Record<string, string[]> = {};
    const reuse = opts.myCapoId ? s.characters[opts.myCapoId] : undefined;
    if (reuse && (st === 'associate' || st === 'soldier')) {
      reuse.faction = 'none';
      reuse.rank = 'capo';
      reuse.capoId = undefined;
      reuse.office = undefined;
      capoIds.push(reuse.id);
    }
    for (const n of STAFF.slice(2)) {
      if (capoIds.length >= 3) break;
      capoIds.push(member(s, 'capo', n).id);
    }
    // The player himself is the third capo when he starts as one.
    if (st === 'capo') capoIds.splice(2);
    for (const k of capoIds) regimes[k] = [member(s, 'soldier', undefined).id, member(s, 'soldier', undefined).id];
    const son = member(s, 'soldier', SON);
    son.fatherId = boss.id;
    if (!boss.childrenIds.includes(son.id)) boss.childrenIds.push(son.id);
    regimes[capoIds[capoIds.length - 1]]?.push(son.id);
    const myCapoId = st === 'associate' || st === 'soldier' ? capoIds[0] : undefined;
    let rivalId: string | undefined;
    if (st === 'associate' && myCapoId) {
      const kid = member(s, 'associate', undefined);
      kid.birth = { ...kid.birth, y: s.date.y - 24 };
      regimes[myCapoId].push(kid.id);
      rivalId = kid.id;
    }
    const a: AboveFamily = {
      name: boss.lastName, bossId: boss.id, underbossId: ub.id, consigliereId: cons.id, capoIds, regimes, myCapoId, sonId: son.id, rivalId,
      standing: st === 'capo' ? 35 : st === 'soldier' ? 25 : 15, sponsors: [], quota: QUOTA[st] ?? 0, owed: 0, streak: 0, missed: 0,
      nextOrder: s.week + 2, orders: 0, rungSince: s.week, log: [],
    };
    p.above = a;
    // They know who you are, more or less.
    const me = s.playerId;
    addOpinion(s, boss.id, me, st === 'capo' ? 'One of my capos' : 'One of our people', st === 'capo' ? 10 : 3, 0);
    addOpinion(s, ub.id, me, st === 'capo' ? 'A capo who earns' : 'Somebody\'s kid', st === 'capo' ? 5 : 0, 0);
    if (myCapoId) addOpinion(s, myCapoId, me, st === 'soldier' ? 'One of my soldiers' : 'Hangs around my crew', 12, 0);
    if (rivalId) addOpinion(s, rivalId, me, 'Wants the same slot I want', -15, 0);
    if (son) addOpinion(s, son.id, me, 'Thinks he\'s somebody', -5, 0);
    return a;
  });
}

/** An old save at a low station gets the family above, once (the dice do not move). */
export function ensureAbove(s: GameState): void {
  const p = s.power;
  if (!p || p.above) return;
  const st = p.station;
  if (st !== 'associate' && st !== 'soldier' && st !== 'capo' && st !== 'underboss') return;
  // Only a game that started low (a fallen boss kneels to the man who took his chair, as before).
  if (!s.flags.start_associate && !s.flags.start_soldier && !s.flags.start_capo) return;
  buildAbove(s, st, { migrate: true });
  // Nobody in his own crew outranks him any more: the old saves made his brother a capo under an associate.
  const cap: Character['rank'] = st === 'capo' || st === 'underboss' ? 'soldier' : 'associate';
  const order: Character['rank'][] = ['associate', 'soldier', 'capo', 'consigliere', 'underboss'];
  for (const c of crew(s)) {
    if (order.indexOf(c.rank) > order.indexOf(cap)) {
      c.rank = cap;
      c.capoId = undefined;
    }
  }
  for (const d of s.districts) if (d.capoId && s.characters[d.capoId]?.rank !== 'capo') d.capoId = undefined;
  clearCouncil(s);
}

/** Below underboss he has no council: every seat is empty (the seats open when he climbs). */
export function clearCouncil(s: GameState): void {
  if (!s.council) return;
  for (const seat of Object.values(s.council)) seat.holderId = undefined;
}

/* ------------------------------------------------------------------ */
/* Standing                                                            */
/* ------------------------------------------------------------------ */

export function standingOf(s: GameState): number {
  return Math.round(above(s)?.standing ?? 0);
}

export function standingWord(n: number): string {
  return n >= 80 ? 'Somebody they count on' : n >= 60 ? 'Well thought of' : n >= 40 ? 'Noticed' : n >= 20 ? 'One of the kids' : 'Nobody yet';
}

export function shiftStanding(s: GameState, by: number, why: string): void {
  const a = above(s);
  if (!a || !by) return;
  const was = a.standing;
  a.standing = Math.max(0, Math.min(100, a.standing + by));
  const d = Math.round(a.standing - was);
  if (!d) return;
  a.log.push({ w: s.week, t: why, d });
  if (a.log.length > 30) a.log.splice(0, a.log.length - 30);
}

/* ------------------------------------------------------------------ */
/* Effects (power op 'low') and orders (power action 'low')            */
/* ------------------------------------------------------------------ */

export type LowOp =
  | { op: 'standing'; by: number; why: string }
  /** A roll that resolves as the answer lands: the odds were on the card. */
  | { op: 'roll'; p: number; title: string; win: Effect[]; lose: Effect[]; winText: string; loseText: string }
  | { op: 'sponsor'; id: string }
  | { op: 'settle' }
  | { op: 'forgive' }
  | { op: 'promote'; to: Station; why: string }
  | { op: 'booksAsked' }
  | { op: 'callIn' }
  | { op: 'chair'; why: string }
  | { op: 'succeed'; backed: boolean }
  | { op: 'exile' };

export type LowAction =
  | { op: 'askVouch'; id: string }
  | { op: 'coffee'; id: string }
  | { op: 'callIn' };

export function describeLowOp(s: GameState, o: LowOp): string | undefined {
  switch (o.op) {
    case 'standing': return `Standing with the family ${o.by > 0 ? '+' : '−'}${Math.abs(o.by)}`;
    case 'roll': return `${Math.round(o.p * 100)}% it goes your way`;
    case 'sponsor': return `${s.characters[o.id]?.firstName ?? 'He'} will stand up for you`;
    case 'settle': return `Pay what you owe up the ladder (${fmt$(above(s)?.owed ?? 0)})`;
    case 'forgive': return 'What you owe is forgiven';
    case 'promote': return `You become ${aStation(o.to)}`;
    case 'booksAsked': return undefined;
    case 'callIn': return stationOf(s) === 'associate' ? 'Your name goes up when the books open' : 'A sit-down with the boss';
    case 'chair': return 'You take the chair';
    case 'succeed': return o.backed ? 'The underboss takes the chair, and remembers you backed him' : 'The underboss takes the chair';
    case 'exile': return 'Florida, until it is safe';
  }
}

export function applyLowOp(ctx: Ctx, o: LowOp, label: string): void {
  const s = ctx.s;
  const a = above(s);
  switch (o.op) {
    case 'standing':
      shiftStanding(s, o.by, o.why);
      break;
    case 'roll': {
      const ok = chance(pw(s), o.p);
      const fx = ok ? o.win : o.lose;
      if (fx.length) applyEffects(ctx, fx, { label: o.title, because: o.title, category: 'event' });
      const line = `${o.title}: ${ok ? o.winText : o.loseText} (${Math.round(o.p * 100)}% odds)`;
      ctx.log.push(line);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'decision' });
      break;
    }
    case 'sponsor': {
      if (!a || a.sponsors.includes(o.id)) break;
      const c = s.characters[o.id];
      if (!c?.alive) break;
      a.sponsors.push(o.id);
      const line = `${displayName(c)} will stand up for you when the books open.`;
      ctx.log.push(line);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'decision' });
      break;
    }
    case 'settle': {
      if (!a || a.owed <= 0) break;
      const amt = a.owed;
      a.owed = 0;
      money(ctx, -amt, `Made it up to ${chiefOf(s)?.firstName ?? 'your chief'}: what you were short`, 'tribute');
      break;
    }
    case 'forgive':
      if (a) a.owed = 0;
      break;
    case 'promote':
      promote(ctx, o.to, o.why);
      break;
    case 'booksAsked':
      if (a) a.booksAsked = s.week;
      break;
    case 'callIn':
      pw(s).climbWeek = s.week;
      queueCallIn(s);
      break;
    case 'chair':
      takeTheChair(ctx, o.why);
      break;
    case 'succeed':
      succeedQuietly(ctx, o.backed);
      break;
    case 'exile': {
      const p = pw(s);
      p.station = 'exile';
      p.fallenWeek = s.week;
      p.fell = true;
      respect(ctx, -10, 'Lost the fight for the chair', 'event');
      const line = 'You made your claim and lost. Florida, until it is safe to come home.';
      ctx.log.push(line);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'succession' });
      break;
    }
  }
  void label;
}

/** The odds a made man agrees to vouch for you, with reasons. */
export function vouchOdds(s: GameState, c: Character): Acceptance {
  const reasons: Reason[] = [];
  const add = (label: string, v: number) => { if (Math.round(v)) reasons.push({ label, value: Math.round(v) }); };
  add('Base', 15);
  add(`What ${c.firstName} thinks of you`, opinion(s, c.id, s.playerId) * 0.6);
  add('Your standing with the family', (standingOf(s) - 30) * 0.6);
  if (c.id === above(s)?.myCapoId) add('You are in his crew', 15);
  if (c.traits.includes('Paranoid')) add('He trusts nobody', -10);
  if (c.traits.includes('Greedy')) add('He likes an earner', 5);
  return { chance: Math.max(0.05, Math.min(0.9, reasons.reduce((x, r) => x + r.value, 0) / 100)), reasons };
}

/** Who could vouch for you: made men of the family above who are alive and not already behind you. */
export function vouchCandidates(s: GameState): Character[] {
  const a = above(s);
  if (!a) return [];
  return aboveIds(s).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive && isFree(s, c) && c.rank !== 'associate' && c.id !== a.bossId && !a.sponsors.includes(c.id))
    // The likeliest first: your own capo, the men who know you.
    .sort((x, y) => vouchOdds(s, y).chance - vouchOdds(s, x).chance || x.id.localeCompare(y.id));
}

/** Previews for the Your Place screen's orders. */
export function previewLow(s: GameState, x: LowAction): { title: string; detail?: string; effects: Effect[]; cost: number; pot?: 'pocket'; acceptance?: Acceptance; refuseEffects?: Effect[]; because: string; disabledReason?: string; category: 'event' } {
  const base = { cost: 0, category: 'event' as const };
  const lowFx = (o: LowOp): Effect => ({ type: 'power', op: { op: 'low', o } });
  switch (x.op) {
    case 'askVouch': {
      const c = s.characters[x.id];
      const st = stationOf(s);
      return {
        ...base, title: `Ask ${c ? displayName(c) : 'him'} to vouch for you`, detail: 'When the books open, a made man has to stand up for you. If you go bad, it is on him.',
        effects: [lowFx({ op: 'sponsor', id: x.id }), lowFx({ op: 'standing', by: 2, why: `${c?.firstName ?? 'A made man'} will vouch for you` })],
        acceptance: c ? vouchOdds(s, c) : undefined,
        refuseEffects: c ? [{ type: 'opinion', from: c.id, to: s.playerId, amount: -4, reason: 'Asked me to put my name on him', decay: 1 }] : [],
        because: `asked ${c?.firstName ?? 'a made man'} to vouch for you`,
        disabledReason: !c?.alive ? 'He is gone' : st !== 'associate' ? 'You are already made' : above(s)?.sponsors.includes(x.id) ? 'He already vouches for you' : s.week - (s.flags[`vouch_${x.id}`] ?? -99) < 6 ? 'You asked him recently' : undefined,
      };
    }
    case 'coffee': {
      const c = s.characters[x.id];
      return {
        ...base, cost: 40, pot: 'pocket', title: `Coffee with ${c ? displayName(c) : 'him'} ($40)`, detail: 'The Doo Wop diner at seven. You pay, you listen, you don\'t ask for anything.',
        effects: [...(c ? [{ type: 'opinion', from: c.id, to: s.playerId, amount: 5, reason: 'Bought me coffee and listened', decay: 1 } as Effect] : []), { type: 'money', amount: -40 }, lowFx({ op: 'standing', by: 1, why: `Coffee with ${c?.firstName ?? 'a made man'}` })],
        because: `had coffee with ${c?.firstName ?? 'a made man'}`,
        disabledReason: !c?.alive ? 'He is gone' : s.week - (s.flags[`coffee_${x.id}`] ?? -99) < 3 ? 'Not again so soon' : undefined,
      };
    }
    case 'callIn': {
      const why = callInBlock(s);
      const nxt = nextRung(stationOf(s));
      return {
        ...base, title: stationOf(s) === 'associate' ? 'Ask to have your name put up' : `Ask ${donOf(s)?.firstName ?? 'the boss'} for a sit-down about moving up`,
        detail: stationOf(s) === 'associate' ? 'The books, your sponsor and your standing decide it. The ceremony, if it goes your way.' : `A sit-down at the Doo Wop. The odds are on the table when you sit; ${nxt ? `the next rung is ${aStation(nxt)}` : ''}.`,
        effects: [lowFx({ op: 'callIn' })], because: 'asked to move up', disabledReason: why,
      };
    }
  }
}

export function commitLow(ctx: Ctx, x: LowAction): void {
  const s = ctx.s;
  if (x.op === 'askVouch') s.flags[`vouch_${x.id}`] = s.week;
  if (x.op === 'coffee') s.flags[`coffee_${x.id}`] = s.week;
}

/* ------------------------------------------------------------------ */
/* Climbing                                                            */
/* ------------------------------------------------------------------ */

export function nextRung(st: Station): Station | undefined {
  const i = RANK_LADDER.indexOf(st);
  return i >= 0 && i < RANK_LADDER.length - 1 ? RANK_LADDER[i + 1] : undefined;
}

/** Why he cannot ask to move up now (undefined: he can). */
export function callInBlock(s: GameState): string | undefined {
  const st = stationOf(s);
  const a = above(s);
  if (!a || !inLadder(st)) return 'You are not in the family\'s ranks';
  if (st === 'underboss') return 'Nobody hands over the chair: it opens when the Don goes';
  if (s.pendingEvents.some((e) => e.defId === 'low_callin' || e.defId === 'low_made') || s.eventQueue.some((e) => e.defId === 'low_callin' || e.defId === 'low_made')) return 'The sit-down is already set';
  if (s.week - (s.power?.climbWeek ?? -99) < 8) return 'You asked recently (eight weeks between asks)';
  if (st === 'associate') {
    if (!a.sponsors.some((id) => s.characters[id]?.alive)) return 'A made man has to vouch for you first';
    if (!s.books?.open) return 'The books are closed: wait for them to open';
    if (a.standing < MADE_STANDING) return `Your standing is ${Math.round(a.standing)}; they want ${MADE_STANDING}`;
    return undefined;
  }
  if (a.standing < CALLIN_STANDING) return `Your standing is ${Math.round(a.standing)}; the boss hears men at ${CALLIN_STANDING}`;
  return undefined;
}

function inLadder(st: Station): boolean {
  return st === 'associate' || st === 'soldier' || st === 'capo' || st === 'underboss';
}

/** The odds the boss moves you up at the sit-down, with every reason. */
export function callInOdds(s: GameState): Acceptance {
  const a = above(s);
  const st = stationOf(s);
  const don = donOf(s);
  const chief = chiefOf(s);
  const reasons: Reason[] = [];
  const add = (label: string, v: number) => { if (Math.round(v)) reasons.push({ label, value: Math.round(v) }); };
  add('Base', st === 'associate' ? 25 : st === 'soldier' ? 15 : 5);
  add('Your standing with the family', ((a?.standing ?? 0) - 40) * 0.7);
  if (don?.alive) add(`What ${don.firstName} thinks of you`, opinion(s, don.id, s.playerId) * 0.3);
  if (chief?.alive && chief.id !== don?.id) add(`${chief.firstName}'s word for you`, opinion(s, chief.id, s.playerId) * 0.25);
  if (st === 'associate') add('Men who vouch for you', Math.min(20, (a?.sponsors.filter((id) => s.characters[id]?.alive).length ?? 0) * 10));
  add('Your record with the quota', Math.min(12, (a?.streak ?? 0) * 1.5) - Math.min(15, (a?.missed ?? 0) * 3));
  if (a && a.owed > 0) add('You still owe from a short week', -10);
  add('Time at this rung', Math.min(10, (s.week - (a?.rungSince ?? s.week)) / 3));
  add('Your heat', -Math.max(0, s.heat.federal - 20) / 2 - Math.max(0, s.heat.local - 40) / 3);
  if (st === 'capo') add('A seat has to open', -15);
  return { chance: Math.max(0.05, Math.min(0.9, reasons.reduce((x, r) => x + r.value, 0) / 100)), reasons };
}

/** Queue the sit-down scene (or, for an associate, the making). */
export function queueCallIn(s: GameState): void {
  if (s.pendingEvents.some((e) => e.defId === 'low_callin' || e.defId === 'low_made')) return;
  const ev = stationOf(s) === 'associate' ? buildLowScene(s, 'getmade') : buildLowScene(s, 'callin');
  s.pendingEvents.push(ev);
}

/** A low-rank scene as a popup (it opens by itself; "Let it play out" is always there). */
export function buildLowScene(s: GameState, game: 'getmade' | 'callin'): EventInstance {
  const iid = `ev${s.nextId++}`;
  const don = donOf(s);
  const made = game === 'getmade';
  const odds = callInOdds(s);
  return {
    iid, defId: made ? 'low_made' : 'low_callin', week: s.week, mandatory: true, priority: 98,
    meta: { scene: 1, low: 1, odds: Math.round(odds.chance * 100) },
    actors: [s.playerId, ...(don ? [don.id] : [])],
    title: made ? 'The books are open' : `${don?.firstName ?? 'The boss'} calls you in`,
    text: made ? `Your name went up. A made man stands for you. Tonight they find out if the family says yes (${Math.round(odds.chance * 100)}%).` : `Coffee at the Doo Wop, seven in the morning. ${don ? displayName(don) : 'The boss'} wants to hear what you think you are worth (${Math.round(odds.chance * 100)}%).`,
    defaultChoiceId: 'quiet',
    choices: [
      { id: 'play', label: made ? 'Go to the ceremony' : 'Sit down with him', detail: 'A short scene. The odds are on the table; the answer comes before you stand up.', because: made ? 'went to be made' : 'sat down with the boss', effects: [mgEffect(game, iid, { play: 1, p: Math.round(odds.chance * 100) })] },
      { id: 'quiet', label: 'Let it play out', because: made ? 'went to be made' : 'sat down with the boss', effects: [mgEffect(game, iid, { play: 0, p: Math.round(odds.chance * 100) })] },
    ],
  };
}

/** Move the player up one rung (or to `to`): the new station, the family above rearranged, the unlocks said out loud. */
export function promote(ctx: Ctx, to: Station, why: string): void {
  const s = ctx.s;
  const p = pw(s);
  const was = p.station;
  if (was === to) return;
  p.station = to;
  p.climbWeek = s.week;
  p.stats.promotions++;
  const a = above(s);
  const me = player(s);
  if (a) {
    a.rungSince = s.week;
    // The new rung's number, but no more than half again what he has been bringing (Top 10 #4b).
    const avgKick = a.kicks?.length ? a.kicks.reduce((x, y) => x + y, 0) / a.kicks.length : undefined;
    a.quota = QUOTA[to] ? Math.min(QUOTA[to]!, avgKick !== undefined ? Math.max(QUOTA_MIN, Math.round((avgKick * 1.5) / 10) * 10) : QUOTA[to]!) : 0;
    a.streak = 0;
    a.owed = 0;
    a.booksAsked = undefined;
    if (to === 'capo') {
      // He takes a seat at the capos' table: the weakest capo is put out to pasture (stays a soldier).
      const old = a.capoIds.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive && c.id !== a.myCapoId).sort((x, y) => (y.birth.y - x.birth.y))[0];
      if (a.capoIds.length >= 3 && old) {
        a.capoIds = a.capoIds.filter((id) => id !== old.id);
        old.rank = 'soldier';
        const host = a.capoIds[0];
        if (host) a.regimes[host] = [...(a.regimes[host] ?? []), old.id, ...(a.regimes[old.id] ?? [])];
        delete a.regimes[old.id];
        addOpinion(s, old.id, me.id, 'Took my crew', -20, 0);
      }
      a.myCapoId = undefined;
    }
    if (to === 'underboss') {
      const ub = a.underbossId ? s.characters[a.underbossId] : undefined;
      if (ub?.alive) {
        ub.rank = 'capo';
        a.capoIds.push(ub.id);
        a.regimes[ub.id] = a.regimes[ub.id] ?? [];
        addOpinion(s, ub.id, me.id, 'Took my seat', -25, 0);
      }
      a.underbossId = undefined;
    }
    if (to === 'soldier' && a.rivalId) {
      const r = s.characters[a.rivalId];
      if (r?.alive) addOpinion(s, r.id, me.id, 'Got made before me', -10, 1);
    }
  }
  me.ambition = to === 'soldier' ? 'Get his own crew' : to === 'capo' ? 'Become underboss' : to === 'underboss' ? 'Take the chair' : me.ambition;
  respect(ctx, to === 'soldier' ? 5 : to === 'capo' ? 8 : 10, `Moved up: ${aStation(to)}`, 'event');
  const can = unlocksBetween(was, to);
  const line = `${displayName(me)} is ${aStation(to)} in the ${a?.name ?? 'Valente'} family. ${why}`;
  addStory(s, me, `${aStation(to).replace(/^an? /, '').replace(/^./, (x) => x.toUpperCase())}: ${why}`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'succession' });
  if (can.length) s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You can now: ${can.join('; ')}.`, kind: 'misc' });
  ctx.log.push(line);
  if (can.length) ctx.log.push(`You can now: ${can.join('; ')}.`);
  s.cutscenes.push({ key: to === 'soldier' ? 'made_man' : 'heir_rises', title: to === 'soldier' ? 'A friend of ours' : `Made ${to}`, text: `${line}${can.length ? `\n\nYou can now: ${can.join('; ')}.` : ''}`, week: s.week });
}

/* ------------------------------------------------------------------ */
/* The week: quota, orders, the books                                  */
/* ------------------------------------------------------------------ */

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** What the chief expects this Monday: the number, or a winter number when the island is shut. */
export function quotaNow(s: GameState): number {
  const a = above(s);
  if (!a || a.quota <= 0) return 0;
  return isInSeason(s.date) ? a.quota : Math.max(10, Math.round((a.quota * 0.1) / 10) * 10);
}

/** Monday: the kick-up against the quota (station.ts stationWeek passes the kick). */
export function quotaWeek(ctx: Ctx, kick: number): void {
  const s = ctx.s;
  const a = above(s);
  if (!a || a.quota <= 0) return;
  // The first Monday sets the number: what he brings, a little more, never above the rung's number.
  if (!s.flags.low_quota_set) {
    s.flags.low_quota_set = 1;
    a.quota = Math.max(QUOTA_MIN, Math.min(a.quota, Math.round((kick * 0.7) / 10) * 10));
  }
  // The quota is sized to what he really brings (Top 10 #4b): in season, every four weeks, a chief who keeps
  // hearing "short" settles for most of what the man has been bringing (never above the rung's number).
  if (isInSeason(s.date)) {
    a.kicks = [...(a.kicks ?? []), kick].slice(-8);
    if (s.week % 4 === 0 && a.kicks.length >= 4) {
      const avg = a.kicks.reduce((x, y) => x + y, 0) / a.kicks.length;
      const fair = Math.max(QUOTA_MIN, Math.round((avg * QUOTA_FAIR) / 10) * 10);
      if (fair < a.quota) a.quota = Math.min(QUOTA[stationOf(s)] ?? a.quota, fair);
    }
  }
  if (s.flags.low_quota_up) {
    s.flags.low_quota_up = 0;
    a.quota = Math.round((a.quota * 1.1) / 50) * 50;
  }
  a.lastKick = kick;
  const want = quotaNow(s);
  const chief = chiefOf(s);
  const who = chief?.firstName ?? 'your chief';
  if (kick >= want) {
    a.streak++;
    shiftStanding(s, kick >= want * 1.5 ? 3 : 2, `The envelope to ${who} was right`);
    if (a.streak > 0 && a.streak % 6 === 0) {
      a.quota = Math.round((a.quota * 1.15) / 50) * 50;
      ctx.log.push(`${who} raised what he expects from you to ${fmt$(a.quota)} a week. That is how they tell you you're doing well.`);
    }
    return;
  }
  const short = Math.round(want - kick);
  a.streak = 0;
  a.missed++;
  a.owed += short;
  shiftStanding(s, -SHORT_LOSS, `Came up ${fmt$(short)} short with ${who}`);
  if (chief) addOpinion(s, chief.id, s.playerId, 'Came up short on a Monday', -4, 1);
  ctx.log.push(`Your kick-up to ${who} came up ${fmt$(short)} short of the ${fmt$(want)} he expects. You owe him ${fmt$(a.owed)}.`);
  // He says something about it when it adds up, not every Monday.
  const queued = s.eventQueue.some((e) => e.defId === 'low_short') || s.pendingEvents.some((e) => e.defId === 'low_short');
  if (!queued && a.owed >= want && s.week - (s.flags.low_short_week ?? -99) >= 3 && (s.flags.low_short_n ?? 0) < SHORT_CARDS) {
    s.flags.low_short_week = s.week;
    s.flags.low_short_n = (s.flags.low_short_n ?? 0) + 1;
    s.eventQueue.push(buildShort(s, short));
  }
}

/** "Short on Monday": make it up, ask for a week, or talk your way out (with the odds). */
export function buildShort(s: GameState, short: number): EventInstance {
  const a = above(s)!;
  const chief = chiefOf(s);
  const n = chief?.firstName ?? 'Your capo';
  const owed = a.owed;
  const lowFx = (o: LowOp): Effect => ({ type: 'power', op: { op: 'low', o } });
  const talk = Math.max(0.1, Math.min(0.8, 0.3 + (chief ? opinion(s, chief.id, s.playerId) / 200 : 0) + (a.standing - 40) / 200));
  return {
    iid: `ev${s.nextId++}`, defId: 'low_short', week: s.week, mandatory: true, priority: 80, meta: { low: 1, crew: 1, ...(chief ? { charId: chief.id } : {}) }, actors: chief ? [chief.id] : [],
    title: 'Short on Monday',
    text: `${n} counts the envelope twice, which is worse than counting it once. "${fmt$(quotaNow(s))}. That's what we said. This is ${fmt$(Math.max(0, quotaNow(s) - short))}." All told you owe him ${fmt$(owed)}. He doesn't raise his voice. He doesn't have to.`,
    defaultChoiceId: 'week',
    choices: [
      { id: 'pay', label: `Make it up right now (${fmt$(owed)})`, detail: 'Out of your own money. It costs, and he remembers that you paid.', because: `made up what you were short to ${n}`, effects: [lowFx({ op: 'settle' }), lowFx({ op: 'standing', by: 3, why: 'Made it up the same day' })], disabledReason: s.money < owed ? `Needs ${fmt$(owed)}` : undefined },
      { id: 'week', label: '"Give me a week."', detail: 'He gives you a week. You still owe it; standing −2.', because: `asked ${n} for a week`, effects: [lowFx({ op: 'standing', by: -2, why: 'Asked for a week' })] },
      { id: 'talk', label: '"It was a bad week for everybody."', detail: `${Math.round(talk * 100)}% he lets it go (his opinion of you, your standing). If not, standing −6 and he is angry.`, because: `told ${n} it was a bad week`, effects: [lowFx({ op: 'roll', p: talk, title: 'Short on Monday', win: [lowFx({ op: 'forgive' })], lose: [lowFx({ op: 'standing', by: -6, why: 'Made excuses' }), ...(chief ? [{ type: 'opinion', from: chief.id, to: s.playerId, amount: -8, reason: 'Made excuses about the money', decay: 1 } as Effect] : [])], winText: `${n} let it go this once.`, loseText: `${n} did not buy it.` })] },
    ],
  };
}

/** The scenes the family above sends down, by rung (authored scenes; the engine only schedules them). */
export const ORDER_SCENES: Partial<Record<Station, string[]>> = {
  associate: ['low_order_collect', 'low_order_stash', 'low_order_ugly', 'low_order_watch'],
  soldier: ['low_order_collect', 'low_order_ugly', 'low_order_score', 'low_order_watch'],
  capo: ['low_order_district', 'low_order_stayout', 'low_order_score'],
};

/** Weekly (after the kick-up): an order every few weeks; the books for an associate. */
export function aboveWeek(ctx: Ctx, schedule: (id: string, cast: Record<string, string>) => void): void {
  const s = ctx.s;
  const a = above(s);
  if (!a) return;
  const st = stationOf(s);
  // Orders: every three or four weeks, one comes down through your chief.
  const chief = chiefOf(s);
  if (chief && s.week >= a.nextOrder) {
    const pool = ORDER_SCENES[st] ?? [];
    if (pool.length) {
      const id = pool[a.orders % pool.length];
      schedule(id, { capo: chief.id });
      a.orders++;
    }
    a.nextOrder = s.week + 3 + (a.orders % 2);
  }
  // The books open: an associate with a sponsor hears about it.
  if (st === 'associate' && s.books?.open && a.booksAsked === undefined && !s.flags.low_books_told) {
    s.flags.low_books_told = s.week;
    const ready = !callInBlock(s);
    ctx.log.push(ready ? 'The books are open. Your name can go up now: Crew › The Rise › Your place.' : `The books are open. ${callInBlock(s)}.`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `Word comes down: the books are open.${ready ? ' Your sponsor says it is time.' : ''}`, kind: 'misc' });
  }
  if (!s.books?.open) s.flags.low_books_told = 0;
  // Standing drifts toward the middle when nothing happens (a family forgets).
  if (s.week % 4 === 0 && a.standing > 60) shiftStanding(s, -1, 'Out of sight, out of mind');
  // A clean month (no short Monday, not picked up): the family notices (Top 10 #4c).
  if (s.week % 4 === 0) {
    const jailed = (s.characters[s.playerId]?.imprisonedUntil ?? 0) > s.week;
    if (a.missed === (s.flags.low_clean_missed ?? a.missed) && !jailed && a.standing < 60) shiftStanding(s, 1, 'A clean month: every envelope right, no trouble');
    s.flags.low_clean_missed = a.missed;
  }
  // The debt paid off: the "Short on Monday" cards may come again.
  if (a.owed <= 0) s.flags.low_short_n = 0;
}

/** Summary for the screens and the Desk strip. */
export interface PlaceSummary {
  station: Station;
  family: string;
  chief?: Character;
  don?: Character;
  standing: number;
  word: string;
  quota: number;
  owed: number;
  lastKick?: number;
  sponsors: Character[];
  booksOpen: boolean;
  next?: Station;
  callIn?: string;
  odds: number;
  line: string;
}

export function placeSummary(s: GameState): PlaceSummary | undefined {
  const a = above(s);
  const st = stationOf(s);
  if (!a || !inLadder(st)) return undefined;
  const chief = chiefOf(s);
  const don = donOf(s);
  const sponsors = a.sponsors.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
  const word = st === 'associate' ? `in ${chief?.firstName ?? 'a capo'}'s crew` : st === 'soldier' ? `in ${chief?.firstName ?? 'a capo'}'s regime` : st === 'capo' ? `with your own crew under ${don?.firstName ?? 'the Don'}` : `second to ${don?.firstName ?? 'the Don'}`;
  const line = `${aStation(st).replace(/^./, (x) => x.toUpperCase())} ${word}, ${a.name} family${a.quota ? ` · quota ${fmt$(a.quota)} Monday` : ''}${a.owed ? ` · you owe ${fmt$(a.owed)}` : ''}${st === 'associate' ? ` · the books are ${s.books?.open ? 'OPEN' : 'closed'}` : ''}`;
  return {
    station: st, family: a.name, chief, don, standing: Math.round(a.standing), word: standingWord(a.standing), quota: a.quota, owed: a.owed, lastKick: a.lastKick, sponsors,
    booksOpen: !!s.books?.open, next: nextRung(st), callIn: callInBlock(s), odds: callInOdds(s).chance, line,
  };
}

/** The family above, as a chart: the Don at the top, his officers, the capos and their men, YOU marked where you stand. */
export interface ChartNode { id: string; role: string; you?: boolean; kids?: ChartNode[] }
export function aboveChart(s: GameState): ChartNode | undefined {
  const a = above(s);
  if (!a) return undefined;
  const st = stationOf(s);
  const node = (id: string | undefined, role: string, kids?: ChartNode[]): ChartNode | undefined => (id && s.characters[id] ? { id, role, kids } : undefined);
  const you: ChartNode = { id: s.playerId, role: st, you: true, kids: crew(s).filter((c) => c.alive).map((c) => ({ id: c.id, role: c.rank === 'soldier' ? 'soldier' : 'your guy' })) };
  const capos = a.capoIds.map((k) => {
    const men = (a.regimes[k] ?? []).map((id) => node(id, s.characters[id]?.rank === 'associate' ? 'associate' : id === a.sonId ? 'soldier, the Don\'s son' : 'soldier')).filter((x): x is ChartNode => !!x && !!s.characters[x.id]?.alive);
    if (k === a.myCapoId) men.push(you);
    return node(k, 'capo', men);
  }).filter((x): x is ChartNode => !!x && !!s.characters[x.id]?.alive);
  if (st === 'capo') capos.push(you);
  const officers: ChartNode[] = [];
  const ub = st === 'underboss' ? you : node(a.underbossId, 'underboss', capos);
  if (st === 'underboss') you.kids = [...(you.kids ?? []), ...capos];
  if (ub) officers.push(ub);
  const cons = node(a.consigliereId, 'consigliere');
  if (cons && s.characters[cons.id]?.alive) officers.push(cons);
  if (!ub) officers.push(...capos);
  const top = node(a.bossId, 'boss', officers);
  return top;
}


/* ------------------------------------------------------------------ */
/* The chair (stage 3): the Don goes, and the family decides           */
/* ------------------------------------------------------------------ */

/**
 * The player takes the chair of the family above: its men become his (the
 * capos keep their crews, the underboss and consigliere their seats), the
 * family's name is his to keep, and from here he plays the boss's game with
 * everything open.
 */
export function takeTheChair(ctx: Ctx, why: string): void {
  const s = ctx.s;
  const p = pw(s);
  const a = above(s);
  const me = player(s);
  const was = p.station;
  if (a) {
    const don = s.characters[a.bossId];
    if (don?.alive) { don.rank = 'civilian'; don.faction = 'none'; }
    for (const id of aboveIds(s)) {
      const c = s.characters[id];
      if (!c?.alive || id === a.bossId || id === me.id) continue;
      c.faction = 'player';
      c.capoId = undefined;
    }
    for (const k of a.capoIds) for (const m of a.regimes[k] ?? []) { const c = s.characters[m]; if (c?.alive && c.faction === 'player' && s.characters[k]?.alive) c.capoId = k; }
    const ub = a.underbossId ? s.characters[a.underbossId] : undefined;
    const cons = a.consigliereId ? s.characters[a.consigliereId] : undefined;
    if (s.council && ub?.alive) { ub.rank = 'underboss'; s.council.underboss.holderId = ub.id; }
    if (s.council && cons?.alive) { cons.rank = 'consigliere'; s.council.consigliere.holderId = cons.id; }
    if (s.rivals.find((r) => r.id === 'philly')) addOpinion(s, s.rivals.find((r) => r.id === 'philly')!.leaderId, me.id, 'New boss in Wildwood', 0, 1);
  }
  p.above = undefined;
  p.overId = undefined;
  p.station = 'boss';
  p.fell = false;
  p.stats.promotions++;
  tidyRegimes(s);
  addSuccess(s, me, 'Took the chair of the family');
  me.ambition = 'Get a seat at the Table';
  respect(ctx, 15, 'Boss of the family', 'event');
  const can = unlocksBetween(was, 'boss');
  const line = `${displayName(me)} is the boss of the ${a?.name ?? 'Valente'} family now. ${why}`;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'succession' });
  if (can.length) s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You can now: ${can.join('; ')}.`, kind: 'misc' });
  ctx.log.push(line);
  s.cutscenes.push({ key: 'heir_rises', title: 'Boss', text: `${line}${can.length ? `\n\nYou can now: ${can.join('; ')}.` : ''}`, week: s.week });
}

/** The odds the family turns to you when the chair is open, with every reason. */
export function claimOdds(s: GameState): Acceptance {
  const a = above(s);
  const ub = a?.underbossId ? s.characters[a.underbossId] : undefined;
  const reasons: Reason[] = [];
  const add = (label: string, v: number) => { if (Math.round(v)) reasons.push({ label, value: Math.round(v) }); };
  add('Base', 10);
  add('Your standing with the family', ((a?.standing ?? 0) - 40) * 0.6);
  add('Your reputation', (s.respect - 30) / 2);
  add('Your men', Math.min(15, crew(s).filter((c) => isFree(s, c)).length * 1.5));
  const capos = (a?.capoIds ?? []).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
  add('The capos who like you', capos.filter((c) => opinion(s, c.id, s.playerId) >= 20).length * 8 - capos.filter((c) => opinion(s, c.id, s.playerId) <= -10).length * 8);
  if (ub?.alive) add(`${ub.firstName} wants it too (the underboss)`, -20);
  if (s.flags.low_ub_promised) add('You promised the underboss your vote', -10);
  return { chance: Math.max(0.05, Math.min(0.85, reasons.reduce((x, r) => x + r.value, 0) / 100)), reasons };
}

/** Monthly (station.ts stationMonth): the Don is dead. Who sits in the chair? */
export function chairOpen(ctx: Ctx): void {
  const s = ctx.s;
  const a = above(s);
  if (!a) return;
  const st = stationOf(s);
  const don = s.characters[a.bossId];
  if (don?.alive) return;
  if (st === 'underboss') { takeTheChair(ctx, `${don ? displayName(don) : 'The old Don'} is gone, and the chair passed to his underboss.`); return; }
  if (st === 'capo' && !s.pendingEvents.some((e) => e.defId === 'low_chair') && !s.eventQueue.some((e) => e.defId === 'low_chair')) {
    s.eventQueue.push(buildChairOpen(s));
    return;
  }
  if (st === 'capo') return;
  succeedQuietly(ctx);
}

/** The underboss takes the chair; the best-placed capo becomes his underboss (the player, if he is a capo the new Don wants). */
export function succeedQuietly(ctx: Ctx, backed = false): void {
  const s = ctx.s;
  const a = above(s);
  if (!a) return;
  const old = s.characters[a.bossId];
  const ub = a.underbossId ? s.characters[a.underbossId] : undefined;
  const heir = ub?.alive ? ub : a.capoIds.map((id) => s.characters[id]).find((c) => c?.alive);
  if (!heir) { takeTheChair(ctx, 'There was nobody else left to take it.'); return; }
  heir.rank = 'boss';
  a.bossId = heir.id;
  a.capoIds = a.capoIds.filter((id) => id !== heir.id);
  a.underbossId = undefined;
  pw(s).overId = heir.id;
  const st = stationOf(s);
  const line = `${displayName(heir)} is the new Don of the ${a.name} family${old ? `, after ${displayName(old)}` : ''}.`;
  ctx.log.push(line);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'succession' });
  if (backed) {
    addOpinion(s, heir.id, s.playerId, 'Backed me for the chair', 20, 0);
    shiftStanding(s, 10, `Backed ${heir.firstName} for the chair`);
  }
  // He needs an underboss: the capo he trusts most, and a capo who backed him is the first he thinks of.
  if (st === 'capo' && (backed || a.standing >= 60)) {
    promote(ctx, 'underboss', `${heir.firstName} made you his underboss.`);
    return;
  }
  const next = a.capoIds.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive).sort((x, y) => opinion(s, heir.id, y.id) - opinion(s, heir.id, x.id))[0];
  if (next) {
    a.capoIds = a.capoIds.filter((id) => id !== next.id);
    next.rank = 'underboss';
    a.underbossId = next.id;
    if (a.myCapoId === next.id) a.myCapoId = a.capoIds[0];
  }
}

/** "The chair is open": a capo can back the underboss, or claim it (with the odds). */
export function buildChairOpen(s: GameState): EventInstance {
  const a = above(s)!;
  const ub = a.underbossId ? s.characters[a.underbossId] : undefined;
  const old = s.characters[a.bossId];
  const odds = claimOdds(s);
  const lowFx = (o: LowOp): Effect => ({ type: 'power', op: { op: 'low', o } });
  return {
    iid: `ev${s.nextId++}`, defId: 'low_chair', week: s.week, mandatory: true, priority: 99, meta: { low: 1 }, actors: [s.playerId, ...(ub ? [ub.id] : [])],
    title: 'The chair is open',
    text: `${old ? displayName(old) : 'The Don'} is dead. The capos meet in the back of the Bolero with the blinds down. ${ub?.alive ? `${ub.firstName} sits closest to the empty chair and waits for somebody to say his name.` : 'Nobody sits in the old man\'s chair.'} Everybody looks at everybody. Some of them look at you.`,
    defaultChoiceId: 'back',
    choices: [
      { id: 'back', label: ub?.alive ? `Say ${ub.firstName}'s name first` : 'Let the old men decide', detail: `${ub?.alive ? `${ub.firstName} takes the chair and remembers who spoke first: standing +10, and he may make you his underboss.` : 'The family picks its own.'}`, because: 'backed the underboss for the chair', effects: [lowFx({ op: 'succeed', backed: true })] },
      { id: 'claim', label: 'Claim the chair yourself', detail: `${Math.round(odds.chance * 100)}% the room turns to you (${odds.reasons.filter((r) => r.label !== 'Base').slice(0, 4).map((r) => `${r.value > 0 ? '+' : ''}${r.value} ${r.label.toLowerCase()}`).join(', ')}). If not, the new Don sends you to Florida.`, because: 'claimed the chair', effects: [lowFx({ op: 'roll', p: odds.chance, title: 'The chair', win: [lowFx({ op: 'chair', why: 'The capos turned to you in the back of the Bolero.' })], lose: [lowFx({ op: 'succeed', backed: false }), lowFx({ op: 'exile' })], winText: 'the room turned to you', loseText: 'the room turned to the underboss, and you are going to Florida' })] },
    ],
  };
}
