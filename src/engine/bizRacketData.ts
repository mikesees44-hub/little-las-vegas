import type { Attributes, BusinessKind } from './types';

/**
 * WORK THIS PLACE — the data (bizRacket.ts has the rules). Pure tables, no
 * engine imports, so the time-cost table can read the hours without a cycle.
 *
 * Abstract on purpose: money, odds, heat, who objects and what the paper
 * prints. Violence is implied and off-screen; nobody is hurt on the page.
 * Rooms by the hour are adults' business and stay behind a closed door.
 */

/** The owner's pronouns: owner-facing text is written with {he} {his} {him} {himself} {wife} {man} (and capitalised forms). */
export type Pron = 'he' | 'she';
const MASC: Record<string, string> = { he: 'he', He: 'He', his: 'his', His: 'His', him: 'him', Him: 'Him', himself: 'himself', wife: 'wife', man: 'man' };
const FEM: Record<string, string> = { he: 'she', He: 'She', his: 'her', His: 'Her', him: 'her', Him: 'Her', himself: 'herself', wife: 'husband', man: 'woman' };
/** Fills the owner's pronouns into a text written with placeholders. */
export function pr(text: string, he: Pron = 'he'): string {
  const m = he === 'she' ? FEM : MASC;
  return text.replace(/\{(\w+)\}/g, (all, k: string) => m[k] ?? all);
}

/** What kind of trade a place is: what you can run through it depends on it. */
export type BizFamily = 'bar' | 'club' | 'restaurant' | 'motel' | 'arcade' | 'pier' | 'laundromat' | 'shop' | 'garage' | 'wholesale' | 'service';

export const FAMILY_LABEL: Record<BizFamily, string> = {
  bar: 'A bar', club: 'A nightclub', restaurant: 'A restaurant', motel: 'A motel', arcade: 'An arcade', pier: 'A pier attraction',
  laundromat: 'A laundry', shop: 'A shop', garage: 'A garage', wholesale: 'A wholesale business', service: 'A storefront service',
};

/** Property uses (property.ts USES) by trade. Anything not listed is a shop. */
const USE_FAMILY: Record<string, BizFamily> = {
  hoodclub: 'bar', jazzclub: 'bar', comedy: 'bar',
  supper: 'club', burlesque: 'club', gents: 'club', grindhouse: 'club', concerthall: 'club', cinema: 'club',
  trattoria: 'restaurant', diner: 'restaurant', pizza: 'restaurant', deli: 'restaurant', bakery: 'restaurant', icecream: 'restaurant',
  motel: 'motel', boarding: 'motel', rooming: 'motel', boardinghouse: 'motel', flophouse: 'motel', hotel: 'motel',
  arcade: 'arcade', minigolf: 'arcade',
  ride: 'pier', funhouse: 'pier', stand: 'pier', beachrental: 'pier', bikes: 'pier', photo: 'pier',
  laundromat: 'laundromat', drycleaner: 'laundromat', commlaundry: 'laundromat', carwash: 'laundromat',
  gas: 'garage', garage: 'garage', taxigarage: 'garage',
  wholesale: 'wholesale', beverage: 'wholesale', warehouse: 'wholesale', dockwh: 'wholesale', delivery: 'wholesale', truckyard: 'wholesale', vendroute: 'wholesale',
  contractor: 'wholesale', lumberyard: 'wholesale', concreteplant: 'wholesale', carting: 'wholesale', marina: 'wholesale', printplant: 'wholesale', machineshop: 'wholesale',
  barber: 'service', salon: 'service', shoerepair: 'service', tailor: 'service', funeral: 'service', printer: 'service', rehearsal: 'service', radio: 'service', studio: 'service', agency: 'service', office: 'service',
};

