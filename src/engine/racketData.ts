import type { SceneCtx } from './sceneVariants';
import type { Dial, RacketOutcome } from './racketState';
import type { Business, BusinessKind, Character, Choice, Effect, GameState } from './types';

/**
 * The living rackets, as data: for every racket, what it is in one line,
 * what it takes to start, who is good at running it, its standing decisions
 * (dials) and the situations it throws up (each told several ways, so the
 * story director never repeats the same text).
 *
 * Everything here is abstract on purpose: money, heat, odds and consequences,
 * never real-world method. Violence is implied at most; nobody is coerced.
 */

export type Fit = 'business' | 'force' | 'intrigue' | 'diplomacy' | 'discipline';

export interface RacketInfo {
  kind: BusinessKind;
  /** One plain line: what it is. */
  line: string;
  /** How it makes money, in one line. */
  pays: string;
  /** The attribute that makes a good man to run it. */
  fit: Fit;
  /** Respect the house needs before the people involved will deal with you. */
  respect?: number;
  /** Philadelphia's leader must think at least this well of you (the Table's blessing). */
  blessing?: number;
  /** What goes well with it (another kind you own). */
  pairs?: BusinessKind[];
  /** A scale for situation money when the catalog base is not the real take (crews that work by the score). */
  scale?: number;
  dials: Dial[];
  sits: Situation[];
}

/** What a situation can read: the racket, the man running it, the money it moves. */
export interface SitCtx {
  s: GameState;
  b: Business;
  /** A week's good take: the money scale of this situation. */
  t: number;
  runner?: Character;
  capo?: Character;
  dial: (id: string) => string;
  v: (key: string, d?: number) => number;
  owns: (k: BusinessKind) => boolean;
}

export interface SitScene {
  when?: (c: SceneCtx, x: SitCtx) => boolean;
  title: (c: SceneCtx, x: SitCtx) => string;
  text: (c: SceneCtx, x: SitCtx) => string;
}

