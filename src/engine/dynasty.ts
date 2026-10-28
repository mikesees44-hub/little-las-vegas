import { agingFor, agingMonth, deathMult, ensureAging, fertility, lineOrder, successionBar } from './aging';
import { ageOn, formatDate } from './calendar';
import {
  age,
  capos,
  crew,
  displayName,
  makeCharacter,
  monthlyDeathChance,
  monthlyHealth,
  pickNickname,
  relationLabel,
} from './characters';
import { lineageDeath } from './housesDeath';
import { respect, type Ctx } from './ledger';
import { addOpinion, opinion, relKey } from './relations';
import { chance, rand } from './rng';
import type { Character, EventInstance, FactionId, GameState, SuccessionLaw } from './types';
import { addStory, heirFromRegime, tidyRegimes, transferRegime } from './hierarchy';

export const ADULT_AGE = 16;

export const SUCCESSION_LAWS: Record<SuccessionLaw, { name: string; text: string }> = {
  blood: { name: 'Blood', text: 'The eldest son inherits; then brothers, nephews, and the rest of the house.' },
  appointed: { name: 'Appointed', text: 'The boss names his heir from the family. Falls back to blood if the heir is gone.' },
  capos_elect: { name: 'Capos elect', text: 'The capos choose among the grown men and women of the house.' },
  underboss: { name: 'Underboss inherits', text: 'The underboss takes the chair and is taken into the house.' },
};

export function isEligible(s: GameState, c: Character | undefined): c is Character {
  return !!c && c.alive && c.dynasty && (c.imprisonedUntil === undefined || c.imprisonedUntil <= s.week) && !successionBar(s, c);
}

/**
 * Blood-law line of succession for `from` (the boss who died).
 * Adult males by closeness and age, then adult women of the house, then minors.
 */
export function bloodLine(s: GameState, from: Character): Character[] {
  const all = Object.values(s.characters).filter((c) => isEligible(s, c) && c.id !== from.id);
  const closeness = (c: Character): number => {
    if (from.childrenIds.includes(c.id)) return 0;
    const parent = c.fatherId ? s.characters[c.fatherId] : undefined;
    if (parent && from.childrenIds.includes(parent.id)) return 1; // grandchild
    if (from.fatherId && c.fatherId === from.fatherId) return 2; // sibling
    if (parent && from.fatherId && parent.fatherId === from.fatherId) return 3; // nephew/niece
    if (from.spouseId === c.id) return 5;
    return 4;
  };
  const tier = (c: Character): number => {
    const adult = ageOn(c.birth, s.date) >= ADULT_AGE;
    if (adult && c.gender === 'M') return 0;
    if (adult) return 1;
    return 2;
  };
  // A boss who retired to Florida is the last resort, never the next in line (a family bot handed the
  // chair back and forth between two retired Dominics twenty-one times in a year).
  const retired = (c: Character) => (s.dyn?.people[c.id]?.retired !== undefined ? 1 : 0);
  return all.sort((a, b) => {
    const r = retired(a) - retired(b);
    if (r) return r;
    const t = tier(a) - tier(b);
    if (t) return t;
    const cl = closeness(a) - closeness(b);
    if (cl) return cl;
    const dis = lineOrder(s, a) - lineOrder(s, b);
    if (dis) return dis;
    return toOrd(a) - toOrd(b); // older first
  });
}

function toOrd(c: Character): number {
  return c.birth.y * 400 + c.birth.m * 32 + c.birth.d;
}

export interface SuccessionResult {
  heir?: Character;
  method: string;
}

