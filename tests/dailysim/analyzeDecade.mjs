// Analyze the decade sim's runs: node tests/dailysim/analyzeDecade.mjs <dir>
// Reads <start>_<seed>_<policy>.json + .weeks.jsonl (partial runs too) and prints markdown tables.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const ORDER = ['olddon', 'classic', 'rise', 'associate'];
const files = readdirSync(dir).filter((f) => /^[a-z]+_[a-z]_[a-z]+\.json$/.test(f))
  .sort((a, b) => { const [sa, da, pa] = a.split(/[_.]/); const [sb, db, pb] = b.split(/[_.]/); return pa.localeCompare(pb) * -100 + da.localeCompare(db) * 10 + (ORDER.indexOf(sa) - ORDER.indexOf(sb)); });
const runs = files.map((f) => {
  const sum = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const wf = join(dir, f.replace(/\.json$/, '.weeks.jsonl'));
  const weeks = existsSync(wf) ? readFileSync(wf, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { ...sum, weeks, id: `${sum.start}/${sum.seed}/${sum.policy === 'passive' ? 'pas' : sum.policy === 'climber' ? 'clb' : 'rsn'}` };
});

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const q = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const k = (n) => (n == null ? '-' : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1000)}k`);
const r1 = (x) => Math.round(x * 10) / 10;
const tbl = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const at = (r, w) => r.weeks.find((x) => x.w === w) ?? null;
const years = (r) => { const ys = []; for (let y = 0; y * 52 < r.weeks.length; y++) ys.push(r.weeks.slice(y * 52, y * 52 + 52)); return ys; };
const out = []; const P = (s = '') => out.push(s);

// ---- 0. Overview
P('### Overview');
P(tbl(['run', 'weeks', 'end date', 'game over', 'boss changes', 'final boss (station)', 'errors', 'integrity flags'], runs.map((r) => [
  r.id, r.weeksDone + (r.final ? '' : ' (running)'), r.date, r.gameOver ? `**${r.gameOver.reason}** wk ${r.gameOver.week - r.startWeek}` : 'no', r.successions.length,
  `${r.boss.name} (${r.boss.station})`, r.nErrors, Object.values(r.integ).reduce((a, b) => a + b.n, 0),
])));

// ---- 1. Money
P('\n### Money (Family cash = treasury + reserve; Pocket = the boss\'s own)');
const W = [1, 52, 104, 156, 260, 390, 520];
P(tbl(['run', ...W.map((w) => `fam wk${w}`), 'peak fam', 'wks treasury<0'], runs.map((r) => [r.id, ...W.map((w) => k(at(r, w)?.fam)), k(Math.max(...r.weeks.map((x) => x.fam))), r.weeks.filter((x) => x.money < 0).length])));
P();
P(tbl(['run', ...W.map((w) => `pocket wk${w}`), 'boss wealth wk520'], runs.map((r) => [r.id, ...W.map((w) => k(at(r, w)?.pocket)), k(at(r, 520)?.bossWealth)])));
P('\nIncome per year (sum of positive money lines) · upkeep brake paid per year · weeks cash fell:');
P(tbl(['run', ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => `y${y}`)], runs.map((r) => [r.id, ...years(r).map((ws) => `${k(ws.reduce((a, x) => a + x.income, 0))}/${k(ws.reduce((a, x) => a + x.upkeep, 0))}/${Math.round((100 * ws.filter((x, i) => i > 0 && x.fam < ws[i - 1].fam).length) / ws.length)}%`)])));

// ---- 2. Heat, respect, crew, territory, capos per year (means)
P('\n### Per-year means: respect · heat L/F/Fed · crew (made) · capos · districts held · capo loyalty (min)');
P(tbl(['run', ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => `y${y}`)], runs.map((r) => [r.id, ...years(r).map((ws) => {
  const m = (f) => Math.round(mean(ws.map(f).filter((v) => v != null)));
  return `R${m((x) => x.respect)} · ${m((x) => x.heat.l)}/${m((x) => x.heat.f)}/${m((x) => x.heat.x)} · ${m((x) => x.crew)}(${m((x) => x.made)}) · k${m((x) => x.capos)} · d${m((x) => x.terr)} · L${m((x) => x.loy)}(${m((x) => x.loyMin)})`;
})])));
P('\nMax heat L/F/Fed, weeks respect ≥95, weeks respect ≤10, capo stance share (all weeks):');
P(tbl(['run', 'max heat', 'R≥95', 'R≤10', 'loyal', 'steady', 'hedging', 'turning'], runs.map((r) => {
  const st = {}; let n = 0; for (const x of r.weeks) for (const [a, b] of Object.entries(x.stances ?? {})) { st[a] = (st[a] ?? 0) + b; n += b; }
  const pc = (a) => (n ? `${Math.round((100 * (st[a] ?? 0)) / n)}%` : '-');
  return [r.id, `${Math.max(...r.weeks.map((x) => x.heat.l))}/${Math.max(...r.weeks.map((x) => x.heat.f))}/${Math.max(...r.weeks.map((x) => x.heat.x))}`, r.weeks.filter((x) => x.respect >= 95).length, r.weeks.filter((x) => x.respect <= 10).length, pc('loyal'), pc('steady'), pc('hedging'), pc('turning')];
})));

// ---- 3. Succession
P('\n### Successions (every change of boss)');
const sr = [];
const VIOLENT = /(shot|killed|murder|hit\b|whack|stab|bomb|beaten|strangl|garrot|executed|clipped|ambush|gun|knife)/i;
const howOf = (x) => (/^death:/.test(x.how) && VIOLENT.test(x.old.cause ?? '') ? 'killed (hit)' : /^death:/.test(x.how) ? `death (${String(x.old.cause).slice(0, 30)})` : x.how);
for (const r of runs) for (const x of r.successions) sr.push([r.id, x.wk, x.date, howOf(x), `${x.old.name} (${x.old.age ?? '?'})${x.old.cause ? `: ${String(x.old.cause).slice(0, 40)}` : ''}`, x.neu ? `${x.neu.name}, ${x.neu.age}, lead ${x.neu.lead}${x.neu.son ? ', son' : ''}, was ${x.neu.wasRank}` : '-', x.hollowBefore ? (x.dmwBefore ? 'DMW' : 'hollow') : '', x.claimants, x.factionsBefore.join(',')]);
P(sr.length ? tbl(['run', 'wk', 'date', 'how', 'old boss (age): cause', 'new boss', 'crown', 'claimants', 'factions before'], sr) : '_none_');
const byHow = {}; for (const r of runs) for (const x of r.successions) { const h = howOf(x).replace(/ \(.*/, ''); byHow[h] = (byHow[h] ?? 0) + 1; }
P(`\nBy cause: ${JSON.stringify(byHow)}; games with ≥1 succession: ${runs.filter((r) => r.successions.length).length}/${runs.length}; games lost (game over): ${runs.filter((r) => r.gameOver).length}.`);
P('\nHeir coverage (chooseHeir on the current boss each week):');
P(tbl(['run', 'wks no heir', 'wks heir a minor', 'heir age wk1/260/520', 'dynasty alive wk1/260/520', 'minors wk520', 'births (dyn stat)', 'marriages', 'came of age', 'boss jailed (times)', 'boss age wk520'], runs.map((r) => {
  const a = (w, f) => { const x = at(r, w); return x ? f(x) : '-'; };
  return [r.id, r.weeks.filter((x) => !x.heir).length, r.weeks.filter((x) => x.heir && !x.heir.adult).length, `${a(1, (x) => x.heir?.age ?? '∅')}/${a(260, (x) => x.heir?.age ?? '∅')}/${a(520, (x) => x.heir?.age ?? '∅')}`,
    `${a(1, (x) => x.dyn)}/${a(260, (x) => x.dyn)}/${a(520, (x) => x.dyn)}`, a(520, (x) => x.dynMinor), r.dyn?.births ?? '-', r.dyn?.marriages ?? '-', r.dyn?.comingOfAge ?? '-', r.bossJail.length, a(520, (x) => x.bossAge)];
})));

// ---- 4. Feds
P('\n### Feds (fedsState stats, whole run)');
const FK = ['pinches', 'serious', 'flips', 'stood', 'waves', 'bossOffers', 'bossFlips', 'hollow', 'tipoffs', 'tipTaken', 'crises', 'brasco', 'brascoFound', 'rivalPinches'];
P(tbl(['run', ...FK, 'hollow ends', 'crisis ends', 'wks hollow/DMW'], runs.map((r) => [r.id, ...FK.map((f) => r.feds?.[f] ?? '-'), JSON.stringify(r.feds?.hollowEnds ?? {}), JSON.stringify(r.feds?.crisisEnds ?? {}), `${r.weeks.filter((x) => x.hollow === 'hollow').length}/${r.weeks.filter((x) => x.hollow === 'dmw').length}`])));

// ---- 5. Wars, plots, capos
P('\n### Wars, plots, coups, capo betrayals (whole run; /yr in brackets)');
const CK = ['plots', 'foiled', 'coups', 'defected', 'fbi', 'saves', 'groomed', 'proposed'];
P(tbl(['run', 'new wars', 'factions formed (agendas)', ...CK.map((c) => `capo ${c}`), 'my men killed', 'my men arrested'], runs.map((r) => {
  const y = r.weeks.length / 52 || 1;
  const ag = {}; for (const f of r.factionLog) ag[f.agenda] = (ag[f.agenda] ?? 0) + 1;
  const sumW = (f) => r.weeks.reduce((a, x) => a + (f(x) ?? 0), 0);
  return [r.id, `${sumW((x) => x.newWars)} (${r1(sumW((x) => x.newWars) / y)})`, `${r.factionLog.length} ${JSON.stringify(ag)}`, ...CK.map((c) => `${r.capos?.[c] ?? '-'} (${r1((r.capos?.[c] ?? 0) / y)})`), `${sumW((x) => x.myViolent)} (${r1(sumW((x) => x.myViolent) / y)})`, `${sumW((x) => x.arrests)} (${r1(sumW((x) => x.arrests) / y)})`];
})));
P('\nLog hits per year (raid, FBI arrest, Philadelphia summons, bail-out, coup lines, betrayal lines, killings, war lines):');
const HK = ['raid', 'fedArrest', 'philly', 'bailout', 'coup', 'betrayal', 'killing', 'warLine'];
P(tbl(['run', ...HK], runs.map((r) => { const y = r.weeks.length / 52 || 1; return [r.id, ...HK.map((h) => r1(r.weeks.reduce((a, x) => a + (x.hits?.[h] ?? 0), 0) / y))]; })));

P('\nKey system popups per year (by template):');
const TK = ['philly_summons', 'bailout', 'power_heir_move', 'aging_incapable', 'faction_demand', 'faction_ultimatum', 'power_crisis', 'capo_make', 'funeral', 'feds_homecoming'];
P(tbl(['run', ...TK], runs.map((r) => { const y = r.weeks.length / 52 || 1; return [r.id, ...TK.map((t) => r1(r.weeks.reduce((a, x) => a + x.tpl.filter((z) => z === t).length, 0) / y))]; })));

// ---- 6. Repetition
P('\n### Repetition (popups)');
P(tbl(['run', ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => `y${y} distinct/total (rep8)`)], runs.map((r) => [r.id, ...years(r).map((ws) => {
  let rep = 0, tot = 0; const last = {}; const set = new Set();
  ws.forEach((x) => { for (const t of x.tpl) { tot++; set.add(t); if (last[t] !== undefined && x.w - last[t] <= 8) rep++; last[t] = x.w; } });
  return `${set.size}/${tot} (${tot ? Math.round((100 * rep) / tot) : 0}%)`;
})])));
const allT = {}; const firstY = {}; const lastY = {};
for (const r of runs) for (const x of r.weeks) for (const t of x.tpl) { allT[t] = (allT[t] ?? 0) + 1; const y = Math.floor((x.w - 1) / 52); firstY[t] = Math.min(firstY[t] ?? 99, y); lastY[t] = Math.max(lastY[t] ?? -1, y); }
const totalYears = runs.reduce((a, r) => a + r.weeks.length / 52, 0);
P(`\nMost frequent templates (per game-year, all runs pooled, ${r1(totalYears)} game-years):`);
P(tbl(['template', '/yr'], Object.entries(allT).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, n]) => [t, r1(n / totalYears)])));
P(`\nDistinct templates seen: ${Object.keys(allT).length}. Seen only in year 1: ${Object.keys(allT).filter((t) => lastY[t] === 0).length}. First seen after year 5: ${Object.keys(allT).filter((t) => firstY[t] >= 5).length}.`);
// Per-run late-game repetition: the top template in years 6-10.
P(tbl(['run', 'top template y6-10 (/yr)', '2nd', '3rd'], runs.map((r) => { const c = {}; const ws = r.weeks.filter((x) => x.w > 260); for (const x of ws) for (const t of x.tpl) c[t] = (c[t] ?? 0) + 1; const y = ws.length / 52 || 1; const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3); return [r.id, ...[0, 1, 2].map((i) => (top[i] ? `${top[i][0]} ${r1(top[i][1] / y)}` : '-'))]; })));

// ---- 7. Low starts
P('\n### The climb (station changes)');
P(tbl(['run', 'rungs'], runs.filter((r) => r.rungs.length || r.start === 'associate' || r.start === 'rise').map((r) => [r.id, r.rungs.map((x) => `${x.from}→${x.to} wk${x.w}`).join('; ') || '_none_ (final: ' + r.boss.station + ')'])));

// ---- 8. Performance
P('\n### Performance');
P(tbl(['run', ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => `y${y} turn p50/p95 ms`), 'day ms p50 y1/y10'], runs.map((r) => {
  const ys = years(r);
  return [r.id, ...ys.map((ws) => `${q(ws.map((x) => x.ms), 0.5)}/${q(ws.map((x) => x.ms), 0.95)}`), `${q(ys[0]?.map((x) => x.dayMs) ?? [], 0.5)}/${q(ys[ys.length - 1]?.map((x) => x.dayMs) ?? [], 0.5)}`];
})));
P('\nSave size (JSON length of the state), serialize ms, heap, characters, relations:');
P(tbl(['run', 'snap', 'bytes', 'ser ms', 'heap MB', 'chars (alive)', 'relations', 'biggest keys'], runs.flatMap((r) => r.snaps.map((s) => [r.id, s.label, `${(s.bytes / 1e6).toFixed(2)} MB`, s.serMs, s.heapMB, `${s.chars} (${s.alive})`, s.relations, s.keys.slice(0, 5).map(([a, b]) => `${a} ${(b / 1e3).toFixed(0)}k`).join(', ')]))));

// ---- 9. Integrity
P('\n### Integrity');
const ir = []; for (const r of runs) { for (const [key, v] of Object.entries(r.integ)) ir.push([r.id, key, v.n, v.first, v.sample.slice(0, 120)]); for (const e of r.errors) ir.push([r.id, 'ERROR', 1, '', e.slice(0, 200)]); }
P(ir.length ? tbl(['run', 'kind', 'weeks', 'first wk', 'sample'], ir) : '_clean_');

// ---- 10. Dynasty history (last lines)
P('\n### Dynasty history (per run)');
for (const r of runs) { P(`\n**${r.id}**`); for (const l of r.dynastyHistory.slice(-40)) P(`- ${l}`); }
console.log(out.join('\n'));
