import { BookNote } from '../book/TheBook';
import { createContext, useContext, useState } from 'react';
import { pocketCash } from '../../engine/tributeState';
import { sameTarget, targetOf } from '../../engine/deals';
import { DealWindow } from '../econ/DealWindow';
import { previewAction, queuedMoney } from '../../engine/actions';
import { dipPenalty, DIP, recentDips } from '../../engine/pocket';
import type { Acceptance } from '../../engine/interactions';
import type { GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import { Chips } from './Chips';
import { WhyPanel } from '../clarity/WhyPanel';
import { sameOrder, verbOf } from '../verbs';
import { actionFacts } from '../actionFacts';
import { AdviceButton } from '../advice/AdviceButton';
import { hoursLabel, timeBlock, timeCost } from '../../engine/timeCost';

/** Orders queued this week, and how to add one. Provided by the App. */
export interface OrdersApi {
  orders: PlayerAction[];
  /** `confirmed`: the player already said yes (a signed contract): no "Are you sure?" on top. */
  queue: (a: PlayerAction, confirmed?: boolean) => void;
  remove: (i: number) => void;
  /** "Do it tomorrow": give the order now, its hours come out of the next day (engine/timeCost.ts). */
  later?: (a: PlayerAction) => void;
  /** Replace one queued order in place (e.g. to approve Family money for it). */
  replace?: (i: number, a: PlayerAction) => void;
}

export const OrdersContext = createContext<OrdersApi>({ orders: [], queue: () => {}, remove: () => {} });

export function useOrders(): OrdersApi {
  return useContext(OrdersContext);
}

const same = sameOrder;

/**
 * One order the player can give: title, what it does as named chips, and a
 * button that queues it for this week. Disabled orders show why.
 */
export function ActionCard({ s, action, compact, label }: { s: GameState; action: PlayerAction; compact?: boolean; label?: string }) {
  const { orders, queue, later } = useOrders();
  const p = previewAction(s, action);
  const others = orders.filter((o) => !same(o, action));
  const q = queuedMoney(s, others);
  const budget = q.familyLeft;
  // The boss's hours (engine/timeCost.ts): what it takes out of his day; not enough left greys it out with the reason.
  const hours = timeCost(action, s);
  const noTime = timeBlock(s, action);
  // The boss's own things: his pocket pays. If it is short, the button names the Family money it takes,
  // and only that tap approves it (the order carries `fund: 'family'`; without it the week won't dip).
  const pocket = p.pot === 'pocket';
  const verb = verbOf(action, p);
  const short = pocket ? Math.max(0, p.cost - Math.max(0, q.pocketLeft)) : 0;
  // The preview's "Costly:" note reads the pots as they are; with other orders queued the dip note below is the truth.
  const detail = pocket && others.length && q.pocketLeft !== Math.max(0, pocketCash(s)) ? p.detail?.replace(/\s*Costly:.*$/, '') : p.detail;
  // A purchase opens the Deal window instead of queueing at the asking price.
  const deal = action.kind === 'econ' && action.op.type === 'deal' ? undefined : targetOf(action);
  const [dealing, setDealing] = useState(false);
  const queued = orders.some((o) => same(o, action) || (!!deal && o.kind === 'econ' && o.op.type === 'deal' && sameTarget(o.op.target, deal)));
  const broke = p.disabledReason || !(p.cost > 0) ? undefined
    : pocket ? (short > budget ? `Not enough: your pocket has ${fmt$(Math.max(0, q.pocketLeft))} and the Family ${fmt$(Math.max(0, budget))} after this week's orders` : undefined)
    : p.cost > budget ? `Only ${fmt$(budget)} of Family money left after this week's orders` : undefined;
  // At the table the price can come down: only a hard block stops the offer.
  const hard = deal ? (p.disabledReason && !/^Needs \$/.test(p.disabledReason) ? p.disabledReason : undefined) : p.disabledReason ?? broke;
  const why = hard ?? noTime;
  const facts = actionFacts(s, action, p);
  return (
    <div className={`rounded-md border px-3 py-2 ${queued ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[10rem] flex-1">
          <div className="font-semibold text-stone-100 text-sm">{label ?? p.title}</div>
          {(!compact || action.kind === 'talk') && detail && <div className="text-xs text-stone-400 mt-0.5">{detail}</div>}
          {p.cost > 0 && <div className={`text-[11px] mt-0.5 tabular-nums ${pocket ? 'text-amber-300' : 'text-gold-400'}`} data-testid="price-pot">{fmt$(p.cost)} {pocket ? 'from your pocket' : 'from Family money'}</div>}
          <div className="text-[11px] mt-0.5 text-sky-300" data-testid="time-cost">Takes {hoursLabel(hours)}</div>
        </div>
        <button
          className={queued ? 'btn-ghost text-xs py-1 shrink-0 max-w-full' : 'btn-gold text-xs py-1 shrink-0 max-w-full'}
          disabled={!!why || queued}
          onClick={() => (deal ? setDealing(true) : queue(short > 0 ? { ...action, fund: 'family' } : action))}
          data-testid={deal ? 'make-offer' : undefined}
        >
          {queued ? (deal ? 'Signed ✓' : verb.done) : deal ? 'Make an offer' : short > 0 && !why ? `Take ${fmt$(short)} from the Family & ${facts.button.charAt(0).toLowerCase()}${facts.button.slice(1)}` : facts.button}
        </button>
      </div>
      {short > 0 && !why && !queued && (
        <div className="mt-1 text-[11px] text-amber-300 leading-snug" data-testid="dip-note">
          Your pocket has {fmt$(Math.max(0, q.pocketLeft))}; the other {fmt$(short)} comes out of the Family. {dipPenalty(s, q.dips) ? `The capos notice: −${-dipPenalty(s, q.dips)} opinion each (${recentDips(s) + q.dips + 1} dips in ${DIP.window} weeks).` : `Once in ${DIP.window} weeks the capos let it go.`}
        </div>
      )}
      <Chips s={s} effects={p.effects} />
      {p.acceptance && <AcceptanceLine a={p.acceptance} />}
      {p.odds && <AcceptanceLine a={p.odds} prefix="Success" />}
      {p.warning && <div className="text-[11px] text-amber-400 mt-1">⚠ {p.warning}</div>}
      {p.refuseEffects && p.refuseEffects.length > 0 && (
        <div className="mt-1 text-[11px] text-stone-500">If the answer is no: <Chips s={s} effects={p.refuseEffects} /></div>
      )}
      {why && <div className="text-[11px] text-red-400 mt-1" data-testid="unavailable">Unavailable: {why.charAt(0).toLowerCase()}{why.slice(1)}</div>}
      {queued && !compact && <BookNote />}
      {!hard && noTime && !queued && later && (
        <button className="btn-gold text-xs py-1 mt-1" onClick={() => later(short > 0 ? { ...action, fund: 'family' } : action)} data-testid="do-tomorrow">Do it tomorrow</button>
      )}
      {!compact && !why && (
        <div className="mt-1 text-[11px] text-stone-500 leading-snug" data-testid="action-facts">
          <span className="text-stone-400">Who:</span> {facts.actor}{facts.target ? <> · <span className="text-stone-400">On:</span> {facts.target}</> : null} · <span className="text-stone-400">When:</span> {facts.timing}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <AdviceButton s={s} subject={{ kind: 'action', action }} />
      </div>
      <WhyPanel s={s} action={action} compact={compact} />
      {dealing && deal && <DealWindow s={s} target={deal} onClose={() => setDealing(false)} />}
    </div>
  );
}

/** "Will accept: 62%" with the reasons, CK style. */
export function AcceptanceLine({ a, prefix = 'Will accept' }: { a: Acceptance; prefix?: string }) {
  const pct = Math.round(a.chance * 100);
  return (
    <div className="mt-1.5 text-[11px]">
      <span className={`font-semibold ${pct >= 60 ? 'text-emerald-300' : pct >= 35 ? 'text-amber-300' : 'text-red-300'}`}>{prefix}: {pct}%</span>
      <span className="text-stone-500"> — </span>
      {a.reasons.map((r, i) => (
        <span key={i} className={`mr-2 inline-block whitespace-nowrap ${r.label === 'Base' ? 'text-stone-500' : r.value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {r.value > 0 ? '+' : r.value < 0 ? '−' : ''}{Math.abs(r.value)} {r.label}
        </span>
      ))}
    </div>
  );
}

