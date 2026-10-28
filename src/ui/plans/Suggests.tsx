import { useMemo, useState } from 'react';
import type { GameState } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { useSheet } from '../components/People';
import { fmt$ } from '../format';
import { GOALS } from './actionGoals';
import { underbossSuggests, type Pick } from './suggest';

/** Small chips: money (and which pot), hours, odds, the main risk. */
export function CostChips({ cost, pot, hours, odds, risk }: { cost: number; pot: 'family' | 'pocket'; hours: string; odds?: number; risk?: string }) {
  const chip = 'rounded border px-1 py-px text-[10px] leading-tight whitespace-nowrap';
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid="option-chips">
      {cost > 0 && <span className={`${chip} ${pot === 'pocket' ? 'border-amber-700/70 text-amber-300' : 'border-gold-700/70 text-gold-300'}`} data-testid="chip-money">{fmt$(cost)} {pot === 'pocket' ? 'pocket' : 'Family'}</span>}
      <span className={`${chip} border-sky-800/70 text-sky-300`} data-testid="chip-hours">{hours}</span>
      {odds !== undefined && <span className={`${chip} ${odds >= 60 ? 'border-emerald-800/70 text-emerald-300' : odds >= 35 ? 'border-amber-800/70 text-amber-300' : 'border-red-800/70 text-red-300'}`} data-testid="chip-odds">{odds}%</span>}
      {risk && <span className={`${chip} border-red-900/70 text-red-300/90`} data-testid="chip-risk">⚠ {risk}</span>}
    </span>
  );
}

function PickRow({ s, p, n, queued, onGive, onSkip }: { s: GameState; p: Pick; n: number; queued: boolean; onGive: () => void; onSkip: () => void }) {
  const g = GOALS.find((x) => x.id === p.goal)!;
  void s;
  return (
    <li className="rounded border border-noir-700 bg-noir-950/50 px-2 py-1.5" data-testid="suggest-pick">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-4 shrink-0 text-center text-[11px] text-stone-500" title={g.label}>{n}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-stone-100">{p.label} <span className="font-normal text-[10px] text-stone-500">· {g.label.toLowerCase()}</span></div>
          <CostChips cost={p.cost} pot={p.pot} hours={p.hours} odds={p.odds} risk={p.risk} />
          <p className="mt-0.5 text-[11px] italic text-stone-300" data-testid="suggest-says">“{p.says.replace(/^["“]|["”]$/g, '')}”</p>
          <div className="text-[10px] text-stone-500">
            His read: <span className="text-stone-300">{p.verdict}</span> · {p.sure.toLowerCase()}{p.but ? ` · ${p.but}` : ''}{p.worry ? ` · worried about ${p.worry}` : ''}
          </div>
          {p.bias && <div className="text-[10px] text-amber-300/90" data-testid="suggest-bias">He may lean: {p.bias}</div>}
          {p.dissent && <div className="text-[10px] text-sky-300/90" data-testid="suggest-dissent">{p.dissent.who} says {p.dissent.verdict.toLowerCase()}: “{p.dissent.says.replace(/^["“]|["”]$/g, '')}”</div>}
          {p.blind && <div className="text-[10px] text-stone-500">What he can't see: {p.blind}</div>}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" className={`text-[11px] py-0.5 px-2 ${queued ? 'btn-ghost' : 'btn-gold'}`} disabled={queued} onClick={onGive} data-testid="suggest-give" title="Give this order (you decide; it asks first)">{queued ? 'Given ✓' : 'Give the order'}</button>
          <button type="button" className="text-[10px] text-stone-500 hover:text-gold-300" onClick={onSkip} data-testid="suggest-skip">not now</button>
        </div>
      </div>
    </li>
  );
}

/**
 * "What Sal would do": the underboss's opinion on the week, three picks at
 * most, with his reasons, his worries, his possible bias and who disagrees.
 * One order at a time, the boss's click each (with its own confirm).
 */
export function UnderbossSuggests({ s, compact }: { s: GameState; compact?: boolean }) {
  const { orders, queue } = useOrders();
  const { open } = useSheet();
  const [skip, setSkip] = useState<string[]>([]);
  const sug = useMemo(() => underbossSuggests(s, { orders }, 3 + skip.length), [s, orders, skip.length]);
  const picks = sug.picks.filter((p) => !skip.includes(p.key)).slice(0, 3);
  const queued = (p: Pick) => orders.some((o) => JSON.stringify(o) === p.key);
  return (
    <section className={`rounded-md border border-gold-700/40 bg-noir-800/50 ${compact ? 'p-2' : 'p-2.5'}`} data-testid="underboss-suggests">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] font-semibold text-gold-300">
          {sug.speaker ? <>What <button type="button" className="underline decoration-dotted hover:text-gold-200" onClick={() => open(sug.speaker!.charId)}>{sug.speaker.name}</button> would do</> : 'What your people would do'}
        </div>
        {sug.speaker && <span className="text-[10px] text-stone-500">{sug.speaker.title}</span>}
      </div>
      <p className="text-[10px] text-stone-500">His opinion, not the answer. He leans his own way and he can be wrong: you decide.</p>
      {!picks.length ? <p className="mt-1 text-[11px] text-stone-400" data-testid="suggest-empty">{sug.empty ?? 'Nothing more he would push this week.'}</p> : (
        <ol className="mt-1 space-y-1">
          {picks.map((p, i) => <PickRow key={p.key} s={s} p={p} n={i + 1} queued={queued(p)} onGive={() => queue(p.action)} onSkip={() => setSkip((x) => [...x, p.key])} />)}
        </ol>
      )}
    </section>
  );
}
