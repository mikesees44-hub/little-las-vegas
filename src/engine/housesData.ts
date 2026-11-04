import type { Ethnicity, FactionId } from './types';
import type { HouseType } from './houses';

/**
 * Data for the houses: where families came from, how people died in each
 * era, the titles a house's men held, and the definitions of the houses the
 * engine does not already create (political and police dynasties, old
 * Philadelphia crime families, show-business families).
 */

export type Stock = 'Sicilian' | 'Calabrian' | 'Neapolitan' | 'Abruzzese' | 'Irish' | 'Galician' | 'Litvak' | 'OldStock' | 'Migration' | 'German' | 'Polish' | 'Caribbean';

export const ORIGINS: Record<Stock, string[]> = {
  Sicilian: ['Castellammare del Golfo, Sicily', 'Sciacca, Sicily', 'Partinico, Sicily', 'Licata, Sicily', 'Termini Imerese, Sicily', 'Agrigento, Sicily', 'Bagheria, Sicily'],
  Calabrian: ['Reggio Calabria', 'Cosenza, Calabria', 'Cittanova, Calabria', 'Siderno, Calabria', 'Polistena, Calabria'],
  Neapolitan: ['Naples', 'Avellino, Campania', 'Salerno, Campania', 'Torre del Greco, Campania', 'Nola, Campania', 'Ottaviano, Campania'],
  Abruzzese: ['Sulmona, Abruzzo', 'Chieti, Abruzzo', 'Pescocostanzo, Abruzzo', 'Lanciano, Abruzzo'],
  Irish: ['County Cork', 'County Galway', 'County Mayo', 'County Kerry', 'County Donegal', 'County Clare', 'Skibbereen, County Cork', 'Clifden, County Galway'],
  Galician: ['a shtetl near Tarnów, Galicia', 'Brody, Galicia', 'Kolomyja, Galicia', 'a shtetl outside Lemberg, Galicia', 'Przemyśl, Galicia'],
  Litvak: ['Białystok', 'Vilna', 'Kovno', 'a shtetl near Grodno', 'Berdychiv'],
  OldStock: ['old Salem County Quaker stock', 'Cape May whaling families of the 1690s', 'Philadelphia Main Line stock', 'old Princeton stock', 'Cumberland County farm people since the Revolution'],
  Migration: ['the Great Migration from Virginia', 'the Great Migration from South Carolina', 'the Great Migration from Georgia'],
  German: ['Hamburg, Germany', 'Bremen, Germany', 'Baden, Germany'],
  Polish: ['a village near Kraków', 'Tarnów, Galicia', 'a farm outside Białystok', 'Poznań'],
  Caribbean: ['San Juan, Puerto Rico', 'Ponce, Puerto Rico', 'Mayagüez, Puerto Rico', 'Caguas, Puerto Rico'],
};

/** Years the founder arrived (or the house was founded, for old stock). */
export const ARRIVAL: Record<Stock, [number, number]> = {
  Sicilian: [1886, 1910], Calabrian: [1886, 1910], Neapolitan: [1882, 1908], Abruzzese: [1885, 1910],
  Irish: [1866, 1895], Galician: [1882, 1906], Litvak: [1882, 1906], OldStock: [1866, 1888], Migration: [1895, 1918], German: [1868, 1892], Polish: [1885, 1910], Caribbean: [1899, 1916],
};

export const STOCK_ETH: Record<Stock, Ethnicity> = {
  Sicilian: 'Italian', Calabrian: 'Italian', Neapolitan: 'Italian', Abruzzese: 'Italian', Irish: 'Irish', Galician: 'Jewish', Litvak: 'Jewish',
  OldStock: 'Irish', Migration: 'Irish', German: 'Irish', Polish: 'Irish', Caribbean: 'Italian',
};

