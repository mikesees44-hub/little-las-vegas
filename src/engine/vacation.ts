import { addDays, ageOn, dateOfWeek } from './calendar';
import { displayName, hasTrait } from './characters';
import { applyEffects } from './effects';
import { addStress } from './familyStress';
import { heat, money, type Ctx } from './ledger';
import { addOpinion } from './relations';
import { hashSeed, rand } from './rng';
import { actingBoss } from './travel';
import { TIER_INFO, type ActTag, type Dest } from './travelDests';
import { liveTrips, type Trip } from './travelState';
import { resolveTransport } from './transport';
import { destOf, guestKind, journal, partyOf, T, tripEvent, tripLabel } from './trips';
import { wildDay } from './vacPlanner';
import type { Character, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * The boss on vacation, day by day. A trip's itinerary (trips.ts) gives each
 * day its headline; here the boss fills the rest of the day himself: a show,
 * the track, deep-sea fishing, golf, the beach, a nightclub, a supper club,
 * shopping, a sit-down with the local family, hiding money, a politician, a
 * romantic dinner, the kids' attraction. Each has hours (a vacation day is
 * 14 waking hours, the headline takes 4), a cost, and effects: stress, what
 * the wife, the kids, the goomar and the crew think of it, money, contacts
 * — and heat, because the Bureau notices who you meet on vacation.
 *
 * Like the city agenda, it is a plan: pure state changes now (planVac /
 * unplanVac), resolved when the week turns (resolveVacDay, on the travel
 * dice) — with things that happen while he is away: a call from home,
 * somebody from Wildwood seeing him with the wrong woman (trips.ts already
 * has the rival on the same beach and the wife meeting the other woman).
 *
 * Names: every performer and person is fictional; places long gone keep
 * their names, places still in business get a near-miss or a description.
 */

export type VacKind = 'show' | 'track' | 'fishing' | 'golf' | 'beach' | 'nightclub' | 'supper' | 'shopping' | 'sitdown' | 'hide' | 'politician' | 'romance' | 'kids';
export type SceneKind = 'beach' | 'desert' | 'mountains' | 'lake' | 'spa' | 'city' | 'island';

export const VAC_DAY_HOURS = 14;
export const HEADLINE_HOURS = 4;
export const MAX_EXTRAS = 3;

interface Flavor {
  scene: SceneKind;
  show?: string;
  track?: { name: string; months?: number[] };
  fishing?: string;
  golf?: string;
  beach?: string;
  club?: string;
  supper?: string;
  shop?: string;
  family?: { name: string; rival?: RivalId; city?: string };
  pol?: string;
  kids?: string;
  bank?: string;
  /** How hard the Bureau watches the place (1 = normal). */
  watched?: number;
}

