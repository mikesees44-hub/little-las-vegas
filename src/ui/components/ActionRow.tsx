import { useState } from 'react';
import { previewAction, queuedMoney } from '../../engine/actions';
import { targetOf } from '../../engine/deals';
import type { GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import { sameOrder, verbOf } from '../verbs';
import { ActionCard, useOrders } from './Orders';

/**
 * The universal action row: one order folded to a line — what it is, what it
 * costs and from which pot, the odds — and its button. Tap the line for the
 * full card (every effect, the odds' reasons, "why?", the adviser). When it
 * can't be given now, the reason is on the line in plain words. Giving it goes
 * through the same "Are you sure?" → "Yes, boss." as everywhere else.
 */
export function ActionRow({ s, action, label, hostile, open: startOpen }: { s: GameState; action: PlayerAction; label?: string; hostile?: boolean; open?: boolean }) {
  const { orders, queue } = useOrders();
  const [open, setOpen] = useState(!!startOpen);
  const p = previewAction(s, action);
  const others = orders.filter((o) => !sameOrder(o, action));
  const q = queuedMoney(s, others);
  const pocket = p.pot === 'pocket';
  const short = pocket ? Math.max(0, p.cost - Math.max(0, q.pocketLeft)) : 0;
  const broke = p.disabledReason || !(p.cost > 0) ? undefined
    : pocket ? (short > q.familyLeft ? 'Not enough money after this week\'s orders' : undefined)
    : p.cost > q.familyLeft ? 'Not enough Family money after this week\'s orders' : undefined;
  const deal = action.kind === 'econ' && action.op.type === 'deal' ? undefined : targetOf(action);
  const why = p.disabledReason ?? broke;
  const queued = orders.some((o) => sameOrder(o, action));
  // A purchase across the desk, or a pocket that needs Family money: the full card handles those.
  const needsCard = !!deal || short > 0;
  const odds = p.odds ?? p.acceptance;
  const pct = odds ? Math.round(odds.chance * 100) : undefined;
  if (open) {
    return (
      <div className="sm:col-span-2" data-testid="action-row-open">
        <ActionCard s={s} action={action} label={label} />
        <button type="button" className="mt-0.5 text-[11px] text-stone-500 hover:text-gold-300" onClick={() => setOpen(false)}>fold ▴</button>
      </div>
    );
  }
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 ${queued ? 'border-gold-400 bg-gold-500/10' : hostile ? 'border-blood-500/40 bg-noir-800/60' : 'border-noir-700 bg-noir-800/60'}`} data-testid="action-row">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(true)} title="Everything about this order" aria-expanded={false}>
        <span className={`block truncate text-[13px] font-semibold ${why ? 'text-stone-400' : hostile ? 'text-red-200' : 'text-stone-100'}`}>{label ?? p.title}</span>
        <span className="block truncate text-[11px] text-stone-500">
          {why ? <span className="text-red-300/90" data-testid="action-row-why">{why}</span> : <>
            {p.cost > 0 && <span className={pocket ? 'text-amber-300' : 'text-gold-400'}>{fmt$(p.cost)} {pocket ? 'pocket' : 'Family'}</span>}
            {p.cost > 0 && pct !== undefined && ' · '}
            {pct !== undefined && <span className={pct >= 60 ? 'text-emerald-300' : pct >= 35 ? 'text-amber-300' : 'text-red-300'}>{p.odds ? 'success' : 'yes'} {pct}%</span>}
            {!(p.cost > 0) && pct === undefined && (p.detail ? p.detail.slice(0, 90) : 'details ▸')}
          </>}
        </span>
      </button>
      <button type="button" disabled={!!why || queued}
        className={`shrink-0 text-xs py-1 ${queued || why ? 'btn-ghost' : 'btn-gold'}`}
        onClick={() => (needsCard ? setOpen(true) : queue(action))} data-testid="action-row-go">
        {queued ? verbOf(action, p).done : needsCard ? 'More ▸' : verbOf(action, p).verb}
      </button>
    </div>
  );
}