/** Catalog business kinds (a place of yours with no lot) by trade. */
const KIND_FAMILY: Partial<Record<BusinessKind, BizFamily>> = {
  bar: 'bar', hoodclub: 'bar', club: 'club', supperclub: 'club', burlesque: 'club', gentsclub: 'club', adulttheater: 'club', afterhours: 'club',
  restaurant: 'restaurant', pizza: 'restaurant', deli: 'restaurant', motel: 'motel', boarding: 'motel', arcade: 'arcade', stand: 'pier',
  laundromat: 'laundromat', towing: 'garage', taxi: 'garage', carlot: 'garage', trucking: 'wholesale', vending: 'wholesale', construction: 'wholesale',
  waste: 'wholesale', lumber: 'wholesale', concrete: 'wholesale', pawn: 'shop', label: 'service', talent: 'service', cleaning: 'service',
};

/** Residential uses: a family's home is never a racket. */
export const HOME_USES = new Set(['house', 'duplex', 'cottage', 'bungalow', 'shorehouse', 'apartments', 'condo', 'storefront', 'mall']);

export function familyOfUse(use: string | undefined): BizFamily | undefined {
  if (!use || HOME_USES.has(use)) return undefined;
  return USE_FAMILY[use] ?? 'shop';
}
export function familyOfKind(kind: BusinessKind): BizFamily | undefined {
  return KIND_FAMILY[kind];
}

/** The front kind a trade would be if you took a piece of it (the loan default, the license). */
export const FAMILY_FRONT: Record<BizFamily, BusinessKind> = {
  bar: 'bar', club: 'club', restaurant: 'restaurant', motel: 'motel', arcade: 'arcade', pier: 'stand', laundromat: 'laundromat',
  shop: 'pawn', garage: 'towing', wholesale: 'trucking', service: 'deli',
};

/** What goes out (or comes in) the back door, by trade. */
export const BACKDOOR_GOODS: Record<BizFamily, string> = {
  bar: 'cases of liquor and cartons of cigarettes that fell off a truck',
  club: 'liquor and champagne by the case, no tax stamps',
  restaurant: 'hijacked meat, olive oil and cheese, cash on the loading dock',
  motel: 'television sets, linens and air conditioners out the service door',
  arcade: 'transistor radios and wristwatches for the prize counter',
  pier: 'cigarettes and soda by the case at the stands',
  laundromat: 'soap, bleach and solvent off a truck; and clothes nobody claimed',
  shop: 'swag off a truck: watches, radios, nylons and small appliances',
  garage: 'tires, batteries and gasoline that never saw an invoice',
  wholesale: 'whole truckloads through {his} dock, and {his} own stock resold out back',
  service: 'cigarettes and nylons from the back room',
};

/* ------------------------------------------------------------------ */
/* The rackets you can run at a place                                  */
/* ------------------------------------------------------------------ */

export type WorkGroup = 'skim' | 'backdoor' | 'exploit' | 'extra';
export type WorkSchemeId =
  | 'skim' | 'backdoor'
  | 'vig' | 'noshow' | 'front' | 'license' | 'fence'
  | 'machines' | 'cardgame' | 'phone' | 'hourly' | 'stash' | 'payouts' | 'supply' | 'concessions' | 'wheel' | 'chop' | 'numbers';

export const GROUP_LABEL: Record<WorkGroup, { title: string; blurb: string }> = {
  skim: { title: 'Skim off the books', blurb: 'A man inside, or the bookkeeper: steady, quiet money, and the IRS is the risk.' },
  backdoor: { title: 'Sell out the back door', blurb: 'Stolen loads sold through {his} stockroom, or {his} own supplies resold out back.' },
  exploit: { title: 'Exploit the owner', blurb: '{His} debts, {his} payroll, {his} license, {his} front door: {his} place works for you.' },
  extra: { title: 'What this kind of place is good for', blurb: 'The rackets that fit this trade and no other.' },
};

