import { age, hasTrait } from './characters';
import type { TeamId, ZoneId } from './econState';
import type { Acceptance, Reason } from './interactions';
import { getRelation, opinion } from './relations';
import { hashSeed } from './rng';
import type { Character, GameState } from './types';

/**
 * Luxury and community. About 130 period gifts at 1960s prices (cars, furs,
 * jewelry, watches, handbags, houses, trips, season tickets, a racehorse),
 * each person's tastes, and the opinion math: a gift someone likes counts for
 * more, the wrong gift makes him uncomfortable, and a gift too lavish for who
 * he is makes him wonder what you want.
 *
 * Community projects take weeks to finish and build a district's appreciation
 * and, more slowly, its trust: people can like the playground and still not
 * trust the man who paid for it.
 *
 * Leverage gifts (cash, a car, property, a job, an invitation, an
 * introduction) come with acceptance odds; the other adult decides. People are
 * never gifts: an introduction is a meeting, and what comes of it is theirs.
 */

export type GiftCat = 'car' | 'fur' | 'jewelry' | 'watch' | 'handbag' | 'clothes' | 'home' | 'trip' | 'sport' | 'art' | 'liquor' | 'church' | 'cash' | 'leisure';

export const GIFT_CAT_LABEL: Record<GiftCat, string> = {
  car: 'Cars & boats', fur: 'Furs', jewelry: 'Jewelry', watch: 'Watches', handbag: 'Handbags', clothes: 'Clothes', home: 'Homes & houses',
  trip: 'Trips', sport: 'Tickets & sport', art: 'Art & keepsakes', liquor: 'Wine, liquor & cigars', church: 'Church & charity', cash: 'Cash', leisure: 'Leisure',
};

export interface Gift {
  id: string;
  name: string;
  cat: GiftCat;
  price: number;
  minYear?: number;
  maxYear?: number;
  /** Season tickets for this team (inheritable). */
  team?: TeamId;
  box?: boolean;
}

const G = (id: string, name: string, cat: GiftCat, price: number, minYear?: number, maxYear?: number, extra: Partial<Gift> = {}): Gift => ({ id, name, cat, price, minYear, maxYear, ...extra });

