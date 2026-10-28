import { compareDates } from './calendar';
import { fare, legDays, MODES, roadMiles, type Dest } from './travelDests';
import type { BudgetTier, TravelMode } from './travelState';
import type { GameDate } from './types';

/**
 * Planes, trains, automobiles — and boats. Each travel MODE (travelDests.ts)
 * comes in concrete 1960 ways to go, and each way has its own door-to-door
 * hours, price, comfort, privacy (who sees you), risks (a tail, a trooper,
 * the Bureau at the airport, your name on a manifest, the weather) and what
 * can come along (bodyguards, cash, guns, a companion).
 *
 * Period notes (kept honest on purpose):
 * - Wildwood still had trains in 1960: the Pennsylvania-Reading Seashore
 *   Lines ran to Camden; from Philadelphia (30th Street) or Trenton the
 *   Pennsylvania Railroad goes everywhere. The Jersey Central's shore line
 *   ends at Bay Head and runs to the Jersey City terminal and the ferry.
 * - Jets were new: Boeing 707s and DC-8s on the big routes (Idlewild and
 *   Philadelphia to Miami, Los Angeles, Rome); Constellations, DC-6s, DC-7s,
 *   Electras and Viscounts everywhere else; Allegheny's Convairs hopped out
 *   of Bader Field in Atlantic City. Nobody screened bags before 1973.
 * - Delaware: the river ferries (Wilmington–Penns Grove, New Castle–
 *   Pennsville) stopped when the Delaware Memorial Bridge opened in 1951.
 *   The Cape May–Lewes Ferry did not sail until July 1964 — before then you
 *   go around by the bridge (a long drive) or hire a fishing captain to run
 *   you across the mouth of the bay.
 */

export type TransportId =
  | 'caddy' | 'crewcar' | 'chauffeur'
  | 'prr_club' | 'prr_coach' | 'cnj'
  | 'greyhound' | 'shortline'
  | 'fly_phl' | 'fly_idlewild' | 'fly_bader'
  | 'liner' | 'charter' | 'ferry';

export type Guns = 'yes' | 'luggage' | 'no';

export interface TransportOpt {
  id: TransportId;
  mode: TravelMode;
  name: string;
  /** Who runs it (the line, the airline, the captain). */
  carrier: string;
  blurb: string;
  /** Comfort 0-1 (overrides the mode's). */
  comfort: number;
  /** 0-1: 1 = nobody sees who you are with. */
  privacy: number;
  /** Multipliers on the mode's tail, sighting (the Feds) and accident odds. */
  tailMult: number;
  seenMult: number;
  accMult: number;
  /** Chance per leg a state trooper pulls the car over (before local heat). */
  stop: number;
  /** Chance per leg the weather costs a day (doubled in winter and storm months). */
  weather: number;
  /** Your name goes on a list (a manifest, a Pullman reservation). */
  manifest: boolean;
  /** Bodyguards (crew guests) who can come. */
  guards: number;
  /** Seats for everybody in the party (undefined: no limit that matters). */
  seats?: number;
  /** Cash you can carry without it being a problem. */
  cash: number;
  guns: Guns;
  /** How a companion travels this way. */
  companion: string;
  /** Multiplier on the wife-finds-out odds. */
  discovery: number;
}

const T = (o: TransportOpt) => o;

