import { createContext, useContext } from 'react';
import { previewAction, queuedCost } from '../../engine/actions';
import type { GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import { Chips } from './Chips';

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
      {why && <div className="text-[11px] text-red-400 mt-1">{why}</div>}
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
