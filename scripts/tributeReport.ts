/**
 * The required 52-week playable test, as an automated reconciliation report:
 *   npx tsx scripts/tributeReport.ts [seed]
 * Builds the spec's family (1 Don, 1 underboss, 1 consigliere, 3 capos, 12 soldiers,
 * 8 associates, 10 enterprises), plays 52 weeks with a scripted Don, and prints the
 * week-by-week flows, every reconciliation check, and the 14 demonstrations.
 * The checks themselves live in tests/tributeFamily.ts (`checkRequired`), shared
 * with the vitest test, so the report and the test can never disagree.
 */
import { checkRequired, familyCounts, play52, requiredFamily } from '../tests/tributeFamily';

const seed = process.argv[2] ?? 'tribute-52';
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
console.log(`WEEKLY TAKE — 52-WEEK RECONCILIATION REPORT (seed "${seed}")`);
console.log('Family:', JSON.stringify(familyCounts(requiredFamily(seed))));
const run = play52(seed);
const res = checkRequired(run);
console.log('\nwk | business in | biz costs | crews due | crews paid | short | capos kept | →UB | UB share | envelope | how split | → you | → family | → reserve | treasury | Don own | reserve | house cash | ledger | accounts');
for (const w of res.weeks) {
  console.log([
    w.week, $(w.bizIn), $(w.bizCost), $(w.due), $(w.paid), $(w.short), $(w.kept), $(w.collected), $(w.ubShare), $(w.presented),
    w.by ?? 'pending', w.alloc ? $(w.alloc.personal) : '', w.alloc ? $(w.alloc.treasury) : '', w.alloc ? $(w.alloc.reserve) : '',
    $(w.treasury), $(w.personal), $(w.reserve), $(w.house), w.ledgerOk ? 'ok' : 'FAIL', w.acctOk ? 'ok' : 'FAIL',
  ].join(' | '));
}
console.log('\nRECONCILIATION CHECKS');
for (const c of res.checks) console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
console.log('\nDEMONSTRATIONS');
for (const d of res.demos) console.log(`  [${d.ok ? 'PASS' : 'FAIL'}] ${d.name} — ${d.detail}`);
const t = run.s.tribute!;
console.log('\nStats:', JSON.stringify(t.stats));
console.log(`Underboss at the end: ${res.ub}`);
console.log(`Totals: business income ${$(res.totals.bizIn)}, business costs ${$(res.totals.bizCost)}, crews due ${$(res.totals.due)}, paid ${$(res.totals.paid)}, capos kept ${$(res.totals.kept)}, underboss ${$(res.totals.ubShare)}, envelopes ${$(res.totals.presented)} → Don ${$(res.totals.personal)} / family ${$(res.totals.treasury)} / reserve ${$(res.totals.reserve)}`);
const pass = res.checks.filter((c) => c.ok).length + res.demos.filter((d) => d.ok).length;
const all = res.checks.length + res.demos.length;
console.log(`\nRESULT: ${pass}/${all} passed${pass === all ? '' : ' — FAILURES ABOVE'}`);
process.exitCode = pass === all ? 0 : 1;
