import { createContext, useContext } from 'react';
import { previewAction, queuedCost } from '../../engine/actions';
import type { Acceptance } from '../../engine/interactions';
import type { GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import { Chips } from './Chips';
import { WhyPanel } from '../clarity/WhyPanel';

/** Orders queued this week, and how to add one. Provided by the App. */
export interface OrdersApi {
  orders: PlayerAction[];
  queue: (a: PlayerAction) => void;
  remove: (i: number) => void;
}

export const OrdersContext = createContext<OrdersApi>({ orders: [], queue: () => {}, remove: () => {} });

export function useOrders(): OrdersApi {
  return useContext(OrdersContext);
}

function same(a: PlayerAction, b: PlayerAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * One order the player can give: title, what it does as named chips, and a
 * button that queues it for this week. Disabled orders show why.
 */
export function ActionCard({ s, action, compact, label }: { s: GameState; action: PlayerAction; compact?: boolean; label?: string }) {
  const { orders, queue } = useOrders();
  const p = previewAction(s, action);
  const budget = s.money - queuedCost(s, orders);
  const queued = orders.some((o) => same(o, action));
  const broke = !p.disabledReason && p.cost > 0 && p.cost > budget ? `Only ${fmt$(budget)} left after this week's orders` : undefined;
  const why = p.disabledReason ?? broke;
  return (
    <div className={`rounded-md border px-3 py-2 ${queued ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/70'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-stone-100 text-sm">{label ?? p.title}</div>
          {!compact && p.detail && <div className="text-xs text-stone-400 mt-0.5">{p.detail}</div>}
        </div>
        <button
          className={queued ? 'btn-ghost text-xs py-1 shrink-0' : 'btn-gold text-xs py-1 shrink-0'}
          disabled={!!why || queued}
          onClick={() => queue(action)}
        >
          {queued ? 'Ordered' : 'Order'}
        </button>
      </div>
      <Chips s={s} effects={p.effects} />
      {p.acceptance && <AcceptanceLine a={p.acceptance} />}
      {p.odds && <AcceptanceLine a={p.odds} prefix="Success" />}
      {p.warning && <div className="text-[11px] text-amber-400 mt-1">⚠ {p.warning}</div>}
      {p.refuseEffects && p.refuseEffects.length > 0 && (
        <div className="mt-1 text-[11px] text-stone-500">If he says no: <Chips s={s} effects={p.refuseEffects} /></div>
      )}
      {why && <div className="text-[11px] text-red-400 mt-1">{why}</div>}
      <WhyPanel s={s} action={action} compact={compact} />
    </div>
  );
}

/** "Will accept: 62%" with the reasons, CK style. */
export function AcceptanceLine({ a, prefix = 'Will accept' }: { a: Acceptance; prefix?: string }) {
  const pct = Math.round(a.chance * 100);
  return (
    <div className="mt-1.5 text-[11px]">
      <span className={`font-semibold ${pct >= 60 ? 'text-emerald-300' : pct >= 35 ? 'text-amber-300' : 'text-red-300'}`}>{prefix}: {pct}%</span>
      <span className="text-stone-500"> — </span>
      {a.reasons.map((r, i) => (
        <span key={i} className={`mr-2 inline-block whitespace-nowrap ${r.label === 'Base' ? 'text-stone-500' : r.value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {r.value > 0 ? '+' : r.value < 0 ? '−' : ''}{Math.abs(r.value)} {r.label}
        </span>
      ))}
    </div>
  );
}

/** The tray of this week's orders, above the tabs. */
export function OrdersTray({ s }: { s: GameState }) {
  const { orders, remove } = useOrders();
  if (!orders.length) return null;
  const cost = queuedCost(s, orders);
  return (
    <div className="panel p-3" data-testid="orders-tray">
      <div className="flex items-baseline justify-between gap-2">
        <div className="panel-title text-base">This week's orders</div>
        <div className="text-xs text-stone-400">
          Committed {fmt$(cost)} · treasury after orders <span className={s.money - cost < 0 ? 'text-red-400' : 'text-gold-300'}>{fmt$(s.money - cost)}</span>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {orders.map((a, i) => {
          const p = previewAction(s, a);
          return (
            <li key={i} className="rounded border border-noir-700 bg-noir-800/60 px-2.5 py-1.5">
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-stone-200">{p.title}</span>
                <button className="text-xs text-stone-500 hover:text-red-400" onClick={() => remove(i)}>cancel ✕</button>
              </div>
              <Chips s={s} effects={p.effects} />
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] text-stone-500">Orders are carried out when you advance the week. Everything they cost shows up by name in the weekly report.</p>
    </div>
  );
}
