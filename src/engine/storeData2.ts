import type { SpendCat, SpendItem, SpendKind } from './spendData';
import type { BizType, StoreAdult, StoreBiz, StoreInv, StoreStyle, StoreTab } from './storeData';

/**
 * THE STORE, deeper (CATALOG_DEEP §1-6, 9-13): the rest of the legitimate
 * businesses by kind (food and the neighborhood, the boardwalk and
 * entertainment, hotels and nightlife, services and the professions,
 * transport and the waterfront), the property and investments that keep
 * land, building, business and share apart, the big house and what goes in
 * it, luxury transport, clothes with a style, experiences and memberships,
 * and protection and professional help.
 *
 * Data only (storeData.ts appends it); type imports only. Regulated
 * businesses need qualified people (`needs` a licensed hire, `quals` says
 * who): owning the company does not make the boss a funeral director.
 * Racket lifecycles are not here (another system runs them).
 */

type O = Partial<Omit<SpendItem, 'id' | 'name' | 'cat' | 'price' | 'up' | 'blurb'>>;

function X(tab: StoreTab, cat: SpendCat, kind: SpendKind, id: string, name: string, price: number, up: number, blurb: string, o: O = {}): SpendItem {
  const r: Partial<Record<SpendCat, [number, number]>> = { property: [0.9, 0.03], biz: [0.7, 0], cars: [0.6, -0.1], boats: [0.6, -0.05], style: [0.15, -0.2], jewelry: [0.5, 0], home: [0.5, -0.03], invest: [0.9, 0] };
  const [resale, drift] = kind === 'own' ? r[cat] ?? [0.5, -0.05] : [0, 0];
  const pot = cat === 'biz' || cat === 'services' || cat === 'equip' ? 'family' : 'pocket';
  return { id, name, cat, kind, pot, price, up, blurb, flash: 0, resale, drift, tab, ...o };
}

const biz = (rev: [number, number], type: BizType, mgr: number, cond: string, loc: string, stake: StoreBiz['stake'] = 'business'): StoreBiz => ({ rev, type, mgr, cond, loc, stake });
const B = (id: string, name: string, price: number, up: number, blurb: string, b: StoreBiz, o: O = {}) =>
  X('property', 'biz', 'own', id, name, price, up, blurb, { flash: 1, biz: b, mods: { declared: Math.round((b.rev[0] + b.rev[1]) / 4) }, ...o });
const P = (id: string, name: string, price: number, up: number, blurb: string, o: O = {}) => X('property', 'property', 'own', id, name, price, up, blurb, o);
const I = (id: string, name: string, price: number, up: number, blurb: string, inv: StoreInv, o: O = {}) => X('invest', 'invest', 'own', id, name, price, up, blurb, {
  inv, model: 'share', resale: inv.liq === 'cash' ? 1 : inv.liq === 'weeks' ? 0.97 : inv.liq === 'months' ? 0.9 : 0.6, drift: 0, limit: 2, ...o,
});
const H = (id: string, name: string, price: number, up: number, blurb: string, o: O = {}) => X('services', 'services', 'svc', id, name, price, up, blurb, { model: 'hire', ...o });
const L = (cat: SpendCat, kind: SpendKind, id: string, name: string, price: number, up: number, blurb: string, o: O = {}) => X('lifestyle', cat, kind, id, name, price, up, blurb, o);
const S = (id: string, name: string, price: number, blurb: string, style: StoreStyle, o: O = {}) => X('lifestyle', 'style', 'own', id, name, price, 0, blurb, { style, flash: 1, ...o });

const CABARET: StoreAdult = {
  eligibility: 'Performers twenty-one and over, papers checked by the manager',
  voluntary: 'Each performer signs her own contract and can refuse any booking',
  pay: 'A guaranteed nightly fee plus tips she keeps',
  conditions: 'A dressing room with a lock, a doorman, no "private parties"',
  leave: 'She can quit with a week\'s notice, and no one follows her',
  legal: 'Needs a city cabaret license; vice laws change with the mayor and the decade',
};

