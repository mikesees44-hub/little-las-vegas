import { useState } from 'react';
import { previewAction } from '../../engine/actions';
import type { Opportunity } from '../../engine/opportunities';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { useOrders } from '../components/Orders';
import { useSheet } from '../components/People';
import { useClarity } from '../clarity/context';
import { useTravel } from '../travel/context';
import { groupAlerts, type ShellAlert } from './alertRoutes';
import { RichTip } from './Num';
import { thisWeek } from './thisWeek';
import { streetFeed } from './street';
import { useShell } from './context';
import type { GuidedGoal } from './goals';
import { seasonInfo } from '../../engine/calendar';
import { TakeLine } from '../tribute/TakeLine';

export const ALERT_GLYPH: Record<string, string> = {
  unhappy: '☹', defector: '⇄', heat: '♨', money: '$', heir: '♔', loan: '%', staff: '⚒', decision: '✉', scheme: '☠', dispute: '⚖', war: '⚔', family: '♥', lifestyle: '✦', law: '§', underbelly: '⚓',
  rival: '♜', courted: '⚑', debt: '¢', evidence: '⚠', faction: '☍', books: '✎', goal: '➚',
};
const g = (k: string) => <span style={{ fontVariantEmoji: 'text' } as never}>{ALERT_GLYPH[k] ?? '•'}&#xFE0E;</span>;
const SEV_CLASS = {
  danger: 'bg-blood-500/80 border-red-300 text-white llv-ring',
  warn: 'bg-amber-700/80 border-amber-300 text-white',
  info: 'bg-noir-700/90 border-gold-500 text-gold-300',
};

