import { useEffect } from 'react';
import { previewAction } from '../../engine/actions';
import type { GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import { actionVerb } from '../verbs';

export interface ToastItem { action: PlayerAction; index: number; at: number }

/**
 * Pops up the moment the player clicks an action: what it is, what it costs,
 * and when it happens (when the week advances). Undo takes it back.
 */
export function OrderToast({ s, item, onUndo, onClose }: { s: GameState; item: ToastItem; onUndo: () => void; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(t);
  }, [item.at, onClose]);
  const p = previewAction(s, item.action);
  const { verb } = actionVerb(item.action);
  const chips = (p.effects ?? []).slice(0, 4).map((e) => (e as { label?: string }).label).filter(Boolean) as string[];
  return (
    <div className="fixed z-[60] bottom-4 left-1/2 -translate-x-1/2 w-[min(92vw,460px)] rounded-lg border border-gold-500 bg-noir-900/95 shadow-2xl px-4 py-3 pointer-events-none" role="status" data-testid="order-toast">
      <div className="flex items-start gap-3">
        <div className="text-gold-300 text-lg leading-none mt-0.5">✓</div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-gold-400">{verb}</div>
          <div className="text-sm font-semibold text-stone-100">{p.title}</div>
          {p.detail && <div className="text-xs text-stone-400 mt-0.5 line-clamp-2">{p.detail}</div>}
          <div className="text-xs text-stone-300 mt-1">
            {p.toPocket ? <span className="text-sky-300">Moves {fmt$(Math.abs(p.toPocket))} {p.toPocket > 0 ? 'from Family money into your pocket' : 'from your pocket into Family money'}. </span> : p.cost > 0 ? <span className="text-red-300">Costs {fmt$(p.cost)} {p.pot === 'pocket' ? 'from your pocket' : 'from Family money'}. </span> : null}
            {chips.length > 0 && <span className="text-stone-400">{chips.join(' · ')}. </span>}
            It happens when you hit <span className="text-gold-300">Advance Week</span>.
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0 pointer-events-auto">
          <button className="btn-ghost text-[11px] py-0.5 px-2" onClick={onUndo}>Undo</button>
          <button className="text-stone-500 text-[11px]" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>
    </div>
  );
}
