import { perkMod } from './lifestyle';
import { ageOn, monthKey, seasonMultiplier } from './calendar';
import { capos, crew, displayName, hasTrait, livingDynasty, makeCharacter, player, relationLabel } from './characters';
import { MAX_PER_KIND } from './actions';
import { smallStart } from './economy';
import { countKind, newBusiness, playerSlots } from './business';
import { CATALOG, SHOP_KINDS } from './catalog';
import { defaulter } from './loans';
import { opinion } from './relations';
import { chance, pick, randInt, shuffle, weightedPick } from './rng';
import { markShown, pickCrewEvents, pruneCooldowns, subjectOk } from './crewEvents';
import { familyEventSource } from './familyDrama';
import { bagmanInPerson, directCandidates, director, freshness, recordShown, recordTribute, themeFull, themeShares } from './storyDirector';
import { FACTION_NAMES } from './world';
import { quietRule, settleQuietly, weekBudget } from './storyPace';
import { guardDefaults } from './handover';
import { dressScenes } from './sceneVariants';
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
  // A lost war with Philadelphia (army.ts): their man sits over you and the envelope is half again as big.
  const overseer = (s.army?.overseerUntil ?? 0) > s.week ? 1.5 : 1;
  return Math.max(600, rnd100(s, tributeOnWeekly(avg) * 4.33 * (1 - perkMod(s, 'tribute') / 100) * overseer));
}

/**
 * Philadelphia's points by brackets of the family's weekly income (MAKE_IT_GREAT #2): the old nine
 * points on a small outfit, more on every dollar past $8,000 a week, and a big piece of a big earner.
 * A bigger empire sends more up the turnpike; money keeps a cost all the way up.
 */
export const TRIBUTE_BRACKETS: readonly [upTo: number, rate: number][] = [[8000, TRIBUTE_RATE], [20000, 0.15], [Infinity, 0.22]];
export function tributeOnWeekly(weekly: number): number {
  let out = 0;
  let from = 0;
  for (const [upTo, rate] of TRIBUTE_BRACKETS) {
    if (weekly <= from) break;
    out += (Math.min(weekly, upTo) - from) * rate;
    from = upTo;
  }
  return out;
}

/**
 * Rise to Power: Philadelphia doesn't send a bagman to a kid nobody has heard
 * of. The envelope starts when they notice him (respect 40) or with his
 * second summer, whichever comes first.
 */
export function unnoticed(s: GameState): boolean {
  return smallStart(s) && s.respect < 40 && s.week < 53;
}

/** A man with a boss above him in the family (a rank start, or a boss who fell) kicks up to that boss; his don pays Philadelphia. */
export function underADon(s: GameState): boolean {
  const p = s.power;
  return !!p && p.station !== 'boss' && p.station !== 'independent' && p.station !== 'exile' && !!p.overId && !!s.characters[p.overId]?.alive;
}

export function bagmanDue(s: GameState): boolean {
  return s.week >= BAGMAN_START_WEEK && s.lastBagmanMonth !== monthKey(s.date) && !s.flags.brokeFromPhilly && !s.wars.some((w) => w.rival === 'philly') && !unnoticed(s) && !underADon(s);
}

/**
 * The bagman's visits: where and how he turns up, by season and by what
 * Philadelphia thinks of the boss. Chosen without the dice (the month and
 * the visit count decide), so the variety costs the simulation nothing.
 */
const BAGMAN_VISITS: { title: string; when: 'summer' | 'winter' | 'any'; text: (sal: string) => string }[] = [
  { title: 'The bagman from Philadelphia', when: 'any', text: (sal) => `${sal} Moretti's bagman is waiting in a Buick outside the Ivanhoe, motor running.` },
  { title: 'A Buick on Pacific Avenue', when: 'summer', text: (sal) => `The bagman parks in the shade by the Starlight and eats a hot dog with the window down while the boardwalk crowd goes by. He says ${sal} sends his best, and that the Shore must be having quite a season.` },
  { title: 'Second pew at St. Ann\'s', when: 'any', text: (sal) => `Sunday, the ten o'clock Mass. ${sal} Moretti's man slides into the pew behind you and hums along with the hymn. During the sign of peace he shakes your hand and keeps his palm open.` },
  { title: 'Coffee at the Doo Wop diner', when: 'winter', text: (sal) => `The island is shut for the winter and the bagman hates the drive. He sits at the counter in his overcoat, stirring a coffee he never drinks. "${sal} says the off-season is no excuse."` },
  { title: 'The man with the racing form', when: 'summer', text: (sal) => `A different bagman this month: a nephew of somebody, with a racing form under his arm and a Philadelphia accent you could cut. He calls ${sal} "Uncle Sal" and asks twice where the good clams are.` },
  { title: 'A funeral home on New Jersey Avenue', when: 'any', text: (sal) => `The bagman likes funeral homes: nobody looks twice at a man in a dark suit. He signs the book for a stranger, then finds you by the coat rack. ${sal} wants to know how business is.` },
  { title: 'The ferry lot at Cape May', when: 'winter', text: (sal) => `This month it is the ferry lot in Cape May, the wind off the bay hard enough to rock the car. ${sal}'s bagman keeps the heater on and the radio louder than it needs to be.` },
  { title: 'Otten\'s Harbor, after dark', when: 'any', text: (sal) => `The bagman waits on the dock at Otten's Harbor among the charter boats, smoking. "${sal} likes the sea air," he says, "but he likes his envelope better."` },
];

