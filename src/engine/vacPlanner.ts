import { ageOn } from './calendar';
import { crew } from './characters';
import { addStress } from './familyStress';
import { money, type Ctx } from './ledger';
import { inflation } from './property';
import { addOpinion } from './relations';
import { hashSeed, rand } from './rng';
import { companionPool, driverPool, guestPool, MAX_GUESTS, quoteTrip, suggestPlan, type TripQuote } from './travel';
import { DESTS, RESORT_IDS } from './travelDests';
import { liveTrips, type BudgetTier, type Trip, type TripPlan, type TravelMode } from './travelState';
import { journal, partyOf, guestKind } from './trips';
import type { Character, GameState } from './types';

/**
 * THE EASY VACATION PLANNER (the Store's Lifestyle tab): one screen. Pick a
 * destination, when, how and how fancy; tick the people by group — your
 * wife, the kids, the relatives, the underboss, the capos, their wives, the
 * soldiers, your goomar — or press "Bring the whole family". Each person
 * shows what he costs; the screen says who stays home to mind the store,
 * and how likely trouble is while everybody is away.
 *
 * It builds an ordinary TripPlan (travel.ts books it; vacation.ts plays it
 * day by day), with `entourage` set when the party is bigger than a normal
 * invitation list: up to MAX_ENTOURAGE, and the crew come as guests, not
 * bodyguards.
 *
 * If your wife AND your goomar both come, it gets wild: a beat every day of
 * the stay (wildDay, called by vacation.ts) — the near-miss at the pool, the
 * goomar in the next room, the jealous scene, who sees whom, the capos'
 * wives gossiping. Adults, nothing explicit; the consequences land in
 * opinions, stress and the people who saw it. Rolls come from the trip's id
 * and the day (never the main dice, never the travel stream).
 */

export type EntourageGroup = 'wife' | 'kids' | 'relatives' | 'brass' | 'capos' | 'crewWives' | 'soldiers' | 'goomar';

export const ENTOURAGE_GROUPS: EntourageGroup[] = ['wife', 'kids', 'relatives', 'brass', 'capos', 'crewWives', 'soldiers', 'goomar'];

export const GROUP_TEXT: Record<EntourageGroup, string> = {
  wife: 'Your wife', kids: 'The kids', relatives: 'Relatives', brass: 'The underboss & consigliere', capos: 'The capos', crewWives: "The men's wives", soldiers: 'Soldiers & associates', goomar: 'Your goomar',
};

/** "Bring the whole family": everybody, the goomar included if there is one (see GROUP_TEXT). */
export const WHOLE_FAMILY: EntourageGroup[] = ['wife', 'kids', 'relatives', 'brass', 'capos', 'crewWives', 'soldiers', 'goomar'];

export interface EntourageMember { id: string; name: string; group: EntourageGroup }

/** Everybody who could come, by group (the boss leads). */
export function entourageGroups(s: GameState): Record<EntourageGroup, EntourageMember[]> {
  const out = Object.fromEntries(ENTOURAGE_GROUPS.map((g) => [g, [] as EntourageMember[]])) as Record<EntourageGroup, EntourageMember[]>;
  const B = s.characters[s.playerId];
  if (!B) return out;
  const pool = guestPool(s, B.id);
  const crewIds = new Set(crew(s).map((c) => c.id));
  const add = (c: Character, g: EntourageGroup) => out[g].push({ id: c.id, name: `${c.firstName} ${c.lastName}`, group: g });
  for (const c of pool) {
    if (c.id === B.spouseId) add(c, 'wife');
    else if (B.childrenIds.includes(c.id)) add(c, 'kids');
    else if (c.dynasty) add(c, ageOn(c.birth, s.date) < 16 ? 'kids' : 'relatives');
    else if (crewIds.has(c.id)) add(c, c.rank === 'underboss' || c.rank === 'consigliere' ? 'brass' : c.rank === 'capo' ? 'capos' : 'soldiers');
    else if (c.spouseId && crewIds.has(c.spouseId)) add(c, 'crewWives');
  }
  for (const c of companionPool(s, B.id)) add(c, 'goomar');
  return out;
}

export function groupIds(s: GameState, groups: EntourageGroup[]): string[] {
  const g = entourageGroups(s);
  return groups.flatMap((k) => g[k].map((m) => m.id));
}

export interface EasyInput {
  destId: string;
  /** Weeks from now (0 = this week). */
  departIn: number;
  /** Nights at the destination (3-5). */
  nights: number;
  mode?: TravelMode;
  tier: BudgetTier;
  transport?: string;
  /** Everyone ticked (the goomar too: she takes the companion slot). */
  picks: string[];
  /** Book the goomar into another hotel (halves the chance your wife finds out; the storyline is calmer). */
  discreet?: boolean;
}

