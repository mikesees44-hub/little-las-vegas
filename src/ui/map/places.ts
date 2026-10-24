/**
 * Hand-placed labels for the map: every Jersey Shore and South Jersey town,
 * Philadelphia neighbourhoods, and 1960-era landmarks (each with the year it
 * opened, so nothing appears before it existed). Coordinates are real.
 */

export interface Place {
  n: string;
  lat: number;
  lon: number;
  /** Minimum zoom to show the label. */
  z: number;
  kind?: 'town' | 'hood' | 'landmark' | 'state';
  /** Landmarks: year it opened; year it closed (if before 1990). */
  since?: number;
  until?: number;
  note?: string;
}

export const NJ_TOWNS: Place[] = [
  { n: 'Wildwood', lat: 38.9918, lon: -74.8149, z: 9 },
  { n: 'North Wildwood', lat: 39.0004, lon: -74.7993, z: 11 },
  { n: 'Wildwood Crest', lat: 38.9748, lon: -74.8335, z: 11 },
  { n: 'West Wildwood', lat: 38.9918, lon: -74.8257, z: 13 },
  { n: 'Diamond Beach', lat: 38.9601, lon: -74.8443, z: 13 },
  { n: 'Cape May', lat: 38.9351, lon: -74.906, z: 8 },
  { n: 'Cape May Point', lat: 38.9376, lon: -74.9671, z: 11 },
  { n: 'Rio Grande', lat: 39.0193, lon: -74.8774, z: 11 },
  { n: 'Cape May Court House', lat: 39.0826, lon: -74.8238, z: 9 },
  { n: 'Villas', lat: 39.0287, lon: -74.9382, z: 10 },
  { n: 'Erma', lat: 38.9876, lon: -74.8971, z: 12 },
  { n: 'Burleigh', lat: 39.0571, lon: -74.8335, z: 12 },
  { n: 'Stone Harbor', lat: 39.051, lon: -74.7579, z: 10 },
  { n: 'Avalon', lat: 39.1012, lon: -74.7177, z: 10 },
  { n: 'Sea Isle City', lat: 39.1534, lon: -74.6929, z: 10 },
  { n: 'Ocean City', lat: 39.2776, lon: -74.5746, z: 8 },
  { n: 'Somers Point', lat: 39.3176, lon: -74.5946, z: 10 },
  { n: 'Margate', lat: 39.3279, lon: -74.5035, z: 10 },
  { n: 'Ventnor', lat: 39.3401, lon: -74.4774, z: 10 },
  { n: 'Atlantic City', lat: 39.3643, lon: -74.4229, z: 7 },
  { n: 'Brigantine', lat: 39.4101, lon: -74.3646, z: 10 },
  { n: 'Absecon', lat: 39.4284, lon: -74.4957, z: 10 },
  { n: 'Pleasantville', lat: 39.3898, lon: -74.524, z: 10 },
  { n: 'Egg Harbor City', lat: 39.5287, lon: -74.6479, z: 9 },
  { n: 'Mays Landing', lat: 39.4523, lon: -74.7277, z: 10 },
  { n: 'Hammonton', lat: 39.6365, lon: -74.8024, z: 9 },
  { n: 'Millville', lat: 39.4021, lon: -75.0393, z: 9 },
  { n: 'Vineland', lat: 39.4864, lon: -75.026, z: 8 },
  { n: 'Bridgeton', lat: 39.4273, lon: -75.2341, z: 9 },
  { n: 'Port Norris', lat: 39.2457, lon: -75.0352, z: 11 },
  { n: 'Glassboro', lat: 39.7029, lon: -75.1118, z: 10 },
  { n: 'Woodbury', lat: 39.8382, lon: -75.1527, z: 10 },
  { n: 'Salem', lat: 39.5718, lon: -75.4672, z: 10 },
  { n: 'Camden', lat: 39.9259, lon: -75.1196, z: 8 },
  { n: 'Cherry Hill', lat: 39.9349, lon: -75.0307, z: 10 },
  { n: 'Trenton', lat: 40.2171, lon: -74.7429, z: 7 },
  { n: 'Toms River', lat: 39.9537, lon: -74.1979, z: 9 },
  { n: 'Seaside Heights', lat: 39.9443, lon: -74.0729, z: 10 },
  { n: 'Long Beach Island', lat: 39.6626, lon: -74.1876, z: 10 },
  { n: 'Asbury Park', lat: 40.2204, lon: -74.0121, z: 9 },
  { n: 'Long Branch', lat: 40.3043, lon: -73.9924, z: 9 },
  { n: 'New Brunswick', lat: 40.4862, lon: -74.4518, z: 9 },
  { n: 'Princeton', lat: 40.3573, lon: -74.6672, z: 10 },
  { n: 'Newark', lat: 40.7357, lon: -74.1724, z: 7 },
  { n: 'Jersey City', lat: 40.7178, lon: -74.0431, z: 8 },
  { n: 'Hoboken', lat: 40.744, lon: -74.0324, z: 10 },
  { n: 'Paterson', lat: 40.9168, lon: -74.1718, z: 9 },
  { n: 'Elizabeth', lat: 40.664, lon: -74.2107, z: 9 },
  { n: 'Wilmington', lat: 39.7391, lon: -75.5398, z: 8 },
  { n: 'Dover', lat: 39.1582, lon: -75.5244, z: 8 },
  { n: 'Lewes', lat: 38.7746, lon: -75.1393, z: 9 },
  { n: 'Rehoboth Beach', lat: 38.721, lon: -75.076, z: 10 },
  { n: 'Chester', lat: 39.8496, lon: -75.3557, z: 9 },
  { n: 'Media', lat: 39.9168, lon: -75.3877, z: 10 },
  { n: 'Norristown', lat: 40.1215, lon: -75.3399, z: 10 },
  { n: 'Bristol', lat: 40.1007, lon: -74.8518, z: 10 },
  { n: 'Ocean City, MD', lat: 38.3365, lon: -75.0849, z: 9 },
  { n: 'Salisbury', lat: 38.3607, lon: -75.5994, z: 9 },
  { n: 'Annapolis', lat: 38.9784, lon: -76.4922, z: 8 },
];

