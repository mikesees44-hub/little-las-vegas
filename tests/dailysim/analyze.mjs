// Analyze the daily sim's JSON runs: node tests/dailysim/analyze.mjs <dir> [--md]
// Prints tables (markdown) for the report.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => /^[a-z]+_[a-z]\.json$/.test(f)).sort();
const runs = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

const pct = (x, n) => (n ? `${Math.round((100 * x) / n)}%` : '-');
const r1 = (x) => Math.round(x * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const q = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const tbl = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

// ---- action classification (per week: the turn's results land on Monday) ----
const RX = {
  raid: /^RAID:/,
  fedArrest: /^ARREST:/,
  rivalHurt: /^\[(?!Prosecutor|Philly)\w+\].*(firebomb|torch|burn|shoot|shot|beat|smash|bomb|rob|hijack|lean on|muscle|strike|hit |ambush|break|stick up|wreck)/i,
  rivalPush: /^\[\w+\].*(pushes into|muscles|moves in)/i,
  killing: /(shot dead|gunned down|was murdered|whacked|garrot|stabbed to death|made his bones on|never seen again|body was found|found in the trunk|found in the marsh|blown up)/i,
  betrayal: /^(?!\[Prosecutor\]).*(betray|flipped|walked out|deserted|(?<!(house|place) )went over to|turned on you|took the men loyal|wearing a wire|ratted)/i,
  score: /(heist|hijack|truckload|armored|robbery|jewel|the score|big score)/i,
  philly: /Philadelphia summoned you/,
  threatFoiled: /came to nothing: you were ready/,
  threatLanded: /(came for you|Shots through|You were warned|never came\. )/,
};

function weekActions(w) {
  const a = {};
  const add = (k) => (a[k] = (a[k] ?? 0) + 1);
  for (const l of w.log) for (const [k, rx] of Object.entries(RX)) if (rx.test(l)) add(k);
  for (const d of w.deaths) if (d.violent) add(d.mine ? 'myManKilled' : 'npcKilled'); else if (d.mine) add('myDeathNatural');
  if (w.arrests) a.myArrest = w.arrests;
  if (w.newWars) a.war = w.newWars;
  if (w.battles > 0) a.battle = w.battles;
  if (w.successions) a.succession = 1;
  if (w.rivalBosses) a.rivalBossFalls = w.rivalBosses;
  if (w.plotsUncovered) a.plot = w.plotsUncovered;
  return a;
}
// "Big" action: what the brief names (violence, raids, wars, hits, arrests, betrayals, scores, deaths, successions).
const BIG = ['threatFoiled', 'threatLanded', 'raid', 'fedArrest', 'killing', 'myManKilled', 'npcKilled', 'myArrest', 'war', 'battle', 'succession', 'betrayal', 'score', 'rivalHurt', 'plot', 'rivalBossFalls', 'philly'];
const HARD = ['threatLanded', 'raid', 'fedArrest', 'myManKilled', 'npcKilled', 'myArrest', 'war', 'battle', 'succession', 'plot', 'rivalBossFalls'];

function gaps(flags) { // flags: bool per week -> longest run of false, mean gap
  let longest = 0, cur = 0; const gs = []; let last = -1;
  flags.forEach((f, i) => { if (f) { if (last >= 0) gs.push(i - last); last = i; cur = 0; } else { cur++; longest = Math.max(longest, cur); } });
  return { longest, mean: gs.length ? mean(gs) : Infinity, n: flags.filter(Boolean).length };
}

const out = [];
const P = (s = '') => out.push(s);

// ---------- 1. days ----------
P('### Days on the clock (what the player sees, by day)');
const dayRows = [];
const dowAll = Array.from({ length: 7 }, () => ({ n: 0, dead: 0, deadNoEve: 0, dec: 0, am: 0, pauses: 0, tips: 0 }));
for (const r of runs) {
  const D = r.days.filter((d) => r.weeks.length && d.w <= r.weeks[r.weeks.length - 1].w);
  const something = (d, eve) => d.dec || d.am || d.tips || d.cuts.length || d.heads.length || d.warns.length || d.now || d.pauses.length || (eve && d.eve);
  const dead = D.filter((d) => !something(d, true)).length;
  const deadNoEve = D.filter((d) => !something(d, false)).length;
  const dec = D.reduce((a, d) => a + d.dec, 0);
  const mon = D.filter((d) => d.d === 0).reduce((a, d) => a + d.dec + d.tips + d.cuts.length + d.heads.length, 0);
  const all = D.reduce((a, d) => a + d.dec + d.tips + d.cuts.length + d.heads.length, 0);
  // Longest run of consecutive dead days (evenings counted as something).
  let run = 0, longest = 0, runNE = 0, longestNE = 0;
  for (const d of D) { if (!something(d, true)) { run++; longest = Math.max(longest, run); } else run = 0; if (!something(d, false)) { runNE++; longestNE = Math.max(longestNE, runNE); } else runNE = 0; }
  for (const d of D) { const x = dowAll[d.d]; x.n++; if (!something(d, true)) x.dead++; if (!something(d, false)) x.deadNoEve++; x.dec += d.dec; x.am += d.am; x.pauses += d.pauses.length; x.tips += d.tips; }
  dayRows.push([`${r.start}/${r.seed}`, D.length, pct(dead, D.length), pct(deadNoEve, D.length), longest, longestNE, pct(mon, all)]);
}
P(tbl(['run', 'days', 'dead days (evenings count)', 'dead days (evenings ignored)', 'longest dead streak', 'longest streak (eve ignored)', 'share of news/decisions landing Monday'], dayRows));
P();
P('By day of the week (all runs pooled):');
const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
P(tbl(['day', 'dead (eve count)', 'dead (eve ignored)', 'decisions/day', 'capo problems/day', 'urgent tips/day', 'auto-pauses/day'], dowAll.map((x, i) => [DN[i], pct(x.dead, x.n), pct(x.deadNoEve, x.n), r1(x.dec / x.n), r1(x.am / x.n), r1(x.tips / x.n), r1(x.pauses / x.n)])));
P();

// ---------- 2. per week ----------
P('### Per week: decisions, interruptions, auto-pauses');
const wkRows = [];
const pauseWhy = {};
for (const r of runs) {
  const W = r.weeks;
  const pops = W.map((w) => w.popups.length);
  const mand = W.reduce((a, w) => a + w.popups.filter((p) => p.mand).length, 0);
  const allP = pops.reduce((a, b) => a + b, 0);
  const D = r.days;
  const byW = {};
  for (const d of D) { const k = d.w; byW[k] ??= { p: 0, am: 0, amU: 0, tips: 0 }; byW[k].p += d.pauses.length; byW[k].am += d.am; byW[k].amU += d.amUrgent; byW[k].tips += d.tips; for (const p of d.pauses) pauseWhy[p] = (pauseWhy[p] ?? 0) + 1; }
  const wv = Object.values(byW);
  wkRows.push([`${r.start}/${r.seed}`, W.length, r1(mean(pops)), pct(W.filter((w) => !w.popups.length).length, W.length), pct(mand, allP), r1(mean(wv.map((x) => x.am))), r1(mean(wv.map((x) => x.amU))), r1(mean(wv.map((x) => x.tips))), r1(mean(wv.map((x) => x.p))), q(wv.map((x) => x.p), 0.9), r1(mean(W.map((w) => w.motion)))]);
}
P(tbl(['run', 'weeks', 'decisions/wk', 'weeks w/o a decision', 'mandatory share', 'capo problems/wk', 'urgent capo/wk', 'urgent meetings/wk', 'auto-pauses/wk', 'p90 pauses/wk', 'settled quietly/wk'], wkRows));
P();
const pw = Object.entries(pauseWhy).sort((a, b) => b[1] - a[1]);
const totalWeeks = runs.reduce((a, r) => a + r.weeks.length, 0);
P(tbl(['auto-pause reason', 'count', 'per week'], pw.map(([k, v]) => [k, v, r1(v / totalWeeks)])));
P();

// ---------- 3. themes and repeats ----------
P('### Event themes and repeats (all runs pooled)');
const th = {}, tpl = {}, ids = {};
let totalPop = 0, rep8 = 0;
for (const r of runs) {
  const last = {};
  for (const w of r.weeks) for (const p of w.popups) {
    totalPop++; th[p.theme] = (th[p.theme] ?? 0) + 1; tpl[p.tpl] = (tpl[p.tpl] ?? 0) + 1;
    if (last[p.tpl] !== undefined && w.w - last[p.tpl] < 8) rep8++;
    last[p.tpl] = w.w;
  }
}
P(tbl(['theme', 'share'], Object.entries(th).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v, totalPop)])));
P();
P(`Popups: ${totalPop}; distinct templates: ${Object.keys(tpl).length}; same template again within 8 weeks: ${pct(rep8, totalPop)}.`);
P();
P('Most frequent templates:');
P(tbl(['template', 'count', 'per 52 wks'], Object.entries(tpl).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, v, r1((v * 52) / totalWeeks)])));
P();

