import { useEffect, useMemo, useRef, useState } from 'react';
import { occupantIn, yearsCover, type CityPackage } from '../../engine/cityPackage';
import { townAggregate, type TownLot } from '../../engine/towns';
import type { GameState } from '../../engine/types';
import { ConfBadge, TownLayers, drawables, extentOf, type Drawn } from '../editor/townDraw';
import { firstLook } from '../editor/TownEditor';

/**
 * A town away from home, up close (Cape May first). Until someone of yours
 * has been there it is known only from the papers: the streets, the public
 * landmarks and the names over the doors, but not who holds the paper. A
 * trip there brings its lots into focus (the engine materializes them, once,
 * from the package and the seed), and then this view shows owners, prices
 * and what each place owes.
 */

const OWNER_FILL: Record<string, string> = { player: '#e0b84a', private: '#d8c9a8', city: '#9ec5e8', sale: '#7bd389', rival: '#e06a5a' };
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const SEASON = (m: number) => (m >= 6 && m <= 8 ? 'high summer' : m === 5 || m === 9 ? 'the shoulder season' : 'the off season');

export function TownView({ s, pkg, onClose }: { s: GameState; pkg: CityPackage; onClose: () => void }) {
  const town = s.towns?.[pkg.townId];
  const year = s.date.y;
  const agg = townAggregate(pkg, s.seed, s.week, s.date.m);
  const items = useMemo(() => drawables(pkg, year), [pkg, year]);
  const [sel, setSel] = useState<string | undefined>();
  const svg = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState(() => extentOf(pkg, firstLook(pkg)));
  const [px, setPx] = useState(800);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(el.clientWidth || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const lotFill = (d: Drawn) => {
    if (d.kind !== 'parcel') return undefined;
    const l = town?.lots[d.id];
    if (!l) return undefined;
    return l.owner === 'player' ? OWNER_FILL.player : l.status === 'sale' ? OWNER_FILL.sale : l.status === 'public' ? OWNER_FILL.city : l.status === 'rival' ? OWNER_FILL.rival : OWNER_FILL.private;
  };
  const drag = useRef<{ sx: number; sy: number; vb: typeof vb; id?: string; moved: boolean } | undefined>();
  const down = (e: React.PointerEvent, d?: Drawn) => {
    if ((e.target as Element).closest('[data-tv-ui]')) return;
    e.stopPropagation();
    drag.current = { sx: e.clientX, sy: e.clientY, vb, id: d?.id, moved: false };
    const mv = (ev: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      if (!g.moved && Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy) < 6) return;
      g.moved = true;
      const k = g.vb.w / Math.max(1, svg.current?.clientWidth ?? 1);
      setVb({ ...g.vb, x: g.vb.x - (ev.clientX - g.sx) * k, y: g.vb.y - (ev.clientY - g.sy) * k });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      const g = drag.current;
      drag.current = undefined;
      if (g && !g.moved) setSel(g.id);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const zoom = (k: number) => setVb((b) => { const w = Math.min(12000, Math.max(80, b.w * k)); const h = b.h * (w / b.w); return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }; });

  const selItem = items.find((d) => d.id === sel);
  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-[#16365a]" data-testid="town-view" data-town={pkg.townId} data-focus={town ? '1' : '0'}>
      <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full select-none" style={{ touchAction: 'none' }} onPointerDown={(e) => down(e)}>
        <TownLayers pkg={pkg} year={year} sel={sel} items={items.filter((d) => d.kind !== 'placement')} scale={vb.w / Math.max(1, px)} fill={lotFill} onDown={(e, d) => down(e, d)} />
      </svg>
      <div className="absolute left-2 top-11 right-2 z-10 space-y-1.5" data-tv-ui>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="hv-btn" onClick={onClose} data-testid="tv-close">← South Jersey</button>
          <span className="font-display text-lg text-gold-300 drop-shadow">{pkg.displayName}, {year}</span>
          <button type="button" className="hv-btn" onClick={() => zoom(1 / 1.4)} aria-label="Zoom in">+</button>
          <button type="button" className="hv-btn" onClick={() => zoom(1.4)} aria-label="Zoom out">−</button>
        </div>
        <div className="max-w-[560px] rounded bg-noir-900/90 border border-gold-600/40 px-2 py-1 text-[11px] text-stone-300" data-testid="tv-status">
          {town
            ? <>In focus since week {town.since} · {town.visits} visit{town.visits === 1 ? '' : 's'}. Gold is yours, green for sale, blue public.</>
            : <>Known from the papers. Who holds each place and what it owes come into focus when someone of yours goes there (plan a trip: Cape May&apos;s hotels and things to do are on the trip planner).</>}
          <div className="text-stone-400">This week: {SEASON(s.date.m)}, about {money(agg.weekly)} through the town&apos;s tills.</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {pkg.districts.map((d) => <button key={d.id} type="button" className="hv-btn !py-0" onClick={() => setVb(extentOf(pkg, new Set([d.id])))} data-testid="tv-goto">{d.name}</button>)}
        </div>
      </div>
      {selItem && (
        <div className="absolute z-20 inset-x-0 bottom-24 max-h-[50%] overflow-y-auto panel p-3 md:inset-x-auto md:right-2 md:top-40 md:bottom-auto md:w-[340px] md:max-h-[calc(100%-9rem)] md:rounded-b-lg text-xs space-y-1.5" data-tv-ui data-testid="tv-card">
          <PlaceCard pkg={pkg} d={selItem} year={year} lot={town?.lots[selItem.id]} known={!!town} onClose={() => setSel(undefined)} />
        </div>
      )}
      {town && town.log.length > 0 && !selItem && (
        <div className="absolute z-10 right-2 bottom-24 md:bottom-2 w-[min(320px,calc(100%-1rem))] rounded bg-noir-900/90 border border-noir-700 p-2 text-[11px] text-stone-300 space-y-0.5" data-tv-ui data-testid="tv-log">
          {town.log.slice(-4).reverse().map((l, i) => <div key={i}><span className="text-stone-500">{l.y}</span> {l.text}</div>)}
        </div>
      )}
    </div>
  );
}

function PlaceCard({ pkg, d, year, lot, known, onClose }: { pkg: CityPackage; d: Drawn; year: number; lot?: TownLot; known: boolean; onClose: () => void }) {
  const pc = d.kind === 'parcel' ? pkg.parcels.find((x) => x.id === d.id) : undefined;
  const occ = pc ? occupantIn(pkg, pc.id, year) : undefined;
  const lm = d.kind === 'landmark' ? pkg.landmarks.find((x) => x.id === d.id) : undefined;
  const inst = d.kind === 'institution' ? pkg.institutions.find((x) => x.id === d.id) : undefined;
  const rec = occ ?? lm ?? inst ?? pc;
  const later = pc ? pkg.businesses.filter((b) => b.parcelId === pc.id && b.id !== occ?.id) : [];
  const yrs = (y?: { from?: number; to?: number; approx?: boolean }) => (y && (y.from || y.to) ? `${y.from ?? '?'}–${y.to ?? ''}${y.approx ? ' (approx.)' : ''}` : 'years not known');
  const ownerName = (o: string) => (o === 'player' ? 'Your family' : o === 'private' ? 'An independent owner' : o === 'city' ? 'The city' : o);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{pc?.address ?? lm?.kind ?? inst?.kind}</div>
          <div className="font-display text-lg leading-tight text-[#ffd1e6]">{d.label}</div>
          <div className="text-stone-400">{occ ? yrs(occ.years) : lm ? yrs(lm.years) : inst ? yrs(inst.years) : 'Nothing open there this year'}</div>
        </div>
        <button type="button" onClick={onClose} className="text-stone-400 hover:text-gold-300 shrink-0">close ×</button>
      </div>
      {(lm?.blurb || inst?.blurb) && <p className="text-stone-300 italic">{lm?.blurb ?? inst?.blurb}</p>}
      {(lm || inst) && <div className="text-stone-300">A public {lm ? 'landmark' : 'institution'}: it is never for sale.</div>}
      {rec && <div className="flex items-start gap-1.5"><ConfBadge c={rec.evidence.confidence} /><span className="text-stone-400 leading-snug">{rec.evidence.source}</span></div>}
      {occ?.namePolicy === 'near-miss' && <div className="text-stone-500">A near-miss name: its real namesake is still in business.</div>}
      {pc && (lot
        ? <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-testid="tv-lot">
            <div className="text-stone-500">Held by</div><div className="text-stone-200">{ownerName(lot.owner)}{lot.status === 'sale' ? ' (for sale)' : ''}</div>
            {lot.price > 0 && <><div className="text-stone-500">Worth</div><div className="text-stone-200">{money(lot.price)}</div></>}
            <div className="text-stone-500">Owes</div><div className="text-stone-200">{lot.debt ? `${money(lot.debt)} to a bank on Washington Street` : 'Nothing anybody knows of'}</div>
            <div className="text-stone-500">History</div><div className="text-stone-300">{lot.history.map((h) => `${h.year}: ${h.how}${h.by ? ` (${h.by})` : ''}`).join('; ')}</div>
          </div>
        : <div className="text-stone-500" data-testid="tv-unknown">{known ? 'Not on the books.' : 'Who holds it and what it owes: unknown until someone of yours goes there.'}</div>)}
      {later.length > 0 && <div className="text-stone-500">Over the years: {later.map((b) => `${b.name} (${yrs(b.years)})`).join(', ')}.</div>}
      {pc && !yearsCover(pc.structure?.years, year) && <div className="text-stone-500">The building is not standing this year.</div>}
    </>
  );
}
