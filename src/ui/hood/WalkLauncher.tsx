import { displayName, player } from '../../engine/characters';
import { HOTSPOTS } from '../../engine/walkData';
import { STRETCHES } from '../../engine/walkStretches';
import { whoIsAround } from '../../engine/walk';
import type { GameState } from '../../engine/types';
import { useShell } from '../shell/context';
import { useTravel } from '../travel/context';
import { Backdrop } from './art/sceneArt';

/**
 * The You drawer's way down to the street: the boss walks the Boardwalk at
 * Hunt's Pier (WalkView, over the island map). Says who is out there this week.
 */
export function WalkLauncher({ s }: { s: GameState }) {
  const shell = useShell();
  const travel = useTravel();
  const npcs = whoIsAround(s);
  const go = (at: string | true = true) => { shell.go({}); shell.focus({ walk: at }); };
  return (
    <div className="space-y-3" data-testid="walk-launcher">
      <div className="relative isolate overflow-hidden rounded-md">
        <Backdrop k="scene_island_aerial" opacity={0.85} className="-z-10" />
        <div className="h-24 bg-gradient-to-t from-noir-950/90 to-transparent" />
      </div>
      <p className="text-sm text-stone-300">{displayName(player(s))} on foot: the boards from Hunt's Pier up to the next pier, the beach, and Ocean Avenue behind. {HOTSPOTS.length} places to walk up to.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-gold" onClick={() => go()} data-testid="walk-launch">Walk the Boardwalk</button>
        <button type="button" className="btn-ghost" disabled={!!s.gameOver} onClick={() => travel.plan(s.playerId)}>Plan a trip…</button>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">Or walk another street</div>
        <div className="mt-1 flex flex-wrap gap-1.5" data-testid="walk-stretches">
          {STRETCHES.map((x) => <button key={x.id} type="button" className="btn-ghost text-xs py-1" onClick={() => go(x.id)} title={x.where} data-testid={`walk-launch-${x.id}`}>{x.label}</button>)}
        </div>
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