/** The plan the travel system books (pure). */
export function easyPlan(s: GameState, inp: EasyInput): TripPlan {
  const base = suggestPlan(s, s.playerId, inp.destId, 'vacation');
  const d = DESTS[base.destId];
  const lovers = new Set(companionPool(s, s.playerId).map((c) => c.id));
  const companionId = inp.picks.find((id) => lovers.has(id));
  const guests = inp.picks.filter((id) => !lovers.has(id) && id !== s.playerId);
  const nights = Math.max(3, Math.min(5, inp.nights));
  const acts = base.days.length ? base.days : d.activities.map((a) => a.id);
  const days: string[] = [];
  for (let i = 0; i < nights; i++) days.push(acts[i % acts.length]);
  const mode = inp.mode && d.modes.includes(inp.mode) ? inp.mode : base.mode;
  const crewAlong = guests.some((id) => { const c = s.characters[id]; return c && !c.dynasty && c.faction === 'player' && c.rank !== 'civilian'; });
  const plan: TripPlan = {
    purpose: 'vacation', leaderId: s.playerId, destId: d.id, mode, tier: inp.tier, guests, days, departIn: Math.max(0, Math.min(26, inp.departIn)),
    ...(companionId ? { companionId, discreet: !!inp.discreet } : {}),
    ...(inp.transport ? { transport: inp.transport } : {}),
    ...(guests.length > MAX_GUESTS || crewAlong ? { entourage: true } : {}),
  };
  if (mode === 'cars') {
    const people = 1 + guests.length + (companionId ? 1 : 0);
    const cars = Math.max(1, Math.min(4, Math.ceil(people / 3)));
    const drivers = driverPool(s, s.playerId).filter((c) => !guests.includes(c.id)).slice(0, cars).map((c) => c.id);
    plan.cars = cars;
    plan.driverIds = drivers;
  }
  return plan;
}

/** The quote, and what one more person costs on this trip (fares, rooms, the itinerary). */
export function easyQuote(s: GameState, inp: EasyInput): { plan: TripPlan; quote: TripQuote; perHead: number } {
  const plan = easyPlan(s, inp);
  const quote = quoteTrip(s, plan);
  const alone = quoteTrip(s, { ...plan, guests: [], companionId: undefined, entourage: undefined, cars: plan.mode === 'cars' ? 1 : plan.cars, driverIds: plan.driverIds?.slice(0, 1) });
  const extra = 1 + plan.guests.length + (plan.companionId ? 1 : 0);
  const perHead = extra > 1 ? Math.round((quote.cost - alone.cost) / (extra - 1)) : Math.round(alone.cost / 1.5);
  return { plan, quote, perHead: Math.max(0, perHead) };
}

/* ------------------------------------------------------------------ */
/* Who minds the store                                                  */
/* ------------------------------------------------------------------ */

export interface HomeWatch {
  keeper?: Character;
  caposAway: number;
  capos: number;
  soldiersAway: number;
  /** Weekly chance of trouble at home while the party is away. */
  risk: number;
  lines: string[];
}

export function whoMindsTheStore(s: GameState, picks: string[]): HomeWatch {
  const going = new Set(picks);
  const men = crew(s).filter((c) => c.id !== s.playerId);
  const capos = men.filter((c) => c.rank === 'capo');
  const soldiers = men.filter((c) => c.rank === 'soldier' || c.rank === 'associate');
  const order = ['underboss', 'consigliere', 'capo', 'soldier'];
  const keeper = men.filter((c) => !going.has(c.id)).sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank))[0];
  const caposAway = capos.filter((c) => going.has(c.id)).length;
  const soldiersAway = soldiers.filter((c) => going.has(c.id)).length;
  const capoFrac = capos.length ? caposAway / capos.length : 0;
  const solFrac = soldiers.length ? soldiersAway / soldiers.length : 0;
  let risk = 0.03 + 0.3 * capoFrac + 0.15 * solFrac;
  if (!keeper) risk += 0.25;
  else if (keeper.rank !== 'underboss' && keeper.rank !== 'consigliere') risk += 0.08;
  risk = Math.round(Math.min(0.6, risk) * 100) / 100;
  const lines: string[] = [];
  if (keeper) lines.push(`${keeper.firstName} ${keeper.lastName} (${keeper.rank}) minds the store.`);
  else lines.push('Nobody minds the store. The other families will know by Tuesday.');
  if (caposAway) lines.push(`${caposAway} of ${capos.length} capos away: their corners run themselves.`);
  if (soldiersAway) lines.push(`${soldiersAway} soldiers on the beach instead of the street.`);
  lines.push(`About ${Math.round(risk * 100)}% a week that something goes wrong at home.`);
  return { keeper, caposAway, capos: capos.length, soldiersAway, risk, lines };
}

