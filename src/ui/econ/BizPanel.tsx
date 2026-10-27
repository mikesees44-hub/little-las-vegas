import { useState } from 'react';
import { workload } from '../../engine/applicants';
import { expectedTake, isOpen } from '../../engine/business';
import { CATALOG } from '../../engine/catalog';
import { designOf, SIGN_HEX, STYLES } from '../../engine/design';
import { managerOf, SOURCE_LABEL } from '../../engine/managers';
import type { GameState } from '../../engine/types';
import { rankCandidates } from '../../engine/candidates';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';
import { fmt$ } from '../format';
import { useEmpire } from '../empire/context';
import { venueByKey } from '../../engine/empire';
import { useShell } from '../shell/context';

/** One of your businesses clicked on the map: who runs it, how it's doing, its name and look. */
export function BizPanel({ s, id, noDesigner }: { s: GameState; id: string; noDesigner?: boolean }) {
  const b = s.businesses.find((x) => x.id === id && x.owner === 'player');
  const [name, setName] = useState('');
  const empire = useEmpire();
  const shell = useShell();
  const ven = venueByKey(s, id);
  if (!b) return <div className="text-sm text-stone-500">Not yours any more.</div>;
  const def = CATALOG[b.kind];
  const m = managerOf(s, b.id);
  const mc = m?.charId ? s.characters[m.charId] : undefined;
  const work = mc ? workload(s, mc, b.id) : undefined;
  const d = designOf(s, b.id);
  const district = s.districts.find((x) => x.id === b.districtId)?.name;
  return (
    <div className="space-y-3" data-testid="biz-panel">
      {ven && !noDesigner && <button type="button" className="btn-gold w-full" data-testid="biz-open-designer" onClick={() => empire.open({ venueId: ven.id })}>Open the Empire Designer</button>}
      {(b.kind === 'bank' || b.kind === 'loansharking') && <button type="button" className="btn-gold w-full" data-testid="biz-loan-desk" onClick={() => shell.go('holdings.loandesk')}>Open the Loan desk (your terms, who is asking)</button>}
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
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">The crew suggests</div>
        <div className="mt-1 space-y-1.5">
          {rankCandidates(s, { kind: 'manager', key: b.id }).candidates.filter((c) => c.action && !c.disabledReason && c.charId !== m?.charId).slice(0, 2).map((c) => (
            <div key={c.id}>
              <ActionCard s={s} action={c.action!} compact />
              <div className="px-1 text-[11px] text-stone-500">{c.outcome}{c.pros[0] ? ` · ${c.pros[0].text}` : ''}{c.cons[0] ? ` · ${c.cons[0].text}` : ''}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">A new sign</div>
        <input className="mt-1 w-full rounded border border-noir-600 bg-noir-900 p-1.5 text-sm" maxLength={40} placeholder={b.name} value={name} onChange={(e) => setName(e.target.value)} aria-label="New name" />
        {name.trim() && <div className="mt-1"><ActionCard s={s} action={{ kind: 'econ', op: { type: 'rename', key: b.id, name: name.trim() } }} compact /></div>}
      </div>
    </div>
  );
}
