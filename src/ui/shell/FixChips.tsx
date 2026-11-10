import { useEffect, useMemo, useRef, useState } from 'react';
import { setEvening } from '../../engine/days';
import { fixGroups, type FixGroup, type FixKind, type FixRow } from '../../engine/fastFix';
import type { GameState } from '../../engine/types';
import { ConfirmOrders } from '../components/ConfirmOrders';
import { useOrders } from '../components/Orders';
import { useEscape } from '../keys';
import { sameOrder } from '../verbs';
import { useShell } from './context';

/** Test ids: the earn chip keeps the ones it shipped with. */
const ids = (k: FixKind) => (k === 'earn'
  ? { chip: 'earn-chip', pop: 'earn-pop', row: 'earn-row', fix: 'earn-fix', all: 'earn-fix-all', open: 'earn-board' }
  : { chip: `fix-chip-${k}`, pop: `fix-pop-${k}`, row: 'fix-row', fix: 'fix-fix', all: `fix-all-${k}`, open: `fix-open-${k}` });

const OPEN_LABEL: Record<FixKind, string> = { earn: 'Who is earning', places: 'Your places', debts: 'The loan desk', grudges: 'Trouble inside', nights: 'Her and the evenings', lapses: 'The Desk' };

/** What "Fix all" gives: the safe orders (never a heavy or harmful one) not already given, and her evening. */
export function fixAllRows(g: FixGroup, orders: readonly import('../../engine/types').PlayerAction[]): FixRow[] {
  return g.rows.filter((r) => r.safe && (r.evening !== undefined || (!!r.action && !orders.some((o) => sameOrder(o, r.action!)))));
}

function useRowFix() {
  const { orders, queue } = useOrders();
  const shell = useShell();
  const done = (r: FixRow) => !!r.action && orders.some((o) => sameOrder(o, r.action!));
  const apply = (r: FixRow, confirmed: boolean) => {
    if (r.evening !== undefined) { shell.update?.((x) => setEvening(x, r.evening!, 'fam:wife')); return; }
    if (r.action) queue(r.action, confirmed);
  };
  const can = (r: FixRow) => (r.evening !== undefined ? !!shell.update : !!r.action);
  return { orders, done, apply, can, go: shell.go };
}

function openRoute(go: ReturnType<typeof useShell>['go'], route: string) {
  if (route === 'desk') go({ home: 'desk' });
  else go(route);
}