// ---------- 4. action ----------
P('### Action moments (per week; the turn lands them all on Monday)');
const actRows = [];
const catTot = {};
for (const r of runs) {
  const A = r.weeks.map(weekActions);
  for (const a of A) for (const [k, v] of Object.entries(a)) catTot[k] = (catTot[k] ?? 0) + v;
  const big = gaps(A.map((a) => BIG.some((k) => a[k])));
  const hard = gaps(A.map((a) => HARD.some((k) => a[k])));
  const mine = gaps(A.map((a) => a.myManKilled || a.myArrest || a.raid || a.fedArrest || a.war || a.battle || a.succession || a.plot));
  actRows.push([`${r.start}/${r.seed}`, pct(big.n, A.length), big.longest, pct(hard.n, A.length), hard.longest, r1(hard.mean), pct(mine.n, A.length), mine.longest]);
}
P(tbl(['run', 'weeks w/ any action', 'longest dry (wks)', 'weeks w/ hard action', 'longest hard-dry (wks)', 'mean gap hard (wks)', 'weeks it hits HIM', 'longest w/o it hitting him'], actRows));
P();
P(tbl(['action kind', 'total', 'per 52 wks'], Object.entries(catTot).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v, r1((v * 52) / totalWeeks)])));
P();

// ---------- 5. curves ----------
P('### Curves (Family cash $, respect, heat L/F/Fed, crew)');
const marks = [0, 12, 25, 51, 103, 155, 207, 259];
const curveRows = [];
for (const r of runs) {
  const W = r.weeks;
  const cells = marks.filter((m) => m < W.length).map((m) => { const w = W[m]; return `${Math.round(w.fam / 1000)}k · R${w.respect} · ${w.heat.local}/${w.heat.family}/${w.heat.federal} · ${w.crew}`; });
  curveRows.push([`${r.start}/${r.seed}`, ...cells, ...Array(marks.length - cells.length).fill('')]);
}
P(tbl(['run', ...marks.map((m) => `wk ${m + 1}`)], curveRows));
P();
const lossRows = [];
for (const r of runs) {
  const W = r.weeks;
  let down = 0, negWeeks = 0, maxDraw = 0, peak = -Infinity;
  for (let i = 1; i < W.length; i++) { if (W[i].fam < W[i - 1].fam) down++; if (W[i].money < 0) negWeeks++; peak = Math.max(peak, W[i].fam); maxDraw = Math.max(maxDraw, peak - W[i].fam); }
  const resp = W.map((w) => w.respect);
  const crew = W.map((w) => w.crew);
  const lost = W.reduce((a, w) => a + w.deaths.filter((d) => d.mine).length + w.arrests, 0);
  lossRows.push([`${r.start}/${r.seed}`, pct(down, W.length - 1), negWeeks, `${Math.round(maxDraw / 1000)}k`, `${Math.min(...resp)}–${Math.max(...resp)}`, `${Math.min(...crew)}–${Math.max(...crew)}`, lost, r.gameOver ? JSON.stringify(r.gameOver).slice(0, 60) : '-']);
}
P(tbl(['run', 'weeks cash fell', 'weeks treasury < 0', 'worst drawdown', 'respect range', 'crew range', 'men lost (dead+jailed)', 'game over'], lossRows));
P();

