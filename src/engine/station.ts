import { ageOn } from './calendar';
import { crew, displayName, isFree, makeCharacter, player } from './characters';
import { addSuccess, attr } from './attrs';
import { tidyCouncil } from './council';
import { shiftInfluence } from './effects';
import { addStory, tidyRegimes } from './hierarchy';
import { killCharacter } from './dynasty';
import type { Acceptance, Reason } from './interactions';
import { money, respect, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { chance } from './rng';
import { pw, type Station } from './powerState';
import type { Character, EventInstance, GameState } from './types';

/**
 * FALL and RISE (design item 16, last bullets). Losing the top spot does not
 * end the game: you go on as a soldier in the usurper's family, an exile in
 * Florida, or an independent crew — and climb back. A new game can also
 * start at any rung: associate, soldier, capo or boss.
 *
 * The engine's invariant holds throughout: the player's character is always
 * the head of his own house and crew (`rank: 'boss'` of faction 'player').
 * The *station* is his place in the wider family above him: the man he
 * kicks up to (`power.overId`), how much he kicks up, and the ladder back.
 */

export const STATION_INFO: Record<Station, { name: string; text: string; kick: number; rank: number }> = {
  boss: { name: 'Boss of the family', text: 'You answer to Philadelphia and to nobody in Wildwood.', kick: 0, rank: 5 },
  underboss: { name: 'Underboss', text: 'Second in the family. The chair is one funeral away.', kick: 0.1, rank: 4 },
  capo: { name: 'Capo', text: 'Your own crew; a fat envelope up to the boss every week.', kick: 0.15, rank: 3 },
  soldier: { name: 'Soldier', text: 'A made man with a few guys of his own. The boss takes a quarter.', kick: 0.25, rank: 2 },
  associate: { name: 'Associate', text: 'Not even made. You hustle, you kick up, you wait for the books to open.', kick: 0.3, rank: 1 },
  exile: { name: 'In exile', text: 'Florida. The money comes slowly and the phone rarely rings. You can come back when it is safe.', kick: 0, rank: 0 },
  independent: { name: 'Independent crew', text: 'Your own men, nobody\'s permission, and a family that wants you dead.', kick: 0, rank: 1 },
};

const LADDER: Station[] = ['associate', 'soldier', 'capo', 'underboss', 'boss'];

export function overBoss(s: GameState): Character | undefined {
  const id = s.power?.overId;
  return id ? s.characters[id] : undefined;
}

/** Make the man above you (the family's boss when you start low). */
export function makeOverBoss(s: GameState, name?: { first: string; last: string; nick?: string }): Character {
  const c = makeCharacter(s, { firstName: name?.first ?? 'Cosimo', lastName: name?.last ?? 'Valente', gender: 'M', ethnicity: 'Italian', age: 58, rank: 'boss', faction: 'none', nickname: false, traits: ['Patient', 'Paranoid'] });
  if (name?.nick) c.nickname = name.nick;
  c.attributes = { leadership: 72, business: 60, diplomacy: 58, intrigue: 68, force: 55, discipline: 66 };
  c.ambition = 'Keep the family whole';
  c.office = 'Boss of the Wildwood family';
  c.wealth = 60000;
  return c;
}

/** Weekly: what your station costs you (the one ledger). */
export function stationWeek(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  if (p.station === 'boss') return;
  const over = overBoss(s);
  const gross = Math.max(0, ctx.gross);
  if (p.station === 'exile') {
    const loss = Math.round(gross * 0.5);
    if (loss) money(ctx, -loss, 'In exile: the money comes slowly to Florida', 'cost');
    return;
  }
  const rate = STATION_INFO[p.station].kick;
  if (rate && over?.alive) {
    const amt = Math.round(gross * rate);
    if (amt) money(ctx, -amt, `Kick-up to ${displayName(over)} (${Math.round(rate * 100)}%)`, 'tribute');
  }
}

/** The odds the man above you lets you climb a rung, with reasons. */
export function climbOdds(s: GameState): Acceptance {
  const p = s.power ?? { fallenWeek: 1, station: 'boss' as Station };
  const over = overBoss(s);
  const boss = player(s);
  const reasons: Reason[] = [];
  const add = (label: string, v: number) => { if (Math.round(v)) reasons.push({ label, value: Math.round(v) }); };
  add('Base', 10);
  add('Your reputation', (s.respect - 20) * 0.8);
  add('Men behind you', Math.min(20, crew(s).filter((c) => isFree(s, c)).length * 2));
  if (over) add(`What ${over.firstName} thinks of you`, opinion(s, over.id, boss.id) * 0.4);
  add('Money in the envelope', Math.min(15, s.money / 2000));
  const years = (s.week - (p.fallenWeek ?? 1)) / 52;
  add('Years at this rung', Math.min(10, years * 4));
  if (p.station === 'associate' && !s.books?.open) add('Philadelphia\'s books are closed', -15);
  if (p.station === 'underboss') add('Nobody hands over the chair', -25);
  return { chance: Math.max(0.03, Math.min(0.9, reasons.reduce((a, r) => a + r.value, 0) / 100)), reasons };
}

/** The odds of taking the family by force (from any rung), with reasons. */
export function takeoverOdds(s: GameState): Acceptance {
  const over = overBoss(s);
  const boss = player(s);
  const reasons: Reason[] = [];
  const add = (label: string, v: number) => { if (Math.round(v)) reasons.push({ label, value: Math.round(v) }); };
  const mine = crew(s).filter((c) => isFree(s, c));
  add('Your men', mine.reduce((a, c) => a + c.attributes.force, 0) / 12);
  add('Your command', (attr(s, boss, 'command') - 50) / 2);
  if (over) {
    add(`${over.firstName}'s loyalists`, -Math.min(40, (over.attrs?.followers ?? 0) * 2 + 15));
    add(`${over.firstName}'s age`, Math.max(0, ageOn(over.birth, s.date) - 60));
  }
  add('Surprise', 10);
  return { chance: Math.max(0.05, Math.min(0.8, reasons.reduce((a, r) => a + r.value, 0) / 100)), reasons };
}

function setStation(ctx: Ctx, st: Station, why: string): void {
  const s = ctx.s;
  const p = pw(s);
  const was = p.station;
  p.station = st;
  const boss = player(s);
  if (st === 'boss') {
    if (p.fell) p.stats.comebacks++;
    p.fell = false;
    const over = overBoss(s);
    if (over?.alive) {
      over.rank = 'civilian';
      over.office = undefined;
    }
    p.overId = undefined;
    addSuccess(s, boss, 'Took the chair of the family');
    s.cutscenes.push({ key: 'heir_rises', title: 'Boss', text: `${displayName(boss)} sits at the head of the table now. ${why}`, week: s.week });
  } else if (LADDER.indexOf(st) > LADDER.indexOf(was)) {
    p.stats.promotions++;
    addSuccess(s, boss, `Rose to ${STATION_INFO[st].name.toLowerCase()}`);
  }
  addStory(s, boss, `${STATION_INFO[st].name}: ${why}`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(boss)} is now ${STATION_INFO[st].name.toLowerCase()}. ${why}`, kind: 'succession' });
  ctx.log.push(`${STATION_INFO[st].name}: ${why}`);
}

export function climb(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  const i = LADDER.indexOf(p.station);
  if (p.station === 'exile' || p.station === 'independent') {
    setStation(ctx, 'soldier', 'Taken back into the family as a soldier.');
    return;
  }
  if (i < 0 || i >= LADDER.length - 1) return;
  const next = LADDER[i + 1];
  if (next === 'boss') {
    setStation(ctx, 'boss', `${overBoss(s)?.firstName ?? 'The old man'} stepped aside for you.`);
    const over = overBoss(s);
    if (over) over.alive && addStory(s, over, 'Stepped aside.');
    return;
  }
  setStation(ctx, next, 'The boss moved you up.');
}

/** Move on the man above you. Success: the chair. Failure: exile, or worse. */
export function takeover(ctx: Ctx, success: boolean): void {
  const s = ctx.s;
  const p = pw(s);
  const over = overBoss(s);
  if (success) {
    if (over?.alive) killCharacter(ctx, over.id, 'removed when the family changed hands', 'player');
    for (const c of Object.values(s.characters)) if (c.alive && c.faction === 'none' && p.followerIds?.includes(c.id)) rejoin(c);
    respect(ctx, 10, 'You took the family back', 'event');
    setStation(ctx, 'boss', 'You took it.');
  } else {
    respect(ctx, -8, 'Your move on the boss failed', 'event');
    if (over) addOpinion(s, over.id, s.playerId, 'Tried to take my chair', -50, 0);
    setStation(ctx, 'exile', 'The move failed. You got out of town alive.');
  }
}

function rejoin(c: Character): void {
  c.faction = 'player';
  if (c.rank === 'boss') c.rank = 'capo';
  c.capoId = undefined;
}

/**
 * The player loses the chair (a coup, a lost crisis, a deposition). The
 * usurper takes the family: his loyal men go with him, half the treasury and
 * the island. The player keeps his house and whoever stays loyal.
 */
export function depose(ctx: Ctx, usurperId: string, how: string): void {
  const s = ctx.s;
  const p = pw(s);
  const u = s.characters[usurperId];
  const boss = player(s);
  if (!u?.alive || u.id === boss.id) return;
  const goers = crew(s).filter((c) => c.id !== u.id && !c.dynasty && opinion(s, c.id, u.id) > opinion(s, c.id, boss.id));
  p.followerIds = [u.id, ...goers.map((c) => c.id)];
  for (const c of [u, ...goers]) {
    c.faction = 'none';
    c.capoId = undefined;
    for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
    for (const b of s.businesses) if (b.staffIds) b.staffIds = b.staffIds.filter((id) => id !== c.id);
  }
  u.rank = 'boss';
  u.office = 'Boss of the family';
  p.overId = u.id;
  p.fell = true;
  p.fallenWeek = s.week;
  p.stats.falls++;
  // He takes half the treasury and half the street.
  const half = Math.round(Math.max(0, s.money) / 2);
  if (half) money(ctx, -half, `${displayName(u)} takes the family treasury`, 'event');
  respect(ctx, -15, `You lost the chair (${how})`, 'event');
  for (const d of s.districts) {
    const mine = d.influence.player ?? 0;
    if (mine > 0) shiftInfluence(s, d.id, 'player', -Math.round(mine / 2));
  }
  tidyCouncil(s);
  tidyRegimes(s);
  const loyal = crew(s).length;
  const st: Station = loyal >= 5 ? 'independent' : attr(s, u, 'conscience') >= 45 || opinion(s, u.id, boss.id) > -10 ? 'soldier' : 'exile';
  p.station = st;
  addOpinion(s, u.id, boss.id, 'Used to be my boss', -10, 1);
  const text = `${displayName(u)} took the family (${how}). ${displayName(boss)} is ${STATION_INFO[st].name.toLowerCase()} now${st === 'soldier' ? ', kicking up to the man who took his chair' : st === 'exile' ? ', in Florida' : `, with ${loyal} men who stayed`}.`;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'succession' });
  s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
  ctx.log.push(text);
  addStory(s, boss, `Lost the chair to ${displayName(u)}.`);
  s.cutscenes.push({ key: 'betrayal_confrontation', title: 'Deposed', text: `${displayName(u)} sits in your chair at the social club. Your coat is on the rack by the door.`, week: s.week });
  s.eventQueue.push(buildFallen(s, u, st));
}

/** Right after the fall: kneel, run, or keep your men. */
export function buildFallen(s: GameState, u: Character, def: Station): EventInstance {
  const label = 'The fall';
  const op = (station: Station) => ({ type: 'power', op: { op: 'station', station }, label }) as const;
  const loyal = crew(s).length;
  return {
    iid: `ev${s.nextId++}`, defId: 'power_fallen', week: s.week, mandatory: true, priority: 97,
    title: 'The chair is gone',
    text: `${displayName(u)} has the family now. What is left to you: the house, ${loyal} men who stayed, and a choice about what kind of man you are going to be from here.`,
    defaultChoiceId: def, meta: { who: u.id },
    actors: [u.id],
    choices: [
      { id: 'soldier', label: `Kneel: a soldier in ${u.firstName}'s family`, detail: 'Kick up a quarter. Wait. Climb.', because: `knelt to ${u.firstName}`, effects: [op('soldier')] },
      { id: 'exile', label: 'Florida, until it is safe', detail: 'Half the money, none of the bullets. Come back when you choose.', because: 'went into exile in Florida', effects: [op('exile')] },
      { id: 'independent', label: 'Keep your men: an independent crew', detail: `No kick-up. ${u.firstName} will want you dead.`, because: 'kept an independent crew', effects: [op('independent')], disabledReason: loyal < 3 ? 'Not enough men stayed with you' : undefined },
    ],
  };
}

