import type { BusinessKind, HeatBar } from './types';

/**
 * Politics data: the real 1960 structure of the offices that matter to a
 * Wildwood crew, and the laws that can change the rules under it.
 *
 * Offices follow the world pack's institutions (src/worldpack/institutions.ts):
 * Walsh Act commissions in Wildwood, Wildwood Crest and Atlantic City (the
 * mayor is chosen by the commissioners), a mayor-council city in North
 * Wildwood, the Cape May County freeholders and constitutional officers, the
 * appointed county prosecutor and judges, the NJ Legislature (one senator per
 * county, assembly by population), the governor and his appointees, the
 * federal offices, and Philadelphia's mayor, DA and police commissioner.
 */

export type Jurisdiction = 'wildwood' | 'north' | 'crest' | 'ac' | 'county' | 'state' | 'federal' | 'philly';
export type Level = 'city' | 'county' | 'state' | 'federal';
export const LEVEL_RANK: Record<Level, number> = { city: 0, county: 1, state: 2, federal: 3 };
export const JURIS_LEVEL: Record<Jurisdiction, Level> = {
  wildwood: 'city', north: 'city', crest: 'city', ac: 'city', philly: 'city', county: 'county', state: 'state', federal: 'federal',
};
export const JURIS_NAME: Record<Jurisdiction, string> = {
  wildwood: 'Wildwood', north: 'North Wildwood', crest: 'Wildwood Crest', ac: 'Atlantic City', county: 'Cape May County',
  state: 'New Jersey', federal: 'Federal', philly: 'Philadelphia',
};

/** What an official can do for you, by office. */
export type FavorKind = 'zoning' | 'license' | 'sentence' | 'case' | 'transfer' | 'casino' | 'contract' | 'pardon' | 'appoint';

export interface OfficeDef {
  id: string;
  title: string;
  /** Short label for tables ("Commissioner"). */
  short: string;
  juris: Jurisdiction;
  level: Level;
  /** World-pack institution the holder belongs to. */
  inst: string;
  /** Ladder and rung a holder sits at (world-pack LADDERS). */
  ladder: string;
  rung: number;
  seats: number;
  /** Years per term; 0 = serves at pleasure / life. */
  termYears: number;
  selection: 'elected' | 'appointed' | 'chosen' | 'life';
  partisan: boolean;
  /** First election (or reappointment) year at/after summer 1960, per seat (staggered bodies list one per seat). */
  firstYear: number[];
  /** Month the election (or appointment) happens. */
  month: number;
  /** -1 strongly Republican .. +1 strongly Democratic. */
  lean: number;
  /** Consecutive-term limit (0 none). */
  termLimit: number;
  /** For appointed offices: who appoints. For 'chosen': the body that chooses from among its members. */
  by?: string;
  /** Can the player's influence reach it (capped at governor and congressmen). */
  reach: boolean;
  favors: FavorKind[];
  /** Offices a candidate usually comes up from (institutions). */
  pool: string[];
  /** The office only exists once this law is in force. */
  needsLaw?: string;
  leverage: string;
  note: string;
}

const O = (x: OfficeDef) => x;

