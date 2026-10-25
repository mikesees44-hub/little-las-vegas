import { ageOn } from './calendar';
import { birthForAge, displayName, makeCharacter } from './characters';
import { emptyCouncil, fillCouncil } from './council';
import { autoStaff } from './business';
import { generateWeekEvents } from './events';
import { newGame } from './newGame';
import { rankStart } from './station';
import { addOpeningScene } from './scenes';
import { refreshDynastyAfterStart } from './family';
import { addOpinion } from './relations';
import { addStory, assignTo, giveBio, smallestRegime, tidyRegimes, transferRegime, validateHierarchy } from './hierarchy';
import { capos, crew } from './characters';
import type { Character, GameState, Trait } from './types';

/**
 * How a game begins.
 *  - classic: the house already runs the island for Philadelphia (the default).
 *  - rise: Rise to Power. A young man with a numbers bank, a few guys and a
 *    name nobody in Philadelphia knows yet.
 *  - sees: the House of Sees. Don Salvatore "The Shark" Sees, an old boss
 *    near the end of his reign, with three grown heirs: Vito, Donato and
 *    Francesca. (A fictional family.)
 */
export type StartId = 'classic' | 'rise' | 'sees' | 'associate' | 'soldier' | 'capo';

export const STARTS: Record<StartId, { name: string; text: string }> = {
  classic: { name: 'The House', text: 'You already run Wildwood for Philadelphia. A full crew, five rackets, and one problem from the past.' },
  rise: { name: 'Rise to Power', text: 'A young man with a numbers bank, a few guys and $6,000. Nobody in Philadelphia knows your name yet.' },
  sees: { name: 'The House of Sees', text: 'Don Salvatore "The Shark" Sees, sixty years old, and three heirs who all want the chair: Vito, Donato and Francesca.' },
  associate: { name: 'Start as an associate', text: 'Not even made. Two guys, a corner, and Don Cosimo Valente above you taking 30%.' },
  soldier: { name: 'Start as a soldier', text: 'A made man with a few guys of his own, kicking up a quarter to Don Cosimo Valente.' },
  capo: { name: 'Start as a capo', text: 'Your own crew in the Valente family. Fifteen percent up the ladder, and the chair one step further.' },
};

export function newGameWith(seed: string, start: StartId = 'classic'): GameState {
  const s = newGame(seed);
  if (start === 'classic') {
    addOpeningScene(s, start);
    return s;
  }
  if (start === 'rise' || start === 'associate' || start === 'soldier' || start === 'capo') rise(s);
  else sees(s);
  if (start === 'associate' || start === 'soldier' || start === 'capo') rankStart(s, start);
  rebuildRegimes(s);
  s.flags[`start_${start}`] = 1;
  refreshDynastyAfterStart(s);
  // Re-deal the first week's cards for the new situation.
  s.cooldowns = {};
  s.eventQueue = [];
  s.pendingEvents = generateWeekEvents(s);
  addOpeningScene(s, start);
  return s;
}

function setAge(s: GameState, c: Character, age: number): void {
  c.birth = birthForAge(s, s.date, age);
}

function rename(s: GameState, from: string, to: string): void {
  for (const c of Object.values(s.characters)) {
    if (!c.dynasty) continue;
    if (c.lastName === from) c.lastName = to;
  }
  s.houseName = to;
}

function removeCharacter(s: GameState, id: string): void {
  const c = s.characters[id];
  if (!c) return;
  for (const p of [c.fatherId, c.motherId]) if (p && s.characters[p]) s.characters[p].childrenIds = s.characters[p].childrenIds.filter((x) => x !== id);
  delete s.characters[id];
  s.secrets = s.secrets.filter((x) => x.ownerId !== id);
  s.hooks = s.hooks.filter((x) => x.targetId !== id);
  for (const k of Object.keys(s.relations)) if (k.startsWith(`${id}>`) || k.endsWith(`>${id}`)) delete s.relations[k];
}