const FLAVOR: Record<string, Flavor> = {
  miamibeach: { scene: 'beach', show: 'the La Ronde Room', track: { name: 'Tropical Park', months: [11, 12, 1, 2, 3, 4] }, fishing: 'a charter out of Haulover', golf: 'the Normandy Shores links', beach: 'the cabanas on Collins Avenue', club: 'the Latin Quarter on Palm Island', supper: 'a stone-crab house on the South Beach', shop: 'Lincoln Road', family: { name: 'the Biscayne people', city: 'miami' }, pol: 'a Dade County commissioner', kids: 'the porpoise show on Key Biscayne', bank: 'a Brickell Avenue bank', watched: 1.3 },
  vegas: { scene: 'desert', show: 'the Copa Room', track: { name: 'the race book at the Stardust' }, golf: 'the Desert Inn course', beach: 'the pool at the Sands', club: 'a lounge act at the Sahara', supper: 'a steakhouse off Fremont Street', shop: 'the arcade at the Riviera', family: { name: 'the Silver Strip partners', city: 'vegas' }, pol: 'a Clark County commissioner', kids: 'the Hoover Dam tour', bank: 'the count room', watched: 1.4 },
  catskills: { scene: 'mountains', show: 'the Concord\'s nightclub', fishing: 'trout on the Neversink', golf: 'the Monster course', beach: 'the lake at the resort', club: 'the late show at a bungalow casino', supper: 'the dining room, all seven courses', shop: 'Monticello\'s Broadway', family: { name: 'the New York men who summer here', rival: 'feldstein' }, pol: 'a Sullivan County judge', kids: 'the day camp and the pony rides', watched: 0.8 },
  poconos: { scene: 'mountains', show: 'the lodge\'s Saturday revue', fishing: 'bass on Lake Wallenpaupack', golf: 'Buck Hill Falls', beach: 'the lake beach', club: 'the lodge cocktail lounge', supper: 'a candlelit inn at Canadensis', shop: 'Stroudsburg\'s Main Street', pol: 'a Monroe County commissioner', kids: 'the bear at the trading post', watched: 0.6 },
  saratoga: { scene: 'spa', show: 'a lake-house revue', track: { name: 'the August meet', months: [8] }, golf: 'the spa park course', beach: 'the pools at the spa', club: 'a lake house on the old casino row', supper: 'a lake house supper club', shop: 'Broadway\'s shops', family: { name: 'the Albany people', rival: 'feldstein' }, pol: 'a state senator from Albany', kids: 'the carousel in Congress Park', watched: 1.1 },
  hotsprings: { scene: 'spa', show: 'the Vapors\' showroom', track: { name: 'Oaklawn', months: [2, 3, 4] }, fishing: 'Lake Hamilton', golf: 'the country club', beach: 'Bathhouse Row', club: 'the Southern Club', supper: 'the Arlington dining room', shop: 'Central Avenue', family: { name: 'the Spa City Combine', city: 'hotsprings' }, pol: 'the mayor\'s man', kids: 'the alligator farm', bank: 'a man at the Southern Club', watched: 0.8 },
  ac: { scene: 'beach', show: 'the 500 Club', track: { name: 'the Atlantic City meet', months: [6, 7, 8] }, fishing: 'a party boat from Gardner\'s Basin', golf: 'the Linwood course', beach: 'the beach at the Traymore', club: 'the Club Harlem late show', supper: 'Hackney\'s on the inlet', shop: 'the Boardwalk shops', family: { name: 'the Manno people', rival: 'manno', city: 'ac' }, pol: 'a man from the county machine', kids: 'Steel Pier and the diving horse', watched: 1.1 },
  newyork: { scene: 'city', show: 'the Copacabana', track: { name: 'Aqueduct' }, golf: 'a Westchester club', beach: 'Jones Beach', club: 'the Stork Club', supper: 'a steak house on 52nd Street', shop: 'Fifth Avenue', family: { name: 'the Marchetti people', rival: 'feldstein', city: 'newyork' }, pol: 'a Tammany district leader', kids: 'the top of the Empire State Building', bank: 'a garment-center factor', watched: 1.5 },
  philadelphia: { scene: 'city', show: 'the Latin Casino', track: { name: 'Garden State Park', months: [4, 5, 6, 9, 10, 11] }, golf: 'a Main Line club', club: 'a Locust Street piano bar', supper: 'Bookbinder\'s', shop: 'Wanamaker\'s', family: { name: 'the old man\'s people', rival: 'philly', city: 'philadelphia' }, pol: 'a ward leader', kids: 'the Franklin Institute', watched: 1.3 },
  montreal: { scene: 'city', show: 'the Chez Paree on Stanley Street', track: { name: 'Blue Bonnets' }, fishing: 'a Laurentian lake', golf: 'a Laurentian course', club: 'the clubs on St. Catherine', supper: 'a bistro in the old city', shop: 'the furriers on St. Catherine', family: { name: 'the Montreal connections' }, pol: 'a city councillor', kids: 'the Mount Royal lookout', bank: 'a Swiss bank\'s Montreal office', watched: 0.7 },
  acapulco: { scene: 'beach', show: 'the Las Brisas terrace', fishing: 'sailfish off the bay', golf: 'the Pierre Marqués course', beach: 'Caleta beach', club: 'a club over the bay', supper: 'a terrace above La Quebrada', shop: 'the silver shops', family: { name: 'the Mexico City men' }, pol: 'a man from the Gobernación', kids: 'the cliff divers', watched: 0.4 },
  oldcountry: { scene: 'city', show: 'the opera at the Teatro Massimo', golf: undefined, beach: 'Mondello beach', club: 'Via Veneto at night', supper: 'a trattoria in Trastevere', shop: 'Via Condotti', family: { name: 'the old men in the Palermo café' }, pol: 'a deputy from the province', kids: 'the Colosseum', watched: 0.4 },
  bermuda: { scene: 'island', show: 'the hotel\'s calypso night', fishing: 'wahoo off the reef', golf: 'Mid Ocean', beach: 'Horseshoe Bay', club: 'a Front Street club', supper: 'a cottage colony dinner', shop: 'Front Street\'s English shops', pol: 'a member of the colonial Assembly', kids: 'the aquarium at Flatts', bank: 'a Hamilton bank', watched: 0.4 },
  havana: { scene: 'island', show: 'the Tropicana', fishing: 'marlin off the Morro', beach: 'Varadero', club: 'a bar on the Prado', supper: 'a Vedado restaurant', shop: 'the cigar factories', family: { name: 'the old casino men' }, pol: 'a man from the new government, nervous', kids: 'the Malecón at sunset', watched: 1 },
  rehoboth: { scene: 'beach', show: 'the summer playhouse', track: { name: 'Delaware Park', months: [5, 6, 7] }, fishing: 'surf-casting at Cape Henlopen', golf: 'the Rehoboth country club', beach: 'the Rehoboth boardwalk', club: 'the Pink Pony', supper: 'a dining room on the Avenue', shop: 'the Avenue\'s shops', pol: 'a Washington congressman on his porch', kids: 'Funland on the boardwalk', watched: 0.9 },
  lewes: { scene: 'beach', fishing: 'drum fishing on a party boat', beach: 'Cape Henlopen', supper: 'crabs on the canal', shop: 'Second Street', pol: 'a Sussex County man', kids: 'the old fort towers on the dunes', watched: 0.5 },
  wilmington: { scene: 'city', show: 'a tryout at the Playhouse', track: { name: 'Delaware Park', months: [5, 6, 7] }, golf: 'a Brandywine club', club: 'a Market Street lounge', supper: 'the company hotel\'s dining room', shop: 'Market Street', family: { name: 'Philadelphia\'s men in Delaware', rival: 'philly' }, pol: 'a man from the company', kids: 'the Brandywine Zoo', bank: 'a Delaware trust company', watched: 1 },
  lakegeorge: { scene: 'lake', show: 'the casino pavilion band', fishing: 'lake trout from a guide boat', golf: 'the hotel course on the island', beach: 'Million Dollar Beach', club: 'the casino pavilion', supper: 'the hotel dining room on the island', shop: 'Canada Street', pol: 'an Albany assemblyman at his camp', kids: 'the old fort and Storytown', watched: 0.6 },
  capemay: { scene: 'beach', show: 'a Beach Avenue hotel revue', fishing: 'a party boat out of the harbor', golf: undefined, beach: 'the beach at the Cove', club: 'a hotel bar on Beach Avenue', supper: 'a Victorian hotel dining room', shop: 'Washington Street', pol: 'a Cape May County freeholder', kids: 'the lighthouse and the concrete ship', watched: 0.7 },
};

