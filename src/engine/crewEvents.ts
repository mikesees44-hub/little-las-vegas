import { xpPoachBonus } from './crewXp';
import { bonesLine, mayPropose } from './bones';
import { ageOn, seasonMultiplier } from './calendar';
import { capos, crew, displayName, hasTrait, makeCharacter } from './characters';
import { CAPO_CUT } from './economy';
import {
  available, capoLoyalty, capoOf, grownSons, hasVice, inRegimeRank, regime, smallestRegime, validCapo,
} from './hierarchy';
import { FEMALE_FIRST, MALE_FIRST, SURNAMES } from './names';
import { getRelation, opinion } from './relations';
import { chance, pick, randInt, shuffle, weightedPick } from './rng';
import { needsSanction, sanctioned } from './schemes';
import { FACTION_NAMES } from './world';
import { freshness, markLetShown } from './storyDirector';
import { markKinShown } from './housesEvents';
import type { Character, Choice, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * Crew-driven decisions. Every week the men of the family bring things to
 * the boss: proposals, requests, disputes between themselves, problems.
 * Each is generated from someone's state (traits, goal, vices, household,
 * evidence, grudges) and shows the people involved. Per-event and
 * per-character cooldowns keep the same thing from coming back too often.
 */

export interface CrewEventDef {
  key: string;
  /** Weeks before this kind of decision can come up again. */
  cooldown: number;
  weight: (s: GameState) => number;
  /** Who could bring it (already filtered for availability), best first. */
  subjects: (s: GameState) => Character[];
  build: (s: GameState, c: Character) => EventInstance | undefined;
}

export const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const r100 = (n: number) => Math.max(100, Math.round(n / 100) * 100);

/** "Leo 'Two Times'" — first name and nickname, for running text. */
export function callName(c: Character): string {
  return c.nickname ? `${c.firstName} "${c.nickname}"` : c.firstName;
}

function iid(s: GameState): string {
  return `ev${s.nextId++}`;
}

export function make(s: GameState, defId: string, c: Character, title: string, text: string, choices: Choice[], def: string, actors: string[] = [], priority = 48): EventInstance {
  return {
    iid: iid(s), defId, week: s.week, mandatory: false, priority, title, text, choices, defaultChoiceId: def,
    meta: { charId: c.id, crew: 1 }, actors: [c.id, ...actors.filter((a) => a !== c.id)].slice(0, 3),
  };
}

export function op(s: GameState, a: Character, b: Character | string): number {
  return opinion(s, a.id, typeof b === 'string' ? b : b.id);
}

export function mobRivals(s: GameState) {
  return s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
}

/** A rival with a foothold in a district, and that district. */
export function rivalFoothold(s: GameState, prefer?: string): { rival: RivalId; district: string } | undefined {
  const opts: { rival: RivalId; district: string; w: number }[] = [];
  for (const d of s.districts) {
    for (const r of mobRivals(s)) {
      const v = d.influence[r.id] ?? 0;
      if (v >= 6) opts.push({ rival: r.id, district: d.id, w: v + (d.id === prefer ? 40 : 0) + (d.influence.player ?? 0) / 3 });
    }
  }
  return weightedPick(s, opts, (o) => o.w);
}

let menMemo: { s: GameState; list: Character[] } | undefined;

export function men(s: GameState): Character[] {
  if (menMemo && menMemo.s === s) return menMemo.list;
  return crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate' || c.rank === 'capo') && !c.specialty);
}

const RACKETS = [
  { what: 'card game above the Anchor Bar', short: 'card game' },
  { what: 'policy bank behind the bus depot', short: 'policy bank' },
  { what: 'crap game in the back of the Ship\'s Wheel', short: 'crap game' },
  { what: 'jukebox and cigarette-machine route', short: 'vending route' },
  { what: 'wire room over the Rio Grande barbershop', short: 'wire room' },
];

/* ------------------------------------------------------------------ */
/* Proposals                                                           */
/* ------------------------------------------------------------------ */

const takeRacket: CrewEventDef = {
  key: 'crew_proposal',
  cooldown: 3,
  weight: (s) => (mobRivals(s).length ? 6 : 0),
  subjects: (s) => capos(s).filter((c) => available(s, c) && op(s, c, s.playerId) > -30)
    .sort((a, b) => Number(hasTrait(b, 'Ambitious') || hasTrait(b, 'Hot-headed')) - Number(hasTrait(a, 'Ambitious') || hasTrait(a, 'Hot-headed'))),
  build: (s, c) => {
    const d0 = s.districts.find((d) => d.capoId === c.id);
    const fh = rivalFoothold(s, d0?.id);
    if (!fh) return undefined;
    const r = s.rivals.find((x) => x.id === fh.rival)!;
    const d = s.districts.find((x) => x.id === fh.district)!;
    const rk = pick(s, RACKETS);
    const nMen = Math.max(2, Math.min(4, Math.round(2 + r.muscle / 40)));
    const cost = r100((800 + r.muscle * 15) * (s.money > 40000 ? 1.4 : 1));
    const nm = callName(c);
    const label = `${c.firstName}'s play for ${r.shortName}'s ${rk.short}`;
    const params = { capo: c.id, rival: r.id, district: d.id, racket: rk.short, men: nMen };
    const ambitious = hasTrait(c, 'Ambitious');
    return make(s, 'crew_proposal', c, `${nm} wants ${r.shortName}'s ${rk.short}`,
      `${displayName(c)} has been watching ${r.shortName}'s ${rk.what} in ${d.name} for weeks. "It's soft. Give me ${nMen} men and ${fmt(cost)} and it's ours by the weekend." ${ambitious ? 'He has been saying for a year that he is wasted where he is.' : ''}`.trim(),
      [
        {
          id: 'through', label: `Back him — let ${c.firstName} run it`, detail: `Insulated: it is his crew's play. He may go further than you would like.`,
          because: `backed ${c.firstName}'s play for ${r.shortName}'s ${rk.short}`,
          effects: [
            { type: 'money', amount: -cost, label },
            { type: 'opinion', from: c.id, to: s.playerId, amount: 8, reason: 'Backed my play', decay: 1, label },
            { type: 'schedule', key: 'crew_job', minWeeks: 1, maxWeeks: 2, chance: 1, hint: `${c.firstName} makes his move`, params: { ...params, via: 'capo' }, label },
          ],
        },
        {
          id: 'direct', label: 'Run it yourself', detail: 'Faster and better odds — but your fingerprints are on it.',
          because: `personally took ${r.shortName}'s ${rk.short}`,
          effects: [
            { type: 'money', amount: -cost, label },
            { type: 'evidence', charId: s.playerId, amount: 5, label },
            { type: 'opinion', from: c.id, to: s.playerId, amount: -3, reason: 'Took my play away from me', decay: 1, label },
            { type: 'schedule', key: 'crew_job', minWeeks: 1, maxWeeks: 1, chance: 1, hint: 'your men make the move', params: { ...params, via: 'direct' }, label },
          ],
        },
        {
          id: 'self', label: 'Let him do it on his own dime', detail: `He pays (${fmt(cost)} of his own); most of it stays in his pocket.`,
          because: `let ${c.firstName} make his own play`,
          disabledReason: c.wealth < cost ? `${c.firstName} only has ${fmt(c.wealth)}` : undefined,
          effects: [
            { type: 'wealth', charId: c.id, amount: -cost, label },
            { type: 'schedule', key: 'crew_job', minWeeks: 1, maxWeeks: 3, chance: 1, hint: `${c.firstName} makes his move`, params: { ...params, via: 'own' }, label },
          ],
        },
        {
          id: 'no', label: 'Not now', because: `told ${c.firstName} to leave ${r.shortName} alone`,
          effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: ambitious ? -10 : -5, reason: 'Sat on my plan', decay: 1, label }],
        },
      ], 'through', [r.leaderId]);
  },
};

const ownBar: CrewEventDef = {
  key: 'crew_bar',
  cooldown: 10,
  weight: () => 3,
  subjects: (s) => men(s).filter((c) => available(s, c) && c.goal === 'own_bar' && c.wealth >= 4000),
  build: (s, c) => {
    const bar = pick(s, ['the Anchor Inn on Rio Grande', 'a corner tap room on New Jersey Avenue', 'the Surf Club\'s old bar', 'a clam bar on the bay side']);
    const price = r100(Math.min(c.wealth, 4000 + randInt(s, 0, 2500)));
    const label = `${c.firstName}'s bar`;
    return make(s, 'crew_bar', c, `${callName(c)} wants a bar of his own`,
      `${displayName(c)} has had his eye on ${bar} since he was a kid. He has ${fmt(c.wealth)} put away and wants your blessing to buy it with his own money. He would kick up a little every week.`,
      [
        { id: 'bless', label: 'Give him your blessing', because: `blessed ${c.firstName}'s bar`, effects: [{ type: 'wealth', charId: c.id, amount: -price, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 16, reason: 'Let me have my bar', decay: 1, label }, { type: 'goalSet', charId: c.id, goal: 'get_rich', label }, { type: 'story', charId: c.id, text: `Bought ${bar} with his own money, with the boss's blessing.`, label }, { type: 'respect', amount: 1, label }] },
        { id: 'take', label: 'The family buys it; he runs it', detail: 'You own it. He resents it a little.', because: `took ${c.firstName}'s bar for the family`, disabledReason: s.money < 5000 ? 'Needs $5,000' : undefined, effects: [{ type: 'money', amount: -5000, label }, { type: 'flag', key: 'barFromCrew', value: 1, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -8, reason: 'Took my bar away from me', decay: 1, label }, { type: 'story', charId: c.id, text: `Found ${bar}; the family bought it out from under him.`, label }, { type: 'schedule', key: 'crew_bar_opens', minWeeks: 1, maxWeeks: 1, chance: 1, hint: 'the bar opens under the family', params: { charId: c.id }, label }] },
        { id: 'no', label: 'He is needed on the street', because: `refused ${c.firstName} his bar`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -10, reason: 'Would not let me have my bar', decay: 1, label }] },
      ], 'bless');
  },
};

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

