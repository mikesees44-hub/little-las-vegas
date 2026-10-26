import { HOODS_BY_ID, hoodOfZone, type HoodId } from '../../engine/hoodData';
import type { GameState } from '../../engine/types';
import { rivalName } from '../../engine/construction';
import { OWNER_COLOR } from '../map/lotIcons';
import { HOOD_ART } from './art/districtArt';
import { AssetImg } from './AssetImg';
import { DISTRICT_CARD, DISTRICTS } from './districts';
import type { Scene } from './PaintedView';

/** Who holds what in a district, from the records. */
export function districtStats(s: GameState, id: HoodId) {
  const lots = (s.econ?.lots ?? []).filter((l) => hoodOfZone(l.zone as never) === id);
  const open = lots.filter((l) => l.stage === 'open' && l.use);
  const mine = lots.filter((l) => l.owner === 'player').length;
  const byRival: Record<string, number> = {};
  for (const l of lots) if (l.owner !== 'player' && l.owner !== 'private' && l.owner !== 'city') byRival[l.owner] = (byRival[l.owner] ?? 0) + 1;
  const top = Object.entries(byRival).sort((a, b) => b[1] - a[1])[0];
  return { lots: lots.length, open: open.length, mine, forSale: lots.filter((l) => l.status === 'sale').length, top: top ? { id: top[0], n: top[1] } : undefined };
}

/**
 * The six districts as cards: the user's painting, the line about the place,
 * who holds it, and two ways in — down to street level, or the neighborhood's
 * dashboard.
 */
export function DistrictCards({ s, onStreet, onHood, onClose }: { s: GameState; onStreet: (sc: Scene) => void; onHood?: (id: HoodId) => void; onClose?: () => void }) {
  return (
    <div className="space-y-2" data-testid="district-cards">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Wildwood, {s.date.y}</div>
          <div className="font-display text-xl text-gold-400 leading-tight">The six districts</div>
        </div>
        {onClose && <button type="button" className="text-xs text-stone-400 hover:text-gold-300" onClick={onClose}>close ×</button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DISTRICTS.map((d) => {
          const c = DISTRICT_CARD[d.id];
          const st = districtStats(s, d.id);
          return (
            <article key={d.id} className="rounded-lg overflow-hidden border border-[#ff5fa2]/40 bg-noir-900/80" data-testid="district-card" data-hood={d.id}>
              <button type="button" className="relative block w-full text-left" onClick={() => onStreet(d.scene)} data-testid={`district-street-${d.id}`} aria-label={`${c?.title ?? d.id}: down to street level`}>
                <AssetImg k={d.asset} inline={HOOD_ART[d.id]} alt={c?.title ?? HOODS_BY_ID[d.id].name} className="block w-full aspect-[4/3] object-cover"
                  fallback={<div className="w-full aspect-[4/3] bg-gradient-to-b from-[#1b1030] to-[#3a2440]" />} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-8">
                  <div className="font-display text-[13px] text-[#ffd1e6] leading-tight">{c?.title}</div>
                </div>
              </button>
              <div className="px-2 pt-1 text-[10.5px] leading-snug text-stone-400 line-clamp-2" title={c?.line}>{c?.line}</div>
              <div className="px-2 py-1 text-[11px] text-stone-300 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-stone-500">{st.open} open · {st.forSale} for sale</span>
                {st.mine > 0 && <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: OWNER_COLOR.player }} />{st.mine} yours</span>}
                {st.top && <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: OWNER_COLOR[st.top.id] ?? '#999' }} />{rivalName(st.top.id as never)} · {st.top.n}</span>}
              </div>
              <div className="flex gap-1 px-2 pb-2">
                <button type="button" className="hv-btn hv-on flex-1" onClick={() => onStreet(d.scene)}>Street</button>
                {onHood && <button type="button" className="hv-btn flex-1" onClick={() => onHood(d.id)}>Dashboard</button>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
