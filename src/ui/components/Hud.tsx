import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * THE HUD's moving numbers: a value that changes counts to its new figure, gives a small bump, and lets
 * a "+$2,008" / "−$300" float up off it. All of it is off under prefers-reduced-motion (the number simply
 * changes; the week's delta stays written beside it either way, so the motion is never the only signal).
 */

export function reducedMotion(): boolean {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** The value, counted from its last figure to the new one over ~0.6 s. The first render is the real value. */
export function useCountUp(value: number, ms = 650): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    from.current = value;
    if (a === value) return;
    if (reducedMotion() || typeof requestAnimationFrame === 'undefined') { setShown(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/**
 * A HUD number: counts up or down to a new value, bumps, and floats the change off its corner.
 * `good` says whether up is good (money, respect) or bad (heat).
 */
export function HudNumber({ value, format = (n) => `${n}`, good = 'up', className = '', testid }: {
  value: number;
  format?: (n: number) => string;
  good?: 'up' | 'down';
  className?: string;
  testid?: string;
}) {
  const shown = useCountUp(value);
  const prev = useRef(value);
  const [float, setFloat] = useState<{ d: number; n: number } | undefined>();
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (!d) return;
    setFloat((f) => ({ d, n: (f?.n ?? 0) + 1 }));
    const t = setTimeout(() => setFloat(undefined), 1700);
    return () => clearTimeout(t);
  }, [value]);
  const up = (float?.d ?? 0) > 0;
  const fine = good === 'up' ? up : !up;
  return (
    <span className={`relative inline-block ${className}`} data-testid={testid}>
      <span key={float?.n ?? 0} className={float ? 'llv-bump inline-block' : 'inline-block'}>{format(shown)}</span>
      {float && (
        <span key={`f${float.n}`} className={`llv-floatup ${fine ? 'text-emerald-300' : 'text-red-300'}`} aria-hidden>
          {up ? '+' : '−'}{format(Math.abs(float.d)).replace(/^-/, '')}
        </span>
      )}
    </span>
  );
}

/** A thin meter under a HUD value (respect, a heat): the bar, its colour, and the number written beside it. */
export function HudMeter({ v, color, className = '' }: { v: number; color: string; className?: string }) {
  return (
    <span className={`block h-1 overflow-hidden rounded-full bg-noir-700/90 ${className}`} aria-hidden>
      <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, v))}%`, transition: 'width 0.6s ease-out' }} />
    </span>
  );
}

/** The round icon on a HUD badge. */
export function HudIcon({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'green' | 'red' | 'steel' | 'wine' }) {
  return <span className={`llv-hud-icon llv-hud-icon-${tone}`} aria-hidden>{children}</span>;
}
