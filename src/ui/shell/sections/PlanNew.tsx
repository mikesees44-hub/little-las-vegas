import { useMemo, useState } from 'react';
import { hitTargetGroups } from '../../../engine/peopleRead';
import { openPeople } from '../../people/PeopleLedger';
import { displayName } from '../../../engine/characters';
import { SCHEME_INFO } from '../../../engine/schemes';
import { knownSecrets } from '../../../engine/secrets';
import type { Character, GameState, SchemeKind } from '../../../engine/types';
import { usePlanner } from '../../components/Schemes';
import { FACTION_NAMES } from '../../../engine/world';
import { intrigueOpen, heistOpen } from '../unlocks';

/** Who a scheme of this kind could be aimed at, best-known first. */
export function schemeTargets(s: GameState, kind: SchemeKind): Character[] {
  const mobs = new Set(s.rivals.filter((r) => r.kind === 'mob').map((r) => r.id as string));
  const leaders = new Set(s.rivals.map((r) => r.leaderId));
  const all = Object.values(s.characters).filter((c) => c.alive && c.id !== s.playerId && c.faction !== 'player');
  const rivalMen = all.filter((c) => mobs.has(c.faction) && c.rank !== 'civilian');
  let list: Character[];
  switch (kind) {
    case 'murder': list = rivalMen.filter((c) => !c.office); break;
    case 'blackmail': list = all.filter((c) => knownSecrets(s, c.id).length > 0); break;
    case 'informant': case 'flip': list = rivalMen.filter((c) => !leaders.has(c.id)); break;
    case 'frame': list = rivalMen; break;
    default: list = all.filter((c) => leaders.has(c.id) || !!c.office || (mobs.has(c.faction) && c.rank !== 'civilian'));
  }
  return list.sort((a, b) => Number(leaders.has(b.id)) - Number(leaders.has(a.id)) || Number(!!b.office) - Number(!!a.office) || a.lastName.localeCompare(b.lastName)).slice(0, 40);
}

const ORDER: SchemeKind[] = ['befriend', 'sway', 'envoy', 'murder', 'heist', 'claim', 'blackmail', 'informant', 'flip', 'frame'];
const UNTARGETED = new Set<SchemeKind>(['heist', 'envoy', 'claim']);

/** Operations › Plan new: every kind of scheme in one grid. Aimed at a man? Pick him, then plan. */
export function PlanNew({ s }: { s: GameState }) {
  const kinds = ORDER.filter((k) => (k === 'heist' ? heistOpen(s) : ['blackmail', 'informant', 'flip', 'frame'].includes(k) ? intrigueOpen(s) : true));
  const hidden = ORDER.length - kinds.length;
  return (
    <div className="space-y-3" data-testid="plan-new">
      <p className="text-xs text-stone-500">Hits, heists, envoys and plots all run the same way: agents, weeks of work, odds, and a chance it leaks. You can also start one from any man's sheet (right-click a face).</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {kinds.map((k) => <PlanCard key={k} s={s} kind={k} />)}
      </div>
      {hidden > 0 && <p className="text-[11px] text-stone-600">{hidden} more kinds open up later: seat a consigliere who knows a secret for the dirty work; heists after the first season's weeks.</p>}
    </div>
  );
}

function PlanCard({ s, kind }: { s: GameState; kind: SchemeKind }) {
  const { plan } = usePlanner();
  // A hit: everyone, grouped by family with your own as its own section (peopleRead.ts); the rest as before.
  const groups = useMemo(() => (kind === 'murder' ? hitTargetGroups(s) : undefined), [kind, s]);
  const targets = UNTARGETED.has(kind) ? [] : groups ? groups.flatMap((g) => g.ids.filter((id) => !g.protectedIds.includes(id))).map((id) => s.characters[id]) : schemeTargets(s, kind);
  // Never your own man by default: he is there to be chosen, not to be landed on.
  const [t, setT] = useState(targets.find((c) => c.faction !== 'player')?.id ?? targets[0]?.id ?? '');
  const info = SCHEME_INFO[kind];
  const blocked = !UNTARGETED.has(kind) && targets.length === 0;
  return (
    <div className={`rounded-md border p-2.5 ${info.hostile ? 'border-blood-500/40 bg-blood-500/5' : 'border-noir-700 bg-noir-800/60'}`}>
      <div className="font-semibold text-stone-100 text-sm">{info.name}</div>
      <div className="text-[11px] text-stone-400">{info.text}</div>
      <div className="mt-1.5 flex gap-1.5 items-center">
        {!UNTARGETED.has(kind) && (
          <select className="min-w-0 flex-1 rounded bg-noir-900 border border-noir-600 p-1 text-xs" value={t} onChange={(e) => setT(e.target.value)} aria-label={`${info.name} target`} disabled={blocked}>
            {groups ? groups.map((g) => (
              <optgroup key={g.group} label={g.label}>
                {g.ids.map((id) => { const c = s.characters[id]; const prot = g.protectedIds.includes(id); return <option key={id} value={id} disabled={prot}>{displayName(c)} — {c.office ?? (c.rank !== 'civilian' ? c.rank : FACTION_NAMES[c.faction])}{prot ? ' (protected: Philadelphia\'s rule)' : ''}</option>; })}
              </optgroup>
            )) : targets.map((c) => <option key={c.id} value={c.id}>{displayName(c)} — {c.office ?? FACTION_NAMES[c.faction]}</option>)}
            {blocked && <option value="">nobody yet</option>}
          </select>
        )}
        {kind === 'murder' && <button type="button" className="btn-ghost text-xs py-1 shrink-0" onClick={() => openPeople('hit')} data-testid="plan-hitlist" title="Everyone by family, with your read on each and the odds and heat of a hit">Hit list…</button>}
        <button type="button" className={`${info.hostile ? 'btn border border-blood-500 text-red-300 hover:bg-blood-500/20' : 'btn-ghost'} text-xs py-1 shrink-0 ${UNTARGETED.has(kind) ? 'ml-auto' : ''}`} disabled={blocked} onClick={() => plan(kind, UNTARGETED.has(kind) ? undefined : t || undefined)}>
          Plan…
        </button>
      </div>
    </div>
  );
}