export function chooseStation(ctx: Ctx, st: Station): void {
  const p = pw(ctx.s);
  if (p.station === st) return;
  p.station = st;
  ctx.log.push(`You are ${STATION_INFO[st].name.toLowerCase()} now.`);
}

/** Monthly: the man above you may die or retire; independents are hunted; exiles wait. */
export function stationMonth(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  if (p.station === 'boss') return;
  const over = overBoss(s);
  if (!over?.alive) {
    // The chair is open: the highest-ranking man takes it.
    if (p.station === 'capo' || p.station === 'underboss' || (p.station === 'soldier' && s.respect >= 40)) {
      setStation(ctx, 'boss', `${over ? displayName(over) : 'The old boss'} is gone, and the family turned to you.`);
      return;
    }
    const heirOver = makeOverBoss(s, { first: 'Aldo', last: over?.lastName ?? 'Valente' });
    p.overId = heirOver.id;
    ctx.log.push(`${displayName(heirOver)} takes over the family above you. You were passed over.`);
    return;
  }
  if (p.station === 'independent' && chance(p, 0.04)) {
    // The family he defied sends a message.
    const victim = crew(s).filter((c) => isFree(s, c) && !c.dynasty).sort((a, b) => a.attributes.force - b.attributes.force)[0];
    if (victim) {
      killCharacter(ctx, victim.id, `killed by ${displayName(over)}'s people`, 'none');
      tidyCouncil(s);
      ctx.log.push(`${displayName(victim)} was found in the marsh: ${over.firstName} wants your crew back.`);
    }
  }
  if (p.station === 'exile' && s.week - (p.fallenWeek ?? s.week) > 52 && chance(p, 0.08)) {
    ctx.log.push('A call from Wildwood: it might be safe to come home.');
  }
}

