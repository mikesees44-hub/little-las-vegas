import { displayName } from './characters';
import {
  alive, bond, ensureFamilies, famEvent, mintMan, note, pendingFam, sizeLine, slotOf, stanceTo, stanceWord,
  type FamLog, type FamState,
} from './familyWeb';
import type { FamKey, RosterMan } from './familyWebData';
import { FAMILY_BY_ID } from './familyWebData';
import { journal } from './journal';
import type { Ctx } from './ledger';
import { rand } from './rng';
import { logTalk } from './talks';
import type { Effect, EventInstance, GameState } from './types';

/**
 * THE CITIES (familyWebCitiesData.ts holds the people and the 1960 ties):
 * the Chicago Outfit, New Orleans, Florida and the Havana men. They are in
 * the families' web like everyone else (stance, ties, jockeying, asking each
 * other and the boss for help: familyWeb.ts); here each city also comes to
 * the boss now and then with its own business, by its stance and its ties.
 * Every choice says what it costs and its odds; results land in Your File.
 * Nobody of the boss's is harmed or handed over: the asks are money, a word,
 * a favor or a deal.
 */

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const free = (st: FamState, key: string, w: number) => (st.cd[key] ?? 0) <= w;
const pickOf = <T,>(st: FamState, xs: readonly T[]): T => xs[Math.floor(rand(st) * xs.length)];

/** A named man of the outfit (by role), made a full character as he walks in; his name either way. */
function envoyOf(s: GameState, f: FamKey, roles: RosterMan['role'][], st: FamState, noteHas?: string): { name: string; actors: string[] } {
  const d = FAMILY_BY_ID[f];
  let slot = noteHas ? d.roster.findIndex((m) => !m.offstage && m.note?.includes(noteHas)) : -1;
  if (slot < 0) slot = slotOf(f, roles, Math.floor(rand(st) * 3));
  const c = slot >= 0 ? mintMan(s, f, slot) : undefined;
  return { name: c ? displayName(c) : d.boss ?? d.short, actors: c ? [c.id] : [] };
}

const view = (fam: FamKey, amount: number, reason: string): Effect => ({ type: 'fam', op: { op: 'view', fam, amount, reason } });
const tie = (a: FamKey, b: FamKey, kind: 'partners' | 'racket' | 'debt' | 'friends', strength: number, story: string, by?: 'a' | 'b'): Effect => ({ type: 'fam', op: { op: 'tie', a, b, kind, strength, story, ...(by ? { by } : {}) } });
const deal = (fam: FamKey, weekly: number, weeks: number, what: string): Effect => ({ type: 'fam', op: { op: 'deal', fam, weekly, weeks, what } });

/** A rumor that goes round (the families' news, the talk, and Your File as something heard). */
export function rumor(ctx: Ctx, st: FamState, t: string, tone: FamLog['tone'] = 'neutral'): void {
  const s = ctx.s;
  note(st, s.week, t, tone);
  logTalk(s, t, 'rivals');
  ctx.log.push(t);
  journal(s, { t, c: 'rivals', src: 'families', ln: 'diplomacy.board', k: 'heard' });
}

/* ------------------------------------------------------------------ */
/* Chicago                                                              */
/* ------------------------------------------------------------------ */

