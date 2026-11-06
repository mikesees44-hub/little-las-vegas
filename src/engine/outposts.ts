import type { ActionPreview } from './actions';
import { displayName, hasTrait, isFree, player } from './characters';
import { chooseHeir } from './dynasty';
import { applyEffects } from './effects';
import { addTie, alive, famEvent, famName, setView, stanceTo, stanceWord, tieBetween, type FamAction, type FamOp } from './familyWeb';
import { FAMILY_BY_ID, TIE_SIGN, type FamKey } from './familyWebData';
import { addStory } from './hierarchy';
import type { Reason } from './interactions';
import { journal } from './journal';
import { heat, money, type Ctx } from './ledger';
import { matronOf } from './matchmakers';
import { opinion } from './relations';
import { hashSeed, rand } from './rng';
import { ensureTravel, isAway } from './travelState';
import type { Character, Effect, EventInstance, GameState } from './types';
import { endWar } from './war';
import { lyingLow, postOf, type LieLow, type Outpost, type OutpostState, type PostCity, type SpotKind } from './outpostsState';

export { lyingLow, postOf };
export type { LieLow, Outpost, PostCity, SpotKind };

/**
 * OUTPOSTS AND SAFE PASSAGE.
 *
 * "Send a man to start something": the boss picks one of his men (and up to
 * two more), seed money and a spot (a casino point, a lounge, junkets, a
 * sports book, a loan desk) in another city: Las Vegas first, Miami Beach,
 * Chicago, New Orleans. The host family lets him set up or not (odds). He
 * runs it and sends money home every week through the ledger. His loyalty
 * starts high and drifts with the distance, the time, his own success, his
 * ambition and his traits; he starts things of his own (keeps more), and may
 * break away (stops sending, his own crew) or be poached by the host family,
 * each with visible warning signs and odds. The boss keeps him close: a
 * visit, letters, a bigger share, his wife brought out, a marriage tie, or
 * calling him home.
 *
 * Safe passage: when losing a war, under police or federal pressure, or
 * needing to get out, the boss sends himself, his heir or one of his men to
 * an outpost or a friendly family's city to lie low for some weeks. The odds
 * are shown before going (the outpost man's loyalty, the host's stance and
 * ties, who is hunting, the feds' reach, how long). He may be safe the whole
 * time; he may be found (a danger, the boss decides); the host may sell him
 * out (for the boss himself a game event with odds; for one of the boss's
 * men a warning and an escape chance, and the boss decides: no man of his is
 * killed or handed over). While away, the boss-away mechanics run (the
 * acting boss), heat and the case cool somewhat, and a war may pause or not.
 *
 * All results land in Your File. Its dice are its own (`outposts.rng`).
 */

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface CityInfo { name: string; host: FamKey; miles: number; fare: number; spots: SpotKind[]; blurb: string }
export const POST_CITIES: Record<PostCity, CityInfo> = {
  vegas: { name: 'Las Vegas', host: 'vegas', miles: 2300, fare: 900, spots: ['point', 'lounge', 'junket', 'book', 'loan'], blurb: 'an open city: everybody holds a point, nobody holds the town' },
  miami: { name: 'Miami Beach', host: 'biscayne', miles: 1000, fare: 500, spots: ['lounge', 'junket', 'book', 'loan'], blurb: 'the hotels on Collins Avenue, the winter money and the exiles' },
  chicago: { name: 'Chicago', host: 'chicago', miles: 750, fare: 400, spots: ['lounge', 'book', 'loan'], blurb: 'the Outfit\'s town: it lets a man in, and it watches him' },
  neworleans: { name: 'New Orleans', host: 'nola', miles: 1100, fare: 500, spots: ['lounge', 'book', 'loan'], blurb: 'the oldest family\'s port: it asks, it does not take orders' },
};
export const POST_CITY_IDS = Object.keys(POST_CITIES) as PostCity[];

export interface SpotInfo { name: string; short: string; min: number; rate: number; vol: number; attr: keyof Character['attributes']; text: string }
export const SPOTS: Record<SpotKind, SpotInfo> = {
  point: { name: 'a casino point', short: 'casino point', min: 10000, rate: 0.03, vol: 0.1, attr: 'business', text: 'a piece of a casino floor: steady money out of the count' },
  lounge: { name: 'a lounge', short: 'lounge', min: 5000, rate: 0.04, vol: 0.2, attr: 'diplomacy', text: 'a lounge with a band and a back room' },
  junket: { name: 'junkets', short: 'junkets', min: 4000, rate: 0.045, vol: 0.35, attr: 'diplomacy', text: 'high rollers flown in, a piece of what they lose' },
  book: { name: 'a sports book', short: 'sports book', min: 6000, rate: 0.045, vol: 0.4, attr: 'business', text: 'the ball games and the fights; good weeks and bad' },
  loan: { name: 'a loan desk', short: 'loan desk', min: 6000, rate: 0.035, vol: 0.1, attr: 'force', text: 'money to losers at the tables, at a point a week' },
};
export const SPOT_IDS = Object.keys(SPOTS) as SpotKind[];
/** The seed choices for a spot (the least, a bigger stake, a big one). */
export const seedsFor = (k: SpotKind): number[] => [SPOTS[k].min, Math.round(SPOTS[k].min * 1.6), SPOTS[k].min * 2.5];

export const BASE_SHARE = 0.3;
const HIST = 8;

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

export function ensureOutposts(s: GameState): OutpostState {
  if (!s.posts) s.posts = { rng: hashSeed(`${s.seed}:outposts`), next: 1, list: [], lie: [] };
  return s.posts;
}

export const outpostsOf = (s: GameState): Outpost[] => s.posts?.list ?? [];
export const livePosts = (s: GameState): Outpost[] => outpostsOf(s).filter((o) => o.status === 'run');

export function postName(s: GameState, o: Outpost): string {
  const c = s.characters[o.manId];
  return `${c ? `${c.firstName} ${c.lastName}` : 'your man'}'s ${SPOTS[o.spot].short} in ${POST_CITIES[o.city].name}`;
}

/** Men the boss could send (soldiers, associates, capos with no district; free, home, not already out). */
export function sendableMen(s: GameState): Character[] {
  return Object.values(s.characters)
    .filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && (c.rank === 'soldier' || c.rank === 'associate' || (c.rank === 'capo' && !s.districts.some((d) => d.capoId === c.id)))
      && isFree(s, c) && (c.busyUntil ?? 0) <= s.week && !isAway(s, c.id) && !c.specialty)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Where he starts: his opinion of the boss and his nature. */
export function startLoyalty(s: GameState, c: Character): number {
  return Math.round(clamp(66 + opinion(s, c.id, s.playerId) * 0.25 + (hasTrait(c, 'Loyal-to-a-fault') ? 12 : 0) - (hasTrait(c, 'Ambitious') ? 6 : 0) - (hasTrait(c, 'Greedy') ? 4 : 0), 50, 95));
}

/** What he is like at the spot (his skill for it, and his men). */
export function skillOf(s: GameState, o: Pick<Outpost, 'manId' | 'crew' | 'spot'>): number {
  const c = s.characters[o.manId];
  const a = c ? c.attributes[SPOTS[o.spot].attr] : 40;
  return 0.7 + a / 160 + o.crew.filter((id) => s.characters[id]?.alive).length * 0.12;
}

function citySeason(s: GameState, city: PostCity): number {
  const m = s.date.m;
  if (city === 'miami') return m >= 12 || m <= 3 ? 1.3 : m >= 6 && m <= 9 ? 0.7 : 1;
  if (city === 'vegas') return m === 7 || m === 8 ? 0.85 : 1.05;
  return 1;
}

/** What it takes in a week, in a usual week (before his share and his own things). */
export function expectedGross(s: GameState, o: Pick<Outpost, 'manId' | 'crew' | 'spot' | 'seed' | 'city' | 'since'>): number {
  const ramp = clamp((s.week - o.since + 1) / 5, 0.4, 1);
  return Math.round(o.seed * SPOTS[o.spot].rate * skillOf(s, o) * citySeason(s, o.city) * ramp);
}

/** How much of the money he keeps out there (his share and his own things). */
export function keepFrac(o: Pick<Outpost, 'share' | 'side' | 'loyal'>): number {
  const sideFrac = clamp(o.side * 0.06 + Math.max(0, 55 - o.loyal) / 100 * 0.5, 0, 0.6);
  return 1 - (1 - o.share) * (1 - sideFrac);
}

