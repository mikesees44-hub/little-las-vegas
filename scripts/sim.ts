/**
 * Headless simulator: plays N full games for Y in-game years with a simple
 * AI that makes random-but-legal choices, and reports balance + integrity stats.
 *
 *   npm run sim                      # 200 games x 10 years
 *   npm run sim -- --games 50 --years 5 --seed test --json sim-report.json
 */
import { writeFileSync } from 'node:fs';
import { newGameWith, type StartId } from '../src/engine/starts';
import { AGE_RANGE, BACKGROUNDS, BIRTHPLACES, VICES, creatorBase, validateCharOptions, type CharOptions } from '../src/engine/charCreate';
import { ALL_TRAITS } from '../src/engine/characters';
import { hashSeed } from '../src/engine/rng';
import { LIFESTYLE_IDS } from '../src/engine/lifestyle';
import { isFamilyEvent, MAX_FAMILY_POPUPS } from '../src/engine/events';
import { advanceWeek, forceDeath } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { affordable, affordableChoices, choiceCost, isCareless, isCutback, newBudget, orderCost, spare, spend, trackBudget, type Budget } from './simBudget';
import { dumpLedger, ledgerGameDone, ledgerTap, orderTap, printLedger } from './simLedger';
import { randomTravelAction } from '../src/engine/travel';
import { validatePlayer } from '../src/engine/dynasty';
import { rand } from '../src/engine/rng';
import { MAX_POPUPS } from '../src/engine/events';
import { legalActions, previewAction } from '../src/engine/actions';
import { ORDERS } from '../src/engine/events';
import { validateHierarchy } from '../src/engine/hierarchy';
import { whatShouldIDo } from '../src/engine/opportunities';
import { rankCandidates } from '../src/engine/candidates';
import { explainAction } from '../src/engine/advice';
import { romanceActions } from '../src/engine/romance';
import { polActions } from '../src/engine/politics';
import { population } from '../src/engine/polPeople';
import { minigameOf, randomMoves } from '../src/engine/minigames';
import { HEAT_BARS, type GameState, type PlayerAction, type PlayerChoices } from '../src/engine/types';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const GAMES = Number(arg('games', '200'));
const YEARS = Number(arg('years', '10'));
const SEED = arg('seed', 'sim');
const JSON_OUT = arg('json', '');
/** Stress succession: force the boss to die every N weeks (0 = off). */
const STRESS = Number(arg('stress', '0'));
const WEEKS = YEARS * 52;
const INSOLVENT_WEEKS = 8; // "bankrupt" = treasury below $0 for 8+ consecutive weeks

/** Chance per week that the random player gives an order (buy, lend, launch a job ...). */
const ORDER_RATE = Number(arg('orders', '0.15'));
/** Chance per week that the random player gives one of the general orders (the old weekly sit-down). */
const GENERAL_RATE = Number(arg('general', '0.35'));
/** Chance per week of a dynasty order (marriage, guardian, hosting, decision, legacy). */
const DYNASTY_RATE = Number(arg('dynasty', '0.08'));
/** Chance per week of sending an envoy to another city. */
const ENVOY_RATE = Number(arg('envoys', '0.03'));
/** Chance per week of a power order (heir, grooming, protégé, amends, blitz prep/launch, front, the ladder). */
const POWER_RATE = Number(arg('power', '0.04'));
/** Chance per week of a romance interaction (court, affair, propose, end it, separate). */
const ROMANCE_RATE = Number(arg('romance', '0.015'));
/** Chance per week of a political order (cultivate, payroll, favors, campaigns, lobbying, kids, recruits). */
const POL_RATE = Number(arg('politics', '0.12'));
/** Share of opened mini-games the random player plays move by move (the rest play out on their own). */
const MG_PLAY_RATE = Number(arg('mgplay', '0.3'));
/** Chance per week of an economy order (upgrade, property, managers, HQ, gifts, projects, leverage). */
const ECON_RATE = Number(arg('econ', '0.12'));
/** Chance per week of a bones or books order (put a prospect on a job, a favor, check a report, confront a skim, change the books). */
const BONES_RATE = Number(arg('bones', '0.1'));
/** Which start to play: classic, rise, sees, associate, soldier or capo. */
/** Chance per week of a trip (a vacation, a business trip, or a move while on the lam). */
const TRAVEL_RATE = Number(arg('travel', '0.04'));
/** Which start to play: classic, rise or sees. */
const START = arg('start', 'classic') as StartId;
/** Chance per week the random player takes the advice: the top "What should I do?" item, or the recommended pick. */
const ADVICE_RATE = Number(arg('advice', '0.05'));
/** Share of games started through the character creator with random (valid, normal-difficulty) picks (--custom 0.2). Off by default so the balance targets match master. */
const CUSTOM_RATE = Number(arg('custom', '0'));
/** Print the per-line money ledger for years 1 and 3 (--ledger 1). */
const LEDGER = arg('ledger', '0') !== '0';
/**
 * Share of games played by a careless boss: the old random player, who spends at its fixed weekly
 * rates whatever the treasury says. The rest are careful (budget-aware, simBudget.ts).
 * --careless 0 = all careful; --reckless 1 (= --careless 1) = all careless, the stress check.
 */