export interface WorkSchemeDef {
  id: WorkSchemeId;
  group: WorkGroup;
  icon: string;
  title: string;
  line: string;
  /** The racket it becomes (a business of yours, paying weekly); 'loan' is a shylock loan; 'stash' a rented room. */
  kind: BusinessKind | 'loan' | 'stash';
  /** Only these trades (undefined: every trade). */
  only?: BizFamily[];
  /** Setup: a flat sum plus a share of his weekly gross. */
  cost: number;
  costShare?: number;
  /** The weekly take: a share of his gross plus a flat sum. */
  share: number;
  flat?: number;
  /** One-time heat when it starts. */
  heat: { local?: number; federal?: number };
  /** Weekly local heat the racket runs at. */
  weekly: number;
  /** Needs an in: he pays you, he owes you, or your man is on his payroll. */
  needsIn?: boolean;
  /** How hard it is to get him to go along (added to his willingness, %). */
  coop: number;
  /** The skill that runs it. */
  fit: keyof Attributes;
  /** It works at a place of your own (no owner to ask). */
  mine?: boolean;
  /** Only at a place of your own. */
  mineOnly?: boolean;
  /** Hours the boss spends on the order. */
  hours: number;
}

const W = (d: WorkSchemeDef) => d;

export const WORK_SCHEMES: WorkSchemeDef[] = [
  W({ id: 'skim', group: 'skim', icon: '📒', title: 'Skim off the books', line: 'The bookkeeper keeps two sets of books; a slice of the register comes to you before the tax man sees it.', kind: 'taxdodge', cost: 400, share: 0.13, heat: { federal: 1 }, weekly: 0.05, needsIn: true, coop: -5, fit: 'intrigue', hours: 1 }),
  W({ id: 'backdoor', group: 'backdoor', icon: '📦', title: 'Sell out the back door', line: 'Goods through {his} stockroom.', kind: 'fencing', cost: 300, share: 0.1, flat: 60, heat: { local: 1 }, weekly: 0.2, coop: -10, fit: 'force', mine: true, hours: 1 }),
  W({ id: 'vig', group: 'exploit', icon: '💵', title: 'Lend {him} money at the vig', line: '{He} needs cash (the season, the roof, the horses). Five points a week; if {he} cannot pay, you take a piece of the place.', kind: 'loan', cost: 0, costShare: 6, share: 0, heat: {}, weekly: 0, coop: 0, fit: 'intrigue', hours: 1 }),
  W({ id: 'noshow', group: 'exploit', icon: '🪪', title: 'Your people on {his} payroll', line: 'Two of your men draw a paycheck here and never show up: clean wages on paper, and a man inside.', kind: 'labor', cost: 100, share: 0, flat: 110, heat: {}, weekly: 0.05, coop: -10, fit: 'leadership', hours: 1 }),
  W({ id: 'front', group: 'exploit', icon: '🧺', title: 'Wash money through {his} place', line: 'Dirty cash goes in the register as sales and comes out clean; {he} keeps a fee and asks nothing.', kind: 'washing', cost: 500, share: 0.06, flat: 40, heat: { federal: 1 }, weekly: 0.05, coop: -5, fit: 'intrigue', mine: true, hours: 1 }),
  W({ id: 'license', group: 'exploit', icon: '📜', title: 'Take over {his} liquor license', line: '{His} name stays on the license; the bar answers to you. A quarter of the place, and the liquor board never knows.', kind: 'bar', only: ['bar', 'club', 'restaurant', 'motel'], cost: 1500, share: 0.25, heat: { local: 1 }, weekly: 0.1, needsIn: true, coop: -25, fit: 'intrigue', hours: 2 }),
  W({ id: 'fence', group: 'exploit', icon: '💍', title: 'Make {him} a fence', line: 'Hot watches and rings go across {his} counter and out to honest customers.', kind: 'fencing', only: ['shop', 'garage', 'service', 'arcade'], cost: 300, share: 0.12, flat: 50, heat: { local: 1 }, weekly: 0.3, coop: -15, fit: 'intrigue', mine: true, hours: 1 }),
  // ---- by trade ----
  W({ id: 'machines', group: 'extra', icon: '🎵', title: 'Jukebox & cigarette machines', line: 'Your machines in {his} corner; the coin box is yours, {he} gets a cut and a new jukebox.', kind: 'vending', only: ['bar', 'club', 'restaurant', 'arcade', 'laundromat', 'motel', 'garage'], cost: 600, share: 0.06, flat: 40, heat: {}, weekly: 0.05, coop: 15, fit: 'leadership', mine: true, hours: 1 }),
  W({ id: 'cardgame', group: 'extra', icon: '🃏', title: 'A card game in the back', line: 'A table in the back room, a house cut on every pot, a man at the door.', kind: 'cardgame', only: ['bar', 'club', 'restaurant', 'motel'], cost: 300, share: 0.08, flat: 70, heat: { local: 1 }, weekly: 0.25, coop: 0, fit: 'leadership', mine: true, hours: 1 }),
  W({ id: 'phone', group: 'extra', icon: '☎️', title: 'A phone in the back for the book', line: 'The book takes bets on {his} back-room phone; {he} gets an envelope for the line.', kind: 'bookmaking', only: ['bar', 'restaurant', 'service', 'shop'], cost: 400, share: 0.05, flat: 80, heat: { local: 1 }, weekly: 0.3, coop: 0, fit: 'intrigue', mine: true, hours: 1 }),
  W({ id: 'numbers', group: 'extra', icon: '🔢', title: 'A numbers drop at the counter', line: 'Slips across the counter all day; a runner picks them up at four.', kind: 'numbers', only: ['shop', 'service', 'laundromat', 'restaurant'], cost: 200, share: 0.04, flat: 70, heat: {}, weekly: 0.25, coop: 5, fit: 'leadership', mine: true, hours: 1 }),
  W({ id: 'hourly', group: 'extra', icon: '🛏️', title: 'Rooms by the hour', line: 'Grown-ups who want a room for the afternoon, cash, no names in the register. The night clerk sees nothing.', kind: 'boarding', only: ['motel'], cost: 300, share: 0.12, flat: 40, heat: { local: 1 }, weekly: 0.2, coop: -5, fit: 'leadership', mine: true, hours: 1 }),
  W({ id: 'stash', group: 'extra', icon: '🔒', title: 'A stash room', line: 'A locked room at the back for goods and things you do not keep at home. Rent a week; a raid elsewhere finds less.', kind: 'stash', only: ['motel', 'wholesale', 'garage', 'laundromat'], cost: 400, share: 0, heat: {}, weekly: 0, coop: 5, fit: 'discipline', mine: true, hours: 1 }),
  W({ id: 'payouts', group: 'extra', icon: '🎰', title: 'Pinball & slot payouts', line: 'Free games on the pinball machines are paid in cash at the counter, and a slot machine in back.', kind: 'vending', only: ['arcade', 'bar', 'pier'], cost: 500, share: 0.1, flat: 50, heat: { local: 1 }, weekly: 0.3, coop: 0, fit: 'leadership', mine: true, hours: 1 }),
  W({ id: 'supply', group: 'extra', icon: '🧾', title: 'Linen, garbage & meat supply', line: '{He} buys {his} linen service, {his} garbage hauling and {his} meat from your people, at your price.', kind: 'cleaning', only: ['restaurant', 'motel', 'club', 'bar'], cost: 600, share: 0.1, flat: 30, heat: {}, weekly: 0.05, coop: -10, fit: 'leadership', hours: 1 }),
  W({ id: 'concessions', group: 'extra', icon: '🍦', title: 'Take the concessions', line: 'The stands on {his} pier sell your custard, your soda and your souvenirs.', kind: 'stand', only: ['pier', 'arcade'], cost: 700, share: 0.15, heat: {}, weekly: 0.05, coop: -10, fit: 'leadership', mine: true, hours: 1 }),
  W({ id: 'wheel', group: 'extra', icon: '🎡', title: 'Rig the wheel of chance', line: 'A brake on the wheel and a man who knows when to use it.', kind: 'cardgame', only: ['pier', 'arcade'], cost: 250, share: 0.08, flat: 40, heat: { local: 1 }, weekly: 0.2, coop: -5, fit: 'intrigue', mine: true, hours: 1 }),
  W({ id: 'chop', group: 'extra', icon: '🔧', title: 'Parts out back', line: 'Cars come in whole at night and leave as parts in the morning.', kind: 'chopshop', only: ['garage'], cost: 500, share: 0.1, flat: 90, heat: { local: 2 }, weekly: 0.3, coop: -15, fit: 'force', mine: true, hours: 1 }),
];
export const WORK_BY_ID = Object.fromEntries(WORK_SCHEMES.map((x) => [x.id, x])) as Record<WorkSchemeId, WorkSchemeDef>;

