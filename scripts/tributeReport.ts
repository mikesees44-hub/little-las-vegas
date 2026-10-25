/**
 * The required 52-week playable test, as an automated reconciliation report:
 *   npx tsx scripts/tributeReport.ts [seed]
 * Builds the spec's family (1 Don, 1 underboss, 1 consigliere, 3 capos, 12 soldiers,
 * 8 associates, 10 enterprises), plays 52 weeks with a scripted Don, and prints the
 * week-by-week flows, every reconciliation check, and the 14 demonstrations.
 */
import { familyCounts, play52, requiredFamily } from '../tests/tributeFamily';
import { advanceWeek } from '../src/engine/engine';
import { donChoices } from '../tests/tributeFamily';
import { reconcile } from '../src/engine/ledger';

const seed = process.argv[2] ?? 'tribute-52';
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const start = requiredFamily(seed);
console.log(`WEEKLY TAKE — 52-WEEK RECONCILIATION REPORT (seed "${seed}")`);
console.log('Family:', JSON.stringify(familyCounts(start)));
const { s, rows, mid } = play52(seed);
const t = s.tribute!;
console.log('\nwk | business in | crews→UB | UB share | envelope | → you | → family | → reserve | treasury | own | reserve | house cash | ledger ok | accounts ok');
let allLedger = true;
let allAcct = true;
for (const r of rows) {
  const rep = t.reports.find((x) => x.week === r.week);
  const biz = r.report.lines.filter((l) => l.stat === 'money' && l.category === 'business').reduce((a, l) => a + l.amount, 0);
  const led = reconcile(r.report).length === 0;
  const b = t.books.find((x) => x.week === r.week);
  let acct = true;
  if (b) for (const k of ['personal', 'reserve', 'envelope']) {
    const exp = (b.start[k] ?? 0) - b.x.filter((x) => x[0] === k).reduce((a, x) => a + x[2], 0) + b.x.filter((x) => x[1] === k).reduce((a, x) => a + x[2], 0);
    if (exp !== b.end[k]) acct = false;
  }
  allLedger &&= led;
  allAcct &&= acct;
  const a = rep?.alloc;
  console.log([r.week, $(biz), $(rep?.collected ?? 0), $(rep?.ubShare ?? 0), $(rep?.presented ?? 0), a ? $(a.personal) : 'pending', a ? $(a.treasury) : '', a ? $(a.reserve) : '', $(r.accounts.treasury), $(r.accounts.personal), $(r.accounts.reserve), $(r.houseCash), led ? 'ok' : 'FAIL', acct ? 'ok' : 'FAIL'].join(' | '));
}
// Envelope arithmetic: presented == split + petitions granted, for every report.
let envOk = true;
for (const rep of t.reports) if (rep.alloc) {
  const granted = rep.petitions.filter((p) => rep.alloc!.granted.includes(p.id) && p.from !== 'reserve' && p.kind !== 'extension').reduce((a, p) => a + p.amount, 0);
  if (rep.alloc.personal + rep.alloc.treasury + rep.alloc.reserve + granted < rep.presented - 1 || rep.alloc.personal + rep.alloc.treasury + rep.alloc.reserve > rep.presented) envOk = false;
}
// No duplicate distributions: every report split at most once; replaying a saved week gives the same state.
const splits = t.reports.filter((r) => r.alloc).map((r) => r.id);
const dupFree = new Set(splits).size === splits.length;
let saveOk = false;
if (mid) {
  const a = advanceWeek(mid, donChoices(mid, 26)).state;
  const b = advanceWeek(JSON.parse(JSON.stringify(mid)), donChoices(mid, 26)).state;
  saveOk = JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a.tribute) === JSON.stringify(b.tribute);
}
const rep = t.reports;
const shortfalls = rep.flatMap((r) => r.crews.flatMap((c) => c.members.filter((m) => m.truth)));
const demos: [string, boolean, string][] = [
  ['1. Actual business income and expenses', rows.some((r) => r.report.lines.some((l) => l.category === 'business' && l.amount > 0)) && rows.some((r) => r.report.lines.some((l) => l.category === 'cost' && l.amount < 0)), `${$(rows.reduce((a, r) => a + r.report.lines.filter((l) => l.category === 'business').reduce((x, l) => x + l.amount, 0), 0))} business income; ${$(-rows.reduce((a, r) => a + r.report.lines.filter((l) => l.category === 'cost').reduce((x, l) => x + l.amount, 0), 0))} costs`],
  ['2. Crew-level contributions', rep.every((r) => r.crews.length >= 3), `${rep[rep.length - 1].crews.length} crews; ${rep[rep.length - 1].crews.reduce((a, c) => a + c.members.length, 0)} contribution lines in the last week`],
  ['3. Capo retention and distributions', rows.some((r) => (r.flows.capo_distribution ?? 0) > 0), `capos kept ${$(rows.reduce((a, r) => a + (r.flows.capo_distribution ?? 0), 0))} under their contracts`],
  ['4. Underboss reconciliation', rep.every((r) => r.collected === r.ubShare + r.ubSkim + r.presented + (r.issues.find((i) => i.kind === 'late')?.amount ?? 0)), `his share ${$(rep.reduce((a, r) => a + r.ubShare, 0))}`],
  ['5. A weekly envelope delivered to the Don', t.stats.audiences + t.stats.quiet + (rep.some((r) => r.status === 'presented') ? 1 : 0) === 52, `${t.stats.audiences} audiences held, ${t.stats.quiet} quiet weeks, one on the desk at the end; ${$(rows.reduce((a, r) => a + (t.reports.find((x) => x.week === r.week)?.presented ?? 0), 0))} in the last 26`],
  ['6. Don-controlled personal / treasury / reserve allocation', rep.some((r) => r.alloc?.by === 'custom') && rep.some((r) => r.alloc?.by === 'his'), `${rep.filter((r) => r.alloc?.by === 'custom').length} custom splits, ${rep.filter((r) => r.alloc?.by === 'his').length} his advice, ${rep.filter((r) => r.alloc?.by === 'quiet').length} standing policy`],
  ['7. A genuine financial shortfall', shortfalls.some((m) => m.truth === 'bad_week' || m.truth === 'default'), `${shortfalls.length} shortfalls; truths: ${[...new Set(shortfalls.map((m) => m.truth))].join(', ')}`],
  ['8. A disputed assessment', t.disputes.length > 0, t.disputes.map((d) => `${d.status}${d.valid ? ' (valid)' : ''}`).join(', ')],
  ['9. The underboss recommending an alternative split', rep.some((r) => r.rec.personal !== t.policy.personal || r.rec.reserve !== t.policy.reserve), `e.g. ${rep.filter((r) => r.rec.personal !== 1500 || r.rec.reserve !== 1000).slice(-1).map((r) => `wk ${r.week}: ${r.rec.personal / 100}/${r.rec.treasury / 100}/${r.rec.reserve / 100}`)[0] ?? ''}`],
  ['10. A financial grievance that becomes a storyline', t.stats.grievances > 0 && (s.director?.hist ?? []).some((h) => h[1] === 'tr_grievance' || h[1] === 'tr_dispute' || h[1] === 'tr_shortfall'), `${t.stats.grievances} grievances; story events shown: ${[...new Set((s.director?.hist ?? []).map((h) => h[1]).filter((x) => x.startsWith('tr_')))].join(', ')}`],
  ['11. Correct personal and organizational balances', allLedger && allAcct && envOk, `ledger ${allLedger ? 'ok' : 'FAIL'}, accounts ${allAcct ? 'ok' : 'FAIL'}, envelopes ${envOk ? 'ok' : 'FAIL'}`],
  ['12. Save/load continuity', saveOk, 'week 26 replayed from a JSON save: identical'],
  ['13. No duplicate distributions', dupFree, `${splits.length} envelopes split, each once`],
  ['14. Independent rival-family updates', Object.values(t.rivals).length >= 3 && Object.values(t.rivals).every((b) => (b.last?.week ?? 0) >= s.week - 2), Object.entries(t.rivals).map(([id, b]) => `${id}: treasury ${$(s.rivals.find((r) => r.id === id)?.money ?? 0)} reserve ${$(b.reserve)} boss ${$(b.personal)}${b.insolvent ? ' INSOLVENT' : ''}`).join('; ')],
];
console.log('\nDEMONSTRATIONS');
for (const [k, ok, why] of demos) console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${k} — ${why}`);
console.log('\nStats:', JSON.stringify(t.stats));
console.log('Favors on the books:', t.favors.length, '· underboss standing', Math.round(t.ub.base), '· calls first', t.ub.callsFirst.length);
process.exitCode = demos.every((d) => d[1]) ? 0 : 1;
