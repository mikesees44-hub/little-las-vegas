import { formatDate } from '../../engine/calendar';
import type { ChronicleEntry, GameState, WeeklyReport } from '../../engine/types';
import { fmt$ } from '../format';
import { Newspapers } from '../components/Newspaper';
import { Storylines } from '../components/Storylines';

export type FeedFilter = 'all' | 'mine' | 'street' | 'family' | 'papers' | 'stories' | 'reports';

const KIND_COLOR: Record<string, string> = {
  decision: 'border-gold-500/60', consequence: 'border-amber-500', death: 'border-red-600', succession: 'border-gold-300',
  rival: 'border-blood-500/60', family: 'border-emerald-700', heat: 'border-sky-600', misc: 'border-noir-600',
};
const KINDS: Record<'mine' | 'street' | 'family', ChronicleEntry['kind'][]> = {
  mine: ['decision', 'consequence', 'succession'],
  street: ['rival', 'heat', 'death', 'misc'],
  family: ['family', 'succession'],
};

/**
 * The one "what happened" feed: the chronicle with filters, the papers'
 * front pages, the living storylines and the weekly reports.
 */
export function Feed({ s, filter, reports = [], onReport }: { s: GameState; filter: FeedFilter; reports?: WeeklyReport[]; onReport?: (r: WeeklyReport[]) => void }) {
  if (filter === 'papers') return <Newspapers s={s} />;
  if (filter === 'stories') return <Storylines s={s} />;
  if (filter === 'reports') {
    const list = reports.length ? reports : s.lastReport ? [s.lastReport] : [];
    return (
      <div className="space-y-1.5" data-testid="feed-reports">
        {list.length === 0 && <p className="text-sm text-stone-500">No weeks played yet.</p>}
        {[...list].reverse().map((r) => {
          const d = Math.round(r.end.money - r.start.money);
          return (
            <button key={r.week} type="button" onClick={() => onReport?.([r])} className="flex w-full items-center justify-between gap-2 rounded border border-noir-700 bg-noir-800/60 px-2.5 py-1.5 text-left text-sm hover:border-gold-500">
              <span className="text-stone-300">Week {r.week} · {formatDate(r.date)} <span className="text-xs text-stone-500">{r.seasonLabel}</span></span>
              <span className={`tabular-nums ${d >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{d >= 0 ? '+' : ''}{fmt$(d)} · resp {r.end.respect - r.start.respect >= 0 ? '+' : ''}{r.end.respect - r.start.respect}</span>
            </button>
          );
        })}
        <p className="text-[11px] text-stone-600">Reports from this sitting; the chronicle keeps the story for good.</p>
      </div>
    );
  }
  const kinds = filter === 'all' ? undefined : KINDS[filter];
  const entries = [...s.chronicle].reverse().filter((e) => !kinds || kinds.includes(e.kind)).slice(0, 200);
  return (
    <ul className="space-y-1.5" data-testid={`feed-${filter}`}>
      {entries.length === 0 && <li className="text-sm text-stone-500">Nothing yet.</li>}
      {entries.map((e, i) => (
        <li key={i} className={`border-l-2 pl-2 text-sm ${KIND_COLOR[e.kind] ?? 'border-noir-600'}`}>
          <div className="text-[10px] uppercase tracking-widest text-stone-600">{formatDate(e.date)} · wk {e.week}</div>
          <div className="text-stone-300">{e.text}</div>
          {e.because && <div className="text-xs text-amber-400/90 italic">because you {e.because} (week {e.becauseWeek})</div>}
        </li>
      ))}
    </ul>
  );
}
