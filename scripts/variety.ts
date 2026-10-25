/**
 * Story variety report: plays N games x W weeks headless with the sim's
 * random player and measures how repetitive the popups are.
 *
 *   npx tsx scripts/variety.ts --games 30 --weeks 52 [--seed variety] [--top 15] [--json out.json]
 *
 * Per game: popups, distinct defIds, distinct titles, the 8- and 26-week
 * repeat rate (share of popups whose defId already appeared in the previous
 * 8 / 26 weeks), and the max count of any single template (bagman excluded).
 * Aggregate: the top repeated templates across all games.
 */
import { writeFileSync } from 'node:fs';
import { newGameWith, type StartId } from '../src/engine/starts';
import { LIFESTYLE_IDS } from '../src/engine/lifestyle';
import { isFamilyEvent } from '../src/engine/events';
import { advanceWeek } from '../src/engine/engine';
import { randomTravelAction } from '../src/engine/travel';
import { rand } from '../src/engine/rng';
import { legalActions, previewAction } from '../src/engine/actions';
import { ORDERS } from '../src/engine/events';
import { romanceActions } from '../src/engine/romance';
import { polActions } from '../src/engine/politics';
import { themeOf } from '../src/engine/storyDirector';
import type { GameState, PlayerAction, PlayerChoices } from '../src/engine/types';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const GAMES = Number(arg('games', '30'));
const WEEKS = Number(arg('weeks', '52'));
const SEED = arg('seed', 'variety');
const TOP = Number(arg('top', '15'));
const START = arg('start', 'classic') as StartId;
const JSON_OUT = arg('json', '');
/** Money flows by ledger category, summed over all games (to check a change against the economy). */
const flows: Record<string, number> = {};
const bySource: Record<string, number> = {};
function sourceOf(id: string): string {
  if (id.startsWith('pack_p2_')) return 'pack2';
  if (id.startsWith('pack_p3_')) return 'pack3';
  if (id.startsWith('pack_')) return 'pack1';
  if (id.startsWith('arc_')) return 'arcs';
  if (/^(pitch|score|beef|vouch|dispute|life|kid|law|wife|courted)_/.test(id)) return 'crewVariants';
  if (id.startsWith('crew_')) return 'crew';
  return id.split('_')[0];
}
/** Templates allowed to come back on a fixed cadence (excluded from the max-per-template check). */
const INSTITUTIONAL = new Set(['bagman']);

const pickOne = <T,>(h: { rng: number }, xs: T[]): T | undefined => (xs.length ? xs[Math.floor(rand(h) * xs.length)] : undefined);

/** The sim's random player (same rates as scripts/sim.ts defaults). */
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
  if (rand(h) < 0.15) add(pickOne(h, legal));
  if (rand(h) < 0.35) {
    const vias = ['direct', 'underboss', 'capo'] as const;
    const general = ORDERS.map((o) => ({ kind: 'order', key: o.key, via: vias[Math.floor(rand(h) * 3)] }) as PlayerAction).filter((a) => !previewAction(s, a).disabledReason);
    add(pickOne(h, general));
  }
  if (rand(h) < 0.08) add(pickOne(h, legal.filter((a) => a.kind === 'dynasty')));
  const boss = s.characters[s.playerId];
  if (boss && !boss.lifestyle) add(pickOne(h, LIFESTYLE_IDS.map((focus) => ({ kind: 'lifestyle', focus }) as PlayerAction)));
  else if (boss?.lifestyle?.points) add(pickOne(h, legal.filter((a) => a.kind === 'perk')));
  if (rand(h) < 0.04) add(pickOne(h, legal.filter((a) => a.kind === 'power')));
  if (rand(h) < 0.015) add(pickOne(h, romanceActions(s).filter((a) => !previewAction(s, a).disabledReason)));
  if (rand(h) < 0.12) {
    const spare = s.money - 20000;
    add(pickOne(h, polActions(s).filter((a) => {
      const p = previewAction(s, a);
      return !p.disabledReason && p.cost <= spare && !(a.op.op === 'payroll' && a.op.on && spare < 15000);
    })));
  }
  if (rand(h) < 0.12) add(pickOne(h, legal.filter((a) => a.kind === 'econ')));
  if (rand(h) < 0.04) add(randomTravelAction(s, h));
  return { choices, actions };
}

interface GameStat {
  popups: number; distinctIds: number; distinctTitles: number; rep8: number; rep26: number;
  maxTemplate: number; maxTemplateId: string; maxWeek: number; familyOver: number;
  counts: Record<string, number>; themes: Record<string, number>;
}

