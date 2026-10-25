import { CATALOG } from './catalog';
import { ensureEcon, type RacketState } from './econState';
import { heat, type Ctx } from './ledger';
import { chance, gauss, randInt } from './rng';
import type { Business, BusinessKind, GameState } from './types';
import { dialHeat, dialIncome, dialK, dialRaid } from './racketLife';

/**
 * Deeper rackets. Each racket keeps its own book on the business's econ
 * record and has its own problems:
 *  - bookmaking: the handle (wagers), the hold (can go negative: a bad week),
 *    markers (bets taken on credit) and raids;
 *  - numbers: runners, the bank's cash reserve, and the day a heavily played
 *    number hits;
 *  - loansharking: the book is the shylock loans (loans.ts); tiers widen it;
 *  - cargo theft: dock contacts and loads, worth double with a fence;
 *  - vending: machines placed, and the competition pushing them out.
 * Means stay where the catalog put them (expectedTake), so balance holds;
 * the racket adds the variance and the problems.
 *
 * Every kind with a tree can be upgraded 3–4 steps.
 */

export interface TreeStep {
  name: string;
  blurb: string;
  cost: number;
  /** Added to the income multiplier (0.25 = +25%). */
  income: number;
  /** Added to the heat multiplier (can be negative). */
  heat?: number;
  /** Multiplies the raid odds (bookmaking/numbers). */
  raid?: number;
  /** Racket variables raised by this step. */
  runners?: number;
  placements?: number;
  contacts?: number;
  loans?: number;
  /** Bookmaking: a steadier hold (lays off big bets). */
  steady?: boolean;
  minYear?: number;
}

const T = (name: string, cost: number, income: number, blurb: string, extra: Partial<TreeStep> = {}): TreeStep => ({ name, cost, income, blurb, ...extra });