export const TRANSPORT: Record<TransportId, TransportOpt> = {
  caddy: T({ id: 'caddy', mode: 'cars', name: 'Your Cadillac', carrier: 'You at the wheel', blurb: 'The \'59 Coupe de Ville, you driving. Nobody else needed — but every trooper from here to the bridge knows the plates.', comfort: 0.65, privacy: 0.9, tailMult: 1.3, seenMult: 0.6, accMult: 1.2, stop: 0.06, weather: 0, manifest: false, guards: 3, seats: 6, cash: 100000, guns: 'yes', companion: 'Front seat, nobody looking', discovery: 0.8 }),
  crewcar: T({ id: 'crewcar', mode: 'cars', name: 'Crew cars', carrier: 'Your men drive', blurb: 'A convoy of Cadillacs with crew at the wheel: bodyguards built in. Slow, private, and it can be tailed.', comfort: 0.6, privacy: 0.75, tailMult: 1, seenMult: 1, accMult: 1, stop: 0.05, weather: 0, manifest: false, guards: 8, cash: 150000, guns: 'yes', companion: 'Her own car, if you want it quiet', discovery: 1 }),
  chauffeur: T({ id: 'chauffeur', mode: 'cars', name: 'A hired driver', carrier: 'A Wildwood livery Lincoln', blurb: 'A limousine and a driver from the livery on Pacific Avenue. Comfortable, and a car nobody knows — but a hired man has eyes and a mouth.', comfort: 0.8, privacy: 0.5, tailMult: 0.8, seenMult: 0.7, accMult: 0.8, stop: 0.03, weather: 0, manifest: false, guards: 2, seats: 5, cash: 50000, guns: 'yes', companion: 'The driver sees everything', discovery: 1.25 }),
  prr_club: T({ id: 'prr_club', mode: 'train', name: 'Club car & Pullman', carrier: 'Seashore Lines to Camden, then the Pennsylvania Railroad', blurb: 'A parlor seat, a drink in the club car, a Pullman berth at night. The reservation is in your name, and the club car is full of people who know faces.', comfort: 0.8, privacy: 0.4, tailMult: 1, seenMult: 1, accMult: 1, stop: 0, weather: 0.01, manifest: true, guards: 4, cash: 50000, guns: 'luggage', companion: 'A compartment of her own, two cars down', discovery: 1 }),
  prr_coach: T({ id: 'prr_coach', mode: 'train', name: 'Coach', carrier: 'Seashore Lines to Camden, then the Pennsylvania Railroad', blurb: 'A coach seat and a newspaper. Cheap, anonymous enough, and a long night sitting up.', comfort: 0.55, privacy: 0.6, tailMult: 1, seenMult: 1, accMult: 1, stop: 0, weather: 0.01, manifest: false, guards: 4, cash: 20000, guns: 'luggage', companion: 'A seat across the aisle', discovery: 1 }),
  cnj: T({ id: 'cnj', mode: 'train', name: 'Jersey Central', carrier: 'Central Railroad of New Jersey', blurb: 'Drive up to Bay Head, then the Jersey Central\'s shore line to the Jersey City terminal and the ferry across to Liberty Street.', comfort: 0.55, privacy: 0.65, tailMult: 0.9, seenMult: 0.8, accMult: 1, stop: 0.02, weather: 0.02, manifest: false, guards: 4, cash: 20000, guns: 'luggage', companion: 'A seat across the aisle', discovery: 1 }),
  greyhound: T({ id: 'greyhound', mode: 'bus', name: 'Greyhound', carrier: 'Greyhound out of the Wildwood terminal', blurb: 'Greyhound, changing in Philadelphia. Cheap, slow and anonymous: nobody on a bus is anybody.', comfort: 0.35, privacy: 0.85, tailMult: 1, seenMult: 1, accMult: 1, stop: 0, weather: 0.02, manifest: false, guards: 3, cash: 10000, guns: 'luggage', companion: 'Two rows back', discovery: 0.9 }),
  shortline: T({ id: 'shortline', mode: 'bus', name: 'Short Line bus', carrier: 'Short Line from the Port Authority', blurb: 'Up to New York, then the Short Line coach to the mountains — the same bus the waiters and the comics take.', comfort: 0.4, privacy: 0.8, tailMult: 1, seenMult: 0.9, accMult: 1, stop: 0, weather: 0.03, manifest: false, guards: 3, cash: 10000, guns: 'luggage', companion: 'Two rows back', discovery: 0.9 }),
  fly_phl: T({ id: 'fly_phl', mode: 'plane', name: 'Philadelphia International', carrier: 'Eastern, National, TWA, American', blurb: 'Two hours up to the airport, then the flight. The Feds keep a man at the gate, and the passenger list has your name on it.', comfort: 0.85, privacy: 0.3, tailMult: 1, seenMult: 1, accMult: 1, stop: 0, weather: 0.03, manifest: true, guards: 3, cash: 25000, guns: 'luggage', companion: 'A seat on the next flight', discovery: 1 }),
  fly_idlewild: T({ id: 'fly_idlewild', mode: 'plane', name: 'Idlewild', carrier: 'Pan Am, TWA, Eastern, National', blurb: 'The long drive to New York for the jets: more flights and lower fares — and the Bureau\'s New York office watches Idlewild.', comfort: 0.9, privacy: 0.25, tailMult: 1, seenMult: 1.15, accMult: 1, stop: 0, weather: 0.03, manifest: true, guards: 3, cash: 25000, guns: 'luggage', companion: 'A seat on the next flight', discovery: 1.1 }),
  fly_bader: T({ id: 'fly_bader', mode: 'plane', name: 'Bader Field, Atlantic City', carrier: 'Allegheny Airlines', blurb: 'The little airfield by the inlet: an Allegheny Convair hop to Philadelphia or Newark and a connection. Nobody federal watches Bader — but Manno\'s people do.', comfort: 0.7, privacy: 0.5, tailMult: 1, seenMult: 0.6, accMult: 1.3, stop: 0, weather: 0.06, manifest: true, guards: 2, cash: 25000, guns: 'luggage', companion: 'A seat on the hop', discovery: 1 }),
  liner: T({ id: 'liner', mode: 'ship', name: 'An ocean liner', carrier: 'From the West Side piers', blurb: 'A liner from the West Side piers or a cruise ship out of Miami. Slow, grand, and the purser keeps a passenger list.', comfort: 0.95, privacy: 0.6, tailMult: 1, seenMult: 1, accMult: 1, stop: 0, weather: 0.04, manifest: true, guards: 4, cash: 100000, guns: 'luggage', companion: 'A stateroom on another deck', discovery: 1 }),
  charter: T({ id: 'charter', mode: 'ship', name: 'A charter boat', carrier: 'A fishing captain out of Cape May harbor', blurb: 'A party boat captain runs you across the mouth of the bay to Lewes: two hours of open water, no list, no questions — and no crossing if the fog comes in.', comfort: 0.5, privacy: 0.95, tailMult: 0, seenMult: 0.1, accMult: 3, stop: 0, weather: 0.12, manifest: false, guards: 3, seats: 6, cash: 100000, guns: 'yes', companion: 'Nobody aboard but the captain', discovery: 0.6 }),
  ferry: T({ id: 'ferry', mode: 'ship', name: 'The Cape May–Lewes Ferry', carrier: 'The Delaware River & Bay Authority', blurb: 'Drive aboard at North Cape May, seventy minutes across the bay, drive off in Lewes. A crowded deck full of shore people.', comfort: 0.7, privacy: 0.5, tailMult: 0.5, seenMult: 0.3, accMult: 0.5, stop: 0.02, weather: 0.04, manifest: false, guards: 8, cash: 100000, guns: 'yes', companion: 'The crowd on the deck', discovery: 1.2 }),
};