/** The flavor of a destination (a generic city when it has none written). */
export function flavorOf(d: Dest): Flavor {
  return FLAVOR[d.id] ?? {
    scene: 'city', show: 'the best supper club in town', golf: 'the country club', club: 'the best club in town', supper: 'the steak house everybody goes to', shop: 'the department store downtown',
    family: d.cityId ? { name: `the ${d.name} people`, city: d.cityId } : undefined, pol: 'a city councilman', kids: 'the zoo', watched: 1,
  };
}

export function sceneOf(d: Dest): SceneKind {
  return flavorOf(d).scene;
}

/** Headliners (all invented): a crooner, a comic, a girl singer, a bandleader. */
const HEADLINERS = ['Vic Corsaro', 'Johnny Lamonica', 'Rita Marlowe', 'Sid Pinsker', 'Buddy Kalish', 'Tony Fontaine and his orchestra', 'the Delmar Sisters', 'Lou Castellane'];

/** Who is on the bill this week (deterministic: the place and the week). */
export function headliner(destId: string, week: number): string {
  return HEADLINERS[hashSeed(`${destId}:${week}`) % HEADLINERS.length];
}

interface Base {
  name: string;
  hours: number;
  /** Per traveller ('head') or for the party ('flat'), at the modest tier. */
  cost: number;
  per: 'head' | 'flat';
  tags: ActTag[];
  /** Stress the boss sheds. */
  relief: number;
  /** What it does for each kind of guest. */
  wife?: number;
  kids?: number;
  goomar?: number;
  crew?: number;
  /** Federal heat (scaled by how watched the place is). */
  fed?: number;
}

export const VAC: Record<VacKind, Base> = {
  show: { name: 'See the show', hours: 4, cost: 25, per: 'head', tags: ['nightlife', 'romance'], relief: 4, wife: 3, goomar: 4, crew: 2 },
  track: { name: 'A day at the track', hours: 6, cost: 15, per: 'head', tags: ['gamble', 'sport'], relief: 3, wife: -1, crew: 3, goomar: 1, fed: 1 },
  fishing: { name: 'Deep-sea fishing', hours: 8, cost: 45, per: 'flat', tags: ['private', 'sport'], relief: 6, crew: 3, kids: 3, wife: -1 },
  golf: { name: 'Eighteen holes', hours: 5, cost: 20, per: 'head', tags: ['sport', 'business', 'private'], relief: 3, crew: 1, wife: -1 },
  beach: { name: 'A day on the beach', hours: 6, cost: 3, per: 'head', tags: ['relax', 'family', 'pool'], relief: 5, wife: 2, kids: 4, goomar: 1 },
  nightclub: { name: 'A nightclub', hours: 4, cost: 20, per: 'head', tags: ['nightlife', 'romance'], relief: 3, goomar: 4, crew: 3, wife: 1, fed: 1 },
  supper: { name: 'Dinner at the supper club', hours: 3, cost: 18, per: 'head', tags: ['nightlife', 'family', 'culture'], relief: 3, wife: 3, kids: 2, goomar: 2, crew: 1 },
  shopping: { name: 'Shopping', hours: 4, cost: 60, per: 'flat', tags: ['shopping', 'family', 'romance'], relief: 1, wife: 5, goomar: 5, kids: 2, crew: -1 },
  sitdown: { name: 'A sit-down with the local family', hours: 3, cost: 30, per: 'flat', tags: ['business'], relief: -1, crew: 1, wife: -2, fed: 2 },
  hide: { name: 'Hide some money', hours: 2, cost: 0, per: 'flat', tags: ['business', 'moneymen', 'private'], relief: 2, fed: 1 },
  politician: { name: 'Dinner with a politician', hours: 3, cost: 250, per: 'flat', tags: ['business'], relief: 0, wife: -1, fed: 2 },
  romance: { name: 'A romantic dinner', hours: 4, cost: 35, per: 'flat', tags: ['romance'], relief: 4 },
  kids: { name: 'Take the kids', hours: 6, cost: 6, per: 'head', tags: ['family'], relief: 2, kids: 6, wife: 3, goomar: -2 },
};
export const VAC_KINDS = Object.keys(VAC) as VacKind[];