/** First names for stocks the engine's lists don't cover. */
export const STOCK_NAMES: Partial<Record<Stock, { M: string[]; F: string[] }>> = {
  OldStock: {
    M: ['Arthur', 'Edgar', 'Walter', 'Charles', 'Henry', 'Calvin', 'Daniel', 'Josiah', 'Nathaniel', 'Elliot', 'Prescott', 'Howard', 'Richard', 'George', 'Samuel', 'Theodore', 'Winthrop', 'Franklin'],
    F: ['Eleanor', 'Margaret', 'Josephine', 'Abigail', 'Harriet', 'Louisa', 'Caroline', 'Edith', 'Florence', 'Martha', 'Constance', 'Virginia', 'Elizabeth', 'Ruth', 'Alice', 'Prudence'],
  },
  Migration: {
    M: ['Thomas', 'Willie', 'James', 'Roosevelt', 'Clarence', 'Marcus', 'Louis', 'Samuel', 'Odell', 'Booker', 'Leroy', 'Henry', 'Calvin', 'Earl'],
    F: ['Mattie', 'Hattie', 'Ella', 'Bessie', 'Cora', 'Pearl', 'Lula', 'Mae', 'Ethel', 'Irene', 'Viola', 'Alberta', 'Ruby', 'Daisy'],
  },
  German: {
    M: ['Heinrich', 'Wilhelm', 'Friedrich', 'Karl', 'Otto', 'Henry', 'William', 'Frederick', 'Daniel', 'Gustav', 'Edward', 'John'],
    F: ['Anna', 'Katharina', 'Margarethe', 'Elisabeth', 'Wilhelmina', 'Bertha', 'Frieda', 'Clara', 'Mary', 'Helen', 'Louise'],
  },
  Polish: {
    M: ['Stanisław', 'Józef', 'Jan', 'Kazimierz', 'Walter', 'Stanley', 'Joseph', 'Edward', 'Frank', 'Chester', 'Henry', 'Thaddeus'],
    F: ['Maria', 'Helena', 'Stefania', 'Jadwiga', 'Sophie', 'Helen', 'Stella', 'Josephine', 'Wanda', 'Irene', 'Genevieve'],
  },
  Caribbean: {
    M: ['José', 'Juan', 'Luis', 'Rafael', 'Carlos', 'Manuel', 'Miguel', 'Ramón', 'Eduardo', 'Pedro', 'Héctor', 'Ángel'],
    F: ['María', 'Carmen', 'Ana', 'Rosa', 'Luz', 'Isabel', 'Gloria', 'Lourdes', 'Juana', 'Milagros', 'Elena', 'Teresa'],
  },
};

/** Surnames for women who married in from outside any house, by stock. */
export const OUTSIDE_SURNAMES: Partial<Record<Stock, string[]>> = {
  OldStock: ['Ashby', 'Hale', 'Winslow', 'Thornton', 'Bradford', 'Coleman', 'Ellis', 'Fairchild', 'Gardner', 'Hollister', 'Lockwood', 'Prentice', 'Ware', 'Stockton'],
  Migration: ['Jackson', 'Johnson', 'Freeman', 'Washington', 'Carter', 'Brooks', 'Hill', 'Gaines', 'Reed', 'Mitchell', 'Coleman', 'Harris'],
  German: ['Schmidt', 'Becker', 'Hoffmann', 'Wagner', 'Krause', 'Vogel', 'Richter', 'Lang', 'Keller', 'Baumann'],
  Polish: ['Kowalski', 'Nowak', 'Wiśniewski', 'Lewandowski', 'Zieliński', 'Kamiński', 'Wójcik', 'Dąbrowski', 'Mazur', 'Krawczyk'],
  Caribbean: ['Rivera', 'Rodríguez', 'Torres', 'Ortiz', 'Colón', 'Santiago', 'Vázquez', 'Morales', 'Cruz', 'Figueroa'],
};

/* ---------------------------------------------------------------- */
/* Causes of death                                                    */
/* ---------------------------------------------------------------- */

export function infantCause(y: number): string[] {
  if (y < 1920) return ['diphtheria', 'scarlet fever', 'cholera infantum', 'whooping cough', 'croup', 'measles'];
  if (y < 1945) return ['pneumonia', 'whooping cough', 'measles', 'diphtheria', 'scarlet fever'];
  return ['pneumonia', 'a fever in the first winter', 'a weak heart'];
}