function chicagoVisit(s: GameState, st: FamState): EventInstance | undefined {
  if (!alive(s, 'chicago') || s.wars.some((w) => w.rival === ('chicago' as never))) return undefined;
  const stance = stanceTo(s, 'chicago').value;
  const sw = `Chicago's stance toward you: ${stanceWord(stance)} (${sizeLine(s, 'chicago')}).`;
  const kinds = [...(stance >= 0 ? ['point'] : []), 'wire', 'pension'] as const;
  const k = pickOf(st, kinds as readonly string[]);
  if (k === 'point') {
    const m = envoyOf(s, 'chicago', ['capo'], st, 'Las Vegas');
    const stake = 6000, weekly = 300;
    return famEvent(s, 'fam_chi', 'Chicago offers a point in a Strip casino',
      `${m.name} flies in from the desert for the Outfit: a quarter point in a Strip casino, ${fmt(stake)} in, ${fmt(weekly)} a week back from the count room for half a year. Chicago counts the money and nobody asks how. ${sw}`,
      [
        { id: 'in', label: `Buy the point (${fmt(stake)})`, detail: `Certain: ${fmt(weekly)} a week for 26 weeks, partners with Chicago (+6). Las Vegas's partners notice (+3).`, because: 'bought a point in a Strip casino from Chicago', effects: [{ type: 'money', amount: -stake, category: 'cost' }, deal('chicago', weekly, 26, 'a point in a Strip casino'), view('chicago', 6, 'Came in on the desert'), view('vegas', 3, 'A new point-holder'), tie('chicago', 'player', 'partners', 40, `Your house has held a point in Chicago's desert since ${s.date.y}.`)] },
        { id: 'pass', label: 'Thank him and pass', detail: 'Certain: Chicago thinks a little less of you (−2).', because: 'passed on Chicago\'s casino point', effects: [view('chicago', -2, 'Passed on the desert')] },
      ], { priority: 45, fam: 'chicago', actors: m.actors });
  }
  if (k === 'wire') {
    const m = envoyOf(s, 'chicago', ['capo'], st, 'racing wire');
    const fee = 1200, weekly = 140;
    return famEvent(s, 'fam_chi', 'Chicago wants your bookmakers on its racing wire',
      `${m.name} runs the racing wire for the Outfit: the results from every track, faster than the newspapers. He wants your bookmakers on it, ${fmt(fee)} to hook them up; faster results mean fewer bad bets taken. ${sw}`,
      [
        { id: 'hook', label: `Hook up the books (${fmt(fee)})`, detail: `Certain: your books do ${fmt(weekly)} a week better for 26 weeks; a shared racket with Chicago (+5).`, because: 'put your bookmakers on Chicago\'s wire', effects: [{ type: 'money', amount: -fee, category: 'cost' }, deal('chicago', weekly, 26, 'the racing wire (your books)'), view('chicago', 5, 'Took our wire'), tie('chicago', 'player', 'racket', 35, `Your bookmakers have run on Chicago's racing wire since ${s.date.y}.`)] },
        { id: 'no', label: 'Your books do fine with the newspaper', detail: 'Certain: Chicago thinks less of you (−5).', because: 'turned down Chicago\'s racing wire', effects: [view('chicago', -5, 'Turned down our wire')] },
      ], { priority: 45, fam: 'chicago', actors: m.actors });
  }
  const m = envoyOf(s, 'chicago', ['capo'], st, 'pension');
  const loan = 15000, weekly = 700, weeks = 26;
  return famEvent(s, 'fam_chi', 'Chicago\'s man talks about a fund that likes hotels',
    `${m.name} comes to dinner and never says the word "pension." He says there is a fund that likes hotels and men who build them, and that a friend of Chicago could have ${fmt(loan)} by Friday, paid back at ${fmt(weekly)} a week for half a year. It is a rumor in every union hall; he makes it sound like a favor. ${sw}`,
    [
      { id: 'no', label: 'Keep out of it', detail: 'Certain: nothing changes. Chicago shrugs.', because: 'kept out of Chicago\'s fund', effects: [view('chicago', -1, 'Kept out of our fund')] },
      { id: 'take', label: `Take the money (${fmt(loan)} now)`, detail: `Certain: ${fmt(loan)} now; you pay ${fmt(weekly)} a week for ${weeks} weeks (${fmt(weekly * weeks)} in all). Your house owes Chicago (a debt tie); Chicago +6. A loan like that gets noticed: federal heat +4.`, because: 'took a loan from Chicago\'s fund', effects: [{ type: 'money', amount: loan, category: 'debt' }, deal('chicago', -weekly, weeks, 'paying back the fund'), view('chicago', 6, 'A friend of the fund'), tie('chicago', 'player', 'debt', 40, `Your house owes Chicago's fund ${fmt(loan)} from ${s.date.y}.`, 'b'), { type: 'heat', bar: 'federal', amount: 4 }] },
    ], { priority: 45, fam: 'chicago', actors: m.actors });
}

