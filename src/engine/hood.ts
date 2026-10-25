import type { ActionPreview } from './actions';
import { isInSeason } from './calendar';
import { designMut, designOf, STYLES, SIGN_HEX, type BuildStyle, type SignColor } from './design';
import { marketValue } from './econ';
import { venueForLot } from './empire';
import { venueBuilding } from './empireBuild';
import type { Lot, ZoneId } from './econState';
import { HOOD_IDS, HOODS, HOODS_BY_ID, hoodOfZone, type HoodId } from './hoodData';
import { ensureHood, lotSig as sig, POLICIES, type HoodEvent, type HoodEventKind, type HoodSnapRow, type HoodState, type PolicyId } from './hoodState';
import { inflation, lotName, USES, USES_BY_ID, useIcon, ZONES_BY_ID, type UseCat } from './property';
import { chance, hashSeed, pick, rand } from './rng';
import type { Ctx } from './ledger';
import type { FactionId, GameState, RivalId } from './types';
import { FACTION_NAMES } from './world';

/**
 * The neighborhoods, month by month. Owners sell to owners; rivals buy out
 * independents where they are strong and let go where they are weak; shops
 * close in bad years and new ones open in the empty buildings; tired
 * buildings get fixed up in the style of the decade; each neighborhood's
 * economy follows the era (the Doo Wop boom of the early sixties, the long
 * slide of the seventies, Atlantic City's casinos) and what the families do
 * there. Every change is written into the lot's own ownership history and
 * the island's log, whoever made it (this layer, the property market, the
 * builders), so the dashboard can tell the story from the records.
 *
 * Pure engine: no UI imports, own dice (`hood.rng`).
 */

/* ---------------- the era ---------------- */

