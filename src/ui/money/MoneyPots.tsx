import { useState } from 'react';
import { queuedMoney } from '../../engine/actions';
import { moneyTop } from '../../engine/money';
import { dipPenalty, DIP, recentDips } from '../../engine/pocket';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { useOrders } from '../components/Orders';

/** The two pots in plain words (one place, so every screen says the same thing). */
export const POT = {
  family: { name: 'Family money', what: 'Pays the crew, the cops, Philadelphia and the upkeep, and buys businesses.' },
  pocket: { name: 'Your pocket', what: 'Yours: your house, your cars, fun, gifts and your family.' },
} as const;

/** The pots now, last week's change, and where they land after this week's orders. */
export function usePots(s: GameState) {
  const { orders } = useOrders();
  const m = moneyTop(s);
  const q = queuedMoney(s, orders);
  return {
    family: m.family,
    pocket: m.pocket,
    familyDelta: m.familyDelta,
    pocketDelta: m.pocketDelta,
    /** After this week's orders (only when an order moves a pot). */
    familyAfter: orders.length && q.familyLeft !== Math.round(s.money) ? m.family - (Math.round(s.money) - q.familyLeft) : undefined,
    pocketAfter: orders.length && q.pocketLeft !== Math.max(0, m.pocket) ? q.pocketLeft : undefined,
  };
}

/** What the capos think of one more dip, in a sentence. */
export function dipLine(s: GameState, queued = 0): string {
  const p = dipPenalty(s, queued);
  const n = recentDips(s) + queued;
  if (!p) return `Once in ${DIP.window} weeks the capos let it go; dip more and they think less of you.`;
  return `${queued ? 'Counting what you have ordered, that is' : 'You have dipped'} ${n} time${n > 1 ? 's' : ''} in ${DIP.window} weeks: one more and each capo thinks ${-p} less of you.`;
}

const sgn = (n: number) => `${n >= 0 ? '+' : '−'}${fmt$(Math.abs(n))}`;

/** "This week: +$X to the Family, +$Y to your pocket" (last week played). */
export function WeekPotsLine({ s, className }: { s: GameState; className?: string }) {
  const m = moneyTop(s);
  if (m.familyDelta === undefined) return null;
  return (
    <span className={`tabular-nums ${className ?? ''}`} data-testid="week-pots-line">
      Last week: <span className={m.familyDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}>{sgn(m.familyDelta)}</span> to the Family, <span className={(m.pocketDelta ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}>{sgn(m.pocketDelta ?? 0)}</span> to your pocket
    </span>
  );
}

/** The two big numbers, each with one line on what it is for. */
export function BigPots({ s, compact }: { s: GameState; compact?: boolean }) {
  const p = usePots(s);
  const box = (k: 'family' | 'pocket', v: number, d: number | undefined, after: number | undefined) => (
    <div className={`rounded-md border px-3 py-2 min-w-0 ${k === 'family' ? 'border-gold-600/50' : 'border-amber-500/50'} bg-noir-800/70`} data-testid={`pot-${k}`}>
      <div className={`text-[11px] font-semibold ${k === 'family' ? 'text-gold-400' : 'text-amber-300'}`}>{POT[k].name}</div>
      <div className={`font-display ${compact ? 'text-xl' : 'text-2xl sm:text-3xl'} tabular-nums leading-tight ${v < 0 ? 'text-red-400' : k === 'family' ? 'text-gold-300' : 'text-amber-200'}`} data-testid={k === 'family' ? 'money-family' : 'money-pocket'}>{fmt$(v)}</div>
      {d !== undefined && d !== 0 && <div className={`text-[11px] tabular-nums ${d > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{sgn(d)} last week</div>}
      {after !== undefined && <div className="text-[11px] tabular-nums text-sky-300" data-testid={`pot-${k}-after`}>→ {fmt$(after)} after this week's orders</div>}
      <div className="text-[11px] text-stone-400 leading-snug mt-0.5">{POT[k].what}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2 min-w-0" data-testid="money-pots">
      {box('family', p.family, p.familyDelta, p.familyAfter)}
      {box('pocket', p.pocket, p.pocketDelta, p.pocketAfter)}
    </div>
  );
}

const STEPS = [500, 1000, 2500, 5000, 10000];

/**
 * "Move money": Family → your pocket (take a draw) or your pocket → Family (put it back in).
 * It is an order like any other: it happens when you advance, and every price this week already counts it.
 */
export function MoveMoney({ s }: { s: GameState }) {
  const { orders, queue, remove } = useOrders();
  const p = usePots(s);
  const [amt, setAmt] = useState(1000);
  const fam = Math.max(0, Math.round(p.familyAfter ?? p.family));
  const pk = Math.max(0, Math.round(p.pocketAfter ?? p.pocket));
  const moves = orders.map((o, i) => ({ o, i })).filter(({ o }) => o.kind === 'tribute' && o.op.op === 'move');
  const canDraw = amt > 0 && amt <= fam;
  const canBack = amt > 0 && amt <= pk;
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/50 p-3 min-w-0 space-y-2" data-testid="move-money">
      <div className="flex items-baseline justify-between gap-2">
        <div className="panel-title">Move money</div>
        <span className="text-[10px] text-stone-500">happens when you advance the week</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {STEPS.map((x) => (
          <button key={x} type="button" className={`rounded border px-2 py-0.5 text-[12px] tabular-nums ${amt === x ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`} onClick={() => setAmt(x)} data-testid={`move-amt-${x}`}>{fmt$(x)}</button>
        ))}
        <label className="flex items-center gap-1 text-[12px] text-stone-400">$<input type="number" min={0} step={100} value={amt} onChange={(e) => setAmt(Math.max(0, Math.round(Number(e.target.value) || 0)))} className="inp w-20 py-0.5 text-[12px] tabular-nums" aria-label="Amount to move" data-testid="move-amt-input" /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <button type="button" className="btn-gold w-full text-xs" disabled={!canDraw} data-testid="move-draw"
            onClick={() => queue({ kind: 'tribute', op: { op: 'move', from: 'treasury', to: 'personal', amount: amt } })}>
            Take a draw: {fmt$(amt)} into your pocket
          </button>
          <p className="mt-0.5 text-[10px] text-stone-500 leading-snug">{canDraw ? dipLine(s, queuedMoney(s, orders).dips) : `The Family has ${fmt$(fam)}.`}</p>
        </div>
        <div>
          <button type="button" className="btn-ghost w-full text-xs" disabled={!canBack} data-testid="move-back"
            onClick={() => queue({ kind: 'tribute', op: { op: 'move', from: 'personal', to: 'treasury', amount: amt } })}>
            Put {fmt$(amt)} back in the Family
          </button>
          <p className="mt-0.5 text-[10px] text-stone-500 leading-snug">{canBack ? 'The capos like a boss who does that (+2 each).' : `Your pocket has ${fmt$(pk)}.`}</p>
        </div>
      </div>
      {moves.length > 0 && (
        <ul className="space-y-0.5 text-[11px]" data-testid="move-queued">
          {moves.map(({ o, i }) => o.kind === 'tribute' && o.op.op === 'move' && (
            <li key={i} className="flex justify-between gap-2 text-sky-300">
              <span>{o.op.to === 'personal' ? `Draw ${fmt$(o.op.amount)} into your pocket` : `${fmt$(o.op.amount)} back into the Family`} (when you advance)</span>
              <button type="button" className="text-stone-500 hover:text-red-400" onClick={() => remove(i)}>cancel ✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
