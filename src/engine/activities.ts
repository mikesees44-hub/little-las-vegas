import { ageOn, isInSeason } from './calendar';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { alliedHouse, houseLabel, marriageable } from './familyHouses';
import { gainRenown, hasPerk } from './familyLegacy';
import { ourMarriageable } from './familyMarriage';
import { cooldownReady, ensureDynState, fam, famMut, houseOf, setCooldown, type ActivityKind, type ActiveActivity } from './familyState';
import { addStress } from './familyStress';
import type { Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { pick, rand, shuffle, weightedPick } from './rng';
import type { Character, Choice, Effect, EventInstance, GameState } from './types';

/**
 * Hosted activities (CK feasts and hunts): a wedding, a christening, a wake,
 * Sunday dinner, a clambake, a night at the 500 Club, a fishing trip off
 * Cape May. Pick the guests, pay for it, and a week or two later it plays
 * out: guests think better of you, the host unwinds, the house earns
 * renown — and one to three things happen at the party. Weddings and
 * funerals are where business gets done.
 */

export type GuestGroup = 'family' | 'crew' | 'rivals' | 'officials' | 'houses';

export interface ActivityDef {
  name: string;
  place: string;
  text: string;
  weeks: number;
  baseCost: number;
  perGuest: number;
  maxGuests: number;
  relief: number;
  renown: number;
  opinion: number;
  cooldown: number;
  groups: GuestGroup[];
  /** Minimum number of outcomes (weddings and funerals are busy). */
  minOutcomes: number;
}

export const ACTIVITIES: Record<ActivityKind, ActivityDef> = {
  wedding: { name: 'A wedding', place: 'the Hotel Dorset ballroom', text: 'A sit-down dinner for three hundred, envelopes in a satin purse, a band from Philadelphia.', weeks: 2, baseCost: 3000, perGuest: 250, maxGuests: 8, relief: 20, renown: 40, opinion: 15, cooldown: 4, groups: ['family', 'crew', 'rivals', 'officials', 'houses'], minOutcomes: 2 },
  christening: { name: 'A christening', place: 'St. Ann\'s and the house after', text: 'Holy water, a white gown, and a godfather who will be in the child\'s life forever.', weeks: 1, baseCost: 500, perGuest: 100, maxGuests: 5, relief: 10, renown: 15, opinion: 10, cooldown: 4, groups: ['family', 'crew', 'houses', 'officials'], minOutcomes: 1 },
  funeral: { name: 'A wake', place: 'Gaskill\'s funeral home', text: 'Two nights of the rosary and the coffee urn. Everybody comes to be seen, and everybody talks.', weeks: 1, baseCost: 800, perGuest: 150, maxGuests: 8, relief: 15, renown: 20, opinion: 10, cooldown: 3, groups: ['family', 'crew', 'rivals', 'officials', 'houses'], minOutcomes: 2 },
  sunday: { name: 'Sunday dinner', place: 'the house on Glenwood Avenue', text: 'Gravy at two, nobody leaves before the cannoli.', weeks: 1, baseCost: 150, perGuest: 30, maxGuests: 6, relief: 8, renown: 3, opinion: 6, cooldown: 3, groups: ['family', 'crew'], minOutcomes: 1 },
  clambake: { name: 'A clambake at the shore', place: 'the beach below the Crest', text: 'Steamers, corn and beer on the sand. Business talked between the dunes.', weeks: 1, baseCost: 800, perGuest: 120, maxGuests: 8, relief: 12, renown: 10, opinion: 10, cooldown: 8, groups: ['family', 'crew', 'officials', 'houses'], minOutcomes: 1 },
  club500: { name: 'A night at the 500 Club', place: 'the 500 Club, Atlantic City', text: 'Ringside table, the headliner sends over a bottle. Every wiseguy on the shore sees who you came with.', weeks: 1, baseCost: 1500, perGuest: 300, maxGuests: 4, relief: 15, renown: 15, opinion: 12, cooldown: 8, groups: ['crew', 'rivals', 'officials', 'houses'], minOutcomes: 1 },
  fishing: { name: 'A fishing trip off Cape May', place: 'a charter boat out of Cape May', text: 'Out past the shoals at dawn. No phones, no waiters, nobody listening.', weeks: 1, baseCost: 500, perGuest: 100, maxGuests: 3, relief: 15, renown: 5, opinion: 14, cooldown: 6, groups: ['family', 'crew', 'rivals', 'officials', 'houses'], minOutcomes: 1 },
};
export const ACTIVITY_KINDS = Object.keys(ACTIVITIES) as ActivityKind[];

export const GROUP_NAME: Record<GuestGroup, string> = { family: 'Family', crew: 'Crew', rivals: 'Rivals', officials: 'Officials', houses: 'Other houses' };

/** Who is this person, for guest purposes? */
export function guestGroup(s: GameState, c: Character): GuestGroup | undefined {
  if (c.dynasty) return 'family';
  if (c.faction === 'player' && c.rank !== 'civilian') return 'crew';
  if (c.office) return 'officials';
  if (s.rivals.some((r) => r.leaderId === c.id && r.kind !== 'law')) return 'rivals';
  if (s.rivals.some((r) => r.id === c.faction && r.kind === 'mob') && c.rank !== 'civilian') return 'rivals';
  if (s.dyn?.houses.some((h) => h.headId === c.id)) return 'houses';
  if (fam(s, c.id).houseId && ageOn(c.birth, s.date) >= 18) return 'houses';
  return undefined;
}

/** Everyone you could invite to this activity. */
export function eligibleGuests(s: GameState, kind: ActivityKind): Character[] {
  const def = ACTIVITIES[kind];
  return Object.values(s.characters).filter((c) => {
    if (!c.alive || c.id === s.playerId || !isFree(s, c) || ageOn(c.birth, s.date) < 16) return false;
    if (c.faction === 'law' && !c.office) return false;
    const g = guestGroup(s, c);
    return !!g && def.groups.includes(g);
  });
}

/** The person an activity is for (the couple, the baby, the dead), if it needs one. */
export function honoreeOptions(s: GameState, kind: ActivityKind): Character[] {
  const all = Object.values(s.characters);
  if (kind === 'wedding') return all.filter((c) => c.alive && c.dynasty && c.spouseId && fam(s, c.id).marriedWeek !== undefined && !fam(s, c.id).wed && s.week - (fam(s, c.id).marriedWeek ?? 0) <= 26 && (!c.maidenName || c.maidenName === s.houseName));
  if (kind === 'christening') return all.filter((c) => c.alive && c.dynasty && ageOn(c.birth, s.date) < 1 && !fam(s, c.id).christened);
  if (kind === 'funeral') return all.filter((c) => !c.alive && c.death && (c.dynasty || c.faction === 'player') && s.week - c.death.week <= 6 && !fam(s, c.id).wed);
  return [];
}

export function activityCost(kind: ActivityKind, guests: number): number {
  const d = ACTIVITIES[kind];
  return d.baseCost + d.perGuest * guests;
}

/** Why this activity can't be hosted right now (undefined = it can). */
export function activityBlock(s: GameState, kind: ActivityKind, guests: string[], honoreeId?: string): string | undefined {
  const def = ACTIVITIES[kind];
  if (s.dyn?.activity) return `Already hosting ${ACTIVITIES[s.dyn.activity.kind].name.toLowerCase()}`;
  if (!cooldownReady(s, `act_${kind}`, def.cooldown)) return `Hosted one too recently`;
  if (kind === 'clambake' && !isInSeason(s.date)) return 'Only in the season (Memorial Day to Labor Day)';
  const needs = kind === 'wedding' || kind === 'christening' || kind === 'funeral';
  const hon = honoreeOptions(s, kind);
  if (needs && !hon.length) return kind === 'wedding' ? 'No recent marriage in the house to celebrate' : kind === 'christening' ? 'No baby to christen' : 'No one in the house or crew has died lately';
  if (needs && honoreeId && !hon.some((c) => c.id === honoreeId)) return 'Not a fitting occasion';
  if (guests.length < 1) return 'Invite at least one guest';
  if (guests.length > def.maxGuests) return `At most ${def.maxGuests} guests`;
  const ok = new Set(eligibleGuests(s, kind).map((c) => c.id));
  if (guests.some((g) => !ok.has(g))) return 'Someone on the list can\'t come';
  return undefined;
}

/** Engine-side: start hosting (money is charged by the order's effects). */
export function startActivity(ctx: Ctx, kind: ActivityKind, guests: string[], honoreeId?: string): ActiveActivity {
  const s = ctx.s;
  const d = ensureDynState(s);
  const def = ACTIVITIES[kind];
  const hon = honoreeId ?? honoreeOptions(s, kind)[0]?.id;
  const a: ActiveActivity = { id: `act${s.nextId++}`, kind, hostId: s.playerId, guests: [...guests], honoreeId: hon, startWeek: s.week, endWeek: s.week + def.weeks, cost: activityCost(kind, guests.length) };
  d.activity = a;
  setCooldown(s, `act_${kind}`);
  ctx.log.push(`Invitations go out: ${def.name.toLowerCase()} at ${def.place}.`);
  return a;
}

/* ---------------------------------------------------------------- */
/* Outcomes                                                           */
/* ---------------------------------------------------------------- */

type OutcomeKey = 'deal' | 'pact' | 'insult' | 'overheard' | 'wire' | 'hit' | 'romance' | 'toast' | 'godfather' | 'condolence' | 'catch';

interface Outcome {
  key: OutcomeKey;
  weight: (s: GameState, a: ActiveActivity) => number;
  build: (s: GameState, a: ActiveActivity) => EventInstance | undefined;
}

function guestsOf(s: GameState, a: ActiveActivity): Character[] {
  return a.guests.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
}

function ev(s: GameState, a: ActiveActivity, key: string, title: string, text: string, choices: Choice[], actors: string[]): EventInstance {
  return {
    iid: `ev${s.nextId++}`, defId: `act_${key}`, week: s.week, mandatory: true, priority: 62,
    title: `${ACTIVITIES[a.kind].name}: ${title}`, text, defaultChoiceId: choices[0].id, meta: { activity: a.kind }, actors: actors.slice(0, 3), choices,
  };
}

const outsiders = (s: GameState, a: ActiveActivity) => guestsOf(s, a).filter((g) => { const k = guestGroup(s, g); return k === 'rivals' || k === 'officials' || k === 'houses'; });
const houseHeads = (s: GameState, a: ActiveActivity) => guestsOf(s, a).filter((g) => { const h = houseOf(s, g.id); return h && h.headId === g.id && !alliedHouse(s, h.id); });

function secretOf(s: GameState, c: Character) {
  return s.secrets.find((x) => x.ownerId === c.id && !x.knownBy.includes('player'));
}

const OUTCOMES: Outcome[] = [
  {
    key: 'deal',
    weight: (s, a) => outsiders(s, a).length ? (a.kind === 'wedding' || a.kind === 'funeral' ? 4 : 2) : 0,
    build: (s, a) => {
      const g = pick(ensureDynState(s), outsiders(s, a));
      const official = !!g.office;
      const amt = Math.round((1500 + rand(ensureDynState(s)) * 3500) / 100) * 100;
      const label = `${ACTIVITIES[a.kind].name}: a deal with ${g.firstName} ${g.lastName}`;
      return ev(s, a, 'deal', 'A word by the coat check', `${displayName(g)} finds you by the coat check. ${official ? 'He has a contract that needs a friend — and a friend who needs a favor.' : 'He has a load coming in and a buyer who wants a partner.'}`, [
        { id: 'take', label: 'Shake on it', because: `made a deal with ${g.firstName} ${g.lastName} at ${ACTIVITIES[a.kind].name.toLowerCase()}`, effects: [
          { type: 'money', amount: amt, label },
          ...(official ? [{ type: 'favor', amount: 1, label } as Effect] : [{ type: 'heat', bar: 'local', amount: 2, label } as Effect]),
          { type: 'opinion', from: g.id, to: s.playerId, amount: 8, reason: 'Did business with me', decay: 1, label },
        ] },
        { id: 'pass', label: 'Not tonight', because: 'kept the party a party', effects: [{ type: 'opinion', from: g.id, to: s.playerId, amount: -3, reason: 'Turned down my offer', decay: 1, label }] },
      ], [g.id]);
    },
  },
  {
    key: 'pact',
    weight: (s, a) => houseHeads(s, a).length ? (a.kind === 'wedding' ? 4 : 2) : 0,
    build: (s, a) => {
      const g = pick(ensureDynState(s), houseHeads(s, a));
      const h = houseOf(s, g.id)!;
      const label = `${ACTIVITIES[a.kind].name}: a toast with ${h.name}`;
      return ev(s, a, 'pact', 'An alliance sealed', `${displayName(g)} raises his glass to both families and holds your eye a moment too long. ${h.name} would stand with you — for a year, on a handshake.`, [
        { id: 'seal', label: 'Seal it with a handshake', detail: 'A pact for a year: they won\'t move on you, they\'ll stand with you.', because: `sealed a pact with ${h.name}`, effects: [
          { type: 'dyn', op: { op: 'alliance', houseId: h.id, weeks: 52 }, label },
          { type: 'opinion', from: g.id, to: s.playerId, amount: 12, reason: 'Shook on it', decay: 1, label },
          { type: 'dyn', op: { op: 'renown', amount: 20, reason: `A pact with ${h.name}` }, label },
        ] },
        { id: 'friendly', label: 'Keep it friendly', because: 'kept it friendly', effects: [{ type: 'opinion', from: g.id, to: s.playerId, amount: 4, reason: 'A good evening', decay: 1, label }] },
      ], [g.id]);
    },
  },
  {
    key: 'insult',
    weight: (s, a) => guestsOf(s, a).length >= 2 && guestsOf(s, a).some((g) => hasTrait(g, 'Hot-headed') || hasTrait(g, 'Cruel') || hasTrait(g, 'Drinker')) ? 3 : guestsOf(s, a).length >= 3 ? 1 : 0,
    build: (s, a) => {
      const d = ensureDynState(s);
      const gs = guestsOf(s, a);
      const hot = gs.filter((g) => hasTrait(g, 'Hot-headed') || hasTrait(g, 'Cruel') || hasTrait(g, 'Drinker'));
      const x = hot.length ? pick(d, hot) : pick(d, gs);
      const others = gs.filter((g) => g.id !== x.id);
      if (!others.length) return undefined;
      const y = others.sort((p, q) => opinion(s, x.id, p.id) - opinion(s, x.id, q.id))[0];
      const label = `${ACTIVITIES[a.kind].name}: ${x.firstName} insulted ${y.firstName}`;
      return ev(s, a, 'insult', 'A guest insulted', `Three drinks in, ${displayName(x)} said something about ${displayName(y)}'s mother that the whole room heard. The band stopped playing.`, [
        { id: 'apologize', label: `Make ${x.firstName} apologize`, because: `made ${x.firstName} apologize to ${y.firstName}`, effects: [
          { type: 'opinion', from: x.id, to: s.playerId, amount: -10, reason: 'Humiliated me in front of everyone', decay: 1, label },
          { type: 'opinion', from: y.id, to: s.playerId, amount: 10, reason: 'Stood up for me', decay: 1, label },
          { type: 'opinion', from: y.id, to: x.id, amount: -10, reason: 'Insulted my mother', decay: 1, label },
        ] },
        { id: 'laugh', label: 'Laugh it off', because: 'laughed off an insult at the party', effects: [
          { type: 'opinion', from: y.id, to: s.playerId, amount: -6, reason: 'Let him insult me', decay: 1, label },
          { type: 'opinion', from: y.id, to: x.id, amount: -20, reason: 'Insulted my mother', decay: 1, label },
          { type: 'respect', amount: -1, label },
        ] },
        { id: 'out', label: `Throw ${x.firstName} out`, because: `threw ${x.firstName} out of the party`, effects: [
          { type: 'opinion', from: x.id, to: s.playerId, amount: -20, reason: 'Threw me out', decay: 1, label },
          { type: 'meter', from: x.id, to: s.playerId, meter: 'grievance', amount: 15, label },
          { type: 'respect', amount: 1, label },
        ] },
      ], [x.id, y.id]);
    },
  },
  {
    key: 'overheard',
    weight: (s, a) => guestsOf(s, a).some((g) => secretOf(s, g)) ? 3 : 0,
    build: (s, a) => {
      const g = pick(ensureDynState(s), guestsOf(s, a).filter((x) => secretOf(s, x)));
      const sec = secretOf(s, g)!;
      const label = `${ACTIVITIES[a.kind].name}: something overheard`;
      return ev(s, a, 'overheard', 'Someone overhears', `In the hallway by the phones your wife's cousin heard ${displayName(g)} on the line. It turns out ${sec.text}.`, [
        { id: 'file', label: 'File it away', detail: 'A weak hook on him.', because: `learned ${g.firstName}'s secret at a party`, effects: [
          { type: 'secretKnown', secretId: sec.id, label },
          { type: 'hook', targetId: g.id, strong: false, reason: `You know ${sec.kind === 'affair' ? 'about the other woman' : 'his secret'}`, label },
        ] },
        { id: 'tell', label: 'Let him know you know', detail: 'A strong hook, and he will hate you for it.', because: `let ${g.firstName} know you knew his secret`, effects: [
          { type: 'secretKnown', secretId: sec.id, label },
          { type: 'hook', targetId: g.id, strong: true, reason: 'You know what he did', label },
          { type: 'opinion', from: g.id, to: s.playerId, amount: -15, reason: 'Holds my secret over me', decay: 0, label },
        ] },
      ], [g.id]);
    },
  },
  {
    key: 'wire',
    weight: (s, a) => (a.kind === 'club500' || a.kind === 'wedding' || a.kind === 'funeral') && s.heat.federal >= 30 ? 2 : 0,
    build: (s, a) => {
      const label = `${ACTIVITIES[a.kind].name}: the FBI photographers`;
      return ev(s, a, 'wire', 'Photographers across the street', 'A man with a Speed Graphic is taking pictures from a parked Ford. Every guest who walked in tonight is going into a file in Newark.', [
        { id: 'pay', label: 'Buy the negatives ($1,000)', detail: 'A local stringer, not the Bureau. Probably.', because: 'bought the photographer\'s negatives', effects: [{ type: 'money', amount: -1000, label }, { type: 'heat', bar: 'federal', amount: -2, label }] },
        { id: 'wave', label: 'Wave for the camera', because: 'waved at the FBI', effects: [{ type: 'heat', bar: 'federal', amount: 5, label }, { type: 'respect', amount: 1, label }] },
      ], []);
    },
  },
  {
    key: 'hit',
    weight: (s) => s.wars.length || s.rivals.some((r) => r.feud) ? 2 : 0,
    build: (s, a) => {
      const d = ensureDynState(s);
      const enemy = s.rivals.find((r) => s.wars.some((w) => w.rival === r.id)) ?? s.rivals.find((r) => r.feud);
      if (!enemy) return undefined;
      const w = s.wars.find((x) => x.rival === enemy.id);
      const men = guestsOf(s, a).filter((g) => g.faction === 'player' && g.rank !== 'civilian');
      const hurt = men.length ? pick(d, men) : undefined;
      const label = `${ACTIVITIES[a.kind].name}: trouble outside`;
      return ev(s, a, 'hit', 'A car slows outside', `A black Chrysler rolls past ${ACTIVITIES[a.kind].place} twice with the lights off. ${enemy.shortName}'s people, everyone says. The guests have gone quiet.`, [
        { id: 'kitchen', label: 'Out through the kitchen', because: 'left the party through the kitchen', effects: [{ type: 'respect', amount: -2, label }] },
        { id: 'stand', label: 'Stand in the doorway', detail: hurt ? `${hurt.firstName} goes out first.` : undefined, because: `stood your ground against ${enemy.shortName}`, effects: [
          { type: 'respect', amount: 4, label },
          ...(hurt ? [{ type: 'health', charId: hurt.id, amount: -15, label: `${label}: ${hurt.firstName} was hurt` } as Effect] : []),
        ] },
        { id: 'hunt', label: 'Send men after the car', because: `sent men after ${enemy.shortName}'s car`, effects: [
          { type: 'heat', bar: 'local', amount: 5, label },
          ...(w ? [{ type: 'warScore', warId: w.id, amount: 8, label } as Effect] : [{ type: 'rivalResource', rival: enemy.id, muscle: -6, label } as Effect]),
        ] },
      ], hurt ? [hurt.id] : []);
    },
  },
  {
    key: 'romance',
    weight: (s, a) => (a.kind === 'wedding' || a.kind === 'clambake' || a.kind === 'christening') && romancePair(s, a) ? 3 : 0,
    build: (s, a) => {
      const pair = romancePair(s, a);
      if (!pair) return undefined;
      const [ours, theirs] = pair;
      const h = houseOf(s, theirs.id);
      const label = `${ACTIVITIES[a.kind].name}: ${ours.firstName} and ${theirs.firstName}`;
      return ev(s, a, 'romance', 'Every dance', `${displayName(ours)} and ${theirs.firstName} ${theirs.lastName}${h ? ` of ${h.name}` : ''} danced every dance and did not care who was watching. ${h ? `${s.characters[h.headId]?.firstName ?? 'Her father'} is watching.` : ''}`, [
        { id: 'match', label: 'Make the match', detail: 'Both families can see it. No haggling.', because: `let ${ours.firstName} marry for love`, effects: [
          { type: 'dyn', op: { op: 'marry', memberId: ours.id, spouseId: theirs.id }, label },
          { type: 'opinion', from: ours.id, to: s.playerId, amount: 20, reason: 'Let me marry for love', decay: 1, label },
        ] },
        { id: 'no', label: 'Not that one', because: `forbade ${ours.firstName}'s romance`, effects: [{ type: 'opinion', from: ours.id, to: s.playerId, amount: -15, reason: 'Broke my heart', decay: 1, label }, { type: 'dyn', op: { op: 'stress', charId: ours.id, amount: 10, source: 'domestic' }, label }] },
      ], [ours.id, theirs.id]);
    },
  },
  {
    key: 'toast',
    weight: () => 2,
    build: (s, a) => {
      const label = `${ACTIVITIES[a.kind].name}: the toast`;
      const boss = player(s);
      return ev(s, a, 'toast', 'The toast', `Somebody puts a glass in your hand and the room goes quiet. ${boss.firstName}, say a few words.`, [
        { id: 'short', label: 'Short and sweet', because: 'gave a short toast', effects: [{ type: 'respect', amount: 2, label }] },
        { id: 'story', label: 'Tell the story of the house', because: 'told the story of the house', effects: [{ type: 'dyn', op: { op: 'renown', amount: 15, reason: 'Told the story of the house' }, label }, { type: 'familyOpinion', amount: 3, reason: 'Proud of the family', label }] },
      ], [boss.id]);
    },
  },
  {
    key: 'godfather',
    weight: (s, a) => a.kind === 'christening' && guestsOf(s, a).length ? 6 : 0,
    build: (s, a) => {
      const baby = a.honoreeId ? s.characters[a.honoreeId] : undefined;
      const gs = guestsOf(s, a).filter((g) => g.gender === 'M').slice(0, 3);
      if (!baby || !gs.length) return undefined;
      return ev(s, a, 'godfather', 'The godfather', `The priest asks who will stand as godfather to ${baby.firstName}. It is an honor nobody forgets — and a bond nobody can break.`, gs.map((g) => ({
        id: g.id, label: displayName(g), detail: guestGroup(s, g) === 'family' ? 'Keep it in the family.' : guestGroup(s, g) === 'crew' ? 'Bind him to the house.' : 'Bind his house to yours.',
        because: `made ${g.firstName} ${g.lastName} godfather to ${baby.firstName}`,
        effects: [{ type: 'opinion', from: g.id, to: s.playerId, amount: 30, reason: `Godfather to ${baby.firstName}`, decay: 0, label: `Christening: ${g.firstName} is godfather` }, { type: 'meter', from: g.id, to: s.playerId, meter: 'trust', amount: 15, label: `Christening: ${g.firstName} is godfather` }],
      })), gs.map((g) => g.id));
    },
  },
  {
    key: 'condolence',
    weight: (s, a) => a.kind === 'funeral' && guestsOf(s, a).some((g) => guestGroup(s, g) === 'rivals') ? 5 : 0,
    build: (s, a) => {
      const g = pick(ensureDynState(s), guestsOf(s, a).filter((x) => guestGroup(s, x) === 'rivals'));
      const r = s.rivals.find((x) => x.leaderId === g.id || x.id === g.faction);
      if (!r) return undefined;
      const w = s.wars.find((x) => x.rival === r.id);
      const label = `Wake: ${r.shortName} pays respects`;
      return ev(s, a, 'condolence', `${r.shortName} pays respects`, `${displayName(g)} kneels at the casket, then takes your hand in both of his. "Whatever is between us," he says, "not today."${w ? ' He means the war, too.' : ''}`, [
        { id: 'accept', label: 'Accept his condolences', because: `accepted ${r.shortName}'s condolences`, effects: [
          { type: 'rivalOpinion', rival: r.id, amount: 15, reason: 'Accepted my respects', label },
          ...(w ? [{ type: 'warEnd', warId: w.id, outcome: 'white', label } as Effect] : []),
          { type: 'familyOpinion', amount: -3, reason: 'Shook hands with our enemies at the wake', label },
        ] },
        { id: 'refuse', label: 'Turn your back on him', because: `turned your back on ${r.shortName} at the wake`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: -15, reason: 'Insulted me at the wake', label }, { type: 'respect', amount: 2, label }] },
      ], [g.id]);
    },
  },
  {
    key: 'catch',
    weight: (_s, a) => a.kind === 'fishing' ? 5 : 0,
    build: (s, a) => {
      const g = guestsOf(s, a)[0];
      const label = 'Fishing trip: out past the shoals';
      const sec = g ? secretOf(s, g) : undefined;
      return ev(s, a, 'catch', 'Out past the shoals', g ? `Twenty miles out, with the engine cut and the lines in, ${displayName(g)} starts to talk the way men only talk on a boat.` : 'Twenty miles out, alone with the gulls and the engine cut.', [
        { id: 'listen', label: 'Let him talk', because: 'listened on the boat', effects: g ? [
          { type: 'opinion', from: g.id, to: s.playerId, amount: 10, reason: 'Trusted me on the boat', decay: 1, label },
          { type: 'meter', from: g.id, to: s.playerId, meter: 'trust', amount: 10, label },
          ...(sec ? [{ type: 'secretKnown', secretId: sec.id, label } as Effect, { type: 'hook', targetId: g.id, strong: false, reason: 'What he told you on the boat', label } as Effect] : []),
        ] : [{ type: 'dyn', op: { op: 'stress', charId: s.playerId, amount: -10, source: 'paranoia' }, label }] },
        { id: 'fish', label: 'Just fish', because: 'just fished', effects: [{ type: 'dyn', op: { op: 'stress', charId: s.playerId, amount: -10, source: 'paranoia' }, label }] },
      ], g ? [g.id] : []);
    },
  },
];