/** The island's economy by year (1 = 1960). */
export function eraEcon(year: number): number {
  const pts: [number, number][] = [[1960, 1], [1963, 1.08], [1966, 1.12], [1969, 1.0], [1972, 0.9], [1975, 0.82], [1978, 0.74], [1982, 0.78], [1990, 0.86], [2000, 0.95]];
  if (year <= pts[0][0]) return 1;
  for (let i = 1; i < pts.length; i++) {
    if (year <= pts[i][0]) {
      const [a, b] = [pts[i - 1], pts[i]];
      return a[1] + ((year - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    }
  }
  return 0.95;
}

/** The style a builder or a fixer-upper reaches for in a given year. */
export function decadeStyle(h: { rng: number }, year: number, zone: ZoneId): BuildStyle {
  if (year < 1967) return zone === 'crest' || zone === 'boardwalk' ? pick(h, ['doowop', 'doowop', 'tiki', 'midcentury'] as BuildStyle[]) : pick(h, ['midcentury', 'doowop', 'colonial'] as BuildStyle[]);
  if (year < 1980) return pick(h, ['midcentury', 'colonial', 'colonial', 'tiki'] as BuildStyle[]);
  return pick(h, ['victorian', 'colonial', 'deco', 'doowop'] as BuildStyle[]);
}

const SIGNS: SignColor[] = ['pink', 'turquoise', 'red', 'gold', 'green', 'blue', 'white'];

/** How a place looks: yours from your design, others' from the layer, the rest by a stable guess from its age and street. */
export function lookOf(s: GameState, l: Lot): { style: BuildStyle; sign: SignColor } {
  const mine = l.status === 'owned' || l.status === 'leased';
  const d = mine ? designOf(s, l.bizId ?? `lot:${l.id}`) : undefined;
  const npc = s.hood?.styles[l.id];
  const h = { rng: hashSeed(`${l.id}:look`) };
  const guess = decadeStyle(h, l.builtYear ?? 1950, l.zone);
  const style = d?.style ?? npc?.style ?? ((l.builtYear ?? 1950) < 1935 ? pick(h, ['victorian', 'colonial', 'deco'] as BuildStyle[]) : guess);
  const sign = d?.sign ?? npc?.sign ?? pick(h, SIGNS);
  return { style, sign };
}

/* ---------------- names ---------------- */

const OWNERS = ['Gus Papadakis', 'the Morey brothers', 'Abe Kaplan', 'the Sorensen family', 'Vince DiNardo', 'Mrs. Hallahan', 'the Kovacs family', 'Sid Weintraub', 'Lou Castellano', 'the Brennan estate', 'Joe Pirelli', 'Harry Lenz', 'Dot Fiorentino', 'the Yeager brothers', 'Max Rubin', 'Connie Mastro', 'Walt Kriebel', 'the Duffy sisters', 'Sal Ianelli', 'Bea Novak'];
const SIXTIES = ['Fun-O-Rama', 'Starlight', 'Satellite', 'Rocket', 'Tiki Hut', 'Sea Breeze', 'Jet Set', 'Holiday', 'Twist', 'Pink Cadillac', 'Surf Rider', 'Moon Shot'];
const SEVENTIES = ['Boogie', 'Sunshine', 'Rainbow', 'Mellow', 'Shore Thing', 'Groovy', 'Bicentennial', 'Disco', 'Captain\'s', 'Seventh Wave'];
const LATE = ['Neon Nights', 'Jackpot', 'Lucky Seven', 'Big Shot', 'Pac-Pier', 'Rad', 'Totally', 'Atlantic'];

export function placeName(h: { rng: number }, year: number, useId: string): string {
  const u = USES_BY_ID[useId];
  const pre = pick(h, year < 1968 ? SIXTIES : year < 1980 ? SEVENTIES : LATE);
  const noun = /motel|rooming|boarding|cottage/.test(useId) ? pick(h, ['Motel', 'Inn', 'Lodge']) : /club|supper|burlesque|gents|comedy/.test(useId) ? pick(h, ['Lounge', 'Room', 'Club']) : /pizza|icecream|diner|trattoria|deli|bakery|stand/.test(useId) ? pick(h, ['Grill', 'Snack Bar', 'Kitchen', 'Shoppe']) : u ? u.name.replace(/^(T-shirt & novelty|Beach chair & umbrella|Boardwalk photo) /, '').split(' ').slice(-1)[0] : 'Shop';
  return `The ${pre} ${noun[0].toUpperCase()}${noun.slice(1)}`;
}

/* ---------------- monthly ---------------- */

function monthKey(s: GameState): string {
  return `${s.date.y}-${s.date.m}`;
}


/** The person behind a tenant line ("Gus Papadakis's souvenir shop" → "Gus Papadakis"). */
function who(t?: string): string | undefined {
  return t?.replace(/'s [a-z][^']*$/, '');
}

function ownerLabel(o: FactionId | 'private' | 'city', by?: string): string {
  if (o === 'private') return who(by) ?? 'a private owner';
  if (o === 'city') return 'the city';
  if (o === 'player') return 'you';
  return FACTION_NAMES[o];
}

function logEvent(s: GameState, h: HoodState, hood: HoodId, kind: HoodEventKind, text: string, lotId?: string): void {
  h.log.push({ y: s.date.y, m: s.date.m, hood, kind, text, lotId });
  if (h.log.length > 160) h.log.splice(0, h.log.length - 160);
}

function pushHistory(s: GameState, l: Lot, how: 'bought' | 'sold' | 'built' | 'seized' | 'inherited', by?: string, price?: number): void {
  const hist = (l.history ??= []);
  hist.push({ year: s.date.y, week: s.week, owner: l.owner, by, price, how });
  if (hist.length > 24) hist.splice(1, hist.length - 24);
}

function isMine(l: Lot): boolean {
  return l.status === 'owned' || l.status === 'leased';
}

function drawnHood(l: Lot): HoodId | undefined {
  return hoodOfZone(l.zone);
}

function influence(s: GameState, hood: HoodId): Partial<Record<FactionId, number>> {
  const d = HOODS_BY_ID[hood].district;
  return (d ? s.districts.find((x) => x.id === d)?.influence : undefined) ?? {};
}

/** Notice what other systems changed since last month (sales, rival buys, builds, fires) and write it down. */
function noticeChanges(s: GameState, h: HoodState): void {
  for (const l of s.econ?.lots ?? []) {
    const hood = drawnHood(l);
    const now = sig(l);
    const was = h.seen[l.id];
    h.seen[l.id] = now;
    if (!hood || was === undefined || was === now) continue;
    const [st, ow, , use, stage] = was.split('|');
    const name = l.name ?? (l.use ? USES_BY_ID[l.use]?.name : undefined) ?? `the lot at ${l.address}`;
    if (ow !== l.owner || (st !== l.status && (isMine(l) || l.status === 'rival' || st === 'rival'))) {
      const last = l.history?.[l.history.length - 1];
      if (!last || last.owner !== l.owner) pushHistory(s, l, isMine(l) ? 'bought' : l.status === 'sale' ? 'sold' : 'bought', l.owner === 'private' ? l.tenant : undefined);
      logEvent(s, h, hood, l.status === 'rival' ? 'rival' : 'owner', `${name}: now held by ${ownerLabel(l.owner, l.tenant)}.`, l.id);
    } else if (stage !== (l.stage ?? '') && l.stage === 'open' && use) {
      logEvent(s, h, hood, 'open', `${name} opened.`, l.id);
    } else if (stage !== (l.stage ?? '') && l.stage === 'permits') {
      logEvent(s, h, hood, 'build', `Ground broken: ${l.use ? USES_BY_ID[l.use]?.name.toLowerCase() : 'a building'} at ${l.address}${l.developer ? ` (${l.developer})` : ''}.`, l.id);
    } else if (use && !l.use && l.past?.length) {
      // Burned or torn down: the old name goes with it.
      logEvent(s, h, hood, 'fire', `${l.name ?? USES_BY_ID[use]?.name ?? 'A building'} at ${l.address} is gone (${l.past[l.past.length - 1].why}).`, l.id);
      l.name = undefined;
      delete h.styles[l.id];
      h.seen[l.id] = sig(l);
    }
  }
}

function targetPolicy(s: GameState, hood: HoodId, st: { econ: number; police: number; rep: number }): PolicyId {
  const y = s.date.y;
  if (y >= 1974 && (hood === 'boardwalk' || hood === 'pacific')) return 'casino';
  if (st.police >= 62) return 'bluelaws';
  if (y >= 1968 && st.econ < 0.92) return 'renewal';
  if (st.rep < 38) return 'cleanup';
  if (y >= 1962 && (hood === 'crest' || hood === 'boardwalk') && st.econ >= 1) return 'neon';
  return 'tourism';
}

/** One month on the island (called from the weekly tick when the month turns). */
export function hoodMonth(ctx: Ctx): void {
  const s = ctx.s;
  const h = ensureHood(s);
  if (!h) return;
  const e = s.econ!;
  const year = s.date.y;
  const era = eraEcon(year);
  const lots = e.lots.filter((l) => drawnHood(l));
  // Neighborhood conditions drift toward what the records say.
  for (const id of HOOD_IDS) {
    const st = h.stats[id];
    const mine = lots.filter((l) => drawnHood(l) === id);
    const open = mine.filter((l) => l.stage === 'open' && l.use);
    const cond = open.length ? open.reduce((a, l) => a + l.condition, 0) / open.length : 60;
    const vice = open.filter((l) => USES_BY_ID[l.use!]?.cat === 'music').length;
    const infl = influence(s, id);
    const law = infl.law ?? 0;
    const playerShare = (infl.player ?? 0) / 100;
    const rivalTop = Math.max(0, ...(['manno', 'feldstein', 'kessler', 'philly'] as const).map((r) => infl[r] ?? 0));
    const policeT = Math.min(95, 12 + s.heat.local * playerShare * 0.6 + s.heat.federal * 0.15 + law * 0.5 + vice * 3 + rivalTop * 0.12);
    st.police = Math.round(st.police + (policeT - st.police) * 0.2 + (rand(h) - 0.5) * 3);
    const repT = Math.max(5, Math.min(98, cond * 0.7 + st.infra * 0.25 - st.police * 0.25 - vice * 2 + (era - 1) * 40 + 12));
    st.rep = Math.round(st.rep + (repT - st.rep) * 0.1);
    st.infra = Math.max(10, Math.min(98, Math.round((st.infra - 0.25 + (era > 1 ? 0.35 : 0) + (st.policy === 'renewal' ? 0.5 : 0) + (st.policy === 'tourism' ? 0.2 : 0)) * 100) / 100));
    const econT = era * (0.9 + st.rep / 500) * (1 - Math.max(0, st.police - 40) / 400) * (st.policy === 'casino' ? 0.94 : 1);
    st.econ = Math.round((st.econ + (econT - st.econ) * 0.15 + (rand(h) - 0.5) * 0.02) * 1000) / 1000;
    if (s.date.m === 1) st.pop = Math.max(50, Math.round(st.pop * (1 + (st.econ - 0.97) * 0.05)));
    const pol = targetPolicy(s, id, st);
    if (pol !== st.policy && chance(h, 0.25)) {
      st.policy = pol;
      logEvent(s, h, id, 'policy', `${HOODS_BY_ID[id].name}: ${POLICIES[pol].name.toLowerCase()} — ${POLICIES[pol].blurb}`);
    }
  }
  // Owners, buyers, closings, openings, fix-ups.
  const rivals = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  for (const l of lots) {
    if (isMine(l) || l.status === 'public') continue;
    const hood = drawnHood(l)!;
    const st = h.stats[hood];
    const u = l.use ? USES_BY_ID[l.use] : undefined;
    const open = !!u && l.stage === 'open';
    const name = l.name ?? (u ? u.name : 'the lot');
    if (open && l.status === 'private' && l.tenant) {
      // Closing in bad times, or a tired building nobody wants.
      const pClose = 0.0045 * Math.max(0.3, (1.12 - st.econ) * 5) * (l.condition < 45 ? 2 : 1);
      if (chance(h, pClose)) {
        logEvent(s, h, hood, 'close', `${name} closed its doors (${who(l.tenant)}).`, l.id);
        (l.past ??= []).push({ use: l.use!, from: l.builtYear ?? 1950, to: year, why: 'closed' });
        l.past = l.past.slice(-6);
        l.tenant = undefined;
        l.name = undefined;
        l.status = 'sale';
        l.owner = 'private';
        l.price = marketValue(s, l);
        pushHistory(s, l, 'sold');
        h.counts.closures++;
        continue;
      }
      // An owner sells to another owner.
      if (chance(h, 0.003)) {
        const buyer = pick(h, OWNERS.filter((o) => o !== who(l.tenant)));
        logEvent(s, h, hood, 'owner', `${who(l.tenant)} sold ${name} to ${buyer}.`, l.id);
        l.tenant = buyer;
        pushHistory(s, l, 'sold', buyer, marketValue(s, l));
        h.counts.sales++;
        continue;
      }
      // A family buys out an independent where it is strong.
      const infl = influence(s, hood);
      const strong = rivals.filter((r) => (infl[r.id] ?? 0) >= 15 && r.money > 3000);
      const r = strong.length ? pick(h, strong) : undefined;
      if (r && chance(h, 0.003 * ((infl[r.id] ?? 0) / 30))) {
        logEvent(s, h, hood, 'rival', `${FACTION_NAMES[r.id]} bought out ${who(l.tenant)}: ${name} is theirs now.`, l.id);
        l.status = 'rival';
        l.owner = r.id as RivalId;
        l.tenant = `${FACTION_NAMES[r.id]}'s people`;
        pushHistory(s, l, 'bought', FACTION_NAMES[r.id], marketValue(s, l));
        h.counts.rivalBuys++;
        continue;
      }
    }
    if (l.status === 'rival') {
      const r = s.rivals.find((x) => x.id === l.owner);
      const weak = !r || !s.characters[r.leaderId]?.alive || (influence(s, hood)[l.owner as FactionId] ?? 0) < 5;
      if (chance(h, weak ? 0.03 : 0.002)) {
        const buyer = pick(h, OWNERS);
        logEvent(s, h, hood, 'owner', `${ownerLabel(l.owner)} let go of ${name}; ${buyer} has it now.`, l.id);
        l.status = 'private';
        l.owner = 'private';
        l.tenant = buyer;
        pushHistory(s, l, 'sold', buyer, marketValue(s, l));
        h.counts.sales++;
        continue;
      }
    }
    // A closed building gets a new business.
    if (open && l.status === 'sale' && !l.tenant && chance(h, 0.035 * st.econ * (st.policy === 'renewal' ? 1.3 : 1))) {
      const same = useIcon(u!);
      const z = ZONES_BY_ID[l.zone];
      const pool = USES.filter((x) => !x.npcOnly && !x.biz && (x.minYear ?? 0) <= year && useIcon(x) === same && (x.zones ? x.zones.includes(l.zone) : z.cats.includes(x.cat)));
      const nu = pool.length ? pick(h, pool) : u!;
      const who = pick(h, OWNERS);
      l.use = nu.id;
      l.name = placeName(h, year, nu.id);
      l.tenant = who;
      l.status = 'private';
      l.owner = 'private';
      l.condition = Math.max(l.condition, 70);
      l.renovated = year;
      h.styles[l.id] = { style: decadeStyle(h, year, l.zone), sign: pick(h, SIGNS), since: year };
      pushHistory(s, l, 'bought', who, l.price);
      logEvent(s, h, hood, 'open', `${l.name} opened at ${l.address} (${who}).`, l.id);
      h.counts.openings++;
      continue;
    }
    // Fix-ups, in the style of the day.
    if (open && l.condition < 55 && chance(h, 0.007 * st.econ)) {
      l.condition = 100;
      l.renovated = year;
      const look = { style: decadeStyle(h, year, l.zone), sign: pick(h, SIGNS) };
      const old = lookOf(s, l).style;
      h.styles[l.id] = { ...look, since: year };
      logEvent(s, h, hood, 'reno', `${name} was fixed up${look.style !== old ? ` — ${STYLES[old].name} out, ${STYLES[look.style].name} in` : ''}.`, l.id);
      h.counts.renos++;
    }
  }
  for (const l of lots) h.seen[l.id] = sig(l);
  // A snapshot each January (and the first time).
  if (!h.snaps.length || (s.date.m === 1 && h.snaps[h.snaps.length - 1].y < year)) h.snaps.push({ y: year, by: snapshot(s) });
  if (h.snaps.length > 60) h.snaps.splice(1, 1);
}

/** Weekly hook: the month turns → one month of the neighborhoods. */
export function hoodWeek(ctx: Ctx): void {
  const s = ctx.s;
  const h = ensureHood(s);
  if (!h) return;
  const mk = monthKey(s);
  // The town as it stood when the layer first looked (the "then" of then-and-now).
  if (!h.snaps.length) h.snaps.push({ y: s.date.y, by: snapshot(s) });
  // Ownership changes made by any system this week go into the deeds and the log.
  noticeChanges(s, h);
  if (h.lastMonth !== mk) {
    h.lastMonth = mk;
    hoodMonth(ctx);
  }
}

/* ---------------- views (pure) ---------------- */

/** Jobs a place makes, by what it is (summer staff count half). */
export function jobsOf(l: Lot): number {
  const u = l.use ? USES_BY_ID[l.use] : undefined;
  if (!u || l.stage !== 'open') return 0;
  const icon = useIcon(u);
  const base = { hotel: 45, motel: 8, house: 0, apartment: 2, store: 4, pizza: 6, club: 14, pier: 10, warehouse: 9, public: 20 }[icon];
  return Math.round(base * (u.seasonal ? 0.75 : 1));
}

export function lotsOf(s: GameState, hood: HoodId): Lot[] {
  const zs = HOODS_BY_ID[hood].zones;
  return (s.econ?.lots ?? []).filter((l) => zs.includes(l.zone));
}

function snapRow(s: GameState, hood: HoodId): HoodSnapRow {
  const ls = lotsOf(s, hood);
  const st = s.hood?.stats[hood];
  const owners: Record<string, number> = {};
  for (const l of ls) {
    const k = isMine(l) ? 'player' : l.owner;
    owners[k] = (owners[k] ?? 0) + 1;
  }
  return {
    buildings: ls.filter((l) => l.use && l.stage === 'open').length,
    businesses: ls.filter((l) => l.stage === 'open' && l.use && (l.tenant || l.bizId || l.operating)).length,
    vacant: ls.filter((l) => !l.use).length,
    forSale: ls.filter((l) => l.status === 'sale' || l.status === 'lease').length,
    value: ls.reduce((a, l) => a + marketValue(s, l), 0),
    owners,
    econ: st?.econ ?? 1,
    rep: st?.rep ?? 50,
    police: st?.police ?? 20,
  };
}

export function snapshot(s: GameState): Record<HoodId, HoodSnapRow> {
  const out = {} as Record<HoodId, HoodSnapRow>;
  for (const id of HOOD_IDS) out[id] = snapRow(s, id);
  return out;
}

export interface HoodView {
  id: HoodId;
  name: string;
  blurb: string;
  residents: number;
  households: number;
  summer: number;
  businesses: { cat: UseCat; n: number }[];
  businessCount: number;
  independents: number;
  jobs: number;
  realEstate: { buildings: number; vacant: number; forSale: number; forLease: number; avgPrice: number; value: number };
  demand: number;
  econ: number;
  rep: number;
  police: number;
  investigations: number;
  infra: number;
  policy: { id: PolicyId; name: string; blurb: string };
  organizations: { id: string; name: string; influence: number; lots: number }[];
  construction: { lotId: string; what: string; by: string; stage: string }[];
  history: HoodEvent[];
  then?: { y: number; row: HoodSnapRow };
  now: HoodSnapRow;
}

/** Everything the neighborhood dashboard shows, computed from the records. */
export function hoodView(s: GameState, id: HoodId): HoodView {
  const info = HOODS_BY_ID[id];
  const st = s.hood?.stats[id] ?? { econ: 1, rep: 50, police: 20, infra: 50, pop: info.pop, policy: 'tourism' as PolicyId };
  const ls = lotsOf(s, id);
  const open = ls.filter((l) => l.use && l.stage === 'open');
  const cats = new Map<UseCat, number>();
  for (const l of open) {
    const c = USES_BY_ID[l.use!]?.cat;
    if (c && (l.tenant || l.bizId || l.operating || l.status === 'rival')) cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  const infl = influence(s, id);
  const orgs = new Map<string, { id: string; name: string; influence: number; lots: number }>();
  for (const [f, v] of Object.entries(infl) as [FactionId, number][]) if (f !== 'none' && v > 0) orgs.set(f, { id: f, name: f === 'player' ? `House of ${s.houseName}` : FACTION_NAMES[f], influence: v, lots: 0 });
  for (const l of ls) {
    const k = isMine(l) ? 'player' : l.owner;
    if (k === 'private' || k === 'city') continue;
    const o = orgs.get(k) ?? { id: k, name: k === 'player' ? `House of ${s.houseName}` : FACTION_NAMES[k as FactionId] ?? k, influence: 0, lots: 0 };
    o.lots++;
    orgs.set(k, o);
  }
  const zone = info.zones[0];
  const seasonal = isInSeason(s.date) ? ZONES_BY_ID[zone].season[0] : ZONES_BY_ID[zone].season[1];
  const sale = ls.filter((l) => l.status === 'sale');
  const snaps = s.hood?.snaps ?? [];
  const first = snaps.find((x) => x.y < s.date.y) ?? undefined;
  return {
    id, name: info.name, blurb: info.blurb,
    residents: st.pop,
    households: Math.round(st.pop / 3.1),
    summer: Math.round(st.pop * (1 + ZONES_BY_ID[zone].season[0] * 3) + open.filter((l) => /motel|hotel|rooming|boarding|cottage/.test(l.use!)).length * 90),
    businesses: [...cats.entries()].map(([cat, n]) => ({ cat, n })).sort((a, b) => b.n - a.n),
    businessCount: [...cats.values()].reduce((a, b) => a + b, 0),
    independents: open.filter((l) => l.status === 'private' && l.tenant).length,
    jobs: open.reduce((a, l) => a + jobsOf(l), 0),
    realEstate: {
      buildings: open.length, vacant: ls.filter((l) => !l.use).length, forSale: sale.length, forLease: ls.filter((l) => l.status === 'lease').length,
      avgPrice: sale.length ? Math.round(sale.reduce((a, l) => a + l.price, 0) / sale.length) : 0,
      value: ls.reduce((a, l) => a + marketValue(s, l), 0),
    },
    demand: Math.round(st.econ * seasonal * 100),
    econ: st.econ,
    rep: st.rep,
    police: st.police,
    investigations: Math.max(0, Math.round((st.police - 20) / 18)),
    infra: Math.round(st.infra),
    policy: { id: st.policy, ...POLICIES[st.policy] },
    organizations: [...orgs.values()].sort((a, b) => b.influence + b.lots * 5 - (a.influence + a.lots * 5)),
    construction: ls.filter((l) => l.use && l.stage && l.stage !== 'open' && l.stage !== 'purchase').map((l) => ({ lotId: l.id, what: USES_BY_ID[l.use!]?.name ?? 'Building', by: l.developer ?? ownerLabel(l.owner), stage: l.stage! })),
    history: (s.hood?.log ?? []).filter((x) => x.hood === id).slice(-30).reverse(),
    then: first ? { y: first.y, row: first.by[id] } : undefined,
    now: snapRow(s, id),
  };
}

/** The whole island then and now (for the ten-year comparison). */
export function islandChange(s: GameState): { from: number; to: number; rows: { id: HoodId; name: string; then: HoodSnapRow; now: HoodSnapRow }[] } | undefined {
  const snaps = s.hood?.snaps ?? [];
  if (!snaps.length) return undefined;
  const first = snaps[0];
  const now = snapshot(s);
  return { from: first.y, to: s.date.y, rows: HOODS.map((h) => ({ id: h.id, name: h.name, then: first.by[h.id], now: now[h.id] })) };
}

/* ---------------- overlays ---------------- */

export type HoodOverlay = 'none' | 'owner' | 'category' | 'rival' | 'available' | 'construction' | 'economy' | 'reputation' | 'police';

/** The value a lot shows under an overlay (0..1), for the map's tint. */
export function lotOverlay(s: GameState, l: Lot, o: HoodOverlay): number {
  const hood = drawnHood(l);
  const st = hood ? s.hood?.stats[hood] : undefined;
  switch (o) {
    case 'available': return l.status === 'sale' || l.status === 'lease' ? 1 : 0;
    case 'construction': return l.use && l.stage && l.stage !== 'open' && l.stage !== 'purchase' ? 1 : 0;
    case 'economy': {
      const u = l.use ? USES_BY_ID[l.use] : undefined;
      if (!u || l.stage !== 'open' || !(l.tenant || l.bizId || l.operating || l.status === 'rival')) return 0;
      return Math.max(0, Math.min(1, ((u.rev - u.exp) / 300) * (st?.econ ?? 1) * (0.6 + 0.4 * l.condition / 100)));
    }
    case 'reputation': return (st?.rep ?? 50) / 100;
    case 'police': return (st?.police ?? 20) / 100;
    case 'rival': return l.status === 'rival' ? 1 : hood ? Math.max(0, ...(['manno', 'feldstein', 'kessler', 'philly'] as const).map((r) => influence(s, hood)[r] ?? 0)) / 100 * 0.6 : 0;
    default: return 0;
  }
}

/* ---------------- orders ---------------- */

export type HoodAction = { type: 'restyle'; lotId: string; style: BuildStyle; sign: SignColor };

const noop = (title: string, why: string): ActionPreview => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' });

export function restyleCost(s: GameState, l: Lot, style: BuildStyle): number {
  const u = l.use ? USES_BY_ID[l.use] : undefined;
  if (!u) return 0;
  return Math.round(u.cost * 0.12 * (1 + STYLES[style].cost) * ZONES_BY_ID[l.zone].land * inflation(s) / 50) * 50;
}

export function previewHood(s: GameState, a: HoodAction): ActionPreview {
  const l = s.econ?.lots.find((x) => x.id === a.lotId);
  if (!l) return noop('Restyle', 'No such place');
  const cost = restyleCost(s, l, a.style);
  const look = lookOf(s, l);
  const title = `Restyle ${l.name ?? lotName(l)}: ${STYLES[a.style].name}, ${a.sign} neon`;
  const st = STYLES[a.style];
  const why = !isMine(l) ? 'Not yours' : l.stage !== 'open' || !l.use ? 'Not built yet' : look.style === a.style && look.sign === a.sign ? 'It already looks like that' : st.from && s.date.y < st.from ? `Nobody builds like that before ${st.from}` : s.money < cost ? `Needs $${cost.toLocaleString('en-US')}` : undefined;
  return {
    title,
    detail: `New front, new sign. ${st.blurb} Draw ${st.draw >= 0 ? '+' : ''}${Math.round(st.draw * 100)}%, upkeep +${Math.round(st.upkeep * 100)}%.`,
    effects: [{ type: 'money', amount: -cost, label: title }, { type: 'econ', op: { op: 'note', text: `${st.name}, ${a.sign} neon (${SIGN_HEX[a.sign]})` } }],
    cost, because: `gave ${l.name ?? lotName(l)} a new look (${st.name})`, disabledReason: why, category: 'business',
  };
}

export function commitHood(ctx: Ctx, a: HoodAction): void {
  const s = ctx.s;
  const l = s.econ?.lots.find((x) => x.id === a.lotId);
  if (!l) return;
  const d = designMut(s, l.bizId ?? `lot:${l.id}`);
  d.style = a.style;
  d.sign = a.sign;
  // A place run through the Empire Designer: its building is the record of its look.
  const v = venueForLot(s, l.id);
  const b = v && s.empire ? venueBuilding(s.empire, v) : undefined;
  if (b) { b.style = a.style; b.sign = a.sign; }
  const h = ensureHood(s);
  const hood = drawnHood(l);
  if (h && hood) {
    h.counts.restyles++;
    logEvent(s, h, hood, 'style', `You gave ${l.name ?? lotName(l)} a new look: ${STYLES[a.style].name}, ${a.sign} neon.`, l.id);
  }
}

/** Restyle orders for the places you own (the sim's random player uses these). */
export function hoodActions(s: GameState): { kind: 'hood'; op: HoodAction }[] {
  const out: { kind: 'hood'; op: HoodAction }[] = [];
  const hh = { rng: hashSeed(`${s.seed}:${s.week}:restyle`) };
  for (const l of s.econ?.lots ?? []) {
    if (!isMine(l) || l.stage !== 'open' || !l.use) continue;
    const st = (Object.keys(STYLES) as BuildStyle[]).filter((x) => !STYLES[x].from || STYLES[x].from! <= s.date.y);
    out.push({ kind: 'hood', op: { type: 'restyle', lotId: l.id, style: pick(hh, st), sign: pick(hh, SIGNS) } });
  }
  return out.slice(0, 4);
}