const CARELESS = arg('reckless', '0') !== '0' ? 1 : Number(arg('careless', '0.5'));

/** Random creator picks, retried until valid (falls back to none). */
function randomCharOptions(seed: string, start: StartId): CharOptions | undefined {
  const base = creatorBase(newGameWith(seed, start), start);
  for (let k = 0; k < 8; k++) {
    let h = hashSeed(`${seed}:cc:${k}`);
    const r = () => ((h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0) % 10000) / 10000;
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
    const [lo, hi] = AGE_RANGE[start];
    const o: CharOptions = {
      age: lo + Math.floor(r() * (hi - lo + 1)), birthplace: pick(BIRTHPLACES).id, background: pick(BACKGROUNDS).id, vice: pick(VICES).id,
      traits: Array.from(new Set([pick(ALL_TRAITS), pick(ALL_TRAITS)])), lifestyle: pick(['muscle', 'money', 'politics', 'family', 'shadows'] as const),
      skills: { force: Math.floor(r() * 7) - 3, business: Math.floor(r() * 7) - 3 }, married: r() < 0.8, sex: r() < 0.15 ? 'F' : 'M',
      kids: Math.max(base.kidsRange[0], Math.floor(r() * 4)), motherAlive: r() < 0.4,
    };
    if (!validateCharOptions(base, o).length) return o;
  }
  return undefined;
}

const pickOne = <T,>(h: { rng: number }, xs: T[]): T | undefined => (xs.length ? xs[Math.floor(rand(h) * xs.length)] : undefined);

/**
 * The random player: answers every popup with a random legal choice and uses
 * every family of orders — any legal order, a general order (direct or
 * through the chain), a dynasty order, a lifestyle (picked on day one,
 * perks spent as they come) and, now and then, an envoy.
 */
