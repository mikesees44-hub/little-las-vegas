import { useMemo } from 'react';
import { currentRung, LADDER, riseChart, rungDone, riseSummary, type CapoNode, type RiseNode } from '../../engine/riseView';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { useSheet } from '../components/People';
import type { GuidedGoal } from '../shell/goals';

/**
 * THE RISE (engine/riseView.ts): grow the family. The ladder across the top
 * (seven rungs, each with what it opens), the capos front and center (their
 * territory, take and trend, the threat, mood, ambition, the men they are
 * bringing up), every man's level, focus and newest perk, and the badges that
 * matter. A badge opens the man's sheet, where the Crew verbs are.
 */

const BADGE_TONE: Record<string, string> = { made: 'border-emerald-500 text-emerald-200', crew: 'border-gold-500 text-gold-200', passed: 'border-red-500 text-red-200' };

function Bar({ frac, className = 'w-10' }: { frac: number; className?: string }) {
  return <span className={`inline-block h-1 overflow-hidden rounded bg-noir-700 align-middle ${className}`} aria-hidden><span className="block h-full bg-gold-500" style={{ width: `${Math.round(frac * 100)}%` }} /></span>;
}

function NodeLine({ n, small }: { n: RiseNode; small?: boolean }) {
  const { open } = useSheet();
  return (
    <div className="flex min-w-0 items-center gap-1.5" data-testid="rise-node">
      <button type="button" className={`min-w-0 truncate text-left ${small ? 'text-[11px]' : 'text-[12px] font-semibold'} text-stone-100 hover:text-gold-300`} onClick={() => open(n.id)}>{n.name}</button>
      <span className="shrink-0 rounded border border-noir-600 px-1 text-[9px] uppercase tracking-wider text-stone-400" data-testid="rise-rank">{n.rank}</span>
      <span className={`shrink-0 rounded border px-1 text-[10px] tabular-nums ${n.lvl >= 7 ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-300'}`} title={n.title}>Lv {n.lvl}</span>
      <Bar frac={n.frac} className="w-8 shrink-0" />
      {n.rank !== 'boss' && <span className="shrink-0 text-gold-300" title={`${n.focus.name} focus`} aria-label={`${n.focus.name} focus`}>{n.focus.icon}</span>}
      {n.perk && <span className="min-w-0 truncate text-[10px] text-stone-400" data-testid="rise-perk">{n.perk}</span>}
      {n.ticked && <span className="shrink-0 text-[10px] text-emerald-400" aria-label="a skill went up">▲</span>}
      {n.badges.map((b) => (
        <button key={b.kind} type="button" className={`shrink-0 rounded-full border px-1.5 text-[9px] ${BADGE_TONE[b.kind]}`} onClick={() => open(n.id)} title={`${b.verb}: on his sheet, Crew`} data-testid={`rise-badge-${b.kind}`}>{b.label}</button>
      ))}
    </div>
  );
}

function CapoCard({ k }: { k: CapoNode }) {
  const { open } = useSheet();
  return (
    <article className="rounded-md border border-gold-700/50 bg-noir-800/70 p-2" data-testid="rise-capo">
      <NodeLine n={k} />
      <div className="mt-1 grid grid-cols-2 gap-x-2 text-[11px] text-stone-400">
        <div>{k.district ? <>⌂ {k.district.name}</> : <span className="text-amber-300">No district</span>}</div>
        <div className="text-right tabular-nums">{fmt$(k.take)}{k.trend ? <span className={k.trend > 0 ? 'text-emerald-400' : 'text-red-400'}> {k.trend > 0 ? '▲' : '▼'}{fmt$(Math.abs(k.trend))}</span> : null}</div>
        <div>Mood: <span className={k.loyalty >= 15 ? 'text-emerald-300' : k.loyalty >= -10 ? 'text-stone-300' : 'text-red-300'}>{k.mood}</span> ({k.loyalty})</div>
        <div className="text-right">{k.threat ? <span className="text-red-300">⚠ {k.threat.rival} {k.threat.influence}%</span> : <span className="text-stone-500">no threat</span>}</div>
      </div>
      {k.ambition && <div className="mt-0.5 truncate text-[10px] text-amber-200/80" title={k.ambition}>Wants: {k.ambition}</div>}
      <div className="mt-1 border-t border-noir-700 pt-1">
        <div className="text-[9px] uppercase tracking-[0.2em] text-stone-500">His men ({k.men.length})</div>
        <ul className="mt-0.5 space-y-0.5">{k.men.slice(0, 8).map((m) => <li key={m.id}><NodeLine n={m} small /></li>)}</ul>
        {k.men.length > 8 && <button type="button" className="text-[10px] text-gold-400" onClick={() => open(k.id)}>+{k.men.length - 8} more</button>}
      </div>
    </article>
  );
}

