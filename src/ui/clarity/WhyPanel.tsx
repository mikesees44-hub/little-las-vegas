import { useState } from 'react';
import { explainAction, type ActionExplanation, type NamedEffect, type Risk, type Verdict } from '../../engine/advice';
import type { ChoiceAdvice } from '../../engine/advice';
import type { GameState, PlayerAction } from '../../engine/types';

/**
 * The "Why" panel shown with every order, interaction and decision option:
 * a verdict and the purpose in one line, and — opened — what it gets you,
 * what it costs, what can go wrong (with the odds and where they come from),
 * what it sets up, and when it is best done. Short by default.
 */

const VERDICT_TONE: Record<Verdict['tone'], string> = {
  good: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/70',
  warn: 'bg-amber-900/50 text-amber-200 border-amber-700/70',
  bad: 'bg-blood-500/25 text-red-200 border-blood-500/60',
  blocked: 'bg-noir-800 text-stone-400 border-noir-600',
  neutral: 'bg-noir-700/80 text-stone-200 border-noir-600',
};

export function VerdictTag({ v, title }: { v: Verdict; title?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${VERDICT_TONE[v.tone]}`} title={title ?? v.because} data-testid="verdict">
      {v.label}
    </span>
  );
}

const WHEN_LABEL: Record<NamedEffect['when'], string> = { now: '', 'if accepted': 'if yes', 'if it works': 'if it works', 'next week': 'next week', 'per week': 'per week', later: 'later' };

function FxChip({ n }: { n: NamedEffect }) {
  const cls = n.tone === 'good' ? 'chip-good' : n.tone === 'bad' ? 'chip-bad' : 'chip-neutral';
  const w = WHEN_LABEL[n.when];
  return (
    <span className={cls} title={n.label}>
      {n.text}
      {w && !n.text.includes('/wk') && <span className="ml-1 opacity-60">{w}</span>}
    </span>
  );
}

function RiskLine({ r }: { r: Risk }) {
  const tone = r.severity === 'high' ? 'text-red-300' : r.severity === 'mid' ? 'text-amber-300' : 'text-stone-400';
  return (
    <li className={`${tone} leading-snug`}>
      <span className="tabular-nums font-semibold">{Math.round(r.chance * 100)}%</span> {r.text.replace(/^\d+% /, '')}
      <span className="text-stone-600"> — {r.source}</span>
    </li>
  );
}

/** The opened body, from an explanation (reused by decision options and pickers). */
export function WhyBody({ ex, hidePurpose }: { ex: ActionExplanation; hidePurpose?: boolean }) {
  return (
    <div className="mt-1.5 space-y-1.5 rounded border border-noir-700 bg-noir-950/60 p-2 text-[11px]" data-testid="why-body">
      {!hidePurpose && <p className="text-stone-300"><span className="text-gold-300 font-semibold">Why: </span>{ex.purpose}</p>}
      {ex.gains.length > 0 && (
        <div><span className="text-stone-500 mr-1">Gets you</span><span className="inline-flex flex-wrap gap-1 align-middle">{ex.gains.map((n, i) => <FxChip key={i} n={n} />)}</span></div>
      )}
      {ex.costs.length > 0 && (
        <div><span className="text-stone-500 mr-1">Costs</span><span className="inline-flex flex-wrap gap-1 align-middle">{ex.costs.map((n, i) => <FxChip key={i} n={n} />)}</span></div>
      )}
      {ex.changes.length > 0 && (
        <div><span className="text-stone-500 mr-1">Changes</span><span className="inline-flex flex-wrap gap-1 align-middle">{ex.changes.map((n, i) => <FxChip key={i} n={n} />)}</span></div>
      )}
      {ex.risks.length > 0 && (
        <div>
          <div className="text-stone-500">What can go wrong</div>
          <ul className="mt-0.5 space-y-0.5">{ex.risks.map((r, i) => <RiskLine key={i} r={r} />)}</ul>
        </div>
      )}
      {ex.unlocks.length > 0 && <div className="text-sky-300"><span className="text-stone-500">Sets up: </span>{ex.unlocks.join(' · ')}</div>}
      {ex.bestWhen.length > 0 && (
        <div>
          <div className="text-stone-500">Best when</div>
          <ul className="mt-0.5 grid gap-x-3 sm:grid-cols-2">
            {ex.bestWhen.map((c, i) => <li key={i} className={c.met ? 'text-emerald-300' : 'text-stone-500'}>{c.met ? '✓' : '○'} {c.text}</li>)}
          </ul>
        </div>
      )}
      <div className="text-stone-500 italic">{ex.verdict.label}: {ex.verdict.because}</div>
    </div>
  );
}

/** One line under an order: verdict + purpose, and a "why?" toggle. */
export function WhyPanel({ s, action, ex: given, compact }: { s: GameState; action?: PlayerAction; ex?: ActionExplanation; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ex = given ?? (action ? explainAction(s, action) : undefined);
  if (!ex) return null;
  return (
    <div className="mt-1.5" data-testid="why-panel">
      <div className="flex items-start gap-1.5">
        <VerdictTag v={ex.verdict} />
        {!compact && <span className="min-w-0 flex-1 text-[11px] leading-snug text-stone-400">{ex.purpose}</span>}
        <button type="button" className={`${compact ? 'ml-auto' : ''} shrink-0 text-[11px] text-gold-300 hover:underline`} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} aria-expanded={open}>
          {open ? 'less' : 'why?'}
        </button>
      </div>
      {open && <WhyBody ex={ex} hidePurpose={!compact} />}
    </div>
  );
}

const TAG_TONE: Record<string, string> = { 'Best value': 'border-gold-500 text-gold-300', Cheapest: 'border-sky-700 text-sky-300', Safest: 'border-emerald-700 text-emerald-300' };

/** Under one option of a weekly decision: why you might pick it, how it compares, and the details. */
export function ChoiceWhy({ a }: { a: ChoiceAdvice }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1" data-testid="choice-why">
      <div className="flex flex-wrap items-start gap-1.5 text-[11px]">
        {a.tags.map((t) => <span key={t} className={`rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${TAG_TONE[t] ?? 'border-noir-600 text-stone-300'}`}>{t}</span>)}
        {(a.ex.verdict.tone === 'warn' || a.ex.verdict.tone === 'bad') && <VerdictTag v={a.ex.verdict} />}
        <span className="min-w-0 flex-1 leading-snug text-stone-300 italic">{a.ex.purpose}</span>
        <button type="button" className="shrink-0 text-gold-300 hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'less' : 'why?'}</button>
      </div>
      {open && <WhyBody ex={a.ex} hidePurpose />}
    </div>
  );
}
