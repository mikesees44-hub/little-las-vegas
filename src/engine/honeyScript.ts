import { hasTrait, player } from './characters';
import { isInSeason } from './calendar';
import { askingPrice, eveningKindOf } from './evening';
import { appeal } from './looks';
import { mindOf } from './minds/state';
import { boldEligible, pocketOf } from './quickies';
import { romanticOpinion } from './womenAffairs';
import { affairOf } from './womenCore';
import { $, agentOf, clamp, honeyBlock, hpick, hroll, manOf, marriedOf, perception } from './honeyCore';
import { protectionFor } from './protect';
import type { AgentKind } from './honeyState';
import type { Character, GameState, Trait } from './types';

/**
 * THE BOLD OFFER, SCRIPTED: a short branching scene in the two-way window
 * where the boss tries to talk a woman into something outrageous, right
 * there, in his office or in the club. Three beats:
 *
 *   1. his opening: a flirt, a dare, money, flattery, or who he is;
 *   2. her answer, and his comeback: she can play along, test him ("and
 *      what would your wife say?"), raise the stakes ("your office? every
 *      girl on Pacific Avenue has seen your office"), laugh, say no, or turn
 *      it on him (a working girl names her terms; a woman who is working HIM
 *      steers him upstairs, or out to a motel);
 *   3. the dare itself: the desk with the door unlocked, the count on the
 *      table, the coat-check room during the floor show, the booth behind
 *      the curtain, the roof under the pier lights. Off-screen; fade to black.
 *
 * Her answers come from who she is: her traits, her mood, what she thinks of
 * him, his looks to her, her money troubles, whether she is a professional,
 * whether she is married (and to whom), and whether she is working him (the
 * hidden truth: a woman with a job to do is suspiciously easy, and she wants
 * the office). Every line he can say shows its odds. She always decides; a no
 * is a no; nobody is pushed past it (a push only ever risks her walking out).
 * Pure and deterministic: the same moves on the same night get the same
 * answers, so the order (honey.ts `dare`) replays exactly what the window showed.
 */

export type DareAt = 'office' | 'club';
export type Approach = 'flirt' | 'dare' | 'money' | 'flatter' | 'status';
export type Reply = 'warm' | 'test' | 'raise' | 'laugh' | 'refuse' | 'turn';
export type Counter = 'name' | 'sweeten' | 'wit' | 'straight' | 'push' | 'take' | 'call' | 'bow' | 'laughToo' | 'double' | 'letgo' | 'along' | 'see' | 'walk';
export type Close = 'desk' | 'count' | 'coatcheck' | 'booth' | 'roof' | 'motel' | 'back';
export type DareMove = Approach | Counter | Close;
export type DareEnd = 'yes' | 'refused' | 'laughed' | 'bowed' | 'walked' | 'seen' | 'lure';

export const APPROACHES: Approach[] = ['flirt', 'dare', 'money', 'flatter', 'status'];
export const AT_TEXT: Record<DareAt, string> = { office: 'your office upstairs', club: 'the club floor' };

export const END_TEXT: Record<DareEnd, string> = {
  yes: 'She said yes', refused: 'She said no', laughed: 'She laughed it off', bowed: 'You bowed out gracefully', walked: 'She walked out on you', seen: 'You saw through her', lure: 'She asked you to meet her later',
};

