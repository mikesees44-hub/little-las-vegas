import { useMemo } from 'react';
import { dayCheckIns } from '../../engine/checkins';
import { awayReason, DAY_NAMES, dayBlock, daysOf, formatDay, setEvening, weekPlan } from '../../engine/days';
import { roundOptions, roundOutcome, type Round } from '../../engine/rounds';
import { doctorReading, lawyerReading } from '../../engine/roundsPersonal';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { LANE_GLYPH, RoundButton, type Update } from './WeekPlanner';

/** One evening that just happened: the clock's short report scene (non-explicit; report only). */
export interface EveningCue { week: number; day: number; roundId: string }

export function EveningScene({ s, cue, onClose, onMore, older }: { s: GameState; cue: EveningCue; onClose: () => void; onMore?: () => void; /** An earlier scene still showing (phones show only the latest). */ older?: boolean }) {
  const r = useMemo(() => roundOptions(s).find((x) => x.id === cue.roundId), [s, cue.roundId]);
  if (!r || cue.week !== s.week) return null;
  const out = roundOutcome(s, r);
  const reading = r.reading === 'lawyer' ? lawyerReading(s).lines : r.reading === 'doctor' ? doctorReading(s).lines : undefined;
  const paid = r.action ? undefined : out.declined ? Math.round(r.cost / 3) : r.cost;
  return (
    <div className={`pointer-events-auto w-[min(360px,calc(100vw-1rem))] ${older ? 'hidden md:block' : ''} rounded-lg border border-gold-600/60 bg-noir-900/[0.97] p-3 shadow-2xl shadow-black/80 llv-slide-right`} data-testid="evening-scene" role="status">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{DAY_NAMES[cue.day]} evening</div>
          <div className="font-display text-lg leading-tight text-gold-300">{LANE_GLYPH[r.lane]} {r.label}</div>
        </div>
        <button type="button" className="text-xs text-stone-400 hover:text-gold-300" onClick={onClose} aria-label="Close" data-testid="evening-close">×</button>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-stone-200">{out.line}</p>
      {reading && !out.declined && <div className="mt-1.5 space-y-0.5 rounded border border-noir-700 bg-noir-950/60 p-2 text-[11px] leading-snug text-stone-300">{reading.map((l, i) => <p key={i}>{l}</p>)}</div>}
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-stone-500">
        <span>{paid ? `${fmt$(paid)} from your Pocket` : 'No charge'} · on the books when the week turns</span>
        {onMore && <button type="button" className="text-gold-400 hover:text-gold-300" onClick={onMore}>Your week ▸</button>}
      </div>
    </div>
  );
}

/** The day on the map (running clock): the morning meeting and tonight, one tap to the day. */
export function TodayStrip({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const d = daysOf(s);
  const list = dayCheckIns(s, d.day);
  const open = list.filter((c) => c.problem && !d.answers[c.key]);
  const urgent = open.some((c) => c.problem!.urgent);
  const away = awayReason(s, d.day);
  const pick = weekPlan(s)[d.day];
  const r = pick ? roundOptions(s).find((x) => x.id === pick) : undefined;
  return (
    <button type="button" onClick={onOpen} data-testid="today-strip"
      className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left text-[11px] shadow-lg shadow-black/70 ${urgent ? 'border-red-400 bg-blood-500/30' : 'border-gold-600/70 bg-noir-900/95'}`}>
      <span className="font-semibold text-gold-300 whitespace-nowrap">{formatDay(s).replace(/, \d{4}$/, '')}</span>
      <span className={`whitespace-nowrap ${away ? 'text-stone-500' : urgent ? 'text-red-200' : open.length ? 'text-amber-200' : 'text-stone-300'}`}>
        ☕ {away ? away.toLowerCase() : d.skipped.includes(d.day) ? 'skipped' : open.length ? `${open.length} problem${open.length > 1 ? 's' : ''}` : `${list.length} capos`}
      </span>
      <span className="truncate text-stone-400">☾ {r ? r.label : 'free evening'}</span>
      <span className="text-gold-400">▸</span>
    </button>
  );
}

const MINE = ['self:lawyer', 'self:lawyer-fix', 'self:doctor', 'self:shrink', 'fun:escort'];

/** Your own affairs (the You home): book the lawyer, the doctor, the head doctor, an evening, on the next free evening. */
export function PersonalActions({ s, update, onWeek }: { s: GameState; update: Update; onWeek?: () => void }) {
  const opts = useMemo(() => roundOptions(s), [s]);
  const plan = weekPlan(s);
  const d = daysOf(s);
  const rank = (id: string) => (MINE.includes(id) ? MINE.indexOf(id) : 100);
  const mine: Round[] = opts.filter((o) => MINE.includes(o.id) || o.lane === 'fun').sort((a, b) => rank(a.id) - rank(b.id));
  const nextFree = (id: string) => {
    for (let day = d.day; day < 7; day++) if (!plan[day] && !dayBlock(s, day, id)) return day;
    return undefined;
  };
  /** Every evening taken: the latest one still ahead gives way (never Sunday dinner). */
  const giveWay = (id: string) => {
    for (let day = 6; day >= d.day; day--) if (plan[day] && plan[day] !== 'fam:sunday' && !dayBlock(s, day, id)) return day;
    return undefined;
  };
  return (
    <section className="mb-4" data-testid="personal-actions">
      <div className="mb-1.5 flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Your rounds · your own evenings</div>
        {onWeek && <button type="button" className="text-[11px] text-stone-500 hover:text-gold-300" onClick={onWeek}>the whole week ▸</button>}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {mine.slice(0, 8).map((r) => {
          const on = plan.indexOf(r.id);
          const open = on < 0 ? nextFree(r.id) : undefined;
          const swap = on < 0 && open === undefined ? giveWay(r.id) : undefined;
          const free = open ?? swap;
          const instead = swap !== undefined ? opts.find((o) => o.id === plan[swap])?.label : undefined;
          return (
            <div key={r.id}>
              <RoundButton s={s} r={r} on={on >= 0} showReading block={on < 0 && free === undefined ? 'No free evening left this week' : undefined}
                onPick={() => update((x) => (on >= 0 ? (on >= d.day ? setEvening(x, on, null) : x) : free !== undefined ? setEvening(x, free, r.id) : x), on >= 0 ? `${r.label}: cancelled` : free !== undefined ? `${DAY_NAMES[free]} evening: ${r.label}` : undefined)} />
              <div className="px-1 text-[10px] text-stone-500" data-testid={`booked-${r.id}`}>{on >= 0 ? `Booked: ${DAY_NAMES[on]} evening${on >= d.day ? ' (tap to cancel)' : ''}` : free !== undefined ? `Tap to book ${DAY_NAMES[free]} evening${instead ? ` instead of ${instead}` : ''}` : ''}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
