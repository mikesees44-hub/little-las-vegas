import { ageOn, isInSeason, seasonMultiplier } from './calendar';
import { capos, crew, displayName, hasTrait, makeCharacter } from './characters';
import {
  callName, fmt, make, men, mobRivals, op, r100, registerCrewEvents, subjectOk, type CrewEventDef,
} from './crewEvents';
import { available, hasVice } from './hierarchy';
import { FEMALE_FIRST, MALE_FIRST } from './names';
import { opinion } from './relations';
import { chance, pick, randInt, shuffle } from './rng';
import type { Ctx } from './ledger';
import type { Character, Choice, Effect, GameState, Rival, ScheduledConsequence } from './types';

/**
 * More crew decisions, so a year on the island is not the same six asks
 * on a loop. The old "X wants Y's route" becomes a whole street of pitches
 * (a card game, a hijack tip, a crooked inspector, a jukebox war, a
 * contractor in trouble, a horse that can't lose, a bookie skimming his own
 * sheet, a rival soldier who wants to switch sides, a widow who needs help),
 * and the other high-frequency asks (scores, brawls, sponsors, disputes,
 * weddings and christenings, kids, pinches, wives, rival courtships) each
 * get several different situations. Each is its own template (its own key
 * and cooldown), read from the man's traits, vices, household, history and
 * the season, and every risky play resolves later through `cv_outcome`.
 *
 * Registered into crewEvents' CREW_EVENTS at import (engine.ts imports this
 * file), so they share the per-event and per-man cooldowns and the story
 * director's freshness weighting.
 */

const COOL = 12;

/** A delayed outcome: success odds, what winning and losing cost, in plain words. */
function outcome(hint: string, label: string, p: Partial<Record<'p' | 'win' | 'lose' | 'heat' | 'fed' | 'ev' | 'resp' | 'wealth' | 'opWin' | 'opLose', number>> & { who: string; good: string; bad: string }, minW = 1, maxW = 3): Effect {
  return { type: 'schedule', key: 'cv_outcome', minWeeks: minW, maxWeeks: maxW, chance: 1, hint, params: { ...p }, label };
}

function rivalBy(s: GameState): Rival | undefined {
  const rs = mobRivals(s);
  return rs.length ? pick(s, rs) : undefined;
}

function leader(s: GameState, r: Rival): string {
  const L = s.characters[r.leaderId];
  return L ? `${L.firstName} ${L.lastName}` : r.name;
}

const opn = (from: string, to: string, amount: number, reason: string, label: string, decay = 1): Effect => ({ type: 'opinion', from, to, amount, reason, decay, label });

const summer = (s: GameState) => isInSeason(s.date);

/* ------------------------------------------------------------------ */
/* Pitches: what a man in the street brings the boss                   */
/* ------------------------------------------------------------------ */

const pitchCardGame: CrewEventDef = {
  key: 'pitch_cardgame',
  cooldown: COOL,
  weight: () => 2.5,
  subjects: (s) => men(s).filter((c) => available(s, c) && (hasTrait(c, 'Gambler') || hasVice(c, 'cards') || c.craft === 'bookmaker' || c.attributes.business >= 55)),
  build: (s, c) => {
    const where = summer(s) ? pick(s, ['a motel suite in the Crest with the blinds down', 'the back room of a clam house on the bay', 'a rented cabin cruiser off Otten\'s Harbor']) : pick(s, ['a closed-for-the-season restaurant on Pacific Avenue', 'the basement of a Rio Grande funeral home', 'a boarded-up bungalow in Wildwood Crest']);
    const whale = pick(s, ['a Baltimore car dealer', 'two orthodontists from Cherry Hill', 'a Pittsburgh steel man on his second marriage', 'a Trenton assemblyman who plays like he is paid to lose']);
    const bank = r100(600 + randInt(s, 0, 600));
    const label = `${c.firstName}'s card game`;
    return make(s, 'pitch_cardgame', c, `${callName(c)} wants to run a game`,
      `${displayName(c)} has ${whale} who wants a real game, high stakes, no tourists. He found the room: ${where}. "Bankroll me ${fmt(bank)} and I deal it straight. The house edge is the house." ${hasVice(c, 'cards') ? 'He has the look of a man who would rather be sitting at the table than running it.' : ''}`.trim(),
      [
        { id: 'bank', label: `Bankroll the game (${fmt(bank)})`, detail: 'The house usually wins. Usually.', because: `bankrolled ${c.firstName}'s card game`, effects: [{ type: 'money', amount: -bank, label }, outcome('the cards fall', label, { who: c.id, p: hasVice(c, 'cards') ? 0.5 : 0.68, win: r100(bank * 2.3), heat: 3, opWin: 5, good: `${c.firstName}'s game took ${whale} for everything but his cufflinks`, bad: `${c.firstName}'s game was a bust: the whale got lucky and somebody called the county` })] },
        { id: 'cut', label: 'His bankroll, your cut', detail: 'He takes the risk, you take 30% for the blessing.', because: `let ${c.firstName} run a game for a cut`, disabledReason: c.wealth < bank ? `${c.firstName} only has ${fmt(c.wealth)}` : undefined, effects: [{ type: 'wealth', charId: c.id, amount: -bank, label }, outcome('the cards fall', label, { who: c.id, p: 0.62, win: r100(bank * 0.7), wealth: r100(bank * 2), good: `${c.firstName}'s game paid off and your cut came in an envelope`, bad: `${c.firstName}'s game went bad and cost him his stake` })] },
        { id: 'no', label: 'No games this month', because: `told ${c.firstName} no card game`, effects: [opn(c.id, s.playerId, -4, 'Sat on my game', label)] },
      ], 'bank');
  },
};

const HIJACK_LOADS = [
  { what: 'a trailer of Zenith console televisions', worth: 7000 },
  { what: 'eight hundred cases of Seagram\'s 7', worth: 6000 },
  { what: 'a load of Salem cigarettes with North Carolina stamps', worth: 5000 },
  { what: 'a refrigerated truck of Maine lobster for the boardwalk restaurants', worth: 3500 },
  { what: 'a truck of Firestone whitewalls', worth: 4500 },
];

const pitchHijack: CrewEventDef = {
  key: 'pitch_hijack',
  cooldown: COOL,
  weight: () => 2.5,
  subjects: (s) => men(s).filter((c) => available(s, c) && c.rank !== 'capo' && (c.craft === 'driver' || c.craft === 'burglar' || c.craft === 'muscle' || hasTrait(c, 'Ambitious'))),
  build: (s, c) => {
    const load = pick(s, HIJACK_LOADS);
    const worth = r100(load.worth * (0.8 + randInt(s, 0, 40) / 100));
    const r = rivalBy(s);
    const label = `${c.firstName}'s hijack tip`;
    const choices: Choice[] = [
      { id: 'go', label: 'Take the truck', detail: 'A dispatcher\'s tip, a quiet stretch of Route 9.', because: `took the truck on ${c.firstName}'s tip`, effects: [outcome('the truck on Route 9', label, { who: c.id, p: 0.6 + c.attributes.force / 500, win: r100(worth * 0.55), fed: 6, ev: 6, resp: 1, opWin: 6, good: `${c.firstName}'s crew took ${load.what} off Route 9 without a shot fired`, bad: `the driver on Route 9 had a shotgun and a radio; the State Police have ${c.firstName}'s plate` })] },
    ];
    if (r) choices.push({ id: 'sell', label: `Sell the tip to ${r.shortName} (${fmt(r100(worth * 0.12))})`, detail: 'Their risk, your money, their gratitude.', because: `sold ${c.firstName}'s hijack tip to ${r.shortName}`, effects: [{ type: 'money', amount: r100(worth * 0.12), label }, { type: 'rivalOpinion', rival: r.id, amount: 6, reason: 'Sold us a good tip', label }, opn(c.id, s.playerId, -6, 'Sold my tip to outsiders', label)] });
    choices.push({ id: 'pass', label: 'Too close to home', detail: 'Federal heat follows interstate loads.', because: `passed on ${c.firstName}'s hijack`, effects: [opn(c.id, s.playerId, -3, 'Passed on my tip', label)] });
    return make(s, 'pitch_hijack', c, `A truck on Route 9`,
      `${displayName(c)} drinks with a dispatcher at the Rio Grande truck stop who owes the wrong people. Thursday night, ${load.what} comes up Route 9 with one driver and no escort. "It's worth ${fmt(worth)} on the street. We take it at the light in Swainton."`,
      choices, 'go');
  },
};