export const GIFTS: Gift[] = [
  // Cars & boats
  G('eldorado', 'Cadillac Eldorado Biarritz', 'car', 7400, 1960, 1966),
  G('coupedeville', 'Cadillac Coupe de Ville', 'car', 5250),
  G('series62', 'Cadillac Series 62 convertible', 'car', 5450, 1960, 1964),
  G('fleetwood', 'Cadillac Fleetwood Sixty Special', 'car', 6250),
  G('markv', 'Lincoln Continental Mark V', 'car', 6800, 1960, 1960),
  G('continental61', 'Lincoln Continental (suicide doors)', 'car', 6100, 1961),
  G('imperial', 'Chrysler Imperial Crown', 'car', 5400),
  G('corvette', 'Chevrolet Corvette', 'car', 3900, 1960, 1962),
  G('stingray', 'Corvette Sting Ray', 'car', 4250, 1963),
  G('tbird', 'Ford Thunderbird', 'car', 3800),
  G('impala', 'Chevrolet Impala convertible', 'car', 3000),
  G('electra', 'Buick Electra 225', 'car', 4300),
  G('olds98', 'Oldsmobile 98', 'car', 4000),
  G('190sl', 'Mercedes-Benz 190SL', 'car', 4000, 1960, 1963),
  G('etype', 'Jaguar E-Type', 'car', 5600, 1961),
  G('mustang', 'Ford Mustang', 'car', 2400, 1964),
  G('gto', 'Pontiac GTO', 'car', 3000, 1964),
  G('riviera', 'Buick Riviera', 'car', 4400, 1963),
  G('toronado', 'Oldsmobile Toronado', 'car', 4600, 1966),
  G('eldorado67', 'Cadillac Eldorado (front-drive)', 'car', 6900, 1967),
  G('markiii', 'Lincoln Continental Mark III', 'car', 6600, 1969),
  G('squire', 'Ford Country Squire station wagon', 'car', 3100),
  G('vespa', 'Vespa scooter', 'car', 400),
  G('runabout', 'Chris-Craft mahogany runabout', 'car', 4500),
  G('cruiser', 'A 38-foot Chris-Craft cabin cruiser', 'car', 18000),
  G('harley', 'Harley-Davidson Duo-Glide', 'car', 1500, 1960, 1964),
  // Furs
  G('mink', 'Ranch mink coat', 'fur', 3500),
  G('blackmink', 'Black diamond mink coat', 'fur', 6000),
  G('minkstole', 'Mink stole', 'fur', 1200),
  G('foxstole', 'Fox stole', 'fur', 450),
  G('chinchilla', 'Chinchilla jacket', 'fur', 5000),
  G('sable', 'Russian sable coat', 'fur', 12000),
  G('persian', 'Persian lamb coat', 'fur', 900),
  G('beaver', 'Beaver coat', 'fur', 700),
  // Jewelry
  G('ring1', 'One-carat diamond ring', 'jewelry', 1500),
  G('ring3', 'Three-carat diamond ring', 'jewelry', 7500),
  G('pearls', 'Mikimoto pearl necklace', 'jewelry', 600),
  G('emeralds', 'Emerald earrings', 'jewelry', 2500),
  G('tennis', 'Diamond line bracelet', 'jewelry', 3000),
  G('charm', 'Gold charm bracelet', 'jewelry', 250),
  G('brooch', 'Sapphire brooch', 'jewelry', 1800),
  G('cufflinks', '14k gold cufflinks', 'jewelry', 150),
  G('pinky', 'Diamond pinky ring', 'jewelry', 900),
  G('stchristopher', 'Gold St. Christopher medal', 'jewelry', 80),
  G('ruby', 'Ruby pendant', 'jewelry', 1200),
  G('idbracelet', 'Gold ID bracelet, engraved', 'jewelry', 300),
  // Watches
  G('datejust', 'Rolex Datejust', 'watch', 400),
  G('president', 'Rolex Day-Date "President"', 'watch', 1000),
  G('calatrava', 'Patek Philippe Calatrava', 'watch', 1200),
  G('constellation', 'Omega Constellation', 'watch', 250),
  G('tank', 'Cartier Tank', 'watch', 600),
  G('accutron', 'Bulova Accutron', 'watch', 175),
  G('ventura', 'Hamilton Ventura', 'watch', 100),
  G('ap', 'Audemars Piguet dress watch', 'watch', 1500),
  // Handbags
  G('kelly', 'Hermès Kelly bag', 'handbag', 600),
  G('chanel', 'Chanel 2.55 quilted bag', 'handbag', 450),
  G('gucci', 'Gucci bamboo-handle bag', 'handbag', 200),
  G('coach', 'Coach leather bag', 'handbag', 60, 1961),
  G('lucite', 'Lucite box purse', 'handbag', 50),
  G('leiber', 'Judith Leiber minaudière', 'handbag', 300, 1963),
  G('speedy', 'Louis Vuitton Speedy', 'handbag', 150),
  // Clothes
  G('suit', 'Bespoke suit from a Philadelphia tailor', 'clothes', 350),
  G('overcoat', 'Cashmere overcoat', 'clothes', 250),
  G('ties', 'A dozen Italian silk ties', 'clothes', 120),
  G('dior', 'Christian Dior gown', 'clothes', 1500),
  G('borsalino', 'Borsalino fedora', 'clothes', 60),
  G('gators', 'Alligator shoes', 'clothes', 120),
  G('sharkskin', 'Sharkskin mohair suit', 'clothes', 200),
  // Homes
  G('mamahouse', 'A house for his mother in South Philly', 'home', 14000),
  G('crestcottage', 'A shore cottage in the Crest', 'home', 12000),
  G('florida', 'A place in Hollywood Beach, Florida', 'home', 20000),
  G('pocono', 'A Pocono cabin by the lake', 'home', 8000),
  G('rowhome', 'A brick rowhome', 'home', 9000),
  G('cherryhill', 'A split-level in Cherry Hill', 'home', 18000, 1961),
  G('penthouse', 'A penthouse apartment in Atlantic City', 'home', 25000),
  G('furniture', 'New furniture for the whole house', 'home', 3000),
  G('colortv', 'RCA color television', 'home', 600),
  G('hifi', 'Hi-fi console', 'home', 400),
  G('kitchen', 'A new Frigidaire kitchen', 'home', 1200),
  G('pool', 'A swimming pool in the backyard', 'home', 4000),
  G('carpet', 'Wall-to-wall carpet, every room', 'home', 800),
  // Trips (no Havana after 1959)
  G('miami', 'A week at the Fontainebleau, Miami Beach', 'trip', 800),
  G('vegas', 'A week at the Sands, Las Vegas', 'trip', 700),
  G('italy', 'A month in Italy, back to the old village', 'trip', 2500),
  G('capri', 'Rome and Capri', 'trip', 3000),
  G('bermuda', 'A Bermuda cruise', 'trip', 1100),
  G('grossingers', 'A weekend at Grossinger\'s in the Catskills', 'trip', 350),
  G('sanjuan', 'San Juan and the casinos', 'trip', 900),
  G('acapulco', 'Acapulco', 'trip', 1200),
  G('paris', 'Paris in the spring', 'trip', 2800),
  G('niagara', 'Niagara Falls', 'trip', 250),
  G('havana', 'Havana and the Tropicana', 'trip', 900, 1900, 1959),
  G('hotsprings', 'The baths at Hot Springs', 'trip', 500),
  // Tickets & sport
  G('phillies', 'Phillies season tickets (upper deck)', 'sport', 150, 1960, undefined, { team: 'phillies' }),
  G('philliesbox', 'Phillies season box seats', 'sport', 400, 1960, undefined, { team: 'phillies', box: true }),
  G('eagles', 'Eagles season tickets', 'sport', 180, 1960, undefined, { team: 'eagles' }),
  G('eaglesbox', 'Eagles season box at Franklin Field', 'sport', 500, 1960, undefined, { team: 'eagles', box: true }),
  G('warriors', 'Warriors season tickets (Wilt at Convention Hall)', 'sport', 120, 1960, 1962, { team: 'warriors' }),
  G('sixers', '76ers season tickets', 'sport', 150, 1963, undefined, { team: 'sixers' }),
  G('flyers', 'Flyers season tickets at the Spectrum', 'sport', 200, 1967, undefined, { team: 'flyers' }),
  G('ringside', 'Ringside for fight night at the Arena', 'sport', 100),
  G('titlefight', 'Ringside at a title fight in New York', 'sport', 400),
  G('racehorse', 'A racehorse at Garden State Park', 'sport', 6000),
  G('racebox', 'A box at Atlantic City Race Course', 'sport', 1500),
  G('golfclub', 'A membership at the country club', 'sport', 1500),
  G('armynavy', 'Army-Navy game tickets', 'sport', 80),
  G('worldseries', 'World Series tickets', 'sport', 250),
  // Art & keepsakes
  G('portrait', 'An oil portrait of his family', 'art', 800),
  G('capodimonte', 'Capodimonte porcelain', 'art', 300),
  G('sinatra', 'A signed Sinatra record and photograph', 'art', 150),
  G('hummel', 'Hummel figurines', 'art', 120),
  G('murano', 'A Murano glass chandelier', 'art', 900),
  G('marble', 'An Italian marble statue', 'art', 2500),
  G('painting', 'A painting by a real artist', 'art', 5000),
  // Wine, liquor & cigars
  G('chivas', 'A case of Chivas Regal', 'liquor', 120),
  G('cubans', 'A box of Cuban cigars (before the embargo)', 'liquor', 300, 1960, 1962),
  G('humidor', 'A humidor of Dominican cigars', 'liquor', 200),
  G('barolo', 'A case of Barolo', 'liquor', 150),
  G('dom', 'A case of Dom Pérignon', 'liquor', 250),
  G('cellar', 'A cellar of Italian wine', 'liquor', 1500),
  // Church & charity
  G('window', 'A stained-glass window in his name', 'church', 3000),
  G('masscards', 'Mass cards and a donation to his parish', 'church', 200),
  G('organ', 'A new organ for his church', 'church', 6000),
  G('scholarship', 'A scholarship in his name at St. Joseph\'s', 'church', 2000),
  G('hospital', 'A donation to the hospital in his mother\'s name', 'church', 1000),
  // Cash
  G('envelope', 'An envelope', 'cash', 500),
  G('fatenvelope', 'A fat envelope', 'cash', 2000),
  G('bonds', 'Savings bonds for the kids', 'cash', 1000),
  G('collegefund', 'A college fund for the kids', 'cash', 5000),
  // Leisure
  G('golfclubs', 'A set of MacGregor golf clubs', 'leisure', 200),
  G('charter', 'A fishing-boat charter for the season', 'leisure', 600),
  G('beretta', 'A Beretta over-under shotgun', 'leisure', 500),
  G('puppy', 'A puppy from a good breeder', 'leisure', 150),
];

