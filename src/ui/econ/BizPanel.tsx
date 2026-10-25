import { useState } from 'react';
import { workload } from '../../engine/applicants';
import { expectedTake, isOpen } from '../../engine/business';
import { CATALOG } from '../../engine/catalog';
import { designOf, SIGN_HEX, STYLES } from '../../engine/design';
import { managerOf, SOURCE_LABEL } from '../../engine/managers';
import type { GameState } from '../../engine/types';
import { CandidatePicker } from '../clarity/CandidatePicker';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';
import { fmt$ } from '../format';

/** One of your businesses clicked on the map: who runs it, how it's doing, its name and look. */
export function BizPanel({ s, id }: { s: GameState; id: string }) {
  const b = s.businesses.find((x) => x.id === id && x.owner === 'player');
  const [name, setName] = useState('');
  if (!b) return <div className="text-sm text-stone-500">Not yours any more.</div>;
  const def = CATALOG[b.kind];
  const m = managerOf(s, b.id);
  const mc = m?.charId ? s.characters[m.charId] : undefined;
  const work = mc ? workload(s, mc, b.id) : undefined;
  const d = designOf(s, b.id);
  const district = s.districts.find((x) => x.id === b.districtId)?.name;
  return (
    <div className="space-y-3" data-testid="biz-panel">
      <div>
        <div className="font-display text-xl text-gold-400" style={d?.sign ? { color: SIGN_HEX[d.sign], textShadow: `0 0 8px ${SIGN_HEX[d.sign]}66` } : undefined}>{b.name}</div>
        <div className="text-xs text-stone-400">{def.name} · {district}{d?.style ? ` · ${STYLES[d.style].name}` : ''}</div>
      </div>
      <div className="text-sm">
        <div className="text-[10px] uppercase tracking-widest text-stone-500">How it's doing</div>
        <div className={isOpen(s, b) ? 'text-gold-300' : 'text-red-400'}>{isOpen(s, b) ? (def.base === 0 ? 'Earns by the score' : `~${fmt$(expectedTake(s, b))}/wk`) : `Padlocked until week ${b.closedUntil}`} <span className="text-xs text-stone-500">· upkeep {fmt$(b.upkeep)}/wk</span></div>
      </div>
      <div className="text-sm">
        <div className="text-[10px] uppercase tracking-widest text-stone-500">Who runs it</div>
        {m ? (
          <div>
            {mc ? <CharLink s={s} id={mc.id} /> : m.name} <span className="text-xs text-stone-500">{SOURCE_LABEL[m.source].toLowerCase()} · skill {m.skill} · {fmt$(m.salary)}/wk · {m.oversight.replace('_', '-')} oversight</span>
            {work && <div className="text-xs text-stone-500">Time {work.time} · energy {work.energy}{work.effort < 0.95 ? ` · runs it at ${Math.round(work.effort * 100)}%` : ''}{work.jobs.length ? ` · also: ${work.jobs.join(', ')}` : ''}</div>}
          </div>
        ) : <div className="text-stone-400">Nobody in charge — the crew and the counter staff.</div>}
      </div>
      <CandidatePicker s={s} role={{ kind: 'manager', key: b.id }} limit={2} hideAdvisors />
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">A new sign</div>
        <input className="mt-1 w-full rounded border border-noir-600 bg-noir-900 p-1.5 text-sm" maxLength={40} placeholder={b.name} value={name} onChange={(e) => setName(e.target.value)} aria-label="New name" />
        {name.trim() && <div className="mt-1"><ActionCard s={s} action={{ kind: 'econ', op: { type: 'rename', key: b.id, name: name.trim() } }} compact /></div>}
      </div>
    </div>
  );
}