/* ---------------------------------------------------------------- */
/* Who came along                                                    */
/* ---------------------------------------------------------------- */

export interface VacParty {
  wife?: Character;
  kids: Character[];
  family: Character[];
  goomar?: Character;
  crew: Character[];
  others: Character[];
}

export function vacParty(s: GameState, t: Trip): VacParty {
  const out: VacParty = { kids: [], family: [], crew: [], others: [] };
  for (const c of partyOf(s, t)) {
    if (c.id === t.leaderId) continue;
    const k = guestKind(s, t, c);
    if (k === 'spouse') out.wife = c;
    else if (k === 'kid') out.kids.push(c);
    else if (k === 'family') out.family.push(c);
    else if (k === 'companion') out.goomar = c;
    else if (k === 'crew' || k === 'driver') out.crew.push(c);
    else out.others.push(c);
  }
  return out;
}

/** The boss's own vacation, booked or under way. */
export function bossVacation(s: GameState): Trip | undefined {
  return liveTrips(s).find((t) => t.purpose === 'vacation' && t.leaderId === s.playerId);
}

/* ---------------------------------------------------------------- */
/* The options                                                       */
/* ---------------------------------------------------------------- */

export interface VacOption {
  id: VacKind;
  name: string;
  /** Where (the destination's version). */
  where: string;
  text: string;
  hours: number;
  cost: number;
  /** What it does, in short chips. */
  effects: string[];
  block?: string;
}

function travellers(s: GameState, t: Trip): number {
  return partyOf(s, t).filter((c) => !t.driverIds.includes(c.id)).length;
}

/** How much can be hidden on this trip: the dirty money, up to what the way he travelled can carry. */
export function hideCap(s: GameState, t: Trip): number {
  const o = resolveTransport(t.mode, t.tier, destOf(t), t.transport);
  return Math.max(0, Math.min(s.unwashed, o.cash));
}

export function vacCost(s: GameState, t: Trip, id: VacKind): number {
  const b = VAC[id];
  const mult = TIER_INFO[t.tier].mult;
  if (id === 'hide') return Math.round(hideCap(s, t) * 0.12);
  return Math.round(b.cost * mult * (b.per === 'head' ? travellers(s, t) : 1));
}

/** The month of a day of the stay. */
function monthOn(t: Trip, day: number): number {
  const abs = t.arriveDay + day;
  return addDays(dateOfWeek(Math.floor(abs / 7)), abs % 7).m;
}

function whereOf(d: Dest, f: Flavor, id: VacKind, week: number): string {
  switch (id) {
    case 'show': return `${f.show ?? 'the show'}: ${headliner(d.id, week)}`;
    case 'track': return f.track?.name ?? '';
    case 'fishing': return f.fishing ?? '';
    case 'golf': return f.golf ?? '';
    case 'beach': return f.beach ?? '';
    case 'nightclub': return f.club ?? '';
    case 'supper': return f.supper ?? '';
    case 'shopping': return f.shop ?? '';
    case 'sitdown': return f.family?.name ?? '';
    case 'hide': return f.bank ?? 'a safe-deposit box under another name';
    case 'politician': return f.pol ?? '';
    case 'romance': return f.supper ?? 'a corner table';
    case 'kids': return f.kids ?? '';
  }
}

const TEXT: Record<VacKind, string> = {
  show: 'A ringside table, the late show, and the headliner sends a bottle over after.',
  track: 'A box at the rail. Your bookmakers want to know what you know.',
  fishing: 'A boat, a captain who sees nothing, and nobody listening for forty miles.',
  golf: 'Eighteen holes with men who talk business on the back nine.',
  beach: 'Sand, sunburn, a cabana and ice cream.',
  nightclub: 'A table near the band. The Bureau sometimes sits at the bar.',
  supper: 'The famous room: the maître d\' knows your name by dessert.',
  shopping: 'Gifts: a bracelet, a dress, a new suit, toys.',
  sitdown: 'Espresso in a back room. You came to them; they remember that — and so does the man in the parked car outside.',
  hide: 'Cash where the IRS can\'t count it. It comes back as a "loan", less the fee.',
  politician: 'A long dinner and an envelope. A friend in a place like this is worth a lot — and the Bureau photographs who you eat with.',
  romance: 'A corner table, candles, and the band playing just for the two of you.',
  kids: 'The thing the kids have talked about since the car left Wildwood.',
};