/* ------------------------------------------------------------------ */
/* Protection                                                          */
/* ------------------------------------------------------------------ */

export type AskLevel = 'light' | 'fair' | 'heavy';
/** The envelope as a share of his weekly gross. */
export const ASK_SHARE: Record<AskLevel, number> = { light: 0.07, fair: 0.12, heavy: 0.2 };
export const ASK_LABEL: Record<AskLevel, string> = { light: 'A light touch', fair: 'The going rate', heavy: 'Squeeze {him}' };
/** How much harder a bigger envelope makes the yes (taken off his willingness, %). */
export const ASK_PENALTY: Record<AskLevel, number> = { light: -8, fair: 0, heavy: 18 };

/* ------------------------------------------------------------------ */
/* Putting him out of business                                         */
/* ------------------------------------------------------------------ */

export type PressStep = 'lean' | 'loiter' | 'stink' | 'supplies' | 'inspector' | 'brick' | 'fire' | 'buyout';

export interface PressDef {
  id: PressStep;
  icon: string;
  title: string;
  line: string;
  cost: number;
  /** Odds it goes off without your man being seen, %. */
  odds: number;
  heat: { local?: number; federal?: number };
  /** Fear it puts in him. */
  fear: number;
  /** Damage to his trade (customers, deliveries, a license), 0-100. */
  hurt: number;
  /** Chance the paper prints it, and where. */
  press: number;
  sec: 'front' | 'blotter' | 'business' | 'spout';
  /** How the town takes it. */
  town: string;
  /** How a family that protects him takes it (rival opinion). */
  rival: number;
  /** Chance that family hits back. */
  retaliate: number;
  /** Chance somebody innocent is hurt (off-screen): the town and the parish turn on you. */
  innocents?: number;
  /** Evidence on your man if it goes wrong. */
  evidence: number;
  hours: number;
}

