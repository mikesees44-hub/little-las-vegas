import type { Station } from './powerState';
import type { Character, EventInstance, GameState, PlayerAction } from './types';

/**
 * HONEST RANK (the low starts, LOW START DESIGN stage 1). The engine keeps
 * one invariant: the player's character heads his own house and his own
 * little crew (`rank: 'boss'` of faction 'player'). That is the house. His
 * place in the ORGANIZATION is his station: associate, soldier, capo,
 * underboss or boss of the family above him (the Valente family, valente.ts).
 *
 * This file is the one table that decides, per station, what the player has:
 * which screens, desk items, actions, events and seats, and what he is called.
 * Nothing is deleted: a capability he lacks is gated, with the rung that opens
 * it ("When you're a capo"), so the climb is visible. A boss (and the old
 * fallen-boss stations, exile and independent) has everything, exactly as before.
 *
 * Pure and read-only.
 */

export type Cap =
  | 'crew' | 'envelope' | 'sitdown' | 'makeMen' | 'rackets' | 'buyBusiness' | 'territory' | 'holdCourt' | 'alliance'
  | 'office' | 'standingOrders' | 'familyAdmin' | 'cityHall'
  | 'council' | 'table' | 'war' | 'chair';

export const CAP_INFO: Record<Cap, { name: string; unlock: string }> = {
  crew: { name: 'Your own guys', unlock: 'keep associates of your own and sponsor them for the books' },
  envelope: { name: 'Your crew\'s envelope', unlock: 'collect your crew\'s envelope every Monday and decide your cut' },
  sitdown: { name: 'Your sit-down', unlock: 'hear your soldiers at your own sit-down' },
  makeMen: { name: 'Putting men up', unlock: 'put your own men up for the books' },
  rackets: { name: 'Rackets of your own', unlock: 'start a racket under your own flag' },
  buyBusiness: { name: 'Buying and selling', unlock: 'buy and sell places for your crew' },
  territory: { name: 'Pushing a district', unlock: 'push your crew into a district' },
  holdCourt: { name: 'Holding court', unlock: 'hold court: people bring you their problems' },
  alliance: { name: 'Marriages between houses', unlock: 'arrange marriages with other houses' },
  office: { name: 'The Office', unlock: 'take the Monday count in the office upstairs' },
  standingOrders: { name: 'Standing orders', unlock: 'give standing orders to the whole family' },
  familyAdmin: { name: 'The family\'s business', unlock: 'run the family\'s development, headquarters and big money' },
  cityHall: { name: 'City Hall', unlock: 'deal with City Hall: the seats, the patronage' },
  council: { name: 'The council', unlock: 'fill the seats: underboss, consigliere, bagman; promote capos' },
  table: { name: 'The Table', unlock: 'sit at Philadelphia\'s Table with the other bosses' },
  war: { name: 'War', unlock: 'declare war and raise the family\'s army' },
  chair: { name: 'The chair', unlock: 'name your heir and run the succession' },
};

const ALL_CAPS = Object.keys(CAP_INFO) as Cap[];
const CAPO_CAPS: Cap[] = ['crew', 'envelope', 'sitdown', 'makeMen', 'rackets', 'buyBusiness', 'territory', 'holdCourt', 'alliance'];
const UB_CAPS: Cap[] = [...CAPO_CAPS, 'office', 'standingOrders', 'familyAdmin', 'cityHall'];

/** What each station has. */
export const STATION_CAPS: Record<Station, readonly Cap[]> = {
  associate: [],
  soldier: ['crew'],
  capo: CAPO_CAPS,
  underboss: UB_CAPS,
  boss: ALL_CAPS,
  // The fallen boss's stations keep what they always had (station.ts depose).
  independent: ALL_CAPS,
  exile: ALL_CAPS,
};

/** The organization's ladder, low to high. */
export const RANK_LADDER: Station[] = ['associate', 'soldier', 'capo', 'underboss', 'boss'];

export function stationOf(s: GameState): Station {
  return s.power?.station ?? 'boss';
}

/** A start below the chair in somebody else's family (the low starts, or a climb back from one). */
export function inTheRanks(s: GameState): boolean {
  const st = stationOf(s);
  return st === 'associate' || st === 'soldier' || st === 'capo' || st === 'underboss';
}

export function can(s: GameState, cap: Cap): boolean {
  return STATION_CAPS[stationOf(s)].includes(cap);
}

/** The lowest rung that has a capability. */
export function rungFor(cap: Cap): Station {
  return RANK_LADDER.find((st) => STATION_CAPS[st].includes(cap)) ?? 'boss';
}