export function naturalCause(y: number, age: number, g: 'M' | 'F'): string[] {
  if (age < 40) {
    if (y < 1920) return ['consumption', 'typhoid fever', 'pneumonia', 'Bright\'s disease', 'diphtheria'];
    if (y < 1946) return ['tuberculosis', 'pneumonia', 'blood poisoning', 'a burst appendix', y >= 1940 || (y >= 1916 && y <= 1917) ? 'polio' : 'rheumatic fever'];
    return ['pneumonia', 'leukemia', 'a burst appendix', 'polio', 'cancer'];
  }
  if (age < 65) {
    if (y < 1920) return ['apoplexy', 'consumption', 'Bright\'s disease', 'dropsy', 'pneumonia'];
    if (y < 1946) return ['heart failure', 'cancer', 'apoplexy', 'pneumonia', g === 'M' ? 'tuberculosis' : 'cancer'];
    return ['heart attack', 'cancer', 'a stroke', 'sugar diabetes', 'heart attack'];
  }
  if (y < 1920) return ['old age', 'apoplexy', 'dropsy', 'pneumonia'];
  if (y < 1946) return ['old age', 'heart failure', 'a stroke', 'pneumonia'];
  return ['old age', 'heart failure', 'a stroke', 'cancer', 'pneumonia'];
}

export const WW1: [string, number[]][] = [
  ['killed in the Argonne', [1918]], ['killed at Belleau Wood', [1918]], ['killed at Château-Thierry', [1918]], ['died of wounds in France', [1917, 1918]],
  ['lost when the Tuscania was torpedoed', [1918]],
];
export const WW2: [string, number[]][] = [
  ['lost with the USS Juneau', [1942]], ['killed at Guadalcanal', [1942, 1943]], ['killed over Germany with the Eighth Air Force', [1943, 1944]],
  ['killed at Anzio', [1944]], ['killed at Normandy', [1944]], ['killed in the Ardennes', [1944, 1945]], ['killed on Iwo Jima', [1945]],
  ['killed on Okinawa', [1945]], ['killed at Kasserine Pass', [1943]], ['killed at Monte Cassino', [1944]],
];
export const KOREA: [string, number[]][] = [
  ['killed near the Naktong River', [1950]], ['killed at the Chosin Reservoir', [1950]], ['killed at Heartbreak Ridge', [1951]], ['killed at Pork Chop Hill', [1953]],
];

export const SEA_DEATHS = ['lost at sea off Cape May', 'drowned when his trawler went down off Hereford Inlet', 'drowned off the Wildwood beach', 'lost in a nor\'easter off Five Mile Beach'];
export const ACCIDENTS = ['struck by a trolley on Market Street', 'killed in an automobile accident on the Black Horse Pike', 'fell from scaffolding', 'killed in a boarding-house fire', 'killed at the shipyard in Camden'];
export const FIRE_DUTY = ['killed fighting the Ocean Pier fire', 'killed when a roof fell in on Pacific Avenue', 'died of smoke in a boarding-house fire on Atlantic Avenue'];
export const LINE_OF_DUTY = ['killed in the line of duty, shot by a holdup man on Pacific Avenue', 'killed in the line of duty during a bank robbery', 'killed in a motorcycle crash on patrol', 'killed in the line of duty breaking up a speakeasy'];

/** Violent deaths for crime houses: [cause, from, to]. */
export function crimeCauses(eth: Ethnicity, y: number): string[] {
  if (eth === 'Italian') {
    if (y < 1920) return ['killed in a Black Hand vendetta', 'stabbed in a Christian Street feud', 'shot in a café on Mulberry Street'];
    if (y < 1930) return ['shot in the Philadelphia beer wars', 'killed hijacking a rum truck on the White Horse Pike', 'killed by a rival rum-runner off Cape May'];
    if (y <= 1931) return ['killed in the Castellammarese troubles'];
    if (y < 1951) return ['shot outside a Camden social club', 'found in the trunk of a Packard', 'died in prison (Eastern State Penitentiary)'];
    return ['disappeared (body never found)', 'shot on the Atlantic City boardwalk', 'died in prison (Trenton State Prison)'];
  }
  if (eth === 'Jewish') {
    if (y < 1920) return ['shot in a Lower East Side card room'];
    if (y < 1934) return ['shot in the Newark beer wars', 'killed hijacking a liquor shipment'];
    if (y < 1945) return ['killed in the Brownsville purge', 'disappeared in the Pine Barrens'];
    return ['shot in a Miami Beach hotel', 'died in prison (Lewisburg)'];
  }
  if (y < 1920) return ['killed in a brawl on the Schuylkill docks'];
  if (y < 1934) return ['killed in the Kensington bootleg war', 'killed by a rival rum-runner off Cape May'];
  return ['shot outside a North Wildwood tavern', 'disappeared (body never found)', 'died in prison (Trenton State Prison)'];
}