const P = (d: PressDef) => d;

export const PRESS_STEPS: PressDef[] = [
  P({ id: 'lean', icon: '✋', title: 'Lean on {him}', line: 'A visit after closing: a word about {his} {wife}, {his} windows, how quiet the street is at night.', cost: 0, odds: 92, heat: { local: 1 }, fear: 15, hurt: 0, press: 0, sec: 'spout', town: 'Nobody hears about it but {him}.', rival: -4, retaliate: 0.05, evidence: 2, hours: 1 }),
  P({ id: 'loiter', icon: '🚬', title: 'Crew loitering out front', line: 'Three of your men on {his} sidewalk all week, smoking, looking at the customers. The customers go elsewhere.', cost: 60, odds: 90, heat: { local: 1 }, fear: 10, hurt: 15, press: 0.3, sec: 'spout', town: 'Neighbors grumble to Spout Off about "the men on the corner".', rival: -6, retaliate: 0.1, evidence: 2, hours: 0.5 }),
  P({ id: 'stink', icon: '💨', title: 'A stink bomb at the dinner hour', line: 'A full house on a Saturday, and then nobody can stay in the room.', cost: 50, odds: 82, heat: { local: 2 }, fear: 12, hurt: 20, press: 0.6, sec: 'blotter', town: 'A blotter item and a lot of jokes; {his} regulars are less amused.', rival: -6, retaliate: 0.12, evidence: 3, hours: 0.5 }),
  P({ id: 'supplies', icon: '🚚', title: 'Cut {his} supplies', line: 'The beer truck, the linen man, the meat and the ice stop coming. Drivers have families too.', cost: 200, odds: 78, heat: { local: 1 }, fear: 10, hurt: 25, press: 0.35, sec: 'business', town: 'The business page wonders why {his} deliveries stopped.', rival: -8, retaliate: 0.15, evidence: 3, hours: 0.5 }),
  P({ id: 'inspector', icon: '📋', title: 'Send the inspector', line: 'A health and licensing inspector on your payroll finds things: the grease trap, the wiring, the license on the wall.', cost: 300, odds: 72, heat: {}, fear: 8, hurt: 30, press: 0.8, sec: 'blotter', town: 'The town reads that {he} was cited. Some believe it.', rival: -6, retaliate: 0.1, evidence: 4, hours: 0.5 }),
  P({ id: 'brick', icon: '🧱', title: 'A brick through the window', line: 'At three in the morning, when nobody is inside. The message is the glass.', cost: 25, odds: 85, heat: { local: 3 }, fear: 20, hurt: 15, press: 0.9, sec: 'blotter', town: 'The blotter prints it; the block is frightened, and frightened people talk to the police.', rival: -10, retaliate: 0.25, evidence: 5, hours: 0.5 }),
  P({ id: 'fire', icon: '🔥', title: 'A fire at night', line: 'The place burns down after closing. The fire marshal will call it suspicious; so will everybody.', cost: 500, odds: 66, heat: { local: 10, federal: 2 }, fear: 40, hurt: 100, press: 1, sec: 'front', town: 'Front page. The fire marshal, the police and the parish all want to know who did it.', rival: -25, retaliate: 0.6, innocents: 0.12, evidence: 14, hours: 0.5 }),
  P({ id: 'buyout', icon: '🤝', title: 'Buy {him} out cheap', line: 'A fair price for a place in {his} condition: less than it was worth before all this.', cost: 0, odds: 100, heat: {}, fear: 0, hurt: 0, press: 0.5, sec: 'business', town: 'A sale in the business column. People can count.', rival: 0, retaliate: 0, evidence: 0, hours: 2 }),
];
export const PRESS_BY_ID = Object.fromEntries(PRESS_STEPS.map((x) => [x.id, x])) as Record<PressStep, PressDef>;

