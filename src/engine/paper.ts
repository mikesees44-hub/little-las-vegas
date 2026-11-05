import type { ActionPreview } from './actions';
import { addDays, dateOfWeek, isInSeason } from './calendar';
import { displayName, player } from './characters';
import { applyEffects } from './effects';
import { seasonCurve } from './empireOps';
import { money, type Ctx } from './ledger';
import { inflation, ZONES_BY_ID } from './property';
import { hashSeed } from './rng';
import { addSecret } from './secrets';
import { today } from './days';
import { ENTERTAINMENT, type WorldPerson } from '../worldpack';
import { billings } from './showbiz';
import {
  BYLINES, DAILY, DAILY_SHORT, FACT_RUMORS, FALSE_RUMORS, FIGHTERS, FILMS, GRUMBLES, HELP_WANTED, HIGHS, HORSES, MOVIE_HOUSES, OPENERS,
  RAVES, ROOMS, ROOMS_TO_LET, SKIES, TEAMS, WEEKLY, WEEKLY_SHORT, WINTER_SKIES, type Room,
} from './paperData';
import { AD_WEEKS } from './paperAds';
import type { Character, Effect, FactionId, GameDate, GameState, HeatBar, RivalId } from './types';

/**
 * The town's papers: THE WILDWOOD DAILY TIDE every morning and THE FIVE MILE
 * BEACH WEEKLY LEADER every Thursday.
 *
 * Everything printed comes from the state, read once a week when the week
 * turns (`paperWeek`, called by advanceWeek): the deeds recorded (the lots'
 * ownership history), the people taken into custody (who is newly in jail),
 * the dead, the elections, the businesses opened and closed and the weddings
 * and christenings of the living town (public facts only), the market's
 * listings, the rooms of the night and who is on their stages. The paper only
 * knows what is public: a lot the boss buys through his front man is
 * recorded in the front man's name; a murder is "a body found".
 *
 * What last week did is set into the seven dailies of the new week (Monday
 * carries the big stories) and the Thursday weekly (the week in review, the
 * features, the full listings). An edition is on the desk when the day clock
 * reaches its day. What a printed story does — the FBI reads the deeds and
 * the blotter, the wife reads Spout Off, the rivals read everything — lands
 * when the week it ran in turns, so an order to the editor to spike a story
 * that has not run yet (`paper:kill`) stops it.
 *
 * Spout Off is the readers' call-in column: grumbling, false rumors, and now
 * and then something true drawn from what is hidden (the goomar's apartment,
 * a capo's new Lincoln, a cop's new Cadillac). Each call-in keeps whether it
 * was true (`t`), which only the libel suit ever tests.
 *
 * Other systems can put a story on the wire with `pressItem(s, …)`; it is
 * printed in the next week's papers.
 */

export { DAILY, WEEKLY, DAILY_SHORT, WEEKLY_SHORT };

export type Sec = 'front' | 'blotter' | 'deeds' | 'classified' | 'business' | 'society' | 'sports' | 'weather' | 'spout' | 'ent' | 'wire' | 'review' | 'feature' | 'editorial';

/** What a printed story does when the week it ran in turns. */
export interface PFx {
  heat?: [HeatBar, number][];
  resp?: number;
  /** The wife reads it (opinion of the boss). */
  wife?: number;
  /** An official's exposure (pol ctl id, amount). */
  ctl?: [string, number];
  /** A rival family reads it (the goomar becomes their lever). */
  goomar?: string;
  rivalOpinion?: [RivalId, number];
  rivalExposure?: [RivalId, number];
  familyOpinion?: number;
}

export interface PItem {
  id: string;
  s: Sec;
  h?: string;
  b: string;
  /** Priority on the wire (the front page is the highest). */
  p?: number;
  /** Spout Off: true, a grumble, or false. Only the libel suit tests it. */
  t?: 'true' | 'grumble' | 'false';
  /** Who it is about, as far as the boss is concerned. */
  a?: 'boss' | 'family' | 'rival' | 'town';
  fx?: PFx;
  /** Classifieds: the lot for sale. */
  lot?: string;
  /** Classifieds: the asking price. */
  ask?: number;
  /** A copy of a daily story (the weekly's echo): the original's id. */
  src?: string;
  /** Small print: show times, cover, the by-line. */
  x?: string;
  /** The rave (entertainment). */
  r?: string;
  /** Paid advertisement for one of the boss's places. */
  ad?: 1;
  /** The boss's plant. */
  pl?: 1;
  /** EXTRA! The week's violence on the front page (a card the day it comes out: extraToday). */
  ex?: 1;
  /** Spiked by the editor (never ran). */
  sp?: 1;
  /** The boss's own place (entertainment). */
  own?: 1;
  /** Held over by popular demand. */
  ho?: 1;
}

export interface Edition {
  id: string;
  kind: 'daily' | 'weekly';
  week: number;
  /** 0 Monday … 6 Sunday (the weekly is Thursday, 3). */
  day: number;
  date: GameDate;
  /** Running issue number (read tracking and the masthead). */
  n: number;
  items: PItem[];
  settled?: 1;
}

export type PlantKind = 'puff' | 'smear' | 'notice';

export interface PaperState {
  v: 1;
  eds: Edition[];
  /** The week the papers last read the town. */
  last: number;
  /** Who was in custody at the last reading. */
  jail: string[];
  /** Highest issue number the boss has read. */
  read: number;
  /** Issue counter. */
  n: number;
  /** Ads running: place key ('biz:<id>' | 'venue:<id>') -> last week. */
  ads: Record<string, number>;
  /** Plants waiting for the next edition. */
  plants: PItem[];
  /** Stories other systems put on the wire (`pressItem`). */
  wire: PItem[];
  /** The week the boss bought the paper. */
  owned?: number;
  /** Items the boss has sued over. */
  sued: string[];
  stats: { killed: number; planted: number; ads: number; suits: number; won: number };
}

export const KEEP_DAILIES = 14;
export const KEEP_WEEKLIES = 8;
export const WEEKLY_DAY = 3;
export const PAPER_PRICE = 45000;

export function ensurePaper(s: GameState): PaperState {
  if (!s.paper) s.paper = { v: 1, eds: [], last: s.week - 1, jail: jailed(s), read: 0, n: 0, ads: {}, plants: [], wire: [], sued: [], stats: { killed: 0, planted: 0, ads: 0, suits: 0, won: 0 } };
  const P = s.paper;
  P.plants ??= [];
  P.wire ??= [];
  P.sued ??= [];
  P.ads ??= {};
  return P;
}

/* ------------------------------------------------------------------ */
/* Rolls and small helpers                                            */
/* ------------------------------------------------------------------ */

function roll(s: GameState, key: string): number {
  return hashSeed(`${s.seed}:paper:${key}`) / 4294967296;
}

function pickR<T>(s: GameState, key: string, arr: readonly T[]): T {
  return arr[Math.floor(roll(s, key) * arr.length) % arr.length];
}

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function jailed(s: GameState): string[] {
  return Object.values(s.characters).filter((c) => c.alive && c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week).map((c) => c.id).sort();
}

function wifeOf(s: GameState): Character | undefined {
  const w = player(s)?.spouseId ? s.characters[player(s).spouseId!] : undefined;
  return w?.alive ? w : undefined;
}

/** The name the deeds carry for the boss's purchases: his clean front man, or the boss himself. */
export function deedName(s: GameState): { name: string; front: boolean } {
  const f = s.frontManId ? s.characters[s.frontManId] : undefined;
  if (f?.alive) return { name: `${f.firstName} ${f.lastName}`, front: true };
  const b = player(s);
  return { name: `${b.firstName} ${b.lastName}`, front: false };
}

/** The realty company a rival family buys through (the paper never sees the family). */
const HOLDING: Record<string, string> = { manno: 'Seaview Realty Co.', feldstein: 'Atlantic Shore Holdings, Inc.', kessler: 'Kessler Brothers Builders', philly: 'Delaware Valley Investors, Inc.', law: 'the City of Wildwood', none: 'a private buyer' };

const CHARGES: Record<string, string> = {
  muscle: 'assault and battery', earner: 'receiving stolen goods', driver: 'transporting stolen property', bookmaker: 'bookmaking',
  collector: 'extortion', burglar: 'breaking and entering', talker: 'conspiracy',
};

function outLabel(c: Character, s: GameState): string {
  const age = s.date.y - c.birth.y;
  return `${c.firstName} ${c.lastName}, ${age}`;
}

/* ------------------------------------------------------------------ */
/* The hook                                                           */
/* ------------------------------------------------------------------ */

export interface PressInput {
  s: Sec;
  h?: string;
  b: string;
  p?: number;
  a?: PItem['a'];
  fx?: PFx;
}

/**
 * Put a story on the wire for the next edition (other systems: a trip, a
 * purchase, a bond made public). Only public facts belong here; the
 * caller's `fx` lands when the edition's week turns. Capped.
 */
export function pressItem(s: GameState, it: PressInput): void {
  const P = ensurePaper(s);
  P.wire.push({ id: '', ...it });
  if (P.wire.length > 30) P.wire.splice(0, P.wire.length - 30);
}

/* ------------------------------------------------------------------ */
/* Reading the town                                                   */
/* ------------------------------------------------------------------ */

interface Wire extends PItem {
  /** Earliest day it may run (0 Monday). */
  min?: number;
}

