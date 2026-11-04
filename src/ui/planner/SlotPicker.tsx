import { useState } from 'react';
import { DAY_NAMES } from '../../engine/days';
import { absOf } from '../../engine/planner/datebook';
import { freeOn, hoursWord, nowHour, slotBlock } from '../../engine/planner/hours';
import { absDay, DAY_HOURS, DAY_START, formatClock } from '../../engine/timeCost';
import type { GameState } from '../../engine/types';

export interface PickSlot { w: number; d: number; h: number }

/** The days ahead that can take an entry: today to Sunday, then next week. */
export function slotDays(s: GameState): { w: number; d: number; label: string }[] {
  const now = absDay(s);
  const out: { w: number; d: number; label: string }[] = [];
  for (let a = now; a < now + 9; a++) {
    const w = Math.floor(a / 7);
    const d = a % 7;
    out.push({ w, d, label: a === now ? 'Today' : a === now + 1 ? `Tomorrow (${DAY_NAMES[d].slice(0, 3)})` : `${w > s.week ? 'Next ' : ''}${DAY_NAMES[d]}` });
  }
  return out;
}

/** A day and an hour for something that takes `hours`, with the reason a slot can't take it. */
export function SlotPicker({ s, hours, initial, label = 'Book it', onPick, onNow, nowLabel, testid = 'slot' }: {
  s: GameState;
  hours: number;
  initial?: PickSlot;
  label?: string;
  onPick: (sl: PickSlot) => void;
  /** "Hear him now" (today, this hour). */
  onNow?: () => void;
  nowLabel?: string;
  testid?: string;
}) {
  const days = slotDays(s);
  const firstOpen = (w: number, d: number) => (absOf(w, d) === absDay(s) ? Math.ceil(nowHour(s)) : 10);
  const [di, setDi] = useState(() => Math.max(0, initial ? days.findIndex((x) => x.w === initial.w && x.d === initial.d) : days.findIndex((x) => freeOn(s, absOf(x.w, x.d)) >= hours)));
  const day = days[di] ?? days[0];
  const [h, setH] = useState(() => initial?.h ?? Math.min(DAY_START + DAY_HOURS - hours, Math.max(firstOpen(day.w, day.d), 10)));
  const hoursOf = Array.from({ length: DAY_HOURS }, (_, i) => DAY_START + i).filter((x) => x + hours <= DAY_START + DAY_HOURS);
  const block = slotBlock(s, day.w, day.d, h, hours);
  const nowBlock = slotBlock(s, s.week, absDay(s) % 7, Math.floor(nowHour(s)), hours);
  return (
    <div className="llv-pop mt-1 space-y-2 p-2 text-[12px]" data-testid={`${testid}-picker`}>
      {onNow && (
        <button type="button" className="llv-ink-btn llv-ink-btn-primary w-full justify-center" onClick={onNow} disabled={!!nowBlock} title={nowBlock} data-testid={`${testid}-now`}>
          {nowBlock ?? nowLabel ?? 'Now'} {nowBlock ? '' : `· ${hoursWord(hours)}`}
        </button>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <select className="rounded border border-[#2a2118]/40 bg-[#fffaf0] px-1 py-1" value={di} onChange={(e) => { const i = Number(e.target.value); setDi(i); const nd = days[i]; setH((x) => Math.max(x, firstOpen(nd.w, nd.d))); }} aria-label="Day" data-testid={`${testid}-day`}>
          {days.map((x, i) => <option key={`${x.w}:${x.d}`} value={i}>{x.label} · {hoursWord(freeOn(s, absOf(x.w, x.d)))} free</option>)}
        </select>
        <select className="rounded border border-[#2a2118]/40 bg-[#fffaf0] px-1 py-1" value={h} onChange={(e) => setH(Number(e.target.value))} aria-label="Hour" data-testid={`${testid}-hour`}>
          {hoursOf.map((x) => <option key={x} value={x}>{formatClock(x)}</option>)}
        </select>
      </div>
      <button type="button" className="llv-ink-btn w-full justify-center" disabled={!!block} title={block} onClick={() => onPick({ w: day.w, d: day.d, h })} data-testid={`${testid}-book`}>
        {block ?? `${label}: ${day.label.toLowerCase()}, ${formatClock(h)} (${hoursWord(hours)})`}
      </button>
    </div>
  );
}
