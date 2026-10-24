import type { GameState } from './types';

/**
 * The underworld map of America, 1960. Every family here is fictional; real
 * cities are only the backdrop. Owners group into the map legend: you,
 * Philadelphia, the Atlantic City crew, New York money, other families,
 * and the unclaimed. Havana: Castro has just closed the casinos, and the
 * exiled casino men are looking for a new home.
 */

export type OwnerGroup = 'player' | 'philly' | 'manno' | 'newyork' | 'other' | 'unclaimed' | 'exiles';

export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  owner: string;
  group: OwnerGroup;
  boss: string;
  rackets: string[];
  /** Envoy resistance (higher is harder). */
  difficulty: number;
  /** Weekly cut of a partnership (a franchise pays more). */
  income: number;
  /** Inside South Jersey: no permission needed from Philadelphia. */
  southJersey?: boolean;
  flavor: string;
}

export const CITY_LIST: City[] = [
  { id: 'wildwood', name: 'Wildwood', lat: 38.9918, lon: -74.8149, region: 'Jersey Shore', owner: 'You', group: 'player', boss: 'your house', rackets: ['Clubs', 'Numbers', 'Books', 'Boardwalk'], difficulty: 0, income: 0, southJersey: true, flavor: 'Little Las Vegas. Neon on Pacific Avenue and summer money on the boards.' },
  { id: 'capemay', name: 'Cape May', lat: 38.9351, lon: -74.906, region: 'Jersey Shore', owner: 'Unclaimed', group: 'unclaimed', boss: 'nobody', rackets: ['Hotel card games', 'Summer gamblers'], difficulty: 15, income: 180, southJersey: true, flavor: 'Victorian hotels, quiet money, summer gamblers.' },
  { id: 'oceancity', name: 'Ocean City', lat: 39.2776, lon: -74.5746, region: 'Jersey Shore', owner: 'Unclaimed', group: 'unclaimed', boss: 'nobody', rackets: ['Bookmaking', 'Vending'], difficulty: 20, income: 160, southJersey: true, flavor: 'A dry Methodist town. Thirsty people pay well.' },
  { id: 'ac', name: 'Atlantic City', lat: 39.3643, lon: -74.4229, region: 'Jersey Shore', owner: 'Atlantic City Crew', group: 'manno', boss: 'Carmine Manno', rackets: ['Inlet clubs', 'Numbers', 'Loansharking'], difficulty: 45, income: 450, southJersey: true, flavor: 'Faded queen of the resorts. Manno\'s home turf.' },
  { id: 'vineland', name: 'Vineland', lat: 39.4864, lon: -75.026, region: 'South Jersey', owner: 'Philadelphia Family', group: 'philly', boss: 'a Camden capo', rackets: ['Egg-farm numbers', 'Trucking'], difficulty: 25, income: 200, southJersey: true, flavor: 'Poultry farms and glass works. Philadelphia collects here.' },
  { id: 'camden', name: 'Camden', lat: 39.9259, lon: -75.1196, region: 'South Jersey', owner: 'Philadelphia Family', group: 'philly', boss: 'Leo Carbone', rackets: ['Shipyard rackets', 'Numbers', 'Labor'], difficulty: 40, income: 350, southJersey: true, flavor: 'Philadelphia\'s backyard. Tread carefully.' },
  { id: 'philadelphia', name: 'Philadelphia', lat: 39.9526, lon: -75.1652, region: 'Delaware Valley', owner: 'Philadelphia Family', group: 'philly', boss: 'the old man (Bruno\'s family)', rackets: ['Everything'], difficulty: 80, income: 600, flavor: 'The old man rules here. No narcotics. No noise.' },
  { id: 'newark', name: 'Newark', lat: 40.7357, lon: -74.1724, region: 'Northeast', owner: 'The DeAngelis Crew', group: 'newyork', boss: 'Augie DeAngelis', rackets: ['Docks', 'Policy', 'Garbage carting'], difficulty: 45, income: 380, flavor: 'Port Newark and the policy banks of the Ironbound.' },
  { id: 'newyork', name: 'New York', lat: 40.7128, lon: -74.006, region: 'Northeast', owner: 'The Marchetti Family', group: 'newyork', boss: 'Gaetano Marchetti', rackets: ['Garment center', 'Waterfront', 'Casino points'], difficulty: 70, income: 700, flavor: 'Where Feldstein\'s money comes from. Everybody wants a piece; few get one.' },
  { id: 'boston', name: 'Boston', lat: 42.3601, lon: -71.0589, region: 'Northeast', owner: 'The Corrigan Gang', group: 'other', boss: 'Francis Corrigan', rackets: ['Bookmaking', 'Liquor', 'Loansharking'], difficulty: 50, income: 380, flavor: 'Irish gangs in Southie, Italians in the North End, and a truce nobody trusts.' },
  { id: 'providence', name: 'Providence', lat: 41.824, lon: -71.4128, region: 'Northeast', owner: 'The Ianucci Family', group: 'other', boss: 'Rocco Ianucci', rackets: ['Jewelry fencing', 'Vending'], difficulty: 45, income: 320, flavor: 'Costume jewelry factories and a fence on every corner.' },
  { id: 'buffalo', name: 'Buffalo', lat: 42.8864, lon: -78.8784, region: 'Northeast', owner: 'The Lazzara Family', group: 'other', boss: 'Pietro Lazzara', rackets: ['Border smuggling', 'Labor'], difficulty: 45, income: 300, flavor: 'Snow, steel, and the Canadian border at the end of the Peace Bridge.' },
  { id: 'pittsburgh', name: 'Pittsburgh', lat: 40.4406, lon: -79.9959, region: 'Northeast', owner: 'The Ferrante Family', group: 'other', boss: 'Nunzio Ferrante', rackets: ['Numbers', 'Steelworker loans'], difficulty: 40, income: 320, flavor: 'Mill towns along three rivers. Payday is every Friday.' },
  { id: 'baltimore', name: 'Baltimore', lat: 39.2904, lon: -76.6122, region: 'Mid-Atlantic', owner: 'The Patapsco Crew', group: 'other', boss: 'Harry Kalb', rackets: ['Docks', 'Pimlico books'], difficulty: 35, income: 380, flavor: 'The docks and the race track at Pimlico.' },
  { id: 'washington', name: 'Washington', lat: 38.9072, lon: -77.0369, region: 'Mid-Atlantic', owner: 'Unclaimed — too many feds', group: 'unclaimed', boss: 'nobody', rackets: ['Lobbying', 'Favors'], difficulty: 55, income: 250, flavor: 'No family runs the capital. Friends there are worth more than money.' },
  { id: 'cleveland', name: 'Cleveland', lat: 41.4993, lon: -81.6944, region: 'Midwest', owner: 'The Kovacs Syndicate', group: 'other', boss: 'Geza Kovacs', rackets: ['Casino points', 'Teamsters'], difficulty: 50, income: 400, flavor: 'The Syndicate money that built half of Las Vegas started here.' },
  { id: 'detroit', name: 'Detroit', lat: 42.3314, lon: -83.0458, region: 'Midwest', owner: 'The Lakeshore Combination', group: 'other', boss: 'Vito Brancato', rackets: ['Auto-plant numbers', 'Labor'], difficulty: 55, income: 420, flavor: 'Assembly lines, union halls, and the numbers in every plant.' },
  { id: 'chicago', name: 'Chicago', lat: 41.8781, lon: -87.6298, region: 'Midwest', owner: 'The Midway Outfit', group: 'other', boss: 'Tony Varrone', rackets: ['Everything west of Ohio'], difficulty: 75, income: 650, flavor: 'They run Las Vegas from here. They do not share.' },
  { id: 'newport', name: 'Newport, KY', lat: 39.0914, lon: -84.4958, region: 'Midwest', owner: 'The Licking River Syndicate', group: 'other', boss: 'Red Mahaffey', rackets: ['Wide-open casinos', 'Clubs'], difficulty: 35, income: 420, flavor: 'Sin City across the river from Cincinnati. The reformers are coming.' },
  { id: 'kc', name: 'Kansas City', lat: 39.0997, lon: -94.5786, region: 'Midwest', owner: 'The Missouri River Family', group: 'other', boss: 'Joe Pettit', rackets: ['Stockyards', 'Las Vegas skim'], difficulty: 50, income: 380, flavor: 'Steaks, jazz, and a quiet piece of the desert money.' },
  { id: 'hotsprings', name: 'Hot Springs', lat: 34.5037, lon: -93.0552, region: 'South', owner: 'The Spa City Combine', group: 'other', boss: 'Lew Barlow', rackets: ['Illegal casinos', 'Racing'], difficulty: 30, income: 360, flavor: 'Bathhouses, illegal casinos, and a sheriff who looks the other way.' },
  { id: 'neworleans', name: 'New Orleans', lat: 29.9511, lon: -90.0715, region: 'South', owner: 'The Delacroix Family', group: 'other', boss: 'Henri Delacroix', rackets: ['Slot machines', 'Racing wire'], difficulty: 55, income: 420, flavor: 'The oldest family in America, and the slot machines of the whole Gulf Coast.' },
  { id: 'tampa', name: 'Tampa', lat: 27.9506, lon: -82.4572, region: 'South', owner: 'The Ybor City Family', group: 'other', boss: 'Enzo Ricci', rackets: ['Bolita', 'Cuban money'], difficulty: 45, income: 340, flavor: 'Cigar factories and bolita. Half of Havana\'s money came home through here.' },
  { id: 'miami', name: 'Miami', lat: 25.7617, lon: -80.1918, region: 'South', owner: 'The Biscayne Group', group: 'newyork', boss: 'Morris Stahl', rackets: ['Hotels', 'Exile money', 'Bookmaking'], difficulty: 35, income: 400, flavor: 'Beach hotels and Cuban money looking for a home.' },
  { id: 'havana', name: 'Havana', lat: 23.1136, lon: -82.3666, region: 'Offshore', owner: 'Exiled casino men', group: 'exiles', boss: 'the men Castro threw out', rackets: ['Exiled casino know-how', 'Hidden accounts'], difficulty: 60, income: 300, flavor: 'Castro closed the casinos and seized the hotels. The men who ran them are in Miami hotel rooms, looking for a new place to deal cards.' },
  { id: 'vegas', name: 'Las Vegas', lat: 36.1699, lon: -115.1398, region: 'West', owner: 'The Silver Strip Partners', group: 'other', boss: 'Sid Wexler', rackets: ['Casino points', 'The skim'], difficulty: 55, income: 600, flavor: 'A points share in a Strip casino — if the Chicago people allow it.' },
  { id: 'reno', name: 'Reno', lat: 39.5296, lon: -119.8138, region: 'West', owner: 'The Truckee Club', group: 'other', boss: 'Dutch Ahlberg', rackets: ['Casinos', 'Divorce trade'], difficulty: 40, income: 340, flavor: 'The Biggest Little City. Six-week divorces and legal craps.' },
  { id: 'la', name: 'Los Angeles', lat: 34.0522, lon: -118.2437, region: 'West', owner: 'The Angelino Brothers', group: 'other', boss: 'Frank Angelino', rackets: ['Studios', 'Bookmaking'], difficulty: 50, income: 420, flavor: 'Movie money and bookmakers on Sunset.' },
];