/** Why this can't be done on this day of the stay (undefined: it can). */
export function vacBlock(s: GameState, t: Trip, day: number, id: VacKind, ignoreHours = false): string | undefined {
  const d = destOf(t);
  const f = flavorOf(d);
  const p = vacParty(s, t);
  if (t.purpose !== 'vacation' || t.leaderId !== s.playerId) return 'Only the boss\'s own vacation';
  if (t.over) return 'The trip is over';
  if (day < 0 || day >= t.days.length) return 'Not a day of the stay';
  if (day < t.done) return 'That day is over';
  if (!whereOf(d, f, id, s.week) && id !== 'hide' && id !== 'romance') return `Nothing like that in ${d.name}`;
  if (id === 'track' && f.track?.months && !f.track.months.includes(monthOn(t, day))) return `${f.track.name}: no racing this month`;
  if (id === 'kids' && !p.kids.length) return 'The kids stayed home';
  if (id === 'romance' && !p.wife && !p.goomar) return 'Nobody to take';
  if (id === 'hide' && hideCap(s, t) <= 0) return 'No dirty money to hide';
  const plan = t.vac?.plan[day] ?? [];
  if (plan.includes(id)) return 'Already planned that day';
  if (plan.length >= MAX_EXTRAS) return `At most ${MAX_EXTRAS} things a day`;
  if (!ignoreHours && vacHours(t, day) + VAC[id].hours > VAC_DAY_HOURS) return `Not enough hours left that day (${VAC_DAY_HOURS - vacHours(t, day)}h)`;
  const planned = plannedCost(s, t);
  if (vacCost(s, t, id) + planned > s.money) return `Needs ${'$' + (vacCost(s, t, id) + planned).toLocaleString('en-US')}`;
  return undefined;
}

/** Hours taken on a day of the stay: the itinerary's headline and what is planned. */
export function vacHours(t: Trip, day: number): number {
  return HEADLINE_HOURS + (t.vac?.plan[day] ?? []).reduce((a, id) => a + (VAC[id as VacKind]?.hours ?? 0), 0);
}

/** Money promised to the plans not yet resolved. */
export function plannedCost(s: GameState, t: Trip): number {
  let n = 0;
  (t.vac?.plan ?? []).forEach((ids, day) => { if (day >= t.done) for (const id of ids) n += vacCost(s, t, id as VacKind); });
  return n;
}

function chips(s: GameState, t: Trip, id: VacKind): string[] {
  const b = VAC[id];
  const p = vacParty(s, t);
  const out: string[] = [];
  if (b.relief) out.push(`${b.relief > 0 ? '−' : '+'}${Math.abs(b.relief + (id === 'track' && hasTrait(s.characters[t.leaderId], 'Gambler') ? 3 : 0))} stress`);
  const who = (label: string, v: number | undefined, on: boolean) => { if (v && on) out.push(`${label} ${v > 0 ? '+' : ''}${v}`); };
  who('wife', b.wife, !!p.wife);
  who('kids', b.kids, p.kids.length > 0);
  who(p.goomar?.firstName ?? 'her', b.goomar, !!p.goomar);
  who('crew', b.crew, p.crew.length > 0);
  if (id === 'romance') out.push(p.wife ? `${p.wife.firstName} +8${p.goomar ? `, ${p.goomar.firstName} −4` : ''}` : `${p.goomar?.firstName ?? 'her'} +8`);
  if (id === 'track') out.push('win or lose money');
  if (id === 'sitdown') out.push('standing there +8, the family\'s respect');
  if (id === 'hide') out.push(`hides ${'$' + hideCap(s, t).toLocaleString('en-US')}`);
  if (id === 'politician') out.push('a favor owed');
  if (id === 'show') out.push('renown');
  const fed = Math.round((b.fed ?? 0) * (flavorOf(destOf(t)).watched ?? 1));
  if (fed) out.push(`FBI +${fed}`);
  return out;
}

/** Everything the boss could do on this day of the stay. */
export function vacOptions(s: GameState, t: Trip, day: number): VacOption[] {
  const d = destOf(t);
  const f = flavorOf(d);
  return VAC_KINDS.map((id) => ({
    id, name: VAC[id].name, where: whereOf(d, f, id, s.week) || (id === 'romance' ? 'a corner table' : ''),
    text: TEXT[id], hours: VAC[id].hours, cost: vacCost(s, t, id), effects: chips(s, t, id), block: vacBlock(s, t, day, id),
  }));
}

/* ---------------------------------------------------------------- */
/* Planning (pure)                                                   */
/* ---------------------------------------------------------------- */

function withTrip(s: GameState, tripId: string, f: (t: Trip) => void): GameState {
  if (!s.travel) return s;
  const trips = s.travel.trips.map((t) => {
    if (t.id !== tripId) return t;
    const n: Trip = { ...t, vac: { plan: (t.vac?.plan ?? []).map((x) => [...x]), done: [...(t.vac?.done ?? [])] } };
    f(n);
    return n;
  });
  return { ...s, travel: { ...s.travel, trips } };
}