export function chooseHeir(s: GameState, deceased: Character): SuccessionResult {
  const law = s.successionLaw;
  if (law === 'appointed') {
    const h = s.designatedHeirId ? s.characters[s.designatedHeirId] : undefined;
    if (isEligible(s, h) && h.id !== deceased.id) return { heir: h, method: 'by appointment' };
  }
  if (law === 'underboss') {
    const ub = crew(s).find((c) => c.rank === 'underboss' && c.alive && (c.imprisonedUntil ?? 0) <= s.week);
    if (ub) return { heir: ub, method: 'as underboss' };
  }
  if (law === 'capos_elect') {
    const candidates = bloodLine(s, deceased).filter((c) => ageOn(c.birth, s.date) >= ADULT_AGE);
    const voters = capos(s).filter((c) => c.id !== deceased.id);
    if (candidates.length) {
      let best = candidates[0];
      let bestScore = -Infinity;
      for (const cand of candidates) {
        const sc = voters.reduce((acc, v) => acc + opinion(s, v.id, cand.id), 0) + cand.attributes.leadership / 2;
        if (sc > bestScore) {
          bestScore = sc;
          best = cand;
        }
      }
      return { heir: best, method: 'elected by the capos' };
    }
  }
  const line = bloodLine(s, deceased);
  return { heir: line[0], method: law === 'blood' ? 'by blood' : 'by blood (fallback)' };
}

function funeralEvent(s: GameState, dead: Character, cause: string): EventInstance {
  const isBoss = dead.rank === 'boss' || dead.id === s.playerId;
  const big = isBoss ? 4000 : dead.dynasty ? 2000 : 1200;
  const small = Math.round(big / 4);
  const name = displayName(dead);
  return {
    iid: `ev${s.nextId++}`,
    defId: 'funeral',
    title: `Funeral: ${name}`,
    text: `${name} is laid to rest (${cause}). The whole island is watching how the family honors its dead.`,
    week: s.week,
    mandatory: true,
    priority: 90,
    defaultChoiceId: 'modest',
    meta: { charId: dead.id },
    choices: [
      {
        id: 'lavish',
        label: 'A lavish funeral',
        detail: 'Flowers from Philly to the Crest. Everybody comes.',
        because: `gave ${name} a lavish funeral`,
        effects: [
          { type: 'money', amount: -big, category: 'event' },
          { type: 'respect', amount: isBoss ? 5 : 3 },
          { type: 'familyOpinion', amount: 10, reason: `Honored ${dead.firstName} properly` },
          { type: 'crewOpinion', amount: 5, reason: `Honored ${dead.firstName} properly` },
        ],
      },
      {
        id: 'modest',
        label: 'A modest Mass at St. Ann\'s',
        because: `held a modest Mass for ${name}`,
        effects: [{ type: 'money', amount: -small, category: 'event' }],
      },
      {
        id: 'private',
        label: 'A private burial',
        detail: 'Keep it quiet. Keep the feds\' cameras away.',
        because: `buried ${name} privately`,
        effects: [
          { type: 'heat', bar: 'federal', amount: -3 },
          { type: 'familyOpinion', amount: -10, reason: `Buried ${dead.firstName} like a stranger` },
        ],
      },
    ],
  };
}

/**
 * THE death function. Every cause of death (natural, violence, execution,
 * accident) goes through here. It records the death, schedules a funeral
 * event, writes dynasty history, and if the player died applies the
 * succession law and switches control to the heir (or ends the game).
 */
/**
 * Other layers that need to hear about every death (politics: vacant seats).
 * They are also how the one death function reaches people who are not engine
 * characters (the world population): `character` is then undefined.
 */
export type DeathHandler = (ctx: Ctx, id: string, cause: string, character?: Character) => void;
const DEATH_HANDLERS: DeathHandler[] = [];
export function registerDeathHandler(fn: DeathHandler): void {
  if (!DEATH_HANDLERS.includes(fn)) DEATH_HANDLERS.push(fn);
}