/* ------------------------------------------------------------------ */
/* New Orleans                                                          */
/* ------------------------------------------------------------------ */

function nolaVisit(s: GameState, st: FamState): EventInstance | undefined {
  if (!alive(s, 'nola')) return undefined;
  const stance = stanceTo(s, 'nola').value;
  const sw = `New Orleans's stance toward you: ${stanceWord(stance)} (${sizeLine(s, 'nola')}).`;
  const k = pickOf(st, [...(stance >= -10 ? ['slots', 'layoff'] : []), 'feast'] as const);
  if (k === 'slots') {
    const m = envoyOf(s, 'nola', ['capo'], st, 'slot machines');
    const weekly = 180;
    return famEvent(s, 'fam_nola', 'New Orleans offers slot machines for your clubs',
      `${m.name} puts the Gulf Coast's slot machines in every bar from Biloxi to Lake Charles. He will ship a dozen to your clubs: his machines, his mechanic, the coin split down the middle. ${sw}`,
      [
        { id: 'in', label: 'Take the machines', detail: `Certain: ${fmt(weekly)} a week for 26 weeks, partners with New Orleans (+6). A bandit in every back room draws the local police: local heat +3.`, because: 'took New Orleans\'s slot machines', effects: [deal('nola', weekly, 26, 'slot machines in your clubs'), view('nola', 6, 'Took our machines'), tie('nola', 'player', 'partners', 40, `New Orleans's slot machines have stood in your clubs since ${s.date.y}.`), { type: 'heat', bar: 'local', amount: 3 }] },
        { id: 'no', label: 'No machines on the island', detail: 'Certain: New Orleans thinks a little less of you (−3).', because: 'turned down New Orleans\'s slot machines', effects: [view('nola', -3, 'No room for our machines')] },
      ], { priority: 45, fam: 'nola', actors: m.actors });
  }
  if (k === 'layoff') {
    const m = envoyOf(s, 'nola', ['capo'], st, 'racetracks');
    const stake = 2000, weekly = 110;
    return famEvent(s, 'fam_nola', 'New Orleans will take your big bets',
      `${m.name} runs the tracks for the Delacroix family and takes the layoff: when your bookmakers hold a bet too big to cover, New Orleans covers it, for a piece. ${fmt(stake)} opens the account. ${sw}`,
      [
        { id: 'in', label: `Open the account (${fmt(stake)})`, detail: `Certain: your books are safer and do ${fmt(weekly)} a week better for 26 weeks; a shared racket with New Orleans (+4).`, because: 'laid off your big bets with New Orleans', effects: [{ type: 'money', amount: -stake, category: 'cost' }, deal('nola', weekly, 26, 'the layoff (your big bets)'), view('nola', 4, 'Laid off with us'), tie('nola', 'player', 'racket', 35, `Your bookmakers have laid off their big bets with New Orleans since ${s.date.y}.`)] },
        { id: 'no', label: 'Your books carry their own', detail: 'Certain: New Orleans thinks a little less of you (−2).', because: 'kept your big bets home', effects: [view('nola', -2, 'Kept the big bets home')] },
      ], { priority: 44, fam: 'nola', actors: m.actors });
  }
  const m = envoyOf(s, 'nola', ['consigliere'], st);
  const gift = 800;
  return famEvent(s, 'fam_nola', 'The oldest family keeps its feast day',
    `${m.name} writes, in a hand nobody uses anymore, that Henri Delacroix keeps the feast of his village saint and that the old families send something. Nobody says what happens to the families that do not. ${sw}`,
    [
      { id: 'gift', label: `Send a gift and a man (${fmt(gift)})`, detail: 'Certain: New Orleans thinks better of you (+10); the old families notice (Philadelphia +2).', because: 'honored New Orleans\'s feast day', effects: [{ type: 'money', amount: -gift, category: 'cost' }, view('nola', 10, 'Honored the feast'), { type: 'rivalOpinion', rival: 'philly', amount: 2, reason: 'Keeps the old ways' }] },
      { id: 'card', label: 'Send a card', detail: 'Certain: New Orleans thinks a little less of you (−3).', because: 'sent New Orleans a card for the feast', effects: [view('nola', -3, 'A card, for the feast')] },
    ], { priority: 42, fam: 'nola', actors: m.actors });
}

