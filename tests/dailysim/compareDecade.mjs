// BEFORE vs AFTER for the decade sim: node tests/dailysim/compareDecade.mjs <beforeDir> <afterDir> [run ids...]
// Run ids like olddon_a_reasonable. Prints one markdown table per metric group.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [before, after, ...ids] = process.argv.slice(2);
const load = (dir, id) => {
  const f = join(dir, `${id}.json`);
  if (!existsSync(f)) return undefined;
  const sum = JSON.parse(readFileSync(f, 'utf8'));
  const wf = join(dir, `${id}.weeks.jsonl`);
  sum.weeks = existsSync(wf) ? readFileSync(wf, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return sum;
};
const q = (xs, p) => { if (!xs.length) return '-'; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const k = (n) => (n == null ? '-' : `${Math.round(n / 1000)}k`);
const r1 = (x) => Math.round(x * 10) / 10;
const at = (r, w) => r.weeks.find((x) => x.w === w);
const VIOLENT = /(shot|killed|murder|hit\b|whack|stab|bomb|beaten|strangl|garrot|executed|clipped|ambush|gun|knife|broke through|blitz)/i;
function metrics(r) {
  if (!r) return undefined;
  const y = r.weeks.length / 52 || 1;
  const last = r.weeks[r.weeks.length - 1];
  const causes = {};
  for (const x of r.successions) { const c = /broke through/.test(x.old.cause ?? '') ? 'battle' : /blitz/.test(x.old.cause ?? '') ? 'blitz' : /own (people|capos)|purge|kinsman/.test(x.old.cause ?? '') ? 'own people' : x.how.startsWith('natural') ? 'natural' : x.how.startsWith('killed') || VIOLENT.test(x.old.cause ?? '') ? 'killed' : x.how.split(' ')[0]; causes[c] = (causes[c] ?? 0) + 1; }
  const heirs = r.successions.map((x) => x.neu).filter(Boolean);
  let rep = 0, tot = 0; const lastT = {};
  for (const x of r.weeks) for (const t of x.tpl) { tot++; if (lastT[t] !== undefined && x.w - lastT[t] <= 8) rep++; lastT[t] = x.w; }
  const snap = (l) => r.snaps.find((s) => s.label === l);
  const sz = (l) => (snap(l) ? `${(snap(l).bytes / 1e6).toFixed(2)}` : '-');
  const yrs = []; for (let i = 0; i * 52 < r.weeks.length; i++) yrs.push(r.weeks.slice(i * 52, i * 52 + 52));
  return {
    weeks: r.weeks.length,
    money: `${k(at(r, 52)?.fam)} / ${k(at(r, 156)?.fam)} / ${k(last?.fam)} (peak ${k(Math.max(...r.weeks.map((x) => x.fam)))})`,
    under: r.weeks.filter((x) => x.money < 0).length,
    capoZero: r.weeks.filter((x) => x.capos === 0).length,
    capos: `${at(r, 52)?.capos ?? '-'} / ${last?.capos ?? '-'}`,
    deaths: Object.entries(causes).map(([a, b]) => `${a} ${b}`).join(', ') || 'none',
    wounds: r.weeks.reduce((a, x) => a + (x.wounded ?? 0), 0),
    heirs: heirs.map((h) => `${h.age}${h.wasRank && h.wasRank !== 'civilian' ? ` (${h.wasRank})` : ''}`).join(', ') || '-',
    heirNow: last?.heir ? `${last.heir.age}${last.heir.son ? ' son' : ''}` : '-',
    dyn: `${r.weeks[0]?.dyn ?? '-'} → ${last?.dyn ?? '-'} (births ${r.dyn?.births ?? '-'}, marriages ${r.dyn?.marriages ?? '-'})`,
    climb: r.rungs.map((x) => `${x.to} wk${x.w}`).join(', ') || 'none',
    standing: last?.standing != null ? Math.round(last.standing) : '-',
    save: ['start', 'y1', 'y2', 'y4', 'y5', 'y6', 'y8', 'y10'].map(sz).join(' / '),
    dayMs: `${q(yrs[0]?.map((x) => x.dayMs) ?? [], 0.5)} → ${q(yrs[yrs.length - 1]?.map((x) => x.dayMs) ?? [], 0.5)}`,
    turnMs: `${q(yrs[0]?.map((x) => x.ms) ?? [], 0.5)} → ${q(yrs[yrs.length - 1]?.map((x) => x.ms) ?? [], 0.5)}`,
    rep8: `${tot ? Math.round((100 * rep) / tot) : 0}%`,
    wars: r1(r.weeks.reduce((a, x) => a + x.newWars, 0) / y),
    raids: r1(r.weeks.reduce((a, x) => a + (x.hits?.raid ?? 0), 0) / y),
    feds: r.feds ? `waves ${r.feds.waves}, boss offers ${r.feds.bossOffers}, Brasco found ${r.feds.brascoFound}/${r.feds.brasco}, max fam heat ${Math.max(...r.weeks.map((x) => x.heat.f))}` : '-',
    errors: r.nErrors,
  };
}
const ROWS = [['weeks', 'weeks played'], ['money', 'family cash y1 / y3 / end'], ['under', 'weeks treasury < 0'], ['capoZero', 'weeks with 0 capos'], ['capos', 'capos y1 / end'],
  ['deaths', 'boss changes by cause'], ['wounds', 'boss wounded (not killed)'], ['heirs', 'new bosses: age (rank held)'], ['heirNow', 'heir at the end: age'], ['dyn', 'house alive start → end'],
  ['climb', 'associate climb'], ['standing', 'standing at the end'], ['save', 'save MB start/y1/y2/y4/y5/y6/y8/y10'], ['dayMs', 'day-step ms p50 y1 → last'], ['turnMs', 'turn ms p50 y1 → last'],
  ['rep8', '8-week repeat rate'], ['wars', 'new wars / yr'], ['raids', 'raid lines / yr'], ['feds', 'feds'], ['errors', 'errors']];
for (const id of ids) {
  const b = metrics(load(before, id)); const a = metrics(load(after, id));
  console.log(`\n**${id}**\n`);
  console.log('| metric | BEFORE | AFTER |\n|---|---|---|');
  for (const [key, label] of ROWS) console.log(`| ${label} | ${b?.[key] ?? '-'} | ${a?.[key] ?? '-'} |`);
}