/** Is the wild storyline on (your wife and your goomar both ticked)? */
export function wildOn(s: GameState, picks: string[]): boolean {
  const B = s.characters[s.playerId];
  if (!B?.spouseId || !picks.includes(B.spouseId)) return false;
  const lovers = new Set(companionPool(s, s.playerId).map((c) => c.id));
  return picks.some((id) => lovers.has(id));
}

/** Resort destinations, open on this date. */
export function easyDests(s: GameState): string[] {
  return RESORT_IDS.filter((id) => !!DESTS[id] && (id !== 'havana' || s.date.y < 1961));
}

/* ------------------------------------------------------------------ */
/* While everybody is away                                              */
/* ------------------------------------------------------------------ */

/** The boss's big-party vacation under way: trouble at home now and then (store.ts calls it weekly). */
export function entourageWeek(ctx: Ctx): void {
  const s = ctx.s;
  const t = liveTrips(s).find((x) => x.entourage && x.leaderId === s.playerId && x.purpose === 'vacation');
  if (!t) return;
  const first = s.week * 7;
  if (t.departDay > first + 6 || t.homeDay < first) return;
  const w = whoMindsTheStore(s, t.party);
  if (rand({ rng: hashSeed(`${s.seed}:away:${t.id}:${s.week}`) }) >= w.risk) return;
  const loss = Math.round((500 + 1500 * rand({ rng: hashSeed(`${s.seed}:awayamt:${t.id}:${s.week}`) })) * inflation(s));
  const d = s.districts.filter((x) => (x.influence.player ?? 0) > 5).sort((a, b) => (b.influence.player ?? 0) - (a.influence.player ?? 0))[0];
  money(ctx, -Math.min(loss, Math.max(0, s.money)), 'While the family was away: a collection went missing', 'consequence');
  if (d) d.influence.player = Math.max(0, (d.influence.player ?? 0) - 2);
  const text = `While the whole family was in ${DESTS[t.destId]?.name ?? 'the sun'}, ${w.keeper ? `${w.keeper.firstName} was stretched thin` : 'nobody was home'}: a collection came up short and somebody tested a corner${d ? ` in ${d.name}` : ''}.`;
  ctx.log.push(text);
  journal(s, t, text, 'bad');
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
}

/* ------------------------------------------------------------------ */
/* The wife and the goomar on the same vacation                         */
/* ------------------------------------------------------------------ */

interface WildCast { boss: Character; wife: Character; goomar: Character; capos: Character[]; wives: Character[] }

function castOf(s: GameState, t: Trip): WildCast | undefined {
  const boss = s.characters[t.leaderId];
  if (!boss?.alive || t.leaderId !== s.playerId || t.purpose !== 'vacation') return undefined;
  const party = partyOf(s, t);
  const wife = party.find((c) => c.id === boss.spouseId);
  const goomar = t.companionId ? s.characters[t.companionId] : undefined;
  if (!wife || !goomar?.alive || !party.includes(goomar)) return undefined;
  const capos = party.filter((c) => guestKind(s, t, c) === 'crew');
  const crewIds = new Set(crew(s).map((c) => c.id));
  const wives = party.filter((c) => !c.dynasty && c.spouseId && crewIds.has(c.spouseId));
  return { boss, wife, goomar, capos, wives };
}

export interface WildBeat { id: string; text: string; tone: 'good' | 'bad' | 'neutral' }

/** The beats (all adults, nothing explicit). */
export const WILD_BEATS = ['pool', 'nextroom', 'jealous', 'whosees', 'gossip', 'boutique', 'flowers', 'double'] as const;

/**
 * One day of a vacation with the wife and the goomar both along (vacation.ts
 * calls it after the day's plans). Returns the beat, or undefined when the
 * storyline is off (one of them stayed home, or it's not the boss's trip).
 */
