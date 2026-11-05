import { previewAction, resolveActions } from './actions';
import { ageOn } from './calendar';
import { capos, crew, displayName, hasTrait, isFree, player } from './characters';
import { chooseHeir } from './dynasty';
import { madamOf } from './ears';
import { applyEffects } from './effects';
import { fam } from './familyState';
import { regime } from './hierarchy';
import type { Ctx } from './ledger';
import { opinion } from './relations';
import { activeRomances, partnerOf } from './romance';
import { personalRounds, roll } from './roundsPersonal';
import { payFromPersonal } from './tribute';
import { pocketCash } from './tributeState';
import { adultOn, datingEvenings } from './datingState';
import { reservedEvenings } from './apptsState';
import { suggestGuests } from './activities';
import type { Character, Effect, GameState, PlayerAction, PlayerChoices, RivalId } from './types';

/**
 * Your Rounds: the boss's own week. He has a few evenings (slots) — more
 * when he is young and healthy, fewer when he is old, sick, on trial or in
 * hiding — and spends them in three lanes: his people (relationships), his
 * own fun, and his family. The fourth lane, delegation, is the Sit-Down's
 * trust toggles: trusted advisors handle their own small business, which
 * frees an evening, but a man with a free hand long enough builds his own
 * following.
 *
 * Every round is either a real order (`PlayerAction`, e.g. dinner with a
 * capo, Sunday dinner) or named effects through the one ledger (money,
 * heat, opinion, stress), so nothing here is a parallel mechanic. A lane
 * left empty for weeks has gentle, named consequences ("You haven't been
 * home for dinner in three weeks").
 *
 * The layer is opt-in per save: it starts the first week the player (or the
 * sim) sends `choices.rounds`; after that a week with no rounds sent lives
 * the usual week.
 */

export type Lane = 'people' | 'fun' | 'family' | 'self';
/** The lanes that notice neglect (Your affairs — lawyer, doctor — never nag). */
export const LANES: Lane[] = ['people', 'fun', 'family'];
/** Every lane, in the planner's order. */
export const ALL_LANES: Lane[] = ['people', 'fun', 'family', 'self'];
export const LANE_NAME: Record<Lane, string> = { people: 'Your people', fun: 'Your own time', family: 'Your family', self: 'Your affairs' };

export interface Round {
  id: string;
  lane: Lane;
  label: string;
  /** One line: what the evening is. */
  text: string;
  who?: string;
  slots: number;
  /** A real order, resolved like any other (re-checked when the week runs). */
  action?: PlayerAction;
  /** Named effects applied with it (ledger, opinion, stress). */
  effects: Effect[];
  /** What can go wrong, and how likely (`pocket`: what it costs from your Pocket). */
  risk?: { chance: number; text: string; effects: Effect[]; pocket?: number };
  /** Someone else's choice: she (or he) may say no. Then only these effects. */
  decline?: { chance: number; text: string; effects: Effect[] };
  /** The report scene shows the lawyer's or the doctor's reading. */
  reading?: 'lawyer' | 'doctor';
  /** "Your wife wants you home Sunday." */
  suggestedBy?: string;
  /** The evening only happens on this day (0 Monday … 6 Sunday): Friday fights, Sunday dinner. */
  day?: number;
  /** Short noir lines for the report (one is picked). */
  result: string[];
  /** Paid from your Pocket (the Family covers what the Pocket can't); an order's own cost when `action` is set. */
  cost: number;
  /** Paid from the Pocket only: the Family never tops it up without the player's approval (a paid evening's company). */
  pocketOnly?: boolean;
  /** Adult content: offered only while the mature-content setting is not Off (re-checked when the evening comes). */
  adult?: boolean;
}

export interface RoundsState {
  /** Lane -> last week a round in it was lived. */
  last: Partial<Record<Lane, number>>;
  /** Speaker key -> weeks he has had a free hand. */
  leeway: Record<string, number>;
  /** Week -> what the boss did (the last few weeks). */
  history: { week: number; ids: string[] }[];
}

