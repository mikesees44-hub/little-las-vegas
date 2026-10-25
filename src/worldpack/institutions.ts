/**
 * Institutions, career ladders, elected/appointed offices, dynasties and the
 * links to characters the engine already creates.
 *
 * Real-structure notes (summer 1960):
 *  - Wildwood and Wildwood Crest: Walsh Act commission government. Three
 *    commissioners elected at large, nonpartisan, concurrent four-year terms;
 *    the commission picks one of its own as mayor and splits the departments
 *    (Public Affairs, Revenue & Finance, Public Safety, Public Works, Parks &
 *    Public Property). Elections were held in May until the 2010s.
 *  - North Wildwood: "City" form, partisan mayor and council (ward and at-large seats).
 *  - Atlantic City: Walsh Act commission, five commissioners, nonpartisan May elections.
 *  - New Jersey before 1966 reapportionment: one State Senator per county (4-year
 *    terms), Assembly seats apportioned by county population (2-year terms). No
 *    Lieutenant Governor. Governor limited to two consecutive 4-year terms.
 *    Attorney General appointed by the Governor. County prosecutors appointed by
 *    the Governor with Senate consent for 5 years. County Courts existed until 1978.
 *    Sheriffs elected for 3 years, county clerks and surrogates for 5.
 *  - Boards of Chosen Freeholders ran the counties (Cape May's board is modeled as 3).
 *  - Philadelphia: 1951 Home Rule Charter, mayor 4 years (two-term limit), elected
 *    DA, appointed Police Commissioner, elected magistrates (abolished 1969).
 * Where a detail could not be verified it is marked "plausible" in the note.
 */
import type { CareerLadder, Dynasty, ElectedOffice, GameRef, Institution, LadderId } from './schema';

