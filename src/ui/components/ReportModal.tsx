import { formatDate } from '../../engine/calendar';
import { sumLines } from '../../engine/ledger';
import type { ReportLine, Stat, WeeklyReport } from '../../engine/types';
import { fmt$, signed, STAT_LABEL } from '../format';
import { Modal } from './Modal';

const STATS: Stat[] = ['money', 'respect', 'heat.local', 'heat.family', 'heat.federal'];

function valueOf(r: WeeklyReport['start'], st: Stat): number {
  if (st === 'money') return r.money;
  if (st === 'respect') return r.respect;
  return r.heat[st.slice(5) as 'local' | 'family' | 'federal'];
}

export function ReportModal({ reports, onClose }: { reports: WeeklyReport[]; onClose: () => void }) {
  const first = reports[0];
  const last = reports[reports.length - 1];
  const lines: (ReportLine & { week: number })[] = reports.flatMap((r) => r.lines.map((l) => ({ ...l, week: r.week })));
  const sums = sumLines(lines);
  const log = reports.flatMap((r) => r.log.map((t) => ({ week: r.week, t })));
  const motion = reports.flatMap((r) => (r.motion ?? []).map((t) => ({ week: r.week, t })));
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{reports.length > 1 ? `${reports.length} weeks` : 'Weekly report'}</div>
            <h2 className="font-display text-2xl text-gold-400">
              {formatDate(first.date)}
              {reports.length > 1 ? ` – ${formatDate(last.date)}` : ''}
            </h2>
            <div className="text-xs text-stone-400">
              {first.seasonLabel} ×{first.multiplier} · gross earnings {fmt$(reports.reduce((a, r) => a + r.grossIncome, 0))}
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {STATS.map((st) => {
            const a = valueOf(first.start, st);
            const b = valueOf(last.end, st);
            const d = b - a;
            const good = st === 'money' || st === 'respect' ? d >= 0 : d <= 0;
            return (
              <div key={st} className="rounded-md bg-noir-800 border border-noir-700 px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-widest text-stone-500">{STAT_LABEL[st]}</div>
                <div className="text-sm tabular-nums text-stone-300">
                  {st === 'money' ? fmt$(a) : a} → {st === 'money' ? fmt$(b) : b}
                </div>
                <div className={`text-sm font-semibold tabular-nums ${d === 0 ? 'text-stone-500' : good ? 'text-emerald-400' : 'text-red-400'}`}>
                  {st === 'money' ? (d >= 0 ? '+' : '') + fmt$(d) : signed(d)}
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="panel-title mt-5">Why it changed</h3>
        {STATS.map((st) => {
          const ls = lines.filter((l) => l.stat === st);
          if (!ls.length) return null;
          return (
            <div key={st} className="mt-3">
              <div className="flex justify-between text-xs uppercase tracking-widest text-stone-500 border-b border-noir-700 pb-1">
                <span>{STAT_LABEL[st]}</span>
                <span className="tabular-nums">{st === 'money' ? fmt$(sums[st]) : signed(sums[st])}</span>
              </div>
              <ul className="divide-y divide-noir-800">
                {ls.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 py-1 text-sm">
                    <span className="text-stone-300 min-w-0 break-words">
                      {reports.length > 1 && <span className="text-stone-600 mr-1">wk {l.week}</span>}
                      {l.label}
                      {l.requested !== undefined && <span className="text-stone-500"> (capped from {signed(l.requested)})</span>}
                    </span>
                    <span className={`tabular-nums shrink-0 ${(st === 'money' || st === 'respect' ? l.amount > 0 : l.amount < 0) ? 'text-emerald-400' : l.amount === 0 ? 'text-stone-500' : 'text-red-400'}`}>
                      {st === 'money' ? (l.amount >= 0 ? '+' : '') + fmt$(l.amount) : signed(l.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {motion.length > 0 && (
          <>
            <h3 className="panel-title mt-5">In motion</h3>
            <p className="text-xs text-stone-500">Routine business your people handled the usual way, without bothering you.</p>
            <ul className="mt-2 space-y-1 text-sm text-stone-400" data-testid="report-motion">
              {motion.map((l, i) => (
                <li key={i} className="border-l-2 border-noir-600 pl-2">
                  {reports.length > 1 && <span className="text-stone-600 mr-1">wk {l.week}</span>}
                  {l.t}
                </li>
              ))}
            </ul>
          </>
        )}

        {log.length > 0 && (
          <>
            <h3 className="panel-title mt-5">On the island</h3>
            <ul className="mt-2 space-y-1 text-sm text-stone-300">
              {log.map((l, i) => (
                <li key={i} className="border-l-2 border-gold-600/40 pl-2">
                  {reports.length > 1 && <span className="text-stone-600 mr-1">wk {l.week}</span>}
                  {l.t}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
