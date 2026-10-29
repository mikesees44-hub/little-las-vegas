import { BookNote } from '../book/TheBook';
import { createContext, useContext, useState } from 'react';
import { pocketCash } from '../../engine/tributeState';
import { sameTarget, targetOf } from '../../engine/deals';
import { DealWindow } from '../econ/DealWindow';
import { previewAction, queuedMoney, type ActionPreview } from '../../engine/actions';
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
import { actNow, settlesNow } from '../../engine/deeds/now';
import { useShell } from '../shell/context';
import { postNow } from '../deeds/NowResult';
import { DecisionCard, type DecisionOption } from '../decide/DecisionCard';
import { heavyOf } from '../../engine/heavy';
import { getSettings } from '../settings';
import { voicesFor } from '../decide/voices';
import { oddsOfPreview, worstOfPreview } from '../../engine/decide';


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
  // A person interaction is settled in the moment (deeds/now.ts): the odds are on this card; the roll happens on the tap.
  const shell = useShell();
  const now = !!shell.update && !deal && settlesNow(s, action);
  const [nowErr, setNowErr] = useState<string | undefined>();
  const odds = p.acceptance ?? p.odds;
  const [voicesOpen, setVoicesOpen] = useState(false);
  const doNow = () => {
    const r = actNow(s, short > 0 ? { ...action, fund: 'family' } : action);
    if (!r.result.ok) { setNowErr(r.result.error); return; }
    shell.update!(() => r.state);
    postNow(r.result);
  };
  const buttonText = now ? `${short > 0 ? `Take ${fmt$(short)} from the Family & do` : 'Do'} it now${odds ? ` (${Math.round(odds.chance * 100)}%)` : ''}` : queued ? (deal ? 'Signed ✓' : verb.done) : deal ? 'Make an offer' : short > 0 && !why ? `Take ${fmt$(short)} from the Family & ${facts.button.charAt(0).toLowerCase()}${facts.button.slice(1)}` : facts.button;
  // The card is the confirmation (STREAMLINE §4.4): a heavy order turns the card over first; then it is given, no second window.
  const go = () => (deal ? setDealing(true) : now ? doNow() : queue(short > 0 ? { ...action, fund: 'family' } : action, true));
  const heavy = !deal && getSettings().confirmOrders !== false ? heavyOf(s, action) : undefined;
  const tomorrow = !hard && noTime && !queued && later ? () => later(short > 0 ? { ...action, fund: 'family' } : action) : undefined;
  // One decision standard (ui/decide): the order is the card's one option, with its odds (or "certain"), its worst way, and one primary button.
  const opt: DecisionOption = {
    id: 'go', label: label ?? p.title, effects: p.effects, odds: oddsOfPreview(p), worst: worstOfPreview(p), 
    detail: (!compact || action.kind === 'talk') && detail ? detail : undefined,
    note: (
      <span className="block">
        {p.cost > 0 && <span className={`mt-0.5 block text-[11px] tabular-nums ${pocket ? 'text-amber-300' : 'text-gold-400'}`} data-testid="price-pot">{fmt$(p.cost)} {pocket ? 'from your pocket' : 'from Family money'}</span>}
        <span className="mt-0.5 block text-[11px] text-sky-300" data-testid="time-cost">Takes {hoursLabel(hours)}</span>
        {short > 0 && !why && !queued && (
          <span className="mt-1 block text-[11px] leading-snug text-amber-300" data-testid="dip-note">
            Your pocket has {fmt$(Math.max(0, q.pocketLeft))}; the other {fmt$(short)} comes out of the Family. {dipPenalty(s, q.dips) ? `The capos notice: −${-dipPenalty(s, q.dips)} opinion each (${recentDips(s) + q.dips + 1} dips in ${DIP.window} weeks).` : `Once in ${DIP.window} weeks the capos let it go.`}
          </span>
        )}
        {p.outcomes && p.outcomes.length > 1 && !compact && <Outcomes s={s} outcomes={p.outcomes} />}
        {p.cooldown !== undefined && <span className="mt-1 block text-[11px] text-stone-500" data-testid="deed-cooldown">Then not again with this person for {p.cooldown} weeks.</span>}
        {p.warning && <span className="mt-1 block text-[11px] text-amber-400">⚠ {p.warning}</span>}
        {nowErr && <span className="mt-1 block text-[11px] text-red-400">{nowErr}</span>}
        {now && !why && <span className="mt-1 block text-[11px] text-stone-500">Settled the moment you do it: the dice roll now, and it is done.</span>}
        {why && <span className="mt-1 block text-[11px] text-red-400" data-testid="unavailable">Unavailable: {why.charAt(0).toLowerCase()}{why.slice(1)}</span>}
        {!compact && !why && (
          <span className="mt-1 block text-[11px] leading-snug text-stone-500" data-testid="action-facts">
            <span className="text-stone-400">Who:</span> {facts.actor}{facts.target ? <> · <span className="text-stone-400">On:</span> {facts.target}</> : null} · <span className="text-stone-400">When:</span> {facts.timing}
          </span>
        )}
      </span>
    ),
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${queued ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/70'}`} data-testid="action-card">
      <DecisionCard s={s} compact options={[opt]} selected="go"
        voices={!compact && voicesOpen ? voicesFor(s, { kind: 'action', action }) : undefined}
        primaryLabel={() => buttonText}
        confirmFor={heavy ? () => ({ title: label ?? p.title, lines: [...heavy, ...(p.cost > 0 ? [`${fmt$(p.cost)} ${pocket ? 'from your pocket' : 'from Family money'}`] : []), `Takes ${hoursLabel(hours)}.`], yes: 'Yes, do it' }) : undefined}
        onDecide={() => { if (!why && !(queued && !now)) go(); }}
        onLater={tomorrow} laterLabel="Do it tomorrow"
        advice={<span className="flex flex-wrap items-center gap-2">
          <AdviceButton s={s} subject={{ kind: 'action', action }} />
          {!compact && !voicesOpen && <button type="button" className="btn-quiet text-[11px]" onClick={() => setVoicesOpen(true)} data-testid="voices-open">Your people weigh in ▸</button>}
        </span>}
        testid="action-decision"
        primaryTestId={deal ? 'make-offer' : now ? 'do-now' : undefined}
        primaryDisabled={!!why || (queued && !now)}
      />
      {queued && !compact && <BookNote />}
      <WhyPanel s={s} action={action} compact={compact} />
      {dealing && deal && <DealWindow s={s} target={deal} onClose={() => setDealing(false)} />}
    </div>
  );
}

/** "Will accept: 62%" with the reasons, CK style. */
/** Every way it can go (deeds/): better than hoped, success, failure, disaster, each with its chance and its effects. */
function Outcomes({ s, outcomes }: { s: GameState; outcomes: NonNullable<ActionPreview['outcomes']> }) {
  const tone: Record<string, string> = { crit: 'text-emerald-300', success: 'text-emerald-400/90', fail: 'text-amber-300', critFail: 'text-red-300' };
  return (
    <div className="mt-1.5 grid gap-1 text-[11px]" data-testid="deed-outcomes">
      {outcomes.map((o) => (
        <div key={o.tier} className="rounded border border-noir-700/70 px-2 py-1">
          <span className={`font-semibold ${tone[o.tier] ?? 'text-stone-300'}`}>{o.label} · {Math.round(o.chance * 100)}%</span>
          <span className="text-stone-400"> — {o.text}</span>
          {o.effects.length > 0 && <div className="mt-0.5"><Chips s={s} effects={o.effects} /></div>}
        </div>
      ))}
    </div>
  );
}

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