export function ensureRounds(s: GameState): RoundsState {
  if (!s.rounds) s.rounds = { last: { people: s.week, fun: s.week, family: s.week }, leeway: {}, history: [] };
  return s.rounds;
}

/* ------------------------------------------------------------------ */
/* Evenings                                                            */
/* ------------------------------------------------------------------ */

export function roundSlots(s: GameState): { slots: number; why: { label: string; value: number }[] } {
  const boss = player(s);
  const why: { label: string; value: number }[] = [{ label: 'A week has five good evenings', value: 5 }];
  const age = ageOn(boss.birth, s.date);
  if (age < 40) why.push({ label: 'Young', value: 1 });
  if (age >= 70) why.push({ label: 'Old', value: -2 });
  else if (age >= 60) why.push({ label: 'Not young', value: -1 });
  if (boss.health < 50) why.push({ label: 'Poor health', value: -1 });
  if (s.dyn && fam(s, boss.id).stress >= 75) why.push({ label: 'Worn out', value: -1 });
  const lg = s.legal && s.legal.personId === boss.id ? s.legal.stage : undefined;
  if (lg === 'indicted' || lg === 'trial' || lg === 'grandjury') why.push({ label: 'The case eats your days', value: -1 });
  const trusted = Object.values(s.briefing?.trust ?? {}).filter(Boolean).length;
  if (trusted >= 2) why.push({ label: 'Your people carry the small stuff', value: 1 });
  let slots = why.reduce((a, w) => a + w.value, 0);
  const dates = datingEvenings(s);
  if (dates) { why.push({ label: `Dates and company this week`, value: -dates }); slots -= dates; }
  // Standing appointments (apptsState.ts) hold their evenings first.
  const held = reservedEvenings(s);
  if (held) { why.push({ label: 'Standing appointments', value: -held }); slots -= held; }
  if (boss.imprisonedUntil !== undefined && boss.imprisonedUntil > s.week) { slots = 1; why.push({ label: 'In prison: visiting day only', value: 0 }); }
  if (s.travel?.fugitives.some((f) => !f.end && f.personId === boss.id)) { slots = Math.min(slots, 2); why.push({ label: 'In hiding', value: 0 }); }
  return { slots: Math.max(1, Math.min(6, slots)), why };
}

/* ------------------------------------------------------------------ */
/* What the boss could do this week                                    */
/* ------------------------------------------------------------------ */

const stress = (s: GameState, amount: number, label: string): Effect[] => (s.dyn ? [{ type: 'dyn', op: { op: 'stress', charId: s.playerId, amount, source: 'domestic' }, label } as Effect] : []);
const op = (from: string, to: string, amount: number, reason: string, decay?: number): Effect => ({ type: 'opinion', from, to, amount, reason, label: reason, ...(decay !== undefined ? { decay } : {}) });

function usable(s: GameState, a: PlayerAction): PlayerAction | undefined {
  const p = previewAction(s, a);
  return p.disabledReason || p.cost > s.money ? undefined : a;
}

function children(s: GameState): Character[] {
  const boss = player(s);
  return Object.values(s.characters).filter((c) => c.alive && (c.fatherId === boss.id || c.motherId === boss.id) && ageOn(c.birth, s.date) >= 5 && ageOn(c.birth, s.date) < 16);
}