function playOne(gi: number): GameStat {
  let s = newGameWith(`${SEED}-${gi}`, START);
  const counts: Record<string, number> = {};
  const themes: Record<string, number> = {};
  const titles = new Set<string>();
  const last: Record<string, number> = {};
  let popups = 0, r8 = 0, r26 = 0, maxWeek = 0, familyOver = 0;
  for (let w = 0; w < WEEKS && !s.gameOver; w++) {
    const evs = s.pendingEvents;
    maxWeek = Math.max(maxWeek, evs.length);
    if (evs.filter(isFamilyEvent).length > 1) familyOver++;
    for (const e of evs) {
      popups++;
      counts[e.defId] = (counts[e.defId] ?? 0) + 1;
      const th = themeOf(e);
      themes[th] = (themes[th] ?? 0) + 1;
      titles.add(e.title);
      const prev = last[e.defId];
      if (prev !== undefined && prev < s.week) {
        if (s.week - prev <= 8) r8++;
        if (s.week - prev <= 26) r26++;
      }
      last[e.defId] = s.week;
    }
    const shown = s.pendingEvents.map((e) => [e.title, sourceOf(e.defId)] as const);
    const r = advanceWeek(s, aiChoices(s, w));
    for (const l of r.report.lines) {
      if (l.stat !== 'money') continue;
      flows[l.category] = (flows[l.category] ?? 0) + l.amount;
      if (l.category === 'event') {
        const src = shown.find(([t]) => l.label.startsWith(t))?.[1] ?? 'other';
        bySource[src] = (bySource[src] ?? 0) + l.amount;
      }
    }
    s = r.state;
  }
  let maxTemplate = 0, maxTemplateId = '';
  for (const [k, v] of Object.entries(counts)) if (!INSTITUTIONAL.has(k) && v > maxTemplate) { maxTemplate = v; maxTemplateId = k; }
  return {
    popups, distinctIds: Object.keys(counts).length, distinctTitles: titles.size, rep8: popups ? r8 / popups : 0, rep26: popups ? r26 / popups : 0,
    maxTemplate, maxTemplateId, maxWeek, familyOver, counts, themes,
  };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const t0 = Date.now();
const games: GameStat[] = [];
for (let g = 0; g < GAMES; g++) {
  const r = playOne(g);
  games.push(r);
  console.log(`game ${String(g).padStart(2)}: popups ${String(r.popups).padStart(3)}  ids ${String(r.distinctIds).padStart(3)} (${pct(r.distinctIds / Math.max(1, r.popups))})  titles ${String(r.distinctTitles).padStart(3)}  rep8 ${pct(r.rep8)}  rep26 ${pct(r.rep26)}  max ${r.maxTemplate}x ${r.maxTemplateId}`);
}
const avg = (f: (g: GameStat) => number) => games.reduce((a, g) => a + f(g), 0) / games.length;
const total: Record<string, number> = {};
const perGameMax: Record<string, number> = {};
const themes: Record<string, number> = {};
for (const g of games) {
  for (const [k, v] of Object.entries(g.counts)) { total[k] = (total[k] ?? 0) + v; perGameMax[k] = Math.max(perGameMax[k] ?? 0, v); }
  for (const [k, v] of Object.entries(g.themes)) themes[k] = (themes[k] ?? 0) + v;
}
const allPopups = games.reduce((a, g) => a + g.popups, 0);
console.log('\n=== Variety summary ===');
console.log(`${GAMES} games x ${WEEKS} weeks (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`popups per game          ${avg((g) => g.popups).toFixed(1)}  (max/week ${Math.max(...games.map((g) => g.maxWeek))}, family-over weeks ${games.reduce((a, g) => a + g.familyOver, 0)})`);
console.log(`distinct defIds per game ${avg((g) => g.distinctIds).toFixed(1)}  share ${pct(avg((g) => g.distinctIds / Math.max(1, g.popups)))}`);
console.log(`distinct titles per game ${avg((g) => g.distinctTitles).toFixed(1)}  share ${pct(avg((g) => g.distinctTitles / Math.max(1, g.popups)))}`);
console.log(`8-week repeat rate       ${pct(avg((g) => g.rep8))}`);
console.log(`26-week repeat rate      ${pct(avg((g) => g.rep26))}`);
console.log(`max single template/game avg ${avg((g) => g.maxTemplate).toFixed(1)}, worst ${Math.max(...games.map((g) => g.maxTemplate))}; games over 5: ${games.filter((g) => g.maxTemplate > 5).length}`);
console.log(`\nTop ${TOP} templates (avg per game, worst game):`);
for (const [k, v] of Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log(`  ${k.padEnd(34)} ${(v / GAMES).toFixed(2).padStart(6)}  worst ${perGameMax[k]}`);
console.log('\nTheme mix:');
for (const [k, v] of Object.entries(themes).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${pct(v / allPopups)}`);
console.log('\nMoney flows per game (ledger categories):');
console.log('  ' + Object.entries(flows).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / GAMES)}`).join(' · '));
console.log('  event money by source: ' + Object.entries(bySource).sort((a, b) => a[1] - b[1]).slice(0, 14).map(([k, v]) => `${k} ${Math.round(v / GAMES)}`).join(' · '));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ games, total, perGameMax, themes }, null, 2));