export const TRANSPORT_IDS = Object.keys(TRANSPORT) as TransportId[];

/** The Cape May–Lewes Ferry's first sailing. */
export const FERRY_OPENS: GameDate = { y: 1964, m: 7, d: 1 };
export function ferryOpen(d: GameDate): boolean {
  return compareDates(d, FERRY_OPENS) >= 0;
}

/** Destinations you can only reach over water from Cape May (or the long way round by the bridge). */
export function overBay(d: Dest): boolean {
  return !!d.waterMi;
}

const NY_STATE = new Set(['catskills', 'saratoga', 'lakegeorge', 'newyork']);
const NYC = new Set(['newyork', 'newark']);

/** Why this way doesn't go there (undefined: it does). */
export function transportBlock(id: TransportId, d: Dest, date: GameDate): string | undefined {
  const o = TRANSPORT[id];
  if (!o) return 'No such way to go';
  if (!d.modes.includes(o.mode)) return o.mode === 'ship' ? 'No boat goes there' : o.mode === 'plane' ? 'No airport near there' : 'No road or rail line goes there';
  if (id === 'cnj' && !NYC.has(d.id)) return 'The Jersey Central only goes to New York';
  if (id === 'shortline' && !NY_STATE.has(d.id)) return 'Short Line runs to New York and the mountains';
  if (o.mode === 'ship') {
    if (overBay(d)) {
      if (id === 'liner') return 'No liner crosses the bay';
      if (id === 'ferry' && !ferryOpen(date)) return 'The Cape May–Lewes Ferry doesn\'t sail until July 1964';
    } else if (id !== 'liner') return 'Only across the bay to Delaware';
  }
  return undefined;
}