function bagmanVisit(s: GameState): (typeof BAGMAN_VISITS)[number] {
  const summer = seasonMultiplier(s.date) > 1;
  const fits = BAGMAN_VISITS.filter((v) => v.when === 'any' || (v.when === 'summer') === summer);
  const n = s.director?.tribute.filter((t) => t[2] === 1).length ?? 0;
  return fits[(n * 5 + s.date.m) % fits.length];
}

export function buildBagman(s: GameState): EventInstance {
  const env = envelopeSize(s);
  const short = rnd100(s, env * 0.6);
  const over = rnd100(s, env * 1.35);
  const moretti = s.characters[s.rivals.find((r) => r.id === 'philly')!.leaderId];
  const mid = moretti.id;
  const v = bagmanVisit(s);
  return {
    iid: iid(s),
    defId: 'bagman',
    title: v.title,
    text: `${v.text(moretti.firstName)} Philadelphia's end comes to $${env.toLocaleString('en-US')}.`,
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
          { type: 'flag', key: 'bag_short', value: 1, label: 'Philadelphia will want to see you next month' },
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
        { who: 'Sgt. Healy of the Wildwood PD', ask: 'wants his gambling marker at the Starlight torn up', cost: 900, key: 'favor_cop' },
      ];
      const v = pick(s, variants);
      const official = Object.values(s.characters).find((c) => c.alive && c.office && v.who.includes(c.lastName));
      return {
        iid: iid(s), defId: 'favor', week: s.week, mandatory: false, priority: 30, actors: official ? [official.id] : undefined,
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
          {
            id: 'check', label: 'Have him looked into first ($600)', detail: 'Two weeks. If he is clean, he is in.', because: `had ${nm} looked into`,
            effects: [
              { type: 'money', amount: -600, label: `Background check: ${r.firstName}` },
              { type: 'recruit', charId: r.id, label: `Background check: ${r.firstName}` },
              { type: 'checkBackground', charId: r.id, label: `Background check: ${r.firstName}` },
            ],
          },
          { id: 'refuse', label: 'Send him home to his mother', because: `turned ${nm} away`, effects: [] },
        ],
      };
    },
  },
  {
    id: 'sunday',
    // A family event: it shares the family's one seat a week, and the dynasty layer has its own Sunday dinners.
    cooldown: 10,
    weight: () => 1.5,
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
        meta: { family: 1 },
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
          { type: 'schedule', key: 'philly_message', minWeeks: 2, maxWeeks: 5, chance: 1, hint: 'Philadelphia will send a message', label: 'Defied Philadelphia' },
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

/** A family (dynasty-layer) event: drama, activities, breaking points, claims. */
export function isFamilyEvent(e: EventInstance): boolean {
  return !!e.meta?.family || e.defId.startsWith('dyn_') || e.defId.startsWith('act_');
}

/** At most this many family events a week (they compete with the crew for the boss's time). */
export const MAX_FAMILY_POPUPS = 1;

/**
 * Picks this week's popups: ONE pipeline for every system. Returns at most
 * MAX_POPUPS events, highest priority first:
 *  - the bagman when due;
 *  - queued events (funerals, ultimatums, rivals' propositions, ceremonies,
 *    crew reports, the dynasty's claims and breaking points);
 *  - decisions brought by the crew themselves (crewEvents.ts);
 *  - sometimes a situational event (EVENT_DEFS);
 *  - the extra sources (the dynasty's family drama, ...).
 * At most MAX_FAMILY_POPUPS family events a week. Per-event and per-character
 * cooldowns (crewEvents.ts `markShown`) are stamped only for what is actually
 * shown, so a decision crowded out this week can still come next week, and a
 * queued crew report about a man who just brought the same thing is dropped.
 * Mandatory events that don't fit stay queued; deals stay queued (they expire
 * after 2 weeks). General orders are not a weekly popup: the boss gives them
 * from the Administration.
 */
export function generateWeekEvents(s: GameState): EventInstance[] {
  const out: EventInstance[] = [];
  pruneCooldowns(s);
  // Expire stale non-mandatory queue items.
  s.eventQueue = s.eventQueue.filter((e) => e.mandatory || s.week - e.week <= 2);
  if (bagmanDue(s)) {
    // The story director: the bagman comes in person about once a season; otherwise the envelope goes through the drop.
    const inPerson = bagmanInPerson(s);
    const bag = buildBagman(s);
    if (inPerson) {
      out.push(bag);
      s.flags.bag_short = 0;
    } else director(s).drop = Number(bag.meta!.envelope);
    recordTribute(s, Number(bag.meta!.envelope), inPerson);
    s.lastBagmanMonth = monthKey(s.date);
  }
  const queue = [...s.eventQueue].sort((a, b) => b.priority - a.priority);
  s.eventQueue = [];
  // Never two of the same queued thing in one week; crew reports respect the per-man cooldown.
  const seen = new Set<string>();
  const candidates: EventInstance[] = [];
  for (const e of queue) {
    const k = `${e.defId}:${e.meta?.charId ?? e.meta?.rival ?? e.meta?.faction ?? e.iid}`;
    if (seen.has(k)) continue;
    if (!e.mandatory && e.meta?.crew && e.meta.charId && !subjectOk(s, e.defId, String(e.meta.charId))) continue;
    seen.add(k);
    candidates.push(e);
  }
  // The family's candidate for the week (its own cooldowns decide whether there is one).
  const extra: EventInstance[] = [];
  for (const src of [familyEventSource, ...EVENT_SOURCES]) {
    const ev = src(s);
    if (ev && !extra.some((x) => x.iid === ev.iid)) extra.push(ev);
  }
  const mandatoryCount = out.length + candidates.filter((e) => e.mandatory).length;
  let room = MAX_POPUPS - mandatoryCount;
  // Leave a seat for a non-mandatory queued deal, and one for the family, if there is one.
  if (candidates.some((e) => !e.mandatory)) room -= 1;
  if (extra.length && !candidates.some(isFamilyEvent)) room -= 1;
  if (room > 0) {
    // The story director's theme mix: when the crew has had more than its share lately, it brings one thing, not two.
    const crewHeavy = themeShares(s).crew > 0.4;
    const want = Math.min(room, s.week <= 1 ? 2 : chance(s, crewHeavy ? 0.15 : 0.32) ? 2 : 1);
    for (const ev of pickCrewEvents(s, want)) candidates.push(ev);
    room -= want;
  }
  // A situational event, sometimes.
  if (room > 0 && chance(s, 0.3)) {
    const eligible = EVENT_DEFS.filter((d) => d.condition(s) && s.week - (s.cooldowns[d.id] ?? -999) >= d.cooldown && freshness(s, d.id) > 0);
    const d = weightedPick(s, eligible, (x) => x.weight(s) * freshness(s, x.id));
    if (d) {
      const ev = d.build(s);
      if (ev) {
        candidates.push(ev);
        s.cooldowns[d.id] = s.week;
      }
    }
  }
  candidates.push(...extra);
  // Silence never gives a man up (handover.ts): a default that would is rewritten to pay, bargain, defy or stall.
  guardDefaults(s, candidates);
  // The story director orders everything (novelty, the theme mix) and holds back templates seen too recently.
  const directed = directCandidates(s, candidates);
  for (const ev of candidates) {
    if (directed.includes(ev)) continue;
    if (ev.mandatory) s.eventQueue.push(ev);
    else {
      // Held back by the director, but routine business still gets done (storyPace.ts).
      const q = quietRule(s, ev);
      if (q) settleQuietly(s, ev, q);
    }
  }
  let family = out.filter(isFamilyEvent).length;
  const actors = new Set<string>();
  // Pacing (storyPace.ts): about two things a week reach the boss's desk; routine business is settled quietly.
  const optional = weekBudget(s) - out.length - directed.filter((e) => e.mandatory).length;
  let optShown = 0;
  for (const ev of directed) {
    const fam = isFamilyEvent(ev);
    const q = quietRule(s, ev);
    if (q) {
      settleQuietly(s, ev, q);
      markShown(s, ev);
      continue;
    }
    // The same man never brings two things in one week (mandatory events always fit).
    const clash = !ev.mandatory && !!ev.meta?.crew && (ev.actors ?? []).some((a) => actors.has(a));
    if (out.length < MAX_POPUPS && (ev.mandatory || !!ev.meta?.asked || optShown < optional) && !(fam && family >= MAX_FAMILY_POPUPS) && !clash && !themeFull(ev, out)) {
      out.push(ev);
      if (!ev.mandatory) optShown++;
      if (fam) family++;
      for (const a of ev.actors ?? []) actors.add(a);
      markShown(s, ev);
    } else if (ev.mandatory || ev.meta?.asked) s.eventQueue.push(ev);
    else if (ev.defId.startsWith('deal_')) s.eventQueue.push(ev);
  }
  // Each recurring popup is told as a scene not shown yet this game (sceneVariants.ts).
  dressScenes(s, out);
  guardDefaults(s, out);
  recordShown(s, out);
  return out;
}
