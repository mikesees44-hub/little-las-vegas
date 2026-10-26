import type { Briefing } from '../../engine/briefing';
import type { GameState } from '../../engine/types';
import { Portrait } from '../portrait/Portrait';
import { FACTION_TINT } from '../components/People';
import type { ShellAlert } from '../shell/alertRoutes';

/** The right column's first card: who wants a word this week, and what your people did on their own. */
export function SitDownCard({ s, b, onOpen, onRounds }: { s: GameState; b: Briefing; onOpen: () => void; onRounds: () => void }) {
  const talking = b.speakers.filter((sp) => sp.items.length);
  const lines = s.lastReport?.rounds ?? [];
  return (
    <section className="rounded-md border border-gold-600/50 bg-noir-900/80 p-2 text-[12px]" data-testid="sitdown-card">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">The sit-down</div>
        <button type="button" className="text-[10px] text-gold-300 hover:underline" onClick={onRounds} data-testid="sitdown-card-rounds">your rounds ▸</button>
      </div>
      <button type="button" onClick={onOpen} className="mt-1 flex w-full items-center gap-2 rounded border border-noir-700 px-1.5 py-1 text-left hover:border-gold-500" data-testid="sitdown-open">
        <span className="flex -space-x-2">
          {talking.slice(0, 5).map((sp) => {
            const c = sp.charId ? s.characters[sp.charId] : undefined;
            return c ? <span key={sp.key} className="rounded-md ring-2 ring-noir-900"><Portrait c={c} seed={s.seed} date={s.date} size={26} tint={FACTION_TINT[c.faction]} /></span> : null;
          })}
        </span>
        <span className="min-w-0 flex-1 text-stone-200 leading-snug">{b.quiet ? 'A quiet week.' : `${b.items.length} thing${b.items.length === 1 ? '' : 's'} from ${talking.length} of your people`}</span>
        <span className="shrink-0 font-semibold text-gold-300">Hear them ▸</span>
      </button>
      {lines.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-stone-400" data-testid="sitdown-log">
          {lines.slice(0, 4).map((l, i) => <li key={i} className="leading-snug line-clamp-2">{l}</li>)}
        </ul>
      )}
    </section>
  );
}

/** Alerts the sit-down already answers (folded out of the rail while it does). */
export function coveredBy(b: Briefing, skip: readonly string[]): (a: ShellAlert) => boolean {
  const items = b.items.filter((i) => !skip.includes(i.id));
  return (a: ShellAlert) => a.severity !== 'danger' && items.some((i) => i.covers.some((c) => c.kind === a.kind && (!c.charId || c.charId === a.charId)));
}
