import { useMemo, useState } from 'react';
import { crewBoard } from '../../engine/crewBoard';
import { mensMoney } from '../../engine/mensMoney';
import type { GameState, PlayerAction } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { sameOrder } from '../verbs';
import { useShell } from './context';

/**
 * Always in sight: how many of your men are not earning (or are broke), and one tap to fix them.
 * The chip opens a short list (each man, why, the one fix) with "Fix all" — one confirm, real orders.
 * Hidden when everyone is earning and nobody is broke.
 */
export function EarnChip({ s }: { s: GameState }) {
  const { orders, queue } = useOrders();
  const { go } = useShell();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const board = crewBoard(s).rows.filter((r) => (r.status === 'needs' || r.status === 'starving') && r.assign);
    const broke = mensMoney(s).rows.filter((r) => r.level === 'broke' && r.need.fix && !board.some((b) => b.c.id === r.c.id));
    return [
      ...board.map((r) => ({ id: r.c.id, name: `${r.c.firstName} ${r.c.lastName}`, why: r.status === 'starving' ? 'starving: no work' : 'no work', fix: r.assign!.label, action: r.assign!.action })),
      ...broke.map((r) => ({ id: r.c.id, name: `${r.c.firstName} ${r.c.lastName}`, why: 'broke', fix: r.need.fix!.label, action: r.need.fix!.action as PlayerAction })),
    ];
  }, [s]);
  const todo = rows.filter((r) => !orders.some((o) => sameOrder(o, r.action)));
  if (!rows.length) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} data-testid="earn-chip" aria-expanded={open}
        title="Men not earning or broke: tap to see why and fix them"
        className={`h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap ${todo.length ? 'border-amber-500/70 text-amber-300 hover:border-amber-300' : 'border-emerald-600/60 text-emerald-300'}`}>
        $ {todo.length ? `${todo.length} not earning` : 'all fixed'}
      </button>
      {open && (
        <div className="absolute right-0 z-[60] mt-1 w-[min(92vw,380px)] rounded-md border border-noir-600 bg-noir-900 p-2 text-xs shadow-xl" data-testid="earn-pop">
          <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">Men not earning</div>
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {rows.map((r) => {
              const q = orders.some((o) => sameOrder(o, r.action));
              return (
                <li key={r.id + r.why} className="flex items-center gap-2" data-testid="earn-row">
                  <div className="min-w-0 flex-1"><span className="text-stone-200">{r.name}</span> <span className="text-stone-500">· {r.why}</span></div>
                  <button type="button" className="btn-secondary shrink-0 text-[11px]" disabled={q} onClick={() => queue(r.action, true)} data-testid="earn-fix">{q ? 'Ordered' : r.fix}</button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {todo.length > 1 && <button type="button" className="btn-primary text-xs" onClick={() => { for (const r of todo) queue(r.action, true); }} data-testid="earn-fix-all">Fix all {todo.length}</button>}
            <button type="button" className="btn-secondary text-xs" onClick={() => { setOpen(false); go('borgata.eat'); }} data-testid="earn-board">Who is earning ▸</button>
          </div>
        </div>
      )}
    </div>
  );
}