const pitchInspector: CrewEventDef = {
  key: 'pitch_inspector',
  cooldown: COOL,
  weight: (s) => (s.businesses.some((b) => b.owner === 'player') ? 2.5 : 1),
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.craft === 'talker' || c.attributes.diplomacy >= 50 || c.rank === 'capo')),
  build: (s, c) => {
    const insp = makeCharacter(s, { rank: 'civilian', faction: 'none', nickname: false, age: randInt(s, 44, 61) });
    insp.office = 'Building inspector';
    const fee = r100(150 + randInt(s, 0, 150));
    const r = rivalBy(s);
    const label = `The inspector, ${insp.lastName}`;
    const choices: Choice[] = [
      { id: 'pay', label: `Put him on the pad (${fmt(fee)} a month, first month now)`, detail: 'Your places pass inspection; theirs might not.', because: `put inspector ${insp.lastName} on the pad`, effects: [{ type: 'money', amount: -fee, label }, { type: 'favor', amount: 1, label }, { type: 'heat', bar: 'local', amount: -3, label }, opn(insp.id, s.playerId, 10, 'Takes care of me', label)] },
    ];
    if (r) choices.push({ id: 'aim', label: `Point him at ${r.shortName}'s places (${fmt(fee * 2)})`, detail: 'Fire code, plumbing, a liquor license or two.', because: `sent inspector ${insp.lastName} after ${r.shortName}`, effects: [{ type: 'money', amount: -fee * 2, label }, { type: 'rivalResource', rival: r.id, money: -2500, label }, { type: 'rivalOpinion', rival: r.id, amount: -8, reason: 'Sicced a city inspector on us', label }] });
    choices.push({ id: 'no', label: 'Never trust a man who sells his signature', because: `turned down inspector ${insp.lastName}`, effects: [opn(c.id, s.playerId, -2, 'Ignored my contact', label), { type: 'schedule', key: 'cv_outcome', minWeeks: 2, maxWeeks: 6, chance: 0.25, hint: 'he may sell his signature to someone else', params: { who: c.id, p: 0, lose: -r100(fee * 3), good: '', bad: `inspector ${insp.lastName} found code violations at one of your places` }, label }] });
    return make(s, 'pitch_inspector', c, `${callName(c)} has a man at City Hall`,
      `${displayName(c)} plays pinochle with ${insp.firstName} ${insp.lastName}, the city building inspector, who has two daughters at Georgian Court and a salary that does not cover it. "${fmt(fee)} a month and he never finds anything wrong with our places. A little more and he finds plenty wrong with theirs."`,
      choices, 'pay', [insp.id]);
  },
};

const pitchJukebox: CrewEventDef = {
  key: 'pitch_jukebox',
  cooldown: COOL,
  weight: (s) => (mobRivals(s).length ? 2.5 : 0),
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.craft === 'muscle' || c.craft === 'collector' || hasTrait(c, 'Hot-headed') || c.rank === 'capo')),
  build: (s, c) => {
    const r = rivalBy(s)!;
    const street = pick(s, ['Pacific Avenue', 'the Boardwalk between Cedar and Schellenger', 'Rio Grande Avenue', 'Ocean Avenue in the Crest']);
    const n = randInt(s, 6, 14);
    const label = `The jukebox war on ${street}`;
    const d = s.districts[randInt(s, 0, s.districts.length - 1)];
    return make(s, 'pitch_jukebox', c, `Jukeboxes on ${street}`,
      `${r.shortName}'s vending company dropped ${n} new Seeburg jukeboxes on ${street} this week, in bars that have had your machines since Eisenhower. The owners say they were "persuaded." ${displayName(c)} wants to know how you want it answered.`,
      [
        { id: 'smash', label: 'Every one of their machines goes off the pier', detail: 'Loud, satisfying, noticed.', because: `threw ${r.shortName}'s jukeboxes off the pier`, effects: [{ type: 'heat', bar: 'local', amount: 4, label }, { type: 'respect', amount: 2, label }, { type: 'influence', district: d.id, faction: 'player', amount: 3, label }, { type: 'rivalOpinion', rival: r.id, amount: -12, reason: 'Threw our machines in the ocean', label }, opn(c.id, s.playerId, 6, 'Let me answer it', label), { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 4, chance: 0.35, hint: `${r.shortName} may answer`, params: { rival: r.id }, label }] },
        { id: 'buy', label: `Buy the bar owners back (${fmt(n * 60)})`, detail: 'A better split on the take, quietly.', because: `bought the ${street} bars back from ${r.shortName}`, effects: [{ type: 'money', amount: -n * 60, label }, { type: 'influence', district: d.id, faction: 'player', amount: 2, label }, { type: 'favor', amount: 1, label }] },
        { id: 'split', label: `Talk to ${leader(s, r)}: split the street`, detail: 'Half the street each. Nobody bleeds.', because: `split ${street} with ${r.shortName}`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: 8, reason: 'Split a street with us', label }, { type: 'respect', amount: -1, label }, opn(c.id, s.playerId, -4, 'Gave half our street away', label)] },
      ], 'buy', [r.leaderId]);
  },
};

const pitchContractor: CrewEventDef = {
  key: 'pitch_contractor',
  cooldown: COOL,
  weight: (s) => (s.money > 6000 ? 2.5 : 0.8),
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.craft === 'earner' || c.craft === 'collector' || c.attributes.business >= 50)),
  build: (s, c) => {
    const k = makeCharacter(s, { rank: 'civilian', faction: 'none', nickname: false, age: randInt(s, 38, 58) });
    k.office = 'Contractor';
    const job = pick(s, ['a forty-room motel with a kidney-shaped pool on Ocean Avenue', 'the new parish hall at Notre Dame de la Mer', 'a row of duplexes in the Crest', 'a Polynesian-themed restaurant with a volcano out front']);
    const need = r100(800 + randInt(s, 0, 800));
    const label = `${k.firstName} ${k.lastName}'s payroll`;
    return make(s, 'pitch_contractor', c, `A contractor in trouble`,
      `${k.firstName} ${k.lastName} is building ${job} and the bank in Cape May just pulled his line of credit. Friday he cannot make payroll; Monday the carpenters walk. ${displayName(c)} grew up with his brother. "He needs ${fmt(need)}. He'll pay points, or he'll give us a piece."`,
      [
        { id: 'loan', label: `Lend it at two points a week (${fmt(need)})`, detail: 'Most of it comes back, with interest.', because: `lent contractor ${k.lastName} his payroll`, effects: [{ type: 'money', amount: -need, label }, outcome('he pays it back', label, { who: c.id, p: 0.8, win: r100(need * 1.3), lose: 0, good: `${k.firstName} ${k.lastName} finished the job and paid back every dollar with the vig`, bad: `${k.firstName} ${k.lastName} went bankrupt anyway; the loan is a lien on a hole in the ground` }, 3, 6)] },
        { id: 'piece', label: `Take a piece of his company instead (${fmt(need)})`, detail: 'Legitimate paper, a place to wash money, a builder who owes you.', because: `bought into contractor ${k.lastName}'s company`, effects: [{ type: 'money', amount: -need, label }, { type: 'unwashed', amount: -Math.min(Math.max(0, s.unwashed), r100(need * 0.6)), label }, opn(k.id, s.playerId, 15, 'Saved my company', label, 0), outcome('the piece pays', label, { who: c.id, p: 0.7, win: r100(need * 1.6), good: `the piece of ${k.lastName}'s company paid its first real dividend`, bad: `${k.lastName}'s company limped along; the piece is worth what you paid, slowly` }, 4, 8)] },
        { id: 'no', label: 'Let the bank have him', because: `let contractor ${k.lastName} go under`, effects: [opn(c.id, s.playerId, -3, 'Let my friend sink', label)] },
      ], 'loan', [k.id]);
  },
};

const HORSES = ['Sea Biscuit\'s Nephew', 'Cape May Lady', 'Monsignor', 'Little Las Vegas', 'Boardwalk Angel', 'Pinochle Pete', 'Saltwater Taffy', 'Father\'s Day', 'Hot Tamale', 'Third Base Coach'];

const pitchHorse: CrewEventDef = {
  key: 'pitch_horse',
  cooldown: COOL,
  weight: () => 2.5,
  subjects: (s) => men(s).filter((c) => available(s, c) && (hasVice(c, 'horses') || hasTrait(c, 'Gambler') || c.craft === 'bookmaker')),
  build: (s, c) => {
    const horse = pick(s, HORSES);
    const track = summer(s) ? pick(s, ['Atlantic City Race Course', 'Garden State Park']) : pick(s, ['Bowie in Maryland', 'Hialeah, on the wire']);
    const stake = r100(500 + randInt(s, 0, 700));
    const odds = randInt(s, 5, 12);
    const label = `The horse, ${horse}`;
    const sucker = hasVice(c, 'horses');
    return make(s, 'pitch_horse', c, `A horse that can't lose`,
      `${displayName(c)} swears it: ${horse} runs in the sixth at ${track} on Saturday, ${odds} to 1, and the other jockeys have been taken care of. "${fmt(stake)} on his nose and we're all buying Cadillacs." ${sucker ? 'He has said this before. He has been wrong before.' : 'He does not usually say things like this.'}`,
      [
        { id: 'bet', label: `Put ${fmt(stake)} of the family's money on it`, detail: sucker ? 'He loves the horses. The horses do not love him back.' : 'Fixed races exist. So do stings.', because: `bet on ${c.firstName}'s horse`, effects: [{ type: 'money', amount: -stake, label }, outcome('the sixth race', label, { who: c.id, p: sucker ? 0.3 : 0.45, win: r100(stake * Math.min(odds, 7)), heat: 2, opWin: 8, opLose: -2, good: `${horse} won the sixth going away, and the windows paid`, bad: `${horse} finished fourth; somebody else took care of the other jockeys` }, 1, 1)] },
        { id: 'small', label: 'A hundred on his nose, for luck', because: `put a hundred on ${c.firstName}'s horse`, effects: [{ type: 'money', amount: -100, label }, outcome('the sixth race', label, { who: c.id, p: sucker ? 0.3 : 0.45, win: 100 * Math.min(odds, 7), good: `${horse} came in, and the hundred became a story`, bad: `${horse} ran like he was carrying the boardwalk` }, 1, 1)] },
        { id: 'warn', label: '"If it\'s fixed, somebody\'s watching it."', detail: 'Keeps him out of it, and you.', because: `kept ${c.firstName} away from his sure thing`, effects: [opn(c.id, s.playerId, sucker ? -6 : -2, 'Doubted my horse', label), ...(sucker ? [{ type: 'wealth', charId: c.id, amount: -Math.min(c.wealth, r100(stake / 2)), label } as Effect] : [])] },
      ], 'small');
  },
};