export const CITIES_BY_ID: Record<string, City> = Object.fromEntries(CITY_LIST.map((c) => [c.id, c]));

export const GROUP_LABEL: Record<OwnerGroup, string> = {
  player: 'You', philly: 'Philadelphia Family', manno: 'Atlantic City Crew', newyork: 'New York Money', other: 'Other families', unclaimed: 'Unclaimed', exiles: 'Havana exiles',
};

/** Your standing in a city (0 = a stranger). */
export function standing(s: GameState, cityId: string): number {
  return s.cityStanding?.[cityId] ?? 0;
}

export function stake(s: GameState, cityId: string): string {
  if (cityId === 'wildwood') return 'Home';
  const o = s.outposts.find((x) => x.city === cityId);
  if (o) return o.kind === 'franchise' ? `A franchise (${'$' + o.income}/wk)` : o.kind === 'partner' ? `A partnership (${'$' + o.income}/wk)` : 'A contact';
  const st = standing(s, cityId);
  return st > 0 ? `Known there (standing ${st})` : 'None';
}

/** Going outside South Jersey needs Philadelphia's blessing. */
export function needsPermission(c: City): boolean {
  return !c.southJersey;
}

export function hasPermission(s: GameState, cityId: string): boolean {
  return (s.permits?.[cityId] ?? 0) >= s.week;
}
