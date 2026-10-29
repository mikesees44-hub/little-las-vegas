import type { ReactNode } from 'react';
import { Overlay } from '../components/Modal';
import { useEscape } from '../keys';

/**
 * The frame of the one person view. On its own it is a drawer on the right,
 * over the right column (full screen on phones), so the map and an open
 * panel drawer stay in sight. Embedded (the You panel) it is a plain block.
 */
export function SheetFrame({ children, onClose, embedded }: { children: ReactNode; onClose?: () => void; embedded?: boolean }) {
  useEscape(!embedded && !!onClose, () => onClose?.());
  if (embedded) return <div className="llv-sheet-embedded">{children}</div>;
  return (
    <Overlay z={1150} className="flex justify-end bg-black/40 sm:bg-black/25" onClick={onClose} data-testid="sheet-frame">
      <aside
        className="panel h-full w-full sm:w-[min(640px,92vw)] overflow-y-auto rounded-none sm:rounded-l-lg border-gold-600/40 shadow-2xl shadow-black/70 llv-slide-right"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </aside>
    </Overlay>
  );
}
