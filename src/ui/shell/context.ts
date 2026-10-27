import { createContext, useContext } from 'react';
import type { MapMode } from '../components/IslandMap';
import type { Route } from './routes';
import type { GameState } from '../../engine/types';

/** A request to point the map at something (alerts, In Motion chips, the street feed). */
export interface MapFocus {
  district?: string;
  city?: string;
  mode?: MapMode;
  level?: 'usa' | 'region' | 'wildwood';
  /** Down onto the Boardwalk as the boss (the walkable stretch at Hunt's Pier). */
  /** true for the Boardwalk at Hunt's Pier; a stretch id (walkStretches.ts) for another street. */
  walk?: boolean | string;
  nonce: number;
}

/** The shell from anywhere: open a drawer section, point the map. */
export interface ShellApi {
  go: (r: Route | string) => void;
  focus: (f: Omit<MapFocus, 'nonce'>) => void;
  /** Change the game now (settings that take effect at once, e.g. the content settings). Absent in isolated renders. */
  update?: (f: (s: GameState) => GameState) => void;
}

export const ShellContext = createContext<ShellApi>({ go: () => {}, focus: () => {} });

export function useShell(): ShellApi {
  return useContext(ShellContext);
}