/** His loyalty's weekly drift, every part of it. */
export function driftOf(s: GameState, o: Outpost): { total: number; parts: Reason[] } {
  const c = s.characters[o.manId];
  const ci = POST_CITIES[o.city];
  const w = s.week;
  const age = w - o.since;
  const parts: Reason[] = [];
  const dist = (ci.miles / 2500) * 0.6 * (o.wife ? 0.4 : 1);
  parts.push({ label: `${ci.miles.toLocaleString('en-US')} miles from home${o.wife ? ' (his wife is with him)' : ''}`, value: -dist });
  if (age > 40) parts.push({ label: 'Most of a year out there', value: -0.35 });
  else if (age > 12) parts.push({ label: 'Months out there', value: -0.2 });
  const exp = o.seed * SPOTS[o.spot].rate;
  if (age > 6 && expectedGross(s, o) > exp * 1.05) parts.push({ label: 'It is going well, and he knows whose doing that is', value: -0.25 });
  if (c) {
    if (hasTrait(c, 'Ambitious')) parts.push({ label: 'Ambitious', value: -0.35 });
    if (hasTrait(c, 'Greedy')) parts.push({ label: 'Greedy', value: -0.25 });
    if (hasTrait(c, 'Loyal-to-a-fault')) parts.push({ label: 'Loyal to a fault', value: 0.35 });
    if (hasTrait(c, 'Patient')) parts.push({ label: 'Patient', value: 0.1 });
    if (hasTrait(c, 'Honest')) parts.push({ label: 'Honest', value: 0.15 });
    if (c.goal === 'take_chair' || c.goal === 'become_capo') parts.push({ label: c.goal === 'take_chair' ? 'Wants a chair of his own' : 'Wants to be a capo', value: -0.15 });
  }
  if (o.visit !== undefined && w - o.visit <= 8) parts.push({ label: 'You came to see him', value: 0.5 });
  if (o.letter !== undefined && w - o.letter <= 4) parts.push({ label: 'Your letters', value: 0.2 });
  if (o.share > BASE_SHARE) parts.push({ label: `A bigger share (${pct(o.share)})`, value: (o.share - BASE_SHARE) * 3 });
  if (o.wed !== undefined) parts.push({ label: 'Family now, by marriage', value: 0.3 });
  const host = stanceTo(s, ci.host).value;
  if (host < 0) parts.push({ label: `${famName(s, ci.host)} whisper to him (${stanceWord(host)})`, value: -0.2 });
  const total = Math.round(parts.reduce((a, p) => a + p.value, 0) * 100) / 100;
  return { total, parts: parts.map((p) => ({ ...p, value: Math.round(p.value * 100) / 100 })) };
}

/** The odds, per week, that he breaks away (stops sending, his own crew). */
export function breakOdds(s: GameState, o: Outpost): number {
  if (o.status !== 'run' || o.loyal >= 40) return 0;
  const c = s.characters[o.manId];
  const amb = c ? (hasTrait(c, 'Ambitious') ? 1.4 : 1) * (hasTrait(c, 'Loyal-to-a-fault') ? 0.4 : 1) : 1;
  return clamp(((40 - o.loyal) / 40) * 0.1 * amb * (o.wed !== undefined ? 0.5 : 1) * (o.wife ? 1.2 : 1), 0, 0.25);
}

/** The odds, per week, that the host family takes him (poached). */
export function poachOdds(s: GameState, o: Outpost): number {
  if (o.status !== 'run' || o.loyal >= 50) return 0;
  const host = POST_CITIES[o.city].host;
  if (!alive(s, host)) return 0;
  const sv = stanceTo(s, host).value;
  const tied = tieBetween(s, host, 'player').some((t) => TIE_SIGN[t.kind] > 0);
  return clamp(((50 - o.loyal) / 50) * 0.06 * (sv < 0 ? 1.5 : 1) * (tied ? 0.6 : 1) * (o.wed !== undefined ? 0.5 : 1), 0, 0.15);
}

/** Over the next four weeks, if nothing changes. */
export const monthOdds = (p: number) => 1 - (1 - p) ** 4;

/** The loyalty trend over the last weeks (+ rising, − falling). */
export function trendOf(o: Outpost): number {
  if (o.hist.length < 2) return 0;
  return Math.round((o.hist[o.hist.length - 1] - o.hist[0]) * 10) / 10;
}

/** The warning signs, as the boss would hear them. */
export function warningsOf(s: GameState, o: Outpost): string[] {
  const out: string[] = [];
  const c = s.characters[o.manId];
  const nm = c?.firstName ?? 'He';
  const avg = o.sends.length >= 4 ? o.sends.slice(0, -1).reduce((a, x) => a + x, 0) / (o.sends.length - 1) : 0;
  const last = o.sends[o.sends.length - 1] ?? 0;
  if (avg > 0 && last < avg * 0.8) out.push(`${nm} sends less than he used to (${fmt(last)} last week, ${fmt(avg)} before)`);
  if (o.side >= 1) out.push(`${nm} started ${o.side === 1 ? 'something of his own out there' : `${o.side} things of his own out there`}: he keeps more of the money`);
  if (o.loyal < 60 && (o.letter === undefined || s.week - o.letter > 6)) out.push(`${nm} stopped writing`);
  if (o.loyal < 50) out.push(`${nm} was seen dining with ${famName(s, POST_CITIES[o.city].host)}'s men`);
  if (o.loyal < 40) out.push(`${nm} talks about "my place" and "my people" out there`);
  if (o.refused !== undefined) out.push(`${nm} would not come home when you called him (week ${o.refused})`);
  if (o.wife !== undefined && s.week - o.wife > 20) out.push(`${nm} bought a house out there`);
  if (trendOf(o) <= -3) out.push(`His loyalty is falling (${trendOf(o)} in ${o.hist.length} weeks)`);
  return out;
}

function addHist(o: Outpost, v: number): void {
  o.hist.push(Math.round(v));
  if (o.hist.length > HIST) o.hist.shift();
}

/* ------------------------------------------------------------------ */
/* The orders: send a man; keep him close                               */
/* ------------------------------------------------------------------ */

export type PostStep = Extract<FamAction, { op: 'post' }>['step'];
export type PostAction = Extract<FamAction, { op: 'post' }>;
export type LieAction = Extract<FamAction, { op: 'lie' }>;
const base = { effects: [] as Effect[], cost: 0, category: 'cost' as const };
const pop = (o: Extract<FamOp, { op: 'post' }>): Effect => ({ type: 'fam', op: o });

/** The odds the host family lets him set up (its stance, its ties to you, his skill, your respect). */
export function startOdds(s: GameState, city: PostCity, spot: SpotKind, manId: string): { chance: number; reasons: Reason[] } {
  const host = POST_CITIES[city].host;
  const sv = stanceTo(s, host).value;
  const c = s.characters[manId];
  const tied = tieBetween(s, host, 'player').filter((t) => TIE_SIGN[t.kind] > 0).length;
  const reasons: Reason[] = [
    { label: city === 'vegas' ? 'Base: an open city' : 'Base', value: city === 'vegas' ? 55 : 40 },
    { label: `${famName(s, host)}'s stance (${stanceWord(sv)})`, value: Math.round(sv * 0.4) },
    ...(tied ? [{ label: 'Ties between your houses', value: 8 * Math.min(2, tied) }] : []),
    { label: 'Your respect', value: Math.round((s.respect - 50) * 0.2) },
    ...(c ? [{ label: `${c.firstName}'s ${SPOTS[spot].attr} (${c.attributes[SPOTS[spot].attr]})`, value: Math.round((c.attributes[SPOTS[spot].attr] - 50) * 0.15) }] : []),
    ...(spot === 'point' ? [{ label: 'A casino point: the holders decide', value: -10 }] : []),
  ].filter((r) => r.value !== 0 || r.label.startsWith('Base'));
  return { chance: clamp(reasons.reduce((a, r) => a + r.value, 0), 10, 90) / 100, reasons };
}

