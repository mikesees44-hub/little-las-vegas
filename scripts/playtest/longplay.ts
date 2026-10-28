/**
 * Long-play harness: one game, one bot style, N years, a per-year log written as JSON.
 *
 *   npx tsx scripts/playtest/longplay.ts --bot greedy --seed a --years 10 --out /tmp/x.json
 *   npx tsx scripts/playtest/longplay.ts --all --years 10 --dir out/   # every bot x 3 seeds, serially
 *   npx tsx scripts/playtest/longplay.ts --bot passive,greedy --seed s1,s2 --dir out/
 *
 * Per year: family cash / treasury / pocket, heat, crew size and loyalty, deaths, successions,
 * rival moves, events shown (count, distinct, repeats), meaningful decisions per week, dead-end
 * weeks, legal orders on offer, NaN checks, week timings.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { newGameWith } from '../../src/engine/starts';
import { advanceWeek } from '../../src/engine/engine';
import { opinion } from '../../src/engine/relations';
import { age } from '../../src/engine/characters';
import { familyCash, houseCash } from '../../src/engine/tributeState';
import { HEAT_BARS, type GameState } from '../../src/engine/types';
import { BOTS, botChoices, type BotId } from './bots';

function arg(n: string, d: string): string { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }

export interface YearLog {
  year: number; week: number; familyCash: number; treasury: number; pocket: number; houseCash: number; respect: number;
  heat: Record<string, number>; heatMax: Record<string, number>; crew: number; made: number; loyaltyMean: number; disloyal: number; jailed: number;
  deaths: number; deathCauses: string[]; successions: number; boss: string; bossAge: number;
  rivalMoves: Record<string, number>; popups: number; distinctPopups: number; repeat8: number; topPopups: [string, number][];
  meaningfulPerWeek: number; deadEndWeeks: number; quietWeeks: number; legalOrdersMean: number; ordersQueued: number; ordersByKind: Record<string, number>;
  businesses: number; wars: number; nanFlags: string[]; msP50: number; msMax: number; newsCount: number; chronicle: number;
}
export interface GameLog { bot: BotId; seed: string; years: YearLog[]; crashed?: string; gameOver?: string; gameOverWeek?: number; titleRepeats: [string, number][]; allTitles: number; distinctTitles: number }

function crewOf(s: GameState) { return Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId); }

export function playGame(bot: BotId, seed: string, years: number, onYear?: (y: YearLog) => void): GameLog {
  const g: GameLog = { bot, seed, years: [], titleRepeats: [], allTitles: 0, distinctTitles: 0 };
  let s = newGameWith(seed, 'classic');
  const titleCount: Record<string, number> = {};
  const lastSeen: Record<string, number> = {};
  let y: Partial<YearLog> & { ms: number[]; pop: string[]; mean: number[]; legal: number[] } = fresh();
  function fresh() { return { ms: [] as number[], pop: [] as string[], mean: [] as number[], legal: [] as number[], deaths: 0, deathCauses: [] as string[], successions: 0, rivalMoves: {} as Record<string, number>, repeat8: 0, deadEndWeeks: 0, quietWeeks: 0, ordersQueued: 0, ordersByKind: {} as Record<string, number>, nanFlags: [] as string[], heatMax: { local: 0, family: 0, federal: 0 } }; }
  const alive0 = () => new Set(Object.values(s.characters).filter((c) => c.alive && (c.faction === 'player' || c.dynasty)).map((c) => c.id));
  let aliveSet = alive0();
  for (let w = 0; w < years * 52; w++) {
    if (s.gameOver) break;
    const bw = botChoices(s, bot, w);
    y.mean.push(bw.meaningfulPopups);
    y.legal.push(bw.legalCount);
    for (const e of s.pendingEvents) {
      y.pop.push(e.defId);
      const key = e.title;
      titleCount[key] = (titleCount[key] ?? 0) + 1;
      if (s.week - (lastSeen[e.defId] ?? -99) < 8) y.repeat8!++;
      lastSeen[e.defId] = s.week;
    }
    if (s.pendingEvents.length === 0) y.quietWeeks!++;
    if (bw.meaningfulPopups === 0 && (bw.choices.actions?.length ?? 0) === 0) y.deadEndWeeks!++;
    y.ordersQueued! += bw.choices.actions?.length ?? 0;
    for (const a of bw.choices.actions ?? []) y.ordersByKind![a.kind] = (y.ordersByKind![a.kind] ?? 0) + 1;
    const prevBoss = s.playerId;
    const t0 = performance.now();
    let res;
    try { res = advanceWeek(s, bw.choices); } catch (e) { g.crashed = `week ${s.week}: ${(e as Error).message}`.slice(0, 400); break; }
    y.ms.push(performance.now() - t0);
    s = res.state;
    if (s.playerId !== prevBoss) y.successions!++;
    for (const line of res.log) { const m = /^\[(\w+)\]/.exec(line); if (m) y.rivalMoves![m[1]] = (y.rivalMoves![m[1]] ?? 0) + 1; }
    for (const id of aliveSet) { const c = s.characters[id]; if (c && !c.alive) { y.deaths!++; y.deathCauses!.push(`${c.rank}:${(c.death?.cause ?? '?').slice(0, 50)}`); } }
    aliveSet = alive0();
    for (const b of HEAT_BARS) y.heatMax![b] = Math.max(y.heatMax![b], s.heat[b]);
    const nums: [string, number][] = [['money', s.money], ['respect', s.respect], ['local', s.heat.local], ['family', s.heat.family], ['federal', s.heat.federal], ['pocket', s.tribute?.acct.personal ?? 0]];
    for (const [k, v] of nums) if (!Number.isFinite(v) && y.nanFlags!.length < 5) y.nanFlags!.push(`wk${s.week} ${k}=${v}`);
    if (w % 52 === 51) {
      const crew = crewOf(s);
      const ops = crew.map((c) => opinion(s, c.id, s.playerId));
      const boss = s.characters[s.playerId];
      const pc: Record<string, number> = {}; for (const p of y.pop) pc[p] = (pc[p] ?? 0) + 1;
      const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
      const log: YearLog = {
        year: Math.floor(w / 52) + 1, week: s.week, familyCash: familyCash(s), treasury: s.money, pocket: s.tribute?.acct.personal ?? 0, houseCash: houseCash(s), respect: s.respect,
        heat: { ...s.heat }, heatMax: y.heatMax!, crew: crew.length, made: crew.filter((c) => ['soldier', 'capo', 'underboss', 'consigliere'].includes(c.rank)).length,
        loyaltyMean: ops.length ? Math.round(ops.reduce((a, b) => a + b, 0) / ops.length) : 0, disloyal: ops.filter((o) => o < -10).length, jailed: crew.filter((c) => (c.imprisonedUntil ?? 0) > s.week).length,
        deaths: y.deaths!, deathCauses: y.deathCauses!, successions: y.successions!, boss: boss ? `${boss.firstName} ${boss.lastName}` : '?', bossAge: boss ? age(s, boss) : 0,
        rivalMoves: y.rivalMoves!, popups: y.pop.length, distinctPopups: Object.keys(pc).length, repeat8: y.repeat8!, topPopups: Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 6),
        meaningfulPerWeek: +(y.mean.reduce((a, b) => a + b, 0) / Math.max(1, y.mean.length)).toFixed(2), deadEndWeeks: y.deadEndWeeks!, quietWeeks: y.quietWeeks!,
        legalOrdersMean: Math.round(y.legal.reduce((a, b) => a + b, 0) / Math.max(1, y.legal.length)), ordersQueued: y.ordersQueued!, ordersByKind: y.ordersByKind!,
        businesses: s.businesses.filter((b) => b.owner === 'player').length, wars: (s.wars ?? []).length, nanFlags: y.nanFlags!,
        msP50: Math.round(sorted(y.ms)[Math.floor(y.ms.length / 2)] ?? 0), msMax: Math.round(Math.max(0, ...y.ms)), newsCount: s.news.length, chronicle: s.chronicle.length,
      };
      g.years.push(log);
      onYear?.(log);
      y = fresh();
    }
  }
  if (s.gameOver) { g.gameOver = s.gameOver.reason; g.gameOverWeek = s.gameOver.week; }
  g.allTitles = Object.values(titleCount).reduce((a, b) => a + b, 0);
  g.distinctTitles = Object.keys(titleCount).length;
  g.titleRepeats = Object.entries(titleCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return g;
}

if (process.argv[1]?.endsWith('longplay.ts')) {
  const years = Number(arg('years', '10'));
  const bots = (process.argv.includes('--all') ? BOTS.join(',') : arg('bot', 'passive')).split(',') as BotId[];
  const seeds = arg('seed', process.argv.includes('--all') ? 's1,s2,s3' : 's1').split(',');
  const runs: [BotId, string][] = bots.flatMap((b) => seeds.map((x) => [b, x] as [BotId, string]));
  const dir = arg('dir', '');
  if (dir) mkdirSync(dir, { recursive: true });
  for (const [bot, seed] of runs) {
    const t0 = Date.now();
    const g = playGame(bot, seed, years, (yl) => console.log(`${bot}/${seed} y${yl.year} fam=${yl.familyCash} pocket=${yl.pocket} heat=${yl.heat.local}/${yl.heat.family}/${yl.heat.federal} crew=${yl.crew} loy=${yl.loyaltyMean} deaths=${yl.deaths} succ=${yl.successions} pops=${yl.popups}/${yl.distinctPopups} mean/wk=${yl.meaningfulPerWeek} dead=${yl.deadEndWeeks} ms=${yl.msP50}/${yl.msMax}`));
    console.log(`${bot}/${seed} done in ${((Date.now() - t0) / 1000).toFixed(0)}s ${g.crashed ? 'CRASH ' + g.crashed : ''} ${g.gameOver ? 'GAMEOVER ' + g.gameOver : ''}`);
    const out = arg('out', dir ? `${dir}/${bot}-${seed}.json` : '');
    if (out) writeFileSync(out, JSON.stringify(g, null, 1));
  }
}
