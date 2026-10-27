/**
 * Family development balance: the same seeds played three ways (≤12 games).
 *
 *   npx tsx scripts/simDev.ts --seeds 4 --years 6
 *
 * Policies: "none" (never develops, never buys), "modern" (takes each step
 * when it can afford it three times over, keeps every man equipped with the
 * basics), "heavy" (arms every crew heavy, capos on the heavy mandate, no
 * technology). Reports money, crew strength, heat, upkeep, and when each
 * rival family took each step.
 */
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { capos } from '../src/engine/characters';
import { devOpportunities, gearOffers, shortage, type DevAction } from '../src/engine/develop';
import { crewStrength, gearHolders, rivalStrength } from '../src/engine/strength';
import type { GameState, PlayerAction } from '../src/engine/types';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEEDS = Math.min(4, arg('seeds', 4));
const YEARS = arg('years', 6);
type Policy = 'none' | 'modern' | 'heavy';
const dev = (op: DevAction): PlayerAction => ({ kind: 'dev', op });

function orders(s: GameState, p: Policy): PlayerAction[] {
  if (p === 'none' || s.week % 2) return [];
  const out: PlayerAction[] = [];
  let money = s.money;
  const ok = (a: PlayerAction) => { const pr = previewAction(s, a); if (pr.disabledReason || pr.cost > money - 3000) return false; money -= pr.cost; out.push(a); return true; };
  if (p === 'modern') {
    for (const v of devOpportunities(s)) if (v.cost * 3 < money) ok(dev({ t: 'adopt', path: v.def.path }));
    for (const h of gearHolders(s)) { const n = shortage(s, h); if (n > 0) ok(dev({ t: 'buy', cat: 'handguns', n, holder: h })); }
    for (const g of s.dev?.gear ?? []) if (g.cond < 0.4) ok(dev({ t: 'repair', stack: g.id }));
  } else {
    const cat = gearOffers(s).find((o) => o.def.id === 'rifles')?.open ? 'rifles' : 'shotguns';
    for (const h of gearHolders(s)) { const n = shortage(s, h); if (n > 0) ok(dev({ t: 'buy', cat, n, holder: h })); }
    for (const k of capos(s)) if ((s.dev?.mandates[k.id] ?? 0) !== 2) ok(dev({ t: 'mandate', capo: k.id, level: 2 }));
    for (const v of devOpportunities(s)) if (v.def.path === 'gear' && v.cost * 2 < money) ok(dev({ t: 'adopt', path: 'gear' }));
  }
  return out;
}

const rows: Record<string, number | string>[] = [];
const adopt: Record<string, string[]> = {};
for (let i = 0; i < SEEDS; i++) {
  for (const p of ['none', 'modern', 'heavy'] as Policy[]) {
    let s = newGame(`simdev-${i}`);
    let heatL = 0; let heatF = 0; let n = 0; let minStr = 100; let maxStr = 0; let raidEdge = 0;
    const seen = new Set<string>();
    for (let w = 0; w < YEARS * 52 && !s.gameOver; w++) {
      s = advanceWeek(s, { actions: orders(s, p) }).state;
      const st = crewStrength(s).total;
      heatL += s.heat.local; heatF += s.heat.federal; n++;
      minStr = Math.min(minStr, st); maxStr = Math.max(maxStr, st);
      const m = s.rivals.find((r) => r.id === 'manno');
      if (m) raidEdge += st - rivalStrength(s, m);
      if (p === 'none') for (const [rid, d] of Object.entries(s.dev?.rivals ?? {})) for (const [path, t] of Object.entries(d!.tiers)) {
        const k = `${rid}:${path}${t}`;
        if (!seen.has(k)) { seen.add(k); (adopt[`${rid}:${path}${t}`] ??= []).push(String(s.date.y)); }
      }
    }
    const d = s.dev!;
    rows.push({
      seed: i, policy: p, year: s.date.y, over: s.gameOver ? 'yes' : '', money: Math.round(s.money), strength: crewStrength(s).total, min: Math.round(minStr), max: Math.round(maxStr),
      vsManno: Math.round(raidEdge / n), heatL: Math.round(heatL / n), heatF: Math.round(heatF / n), tiers: Object.values(d.tiers).reduce((a, b) => a + (b ?? 0), 0),
      gear: d.gear.reduce((a, g) => a + g.n, 0), spentTech: d.stats.spentTech, spentGear: d.stats.spentGear, upkeep: d.stats.upkeep, income: d.stats.income, fear: Math.round(d.fear), resent: Math.round(d.resent),
    });
    console.error(JSON.stringify(rows[rows.length - 1]));
  }
}
console.table(rows);
console.log('Rival steps (years taken, one per seed):');
for (const [k, v] of Object.entries(adopt).sort()) console.log(`  ${k.padEnd(20)} ${v.join(' ')}`);