/** The ways that go there on this date. */
export function transportsFor(d: Dest, mode: TravelMode, date: GameDate): TransportId[] {
  return TRANSPORT_IDS.filter((id) => TRANSPORT[id].mode === mode && !transportBlock(id, d, date));
}

/** The way a plan goes when it names none (the old, pre-choice behavior: same price and odds). */
export function defaultTransport(mode: TravelMode, tier: BudgetTier, d?: Dest): TransportId {
  switch (mode) {
    case 'cars': return 'crewcar';
    case 'train': return tier === 'modest' ? 'prr_coach' : 'prr_club';
    case 'bus': return 'greyhound';
    case 'plane': return 'fly_phl';
    case 'ship': return d && overBay(d) ? 'charter' : 'liner';
  }
}

/** The option a plan really uses (its own, if valid for the mode, else the default). */
export function resolveTransport(mode: TravelMode, tier: BudgetTier, d: Dest | undefined, id?: string): TransportOpt {
  const o = id ? TRANSPORT[id as TransportId] : undefined;
  return o && o.mode === mode ? o : TRANSPORT[defaultTransport(mode, tier, d)];
}

/** Road miles from Wildwood (the dest's own when the straight line lies: Delaware by the bridge). */
export function roadOf(d: Dest): number {
  return d.roadMi ?? roadMiles(d.miles);
}

/** The miles the fare and leg tables should see (they add the road factor themselves). */
function tableMiles(d: Dest, mode: TravelMode): number {
  return (mode === 'cars' || mode === 'bus' || mode === 'train') && d.roadMi ? Math.round(d.roadMi / 1.25) : d.miles;
}

/** Days one way. */
export function optLegDays(o: TransportOpt, d: Dest): number {
  if (o.id === 'charter' || o.id === 'ferry') return 1;
  return legDays(o.mode, tableMiles(d, o.mode));
}

/** One-way fare per traveller (cars: per car), 1960 dollars. */
export function optFare(o: TransportOpt, d: Dest, tier: BudgetTier): number {
  const m = tableMiles(d, o.mode);
  switch (o.id) {
    case 'caddy': return Math.round(0.035 * roadOf(d) + 6 * optLegDays(o, d));
    case 'chauffeur': return Math.round(0.035 * roadOf(d) + 15 * optLegDays(o, d) + 28 * optLegDays(o, d) + 10);
    case 'prr_club': return fare('train', m, tier === 'modest' ? 'first' : tier);
    case 'prr_coach': return fare('train', m, 'modest');
    case 'cnj': return Math.round(fare('train', m, 'modest') * 0.85);
    case 'shortline': return Math.round(fare('bus', m, tier) * 1.1);
    case 'fly_idlewild': return Math.round(fare('plane', m, tier) * 0.95);
    case 'fly_bader': return Math.round(fare('plane', m, tier) * 1.15 + 9);
    case 'charter': return tier === 'modest' ? 12 : 20;
    case 'ferry': return 2;
    default: return fare(o.mode, m, tier);
  }
}

/** The plane you get, 1960: jets on the big routes from the big airports, propliners elsewhere. */
export function aircraft(o: TransportOpt, d: Dest): string {
  if (o.mode !== 'plane') return '';
  const jet = o.id !== 'fly_bader' && d.miles >= 900;
  if (o.id === 'fly_bader') return 'an Allegheny Convair 440, then a connection';
  if (d.id === 'oldcountry') return 'a Pan Am Boeing 707 to Rome';
  if (d.id === 'bermuda') return 'a Pan Am DC-7C';
  if (d.id === 'havana') return 'a Cubana Viscount out of Miami';
  if (d.id === 'montreal') return 'a Trans-Canada Viscount';
  if (d.id === 'acapulco') return 'a DC-6B by way of Mexico City';
  if (d.lon < -100) return jet ? 'a TWA Boeing 707' : 'a TWA Constellation';
  if (d.region === 'Florida' || d.cityId === 'miami' || d.cityId === 'tampa') return jet ? (o.id === 'fly_idlewild' ? 'a National Boeing 707' : 'an Eastern DC-8') : 'an Eastern Electra';
  if (jet) return o.id === 'fly_idlewild' ? 'an American Boeing 707' : 'a United DC-8';
  return d.miles > 400 ? 'an Eastern Super Constellation' : 'a Capital Viscount';
}