export const PHILLY_HOODS: Place[] = [
  { n: 'Center City', lat: 39.9522, lon: -75.1636, z: 11, kind: 'hood' },
  { n: 'South Philly', lat: 39.9254, lon: -75.1691, z: 11, kind: 'hood' },
  { n: 'Kensington', lat: 39.9922, lon: -75.1282, z: 11, kind: 'hood' },
  { n: 'Germantown', lat: 40.0359, lon: -75.1736, z: 11, kind: 'hood' },
  { n: 'Fishtown', lat: 39.9677, lon: -75.1349, z: 12, kind: 'hood' },
  { n: 'North Philly', lat: 39.9897, lon: -75.1545, z: 12, kind: 'hood' },
  { n: 'Northeast', lat: 40.0532, lon: -75.0596, z: 12, kind: 'hood' },
  { n: 'Point Breeze', lat: 39.9341, lon: -75.1795, z: 13, kind: 'hood' },
];

export const LANDMARKS: Place[] = [
  // Atlantic City
  { n: 'Steel Pier', lat: 39.3611, lon: -74.4214, z: 13, kind: 'landmark', since: 1898, note: 'The Showplace of the Nation: diving horses and big bands.' },
  { n: 'Convention Hall', lat: 39.3559, lon: -74.4398, z: 13, kind: 'landmark', since: 1929, note: 'Miss America\'s home on the boardwalk.' },
  { n: 'The 500 Club', lat: 39.3553, lon: -74.4422, z: 14, kind: 'landmark', since: 1938, note: 'Skinny\'s nightclub on Missouri Avenue. Sinatra played here.' },
  { n: 'Million Dollar Pier', lat: 39.3577, lon: -74.4337, z: 14, kind: 'landmark', since: 1906 },
  { n: 'Club Harlem', lat: 39.3600, lon: -74.4378, z: 14, kind: 'landmark', since: 1935, note: 'Kentucky Avenue after midnight.' },
  { n: 'Lucy the Elephant', lat: 39.3204, lon: -74.5121, z: 13, kind: 'landmark', since: 1881 },
  // Wildwood
  { n: 'Hunt\'s Pier', lat: 38.9938, lon: -74.8044, z: 14, kind: 'landmark', since: 1957, note: 'The Golden Nugget mine ride, new for the 1960 season.' },
  { n: 'Convention Hall', lat: 38.9840, lon: -74.8116, z: 14, kind: 'landmark', since: 1927, note: 'Wildwood\'s old Convention Hall on the boards.' },
  { n: 'Marine Pier', lat: 38.9876, lon: -74.8086, z: 14, kind: 'landmark', since: 1918 },
  { n: 'The Starlux', lat: 38.9815, lon: -74.8188, z: 15, kind: 'landmark', since: 1956 },
  { n: 'The Boardwalk', lat: 38.9905, lon: -74.8083, z: 13, kind: 'landmark', since: 1890, note: 'Two miles of planks and a tram car.' },
  { n: 'Hereford Inlet Lighthouse', lat: 39.0066, lon: -74.7915, z: 14, kind: 'landmark', since: 1874 },
  { n: 'Cape May Lighthouse', lat: 38.9331, lon: -74.9603, z: 13, kind: 'landmark', since: 1859 },
  // Philadelphia
  { n: 'Italian Market', lat: 39.9381, lon: -75.1580, z: 13, kind: 'landmark', since: 1880, note: 'Ninth Street: produce, cheese, and whispers.' },
  { n: 'Independence Hall', lat: 39.9489, lon: -75.15, z: 13, kind: 'landmark', since: 1753 },
  { n: 'Connie Mack Stadium', lat: 39.9962, lon: -75.1648, z: 13, kind: 'landmark', since: 1909, until: 1970 },
  // New York
  { n: 'Copacabana', lat: 40.7637, lon: -73.9709, z: 13, kind: 'landmark', since: 1940 },
  { n: 'Fulton Fish Market', lat: 40.7069, lon: -74.0030, z: 13, kind: 'landmark', since: 1822 },
  // Havana
  { n: 'Hotel Nacional', lat: 23.1426, lon: -82.3594, z: 11, kind: 'landmark', since: 1930, note: 'Where the casino men met in 1946. Its casino is shut now.' },
  { n: 'Hotel Riviera', lat: 23.1395, lon: -82.4014, z: 12, kind: 'landmark', since: 1957 },
  { n: 'Tropicana', lat: 23.105, lon: -82.4161, z: 12, kind: 'landmark', since: 1939 },
  // Las Vegas & elsewhere
  { n: 'The Strip', lat: 36.1147, lon: -115.1728, z: 11, kind: 'landmark', since: 1941 },
  { n: 'The Sands', lat: 36.1215, lon: -115.1696, z: 13, kind: 'landmark', since: 1952 },
  { n: 'The Flamingo', lat: 36.1162, lon: -115.1708, z: 13, kind: 'landmark', since: 1946 },
  { n: 'Fremont Street', lat: 36.1708, lon: -115.1426, z: 12, kind: 'landmark', since: 1906 },
  { n: 'Oaklawn Park', lat: 34.4887, lon: -93.0549, z: 12, kind: 'landmark', since: 1904 },
  { n: 'Pimlico', lat: 39.3520, lon: -76.6730, z: 12, kind: 'landmark', since: 1870 },
  { n: 'Hialeah Park', lat: 25.8263, lon: -80.2848, z: 12, kind: 'landmark', since: 1925 },
];

