import { createContext, useContext } from 'react';
import type { EnvelopeChoice } from '../../engine/tributeOps';

/** The weekly take's UI hooks: the split chosen in the office, and opening the office from anywhere. */
export interface TributeUiApi {
  envelope?: EnvelopeChoice;
  setEnvelope: (e: EnvelopeChoice | undefined) => void;
  /** Open the Don's office for a report (the latest when omitted). */
  openAudience: (reportId?: string) => void;
}

export const TributeUiContext = createContext<TributeUiApi>({ setEnvelope: () => {}, openAudience: () => {} });

export const useTributeUi = () => useContext(TributeUiContext);
