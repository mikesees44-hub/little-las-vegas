import { displayName, player } from '../../engine/characters';
import { HOTSPOTS } from '../../engine/walkData';
import { whoIsAround } from '../../engine/walk';
import type { GameState } from '../../engine/types';
import { useShell } from '../shell/context';
import { useTravel } from '../travel/context';

/**
 * The You drawer's way down to the street: the boss walks the Boardwalk at
 * Hunt's Pier (WalkView, over the island map). Says who is out there this week.
 */
export function WalkLauncher({ s }: { s: GameState }) {
  const shell = useShell();
  const travel = useTravel();
  const npcs = whoIsAround(s);
  const go = () => { shell.go({}); shell.focus({ walk: true }); };
  return (
    <div className="space-y-3" data-testid="walk-launcher">
      <p className="text-sm text-stone-300">{displayName(player(s))} on foot: the boards from Hunt's Pier up to the next pier, the beach, and Ocean Avenue behind. {HOTSPOTS.length} places to walk up to.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-gold" onClick={go} data-testid="walk-launch">Walk the Boardwalk</button>
        <button type="button" className="btn-ghost" disabled={!!s.gameOver} onClick={() => travel.plan(s.playerId)}>Plan a trip…</button>
      </div>
      {npcs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Out on the boards this week</div>
          <ul className="mt-1 space-y-0.5 text-xs text-stone-300">
            {npcs.map((n) => <li key={n.charId}><span className="text-stone-100 font-semibold">{n.name}</span> · {n.doing}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