const biggerCut: CrewEventDef = {
  key: 'crew_cut',
  cooldown: 6,
  weight: () => 4,
  subjects: (s) => capos(s).filter((c) => available(s, c, 8) && (hasTrait(c, 'Greedy') || hasTrait(c, 'Ambitious') || (c.keep ?? CAPO_CUT) < 0.3) && (c.keep ?? CAPO_CUT) < 0.45),
  build: (s, c) => {
    const keep = c.keep ?? CAPO_CUT;
    const n = regime(s, c.id).length;
    const label = `${c.firstName} wants a bigger end`;
    return make(s, 'crew_cut', c, `${callName(c)} wants a bigger end`,
      `${displayName(c)} kicks up ${Math.round((1 - keep) * 100)}% of everything his ${n}-man crew brings in. "My guys are carrying this family. I want to keep ${Math.round((keep + 0.05) * 100)}%."`,
      [
        { id: 'grant', label: `Let him keep ${Math.round((keep + 0.05) * 100)}%`, because: `raised ${c.firstName}'s end`, effects: [{ type: 'contract', charId: c.id, keep: Math.round((keep + 0.05) * 100) / 100, label }, { type: 'crewOpinion', amount: 0, reason: 'The boss gives a capo what he asks', traitMods: { Greedy: 2 }, label }] },
        { id: 'envelope', label: 'An envelope instead ($750)', detail: 'The contract stays.', because: `paid ${c.firstName} off instead of raising his end`, effects: [{ type: 'money', amount: -750, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 7, reason: 'Took care of me this once', decay: 2, label }] },
        { id: 'no', label: 'Tell him to be grateful', because: `refused ${c.firstName} a bigger end`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -12, reason: 'Refused me a bigger end', decay: 1, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 10, label }] },
      ], 'envelope');
  },
};

const promotion: CrewEventDef = {
  key: 'crew_promotion',
  cooldown: 8,
  weight: () => 3,
  subjects: (s) => crew(s).filter((c) => c.rank === 'soldier' && !c.specialty && available(s, c, 10) && c.goal === 'become_capo' && c.attributes.leadership >= 45 && op(s, c, s.playerId) > -20),
  build: (s, c) => {
    const k = capoOf(s, c);
    const free = s.districts.find((d) => (!d.capoId || !validCapo(s, d.capoId)) && (d.influence.player ?? 0) >= 40);
    const label = `${c.firstName} asks for a crew`;
    const choices: Choice[] = [];
    if (free) {
      choices.push({ id: 'district', label: `Give him ${free.name}`, because: `made ${c.firstName} capo of ${free.name}`, effects: [{ type: 'rank', charId: c.id, rank: 'capo', district: free.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 22, reason: 'Made me a capo', decay: 1, label }, { type: 'goalSet', charId: c.id, goal: 'get_rich', label }, { type: 'story', charId: c.id, text: `Made capo of ${free.name}.`, label }, ...(k ? [{ type: 'opinion', from: k.id, to: s.playerId, amount: -6, reason: `Took ${c.firstName} out of my crew`, decay: 1, label } as Effect] : [])] });
    }
    const big = capos(s).filter((x) => regime(s, x.id).length >= 4).sort((a, b) => regime(s, b.id).length - regime(s, a.id).length)[0];
    if (big) {
      const split = regime(s, big.id).filter((m) => m.id !== c.id).slice(-2);
      choices.push({
        id: 'split', label: `Split ${big.firstName}'s crew and give him half`, detail: `${split.map((m) => m.firstName).join(' and ')} go with him. ${big.firstName} will not like it.`,
        because: `split ${big.firstName}'s crew to make ${c.firstName} a capo`,
        effects: [{ type: 'rank', charId: c.id, rank: 'capo', label }, ...split.map((m) => ({ type: 'assign', charId: m.id, capoId: c.id, label }) as Effect), { type: 'opinion', from: c.id, to: s.playerId, amount: 20, reason: 'Made me a capo', decay: 1, label }, { type: 'opinion', from: big.id, to: s.playerId, amount: -14, reason: 'Split my crew', decay: 1, label }, { type: 'opinion', from: big.id, to: c.id, amount: -15, reason: 'Took half my crew', decay: 1, label }, { type: 'goalSet', charId: c.id, goal: 'get_rich', label }, { type: 'story', charId: c.id, text: `Made capo with men split off from ${displayName(big)}'s crew.`, label }],
      });
    }
    choices.push(
      { id: 'later', label: 'Not yet — prove it first', because: `told ${c.firstName} to wait for a crew`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -6, reason: 'Keeps me waiting for a crew', decay: 1, label }] },
      { id: 'never', label: 'He is a soldier, not a capo', because: `told ${c.firstName} he would never run a crew`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -18, reason: 'Told me I will never run a crew', decay: 1, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 15, label }, { type: 'goalSet', charId: c.id, goal: hasTrait(c, 'Ambitious') ? 'take_chair' : 'get_out', label }] },
    );
    return make(s, 'crew_promotion', c, `${callName(c)} wants his own crew`,
      `${displayName(c)} has been with ${k ? `${displayName(k)}'s crew` : 'you'} for years. He comes to you hat in hand: he wants to run his own men.${k ? ` ${k.firstName} ${op(s, k, c) > 10 ? 'speaks well of him' : 'does not want to lose him'}.` : ''}`,
      choices, 'later', k ? [k.id] : []);
  },
};

/** The man your soldier wants dead: usually one of a rival's street guys, sometimes one of their made men. */
function rivalMan(s: GameState): Character | undefined {
  const rs = mobRivals(s);
  if (!rs.length) return undefined;
  const made = Object.values(s.characters).filter((x) => x.alive && rs.some((r) => r.id === x.faction) && !rs.some((r) => r.leaderId === x.id));
  if (made.length && chance(s, 0.25)) return pick(s, made);
  const r = pick(s, rs);
  const street = Object.values(s.characters).find((x) => x.alive && x.faction === r.id && x.rank === 'associate');
  if (street) return street;
  const L = s.characters[r.leaderId];
  const c = makeCharacter(s, { rank: 'associate', faction: r.id, ethnicity: L.ethnicity, age: randInt(s, 22, 40) });
  c.ambition = `Get made in ${r.name}`;
  return c;
}

