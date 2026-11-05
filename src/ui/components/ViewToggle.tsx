import { useState } from 'react';
import type { GameState } from '../../engine/types';
import { setViewMode, viewMode, type ViewMode } from '../settings';

/**
 * Simple / Full (STREAMLINE_2 addendum): one global setting, overridable per screen. The hook gives this
 * screen's view and a setter for it; the toggle is two small chips. Nothing is ever removed: Simple puts the
 * rest behind "More…", one tap away.
 */
export function useViewMode(screen: string, s: Pick<GameState, 'difficulty' | 'flags'>): [ViewMode, (v: ViewMode) => void] {
  const [, bump] = useState(0);
  const v = viewMode(screen, s);
  return [v, (x: ViewMode) => { setViewMode(screen, x); bump((n) => n + 1); }];
}

export function ViewToggle({ screen, view, onChange }: { screen: string; view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-noir-600 text-[10px]" role="group" aria-label="Simple or full view" data-testid={`view-toggle-${screen}`} data-view={view}>
      {(['simple', 'full'] as const).map((x) => (
        <button key={x} type="button" aria-pressed={view === x} onClick={() => onChange(x)} data-testid={`view-${x}`}
          className={`px-2 py-0.5 ${view === x ? 'bg-gold-500/20 text-gold-200' : 'text-stone-400 hover:text-stone-200'}`}>{x === 'simple' ? 'Simple' : 'Full'}</button>
      ))}
    </span>
  );
}
