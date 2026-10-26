import { CATALOG } from '../../engine/catalog';
import { earnerAction, earnerName, earnerOf, earnerWeekly, freeEarners, holders, steadyWord, suggestFor } from '../../engine/earners';
import { previewAction } from '../../engine/actions';
import type { Character, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { useOrders } from '../components/Orders';
import { CharLink } from '../components/People';

/**
 * STEADY EARNERS: the boss and every capo, each with his one signature
 * earner (or the underboss's suggestion and a one-tap "Give it to him").
 * Self-contained section (the Rackets hub carries it).
 */
export function SteadyEarners({ s }: { s: GameState }) {
  const { orders } = useOrders();
  const men = holders(s);
  // One suggestion per place: the first man without an earner gets the best, the next the next best.
  const taken = new Set<string>(orders.flatMap((o) => (o.kind === 'econ' && o.op.type === 'racket' && o.op.cmd.c === 'earner' ? [o.op.cmd.bizId] : [])));
  const sugs: Record<string, string | undefined> = {};
  for (const c of men) {
    if (earnerOf(s, c.id)) continue;
    const b = suggestFor(s, c, taken);
    if (b) { taken.add(b.id); sugs[c.id] = b.id; }
  }
  return (
    <section className="rounded-md border border-emerald-700/50 bg-emerald-900/10 p-3" data-testid="steady-earners">
      <div className="panel-title">Steady earners</div>
      <p className="text-[11px] text-stone-400 mt-0.5">Every capo, and you, can have one thing that is his: it pays every week, no swings. A capo keeps 15%, kicks up the rest, and stays loyal; without one he grumbles. Yours pays into your Pocket.</p>
      <ul className="mt-2 space-y-1.5">
        {men.map((c) => <EarnerRow key={c.id} s={s} c={c} suggest={sugs[c.id] ?? ''} />)}
      </ul>
    </section>
  );
}

export function EarnerRow({ s, c, suggest }: { s: GameState; c: Character; suggest?: string }) {
  const { orders, queue } = useOrders();
  const boss = c.id === s.playerId;
  const b = earnerOf(s, c.id);
  const pendingOrder = orders.find((o) => o.kind === 'econ' && o.op.type === 'racket' && o.op.cmd.c === 'earner' && o.op.cmd.who === c.id);
  const pendingBiz = pendingOrder && pendingOrder.kind === 'econ' && pendingOrder.op.type === 'racket' && pendingOrder.op.cmd.c === 'earner' ? s.businesses.find((x) => pendingOrder.op.type === 'racket' && pendingOrder.op.cmd.c === 'earner' && x.id === pendingOrder.op.cmd.bizId) : undefined;
  const sug = b ? undefined : suggest !== undefined ? s.businesses.find((x) => x.id === suggest) : suggestFor(s, c);
  // A racket ordered this week with him as its steady earner.
  const startOrder = orders.find((o) => o.kind === 'econ' && o.op.type === 'racket' && o.op.cmd.c === 'start' && o.op.cmd.runner === c.id && o.op.cmd.earner);
  const others = freeEarners(s);
  const give = (bizId: string) => { const a = earnerAction(c.id, bizId); if (!previewAction(s, a).disabledReason) queue(a); };
  return (
    <li className="rounded border border-noir-700 bg-noir-900/50 px-2 py-1.5" data-testid="earner-row" data-who={c.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <div className="text-xs text-stone-200 font-semibold">{boss ? 'You' : <CharLink s={s} id={c.id} />}<span className="ml-1 text-[10px] font-normal uppercase tracking-wider text-stone-500">{boss ? 'boss' : 'capo'}</span></div>
        {b && <div className="text-[11px] text-gold-300 tabular-nums">~{fmt$(earnerWeekly(s, b))}/wk{boss ? ' → your Pocket' : ''}</div>}
      </div>
      {b ? (
        <div className="text-[11px] text-emerald-200" data-testid="earner-has">★ {earnerName(s, c, b)} <span className="text-stone-500">({b.name}{steadyWord(b.kind) === 'steady' ? ', steady kind' : ''})</span></div>
      ) : startOrder && startOrder.kind === 'econ' && startOrder.op.type === 'racket' && startOrder.op.cmd.c === 'start' ? (
        <div className="text-[11px] text-gold-200">Ordered: a new {CATALOG[startOrder.op.cmd.kind].name.toLowerCase()} becomes {boss ? 'your' : 'his'} earner when the week ends.</div>
      ) : pendingBiz ? (
        <div className="text-[11px] text-gold-200">Ordered: {pendingBiz.name} becomes {boss ? 'your' : 'his'} earner when the week ends.</div>
      ) : sug ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-amber-200">{boss ? 'Nothing of your own yet.' : `${c.firstName} has nothing steady.`} Suggested: {sug.name} (~{fmt$(earnerWeekly(s, sug))}/wk)</span>
          <button type="button" className="btn-gold text-xs py-1" onClick={() => give(sug.id)} data-testid="earner-give">{boss ? 'Take it' : `Give ${c.firstName} ${sug.name}`}</button>
        </div>
      ) : (
        <div className="text-[11px] text-stone-500">{boss ? 'Nothing of your own yet.' : `${c.firstName} has nothing steady.`} Start a racket for {boss ? 'yourself' : 'him'} above.</div>
      )}
      {b && others.length > 0 && !pendingOrder && (
        <label className="mt-1 flex items-center gap-1 text-[10px] text-stone-500">Change to
          <select className="rounded border border-noir-600 bg-noir-800 px-1 py-0.5 text-[11px] text-stone-200" value="" onChange={(e) => e.target.value && give(e.target.value)} aria-label={`Change ${c.firstName}'s earner`}>
            <option value="">…</option>
            {others.map((x) => <option key={x.id} value={x.id}>{x.name} (~{fmt$(earnerWeekly(s, x))}/wk)</option>)}
          </select>
        </label>
      )}
    </li>
  );
}