export const OFFICE_DEFS: OfficeDef[] = [
  O({ id: 'ww_commission', title: 'Wildwood City Commissioner', short: 'Commissioner', juris: 'wildwood', level: 'city', inst: 'wildwood_city', ladder: 'local_politics', rung: 2, seats: 3, termYears: 4, selection: 'elected', partisan: false, firstYear: [1963, 1963, 1963], month: 5, lean: 0, termLimit: 0, reach: true, favors: ['zoning', 'license', 'contract'], pool: ['wildwood_city', 'cape_may_party_r', 'cape_may_party_d', 'business'], leverage: 'Three votes run the city: licenses, police, the boardwalk, the beach concessions.', note: 'Walsh Act commission: three commissioners elected at large every four years in May, nonpartisan.' }),
  O({ id: 'ww_mayor', title: 'Mayor of Wildwood (Director of Public Safety)', short: 'Mayor', juris: 'wildwood', level: 'city', inst: 'wildwood_city', ladder: 'local_politics', rung: 3, seats: 1, termYears: 4, selection: 'chosen', partisan: false, firstYear: [1963], month: 5, lean: 0, termLimit: 0, by: 'ww_commission', reach: true, favors: ['transfer', 'license', 'zoning'], pool: [], leverage: 'Holds Public Safety: appoints and protects the Chief of Police.', note: 'Chosen by the three commissioners from among themselves.' }),
  O({ id: 'ww_chief', title: 'Wildwood Chief of Police', short: 'Chief of Police', juris: 'wildwood', level: 'city', inst: 'wildwood_pd', ladder: 'municipal_police', rung: 5, seats: 1, termYears: 0, selection: 'appointed', partisan: false, firstYear: [0], month: 1, lean: 0, termLimit: 0, by: 'ww_mayor', reach: true, favors: ['transfer'], pool: ['wildwood_pd'], leverage: 'Who walks the boardwalk beat and who raids what.', note: 'Serves under the Director of Public Safety.' }),
  O({ id: 'muni_judge', title: 'Municipal Judge (the island)', short: 'Municipal Judge', juris: 'wildwood', level: 'city', inst: 'municipal_court', ladder: 'bench_nj', rung: 0, seats: 1, termYears: 3, selection: 'appointed', partisan: false, firstYear: [1961], month: 1, lean: 0, termLimit: 0, by: 'ww_commission', reach: true, favors: ['sentence'], pool: ['private_bar', 'municipal_court'], leverage: 'Gambling summonses disappear here.', note: 'Part-time, appointed by the governing body for three years.' }),
  O({ id: 'nw_mayor', title: 'Mayor of North Wildwood', short: 'Mayor', juris: 'north', level: 'city', inst: 'north_wildwood_city', ladder: 'local_politics', rung: 3, seats: 1, termYears: 4, selection: 'elected', partisan: true, firstYear: [1961], month: 11, lean: -0.2, termLimit: 0, reach: true, favors: ['license', 'transfer', 'zoning'], pool: ['north_wildwood_city'], leverage: 'Liquor licenses and the police on Danny Kessler\'s side of the island.', note: 'City form, partisan, four years.' }),
  O({ id: 'nw_council', title: 'North Wildwood Councilman', short: 'Councilman', juris: 'north', level: 'city', inst: 'north_wildwood_city', ladder: 'local_politics', rung: 2, seats: 4, termYears: 3, selection: 'elected', partisan: true, firstYear: [1960, 1961, 1962, 1962], month: 11, lean: -0.2, termLimit: 0, reach: true, favors: ['zoning', 'license'], pool: ['north_wildwood_city', 'business'], leverage: 'Confirms the mayor\'s appointments and votes the licenses.', note: 'Ward seats, staggered (modeled as four of the seven).' }),
  O({ id: 'crest_commission', title: 'Wildwood Crest Commissioner', short: 'Commissioner', juris: 'crest', level: 'city', inst: 'crest_borough', ladder: 'local_politics', rung: 2, seats: 3, termYears: 4, selection: 'elected', partisan: false, firstYear: [1961, 1961, 1961], month: 5, lean: 0, termLimit: 0, reach: true, favors: ['zoning', 'license'], pool: ['crest_borough', 'business'], leverage: 'Zoning and the motel boom.', note: 'Walsh Act commission since 1937.' }),
  O({ id: 'cmc_freeholder', title: 'Cape May County Freeholder', short: 'Freeholder', juris: 'county', level: 'county', inst: 'cape_may_county', ladder: 'county_politics', rung: 1, seats: 3, termYears: 3, selection: 'elected', partisan: true, firstYear: [1960, 1961, 1962], month: 11, lean: -0.6, termLimit: 0, reach: true, favors: ['contract', 'zoning'], pool: ['cape_may_county', 'wildwood_city', 'crest_borough', 'north_wildwood_city', 'cape_may_party_r', 'cape_may_party_d'], leverage: 'County roads, county contracts, the county jail budget.', note: 'Board of Chosen Freeholders, one seat a year.' }),
  O({ id: 'cmc_clerk', title: 'Cape May County Clerk', short: 'County Clerk', juris: 'county', level: 'county', inst: 'cape_may_county', ladder: 'county_politics', rung: 2, seats: 1, termYears: 5, selection: 'elected', partisan: true, firstYear: [1962], month: 11, lean: -0.6, termLimit: 0, reach: true, favors: ['contract'], pool: ['cape_may_county', 'cape_may_party_r'], leverage: 'Deeds, ballots and the voter rolls. The man who counts.', note: 'NJ county clerks serve five years.' }),
  O({ id: 'cmc_sheriff', title: 'Sheriff of Cape May County', short: 'Sheriff', juris: 'county', level: 'county', inst: 'cmc_sheriff', ladder: 'sheriff', rung: 3, seats: 1, termYears: 3, selection: 'elected', partisan: true, firstYear: [1961], month: 11, lean: -0.6, termLimit: 0, reach: true, favors: ['transfer', 'sentence'], pool: ['cmc_sheriff', 'cape_may_county'], leverage: 'The county jail, prisoner transport, and who sits on a jury.', note: 'NJ sheriffs serve three years.' }),
  O({ id: 'cmc_prosecutor', title: 'Cape May County Prosecutor', short: 'Prosecutor', juris: 'county', level: 'county', inst: 'cmc_prosecutor', ladder: 'prosecutor_office', rung: 3, seats: 1, termYears: 5, selection: 'appointed', partisan: true, firstYear: [1962], month: 3, lean: 0, termLimit: 0, by: 'nj_governor', reach: true, favors: ['case'], pool: ['cmc_prosecutor', 'private_bar'], leverage: 'Decides what goes to the grand jury.', note: 'Appointed by the Governor for five years; the county\'s senator can block it.' }),
  O({ id: 'cmc_judge', title: 'Cape May County Court Judge', short: 'County Judge', juris: 'county', level: 'county', inst: 'county_court', ladder: 'bench_nj', rung: 2, seats: 2, termYears: 5, selection: 'appointed', partisan: true, firstYear: [1961, 1963], month: 3, lean: 0, termLimit: 0, by: 'nj_governor', reach: true, favors: ['sentence', 'case'], pool: ['county_court', 'private_bar', 'cmc_prosecutor'], leverage: 'Tries your men; sets bail.', note: 'County Courts existed until 1978; five-year appointments.' }),
  O({ id: 'nj_senate_cm', title: 'State Senator, Cape May County', short: 'State Senator', juris: 'state', level: 'state', inst: 'nj_legislature', ladder: 'state_politics', rung: 2, seats: 1, termYears: 4, selection: 'elected', partisan: true, firstYear: [1963], month: 11, lean: -0.5, termLimit: 0, reach: true, favors: ['contract', 'appoint'], pool: ['nj_legislature', 'cape_may_county', 'wildwood_city'], leverage: 'Senatorial courtesy: can veto the county prosecutor and judges.', note: 'One senator per county until 1967.' }),
  O({ id: 'nj_assembly_cm', title: 'Assemblyman, Cape May County', short: 'Assemblyman', juris: 'state', level: 'state', inst: 'nj_legislature', ladder: 'state_politics', rung: 1, seats: 1, termYears: 2, selection: 'elected', partisan: true, firstYear: [1961], month: 11, lean: -0.5, termLimit: 0, reach: true, favors: ['contract'], pool: ['cape_may_county', 'wildwood_city', 'crest_borough', 'north_wildwood_city', 'cape_may_party_r', 'cape_may_party_d'], leverage: 'Bills on bingo, raffles, liquor hours.', note: 'Two-year terms.' }),
  O({ id: 'nj_senate_ac', title: 'State Senator, Atlantic County', short: 'State Senator', juris: 'state', level: 'state', inst: 'nj_legislature', ladder: 'state_politics', rung: 2, seats: 1, termYears: 4, selection: 'elected', partisan: true, firstYear: [1963], month: 11, lean: -0.8, termLimit: 0, reach: true, favors: ['contract', 'appoint'], pool: ['nj_legislature', 'atlantic_city', 'atlantic_county'], leverage: 'The Atlantic City machine boss sits here.', note: 'One per county.' }),
  O({ id: 'nj_assembly_ac', title: 'Assemblyman, Atlantic County', short: 'Assemblyman', juris: 'state', level: 'state', inst: 'nj_legislature', ladder: 'state_politics', rung: 1, seats: 2, termYears: 2, selection: 'elected', partisan: true, firstYear: [1961, 1961], month: 11, lean: -0.7, termLimit: 0, reach: true, favors: ['contract'], pool: ['atlantic_city', 'atlantic_county'], leverage: 'Resort-tax and racing bills.', note: 'Seat count plausible.' }),
  O({ id: 'nj_governor', title: 'Governor of New Jersey', short: 'Governor', juris: 'state', level: 'state', inst: 'nj_executive', ladder: 'state_politics', rung: 4, seats: 1, termYears: 4, selection: 'elected', partisan: true, firstYear: [1961], month: 11, lean: 0.05, termLimit: 2, reach: true, favors: ['pardon', 'appoint', 'contract'], pool: ['nj_legislature', 'nj_attorney_general', 'us_congress', 'nj_executive'], leverage: 'Appoints prosecutors, judges, the AG, the ABC director, the State Police superintendent; pardons.', note: 'Two consecutive terms; no Lt. Governor in 1960.' }),
  O({ id: 'nj_ag', title: 'Attorney General of New Jersey', short: 'Attorney General', juris: 'state', level: 'state', inst: 'nj_attorney_general', ladder: 'prosecutor_office', rung: 3, seats: 1, termYears: 4, selection: 'appointed', partisan: true, firstYear: [1962], month: 1, lean: 0, termLimit: 0, by: 'nj_governor', reach: true, favors: ['case'], pool: ['nj_attorney_general', 'private_bar', 'cmc_prosecutor'], leverage: 'Can supersede a county prosecutor and run the case himself.', note: 'Serves the Governor\'s term.' }),
  O({ id: 'nj_abc', title: 'Director, Alcoholic Beverage Control', short: 'ABC Director', juris: 'state', level: 'state', inst: 'nj_agencies', ladder: 'state_politics', rung: 3, seats: 1, termYears: 4, selection: 'appointed', partisan: true, firstYear: [1962], month: 1, lean: 0, termLimit: 0, by: 'nj_governor', reach: true, favors: ['license'], pool: ['nj_agencies', 'private_bar'], leverage: 'Pulls or protects every liquor license in the state.', note: 'Real division.' }),
  O({ id: 'nj_sp', title: 'Superintendent of the New Jersey State Police', short: 'State Police Supt.', juris: 'state', level: 'state', inst: 'nj_state_police', ladder: 'state_police', rung: 5, seats: 1, termYears: 0, selection: 'appointed', partisan: false, firstYear: [0], month: 1, lean: 0, termLimit: 0, by: 'nj_governor', reach: true, favors: ['transfer'], pool: ['nj_state_police'], leverage: 'Sends troopers onto the island or keeps them off it.', note: 'Serves at the Governor\'s pleasure.' }),
  O({ id: 'nj_ccc', title: 'Casino Control Commissioner', short: 'Casino Commissioner', juris: 'state', level: 'state', inst: 'nj_agencies', ladder: 'state_politics', rung: 3, seats: 5, termYears: 5, selection: 'appointed', partisan: true, firstYear: [1977, 1977, 1977, 1977, 1977], month: 7, lean: 0, termLimit: 0, by: 'nj_governor', needsLaw: 'nj_casino_control', reach: true, favors: ['casino'], pool: ['nj_agencies', 'private_bar', 'superior_court'], leverage: 'Who gets a casino license in Atlantic City.', note: 'Created by the Casino Control Act, June 1977.' }),
  O({ id: 'us_house_nj2', title: 'US Representative, NJ 2nd District', short: 'Congressman', juris: 'federal', level: 'federal', inst: 'us_congress', ladder: 'federal_politics', rung: 1, seats: 1, termYears: 2, selection: 'elected', partisan: true, firstYear: [1960], month: 11, lean: -0.5, termLimit: 0, reach: true, favors: ['contract'], pool: ['nj_legislature', 'cape_may_county', 'atlantic_county', 'us_congress'], leverage: 'The shore\'s man in Washington: Coast Guard, beach money, post offices.', note: 'Atlantic, Cape May and Cumberland.' }),
  O({ id: 'us_house_nj1', title: 'US Representative, NJ 1st District', short: 'Congressman', juris: 'federal', level: 'federal', inst: 'us_congress', ladder: 'federal_politics', rung: 1, seats: 1, termYears: 2, selection: 'elected', partisan: true, firstYear: [1960], month: 11, lean: 0.3, termLimit: 0, reach: true, favors: ['contract'], pool: ['nj_legislature', 'us_congress'], leverage: 'Federal dock and shipyard money.', note: 'Camden, Gloucester, Salem.' }),
  O({ id: 'us_senate', title: 'United States Senator from New Jersey', short: 'US Senator', juris: 'federal', level: 'federal', inst: 'us_congress', ladder: 'federal_politics', rung: 2, seats: 2, termYears: 6, selection: 'elected', partisan: true, firstYear: [1960, 1964], month: 11, lean: 0, termLimit: 0, reach: false, favors: [], pool: ['us_congress', 'nj_executive', 'nj_legislature'], leverage: 'Recommends the US Attorney and federal judges.', note: 'Beyond a shore family\'s reach.' }),
  O({ id: 'us_attorney', title: 'United States Attorney for New Jersey', short: 'US Attorney', juris: 'federal', level: 'federal', inst: 'us_attorney_nj', ladder: 'federal_prosecutor', rung: 3, seats: 1, termYears: 4, selection: 'appointed', partisan: true, firstYear: [1961], month: 3, lean: 0, termLimit: 0, by: 'president', reach: false, favors: [], pool: ['us_attorney_nj', 'private_bar'], leverage: 'Federal grand juries, tax cases, interstate gambling.', note: 'Appointed by the President on the senators\' recommendation.' }),
  O({ id: 'fbi_sra', title: 'FBI Senior Resident Agent, Atlantic City', short: 'FBI Resident Agent', juris: 'federal', level: 'federal', inst: 'fbi_newark', ladder: 'fbi', rung: 2, seats: 1, termYears: 0, selection: 'appointed', partisan: false, firstYear: [0], month: 1, lean: 0, termLimit: 0, by: 'bureau', reach: false, favors: [], pool: ['fbi_newark'], leverage: 'The Top Hoodlum Program\'s man on the shore.', note: 'Newark field office\'s resident agency.' }),
  O({ id: 'ac_commission', title: 'Atlantic City Commissioner', short: 'AC Commissioner', juris: 'ac', level: 'city', inst: 'atlantic_city', ladder: 'local_politics', rung: 2, seats: 5, termYears: 4, selection: 'elected', partisan: false, firstYear: [1964, 1964, 1964, 1964, 1964], month: 5, lean: 0, termLimit: 0, reach: true, favors: ['zoning', 'license', 'contract'], pool: ['atlantic_city', 'atlantic_county'], leverage: 'Boardwalk, piers and hotel licenses in the biggest resort on the coast.', note: 'Walsh Act, five members; the county machine picks the slate.' }),
  O({ id: 'ac_mayor', title: 'Mayor of Atlantic City', short: 'AC Mayor', juris: 'ac', level: 'city', inst: 'atlantic_city', ladder: 'local_politics', rung: 3, seats: 1, termYears: 4, selection: 'chosen', partisan: false, firstYear: [1964], month: 5, lean: 0, termLimit: 0, by: 'ac_commission', reach: true, favors: ['license', 'transfer'], pool: [], leverage: 'Face of the city to the convention trade.', note: 'Chosen by the commission.' }),
  O({ id: 'phl_mayor', title: 'Mayor of Philadelphia', short: 'Philly Mayor', juris: 'philly', level: 'city', inst: 'philadelphia_city', ladder: 'ward_politics', rung: 3, seats: 1, termYears: 4, selection: 'elected', partisan: true, firstYear: [1963], month: 11, lean: 0.6, termLimit: 2, reach: true, favors: ['transfer'], pool: ['philadelphia_city', 'philadelphia_ward', 'philadelphia_da'], leverage: 'Appoints the Police Commissioner.', note: 'Home Rule Charter: two consecutive terms.' }),
  O({ id: 'phl_da', title: 'District Attorney of Philadelphia', short: 'Philly DA', juris: 'philly', level: 'city', inst: 'philadelphia_da', ladder: 'prosecutor_office', rung: 3, seats: 1, termYears: 4, selection: 'elected', partisan: true, firstYear: [1961], month: 11, lean: 0.6, termLimit: 0, reach: true, favors: ['case'], pool: ['philadelphia_da', 'private_bar', 'philadelphia_city'], leverage: 'Charges the Philadelphia family\'s men; grants immunity.', note: 'Elected, odd years.' }),
  O({ id: 'phl_police', title: 'Philadelphia Police Commissioner', short: 'Police Commissioner', juris: 'philly', level: 'city', inst: 'philadelphia_pd', ladder: 'big_city_police', rung: 7, seats: 1, termYears: 0, selection: 'appointed', partisan: false, firstYear: [0], month: 1, lean: 0, termLimit: 0, by: 'phl_mayor', reach: true, favors: ['transfer'], pool: ['philadelphia_pd'], leverage: 'Raids or no raids in South Philly.', note: 'At the mayor\'s pleasure.' }),
];