const pitchBookie: CrewEventDef = {
  key: 'pitch_bookie',
  cooldown: COOL,
  weight: () => 2,
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.craft === 'bookmaker' || c.craft === 'collector' || c.attributes.intrigue >= 50)),
  build: (s, c) => {
    const b = makeCharacter(s, { rank: 'civilian', faction: 'none', age: randInt(s, 35, 62) });
    b.office = 'Bookmaker';
    const skim = r100(800 + randInt(s, 0, 1600));
    const label = `${b.firstName} ${b.lastName}'s sheet`;
    return make(s, 'pitch_bookie', c, `A bookie skimming his own sheet`,
      `${displayName(c)} has been reading ${b.firstName} ${b.lastName}'s betting sheets against the wire. ${b.firstName} lays off half his action on the family's bank and books the winners and "forgets" the losers. Since spring it comes to about ${fmt(skim)}. ${b.firstName} has a sick wife and a boat he cannot afford.`,
      [
        { id: 'lean', label: `Make him pay it back (${fmt(skim)})`, detail: 'With a visit he will remember.', because: `made bookie ${b.lastName} pay back his skim`, effects: [{ type: 'money', amount: skim, label }, { type: 'heat', bar: 'local', amount: 2, label }, { type: 'meter', from: b.id, to: s.playerId, meter: 'fear', amount: 25, label }, opn(c.id, s.playerId, 4, 'Backed my numbers', label)] },
        { id: 'take', label: `Take his book away; ${c.firstName} runs it`, detail: 'Your man in his chair.', because: `gave ${b.lastName}'s book to ${c.firstName}`, effects: [{ type: 'wealth', charId: c.id, amount: r100(skim / 2), label }, opn(c.id, s.playerId, 10, 'Gave me a book of my own', label), { type: 'story', charId: c.id, text: `Caught ${b.firstName} ${b.lastName} skimming and took over his book.`, label }, { type: 'evidence', charId: c.id, amount: 3, label }] },
        { id: 'mercy', label: 'Let him keep the boat. Once.', detail: 'He knows you know.', because: `forgave bookie ${b.lastName} once`, effects: [opn(b.id, s.playerId, 20, 'Spared me', label, 0), { type: 'respect', amount: hasTrait(s.characters[s.playerId], 'Cruel') ? -1 : 1, label }] },
      ], 'lean', [b.id]);
  },
};

const pitchTurncoat: CrewEventDef = {
  key: 'pitch_turncoat',
  cooldown: COOL + 4,
  weight: (s) => (mobRivals(s).length && crew(s).length < 24 ? 2 : 0),
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.rank === 'capo' || c.rank === 'soldier')),
  build: (s, c) => {
    const r = rivalBy(s);
    if (!r) return undefined;
    const t = makeCharacter(s, { rank: 'soldier', faction: r.id, age: randInt(s, 24, 40) });
    const why = pick(s, [`${leader(s, r)} passed him over for his own nephew`, `his capo slapped him in front of his girl`, `${r.shortName} owes him two years of envelopes`, `he says ${r.shortName} is finished and he wants to be on the right side of it`]);
    const label = `${t.firstName} ${t.lastName} wants to switch`;
    return make(s, 'pitch_turncoat', c, `One of ${r.shortName}'s men wants to switch sides`,
      `${displayName(c)} brings a message from ${t.firstName} ${t.lastName}, one of ${r.shortName}'s soldiers: ${why}. He wants to come over, and he says he will bring what he knows. Men who switch once can switch twice.`,
      [
        { id: 'take', label: 'Take him in', detail: `${r.shortName} will take it personally. He could be a plant.`, because: `took in ${r.shortName}'s man ${t.firstName}`, effects: [{ type: 'recruit', charId: t.id, label }, { type: 'rivalOpinion', rival: r.id, amount: -12, reason: 'Took one of our men', label }, { type: 'rivalResource', rival: r.id, muscle: -3, label }, { type: 'schedule', key: 'recruit_rat', minWeeks: 4, maxWeeks: 8, chance: 0.15, hint: 'he may be a plant', params: { charId: t.id }, label }] },
        { id: 'pump', label: 'Let him talk, then send him home', detail: 'What he knows is worth more than he is.', because: `pumped ${r.shortName}'s man ${t.firstName} and sent him back`, effects: [{ type: 'rivalResource', rival: r.id, money: -2000, muscle: -2, label }, { type: 'respect', amount: 1, label }] },
        { id: 'return', label: `Send ${leader(s, r)} word: his man came knocking`, detail: 'Honor among thieves. Bad luck for him.', because: `told ${r.shortName} their man wanted out`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: 14, reason: 'Gave us back a rat', label }, { type: 'crewOpinion', amount: -2, reason: 'Gave a man up to his own people', traitMods: { 'Loyal-to-a-fault': 3, Cruel: 2 }, label }] },
      ], 'pump', [t.id, r.leaderId]);
  },
};

const pitchWidow: CrewEventDef = {
  key: 'pitch_widow',
  cooldown: COOL,
  weight: () => 2,
  subjects: (s) => men(s).filter((c) => available(s, c) && (hasTrait(c, 'Pious') || hasTrait(c, 'Honest') || hasTrait(c, 'Charming') || c.attributes.diplomacy >= 45)),
  build: (s, c) => {
    const eth = c.ethnicity;
    const w = makeCharacter(s, { gender: 'F', ethnicity: eth, rank: 'civilian', faction: 'none', nickname: false, age: randInt(s, 48, 72) });
    const trouble = pick(s, [
      { t: `her landlord on Taylor Avenue is putting her out so he can rent the place to summer people at four times the rent`, cost: 200 },
      { t: `the insurance company will not pay on her husband's policy because the coroner wrote "misadventure"`, cost: 350 },
      { t: `her son is in the county jail on a charge everybody on the block knows belongs to someone else`, cost: 300 },
      { t: `a man from Philadelphia sold her husband's boat out from under her with papers she never signed`, cost: 250 },
    ]);
    const label = `The widow ${w.lastName}`;
    return make(s, 'pitch_widow', c, `A widow asks for help`,
      `Mrs. ${w.firstName} ${w.lastName} comes to ${displayName(c)} because her late husband used to say ${c.firstName}'s people take care of things. ${trouble.t[0].toUpperCase()}${trouble.t.slice(1)}. She brought a tin of pizzelle and her husband's rosary, and she will not sit down.`,
      [
        { id: 'help', label: `Take care of it (${fmt(trouble.cost)})`, detail: 'The neighborhood will hear about it by Sunday.', because: `took care of the widow ${w.lastName}'s trouble`, effects: [{ type: 'money', amount: -trouble.cost, label }, { type: 'respect', amount: 2, label }, { type: 'heat', bar: 'local', amount: -2, label }, opn(c.id, s.playerId, 6, 'Helped the widow I brought', label), opn(w.id, s.playerId, 30, 'Helped me when nobody would', label, 0)] },
        { id: 'lean', label: 'Have someone visit whoever is doing this', detail: 'Cheaper. Louder.', because: `leaned on the widow ${w.lastName}'s problem`, effects: [{ type: 'respect', amount: 1, label }, { type: 'heat', bar: 'local', amount: 3, label }, opn(w.id, s.playerId, 20, 'Made them stop', label, 0)] },
        { id: 'priest', label: 'Send her to Father Callahan with a donation ($100)', because: `sent the widow ${w.lastName} to the parish`, effects: [{ type: 'money', amount: -100, label }, opn(c.id, s.playerId, -3, 'Passed the widow off', label)] },
      ], 'help', [w.id]);
  },
};

/* ------------------------------------------------------------------ */
/* Scores, the other ways                                              */
/* ------------------------------------------------------------------ */