/* ---------------------------------------------------------------- */
/* Titles                                                             */
/* ---------------------------------------------------------------- */

/** Titles a head of house of this type held, by generation from the founder. `{seat}` is replaced. */
export const HEAD_TITLES: Record<HouseType, string[][]> = {
  crime: [
    ['Ran the policy game on Christian Street', 'Padrone of the {seat} fish market', 'Ran an ice-and-coal business that fronted the numbers', 'Black Hand boss of the Italian quarter'],
    ['Rum-runner out of Otten\'s Harbor', 'Boss of the {seat} rackets', 'Ran the slot machines for the {seat} ward', 'Ran the beer for {seat}'],
    ['Boss of the {seat} rackets', 'Capo for Philadelphia in {seat}', 'Ran the boardwalk games in {seat}'],
    ['Boss of the {seat} rackets'],
  ],
  political: [
    ['Ward heeler in {seat}', 'Saloon keeper and ward leader, {seat}', 'Justice of the Peace, {seat}'],
    ['Mayor of {seat}', 'State Assemblyman', '{seat} City Commissioner', 'County Freeholder'],
    ['State Senator', 'Mayor of {seat}', 'Congressman', 'Judge of the Court of Common Pleas'],
    ['State Senator', 'County Clerk', 'Mayor of {seat}'],
  ],
  police: [
    ['Patrolman, {seat}', 'Town constable, {seat}', 'Special officer on the boardwalk'],
    ['Captain of Police, {seat}', 'County detective', 'Sergeant, {seat} police'],
    ['Chief of Police, {seat}', 'County Prosecutor\'s chief of detectives', 'Captain of Police, {seat}'],
    ['Chief of Police, {seat}'],
  ],
  legit: [
    ['Opened a shop on Pacific Avenue', 'Pushcart peddler, then storekeeper in {seat}', 'Built the first boarding house on the block'],
    ['Built the family business in {seat}', 'President of the {seat} Board of Trade'],
    ['President of the {seat} Chamber of Commerce', 'Ran the family business'],
    ['Ran the family business'],
  ],
  fire: [
    ['Volunteer fireman, {seat}', 'Hose company foreman, {seat}'],
    ['Captain, {seat} Fire Department', 'Fire inspector, {seat}'],
    ['Chief of the {seat} Fire Department', 'Fire Marshal, {seat}'],
    ['Chief of the {seat} Fire Department'],
  ],
  showbiz: [
    ['Vaudeville headliner on the Keith circuit', 'Ragtime pianist in Atlantic City saloons', 'Minstrel-show hoofer'],
    ['Bandleader at the Hof Brau, Wildwood', 'Comic on the Borscht Belt', 'Song-and-dance man in the Ziegfeld chorus'],
    ['Recorded for Decca', 'Headliner at the 500 Club', 'Radio star on WCAU'],
    ['Lounge singer on Pacific Avenue'],
  ],
};

/** Titles the other men of a house sometimes held. */
export const MEMBER_TITLES: Record<HouseType, string[]> = {
  crime: ['Ran a numbers bank in {seat}', 'Bookmaker on the boardwalk', 'Ran a card game behind a {seat} bar', 'Union delegate on the docks'],
  political: ['Precinct captain in {seat}', '{seat} city clerk', 'Deputy county clerk', 'Member of the Board of Education'],
  police: ['Patrolman, {seat}', 'Fire captain, {seat}', 'Lifeguard captain, {seat} beach patrol', 'Sergeant, {seat} police'],
  fire: ['Fireman, {seat}', 'Fire captain, {seat}', 'Ladder company lieutenant, {seat}'],
  legit: ['Kept the books for the family business', 'Ran a concession stand on the piers', 'Opened a motel in the Crest'],
  showbiz: ['Drummer in the house band', 'Chorus girl at the Riptide', 'Booking agent on Pacific Avenue'],
};

/* ---------------------------------------------------------------- */
/* Houses the engine does not create                                  */
/* ---------------------------------------------------------------- */

