import { gameYear } from './calendar';
import { crew, displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { fmtMoney, shiftInfluence } from './effects';
import { killCharacter } from './dynasty';
import { respect, rivalHeatHit, rivalMoneyHit, type Ctx } from './ledger';
import { addOpinion, changeMeter, getRelation, opinion } from './relations';
import { chance, pick, rand, randInt, weightedPick } from './rng';
import { FACTION_NAMES, RIVALS } from './world';
import type { Character, EventInstance, FactionId, GameState, Rival, RivalGoal, RivalId, RivalMove } from './types';

/**
 * Rival AI. Each week every rival scores (move, target) candidates from its
 * goal, the leader's personality, its memory of the target (opinion with
 * reasons), and risk; then picks one with weighted randomness. Every result is
 * a named, visible event in the log/chronicle. Any money or heat that lands on
 * the player goes through the capped ledger helpers.
 */

export const MOVES: RivalMove[] = ['expand', 'ally', 'strike', 'offer_deal', 'hide', 'bribe', 'inform'];

const GOAL_WEIGHTS: Record<RivalGoal, Record<RivalMove, number>> = {
  conquer: { expand: 3, strike: 2.2, ally: 0.8, offer_deal: 0.6, hide: 0.6, bribe: 0.6, inform: 0.4 },
  enrich: { expand: 2, strike: 0.6, ally: 1.4, offer_deal: 2.2, hide: 0.6, bribe: 1, inform: 0.3 },
  revenge: { expand: 1, strike: 3.2, ally: 0.6, offer_deal: 0.2, hide: 0.5, bribe: 0.5, inform: 1.5 },
  legitimacy: { expand: 1.5, strike: 0.3, ally: 1.5, offer_deal: 2, hide: 1, bribe: 2, inform: 0.5 },
  survive: { expand: 0.8, strike: 0.5, ally: 2.2, offer_deal: 1.4, hide: 1.6, bribe: 1, inform: 0.6 },
  squeeze: { expand: 0, strike: 1.2, ally: 1, offer_deal: 1, hide: 0.8, bribe: 0.3, inform: 0 },
  headline: { expand: 0, strike: 1.2, ally: 0.6, offer_deal: 0, hide: 1.5, bribe: 0, inform: 1.6 },
};

const TRAIT_MULT: Partial<Record<string, Partial<Record<RivalMove, number>>>> = {
  'Hot-headed': { strike: 1.6, hide: 0.6 },
  Patient: { strike: 0.6, hide: 1.3, ally: 1.2 },
  Greedy: { offer_deal: 1.3, expand: 1.2 },
  Cowardly: { strike: 0.4, hide: 1.6 },
  Charming: { ally: 1.4, offer_deal: 1.3 },
  Cruel: { strike: 1.3 },
  Paranoid: { hide: 1.4, inform: 1.3, ally: 0.7 },
  Ambitious: { expand: 1.4 },
  Honest: { bribe: 0.3, inform: 0.6 },
  'Loyal-to-a-fault': { inform: 0.3 },
  Vengeful: { strike: 1.2 },
};

/** Moves each kind of rival can make. */
const KIND_MOVES: Record<Rival['kind'], RivalMove[]> = {
  mob: ['expand', 'ally', 'strike', 'offer_deal', 'hide', 'bribe', 'inform'],
  philly: ['ally', 'strike', 'offer_deal', 'hide'],
  law: ['strike', 'inform', 'hide', 'ally'],
};

export interface Candidate {
  move: RivalMove;
  target: FactionId;
  score: number;
}

export function rivalCaps(s: GameState): { moneyFrac: number; heatPerBar: number } {
  return gameYear(s.week) <= 1 ? { moneyFrac: 0.25, heatPerBar: 5 } : { moneyFrac: 0.35, heatPerBar: 8 };
}

function leaderOf(s: GameState, r: Rival): Character {
  return s.characters[r.leaderId];
}

/** What the rival leader thinks of a faction (player = the player boss; rival = its leader). */
export function rivalOpinionOf(s: GameState, r: Rival, target: FactionId): number {
  if (target === 'player') return opinion(s, r.leaderId, s.playerId);
  const other = s.rivals.find((x) => x.id === target);
  return other ? opinion(s, r.leaderId, other.leaderId) : 0;
}

function playerExposure(s: GameState): number {
  return Math.round((s.heat.local + s.heat.federal * 1.5) / 2.5);
}

function playerMuscle(s: GameState): number {
  return Math.min(100, crew(s).filter((c) => isFree(s, c)).reduce((a, c) => a + c.attributes.force / 18, 0));
}

export function scoreMoves(s: GameState, r: Rival): Candidate[] {
  const leader = leaderOf(s, r);
  const out: Candidate[] = [];
  const goal: RivalGoal = r.kind === 'mob' && (getRelation(s, r.leaderId, s.playerId)?.grievance ?? 0) >= 50 ? 'revenge' : r.goal;
  const targets: FactionId[] = ['player', ...s.rivals.filter((x) => x.id !== r.id && x.kind === 'mob').map((x) => x.id)];
  for (const move of KIND_MOVES[r.kind]) {
    const cd = r.moveCooldowns[move] ?? 0;
    if (cd > s.week) continue;
    let base = GOAL_WEIGHTS[goal][move];
    for (const t of leader.traits) base *= TRAIT_MULT[t]?.[move] ?? 1;
    // Risk: own exposure pushes toward hiding/bribing.
    if (move === 'hide' || move === 'bribe') base *= 0.5 + r.exposure / 40;
    if (move === 'bribe' && r.money < 3000) base = 0;
    if (move === 'hide' || move === 'bribe') {
      out.push({ move, target: r.id, score: base });
      continue;
    }
    for (const t of targets) {
      let sc = base;
      const op = rivalOpinionOf(s, r, t);
      const tMuscle = t === 'player' ? playerMuscle(s) : (s.rivals.find((x) => x.id === t)?.muscle ?? 50);
      switch (move) {
        case 'strike':
          sc *= 1 + Math.max(0, -op) / 35;
          sc *= op > 30 ? 0.2 : 1;
          sc *= Math.max(0.25, (r.muscle + 10) / (tMuscle + 10));
          sc *= 1 - r.exposure / 150;
          if (r.kind === 'philly') sc = t === 'player' ? (op < -15 ? sc * 1.5 : 0) : 0;
          if (r.kind === 'law') sc = t === 'player' ? sc * (s.heat.local >= 50 ? 1.5 : 0.25) : sc * ((s.rivals.find((x) => x.id === t)?.exposure ?? 0) / 40);
          if (r.money < 1500 && r.kind === 'mob') sc *= 0.3;
          break;
        case 'expand': {
          const room = s.districts.some((d) => (d.influence[t === 'player' ? 'player' : t] ?? 0) > 5);
          sc *= room ? 1 : 0;
          sc *= op < 0 ? 1.3 : op > 40 ? 0.4 : 1;
          if (r.money < 2000) sc *= 0.2;
          break;
        }
        case 'ally':
          sc *= op > -10 ? 1 + op / 60 : 0.3;
          if (r.kind === 'law' && t === 'player') sc = 0;
          break;
        case 'offer_deal':
          sc *= t === 'player' ? (op < -30 ? 0.2 : 1 + Math.max(0, op) / 50) : 0.5;
          if (t === 'player' && s.pendingEvents.some((e) => e.defId === `deal_${r.id}`)) sc = 0;
          break;
        case 'inform': {
          const exp = t === 'player' ? playerExposure(s) : (s.rivals.find((x) => x.id === t)?.exposure ?? 0);
          sc *= (exp + 10) / 40;
          sc *= op < -20 ? 1.4 : op > 30 ? 0.2 : 1;
          if (r.kind === 'law') sc *= t === 'player' ? 1.2 : 1;
          break;
        }
      }
      // Rivals focus on the player but act on each other too.
      if (t !== 'player') sc *= 0.55;
      if (sc > 0) out.push({ move, target: t, score: sc });
    }
  }
  return out;
}

export function rivalWeek(ctx: Ctx): void {
  const s = ctx.s;
  for (const r of s.rivals) {
    const leader = leaderOf(s, r);
    if (!leader?.alive) continue;
    // Income & regeneration.
    const owned = s.districts.reduce((a, d) => a + (d.influence[r.id] ?? 0) * d.streetBase, 0) / 100;
    if (r.kind === 'mob') r.money += Math.round(owned * 0.5 + 300);
    if (r.kind === 'philly') r.money += 500;
    r.muscle = Math.max(5, Math.min(100, r.muscle + (r.muscle < 50 ? 1 : 0)));
    r.exposure = Math.max(0, r.exposure - 1);

    const cands = scoreMoves(s, r);
    // Rivals act most weeks, but not every week.
    if (!chance(s, r.kind === 'philly' ? 0.35 : r.kind === 'law' ? 0.45 : 0.6)) continue;
    const gamble = hasTrait(leader, 'Gambler') ? 1 : 2; // gamblers pick more randomly
    const choice = weightedPick(s, cands, (c) => Math.pow(c.score, gamble));
    if (!choice) continue;
    executeMove(ctx, r, choice);
    r.moveCooldowns[choice.move] = s.week + (choice.move === 'strike' ? 3 : choice.move === 'offer_deal' ? 4 : 1);
  }
}

function name(s: GameState, r: Rival): string {
  return displayName(leaderOf(s, r));
}

function record(ctx: Ctx, r: Rival, move: RivalMove, target: FactionId, text: string): void {
  const s = ctx.s;
  r.lastMove = { week: s.week, move, target, text };
  ctx.log.push(`[${r.shortName}] ${text}`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'rival' });
}

