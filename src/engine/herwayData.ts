import type { Ethnicity, FactionId, Trait } from './types';

/**
 * HER WAY (data): the paths a woman of 1960 Wildwood takes into the deep
 * world and into power, their rungs, what a week of each brings in and how
 * much heat it draws, and the women already on them when the game begins.
 * Every name here is invented; nobody here is real.
 */

export type HerPath = 'street' | 'numbers' | 'books' | 'fronts' | 'politics' | 'info';

export interface PathInfo {
  label: string;
  /** One line: what this path is. */
  blurb: string;
  /** Her title on each rung (lowest first). */
  rungs: string[];
  /** Her gross a week on each rung (modest, abstract dollars). */
  base: number[];
  /** Heat a week on each rung (before protection and decay). */
  heat: number[];
}

export const PATHS: Record<HerPath, PathInfo> = {
  street: {
    label: 'The street', blurb: 'From working on her own terms to running a house of her own (the madams of Nightlife).',
    rungs: ['Works for herself', 'Runs a house'], base: [0, 0], heat: [0, 0],
  },
  numbers: {
    label: 'The numbers', blurb: 'Slips and the daily number, out of a candy store or a beauty parlor.',
    rungs: ['Numbers runner', 'Numbers controller', 'Numbers banker'], base: [90, 220, 480], heat: [1.2, 2, 3],
  },
  books: {
    label: 'The books', blurb: 'She knows where the money goes: a bookkeeper, then a shylock to the beauty-parlor trade.',
    rungs: ['Bookkeeper', 'Shylock to the beauty-parlor trade', 'Keeps half the Boardwalk\'s books'], base: [70, 160, 300], heat: [0.6, 1.4, 2],
  },
  fronts: {
    label: 'Fronts', blurb: 'A beauty parlor, a diner, a boarding house or a bar of her own: a front and a cash laundry.',
    rungs: ['Owns a front', 'Owns two fronts', 'Runs a cash laundry'], base: [110, 230, 400], heat: [0.4, 0.9, 1.6],
  },
  politics: {
    label: 'Politics', blurb: 'Precinct committeewoman, ward leader, a run for the commission: votes, favors and contracts.',
    rungs: ['Committeewoman', 'Ward leader', 'Running for office', 'In office'], base: [30, 70, 90, 160], heat: [0, 0.2, 0.4, 0.6],
  },
  info: {
    label: 'Information', blurb: 'The switchboard, a secretary\'s desk at City Hall or the station house: she hears things.',
    rungs: ['Hears things', 'Hears everything'], base: [30, 60], heat: [0.1, 0.3],
  },
};

export const PATH_ORDER: HerPath[] = ['street', 'numbers', 'books', 'fronts', 'politics', 'info'];

/** The woman as cast at the start (an adult; her own life, her own choices). */
export interface HerSpec {
  f: string;
  l: string;
  nick?: string;
  eth: Ethnicity;
  age: number;
  path: Exclude<HerPath, 'street'>;
  rung: number;
  /** Where she works (fictional). */
  venue: string;
  side: FactionId;
  standing: number;
  traits: Trait[];
  /** What she wants (shown as her ambition). */
  wants: string;
}

export const HER_CAST: HerSpec[] = [
  { f: 'Rose', l: 'Bianco', eth: 'Italian', age: 24, path: 'numbers', rung: 0, venue: 'Sal\'s candy store, Pacific Avenue', side: 'none', standing: 45, traits: ['Ambitious', 'Charming'], wants: 'A numbers bank of her own before she is thirty' },
  { f: 'Dolores', l: 'Fiore', nick: 'Dot', eth: 'Italian', age: 47, path: 'numbers', rung: 2, venue: 'the Starlite Beauty Salon, Rio Grande Avenue', side: 'manno', standing: 70, traits: ['Greedy', 'Patient'], wants: 'Her own bank, nobody\'s envelope' },
  { f: 'Helen', l: 'Shapiro', eth: 'Jewish', age: 38, path: 'books', rung: 0, venue: 'a two-room office over the laundromat on Schellenger Avenue', side: 'none', standing: 50, traits: ['Honest', 'Patient'], wants: 'Her own accounting office with her name on the glass' },
  { f: 'Sadie', l: 'Lipman', eth: 'Jewish', age: 52, path: 'books', rung: 1, venue: 'the back booth at the Ocean Avenue luncheonette', side: 'feldstein', standing: 60, traits: ['Greedy', 'Paranoid'], wants: 'Enough put away that nobody can tell her anything' },
  { f: 'Agnes', l: 'Reilly', eth: 'Irish', age: 55, path: 'fronts', rung: 1, venue: 'the Seaspray boarding house and the corner laundromat on Cedar Avenue', side: 'none', standing: 55, traits: ['Patient', 'Loyal-to-a-fault'], wants: 'Leave her daughters something with a deed' },
  { f: 'Carmela', l: 'Russo', eth: 'Italian', age: 33, path: 'fronts', rung: 0, venue: 'Carmela\'s Diner, New Jersey Avenue', side: 'none', standing: 40, traits: ['Ambitious', 'Hot-headed'], wants: 'A supper club with her name in lights' },
  { f: 'Joan', l: 'Kearney', eth: 'Irish', age: 27, path: 'info', rung: 0, venue: 'the telephone exchange switchboard on Pacific Avenue', side: 'none', standing: 40, traits: ['Charming', 'Honest'], wants: 'Out of the headset and into an office of her own' },
  { f: 'Lorraine', l: 'Furey', eth: 'Irish', age: 41, path: 'info', rung: 1, venue: 'the front desk at the Wildwood police station', side: 'none', standing: 50, traits: ['Patient', 'Paranoid'], wants: 'Her son through college' },
  { f: 'Margaret', l: 'Dunleavy', nick: 'Peg', eth: 'Irish', age: 44, path: 'politics', rung: 0, venue: 'the Democratic club on Oak Avenue, the Fourth Precinct', side: 'none', standing: 50, traits: ['Ambitious', 'Charming'], wants: 'A seat on the commission, then the mayor\'s chair' },
];

/** The city offices a woman from the ward can run for (the ones the island votes on). */
export const CITY_RACES = ['ww_commission', 'nw_council', 'crest_commission'];
