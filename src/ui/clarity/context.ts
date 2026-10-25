import { createContext, useContext } from 'react';
import type { Candidate, Role } from '../../engine/candidates';

/**
 * Opening the clarity overlays from anywhere: a candidate picker for a
 * role, the glossary (optionally at a term), and the "What should I do?"
 * panel. Provided by the App; the defaults do nothing so components still
 * render in isolation (tests, other branches' screens).
 */
export interface ClarityApi {
  openPicker: (role: Role, opts?: { onPick?: (c: Candidate) => void; pool?: string[] }) => void;
  openHelp: (term?: string) => void;
  openAdvice: () => void;
  /** Switch the main tab ('business', 'crew', 'table' ...). */
  goTab: (tab: string) => void;
}

export const ClarityContext = createContext<ClarityApi>({ openPicker: () => {}, openHelp: () => {}, openAdvice: () => {}, goTab: () => {} });

export function useClarity(): ClarityApi {
  return useContext(ClarityContext);
}
