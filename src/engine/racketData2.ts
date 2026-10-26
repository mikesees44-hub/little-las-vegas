import type { Dial, RacketOutcome } from './racketState';
import type { Character, Choice, Effect } from './types';
import type { Fit, RacketInfo, SitCtx } from './racketData';

/**
 * The rest of the classic operations, as data (the Start-a-Racket menu,
 * racketMenu.ts): protection, after-hours, untaxed liquor and cigarettes,
 * guns, counterfeit paper, insurance fraud, the bust-out, laundering for
 * other outfits, the chop shop, the sit-down court, the pad, false invoices.
 *
 * Abstract on purpose: money, heat, odds and who objects. No method, no
 * how-to; violence is implied at most and nobody is coerced on screen.
 * Kept apart from racketData.ts (and with its own tiny helpers) so the two
 * files never import each other at load time.
 */

const r50 = (n: number) => Math.round(n / 50) * 50;
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const first = (c?: Character) => c?.firstName ?? 'your man';
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

function roll(x: SitCtx, fit: Fit, p: number, what: string, win: RacketOutcome, lose: RacketOutcome): Effect {
  p += x.runner ? (x.runner.attributes[fit] - 50) / 500 : -0.05;
  return { type: 'econ', op: { op: 'racket', cmd: 'roll', bizId: x.b.id, p: Math.round(Math.max(0.05, Math.min(0.95, p)) * 100) / 100, what, win, lose }, label: `${x.b.name}: ${what}` };
}
const cash = (x: SitCtx, n: number): Effect => ({ type: 'money', amount: r50(n), label: x.b.name });
const heatE = (x: SitCtx, n: number, bar: 'local' | 'federal' = 'local'): Effect => ({ type: 'heat', bar, amount: n, label: x.b.name });
const boost = (x: SitCtx, pct: number, weeks: number): Effect => ({ type: 'econ', op: { op: 'racket', cmd: 'boost', bizId: x.b.id, pct, weeks }, label: x.b.name });
const ch = (id: string, label: string, because: string, effects: Effect[], detail?: string, disabledReason?: string): Choice => ({ id, label, because, effects, detail, disabledReason });

/** A three-way "how hard" dial most of the new rackets share in spirit. */
const pushDial = (id: string, name: string, ask: string, soft: [string, string], hard: [string, string], risk: string): Dial => ({
  id, name, ask, def: 'usual',
  opts: [
    { id: 'soft', label: soft[0], blurb: soft[1], income: -0.15, heat: -0.35 },
    { id: 'usual', label: 'The usual', blurb: 'How everybody runs it.' },
    { id: 'hard', label: hard[0], blurb: hard[1], income: 0.2, heat: 0.35, risk },
  ],
});