function rivalOf(s: GameState, id: FactionId): Rival | undefined {
  return s.rivals.find((x) => x.id === id);
}

export function executeMove(ctx: Ctx, r: Rival, c: Candidate): void {
  const s = ctx.s;
  const caps = rivalCaps(s);
  const boss = player(s);
  const nm = name(s, r);
  switch (c.move) {
    case 'expand': {
      const owner: FactionId = c.target;
      const ds = s.districts.filter((d) => (d.influence[owner] ?? 0) > 5);
      if (!ds.length) return;
      const pref = ds.find((d) => d.id === r.homeDistrict) ?? ds.find((d) => d.id === 'causeway' || d.id === 'north');
      const d = pref && chance(s, 0.5) ? pref : pick(s, ds);
      const amt = randInt(s, 2, 5);
      const lost = -shiftInfluence(s, d.id, owner, -amt);
      shiftInfluence(s, d.id, r.id, lost);
      r.money -= 1200;
      if (owner === 'player') {
        record(ctx, r, 'expand', owner, `${nm} pushes into ${d.name}: −${lost}% of your action there.`);
        addOpinion(s, boss.id, r.leaderId, `Moved in on ${d.name}`, -10, 1);
      } else {
        record(ctx, r, 'expand', owner, `${r.shortName} muscles ${FACTION_NAMES[owner]} out of part of ${d.name}.`);
        const o = rivalOf(s, owner);
        if (o) addOpinion(s, o.leaderId, r.leaderId, `Moved in on ${d.name}`, -12, 1);
      }
      break;
    }
    case 'strike': {
      if (c.target === 'player') return strikePlayer(ctx, r, caps);
      const o = rivalOf(s, c.target);
      if (!o) return;
      const dmg = randInt(s, 5, 12);
      o.muscle = Math.max(5, o.muscle - dmg);
      const stolen = Math.min(o.money, randInt(s, 1000, 4000));
      o.money -= stolen;
      r.money += stolen;
      r.exposure = Math.min(100, r.exposure + 8);
      addOpinion(s, o.leaderId, r.leaderId, 'Hit our people', -25, 1);
      changeMeter(s, o.leaderId, r.leaderId, 'grievance', 20);
      record(ctx, r, 'strike', c.target, `${r.shortName} hits ${FACTION_NAMES[c.target]}: a card room torched, ${fmtMoney(stolen)} taken.`);
      break;
    }
    case 'ally': {
      if (c.target === 'player') {
        addOpinion(s, r.leaderId, boss.id, 'Friendly overtures', 8, 2);
        if (r.kind === 'philly') {
          respect(ctx, 1, `Moretti speaks well of you in Philadelphia`, 'rival');
          record(ctx, r, 'ally', 'player', `Sal Moretti puts in a good word for you with Philadelphia.`);
        } else record(ctx, r, 'ally', 'player', `${nm} sends a case of Canadian Club and his regards.`);
        return;
      }
      const o = rivalOf(s, c.target);
      if (!o) return;
      addOpinion(s, r.leaderId, o.leaderId, 'Sat down together', 15, 2);
      addOpinion(s, o.leaderId, r.leaderId, 'Sat down together', 15, 2);
      if (r.kind === 'law') {
        o.exposure = Math.max(0, o.exposure - 5);
        record(ctx, r, 'ally', c.target, `The Prosecutor is said to be talking to someone in ${FACTION_NAMES[c.target]}. An informant?`);
        s.flags[`informant_${o.id}`] = (s.flags[`informant_${o.id}`] ?? 0) + 1;
      } else record(ctx, r, 'ally', c.target, `${r.shortName} and ${FACTION_NAMES[c.target]} were seen dining together at the Diamond Beach Club.`);
      break;
    }
    case 'offer_deal': {
      if (c.target === 'player') {
        const ev = dealEvent(s, r);
        if (ev) {
          s.eventQueue.push(ev);
          record(ctx, r, 'offer_deal', 'player', `${nm} sends word: he has a proposition.`);
        }
        return;
      }
      const o = rivalOf(s, c.target);
      if (!o) return;
      const op = rivalOpinionOf(s, o, r.id);
      if (op > -20) {
        const amt = randInt(s, 1000, 3000);
        r.money += amt;
        o.money += amt;
        addOpinion(s, o.leaderId, r.leaderId, 'Good business together', 10, 2);
        record(ctx, r, 'offer_deal', c.target, `${r.shortName} and ${FACTION_NAMES[c.target]} cut a deal on the summer slot machines.`);
      } else record(ctx, r, 'offer_deal', c.target, `${FACTION_NAMES[c.target]} turned down ${r.shortName}'s offer.`);
      break;
    }
    case 'hide':
      r.exposure = Math.max(0, r.exposure - 10);
      record(ctx, r, 'hide', r.id, r.kind === 'law' ? 'The Prosecutor\'s office goes quiet. They\'re building something.' : `${r.shortName} lies low for a week.`);
      break;
    case 'bribe':
      r.money -= 2500;
      r.exposure = Math.max(0, r.exposure - 18);
      record(ctx, r, 'bribe', r.id, `${r.shortName} spreads money around City Hall.`);
      break;
    case 'inform': {
      if (c.target === 'player') {
        const label = r.kind === 'law' ? 'Prosecutor\'s press conference names your crew' : `Anonymous tip to the FBI (${r.shortName})`;
        const bar = r.kind === 'law' ? 'local' : 'federal';
        const amt = rivalHeatHit(ctx, bar, randInt(s, 3, 6), label, caps.heatPerBar);
        if (r.kind === 'law') rivalHeatHit(ctx, 'federal', 2, 'Prosecutor shares files with the FBI', caps.heatPerBar);
        if (r.kind !== 'law') addOpinion(s, boss.id, r.leaderId, 'Rat', -20, 0);
        record(ctx, r, 'inform', 'player', r.kind === 'law'
          ? `Prosecutor ${leaderOf(s, r).lastName} tells the Herald he is "looking hard at Pacific Avenue" (+${amt} local heat).`
          : `Someone dropped a dime on your crew to the FBI. Word is it came from ${r.shortName}'s people.`);
        return;
      }
      const o = rivalOf(s, c.target);
      if (!o) return;
      o.exposure = Math.min(100, o.exposure + 15);
      if (r.kind === 'law') {
        o.muscle = Math.max(5, o.muscle - 6);
        o.money = Math.max(0, o.money - 2000);
        record(ctx, r, 'inform', c.target, `The Prosecutor subpoenas ${FACTION_NAMES[c.target]}'s bookkeeper.`);
      } else record(ctx, r, 'inform', c.target, `${r.shortName} feeds the Prosecutor a story about ${FACTION_NAMES[c.target]}.`);
      addOpinion(s, o.leaderId, r.leaderId, 'Rat', -20, 0);
      break;
    }
  }
}