export const RACKET_TREES: Partial<Record<BusinessKind, TreeStep[]>> = {
  bookmaking: [
    T('A second phone room', 3000, 0.2, 'Two rooms, more phones, a bigger handle.', { heat: 0.1 }),
    T('Lay off big bets to Philadelphia', 4000, 0.1, 'A bad Saturday no longer sinks the book: the hold steadies.', { steady: true }),
    T('A cop on the wire-room pad', 5000, 0.15, 'Somebody calls before the vice squad comes.', { raid: 0.4 }),
    T('Football book with a line from Vegas', 8000, 0.3, 'Every bar on the island bets Sunday.', { heat: 0.15 }),
  ],
  numbers: [
    T('Six more runners', 2500, 0.15, 'More corners, more slips, more pennies.', { runners: 6 }),
    T('A real counting room', 4000, 0.15, 'The bank holds a reserve; one hit no longer breaks it.', { raid: 0.6 }),
    T('Policy wheels in Philadelphia', 7000, 0.3, 'A wheel in South Philly sends its overflow down the shore.', { runners: 6, heat: 0.15 }),
  ],
  loansharking: [
    T('A collector with a reputation', 2500, 0.1, 'Fewer late payers. Room for two more loans.', { loans: 2 }),
    T('Bigger money on the street', 5000, 0.15, 'Contractors and car dealers, not horseplayers. Two more loans.', { loans: 2 }),
    T('A friend at the savings bank', 9000, 0.2, 'Respectable borrowers who cannot go to a bank. Two more loans.', { loans: 2, heat: -0.2 }),
  ],
  cardgame: [
    T('A regular high-stakes night', 2000, 0.2, 'Doctors, contractors and a judge on Thursdays.'),
    T('Craps table in the back', 3500, 0.25, 'Dice are faster than cards.', { heat: 0.15 }),
    T('A protected room over a club', 6000, 0.25, 'Doormen, a buzzer and a back stair.', { raid: 0.5, heat: -0.1 }),
  ],
  vice: [
    T('A discreet answering service', 3000, 0.15, 'Fewer addresses, fewer neighbors who notice.', { heat: -0.15 }),
    T('A lawyer on retainer', 5000, 0.15, 'Arrests end at the desk sergeant.', { heat: -0.15 }),
    T('Out-of-town conventions only', 7000, 0.25, 'Business moves to the convention hotels in AC.', { heat: -0.1 }),
  ],
  stag: [
    T('A projectionist and a print lab', 3000, 0.2, 'Copies made here instead of bought.'),
    T('Routes to the Poconos lodges', 5000, 0.25, 'More private clubs, more cans.', { heat: 0.1 }),
    T('Lawyers and a storefront', 8000, 0.25, 'When the law changes, you already have a company.', { heat: -0.2, minYear: 1968 }),
  ],
  blackmail: [
    T('A desk clerk at every hotel', 3000, 0.2, 'Every register on the island is yours to read.'),
    T('A darkroom and a patient photographer', 5000, 0.25, 'Better pictures, fewer questions.'),
    T('Files in a bank box', 8000, 0.2, 'Insurance. Nobody moves on you while the box exists.', { heat: -0.2 }),
  ],
  jewel: [
    T('A tipster at the society pages', 3000, 0.25, 'Who is at the shore, and who left the safe at home.'),
    T('A safecracker on call', 5000, 0.3, 'Bigger boxes.'),
    T('A buyer in New York', 8000, 0.3, 'Stones recut and sold far away.', { heat: -0.1 }),
  ],
  bankcrew: [
    T('Clean cars and a garage', 4000, 0.2, 'Nothing traceable to the island.'),
    T('An inside man at an armored-car firm', 7000, 0.3, 'Schedules, routes, guards.'),
    T('Out-of-state targets only', 9000, 0.2, 'Never work where you live.', { heat: -0.3 }),
  ],
  fencing: [
    T('A pawn counter as a storefront', 2000, 0.2, 'Some of it sells retail.'),
    T('A warehouse in Rio Grande', 4000, 0.25, 'Whole truckloads.', { heat: 0.1 }),
    T('Buyers in Baltimore and Newark', 7000, 0.3, 'Hot goods leave the state the same night.', { heat: -0.15 }),
  ],
  cargo: [
    T('A checker on the night shift', 2500, 0.15, 'Paperwork that loses a pallet.', { contacts: 1 }),
    T('A friend in the union hall', 4500, 0.2, 'Your men get the good shifts.', { contacts: 1 }),
    T('A trucking yard to move it', 7000, 0.25, 'Loads gone by morning.', { contacts: 2, heat: 0.1 }),
  ],
  vending: [
    T('Twenty more machines', 3000, 0.0, 'Cigarette machines in every motel lobby.', { placements: 20 }),
    T('Jukeboxes with the new records', 4000, 0.15, 'The kids pick your machines.', { placements: 10 }),
    T('An exclusive with the bar owners\' association', 7000, 0.2, 'Nobody else\'s machine goes in.', { placements: 15, heat: 0.15 }),
  ],
  bidrig: [
    T('A friend on the county freeholders', 4000, 0.2, 'You know the bids before they open.'),
    T('The paving rotation', 6000, 0.25, 'Every contractor on the island takes his turn.', { heat: 0.1 }),
    T('State highway contracts', 10000, 0.35, 'The Garden State Parkway needs shoulders.', { heat: 0.1 }),
  ],
  labor: [
    T('Your man as business agent', 3000, 0.2, 'He decides which hotels have labor trouble.'),
    T('The welfare fund\'s investment committee', 6000, 0.3, 'Patient money, very patient.', { heat: 0.2 }),
    T('Labor peace for the casinos', 10000, 0.4, 'When they build in Atlantic City, every crane is yours.', { minYear: 1977 }),
  ],
  club: [
    T('A name band for the summer', 2500, 0.2, 'Lines down Pacific Avenue.'),
    T('A card room upstairs', 4000, 0.2, 'The real money is upstairs.', { heat: 0.15 }),
    T('A Philadelphia headliner', 7000, 0.3, 'Your marquee is in the Bulletin.'),
  ],
  burlesque: [
    T('A better comic and a pit band', 2500, 0.2, 'People come back for the jokes.'),
    T('Headliners from Baltimore', 4500, 0.25, 'Names on the marquee.'),
    T('A respectable supper show', 6000, 0.2, 'Wives come too. The vice squad relaxes.', { heat: -0.2 }),
  ],
  gentsclub: [
    T('A private dining room', 5000, 0.2, 'Judges eat free. You remember who.'),
    T('Members-only nights', 7000, 0.2, 'A membership list worth more than the club.', { heat: -0.1 }),
    T('A second room in Atlantic City', 12000, 0.3, 'Convention money.'),
  ],
  hoodclub: [
    T('New jukebox and a coat of paint', 1500, 0.15, 'Still rough. Less sticky.'),
    T('A doorman who keeps it quiet', 2500, 0.1, 'Fewer fights, fewer patrol cars.', { heat: -0.2 }),
    T('A bigger stage', 4000, 0.25, 'Better acts, more nights.'),
  ],
  supperclub: [
    T('A twelve-piece house band', 4000, 0.2, 'Dancing every night of the season.'),
    T('Sinatra-circuit bookings', 8000, 0.3, 'A name from Vegas, two nights only.'),
    T('Banquets and weddings in the winter', 5000, 0.15, 'The off-season pays the heating oil.'),
  ],
  label: [
    T('A disc jockey who owes you', 2500, 0.2, 'Your records get airplay. Call it promotion.', { heat: 0.05 }),
    T('A pressing plant contract', 5000, 0.25, 'Your own records, pressed cheap.'),
    T('A national distributor', 9000, 0.35, 'The doo-wop act goes national.'),
  ],
  construction: [
    T('A second crew and a crane', 5000, 0.25, 'Two jobs at once; builds go faster.'),
    T('Union men who owe you', 6000, 0.2, 'No strikes on your sites.', { heat: 0.05 }),
    T('Prequalified for state work', 10000, 0.3, 'The Parkway and the bridges.'),
  ],
  concrete: [
    T('Two more mixer trucks', 4000, 0.25, 'Pour two foundations a day.'),
    T('A gravel pit in Rio Grande', 6000, 0.25, 'You own the sand too.'),
    T('The county road contract', 9000, 0.3, 'Every curb in Cape May County.', { heat: 0.05 }),
  ],
  lumber: [
    T('A railroad siding', 3000, 0.2, 'Lumber by the carload, cheaper.'),
    T('A millwork shop', 5000, 0.25, 'Windows and trim made to order.'),
    T('Credit for every contractor on the island', 8000, 0.3, 'They owe you money; they owe you favors.'),
  ],
  trucking: [
    T('Four more rigs', 5000, 0.25, 'Produce runs to Philadelphia.'),
    T('A cold-storage warehouse', 7000, 0.2, 'Somewhere to keep things.'),
    T('Interstate authority', 10000, 0.3, 'Routes to New York and Baltimore.', { heat: 0.05 }),
  ],
  waste: [
    T('Two more packers', 6000, 0.2, 'Every hotel on the Boardwalk.'),
    T('The county landfill contract', 9000, 0.3, 'Everybody else pays you to dump.', { heat: 0.1 }),
    T('Property rights on every stop', 12000, 0.3, 'Nobody else\'s truck stops at your customers.', { heat: 0.15 }),
  ],
};