export const INSTITUTIONS: Institution[] = [
  { id: 'wildwood_city', name: 'City of Wildwood (Board of Commissioners)', domain: 'political', jurisdiction: 'Wildwood', ladder: 'local_politics', note: 'Walsh Act commission: 3 commissioners, nonpartisan, 4-year concurrent terms, mayor chosen from among them.' },
  { id: 'north_wildwood_city', name: 'City of North Wildwood (Mayor and Council)', domain: 'political', jurisdiction: 'North Wildwood', ladder: 'local_politics', note: 'City form: partisan mayor (4 years) and 7-member council (6 ward, 1 at-large).' },
  { id: 'crest_borough', name: 'Borough of Wildwood Crest (Board of Commissioners)', domain: 'political', jurisdiction: 'Wildwood Crest', ladder: 'local_politics', note: 'Walsh Act commission since 1937: 3 commissioners, nonpartisan, 4-year terms.' },
  { id: 'west_wildwood', name: 'Borough of West Wildwood', domain: 'political', jurisdiction: 'West Wildwood', ladder: 'local_politics', note: 'Tiny bayside borough; modeled as a 3-member commission (plausible).' },
  { id: 'cape_may_city', name: 'City of Cape May', domain: 'political', jurisdiction: 'Cape May', ladder: 'local_politics', note: 'Victorian resort at the tip of the county; mayor and council (plausible).' },
  { id: 'middle_twp', name: 'Middle Township Committee', domain: 'political', jurisdiction: 'Middle Township (Rio Grande, Cape May Court House, Whitesboro)', ladder: 'local_politics', note: 'Township committee, partisan, 3-year staggered terms.' },
  { id: 'lower_twp', name: 'Lower Township Committee', domain: 'political', jurisdiction: 'Lower Township (Villas, Erma, Cold Spring)', ladder: 'local_politics', note: 'Township committee, partisan, 3-year staggered terms.' },
  { id: 'cape_may_county', name: 'County of Cape May (Freeholders and constitutional officers)', domain: 'political', jurisdiction: 'Cape May County', ladder: 'county_politics', note: 'Board of Chosen Freeholders (3, plausible size), County Clerk (5 yrs), Surrogate (5 yrs), Sheriff (3 yrs). Seat at Cape May Court House.' },
  { id: 'cape_may_party_r', name: 'Cape May County Republican Organization', domain: 'political', jurisdiction: 'Cape May County', ladder: 'party_machine', note: 'The dominant party in the county in 1960.' },
  { id: 'cape_may_party_d', name: 'Cape May County Democratic Organization', domain: 'political', jurisdiction: 'Cape May County', ladder: 'party_machine', note: 'The out party, strong only in Wildwood\'s working wards.' },
  { id: 'atlantic_county', name: 'County of Atlantic', domain: 'political', jurisdiction: 'Atlantic County', ladder: 'county_politics', note: 'A Republican county machine runs everything from Atlantic City.' },
  { id: 'nj_legislature', name: 'New Jersey Legislature', domain: 'political', jurisdiction: 'New Jersey', ladder: 'state_politics', note: 'Senate: one senator per county, 4 years. Assembly: by county population, 2 years.' },
  { id: 'nj_executive', name: 'Office of the Governor of New Jersey', domain: 'political', jurisdiction: 'New Jersey', ladder: 'state_politics', note: 'Governor (4 years, 2 consecutive terms max) and appointed cabinet. No Lt. Governor in 1960.' },
  { id: 'nj_agencies', name: 'New Jersey state agencies', domain: 'political', jurisdiction: 'New Jersey', ladder: 'state_politics', note: 'Division of Alcoholic Beverage Control (liquor licenses), Racing Commission, Highway Authority (Garden State Parkway), Department of Labor.' },
  { id: 'nj_party', name: 'New Jersey state party committees', domain: 'political', jurisdiction: 'New Jersey', ladder: 'party_machine', note: 'State chairmen broker the statewide tickets.' },
  { id: 'drpa', name: 'Delaware River Port Authority', domain: 'political', jurisdiction: 'Philadelphia-Camden waterfront', ladder: 'state_politics', note: 'Bi-state authority (real); commissioners appointed by both governors. Bridges, piers, contracts.' },
  { id: 'us_congress', name: 'United States Congress (New Jersey delegation)', domain: 'political', jurisdiction: 'New Jersey', ladder: 'federal_politics', note: 'US House 2-year terms; US Senate 6-year terms (NJ seats up 1960 and 1964).' },
  { id: 'atlantic_city', name: 'City of Atlantic City (Board of Commissioners)', domain: 'political', jurisdiction: 'Atlantic City', ladder: 'local_politics', note: 'Walsh Act commission of 5, nonpartisan May elections; the county machine picks the slate.' },
  { id: 'philadelphia_city', name: 'City of Philadelphia', domain: 'political', jurisdiction: 'Philadelphia', ladder: 'ward_politics', note: '1951 Home Rule Charter: mayor (4 yrs, 2-term limit), 17-member council, elected DA.' },
  { id: 'philadelphia_ward', name: 'Philadelphia ward organizations', domain: 'political', jurisdiction: 'Philadelphia', ladder: 'ward_politics', note: '66 wards, each with a ward leader elected by its committeemen; the real power on the street.' },

  { id: 'wildwood_pd', name: 'Wildwood Police Department', domain: 'police', jurisdiction: 'Wildwood', ladder: 'municipal_police', note: 'Under the Commissioner of Public Safety. Swells with summer "special officers" every June.' },
  { id: 'north_wildwood_pd', name: 'North Wildwood Police Department', domain: 'police', jurisdiction: 'North Wildwood', ladder: 'municipal_police', note: 'Small department; Danny Kessler\'s clubs are on its beat.' },
  { id: 'crest_pd', name: 'Wildwood Crest Police Department', domain: 'police', jurisdiction: 'Wildwood Crest', ladder: 'municipal_police', note: 'Family-resort department: noise complaints and motel thefts.' },
  { id: 'cmc_prosecutor_detectives', name: 'Cape May County Prosecutor\'s Office, County Detectives', domain: 'police', jurisdiction: 'Cape May County', ladder: 'county_detectives', note: 'The prosecutor\'s own investigators; the county\'s only plainclothes squad.' },
  { id: 'cmc_sheriff', name: 'Cape May County Sheriff\'s Office', domain: 'police', jurisdiction: 'Cape May County', ladder: 'sheriff', note: 'Runs the county jail, serves process, transports prisoners, empanels juries.' },
  { id: 'nj_state_police', name: 'New Jersey State Police', domain: 'police', jurisdiction: 'New Jersey', ladder: 'state_police', note: 'Troop A covers South Jersey; stations at Woodbine and on the Parkway. A small intelligence unit watches organized crime.' },
  { id: 'atlantic_city_pd', name: 'Atlantic City Police Department', domain: 'police', jurisdiction: 'Atlantic City', ladder: 'big_city_police', note: 'Big-resort department; vice squad famous for knowing nothing.' },
  { id: 'philadelphia_pd', name: 'Philadelphia Police Department', domain: 'police', jurisdiction: 'Philadelphia', ladder: 'big_city_police', note: 'Appointed commissioner; districts, a detective bureau, vice ("the Squad"), and an intelligence unit.' },
  { id: 'fbi_newark', name: 'FBI Newark Field Office and Atlantic City Resident Agency', domain: 'police', jurisdiction: 'New Jersey', ladder: 'fbi', note: 'After Apalachin (1957) the Bureau\'s Top Hoodlum Program is running; a resident agency covers the shore.' },
  { id: 'fbi_philadelphia', name: 'FBI Philadelphia Field Office', domain: 'police', jurisdiction: 'Eastern Pennsylvania', ladder: 'fbi', note: 'Watches the Philadelphia family; shares informants with Newark when it suits.' },
  { id: 'federal_other', name: 'Other federal agencies', domain: 'police', jurisdiction: 'Federal', ladder: 'fbi', note: 'Federal Bureau of Narcotics, Treasury\'s Alcohol and Tobacco Tax Division, IRS Intelligence.' },

  { id: 'wildwood_fd', name: 'Wildwood Fire Department', domain: 'fire', jurisdiction: 'Wildwood', ladder: 'fire_paid', note: 'Paid career core with volunteer companies; responsible for the boardwalk and piers.' },
  { id: 'north_wildwood_fd', name: 'North Wildwood Volunteer Fire Company', domain: 'fire', jurisdiction: 'North Wildwood', ladder: 'fire_volunteer', note: 'Volunteer company with its own social hall and its own politics.' },
  { id: 'crest_fd', name: 'Wildwood Crest Volunteer Fire Company', domain: 'fire', jurisdiction: 'Wildwood Crest', ladder: 'fire_volunteer', note: 'Volunteers; the motel owners sit on its board.' },
  { id: 'county_fire', name: 'Cape May County Fire Marshal and building officials', domain: 'fire', jurisdiction: 'Cape May County', ladder: 'inspector', note: 'Fire marshal, building and boardwalk safety inspectors (plausible structure).' },
  { id: 'state_fire', name: 'New Jersey State fire and arson investigators', domain: 'fire', jurisdiction: 'New Jersey', ladder: 'inspector', note: 'State Police arson unit and state fire safety inspectors.' },
  { id: 'insurance', name: 'Fire insurance underwriters and adjusters', domain: 'fire', jurisdiction: 'Philadelphia-South Jersey', ladder: 'inspector', note: 'Company adjusters and the underwriters\' arson bureau; they decide whether a fire pays.' },

  { id: 'cmc_prosecutor', name: 'Cape May County Prosecutor\'s Office', domain: 'legal', jurisdiction: 'Cape May County', ladder: 'prosecutor_office', note: 'Prosecutor appointed by the Governor for 5 years; part-time assistants keep private practices.' },
  { id: 'atlantic_prosecutor', name: 'Atlantic County Prosecutor\'s Office', domain: 'legal', jurisdiction: 'Atlantic County', ladder: 'prosecutor_office', note: 'Appointed; the county machine\'s man.' },
  { id: 'nj_attorney_general', name: 'New Jersey Attorney General and Division of Law', domain: 'legal', jurisdiction: 'New Jersey', ladder: 'prosecutor_office', note: 'AG appointed by the Governor; deputy AGs can supersede a county prosecutor.' },
  { id: 'us_attorney_nj', name: 'United States Attorney for the District of New Jersey', domain: 'legal', jurisdiction: 'New Jersey', ladder: 'federal_prosecutor', note: 'Newark headquarters, Camden branch for South Jersey.' },
  { id: 'philadelphia_da', name: 'Philadelphia District Attorney\'s Office', domain: 'legal', jurisdiction: 'Philadelphia', ladder: 'prosecutor_office', note: 'Elected DA, 4-year term.' },
  { id: 'municipal_court', name: 'Municipal courts (Wildwood, North Wildwood, Crest)', domain: 'legal', jurisdiction: 'Wildwood island', ladder: 'bench_nj', note: 'Part-time judges appointed by the governing body for 3 years: drunks, gambling summonses, boardwalk fights.' },
  { id: 'county_court', name: 'Cape May County Court and County District Court', domain: 'legal', jurisdiction: 'Cape May County', ladder: 'bench_nj', note: 'County Court (abolished 1978) tries indictable crimes; judges appointed for 5 years.' },
  { id: 'superior_court', name: 'New Jersey Superior Court', domain: 'legal', jurisdiction: 'New Jersey', ladder: 'bench_nj', note: 'Law, Chancery and Appellate Divisions; 7-year appointment then tenure to 70.' },
  { id: 'nj_supreme_court', name: 'New Jersey Supreme Court', domain: 'legal', jurisdiction: 'New Jersey', ladder: 'bench_nj', note: '7 justices; same appointment rule as the Superior Court.' },
  { id: 'federal_court', name: 'US District Court for the District of New Jersey (Camden and Newark)', domain: 'legal', jurisdiction: 'New Jersey', ladder: 'bench_federal', note: 'Life tenure; US Commissioners handle warrants and bail.' },
  { id: 'philadelphia_courts', name: 'Philadelphia courts (Common Pleas, Quarter Sessions, magistrates)', domain: 'legal', jurisdiction: 'Philadelphia', ladder: 'bench_nj', note: 'Elected judges; magistrates are elected and notoriously reachable until abolished in 1969.' },
  { id: 'private_bar', name: 'Private bar', domain: 'legal', jurisdiction: 'South Jersey and Philadelphia', ladder: 'bar', note: 'From storefront practitioners to Philadelphia firms that never admit to criminal work.' },
  { id: 'bail', name: 'Bail bonds', domain: 'legal', jurisdiction: 'Cape May and Atlantic counties', ladder: 'civilian', note: 'Bondsmen across from the courthouse.' },

  { id: 'street', name: 'The street', domain: 'street', jurisdiction: 'South Jersey and Philadelphia', ladder: 'street', note: 'Unaffiliated toughs, hustlers and women in the life who can be recruited.' },
  { id: 'showbiz', name: 'Show business', domain: 'entertainment', jurisdiction: 'Wildwood-Philadelphia-New York-Las Vegas-Hollywood', ladder: 'showbiz_performer', note: 'Clubs, records, TV, films.' },
  { id: 'business', name: 'Local business', domain: 'civilian', jurisdiction: 'Wildwood island', ladder: 'civilian', note: 'Motels, rides, shops, banks, contractors.' },
  { id: 'church', name: 'Churches and synagogues', domain: 'civilian', jurisdiction: 'Wildwood island', ladder: 'civilian', note: 'Catholic parishes, Protestant churches, a synagogue, a Black Baptist and an AME church.' },
  { id: 'press', name: 'The press', domain: 'civilian', jurisdiction: 'South Jersey and Philadelphia', ladder: 'civilian', note: 'Local weeklies, the Atlantic City daily, Philadelphia papers and TV.' },
  { id: 'union', name: 'Unions', domain: 'civilian', jurisdiction: 'South Jersey and Philadelphia', ladder: 'civilian', note: 'Hotel and restaurant workers, building trades, longshoremen, musicians, Teamsters.' },
  { id: 'medicine', name: 'Doctors and hospitals', domain: 'civilian', jurisdiction: 'Cape May County', ladder: 'civilian', note: 'Burdette Tomlin hospital in Cape May Court House and private practices (hospital named as backdrop only).' },
  { id: 'community', name: 'Townsfolk', domain: 'civilian', jurisdiction: 'Wildwood island', ladder: 'civilian', note: 'Widows, landladies, retirees, the people who see everything.' },
];

/* ------------------------------------------------------------------ */
/* Career ladders                                                      */
/* ------------------------------------------------------------------ */

const r = (title: string, minYears: number, promote: number, scandal: number, retireAge: number, retire: number, salary: number, envelope: number, slots: number) =>
  ({ title, minYears, promote, scandal, retireAge, retire, salary, envelope, slots });