/* ------------------------------------------------------------------ */
/* Florida and the Havana men                                           */
/* ------------------------------------------------------------------ */

const winter = (s: GameState) => s.date.m >= 11 || s.date.m <= 3;

function floridaVisit(s: GameState, st: FamState): EventInstance | undefined {
  const kinds = [
    ...(winter(s) && alive(s, 'biscayne') ? ['winter', 'winter'] : []),
    ...(alive(s, 'havana') ? ['casino', 'cause'] : []),
    ...(alive(s, 'tampa') && stanceTo(s, 'tampa').value >= -10 ? ['bolita'] : []),
  ];
  if (!kinds.length) return undefined;
  const k = pickOf(st, kinds);
  if (k === 'winter') {
    const m = envoyOf(s, 'biscayne', ['consigliere'], st);
    const cost = 2500;
    const nyc = (['marchetti', 'corvino', 'saladino', 'lobianco', 'abbadessa'] as FamKey[]).map((f) => view(f, 3, 'Wintered with us on the Beach'));
    return famEvent(s, 'fam_fla', 'Winter on Miami Beach',
      `${m.name} keeps a cabana for you at a Biscayne hotel: every family in the East is on the Beach this month, the bosses take the sun and settle in the cabanas what they could not settle in the snow. A week there costs ${fmt(cost)} and a man in your chair at home. Miami's stance toward you: ${stanceWord(stanceTo(s, 'biscayne').value)}.`,
      [
        { id: 'go', label: `Take the cabana for a week (${fmt(cost)})`, detail: 'Certain: Miami +8, every New York family +3, respect +1 (the boss is seen with the bosses).', because: 'wintered on Miami Beach with the families', effects: [{ type: 'money', amount: -cost, category: 'cost' }, view('biscayne', 8, 'Wintered with us'), ...nyc, { type: 'respect', amount: 1 }, tie('biscayne', 'player', 'friends', 30, `Your house has wintered at the Biscayne hotels since ${s.date.y}.`)] },
        { id: 'home', label: 'Stay home this winter', detail: 'Certain: nothing changes.', because: 'stayed home for the winter', effects: [] },
      ], { priority: 43, fam: 'biscayne', actors: m.actors });
  }
  if (k === 'casino') {
    const m = envoyOf(s, 'havana', ['boss', 'underboss'], st, 'three casino');
    const stake = 4000, weekly = 400;
    const sv = stanceTo(s, 'havana').value;
    const chance = Math.max(0.15, Math.min(0.6, 0.35 + sv / 300));
    return famEvent(s, 'fam_fla', 'The Havana men want a stake for a casino in exile',
      `${m.name} lost three casino floors in one night in 1959. Now he has a story about an island where the government will license a casino for the right men, and he wants partners: ${fmt(stake)} buys in. It is a long shot. The Havana men's stance toward you: ${stanceWord(sv)}.`,
      [
        { id: 'pass', label: 'Wish him luck', detail: 'Certain: the Havana men think a little less of you (−2).', because: 'passed on the casino in exile', effects: [view('havana', -2, 'Passed on the casino')] },
        { id: 'in', label: `Stake him (${fmt(stake)}, ${Math.round(chance * 100)}%)`, detail: `The money goes now; the Havana men +6 either way. ${Math.round(chance * 100)}% the casino opens and pays ${fmt(weekly)} a week for 26 weeks; otherwise the island's government changes its mind and the money is gone.`, because: 'staked the Havana men\'s casino in exile', effects: [{ type: 'money', amount: -stake, category: 'cost' }, view('havana', 6, 'Staked us'), { type: 'fam', op: { op: 'gamble', fam: 'havana', chance, weekly, weeks: 26, what: 'the casino in exile', lost: 'The island\'s government changed its mind; the money went with the license.' } }, tie('havana', 'player', 'partners', 30, `Your house staked the Havana men's casino in exile in ${s.date.y}.`)] },
      ], { priority: 44, fam: 'havana', actors: m.actors });
  }
  if (k === 'cause') {
    const m = envoyOf(s, 'havana', ['capo'], st, 'exile captain');
    const gift = 1500;
    return famEvent(s, 'fam_fla', 'An exile captain asks for money for the cause',
      `${m.name} is raising money to take Cuba back. He does not say for what, and you do not ask; in the Miami hotel bars they say there are crates going south and government men who look the other way. If the casinos ever reopen, he says, he will remember his friends.`,
      [
        { id: 'no', label: 'It is not your fight', detail: 'Certain: the Havana men think less of you (−4). Nobody federal hears your name.', because: 'kept out of the Cuban cause', effects: [view('havana', -4, 'Kept out of the cause')] },
        { id: 'give', label: `Give to the cause (${fmt(gift)})`, detail: 'Certain: the Havana men +12 and Tampa +3; a gift like that gets written down somewhere: federal heat +5.', because: 'gave money to the Cuban exiles\' cause', effects: [{ type: 'money', amount: -gift, category: 'cost' }, view('havana', 12, 'Gave to the cause'), view('tampa', 3, 'Gave to the cause'), { type: 'heat', bar: 'federal', amount: 5 }] },
        { id: 'store', label: 'Lend a warehouse, no questions', detail: 'Certain: the Havana men owe your house (a debt tie) and +15; crates nobody opens on the bay docks draw attention: federal heat +8, local heat +2.', because: 'lent the exiles a warehouse', effects: [view('havana', 15, 'Lent us a warehouse'), tie('havana', 'player', 'debt', 40, `The Havana men owe your house for a warehouse lent in ${s.date.y}, no questions asked.`, 'a'), { type: 'heat', bar: 'federal', amount: 8 }, { type: 'heat', bar: 'local', amount: 2 }] },
      ], { priority: 46, fam: 'havana', actors: m.actors });
  }
  const m = envoyOf(s, 'tampa', ['underboss'], st, 'bolita');
  const stake = 3000, weekly = 150;
  return famEvent(s, 'fam_fla', 'Tampa offers a piece of its bolita',
    `${m.name} runs the bolita in every cigar factory in Ybor City: a numbers game with a hundred little balls in a bag. ${fmt(stake)} into the bank, ${fmt(weekly)} a week back for half a year. Tampa's stance toward you: ${stanceWord(stanceTo(s, 'tampa').value)}.`,
    [
      { id: 'in', label: `Buy in (${fmt(stake)})`, detail: `Certain: ${fmt(weekly)} a week for 26 weeks; partners with Tampa (+5). New Orleans, Tampa's in-laws, notices (+2).`, because: 'bought into Tampa\'s bolita', effects: [{ type: 'money', amount: -stake, category: 'cost' }, deal('tampa', weekly, 26, 'the bolita bank'), view('tampa', 5, 'Came in with us'), view('nola', 2, 'Came in with our in-laws'), tie('tampa', 'player', 'partners', 35, `Partners in Tampa's bolita since ${s.date.y}.`)] },
      { id: 'pass', label: 'Thank him and pass', detail: 'Certain: Tampa thinks a little less of you (−1).', because: 'passed on Tampa\'s bolita', effects: [view('tampa', -1, 'Passed on our offer')] },
    ], { priority: 44, fam: 'tampa', actors: m.actors });
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

type Visit = { key: string; defId: string; every: [number, number]; make: (s: GameState, st: FamState) => EventInstance | undefined; when?: (s: GameState) => boolean };

const VISITS: Visit[] = [
  { key: 'chi:any', defId: 'fam_chi', every: [12, 18], make: chicagoVisit },
  { key: 'nola:any', defId: 'fam_nola', every: [14, 20], make: nolaVisit },
  { key: 'fla:any', defId: 'fam_fla', every: [10, 16], make: floridaVisit },
];

/** Talk that goes round about the cities (once a while, on the web's dice). */
const RUMORS: { key: string; t: (s: GameState) => string; when?: (s: GameState) => boolean }[] = [
  { key: 'r:chi:pension', t: () => 'In the union halls they say the Teamsters\' pension fund lends to whatever casino Chicago and Cleveland point at. Nobody has ever proved it, and nobody tries.' },
  { key: 'r:nola:old', t: () => 'They say in New York that the Commission sent a man to New Orleans about the slot machines, and Henri Delacroix kept him waiting three days for coffee. New Orleans asks; it does not take orders.' },
  { key: 'r:nola:slots', t: () => 'A grand jury in Louisiana is asking about slot machines again. In the bars from Biloxi to Lake Charles, the machines went into the back room for a week and came out again.', when: (s) => s.date.m >= 9 || s.date.m <= 4 },
  { key: 'r:fla:plot', t: () => 'In the Miami hotel bars they say the government\'s men have been asking the Havana casino men for help with Castro: old friends on the island, a way in. Nobody says it twice, and nobody has proved a word of it.' },
  { key: 'r:fla:lost', t: () => 'A Havana man who lost a casino floor in 1959 is dealing blackjack in a Miami Beach hotel for tips. Everybody who knew him there leaves a big one.' },
  { key: 'r:fla:winter', t: () => 'Half the bosses in the East are on Miami Beach this month. Whatever gets settled in a cabana comes north with the tans.', when: winter },
  { key: 'r:fla:guns', t: () => 'They say a boat left the Florida Keys at night with crates for Cuba, and that the Coast Guard looked the other way. The exiles say nothing; the casino men smile.' },
  { key: 'r:chi:seat', t: (s) => `Chicago's man sat in on the Commission in New York this month; ${bond(s, 'chicago', 'marchetti') > 0 ? 'Varrone and Marchetti voted together, as usual' : 'Varrone and Marchetti did not speak'}.` },
];

/**
 * The cities' week (engine.ts, after the families' web): each city comes to
 * the boss with its business now and then (one city at a time), and the talk
 * about them goes round.
 */
export function citiesWeek(ctx: Ctx): void {
  const s = ctx.s;
  const st = s.families;
  if (!st || !s.rivals?.length || s.gameOver) return;
  ensureFamilies(s);
  const w = s.week;
  if (free(st, 'city:any', w)) {
    const ready = VISITS.filter((v) => free(st, v.key, w) && !pendingFam(s, v.defId) && (!v.when || v.when(s)));
    if (ready.length && rand(st) < 0.35) {
      const v = pickOf(st, ready);
      const ev = v.make(s, st);
      st.cd[v.key] = w + v.every[0] + Math.floor(rand(st) * (v.every[1] - v.every[0] + 1));
      if (ev) { st.cd['city:any'] = w + 3; s.eventQueue.push(ev); }
    }
  }
  if (free(st, 'city:rumor', w) && rand(st) < 0.15) {
    const ready = RUMORS.filter((r) => free(st, r.key, w) && (!r.when || r.when(s)));
    if (ready.length) {
      const r = pickOf(st, ready);
      st.cd[r.key] = w + 40;
      st.cd['city:rumor'] = w + 6;
      rumor(ctx, st, r.t(s));
    }
  }
}
