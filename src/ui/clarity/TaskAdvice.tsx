import { taskAdvice } from '../../engine/advice';
import { TASKS } from '../../engine/council';
import type { CouncilTask, GameState, Seat } from '../../engine/types';
import { useOrders } from '../components/Orders';

/** Under a council seat: which task is most pressing now, and why; one click to switch. */
export function TaskAdvice({ s, seat }: { s: GameState; seat: Seat }) {
  const { orders, queue } = useOrders();
  const list = taskAdvice(s, seat);
  const cur = s.council[seat].task;
  const pending = orders.find((o) => o.kind === 'councilTask' && o.seat === seat);
  const curWhy = list.find((t) => t.task === cur);
  const top = list[0];
  const switchTo = (t: CouncilTask) => queue({ kind: 'councilTask', seat, task: t, target: TASKS[t].targeted ? (s.council[seat].target ?? s.rivals.find((r) => r.kind === 'mob')?.id) : undefined });
  return (
    <div className="mt-1 text-[11px] leading-snug" data-testid="task-advice">
      {curWhy && <div className="text-stone-500"><span className="text-stone-400">Now:</span> {curWhy.why}</div>}
      {top && top.task !== cur && top.urgency >= (curWhy?.urgency ?? 0) + 15 && !pending && (
        <div className="mt-0.5 text-amber-200">
          Better now: <span className="font-semibold">{TASKS[top.task].name}</span> — {top.why}{' '}
          <button type="button" className="text-gold-300 underline" onClick={() => switchTo(top.task)}>switch</button>
        </div>
      )}
    </div>
  );
}
