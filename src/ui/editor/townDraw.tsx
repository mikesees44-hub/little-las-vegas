import { frameFns, occupantIn, profileAt, yearsCover, type CityPackage, type Confidence, type UV } from '../../engine/cityPackage';
import { seedSlotRect } from '../../engine/hoodGeo';

/**
 * A town package drawn to scale in its own street frame (x = u along the
 * shore, y = -v so inland is up): districts, streets (only those standing in
 * the year), parcels with what occupies them that year, landmarks,
 * institutions and the location layer's placements. Shared by the town
 * editor and the town view. Dashed outlines are approximate, dotted are
 * invented, solid are verified.
 */

export interface Drawn { id: string; kind: 'parcel' | 'landmark' | 'institution' | 'placement' | 'district'; u: number; v: number; w: number; d: number; rot: number; label: string; conf: Confidence; dim: boolean; movable: boolean }

export const CONF_DASH: Record<Confidence, string | undefined> = { verified: undefined, approximate: '4 2', invented: '1 2' };
export const CONF_COLOR: Record<Confidence, string> = { verified: '#4ade80', approximate: '#f59e0b', invented: '#c084fc' };

/** Every drawable record of a package, placed in the local frame, for a year. */
export function drawables(pkg: CityPackage, year: number): Drawn[] {
  const fr = pkg.geography.frame ? frameFns(pkg.geography.frame) : undefined;
  const toUV = (r: { pos?: UV; geo?: [number, number] }): UV | undefined => {
    if (r.pos) return r.pos;
    if (r.geo && fr) { const [u, v] = fr.toUv(r.geo); return { u, v }; }
    return undefined;
  };
  const out: Drawn[] = [];
  for (const p of pkg.parcels) {
    let at = toUV(p);
    let w = p.footprint?.w ?? 16;
    let d = p.footprint?.d ?? 22;
    let movable = true;
    if (!at && p.slot) {
      const r = pkg.townId === 'wildwood' ? seedSlotRect(p.id) : undefined;
      if (!r) continue;
      at = { u: (r.u0 + r.u1) / 2, v: (r.v0 + r.v1) / 2 };
      w = r.u1 - r.u0; d = r.v1 - r.v0;
      movable = false;
    }
    if (!at) continue;
    const occ = occupantIn(pkg, p.id, year);
    const built = p.structure?.built;
    out.push({ id: p.id, kind: 'parcel', u: at.u, v: at.v, w, d, rot: p.rotation ?? 0, label: occ?.name ?? (p.market?.status === 'sale' ? 'For sale' : p.market?.status === 'public' ? 'Public' : 'Vacant'), conf: occ?.evidence.confidence ?? p.evidence.confidence, dim: !occ || (built !== undefined && built > year), movable });
  }
  for (const l of pkg.landmarks) {
    const at = toUV(l);
    if (!at) continue;
    const pier = l.kind === 'pier' && l.size;
    out.push({ id: l.id, kind: 'landmark', u: at.u, v: pier ? at.v - l.size!.d / 2 : at.v, w: pier ? l.size!.w : 14, d: pier ? l.size!.d : 14, rot: 0, label: l.name, conf: l.evidence.confidence, dim: !yearsCover(l.years, year), movable: !!l.pos || !!l.geo });
  }
  for (const x of pkg.institutions) {
    let at = toUV(x);
    if (!at && x.parcelId) { const pc = pkg.parcels.find((p) => p.id === x.parcelId); if (pc) at = toUV(pc); }
    if (!at && x.placementId) { const pl = pkg.placements.find((p) => p.id === x.placementId); if (pl) at = toUV(pl); }
    if (!at) continue;
    out.push({ id: x.id, kind: 'institution', u: at.u, v: at.v, w: 10, d: 10, rot: 0, label: x.name, conf: x.evidence.confidence, dim: !yearsCover(x.years, year), movable: !!x.pos });
  }
  // The location layer: the occupant standing in the year, one per building.
  const best = new Map<string, (typeof pkg.placements)[number]>();
  for (const f of pkg.placements) {
    if (!yearsCover(f.years, year)) continue;
    const cur = best.get(f.building);
    if (!cur || (f.years.from ?? 0) > (cur.years.from ?? 0)) best.set(f.building, f);
  }
  for (const f of best.values()) {
    const at = toUV(f);
    if (!at) continue;
    out.push({ id: f.id, kind: 'placement', u: at.u, v: at.v, w: f.footprint.w, d: f.footprint.d, rot: f.rotation, label: f.name, conf: f.evidence.confidence, dim: false, movable: true });
  }
  return out;
}

