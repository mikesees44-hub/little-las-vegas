/**
 * Warfare balance (army.ts): Philadelphia comes down the causeway at week 30, and the boss
 * answers it three ways — does nothing (meets them with the men on the street), raises the
 * troops and hires muscle, or raises them AND brings allies (a pact made in peace, calls to arms).
 *
 *   nice npx tsx scripts/playtest/warfare.ts --seeds 8 --weeks 40
 *
 * Per scenario: wars won / lost / white / still going, battles won and lost, the boss killed,
 * men of yours dead, the money the war cost, the final war score.
 */
import { newGame } from '../../src/engine/newGame';
import { advanceWeek } from '../../src/engine/engine';
import { newCtx } from '../../src/engine/ledger';
import { allyIds, allyOdds, battlePlan, frontsOf, previewArmy, startCampaign } from '../../src/engine/army';
import type { BattleHow } from '../../src/engine/armyState';
import type { GameState, PlayerAction } from '../../src/engine/types';

function arg(n: string, d: string): string { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
const SEEDS = Number(arg('seeds', '8'));
const WEEKS = Number(arg('weeks', '40'));
type Plan = 'nothing' | 'raised' | 'allied';

interface Out { outcome: 'won' | 'lost' | 'white' | 'going' | 'dead'; weeks: number; won: number; lost: number; bossDead: boolean; menDead: number; spent: number; score: number }

function choices(s: GameState, plan: Plan): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of s.pendingEvents) {
    if (e.defId === 'war_battle') {
      if (plan === 'nothing') { out[e.iid] = 'meet'; continue; }
      const b = s.army!.pending.find((x) => x.id === e.meta?.army);
      if (!b) continue;
      const opts = (['meet', 'strike', 'lead'] as BattleHow[]).filter((h) => !e.choices.find((c) => c.id === h)?.disabledReason).map((h) => ({ h, p: battlePlan(s, b, h) }));
      opts.sort((a, b2) => (b2.p.odds - b2.p.bossRisk * 3) - (a.p.odds - a.p.bossRisk * 3));
      out[e.iid] = opts[0].p.odds < 0.3 ? 'fallback' : opts[0].h;
    } else if (e.defId === 'war_demands') out[e.iid] = plan === 'nothing' ? 'accept' : 'fight';
    else if (e.defId === 'war_offer') out[e.iid] = 'accept';
  }
  return out;
}

function orders(s: GameState, plan: Plan, warId: string | undefined, week: number): PlayerAction[] {
  if (plan === 'nothing') return [];
  const a: PlayerAction[] = [];
  if (!warId) {
    // In peace: an allied boss makes pacts (one a week, best odds first).
    if (plan === 'allied' && (s.army?.pacts.length ?? 0) < 2) {
      const best = allyIds(s, 'philly').filter((x) => x !== 'camden' && !s.army?.pacts.some((p) => p.ally === x)).sort((x, y) => allyOdds(s, y, undefined, 'pact').chance - allyOdds(s, x, undefined, 'pact').chance)[0];
      if (best) a.push({ kind: 'army', op: { op: 'pact', ally: best } });
    }
    return a;
  }
  a.push({ kind: 'army', op: { op: 'raise', holder: 'all' } });
  if (!s.army?.hired.some((h) => h.band === 'shooters')) a.push({ kind: 'army', op: { op: 'hire', band: 'shooters' } });
  if (!s.army?.hired.some((h) => h.band === 'irish') && s.money > 15000) a.push({ kind: 'army', op: { op: 'hire', band: 'irish' } });
  if (!s.army?.safehouses) a.push({ kind: 'army', op: { op: 'safehouses', on: true } });
  // Take the fight to them where the odds are good.
  const war = s.wars.find((x) => x.id === warId);
  if (war) {
    const hit = frontsOf(s, war).map((f) => ({ f, p: previewArmy(s, { op: 'attack', warId, district: f.district }) })).filter((x) => !x.p.disabledReason && (x.p.odds?.chance ?? 0) >= 0.6)[0];
    if (hit) a.push({ kind: 'army', op: { op: 'attack', warId, district: hit.f.district } });
  }
  if (plan === 'allied' && week % 2 === 0) {
    const w = s.wars.find((x) => x.id === warId)!;
    const best = allyIds(s, w.rival).filter((x) => !s.army?.commits.some((c) => c.ally === x && c.warId === warId && c.until > s.week)).sort((x, y) => allyOdds(s, y, warId, 'cut').chance - allyOdds(s, x, warId, 'cut').chance)[0];
    if (best) a.push({ kind: 'army', op: { op: 'ask', ally: best, warId, offer: 'cut' } });
  }
  return a;
}

