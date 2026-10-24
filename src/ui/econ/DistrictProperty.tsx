import type { ZoneId } from '../../engine/econState';
import { HQ_INFO } from '../../engine/hq';
import { lotName, lotsIn, ZONES } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { StreetStrip } from './RealEstate';

/** The district panel's slice of the property market: the street, and what is for sale here right now. */
export function DistrictProperty({ s, district }: { s: GameState; district: string }) {
  const z = ZONES.find((x) => x.district === district);
  if (!z || !s.econ) return null;
  const lots = lotsIn(s, z.id as ZoneId);
  const open = lots.filter((l) => l.status === 'sale' || l.status === 'lease').sort((a, b) => a.price - b.price).slice(0, 3);
  return (
    <div data-testid="district-property">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">Property on these streets</div>
      <StreetStrip s={s} lots={lots} />
      {open.length === 0 && <div className="text-xs text-stone-500">Nothing on the market here this month.</div>}
      <div className="grid gap-1.5">
        {open.map((l) => (
          <ActionCard key={l.id} s={s} compact action={{ kind: 'econ', op: l.status === 'lease' ? { type: 'leaseLot', lotId: l.id } : { type: 'buyLot', lotId: l.id } }}
            label={`${lotName(l)} — ${l.status === 'lease' ? `${fmt$(l.rent)}/wk lease` : fmt$(l.price)}`} />
        ))}
      </div>
    </div>
  );
}

/** One line for the Law tab: where business gets done and whether it is swept. */
export function HQLawLine({ s }: { s: GameState }) {
  const hq = s.econ?.hq;
  if (!hq) return null;
  return (
    <div className="rounded border border-noir-700 bg-noir-800/70 p-2 text-xs text-stone-400" data-testid="hq-law">
      <span className="text-stone-200">Headquarters: {HQ_INFO[hq.kind].name.toLowerCase()}.</span>{' '}
      {hq.rumor ? <span className="text-amber-300">⚠ {hq.rumor} </span> : null}
      {hq.found ? `${hq.found} bug${hq.found > 1 ? 's' : ''} found so far. ` : ''}
      {hq.lastSweep ? `Last swept week ${hq.lastSweep}.` : 'Never swept.'} A bug adds to the file of everyone who talks business there.
    </div>
  );
}