export const LADDERS: Record<LadderId, CareerLadder> = {
  municipal_police: { id: 'municipal_police', name: 'Shore-town police', raise: 0.03, rungs: [
    r('Special officer (summer)', 0, 0.35, 0.02, 0, 0, 1200, 5, 30),
    r('Patrolman', 3, 0.12, 0.03, 60, 0.15, 4300, 15, 24),
    r('Sergeant / Detective', 3, 0.10, 0.04, 62, 0.15, 5100, 30, 6),
    r('Lieutenant', 3, 0.08, 0.04, 62, 0.2, 5700, 50, 3),
    r('Captain', 3, 0.06, 0.05, 65, 0.2, 6300, 75, 1),
    r('Chief of Police', 0, 0, 0.06, 65, 0.25, 7500, 125, 1),
  ] },
  big_city_police: { id: 'big_city_police', name: 'Big-city police (Philadelphia, Atlantic City)', raise: 0.03, rungs: [
    r('Patrolman', 2, 0.10, 0.03, 63, 0.12, 4800, 10, 4000),
    r('Detective', 3, 0.09, 0.04, 63, 0.12, 5500, 25, 600),
    r('Sergeant', 3, 0.10, 0.04, 63, 0.12, 5900, 35, 400),
    r('Lieutenant', 3, 0.08, 0.05, 63, 0.15, 6600, 60, 150),
    r('Captain', 4, 0.06, 0.06, 65, 0.15, 7600, 120, 40),
    r('Inspector', 4, 0.05, 0.06, 65, 0.2, 8800, 200, 12),
    r('Deputy Commissioner / Deputy Chief', 3, 0.10, 0.07, 65, 0.2, 10500, 300, 3),
    r('Commissioner / Chief', 0, 0, 0.08, 68, 0.25, 15000, 500, 1),
  ] },
  state_police: { id: 'state_police', name: 'New Jersey State Police', raise: 0.035, rungs: [
    r('Trooper', 3, 0.12, 0.015, 55, 0.1, 4600, 0, 700),
    r('Detective / Sergeant', 4, 0.09, 0.015, 55, 0.12, 5600, 0, 140),
    r('Lieutenant', 4, 0.08, 0.015, 55, 0.15, 6800, 0, 40),
    r('Captain', 4, 0.07, 0.02, 55, 0.15, 7800, 0, 12),
    r('Major', 4, 0.10, 0.02, 55, 0.2, 9000, 0, 4),
    r('Colonel (Superintendent)', 0, 0, 0.03, 60, 0.25, 14000, 0, 1),
  ] },
  county_detectives: { id: 'county_detectives', name: 'County detectives', raise: 0.03, rungs: [
    r('County Detective', 3, 0.10, 0.04, 63, 0.15, 5000, 25, 6),
    r('Sergeant of County Detectives', 4, 0.08, 0.04, 63, 0.15, 5800, 40, 2),
    r('Captain of County Detectives', 4, 0.06, 0.05, 65, 0.2, 6600, 60, 1),
    r('Chief of County Detectives', 0, 0, 0.05, 65, 0.2, 7400, 90, 1),
  ] },
  sheriff: { id: 'sheriff', name: 'Sheriff\'s office', raise: 0.03, rungs: [
    r('Sheriff\'s officer / jail guard', 2, 0.08, 0.05, 63, 0.15, 3900, 15, 20),
    r('Sheriff\'s sergeant', 3, 0.08, 0.05, 63, 0.15, 4600, 25, 4),
    r('Undersheriff', 3, 0.15, 0.05, 65, 0.15, 5600, 50, 1),
    r('Sheriff (elected)', 0, 0, 0.06, 70, 0.2, 9000, 100, 1),
  ] },
  fbi: { id: 'fbi', name: 'Federal agents (FBI, FBN, Treasury, IRS)', raise: 0.035, rungs: [
    r('Special Agent (probationary)', 1, 0.6, 0.005, 0, 0, 5400, 0, 50),
    r('Special Agent', 5, 0.06, 0.008, 55, 0.08, 7200, 0, 300),
    r('Senior Resident Agent', 3, 0.08, 0.008, 55, 0.1, 8600, 0, 10),
    r('Supervisor', 3, 0.10, 0.008, 55, 0.12, 9600, 0, 20),
    r('Assistant Special Agent in Charge', 3, 0.10, 0.01, 55, 0.15, 11000, 0, 3),
    r('Special Agent in Charge', 4, 0.05, 0.01, 60, 0.2, 13500, 0, 1),
    r('Inspector / Assistant Director', 0, 0, 0.01, 62, 0.25, 16000, 0, 1),
  ] },
  fire_paid: { id: 'fire_paid', name: 'Paid fire department', raise: 0.03, rungs: [
    r('Firefighter', 3, 0.10, 0.02, 60, 0.15, 4000, 5, 20),
    r('Engineer / Driver', 3, 0.10, 0.02, 60, 0.15, 4400, 10, 6),
    r('Lieutenant', 3, 0.09, 0.03, 62, 0.15, 4900, 15, 4),
    r('Captain', 4, 0.07, 0.03, 62, 0.2, 5500, 25, 3),
    r('Deputy Chief', 4, 0.10, 0.04, 65, 0.2, 6200, 40, 1),
    r('Fire Chief', 0, 0, 0.04, 65, 0.25, 7000, 60, 1),
  ] },
  fire_volunteer: { id: 'fire_volunteer', name: 'Volunteer fire company', raise: 0, rungs: [
    r('Volunteer', 2, 0.15, 0.02, 70, 0.1, 0, 0, 40),
    r('Lieutenant', 2, 0.15, 0.02, 70, 0.1, 0, 0, 3),
    r('Captain', 2, 0.15, 0.02, 70, 0.1, 0, 0, 2),
    r('Assistant Chief', 2, 0.25, 0.03, 70, 0.15, 0, 0, 1),
    r('Chief (elected by the company)', 0, 0, 0.03, 75, 0.2, 0, 0, 1),
  ] },
  inspector: { id: 'inspector', name: 'Inspectors, marshals and adjusters', raise: 0.03, rungs: [
    r('Inspector / Adjuster', 3, 0.10, 0.05, 65, 0.15, 4800, 25, 12),
    r('Senior Inspector / Investigator', 4, 0.08, 0.05, 65, 0.15, 5800, 40, 4),
    r('Chief Inspector / Fire Marshal', 0, 0, 0.06, 68, 0.2, 7000, 75, 1),
  ] },
  prosecutor_office: { id: 'prosecutor_office', name: 'Prosecutor\'s office', raise: 0.04, rungs: [
    r('Assistant Prosecutor', 3, 0.12, 0.02, 0, 0.08, 6000, 40, 8),
    r('Senior Assistant / Chief Trial Attorney', 3, 0.10, 0.02, 0, 0.1, 7500, 60, 3),
    r('First Assistant', 3, 0.15, 0.03, 0, 0.1, 9000, 90, 1),
    r('Prosecutor / District Attorney / Attorney General', 0, 0, 0.04, 70, 0.15, 12000, 200, 1),
  ] },
  federal_prosecutor: { id: 'federal_prosecutor', name: 'US Attorney\'s office', raise: 0.04, rungs: [
    r('Assistant US Attorney', 3, 0.10, 0.008, 0, 0.12, 8000, 0, 25),
    r('Chief, Criminal Division', 3, 0.12, 0.008, 0, 0.12, 11000, 0, 1),
    r('First Assistant US Attorney', 2, 0.20, 0.01, 0, 0.12, 13000, 0, 1),
    r('United States Attorney', 0, 0, 0.01, 0, 0.2, 17500, 0, 1),
  ] },
  bar: { id: 'bar', name: 'The bar', raise: 0.06, rungs: [
    r('Associate / storefront practitioner', 4, 0.15, 0.03, 0, 0, 6000, 0, 999),
    r('Partner / established practitioner', 6, 0.08, 0.03, 72, 0.1, 15000, 0, 999),
    r('Name partner / rainmaker', 0, 0, 0.03, 75, 0.12, 40000, 0, 999),
  ] },
  bench_nj: { id: 'bench_nj', name: 'State and local bench', raise: 0.03, rungs: [
    r('Municipal Magistrate / Judge', 3, 0.10, 0.04, 70, 0.1, 3500, 50, 6),
    r('County District Court Judge', 3, 0.10, 0.03, 70, 0.1, 12000, 100, 2),
    r('County Court Judge', 4, 0.10, 0.03, 70, 0.1, 16000, 150, 2),
    r('Superior Court Judge', 5, 0.08, 0.02, 70, 0.1, 22000, 250, 60),
    r('Appellate Division Judge', 5, 0.07, 0.015, 70, 0.1, 24000, 300, 9),
    r('Supreme Court Justice', 0, 0, 0.01, 70, 0.15, 27000, 0, 7),
  ] },
  bench_federal: { id: 'bench_federal', name: 'Federal bench', raise: 0.02, rungs: [
    r('US Commissioner', 4, 0.06, 0.02, 0, 0.08, 9000, 0, 6),
    r('US District Judge', 8, 0.04, 0.005, 75, 0.06, 22500, 0, 8),
    r('US Circuit Judge', 0, 0, 0.003, 78, 0.08, 25500, 0, 9),
  ] },
  court_staff: { id: 'court_staff', name: 'Court staff', raise: 0.03, rungs: [
    r('Deputy clerk / stenographer', 3, 0.1, 0.03, 65, 0.15, 3800, 10, 10),
    r('Clerk of the court / Jury commissioner', 0, 0, 0.04, 70, 0.15, 5200, 30, 2),
  ] },
  local_politics: { id: 'local_politics', name: 'Local office', raise: 0.02, rungs: [
    r('Committeeman / precinct captain', 2, 0.15, 0.04, 0, 0.05, 0, 10, 30),
    r('Municipal chairman / ward leader / board member', 2, 0.12, 0.05, 0, 0.06, 0, 25, 8),
    r('Commissioner / Councilman / Committeeman', 0, 0.10, 0.06, 0, 0.08, 4000, 50, 7),
    r('Mayor', 0, 0.06, 0.07, 0, 0.1, 6000, 100, 1),
  ] },
  county_politics: { id: 'county_politics', name: 'County office', raise: 0.02, rungs: [
    r('County employee / deputy', 2, 0.12, 0.04, 65, 0.1, 4000, 15, 40),
    r('Freeholder', 0, 0.10, 0.05, 0, 0.08, 5000, 60, 3),
    r('Constitutional officer (Clerk, Surrogate, Sheriff)', 0, 0.06, 0.05, 0, 0.1, 9000, 80, 3),
    r('Freeholder Director / County boss', 0, 0, 0.06, 0, 0.1, 9000, 150, 1),
  ] },
  state_politics: { id: 'state_politics', name: 'State office', raise: 0.02, rungs: [
    r('State employee / authority staff', 2, 0.12, 0.03, 65, 0.1, 6000, 25, 100),
    r('Assemblyman', 0, 0.12, 0.04, 0, 0.08, 5000, 100, 60),
    r('State Senator / Authority commissioner', 0, 0.08, 0.04, 0, 0.1, 5000, 200, 21),
    r('Cabinet officer (AG, Treasurer, ABC Director)', 0, 0.06, 0.05, 0, 0.12, 20000, 300, 12),
    r('Governor', 0, 0, 0.04, 0, 0.1, 30000, 0, 1),
  ] },
  federal_politics: { id: 'federal_politics', name: 'Federal office', raise: 0.02, rungs: [
    r('Congressional staffer', 2, 0.12, 0.02, 0, 0.08, 7000, 0, 20),
    r('US Representative', 0, 0.05, 0.03, 0, 0.08, 22500, 250, 14),
    r('US Senator', 0, 0, 0.02, 0, 0.1, 22500, 400, 2),
  ] },
  party_machine: { id: 'party_machine', name: 'Party machine', raise: 0.02, rungs: [
    r('Precinct worker', 2, 0.18, 0.03, 0, 0.05, 0, 5, 200),
    r('Committeeman / committeewoman', 2, 0.12, 0.04, 0, 0.05, 0, 15, 60),
    r('Municipal chairman / treasurer / lobbyist', 3, 0.10, 0.05, 0, 0.08, 0, 40, 10),
    r('County chairman', 4, 0.06, 0.05, 0, 0.1, 0, 150, 2),
    r('State chairman / national committeeman', 0, 0, 0.05, 0, 0.12, 0, 300, 2),
  ] },
  ward_politics: { id: 'ward_politics', name: 'Philadelphia ward politics', raise: 0.02, rungs: [
    r('Committeeman', 2, 0.15, 0.05, 0, 0.05, 0, 10, 3000),
    r('Ward leader', 4, 0.08, 0.06, 0, 0.08, 0, 50, 66),
    r('City Councilman / State Representative', 0, 0.08, 0.06, 0, 0.08, 12000, 150, 30),
    r('Citywide office (Mayor, DA, Council President)', 0, 0, 0.05, 0, 0.1, 25000, 0, 3),
  ] },
  street: { id: 'street', name: 'The street', raise: 0, rungs: [
    r('Kid on the corner', 1, 0.25, 0.12, 0, 0, 1500, 0, 999),
    r('Associate / hustler', 2, 0.15, 0.10, 0, 0, 4000, 0, 999),
    r('Made man / specialist', 4, 0.08, 0.08, 0, 0.03, 9000, 0, 999),
    r('Crew chief / capo', 0, 0.03, 0.08, 0, 0.05, 25000, 0, 999),
  ] },
  showbiz_performer: { id: 'showbiz_performer', name: 'Performer', raise: 0.1, rungs: [
    r('Local act', 1, 0.15, 0.04, 0, 0.04, 3000, 0, 999),
    r('Regional headliner', 2, 0.10, 0.06, 0, 0.04, 9000, 0, 999),
    r('Recording / TV act', 2, 0.08, 0.08, 0, 0.05, 25000, 0, 999),
    r('National star', 0, 0.03, 0.10, 0, 0.06, 90000, 0, 999),
  ] },
  showbiz_business: { id: 'showbiz_business', name: 'Show business behind the curtain', raise: 0.08, rungs: [
    r('Gofer / assistant / stringer', 2, 0.15, 0.04, 0, 0.03, 3500, 0, 999),
    r('Agent / booker / columnist / producer', 3, 0.08, 0.05, 0, 0.05, 15000, 0, 999),
    r('Mogul / name columnist / studio power', 0, 0, 0.06, 75, 0.08, 60000, 0, 999),
  ] },
  civilian: { id: 'civilian', name: 'Civilian life', raise: 0.03, rungs: [
    r('Worker / clerk', 3, 0.08, 0.01, 65, 0.15, 3500, 0, 999),
    r('Owner / professional', 0, 0.04, 0.02, 70, 0.1, 8000, 0, 999),
    r('Pillar of the community', 0, 0, 0.02, 75, 0.12, 20000, 0, 999),
  ] },
};