export function killCharacter(ctx: Ctx, charId: string, cause: string, killer?: FactionId): Character | undefined {
  const s = ctx.s;
  const c = s.characters[charId];
  if (!c) {
    // Off-screen members of the houses (lineage people) die here too; the tree keeps them.
    if (s.lineage?.people[charId]) lineageDeath(ctx, charId, cause, killer);
    for (const h of DEATH_HANDLERS) h(ctx, charId, cause);
    return undefined;
  }
  if (!c.alive) return undefined;
  c.alive = false;
  c.death = { week: s.week, date: { ...s.date }, cause, killer };
  lineageDeath(ctx, c.id, cause, killer);
  const ageAt = age(s, c);
  const name = displayName(c);
  ctx.log.push(`${name} died, aged ${ageAt} (${cause}).`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${name} died, aged ${ageAt}: ${cause}.`, kind: 'death' });

  // Funerals for the house, the crew and anybody close to it.
  if (c.dynasty || c.faction === 'player') s.eventQueue.push(funeralEvent(s, c, cause));

  if (c.dynasty) {
    const rel = c.id === s.playerId ? 'the head of the house' : relationLabel(s, s.characters[s.playerId], c);
    s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text: `${name}, ${rel}, died on ${formatDate(s.date)} aged ${ageAt} — ${cause}.` });
  }

  // Grief and grievance among relatives / crew.
  for (const other of Object.values(s.characters)) {
    if (!other.alive) continue;
    const close = other.spouseId === c.id || other.fatherId === c.id || c.childrenIds.includes(other.id) || (c.fatherId && other.fatherId === c.fatherId);
    if (close && killer && killer !== 'none') {
      const rival = s.rivals.find((r) => r.id === killer);
      if (rival) addOpinion(s, other.id, rival.leaderId, `Killed my ${relationLabel(s, other, c)}`, -40, 0);
    }
  }

  // Clean up district capo assignment.
  for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
  addStory(s, c, `Died: ${cause}.`);

  if (c.id === s.playerId) succeed(ctx, c);
  else if (c.faction === 'player' && (c.rank === 'capo' || c.rank === 'underboss')) promoteReplacement(ctx, c);
  // His regime goes to whoever replaced him (or is spread among the other capos).
  tidyRegimes(s);
  for (const h of DEATH_HANDLERS) h(ctx, charId, cause, c);
  return c;
}

/** Fill a vacated capo/underboss slot from the best soldier. */
function promoteReplacement(ctx: Ctx, dead: Character): void {
  const s = ctx.s;
  const pool = crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && (c.imprisonedUntil ?? 0) <= s.week && !c.dynasty);
  const famPool = crew(s).filter((c) => c.dynasty && c.rank !== 'capo' && c.rank !== 'underboss' && c.rank !== 'boss');
  const all = [...pool, ...famPool];
  if (dead.rank === 'underboss') {
    const cand = capos(s).sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0];
    if (cand) {
      cand.rank = 'underboss';
      ctx.log.push(`${displayName(cand)} steps up as underboss.`);
      for (const d of s.districts) if (d.capoId === cand.id) d.capoId = undefined;
      dead = { ...dead, rank: 'capo' };
    } else return;
  }
  if (dead.rank === 'capo' || dead.rank === 'underboss') {
    // Promote from within his own regime first: his men follow one of their own.
    const best = heirFromRegime(s, dead.id) ?? all.sort((a, b) => b.attributes.leadership + b.attributes.business - (a.attributes.leadership + a.attributes.business))[0];
    if (!best) return;
    const deadId = dead.id;
    best.rank = 'capo';
    best.capoId = undefined;
    transferRegime(s, deadId, best.id);
    addStory(s, best, `Took over the crew of ${displayName(dead)}.`);
    const free = s.districts.find((d) => !d.capoId && (d.influence.player ?? 0) >= 40);
    if (free) free.capoId = best.id;
    addOpinion(s, best.id, s.playerId, 'Made me a capo', 20, 1);
    ctx.log.push(`${displayName(best)} is promoted to capo${free ? ` of ${free.name}` : ''}.`);
  }
}

/** Applies the succession law after the player's death. */
export function succeed(ctx: Ctx, deceased: Character): void {
  const s = ctx.s;
  const { heir, method } = chooseHeir(s, deceased);
  if (!heir) {
    s.gameOver = {
      week: s.week,
      reason: 'no_heir',
      text: `${displayName(deceased)} died with no one left to carry the name. The house of ${s.houseName} is finished in Wildwood.`,
    };
    s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text: `The line of ${s.houseName} ended.` });
    ctx.log.push('No eligible heir remains. The dynasty has ended.');
    return;
  }
  const prevId = s.playerId;
  // If the heir was the underboss or a non-dynasty pick, he is taken into the house.
  if (!heir.dynasty) {
    heir.dynasty = true;
    s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text: `${displayName(heir)} was taken into the house of ${s.houseName}.` });
  }
  for (const d of s.districts) if (d.capoId === heir.id) d.capoId = undefined;
  const wasUnderboss = heir.rank === 'underboss';
  heir.rank = 'boss';
  heir.faction = 'player';
  heir.imprisonedUntil = undefined;
  if (!heir.nickname && heir.gender === 'M' && rand(s) < 0.5) heir.nickname = pickNickname(s, 'player');
  s.playerId = heir.id;
  if (s.designatedHeirId === heir.id) s.designatedHeirId = undefined;
  // Inherit the old boss's estate.
  heir.wealth += deceased.wealth;

  // Carry over (halved) what people thought of the house.
  for (const r of Object.values(s.relations)) {
    if (r.to !== prevId || r.from === heir.id) continue;
    for (const m of r.modifiers) {
      if (Math.abs(m.value) < 6) continue;
      addOpinion(s, r.from, heir.id, `The house: ${m.reason.replace(/^The house: /, '')}`, Math.round(m.value / 2), m.decay || 1);
    }
    const nr = s.relations[relKey(r.from, heir.id)];
    if (nr) {
      nr.fear = Math.round(r.fear / 2);
      nr.grievance = Math.round(r.grievance / 2);
    }
  }
  // Crew reaction to the new boss.
  for (const m of crew(s)) {
    const young = ageOn(heir.birth, s.date) < 25;
    addOpinion(s, m.id, heir.id, young ? 'A kid in the chair' : 'New boss, untested', young ? -15 : -5, 1);
    if (heir.attributes.leadership >= 65) addOpinion(s, m.id, heir.id, 'Born leader', 10, 0);
    if (wasUnderboss) addOpinion(s, m.id, heir.id, 'Earned the chair', 8, 1);
  }
  respect(ctx, -8, `Succession: ${displayName(heir)} takes over (${method})`, 'event');
  const text = `${displayName(heir)} became head of the house of ${s.houseName} ${method}, aged ${ageOn(heir.birth, s.date)}.`;
  s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'succession' });
  ctx.log.push(text);
  if (wasUnderboss) {
    // Someone has to be underboss now.
    promoteReplacement(ctx, { ...heir, rank: 'underboss' } as Character);
  }
}

export interface MonthlyResult {
  warnings: Character[];
}

/**
 * Monthly bloodline/health tick: health drift, natural-death warnings and
 * deaths (death requires an earlier warning), births and marriages.
 * Applies to all living characters; only the house and crew generate events.
 */
export function monthlyLife(ctx: Ctx): MonthlyResult {
  const s = ctx.s;
  const warnings: Character[] = [];
  const living = Object.values(s.characters).filter((c) => c.alive);
  for (const c of living) {
    if (!c.alive) continue;
    const added = monthlyHealth(s, c);
    const tracked = c.dynasty || c.faction === 'player';
    if (added && tracked) ctx.log.push(`${displayName(c)} has been diagnosed with ${added.toLowerCase()}.`);
    // Old age (its own dice): the slow traits, and a heart that gives out.
    const old = agingFor(ctx, c);
    if (old.kill) {
      killCharacter(ctx, c.id, old.kill);
      continue;
    }
    const a = ageOn(c.birth, s.date);
    const p = Math.min(0.6, monthlyDeathChance(a, c.health) * deathMult(s, c));
    if (!chance(s, p)) continue;
    // Roll hit. A first hit is only a warning; a later hit (>= 4 weeks after a warning) kills.
    if (c.warnedWeek === undefined || s.week - c.warnedWeek < 4) {
      if (c.warnedWeek === undefined) {
        c.warnedWeek = s.week;
        c.health = Math.max(0, c.health - 10);
        if (tracked) {
          warnings.push(c);
          ctx.log.push(`${displayName(c)} has taken a bad turn. The doctor is worried.`);
          s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} fell seriously ill.`, kind: 'family' });
        }
      }
      continue;
    }
    const cause = c.conditions.includes('Bad heart')
      ? 'heart attack'
      : c.conditions.includes("Drinker's liver")
        ? 'liver failure'
        : a > 70
          ? 'old age'
          : c.conditions.includes('Sugar diabetes')
            ? 'complications of diabetes'
            : a > 50
              ? 'a stroke'
              : 'sudden illness';
    killCharacter(ctx, c.id, cause);
  }
  // Recovery clears warnings for people who got better.
  for (const c of living) if (c.alive && c.warnedWeek !== undefined && c.health >= 60 && s.week - c.warnedWeek > 26) c.warnedWeek = undefined;

  agingMonth(ctx);
  births(ctx);
  marriages(ctx);
  return { warnings };
}