const hitPermission: CrewEventDef = {
  key: 'crew_hit',
  cooldown: 8,
  weight: () => 3,
  subjects: (s) => men(s).filter((c) => available(s, c, 8) && (hasTrait(c, 'Hot-headed') || hasTrait(c, 'Vengeful') || hasTrait(c, 'Cruel')) && c.rank !== 'associate'),
  build: (s, c) => {
    const t = rivalMan(s);
    if (!t) return undefined;
    const r = s.rivals.find((x) => x.id === t.faction)!;
    const why = pick(s, ['pistol-whipped his cousin outside the Starlight', 'shorted him on a load of cigarettes and laughed about it', 'said something about his wife at the Riptide', 'put his brother in the hospital last winter']);
    const made = needsSanction(s, t) && !sanctioned(s, t.id);
    const label = `${c.firstName} wants ${t.firstName} ${t.lastName}`;
    return make(s, 'crew_hit', c, `${callName(c)} asks permission`,
      `${displayName(c)} wants ${t.firstName} ${t.lastName}${t.rank === 'associate' ? `, one of ${r.shortName}'s street guys,` : ` of ${r.name}`} dead. The man ${why}. "Say the word and he goes in the bay."${made ? ' He is a made man: without the Table\'s sanction this starts a feud.' : ''}`,
      [
        { id: 'yes', label: 'Give him the word', because: `let ${c.firstName} kill ${t.firstName} ${t.lastName}`, effects: [{ type: 'kill', charId: t.id, cause: `killed by ${displayName(c)} over an insult`, killer: 'player', label }, { type: 'heat', bar: 'local', amount: 6, label }, { type: 'evidence', charId: c.id, amount: 18, label }, { type: 'evidence', charId: s.playerId, amount: 3, label }, { type: 'rivalOpinion', rival: r.id, amount: made ? -25 : -12, reason: `Killed ${t.firstName} ${t.lastName}`, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 15, reason: 'Let me settle my score', decay: 1, label }, { type: 'respect', amount: 2, label }, ...(made ? [{ type: 'feud', rival: r.id, label } as Effect] : [])] },
        { id: 'wait', label: 'Not yet. Wait for the right time.', because: `told ${c.firstName} to wait on ${t.firstName}`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -5, reason: 'Made me swallow an insult', decay: 1, label }, ...(hasTrait(c, 'Hot-headed') ? [{ type: 'schedule', key: 'goes_rogue', minWeeks: 2, maxWeeks: 6, chance: 0.4, hint: `${c.firstName} may not wait`, params: { charId: c.id, target: t.id }, label } as Effect] : [])] },
        { id: 'no', label: 'Absolutely not', because: `forbade ${c.firstName} to touch ${t.firstName}`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -12, reason: 'Would not let me settle my score', decay: 1, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 8, label }, ...(hasTrait(c, 'Hot-headed') ? [{ type: 'schedule', key: 'goes_rogue', minWeeks: 3, maxWeeks: 8, chance: 0.2, hint: `${c.firstName} may do it anyway`, params: { charId: c.id, target: t.id }, label } as Effect] : [])] },
      ], 'wait', [t.id]);
  },
};

const loanRequest: CrewEventDef = {
  key: 'crew_loan',
  cooldown: 5,
  weight: () => 3,
  subjects: (s) => men(s).filter((c) => available(s, c) && c.wealth < 1500 && (hasVice(c, 'horses') || hasVice(c, 'cards') || hasVice(c, 'debt') || (c.household?.kids.length ?? 0) >= 2)),
  build: (s, c) => {
    const amt = r100(randInt(s, 5, 15) * 100);
    const why = hasVice(c, 'horses') ? 'He had a bad month at the track and the rent is due' : hasVice(c, 'cards') ? 'He lost at a card game he should have walked away from' : (c.household?.kids.length ?? 0) >= 2 ? `His ${c.household!.kids.length} kids need shoes and the landlord is not patient` : 'He is behind on everything';
    const label = `Loan to ${c.firstName}`;
    return make(s, 'crew_loan', c, `${callName(c)} needs ${fmt(amt)}`,
      `${displayName(c)} asks to see you alone. ${why}. He needs ${fmt(amt)} and he would rather owe you than a shylock.`,
      [
        { id: 'lend', label: `Lend it to him`, because: `lent ${c.firstName} ${fmt(amt)}`, effects: [{ type: 'money', amount: -amt, label }, { type: 'wealth', charId: c.id, amount: amt, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 10, reason: 'Lent me money when I needed it', decay: 1, label }, { type: 'schedule', key: 'loan_repaid', minWeeks: 6, maxWeeks: 12, chance: 1, hint: 'he should pay it back', params: { charId: c.id, amount: amt }, label }] },
        { id: 'gift', label: 'Give it to him — no strings', because: `gave ${c.firstName} ${fmt(amt)}`, effects: [{ type: 'money', amount: -amt, label }, { type: 'wealth', charId: c.id, amount: amt, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 18, reason: 'Gave me money when I needed it', decay: 1, label }] },
        { id: 'no', label: 'Tell him to sort it out', because: `turned ${c.firstName} away`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -8, reason: 'Turned me away when I needed help', decay: 1, label }, { type: 'schedule', key: 'goes_to_shylock', minWeeks: 1, maxWeeks: 3, chance: 0.6, hint: `${c.firstName} may borrow from a rival's shylock`, params: { charId: c.id, amount: amt }, label }] },
      ], 'lend');
  },
};

const KID_TROUBLE = [
  { t: (k: string) => `${k} got into nursing school at Hahnemann. Tuition is due before September.`, cost: 600 },
  { t: (k: string) => `${k} was picked up joyriding in a stolen Chevy. The arresting officer can be reasoned with.`, cost: 400 },
  { t: (k: string) => `${k} needs an operation at Children's Hospital in Philadelphia.`, cost: 900 },
  { t: (k: string) => `${k} wants to go to Villanova. The Augustinians want a donation.`, cost: 800 },
  { t: (k: string) => `${k} broke a boy's nose at Wildwood High. The boy's father is a county clerk and wants a lawsuit.`, cost: 500 },
  { t: (k: string) => `${k} is getting married, and the family of the groom expects a wedding at the Hotel Dorset.`, cost: 700 },
  { t: (k: string) => `${k} has rheumatic fever. The specialist in Philadelphia does not take a working man's money.`, cost: 700 },
];

const kidHelp: CrewEventDef = {
  key: 'crew_kid',
  cooldown: 6,
  weight: () => 3,
  subjects: (s) => men(s).filter((c) => available(s, c) && (c.household?.kids.length ?? 0) > 0),
  build: (s, c) => {
    const kid = pick(s, c.household!.kids);
    const age = s.date.y - kid.born;
    const opts = KID_TROUBLE.filter((_, i) => (i === 0 ? !kid.male && age >= 17 : i === 1 ? kid.male && age >= 15 : i === 3 ? age >= 17 : i === 4 ? kid.male && age >= 12 && age <= 18 : i === 5 ? !kid.male && age >= 18 : true));
    const v = pick(s, opts.length ? opts : [KID_TROUBLE[2]]);
    const k = capoOf(s, c);
    const label = `${c.firstName}'s ${kid.male ? 'son' : 'daughter'} ${kid.name}`;
    const choices: Choice[] = [
      { id: 'pay', label: `The family pays (${fmt(v.cost)})`, because: `took care of ${c.firstName}'s ${kid.male ? 'boy' : 'girl'}`, effects: [{ type: 'money', amount: -v.cost, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 18, reason: `Took care of my ${kid.male ? 'son' : 'daughter'}`, decay: 0, label }, { type: 'story', charId: c.id, text: `The boss took care of his ${kid.male ? 'son' : 'daughter'} ${kid.name}.`, label }] },
    ];
    if (k && k.wealth >= v.cost) {
      choices.push({ id: 'capo', label: `Let ${k.firstName} handle it`, detail: `His capo pays. ${c.firstName} will owe ${k.firstName}, not you.`, because: `left ${c.firstName}'s family trouble to ${k.firstName}`, effects: [{ type: 'wealth', charId: k.id, amount: -v.cost, label }, { type: 'opinion', from: c.id, to: k.id, amount: 20, reason: `Took care of my ${kid.male ? 'son' : 'daughter'}`, decay: 0, label }, { type: 'opinion', from: k.id, to: s.playerId, amount: -3, reason: 'Left me to pay for my men', decay: 1, label }, { type: 'story', charId: c.id, text: `${displayName(k)} took care of his ${kid.male ? 'son' : 'daughter'} ${kid.name}.`, label }] });
    }
    choices.push({ id: 'no', label: 'Family is his business', because: `stayed out of ${c.firstName}'s family trouble`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -6, reason: 'Did nothing for my family', decay: 1, label }] });
    return make(s, 'crew_kid', c, `${c.firstName}'s ${kid.male ? 'boy' : 'girl'}`, `${displayName(c)}'s ${kid.male ? 'son' : 'daughter'} ${v.t(kid.name)}`, choices, 'pay', k ? [k.id] : []);
  },
};

const regimeRequest: CrewEventDef = {
  key: 'crew_men',
  cooldown: 8,
  weight: () => 2.5,
  subjects: (s) => capos(s).filter((c) => available(s, c) && regime(s, c.id).length <= 1),
  build: (s, c) => {
    const donor = capos(s).filter((x) => x.id !== c.id && regime(s, x.id).length >= 3).sort((a, b) => regime(s, b.id).length - regime(s, a.id).length)[0];
    const label = `${c.firstName} needs men`;
    const choices: Choice[] = [];
    if (donor) {
      const m = regime(s, donor.id)[regime(s, donor.id).length - 1];
      choices.push({ id: 'move', label: `Move ${m.firstName} from ${donor.firstName}'s crew`, because: `moved ${m.firstName} into ${c.firstName}'s crew`, effects: [{ type: 'assign', charId: m.id, capoId: c.id, label }, { type: 'opinion', from: donor.id, to: s.playerId, amount: -6, reason: 'Took one of my men', decay: 1, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 6, reason: 'Gave me men', decay: 1, label }] });
    }
    choices.push(
      { id: 'recruit', label: 'Give him $600 to bring in new kids', because: `paid for ${c.firstName} to recruit`, effects: [{ type: 'money', amount: -600, label }, { type: 'schedule', key: 'recruits_arrive', minWeeks: 1, maxWeeks: 2, chance: 1, hint: 'new associates join his crew', label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 4, reason: 'Gave me men', decay: 1, label }] },
      { id: 'no', label: 'Make do', because: `told ${c.firstName} to make do`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -5, reason: 'Left my crew short-handed', decay: 1, label }] },
    );
    return make(s, 'crew_men', c, `${callName(c)} is short-handed`, `${displayName(c)} is down to ${regime(s, c.id).length || 'no'} m${regime(s, c.id).length === 1 ? 'an' : 'en'}. "I can't hold my end with nobody behind me."`, choices, donor ? 'move' : 'recruit', donor ? [donor.id] : []);
  },
};

/* ------------------------------------------------------------------ */
/* Disputes between your own men                                       */
/* ------------------------------------------------------------------ */

const DISPUTES = [
  'who keeps the jukebox route on Pacific Avenue', 'who collects from the Ocean Avenue bars', 'a $2,000 score each says was his idea',
  'a corner on the boardwalk both say they were promised', 'a debt one says the other never paid back', 'who gets the Crest motels for the summer',
];

export function disputePair(s: GameState): [Character, Character] | undefined {
  const pool = men(s).filter((c) => available(s, c, 4) && c.rank !== 'associate' && subjectOk(s, 'crew_dispute', c.id));
  let best: [Character, Character] | undefined;
  let worst = 8;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const v = opinion(s, pool[i].id, pool[j].id) + opinion(s, pool[j].id, pool[i].id);
      if (v < worst) {
        worst = v;
        best = [pool[i], pool[j]];
      }
    }
  }
  if (best) return best;
  if (pool.length >= 2) {
    const sh = shuffle(s, pool);
    return [sh[0], sh[1]];
  }
  return undefined;
}

