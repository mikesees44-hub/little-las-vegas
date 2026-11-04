import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';
import { Overlay } from '../components/Modal';
import { useEscape } from '../keys';
import type { GameState } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { useSheet } from '../components/People';
import { usePlanDo, usePlansApi } from './context';
import { GROUP_INFO, plansCount, plansInMotion, type PlanGroup, type PlanRow, type PlanTone } from './plans';
import { UnderbossSuggests } from './Suggests';

const TONE: Record<PlanTone, string> = {
  bad: 'border-red-500/70 bg-blood-500/10',
  warn: 'border-amber-600/60 bg-amber-500/5',
  good: 'border-emerald-700/60',
  neutral: 'border-noir-700',
};
const BAR: Record<PlanTone, string> = { bad: 'bg-red-500', warn: 'bg-amber-500', good: 'bg-emerald-500', neutral: 'bg-gold-500' };

function Row({ s, r, onDone }: { s: GameState; r: PlanRow; onDone: () => void }) {
  const run = usePlanDo(s);
  const { open } = useSheet();
  return (
    <li className={`rounded border px-2 py-1.5 ${TONE[r.tone]}`} data-testid="plan-row" data-group={r.group}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-4 shrink-0 text-center text-gold-500" aria-hidden style={{ fontVariantEmoji: 'text' } as never}>{r.glyph}&#xFE0E;</span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-stone-100">{r.what}</div>
          <div className="text-[10px] text-stone-400">
            {r.who && <>{r.whoId ? <button type="button" className="underline decoration-dotted hover:text-gold-300" onClick={() => { onDone(); open(r.whoId!); }}>{r.who}</button> : r.who} · </>}
            {r.when && <span className="text-sky-300" data-testid="plan-when">{r.when}</span>}{r.status && <> · {r.status}</>}
          </div>
          {r.progress !== undefined && (
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-noir-700" data-testid="plan-bar" aria-label={`${r.progress}%`}>
              <div className={`h-full ${BAR[r.tone]}`} style={{ width: `${Math.max(2, Math.min(100, r.progress))}%` }} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {r.acts.map((a) => (
            <button key={`${a.id}:${a.label}`} type="button" disabled={!!a.disabled} title={a.disabled}
              className={`rounded border px-1.5 py-0.5 text-[10px] whitespace-nowrap disabled:opacity-40 ${a.id === 'cancel' || a.id === 'veto' ? 'border-red-800/70 text-red-300 hover:border-red-500' : a.id === 'approve' ? 'border-emerald-700 text-emerald-200 hover:bg-emerald-500/10' : a.id === 'open' || a.id === 'speed' ? 'border-gold-600 text-gold-300 hover:bg-gold-500/10' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}
              onClick={() => run(a.do, onDone)} data-testid={`plan-act-${a.id}`}>{a.label}</button>
          ))}
        </div>
      </div>
    </li>
  );
}

function Group({ s, g, onDone }: { s: GameState; g: PlanGroup; onDone: () => void }) {
  const [all, setAll] = useState(false);
  const [shut, setShut] = useState(false);
  const shown = all ? g.rows : g.rows.slice(0, 6);
  const bad = g.rows.some((r) => r.tone === 'bad');
  return (
    <section data-testid={`plan-group-${g.id}`}>
      <button type="button" className="flex w-full items-baseline justify-between gap-2 text-left" onClick={() => setShut((x) => !x)} aria-expanded={!shut}>
        <span className={`text-[10px] uppercase tracking-[0.2em] ${bad ? 'text-red-300' : 'text-stone-400'}`}>{GROUP_INFO[g.id].glyph} {g.title} <span className="tabular-nums">({g.rows.length})</span></span>
        <span className="text-[10px] text-stone-600">{shut ? '▸' : '▾'}</span>
      </button>
      {!shut && <>
        <p className="text-[10px] text-stone-600">{g.blurb}</p>
        <ul className="mt-1 space-y-1">{shown.map((r) => <Row key={r.key} s={s} r={r} onDone={onDone} />)}</ul>
        {g.rows.length > 6 && <button type="button" className="mt-0.5 text-[11px] text-gold-400" onClick={() => setAll((x) => !x)}>{all ? 'fewer' : `all ${g.rows.length} ▾`}</button>}
      </>}
    </section>
  );
}

/** The panel: the inbox first, then everything under way, grouped. */
export function PlansPanel({ s, onClose }: { s: GameState; onClose: () => void }) {
  const { orders } = useOrders();
  const api = usePlansApi();
  const groups = useMemo(() => plansInMotion(s, { orders, answers: api.answers, briefSkip: api.briefSkip }), [s, orders, api.answers, api.briefSkip]);
  const c = plansCount(groups);
  useEscape(true, onClose);
  return (
    <Overlay z={1170} className="bg-black/50" onClick={onClose}>
      <aside className="absolute right-0 top-0 bottom-0 w-full sm:w-[480px] overflow-y-auto overscroll-contain border-l border-gold-600/40 bg-noir-900 p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-3 shadow-2xl llv-slide-right" onClick={(e) => e.stopPropagation()} data-testid="plans-panel" role="dialog" aria-label="Plans in motion">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="panel-title text-base">Everything going on</div>
            <div className="text-[11px] text-stone-400"><span className={c.inbox ? 'text-gold-300' : ''}>{c.inbox} waiting on you</span> · {c.motion} in motion</div>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={onClose} data-testid="plans-close">Close</button>
        </div>
        {!s.gameOver && <UnderbossSuggests s={s} compact />}
        {!groups.length && <p className="text-[12px] text-stone-400">Nothing under way and nothing waiting. Plan a job, give an order, or advance the week.</p>}
        {groups.map((g) => <Group key={g.id} s={s} g={g} onDone={onClose} />)}
      </aside>
    </Overlay>
  );
}

/** How much is in motion, and whether something is against you (the Plans button's count and colour). */
export function usePlansCount(s: GameState) {
  const { orders } = useOrders();
  const api = usePlansApi();
  return useMemo(() => plansCount(plansInMotion(s, { orders, answers: api.answers, briefSkip: api.briefSkip })), [s, orders, api.answers, api.briefSkip]);
}

/** The top bar's "Plans" button: how much is in motion, red when something is against you. */
export function PlansButton({ s }: { s: GameState }) {
  const [open, setOpen] = useState(false);
  const c = usePlansCount(s);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="plans-button" title="Plans in motion: everything you have going and everything going on against you"
        className={`h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap ${c.danger ? 'border-red-500 text-red-300 bg-red-500/10' : c.motion ? 'border-gold-600 text-gold-300' : 'border-noir-600 text-stone-400'}`}>
        ◐<span className="hidden sm:inline"> Plans</span> <span className={`rounded-full px-1.5 text-[10px] ${c.danger ? 'bg-red-500 text-white' : 'bg-noir-700 text-stone-200'}`} data-testid="plans-count">{c.motion}</span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(<PlansPanel s={s} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