/** Grouped alerts: one icon per kind with a count; hover or tap lists them. */
export function AlertsPanel({ alerts, onAlert, onSnooze, iconsOnly }: { alerts: ShellAlert[]; onAlert: (a: ShellAlert) => void; onSnooze: (a: ShellAlert) => void; iconsOnly?: boolean }) {
  const groups = groupAlerts(alerts);
  const [open, setOpen] = useState<string | undefined>();
  if (!groups.length) return <div className="text-[11px] text-stone-500 px-1" data-testid="alert-rail">All quiet.</div>;
  return (
    <div className={iconsOnly ? 'flex flex-col items-center gap-1.5' : 'flex flex-wrap gap-1.5'} data-testid="alert-rail">
      {groups.map((gr) => (
        <div key={gr.group} className="relative" onMouseLeave={() => setOpen(undefined)}>
          <button type="button" data-testid={`alert-${gr.group}`}
            onClick={() => (gr.items.length === 1 ? onAlert(gr.items[0]) : setOpen(open === gr.group ? undefined : gr.group))}
            onMouseEnter={() => setOpen(gr.group)}
            title={gr.items.map((a) => a.title).join(' · ')}
            className={`relative w-9 h-9 rounded-full border-2 flex items-center justify-center text-base font-bold shadow-md shadow-black/60 ${SEV_CLASS[gr.severity]}`}>
            {g(gr.kind)}
            {gr.items.length > 1 && <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-noir-950 border border-gold-500 px-0.5 text-[9px] text-gold-300">{gr.items.length}</span>}
          </button>
          {open === gr.group && (
            <div className={`absolute z-[1200] w-64 rounded border border-noir-600 bg-noir-950/95 p-1.5 text-[11px] text-stone-300 shadow-lg ${iconsOnly ? 'right-full top-0 mr-1' : 'left-0 top-full mt-1'}`}>
              {gr.items.map((a) => (
                <div key={a.key} className="rounded px-1.5 py-1 hover:bg-noir-800">
                  <button type="button" className="block w-full text-left" onClick={() => { setOpen(undefined); onAlert(a); }}>
                    <span className={`block font-semibold ${a.severity === 'danger' ? 'text-red-300' : a.severity === 'warn' ? 'text-amber-300' : 'text-gold-300'}`}>{a.title}</span>
                    <span className="block text-stone-400">{a.text}</span>
                  </button>
                  {a.severity === 'info' && a.kind !== 'decision' && <button type="button" className="mt-0.5 text-[10px] text-stone-500 hover:text-gold-300" onClick={() => onSnooze(a)}>snooze 4 weeks</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Do what an opportunity says (queue the order, open the picker, the trip, the man or the drawer). */
export function useOpportunity() {
  const { orders, queue } = useOrders();
  const { open } = useSheet();
  const { openPicker } = useClarity();
  const travel = useTravel();
  const shell = useShell();
  return {
    queued: (_s: GameState, o: Opportunity) => !!o.link.action && orders.some((x) => JSON.stringify(x) === JSON.stringify(o.link.action)),
    go: (s: GameState, o: Opportunity) => {
      const l = o.link;
      if (l.action && !previewAction(s, l.action).disabledReason) queue(l.action);
      else if (l.role) openPicker(l.role);
      else if (l.trip) travel.plan(l.trip);
      else if (l.charId) open(l.charId);
      else if (l.tab) shell.go(l.tab);
    },
  };
}

function OppLine({ s, o }: { s: GameState; o: Opportunity }) {
  const { go, queued } = useOpportunity();
  const q = queued(s, o);
  return (
    <li className="flex items-start gap-1.5">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${o.kind === 'threat' ? 'bg-blood-400' : 'bg-gold-400'}`} />
      <RichTip tip={o.text} align="left" className="min-w-0 flex-1"><span className="text-stone-200 leading-snug">{o.title}</span></RichTip>
      <button type="button" disabled={q} onClick={() => go(s, o)} className={`shrink-0 rounded border px-1.5 text-[10px] font-semibold ${q ? 'border-noir-600 text-stone-500' : 'border-gold-500 text-gold-300 hover:bg-gold-500/15'}`}>{q ? 'Ordered' : o.cta}</button>
    </li>
  );
}

export function ThisWeekCard({ s, onReport }: { s: GameState; onReport: () => void }) {
  const w = thisWeek(s);
  const info = seasonInfo(s.date);
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <section className="rounded-md border border-noir-700 bg-noir-900/80 p-2 text-[12px]" data-testid="this-week-card">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">This week {w.from ? <span className="normal-case tracking-normal">(wk {w.from} → {w.to})</span> : null}</div>
        {s.lastReport && <button type="button" className="text-[10px] text-gold-300 hover:underline" onClick={onReport} data-testid="full-report">full report ▸</button>}
      </div>
      {!w.money ? (
        <p className="mt-1 text-stone-400">Your first week. {info.inSeason ? 'The Season is on: every week a place is open counts' : info.countdownLabel}. Give an order or two, then advance.</p>
      ) : (
        <div className="mt-1 space-y-0.5">
          <RichTip align="left" tip={<>
            <span className="block text-gold-300 font-semibold">Money in {fmt$(w.money.inflow)} · out {fmt$(w.money.outflow)}</span>
            {w.money.topIn.map((l, i) => <span key={`i${i}`} className="flex justify-between gap-2"><span className="truncate">{l.label}</span><span className="text-emerald-400">+{fmt$(l.amount)}</span></span>)}
            {w.money.topOut.map((l, i) => <span key={`o${i}`} className="flex justify-between gap-2"><span className="truncate">{l.label}</span><span className="text-red-400">{fmt$(l.amount)}</span></span>)}
          </>}>
            <div className="flex gap-2"><span className="w-12 text-stone-500">Money</span><span className={`font-semibold tabular-nums ${w.money.delta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{w.money.delta >= 0 ? '+' : ''}{fmt$(w.money.delta)}</span><span className="text-stone-500 truncate">in {fmt$(w.money.inflow)} · out {fmt$(w.money.outflow)}</span></div>
          </RichTip>
          <div className="flex gap-2 tabular-nums"><span className="w-12 text-stone-500">Resp</span><span className={(w.respect ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}>{sign(w.respect ?? 0)}</span>
            <span className="text-stone-500">Heat</span><span>L {sign(w.heat!.local)} F {sign(w.heat!.family)} D {sign(w.heat!.federal)}</span></div>
        </div>
      )}
      <TakeLine s={s} />
      {w.threats.length > 0 && <><div className="mt-1.5 text-[10px] uppercase tracking-widest text-red-300/80">Threats</div><ul className="space-y-0.5">{w.threats.map((o) => <OppLine key={o.id} s={s} o={o} />)}</ul></>}
      {w.opportunities.length > 0 && <><div className="mt-1.5 text-[10px] uppercase tracking-widest text-gold-400/80">Opportunities</div><ul className="space-y-0.5">{w.opportunities.map((o) => <OppLine key={o.id} s={s} o={o} />)}</ul></>}
      {w.changed.length > 0 && <><div className="mt-1.5 text-[10px] uppercase tracking-widest text-stone-500">Changed</div><ul className="space-y-0.5 text-stone-400">{w.changed.map((e, i) => <li key={i} className="leading-snug line-clamp-2">{e.text}</li>)}</ul></>}
    </section>
  );
}

export function GoalsCard({ goals, onShow }: { goals: GuidedGoal[]; onShow: (g: GuidedGoal) => void }) {
  const done = goals.filter((x) => x.done).length;
  const cur = goals.find((x) => !x.done);
  const [list, setList] = useState(false);
  const season1 = goals.slice(0, 7);
  const label = season1.some((x) => !x.done) ? 'Memorial Day to Labor Day' : 'Season two';
  return (
    <section className="rounded-md border border-gold-600/40 bg-noir-900/80 p-2 text-[12px]" data-testid="goals-card">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Goals · {label}</div>
        <button type="button" className="text-[10px] text-stone-400 hover:text-gold-300" onClick={() => setList((l) => !l)}>{done}/{goals.length} {list ? '▴' : '▸'}</button>
      </div>
      {cur ? (
        <div className="mt-1">
          <div className="font-semibold text-stone-100 leading-snug" data-testid="goal-current">{cur.title}</div>
          <div className="text-[11px] text-stone-400 leading-snug">{cur.hint}</div>
          {cur.show && <button type="button" className="mt-1 rounded border border-gold-500 px-2 py-0.5 text-[11px] font-semibold text-gold-300 hover:bg-gold-500/15" onClick={() => onShow(cur)} data-testid="goal-show">Show me</button>}
        </div>
      ) : <div className="mt-1 text-emerald-300">Every goal met. The shore is yours to lose.</div>}
      {list && (
        <ol className="mt-1.5 space-y-0.5 border-t border-noir-700 pt-1">
          {goals.map((x) => <li key={x.id} className={x.done ? 'text-stone-500 line-through' : x === cur ? 'text-gold-300' : 'text-stone-300'}>{x.done ? '✓' : '○'} {x.title}</li>)}
        </ol>
      )}
    </section>
  );
}

export function StreetFeedCard({ s, overlay }: { s: GameState; overlay?: boolean }) {
  const lines = streetFeed(s, 6);
  const { open } = useSheet();
  const shell = useShell();
  if (!lines.length) return null;
  return (
    <section className={`${overlay ? 'rounded-md border border-noir-700 bg-noir-900/90 shadow-lg shadow-black/60' : 'rounded-md border border-noir-700 bg-noir-900/80'} p-2 text-[11px]`} data-testid="street-feed">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Word on the street</div>
      <ul className="mt-1 space-y-0.5">
        {lines.map((l) => (
          <li key={l.key}>
            <button type="button" className="flex w-full gap-1.5 text-left hover:text-gold-300" onClick={() => { if (l.focus) shell.focus(l.focus); if (l.charId) open(l.charId); }}>
              <span className="w-7 shrink-0 text-stone-600 tabular-nums">wk{l.week}</span>
              <span className="shrink-0 text-gold-400" style={{ fontVariantEmoji: 'text' } as never}>{l.glyph}&#xFE0E;</span>
              <span className="text-stone-300 line-clamp-2">{l.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
