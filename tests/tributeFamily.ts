import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newBusiness } from '../src/engine/business';
import { capos, crew, makeCharacter } from '../src/engine/characters';
import { tidyRegimes } from '../src/engine/hierarchy';
import { addOpinion } from '../src/engine/relations';
import { rand } from '../src/engine/rng';
import { ensureTribute, houseCash, type TransferCat } from '../src/engine/tributeState';
import type { BusinessKind, GameState, PlayerChoices, WeeklyReport } from '../src/engine/types';

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
  // This Don holds the audience himself every Monday.
  ensureTribute(s).policy.auto = false;
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

/** Play the 52 weeks, keeping a row per week for the reconciliation report. */
export function play52(seed = 'tribute-52', weeks = 52): { s: GameState; rows: WeekRow[]; mid?: GameState } {
  let s = requiredFamily(seed);
  const rows: WeekRow[] = [];
  let mid: GameState | undefined;
  for (let w = 0; w < weeks; w++) {
    const r = advanceWeek(s, donChoices(s, w));
    s = r.state;
    const b = s.tribute!.books[s.tribute!.books.length - 1];
    const flows = {} as Record<TransferCat, number>;
    for (const x of b.x) flows[x[3]] = (flows[x[3]] ?? 0) + x[2];
    rows.push({ week: r.report.week, report: r.report, accounts: b.end, flows, houseCash: houseCash(s) });
    if (w === 25) mid = JSON.parse(JSON.stringify(s));
  }
  return { s, rows, mid };
}