const crewDispute: CrewEventDef = {
  key: 'crew_dispute',
  cooldown: 3,
  weight: () => 5,
  subjects: (s) => {
    const p = disputePair(s);
    return p ? [p[0]] : [];
  },
  build: (s, a) => {
    const p = disputePair(s);
    if (!p) return undefined;
    const b = p[0].id === a.id ? p[1] : p[0];
    const what = pick(s, DISPUTES);
    const label = `Dispute: ${a.firstName} and ${b.firstName}`;
    const side = (w: Character, l: Character): Effect[] => [
      { type: 'opinion', from: w.id, to: s.playerId, amount: 8, reason: 'Ruled for me', decay: 1, label },
      { type: 'opinion', from: l.id, to: s.playerId, amount: -12, reason: 'Ruled against me', decay: 1, label },
      { type: 'opinion', from: l.id, to: w.id, amount: -10, reason: `Got what was mine (${what.split(' ').slice(0, 4).join(' ')}…)`, decay: 1, label },
      { type: 'story', charId: w.id, text: `The boss ruled for him against ${displayName(l)}: ${what}.`, label },
      { type: 'story', charId: l.id, text: `The boss ruled against him in favor of ${displayName(w)}: ${what}.`, label },
    ];
    const ka = capoOf(s, a);
    const kb = capoOf(s, b);
    const crews = ka && kb && ka.id !== kb.id ? ` It is ${ka.firstName}'s crew against ${kb.firstName}'s.` : '';
    return make(s, 'crew_dispute', a, `${callName(a)} vs. ${callName(b)}`,
      `${displayName(a)} and ${displayName(b)} both want you to settle it: ${what}.${crews} Whichever way you rule, the other one will remember.`,
      [
        { id: 'a', label: `Rule for ${a.firstName}`, because: `ruled for ${a.firstName} against ${b.firstName}`, effects: side(a, b) },
        { id: 'b', label: `Rule for ${b.firstName}`, because: `ruled for ${b.firstName} against ${a.firstName}`, effects: side(b, a) },
        { id: 'split', label: 'Split it down the middle', because: `split the difference between ${a.firstName} and ${b.firstName}`, effects: [{ type: 'opinion', from: a.id, to: s.playerId, amount: -3, reason: 'Would not take a side', decay: 1, label }, { type: 'opinion', from: b.id, to: s.playerId, amount: -3, reason: 'Would not take a side', decay: 1, label }] },
        { id: 'family', label: 'Neither — it belongs to the family now', detail: 'Both lose. You gain.', because: `took what ${a.firstName} and ${b.firstName} were fighting over`, effects: [{ type: 'money', amount: r100(400 + 300 * seasonMultiplier(s.date)), label }, { type: 'opinion', from: a.id, to: s.playerId, amount: -8, reason: 'Took what we were fighting over', decay: 1, label }, { type: 'opinion', from: b.id, to: s.playerId, amount: -8, reason: 'Took what we were fighting over', decay: 1, label }, { type: 'meter', from: a.id, to: s.playerId, meter: 'fear', amount: 8, label }, { type: 'meter', from: b.id, to: s.playerId, meter: 'fear', amount: 8, label }] },
      ], 'split', [b.id]);
  },
};

/* ------------------------------------------------------------------ */
/* Problems                                                            */
/* ------------------------------------------------------------------ */

const pinched: CrewEventDef = {
  key: 'crew_pinched',
  cooldown: 7,
  weight: (s) => 1 + men(s).reduce((a, c) => a + (c.evidence ?? 0), 0) / 250 + s.heat.local / 40,
  subjects: (s) => men(s).filter((c) => available(s, c) && c.rank !== 'capo').sort((a, b) => (b.evidence ?? 0) - (a.evidence ?? 0)).slice(0, 3),
  build: (s, c) => {
    const beef = c.craft === 'bookmaker' ? 'a bookmaking beef' : c.craft === 'muscle' || c.craft === 'collector' ? 'an assault charge from a collection' : c.craft === 'burglar' ? 'a burglary in the Crest' : 'a gambling raid';
    const k = capoOf(s, c);
    const kids = c.household?.kids.length ?? 0;
    const label = `${c.firstName} got pinched`;
    return make(s, 'crew_pinched', c, `${callName(c)} got pinched`,
      `County detectives picked up ${displayName(c)} on ${beef}. They want to talk to him about a lot more than that.${c.household?.wife ? ` His wife ${c.household.wife}${kids ? ` and their ${kids} kid${kids > 1 ? 's' : ''}` : ''} are waiting to hear what you will do.` : ''}`,
      [
        { id: 'lawyer', label: 'Bail and a real lawyer ($1,500)', detail: 'He is home tonight and he knows you came through.', because: `got ${c.firstName} a lawyer`, effects: [{ type: 'money', amount: -1500, label }, { type: 'imprison', charId: c.id, weeks: 1, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 10, reason: 'Got me a lawyer', decay: 1, label }, { type: 'schedule', key: 'stand_up', minWeeks: 2, maxWeeks: 3, chance: 1, hint: 'will he stand up?', params: { charId: c.id, help: 2 }, label }] },
        { id: 'family', label: 'Take care of his family while he sits', detail: 'An envelope every week to his wife.', because: `took care of ${c.firstName}'s family while he sat`, effects: [{ type: 'money', amount: -600, label }, { type: 'imprison', charId: c.id, weeks: randInt(s, 8, 16), label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: 'Took care of my family while I sat', decay: 0, label }, { type: 'schedule', key: 'stand_up', minWeeks: 2, maxWeeks: 5, chance: 1, hint: 'will he stand up?', params: { charId: c.id, help: 1 }, label }] },
        { id: 'sit', label: 'Let him sit', because: `let ${c.firstName} sit in county`, effects: [{ type: 'imprison', charId: c.id, weeks: randInt(s, 16, 30), label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -12, reason: 'Left me to rot in county', decay: 1, label }, ...(k ? [{ type: 'opinion', from: k.id, to: s.playerId, amount: -4, reason: 'Left one of my guys inside', decay: 1, label } as Effect] : []), { type: 'schedule', key: 'stand_up', minWeeks: 2, maxWeeks: 5, chance: 1, hint: 'will he stand up?', params: { charId: c.id, help: 0 }, label }] },
        { id: 'quiet', label: 'He knows too much', detail: 'Before he can talk.', disabledReason: (c.evidence ?? 0) < 35 && !hasTrait(c, 'Cowardly') ? 'He does not know enough to hurt you' : undefined, because: `had ${c.firstName} silenced before he could talk`, effects: [{ type: 'kill', charId: c.id, cause: 'found in his car at the Cape May ferry lot before he could talk', killer: 'player', label }, { type: 'heat', bar: 'local', amount: 7, label }, { type: 'crewOpinion', amount: -6, reason: 'Killed one of our own who got pinched', traitMods: { Cruel: 6, 'Loyal-to-a-fault': -4 }, label }, ...(k ? [{ type: 'opinion', from: k.id, to: s.playerId, amount: -15, reason: `Killed my guy ${c.firstName}`, decay: 1, label } as Effect] : [])] },
      ], 'family', k ? [k.id] : [], 60);
  },
};

const wifeTalking: CrewEventDef = {
  key: 'crew_wife',
  cooldown: 8,
  weight: () => 2.5,
  subjects: (s) => men(s).filter((c) => available(s, c) && !!c.household?.wife && ((c.evidence ?? 0) >= 12 || hasVice(c, 'women') || hasVice(c, 'booze'))),
  build: (s, c) => {
    const w = c.household!.wife!;
    const about = hasVice(c, 'women') ? 'about where her husband really goes on Thursday nights — and what he has told her about the family' : pick(s, ['about the night the Starlight burned', 'about the money in the coffee can', 'about who her husband drives for']);
    const k = capoOf(s, c);
    const label = `${c.firstName}'s wife ${w}`;
    return make(s, 'crew_wife', c, `${w} ${c.lastName} is talking`,
      `${w}, ${displayName(c)}'s wife, has been talking at the beauty parlor on Pacific Avenue ${about}. A detective's wife gets her hair done there too.`,
      [
        { id: 'envelope', label: 'Send her an envelope and a kind word ($300)', because: `quieted ${c.firstName}'s wife with an envelope`, effects: [{ type: 'money', amount: -300, label }, { type: 'evidence', charId: c.id, amount: -6, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 3, reason: 'Was decent to my wife', decay: 1, label }] },
        ...(k ? [{ id: 'capo', label: `Have ${k.firstName} talk to him`, detail: 'His capo straightens out his house.', because: `had ${k.firstName} straighten out ${c.firstName}'s house`, effects: [{ type: 'evidence', charId: c.id, amount: -4, label }, { type: 'opinion', from: c.id, to: k.id, amount: -8, reason: 'Got into my business at home', decay: 1, label }, { type: 'meter', from: c.id, to: k.id, meter: 'fear', amount: 10, label }] } as Choice] : []),
        { id: 'warn', label: 'Tell him to control his house', because: `told ${c.firstName} to control his wife`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -6, reason: 'Insulted my wife', decay: 1, label }, { type: 'schedule', key: 'wife_to_cops', minWeeks: 2, maxWeeks: 6, chance: 0.3, hint: 'she may talk to the wrong people', params: { charId: c.id }, label }] },
      ], 'envelope', k ? [k.id] : []);
  },
};

