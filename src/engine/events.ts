import { perkMod } from './lifestyle';
import { ageOn, gameYear, monthKey, seasonMultiplier } from './calendar';
import { capos, crew, displayName, hasTrait, livingDynasty, makeCharacter, player, relationLabel } from './characters';
import { MAX_PER_KIND } from './actions';
import { countKind, newBusiness, playerSlots } from './business';
import { CATALOG, SHOP_KINDS } from './catalog';
import { defaulter } from './loans';
import { opinion } from './relations';
import { chance, pick, randInt, shuffle, weightedPick } from './rng';
import { FACTION_NAMES } from './world';
import type { Character, Choice, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * Event system. Event definitions have a condition, a weight, a cooldown and
 * a builder that produces a concrete EventInstance with choices. Every choice
 * lists its effects up front (the UI renders them as chips), and may schedule
 * a consequence 1–8 weeks later via a `schedule` effect.
 */

export const MAX_POPUPS = 4;

/**
 * Extra event sources (the dynasty layer's family drama, ...). Each may offer
 * one candidate a week with its own cooldowns; candidates compete by
 * priority and are still capped by MAX_POPUPS.
 */
export const EVENT_SOURCES: ((s: GameState) => EventInstance | undefined)[] = [];
export function registerEventSource(fn: (s: GameState) => EventInstance | undefined): void {
  if (!EVENT_SOURCES.includes(fn)) EVENT_SOURCES.push(fn);
}

export interface EventDef {
  id: string;
  weight: (s: GameState) => number;
  cooldown: number;
  condition: (s: GameState) => boolean;
  build: (s: GameState) => EventInstance | undefined;
}

function iid(s: GameState): string {
  return `ev${s.nextId++}`;
}

function rnd100(_s: GameState, n: number): number {
  return Math.round(n / 100) * 100;
}

/* ------------------------------------------------------------------ */
/* Bagman                                                              */
/* ------------------------------------------------------------------ */

export const BAGMAN_START_WEEK = 3;
export const TRIBUTE_RATE = 0.09;

export function envelopeSize(s: GameState): number {
  const recent = s.incomeHistory.slice(-4);
  const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 2000;
  return Math.max(600, rnd100(s, avg * 4.33 * TRIBUTE_RATE * (1 - perkMod(s, 'tribute') / 100)));
}

export function bagmanDue(s: GameState): boolean {
  return s.week >= BAGMAN_START_WEEK && s.lastBagmanMonth !== monthKey(s.date) && !s.flags.brokeFromPhilly;
}

export function buildBagman(s: GameState): EventInstance {
  const env = envelopeSize(s);
  const short = rnd100(s, env * 0.6);
  const over = rnd100(s, env * 1.35);
  const moretti = s.characters[s.rivals.find((r) => r.id === 'philly')!.leaderId];
  const mid = moretti.id;
  return {
    iid: iid(s),
    defId: 'bagman',
    title: 'The bagman from Philadelphia',
    text: `${moretti.firstName} Moretti's bagman is waiting in a Buick outside the Ivanhoe. Philadelphia's end this month comes to $${env.toLocaleString('en-US')}.`,
    week: s.week,
    mandatory: true,
    priority: 80,
    defaultChoiceId: 'full',
    meta: { envelope: env },
    actors: [mid],
    choices: [
      {
        id: 'full',
        label: `Pay in full`,
        because: 'paid Philadelphia in full',
        effects: [
          { type: 'money', amount: -env, category: 'tribute', label: 'Tribute to Philadelphia (paid in full)' },
          { type: 'heat', bar: 'family', amount: -3, label: 'Philadelphia is content' },
          { type: 'opinion', from: mid, to: s.playerId, amount: 3, reason: 'Pays on time', decay: 1 },
        ],
      },
      {
        id: 'short',
        label: `Pay short`,
        detail: 'Blame a slow week. They might believe it.',
        because: 'paid Philadelphia short',
        effects: [
          { type: 'money', amount: -short, category: 'tribute', label: 'Tribute to Philadelphia (short envelope)' },
          { type: 'heat', bar: 'family', amount: 9, label: 'Short envelope' },
          { type: 'opinion', from: mid, to: s.playerId, amount: -10, reason: 'Short envelope', decay: 1 },
          { type: 'schedule', key: 'philly_short', minWeeks: 2, maxWeeks: 6, chance: 0.5, hint: 'Philadelphia may count it twice' },
        ],
      },
      {
        id: 'over',
        label: `Pay over`,
        detail: 'A little extra for Sal. Buys goodwill.',
        because: 'paid Philadelphia over',
        effects: [
          { type: 'money', amount: -over, category: 'tribute', label: 'Tribute to Philadelphia (paid over)' },
          { type: 'heat', bar: 'family', amount: -8, label: 'Generous envelope' },
          { type: 'opinion', from: mid, to: s.playerId, amount: 10, reason: 'Generous envelope', decay: 1 },
          { type: 'schedule', key: 'philly_over', minWeeks: 2, maxWeeks: 6, chance: 0.6, hint: 'Philadelphia may return the favor' },
        ],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The sit-down: exactly 3 situational orders, no repeats two weeks running */
/* ------------------------------------------------------------------ */

export interface OrderDef {
  key: string;
  available: (s: GameState) => boolean;
  build: (s: GameState) => Choice;
}

function strongestRivalStrike(s: GameState): RivalId | undefined {
  const recent = s.rivals.filter((r) => r.kind === 'mob' && r.lastMove && r.lastMove.move === 'strike' && r.lastMove.target === 'player' && s.week - r.lastMove.week <= 3);
  return recent[0]?.id;
}

function expandTarget(s: GameState): string | undefined {
  const ds = s.districts.filter((d) => (d.influence.player ?? 0) < 85).sort((a, b) => (b.influence.player ?? 0) - (a.influence.player ?? 0));
  return ds[0]?.id;
}

export const ORDERS: OrderDef[] = [
  {
    key: 'shakedown',
    available: () => true,
    build: (s) => {
      const amt = rnd100(s, 900 * seasonMultiplier(s.date) + 400);
      return {
        id: 'shakedown',
        label: 'Lean on the Pacific Avenue bars',
        detail: 'Protection money, collected with a smile.',
        because: 'leaned on the Pacific Avenue bars',
        effects: [
          { type: 'money', amount: amt },
          { type: 'heat', bar: 'local', amount: 4 },
          { type: 'crewOpinion', amount: 0, reason: 'Gave us real work', traitMods: { Cruel: 5, 'Hot-headed': 3 } },
          { type: 'schedule', key: 'shakedown_complaint', minWeeks: 1, maxWeeks: 4, chance: 0.35, hint: 'a bar owner may squeal' },
        ],
      };
    },
  },
  {
    key: 'expand',
    available: (s) => !!expandTarget(s) && s.money >= 2000,
    build: (s) => {
      const d = s.districts.find((x) => x.id === expandTarget(s))!;
      const owner = (Object.keys(d.influence) as (keyof typeof d.influence)[]).filter((f) => f !== 'player' && f !== 'none' && (d.influence[f] ?? 0) > 0)
        .sort((a, b) => (d.influence[b] ?? 0) - (d.influence[a] ?? 0))[0] as RivalId | undefined;
      const effects: Effect[] = [
        { type: 'money', amount: -2000 },
        { type: 'influence', district: d.id, faction: 'player', amount: 7 },
        { type: 'heat', bar: 'local', amount: 2 },
      ];
      if (owner && s.rivals.some((r) => r.id === owner)) {
        effects.push({ type: 'rivalOpinion', rival: owner, amount: -10, reason: `Pushed into ${d.name}` });
        effects.push({ type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 5, chance: 0.4, hint: `${FACTION_NAMES[owner]} may hit back`, params: { rival: owner } });
      }
      return { id: 'expand', label: `Push into ${d.name}`, detail: `Put men on the corners (${d.influence.player ?? 0}% ours now).`, because: `pushed into ${d.name}`, effects };
    },
  },
  {
    key: 'laylow',
    available: (s) => s.heat.local >= 20 || s.heat.federal >= 20,
    build: () => ({
      id: 'laylow',
      label: 'Tell everyone to lay low',
      detail: 'Close the back rooms for a week.',
      because: 'told the crew to lay low',
      effects: [
        { type: 'heat', bar: 'local', amount: -6 },
        { type: 'heat', bar: 'federal', amount: -3 },
        { type: 'money', amount: -600, label: 'Lay low: lost business' },
        { type: 'crewOpinion', amount: -2, reason: 'Sat on our hands', traitMods: { Patient: 4, Cowardly: 4 } },
      ],
    }),
  },
  {
    key: 'parish',
    available: (s) => s.money >= 1000,
    build: (s) => ({
      id: 'parish',
      label: 'Donate to St. Ann\'s parish',
      detail: 'The monsignor will mention you from the pulpit.',
      because: 'gave money to St. Ann\'s',
      effects: [
        { type: 'money', amount: -1000 },
        { type: 'respect', amount: 2 },
        { type: 'heat', bar: 'local', amount: -2 },
        { type: 'familyOpinion', amount: 4, reason: 'Generous to the church' },
        { type: 'crewOpinion', amount: 0, reason: 'Generous to the church', traitMods: { Pious: 8 } },
        { type: 'schedule', key: 'parish_blessing', minWeeks: 2, maxWeeks: 6, chance: 0.4, hint: 'the parish may return the favor' },
      ].filter((e) => e.type !== 'familyOpinion' || livingDynasty(s).length > 1) as Effect[],
    }),
  },
  {
    key: 'cops',
    available: (s) => s.heat.local >= 15 && s.money >= 2000,
    build: () => ({
      id: 'cops',
      label: 'Grease the Chief of Police',
      detail: 'A Christmas envelope in July.',
      because: 'paid off the Chief of Police',
      effects: [
        { type: 'money', amount: -2000 },
        { type: 'heat', bar: 'local', amount: -10 },
        { type: 'schedule', key: 'cops_flip', minWeeks: 3, maxWeeks: 8, chance: 0.15, hint: 'a cop might talk' },
      ],
    }),
  },
  {
    key: 'business',
    available: (s) => s.money >= 4000 && s.districts.some((d) => (d.influence.player ?? 0) >= 40 && playerSlots(s, d.id).used < playerSlots(s, d.id).max),
    build: (s) => {
      const kinds = SHOP_KINDS.filter((k) => CATALOG[k].cost <= s.money * 0.6 && k !== 'narcotics' && countKind(s, k) < MAX_PER_KIND);
      const kind = kinds.length ? pick(s, kinds) : 'pizza';
      const ours = s.districts.filter((d) => (d.influence.player ?? 0) >= 40 && playerSlots(s, d.id).used < playerSlots(s, d.id).max);
      const d = ours.length ? pick(s, ours) : s.districts[0];
      const def = CATALOG[kind];
      const b = newBusiness(s, kind, d.id);
      const label = `Buy: ${b.name}`;
      return {
        id: 'business',
        label: `Open ${b.name}`,
        detail: `${def.name} in ${d.name}: about $${Math.round(def.base * def.season[0]).toLocaleString('en-US')}/wk in season.`,
        because: `opened ${b.name}`,
        effects: [
          { type: 'money', amount: -def.cost, label },
          { type: 'addBusiness', business: b, label },
          { type: 'schedule', key: 'business_trouble', minWeeks: 2, maxWeeks: 8, chance: 0.25, hint: 'new places attract attention', label },
        ],
      };
    },
  },
  {
    key: 'hitback',
    available: (s) => !!strongestRivalStrike(s),
    build: (s) => {
      const r = strongestRivalStrike(s)!;
      const name = FACTION_NAMES[r];
      return {
        id: 'hitback',
        label: `Hit back at ${name}`,
        detail: 'Burn something of theirs. Nobody touches our people.',
        because: `hit back at ${name}`,
        effects: [
          { type: 'money', amount: -800 },
          { type: 'rivalResource', rival: r, muscle: -12, money: -3000 },
          { type: 'respect', amount: 3 },
          { type: 'heat', bar: 'local', amount: 5 },
          { type: 'rivalOpinion', rival: r, amount: -20, reason: 'Hit our people' },
          { type: 'crewOpinion', amount: 5, reason: 'Stood up for us', traitMods: { Cowardly: -6 } },
          { type: 'schedule', key: 'retaliation', minWeeks: 2, maxWeeks: 6, chance: 0.45, hint: `${name} may escalate`, params: { rival: r } },
        ],
      };
    },
  },
  {
    key: 'shylock',
    available: (s) => s.businesses.some((b) => b.owner === 'player' && b.kind === 'loansharking') || crew(s).length > 6,
    build: (s) => ({
      id: 'shylock',
      label: 'Collect on the shylock book',
      detail: 'Some of these guys are three weeks late.',
      because: 'squeezed the late payers',
      effects: [
        { type: 'money', amount: rnd100(s, 700 + 500 * seasonMultiplier(s.date)) },
        { type: 'heat', bar: 'local', amount: 3 },
        { type: 'respect', amount: 1 },
      ],
    }),
  },
  {
    key: 'clambake',
    available: (s) => s.money >= 1500,
    build: () => ({
      id: 'clambake',
      label: 'Throw the crew a clambake',
      detail: 'Steamers, beer and a day off on the bay.',
      because: 'threw the crew a clambake',
      effects: [
        { type: 'money', amount: -1200 },
        { type: 'crewOpinion', amount: 8, reason: 'Took care of us', traitMods: { Drinker: 4, Greedy: -4 } },
      ],
    }),
  },
  {
    key: 'gift',
    available: (s) => s.heat.family >= 10 && s.money >= 1500,
    build: () => ({
      id: 'gift',
      label: 'Send a gift to Sal Moretti',
      detail: 'A new Cadillac for his daughter\'s wedding.',
      because: 'sent Moretti a gift',
      effects: [
        { type: 'money', amount: -1500 },
        { type: 'heat', bar: 'family', amount: -7 },
        { type: 'rivalOpinion', rival: 'philly', amount: 8, reason: 'Remembers his friends' },
      ].map((e) => e) as Effect[],
    }),
  },
  {
    key: 'recruit',
    available: (s) => crew(s).length < 16 && s.money >= 800,
    build: () => ({
      id: 'recruit',
      label: 'Bring along a couple of young guys',
      detail: 'Associates. Cheap, eager, unproven.',
      because: 'brought in new associates',
      effects: [
        { type: 'money', amount: -500 },
        { type: 'flag', key: 'recruitOrder', value: 1 },
        { type: 'schedule', key: 'recruits_arrive', minWeeks: 1, maxWeeks: 2, chance: 1, hint: 'new associates join' },
      ],
    }),
  },
  {
    key: 'kessler',
    available: (s) => (s.districts.find((d) => d.id === 'north')?.influence.kessler ?? 0) > 10,
    build: (s) => ({
      id: 'kessler',
      label: 'Squeeze Danny Kessler\'s clubs',
      detail: 'Remind North Wildwood who runs the island.',
      because: 'squeezed Kessler\'s clubs',
      effects: [
        { type: 'money', amount: rnd100(s, 600 + 600 * seasonMultiplier(s.date)) },
        { type: 'influence', district: 'north', faction: 'player', amount: 3 },
        { type: 'rivalOpinion', rival: 'kessler', amount: -15, reason: 'Shook down my clubs' },
        { type: 'heat', bar: 'local', amount: 3 },
        { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 5, chance: 0.35, hint: 'Kessler may hit back', params: { rival: 'kessler' } },
      ],
    }),
  },
  {
    key: 'launder',
    available: (s) => s.heat.federal >= 10 && s.money >= 800,
    build: () => ({
      id: 'launder',
      label: 'Wash money through the motels',
      detail: 'Clean books for the IRS.',
      because: 'laundered money through the motels',
      effects: [
        { type: 'money', amount: -700 },
        { type: 'heat', bar: 'federal', amount: -6 },
      ],
    }),
  },
  {
    key: 'narcotics',
    available: (s) => gameYear(s.week) >= 1 && s.week >= 6,
    build: (s) => ({
      id: 'narcotics',
      label: 'Take a cut of a heroin shipment',
      detail: 'Bruno forbids it. The money is very good.',
      because: 'took a cut of the heroin trade against Bruno\'s rule',
      effects: [
        { type: 'money', amount: rnd100(s, 4000 + 1500 * seasonMultiplier(s.date)) },
        { type: 'heat', bar: 'federal', amount: 10 },
        { type: 'heat', bar: 'family', amount: 6 },
        { type: 'crewOpinion', amount: -4, reason: 'Dealing junk', traitMods: { Greedy: 10, Pious: -8, Honest: -6 } },
        { type: 'schedule', key: 'narcotics_found_out', minWeeks: 2, maxWeeks: 8, chance: 0.55, hint: 'Philadelphia may find out' },
      ],
    }),
  },
];

export function buildSitDown(s: GameState): EventInstance {
  const avail = ORDERS.filter((o) => !s.lastSitDownOrders.includes(o.key) && o.available(s));
  let picked = shuffle(s, avail).slice(0, 3);
  if (picked.length < 3) {
    // Fallback (should not happen: shakedown/clambake/parish/... cover it), allow repeats.
    const rest = shuffle(s, ORDERS.filter((o) => o.available(s) && !picked.includes(o)));
    picked = [...picked, ...rest].slice(0, 3);
  }
  const choices = picked.map((o) => o.build(s));
  return {
    iid: iid(s),
    defId: 'sitdown',
    title: 'The sit-down',
    text: 'Your capos are gathered in the back of the Shamrock. They want to know what you want done this week.',
    week: s.week,
    mandatory: true,
    priority: 50,
    defaultChoiceId: choices[0].id,
    meta: { orders: picked.map((o) => o.key).join(',') },
    choices,
  };
}

/* ------------------------------------------------------------------ */
/* Random / situational events                                         */
/* ------------------------------------------------------------------ */

function skimmer(s: GameState): Character | undefined {
  return capos(s).filter((c) => (c.skimmed ?? 0) >= 1200).sort((a, b) => (b.skimmed ?? 0) - (a.skimmed ?? 0))[0];
}

function tooBig(s: GameState): Character | undefined {
  return crew(s).filter((c) => !c.dynasty && (c.rank === 'soldier' || c.rank === 'capo') && c.wealth >= 12000 && (hasTrait(c, 'Ambitious') || hasTrait(c, 'Greedy')) && (c.bigWeek === undefined || s.week - c.bigWeek > 26))
    .sort((a, b) => b.wealth - a.wealth)[0];
}

function drifter(s: GameState): Character | undefined {
  return crew(s).find((c) => (c.defectStage ?? 0) >= 2);
}

export const EVENT_DEFS: EventDef[] = [
  {
    id: 'too_big',
    cooldown: 6,
    weight: () => 5,
    condition: (s) => !!tooBig(s),
    build: (s) => {
      const c = tooBig(s)!;
      c.bigWeek = s.week;
      const half = Math.round(c.wealth / 2 / 100) * 100;
      const all = Math.round(c.wealth / 100) * 100;
      const nm = displayName(c);
      const label = `${c.firstName} is getting big`;
      return {
        iid: iid(s), defId: 'too_big', week: s.week, mandatory: false, priority: 42,
        title: `${c.firstName} is getting too big`,
        text: `${nm} drives a new Eldorado and is buying rounds at the Riptide. He has put away $${c.wealth.toLocaleString('en-US')} of his own, and people are starting to call him "boss".`,
        defaultChoiceId: 'partner', meta: { charId: c.id }, actors: [c.id],
        choices: [
          { id: 'partner', label: 'Bring him in as a partner', detail: 'He puts half his money into the family.', because: `brought ${c.firstName}'s money into the family`, effects: [{ type: 'money', amount: half, label }, { type: 'wealth', charId: c.id, amount: -half, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: 'Made me a partner', decay: 1, label }, { type: 'attention', charId: c.id, label }] },
          { id: 'take', label: 'Take everything he has', detail: 'Remind him whose money it really is.', because: `took everything ${c.firstName} had`, effects: [{ type: 'money', amount: all, label }, { type: 'wealth', charId: c.id, amount: -all, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -40, reason: 'Took everything I had', decay: 0, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 40, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 20, label }] },
          { id: 'whack', label: 'Whack him and take it', detail: 'Nobody gets bigger than the family.', because: `had ${c.firstName} whacked for getting too big`, effects: [{ type: 'kill', charId: c.id, cause: 'whacked for getting too big', killer: 'player', label }, { type: 'money', amount: all, label: `${c.firstName}'s money, seized` }, { type: 'heat', bar: 'local', amount: 6, label }, { type: 'respect', amount: 2, label }, { type: 'crewOpinion', amount: -4, reason: 'Killed one of our own for earning', traitMods: { Cruel: 6, Greedy: -3 }, label }] },
          { id: 'let', label: 'Let him enjoy it', because: `let ${c.firstName} enjoy his money`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: 6, reason: 'Lets me earn', decay: 1, label }, { type: 'respect', amount: -1, label }] },
        ],
      };
    },
  },
  {
    id: 'drifting',
    cooldown: 3,
    weight: () => 8,
    condition: (s) => !!drifter(s),
    build: (s) => {
      const c = drifter(s)!;
      const label = `${c.firstName} is drifting`;
      return {
        iid: iid(s), defId: 'drifting', week: s.week, mandatory: false, priority: 46,
        title: `${c.firstName} is drifting`,
        text: `${displayName(c)} hasn't come by the club in a month. Somebody saw him getting into a car with Atlantic City plates. Nobody from the family has talked to him since summer.`,
        defaultChoiceId: 'talk', meta: { charId: c.id }, actors: [c.id],
        choices: [
          { id: 'talk', label: 'Sit down with him', detail: 'Coffee and a long walk on the boardwalk.', because: `sat down with ${c.firstName}`, effects: [{ type: 'money', amount: -150, label }, { type: 'attention', charId: c.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: 'The boss made time for me', decay: 1, label }] },
          { id: 'envelope', label: 'Send him an envelope ($1,000)', because: `sent ${c.firstName} an envelope`, effects: [{ type: 'money', amount: -1000, label }, { type: 'attention', charId: c.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 20, reason: 'Took care of me', decay: 2, label }] },
          { id: 'warn', label: 'Put him on notice', detail: 'Remind him what happens to people who leave.', because: `put ${c.firstName} on notice`, effects: [{ type: 'attention', charId: c.id, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 25, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -8, reason: 'Threatened me', decay: 1, label }] },
          { id: 'ignore', label: 'Let him go if he wants', because: `let ${c.firstName} drift`, effects: [{ type: 'respect', amount: -1, label }] },
        ],
      };
    },
  },
  {
    id: 'borrower_default',
    cooldown: 2,
    weight: () => 6,
    condition: (s) => !!defaulter(s),
    build: (s) => {
      const l = defaulter(s)!;
      const who = l.borrower.split(',')[0];
      const owed = l.principal;
      const choices: Choice[] = [
        {
          id: 'lean', label: 'Send a collector', detail: 'Explain the terms. Firmly.', because: `sent a collector after ${who}`,
          effects: [
            { type: 'loanResolve', loanId: l.id, mode: 'collect', label: `Collector visits ${who}` },
            { type: 'heat', bar: 'local', amount: 3, label: `Collector visits ${who}` },
            { type: 'respect', amount: 1, label: `Collector visits ${who}` },
          ],
        },
        {
          id: 'time', label: 'Give him a few weeks', because: `gave ${who} more time`,
          effects: [{ type: 'loanResolve', loanId: l.id, mode: 'grace', label: `More time for ${who}` }, { type: 'respect', amount: -1, label: `Soft on ${who}` }],
        },
        {
          id: 'writeoff', label: 'Write it off', because: `wrote off ${who}'s loan`,
          effects: [{ type: 'loanResolve', loanId: l.id, mode: 'writeoff', label: `Wrote off ${who}` }, { type: 'respect', amount: -1, label: `Wrote off ${who}` }],
        },
      ];
      if (l.collateral) {
        const ours = s.districts.filter((d) => (d.influence.player ?? 0) >= 20);
        const d = ours.length ? ours[0] : s.districts[0];
        const b = newBusiness(s, l.collateral, d.id, l.collateralName ? l.collateralName.charAt(0).toUpperCase() + l.collateralName.slice(1) : undefined);
        b.cost = Math.round(owed * 1.2);
        choices.unshift({
          id: 'take', label: `Take ${l.collateralName}`, detail: 'He signed it over when he took the money.', because: `took ${l.collateralName} for a bad debt`,
          effects: [
            { type: 'loanResolve', loanId: l.id, mode: 'writeoff', label: `Debt settled with ${l.collateralName}` },
            { type: 'addBusiness', business: b, label: `Took ${l.collateralName} for the debt` },
            { type: 'heat', bar: 'local', amount: 2, label: `Took ${l.collateralName}` },
          ],
        });
      }
      return {
        iid: iid(s), defId: 'borrower_default', week: s.week, mandatory: false, priority: 45,
        title: `${who} can't pay`,
        text: `${l.borrower} is ${l.weeksLate} weeks behind on $${owed.toLocaleString('en-US')} from the book. The other borrowers are watching how you handle it.`,
        defaultChoiceId: l.collateral ? 'take' : 'lean',
        meta: { loan: l.id },
        choices,
      };
    },
  },
  {
    id: 'skimming',
    cooldown: 6,
    weight: (s) => 3 + (skimmer(s)?.skimmed ?? 0) / 1000,
    condition: (s) => !!skimmer(s),
    build: (s) => {
      const c = skimmer(s)!;
      const amt = c.skimmed ?? 0;
      const back = Math.min(Math.round(amt / 2), c.wealth);
      const nm = displayName(c);
      const relatives = Object.values(s.characters).filter((o) => o.alive && (o.fatherId === c.id || c.spouseId === o.id || (c.fatherId && o.fatherId === c.fatherId)) && o.id !== c.id);
      return {
        iid: iid(s), defId: 'skimming', week: s.week, mandatory: false, priority: 35,
        title: `${c.firstName}'s envelopes are light`,
        text: `Your bookkeeper ran the numbers twice. ${nm} has been skimming — about $${amt.toLocaleString('en-US')} since anyone last looked.`,
        defaultChoiceId: 'word',
        meta: { charId: c.id },
        choices: [
          {
            id: 'slide', label: 'Let it slide', detail: 'Everybody wets his beak a little.', because: `let ${c.firstName}'s skimming slide`,
            effects: [
              { type: 'opinion', from: c.id, to: s.playerId, amount: 6, reason: 'Looked the other way' },
              { type: 'skimReset', charId: c.id, label: 'ledger reset' },
              { type: 'respect', amount: -1 },
              { type: 'crewOpinion', amount: 0, reason: 'Lets capos steal', traitMods: { Honest: -6, Greedy: 3 } },
            ],
          },
          {
            id: 'word', label: 'Have a word', detail: 'Get half of it back. Make him sweat.', because: `confronted ${c.firstName} about skimming`,
            effects: [
              { type: 'money', amount: back, label: `${c.firstName} pays back half of what he skimmed` },
              { type: 'skimReset', charId: c.id },
              { type: 'opinion', from: c.id, to: s.playerId, amount: -10, reason: 'Humiliated me in front of the crew' },
              { type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 20 },
            ],
          },
          {
            id: 'example', label: 'Make an example of him', detail: 'Nobody steals from this family.', because: `had ${c.firstName} killed for skimming`,
            effects: [
              { type: 'kill', charId: c.id, cause: 'found in the marsh off the Rio Grande causeway', killer: 'player' },
              { type: 'respect', amount: 4 },
              { type: 'heat', bar: 'local', amount: 7 },
              { type: 'heat', bar: 'family', amount: 5 },
              { type: 'crewOpinion', amount: -3, reason: 'Killed one of our own', traitMods: { Cruel: 8, Honest: 5, Pious: -6 } },
              ...relatives.map((r) => ({ type: 'opinion', from: r.id, to: s.playerId, amount: -40, reason: `You had my ${relationLabel(s, r, c)} killed`, decay: 0 }) as Effect),
              { type: 'schedule', key: 'example_widow', minWeeks: 2, maxWeeks: 6, chance: 0.35, hint: 'his family may talk to the cops' },
            ],
          },
        ],
      };
    },
  },
  {
    id: 'favor',
    cooldown: 5,
    weight: () => 3,
    condition: () => true,
    build: (s) => {
      const variants = [
        { who: 'Councilman Dougherty', ask: 'wants his nephew hired on at the pier, no questions asked', cost: 400, key: 'favor_council' },
        { who: 'Mrs. Abate from the bakery', ask: 'needs the punks who broke her window found and taught some manners', cost: 200, key: 'favor_widow' },
        { who: 'Father Callahan', ask: 'needs the parish festival on the boardwalk to go off without trouble', cost: 600, key: 'favor_priest' },
        { who: 'Lt. Ruane of the Wildwood PD', ask: 'wants his gambling marker at the Starlight torn up', cost: 900, key: 'favor_cop' },
      ];
      const v = pick(s, variants);
      return {
        iid: iid(s), defId: 'favor', week: s.week, mandatory: false, priority: 30,
        title: 'A favor is asked',
        text: `${v.who} ${v.ask}.`,
        defaultChoiceId: 'grant',
        meta: { key: v.key },
        choices: [
          {
            id: 'grant', label: 'Grant the favor', because: `did a favor for ${v.who}`,
            effects: [
              { type: 'money', amount: -v.cost },
              { type: 'respect', amount: 1 },
              { type: 'schedule', key: 'favor_returned', minWeeks: 2, maxWeeks: 8, chance: 0.6, hint: 'they will owe you', params: { who: v.who } },
            ],
          },
          {
            id: 'refuse', label: 'Not this time', because: `refused ${v.who}`,
            effects: [{ type: 'respect', amount: -1 }],
          },
        ],
      };
    },
  },
  {
    id: 'recruit',
    cooldown: 6,
    weight: (s) => (crew(s).length < 10 ? 5 : 2),
    condition: (s) => crew(s).length < 18,
    build: (s) => {
      const r = makeCharacter(s, { rank: 'civilian', faction: 'none', age: randInt(s, 19, 30), nickname: false });
      const nm = `${r.firstName} ${r.lastName}`;
      return {
        iid: iid(s), defId: 'recruit', week: s.week, mandatory: false, priority: 30,
        title: 'A kid wants in',
        text: `${nm}, ${ageOn(r.birth, s.date)}, has been hanging around the Shamrock all summer. Everyone says he's ${r.traits.map((t) => t.toLowerCase()).join(' and ')}. He wants to be with you.`,
        defaultChoiceId: 'test',
        meta: { charId: r.id },
        choices: [
          {
            id: 'take', label: 'Bring him in', detail: `Force ${r.attributes.force}, business ${r.attributes.business}.`, because: `brought ${nm} into the crew`,
            effects: [
              { type: 'recruit', charId: r.id },
              { type: 'opinion', from: r.id, to: s.playerId, amount: 20, reason: 'Gave me my chance', decay: 1 },
              ...(hasTrait(r, 'Cowardly') ? [{ type: 'schedule', key: 'recruit_rat', minWeeks: 3, maxWeeks: 8, chance: 0.35, hint: 'unknown', params: { charId: r.id } } as Effect] : []),
            ],
          },
          {
            id: 'test', label: 'Test him first', detail: 'Have him make a collection or two.', because: `put ${nm} to the test`,
            effects: [
              { type: 'money', amount: -300, label: `Testing ${r.firstName}: expenses` },
              { type: 'schedule', key: 'recruit_test', minWeeks: 1, maxWeeks: 3, chance: 1, hint: 'see how he does', params: { charId: r.id } },
            ],
          },
          { id: 'refuse', label: 'Send him home to his mother', because: `turned ${nm} away`, effects: [] },
        ],
      };
    },
  },
  {
    id: 'sunday',
    cooldown: 4,
    weight: () => 3,
    condition: (s) => livingDynasty(s).length >= 2,
    build: (s) => {
      const boss = player(s);
      const fam = livingDynasty(s).filter((c) => c.id !== boss.id);
      const sour = fam.filter((c) => opinion(s, c.id, boss.id) < 0);
      const grown = fam.filter((c) => c.gender === 'M' && ageOn(c.birth, s.date) >= 18 && c.rank === 'civilian');
      const effects: Effect[] = [];
      const choices: Choice[] = [
        {
          id: 'gravy', label: 'Sunday gravy with the whole family', detail: 'Macaroni at two, nobody leaves before cannoli.', because: 'kept Sunday dinner sacred',
          effects: [{ type: 'money', amount: -150, label: 'Sunday dinner' }, { type: 'familyOpinion', amount: 6, reason: 'Never misses Sunday dinner' }, ...effects],
        },
        {
          id: 'business', label: 'Talk business at the table', detail: 'Invite the capos. The women will not like it.', because: 'talked business at Sunday dinner',
          effects: [
            { type: 'familyOpinion', amount: -4, reason: 'Brought business to the table' },
            { type: 'crewOpinion', amount: 4, reason: 'Invited to the boss\'s table' },
          ],
        },
        { id: 'skip', label: 'Skip it — there\'s work', because: 'skipped Sunday dinner', effects: [{ type: 'familyOpinion', amount: -6, reason: 'Missed Sunday dinner' }] },
      ];
      if (grown.length) {
        const g = grown[0];
        choices.push({
          id: 'bring_in', label: `Bring ${g.firstName} into the business`, detail: `${relationLabel(s, boss, g)}, ${ageOn(g.birth, s.date)}.`, because: `brought ${g.firstName} into the life`,
          effects: [
            { type: 'rank', charId: g.id, rank: 'associate' },
            { type: 'recruit', charId: g.id },
            { type: 'opinion', from: g.id, to: boss.id, amount: 15, reason: 'Trusted me with the family business' },
            { type: 'familyOpinion', amount: -3, reason: 'Pulled a boy into the life' },
          ],
        });
      }
      return {
        iid: iid(s), defId: 'sunday', week: s.week, mandatory: false, priority: 25,
        title: 'Sunday dinner',
        text: sour.length
          ? `Sunday dinner at the house on Glenwood Avenue. ${sour[0].firstName} has barely said a word to you in weeks.`
          : 'Sunday dinner at the house on Glenwood Avenue. The whole family is coming.',
        defaultChoiceId: 'gravy',
        choices,
      };
    },
  },
  {
    id: 'capo_request',
    cooldown: 8,
    weight: () => 1.5,
    condition: (s) => capos(s).some((c) => hasTrait(c, 'Ambitious') || hasTrait(c, 'Greedy')),
    build: (s) => {
      const c = capos(s).find((x) => hasTrait(x, 'Ambitious') || hasTrait(x, 'Greedy'))!;
      return {
        iid: iid(s), defId: 'capo_request', week: s.week, mandatory: false, priority: 30,
        title: `${c.firstName} wants a bigger end`,
        text: `${displayName(c)} says he is carrying his district and wants a bigger cut — or a second territory.`,
        defaultChoiceId: 'no',
        meta: { charId: c.id },
        choices: [
          { id: 'yes', label: 'Give him a bonus', because: `gave ${c.firstName} a bonus`, effects: [{ type: 'money', amount: -1500 }, { type: 'opinion', from: c.id, to: s.playerId, amount: 15, reason: 'Paid me what I\'m worth' }] },
          { id: 'no', label: 'Tell him to be grateful', because: `refused ${c.firstName} a raise`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -12, reason: 'Refused my request' }, { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 10 }] },
        ],
      };
    },
  },
];

/** Philadelphia knows about the pipeline. */
export function buildNarcoticsReckoning(s: GameState, bizId: string): EventInstance {
  const pay = Math.max(5000, Math.round(s.money * 0.15 / 100) * 100);
  return {
    iid: iid(s), defId: 'narcotics_reckoning', week: s.week, mandatory: true, priority: 85,
    title: 'Philadelphia knows',
    text: 'Sal Moretti does not sit down. He says one sentence: the old man in Philadelphia has heard about the docks, and the old man does not repeat himself.',
    defaultChoiceId: 'close',
    meta: { biz: bizId },
    choices: [
      {
        id: 'close', label: 'Shut the pipeline down tonight', detail: 'Eat the investment. Keep your head.', because: 'shut down the narcotics pipeline when Philadelphia found out',
        effects: [
          { type: 'removeBusiness', businessId: bizId, label: 'Pipeline shut down' },
          { type: 'heat', bar: 'family', amount: -10, label: 'Philadelphia: the pipeline is closed' },
          { type: 'rivalOpinion', rival: 'philly', amount: 10, reason: 'Listened when told' },
        ],
      },
      {
        id: 'pay', label: `Pay Philadelphia ${'$' + pay.toLocaleString('en-US')} to forget`, detail: 'Money talks. Sometimes.', because: 'paid Philadelphia to forget the pipeline',
        effects: [
          { type: 'money', amount: -pay, label: 'Envelope to Philadelphia: forget the docks' },
          { type: 'heat', bar: 'family', amount: -4, label: 'Philadelphia takes the envelope' },
          { type: 'schedule', key: 'philly_message', minWeeks: 4, maxWeeks: 10, chance: 0.35, hint: 'the old man may not forget', label: 'Envelope to Philadelphia' },
        ],
      },
      {
        id: 'defy', label: 'Keep it running', detail: 'The money is too good.', because: 'defied Philadelphia over narcotics',
        effects: [
          { type: 'rivalOpinion', rival: 'philly', amount: -30, reason: 'Defied the old man on narcotics' },
          { type: 'heat', bar: 'family', amount: 12, label: 'Defied Philadelphia' },
          { type: 'schedule', key: 'philly_message', minWeeks: 2, maxWeeks: 5, chance: 0.85, hint: 'Philadelphia will send a message', label: 'Defied Philadelphia' },
        ],
      },
    ],
  };
}

export function buildHealthEvent(s: GameState, c: Character): EventInstance {
  const isBoss = c.id === s.playerId;
  const who = isBoss ? 'You have' : `${displayName(c)} has`;
  return {
    iid: iid(s), defId: 'health_warning', week: s.week, mandatory: true, priority: 70,
    title: isBoss ? 'Doctor\'s orders' : `${c.firstName} is ill`,
    text: `${who} taken a bad turn (health ${c.health}). Dr. Feeney at Burdette Tomlin says it could go either way.`,
    defaultChoiceId: 'rest',
    meta: { charId: c.id },
    choices: [
      { id: 'hahnemann', label: 'Send to Hahnemann in Philadelphia', detail: 'The best doctors money can buy.', because: `sent ${c.firstName} to Hahnemann Hospital`, effects: [{ type: 'money', amount: -2500 }, { type: 'health', charId: c.id, amount: 22 }] },
      { id: 'rest', label: 'Rest at home', because: `kept ${c.firstName} home to rest`, effects: [{ type: 'money', amount: -300 }, { type: 'health', charId: c.id, amount: 8 }] },
      { id: 'ignore', label: isBoss ? 'Work through it' : 'He\'ll be fine', because: `ignored ${c.firstName}'s illness`, effects: [{ type: 'respect', amount: isBoss ? 1 : 0 }] },
    ],
  };
}

/**
 * Picks this week's popups. Returns at most MAX_POPUPS events, highest
 * priority first. Queued items that don't fit stay queued (deals expire after 2 weeks).
 */
export function generateWeekEvents(s: GameState): EventInstance[] {
  const out: EventInstance[] = [];
  // Expire stale non-mandatory queue items.
  s.eventQueue = s.eventQueue.filter((e) => e.mandatory || s.week - e.week <= 2);
  if (bagmanDue(s)) {
    out.push(buildBagman(s));
    s.lastBagmanMonth = monthKey(s.date);
  }
  const queue = [...s.eventQueue].sort((a, b) => b.priority - a.priority);
  s.eventQueue = [];
  const sitdown = buildSitDown(s);
  const candidates = [...queue, sitdown];
  // A random situational event, sometimes.
  if (chance(s, 0.4)) {
    const eligible = EVENT_DEFS.filter((d) => d.condition(s) && s.week - (s.cooldowns[d.id] ?? -999) >= d.cooldown);
    const d = weightedPick(s, eligible, (x) => x.weight(s));
    if (d) {
      const ev = d.build(s);
      if (ev) {
        candidates.push(ev);
        s.cooldowns[d.id] = s.week;
      }
    }
  }
  for (const src of EVENT_SOURCES) {
    const ev = src(s);
    if (ev) candidates.push(ev);
  }
  candidates.sort((a, b) => b.priority - a.priority);
  for (const ev of candidates) {
    if (out.length < MAX_POPUPS) out.push(ev);
    else if (ev.defId !== 'sitdown' && ev.mandatory) s.eventQueue.push(ev);
    else if (ev.defId.startsWith('deal_')) s.eventQueue.push(ev);
  }
  s.lastSitDownOrders = out.some((e) => e.defId === 'sitdown') ? String(sitdown.meta!.orders).split(',') : [];
  return out;
}
