import { useState } from 'react';
import { previewAction } from '../../engine/actions';
import { weekChecklist, whatShouldIDo, type Opportunity } from '../../engine/opportunities';
import type { GameState } from '../../engine/types';
import { Modal } from '../components/Modal';
import { useOrders } from '../components/Orders';
import { useSheet } from '../components/People';
import { useClarity } from './context';

/**
 * "WHAT SHOULD I DO?": the best opportunities and the worst threats right
 * now, ranked, each with a button that does the thing (queues the order,
 * opens the right picker, the right tab or the right man), and a short
 * "This week" checklist for new players tied to the early-goals ladder.
 */

function safeGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, v: string): void {
  try { window.localStorage.setItem(key, v); } catch { /* private mode */ }
}

export function WhatToDoPanel({ s, onTab, answered = 0, compact }: { s: GameState; onTab?: (tab: string) => void; answered?: number; compact?: boolean }) {
  const { orders, queue } = useOrders();
  const { open } = useSheet();
  const { openPicker, goTab } = useClarity();
  const items = whatShouldIDo(s, 5);
  const [hideList, setHideList] = useState(() => safeGet('llv.checklist.hidden') === '1');
  const check = weekChecklist(s, { answered, ordersQueued: orders.length });
  const showCheck = !hideList && s.week <= 30;
  const go = (o: Opportunity) => {
    const l = o.link;
    if (l.action && !previewAction(s, l.action).disabledReason) queue(l.action);
    else if (l.role) openPicker(l.role);
    else if (l.charId) open(l.charId);
    else if (l.tab) (onTab ?? goTab)(l.tab);
  };
  const queued = (o: Opportunity) => !!o.link.action && orders.some((x) => JSON.stringify(x) === JSON.stringify(o.link.action));
  return (
    <section className="space-y-2" data-testid="what-to-do">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-display text-base uppercase tracking-[0.12em] text-gold-400 whitespace-nowrap">What should I do?</div>
        <span className="hidden text-[10px] text-stone-500 2xl:inline">ranked by what is at stake</span>
      </div>
      <ol className="space-y-1.5">
        {items.map((o, i) => (
          <li key={o.id} className={`rounded-md border px-2.5 py-1.5 ${o.kind === 'threat' ? 'border-blood-500/50 bg-blood-500/10' : 'border-noir-700 bg-noir-800/60'}`} data-testid="wsid-item">
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${o.kind === 'threat' ? 'bg-blood-500 text-white' : 'bg-gold-500 text-noir-950'}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-tight text-stone-100">{o.title}</div>
                {!compact && <div className="text-[11px] leading-snug text-stone-400">{o.text}</div>}
              </div>
              <button type="button" className={`shrink-0 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold ${queued(o) ? 'border-noir-600 text-stone-500' : 'border-gold-500 text-gold-300 hover:bg-gold-500/15'}`} disabled={queued(o)} onClick={() => go(o)}>
                {queued(o) ? 'Ordered' : o.cta}
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-stone-500">Nothing pressing. A good week to plan.</li>}
      </ol>
      {showCheck && (
        <div className="rounded-md border border-noir-700 bg-noir-900/60 p-2" data-testid="this-week">
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">This week</div>
            <button type="button" className="text-[10px] text-stone-500 hover:text-gold-300" onClick={() => { setHideList(true); safeSet('llv.checklist.hidden', '1'); }}>hide</button>
          </div>
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {check.map((c) => (
              <li key={c.id} className={c.done ? 'text-stone-500 line-through decoration-stone-600' : 'text-stone-200'} title={c.hint}>
                <span className={c.done ? 'text-emerald-400' : 'text-gold-400'}>{c.done ? '✓' : '○'}</span> {c.text}
                {!c.done && c.hint && <span className="block pl-4 text-[11px] text-stone-500 no-underline">{c.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function WhatToDoModal({ s, onTab, answered, onClose }: { s: GameState; onTab: (tab: string) => void; answered: number; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="p-4 sm:p-5">
        <div className="mb-1 flex justify-end"><button className="btn-ghost text-xs" onClick={onClose}>Close</button></div>
        <WhatToDoPanel s={s} answered={answered} onTab={(t) => { onTab(t); onClose(); }} />
      </div>
    </Modal>
  );
}