export function roundOptions(s: GameState): Round[] {
  const out: Round[] = [];
  if (s.gameOver) return out;
  const boss = player(s);
  const B = boss.id;
  const free = boss.imprisonedUntil === undefined || boss.imprisonedUntil <= s.week;
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;

  // ---- Your people ----
  if (free) {
    const sore = capos(s).filter((k) => isFree(s, k)).sort((a, b) => opinion(s, a.id, B) - opinion(s, b.id, B))[0];
    if (sore) {
      const a = usable(s, { kind: 'interact', id: 'dinner', target: sore.id });
      out.push({ id: `ppl:dinner:${sore.id}`, lane: 'people', label: `Dinner with ${sore.firstName}`, who: sore.id, text: `${displayName(sore)} thinks ${opinion(s, sore.id, B)} of you. Veal at the Club Avalon, and you pick up the check.`, slots: 1, action: a, effects: a ? [] : [op(sore.id, B, 6, 'The boss took me to dinner')], result: [`Dinner with ${sore.firstName} ran late. He talked; you listened.`, `${sore.firstName} ordered the veal and the good wine. He left lighter about something.`], cost: a ? previewAction(s, a).cost : 120, suggestedBy: opinion(s, sore.id, B) < 0 ? holderName(s, 'underboss') ? `${holderName(s, 'underboss')} says ${sore.firstName} needs to see your face` : undefined : undefined });
    }
    const official = Object.values(s.characters).filter((c) => c.alive && c.office && c.faction !== 'player').sort((a, b) => opinion(s, b.id, B) - opinion(s, a.id, B))[0];
    if (official) out.push({ id: `ppl:coffee:${official.id}`, lane: 'people', label: `Coffee with ${official.lastName}`, who: official.id, text: `${displayName(official)} takes his coffee at the Doo Wop diner at seven. So do you, this week.`, slots: 1, effects: [op(official.id, B, 5, 'Coffee with the boss')], result: [`Coffee with ${official.lastName}. Nothing was said that a reporter could use.`, `${official.lastName} let you pay for the eggs. That means something.`], cost: 40 });
    const madam = madamOf(s);
    if (madam?.alive) out.push({ id: `ppl:madam`, lane: 'people', label: `Call on ${madam.firstName}`, who: madam.id, text: 'Tea in the back parlor; she hears everything on the island and tells you some of it.', slots: 1, effects: [op(madam.id, B, 6, 'The boss paid a call')], result: [`${madam.firstName} poured the tea and told you who was spending what.`, `An hour with ${madam.firstName}. You came out knowing more than you went in.`], cost: 150 });
    out.push({ id: 'ppl:philly', lane: 'people', label: 'Lunch with the Philly bagman', text: 'Moretti\'s man comes down the shore. A good lunch keeps South Philly sweet.', slots: 1, effects: [{ type: 'rivalOpinion', rival: 'philly', amount: 3, reason: 'Lunch with the boss', label: 'Lunch with Philadelphia' }, { type: 'heat', bar: 'family', amount: -2, label: 'Lunch with Philadelphia' }], result: ['Moretti\'s man ate like he hadn\'t in a week and went home happy.', 'Lunch at Zaberer\'s with Philadelphia. The check was yours; so was the goodwill.'], cost: 200, suggestedBy: s.heat.family >= 40 ? 'Your consigliere: "Philadelphia likes to see your face."' : undefined });
    out.push({ id: 'ppl:priest', lane: 'people', label: 'See the parish priest', text: 'Father at St. Ann\'s knows every widow and every grudge in Wildwood.', slots: 1, effects: [{ type: 'respect', amount: 1, label: 'Seen at St. Ann\'s' }, ...stress(s, -3, 'A quiet hour at St. Ann\'s')], result: ['The priest took the envelope and gave you a blessing you didn\'t ask for.', 'An hour at St. Ann\'s. The town saw you there.'], cost: 100 });
    const rival = s.rivals.find((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive && !s.wars.some((w) => w.rival === r.id));
    if (rival) out.push({ id: `ppl:rival:${rival.id}`, lane: 'people', label: `Sit down with ${rival.shortName}`, who: rival.leaderId, text: `Neutral ground, two cups of espresso, nobody's hands under the table. ${rival.name}.`, slots: 1, effects: [{ type: 'rivalOpinion', rival: rival.id as RivalId, amount: 4, reason: 'A sit-down with the boss', label: `Sit-down with ${rival.shortName}` }], risk: { chance: 0.15, text: 'Your crew may think you\'re going soft', effects: [{ type: 'crewOpinion', amount: -1, reason: 'Sitting down with the other side', label: 'Sitting down with the other side' }] }, result: [`${rival.shortName} and you agreed on nothing and shook hands anyway.`, `The sit-down with ${rival.shortName} was polite. Polite is something.`], cost: 0 });
    const death = s.chronicle.slice(-40).reverse().find((e) => e.kind === 'death' && e.week >= s.week - 2);
    if (death) out.push({ id: 'ppl:wake', lane: 'people', label: 'Pay respects at the wake', text: 'Gaskill\'s funeral home. Everybody goes to be seen.', slots: 1, effects: [{ type: 'crewOpinion', amount: 2, reason: 'The boss came to the wake', label: 'The boss came to the wake' }], result: ['You knelt at the casket and the whole room watched you do it.', 'Two nights of the rosary. You stayed for both.'], cost: 100 });
  }

  // ---- Your own time ----
  if (free) {
    out.push({ id: 'fun:track', lane: 'fun', label: 'A day at the track', text: 'Atlantic City Race Course, the clubhouse, a tip from a jockey\'s cousin.', slots: 1, effects: [...stress(s, -9, 'A day at the track')], risk: { chance: hasTrait(boss, 'Gambler') ? 0.3 : 0.12, text: 'A bad day at the windows', effects: [], pocket: 600 }, result: ['The six horse ran like he had somewhere to be. You didn\'t care.', 'A day at the track. You lost a little and forgot a lot.'], cost: hasTrait(boss, 'Gambler') ? 500 : 250 });
    out.push({ id: 'fun:fights', lane: 'fun', day: 4, label: 'Ringside at the fights', text: 'Friday night at the Convention Hall: a middleweight from Camden, cigar smoke, and every bookie in the county.', slots: 1, effects: [...stress(s, -8, 'A night at the fights'), { type: 'respect', amount: 1, label: 'Ringside at the Convention Hall' }], result: ['The Camden kid went down in the sixth. The whole row looked at you to see if you knew.', 'Ringside. You shook more hands than the fighters did.'], cost: 200 });
    out.push({ id: 'fun:golf', lane: 'fun', label: 'Golf at Cape May', text: 'Eighteen holes, a caddy who doesn\'t listen, a councilman who does.', slots: 1, effects: [...stress(s, -7, 'Golf')], result: ['You sliced into the marsh twice and enjoyed every minute.', 'Eighteen holes and nobody said the word "envelope".'], cost: 150 });
    out.push({ id: 'fun:cards', lane: 'fun', label: 'Cards with the boys', text: 'Pinochle in the back of the bakery, the old way.', slots: 1, effects: [...stress(s, -6, 'Cards with the boys'), { type: 'crewOpinion', amount: 1, reason: 'Cards with the boss', label: 'Cards with the boss' }], result: ['You let Sonny win a hand. He knew. Everybody laughed.', 'Pinochle until two. The bakery smelled like tomorrow\'s bread.'], cost: 100 });
    out.push({ id: 'fun:club', lane: 'fun', label: 'A night at the club', text: 'The 500 Club, a ringside table, the headliner sends over a bottle.', slots: 1, effects: [...stress(s, -11, 'A night at the club'), { type: 'respect', amount: 1, label: 'Seen at the 500 Club' }, { type: 'heat', bar: 'local', amount: 1, label: 'Seen at the 500 Club' }], risk: wife ? { chance: hasTrait(boss, 'Womanizer') ? 0.35 : 0.12, text: 'Gossip gets home before you do', effects: [op(wife.id, B, -4, 'Heard where you were')] } : undefined, result: ['The headliner sang one for you. The whole room turned to look.', 'A night at the 500 Club. You got home when the milk truck did.'], cost: 400 });
    if (s.money >= 25000) out.push({ id: 'fun:boat', lane: 'fun', label: 'Take the boat out', text: 'Past the shoals at dawn. No phones, no waiters, nobody listening.', slots: 1, effects: [...stress(s, -13, 'A morning on the water')], result: ['Bluefish off the Cape May rips. The sea didn\'t ask you for anything.', 'Out past the jetty before dawn. You came back sunburnt and quiet.'], cost: 250 });
    for (const r of activeRomances(s, B).filter((x) => x.secret).slice(0, 1)) {
      const p = s.characters[partnerOf(r, B)];
      if (!p?.alive || p.id === wife?.id) continue;
      out.push({ id: `fun:lover:${p.id}`, lane: 'fun', label: `An evening with ${p.firstName}`, who: p.id, text: 'A room above a closed shop, the radio low. Nobody is supposed to know.', slots: 1, effects: [op(p.id, B, 6, 'An evening together'), ...stress(s, -10, 'An evening away')], risk: wife ? { chance: 0.25, text: 'Somebody saw your car', effects: [op(wife.id, B, -5, 'Where were you?')] } : undefined, result: [`${p.firstName} laughed at something you said. You forgot what it was by morning.`, 'An evening nobody will write down.'], cost: 150 });
    }
  }

  // ---- Your family ----
  if (s.dyn && free) {
    const sunday = usable(s, { kind: 'dynasty', op: { type: 'host', activity: 'sunday', guests: suggestGuests(s, 'sunday') } } as PlayerAction);
    const last = s.rounds?.last.family;
    out.push({ id: 'fam:sunday', lane: 'family', day: 6, label: 'Sunday dinner', text: 'Gravy at two, nobody leaves before the cannoli.', slots: 1, action: sunday, effects: sunday ? [] : [{ type: 'familyOpinion', amount: 3, reason: 'Sunday dinner with the family', label: 'Sunday dinner' }, ...stress(s, -5, 'Sunday dinner')], result: ['Gravy at two, cannoli at five. Nobody talked business. Almost nobody.', 'The whole family at one table. Your mother said grace twice.'], cost: sunday ? previewAction(s, sunday).cost : 60, suggestedBy: wife && last !== undefined && s.week - last >= 2 ? `${wife.firstName} wants you home Sunday` : undefined });
  }
  if (wife?.alive && free) out.push({ id: 'fam:wife', lane: 'family', label: `An evening with ${wife.firstName}`, who: wife.id, text: 'Dinner out, just the two of you, and you leave the phone number with nobody.', slots: 1, effects: [op(wife.id, B, 8, 'An evening together'), ...stress(s, -4, 'An evening at home')], result: [`Dinner with ${wife.firstName} at the Hotel Dorset. She wore the blue dress.`, `${wife.firstName} talked about the kids, and you let her.`], cost: 80 });
  const kid = children(s).sort((a, b) => opinion(s, a.id, B) - opinion(s, b.id, B))[0];
  if (kid && free) {
    const age = ageOn(kid.birth, s.date);
    const what = age <= 8 ? 'first communion practice' : age <= 12 ? 'the school play' : 'the ballgame';
    out.push({ id: `fam:kid:${kid.id}`, lane: 'family', label: `${kid.firstName}'s ${what.replace(/^the /, '')}`, who: kid.id, text: `${kid.firstName} looked for you last time and you weren't there.`, slots: 1, effects: [op(kid.id, B, 10, 'Dad came'), { type: 'familyOpinion', amount: 1, reason: 'The boss came to ' + what, label: 'Family' }, ...stress(s, -4, 'A family evening')], result: [`You sat in the third row at ${what}. ${kid.firstName} waved.`, `${kid.firstName} saw you in the crowd and stood up straighter.`], cost: 0 });
  }
  const heir = chooseHeir(s, boss).heir;
  if (heir && heir.id !== wife?.id && ageOn(heir.birth, s.date) >= 14 && free) out.push({ id: `fam:heir:${heir.id}`, lane: 'family', label: `Teach ${heir.firstName} the business`, who: heir.id, text: 'A ride along on collection day. Watch, don\'t talk.', slots: 1, effects: [op(heir.id, B, 5, 'Time with the boss'), ...(s.dyn ? [{ type: 'dyn', op: { op: 'attr', charId: heir.id, attr: 'leadership', amount: 1 }, label: 'Learning the business' } as Effect] : [])], result: [`${heir.firstName} rode along all day and asked the right question once.`, `You showed ${heir.firstName} how to count an envelope without looking like you're counting.`], cost: 0 });
  const squabble = Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== B && opinion(s, c.id, B) <= -15)[0];
  for (const p of personalRounds(s, wife)) out.push(p);
  if (squabble && free) out.push({ id: `fam:squabble:${squabble.id}`, lane: 'family', label: `Settle it with ${squabble.firstName}`, who: squabble.id, text: `${displayName(squabble)} hasn't spoken to you since the christening.`, slots: 1, effects: [op(squabble.id, B, 8, 'We talked it out'), { type: 'familyOpinion', amount: 1, reason: 'Peace in the family', label: 'Peace in the family' }], result: [`You and ${squabble.firstName} said it all, loud, in the kitchen. Then coffee.`, `${squabble.firstName} cried. You didn't. It's settled, mostly.`], cost: 0 });
  return out;
}