function strikePlayer(ctx: Ctx, r: Rival, caps: { moneyFrac: number; heatPerBar: number }): void {
  const s = ctx.s;
  const boss = player(s);
  const leader = leaderOf(s, r);
  const nm = displayName(leader);
  if (r.kind === 'philly') {
    const amt = rivalHeatHit(ctx, 'family', randInt(s, 3, 6), 'Moretti complains about you in Philadelphia', caps.heatPerBar);
    record(ctx, r, 'strike', 'player', `Sal Moretti is telling people in Philadelphia that you've forgotten who you work for (+${amt} family heat).`);
    return;
  }
  if (r.kind === 'law') {
    const lost = rivalMoneyHit(ctx, randInt(s, 800, 3000), 'County detectives raid a wire room', caps.moneyFrac);
    rivalHeatHit(ctx, 'local', 3, 'County detectives raid a wire room', caps.heatPerBar);
    r.exposure = 0;
    record(ctx, r, 'strike', 'player', `County detectives raid one of your wire rooms${lost ? ` and haul off ${fmtMoney(lost)}` : ''}.`);
    return;
  }
  const kinds = [
    { text: 'hijack your numbers runner on Pacific Avenue', label: 'hijacked numbers runner' },
    { text: 'stick up your card game above the Starlight', label: 'card game stuck up' },
    { text: 'lean on your bookmakers to switch sides', label: 'bookmakers leaned on' },
    { text: 'firebomb a dumpster behind your club', label: 'firebombing behind the club' },
  ];
  const k = pick(s, kinds);
  const want = randInt(s, 1000, 4500);
  const lost = rivalMoneyHit(ctx, want, `${r.shortName} crew: ${k.label}`, caps.moneyFrac);
  rivalHeatHit(ctx, 'local', 2, `${r.shortName} crew: ${k.label} draws cops`, caps.heatPerBar);
  respect(ctx, -1, `${r.shortName} crew: ${k.label}`, 'rival');
  r.exposure = Math.min(100, r.exposure + 6);
  r.money -= 800;
  // Crew and boss remember.
  addOpinion(s, boss.id, r.leaderId, `${r.shortName} ${k.label}`, -15, 1);
  for (const m of crew(s)) addOpinion(s, m.id, r.leaderId, `Hit our people`, -10, 1);
  addOpinion(s, r.leaderId, boss.id, 'Took what was ours to take', -3, 1);

  let extra = '';
  // A soldier may get hurt — or killed, if the rival is cruel or hot-headed.
  const soldiers = crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && isFree(s, c));
  if (soldiers.length && chance(s, 0.25)) {
    const v = pick(s, soldiers);
    const lethal = (hasTrait(leader, 'Cruel') || hasTrait(leader, 'Hot-headed')) && chance(s, 0.15);
    if (lethal) {
      killCharacter(ctx, v.id, `shot by the ${r.shortName} crew`, r.id);
      extra = ` ${displayName(v)} was killed.`;
    } else {
      v.health = Math.max(5, v.health - randInt(s, 15, 30));
      extra = ` ${displayName(v)} was beaten badly.`;
    }
  }
  // Very rarely, a hit on the boss himself.
  const grievance = getRelation(s, r.leaderId, boss.id)?.grievance ?? 0;
  // Requires an earlier warning (an attempt that failed) before a killing can succeed.
  if (opinion(s, r.leaderId, boss.id) <= -75 && grievance >= 70 && chance(s, 0.04)) {
    const warned = (s.flags[`attempt_${r.id}`] ?? 0) > 0;
    s.flags[`attempt_${r.id}`] = (s.flags[`attempt_${r.id}`] ?? 0) + 1;
    if (warned && chance(s, 0.25)) {
      record(ctx, r, 'strike', 'player', `${nm}'s men ${k.text}.${extra}`);
      killCharacter(ctx, boss.id, `murdered on the orders of ${nm}`, r.id);
      return;
    }
    boss.health = Math.max(5, boss.health - 30);
    extra += ` A shotgun blast through ${boss.firstName}'s windshield — he survived.`;
  }
  record(ctx, r, 'strike', 'player', `${nm}'s men ${k.text}${lost ? ` (${fmtMoney(lost)} lost)` : ''}.${extra}`);
}