/** Where the dare happens: what it is, how many eyes could be on it, the thrill. */
export const CLOSE_INFO: Record<Exclude<Close, 'back'>, { label: string; say: string; at: DareAt | 'out'; expose: number; thrill: number; yes: string }> = {
  desk: { label: 'Your desk, door unlocked', at: 'office', expose: 0.18, thrill: 1, say: 'Upstairs. My desk. And I\'m not locking the door.', yes: 'She went up the stairs ahead of you. The door stayed unlocked. Downstairs, the band never missed a beat.' },
  count: { label: 'During the count', at: 'office', expose: 0.32, thrill: 2, say: 'My office, right now. The count\'s on the desk, and the bagman is due up those stairs in ten minutes.', yes: 'Ten minutes later the bagman knocked, waited, and decided he would come back after the next set.' },
  coatcheck: { label: 'The coat-check room, mid-show', at: 'club', expose: 0.45, thrill: 3, say: 'The coat-check room. Now. In the middle of the floor show.', yes: 'The floor show ran long. Nobody could say why the coat check was closed for twenty minutes, and everybody had a theory.' },
  booth: { label: 'The booth behind the curtain', at: 'club', expose: 0.28, thrill: 2, say: 'The back booth. Behind the velvet curtain, while the band plays.', yes: 'The curtain stayed drawn through two numbers and an encore.' },
  roof: { label: 'The roof, under the pier lights', at: 'club', expose: 0.15, thrill: 2, say: 'The roof. Under the lights from the pier.', yes: 'Up on the roof the lights of the pier went on and off. So did everything else.' },
  motel: { label: 'Room 9 at the Starlight, later', at: 'out', expose: 0.1, thrill: 1, say: 'Room 9. I\'ll be there.', yes: 'She finished her drink and left first. Room 9 at the Starlight, in an hour.' },
};

export const APPROACH_INFO: Record<Approach, { label: string; hint: string; say: string[] }> = {
  flirt: { label: 'Flirt', hint: 'charm, plain and simple', say: ['That dress ought to be against the law in this county. Lucky for you, I know the law in this county.', 'I\'ve been watching you all night. So has everybody. The difference is, I\'m going to do something about it.'] },
  dare: { label: 'Dare her', hint: 'for a woman who likes a little danger', say: ['I\'ll bet you a hundred dollars you\'ve never done one thing in your life you couldn\'t tell a priest.', 'Everybody in this room plays it safe. You look like a girl who\'s tired of safe.'] },
  money: { label: 'Money on the table', hint: 'a working girl\'s language; an insult to a proud one', say: ['There\'s {m} under this napkin. It\'s yours if you\'re half as much fun as you look.', 'Let\'s not waste each other\'s evening. {m}, and nobody has to know.'] },
  flatter: { label: 'Flattery', hint: 'tell her what she wants to hear', say: ['Sinatra played this room in \'58. He\'d have stayed the summer if he\'d seen you.', 'Every man in here is pretending not to look at you. I\'m the only one honest enough to stop pretending.'] },
  status: { label: 'Who you are', hint: 'the boss of the place, and the island', say: ['See that door at the top of the stairs? Nobody goes up there unless I say so. I\'m saying so.', 'The mayor asks me for a table. I\'m asking you for ten minutes.'] },
};

const COUNTER_INFO: Record<Counter, { label: string; hint: string; say: string }> = {
  name: { label: 'Stop talking', hint: 'go straight to the dare', say: 'Then let\'s quit talking.' },
  sweeten: { label: 'Sweeten it', hint: 'more money on the table', say: 'And there\'s another {m} in it, for the nerve.' },
  wit: { label: 'Banter', hint: 'keep her laughing with you', say: 'I\'m not a gambling man. That\'s why I only bet on sure things.' },
  straight: { label: 'Answer her straight', hint: 'honesty, for a woman who tests', say: 'No line. I liked the look of you, and I\'m too old to pretend I didn\'t.' },
  push: { label: 'Push', hint: 'pressure: she may walk out, and the room sees it', say: 'Don\'t make me ask twice, sweetheart.' },
  take: { label: 'Take her dare', hint: 'she leads, and she picked somewhere wild', say: 'You\'re on. Lead the way.' },
  call: { label: 'Call her bluff', hint: 'she backs down, or she does it', say: 'You won\'t do it.' },
  bow: { label: 'Bow out', hint: 'graceful: the room respects it', say: 'You win. I\'m out of my league, and I know it.' },
  laughToo: { label: 'Laugh with her', hint: 'take the sting out; maybe win her back', say: 'Berle\'s got nothing on me. Wait for the second act.' },
  double: { label: 'Double down', hint: 'risky: she may tell you where to go', say: 'I\'m serious. Dead serious.' },
  letgo: { label: 'Let it go', hint: 'no harm done', say: 'Can\'t blame a man for trying. Enjoy the show.' },
  along: { label: 'Go along with her', hint: 'her terms, her way', say: 'Why not.' },
  see: { label: 'Read her', hint: 'something about this is off', say: 'Funny. Most girls want to see the boardwalk, not my office.' },
  walk: { label: 'Walk away', hint: 'end it here', say: 'On second thought, I\'ll pass.' },
};