export function tree(kind: BusinessKind): TreeStep[] {
  return RACKET_TREES[kind] ?? [];
}

/** A business's racket record (read-only view; never mutates). */
export function racketOf(s: GameState, b: Business): RacketState {
  return s.econ?.rackets[b.id] ?? BLANK;
}
const BLANK: RacketState = { tier: 0 };

export function racketMut(s: GameState, b: Business): RacketState {
  const e = ensureEcon(s);
  let r = e.rackets[b.id];
  if (!r) {
    r = { tier: 0 };
    initRacket(r, b.kind);
    e.rackets[b.id] = r;
  }
  return r;
}

function initRacket(r: RacketState, kind: BusinessKind): void {
  if (kind === 'bookmaking') { r.markers = 0; r.handle = 0; }
  if (kind === 'numbers') { r.runners = 6; r.bank = 400; }
  if (kind === 'cargo') r.contacts = 1;
  if (kind === 'vending') { r.placements = 20; r.competition = 10; }
}

/** Steps bought so far. */
export function stepsOf(s: GameState, b: Business): TreeStep[] {
  return tree(b.kind).slice(0, racketOf(s, b).tier);
}

/** The next step on the tree, if any (and if its year has come). */
export function nextStep(s: GameState, b: Business): TreeStep | undefined {
  return tree(b.kind)[racketOf(s, b).tier];
}