export const OFFICE_BY_ID: Record<string, OfficeDef> = Object.fromEntries(OFFICE_DEFS.map((o) => [o.id, o]));

/** World-pack seat ids -> our offices (holders in 1960 come from the pack). */
export const PACK_SEAT: Record<string, string> = {
  ww_commissioner: 'ww_commission', ww_mayor: 'ww_mayor', crest_commissioner: 'crest_commission', nw_mayor: 'nw_mayor', nw_council_ward: 'nw_council',
  cmc_freeholder: 'cmc_freeholder', cmc_clerk: 'cmc_clerk', cmc_sheriff: 'cmc_sheriff', cmc_county_judge: 'cmc_judge', muni_judge: 'muni_judge',
  nj_senate_capemay: 'nj_senate_cm', nj_senate_atlantic: 'nj_senate_ac', nj_assembly_atlantic: 'nj_assembly_ac', nj_governor: 'nj_governor', nj_ag: 'nj_ag',
  nj_abc_director: 'nj_abc', nj_sp_superintendent: 'nj_sp', us_senate_nj_a: 'us_senate', us_senate_nj_b: 'us_senate', us_house_nj1: 'us_house_nj1',
  us_house_nj2: 'us_house_nj2', us_attorney_nj: 'us_attorney', ac_commissioner: 'ac_commission', ac_mayor: 'ac_mayor', phl_mayor: 'phl_mayor',
  phl_da: 'phl_da', phl_police_commissioner: 'phl_police',
};