/** Which comebacks he has after each of her answers. */
export const COUNTERS: Record<Exclude<Reply, 'refuse'>, Counter[]> = {
  warm: ['name', 'sweeten', 'wit'],
  test: ['straight', 'wit', 'push'],
  raise: ['take', 'call', 'bow'],
  laugh: ['laughToo', 'double', 'letgo'],
  turn: ['along', 'see', 'walk'],
};

/* ------------------------------------------------------------------ */
/* Her read of him: the base of every answer                           */
/* ------------------------------------------------------------------ */

export interface DareRead {
  /** 0-1: how game she is, before the line he picks. */
  g: number;
  reasons: { label: string; value: number }[];
  pro: boolean;
  /** Her line: no line he says crosses it. */
  line?: string;
  bold: number;
  wary: number;
  greed: number;
  proud: number;
  honest: number;
  /** Hidden truth (never put in reasons or labels). */
  agent?: AgentKind;
  price: number;
  married: boolean;
}

const T = (c: Character, t: Trait) => (hasTrait(c, t) ? 1 : 0);

export function dareRead(s: GameState, id: string): DareRead {
  const c = s.characters[id];
  const boss = player(s);
  const p = s.nightlife?.people[id];
  const pro = eveningKindOf(s, id) === 'paid';
  const reasons: { label: string; value: number }[] = [];
  const add = (label: string, v: number) => { if (Math.round(v * 100)) reasons.push({ label, value: Math.round(v * 100) }); return v; };
  let g = 0.3;
  if (!c) return { g: 0, reasons: [], pro, bold: 0, wary: 0, greed: 0, proud: 0, honest: 0, price: 0, married: false };
  g += add('What she thinks of you', clamp(romanticOpinion(s, id) / 160, -0.3, 0.3));
  g += add('How you look to her', appeal(s, c, boss).value / 140);
  const af = affairOf(s, id);
  if (af?.aff) g += add('Her feelings for you', af.aff / 320);
  if (p?.attach) g += add('She is attached to you', p.attach / 450);
  const mood = mindOf(s, id)?.mood;
  if (mood === 'content' || mood === 'proud') g += add('In a good mood tonight', 0.05);
  else if (mood === 'angry' || mood === 'grieving') g += add(mood === 'angry' ? 'Angry tonight' : 'Grieving', -0.15);
  else if (mood === 'afraid') g += add('Frightened of something', -0.1);
  const married = marriedOf(s, c);
  const man = manOf(s, c);
  if (married) g += add('She is married', -0.12);
  if (man?.faction === 'player') g += add('Her husband works for you', -0.1);
  if (p?.scorned !== undefined || p?.grudge !== undefined || p?.barred !== undefined) g += add('She has not forgotten the last time', -0.4);
  if (hasTrait(boss, 'Cruel')) g += add('People say you can be cruel', -0.1);
  if (hasTrait(boss, 'Charming')) g += add('You could talk a cat off a fish truck', 0.06);
  const agent = agentOf(s, id)?.status === 'working' ? s.honey!.agents[id].kind : undefined;
  // A woman with a job to do is easy. It shows only as eagerness (a warning sign in itself).
  if (agent) g += add('She seems very willing', 0.25);
  const bold = T(c, 'Hot-headed') * 0.5 + T(c, 'Gambler') * 0.5 + T(c, 'Ambitious') * 0.25 + (agent ? 0.3 : 0);
  const wary = T(c, 'Cowardly') * 0.5 + T(c, 'Paranoid') * 0.4 + T(c, 'Pious') * 0.5 + T(c, 'Patient') * 0.2;
  const needs = (p && p.savings < 200) || s.women?.arcs[id]?.amb === 'money' ? 0.5 : 0;
  const greed = T(c, 'Greedy') * 0.6 + needs + (pro ? 0.6 : 0);
  const proud = pro ? 0 : 0.4 + T(c, 'Ambitious') * 0.2 + T(c, 'Vengeful') * 0.2 - needs * 0.4;
  const honest = T(c, 'Honest') * 0.7 + T(c, 'Pious') * 0.4 + T(c, 'Patient') * 0.2;
  let line: string | undefined;
  if (hasTrait(c, 'Pious')) line = 'Her faith';
  else if (p?.bounds.includes('no_married') && boss.spouseId) line = 'Not with a married man';
  else if (agent) line = undefined;
  else if (!pro && hasTrait(c, 'Honest') && married) line = 'She keeps her vows';
  const price = pro ? Math.max(50, askingPrice(s, id, 'car').price) : 0;
  return { g: clamp(g, 0.03, 0.92), reasons, pro, line, bold, wary, greed, proud, honest, agent, price, married };
}