function aiChoices(s: GameState, salt: number, budget?: Budget): PlayerChoices {
  const h = { rng: (s.rng ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0 };
  const choices: Record<string, string> = {};
  const minigames: Record<string, string[]> = {};
  for (const ev of s.pendingEvents) {
    let legal = ev.choices.filter((c) => !c.disabledReason);
    if (budget) legal = affordableChoices(s, budget, legal);
    const ch = legal[Math.floor(rand(h) * legal.length)];
    choices[ev.iid] = ch.id;
    if (budget) spend(budget, choiceCost(ch));
    // Mini-games: usually let it play out (the same odds); sometimes play them with random legal moves.
    const mg = minigameOf(ch);
    if (mg && mg.params.play !== 0 && rand(h) < MG_PLAY_RATE) minigames[ev.iid] = randomMoves(s, mg.game, mg.iid, mg.params, mg.parts, h);
  }
  const actions: PlayerAction[] = [];
  const add = (a: PlayerAction | undefined) => {
    if (a && !actions.some((x) => JSON.stringify(x) === JSON.stringify(a))) {
      if (budget && a.kind !== 'perk' && a.kind !== 'lifestyle' && !affordable(s, budget, a)) return; // the allowance may be spent by an earlier pick
      actions.push(a);
      if (budget) spend(budget, orderCost(s, a));
    }
  };
  // Budget-aware: optional orders only from the money above the reserve (simBudget.ts).
  const legal = budget ? legalActions(s).filter((a) => a.kind === 'perk' || affordable(s, budget, a)) : legalActions(s);
  if (budget && spare(s, budget) < 0 && rand(h) < 0.25) add(pickOne(h, [...legal, ...polActions(s)].filter((a) => isCutback(a) && !previewAction(s, a).disabledReason)));
  if (rand(h) < ORDER_RATE) add(pickOne(h, legal));
  if (rand(h) < GENERAL_RATE) {
    const vias = ['direct', 'underboss', 'capo'] as const;
    const general = ORDERS.map((o) => ({ kind: 'order', key: o.key, via: vias[Math.floor(rand(h) * 3)] }) as PlayerAction).filter((a) => !previewAction(s, a).disabledReason && (!budget || affordable(s, budget, a)));
    add(pickOne(h, general));
  }
  if (rand(h) < DYNASTY_RATE) add(pickOne(h, legal.filter((a) => a.kind === 'dynasty')));
  const boss = s.characters[s.playerId];
  if (boss && !boss.lifestyle) add(pickOne(h, LIFESTYLE_IDS.map((focus) => ({ kind: 'lifestyle', focus }) as PlayerAction)));
  else if (boss?.lifestyle?.points) add(pickOne(h, legal.filter((a) => a.kind === 'perk')));
  if (rand(h) < POWER_RATE) add(pickOne(h, legal.filter((a) => a.kind === 'power')));
  if (rand(h) < ENVOY_RATE) add(pickOne(h, legal.filter((a) => a.kind === 'scheme' && a.scheme === 'envoy')));
  if (rand(h) < ROMANCE_RATE) add(pickOne(h, romanceActions(s).filter((a) => !previewAction(s, a).disabledReason && (!budget || affordable(s, budget, a)))));
  // Political orders, when there is money to spare (a payroll is a weekly bill).
  if (rand(h) < POL_RATE) {
    const spare = s.money - 20000;
    add(pickOne(h, polActions(s).filter((a) => {
      const p = previewAction(s, a);
      return !p.disabledReason && p.cost <= spare && !(a.op.op === 'payroll' && a.op.on && spare < 15000) && (!budget || affordable(s, budget, a));
    })));
  }
  if (rand(h) < ECON_RATE) add(pickOne(h, legal.filter((a) => a.kind === 'econ')));
  if (rand(h) < ADVICE_RATE) {
    // Take the advice: the top item's order, or the recommended man for its pick.
    for (const o of whatShouldIDo(s, 5)) {
      const a = o.link.action ?? (o.link.role ? rankCandidates(s, o.link.role).candidates.find((c) => c.action && !c.disabledReason)?.action : undefined);
      // Only free advice (appointments, council tasks, promotions, bones jobs): it must not move the money targets.
      // Officials come through POL_RATE (a payroll is a weekly bill).
      if (a && a.kind !== 'pol' && previewAction(s, a).cost === 0 && !explainAction(s, a).verdict.label.startsWith('Not yet')) { add(a); break; }
    }
  }
  if (rand(h) < BONES_RATE) add(pickOne(h, legal.filter((a) => a.kind === 'bones' || a.kind === 'ledger')));
  if (rand(h) < TRAVEL_RATE) {
    const t = randomTravelAction(s, h);
    if (t && (!budget || affordable(s, budget, t))) add(t);
  }
  return { choices, actions, minigames };
}

const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) + '%' : 'n/a');
function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
const money = (n: number) => (Number.isNaN(n) ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`);

interface GameResult {
  crashed?: string;
  /** Played by a careless boss (no budget). */
  careless?: boolean;
  /** Longest run of weeks in the red during year 1. */
  redStreakY1: number;
  bankruptYear1: boolean;
  bankruptEver: boolean;
  everNegative: boolean;
  treasuryByYear: number[];
  bossDeaths: number;
  successions: number;
  successionFailures: string[];
  gameOver?: string;
  gameOverWeek?: number;
  unexplained: string[];
  popupsPerWeek: number[];
  heatSamples: Record<string, number[]>;
  deathCauses: Record<string, number>;
  rivalMoves: Record<string, number>;
  weeksPlayed: number;
  finalRespect: number;
  orders: Record<string, number>;
  finalBusinesses: number;
  peakUnwashed: number;
  /** Dynasty-layer counters at the end of the game (familyState.ts). */
  dyn?: Record<string, number>;
  /** Economy-layer counters at the end of the game (econState.ts). */
  econ?: Record<string, number>;
  /** Bones and books counters at the end of the game (bonesState.ts, ledgerbookState.ts). */
  bones?: Record<string, number>;
  /** Travel counters at the end of the game (travelState.ts). */
  travel?: Record<string, number>;
  hierarchyErrors: string[];
  crew: { defections: number; coups: number; flips: number; makings: number; rivalCrewMoves: number };
  popupKeys: Record<string, number>;
  repeats: number;
  familyOver: number;
  titles: Record<string, number>;
  /** Power-pillar counters (powerState.ts). */
  power?: Record<string, number>;
  /** Story pillar counters at the end (content pack + romance). */
  story?: Record<string, number>;
  romance?: Record<string, number>;
  packPopups: number;
  /** Politics counters at the end (polState.ts). */
  pol?: Record<string, number>;
  mg: Record<string, number>;
}

function playOne(gi: number): GameResult {
  const r: GameResult = {
    bankruptYear1: false, redStreakY1: 0, bankruptEver: false, everNegative: false, treasuryByYear: [], bossDeaths: 0, successions: 0,
    successionFailures: [], unexplained: [], popupsPerWeek: [], heatSamples: { local: [], family: [], federal: [] },
    deathCauses: {}, rivalMoves: {}, weeksPlayed: 0, finalRespect: 0, orders: {}, finalBusinesses: 0, peakUnwashed: 0,
    hierarchyErrors: [], crew: { defections: 0, coups: 0, flips: 0, makings: 0, rivalCrewMoves: 0 }, popupKeys: {}, repeats: 0, familyOver: 0, titles: {}, packPopups: 0, mg: {},
  };
  const lastSeen: Record<string, number> = {};
  let s: GameState;
  try {
    const custom = (hashSeed(`${SEED}-${gi}:custom`) % 1000) / 1000 < CUSTOM_RATE ? randomCharOptions(`${SEED}-${gi}`, START) : undefined;
    s = newGameWith(`${SEED}-${gi}`, START, custom);
  } catch (e) {
    r.crashed = `newGame: ${(e as Error).message}`;
    return r;
  }
  r.popupsPerWeek.push(s.pendingEvents.length);
  let consecutiveRed = 0;
  r.careless = isCareless(gi, CARELESS);
  const budget = r.careless ? undefined : newBudget(`${SEED}-${gi}`, s.money);
  for (let w = 0; w < WEEKS; w++) {
    if (s.gameOver) break;
    if (STRESS && w > 0 && w % STRESS === 0) {
      const prev = s.playerId;
      try {
        s = forceDeath(s, prev, 'stress test').state;
      } catch (e) {
        r.crashed = `forceDeath week ${s.week}: ${(e as Error).message}`;
        break;
      }
      r.bossDeaths++;
      if (!s.gameOver) {
        r.successions++;
        const v = validatePlayer(s);
        if (v.length) r.successionFailures.push(`forced week ${s.week}: ${v.join(', ')}`);
      }
      if (s.gameOver) break;
    }
    const prevPlayer = s.playerId;
    let res;
    const ch = aiChoices(s, w, budget);
    for (const a of ch.actions ?? []) r.orders[a.kind] = (r.orders[a.kind] ?? 0) + 1;
    if (LEDGER) for (const a of ch.actions ?? []) orderTap(s.week, a.kind === 'order' ? `order:${a.key}` : 'op' in a && a.op && typeof a.op === 'object' ? `${a.kind}:${String(Object.values(a.op)[0])}` : a.kind, previewAction(s, a).cost);
    try {
      res = advanceWeek(s, ch);
    } catch (e) {
      const msg = (e as Error).message;
      if (/reconcile/.test(msg)) r.unexplained.push(msg);
      r.crashed = `game ${SEED}-${gi} (${r.careless ? "careless" : "careful"}) week ${s.week}: ${msg}`;
      break;
    }
    // Independent reconciliation check (the engine also throws on failure).
    const errs = reconcile(res.report);
    if (errs.length) r.unexplained.push(...errs.map((x) => `week ${res.report.week}: ${x}`));
    const before = { money: s.money, respect: s.respect, heat: s.heat };
    const after = res.state;
    if (res.report.start.money !== before.money || res.report.end.money !== after.money) r.unexplained.push(`week ${res.report.week}: report snapshot mismatch`);
    for (const b of HEAT_BARS) if (res.report.end.heat[b] !== after.heat[b]) r.unexplained.push(`week ${res.report.week}: heat snapshot mismatch`);

    if (LEDGER) ledgerTap(s.week, res.report.lines);
    if (budget) trackBudget(budget, res.report.lines);
    s = after;
    r.weeksPlayed++;
    if (s.playerId !== prevPlayer || (s.gameOver && s.gameOver.reason === 'no_heir')) {
      r.bossDeaths++;
      if (!s.gameOver) {
        r.successions++;
        const v = validatePlayer(s);
        if (v.length) r.successionFailures.push(`week ${s.week}: ${v.join(', ')}`);
      }
    }
    if (s.money < 0) {
      r.everNegative = true;
      consecutiveRed++;
      if (s.week <= 53) r.redStreakY1 = Math.max(r.redStreakY1, consecutiveRed);
      if (consecutiveRed >= INSOLVENT_WEEKS) {
        r.bankruptEver = true;
        if (s.week <= 53) r.bankruptYear1 = true;
      }
    } else consecutiveRed = 0;
    r.popupsPerWeek.push(s.pendingEvents.length);
    if (s.pendingEvents.filter(isFamilyEvent).length > MAX_FAMILY_POPUPS) r.familyOver++;
    for (const e of s.pendingEvents) r.titles[e.defId] = (r.titles[e.defId] ?? 0) + 1;
    r.packPopups += s.pendingEvents.filter((e) => e.meta?.pack).length;
    for (const e of s.pendingEvents) {
      if (!e.meta?.crew) continue;
      r.popupKeys[e.defId] = (r.popupKeys[e.defId] ?? 0) + 1;
      const k = `${e.defId}:${e.meta.charId}`;
      if (s.week - (lastSeen[k] ?? -999) < 12) r.repeats++;
      lastSeen[k] = s.week;
    }
    if (r.hierarchyErrors.length < 5) r.hierarchyErrors.push(...validateHierarchy(s).map((x) => `week ${s.week}: ${x}`));
    r.peakUnwashed = Math.max(r.peakUnwashed, s.unwashed);
    for (const b of HEAT_BARS) r.heatSamples[b].push(s.heat[b]);
    if ((s.week - 1) % 52 === 0) r.treasuryByYear.push(s.money);
    for (const line of res.log) {
      const m = /^\[(\w+)\]/.exec(line);
      if (m) r.rivalMoves[m[1]] = (r.rivalMoves[m[1]] ?? 0) + 1;
    }
  }
  if (LEDGER) ledgerGameDone(r.bankruptYear1);
  if (s!.gameOver) {
    r.gameOver = s!.gameOver.reason;
    r.gameOverWeek = s!.gameOver.week;
  }
  for (const c of Object.values(s!.characters)) {
    if (!c.alive && c.death && c.death.week > 0 && (c.dynasty || c.faction === 'player')) {
      const cause = c.death.cause.replace(/ by the \w+ crew| on the orders of .*/, '').replace(/found in the marsh.*/, 'executed (skimming)');
      r.deathCauses[cause] = (r.deathCauses[cause] ?? 0) + 1;
    }
  }
  for (const h of s!.mg?.history ?? []) r.mg[`${h.game}:${h.tone}`] = (r.mg[`${h.game}:${h.tone}`] ?? 0) + 1;
  r.finalRespect = s!.respect;
  if (s!.crewStats) r.crew = { ...s!.crewStats };
  r.finalBusinesses = s!.businesses.filter((b) => b.owner === 'player').length;
  if (s!.travel) r.travel = { ...s!.travel.stats };
  if (s!.dyn) r.dyn = { ...s!.dyn.stats, renown: s!.dyn.renownTotal };
  if (s!.power) r.power = { ...s!.power.stats };
  if (s!.story) r.story = { ...s!.story.stats, chainsStarted: Object.keys(s!.story.chains).length };
  if (s!.romance) r.romance = { ...s!.romance.stats };
  if (s!.pol) r.pol = { ...s!.pol.stats, laws: Object.keys(s!.pol.laws).length, population: population(s!).total, owned: Object.values(s!.pol.ctl).filter((c) => (c.personal + c.financial) / 2 * 0.55 + (100 - c.independence) * 0.3 + (100 - c.resentment) * 0.15 - c.exposure * 0.25 >= 70).length };
  if (s!.bones || s!.ledgerBook) r.bones = { ...(s!.bones?.stats ?? {}), ...Object.fromEntries(Object.entries(s!.ledgerBook?.stats ?? {}).map(([k, v]) => [`books_${k}`, v])) };
  if (s!.econ) r.econ = { ...s!.econ.stats, buildings: s!.econ.lots.filter((l) => l.status === 'owned' || l.status === 'leased').length, managers: Object.keys(s!.econ.managers).length };
  return r;
}

const t0 = Date.now();
const results: GameResult[] = [];
/** Replay one game by its index (--only 75), for debugging a crash. */
const ONLY = arg('only', '');
if (ONLY) results.push(playOne(Number(ONLY)));
else for (let i = 0; i < GAMES; i++) results.push(playOne(i));
const secs = (Date.now() - t0) / 1000;

const crashes = results.filter((r) => r.crashed);
const unexplained = results.flatMap((r) => r.unexplained);
const succFails = results.flatMap((r) => r.successionFailures);
const allPopups = results.flatMap((r) => r.popupsPerWeek);
const over = allPopups.filter((n) => n > MAX_POPUPS).length;
const overFour = allPopups.filter((n) => n > 4).length;
const bossDeaths = results.reduce((a, r) => a + r.bossDeaths, 0);
const successions = results.reduce((a, r) => a + r.successions, 0);
const gamesWithBossDeath = results.filter((r) => r.bossDeaths > 0).length;
const gameOvers = results.filter((r) => r.gameOver);

console.log(`\nLITTLE LAS VEGAS — headless simulation`);
console.log(`${GAMES} games × ${YEARS} years, start "${START}" (seed "${SEED}", ${CARELESS >= 1 ? 'all careless (reckless)' : CARELESS <= 0 ? 'all careful (budget-aware)' : `${Math.round(CARELESS * 100)}% careless bosses`}${STRESS ? `, boss force-killed every ${STRESS} weeks` : ''}) in ${secs.toFixed(1)}s\n`);
console.log(`INTEGRITY`);
console.log(`  Crashes:                    ${crashes.length}`);
for (const c of crashes.slice(0, 5)) console.log(`    - ${c.crashed}`);
console.log(`  Unexplained deltas:         ${unexplained.length}`);
for (const u of unexplained.slice(0, 5)) console.log(`    - ${u}`);
console.log(`  Invalid successions:        ${succFails.length}`);
for (const u of succFails.slice(0, 5)) console.log(`    - ${u}`);
const hier = results.flatMap((r) => r.hierarchyErrors);
console.log(`  Hierarchy integrity errors: ${hier.length}`);
for (const u of hier.slice(0, 5)) console.log(`    - ${u}`);

console.log(`\nECONOMY`);
console.log(`  Bankrupt in year 1:         ${pct(results.filter((r) => r.bankruptYear1).length, GAMES)}   (treasury < $0 for ${INSOLVENT_WEEKS}+ straight weeks)`);
console.log(`  Bankrupt at any point:      ${pct(results.filter((r) => r.bankruptEver).length, GAMES)}`);
console.log(`  Ever in the red:            ${pct(results.filter((r) => r.everNegative).length, GAMES)}`);
console.log(`  Longest red run in year 1:  1-3 weeks ${pct(results.filter((r) => r.redStreakY1 >= 1 && r.redStreakY1 < 4).length, GAMES)}, 4-7 weeks ${pct(results.filter((r) => r.redStreakY1 >= 4 && r.redStreakY1 < 8).length, GAMES)}, 8+ ${pct(results.filter((r) => r.redStreakY1 >= 8).length, GAMES)}`);
console.log(`  Treasury at Memorial Day (p10 / median / p90):`);
const medians: number[] = [];
for (let y = 0; y < YEARS; y++) {
  const xs = results.map((r) => r.treasuryByYear[y]).filter((x): x is number => x !== undefined);
  medians.push(quantile(xs, 0.5));
  console.log(`    after year ${String(y + 1).padStart(2)}: ${money(quantile(xs, 0.1)).padStart(10)} / ${money(quantile(xs, 0.5)).padStart(10)} / ${money(quantile(xs, 0.9)).padStart(10)}   (n=${xs.length})`);
}
if (CARELESS > 0 && CARELESS < 1) {
  for (const [name, rs] of [['careful', results.filter((r) => !r.careless)], ['careless', results.filter((r) => r.careless)]] as const) {
    const y = (k: number) => money(quantile(rs.map((r) => r.treasuryByYear[k]).filter((x): x is number => x !== undefined), 0.5));
    console.log(`  ${name.padEnd(9)} bosses (${rs.length}): bankrupt in year 1 ${pct(rs.filter((r) => r.bankruptYear1).length, rs.length)}, median treasury after years 1/3/10: ${y(0)} / ${y(2)} / ${y(9)}`);
  }
}
console.log(`  Final respect (median):     ${quantile(results.map((r) => r.finalRespect), 0.5)}`);
console.log(`  Businesses at the end (median): ${quantile(results.map((r) => r.finalBusinesses), 0.5)}   peak unwashed cash (median): ${money(quantile(results.map((r) => r.peakUnwashed), 0.5))}`);
const orders: Record<string, number> = {};
for (const r of results) for (const [k, v] of Object.entries(r.orders)) orders[k] = (orders[k] ?? 0) + v;
console.log(`  Orders per game:            ${Object.entries(orders).map(([k, v]) => `${k} ${(v / GAMES).toFixed(1)}`).join(', ')}`);

const travelGames = results.filter((r) => r.weeksPlayed > 0);
{
  const keys = ['trips', 'vacations', 'business', 'flights', 'captures', 'surrenders', 'exiles', 'returns', 'discoveries', 'tails', 'accidents', 'meetings', 'sightings'];
  console.log(`  Travel per game (mean): ${keys.map((k) => `${k} ${(travelGames.reduce((a, r) => a + (r.travel?.[k] ?? 0), 0) / Math.max(1, travelGames.length)).toFixed(2)}`).join(', ')}`);
}
const boneGames = results.filter((r) => r.bones && r.weeksPlayed > 0);
if (boneGames.length) {
  const keys = Object.keys(boneGames[0].bones!);
  console.log(`  Bones & books per game (mean): ${keys.map((k) => `${k} ${(boneGames.reduce((a, r) => a + (r.bones![k] ?? 0), 0) / boneGames.length).toFixed(1)}`).join(', ')}`);
}
const econGames = results.filter((r) => r.econ && r.weeksPlayed > 0);
if (econGames.length) {
  const keys = Object.keys(econGames[0].econ!);
  console.log(`  Economy layer per game (mean): ${keys.map((k) => `${k} ${(econGames.reduce((a, r) => a + (r.econ![k] ?? 0), 0) / econGames.length).toFixed(1)}`).join(', ')}`);
}

console.log(`\nDYNASTY`);
console.log(`  Games where the boss died:  ${pct(gamesWithBossDeath, GAMES)}  (${bossDeaths} boss deaths total)`);
console.log(`  Successions:                ${successions}  (valid: ${successions - succFails.length})`);
console.log(`  Dynasty ended (no heir):    ${gameOvers.length}`);
const causes: Record<string, number> = {};
for (const r of results) for (const [k, v] of Object.entries(r.deathCauses)) causes[k] = (causes[k] ?? 0) + v;
console.log(`  Deaths in house & crew by cause:`);
for (const [k, v] of Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`    ${String(v).padStart(5)}  ${k}`);

const dynGames = results.filter((r) => r.dyn && r.weeksPlayed > 0);
if (dynGames.length) {
  const keys = Object.keys(dynGames[0].dyn!);
  const per10 = (k: string) => dynGames.reduce((a, r) => a + (r.dyn![k] ?? 0) * (520 / r.weeksPlayed), 0) / dynGames.length;
  console.log(`  House events per 10 years (mean): ${keys.map((k) => `${k} ${per10(k).toFixed(1)}`).join(', ')}`);
}

const per10g = (rs: GameResult[], pick: (r: GameResult) => Record<string, number> | undefined) => {
  const live = rs.filter((r) => pick(r) && r.weeksPlayed > 0);
  if (!live.length) return '';
  const keys = Object.keys(pick(live[0])!);
  return keys.map((k) => `${k} ${(live.reduce((a, r) => a + (pick(r)![k] ?? 0) * (520 / r.weeksPlayed), 0) / live.length).toFixed(1)}`).join(', ');
};
console.log(`\nSTORY (per game, per 10 years, mean)`);
console.log(`  Content pack: ${per10g(results, (r) => r.story)}`);
const packShare = results.reduce((a, r) => a + r.packPopups, 0) / Math.max(1, allPopups.reduce((a, b) => a + b, 0));
console.log(`  Pack share of all popups: ${(packShare * 100).toFixed(1)}%`);
console.log(`  Romance: ${per10g(results, (r) => r.romance)}`);
const polGames = results.filter((r) => r.pol && r.weeksPlayed > 0);
if (polGames.length) {
  const keys = Object.keys(polGames[0].pol!);
  const mean = (k: string) => polGames.reduce((a, r) => a + (r.pol![k] ?? 0), 0) / polGames.length;
  console.log(`\nPOLITICS (mean per game at the end)`);
  console.log(`  ${keys.map((k) => `${k} ${mean(k).toFixed(1)}`).join(', ')}`);
  const inc = mean('contested') ? mean('incumbentWins') / mean('contested') : 0;
  console.log(`  Incumbents win ${(inc * 100).toFixed(0)}% of contested races; offices owned (control 70+) at the end: ${mean('owned').toFixed(1)}`);
}

console.log(`\nHEAT (share of weeks in each band)`);
for (const b of HEAT_BARS) {
  const xs = results.flatMap((r) => r.heatSamples[b]);
  const band = (lo: number, hi: number) => pct(xs.filter((x) => x >= lo && x < hi).length, xs.length).padStart(6);
  console.log(`  ${b.padEnd(8)} 0-19 ${band(0, 20)} | 20-39 ${band(20, 40)} | 40-59 ${band(40, 60)} | 60-79 ${band(60, 80)} | 80+ ${band(80, 101)} | median ${quantile(xs, 0.5)}`);
}

console.log(`\nEVENTS`);
console.log(`  Popups per week: mean ${(allPopups.reduce((a, b) => a + b, 0) / allPopups.length).toFixed(2)}, max ${Math.max(...allPopups)}`);
const dist: Record<number, number> = {};
for (const n of allPopups) dist[n] = (dist[n] ?? 0) + 1;
console.log(`  Distribution: ${Object.entries(dist).map(([k, v]) => `${k}: ${pct(v, allPopups.length)}`).join(', ')}`);
console.log(`  Weeks with >4 popups:       ${overFour} ${overFour ? '<-- FLAG' : ''}`);
const famOver = results.reduce((a, r) => a + r.familyOver, 0);
console.log(`  Weeks with >${MAX_FAMILY_POPUPS} family popup:  ${famOver} ${famOver ? '<-- FLAG' : ''}`);
const allTitles: Record<string, number> = {};
for (const r of results) for (const [k, v] of Object.entries(r.titles)) allTitles[k] = (allTitles[k] ?? 0) + v;
const totalPop = Object.values(allTitles).reduce((a, b) => a + b, 0);
console.log(`  Distinct event kinds: ${Object.keys(allTitles).length}; top: ${Object.entries(allTitles).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${pct(v, totalPop)}`).join(', ')}`);
const per10 = (k: keyof GameResult['crew']) => (results.reduce((a, r) => a + r.crew[k], 0) / Math.max(1, results.reduce((a, r) => a + r.weeksPlayed, 0))) * 520;
{
  const all: Record<string, number> = {};
  for (const r of results) for (const [k, v] of Object.entries(r.mg)) all[k] = (all[k] ?? 0) + v;
  console.log(`\nMINI-GAMES (last 40 per game, total)`);
  console.log(`  ${Object.entries(all).sort().map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
}
console.log(`\nCREW (per game, per 10 years)`);
console.log(`  Defections ${per10('defections').toFixed(1)} · coups ${per10('coups').toFixed(1)} · flips ${per10('flips').toFixed(1)} · makings ${per10('makings').toFixed(1)} · rival moves on the crew ${per10('rivalCrewMoves').toFixed(1)}`);
const pg = results.filter((r) => r.power && r.weeksPlayed > 0);
if (pg.length) {
  const tot = (k: string) => pg.reduce((a, r) => a + (r.power![k] ?? 0), 0);
  const per = (k: string) => (tot(k) / Math.max(1, results.reduce((a, r) => a + r.weeksPlayed, 0))) * 520;
  console.log(`\nPOWER (per game, per 10 years)`);
  console.log(`  Blitzes ${per('blitzes').toFixed(2)} (on you ${per('blitzesOnYou').toFixed(2)}) · crises ${per('crises').toFixed(2)} · coups ${per10('coups').toFixed(2)} · falls ${per('falls').toFixed(2)} · comebacks ${per('comebacks').toFixed(2)} (games with a comeback: ${pg.filter((r) => (r.power!.comebacks ?? 0) > 0).length})`);
  console.log(`  Grievances ${per('grievances').toFixed(1)} · broken promises ${per('brokenPromises').toFixed(2)} · petitions ${per('petitions').toFixed(1)} (liars caught ${per('liarsCaught').toFixed(2)}) · fronts ${per('fronts').toFixed(2)} · discoveries ${per('discoveries').toFixed(2)} · promotions ${per('promotions').toFixed(2)}`);
}
const keys: Record<string, number> = {};
for (const r of results) for (const [k, v] of Object.entries(r.popupKeys)) keys[k] = (keys[k] ?? 0) + v;
const crewPopups = Object.values(keys).reduce((a, b) => a + b, 0);
console.log(`  Crew decisions: ${Object.keys(keys).length} kinds; ${(crewPopups / Math.max(1, results.reduce((a, r) => a + r.weeksPlayed, 0))).toFixed(2)} per week; same man + same kind within 12 weeks: ${pct(results.reduce((a, r) => a + r.repeats, 0), crewPopups)}`);
console.log(`  Mix: ${Object.entries(keys).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.replace('crew_', '')} ${pct(v, crewPopups)}`).join(', ')}`);
const moves: Record<string, number> = {};
for (const r of results) for (const [k, v] of Object.entries(r.rivalMoves)) moves[k] = (moves[k] ?? 0) + v;
console.log(`  Rival actions per game:     ${Object.entries(moves).map(([k, v]) => `${k} ${(v / GAMES).toFixed(0)}`).join(', ')}`);

if (LEDGER) printLedger();
if (LEDGER && arg('ledger', '0') !== '1') dumpLedger(arg('ledger', '0'));

const y1b = results.filter((r) => r.bankruptYear1).length / GAMES;
const y3 = medians[2];
const checks = [
  ['no crashes', crashes.length === 0],
  ['no unexplained deltas', unexplained.length === 0],
  ['year-1 bankruptcy 4–10%', START !== 'classic' || (y1b >= 0.04 && y1b <= 0.1)],
  ['median year-3 treasury in $50K–$500K', YEARS < 3 || (y3 >= 50000 && y3 <= 500000)],
  ['successions always valid', succFails.length === 0],
  ['no week over popup cap', over === 0],
  ['no week with more than one family popup', results.every((r) => r.familyOver === 0)],
  ['no hierarchy integrity errors', hier.length === 0],
] as const;
console.log(`\nTARGETS`);
for (const [name, ok] of checks) console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`);

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ games: GAMES, years: YEARS, seed: SEED, medians, crashes: crashes.map((c) => c.crashed), unexplained, succFails }, null, 2));
  console.log(`\nWrote ${JSON_OUT}`);
}
process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