export const GIFTS_BY_ID: Record<string, Gift> = Object.fromEntries(GIFTS.map((g) => [g.id, g]));

export function giftAvailable(g: Gift, year: number): boolean {
  return (g.minYear ?? 0) <= year && (g.maxYear ?? 9999) >= year;
}

export function giftPrice(s: GameState, g: Gift): number {
  return Math.round(g.price * 1.03 ** Math.max(0, s.date.y - 1960) / 10) * 10;
}

/* ---------------- tastes ---------------- */

const CATS: GiftCat[] = ['car', 'fur', 'jewelry', 'watch', 'handbag', 'clothes', 'home', 'trip', 'sport', 'art', 'liquor', 'church', 'cash', 'leisure'];

export interface Tastes {
  likes: GiftCat[];
  dislikes: GiftCat[];
}

/** What someone likes and dislikes in a gift: their traits first, then their own quirks. Deterministic. */
export function tastes(c: Character): Tastes {
  const likes: GiftCat[] = [];
  const dislikes: GiftCat[] = [];
  const add = (arr: GiftCat[], x: GiftCat) => { if (!arr.includes(x) && !(arr === likes ? dislikes : likes).includes(x)) arr.push(x); };
  if (hasTrait(c, 'Pious')) { add(likes, 'church'); add(dislikes, 'liquor'); }
  if (hasTrait(c, 'Gambler')) add(likes, 'sport');
  if (hasTrait(c, 'Drinker')) add(likes, 'liquor');
  if (hasTrait(c, 'Honest')) add(dislikes, 'cash');
  if (hasTrait(c, 'Greedy')) add(likes, 'cash');
  if (hasTrait(c, 'Charming')) add(likes, 'clothes');
  if (hasTrait(c, 'Paranoid')) add(dislikes, 'trip');
  let h = hashSeed(`taste:${c.id}`);
  const next = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return h; };
  let guard = 0;
  while (likes.length < 2 && guard++ < 20) add(likes, CATS[next() % CATS.length]);
  guard = 0;
  while (dislikes.length < 1 && guard++ < 20) add(dislikes, CATS[next() % CATS.length]);
  return { likes: likes.slice(0, 3), dislikes: dislikes.slice(0, 2) };
}

