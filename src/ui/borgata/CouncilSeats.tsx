import { AdviceButton } from '../advice/AdviceButton';
import { crew, displayName, isFree } from '../../engine/characters';
import { holder, SEAT_INFO, SEATS, seatPower, TASKS } from '../../engine/council';
import { successionCandidates } from '../../engine/heir';
import type { CouncilTask, GameState } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { Face } from '../components/People';
import { useClarity } from '../clarity/context';
import { TaskAdvice } from '../clarity/TaskAdvice';
import { MoreButton } from '../sheet/MoreButton';

/**
 * The Borgata › Council: five seats as portraits, CK style. A face opens the
 * man; an empty seat (or "Replace…") opens the candidate picker; the task
 * is one select under each seat. A seat is also the best school an heir
 * has: candidates who sit learn the job.
 */
export function CouncilSeats({ s }: { s: GameState }) {
  const { queue, orders } = useOrders();
  const { openPicker } = useClarity();
  const heirs = new Set(successionCandidates(s).map((c) => c.id));
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="council">
        {SEATS.map((st, i) => {
          const h = holder(s, st);
          const info = SEAT_INFO[st];
          const seat = s.council[st];
          const tasks = (Object.keys(TASKS) as CouncilTask[]).filter((t) => TASKS[t].seat === st);
          const cands = crew(s).filter((c) => isFree(s, c) && !c.specialty && c.rank !== 'associate' && c.id !== h?.id);
          const pendingTask = orders.find((o) => o.kind === 'councilTask' && o.seat === st);
          const task = pendingTask && pendingTask.kind === 'councilTask' ? pendingTask.task : seat.task;
          return (
            <div key={st} className="flex flex-col items-center rounded-md border border-noir-700 bg-noir-800/60 p-2 text-center" data-testid={`seat-${st}`}>
              <div className="text-[10px] uppercase tracking-[0.2em] text-gold-400">{info.name}</div>
              <div className="mt-1" data-tour={`seat-${st}`}>
                {h ? <Face s={s} c={h} size={56} /> : (
                  <button type="button" onClick={() => openPicker({ kind: 'seat', seat: st })} className="flex h-[68px] w-14 items-center justify-center rounded border border-dashed border-gold-600/60 text-gold-300 text-xl hover:bg-gold-500/10" title="Appoint: compare candidates" data-testid={`compare-${st}`}>+</button>
                )}
              </div>
              <div className="mt-0.5 min-h-[2rem] text-xs leading-tight">
                {h ? <><div className="text-stone-100 truncate max-w-[9rem]">{displayName(h).replace(/ ".*" /, ' ')}</div><div className="text-[10px] text-stone-500">{info.skill} {h.attributes[info.skill]} · ×{seatPower(s, st).toFixed(2)}</div></> : <span className="text-stone-500">Vacant</span>}
                {h && heirs.has(h.id) && <div className="text-[10px] text-emerald-300" title="Sitting on the council grooms a successor">learning the chair</div>}
              </div>
              <select className="mt-1 w-full rounded bg-noir-900 border border-noir-600 p-1 text-[11px]" value={task} aria-label={`${info.name} task`} data-tour={i === 0 ? 'seat-task' : undefined}
                onChange={(e) => {
                  const t = e.target.value as CouncilTask;
                  queue({ kind: 'councilTask', seat: st, task: t, target: TASKS[t].targeted ? (seat.target ?? s.rivals.find((r) => r.kind === 'mob')?.id) : undefined });
                }}>
                {tasks.map((t) => <option key={t} value={t}>{TASKS[t].name}</option>)}
              </select>
              {pendingTask && <div className="text-[10px] text-gold-300">ordered for this week</div>}
              {TASKS[task].targeted && (
                <select className="mt-1 w-full rounded bg-noir-900 border border-noir-600 p-1 text-[11px]" value={seat.target ?? ''} onChange={(e) => queue({ kind: 'councilTask', seat: st, task, target: e.target.value })} aria-label={`${info.name} target`}>
                  <option value="">— pick a rival —</option>
                  {s.rivals.filter((r) => r.kind !== 'law').map((r) => <option key={r.id} value={r.id}>{r.shortName}</option>)}
                </select>
              )}
              <div className="mt-1 flex w-full gap-1">
                {cands.length > 0 && <button type="button" className="flex-1 rounded border border-noir-600 px-1 py-0.5 text-[10px] text-stone-300 hover:border-gold-500" onClick={() => openPicker({ kind: 'seat', seat: st })}>{h ? 'Replace…' : `Appoint (${cands.length})…`}</button>}
                {h && <MoreButton id={h.id} category="business" />}
              </div>
              <div className="mt-1 text-center" data-testid={`seat-advice-${st}`}><AdviceButton s={s} subject={{ kind: 'seat', seat: st }} auto={false} label="Who should it be?" /></div>
            </div>
          );
        })}
      </div>
      <details className="rounded-md border border-noir-700 bg-noir-900/50 p-2">
        <summary className="cursor-pointer text-xs text-stone-400">Advice: which task pays best for each seat right now</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{SEATS.map((st) => <div key={st}><div className="text-[11px] text-gold-300">{SEAT_INFO[st].name}: {TASKS[s.council[st].task].text}</div><TaskAdvice s={s} seat={st} /></div>)}</div>
      </details>
    </div>
  );
}