export const STORE_ITEMS_2: SpendItem[] = [
  // ---------- §1 Food and the neighborhood ----------
  B('st_grocery', 'A grocery market', 6000, 20, "Produce on the sidewalk, a meat counter, credit in a ledger for the families who need it.", biz([110, 90], 'shop', 1, 'Good', 'Pacific Avenue'), { g: { town: 1 }, hooks: ['A supplier raises his prices', 'Spoilage after a power cut', 'A cousin wants a job'] }),
  B('st_butcher', 'A butcher shop', 4000, 12, "Sawdust on the floor, veal for the restaurants, sausage on Saturdays.", biz([75, 70], 'kitchen', 0, 'Good', 'New Jersey Avenue'), { hooks: ['A restaurant account', 'A bad batch and a lost reputation'] }),
  B('st_coffee', 'A coffee shop', 2500, 8, "Espresso, a pinball machine, the same six men every morning.", biz([55, 40], 'kitchen', 0, 'Good', 'Pacific Avenue'), { mods: { intel: 1, declared: 25 }, hooks: ['A meeting at the back table', 'The neighborhood changes'] }),
  B('st_wholesale', 'A wholesale food supplier', 22000, 70, "A warehouse of cans and a fleet of refrigerated trucks: every kitchen on the island buys from somebody.", biz([320, 160], 'garage', 1, 'Good', 'Rio Grande'), { mods: { declared: 90 }, hooks: ['A restaurant stops paying', 'Fuel prices', 'A bigger contract from Atlantic City'] }),
  B('st_beachrental', 'A beach-supply rental (chairs and umbrellas)', 2500, 6, "Three hundred chairs, a hundred umbrellas, teenage boys with sunburns.", biz([140, 0], 'outdoor', 0, 'Good', 'The beach at Rio Grande Avenue'), { hooks: ['A storm takes half the umbrellas'] }),
  // ---------- §2 Boardwalk, tourism, entertainment ----------
  B('st_moviehouse', 'A movie theater', 20000, 45, "Six hundred seats, a balcony, a projectionist who has seen everything twice.", biz([240, 150], 'stage', 1, 'Fair: the seats need recovering', 'Atlantic Avenue'), { g: { town: 1 }, hooks: ['A picture the priest preaches against', 'A renovation'] }),
  B('st_dancehall', 'A dance hall', 14000, 40, "A sprung floor, a bandstand, a mirror ball. The kids want rock and roll, their parents the fox-trot.", biz([280, 60], 'stage', 1, 'Good', 'On the boardwalk'), { hooks: ['A fight between the old crowd and the kids', 'A band nobody heard of becomes famous'] }),
  B('st_musicvenue', 'A live-music club', 12000, 40, "A small room with a big sound: the acts on their way up play here for nothing, once.", biz([260, 80], 'stage', 1, 'Good', 'Pacific Avenue'), { g: { press: 1 }, hooks: ['A performer becomes famous, and renegotiates', 'A headliner cancels'] }),
  // ---------- §3 Hotels, nightlife, adult venues ----------
  B('st_downtownhotel', 'A downtown hotel (sixty rooms, a restaurant, a ballroom)', 60000, 150, "Salesmen in winter, families in summer, a ballroom for the Rotary and the weddings.", biz([700, 260], 'hotel', 2, 'Good', 'Atlantic Avenue'), { flash: 4, quals: 'A professional hotel manager', advice: 'A real hotel needs a real manager. The ballroom carries it through the winter.' }),
  B('st_luxuryhotel', 'A luxury hotel with suites and a nightclub', 180000, 420, "Suites over the ocean, a concierge who knows everybody, a show room with a headliner.", biz([2600, 450], 'hotel', 3, 'Excellent', 'Ocean Avenue'), { flash: 8, stock: 1, respect: 5, notice: ['Every family in Philadelphia', 'The IRS'], quals: 'A professional general manager and a state liquor license', advice: 'High expectations and expensive upkeep: one bad season and it eats us.' }),
  B('st_lounge', 'A cocktail lounge', 8000, 30, "Low lights, a piano bar, a bartender who remembers your drink and forgets your face.", biz([190, 110], 'bar', 0, 'Good', 'Pacific Avenue'), { quals: 'A liquor license from the city', hooks: ['The license comes up for renewal'] }),
  B('st_cabaret', 'An adult cabaret (licensed)', 16000, 70, "A stage, a house band, dancers on contract. Run straight: papers checked, contracts honored, nobody kept.", biz([420, 120], 'stage', 1, 'Good', 'Off Pacific Avenue'), {
    adult: CABARET, quals: 'A city cabaret license and a manager the dancers trust', flash: 3, notice: ['The vice squad', 'The Church'], g: { church: -2 }, minYear: 1962,
    advice: 'Legal only as long as the license holds. Treat the dancers right or they walk, and the vice squad hears why.', hooks: ['A dancer quits for a better offer', 'The license hearing', 'A contract dispute'],
  }),
  // ---------- §4 Services, retail, professions ----------
  B('st_tailor', 'A tailor shop', 3000, 10, "Bolts of wool, a three-way mirror, a man with pins in his mouth who dresses half the crew.", biz([60, 60], 'shop', 0, 'Good', 'Pacific Avenue'), { hooks: ['A rich client wants something special'] }),
  B('st_jewelry', 'A jewelry store', 15000, 30, "Cases of rings, a workshop in back, a safe the insurance company inspects.", biz([160, 140], 'shop', 1, 'Good', 'Pacific Avenue'), { quals: 'A trained jeweler and an insurance policy', mods: { declared: 70, launder: 2 }, hooks: ['A ring comes in that someone else is looking for'] }),
  B('st_watchrepair', 'A watch repair shop', 1500, 4, "A loupe, a bench, an old Swiss who can fix anything that ticks.", biz([35, 35], 'shop', 0, 'Good', 'Pacific Avenue'), { quals: 'A skilled watchmaker' }),
  B('st_newspaper', 'A weekly newspaper', 18000, 60, "A press, two reporters and an editor who believes in his independence.", biz([90, 80], 'office', 1, 'Fair', 'Wildwood'), { g: { press: 4, pols: 1 }, flash: 3, quals: 'An editor (who will want to print what he wants)', advice: 'You can own the paper. You cannot own the editor, and if you try, everybody reads about it.', hooks: ['The editor runs a story you asked him not to'] }),
  B('st_adagency', 'An advertising agency', 5000, 20, "Two artists, a copywriter, the accounts of every motel on the island.", biz([90, 70], 'office', 0, 'Good', 'Pacific Avenue'), { g: { press: 1 } }),
  B('st_bookkeeping', 'A bookkeeping firm', 4000, 18, "Ledgers for fifty small businesses: everybody's numbers, in one office.", biz([80, 85], 'office', 0, 'Good', 'New Jersey Avenue'), { needs: ['cpa'], quals: 'A certified public accountant on the payroll', mods: { intel: 2, irsShield: 5, declared: 60 } }),
  B('st_propmgmt', 'A property-management company', 4000, 15, "Supers, handymen, rent ledgers for a dozen buildings that aren't yours.", biz([90, 80], 'rent', 0, 'Good', 'Wildwood'), { mods: { intel: 2 }, hooks: ['A tenant dispute that reaches the paper'] }),
  // ---------- §5 Transport, waterfront, construction, industry ----------
  B('st_carservice', 'A car service (black sedans)', 10000, 40, "Four Cadillacs and drivers in caps, for funerals, weddings and the train station.", biz([150, 90], 'garage', 1, 'Good', 'Rio Grande'), { mods: { intel: 1 } }),
  B('st_autorepair', 'An auto repair garage', 6000, 20, "Two lifts, a parts room, mechanics with grease to the elbow.", biz([110, 100], 'garage', 0, 'Good', 'Route 47'), { quals: 'Skilled mechanics', hooks: ['A customer says you overcharged'] }),
  B('st_moving', 'A moving company', 9000, 30, "Two vans, a crew of strong men, blankets and dollies.", biz([150, 70], 'garage', 1, 'Good', 'Rio Grande'), { hooks: ['A broken piano and a lawsuit'] }),
  B('st_coldstorage', 'A cold-storage company', 25000, 80, "A refrigerated warehouse by the docks: fish, ice cream, and the backup generator nobody tests.", biz([260, 200], 'garage', 1, 'Good', 'By the docks'), { hooks: ['A power failure and a spoiled load'] }),
  B('st_fishing', 'A commercial fishing business (two draggers)', 30000, 90, "Two boats out of the harbor for scallops and flounder, crews paid by the share.", biz([380, 140], 'marina', 1, 'Fair', "Otten's Harbor"), { needs: ['slip'], hooks: ['A storm keeps the boats in', 'A record catch'] }),
  B('st_charter', 'A boat charter company', 15000, 40, "Three sportfishing boats for the tourists, a booking shack, a pier.", biz([300, 20], 'marina', 0, 'Good', "Otten's Harbor"), { needs: ['captain_lic'], quals: 'Licensed charter captains (the Coast Guard)', hooks: ['A customer is hurt'] }),
  B('st_demolition', 'A demolition contractor', 12000, 35, "A crane, a wrecking ball, men who know what holds up a building.", biz([200, 120], 'garage', 1, 'Good', 'Rio Grande'), { quals: 'Qualified crews and a permit for every job', hooks: ['A wall comes down the wrong way'] }),
  B('st_landscaping', 'A landscaping company', 3000, 12, "Two trucks, mowers, a crew that cuts every lawn in the Crest.", biz([110, 15], 'outdoor', 0, 'Good', 'Wildwood Crest'), { hooks: ['A commercial account with the motels'] }),
  // ---------- §6 Property and investments (land, building, business and share kept apart) ----------
  P('st_commlot', 'A commercial lot on Rio Grande Avenue', 9000, 2, "Corner frontage on the main road onto the island. Somebody will want to build here.", { resale: 0.95, drift: 0.07, limit: 3, model: 'buy', advice: 'Land pays nothing until someone builds. On the road onto the island, someone will.' }),
  P('st_aboveshop', 'An apartment above a storefront', 7000, 8, "Four rooms over the luncheonette. Rent it, or keep it for somebody who needs a place.", { mods: { declared: 10 }, biz: biz([45, 45], 'rent', 0, 'Fair', 'Pacific Avenue', 'building') }),
  P('st_motelbldg', 'A motel property (the building, leased to an operator)', 30000, 25, "Forty rooms you own; the operator runs it and pays you rent. If he goes broke, you have a motel.", { mods: { declared: 40 }, biz: biz([180, 120], 'rent', 0, 'Good', 'Ocean Avenue', 'building'), advice: 'You own the building, not the business. Rent comes in whatever kind of summer he has, until he can\'t pay.' }),
  P('st_officebldg', 'An office building (three floors)', 50000, 40, "Lawyers, a dentist, an insurance man, your own office on the top floor.", { flash: 2, mods: { declared: 60, intel: 2 }, biz: biz([260, 260], 'rent', 0, 'Good', 'New Jersey Avenue', 'building') }),
  P('st_industrialyard', 'An industrial yard', 18000, 10, "Two acres by the railroad, a shed, a scale, a fence.", { mods: { declared: 20 }, biz: biz([70, 70], 'rent', 0, 'Rough', 'Rio Grande, by the tracks', 'building'), unl: ['warehouse'] }),
  I('st_inv_controlling', 'A controlling share of a supper club (51%)', 30000, 0, "The Riviera Room: you decide who manages, who plays and what it costs. You also answer for it.", { risk: 'medium', ret: [8, 25], liq: 'years', mgmt: 'Yours: hire the manager, approve the books', partner: 'Nick Cardone, who keeps 49%', ctrl: true, wants: 'Nick wants his brother as manager', exit: 'Sell back to Nick at a price you argue about' }, { flash: 3, mods: { declared: 90 } }),
  I('st_inv_marina', 'An interest in a marina (20%)', 12000, 0, "A fifth of the Bayside Marina: the slips, the fuel dock, a vote at the annual meeting.", { risk: 'medium', ret: [5, 14], liq: 'years', mgmt: 'One meeting a year', partner: 'The Holloway family', wants: 'The Holloways want to sell to a developer', exit: 'Their buyout clause, at book value' }),
  I('st_inv_partnership', 'A partnership contribution: a new bowling alley', 15000, 0, "Your money, Morris's know-how, a building in Rio Grande. Profits split down the middle.", { risk: 'medium', ret: [-10, 30], liq: 'years', mgmt: 'Monthly books from Morris', partner: 'Morris Feld', wants: 'Morris wants a liquor license in his name', exit: 'Dissolve the partnership: lawyers, and months', term: 52 }),
  // ---------- §9 The big house and what goes in it ----------
  P('st_country', 'A country home in the horse country of Monmouth County', 45000, 55, "A farmhouse, a pond, a barn, a long driveway. A place for Sundays and for hiding the children from the papers.", { fam: 8, relief: 9, respect: 3, flash: 5, resale: 0.9, drift: 0.04 }),
  L('home', 'once', 'st_library', 'A library with built-in shelves', 3500, 0, "Walnut shelves, leather chairs, books bought by the yard. Your son reads them.", { fam: 3, relief: 2, flash: 2, cd: 260, owner: 'household' }),
  L('home', 'once', 'st_homeoffice', 'A home office', 2000, 0, "A desk, a safe in the wall, a phone line, a door your wife knocks on.", { relief: 2, flash: 1, cd: 260, mods: { secrecy: 1 }, owner: 'household' }),
  L('home', 'once', 'st_dressingroom', 'A dressing room for your wife', 2500, 0, "Mirrors, a vanity, closets for every season.", { wife: 6, flash: 2, req: 'spouse', cd: 260, owner: 'recipient', gift: 'wife' }),
  L('home', 'once', 'st_diningroom', 'A formal dining room for twenty', 4000, 0, "A table that seats the capos and their wives, a crystal chandelier, a sideboard.", { fam: 3, crew: 2, flash: 2, cd: 260, owner: 'household' }),
  L('home', 'own', 'st_hometheater', 'A home theater', 15000, 20, "A projector, reclining seats, a screen across the basement wall.", { fam: 5, relief: 3, flash: 3, minYear: 1980, owner: 'household' }),
  L('home', 'once', 'st_gym', 'A private gym', 3000, 0, "A heavy bag, a rowing machine, a steam cabinet. Your doctor approves.", { health: 3, relief: 2, flash: 1, cd: 260 }),
  L('home', 'once', 'st_tennis', 'A tennis court', 6000, 0, "Clay, lights for evenings, a pro on Saturdays.", { fam: 3, relief: 2, flash: 3, cd: 520, g: { society: 2 } }),
  L('home', 'once', 'st_guestsuite', 'A guest suite', 5000, 0, "For your mother, for visitors from Philadelphia, for a man who needs a place for a week.", { fam: 3, flash: 2, cd: 520, g: { philly: 1 } }),
  L('home', 'once', 'st_patio', 'An outdoor barbecue patio and garden', 3500, 0, "A brick grill, a flagstone patio, roses, a fig tree from the old country.", { fam: 4, crew: 1, flash: 2, cd: 260 }),
  L('home', 'own', 'st_antiques', 'Antiques for the parlor', 4000, 0, "A Philadelphia highboy, a grandfather clock, a dealer's word on everything.", { respect: 1, flash: 2, resale: 0.85, drift: 0.04, g: { society: 2 } }),
  L('home', 'own', 'st_rarebooks', 'Rare books (a first-edition collection)', 2500, 0, "Leather spines in a glass case. Nobody reads them; everybody notices them.", { flash: 1, resale: 0.9, drift: 0.05, g: { society: 1 } }),
  H('st_caretaker', 'A caretaker for the house', 60, 40, "A man who lives over the garage, fixes everything and notices every car on the street.", { mods: { guard: 1 }, hire: { skill: 55, rep: 'Ex-Navy', avail: 'Now' } }),
  H('st_housekeeper', 'A housekeeper', 70, 45, "Runs the house, the maid, the shopping and your wife's schedule.", { wife: 4, relief: 2, flash: 1, req: 'spouse', hire: { skill: 65, rep: 'Ran a house on the Main Line', avail: 'Now' } }),
  // ---------- §10 Luxury transportation ----------
  X('vehicles', 'cars', 'own', 'st_duesenberg', 'A restored classic: a 1930 Duesenberg', 9000, 20, "Thirty years old, longer than a hearse, restored by a man in Hershey. It is the car at the concours.", { respect: 3, relief: 4, flash: 7, unl: ['car'], stock: 1, resale: 0.9, drift: 0.06, notice: ['Every car man on the island'] }),
  X('vehicles', 'cars', 'own', 'st_touring', 'A custom touring car (coachbuilt)', 16000, 25, "A body built to your order on a Cadillac chassis: a bar, a radio, curtains.", { respect: 4, relief: 3, flash: 8, unl: ['car', 'limo'], stock: 1 }),
  X('vehicles', 'cars', 'own', 'st_bmwmoto', 'A BMW R69S motorcycle', 1500, 4, "German, black, smooth as a sewing machine.", { relief: 3, flash: 2 }),
  X('vehicles', 'boats', 'own', 'st_sailyacht', 'A sailing yacht (a 45-foot yawl)', 40000, 120, "Teak and canvas, built in Maine. The yacht-club commodore suddenly remembers your name.", { respect: 4, relief: 8, flash: 7, unl: ['boat', 'bigboat'], needs: ['slip'], g: { society: 4 }, quals: 'A paid captain for anything past the inlet' }),
  X('vehicles', 'boats', 'once', 'st_charterplane', 'A chartered plane to anywhere', 1500, 0, "A twin-engine charter out of Cape May County airport: Miami, Havana while it lasts, Montreal.", { relief: 3, flash: 4, model: 'rent', cd: 4, notice: ['The FBI (they read the manifests)'] }),
  X('vehicles', 'cars', 'once', 'st_railcar', 'A private railcar on the Pennsylvania Railroad', 2500, 0, "A rented private car hooked to the Broadway Limited: a dining room, berths, a porter.", { respect: 2, relief: 4, flash: 5, model: 'rent', cd: 13 }),
  X('vehicles', 'cars', 'svc', 'st_chauffeured', 'A chauffeur-driven sedan (leased, with the driver)', 300, 120, "A black Cadillac, a driver in a cap, a monthly bill. Nothing in your name.", { respect: 2, relief: 3, flash: 4, model: 'lease', mods: { guard: 3, irsShield: 3 } }),
  // ---------- §11 Clothes and personal status (styles) ----------
  S('st_luggage', 'Leather luggage (a matched set)', 400, "Seven pieces of saddle leather with your initials.", 'traditional', { gift: 'anyone' }),
  S('st_dinnersuit', 'A formal dinner suit with a shawl collar', 300, "Black, silk lapels, cut to make a big man look tall.", 'traditional', { unl: ['tux'] }),
  S('st_customshoes', 'Custom shoes from a London last-maker', 250, "Measured once, made in London, they last forty years.", 'understated'),
  S('st_sharkskin', 'A sharkskin suit in electric blue', 350, "It shimmers under the lights. The Philadelphia men think it's loud.", 'flamboyant', { respect: 1, flash: 4 }),
  S('st_ivy', 'An Ivy League wardrobe (Brooks Brothers)', 600, "Button-downs, a grey flannel, a navy blazer. A banker's clothes.", 'understated', { mods: { accept: 1 } }),
  S('st_workclothes', 'Work clothes and a good raincoat', 60, "Khakis, boots, a London Fog. A man who doesn't care who's looking.", 'practical'),
  S('st_italiansuit', 'An Italian silk suit (Brioni, Rome)', 500, "Narrow lapels, a shine to the cloth. The young men notice; the old men frown.", 'fashionable', { respect: 1, flash: 3 }),
  L('jewelry', 'own', 'st_gown', 'An evening gown for your wife (Fifth Avenue)', 800, 0, "Silk, a designer name, for New Year's Eve and the charity ball.", { wife: 5, flash: 3, req: 'spouse', gift: 'wife', owner: 'recipient', style: 'fashionable' }),
  L('jewelry', 'own', 'st_designerdress', 'A designer dress for your wife', 400, 0, "Paris by way of a Philadelphia department store.", { wife: 4, flash: 2, req: 'spouse', gift: 'wife', owner: 'recipient', style: 'fashionable' }),
  L('jewelry', 'once', 'st_engagement', 'An engagement ring for a grown child\'s match', 2000, 0, "Two carats for your son to give his girl. The families meet over it.", { fam: 6, flash: 3, req: 'adultChild', each: true, style: 'traditional' }),
  L('jewelry', 'own', 'st_weddingband', 'A new wedding band for your wife', 600, 0, "Diamonds set all the way round. She says she didn't need it; she wears it.", { wife: 6, flash: 2, req: 'spouse', gift: 'wife', owner: 'recipient', style: 'traditional' }),
  L('jewelry', 'own', 'st_earrings_w', 'Diamond earrings for your wife', 1800, 0, "Two carats each, from a Sansom Street jeweler.", { wife: 7, flash: 4, req: 'spouse', gift: 'wife', owner: 'recipient', style: 'flamboyant' }),
  S('st_tiepin', 'A gold tie pin with a pearl', 120, "Small, old-fashioned, perfect.", 'traditional'),
  X('lifestyle', 'gifts', 'once', 'st_stationery', 'Engraved personal stationery', 40, 0, "Heavy cream paper, your name engraved, envelopes lined in blue.", { flash: 0, style: 'understated', cd: 52 }),
  S('st_lighter', 'A Dunhill gold lighter', 150, "It clicks like a safe. The men reach for it.", 'flamboyant', { gift: 'anyone' }),
  // ---------- §12 Experiences and memberships ----------
  X('lifestyle', 'society', 'once', 'st_dinnerparty', 'A private dinner party at home', 600, 0, "Twelve at the table, a chef for the night, your best wine, the right guests.", { respect: 1, wife: 3, crew: 1, flash: 2, cd: 4, g: { pols: 1, society: 1 } }),
  X('lifestyle', 'vice', 'once', 'st_shoreweekend', 'A weekend at a grand shore hotel in Cape May', 300, 0, "An ocean-view room, dinner dancing, breakfast in bed.", { wife: 5, relief: 4, flash: 1, req: 'spouse', cd: 8 }),
  X('lifestyle', 'vice', 'once', 'st_golflessons', 'Golf lessons with the club pro', 150, 0, "Ten lessons. Your slice is still a slice, but now you know why.", { relief: 2, flash: 1, cd: 26, g: { society: 1 } }),
  X('lifestyle', 'vice', 'once', 'st_ski', 'A ski holiday at Lake Placid', 1500, 0, "Snow, a lodge, a fire, the kids on the bunny slope.", { fam: 5, relief: 6, flash: 2, months: [12, 1, 2, 3], cd: 52 }),
  X('lifestyle', 'vice', 'once', 'st_europe', 'A European vacation (the Grand Tour)', 6000, 0, "Paris, Rome, Venice, the village in Calabria, a month on the Cristoforo Colombo.", { fam: 5, wife: 8, relief: 12, flash: 4, cd: 104 }),
  X('legacy', 'family', 'once', 'st_reunion', 'A family reunion', 1500, 0, "Two hundred cousins at a picnic grove, a roast pig, a photograph with everybody in it.", { fam: 8, flash: 2, months: [6, 7, 8], cd: 52 }),
  X('legacy', 'family', 'once', 'st_graduation', 'A graduation party', 800, 0, "A cake shaped like a diploma, the relatives, an envelope from every capo.", { fam: 5, flash: 1, req: 'adultChild', each: true }),
  X('lifestyle', 'gifts', 'once', 'st_cargift', 'A new car as a gift for a grown child', 3000, 0, "A Bel Air with a bow on the roof in the driveway.", { fam: 7, flash: 3, req: 'adultChild', each: true, gift: 'son', owner: 'recipient' }),
  X('lifestyle', 'gifts', 'once', 'st_partnerbiz', "Backing for your wife's own business (a dress shop)", 4000, 0, "Her shop, her name on the sign, her money in the end.", { wife: 10, fam: 2, flash: 2, req: 'spouse', cd: 520, owner: 'recipient', hooks: ['She makes her own money, and her own decisions'] }),
  X('lifestyle', 'society', 'once', 'st_sponsorship', 'Sponsor the boardwalk Fourth of July parade', 2000, 0, "Your company's banner, a float, the band from the high school.", { respect: 2, flash: 4, months: [6, 7], cd: 52, g: { town: 5 } }),
  // ---------- §13 Protection, staff and professional help ----------
  H('st_famdetail', 'A protection detail for the family', 400, 220, "Two men on your wife and children, around the clock, at school and church.", { fam: 2, relief: 3, flash: 4, mods: { guard: 5 }, hire: { skill: 65, rep: 'Ex-state troopers', avail: 'Now', conflict: 'They report to you, not to your wife: she will resent it' }, notice: ['The neighbors', 'The FBI'] }),
  H('st_ressecurity', 'Residential security (a guard at the gate)', 150, 90, "A man in a booth at the end of the driveway, a log of every car.", { relief: 2, flash: 3, mods: { guard: 3 }, hire: { skill: 50, rep: 'A security agency', avail: 'Now' } }),
  X('services', 'services', 'once', 'st_eventsecurity', 'Security for a wedding or a big party', 400, 0, "Men at the doors, a list, nobody uninvited, no photographs from the street.", { flash: 1, cd: 4, mods: {}, model: 'hire' }),
  X('services', 'services', 'once', 'st_inspection', 'A property inspection', 150, 0, "An engineer walks every building you own and writes down what will fall down first.", { flash: 0, cd: 26, mods: {}, relief: 1, advice: "Cheap, and it tells us where the next big bill is coming from." }),
  X('services', 'services', 'once', 'st_mediator', 'A professional mediator for a business dispute', 500, 0, "A retired judge who settles things between partners without anybody going to court.", { flash: 0, cd: 13, g: { pols: 1 } }),
  X('services', 'services', 'once', 'st_valuation', 'A business valuation', 300, 0, "An accountant from Philadelphia puts a number on everything you own.", { flash: 0, cd: 26, relief: 1 }),
  // ---------- Your pocket: the gaps the owner asked for (a Florida condo, a better place for her) ----------
  P('st_miamicondo', 'A condo on Collins Avenue, Miami Beach', 16000, 15, "Two bedrooms on the ninth floor of a new tower, a balcony over the ocean, a doorman who never saw you. The winter, or a few quiet weeks when home gets hot.", {
    fam: 6, relief: 8, respect: 2, flash: 4, resale: 0.9, drift: 0.04, unl: ['florida'], g: { philly: 2 }, where: 'Miami Beach, Florida',
    advice: 'A place of our own down there: no hotel register with your name in it. When the heat is on up here, that matters more than the view.', hooks: ['A Philadelphia man two floors down', 'A hurricane season'],
  }),
  L('home', 'own', 'st_goomar_flat', 'A better apartment for her (a garden flat in the Crest)', 2500, 15, "Her own door, a garden, a quiet street, the lease in her name. The extra rent comes from your pocket every week.", {
    wife: 10, relief: 2, flash: 2, req: 'goomar', gift: 'goomar', owner: 'recipient', mature: true, limit: 1,
    risk: { p: 0.12, wife: -12, text: 'Your wife saw the lease on a garden flat in the Crest. Her name was not on it.' },
    advice: 'She will love it. The more you spend on her, the more there is to find.',
  }),
  // ---------- Licensed people the professions need ----------
  H('st_cpa', 'A certified public accountant', 150, 80, "A CPA with his license on the wall, so the bookkeeping firm can sign returns.", { unl: ['cpa'], mods: { irsShield: 5 }, hire: { skill: 75, rep: 'Ten years with a Philadelphia firm', avail: 'Now' } }),
  H('st_mortician', 'A licensed funeral director', 120, 70, "State-licensed, soft-spoken, the only person who can sign for a burial.", { unl: ['mortician'], hire: { skill: 70, rep: 'Trained in Philadelphia', avail: 'Now' } }),
  H('st_captainlic', 'Licensed charter captains', 150, 90, "Two Coast Guard-licensed captains for the charter boats.", { unl: ['captain_lic'], hire: { skill: 70, rep: 'Twenty years out of the inlet', avail: 'In season' } }),
];