const rivalDebt: CrewEventDef = {
  key: 'crew_debt',
  cooldown: 4,
  weight: () => 5,
  subjects: (s) => men(s).filter((c) => available(s, c, 3) && !!c.debtTo),
  build: (s, c) => {
    const d = c.debtTo!;
    const r = s.rivals.find((x) => x.id === d.rival)!;
    const amt = r100(d.amount);
    const label = `${c.firstName}'s debt to ${r.shortName}`;
    return make(s, 'crew_debt', c, `${callName(c)} owes ${r.shortName}'s shylock`,
      `${displayName(c)} owes ${fmt(amt)} to a ${r.shortName} shylock on the Causeway, and it grows every week. They have stopped asking for money and started asking for favors.`,
      [
        { id: 'pay', label: `Pay it off (${fmt(amt)})`, because: `paid off ${c.firstName}'s debt to ${r.shortName}`, disabledReason: s.money < amt ? `Needs ${fmt(amt)}` : undefined, effects: [{ type: 'money', amount: -amt, label }, { type: 'debtTo', charId: c.id, clear: true, label }, { type: 'courted', charId: c.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: `Paid off my debt to ${r.shortName}`, decay: 1, label }] },
        { id: 'lean', label: 'Lean on the shylock instead', detail: 'The debt is forgiven, one way or another.', because: `leaned on ${r.shortName}'s shylock over ${c.firstName}'s debt`, effects: [{ type: 'debtTo', charId: c.id, clear: true, label }, { type: 'courted', charId: c.id, label }, { type: 'respect', amount: 1, label }, { type: 'rivalOpinion', rival: r.id, amount: -15, reason: 'Muscled our shylock', label }, { type: 'heat', bar: 'local', amount: 2, label }, { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 5, chance: 0.4, hint: `${r.shortName} may hit back`, params: { rival: r.id }, label }] },
        { id: 'his', label: 'His debt, his problem', because: `left ${c.firstName} to his debt`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -8, reason: 'Left me to the shylocks', decay: 1, label }, { type: 'courted', charId: c.id, rival: r.id, label }] },
      ], s.money >= amt ? 'pay' : 'his', [r.leaderId]);
  },
};

const barBeef: CrewEventDef = {
  key: 'crew_beef',
  cooldown: 5,
  weight: () => 3,
  subjects: (s) => men(s).filter((c) => available(s, c) && (hasTrait(c, 'Hot-headed') || hasVice(c, 'booze') || hasTrait(c, 'Cruel'))),
  build: (s, c) => {
    const rs = mobRivals(s);
    if (!rs.length) return undefined;
    const r = pick(s, rs);
    const where = pick(s, ['the Anchor Bar', 'the Riptide', 'a clam bar on the bay side', 'the Surf Club', 'the Ship\'s Wheel']);
    const label = `${c.firstName}'s bar fight`;
    return make(s, 'crew_beef', c, `${callName(c)} started something`,
      `${displayName(c)} put one of ${r.shortName}'s men through the front window of ${where} over a remark about the boss. ${s.characters[r.leaderId].firstName} ${s.characters[r.leaderId].lastName} wants to know if that came from you.`,
      [
        { id: 'apologize', label: 'Make him apologize and pay for the window', because: `made ${c.firstName} apologize to ${r.shortName}`, effects: [{ type: 'money', amount: -400, label }, { type: 'rivalOpinion', rival: r.id, amount: 6, reason: 'Made his man apologize', label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -7, reason: 'Made me apologize to those people', decay: 1, label }, { type: 'respect', amount: -1, label }] },
        { id: 'back', label: 'Back him: nobody insults this family', because: `backed ${c.firstName} in his fight with ${r.shortName}'s man`, effects: [{ type: 'respect', amount: 1, label }, { type: 'rivalOpinion', rival: r.id, amount: -6, reason: 'Backed his animal', label }, { type: 'heat', bar: 'local', amount: 3, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 8, reason: 'Stood behind me', decay: 1, label }, { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 4, chance: 0.3, hint: `${r.shortName} may answer`, params: { rival: r.id }, label }] },
        { id: 'discipline', label: 'Discipline him yourself', because: `disciplined ${c.firstName} for brawling`, effects: [{ type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 15, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -10, reason: 'Humiliated me in front of the crew', decay: 1, label }, { type: 'evidence', charId: c.id, amount: -3, label }] },
      ], 'apologize', [r.leaderId]);
  },
};

const mistress: CrewEventDef = {
  key: 'crew_mistress',
  cooldown: 10,
  weight: () => 2,
  subjects: (s) => men(s).filter((c) => available(s, c, 8) && !!c.household?.wife && (hasTrait(c, 'Womanizer') || hasVice(c, 'women'))),
  build: (s, c) => {
    const who = pick(s, ['a hat-check girl from Club Bolero', 'a singer at the Riptide Lounge', 'a widow who runs a rooming house in the Crest']);
    const inlaws = pick(s, SURNAMES.Italian);
    const label = `${c.firstName}'s other life`;
    return make(s, 'crew_mistress', c, `${c.firstName}'s Thursday nights`,
      `${displayName(c)} has been keeping company with ${who}. His wife ${c.household!.wife} is a ${inlaws} — and her brothers drive for Philadelphia. They are asking questions.`,
      [
        { id: 'end', label: 'Tell him to end it', because: `told ${c.firstName} to end it`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -5, reason: 'Got into my private life', decay: 1, label }, { type: 'story', charId: c.id, text: `Ended it with ${who} on the boss's orders.`, label }] },
        { id: 'cover', label: 'Cover for him (and remember it)', detail: 'You will have something on him.', because: `covered for ${c.firstName}`, effects: [{ type: 'money', amount: -300, label }, { type: 'hook', targetId: c.id, strong: false, reason: `You covered for him and ${who}`, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 6, reason: 'Covered for me', decay: 1, label }] },
        { id: 'out', label: 'Stay out of it', because: `stayed out of ${c.firstName}'s affairs`, effects: [{ type: 'schedule', key: 'mistress_blowup', minWeeks: 2, maxWeeks: 6, chance: 0.35, hint: 'the in-laws may go to Philadelphia', params: { charId: c.id }, label }] },
      ], 'end');
  },
};

const heartAttack: CrewEventDef = {
  key: 'crew_heart',
  cooldown: 8,
  weight: () => 2,
  subjects: (s) => men(s).filter((c) => available(s, c) && ageOn(c.birth, s.date) >= 45 && (c.conditions.includes('Bad heart') || c.health < 55 || hasVice(c, 'booze'))),
  build: (s, c) => {
    const where = pick(s, ['at the Shamrock', 'on the beach at Cresse Avenue', 'in the middle of a collection', 'at his daughter\'s confirmation']);
    const label = `${c.firstName}'s heart`;
    return make(s, 'crew_heart', c, `${callName(c)} collapsed`,
      `${displayName(c)} went down ${where}. Dr. Feeney at Burdette Tomlin says it was his heart. He is ${ageOn(c.birth, s.date)}, and he is asking for you.`,
      [
        { id: 'hahnemann', label: 'Hahnemann, the best doctors ($1,200)', because: `sent ${c.firstName} to Hahnemann`, effects: [{ type: 'money', amount: -1200, label }, { type: 'health', charId: c.id, amount: 20, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: 'Paid for my doctors', decay: 1, label }] },
        { id: 'retire', label: 'Time he took it easy — let him retire', because: `let ${c.firstName} retire after his heart attack`, effects: [{ type: 'money', amount: -800, label: `${label}: a pension` }, { type: 'retire', charId: c.id, label }, { type: 'crewOpinion', amount: 2, reason: 'Takes care of his old-timers', label }] },
        { id: 'work', label: 'He\'ll be back to work Monday', because: `sent ${c.firstName} back to work`, effects: [{ type: 'health', charId: c.id, amount: -8, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -6, reason: 'Worked me like a mule', decay: 1, label }] },
      ], 'hahnemann', [], 55);
  },
};

const retirement: CrewEventDef = {
  key: 'crew_retire',
  cooldown: 10,
  weight: () => 3.5,
  subjects: (s) => men(s).filter((c) => available(s, c, 10) && c.goal === 'get_out' && c.rank !== 'capo' && !c.dynasty && ageOn(c.birth, s.date) >= 40 && crew(s).length > 8),
  build: (s, c) => {
    const where = pick(s, ['his sister\'s in Fort Lauderdale', 'a bungalow in Ocean City', 'his wife\'s people in Scranton', 'a cousin\'s farm in Vineland']);
    const yrs = Math.max(3, ageOn(c.birth, s.date) - 20);
    const label = `${c.firstName} wants out`;
    return make(s, 'crew_retire', c, `${callName(c)} wants out`,
      `${displayName(c)} has given the family ${yrs} years. He wants to move to ${where} and never think about Wildwood again. Some people say nobody ever really leaves.`,
      [
        { id: 'pension', label: 'Let him go with a pension ($1,500)', because: `let ${c.firstName} retire with a pension`, effects: [{ type: 'money', amount: -1500, label }, { type: 'retire', charId: c.id, label }, { type: 'crewOpinion', amount: 3, reason: 'Lets a man retire with dignity', label }] },
        { id: 'go', label: 'Let him go', because: `let ${c.firstName} walk away`, effects: [{ type: 'retire', charId: c.id, label }, { type: 'schedule', key: 'retired_talks', minWeeks: 4, maxWeeks: 12, chance: (c.evidence ?? 0) > 30 ? 0.3 : 0.12, hint: 'he takes what he knows with him', params: { charId: c.id }, label }] },
        { id: 'no', label: 'Nobody leaves this family', because: `refused to let ${c.firstName} retire`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -15, reason: 'Will not let me out', decay: 1, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 15, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 10, label }] },
      ], 'pension');
  },
};