/** Favor requests: what each costs the official, and what it does for you. */
export interface FavorDef {
  kind: FavorKind;
  name: string;
  /** small 0 · medium 1 · big 2 */
  size: 0 | 1 | 2;
  text: string;
}
export const FAVORS: Record<FavorKind, FavorDef> = {
  zoning: { kind: 'zoning', name: 'A zoning variance', size: 0, text: 'A lot rezoned for one of your fronts: the place is worth more and earns more.' },
  license: { kind: 'license', name: 'A license', size: 1, text: 'Liquor and amusement licenses renewed, a closed place reopened, inspectors told to look elsewhere.' },
  sentence: { kind: 'sentence', name: 'A light sentence', size: 1, text: 'One of your men inside comes home early.' },
  case: { kind: 'case', name: 'A dropped case', size: 2, text: 'Files go missing; a man\'s evidence file gets thinner; the boss\'s case loses a witness.' },
  transfer: { kind: 'transfer', name: 'Police transfers', size: 1, text: 'The eager detectives go to the bay; friendly faces walk your beat for a season.' },
  casino: { kind: 'casino', name: 'A casino license', size: 2, text: 'Your front man\'s application moves to the top of the pile.' },
  contract: { kind: 'contract', name: 'A public contract', size: 1, text: 'Paving, a jail wing, a pier: public money through your construction front.' },
  pardon: { kind: 'pardon', name: 'A pardon', size: 2, text: 'A man in prison walks out with the Governor\'s signature.' },
  appoint: { kind: 'appoint', name: 'An appointment', size: 2, text: 'Your man is named to an appointed office when the seat opens.' },
};

