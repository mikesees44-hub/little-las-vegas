import { useMemo } from 'react';
import { moneyStrip } from '../../engine/fastFix';
import type { GameState } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { fmt$ } from '../format';
import { useShell } from '../shell/context';
import { sameOrder } from '../verbs';

const sgn = (n: number) => `${n >= 0 ? '+' : '−'}${fmt$(Math.abs(n))}`;

/**
 * MONEY FIRST (the top of the Desk): this week's expected net and last week's actual, the three biggest
 * drains each with its one fix (an order through the normal queue, or the screen where it is changed),
 * and the top earner. Read off engine/fastFix.ts moneyStrip (money.ts, crewBoard, invest).
 */
export function MoneyStrip({ s }: { s: GameState }) {
  const { orders, queue } = useOrders();
  const { go } = useShell();
  const m = useMemo(() => moneyStrip(s, orders), [s, orders]);
  return (
    <div className="llv-paper llv-d-money mt-1.5 rounded-md border border-noir-700 px-2 py-1.5 text-[11px]" data-testid="desk-money-strip">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-stone-400">This week, about <b className={`tabular-nums ${m.expected >= 0 ? 'text-emerald-300' : 'text-red-300'}`} data-testid="money-expected">{sgn(m.expected)}</b></span>
        {m.lastNet !== undefined && <span className="text-stone-500">last week <b className={`tabular-nums ${m.lastNet >= 0 ? 'text-emerald-400/90' : 'text-red-400/90'}`} data-testid="money-last">{sgn(m.lastNet)}</b></span>}
        {m.top && <span className="text-stone-500" data-testid="money-top">top earner <span className="text-stone-200">{m.top.name}</span> <span className="tabular-nums text-emerald-300">{fmt$(m.top.amount)}</span></span>}
        <button type="button" className="btn-quiet ml-auto text-[10px]" onClick={() => go('holdings.money')} data-testid="money-strip-open">Money ▸</button>
      </div>
      {m.drains.length > 0 && (
        <ul className="mt-1 grid gap-1 sm:grid-cols-3">
          {m.drains.map((d) => {
            const q = !!d.action && orders.some((o) => sameOrder(o, d.action!));
            return (
              <li key={d.key} className="flex min-w-0 items-center gap-1.5 rounded border border-noir-800 bg-noir-900/50 px-1.5 py-1" data-testid="money-drain" title={`${d.label}: ${d.why}`}>
                <span className="min-w-0 flex-1 truncate"><span className="text-amber-200">{d.label}</span>{d.amount ? <span className="tabular-nums text-red-300"> −{fmt$(d.amount)}</span> : null}</span>
                <button type="button" className="btn-secondary btn-sm shrink-0 max-w-[55%] truncate text-[10px]" disabled={q}
                  onClick={() => (d.action ? queue(d.action) : d.route ? go(d.route) : undefined)} title={d.fix} data-testid="money-drain-fix">
                  {q ? 'Ordered' : d.fix}{!d.action && d.route ? ' ▸' : ''}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