/* ------------------------------------------------------------------ */
/* Offices (elected, appointed, chosen by a body, life)               */
/* ------------------------------------------------------------------ */

const o = (x: ElectedOffice) => x;

export const OFFICES: ElectedOffice[] = [
  o({ id: 'ww_commissioner', title: 'Wildwood City Commissioner', institution: 'wildwood_city', seats: 3, termYears: 4, selection: 'elected', partisan: false, nextYear: 1963, month: 5, lean: 0, termLimit: 0, leverage: 'Three votes run the city: licenses, police, the boardwalk, the beach concessions.', note: 'Walsh Act, at-large, concurrent terms (cycle year plausible).' }),
  o({ id: 'ww_mayor', title: 'Mayor of Wildwood (Director of Public Affairs and Public Safety)', institution: 'wildwood_city', seats: 1, termYears: 4, selection: 'chosen-by-body', partisan: false, nextYear: 1963, month: 5, lean: 0, termLimit: 0, leverage: 'Holds Public Safety: appoints and protects the Chief of Police.', note: 'Commission picks the mayor from among its members after each election.' }),
  o({ id: 'crest_commissioner', title: 'Wildwood Crest Commissioner', institution: 'crest_borough', seats: 3, termYears: 4, selection: 'elected', partisan: false, nextYear: 1961, month: 5, lean: 0, termLimit: 0, leverage: 'Zoning and the motel boom.', note: 'Walsh Act since 1937.' }),
  o({ id: 'nw_mayor', title: 'Mayor of North Wildwood', institution: 'north_wildwood_city', seats: 1, termYears: 4, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: -0.2, termLimit: 0, leverage: 'Liquor licenses and the police on Danny Kessler\'s side of the island.', note: 'City form, partisan.' }),
  o({ id: 'nw_council_ward', title: 'North Wildwood Councilman (ward)', institution: 'north_wildwood_city', seats: 6, termYears: 3, selection: 'elected', partisan: true, nextYear: 1960, month: 11, lean: -0.2, termLimit: 0, leverage: 'Confirms the mayor\'s appointments.', note: 'Staggered: two seats each November.' }),
  o({ id: 'nw_council_atlarge', title: 'North Wildwood Councilman (at-large, council president)', institution: 'north_wildwood_city', seats: 1, termYears: 2, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: -0.2, termLimit: 0, leverage: 'Runs the council meetings and the agenda.', note: 'City form.' }),
  o({ id: 'ww_west_commissioner', title: 'West Wildwood Commissioner', institution: 'west_wildwood', seats: 3, termYears: 4, selection: 'elected', partisan: false, nextYear: 1962, month: 5, lean: 0, termLimit: 0, leverage: 'Boat slips on the bay; quiet places to unload.', note: 'Plausible.' }),
  o({ id: 'capemay_mayor', title: 'Mayor of Cape May City', institution: 'cape_may_city', seats: 1, termYears: 4, selection: 'elected', partisan: false, nextYear: 1962, month: 5, lean: 0, termLimit: 0, leverage: 'The Coast Guard base town and its hotels.', note: 'Plausible.' }),
  o({ id: 'middle_committee', title: 'Middle Township Committeeman', institution: 'middle_twp', seats: 3, termYears: 3, selection: 'elected', partisan: true, nextYear: 1960, month: 11, lean: -0.5, termLimit: 0, leverage: 'The Rio Grande causeway strip: motels, gas stations, the road onto the island.', note: 'Township committee, one seat a year.' }),
  o({ id: 'lower_committee', title: 'Lower Township Committeeman', institution: 'lower_twp', seats: 3, termYears: 3, selection: 'elected', partisan: true, nextYear: 1960, month: 11, lean: -0.5, termLimit: 0, leverage: 'Bayside docks at the Villas and Cold Spring.', note: 'Township committee.' }),
  o({ id: 'cmc_freeholder', title: 'Cape May County Freeholder', institution: 'cape_may_county', seats: 3, termYears: 3, selection: 'elected', partisan: true, nextYear: 1960, month: 11, lean: -0.6, termLimit: 0, leverage: 'County roads, county contracts, the county jail budget.', note: 'Board modeled as 3, one seat a year.' }),
  o({ id: 'cmc_clerk', title: 'Cape May County Clerk', institution: 'cape_may_county', seats: 1, termYears: 5, selection: 'elected', partisan: true, nextYear: 1962, month: 11, lean: -0.6, termLimit: 0, leverage: 'Deeds, ballots and the voter rolls.', note: 'NJ county clerks serve 5 years.' }),
  o({ id: 'cmc_surrogate', title: 'Cape May County Surrogate', institution: 'cape_may_county', seats: 1, termYears: 5, selection: 'elected', partisan: true, nextYear: 1963, month: 11, lean: -0.6, termLimit: 0, leverage: 'Wills and estates: who inherits the motel.', note: 'NJ surrogates serve 5 years.' }),
  o({ id: 'cmc_sheriff', title: 'Sheriff of Cape May County', institution: 'cmc_sheriff', seats: 1, termYears: 3, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: -0.6, termLimit: 0, leverage: 'The county jail, prisoner transport, and who sits on a jury.', note: 'NJ sheriffs serve 3 years.' }),
  o({ id: 'cmc_prosecutor', title: 'Cape May County Prosecutor', institution: 'cmc_prosecutor', seats: 1, termYears: 5, selection: 'appointed', partisan: true, appointedBy: 'Governor, with Senate consent (the county\'s senator can block it)', nextYear: 1962, month: 3, lean: 0, termLimit: 0, leverage: 'Decides what gets presented to the grand jury.', note: 'Real rule; the engine\'s Walter Keough holds it.' }),
  o({ id: 'cmc_county_judge', title: 'Cape May County Court Judge', institution: 'county_court', seats: 2, termYears: 5, selection: 'appointed', partisan: true, appointedBy: 'Governor, with Senate consent', nextYear: 1961, month: 3, lean: 0, termLimit: 0, leverage: 'Tries your men; sets bail.', note: 'County Courts existed until 1978.' }),
  o({ id: 'muni_judge', title: 'Municipal Judge', institution: 'municipal_court', seats: 3, termYears: 3, selection: 'appointed', partisan: false, appointedBy: 'The municipal governing body', nextYear: 1961, month: 1, lean: 0, termLimit: 0, leverage: 'Gambling summonses disappear here.', note: 'Real NJ rule: 3-year appointments.' }),
  o({ id: 'atl_freeholder_director', title: 'Atlantic County Freeholder Director', institution: 'atlantic_county', seats: 1, termYears: 3, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: -0.8, termLimit: 0, leverage: 'The Atlantic County machine\'s public face.', note: 'Plausible.' }),
  o({ id: 'nj_senate_capemay', title: 'State Senator, Cape May County', institution: 'nj_legislature', seats: 1, termYears: 4, selection: 'elected', partisan: true, nextYear: 1963, month: 11, lean: -0.5, termLimit: 0, leverage: 'Senatorial courtesy: can veto the county prosecutor and judges.', note: 'One senator per county until 1966.' }),
  o({ id: 'nj_assembly_capemay', title: 'Assemblyman, Cape May County', institution: 'nj_legislature', seats: 1, termYears: 2, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: -0.5, termLimit: 0, leverage: 'Bills on bingo, raffles, liquor hours.', note: 'The engine\'s Roy Pruitt holds it.' }),
  o({ id: 'nj_senate_atlantic', title: 'State Senator, Atlantic County', institution: 'nj_legislature', seats: 1, termYears: 4, selection: 'elected', partisan: true, nextYear: 1963, month: 11, lean: -0.8, termLimit: 0, leverage: 'The Atlantic City machine boss sits here.', note: 'One per county.' }),
  o({ id: 'nj_assembly_atlantic', title: 'Assemblyman, Atlantic County', institution: 'nj_legislature', seats: 2, termYears: 2, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: -0.7, termLimit: 0, leverage: 'Resort-tax and racing bills.', note: 'Seat count plausible.' }),
  o({ id: 'nj_senate_cumberland', title: 'State Senator, Cumberland County', institution: 'nj_legislature', seats: 1, termYears: 4, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: -0.2, termLimit: 0, leverage: 'Vineland and the farm vote.', note: 'One per county.' }),
  o({ id: 'nj_senate_camden', title: 'State Senator, Camden County', institution: 'nj_legislature', seats: 1, termYears: 4, selection: 'elected', partisan: true, nextYear: 1963, month: 11, lean: 0.5, termLimit: 0, leverage: 'Labor, the shipyard, the Camden waterfront.', note: 'One per county.' }),
  o({ id: 'nj_assembly_camden', title: 'Assemblyman, Camden County', institution: 'nj_legislature', seats: 4, termYears: 2, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: 0.5, termLimit: 0, leverage: 'Labor bills.', note: 'Seat count plausible.' }),
  o({ id: 'nj_governor', title: 'Governor of New Jersey', institution: 'nj_executive', seats: 1, termYears: 4, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: 0.05, termLimit: 2, leverage: 'Appoints prosecutors, judges, the AG, the ABC director, the State Police superintendent; pardons.', note: 'Two consecutive terms max.' }),
  o({ id: 'nj_ag', title: 'Attorney General of New Jersey', institution: 'nj_attorney_general', seats: 1, termYears: 4, selection: 'appointed', partisan: true, appointedBy: 'Governor', nextYear: 1962, month: 1, lean: 0, termLimit: 0, leverage: 'Can supersede a county prosecutor and run the case himself.', note: 'Serves the Governor\'s term.' }),
  o({ id: 'nj_treasurer', title: 'State Treasurer', institution: 'nj_executive', seats: 1, termYears: 4, selection: 'appointed', partisan: true, appointedBy: 'Governor', nextYear: 1962, month: 1, lean: 0, termLimit: 0, leverage: 'Where the state banks its money.', note: 'Real.' }),
  o({ id: 'nj_abc_director', title: 'Director, Division of Alcoholic Beverage Control', institution: 'nj_agencies', seats: 1, termYears: 4, selection: 'appointed', partisan: true, appointedBy: 'Governor', nextYear: 1962, month: 1, lean: 0, termLimit: 0, leverage: 'Pulls or protects every liquor license in the state; the clubs live or die here.', note: 'Real division.' }),
  o({ id: 'nj_racing_commissioner', title: 'New Jersey Racing Commissioner', institution: 'nj_agencies', seats: 4, termYears: 4, selection: 'appointed', partisan: true, appointedBy: 'Governor', nextYear: 1962, month: 1, lean: 0, termLimit: 0, leverage: 'The only legal gambling in the state in 1960: the tracks.', note: 'Real commission; seat count plausible.' }),
  o({ id: 'nj_highway_authority', title: 'Chairman, New Jersey Highway Authority (Garden State Parkway)', institution: 'nj_agencies', seats: 1, termYears: 5, selection: 'appointed', partisan: true, appointedBy: 'Governor', nextYear: 1963, month: 1, lean: 0, termLimit: 0, leverage: 'Bonds, toll concessions, service-area contracts, exits.', note: 'Real authority.' }),
  o({ id: 'nj_labor_commissioner', title: 'Commissioner of Labor and Industry', institution: 'nj_agencies', seats: 1, termYears: 4, selection: 'appointed', partisan: true, appointedBy: 'Governor', nextYear: 1962, month: 1, lean: 0, termLimit: 0, leverage: 'Arbitrates the hotel and dock strikes.', note: 'Real department.' }),
  o({ id: 'nj_sp_superintendent', title: 'Superintendent of the New Jersey State Police', institution: 'nj_state_police', seats: 1, termYears: 0, selection: 'appointed', partisan: false, appointedBy: 'Governor', nextYear: 1962, month: 1, lean: 0, termLimit: 0, leverage: 'Sends troopers onto the island or keeps them off it.', note: 'Serves at the Governor\'s pleasure.' }),
  o({ id: 'drpa_commissioner', title: 'Delaware River Port Authority Commissioner', institution: 'drpa', seats: 16, termYears: 5, selection: 'appointed', partisan: true, appointedBy: 'Governors of NJ and PA', nextYear: 1961, month: 1, lean: 0, termLimit: 0, leverage: 'Bridge tolls, pier leases and the waterfront unions.', note: 'Real authority; terms plausible.' }),
  o({ id: 'nj_supreme_justice', title: 'Justice of the New Jersey Supreme Court', institution: 'nj_supreme_court', seats: 7, termYears: 7, selection: 'appointed', partisan: true, appointedBy: 'Governor, with Senate consent; tenure after reappointment', nextYear: 1962, month: 1, lean: 0, termLimit: 0, leverage: 'The last word on wiretaps and search warrants.', note: 'Real rule; mandatory retirement at 70.' }),
  o({ id: 'nj_superior_judge', title: 'Superior Court Judge (Atlantic-Cape May vicinage)', institution: 'superior_court', seats: 4, termYears: 7, selection: 'appointed', partisan: true, appointedBy: 'Governor, with Senate consent', nextYear: 1961, month: 1, lean: 0, termLimit: 0, leverage: 'Civil suits, chancery (who owns the pier), wiretap orders.', note: 'Real rule.' }),
  o({ id: 'us_senate_nj_a', title: 'United States Senator from New Jersey (seat up 1960)', institution: 'us_congress', seats: 1, termYears: 6, selection: 'elected', partisan: true, nextYear: 1960, month: 11, lean: -0.05, termLimit: 0, leverage: 'Committee seats; can lean on the Justice Department.', note: 'NJ Class 2 seat cycle.' }),
  o({ id: 'us_senate_nj_b', title: 'United States Senator from New Jersey (seat up 1964)', institution: 'us_congress', seats: 1, termYears: 6, selection: 'elected', partisan: true, nextYear: 1964, month: 11, lean: 0.05, termLimit: 0, leverage: 'Recommends the US Attorney and federal judges when his party has the White House.', note: 'NJ Class 1 seat cycle.' }),
  o({ id: 'us_house_nj1', title: 'US Representative, NJ 1st District (Camden, Gloucester, Salem)', institution: 'us_congress', seats: 1, termYears: 2, selection: 'elected', partisan: true, nextYear: 1960, month: 11, lean: 0.3, termLimit: 0, leverage: 'Federal dock and shipyard money.', note: 'District shape approximate.' }),
  o({ id: 'us_house_nj2', title: 'US Representative, NJ 2nd District (Atlantic, Cape May, Cumberland)', institution: 'us_congress', seats: 1, termYears: 2, selection: 'elected', partisan: true, nextYear: 1960, month: 11, lean: -0.5, termLimit: 0, leverage: 'The shore\'s man in Washington: Coast Guard, beach replenishment, post offices.', note: 'District shape approximate.' }),
  o({ id: 'us_attorney_nj', title: 'United States Attorney for New Jersey', institution: 'us_attorney_nj', seats: 1, termYears: 4, selection: 'appointed', partisan: true, appointedBy: 'President, on the senators\' recommendation', nextYear: 1961, month: 3, lean: 0, termLimit: 0, leverage: 'Federal grand juries, tax cases, interstate gambling.', note: 'Turns over with the administration (spring 1961).' }),
  o({ id: 'us_district_judge', title: 'US District Judge, District of New Jersey', institution: 'federal_court', seats: 8, termYears: 0, selection: 'life', partisan: true, appointedBy: 'President, Senate confirmation', nextYear: 0, month: 0, lean: 0, termLimit: 0, leverage: 'Sentencing in the federal case.', note: 'Life tenure.' }),
  o({ id: 'ac_commissioner', title: 'Atlantic City Commissioner', institution: 'atlantic_city', seats: 5, termYears: 4, selection: 'elected', partisan: false, nextYear: 1964, month: 5, lean: 0, termLimit: 0, leverage: 'Boardwalk, piers, hotel licenses in the biggest resort on the coast.', note: 'Walsh Act, 5 members; cycle year plausible.' }),
  o({ id: 'ac_mayor', title: 'Mayor of Atlantic City', institution: 'atlantic_city', seats: 1, termYears: 4, selection: 'chosen-by-body', partisan: false, nextYear: 1964, month: 5, lean: 0, termLimit: 0, leverage: 'Face of the city to the convention trade.', note: 'Chosen by the commission.' }),
  o({ id: 'phl_mayor', title: 'Mayor of Philadelphia', institution: 'philadelphia_city', seats: 1, termYears: 4, selection: 'elected', partisan: true, nextYear: 1963, month: 11, lean: 0.6, termLimit: 2, leverage: 'Appoints the Police Commissioner.', note: 'Home Rule Charter: two consecutive terms.' }),
  o({ id: 'phl_da', title: 'District Attorney of Philadelphia', institution: 'philadelphia_da', seats: 1, termYears: 4, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: 0.6, termLimit: 0, leverage: 'Charges the Philadelphia family\'s men; grants immunity.', note: 'Real cycle (odd years).' }),
  o({ id: 'phl_council', title: 'Philadelphia City Councilman', institution: 'philadelphia_city', seats: 17, termYears: 4, selection: 'elected', partisan: true, nextYear: 1963, month: 11, lean: 0.6, termLimit: 0, leverage: 'Zoning, licenses, contracts.', note: '10 district + 7 at-large.' }),
  o({ id: 'phl_ward_leader', title: 'Philadelphia Ward Leader', institution: 'philadelphia_ward', seats: 66, termYears: 4, selection: 'chosen-by-body', partisan: true, nextYear: 1962, month: 6, lean: 0.6, termLimit: 0, leverage: 'Delivers a ward: jobs, votes, magistrates.', note: 'Elected by the ward\'s committeemen after the primary.' }),
  o({ id: 'phl_police_commissioner', title: 'Philadelphia Police Commissioner', institution: 'philadelphia_pd', seats: 1, termYears: 0, selection: 'appointed', partisan: false, appointedBy: 'Mayor', nextYear: 1964, month: 1, lean: 0, termLimit: 0, leverage: 'Raids or no raids in South Philly.', note: 'At the mayor\'s pleasure.' }),
  o({ id: 'phl_magistrate', title: 'Philadelphia Magistrate', institution: 'philadelphia_courts', seats: 28, termYears: 6, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: 0.6, termLimit: 0, leverage: 'Arraignments and bail for the Philadelphia family\'s men.', note: 'Elected; abolished 1969.' }),
  o({ id: 'phl_common_pleas', title: 'Judge, Court of Common Pleas (Philadelphia)', institution: 'philadelphia_courts', seats: 30, termYears: 10, selection: 'elected', partisan: true, nextYear: 1961, month: 11, lean: 0.6, termLimit: 0, leverage: 'Trials and sentences in Philadelphia.', note: 'PA 10-year terms with retention.' }),
  o({ id: 'pa_house_phl', title: 'Pennsylvania State Representative (Philadelphia)', institution: 'philadelphia_city', seats: 1, termYears: 2, selection: 'elected', partisan: true, nextYear: 1960, month: 11, lean: 0.7, termLimit: 0, leverage: 'Harrisburg votes on the numbers and the racing bills.', note: 'Real 2-year terms.' }),
  o({ id: 'cmc_party_chair', title: 'Cape May County party chairman', institution: 'cape_may_party_r', seats: 2, termYears: 2, selection: 'chosen-by-body', partisan: true, nextYear: 1961, month: 6, lean: 0, termLimit: 0, leverage: 'Picks the ticket; nobody runs without him.', note: 'One per party, elected by the county committee.' }),
  o({ id: 'nj_party_chair', title: 'New Jersey state party chairman', institution: 'nj_party', seats: 2, termYears: 2, selection: 'chosen-by-body', partisan: true, nextYear: 1961, month: 6, lean: 0, termLimit: 0, leverage: 'Brokers the statewide ticket and the money.', note: 'One per party.' }),
];

