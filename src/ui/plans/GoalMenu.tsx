import { useMemo, useState } from 'react';
import { previewAction } from '../../engine/actions';
import { recommendations, type Rec } from '../../engine/planner/brief';
import type { GameState } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { ACTION_ENTRIES, type ActionEntry } from '../shell/actionEntries';
import { entryResult, type FindResult } from '../shell/find';
import { entriesByGoal, GOALS, type GoalId } from './actionGoals';
import { entriesByVerb, entryWhere, VERBS, type Verb } from './actionVerbs';
import { recentOrders } from './orderMarks';
import { pinnedOrders, togglePinEntry, usePins } from './pins';

export type MenuView = 'verbs' | 'goals';

/** A recommendation that is not an order, as a Find pick: a face, a screen, or the Don's book where it waits. */
export function recPick(r: Rec): FindResult {
  const g = r.go;
  const go: FindResult['go'] = g.char ? { to: 'sheet', id: g.char }
    : g.tab ? { to: 'route', key: g.tab }
    : g.office ? { to: 'office' }
    : { to: 'planner', page: g.audience ? 'audience' : g.datebook || g.day !== undefined ? 'datebook' : 'brief' };
  return { kind: 'do', id: r.id, title: r.title, sub: r.why, go, score: r.score };
}

/**
 * DO SOMETHING… (Find's front page, STREAMLINE_2 §3.4): your pinned and recent
 * orders, the consigliere's top three right now, then everything you can do by
 * verb: Talk, Pay, Order, Plan, Buy, Travel, Hurt, Protect, each grouped by the
 * home it is done in. "What do you want?" flips to the five goals (the same
 * entries, sorted by what you want out of them). A star pins a thing to the top.
 */
