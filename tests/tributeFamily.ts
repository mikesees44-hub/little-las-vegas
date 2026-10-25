import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newBusiness } from '../src/engine/business';
import { capos, crew, makeCharacter } from '../src/engine/characters';
import { tidyRegimes } from '../src/engine/hierarchy';
import { addOpinion } from '../src/engine/relations';
import { rand } from '../src/engine/rng';
import { ensureTribute, houseCash, type TransferCat, type TributeReport } from '../src/engine/tributeState';
import type { BusinessKind, GameState, PlayerChoices, WeeklyReport } from '../src/engine/types';
import { reconcile } from '../src/engine/ledger';
import { upToCollected } from '../src/engine/crewPurse';
import { moneyGrievances } from '../src/engine/tributeGrievance';
import { ubProfile } from '../src/engine/underboss';

/**
 * The spec's required family: one Don, one underboss, one consigliere, three
 * capos, twelve soldiers, eight associates, ten enterprises — built on a
 * real new game (the same engine, map, council and ledger), plus a scripted
 * Don who holds the audience, takes his underboss's advice some weeks, splits
 * it himself others, grants petitions, and once has the books audited.
 */
export function requiredFamily(seed = 'tribute-52'): GameState {
  const s = newGame(seed);
  const ks = capos(s);
  // Exactly three capos, each with a district.
  for (const k of ks.slice(3)) {
    for (const d of s.districts) if (d.capoId === k.id) d.capoId = undefined;
    k.rank = 'soldier';
  }
  const three = capos(s).slice(0, 3);
  const assign = (i: number) => three[i % 3].id;
  const add = (rank: 'soldier' | 'associate', n: number) => {
    for (let i = 0; i < n; i++) {
      const c = makeCharacter(s, { rank, faction: 'player', age: 24 + (i * 3) % 20 });
      c.capoId = assign(i);
    }
  };
  const have = (r: string) => crew(s).filter((c) => c.rank === r).length;
  add('soldier', 12 - have('soldier'));
  add('associate', 8 - have('associate'));
  let j = 0;
  for (const c of crew(s)) if ((c.rank === 'soldier' || c.rank === 'associate') && !c.capoId) c.capoId = assign(j++);
  // Pressure that makes a real story likely: a gambler, a man who resents his end, a greedy capo on a tight contract.
  const men = crew(s).filter((c) => c.rank === 'soldier');
  if (!men[0].traits.includes('Gambler')) men[0].traits = [...men[0].traits.filter((t) => t !== 'Honest'), 'Gambler'];
  addOpinion(s, men[1].id, s.playerId, 'Passed over for a better corner', -40, 0);
  men[1].traits = men[1].traits.filter((t) => t !== 'Honest' && t !== 'Loyal-to-a-fault');
  const greedy = three[1];
  if (!greedy.traits.includes('Greedy')) greedy.traits = [...greedy.traits.filter((t) => t !== 'Honest' && t !== 'Loyal-to-a-fault'), 'Greedy'];
  greedy.keep = 0.25;
  // Ten enterprises.
  const kinds: BusinessKind[] = ['laundromat', 'vending', 'pizza', 'motel', 'bar', 'stand', 'carlot'];
  const owned = () => s.businesses.filter((b) => b.owner === 'player').length;
  let k = 0;
  while (owned() < 10) {
    const d = s.districts[k % 4];
    const b = newBusiness(s, kinds[k % kinds.length], d.id);
    b.owner = 'player';
    b.boughtWeek = 1;
    s.businesses.push(b);
    k++;
  }
  tidyRegimes(s);
  // This Don keeps a standing split for quiet weeks; the underboss asks to see him
  // when there is a shortfall that matters, a dispute, a petition or a crisis.
  ensureTribute(s).policy.auto = true;
  return s;
}

