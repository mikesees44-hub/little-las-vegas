/**
 * "The week is turning…": the desk calendar's page tears off and flips over to the next week while the
 * (synchronous, slow) week turn runs. It is painted before the work starts (App.turnWeek waits two frames),
 * and every moving part is a transform or an opacity, which the browser animates off the main thread, so the
 * page keeps flipping while the engine counts the week. Reduced motion: the same card, still.
 */
export function WeekTurning({ week, mode = 'week', progress, onStop }: {
  week: number;
  mode?: 'week' | 'month' | 'season' | 'turn';
  /** A turn of several weeks (STREAMLINE_2 §5.4): "Week 2 of 4: …", between weeks. */
  progress?: { done: number; of: number; line: string };
  /** "Stop after this week": the turn ends at the next week's turn. */
  onStop?: () => void;
}) {
  const what = progress ? `Week ${progress.done + 1} of ${progress.of}…` : mode === 'week' || mode === 'turn' ? 'The week is turning…' : mode === 'month' ? 'The month is turning…' : 'The season is turning…';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[6000] flex justify-center px-4" role="status" aria-live="polite" data-testid="week-turning">
      <div className="llv-wt flex items-center gap-3 rounded-xl border border-gold-600/70 bg-noir-900/95 py-2.5 pl-3 pr-5 shadow-2xl shadow-black/80">
        <div className="llv-wt-cal" aria-hidden>
          <span className="llv-wt-ring" />
          <span className="llv-wt-page llv-wt-under"><small>Week</small>{mode === 'week' || mode === 'turn' ? week + (progress?.done ?? 0) + 1 : '…'}</span>
          <span className="llv-wt-page llv-wt-flip"><small>Week</small>{week + (progress?.done ?? 0)}</span>
        </div>
        <div className="min-w-0">
          <div className="font-display text-base font-bold leading-tight text-gold-300">{what}</div>
          {progress && <div className="text-[11.5px] text-stone-300" data-testid="week-turning-progress">Week {progress.done} done: {progress.line.replace(/\.$/, '').toLowerCase()}</div>}
          <div className="llv-wt-lines text-[11.5px] text-stone-400" aria-hidden>
            <span>Counting the envelopes</span>
            <span>Hearing from the street</span>
            <span>Reading the morning papers</span>
          </div>
        </div>
        {onStop && progress && <button type="button" className="btn-secondary btn-sm pointer-events-auto ml-2" onClick={onStop} data-testid="turn-stop">Stop after this week</button>}
      </div>
    </div>
  );
}
