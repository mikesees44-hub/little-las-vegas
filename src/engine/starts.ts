import { startPocket } from './tributeState';
import { repairGoals } from './goalRules';
import { ageOn } from './calendar';
import { birthForAge, displayName, makeCharacter } from './characters';
import { emptyCouncil, fillCouncil } from './council';
import { autoStaff } from './business';
import { generateWeekEvents } from './events';
import { newGame } from './newGame';
import { rankStart } from './station';
import { addOpeningScene } from './scenes';
import { refreshDynastyAfterStart } from './family';
import { setupHouses } from './housesLife';
import { addOpinion } from './relations';
import { addStory, assignTo, giveBio, smallestRegime, tidyRegimes, transferRegime, validateHierarchy } from './hierarchy';
import { capos, crew } from './characters';
import type { Character, GameState, Trait } from './types';
import { applyCharOptions, type CharOptions } from './charCreate';
import { newBusiness } from './business';
import { ensureAging } from './aging';
import { ensureNightlife } from './nightlife';
import { startRomance } from './romance';
import { ensureTribute } from './tributeState';
import { randInt } from './rng';
import { scheduleOpening, seedOldDon } from './oldDon';
import { seedThreat } from './threats';
import type { RivalId } from './types';

/**
 * How a game begins.
 *  - classic: the house already runs the island for Philadelphia (the default).
 *  - rise: Rise to Power. A young man with a numbers bank, a few guys and a
 *    name nobody in Philadelphia knows yet.
 *  - sees: the House of Sees. Don Salvatore "The Shark" Sees, an old boss
 *    near the end of his reign, with three grown heirs: Vito, Donato and
 *    Francesca. (A fictional family.)
 */
export type StartId = 'classic' | 'olddon' | 'rise' | 'sees' | 'associate' | 'soldier' | 'capo';

export const STARTS: Record<StartId, { name: string; text: string }> = {
  olddon: { name: 'The Old Don', text: 'Don Vincenzo "the Old Man" Sees, sixty-six, ten years in the chair. Rich, loved, and everyone is posting up for what comes after him.' },
  classic: { name: 'The House', text: 'You already run Wildwood for Philadelphia. A full crew, five rackets, and one problem from the past.' },
  rise: { name: 'Rise to Power', text: 'A young man with a numbers bank, a few guys and $6,000. Nobody in Philadelphia knows your name yet.' },
  sees: { name: 'The House of Sees', text: 'Don Salvatore "The Shark" Sees, sixty years old, and three heirs who all want the chair: Vito, Donato and Francesca.' },
  associate: { name: 'Start as an associate', text: 'Not even made. Two guys, a corner, and Don Cosimo Valente above you taking 30%.' },
  soldier: { name: 'Start as a soldier', text: 'A made man with a few guys of his own, kicking up a quarter to Don Cosimo Valente.' },
  capo: { name: 'Start as a capo', text: 'Your own crew in the Valente family. Fifteen percent up the ladder, and the chair one step further.' },
};

/** `charOptions` (the character creator) is applied on top of any start. */
export function newGameWith(seed: string, start: StartId = 'classic', charOptions?: CharOptions): GameState {
  // The houses are built once the start (and the creator) has shaped the family.
  const s = newGame(seed, { skipHouses: start !== 'classic' || !!charOptions });
  if (start === 'classic' && !charOptions) {
    repairGoals(s);
    addOpeningScene(s, start);
    return s;
  }
  if (start === 'classic') return finish(s, start, charOptions);
  if (start === 'rise' || start === 'associate' || start === 'soldier' || start === 'capo') rise(s);
  else if (start === 'olddon') oldDonStart(s);
  else sees(s);
  if (start === 'associate' || start === 'soldier' || start === 'capo') rankStart(s, start);
  rebuildRegimes(s);
  s.flags[`start_${start}`] = 1;
  return finish(s, start, charOptions);
}