const WHEN: Record<Station, string> = {
  associate: 'When you\'re made', soldier: 'When you\'re made', capo: 'When you\'re a capo', underboss: 'When you\'re underboss', boss: 'When you\'re the boss', independent: 'When you\'re the boss', exile: 'When you\'re the boss',
};

/** Why a capability is closed now ("When you're a capo"), or undefined when he has it. */
export function capLock(s: GameState, cap: Cap): string | undefined {
  if (can(s, cap)) return undefined;
  return WHEN[rungFor(cap)];
}

/** What a new station opens, in plain words ("You can now ..."): the capabilities he gains. */
export function unlocksBetween(from: Station, to: Station): string[] {
  const had = new Set(STATION_CAPS[from]);
  return STATION_CAPS[to].filter((c) => !had.has(c)).map((c) => CAP_INFO[c].unlock);
}

/* ------------------------------------------------------------------ */
/* Screens                                                             */
/* ------------------------------------------------------------------ */

/** Registry sections ("panel.section") that need a capability. Missing keys are open to every rank. */
export const SECTION_CAP: Record<string, Cap> = {
  'borgata.council': 'council',
  'borgata.chain': 'council',
  'borgata.rise': 'chair',
  'borgata.progress': 'sitdown',
  'borgata.capos': 'sitdown',
  'borgata.membership': 'makeMen',
  'borgata.orders': 'standingOrders',
  'borgata.grievances': 'sitdown',
  'borgata.earnings': 'envelope',
  'borgata.take': 'envelope',
  'holdings.take': 'envelope',
  'holdings.hub': 'rackets',
  'holdings.tech': 'familyAdmin',
  'holdings.gear': 'familyAdmin',
  'holdings.hq': 'familyAdmin',
  'holdings.designer': 'familyAdmin',
  'holdings.books': 'envelope',
  'diplomacy.table': 'table',
  'diplomacy.pacts': 'table',
  'diplomacy.army': 'war',
  'diplomacy.warroom': 'war',
  'diplomacy.balance': 'war',
  'town.cityhall': 'cityHall',
  'town.patronage': 'cityHall',
  'you.court': 'holdCourt',
  'house.marriages': 'alliance',
  'house.court': 'chair',
  'house.succession': 'chair',
  'house.decisions': 'familyAdmin',
};

/** Why a screen is closed to him at this rank (greyed with the rung), or undefined. */
export function sectionLock(s: GameState, key: string): string | undefined {
  const cap = SECTION_CAP[key];
  return cap ? capLock(s, cap) : undefined;
}

