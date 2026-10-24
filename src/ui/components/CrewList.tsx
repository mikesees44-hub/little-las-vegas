import { useState } from 'react';
import { ageOn } from '../../engine/calendar';
import { crew, displayName, isFree, TRAIT_INFO } from '../../engine/characters';
import { skimRate } from '../../engine/economy';
import { getRelation, opinionBreakdown } from '../../engine/relations';
import type { Character, GameState, Rank } from '../../engine/types';
import { signed } from '../format';

const RANK_ORDER: Rank[] = ['underboss', 'consigliere', 'capo', 'soldier', 'associate'];

export function CrewList({ s }: { s: GameState }) {
  const members = crew(s).sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-500">{members.length} men. Tap a name to see what he thinks of you, and why.</p>
      {members.map((c) => (
        <CrewRow key={c.id} s={s} c={c} />
      ))}
    </div>
  );
}

export function OpinionBadge({ v }: { v: number }) {
  const tone = v >= 25 ? 'text-emerald-400' : v <= -25 ? 'text-red-400' : 'text-stone-300';
  return <span className={`tabular-nums font-semibold ${tone}`}>{signed(v)}</span>;
}

function CrewRow({ s, c }: { s: GameState; c: Character }) {
  const [open, setOpen] = useState(false);
  const { total, mods } = opinionBreakdown(s, c.id, s.playerId);
  const rel = getRelation(s, c.id, s.playerId);
  const district = s.districts.find((d) => d.capoId === c.id);
  const free = isFree(s, c);
  return (
    <div className="rounded-md border border-noir-700 bg-noir-800/70">
      <button className="w-full text-left px-3 py-2" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-stone-100 truncate">
              {displayName(c)}
              {c.dynasty && <span className="ml-1 text-gold-400" title="Member of the house">♦</span>}
            </div>
            <div className="text-xs text-stone-400">
              <span className="capitalize">{c.rank}</span>
              {district ? ` · ${district.name}` : ''} · {ageOn(c.birth, s.date)} yrs · health {c.health}
              {!free && <span className="text-red-400"> · in jail until wk {c.imprisonedUntil}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">Opinion</div>
            <OpinionBadge v={total} />
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {c.traits.map((t) => (
            <span key={t} className="chip-neutral" title={TRAIT_INFO[t]}>{t}</span>
          ))}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 text-sm border-t border-noir-700 pt-2 space-y-2">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-xs">
            {Object.entries(c.attributes).map(([k, v]) => (
              <div key={k} className="rounded bg-noir-900 px-1.5 py-1">
                <div className="text-stone-500 capitalize">{k}</div>
                <div className="tabular-nums text-stone-200">{v}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-stone-400">
            Ambition: <span className="text-stone-200">{c.ambition}</span> · Fear {rel?.fear ?? 0} · Trust {rel?.trust ?? 0} · Grievance {rel?.grievance ?? 0}
            {c.rank === 'capo' && ` · skims ~${Math.round(skimRate(s, c) * 100)}% (est.)`}
          </div>
          {c.conditions.length > 0 && <div className="text-xs text-red-300">Conditions: {c.conditions.join(', ')}</div>}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-stone-500">What he thinks of you</div>
            {mods.length === 0 && <div className="text-xs text-stone-500">No strong feelings either way.</div>}
            <ul>
              {mods.map((m) => (
                <li key={m.id} className="flex justify-between text-xs py-0.5">
                  <span className="text-stone-300">
                    {m.reason}
                    {m.decay === 0 && <span className="text-stone-600"> (permanent)</span>}
                  </span>
                  <OpinionBadge v={m.value} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
