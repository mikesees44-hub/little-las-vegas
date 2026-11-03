import { useMemo } from 'react';
import { displayName } from '../../engine/characters';
import { cloneState } from '../../engine/engine';
import { claimStrengths } from '../../engine/oldDon';
import { declaredHeir, pressure, theUb } from '../../engine/shadow';
import type { GameState } from '../../engine/types';

/** The starts where the succession is the game (the Old Don, the Shark's last summer). */
export function chairStart(s: GameState): boolean {
  return !!(s.flags?.start_olddon || s.flags?.start_sees);
}

export interface ChairView {
  pressure: number;
  claimants: { id: string; name: string; total: number }[];
  heir?: string;
  ub?: string;
}

/** The chair at a glance: read on a copy (the succession reads never touch the live game), once a week. */
export function chairView(s: GameState): ChairView | undefined {
  if (!chairStart(s) || s.gameOver) return undefined;
  try {
    const c = cloneState(s);
    const heir = declaredHeir(c);
    const ub = theUb(c);
    const claims = claimStrengths(c).filter((x) => !x.sidelined).sort((a, b) => b.total - a.total);
    return { pressure: pressure(c).score, claimants: claims.map((x) => ({ id: x.id, name: x.name, total: Math.round(x.total) })), heir: heir ? displayName(heir) : undefined, ub: ub ? displayName(ub) : undefined };
  } catch {
    return undefined;
  }
}

/** The same, for a component: recomputed when the week or the game changes. */
export function useChairView(s: GameState): ChairView | undefined {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => chairView(s), [s.seed, s.week, chairStart(s), !!s.gameOver]);
}

/**
 * The Desk's headline for the Old Don and the Shark: the succession is the game, so it sits on the
 * front page, not under Life. "The chair: pressure 50 · 6 claimants · Leonard holding court." One
 * button opens the Succession screen.
 */
export function ChairCard({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const v = useChairView(s);
  if (!v) return null;
  const tone = v.pressure >= 60 ? 'text-red-300' : v.pressure >= 40 ? 'text-amber-300' : 'text-emerald-300';
  return (
    <section className="mb-2 rounded-md border border-gold-600/50 bg-noir-900/80 p-2 text-[12px]" data-testid="chair-card">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">The chair</div>
        <button type="button" className="text-[10px] text-gold-400 hover:text-gold-300" onClick={onOpen} data-testid="chair-open">Succession ▸</button>
      </div>
      <div className="font-semibold text-stone-100">
        Pressure <span className={`tabular-nums ${tone}`}>{v.pressure}</span>
        <span className="font-normal text-stone-400"> · {v.claimants.length} claimant{v.claimants.length === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-stone-400">
        {v.heir ? <>Heir: <span className="text-stone-200">{v.heir}</span></> : <span className="text-red-300">No heir anyone can name</span>}
        {v.ub && v.ub !== v.heir ? <> · <span className="text-stone-200">{v.ub}</span> holding court</> : null}
      </div>
      {v.claimants.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-t border-noir-700 pt-1 text-[11px]">
          {v.claimants.slice(0, 3).map((c) => (
            <li key={c.id} className="flex justify-between gap-2"><span className="truncate text-stone-300">{c.name}</span><span className="tabular-nums text-stone-400">{c.total}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