/** Every screen key his rank keeps from him (for tests and the shell). */
export function lockedSections(s: GameState, keys: readonly string[]): string[] {
  return keys.filter((k) => !!sectionLock(s, k));
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

/** The capability an order needs (undefined: any rank may give it). */
export function actionCap(a: PlayerAction): Cap | undefined {
  switch (a.kind) {
    case 'appoint': case 'councilTask': return 'council';
    case 'declareWar': case 'raid': case 'terms': case 'army': return 'war';
    case 'raiseDispute': case 'lobby': case 'askPermission': return 'table';
    case 'pushDistrict': return 'territory';
    case 'buyBusiness': case 'sellBusiness': return 'buyBusiness';
    case 'edict': return 'standingOrders';
    case 'propose': return 'makeMen';
    case 'officeHours': return 'holdCourt';
    case 'pol': return 'cityHall';
    case 'casino': case 'charterBank': case 'findFrontMan': return 'familyAdmin';
    case 'capo': return 'sitdown';
    case 'reassign': return 'sitdown';
    case 'tribute': {
      const op = (a.op as { op: string }).op;
      return op === 'move' ? undefined : 'envelope';
    }
    case 'interact': return a.id === 'make' ? 'makeMen' : a.id === 'promote' || a.id === 'demote' ? 'council' : undefined;
    case 'order': return ({ expand: 'territory', hitback: 'war', kessler: 'territory', cops: 'cityHall', gift: 'table', recruit: 'crew', business: 'buyBusiness', laylow: 'standingOrders', parish: undefined } as Record<string, Cap | undefined>)[a.key];
    case 'power': {
      const op = (a.op as { op: string }).op;
      if (op === 'climb' || op === 'takeover' || op === 'low') return undefined;
      if (op === 'audience') return 'holdCourt';
      if (op === 'blitz' || op === 'prep' || op === 'mattresses') return 'war';
      if (op === 'designate' || op === 'groom' || op === 'stopGrooming' || op === 'promise' || op === 'announce' || op === 'front' || op === 'endFront' || op === 'consult' || op === 'place' || op === 'unplace') return 'chair';
      return undefined;
    }
    default: return undefined;
  }
}

/** Why his rank keeps this order from him ("When you're a capo: ..."), or undefined. */
export function rankBlock(s: GameState, a: PlayerAction): string | undefined {
  const cap = actionCap(a);
  if (!cap) return undefined;
  const lock = capLock(s, cap);
  return lock ? `${lock}: ${CAP_INFO[cap].name.toLowerCase()} is above your rank` : undefined;
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/**
 * The procedural decks that are a boss's business (what they need). A low
 * rank never draws them; they come back as he climbs. Low-rank events and the
 * house's own life (wife, children, kin, romance) are for every rank.
 */
const EVENT_CAP: [RegExp, Cap][] = [
  [/^tribute_audience$/, 'envelope'],
  [/^bagman$|^deal_|^rx_philly|^deed_alliance$|^pitch_jukebox$|^intrigue_(venture|denial|accuse|truce|summit|offer)|^rx_rival|^let_dinner$|^table_|^dispute_|^war_|^army_|^blitz/, 'table'],
  [/^office_|^petition|^power_petition|^audience/, 'holdCourt'],
  [/^dyn_proposal$|^dyn_match/, 'alliance'],
  [/^capo_|^rx_capo|^crew_cut$|^checkin|^ub_|^underboss_/, 'sitdown'],
  [/^arc_shore_election|^pol_|^cityhall|^let_new_cop$|^let_union$|^let_vacationer$|^let_reelect$|^pitch_inspector$/, 'cityHall'],
  [/^recruit$|^applicant/, 'crew'],
  [/^bones_offer$|^making$|^let_associate$/, 'makeMen'],
  [/^heir_|^succession|^power_designate|^power_challenge|^grievance_/, 'chair'],
  [/^rk_|^racket_/, 'rackets'],
];

/** The capability an event needs (undefined: any rank). */
export function eventCap(ev: Pick<EventInstance, 'defId' | 'meta'>): Cap | undefined {
  for (const [re, cap] of EVENT_CAP) if (re.test(ev.defId)) return cap;
  // The story packs say their shelf (storyPack.ts meta.cat).
  const cat = String(ev.meta?.cat ?? '');
  if (cat === 'rivals' || cat === 'table') return 'table';
  if (cat === 'politics') return 'cityHall';
  if (cat === 'crew') return 'sitdown';
  return undefined;
}

/** May this event reach him at his rank? (Events about his own climb are tagged `meta.low` and always may.) */
export function eventAllowed(s: GameState, ev: EventInstance): boolean {
  if (ev.meta?.low) return true;
  const cap = eventCap(ev);
  return !cap || can(s, cap);
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

const STATION_WORD: Record<Station, string> = {
  boss: 'boss', underboss: 'underboss', capo: 'capo', soldier: 'soldier', associate: 'associate', exile: 'boss in exile', independent: 'boss of an independent crew',
};

/** "an associate", "a soldier", "a capo" (grammar). */
export function aStation(st: Station): string {
  const w = STATION_WORD[st];
  return `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}`;
}

/** The rank word shown next to a man's name: the player shows his station, everybody else his rank. */
export function rankWordOf(s: GameState, c: Character): string {
  if (c.id === s.playerId) {
    const st = stationOf(s);
    return st === 'exile' || st === 'independent' ? 'boss' : STATION_WORD[st];
  }
  return c.rank;
}

/** The badge on the org chart's top card ("BOSS" only for a boss). */
export function badgeOf(s: GameState): string {
  return STATION_WORD[stationOf(s)].toUpperCase();
}

/**
 * How the people around him address him to his face: "boss" only in the chair.
 * A capo's men say "Skip"; a soldier is called by his first name; an associate is "kid".
 */
export function addressOf(s: GameState): string {
  const st = stationOf(s);
  if (st === 'associate') return 'kid';
  if (st === 'soldier') return s.characters[s.playerId]?.firstName ?? 'pal';
  if (st === 'capo') return 'Skip';
  return 'boss';
}

/** "Boss, ..." -> the right word for his rank, at the start of a quoted line or after a comma. */
export function honestAddress(s: GameState, text: string): string {
  if (!inTheRanks(s)) return text;
  const a = addressOf(s);
  const A = a.charAt(0).toUpperCase() + a.slice(1);
  return text.replace(/(["“'])Boss,/g, `$1${A},`).replace(/, boss([.,!?"”])/g, `, ${a}$1`).replace(/'Yes, boss\.'/g, `'Yes, ${a}.'`).replace(/"Yes, boss\."/g, `"Yes, ${a}."`);
}