/** The tree's income multiplier for a business (1 = as bought). */
export function tierMult(s: GameState, b: Business): number {
  return 1 + stepsOf(s, b).reduce((a, st) => a + st.income, 0);
}

/** Racket-specific multiplier on the expected take: runners, placements, competition, contacts. Pure. */
export function racketMult(s: GameState, b: Business): number {
  const r = racketOf(s, b);
  let m = tierMult(s, b) * dialIncome(s, b);
  if (b.kind === 'numbers') {
    const runners = r.runners ?? 6;
    m *= Math.min(1.4, Math.max(0.5, Math.sqrt(runners / 6)));
  }
  if (b.kind === 'vending') {
    const pl = r.placements ?? 20;
    m *= (pl / 20) ** 0.8 * (1 - (r.competition ?? 10) / 200);
  }
  if (b.kind === 'cargo') m *= 0.8 + 0.2 * Math.min(4, r.contacts ?? 1);
  if (b.kind === 'bidrig' && s.businesses.some((x) => x.owner === 'player' && x.kind === 'construction')) m *= 1.3;
  return m;
}

/** Extra shylock loans the book's upgrades allow. */
export function bookBonus(s: GameState): number {
  let n = 0;
  for (const b of s.businesses) if (b.owner === 'player' && b.kind === 'loansharking') n += stepsOf(s, b).reduce((a, st) => a + (st.loans ?? 0), 0);
  return n;
}

/** Heat multiplier from the tree (applied to the business's stored heat when a step is bought). */
export function treeHeatMult(steps: TreeStep[]): number {
  return Math.max(0.3, 1 + steps.reduce((a, st) => a + (st.heat ?? 0), 0));
}

/** Rebuilds a business's heat after an upgrade. */
export function applyTreeHeat(s: GameState, b: Business): void {
  b.heat = Math.round(CATALOG[b.kind].heat * treeHeatMult(stepsOf(s, b)) * dialHeat(s, b) * 1000) / 1000;
}

const HOT_NUMBERS = ['7-1-1', '3-6-9', '1-2-3', '4-0-4', '7-7-7', '2-1-6', '9-1-1', '5-0-5'];

/**
 * The week of a racket: turns the expected take into what actually happened.
 * Returns the amount (may be negative: the book paid out) and its label.
 * Uses the layer's own dice so the rest of the game's stream is untouched.
 */