export interface ExtraHouseDef {
  id: string;
  name: string;
  type: HouseType;
  seat: string;
  stock: Stock;
  /** The living head in summer 1960 (absent: the house is extinct by 1960). */
  head?: { first: string; age: number; office: string; g?: 'M' | 'F' };
  blurb: string;
  faction?: FactionId;
  /** World-pack dynasty id (adapter key). */
  pack?: string;
}

/**
 * The political and police dynasties (fallback for the world pack, keyed by
 * its dynasty ids), old Philadelphia crime houses and show-business families.
 * All fictional.
 */
export const EXTRA_HOUSES: ExtraHouseDef[] = [
  { id: 'h_callahan', pack: 'callahan', name: 'Callahan', type: 'political', seat: 'Wildwood', stock: 'Irish', head: { first: 'John', age: 58, office: 'Mayor of Wildwood' }, blurb: 'Machine and patronage: every lifeguard, meter maid and summer cop owes the Callahans a job.' },
  { id: 'h_deluca', pack: 'deluca', name: 'DeLuca', type: 'political', seat: 'Camden', stock: 'Neapolitan', head: { first: 'Anthony', age: 55, office: 'State Senator, Camden County' }, blurb: 'Labor, the waterfront and business, all at once.' },
  { id: 'h_whitcomb', pack: 'whitcomb', name: 'Whitcomb', type: 'political', seat: 'Cape May Court House', stock: 'OldStock', head: { first: 'Arthur', age: 61, office: 'President, Seashore Trust Company' }, blurb: 'Old money and banking; the mortgage on half the motels on the island.' },
  { id: 'h_mercer', pack: 'mercer', name: 'Mercer', type: 'political', seat: 'Cape May Court House', stock: 'OldStock', head: { first: 'Josephine', age: 63, office: 'Cape May County Clerk', g: 'F' }, blurb: 'The party organization: they count the votes and the money.' },
  { id: 'h_greco', pack: 'greco', name: 'Greco', type: 'political', seat: 'Atlantic City', stock: 'Sicilian', head: { first: 'Salvatore', age: 52, office: 'Atlantic City Director of Public Works' }, blurb: 'Tourism, construction, and the long dream of casinos.' },
  { id: 'h_ferraro', pack: 'ferraro', name: 'Ferraro', type: 'political', seat: 'Camden', stock: 'Calabrian', head: { first: 'Louis', age: 57, office: 'Commissioner, Delaware River Port Authority' }, blurb: 'Shipping and licensing; every pier lease crosses a Ferraro desk.' },
  { id: 'h_rosenfeld', pack: 'rosenfeld', name: 'Rosenfeld', type: 'political', seat: 'Wildwood', stock: 'Galician', head: { first: 'Samuel', age: 60, office: 'Wildwood City Commissioner (reform)' }, blurb: 'Reform and investigations; the family that keeps files.' },
  { id: 'h_ohara', pack: 'ohara', name: 'O\'Hara', type: 'political', seat: 'Camden', stock: 'Irish', head: { first: 'Francis', age: 62, office: 'President, Shipyard Workers Local 1' }, blurb: 'Labor populism; TV-friendly sons.' },
  { id: 'h_pembroke', pack: 'pembroke', name: 'Pembroke', type: 'political', seat: 'Trenton', stock: 'OldStock', head: { first: 'Walter', age: 64, office: 'Justice of the New Jersey Supreme Court' }, blurb: 'The establishment: judges, bonds, Princeton.' },
  { id: 'h_halbrook', pack: 'halbrook', name: 'Halbrook', type: 'political', seat: 'Salem County', stock: 'OldStock', head: { first: 'Edwin', age: 59, office: 'State Highway Commissioner' }, blurb: 'Highways, housing, and the contractors who build them.' },
  { id: 'h_bell', pack: 'bell', name: 'Bell', type: 'political', seat: 'North Philadelphia', stock: 'Migration', head: { first: 'Thomas', age: 54, office: 'Philadelphia City Councilman' }, blurb: 'A Black ward organization: jobs, churches, and the numbers money nobody talks about. Summers in Wildwood.' },
  { id: 'h_vassallo', pack: 'vassallo', name: 'Vassallo', type: 'political', seat: 'Atlantic City', stock: 'Sicilian', head: { first: 'Dominic', age: 56, office: 'Atlantic City Comptroller' }, blurb: 'Budget masters and prosecutors.' },
  { id: 'h_katz', pack: 'katz', name: 'Katz', type: 'political', seat: 'Newark', stock: 'Litvak', head: { first: 'Bernard', age: 58, office: 'Democratic State Committee chairman' }, blurb: 'Candidate brokers, then media men.' },
  { id: 'h_sterling', pack: 'sterling', name: 'Sterling', type: 'police', seat: 'Trenton', stock: 'OldStock', head: { first: 'Edgar', age: 57, office: 'First Assistant Attorney General of New Jersey' }, blurb: 'Law and order, and a long memory.' },
  { id: 'h_whitaker', pack: 'whitaker', name: 'Whitaker', type: 'political', seat: 'Newark', stock: 'OldStock', head: { first: 'Daniel', age: 46, office: 'Assistant U.S. Attorney, Newark' }, blurb: 'Clean politics, as clean as the family can afford.' },
  { id: 'h_russo', pack: 'russo', name: 'Russo', type: 'political', seat: 'Atlantic City', stock: 'Neapolitan', head: { first: 'Vincent', age: 53, office: 'Business agent, Hotel & Restaurant Workers' }, blurb: 'Union organizers and arbitrators on Atlantic Avenue.' },
  { id: 'h_hensley', pack: 'hensley', name: 'Hensley', type: 'political', seat: 'Vineland', stock: 'OldStock', head: { first: 'Calvin', age: 66, office: 'Cumberland County Freeholder Director' }, blurb: 'Agricultural patronage and Protestant respectability.' },
  { id: 'h_doyle', pack: 'doyle', name: 'Doyle', type: 'police', seat: 'Atlantic City', stock: 'Irish', head: { first: 'Francis', age: 55, office: 'Captain, Atlantic City Police' }, blurb: 'A police family that went into politics.' },
  // Old Philadelphia and shore crime houses.
  { id: 'h_benedetto', name: 'Benedetto', type: 'crime', seat: 'South Philadelphia', stock: 'Sicilian', blurb: 'The old Christian Street family that ran Philadelphia before the Table. Their last boss died in the troubles of 1931 and left no son to carry the name.' },
  { id: 'h_lucarelli', name: 'Lucarelli', type: 'crime', seat: 'South Philadelphia', stock: 'Calabrian', faction: 'philly', head: { first: 'Nicholas', age: 61, office: 'Old capo of the Ninth Street market' }, blurb: 'Calabrian butchers and shylocks of the Ninth Street market. They sit at the back of the Table and remember everything.' },
  { id: 'h_rourke', name: 'Rourke', type: 'crime', seat: 'Atlantic City', stock: 'Irish', blurb: 'Irish rum-runners who owned the inlet in the twenties. The line ended in prison.' },
  // Show business.
  { id: 'h_delvecchio', name: 'Delvecchio', type: 'showbiz', seat: 'South Philadelphia', stock: 'Neapolitan', head: { first: 'Frankie', age: 44, office: 'Crooner, headliner on Pacific Avenue' }, blurb: 'Three generations of singers out of South Philly. The clubs on Pacific Avenue book them every summer.' },
  { id: 'h_kaminsky', name: 'Kaminsky', type: 'showbiz', seat: 'Atlantic City', stock: 'Galician', head: { first: 'Morty', age: 50, office: 'Comic, the 500 Club and the Catskills' }, blurb: 'Comics from the Borscht Belt to the 500 Club.' },
  { id: 'h_flanagan', name: 'Flanagan', type: 'showbiz', seat: 'Wildwood', stock: 'Irish', head: { first: 'Kathleen', age: 47, office: 'Owner of the Flanagan Dance Revue', g: 'F' }, blurb: 'Vaudeville hoofers who settled on the island and taught half of Wildwood to tap.' },
  // The outfits beyond the shore (fictional): New York, Chicago, Las Vegas, Cleveland.
  { id: 'h_ruggeri', name: 'Ruggeri', type: 'crime', seat: 'Brooklyn', stock: 'Sicilian', head: { first: 'Carmine', age: 63, office: 'Boss of a Brooklyn family' }, blurb: 'One of the New York families. They send a man down every summer to see who is making money at the shore.' },
  { id: 'h_pellegrini', name: 'Pellegrini', type: 'crime', seat: 'Chicago', stock: 'Neapolitan', head: { first: 'Salvatore', age: 58, office: 'A captain of the Chicago Outfit' }, blurb: 'The Outfit\'s men: unions, the wire, and the Teamsters\' pension money that builds the desert.' },
  { id: 'h_adler', name: 'Adler', type: 'crime', seat: 'Las Vegas', stock: 'Galician', head: { first: 'Meyer', age: 55, office: 'Casino man on the Strip' }, blurb: 'The count room in the desert. Everyone back east has a point in a Vegas casino, and the Adlers keep the skim honest.' },
  { id: 'h_galvani', name: 'Galvani', type: 'crime', seat: 'Cleveland', stock: 'Abruzzese', head: { first: 'Angelo', age: 61, office: 'Underboss of the Cleveland family' }, blurb: 'Lake Erie money with a hand in the Vegas casinos and the jukebox routes.' },
];

