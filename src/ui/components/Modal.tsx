import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';

/**
 * ONE OVERLAY STACK (STREAMLINE §6.3). Every full-screen layer (a modal, a
 * sheet, the palette, a scene) is an `Overlay`: the one place `fixed inset-0`
 * lives (with the cutscene and the minigame screen). Each layer opened takes
 * the next place on the stack, so the newest is always on top whatever its
 * base z-index says, and closing it gives the screen back to the one below.
 */
const stack: number[] = [];
const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;
let seq = 0;

/** How many overlays are open (the clock, the hints and tests read it). */
export function overlayDepth(): number {
  return stack.length;
}

/** Register a layer while mounted; returns its z-index (its base, or above the current top). */
export function useOverlayStack(base: number): number {
  const id = useRef(0);
  const [z, setZ] = useState(base);
  useIsoLayout(() => {
    id.current = ++seq;
    const top = stack.length ? Math.max(...stack) : 0;
    const mine = Math.max(base, top + 1);
    stack.push(mine);
    setZ(mine);
    return () => {
      const i = stack.indexOf(mine);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [base]);
  return z;
}

export function Overlay({ z, className = '', children, onClick, onContextMenu, style, ...rest }: {
  z: number;
  className?: string;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  style?: CSSProperties;
  role?: string;
  'aria-modal'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  'data-testid'?: string;
}) {
  const zi = useOverlayStack(z);
  return (
    <div className={`fixed inset-0 ${className}`} style={{ ...style, zIndex: zi }} onClick={onClick} onContextMenu={onContextMenu} {...rest}>
      {children}
    </div>
  );
}

/** The one modal: a bottom sheet on phones (90% of the height, a grab bar), centred on wider screens. */
export function Modal({ children, onClose, wide, xwide }: { children: ReactNode; onClose?: () => void; wide?: boolean; xwide?: boolean }) {
  return (
    <Overlay z={1170} className="flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" data-testid="modal">
      <div
        className={`panel bg-noir-900 w-full ${xwide ? 'sm:max-w-5xl' : wide ? 'sm:max-w-3xl' : 'sm:max-w-[560px]'} max-h-[90vh] sm:max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-lg border-gold-600/40`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-1.5" aria-hidden><span className="h-1 w-10 rounded-full bg-noir-600" /></div>
        {children}
      </div>
    </Overlay>
  );
}
