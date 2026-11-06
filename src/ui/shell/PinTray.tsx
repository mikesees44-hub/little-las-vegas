import { useState } from 'react';
import { previewAction, queuedMoney } from '../../engine/actions';
import type { GameState, PlayerAction } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { movePin, pinnedOrders, togglePinOrder, usePins } from '../plans/pins';
import { sameOrder } from '../verbs';
import { fmt$ } from '../format';

/** One pinned order as the tray shows it: a short name, the odds, why it can't be given now. Pure. */
export function pinView(s: GameState, a: PlayerAction, orders: readonly PlayerAction[] = []): { title: string; short: string; pct?: number; cost: number; pot: 'family' | 'pocket'; why?: string; queued: boolean } {
  let title = a.kind as string;
  let pct: number | undefined;
  let cost = 0;
  let pot: 'family' | 'pocket' = 'family';
  let why: string | undefined;
  try {
    const p = previewAction(s, a);
    title = p.title;
    cost = p.cost || 0;
    pot = p.pot === 'pocket' ? 'pocket' : 'family';
    const o = p.odds ?? p.acceptance;
    pct = o ? Math.round(o.chance * 100) : undefined;
    const q = queuedMoney(s, orders.filter((x) => !sameOrder(x, a)));
    why = p.disabledReason ?? (cost > 0 && pot === 'family' && cost > q.familyLeft ? 'Not enough Family money after this week\'s orders' : undefined);
  } catch { why = 'No longer possible'; }
  const short = title.replace(/\s*\(.*?\)\s*/g, ' ').replace(/:.*$/, '').trim().slice(0, 26);
  return { title, short: short || title.slice(0, 26), pct, cost, pot, why, queued: orders.some((x) => sameOrder(x, a)) };
}

/**
 * THE PIN TRAY (top bar): the orders the boss pinned (☆ on any order), one tap each to give it, through the
 * normal queue (the heavy ones still ask). Drag a pin to reorder, or focus one and use Shift+← / Shift+→.
 * Stored per game in this browser (plans/pins.ts), the same pins as Find's "Pinned & recent".
 */
export function PinTray({ s }: { s: GameState }) {
  usePins();
  const { orders, queue } = useOrders();
  const [drag, setDrag] = useState<number | undefined>();
  const [over, setOver] = useState<number | undefined>();
  const pins = pinnedOrders(s.seed);
  if (!pins.length) return null;
  const drop = (to: number) => { if (drag !== undefined && drag !== to) movePin(s.seed, drag, to); setDrag(undefined); setOver(undefined); };
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto" role="toolbar" aria-label="Pinned orders: tap to give one; drag or Shift+arrows to reorder" data-testid="pin-tray">
      <span className="hidden text-[10px] text-gold-500 sm:inline" aria-hidden>★</span>
      {pins.map((a, i) => {
        const v = pinView(s, a, orders);
        return (
          <span key={JSON.stringify(a)} draggable data-testid="pin-chip" data-index={i}
            onDragStart={(e) => { setDrag(i); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch { /* old browsers */ } }}
            onDragOver={(e) => { e.preventDefault(); setOver(i); }}
            onDragLeave={() => setOver((o) => (o === i ? undefined : o))}
            onDrop={(e) => { e.preventDefault(); drop(i); }}
            onDragEnd={() => { setDrag(undefined); setOver(undefined); }}
            className={`group inline-flex h-8 shrink-0 items-center rounded border text-[11px] ${over === i && drag !== i ? 'border-gold-300' : v.queued ? 'border-gold-400 bg-gold-500/10' : 'border-noir-600'} ${drag === i ? 'opacity-50' : ''}`}>
            <button type="button" className={`h-full max-w-[11rem] truncate px-1.5 text-left ${v.why ? 'text-stone-500' : 'text-stone-200 hover:text-gold-300'}`} disabled={!!v.why || v.queued}
              onClick={() => queue(a)}
              onKeyDown={(e) => {
                if (!e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                e.preventDefault();
                movePin(s.seed, i, i + (e.key === 'ArrowLeft' ? -1 : 1));
              }}
              title={`${v.title}${v.cost ? ` · ${fmt$(v.cost)} ${v.pot === 'pocket' ? 'pocket' : 'Family'}` : ''}${v.pct !== undefined ? ` · ${v.pct}%` : ''}${v.why ? ` · ${v.why}` : v.queued ? ' · ordered this week' : ' · tap to give it'}. Drag (or Shift+←/→) to move it.`}
              data-testid="pin-go">
              {v.queued ? '✓ ' : ''}{v.short}{v.pct !== undefined && !v.why ? <span className={`ml-1 tabular-nums ${v.pct >= 60 ? 'text-emerald-300' : v.pct >= 35 ? 'text-amber-300' : 'text-red-300'}`}>{v.pct}%</span> : null}
            </button>
            <button type="button" className="h-full px-1 text-stone-600 hover:text-red-300" onClick={() => togglePinOrder(s.seed, a)} aria-label={`Unpin ${v.title}`} title="Unpin" data-testid="pin-unpin">×</button>
          </span>
        );
      })}
    </div>
  );
}