/* ------------------------------------------------------------------ */
/* Life events                                                         */
/* ------------------------------------------------------------------ */

const wedding: CrewEventDef = {
  key: 'crew_wedding',
  cooldown: 9,
  weight: () => 2.5,
  subjects: (s) => men(s).filter((c) => available(s, c) && !c.dynasty && !c.household?.wife && c.gender === 'M' && ageOn(c.birth, s.date) >= 21 && ageOn(c.birth, s.date) <= 42),
  build: (s, c) => {
    const bride = pick(s, FEMALE_FIRST[c.ethnicity]);
    const family = pick(s, SURNAMES[c.ethnicity]);
    const where = c.ethnicity === 'Jewish' ? 'Beth Judah' : 'St. Ann\'s';
    const label = `${c.firstName}'s wedding`;
    return make(s, 'crew_wedding', c, `${callName(c)} is getting married`,
      `${displayName(c)} is marrying ${bride} ${family} at ${where} on Saturday, reception at the Hotel Dorset. Every man in the family will be watching who sits where and how fat the envelopes are.`,
      [
        { id: 'big', label: 'Sit at the head table, a fat envelope ($600)', because: `honored ${c.firstName}'s wedding`, effects: [{ type: 'money', amount: -600, label }, { type: 'household', charId: c.id, wife: bride, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 15, reason: 'Honored my wedding', decay: 1, label }, { type: 'respect', amount: 1, label }, { type: 'story', charId: c.id, text: `Married ${bride} ${family}; the boss sat at the head table.`, label }] },
        { id: 'envelope', label: 'Send an envelope ($200)', because: `sent ${c.firstName} a wedding envelope`, effects: [{ type: 'money', amount: -200, label }, { type: 'household', charId: c.id, wife: bride, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 5, reason: 'Remembered my wedding', decay: 1, label }, { type: 'story', charId: c.id, text: `Married ${bride} ${family}.`, label }] },
        { id: 'skip', label: 'Too busy', because: `skipped ${c.firstName}'s wedding`, effects: [{ type: 'household', charId: c.id, wife: bride, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -9, reason: 'Did not come to my wedding', decay: 1, label }, { type: 'story', charId: c.id, text: `Married ${bride} ${family}. The boss did not come.`, label }] },
      ], 'envelope', [], 40);
  },
};

const christening: CrewEventDef = {
  key: 'crew_christening',
  cooldown: 6,
  weight: () => 2.5,
  subjects: (s) => men(s).filter((c) => available(s, c) && !!c.household?.wife && ageOn(c.birth, s.date) <= 46 && (c.household?.kids.length ?? 0) < 5),
  build: (s, c) => {
    const male = chance(s, 0.52);
    const name = pick(s, male ? MALE_FIRST[c.ethnicity] : FEMALE_FIRST[c.ethnicity]);
    const label = `${c.firstName}'s new ${male ? 'son' : 'daughter'}`;
    const kid = { name, male };
    return make(s, 'crew_christening', c, `A ${male ? 'son' : 'daughter'} for ${callName(c)}`,
      `${c.household!.wife} gave ${displayName(c)} a ${male ? 'boy' : 'girl'}, ${name}. He asks you to stand at the font as the baby's sponsor — in this family, that means something for life.`,
      [
        { id: 'sponsor', label: 'Stand for the baby ($300 and a gold cross)', because: `stood sponsor for ${c.firstName}'s ${male ? 'son' : 'daughter'}`, effects: [{ type: 'money', amount: -300, label }, { type: 'household', charId: c.id, kid, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 20, reason: `Stood for my ${male ? 'son' : 'daughter'} ${name}`, decay: 0, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'trust', amount: 15, label }, { type: 'story', charId: c.id, text: `His ${male ? 'son' : 'daughter'} ${name} was christened; the boss stood sponsor.`, label }] },
        { id: 'gift', label: 'Send a gift ($150)', because: `sent ${c.firstName} a christening gift`, effects: [{ type: 'money', amount: -150, label }, { type: 'household', charId: c.id, kid, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 5, reason: 'Remembered my kid', decay: 1, label }] },
        { id: 'decline', label: 'Ask him to find someone else', because: `declined to stand for ${c.firstName}'s baby`, effects: [{ type: 'household', charId: c.id, kid, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -10, reason: 'Would not stand for my kid', decay: 1, label }] },
      ], 'sponsor', [], 40);
  },
};

const sonWantsIn: CrewEventDef = {
  key: 'crew_son',
  cooldown: 10,
  weight: () => 3,
  subjects: (s) => men(s).filter((c) => available(s, c, 8) && grownSons(s, c).length > 0 && crew(s).length < 20),
  build: (s, c) => {
    const son = grownSons(s, c)[0];
    const wantsOut = c.goal === 'get_out' || c.goal === 'get_rich';
    const label = `${c.firstName}'s boy ${son.name}`;
    const kid = makeCharacter(s, { firstName: son.name, lastName: c.lastName, ethnicity: c.ethnicity, age: son.age, rank: 'civilian', faction: 'none', nickname: false });
    kid.ambition = 'Be like his father';
    return make(s, 'crew_son', c, `${c.firstName}'s boy wants in`,
      `${son.name} ${c.lastName}, ${son.age}, ${displayName(c)}'s son, has been hanging around the Shamrock all summer. He wants in. ${wantsOut ? `${c.firstName} wanted something better for him.` : `${c.firstName} would be proud.`}`,
      [
        { id: 'in', label: `Bring ${son.name} in`, because: `brought ${c.firstName}'s son ${son.name} into the life`, effects: [{ type: 'recruit', charId: kid.id, label }, { type: 'assign', charId: kid.id, capoId: capoOf(s, c)?.id ?? (c.rank === 'capo' ? c.id : smallestRegime(s)?.id), label }, { type: 'opinion', from: kid.id, to: s.playerId, amount: 15, reason: 'Gave me my chance', decay: 1, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: wantsOut ? -8 : 10, reason: wantsOut ? 'Brought my boy into the life' : 'Took my boy in', decay: 1, label }, { type: 'story', charId: c.id, text: `His son ${son.name} came into the family.`, label }] },
        { id: 'college', label: 'Send him to college instead ($1,000)', because: `sent ${c.firstName}'s boy to college`, effects: [{ type: 'money', amount: -1000, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: wantsOut ? 18 : 8, reason: 'Sent my boy to college', decay: 0, label }, { type: 'story', charId: c.id, text: `The boss sent his son ${son.name} to Villanova.`, label }] },
        { id: 'no', label: 'Tell the kid to go home', because: `sent ${c.firstName}'s boy home`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: wantsOut ? 5 : -5, reason: wantsOut ? 'Kept my boy out of it' : 'Turned my boy away', decay: 1, label }] },
      ], wantsOut ? 'college' : 'in', [kid.id]);
  },
};

/* ------------------------------------------------------------------ */
/* Membership                                                          */
/* ------------------------------------------------------------------ */

const vouch: CrewEventDef = {
  key: 'crew_vouch',
  cooldown: 5,
  weight: () => 3,
  subjects: (s) => crew(s).filter((c) => c.rank === 'associate' && !c.specialty && !c.dynasty && available(s, c, 8) && c.proposedWeek === undefined && mayPropose(s, c) && op(s, c, s.playerId) >= -10 && !!capoOf(s, c)),
  build: (s, c) => {
    const k = capoOf(s, c)!;
    const books = s.books;
    const label = `${k.firstName} vouches for ${c.firstName}`;
    return make(s, 'crew_vouch', c, `${callName(k)} vouches for ${c.firstName}`,
      `${displayName(k)} wants to put up his associate ${displayName(c)} for membership. "I'll stand for him."${c.bones?.length ? ` ${bonesLine(c.bones[0])}.` : ' Philadelphia did him a favor: he never made his bones.'} If you agree, his name goes to Philadelphia — ${books?.open ? `the books are open (${books.slots} left)` : 'the books are closed right now, so he waits'}. If he ever goes bad, it is on ${k.firstName}.`,
      [
        { id: 'propose', label: 'Send his name to Philadelphia', because: `proposed ${c.firstName} for membership`, effects: [{ type: 'propose', charId: c.id, voucherId: k.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 10, reason: 'Put my name up', decay: 1, label }, { type: 'opinion', from: k.id, to: s.playerId, amount: 4, reason: 'Listened to me about my guy', decay: 1, label }] },
        { id: 'check', label: 'Have him looked into first ($400, two weeks)', detail: 'Phone records, a cop who owes you. Plants and informants show up.', because: `ran a background check on ${c.firstName}`, effects: [{ type: 'money', amount: -400, label }, { type: 'checkBackground', charId: c.id, label }, { type: 'opinion', from: k.id, to: s.playerId, amount: -2, reason: 'Did not take my word', decay: 1, label }] },
        { id: 'wait', label: 'He is not ready', because: `held back ${c.firstName}'s name`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -6, reason: 'Held my name back', decay: 1, label }, { type: 'opinion', from: k.id, to: s.playerId, amount: -4, reason: 'Did not trust my judgment', decay: 1, label }] },
      ], 'propose', [k.id]);
  },
};

/* ------------------------------------------------------------------ */
/* Courtship by rivals                                                 */
/* ------------------------------------------------------------------ */