function previewStart(s: GameState, a: PostAction): ActionPreview {
  const city = a.city as PostCity | undefined;
  const spot = a.spot as SpotKind | undefined;
  const c = a.man ? s.characters[a.man] : undefined;
  const ci = city ? POST_CITIES[city] : undefined;
  if (!ci || !spot || !SPOTS[spot] || !c) return { ...base, title: 'Send a man to start something', because: '', disabledReason: 'Pick a city, a spot and a man' };
  const crew = (a.crew ?? []).filter((id) => id !== c.id).slice(0, 2);
  const seed = Math.max(SPOTS[spot].min, a.seed ?? SPOTS[spot].min);
  const cost = seed + ci.fare * (1 + crew.length);
  const host = ci.host;
  const o = startOdds(s, city!, spot, c.id);
  const loyal = startLoyalty(s, c);
  const mock: Outpost = { id: 'x', city: city!, spot, manId: c.id, crew, seed, since: s.week - 6, loyal, hist: [], share: BASE_SHARE, side: 0, sent: 0, kept: 0, sends: [], status: 'run' };
  const gross = expectedGross(s, mock);
  const home = Math.round(gross * (1 - BASE_SHARE));
  const d = driftOf(s, { ...mock, since: s.week });
  const pool = sendableMen(s).map((m) => m.id);
  const bad = [c.id, ...crew].find((id) => !pool.includes(id));
  const why = !ci.spots.includes(spot) ? `No ${SPOTS[spot].short} for an outsider in ${ci.name}`
    : bad ? `${s.characters[bad]?.firstName ?? 'He'} cannot go now (busy, away, holding a district, or not yours)`
    : s.wars.some((w) => w.rival === (host as never)) ? `You are at war with ${famName(s, host)}`
    : !alive(s, host) ? 'Nobody there to deal with'
    : (s.families?.cd[`post:${city}`] ?? 0) > s.week ? `${famName(s, host)} said no lately` : undefined;
  return {
    ...base, title: `Send ${c.firstName} to start ${SPOTS[spot].name} in ${ci.name}`, cost, because: `sent ${displayName(c)} to start ${SPOTS[spot].name} in ${ci.name}`,
    detail: `${displayName(c)}${crew.length ? ` and ${crew.map((id) => s.characters[id]?.firstName).join(' and ')}` : ''} go to ${ci.name} (${ci.blurb}) with ${fmt(seed)} seed money (${fmt(cost - seed)} to get there). ${famName(s, host)} let him set up or not: ${pct(o.chance)}. Once it runs, about ${fmt(gross)} a week; he keeps ${pct(BASE_SHARE)}, about ${fmt(home)} comes home. His loyalty starts at ${loyal} and drifts about ${d.total > 0 ? '+' : ''}${d.total} a week (distance, time, his nature); keep him close with visits, letters, a bigger share, his wife, a marriage. Turned down, the money stays home.`,
    warning: `Far from home, a man starts his own things. Below 40 loyalty he may break away; below 50 ${famName(s, host)} may take him.`,
    effects: [
      { type: 'money', amount: -cost, category: 'cost', label: `Seed money and the trip to ${ci.name}` },
      pop({ op: 'post', do: 'start', plan: { city: city!, spot, man: c.id, crew, seed } }),
    ],
    refuseEffects: [{ type: 'fam', op: { op: 'cd', key: `post:${city}`, weeks: 8 } }, { type: 'fam', op: { op: 'view', fam: host, amount: -1, reason: 'Wanted to set up in our town' } }],
    acceptance: o, oddsLabel: `${famName(s, host)} let him set up`,
    ...(why ? { disabledReason: why } : {}),
  };
}

export function previewPost(s: GameState, a: PostAction): ActionPreview {
  if (a.step === 'start') return previewStart(s, a);
  const o = outpostsOf(s).find((x) => x.id === a.id);
  if (!o) return { ...base, title: 'An outpost', because: '', disabledReason: 'No such outpost' };
  const c = s.characters[o.manId];
  const nm = c?.firstName ?? 'him';
  const ci = POST_CITIES[o.city];
  const host = ci.host;
  const where = postName(s, o);
  const running = o.status === 'run';
  const off = running ? undefined : 'He is not running it for you now';
  switch (a.step as PostStep) {
    case 'visit': {
      const cost = ci.fare * 2;
      return {
        ...base, title: `Go see ${nm} in ${ci.name}`, cost, because: `went to see ${nm} in ${ci.name}`,
        detail: `A few days on the road (${fmt(cost)}). Certain: his loyalty +12, and for two months the drift is gentler (+0.5 a week). You see the place with your own eyes: what he started of his own comes out (one of them is closed).`,
        effects: [{ type: 'money', amount: -cost, category: 'cost', label: `The trip to see ${nm}` }, pop({ op: 'post', do: 'visit', id: o.id })],
        ...(off ? { disabledReason: off } : o.visit !== undefined && s.week - o.visit < 4 ? { disabledReason: `You saw him ${s.week - o.visit} weeks ago` } : {}),
      };
    }
    case 'letter':
      return {
        ...base, title: `Write to ${nm}`, because: `wrote to ${nm}`,
        detail: 'Certain: loyalty +3, and a month of gentler drift (+0.2 a week). A man far away reads a letter from the boss three times.',
        effects: [pop({ op: 'post', do: 'letter', id: o.id })],
        ...(off ? { disabledReason: off } : o.letter !== undefined && s.week - o.letter < 2 ? { disabledReason: 'You wrote last week' } : {}),
      };
    case 'share': {
      const to = Math.round((o.share + 0.1) * 100) / 100;
      return {
        ...base, title: `Give ${nm} a bigger share (${pct(o.share)} → ${pct(to)})`, because: `gave ${nm} a bigger share`,
        detail: `Certain: loyalty +10 now and a steadier man (+${(0.1 * 3 + (o.share - BASE_SHARE) * 3).toFixed(1)} a week while it lasts). Less comes home: about ${fmt(expectedGross(s, o) * (1 - to))} a week instead of ${fmt(expectedGross(s, o) * (1 - o.share))}.`,
        effects: [pop({ op: 'post', do: 'share', id: o.id })],
        ...(off ? { disabledReason: off } : o.share >= 0.5 ? { disabledReason: 'He keeps half already' } : {}),
      };
    }
    case 'wife': {
      const cost = 1500;
      const has = !!c && (!!c.spouseId || !!c.household?.wife);
      return {
        ...base, title: `Bring ${nm}'s wife and kids out to ${ci.name}`, cost, because: `brought ${nm}'s family out to ${ci.name}`,
        detail: `${fmt(cost)} for the move. Certain: loyalty +8, and the distance weighs on him less than half as much. But a man with his family out there puts down roots: if he ever breaks away, it is a little likelier (×1.2).`,
        effects: [{ type: 'money', amount: -cost, category: 'cost', label: `${nm}'s family moved to ${ci.name}` }, pop({ op: 'post', do: 'wife', id: o.id })],
        ...(off ? { disabledReason: off } : !has ? { disabledReason: 'He has no wife' } : o.wife !== undefined ? { disabledReason: 'His family is out there already' } : {}),
      };
    }
    case 'wed': {
      const cost = 2000;
      const m = matronOf(s);
      const chance = clamp(0.4 + o.loyal / 250, 0.2, 0.85);
      return {
        ...base, title: `A marriage tie for ${nm}, through ${m ? m.firstName : 'the matchmaker'}`, cost, because: `tied ${nm} to the house by marriage`,
        detail: `A grown cousin of your house marries into his family (${fmt(cost)} for the wedding). ${pct(chance)} both sides say yes. Then: loyalty +15, +0.3 a week, and his odds of breaking away or being taken are halved.`,
        effects: [{ type: 'money', amount: -cost, category: 'cost', label: `The wedding for ${nm}'s family` }, pop({ op: 'post', do: 'wed', id: o.id })],
        refuseEffects: [pop({ op: 'post', do: 'letter', id: o.id })],
        acceptance: { chance, reasons: [{ label: 'Base', value: 40 }, { label: `His loyalty (${Math.round(o.loyal)})`, value: Math.round(o.loyal / 2.5) }] }, oddsLabel: 'Both families say yes',
        ...(off ? { disabledReason: off } : !m ? { disabledReason: 'No woman of your house to arrange it' } : o.wed !== undefined ? { disabledReason: 'Already family by marriage' } : {}),
      };
    }
    case 'home': {
      const chance = o.loyal >= 50 ? 1 : clamp(o.loyal / 55, 0.1, 0.95);
      const back = Math.round(o.seed * 0.6);
      return {
        ...base, title: `Call ${nm} home`, because: `called ${nm} home from ${ci.name}`,
        detail: `${chance >= 1 ? 'Certain' : `${pct(chance)} he comes`}: he sells out of ${SPOTS[o.spot].name} for ${fmt(back)} and comes home with his men; the weekly money stops.${chance < 1 ? ' If he will not come, his loyalty falls (−10) and everybody hears he said no to you.' : ''}`,
        effects: [pop({ op: 'post', do: 'home', id: o.id, chance })],
        ...(off ? { disabledReason: off } : {}),
      };
    }
    case 'settle': {
      const chance = clamp(0.3 + (s.respect - 50) / 150 + (c ? opinion(s, c.id, s.playerId) / 300 : 0), 0.1, 0.8);
      return {
        ...base, title: `Make a deal with ${nm}: he keeps it, you get an end`, because: `made a deal with ${nm} over ${ci.name}`,
        detail: `${pct(chance)} he takes it: he pays you a quarter of what it takes, every week, for half a year, and there is no war over it. Otherwise he laughs, and the boss looks smaller (respect −1).`,
        effects: [pop({ op: 'post', do: 'settle', id: o.id, chance })],
        ...(o.status !== 'broke' ? { disabledReason: 'Only a man who broke away' } : !c?.alive ? { disabledReason: 'He is gone' } : {}),
      };
    }
    case 'retake': {
      const cost = 2500;
      const chance = clamp(0.35 + (s.respect - 50) / 200 + (stanceTo(s, host).value >= 10 ? 0.1 : -0.05), 0.15, 0.7);
      return {
        ...base, title: `Send men to take ${ci.name} back from ${nm}`, cost, because: `sent men to take back ${ci.name}`,
        detail: `${fmt(cost)} for the men and the trip. ${pct(chance)} it works: his place is sold off and the money comes home (${fmt(Math.round(o.seed * 0.8))}); he leaves the city. Otherwise the money is gone, respect −2 and local heat +3 in ${ci.name}'s papers. Nobody of yours is killed either way.`,
        effects: [{ type: 'money', amount: -cost, category: 'cost', label: `Men sent to ${ci.name}` }, pop({ op: 'post', do: 'retake', id: o.id, chance })],
        ...(o.status !== 'broke' ? { disabledReason: 'Only a man who broke away' } : s.wars.some((w) => w.rival === (host as never)) ? { disabledReason: `At war with ${famName(s, host)}` } : {}),
      };
    }
    case 'askback': {
      const chance = clamp(0.3 + stanceTo(s, host).value / 150, 0.1, 0.8);
      return {
        ...base, title: `Ask ${famName(s, host)} for what they took`, because: `asked ${famName(s, host)} to make good on ${nm}`,
        detail: `${pct(chance)} they pay for the place they took off you (${fmt(Math.round(o.seed * 0.5))}) and think a little better of you for asking properly; otherwise they think less of you (−5).`,
        effects: [pop({ op: 'post', do: 'askback', id: o.id, chance })],
        ...(o.status !== 'poached' ? { disabledReason: 'Only an outpost a family took' } : (s.families?.cd[`askback:${o.id}`] ?? 0) > s.week ? { disabledReason: 'You asked already' } : {}),
      };
    }
    default:
      return {
        ...base, title: `Write off ${where}`, because: `wrote off ${where}`,
        detail: 'Certain: it is off your books. Nothing comes home from it, and nothing more goes out.',
        effects: [pop({ op: 'post', do: 'close', id: o.id })],
        ...(o.status === 'closed' || o.status === 'home' ? { disabledReason: 'It is closed already' } : running ? { disabledReason: 'Call him home instead' } : {}),
      };
  }
}

