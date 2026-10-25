import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { useTributeUi } from './context';

/** "This Week": the Monday envelope — what came, how it was split, or that he is waiting. */
export function TakeLine({ s }: { s: GameState }) {
  const ui = useTributeUi();
  const t = s.tribute;
  const rep = t?.reports[t.reports.length - 1];
  if (!t || !rep) return null;
  const ub = rep.ubId ? s.characters[rep.ubId] : undefined;
  const pending = rep.status === 'presented';
  return (
    <div className={`mt-1.5 rounded border px-1.5 py-1 ${pending ? 'border-amber-500/70 bg-amber-900/10' : 'border-noir-700'}`} data-testid="take-line">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-gold-400/80">The take</span>
        <button type="button" className="text-[10px] text-gold-300 hover:underline" onClick={() => ui.openAudience(rep.id)} data-testid="take-open">{pending ? 'he is waiting ▸' : 'the office ▸'}</button>
      </div>
      <div className="leading-snug text-stone-300">
        {ub ? ub.firstName : 'The count'} brought <b className="text-gold-300 tabular-nums">{fmt$(rep.presented)}</b>
        {rep.lastPresented !== undefined && <span className={`tabular-nums ${rep.presented >= rep.lastPresented ? 'text-emerald-400' : 'text-red-400'}`}> ({rep.presented >= rep.lastPresented ? '+' : '−'}{fmt$(Math.abs(rep.presented - rep.lastPresented))})</span>}
        {rep.alloc ? <span className="text-stone-400 tabular-nums"> · you {fmt$(rep.alloc.personal)} · family {fmt$(rep.alloc.treasury)} · reserve {fmt$(rep.alloc.reserve)}</span> : <span className="text-amber-300"> · waiting for your split</span>}
      </div>
      {rep.crews.some((c) => c.paid > 0) && (
        <div className="text-[10px] text-stone-400 tabular-nums leading-snug" data-testid="take-crews-line">
          {rep.crews.filter((c) => c.paid > 0 || c.short > 0).map((c, i) => {
            const k = s.characters[c.capoId];
            return <span key={c.capoId}>{i ? ' · ' : ''}{k?.lastName ?? '?'} {fmt$(c.paid)}{c.short ? <span className="text-red-300"> (−{fmt$(c.short)})</span> : null}</span>;
          })}
        </div>
      )}
      <div className="text-[10px] text-stone-500 tabular-nums">Your own {fmt$(t.acct.personal)} · reserve {fmt$(t.acct.reserve)}</div>
    </div>
  );
}
