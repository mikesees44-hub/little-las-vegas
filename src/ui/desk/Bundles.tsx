import { useState } from 'react';
import { bundleAnswers, chosen, summarize, stillQueued, type Bundle, type SettleAnswer, type SettleUi, type WeekPlan, type WeekPlanRow } from '../../engine/bundles';
import type { GameState } from '../../engine/types';
import { Face } from '../components/People';
import { fmt$ } from '../format';

/**
 * BUNDLED DECISIONS on the Desk (engine/bundles.ts): same-kind small items as one card, "Settle all N the
 * consigliere's way", each item still overridable beneath (any of its answers, or "leave it for me"). And
 * "Handle the week for me": what was settled, each with "Take it back" while the answer is only queued,
 * and what stays the boss's.
 */

export interface SettledRow { key: string; title: string; label: string; answer: SettleAnswer }

const WAY: Record<Bundle['kind'], string> = { asks: "the consigliere's way", mornings: "each capo's own way", pitches: "the consigliere's way", envelope: "the underboss's way" };

export function BundleCard({ s, b, onSettle, onOpen }: { s: GameState; b: Bundle; onSettle: (rows: SettledRow[]) => void; onOpen?: (key: string) => void }) {
  const [over, setOver] = useState<Record<string, string>>({});
  const rows = bundleAnswers(b, over);
  const picked = b.items.filter((it) => over[it.key] !== 'skip').map((it) => chosen(it, over[it.key])!).filter(Boolean);
  const sum = summarize(picked);
  return (
    <div className="llv-paper mb-2 rounded-md border border-gold-600/60 bg-gold-500/5 p-2 text-[12px]" data-testid={`desk-bundle-${b.kind}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-stone-100">{b.title[0].toUpperCase() + b.title.slice(1)}</span>
        <span className="text-stone-400" data-testid="desk-bundle-summary">{sum.cost ? `${fmt$(sum.cost)} out` : 'no money out'} · {sum.odds}</span>
      </div>
      <button type="button" className="btn-primary mt-1 w-full text-sm" disabled={!rows.length} onClick={() => { onSettle(rows); setOver({}); }} data-testid="desk-bundle-settle">
        Settle {rows.length === b.items.length ? 'all ' : ''}{rows.length} {WAY[b.kind]} ▸
      </button>
      <ul className="mt-1.5 space-y-1" aria-label="Each one, to change">
        {b.items.map((it) => {
          const c = it.charId ? s.characters[it.charId] : undefined;
          const v = over[it.key] ?? it.pick;
          const o = v === 'skip' ? undefined : chosen(it, v);
          return (
            <li key={it.key} className="flex items-center gap-2" data-testid="desk-bundle-item" data-key={it.key}>
              {c && <Face s={s} c={c} size={28} noSide />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-stone-200" title={it.title}>{it.title}</div>
                <div className="text-[10px] text-stone-500">{v === it.pick ? `${it.by} picks this` : v === 'skip' ? 'You decide it yourself' : 'Your pick'}{o?.cost ? ` · ${fmt$(o.cost)}` : ''}{o?.odds !== undefined ? ` · ${Math.round(o.odds * 100)}%` : ''}</div>
              </div>
              <select className="max-w-[48%] shrink-0 rounded border border-noir-600 bg-noir-900 px-1 py-0.5 text-[11px] text-stone-200" value={v} aria-label={`Answer: ${it.title}`}
                onChange={(e) => setOver((x) => ({ ...x, [it.key]: e.target.value }))} data-testid="desk-bundle-override">
                {it.options.map((op) => <option key={op.id} value={op.id} disabled={!!op.disabled}>{op.id === it.pick ? '★ ' : ''}{op.label}{op.cost ? ` (${fmt$(op.cost)})` : ''}{op.disabled ? ` — ${op.disabled}` : ''}</option>)}
                <option value="skip">Leave it for me</option>
              </select>
              {onOpen && <button type="button" className="btn-quiet shrink-0 text-[10px]" onClick={() => onOpen(it.key)} data-testid="desk-bundle-open">Open ▸</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface WeekDone { week: number; rows: WeekPlanRow[]; yours: WeekPlan['yours']; cost: number; odds: string }

/** What "Handle the week" did: one list, Take it back on each answer still only queued, then what stays his. */
export function WeekDoneList({ s, done, ui, onUndo, onOpen, onClose }: { s: GameState; done: WeekDone; ui: SettleUi; onUndo: (r: WeekPlanRow) => void; onOpen?: (key: string) => void; onClose?: () => void }) {
  return (
    <div className="llv-paper mb-2 rounded-md border border-emerald-800/60 bg-emerald-950/20 p-2 text-[12px]" data-testid="week-done">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-emerald-200">Handled for the week ({done.rows.length})</span>
        <span className="text-stone-400">{done.cost ? `${fmt$(done.cost)} out` : 'no money out'} · {done.odds}</span>
        {onClose && <button type="button" className="btn-quiet ml-auto text-[10px]" onClick={onClose} data-testid="week-done-close">Hide</button>}
      </div>
      {done.rows.length ? (
        <ul className="mt-1 space-y-0.5">
          {done.rows.map((r) => {
            const live = stillQueued(s, r.answer, ui);
            return (
              <li key={r.key} className="flex items-center gap-2" data-testid="week-done-row" data-key={r.key} data-live={live ? 'true' : undefined}>
                <div className="min-w-0 flex-1"><span className="text-stone-200">{r.title}</span> <span className="text-stone-500">→</span> <span className="text-stone-300">{r.by}: {r.label}</span>{r.cost ? <span className="text-stone-500"> · {fmt$(r.cost)}</span> : null}{r.odds !== undefined ? <span className="text-stone-500"> · {Math.round(r.odds * 100)}%</span> : null}</div>
                {live ? <button type="button" className="btn-secondary btn-sm shrink-0 py-0 text-[10px]" onClick={() => onUndo(r)} data-testid="week-done-undo">Take it back</button>
                  : <span className="shrink-0 text-[10px] text-stone-500">settled</span>}
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-1 text-stone-400">Nothing routine was left to settle.</p>}
      {done.yours.length > 0 && (
        <div className="mt-1.5 border-t border-noir-700 pt-1" data-testid="week-done-yours">
          <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300">Yours to decide ({done.yours.length})</div>
          <ul className="mt-0.5 space-y-0.5">{done.yours.map((y) => (
            <li key={y.key} className="flex items-center gap-2"><span className="min-w-0 flex-1 text-stone-200">{y.title} <span className="text-stone-500">· {y.why}</span></span>
              {onOpen && <button type="button" className="btn-quiet shrink-0 text-[10px]" onClick={() => onOpen(y.key)}>Decide ▸</button>}</li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}