/** The orders on an outpost's card, by its state. */
export function postActions(o: Outpost): FamAction[] {
  const steps: PostStep[] = o.status === 'run' ? ['visit', 'letter', 'share', 'wife', 'wed', 'home'] : o.status === 'broke' ? ['settle', 'retake', 'close'] : o.status === 'poached' ? ['askback', 'close'] : [];
  return steps.map((step) => ({ op: 'post', step, id: o.id }));
}

/* ------------------------------------------------------------------ */
/* Safe passage                                                         */
/* ------------------------------------------------------------------ */

/** The families whose city could hide a man (and the outposts). */
export const HAVENS: FamKey[] = ['vegas', 'chicago', 'nola', 'biscayne', 'tampa', 'cleveland', 'boston'];

export interface Hunter { key: string; name: string; weekly: number }

/** Who is hunting him, and how hard (per week, before the haven's cover). */
export function huntersOf(s: GameState, who: string): Hunter[] {
  const out: Hunter[] = [];
  const isBoss = who === s.playerId;
  for (const w of s.wars) {
    const r = s.rivals.find((x) => x.id === w.rival);
    if (!r) continue;
    const losing = w.score < 0;
    out.push({ key: `war:${w.rival}`, name: `${r.shortName} (at war${losing ? ', and winning' : ''})`, weekly: (isBoss ? 0.03 : 0.015) + (losing ? 0.015 : 0) });
  }
  const fed = s.heat.federal;
  const ev = s.characters[who]?.evidence ?? 0;
  if (fed >= 30 || ev >= 40) out.push({ key: 'feds', name: `the federal men (federal heat ${fed}${ev ? `, his file ${ev}` : ''})`, weekly: fed / 100 * 0.05 + ev / 100 * 0.03 });
  if (s.heat.local >= 50) out.push({ key: 'police', name: `the local police (heat ${s.heat.local}; they do not reach far)`, weekly: 0.005 });
  return out;
}

export interface Haven { at: string; name: string; city: string; host?: FamKey; postId?: string; block?: string }

/** Where he could go: the outposts that run, and the friendly families' cities. */
export function havensFor(s: GameState): Haven[] {
  const out: Haven[] = [];
  for (const o of livePosts(s)) out.push({ at: `post:${o.id}`, name: `${POST_CITIES[o.city].name}, with ${s.characters[o.manId]?.firstName ?? 'your man'} (your outpost)`, city: POST_CITIES[o.city].name, postId: o.id, host: POST_CITIES[o.city].host });
  for (const f of HAVENS) {
    const d = FAMILY_BY_ID[f];
    if (!d) continue;
    const sv = stanceTo(s, f).value;
    const block = !alive(s, f) ? 'Nobody there' : s.wars.some((w) => w.rival === (f as never)) ? 'At war with you' : sv < 0 ? `They are not friendly (${stanceWord(sv)})` : undefined;
    out.push({ at: `fam:${f}`, name: `${d.seat.split(' (')[0]}, as a guest of ${famName(s, f)}`, city: d.seat.split(' (')[0], host: f, ...(block ? { block } : {}) });
  }
  return out;
}

export interface Passage { safe: number; found: number; sold: number; perWeek: { found: number; sold: number }; reasons: Reason[]; hunters: Hunter[]; cost: number; block?: string }

/** The odds of lying low there for so many weeks, every part shown. */
export function passageOdds(s: GameState, who: string, at: string, weeks: number, paid = false): Passage {
  const hv = havensFor(s).find((h) => h.at === at);
  const hunters = huntersOf(s, who);
  const reasons: Reason[] = [];
  let found = 0.01 + hunters.reduce((a, h) => a + h.weekly, 0);
  for (const h of hunters) reasons.push({ label: `Hunting: ${h.name}`, value: -Math.round(h.weekly * 100 * weeks) });
  let sold = 0;
  const o = hv?.postId ? outpostsOf(s).find((x) => x.id === hv.postId) : undefined;
  if (o) {
    found *= 1.2 - o.loyal / 100;
    sold = Math.max(0, 60 - o.loyal) / 100 * 0.06;
    reasons.push({ label: `${s.characters[o.manId]?.firstName ?? 'Your man'}'s loyalty (${Math.round(o.loyal)})`, value: Math.round((o.loyal - 60) / 4) });
  } else if (hv?.host) {
    const sv = stanceTo(s, hv.host).value;
    found *= 1 - sv / 200;
    sold = Math.max(0, 30 - sv) / 100 * 0.05;
    reasons.push({ label: `${famName(s, hv.host)}'s stance (${stanceWord(sv)})`, value: Math.round(sv / 5) });
    const friendsOfHunters = hunters.filter((h) => h.key.startsWith('war:') && tieBetween(s, hv.host!, h.key.slice(4) as FamKey).some((t) => TIE_SIGN[t.kind] > 0));
    if (friendsOfHunters.length) { sold += 0.025; reasons.push({ label: `${famName(s, hv.host)} are friends of who is hunting you`, value: -10 }); }
  }
  if (hunters.some((h) => h.key === 'feds')) {
    sold += s.heat.federal / 100 * 0.012;
    reasons.push({ label: 'The feds reach every city: a host may make a deal with them', value: -Math.round(s.heat.federal / 10) });
  }
  if (paid) { found *= 0.6; reasons.push({ label: 'The locals were paid to look away', value: 5 }); }
  if (who === s.playerId) { found *= 1.2; reasons.push({ label: 'A boss is a big man to hide', value: -3 }); }
  reasons.push({ label: `${weeks} weeks`, value: -weeks });
  found = clamp(found, 0.002, 0.3);
  sold = clamp(sold, 0, 0.2);
  const safe = (1 - found - sold) ** weeks;
  const bad = 1 - safe;
  const cost = (hv?.postId ? 300 : 600) * (who === s.playerId ? 2 : 1) + 200 * weeks * (who === s.playerId ? 2 : 1);
  const block = !hv ? 'No such place' : hv.block;
  return { safe, found: bad * (found / (found + sold || 1)), sold: bad * (sold / (found + sold || 1)), perWeek: { found, sold }, reasons, hunters, cost, ...(block ? { block } : {}) };
}

/** Who could go: the boss, his heir, his men (home and free). */
export function lieCandidates(s: GameState): Character[] {
  const boss = player(s);
  const heir = chooseHeir(s, boss).heir;
  const men = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && isFree(s, c) && !isAway(s, c.id) && (c.rank !== 'civilian' || c.id === heir?.id));
  const list = [boss, ...(heir && heir.alive && heir.id !== boss.id ? [heir] : []), ...men.filter((c) => c.id !== heir?.id).sort((a, b) => (a.id < b.id ? -1 : 1))];
  return list.filter((c) => !lyingLow(s, c.id));
}

