import { expectedTake } from '../../engine/business';
import { managerOf, rankManagers, SOURCE_LABEL } from '../../engine/managers';
import { lotName, propertyNet, STAGE_LABEL, USES_BY_ID, ZONES_BY_ID } from '../../engine/property';
import { rivalName } from '../../engine/construction';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { lotProgress, lotSvg } from '../map/lotIcons';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';
import { STATUS_LABEL } from './RealEstate';
import { useEmpire } from '../empire/context';
import { venueForLot } from '../../engine/empire';

/** A property clicked on the map: what it is, who runs it, and who the crew thinks should. */
export function LotPanel({ s, id, noDesigner }: { s: GameState; id: string; noDesigner?: boolean }) {
  const l = s.econ?.lots.find((x) => x.id === id);
  if (!l) return null;
  const u = l.use ? USES_BY_ID[l.use] : undefined;
  const mine = l.status === 'owned' || l.status === 'leased';
  const biz = l.bizId ? s.businesses.find((b) => b.id === l.bizId) : undefined;
  const key = biz ? biz.id : `lot:${l.id}`;
  const m = mine ? managerOf(s, key) : undefined;
  const take = biz ? expectedTake(s, biz) : mine && l.stage === 'open' && u ? Math.max(0, propertyNet(s, l).rev - propertyNet(s, l).exp) : 0;
  const picks = mine && l.stage === 'open' && (biz || !l.tenant || l.operating) ? rankManagers(s, key, Math.max(take, 100)).slice(0, 3) : [];
  const best = picks[0];
  const empire = useEmpire();
  const ven = mine ? venueForLot(s, l.id) : undefined;
  return (
    <div className="space-y-3" data-testid="lot-panel">
      {ven && !noDesigner && <button type="button" className="btn-gold w-full" data-testid="lot-open-designer" onClick={() => empire.open({ venueId: ven.id })}>Open the Empire Designer</button>}
      {mine && !noDesigner && !l.use && l.stage !== 'permits' && <button type="button" className="btn-gold w-full" onClick={() => empire.open({ pending: { key: `lot:${l.id}`, name: lotName(l), develop: { lotId: l.id } } })}>Develop it (Designer)</button>}
      <div className="flex items-center gap-2">
        <span dangerouslySetInnerHTML={{ __html: lotSvg(l, { size: 40 }) }} />
        <div>
          <div className="font-display text-xl text-gold-400">{lotName(l)}</div>
          <div className="text-xs text-stone-400">{ZONES_BY_ID[l.zone].name} · {STATUS_LABEL[l.status]}{l.owner !== 'player' && l.owner !== 'private' ? ` (${rivalName(l.owner)})` : ''}{l.builtYear && l.stage === 'open' ? ` · built ${l.builtYear}` : ''}</div>
        </div>
      </div>
      {l.stage && l.stage !== 'open' && l.stage !== 'purchase' && <div className="text-xs text-amber-300">Under construction: {STAGE_LABEL[l.stage]} ({Math.round(lotProgress(l) * 100)}%){l.developer ? ` by ${l.developer}` : ''}{l.stopWork ? ` — stopped: ${l.stopWork.reason}` : ''}</div>}
      <div className="text-sm">
        <div className="text-[10px] uppercase tracking-widest text-stone-500">Who runs it</div>
        {mine ? (m ? <div>{m.charId ? <CharLink s={s} id={m.charId} /> : m.name} <span className="text-xs text-stone-500">{SOURCE_LABEL[m.source].toLowerCase()} · skill {m.skill} · {fmt$(m.salary)}/wk</span></div>
          : <div className="text-stone-400">Nobody in charge — the crew and the counter staff.</div>)
          : <div className="text-stone-300">{l.tenant ?? (l.use ? rivalName(l.owner) : 'Nobody: empty ground')}</div>}
        {mine && take > 0 && <div className="text-xs text-stone-500">~{fmt$(take)}/wk now</div>}
      </div>
      {best && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">The crew suggests</div>
          <ul className="text-xs space-y-0.5 mb-1.5">
            {picks.map((p, i) => <li key={i} className={i === 0 ? 'text-emerald-300' : 'text-stone-400'}>{i + 1}. {p.name} — {p.why} · {p.value >= 0 ? '+' : ''}{fmt$(p.value)}/wk expected</li>)}
          </ul>
          {(!m || m.charId !== best.charId || best.source === 'pro') && (
            <ActionCard s={s} action={{ kind: 'econ', op: { type: 'manager', key, source: best.source, charId: best.charId, pro: best.pro } }} />
          )}
        </div>
      )}
      {l.status === 'sale' && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'buyLot', lotId: l.id } }} compact />}
      {l.status === 'sale' && l.tenant && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'buyLot', lotId: l.id, going: true } }} compact />}
      {l.status === 'lease' && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'leaseLot', lotId: l.id } }} compact />}
      {l.status === 'rival' && l.stage && l.stage !== 'open' && l.stage !== 'purchase' && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'slowRival', lotId: l.id } }} compact />}
    </div>
  );
}
