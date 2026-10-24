/**
 * Headless simulator: plays N full games for Y in-game years with a simple
 * AI that makes random-but-legal choices, and reports balance + integrity stats.
 *
 *   npm run sim                      # 200 games x 10 years
 *   npm run sim -- --games 50 --years 5 --seed test --json sim-report.json
 */
import { writeFileSync } from 'node:fs';
import { newGameWith, type StartId } from '../src/engine/starts';
import { LIFESTYLE_IDS } from '../src/engine/lifestyle';
import { isFamilyEvent, MAX_FAMILY_POPUPS } from '../src/engine/events';
import { advanceWeek, forceDeath } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { randomTravelAction } from '../src/engine/travel';
import { validatePlayer } from '../src/engine/dynasty';
import { rand } from '../src/engine/rng';
import { MAX_POPUPS } from '../src/engine/events';
import { legalActions, previewAction } from '../src/engine/actions';
import { ORDERS } from '../src/engine/events';
import { validateHierarchy } from '../src/engine/hierarchy';
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
/** Chance per week of an economy order (upgrade, property, managers, HQ, gifts, projects, leverage). */
const ECON_RATE = Number(arg('econ', '0.12'));
/** Chance per week of a trip (a vacation, a business trip, or a move while on the lam). */
const TRAVEL_RATE = Number(arg('travel', '0.04'));
/** Which start to play: classic, rise or sees. */
const START = arg('start', 'classic') as StartId;

const pickOne = <T,>(h: { rng: number }, xs: T[]): T | undefined => (xs.length ? xs[Math.floor(rand(h) * xs.length)] : undefined);

/**
 * The random player: answers every popup with a random legal choice and uses
 * every family of orders — any legal order, a general order (direct or
 * through the chain), a dynasty order, a lifestyle (picked on day one,
 * perks spent as they come) and, now and then, an envoy.
 */
function aiChoices(s: GameState, salt: number): PlayerChoices {
  const h = { rng: (s.rng ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0 };
  const choices: Record<string, string> = {};
  for (const ev of s.pendingEvents) {
    const legal = ev.choices.filter((c) => !c.disabledReason);
    choices[ev.iid] = legal[Math.floor(rand(h) * legal.length)].id;
  }
  const actions: PlayerAction[] = [];
  const add = (a: PlayerAction | undefined) => {
    if (a && !actions.some((x) => JSON.stringify(x) === JSON.stringify(a))) actions.push(a);
  };
  const legal = legalActions(s);
  if (rand(h) < ORDER_RATE) add(pickOne(h, legal));
  if (rand(h) < GENERAL_RATE) {
    const vias = ['direct', 'underboss', 'capo'] as const;
    const general = ORDERS.map((o) => ({ kind: 'order', key: o.key, via: vias[Math.floor(rand(h) * 3)] }) as PlayerAction).filter((a) => !previewAction(s, a).disabledReason);
    add(pickOne(h, general));
  }
  if (rand(h) < DYNASTY_RATE) add(pickOne(h, legal.filter((a) => a.kind === 'dynasty')));
  const boss = s.characters[s.playerId];
  if (boss && !boss.lifestyle) add(pickOne(h, LIFESTYLE_IDS.map((focus) => ({ kind: 'lifestyle', focus }) as PlayerAction)));
  else if (boss?.lifestyle?.points) add(pickOne(h, legal.filter((a) => a.kind === 'perk')));
  if (rand(h) < ENVOY_RATE) add(pickOne(h, legal.filter((a) => a.kind === 'scheme' && a.scheme === 'envoy')));
  if (rand(h) < ECON_RATE) add(pickOne(h, legal.filter((a) => a.kind === 'econ')));
  if (rand(h) < TRAVEL_RATE) add(randomTravelAction(s, h));
  return { choices, actions };
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
  /** Travel counters at the end of the game (travelState.ts). */
  travel?: Record<string, number>;
  hierarchyErrors: string[];
  crew: { defections: number; coups: number; flips: number; makings: number; rivalCrewMoves: number };
  popupKeys: Record<string, number>;
  repeats: number;
  familyOver: number;
  titles: Record<string, number>;
}

function playOne(gi: number): GameResult {
  const r: GameResult = {
    bankruptYear1: false, bankruptEver: false, everNegative: false, treasuryByYear: [], bossDeaths: 0, successions: 0,
    successionFailures: [], unexplained: [], popupsPerWeek: [], heatSamples: { local: [], family: [], federal: [] },
    deathCauses: {}, rivalMoves: {}, weeksPlayed: 0, finalRespect: 0, orders: {}, finalBusinesses: 0, peakUnwashed: 0,
    hierarchyErrors: [], crew: { defections: 0, coups: 0, flips: 0, makings: 0, rivalCrewMoves: 0 }, popupKeys: {}, repeats: 0, familyOver: 0, titles: {},
  };
  const lastSeen: Record<string, number> = {};
  let s: GameState;
  try {
    s = newGameWith(`${SEED}-${gi}`, START);
  } catch (e) {
    r.crashed = `newGame: ${(e as Error).message}`;
    return r;
  }
  r.popupsPerWeek.push(s.pendingEvents.length);
  let consecutiveRed = 0;
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
    const ch = aiChoices(s, w);
    for (const a of ch.actions ?? []) r.orders[a.kind] = (r.orders[a.kind] ?? 0) + 1;
    try {
      res = advanceWeek(s, ch);
    } catch (e) {
      const msg = (e as Error).message;
      if (/reconcile/.test(msg)) r.unexplained.push(msg);
      r.crashed = `week ${s.week}: ${msg}`;
      break;
    }
    // Independent reconciliation check (the engine also throws on failure).
    const errs = reconcile(res.report);
    if (errs.length) r.unexplained.push(...errs.map((x) => `week ${res.report.week}: ${x}`));
    const before = { money: s.money, respect: s.respect, heat: s.heat };
    const after = res.state;
    if (res.report.start.money !== before.money || res.report.end.money !== after.money) r.unexplained.push(`week ${res.report.week}: report snapshot mismatch`);
    for (const b of HEAT_BARS) if (res.report.end.heat[b] !== after.heat[b]) r.unexplained.push(`week ${res.report.week}: heat snapshot mismatch`);

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
      if (consecutiveRed >= INSOLVENT_WEEKS) {
        r.bankruptEver = true;
        if (s.week <= 53) r.bankruptYear1 = true;
      }
    } else consecutiveRed = 0;
    r.popupsPerWeek.push(s.pendingEvents.length);
    if (s.pendingEvents.filter(isFamilyEvent).length > MAX_FAMILY_POPUPS) r.familyOver++;
    for (const e of s.pendingEvents) r.titles[e.defId] = (r.titles[e.defId] ?? 0) + 1;
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
  r.finalRespect = s!.respect;
  if (s!.crewStats) r.crew = { ...s!.crewStats };
  r.finalBusinesses = s!.businesses.filter((b) => b.owner === 'player').length;
  if (s!.travel) r.travel = { ...s!.travel.stats };
  if (s!.dyn) r.dyn = { ...s!.dyn.stats, renown: s!.dyn.renownTotal };
  if (s!.econ) r.econ = { ...s!.econ.stats, buildings: s!.econ.lots.filter((l) => l.status === 'owned' || l.status === 'leased').length, managers: Object.keys(s!.econ.managers).length };
  return r;
}

