import { storylines } from '../../engine/livingStories';
import type { GameState } from '../../engine/types';

/**
 * The Storylines tracker: the slow-burn arcs running in the family, their
 * current stage, the people in them, and what the boss has seen so far.
 * It shows only what the boss knows (the arc history), never a hidden truth.
 */
export function Storylines({ s }: { s: GameState }) {
  const lines = storylines(s);
  const active = lines.filter((l) => l.arc.status === 'active');
  const done = lines.filter((l) => l.arc.status === 'done');
  if (!lines.length) {
    return <p className="text-sm text-stone-500" data-testid="storylines-empty">No storylines yet. Give it a few weeks: the island has a way of starting things.</p>;
  }
  return (
    <div className="space-y-4" data-testid="storylines">
      <section>
        <h2 className="text-xs uppercase tracking-widest text-gold-400 mb-2">In progress ({active.length})</h2>
        {!active.length && <p className="text-sm text-stone-500">Nothing is brewing right now.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {active.map(({ arc, tpl, stage, cast }) => (
            <article key={arc.id} className="panel p-3 min-w-0" data-arc={arc.tpl}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-stone-100">{tpl.name}</h3>
                <span className="text-[10px] uppercase tracking-widest text-amber-400">{stage?.title ?? '—'}</span>
              </div>
              <p className="text-xs text-stone-400 italic mt-0.5">Since week {arc.started}: {tpl.synopsis}</p>
              {cast.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {cast.map((c) => (
                    <li key={c.label + c.name} className="text-[11px] rounded bg-noir-800 border border-noir-600 px-1.5 py-0.5 text-stone-300">
                      <span className="text-stone-500">{c.label}:</span> {c.name}
                    </li>
                  ))}
                </ul>
              )}
              <ol className="mt-2 space-y-1 border-l border-noir-600 pl-2">
                {arc.history.slice(1).map((h, i) => (
                  <li key={i} className="text-xs text-stone-300"><span className="text-stone-600">wk {h.week} · </span>{h.text}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>
      {done.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-widest text-stone-500 mb-2">Finished ({done.length})</h2>
          <ul className="space-y-1.5">
            {done.map(({ arc, tpl, cast }) => (
              <li key={arc.id} className="border-l-2 border-noir-600 pl-2 text-sm">
                <span className="text-stone-200">{tpl.name}</span>
                <span className="text-stone-500"> · wk {arc.started}–{arc.ended}{cast.length ? ` · ${cast.map((c) => c.name).join(', ')}` : ''}</span>
                <div className="text-xs text-stone-400 italic">{arc.ending}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