/** Above this a gift makes him wonder what you want. */
export function lavishLimit(s: GameState, c: Character): number {
  const infl = 1.03 ** Math.max(0, s.date.y - 1960);
  if (c.dynasty) return 25000 * infl;
  if (c.office) return 2500 * infl;
  if (c.faction !== 'player') return (c.rank === 'boss' || c.rank === 'underboss' ? 8000 : 2000) * infl;
  const by: Record<string, number> = { associate: 400, soldier: 1200, capo: 4000, underboss: 6000, consigliere: 6000, boss: 10000, civilian: 1500 };
  return (by[c.rank] ?? 1500) * infl;
}

export interface GiftResult {
  opinion: number;
  trust: number;
  /** +1 liked, 0 fine, -1 the wrong gift. */
  fit: number;
  reasons: Reason[];
}

/**
 * The gift-taste opinion math. Base value grows with the log of the price;
 * a liked kind is worth half again plus five; a disliked kind turns into
 * discomfort; too lavish for who he is costs trust and a fifth of the
 * goodwill; the same kind twice inside six months counts half.
 */
export function giftOpinion(s: GameState, c: Character, g: Gift, price = giftPrice(s, g)): GiftResult {
  const t = tastes(c);
  const reasons: Reason[] = [];
  const base = Math.max(2, Math.min(30, Math.round(4 * Math.log(price / 50))));
  reasons.push({ label: `A ${price >= 5000 ? 'lavish' : price >= 1000 ? 'generous' : 'thoughtful'} gift`, value: base });
  let op = base;
  let fit = 0;
  if (t.likes.includes(g.cat)) {
    const extra = Math.round(base * 0.5) + 5;
    op += extra;
    fit = 1;
    reasons.push({ label: `He loves ${GIFT_CAT_LABEL[g.cat].toLowerCase()}`, value: extra });
  } else if (t.dislikes.includes(g.cat)) {
    const turn = -(op + 5 + Math.round(base * 0.3));
    op += turn;
    fit = -1;
    reasons.push({ label: `The wrong gift: ${GIFT_CAT_LABEL[g.cat].toLowerCase()} makes him uncomfortable`, value: turn });
  }
  let trust = fit > 0 ? 3 : fit < 0 ? -3 : 1;
  const limit = lavishLimit(s, c) * (hasTrait(c, 'Paranoid') ? 0.5 : 1);
  if (price > limit) {
    const cut = -Math.max(1, Math.round(Math.max(0, op) * 0.2));
    op += cut;
    trust -= 10;
    reasons.push({ label: `Too much for a ${c.dynasty ? 'relative' : c.office ? 'public man' : c.rank}: what does he want?`, value: cut });
  }
  const recent = (s.econ?.gifts ?? []).filter((x) => x.to === c.id && s.week - x.week < 26 && GIFTS_BY_ID[x.giftId]?.cat === g.cat).length;
  if (recent > 0 && op > 0) {
    const cut = -Math.round(op / 2);
    op += cut;
    reasons.push({ label: 'Another one of those', value: cut });
  }
  return { opinion: op, trust, fit, reasons };
}

