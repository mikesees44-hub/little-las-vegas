import { useState, type ReactNode } from 'react';
import { biggestReason, oddsWord, type OddsView, type WorstView } from '../../engine/decide';
import type { Character, Effect, GameState } from '../../engine/types';
import { Chips } from '../components/Chips';
import { Face } from '../components/People';
import { fmt$ } from '../format';
import { useNumberKeys } from '../keys';
import { DOMAINS, domClass, type Domain } from '../domain';

/**
 * ONE DECISION CARD (STREAMLINE §4.1), used wherever the boss decides: a
 * decision that comes to him, an order's full card, a sit-down item, a
 * lieutenant's ask, a capo's morning, an urgent meeting.
 *
 *   STAKES   faces · title · by when · what is on the line
 *   OPTIONS  1–9 · label · an odds bar on every one ("certain" / "no roll"
 *            when nothing is rolled) · the top three reasons · the worst way
 *            it can go, always visible
 *   VOICES   one line each, collapsed
 *   FOOTER   [Later] [Hand it off]            [Decide ▸]  (one primary)
 *
 * Tapping an option picks it; the one primary button gives it (a number key
 * does both). A heavy order (engine/heavy.ts) turns the card over to its
 * second state, "Are you sure?", instead of opening another window.
 */

export interface DecisionOption {
  id: string;
  label: string;
  detail?: ReactNode;
  effects?: readonly Effect[];
  /** Ready-made chips (a sit-down option's), when there are no effects to describe. */
  chips?: { text: string; tone?: 'good' | 'bad' | 'neutral' }[];
  odds: OddsView;
  worst?: WorstView;
  cost?: number;
  pocket?: boolean;
  disabled?: string;
  hostile?: boolean;
  /** Whose pick this is ("Sal's pick"): a voice, never a "best" badge. */
  pickedBy?: string;
  /** Already given (queued, answered). */
  done?: boolean;
  rowTestId?: string;
  /** Marks the adviser's pick for tests and styling (data-recommended); the words are `pickedBy`. */
  recommended?: boolean;
  note?: ReactNode;
}

export interface Voice {
  who: string;
  says: string;
  tone?: 'do' | 'dont' | 'wait';
}

export interface ConfirmView {
  title: string;
  lines: string[];
  yes: string;
}