export function Ladder({ s, compact }: { s: GameState; compact?: boolean }) {
  const { at, next } = currentRung(s);
  return (
    <ol className={`grid gap-1 ${compact ? 'grid-cols-7' : 'grid-cols-2 min-[480px]:grid-cols-4 lg:grid-cols-7'}`} data-testid="rise-ladder">
      {LADDER.map((r) => {
        const done = rungDone(s, r) && r.n <= at.n;
        const cur = next?.n === r.n;
        return (
          <li key={r.id} className={`rounded-md border ${compact ? 'px-1.5 py-1' : 'px-2 py-1.5'} ${done ? 'border-emerald-700/60 bg-emerald-900/10' : cur ? 'border-gold-500 bg-gold-500/10' : 'border-noir-700 opacity-70'}`} data-testid={`rise-rung-${r.n}`} title={`${r.milestone} Opens: ${r.opens}.`}>
            <div className={`text-[11px] ${done ? 'font-semibold text-emerald-400' : cur ? 'text-gold-300' : 'text-stone-500'}`}>{done ? '✓ Done' : cur ? `${r.n} · now` : r.n}</div>
            {!compact && <div className="text-[12px] font-semibold leading-tight text-stone-100">{r.title}</div>}
            {!compact && <div className={`mt-0.5 text-[10.5px] leading-snug text-stone-400 ${cur ? '' : 'hidden sm:block'}`}>Opens: {r.opens}</div>}
            {cur && <Bar frac={r.progress(s)} className="w-full" />}
          </li>
        );
      })}
    </ol>
  );
}

/** The Rise as a place (The Family › The Rise). */
export function TheRise({ s }: { s: GameState }) {
  const chart = useMemo(() => riseChart(s), [s]);
  const sum = useMemo(() => riseSummary(s), [s]);
  return (
    <div className="space-y-3" data-testid="the-rise">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="llv-section-title">The ladder</h4>
          <div className="text-[11px] text-stone-400">Rung {sum.rung.n}: {sum.rung.title}{sum.next ? ` · next: ${sum.next.title}` : ' · the top'}</div>
        </div>
        <Ladder s={s} />
        {sum.next && <div className="mt-1.5 text-[12px] text-stone-300">{sum.next.milestone} {sum.steps.length ? <span className="text-amber-200">Next: {sum.steps.join('; ')}.</span> : null}</div>}
      </section>
      <section className="rounded-md border border-gold-600/50 bg-noir-900/60 p-2">
        <NodeLine n={chart.boss} />
        {chart.admin.length > 0 && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{chart.admin.map((n) => <NodeLine key={n.id} n={n} />)}</div>}
      </section>
      <section>
        <h4 className="llv-section-title">Your capos run the street</h4>
        <div className="mt-1 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{chart.capos.map((k) => <CapoCard key={k.id} k={k} />)}</div>
        {!chart.capos.length && <p className="text-[12px] text-stone-500">No capos yet. Push a district to 40% and your best soldier steps up to run it.</p>}
      </section>
      {chart.direct.length > 0 && (
        <section>
          <h4 className="llv-section-title">Report straight to you</h4>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">{chart.direct.map((n) => <li key={n.id}><NodeLine n={n} small /></li>)}</ul>
        </section>
      )}
      <p className="text-[11px] text-stone-500">Every man grows on his own along his focus; skills tick up and perks come by themselves. Open a man to set his focus or pin a branch, if you want to.</p>
    </div>
  );
}

/** The Desk's side column: the rung, progress to the next, the next steps, who is ready, and the guided goal (replaces the Goals card). */
export function RiseColumn({ s, goals, onShow, onRise }: { s: GameState; goals?: GuidedGoal[]; onShow?: (g: GuidedGoal) => void; onRise?: () => void }) {
  const sum = riseSummary(s);
  const { open } = useSheet();
  const cur = goals?.find((g) => !g.done);
  return (
    <section className="rounded-md border border-gold-600/40 bg-noir-900/70 p-2 text-[12px]" data-testid="rise-column">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">The Rise · rung {sum.rung.n} of 7</div>
        {onRise && <button type="button" className="text-[10px] text-gold-400 hover:text-gold-300" onClick={onRise} data-testid="rise-open">Open ▸</button>}
      </div>
      <div className="font-semibold text-stone-100">{sum.rung.title}{sum.next ? <span className="font-normal text-stone-400"> → {sum.next.title}</span> : ''}</div>
      {sum.next && <div className="mt-0.5"><Bar frac={sum.progress} className="w-full" /></div>}
      {sum.steps.length > 0 && <ul className="mt-1 space-y-0.5 text-[11px] text-amber-200/90">{sum.steps.map((x) => <li key={x}>• {x}</li>)}</ul>}
      {sum.ready.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-t border-noir-700 pt-1 text-[11px]">
          {sum.ready.map((n) => <li key={n.id}><button type="button" className="text-left text-stone-200 hover:text-gold-300" onClick={() => open(n.id)}>{n.name}: <span className="text-emerald-300">{n.badges[0].label}</span></button></li>)}
        </ul>
      )}
      {cur && (
        <div className="mt-1 border-t border-noir-700 pt-1" data-testid="goals-card">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Goal</div>
          <div className="text-[11px] font-semibold text-stone-200" data-testid="goal-current">{cur.title}</div>
          {cur.show && onShow && <button type="button" className="mt-0.5 rounded border border-gold-500 px-2 py-0.5 text-[10px] font-semibold text-gold-300 hover:bg-gold-500/15" onClick={() => onShow(cur)} data-testid="goal-show">Show me</button>}
        </div>
      )}
    </section>
  );
}
