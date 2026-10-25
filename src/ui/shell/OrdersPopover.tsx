import { useEffect, useRef, useState } from 'react';
import { queuedCost } from '../../engine/actions';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { OrdersTray, useOrders } from '../components/Orders';

/** "☰ 3 orders": this week's orders in a popover instead of an always-on tray. */
export function OrdersButton({ s }: { s: GameState }) {
  const { orders } = useOrders();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  const cost = queuedCost(s, orders);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={`h-8 rounded border px-2 text-xs font-semibold whitespace-nowrap ${orders.length ? 'border-gold-500 text-gold-300 bg-gold-500/10' : 'border-noir-600 text-stone-400'}`} onClick={() => setOpen((o) => !o)} data-testid="orders-button" aria-expanded={open} title="This week's orders">
        ☰ {orders.length}<span className="hidden sm:inline"> order{orders.length === 1 ? '' : 's'}</span>{orders.length > 0 && cost > 0 && <span className="hidden lg:inline text-stone-400 font-normal"> · {fmt$(cost)}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-[1200] w-[min(440px,94vw)] max-h-[70vh] overflow-y-auto" data-testid="orders-popover">
          {orders.length ? <OrdersTray s={s} /> : (
            <div className="panel p-3 text-xs text-stone-400">No orders this week. Every "Order" button on a sheet, a card or a drawer adds one here; they are carried out when you advance.</div>
          )}
        </div>
      )}
    </div>
  );
}
