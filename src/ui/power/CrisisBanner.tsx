import { displayName } from '../../engine/characters';
import { activeBlitz } from '../../engine/blitz';
import { STATION_INFO } from '../../engine/station';
import type { GameState } from '../../engine/types';

/** A strip under the orders tray while the family is in a crisis, under a blitz, or the player is not the boss. */
export function CrisisBanner({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const p = s.power;
  if (!p) return null;
  const c = p.crisis;
  const b = activeBlitz(s, undefined, 'player');
  const low = p.station !== 'boss';
  if (!c && !b && !low) return null;
  const text = c
    ? `Succession crisis — beat ${c.beat + 1} of ${c.beats}. ${displayName(s.characters[s.playerId])} holds the chair. Cohesion ${c.meters.cohesion} · survival ${c.meters.survival}.`
    : b
      ? `Under a blitz: hit ${b.idx + 1} of ${b.targets.length} is next.`
      : `${STATION_INFO[p.station].name}: ${STATION_INFO[p.station].text}`;
  return (
    <button type="button" onClick={onOpen} data-testid="crisis-banner" className={`w-full text-left rounded-md border px-3 py-1.5 text-xs ${c || b ? 'border-blood-400/70 bg-blood-900/30 text-red-200' : 'border-gold-600/40 bg-noir-800/60 text-gold-200'}`}>
      {text}
    </button>
  );
}