/* ------------------------------------------------------------------ */
/* Odds per line                                                       */
/* ------------------------------------------------------------------ */

function moneyFor(rd: DareRead, a: Approach | Counter): number {
  if (a === 'money') return rd.pro ? Math.round((rd.price * 1.5) / 50) * 50 : 200;
  if (a === 'sweeten') return rd.pro ? Math.round((rd.price * 0.75) / 50) * 50 : 250;
  return 0;
}

export function approachOdds(s: GameState, rd: DareRead, a: Approach): number {
  const boss = player(s);
  let f = 0;
  switch (a) {
    case 'flirt': f = 0.05 - rd.honest * 0.2 - (rd.pro ? 0.1 : 0); break;
    case 'dare': f = rd.bold * 0.35 - rd.wary * 0.3; break;
    case 'money': f = rd.pro ? 0.3 : rd.greed * 0.3 - rd.proud * 0.45; break;
    case 'flatter': f = 0.04 + (rd.proud > 0.4 ? 0.08 : 0) - rd.wary * 0.1 + (hasTrait(boss, 'Charming') ? 0.05 : 0); break;
    case 'status': f = rd.greed * 0.15 + (rd.proud > 0.45 ? 0.08 : 0) - (rd.honest * 0.15); break;
  }
  return clamp(rd.g + f, rd.line ? 0.02 : 0.03, rd.line ? 0.15 : 0.92);
}

function counterOdds(s: GameState, rd: DareRead, reply: Reply, k: Counter): number {
  const boss = player(s);
  const charm = hasTrait(boss, 'Charming') ? 0.1 : 0;
  let p: number;
  switch (k) {
    case 'name': p = rd.g + 0.15 + rd.bold * 0.1; break;
    case 'sweeten': p = rd.g + (rd.pro ? 0.3 : rd.greed * 0.2 - rd.proud * 0.3); break;
    case 'wit': p = rd.g + 0.1 + charm - (reply === 'test' ? rd.honest * 0.15 : 0); break;
    case 'straight': p = rd.g + 0.1 + rd.honest * 0.25; break;
    case 'push': p = rd.g - 0.2 - rd.proud * 0.1; break;
    case 'take': p = 0.75 + rd.g * 0.2; break;
    case 'call': p = 0.35 + rd.bold * 0.3; break;
    case 'bow': p = 1; break;
    case 'laughToo': p = rd.g * 0.7 + charm; break;
    case 'double': p = rd.g * 0.5 - 0.05; break;
    case 'letgo': p = 1; break;
    case 'along': p = 0.85; break;
    case 'see': p = rd.agent ? perception(s, protectionFor(s, s.playerId, 'night').cut) + 0.15 : 0.5; break;
    case 'walk': p = 1; break;
  }
  return clamp(p, rd.line ? 0 : 0.03, rd.line ? 0.15 : 0.95);
}

export function closeOdds(s: GameState, rd: DareRead, k: Close, herPick?: Close): number {
  if (k === 'back') return 1;
  if (rd.line) return 0;
  const info = CLOSE_INFO[k];
  let f = 0.15;
  if (k === 'desk') f += 0.05;
  if (k === 'count') f += -0.1 + rd.bold * 0.2;
  if (k === 'coatcheck') f += -0.18 + rd.bold * 0.3 - rd.wary * 0.25;
  if (k === 'roof') f += rd.bold * 0.15 + (isInSeason(s.date) ? 0.05 : -0.25);
  if (k === 'motel') f += 0.6;
  if (herPick === k) f += 0.35;
  if (rd.agent === 'rival' || rd.agent === 'fbi' || rd.agent === 'crew') f += info.at === 'office' ? 0.25 : -0.1;
  return clamp(rd.g + f, 0.03, 0.95);
}

