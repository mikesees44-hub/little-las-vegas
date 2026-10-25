import { useState, type ReactNode } from 'react';

/**
 * The map-first layout: top bar; left rail; the map (never unmounted) with
 * drawers over it; the right column (alerts, This Week, goals); the In
 * Motion strip along the bottom. Under 1280px the right column folds to
 * icons; on phones it becomes an "Alerts" sheet and the rail a bottom bar.
 */
export function Shell({ top, rail, map, drawer, overlay, right, rightIcons, bottom, alertCount, danger }: {
  top: ReactNode;
  rail: ReactNode;
  map: ReactNode;
  drawer?: ReactNode;
  /** Floats over the map (street feed, game over). */
  overlay?: ReactNode;
  right: ReactNode;
  rightIcons: ReactNode;
  bottom: ReactNode;
  alertCount: number;
  danger: boolean;
}) {
  const [wide, setWide] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden" data-testid="shell">
      {top}
      <div className="relative flex min-h-0 flex-1">
        {rail}
        <div className="relative min-w-0 flex-1" data-testid="map-area">
          <div className="absolute inset-0">{map}</div>
          {overlay}
          {drawer}
        </div>
        {/* Wide screens: the full column. */}
        <aside className="hidden xl:flex w-[300px] 2xl:w-[340px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-noir-700 bg-noir-900/90 p-2" data-testid="right-column">{right}</aside>
        {/* Tablets and small laptops: icons, unfolding over the map. */}
        <aside className="hidden md:flex xl:hidden w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto border-l border-noir-700 bg-noir-900/90 py-2" data-testid="right-icons">
          <button type="button" className="h-9 w-9 rounded border border-noir-600 text-stone-300 hover:border-gold-500" onClick={() => setWide((w) => !w)} aria-expanded={wide} title="This week, goals and the street">☰</button>
          {rightIcons}
        </aside>
        {wide && (
          <div className="hidden md:block xl:hidden absolute right-14 inset-y-0 z-[1120] w-[320px] overflow-y-auto border-l border-noir-700 bg-noir-900/[0.97] p-2 space-y-2 shadow-2xl llv-slide-right">
            <button type="button" className="float-right text-xs text-stone-400 hover:text-gold-300" onClick={() => setWide(false)}>close ×</button>
            {right}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-noir-700 bg-noir-900/95 mb-[52px] md:mb-0">{bottom}</div>
      {/* Phones: alerts as a bottom sheet. */}
      <button type="button" onClick={() => setSheet(true)} data-testid="alerts-phone"
        className={`md:hidden fixed right-2 bottom-[96px] z-[1140] rounded-full border-2 px-3 py-1.5 text-xs font-semibold shadow-lg shadow-black/70 ${danger ? 'border-red-300 bg-blood-500/90 text-white llv-ring' : 'border-gold-500 bg-noir-900/95 text-gold-300'}`}>
        Alerts ({alertCount})
      </button>
      {sheet && (
        <div className="md:hidden fixed inset-0 z-[1165] bg-black/60" onClick={() => setSheet(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-lg border-t border-gold-600/50 bg-noir-900 p-2 space-y-2" onClick={(e) => e.stopPropagation()} data-testid="alerts-sheet">
            <div className="flex justify-between"><span className="text-[10px] uppercase tracking-[0.25em] text-stone-500 pt-1">What is going on</span><button type="button" className="text-xs text-stone-400" onClick={() => setSheet(false)}>close ×</button></div>
            {right}
          </div>
        </div>
      )}
    </div>
  );
}