/* ------------------------------------------------------------------ */
/* Dynasties                                                           */
/* ------------------------------------------------------------------ */

export const DYNASTIES: Dynasty[] = [
  { id: 'callahan', name: 'The Callahans', powerBase: 'Wildwood City Hall and the Cape May County Senate seat', identity: 'Machine and patronage: every lifeguard, meter maid and summer cop owes them a job.', enemies: ['rosenfeld', 'mercer'], seatOfPower: 'Mayor\'s office, Wildwood City Hall, Pacific Avenue', foundingSecret: 'In 1927 Paddy Callahan let rum boats land at the Otten\'s Harbor docks for a Philadelphia syndicate in exchange for the cash that bought the 1927 commission election.', heirloom: 'Paddy\'s pocket ledger of 1926-1933 dock payments, kept in a cigar box in the rectory safe at St. Ann\'s', links: 'Allied with the engine\'s Commissioner Frank Dougherty.' },
  { id: 'rosenfeld', name: 'The Rosenfelds', powerBase: 'The reform seat on the Wildwood commission; later the Attorney General\'s office', identity: 'Reform and investigations; the family that keeps files.', enemies: ['callahan'], seatOfPower: 'Rosenfeld & Weiss law office over the department store', foundingSecret: 'Samuel Rosenfeld\'s 1934 reform campaign was quietly financed by a rival bootlegger who wanted the Callahans out.', heirloom: 'Samuel\'s carbon copies of every complaint ever filed against City Hall, in the attic on Magnolia Avenue', links: 'Miriam Rosenfeld was born a Weiss: her brother is the engine\'s Herman Weiss.' },
  { id: 'deluca', name: 'The DeLucas', powerBase: 'Camden County: the legislature, the docks, Congress', identity: 'Labor, the waterfront and business, all at once.', enemies: ['sterling'], seatOfPower: 'DeLuca Stevedoring office on the Camden waterfront', foundingSecret: 'Angelo DeLuca\'s first Senate race (1922) was won with ballots counted in a warehouse owned by a waterfront crew.', heirloom: 'A tally sheet with two sets of numbers, framed behind a photograph in Anthony DeLuca\'s den' },
  { id: 'whitcomb', name: 'The Whitcombs', powerBase: 'Seashore Trust Company and the Republican national committee', identity: 'Old money and banking; the mortgage on half the motels on the island.', enemies: ['ohara'], seatOfPower: 'Seashore Trust, Cape May Court House', foundingSecret: 'Arthur C. Whitcomb\'s bank survived 1933 by quietly taking deposits that came off the rum boats.', heirloom: 'A second set of 1931-33 deposit books in the bank\'s basement vault' },
  { id: 'mercer', name: 'The Mercers', powerBase: 'Cape May County Clerk and the county Republican organization', identity: 'The party organization: they count the votes and the money.', enemies: ['game:keane', 'callahan'], seatOfPower: 'County Clerk\'s office, Cape May Court House', foundingSecret: 'Josephine Mercer altered the 1936 freeholder returns in two precincts of Lower Township.', heirloom: 'The original 1936 tally sheets, never destroyed, in a hatbox in the Mercer house' },
  { id: 'greco', name: 'The Grecos', powerBase: 'Atlantic City Public Works and construction', identity: 'Tourism, construction, and the long dream of casinos.', enemies: ['game:donnelly'], seatOfPower: 'Greco Brothers Construction yard, Atlantic City', foundingSecret: 'The Greco brothers\' first boardwalk contract (1931) was paid for with a kickback to an Atlantic City commissioner.', heirloom: 'Canceled checks to the commissioner, in the company safe' },
  { id: 'ferraro', name: 'The Ferraros', powerBase: 'The Delaware River Port Authority', identity: 'Shipping, licensing and later gaming regulation.', enemies: ['vassallo'], seatOfPower: 'DRPA offices, Camden', foundingSecret: 'Lou Ferraro steered the 1929 pier leases to a company secretly owned by his brother-in-law.', heirloom: 'The original lease file with the brother-in-law\'s signature' },
  { id: 'ohara', name: 'The O\'Haras', powerBase: 'Camden shipyard unions and a US Senate seat', identity: 'Labor populism; TV-friendly sons.', enemies: ['whitcomb'], seatOfPower: 'Union hall on Broadway, Camden', foundingSecret: 'Francis O\'Hara\'s 1937 strike was settled when a shipyard executive\'s car mysteriously burned and the union treasurer pocketed the settlement fund.', heirloom: 'The treasurer\'s handwritten confession, which Francis bought and never burned' },
  { id: 'pembroke', name: 'The Pembrokes', powerBase: 'The Governor\'s mansion (once), the bench and the Parkway bonds', identity: 'The establishment: judges, bonds, Princeton.', enemies: ['whitaker'], seatOfPower: 'Pembroke, Hale & Ashby, Trenton', foundingSecret: 'Governor Walter H. Pembroke commuted the sentences of two Atlantic City bootleggers in 1925 for a campaign gift.', heirloom: 'The commutation memo with a margin note in the Governor\'s hand' },
  { id: 'halbrook', name: 'The Halbrooks', powerBase: 'The Governor\'s office (1954-62) and the highway lobby', identity: 'Highways, housing, and the contractors who build them.', enemies: ['sterling'], seatOfPower: 'The State House in Trenton and the Halbrook farm in Salem County', foundingSecret: 'The Parkway\'s Cape May extension route was bent a mile to cross land the Halbrooks had optioned in 1952.', heirloom: 'The original survey map with the first route in pencil' },
  { id: 'bell', name: 'The Bells', powerBase: 'A North Philadelphia ward organization and a Council seat', identity: 'Black political machine: jobs, churches, the numbers money nobody talks about.', enemies: ['montalto'], seatOfPower: 'Ward office on Columbia Avenue, Philadelphia', foundingSecret: 'Tommy Bell switched the ward from Republican to Democrat in 1934 after the Republicans tried to buy him with half what the Democrats offered.', heirloom: 'Tommy\'s letters from both parties\' city chairmen, with the amounts', links: 'Summers in Wildwood\'s Black neighborhood; the Bells own a guest house there.' },
  { id: 'vassallo', name: 'The Vassallos', powerBase: 'Atlantic City\'s budget office; later the Cape May Prosecutor\'s chair', identity: 'Budget masters and prosecutors.', enemies: ['ferraro'], seatOfPower: 'Comptroller\'s office, Atlantic City Hall', foundingSecret: 'Dominic Vassallo\'s Assembly campaigns were financed by a numbers banker who is still alive.', heirloom: 'A promissory note from Dominic to the numbers banker, never paid' },
  { id: 'katz', name: 'The Katzes', powerBase: 'The Democratic State Committee', identity: 'Candidate brokers, then media men.', enemies: ['mercer'], seatOfPower: 'Katz Associates, Newark and Trenton', foundingSecret: 'Bernie Katz brokered the 1953 gubernatorial nomination by promising the AG\'s job to two men.', heirloom: 'A letter of promise to the man who did not get it' },
  { id: 'sterling', name: 'The Sterlings', powerBase: 'Law enforcement: the Attorney General\'s office and the US Attorney\'s', identity: 'Law and order, and a long memory.', enemies: ['deluca', 'kessler'], seatOfPower: 'The AG\'s office, State House, Trenton', foundingSecret: 'Edgar P. Sterling, as Atlantic County prosecutor, buried a 1928 murder case against a machine ward boss.', heirloom: 'The original 1928 case file, which Edgar took home when he left office' },
  { id: 'whitaker', name: 'The Whitakers', powerBase: 'The federal prosecutor\'s office, later the Governor\'s', identity: 'Clean politics, as clean as the family can afford.', enemies: ['pembroke'], seatOfPower: 'US Courthouse, Newark', foundingSecret: 'Daniel Whitaker\'s father was an informant for the Prohibition Bureau and named friends to save himself.', heirloom: 'Bureau payment receipts in his father\'s Bible' },
  { id: 'russo', name: 'The Russos', powerBase: 'The hotel and restaurant unions; later the Labor Department', identity: 'Union organizers and arbitrators.', enemies: ['greco'], seatOfPower: 'HERE Local hall, Atlantic Avenue, Atlantic City', foundingSecret: 'Vinnie Russo\'s 1936 local charter was bought with a Philadelphia family loan that the family still considers outstanding.', heirloom: 'The loan terms, written on a restaurant check, in the union safe' },
  { id: 'hensley', name: 'The Hensleys', powerBase: 'Cumberland County: Vineland poultry and the farm vote', identity: 'Agricultural patronage and Protestant respectability.', enemies: ['deluca'], seatOfPower: 'Hensley Feed & Grain, Vineland', foundingSecret: 'Calvin Hensley\'s 1924 Congressional race was quietly backed by the Klan vote in two townships; he never repudiated it.', heirloom: 'A thank-you letter he sent, kept by a rival\'s family' },
  { id: 'doyle', name: 'The Doyles', powerBase: 'The Atlantic City police and an Assembly seat', identity: 'A police family that went into politics.', enemies: ['greco'], seatOfPower: 'Doyle house on Ventnor Avenue', foundingSecret: 'Chief Frankie Doyle ran the 1920s vice "license" system: every speakeasy paid the chief\'s office.', heirloom: 'Frankie\'s collection book, which his granddaughter found in 1959' },
  { id: 'kessler', name: 'The Kesslers (sheriffs)', powerBase: 'The Cape May County Sheriff\'s office', identity: 'County law enforcement; cousins to the North Wildwood clubs.', enemies: ['sterling'], seatOfPower: 'Sheriff\'s office and county jail, Cape May Court House', foundingSecret: 'Sheriff Henry J. Kessler let a prisoner "escape" in 1931 who then testified for no one.', heirloom: 'The escape report with Henry\'s own corrections', links: 'Sheriff Henry P. Kessler Jr. is first cousin to the engine\'s Danny Kessler.' },
  { id: 'montalto', name: 'The Montaltos', powerBase: 'The Philadelphia Police Department command', identity: 'Police commissioners with an anti-crime image and Italian South Philly roots.', enemies: ['bell'], seatOfPower: 'Police Administration Building (the "Roundhouse", opened 1963), Philadelphia', foundingSecret: 'Al Montalto made inspector in 1946 by delivering a South Philly vice captain\'s ledger to the mayor\'s men; half the names were spared.', heirloom: 'The spared half of the ledger', links: 'Renamed from the source notes\' Moretti to avoid the engine\'s Sal Moretti.' },
  { id: 'kilbride', name: 'The Kilbrides', powerBase: 'The Wildwood Police Department', identity: 'Three generations of Wildwood cops.', enemies: ['rosenfeld'], seatOfPower: 'The Kilbride house on Wildwood Avenue', foundingSecret: 'Patrolman Owen Kilbride shot an unarmed rum runner in 1929; the report was rewritten.', heirloom: 'The original report, kept by the doctor who did the autopsy' },
  { id: 'donnelly', name: 'The Donnellys (federal branch)', powerBase: 'The FBI Newark field office', identity: 'Bureau men, brothers and sons of the Donnelly Construction family.', enemies: ['greco'], seatOfPower: 'FBI Newark field office', foundingSecret: 'SAC Charles Donnelly has steered the Bureau away from his brother Francis\'s permit payments in Cape May County since 1955.', heirloom: 'Donnelly Construction\'s permit ledger', links: 'Kin of the engine\'s House Donnelly (Francis Donnelly, Donnelly Construction).' },
  { id: 'gilhooley', name: 'The Gilhooleys', powerBase: 'The Wildwood Fire Department', identity: 'Two generations of fire chiefs who rule fires whatever City Hall needs.', enemies: [], seatOfPower: 'Wildwood fire headquarters', foundingSecret: 'Chief Michael Gilhooley ruled two 1920s pier fires accidental for the owners\' insurance money.', heirloom: 'The 1924 fire reports and a pier owner\'s check stub' },
  { id: 'keane', name: 'The Keanes (political branch)', powerBase: 'The Cape May County Democrats and the Crest commission', identity: 'The motel family\'s political women.', enemies: ['mercer'], seatOfPower: 'Keane motels office, Wildwood Crest', foundingSecret: 'None yet: the Keanes are clean, which is their weakness and their weapon.', heirloom: 'None', links: 'Kin of the engine\'s House Keane (Martin Keane).' },
  { id: 'szymanski', name: 'The Szymanskis', powerBase: 'The Philadelphia police (Kensington and Port Richmond districts)', identity: 'A Polish police family; honest by reputation, flexible in practice.', enemies: [], seatOfPower: 'St. Adalbert\'s parish, Port Richmond', foundingSecret: 'The patriarch\'s promotion in 1938 was bought from a ward leader.', heirloom: 'A receipt for a "loan" to the ward leader' },
];