function dealEvent(s: GameState, r: Rival): EventInstance | undefined {
  const leader = leaderOf(s, r);
  const nm = displayName(leader);
  const base = { iid: `ev${s.nextId++}`, defId: `deal_${r.id}`, week: s.week, mandatory: false, priority: 40, meta: { rival: r.id }, actors: [leader.id] };
  const gain = Math.round(2500 + rand(s) * 2500);
  switch (r.id) {
    case 'manno':
      return {
        ...base,
        title: 'A proposition from Atlantic City',
        text: `${nm} wants to split the Causeway: his trucks pass unmolested and he pays for the courtesy.`,
        defaultChoiceId: 'refuse',
        choices: [
          {
            id: 'accept', label: `Take his money`, because: 'let Manno trucks onto the Causeway',
            effects: [
              { type: 'money', amount: gain }, { type: 'influence', district: 'causeway', faction: 'manno', amount: 8 },
              { type: 'rivalOpinion', rival: 'manno', amount: 20, reason: 'Did business with us' },
              { type: 'heat', bar: 'family', amount: 3 },
              { type: 'schedule', key: 'manno_foothold', minWeeks: 4, maxWeeks: 8, chance: 0.5, hint: 'Manno may want more' },
            ],
          },
          {
            id: 'refuse', label: 'Tell him the Causeway is spoken for', because: 'turned Manno away from the Causeway',
            effects: [{ type: 'rivalOpinion', rival: 'manno', amount: -12, reason: 'Turned down our offer' }, { type: 'respect', amount: 1 }],
          },
        ],
      };
    case 'feldstein':
      return {
        ...base,
        title: 'New York money',
        text: `${nm} wants a piece of the Boardwalk. He is offering cash now for a silent share.`,
        defaultChoiceId: 'refuse',
        choices: [
          {
            id: 'accept', label: 'Sell him a share', because: 'sold Feldstein a share of the Boardwalk',
            effects: [
              { type: 'money', amount: gain + 1500 }, { type: 'influence', district: 'boardwalk', faction: 'feldstein', amount: 10 },
              { type: 'rivalOpinion', rival: 'feldstein', amount: 20, reason: 'A reliable partner' },
            ],
          },
          {
            id: 'loan', label: 'Borrow from him instead', detail: '$6,000 now, $260/week for 26 weeks', because: 'borrowed from Feldstein',
            effects: [{ type: 'debt', lender: 'Ira Feldstein', principal: 6000, weeklyPayment: 260, weeks: 26 }, { type: 'rivalOpinion', rival: 'feldstein', amount: 8, reason: 'Owes us' }],
          },
          { id: 'refuse', label: 'Politely decline', because: 'turned down Feldstein', effects: [{ type: 'rivalOpinion', rival: 'feldstein', amount: -6, reason: 'Turned down our money' }] },
        ],
      };
    case 'kessler':
      return {
        ...base,
        title: 'Kessler wants a truce',
        text: `${nm} offers joint protection for the clubs on the North End line. It costs you, but it buys peace.`,
        defaultChoiceId: 'refuse',
        choices: [
          {
            id: 'accept', label: 'Shake on it', because: 'made a truce with Danny Kessler',
            effects: [
              { type: 'money', amount: -1500 }, { type: 'influence', district: 'north', faction: 'player', amount: 6 },
              { type: 'rivalOpinion', rival: 'kessler', amount: 25, reason: 'Kept his word' },
            ],
          },
          { id: 'refuse', label: 'North Wildwood will be ours anyway', because: 'snubbed Danny Kessler', effects: [{ type: 'rivalOpinion', rival: 'kessler', amount: -10, reason: 'Snubbed me' }, { type: 'respect', amount: 1 }] },
        ],
      };
    case 'philly':
      return {
        ...base,
        title: 'Moretti needs a favor',
        text: `${nm} needs a man from Philadelphia kept out of sight in one of your motels for a few weeks. No questions.`,
        defaultChoiceId: 'accept',
        choices: [
          {
            id: 'accept', label: 'Of course', because: 'hid Moretti\'s man',
            effects: [
              { type: 'heat', bar: 'family', amount: -6 }, { type: 'heat', bar: 'federal', amount: 3 },
              { type: 'rivalOpinion', rival: 'philly', amount: 15, reason: 'Does what is asked' },
              { type: 'schedule', key: 'philly_favor_returned', minWeeks: 3, maxWeeks: 8, chance: 0.6, hint: 'Philadelphia remembers' },
            ],
          },
          { id: 'refuse', label: 'Too hot right now', because: 'turned down Moretti', effects: [{ type: 'heat', bar: 'family', amount: 5 }, { type: 'rivalOpinion', rival: 'philly', amount: -12, reason: 'Refused a favor' }] },
        ],
      };
    default:
      return undefined;
  }
}