/** Plan something for a day of the stay (unchanged when it can't be done). */
export function planVac(s: GameState, tripId: string, day: number, id: VacKind): GameState {
  const t = s.travel?.trips.find((x) => x.id === tripId);
  if (!t || vacBlock(s, t, day, id)) return s;
  return withTrip(s, tripId, (n) => {
    while (n.vac!.plan.length <= day) n.vac!.plan.push([]);
    n.vac!.plan[day].push(id);
  });
}

/** Take it off the plan. */
export function unplanVac(s: GameState, tripId: string, day: number, id: VacKind): GameState {
  const t = s.travel?.trips.find((x) => x.id === tripId);
  if (!t || day < t.done || !t.vac?.plan[day]?.includes(id)) return s;
  return withTrip(s, tripId, (n) => { n.vac!.plan[day] = n.vac!.plan[day].filter((x) => x !== id); });
}

/* ---------------------------------------------------------------- */
/* The week resolves it                                              */
/* ---------------------------------------------------------------- */

function note(t: Trip, day: number, act: string, text: string, tone: 'good' | 'bad' | 'neutral' = 'good'): void {
  if (!t.vac) t.vac = { plan: [] };
  if (!t.vac.done) t.vac.done = [];
  t.vac.done.push({ day, act, text, tone });
  if (t.vac.done.length > 40) t.vac.done = t.vac.done.slice(-40);
}

function feel(s: GameState, who: Character | undefined, leaderId: string, v: number | undefined, reason: string): void {
  if (!who || !v) return;
  addOpinion(s, who.id, leaderId, reason, v, 1);
  if (v > 0) addStress(s, who.id, -Math.min(4, v), 'domestic');
}

