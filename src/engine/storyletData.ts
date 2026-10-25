import { ageOn } from './calendar';
import { capos, crew, displayName, isFree, livingDynasty } from './characters';
import { opinion } from './relations';
import { openingFeud, openingRival } from './openings';
import { rand, type RngHolder } from './rng';
import type { Choice, Effect, GameState, RivalId } from './types';

/**
 * The storylets' situations (storylets.ts builds them): each reads the real
 * state for its cast, and returns 2-4 tellings, titles and 3-4 choices
 * tagged with a tone (a complication adds a chip to one tone). Many are
 * drawn from the history of the American Mafia, 1960-1985: the books closed
 * since the 1957 raid upstate, associates who can never be made, old guard
 * against young turks, the labor and concrete rackets, hijackings off the
 * Parkway, the made man who testified on television in 1963, RICO in 1970,
 * witness protection, long-term undercover men, restaurant meetings, the
 * one rule nobody breaks (you do not touch a prosecutor), and the 1976
 * casino referendum. Real people stay in the background and are never named
 * as actors; every choice is a chip that already exists.
 */

export type Tone = 'soft' | 'hard' | 'sly' | 'money' | 'away';
export type LetChoice = Choice & { tone: Tone };
export interface Cast {
  actors?: string[];
  charId?: string;
  rival?: RivalId;
  rivalBoss?: string;
}

