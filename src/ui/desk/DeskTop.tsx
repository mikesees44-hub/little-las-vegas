import { useMemo, useState } from 'react';
import { ambitionsView, type AmbGo, type AmbView } from '../../engine/ambitions';
import { oddsWord } from '../../engine/decide';
import { stormWarnings, type Storm } from '../../engine/storms';
import type { GameState } from '../../engine/types';
import { whatChanged } from '../../engine/weekDiff';
import { domClass, type Domain } from '../domain';
import { Glossed } from '../clarity/Term';
import { SomewhereToGo } from '../shell/sections/Outposts';

/**
 * THE TOP OF THE DESK (EASIER_NOT_SHALLOWER): three things a player reads before the papers.
 *
 *   WORKING TOWARD   the three goals (engine/ambitions.ts): each with its bar, its reward, "Show me"
 *   STORM WARNINGS   what lands in the next two weeks (engine/storms.ts): the odds in words, the biggest
 *                    reason, and what would help, each a link
 *   WHAT CHANGED?    after the week's turn (engine/weekDiff.ts): three to five lines, a link to Your File,
 *                    dismissed for the week with ×
 *
 * Nothing here is a new option: every link opens a screen that was already there.
 */

type Go = (r: AmbGo) => void;

const pct = (x: number) => `${Math.round(x * 100)}%`;