/** Does the boss need somewhere to go (losing a war, heavy heat)? The reasons, if so. */
export function needsBolthole(s: GameState): string[] {
  const out: string[] = [];
  for (const w of s.wars) if (w.score <= -25) out.push(`You are losing the war with ${s.rivals.find((r) => r.id === w.rival)?.shortName ?? w.rival} (score ${w.score})`);
  if (s.heat.federal >= 60) out.push(`Federal heat is ${s.heat.federal}`);
  if (s.heat.local >= 75) out.push(`Local heat is ${s.heat.local}`);
  if ((s.characters[s.playerId]?.evidence ?? 0) >= 60) out.push(`They have a file on you (${s.characters[s.playerId]?.evidence})`);
  return out;
}

export function previewLie(s: GameState, a: LieAction): ActionPreview {
  if (a.home) {
    const l = s.posts?.lie.find((x) => x.id === a.home);
    const c = l ? s.characters[l.who] : undefined;
    return {
      ...base, title: `Come home from ${l?.city ?? 'lying low'}${c && c.id !== s.playerId ? ` (${c.firstName})` : ''}`, because: 'came home from lying low',
      detail: 'Certain: home this week. Whatever cooled while away stays cooled.',
      effects: [{ type: 'fam', op: { op: 'lie', do: 'home', id: a.home } }],
      ...(l?.status !== 'away' ? { disabledReason: 'Not away' } : {}),
    };
  }
  const who = a.who ? s.characters[a.who] : undefined;
  const weeks = clamp(Math.round(a.weeks ?? 4), 2, 12);
  const at = a.at ?? '';
  if (!who) return { ...base, title: 'Lie low somewhere', because: '', disabledReason: 'Pick who goes' };
  const p = passageOdds(s, who.id, at, weeks);
  const hv = havensFor(s).find((h) => h.at === at);
  const isBoss = who.id === s.playerId;
  const nm = isBoss ? 'You' : who.firstName;
  const hunt = p.hunters.length ? p.hunters.map((h) => h.name).join('; ') : 'nobody in particular';
  const why = p.block ?? (lyingLow(s, who.id) ? 'Already away' : !lieCandidates(s).some((c) => c.id === who.id) ? 'He cannot go now' : s.money < p.cost ? `Needs ${fmt(p.cost)}` : undefined);
  const host = hv?.host;
  const famHost = !hv?.postId && host;
  const takeIn = famHost ? clamp(0.5 + stanceTo(s, host).value / 100, 0.3, 0.95) : 1;
  return {
    ...base, title: `${isBoss ? 'Lie low' : `Send ${who.firstName} to lie low`} in ${hv?.city ?? 'another city'} for ${weeks} weeks`, cost: p.cost,
    because: `${isBoss ? 'went to lie low' : `sent ${who.firstName} to lie low`} in ${hv?.city ?? 'another city'}`,
    detail: `${nm} ${isBoss ? 'go' : 'goes'} to ${hv?.name ?? 'another city'} for ${weeks} weeks (${fmt(p.cost)}). Hunting: ${hunt}. Odds: ${pct(p.safe)} safe the whole time; ${pct(p.found)} found (a danger: you decide what to do); ${pct(p.sold)} the host sells ${isBoss ? 'you' : 'him'} out (${isBoss ? 'a game event with odds' : 'he gets a warning and a chance to run, and you decide; no man of yours is handed over'}). While away: ${isBoss ? 'the underboss or a capo runs the family; ' : ''}heat cools a little every week${isBoss && s.wars.length ? '; the war may pause, or they may press while you are gone' : ''}.`,
    ...(isBoss ? { warning: 'Nobody is ever truly untouchable: a host can be bought.' } : {}),
    effects: [{ type: 'money', amount: -p.cost, category: 'cost', label: `Lying low in ${hv?.city ?? 'another city'}` }, { type: 'fam', op: { op: 'lie', do: 'start', plan: { who: who.id, at, weeks } } }],
    ...(famHost ? {
      acceptance: { chance: takeIn, reasons: [{ label: 'Base', value: 50 }, { label: `${famName(s, host)}'s stance`, value: Math.round(stanceTo(s, host).value) }] },
      oddsLabel: `${famName(s, host)} take ${isBoss ? 'you' : 'him'} in`,
      refuseEffects: [{ type: 'fam', op: { op: 'cd', key: `lie:${host}`, weeks: 4 } }],
    } : {}),
    ...(why ? { disabledReason: why } : famHost && (s.families?.cd[`lie:${host}`] ?? 0) > s.week ? { disabledReason: 'They said no lately' } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Applying                                                             */
/* ------------------------------------------------------------------ */

function J(s: GameState, t: string, x: string | undefined, p: string[], m?: number, c: 'money' | 'crew' | 'travel' | 'rivals' | 'law' = 'crew'): void {
  journal(s, { t, ...(x ? { x } : {}), c, src: 'outposts', ln: 'diplomacy.board', p: p.filter(Boolean), ...(m ? { m } : {}) });
}

function closePost(s: GameState, o: Outpost, status: Outpost['status']): void {
  o.status = status;
  o.end = s.week;
  for (const id of [o.manId, ...o.crew]) { const c = s.characters[id]; if (c && c.busyUntil && c.busyUntil > s.week && (status === 'home' || status === 'closed' || id !== o.manId)) c.busyUntil = s.week; }
}

export function applyPostOp(ctx: Ctx, op: Extract<FamOp, { op: 'post' }>): void {
  const s = ctx.s;
  const st = ensureOutposts(s);
  if (op.do === 'start' && op.plan) {
    const pl = op.plan;
    const c = s.characters[pl.man];
    if (!c?.alive) return;
    const o: Outpost = { id: `o${st.next++}`, city: pl.city, spot: pl.spot, manId: c.id, crew: pl.crew.filter((id) => s.characters[id]?.alive), seed: pl.seed, since: s.week, loyal: startLoyalty(s, c), hist: [], share: BASE_SHARE, side: 0, sent: 0, kept: 0, sends: [], status: 'run' };
    addHist(o, o.loyal);
    st.list.push(o);
    for (const id of [o.manId, ...o.crew]) { const m = s.characters[id]; if (m) m.busyUntil = s.week + 1; }
    const ci = POST_CITIES[o.city];
    addStory(s, c, `Went to ${ci.name} to start ${SPOTS[o.spot].name} for the family.`);
    addTie(s, ci.host, 'player', 'friends', 25, `${famName(s, ci.host)} let a man of your house set up in ${ci.name} in ${s.date.y}.`);
    J(s, `${displayName(c)} went to ${ci.name} to start ${SPOTS[o.spot].name}`, `${fmt(o.seed)} seed money${o.crew.length ? `; ${o.crew.map((id) => s.characters[id]?.firstName).join(' and ')} went with him` : ''}. His loyalty starts at ${o.loyal}.`, [c.id, ...o.crew], undefined, 'money');
    ctx.log.push(`${displayName(c)} left for ${ci.name}.`);
    return;
  }
  const o = st.list.find((x) => x.id === op.id);
  if (!o) return;
  const c = s.characters[o.manId];
  const nm = c ? displayName(c) : 'Your man';
  const ci = POST_CITIES[o.city];
  const r = () => rand(st);
  switch (op.do) {
    case 'visit':
      o.visit = s.week;
      o.loyal = clamp(o.loyal + 12, 0, 100);
      if (o.side > 0) o.side--;
      J(s, `You went to see ${nm} in ${ci.name}`, `Loyalty +12 (now ${Math.round(o.loyal)}).${o.side >= 0 ? ' You saw the place with your own eyes.' : ''}`, [o.manId], undefined, 'travel');
      break;
    case 'letter':
      o.letter = s.week;
      o.loyal = clamp(o.loyal + 3, 0, 100);
      J(s, `You wrote to ${nm} in ${ci.name}`, `Loyalty +3 (now ${Math.round(o.loyal)}).`, [o.manId]);
      break;
    case 'share':
      o.share = Math.min(0.5, Math.round((o.share + 0.1) * 100) / 100);
      o.loyal = clamp(o.loyal + 10, 0, 100);
      J(s, `${nm} keeps ${pct(o.share)} in ${ci.name} now`, `A bigger share: loyalty +10 (now ${Math.round(o.loyal)}).`, [o.manId], undefined, 'money');
      break;
    case 'wife':
      o.wife = s.week;
      o.loyal = clamp(o.loyal + 8, 0, 100);
      J(s, `${nm}'s family moved out to ${ci.name}`, `Loyalty +8 (now ${Math.round(o.loyal)}); the distance weighs on him less.`, [o.manId], undefined, 'travel');
      break;
    case 'wed':
      o.wed = s.week;
      o.loyal = clamp(o.loyal + 15, 0, 100);
      J(s, `A marriage tied ${nm}'s family to your house`, `Loyalty +15 (now ${Math.round(o.loyal)}); his odds of leaving you are halved.`, [o.manId], undefined, 'crew');
      break;
    case 'home': {
      const chance = op.chance ?? 1;
      if (chance >= 1 || r() < chance) {
        const back = Math.round(o.seed * 0.6);
        money(ctx, back, `${nm} sold out of ${ci.name}`, 'business');
        closePost(s, o, 'home');
        if (c) { c.busyUntil = s.week; addStory(s, c, `Came home from ${ci.name} when the boss called.`); }
        J(s, `${nm} came home from ${ci.name}`, `He sold out for ${fmt(back)}${chance < 1 ? ` (it was ${pct(chance)} he would come)` : ''}.`, [o.manId, ...o.crew], back, 'money');
      } else {
        o.refused = s.week;
        o.loyal = clamp(o.loyal - 10, 0, 100);
        J(s, `${nm} would not come home from ${ci.name}`, `It was ${pct(chance)} he would. Loyalty −10 (now ${Math.round(o.loyal)}); everybody heard.`, [o.manId]);
      }
      break;
    }
    case 'settle': {
      if (r() < (op.chance ?? 0)) {
        const weekly = Math.round(expectedGross(s, { ...o, since: o.since }) * 0.25);
        o.status = 'home';
        o.end = s.week;
        if (s.families) s.families.deals.push({ fam: ci.host, weekly, until: s.week + 26, what: `${nm}'s end from ${ci.name}` });
        J(s, `${nm} pays you an end from ${ci.name}`, `A quarter of what it takes, ${fmt(weekly)} a week for half a year; no war over it (it was ${pct(op.chance ?? 0)}).`, [o.manId], undefined, 'money');
      } else {
        applyEffects(ctx, [{ type: 'respect', amount: -1 }], { label: `${nm} laughed at your offer`, because: `offered ${nm} a deal` });
        J(s, `${nm} laughed at your offer`, `It was ${pct(op.chance ?? 0)} he would take it. Respect −1.`, [o.manId]);
      }
      break;
    }
    case 'retake': {
      if (r() < (op.chance ?? 0)) {
        const back = Math.round(o.seed * 0.8);
        money(ctx, back, `${ci.name} taken back from ${nm}`, 'business');
        o.status = 'closed';
        o.end = s.week;
        J(s, `Your men took ${ci.name} back from ${nm}`, `His place was sold off: ${fmt(back)} came home; he left the city (it was ${pct(op.chance ?? 0)}).`, [o.manId], back, 'money');
      } else {
        applyEffects(ctx, [{ type: 'respect', amount: -2 }, { type: 'heat', bar: 'local', amount: 3 }], { label: `${nm} held on to ${ci.name}`, because: `tried to take back ${ci.name}` });
        J(s, `${nm} held on to ${ci.name}`, `Your men came home with nothing (it was ${pct(op.chance ?? 0)}). Respect −2, local heat +3. Nobody of yours was hurt.`, [o.manId]);
      }
      break;
    }
    case 'askback': {
      if (!s.families) break;
      s.families.cd[`askback:${o.id}`] = s.week + 52;
      if (r() < (op.chance ?? 0)) {
        const amt = Math.round(o.seed * 0.5);
        money(ctx, amt, `${famName(s, ci.host)} made good on ${nm}`, 'business');
        setView(s, ci.host, 3, 'Asked properly');
        J(s, `${famName(s, ci.host)} made good on ${nm}`, `They paid ${fmt(amt)} for the place they took (it was ${pct(op.chance ?? 0)}).`, [o.manId], amt, 'rivals');
      } else {
        setView(s, ci.host, -5, 'Asked us for what we took');
        J(s, `${famName(s, ci.host)} would not pay for ${nm}`, `It was ${pct(op.chance ?? 0)}. They think less of you for asking (−5).`, [o.manId], undefined, 'rivals');
      }
      break;
    }
    case 'close':
      closePost(s, o, 'closed');
      J(s, `You wrote off ${postName(s, o)}`, undefined, [o.manId], undefined, 'money');
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Safe passage: applying                                               */
/* ------------------------------------------------------------------ */

const lop = (o: Extract<FamOp, { op: 'lie' }>): Effect => ({ type: 'fam', op: o });

function comeHome(s: GameState, l: LieLow, how: LieLow['status'] = 'home'): void {
  l.status = how === 'away' ? 'home' : how;
  l.until = Math.min(l.until, s.week);
  const c = s.characters[l.who];
  if (c && c.id !== s.playerId && (c.busyUntil ?? 0) > s.week) c.busyUntil = s.week;
}

export function applyLieOp(ctx: Ctx, op: Extract<FamOp, { op: 'lie' }>): void {
  const s = ctx.s;
  const st = ensureOutposts(s);
  if (op.do === 'start' && op.plan) {
    const c = s.characters[op.plan.who];
    if (!c?.alive || lyingLow(s, c.id)) return;
    const hv = havensFor(s).find((h) => h.at === op.plan!.at);
    if (!hv) return;
    const p = passageOdds(s, c.id, hv.at, op.plan.weeks);
    const l: LieLow = {
      id: `l${st.next++}`, who: c.id, ...(hv.postId ? { postId: hv.postId } : {}), ...(!hv.postId && hv.host ? { fam: hv.host } : {}), city: hv.city,
      since: s.week, until: s.week + op.plan.weeks, odds: { safe: Math.round(p.safe * 100), found: Math.round(p.found * 100), sold: Math.round(p.sold * 100) },
      hunters: p.hunters.map((h) => h.name), status: 'away',
    };
    st.lie.push(l);
    if (c.id === s.playerId) ensureTravel(s);
    else c.busyUntil = l.until;
    const isBoss = c.id === s.playerId;
    J(s, `${isBoss ? 'You went' : `${displayName(c)} went`} to lie low in ${hv.city}`, `${op.plan.weeks} weeks${hv.host ? `, ${hv.postId ? 'with your outpost' : `as a guest of ${famName(s, hv.host)}`}` : ''}. The odds when ${isBoss ? 'you' : 'he'} went: ${l.odds.safe}% safe, ${l.odds.found}% found, ${l.odds.sold}% sold out. Hunting: ${l.hunters.length ? l.hunters.join('; ') : 'nobody in particular'}.`, [c.id], undefined, 'travel');
    ctx.log.push(`${isBoss ? 'The boss' : displayName(c)} left town to lie low in ${hv.city}.`);
    return;
  }
  const l = st.lie.find((x) => x.id === op.id);
  if (!l || l.status !== 'away') return;
  const c = s.characters[l.who];
  const isBoss = l.who === s.playerId;
  const nm = isBoss ? 'You' : c ? displayName(c) : 'Your man';
  const r = rand(st);
  switch (op.do) {
    case 'home':
      comeHome(s, l);
      J(s, `${nm} came home from ${l.city}`, `After ${s.week - l.since} weeks away.`, [l.who], undefined, 'travel');
      break;
    case 'move': {
      if (r < (op.chance ?? 0)) {
        l.asked = undefined;
        J(s, `${nm} moved to another hotel in ${l.city}, and lost them`, `It was ${pct(op.chance ?? 0)}.`, [l.who], undefined, 'travel');
      } else {
        comeHome(s, l, 'found');
        if (c) c.health = Math.max(1, c.health - 10);
        applyEffects(ctx, [{ type: 'heat', bar: 'local', amount: 3 }], { label: `${nm} had to run home from ${l.city}`, because: 'was found lying low' });
        J(s, `${nm} had to run home from ${l.city}`, `They followed (it was ${pct(op.chance ?? 0)} to lose them): a close call on the road, health −10, local heat +3. ${isBoss ? 'You made it home.' : 'He made it home.'}`, [l.who], undefined, 'travel');
      }
      break;
    }
    case 'pay': {
      const cost = op.amount ?? 1000;
      money(ctx, -cost, `Paid the locals in ${l.city} to look away`, 'cost');
      l.paid = true;
      l.asked = undefined;
      J(s, `${nm} paid the locals in ${l.city} to look away`, `${fmt(cost)}. The odds of being found again are lower.`, [l.who], -cost, 'travel');
      break;
    }
    case 'slip': {
      if (r < (op.chance ?? 0)) {
        comeHome(s, l, 'sold');
        J(s, `${nm} slipped out of ${l.city} the night the host turned`, `${isBoss ? 'You' : 'He'} made it home (it was ${pct(op.chance ?? 0)}). Nobody there will be trusted again.`, [l.who], undefined, 'travel');
        if (l.fam) setView(s, l.fam as FamKey, -10, 'Turned on a guest');
        if (l.postId) { const o = outpostsOf(s).find((x) => x.id === l.postId); if (o) o.loyal = clamp(o.loyal - 15, 0, 100); }
      } else handedOver(ctx, l, op.chance ?? 0, 'slip');
      break;
    }
    case 'outbid': {
      const cost = op.amount ?? 3000;
      money(ctx, -cost, `Outbid the hunters in ${l.city}`, 'cost');
      if (r < (op.chance ?? 0)) {
        l.asked = undefined;
        J(s, `${nm} outbid the hunters in ${l.city}`, `${fmt(cost)}, and the host kept the door shut (it was ${pct(op.chance ?? 0)}).`, [l.who], -cost, 'travel');
      } else handedOver(ctx, l, op.chance ?? 0, 'outbid');
      break;
    }
    case 'guard':
      comeHome(s, l, 'sold');
      applyEffects(ctx, [{ type: 'respect', amount: -1 }], { label: `Came home under guard from ${l.city}`, because: 'came home when the host turned' });
      J(s, `${nm} came home under guard from ${l.city}`, `The host turned; ${isBoss ? 'you' : 'he'} left before they could act. Respect −1.`, [l.who], undefined, 'travel');
      break;
  }
}

/**
 * The host sold him out and the escape did not work. For the BOSS: the
 * hunters have him (the feds question him and his file grows; a family at
 * war takes its terms). For one of the boss's men: he is NEVER handed over:
 * he gets out the hard way (hurt, his money gone) and comes home.
 */
function handedOver(ctx: Ctx, l: LieLow, chance: number, how: string): void {
  const s = ctx.s;
  const c = s.characters[l.who];
  const isBoss = l.who === s.playerId;
  comeHome(s, l, 'sold');
  if (l.fam) setView(s, l.fam as FamKey, -15, 'Sold out a guest');
  if (!isBoss) {
    if (c) c.health = Math.max(1, c.health - 15);
    applyEffects(ctx, [{ type: 'heat', bar: 'local', amount: 2 }], { label: `${c ? displayName(c) : 'Your man'} got out of ${l.city} the hard way`, because: 'was sold out lying low' });
    J(s, `${c ? displayName(c) : 'Your man'} got out of ${l.city} the hard way`, `The ${how === 'slip' ? 'run' : 'money'} did not work (it was ${pct(chance)}); he fought his way to the bus station and came home hurt (health −15). He was not handed over.`, [l.who], undefined, 'travel');
    return;
  }
  const boss = c!;
  const war = s.wars.filter((w) => w.score < 0).sort((a, b) => a.score - b.score)[0] ?? s.wars[0];
  if (war) {
    const rv = s.rivals.find((x) => x.id === war.rival);
    endWar(ctx, war, 'lost');
    boss.health = Math.max(1, boss.health - 10);
    J(s, `${rv?.shortName ?? 'They'} had you brought to a table in ${l.city}`, `The host sold you out and the ${how === 'slip' ? 'run' : 'money'} did not work (it was ${pct(chance)}). You signed their terms: the war is over, and you lost it. You came home alive, and everybody knows how.`, [l.who], undefined, 'rivals');
  } else {
    heat(ctx, 'federal', 12, `The feds picked you up in ${l.city}`, 'heat');
    boss.evidence = clamp((boss.evidence ?? 0) + 12, 0, 100);
    J(s, `The federal men picked you up in ${l.city}`, `The host made a deal with them and the ${how === 'slip' ? 'run' : 'money'} did not work (it was ${pct(chance)}). Two days of questions in a room with no windows; your lawyer got you out. Federal heat +12, your file +12.`, [l.who], undefined, 'law');
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

function postEvent(s: GameState, defId: string, title: string, text: string, choices: EventInstance['choices'], actors: string[], fam: string): EventInstance {
  return famEvent(s, defId, title, text, choices, { priority: 52, fam, actors });
}

/** An outpost's week: the take, the send home, the drift, his own things, and the break or the poach. */
function postWeek(ctx: Ctx, st: OutpostState, o: Outpost): void {
  const s = ctx.s;
  const c = s.characters[o.manId];
  const ci = POST_CITIES[o.city];
  // He is dead or jailed: one of his men takes over, or it closes.
  if (!c?.alive || (c.imprisonedUntil ?? 0) > s.week || c.faction !== 'player') {
    const next = o.crew.find((id) => s.characters[id]?.alive && s.characters[id]!.faction === 'player' && (s.characters[id]!.imprisonedUntil ?? 0) <= s.week);
    if (next) {
      const old = o.manId;
      o.manId = next;
      o.crew = o.crew.filter((id) => id !== next);
      o.loyal = startLoyalty(s, s.characters[next]!);
      o.hist = [Math.round(o.loyal)];
      J(s, `${displayName(s.characters[next]!)} runs things in ${ci.name} now`, `${s.characters[old] ? displayName(s.characters[old]!) : 'His boss'} cannot.`, [next, old]);
    } else {
      closePost(s, o, 'closed');
      J(s, `${postName(s, o)} closed`, 'Nobody of yours left to run it; the seed money is gone.', [o.manId], undefined, 'money');
      return;
    }
  }
  const man = s.characters[o.manId]!;
  for (const id of [o.manId, ...o.crew]) { const m = s.characters[id]; if (m?.alive) m.busyUntil = Math.max(m.busyUntil ?? 0, s.week + 1); }
  // The take.
  const luck = 1 + (rand(st) - 0.5) * 2 * SPOTS[o.spot].vol;
  const gross = Math.max(0, Math.round(expectedGross(s, o) * luck));
  const keep = keepFrac(o);
  const sent = Math.round(gross * (1 - keep));
  const got = sent > 0 ? money(ctx, sent, `${postName(s, o)}: what he sent home`, 'business') : 0;
  o.sent += got;
  o.kept += gross - got;
  man.wealth = (man.wealth ?? 0) + (gross - got);
  o.sends.push(got);
  if (o.sends.length > HIST) o.sends.shift();
  // The drift.
  const d = driftOf(s, o);
  o.loyal = clamp(o.loyal + d.total + (rand(st) - 0.5) * 0.6, 0, 100);
  // His own things.
  if (o.loyal < 70 && o.side < 3 && rand(st) < ((70 - o.loyal) / 100) * 0.08 * (hasTrait(man, 'Ambitious') || hasTrait(man, 'Greedy') ? 1.5 : 1)) {
    o.side++;
    const what = ['a card game in the back of a motel', 'his own book on the fights', 'a piece of a bar on the side', 'a loan or two of his own'][Math.min(3, o.side - 1 + (rand(st) < 0.5 ? 1 : 0))];
    J(s, `${displayName(man)} started something of his own in ${ci.name}`, `Word is ${what}. He keeps more of the money now.`, [man.id], undefined, 'crew');
  }
  addHist(o, o.loyal);
  // The break, or the poach (warning signs first: never below the line without them).
  const pb = breakOdds(s, o), pp = poachOdds(s, o);
  const x = rand(st);
  if (x < pb) breakAway(ctx, o);
  else if (x < pb + pp) poached(ctx, o);
}

function breakAway(ctx: Ctx, o: Outpost): void {
  const s = ctx.s;
  const c = s.characters[o.manId]!;
  const ci = POST_CITIES[o.city];
  closePost(s, o, 'broke');
  // His men come home: they are yours.
  for (const id of o.crew) { const m = s.characters[id]; if (m?.alive) m.busyUntil = s.week; }
  const name = displayName(c);
  applyEffects(ctx, [{ type: 'exile', charId: c.id, own: true }], { label: `${name} broke away in ${ci.name}`, because: 'broke away' });
  c.busyUntil = undefined;
  addStory(s, c, `Broke away from the family in ${ci.name}: his own crew now.`);
  J(s, `${name} broke away in ${ci.name}`, `He stopped sending money and runs ${SPOTS[o.spot].name} as his own crew now.${o.crew.length ? ' His men came home: they are yours.' : ''} You can make a deal with him, send men to take it back, or write it off (Outposts).`, [c.id, ...o.crew], undefined, 'crew');
  ctx.log.push(`${name} broke away in ${ci.name}.`);
  s.eventQueue.push(postEvent(s, 'post_broke', `${c.firstName} broke away in ${ci.name}`,
    `The money did not come this week. Then a letter, not in his hand: ${name} runs ${SPOTS[o.spot].name} in ${ci.name} for himself now. He kept your seed money, and he kept the men who were his.${o.crew.length ? ' Yours came home on the bus.' : ''} His loyalty was ${Math.round(o.loyal)} when he went.`,
    [
      { id: 'later', label: 'Think it over (Outposts)', detail: 'Certain: nothing yet. A deal, men to take it back, or writing it off stay open in the Outposts view.', because: `let ${c.firstName}'s break sit for now`, effects: [] },
      { id: 'close', label: 'Write it off', detail: 'Certain: it is off your books.', because: `wrote off ${c.firstName}'s outpost`, effects: [pop({ op: 'post', do: 'close', id: o.id })] },
    ], [c.id], ci.host));
}

function poached(ctx: Ctx, o: Outpost): void {
  const s = ctx.s;
  const c = s.characters[o.manId]!;
  const ci = POST_CITIES[o.city];
  closePost(s, o, 'poached');
  o.by = ci.host;
  for (const id of o.crew) { const m = s.characters[id]; if (m?.alive) m.busyUntil = s.week; }
  const name = displayName(c);
  applyEffects(ctx, [{ type: 'exile', charId: c.id, own: true }, { type: 'fam', op: { op: 'size', fam: ci.host, amount: 1 } }], { label: `${famName(s, ci.host)} took ${name}`, because: 'was poached' });
  c.busyUntil = undefined;
  addStory(s, c, `Went over to ${famName(s, ci.host)} in ${ci.name}.`);
  J(s, `${famName(s, ci.host)} took ${name} in ${ci.name}`, `He went over to them with ${SPOTS[o.spot].name}.${o.crew.length ? ' His men came home: they are yours.' : ''} You can ask ${famName(s, ci.host)} to make good on it (Outposts).`, [c.id, ...o.crew], undefined, 'rivals');
  ctx.log.push(`${famName(s, ci.host)} took ${name} in ${ci.name}.`);
  s.eventQueue.push(postEvent(s, 'post_poached', `${famName(s, ci.host)} took ${c.firstName}`,
    `${name} is with ${famName(s, ci.host)} now: their man, their money, your seed. In ${ci.name} they say he was asked, and he said yes. His loyalty was ${Math.round(o.loyal)}.`,
    [
      { id: 'later', label: 'Think it over (Outposts)', detail: 'Certain: nothing yet. Asking them to make good on it stays open in the Outposts view.', because: `let ${c.firstName}'s going sit for now`, effects: [] },
      { id: 'close', label: 'Write it off', detail: 'Certain: it is off your books.', because: `wrote off ${c.firstName}'s outpost`, effects: [pop({ op: 'post', do: 'close', id: o.id })] },
    ], [c.id], ci.host));
}

/** Lying low: the week away (heat cools, the war waits or not) and the dangers. */
function lieWeek(ctx: Ctx, st: OutpostState, l: LieLow): void {
  const s = ctx.s;
  const c = s.characters[l.who];
  if (!c?.alive) { l.status = 'home'; return; }
  const isBoss = l.who === s.playerId;
  const nm = isBoss ? 'You' : displayName(c);
  // The outpost that hid him is gone (he broke away, was taken, came home): no roof, so home.
  if (l.postId && !livePosts(s).some((o) => o.id === l.postId)) {
    comeHome(s, l);
    J(s, `${nm} came home from ${l.city}`, 'The outpost that hid him is not yours any more: there was nowhere to stay.', [l.who], undefined, 'travel');
    return;
  }
  if (s.week >= l.until) {
    comeHome(s, l);
    J(s, `${nm} came home from ${l.city}`, `${s.week - l.since} weeks lying low, and nobody found ${isBoss ? 'you' : 'him'}.`, [l.who], undefined, 'travel');
    ctx.log.push(`${isBoss ? 'The boss' : nm} came home from ${l.city}.`);
    return;
  }
  // The cooling.
  if (s.heat.local > 3) heat(ctx, 'local', isBoss ? -2 : -1, `${isBoss ? 'The boss is' : `${c.firstName} is`} out of town (${l.city})`, 'heat');
  if (isBoss && s.heat.federal > 3 && rand(st) < 0.6) heat(ctx, 'federal', -1, 'The federal men lost the boss\'s trail for a while', 'heat');
  if ((c.evidence ?? 0) > 0) c.evidence = Math.max(0, (c.evidence ?? 0) - 1);
  // The war while the boss is away: it waits, or they press.
  if (isBoss) for (const w of s.wars) {
    if (rand(st) < 0.5) continue;
    const rv = s.rivals.find((x) => x.id === w.rival);
    applyEffects(ctx, [{ type: 'warScore', warId: w.id, amount: -3 }], { label: `${rv?.shortName ?? 'They'} pressed while you were away`, because: 'was away' });
    ctx.log.push(`${rv?.shortName ?? 'They'} pressed while the boss was away.`);
  }
  if (l.asked !== undefined && s.week - l.asked < 2) return;
  // The dangers.
  const p = passageOdds(s, l.who, l.postId ? `post:${l.postId}` : `fam:${l.fam}`, 1, l.paid);
  const x = rand(st);
  if (x < p.perWeek.found) {
    l.asked = s.week;
    const move = clamp(0.55 + (l.paid ? 0.1 : 0) - p.perWeek.found, 0.2, 0.8);
    const cost = isBoss ? 2000 : 1000;
    s.eventQueue.push(postEvent(s, 'lie_found', `${isBoss ? 'They found you' : `They found ${c.firstName}`} in ${l.city}`,
      `A car parked across from the hotel two nights running. A bellhop says men asked for ${isBoss ? 'you' : c.firstName} by name. Hunting: ${l.hunters.join('; ') || 'nobody you know of'}.`,
      [
        { id: 'home', label: 'Come home now', detail: 'Certain: home this week.', because: 'came home when they found the hideout', effects: [lop({ op: 'lie', do: 'home', id: l.id })] },
        { id: 'move', label: `Move to another hotel (${pct(move)})`, detail: `${pct(move)} ${isBoss ? 'you lose' : 'he loses'} them and stays; otherwise a close call on the road home (health −10, local heat +3).`, because: 'moved the hideout', effects: [lop({ op: 'lie', do: 'move', id: l.id, chance: move })] },
        { id: 'pay', label: `Pay the locals to look away (${fmt(cost)})`, detail: 'Certain: the odds of being found again are lower (×0.6).', because: 'paid the locals to look away', effects: [lop({ op: 'lie', do: 'pay', id: l.id, amount: cost })] },
      ], [l.who], l.fam ?? 'outpost'));
    return;
  }
  if (x < p.perWeek.found + p.perWeek.sold) {
    l.asked = s.week;
    const host = l.fam ? famName(s, l.fam as FamKey) : (() => { const o = outpostsOf(s).find((y) => y.id === l.postId); return o ? displayName(s.characters[o.manId]!) : 'the host'; })();
    const slip = clamp(0.6 - p.perWeek.sold * 2, 0.3, 0.8);
    const bid = clamp(0.5 + (l.fam ? stanceTo(s, l.fam as FamKey).value / 200 : 0), 0.2, 0.8);
    const cost = isBoss ? 4000 : 2000;
    const fail = isBoss ? (s.wars.length ? 'the family at war has you brought to its table and you sign their terms (you lose the war)' : 'the federal men pick you up for questioning (federal heat +12, your file +12)') : 'he gets out the hard way and comes home hurt (health −15); he is never handed over';
    s.eventQueue.push(postEvent(s, 'lie_sold', isBoss ? `${host} is selling you out` : `${host} is selling ${c.firstName} out`,
      `${isBoss ? 'A' : `${c.firstName} got word to you: a`} waiter who owes ${isBoss ? 'you' : 'him'} a favor says ${host} ${isBoss ? 'has' : 'have'} been talking to ${l.hunters[0] ?? 'the people hunting'}. Nobody is ever truly untouchable. ${isBoss ? 'You have tonight.' : `He has tonight. It is your call.`}`,
      [
        { id: 'guard', label: 'Come home now, under guard', detail: 'Certain: home before they act; respect −1.', because: 'came home when the host turned', effects: [lop({ op: 'lie', do: 'guard', id: l.id })] },
        { id: 'slip', label: `${isBoss ? 'Slip out tonight' : 'Tell him to run tonight'} (${pct(slip)})`, detail: `${pct(slip)} clean away and home; otherwise ${fail}.`, because: 'ran the night the host turned', effects: [lop({ op: 'lie', do: 'slip', id: l.id, chance: slip })] },
        { id: 'outbid', label: `Outbid the hunters (${fmt(cost)}, ${pct(bid)})`, detail: `${pct(bid)} the host keeps the door shut and ${isBoss ? 'you stay' : 'he stays'}; otherwise ${fail}.`, because: 'outbid the hunters', effects: [lop({ op: 'lie', do: 'outbid', id: l.id, chance: bid, amount: cost })] },
      ], [l.who], l.fam ?? 'outpost'));
  }
}

/** The outposts' week (engine.ts, after the cities): each one runs; whoever lies low has his week. */
export function outpostsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const st = s.posts;
  if (!st || s.gameOver) return;
  for (const o of st.list) if (o.status === 'run') postWeek(ctx, st, o);
  for (const l of st.lie) if (l.status === 'away') lieWeek(ctx, st, l);
  // Forget the old: closed outposts after a year, finished stays after half a year.
  st.list = st.list.filter((o) => o.status === 'run' || o.status === 'broke' || o.status === 'poached' || (o.end ?? s.week) > s.week - 52);
  st.lie = st.lie.filter((l) => l.status === 'away' || l.until > s.week - 26);
}

/** The bots' and the tests' quick plan: the first sendable man to Las Vegas with a lounge. */
export function quickPlan(s: GameState, city: PostCity = 'vegas', spot: SpotKind = 'lounge'): PostAction | undefined {
  const m = sendableMen(s)[0];
  return m ? { op: 'post', step: 'start', city, spot, man: m.id, crew: [], seed: SPOTS[spot].min } : undefined;
}