/** The extent worth looking at: the districts and records, padded. */
export function extentOf(pkg: CityPackage, ids?: Set<string>): { x: number; y: number; w: number; h: number } {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  const add = (u: number, v: number) => { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); };
  for (const d of pkg.districts) if (!ids || ids.has(d.id)) for (const [u, v] of d.polygon) add(u, v);
  if (!Number.isFinite(u0)) {
    const b = pkg.geography.bounds ?? { u0: -500, u1: 500, v0: -300, v1: 500 };
    add(b.u0, b.v0); add(b.u1, b.v1);
  }
  const pad = Math.max(40, (u1 - u0) * 0.06);
  return { x: u0 - pad, y: -v1 - pad, w: u1 - u0 + 2 * pad, h: v1 - v0 + 2 * pad };
}

const FILL: Record<Drawn['kind'], string> = { parcel: '#d8c9a8', landmark: '#f2d36b', institution: '#9ec5e8', placement: '#ff9fc8', district: '#000' };

/** The ground and the records as SVG. `fill` can color a parcel (an owner); `onDown` makes records grabbable. */
export function TownLayers({ pkg, year, sel, items, fill, onDown, scale }: {
  pkg: CityPackage; year: number; sel?: string; items: Drawn[]; scale: number;
  fill?: (d: Drawn) => string | undefined;
  onDown?: (e: React.PointerEvent, d: Drawn) => void;
}) {
  const b = pkg.geography.bounds ?? { u0: -600, u1: 600, v0: -300, v1: 600 };
  const fs = Math.max(4, scale * 11);
  const sw = Math.max(0.6, scale * 1.4);
  const crosses = pkg.streets.filter((s) => s.kind === 'cross' && s.u !== undefined);
  const aves = pkg.streets.filter((s) => s.kind === 'avenue' && s.v !== undefined);
  const paths = pkg.streets.filter((s) => (s.kind === 'path' || s.kind === 'road') && s.path && yearsCover(s.years, year));
  const vMax = Math.max(...aves.map((a) => a.v!), 120) + 60;
  return (
    <g data-testid="town-layers">
      <rect x={b.u0 - 2000} y={-b.v1 - 2000} width={b.u1 - b.u0 + 4000} height={b.v1 - b.v0 + 4000} fill="#ddd5c0" />
      {/* The sea (v < 0). */}
      <rect x={b.u0 - 2000} y={0} width={b.u1 - b.u0 + 4000} height={2400} fill="#2c6f8f" />
      {pkg.geography.profiles?.beach && (() => {
        // The sand, out to the waterline (the beach profile along u).
        const pr = pkg.geography.profiles.beach;
        const xs = Array.from({ length: 41 }, (_, i) => b.u0 + ((b.u1 - b.u0) * i) / 40);
        return <path d={`M${b.u0 - 2000} 0H${b.u1 + 2000}V${profileAt(pr, b.u1)}${xs.reverse().map((u) => `L${u} ${profileAt(pr, u)}`).join('')}L${b.u0 - 2000} ${profileAt(pr, b.u0)}Z`} fill="#ecd9a6" pointerEvents="none" />;
      })()}
      {pkg.districts.map((d) => d.polygon.length >= 3 && (
        <g key={d.id} data-testid="town-district" data-id={d.id} onPointerDown={onDown ? (e) => onDown(e, { id: d.id, kind: 'district', u: d.polygon[0][0], v: d.polygon[0][1], w: 0, d: 0, rot: 0, label: d.name, conf: d.evidence?.confidence ?? 'approximate', dim: false, movable: false }) : undefined}>
          <path d={`M${d.polygon.map(([u, v]) => `${u} ${-v}`).join('L')}Z`} fill={sel === d.id ? '#ffe28a' : '#8a7a5a'} fillOpacity={sel === d.id ? 0.25 : 0.12} stroke={sel === d.id ? '#ffe28a' : '#6b5a3a'} strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 2}`} />
          <text x={d.polygon.reduce((a, p) => a + p[0], 0) / d.polygon.length} y={-Math.max(...d.polygon.map((p) => p[1])) + fs * 1.3} fontSize={fs * 1.1} fontWeight="800" textAnchor="middle" fill="#4a3a22" opacity="0.8" style={{ fontFamily: 'Georgia, serif' }} pointerEvents="none">{d.name}</text>
        </g>
      ))}
      {aves.map((a) => {
        const from = typeof a.from === 'number' ? a.from : b.u0;
        const to = typeof a.to === 'number' ? a.to : b.u1;
        return (
          <g key={a.id} pointerEvents="none">
            <path d={`M${from} ${-a.v!}H${to}`} stroke="#5a5a60" strokeWidth={Math.max(6, sw * 4)} />
            <text x={from + fs} y={-a.v! - fs * 0.4} fontSize={fs} fill="#2a2a30" fontWeight="700">{a.name}</text>
          </g>
        );
      })}
      {crosses.map((c) => (
        <g key={c.id} pointerEvents="none">
          <path d={`M${c.u} ${0}V${-vMax}`} stroke="#5a5a60" strokeWidth={Math.max(5, sw * 3)} />
          <text x={c.u! + fs * 0.3} y={-vMax + fs} fontSize={fs * 0.85} fill="#2a2a30" fontWeight="700" transform={`rotate(-90 ${c.u! + fs * 0.3} ${-vMax + fs})`} textAnchor="end">{c.name}</text>
        </g>
      ))}
      {paths.map((p) => (
        <g key={p.id} pointerEvents="none" data-testid="town-path" data-id={p.id}>
          <path d={`M${p.path!.map(([u, v]) => `${u} ${-v}`).join('L')}`} fill="none" stroke={p.kind === 'path' ? '#b98b5e' : '#6a6a70'} strokeWidth={p.width ?? Math.max(5, sw * 3)} strokeLinecap="round" />
          <text x={p.path![0][0]} y={-p.path![0][1] - (p.width ?? 6)} fontSize={fs * 0.85} fill="#3a2414" fontWeight="700">{p.name}</text>
        </g>
      ))}
      {items.map((d) => {
        const on = sel === d.id;
        const color = fill?.(d) ?? FILL[d.kind];
        const round = d.kind === 'landmark' || d.kind === 'institution';
        return (
          <g key={`${d.kind}:${d.id}`} data-testid={`town-${d.kind}`} data-id={d.id} data-conf={d.conf} opacity={d.dim ? 0.45 : 1}
            style={{ cursor: onDown ? (d.movable ? 'move' : 'pointer') : 'default' }} onPointerDown={onDown ? (e) => onDown(e, d) : undefined}>
            <g transform={`translate(${d.u} ${-d.v}) rotate(${d.rot})`}>
              {round
                ? <circle r={Math.max(d.w / 2, fs * 0.7)} fill={color} stroke={on ? '#ffe28a' : CONF_COLOR[d.conf]} strokeWidth={on ? sw * 2.2 : sw * 1.3} strokeDasharray={CONF_DASH[d.conf]?.split(' ').map((x) => Number(x) * sw).join(' ')} />
                : <rect x={-d.w / 2} y={-d.d / 2} width={d.w} height={d.d} rx="1.5" fill={color} fillOpacity={d.kind === 'placement' ? 0.75 : 0.9} stroke={on ? '#ffe28a' : CONF_COLOR[d.conf]} strokeWidth={on ? sw * 2.2 : sw * 1.2} strokeDasharray={CONF_DASH[d.conf]?.split(' ').map((x) => Number(x) * sw).join(' ')} />}
            </g>
            {(on || scale < 0.9) && <text x={d.u} y={-d.v - Math.max(d.d / 2, fs * 0.8) - fs * 0.3} fontSize={fs * 0.9} textAnchor="middle" fill="#1b1030" fontWeight="700" pointerEvents="none" style={{ paintOrder: 'stroke', stroke: '#fffaf0', strokeWidth: fs * 0.25 }}>{d.label.length > 28 ? `${d.label.slice(0, 27)}…` : d.label}</text>}
          </g>
        );
      })}
    </g>
  );
}

/** The VERIFIED / APPROXIMATE / INVENTED badge. */
export function ConfBadge({ c }: { c: Confidence }) {
  const cls = c === 'verified' ? 'bg-emerald-700/60 text-emerald-100' : c === 'approximate' ? 'bg-amber-700/50 text-amber-100' : 'bg-purple-700/50 text-purple-100';
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`} data-testid="conf-badge" data-conf={c}>{c.toUpperCase()}</span>;
}
