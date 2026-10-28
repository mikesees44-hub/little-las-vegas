import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../engine/types';
import { GoalMenu } from '../plans/GoalMenu';
import { FIND_KIND_LABEL, findAll, type FindResult } from './find';

const ICON = { do: '✦', screen: '▤', person: '☺', place: '⌖' } as const;

/**
 * FIND…: type a few letters — a person, a place, a screen, or what you want to
 * do ("lend", "gift", "hit") — and go there. Arrow keys and Enter, or a tap.
 */
export function FindPalette({ s, open, onPick, onClose }: { s: GameState; open?: (key: string) => boolean; onPick: (r: FindResult) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => findAll(s, q, { open }), [s, q, open]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => setSel(0), [q]);
  const pick = (r?: FindResult) => { if (r) onPick(r); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(hits.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hits[sel]); }
  };
  let lastKind = '';
  return (
    <div className="fixed inset-0 z-[1190] flex items-start justify-center bg-black/60 p-2 pt-[8vh] sm:pt-[12vh]" onClick={onClose} data-testid="find-palette">
      <div className="panel w-full max-w-xl overflow-hidden border-gold-600/60 shadow-2xl shadow-black/80" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Find">
        <div className="flex items-center gap-2 border-b border-noir-700 px-3 py-2">
          <span className="text-gold-400" aria-hidden>⌕</span>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Find a person, a place, a screen, or what you want to do…"
            className="min-w-0 flex-1 bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-500" aria-label="Find" data-testid="find-input" />
          <button type="button" className="text-xs text-stone-400 hover:text-gold-300" onClick={onClose}>Esc</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5" role="listbox">
          {q.trim().length < 2 ? (
            <GoalMenu s={s} open={open} onPick={onPick} />
          ) : !hits.length ? (
            <p className="px-2 py-3 text-xs text-stone-400">Nothing by that name. Try another word.</p>
          ) : hits.map((r, i) => {
            const head = r.kind !== lastKind ? FIND_KIND_LABEL[r.kind] : undefined;
            lastKind = r.kind;
            return (
              <div key={r.id}>
                {head && <div className="px-2 pb-0.5 pt-2 text-[10px] uppercase tracking-[0.25em] text-stone-500">{head}</div>}
                <button type="button" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => pick(r)} data-testid="find-hit" data-kind={r.kind}
                  className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left ${i === sel ? 'bg-gold-500/15' : 'hover:bg-noir-800'}`}>
                  <span className="mt-0.5 w-4 shrink-0 text-center text-gold-500" aria-hidden>{ICON[r.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-stone-100">{r.title}</span>
                    <span className="block truncate text-[11px] text-stone-500">{r.sub}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