/* ------------------------------------------------------------------ */
/* Laws                                                                */
/* ------------------------------------------------------------------ */

/** How a law in force changes the rules. Every one shows as a named line or a named reason. */
export type LawEffect =
  | { kind: 'income'; biz: BusinessKind[]; pct: number }
  | { kind: 'heat'; bar: HeatBar; per4: number }
  | { kind: 'evidence'; weekly: number }
  | { kind: 'favorOdds'; favors: FavorKind[] | 'all'; value: number }
  | { kind: 'fraudRisk'; value: number }
  | { kind: 'flipRisk'; value: number }
  | { kind: 'kidExposure'; value: number }
  | { kind: 'enables'; what: string };

export interface LawDef {
  id: string;
  name: string;
  juris: Jurisdiction;
  /** What sets it off (the "problem" stage). */
  problem: string;
  text: string;
  effects: LawEffect[];
  /** Real anchor: the bill is law on this date whatever you do (backdrop). */
  anchor?: { y: number; m: number; d: number };
  /** Anchored votes that fail (the 1974 referendum). */
  anchorFails?: boolean;
  /** A higher-level law in force that preempts this one (struck down on challenge). */
  preemptedBy?: string;
  /** Laws that must be in force first. */
  needs?: string[];
  /** Earliest year it can come up (non-anchored). */
  from?: number;
  /** What tends to set it off. */
  trigger: 'heat' | 'scandal' | 'fire' | 'economy' | 'reform' | 'crackdown' | 'anchor' | 'lobby';
  /** Good for the family (the player usually wants it to pass). */
  friendly: boolean;
}