const t0 = Date.now();
const results: GameResult[] = [];
for (let i = 0; i < GAMES; i++) results.push(playOne(i));
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
console.log(`${GAMES} games × ${YEARS} years, start "${START}" (seed "${SEED}"${STRESS ? `, boss force-killed every ${STRESS} weeks` : ''}) in ${secs.toFixed(1)}s\n`);
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
console.log(`  Treasury at Memorial Day (p10 / median / p90):`);
const medians: number[] = [];
for (let y = 0; y < YEARS; y++) {
  const xs = results.map((r) => r.treasuryByYear[y]).filter((x): x is number => x !== undefined);
  medians.push(quantile(xs, 0.5));
  console.log(`    after year ${String(y + 1).padStart(2)}: ${money(quantile(xs, 0.1)).padStart(10)} / ${money(quantile(xs, 0.5)).padStart(10)} / ${money(quantile(xs, 0.9)).padStart(10)}   (n=${xs.length})`);
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
console.log(`\nCREW (per game, per 10 years)`);
console.log(`  Defections ${per10('defections').toFixed(1)} · coups ${per10('coups').toFixed(1)} · flips ${per10('flips').toFixed(1)} · makings ${per10('makings').toFixed(1)} · rival moves on the crew ${per10('rivalCrewMoves').toFixed(1)}`);
const keys: Record<string, number> = {};
for (const r of results) for (const [k, v] of Object.entries(r.popupKeys)) keys[k] = (keys[k] ?? 0) + v;
const crewPopups = Object.values(keys).reduce((a, b) => a + b, 0);
console.log(`  Crew decisions: ${Object.keys(keys).length} kinds; ${(crewPopups / Math.max(1, results.reduce((a, r) => a + r.weeksPlayed, 0))).toFixed(2)} per week; same man + same kind within 12 weeks: ${pct(results.reduce((a, r) => a + r.repeats, 0), crewPopups)}`);
console.log(`  Mix: ${Object.entries(keys).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.replace('crew_', '')} ${pct(v, crewPopups)}`).join(', ')}`);
const moves: Record<string, number> = {};
for (const r of results) for (const [k, v] of Object.entries(r.rivalMoves)) moves[k] = (moves[k] ?? 0) + v;
console.log(`  Rival actions per game:     ${Object.entries(moves).map(([k, v]) => `${k} ${(v / GAMES).toFixed(0)}`).join(', ')}`);

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
