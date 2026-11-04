import { ALWAYS_LABEL, DELEGATION, DELEGATION_IDS, alwaysOn, delegationLevel, setDelegation, type AlwaysCat, type DelegationLevel } from '../../engine/delegation';
import { setAlways } from '../../engine/lieutenants';
import { inTheRanks } from '../../engine/rankView';
import type { GameState } from '../../engine/types';
import { setSettings, type AutoBriefings } from '../settings';

type Act = (f: (s: GameState) => GameState, what: string) => void;

/** The adviser briefings that open by themselves follow the level (Settings keeps its own control too). */
const BRIEFINGS: Record<DelegationLevel, AutoBriefings | undefined> = { hands: 'all', balanced: undefined, chairman: 'off' };

/**
 * DELEGATION LEVEL: one setting, three values (engine/delegation.ts), and the three "always do this"
 * switches it is made of. In Settings (dark) and on the Don's book Standing Orders page (paper).
 */
export function DelegationPicker({ s, act, paper }: { s: GameState; act: Act; paper?: boolean }) {
  if (inTheRanks(s)) return null;
  const lvl = delegationLevel(s);
  const pick = (l: DelegationLevel) => {
    act((x) => setDelegation(x, l), `Delegation: ${DELEGATION[l].name}`);
    try { setSettings({ autoBriefings: BRIEFINGS[l] }); } catch { /* the setting stays as it was */ }
  };
  const btn = (on: boolean) => (paper
    ? `llv-ink-btn ${on ? 'llv-ink-btn-primary' : ''}`
    : `rounded border px-2 py-1 text-xs ${on ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300'}`);
  const muted = paper ? 'text-[11px] text-[#6b5a44]' : 'text-xs text-stone-500';
  return (
    <div className="space-y-1.5" data-testid="delegation-picker">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="How much you hand off">
        {DELEGATION_IDS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={lvl === l} className={btn(lvl === l)} onClick={() => pick(l)} title={DELEGATION[l].blurb} data-testid={`delegation-${l}`}>{DELEGATION[l].name}</button>
        ))}
        {!lvl && <span className={`self-center ${muted}`}>Your own mix</span>}
      </div>
      <p className={muted}>{lvl ? DELEGATION[lvl].blurb : 'You have set the switches yourself. Pick a level to reset them.'} Everything settled for you is listed on the Desk under Handled for you, and you can take any of it back.</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Always let your people settle">
        {(Object.keys(ALWAYS_LABEL) as AlwaysCat[]).map((c) => (
          <label key={c} className={`flex items-center gap-1 ${paper ? 'text-[12px]' : 'text-xs text-stone-300'}`} title={ALWAYS_LABEL[c].line}>
            <input type="checkbox" checked={alwaysOn(s, c)} onChange={(e) => act((x) => setAlways(x, c, e.target.checked), `${e.target.checked ? 'Always' : 'No longer'}: ${ALWAYS_LABEL[c].name.toLowerCase()}`)} data-testid={`always-${c}`} />
            Always: {ALWAYS_LABEL[c].name.toLowerCase()}
          </label>
        ))}
      </div>
    </div>
  );
}
