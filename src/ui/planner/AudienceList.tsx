import { useState } from 'react';
import { refusalOutlook, type AudienceReq, type Gatekeeper, type Slot } from '../../engine/planner/audience';
import { PLAN_HOURS } from '../../engine/planner/hours';
import { DAY_NAMES } from '../../engine/days';
import { formatClock } from '../../engine/timeCost';
import type { GameState } from '../../engine/types';
import { Face, InkBar } from './ink';
import { SlotPicker } from './SlotPicker';
import { GatePanel, type GateApi } from './GatePanel';
import type { GateView } from '../../engine/planner/gate';

const C_CLOSE = '#7a4a8c';
const C_DESP = '#a3271d';
const C_MONEY = '#2f7a4c';

/**
 * REQUESTS FOR AN AUDIENCE: the gatekeeper's list, best first. Each row: the face, why he is asking, the
 * score bar (closeness, desperation, money), the gatekeeper's thumb on the scale (shown, never hidden),
 * and two buttons: give him an hour (now, or a slot in the datebook) or turn him away (what he will do
 * about it is said before the click).
 */
export function AudienceList({ s, reqs, keeper, gate, gateApi, onGrant, onTurn, onChar }: {
  s: GameState;
  reqs: AudienceReq[];
  keeper: Gatekeeper;
  gate?: GateView;
  gateApi?: GateApi;
  onGrant: (r: AudienceReq, at: Slot | 'now') => void;
  onTurn: (r: AudienceReq) => void;
  onChar: (id: string) => void;
}) {
  const [open, setOpen] = useState<{ key: string; what: 'grant' | 'turn' } | undefined>();
  return (
    <div className="llv-paper-plain mx-auto max-w-[860px] rounded p-3 sm:p-5" data-testid="audience-list">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl">Requests for an audience</h3>
        <span className="text-[12px] text-[#6b5a44]">{reqs.length} waiting · an hour each</span>
      </div>
      {gate && gateApi && <div className="mt-2"><GatePanel s={s} v={gate} api={gateApi} /></div>}
      <p className="text-[12.5px] text-[#4a3b28]" data-testid="audience-keeper">{keeper.line} The order is his: <b style={{ color: C_CLOSE }}>closeness</b>, <b style={{ color: C_DESP }}>desperation</b> and <b style={{ color: C_MONEY }}>money</b>, and his own thumb on the scale.</p>
      {!reqs.length && <p className="mt-4 text-center text-[13px] text-[#6b5a44]">Nobody at the door. Enjoy the quiet.</p>}
      <ol className="mt-3 space-y-2">
        {reqs.map((r, i) => {
          const o = open?.key === r.key ? open.what : undefined;
          return (
            <li key={r.key} className={`rounded border p-2 ${r.held ? 'border-[#a3271d]/50 bg-[#fbe9e2]/80' : 'border-[#2a2118]/20 bg-[#fffaf0]/70'}`} data-testid={`aud-row-${i}`} data-key={r.key} data-score={r.score} data-held={r.held ? 1 : undefined}>
              <div className="flex items-start gap-2">
                <span className="w-5 pt-1 text-right font-display text-[15px] text-[#6b5a44]">{i + 1}</span>
                <button type="button" onClick={() => r.charId && onChar(r.charId)} disabled={!r.charId} aria-label={`Open ${r.name}`}><Face s={s} id={r.charId} name={r.name} size={38} /></button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <b className="text-[14px]">{r.name}</b>
                    <span className="text-[11px] text-[#6b5a44]">{r.role}</span>
                    {r.urgent && <span className="text-[10px] font-bold uppercase tracking-wider text-[#a3271d]">urgent</span>}
                    {r.refused > 0 && <span className="text-[10px] text-[#a3271d]" data-testid="aud-refused">turned away {r.refused}×</span>}
                    {r.held && <span className="text-[10px] font-bold uppercase tracking-wider text-[#a3271d]" data-testid="aud-held">held back by {s.characters[r.held]?.firstName ?? 'the door'}</span>}
                  </div>
                  <p className="line-clamp-2 text-[12.5px] text-[#3a2d1e]">{r.why}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded bg-[#2a2118]/10" role="meter" aria-label="His standing at the door" aria-valuenow={r.score} aria-valuemin={0} aria-valuemax={100} data-testid="aud-score">
                      <div className="flex h-full" style={{ width: `${Math.max(3, r.score)}%` }}>
                        <span style={{ flex: Math.max(0.01, 0.4 * r.close.v), background: C_CLOSE }} />
                        <span style={{ flex: Math.max(0.01, 0.35 * r.desp.v), background: C_DESP }} />
                        <span style={{ flex: Math.max(0.01, 0.25 * r.money.v), background: C_MONEY }} />
                      </div>
                    </div>
                    <span className="w-7 text-right text-[12px] font-bold tabular-nums">{r.score}</span>
                  </div>
                  {r.bias.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px]" data-testid="aud-bias">
                      {r.bias.map((b) => <span key={b.kind} className={b.v > 0 ? 'text-[#7a4a0a]' : 'text-[#7d1d14]'}>{b.v > 0 ? '▲' : '▼'} {b.text} ({b.v > 0 ? '+' : ''}{b.v})</span>)}
                      {r.moved !== 0 && <span className="text-[#6b5a44]">{r.moved > 0 ? `${r.moved} place${r.moved === 1 ? '' : 's'} higher` : `${-r.moved} place${r.moved === -1 ? '' : 's'} lower`} than fair</span>}
                    </div>
                  )}
                  <details className="mt-0.5 text-[11px] text-[#4a3b28]">
                    <summary className="cursor-pointer text-[#6b5a44]">Why this rank</summary>
                    <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {([['Closeness', r.close, C_CLOSE], ['Desperation', r.desp, C_DESP], ['Money', r.money, C_MONEY]] as const).map(([l, p, c]) => (
                        <div key={l}><InkBar v={p.v} label={l} color={c} /><div className="mt-0.5 leading-snug">{p.why.join(' · ') || '—'}</div></div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5 pl-7">
                {r.booked ? (
                  <span className="text-[12px] text-[#1d5b33]" data-testid="aud-booked">✓ On the book: {DAY_NAMES[r.booked.d]}, {formatClock(r.booked.h)}</span>
                ) : (
                  <>
                    <button type="button" className="llv-ink-btn llv-ink-btn-red" onClick={() => setOpen(o === 'turn' ? undefined : { key: r.key, what: 'turn' })} aria-expanded={o === 'turn'} data-testid={`aud-turn-${i}`}>Turn away</button>
                    <button type="button" className="llv-ink-btn llv-ink-btn-primary" onClick={() => setOpen(o === 'grant' ? undefined : { key: r.key, what: 'grant' })} aria-expanded={o === 'grant'} data-testid={`aud-grant-${i}`}>Give him an hour ▾</button>
                  </>
                )}
              </div>
              {o === 'turn' && (
                <div className="llv-pop mt-1 flex flex-wrap items-center justify-between gap-2 p-2 text-[12px]" data-testid="aud-turn-confirm">
                  <span>{refusalOutlook(s, r)} His matter stays on your desk.</span>
                  <button type="button" className="llv-ink-btn llv-ink-btn-red" onClick={() => { setOpen(undefined); onTurn(r); }} data-testid="aud-turn-yes">Send him away</button>
                </div>
              )}
              {o === 'grant' && (
                <SlotPicker s={s} hours={PLAN_HOURS.audience} label="Put him in the book" nowLabel={r.ref.tip ? 'Meet him now' : 'Hear him now'} testid="aud-slot"
                  onNow={() => { setOpen(undefined); onGrant(r, 'now'); }} onPick={(sl) => { setOpen(undefined); onGrant(r, sl); }} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
