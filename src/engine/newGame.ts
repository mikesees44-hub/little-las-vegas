import { ageOn, START_DATE } from './calendar';
import { displayName, makeCharacter, rollTraits } from './characters';
import { autoStaff, newBusiness } from './business';
import { emptyCouncil, fillCouncil } from './council';
import { refreshHirePool } from './crewlife';
import { seedSecrets } from './secrets';
import { seedHierarchy } from './hierarchy';
import { addOpinion, changeMeter } from './relations';
import { chance, hashSeed, pick, randInt, shuffle } from './rng';
import { generateWeekEvents } from './events';
import { DISTRICTS, RIVALS } from './world';
import type { BusinessKind, Character, FactionId, GameState, Rival, Trait } from './types';

export const STARTING_MONEY = 25000;

export const STARTING_PROBLEMS = {
  debt: 'You still owe a Philadelphia shylock for the money that bought your way onto the island.',
  informant: 'Somebody in your crew is talking to the FBI. You don\'t know who.',
  skimmer: 'One of your capos has been skimming since before you took over.',
  bad_heart: 'Your doctor says your heart is not what it was. Go easy on the cigars.',
  grudge: 'Carmine Manno has never forgiven your father for a killing in 1951.',
  feds: 'An FBI field office opened in Atlantic City this spring. They already have your photograph.',
} as const;
export type StartingProblem = keyof typeof STARTING_PROBLEMS;

function emptyState(seed: string): GameState {
  return {
    version: 2,
    seed,
    rng: hashSeed(seed),
    nextId: 1,
    week: 1,
    date: { ...START_DATE },
    money: STARTING_MONEY,
    respect: 40,
    heat: { local: 0, family: 0, federal: 0 },
    playerId: '',
    houseName: '',
    successionLaw: 'blood',
    characters: {},
    relations: {},
    districts: [],
    businesses: [],
    rivals: [],
    debts: [],
    pendingEvents: [],
    eventQueue: [],
    scheduled: [],
    cooldowns: {},
    lastSitDownOrders: [],
    incomeHistory: [],
    weeksInRed: 0,
    flags: {},
    chronicle: [],
    dynastyHistory: [],
    startingProblem: '',
    unwashed: 0,
    loans: [],
    favors: 0,
    goals: { casinoStage: 0 },
    news: [],
    council: emptyCouncil(),
    edicts: {},
    hirePool: [],
    factions: [],
    cutscenes: [],
    schemes: [],
    secrets: [],
    hooks: [],
    claims: [],
    outposts: [],
    sanctions: {},
    wars: [],
    disputes: [],
    crewStats: { defections: 0, coups: 0, flips: 0, makings: 0, rivalCrewMoves: 0 },
    eventCooldowns: {},
  };
}

function link(father: Character, mother: Character | undefined, child: Character): void {
  child.fatherId = father.id;
  father.childrenIds.push(child.id);
  if (mother) {
    child.motherId = mother.id;
    mother.childrenIds.push(child.id);
  }
}

function deadAncestor(s: GameState, c: Character, causes: string[]): void {
  c.alive = false;
  const yearsAgo = randInt(s, 1, 12);
  const date = { y: s.date.y - yearsAgo, m: randInt(s, 1, 12), d: randInt(s, 1, 28) };
  c.death = { week: 0, date, cause: pick(s, causes) };
}

