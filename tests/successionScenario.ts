import { newGame } from '../src/engine/newGame';
import { ageOn, dateOfWeek, monthKey } from '../src/engine/calendar';
import { birthForAge, crew, makeCharacter, player } from '../src/engine/characters';
import { fillCouncil } from '../src/engine/council';
import { monthlyLife, killCharacter } from '../src/engine/dynasty';
import { applyEffects } from '../src/engine/effects';
import { addOpinion, decayAllRelations } from '../src/engine/relations';
import { newCtx } from '../src/engine/ledger';
import { commitPower } from '../src/engine/power';
import { hashSeed } from '../src/engine/rng';
import { shadowWeek } from '../src/engine/shadow';
import { DISTRICTS } from '../src/engine/world';
import type { Character, GameState } from '../src/engine/types';

/**
 * The spec's acceptance organization (SUCCESSION_SHADOW_COURT.md §14):
 * 1975, one Don aged 65, an experienced underboss, a consigliere, three
 * capos, twelve soldiers, eight associates, two plausible heirs (sons of
 * 38 and 33, the elder named), two rival families. Built from a real
 * `newGame` so every system's state exists, then reshaped.
 *
 * `runYears` is the headless succession loop: each week the calendar,
 * monthly aging/health/death (the one death function, so a dead Don hands
 * play to the heir), and the shadow court's own week; story popups are
 * answered by a seeded pick. It does not run the rest of the economy (that
 * is what `advanceWeek` and scripts/sim.ts do), so fifteen years take
 * seconds.
 */

export const WEEK_1975 = 1 + 15 * 52 + 1;

function set(c: Character, s: GameState, rank: Character['rank'], age: number): Character {
  c.rank = rank;
  c.faction = 'player';
  c.birth = birthForAge(s, s.date, age);
  return c;
}

export function build1975(seed: string): GameState {
  const s = newGame(seed);
  s.week = WEEK_1975;
  s.date = dateOfWeek(s.week);
  const boss = player(s);
  boss.birth = birthForAge(s, s.date, 65);
  boss.health = 72;
  // The crew to spec.
  const men = crew(s).filter((c) => !c.dynasty);
  const ub = men.find((c) => c.rank === 'underboss') ?? makeCharacter(s, { rank: 'underboss', faction: 'player' });
  set(ub, s, 'underboss', 58);
  ub.wealth = 30000;
  const cons = men.find((c) => c.rank === 'consigliere') ?? makeCharacter(s, { rank: 'consigliere', faction: 'player' });
  set(cons, s, 'consigliere', 63);
  const capoAges = [52, 44, 36];
  const caps = men.filter((c) => c.rank === 'capo').slice(0, 3);
  while (caps.length < 3) caps.push(makeCharacter(s, { rank: 'capo', faction: 'player' }));
  caps.forEach((c, i) => set(c, s, 'capo', capoAges[i]));
  for (const c of men) if (c.rank === 'capo' && !caps.includes(c)) c.rank = 'soldier';
  const sold = crew(s).filter((c) => c.rank === 'soldier' && !c.dynasty);
  while (sold.length < 12) sold.push(makeCharacter(s, { rank: 'soldier', faction: 'player' }));
  sold.slice(12).forEach((c) => { c.rank = 'associate'; });
  sold.slice(0, 12).forEach((c, i) => { set(c, s, 'soldier', 26 + ((i * 7) % 24)); c.capoId = caps[i % 3].id; });
  const assoc = crew(s).filter((c) => c.rank === 'associate' && !c.dynasty);
  while (assoc.length < 8) assoc.push(makeCharacter(s, { rank: 'associate', faction: 'player' }));
  assoc.slice(8).forEach((c) => { c.faction = 'none'; c.rank = 'civilian'; });
  assoc.slice(0, 8).forEach((c, i) => { set(c, s, 'associate', 20 + i); c.capoId = caps[i % 3].id; });
  for (const d of s.districts) if (d.capoId && !caps.some((k) => k.id === d.capoId)) d.capoId = undefined;
  const core = DISTRICTS.filter((x) => x.core).map((x) => x.id);
  caps.forEach((k, i) => { const d = s.districts.find((x) => x.id === core[i]); if (d) d.capoId = k.id; });
  // Two plausible heirs: the Don's sons.
  const sons: Character[] = [];
  for (const age of [38, 33]) {
    const son = makeCharacter(s, { rank: 'civilian', faction: 'player', dynasty: true, lastName: boss.lastName, age, ethnicity: 'Italian' });
    son.fatherId = boss.id;
    boss.childrenIds.push(son.id);
    addOpinion(s, son.id, boss.id, 'My father', 20, 0);
    sons.push(son);
  }
  // Older blood (siblings, other children) step aside so the two sons are the line.
  for (const c of Object.values(s.characters)) if (c.dynasty && c.alive && c.id !== boss.id && !sons.includes(c) && ageOn(c.birth, s.date) >= 16 && c.id !== boss.spouseId) c.dynasty = false;
  // Two rival families.
  const mobs = s.rivals.filter((r) => r.kind === 'mob');
  s.rivals = s.rivals.filter((r) => r.kind !== 'mob' || mobs.indexOf(r) < 2);
  for (const c of crew(s)) addOpinion(s, c.id, boss.id, 'Years under him', 10, 0);
  fillCouncil(s);
  const ctx = newCtx(s);
  commitPower(ctx, { op: 'designate', mode: 'named', charId: sons[0].id });
  s.eventQueue = [];
  s.pendingEvents = [];
  return s;
}

/** Answer every waiting shadow-court popup with a seeded pick (the player's stand-in). */
function answer(s: GameState, ctx: ReturnType<typeof newCtx>): void {
  const q = s.eventQueue;
  s.eventQueue = [];
  for (const ev of q) {
    if (!ev.defId.startsWith('shadow_')) continue;
    const legal = ev.choices.filter((c) => !c.disabledReason);
    if (!legal.length) continue;
    const pick = legal[hashSeed(`${s.seed}|${ev.iid}`) % legal.length];
    applyEffects(ctx, pick.effects, { label: ev.title, because: pick.because, category: 'event' });
  }
}

/** One headless succession week. */
export function succWeek(s: GameState): void {
  const ctx = newCtx(s);
  const prev = monthKey(s.date);
  s.week += 1;
  s.date = dateOfWeek(s.week);
  if (monthKey(s.date) !== prev) {
    monthlyLife(ctx);
    decayAllRelations(s);
  }
  if (s.gameOver) return;
  shadowWeek(ctx);
  answer(s, ctx);
  s.pendingEvents = [];
}

export function runYears(s: GameState, years: number): GameState {
  for (let i = 0; i < years * 52 && !s.gameOver; i++) succWeek(s);
  return s;
}

/** Force the Don's death now (a seeded scenario) and let a few weeks play out. */
export function donDies(s: GameState, weeks = 4): GameState {
  const ctx = newCtx(s);
  killCharacter(ctx, s.playerId, 'a heart attack at the 500 Club');
  s.eventQueue = [];
  for (let i = 0; i < weeks && !s.gameOver; i++) succWeek(s);
  return s;
}
