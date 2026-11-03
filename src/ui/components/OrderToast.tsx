import { useOpenBook } from '../book/TheBook';
import { useEffect } from 'react';
import { previewAction } from '../../engine/actions';
import type { GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import { verbOf } from '../verbs';
import { actionFacts } from '../actionFacts';
import { CharacterDisplayName } from './yesBoss';
import { DAY_NAMES } from '../../engine/days';
import { formatClock, hoursLabel } from '../../engine/timeCost';

export interface ToastItem {
  action: PlayerAction; index: number; at: number;
  /** What the pocket can't cover without the player's approval. */ short?: number;
  /** The hours it took (engine/timeCost.ts): the clock after it, late hours, a missed dinner; or the day it was booked for. */
  time?: { hours: number; to: number; late: number; missedDinner: boolean; bookedDay?: number };
}

/** "2 hours pass — now 9 PM" (or "Booked for Tuesday: 3 hours"). */
export function timeLine(t: NonNullable<ToastItem['time']>): string {
  if (t.bookedDay !== undefined) return `Booked for ${DAY_NAMES[t.bookedDay]}: ${hoursLabel(t.hours)} of that day.`;
  // The boss's hours go now; the order's outcome comes later (the toast says when): two clocks, named apart.
  return `Your day: ${hoursLabel(t.hours)} spent giving it — now ${formatClock(t.to)}.`;
}

/**
 * Pops up the moment the player clicks an action: what it is, what it costs,
 * and when it happens (when the week advances). Undo takes it back.
 */
export function OrderToast({ s, item, onUndo, onClose, onApprove }: { s: GameState; item: ToastItem; onUndo: () => void; onClose: () => void; onApprove?: () => void }) {
  useEffect(() => {
    // An order that still needs the player's word stays up longer.
    const t = window.setTimeout(onClose, item.short ? 14000 : 6000);
    return () => window.clearTimeout(t);
  }, [item.at, item.short, onClose]);
  const p = previewAction(s, item.action);
  const { verb } = verbOf(item.action, p);
  const chips = (p.effects ?? []).slice(0, 4).map((e) => (e as { label?: string }).label).filter(Boolean) as string[];
  return (
    <div className="fixed z-[1160] bottom-[64px] md:bottom-4 left-1/2 -translate-x-1/2 md:left-[84px] md:translate-x-0 w-[min(92vw,460px)] rounded-lg border border-gold-500 bg-noir-900/95 shadow-2xl px-4 py-3 pointer-events-none" role="status" data-testid="order-toast">
      <div className="flex items-start gap-3">
        <div className="text-gold-300 text-lg leading-none mt-0.5">✓</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm italic text-gold-200" data-testid="yes-boss">“Yes, boss.” <span className="not-italic text-stone-400 text-xs">— <CharacterDisplayName s={s} action={item.action} actor={actionFacts(s, item.action, p).actor} /></span></div>
          <div className="text-[11px] uppercase tracking-widest text-gold-400 mt-1" data-testid="ordered-line">✓ Queued · {verb} · lands {whenOf(item)}</div>
          <div className="text-sm font-semibold text-stone-100">{p.title}</div>
          {p.detail && <div className="text-xs text-stone-400 mt-0.5 line-clamp-2">{p.detail}</div>}
          <div className="text-xs text-stone-300 mt-1">
            {p.toPocket ? <span className="text-sky-300">Moves {fmt$(Math.abs(p.toPocket))} {p.toPocket > 0 ? 'from Family money into your pocket' : 'from your pocket into Family money'}. </span> : p.cost > 0 ? <span className="text-red-300">Costs {fmt$(p.cost)} {p.pot === 'pocket' ? (item.action.fund === 'family' ? 'from your pocket, the rest from Family money (you approved it)' : 'from your pocket') : 'from Family money'}. </span> : null}
            {chips.length > 0 && <span className="text-stone-400">{chips.join(' · ')}. </span>}
            Carried out when the week turns (Sunday night, or <span className="text-gold-300">Advance Week</span>); the outcome lands on the Desk under Results and in Your File.
          </div>
          {item.time && (
            <div className="mt-1 text-xs text-sky-200" data-testid="toast-time">
              {timeLine(item.time)}
              {item.time.late > 0 && <span className="text-amber-300"> A late night: it costs you sleep.</span>}
              {item.time.missedDinner && <span className="text-amber-300"> You missed dinner at home.</span>}
            </div>
          )}
          {(item.short ?? 0) > 0 && (
            <div className="mt-1 text-xs text-amber-300" data-testid="toast-unfunded">
              Your pocket is {fmt$(item.short!)} short. It won't be carried out unless you approve Family money for the rest.
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0 pointer-events-auto">
          {(item.short ?? 0) > 0 && onApprove && <button className="btn-gold text-[11px] py-0.5 px-2" onClick={onApprove} data-testid="toast-approve">Take {fmt$(item.short!)} from the Family</button>}
          <FileButton onClose={onClose} />
          <button className="btn-ghost text-[11px] py-0.5 px-2" onClick={onUndo}>Undo</button>
          <button className="text-stone-500 text-[11px]" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>
    </div>
  );
}

/** When a given order happens, in words. */
export function whenOf(item: Pick<ToastItem, 'time'>): string {
  const d = item.time?.bookedDay;
  return d !== undefined ? `on ${DAY_NAMES[d]}` : 'when the week turns';
}

function FileButton({ onClose }: { onClose: () => void }) {
  const open = useOpenBook();
  return <button type="button" className="btn-gold text-[11px] py-0.5 px-2" onClick={() => { onClose(); open(); }} data-testid="toast-file">See it in Your File →</button>;
}