/** Replace a dead rival leader with a successor, carrying part of the old grudges. */
export function rivalSuccession(ctx: Ctx): void {
  const s = ctx.s;
  for (const r of s.rivals) {
    const old = s.characters[r.leaderId];
    if (old?.alive) continue;
    const def = RIVALS.find((d) => d.id === r.id)!;
    const heir = makeCharacter(s, {
      ethnicity: def.leader.ethnicity,
      lastName: r.kind === 'law' ? undefined : old?.lastName,
      age: randInt(s, 35, 50),
      rank: def.leader.rank,
      faction: r.id,
    });
    r.leaderId = heir.id;
    const prev = old ? opinion(s, old.id, s.playerId) : 0;
    if (prev !== 0) addOpinion(s, heir.id, s.playerId, 'Inherited the grudges of his predecessor', Math.round(prev / 2), 1);
    if (old?.death?.killer === 'player') addOpinion(s, heir.id, s.playerId, 'You killed my predecessor', -40, 0);
    const text = r.kind === 'law'
      ? `${displayName(heir)} is the new County Prosecutor.`
      : `${displayName(heir)} takes over ${r.name}.`;
    ctx.log.push(text);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'rival' });
  }
}

export function rivalById(s: GameState, id: RivalId): Rival {
  return s.rivals.find((r) => r.id === id)!;
}