/* ------------------------------------------------------------------ */
/* Her lines                                                           */
/* ------------------------------------------------------------------ */

const HER: Record<Reply | 'refusePious' | 'turnPro' | 'turnSpy' | 'turnSetup', string[]> = {
  warm: ['Keep talking. You\'re doing fine.', 'Well. Look who finally worked up the nerve.', 'I was wondering how long you\'d make me wait.'],
  test: ['And what would your wife say about that?', 'Do you use that line on every girl at the bar, or am I special?', 'Big talk. What happens when somebody finally says yes?'],
  raise: ['Your office? Every girl on Pacific Avenue has seen your office. I want something nobody\'s done.', 'Upstairs is for amateurs, honey. I\'m thinking the coat-check room. During the floor show.', 'If you want to impress me, let\'s do it where the whole joint could walk in on us.'],
  laugh: ['Oh, honey. That\'s the funniest thing I\'ve heard since Milton Berle.', 'You\'re cute when you try.', 'Ha! Tell me another one.'],
  turn: [],
  refuse: ['No. And don\'t ask me twice.', 'I\'m not that kind of girl, and you\'re not that kind of lucky.', 'Go home to your wife, Mister.'],
  refusePious: ['I\'ll pray for you, Mister. Somebody ought to.', 'I go to the eight o\'clock Mass at St. Ann\'s. You know where to find me if you ever want to be forgiven.'],
  turnPro: ['You want outrageous, outrageous costs. {p}, cash, before the band takes five. And the girl at the coat check gets a twenty to look the other way.', '{p} for the nerve, honey. The rest is just geography.'],
  turnSpy: ['Not out here. Upstairs. I want to see the office everybody whispers about.', 'Show me your office first. I want to see where the famous man keeps his secrets.'],
  turnSetup: ['Not here. Too many eyes. Room 9 at the Starlight, on the Boulevard, in an hour. Come alone, the way a gentleman should.', 'Not in front of all these people. The Starlight, room 9, after midnight. Just you.'],
};

const AFTER: Record<'go' | 'laugh' | 'refuse' | 'walk' | 'bowed' | 'seen' | 'backed' | 'pick', string[]> = {
  go: ['Then quit talking and show me.', 'All right, big shot. Where?', 'Now you\'re talking my language.'],
  laugh: ['Another time, maybe. Maybe not.', 'You almost had me. Almost.', 'Save it for the next girl.'],
  refuse: ['That\'s it. I\'m done with you.', 'Who do you think you\'re talking to?'],
  walk: ['She picked up her purse and walked out. Half the room watched her go.', 'She threw her drink in your face, and the band played on.'],
  bowed: ['She laughed, and touched your arm on the way past. "You\'re all right, you know that?"', '"A gentleman. On this island. Who knew."'],
  seen: ['She covered it with a laugh, but she covered it a second too late.', 'For a second she didn\'t have an answer. Then she did, and it was a good one. Too good.'],
  backed: ['"You\'d let me, wouldn\'t you? That\'s the trouble with you." She laughed and went back to her friends.'],
  pick: ['Follow me.', 'Try to keep up.'],
};

const CLOSE_NO = ['Not that. Not tonight.', 'You almost had me.', 'I\'d do a lot of things, Mister. Not that.'];

const SIGNS: Record<AgentKind, string[]> = {
  rival: ['She looked at the safe longer than she looked at you.', 'She asked who the fella with the Packard is. You never mentioned a Packard.'],
  fbi: ['Her purse sat open on the bar, pointed at you the whole time.', 'She knew Wednesday was the count. You never told her that.'],
  crew: ['She dropped the name of one of your men like she had known him for years.', 'She asked where you do the counting. Nobody asks that.'],
  setup: ['She asked, twice, whether you drive yourself home.', 'She kept checking the clock over the bar.'],
};

