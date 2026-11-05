import { useState } from 'react';
import type { GateChoiceId, GateView } from '../../engine/planner/gate';
import type { GateRole } from '../../engine/planner/gateCore';
import type { GameState } from '../../engine/types';
import { Face } from './ink';

const pct = (p: number) => `${Math.round(p * 100)}%`;

export interface GateApi {
  onRole: (role: GateRole, compare?: boolean) => void;
  onFull: () => void;
  onAsk: (id: string) => void;
  onDecide: (id: GateChoiceId, sure?: boolean) => void;
  onChar: (id: string) => void;
}

/**
 * THE DOOR (CONSIGLIERE_GATEKEEPER.md), on top of the Audience page: who keeps it (the same standing order as
 * Standing Orders), the full list read yourself (an hour), the cross-checks with their odds, what you have
 * noticed, and, once he is found out, the decision: every option with its odds and its effects.
 */
export function GatePanel({ s, v, api }: { s: GameState; v: GateView; api: GateApi }) {
  const [sure, setSure] = useState(false);
  const cs = v.case;
  const open = cs && !cs.how;
  return (
    <div className="mb-2 rounded border border-[#2a2118]/25 bg-[#f6ecd6]/70 p-2 text-[12.5px]" data-testid="gate-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {v.keeper.id && <button type="button" onClick={() => api.onChar(v.keeper.id!)} aria-label={`Open ${v.keeper.name}`}><Face s={s} id={v.keeper.id} name={v.keeper.name} size={30} /></button>}
          <span className="min-w-0"><span className="block text-[10.5px] uppercase tracking-[0.14em] text-[#6b5a44]">Keeps your door</span><b data-testid="gate-keeper">{v.keeper.name}</b>{v.suspicion !== undefined && v.suspicion > 0 && <span className="ml-1.5 text-[11px] text-[#a3271d]" data-testid="gate-susp">· your doubt {v.suspicion}</span>}</span>
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Who keeps your door">
          {v.roles.map((r) => (
            <button key={r.role} type="button" role="radio" aria-checked={r.on} disabled={!!r.block && !r.on} title={r.block ?? r.name}
              className={`llv-ink-btn !px-2 !py-0.5 text-[11.5px] ${r.on ? 'llv-ink-btn-primary' : ''} disabled:opacity-45`} onClick={() => !r.on && api.onRole(r.role)} data-testid={`gate-role-${r.role}`}>
              {r.role === 'consigliere' ? 'Consigliere' : r.role === 'underboss' ? 'Underboss' : 'Wife'}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[#2a2118]/25 pt-1.5">
        <span className="min-w-0 flex-1 text-[12px]" data-testid="gate-full-text">
          {v.full ? <>You read the full list today{v.heldNow ? <>: <b className="text-[#a3271d]">{v.heldNow} held back</b>, marked below.</> : '.'}</> : <>Read every request yourself, not just his list. <span className="text-[#6b5a44]">1 hour · if he is holding anybody back, about {pct(v.fullOdds)} you see it for what it is.</span></>}
        </span>
        <button type="button" className="llv-ink-btn shrink-0 whitespace-nowrap" disabled={!!v.fullBlock} title={v.fullBlock} onClick={api.onFull} data-testid="gate-full">{v.full ? 'Read today' : 'Read the full list'}</button>
      </div>
      {open && cs && (
        <div className="llv-pop mt-2 p-2" role="group" aria-label={`What to do about ${cs.name}`} data-testid="gate-case">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#a3271d]">Found out · week {cs.w}</div>
          <p className="text-[13px]"><b>{cs.name}</b> {cs.why}. He keeps{v.keeper.id === cs.id ? '' : ' (kept)'} your door. What happens to him is yours to say.</p>
          <ul className="mt-1.5 space-y-1.5">
            {cs.choices.map((c) => (
              <li key={c.id} className="rounded border border-[#2a2118]/20 bg-[#fffaf0]/80 p-1.5" data-testid={`gate-choice-${c.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0"><b>{c.label}</b> <span className="text-[11px] text-[#6b5a44]">· {c.hint}</span></span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[11.5px] font-bold tabular-nums" data-testid="gate-choice-odds">{pct(c.odds)}</span>
                    {c.confirm ? (
                      sure ? (
                        <>
                          <button type="button" className="llv-ink-btn" onClick={() => setSure(false)} data-testid="gate-clip-no">No</button>
                          <button type="button" className="llv-ink-btn llv-ink-btn-red" onClick={() => { setSure(false); api.onDecide(c.id, true); }} data-testid="gate-clip-yes">Yes. Do it.</button>
                        </>
                      ) : <button type="button" className="llv-ink-btn llv-ink-btn-red" onClick={() => setSure(true)} data-testid="gate-clip">{c.label}…</button>
                    ) : <button type="button" className="llv-ink-btn llv-ink-btn-primary" onClick={() => api.onDecide(c.id)} data-testid={`gate-do-${c.id}`}>{c.label}</button>}
                  </span>
                </div>
                <ul className="mt-0.5 list-disc pl-5 text-[11.5px] text-[#4a3b28]">{c.effects.map((e) => <li key={e}>{e}</li>)}</ul>
                {c.confirm && sure && <p className="mt-1 text-[11.5px] font-semibold text-[#7d1d14]" data-testid="gate-clip-confirm">Are you sure? Once the car leaves, it does not come back. Nobody else gives this order.</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {cs && cs.how && <p className="mt-1.5 text-[12px] text-[#4a3b28]" data-testid="gate-case-done">{cs.name}: you chose to {cs.how === 'confront' ? 'confront him (he broke)' : cs.how === 'feed' ? 'feed him lies' : cs.how === 'freeze' ? 'freeze him out' : 'have him clipped'}. It is in Your File.</p>}
      {v.tells.length > 0 && (
        <div className="mt-1.5 border-t border-dashed border-[#2a2118]/25 pt-1.5" data-testid="gate-tells">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-[#6b5a44]">What you noticed</div>
          <ul className="text-[12px]">{v.tells.slice(0, 4).map((t, i) => <li key={i}><span className="text-[#6b5a44]">wk {t.w} ·</span> {t.t}</li>)}</ul>
        </div>
      )}
      <details className="mt-1.5 border-t border-dashed border-[#2a2118]/25 pt-1" data-testid="gate-checks">
        <summary className="cursor-pointer text-[12px] font-semibold text-[#4a3b28]">Cross-check the man at your door</summary>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[#6b5a44]">Ask another source · 1 hour</div>
            {v.sources.length ? (
              <ul className="space-y-1">
                {v.sources.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-1.5">
                    <span className="min-w-0 flex-1 truncate"><b>{x.name}</b> <span className="text-[11px] text-[#6b5a44]">{x.role}</span></span>
                    <button type="button" className="llv-ink-btn shrink-0 whitespace-nowrap !px-2 !py-0.5 text-[11.5px]" disabled={!!x.block} title={x.block ?? `${pct(x.odds)} he sees what is hidden, if anything is`} onClick={() => api.onAsk(x.id)} data-testid={`gate-ask-${x.id}`}>Ask · {pct(x.odds)}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[11.5px] text-[#6b5a44]">Nobody else to ask.</p>}
          </div>
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[#6b5a44]">A quiet envelope on his wife</div>
            <p className="text-[11.5px]" data-testid="gate-wife">{v.wife.text}</p>
            {v.wife.id && <button type="button" className="llv-ink-btn mt-0.5 !px-2 !py-0.5 text-[11.5px]" onClick={() => api.onChar(v.wife.id!)} data-testid="gate-wife-open">Her card ▸</button>}
          </div>
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[#6b5a44]">Somebody else, a month, then compare</div>
            {v.compare.running ? (
              <p className="text-[11.5px]" data-testid="gate-compare-running">{v.compare.running.name}'s book against the new one: {v.compare.running.left ? `${v.compare.running.left} more week${v.compare.running.left === 1 ? '' : 's'}` : 'settles at the week\'s turn'}.</p>
            ) : (
              <>
                <p className="text-[11.5px] text-[#4a3b28]">If he is crooked, about {pct(v.compare.odds)} the two books show it.</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {v.compare.options.map((o) => (
                    <button key={o.role} type="button" className="llv-ink-btn !px-2 !py-0.5 text-[11.5px]" disabled={!!o.block} title={o.block ?? o.name} onClick={() => api.onRole(o.role, true)} data-testid={`gate-compare-${o.role}`}>{o.role === 'consigliere' ? 'Consigliere' : o.role === 'underboss' ? 'Underboss' : 'Wife'}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