export function VerbMenu({ s, open, onPick, initialView = 'verbs' }: { s: GameState; open?: (key: string) => boolean; onPick: (r: FindResult) => void; initialView?: MenuView }) {
  const pins = usePins();
  const [view, setView] = useState<MenuView>(initialView);
  const mine = !!(pins.entries.length || pinnedOrders(s.seed).length || recentOrders(s.seed).length);
  const [verb, setVerb] = useState<Verb | 'mine'>(() => (mine ? 'mine' : 'talk'));
  const [goal, setGoal] = useState<GoalId | 'mine'>(() => (mine ? 'mine' : 'money'));
  const recs = useMemo(() => { try { return recommendations(s); } catch { return []; } }, [s]);
  const byGoal = entriesByGoal();
  const byVerb = entriesByVerb();
  const pinnedOrd = pinnedOrders(s.seed);
  const recent = recentOrders(s.seed).filter((a) => !pinnedOrd.some((p) => JSON.stringify(p) === JSON.stringify(a))).filter((a) => { try { previewAction(s, a); return true; } catch { return false; } }).slice(0, 5);
  const entryRow = (label: string) => {
    // A pin made under an entry's old label still finds it (actionEntries `was`).
    const i = ACTION_ENTRIES.findIndex((e) => e.label === label || e.was === label);
    if (i < 0) return null;
    const r = entryResult(i, open);
    const e = ACTION_ENTRIES[i];
    const pinKey = pins.entries.includes(e.label) ? e.label : e.was && pins.entries.includes(e.was) ? e.was : e.label;
    const pinned = pins.entries.includes(pinKey);
    return (
      <li key={e.label} className="flex items-start gap-1">
        <button type="button" className="min-w-0 flex-1 rounded px-2 py-1 text-left hover:bg-noir-800" onClick={() => onPick(r)} data-testid="goal-entry">
          <span className="block truncate text-sm text-stone-100">{r.title}</span>
          <span className="block truncate text-[11px] text-stone-500">{r.sub}</span>
        </button>
        <button type="button" className={`shrink-0 px-1 pt-1 text-sm ${pinned ? 'text-gold-400' : 'text-stone-600 hover:text-gold-300'}`} onClick={() => togglePinEntry(pinKey)} aria-pressed={pinned} title={pinned ? 'Unpin' : 'Pin to the top'} data-testid="pin-entry">{pinned ? '★' : '☆'}</button>
      </li>
    );
  };
  const byWhere = (list: ActionEntry[]) => {
    const groups: { where: string; items: ActionEntry[] }[] = [];
    for (const e of list) {
      const w = entryWhere(e);
      const g = groups.find((x) => x.where === w);
      if (g) g.items.push(e); else groups.push({ where: w, items: [e] });
    }
    return groups;
  };
  const tab = (on: boolean) => `rounded border px-2 py-0.5 text-[11px] ${on ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`;
  const sel = view === 'verbs' ? verb : goal;
  return (
    <div data-testid="goal-menu">
      <div data-testid="verb-menu" className="flex items-center justify-between gap-2 px-2 pt-1">
        <span className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Do something…</span>
        <span className="flex gap-1 text-[10px]" role="group" aria-label="Sort by">
          <button type="button" className={tab(view === 'verbs')} aria-pressed={view === 'verbs'} onClick={() => setView('verbs')} data-testid="menu-view-verbs" title="Everything you can do, by what you do: talk, pay, order…">By verb</button>
          <button type="button" className={tab(view === 'goals')} aria-pressed={view === 'goals'} onClick={() => setView('goals')} data-testid="menu-view-goals" title="The same things, by what you want out of them">What do you want?</button>
        </span>
      </div>
      {recs.length > 0 && (
        <div className="px-1 pt-1.5" data-testid="verb-recs">
          <div className="px-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">Recommended now</div>
          <div className="mt-1 grid gap-1">
            {recs.map((r) => r.go.order ? <ActionRow key={r.id} s={s} action={r.go.order} label={r.title} /> : (
              <button key={r.id} type="button" className="rounded border border-noir-700 px-2 py-1 text-left hover:border-gold-500" onClick={() => onPick(recPick(r))} data-testid="verb-rec">
                <span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm text-stone-100">{r.title}</span>{r.odds !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-gold-300">{Math.round(r.odds * 100)}%</span>}<span className="shrink-0 text-[11px] text-gold-400">{r.cta} ▸</span></span>
                <span className="block truncate text-[11px] text-stone-500">{r.why}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1 px-1.5 py-1.5" role="tablist">
        <button type="button" role="tab" aria-selected={sel === 'mine'} onClick={() => (view === 'verbs' ? setVerb('mine') : setGoal('mine'))} data-testid="goal-tab-mine" className={tab(sel === 'mine')}>★ Pinned & recent</button>
        {view === 'verbs'
          ? VERBS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={verb === v.id} onClick={() => setVerb(v.id)} data-testid={`verb-tab-${v.id}`} title={v.blurb} className={tab(verb === v.id)}>{v.glyph} {v.label}</button>
          ))
          : GOALS.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={goal === g.id} onClick={() => setGoal(g.id)} data-testid={`goal-tab-${g.id}`} className={tab(goal === g.id)}>{g.glyph} {g.label}</button>
          ))}
      </div>
      {sel === 'mine' ? (
        <div className="space-y-2 px-1">
          {!pins.entries.length && !pinnedOrd.length && !recent.length && <p className="px-1 py-2 text-xs text-stone-400">Nothing pinned yet. Star a thing to do (☆) or an order, and it waits here. Orders you give show up here too.</p>}
          {pinnedOrd.length > 0 && <div><div className="px-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">Pinned orders</div><div className="mt-1 grid gap-1">{pinnedOrd.map((a, i) => <ActionRow key={`p${i}`} s={s} action={a} />)}</div></div>}
          {recent.length > 0 && <div><div className="px-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">Recent orders: again?</div><div className="mt-1 grid gap-1" data-testid="recent-orders">{recent.map((a, i) => <ActionRow key={`r${i}`} s={s} action={a} />)}</div></div>}
          {pins.entries.length > 0 && <div><div className="px-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">Pinned things to do</div><ul>{pins.entries.map(entryRow)}</ul></div>}
        </div>
      ) : view === 'goals' ? (
        <ul className="px-1" data-testid={`goal-list-${goal}`}>{byGoal[goal as GoalId].map((e) => entryRow(e.label))}</ul>
      ) : (
        <div className="px-1" data-testid={`verb-list-${verb}`}>
          <p className="px-1 pb-1 text-[11px] text-stone-500">{VERBS.find((v) => v.id === verb)?.blurb}.</p>
          {byWhere(byVerb[verb as Verb]).map((g) => (
            <div key={g.where}>
              <div className="px-1 pt-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">{g.where}</div>
              <ul>{g.items.map((e) => entryRow(e.label))}</ul>
            </div>
          ))}
        </div>
      )}
      <p className="px-2 pb-1 pt-2 text-[11px] text-stone-500">Or type: a name, a street, “lend”, or a verb and a name (“pay Sal”, “hit Kessler”). Ctrl+K or / opens this anywhere.</p>
    </div>
  );
}

/** The old name: Find's front page. */
export const GoalMenu = VerbMenu;
