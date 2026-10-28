import { createContext, useContext } from 'react';
import { leaderBlock } from '../../engine/travel';
import type { GameState } from '../../engine/types';

/** Opening the trip planner and the flight planner from anywhere. Provided by the App. */
export interface TravelApi {
  plan: (leaderId: string, destId?: string) => void;
  flee: (personId: string) => void;
  /** "Go there yourself" (visit.ts): the departure card, for a city or to pick one. */
  go?: (cityId?: string) => void;
  /** The city screen, while the boss is away. */
  city?: () => void;
}

export const TravelContext = createContext<TravelApi>({ plan: () => {}, flee: () => {} });

export function useTravel(): TravelApi {
  return useContext(TravelContext);
}

/** "Travel…" for the boss card and character sheets. */
export function TravelButton({ s, charId, className }: { s: GameState; charId: string; className?: string }) {
  const { plan } = useTravel();
  const why = leaderBlock(s, charId);
  if (why === 'Not one of yours to send' || why === 'Not among the living') return null;
  return (
    <button
      type="button"
      data-testid="travel-button"
      className={className ?? 'btn-ghost text-xs py-1'}
      disabled={!!why || !!s.gameOver}
      title={why ?? 'Plan a trip: a vacation, or business in another city'}
      onClick={(e) => { e.stopPropagation(); plan(charId); }}
    >
      Travel…
    </button>
  );
}
