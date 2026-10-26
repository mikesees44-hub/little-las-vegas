import { createContext, useContext } from 'react';
import type { MapMode } from '../components/IslandMap';
import type { Route } from './routes';

/** A request to point the map at something (alerts, In Motion chips, the street feed). */
export interface MapFocus {
  district?: string;
  city?: string;
  mode?: MapMode;
  level?: 'usa' | 'region' | 'wildwood';
  /** Down onto the Boardwalk as the boss (the walkable stretch at Hunt's Pier). */
  walk?: boolean;
  nonce: number;
}

/** The shell from anywhere: open a drawer section, point the map. */
export interface ShellApi {
  go: (r: Route | string) => void;
  focus: (f: Omit<MapFocus, 'nonce'>) => void;
}

export const ShellContext = createContext<ShellApi>({ go: () => {}, focus: () => {} });

export function useShell(): ShellApi {
  return useContext(ShellContext);
}