/** Climbing is possible from this station right now (and why not). */
export function climbDisabled(s: GameState): string | undefined {
  const p = s.power;
  if (!p || p.station === 'boss') return 'You are the boss';
  if (p.station === 'exile' && s.week - (p.fallenWeek ?? s.week) < 26) return 'Too soon to come home (six months in Florida)';
  if (s.week - (p.climbWeek ?? -99) < 13) return 'You asked recently';
  return undefined;
}

/**
 * Start lower on the ladder (built on Rise to Power): fewer men, less money,
 * and a boss above you who takes his cut every week.
 */
export function rankStart(s: GameState, st: 'associate' | 'soldier' | 'capo'): void {
  const p = pw(s);
  const boss = player(s);
  const keep = { associate: { soldier: 0, associate: 2 }, soldier: { soldier: 1, associate: 3 }, capo: { soldier: 2, associate: 99 } }[st];
  let soldiers = 0;
  let assoc = 0;
  for (const m of Object.values(s.characters)) {
    if (!m.alive || m.faction !== 'player' || m.dynasty || m.rank === 'civilian' || m.outside) continue;
    let stay = false;
    if (m.rank === 'capo') {
      // You are the capo now: your old capo works for you as a soldier.
      if (st === 'capo') { m.rank = 'soldier'; stay = true; }
    } else if (m.rank === 'soldier' && soldiers < keep.soldier) { stay = true; soldiers++; }
    else if (m.rank === 'associate' && assoc < keep.associate) { stay = true; assoc++; }
    if (!stay) {
      m.faction = 'none';
      m.rank = 'civilian';
      m.capoId = undefined;
    }
  }
  for (const d of s.districts) {
    if (d.capoId && s.characters[d.capoId]?.rank !== 'capo') d.capoId = undefined;
    const mine = d.influence.player ?? 0;
    const cut = Math.round(mine * (st === 'capo' ? 0.8 : st === 'soldier' ? 0.55 : 0.4));
    d.influence.player = cut;
    d.influence.none = (d.influence.none ?? 0) + (mine - cut);
  }
  s.money = st === 'capo' ? 6000 : st === 'soldier' ? 3500 : 2500;
  s.respect = st === 'capo' ? 15 : st === 'soldier' ? 10 : 6;
  boss.ambition = st === 'associate' ? 'Get made' : st === 'soldier' ? 'Get his own crew' : 'Take the chair';
  const over = makeOverBoss(s, { first: 'Cosimo', last: 'Valente', nick: 'the Undertaker' });
  addOpinion(s, over.id, boss.id, st === 'capo' ? 'One of my capos' : 'One of my people', 5, 0);
  p.station = st;
  p.overId = over.id;
  p.fallenWeek = s.week;
  s.chronicle = [{ week: 1, date: { ...s.date }, text: `Memorial Day, 1960. ${displayName(boss)} is ${STATION_INFO[st].name.toLowerCase()} in the family of ${displayName(over)}. Every week, the envelope goes up. One day, the chair.`, kind: 'misc' }];
  tidyCouncil(s);
}