const scoreHot: CrewEventDef = {
  key: 'score_hot',
  cooldown: COOL,
  weight: (s) => 2 + seasonMultiplier(s.date) / 2,
  subjects: (s) => men(s).filter((c) => available(s, c) && c.rank !== 'capo' && (c.craft === 'burglar' || c.craft === 'driver' || hasTrait(c, 'Greedy'))),
  build: (s, c) => {
    const goods = pick(s, ['forty mink stoles from a Walnut Street furrier', 'a crate of Bulova watches from a Camden warehouse', 'two hundred Smith-Corona typewriters', 'a safe from a Ventnor dentist that turned out to be full of Krugerrands']);
    const worth = r100(3000 + randInt(s, 0, 3000));
    const label = `${c.firstName}'s hot goods`;
    return make(s, 'score_hot', c, `${callName(c)} has something hot`,
      `${displayName(c)} has ${goods} in a garage off New Jersey Avenue. Street value ${fmt(worth)}, and every cop between here and Philadelphia has the list. He wants the family's fence, or the family's blessing to sit on it.`,
      [
        { id: 'fence', label: `Move it through the family's fence (${fmt(r100(worth * 0.45))} to you)`, detail: 'Fast money. The goods are on a list.', because: `fenced ${c.firstName}'s hot goods`, effects: [{ type: 'money', amount: r100(worth * 0.45), label }, { type: 'wealth', charId: c.id, amount: r100(worth * 0.2), label }, { type: 'heat', bar: 'federal', amount: 3, label }, { type: 'evidence', charId: c.id, amount: 4, label }] },
        { id: 'sit', label: 'Sit on it until winter', detail: 'Worth less later, much safer.', because: `told ${c.firstName} to sit on the goods`, effects: [outcome('the goods cool off', label, { who: c.id, p: 0.75, win: r100(worth * 0.35), fed: 3, good: `${c.firstName}'s goods cooled off and moved quietly`, bad: `a neighbor noticed the garage and called it in` }, 5, 8)] },
        { id: 'dump', label: 'Into the bay with it', detail: 'Nobody goes to prison for something at the bottom of the bay.', because: `had ${c.firstName}'s hot goods dumped`, effects: [opn(c.id, s.playerId, -8, 'Threw my score in the bay', label), { type: 'evidence', charId: c.id, amount: -3, label }] },
      ], 'fence');
  },
};

const scoreWelsh: CrewEventDef = {
  key: 'score_welsh',
  cooldown: COOL,
  weight: (s) => (mobRivals(s).length ? 2 : 0),
  subjects: (s) => men(s).filter((c) => available(s, c) && (hasTrait(c, 'Gambler') || hasVice(c, 'horses') || hasVice(c, 'cards') || c.craft === 'bookmaker')),
  build: (s, c) => {
    const r = rivalBy(s)!;
    const owed = r100(1500 + randInt(s, 0, 3000));
    const label = `${r.shortName} won't pay ${c.firstName}`;
    return make(s, 'score_welsh', c, `${r.shortName}'s book won't pay`,
      `${displayName(c)} hit a four-team parlay at one of ${r.shortName}'s books: ${fmt(owed)}. Now they say the ticket was written after the first game started. ${c.firstName} wants to know if the family is going to let ${leader(s, r)} welsh on one of its men.`,
      [
        { id: 'collect', label: 'Collect it, with interest', detail: 'Your man gets paid. They remember how.', because: `collected ${c.firstName}'s parlay from ${r.shortName}`, effects: [{ type: 'wealth', charId: c.id, amount: owed, label }, { type: 'money', amount: r100(owed * 0.3), label }, { type: 'rivalOpinion', rival: r.id, amount: -10, reason: 'Collected by force', label }, { type: 'heat', bar: 'local', amount: 3, label }, opn(c.id, s.playerId, 10, 'Got me paid', label), { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 5, chance: 0.3, hint: `${r.shortName} may answer`, params: { rival: r.id }, label }] },
        { id: 'half', label: 'Take half and a handshake', because: `settled ${c.firstName}'s parlay at half`, effects: [{ type: 'wealth', charId: c.id, amount: r100(owed / 2), label }, { type: 'rivalOpinion', rival: r.id, amount: 4, reason: 'Was reasonable about a ticket', label }, opn(c.id, s.playerId, -3, 'Settled my ticket for half', label)] },
        { id: 'drop', label: 'Tell him to stop betting with the competition', because: `told ${c.firstName} to eat his parlay`, effects: [opn(c.id, s.playerId, -8, 'Let them welsh on me', label), { type: 'respect', amount: -1, label }] },
      ], 'collect', [r.leaderId]);
  },
};

const scoreFlash: CrewEventDef = {
  key: 'score_flash',
  cooldown: COOL,
  weight: () => 2,
  subjects: (s) => men(s).filter((c) => available(s, c) && c.wealth >= 3000 && (hasTrait(c, 'Greedy') || hasTrait(c, 'Ambitious') || hasTrait(c, 'Womanizer') || c.wealth >= 9000)),
  build: (s, c) => {
    const toy = pick(s, ['a white Cadillac Coupe de Ville with the fins', 'a thirty-foot Chris-Craft he named after his mother', 'a camel-hair coat and a diamond pinky ring the size of a Chiclet', 'a split-level in Cape May Court House with a two-car garage']);
    const label = `${c.firstName}'s new toy`;
    return make(s, 'score_flash', c, `Where'd ${c.firstName} get the money?`,
      `${displayName(c)} is officially a ${pick(s, ['bartender', 'cab dispatcher', 'linoleum salesman', 'lifeguard captain'])} who makes ninety dollars a week. This week he bought ${toy}. Everyone on the block has noticed. So has the man from the IRS who rents a room on Pine Avenue for the summer.`,
      [
        { id: 'sell', label: 'Make him sell it back', detail: 'He hates you for a while. The IRS man finds nothing.', because: `made ${c.firstName} sell his new toy`, effects: [opn(c.id, s.playerId, -10, 'Made me sell it', label), { type: 'evidence', charId: c.id, amount: -5, label }, { type: 'heat', bar: 'federal', amount: -2, label }] },
        { id: 'tax', label: 'He can keep it. The family takes a tax.', detail: 'A tenth of what he spent.', because: `taxed ${c.firstName}'s new toy`, effects: [{ type: 'wealth', charId: c.id, amount: -r100(c.wealth * 0.15), label }, { type: 'money', amount: r100(c.wealth * 0.15), label }, { type: 'heat', bar: 'federal', amount: 2, label }, { type: 'evidence', charId: c.id, amount: 4, label }] },
        { id: 'paper', label: 'Paper it: a loan from the family\'s bank ($200)', detail: 'Now it is a car payment, not a confession.', because: `papered ${c.firstName}'s purchase`, effects: [{ type: 'money', amount: -200, label }, { type: 'evidence', charId: c.id, amount: -2, label }, opn(c.id, s.playerId, 4, 'Covered for me', label)] },
      ], 'paper');
  },
};

/* ------------------------------------------------------------------ */
/* Brawls and mouths                                                   */
/* ------------------------------------------------------------------ */

const beefJoke: CrewEventDef = {
  key: 'beef_joke',
  cooldown: COOL,
  weight: (s) => (mobRivals(s).length ? 2.5 : 0),
  subjects: (s) => men(s).filter((c) => available(s, c) && (hasTrait(c, 'Charming') || hasVice(c, 'booze') || hasTrait(c, 'Drinker') || hasTrait(c, 'Hot-headed'))),
  build: (s, c) => {
    const r = rivalBy(s)!;
    const joke = pick(s, [`${leader(s, r)}'s toupee and a seagull`, `${leader(s, r)}'s wife and the bandleader at the Starlight`, `how ${r.shortName} counts money (with his fingers, and then his toes)`, `${leader(s, r)}'s mother's lasagna`]);
    const label = `${c.firstName}'s joke`;
    return make(s, 'beef_joke', c, `${callName(c)} told a joke`,
      `At the bar of the Bolero on Saturday, after the second show, ${displayName(c)} told a joke about ${joke}. It killed. Somebody repeated it in Atlantic City by Monday, and now ${leader(s, r)} wants an apology in person — or something else.`,
      [
        { id: 'apology', label: 'He apologizes, in person, with a bottle', detail: 'Swallow it. It is just a joke.', because: `made ${c.firstName} apologize for his joke`, effects: [{ type: 'money', amount: -150, label }, { type: 'rivalOpinion', rival: r.id, amount: 8, reason: 'Apologized for the joke', label }, opn(c.id, s.playerId, -6, 'Made me apologize for a joke', label)] },
        { id: 'laugh', label: `"Tell ${r.shortName} it was a good joke."`, detail: 'The whole Shore will be telling it by Friday.', because: `stood behind ${c.firstName}'s joke`, effects: [{ type: 'respect', amount: 1, label }, { type: 'rivalOpinion', rival: r.id, amount: -10, reason: 'Laughed at us', label }, opn(c.id, s.playerId, 6, 'Backed me', label), { type: 'schedule', key: 'retaliation', minWeeks: 2, maxWeeks: 6, chance: 0.2, hint: `${r.shortName} has no sense of humor`, params: { rival: r.id }, label }] },
        { id: 'you', label: 'Apologize yourself, man to man', detail: 'It costs you a little face and buys a lot of calm.', because: `apologized to ${r.shortName} for ${c.firstName}'s joke`, effects: [{ type: 'respect', amount: -1, label }, { type: 'rivalOpinion', rival: r.id, amount: 14, reason: 'The boss himself apologized', label }, opn(c.id, s.playerId, 3, 'Covered for me', label)] },
      ], 'apology', [r.leaderId]);
  },
};