function gatherWire(s: GameState, P: PaperState): Wire[] {
  const from = P.last;
  const now = s.week;
  const out: Wire[] = [];
  const fresh = (w: number) => w > from && w <= now;
  const boss = player(s);

  // 1. The front pages the old news desk already set this week (heat is already counted there).
  for (const n of s.news) {
    if (!fresh(n.week)) continue;
    if (n.kind === 'history') out.push({ id: '', s: 'wire', h: n.headline, b: n.body, p: 55 });
    else if (n.kind === 'color') out.push({ id: '', s: 'front', h: n.headline, b: n.body, p: 12 });
    else out.push({ id: '', s: 'front', h: n.headline, b: n.body, p: 70 });
  }

  // 2. The dead.
  const dead = Object.values(s.characters).filter((c) => !c.alive && c.death && fresh(c.death.week) && (c.rank !== 'civilian' || c.dynasty || c.faction === 'player'))
    .sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, 5);
  for (const c of dead) {
    const violent = !!c.death!.killer || /shot|kill|murder|stab|whack|hit|trunk|strangl|bomb/i.test(c.death!.cause);
    const age = s.date.y - c.birth.y;
    if (violent) out.push({ id: '', s: 'front', h: `${c.lastName.toUpperCase()}, ${age}, FOUND DEAD; POLICE SILENT`, b: `The body of ${c.firstName} ${c.lastName} was found early in the week. Detectives would say only that the death "is being investigated." Neighbors described him as quiet. Nobody saw anything.`, p: c.faction === 'player' ? 92 : 88, a: c.faction === 'player' ? 'family' : c.faction === 'none' ? 'town' : 'rival' });
    else out.push({ id: '', s: 'society', h: `${c.firstName} ${c.lastName}`, b: `${c.firstName} ${c.lastName}${c.nickname ? ` ("${c.nickname}")` : ''}, ${age}, of Wildwood, died this week. A funeral Mass will be offered at St. Ann's. In lieu of flowers, the family asks for donations to the parish.`, p: 35, a: c.faction === 'player' ? 'family' : 'town' });
  }

  // 3. The blotter: who is newly in custody, who came home.
  const was = new Set(P.jail);
  const nowIn = jailed(s);
  let fed = 0;
  for (const id of nowIn) {
    if (was.has(id)) continue;
    const c = s.characters[id];
    if (!c || (c.rank === 'civilian' && c.faction === 'none' && !c.dynasty)) continue;
    const weeks = (c.imprisonedUntil ?? now) - now;
    const charge = c.id === boss.id ? 'conspiracy and racketeering' : CHARGES[c.craft ?? 'talker'] ?? 'disorderly conduct';
    const bail = weeks <= 2 ? `released on ${$(500 * Math.max(1, Math.round(inflation(s))))} bail` : weeks > 40 ? 'held without bail in the county jail at Cape May Court House' : `held in lieu of ${$(Math.round((2500 + weeks * 250) / 500) * 500)} bail`;
    const mine = c.faction === 'player';
    const made = mine && c.rank !== 'associate' && c.rank !== 'civilian';
    const fx: PFx | undefined = mine ? { heat: made && fed < 3 ? [['federal', 1]] : undefined, resp: -1 } : undefined;
    if (made) fed++;
    const big = c.id === boss.id || c.rank === 'boss' || c.rank === 'underboss' || c.rank === 'capo';
    out.push({ id: '', s: big ? 'front' : 'blotter', h: big ? `${c.lastName.toUpperCase()} ARRESTED; ${charge.toUpperCase()} CHARGED` : `${outLabel(c, s)}`, b: `${big ? `${displayName(c)}, described by police as a local businessman, was taken into custody this week` : `${c.firstName} ${c.lastName} of Wildwood was arrested`} and charged with ${charge}. ${bail[0].toUpperCase()}${bail.slice(1)}.`, p: big ? 95 : 60, a: c.id === boss.id ? 'boss' : mine ? 'family' : c.faction === 'none' ? 'town' : 'rival', fx, min: mine ? 1 : 0 });
  }
  for (const id of P.jail) {
    const c = s.characters[id];
    if (!c?.alive || nowIn.includes(id)) continue;
    out.push({ id: '', s: 'blotter', h: `${outLabel(c, s)}`, b: `${c.firstName} ${c.lastName} was released from custody this week.`, p: 20, a: c.faction === 'player' ? 'family' : 'town' });
  }

  // 4. Raids, padlocks, indictments: the public half of the chronicle.
  for (const e of s.chronicle) {
    if (!fresh(e.week) || /^You\b/.test(e.text)) continue;
    const t = e.text.toLowerCase();
    if (e.kind === 'heat' && !/arrest/.test(t) && /raid|padlock|indict|subpoena|grand jury|wiretap/.test(t)) {
      out.push({ id: '', s: 'blotter', h: /raid|padlock/.test(t) ? 'POLICE RAID' : 'GRAND JURY', b: scrub(e.text), p: 50 });
    } else if (e.kind === 'succession') {
      out.push({ id: '', s: 'front', h: 'NEW MAN AT THE HEAD OF THE TABLE', b: scrub(e.text), p: 80 });
    } else if (e.kind === 'family' && /born|christen|married|wedding|engaged/.test(t)) {
      out.push({ id: '', s: 'society', h: /born|christen/.test(t) ? 'Births' : 'Weddings', b: scrub(e.text), p: 30, a: 'family' });
    }
  }

  // 5. Rival trouble that became public: a strike is broken glass on the front page.
  for (const r of s.rivals) {
    if (r.lastMove && fresh(r.lastMove.week) && r.lastMove.move === 'strike') {
      out.push({ id: '', s: 'blotter', h: 'VANDALS, FIRE AT LOCAL BUSINESS', b: 'Police were called to a Pacific Avenue business after windows were smashed and a fire set in the back room. Detectives have no suspects. The owner said he "has no enemies."', p: 48, a: 'town' });
    }
  }
  if (!s.news.some((n) => fresh(n.week) && n.kind === 'war')) {
    for (const w of s.wars) if (fresh(w.startWeek)) out.push({ id: '', s: 'front', h: 'MERCHANTS FEAR SUMMER OF TROUBLE', b: 'A string of beatings and broken windows has shopkeepers asking City Hall for more patrolmen. The Chief says the department "has the situation in hand."', p: 78 });
  }

  // 6. Elections.
  for (const r of s.pol?.results ?? []) {
    if (!fresh(r.week)) continue;
    const winners = r.winners.map((id) => `${r.names[id] ?? 'a candidate'} (${Math.round(r.shares[id] ?? 0)}%)`).join(', ');
    out.push({ id: '', s: 'front', h: r.headline, b: `The voters have spoken. Elected: ${winners}. Turnout was ${Math.round(r.turnout)} per cent.`, p: 90 });
  }

  // 7. The season.
  const nowIn2 = isInSeason(dateOfWeek(now + 1));
  const before = isInSeason(dateOfWeek(now));
  if (nowIn2 && !before) out.push({ id: '', s: 'front', h: 'THE SEASON OPENS: PIERS LIT, MOTELS BOOKED', b: 'Memorial Day brought the first crowds over the bridge. The rides on the piers turned for the first time since September and the trams ran until midnight.', p: 75 });
  if (!nowIn2 && before) out.push({ id: '', s: 'front', h: 'LABOR DAY: SHUTTERS COME DOWN', b: 'The last bus to Philadelphia left full. Shopkeepers count the summer and the island settles in for the long quiet.', p: 75 });
  const d0 = dateOfWeek(now + 1);
  if (d0.m === 7 && d0.d <= 7) out.push({ id: '', s: 'front', h: 'FIREWORKS OVER THE BOARDWALK', b: 'The Fourth brought the biggest crowd of the summer to the beach for the fireworks off the Marine Pier. The Beach Patrol reports one lost child, found, and three lost wallets, not.', p: 40 });

  // 8. The deeds.
  out.push(...deeds(s, from, now));

  // 9. The living town: openings, closings, weddings, births, deaths (public facts only).
  const L = s.living;
  if (L) {
    let biz = 0, soc = 0;
    for (const f of L.facts) {
      if (!fresh(f.w) || f.sec !== 0) continue;
      if ((f.k === 'opened' || f.k === 'closed') && biz < 6) { biz++; out.push({ id: '', s: 'business', h: f.k === 'opened' ? 'Opened' : 'Closed', b: scrub(f.txt), p: 28, a: 'town' }); }
      else if ((f.k === 'married' || f.k === 'engaged' || f.k === 'born' || f.k === 'died') && soc < 8) { soc++; out.push({ id: '', s: 'society', h: f.k === 'married' ? 'Weddings' : f.k === 'engaged' ? 'Engagements' : f.k === 'born' ? 'Births' : 'Deaths', b: scrub(f.txt), p: 22, a: 'town' }); }
    }
  }

  // 10. The boss's legitimate business: a new place under his (or his front's) name.
  const dn = deedName(s);
  for (const b of s.businesses) {
    if (b.owner !== 'player' || b.boughtWeek === undefined || !fresh(b.boughtWeek)) continue;
    if (b.category && b.category !== 'front') continue;
    const liquor = ['bar', 'club', 'restaurant', 'motel'].includes(b.kind);
    out.push({ id: '', s: 'business', h: 'New Management', b: `${b.name} is under new management, ${dn.name} proprietor.${liquor ? ` The liquor license transfer was approved by the Board of Commissioners.` : ''}`, p: 32, a: dn.front ? 'town' : 'boss' });
  }

  // 11. The boss's evenings, as the society page saw them (discreet).
  const rh = s.rounds?.history.find((h) => fresh(h.week));
  const wife = wifeOf(s);
  for (const id of rh?.ids ?? []) {
    if (id === 'fun:club') out.push({ id: '', s: 'society', h: 'Seen About', b: 'At ringside at the 500 Club this week: a party up from Wildwood that included a well-known local businessman. The headliner sent over a bottle.', p: 18, a: 'boss' });
    else if (id === 'fam:wife' && wife) out.push({ id: '', s: 'society', h: 'Seen About', b: `Mr. and Mrs. ${boss.lastName} dined at the Hotel Dorset. Mrs. ${boss.lastName} wore blue.`, p: 16, a: 'boss' });
    else if (id === 'ppl:priest') out.push({ id: '', s: 'society', h: 'Parish Notes', b: `St. Ann's thanks an anonymous benefactor for a generous gift toward the new school roof.`, p: 14, a: 'boss' });
    else if (id === 'fun:fights') out.push({ id: '', s: 'sports', h: 'Ringside', b: 'Friday\'s card at the Convention Hall drew a full house, including some of the island\'s better-known businessmen in the front row.', p: 20 });
  }

  // 12. Plants and the wire hook.
  for (const pl of P.plants) out.push({ ...pl, p: pl.p ?? 45, min: pl.s === 'front' ? 1 : 0 });
  for (const w of P.wire) out.push({ ...w, p: w.p ?? 30 });
  return out;
}