function romancePair(s: GameState, a: ActiveActivity): [Character, Character] | undefined {
  const ours = ourMarriageable(s).filter((c) => c.id !== s.playerId && ageOn(c.birth, s.date) <= 35);
  if (!ours.length) return undefined;
  const theirsPool = guestsOf(s, a).filter((g) => !g.dynasty && !g.spouseId && houseOf(s, g.id) && ageOn(g.birth, s.date) >= 18 && ageOn(g.birth, s.date) <= 35);
  // Also the guests' unmarried children.
  for (const g of guestsOf(s, a)) {
    const h = houseOf(s, g.id);
    if (h && h.headId === g.id) for (const k of marriageable(s, h)) if (!theirsPool.includes(k)) theirsPool.push(k);
  }
  for (const o of ours) {
    const t = theirsPool.find((x) => x.gender !== o.gender);
    if (t) return [o, t];
  }
  return undefined;
}

/** Engine-side: the activity ends — opinions, relief, renown, and 1-3 events. */
export function finishActivity(ctx: Ctx): EventInstance[] {
  const s = ctx.s;
  const d = ensureDynState(s);
  const a = d.activity;
  if (!a || a.endWeek > s.week) return [];
  d.activity = undefined;
  const def = ACTIVITIES[a.kind];
  const host = s.characters[a.hostId]?.alive ? s.characters[a.hostId] : player(s);
  const gs = guestsOf(s, a);
  for (const g of gs) addOpinion(s, g.id, host.id, `Enjoyed ${def.name.toLowerCase()}`, def.opinion, 1);
  if (a.honoreeId && s.characters[a.honoreeId]?.alive) addOpinion(s, a.honoreeId, host.id, `Honored by ${def.name.toLowerCase()}`, def.opinion, 1);
  addStress(s, host.id, -def.relief, 'domestic');
  const renown = def.renown * (hasPerk(s, 'name', 4) ? 1.5 : 1) + gs.length * 2;
  gainRenown(s, renown, `Hosted ${def.name.toLowerCase()}`);
  if (a.honoreeId) {
    const hp = famMut(s, a.honoreeId);
    if (a.kind === 'wedding') {
      hp.wed = true;
      const sp = s.characters[a.honoreeId]?.spouseId;
      if (sp) famMut(s, sp).wed = true;
    }
    if (a.kind === 'christening') hp.christened = true;
    if (a.kind === 'funeral') hp.wed = true; // "honored": no second wake
  }
  // What happened at the party.
  const n = Math.min(3, Math.max(def.minOutcomes, 1 + (gs.length >= 4 ? 1 : 0) + (rand(d) < 0.3 ? 1 : 0)));
  const out: EventInstance[] = [];
  const used = new Set<OutcomeKey>();
  for (let i = 0; i < n; i++) {
    const avail = OUTCOMES.filter((o) => !used.has(o.key));
    const o: Outcome | undefined = weightedPick(d, shuffle(d, avail), (x) => x.weight(s, a));
    if (!o) break;
    used.add(o.key);
    const e = o.build(s, a);
    if (e) out.push(e);
  }
  d.stats.activities++;
  d.activityLog.push({ week: s.week, kind: a.kind, guests: a.guests, outcomes: out.map((e) => e.title.replace(/^[^:]+: /, '')) });
  if (d.activityLog.length > 20) d.activityLog = d.activityLog.slice(-20);
  const text = `The house hosted ${def.name.toLowerCase()} at ${def.place}${gs.length ? ` for ${gs.map((g) => g.firstName + ' ' + g.lastName).slice(0, 4).join(', ')}${gs.length > 4 ? ' and others' : ''}` : ''}.`;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'family' });
  ctx.log.push(text);
  return out;
}

/** Suggested guest list (for the sim and as a default in the UI). */
export function suggestGuests(s: GameState, kind: ActivityKind): string[] {
  const def = ACTIVITIES[kind];
  const pool = eligibleGuests(s, kind);
  const score = (c: Character) => {
    const g = guestGroup(s, c);
    return (g === 'family' ? 3 : g === 'crew' ? (c.rank === 'capo' ? 3 : 1) : g === 'houses' ? 2 : 2) - Math.max(-2, Math.min(2, opinion(s, c.id, s.playerId) / 25));
  };
  return pool.sort((x, y) => score(y) - score(x)).slice(0, Math.min(def.maxGuests, kind === 'sunday' ? 4 : 5)).map((c) => c.id);
}

export { crew, houseLabel };