/** The House of Sees. */
function sees(s: GameState): void {
  const boss = s.characters[s.playerId];
  const old = boss.lastName;
  rename(s, old, 'Sees');
  boss.firstName = 'Salvatore';
  boss.nickname = 'The Shark';
  setAge(s, boss, 60);
  boss.traits = ['Patient', 'Vengeful', 'Pious'];
  boss.attributes = { leadership: 78, business: 62, diplomacy: 66, intrigue: 72, force: 48, discipline: 70 };
  boss.ambition = 'Choose the right heir before it is too late';
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife) {
    wife.firstName = 'Rosaria';
    setAge(s, wife, 56);
  }
  // His parents are long gone at sixty.
  for (const p of [boss.fatherId, boss.motherId]) {
    const c = p ? s.characters[p] : undefined;
    if (c?.alive) {
      c.alive = false;
      c.death = { week: 0, date: { y: 1949, m: 3, d: 2 }, cause: 'old age' };
    }
  }
  for (const id of [...boss.childrenIds]) removeCharacter(s, id);
  boss.childrenIds = [];
  if (wife) wife.childrenIds = [];
  const kids: [string, 'M' | 'F', number, Trait[], Partial<Character['attributes']>, string][] = [
    ['Vito', 'M', 34, ['Ambitious', 'Patient'], { leadership: 70, business: 58, diplomacy: 55, intrigue: 60, force: 52, discipline: 66 }, 'Take the chair the way his father wants'],
    ['Donato', 'M', 29, ['Hot-headed', 'Gambler'], { leadership: 50, business: 38, diplomacy: 34, intrigue: 40, force: 78, discipline: 36 }, 'Prove he is the strong one'],
    ['Francesca', 'F', 26, ['Charming', 'Ambitious'], { leadership: 64, business: 76, diplomacy: 72, intrigue: 68, force: 30, discipline: 62 }, 'Run the books — and then the family'],
  ];
  for (const [first, g, age, traits, attrs, amb] of kids) {
    const k = makeCharacter(s, { firstName: first, gender: g, lastName: 'Sees', ethnicity: 'Italian', faction: 'player', dynasty: true, rank: 'civilian', age, nickname: false });
    k.traits = traits;
    k.attributes = { ...k.attributes, ...attrs };
    k.ambition = amb;
    k.fatherId = boss.id;
    boss.childrenIds.push(k.id);
    if (wife) {
      k.motherId = wife.id;
      wife.childrenIds.push(k.id);
    }
    addOpinion(s, k.id, boss.id, 'My father', 25, 0);
  }
  const [vito, donato, francesca] = boss.childrenIds.map((id) => s.characters[id]);
  // Vito is underboss; the old underboss steps aside to soldier.
  const ub = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'underboss');
  if (ub) {
    ub.rank = 'soldier';
    addStory(s, ub, `Stepped aside as underboss for ${vito.firstName} Sees, the old man's son.`);
  }
  vito.rank = 'underboss';
  donato.rank = 'capo';
  const free = s.districts.find((d) => d.capoId && s.characters[d.capoId]?.rank === 'capo');
  if (free) {
    const was = s.characters[free.capoId!];
    // Donato inherits the regime (men and outside guys); the old capo goes back to being a soldier elsewhere.
    transferRegime(s, was.id, donato.id);
    was.rank = 'soldier';
    free.capoId = donato.id;
    assignTo(s, was, smallestRegime(s, donato.id)?.id, `Gave up his crew to ${donato.firstName} Sees.`);
    addOpinion(s, was.id, donato.id, 'Took my crew', -15, 1);
    addStory(s, donato, `His father gave him ${was.firstName} ${was.lastName}'s crew in ${free.name}.`);
  }
  // The old underboss, now a soldier, goes into Donato's crew to keep the hothead out of trouble.
  if (ub && donato.rank === 'capo') assignTo(s, ub, donato.id, `Put in ${donato.firstName}'s crew to keep the hothead out of trouble.`);
  for (const k of [vito, donato]) giveBio(s, k);
  addOpinion(s, donato.id, vito.id, 'Father\'s favorite', -20, 0);
  addOpinion(s, francesca.id, vito.id, 'Thinks a woman can\'t sit in the chair', -10, 0);
  addOpinion(s, vito.id, donato.id, 'A hothead who will get us killed', -10, 0);
  s.money += 15000;
  s.respect = 55;
  s.council = emptyCouncil();
  fillCouncil(s);
  autoStaff(s);
  s.chronicle = [{ week: 1, date: { ...s.date }, text: `Memorial Day, 1960. ${displayName(boss)} has run Wildwood for Philadelphia since the war. Three heirs wait: Vito, Donato and Francesca. ${s.startingProblem}`, kind: 'misc' }];
  s.dynastyHistory = [{ week: 1, date: { ...s.date }, text: `${displayName(boss)} is head of the house of Sees.` }];
}