const beefTown: CrewEventDef = {
  key: 'beef_town',
  cooldown: COOL,
  weight: () => 2,
  subjects: (s) => men(s).filter((c) => available(s, c) && (hasTrait(c, 'Hot-headed') || hasTrait(c, 'Cruel') || c.craft === 'muscle')),
  build: (s, c) => {
    const who = pick(s, [
      { t: 'a Beach Patrol lifeguard who whistled at his sister', where: 'on the beach at Schellenger Avenue, in front of three hundred tourists' },
      { t: 'a councilman\'s brother-in-law over a parking space', where: 'in the Acme lot on Rio Grande' },
      { t: 'a sailor from the Cape May base over a girl who, it turns out, was with neither of them', where: 'outside the Riptide at closing' },
      { t: 'a Philadelphia dentist who would not stop talking during the Phillies game', where: 'at the bar of the Shamrock' },
    ]);
    const label = `${c.firstName}'s fight`;
    return make(s, 'beef_town', c, `${callName(c)} hit a civilian`,
      `${displayName(c)} put ${who.t} on the ground ${who.where}. Witnesses, a broken jaw, and a story in the Leader by Thursday unless somebody makes it go away.`,
      [
        { id: 'pay', label: 'Pay the hospital, the lawyer and the paper ($500)', because: `paid to bury ${c.firstName}'s fight`, effects: [{ type: 'money', amount: -500, label }, { type: 'heat', bar: 'local', amount: -2, label }, opn(c.id, s.playerId, 5, 'Cleaned up after me', label)] },
        { id: 'docked', label: 'He pays, out of his own pocket', detail: 'And he apologizes to the family.', because: `made ${c.firstName} pay for his fight`, effects: [{ type: 'wealth', charId: c.id, amount: -Math.min(c.wealth, 500), label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 8, label }, opn(c.id, s.playerId, -5, 'Made me pay for it', label)] },
        { id: 'nothing', label: 'Let it blow over', detail: 'It might not.', because: `let ${c.firstName}'s fight blow over`, effects: [{ type: 'heat', bar: 'local', amount: 5, label }, { type: 'evidence', charId: c.id, amount: 4, label }, { type: 'respect', amount: -1, label }] },
      ], 'pay');
  },
};

/* ------------------------------------------------------------------ */
/* Sponsors and newcomers                                              */
/* ------------------------------------------------------------------ */

const vouchVeteran: CrewEventDef = {
  key: 'vouch_veteran',
  cooldown: COOL + 4,
  weight: (s) => (crew(s).length < 22 ? 2 : 0),
  subjects: (s) => capos(s).filter((c) => available(s, c, 8)),
  build: (s, k) => {
    const n = makeCharacter(s, { rank: 'civilian', faction: 'none', age: randInt(s, 26, 34) });
    const past = pick(s, ['came home from Korea with a Bronze Star and no job', 'was a Golden Gloves light-heavyweight out of South Philly', 'ran numbers for his uncle in Camden since he was twelve', 'drove an ambulance in Atlantic City and knows every back road in the county']);
    const label = `${k.firstName}'s new man ${n.firstName}`;
    return make(s, 'vouch_veteran', k, `${callName(k)} has a kid for you`,
      `${displayName(k)} wants to bring in ${n.firstName} ${n.lastName}, who ${past}. "He's quiet, he's tough, and he doesn't drink. I'd stand for him." Father Callahan says the same, which is either a recommendation or a warning.`,
      [
        { id: 'in', label: `Bring ${n.firstName} in under ${k.firstName}`, because: `took in ${n.firstName} ${n.lastName} on ${k.firstName}'s word`, effects: [{ type: 'recruit', charId: n.id, label }, { type: 'assign', charId: n.id, capoId: k.id, label }, opn(k.id, s.playerId, 5, 'Trusted my judgment', label), { type: 'schedule', key: 'recruit_test', minWeeks: 3, maxWeeks: 8, chance: 0.6, hint: 'how he holds up when it counts', params: { charId: n.id }, label }] },
        { id: 'check', label: 'Have him looked into first ($300)', because: `had ${n.firstName} ${n.lastName} looked into`, effects: [{ type: 'money', amount: -300, label }, { type: 'recruit', charId: n.id, label }, { type: 'assign', charId: n.id, capoId: k.id, label }, { type: 'checkBackground', charId: n.id, label }] },
        { id: 'no', label: 'Not this year', because: `turned down ${k.firstName}'s kid`, effects: [opn(k.id, s.playerId, -4, 'Turned my guy away', label)] },
      ], 'in', [n.id]);
  },
};

