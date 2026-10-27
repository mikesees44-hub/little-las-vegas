import { TableButton } from '../advice/CounselTable';
import { bossDesk, readyReview, type DeskItem, type DeskKind, type DeskUi } from '../../engine/desk';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { Modal } from '../components/Modal';
import { useState } from 'react';

/**
 * THE BOSS'S DESK: one weekly place for everything that wants the boss —
 * decisions, morning requests, the sit-down's recommendations, this week's
 * orders, bills and what is coming. Each row opens the same screen the
 * header's shortcuts open (the decision, the day, the sit-down, the order).
 */

export interface DeskApi {
  onEvent: (iid: string) => void;
  onDay: (day: number) => void;
  onSitDown: () => void;
  onCancelOrder: (i: number) => void;
  onMoney: () => void;
  onChar: (id: string) => void;
}

const ICON: Record<DeskKind, string> = { decision: '✉', morning: '☕', sitdown: '♜', order: '☰', bill: '$', upcoming: '◷' };

function Row({ it, api }: { it: DeskItem; api: DeskApi }) {
  const open = () => {
    if (it.ref.event) api.onEvent(it.ref.event);
    else if (it.kind === 'morning' || (it.kind === 'upcoming' && it.ref.day !== undefined)) api.onDay(it.ref.day ?? 0);
    else if (it.kind === 'sitdown') api.onSitDown();
    else if (it.kind === 'bill') api.onMoney();
    else if (it.ref.charId) api.onChar(it.ref.charId);
  };
  const verb = it.kind === 'decision' ? (it.done ? 'Change' : 'Decide') : it.kind === 'morning' ? (it.done ? 'Change' : 'Answer') : it.kind === 'sitdown' ? 'Hear him out' : it.kind === 'bill' ? 'Money' : it.kind === 'order' ? undefined : 'Open';
  return (
    <li className={`flex items-start gap-2 rounded border px-2 py-1.5 ${it.urgent ? 'border-red-400/70 bg-blood-500/10' : it.done ? 'border-noir-700 opacity-75' : 'border-noir-700 bg-noir-900/60'}`} data-testid={`desk-item-${it.kind}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-stone-100">{it.done ? '✓ ' : ''}{it.title}{it.urgent && <span className="ml-1 rounded bg-red-500/80 px-1 text-[9px] font-bold uppercase text-white">urgent</span>}</div>
        <div className="text-[11px] text-stone-400">{it.detail}</div>
        {it.ifNothing && <div className="text-[10px] text-stone-500">If you leave it: {it.ifNothing}</div>}
      </div>
      {it.kind === 'order' && it.ref.order !== undefined
        ? <button type="button" className="btn-ghost shrink-0 text-[11px] py-0.5" onClick={() => api.onCancelOrder(it.ref.order!)} data-testid="desk-cancel-order">Cancel</button>
        : verb && <button type="button" className="btn-ghost shrink-0 text-[11px] py-0.5" onClick={open}>{verb} ▸</button>}
    </li>
  );
}

/** A group's rows: the first three (unanswered first), then "show all" — the rest are a tap away, never gone. */
function DeskGroupList({ g, api }: { g: ReturnType<typeof bossDesk>[number]; api: DeskApi }) {
  const [all, setAll] = useState(false);
  const rows = [...g.items.filter((x) => !x.done), ...g.items.filter((x) => x.done)];
  const shown = all ? rows : rows.slice(0, 3);
  return (
    <>
      <ul className="mt-1 space-y-1">{shown.map((it) => <Row key={it.key} it={it} api={api} />)}</ul>
      {rows.length > 3 && (
        <button type="button" className="mt-1 text-[11px] text-gold-400 hover:text-gold-300" onClick={() => setAll((x) => !x)} data-testid={`desk-more-${g.kind}`}>
          {all ? 'show fewer' : `show all ${rows.length} ▾`}
        </button>
      )}
    </>
  );
}

export function BossDesk({ s, ui, api }: { s: GameState; ui: DeskUi; api: DeskApi }) {
  const groups = bossDesk(s, ui);
  const waiting = groups.reduce((a, g) => a + g.items.filter((x) => (g.kind === 'decision' || g.kind === 'morning') && !x.done).length, 0);
  return (
    <section className="rounded-md border border-gold-600/50 bg-noir-800/50 p-2.5" data-testid="boss-desk">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="panel-title text-base">The Boss's Desk</div>
        <div className="text-[11px] text-stone-400">{waiting ? `${waiting} waiting on you` : 'Nothing waiting on you'} · week {s.week}</div>
      </div>
      {!groups.length && <p className="mt-1 text-[12px] text-stone-500">A clean desk. Plan an evening, start something, or advance the week.</p>}
      <div className="mt-1.5 grid gap-2 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.kind} data-testid={`desk-group-${g.kind}`}>
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{ICON[g.kind]} {g.title} ({g.items.length})</div>
            <DeskGroupList g={g} api={api} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Ready to advance?": what is unanswered and what it becomes, the orders that run, what is known to cost. */
export function ReadyToAdvance({ s, ui, onReview, onAdvance, onClose, month, onAnswer }: { s: GameState; ui: DeskUi; onReview: () => void; onAdvance: () => void; onClose: () => void; month?: boolean; onAnswer?: (iid: string, choiceId: string) => void }) {
  const r = readyReview(s, ui);
  return (
    <Modal onClose={onClose}>
      <div className="p-4 sm:p-5 space-y-3" data-testid="ready-review">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl text-gold-400">Ready to advance{month ? ' the month' : ''}?</h2>
          <button type="button" className="btn-ghost text-xs" onClick={onClose}>Cancel</button>
        </div>
        {r.unanswered.length > 0 && (
          <div data-testid="ready-unanswered">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Not decided — this is what happens</div>
            <ul className="mt-1 space-y-0.5 text-[12px]">{r.unanswered.map((u) => <li key={u.iid}><span className="text-stone-200">{u.title}</span> <span className="text-stone-500">→</span> <span className="text-amber-200">{u.becomes}</span> <TableButton s={s} subject={{ kind: 'event', iid: u.iid }} onChoose={onAnswer ? (c) => onAnswer(u.iid, c) : undefined} testid="ready-table" /></li>)}</ul>
          </div>
        )}
        {r.mornings.length > 0 && (
          <div data-testid="ready-mornings">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Capos' requests you haven't answered</div>
            <ul className="mt-1 space-y-0.5 text-[12px]">{r.mornings.map((m) => <li key={m.key}><span className="text-stone-200">{m.title}</span> <span className="text-stone-500">→ his way:</span> <span className="text-stone-300">{m.becomes}</span></li>)}</ul>
          </div>
        )}
        <div data-testid="ready-orders">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Orders that run ({r.orders.length})</div>
          {r.orders.length ? <ul className="mt-1 space-y-0.5 text-[12px]">{r.orders.map((o, i) => <li key={i} className="flex justify-between gap-2"><span className="text-stone-200">{o.title}</span><span className="tabular-nums text-stone-400">{o.cost ? `${fmt$(o.cost)} · ${o.pot === 'pocket' ? 'pocket' : 'Family'}` : 'free'}</span></li>)}</ul> : <p className="text-[12px] text-stone-500">None queued.</p>}
        </div>
        <div className="rounded border border-noir-700 bg-noir-900/60 p-2 text-[12px] tabular-nums" data-testid="ready-costs">
          <div className="flex justify-between"><span className="text-stone-400">Orders</span><span>{fmt$(r.costs.orders)}</span></div>
          <div className="flex justify-between"><span className="text-stone-400">Your evenings (pocket)</span><span>{fmt$(r.costs.evenings)}</span></div>
          <div className="flex justify-between"><span className="text-stone-400">Weekly bills (payroll, upkeep, loans)</span><span>{fmt$(r.costs.bills)}</span></div>
          <div className="mt-1 flex justify-between border-t border-noir-700 pt-1"><span className="text-stone-400">After the orders and evenings</span><span>Family {fmt$(r.costs.familyAfter)} · pocket {fmt$(r.costs.pocketAfter)}</span></div>
          <div className="text-[10px] text-stone-500">Known costs only. The week's take, the envelope and anything that happens come on top.</div>
        </div>
        {r.warnings.map((w, i) => <div key={i} className="text-[12px] text-red-300">⚠ {w}</div>)}
        <div className="flex flex-wrap gap-2 border-t border-noir-700 pt-2">
          {(r.unanswered.length > 0 || r.mornings.length > 0) && <button type="button" className="btn-ghost text-sm" onClick={onReview} data-testid="ready-review-btn">Review first</button>}
          <button type="button" className="btn-gold text-sm" onClick={onAdvance} data-testid="ready-advance">{r.unanswered.length ? 'Advance anyway ▸' : 'Advance ▸'}</button>
        </div>
      </div>
    </Modal>
  );
}