export function OddsBar({ odds, compact }: { odds: OddsView; compact?: boolean }) {
  if (!odds.known || odds.chance === undefined) {
    return <span className="shrink-0 rounded border border-noir-600 px-1.5 text-[10px] uppercase tracking-wider text-stone-400" data-testid="odds-label">{odds.label}</span>;
  }
  const pct = Math.round(odds.chance * 100);
  const tone = pct >= 60 ? 'bg-emerald-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-500';
  const text = pct >= 60 ? 'text-emerald-300' : pct >= 35 ? 'text-amber-300' : 'text-red-300';
  const word = oddsWord(odds.chance);
  const why = biggestReason(odds);
  return (
    <span className="flex shrink-0 items-center gap-1.5" data-testid="odds-bar" title={`${odds.label}: ${pct}%, ${word}${why ? `. Mostly: ${why}` : ''}`}>
      <span className={`tabular-nums text-[11px] font-semibold ${text}`} data-testid="odds-label">{pct}%</span>
      <span className={`text-[10px] italic ${text}`} data-testid="odds-word">{word}</span>
      <span className={`relative h-1.5 overflow-hidden rounded bg-noir-700 ${compact ? 'w-10' : 'w-16'}`} aria-hidden>
        <span className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/** The top three reasons, one line; tap for every one. */
export function Reasons({ odds }: { odds: OddsView }) {
  const [all, setAll] = useState(false);
  // No numbered reasons: the one plain reason (a strike's hint), so every percentage has its why.
  if (odds.known && !odds.reasons.length && odds.why) return <div className="mt-0.5 text-[11px] leading-snug text-stone-400" data-testid="odds-reasons"><span className="text-stone-500">Mostly: </span>{odds.why}</div>;
  if (!odds.known || !odds.reasons.length) return null;
  const list = all ? odds.reasons : odds.reasons.slice(0, 3);
  return (
    <div className="mt-0.5 text-[11px] leading-snug" data-testid="odds-reasons">
      <span className="text-stone-500">{odds.label}, mostly: </span>
      {list.map((r, i) => (
        <span key={i} className={`mr-2 inline-block whitespace-nowrap ${i === 0 ? 'font-semibold' : ''} ${r.value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.value > 0 ? '+' : '−'}{Math.abs(r.value)} {r.label}</span>
      ))}
      {odds.reasons.length > 3 && <button type="button" className="btn-quiet text-[11px]" onClick={(e) => { e.stopPropagation(); setAll((x) => !x); }}>{all ? 'fewer' : `all ${odds.reasons.length}`}</button>}
    </div>
  );
}

export function WorstLine({ s, w }: { s: GameState; w: WorstView }) {
  return (
    <div className="mt-0.5 text-[11px] leading-snug text-red-200/90" data-testid="worst-tier">
      <span className="font-semibold text-red-300">{w.label}{w.chance !== undefined ? ` · ${Math.round(w.chance * 100)}%` : ''}</span>
      {w.text && <span className="text-stone-400"> — {w.text}</span>}
      {w.effects.length > 0 && <Chips s={s} effects={w.effects} />}
    </div>
  );
}

function OptionRow({ s, o, i, on, pick, compact, testid }: { s: GameState; o: DecisionOption; i: number; on: boolean; pick: () => void; compact?: boolean; testid: string }) {
  return (
    <div className={`rounded-md border transition-colors ${on ? 'border-gold-400 bg-gold-500/10' : o.done ? 'border-emerald-600/60 bg-emerald-900/10' : o.hostile ? 'border-blood-500/40 bg-noir-800/60 hover:border-red-400' : 'border-noir-600 bg-noir-800/60 hover:border-gold-500'} ${o.disabled ? 'opacity-50' : ''}`}
      data-testid={o.rowTestId ?? testid} data-selected={on ? 'true' : undefined} data-recommended={o.recommended ? 'true' : undefined}>
      <div role="radio" aria-checked={on} aria-disabled={!!o.disabled} tabIndex={o.disabled ? -1 : 0}
        onClick={() => { if (!o.disabled) pick(); }} onKeyDown={(e) => { if (!o.disabled && (e.key === ' ' || e.key === 'Enter') && e.target === e.currentTarget) { e.preventDefault(); pick(); } }}
        className={`w-full text-left ${compact ? 'px-2 py-1' : 'px-3 py-2'} ${o.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`} data-testid="decision-option">
        <span className="flex items-center justify-between gap-2">
          <span className={`min-w-0 font-semibold ${compact ? 'text-[12px]' : 'text-sm'} ${o.hostile ? 'text-red-200' : 'text-stone-100'}`}>
            {i < 9 && <kbd className="mr-1.5 rounded border border-noir-500 px-1 text-[10px] font-normal text-stone-400" title={`Press ${i + 1}`} data-testid="choice-key">{i + 1}</kbd>}
            {o.done ? '✓ ' : ''}{o.label}
            {o.pickedBy && <span className="ml-1.5 text-[10px] font-normal text-gold-300/80">{o.pickedBy}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {o.cost ? <span className={`text-[11px] tabular-nums ${o.pocket ? 'text-amber-300' : 'text-gold-400'}`}>{fmt$(o.cost)}</span> : null}
            <OddsBar odds={o.odds} compact={compact} />
          </span>
        </span>
        {o.detail && <span className="mt-0.5 block text-xs text-stone-400">{o.detail}</span>}
        {o.effects && o.effects.length > 0 && <Chips s={s} effects={o.effects} />}
        {!o.effects?.length && o.chips && o.chips.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{o.chips.map((ch, k) => <span key={k} className={ch.tone === 'good' ? 'chip-good' : ch.tone === 'bad' ? 'chip-bad' : 'chip-neutral'}>{ch.text}</span>)}</span>}
        <Reasons odds={o.odds} />
        {o.worst && <WorstLine s={s} w={o.worst} />}
        {o.note}
        {o.disabled && <span className="mt-1 block text-xs text-red-400">Unavailable: {o.disabled.charAt(0).toLowerCase()}{o.disabled.slice(1)}</span>}
      </div>
    </div>
  );
}

export function VoicesLine({ voices }: { voices: Voice[] }) {
  const [open, setOpen] = useState(false);
  if (!voices.length) return null;
  const tone = (v: Voice) => (v.tone === 'do' ? 'text-emerald-300' : v.tone === 'dont' ? 'text-red-300' : 'text-amber-200');
  return (
    <div className="mt-2 border-t border-noir-700 pt-1.5 text-[11px]" data-testid="decision-voices">
      {(open ? voices : voices.slice(0, 3)).map((v, i) => (
        <div key={i} className="line-clamp-2 leading-snug" title={v.says}><span className="text-stone-500">{v.who}:</span> <span className={`italic ${tone(v)}`}>“{v.says}”</span></div>
      ))}
      {voices.length > 3 && <button type="button" className="btn-quiet text-[11px]" onClick={() => setOpen((x) => !x)}>{open ? 'fewer' : `${voices.length - 3} more`}</button>}
    </div>
  );
}

export interface DecisionCardProps {
  s: GameState;
  kicker?: string;
  title?: string;
  faces?: Character[];
  sub?: ReactNode;
  text?: ReactNode;
  deadline?: string;
  stakes?: string[];
  options: DecisionOption[];
  voices?: Voice[];
  /** The option already chosen (picked again, it stays). */
  selected?: string;
  onDecide: (id: string) => void;
  /** The primary's words for the picked option ("Decide", "Give the order", "Do it now (62%)"). */
  primaryLabel?: (o: DecisionOption | undefined) => string;
  onLater?: () => void;
  laterLabel?: string;
  onHandOff?: () => void;
  handOffLabel?: string;
  /** The one advice button (a tooltip, the table). */
  advice?: ReactNode;
  /** More that belongs to this decision (talk it out, the default line). */
  extra?: ReactNode;
  /** Heavy orders: the card's second state. */
  confirmFor?: (id: string) => ConfirmView | undefined;
  compact?: boolean;
  /** Number keys pick (and give) an option. */
  keys?: boolean;
  optionTestId?: string;
  testid?: string;
  primaryTestId?: string;
  primaryDisabled?: boolean;
  /** The part of the Don's life this is (ui/domain.ts): a tinted header strip and the domain named in the kicker. */
  domain?: Domain;
}

export function DecisionCard(p: DecisionCardProps) {
  const { s, options, compact } = p;
  const [sel, setSel] = useState<string | undefined>(p.selected ?? (options.length === 1 ? options[0].id : undefined));
  const [confirm, setConfirm] = useState<{ id: string; v: ConfirmView } | undefined>();
  const chosen = options.find((o) => o.id === sel);
  const give = (id: string) => {
    const v = p.confirmFor?.(id);
    // One way to answer, on every card: a number key or the primary picks the option and gives it,
    // and the card shows it picked (the footer never says "Pick one" after an answer).
    setSel(id);
    if (v) { setConfirm({ id, v }); return; }
    p.onDecide(id);
  };
  useNumberKeys(!!p.keys && !confirm, options.length, (i) => { const o = options[i]; if (o && !o.disabled) give(o.id); });
  if (confirm) {
    return (
      <div className={compact ? 'p-2' : 'p-4 sm:p-5'} data-testid="decision-confirm">
        <div className="text-[11px] uppercase tracking-widest text-red-300">Are you sure?</div>
        <div className="mt-1 text-base font-semibold text-stone-100">{confirm.v.title}</div>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-stone-300">{confirm.v.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => setConfirm(undefined)} data-testid="confirm-no">No, go back</button>
          <button type="button" className="btn-danger text-sm" autoFocus onClick={() => { const id = confirm.id; setConfirm(undefined); p.onDecide(id); }} data-testid="confirm-yes">{confirm.v.yes}</button>
        </div>
      </div>
    );
  }
  return (
    <div className={`${compact ? '' : 'llv-dc p-4 sm:p-5'} ${domClass(p.domain)} ${compact && p.domain ? 'llv-dom-edge pl-2' : ''}`} data-testid={p.testid ?? 'decision-card'} data-domain={p.domain}>
      {(p.kicker || p.title) && !compact && (
        /* The card's face: the people (else the domain's glyph, lit) on top, then the bold title and two short lines. */
        <div className="-mx-4 -mt-4 mb-1 sm:-mx-5 sm:-mt-5" data-testid="decision-face">
          <div className="llv-pc-art llv-dc-art">
            {p.faces && p.faces.length > 0
              ? <span className="flex items-end gap-1.5">{p.faces.slice(0, 3).map((c) => <Face key={c.id} s={s} c={c} size={p.faces!.length > 1 ? 70 : 88} />)}</span>
              : <span className="llv-pc-glyph" aria-hidden>{p.domain ? DOMAINS[p.domain].glyph : '♠'}</span>}
            <span className="llv-pc-pip" aria-hidden>{p.domain ? DOMAINS[p.domain].glyph : '♠'}</span>
            {p.deadline && <span className="llv-pc-corner"><span className="rounded bg-noir-950/80 px-1.5 text-[11px] text-amber-300" data-testid="decision-deadline">⏱ {p.deadline}</span></span>}
          </div>
          <div className="px-4 pt-2.5 sm:px-5">
            {p.title && <h2 className="font-display text-2xl font-extrabold leading-tight text-[#f3e6c4]">{p.title}</h2>}
            {p.sub && <div className="mt-0.5 text-[12px] text-stone-300">{p.sub}</div>}
            {p.kicker && <div className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-stone-500">{p.domain && <span className="llv-dom-ink"><span className="llv-dom-dot mr-1.5 align-middle" aria-hidden />{DOMAINS[p.domain].label} · </span>}{p.kicker}</div>}
          </div>
        </div>
      )}
      {(p.kicker || p.title) && compact && (
        <div className="flex items-start gap-3">
          {p.faces && p.faces.length > 0 && <div className="flex shrink-0 -space-x-2">{p.faces.slice(0, 3).map((c) => <Face key={c.id} s={s} c={c} size={44} />)}</div>}
          <div className="min-w-0 flex-1">
            {p.kicker && <div className="flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-[0.3em] text-stone-500"><span>{p.domain && <span className="llv-dom-ink"><span className="llv-dom-dot mr-1.5 align-middle" aria-hidden />{DOMAINS[p.domain].label} · </span>}{p.kicker}</span>{p.deadline && <span className="tracking-normal normal-case text-amber-300" data-testid="decision-deadline">⏱ {p.deadline}</span>}</div>}
            {p.title && <h2 className="font-display text-base font-bold leading-tight text-gold-400">{p.title}</h2>}
            {p.sub && <div className="mt-0.5 text-[11px] text-stone-400">{p.sub}</div>}
          </div>
        </div>
      )}
      {p.stakes && p.stakes.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]" data-testid="stakes">
          <span className="text-stone-500">What's on the line:</span>
          {p.stakes.map((x) => <span key={x} className="chip-bad">{x}</span>)}
        </div>
      )}
      {p.text && <div className={`mt-2 leading-relaxed text-stone-300 ${compact ? 'text-[12px]' : ''}`}>{p.text}</div>}
      {p.extra}
      <div className={`${compact ? 'mt-1.5 space-y-1' : 'mt-3 space-y-2'}`} role="radiogroup" aria-label="Your options">
        {options.map((o, i) => <OptionRow key={o.id} s={s} o={o} i={i} on={sel === o.id} compact={compact} testid={p.optionTestId ?? 'decision-row'} pick={() => setSel(o.id)} />)}
      </div>
      {p.voices && <VoicesLine voices={p.voices} />}
      {/* Advice sits above the footer, so the footer is only: put it off, hand it off, and the one primary. */}
      {p.advice && !compact && <div className="mt-2 flex flex-wrap items-center gap-y-1 text-[11px]" data-testid="decision-advice">{p.advice}</div>}
      {/* The footer stays in sight at the foot of a tall card (it was cut off at 900 px). */}
      <div className={`flex items-center gap-2 ${compact ? 'mt-1.5 flex-wrap' : 'sticky bottom-0 z-10 -mx-4 sm:-mx-5 mt-3 border-t border-noir-700 bg-noir-900/95 px-4 sm:px-5 py-2.5 backdrop-blur-sm'}`} data-testid="decision-footer">
        {p.onLater && <button type="button" className={`btn-secondary shrink-0 ${compact ? 'btn-sm' : 'text-xs'}`} onClick={p.onLater} data-testid="decision-later">{p.laterLabel ?? 'Later'}</button>}
        {p.onHandOff && <button type="button" className={`btn-secondary min-w-0 ${compact ? 'btn-sm' : 'text-xs'}`} onClick={p.onHandOff} title={p.handOffLabel} data-testid="decision-handoff"><span className="truncate">{p.handOffLabel ?? 'Hand it off'}</span></button>}
        {p.advice && compact && <span className="text-[11px]">{p.advice}</span>}
        <button type="button" className={`btn-primary ml-auto min-w-0 max-w-[62%] shrink-0 ${compact ? 'btn-sm' : 'text-sm'}`} disabled={!chosen || !!chosen.disabled || p.primaryDisabled} onClick={() => chosen && give(chosen.id)} data-testid={p.primaryTestId ?? 'decision-primary'}>
          <span className="truncate">{p.primaryLabel ? p.primaryLabel(chosen) : chosen ? `Decide: ${chosen.label} ▸` : 'Pick one'}</span>
        </button>
      </div>
    </div>
  );
}