export function racketWeek(ctx: Ctx, b: Business, amt: number, label: string): { amt: number; label: string } {
  const s = ctx.s;
  const e = ensureEcon(s);
  const kinds: BusinessKind[] = ['bookmaking', 'numbers', 'cargo', 'vending'];
  if (!kinds.includes(b.kind)) return { amt, label };
  const r = racketMut(s, b);
  const steps = stepsOf(s, b);
  const raidMult = steps.reduce((a, st) => a * (st.raid ?? 1), 1) * dialRaid(s, b);
  if (b.kind === 'bookmaking') {
    // The expected take is a 10% hold on the handle. Some weeks the favorites win.
    const handle = Math.round(amt / 0.1);
    const sd = steps.some((st) => st.steady) || dialK(s, b, 'steady', 0) ? 0.035 : 0.07;
    const hold = Math.max(-0.06, 0.1 + gauss(e) * sd);
    const onCredit = Math.round(handle * 0.015 * dialK(s, b, 'markers'));
    const paidIn = Math.round((r.markers ?? 0) * 0.15);
    r.handle = handle;
    r.lastHold = Math.round(hold * 1000) / 10;
    r.markers = Math.max(0, (r.markers ?? 0) + onCredit - paidIn);
    const net = Math.round(handle * hold) - onCredit + paidIn;
    if (amt > 0 && chance(e, (0.004 + s.heat.local / 100 * 0.012) * raidMult)) {
      b.closedUntil = s.week + 2;
      r.raids = (r.raids ?? 0) + 1;
      heat(ctx, 'local', 2, `Vice squad raid: ${b.name} (phones pulled, chalkboard seized)`, 'heat');
      ctx.log.push(`The vice squad raided ${b.name}. Closed two weeks.`);
      return { amt: 0, label };
    }
    const lbl = hold < 0
      ? `Bad week: ${b.name} paid out (handle $${handle.toLocaleString('en-US')}, hold ${r.lastHold}%)`
      : `Business: ${b.name} (handle $${handle.toLocaleString('en-US')}, hold ${r.lastHold}%${(r.markers ?? 0) > 0 ? `, $${Math.round(r.markers!).toLocaleString('en-US')} in markers` : ''})`;
    return { amt: net, label: lbl };
  }
  if (b.kind === 'numbers') {
    // A tenth of the take tops up the bank's reserve until it holds $1,500 (more with a counting room).
    const target = 1500 * (1 + 0.5 * steps.length) * dialK(s, b, 'reserve');
    const reserve = Math.min(Math.max(0, target - (r.bank ?? 0)), Math.round(amt * 0.1));
    r.bank = (r.bank ?? 0) + reserve;
    let net = Math.round(amt * 1.12) - reserve;
    let lbl = `Business: ${b.name} (${r.runners ?? 6} runners${reserve ? `, $${reserve} to the bank` : ''})`;
    if (amt > 0 && chance(e, 0.03)) {
      const num = HOT_NUMBERS[randInt(e, 0, HOT_NUMBERS.length - 1)];
      const payout = Math.round(500 + amt * 3);
      const fromBank = Math.min(r.bank ?? 0, payout);
      r.bank = (r.bank ?? 0) - fromBank;
      r.lastHit = `${num} (wk ${s.week})`;
      net -= payout - fromBank;
      lbl = `Hit number: ${num} came out and half the island had it — ${b.name} paid $${payout.toLocaleString('en-US')}${fromBank < payout ? ' (the bank ran dry)' : ' from the bank'}`;
    }
    if (amt > 0 && chance(e, 0.01 * raidMult)) {
      r.runners = Math.max(2, (r.runners ?? 6) - 2);
      ctx.log.push(`Two of ${b.name}'s runners were picked up with slips in their pockets.`);
    }
    return { amt: net, label: lbl };
  }
  if (b.kind === 'cargo') {
    if (amt <= 0) return { amt, label };
    const fence = s.businesses.some((x) => x.owner === 'player' && (x.kind === 'fencing' || x.kind === 'pawn'));
    const p = Math.min(0.85, 0.3 + 0.1 * (r.contacts ?? 1));
    if (!chance(e, p)) return { amt: 0, label };
    const load = Math.round((amt / p) * (0.6 + 0.8 * (randInt(e, 0, 100) / 100)) * (fence ? 1.25 : 0.7));
    const goods = ['a load of televisions', 'forty cases of Scotch', 'a trailer of cigarettes', 'a pallet of transistor radios', 'a container of shoes', 'a load of frozen shrimp'];
    return { amt: load, label: `Load: ${b.name} lost ${goods[randInt(e, 0, goods.length - 1)]} off a ship${fence ? '' : ' (no fence — sold cheap)'}` };
  }
  // vending
  if (s.date.d <= 7 && chance(e, 0.5)) {
    const rivalPush = s.rivals.some((x) => x.kind === 'mob' && (s.districts.find((d) => d.id === b.districtId)?.influence[x.id] ?? 0) > 10);
    r.competition = Math.min(80, (r.competition ?? 10) + randInt(e, 0, rivalPush ? 6 : 3));
  }
  return { amt, label: `Business: ${b.name} (${r.placements ?? 20} machines${(r.competition ?? 0) >= 25 ? `, competition ${r.competition}%` : ''})` };
}