// ---------- 6. perf + errors ----------
P('### Week-turn time and integrity');
const perfRows = runs.map((r) => { const ms = r.weeks.map((w) => w.ms); const bad = r.weeks.flatMap((w) => w.bad.map((b) => `wk${w.w} ${b}`)); return [`${r.start}/${r.seed}`, q(ms, 0.5), q(ms, 0.95), Math.max(...ms), q(ms.slice(-52), 0.5), r.errors.length, bad.slice(0, 3).join('; ') || '-', r.errors.slice(0, 2).join(' / ').slice(0, 160) || '-']; });
P(tbl(['run', 'p50 ms', 'p95 ms', 'max ms', 'p50 last year', 'errors', 'NaN/bad', 'first errors'], perfRows));
P();

// ---------- 7. systems that never fired ----------
P('### Systems that fire / never fire (log keyword counts, all runs)');
const SYS = {
  'police raid (RAID:)': /^RAID:/, 'FBI arrest (ARREST:)': /^ARREST:/, 'Philadelphia fine': /Philadelphia summoned you/, 'urgent meeting asked': /asks for an urgent meeting/,
  'war declared': /declare[sd]? war|war (is|was) declared|goes to war/i, 'battle': /battle/i, 'hit / murder': /murder|whack|hit on|the hit/i, 'heist / score': /heist|armored|jewel/i,
  'trial / indictment': /trial|indict|grand jury/i, 'election': /elect/i, 'wedding': /wedding|married/i, 'birth': /was born|gave birth/i, 'hurricane': /hurricane/i,
  'Fourth of July': /fourth of july|july 4/i, 'Labor Day': /labor day/i, 'desertion': /walked out|deserted|walks out/i, 'rival boss dies/falls': /new boss|takes over the|succeeds/i,
  'rival pushes in': /pushes into/i, 'rival firebomb/robbery': /firebomb|torch|rob/i, 'informant/flip': /informant|flipped|\brat\b/i, 'travel / trip': /trip|vacation|Atlantic City|Ocean City/i,
};
const sysC = Object.fromEntries(Object.keys(SYS).map((k) => [k, 0]));
for (const r of runs) for (const w of r.weeks) for (const l of [...w.log, ...w.news, ...w.chron]) for (const [k, rx] of Object.entries(SYS)) if (rx.test(l)) sysC[k]++;
P(tbl(['system', 'lines', 'per 52 wks'], Object.entries(sysC).sort((a, b) => a[1] - b[1]).map(([k, v]) => [k, v, r1((v * 52) / totalWeeks)])));
P();
const news = {};
for (const r of runs) for (const w of r.weeks) for (const n of w.news) { const k = n.split('|')[0]; news[k] = (news[k] ?? 0) + 1; }
P(`Newspaper items by kind (per 52 wks): ${Object.entries(news).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${r1((v * 52) / totalWeeks)}`).join(', ')}`);
P();
const acts = {};
for (const r of runs) for (const w of r.weeks) for (const a of w.actions) acts[a] = (acts[a] ?? 0) + 1;
P(`Player acts taken (policy): ${Object.entries(acts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(out.join('\n'));