/** Strip the engine's inside words from a public line. */
function scrub(t: string): string {
  return t.replace(/\b(the )?(family|outfit|mob|crew|capo|soldier|made man|associate)s?\b/gi, (m) => (/family/i.test(m) ? m : 'man')).replace(/^You /, 'A local businessman ');
}

/** "Deeds recorded": every transfer in the lots' history since the last reading. */
function deeds(s: GameState, from: number, now: number): Wire[] {
  const rows: { w: Wire; price: number }[] = [];
  const dn = deedName(s);
  let fedDeed = false;
  for (const l of s.econ?.lots ?? []) {
    for (const h of l.history ?? []) {
      if (!(h.week > from && h.week <= now)) continue;
      const zone = ZONES_BY_ID[l.zone]?.name ?? 'Wildwood';
      const price = h.price ?? (h.owner === 'player' && l.boughtWeek === h.week ? l.invested ?? l.price : 0);
      const paid = price ? `, ${$(price)}` : '';
      if (h.how === 'built') {
        rows.push({ price: 1, w: { id: '', s: 'deeds', h: 'New construction', b: `${l.address}, ${zone}: certificate of occupancy${h.by ? `, ${h.by}` : ''}.`, p: 15 } });
        continue;
      }
      let grantee: string;
      let about: PItem['a'] = 'town';
      let fx: PFx | undefined;
      if (h.owner === 'player') {
        grantee = dn.name;
        about = dn.front ? 'town' : 'boss';
        if (!dn.front && !fedDeed) { fedDeed = true; fx = { heat: [['federal', 1]] }; }
      } else if (h.owner !== 'private' && h.owner !== 'city') grantee = HOLDING[h.owner as FactionId] ?? 'a realty company';
      else if (h.owner === 'city') grantee = 'the City of Wildwood';
      else grantee = h.by && !/split off/.test(h.by) ? h.by : 'a private buyer';
      const how = h.how === 'seized' ? 'Sheriff\'s sale' : 'Transfer';
      rows.push({ price: price || 2, w: { id: '', s: 'deeds', h: how, b: `${l.address}, ${zone}, to ${grantee}${paid}.`, p: 25 + Math.min(20, Math.round(price / 2000)), a: about, fx, min: about === 'boss' ? 1 : 0 } });
    }
  }
  rows.sort((a, b) => b.price - a.price || (a.w.b < b.w.b ? -1 : 1));
  return rows.slice(0, 14).map((r) => r.w);
}

/* ------------------------------------------------------------------ */
/* Spout Off                                                          */
/* ------------------------------------------------------------------ */

interface Rumor { b: string; a: PItem['a']; fx?: PFx; key: string; kind?: string }

/** True rumors: drawn from what is hidden. Each comes with what printing it does. */
export function trueRumors(s: GameState): Rumor[] {
  const out: Rumor[] = [];
  const boss = player(s);
  const wife = wifeOf(s);
  const N = s.nightlife;
  for (const g of Object.values(N?.goomars ?? {})) {
    if (g.ended || !s.characters[g.id]?.alive) continue;
    const where = g.where.replace(/^an? /, '');
    out.push({ key: `g:${g.id}`, a: 'boss', b: `Who's paying the rent on ${where}? Not the young lady. A certain married businessman with a Cadillac and a lot of friends, that's who.`, fx: { wife: wife ? -6 : undefined, goomar: g.id } });
  }
  for (const c of Object.values(s.characters)) {
    if (!c.alive || c.faction !== 'player' || c.id === boss.id || (c.rank !== 'capo' && c.rank !== 'underboss') || (c.imprisonedUntil ?? 0) > s.week) continue;
    if (c.wealth >= 15000) out.push({ key: `w:${c.id}`, a: 'family', b: `How does a fellow who "manages a vending route" pay cash for a new Lincoln? Mr. ${c.lastName}, the IRS would like a word. So would I.`, fx: { heat: [['federal', 1]] } });
  }
  for (const [id, ctl] of Object.entries(s.pol?.ctl ?? {})) {
    const p = s.pol?.people[id];
    if (!p || !ctl.payroll || ctl.payroll <= 0) continue;
    const cop = /police|sergeant|lieutenant|captain|patrolman|chief/i.test(p.title) || p.inst === 'police';
    const what = cop ? `a ${/sergeant/i.test(p.title) ? 'police sergeant' : /lieutenant/i.test(p.title) ? 'police lieutenant' : 'policeman'}` : 'a man on the city payroll';
    out.push({ key: `p:${id}`, a: 'family', b: `Since when does ${what} drive a brand-new Cadillac? That's some overtime. Ask ${p.last} where he gets it.`, fx: { ctl: [id, 5], heat: [['local', 1]] } });
  }
  for (const g of N?.npc ?? []) {
    if (g.ended) continue;
    const m = s.characters[g.man];
    if (!m?.alive) continue;
    out.push({ key: `n:${g.man}`, a: m.faction === 'player' ? 'family' : 'town', b: `A married man named ${m.lastName} keeps an awful lot of late nights for somebody who opens a store at seven. His wife isn't stupid, folks.` });
  }
  const L = s.living;
  if (L) {
    for (const f of L.facts) {
      if (f.sec === 0 || s.week - f.w > 6 || !FACT_RUMORS[f.k]) continue;
      const p = L.people[f.a[0]];
      const lot = f.at ? s.econ?.lots.find((l) => l.id === f.at) : undefined;
      const place = lot ? (lot.name ?? lot.tenant ?? `the place at ${lot.address}`) : 'a certain shop on Pacific Avenue';
      const tpl = pickR(s, `fr:${f.id}`, FACT_RUMORS[f.k]);
      const last = p?.l ?? 'Smith';
      const plural = /(s|z|x|ch|sh)$/.test(last) ? `${last}es` : `${last}s`;
      out.push({ key: `f:${f.id}`, kind: f.k, a: 'town', b: tpl.replace('{L}s', plural).replace('{L}', last).replace('{P}', place) });
    }
  }
  const D = s.dating;
  for (const r of D?.rumors ?? []) {
    if (!r.true || s.week - r.week > 4) continue;
    const aboutBoss = r.about === boss.id;
    out.push({ key: `r:${r.week}:${r.text.length}`, a: aboutBoss ? 'boss' : 'town', b: `They say ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)} You didn't hear it from me.`, fx: aboutBoss && wife ? { wife: -3 } : undefined });
  }
  return out;
}

function surnames(s: GameState): string[] {
  const L = s.living;
  const l = L ? Object.values(L.people).filter((p) => !p.dead && !p.left).map((p) => p.l) : [];
  return l.length ? [...new Set(l)].sort() : ['Kowalski', 'Duffy', 'Ricci', 'Hauser'];
}

/** Spout Off for one edition: `n` call-ins, a mix of true, grumble and false. */
export function spoutOff(s: GameState, key: string, n: number, used: Set<string>): PItem[] {
  const out: PItem[] = [];
  const truths = trueRumors(s).filter((r) => !used.has(r.key));
  const owned = !!s.paper?.owned;
  const m = dateOfWeek(s.week + 1).m;
  const grumbles = GRUMBLES.filter((g) => !g.m || g.m.includes(m));
  const names = surnames(s);
  for (let i = 0; i < n; i++) {
    const k = `${key}:${i}`;
    const r = roll(s, `sp:${k}`);
    // A third or so are true, when there is something true to tell; the rest grumbling and the odd false rumor.
    if (r < 0.32 && truths.length) {
      const idx = Math.floor(roll(s, `spt:${k}`) * truths.length);
      const t = truths[idx];
      // The boss's own paper leaves him out of it, mostly.
      if (owned && t.a === 'boss' && roll(s, `own:${k}`) < 0.7) { truths.splice(idx, 1); i--; continue; }
      for (let j = truths.length - 1; j >= 0; j--) if (j === idx || (t.kind && truths[j].kind === t.kind)) truths.splice(j, 1);
      used.add(t.key);
      out.push({ id: '', s: 'spout', b: t.b, t: 'true', a: t.a, fx: t.fx });
    } else if (r < 0.8 || !FALSE_RUMORS.length) {
      out.push({ id: '', s: 'spout', b: pickR(s, `spg:${k}`, grumbles).t, t: 'grumble', a: 'town' });
    } else {
      const tpl = pickR(s, `spf:${k}`, FALSE_RUMORS);
      const aboutBoss = tpl.includes('{H}');
      out.push({ id: '', s: 'spout', b: tpl.replace('{S}', pickR(s, `sps:${k}`, names)).replace('{H}', s.houseName), t: 'false', a: aboutBoss ? 'boss' : 'town' });
    }
  }
  // No call-in twice in one edition.
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.b) ? false : (seen.add(x.b), true)));
}