export interface Situation<K extends Cast = Cast> {
  id: string;
  theme: 'crew' | 'family' | 'rivals' | 'law' | 'town' | 'business' | 'world';
  weight: number;
  /** The tellings name their own place: no setting sentence in front. */
  placed?: boolean;
  when?: (s: GameState) => boolean;
  cast: (s: GameState, h: RngHolder) => K | undefined;
  title: (s: GameState, k: K) => string[];
  body: (s: GameState, k: K) => string[];
  choices: (s: GameState, k: K, label: string) => LetChoice[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const P = <T,>(h: RngHolder, xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(rand(h) * xs.length)] : undefined);
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const yr = (s: GameState) => s.date.y;
const mo = (s: GameState) => s.date.m;

const money = (amount: number): Effect => ({ type: 'money', amount });
const resp = (amount: number): Effect => ({ type: 'respect', amount });
const heat = (bar: 'local' | 'family' | 'federal', amount: number): Effect => ({ type: 'heat', bar, amount });
const op = (from: string, to: string, amount: number, reason: string): Effect => ({ type: 'opinion', from, to, amount, reason, decay: 1 });
const crewOp = (amount: number, reason: string): Effect => ({ type: 'crewOpinion', amount, reason });
const famOp = (amount: number, reason: string): Effect => ({ type: 'familyOpinion', amount, reason });
const rivOp = (rival: RivalId, amount: number, reason: string): Effect => ({ type: 'rivalOpinion', rival, amount, reason });
const favor = (amount: number): Effect => ({ type: 'favor', amount });
const story = (charId: string, text: string): Effect => ({ type: 'story', charId, text });
const fear = (from: string, to: string, amount: number): Effect => ({ type: 'meter', from, to, meter: 'fear', amount });
const grudge = (from: string, to: string, amount: number): Effect => ({ type: 'meter', from, to, meter: 'grievance', amount });
const ch = (id: string, tone: Tone, label: string, because: string, effects: Effect[], detail?: string): LetChoice => ({ id, tone, label, because, effects, ...(detail ? { detail } : {}) });

function men(s: GameState) {
  return crew(s).filter((c) => isFree(s, c) && c.id !== s.playerId && (c.rank === 'soldier' || c.rank === 'capo' || c.rank === 'associate'));
}
const nm = (s: GameState, id: string) => displayName(s.characters[id]);
const fn = (s: GameState, id: string) => s.characters[id].firstName;

function mobRival(s: GameState, h: RngHolder): { rival: RivalId; rivalBoss: string; rs: string; L: string } | undefined {
  const rs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  const first = openingRival(s);
  const r = rs.find((x) => x.id === first) ?? P(h, rs);
  if (!r) return undefined;
  return { rival: r.id, rivalBoss: displayName(s.characters[r.leaderId]), rs: r.shortName, L: displayName(s.characters[r.leaderId]) };
}

const RACKET_NAMES = ['the card game above the Anchor Bar', 'the policy bank behind the bus depot', 'the jukebox route on Pacific Avenue', 'the wire room over the Rio Grande barbershop', 'the crap game at the Ship\'s Wheel', 'the cigarette machines in the Crest motels', 'the parking concession at the Convention Hall', 'the bingo nights at the Fire Company'];

function playerBiz(s: GameState, h: RngHolder): string {
  const own = s.businesses.filter((b) => b.owner === 'player');
  const b = P(h, own.slice(-12));
  if (!b) return P(h, RACKET_NAMES)!;
  return /^The |'s\b/.test(b.name) ? b.name : `the ${b.name}`;
}

/* ------------------------------------------------------------------ */
/* The situations                                                      */
/* ------------------------------------------------------------------ */

const feud: Situation<Cast & { a: string; b: string; what: string }> = {
  id: 'feud', theme: 'crew', weight: 5,
  cast: (s, h) => {
    const ms = men(s).filter((c) => c.rank !== 'associate');
    const of = openingFeud(s);
    if (of) return { a: of[0], b: of[1], what: playerBiz(s, h), actors: [of[0], of[1]], charId: of[0] };
    if (ms.length < 2) return undefined;
    let best: [string, string] | undefined;
    let low = 999;
    for (let i = 0; i < Math.min(ms.length, 12); i++) for (let j = i + 1; j < Math.min(ms.length, 12); j++) {
      const v = opinion(s, ms[i].id, ms[j].id) + rand(h) * 30;
      if (v < low) { low = v; best = [ms[i].id, ms[j].id]; }
    }
    const [a, b] = best!;
    return { a, b, what: playerBiz(s, h), actors: [a, b], charId: a };
  },
  title: (s, k) => [`${fn(s, k.a)} and ${fn(s, k.b)}`, `Bad blood over ${k.what}`, `${fn(s, k.a)} wants ${fn(s, k.b)} off ${k.what}`],
  body: (s, k) => [
    `${nm(s, k.a)} and ${nm(s, k.b)} have not spoken in three weeks, and the reason is ${k.what}: ${fn(s, k.a)} says he built it, ${fn(s, k.b)} says he has been carrying it. Now they both want you to say so.`,
    `${nm(s, k.b)} put his own man on ${k.what} without asking. ${nm(s, k.a)} took the man off it, in front of customers. Neither will give an inch, and both have friends.`,
    `It started as a joke at the Elks about ${k.what} and who earns on it, and it stopped being a joke when ${fn(s, k.a)} stopped laughing. ${nm(s, k.b)} wants it settled by you, today.`,
  ],
  choices: (s, k) => [
    ch('a', 'hard', `${fn(s, k.a)} keeps it`, `gave ${k.what} to ${fn(s, k.a)}`, [op(k.a, s.playerId, 10, 'Ruled for me'), op(k.b, s.playerId, -10, 'Ruled against me'), story(k.a, `Won ${k.what} from ${fn(s, k.b)} at the boss's table.`)]),
    ch('b', 'hard', `${fn(s, k.b)} keeps it`, `gave ${k.what} to ${fn(s, k.b)}`, [op(k.b, s.playerId, 10, 'Ruled for me'), op(k.a, s.playerId, -10, 'Ruled against me'), story(k.b, `Won ${k.what} from ${fn(s, k.a)} at the boss's table.`)]),
    ch('split', 'soft', 'Split it down the middle', `split ${k.what} between ${fn(s, k.a)} and ${fn(s, k.b)}`, [op(k.a, s.playerId, 2, 'Fair, I guess'), op(k.b, s.playerId, 2, 'Fair, I guess'), op(k.a, k.b, 6, 'The boss made us shake')]),
    ch('house', 'money', 'Take it for the house ($700 a month, starting now)', `took ${k.what} away from both of them`, [money(700), op(k.a, s.playerId, -6, 'Took it from both of us'), op(k.b, s.playerId, -6, 'Took it from both of us')]),
  ],
};

const reelect: Situation<Cast & { name: string; office: string; when: string; election?: string; cand?: string }> = {
  id: 'reelect', theme: 'town', weight: 4,
  cast: (s, h) => {
    const now = yr(s) * 12 + mo(s) - 1;
    const es = (s.pol?.elections ?? []).filter((e) => e.when >= now && e.when - now <= 7 && e.candidates.some((c) => c.incumbent));
    const e = P(h, es);
    if (e) {
      const c = e.candidates.find((x) => x.incumbent)!;
      const p = s.pol!.people[c.id];
      if (p?.alive) {
        const months = e.when - now;
        return { name: `${p.first} ${p.last}`, office: p.title, when: months <= 1 ? 'next month' : `in ${months} months`, election: e.id, cand: c.id };
      }
    }
    const o = Object.values(s.characters).find((x) => x.alive && (x.office === 'City councilman' || x.office === 'State assemblyman'));
    return o ? { name: `${o.firstName} ${o.lastName}`, office: o.office!, when: 'in the fall', actors: [o.id] } : undefined;
  },
  title: (_s, k) => [`${k.name} wants another term`, `${k.name}'s campaign`, `Re-elect ${k.name.split(' ')[1] ?? k.name}`],
  body: (_s, k) => [
    `${k.name} (${k.office}) is up for re-election ${k.when}, and his opponent is a young lawyer who talks about "cleaning up the island." He would like to know where you stand, and he would like it in cash.`,
    `${k.name} (${k.office}) has posters on every telephone pole from the Crest to North Wildwood, and a campaign manager who keeps calling the Shamrock. The vote is ${k.when}. He has been a friend. Friends cost money in an election year.`,
    `The ${k.office} race is ${k.when}. ${k.name} has held the seat long enough to know who his friends are, and long enough that some people want him out. He asks to see you, privately, at a time of your choosing.`,
  ],
  choices: (_s, k) => [
    ch('fund', 'money', `A campaign envelope (${$(800)})`, `put money behind ${k.name}`, [money(-800), ...(k.election && k.cand ? [{ type: 'pol', op: { op: 'campaign', election: k.election, cand: k.cand, fund: 800 } } as Effect] : [favor(1)])]),
    ch('crowd', 'hard', 'Fill his rally with your people', `turned out the crew for ${k.name}`, [resp(1), heat('local', 2), ...(k.election ? [] : [favor(1)])], 'Every face in the photograph will be one the County detectives know.'),
    ch('both', 'sly', 'Give both sides a little', `gave money to both sides in the ${k.office} race`, [money(-600), favor(1), heat('federal', 1)], 'Whoever wins owes you something. Whoever loses knows it.'),
    ch('out', 'away', 'Stay out of it', `stayed out of the ${k.office} race`, [resp(-1)]),
  ],
};

const widow: Situation<Cast & { w: string; dead: string; deadId: string; ago: number }> = {
  id: 'widow', theme: 'town', weight: 3,
  cast: (s, h) => {
    const ds = Object.values(s.characters).filter((c) => !c.alive && c.faction === 'player' && c.household?.wife && c.death && s.week - c.death.week >= 3 && s.week - c.death.week <= 120 && !c.dynasty);
    const d = P(h, ds);
    return d ? { w: `${d.household!.wife} ${d.lastName}`, dead: displayName(d), deadId: d.id, ago: s.week - d.death!.week } : undefined;
  },
  title: (_s, k) => [`${k.w}`, `The widow ${k.w.split(' ').slice(-1)[0]}`, `${k.w} asks for nothing`],
  body: (_s, k) => [
    `${k.w}, ${k.dead}'s widow, has been taking in laundry. Everyone on Spencer Avenue knows it. She has not asked the family for a dime, which is its own kind of asking.`,
    `${k.w} stops you outside the Acme. Her boy, the oldest, wants to quit St. Ann's school and go to work, and he is talking about going to work for the people his father worked for. She wants to know what you are going to do about it.`,
    `It has been ${Math.max(1, Math.round(k.ago / 4.3))} months since ${k.dead} was buried. ${k.w}'s brother has been drinking at the Riptide and saying, loudly, that the family forgot his sister the day after the funeral.`,
  ],
  choices: (_s, k) => [
    ch('house', 'money', `Pay off her mortgage (${$(1500)})`, `paid off ${k.w}'s house`, [money(-1500), resp(2), crewOp(3, 'Takes care of the widows')]),
    ch('env', 'soft', `An envelope every month, quietly (${$(500)} now)`, `looked after ${k.w}`, [money(-500), crewOp(2, 'Takes care of the widows')]),
    ch('job', 'sly', 'A job for her boy, a straight one', `found ${k.w}'s son a straight job`, [money(-200), resp(1), famOp(1, 'Kept a boy out of the life')], 'A cousin with a lumber yard owes you.'),
    ch('none', 'away', 'The family already paid for the funeral', `left ${k.w} to manage`, [crewOp(-3, 'Forgot the widows'), resp(-1)]),
  ],
};

const rivalBiz: Situation<Cast & { biz: string; district: string; dname: string; rs: string; L: string }> = {
  id: 'rival_biz', theme: 'rivals', weight: 4,
  cast: (s, h) => {
    const all = s.businesses.filter((b) => b.owner !== 'player' && s.rivals.some((r) => r.id === b.owner && r.kind === 'mob'));
    const first = openingRival(s);
    const bs = all.some((b) => b.owner === first) ? all.filter((b) => b.owner === first) : all;
    const b = P(h, bs.slice(-8));
    if (!b) return undefined;
    const r = s.rivals.find((x) => x.id === b.owner)!;
    const L = s.characters[r.leaderId];
    if (!L?.alive) return undefined;
    const d = s.districts.find((x) => x.id === b.districtId);
    return { biz: b.name, district: b.districtId, dname: d?.name ?? 'the island', rival: r.id, rivalBoss: displayName(L), rs: r.shortName, L: displayName(L), actors: [L.id] };
  },
  title: (_s, k) => [`${k.rs} opened ${k.biz}`, `A new place in ${k.dname}`, `${k.biz} is doing too well`],
  body: (_s, k) => [
    `${k.L} has opened ${k.biz} in ${k.dname}, three blocks from your people, and on Saturday night the line was out the door. Your men are asking what you are going to do about it.`,
    `${k.biz} in ${k.dname} belongs to ${k.rs} now, and they are pricing everything under yours to make a point. ${k.L} sent you an invitation to the opening, which was also a point.`,
    `The bartenders in ${k.dname} say ${k.rs}'s new place, ${k.biz}, is taking your customers one at a time and asking them where they used to drink.`,
  ],
  choices: (_s, k) => [
    ch('compete', 'money', `Fix up your own places nearby (${$(1000)})`, `fixed up your places to compete with ${k.biz}`, [money(-1000), { type: 'influence', district: k.district, faction: 'player', amount: 3 }]),
    ch('suppliers', 'hard', 'Lean on their suppliers', `leaned on ${k.biz}'s suppliers`, [{ type: 'rivalResource', rival: k.rival!, money: -1500 }, rivOp(k.rival!, -10, 'Leaned on our suppliers'), heat('local', 3)]),
    ch('piece', 'soft', `Buy a quiet piece of it (${$(1200)})`, `bought a piece of ${k.biz}`, [money(-1200), rivOp(k.rival!, 8, 'A partner, not an enemy'), resp(-1)], 'You earn on it. So do they.'),
    ch('ignore', 'away', 'Let them have their new place', `let ${k.rs} have ${k.biz}`, [resp(-1)]),
  ],
};

const kidSchool: Situation<Cast & { kid: string; age: number; he: string; his: string; school: string }> = {
  id: 'kid_school', theme: 'family', weight: 3,
  cast: (s, h) => {
    const boss = s.characters[s.playerId];
    const ks = livingDynasty(s).filter((c) => (c.fatherId === boss.id || c.motherId === boss.id) && ageOn(c.birth, s.date) >= 6 && ageOn(c.birth, s.date) <= 17);
    const k = P(h, ks);
    if (!k) return undefined;
    const a = ageOn(k.birth, s.date);
    return { kid: k.firstName, age: a, he: k.gender === 'F' ? 'she' : 'he', his: k.gender === 'F' ? 'her' : 'his', school: a <= 13 ? 'St. Ann\'s school' : 'Wildwood Catholic', charId: k.id, actors: [k.id] };
  },
  title: (_s, k) => [`${k.kid} and the nuns`, `${k.kid}'s report card`, `A call from ${k.school}`, `${k.kid} at ${k.age}`],
  body: (s, k) => [
    `Sister Bernadette calls from ${k.school}: ${k.kid}, ${k.age}, got into a fight in the schoolyard defending a smaller boy, and gave as good as ${k.he} got. The other boy's father is a County detective. The nun wants to see a parent, in person, Monday.`,
    `${k.kid}, ${k.age}, has the best marks in ${k.his} class at ${k.school}, and a teacher says ${k.he} could get a scholarship somewhere far from here: Villanova, maybe Georgetown. ${k.kid} has not told anybody ${k.he} wants it. ${k.he === 'she' ? 'Her' : 'His'} mother told you.`,
    `${k.kid}, ${k.age}, came home from ${k.school} asking what you do for a living, because a boy in ${k.his} class said his father says you are a gangster. ${k.kid} is waiting at the kitchen table for an answer.`,
    `${k.school} is putting on a ${mo(s) === 12 ? 'Christmas pageant' : mo(s) >= 3 && mo(s) <= 5 ? 'spring play' : 'science fair'}, and ${k.kid}, ${k.age}, is in it. It is on a Thursday night. Thursday night is when the capos come in.`,
  ],
  choices: (_s, k) => [
    ch('go', 'soft', 'Go yourself, and sit in the front row', `went to ${k.kid}'s school yourself`, [famOp(5, `Showed up for ${k.kid}`), resp(-1)], 'The other parents will stare. Let them.'),
    ch('donate', 'money', `A donation to ${k.school} (${$(500)})`, `gave money to ${k.school}`, [money(-500), famOp(2, 'Generous to the school'), resp(1)]),
    ch('talk', 'hard', `Tell ${k.kid} what a family name means`, `had a talk with ${k.kid}`, [famOp(1, 'A talk with the old man')], `${k.kid} will remember every word, one way or the other.`),
    ch('wife', 'away', 'Let the house handle it', `let the house handle ${k.kid}'s school business`, [famOp(-3, 'Never there for the kids')]),
  ],
};

const STORMS: { m: number[]; name: string; what: string }[] = [
  { m: [11, 12, 1, 2, 3], name: 'nor\'easter', what: 'tore the awnings off and put a foot of sand and seawater through the front door' },
  { m: [8, 9, 10], name: 'hurricane', what: 'took the roof half off and left the back room under water' },
  { m: [7, 8], name: 'heat wave', what: 'blew the refrigeration and spoiled a week of stock, with the health inspector due' },
  { m: [4, 5, 6], name: 'spring storm', what: 'flooded the basement and shorted the wiring' },
];
const weather: Situation<Cast & { biz: string; storm: string; what: string }> = {
  id: 'weather', theme: 'business', weight: 3,
  cast: (s, h) => {
    const st = STORMS.find((x) => x.m.includes(mo(s)));
    const own = s.businesses.filter((b) => b.owner === 'player');
    const b = P(h, own);
    return st && b ? { biz: b.name, storm: st.name, what: st.what } : undefined;
  },
  title: (_s, k) => [`The ${k.storm}`, `${k.biz} after the ${k.storm}`, `What the ${k.storm} left`],
  body: (_s, k) => [
    `The ${k.storm} came through on Tuesday and ${k.what} at ${k.biz}. The whole block got it. The insurance man is coming Friday, and he is a man you know.`,
    `Everybody on the island is shoveling out after the ${k.storm}. At ${k.biz} it ${k.what}. The neighbors are watching to see whether you fix your own place first, or the street.`,
  ],
  choices: (_s, k) => [
    ch('fix', 'money', `Fix it right (${$(900)})`, `fixed ${k.biz} after the ${k.storm}`, [money(-900), resp(1)]),
    ch('block', 'soft', `Fix the whole block (${$(1800)})`, `fixed the whole block after the ${k.storm}`, [money(-1800), resp(3), heat('local', -2)], 'Your men, your trucks, everybody\'s roofs.'),
    ch('claim', 'sly', 'Let the insurance man be generous', `padded the insurance claim on ${k.biz}`, [money(1300), heat('federal', 2)], 'He writes what you tell him to write. Insurance companies keep files.'),
    ch('close', 'away', 'Close it for a couple of weeks', `closed ${k.biz} after the ${k.storm}`, [money(-300)]),
  ],
};

const aftermath: Situation<Cast & { dead: string; how: string }> = {
  id: 'aftermath', theme: 'law', weight: 3,
  cast: (s, h) => {
    const ds = Object.values(s.characters).filter((c) => !c.alive && c.death && s.week - c.death.week <= 8 && s.week - c.death.week >= 1 && (c.faction !== 'player' || !c.dynasty) && c.death.killer);
    const d = P(h, ds);
    return d ? { dead: displayName(d), how: d.death!.cause } : undefined;
  },
  title: (_s, k) => [`Questions about ${k.dead}`, `A witness`, `The detectives are asking`],
  body: (_s, k) => [
    `County detectives are going door to door about ${k.dead} (${k.how}). A woman who runs a rooming house on Burk Avenue says she saw a car that night, and she has started to wonder out loud whose.`,
    `A kid who parks cars at the Ivanhoe says he saw something the night ${k.dead} died (${k.how}). He has not said it to the police. He has said it to his girlfriend, which is worse.`,
    `The Leader has run the story about ${k.dead} (${k.how}) three days in a row, and the reporter keeps calling the Shamrock. The detectives have not come yet. Everyone is waiting for them.`,
  ],
  choices: (s) => [
    ch('lawyer', 'money', `Retain a lawyer before anybody needs one (${$(1000)})`, 'retained a lawyer early', [money(-1000), heat('local', -4)]),
    ch('quiet', 'sly', 'Ask the Chief to move the case along slowly', 'had a word with the Chief about the case', [favor(-1), heat('local', -6)], 'A favor spent. Nobody gets hurt.'),
    ch('away', 'away', 'It has nothing to do with you', 'stayed away from the investigation', [heat('local', 2)]),
  ].filter((c) => c.id !== 'quiet' || s.favors > 0),
};

const jailed: Situation<Cast & { m: string }> = {
  id: 'jailed', theme: 'crew', weight: 4, placed: true,
  cast: (s, h) => {
    const js = crew(s).filter((c) => c.alive && c.faction === 'player' && (c.imprisonedUntil ?? 0) > s.week && c.id !== s.playerId);
    const j = P(h, js);
    return j ? { m: j.id, charId: j.id, actors: [j.id] } : undefined;
  },
  title: (s, k) => [`${fn(s, k.m)}'s family`, `A letter from ${fn(s, k.m)}`, `Visiting day at the county jail`],
  body: (s, k) => {
    const c = s.characters[k.m];
    const w = c.household?.wife;
    const weeks = (c.imprisonedUntil ?? s.week) - s.week;
    return [
      `${nm(s, k.m)} has ${weeks} more weeks inside. ${w ? `${w} is behind on the rent` : 'His mother is behind on the rent'}, and the men inside are watching whether his family on the outside takes care of him.`,
      `A letter from ${nm(s, k.m)}, written carefully because the guards read everything: he is fine, the food is bad, a man in the next cell keeps asking him questions about Wildwood. He would like his lawyer to visit.`,
      `Visiting day. ${nm(s, k.m)} looks thinner. He says nothing he should not say, and then, at the end, quietly: "A man from the D.A.'s office came to see me. I told him nothing. I want you to know I told him nothing."`,
    ];
  },
  choices: (s, k) => [
    ch('family', 'soft', `Take care of his family (${$(800)})`, `took care of ${fn(s, k.m)}'s family while he was inside`, [money(-800), op(k.m, s.playerId, 12, 'Took care of my family'), crewOp(1, 'Looks after the men inside')]),
    ch('lawyer', 'money', `A Philadelphia lawyer (${$(2000)})`, `hired ${fn(s, k.m)} a Philadelphia lawyer`, [money(-2000), op(k.m, s.playerId, 8, 'Got me a real lawyer'), heat('local', -2)]),
    ch('word', 'hard', 'Send word: keep quiet, and he will be taken care of', `sent ${fn(s, k.m)} word to keep quiet`, [op(k.m, s.playerId, 3, 'The boss remembers me'), fear(k.m, s.playerId, 10)]),
    ch('none', 'away', 'He knew the risks', `left ${fn(s, k.m)} to do his time`, [op(k.m, s.playerId, -10, 'Forgot me inside'), grudge(k.m, s.playerId, 10)]),
  ],
};

const newCop: Situation<Cast & { name: string; title: string }> = {
  id: 'new_cop', theme: 'law', weight: 3,
  cast: (s, h) => {
    const ps = Object.values(s.pol?.people ?? {}).filter((p) => p.alive && /Police|Detective|Trooper|Sheriff/.test(p.title) && p.since >= yr(s) - 1);
    const p = P(h, ps.slice(0, 30));
    return p ? { name: `${p.first} ${p.last}`, title: p.title } : undefined;
  },
  title: (_s, k) => [`The new man: ${k.name}`, `${k.name} is asking around`, `A cop nobody owns`],
  body: (_s, k) => [
    `${k.name} (${k.title}) is new and does things by the book: he wrote up a double-parked Cadillac outside the Shamrock, and it was yours. The other cops are waiting to see what happens to him.`,
    `${k.name} (${k.title}) has been buying his own coffee at the Admiral and refusing the free pie, which on this island is a political statement. Nobody knows yet what he wants.`,
    `${k.name} (${k.title}) asked your bartender, politely, who really owns the Shamrock. The bartender told him the truth: a man with a liquor license. ${k.name} wrote it down anyway.`,
  ],
  choices: (_s, k) => [
    ch('pad', 'money', `Find out his price (${$(400)} a month to start)`, `put ${k.name} on the pad`, [money(-400), heat('local', -4), favor(1)], 'Most men have one. Some do not.'),
    ch('chief', 'sly', 'Ask the Chief to give him the night shift in the Crest', `had ${k.name} moved to the night shift`, [money(-300), heat('local', -3)]),
    ch('respect', 'soft', 'Tip your hat, pay the ticket, let him be', `let ${k.name} be`, [money(-25), resp(-1), heat('local', -1)], 'An honest cop is a fact of nature, like the tide.'),
    ch('ignore', 'away', 'Ignore him', `ignored the new man ${k.name}`, [heat('local', 2)]),
  ],
};

const hijack: Situation<Cast & { m: string; load: string }> = {
  id: 'hijack', theme: 'business', weight: 4,
  cast: (s, h) => {
    const m = P(h, men(s).filter((c) => c.rank !== 'capo'));
    return m ? { m: m.id, load: P(h, ['Zenith television sets', 'Schmidt\'s beer', 'Botany 500 suits', 'Admiral air conditioners', 'cartons of Pall Malls', 'frozen shrimp from Baltimore', 'Hamilton Beach mixers', 'Spalding golf clubs'])!, charId: m.id, actors: [m.id] } : undefined;
  },
  title: (s, k) => [`${fn(s, k.m)} has a truck`, `A truck off the Parkway`, `${k.load}, cheap`],
  body: (s, k) => [
    `${nm(s, k.m)} and two friends took a trailer of ${k.load} off the Garden State Parkway near Exit 10, driver tied up and unhurt, and it is sitting in a garage in Rio Grande. A fence in Philadelphia will take it all, for a price, if you say so.`,
    `${nm(s, k.m)} did not ask first. There is a trailer of ${k.load} in a barn in Erma, and the trucking company has already called the state police. He wants to know what you want done with it.`,
  ],
  choices: (s, k) => [
    ch('fence', 'money', `Move it through the Philadelphia fence (+${$(2200)})`, `fenced ${fn(s, k.m)}'s truckload`, [money(2200), heat('federal', 3), { type: 'evidence', charId: k.m, amount: 4 }, op(k.m, s.playerId, 5, 'Backed my score')]),
    ch('philly', 'sly', 'Give Philadelphia a taste (+$1,200)', `shared ${fn(s, k.m)}'s truckload with Philadelphia`, [money(1200), heat('family', -3), rivOp('philly', 4, 'Remembers his friends')]),
    ch('return', 'soft', 'Let it be "found" for the reward (+$400)', `had the ${k.load} returned for the reward`, [money(400), heat('local', -2), op(k.m, s.playerId, -6, 'Gave my score back')]),
    ch('scold', 'hard', 'Not on this island without asking', `told ${fn(s, k.m)} never again without asking`, [fear(k.m, s.playerId, 15), op(k.m, s.playerId, -4, 'Chewed me out'), resp(1), money(600)]),
  ],
};

const union: Situation<Cast & { local: string; boss: string; builder: string }> = {
  id: 'union', theme: 'business', weight: 3,
  cast: (_s, h) => ({
    local: P(h, ['Teamsters Local 331', 'the Boardwalk Workers\' local', 'Hod Carriers Local 415', 'the longshoremen at the Cape May docks', 'the Hotel and Restaurant Employees local'])!,
    boss: P(h, ['Mickey Rourke Doyle', 'Big Tom Flanagan', 'Eddie Kowalczyk', 'Francis X. Boyle', 'Stan Wisniewski'])!,
    builder: P(h, ['the new seawall', 'the Starlite motel going up on Ocean Avenue', 'the Convention Hall renovation', 'the new garbage contract', 'the new school in Rio Grande', 'the bridge repairs on the Causeway'])!,
  }),
  title: (_s, k) => [`${k.local}`, `A strike on ${k.builder}`, `The pension fund`],
  body: (_s, k) => [
    `${k.boss} runs ${k.local}, and he is Irish, which means he can never sit at your table and knows it. He can, however, shut down ${k.builder} on Monday morning, and he would like to know if you would like that.`,
    `${k.local}'s pension fund has money that wants a home. ${k.boss} can lend it to a builder you choose, for ${k.builder}, at a rate nobody will ever audit, and everybody along the way wets his beak.`,
    `The bids on ${k.builder} are sealed until Friday. ${k.boss} of ${k.local} can make sure one of them is the only one that counts. Concrete, garbage, it is all the same: whoever controls the men controls the price.`,
  ],
  choices: (_s, k) => [
    ch('strike', 'hard', `Let ${k.boss} threaten a strike, and collect from the builder (+${$(1500)})`, `squeezed the builder on ${k.builder}`, [money(1500), heat('local', 3), heat('federal', 2)]),
    ch('rig', 'sly', `Rig the bids for a friendly company (+${$(1000)})`, `rigged the bids on ${k.builder}`, [money(1000), favor(1), heat('federal', 3)], 'Abstract, and on paper: the right envelope in the right drawer.'),
    ch('partner', 'soft', `Treat ${k.boss} as a partner, not a hired man (${$(600)})`, `treated ${k.boss} as a partner`, [money(-600), resp(1), { type: 'crewOpinion', amount: 0, reason: 'Partners with outsiders', traitMods: { Ambitious: 3, Pious: -2 } }]),
    ch('no', 'away', 'Labor is a federal headache', `stayed out of ${k.local}'s business`, [heat('federal', -1)]),
  ],
};

const associate: Situation<Cast & { m: string; eth: string }> = {
  id: 'associate', theme: 'crew', weight: 3,
  cast: (s, h) => {
    const m = P(h, men(s).filter((c) => c.ethnicity !== 'Italian' && c.rank !== 'capo'));
    return m ? { m: m.id, eth: m.ethnicity, charId: m.id, actors: [m.id] } : undefined;
  },
  title: (s, k) => [`${fn(s, k.m)} can never be made`, `${fn(s, k.m)} knows his ceiling`, `An earner with no button`],
  body: (s, k) => [
    `${nm(s, k.m)} brings in more than half your made men, and he will never be made: he is ${k.eth}, and the rule is older than anybody in the room. He has started to say so, out loud, after a few drinks.`,
    `${nm(s, k.m)} watched a twenty-two-year-old get his button last month, a kid he trained. He did not say anything. His face said it for him. He is ${k.eth}, and he knows exactly how high he can go.`,
  ],
  choices: (s, k) => [
    ch('end', 'money', `A bigger end, in writing (${$(600)} now)`, `gave ${fn(s, k.m)} a bigger end`, [money(-600), { type: 'wealth', charId: k.m, amount: 600 }, op(k.m, s.playerId, 10, 'Paid me what I am worth')]),
    ch('partner', 'soft', 'Call him a partner, in front of everybody', `called ${fn(s, k.m)} a partner in front of the crew`, [op(k.m, s.playerId, 12, 'Called me a partner'), { type: 'crewOpinion', amount: -1, reason: 'Raised up an outsider', traitMods: { Pious: -3, Ambitious: -2 } }]),
    ch('rules', 'hard', 'Remind him of the rules', `reminded ${fn(s, k.m)} of the rules`, [op(k.m, s.playerId, -8, 'Put me in my place'), grudge(k.m, s.playerId, 10), resp(1)]),
    ch('ignore', 'away', 'He knew when he started', `let ${fn(s, k.m)} stew`, [op(k.m, s.playerId, -3, 'The boss does not care')]),
  ],
};

const oldYoung: Situation<Cast & { old: string; young: string; with: string }> = {
  id: 'old_young', theme: 'crew', weight: 3,
  cast: (s, h) => {
    const ms = men(s).filter((c) => c.rank !== 'associate').sort((a, b) => a.birth.y - b.birth.y);
    if (ms.length < 3) return undefined;
    const old = ms[0], young = ms[ms.length - 1];
    if (young.birth.y - old.birth.y < 12) return undefined;
    return { old: old.id, young: young.id, with: P(h, ['a Jewish money man from Atlantic City', 'the Irish who run the waterfront', 'a numbers banker from the North End', 'a Cuban from the Havana crowd with casino money', 'a Greek who owns half the diners on the Pike'])!, actors: [old.id, young.id], charId: young.id };
  },
  title: (s, k) => [`${fn(s, k.old)} and the young guys`, `Old guard, young turks`, `${fn(s, k.young)} wants to do business with outsiders`],
  body: (s, k) => [
    `${nm(s, k.young)} wants to go in with ${k.with} on a deal that would make everybody money. ${nm(s, k.old)} says the old man never did business with outsiders and it is not going to start now. Both of them are looking at you.`,
    `At the long table at the Shamrock, ${nm(s, k.old)}, mustache and pinky ring, says the young guys have no respect: they wear their hats indoors and they talk to ${k.with}. ${nm(s, k.young)} says the old guys would rather be broke and right.`,
  ],
  choices: (s, k) => [
    ch('old', 'hard', `Side with ${fn(s, k.old)}: no outsiders`, `sided with the old guard`, [op(k.old, s.playerId, 10, 'Respected the old ways'), op(k.young, s.playerId, -8, 'Stuck in the past')]),
    ch('young', 'money', `Side with ${fn(s, k.young)} (+${$(900)})`, `sided with the young turks`, [money(900), op(k.young, s.playerId, 10, 'Lets us earn'), op(k.old, s.playerId, -8, 'Forgot the old ways')]),
    ch('both', 'soft', 'Make them do it together', `made the old guard and the young turks work together`, [op(k.old, k.young, 6, 'The boss made us shake'), op(k.young, k.old, 6, 'The boss made us shake'), money(300)]),
  ],
};

const books: Situation<Cast & { k: string; a: string }> = {
  id: 'books', theme: 'crew', weight: 3,
  cast: (s, h) => {
    const k = P(h, capos(s).filter((c) => isFree(s, c)));
    const a = k ? P(h, crew(s).filter((c) => c.rank === 'associate' && isFree(s, c))) : undefined;
    return k && a ? { k: k.id, a: a.id, actors: [k.id, a.id], charId: k.id } : undefined;
  },
  title: (_s) => ['The books', 'Talk of the books opening', 'Who goes first'],
  body: (s, k) => [
    `Word from Philadelphia: the books might open, for the first time since the raid upstate in 1957 scared everybody. Every capo on the island wants his man at the front of the line, and ${nm(s, k.k)} wants his to be ${nm(s, k.a)}.`,
    `${nm(s, k.k)} has been buying dinners in Philadelphia for a month, and everybody knows why: if the books open, he wants ${nm(s, k.a)}'s name on the list, and he wants you to put it there.`,
  ],
  choices: (s, k) => [
    ch('push', 'money', `Send an envelope up with ${fn(s, k.a)}'s name (${$(1000)})`, `pushed ${fn(s, k.a)}'s name in Philadelphia`, [money(-1000), heat('family', -2), op(k.k, s.playerId, 8, 'Pushed my guy'), op(k.a, s.playerId, 10, 'Put my name up')]),
    ch('wait', 'soft', 'Nobody pushes: Philadelphia decides', `told the capos not to push for the books`, [resp(1), op(k.k, s.playerId, -4, 'Would not push my guy')]),
    ch('own', 'sly', 'Put your own man ahead of his', `put your own man ahead of ${fn(s, k.k)}'s`, [op(k.k, s.playerId, -8, 'Jumped my guy'), grudge(k.k, s.playerId, 8), resp(1)]),
  ],
};

const hearings: Situation<Cast & { m: string }> = {
  id: 'hearings', theme: 'law', weight: 6,
  when: (s) => (yr(s) === 1963 && mo(s) >= 9) || (yr(s) === 1964 && mo(s) <= 6),
  cast: (s, h) => { const m = P(h, men(s)); return m ? { m: m.id, actors: [m.id], charId: m.id } : undefined; },
  title: () => ['The man on television', 'Cosa nostra in the papers', 'Everybody watched the hearings'],
  body: (s, k) => [
    `A made man from New York sat in front of a Senate committee on television and named names, and said two words nobody ever says out loud, and now they are in every paper on the Shore. ${nm(s, k.m)} watched the whole thing at the Shamrock without blinking. The men noticed.`,
    `Since the hearings, everybody on the island looks at the man next to him a beat too long. ${nm(s, k.m)} asked, at the bar, "What do they give a guy like that? A new name? A house somewhere?" and the room went quiet.`,
  ],
  choices: (s, k) => [
    ch('hunt', 'hard', 'Have every man looked at, quietly', 'started a quiet rat hunt after the hearings', [money(-800), crewOp(-3, 'Treated us all like rats'), heat('federal', -3)]),
    ch('reassure', 'soft', 'Tell the crew: this family is not New York', 'calmed the crew after the hearings', [crewOp(3, 'Kept his head'), resp(1)]),
    ch('watch', 'sly', `Keep an eye on ${fn(s, k.m)}`, `put ${fn(s, k.m)} under watch`, [{ type: 'checkBackground', charId: k.m }, money(-400), op(k.m, s.playerId, -3, 'Followed around')]),
    ch('nothing', 'away', 'It is a New York problem', 'shrugged off the hearings', [heat('federal', 2)]),
  ],
};

const rico: Situation<Cast> = {
  id: 'rico', theme: 'law', weight: 4,
  when: (s) => yr(s) >= 1971 && yr(s) <= 1976,
  cast: () => ({}),
  title: () => ['The new law', 'Racketeering', 'Your lawyer reads you a statute'],
  body: () => [
    'Your lawyer drove down from Philadelphia with a copy of the new federal racketeering statute and read it to you out loud, slowly. Under it, the whole enterprise is the crime, and they can take the house, the businesses, the boat. "Distance," he says. "Everything is distance now."',
    'Every lawyer in Philadelphia is talking about the same law: the Organized Crime Control Act, the part they call RICO. Run a business with a pattern, they can charge the pattern. The men want to know what it means for them. So do you.',
  ],
  choices: () => [
    ch('restructure', 'money', `Restructure the books and the fronts (${$(2500)})`, 'restructured the business after RICO', [money(-2500), heat('federal', -6)]),
    ch('insulate', 'sly', 'More layers between you and the street', 'insulated yourself after RICO', [heat('federal', -3), crewOp(-1, 'The boss is farther away now'), resp(-1)]),
    ch('ignore', 'away', 'Laws come and go', 'ignored the new racketeering law', [heat('federal', 3)]),
  ],
};

const vanished: Situation<Cast & { rat: string }> = {
  id: 'vanished', theme: 'law', weight: 3,
  when: (s) => yr(s) >= 1971,
  cast: (_s, h) => ({ rat: P(h, ['a bookmaker from Camden who used to drink at the Riptide', 'a soldier from the Trenton crew', 'an accountant who did books for three families', 'a truck driver who knew too many garages'])! }),
  title: () => ['He vanished', 'A new name somewhere', 'A sighting in Arizona'],
  body: (_s, k) => [
    `${k.rat[0].toUpperCase()}${k.rat.slice(1)} testified last year and then stopped existing: no house, no wife, no name. The government has a program for that now. Somebody's cousin swears he saw him at a gas station outside Tucson, wearing a cowboy hat.`,
    `The word from Philadelphia is that ${k.rat} is in the government's witness program, living as somebody else, somewhere warm. Everybody who ever talked in front of him is lying awake.`,
  ],
  choices: () => [
    ch('let', 'away', 'Let the dead stay dead', 'let the vanished witness go', [resp(-1)]),
    ch('philly', 'sly', 'Pass the sighting to Philadelphia', 'passed word of the witness to Philadelphia', [heat('family', -3), heat('federal', 2)]),
    ch('lawyer', 'money', `Have a lawyer read every transcript he gave (${$(1200)})`, 'had the witness\'s testimony read', [money(-1200), heat('federal', -4)]),
  ],
};

const undercover: Situation<Cast & { m: string; yrs: number }> = {
  id: 'undercover', theme: 'law', weight: 3,
  when: (s) => yr(s) >= 1966,
  cast: (s, h) => {
    const m = P(h, crew(s).filter((c) => c.rank === 'associate' && isFree(s, c)));
    return m ? { m: m.id, yrs: 2 + Math.floor(rand(h) * 4), actors: [m.id], charId: m.id } : undefined;
  },
  title: (s, k) => [`Is ${fn(s, k.m)} who he says?`, `${fn(s, k.m)} never drinks`, `A jeweler's story`],
  body: (s, k) => [
    `${nm(s, k.m)} has been around ${k.yrs} years, earns, never complains, never drinks too much, never misses a meeting. Somebody at the Elks said he is too good to be true. In New York a man like that turned out to be a federal agent, years in.`,
    `${nm(s, k.m)} says he sold jewelry in Miami before he came north. A jeweler in Atlantic City who knows Miami says he never heard of him. It might be nothing. It might be ${k.yrs} years of everything.`,
  ],
  choices: (s, k) => [
    ch('check', 'money', `Have him looked into (${$(500)})`, `had ${fn(s, k.m)} looked into`, [money(-500), { type: 'checkBackground', charId: k.m }]),
    ch('freeze', 'hard', 'Freeze him out of anything that matters', `froze ${fn(s, k.m)} out`, [op(k.m, s.playerId, -8, 'Frozen out for nothing'), heat('federal', -2)]),
    ch('trust', 'soft', 'He has earned trust', `stood by ${fn(s, k.m)}`, [op(k.m, s.playerId, 8, 'Trusted me'), heat('federal', 1)]),
  ],
};

const dinner: Situation<Cast & { m: string; rs: string; place: string }> = {
  id: 'dinner', theme: 'rivals', weight: 3, placed: true,
  cast: (s, h) => {
    const r = mobRival(s, h);
    if (!r) return undefined;
    const L = s.characters[s.rivals.find((x) => x.id === r.rival)!.leaderId];
    return { ...r, m: L.id, place: P(h, ['a restaurant on Atlantic Avenue in Atlantic City', 'a steakhouse in Somers Point', 'a red-sauce place on Ninth Street in Philadelphia', 'a seafood house in Cape May', 'a roadhouse on the White Horse Pike'])!, actors: [L.id] };
  },
  title: (_s, k) => [`Dinner with ${k.rs}`, `An invitation to dinner`, `Who sits facing the door`],
  body: (s, k) => [
    `${nm(s, k.m)} invites you to dinner at ${k.place}, private room, just the two of you and a waiter who has worked there thirty years. It might be peace. It might be a menu. In this business the last meal always looks like a nice dinner.`,
    `A florist delivers a single white carnation to the Shamrock with a card: dinner, Thursday, ${k.place}. It is from ${nm(s, k.m)}. Nobody on the island can agree whether a white carnation means respect or a funeral.`,
    `${nm(s, k.m)} calls you himself, which he never does, and asks you to dinner at ${k.place} "to clear the air." You can hear a restaurant behind him already, plates and a piano.`,
    `${k.rs} wants to talk, over veal, at ${k.place}. ${nm(s, k.m)} says to come alone, which is what people say. Your men want to know who sits facing the door.`,
  ],
  choices: (s, k) => [
    ch('go', 'soft', 'Go, and order the veal', `had dinner with ${fn(s, k.m)}`, [rivOp(k.rival!, 10, 'Came to dinner'), heat('local', -1)]),
    ch('men', 'hard', 'Go, with four men in the parking lot', `went to dinner with ${fn(s, k.m)} with men outside`, [rivOp(k.rival!, -2, 'Brought an army to dinner'), resp(1)]),
    ch('send', 'sly', 'Send your consigliere instead', `sent the consigliere to dinner with ${fn(s, k.m)}`, [rivOp(k.rival!, 3, 'Sent a man to listen')]),
    ch('no', 'away', 'Decline, politely', `declined dinner with ${fn(s, k.m)}`, [rivOp(k.rival!, -5, 'Would not break bread')]),
  ],
};

const prosecutor: Situation<Cast & { m: string; pros: string }> = {
  id: 'prosecutor', theme: 'law', weight: 2, placed: true,
  when: (s) => s.heat.local + s.heat.federal >= 40,
  cast: (s, h) => {
    const m = P(h, men(s).filter((c) => c.traits.includes('Hot-headed') || c.traits.includes('Cruel')));
    const pr = s.rivals.find((r) => r.kind === 'law');
    const L = pr ? s.characters[pr.leaderId] : undefined;
    return m ? { m: m.id, pros: L ? displayName(L) : 'the County Prosecutor', actors: [m.id], charId: m.id } : undefined;
  },
  title: (s, k) => [`${fn(s, k.m)} has an idea`, 'The one rule', `${fn(s, k.m)} says it out loud`],
  body: (s, k) => [
    `${nm(s, k.m)} has had too much to drink and too much heat, and in the back room of the Shamrock he says what nobody says: that ${k.pros} could be gotten rid of. The room goes silent. Everyone knows the rule. Families that broke it ended up burying the man who suggested it themselves.`,
    `At a wake on New Jersey Avenue, by the holy water, ${nm(s, k.m)} whispers it: ${k.pros}, a car, a quiet street. You look at him until he looks away. It is the one rule nobody in this life breaks, and the man who even suggests it is in danger from his own side.`,
    `${nm(s, k.m)} catches you in the parking lot, sober this time, which is worse. ${k.pros} is going to put half the crew away, he says, and there is a way to stop it. There is not. It is the one thing nobody in this life ever does, and everybody knows why.`,
  ],
  choices: (s, k) => [
    ch('no', 'hard', 'Never. Not now, not ever, and not again', `shut ${fn(s, k.m)} down about the prosecutor`, [fear(k.m, s.playerId, 15), op(k.m, s.playerId, -4, 'Shut me down'), resp(2), crewOp(1, 'Knows the rules')]),
    ch('florida', 'money', `Send him to Florida until he cools off (${$(800)})`, `sent ${fn(s, k.m)} to Florida to cool off`, [money(-800), op(k.m, s.playerId, 2, 'A vacation'), heat('local', -2)]),
    ch('philly', 'sly', 'Tell Philadelphia what he said', `told Philadelphia what ${fn(s, k.m)} said`, [heat('family', -6), rivOp('philly', 6, 'Keeps his house in order'), op(k.m, s.playerId, -15, 'Ratted me to Philadelphia'), grudge(k.m, s.playerId, 20)]),
  ],
};

const casino: Situation<Cast> = {
  id: 'casino', theme: 'business', weight: 6,
  when: (s) => yr(s) === 1976 && mo(s) <= 10,
  cast: () => ({}),
  title: () => ['The referendum', 'Casinos in Atlantic City', 'Question number one'],
  body: () => [
    'In November New Jersey votes on casinos in Atlantic City, the second try after the first one lost in 1974. Every man on the Shore with a dollar is counting how many dollars it could turn into. Everybody wants to know if you are in.',
    'The pro-casino committee has billboards on the Expressway: "Help Yourself, Help Atlantic City." Land on Pacific Avenue that nobody wanted for twenty years has tripled. Feldstein\'s people are buying. Manno\'s people are buying. Are you?',
  ],
  choices: () => [
    ch('fund', 'money', `Give to the "yes" campaign (${$(3000)})`, 'funded the casino referendum', [money(-3000), resp(2), favor(1)]),
    ch('land', 'sly', `Buy a lot near the Boardwalk through a cousin (${$(2500)})`, 'bought land in Atlantic City before the vote', [money(-2500), { type: 'flag', key: 'ac_land', value: 1 }, heat('federal', 1)], 'If it passes, the lot is worth a fortune.'),
    ch('out', 'away', 'Atlantic City is Manno\'s headache', 'stayed out of the casino fight', []),
  ],
};

const gasTax: Situation<Cast & { m: string }> = {
  id: 'gas_tax', theme: 'business', weight: 3,
  when: (s) => yr(s) >= 1978,
  cast: (s, h) => { const m = P(h, men(s)); return m ? { m: m.id, actors: [m.id], charId: m.id } : undefined; },
  title: () => ['The gasoline business', 'A paperwork racket', 'Daisy chains'],
  body: (s, k) => [
    `${nm(s, k.m)} met some Russians from Brighton Beach who have a way to sell gasoline without paying the tax on it: a chain of companies that exist only on paper, and the last one disappears before the tax is due. All paperwork. A penny a gallon to everybody.`,
    `${nm(s, k.m)} says the money in gasoline is not in the gas, it is in the tax: dummy companies, a few gas stations on the Pike, a few million gallons. He needs the family's blessing and a cut for Philadelphia.`,
  ],
  choices: (s, k) => [
    ch('in', 'money', `Bless it (+${$(2500)})`, `blessed ${fn(s, k.m)}'s gasoline tax scheme`, [money(2500), heat('federal', 5), { type: 'evidence', charId: k.m, amount: 5 }]),
    ch('philly', 'sly', 'Bring Philadelphia in on it (+$1,500)', 'brought Philadelphia into the gasoline business', [money(1500), heat('family', -3), heat('federal', 3)]),
    ch('no', 'away', 'Too many strangers, too much paper', `turned down ${fn(s, k.m)}'s gasoline scheme`, [op(k.m, s.playerId, -4, 'Turned down my score')]),
  ],
};

const vacationer: Situation<Cast & { who: string }> = {
  id: 'vacationer', theme: 'rivals', weight: 4,
  when: (s) => mo(s) >= 6 && mo(s) <= 8,
  cast: (_s, h) => ({ who: P(h, ['a Philadelphia capo called Joe the Barber', 'Sal Moretti\'s brother-in-law', 'a made man from South Philly and his three sons', 'an old Philadelphia bookmaker with a bad hip', 'two of Philadelphia\'s men and their wives'])!, rival: 'philly' as RivalId }),
  title: () => ['A guest from Philadelphia', 'Comps', 'The Philadelphia vacation'],
  body: (_s, k) => [
    `${k.who[0].toUpperCase()}${k.who.slice(1)} is spending two weeks in the Crest and expects, as these men do, that his rooms, his dinners and his tab at the Riptide are on the house. The house is you.`,
    `${k.who[0].toUpperCase()}${k.who.slice(1)} has been running a tab at every place you own and signing it "Philadelphia." Your managers want to know if Philadelphia is going to pay it.`,
  ],
  choices: () => [
    ch('comp', 'soft', `Comp everything (${$(700)})`, 'comped the Philadelphia vacationers', [money(-700), heat('family', -3), rivOp('philly', 4, 'Treated our people right')]),
    ch('half', 'sly', 'Comp the rooms, not the bar tab', 'comped the rooms but not the bar', [money(-300), heat('family', -1)]),
    ch('bill', 'hard', 'Send Philadelphia the bill', 'sent Philadelphia the bill', [money(400), heat('family', 4), rivOp('philly', -6, 'Cheap')]),
  ],
};

const oldTimer: Situation<Cast & { who: string }> = {
  id: 'old_timer', theme: 'world', weight: 3,
  cast: (_s, h) => ({ who: P(h, ['Fingers Duffy, who ran rum off Hereford Inlet in 1928', 'old Patsy Gallo, who drove a car to the big meeting on the Atlantic City Boardwalk in 1929', 'Mrs. Lombardi, whose husband kept the books for the old man in the thirties', 'a retired Coast Guard chief who chased rumrunners and lost'])! }),
  title: () => ['An old-timer', 'Stories from 1929', 'The old days'],
  body: (_s, k) => [
    `${k.who[0].toUpperCase()}${k.who.slice(1)} has started telling stories at the Elks: who was at the big meeting on the Atlantic City Boardwalk in 1929, who shook hands with whom, who was buried where after. They are good stories. Some are true. Some names are still alive.`,
    `${k.who[0].toUpperCase()}${k.who.slice(1)} is broke, eighty, and remembers everything. He would like a little something for his old age, and he would like to be remembered. He says this in front of a reporter from the Leader who is writing about "Wildwood's colorful past."`,
  ],
  choices: () => [
    ch('pension', 'soft', `A little pension (${$(400)})`, 'took care of an old-timer', [money(-400), resp(1), crewOp(2, 'Takes care of the old guys')]),
    ch('listen', 'sly', 'Buy him lunch and listen', 'listened to an old-timer\'s stories', [money(-40), favor(1)], 'Old men know where things are buried. Sometimes literally.'),
    ch('quiet', 'hard', 'Ask him to tell his stories to his grandchildren', 'asked an old-timer to stop talking', [resp(-1), heat('local', -2)]),
  ],
};

const pizzeria: Situation<Cast & { m: string; rs: string }> = {
  id: 'pizzeria', theme: 'business', weight: 2,
  when: (s) => yr(s) >= 1972,
  cast: (s, h) => {
    const m = P(h, men(s).filter((c) => c.traits.includes('Greedy') || c.traits.includes('Ambitious')));
    return m ? { m: m.id, rs: P(h, ['Sicilians from Brooklyn', 'some people from New York', 'a crew out of Newark'])!, actors: [m.id], charId: m.id } : undefined;
  },
  title: (s, k) => [`${fn(s, k.m)}'s pizzerias`, 'The product', 'An offer the old man forbids'],
  body: (s, k) => [
    `${nm(s, k.m)} has been talking to ${k.rs} who are opening pizzerias up and down the coast, and the pizza is not what the pizzerias are for. It is the one thing Philadelphia forbids. He says the money is so big that rules start to look old-fashioned.`,
    `${nm(s, k.m)} lays it out in a booth at the back: ${k.rs}, a string of pizzerias, and a product that comes in through the docks. He does not say the word. He does not have to. Philadelphia's rule on it has never changed.`,
  ],
  choices: (s, k) => [
    ch('no', 'hard', 'No. Not now, not ever', `forbade ${fn(s, k.m)} the pizzeria business`, [op(k.m, s.playerId, -6, 'Turned down the money of my life'), rivOp('philly', 4, 'Keeps the rule'), resp(1)]),
    ch('report', 'sly', 'Tell Philadelphia, before someone else does', `reported ${fn(s, k.m)}'s pizzeria talk to Philadelphia`, [heat('family', -5), op(k.m, s.playerId, -12, 'Gave my name to Philadelphia'), grudge(k.m, s.playerId, 15)]),
    ch('watch', 'away', 'Say nothing, and watch him', `kept an eye on ${fn(s, k.m)}`, [{ type: 'checkBackground', charId: k.m }, heat('family', 2)]),
  ],
};

const drunk: Situation<Cast & { m: string; rs: string }> = {
  id: 'drunk', theme: 'rivals', weight: 4, placed: true,
  cast: (s, h) => {
    const r = mobRival(s, h);
    if (!r) return undefined;
    const ms = Object.values(s.characters).filter((c) => c.alive && c.faction === r.rival && c.id !== s.rivals.find((x) => x.id === r.rival)!.leaderId && c.gender !== 'F');
    const m = P(h, ms.slice(0, 10));
    return m ? { ...r, m: m.id, actors: [m.id] } : undefined;
  },
  title: (s, k) => [`${fn(s, k.m)} in your bar`, `${k.rs}'s man is talking`, 'A loose mouth'],
  body: (s, k) => [
    `${nm(s, k.m)}, one of ${k.rs}'s, sat down at the Shamrock's bar at six and has been talking since seven: who is mad at whom, which truck goes where on Thursday. Your bartender keeps pouring and keeps a pencil behind his ear.`,
    `At the Riptide, which is yours, ${nm(s, k.m)} of ${k.rs} is buying rounds with money he says his boss owes him, and explaining to strangers exactly how much and why.`,
    `${nm(s, k.m)}, one of ${k.rs}'s, has been drinking at your bar since six and talking since seven: who is mad at whom, which truck goes where on Thursday. Your bartender keeps pouring and keeps a pencil behind his ear.`,
    `${nm(s, k.m)}, who is with ${k.rs}, came in for one and stayed for nine, and now he is crying about his boss to anybody who will listen. Your people are listening.`,
  ],
  choices: (s, k) => [
    ch('listen', 'sly', 'Keep pouring, keep listening', `got ${fn(s, k.m)} talking`, [money(-60), { type: 'rivalResource', rival: k.rival!, money: -1200 }, rivOp(k.rival!, -3, 'Pumped our man for information')]),
    ch('cab', 'soft', 'Put him in a cab, on the house', `sent ${fn(s, k.m)} home in a cab`, [money(-20), rivOp(k.rival!, 5, 'Treated our man decent'), op(k.m, s.playerId, 8, 'Got me home')]),
    ch('out', 'hard', 'Throw him out on Pacific Avenue', `threw ${fn(s, k.m)} out of your bar`, [resp(1), rivOp(k.rival!, -6, 'Threw our man in the street')]),
  ],
};

const tourist: Situation<Cast & { who: string }> = {
  id: 'tourist', theme: 'town', weight: 4,
  when: (s) => mo(s) >= 6 && mo(s) <= 9,
  cast: (_s, h) => ({ who: P(h, ['a singer playing the Starlight Ballroom whose Cadillac broke down on Ocean Avenue', 'a high roller from Baltimore who wants a real game, tonight', 'a Philadelphia Eagles lineman celebrating something loudly', 'a band from the Rendezvous who got in a fight with some sailors', 'a television game-show host on vacation who wants to "see the real Wildwood"'])! }),
  title: () => ['A visitor in trouble', 'Summer people', 'A famous face on the boardwalk'],
  body: (_s, k) => [
    `${k.who[0].toUpperCase()}${k.who.slice(1)}. He is the kind of guest who gets the island in the papers, one way or the other, and the cops are already asking your people what they want done.`,
    `Your manager on the boardwalk calls: ${k.who}. A man like that remembers who helped him on the Shore, and so does everyone who reads about it.`,
  ],
  choices: () => [
    ch('help', 'soft', `Take care of him (${$(300)})`, 'took care of a famous visitor', [money(-300), resp(2)]),
    ch('game', 'money', 'Take care of him, and set up a private game (+$900)', 'set up a private game for a visitor', [money(900), heat('local', 2)]),
    ch('cops', 'away', 'Let the cops handle it', 'let the cops handle a visitor', [heat('local', -1)]),
  ],
};

const outsource: Situation<Cast & { rs: string }> = {
  id: 'outsource', theme: 'rivals', weight: 2,
  when: (s) => yr(s) >= 1974,
  cast: (s, h) => { const r = mobRival(s, h); return r ? { ...r } : undefined; },
  title: () => ['Muscle for hire', 'The motorcycle club', 'Outsiders who do the work'],
  body: (_s, k) => [
    `A motorcycle club out of Vineland is offering what the young guys call "services": anything ${k.rs} has that needs breaking, they break, and nobody can trace it to you. Nobody can control them either.`,
    `A street crew from Camden wants work. They will lean on ${k.rs}'s places for a flat fee and keep your name out of it. The old-timers say a man who hires out his muscle has rented his reputation.`,
  ],
  choices: (_s, k) => [
    ch('hire', 'hard', `Hire them against ${k.rs} (${$(1000)})`, `hired outsiders against ${k.rs}`, [money(-1000), { type: 'rivalResource', rival: k.rival!, muscle: -6 }, heat('local', 4), rivOp(k.rival!, -8, 'Sent animals after us')]),
    ch('no', 'soft', 'Our work is done by our people', 'turned down hired muscle', [crewOp(2, 'Keeps the work in the family')]),
    ch('tell', 'sly', `Let ${k.rs} know the offer was made`, `warned ${k.rs} about the hired muscle`, [rivOp(k.rival!, 6, 'Warned us')]),
  ],
};

export const SITUATIONS: Situation[] = [
  feud, reelect, widow, rivalBiz, kidSchool, weather, aftermath, jailed, newCop, hijack, union, associate, oldYoung, books, hearings, rico, vanished, undercover, dinner, prosecutor, casino, gasTax, vacationer, oldTimer, pizzeria, drunk, tourist, outsource,
] as unknown as Situation[];

/** The situations of the opening weeks (openings.ts): the first threats and the first crew drama. */
export function situationById(id: string): Situation | undefined {
  return SITUATIONS.find((x) => x.id === id);
}