export const STATE_LABELS: Place[] = [
  ['Maine', 45.3, -69.2], ['N.H.', 43.7, -71.6], ['Vt.', 44.0, -72.7], ['Mass.', 42.3, -71.9], ['R.I.', 41.7, -71.5], ['Conn.', 41.6, -72.7],
  ['New York', 42.9, -75.5], ['New Jersey', 40.1, -74.6], ['Pennsylvania', 40.9, -77.6], ['Delaware', 39.0, -75.5], ['Maryland', 39.05, -76.9],
  ['Virginia', 37.5, -78.8], ['W. Va.', 38.6, -80.6], ['N. Carolina', 35.5, -79.4], ['S. Carolina', 33.9, -80.9], ['Georgia', 32.7, -83.4],
  ['Florida', 28.6, -81.7], ['Alabama', 32.8, -86.8], ['Mississippi', 32.7, -89.7], ['Tennessee', 35.86, -86.4], ['Kentucky', 37.5, -85.3],
  ['Ohio', 40.3, -82.8], ['Michigan', 43.6, -84.7], ['Indiana', 39.9, -86.3], ['Illinois', 40.0, -89.2], ['Wisconsin', 44.6, -89.9],
  ['Minnesota', 46.3, -94.3], ['Iowa', 42.0, -93.5], ['Missouri', 38.4, -92.5], ['Arkansas', 34.9, -92.4], ['Louisiana', 31.1, -92.0],
  ['Texas', 31.5, -99.3], ['Oklahoma', 35.6, -97.5], ['Kansas', 38.5, -98.4], ['Nebraska', 41.5, -99.8], ['S. Dakota', 44.4, -100.2],
  ['N. Dakota', 47.5, -100.5], ['Montana', 47.0, -109.6], ['Wyoming', 43.0, -107.5], ['Colorado', 39.0, -105.5], ['New Mexico', 34.4, -106.1],
  ['Arizona', 34.3, -111.7], ['Utah', 39.3, -111.7], ['Nevada', 39.3, -116.6], ['Idaho', 44.4, -114.6], ['Oregon', 43.9, -120.6],
  ['Washington', 47.4, -120.5], ['California', 37.2, -119.5],
].map(([n, lat, lon]) => ({ n: n as string, lat: lat as number, lon: lon as number, z: 4, kind: 'state' as const }));

