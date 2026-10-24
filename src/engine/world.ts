import type { FactionId, RivalGoal, RivalId } from './types';

export interface DistrictDef {
  id: string;
  name: string;
  streetBase: number;
  description: string;
  core: boolean;
}

/** The island and its approaches. streetBase = weekly street take (pre-season-multiplier) at 100% influence. */
export const DISTRICTS: DistrictDef[] = [
  { id: 'boardwalk', name: 'Boardwalk', streetBase: 520, core: true, description: 'Two miles of planks, games of chance and summer money.' },
  { id: 'pacific', name: 'Pacific Avenue Clubs', streetBase: 560, core: true, description: 'Neon, jazz, Bobby Rydell on the marquee. The heart of Little Las Vegas.' },
  { id: 'piers', name: 'Amusement Piers', streetBase: 380, core: true, description: 'Rides, arcades, and a lot of cash nobody counts twice.' },
  { id: 'downtown', name: 'Downtown', streetBase: 300, core: true, description: 'City Hall, the cigar stores, the numbers banks.' },
  { id: 'docks', name: 'Bay Docks', streetBase: 260, core: false, description: 'Fishing boats, freight, and things that fall off trucks.' },
  { id: 'crest', name: 'Wildwood Crest', streetBase: 240, core: false, description: 'Quiet motels and family money. Easy to spook.' },
  { id: 'north', name: 'North Wildwood', streetBase: 340, core: false, description: 'Danny Kessler\'s side of the island. Independent and proud of it.' },
  { id: 'causeway', name: 'Rio Grande Causeway', streetBase: 220, core: false, description: 'The road onto the island. Whoever holds it sees everyone coming.' },
];

export const DISTRICT_IDS = DISTRICTS.map((d) => d.id);

export interface RivalDef {
  id: RivalId;
  name: string;
  shortName: string;
  kind: 'mob' | 'philly' | 'law';
  goals: RivalGoal[];
  home?: string;
  leader: { first: string; last: string; nickname?: string; ethnicity: 'Italian' | 'Irish' | 'Jewish'; age: [number, number]; rank: 'boss' | 'capo' | 'civilian' };
  money: [number, number];
  muscle: [number, number];
  blurb: string;
}

export const RIVALS: RivalDef[] = [
  {
    id: 'manno',
    name: 'The Manno Crew',
    shortName: 'Manno',
    kind: 'mob',
    goals: ['conquer', 'enrich', 'conquer'],
    home: 'causeway',
    leader: { first: 'Carmine', last: 'Manno', nickname: 'The Fist', ethnicity: 'Italian', age: [44, 58], rank: 'boss' },
    money: [30000, 50000],
    muscle: [50, 70],
    blurb: 'Atlantic City crew pushing south down the shore.',
  },
  {
    id: 'feldstein',
    name: 'Feldstein Money',
    shortName: 'Feldstein',
    kind: 'mob',
    goals: ['enrich', 'legitimacy'],
    home: 'boardwalk',
    leader: { first: 'Ira', last: 'Feldstein', ethnicity: 'Jewish', age: [50, 64], rank: 'boss' },
    money: [60000, 90000],
    muscle: [20, 35],
    blurb: 'New York money man buying into the boardwalk.',
  },
  {
    id: 'kessler',
    name: 'Kessler\'s Clubs',
    shortName: 'Kessler',
    kind: 'mob',
    goals: ['survive', 'enrich'],
    home: 'north',
    leader: { first: 'Danny', last: 'Kessler', ethnicity: 'Irish', age: [36, 48], rank: 'boss' },
    money: [15000, 25000],
    muscle: [30, 45],
    blurb: 'Independent North Wildwood club owner. Answers to nobody.',
  },
  {
    id: 'philly',
    name: 'Philadelphia (South Jersey)',
    shortName: 'Philly',
    kind: 'philly',
    goals: ['squeeze'],
    leader: { first: 'Salvatore', last: 'Moretti', nickname: 'Sal the Bag', ethnicity: 'Italian', age: [52, 63], rank: 'capo' },
    money: [100000, 150000],
    muscle: [70, 85],
    blurb: 'Angelo Bruno\'s South Jersey capo. Collects tribute through bagmen. No narcotics.',
  },
  {
    id: 'law',
    name: 'Cape May County Prosecutor',
    shortName: 'Prosecutor',
    kind: 'law',
    goals: ['headline'],
    leader: { first: 'Walter', last: 'Brennan', ethnicity: 'Irish', age: [38, 50], rank: 'civilian' },
    money: [20000, 20000],
    muscle: [40, 60],
    blurb: 'Wants a headline case before the next election.',
  },
];

export const FACTION_NAMES: Record<FactionId, string> = {
  player: 'Your crew',
  manno: 'Manno',
  feldstein: 'Feldstein',
  kessler: 'Kessler',
  philly: 'Philadelphia',
  law: 'The Law',
  none: 'Independent',
};
