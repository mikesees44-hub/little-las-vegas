import { useState } from 'react';
import { decisionProgress, decisionViews, type DecisionView } from '../../engine/decisions';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { Label, ProgressBar } from './bits';

/** CK "Decisions": big one-off moves, with progress toward each requirement. */
export function DecisionsPanel({ s }: { s: GameState }) {
  const views = decisionViews(s).filter((v) => v.shown);
  const open = views.filter((v) => !v.done);
  const done = views.filter((v) => v.done);
  return (
    <div className="space-y-3" data-testid="decisions-panel">
      <p className="text-xs text-stone-400">Big moves for the house. Each lists what it takes and how close you are. Some are systems you already have (the bank, the casino) — their own orders are linked here.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {open.map((v) => <DecisionCard key={v.id} s={s} v={v} />)}
      </div>
      {done.length > 0 && (
        <section>
          <Label>Done</Label>
          <ul className="mt-1 text-xs space-y-0.5">
            {done.map((v) => <li key={v.id} className="text-stone-400"><span className="text-gold-300">✓ {v.name}</span> — {v.done}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function DecisionCard({ s, v }: { s: GameState; v: DecisionView }) {
  const [opt, setOpt] = useState(v.options?.[0]?.id);
  const prog = decisionProgress(v);
  return (
    <section className={`rounded-md border p-3 ${v.risky ? 'border-blood-500/50 bg-blood-500/5' : 'border-noir-700 bg-noir-800/60'}`} data-testid={`decision-${v.id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="panel-title text-base">{v.name}</div>
        <div className="text-[11px] text-stone-500 tabular-nums">{Math.round(prog * 100)}%</div>
      </div>
      <div className="mt-1"><ProgressBar value={prog} tone={prog >= 1 ? 'bg-emerald-600' : 'bg-gold-500'} /></div>
      <p className="mt-1.5 text-xs text-stone-400">{v.text}</p>
      <ul className="mt-2 space-y-1">
        {v.reqs.map((r) => (
          <li key={r.label} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className={r.ok ? 'text-emerald-300' : 'text-stone-300'}>{r.ok ? '✓' : '✗'} {r.label}</span>
              {r.need !== undefined && <span className="tabular-nums text-stone-500 whitespace-nowrap">{Math.round(r.have ?? 0).toLocaleString('en-US')} / {r.need.toLocaleString('en-US')}</span>}
            </div>
            {r.need !== undefined && !r.ok && !r.invert && <div className="mt-0.5"><ProgressBar value={(r.have ?? 0) / r.need} tone="bg-stone-500" /></div>}
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[11px] text-stone-500">Cost: <span className="text-stone-300">{v.costText}</span></div>
      {v.options && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {v.options.map((o) => (
            <button key={o.id} className={`btn text-xs py-1 ${opt === o.id ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`} onClick={() => setOpt(o.id)}>{o.label}</button>
          ))}
        </div>
      )}
      {!s.gameOver && (
        <div className="mt-2">
          {v.link ? <ActionCard s={s} action={v.link} compact /> : <ActionCard s={s} action={{ kind: 'dynasty', op: { type: 'decision', id: v.id, option: opt } }} compact label="Take the decision" />}
        </div>
      )}
    </section>
  );
}