/** One group's list: each item, why, the one fix; "Fix all" (one confirm listing the orders); the full screen. */
function FixList({ g, onClose }: { g: FixGroup; onClose: () => void }) {
  const { orders, done, apply, can, go } = useRowFix();
  const [ask, setAsk] = useState(false);
  const all = fixAllRows(g, orders);
  const t = ids(g.kind);
  return (
    <div data-testid={t.pop}>
      <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">{g.title}</div>
      <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
        {g.rows.map((r) => {
          const q = done(r);
          return (
            <li key={r.key} className="flex items-center gap-2" data-testid={t.row}>
              <div className="min-w-0 flex-1"><span className="text-stone-200">{r.name}</span> <span className="text-stone-500">· {r.why}</span></div>
              {can(r)
                ? <button type="button" className="btn-secondary shrink-0 max-w-[50%] truncate text-[11px]" disabled={q} onClick={() => apply(r, false)} title={r.fix} data-testid={t.fix}>{q ? 'Ordered' : r.fix}</button>
                : <button type="button" className="btn-quiet shrink-0 text-[11px]" onClick={() => { onClose(); openRoute(go, g.route); }} data-testid={t.fix}>{r.fix} ▸</button>}
            </li>
          );
        })}
      </ul>
      {ask && all.length > 0 && (
        <ConfirmOrders className="mt-2" testid={`fix-confirm-${g.kind}`} yesTestId="fix-confirm-yes" lines={all.map((r) => `${r.name}: ${r.fix}`)}
          onYes={() => { for (const r of all) apply(r, true); setAsk(false); }} onNo={() => setAsk(false)} />
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {all.length > 1 && !ask && <button type="button" className="btn-primary text-xs" onClick={() => setAsk(true)} data-testid={t.all}>Fix all {all.length}</button>}
        <button type="button" className="btn-secondary text-xs" onClick={() => { onClose(); openRoute(go, g.route); }} data-testid={t.open}>{OPEN_LABEL[g.kind]} ▸</button>
      </div>
    </div>
  );
}

function usePop() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  useEscape(open, () => setOpen(false));
  return { open, setOpen, ref };
}

/** One fix chip ("$ 3 not earning", "▣ 1 losing money"…): a tap opens its list. Hidden when nothing needs fixing. */
export function FixChip({ g, initialOpen }: { g: FixGroup; initialOpen?: boolean }) {
  const { orders } = useOrders();
  const { open, setOpen, ref } = usePop();
  const shown = open || !!initialOpen;
  const todo = g.rows.filter((r) => !(r.action && orders.some((o) => sameOrder(o, r.action!)))).length;
  const t = ids(g.kind);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} data-testid={t.chip} aria-expanded={shown}
        title={`${g.title}: tap to see why and fix them`}
        className={`btn-secondary h-8 px-1.5 py-0 sm:px-2 text-xs font-semibold whitespace-nowrap ${todo ? (g.kind === 'grudges' || g.kind === 'lapses' ? 'border-red-500/60 text-red-200 hover:border-red-300' : 'border-amber-500/70 text-amber-300 hover:border-amber-300') : 'border-emerald-600/60 text-emerald-300'}`}>
        {g.glyph} {todo ? `${todo} ${g.label}` : 'all fixed'}
      </button>
      {shown && (
        <div className="absolute right-0 z-[60] mt-1 w-[min(92vw,380px)] rounded-md border border-noir-600 bg-noir-900 p-2 text-xs shadow-xl">
          <FixList g={g} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * THE FIX CHIPS (top bar): men not earning, places losing money, what is owed you late, men with a grudge,
 * nights home short, what runs out this week — each a chip with why, the one fix, Fix all and the full
 * screen. They fold into one "⚑ N fixes" menu at every width (a tab per kind), so the bar stays one clean row.
 * Nothing shows when nothing needs fixing.
 */
export function FixChips({ s }: { s: GameState }) {
  const { orders } = useOrders();
  const groups = useMemo(() => fixGroups(s, orders), [s, orders]);
  const { open, setOpen, ref } = usePop();
  const [sel, setSel] = useState<FixKind | undefined>();
  if (!groups.length) return null;
  const n = groups.reduce((a, g) => a + g.rows.length, 0);
  const cur = groups.find((g) => g.kind === sel) ?? groups[0];
  return (
    <>
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="fix-menu" title="What needs fixing: tap to see why and fix it"
          className="btn-secondary h-8 border-amber-500/70 px-1.5 py-0 text-xs font-semibold whitespace-nowrap text-amber-300">⚑ {n} fix{n === 1 ? '' : 'es'}</button>
        {open && (
          <div className="absolute right-0 z-[60] mt-1 w-[min(92vw,380px)] rounded-md border border-noir-600 bg-noir-900 p-2 text-xs shadow-xl" data-testid="fix-menu-pop">
            <div className="mb-1.5 flex flex-wrap gap-1" role="tablist">
              {groups.map((g) => (
                <button key={g.kind} type="button" role="tab" aria-selected={cur.kind === g.kind} onClick={() => setSel(g.kind)} data-testid={`fix-tab-${g.kind}`}
                  className={`btn-sm rounded-full border px-2 py-0.5 text-[10px] ${cur.kind === g.kind ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-400'}`}>{g.glyph} {g.rows.length} {g.label}</button>
              ))}
            </div>
            <FixList g={cur} onClose={() => setOpen(false)} />
          </div>
        )}
      </div>
    </>
  );
}