/* ---------------- season tickets ---------------- */

export const TEAMS: Record<TeamId, { name: string; months: number[]; from: number; to?: number }> = {
  phillies: { name: 'Phillies', months: [4, 5, 6, 7, 8, 9], from: 1883 },
  eagles: { name: 'Eagles', months: [9, 10, 11, 12], from: 1933 },
  warriors: { name: 'Warriors', months: [10, 11, 12, 1, 2, 3], from: 1946, to: 1962 },
  sixers: { name: '76ers', months: [10, 11, 12, 1, 2, 3, 4], from: 1963 },
  flyers: { name: 'Flyers', months: [10, 11, 12, 1, 2, 3, 4], from: 1967 },
};

export function teamPlaying(team: TeamId, s: GameState): boolean {
  const t = TEAMS[team];
  return s.date.y >= t.from && (t.to === undefined || s.date.y <= t.to) && t.months.includes(s.date.m);
}

/** Tickets the boss's house holds (his own and his family's). */
export function houseTickets(s: GameState) {
  return (s.econ?.tickets ?? []).filter((t) => t.holderId === s.playerId || s.characters[t.holderId]?.dynasty);
}

/** Who inherits a dead holder's tickets: the eldest living child, then the spouse. */
export function ticketHeir(s: GameState, c: Character): Character | undefined {
  const kids = c.childrenIds.map((id) => s.characters[id]).filter((k): k is Character => !!k?.alive).sort((a, b) => age(s, b) - age(s, a));
  if (kids[0]) return kids[0];
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  return sp?.alive ? sp : undefined;
}

/* ---------------- community projects ---------------- */

export interface ProjectDef {
  kind: string;
  name: string;
  cost: number;
  weeks: number;
  rep: number;
  respect: number;
  /** Months it can start in (undefined = any). */
  months?: number[];
}

export const PROJECTS: ProjectDef[] = [
  { kind: 'fooddrive', name: 'A food drive', cost: 400, weeks: 3, rep: 4, respect: 1 },
  { kind: 'turkeys', name: 'Thanksgiving turkeys for every family on the block', cost: 600, weeks: 2, rep: 6, respect: 1, months: [10, 11] },
  { kind: 'toys', name: 'A Christmas toy drive', cost: 800, weeks: 3, rep: 6, respect: 1, months: [11, 12] },
  { kind: 'coats', name: 'A winter coat drive', cost: 500, weeks: 3, rep: 4, respect: 1, months: [10, 11, 12, 1, 2] },
  { kind: 'pantry', name: 'A food pantry at the parish hall', cost: 1200, weeks: 6, rep: 6, respect: 1 },
  { kind: 'littleleague', name: 'Sponsor the Little League (uniforms with your name)', cost: 1500, weeks: 8, rep: 7, respect: 2, months: [2, 3, 4, 5] },
  { kind: 'court', name: 'A basketball court', cost: 2500, weeks: 8, rep: 7, respect: 2 },
  { kind: 'scholarships', name: 'Scholarships for the parish school', cost: 2500, weeks: 4, rep: 7, respect: 2 },
  { kind: 'concerts', name: 'A summer concert series on the beach', cost: 2000, weeks: 10, rep: 8, respect: 2, months: [5, 6, 7] },
  { kind: 'firegear', name: 'New gear for the volunteer fire company', cost: 3000, weeks: 8, rep: 9, respect: 2 },
  { kind: 'playground', name: 'A playground', cost: 4000, weeks: 12, rep: 10, respect: 3 },
  { kind: 'library', name: 'A school library', cost: 5000, weeks: 12, rep: 10, respect: 3 },
  { kind: 'roof', name: 'A new roof for the church', cost: 6000, weeks: 16, rep: 12, respect: 3 },
  { kind: 'youth', name: 'A youth center', cost: 12000, weeks: 26, rep: 15, respect: 4 },
  { kind: 'pool', name: 'A public pool', cost: 15000, weeks: 30, rep: 16, respect: 4 },
  { kind: 'clinic', name: 'A neighborhood clinic', cost: 20000, weeks: 40, rep: 18, respect: 5 },
  { kind: 'hospitalwing', name: 'A hospital wing with your family\'s name on it', cost: 40000, weeks: 52, rep: 25, respect: 8 },
];
export const PROJECTS_BY_KIND: Record<string, ProjectDef> = Object.fromEntries(PROJECTS.map((p) => [p.kind, p]));