const vouchNephew: CrewEventDef = {
  key: 'vouch_nephew',
  cooldown: COOL + 4,
  weight: () => 2,
  subjects: (s) => crew(s).filter((c) => (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere') && available(s, c, 8)),
  build: (s, k) => {
    const nm = pick(s, MALE_FIRST[k.ethnicity]);
    const what = pick(s, [
      { t: `wants his nephew ${nm} put on as night manager at one of the family's places`, cost: 0, good: 'He shows up. Mostly.' },
      { t: `wants his sister's boy ${nm} given a summer job counting at the policy bank`, cost: 0, good: 'He can count. Whether he can keep quiet is another matter.' },
      { t: `wants the family to pay for his nephew ${nm}'s first year at Rutgers`, cost: 600, good: 'A lawyer in the family someday.' },
    ]);
    const label = `${k.firstName}'s nephew ${nm}`;
    return make(s, 'vouch_nephew', k, `${callName(k)}'s nephew`,
      `${displayName(k)} ${what.t}. ${what.good} The other capos will notice whose nephews get looked after.`,
      [
        { id: 'yes', label: what.cost ? `Pay for it (${fmt(what.cost)})` : 'Give the kid the job', because: `looked after ${k.firstName}'s nephew`, effects: [...(what.cost ? [{ type: 'money', amount: -what.cost, label } as Effect] : [{ type: 'money', amount: -100, label } as Effect]), opn(k.id, s.playerId, 12, 'Looked after my nephew', label), { type: 'crewOpinion', amount: -1, reason: 'Capos\' nephews get the soft jobs', traitMods: { Ambitious: -2 }, label }] },
        { id: 'earn', label: 'He can start at the bottom like everyone', because: `told ${k.firstName}'s nephew to start at the bottom`, effects: [opn(k.id, s.playerId, -4, 'Would not help my nephew', label), { type: 'crewOpinion', amount: 1, reason: 'No favorites', traitMods: { Honest: 2 }, label }] },
      ], 'yes');
  },
};

/* ------------------------------------------------------------------ */
/* Disputes: other things two men fight about                          */
/* ------------------------------------------------------------------ */

function pairFor(s: GameState, key: string): [Character, Character] | undefined {
  const pool = shuffle(s, men(s).filter((c) => available(s, c, 4) && c.rank !== 'associate' && subjectOk(s, key, c.id)));
  let best: [Character, Character] | undefined;
  let worst = 20;
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const v = opinion(s, pool[i].id, pool[j].id) + opinion(s, pool[j].id, pool[i].id);
    if (v < worst) {
      worst = v;
      best = [pool[i], pool[j]];
    }
  }
  return best ?? (pool.length >= 2 ? [pool[0], pool[1]] : undefined);
}

function pairDispute(key: string, title: (a: Character, b: Character) => string, text: (s: GameState, a: Character, b: Character) => string, what: string, family?: { label: string; money: number }): CrewEventDef {
  return {
    key,
    cooldown: COOL,
    weight: () => 2,
    subjects: (s) => {
      const p = pairFor(s, key);
      return p ? [p[0]] : [];
    },
    build: (s, a) => {
      const p = pairFor(s, key);
      if (!p) return undefined;
      const b = p[0].id === a.id ? p[1] : p[0];
      const label = `${a.firstName} and ${b.firstName}: ${what}`;
      const side = (w: Character, l: Character): Effect[] => [
        opn(w.id, s.playerId, 7, 'Ruled for me', label), opn(l.id, s.playerId, -10, 'Ruled against me', label), opn(l.id, w.id, -8, `Got his way about ${what}`, label),
        { type: 'story', charId: w.id, text: `The boss sided with him against ${displayName(l)} about ${what}.`, label },
      ];
      const choices: Choice[] = [
        { id: 'a', label: `Side with ${a.firstName}`, because: `sided with ${a.firstName} against ${b.firstName} about ${what}`, effects: side(a, b) },
        { id: 'b', label: `Side with ${b.firstName}`, because: `sided with ${b.firstName} against ${a.firstName} about ${what}`, effects: side(b, a) },
        { id: 'both', label: 'Sit them down together over dinner ($200)', detail: 'A dinner at Zaberer\'s and a handshake. It may even hold.', because: `made ${a.firstName} and ${b.firstName} shake hands`, effects: [{ type: 'money', amount: -200, label }, opn(a.id, b.id, 6, 'Shook hands at the boss\'s table', label), opn(b.id, a.id, 6, 'Shook hands at the boss\'s table', label)] },
      ];
      if (family) choices.push({ id: 'family', label: family.label, because: `settled ${a.firstName} and ${b.firstName}'s fight the family's way`, effects: [{ type: 'money', amount: family.money, label }, opn(a.id, s.playerId, -6, 'Took it from both of us', label), opn(b.id, s.playerId, -6, 'Took it from both of us', label)] });
      const ev = make(s, key, a, title(a, b), text(s, a, b), choices, 'both', [b.id]);
      ev.meta = { ...ev.meta, pair: 1 };
      return ev;
    },
  };
}

const disputeCar = pairDispute('dispute_car', (a, b) => `${callName(a)} wrecked ${b.firstName}'s car`,
  (s, a, b) => `${displayName(a)} borrowed ${displayName(b)}'s ${pick(s, ['new Bonneville', 'two-tone Bel Air', 'Lincoln with the suicide doors'])} "for an hour" and put it into a piling at the end of ${pick(s, ['Spencer Avenue', 'the Rio Grande bridge', 'Hunt\'s Pier'])}. ${b.firstName} wants a new car. ${a.firstName} says the brakes were already gone.`, 'the wrecked car');

const disputeCredit = pairDispute('dispute_credit', () => `Whose score was it?`,
  (_s, a, b) => `Philadelphia heard about last month's big score and asked who did it. ${displayName(a)} says it was his idea; ${displayName(b)} says he did the work. Whoever gets the credit gets remembered when the books open.`, 'the credit', { label: 'Neither: the family takes the credit', money: 300 });

const disputeWaitress = pairDispute('dispute_waitress', (a, b) => `${a.firstName}, ${b.firstName} and the waitress`,
  (s, a, b) => `${displayName(a)} and ${displayName(b)} have both been sweet on ${pick(s, FEMALE_FIRST.Irish)}, who waits tables at the Shamrock, and it has come to shoving in the parking lot. She has told both of them, more than once, that she is not anybody's prize. They want you to decide. It is not yours to decide.`, 'the waitress');

const disputeDebt = pairDispute('dispute_debt', (a, b) => `${a.firstName} owes ${b.firstName}`,
  (s, a, b) => `${displayName(b)} says ${displayName(a)} has owed him ${fmt(r100(300 + randInt(s, 0, 900)))} since the Fourth of July, and ${a.firstName} just bought rounds for the whole bar at the Riptide. ${a.firstName} says it was a gift, not a loan.`, 'an old debt', { label: 'The family pays it and both men owe the family', money: -400 });

/* ------------------------------------------------------------------ */
/* Life: the things a man's family asks of the boss                    */
/* ------------------------------------------------------------------ */

const lifeAnniversary: CrewEventDef = {
  key: 'life_anniversary',
  cooldown: COOL,
  weight: () => 2,
  subjects: (s) => men(s).filter((c) => available(s, c) && !!c.household?.wife && ageOn(c.birth, s.date) >= 30),
  build: (s, c) => {
    const w = c.household!.wife!;
    const years = Math.max(5, Math.min(30, ageOn(c.birth, s.date) - 23));
    const label = `${c.firstName}'s anniversary`;
    return make(s, 'life_anniversary', c, `${callName(c)} forgot his anniversary`,
      `It was ${c.firstName} and ${w}'s ${years}th anniversary on Tuesday. He spent it in a car outside a warehouse in Rio Grande because the family needed him there, and he forgot to call. ${w} has gone to her sister's in Villas with the good china. ${c.firstName} is sleeping at the club and asks, embarrassed, if the boss could do something.`,
      [
        { id: 'dinner', label: 'Dinner for two at Zaberer\'s and roses, from you ($150)', detail: 'A card in the boss\'s hand: "It was my fault."', because: `took the blame for ${c.firstName}'s forgotten anniversary`, effects: [{ type: 'money', amount: -150, label }, opn(c.id, s.playerId, 12, 'Saved my marriage', label), { type: 'meter', from: c.id, to: s.playerId, meter: 'trust', amount: 8, label }] },
        { id: 'week', label: 'Give him the week off, with pay ($150)', detail: 'His crew picks up the slack.', because: `gave ${c.firstName} a week off for his wife`, effects: [{ type: 'money', amount: -150, label }, opn(c.id, s.playerId, 8, 'Gave me time for my wife', label)] },
        { id: 'life', label: '"She knew who she married."', because: `told ${c.firstName} his wife knew who she married`, effects: [opn(c.id, s.playerId, -6, 'Laughed at my trouble at home', label)] },
      ], 'dinner');
  },
};

const lifeCommunion: CrewEventDef = {
  key: 'life_communion',
  cooldown: COOL,
  weight: (s) => ([4, 5].includes(s.date.m) ? 3 : 0.6),
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.household?.kids ?? []).some((k) => s.date.y - k.born >= 7 && s.date.y - k.born <= 9)),
  build: (s, c) => {
    const kid = c.household!.kids.find((k) => s.date.y - k.born >= 7 && s.date.y - k.born <= 9)!;
    const label = `${kid.name}'s First Communion`;
    return make(s, 'life_communion', c, `${kid.name}'s First Communion`,
      `${displayName(c)}'s ${kid.male ? 'boy' : 'girl'} ${kid.name} makes First Communion at St. Ann's on Sunday, ${kid.male ? 'in a white suit he hates' : 'in a veil her grandmother sewed'}. The party is in the backyard on ${pick(s, ['Burk Avenue', 'Hand Avenue', 'Garfield Avenue'])}. ${c.firstName} would never ask. His wife asked.`,
      [
        { id: 'go', label: 'Go, with an envelope for the child ($100)', detail: 'An hour in a backyard is worth a year of loyalty.', because: `went to ${kid.name}'s First Communion`, effects: [{ type: 'money', amount: -100, label }, opn(c.id, s.playerId, 10, `Came to ${kid.name}'s Communion`, label), { type: 'respect', amount: 1, label }] },
        { id: 'send', label: 'Send a rosary and a card', because: `sent ${kid.name} a rosary`, effects: [{ type: 'money', amount: -30, label }, opn(c.id, s.playerId, 3, 'Remembered my kid', label)] },
        { id: 'busy', label: 'Too much going on this week', because: `missed ${kid.name}'s First Communion`, effects: [opn(c.id, s.playerId, -4, 'Missed my kid\'s Communion', label)] },
      ], 'go');
  },
};

const lifeMother: CrewEventDef = {
  key: 'life_wake',
  cooldown: COOL,
  weight: () => 1.6,
  subjects: (s) => men(s).filter((c) => available(s, c) && ageOn(c.birth, s.date) >= 28),
  build: (s, c) => {
    const who = pick(s, ['mother', 'father', 'older brother', 'grandmother who raised him']);
    const home = c.ethnicity === 'Jewish' ? 'the shiva at his sister\'s house in Margate' : c.ethnicity === 'Irish' ? 'the wake at Gilmartin\'s on Pacific Avenue' : 'the wake at Pagano\'s funeral home';
    const label = `${c.firstName}'s ${who}`;
    return make(s, 'life_wake', c, `${callName(c)} lost his ${who}`,
      `${displayName(c)}'s ${who} died on Thursday. ${home[0].toUpperCase()}${home.slice(1)} is Saturday night, and every man in the family will see who comes, who stays, and who sends flowers with a card that says nothing.`,
      [
        { id: 'stay', label: 'Go, and stay late ($150 for the flowers and the family)', because: `stood with ${c.firstName} at his ${who}'s wake`, effects: [{ type: 'money', amount: -150, label }, opn(c.id, s.playerId, 14, `Stood with me when my ${who} died`, label, 0), { type: 'crewOpinion', amount: 1, reason: 'The boss comes to our wakes', label }] },
        { id: 'flowers', label: 'Send a big wreath ($120)', because: `sent flowers for ${c.firstName}'s ${who}`, effects: [{ type: 'money', amount: -120, label }, opn(c.id, s.playerId, 3, 'Sent flowers', label)] },
        { id: 'skip', label: 'You cannot be seen everywhere', detail: 'County detectives photograph wakes.', because: `stayed away from ${c.firstName}'s ${who}'s wake`, effects: [opn(c.id, s.playerId, -8, `Did not come for my ${who}`, label), { type: 'heat', bar: 'federal', amount: -1, label }] },
      ], 'stay');
  },
};

const lifeHouse: CrewEventDef = {
  key: 'life_house',
  cooldown: COOL,
  weight: () => 1.6,
  subjects: (s) => men(s).filter((c) => available(s, c) && !!c.household?.wife && c.wealth >= 2500),
  build: (s, c) => {
    const where = pick(s, ['a Cape Cod in Cape May Court House', 'a brick twin in North Wildwood near the lighthouse', 'a split-level in the Crest with a carport', 'a bayfront bungalow in West Wildwood']);
    const label = `${c.firstName}'s house`;
    return make(s, 'life_house', c, `${callName(c)} wants to buy a house`,
      `${displayName(c)} and ${c.household!.wife} want ${where}. The bank wants pay stubs, tax returns and a reason a ${pick(s, ['bartender', 'truck driver', 'cigarette-machine repairman'])} has ${fmt(c.wealth)} in cash. He asks if the family can put him on the books somewhere, or co-sign.`,
      [
        { id: 'books', label: 'Put him on the books at one of your places', detail: 'Pay stubs, withholding, a real job title. Clean.', because: `put ${c.firstName} on the books for his mortgage`, effects: [{ type: 'money', amount: -150, label }, { type: 'evidence', charId: c.id, amount: -4, label }, opn(c.id, s.playerId, 10, 'Got me my house', label, 0), { type: 'story', charId: c.id, text: `Bought ${where} with the boss's help.`, label }] },
        { id: 'cash', label: 'Tell him to buy it cash through a cousin', detail: 'Fast. The IRS loves a cash house.', because: `told ${c.firstName} to buy his house in cash`, effects: [{ type: 'wealth', charId: c.id, amount: -2000, label }, { type: 'heat', bar: 'federal', amount: 2, label }, { type: 'evidence', charId: c.id, amount: 3, label }, opn(c.id, s.playerId, 3, 'Let me buy my house', label)] },
        { id: 'wait', label: 'Not this year', because: `told ${c.firstName} to wait on the house`, effects: [opn(c.id, s.playerId, -5, 'Stood between me and my house', label)] },
      ], 'books');
  },
};