/** Hours for a work order (timeCost reads this; the boss in person takes longer). */
export function workHours(op: { op: string; step?: string; scheme?: string; who?: string }, playerId?: string): number {
  const self = !!playerId && op.who === playerId;
  if (op.op === 'pitch') return self ? 1.5 : 0.5;
  if (op.op === 'press') return op.step ? (PRESS_BY_ID[op.step as PressStep]?.hours ?? 0.5) * (self ? 2 : 1) : 0.5;
  if (op.op === 'scheme') return op.scheme ? (WORK_BY_ID[op.scheme as WorkSchemeId]?.hours ?? 1) : 1;
  return 0.25;
}

/* ------------------------------------------------------------------ */
/* The owner                                                           */
/* ------------------------------------------------------------------ */

export type OwnerTrait = 'Proud' | 'Scared' | 'Stubborn' | 'Greedy' | 'Churchgoer' | 'Hothead' | 'Family first' | 'Connected' | 'Gambler' | 'Honest';

export const OWNER_TRAITS: OwnerTrait[] = ['Proud', 'Scared', 'Stubborn', 'Greedy', 'Churchgoer', 'Hothead', 'Family first', 'Connected', 'Gambler', 'Honest'];

export const TRAIT_NOTE: Record<OwnerTrait, string> = {
  Proud: '{His} father built the place; {he} will not be told.',
  Scared: '{He} jumps when the door opens.',
  Stubborn: '{He} says no first and thinks later.',
  Greedy: 'Show {him} an angle and {he} leans in.',
  Churchgoer: 'Mass every morning; {he} might tell the monsignor, and the monsignor knows the chief.',
  Hothead: '{He} keeps a bat under the counter.',
  'Family first': 'Three kids and a {wife} who does the books: {he} will not risk them.',
  Connected: '{He} has a cousin in the county, or thinks {he} does.',
  Gambler: '{He} plays the horses and {he} loses.',
  Honest: '{He} pays {his} taxes and {he} thinks the police work for {him}.',
};