/** Stock, seat and type for the houses the engine already creates. */
export const KNOWN_HOUSES: Record<string, { type: HouseType; seat: string; stock: Stock; blurb?: string }> = {
  h_manno: { type: 'crime', seat: 'Atlantic City', stock: 'Sicilian' },
  h_feldstein: { type: 'crime', seat: 'Manhattan', stock: 'Galician' },
  h_kessler: { type: 'crime', seat: 'North Wildwood', stock: 'German' },
  h_moretti: { type: 'crime', seat: 'South Philadelphia', stock: 'Calabrian' },
  h_carbone: { type: 'crime', seat: 'Camden', stock: 'Neapolitan' },
  h_nardella: { type: 'crime', seat: 'Trenton', stock: 'Abruzzese' },
  h_dougherty: { type: 'political', seat: 'Wildwood', stock: 'Irish' },
  h_pruitt: { type: 'political', seat: 'Cape May Court House', stock: 'OldStock' },
  h_albanese: { type: 'legit', seat: 'Wildwood', stock: 'Neapolitan' },
  h_keane: { type: 'legit', seat: 'Wildwood Crest', stock: 'Irish' },
  h_weiss: { type: 'legit', seat: 'Wildwood', stock: 'Galician' },
  h_donnelly: { type: 'legit', seat: 'Wildwood', stock: 'Irish' },
};