/** Door-to-door hours one way (Wildwood to the hotel). */
export function legHours(o: TransportOpt, d: Dest): number {
  const road = roadOf(d);
  const r = (h: number) => Math.round(h * 4) / 4;
  switch (o.mode) {
    case 'cars': return r(road / (o.id === 'crewcar' ? 42 : 44) + 0.5);
    case 'bus': return r(road / 33 + 0.75 + Math.floor(road / 300));
    case 'train': {
      if (o.id === 'cnj') return r(2.5 + Math.max(1.5, (road - 120) / 40) + 0.5);
      // The Seashore Lines to Camden (2½ hours), across the river, then the main line.
      return r(2.5 + 0.5 + Math.max(0, road - 85) / 48 + (road > 85 ? 0.75 : 0));
    }
    case 'plane': {
      const toPort = o.id === 'fly_idlewild' ? 3.75 : o.id === 'fly_bader' ? 1 : 2.25;
      const speed = aircraft(o, d).match(/707|DC-8/) ? 470 : 270;
      return r(toPort + 1 + d.miles / speed + (o.id === 'fly_bader' ? 1.5 : 0) + 0.75);
    }
    case 'ship': {
      if (o.id === 'charter') return r(0.5 + (d.waterMi ?? 20) / 14 + 0.25 + (d.landMi ?? 0) / 35);
      if (o.id === 'ferry') return r(0.5 + 1.25 + 0.25 + (d.landMi ?? 0) / 35);
      return r(3.75 + d.miles / 21);
    }
  }
}

/** Hours of the boss's day the departure takes (the clock: at most a day). */
export function departureHours(o: TransportOpt, d: Dest, travelDay: number): number {
  return Math.min(travelDay, Math.max(2, legHours(o, d)));
}

export interface TransportRisks {
  /** Per leg. (A manifest is its own risk: the list ends up on a desk in the Federal Building, see manifestChance.) */
  tail: number;
  seen: number;
  accident: number;
  stop: number;
  weather: number;
}

/** Bad months for planes and boats: the winter, and the dest's hurricane months. */
export function badWeather(d: Dest, month: number): boolean {
  return [12, 1, 2, 3].includes(month) || (d.storms ?? []).includes(month);
}

/** The per-leg odds for this way to go (fed: federal heat, local: local heat, evid: the leader's file). */
export function transportRisks(o: TransportOpt, d: Dest, month: number, fed: number, local: number, evid: number, cars = 1, guards = 0): TransportRisks {
  const m = MODES[o.mode];
  const acc = o.mode === 'cars' ? 1 - (1 - m.accident) ** Math.max(1, cars) : m.accident;
  return {
    tail: Math.min(0.9, m.tail * o.tailMult * (0.4 + fed / 60) * (evid >= 40 ? 1.5 : 1)),
    seen: Math.min(0.9, m.conspicuous * o.seenMult * (fed / 100) * 0.5),
    accident: Math.min(0.5, acc * o.accMult),
    stop: o.mode === 'cars' || o.id === 'ferry' ? Math.min(0.4, o.stop + local / 500 + guards * 0.01) : 0,
    weather: Math.min(0.5, o.weather * (badWeather(d, month) ? 2 : 1)),
  };
}

/** One line on what can come along. */
export function carryLine(o: TransportOpt): string {
  const guns = o.guns === 'yes' ? 'guns: under the seat' : o.guns === 'luggage' ? 'guns: in a suitcase (nobody checks bags in 1960)' : 'no guns';
  return `${o.guards} bodyguard${o.guards === 1 ? '' : 's'}${o.seats ? ` · ${o.seats} seats` : ''} · cash up to $${o.cash.toLocaleString('en-US')} · ${guns} · companion: ${o.companion.toLowerCase()}`;
}

/** How well bodyguards work with what they could bring (1 = armed). */
export function gunFactor(o: TransportOpt): number {
  return o.guns === 'yes' ? 1 : o.guns === 'luggage' ? 0.75 : 0.4;
}

/** Chance per leg a passenger list with your name reaches the Bureau. */
export function manifestChance(o: TransportOpt, fed: number): number {
  return o.manifest ? Math.min(0.4, 0.15 * fed / 50) : 0;
}