/* ------------------------------------------------------------------ */
/* Kids                                                                */
/* ------------------------------------------------------------------ */

const kidDraft: CrewEventDef = {
  key: 'kid_draft',
  cooldown: COOL,
  weight: () => 1.8,
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.household?.kids ?? []).some((k) => k.male && s.date.y - k.born >= 18 && s.date.y - k.born <= 24)),
  build: (s, c) => {
    const kid = c.household!.kids.find((k) => k.male && s.date.y - k.born >= 18 && s.date.y - k.born <= 24)!;
    const label = `${kid.name}'s draft notice`;
    return make(s, 'kid_draft', c, `${kid.name} got his draft notice`,
      `${displayName(c)}'s son ${kid.name} got his letter from the Selective Service. ${c.household?.wife ?? 'His mother'} has not stopped crying. ${c.firstName} knows the family has a friend on the county draft board. He also knows his own father served.`,
      [
        { id: 'fix', label: 'A word with the draft board ($500)', detail: 'A deferment. A favor called in. A record somewhere.', because: `fixed ${kid.name}'s draft notice`, effects: [{ type: 'money', amount: -500, label }, { type: 'favor', amount: -1, label }, { type: 'heat', bar: 'federal', amount: 2, label }, opn(c.id, s.playerId, 14, 'Kept my boy home', label, 0)] },
        { id: 'guard', label: 'Get him into the National Guard instead ($300)', detail: 'Weekends at Sea Girt. Everybody saves face.', because: `got ${kid.name} into the Guard`, effects: [{ type: 'money', amount: -300, label }, opn(c.id, s.playerId, 8, 'Found my boy a way', label)] },
        { id: 'serve', label: '"Let him serve. It will make a man of him."', because: `let ${kid.name} be drafted`, effects: [opn(c.id, s.playerId, hasTrait(c, 'Pious') || hasTrait(c, 'Honest') ? 2 : -6, 'Let my boy go', label), { type: 'respect', amount: 1, label }] },
      ], 'guard');
  },
};

const kidBand: CrewEventDef = {
  key: 'kid_band',
  cooldown: COOL,
  weight: (s) => (s.date.y >= 1961 || summer(s) ? 1.6 : 0.5),
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.household?.kids ?? []).some((k) => s.date.y - k.born >= 15 && s.date.y - k.born <= 21)),
  build: (s, c) => {
    const kid = c.household!.kids.find((k) => s.date.y - k.born >= 15 && s.date.y - k.born <= 21)!;
    const band = pick(s, ['the Sandcastles', 'the Riptides', 'Johnny Neptune and the Tidewaters', 'the Four Lifeguards', 'the Twistin\' Saints']);
    const label = `${kid.name}'s band`;
    return make(s, 'kid_band', c, `${kid.name}'s band wants a gig`,
      `${displayName(c)}'s ${kid.male ? 'son' : 'daughter'} ${kid.name} sings with ${band}, four kids from Wildwood High who practice in a garage on Baker Avenue and are, against all odds, good. They want one Saturday night at a real club. ${c.firstName} pretends it embarrasses him.`,
      [
        { id: 'gig', label: 'Give them a Saturday at one of your clubs', detail: 'A full room of their friends. Maybe a man from a record label.', because: `booked ${band} for a Saturday`, effects: [{ type: 'money', amount: summer(s) ? 300 : -100, label }, opn(c.id, s.playerId, 9, 'Gave my kid a stage', label), { type: 'respect', amount: 1, label }] },
        { id: 'record', label: 'Pay for a session at a Philadelphia studio ($300)', detail: 'A real 45 with their name on it.', because: `paid for ${band} to cut a record`, effects: [{ type: 'money', amount: -300, label }, opn(c.id, s.playerId, 12, 'Made my kid a record', label), outcome('the record', label, { who: c.id, p: 0.15, win: 2500, resp: 2, good: `${band}'s 45 got played on Philadelphia radio, and the family owns the publishing`, bad: `${band}'s 45 sold forty copies, thirty of them to their mothers` }, 4, 8)] },
        { id: 'no', label: '"Rock and roll is a fad. Tell the kid to learn a trade."', detail: 'He is relieved, sort of.', because: `turned down ${kid.name}'s band`, effects: [opn(c.id, s.playerId, -2, 'Laughed at my kid', label)] },
      ], 'gig');
  },
};

/* ------------------------------------------------------------------ */
/* The law                                                             */
/* ------------------------------------------------------------------ */

const lawTrooper: CrewEventDef = {
  key: 'law_trooper',
  cooldown: COOL,
  weight: (s) => 0.8 + s.heat.local / 60,
  subjects: (s) => men(s).filter((c) => available(s, c) && c.rank !== 'capo' && (c.craft === 'driver' || c.craft === 'collector' || c.craft === 'bookmaker')),
  build: (s, c) => {
    const cash = r100(4000 + randInt(s, 0, 5000));
    const label = `${c.firstName} and the trooper`;
    return make(s, 'law_trooper', c, `${callName(c)} got stopped on the Parkway`,
      `A State Trooper stopped ${displayName(c)} for a taillight at mile marker 4 and found ${fmt(cash)} of the family's collections in the spare-tire well. The trooper has not written anything down yet. He is holding ${c.firstName}'s license and looking at his watch.`,
      [
        { id: 'half', label: `The trooper keeps a tenth of it (${fmt(r100(cash / 10))})`, detail: 'A new friend in the State Police. Or a man who comes back for more.', because: `let a trooper keep a piece of the collections`, effects: [{ type: 'money', amount: -r100(cash / 10), label }, outcome('the trooper', label, { who: c.id, p: 0.7, win: 0, good: 'the trooper turned out to be a reasonable man with a boat payment', bad: 'the trooper came back the next month with a partner', lose: -r100(cash / 10) }, 3, 8)] },
        { id: 'lawyer', label: 'Let him write it up. The lawyer handles it.', detail: 'Seized cash, a court date, and his name in a file.', because: `let the trooper seize the collections`, effects: [{ type: 'money', amount: -r100(cash * 0.2), label: `${label}: the lawyer's fee and what the court kept` }, { type: 'evidence', charId: c.id, amount: 6, label }, { type: 'heat', bar: 'local', amount: 3, label }] },
      ], 'half');
  },
};

const lawSubpoena: CrewEventDef = {
  key: 'law_subpoena',
  cooldown: COOL + 4,
  weight: (s) => 0.8 + s.heat.federal / 30,
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.evidence ?? 0) >= 15).sort((a, b) => (b.evidence ?? 0) - (a.evidence ?? 0)).slice(0, 3),
  build: (s, c) => {
    const label = `${c.firstName}'s subpoena`;
    return make(s, 'law_subpoena', c, `${callName(c)} has a subpoena`,
      `A federal marshal handed ${displayName(c)} a subpoena outside Mass: a grand jury in Camden, three weeks from Monday. The questions will be about the family. ${hasTrait(c, 'Cowardly') ? 'He has not slept since.' : 'He says he will take the Fifth on his mother\'s name.'}`,
      [
        { id: 'fifth', label: 'A good lawyer and the Fifth ($700)', because: `got ${c.firstName} a lawyer for the grand jury`, effects: [{ type: 'money', amount: -700, label }, opn(c.id, s.playerId, 8, 'Stood behind me', label), { type: 'schedule', key: 'stand_up', minWeeks: 3, maxWeeks: 4, chance: 1, hint: 'will he stand up?', params: { charId: c.id, help: 2 }, label }] },
        { id: 'florida', label: 'Send him to Florida until it passes ($900)', detail: 'A man who cannot be found cannot testify. The Feds notice.', because: `sent ${c.firstName} to Florida`, effects: [{ type: 'money', amount: -900, label }, { type: 'story', charId: c.id, text: 'Spent the grand jury\'s term in Hollywood, Florida, where nobody could serve him.', label }, { type: 'heat', bar: 'federal', amount: 4, label }, { type: 'evidence', charId: c.id, amount: -8, label }] },
        { id: 'alone', label: 'He goes in alone', detail: 'Whatever he says, he says.', because: `let ${c.firstName} face the grand jury alone`, effects: [opn(c.id, s.playerId, -10, 'Left me alone with the grand jury', label), { type: 'schedule', key: 'stand_up', minWeeks: 3, maxWeeks: 4, chance: 1, hint: 'will he stand up?', params: { charId: c.id, help: 0 }, label }] },
      ], 'fifth');
  },
};

/* ------------------------------------------------------------------ */
/* Wives (the other side of the kitchen table)                         */
/* ------------------------------------------------------------------ */