/* ------------------------------------------------------------------ */
/* The script, replayed                                                */
/* ------------------------------------------------------------------ */

export interface DareLine { who: 'boss' | 'them' | 'narrator'; text: string }
export interface DareOption { move: DareMove; label: string; say: string; odds: number; hint: string; block?: string }

export interface DareRun {
  id: string;
  at: DareAt;
  moves: DareMove[];
  replies: Reply[];
  log: DareLine[];
  end?: DareEnd;
  close?: Close;
  /** The dare she named herself (she raised it, or she turned it). */
  herPick?: Close;
  /** Money on the table (paid only if she says yes). */
  money: number;
  options: DareOption[];
  /** Warning signs the boss caught in the scene (shown as narrator lines). */
  signs: string[];
  /** Her warmth and anger 0-100 (the window's meters). */
  warmth: number;
  anger: number;
  read: DareRead;
  block?: string;
}

/** Can the boss try this with her at all? (adults only; mature content on; at the club, or a woman he sees). */
export function dareBlock(s: GameState, id: string): string | undefined {
  const b = honeyBlock(s, id);
  if (b) return b;
  if (!boldEligible(s, id) && !affairOf(s, id)) return `${s.characters[id]?.firstName ?? 'She'} isn't someone you could try that with`;
  return undefined;
}

const fill = (x: string, m: number, p: number) => x.replace('{m}', $(m)).replace('{p}', $(p));

/**
 * Replay the scene from the boss's moves (pure). Moves that do not fit the
 * beat end the replay where they are. The options are what he can say next.
 */