export function familyCounts(s: GameState) {
  const c = crew(s);
  return {
    don: 1, underboss: c.filter((x) => x.rank === 'underboss').length, consigliere: c.filter((x) => x.rank === 'consigliere').length,
    capos: c.filter((x) => x.rank === 'capo').length, soldiers: c.filter((x) => x.rank === 'soldier').length, associates: c.filter((x) => x.rank === 'associate').length,
    enterprises: s.businesses.filter((b) => b.owner === 'player').length,
  };
}

/** The scripted Don's choices for one week. */
export function donChoices(s: GameState, w: number): PlayerChoices {
  const h = { rng: (s.rng ^ Math.imul(w + 7, 0x9e3779b1)) >>> 0 };
  const choices: Record<string, string> = {};
  const out: PlayerChoices = { choices };
  for (const ev of s.pendingEvents) {
    const legal = ev.choices.filter((c) => !c.disabledReason);
    if (ev.defId === 'tribute_audience') {
      const rep = s.tribute!.reports.find((r) => r.id === ev.meta?.report)!;
      const mode = w % 3;
      if (mode === 0 && legal.some((c) => c.id === 'his')) choices[ev.iid] = 'his';
      else if (mode === 1) {
        choices[ev.iid] = 'custom';
        out.envelope = { report: rep.id, split: { personal: 2500, treasury: 6000, reserve: 1500 }, grant: rep.petitions.map((p) => p.id) };
      } else choices[ev.iid] = 'policy';
      continue;
    }
    // Disputes: deny the first one (a grievance may follow), recheck the rest.
    if (ev.defId === 'tr_dispute') { choices[ev.iid] = (s.tribute!.stats.disputes <= 1 ? 'deny' : 'recheck'); continue; }
    choices[ev.iid] = legal[Math.floor(rand(h) * legal.length)].id;
  }
  if (w === 30) out.actions = [{ kind: 'tribute', op: { op: 'audit' } }];
  return out;
}

export interface WeekRow {
  week: number;
  report: WeeklyReport;
  accounts: Record<string, number>;
  flows: Record<TransferCat, number>;
  houseCash: number;
}

/**
 * Play the 52 weeks, keeping a row per week for the reconciliation report.
 * `reps` is every week's tribute report (the game keeps the last 26; the
 * harness keeps them all, updated until they are split), `books` every
 * week's account book (start, transfers, end).
 */
export function play52(seed = 'tribute-52', weeks = 52): { s: GameState; rows: WeekRow[]; mid?: GameState; midChoices?: PlayerChoices; reps: TributeReport[]; books: NonNullable<GameState['tribute']>['books'] } {
  let s = requiredFamily(seed);
  const rows: WeekRow[] = [];
  let mid: GameState | undefined;
  let midChoices: PlayerChoices | undefined;
  const reps = new Map<number, TributeReport>();
  const books: NonNullable<GameState['tribute']>['books'] = [];
  for (let w = 0; w < weeks; w++) {
    const ch = donChoices(s, w);
    if (w === 26) { mid = JSON.parse(JSON.stringify(s)); midChoices = JSON.parse(JSON.stringify(ch)); }
    const r = advanceWeek(s, ch);
    s = r.state;
    const b = s.tribute!.books[s.tribute!.books.length - 1];
    books.push(JSON.parse(JSON.stringify(b)));
    for (const rep of s.tribute!.reports) reps.set(rep.week, JSON.parse(JSON.stringify(rep)));
    const flows = {} as Record<TransferCat, number>;
    for (const x of b.x) flows[x[3]] = (flows[x[3]] ?? 0) + x[2];
    rows.push({ week: r.report.week, report: r.report, accounts: b.end, flows, houseCash: houseCash(s) });
  }
  return { s, rows, mid, midChoices, reps: [...reps.values()].sort((a, b) => a.week - b.week), books };
}

export interface CheckLine { name: string; ok: boolean; detail: string }
export interface WeekCheck {
  week: number; bizIn: number; bizCost: number; due: number; paid: number; short: number; kept: number; collected: number; ubShare: number; presented: number;
  by?: string; alloc?: { personal: number; treasury: number; reserve: number };
  treasury: number; personal: number; reserve: number; house: number; ledgerOk: boolean; acctOk: boolean;
}