export function newGame(seed: string | number = Date.now()): GameState {
  const s = emptyState(String(seed));

  /* ---- The house ---- */
  const boss = makeCharacter(s, { rank: 'boss', faction: 'player', dynasty: true, ethnicity: 'Italian', age: randInt(s, 36, 50), nickname: true });
  boss.traits = rollTraits(s, 3);
  boss.wealth = randInt(s, 8, 20) * 1000;
  boss.ambition = pick(s, ['Take Atlantic City', 'Win a seat at Bruno\'s table', 'Own every club on Pacific Avenue', 'Leave his sons a legitimate empire']);
  s.playerId = boss.id;
  s.houseName = boss.lastName;

  const wife = makeCharacter(s, { gender: 'F', rank: 'civilian', faction: 'player', dynasty: true, age: Math.max(25, ageOn(boss.birth, s.date) - randInt(s, 0, 6)), nickname: false });
  wife.maidenName = wife.lastName;
  wife.lastName = boss.lastName;
  wife.spouseId = boss.id;
  boss.spouseId = wife.id;

  const bossAge = s.date.y - boss.birth.y;
  const father = makeCharacter(s, { rank: 'civilian', faction: 'player', dynasty: true, ethnicity: 'Italian', lastName: boss.lastName, age: bossAge + randInt(s, 24, 32), nickname: chance(s, 0.5) });
  const mother = makeCharacter(s, { gender: 'F', rank: 'civilian', faction: 'player', dynasty: true, ethnicity: 'Italian', age: s.date.y - father.birth.y - randInt(s, 0, 5), nickname: false });
  mother.maidenName = mother.lastName;
  mother.lastName = boss.lastName;
  mother.spouseId = father.id;
  father.spouseId = mother.id;
  link(father, mother, boss);
  if (chance(s, 0.55)) deadAncestor(s, father, ['heart attack', 'a stroke', 'shot outside a Camden social club', 'lung cancer']);
  if (chance(s, 0.3)) deadAncestor(s, mother, ['influenza', 'a stroke', 'cancer']);

  // Siblings
  const nSib = randInt(s, 1, 3);
  const siblings: Character[] = [];
  for (let i = 0; i < nSib; i++) {
    const g = chance(s, 0.55) ? 'M' : 'F';
    const sib = makeCharacter(s, {
      gender: g, ethnicity: 'Italian', lastName: boss.lastName, faction: 'player', dynasty: true,
      age: Math.max(20, bossAge + randInt(s, -10, 8)), rank: 'civilian', nickname: g === 'M' && chance(s, 0.6),
    });
    link(father, mother, sib);
    if (g === 'F' && chance(s, 0.7)) {
      sib.maidenName = sib.lastName;
      sib.lastName = pick(s, ['Ricci', 'Lombardo', 'Caruso', 'Testa', 'Pagano', 'Fusco', 'Scarpa']);
    }
    siblings.push(sib);
  }

  // Children
  const wifeAge = s.date.y - wife.birth.y;
  const nKids = randInt(s, 1, 4);
  for (let i = 0; i < nKids; i++) {
    const maxAge = Math.max(0, wifeAge - 19);
    const g = i === 0 && chance(s, 0.65) ? 'M' : chance(s, 0.5) ? 'M' : 'F';
    const kid = makeCharacter(s, { gender: g, ethnicity: 'Italian', lastName: boss.lastName, faction: 'player', dynasty: true, rank: 'civilian', age: randInt(s, 0, maxAge), nickname: false, wealth: 0 });
    kid.ambition = g === 'M' ? pick(s, ['Make his father proud', 'Go to Villanova', 'Play ball for the Phillies', 'Get off the island']) : pick(s, ['Go to nursing school', 'Marry well', 'Sing at the Riptide', 'Get off the island']);
    link(boss, wife, kid);
    addOpinion(s, kid.id, boss.id, 'My father', 25, 0);
  }
  addOpinion(s, wife.id, boss.id, 'My husband', 25, 0);
  addOpinion(s, boss.id, wife.id, 'My wife', 25, 0);
  for (const sib of siblings) addOpinion(s, sib.id, boss.id, 'Blood is blood', 15, 0);
  if (siblings.length && chance(s, 0.4)) addOpinion(s, siblings[0].id, boss.id, 'Father gave him the business, not me', -20, 0);

  /* ---- The crew (~11 including underboss & consigliere) ---- */
  const core = DISTRICTS.filter((d) => d.core);
  const brother = siblings.find((x) => x.gender === 'M' && s.date.y - x.birth.y >= 21);
  const crewSpec: { rank: Character['rank']; district?: string }[] = [
    { rank: 'underboss' }, { rank: 'consigliere' },
    ...core.map((d) => ({ rank: 'capo' as const, district: d.id })),
    { rank: 'soldier' }, { rank: 'soldier' }, { rank: 'soldier' }, { rank: 'associate' }, { rank: 'associate' },
  ];
  if (randInt(s, 0, 1)) crewSpec.push({ rank: 'associate' });
  const capoByDistrict: Record<string, string> = {};
  let usedBrother = false;
  for (const spec of crewSpec) {
    let c: Character;
    if (brother && !usedBrother && (spec.rank === 'capo' || spec.rank === 'soldier') && chance(s, 0.6)) {
      c = brother;
      c.rank = spec.rank;
      usedBrother = true;
    } else {
      const age = spec.rank === 'associate' ? randInt(s, 19, 28) : spec.rank === 'soldier' ? randInt(s, 24, 45) : randInt(s, 34, 62);
      c = makeCharacter(s, { rank: spec.rank, faction: 'player', age });
    }
    if (spec.district) capoByDistrict[spec.district] = c.id;
    // Opinions of the boss with reasons.
    const reasons: [string, number][] = [
      ['Known him since Catholic school', 12], ['He made my bones', 15], ['Passed over for capo', -15],
      ['Owes me from the old days', -8], ['Took care of my mother when she was sick', 18], ['Thinks he\'s better than us', -10],
      ['Earns for everybody', 10], ['Never forgot my name', 6],
    ];
    const n = randInt(s, 1, 2);
    for (const [r, v] of shuffle(s, reasons).slice(0, n)) {
      if (r === 'Passed over for capo' && spec.rank === 'capo') continue;
      addOpinion(s, c.id, boss.id, r, v, 0);
    }
    if (c.traits.includes('Loyal-to-a-fault')) addOpinion(s, c.id, boss.id, 'Loyal to the bone', 20, 0);
    changeMeter(s, c.id, boss.id, 'fear', randInt(s, 5, 30));
  }

  /* ---- Districts ---- */
  for (const d of DISTRICTS) {
    const infl: Partial<Record<FactionId, number>> = {};
    switch (d.id) {
      case 'boardwalk': infl.player = randInt(s, 70, 85); infl.feldstein = randInt(s, 5, 15); break;
      case 'pacific': infl.player = randInt(s, 75, 90); infl.kessler = randInt(s, 0, 8); break;
      case 'piers': infl.player = randInt(s, 70, 85); infl.feldstein = randInt(s, 0, 10); break;
      case 'downtown': infl.player = randInt(s, 70, 85); break;
      case 'docks': infl.player = randInt(s, 30, 50); infl.manno = randInt(s, 10, 25); break;
      case 'crest': infl.player = randInt(s, 35, 55); infl.feldstein = randInt(s, 10, 25); break;
      case 'north': infl.player = randInt(s, 10, 20); infl.kessler = randInt(s, 55, 70); break;
      case 'causeway': infl.player = randInt(s, 15, 25); infl.manno = randInt(s, 30, 45); break;
    }
    const used = Object.values(infl).reduce((a, b) => a + (b ?? 0), 0);
    infl.none = Math.max(0, 100 - used);
    s.districts.push({ id: d.id, name: d.name, streetBase: d.streetBase, influence: infl, capoId: capoByDistrict[d.id], description: d.description });
  }

  /* ---- Businesses ---- */
  const startBiz: [BusinessKind, string][] = [
    ['club', 'pacific'], ['numbers', 'downtown'], ['bookmaking', 'downtown'], ['arcade', 'piers'], ['restaurant', 'boardwalk'],
  ];
  if (chance(s, 0.5)) startBiz.push(['boarding', 'crest']);
  for (const [kind, did] of startBiz) {
    const b = newBusiness(s, kind, did);
    b.id = `b${s.nextId++}`;
    b.boughtWeek = 0;
    s.businesses.push(b);
  }

  /* ---- Rivals ---- */
  for (const def of RIVALS) {
    const leader = makeCharacter(s, {
      firstName: def.leader.first, lastName: def.leader.last, ethnicity: def.leader.ethnicity,
      age: randInt(s, def.leader.age[0], def.leader.age[1]), rank: def.leader.rank, faction: def.id, nickname: false,
    });
    if (def.leader.nickname) leader.nickname = def.leader.nickname;
    if (def.id === 'law') leader.traits = shuffle(s, ['Ambitious', 'Honest', 'Paranoid', 'Patient', 'Charming', 'Vengeful'] as const).slice(0, 2) as Character['traits'];
    const r: Rival = {
      id: def.id, name: def.name, shortName: def.shortName, kind: def.kind, leaderId: leader.id,
      goal: pick(s, def.goals), money: randInt(s, def.money[0], def.money[1]), muscle: randInt(s, def.muscle[0], def.muscle[1]),
      exposure: randInt(s, 5, 25), homeDistrict: def.home, moveCooldowns: {},
    };
    s.rivals.push(r);
    // Initial attitudes toward the player.
    const base: Record<string, [string, number]> = {
      manno: ['Wildwood should be ours', -10],
      feldstein: ['A useful local partner', 5],
      kessler: ['Wants North Wildwood', -5],
      philly: ['Earns for the family', 10],
      law: ['A headline waiting to happen', -15],
    };
    const [reason, v] = base[def.id];
    addOpinion(s, leader.id, boss.id, reason, v + randInt(s, -5, 5), 0);
  }
  // Rivals' views of each other.
  const mob = s.rivals.filter((r) => r.kind === 'mob');
  for (const a of mob) for (const b of mob) if (a !== b) addOpinion(s, a.leaderId, b.leaderId, 'Competition', randInt(s, -15, 5), 0);

  /* ---- Lieutenants, the Table's capos, and fictional officials ---- */
  for (const r of s.rivals.filter((x) => x.kind === 'mob')) {
    for (let i = 0; i < 2; i++) {
      const lt = makeCharacter(s, { rank: 'capo', faction: r.id, age: randInt(s, 28, 52), ethnicity: s.characters[r.leaderId].ethnicity });
      addOpinion(s, lt.id, r.leaderId, 'My boss', randInt(s, 0, 25), 0);
    }
  }
  const philly = s.rivals.find((x) => x.id === 'philly')!;
  for (const [first, last, office] of [['Leo', 'Carbone', 'Camden capo'], ['Tommy', 'Nardella', 'Trenton capo']] as const) {
    const c = makeCharacter(s, { firstName: first, lastName: last, rank: 'capo', faction: 'philly', ethnicity: 'Italian', age: randInt(s, 45, 62) });
    c.office = office;
    addOpinion(s, c.id, boss.id, 'Another capo at the Table', randInt(s, -10, 15), 0);
    addOpinion(s, c.id, philly.leaderId, 'Sits at the same Table', 20, 0);
  }
  const OFFICIALS: [string, string, string, 'Irish' | 'Italian' | 'Jewish'][] = [
    ['Thomas', 'Healy', 'Police sergeant', 'Irish'],
    ['Edward', 'Gorman', 'Chief of Police', 'Irish'],
    ['Harold', 'Voss', 'County judge', 'Irish'],
    ['Frank', 'Dougherty', 'City councilman', 'Irish'],
    ['Roy', 'Pruitt', 'State assemblyman', 'Irish'],
    ['Walter', 'Kerns', 'IRS agent', 'Irish'],
  ];
  for (const [first, last, office, eth] of OFFICIALS) {
    const c = makeCharacter(s, { firstName: first, lastName: last, rank: 'civilian', faction: office === 'IRS agent' ? 'law' : 'none', ethnicity: eth, age: randInt(s, 38, 60), nickname: false });
    c.office = office;
    c.ambition = office === 'IRS agent' ? 'Make a case that gets him to Washington' : 'Keep his job and his pension';
  }
  seedSecrets(s);

  /* ---- Heat & a starting problem ---- */
  s.heat = { local: randInt(s, 12, 25), family: randInt(s, 5, 15), federal: randInt(s, 3, 10) };
  const problem = pick(s, Object.keys(STARTING_PROBLEMS) as StartingProblem[]);
  s.startingProblem = STARTING_PROBLEMS[problem];
  s.flags[`problem_${problem}`] = 1;
  switch (problem) {
    case 'debt':
      s.debts.push({ id: `d${s.nextId++}`, lender: 'A Philadelphia shylock', principal: 9000, weeklyPayment: 300, weeksLeft: 36 });
      break;
    case 'informant': {
      const pool = Object.values(s.characters).filter((c) => c.faction === 'player' && (c.rank === 'soldier' || c.rank === 'associate') && !c.dynasty);
      const rat = pool.length ? pick(s, pool) : undefined;
      if (rat) s.flags.informant = Number(rat.id.slice(1));
      break;
    }
    case 'skimmer': {
      const capoIds = Object.values(capoByDistrict);
      const c = s.characters[pick(s, capoIds)];
      if (!c.traits.includes('Greedy')) c.traits = (['Greedy'] as Trait[]).concat(c.traits.filter((t) => t !== 'Honest' && t !== 'Loyal-to-a-fault')).slice(0, 3);
      c.skimmed = 2200;
      break;
    }
    case 'bad_heart':
      if (!boss.conditions.includes('Bad heart')) boss.conditions.push('Bad heart');
      boss.health = Math.min(boss.health, 62);
      break;
    case 'grudge': {
      const manno = s.rivals.find((r) => r.id === 'manno')!;
      addOpinion(s, manno.leaderId, boss.id, 'Your father killed my cousin in 1951', -30, 0);
      changeMeter(s, manno.leaderId, boss.id, 'grievance', 45);
      break;
    }
    case 'feds':
      s.heat.federal = 35;
      break;
  }

  s.chronicle.push({ week: 1, date: { ...s.date }, text: `Memorial Day, 1960. ${displayName(boss)} runs the island for Philadelphia. ${s.startingProblem}`, kind: 'misc' });
  s.dynastyHistory.push({ week: 1, date: { ...s.date }, text: `${displayName(boss)} is head of the house of ${s.houseName}.` });

  fillCouncil(s);
  seedHierarchy(s);
  refreshHirePool(s);
  autoStaff(s);
  s.pendingEvents = generateWeekEvents(s);
  return s;
}