const courted: CrewEventDef = {
  key: 'crew_courted',
  cooldown: 3,
  weight: () => 6,
  subjects: (s) => crew(s).filter((c) => available(s, c, 3) && !!c.courtedBy && s.week - c.courtedBy.week >= 1 && c.rank !== 'capo'),
  build: (s, c) => {
    const r = s.rivals.find((x) => x.id === c.courtedBy!.rival)!;
    const L = s.characters[r.leaderId];
    const why = c.goal === 'become_capo' ? 'They are promising him a crew of his own' : c.goal === 'get_rich' || c.policy === 'squeeze' ? 'They say he would keep more of what he earns' : c.debtTo ? 'They say they will forget his debt' : 'They buy every round';
    const label = `${r.shortName} is courting ${c.firstName}`;
    return make(s, 'crew_courted', c, `${r.shortName} is courting ${callName(c)}`,
      `${displayName(c)} has been seen at ${r.shortName}'s tables three nights running. ${why}. He has not said no.`,
      [
        { id: 'sit', label: 'Sit him down, man to man', because: `sat ${c.firstName} down about ${r.shortName}`, effects: [{ type: 'attention', charId: c.id, label }, { type: 'courted', charId: c.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: 'The boss made time for me', decay: 1, label }] },
        { id: 'earn', label: 'Let him keep his hustle', detail: 'He keeps everything he earns from now on.', because: `let ${c.firstName} keep his hustle to keep him from ${r.shortName}`, effects: [{ type: 'policy', charId: c.id, policy: 'earn', label }, { type: 'courted', charId: c.id, label }, { type: 'attention', charId: c.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 6, reason: 'Lets me earn', decay: 1, label }] },
        { id: 'warn', label: 'Remind him what happens to people who leave', because: `warned ${c.firstName} about ${r.shortName}`, effects: [{ type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 25, label }, { type: 'courted', charId: c.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -8, reason: 'Threatened me', decay: 1, label }] },
        { id: 'let', label: 'If he wants to go, let him go', because: `let ${r.shortName} have ${c.firstName}`, effects: [{ type: 'respect', amount: -1, label }] },
      ], 'sit', L ? [L.id] : []);
  },
};

const SCORES = [
  'hijacked a truckload of Philco televisions on the Garden State Parkway',
  'hit a long shot at Atlantic City Race Course on a tip from a jockey',
  'cleaned out a high-roller from Baltimore at a card game in the Crest',
  'sold a warehouse of "damaged" Schmidt\'s beer to every bar on Pacific Avenue',
  'collected an old debt nobody thought would ever be paid',
  'bought a load of nylons off a Navy man and sold them on the boardwalk',
  'sold a trailer of "irregular" Botany 500 suits out of a garage in Rio Grande',
  'won a Cadillac in a raffle at the Elks and sold it back to the dealer the same afternoon',
  'got a jeweler in Atlantic City to buy back a ring that, it turns out, was his to begin with',
  'moved a truck of Ballantine ale that the brewery wrote off as "spoiled in the heat"',
  'ran a Friday-night bingo in a church basement with a little extra on the side',
  'bought a closeout of transistor radios in Newark and sold every one on the boardwalk by the Fourth',
  'collected the insurance on a bait shop that burned down by itself, honestly, for once',
  'cornered the Labor Day fireworks for every town from Avalon to Cape May',
];

/**
 * The score, in several shapes: each its own template (the story director
 * caps each one), with the same three answers. The take scales with the season.
 */
function scoreDef(key: string, whats: string[], title: (nm: string) => string, weight: (s: GameState) => number): CrewEventDef {
  return {
    key,
    cooldown: 2,
    // The first season the crew is out hustling: scores come a little more often while the house finds its feet.
    weight: (s) => weight(s) * (s.week <= 52 ? 1.5 : 1),
    subjects: (s) => men(s).filter((c) => available(s, c) && c.rank !== 'capo' && (c.craft === 'earner' || c.craft === 'burglar' || c.craft === 'driver' || c.craft === 'bookmaker' || c.attributes.business >= 50 || hasTrait(c, 'Gambler'))),
    build: (s, c) => {
      const what = pick(s, whats);
      const total = r100((2500 + randInt(s, 0, 3500)) * Math.max(0.7, seasonMultiplier(s.date) / 1.6));
      const end = r100(total * 0.5);
      const k = capoOf(s, c);
      const label = `${c.firstName}'s score`;
      return withMeta({ what, total, end }, make(s, key, c, title(callName(c)),
        `${displayName(c)} ${what}: ${fmt(total)}. He comes by the Shamrock with your end in an envelope${k ? ` — ${k.firstName} already took his` : ''}. Some bosses take it all.`,
        [
          { id: 'end', label: `Take your end (${fmt(end)})`, because: `took your end of ${c.firstName}'s score`, effects: [{ type: 'money', amount: end, label }, { type: 'wealth', charId: c.id, amount: total - end, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 3, reason: 'Fair about my score', decay: 1, label }, { type: 'evidence', charId: c.id, amount: 3, label }] },
          { id: 'keep', label: 'Let him keep it this time', because: `let ${c.firstName} keep his score`, effects: [{ type: 'wealth', charId: c.id, amount: total, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: 'Let me keep my score', decay: 1, label }, { type: 'evidence', charId: c.id, amount: 3, label }] },
          { id: 'all', label: `Take all of it (${fmt(total)})`, because: `took all of ${c.firstName}'s score`, effects: [{ type: 'money', amount: total, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: -14, reason: 'Took my whole score', decay: 1, label }, { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 12, label }, { type: 'evidence', charId: c.id, amount: 3, label }] },
        ], 'end', k ? [k.id] : [], 46));
    },
  };
}

/** The score's facts, for its scenes (sceneFamilies2.ts tells the delivery a different way each time). */
function withMeta(m: Record<string, string | number>, ev: EventInstance): EventInstance {
  ev.meta = { ...(ev.meta ?? {}), ...m };
  return ev;
}

const score = scoreDef('crew_score', SCORES, (nm) => `${nm} made a score`, (s) => 4 + seasonMultiplier(s.date) / 2);
const SCORE_SHAPES: CrewEventDef[] = [
  scoreDef('score_number', ['hit the number at three hundred to one with a dime on a number his grandmother dreamed', 'cashed a numbers slip a dead uncle left in his good suit', 'played his mother\'s address and his kid\'s birthday as a combination and it came in', 'played the last three digits of the Phillies\' attendance and somebody upstairs has a sense of humor', 'bet the number off a license plate he saw in a dream, and it hit', 'had a quarter on the hospital room number where his son was born'], (nm) => `${nm} hit the number`, () => 3.4),
  scoreDef('score_salvage', ['found a sunk rumrunner\'s cargo off Hereford Inlet: forty cases of 1928 Canadian whiskey', 'bought a wrecked freighter\'s cargo at a salvage auction and sold it back to the shipping line', 'pulled a crate of brass ship\'s fittings out of the mud at Two Mile Landing and sold them to an antique dealer from Haddonfield', 'dragged a lost fishing net full of somebody\'s lobster pots back to Otten\'s Harbor and sold the owner his own pots', 'bought a beached cabin cruiser for a hundred dollars and sold it to a dentist from Cherry Hill as "a project"'], (nm) => `${nm} found something in the water`, (s) => 2.6 + seasonMultiplier(s.date) / 3),
  scoreDef('score_fight', ['had a piece of a fighter at the Arena in Philadelphia who was supposed to lose and did not', 'booked the Friday fights at Convention Hall and the gate came in big', 'bet the undercard at the Atlantic City Auditorium on a kid from Camden nobody had heard of', 'sold the radio rights to a club fight in Vineland to a station that did not exist yet', 'held the purse for a welterweight bout and the loser\'s manager never came to collect'], (nm) => `${nm} had a piece of the fight`, () => 3.2),
  scoreDef('score_lot', ['flipped a bayside lot to a motel developer for three times what he paid', 'sold a marsh lot in West Wildwood to a man from Pittsburgh who never saw it', 'bought a corner on Atlantic Avenue the week before the new motel was announced', 'sold the same beach-block lot twice, legally, which his lawyer is still explaining', 'traded an empty lot in Erma for a liquor license in Wildwood Crest'], (nm) => `${nm} sold a piece of land`, () => 3),
  scoreDef('score_tourist', ['sold four hundred souvenir Miss America programs printed in his cousin\'s basement', 'ran a guess-your-weight stand on the boardwalk with a scale that guessed for the house', 'rented every beach umbrella on the Crest during a heat wave at double the price', 'sold "genuine Atlantic City saltwater taffy" made in Wildwood by the box', 'parked cars on a vacant lot he does not own for the whole Fourth of July weekend'], (nm) => `${nm} worked the tourists`, (s) => (seasonMultiplier(s.date) > 1 ? 4 : 0.6)),
];

export const CREW_EVENTS: CrewEventDef[] = [
  takeRacket, ownBar, biggerCut, promotion, hitPermission, loanRequest, kidHelp, regimeRequest,
  crewDispute, pinched, wifeTalking, rivalDebt, barBeef, mistress, heartAttack, retirement,
  wedding, christening, sonWantsIn, vouch, courted, score, ...SCORE_SHAPES,
];

/** More crew decisions from other files (crewVariants.ts): appended to the registry. */
export function registerCrewEvents(defs: CrewEventDef[]): void {
  for (const d of defs) if (!CREW_EVENTS.some((x) => x.key === d.key)) CREW_EVENTS.push(d);
}

