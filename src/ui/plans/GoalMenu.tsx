import { useState } from 'react';
import { previewAction } from '../../engine/actions';
import type { GameState } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { ACTION_ENTRIES } from '../shell/actionEntries';
import { entryResult, type FindResult } from '../shell/find';
import { entriesByGoal, GOALS, type GoalId } from './actionGoals';
import { recentOrders } from './orderMarks';
import { pinnedOrders, togglePinEntry, usePins } from './pins';

/**
 * Find's front page: "What do you want to do?" Your pinned and recent orders
 * first (one click and the confirm), then everything you can do, by goal, in
 * plain verbs; a star pins a thing to the top.
 */
export function GoalMenu({ s, open, onPick }: { s: GameState; open?: (key: string) => boolean; onPick: (r: FindResult) => void }) {
  const pins = usePins();
  const [goal, setGoal] = useState<GoalId | 'mine'>(() => (pins.entries.length || pinnedOrders(s.seed).length || recentOrders(s.seed).length ? 'mine' : 'money'));
  const by = entriesByGoal();
  const pinnedOrd = pinnedOrders(s.seed);
  const recent = recentOrders(s.seed).filter((a) => !pinnedOrd.some((p) => JSON.stringify(p) === JSON.stringify(a))).filter((a) => { try { previewAction(s, a); return true; } catch { return false; } }).slice(0, 5);
  const entryRow = (label: string) => {
    const i = ACTION_ENTRIES.findIndex((e) => e.label === label);
    if (i < 0) return null;
    const r = entryResult(i, open);
    const pinned = pins.entries.includes(label);
    return (
      <li key={label} className="flex items-start gap-1">
        <button type="button" className="min-w-0 flex-1 rounded px-2 py-1 text-left hover:bg-noir-800" onClick={() => onPick(r)} data-testid="goal-entry">
          <span className="block truncate text-sm text-stone-100">{r.title}</span>
          <span className="block truncate text-[11px] text-stone-500">{r.sub}</span>
        </button>
        <button type="button" className={`shrink-0 px-1 pt-1 text-sm ${pinned ? 'text-gold-400' : 'text-stone-600 hover:text-gold-300'}`} onClick={() => togglePinEntry(label)} aria-pressed={pinned} title={pinned ? 'Unpin' : 'Pin to the top'} data-testid="pin-entry">{pinned ? '★' : '☆'}</button>
      </li>
    );
  };
  return (
    <div data-testid="goal-menu">
      <div className="px-2 pt-1 text-[10px] uppercase tracking-[0.25em] text-stone-500">What do you want to do?</div>
      <div className="flex flex-wrap gap-1 px-1.5 py-1.5" role="tablist">
        <button type="button" role="tab" aria-selected={goal === 'mine'} onClick={() => setGoal('mine')} data-testid="goal-tab-mine"
          className={`rounded border px-2 py-0.5 text-[11px] ${goal === 'mine' ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>★ Pinned & recent</button>
        {GOALS.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={goal === g.id} onClick={() => setGoal(g.id)} data-testid={`goal-tab-${g.id}`}
            className={`rounded border px-2 py-0.5 text-[11px] ${goal === g.id ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>{g.glyph} {g.label}</button>
        ))}
      </div>
      {goal === 'mine' ? (
        <div className="space-y-2 px-1">
          {!pins.entries.length && !pinnedOrd.length && !recent.length && <p className="px-1 py-2 text-xs text-stone-400">Nothing pinned yet. Star a thing to do (☆) or an order, and it waits here. Orders you give show up here too.</p>}
          {pinnedOrd.length > 0 && <div><div className="px-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">Pinned orders</div><div className="mt-1 grid gap-1">{pinnedOrd.map((a, i) => <ActionRow key={`p${i}`} s={s} action={a} />)}</div></div>}
          {recent.length > 0 && <div><div className="px-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">Recent orders: again?</div><div className="mt-1 grid gap-1" data-testid="recent-orders">{recent.map((a, i) => <ActionRow key={`r${i}`} s={s} action={a} />)}</div></div>}
          {pins.entries.length > 0 && <div><div className="px-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">Pinned things to do</div><ul>{pins.entries.map(entryRow)}</ul></div>}
        </div>
      ) : (
        <ul className="px-1" data-testid={`goal-list-${goal}`}>{by[goal].map((e) => entryRow(e.label))}</ul>
      )}
      <p className="px-2 pb-1 pt-2 text-[11px] text-stone-500">Or type: a name, a street, “lend”, “gift”. Ctrl+K or / opens this anywhere.</p>
    </div>
  );
}