/** One planned activity, resolved. */
function runAct(ctx: Ctx, t: Trip, day: number, id: VacKind): void {
  const s = ctx.s;
  const tr = T(s);
  const d = destOf(t);
  const f = flavorOf(d);
  const L = s.characters[t.leaderId];
  if (!L?.alive) return;
  const b = VAC[id];
  const p = vacParty(s, t);
  const where = whereOf(d, f, id, s.week) || 'a corner table';
  const label = `${tripLabel(t)}: ${b.name.toLowerCase()}`;
  const abs = t.arriveDay + day;
  const cost = vacCost(s, t, id);
  if (cost > 0 && id !== 'hide') money(ctx, -cost, `${label} (${where})`, 'event');
  const why = `${b.name} in ${d.name}`;
  let relief = b.relief + (id === 'track' && hasTrait(L, 'Gambler') ? 3 : 0) + (id === 'fishing' && hasTrait(L, 'Patient') ? 2 : 0);
  feel(s, p.wife, L.id, b.wife, why);
  for (const k of p.kids) feel(s, k, L.id, b.kids, why);
  for (const k of p.family) feel(s, k, L.id, b.kids ? Math.ceil(b.kids / 2) : undefined, why);
  feel(s, p.goomar, L.id, b.goomar, why);
  for (const c of p.crew) feel(s, c, L.id, b.crew, why);
  const fed = Math.round((b.fed ?? 0) * (f.watched ?? 1));
  let text = '';
  let tone: 'good' | 'bad' | 'neutral' = 'good';
  switch (id) {
    case 'show':
      applyEffects(ctx, [{ type: 'dyn', op: { op: 'renown', amount: 4, reason: `Ringside at ${f.show ?? 'the show'}` }, label }], { label, because: 'saw the show on vacation', category: 'event' });
      text = `${where}. ${headliner(d.id, s.week)} sang "your" song and sent a bottle over after.`;
      break;
    case 'track': {
      const scale = t.tier === 'modest' ? 300 : t.tier === 'first' ? 900 : 2400;
      const amt = Math.round(((rand(tr) - 0.55) * 2 * scale * (hasTrait(L, 'Gambler') ? 1.6 : 1)) / 10) * 10;
      if (amt) money(ctx, amt, `${label}: ${amt > 0 ? 'a long shot came in' : 'the favorites lost'}`, 'event');
      text = amt > 0 ? `${where}: a long shot in the seventh. (+$${amt.toLocaleString('en-US')})` : `${where}: every favorite ran like a mule. (−$${Math.abs(amt).toLocaleString('en-US')})`;
      tone = amt >= 0 ? 'good' : 'bad';
      break;
    }
    case 'fishing': {
      const big = rand(tr) < 0.35;
      if (big) relief += 2;
      text = big ? `${where}: a fish as long as the boat, an hour to land it, and a photograph for the club wall.` : `${where}: a long day, a sunburn, nothing biting, and the best sleep in a year.`;
      break;
    }
    case 'golf':
      if (f.family?.city) applyEffects(ctx, [{ type: 'standing', city: f.family.city, amount: 3, label }], { label, because: 'played golf with the local men', category: 'event' });
      text = `${where}: a hundred and four strokes and an understanding on the sixteenth green.`;
      break;
    case 'beach':
      text = `${where}: ${p.kids.length ? `${p.kids.map((k) => k.firstName).join(' and ')} buried ${L.firstName} up to the neck.` : 'a cabana, a cold beer, and a nap nobody interrupted.'}`;
      break;
    case 'nightclub':
      text = `${where}: a table near the band${p.goomar ? ` and ${p.goomar.firstName} on the dance floor` : ''}. A man at the bar drank ginger ale all night.`;
      break;
    case 'supper':
      applyEffects(ctx, [{ type: 'dyn', op: { op: 'renown', amount: 2, reason: `Dinner at ${where}` }, label }], { label, because: 'dined at the famous room', category: 'event' });
      text = `${where}: the maître d' knew ${L.firstName}'s name by dessert.`;
      break;
    case 'shopping':
      text = `${where}: ${p.wife ? `a bracelet for ${p.wife.firstName}` : p.goomar ? `a bracelet for ${p.goomar.firstName}` : 'a new suit'}${p.kids.length ? ', toys for the kids' : ''}.`;
      break;
    case 'sitdown': {
      const eff: Effect[] = [];
      if (f.family?.city) eff.push({ type: 'standing', city: f.family.city, amount: 8, label });
      if (f.family?.rival) eff.push({ type: 'rivalOpinion', rival: f.family.rival, amount: 6, reason: 'Came to see us on vacation', label });
      eff.push({ type: 'respect', amount: 1, label });
      if (s.heat.federal >= 40) eff.push({ type: 'evidence', charId: L.id, amount: 1, label: `${label}: a photograph of who went in` });
      applyEffects(ctx, eff, { label, because: `sat down with ${f.family?.name ?? 'the local people'} on vacation`, category: 'event' });
      text = `${where}: espresso, anisette, and an understanding. A car with two men in it was parked across the street the whole time.`;
      tone = 'neutral';
      break;
    }
    case 'hide': {
      const amt = hideCap(s, t);
      if (amt > 0) {
        const fee = Math.round(amt * 0.12);
        applyEffects(ctx, [{ type: 'unwashed', amount: -amt, label }, { type: 'money', amount: amt - fee, label: `${label}: it came back as a "loan", less 12%` }], { label, because: 'hid money on vacation', category: 'event' });
        const o = resolveTransport(t.mode, t.tier, d, t.transport);
        if (o.mode === 'plane' && d.abroad) heat(ctx, 'federal', 1, `${label}: customs looked at the briefcase`, 'heat');
        text = `${where}: $${amt.toLocaleString('en-US')} went in a briefcase and came back as a loan from a bank that asks no questions.`;
      }
      break;
    }
    case 'politician': {
      const eff: Effect[] = [{ type: 'favor', amount: 1, label }];
      if (f.family?.city) eff.push({ type: 'standing', city: f.family.city, amount: 4, label });
      if (s.heat.federal >= 30) eff.push({ type: 'evidence', charId: L.id, amount: 1, label: `${label}: the Bureau photographed the dinner` });
      applyEffects(ctx, eff, { label, because: `had dinner with ${where}`, category: 'event' });
      text = `Dinner with ${where}. An envelope under the napkin, a friend for life — and a flashbulb from across the street.`;
      tone = 'neutral';
      break;
    }
    case 'romance': {
      const w = p.wife ?? p.goomar!;
      feel(s, w, L.id, 8, w === p.wife ? 'A second honeymoon' : `A night in ${d.name}`);
      addOpinion(s, L.id, w.id, 'A night to remember', 4, 1);
      if (p.wife && p.goomar) feel(s, p.goomar, L.id, -4, 'He took his wife to dinner');
      text = `${where}: ${L.firstName} and ${w.firstName}, candles, and the band playing just for them.`;
      break;
    }
    case 'kids': {
      const scare = rand(tr) < 0.15;
      text = scare ? `${where}: little ${p.kids[0]?.firstName ?? 'one'} wandered off and was found an hour later, perfectly happy, eating a hot dog. Nobody breathed for that hour.` : `${where}: ${p.kids.map((k) => k.firstName).join(' and ')} will talk about it all winter.`;
      if (scare) relief -= 4;
      break;
    }
  }
  if (relief) addStress(s, L.id, -relief, 'paranoia');
  if (fed > 0) heat(ctx, 'federal', fed, `${label}: the Bureau noticed who ${L.firstName} saw in ${d.name}`, 'heat');
  if (text) {
    note(t, day, id, text, tone);
    journal(s, t, text, tone, abs);
  }
}

/**
 * The planned extras of one day of the stay (travel.ts calls it right after
 * the itinerary's day). Returns a popup when something happens while he is
 * away (at most the trip's one a week).
 */