export function eventCooldownOk(s: GameState, key: string, cooldown: number): boolean {
  return s.week - (s.eventCooldowns?.[key] ?? -999) >= cooldown;
}

/** How long before the same kind of decision can come back about the same man. */
export const SUBJECT_COOLDOWN = 20;

export function subjectOk(s: GameState, key: string, id: string): boolean {
  return s.week - (s.eventCooldowns?.[`${key}:${id}`] ?? -999) >= SUBJECT_COOLDOWN;
}

export function markShown(s: GameState, ev: EventInstance): void {
  if (!s.eventCooldowns) s.eventCooldowns = {};
  s.eventCooldowns[ev.defId] = s.week;
  // A kin hook's own cooldowns (housesEvents.ts) start when it is actually shown.
  markKinShown(s, ev);
  // So do a storylet's used parts and its opening beat (storyDirector.ts).
  markLetShown(s, ev);
  if (ev.meta?.charId) s.eventCooldowns[`${ev.defId}:${ev.meta.charId}`] = s.week;
  // A dispute is about a pair: neither man brings the same kind of fight back soon.
  if (ev.defId === 'crew_dispute' || ev.meta?.pair) for (const id of ev.actors ?? []) s.eventCooldowns[`${ev.defId}:${id}`] = s.week;
  for (const id of ev.actors ?? []) {
    const c = s.characters[id];
    if (c && c.faction === 'player') {
      c.lastAskWeek = s.week;
      // He brought it to the boss himself: whatever the answer, he is not being ignored.
      c.neglect = 0;
      if ((c.defectStage ?? 0) === 1) c.defectStage = 0;
    }
  }
}

/** Drop cooldown entries nobody will look at again. */
export function pruneCooldowns(s: GameState): void {
  if (!s.eventCooldowns) return;
  for (const [k, w] of Object.entries(s.eventCooldowns)) if (s.week - w > 60) delete s.eventCooldowns[k];
}

/**
 * Up to `n` crew-driven decisions for this week, each about a different man.
 * Weighted by the event's weight; respects per-event and per-character
 * cooldowns.
 */
export function pickCrewEvents(s: GameState, n: number): EventInstance[] {
  const out: EventInstance[] = [];
  const used = new Set<string>();
  let pool = CREW_EVENTS.filter((d) => eventCooldownOk(s, d.key, d.cooldown) && freshness(s, d.key) > 0);
  menMemo = { s, list: men(s) };
  const subjectsOf = new Map(pool.map((d) => [d, d.subjects(s).filter((c) => subjectOk(s, d.key, c.id))]));
  menMemo = undefined;
  for (let tries = 0; out.length < n && pool.length && tries < 12; tries++) {
    const cands = pool.map((d) => ({ d, subs: (subjectsOf.get(d) ?? []).filter((c) => !used.has(c.id)) })).filter((x) => x.subs.length);
    const pickd = weightedPick(s, cands, (x) => x.d.weight(s) * freshness(s, x.d.key));
    if (!pickd) break;
    pool = pool.filter((d) => d !== pickd.d);
    const subj = pickd.subs.length > 1 && chance(s, 0.35) ? pickd.subs[1] : pickd.subs[0];
    const ev = pickd.d.build(s, subj);
    if (!ev) continue;
    for (const a of ev.actors ?? []) used.add(a);
    // Cooldowns are stamped by generateWeekEvents for what is actually shown.
    out.push(ev);
  }
  return out;
}

/** The loyal capo comes to you with the rival's offer (queued by the rival's move). */
export function buildOfferReported(s: GameState, c: Character, rival: RivalId): EventInstance {
  const r = s.rivals.find((x) => x.id === rival)!;
  const label = `${c.firstName} reports ${r.shortName}'s offer`;
  const ev = make(s, 'crew_offer_reported', c, `${callName(c)} turned ${r.shortName} down`,
    `${displayName(c)} comes straight to you: ${s.characters[r.leaderId].firstName} ${s.characters[r.leaderId].lastName} offered him ${pick(s, ['the Causeway', 'a piece of Atlantic City', 'a bigger end than you give him'])} if he brought his crew over. He told them where to go — and he wants you to know.`,
    [
      { id: 'reward', label: 'Reward his loyalty ($750)', because: `rewarded ${c.firstName} for turning down ${r.shortName}`, effects: [{ type: 'money', amount: -750, label }, { type: 'courted', charId: c.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 14, reason: 'Rewarded my loyalty', decay: 1, label }, { type: 'story', charId: c.id, text: `Turned down an offer from ${r.name} and told the boss.`, label }] },
      { id: 'double', label: `Have him string ${r.shortName} along`, detail: 'Feed them bad information through him.', because: `used ${c.firstName} to feed ${r.shortName} lies`, effects: [{ type: 'rivalResource', rival: r.id, muscle: -6, money: -3000, label }, { type: 'courted', charId: c.id, label }, { type: 'story', charId: c.id, text: `Played ${r.name} for the boss.`, label }, { type: 'schedule', key: 'double_game', minWeeks: 3, maxWeeks: 8, chance: 0.3, hint: `${r.shortName} may see through it`, params: { charId: c.id, rival: r.id }, label }] },
      { id: 'thanks', label: 'Thank him and move on', because: `thanked ${c.firstName} for his loyalty`, effects: [{ type: 'courted', charId: c.id, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 4, reason: 'The boss knows I am loyal', decay: 1, label }] },
    ], 'reward', [r.leaderId], 58);
  return ev;
}

/** The making ceremony: a special scene. */
export function buildMaking(s: GameState, c: Character): EventInstance {
  const v = c.vouchedBy ? s.characters[c.vouchedBy] : undefined;
  const label = `The making of ${c.firstName} ${c.lastName}`;
  const ev = make(s, 'making', c, 'The ceremony',
    `The back room of the Bolero, after closing. One bulb, a table, a knife, a gun, and a saint card. ${v ? `${displayName(v)} stands for him. ` : ''}${displayName(c)} holds out his trigger finger. The card burns in his cupped hands while he swears: if he betrays the family, let him burn like this saint. Philadelphia has approved his name.`,
    [
      { id: 'make', label: 'Welcome him into the family', detail: '$1,000 to Philadelphia for opening the books.', because: `made ${c.firstName} ${c.lastName} a member of the family`, effects: [{ type: 'money', amount: -1000, label }, { type: 'making', charId: c.id, label }] },
      { id: 'wait', label: 'Not tonight', detail: 'He keeps his place in line — for now.', because: `postponed ${c.firstName}'s making`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -10, reason: 'Postponed my making', decay: 1, label }] },
    ], 'make', v ? [v.id] : [], 79);
  ev.mandatory = true;
  return ev;
}

/** A background check found a plant. */
export function buildPlantFound(s: GameState, c: Character): EventInstance {
  const who = c.informantFor === 'law' ? 'the FBI' : FACTION_NAMES[c.informantFor ?? 'none'];
  const label = `${c.firstName} is a plant`;
  const v = c.vouchedBy ? s.characters[c.vouchedBy] : capoOf(s, c);
  const ev = make(s, 'plant_found', c, `${callName(c)} is not who he says`,
    `Your cop at the county came back with it: ${displayName(c)} has been meeting ${who === 'the FBI' ? 'an FBI agent' : `${who}'s people`} at a diner in Rio Grande every Tuesday.${v ? ` ${v.firstName} brought him in.` : ''}`,
    [
      { id: 'marsh', label: 'He goes in the marsh', because: `had the plant ${c.firstName} killed`, effects: [{ type: 'kill', charId: c.id, cause: 'killed as a plant', killer: 'player', label }, { type: 'heat', bar: c.informantFor === 'law' ? 'federal' : 'local', amount: 6, label }, { type: 'respect', amount: 2, label }] },
      { id: 'feed', label: 'Feed him lies', because: `fed lies through the plant ${c.firstName}`, effects: [{ type: 'flag', key: `fed_${c.id}`, value: 1, label }, ...(c.informantFor === 'law' ? [{ type: 'heat', bar: 'federal', amount: -8, label } as Effect] : [{ type: 'rivalResource', rival: c.informantFor as RivalId, money: -3000, muscle: -4, label } as Effect])] },
      { id: 'exile', label: 'Run him off the island', because: `ran the plant ${c.firstName} off the island`, effects: [{ type: 'exile', charId: c.id, label }] },
    ], 'feed', v ? [v.id] : [], 76);
  ev.mandatory = true;
  return ev;
}

/** Loyalty at a glance (for the UI): to the capo vs to the boss. */
export function loyaltySplit(s: GameState, c: Character): { capo?: number; boss: number } {
  return { capo: capoLoyalty(s, c), boss: opinion(s, c.id, s.playerId) };
}

/** Is the man someone a rival has reason to court? (used by the rival AI) */
export function poachScore(s: GameState, c: Character): number {
  if (!inRegimeRank(c) || c.dynasty || hasTrait(c, 'Loyal-to-a-fault') || c.courtedBy) return 0;
  let v = 30 - opinion(s, c.id, s.playerId);
  if (c.goal === 'become_capo' && c.rank !== 'capo') v += 15;
  if (c.goal === 'get_rich' && c.policy === 'squeeze') v += 20;
  if (c.debtTo) v += 25;
  v += (getRelation(s, c.id, s.playerId)?.grievance ?? 0) / 2;
  // The best men are worth more to a rival, unless the boss looks after them (crewXp.ts).
  v += xpPoachBonus(s, c);
  return Math.max(0, v);
}