function finish(s: GameState, start: StartId, charOptions?: CharOptions): GameState {
  if (charOptions) applyCharOptions(s, start, charOptions);
  startPocket(s);
  // The Old Don: the hands are dealt to the man the creator made (his name, his sex, his wife).
  if (start === 'olddon') dealOldDon(s);
  refreshDynastyAfterStart(s);
  repairGoals(s);
  setupHouses(s);
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
    if (c.maidenName === from) c.maidenName = to;
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
  const shift = 60 - ageOn(boss.birth, s.date);
  setAge(s, boss, 60);
  // His parents and brothers and sisters age with him (a generation older).
  for (const c of Object.values(s.characters)) {
    if (!c.dynasty || c.id === boss.id) continue;
    const parent = c.id === boss.fatherId || c.id === boss.motherId;
    const sibling = !!boss.fatherId && c.fatherId === boss.fatherId;
    if (parent || sibling) c.birth = { ...c.birth, y: c.birth.y - shift };
  }
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

/* ------------------------------------------------------------------ */
/* The Old Don (1960)                                                   */
/* ------------------------------------------------------------------ */

/** Ten years in the chair: the man, the money, the family, a decade of peace in the chronicle. */
function oldDonStart(s: GameState): void {
  const boss = s.characters[s.playerId];
  rename(s, boss.lastName, 'Sees');
  boss.firstName = 'Vincenzo';
  boss.nickname = 'the Old Man';
  const shift = 66 - ageOn(boss.birth, s.date);
  setAge(s, boss, 66);
  for (const c of Object.values(s.characters)) {
    if (!c.dynasty || c.id === boss.id) continue;
    const sibling = !!boss.fatherId && c.fatherId === boss.fatherId;
    if (sibling || c.id === boss.fatherId || c.id === boss.motherId) c.birth = { ...c.birth, y: c.birth.y - shift };
  }
  boss.traits = ['Womanizer', 'Drinker', 'Charming'];
  boss.vices = ['women', 'booze'];
  boss.orientation = 'straight';
  boss.attributes = { leadership: 76, business: 70, diplomacy: 74, intrigue: 60, force: 42, discipline: 58 };
  boss.health = 66;
  boss.ambition = 'Name his successor on his own terms';
  for (const p of [boss.fatherId, boss.motherId]) {
    const c = p ? s.characters[p] : undefined;
    if (c?.alive) { c.alive = false; c.death = { week: 0, date: { y: 1947, m: 2, d: 11 }, cause: 'old age' }; }
  }
  // The wine and the years: a heart the doctor has started to mention, knees that know the weather.
  const A = ensureAging(s);
  A.p[boss.id] = { t: { heart: 2, bones: 1 }, at: { heart: s.week - 30, bones: s.week - 60 }, dx: ['heart'] };
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife) { wife.firstName = 'Concetta'; setAge(s, wife, 62); wife.traits = ['Pious', 'Patient']; }
  for (const id of [...boss.childrenIds]) removeCharacter(s, id);
  boss.childrenIds = [];
  if (wife) wife.childrenIds = [];
  // The quiet one with the motel, the daughter in the Crest, the hothead who wants in.
  const kids: [string, 'M' | 'F', number, Trait[], string, number][] = [
    ['Paolo', 'M', 38, ['Patient', 'Honest'], 'Run the motor inn honest and keep his father out of it', 18000],
    ['Teresa', 'F', 34, ['Charming', 'Pious'], 'Keep the family at one table on Sunday', 9000],
    ['Nicky', 'M', 29, ['Hot-headed', 'Ambitious'], 'Get made, whatever his father says', 4000],
  ];
  for (const [first, g, age, traits, amb, wealth] of kids) {
    const k = makeCharacter(s, { firstName: first, gender: g, lastName: 'Sees', ethnicity: 'Italian', faction: 'player', dynasty: true, rank: 'civilian', age, nickname: false, wealth });
    k.traits = traits;
    k.ambition = amb;
    k.fatherId = boss.id;
    boss.childrenIds.push(k.id);
    if (wife) { k.motherId = wife.id; wife.childrenIds.push(k.id); }
    addOpinion(s, k.id, boss.id, 'My father', 25, 0);
  }
  const [paolo, teresa, nicky] = boss.childrenIds.map((id) => s.characters[id]);
  addStory(s, paolo, 'His father set him up with the Sees Motor Inn on Ocean Avenue, clean books and all.');
  addStory(s, teresa, 'Her father gave her the house on Cardinal Road in the Crest when she married.');
  addStory(s, nicky, 'His father bought him a house on Glenwood Avenue and told him to stay out of the life.');
  addOpinion(s, nicky.id, boss.id, 'Won\'t let me in the life', -12, 0);
  addOpinion(s, nicky.id, paolo.id, 'Father\'s favorite, and he doesn\'t even want it', -10, 0);
  addOpinion(s, paolo.id, nicky.id, 'A hothead who will get himself killed', -6, 0);
  const inn = newBusiness(s, 'motel', 'crest', 'The Sees Motor Inn');
  inn.id = `b${s.nextId++}`;
  inn.boughtWeek = 0;
  s.businesses.push(inn);
  // The money: ten years of envelopes that were never light.
  s.money = 60000;
  s.respect = 62;
  s.heat = { local: 10, family: 4, federal: 8 };
  s.debts = [];
  s.edicts.nojunk = true;
  s.startingProblem = 'Everyone is posting up for what comes after you. You don\'t know how big the move will be.';
  for (const k of Object.keys(s.flags)) if (k.startsWith('problem_') || k === 'informant') delete s.flags[k];
  // Deaths waiting around him: an old friend in Ocean City, a Philadelphia elder, the Feldstein old man.
  const feld = s.rivals.find((r) => r.id === 'feldstein');
  const fl = feld ? s.characters[feld.leaderId] : undefined;
  if (fl) { setAge(s, fl, 72); fl.health = 36; }
  const nard = Object.values(s.characters).find((c) => c.office === 'Trenton capo');
  if (nard) { setAge(s, nard, 74); nard.health = 34; }
  // A priest who hears more than confession.
  const priest = makeCharacter(s, { firstName: 'Aloysius', lastName: 'Brennan', rank: 'civilian', faction: 'none', ethnicity: 'Irish', age: 63, nickname: false });
  priest.office = 'Pastor of St. Ann\'s';
  priest.ambition = 'A new roof for St. Ann\'s, and the old man\'s soul';
  addOpinion(s, priest.id, boss.id, 'Paid for the new organ, never asked for a plaque', 25, 0);
  s.council = emptyCouncil();
  fillCouncil(s);
  autoStaff(s);
  const name = displayName(boss);
  const d = (y: number, m: number) => ({ y, m, d: 14 });
  const decade: [number, number, string][] = [
    [1950, 6, `${name} takes the chair after Don Gaetano Russo's heart gives out at the Shore Fast Line station. Philadelphia sends a wreath and a yes.`],
    [1951, 9, `${name} settles the Manno grievance over clams at the Hotel Dennis instead of in the street.`],
    [1952, 4, `${name} buys the house on Glenwood Avenue. The Barolo starts going down to the cellar a case at a time.`],
    [1953, 8, 'The senators\' investigators come to the shore. Nobody from Wildwood says a word.'],
    [1954, 10, 'Paolo marries at Notre Dame de la Mer: four hundred guests and a cake that came down from Philadelphia in its own car.'],
    [1955, 7, `"No junk in Wildwood." ${name} keeps narcotics off the island. Philadelphia approves; the young crews grumble.`],
    [1956, 5, 'Teresa marries into the Crest. Her father gives her the house on Cardinal Road.'],
    [1957, 11, `The big meeting upstate goes bad for everybody who went. ${name} stayed home and played pinochle.`],
    [1958, 3, 'Paolo opens the Sees Motor Inn on Ocean Avenue. Clean books. His father never sets foot in the office.'],
    [1959, 9, 'A tenth summer without a body on the boardwalk. The Daily Tide calls him "a Pacific Avenue businessman."'],
  ];
  s.chronicle = decade.map(([y, m, text]) => ({ week: 0, date: d(y, m), text, kind: 'misc' as const }));
  s.chronicle.push({ week: 1, date: { ...s.date }, text: `Memorial Day, 1960. ${name} has ruled Wildwood for ten years: order, peace, and money for everybody who matters. ${s.startingProblem}`, kind: 'misc' });
  s.dynastyHistory = [
    { week: 0, date: d(1950, 6), text: `${name} becomes head of the house of Sees.` },
    { week: 0, date: d(1954, 10), text: 'Paolo Sees marries.' },
    { week: 0, date: d(1956, 5), text: 'Teresa Sees marries into the Crest.' },
    { week: 1, date: { ...s.date }, text: `${name} begins his eleventh year in the chair.` },
  ];
}

