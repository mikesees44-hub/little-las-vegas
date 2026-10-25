import { crew, displayName, hasTrait, isFree, player } from './characters';
import { registerEventSource } from './events';
import { beat, clamp, hit, mgEffect, mgOf, registerMinigame, roll, usd, type MgOption, type MgSession, type MinigameDef } from './minigame';
import type { Character, Effect, EventInstance, GameState, Trait } from './types';

/**
 * THE BACK-ROOM CARD GAME: seven-card stud, fixed limit, in the back of a
 * club after closing. Two or three men at the table, each with tells that
 * come from his traits (and are only as reliable as the trait). Up to three
 * hands; cash out whenever you like. Win too much from a capo and he is
 * embarrassed in front of his men; lose to him and he is flattered.
 */

export type Card = number; // 0..51: rank = c % 13 (0 = deuce .. 12 = ace), suit = floor(c / 13)

const RANKS = '23456789TJQKA';
const SUITS = '♣♦♥♠';
export const cardText = (c: Card) => `${RANKS[c % 13]}${SUITS[Math.floor(c / 13)]}`;

/** Score of the best 5 of up to 7 cards (higher is better): category * 15^5 + kickers. */
export function bestHand(cards: Card[]): { score: number; name: string } {
  if (cards.length < 5) return evalPartial(cards);
  let best = { score: -1, name: '' };
  const n = cards.length;
  const pick: Card[] = [];
  const rec = (from: number) => {
    if (pick.length === 5) {
      const h = eval5(pick);
      if (h.score > best.score) best = h;
      return;
    }
    for (let i = from; i <= n - (5 - pick.length); i++) {
      pick.push(cards[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return best;
}

const CAT = ['High card', 'A pair', 'Two pair', 'Three of a kind', 'A straight', 'A flush', 'A full house', 'Four of a kind', 'A straight flush'];

function eval5(cs: Card[]): { score: number; name: string } {
  const ranks = cs.map((c) => c % 13).sort((a, b) => b - a);
  const flush = cs.every((c) => Math.floor(c / 13) === Math.floor(cs[0] / 13));
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 12 && ranks[1] === 3) straightHigh = 3; // the wheel
  }
  const counts = uniq.map((r) => ({ r, n: ranks.filter((x) => x === r).length })).sort((a, b) => b.n - a.n || b.r - a.r);
  let cat: number;
  if (straightHigh >= 0 && flush) cat = 8;
  else if (counts[0].n === 4) cat = 7;
  else if (counts[0].n === 3 && counts[1]?.n === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh >= 0) cat = 4;
  else if (counts[0].n === 3) cat = 3;
  else if (counts[0].n === 2 && counts[1]?.n === 2) cat = 2;
  else if (counts[0].n === 2) cat = 1;
  else cat = 0;
  const kick = straightHigh >= 0 && cat !== 5 ? [straightHigh] : counts.map((x) => x.r);
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (kick[i] ?? 0);
  return { score, name: CAT[cat] };
}

function evalPartial(cs: Card[]): { score: number; name: string } {
  if (!cs.length) return { score: 0, name: CAT[0] };
  const ranks = cs.map((c) => c % 13).sort((a, b) => b - a);
  const counts = [...new Set(ranks)].map((r) => ({ r, n: ranks.filter((x) => x === r).length })).sort((a, b) => b.n - a.n || b.r - a.r);
  const cat = counts[0].n === 4 ? 7 : counts[0].n === 3 ? 3 : counts[0].n === 2 && counts[1]?.n === 2 ? 2 : counts[0].n === 2 ? 1 : 0;
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (counts[i]?.r ?? 0);
  return { score, name: CAT[cat] };
}

/** Rough strength 0..1 of a hand so far (what a player feels in his gut). */
export function gutStrength(cards: Card[]): number {
  const h = bestHand(cards);
  const cat = Math.floor(h.score / 15 ** 5);
  const top = Math.floor(h.score / 15 ** 4) % 15;
  const base = [0.12, 0.38, 0.6, 0.74, 0.82, 0.86, 0.93, 0.98, 1][cat];
  const suits = [0, 1, 2, 3].map((s) => cards.filter((c) => Math.floor(c / 13) === s).length);
  const draw = cards.length < 7 && Math.max(...suits) >= 4 ? 0.12 : 0;
  return clamp(base + top / 120 + draw, 0, 1);
}

interface Seat {
  id: string;
  name: string;
  first: string;
  traits: Trait[];
  down: Card[];
  up: Card[];
  folded: boolean;
  /** Net chips this session. */
  net: number;
  /** In this hand. */
  inPot: number;
  capo: boolean;
  /** Is this a man of yours? */
  ours: boolean;
}

export interface CardsData {
  stake: number;
  bet: number;
  hand: number;
  street: number;
  deck: Card[];
  pot: number;
  me: Seat;
  opps: Seat[];
  toCall: number;
  raised: boolean;
  log: string[];
  over: boolean;
  gaveBack?: string;
  lastShow?: { winner: string; hands: { name: string; cards: string; hand: string }[] };
}

type CS = MgSession<CardsData>;

const STREET = ['', '', '', 'Third street', 'Fourth street', 'Fifth street', 'Sixth street', 'Seventh street (the river)'];

/** How each trait plays and what it gives away. */
const STYLE: Partial<Record<Trait, { loose: number; aggro: number; tell?: { strong: string; weak: string; truth: number } }>> = {
  Gambler: { loose: 0.25, aggro: 0.15, tell: { strong: 'drums his fingers on the felt', weak: 'drums his fingers on the felt', truth: 0.5 } },
  'Hot-headed': { loose: 0.1, aggro: 0.3, tell: { strong: 'goes very still', weak: 'shoves his chips in hard', truth: 0.7 } },
  Patient: { loose: -0.1, aggro: -0.05 },
  Greedy: { loose: 0.05, aggro: 0.1, tell: { strong: 'leans forward over the pot', weak: 'sits back and looks at the ceiling', truth: 0.8 } },
  Drinker: { loose: 0.1, aggro: 0, tell: { strong: 'stops talking', weak: 'tells a long story about the war', truth: 0.75 } },
  Paranoid: { loose: -0.12, aggro: -0.1, tell: { strong: 'checks his down cards twice', weak: 'touches his ear', truth: 0.7 } },
  Cowardly: { loose: -0.15, aggro: -0.15, tell: { strong: 'smiles too early', weak: 'won\'t look at your up cards', truth: 0.75 } },
  Charming: { loose: 0, aggro: 0.05, tell: { strong: 'cracks a joke', weak: 'cracks a joke', truth: 0.5 } },
  Honest: { loose: -0.05, aggro: -0.05, tell: { strong: 'nods to himself', weak: 'sighs', truth: 0.9 } },
};

function style(t: Trait[]): { loose: number; aggro: number } {
  return t.reduce((a, x) => ({ loose: a.loose + (STYLE[x]?.loose ?? 0), aggro: a.aggro + (STYLE[x]?.aggro ?? 0) }), { loose: 0, aggro: 0 });
}

function draw(d: CardsData): Card {
  return d.deck.pop()!;
}

function seatOf(c: Character, s: GameState): Seat {
  return { id: c.id, name: displayName(c), first: c.firstName, traits: c.traits, down: [], up: [], folded: false, net: 0, inPot: 0, capo: c.rank === 'capo' || c.rank === 'underboss', ours: c.faction === 'player' && c.id !== s.playerId };
}

function dealHand(ses: CS): void {
  const d = ses.d;
  d.deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = d.deck.length - 1; i > 0; i--) {
    const j = Math.floor(roll(ses) * (i + 1));
    [d.deck[i], d.deck[j]] = [d.deck[j], d.deck[i]];
  }
  d.hand += 1;
  d.street = 3;
  d.pot = 0;
  for (const p of [d.me, ...d.opps]) {
    p.down = [draw(d), draw(d)];
    p.up = [draw(d)];
    p.folded = false;
    p.inPot = 0;
    ante(d, p, Math.round(d.bet / 4));
  }
  d.toCall = 0;
  d.raised = false;
  beat(ses, `Hand ${d.hand}. The ante is in. You look at your down cards: ${d.me.down.map(cardText).join(' ')}.`, 'info');
  tells(ses);
}

function ante(d: CardsData, p: Seat, amt: number): void {
  p.net -= amt;
  p.inPot += amt;
  d.pot += amt;
}

function cardsOf(p: Seat): Card[] {
  return [...p.down, ...p.up];
}

function tells(ses: CS): void {
  const d = ses.d;
  for (const o of d.opps.filter((x) => !x.folded)) {
    const t = o.traits.map((x) => STYLE[x]?.tell).find((x) => !!x);
    if (!t) continue;
    const strong = gutStrength(cardsOf(o)) >= 0.55;
    const honest = hit(ses, t.truth);
    const shows = strong === honest ? t.strong : t.weak;
    if (hit(ses, 0.55)) beat(ses, `${o.first} ${shows}. (${o.traits.find((x) => STYLE[x]?.tell)}: right about ${Math.round(t.truth * 100)}% of the time.)`, 'quote');
  }
}

/** Opponents act after you: call, raise or fold by gut and style. */
function opponentsAct(ses: CS, myRaise: boolean): void {
  const d = ses.d;
  let raiseOpen = !myRaise && !d.raised;
  for (const o of d.opps.filter((x) => !x.folded)) {
    const st = style(o.traits);
    const g = gutStrength(cardsOf(o)) + st.loose + (roll(ses) - 0.5) * 0.2;
    const facing = myRaise || d.raised ? d.bet : 0;
    if (facing > 0 && g < 0.3 && !hit(ses, 0.15 + st.loose)) {
      o.folded = true;
      beat(ses, `${o.first} folds.`, 'info');
      continue;
    }
    if (raiseOpen && g > 0.68 - st.aggro && hit(ses, 0.5 + st.aggro)) {
      ante(d, o, facing + d.bet);
      d.raised = true;
      raiseOpen = false;
      beat(ses, `${o.first} raises ${usd(d.bet)}.`, 'bad');
      continue;
    }
    if (facing) ante(d, o, facing);
    beat(ses, facing ? `${o.first} calls.` : `${o.first} checks.`, 'info');
  }
}

function nextStreet(s: GameState, ses: CS): void {
  const d = ses.d;
  const alive = d.opps.filter((x) => !x.folded);
  if (d.me.folded || !alive.length) return endHand(s, ses);
  if (d.street >= 7) return showdown(s, ses);
  d.street += 1;
  d.raised = false;
  d.toCall = 0;
  for (const p of [d.me, ...alive]) {
    if (d.street === 7) p.down.push(draw(d));
    else p.up.push(draw(d));
  }
  beat(ses, `${STREET[d.street]}. ${d.street === 7 ? `Your last card, face down: ${cardText(d.me.down[2])}.` : `You catch the ${cardText(d.me.up[d.me.up.length - 1])}.`}`, 'info');
  tells(ses);
}

function showdown(s: GameState, ses: CS): void {
  const d = ses.d;
  const players = [d.me, ...d.opps.filter((x) => !x.folded)];
  const scored = players.map((p) => ({ p, h: bestHand(cardsOf(p)) })).sort((a, b) => b.h.score - a.h.score);
  const w = scored[0].p;
  d.lastShow = { winner: w.first || 'You', hands: scored.map((x) => ({ name: x.p === d.me ? 'You' : x.p.first, cards: cardsOf(x.p).map(cardText).join(' '), hand: x.h.name })) };
  beat(ses, `Showdown. ${scored.map((x) => `${x.p === d.me ? 'You' : x.p.first}: ${x.h.name.toLowerCase()}`).join('; ')}.`, 'info');
  win(s, ses, w);
}

function endHand(s: GameState, ses: CS): void {
  const d = ses.d;
  const w = d.me.folded ? d.opps.filter((x) => !x.folded).sort((a, b) => bestHand(cardsOf(b)).score - bestHand(cardsOf(a)).score)[0] ?? d.opps[0] : d.me;
  win(s, ses, w);
}

function win(_s: GameState, ses: CS, w: Seat): void {
  const d = ses.d;
  w.net += d.pot;
  beat(ses, `${w === d.me ? 'You rake in' : `${w.first} rakes in`} ${usd(d.pot)}.`, w === d.me ? 'good' : 'bad');
  d.pot = 0;
  ses.phase = d.hand >= 3 ? 'last' : 'between';
}

function options(s: GameState, ses: CS): MgOption[] {
  const d = ses.d;
  switch (ses.phase) {
    case 'buyin':
      return [
        { id: 'stake_low', label: `Nickel-and-dime (${usd(300)} buy-in)`, detail: 'A friendly game.' },
        { id: 'stake_mid', label: `A real game (${usd(1500)})`, detail: 'Everybody at the table can afford to lose this. Mostly.', disabled: s.money < 1500 ? 'Needs $1,500' : undefined },
        { id: 'stake_high', label: `The big game (${usd(5000)})`, detail: 'Somebody leaves this table hurt.', disabled: s.money < 5000 ? 'Needs $5,000' : undefined },
      ];
    case 'bet': {
      const g = gutStrength(cardsOf(d.me));
      return [
        { id: 'call', label: d.raised ? `Call ${usd(d.bet)}` : 'Check', detail: `Your gut says ${g >= 0.7 ? 'strong' : g >= 0.45 ? 'decent' : 'weak'} (${bestHand(cardsOf(d.me)).name.toLowerCase()}).` },
        { id: 'raise', label: `${d.raised ? 'Re-raise' : 'Bet'} ${usd(d.bet)}`, detail: 'Push them.', tone: 'risky' },
        { id: 'fold', label: 'Fold', detail: `You lose the ${usd(d.me.inPot)} you put in.` },
      ];
    }
    case 'between':
      return [
        { id: 'deal', label: 'Deal another hand' },
        { id: 'cashout', label: 'Cash out', detail: `You are ${d.me.net >= 0 ? 'up' : 'down'} ${usd(Math.abs(d.me.net))}.` },
      ];
    case 'last': {
      const big = d.opps.filter((o) => o.ours && o.net <= -d.stake * 0.8);
      return [
        { id: 'cashout', label: 'Call it a night', detail: `You are ${d.me.net >= 0 ? 'up' : 'down'} ${usd(Math.abs(d.me.net))}.` },
        ...big.map((o) => ({ id: `giveback_${o.id}`, label: `Let ${o.first} win some back`, detail: `Give back ${usd(Math.round(-o.net / 2))}: he keeps his face in front of his men.` })),
      ];
    }
  }
  return [{ id: 'next', label: 'Continue' }];
}

function step(s: GameState, ses: CS, move: string): void {
  const d = ses.d;
  switch (ses.phase) {
    case 'buyin':
      d.stake = move === 'stake_high' ? 5000 : move === 'stake_mid' ? 1500 : 300;
      d.bet = Math.round(d.stake / 10);
      dealHand(ses);
      ses.phase = 'bet';
      return;
    case 'bet':
      if (move === 'fold') {
        d.me.folded = true;
        beat(ses, 'You fold.', 'info');
        return endHand(s, ses);
      }
      if (move === 'raise') {
        ante(d, d.me, (d.raised ? d.bet : 0) + d.bet);
        beat(ses, `You ${d.raised ? 're-raise' : 'bet'} ${usd(d.bet)}.`, 'info');
        opponentsAct(ses, true);
      } else {
        if (d.raised) ante(d, d.me, d.bet);
        beat(ses, d.raised ? 'You call.' : 'You check.', 'info');
        const wasRaised = d.raised;
        d.raised = false;
        opponentsAct(ses, false);
        // Somebody raised behind you: one call to see it through.
        if (d.raised && !wasRaised) {
          ante(d, d.me, d.bet);
          beat(ses, 'You call the raise.', 'info');
        }
      }
      return nextStreet(s, ses);
    case 'between':
      if (move === 'deal') {
        dealHand(ses);
        ses.phase = 'bet';
        return;
      }
      return finish(s, ses);
    case 'last':
      if (move.startsWith('giveback_')) {
        const o = d.opps.find((x) => x.id === move.slice(9));
        if (o) {
          const amt = Math.round(-o.net / 2);
          o.net += amt;
          d.me.net -= amt;
          d.gaveBack = o.id;
          beat(ses, `You let ${o.first} take the last pot. Nobody at the table says a word about it.`, 'good');
        }
      }
      return finish(s, ses);
  }
}

function finish(s: GameState, ses: CS): void {
  const d = ses.d;
  const p = player(s);
  const label = 'The card game';
  const fx: Effect[] = [];
  if (d.me.net) fx.push({ type: 'money', amount: d.me.net, label: `${label}: ${d.me.net >= 0 ? 'winnings' : 'losses'}` });
  for (const o of d.opps) {
    if (!o.ours || !s.characters[o.id]) continue;
    if (d.gaveBack === o.id) fx.push({ type: 'opinion', from: o.id, to: p.id, amount: 6, reason: 'Let me win back my face at cards', decay: 1, label });
    else if (o.net <= -d.stake * 0.8) fx.push({ type: 'opinion', from: o.id, to: p.id, amount: o.capo ? -10 : -5, reason: 'Embarrassed me at cards in front of my men', decay: 1, label });
    else if (o.net >= d.stake * 0.5) fx.push({ type: 'opinion', from: o.id, to: p.id, amount: 4, reason: 'Took the boss\'s money at cards', decay: 1, label });
  }
  if (d.me.net <= -d.stake) fx.push({ type: 'respect', amount: -1, label: `${label}: the boss lost his shirt` });
  if (d.me.net >= d.stake * 1.5) fx.push({ type: 'respect', amount: 1, label: `${label}: the boss cleaned out the table` });
  ses.done = true;
  ses.phase = 'end';
  ses.outcome = { title: label, text: `${d.hand} hand${d.hand > 1 ? 's' : ''} of seven-card stud. You ${d.me.net >= 0 ? 'walked away up' : 'walked away down'} ${usd(Math.abs(d.me.net))}.`, tone: d.me.net >= 0 ? 'good' : 'bad', effects: fx };
}

function auto(s: GameState, ses: CS): string {
  const d = ses.d;
  switch (ses.phase) {
    case 'buyin':
      return s.money >= 1500 ? 'stake_mid' : 'stake_low';
    case 'bet': {
      const g = gutStrength(cardsOf(d.me));
      if (g >= 0.74) return 'raise';
      if (d.raised && g < 0.32 && d.street >= 5) return 'fold';
      return 'call';
    }
    case 'between':
      return d.hand >= 2 ? 'cashout' : 'deal';
    case 'last':
      return 'cashout';
  }
  return 'next';
}

export const CARDS: MinigameDef<CardsData> = {
  id: 'cards',
  init: (s, ses) => {
    const ids = String(ses.params.players ?? '').split(',').filter((x) => s.characters[x]);
    const opps = ids.map((id) => seatOf(s.characters[id], s));
    const me: Seat = { id: s.playerId, name: 'You', first: '', traits: [], down: [], up: [], folded: false, net: 0, inPot: 0, capo: false, ours: false };
    const d: CardsData = { stake: 0, bet: 0, hand: 0, street: 3, deck: [], pot: 0, me, opps, toCall: 0, raised: false, log: [], over: false };
    return { d, phase: 'buyin', intro: { title: 'Seven-card stud', kicker: 'The back room, after closing', text: `The chairs are up on the tables out front. In the back: green felt, one lamp, ${opps.map((o) => o.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}. Watch their hands, not their faces. Or their faces, if you know what to look for.`, scene: 'cardtable' } };
  },
  options,
  step,
  auto,
  odds: (_s, ses) => {
    const d = ses.d;
    if (!d.hand) return [];
    return [{ label: 'Pot', value: usd(d.pot) }, { label: 'You', value: `${d.me.net >= 0 ? '+' : ''}${usd(d.me.net)}`, tone: d.me.net >= 0 ? 'good' : 'bad' }, ...d.opps.map((o) => ({ label: o.first, value: `${o.net >= 0 ? '+' : ''}${usd(o.net)}${o.folded ? ' (out)' : ''}` }))];
  },
};
registerMinigame(CARDS);

/* ---------------------------------------------------------------- */
/* The invitation                                                    */
/* ---------------------------------------------------------------- */

export function cardPlayers(s: GameState): Character[] {
  const men = crew(s).filter((c) => isFree(s, c) && c.id !== s.playerId && (hasTrait(c, 'Gambler') || c.rank === 'capo' || c.vices?.includes('cards')));
  const rivals = s.rivals.filter((r) => r.kind === 'mob').map((r) => s.characters[r.leaderId]).filter((c): c is Character => !!c?.alive && (c.imprisonedUntil ?? 0) <= s.week);
  const out = men.sort((a, b) => Number(hasTrait(b, 'Gambler')) - Number(hasTrait(a, 'Gambler'))).slice(0, 2);
  if (rivals.length && out.length < 3) out.push(rivals[s.week % rivals.length]);
  return out.slice(0, 3);
}

export function buildCardGame(s: GameState): EventInstance | undefined {
  const players = cardPlayers(s);
  if (players.length < 2) return undefined;
  const iid = `ev${s.nextId++}`;
  const params = { players: players.map((p) => p.id).join(','), play: 1 };
  return {
    iid, defId: 'card_game', week: s.week, mandatory: false, priority: 32, actors: players.map((p) => p.id),
    title: 'A game in the back room',
    text: `${players[0].firstName} has a table going in the back of the club after closing: seven-card stud, ${players.map((p) => p.firstName).join(', ')}. There is a chair for the boss, if the boss wants it.`,
    defaultChoiceId: 'decline',
    choices: [
      { id: 'sit', label: 'Pull up a chair', detail: 'Seven-card stud. Read the table.', because: 'sat in on the card game', effects: [mgEffect('cards', iid, params)] },
      { id: 'quick', label: 'Play a few hands, don\'t think about it', because: 'played a few hands of cards', effects: [mgEffect('cards', iid, { ...params, play: 0 })] },
      { id: 'decline', label: 'Send your regrets', because: 'skipped the card game', effects: [] },
    ],
  };
}

let on = false;
export function ensureCardSource(): void {
  if (on) return;
  on = true;
  registerEventSource((s) => {
    const mg = mgOf(s);
    if (s.week - (mg.offered.cards ?? -999) < 16) return undefined;
    const ownsGame = s.businesses.some((b) => b.owner === 'player' && b.kind === 'cardgame');
    if (((s.week * 2654435761) >>> 0) % 100 >= (ownsGame ? 14 : 7)) return undefined;
    const ev = buildCardGame(s);
    if (ev) mg.offered.cards = s.week;
    return ev;
  });
}