function births(ctx: Ctx): void {
  const s = ctx.s;
  for (const mother of Object.values(s.characters)) {
    if (!mother.alive || !mother.dynasty || mother.gender !== 'F' || !mother.spouseId) continue;
    const father = s.characters[mother.spouseId];
    if (!father?.alive) continue;
    const a = ageOn(mother.birth, s.date);
    if (a < 18 || a > 42) continue;
    const kids = mother.childrenIds.length;
    const p = 0.022 * (kids >= 4 ? 0.3 : 1) * (a > 36 ? 0.5 : 1) * fertility(s, father) * fertility(s, mother);
    if (!chance(s, p)) continue;
    // Twins, now and then (their own dice, so a family without twins rolls the same as before).
    const n = chance(ensureAging(s), 0.012) ? 2 : 1;
    for (let twin = 0; twin < n; twin++) {
      const gender = rand(s) < 0.51 ? 'M' : 'F';
      const child = makeCharacter(s, {
        gender,
        ethnicity: father.ethnicity,
        lastName: father.lastName,
        age: 0,
        rank: 'civilian',
        faction: father.faction === 'player' ? 'player' : 'none',
        dynasty: true,
        nickname: false,
        wealth: 0,
      });
      child.birth = { ...s.date };
      child.health = 95;
      child.conditions = [];
      child.ambition = gender === 'M' ? 'Grow up' : 'Grow up';
      child.fatherId = father.id;
      child.motherId = mother.id;
      father.childrenIds.push(child.id);
      mother.childrenIds.push(child.id);
      addOpinion(s, child.id, father.id, 'My father', 30, 0);
      const text = `${child.firstName} ${child.lastName} was born to ${father.firstName} and ${mother.firstName}.`;
      s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
      ctx.log.push(text);
    }
  }
}

