import type { ReactNode } from 'react';
import { useDialogKeys } from '../keys';
import { KeyHint } from './KeyHint';

/**
 * One confirm that lists every order before they are given ("Give the orders" / "Not now"): Enter gives,
 * Esc is "Not now" (fast7 dialog keys). Used by every "Fix all" / "Do all N".
 */
export function ConfirmOrders({ lines, head, onYes, onNo, testid, yesTestId, yes = 'Give the orders', className = 'mb-2', label = 'Confirm' }: {
  lines: ReactNode[]; head?: ReactNode; onYes: () => void; onNo: () => void; testid: string; yesTestId: string; yes?: string; className?: string; label?: string;
}) {
  useDialogKeys(true, { confirm: onYes, close: onNo });
  return (
    <div className={`${className} rounded-md border border-gold-500/50 bg-noir-900/90 p-2 text-xs`} role="dialog" aria-label={label} data-testid={testid}>
      {head && <div className="mb-1 font-semibold text-stone-100">{head}</div>}
      <ul className="mb-2 space-y-0.5 text-stone-300">{lines.map((l, i) => <li key={i}>• {l}</li>)}</ul>
      <div className="flex gap-1.5">
        <button type="button" className="btn-primary text-xs" onClick={onYes} data-testid={yesTestId}>{yes} <KeyHint k="Enter" /></button>
        <button type="button" className="btn-secondary text-xs" onClick={onNo}>Not now <KeyHint k="Esc" /></button>
      </div>
    </div>
  );
}