function play(seed: string, plan: Plan): Out {
  let s = newGame(seed);
  for (let i = 0; i < 30 && !s.gameOver; i++) s = advanceWeek(s, { choices: {}, actions: orders(s, plan, undefined, i) }).state;
  s.money = Math.max(s.money, 30000);
  const boss0 = s.playerId;
  const w = startCampaign(newCtx(s), 'philly', 'districts', 'balance run');
  if (!w) return { outcome: 'going', weeks: 0, won: 0, lost: 0, bossDead: false, menDead: 0, spent: 0, score: 0 };
  const money0 = s.money;
  let i = 0;
  let outcome: Out['outcome'] = 'going';
  for (; i < WEEKS && !s.gameOver; i++) {
    const r = advanceWeek(s, { choices: choices(s, plan), actions: orders(s, plan, w.id, i) });
    s = r.state;
    if (!s.wars.some((x) => x.id === w.id)) {
      const t = r.log.join(' ');
      outcome = /total victory|sued for peace|wants out|They give in|gave up/.test(t) ? 'won' : /white peace|everybody goes home/i.test(t) ? 'white' : 'lost';
      const l = s.intrigue?.ledgers.find((x) => x.warId === w.id);
      if (l?.outcome) outcome = l.outcome;
      const hist = s.chronicle.slice(-20).map((c) => c.text).join(' ');
      if (/ended: they gave in/.test(hist)) outcome = 'won';
      else if (/ended: you gave in/.test(hist)) outcome = 'lost';
      else if (/ended: a white peace/.test(hist)) outcome = 'white';
      break;
    }
  }
  const hist = (s.army?.history ?? []).filter((h) => h.warId === w.id);
  const menDead = Object.values(s.characters).filter((c) => !c.alive && c.faction === 'player' && /fighting for|leading the men|broke through/.test(c.death?.cause ?? '')).length;
  const bossDead = !s.characters[boss0]?.alive;
  return { outcome, weeks: i + 1, won: hist.filter((h) => h.won).length, lost: hist.filter((h) => !h.won && h.how !== 'fallback').length, bossDead, menDead, spent: Math.round(money0 - s.money), score: s.wars.find((x) => x.id === w.id)?.score ?? 0 };
}

for (const plan of ['nothing', 'raised', 'allied'] as Plan[]) {
  const outs: Out[] = [];
  for (let k = 0; k < SEEDS; k++) outs.push(play(`war${k}`, plan));
  const n = (f: (o: Out) => boolean) => outs.filter(f).length;
  const avg = (f: (o: Out) => number) => Math.round(outs.reduce((a, o) => a + f(o), 0) / outs.length * 10) / 10;
  console.log(`${plan.padEnd(8)} won ${n((o) => o.outcome === 'won')} lost ${n((o) => o.outcome === 'lost')} white ${n((o) => o.outcome === 'white')} going ${n((o) => o.outcome === 'going')} | battles W ${avg((o) => o.won)} L ${avg((o) => o.lost)} | boss killed ${n((o) => o.bossDead)} | men dead ${avg((o) => o.menDead)} | weeks ${avg((o) => o.weeks)} | cost $${avg((o) => o.spent)} | score ${avg((o) => o.score)}`);
}