function marriages(ctx: Ctx): void {
  const s = ctx.s;
  for (const c of Object.values(s.characters)) {
    if (!c.alive || !c.dynasty || c.spouseId || c.gender !== 'M') continue;
    const a = ageOn(c.birth, s.date);
    if (a < 21 || a > 45) continue;
    if (!chance(s, 0.015)) continue;
    const bride = makeCharacter(s, {
      gender: 'F',
      age: Math.max(18, a - Math.floor(rand(s) * 5)),
      rank: 'civilian',
      faction: 'player',
      dynasty: true,
      nickname: false,
    });
    bride.maidenName = bride.lastName;
    bride.lastName = c.lastName;
    bride.spouseId = c.id;
    c.spouseId = bride.id;
    addOpinion(s, bride.id, c.id, 'My husband', 25, 0);
    addOpinion(s, c.id, bride.id, 'My wife', 25, 0);
    const text = `${displayName(c)} married ${bride.firstName} ${bride.maidenName}.`;
    s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
    ctx.log.push(text);
  }
}

/** For UI/tests: check the player character is a valid boss. */
export function validatePlayer(s: GameState): string[] {
  const p = s.characters[s.playerId];
  const errs: string[] = [];
  if (!p) return ['player character missing'];
  if (s.gameOver) return [];
  if (!p.alive) errs.push('player is dead');
  if (!p.dynasty) errs.push('player is not in the dynasty');
  if (p.rank !== 'boss') errs.push(`player rank is ${p.rank}`);
  if (p.faction !== 'player') errs.push(`player faction is ${p.faction}`);
  return errs;
}