/** Who holds the South Jersey towns (for coloured pins at the regional level). */
export const TOWN_OWNERS: Record<string, 'player' | 'philly' | 'manno' | 'newyork' | 'unclaimed' | 'kessler'> = {
  Wildwood: 'player', 'Wildwood Crest': 'player', 'North Wildwood': 'kessler', 'Rio Grande': 'manno', 'Cape May': 'unclaimed', 'Cape May Court House': 'player',
  'Stone Harbor': 'unclaimed', Avalon: 'unclaimed', 'Sea Isle City': 'unclaimed', 'Ocean City': 'unclaimed', 'Somers Point': 'manno', Margate: 'manno', Ventnor: 'manno',
  'Atlantic City': 'manno', Brigantine: 'manno', Absecon: 'manno', Pleasantville: 'manno', 'Egg Harbor City': 'manno', 'Mays Landing': 'manno', Hammonton: 'philly',
  Millville: 'philly', Vineland: 'philly', Bridgeton: 'philly', Glassboro: 'philly', Woodbury: 'philly', Camden: 'philly', 'Cherry Hill': 'philly', Trenton: 'philly',
  Newark: 'newyork', 'Jersey City': 'newyork', Hoboken: 'newyork', 'Asbury Park': 'newyork', 'Long Branch': 'newyork', 'Toms River': 'unclaimed', Villas: 'unclaimed',
};

/** Territory shading of South Jersey counties at the regional zoom (FIPS -> holder). */
export const COUNTY_HOLDERS: Record<string, 'player' | 'philly' | 'manno' | 'newyork' | 'unclaimed'> = {
  '34009': 'player', // Cape May
  '34001': 'manno', // Atlantic
  '34011': 'philly', // Cumberland
  '34015': 'philly', // Gloucester
  '34007': 'philly', // Camden
  '34033': 'philly', // Salem
  '34005': 'philly', // Burlington
  '34021': 'philly', // Mercer
  '42101': 'philly', // Philadelphia
  '42045': 'philly', // Delaware Co.
  '34029': 'unclaimed', // Ocean
  '34025': 'newyork', // Monmouth
  '34013': 'newyork', // Essex
  '34017': 'newyork', // Hudson
};