export interface Situation {
  id: string;
  /** May it happen now? */
  when?: (x: SitCtx) => boolean;
  weight?: number;
  scenes: SitScene[];
  choices: (x: SitCtx) => Choice[];
  /** The answer if nobody picks one. */
  def: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const r50 = (n: number) => Math.round(n / 50) * 50;
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const nm = (c?: Character) => (c ? (c.nickname ? `${c.firstName} "${c.nickname}"` : c.firstName) : 'your man');
const first = (c?: Character) => c?.firstName ?? 'your man';
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** A gamble with its odds, both sides shown as chips before the choice. */
export function roll(x: SitCtx, p: number, what: string, win: RacketOutcome, lose: RacketOutcome): Effect {
  return { type: 'econ', op: { op: 'racket', cmd: 'roll', bizId: x.b.id, p: Math.round(Math.max(0.05, Math.min(0.95, p)) * 100) / 100, what, win, lose }, label: `${x.b.name}: ${what}` };
}
const boost = (x: SitCtx, pct: number, weeks: number): Effect => ({ type: 'econ', op: { op: 'racket', cmd: 'boost', bizId: x.b.id, pct, weeks }, label: x.b.name });
const vv = (x: SitCtx, key: string, amount: number): Effect => ({ type: 'econ', op: { op: 'racket', cmd: 'var', bizId: x.b.id, key, amount }, label: x.b.name });
const setDial = (x: SitCtx, dial: string, opt: string): Effect => ({ type: 'econ', op: { op: 'racket', cmd: 'dial', bizId: x.b.id, dial, opt }, label: x.b.name });
const cash = (x: SitCtx, n: number): Effect => ({ type: 'money', amount: r50(n), label: x.b.name });
const heatE = (x: SitCtx, n: number, bar: 'local' | 'federal' = 'local'): Effect => ({ type: 'heat', bar, amount: n, label: x.b.name });
const philly = (x: SitCtx, n: number, reason: string): Effect => ({ type: 'rivalOpinion', rival: 'philly', amount: n, reason, label: x.b.name });
const ch = (id: string, label: string, because: string, effects: Effect[], detail?: string, disabledReason?: string): Choice => ({ id, label, because, effects, detail, disabledReason });

/** The pad: who on the force is paid to look the other way (every gambling racket has one). */
const PAD: Dial = {
  id: 'pad', name: 'The pad', ask: 'Who on the force is paid to look the other way?', def: 'none',
  opts: [
    { id: 'none', label: 'Nobody special', blurb: 'The beat cops\' envelopes, nothing more.' },
    { id: 'precinct', label: 'The precinct sergeant', blurb: 'A call before the vice squad comes.', weekly: 40, raid: 0.4, heat: -0.2 },
    { id: 'captain', label: 'The captain himself', blurb: 'Raids happen to other people.', weekly: 100, raid: 0.15, heat: -0.4 },
  ],
};

/** The pace of a crew that works by the score. */
const PACE: Dial = {
  id: 'pace', name: 'The pace', ask: 'How often does the crew go out?', def: 'steady',
  opts: [
    { id: 'careful', label: 'Only the sure ones', blurb: 'Fewer scores, cleaner ones.', heat: -0.4, k: { pace: 0.6, safe: 0.1 } },
    { id: 'steady', label: 'Steady', blurb: 'A score when one is there.', k: { pace: 1 } },
    { id: 'busy', label: 'Every chance they get', blurb: 'More scores, more men in the newspapers.', heat: 0.4, risk: 'more arrests', k: { pace: 1.4, safe: -0.1 } },
  ],
};

/* ------------------------------------------------------------------ */
/* The rackets                                                         */
/* ------------------------------------------------------------------ */

export const RACKETS: Partial<Record<BusinessKind, RacketInfo>> = {
  numbers: {
    kind: 'numbers', fit: 'business',
    line: 'The working man\'s lottery: a penny a play, a winning number every day off the racetrack handle.',
    pays: 'Steady pennies all year; a heavily played number that hits can empty the bank.',
    dials: [
      {
        id: 'reserve', name: 'The bank\'s reserve', ask: 'How much of the take sits in the bank against a big hit?', def: 'normal',
        opts: [
          { id: 'thin', label: 'Run it thin', blurb: 'More in your pocket every week.', income: 0.08, risk: 'a big hit can break the bank', k: { reserve: 0.4 } },
          { id: 'normal', label: 'The usual reserve', blurb: 'A tenth of the take until the bank is comfortable.', k: { reserve: 1 } },
          { id: 'deep', label: 'A deep reserve', blurb: 'The bank pays any hit without you.', income: -0.06, k: { reserve: 2 } },
        ],
      },
      {
        id: 'payout', name: 'What a hit pays', ask: 'What does a winner get for his penny?', def: 'full',
        opts: [
          { id: 'cut', label: 'Cut numbers', blurb: 'Pay less on the popular numbers.', income: 0.1, risk: 'players drift to other banks', k: { players: -1 } },
          { id: 'full', label: 'The going rate', blurb: 'What every bank on the island pays.' },
          { id: 'sweet', label: 'Pay a little better', blurb: 'The best price on the island; the runners bring players.', income: -0.06, k: { players: 1 } },
        ],
      },
      PAD,
    ],
    sits: [
      {
        id: 'heavy', def: 'layoff', weight: 3,
        scenes: [
          { title: (_c, x) => `Everybody is playing ${hot(x)}`, text: (c, x) => `${nm(x.runner)} comes in with the slips in a paper bag. Half the island has ${hot(x)} today: ${hotWhy(c, x)}. If it comes out, ${x.b.name} owes ${$(x.t * 6)}. The bank holds ${$(x.v('bank', 400))}.` },
          { title: () => 'A number with a crowd on it', text: (c, x) => `The cigar store on Pacific has sold more slips on ${hot(x)} than on anything since the war. ${first(x.runner)} wants to know what you want done before the race results come in, ${c.weather}.` },
          { when: (c) => c.summer, title: () => 'The boardwalk has a hunch', text: (_c, x) => `It started with a lifeguard and spread down the boards by lunch: ${hot(x)} is coming out. Every stand owner has a dime on it. ${first(x.runner)} says the bank cannot carry it alone.` },
        ],
        choices: (x) => [
          ch('carry', 'Carry it yourself', `carried the action on ${hot(x)}`, [roll(x, 0.85, `the action on ${hot(x)}`, { money: r50(x.t * 1.4), text: `${hot(x)} did not come out. The bank keeps every penny.` }, { money: -r50(x.t * 5), respect: 1, text: `${hot(x)} came out. You paid every winner, and the island noticed.` })], 'The bank keeps everything if it misses.'),
          ch('layoff', 'Lay it off to a Philadelphia bank', `laid off ${hot(x)} to Philadelphia`, [cash(x, -x.t * 0.3), philly(x, 3, 'Sent us his action')], 'Costs a fee, risks nothing, and Philadelphia likes the business.'),
          ch('cut', 'Cut the price on it', `cut the odds on ${hot(x)}`, [cash(x, x.t * 0.4), vv(x, 'runners', -1)], 'The players grumble; one runner takes his corner elsewhere.'),
        ],
      },
      {
        id: 'sergeant', def: 'stall', weight: 2, when: (x) => x.dial('pad') === 'none',
        scenes: [
          { title: () => 'A new sergeant on the beat', text: (_c, x) => `There is a new sergeant at the precinct and he has noticed ${x.b.name}. He told ${first(x.runner)} he likes his coffee with an envelope.` },
          { title: () => 'Coffee with the law', text: (c) => `A detective you have never met sits down across from you at the Admiral, ${c.weather}. He does not threaten. He says the vice squad is planning its spring and he could use a reason to plan it somewhere else.` },
          { title: () => 'The precinct changes hands', text: (_c, x) => `The old captain retired to Florida and the new one is still learning whose envelopes are whose. ${nm(x.runner)} says somebody had better teach him before he learns it from the newspapers.` },
        ],
        choices: (x) => [
          ch('pay', 'Put him on the pad', 'put the new sergeant on the pad', [setDial(x, 'pad', 'precinct')], 'A weekly envelope; raids get rare.'),
          ch('stall', 'Stall him', 'stalled the new sergeant', [roll(x, 0.6, 'stalling the sergeant', { text: 'He lost interest.' }, { close: 2, heat: 3, text: 'He raided the bank to make a point.' })]),
          ch('favor', 'Have a councilman move him', 'had the sergeant transferred', [{ type: 'favor', amount: -1, label: x.b.name }], 'A favor spent; he walks a beat in the Crest.', x.s.favors < 1 ? 'No favors to call in' : undefined),
        ],
      },
    ],
  },

  bookmaking: {
    kind: 'bookmaking', fit: 'business',
    line: 'A wire room: phones, a race wire and a chalkboard. Horses all year, football in the fall.',
    pays: 'A tenth of the handle on an average week; a bad Saturday can pay out.',
    dials: [
      {
        id: 'layoff', name: 'The big bets', ask: 'Do you carry the big bets or lay them off to Philadelphia?', def: 'carry',
        opts: [
          { id: 'carry', label: 'Carry them', blurb: 'Keep the whole hold; some Saturdays hurt.', risk: 'bad weeks' },
          { id: 'layoff', label: 'Lay them off to Philadelphia', blurb: 'A steadier hold, a fee to the bigger book, and friends in Philadelphia.', income: -0.07, philly: 1, k: { steady: 1 } },
        ],
      },
      {
        id: 'credit', name: 'Credit', ask: 'Do bettors play on credit?', def: 'markers',
        opts: [
          { id: 'cash', label: 'Cash only', blurb: 'Fewer bettors, nobody owes you.', income: -0.1, k: { markers: 0 } },
          { id: 'markers', label: 'Markers for the regulars', blurb: 'The usual: the regulars play on their word.', k: { markers: 1 } },
          { id: 'easy', label: 'Easy credit', blurb: 'Everybody plays. Not everybody pays.', income: 0.12, heat: 0.1, risk: 'markers pile up', k: { markers: 2.5 } },
        ],
      },
      PAD,
    ],
    sits: [
      {
        id: 'fix', def: 'board', weight: 2,
        scenes: [
          { title: () => 'A rumor about Saturday', text: (_c, x) => `${nm(x.runner)} heard it from a trainer at the Atlantic City track: ${fixWhat(x)} is not on the level. The money is already moving. You can ride it, take it off the board, or tell Philadelphia.` },
          { title: () => 'The smart money', text: (c, x) => `${cap(c.weather)}, and the phones in ${x.b.name} will not stop: everybody wants the same side of ${fixWhat(x)}. Somebody knows something.` },
          { title: () => 'A tip with a smell to it', text: (_c, x) => `A bettor who never wins bet ${$(x.t * 2)} on ${fixWhat(x)} and smiled when he did it. ${first(x.runner)} thinks somebody got to somebody.` },
        ],
        choices: (x) => [
          ch('ride', 'Bet with it', 'rode a fixed-game rumor', [roll(x, 0.55, 'riding the rumor', { money: r50(x.t * 3), text: 'The fix was in. The book cleaned up.' }, { money: -r50(x.t * 2), evidence: 3, text: 'The fix fell apart and the newspapers called it point-shaving.' })], 'If it is real, a big week; if not, a loss and questions.'),
          ch('board', 'Take it off the board', 'took the game off the board', [cash(x, -x.t * 0.3)], 'Lose a little action, keep your name clean.'),
          ch('tell', 'Tell Philadelphia', 'told Philadelphia about a fix', [cash(x, -x.t * 0.2), philly(x, 6, 'Warned us about a fix')]),
        ],
      },
      {
        id: 'whale', def: 'half', weight: 2,
        scenes: [
          { title: () => 'A big bettor on the phone', text: (_c, x) => `A car dealer from Vineland wants ${$(x.t * 3)} on the Eagles, on credit. He is good for it, mostly. ${first(x.runner)} is holding the phone.` },
          { title: () => 'A man with a roll', text: (c, x) => `He came in out of ${c.weather} with a roll of fifties and wants all of it on one race: ${$(x.t * 3)}. ${x.b.name} has never taken a bet that size.` },
          { title: () => 'The doctor\'s system', text: (_c, x) => `A surgeon from Cape May Court House says he has a system. He wants to bet ${$(x.t * 3)} with it. Systems lose; sometimes they lose slowly.` },
        ],
        choices: (x) => [
          ch('all', 'Take the whole bet', 'took a whale\'s bet', [roll(x, 0.55, 'the big bet', { money: r50(x.t * 2.5), text: 'His horse ran fourth.' }, { money: -r50(x.t * 2.5), text: 'His horse came in. The book paid.' })]),
          ch('half', 'Take half, lay off the rest', 'laid off half a big bet', [roll(x, 0.55, 'half the big bet', { money: r50(x.t * 1.1), text: 'He lost; the book kept its half.' }, { money: -r50(x.t * 1.2), text: 'He won; the book paid its half.' })], 'Half the risk, half the win.'),
          ch('no', 'Turn him down', 'turned down a big bet', [{ type: 'respect', amount: -1, label: x.b.name }], 'A small book for small men, people say.'),
        ],
      },
      {
        id: 'football', def: 'board', weight: 3, when: (x) => x.s.date.m >= 8 && x.s.date.m <= 9 && !x.b.id.startsWith('zone'),
        scenes: [
          { title: () => 'Football season', text: (_c, x) => `Labor Day is coming and every bar on the island wants a football line. ${nm(x.runner)} says a Sunday board would double the phones. It would also double the attention.` },
          { title: () => 'A line from Las Vegas', text: (_c, x) => `A man in Philadelphia can get ${x.b.name} the Las Vegas line every Thursday, for a price. The college games, the pros, the parlay cards.` },
          { title: () => 'The parlay cards', text: (c) => `${cap(c.weather)}. A printer in Rio Grande can run ten thousand parlay cards a week. Every tap room on the island would carry them.` },
        ],
        choices: (x) => [
          ch('board', 'Put up a football board', 'opened a football board', [cash(x, -x.t * 0.6), boost(x, 30, 14), heatE(x, 2)], 'A bigger handle all fall.'),
          ch('cards', 'Parlay cards in every bar', 'put parlay cards in every bar', [cash(x, -x.t), boost(x, 45, 14), heatE(x, 4), { type: 'evidence', charId: x.s.playerId, amount: 1, label: x.b.name }], 'The most money; the most paper with your name near it.'),
          ch('horses', 'Stay with the horses', 'kept the book on the horses', []),
        ],
      },
    ],
  },

  loansharking: {
    kind: 'loansharking', fit: 'force', scale: 300,
    line: 'The shylock book: money on the street at points a week, for people a bank will not see.',
    pays: 'Vig every week on each loan; the principal comes back, or a story begins.',
    dials: [
      {
        id: 'clients', name: 'Who you lend to', ask: 'Whose money troubles do you buy?', def: 'merchants',
        opts: [
          { id: 'horseplayers', label: 'Horseplayers', blurb: 'They pay high and they pay late.', risk: 'more defaults', k: { vig: 1.2, risk: 2 } },
          { id: 'merchants', label: 'Merchants', blurb: 'Bar owners and stand men between seasons.', k: { vig: 1, risk: 1 } },
          { id: 'contractors', label: 'Contractors', blurb: 'Big, slow, respectable; they owe you favors too.', k: { vig: 0.9, risk: 0.6, favor: 1 } },
        ],
      },
      {
        id: 'vig', name: 'The points', ask: 'How many points a week?', def: 'five',
        opts: [
          { id: 'three', label: 'Three points', blurb: 'People come to you first.', heat: -0.2, k: { vig: 0.6, risk: 0.7 } },
          { id: 'five', label: 'Five points', blurb: 'The going rate.', k: { vig: 1, risk: 1 } },
          { id: 'seven', label: 'Seven points', blurb: 'Fat vig, thin patience.', heat: 0.3, risk: 'more defaults', k: { vig: 1.4, risk: 1.3 } },
        ],
      },
      {
        id: 'collect', name: 'Collections', ask: 'How hard does the collector lean when a payment is late?', def: 'firm',
        opts: [
          { id: 'patient', label: 'Patient', blurb: 'A late week is a late week.', heat: -0.3, k: { collect: 1.2 } },
          { id: 'firm', label: 'Firm', blurb: 'A visit, a reminder, a deadline.', k: { collect: 1 } },
          { id: 'hard', label: 'No excuses', blurb: 'Nobody is late twice. People talk about it.', heat: 0.4, risk: 'complaints to the police', k: { collect: 0.7 } },
        ],
      },
    ],
    sits: [
      {
        id: 'default', def: 'time', weight: 3,
        scenes: [
          { title: () => 'A borrower who cannot pay', text: (_c, x) => `${borrower(x)} sat in ${nm(x.runner)}'s car for an hour and cried. He owes the book ${$(x.t * 4)}. He has ${collateral(x)} and two kids.` },
          { title: () => 'The book has a problem', text: (c, x) => `${cap(c.weather)}. ${borrower(x)} is three weeks behind. He has ${collateral(x)}, and a brother-in-law who is a cop.` },
          { title: () => 'Collateral', text: (_c, x) => `${first(x.runner)} says ${borrower(x)} is not going to pay, not this month, maybe not this year. What he has is ${collateral(x)}.` },
        ],
        choices: (x) => [
          ch('take', 'Take the collateral', 'took a borrower\'s collateral', [cash(x, x.t * 2.5), heatE(x, 2), { type: 'respect', amount: 1, label: x.b.name }], 'The debt is paid in property. The island hears about it.'),
          ch('time', 'Give him time', 'gave a borrower time', [roll(x, 0.7, 'his promise to pay', { money: r50(x.t * 4.5), text: 'He paid, with the points, every week after.' }, { money: -r50(x.t * 1.5), text: 'He left for Florida in the night.' })]),
          ch('forgive', 'Forgive it and keep him', 'forgave a borrower his debt', [cash(x, -x.t), { type: 'favor', amount: 1, label: x.b.name }], 'He owes you something better than money.'),
        ],
      },
      {
        id: 'bigloan', def: 'pass', weight: 2,
        scenes: [
          { title: () => 'A contractor needs money', text: (_c, x) => `A builder from Cape May won a city job and cannot make payroll until the city pays him. He wants ${$(x.t * 8)} for ten weeks.` },
          { title: () => 'A motel man\'s roof', text: (_c, x) => `A storm off the ocean took the roof off a motel in the Crest. The owner needs ${$(x.t * 8)} before Memorial Day and the bank laughed at him.` },
          { title: () => 'Respectable money', text: (_c, x) => `A dentist with a big house and a bigger problem at the track wants ${$(x.t * 8)}, quietly. He has never borrowed from anyone like you.` },
        ],
        choices: (x) => [
          ch('lend', 'Lend it', 'made a big shylock loan', [roll(x, 0.8, 'the big loan', { money: r50(x.t * 2.6), favor: 1, text: 'He paid it back with the points, and owes you a favor.' }, { money: -r50(x.t * 6), text: 'He went bankrupt; the book got pennies.' })], 'A big win if he pays.'),
          ch('pass', 'Pass', 'passed on a big loan', []),
        ],
      },
    ],
  },

  cardgame: {
    kind: 'cardgame', fit: 'diplomacy', pairs: ['club', 'supperclub', 'motel'],
    line: 'A floating high-stakes game: doctors, contractors and a judge, the house takes a cut of every pot.',
    pays: 'The rake on every pot; the high-roller nights make the month.',
    dials: [
      {
        id: 'rake', name: 'The house cut', ask: 'How much of every pot does the house take?', def: 'house',
        opts: [
          { id: 'light', label: 'A light rake', blurb: 'The regulars never leave.', income: -0.1, heat: -0.1 },
          { id: 'house', label: 'The usual', blurb: 'Five percent and the sandwiches.' },
          { id: 'heavy', label: 'A heavy rake', blurb: 'More per pot, fewer happy players.', income: 0.15, heat: 0.1 },
        ],
      },
      {
        id: 'mechanic', name: 'The dealer', ask: 'Is the game straight?', def: 'straight',
        opts: [
          { id: 'straight', label: 'A straight game', blurb: 'The house wins by the rake alone.' },
          { id: 'mechanic', label: 'A mechanic deals', blurb: 'A dealer with clever hands, on the big nights.', income: 0.2, risk: 'if he is caught, the game is finished for a while', k: { caught: 0.03 } },
        ],
      },
      PAD,
    ],
    sits: [
      {
        id: 'highroller', def: 'host', weight: 3,
        scenes: [
          { title: () => 'A high roller from Philadelphia', text: (_c, x) => `A man who owns half of a meatpacking plant wants a private game, no limit, and he wants it at ${x.b.name}. He brings his own friends and his own money: a lot of it.` },
          { title: () => 'Thursday night, no limit', text: (c, x) => `${cap(c.weather)}. A shipping man from Baltimore is in town for the week and has heard about the game. ${first(x.runner)} says he plays like a man who wants to lose.` },
          { title: () => 'The judge\'s friends', text: () => 'The judge who plays Thursdays wants to bring three friends from the bar association and play for real money, just once. Lawyers who lose remember it. So do lawyers who win.' },
        ],
        choices: (x) => [
          ch('host', 'Host it straight', 'hosted a high-stakes game', [roll(x, 0.6, 'the high-stakes night', { money: r50(x.t * 3), text: 'The house took a fortune in rake.' }, { money: -r50(x.t * 1.5), text: 'The house had to cover a pot it could not afford.' })]),
          ch('rig', 'Host it with the mechanic', 'had the mechanic deal a high-stakes game', [roll(x, 0.85, 'the mechanic\'s night', { money: r50(x.t * 4), text: 'The mechanic was perfect.' }, { respect: -4, philly: -5, close: 3, text: 'Somebody saw the mechanic\'s hands. Word reached Philadelphia.' })], 'Bigger money; if he is caught, a scandal.', x.dial('mechanic') !== 'mechanic' ? 'You have no mechanic dealing (set "The dealer")' : undefined),
          ch('decline', 'Too rich for the room', 'turned down a high-roller game', []),
        ],
      },
      {
        id: 'sore', def: 'winback', weight: 2,
        scenes: [
          { title: () => 'A sore loser', text: (_c, x) => `A doctor lost his Cadillac at ${x.b.name} and now he says the game is crooked. He is talking about calling the state police.` },
          { title: () => 'A man with a grievance', text: (c) => `${cap(c.weather)}. A contractor who lost his winter at your table has been telling every bar on Pacific that the cards were marked.` },
          { title: () => 'Somebody\'s wife', text: (_c, x) => `The wife of a man who lost the house money at ${x.b.name} came to the club and made a scene. She wants it back. People were listening.` },
        ],
        choices: (x) => [
          ch('winback', 'Let him win some back', 'let a sore loser win some back', [cash(x, -x.t * 0.4)], 'He calms down.'),
          ch('lean', 'Have a word with him', 'leaned on a sore loser', [heatE(x, 2), { type: 'evidence', charId: x.s.playerId, amount: 1, label: x.b.name }], 'He stops talking. Somebody remembers why.'),
          ch('marker', 'Give him a marker on the house', 'gave a sore loser a marker', [cash(x, -x.t * 0.2), { type: 'favor', amount: 1, label: x.b.name }], 'He owes you now.'),
        ],
      },
    ],
  },

  fencing: {
    kind: 'fencing', fit: 'business', pairs: ['jewel', 'cargo', 'pawn'],
    line: 'A fence: buys what fell off a truck or out of a cottage safe and sells it far away.',
    pays: 'The margin on stolen goods; doubles what the jewel crew and the docks are worth.',
    dials: [
      {
        id: 'goods', name: 'What you take in', ask: 'How hot can the goods be?', def: 'anything',
        opts: [
          { id: 'cold', label: 'Cold goods only', blurb: 'Nothing from this county, nothing from this month.', income: -0.15, heat: -0.3 },
          { id: 'anything', label: 'Whatever comes in', blurb: 'The usual mix.' },
          { id: 'hot', label: 'Hot loads too', blurb: 'Fresh goods at fire-sale prices.', income: 0.2, heat: 0.3, risk: 'stings' },
        ],
      },
      {
        id: 'buyers', name: 'Who buys', ask: 'Where does it go?', def: 'local',
        opts: [
          { id: 'local', label: 'Local buyers', blurb: 'Pawn shops and jewelers up the shore.' },
          { id: 'philly', label: 'Philadelphia buyers', blurb: 'Out of the county the same night; Philadelphia takes a piece.', income: -0.08, heat: -0.25, philly: 1 },
        ],
      },
    ],
    sits: [
      {
        id: 'hotload', def: 'pass', weight: 3,
        scenes: [
          { title: () => 'A truckload, cheap', text: (_c, x) => `Two men from out of town have a trailer of ${loot(x)} and want ${$(x.t)} for all of it, tonight. ${first(x.runner)} has never seen them before.` },
          { title: () => 'A bargain with no questions', text: (c, x) => `${cap(c.weather)}. A van is parked behind ${x.b.name} with ${loot(x)} in the back. The driver wants cash and says the paperwork is fine. It is not.` },
          { title: () => 'Friends of a friend', text: (_c, x) => `A cousin of somebody on the docks has ${loot(x)} and needs it gone. ${nm(x.runner)} says the price is too good, which is what worries him.` },
        ],
        choices: (x) => [
          ch('buy', 'Buy it', 'bought a hot load', [cash(x, -x.t), roll(x, x.dial('goods') === 'cold' ? 0.85 : 0.72, 'the load', { money: r50(x.t * 2.7), text: 'It sold in a week, far away.' }, { evidence: 4, close: 3, heat: 3, text: 'It was a sting. The state police padlocked the place.' })], 'A fat margin, if the sellers are what they say.'),
          ch('pass', 'Pass', 'passed on a hot load', []),
        ],
      },
      {
        id: 'jeweler', def: 'deal', weight: 2,
        scenes: [
          { title: () => 'A buyer from Jewelers\' Row', text: () => 'A jeweler from Sansom Street in Philadelphia wants first look at everything the fence takes in. He pays better than anyone on the shore. He also knows people in the Philadelphia family.' },
          { title: () => 'A standing order', text: (c, x) => `${cap(c.weather)}. A man who supplies department stores in Baltimore wants a standing order from ${x.b.name}: televisions, radios, anything in a box.` },
          { title: () => 'Out of town money', text: () => 'A buyer from Newark says he can take whatever you have, every week, and nobody in this state will ever see it again.' },
        ],
        choices: (x) => [
          ch('deal', 'Give him first look', 'gave an outside buyer first look', [boost(x, 20, 10), philly(x, 2, 'Business with our people')]),
          ch('local', 'Keep it local', 'kept the fence local', []),
        ],
      },
    ],
  },

  cargo: {
    kind: 'cargo', fit: 'force', pairs: ['fencing', 'trucking', 'labor'],
    line: 'Friends on the docks: a load goes missing between the ship and the truck.',
    pays: 'Loads that disappear, worth double with a fence; more friends on the docks, more loads.',
    dials: [
      {
        id: 'tips', name: 'Which loads', ask: 'Do the men wait for a tip or take what they can?', def: 'shifts',
        opts: [
          { id: 'tips', label: 'Only on a tip', blurb: 'A sure load or nothing.', income: -0.15, heat: -0.25 },
          { id: 'shifts', label: 'Every good shift', blurb: 'The usual.' },
          { id: 'grab', label: 'Anything not nailed down', blurb: 'More loads, more manifests that do not add up.', income: 0.15, heat: 0.3, risk: 'the Waterfront Commission' },
        ],
      },
      {
        id: 'hall', name: 'The union hall', ask: 'Do you pay the hall for the good shifts?', def: 'no',
        opts: [
          { id: 'no', label: 'No', blurb: 'Your men take the shifts they get.' },
          { id: 'yes', label: 'Pay the hall', blurb: 'Your men get the night shifts on the right ships.', income: 0.12, weekly: 60 },
        ],
      },
    ],
    sits: [
      {
        id: 'tip', def: 'pass', weight: 3,
        scenes: [
          { title: () => 'A tip on a big load', text: (_c, x) => `A checker on Pier 3 says a ship comes in Thursday with ${loot(x)} worth ${$(x.t * 6)} at retail. One trailer, one night, and a guard who drinks.` },
          { title: () => 'Thursday\'s manifest', text: (c, x) => `${cap(c.weather)}. ${nm(x.runner)} has a copy of Thursday's manifest. One line on it is ${loot(x)}.` },
          { title: () => 'The night shift', text: (_c, x) => `Somebody owes ${first(x.runner)} a favor in the dispatcher's office. A trailer of ${loot(x)} can sit unwatched for an hour on Saturday night.` },
        ],
        choices: (x) => [
          ch('take', 'Take it', 'took a load off the docks', [roll(x, 0.45 + 0.08 * Math.min(4, x.v('contacts', 1)), 'the big load', { money: r50(x.t * (x.owns('fencing') ? 4.5 : 3)), heat: 2, text: 'The trailer was gone by morning.' }, { jail: true, heat: 4, text: 'The guard was sober. One of the men was picked up.' })], 'Odds grow with your friends on the docks.'),
          ch('pass', 'Too risky', 'passed on a big load', []),
        ],
      },
      {
        id: 'commission', def: 'ride', weight: 2, when: (x) => x.s.heat.local >= 25,
        scenes: [
          { title: () => 'The Waterfront Commission', text: () => 'An investigator from the Waterfront Commission is asking checkers about missing pallets. He has a list and a lot of patience.' },
          { title: () => 'Questions on Pier 3', text: (c) => `${cap(c.weather)}. Two men in raincoats spent all day on Pier 3 asking for manifests from last month.` },
          { title: () => 'An insurance man', text: () => 'A shipping company\'s insurance investigator is offering money for information about the missing loads. Somebody might take it.' },
        ],
        choices: (x) => [
          ch('lie', 'Lie low for two weeks', 'had the dock crew lie low', [{ type: 'closeBusiness', businessId: x.b.id, weeks: 2, label: x.b.name }, heatE(x, -4)]),
          ch('fall', 'Pay a checker to take the fall', 'paid a checker to take the fall', [cash(x, -x.t * 1.2)], 'He does six months and comes home to an envelope.'),
          ch('ride', 'Ride it out', 'rode out the Waterfront Commission', [roll(x, 0.6, 'the inquiry', { text: 'He went away with nothing.' }, { evidence: 4, heat: 3, text: 'A checker talked.' })]),
        ],
      },
    ],
  },

  labor: {
    kind: 'labor', fit: 'diplomacy', respect: 30, blessing: -20, pairs: ['construction', 'concrete', 'cargo'],
    line: 'A friendly business agent at the hotel workers\' local: labor peace has a price, the welfare fund is patient.',
    pays: 'What owners pay for peace, and what the fund lends to friends.',
    dials: [
      {
        id: 'fund', name: 'The welfare fund', ask: 'Does the fund lend money to your friends?', def: 'alone',
        opts: [
          { id: 'alone', label: 'Leave it alone', blurb: 'The members\' money stays the members\'.' },
          { id: 'loans', label: 'Loans to friends', blurb: 'Patient money for builders who kick back.', income: 0.25, fed: 0.08, risk: 'federal auditors' },
        ],
      },
      {
        id: 'peace', name: 'Labor peace', ask: 'How hard does the local squeeze the hotels?', def: 'sell',
        opts: [
          { id: 'quiet', label: 'Keep it quiet', blurb: 'Fair contracts, small envelopes.', income: -0.1, heat: -0.2 },
          { id: 'sell', label: 'Sell labor peace', blurb: 'An owner who pays has no trouble.' },
          { id: 'threaten', label: 'Threaten strikes', blurb: 'Every owner pays, every season.', income: 0.2, heat: 0.3, risk: 'strikes that go wrong' },
        ],
      },
    ],
    sits: [
      {
        id: 'election', def: 'back', weight: 3,
        scenes: [
          { title: () => 'An election at the local', text: (_c, x) => `A reform slate is running against your business agent at ${x.b.name}. A young bellhop with a big voice and a mimeograph machine. The vote is in three weeks.` },
          { title: () => 'The reform slate', text: (c) => `${cap(c.weather)}. Leaflets in every hotel kitchen: "Clean up the local." Somebody is paying for the printing, and it is not the members.` },
          { title: () => 'The members are restless', text: (_c, x) => `${nm(x.runner)} says the chambermaids are angry about the contract and a reformer is listening to them. If the vote goes the wrong way, the local is gone.` },
        ],
        choices: (x) => [
          ch('back', 'Back your man', 'backed your man in the union election', [cash(x, -x.t * 0.8), roll(x, 0.75, 'the union vote', { respect: 1, text: 'Your man won by forty votes.' }, { boost: [-30, 20], text: 'The reformer won. The local is cold for a while.' })]),
          ch('deal', 'Make a deal with the reformer', 'made a deal with the union reformer', [boost(x, -10, 20)], 'Less money for a while, no risk.'),
          ch('stuff', 'Make sure of the count', 'made sure of the union count', [roll(x, 0.88, 'the count', { text: 'The count came out right.' }, { evidence: 5, fed: 3, boost: [-35, 26], text: 'Federal monitors noticed the ballots.' }), heatE(x, 1, 'federal')], 'Abstract fraud: likely, and on the record if it fails.'),
        ],
      },
      {
        id: 'strike', def: 'half', weight: 2,
        scenes: [
          { title: () => 'An owner who will not pay', text: () => 'The owner of a big boardwalk hotel says he is done paying for labor peace. He has a lawyer and a friend in the governor\'s office.' },
          { title: () => 'A walkout brewing', text: (c) => `${cap(c.weather)}. The kitchen crews at two motels want a strike over wages, and the owners want you to stop it. Somebody will pay either way.` },
          { title: () => 'The new man at the Ocean Holiday', text: () => 'A new manager at a big motel tore up the old arrangement. He wants to see if the local is real.' },
        ],
        choices: (x) => [
          ch('strike', 'Call the strike', 'called a strike', [roll(x, 0.7, 'the strike', { money: r50(x.t * 3), respect: 2, text: 'He paid in a week.' }, { heat: 4, respect: -2, text: 'The strike dragged on and the newspapers took his side.' })]),
          ch('half', 'Settle for half', 'settled the labor dispute for half', [cash(x, x.t)]),
          ch('let', 'Let it go', 'let an owner stop paying', [{ type: 'respect', amount: -1, label: x.b.name }]),
        ],
      },
    ],
  },

  bidrig: {
    kind: 'bidrig', fit: 'business', respect: 25, blessing: -20, pairs: ['construction', 'concrete', 'lumber'],
    line: 'The contractors take turns being low bidder and the family takes a point on every job.',
    pays: 'A point on every public job; far better with your own construction company.',
    dials: [
      {
        id: 'point', name: 'The family\'s point', ask: 'How much does the family take on each job?', def: 'two',
        opts: [
          { id: 'one', label: 'One point', blurb: 'Nobody complains.', income: -0.2, heat: -0.3 },
          { id: 'two', label: 'Two points', blurb: 'The usual.' },
          { id: 'three', label: 'Three points', blurb: 'The bids go up; somebody notices the bids go up.', income: 0.2, heat: 0.3, fed: 0.03, risk: 'audits' },
        ],
      },
      {
        id: 'inspector', name: 'The inspector', ask: 'Is the city\'s building inspector on the arrangement?', def: 'no',
        opts: [
          { id: 'no', label: 'No arrangement', blurb: 'He inspects what he inspects.' },
          { id: 'yes', label: 'On the pad', blurb: 'Jobs pass. Questions do not get asked.', weekly: 70, heat: -0.3 },
        ],
      },
    ],
    sits: [
      {
        id: 'tender', def: 'rotation', weight: 3,
        scenes: [
          { title: (_c, x) => `A city tender: ${tender(x)}`, text: (_c, x) => `The city put ${tender(x)} out for bids, worth ${$(x.t * 12)}. The contractors' club meets Tuesday to decide whose turn it is.` },
          { title: () => 'Sealed bids', text: (c, x) => `${cap(c.weather)}. The bids for ${tender(x)} open in two weeks. A clerk in the engineer's office can tell you the numbers the day before.` },
          { title: () => 'Whose turn is it', text: (_c, x) => `It is supposed to be a Cape May contractor's turn on ${tender(x)}. ${nm(x.runner)} says it could just as easily be yours.` },
        ],
        choices: (x) => [
          ch('rig', 'Steer it to your own company', 'steered a city tender to your company', [roll(x, 0.7, 'the tender', { money: r50(x.t * 5), evidence: 2, text: 'Your company was low bidder by eleven dollars.' }, { heat: 5, fed: 2, text: 'A losing bidder called a reporter.' })], 'Big money; a paper trail.', !x.owns('construction') && !x.owns('concrete') ? 'You own no construction or concrete company' : undefined),
          ch('rotation', 'Let the rotation take it', 'let the bid rotation run', [cash(x, x.t * 1.5)], 'Your point, nothing more.'),
          ch('clean', 'Let it go clean', 'let a tender go clean', [heatE(x, -2)], 'Nobody can say anything about this one.'),
        ],
      },
      {
        id: 'audit', def: 'lawyer', weight: 2, when: (x) => x.s.heat.local + x.s.heat.federal >= 30,
        scenes: [
          { title: () => 'The state auditor', text: () => 'The state auditor wants the bid files for the last three years of county paving. He is young and he is not from here.' },
          { title: () => 'A reporter with a chart', text: () => 'A reporter at the Press made a chart of who won which county job, by year. The pattern is very pretty.' },
          { title: () => 'A contractor feels cheated', text: (c) => `${cap(c.weather)}. A contractor who never gets his turn wrote a letter to the attorney general. A copy came to you, which tells you something too.` },
        ],
        choices: (x) => [
          ch('lawyer', 'Pay a lawyer to bury it', 'paid lawyers to bury an audit', [cash(x, -x.t * 1.2), heatE(x, -3)]),
          ch('lose', 'Lose the files', 'lost the bid files', [heatE(x, 2), roll(x, 0.7, 'the missing files', { text: 'Nobody could prove anything.' }, { evidence: 3, text: 'Losing the files looked like what it was.' })]),
          ch('copies', 'Hand over clean copies', 'handed over clean bid files', [roll(x, 0.6, 'the clean copies', { text: 'The copies held up.' }, { evidence: 4, fed: 2, text: 'The auditor found the originals somewhere else.' })]),
        ],
      },
    ],
  },

  blackmail: {
    kind: 'blackmail', fit: 'intrigue', respect: 25,
    line: 'Hotel registers, a patient man with a camera: officials\' indiscretions turned into favors.',
    pays: 'A little cash and a steady supply of favors and hooks on people who matter.',
    dials: [
      {
        id: 'files', name: 'Whose files', ask: 'Who goes in the files?', def: 'officials',
        opts: [
          { id: 'officials', label: 'Officials only', blurb: 'Councilmen, judges, inspectors: people with power to give.' },
          { id: 'money', label: 'Anyone with money', blurb: 'Doctors, dealers, husbands. More cash, more enemies.', income: 0.25, heat: 0.3 },
        ],
      },
      {
        id: 'use', name: 'What the files buy', ask: 'Cash or favors?', def: 'favors',
        opts: [
          { id: 'favors', label: 'Favors', blurb: 'A favor you can call in, every so often.', k: { favor: 1 } },
          { id: 'cash', label: 'Cash', blurb: 'Steady money; fewer favors.', income: 0.2, k: { favor: 0.3 } },
        ],
      },
    ],
    sits: [
      {
        id: 'file', def: 'box', weight: 3, when: (x) => !!fileTarget(x),
        scenes: [
          { title: (_c, x) => `A file on ${fileName(x)}`, text: (_c, x) => `The photographer brought an envelope: ${fileName(x)}, ${fileWhat(x)}. Nothing anyone would put in a newspaper, yet.` },
          { title: () => 'The desk clerk\'s register', text: (c, x) => `${cap(c.weather)}. A desk clerk at a Cape May hotel kept a page of the register for you: ${fileName(x)} was there, ${fileWhat(x)}.` },
          { title: () => 'Something to keep', text: (_c, x) => `${nm(x.runner)} has what he calls insurance on ${fileName(x)}: ${fileWhat(x)}. He wants to know what to do with it.` },
        ],
        choices: (x) => {
          const t = fileTarget(x)!;
          return [
            ch('hook', 'Use it: he owes you now', `put a hook in ${t.firstName} ${t.lastName}`, [{ type: 'hook', targetId: t.id, strong: true, reason: 'The file', label: x.b.name }, heatE(x, 1)], 'A strong hook on him.'),
            ch('sell', 'Sell him the negatives', `sold ${t.firstName} ${t.lastName} his negatives`, [cash(x, x.t * 3), { type: 'opinion', from: t.id, to: x.s.playerId, amount: -15, reason: 'Sold me my own pictures', decay: 1, label: x.b.name }]),
            ch('box', 'Put it in the bank box', 'put a file in the bank box', [{ type: 'favor', amount: 1, label: x.b.name }], 'Insurance for a rainy day.'),
          ];
        },
      },
    ],
  },

  jewel: {
    kind: 'jewel', fit: 'intrigue', respect: 20, scale: 450, pairs: ['fencing', 'pawn'],
    line: 'Second-story men who work the summer cottages: big, irregular scores.',
    pays: 'Nothing most weeks, then a jewel case; sells for half without a fence.',
    dials: [PACE],
    sits: [
      {
        id: 'score', def: 'wait', weight: 3,
        scenes: [
          { title: () => 'A mark at Cape May Point', text: (_c, x) => `A society widow from Philadelphia is at her cottage for the month, and the safe is older than she is. ${nm(x.runner)} has watched the house for a week.` },
          { title: () => 'The society pages', text: (c, x) => `${cap(c.weather)}. The Bulletin's society page says a steel heiress will wear the family emeralds to a charity ball at the Admiral. ${first(x.runner)} cut the article out.` },
          { title: () => 'A summer house, empty', text: (_c, x) => `A judge's family closed their Stone Harbor house for two weeks and left the silver and a jewel case. ${first(x.runner)} knows the maid's day off.` },
        ],
        choices: (x) => [
          ch('go', 'Go', 'sent the jewel crew on a score', [roll(x, scoreOdds(x, 0.6), 'the score', { money: r50(x.t * (x.owns('fencing') || x.owns('pawn') ? 8 : 4.5)), heat: 2, text: 'Clean in and out; the case sold up the coast.' }, { jail: true, heat: 4, text: 'A neighbor called the police.' })], 'Odds grow with the crew\'s tier and the pace; a fence doubles the take.'),
          ch('wait', 'Wait for a better night', 'had the jewel crew wait', []),
          ch('off', 'Call it off', 'called off a jewel score', [heatE(x, -1)]),
        ],
      },
    ],
  },

  bankcrew: {
    kind: 'bankcrew', fit: 'force', respect: 35, scale: 1200,
    line: 'Out-of-town banks and armored cars. Huge scores, and a federal crime.',
    pays: 'Rare, enormous scores; the FBI follows every one.',
    dials: [PACE],
    sits: [
      {
        id: 'score', def: 'off', weight: 3,
        scenes: [
          { title: () => 'A bank in Delaware', text: (_c, x) => `${nm(x.runner)} has a bank in a Delaware farm town: one guard, a slow manager, the payroll for a cannery on Fridays.` },
          { title: () => 'An armored car\'s route', text: (c) => `${cap(c.weather)}. Someone at an armored-car company sold you a schedule. The same route, the same stop for coffee, every Thursday.` },
          { title: () => 'Out of state', text: (_c, x) => `A savings bank in Maryland, three hours away. ${first(x.runner)} says it is the softest box he has ever seen.` },
        ],
        choices: (x) => [
          ch('go', 'Do it', 'sent the bank crew out', [roll(x, scoreOdds(x, 0.55), 'the bank job', { money: r50(x.t * 7), fed: 5, text: 'They were across the state line before the alarm stopped.' }, { jail: true, fed: 6, evidence: 2, text: 'A teller got the plate. The FBI was waiting at the bridge.' })], 'Huge money either way it goes; the FBI either way.'),
          ch('off', 'Call it off', 'called off a bank job', []),
        ],
      },
    ],
  },

  stag: {
    kind: 'stag', fit: 'business', respect: 15,
    line: 'A distribution business: reels in plain cans for private clubs up and down the coast.',
    pays: 'A steady route; interstate shipping is what the federal government cares about.',
    dials: [
      {
        id: 'routes', name: 'The routes', ask: 'How far do the cans travel?', def: 'coast',
        opts: [
          { id: 'clubs', label: 'Local private clubs', blurb: 'Lodges and smokers in this county.', income: -0.15, k: { fed: 0.4 } },
          { id: 'coast', label: 'Up and down the coast', blurb: 'The usual route.' },
          { id: 'interstate', label: 'Interstate', blurb: 'Every lodge from Baltimore to Providence.', income: 0.2, fed: 0.1, risk: 'postal inspectors' },
        ],
      },
    ],
    sits: [
      {
        id: 'inspectors', def: 'ride', weight: 2,
        scenes: [
          { title: () => 'Postal inspectors', text: () => 'Two postal inspectors visited a lodge in Pennsville and asked where its films come from. The lodge secretary has a weak heart and a weaker memory.' },
          { title: () => 'A crate at the depot', text: (c) => `${cap(c.weather)}. A crate of plain cans sat at the freight depot for a week, and someone opened it.` },
          { title: () => 'A federal subpoena', text: () => 'A projectionist in Delaware got a federal subpoena. He has a family and a lawyer who wants to make a deal.' },
        ],
        choices: (x) => [
          ch('trucks', 'Move it to your own trucks', 'moved the film route to your own trucks', [cash(x, -x.t * 1.2), heatE(x, -3, 'federal')]),
          ch('ride', 'Ride it out', 'rode out the postal inspectors', [roll(x, 0.65, 'the inspectors', { text: 'They lost interest.' }, { evidence: 3, fed: 4, close: 4, text: 'They seized a shipment.' })]),
        ],
      },
      {
        id: 'legit', def: 'stay', weight: 2, when: (x) => x.s.date.y >= 1971,
        scenes: [
          { title: () => 'The law has changed', text: () => 'A lawyer in New York says the courts have changed and the stag route could be a licensed film distributor with an office and a letterhead. Same cans, different paperwork.' },
          { title: () => 'A real company', text: (c) => `${cap(c.weather)}. A theater chain in Baltimore wants to buy prints from a real company with real invoices. The route could be one.` },
        ],
        choices: (x) => [
          ch('convert', 'Go legitimate: a film distributor', 'turned the film route into a licensed distributor', [cash(x, -6000), { type: 'removeBusiness', businessId: x.b.id, label: x.b.name }, { type: 'addBusiness', business: { id: '', name: 'Coastal Film Exchange', kind: 'filmdist', districtId: x.b.districtId, owner: 'player', weeklyBase: 320, upkeep: 60, heat: 0.15, category: 'front', staffIds: [...(x.b.staffIds ?? [])], boughtWeek: x.s.week, cost: 14000 }, label: x.b.name }], 'A front that washes money; still watched.', x.s.money < 6000 ? 'Needs $6,000' : undefined),
          ch('stay', 'Keep it the way it is', 'kept the film route as it was', []),
        ],
      },
    ],
  },

  narcotics: {
    kind: 'narcotics', fit: 'force', respect: 0,
    line: 'Abstract and forbidden: Philadelphia\'s rule is no narcotics, and Philadelphia finds out.',
    pays: 'More than anything else on the island, until the reckoning.',
    dials: [],
    sits: [
      {
        id: 'word', def: 'shut', weight: 2,
        scenes: [
          { title: () => 'Word travels', text: (_c, x) => `${nm(x.runner)} says a man in South Philadelphia asked him a question about the docks that nobody should know to ask. Philadelphia does not ask twice.` },
          { title: () => 'Your own people know', text: (c) => `${cap(c.weather)}. Two of your soldiers will not shake hands with the men on the pipeline. The old ones remember what happens to families that touch it.` },
        ],
        choices: (x) => [
          ch('shut', 'Shut it down', 'shut down the narcotics pipeline', [{ type: 'removeBusiness', businessId: x.b.id, label: x.b.name }, philly(x, 6, 'He shut it down himself'), { type: 'crewOpinion', amount: 3, reason: 'He listened to the old rules', label: x.b.name }], 'Lose the money, keep your standing.'),
          ch('keep', 'Keep it', 'kept the narcotics pipeline running', [{ type: 'heat', bar: 'family', amount: 4, label: x.b.name }]),
        ],
      },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Flavor pickers (deterministic per business and week)                */
/* ------------------------------------------------------------------ */

function pickBy<T>(x: SitCtx, xs: readonly T[], salt = 0): T {
  let h = 0;
  const k = `${x.b.id}:${x.s.week}:${salt}`;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return xs[h % xs.length];
}
const HOT = ['7-1-1', '3-6-9', '1-2-3', '4-0-4', '7-7-7', '2-1-6', '9-1-1', '5-0-5', '4-1-1'];
const hot = (x: SitCtx) => pickBy(x, HOT);
function hotWhy(c: SceneCtx, x: SitCtx): string {
  return pickBy(x, [
    `it was on the license plate of the car that won the raffle at St. Ann's`,
    `a priest's age, a dream, and a hymn number all at once`,
    `the date of the big storm, and ${c.summer ? 'every tourist' : 'every fisherman'} remembers it`,
    `a famous singer's room number at the Hotel Hunt`,
  ], 1);
}
const fixWhat = (x: SitCtx) => pickBy(x, ['a college basketball game in Philadelphia', 'the main event at the Convention Hall fights', 'the fifth race at Atlantic City', 'a minor-league ballgame in Reading'], 2);
const loot = (x: SitCtx) => pickBy(x, ['television sets', 'Scotch whisky', 'cigarettes', 'transistor radios', 'women\'s coats', 'frozen shrimp', 'electric typewriters'], 3);
const tender = (x: SitCtx) => pickBy(x, ['repaving the boardwalk', 'the new sewer line on Pacific', 'the county garage', 'a school addition in Rio Grande', 'the bay seawall'], 4);
const borrower = (x: SitCtx) => pickBy(x, ['A clam-boat captain', 'A stand owner on the boards', 'A bar owner on New Jersey Avenue', 'A car dealer on the Causeway', 'A motel man from the Crest'], 5);
const collateral = (x: SitCtx) => pickBy(x, ['a half share in a luncheonette', 'a boat with a new engine', 'a liquor license', 'the deed to a bungalow in the Crest', 'two cigarette machines'], 6);

/** The odds of a crew's score: tier, pace, staff, a specialist. */
export function scoreOdds(x: SitCtx, base: number): number {
  const tier = x.v('tier', 0);
  const pace = x.dial('pace');
  const men = (x.b.staffIds ?? []).length;
  const safe = pace === 'careful' ? 0.1 : pace === 'busy' ? -0.1 : 0;
  return Math.max(0.15, Math.min(0.92, base + 0.06 * tier + safe + (men >= 2 ? 0.05 : -0.1)));
}

/** The official a blackmail file is about: a living official without a hook yet (never about who anyone loves). */
export function fileTarget(x: SitCtx): Character | undefined {
  const s = x.s;
  const pool = Object.values(s.characters).filter((c) => c.alive && c.office && c.faction !== 'player' && c.id !== s.playerId && !s.hooks.some((h) => h.holder === 'player' && h.targetId === c.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return pool.length ? pickBy(x, pool, 7) : undefined;
}
const fileName = (x: SitCtx) => { const t = fileTarget(x); return t ? `${t.office} ${t.firstName} ${t.lastName}` : 'a councilman'; };
/** What is in the file: money and indiscretions only. */
const fileWhat = (x: SitCtx) => pickBy(x, ['a weekend in a hotel he told his wife was a convention', 'gambling markers he never paid', 'an envelope from a contractor, photographed', 'a car accident his brother-in-law made disappear'], 8);

export function racketInfo(kind: BusinessKind): RacketInfo | undefined {
  return RACKETS[kind];
}