const L = (x: LawDef) => x;

export const LAW_DEFS: LawDef[] = [
  // Wildwood ordinances
  L({ id: 'ww_boardwalk_hours', name: 'Boardwalk Closing Hours Ordinance', juris: 'wildwood', trigger: 'reform', friendly: false, problem: 'Merchants and churches complain about rowdiness on the boards after midnight.', text: 'Arcades and stands close at midnight.', effects: [{ kind: 'income', biz: ['arcade', 'stand'], pct: -8 }, { kind: 'heat', bar: 'local', per4: -1 }] }),
  L({ id: 'ww_amusement_tax', name: 'Amusement Tax Ordinance', juris: 'wildwood', trigger: 'economy', friendly: false, problem: 'The city needs money for the boardwalk and the beach patrol.', text: 'A city tax on admissions, rides and cover charges.', effects: [{ kind: 'income', biz: ['arcade', 'club'], pct: -4 }] }),
  L({ id: 'ww_adult_zoning', name: 'Adult Entertainment Zoning Ordinance', juris: 'wildwood', trigger: 'reform', friendly: false, problem: 'A church committee wants the burlesque houses off Pacific Avenue.', text: 'Gentlemen\'s clubs and stag shows only on two blocks by the bay.', effects: [{ kind: 'income', biz: ['club', 'stag', 'vice'], pct: -10 }] }),
  L({ id: 'ww_local_option', name: 'Sunday Sales Local Option', juris: 'wildwood', trigger: 'lobby', friendly: true, problem: 'Tavern owners want to sell on Sundays in the Season.', text: 'Wildwood lets bars serve on summer Sundays.', preemptedBy: 'nj_sunday_closing', effects: [{ kind: 'income', biz: ['bar', 'club'], pct: 8 }] }),
  L({ id: 'ww_police_review', name: 'Police Review Board', juris: 'wildwood', trigger: 'scandal', friendly: false, problem: 'A beating in the station house makes the papers.', text: 'Citizens review complaints against the police.', effects: [{ kind: 'favorOdds', favors: ['transfer'], value: -15 }] }),
  L({ id: 'ww_building_code', name: 'Fire and Building Code Revision', juris: 'wildwood', trigger: 'fire', friendly: false, problem: 'A boardwalk fire kills two and the papers ask who signed the inspections.', text: 'New exits, sprinklers and inspections for every place of assembly.', effects: [{ kind: 'income', biz: ['club', 'bar', 'restaurant', 'motel', 'boarding'], pct: -3 }, { kind: 'favorOdds', favors: ['license', 'zoning'], value: -5 }] }),
  L({ id: 'ww_rent_control', name: 'Rent Control Ordinance', juris: 'wildwood', from: 1969, trigger: 'economy', friendly: false, problem: 'Year-round tenants are priced out by summer rents.', text: 'Rents frozen for year-round tenants.', effects: [{ kind: 'income', biz: ['boarding', 'motel'], pct: -8 }] }),
  // Crest and North Wildwood
  L({ id: 'crest_motel_zoning', name: 'Crest Motel Zoning Plan', juris: 'crest', trigger: 'economy', friendly: true, problem: 'Developers want to build Doo-Wop motels on every lot.', text: 'Motels allowed on the beach blocks.', effects: [{ kind: 'income', biz: ['motel'], pct: 10 }] }),
  L({ id: 'nw_club_hours', name: 'North Wildwood Late-Hours Ordinance', juris: 'north', trigger: 'lobby', friendly: true, problem: 'The clubs want to stay open until five in the morning.', text: 'Clubs open until 5 a.m. in the Season.', preemptedBy: 'nj_sunday_closing', effects: [{ kind: 'income', biz: ['club', 'bar'], pct: 6 }] }),
  // Cape May County
  L({ id: 'cmc_oc_squad', name: 'County Organized Crime Squad', juris: 'county', trigger: 'crackdown', friendly: false, problem: 'A shooting on the boardwalk; the freeholders want to look tough.', text: 'Four new county detectives work nothing but gambling and the rackets.', effects: [{ kind: 'heat', bar: 'local', per4: 2 }, { kind: 'evidence', weekly: 0.1 }] }),
  L({ id: 'cmc_jail_bond', name: 'County Jail Bond Issue', juris: 'county', trigger: 'economy', friendly: true, problem: 'The old county jail is falling down.', text: 'A new jail wing: millions in county contracts.', effects: [{ kind: 'favorOdds', favors: ['contract'], value: 10 }] }),
  // New Jersey
  L({ id: 'nj_sunday_closing', name: 'Sunday Closing Law Enforcement Act', juris: 'state', trigger: 'reform', friendly: false, problem: 'The churches want the blue laws enforced.', text: 'Sunday sales enforced statewide; local options void.', effects: [{ kind: 'income', biz: ['bar', 'club', 'stand'], pct: -7 }] }),
  L({ id: 'nj_liquor_hours', name: 'Resort Liquor Hours Act', juris: 'state', trigger: 'lobby', friendly: true, problem: 'Resort towns lose tourists to Pennsylvania\'s late bars.', text: 'Resort towns may serve until 3 a.m.', effects: [{ kind: 'income', biz: ['bar', 'club'], pct: 9 }] }),
  L({ id: 'nj_hotel_tax', name: 'Hotel Occupancy Tax', juris: 'state', from: 1966, trigger: 'economy', friendly: false, problem: 'Trenton needs money and the shore has it.', text: 'A tax on every motel room.', effects: [{ kind: 'income', biz: ['motel', 'boarding'], pct: -6 }] }),
  L({ id: 'nj_min_wage', name: 'Minimum Wage Act', juris: 'state', from: 1965, trigger: 'economy', friendly: false, problem: 'Hotel and kitchen workers march in Atlantic City.', text: 'A state minimum wage for resort workers.', effects: [{ kind: 'income', biz: ['restaurant', 'pizza', 'motel', 'laundromat', 'stand'], pct: -4 }] }),
  L({ id: 'nj_usury', name: 'Consumer Loan Interest Cap', juris: 'state', trigger: 'reform', friendly: true, problem: 'Finance companies squeeze working families.', text: 'Banks may not charge more than the cap; the people they turn away find a shylock.', effects: [{ kind: 'income', biz: ['loansharking'], pct: 10 }] }),
  L({ id: 'nj_gambling_sentences', name: 'Gambling Sentencing Act', juris: 'state', trigger: 'crackdown', friendly: false, problem: 'A numbers war leaves a body in Camden.', text: 'Mandatory jail time for bookmakers and numbers bankers.', effects: [{ kind: 'income', biz: ['numbers', 'bookmaking'], pct: -6 }, { kind: 'heat', bar: 'local', per4: 1 }] }),
  L({ id: 'nj_wiretap', name: 'State Wiretap and Surveillance Act', juris: 'state', anchor: { y: 1968, m: 1, d: 15 }, trigger: 'anchor', friendly: false, problem: 'State investigators want the same tools as the FBI.', text: 'State police and prosecutors may tap phones with a judge\'s order.', effects: [{ kind: 'evidence', weekly: 0.1 }, { kind: 'flipRisk', value: 0.01 }] }),
  L({ id: 'nj_sci', name: 'State Commission of Investigation', juris: 'state', anchor: { y: 1968, m: 9, d: 1 }, trigger: 'anchor', friendly: false, problem: 'The newspapers call New Jersey the most corrupt state in the Union.', text: 'A permanent commission that subpoenas officials and mobsters in public hearings.', effects: [{ kind: 'heat', bar: 'local', per4: 1 }, { kind: 'favorOdds', favors: 'all', value: -5 }] }),
  L({ id: 'nj_oc_bureau', name: 'State Police Organized Crime Bureau', juris: 'state', anchor: { y: 1970, m: 7, d: 1 }, trigger: 'anchor', friendly: false, problem: 'After the wiretap tapes, Trenton wants its own rackets squad.', text: 'Troopers in plain clothes, working nothing but the families.', effects: [{ kind: 'heat', bar: 'family', per4: 1 }, { kind: 'evidence', weekly: 0.08 }] }),
  L({ id: 'nj_lottery', name: 'New Jersey State Lottery', juris: 'state', anchor: { y: 1970, m: 12, d: 16 }, trigger: 'anchor', friendly: false, problem: 'Trenton wants the numbers money for itself.', text: 'A legal lottery, every week, in every candy store.', effects: [{ kind: 'income', biz: ['numbers'], pct: -15 }] }),
  L({ id: 'nj_conflicts', name: 'Local Government Ethics and Conflicts of Interest Law', juris: 'state', anchor: { y: 1971, m: 6, d: 1 }, trigger: 'anchor', friendly: false, problem: 'Officials vote on contracts for their own relatives.', text: 'Officials must disclose family interests and recuse themselves.', effects: [{ kind: 'kidExposure', value: 2 }, { kind: 'favorOdds', favors: 'all', value: -5 }] }),
  L({ id: 'nj_election_reform', name: 'Election Reform and Voting Machine Act', juris: 'state', from: 1962, trigger: 'scandal', friendly: false, problem: 'Dead men voted in the last election.', text: 'Voting machines, purged rolls, county election boards with both parties.', effects: [{ kind: 'fraudRisk', value: 0.2 }] }),
  L({ id: 'nj_casino_ref_1974', name: 'Casino Referendum (1974)', juris: 'state', anchor: { y: 1974, m: 11, d: 5 }, anchorFails: true, trigger: 'anchor', friendly: true, problem: 'Atlantic City is dying; statewide casinos are on the ballot.', text: 'Statewide casino gambling (the voters say no).', effects: [] }),
  L({ id: 'nj_casino_ref', name: 'Casino Referendum (1976)', juris: 'state', anchor: { y: 1976, m: 11, d: 2 }, trigger: 'anchor', friendly: true, problem: 'A second try: casinos in Atlantic City only.', text: 'Casino gambling in Atlantic City.', effects: [{ kind: 'enables', what: 'casino licenses' }] }),
  L({ id: 'nj_casino_control', name: 'Casino Control Act', juris: 'state', anchor: { y: 1977, m: 6, d: 2 }, needs: ['nj_casino_ref'], trigger: 'anchor', friendly: true, problem: 'The voters said yes; Trenton must say how.', text: 'Creates the Casino Control Commission and the license investigations.', effects: [{ kind: 'enables', what: 'the Casino Control Commission' }] }),
  L({ id: 'nj_gaming_strict', name: 'Strict Gaming License Amendments', juris: 'state', from: 1977, needs: ['nj_casino_control'], trigger: 'scandal', friendly: false, problem: 'A licensee turns out to have friends in Philadelphia.', text: 'Every partner, lender and supplier must be licensed and investigated.', effects: [{ kind: 'favorOdds', favors: ['casino'], value: -20 }] }),
  L({ id: 'nj_film', name: 'Motion Picture and Television Incentive Act', juris: 'state', from: 1975, trigger: 'economy', friendly: true, problem: 'Hollywood shoots in New York, not New Jersey.', text: 'Tax credits for productions shot in the state; the clubs get the crews.', effects: [{ kind: 'income', biz: ['club'], pct: 4 }] }),
  L({ id: 'nj_witness', name: 'State Witness Protection Fund', juris: 'state', from: 1972, trigger: 'crackdown', friendly: false, problem: 'A witness in a rackets trial is found in the bay.', text: 'Money to hide and relocate state witnesses.', effects: [{ kind: 'flipRisk', value: 0.02 }] }),
  // Federal
  L({ id: 'us_wire_act', name: 'Interstate Wire Act', juris: 'federal', anchor: { y: 1961, m: 9, d: 13 }, trigger: 'anchor', friendly: false, problem: 'Bookmakers take bets across state lines by telephone.', text: 'Federal crime to take bets by wire across state lines.', effects: [{ kind: 'income', biz: ['bookmaking'], pct: -10 }, { kind: 'heat', bar: 'federal', per4: 1 }] }),
  L({ id: 'us_omnibus', name: 'Omnibus Crime Control and Safe Streets Act', juris: 'federal', anchor: { y: 1968, m: 6, d: 19 }, trigger: 'anchor', friendly: false, problem: 'Riots, rising crime and an election year.', text: 'Federal wiretaps with a warrant (Title III).', effects: [{ kind: 'evidence', weekly: 0.12 }] }),
  L({ id: 'us_rico', name: 'Organized Crime Control Act (RICO)', juris: 'federal', anchor: { y: 1970, m: 10, d: 15 }, trigger: 'anchor', friendly: false, problem: 'Congress wants a law against the enterprise itself.', text: 'Racketeering: the family is the crime. Witness security for those who testify.', effects: [{ kind: 'flipRisk', value: 0.02 }, { kind: 'heat', bar: 'federal', per4: 1 }] }),
  L({ id: 'us_bank_secrecy', name: 'Bank Secrecy Act', juris: 'federal', anchor: { y: 1970, m: 10, d: 26 }, trigger: 'anchor', friendly: false, problem: 'Cash goes into banks by the suitcase.', text: 'Banks must report large cash deposits.', effects: [{ kind: 'income', biz: ['bank', 'laundromat'], pct: -8 }] }),
];

