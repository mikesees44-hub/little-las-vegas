import { seenWealth } from '../../engine/crewFinance';
import { getSettings } from '../settings';
import { earnerLines } from '../../engine/earners';
import { useMemo, useState } from 'react';
import { earningsBoard, FLAG_LABEL, upToCollected, type BoardRow, type PurseFlag } from '../../engine/crewPurse';
import { latestReport } from '../../engine/tribute';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { CharLink, Face } from '../components/People';

/**
 * THE FAMILY'S EARNINGS: everyone in the family on one sortable board — what
 * he earned this week, kicked up, kept, his 8-week kick-up trend, his own
 * money, and flags (came up short, rising star, in debt, rich, lives above
 * his envelope). Two small charts: top earners this week and kick-up by crew.
 * Every figure is the purse record of the week (crewPurse.ts), which is the
 * report and the journal; the totals line reconciles with the envelope.
 */

type SortKey = 'name' | 'rank' | 'crew' | 'earned' | 'up' | 'kept' | 'wealth';
const RANK_ORDER: Record<string, number> = { underboss: 0, consigliere: 1, capo: 2, soldier: 3, associate: 4 };
const FLAG_TONE: Record<PurseFlag, string> = { short: 'text-red-300 border-red-500/40', rising: 'text-emerald-300 border-emerald-500/40', debt: 'text-amber-300 border-amber-500/40', rich: 'text-gold-300 border-gold-500/40', above: 'text-fuchsia-300 border-fuchsia-500/40' };

export function Sparkline({ values, w = 64, h = 18, label }: { values: number[]; w?: number; h?: number; label?: string }) {
  if (values.length < 2) return <span className="text-[10px] text-stone-600">—</span>;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label ?? `trend, last ${fmt$(last)}`} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.4} className="text-gold-400" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(values.length - 1) * step} cy={h - 2 - (last / max) * (h - 4)} r={1.8} className="fill-gold-300" />
    </svg>
  );
}

