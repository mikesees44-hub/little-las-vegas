import { useState } from 'react';
import { repeatLastWeek } from '../../engine/fastFix';
import type { GameState } from '../../engine/types';
import { Modal } from '../components/Modal';
import { useOrders } from '../components/Orders';
import { KeyHint } from '../components/KeyHint';
import { fmt$ } from '../format';
import { useDialogKeys } from '../keys';
import { useLastWeek } from '../plans/lastWeek';

/**
 * "SAME AS LAST WEEK": one button that gives last week's orders again. It lists them first — each still
 * valid one ticked (untick any), the rest with why not (a one-time order, a hit or anything that would
 * kill, jail or hand over a man, no longer possible) — then gives the ticked ones through the normal queue.
 * The boss adjusts afterwards as usual (every order can be cancelled until the week turns).
 */
export function SameAsLastWeek({ s, className, initialOpen, onDone }: { s: GameState; className?: string; /** Tests: open. */ initialOpen?: boolean; onDone?: () => void }) {
  const lw = useLastWeek(s.seed);
  const [open, setOpen] = useState(!!initialOpen);
  if (!lw || lw.week >= s.week || !lw.orders.length) return null;
  return (
    <>
      <button type="button" className={`btn-secondary py-0.5 text-[11px] ${className ?? ''}`} onClick={() => setOpen(true)} data-testid="same-last-week"
        title={`Give week ${lw.week}'s orders again: you see the list first, and untick any`}>↻ Same as last week</button>
      {open && <SameList s={s} week={lw.week} last={lw.orders} onClose={() => setOpen(false)} onDone={onDone} />}
    </>
  );
}

function SameList({ s, week, last, onClose, onDone }: { s: GameState; week: number; last: Parameters<typeof repeatLastWeek>[1]; onClose: () => void; onDone?: () => void }) {
  const { orders, queue } = useOrders();
  const rows = repeatLastWeek(s, last, orders);
  const [off, setOff] = useState<Set<number>>(new Set());
  const okIdx = rows.map((r, i) => (r.ok ? i : -1)).filter((i) => i >= 0);
  const give = okIdx.filter((i) => !off.has(i));
  const toggle = (i: number) => setOff((x) => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const go = () => { for (const i of give) queue(rows[i].action, true); onClose(); onDone?.(); };
  useDialogKeys(true, { count: okIdx.length, pick: (k) => toggle(okIdx[k]), confirm: give.length ? go : undefined, close: onClose });
  const cost = give.reduce((a, i) => a + rows[i].cost, 0);
  return (
    <Modal onClose={onClose}>
      <div className="space-y-2 p-4" data-testid="same-list">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl text-gold-400">Same as week {week}?</h2>
          <button type="button" className="btn-quiet text-xs" onClick={onClose}>Not now <KeyHint k="Esc" /></button>
        </div>
        <p className="text-[12px] text-stone-400">Last week's orders that still make sense, ticked. Untick any; you can change them after as usual.</p>
        <ul className="space-y-1">
          {rows.map((r, i) => {
            const k = okIdx.indexOf(i);
            return (
              <li key={i} className={`flex items-center gap-2 rounded border px-2 py-1 text-[12px] ${r.ok ? 'border-noir-700' : 'border-noir-800 opacity-60'}`} data-testid="same-row" data-ok={r.ok}>
                {r.ok
                  ? <input type="checkbox" checked={!off.has(i)} onChange={() => toggle(i)} aria-label={`Give: ${r.title}`} data-testid="same-tick" />
                  : <span className="w-[13px] text-center text-stone-600" aria-hidden>–</span>}
                <span className="min-w-0 flex-1">
                  <span className={r.ok ? 'text-stone-100' : 'text-stone-400'}>{r.title}</span>
                  <span className="block text-[11px] text-stone-500">
                    {r.ok ? <>{r.cost ? `${fmt$(r.cost)} ${r.pot === 'pocket' ? 'pocket' : 'Family'}` : 'free'}{r.chance !== undefined ? ` · ${Math.round(r.chance * 100)}%` : ''}</> : <span data-testid="same-why">{r.why}</span>}
                  </span>
                </span>
                {r.ok && k < 9 && <KeyHint k={String(k + 1)} />}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-noir-700 pt-2">
          <span className="mr-auto text-[11px] text-stone-500">{give.length ? `${give.length} order${give.length > 1 ? 's' : ''}${cost ? ` · ${fmt$(cost)}` : ''}` : 'Nothing ticked'}</span>
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>Not now</button>
          <button type="button" className="btn-primary text-xs" disabled={!give.length} onClick={go} data-testid="same-give">Give {give.length} order{give.length === 1 ? '' : 's'} <KeyHint k="Enter" /></button>
        </div>
      </div>
    </Modal>
  );
}

/** The list on its own (the advance menu opens it outside its popover). Null when there is no last week. */
export function SameAsLastWeekList({ s, onClose }: { s: GameState; onClose: () => void }) {
  const lw = useLastWeek(s.seed);
  if (!lw || lw.week >= s.week || !lw.orders.length) return null;
  return <SameList s={s} week={lw.week} last={lw.orders} onClose={onClose} />;
}

/** Is there a last week to repeat (the menu item shows only then)? */
export function useHasLastWeek(s: GameState): boolean {
  const lw = useLastWeek(s.seed);
  return !!lw && lw.week < s.week && lw.orders.length > 0;
}
