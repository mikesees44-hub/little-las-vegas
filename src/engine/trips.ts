import { ageOn } from './calendar';
import { displayName, hasTrait } from './characters';
import { applyEffects } from './effects';
import { addStress } from './familyStress';
import type { Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { rand, randInt, weightedPick } from './rng';
import { DESTS, ENTERTAINERS, FLEE_DESTS, TIER_INFO, type ActTag, type ActivityOpt, type Dest } from './travelDests';
import { ensureTravel, isLover, type Trip, type TravelState } from './travelState';
import type { Character, Choice, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * Vacations, day by day (CK activities on the road). Each planned day at the
 * destination resolves 1-2 things: how each guest liked it (opinion), how
 * much the boss unwinds (stress), family bonding — and sometimes something
 * happens: a deal by the pool, a rival at the next table, an FBI camera, a
 * secret overheard, and, if the wife and the other woman are both along,
 * the two of them in the same hotel lobby.
 *
 * Everything rolls on the travel stream, so the same seed and the same plan
 * always produce the same vacation.
 */

export type GuestKind = 'spouse' | 'kid' | 'family' | 'crew' | 'outsider' | 'companion' | 'driver';

export function T(s: GameState): TravelState {
  return ensureTravel(s);
}

const LAM: Record<string, Dest> = {};
/** A destination by id: the trip destinations, or a hideout. */
export function destById(id: string): Dest | undefined {
  if (DESTS[id]) return DESTS[id];
  const f = FLEE_DESTS[id as keyof typeof FLEE_DESTS];
  if (!f) return undefined;
  if (!LAM[id]) LAM[id] = { id, name: f.name, lat: f.lat, lon: f.lon, region: 'Hideout', blurb: f.blurb, modes: f.modes, resort: false, peak: [], hotels: ['a hideout', 'a hideout', 'a hideout'], price: 1, activities: [], miles: f.miles, abroad: f.abroad };
  return LAM[id];
}

export function destOf(t: Pick<Trip, 'destId'>): Dest {
  return destById(t.destId) ?? DESTS.ac;
}

export function tripLabel(t: Trip): string {
  return t.purpose === 'lam' ? `On the lam: ${destOf(t).name}` : `Trip: ${destOf(t).name}`;
}

export function journal(s: GameState, t: Trip, text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral', day = s.week * 7): void {
  t.journal.push({ day, text, tone });
  if (t.journal.length > 40) t.journal = t.journal.slice(-40);
}

/** Everyone on the trip who is still alive (leader first). */
export function partyOf(s: GameState, t: Trip): Character[] {
  return [t.leaderId, ...t.party].map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
}

export function guestKind(s: GameState, t: Trip, c: Character): GuestKind {
  const leader = s.characters[t.leaderId];
  if (t.companionId === c.id) return 'companion';
  if (t.driverIds.includes(c.id)) return 'driver';
  if (leader?.spouseId === c.id) return 'spouse';
  if (c.dynasty) return ageOn(c.birth, s.date) < 16 ? 'kid' : 'family';
  if (c.faction === 'player' && c.rank !== 'civilian') return 'crew';
  return 'outsider';
}

const PREFS: Record<GuestKind, Partial<Record<ActTag, number>>> = {
  spouse: { relax: 3, family: 3, culture: 2, romance: 3, shopping: 4, pious: 2, relatives: 3, pool: 1, nightlife: 1, business: -2, gamble: -1, private: -1 },
  kid: { family: 4, relax: 1, sport: 2, pool: 3, business: -3, nightlife: -2, gamble: -2, shopping: -1 },
  family: { family: 2, relax: 2, nightlife: 2, culture: 1, relatives: 2, sport: 1, pool: 1 },
  crew: { gamble: 3, nightlife: 3, private: 2, sport: 2, business: 2, relax: 1, family: -1, culture: -1, shopping: -2 },
  outsider: { business: 3, gamble: 2, nightlife: 2, moneymen: 2, sport: 2, family: -1, relatives: -2 },
  companion: { nightlife: 4, romance: 4, shopping: 3, relax: 2, pool: 2, family: -3, business: -2, relatives: -3 },
  driver: { gamble: 1, nightlife: 1, relax: 1 },
};

/** How a guest takes a day's activity (−4 … +6). */
export function reaction(s: GameState, t: Trip, c: Character, act: ActivityOpt): number {
  const kind = guestKind(s, t, c);
  let v = 0;
  for (const tag of act.tags) v += PREFS[kind][tag] ?? 0;
  if (kind === 'spouse' && t.companionId && act.tags.includes('romance')) v -= 3; // she can feel it
  if (hasTrait(c, 'Gambler') && act.tags.includes('gamble')) v += 2;
  if (hasTrait(c, 'Pious') && act.tags.includes('pious')) v += 2;
  if (hasTrait(c, 'Drinker') && act.tags.includes('nightlife')) v += 1;
  if (t.tier === 'lavish') v += 1;
  if (t.tier === 'modest' && (kind === 'outsider' || kind === 'companion')) v -= 1;
  return Math.max(-4, Math.min(6, v));
}

/* ---------------------------------------------------------------- */
/* The wife and the other woman                                       */
/* ---------------------------------------------------------------- */

/** The lover on this trip (a companion who is the leader's lover), if any. */
export function loverOnTrip(s: GameState, t: Trip): string | undefined {
  return t.companionId && isLover(s, t.leaderId, t.companionId) && s.characters[t.companionId]?.alive ? t.companionId : undefined;
}

/**
 * Chance per day that the leader's wife finds out about the lover. Tiny when
 * the wife is at home (a friend who saw them, a photo); real when both are
 * on the same trip — worse in one big hotel, at the shows, with the kids
 * along; halved if the companion stays at another hotel; a sharp-witted
 * man covers better.
 */
export function discoveryChance(s: GameState, t: Pick<Trip, 'leaderId' | 'party' | 'companionId' | 'discreet' | 'tier' | 'discovered'>, act?: ActivityOpt): number {
  const leader = s.characters[t.leaderId];
  const lover = t.companionId && isLover(s, t.leaderId, t.companionId) ? t.companionId : undefined;
  if (!leader || !lover || t.discovered) return 0;
  const spouseOn = !!leader.spouseId && t.party.includes(leader.spouseId) && !!s.characters[leader.spouseId]?.alive;
  let p: number;
  if (spouseOn) {
    p = 0.14;
    if (t.tier === 'lavish') p += 0.03;
    if (act && act.tags.some((x) => x === 'nightlife' || x === 'romance' || x === 'pool')) p += 0.06;
    if (t.party.some((id) => { const c = s.characters[id]; return c && c.dynasty && c.id !== leader.spouseId && ageOn(c.birth, s.date) < 16; })) p += 0.03;
  } else {
    p = leader.spouseId ? 0.015 : 0;
    if (act?.tags.includes('nightlife')) p += 0.01;
  }
  if (t.discreet) p *= 0.5;
  p *= 1 - Math.max(-0.3, Math.min(0.3, (leader.attributes.intrigue - 50) / 150));
  return Math.max(0, Math.min(0.6, p));
}

/** Over the whole stay. */
export function tripDiscoveryChance(s: GameState, t: Pick<Trip, 'leaderId' | 'party' | 'companionId' | 'discreet' | 'tier' | 'discovered' | 'days' | 'destId'>): number {
  const d = DESTS[t.destId];
  let miss = 1;
  for (const id of t.days) miss *= 1 - discoveryChance(s, t, d?.activities.find((a) => a.id === id));
  return 1 - miss;
}

export function coverOdds(s: GameState, leaderId: string): number {
  const c = s.characters[leaderId];
  if (!c) return 0.2;
  return Math.max(0.1, Math.min(0.8, 0.2 + c.attributes.intrigue / 200 + (hasTrait(c, 'Charming') ? 0.1 : 0) - (hasTrait(c, 'Honest') ? 0.15 : 0)));
}

export function tripEvent(s: GameState, t: Trip, key: string, title: string, text: string, choices: Choice[], actors: string[]): EventInstance {
  t.askedWeek = s.week;
  return {
    iid: `ev${s.nextId++}`, defId: `trip_${key}`, week: s.week, mandatory: true, priority: 64,
    title: `${destOf(t).name}: ${title}`, text, choices, defaultChoiceId: choices[0].id, meta: { trip: t.id }, actors: actors.slice(0, 3),
  };
}

function buildDiscovery(s: GameState, t: Trip, loverId: string): EventInstance {
  const leader = s.characters[t.leaderId];
  const wife = s.characters[leader.spouseId!];
  const lover = s.characters[loverId];
  const d = destOf(t);
  const label = `${tripLabel(t)}: the wife and the other ${lover.gender === 'F' ? 'woman' : 'man'}`;
  const odds = Math.round(coverOdds(s, leader.id) * 100);
  const hotel = TIER_INFO[t.tier] && d.hotels[t.tier === 'modest' ? 0 : t.tier === 'first' ? 1 : 2];
  const text = t.discreet
    ? `${lover.firstName} was supposed to be at another hotel. But ${wife.firstName} went down for the papers and there ${lover.gender === 'F' ? 'she' : 'he'} was, at the newsstand, wearing the bracelet ${leader.firstName} bought in Philadelphia. ${wife.firstName} knows that bracelet.`
    : `The lobby of ${hotel}, ten in the morning. ${wife.firstName} comes back from the beauty parlor at the exact moment ${lover.firstName} steps out of the elevator and says ${leader.firstName}'s name a little too warmly. Nobody moves. The bellhop finds something to do.`;
  return tripEvent(s, t, 'discovery', 'Two women, one lobby', text, [
    { id: 'story', label: 'Spin a story', detail: `"She's the wife of a man I do business with." ${odds}% she believes it — a sharp mind helps; if not, it is worse than the truth.`, because: `tried to explain away ${lover.firstName} to ${wife.firstName}`, effects: [{ type: 'travel', op: { op: 'coverStory', tripId: t.id }, label }] },
    { id: 'confess', label: 'Come clean, quietly', detail: 'Upstairs, door closed. She will not forget it — but she will know where she stands.', because: `confessed the affair to ${wife.firstName}`, effects: [
      { type: 'opinion', from: wife.id, to: leader.id, amount: -30, reason: 'The other woman on our vacation', decay: 1, label },
      { type: 'dyn', op: { op: 'stress', charId: wife.id, amount: 20, source: 'domestic' }, label },
      { type: 'opinion', from: lover.id, to: leader.id, amount: 5, reason: 'He did not deny me', decay: 1, label },
      { type: 'travel', op: { op: 'confess', tripId: t.id }, label },
    ] },
    { id: 'sendhome', label: `Put ${lover.firstName} on the next plane home`, detail: 'Damage control. Nobody is happy.', because: `sent ${lover.firstName} home from ${d.name}`, effects: [
      { type: 'opinion', from: lover.id, to: leader.id, amount: -25, reason: 'Sent me home like a suitcase', decay: 1, label },
      { type: 'opinion', from: wife.id, to: leader.id, amount: -12, reason: 'Another woman at the hotel', decay: 1, label },
      { type: 'dyn', op: { op: 'stress', charId: leader.id, amount: 8, source: 'domestic' }, label },
      { type: 'travel', op: { op: 'sendHome', tripId: t.id, charId: lover.id }, label },
    ] },
  ], [wife.id, leader.id, lover.id]);
}

/** Weeks after a discovery, at home: the reckoning. */
export function buildAftermath(s: GameState, a: TravelState['aftermath'][number]): EventInstance | undefined {
  const leader = s.characters[a.leaderId];
  const wife = s.characters[a.spouseId];
  const lover = s.characters[a.loverId];
  if (!leader?.alive || !wife?.alive || leader.spouseId !== wife.id) return undefined;
  const label = 'A cold house';
  const ring = 3000;
  return {
    iid: `ev${s.nextId++}`, defId: 'trip_aftermath', week: s.week, mandatory: true, priority: 63,
    title: 'A cold house', meta: { family: 1, trip: 'aftermath' }, actors: [wife.id, leader.id, ...(lover?.alive ? [lover.id] : [])],
    text: `Since the trip, ${wife.firstName} sets one place less at dinner and sleeps in the girls' room. Her sister has started coming over in the afternoons. Her mother has started calling. ${lover?.alive ? `And ${lover.firstName} still calls the club every Thursday.` : ''}`,
    defaultChoiceId: 'nothing',
    choices: [
      { id: 'ring', label: 'A peace offering from Bailey Banks & Biddle', detail: 'A diamond and a long dinner in Philadelphia. It buys time, not forgiveness.', because: `bought ${wife.firstName} a peace offering`, effects: [
        { type: 'money', amount: -ring, label }, { type: 'opinion', from: wife.id, to: leader.id, amount: 18, reason: 'A peace offering', decay: 1, label },
      ], disabledReason: s.money < ring ? `Needs $${ring.toLocaleString('en-US')}` : undefined },
      ...(lover?.alive ? [{ id: 'end', label: `End it with ${lover.firstName}`, detail: 'A last lunch and a check. She decides how she takes it.', because: `ended the affair with ${lover.firstName}`, effects: [
        { type: 'travel', op: { op: 'endAffair', leaderId: leader.id, loverId: lover.id }, label } as Effect,
        { type: 'opinion', from: wife.id, to: leader.id, amount: 15, reason: 'He ended it', decay: 1, label } as Effect,
        { type: 'opinion', from: lover.id, to: leader.id, amount: -20, reason: 'He ended it with a check', decay: 1, label } as Effect,
      ] } as Choice] : []),
      { id: 'nothing', label: 'Wait for it to blow over', detail: 'It does not blow over. A wife who knows things is a wife who could talk.', because: 'waited for the cold house to thaw', effects: [
        { type: 'meter', from: wife.id, to: leader.id, meter: 'grievance', amount: 20, label },
        { type: 'dyn', op: { op: 'stress', charId: wife.id, amount: 10, source: 'domestic' }, label },
        { type: 'familyOpinion', amount: -3, reason: 'Everybody knows about the trip', label },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- */
/* Beats                                                             */
/* ---------------------------------------------------------------- */

interface Beat {
  key: string;
  /** Raises a popup (needs the trip's weekly popup slot). */
  ask?: boolean;
  weight: (s: GameState, t: Trip, a: ActivityOpt) => number;
  run: (ctx: Ctx, t: Trip, a: ActivityOpt) => EventInstance | undefined | void;
}

function outsiders(s: GameState, t: Trip): Character[] {
  return partyOf(s, t).filter((c) => c.id !== t.leaderId && guestKind(s, t, c) === 'outsider');
}

function rivalHere(s: GameState, t: Trip): { id: RivalId; leader: Character } | undefined {
  for (const id of destOf(t).rivals ?? []) {
    const r = s.rivals.find((x) => x.id === id);
    const L = r ? s.characters[r.leaderId] : undefined;
    if (r && L?.alive && !t.party.includes(L.id) && L.id !== t.leaderId && (L.imprisonedUntil ?? 0) <= s.week) return { id, leader: L };
  }
  return undefined;
}

function secretGuest(s: GameState, t: Trip): { c: Character; sec: GameState['secrets'][number] } | undefined {
  for (const c of partyOf(s, t)) {
    if (c.id === t.leaderId) continue;
    const sec = s.secrets.find((x) => x.ownerId === c.id && !x.knownBy.includes('player'));
    if (sec) return { c, sec };
  }
  return undefined;
}

function cityStandingEffect(t: Trip, amount: number, label: string): Effect[] {
  const city = destOf(t).cityId;
  return city ? [{ type: 'standing', city, amount, label }] : [];
}

const BEATS: Beat[] = [
  {
    key: 'good',
    weight: () => 2,
    run: (ctx, t, a) => {
      const s = ctx.s;
      const lines = [`${a.name}: a perfect day. Nobody mentioned Wildwood once.`, `${a.name}. Sun, a long lunch, and a nap nobody interrupted.`, `${a.name}. The kind of day you remember in February.`];
      journal(s, t, lines[Math.floor(rand(T(s)) * lines.length)], 'good');
      addStress(s, t.leaderId, -3, 'paranoia');
    },
  },
  {
    key: 'gamble',
    weight: (_s, _t, a) => (a.tags.includes('gamble') ? 5 : 0),
    run: (ctx, t) => {
      const s = ctx.s;
      const L = s.characters[t.leaderId];
      const scale = t.tier === 'modest' ? 300 : t.tier === 'first' ? 900 : 2400;
      const swing = (hasTrait(L, 'Gambler') ? 1.8 : 1) * scale;
      const amt = Math.round(((rand(T(s)) - 0.55) * 2 * swing) / 10) * 10;
      if (!amt) return;
      applyEffects(ctx, [{ type: 'money', amount: amt, label: `${tripLabel(t)}: ${amt > 0 ? 'a hot streak at the tables' : 'the tables were cold'}` }], { label: tripLabel(t), because: 'gambled on vacation', category: 'event' });
      journal(s, t, amt > 0 ? `${L.firstName} rolled eleven passes in a row. The pit boss came over to watch. (+$${amt.toLocaleString('en-US')})` : `The dice were cold all night. (−$${Math.abs(amt).toLocaleString('en-US')})`, amt > 0 ? 'good' : 'bad');
    },
  },
  {
    key: 'romance',
    weight: (s, t, a) => (a.tags.includes('romance') && (t.companionId || s.characters[t.leaderId]?.spouseId && t.party.includes(s.characters[t.leaderId].spouseId!)) ? 4 : 0),
    run: (ctx, t, a) => {
      const s = ctx.s;
      const L = s.characters[t.leaderId];
      const lover = loverOnTrip(s, t);
      const spouseOn = L.spouseId && t.party.includes(L.spouseId) ? s.characters[L.spouseId] : undefined;
      // With the companion when the wife is not along; otherwise the wife.
      const with_ = lover && !spouseOn ? s.characters[lover] : spouseOn ?? (lover ? s.characters[lover] : undefined);
      if (!with_) return;
      addOpinion(s, with_.id, L.id, with_.id === L.spouseId ? 'A second honeymoon' : `A night in ${destOf(t).name}`, 6, 1);
      addOpinion(s, L.id, with_.id, with_.id === L.spouseId ? 'A second honeymoon' : `A night in ${destOf(t).name}`, 4, 1);
      addStress(s, L.id, -4, 'domestic');
      journal(s, t, with_.id === L.spouseId ? `${a.name}: ${L.firstName} and ${with_.firstName} danced like it was 1946. A second honeymoon.` : `${a.name}: ${L.firstName} and ${with_.firstName}, a corner table, and the band playing just for them.`, 'good');
    },
  },
  {
    key: 'bond',
    weight: (s, t, a) => (a.tags.includes('family') && partyOf(s, t).some((c) => guestKind(s, t, c) === 'kid') ? 4 : 0),
    run: (ctx, t, a) => {
      const s = ctx.s;
      const L = s.characters[t.leaderId];
      const kids = partyOf(s, t).filter((c) => guestKind(s, t, c) === 'kid');
      for (const k of kids) {
        addOpinion(s, k.id, L.id, 'The best vacation ever', 5, 1);
        addStress(s, k.id, -5, 'domestic');
      }
      addStress(s, L.id, -3, 'domestic');
      const k = kids[0];
      const scare = rand(T(s)) < 0.25;
      journal(s, t, scare ? `${a.name}: little ${k.firstName} wandered off and was found an hour later at the bait shop, perfectly happy, eating a hot dog someone bought him. Nobody breathed for that hour.` : `${a.name}: ${kids.map((x) => x.firstName).join(' and ')} will talk about it all winter.`, scare ? 'neutral' : 'good');
      if (scare) addStress(s, L.id, 4, 'domestic');
    },
  },
  {
    key: 'devotion',
    weight: (_s, _t, a) => (a.tags.includes('pious') || a.tags.includes('relatives') ? 4 : 0),
    run: (ctx, t, a) => {
      const s = ctx.s;
      applyEffects(ctx, [
        { type: 'familyOpinion', amount: 2, reason: a.tags.includes('relatives') ? 'Took us to see the family' : 'Took us to church on vacation', label: tripLabel(t) },
        { type: 'dyn', op: { op: 'renown', amount: a.tags.includes('relatives') ? 12 : 5, reason: `${a.name} (${destOf(t).name})` }, label: tripLabel(t) },
      ], { label: tripLabel(t), because: a.name.toLowerCase(), category: 'event' });
      journal(s, t, a.tags.includes('relatives') ? `${a.name}: the aunts cried, the uncles argued about 1922, and a second cousin asked about America. Your name means something here.` : `${a.name}: the family lit candles for the grandparents.`, 'good');
    },
  },
  {
    key: 'local',
    weight: (_s, t, a) => (a.tags.includes('business') && !a.tags.includes('moneymen') && !a.tags.includes('exiles') && destOf(t).cityId ? 4 : a.tags.includes('oldmen') ? 4 : a.id === 'connections' || a.id === 'mexicans' ? 5 : 0),
    run: (ctx, t, a) => {
      const s = ctx.s;
      const d = destOf(t);
      const eff: Effect[] = [...cityStandingEffect(t, randInt(T(s), 8, 15), `${tripLabel(t)}: ${a.name}`)];
      if (a.tags.includes('oldmen')) eff.push({ type: 'respect', amount: 3, label: `${tripLabel(t)}: the old-country men` });
      if (d.id === 'ac') eff.push({ type: 'rivalOpinion', rival: 'manno', amount: 6, reason: 'Came to us on neutral ground', label: tripLabel(t) });
      if (d.id === 'philadelphia') eff.push({ type: 'rivalOpinion', rival: 'philly', amount: 6, reason: 'Came to pay respects on his own', label: tripLabel(t) });
      if (eff.length) applyEffects(ctx, eff, { label: tripLabel(t), because: a.name.toLowerCase(), category: 'event' });
      if (a.id === 'connections' || a.id === 'mexicans') {
        s.flags[`lam_${a.id === 'connections' ? 'montreal' : 'mexico'}`] = 1;
        journal(s, t, `${a.name}: a phone number written on a matchbook. "If you ever need to go away for a while." (A hideout there will be safer.)`, 'good');
      } else journal(s, t, `${a.name}: espresso, anisette, and an understanding.`, 'good');
    },
  },
  {
    key: 'overheard',
    weight: (s, t) => (secretGuest(s, t) ? 2 : 0),
    run: (ctx, t) => {
      const s = ctx.s;
      const g = secretGuest(s, t);
      if (!g) return;
      applyEffects(ctx, [{ type: 'secretKnown', secretId: g.sec.id }, { type: 'hook', targetId: g.c.id, strong: false, reason: 'What you overheard on vacation' }], { label: `${tripLabel(t)}: something overheard`, because: 'overheard a secret on vacation', category: 'event' });
      journal(s, t, `Through the wall of the next cabana: ${displayName(g.c)}, on the telephone. It turns out ${g.sec.text}.`, 'neutral');
    },
  },
  {
    key: 'storm',
    weight: (s, t) => ((destOf(t).storms ?? []).includes(s.date.m) ? 1.5 : 0),
    run: (ctx, t) => {
      const s = ctx.s;
      journal(s, t, 'A hurricane warning. The hotel boards its windows and the airlines add flights north. The trip is over early.', 'bad');
      applyTravelCut(s, t);
      addStress(s, t.leaderId, 5, 'domestic');
    },
  },
  {
    key: 'deal', ask: true,
    weight: (s, t, a) => (a.tags.includes('business') || a.tags.includes('moneymen') ? (outsiders(s, t).length ? 4 : 2) : 0),
    run: (ctx, t, a) => {
      const s = ctx.s;
      const g = outsiders(s, t)[0];
      const amt = Math.round((1500 + rand(T(s)) * (t.tier === 'lavish' ? 6000 : 3500)) / 100) * 100;
      const label = `${tripLabel(t)}: a deal`;
      const who = g ? displayName(g) : `A man ${destOf(t).name === 'Las Vegas' ? 'from the count room' : 'who knows your name'}`;
      const banks = a.id === 'banks';
      const washed = Math.min(s.unwashed, 8000);
      return tripEvent(s, t, 'deal', banks ? 'A quiet banker' : 'Business by the pool', banks
        ? `A banker in a linen suit explains how money can rest in Hamilton where no auditor ever looks. A fee, of course.`
        : `${who} pulls a chair up to your cabana. ${a.tags.includes('moneymen') ? 'There is a points share that needs a partner from back East.' : 'He has a load coming in and a buyer who wants a partner.'}`, banks ? [
        { id: 'wash', label: 'Open an account', detail: washed ? `Washes ${'$' + washed.toLocaleString('en-US')} of dirty cash for a 10% fee.` : 'Nothing dirty to wash right now.', because: 'opened a Bermuda account', effects: washed ? [{ type: 'unwashed', amount: -washed, label }, { type: 'money', amount: -Math.round(washed * 0.1), label }] : [] },
        { id: 'pass', label: 'Just enjoy the view', because: 'kept business off the beach', effects: [{ type: 'dyn', op: { op: 'stress', charId: t.leaderId, amount: -3, source: 'irs' }, label }] },
      ] : [
        { id: 'take', label: 'Shake on it', detail: 'A finder\'s fee now; the Bureau notices who you shake hands with.', because: `made a deal on vacation in ${destOf(t).name}`, effects: [
          { type: 'money', amount: amt, label }, { type: 'heat', bar: 'federal', amount: 2, label },
          ...cityStandingEffect(t, 6, label),
          ...(g ? [{ type: 'opinion', from: g.id, to: t.leaderId, amount: 8, reason: 'Did business with me on vacation', decay: 1, label } as Effect] : []),
        ] },
        { id: 'pass', label: 'Not on vacation', because: 'kept business off the beach', effects: [{ type: 'dyn', op: { op: 'stress', charId: t.leaderId, amount: -3, source: 'irs' }, label }, ...(g ? [{ type: 'opinion', from: g.id, to: t.leaderId, amount: -3, reason: 'Turned me down', decay: 1, label } as Effect] : [])] },
      ], g ? [g.id, t.leaderId] : [t.leaderId]);
    },
  },
  {
    key: 'exiles', ask: true,
    weight: (_s, _t, a) => (a.tags.includes('exiles') ? 6 : 0),
    run: (ctx, t) => {
      const s = ctx.s;
      const label = `${tripLabel(t)}: the Havana men`;
      return tripEvent(s, t, 'exiles', 'Men without a casino', 'Six men in a hotel room with the curtains drawn: pit bosses, a casino manager, a man who ran the count at the Riviera. Castro took everything. They want a partner for whatever comes next — the Bahamas, Las Vegas, maybe someday the Jersey shore.', [
        { id: 'invest', label: 'Put money with them ($2,000)', detail: 'Friends who know how to run a casino, the day you get your license.', because: 'backed the Havana exiles', effects: [
          { type: 'money', amount: -2000, label }, { type: 'standing', city: 'havana', amount: 20, label }, { type: 'standing', city: 'miami', amount: 10, label }, { type: 'respect', amount: 2, label },
        ], disabledReason: s.money < 2000 ? 'Needs $2,000' : undefined },
        { id: 'listen', label: 'Just listen', because: 'listened to the Havana exiles', effects: [{ type: 'standing', city: 'havana', amount: 6, label }] },
      ], [t.leaderId]);
    },
  },
  {
    key: 'fbi', ask: true,
    weight: (s, _t, a) => (a.tags.some((x) => x === 'pool' || x === 'nightlife' || x === 'gamble') && s.heat.federal >= 25 ? 2 + s.heat.federal / 25 : 0),
    run: (ctx, t) => {
      const s = ctx.s;
      const label = `${tripLabel(t)}: the camera by the pool`;
      return tripEvent(s, t, 'fbi', 'A camera by the pool', `Across the pool a man in a seersucker suit who is not swimming has been taking pictures for an hour. Everyone at your table is in them${t.companionId ? ' — including the people who should not be.' : '.'}`, [
        { id: 'buy', label: 'Buy the film ($800)', detail: 'A bellhop does the negotiating. If he is a stringer, it works.', because: 'bought the photographer\'s film', effects: [{ type: 'money', amount: -800, label }, { type: 'heat', bar: 'federal', amount: -1, label }] },
        { id: 'wave', label: 'Raise a glass to him', because: 'toasted the FBI photographer', effects: [{ type: 'heat', bar: 'federal', amount: 3, label }, { type: 'respect', amount: 1, label }, { type: 'evidence', charId: t.leaderId, amount: 2, label }] },
        { id: 'leave', label: 'Pack up and go inside', because: 'left the pool to the photographer', effects: [{ type: 'dyn', op: { op: 'stress', charId: t.leaderId, amount: 3, source: 'paranoia' }, label }] },
      ], [t.leaderId]);
    },
  },
  {
    key: 'rival', ask: true,
    weight: (s, t, a) => (rivalHere(s, t) && a.tags.some((x) => x !== 'family') ? 2.5 : 0),
    run: (ctx, t) => {
      const s = ctx.s;
      const r = rivalHere(s, t);
      if (!r) return undefined;
      const rv = s.rivals.find((x) => x.id === r.id)!;
      const war = s.wars.find((w) => w.rival === r.id);
      const label = `${tripLabel(t)}: ${rv.shortName} is here too`;
      return tripEvent(s, t, 'rival', `${rv.shortName} is here too`, `Two cabanas down: ${displayName(r.leader)}, in a terry-cloth robe, ${war ? 'with four men who are not on vacation.' : 'with his wife and a newspaper.'} He has seen you. Everyone has seen that he has seen you.`, [
        { id: 'sit', label: 'Sit down with him by the pool', detail: 'No business. Just two men on vacation.', because: `sat down with ${rv.shortName} on vacation`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: war ? 6 : 12, reason: 'Sat with me by the pool', label }, { type: 'opinion', from: r.leader.id, to: t.leaderId, amount: 6, reason: 'A civil afternoon', decay: 1, label }] },
        { id: 'bottle', label: 'Send over a bottle ($200)', because: `sent ${rv.shortName} a bottle`, effects: [{ type: 'money', amount: -200, label }, { type: 'rivalOpinion', rival: r.id, amount: 5, reason: 'Sent a bottle over', label }] },
        { id: 'cut', label: 'Cut him dead', detail: 'Turn your chair to the sea.', because: `snubbed ${rv.shortName} on vacation`, effects: [{ type: 'respect', amount: 2, label }, { type: 'rivalOpinion', rival: r.id, amount: -10, reason: 'Snubbed me in front of everybody', label }] },
      ], [r.leader.id, t.leaderId]);
    },
  },
];

/** Cut the stay short: leave today. */
export function applyTravelCut(s: GameState, t: Trip): void {
  const now = Math.max(t.arriveDay, s.week * 7);
  if (now >= t.leaveDay) return;
  const back = t.homeDay - t.leaveDay;
  t.leaveDay = now + 1;
  t.homeDay = t.leaveDay + back;
  t.days = t.days.slice(0, Math.max(t.done, now + 1 - t.arriveDay));
}

/**
 * One day of the itinerary: guest reactions, relief and bonding, then 1-2
 * things that happen. Returns a popup if one was raised.
 */
export function resolveDay(ctx: Ctx, t: Trip, i: number): EventInstance[] {
  const s = ctx.s;
  const tr = T(s);
  const d = destOf(t);
  const a = d.activities.find((x) => x.id === t.days[i]);
  t.done = Math.max(t.done, i + 1);
  const leader = s.characters[t.leaderId];
  if (!a || !leader?.alive) return [];
  const day = t.arriveDay + i;
  const out: EventInstance[] = [];

  // Guest reactions.
  const notes: string[] = [];
  for (const g of partyOf(s, t)) {
    if (g.id === leader.id || t.driverIds.includes(g.id)) continue;
    const v = reaction(s, t, g, a);
    if (!v) continue;
    addOpinion(s, g.id, leader.id, v > 0 ? `A good trip to ${d.name}` : `Bored in ${d.name}`, v, 1);
    if (v > 0) addStress(s, g.id, -Math.min(4, v), 'domestic');
    notes.push(`${g.firstName} ${v >= 4 ? 'loved it' : v > 0 ? 'liked it' : 'was bored'} (${v > 0 ? '+' : ''}${v})`);
  }
  // The boss unwinds.
  const relief = Math.round(TIER_INFO[t.tier].relief / Math.max(3, t.days.length) + (a.tags.includes('relax') ? 2 : 0) + (hasTrait(leader, 'Gambler') && a.tags.includes('gamble') ? 2 : 0));
  addStress(s, leader.id, -relief, 'paranoia');
  journal(s, t, `Day ${i + 1}, ${a.name}.${notes.length ? ' ' + notes.join(', ') + '.' : ''}`, 'neutral', day);

  // The entertainer plays the first night.
  if (i === 0 && t.entertainer) {
    const e = ENTERTAINERS[t.entertainer];
    for (const g of partyOf(s, t)) if (g.id !== leader.id) addOpinion(s, g.id, leader.id, `${e.name} played for us`, 4, 1);
    applyEffects(ctx, [{ type: 'dyn', op: { op: 'renown', amount: 8, reason: `${e.name} played for the house in ${d.name}` } }], { label: tripLabel(t), because: 'hired an act', category: 'event' });
    journal(s, t, e.text, 'good', day);
  }

  // The wife and the other woman.
  const lover = loverOnTrip(s, t);
  if (lover && !t.discovered && rand(tr) < discoveryChance(s, t, a)) {
    t.discovered = true;
    tr.stats.discoveries++;
    const spouseOn = leader.spouseId && t.party.includes(leader.spouseId);
    if (spouseOn) out.push(buildDiscovery(s, t, lover));
    else if (leader.spouseId) {
      // Word gets home: someone saw them.
      tr.aftermath.push({ spouseId: leader.spouseId, loverId: lover, due: s.week + randInt(tr, 1, 3), leaderId: leader.id });
      journal(s, t, `A woman from St. Ann's parish was in the same hotel. She will be home before ${leader.firstName} is.`, 'bad', day);
    }
  }

  // 1-2 things happen.
  const n = 1 + (rand(tr) < 0.4 ? 1 : 0);
  const used = new Set<string>();
  for (let k = 0; k < n; k++) {
    const canAsk = t.askedWeek !== s.week && !out.length;
    const b: Beat | undefined = weightedPick(tr, BEATS.filter((x) => !used.has(x.key) && (!x.ask || canAsk)), (x) => x.weight(s, t, a));
    if (!b) break;
    used.add(b.key);
    const ev = b.run(ctx, t, a);
    if (ev) out.push(ev);
  }
  return out;
}

/** Simple per-relationship check used by the planner and tests. */
export function opinionOfLeader(s: GameState, t: Trip, id: string): number {
  return opinion(s, id, t.leaderId);
}