function holderName(s: GameState, seat: 'underboss'): string | undefined {
  const id = s.council[seat]?.holderId;
  const c = id ? s.characters[id] : undefined;
  return c?.alive ? (c.nickname ?? c.firstName) : undefined;
}

/* ------------------------------------------------------------------ */
/* Neglect                                                             */
/* ------------------------------------------------------------------ */

export interface Neglect {
  lane: Lane;
  weeks: number;
  /** 0 fine · 1 noticed · 2 hurting. */
  level: number;
  line: string;
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const n2w = (n: number) => NUM[n] ?? String(n);

export function neglect(s: GameState): Neglect[] {
  const r = s.rounds;
  if (!r) return [];
  return LANES.map((lane) => {
    const weeks = Math.max(0, s.week - (r.last[lane] ?? s.week));
    const level = weeks >= 6 ? 2 : weeks >= 3 ? 1 : 0;
    const w = n2w(weeks);
    const line = lane === 'family'
      ? (weeks >= 3 ? `You haven't been home for dinner in ${w} weeks.` : 'The family sees you.')
      : lane === 'fun'
        ? (weeks >= 3 ? `${w[0].toUpperCase()}${w.slice(1)} weeks without a night off. It shows.` : 'You get your evenings.')
        : (weeks >= 3 ? `Your people haven't seen your face in ${w} weeks.` : 'Your people see you around.');
    return { lane, weeks, level, line };
  });
}

/* ------------------------------------------------------------------ */
/* The usual week                                                      */
/* ------------------------------------------------------------------ */

/** A sensible week: something for each lane (the neediest first), suggested rounds before the rest, within the evenings and the money. */
export function usualWeek(s: GameState): string[] {
  const opts = roundOptions(s);
  const { slots } = roundSlots(s);
  const ng = neglect(s);
  const lanes = [...LANES].sort((a, b) => (ng.find((x) => x.lane === b)?.weeks ?? 0) - (ng.find((x) => x.lane === a)?.weeks ?? 0) || LANES.indexOf(a) - LANES.indexOf(b));
  // Stress first: a worn-out boss takes his night off before anything else.
  if (s.dyn && fam(s, s.playerId).stress >= 40) lanes.sort((a, b) => (a === 'fun' ? -1 : b === 'fun' ? 1 : 0));
  const out: string[] = [];
  let money = s.money + pocketCash(s) - 3000;
  const take = (r: Round | undefined) => {
    if (!r || out.includes(r.id) || out.length >= slots || r.cost > money) return;
    out.push(r.id);
    money -= r.cost;
  };
  const recent = new Set((s.rounds?.history ?? []).slice(-2).flatMap((h) => h.ids));
  const rank = (r: Round) => (r.suggestedBy ? 0 : 1) + r.cost / 1000 + (recent.has(r.id) ? 0.8 : 0) + hashish(`${s.week}|${r.id}`) * 0.3;
  for (const lane of lanes) take(opts.filter((r) => r.lane === lane && !r.risk).sort((a, b) => rank(a) - rank(b))[0] ?? opts.filter((r) => r.lane === lane).sort((a, b) => rank(a) - rank(b))[0]);
  // The rest: the suggestions, then the free family evenings.
  for (const r of opts.filter((x) => x.suggestedBy)) take(r);
  for (const r of opts.filter((x) => x.lane === 'family' && x.cost === 0)) take(r);
  return out.slice(0, Math.max(1, slots - 1));
}

/* ------------------------------------------------------------------ */
/* The week (engine)                                                   */
/* ------------------------------------------------------------------ */

const hashish = roll;

function pickLine(s: GameState, r: Round): string {
  return r.result[Math.floor(hashish(`${s.seed}|${s.week}|${r.id}`) * r.result.length) % r.result.length];
}

export interface RoundOutcome {
  /** The report line (what the day's scene and the weekly report both say). */
  line: string;
  /** She (or he) said no: only the decline's effects. */
  declined: boolean;
  /** The risk came true. */
  risked: boolean;
}

/**
 * How an evening turns out. Deterministic from the seed, the week and the
 * round (never the game's RNG), so the scene the running clock shows on the
 * day and the week's resolution in `advanceWeek` always agree.
 */
export function roundOutcome(s: GameState, r: Round): RoundOutcome {
  const declined = !!r.decline && hashish(`${s.seed}|${s.week}|decline|${r.id}`) < r.decline.chance;
  if (declined) return { line: r.decline!.text, declined: true, risked: false };
  const risked = !!r.risk && hashish(`${s.seed}|${s.week}|risk|${r.id}`) < r.risk.chance;
  return { line: pickLine(s, r) + (risked ? ` ${r.risk!.text}.` : ''), declined: false, risked };
}

/** What the boss can spend on an evening: his Pocket first, the Family's money after. */
export function roundCash(s: GameState): number {
  return Math.max(0, s.money) + pocketCash(s);
}

/** Which rounds the boss lives this week (undefined while the layer is off). */
export function chosenRounds(s: GameState, choices: PlayerChoices): string[] | undefined {
  if (choices.rounds) return choices.rounds;
  return s.rounds ? usualWeek(s) : undefined;
}

/**
 * Resolve the boss's rounds (called by `advanceWeek` after the orders), then
 * the lanes' neglect and the advisors' free hand. Returns the report lines.
 */
export function roundsWeek(ctx: Ctx, picked: string[] | undefined, opts: Round[]): string[] {
  const s = ctx.s;
  if (picked === undefined || s.gameOver) return [];
  const R = ensureRounds(s);
  const lines: string[] = [];
  const { slots } = roundSlots(s);
  const done: Round[] = [];
  for (const id of picked) {
    const r = opts.find((x) => x.id === id);
    if (!r || done.reduce((a, x) => a + x.slots, 0) + r.slots > slots || s.gameOver) continue;
    if (r.who && !s.characters[r.who]?.alive) continue;
    if (r.adult && !adultOn(s)) continue;
    if (r.pocketOnly && r.cost > pocketCash(s)) { lines.push(`${r.label}: not this week — your pocket is short, and an evening like this never comes out of Family money.`); continue; }
    if (r.cost > (r.action ? s.money : roundCash(s))) { lines.push(`${r.label}: not this week — the money isn't there.`); continue; }
    done.push(r);
    const out = roundOutcome(s, r);
    const because = r.label.charAt(0).toLowerCase() + r.label.slice(1);
    if (r.action) resolveActions(ctx, [r.action]);
    else if (r.cost > 0) payFromPersonal(ctx, out.declined ? Math.round(r.cost / 3) : r.cost, r.label, `round:${r.id}`);
    const fx = out.declined ? r.decline!.effects : r.effects;
    if (fx.length) applyEffects(ctx, fx, { label: r.label, because, category: 'event' });
    if (out.risked && r.risk) {
      if (r.risk.effects.length) applyEffects(ctx, r.risk.effects, { label: `${r.label}: ${r.risk.text}`, because: r.risk.text, category: 'event' });
      if (r.risk.pocket) payFromPersonal(ctx, r.risk.pocket, `${r.label}: ${r.risk.text}`, `round:${r.id}:risk`);
    }
    lines.push(out.line);
    R.last[r.lane] = s.week;
  }
  R.history.push({ week: s.week, ids: done.map((r) => r.id) });
  if (R.history.length > 12) R.history = R.history.slice(-12);
  // Neglect, gently.
  const boss = player(s);
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  for (const ng of neglect(s)) {
    if (ng.weeks < 3) continue;
    if (ng.lane === 'family') {
      if (wife?.alive) applyEffects(ctx, [op(wife.id, boss.id, -2, 'Never home for dinner', 1)], { label: 'Never home', because: 'were never home', category: 'event' });
      const heir = chooseHeir(s, boss).heir;
      if (heir && heir.id !== wife?.id && ng.weeks >= 6) applyEffects(ctx, [op(heir.id, boss.id, -1, 'He never has time for me', 1)], { label: 'Never home', because: 'were never home', category: 'event' });
    } else if (ng.lane === 'fun') {
      if (s.dyn) applyEffects(ctx, stress(s, ng.weeks >= 6 ? 3 : 2, 'No night off in weeks'), { label: 'No night off', because: 'never took a night off', category: 'event' });
    } else if (ng.weeks % 2 === 0) {
      applyEffects(ctx, [{ type: 'crewOpinion', amount: -1, reason: 'The boss doesn\'t come around anymore', label: 'The boss doesn\'t come around' }], { label: 'Never around', because: 'stopped coming around', category: 'event' });
    }
    if (ng.weeks === 3 || ng.weeks === 6) lines.push(ng.line);
  }
  // A free hand: the trusted advisors' following grows.
  const trust = s.briefing?.trust ?? {};
  for (const key of Object.keys(R.leeway)) if (!trust[key]) delete R.leeway[key];
  for (const key of Object.keys(trust).filter((k) => trust[k])) {
    R.leeway[key] = (R.leeway[key] ?? 0) + 1;
    const w = R.leeway[key];
    const c = advisorOf(s, key);
    if (!c || w < 8 || w % 4 !== 0) continue;
    const men = (key.startsWith('capo:') ? regime(s, c.id) : crew(s).filter((m) => m.rank !== 'capo')).filter((m) => m.alive && m.id !== c.id).slice(0, 4);
    if (men.length) applyEffects(ctx, men.map((m) => op(m.id, c.id, 3, `${c.firstName} handles things now`)), { label: `${c.firstName}'s free hand`, because: `let ${c.firstName} run his own business`, category: 'event' });
    lines.push(`${c.nickname ?? c.firstName} has had a free hand for ${w} weeks. Men go to him first now.`);
  }
  return lines;
}

export function advisorOf(s: GameState, key: string): Character | undefined {
  const id = key.startsWith('capo:') ? key.slice(5) : key === 'wife' ? player(s).spouseId : key === 'bagman' ? (s.council.bagman?.holderId ?? s.council.fixer?.holderId) : s.council[key as 'underboss' | 'consigliere']?.holderId;
  const c = id ? s.characters[id] : undefined;
  return c?.alive ? c : undefined;
}

/** Weeks of free hand, for the UI ("Sal: 9 weeks"). */
export function leeway(s: GameState, key: string): number {
  return s.rounds?.leeway[key] ?? 0;
}