/** Rise to Power. */
function rise(s: GameState): void {
  const boss = s.characters[s.playerId];
  setAge(s, boss, 29);
  boss.rank = 'boss';
  boss.ambition = 'Get a seat at the Table';
  boss.wealth = 1500;
  // Too young for grown children: a young wife and a baby at most.
  for (const id of [...boss.childrenIds]) {
    const k = s.characters[id];
    if (k && ageOn(k.birth, s.date) > 6) removeCharacter(s, id);
  }
  boss.childrenIds = boss.childrenIds.filter((id) => s.characters[id]);
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife) {
    setAge(s, wife, 25);
    wife.childrenIds = wife.childrenIds.filter((id) => s.characters[id]);
  }
  const father = boss.fatherId ? s.characters[boss.fatherId] : undefined;
  if (father) setAge(s, father, 58);
  const mother = boss.motherId ? s.characters[boss.motherId] : undefined;
  if (mother) setAge(s, mother, 55);
  for (const sib of Object.values(s.characters).filter((c) => c.dynasty && c.fatherId === boss.fatherId && c.id !== boss.id)) setAge(s, sib, Math.max(18, Math.min(34, ageOn(sib.birth, s.date) - 10)));

  // A small crew: one capo, two soldiers, the associates.
  const men = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && !c.dynasty && c.rank !== 'civilian');
  let capos = 0;
  let soldiers = 0;
  for (const m of men) {
    let keep = false;
    if (m.rank === 'capo' && capos < 1) { keep = true; capos++; }
    else if (m.rank === 'soldier' && soldiers < 2) { keep = true; soldiers++; }
    else if (m.rank === 'associate') keep = true;
    if (!keep) {
      m.faction = 'none';
      m.rank = 'civilian';
    }
  }
  for (const d of s.districts) {
    if (d.capoId && s.characters[d.capoId]?.faction !== 'player') d.capoId = undefined;
    const p = d.influence.player ?? 0;
    const cut = Math.round(p * (d.id === 'pacific' || d.id === 'downtown' ? 0.55 : 0.3));
    d.influence.player = cut;
    d.influence.none = (d.influence.none ?? 0) + (p - cut);
  }
  // Rackets: the numbers bank and the arcade.
  s.businesses = s.businesses.filter((b) => b.owner !== 'player' || b.kind === 'numbers' || b.kind === 'arcade');
  s.money = 6000;
  s.respect = 15;
  s.debts = [];
  s.heat = { local: 8, family: 4, federal: 0 };
  const philly = s.rivals.find((r) => r.id === 'philly');
  if (philly) addOpinion(s, philly.leaderId, boss.id, 'Who is this kid?', -10, 1);
  s.council = emptyCouncil();
  fillCouncil(s);
  autoStaff(s);
  s.chronicle = [{ week: 1, date: { ...s.date }, text: `Memorial Day, 1960. ${displayName(boss)} has a numbers bank, an arcade on the piers and a few guys who believe in him. Philadelphia doesn't know his name. Yet.`, kind: 'misc' }];
  s.dynastyHistory = [{ week: 1, date: { ...s.date }, text: `${displayName(boss)} founds the house of ${s.houseName}.` }];
  s.startingProblem = '';
  for (const k of Object.keys(s.flags)) if (k.startsWith('problem_') || k === 'informant') delete s.flags[k];
}

/**
 * After a start reshapes the crew: everyone who left stops reporting to a
 * capo, everyone who stayed is in a valid regime, every capo has at least one
 * man under him (soldiers first), and outside guys have a living handler.
 */
function rebuildRegimes(s: GameState): void {
  for (const c of Object.values(s.characters)) {
    if (c.faction !== 'player' && !c.outside) c.capoId = undefined;
    if (c.faction === 'player' && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' || c.rank === 'boss')) c.capoId = undefined;
  }
  tidyRegimes(s);
  // No capo sits alone: take a soldier (or an associate) from the biggest regime.
  for (const k of capos(s)) {
    if (crew(s).some((m) => m.capoId === k.id)) continue;
    const pool = crew(s).filter((m) => (m.rank === 'soldier' || m.rank === 'associate') && m.capoId !== k.id && !m.dynasty)
      .sort((a, b) => (a.rank === b.rank ? 0 : a.rank === 'soldier' ? -1 : 1));
    if (pool[0]) assignTo(s, pool[0], k.id, `Sent to ${k.firstName}'s crew.`);
  }
  for (const c of crew(s)) if (c.id !== s.playerId) giveBio(s, c);
  const errs = validateHierarchy(s);
  if (errs.length) throw new Error(`Start built an invalid crew: ${errs.join('; ')}`);
}