/** Collecting: lean on welshers (bookmaking markers) or the competition (vending). Returns [money, heat, text]. */
export function collectPreview(s: GameState, b: Business): { amount: number; heat: number; text: string; why?: string } {
  const r = racketOf(s, b);
  if (b.kind === 'bookmaking') {
    const m = Math.round((r.markers ?? 0) * 0.5);
    return { amount: m, heat: 1, text: `Lean on the welshers: collect half the markers (${fmt(r.markers ?? 0)} out)`, why: m < 100 ? 'Not enough on the markers to chase' : undefined };
  }
  if (b.kind === 'vending') return { amount: 0, heat: 2, text: 'Muscle the competition\'s machines out of the bars', why: (r.competition ?? 0) < 15 ? 'No competition worth the trouble' : undefined };
  if (b.kind === 'numbers') return { amount: 0, heat: 1, text: 'Put new runners on the corners (+2)', why: (r.runners ?? 6) >= 18 ? 'Every corner is covered' : s.money < 300 ? 'Needs $300' : undefined };
  if (b.kind === 'cargo') return { amount: 0, heat: 1, text: 'Cultivate a new friend on the docks (+1 contact)', why: (r.contacts ?? 1) >= 5 ? 'You know everybody on the docks' : s.money < 600 ? 'Needs $600' : undefined };
  return { amount: 0, heat: 0, text: '', why: 'Nothing to collect' };
}

export function commitCollect(ctx: Ctx, b: Business): void {
  const s = ctx.s;
  const r = racketMut(s, b);
  if (b.kind === 'bookmaking') r.markers = Math.round((r.markers ?? 0) * 0.3);
  if (b.kind === 'vending') r.competition = Math.max(0, (r.competition ?? 0) - 20);
  if (b.kind === 'numbers') r.runners = (r.runners ?? 6) + 2;
  if (b.kind === 'cargo') r.contacts = (r.contacts ?? 1) + 1;
}

/** Up-front cost of a collect order (numbers runners, dock contacts). */
export function collectCost(b: Business): number {
  return b.kind === 'numbers' ? 300 : b.kind === 'cargo' ? 600 : 0;
}

export function racketSummary(s: GameState, b: Business): string | undefined {
  const r = s.econ?.rackets[b.id];
  if (!r) return undefined;
  switch (b.kind) {
    case 'bookmaking': return `handle ${fmt(r.handle ?? 0)}/wk · hold ${r.lastHold ?? 10}% · markers ${fmt(r.markers ?? 0)}${r.raids ? ` · raided ${r.raids}×` : ''}`;
    case 'numbers': return `${r.runners ?? 6} runners · bank ${fmt(r.bank ?? 0)}${r.lastHit ? ` · last hit ${r.lastHit}` : ''}`;
    case 'cargo': return `${r.contacts ?? 1} dock contact${(r.contacts ?? 1) > 1 ? 's' : ''}`;
    case 'vending': return `${r.placements ?? 20} machines · competition ${r.competition ?? 10}%`;
    default: return undefined;
  }
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