/** The tray of this week's orders, above the tabs. */
export function OrdersTray({ s }: { s: GameState }) {
  const { orders, remove, replace } = useOrders();
  if (!orders.length) return null;
  const q = queuedMoney(s, orders);
  return (
    <div className="panel p-3" data-testid="orders-tray">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="panel-title text-base">This week's orders</div>
        <div className="text-xs text-stone-400 tabular-nums">
          After them: Family money <span className={q.familyLeft < 0 ? 'text-red-400' : 'text-gold-300'}>{fmt$(q.familyLeft)}</span> · your pocket <span className="text-amber-200">{fmt$(q.pocketLeft)}</span>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {orders.map((a, i) => {
          const p = previewAction(s, a);
          const left = queuedMoney(s, orders.slice(0, i)).pocketLeft;
          const short = p.pot === 'pocket' && a.fund !== 'family' ? Math.max(0, p.cost - Math.max(0, left)) : 0;
          return (
            <li key={i} className="rounded border border-noir-700 bg-noir-800/60 px-2.5 py-1.5">
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-stone-200">{p.title}</span>
                <button className="text-xs text-stone-500 hover:text-red-400" onClick={() => remove(i)}>cancel ✕</button>
              </div>
              <Chips s={s} effects={p.effects} />
              {a.fund === 'family' && p.pot === 'pocket' && <div className="text-[11px] text-amber-300">You approved Family money for what your pocket can't cover.</div>}
              {short > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-red-300" data-testid="order-unfunded">
                  By the time it runs your pocket is {fmt$(short)} short. It won't be carried out unless you approve Family money.
                  {replace && <button type="button" className="btn-ghost text-[11px] py-0" onClick={() => replace(i, { ...a, fund: 'family' })}>Take {fmt$(short)} from the Family</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] text-stone-500">Orders are carried out when you advance the week. Everything they cost shows up by name in the weekly report.</p>
    </div>
  );
}