/* ------------------------------------------------------------------ */
/* Links to characters the engine already creates                      */
/* ------------------------------------------------------------------ */

export const GAME_REFS: GameRef[] = [
  { key: 'danny_kessler', name: 'Danny Kessler', role: 'Boss of Kessler\'s Clubs, North Wildwood', source: 'world.ts RIVALS' },
  { key: 'sal_moretti', name: 'Salvatore "Sal the Bag" Moretti', role: 'Philadelphia\'s South Jersey capo', source: 'world.ts RIVALS' },
  { key: 'carmine_manno', name: 'Carmine "The Fist" Manno', role: 'Boss of the Manno Crew, Atlantic City', source: 'world.ts RIVALS' },
  { key: 'ira_feldstein', name: 'Ira Feldstein', role: 'Feldstein Money, New York', source: 'world.ts RIVALS' },
  { key: 'walter_keough', name: 'Walter Keough', role: 'Cape May County Prosecutor', source: 'world.ts RIVALS (law)' },
  { key: 'leo_carbone', name: 'Leo Carbone', role: 'Camden capo at the Table', source: 'newGame.ts' },
  { key: 'tommy_nardella', name: 'Tommy Nardella', role: 'Trenton capo at the Table', source: 'newGame.ts' },
  { key: 'thomas_healy', name: 'Thomas Healy', role: 'Wildwood police sergeant', source: 'newGame.ts OFFICIALS' },
  { key: 'edward_gorman', name: 'Edward Gorman', role: 'Wildwood Chief of Police', source: 'newGame.ts OFFICIALS' },
  { key: 'harold_voss', name: 'Harold Voss', role: 'Cape May County Court judge', source: 'newGame.ts OFFICIALS' },
  { key: 'frank_dougherty', name: 'Frank Dougherty', role: 'Wildwood "councilman" (in this pack: Commissioner of Revenue and Finance)', source: 'newGame.ts OFFICIALS / familyHouses h_dougherty' },
  { key: 'roy_pruitt', name: 'Roy Pruitt', role: 'Assemblyman, Cape May County', source: 'newGame.ts OFFICIALS / familyHouses h_pruitt' },
  { key: 'walter_kerns', name: 'Walter Kerns', role: 'IRS agent', source: 'newGame.ts OFFICIALS' },
  { key: 'martin_keane', name: 'Martin Keane', role: 'Motel owner, Wildwood Crest (House Keane)', source: 'llv-dynasty familyHouses h_keane' },
  { key: 'herman_weiss', name: 'Herman Weiss', role: 'Weiss\'s Department Store (House Weiss)', source: 'llv-dynasty familyHouses h_weiss' },
  { key: 'francis_donnelly', name: 'Francis Donnelly', role: 'Donnelly Construction (House Donnelly)', source: 'llv-dynasty familyHouses h_donnelly' },
  { key: 'rocco_albanese', name: 'Rocco Albanese', role: 'Bakery and pier concessions (House Albanese)', source: 'llv-dynasty familyHouses h_albanese' },
];
