import { useOpenBook } from '../book/TheBook';
import { formatDate } from '../../engine/calendar';
import { sumLines } from '../../engine/ledger';
import type { GameState, ReportLine, Stat, WeeklyReport } from '../../engine/types';
import { fmt$, signed, STAT_LABEL } from '../format';
import { Modal } from './Modal';
import { useState } from 'react';
import { weekBrief } from '../../engine/weekSummary';
import { useSheet } from './People';

const STATS: Stat[] = ['money', 'respect', 'heat.local', 'heat.family', 'heat.federal'];

function valueOf(r: WeeklyReport['start'], st: Stat): number {
  if (st === 'money') return r.money;
  if (st === 'respect') return r.respect;
  return r.heat[st.slice(5) as 'local' | 'family' | 'federal'];
}

/** What the Family and the boss's pocket each gained over these weeks (from the week's books). */
function potsGained(s: GameState | undefined, reports: WeeklyReport[]): { family: number; pocket: number } | undefined {
  const books = s?.tribute?.books ?? [];
  const a = books.find((b) => b.week === reports[0].week);
  const z = books.find((b) => b.week === reports[reports.length - 1].week);
  if (!a || !z) return undefined;
  const fam = (x: Record<string, number>) => (x.treasury ?? 0) + (x.reserve ?? 0);
  return { family: Math.round(fam(z.end) - fam(a.start)), pocket: Math.round((z.end.personal ?? 0) - (a.start.personal ?? 0)) };
}

const sg = (n: number) => `${n >= 0 ? '+' : '−'}${fmt$(Math.abs(n))}`;

export function ReportModal({ s, reports, onClose }: { s?: GameState; reports: WeeklyReport[]; onClose: () => void }) {
  const pots = potsGained(s, reports);
  const first = reports[0];
  const last = reports[reports.length - 1];
  const lines: (ReportLine & { week: number })[] = reports.flatMap((r) => r.lines.map((l) => ({ ...l, week: r.week })));
  const sums = sumLines(lines);
  const log = reports.flatMap((r) => r.log.map((t) => ({ week: r.week, t })));
  const motion = reports.flatMap((r) => (r.motion ?? []).map((t) => ({ week: r.week, t })));
  const evenings = reports.flatMap((r) => (r.rounds ?? []).map((t) => ({ week: r.week, t })));
  const lts = reports.flatMap((r) => (r.lieutenants ?? []).map((t) => ({ week: r.week, t })));
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
            {pots && <div className="mt-1 text-sm text-stone-200 tabular-nums" data-testid="report-pots">{reports.length > 1 ? 'These weeks' : 'This week'}: <span className={pots.family >= 0 ? 'text-emerald-300' : 'text-red-300'}>{sg(pots.family)}</span> to the Family, <span className={pots.pocket >= 0 ? 'text-emerald-300' : 'text-red-300'}>{sg(pots.pocket)}</span> to your pocket</div>}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <ReportBookLink onClose={onClose} />
            <button className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        {s && <WeekInBrief s={s} reports={reports} />}

        <details className="mt-4 group" data-testid="report-ledger" open={!s}>
        <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.25em] text-stone-500 hover:text-gold-300">The full ledger <span className="normal-case tracking-normal text-gold-400 group-open:hidden">▸ open</span></summary>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
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

        {evenings.length > 0 && (
          <>
            <h3 className="panel-title mt-5">Your rounds</h3>
            <ul className="mt-2 space-y-1 text-sm italic text-stone-300" data-testid="report-rounds">
              {evenings.map((l, i) => <li key={i} className="border-l-2 border-gold-600/50 pl-2">{reports.length > 1 && <span className="not-italic text-stone-600 mr-1">wk {l.week}</span>}{l.t}</li>)}
            </ul>
          </>
        )}
        {lts.length > 0 && (
          <>
            <h3 className="panel-title mt-5">Your underboss &amp; consigliere</h3>
            <ul className="mt-2 space-y-1 text-sm text-stone-300" data-testid="report-lieutenants">
              {lts.map((l, i) => <li key={i} className="border-l-2 border-sky-700/60 pl-2">{reports.length > 1 && <span className="text-stone-600 mr-1">wk {l.week}</span>}{l.t}</li>)}
            </ul>
          </>
        )}
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
        </details>
      </div>
    </Modal>
  );
}

/** THE WEEK IN BRIEF (engine/weekSummary.ts): three lines, what was handled for you, how your people grew. */
function WeekInBrief({ s, reports }: { s: GameState; reports: WeeklyReport[] }) {
  const b = weekBrief(s, reports);
  const sheet = useSheet();
  const [all, setAll] = useState(false);
  const shown = all ? b.handled : b.handled.slice(0, 6);
  return (
    <section className="mt-3 rounded-md border border-gold-600/40 bg-noir-800/60 p-3" data-testid="week-brief">
      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">The week in brief</div>
      <ul className="mt-1 space-y-0.5 text-sm text-stone-200">{b.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {b.handled.length > 0 && (
        <div className="mt-2" data-testid="brief-handled">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Handled for you ({b.handled.length})</div>
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {shown.map((h, i) => (
              <li key={i} className={`border-l-2 pl-2 ${h.tone === 'good' ? 'border-emerald-700/70 text-stone-300' : h.tone === 'bad' ? 'border-red-700/70 text-red-200' : 'border-noir-600 text-stone-400'}`}>
                <span className="text-stone-500">{h.who}:</span> {h.text}
                {h.byId && <button type="button" className="ml-1 text-[11px] text-gold-400 hover:text-gold-300" onClick={() => sheet.open(h.byId!)}>why?</button>}
              </li>
            ))}
          </ul>
          {b.handled.length > 6 && <button type="button" className="mt-0.5 text-[11px] text-gold-400 hover:text-gold-300" onClick={() => setAll((x) => !x)}>{all ? 'show fewer' : `show all ${b.handled.length} ▾`}</button>}
        </div>
      )}
      {b.grew.lines.length > 0 && (
        <div className="mt-2" data-testid="brief-grew">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Your people grew</div>
          <ul className="mt-1 space-y-0.5 text-[12px] text-emerald-200/90">{b.grew.lines.map((g) => <li key={g.id}>{g.text}</li>)}</ul>
          {b.grew.more > 0 && <div className="text-[11px] text-stone-500">+{b.grew.more} more</div>}
        </div>
      )}
    </section>
  );
}

/** Everything in this report, and the rest of the week, is in the Book. */
function ReportBookLink({ onClose }: { onClose: () => void }) {
  const open = useOpenBook();
  return <button type="button" className="btn-ghost text-gold-300" onClick={() => { onClose(); open(); }} data-testid="report-book">See all in Your File →</button>;
}