/** Horizontal bars, labelled, in the game's gold; readable at 400px. */
function Bars({ title, rows, testid }: { title: string; rows: { key: string; label: string; v: number; sub?: string }[]; testid: string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <figure className="min-w-0 rounded border border-noir-700 bg-noir-900/60 p-2" data-testid={testid}>
      <figcaption className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">{title}</figcaption>
      {rows.length === 0 ? <div className="text-[11px] text-stone-500">Nothing yet.</div> : (
        <svg width="100%" viewBox={`0 0 300 ${rows.length * 18}`} role="img" aria-label={title} className="block">
          {rows.map((r, i) => {
            const bw = Math.max(1, (r.v / max) * 110);
            return (
              <g key={r.key} transform={`translate(0 ${i * 18})`}>
                <text x={0} y={12} className="fill-stone-300" fontSize={10}>{r.label.length > 18 ? `${r.label.slice(0, 17)}…` : r.label}</text>
                <rect x={100} y={3} width={bw} height={11} rx={2} className="fill-gold-500/80" />
                <text x={104 + bw} y={12} className="fill-stone-200" fontSize={10}>{fmt$(r.v)}{r.sub ? ` ${r.sub}` : ''}</text>
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}

export function EarningsBoard({ s }: { s: GameState }) {
  const [sort, setSort] = useState<SortKey>('up');
  const [desc, setDesc] = useState(true);
  const [crewF, setCrewF] = useState<string>('all');
  const board = useMemo(() => earningsBoard(s), [s]);
  const rep = latestReport(s);
  const earners = earnerLines(s);
  const name = (id?: string) => (id ? `${s.characters[id]?.firstName ?? '?'} ${s.characters[id]?.lastName ?? ''}` : '');
  const crewName = (r: BoardRow) => (r.rank === 'underboss' || r.rank === 'consigliere' ? 'the administration' : r.crewId ? `${s.characters[r.crewId]?.lastName ?? '?'} crew` : 'no crew');
  const rows = board.rows
    .filter((r) => crewF === 'all' || (crewF === 'admin' ? r.rank === 'underboss' || r.rank === 'consigliere' : r.crewId === crewF && r.rank !== 'underboss' && r.rank !== 'consigliere'))
    .slice()
    .sort((a, b) => {
      const v = (r: BoardRow): number | string => sort === 'name' ? name(r.id) : sort === 'rank' ? RANK_ORDER[r.rank] ?? 9 : sort === 'crew' ? crewName(r) : r[sort];
      const x = v(a), y = v(b);
      const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
      return desc ? -c : c;
    });
  if (board.week === undefined) return <div className="text-sm text-stone-400" data-testid="earnings-board">The first count comes at the end of your first week.</div>;
  const tot = board.rows.reduce((a, r) => ({ earned: a.earned + r.earned, owed: a.owed + r.owed, up: a.up + r.up, short: a.short + r.short, kept: a.kept + r.kept, wealth: a.wealth + r.wealth }), { earned: 0, owed: 0, up: 0, short: 0, kept: 0, wealth: 0 });
  const u = rep && rep.week === board.week ? upToCollected(rep) : undefined;
  const crews = Array.from(new Set(board.rows.filter((r) => r.crewId && r.rank !== 'underboss' && r.rank !== 'consigliere').map((r) => r.crewId!)));
  const top = board.rows.filter((r) => r.earned > 0).sort((a, b) => b.earned - a.earned).slice(0, 8).map((r) => ({ key: r.id, label: name(r.id), v: r.earned, sub: `(${fmt$(r.up)} up)` }));
  const byCrew = crews.map((k) => ({ key: k, label: `${s.characters[k]?.lastName ?? '?'} crew`, v: board.rows.filter((r) => r.crewId === k && r.rank !== 'underboss' && r.rank !== 'consigliere').reduce((a, r) => a + r.up, 0) })).sort((a, b) => b.v - a.v);
  const th = (k: SortKey, label: string, right = false) => (
    <th className={`py-1 ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" className={`uppercase tracking-widest ${sort === k ? 'text-gold-300' : 'hover:text-gold-300'}`} onClick={() => { if (sort === k) setDesc(!desc); else { setSort(k); setDesc(k !== 'name' && k !== 'crew' && k !== 'rank'); } }} data-testid={`sort-${k}`} aria-sort={sort === k ? (desc ? 'descending' : 'ascending') : 'none'}>
        {label}{sort === k ? (desc ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );
  return (
    <div className="space-y-3" data-testid="earnings-board">
      <div className="grid gap-2 sm:grid-cols-2">
        <Bars title={`Top earners, week ${board.week}`} rows={top} testid="chart-top" />
        <Bars title={`Kicked up by crew, week ${board.week}`} rows={byCrew} testid="chart-crews" />
      </div>
      {earners.length > 0 && (
        <ul className="rounded border border-emerald-700/50 bg-emerald-900/10 px-2 py-1.5 text-[11px] text-emerald-200 space-y-0.5" data-testid="earner-lines">
          <li className="text-[10px] uppercase tracking-wider text-stone-500">Steady earners</li>
          {earners.map((x, i) => <li key={i}>★ {x.text}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-stone-500">Show:</span>
        {[['all', 'Everyone'], ...crews.map((k) => [k, `${s.characters[k]?.lastName ?? '?'} crew`]), ['admin', 'Administration']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setCrewF(id)} className={`rounded border px-1.5 py-0.5 ${crewF === id ? 'border-gold-500 text-gold-300' : 'border-noir-600 text-stone-400 hover:text-gold-300'}`}>{label}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[720px]" data-testid="earnings-table">
          <thead className="text-[10px] text-stone-500">
            <tr className="[&>th:first-child]:sticky [&>th:first-child]:left-0 [&>th:first-child]:z-[1] [&>th:first-child]:bg-noir-900">{th('name', 'Man')}{th('up', 'Kicked up', true)}{th('earned', 'Earned', true)}{th('kept', 'Kept', true)}{th('wealth', 'His money', true)}<th className="text-left uppercase tracking-widest pl-2">8 weeks up</th>{th('rank', 'Rank')}{th('crew', 'Crew')}<th className="text-left uppercase tracking-widest pl-2">Flags</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = s.characters[r.id];
              return (
                <tr key={r.id} className="border-t border-noir-800" data-testid="earnings-row">
                  <td className="py-0.5 pr-2 sticky left-0 z-[1] bg-noir-900"><span className="inline-flex items-center gap-1.5">{c && <Face s={s} c={c} size={22} />}<CharLink s={s} id={r.id} /></span></td>
                  <td className="pr-2 text-right tabular-nums text-gold-300">{r.up ? fmt$(r.up) : '—'}{r.short ? <div className="text-[10px] text-red-300">short {fmt$(r.short)}</div> : null}</td>
                  <td className="pr-2 text-right tabular-nums">{r.earned ? fmt$(r.earned) : '—'}</td>
                  <td className="pr-2 text-right tabular-nums">{r.kept ? fmt$(r.kept) : '—'}</td>
                  <td className="pr-2 text-right tabular-nums">{s.characters[r.id] ? seenWealth(s, s.characters[r.id], !!getSettings().devIds) : '—'}{r.debt ? <div className="text-[10px] text-amber-300">owes {fmt$(r.debt)}</div> : null}</td>
                  <td className="pl-2"><Sparkline values={r.trend} label={`${name(r.id)}: kicked up over 8 weeks`} /></td>
                  <td className="pl-2 pr-2 capitalize text-stone-400">{r.rank}</td>
                  <td className="pr-2 text-stone-400">{crewName(r)}</td>
                  <td className="pl-2">{r.flags.map((f) => <span key={f} className={`mr-1 inline-block rounded border px-1 text-[10px] ${FLAG_TONE[f]}`}>{FLAG_LABEL[f]}</span>)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-noir-600 text-stone-200" data-testid="earnings-total">
              <td className="py-1 sticky left-0 bg-noir-900">The whole family ({board.rows.length} men)</td>
              <td className="pr-2 text-right tabular-nums text-gold-300">{fmt$(tot.up)}</td>
              <td className="pr-2 text-right tabular-nums">{fmt$(tot.earned)}</td>
              <td className="pr-2 text-right tabular-nums">{fmt$(tot.kept)}</td>
              <td className="pr-2 text-right tabular-nums">{getSettings().devIds ? fmt$(tot.wealth) : '—'}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
      {u && (
        <p className="text-[11px] text-stone-400 tabular-nums" data-testid="earnings-reconcile">
          The men kicked up {fmt$(u.up)}{u.skim + u.held ? ` − ${fmt$(u.skim + u.held)} the capos did not pass up${u.held ? ` (${fmt$(u.held)} held back, on the books)` : ''}` : ''}{u.late ? ` + ${fmt$(u.late)} late money` : ''}{u.inv ? ` + ${fmt$(u.inv)} investments` : ''}{u.carry ? ` + ${fmt$(u.carry)} from last week's count` : ''} = <b className="text-gold-300">{fmt$(u.collected)}</b> reached the underboss; {fmt$(rep!.presented)} in your envelope.
        </p>
      )}
      <p className="text-[10px] text-stone-500">Earned: what his work brought in. Kicked up: what he paid toward the family (arrears made good included). Kept: what reached his own pocket in the open (his end of his hustle and the corners; a capo's end less what he paid his men; the underboss's share). His money: what he has, after the house, the car, the track and the debts.</p>
    </div>
  );
}