export function wildDay(ctx: Ctx, t: Trip, day: number): WildBeat | undefined {
  const s = ctx.s;
  const c = castOf(s, t);
  if (!c) return undefined;
  const { boss, wife, goomar, capos, wives } = c;
  const roll = (k: string) => rand({ rng: hashSeed(`${t.id}:wild:${day}:${k}`) });
  const pool = WILD_BEATS.filter((b) => (b === 'gossip' ? wives.length > 0 : b === 'whosees' ? capos.length > 0 : true));
  const id = pool[Math.floor(roll('pick') * pool.length)];
  const calm = t.discreet ? 0.5 : 1;
  const W = wife.firstName;
  const G = goomar.firstName;
  const hit = (who: Character, v: number, why: string) => addOpinion(s, who.id, boss.id, why, Math.round(v), 1);
  let text = '';
  let tone: WildBeat['tone'] = 'neutral';
  switch (id) {
    case 'pool': {
      text = `The pool: ${W}'s cabana and ${G}'s were two apart. ${boss.firstName} spent the afternoon walking between them with two drinks, like a waiter with a secret.`;
      addStress(s, boss.id, 3, 'domestic');
      if (roll('saw') < 0.35 * calm) { hit(wife, -4, 'Who was the girl in the yellow suit?'); text += ` ${W} asked who the girl in the yellow suit was.`; tone = 'bad'; }
      break;
    }
    case 'nextroom': {
      text = `${G} got the room next door${t.discreet ? ' — the hotel mixed up the bookings' : ''}. At two in the morning ${W} asked who was laughing on the other side of the wall.`;
      hit(wife, -3 * calm, 'Thin walls, strange laughing');
      hit(goomar, 3, 'Right under her nose');
      addStress(s, boss.id, 2, 'domestic');
      tone = 'bad';
      break;
    }
    case 'jealous': {
      text = `At dinner a bottle of champagne arrived at the table "from an admirer". ${W} read the card. ${G}, across the room, raised her glass.`;
      hit(wife, -6 * calm, 'A scene at dinner');
      hit(goomar, -4, 'He looked through me all night');
      addStress(s, boss.id, 4, 'domestic');
      for (const k of capos.slice(0, 2)) addOpinion(s, k.id, boss.id, 'The boss lost control of his own table', -2, 1);
      tone = 'bad';
      break;
    }
    case 'whosees': {
      const k = capos[Math.floor(roll('who') * capos.length)];
      text = `${k.firstName} came down for an early swim and saw ${boss.firstName} leave ${G}'s room at dawn. He said good morning. He did not say anything else, yet.`;
      addOpinion(s, k.id, boss.id, k.traits?.includes('Loyal-to-a-fault') ? 'The boss trusts me with his secrets' : 'Saw the boss leave the other woman\'s room', k.traits?.includes('Loyal-to-a-fault') ? 3 : -2, 1);
      tone = 'neutral';
      break;
    }
    case 'gossip': {
      const g = wives[Math.floor(roll('who') * wives.length)];
      text = `Breakfast on the terrace: ${g.firstName} and the other wives had a lot to say about "that girl" by the pool. By lunch, so did ${W}.`;
      hit(wife, -5 * calm, 'The wives are talking');
      addOpinion(s, g.id, boss.id, 'Made a fool of his wife in front of us', -2, 1);
      tone = 'bad';
      break;
    }
    case 'boutique': {
      text = `${W} and ${G} found the same dress in the same boutique, an hour apart. At the show that night, they wore it. Neither has forgiven the other, or him.`;
      hit(wife, -3, 'The same dress');
      hit(goomar, -3, 'The same dress');
      addStress(s, boss.id, 4, 'domestic');
      for (const k of capos.slice(0, 3)) addOpinion(s, k.id, boss.id, 'Funniest thing I ever saw', 1, 1);
      tone = 'neutral';
      break;
    }
    case 'flowers': {
      text = `The bellhop took ${G}'s roses to the wrong room. ${W} was delighted: "You haven't sent me roses since 1948." ${G} was not delighted.`;
      hit(wife, 4, 'Roses, like when we were young');
      hit(goomar, -5, 'My roses went to his wife');
      tone = 'good';
      break;
    }
    case 'double': {
      text = `${boss.firstName} booked dinner with ${W} at eight and with ${G} at eight-thirty, in the same supper club, on different sides of the room. He ate two dinners.`;
      addStress(s, boss.id, 5, 'domestic');
      if (roll('caught') < 0.25 * calm) { hit(wife, -8, 'Two dinners, one husband'); text += ` ${W} noticed the second dessert.`; tone = 'bad'; } else { hit(goomar, 2, 'He made time for me'); tone = 'neutral'; }
      break;
    }
  }
  if (!t.vac) t.vac = { plan: [] };
  t.vac.wild = (t.vac.wild ?? 0) + 1;
  journal(s, t, text, tone, t.arriveDay + day);
  return { id, text, tone };
}
