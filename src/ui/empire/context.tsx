import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { applyEmpireCmd, type EmpireCmd } from '../../engine/empire';
import { journalNow } from '../../engine/journal';
import { useFeedback } from '../components/Feedback';
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

const EMPIRE_WORDS: Partial<Record<EmpireCmd['cmd'], string>> = {
  plan: 'Drew up the plan for a place', setup: 'Set up a place', mode: 'Changed how a place is run', preset: 'Applied a setup to a place',
  savePreset: 'Saved a setup', policy: 'Changed a place\'s rules', rate: 'Set a room rate', supply: 'Changed a supply', supplier: 'Changed a supplier',
  project: 'Started a project at a place', cancelProject: 'Cancelled a project', dismiss: 'Dismissed a suggestion',
  hire: 'Hired staff', staffToTarget: 'Staffed a place up', fire: 'Let someone go', head: 'Named a department head', wage: 'Set a wage', spaceStatus: 'Opened or closed a space',
};

export function EmpireHost({ s, setS, children }: { s: GameState; setS: (f: (s: GameState) => GameState) => void; children: ReactNode }) {
  const [ref, setRef] = useState<DesignerRef | undefined>();
  const fb = useFeedback();
  // A change to a place you run takes effect at once: the click says so, and Your File keeps it.
  const apply = useCallback((cmd: EmpireCmd) => {
    const what = EMPIRE_WORDS[cmd.cmd] ?? 'Changed how the place runs';
    setS((x) => { const n = applyEmpireCmd(x, cmd); return n === x ? n : journalNow(n, { t: what, c: 'property', ln: 'designer' }); });
    fb.notify({ kind: 'done', title: what });
  }, [setS, fb]);
  const api = useMemo<EmpireApi>(() => ({ open: setRef, apply }), [apply]);
  return (
    <EmpireContext.Provider value={api}>
      {children}
      {ref && <DesignerHub s={s} target={ref} onClose={() => setRef(undefined)} />}
    </EmpireContext.Provider>
  );
}