/** Officials who head police/political houses of their own. */
export const OFFICIAL_HOUSES: Record<string, { type: HouseType; seat: string; stock: Stock; blurb: string }> = {
  'Police sergeant': { type: 'police', seat: 'Wildwood', stock: 'Irish', blurb: 'Wildwood cops since the boardwalk was planks over sand.' },
  'Chief of Police': { type: 'police', seat: 'Wildwood', stock: 'Irish', blurb: 'The Chief\'s people: a badge in every generation.' },
  'County judge': { type: 'political', seat: 'Cape May Court House', stock: 'German', blurb: 'Lawyers and judges of the county courthouse.' },
  'IRS agent': { type: 'police', seat: 'Camden', stock: 'Irish', blurb: 'Treasury men and accountants. They count.' },
};

export const FACTION_SEAT: Partial<Record<FactionId, string>> = {
  player: 'Wildwood', manno: 'Atlantic City', feldstein: 'Manhattan', kessler: 'North Wildwood', philly: 'South Philadelphia', law: 'Cape May Court House',
};

export const CREST_COLORS: [string, string][] = [
  ['#7a1f1f', '#d9b75f'], ['#1f3a5a', '#e8e1d0'], ['#1f4a32', '#d9b75f'], ['#3f2350', '#ecd38f'], ['#2a2622', '#c49a3a'],
  ['#5a3a1a', '#f0e6cf'], ['#203040', '#c4483c'], ['#4a1a2a', '#e0c890'], ['#1a4a4a', '#f2ead8'], ['#383838', '#b8b8b8'],
  ['#6a4a1a', '#1d1a17'], ['#24365a', '#d9b75f'],
];

export function stockFor(eth: Ethnicity, h: number): Stock {
  if (eth === 'Jewish') return h % 3 === 0 ? 'Litvak' : 'Galician';
  if (eth === 'Irish') return 'Irish';
  return (['Sicilian', 'Calabrian', 'Neapolitan', 'Abruzzese', 'Sicilian', 'Neapolitan'] as Stock[])[h % 6];
}