export const RACKETS2: Partial<Record<string, RacketInfo>> = {
  protection: {
    kind: 'protection', fit: 'force',
    line: 'Shops and bars pay a weekly envelope; the block stays quiet.',
    pays: 'Small, steady envelopes all year. The best first racket there is.',
    dials: [pushDial('lean', 'How hard you lean', 'How firmly is the envelope collected?', ['A friendly envelope', 'Fewer stops, nobody complains.'], ['Every door on the block', 'More envelopes, more owners talking to the police.'], 'complaints')],
    sits: [{
      id: 'refuses', def: 'word', weight: 2,
      scenes: [
        { title: () => 'An owner who will not pay', text: (_c, x) => `A new man bought the shoe store on the corner and told ${first(x.runner)} he pays the city, not the family.` },
        { title: () => 'A block with a new idea', text: (c) => `${cap(c.weather)}. Three owners on the block got together and decided to stop paying. Somebody has to talk to them.` },
      ],
      choices: (x) => [
        ch('word', 'Have a quiet word', 'had a quiet word with a shopkeeper', [roll(x, 'force', 0.75, 'the quiet word', { money: r50(x.t * 1.5), text: 'He thought it over and paid.' }, { heat: 3, text: 'He went to the newspaper instead.' })]),
        ch('skip', 'Let that one go', 'let a shopkeeper stop paying', [boost(x, -10, 8)], 'A little less money; the block sees it.'),
      ],
    }],
  },
  afterhours: {
    kind: 'afterhours', fit: 'diplomacy', pairs: ['cardgame', 'bar'],
    line: 'A locked door and a bar that pours after legal closing time.',
    pays: 'Good money all summer; the state liquor board is the one who objects.',
    dials: [pushDial('door', 'The door', 'Who gets past the buzzer?', ['Regulars only', 'Quiet nights, faces you know.'], ['Anybody with cash', 'Packed every night; somebody talks.'], 'a raid')],
    sits: [{
      id: 'abc', def: 'pay', weight: 2,
      scenes: [
        { title: () => 'The liquor board', text: (_c, x) => `An agent from the state liquor board has been parked across from ${x.b.name} two nights running.` },
        { title: () => 'A complaint about the noise', text: (c) => `${cap(c.weather)}. A neighbor has written to the city about the cars at four in the morning.` },
      ],
      choices: (x) => [
        ch('pay', 'Close a week, open quieter', 'closed the after-hours room for a week', [{ type: 'closeBusiness', businessId: x.b.id, weeks: 1, label: x.b.name }, heatE(x, -2)]),
        ch('ride', 'Stay open', 'kept the after-hours room open', [roll(x, 'diplomacy', 0.6, 'staying open', { money: r50(x.t), text: 'He went home.' }, { heat: 3, text: 'A raid; the bar was padlocked.' })]),
      ],
    }],
  },
  bootleg: {
    kind: 'bootleg', fit: 'business', pairs: ['bar', 'club', 'restaurant'],
    line: 'Liquor with no tax stamp, sold to the bars under the distributor\'s price.',
    pays: 'Steady cases every week; the Treasury\'s tax men object.',
    dials: [pushDial('cases', 'How many cases', 'How much moves a week?', ['A few cases', 'Only to bars you own or trust.'], ['Every bar that will buy', 'A lot of cases, a lot of paperwork that does not add up.'], 'the tax men')],
    sits: [{
      id: 'truck', def: 'pass', weight: 2,
      scenes: [
        { title: () => 'A whole truckload', text: (_c, x) => `A driver with a trailer of unstamped cases wants ${$(x.t * 2)} for all of it, tonight.` },
        { title: () => 'Cases cheap', text: (c, x) => `${cap(c.weather)}. ${first(x.runner)} can get a month of cases at once, if you pay now.` },
      ],
      choices: (x) => [
        ch('buy', 'Buy it', 'bought a truckload of untaxed liquor', [cash(x, -x.t * 2), roll(x, 'business', 0.78, 'the truckload', { money: r50(x.t * 4), text: 'Every bar on the island bought.' }, { fed: 2, heat: 2, text: 'Tax agents seized it at the bridge.' })]),
        ch('pass', 'Pass', 'passed on a truckload of liquor', []),
      ],
    }],
  },
  cigarettes: {
    kind: 'cigarettes', fit: 'business', pairs: ['vending'],
    line: 'Cartons bought where the tax is low and sold where it is high.',
    pays: 'Low, steady money all year; hardly anyone cares.',
    dials: [pushDial('route', 'The route', 'How far do the cartons go?', ['Your own machines', 'Only the machines and stands you own.'], ['Every newsstand on the shore', 'More cartons, the state tax office notices.'], 'state tax agents')],
    sits: [],
  },
  guns: {
    kind: 'guns', fit: 'force', respect: 20,
    line: 'Crates that fall off trucks and boats, sold to buyers out of state.',
    pays: 'Big, steady crates; the federal government objects, and Philadelphia does not love it.',
    dials: [{
      id: 'buyers', name: 'Who buys', ask: 'Who are the crates sold to?', def: 'quiet',
      opts: [
        { id: 'quiet', label: 'Sporting-goods men', blurb: 'A few known buyers, far away.', income: -0.1, heat: -0.3 },
        { id: 'usual', label: 'Anyone out of state', blurb: 'Whoever pays, as long as it leaves New Jersey.', fed: 0.05 },
        { id: 'any', label: 'Anyone with cash', blurb: 'More crates; some end up in the newspapers.', income: 0.25, heat: 0.3, fed: 0.12, philly: -1, risk: 'federal agents' },
      ],
    }],
    sits: [{
      id: 'crate', def: 'pass', weight: 2,
      scenes: [
        { title: () => 'A big order', text: (_c, x) => `A buyer from out of state wants twenty crates at once and will pay ${$(x.t * 4)}. ${first(x.runner)} has never met him.` },
        { title: () => 'Too good a price', text: (c) => `${cap(c.weather)}. A man in a good suit offers twice the going rate for a truckload. Good suits worry the old men.` },
      ],
      choices: (x) => [
        ch('sell', 'Sell to him', 'sold a big order of crates', [roll(x, 'force', 0.65, 'the big order', { money: r50(x.t * 4), fed: 1, text: 'He paid and drove south.' }, { jail: true, fed: 5, evidence: 3, text: 'He was a federal agent.' })]),
        ch('pass', 'Too good to be true', 'passed on a big order of crates', []),
      ],
    }],
  },
  counterfeit: {
    kind: 'counterfeit', fit: 'intrigue', respect: 25,
    line: 'Paper from a printer in the pines, passed far from the island.',
    pays: 'Good money that never stops; the Secret Service is patient.',
    dials: [pushDial('pass', 'Where it is passed', 'How close to home does the paper go?', ['Out of state only', 'Never within a hundred miles.'], ['Anywhere it spends', 'More paper, closer to home.'], 'the Secret Service')],
    sits: [{
      id: 'plates', def: 'move', weight: 2,
      scenes: [
        { title: () => 'Somebody is asking', text: () => 'Two men from the Treasury are asking the banks in Cape May about bad twenties.' },
        { title: () => 'A note came back', text: (c) => `${cap(c.weather)}. A bank teller in Ocean City caught one of the notes. The serial number is a story now.` },
      ],
      choices: (x) => [
        ch('move', 'Move the printer', 'moved the printer', [cash(x, -x.t), { type: 'closeBusiness', businessId: x.b.id, weeks: 2, label: x.b.name }, heatE(x, -3, 'federal')]),
        ch('ride', 'Keep printing', 'kept the printer running', [roll(x, 'intrigue', 0.6, 'the Treasury men', { text: 'They looked somewhere else.' }, { fed: 5, evidence: 3, close: 4, text: 'They found a passer and he talked.' })]),
      ],
    }],
  },
  insurance: {
    kind: 'insurance', fit: 'intrigue', respect: 20,
    line: 'An adjuster on the arrangement, and owners who need a claim paid.',
    pays: 'Busiest in the winter; the insurance investigators object.',
    dials: [pushDial('claims', 'How many claims', 'How often does the adjuster sign?', ['Only the safe ones', 'A claim a month that nobody questions.'], ['Every owner who asks', 'A lot of claims in a small county.'], 'investigators')],
    sits: [{
      id: 'investigator', def: 'quiet', weight: 2,
      scenes: [
        { title: () => 'An investigator from Hartford', text: () => 'The insurance company sent a man from Hartford with a list of every claim in the county since spring.' },
        { title: () => 'Too many claims', text: (c) => `${cap(c.weather)}. A reporter noticed the county pays more claims than Philadelphia.` },
      ],
      choices: (x) => [
        ch('quiet', 'Go quiet for a while', 'had the adjuster go quiet', [boost(x, -40, 6), heatE(x, -3)]),
        ch('ride', 'Business as usual', 'kept the claims coming', [roll(x, 'intrigue', 0.6, 'the investigator', { text: 'He went home with nothing.' }, { evidence: 3, heat: 3, text: 'The adjuster was fired and talked.' })]),
      ],
    }],
  },
  bustout: {
    kind: 'bustout', fit: 'business',
    line: 'Take over a failing store\'s credit, sell everything out the back, let it go under.',
    pays: 'Nothing for six weeks, then one big score, and the store is finished.',
    dials: [{
      id: 'greed', name: 'How far you run it', ask: 'How much credit do you run up before it folds?', def: 'usual',
      opts: [
        { id: 'careful', label: 'Carefully', blurb: 'A store that looks like it simply failed.', heat: -0.4, k: { score: 0.8 } },
        { id: 'usual', label: 'The usual', blurb: 'Every supplier who will ship.', k: { score: 1 } },
        { id: 'greedy', label: 'Every last dollar', blurb: 'A bigger score; the trustee asks questions.', heat: 0.5, risk: 'a fraud case', k: { score: 1.25 } },
      ],
    }],
    sits: [],
  },
  washing: {
    kind: 'washing', fit: 'business', pairs: ['laundromat', 'bank', 'restaurant'],
    line: 'Other outfits\' dirty money through your books, for a fee.',
    pays: 'A quiet fee every week, and your own money washes too.',
    dials: [pushDial('clients', 'Whose money', 'Whose money goes through the books?', ['Philadelphia friends only', 'Small, trusted money.'], ['Anyone who pays the fee', 'Bigger fees, strangers\' money.'], 'federal auditors')],
    sits: [],
  },
  chopshop: {
    kind: 'chopshop', fit: 'business', pairs: ['towing', 'carlot'],
    line: 'A garage where stolen cars come in whole and leave as parts.',
    pays: 'Good money in the summer when the lots are full; the state police object.',
    dials: [pushDial('cars', 'Which cars', 'Which cars does the garage take?', ['Out-of-state plates only', 'Fewer cars, nobody local misses one.'], ['Anything on four wheels', 'More cars, more angry owners.'], 'the state police')],
    sits: [{
      id: 'cop', def: 'clean', weight: 2,
      scenes: [
        { title: () => 'A detective\'s car', text: (_c, x) => `One of the cars that came into ${x.b.name} last night belonged to a detective's brother-in-law.` },
        { title: () => 'A tow truck too many', text: (c) => `${cap(c.weather)}. The state police are counting tow trucks on the Causeway.` },
      ],
      choices: (x) => [
        ch('clean', 'Clean out the garage', 'cleaned out the chop shop', [{ type: 'closeBusiness', businessId: x.b.id, weeks: 2, label: x.b.name }, heatE(x, -3)]),
        ch('ride', 'Ride it out', 'rode out the state police', [roll(x, 'business', 0.6, 'the state police', { text: 'They counted the wrong garage.' }, { heat: 4, close: 3, jail: true, text: 'They came with a warrant.' })]),
      ],
    }],
  },
  court: {
    kind: 'court', fit: 'diplomacy', respect: 10,
    line: 'Operators bring their disputes to the family and pay a fee for a fair word.',
    pays: 'Small, steady fees and favors. Almost no heat. A good boss\'s earner.',
    dials: [{
      id: 'fee', name: 'The fee', ask: 'What does a fair word cost?', def: 'usual',
      opts: [
        { id: 'favor', label: 'Mostly favors', blurb: 'People owe you more than they pay you.', income: -0.25, k: { favor: 1 } },
        { id: 'usual', label: 'The usual fee', blurb: 'An envelope from each side.' },
        { id: 'steep', label: 'A steep fee', blurb: 'More money; fewer people come.', income: 0.2, risk: 'people settle it themselves' },
      ],
    }],
    sits: [{
      id: 'dispute', def: 'fair', weight: 2,
      scenes: [
        { title: () => 'Two operators, one corner', text: () => 'Two men who run stands on the same stretch of boardwalk both say the corner is theirs. They want the family to decide.' },
        { title: () => 'A partnership gone sour', text: (c) => `${cap(c.weather)}. Two partners in a bar each say the other cooked the books. Both brought an envelope.` },
      ],
      choices: (x) => [
        ch('fair', 'Rule fairly', 'ruled fairly at a sit-down', [cash(x, x.t), { type: 'respect', amount: 1, label: x.b.name }], 'The island hears the family is fair.'),
        ch('friend', 'Rule for the bigger envelope', 'ruled for the bigger envelope', [cash(x, x.t * 2.5), { type: 'respect', amount: -1, label: x.b.name }], 'More money; the loser talks.'),
      ],
    }],
  },
  payoff: {
    kind: 'payoff', fit: 'diplomacy',
    line: 'A cop, an inspector and a zoning man on a weekly envelope.',
    pays: 'Costs money every week and earns nothing; every racket runs cooler.',
    dials: [{
      id: 'who', name: 'Who is on it', ask: 'How many people are on the envelope?', def: 'beat',
      opts: [
        { id: 'beat', label: 'The precinct', blurb: 'A sergeant and his patrolmen.', k: { cool: 1 } },
        { id: 'wide', label: 'The precinct and City Hall', blurb: 'The inspectors and the zoning man too.', weekly: 80, k: { cool: 1.6 } },
      ],
    }],
    sits: [],
  },
  taxdodge: {
    kind: 'taxdodge', fit: 'business', pairs: ['restaurant', 'motel', 'bar', 'construction'],
    line: 'A front\'s books that show less than it made, with invoices from companies that do not exist.',
    pays: 'Slow, quiet money; the IRS objects, eventually.',
    dials: [pushDial('books', 'How much the books hide', 'How much goes missing from the books?', ['A little', 'Nothing an auditor would notice.'], ['A lot', 'More money, more strange invoices.'], 'an IRS audit')],
    sits: [],
  },
};

/** The narcotics pipeline's one standing decision: how big the shipments run. */
export const NARC_DIAL: Dial = {
  id: 'size', name: 'The shipments', ask: 'How big do the shipments run?', def: 'usual',
  opts: [
    { id: 'small', label: 'Small and careful', blurb: 'Fewer men involved, fewer men who could talk.', income: -0.3, heat: -0.4, k: { rat: 0.5 } },
    { id: 'usual', label: 'Steady', blurb: 'What the buyers in Philadelphia expect.', k: { rat: 1 } },
    { id: 'big', label: 'As big as it goes', blurb: 'The most money on the island; more men, more paper, more risk.', income: 0.3, heat: 0.3, fed: 0.1, risk: 'a rat', k: { rat: 1.8 } },
  ],
};