function GoalCard({ g, onGo }: { g: AmbView; onGo: Go }) {
  const done = g.progress >= 1;
  return (
    <li className={`llv-paper flex min-w-0 flex-col rounded border border-noir-800 px-2 py-1 sm:py-1.5 ${domClass(g.domain as Domain)} llv-dom-edge`} data-testid={`goal-${g.id}`} title={`${g.hint} Reward: ${g.reward}.`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] font-semibold text-stone-100">{done ? '✓ ' : ''}{g.title}</span>
        {g.go && <button type="button" className="btn-quiet shrink-0 text-[10px]" onClick={() => onGo(g.go!)} data-testid="goal-show">Show me ▸</button>}
      </div>
      <div className="mt-0.5 flex items-center gap-2 sm:mt-1 sm:block">
        <div className="h-1.5 min-w-[3rem] flex-1 overflow-hidden rounded bg-noir-700" role="progressbar" aria-valuenow={Math.round(g.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={g.title}>
          <span className={`block h-full ${done ? 'bg-emerald-500' : 'llv-dom-bg bg-gold-500'}`} style={{ width: pct(Math.max(0.03, g.progress)) }} />
        </div>
        <div className="flex shrink-0 flex-wrap justify-between gap-x-2 text-[10px] text-stone-400 sm:mt-0.5">
          <span className="tabular-nums">{g.progressText}</span>
          <span className="hidden text-gold-300/90 sm:inline" data-testid="goal-reward">Reward: {g.reward}</span>
        </div>
      </div>
    </li>
  );
}

/** The Desk's top line and the three goals. */
export function GoalsStrip({ s, onGo }: { s: GameState; onGo: Go }) {
  const goals = useMemo(() => ambitionsView(s), [s]);
  if (!goals.length) return null;
  return (
    <section className="mb-2" data-testid="desk-goals" aria-label="What you are working toward">
      <div className="mb-1 text-[11px] text-stone-400" data-testid="desk-working-toward">
        <span className="mr-1 text-[10px] uppercase tracking-[0.25em] text-stone-500">Working toward</span>
        <span className="text-stone-200">{goals.map((g) => g.title).join(' · ')}</span>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-3">{goals.map((g) => <GoalCard key={g.id} g={g} onGo={onGo} />)}</ul>
    </section>
  );
}

function StormDetail({ x, onGo }: { x: Storm; onGo: Go }) {
  return (
    <div className={`mt-1 rounded border px-2 py-1.5 text-[11px] ${x.tone === 'red' ? 'border-red-500/50 bg-blood-500/10' : 'border-amber-600/50 bg-amber-900/10'}`} data-testid="storm-detail">
      <div className="font-semibold text-stone-100">{x.title} <span className="font-normal text-stone-400">· {x.when}</span></div>
      <div className="text-stone-300">Odds: <b className={x.tone === 'red' ? 'text-red-300' : 'text-amber-200'}>{pct(x.odds)}, {oddsWord(x.odds)}</b>. Mostly: <Glossed text={x.why} />.</div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="text-stone-500">What would help:</span>
        {x.helps.map((h) => <button key={h.label} type="button" className="btn-secondary btn-sm text-[10px]" onClick={() => h.go && onGo(h.go)} disabled={!h.go} data-testid="storm-help">{h.label} ▸</button>)}
      </div>
    </div>
  );
}

/** Storm warnings: one chip each, the odds in a word; a tap shows why and what would help. */
export function StormChips({ s, onGo }: { s: GameState; onGo: Go }) {
  const storms = useMemo(() => stormWarnings(s).slice(0, 4), [s]);
  const [open, setOpen] = useState<string | undefined>();
  if (!storms.length) return null;
  const sel = storms.find((x) => x.id === open);
  return (
    <section className="mb-2" data-testid="desk-storms" aria-label="Storm warnings">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-0.5 text-[10px] uppercase tracking-[0.25em] text-red-300/90">⚠ Storm warning{storms.length > 1 ? 's' : ''}</span>
        {storms.map((x) => (
          <button key={x.id} type="button" aria-expanded={open === x.id} onClick={() => setOpen((o) => (o === x.id ? undefined : x.id))} data-testid="storm-chip" data-kind={x.kind}
            title={`${x.title}: ${pct(x.odds)}, ${oddsWord(x.odds)}, ${x.when}. Mostly: ${x.why}.`}
            className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] ${x.tone === 'red' ? 'border-red-500/70 bg-blood-500/15 text-red-100' : 'border-amber-500/60 bg-amber-900/20 text-amber-100'} ${open === x.id ? 'ring-1 ring-gold-400' : ''}`}>
            {x.title} · <i>{oddsWord(x.odds)}</i> {pct(x.odds)}
          </button>
        ))}
      </div>
      {sel && <StormDetail x={sel} onGo={onGo} />}
    </section>
  );
}

const DIFF_KEY = (seed: string) => `llv.diffSeen.${seed}`;

/** "What changed?" after the week's turn: three to five lines, dismissed for the week (per browser). */
export function WhatChangedCard({ s, onFile }: { s: GameState; onFile: () => void }) {
  const lines = useMemo(() => whatChanged(s), [s]);
  const [seen, setSeen] = useState<number>(() => { try { return Number(localStorage.getItem(DIFF_KEY(s.seed)) ?? 0) || 0; } catch { return 0; } });
  if (!lines.length || seen >= s.week) return null;
  const dismiss = () => { setSeen(s.week); try { localStorage.setItem(DIFF_KEY(s.seed), String(s.week)); } catch { /* shown again next time */ } };
  const tone = (t: string) => (t === 'good' ? 'text-emerald-200' : t === 'bad' ? 'text-amber-200' : 'text-stone-300');
  return (
    <section className="llv-paper mb-2 rounded-md border border-gold-600/40 px-2.5 py-1.5" data-testid="desk-what-changed" aria-label="What changed this week">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.25em] text-gold-400">What changed · week {s.lastReport?.week ?? s.week - 1}</span>
        <button type="button" className="btn-quiet ml-auto text-[10px]" onClick={onFile} data-testid="what-changed-file">Your File ▸</button>
        <button type="button" className="btn-quiet px-1 text-[12px]" onClick={dismiss} aria-label="Dismiss what changed" data-testid="what-changed-dismiss">×</button>
      </div>
      <ul className="mt-0.5 space-y-0.5 text-[12px] leading-snug">
        {lines.map((l) => <li key={l.id} className={tone(l.tone)} data-testid={`what-changed-${l.id}`}><Glossed text={l.text} /></li>)}
      </ul>
    </section>
  );
}

/** The three together, in the order a player reads them. */
export function DeskTop({ s, onGo, onFile }: { s: GameState; onGo: Go; onFile: () => void }) {
  return (
    <>
      <GoalsStrip s={s} onGo={onGo} />
      <StormChips s={s} onGo={onGo} />
      {/* Losing a war or heavy heat: somewhere to go (engine/outposts.ts safe passage), the odds before going. */}
      <SomewhereToGo s={s} />
      <WhatChangedCard s={s} onFile={onFile} />
    </>
  );
}