/** Trust grows a third as fast as appreciation, and local heat caps it. */
export function trustGain(s: GameState, rep: number): number {
  return Math.max(1, Math.round(rep / 3 * (1 - s.heat.local / 150)));
}

export function zoneRep(s: GameState, z: ZoneId) {
  return s.econ?.zones[z] ?? { rep: 0, trust: 0 };
}

/* ---------------- leverage gifts ---------------- */

export interface LeverageDef {
  name: string;
  /** What it costs you (cash and car: now; job: a week, ongoing). */
  cost: (s: GameState, c: Character) => number;
  base: number;
  /** Opinion if accepted. */
  opinion: number;
  /** Leaves a hook (weak) if accepted. */
  hook: boolean;
  blurb: string;
}

export const LEVERAGE: Record<string, LeverageDef> = {
  cash: { name: 'An envelope', cost: (_s, c) => (c.office ? 1500 : 800), base: 40, opinion: 8, hook: true, blurb: 'Cash, no strings mentioned. Strings understood.' },
  car: { name: 'A new Cadillac', cost: () => 5250, base: 35, opinion: 15, hook: true, blurb: 'Keys on the desk, title in his brother-in-law\'s name.' },
  property: { name: 'A shore cottage at a friendly price', cost: () => 9000, base: 30, opinion: 18, hook: true, blurb: 'A deed through a straw buyer. He pays a dollar.' },
  job: { name: 'A job on a payroll', cost: () => 60, base: 55, opinion: 10, hook: true, blurb: 'His son on the books at one of your places. $60 a week, ongoing, whether he shows up or not.' },
  invite: { name: 'An invitation', cost: () => 150, base: 65, opinion: 6, hook: false, blurb: 'Dinner at the club, a box at the game, a table at the supper club.' },
  introduce: { name: 'An introduction', cost: () => 100, base: 60, opinion: 5, hook: false, blurb: 'A meeting with someone worth knowing. What comes of it is up to the two of them.' },
};

export function leverageOdds(s: GameState, c: Character, mode: string): Acceptance {
  const L = LEVERAGE[mode];
  const reasons: Reason[] = [{ label: 'Base', value: L.base }];
  const op = Math.round(opinion(s, c.id, s.playerId) / 2);
  if (op) reasons.push({ label: op >= 0 ? 'Thinks well of you' : 'Doesn\'t like you', value: op });
  if (hasTrait(c, 'Greedy')) reasons.push({ label: 'Greedy', value: 20 });
  if (hasTrait(c, 'Honest') && mode !== 'invite' && mode !== 'introduce') reasons.push({ label: 'Honest', value: -40 });
  if (hasTrait(c, 'Pious') && mode === 'cash') reasons.push({ label: 'Pious', value: -10 });
  if (hasTrait(c, 'Paranoid')) reasons.push({ label: 'Paranoid', value: -10 });
  if (c.office && mode !== 'invite' && mode !== 'introduce') reasons.push({ label: 'A public man: careful', value: -10 });
  if (s.hooks.some((h) => h.holder === 'player' && h.targetId === c.id)) reasons.push({ label: 'You have something on him', value: 25 });
  const prior = (s.econ?.gifts ?? []).filter((g) => g.to === c.id).length;
  if (prior) reasons.push({ label: `Took ${prior} gift${prior > 1 ? 's' : ''} from you before`, value: Math.min(15, prior * 5) });
  if (s.heat.local > 50 && c.office) reasons.push({ label: `Local heat ${s.heat.local}: everyone is nervous`, value: -Math.round(s.heat.local / 5) });
  const trust = getRelation(s, c.id, s.playerId)?.trust ?? 0;
  if (trust > 20) reasons.push({ label: 'Trusts you', value: Math.round(trust / 5) });
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons };
}