/* ------------------------------------------------------------------ */
/* The rooms of the night                                             */
/* ------------------------------------------------------------------ */

const PERFORMER = new Set(['doo-wop', 'rock-and-roll', 'lounge-singer', 'jazz', 'comic', 'bandleader', 'dancer', 'dj']);

function performers(s: GameState, y: number): WorldPerson[] {
  return ENTERTAINMENT.filter((p) => p.showbiz && PERFORMER.has(p.showbiz.category) && (!p.deathYear || p.deathYear > y) && p.birthYear <= y - 16 && s.characters[p.id]?.alive !== false)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function billName(p: WorldPerson): string {
  const sb = p.showbiz!;
  if (sb.act) return sb.act;
  if (p.nickname) return p.nickname.includes(' ') ? p.nickname : `${p.nickname} ${p.name.last}`;
  return `${p.name.first} ${p.name.last}`;
}

/** Who a room books for a week (deterministic; some rooms hold an act over for two weeks). */
function booking(s: GameState, room: Room, week: number, pool: WorldPerson[], taken: Set<string>): WorldPerson | undefined {
  const fit = pool.filter((p) => room.cats.includes(p.showbiz!.category) && !taken.has(p.id) && !taken.has(`act:${p.showbiz!.act ?? p.id}`));
  if (!fit.length) return undefined;
  const hold = roll(s, `hold:${room.id}:${Math.floor(week / 2)}`) < 0.35;
  const w = hold ? Math.floor(week / 2) * 2 : week;
  // The bigger rooms in the high season get the bigger names.
  const ranked = [...fit].sort((a, b) => b.showbiz!.fame - a.showbiz!.fame || (a.id < b.id ? -1 : 1));
  const top = Math.max(1, Math.ceil(ranked.length * 0.6));
  return ranked[Math.floor(roll(s, `book:${room.id}:${w}`) * top) % top];
}

export interface Listing { room: string; act: string; opener?: string; times: string; cover: string; rave?: string; own?: boolean; ad?: boolean; held?: boolean; film?: boolean }

/**
 * "Who's playing in Wildwood this week": the town's rooms (as many as the
 * season keeps open), the boss's own rooms with whatever act his booking
 * manager landed, and the movie houses.
 */
export function whosPlaying(s: GameState, week: number = s.week): Listing[] {
  const d = dateOfWeek(week);
  const curve = seasonCurve(d);
  const pool = performers(s, d.y);
  const taken = new Set<string>();
  const out: Listing[] = [];
  const P = s.paper;
  const adOn = (key: string) => (P?.ads[key] ?? -1) >= week;
  // The boss's rooms first: the paper bills what he books.
  const linked = new Set<string>();
  const ownNames = new Set<string>();
  for (const v of Object.values(s.empire?.venues ?? {})) {
    if (v.owner !== 'player' || !(v.policy.act || v.concept === 'nightclub' || v.concept === 'bar')) continue;
    if (v.opKey) linked.add(v.opKey);
    const act = v.policy.act;
    if (act?.worldId) { taken.add(act.worldId); const wp = ENTERTAINMENT.find((x) => x.id === act.worldId); if (wp) taken.add(`act:${wp.showbiz?.act ?? wp.id}`); }
    ownNames.add(v.name.toLowerCase());
    const cover = v.policy.coverCharge ? `$${v.policy.coverCharge.toFixed(2)} cover` : 'No cover';
    out.push({ room: v.name, act: act?.name ?? 'The house band', times: 'Nightly from 9', cover, own: true, ad: adOn(`venue:${v.id}`) || (!!v.opKey && adOn(`biz:${v.opKey}`)), rave: act && (act.draw ?? 0) >= 0.6 ? 'The biggest name on the island this week. Get there early.' : undefined });
  }
  for (const b of s.businesses) {
    if (b.owner !== 'player' || b.kind !== 'club' || linked.has(b.id) || (b.closedUntil ?? 0) > week) continue;
    ownNames.add(b.name.toLowerCase());
    out.push({ room: b.name, act: pickR(s, `hb:${b.id}:${week}`, OPENERS.lounge), times: 'Nightly from 9', cover: '$1 cover', own: true, ad: adOn(`biz:${b.id}`) });
  }
  // The boss's own acts (showbiz.ts) headline his rooms the weeks he books them there.
  if (week === s.week) for (const b of billings(s)) { const row = b.own ? out.find((o) => o.own && o.room === b.room) : undefined; if (row) row.act = b.act; }
  // The town's rooms, as the season has them open.
  for (const room of ROOMS) {
    if (curve < room.min || ownNames.has(room.name.toLowerCase()) || ownNames.has(room.name.replace(/^The /, '').toLowerCase())) continue;
    // Off-season: the open rooms are weekends only.
    const p = booking(s, room, week, pool, taken);
    const opener = (OPENERS[room.style] ?? []).length ? pickR(s, `op:${room.id}:${week}`, OPENERS[room.style]) : undefined;
    const act = p ? billName(p) : opener ?? 'Dancing';
    if (p) { taken.add(p.id); taken.add(`act:${p.showbiz!.act ?? p.id}`); }
    const prev = booking(s, room, week - 1, pool, new Set());
    const held = !!p && !!prev && prev.id === p.id && curve >= room.min;
    const cat = p?.showbiz?.category ?? 'default';
    out.push({
      room: room.name, act, opener: p ? opener : undefined, times: curve < 0.3 ? 'Fri. & Sat. only, 9 P.M.' : room.times, cover: room.cover, held,
      rave: roll(s, `rave:${room.id}:${week}`) < 0.6 ? pickR(s, `rv:${room.id}:${week}`, RAVES[cat] ?? RAVES.default) : undefined,
    });
  }
  // The Convention Hall: the big show of the week in the high season.
  if (curve >= 0.85) {
    const big = pool.filter((p) => !taken.has(p.id) && p.showbiz!.fame >= 55);
    if (big.length) {
      const p = big[Math.floor(roll(s, `hall:${week}`) * big.length) % big.length];
      out.push({ room: 'The Convention Hall', act: `${billName(p)} — ONE NIGHT ONLY`, times: 'Saturday 8:30 P.M.', cover: 'Reserved seats $2.50 & $3.50', rave: 'Tickets at the box office and the Tide office.' });
    }
  }
  // The movie houses.
  const films = FILMS[Math.min(1965, Math.max(1960, d.y))] ?? FILMS[1960];
  const houses = curve >= 0.3 ? MOVIE_HOUSES : MOVIE_HOUSES.slice(0, 1);
  houses.forEach((h, i) => out.push({ room: h, act: pickR(s, `film:${i}:${Math.floor(week / 2)}`, films), times: h.includes('Drive-In') ? 'At dusk' : 'Continuous from 1 P.M.', cover: h.includes('Drive-In') ? '$1.50 a carload' : 'Adults 75¢, children 35¢', film: true }));
  return out;
}

/* ------------------------------------------------------------------ */
/* Weather, sport, classifieds                                         */
/* ------------------------------------------------------------------ */

function weather(s: GameState, d: GameDate, key: string): PItem {
  const hi = HIGHS[d.m - 1] + Math.round((roll(s, `hi:${key}`) - 0.5) * 10);
  const lo = hi - 9 - Math.round(roll(s, `lo:${key}`) * 5);
  const winter = [11, 12, 1, 2, 3].includes(d.m);
  const sky = pickR(s, `sky:${key}`, winter ? WINTER_SKIES : SKIES);
  // Two high tides a day, about 50 minutes later each day (a 12 h 25 min cycle).
  const n = Math.floor(Date.UTC(d.y, d.m - 1, d.d) / 86400000);
  const t1 = (((310 + n * 50) % 745) + 745) % 745;
  const fmt = (m: number) => { const mm = ((m % 1440) + 1440) % 1440; const h = Math.floor(mm / 60); return `${h % 12 || 12}:${String(mm % 60).padStart(2, '0')} ${h < 12 ? 'A.M.' : 'P.M.'}`; };
  const water = [6, 7, 8, 9].includes(d.m) ? ` Ocean temperature ${HIGHS[d.m - 1] - 8}°.` : '';
  return { id: '', s: 'weather', h: 'Weather & Tides', b: `${sky}. High ${hi}°, low ${lo}°.${water} High tide ${fmt(t1)} and ${fmt(t1 + 745)} at the Inlet.` };
}

function sports(s: GameState, d: GameDate, key: string, long = false): PItem[] {
  const out: PItem[] = [];
  const season = isInSeason(d);
  const off = Math.floor(roll(s, `hs:${key}`) * HORSES.length);
  const h = (k: string) => HORSES[(off + ({ h1: 0, h2: 3, h3: 7 } as Record<string, number>)[k]) % HORSES.length];
  if (season || d.m === 4 || d.m === 5 || d.m === 9 || d.m === 10) out.push({ id: '', s: 'sports', h: 'At the Track', b: `At the Atlantic City Race Course, ${h('h1')} took the feature by a length over ${h('h2')}, paying $${(4 + roll(s, `pay:${key}`) * 14).toFixed(2)} to win. ${h('h3')} was scratched.` });
  const t = pickR(s, `tm:${key}`, TEAMS);
  const u = pickR(s, `tm2:${key}`, TEAMS.filter((x) => x !== t));
  const a = 1 + Math.floor(roll(s, `sa:${key}`) * 9);
  const b = Math.floor(roll(s, `sb:${key}`) * a);
  const sport = season ? 'in the Cape-Atlantic summer league' : [9, 10, 11].includes(d.m) ? 'on the gridiron' : 'on the hardwood';
  const score = season ? `${a}-${b}` : [9, 10, 11].includes(d.m) ? `${a * 3 + 7}-${b * 3}` : `${48 + a * 3}-${44 + b * 2}`;
  out.push({ id: '', s: 'sports', h: 'Local Teams', b: `${t[0].toUpperCase()}${t.slice(1)} beat ${u} ${score} ${sport}.` });
  if (long && season) out.push({ id: '', s: 'sports', h: 'The Fights', b: `Friday at the Convention Hall: ${FIGHTERS[off % FIGHTERS.length]} meets ${FIGHTERS[(off + 2) % FIGHTERS.length]}, ten rounds, middleweights. First bell 8:30.` });
  return out;
}

function classifieds(s: GameState, key: string, n: number, offset: number): PItem[] {
  const lots = (s.econ?.lots ?? []).filter((l) => l.status === 'sale').sort((a, b) => (s.market?.listed[b.id]?.w ?? 0) - (s.market?.listed[a.id]?.w ?? 0) || a.price - b.price || (a.id < b.id ? -1 : 1));
  const out: PItem[] = [];
  const len = lots.length;
  for (let i = 0; i < Math.min(n, len); i++) {
    const l = lots[(offset + i) % len];
    const why = s.market?.listed[l.id]?.why;
    const zone = ZONES_BY_ID[l.zone]?.name ?? 'Wildwood';
    const what = l.home ? (l.use ? 'HOUSE' : 'HOUSE LOT') : l.use ? 'BUILDING' : 'LOT';
    const tag = why === 'estate' ? ' Estate sale.' : why === 'bank' ? ' Bank-owned.' : why === 'auction' ? ' City tax sale.' : why === 'newbuild' ? ' New construction.' : why === 'fire' ? ' As is.' : why === 'cut' ? ' PRICE REDUCED.' : '';
    out.push({ id: '', s: 'classified', h: `${what} FOR SALE`, b: `${l.address}, ${zone}.${l.name ? ` ${l.name}.` : ''}${tag} Asking ${$(l.price)}.`, lot: l.id, ask: l.price });
  }
  const m = dateOfWeek(s.week + 1).m;
  const hw = HELP_WANTED.filter((x) => !x.m || x.m.includes(m));
  const rl = ROOMS_TO_LET.filter((x) => !x.m || x.m.includes(m));
  if (hw.length) out.push({ id: '', s: 'classified', h: 'HELP WANTED', b: pickR(s, `hw:${key}`, hw).t });
  if (rl.length) out.push({ id: '', s: 'classified', h: 'ROOMS TO LET', b: pickR(s, `rl:${key}`, rl).t });
  return out;
}

function entItems(s: GameState, week: number, key: string, max: number): PItem[] {
  const list = whosPlaying(s, week);
  // The boss's rooms always; the rest rotate in the daily's small box.
  const own = list.filter((x) => x.own);
  const rest = list.filter((x) => !x.own);
  const off = Math.floor(roll(s, `entoff:${key}`) * Math.max(1, rest.length));
  const pickRest = max >= list.length ? rest : Array.from({ length: Math.max(0, Math.min(rest.length, max - own.length)) }, (_, i) => rest[(off + i) % rest.length]);
  return [...own, ...pickRest].map((x) => ({
    id: '', s: 'ent', h: x.room, b: `${x.act}${x.opener ? `, with ${x.opener}` : ''}`, x: `${x.times} · ${x.cover}`, r: x.rave,
    ...(x.own ? { own: 1 as const } : {}), ...(x.ad ? { ad: 1 as const } : {}), ...(x.held ? { ho: 1 as const } : {}),
  }));
}

/* ------------------------------------------------------------------ */
/* The week's editions                                                 */
/* ------------------------------------------------------------------ */

const FILLER: { m: number[]; h: string; b: string }[] = [
  { m: [6, 7, 8], h: 'CROWDS PACK THE BOARDWALK', b: 'Merchants report a busy weekend; the trams ran past midnight and the custard stands ran out of cones.' },
  { m: [6, 7, 8], h: 'BEACH PATROL MAKES SIX RESCUES', b: 'Lifeguards ask bathers to stay between the flags. Rip currents off the 17th Street beach are the worst in years.' },
  { m: [5, 6, 9], h: 'COUNCIL TAKES UP BOARDWALK REPAIRS', b: 'Bids are out. Everyone wonders who will get the contract.' },
  { m: [10, 11, 12, 1, 2, 3, 4], h: 'NOR\'EASTER BATTERS THE ISLAND', b: 'Flooding on New Jersey Avenue; the boardwalk takes a beating and the year-rounders take it in stride.' },
  { m: [11, 12, 1, 2, 3], h: 'OFF-SEASON: TOWN QUIET, FISHING GOOD', b: 'The shops are shuttered and the stripers are running off the Crest.' },
  { m: [4, 5], h: 'PAINT AND HAMMERS ON THE PIERS', b: 'Crews are readying the rides for Memorial Day. The Marine Pier promises a new coaster.' },
  { m: [7, 8, 9], h: 'MOTELS REPORT "NO VACANCY" SIGNS ALL WEEK', b: 'Even the rooming houses on the beach block are full. Late arrivals are sleeping in their cars.' },
  { m: [9, 10], h: 'SCHOOL BELLS RING ON THE ISLAND', b: 'Enrollment is up at Wildwood High; the new teachers are still looking for apartments.' },
];

const EDITORIALS: { m: number[]; b: string }[] = [
  { m: [5, 6], b: 'Another season is upon us. Let us greet our visitors with clean streets, honest prices and a smile. They pay our bills for the winter.' },
  { m: [7, 8], b: 'The town is full, the cash registers ring, and the City Hall should use the good times to fix the bad roads. We will be watching.' },
  { m: [9, 10], b: 'The season is over. Let us count what we earned, and ask what we spent it on. A town is more than ten weeks of summer.' },
  { m: [11, 12, 1, 2, 3, 4], b: 'In the quiet months a town shows its character. Patronize the year-round merchants; they are your neighbors, and they are still here.' },
];

let seq = 0;
function stamp(_P: PaperState, edId: string, it: PItem): PItem {
  return { ...it, id: `${edId}.${++seq}` };
}

function byline(s: GameState, sec: string, key: string): string | undefined {
  const l = BYLINES[sec];
  return l ? pickR(s, `by:${sec}:${key}`, l) : undefined;
}

/** Set next week's dailies and weekly from the wire. */
function setEditions(s: GameState, P: PaperState, wire: Wire[]): Edition[] {
  const wk = s.week + 1;
  const base = dateOfWeek(wk);
  const eds: Edition[] = [];
  seq = 0;
  // Sort the wire: the biggest stories lead the week.
  const order = wire.map((w, i) => ({ w, i })).sort((a, b) => (b.w.p ?? 0) - (a.w.p ?? 0) || a.i - b.i).map((x) => x.w);
  const byDay: Wire[][] = Array.from({ length: 7 }, () => []);
  let rr = 0;
  order.forEach((w, i) => {
    const min = w.min ?? 0;
    if (i < 4 && min === 0) { byDay[0].push(w); return; }
    const d = Math.max(min, 1 + (rr++ % 6));
    byDay[d].push(w);
  });
  const used = new Set<string>();
  const listings = (s.econ?.lots ?? []).filter((l) => l.status === 'sale').length;
  for (let day = 0; day < 7; day++) {
    const id = `d${wk}-${day}`;
    const date = addDays(base, day);
    const items: PItem[] = byDay[day].map((w) => { const { min: _m, ...it } = w; return stamp(P, id, it); });
    if (!items.some((x) => x.s === 'front')) {
      const fl = FILLER.filter((f) => f.m.includes(date.m));
      const f = fl.length ? pickR(s, `fill:${wk}:${day}`, fl) : undefined;
      if (f) items.push(stamp(P, id, { id: '', s: 'front', h: f.h, b: f.b, p: 5 }));
    }
    // Monday's Spout Off is set before the night editor can call: nothing true about the boss's people.
    const callIns = spoutOff(s, `${wk}:${day}`, 3, used).filter((x) => day > 0 || x.t !== 'true' || (x.a !== 'boss' && x.a !== 'family'));
    for (const sp of callIns) items.push(stamp(P, id, sp));
    items.push(stamp(P, id, weather(s, date, `${wk}:${day}`)));
    for (const sp of sports(s, date, `${wk}:${day}`)) items.push(stamp(P, id, sp));
    for (const c of classifieds(s, `${wk}:${day}`, 5, day * 5 % Math.max(1, listings))) items.push(stamp(P, id, c));
    for (const e of entItems(s, wk, `${wk}:${day}`, 4)) items.push(stamp(P, id, e));
    for (const x of adItems(s, wk)) items.push(stamp(P, id, x));
    eds.push({ id, kind: 'daily', week: wk, day, date, n: 0, items });
  }
  // The Thursday weekly: the week in review, the features, the full listings.
  const wid = `w${wk}`;
  const date = addDays(base, WEEKLY_DAY);
  const witems: PItem[] = [];
  const dailyNews = eds.flatMap((e) => e.items).filter((x) => ['front', 'blotter', 'deeds', 'business', 'society', 'wire'].includes(x.s) && (x.p ?? 0) > 5);
  const lead = dailyNews.filter((x) => x.s === 'front').sort((a, b) => (b.p ?? 0) - (a.p ?? 0))[0];
  if (lead) witems.push({ ...stamp(P, wid, { ...lead, fx: undefined, src: lead.id }), s: 'feature', x: byline(s, 'feature', wid), b: `${lead.b} ${featureTail(lead)}` });
  else {
    const fl = FILLER.filter((f) => f.m.includes(date.m));
    const f = fl.length ? pickR(s, `wfill:${wk}`, fl) : FILLER[0];
    witems.push(stamp(P, wid, { id: '', s: 'feature', h: f.h, b: `${f.b} ${quietTail(date)}`, x: byline(s, 'feature', wid) }));
  }
  for (const x of dailyNews) if (x !== lead) witems.push(stamp(P, wid, { ...x, fx: undefined, src: x.id }));
  witems.push(stamp(P, wid, { id: '', s: 'review', h: 'The Week in Review', b: weekInReview(dailyNews) }));
  for (const sp of spoutOff(s, `${wk}:w`, 7, used)) witems.push(stamp(P, wid, sp));
  witems.push(stamp(P, wid, { id: '', s: 'editorial', h: 'From the Editor\'s Desk', b: (EDITORIALS.find((e) => e.m.includes(date.m)) ?? EDITORIALS[0]).b }));
  for (const sp of sports(s, date, `${wk}:w`, true)) witems.push(stamp(P, wid, sp));
  witems.push(stamp(P, wid, { ...weather(s, date, `${wk}:w`), h: 'The Week Ahead' }));
  for (const c of classifieds(s, `${wk}:w`, 12, 0)) witems.push(stamp(P, wid, c));
  for (const e of entItems(s, wk, `${wk}:w`, 99)) witems.push(stamp(P, wid, e));
  for (const x of adItems(s, wk)) witems.push(stamp(P, wid, x));
  eds.splice(4, 0, { id: wid, kind: 'weekly', week: wk, day: WEEKLY_DAY, date, n: 0, items: witems });
  for (const e of eds) e.n = ++P.n;
  return eds;
}

function weekInReview(news: PItem[]): string {
  const heads = news.filter((x) => x.s === 'front' || x.s === 'wire').map((x) => (x.h ?? '').replace(/\.$/, '')).filter(Boolean).slice(0, 6);
  const n = (sec: Sec) => news.filter((x) => x.s === sec).length;
  const parts = [...heads];
  if (n('blotter')) parts.push(`${n('blotter')} item${n('blotter') === 1 ? '' : 's'} on the police blotter`);
  if (n('deeds')) parts.push(`${n('deeds')} deed${n('deeds') === 1 ? '' : 's'} recorded`);
  if (n('business')) parts.push(`${n('business')} business notice${n('business') === 1 ? '' : 's'}`);
  if (n('society')) parts.push(`${n('society')} society notice${n('society') === 1 ? '' : 's'}`);
  return parts.length ? `${parts.join(' · ')}.` : 'A quiet week on Five Mile Beach.';
}

function featureTail(lead: PItem): string {
  if (lead.s === 'front' && /ARREST/.test(lead.h ?? '')) return 'Old-timers on Pacific Avenue say they have seen this before: a name in the paper on Monday, a lawyer from Philadelphia on Tuesday, and by August nobody remembers. This time, the courthouse crowd says, may be different.';
  if (/DEAD|KILLING/.test(lead.h ?? '')) return 'The Leader spoke to a dozen neighbors. Not one would give a name. "It\'s a summer town," one said. "You mind your own."';
  if (/SEASON|BOARDWALK|PIER/.test(lead.h ?? '')) return 'The merchants\' association expects the best summer since the war, provided the weather holds and the Philadelphia buses keep coming.';
  return 'What it means for the island, the Leader will follow in the weeks ahead.';
}

function quietTail(d: GameDate): string {
  return isInSeason(d) ? 'A week like this is why the island lives eleven months on ten weeks.' : 'In the off-season the island belongs to the people who stay.';
}

/** The boss's paid ads, set as display boxes. */
function adItems(s: GameState, wk: number): PItem[] {
  const P = s.paper;
  if (!P) return [];
  const out: PItem[] = [];
  for (const [key, until] of Object.entries(P.ads)) {
    if (until < wk) continue;
    const name = placeName(s, key);
    if (!name) continue;
    out.push({ id: '', s: 'business', h: name.toUpperCase(), b: pickR(s, `adcopy:${key}:${wk}`, ['Air-conditioned! Cocktails, dinner and dancing nightly.', 'The friendliest place on the island. Come as you are.', 'Under new management. Ask for the special.', 'Open late. Plenty of parking in the rear.']), ad: 1 });
  }
  return out;
}

/** The boss's place an ad is for. */
export function placeName(s: GameState, key: string): string | undefined {
  if (key.startsWith('biz:')) {
    const b = s.businesses.find((x) => x.id === key.slice(4) && x.owner === 'player');
    return b?.name;
  }
  if (key.startsWith('venue:')) {
    const v = s.empire?.venues[key.slice(6)];
    return v?.owner === 'player' ? v.name : undefined;
  }
  return undefined;
}

/** The boss's places that can run an ad (fronts the public walks into). */
export function adPlaces(s: GameState): { key: string; name: string }[] {
  const out: { key: string; name: string }[] = [];
  const linked = new Set<string>();
  for (const v of Object.values(s.empire?.venues ?? {})) {
    if (v.owner !== 'player') continue;
    if (v.opKey) linked.add(v.opKey);
    out.push({ key: `venue:${v.id}`, name: v.name });
  }
  for (const b of s.businesses) {
    if (b.owner !== 'player' || linked.has(b.id) || (b.category && b.category !== 'front')) continue;
    out.push({ key: `biz:${b.id}`, name: b.name });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The weekly step                                                     */
/* ------------------------------------------------------------------ */

function fxEffects(s: GameState, fx: PFx, label: string): Effect[] {
  const out: Effect[] = [];
  for (const [bar, n] of fx.heat ?? []) out.push({ type: 'heat', bar, amount: s.edicts?.lowprofile ? Math.ceil(n / 2) : n, label });
  if (fx.resp) out.push({ type: 'respect', amount: fx.resp, label });
  const wife = wifeOf(s);
  if (fx.wife && wife) out.push({ type: 'opinion', from: wife.id, to: s.playerId, amount: fx.wife, reason: 'Read it in Spout Off', decay: 1, label });
  if (fx.rivalOpinion) out.push({ type: 'rivalOpinion', rival: fx.rivalOpinion[0], amount: fx.rivalOpinion[1], reason: 'What the paper printed', label });
  if (fx.rivalExposure) out.push({ type: 'rivalResource', rival: fx.rivalExposure[0], exposure: fx.rivalExposure[1], label });
  if (fx.familyOpinion) out.push({ type: 'familyOpinion', amount: fx.familyOpinion, reason: 'Saw it in the paper', label });
  return out;
}

/** What the printed stories of the week did, now that the town has read them. */
function settle(ctx: Ctx, P: PaperState): void {
  const s = ctx.s;
  for (const ed of P.eds) {
    if (ed.settled || ed.week > s.week) continue;
    ed.settled = 1;
    if (ed.kind !== 'daily') continue;
    for (const it of ed.items) {
      if (it.sp || !it.fx) continue;
      const short = (it.h ?? it.b).replace(/\s+/g, ' ').slice(0, 48);
      const label = it.s === 'spout' ? `Spout Off: "${short}${short.length >= 48 ? '…' : ''}"` : `${DAILY_SHORT}: "${short}"`;
      const fx = fxEffects(s, it.fx, label);
      if (fx.length) applyEffects(ctx, fx, { label, because: 'it was in the paper', category: 'event' });
      if (it.fx.ctl && s.pol?.ctl[it.fx.ctl[0]]) {
        const c = s.pol.ctl[it.fx.ctl[0]];
        c.exposure = Math.min(100, c.exposure + it.fx.ctl[1]);
      }
      if (it.fx.goomar) {
        const g = s.nightlife?.goomars[it.fx.goomar];
        const her = s.characters[it.fx.goomar];
        const rv = s.rivals.find((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
        if (g && her && rv) {
          const sec = addSecret(s, player(s), 'affair', [rv.id as FactionId]);
          if (!sec.knownBy.includes(rv.id as FactionId)) sec.knownBy.push(rv.id as FactionId);
        }
      }
    }
  }
}

/** Ads: the trade they bring the boss's fronts (the hotels and clubs: see paperAds.ts / empireOps). */
function adsWeek(ctx: Ctx, P: PaperState): void {
  const s = ctx.s;
  const mult = isInSeason(s.date) ? 1 : 0.45;
  for (const [key, until] of Object.entries(P.ads)) {
    if (until < s.week) { delete P.ads[key]; continue; }
    if (!key.startsWith('biz:')) continue;
    const b = s.businesses.find((x) => x.id === key.slice(4) && x.owner === 'player');
    if (!b || (b.closedUntil ?? 0) > s.week) continue;
    const lift = Math.round(b.weeklyBase * mult * 0.08);
    if (lift > 0) money(ctx, lift, `Ad in the ${DAILY_SHORT}: more trade at ${b.name}`, 'business');
  }
  if (P.owned !== undefined) money(ctx, Math.round((isInSeason(s.date) ? 220 : -140) * inflation(s)), `The ${DAILY_SHORT} (yours): ${isInSeason(s.date) ? 'summer advertising' : 'the winter press run'}`, 'business');
}

/**
 * The papers' week: what last week's editions did lands; the town is read;
 * next week's dailies and weekly are set. Called by advanceWeek after the
 * old news desk (newspaper.ts) and before the calendar turns.
 */
export function paperWeek(ctx: Ctx): void {
  const s = ctx.s;
  const P = ensurePaper(s);
  settle(ctx, P);
  adsWeek(ctx, P);
  const wire = [...gatherWire(s, P), ...violenceWire(ctx)];
  P.plants = [];
  P.wire = [];
  const eds = setEditions(s, P, wire);
  P.eds.push(...eds);
  // The archive: two weeks of dailies, two months of weeklies.
  const d = P.eds.filter((e) => e.kind === 'daily');
  const w = P.eds.filter((e) => e.kind === 'weekly');
  const keep = new Set([...d.slice(-KEEP_DAILIES), ...w.slice(-KEEP_WEEKLIES)].map((e) => e.id));
  P.eds = P.eds.filter((e) => keep.has(e.id));
  P.jail = jailed(s);
  P.last = s.week;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** Is this edition on the desk yet (its day has come)? */
export function isOut(s: GameState, e: Edition): boolean {
  return e.week < s.week || (e.week === s.week && e.day <= today(s));
}

/** The editions on the desk, newest first. */
export function editionsOut(s: GameState, kind?: Edition['kind']): Edition[] {
  return (s.paper?.eds ?? []).filter((e) => isOut(s, e) && (!kind || e.kind === kind)).sort((a, b) => b.n - a.n);
}

export function unreadCount(s: GameState): number {
  const r = s.paper?.read ?? 0;
  return editionsOut(s).filter((e) => e.n > r).length;
}

/** The boss has read the paper (pure). */
export function markPaperRead(s: GameState, upTo?: number): GameState {
  if (!s.paper) return s;
  const top = upTo ?? Math.max(0, ...editionsOut(s).map((e) => e.n));
  if (top <= s.paper.read) return s;
  return { ...s, paper: { ...s.paper, read: top } };
}

/** The top story on the desk this morning. */
export function todaysHeadline(s: GameState): { paper: string; text: string; week: number } | undefined {
  const e = editionsOut(s)[0];
  const lead = e?.items.filter((x) => (x.s === 'front' || x.s === 'feature') && !x.sp).sort((a, b) => (b.p ?? 0) - (a.p ?? 0))[0];
  return lead?.h ? { paper: e.kind === 'daily' ? DAILY : WEEKLY, text: lead.h, week: e.week } : undefined;
}

export function findItem(s: GameState, id: string): { ed: Edition; it: PItem } | undefined {
  for (const ed of s.paper?.eds ?? []) {
    const it = ed.items.find((x) => x.id === id);
    if (it) return { ed, it };
  }
  return undefined;
}

/** The first day an item (or its weekly echo) reaches the street. */
function firstOut(s: GameState, id: string): { week: number; day: number } | undefined {
  let best: { week: number; day: number } | undefined;
  for (const ed of s.paper?.eds ?? []) {
    if (!ed.items.some((x) => x.id === id || x.src === id)) continue;
    if (!best || ed.week < best.week || (ed.week === best.week && ed.day < best.day)) best = { week: ed.week, day: ed.day };
  }
  return best;
}

/** The galley proofs: stories about the boss's people that have not run yet (the editor can still spike them). */
export function proofs(s: GameState): { ed: Edition; it: PItem }[] {
  const out: { ed: Edition; it: PItem }[] = [];
  for (const ed of s.paper?.eds ?? []) {
    if (ed.kind !== 'daily' || ed.week !== s.week) continue;
    for (const it of ed.items) if (!it.sp && it.fx && (it.a === 'boss' || it.a === 'family') && killable(s, it.id)) out.push({ ed, it });
  }
  return out;
}

function killable(s: GameState, id: string): boolean {
  const f = firstOut(s, id);
  return !!f && f.week === s.week && f.day > today(s);
}

/* ------------------------------------------------------------------ */
/* The boss and the paper: orders                                      */
/* ------------------------------------------------------------------ */

export type PaperAction =
  | { op: 'plant'; story: PlantKind; target?: string }
  | { op: 'kill'; item: string }
  | { op: 'ad'; place: string }
  | { op: 'buy' }
  | { op: 'sue'; item: string };

export const PLANT_COST: Record<PlantKind, number> = { puff: 800, smear: 1500, notice: 100 };

export function killCost(s: GameState, it: PItem): number {
  if (s.paper?.owned !== undefined) return 0;
  const base = it.s === 'front' ? 2500 : it.s === 'spout' ? 600 : 1000;
  return Math.round(base * inflation(s) / 50) * 50;
}

export function adCost(s: GameState): number {
  return Math.round(120 * AD_WEEKS * inflation(s) / 10) * 10;
}

export function suitCost(s: GameState): number {
  return Math.round(2500 * inflation(s) / 50) * 50;
}

export function paperPrice(s: GameState): number {
  return Math.round(PAPER_PRICE * inflation(s) / 500) * 500;
}

function off(title: string, why: string): ActionPreview {
  return { title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' };
}

const note = (text: string, label: string): Effect => ({ type: 'econ', op: { op: 'note', text }, label } as Effect);

export function previewPaper(s: GameState, a: PaperAction): ActionPreview {
  const owned = s.paper?.owned !== undefined;
  switch (a.op) {
    case 'plant': {
      const cost = owned ? 0 : Math.round(PLANT_COST[a.story] * inflation(s) / 50) * 50;
      const r = a.target ? s.rivals.find((x) => x.id === a.target) : undefined;
      const title = a.story === 'puff' ? 'Plant a story: a good word for your businesses' : a.story === 'smear' ? `Plant a story: dirt on ${r?.name ?? 'a rival'}'s places` : 'A notice on the society page for the family';
      const label = `${DAILY_SHORT}: ${a.story === 'puff' ? 'a puff piece' : a.story === 'smear' ? 'a planted story' : 'a society notice'}`;
      const block = a.story === 'smear' && (!r || r.kind !== 'mob') ? 'Pick a rival family' : (s.paper?.plants.length ?? 0) >= 2 ? 'The editor has room for two favors a week' : undefined;
      const fxText = a.story === 'puff' ? 'Respect +2 when it runs' : a.story === 'smear' ? `Their exposure +8, their opinion of you −5 when it runs${owned ? '' : '; 15% the editor talks (−10 more)'}` : 'The family is pleased (+3)';
      return {
        title, detail: `Runs early next week. ${fxText}.`, effects: [...(cost ? [{ type: 'money' as const, amount: -cost, label }] : []), note(fxText, label)], cost,
        because: a.story === 'smear' ? `planted a story about ${r?.name ?? 'a rival'}` : a.story === 'puff' ? 'planted a puff piece in the paper' : 'put a notice in the society page',
        disabledReason: block, category: 'event',
      };
    }
    case 'kill': {
      const f = findItem(s, a.item);
      if (!f) return off('Spike a story', 'That story is gone');
      const cost = killCost(s, f.it);
      const title = `Spike the story: "${(f.it.h ?? f.it.b).slice(0, 40)}…"`;
      const label = owned ? 'Your paper: spiked a story' : `${DAILY_SHORT}: the editor's envelope`;
      const why = f.it.sp ? 'Already spiked' : !killable(s, a.item) ? 'It has already run' : undefined;
      return { title, detail: owned ? 'It is your paper. It never runs.' : 'An envelope for the night editor. It never runs, and what it would have done never happens.', effects: [...(cost ? [{ type: 'money' as const, amount: -cost, label }] : []), note('The story never runs', label)], cost, because: 'paid the editor to spike a story', disabledReason: why, category: 'event' };
    }
    case 'ad': {
      const name = placeName(s, a.place);
      if (!name) return off('Buy an ad', 'Not one of your places');
      const cost = adCost(s);
      const label = `Ad in the ${DAILY_SHORT}: ${name}`;
      const run = s.paper?.ads[a.place];
      return { title: `Run an ad for ${name} (${AD_WEEKS} weeks)`, detail: `A display box in both papers for ${AD_WEEKS} weeks: more walk-in trade (and the clubs get billed bigger in the listings).`, effects: [{ type: 'money', amount: -cost, label }, note(`${AD_WEEKS} weeks of ads`, label)], cost, because: `ran an ad for ${name}`, disabledReason: run !== undefined && run >= s.week + 1 ? `Already running through week ${run}` : undefined, category: 'business' };
    }
    case 'buy': {
      const cost = paperPrice(s);
      const label = `Bought the ${DAILY_SHORT}`;
      return {
        title: `Buy the ${DAILY} (and the ${WEEKLY_SHORT})`, detail: 'The publisher is tired and the presses are old. Yours: stories spiked for free, plants that never trace back, Spout Off goes easy on you. The feds notice a man like you buying a newspaper.',
        effects: [{ type: 'money', amount: -cost, label }, { type: 'heat', bar: 'federal', amount: 3, label }, { type: 'respect', amount: 3, label }], cost,
        because: 'bought the town paper', disabledReason: owned ? 'It is already yours' : s.respect < 40 ? 'The publisher won\'t sell to you yet (respect 40)' : undefined, category: 'business',
      };
    }
    case 'sue': {
      const f = findItem(s, a.item);
      if (!f) return off('Sue for libel', 'That story is gone');
      const cost = suitCost(s);
      const label = `Libel suit against the ${DAILY_SHORT}`;
      const out = firstOut(s, a.item);
      const ran = !!out && (out.week < s.week || (out.week === s.week && out.day <= today(s)));
      const why = !ran ? 'It hasn\'t run' : f.it.sp ? 'It never ran' : !(f.it.a === 'boss' || f.it.a === 'family') ? 'It isn\'t about you or yours' : s.paper?.sued.includes(a.item) ? 'Already in court' : owned ? 'You own the paper' : undefined;
      return {
        title: `Sue the paper for libel: "${(f.it.h ?? f.it.b).slice(0, 40)}…"`,
        detail: 'Your lawyer: "If it isn\'t true, we win and they print a retraction. If it is true, a courtroom is the last place you want to be. And the papers cover the trial either way." Rarely wise.',
        effects: [{ type: 'money', amount: -cost, label }, { type: 'heat', bar: 'federal', amount: 1, label }, note('Win if it was false (likely); lose badly if it was true', label)], cost,
        because: 'sued the paper for libel', disabledReason: why, category: 'event',
      };
    }
  }
}

export function commitPaper(ctx: Ctx, a: PaperAction): void {
  const s = ctx.s;
  const P = ensurePaper(s);
  const owned = P.owned !== undefined;
  switch (a.op) {
    case 'plant': {
      P.stats.planted++;
      const boss = player(s);
      const traced = a.story === 'smear' && !owned && roll(s, `trace:${s.week}:${P.stats.planted}`) < 0.15;
      if (a.story === 'puff') {
        const b = s.businesses.find((x) => x.owner === 'player' && (!x.category || x.category === 'front'));
        P.plants.push({ id: '', s: 'business', h: 'A Local Success Story', b: `${b ? `${b.name} is` : 'The ' + boss.lastName + ' businesses are'} the kind of year-round enterprise this island needs: steady jobs, a generous hand for the parish and the Little League, and a proprietor who believes in Wildwood.`, a: 'boss', pl: 1, fx: { resp: 2 }, p: 40 });
      } else if (a.story === 'smear') {
        const r = s.rivals.find((x) => x.id === a.target);
        if (!r) return;
        P.plants.push({ id: '', s: 'front', h: 'WHO OWNS THE BACK ROOMS ON THE BOULEVARD?', b: `Cards, dice and a telephone that never stops ringing: the Tide has learned that several Boulevard establishments are fronts for ${HOLDING[r.id] ?? 'out-of-town interests'}. Police say they "will look into it."`, a: 'rival', pl: 1, fx: { rivalExposure: [r.id, 8], rivalOpinion: [r.id, traced ? -15 : -5] }, p: 72 });
        if (traced) ctx.log.push(`The editor talked: the ${r.shortName} people know the story about them came from you.`);
      } else {
        const kin = s.chronicle.filter((e) => e.kind === 'family').slice(-1)[0];
        P.plants.push({ id: '', s: 'society', h: 'Family Notes', b: kin ? `The ${boss.lastName} family wishes to share its happy news with friends and neighbors: ${scrub(kin.text)}` : `Mr. and Mrs. ${boss.lastName} thank their many friends for their kindness this season.`, a: 'boss', pl: 1, fx: { familyOpinion: 3 }, p: 20 });
      }
      return;
    }
    case 'kill': {
      const f = findItem(s, a.item);
      if (!f) return;
      for (const ed of P.eds) for (const it of ed.items) if (it.id === a.item || it.src === a.item) it.sp = 1;
      P.stats.killed++;
      return;
    }
    case 'ad': {
      P.ads[a.place] = s.week + AD_WEEKS;
      P.stats.ads++;
      return;
    }
    case 'buy': {
      P.owned = s.week;
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The ${DAILY} changed hands: a local investor bought out the publisher.`, kind: 'misc' });
      return;
    }
    case 'sue': {
      const f = findItem(s, a.item);
      if (!f) return;
      P.sued.push(a.item);
      P.stats.suits++;
      const truth = f.it.t === 'true' || (f.it.s !== 'spout' && f.it.t !== 'false');
      const won = roll(s, `suit:${a.item}`) < (truth ? 0.2 : 0.75);
      const label = `Libel suit: ${won ? 'won' : 'lost'}`;
      if (won) {
        P.stats.won++;
        applyEffects(ctx, [{ type: 'respect', amount: 3, label }, { type: 'money', amount: Math.round(2000 * inflation(s)), label: `${label} (the settlement)` }], { label, because: 'sued the paper', category: 'event' });
        P.wire.push({ id: '', s: 'front', h: 'TIDE PRINTS RETRACTION', b: 'The Daily Tide regrets an item that appeared in these pages. It was without foundation. The Tide apologizes to the family concerned.', p: 50, a: 'boss' });
      } else {
        applyEffects(ctx, [{ type: 'respect', amount: -4, label }, { type: 'heat', bar: 'federal', amount: truth ? 4 : 1, label }], { label, because: 'sued the paper', category: 'event' });
        P.wire.push({ id: '', s: 'front', h: 'LIBEL SUIT THROWN OUT', b: `A local businessman's suit against this newspaper was dismissed. ${truth ? 'Testimony in the case, the judge noted, "tended to support the item complained of."' : 'The Tide stands by its reporting.'}`, p: 65, a: 'boss' });
      }
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* EXTRA! The week's violence on the front page                        */
/* ------------------------------------------------------------------ */

/**
 * The turn's violence that touched the boss, from the week's log lines: a raid on his place, his
 * man killed, shots at his door, his place hit, a war or a battle, an arrest. (The rivals' fights
 * among themselves stay in the report and the blotter.)
 */
const VIOLENT: [RegExp, string][] = [
  [/^RAID:/, 'COUNTY DETECTIVES RAID LOCAL BUSINESS'],
  [/(didn't come home|found his car)/i, 'BODY FOUND; POLICE SILENT'],
  [/(Shots through|came for you|jumped leaving a bar|Room 9 at the Starlight)/i, 'SHOTS, A BEATING: TROUBLE ON THE ISLAND'],
  [/^\S.* hit .* \(\$[\d,]+ gone\)|firebomb a dumpster behind your/i, 'FIRE AT LOCAL BUSINESS; OWNER "HAS NO ENEMIES"'],
  [/(went to the mattresses|declared war on you|war on you)/i, 'MERCHANTS FEAR A SUMMER OF TROUBLE'],
  [/^ARREST:/, 'FEDERAL AGENTS MAKE AN ARREST'],
];
/** At most this many EXTRA front pages from one week's turn (the rest are in the report). */
export const EXTRAS_PER_WEEK = 1;

function violenceWire(ctx: Ctx): Wire[] {
  const out: Wire[] = [];
  const used = new Set<string>();
  for (const l of ctx.log) {
    if (out.length >= EXTRAS_PER_WEEK) break;
    if (/^\(|^\[|came to nothing|crew covered it/.test(l)) continue;
    const hit = VIOLENT.find(([rx]) => rx.test(l));
    if (!hit || used.has(hit[1])) continue;
    used.add(hit[1]);
    out.push({ id: '', s: 'front', h: hit[1], b: scrub(l), p: 86, ex: 1, min: 1 + out.length });
  }
  return out;
}

/** A strike that landed mid-week: tomorrow's front page (or the next week's, from a Sunday). Mutates `s` (a working copy). */
export function extraPress(s: GameState, h: string, b: string): void {
  const P = ensurePaper(s);
  const d = today(s) + 1;
  const ed = d <= 6 ? P.eds.find((e) => e.kind === 'daily' && e.week === s.week && e.day === d) : undefined;
  const it: PItem = { id: '', s: 'front', h, b: scrub(b), p: 95, ex: 1 };
  if (ed) ed.items.unshift({ ...it, id: `${ed.id}.x${ed.items.length + 1}` });
  else pressItem(s, it);
}

/** Today's EXTRA, if one is on the desk and its card has not been shown. */
export function extraToday(s: GameState): PItem | undefined {
  const seen = new Set(s.action?.extras ?? []);
  const ed = (s.paper?.eds ?? []).find((e) => e.kind === 'daily' && e.week === s.week && e.day === today(s));
  return ed?.items.find((x) => x.ex && !seen.has(x.id));
}

/** The EXTRA card was shown (pure). */
export function markExtraShown(s: GameState, id: string): GameState {
  const A = s.action ?? { v: 1 as const, raided: {}, under: 0, sp: {}, extras: [], stats: { strikes: 0, raids: 0, summons: 0, bail: 0, extras: 0, setPieces: 0 } };
  return { ...s, action: { ...A, extras: [...A.extras, id].slice(-30), stats: { ...A.stats, extras: A.stats.extras + 1 } } };
}