export function runDare(s: GameState, id: string, at: DareAt, moves: readonly DareMove[] = []): DareRun {
  const rd = dareRead(s, id);
  const key = `${s.week}|dare|${id}|${at}`;
  const run: DareRun = { id, at, moves: [], replies: [], log: [], money: 0, options: [], signs: [], warmth: Math.round(rd.g * 100), anger: 0, read: rd };
  run.block = dareBlock(s, id);
  if (run.block) return run;
  const c = s.characters[id]!;
  const her = c.firstName;
  const pocket = pocketOf(s);
  const say = (who: DareLine['who'], text: string) => run.log.push({ who, text });
  const cut = protectionFor(s, s.playerId, 'night').cut;
  const sign = (k: string) => {
    if (!rd.agent || run.signs.length >= 2) return;
    if (hroll(s, `${key}|sign|${k}`) >= perception(s, cut)) return;
    const t = hpick(s, `${key}|signt|${k}`, SIGNS[rd.agent]);
    if (run.signs.includes(t)) return;
    run.signs.push(t);
    say('narrator', t);
  };
  say('narrator', at === 'office' ? `${her} is upstairs in your office, a drink in her hand, looking at the photographs on the wall.` : `${her} is at the end of the bar. The band is between numbers.`);
  for (const mv of moves) {
    const beat = run.moves.length;
    if (run.end) break;
    if (beat === 0) {
      if (!APPROACHES.includes(mv as Approach)) break;
      const a = mv as Approach;
      const m = moneyFor(rd, a);
      if (m > pocket) break;
      run.moves.push(a);
      run.money += m;
      say('boss', fill(hpick(s, `${key}|say0|${a}`, APPROACH_INFO[a].say), m, rd.price));
      const p = approachOdds(s, rd, a);
      const r = hroll(s, `${key}|r0|${a}`);
      let rep: Reply;
      if (r < p) {
        const q = hroll(s, `${key}|q0|${a}`);
        if (rd.agent && !rd.line && q < 0.5) rep = 'turn';
        else if (rd.pro && !rd.line && a !== 'money' && q < 0.35) rep = 'turn';
        else if (!rd.line && rd.bold >= 0.5 && q < 0.7) rep = 'raise';
        else if ((rd.honest > 0 || rd.married || rd.wary >= 0.4) && q < 0.8) rep = 'test';
        else rep = rd.line ? 'test' : 'warm';
      } else rep = rd.line || r > p + (1 - p) * 0.55 ? 'refuse' : 'laugh';
      run.replies.push(rep);
      if (rep === 'turn') {
        run.herPick = rd.agent === 'setup' ? 'motel' : rd.agent ? (at === 'office' ? 'desk' : 'count') : undefined;
        if (rd.pro && !rd.agent) run.money = Math.max(run.money, rd.price);
      }
      if (rep === 'raise') run.herPick = hpick(s, `${key}|pick`, ['coatcheck', 'roof', 'booth'] as Close[]);
      const pool = rep === 'refuse' && rd.line === 'Her faith' ? HER.refusePious : rep === 'turn' ? (rd.agent === 'setup' ? HER.turnSetup : rd.agent ? HER.turnSpy : HER.turnPro) : HER[rep];
      let text = fill(hpick(s, `${key}|her0|${a}|${rep}`, pool), run.money, run.money || rd.price);
      if (rep === 'test' && text.includes('wife') && !player(s).spouseId) text = HER.test[1];
      if (rep === 'raise' && run.herPick !== 'coatcheck' && /coat-check/.test(text)) text = HER.raise[0];
      say('them', text);
      run.warmth = clamp(run.warmth + (rep === 'warm' || rep === 'raise' || rep === 'turn' ? 12 : rep === 'test' ? 2 : rep === 'laugh' ? -10 : -25));
      if (rep === 'refuse') { run.anger = clamp(run.anger + 40); run.end = 'refused'; }
      if (rep === 'turn') sign('turn');
      continue;
    }
    if (beat === 1) {
      const rep = run.replies[0] as Exclude<Reply, 'refuse'>;
      if (!COUNTERS[rep]?.includes(mv as Counter)) break;
      const k = mv as Counter;
      const m = k === 'sweeten' ? moneyFor(rd, k) : 0;
      const ask = k === 'see' && rd.pro && !rd.agent ? -Math.round((run.money * 0.25) / 10) * 10 : 0;
      if (run.money + m > pocket) break;
      if (k === 'along' && run.money > pocket) break;
      run.moves.push(k);
      run.money += m + ask;
      const line = rd.pro && !rd.agent && k === 'see' ? `Make it ${$(run.money)}, and you've got a deal.` : rd.agent === 'setup' && k === 'along' ? 'Room 9. I\'ll be there.' : fill(COUNTER_INFO[k].say, m, rd.price);
      say('boss', line);
      const p = counterOdds(s, rd, rep, k);
      const ok = hroll(s, `${key}|r1|${k}`) < p;
      if (k === 'bow' || k === 'letgo') { run.end = 'bowed'; say('them', hpick(s, `${key}|bow`, AFTER.bowed)); run.warmth = clamp(run.warmth + 8); continue; }
      if (k === 'walk') { run.end = 'bowed'; say('them', 'Suit yourself, Mister.'); continue; }
      if (k === 'see' && rd.agent) {
        if (ok) { run.end = 'seen'; say('narrator', hpick(s, `${key}|seen`, AFTER.seen)); run.signs.push(`${her} turned your question aside a second too late.`); }
        else { run.end = 'laughed'; say('them', 'You\'re a suspicious man. I like that in a man. Some other night.'); }
        continue;
      }
      if (k === 'along' && rd.agent === 'setup') { run.close = 'motel'; run.end = 'lure'; say('narrator', CLOSE_INFO.motel.yes); sign('lure'); continue; }
      if (ok) {
        run.replies.push('warm');
        run.warmth = clamp(run.warmth + 10);
        if (k === 'take' || (k === 'call' && run.herPick)) { say('them', hpick(s, `${key}|pick2`, AFTER.pick)); }
        else say('them', hpick(s, `${key}|go|${k}`, AFTER.go));
        if (k === 'push') run.anger = clamp(run.anger + 15);
      } else if (k === 'push' || k === 'double') {
        run.replies.push('refuse');
        run.anger = clamp(run.anger + 45);
        run.end = 'walked';
        say('them', hpick(s, `${key}|ref1`, AFTER.refuse));
        say('narrator', hpick(s, `${key}|walk1`, AFTER.walk));
      } else {
        run.replies.push('laugh');
        run.end = 'laughed';
        say('them', k === 'call' ? AFTER.backed[0] : hpick(s, `${key}|lau1|${k}`, AFTER.laugh));
      }
      continue;
    }
    if (beat === 2) {
      const ks = closesFor(run);
      if (!ks.includes(mv as Close)) break;
      const k = mv as Close;
      run.moves.push(k);
      if (k === 'back') { run.end = 'bowed'; say('boss', 'You kiss her hand. "Another night."'); say('them', hpick(s, `${key}|bow2`, AFTER.bowed)); continue; }
      const info = CLOSE_INFO[k];
      say('boss', info.say);
      const p = closeOdds(s, rd, k, run.herPick);
      if (hroll(s, `${key}|r2|${k}`) < p) { run.end = 'yes'; run.close = k; say('narrator', info.yes); sign('close'); }
      else { run.end = 'refused'; say('them', hpick(s, `${key}|no2|${k}`, CLOSE_NO)); run.warmth = clamp(run.warmth - 10); }
      continue;
    }
    break;
  }
  run.options = optionsFor(s, run, pocket);
  return run;
}

