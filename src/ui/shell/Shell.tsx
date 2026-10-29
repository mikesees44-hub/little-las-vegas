import { useEffect, useState, type ReactNode } from 'react';
import { Overlay } from '../components/Modal';

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
  /** The bottom strip (empty: the In-motion chips live on the Desk now). */
  bottom?: ReactNode;
  alertCount: number;
  danger: boolean;
}) {
  const [wide, setWide] = useState(false);
  const [sheet, setSheet] = useState(false);
  // Wide screens: the right column folds to its icons for more map (remembered in this browser).
  // Folded by default (a calm home screen: the Desk is the focus); unfolding is remembered.
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem('llv-right-folded') !== '0'; } catch { return true; } });
  // Phones: the ☰ menu's "Alerts" opens the sheet (the floating button shows only when something is dangerous).
  useEffect(() => {
    const on = () => setSheet(true);
    window.addEventListener('llv-open-alerts', on);
    return () => window.removeEventListener('llv-open-alerts', on);
  }, []);
  const fold = (v: boolean) => { setFolded(v); try { localStorage.setItem('llv-right-folded', v ? '1' : '0'); } catch { /* storage unavailable */ } };
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
        {/* Wide screens: the full column (it folds to icons on request). */}
        {!folded && (
          <aside className="hidden xl:flex w-[300px] 2xl:w-[340px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-noir-700 bg-noir-900/90 p-2" data-testid="right-column">
            <button type="button" className="self-end -mb-1 text-[10px] text-stone-500 hover:text-gold-300" onClick={() => fold(true)} data-testid="right-fold" title="Fold this column to icons for more room">fold ›</button>
            {right}
          </aside>
        )}
        {/* Tablets and small laptops (and a folded column): icons, unfolding over the map. */}
        <aside className={`hidden md:flex ${folded ? '' : 'xl:hidden'} w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto border-l border-noir-700 bg-noir-900/90 py-2`} data-testid="right-icons">
          <button type="button" className="h-9 w-9 rounded border border-noir-600 text-stone-300 hover:border-gold-500" onClick={() => setWide((w) => !w)} aria-expanded={wide} title="This week, goals and the street">☰</button>
          {folded && <button type="button" className="hidden xl:block text-[10px] text-stone-500 hover:text-gold-300" onClick={() => { fold(false); setWide(false); }} data-testid="right-unfold" title="Show the column again">‹ open</button>}
          {rightIcons}
        </aside>
        {wide && (
          <div className={`hidden md:block ${folded ? '' : 'xl:hidden'} absolute right-14 inset-y-0 z-[1120] w-[320px] overflow-y-auto border-l border-noir-700 bg-noir-900/[0.97] p-2 space-y-2 shadow-2xl llv-slide-right`}>
            <button type="button" className="float-right text-xs text-stone-400 hover:text-gold-300" onClick={() => setWide(false)}>close ×</button>
            {right}
          </div>
        )}
      </div>
      {bottom ? <div className="shrink-0 border-t border-noir-700 bg-noir-900/95 mb-[52px] md:mb-0">{bottom}</div> : <div className="h-[52px] shrink-0 md:hidden" aria-hidden />}
      {/* Phones: alerts as a bottom sheet. */}
      <button type="button" onClick={() => setSheet(true)} data-testid="alerts-phone"
        className={`${danger ? '' : 'hidden'} md:hidden fixed right-2 bottom-[96px] z-[1140] rounded-full border-2 px-3 py-1.5 text-xs font-semibold shadow-lg shadow-black/70 ${danger ? 'border-red-300 bg-blood-500/90 text-white llv-ring' : 'border-gold-500 bg-noir-900/95 text-gold-300'}`}>
        Alerts ({alertCount})
      </button>
      {sheet && (
        <Overlay z={1165} className="md:hidden bg-black/60" onClick={() => setSheet(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-lg border-t border-gold-600/50 bg-noir-900 p-2 space-y-2" onClick={(e) => e.stopPropagation()} data-testid="alerts-sheet">
            <div className="flex justify-between"><span className="text-[10px] uppercase tracking-[0.25em] text-stone-500 pt-1">What is going on</span><button type="button" className="text-xs text-stone-400" onClick={() => setSheet(false)}>close ×</button></div>
            {right}
          </div>
        </Overlay>
      )}
    </div>
  );
}