export const LAW_BY_ID: Record<string, LawDef> = Object.fromEntries(LAW_DEFS.map((l) => [l.id, l]));

/** Who legislates for a jurisdiction (the body) and who signs or vetoes (the executive). */
export const LEGISLATURE: Record<Jurisdiction, { body: string[]; exec?: string; name: string }> = {
  wildwood: { body: ['ww_commission'], name: 'the Wildwood commission' },
  north: { body: ['nw_council'], exec: 'nw_mayor', name: 'the North Wildwood council' },
  crest: { body: ['crest_commission'], name: 'the Crest commission' },
  ac: { body: ['ac_commission'], name: 'the Atlantic City commission' },
  county: { body: ['cmc_freeholder'], name: 'the Board of Freeholders' },
  state: { body: ['nj_senate_cm', 'nj_assembly_cm', 'nj_senate_ac', 'nj_assembly_ac'], exec: 'nj_governor', name: 'the Legislature in Trenton' },
  federal: { body: ['us_house_nj2', 'us_house_nj1', 'us_senate'], name: 'Congress' },
  philly: { body: [], exec: 'phl_mayor', name: 'Philadelphia City Council' },
};

/**
 * Jurisdiction rule: a body can only pass laws for its own jurisdiction, and a
 * lower body cannot override a higher one (a city ordinance that contradicts a
 * state law in force is struck down on challenge).
 */
export function canLegislate(body: Jurisdiction, law: LawDef): boolean {
  return body === law.juris;
}
export function preempted(law: LawDef, inForce: Record<string, number>): string | undefined {
  if (!law.preemptedBy || inForce[law.preemptedBy] === undefined) return undefined;
  const hi = LAW_BY_ID[law.preemptedBy];
  return hi && LEVEL_RANK[JURIS_LEVEL[hi.juris]] > LEVEL_RANK[JURIS_LEVEL[law.juris]] ? hi.name : undefined;
}