const wifeSpending: CrewEventDef = {
  key: 'wife_spending',
  cooldown: COOL,
  weight: () => 1.6,
  subjects: (s) => men(s).filter((c) => available(s, c) && !!c.household?.wife && c.wealth >= 2000),
  build: (s, c) => {
    const w = c.household!.wife!;
    const label = `${w}'s shopping`;
    return make(s, 'wife_spending', c, `${w} ${c.lastName} went shopping`,
      `${w}, ${displayName(c)}'s wife, has discovered Wanamaker's in Philadelphia: a mink stole, a hi-fi console, a charge account in her own name. The woman behind the counter knows exactly what a ${pick(s, ['bartender', 'cab driver', 'jukebox repairman'])}'s wife should be able to afford. ${c.firstName} cannot say no to her and asks you to.`,
      [
        { id: 'talk', label: 'Have your wife take her to lunch', detail: 'Two women, a long lunch, a quiet word about how things look.', because: `had a quiet word with ${w} about her spending`, effects: [{ type: 'money', amount: -80, label }, { type: 'evidence', charId: c.id, amount: -3, label }, opn(c.id, s.playerId, 5, 'Handled it gently', label)] },
        { id: 'account', label: 'Move her charge account to a family store', detail: 'She shops at your places. The money never leaves.', because: `moved ${w}'s charge account to a family store`, effects: [{ type: 'money', amount: 200, label }, { type: 'wealth', charId: c.id, amount: -400, label }, opn(c.id, s.playerId, 2, 'Found a way', label)] },
        { id: 'his', label: 'His wife, his problem', because: `left ${c.firstName}'s wife's spending to him`, effects: [{ type: 'heat', bar: 'federal', amount: 2, label }, { type: 'evidence', charId: c.id, amount: 3, label }] },
      ], 'talk');
  },
};

const wifeLeaving: CrewEventDef = {
  key: 'wife_leaving',
  cooldown: COOL + 4,
  weight: () => 1.4,
  subjects: (s) => men(s).filter((c) => available(s, c) && !!c.household?.wife && (hasVice(c, 'booze') || hasVice(c, 'women') || hasVice(c, 'horses') || hasTrait(c, 'Drinker') || hasTrait(c, 'Womanizer'))),
  build: (s, c) => {
    const w = c.household!.wife!;
    const why = hasVice(c, 'women') || hasTrait(c, 'Womanizer') ? 'the other women' : hasVice(c, 'horses') ? 'the rent money that went to Garden State Park' : 'the drinking';
    const label = `${w} wants to leave`;
    return make(s, 'wife_leaving', c, `${w} wants to leave ${c.firstName}`,
      `${w} has had enough of ${why}. She wants to take the kids to her mother's in Trenton. ${displayName(c)} comes to you red-eyed and asks what he should do. In this family a wife who leaves takes a lot of knowledge with her — but she is a grown woman, and it is her life.`,
      [
        { id: 'help', label: 'Help her go with dignity ($300 for the move)', detail: 'Her choice, respected. She leaves with no grudge against the family.', because: `helped ${w} leave with dignity`, effects: [{ type: 'money', amount: -300, label }, opn(c.id, s.playerId, -4, 'Helped my wife leave me', label), { type: 'evidence', charId: c.id, amount: -3, label }, { type: 'respect', amount: 1, label }] },
        { id: 'fix', label: `Tell ${c.firstName} to fix himself first`, detail: 'Father Callahan, the meetings at the Methodist church, whatever it takes. She decides.', because: `told ${c.firstName} to fix himself for his wife`, effects: [{ type: 'money', amount: -150, label }, opn(c.id, s.playerId, 4, 'Told me the truth', label), outcome('whether she stays', label, { who: c.id, p: 0.5, resp: 0, opWin: 8, good: `${w} gave ${c.firstName} one more chance, and so far he has kept it`, bad: `${w} left for Trenton anyway; ${c.firstName} drinks at the club now` }, 3, 8)] },
        { id: 'out', label: 'Stay out of a man\'s marriage', because: `stayed out of ${c.firstName}'s marriage`, effects: [{ type: 'schedule', key: 'wife_to_cops', minWeeks: 3, maxWeeks: 8, chance: 0.15, hint: 'an angry ex-wife knows things', params: { charId: c.id }, label }] },
      ], 'help');
  },
};

/* ------------------------------------------------------------------ */
/* Offers from outside                                                 */
/* ------------------------------------------------------------------ */

const courtedVegas: CrewEventDef = {
  key: 'courted_vegas',
  cooldown: COOL + 6,
  weight: () => 1.2,
  subjects: (s) => men(s).filter((c) => available(s, c) && c.rank !== 'capo' && (c.craft === 'bookmaker' || c.craft === 'earner' || hasTrait(c, 'Charming')) && op(s, c, s.playerId) < 40),
  build: (s, c) => {
    const where = pick(s, ['a pit boss job at a Las Vegas casino with Cleveland money behind it', 'a host job at a hotel in Miami Beach', 'running the card room on a Havana-to-Key West cruise ship that never quite reaches either']);
    const label = `${c.firstName}'s offer`;
    return make(s, 'courted_vegas', c, `${callName(c)} has an offer from out of town`,
      `${displayName(c)} has been offered ${where}: a salary, a tan, and nobody from the county prosecutor's office. He asks your blessing. He also lets it slip how much they are paying, in case you want to match it.`,
      [
        { id: 'bless', label: 'Give him your blessing', detail: 'A friend in another city. One fewer man on the island.', because: `let ${c.firstName} go west with your blessing`, effects: [{ type: 'retire', charId: c.id, label }, { type: 'respect', amount: 1, label }, { type: 'schedule', key: 'favor_returned', minWeeks: 4, maxWeeks: 8, chance: 0.5, hint: 'a friend out of town remembers', params: { who: c.firstName }, label }] },
        { id: 'match', label: 'Match it ($600 and a better corner)', because: `matched ${c.firstName}'s out-of-town offer`, effects: [{ type: 'money', amount: -600, label }, { type: 'wealth', charId: c.id, amount: 600, label }, opn(c.id, s.playerId, 12, 'Matched my offer', label), { type: 'policy', charId: c.id, policy: 'earn', label }] },
        { id: 'no', label: '"Nobody leaves."', detail: 'He stays. He remembers.', because: `told ${c.firstName} nobody leaves`, effects: [{ type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 15, label }, opn(c.id, s.playerId, -10, 'Would not let me go', label), { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 8, label }] },
      ], 'match');
  },
};

export const CREW_VARIANTS: CrewEventDef[] = [
  pitchCardGame, pitchHijack, pitchInspector, pitchJukebox, pitchContractor, pitchHorse, pitchBookie, pitchTurncoat, pitchWidow,
  scoreHot, scoreWelsh, scoreFlash, beefJoke, beefTown, vouchVeteran, vouchNephew,
  disputeCar, disputeCredit, disputeWaitress, disputeDebt,
  lifeAnniversary, lifeCommunion, lifeMother, lifeHouse, kidDraft, kidBand,
  lawTrooper, lawSubpoena, wifeSpending, wifeLeaving, courtedVegas,
];

registerCrewEvents(CREW_VARIANTS);

/* ------------------------------------------------------------------ */
/* The delayed outcome                                                 */
/* ------------------------------------------------------------------ */

type Handler = (ctx: Ctx, sc: ScheduledConsequence) => { text: string; effects?: Effect[] } | undefined;

/** `cv_outcome`: a risky play resolves. Params: who, p, win, lose, heat, fed, ev, resp, wealth, opWin, opLose, good, bad. */
export const VARIANT_HANDLERS: Record<string, Handler> = {
  cv_outcome: (ctx, sc) => {
    const s = ctx.s;
    const P = sc.params;
    const n = (k: string) => Number(P[k] ?? 0);
    const c = s.characters[String(P.who)];
    const live = !!c?.alive && c.faction === 'player';
    const ok = chance(s, Math.max(0, Math.min(0.95, n('p'))));
    const fx: Effect[] = [];
    if (ok) {
      if (n('win')) fx.push({ type: 'money', amount: n('win') });
      if (n('resp')) fx.push({ type: 'respect', amount: n('resp') });
      if (live && n('wealth')) fx.push({ type: 'wealth', charId: c.id, amount: n('wealth') });
      if (live && n('opWin')) fx.push({ type: 'opinion', from: c.id, to: s.playerId, amount: n('opWin'), reason: 'It paid off', decay: 1 });
      if (!String(P.good ?? '')) return undefined;
      return { text: String(P.good), effects: fx };
    }
    if (n('lose')) fx.push({ type: 'money', amount: n('lose') });
    if (n('heat')) fx.push({ type: 'heat', bar: 'local', amount: n('heat') });
    if (n('fed')) fx.push({ type: 'heat', bar: 'federal', amount: n('fed') });
    if (live && n('ev')) fx.push({ type: 'evidence', charId: c.id, amount: n('ev') });
    if (live && n('opLose')) fx.push({ type: 'opinion', from: c.id, to: s.playerId, amount: n('opLose'), reason: 'It went bad', decay: 1 });
    return { text: String(P.bad ?? 'it went bad'), effects: fx };
  },
};