/** The dares he can name (the room he is in; the one she named herself; or calling it a night). */
export function closesFor(run: DareRun): Close[] {
  const here = (['desk', 'count', 'coatcheck', 'booth', 'roof'] as Close[]).filter((k) => k !== 'motel' && CLOSE_INFO[k as Exclude<Close, 'back'>].at === run.at);
  const out = run.herPick && run.herPick !== 'motel' ? [run.herPick, ...here.filter((k) => k !== run.herPick)] : here;
  return [...out, 'back'];
}

function optionsFor(s: GameState, run: DareRun, pocket: number): DareOption[] {
  if (run.end || run.block) return [];
  const rd = run.read;
  const beat = run.moves.length;
  if (beat === 0) {
    return APPROACHES.map((a) => {
      const m = moneyFor(rd, a);
      return { move: a, label: m ? `${APPROACH_INFO[a].label} (${$(m)})` : APPROACH_INFO[a].label, say: fill(APPROACH_INFO[a].say[0], m, rd.price), odds: approachOdds(s, rd, a), hint: APPROACH_INFO[a].hint, block: m > pocket ? `Your pocket holds ${$(pocket)}` : undefined };
    });
  }
  if (beat === 1) {
    const rep = run.replies[0] as Exclude<Reply, 'refuse'>;
    return (COUNTERS[rep] ?? []).map((k) => {
      const m = k === 'sweeten' ? moneyFor(rd, k) : 0;
      const proSee = k === 'see' && rd.pro && !rd.agent;
      const label = proSee ? 'Haggle' : rep === 'turn' && k === 'along' && rd.pro && !rd.agent ? `Her terms (${$(run.money)})` : m ? `${COUNTER_INFO[k].label} (+${$(m)})` : COUNTER_INFO[k].label;
      const hint = proSee ? 'knock a quarter off her figure' : rep === 'turn' && k === 'along' ? (rd.agent === 'setup' ? 'meet her later, alone, where she says' : rd.agent ? 'take her upstairs, the way she wants' : 'pay her figure, if she says yes') : COUNTER_INFO[k].hint;
      return { move: k, label, say: fill(COUNTER_INFO[k].say, m, rd.price), odds: counterOdds(s, rd, rep, k), hint, block: run.money + m > pocket ? `Your pocket holds ${$(pocket)}` : undefined };
    });
  }
  if (beat === 2) {
    return closesFor(run).map((k) => k === 'back'
      ? { move: k, label: 'Call it a night', say: 'Kiss her hand and call it a night.', odds: 1, hint: 'no harm done; she remembers it kindly' }
      : { move: k, label: `${CLOSE_INFO[k].label}${run.herPick === k ? ' (her dare)' : ''}`, say: CLOSE_INFO[k].say, odds: closeOdds(s, rd, k, run.herPick), hint: `${Math.round(CLOSE_INFO[k].expose * 100)}% somebody sees${CLOSE_INFO[k].thrill >= 3 ? '; the whole club will talk' : ''}` });
  }
  return [];
}