export function resolveVacDay(ctx: Ctx, t: Trip, day: number): EventInstance[] {
  const s = ctx.s;
  if (t.purpose !== 'vacation' || t.leaderId !== s.playerId || t.over) return [];
  for (const id of t.vac?.plan[day] ?? []) if (VAC[id as VacKind]) runAct(ctx, t, day, id as VacKind);
  // The wife and the goomar on the same trip: a beat every day (vacPlanner.ts; off unless both came).
  const w = wildDay(ctx, t, day);
  if (w) note(t, day, `wild:${w.id}`, w.text, w.tone);
  const ev = awayBeat(ctx, t, day);
  return ev ? [ev] : [];
}

/* ---------------------------------------------------------------- */
/* While he is away                                                  */
/* ---------------------------------------------------------------- */

const TROUBLES = [
  'a bookmaker on Pacific Avenue says he was robbed and wants to stop paying until it\'s settled',
  'two of the crew got into it at the Rendezvous and one of them is in the hospital',
  'the new police captain raided a card game and wants to "meet the owner"',
  'Manno\'s people put a jukebox in one of our bars and won\'t take it out',
  'the union at the boardwalk piers is talking strike the week of the Fourth',
];

function awayBeat(ctx: Ctx, t: Trip, day: number): EventInstance | undefined {
  const s = ctx.s;
  const tr = T(s);
  if (t.askedWeek === s.week) return undefined;
  const L = s.characters[t.leaderId];
  const p = vacParty(s, t);
  const label = tripLabel(t);
  // Someone from home saw him with the wrong woman.
  if (p.goomar && !p.wife && L.spouseId && rand(tr) < 0.12) {
    const who = ['the husband of a lady from St. Ann\'s parish', 'a Wildwood councilman\'s brother-in-law', 'the man who sells your club its linens'][Math.floor(rand(tr) * 3)];
    return tripEvent(s, t, 'spotted', 'A face from home', `${destOf(t).name}, ${['the hotel lobby', 'the next table', 'the beach'][day % 3]}: ${who}, on vacation too, looking at ${L.firstName} and ${p.goomar.firstName} and doing arithmetic.`, [
      { id: 'pay', label: 'Buy his silence ($500)', detail: 'Dinner on you, and an envelope.', because: 'bought a man\'s silence on vacation', effects: [{ type: 'money', amount: -500, label }], disabledReason: s.money < 500 ? 'Needs $500' : undefined },
      { id: 'lean', label: 'Have a word with him', detail: 'He understands. He also tells people you threatened him.', because: 'leaned on a man from home', effects: [{ type: 'heat', bar: 'local', amount: 2, label }, { type: 'respect', amount: 1, label }] },
      { id: 'shrug', label: 'Wave and go back to your drink', detail: 'Half a chance it reaches home before you do.', because: 'let a man from home see', effects: [{ type: 'travel', op: { op: 'gossip', tripId: t.id }, label }] },
    ], [L.id, p.goomar.id]);
  }
  // A call from home.
  const k = actingBoss(s);
  if (k && rand(tr) < 0.1) {
    const trouble = TROUBLES[Math.floor(rand(tr) * TROUBLES.length)];
    return tripEvent(s, t, 'call', 'A call from home', `The front desk: long distance from Wildwood. ${displayName(k)}, sounding tired: ${trouble}.`, [
      { id: 'trust', label: `"You handle it, ${k.firstName}."`, detail: 'He runs things; let him run them.', because: `let ${k.firstName} handle it`, effects: [{ type: 'opinion', from: k.id, to: L.id, amount: 6, reason: 'Trusted me to handle it', decay: 1, label }, { type: 'meter', from: k.id, to: L.id, meter: 'trust', amount: 4, label }] },
      { id: 'phone', label: 'Handle it from the hotel phone', detail: 'An hour of long distance and a ruined afternoon.', because: 'ran things from the hotel phone', effects: [{ type: 'dyn', op: { op: 'stress', charId: L.id, amount: 5, source: 'paranoia' }, label }, { type: 'respect', amount: 1, label }, { type: 'heat', bar: 'local', amount: -1, label }] },
      { id: 'home', label: 'Pack up and go home', detail: 'The vacation is over; the family will not forget it.', because: 'cut the vacation short for business', effects: [{ type: 'travel', op: { op: 'cutShort', tripId: t.id }, label }, { type: 'familyOpinion', amount: -2, reason: 'Cut the vacation short for business', label }] },
    ], [k.id, L.id]);
  }
  return undefined;
}

/** Is a destination lost to history on this date (Havana: the casinos gone in 1959, closed to Americans in 1961)? */
export function lostDest(destId: string, d: { y: number }): string | undefined {
  if (destId !== 'havana') return undefined;
  return d.y >= 1961 ? 'Lost: closed to Americans since January 1961' : 'The casinos are gone since the revolution (January 1959). The last season, maybe.';
}

/** Kids under 16 along (for the UI's "who came"). */
export function isKid(s: GameState, c: Character): boolean {
  return ageOn(c.birth, s.date) < 16;
}
