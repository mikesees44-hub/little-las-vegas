import { useState } from 'react';
import { ageOn } from '../../engine/calendar';
import { player } from '../../engine/characters';
import { SUCCESSION_LAWS } from '../../engine/dynasty';
import { activeAlliances } from '../../engine/familyHouses';
import { renownTier } from '../../engine/familyLegacy';
import { houseById } from '../../engine/familyState';
import type { GameState, SuccessionLaw } from '../../engine/types';
import { FamilyTree } from '../components/FamilyTree';
import { CharLink, Face } from '../components/People';
import { ActivitiesPanel } from './ActivitiesPanel';
import { Badge, Label, StressBar } from './bits';
import { DecisionsPanel } from './DecisionsPanel';
import { DynastyTree, treeMarks } from './DynastyTree';
import { LegacyPanel } from './LegacyPanel';
import { MarriagePanel } from './MarriagePanel';

type Sub = 'tree' | 'marriages' | 'activities' | 'decisions' | 'legacy' | 'succession';
const SUBS: { id: Sub; label: string }[] = [
  { id: 'tree', label: 'Dynasty' },
  { id: 'marriages', label: 'Marriages & Children' },
  { id: 'activities', label: 'Activities' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'legacy', label: 'Legacy' },
  { id: 'succession', label: 'Succession & History' },
];

/** The Family tab: the CK dynasty screen. */
export function FamilyTab({ s, pendingLaw, pendingHeir, onLaw, onHeir }: {
  s: GameState;
  pendingLaw?: SuccessionLaw;
  pendingHeir?: string;
  onLaw: (l: SuccessionLaw) => void;
  onHeir: (id: string) => void;
}) {
  const [sub, setSub] = useState<Sub>('tree');
  return (
    <div className="space-y-3" data-testid="family-tab">
      <HouseHeader s={s} />
      <nav className="flex flex-wrap gap-1 border-b border-noir-700 pb-1" aria-label="Family sections">
        {SUBS.map((x) => (
          <button key={x.id} data-testid={`family-sub-${x.id}`} onClick={() => setSub(x.id)}
            className={`rounded px-2.5 py-1 text-xs font-semibold ${sub === x.id ? 'bg-gold-500 text-noir-950' : 'text-stone-400 hover:text-gold-300'}`}>
            {x.label}
          </button>
        ))}
      </nav>
      {sub === 'tree' && <DynastyTree s={s} />}
      {sub === 'marriages' && <MarriagePanel s={s} />}
      {sub === 'activities' && <ActivitiesPanel s={s} />}
      {sub === 'decisions' && <DecisionsPanel s={s} />}
      {sub === 'legacy' && <LegacyPanel s={s} />}
      {sub === 'succession' && <FamilyTree s={s} pendingLaw={pendingLaw} pendingHeir={pendingHeir} onLaw={onLaw} onHeir={onHeir} />}
    </div>
  );
}

export function HouseHeader({ s }: { s: GameState }) {
  const boss = player(s);
  const marks = treeMarks(s);
  const heir = marks.heirId ? s.characters[marks.heirId] : undefined;
  const claimants = [...marks.claimants].map((id) => s.characters[id]).filter(Boolean);
  const allies = activeAlliances(s);
  const d = s.dyn;
  return (
    <section className="grid gap-3 rounded-md border border-noir-700 bg-noir-800/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]" data-testid="house-header">
      <div className="flex gap-2 min-w-0">
        <Face s={s} c={boss} size={52} />
        <div className="min-w-0">
          <Label>Head of the house of {s.houseName}</Label>
          <div className="text-sm font-semibold text-gold-300 truncate"><CharLink s={s} id={boss.id} /></div>
          <div className="text-[11px] text-stone-400">{ageOn(boss.birth, s.date)} yrs · {SUCCESSION_LAWS[s.successionLaw].name} succession</div>
          <div className="mt-1 max-w-[220px]"><StressBar s={s} c={boss} wide /></div>
        </div>
      </div>
      <div className="min-w-0">
        <Label>Heir</Label>
        {heir ? (
          <div className="flex items-center gap-2 mt-0.5">
            <Face s={s} c={heir} size={36} />
            <div className="text-sm min-w-0"><CharLink s={s} id={heir.id} /> <span className="text-xs text-stone-500">{ageOn(heir.birth, s.date)}</span></div>
          </div>
        ) : <div className="text-sm text-red-400">No heir — the house would fall</div>}
        {claimants.length > 0 && (
          <div className="mt-1 text-xs text-amber-200">Claimants: {claimants.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<CharLink s={s} id={c.id} /></span>)}</div>
        )}
      </div>
      <div className="min-w-0">
        <Label>Renown</Label>
        <div className="text-sm"><span className="text-gold-300 font-semibold tabular-nums">{Math.round(d?.renown ?? 0)}</span> <span className="text-xs text-stone-400">to spend · {renownTier(d?.renownTotal ?? 0)}</span></div>
        <div className="mt-1 flex flex-wrap gap-1">
          {(d?.titles ?? []).map((t) => <Badge key={t} tone="gold">{t}</Badge>)}
          {allies.map((a) => <Badge key={a.houseId + a.since} tone="good">⚭ {houseById(s, a.houseId)?.name}</Badge>)}
          {!d?.titles.length && !allies.length && <span className="text-[11px] text-stone-500">No alliances yet. Marry into a strong house.</span>}
        </div>
      </div>
    </section>
  );
}