/**
 * Deal the Old Don's hands once the creator has shaped him: the goomars
 * (only with a man who wants women, and women who said yes years ago), the
 * Kessler brother-in-law, the hidden plans, the first tips, the opening weeks.
 */
function dealOldDon(s: GameState): void {
  const boss = s.characters[s.playerId];
  const T = ensureTribute(s);
  T.acct.personal = Math.max(T.acct.personal, 220000);
  const N = ensureNightlife(s);
  let goomarId: string | undefined;
  let kmanId: string | undefined;
  const homes = ['an apartment over the bakery on Pacific Avenue', 'a garden apartment on Atlantic Avenue in the Crest'];
  const ladies = boss.gender === 'M' && boss.traits.includes('Womanizer') ? (randInt(s, 0, 1) ? 2 : 1) : 0;
  for (let i = 0; i < ladies; i++) {
    const her = makeCharacter(s, { gender: 'F', rank: 'civilian', faction: 'none', ethnicity: i === 0 ? 'Irish' : 'Italian', age: i === 0 ? 36 : 29, nickname: false });
    her.orientation = 'straight';
    her.ambition = i === 0 ? 'Keep her own place and her own name' : 'Sing at the Riptide on a Saturday night';
    if (!startRomance(s, boss.id, her.id)) { removeCharacter(s, her.id); continue; }
    N.goomars[her.id] = { id: her.id, since: -randInt(s, 60, 200), rent: i === 0 ? 60 : 45, allowance: i === 0 ? 90 : 70, missed: 0, where: homes[i] };
    addOpinion(s, her.id, boss.id, 'He has kept me for years, and kept his word', 18, 0);
    if (i === 0) goomarId = her.id;
  }
  // Her sister married a Kessler man.
  if (goomarId) {
    const her = s.characters[goomarId];
    const km = makeCharacter(s, { gender: 'M', rank: 'soldier', faction: 'kessler', ethnicity: 'Irish', age: 39 });
    km.ambition = 'Move up in North Wildwood';
    addStory(s, km, `Married ${her.firstName} ${her.lastName}'s sister.`);
    const kess = s.rivals.find((r) => r.id === 'kessler');
    if (kess) addOpinion(s, km.id, kess.leaderId, 'My boss', 15, 0);
    kmanId = km.id;
  }
  const od = seedOldDon(s, { kmanId });
  const envoy = Object.values(s.characters).find((c) => c.alive && c.office === 'Camden capo');
  scheduleOpening(s, goomarId, envoy?.id);
  // The shore family's first word reaches the boss in week one: real, or a bluff to see who flinches.
  const rv = od.hands.find((h) => h.role === 'rival');
  const old = od.hands.find((h) => h.role === 'old');
  const biz = s.businesses.filter((b) => b.owner === 'player');
  if (rv?.rival && old?.id && biz.length) {
    const b = biz[randInt(s, 0, biz.length - 1)];
    const due = s.week + randInt(s, 5, 7);
    const by = rv.rival as RivalId;
    if (rv.real) seedThreat(s, { kind: 'racket', by, bizId: b.id, district: b.districtId, due }, { kind: 'racket', by, bizId: b.id, district: b.districtId }, old.id, 'solid', due);
    else seedThreat(s, undefined, { kind: 'move', by, district: b.districtId }, old.id, 'false', due, by);
  }
  // The underboss has been running the day-to-day while the Don enjoys his life.
  T.ub.authority = 'executive';
}
