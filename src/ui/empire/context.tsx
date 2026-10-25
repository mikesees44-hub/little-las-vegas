import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { applyEmpireCmd, type EmpireCmd } from '../../engine/empire';
import type { GameState } from '../../engine/types';
import { DesignerHub, type DesignerRef } from './DesignerHub';

/**
 * Opening the Empire Designer from anywhere (a signed Deal, a building on the
 * map, the Holdings drawer), and applying its configuration changes at once.
 * Configuration never moves money: wages, supplies and projects are paid by
 * the ledger when the week turns.
 */
export interface EmpireApi {
  open: (ref: DesignerRef) => void;
  apply: (cmd: EmpireCmd) => void;
}

export const EmpireContext = createContext<EmpireApi>({ open: () => {}, apply: () => {} });

export function useEmpire(): EmpireApi {
  return useContext(EmpireContext);
}

export function EmpireHost({ s, setS, children }: { s: GameState; setS: (f: (s: GameState) => GameState) => void; children: ReactNode }) {
  const [ref, setRef] = useState<DesignerRef | undefined>();
  const apply = useCallback((cmd: EmpireCmd) => setS((x) => applyEmpireCmd(x, cmd)), [setS]);
  const api = useMemo<EmpireApi>(() => ({ open: setRef, apply }), [apply]);
  return (
    <EmpireContext.Provider value={api}>
      {children}
      {ref && <DesignerHub s={s} target={ref} onClose={() => setRef(undefined)} />}
    </EmpireContext.Provider>
  );
}