/**
 * Every check of the required test, from the harness's full records: the
 * week-by-week reconciliation and the spec's 14 demonstrations. Shared by the
 * vitest test and scripts/tributeReport.ts.
 */
export function checkRequired(run: ReturnType<typeof play52>, seed = 'tribute-52'): { weeks: WeekCheck[]; checks: CheckLine[]; demos: CheckLine[]; totals: Record<string, number>; ub: string } {
  const { s, rows, reps, books, mid, midChoices } = run;
  const t = s.tribute!;
  const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
  const repOf = (w: number) => reps.find((r) => r.week === w);
  const weeks: WeekCheck[] = [];
  const acctFails: string[] = [];
  books.forEach((b) => {
    const keys = new Set([...Object.keys(b.start), ...Object.keys(b.end)].filter((k) => k !== 'treasury'));
    for (const k of keys) {
      const all = [...b.x, ...(b.hx ?? [])];
      const exp = (b.start[k] ?? 0) - all.filter((x) => x[0] === k).reduce((a, x) => a + x[2], 0) + all.filter((x) => x[1] === k).reduce((a, x) => a + x[2], 0);
      if (exp !== (b.end[k] ?? 0)) acctFails.push(`wk ${b.week} ${k}: expected ${exp}, found ${b.end[k] ?? 0}`);
    }
  });
  for (const r of rows) {
    const rep = repOf(r.week);
    const b = books.find((x) => x.week === r.week);
    const lines = r.report.lines.filter((l) => l.stat === 'money');
    const acctOk = !acctFails.some((f) => f.startsWith(`wk ${r.week} `));
    weeks.push({
      week: r.week,
      bizIn: lines.filter((l) => l.category === 'business' && l.amount > 0).reduce((a, l) => a + l.amount, 0),
      bizCost: -lines.filter((l) => (l.category === 'cost' || l.category === 'business') && l.amount < 0).reduce((a, l) => a + l.amount, 0),
      due: rep ? rep.crews.reduce((a, c) => a + c.due, 0) : 0,
      paid: rep ? rep.crews.reduce((a, c) => a + c.paid, 0) : 0,
      short: rep ? rep.crews.reduce((a, c) => a + c.short, 0) : 0,
      kept: rep ? rep.crews.reduce((a, c) => a + c.kept, 0) : 0,
      collected: rep?.collected ?? 0, ubShare: rep?.ubShare ?? 0, presented: rep?.presented ?? 0,
      by: rep?.alloc?.by, alloc: rep?.alloc ? { personal: rep.alloc.personal, treasury: rep.alloc.treasury, reserve: rep.alloc.reserve } : undefined,
      treasury: b?.end.treasury ?? 0, personal: b?.end.personal ?? 0, reserve: b?.end.reserve ?? 0, house: r.houseCash,
      ledgerOk: reconcile(r.report).length === 0, acctOk,
    });
  }
  const sum = (f: (w: WeekCheck) => number) => weeks.reduce((a, w) => a + f(w), 0);
  // Envelope arithmetic, every report.
  const envFails: string[] = [];
  const ubFails: string[] = [];
  const upFails: string[] = [];
  for (const rep of reps) {
    const late = rep.issues.find((i) => i.kind === 'late')?.amount ?? 0;
    if (rep.collected !== rep.ubShare + rep.ubSkim + rep.presented + late) ubFails.push(`wk ${rep.week}`);
    const u = upToCollected(rep);
    if (!u.ok) upFails.push(`wk ${rep.week}: up ${u.up} − skim ${u.skim} − held ${u.held} + late ${u.late} + inv ${u.inv} + carry ${u.carry} ≠ ${u.collected}`);
    if (rep.alloc) {
      const sp = rep.alloc.split;
      const granted = rep.petitions.filter((p) => rep.alloc!.granted.includes(p.id) && p.from !== 'reserve' && p.kind !== 'extension').reduce((a, p) => a + p.amount, 0);
      if (sp.personal + sp.treasury + sp.reserve !== 10000) envFails.push(`wk ${rep.week}: split ${sp.personal}+${sp.treasury}+${sp.reserve}`);
      const total = rep.alloc.personal + rep.alloc.treasury + rep.alloc.reserve;
      if (total > rep.presented || total + granted < rep.presented) envFails.push(`wk ${rep.week}: ${total} + petitions ${granted} vs envelope ${rep.presented}`);
    }
  }
  // No duplicate distributions: what the books moved out of the envelope is exactly what the reports say was split, once each.
  const bookFlow = (cat: TransferCat) => books.reduce((a, b) => a + b.x.filter((x) => x[0] === 'envelope' && x[3] === cat).reduce((y, x) => y + x[2], 0), 0);
  const allocs = reps.filter((r) => r.alloc);
  const repFlow = (k: 'personal' | 'treasury' | 'reserve') => allocs.reduce((a, r) => a + r.alloc![k], 0);
  const splitIds = allocs.map((r) => r.id);
  const dupFree = new Set(splitIds).size === splitIds.length && bookFlow('don_personal_share') === repFlow('personal') && bookFlow('treasury_allocation') === repFlow('treasury') && bookFlow('reserve_allocation') === repFlow('reserve');
  // Exactly one personal-share transfer per envelope split (never two for the same envelope).
  const perWeekOk = books.reduce((a, b) => a + b.x.filter((x) => x[0] === 'envelope' && x[3] === 'don_personal_share').length, 0) === allocs.filter((r) => r.alloc!.personal > 0).length;
  // Save/load: the week-27 save replayed gives the same books as the original run (nothing collected or paid twice).
  let saveOk = false;
  let saveDetail = 'no save';
  if (mid && midChoices) {
    const a = advanceWeek(JSON.parse(JSON.stringify(mid)), JSON.parse(JSON.stringify(midChoices))).state;
    const b2 = advanceWeek(JSON.parse(JSON.stringify(mid)), JSON.parse(JSON.stringify(midChoices))).state;
    const orig = books.find((x) => x.week === a.tribute!.books[a.tribute!.books.length - 1].week);
    const replay = a.tribute!.books[a.tribute!.books.length - 1];
    saveOk = JSON.stringify(a) === JSON.stringify(b2) && !!orig && JSON.stringify(orig) === JSON.stringify(replay);
    saveDetail = `the week-${mid.week} save loaded twice and played: identical states; its book (${replay.x.length} transfers) matches the original run's`;
  }
  // Rivals: their treasuries moved on their own.
  const start = requiredFamily(seed);
  const rivalMoves = Object.entries(t.rivals).map(([id, b]) => {
    const before = start.rivals.find((r) => r.id === id)?.money ?? 0;
    const after = s.rivals.find((r) => r.id === id)?.money ?? 0;
    return { id, before, after, b };
  });
  const purseRows = Object.values(t.purse ?? {}).flat();
  const checks: CheckLine[] = [
    { name: 'One ledger: every week reconciles (opening + lines = closing)', ok: weeks.every((w) => w.ledgerOk), detail: `${weeks.filter((w) => w.ledgerOk).length}/${weeks.length} weeks` },
    { name: 'Accounts: every internal account, every week (start + in − out = end)', ok: acctFails.length === 0, detail: acctFails.length ? acctFails.slice(0, 3).join('; ') : `${books.length} weeks, personal / reserve / envelope / clearing / every crew account` },
    { name: 'Men → underboss: kicked up − skim − held + late + investments + carry = collected', ok: upFails.length === 0, detail: upFails.length ? upFails.slice(0, 2).join('; ') : `${reps.length} reports` },
    { name: 'Underboss: collected = his share + anything he took + envelope + count not done', ok: ubFails.length === 0, detail: ubFails.length ? ubFails.join(', ') : `${reps.length} reports` },
    { name: 'Envelope: every split totals 100% and every dollar', ok: envFails.length === 0, detail: envFails.length ? envFails.slice(0, 3).join('; ') : `${allocs.length} splits` },
    { name: 'No envelope split twice; book flows = report splits', ok: dupFree && perWeekOk, detail: `${splitIds.length} envelopes; Don ${$(bookFlow('don_personal_share'))} = ${$(repFlow('personal'))}, family ${$(bookFlow('treasury_allocation'))} = ${$(repFlow('treasury'))}, reserve ${$(bookFlow('reserve_allocation'))} = ${$(repFlow('reserve'))}` },
    { name: 'Every week has a report (the envelope is never skipped)', ok: weeks.every((w) => w.week < 2 || !!repOf(w.week)), detail: `${reps.length} reports for ${weeks.length} weeks` },
  ];
  const shortfalls = reps.flatMap((r) => r.crews.flatMap((c) => c.members.filter((m) => m.truth)));
  const grievances = moneyGrievances(s);
  const story = grievances.find((g) => g.stage >= 1 || g.status !== 'open') ?? grievances[0];
  const storyEvents = [...new Set((s.director?.hist ?? []).map((h) => h[1]).filter((x) => x.startsWith('tr_')))];
  const altRec = reps.filter((r) => r.rec.personal !== t.policy.personal || r.rec.reserve !== t.policy.reserve);
  const demos: CheckLine[] = [
    { name: '1. Actual business income and expenses', ok: sum((w) => w.bizIn) > 0 && sum((w) => w.bizCost) > 0, detail: `${$(sum((w) => w.bizIn))} business income; ${$(sum((w) => w.bizCost))} business and running costs (ledger lines)` },
    { name: '2. Crew-level contributions', ok: reps.every((r) => r.crews.length >= 3) && rows.every((r) => (r.flows.crew_contribution ?? 0) > 0), detail: `${reps[reps.length - 1].crews.length} crews; ${$(sum((w) => w.paid))} paid of ${$(sum((w) => w.due))} due over the year` },
    { name: '3. Capo retention and distributions', ok: sum((w) => w.kept) > 0 && books.some((b) => b.x.some((x) => x[3] === 'capo_distribution' && x[0].startsWith('wealth:') && x[1].startsWith('wealth:'))), detail: `capos kept ${$(sum((w) => w.kept))} under their contracts and paid their men their end out of it` },
    { name: '4. Underboss reconciliation', ok: ubFails.length === 0 && sum((w) => w.ubShare) > 0, detail: `his authorized share ${$(sum((w) => w.ubShare))}; ${reps.filter((r) => r.issues.some((i) => i.kind === 'late')).length} weeks with part of the count late` },
    { name: '5. A weekly envelope delivered to the Don', ok: t.stats.audiences > 0 && t.stats.quiet > 0 && reps.every((r) => r.presented > 0 || r.collected === 0), detail: `${$(sum((w) => w.presented))} in ${reps.length} envelopes: ${t.stats.audiences} audiences, ${t.stats.quiet} quiet weeks by the standing split` },
    { name: '6. Don-controlled personal / treasury / reserve allocation', ok: allocs.some((r) => r.alloc!.by === 'custom') && allocs.some((r) => r.alloc!.by === 'his') && allocs.some((r) => r.alloc!.by === 'quiet'), detail: `${allocs.filter((r) => r.alloc!.by === 'custom').length} split by hand, ${allocs.filter((r) => r.alloc!.by === 'his').length} his advice, ${allocs.filter((r) => r.alloc!.by === 'policy').length} usual split in the audience, ${allocs.filter((r) => r.alloc!.by === 'quiet').length} standing split; Don ${$(repFlow('personal'))}, family ${$(repFlow('treasury'))}, reserve ${$(repFlow('reserve'))}` },
    { name: '7. A genuine financial shortfall', ok: shortfalls.some((m) => m.truth === 'bad_week' || m.truth === 'default'), detail: `${shortfalls.length} shortfalls; true reasons: ${[...new Set(shortfalls.map((m) => m.truth))].join(', ')}` },
    { name: '8. A disputed assessment', ok: t.disputes.length > 0, detail: t.disputes.map((d) => `wk ${d.week} ${s.characters[d.capoId]?.lastName ?? '?'}: ${d.status}${d.valid ? ' (he was right)' : ''}`).join('; ') },
    { name: '9. The underboss recommending an alternative split', ok: altRec.length > 0, detail: `${altRec.length} weeks; e.g. wk ${altRec[altRec.length - 1]?.week}: ${altRec.length ? `${altRec[altRec.length - 1].rec.personal / 100}/${altRec[altRec.length - 1].rec.treasury / 100}/${altRec[altRec.length - 1].rec.reserve / 100} — ${altRec[altRec.length - 1].recWhy[0] ?? ''}` : ''}` },
    { name: '10. A financial grievance that becomes a persistent storyline', ok: !!story && (story.stage >= 1 || story.status !== 'open' || s.week - story.week >= 8), detail: story ? `${s.characters[story.charId]?.firstName} ${s.characters[story.charId]?.lastName}: "${story.reasons.map((r) => r.label).join('; ')}" since wk ${story.week}, stage ${story.stage} (${story.status}${story.resolution ? `: ${story.resolution}` : ''}); story events shown: ${storyEvents.join(', ')}` : 'none' },
    { name: '11. Correct personal and organizational balances', ok: checks.slice(0, 5).every((c) => c.ok) && purseRows.every((r) => r.wealth >= 0), detail: `treasury ${$(s.money)}, Don's own ${$(t.acct.personal)}, reserve ${$(t.acct.reserve)}; ${Object.keys(t.purse ?? {}).length} men's purses, total ${$(Object.keys(t.purse ?? {}).reduce((a, id) => a + (s.characters[id]?.wealth ?? 0), 0))}` },
    { name: '12. Save/load continuity', ok: saveOk, detail: saveDetail },
    { name: '13. No duplicate distributions', ok: checks[5].ok, detail: checks[5].detail },
    { name: '14. Independent rival-family financial updates', ok: rivalMoves.length >= 3 && rivalMoves.every((m) => (m.b.last?.week ?? 0) >= s.week - 2) && rivalMoves.some((m) => m.after !== m.before), detail: rivalMoves.map((m) => `${m.id} ${$(m.before)}→${$(m.after)} (reserve ${$(m.b.reserve)}, boss ${$(m.b.personal)}${m.b.insolvent ? ', INSOLVENT' : ''}${m.b.fragments ? `, ${m.b.fragments} split off` : ''})`).join('; ') },
  ];
  const ubc = t.ub.id ? s.characters[t.ub.id] : undefined;
  const ub = ubc ? (() => { const p = ubProfile(s, ubc); return `${ubc.firstName} ${ubc.lastName} (${p.type}; skill ${p.financialSkill}, honesty ${p.honesty}, ambition ${p.ambition}, loyalty ${p.loyalty}; standing ${p.reputation}; ${$(p.wealth)}; goal: ${p.goal}; helped ${p.helped.length} men, ${p.helped.reduce((a, h) => a + h[1].unknownToDon, 0)} favors the Don never heard of)`; })() : 'none';
  return {
    weeks, checks, demos, ub,
    totals: { bizIn: sum((w) => w.bizIn), bizCost: sum((w) => w.bizCost), due: sum((w) => w.due), paid: sum((w) => w.paid), kept: sum((w) => w.kept), ubShare: sum((w) => w.ubShare), presented: sum((w) => w.presented), personal: repFlow('personal'), treasury: repFlow('treasury'), reserve: repFlow('reserve') },
  };
}
