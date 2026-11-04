import { displayName } from '../../engine/characters';
import { activeBlitz } from '../../engine/blitz';
import { STATION_INFO } from '../../engine/station';
import { placeSummary } from '../../engine/valente';
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
    ? `Beat ${c.beat + 1} of ${c.beats}. ${displayName(s.characters[s.playerId])} holds the chair. Cohesion ${c.meters.cohesion} · survival ${c.meters.survival}.`
    : b
      ? `Hit ${b.idx + 1} of ${b.targets.length} is next.`
      : placeSummary(s)?.line ?? `${STATION_INFO[p.station].name}: ${STATION_INFO[p.station].text}`;
  return (
    <button type="button" onClick={onOpen} data-testid="crisis-banner" className={`group flex w-full items-center gap-2.5 text-left rounded-lg border px-3 py-2 text-[12.5px] leading-snug ${c || b ? 'border-blood-400/70 bg-blood-500/15 text-red-100 hover:border-red-300' : 'border-gold-600/40 bg-noir-800/60 text-stone-100 hover:border-gold-400'}`}>
      <span aria-hidden className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] ${c || b ? 'bg-blood-500/40 text-red-100' : 'bg-gold-500/15 text-gold-300'}`}>{c ? '♛' : b ? '✸' : '♙'}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[10px] font-semibold uppercase tracking-[0.25em] ${c || b ? 'text-red-300' : 'text-gold-500'}`}>{c ? 'Succession crisis' : b ? 'Under a blitz' : 'Your place'}</span>
        <span className="block">{text}</span>
      </span>
      <span aria-hidden className="shrink-0 text-[11px] font-semibold opacity-70 group-hover:opacity-100">Open ▸</span>
    </button>
  );
}
