import { useEffect, useMemo, useRef, useState } from 'react';
import { AVENUES, CROSS, OUTLINES, U_NORTH, U_SOUTH, aveV, bayEdge, beachWidth, townAt } from '../../engine/hoodData';
import {
  assignImportedOccupant, boxOf, centerOf, drawClass, editorOverride, insideFlat, layerForYear, unflat, walkToEntrance,
  type HistOverride, type HistOverridesFile, type ImportedLayer, type ShowMode, type ViewBuilding, type ViewBusiness,
} from '../../engine/importedCity';
import type { GameState } from '../../engine/types';
import { getGeo } from '../map/geoData';
import { useShell } from '../shell/context';
import { ASSET_URLS } from './art/assetUrls';

/**
 * Imported blocks (beta): real geometry from the city importer (OSM streets
 * and building outlines, NJ parcels; scripts/cityimport) drawn in the game's
 * island frame — the same metres and the same building ids at every zoom:
 * the island → the imported area → a block → a building → its entrance (with
 * the walk to it on the street graph). Buildings are styled by what is known
 * for the game year: verified, provisional (assessor year built only), an
 * open research task (unknown), or a ghost (built later). Generated outlines
 * (no survey, inferred from a parcel) are hatched. The map editor moves a
 * building or business, marks it verified and assigns an asset; corrections
 * stay in this browser and export as historical-overrides.json.
 *
 * A fictional occupant set on a building is game state (saved with the game).
 */

const LAYER_FILE = 'imported-wildwood-test-blocks.json';
const r1 = (x: number) => Math.round(x * 10) / 10;
type Level = 'island' | 'area' | 'block' | 'building' | 'entrance';
interface VB { x: number; y: number; w: number; h: number }
const vbOf = (u0: number, v0: number, u1: number, v1: number, pad = 0.12): VB => {
  const w = (u1 - u0) * (1 + 2 * pad), h = (v1 - v0) * (1 + 2 * pad);
  return { x: u0 - (u1 - u0) * pad, y: -v1 - (v1 - v0) * pad, w: Math.max(w, 30), h: Math.max(h, 30) };
};
const poly = (pts: number[]) => unflat(pts).map(([u, v]) => `${u},${-v}`).join(' ');

const OV_KEY = (pack: string) => `llv-imported-overrides:${pack}`;
function loadOverrides(pack: string): HistOverride[] {
  try { const raw = localStorage.getItem(OV_KEY(pack)); return raw ? (JSON.parse(raw) as HistOverride[]) : []; } catch { return []; }
}
function saveOverrides(pack: string, list: HistOverride[]): boolean {
  try { localStorage.setItem(OV_KEY(pack), JSON.stringify(list)); return true; } catch { return false; }
}

const FILL: Record<string, string> = { verified: '#7fd19b', provisional: '#e8c98f', task: '#c9c3b6', ghost: 'none' };
const KIND_LABEL: Record<string, string> = { verified: 'Verified for the year', provisional: 'Provisional: the assessor\'s year built only', task: 'Unresolved: no period evidence yet', ghost: 'Did not stand in the year (built later)', hidden: 'Hidden' };

export function ImportedView({ s, onClose }: { s: GameState; onClose: () => void }) {
  const shell = useShell();
  const [layer, setLayer] = useState<ImportedLayer | undefined>();
  const [err, setErr] = useState<string | undefined>();
  useEffect(() => { getGeo<ImportedLayer>(LAYER_FILE).then(setLayer, (e: unknown) => setErr(String(e))); }, []);
  if (err) return <div className="absolute inset-0 grid place-items-center bg-noir-950 text-sm text-stone-300" data-testid="imported-view">The imported blocks could not be loaded ({err}). <button type="button" className="ml-2 underline" onClick={onClose}>Back</button></div>;
  if (!layer) return <div className="absolute inset-0 grid place-items-center bg-noir-950 text-sm text-stone-400" data-testid="imported-view">Loading the imported blocks…</div>;
  return <ImportedMap s={s} layer={layer} onClose={onClose} update={shell.act ?? shell.update} />;
}

function ImportedMap({ s, layer, onClose, update }: { s: GameState; layer: ImportedLayer; onClose: () => void; update?: (f: (s: GameState) => GameState, what?: string) => void }) {
  const year = s.date.y;
  const [mode, setMode] = useState<ShowMode>('eligible');
  const [showGame, setShowGame] = useState(true);
  const [showParcels, setShowParcels] = useState(true);
  const [showNav, setShowNav] = useState(false);
  const [edit, setEdit] = useState(false);
  const [overrides, setOverrides] = useState<HistOverride[]>(() => loadOverrides(layer.packId));
  const [level, setLevel] = useState<Level>('area');
  const [blockId, setBlockId] = useState<string | undefined>();
  const [sel, setSel] = useState<{ kind: 'building' | 'business'; id: string } | undefined>();
  const [entrance, setEntrance] = useState<string | undefined>();
  const [tasks, setTasks] = useState(false);
  const [exportText, setExportText] = useState<string | undefined>();
  const B = layer.bounds;
  const [vb, setVb] = useState<VB>(() => vbOf(B.u0, B.v0, B.u1, B.v1));
  const svg = useRef<SVGSVGElement>(null);

  const view = useMemo(() => layerForYear(layer, overrides, year, { showUnverified: mode === 'all' }), [layer, overrides, year, mode]);
  const bById = useMemo(() => new Map(view.buildings.map((b) => [b.id, b])), [view]);
  const selB = sel?.kind === 'building' ? bById.get(sel.id) : undefined;
  const selBiz = sel?.kind === 'business' ? view.businesses.find((b) => b.id === sel.id) : undefined;
  const block = blockId ? layer.blocks.find((b) => b.id === blockId) : undefined;
  const taskList = useMemo(() => view.buildings.filter((b) => drawClass(b, mode) === 'task'), [view, mode]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { verified: 0, provisional: 0, task: 0, ghost: 0, hidden: 0 };
    for (const b of view.buildings) c[drawClass(b, mode)]++;
    return c;
  }, [view, mode]);
  const ent = selB?.entrances.find((e) => e.id === entrance);
  const walk = useMemo(() => {
    if (!ent || !selB) return undefined;
    const from = block ? (() => { const [u0, v0] = boxOf(block.pts); return [u0, v0] as [number, number]; })() : [B.u0, B.v0] as [number, number];
    return walkToEntrance(layer, ent.node, from);
  }, [ent, selB, block, layer, B]);

  const zoomTo = (u0: number, v0: number, u1: number, v1: number, pad = 0.15) => setVb(vbOf(u0, v0, u1, v1, pad));
  const goIsland = () => { setLevel('island'); setSel(undefined); setBlockId(undefined); setEntrance(undefined); zoomTo(U_SOUTH, -600, U_NORTH, 1700, 0.02); };
  const goArea = () => { setLevel('area'); setSel(undefined); setBlockId(undefined); setEntrance(undefined); zoomTo(B.u0, B.v0, B.u1, B.v1); };
  const goBlock = (id: string) => { const b = layer.blocks.find((x) => x.id === id); if (!b) return; setBlockId(id); setLevel('block'); setEntrance(undefined); const [u0, v0, u1, v1] = boxOf(b.pts); zoomTo(u0, v0, u1, v1, 0.2); };
  const pickBuilding = (b: ViewBuilding) => {
    setSel({ kind: 'building', id: b.id });
    setEntrance(undefined);
    setLevel('building');
    const [cu, cv] = centerOf(b.pts);
    if (!blockId || !layer.blocks.find((x) => x.id === blockId && insideFlat(cu, cv, x.pts))) setBlockId(layer.blocks.find((x) => insideFlat(cu, cv, x.pts))?.id);
    const [u0, v0, u1, v1] = boxOf(b.pts);
    const m = Math.max(u1 - u0, v1 - v0, 30);
    zoomTo(cu - m, cv - m, cu + m, cv + m, 0.1);
  };
  const goEntrance = (id: string) => { const e = selB?.entrances.find((x) => x.id === id); if (!e) return; setEntrance(id); setLevel('entrance'); zoomTo(e.u - 18, e.v - 18, e.u + 18, e.v + 18, 0.05); };

  // Pan (drag) and zoom (wheel, buttons); drag in edit mode moves the selected building or business.
  const toSvg = (cx: number, cy: number): [number, number] => {
    const el = svg.current; const m = el?.getScreenCTM();
    if (!el || !m) return [0, 0];
    const pt = el.createSVGPoint(); pt.x = cx; pt.y = cy;
    const r = pt.matrixTransform(m.inverse());
    return [r.x, r.y];
  };
  const drag = useRef<{ sx: number; sy: number; vb: VB; moved: boolean; move?: { kind: 'building' | 'business'; id: string; u: number; v: number } } | undefined>();
  const [ghostAt, setGhostAt] = useState<{ u: number; v: number } | undefined>();
  const addOverride = (o: HistOverride) => setOverrides((all) => { const next = [...all, o]; saveOverrides(layer.packId, next); return next; });
  const onDown = (e: React.PointerEvent, target?: { kind: 'building' | 'business'; id: string; u: number; v: number }) => {
    if ((e.target as Element).closest('[data-iv-ui]')) return;
    e.stopPropagation();
    drag.current = { sx: e.clientX, sy: e.clientY, vb, moved: false, move: edit && target && sel?.id === target.id ? target : undefined };
    const mv = (ev: PointerEvent) => {
      const d = drag.current; if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 6) return;
      d.moved = true;
      if (d.move) { const [x0, y0] = toSvg(d.sx, d.sy); const [x1, y1] = toSvg(ev.clientX, ev.clientY); setGhostAt({ u: d.move.u + (x1 - x0), v: d.move.v - (y1 - y0) }); return; }
      const k = d.vb.w / Math.max(1, svg.current?.clientWidth ?? 1);
      setVb({ ...d.vb, x: d.vb.x - (ev.clientX - d.sx) * k, y: d.vb.y - (ev.clientY - d.sy) * k });
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      drag.current = undefined;
      if (d?.move && d.moved) {
        const [x0, y0] = toSvg(d.sx, d.sy); const [x1, y1] = toSvg(ev.clientX, ev.clientY);
        const at = { u: r1(d.move.u + (x1 - x0)), v: r1(d.move.v - (y1 - y0)) };
        addOverride(editorOverride({ layer: d.move.kind === 'building' ? 'buildings' : 'businesses', id: d.move.id }, 'move', { at }, 'moved in the map editor', new Date().toISOString()));
        setGhostAt(undefined);
      }
      if (d && !d.moved && target) {
        if (target.kind === 'building') { const b = bById.get(target.id); if (b) pickBuilding(b); } else { setSel({ kind: 'business', id: target.id }); setEntrance(undefined); }
      }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const zoom = (k: number, cx?: number, cy?: number) => setVb((b) => {
    const w = Math.min(9000, Math.max(20, b.w * k)); const h = b.h * (w / b.w);
    const [px, py] = cx !== undefined && cy !== undefined ? toSvg(cx, cy) : [b.x + b.w / 2, b.y + b.h / 2];
    return { x: px - (px - b.x) * (w / b.w), y: py - (py - b.y) * (w / b.w), w, h };
  });
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const px = (svg.current?.clientWidth ?? 1000) / vb.w; // screen px per metre
  const hs = 1 / Math.max(px, 0.05); // one screen px in metres
  const exportFile = (): string => JSON.stringify({ schemaVersion: 1, packId: layer.packId, targetYear: layer.targetYear, overrides } satisfies HistOverridesFile, null, 2);
  const download = () => {
    const text = exportFile();
    setExportText(text);
    void (async () => {
      // Inside claude.ai the page may only hand the viewer a file through the downloads capability.
      try {
        const cl = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
        const dl = (await cl?.use?.('downloads')) as { save?: (r: { filename: string; data: string }) => Promise<unknown> } | null | undefined;
        if (dl?.save) { await dl.save({ filename: 'historical-overrides.json', data: text }); return; }
      } catch { return; /* declined or unavailable: the text box below has it */ }
      // Outside claude.ai (a plain web host): an ordinary download link.
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = 'historical-overrides.json';
        document.body.appendChild(a); a.click(); a.remove();
      } catch { /* the text box below has it */ }
    })();
  };
  const gameCross = CROSS.filter((c) => !c.hidden && c.u > vb.x - 50 && c.u < vb.x + vb.w + 50);
  const occupant = selB ? s.importedOccupants?.[selB.id] : undefined;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#16365a]" data-testid="imported-view" data-level={level} data-mode={mode} data-edit={edit ? '1' : '0'}>
      <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full select-none" style={{ touchAction: 'none' }} onPointerDown={(e) => onDown(e)}>
        <defs>
          <pattern id="iv-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="#d9d2bf" /><line x1="0" y1="0" x2="0" y2="3" stroke="#8d8576" strokeWidth="1.1" /></pattern>
        </defs>
        {/* The island (the game's frame): land between the beach and the bay. */}
        <path d={OUTLINES.land?.length ? [...OUTLINES.land, ...(OUTLINES.westww ?? [])].map((r) => `M${r.map(([u, v]) => `${u} ${-v}`).join('L')}Z`).join('') : `M${U_SOUTH} ${-bayEdge(U_SOUTH)}${Array.from({ length: 80 }, (_, i) => { const u = U_SOUTH + ((U_NORTH - U_SOUTH) * i) / 79; return `L${u} ${-bayEdge(u)}`; }).join('')}${Array.from({ length: 80 }, (_, i) => { const u = U_NORTH - ((U_NORTH - U_SOUTH) * i) / 79; return `L${u} ${beachWidth(u)}`; }).join('')}Z`} fill="#d9d2bf" fillRule="evenodd" data-testid="iv-island" />
        {showGame && <g data-testid="iv-game-streets" pointerEvents="none">
          {gameCross.map((c) => <line key={c.n} x1={c.u} y1={-(c.vRange?.[0] ?? 0)} x2={c.u} y2={-(c.vRange?.[1] ?? bayEdge(c.u))} stroke="#c0392b" strokeOpacity="0.45" strokeWidth={Math.max(1.5 * hs, 0.6)} strokeDasharray={`${6 * hs} ${4 * hs}`} />)}
          {AVENUES.map((a) => <polyline key={a.id} points={(a.path ?? [[a.from ?? U_SOUTH, a.v], [a.to ?? U_NORTH, a.v]]).map(([u, v]) => `${u},${-v}`).join(' ')} fill="none" stroke="#c0392b" strokeOpacity="0.45" strokeWidth={Math.max(1.5 * hs, 0.6)} strokeDasharray={`${6 * hs} ${4 * hs}`} />)}
          {level !== 'island' && gameCross.map((c) => <text key={`t${c.n}`} x={c.u + 2 * hs} y={-B.v0 + 14 * hs} fontSize={10 * hs} fill="#ffb3a7">{c.n} (game)</text>)}
          {level !== 'island' && AVENUES.map((a) => <text key={`t${a.id}`} x={Math.max(vb.x, U_SOUTH) + 4 * hs} y={-aveV(a.id, Math.max(vb.x, U_SOUTH)) - 3 * hs} fontSize={10 * hs} fill="#ffb3a7">{a.names[townAt(vb.x + vb.w / 2)] ?? a.names.wildwood} (game)</text>)}
        </g>}
        {/* The imported area's box: click it from the island. */}
        <rect x={B.u0} y={-B.v1} width={B.u1 - B.u0} height={B.v1 - B.v0} fill={level === 'island' ? '#ff5fa2' : 'none'} fillOpacity="0.25" stroke="#ff5fa2" strokeWidth={Math.max(2 * hs, 0.5)} data-testid="iv-area" style={{ cursor: level === 'island' ? 'pointer' : undefined }}
          onPointerDown={(e) => { if (level === 'island') { e.stopPropagation(); goArea(); } }} />
        {level !== 'island' && <g>
          {/* The imported area is land (the game's own island outline is narrower here). */}
          <rect x={B.u0} y={-B.v1} width={B.u1 - B.u0} height={B.v1 - B.v0} fill="#d9d2bf" pointerEvents="none" />
          {/* Blocks from the street network. */}
          {layer.blocks.map((b) => <polygon key={b.id} points={poly(b.pts)} fill={b.id === blockId ? '#fff3c4' : '#e6dfcc'} fillOpacity={b.id === blockId ? 0.7 : 0.35} stroke="#b9ae93" strokeWidth={hs} data-testid="iv-block" data-id={b.id}
            onPointerDown={(e) => { if (!edit && level === 'area') { e.stopPropagation(); goBlock(b.id); } }} style={{ cursor: level === 'area' ? 'pointer' : undefined }} />)}
          {showParcels && <g pointerEvents="none">{layer.parcels.map((p) => <polygon key={p.id} points={poly(p.pts)} fill="none" stroke="#9c927d" strokeOpacity="0.6" strokeWidth={0.6 * hs} />)}</g>}
          {/* Streets (OSM centrelines) drawn at a street width. */}
          <g pointerEvents="none">
            {layer.roads.map((r) => <polyline key={r.id} points={poly(r.pts)} fill="none" stroke={r.cls === 'street' ? '#4a4a50' : r.cls === 'service' ? '#77746c' : '#a68d6a'} strokeWidth={r.cls === 'street' ? 9 : r.cls === 'service' ? 4 : 1.6} strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />)}
            {layer.rail.map((r) => <polyline key={r.id} points={poly(r.pts)} fill="none" stroke="#5a3d2b" strokeWidth={Math.max(1.2, 1.5 * hs)} strokeDasharray={`${4} ${3}`} />)}
            {px > 0.6 && roadLabels(layer, vb).map((l) => <text key={`n${l.id}`} x={l.u} y={-l.v} fontSize={Math.max(4, 9 * hs)} fill="#fffaf0" textAnchor="middle" stroke="#2a2a30" strokeWidth={0.25 * hs * 9} paintOrder="stroke">{l.name}</text>)}
          </g>
          {/* Buildings. */}
          {view.buildings.map((b) => {
            const dc = drawClass(b, mode);
            if (dc === 'hidden') return null;
            const isSel = selB?.id === b.id;
            const pts = isSel && ghostAt && drag.current?.move?.id === b.id ? shift(b.pts, ghostAt) : b.pts;
            return (
              <polygon key={b.id} points={poly(pts)} data-testid="iv-bldg" data-id={b.id} data-class={dc} data-src={b.src}
                fill={dc === 'ghost' ? 'none' : b.src === 'generated' ? 'url(#iv-hatch)' : FILL[dc]} fillOpacity={dc === 'task' ? 0.75 : 0.95}
                stroke={isSel ? '#ffe28a' : dc === 'verified' ? '#1f7a45' : dc === 'ghost' ? '#7d7d7d' : '#5e5446'} strokeWidth={(isSel ? 3 : 1) * hs + 0.15}
                strokeDasharray={dc === 'task' || dc === 'ghost' ? `${4 * hs} ${3 * hs}` : undefined} style={{ cursor: 'pointer' }}
                onPointerDown={(e) => { const [cu, cv] = centerOf(b.pts); onDown(e, { kind: 'building', id: b.id, u: cu, v: cv }); }}>
                <title>{b.name ?? b.id}</title>
              </polygon>
            );
          })}
          {px > 0.8 && view.buildings.filter((b) => drawClass(b, mode) === 'task').map((b) => { const [u, v] = centerOf(b.pts); return <text key={`q${b.id}`} x={u} y={-v + 3 * hs} fontSize={Math.min(6, 9 * hs)} textAnchor="middle" fill="#5e5446" pointerEvents="none">?</text>; })}
          {view.buildings.filter((b) => b.asset).map((b) => { const [u, v] = centerOf(b.pts); return <text key={`a${b.id}`} x={u} y={-v} fontSize={14 * hs} textAnchor="middle" fill="#ff5fa2" pointerEvents="none">★</text>; })}
          {/* Entrances (real: green; generated: orange). */}
          {px > 1.2 && view.buildings.filter((b) => drawClass(b, mode) !== 'hidden').flatMap((b) => b.entrances.map((e) => (
            <circle key={e.id} cx={e.u} cy={-e.v} r={Math.max(0.6, 3 * hs)} fill={e.gen ? '#ff9f1c' : '#2ecc71'} stroke={e.node < 0 ? '#c0392b' : '#1b1030'} strokeWidth={e.node < 0 ? 2 * hs : 0.8 * hs} data-testid="iv-entrance" data-gen={e.gen ? '1' : '0'} data-node={e.node}
              onPointerDown={(ev) => { ev.stopPropagation(); if (selB?.id !== b.id) pickBuilding(b); goEntrance(e.id); }} style={{ cursor: 'pointer' }} />
          )))}
          {showNav && <g pointerEvents="none" data-testid="iv-nav">{navLines(layer).map((l, i) => <line key={i} x1={l[0]} y1={-l[1]} x2={l[2]} y2={-l[3]} stroke="#5ff2e6" strokeWidth={Math.max(0.3, hs)} strokeOpacity="0.8" />)}</g>}
          {walk && <polyline points={walk.path.map(([u, v]) => `${u},${-v}`).join(' ')} fill="none" stroke="#5ff2e6" strokeWidth={Math.max(1, 3 * hs)} strokeDasharray={`${6 * hs} ${3 * hs}`} data-testid="iv-walk" pointerEvents="none" />}
          {/* Businesses (occupants): modern ones only in "all imported". */}
          {view.businesses.filter((b) => b.shown).map((b) => {
            const at = selBiz?.id === b.id && ghostAt && drag.current?.move?.id === b.id ? ghostAt : { u: b.u, v: b.v };
            return <circle key={b.id} cx={at.u} cy={-at.v} r={Math.max(0.8, 4 * hs)} fill={b.status === 'verified' ? '#2ecc71' : '#9b5de5'} stroke={selBiz?.id === b.id ? '#ffe28a' : '#fff'} strokeWidth={hs * 1.2} data-testid="iv-biz" data-id={b.id} style={{ cursor: 'pointer' }}
              onPointerDown={(e) => onDown(e, { kind: 'business', id: b.id, u: b.u, v: b.v })}><title>{b.name}</title></circle>;
          })}
          {/* Fictional occupants (the save). */}
          {Object.values(s.importedOccupants ?? {}).map((o) => { const b = bById.get(o.buildingId); if (!b) return null; const [u, v] = centerOf(b.pts); return <text key={`o${o.buildingId}`} x={u} y={-v - 5 * hs} fontSize={11 * hs} textAnchor="middle" fill="#ffd1e6" stroke="#1b1030" strokeWidth={0.4 * hs} paintOrder="stroke" pointerEvents="none" data-testid="iv-occupant">{o.name}</text>; })}
        </g>}
      </svg>

      {/* Breadcrumb: the zoom sequence, one frame and one set of ids throughout. */}
      <div data-iv-ui className="absolute left-2 top-11 z-[5] flex flex-wrap items-center gap-1 text-[11px] max-w-[60%]" data-testid="iv-crumbs">
        <button type="button" className="hv-btn" onClick={onClose}>✕ Close</button>
        <button type="button" className={`hv-btn ${level === 'island' ? 'hv-on' : ''}`} onClick={goIsland} data-testid="iv-go-island">Island</button>›
        <button type="button" className={`hv-btn ${level === 'area' ? 'hv-on' : ''}`} onClick={goArea} data-testid="iv-go-area">Imported area</button>
        {blockId && <>›<button type="button" className={`hv-btn ${level === 'block' ? 'hv-on' : ''}`} onClick={() => goBlock(blockId)} data-testid="iv-go-block">Block {blockId.replace('blk-', '')}</button></>}
        {selB && <>›<button type="button" className={`hv-btn ${level === 'building' ? 'hv-on' : ''}`} onClick={() => pickBuilding(selB)}>{(selB.name ?? selB.id).slice(0, 22)}</button></>}
        {ent && <>›<span className="hv-btn hv-on">Entrance</span></>}
      </div>
      <div data-iv-ui className="absolute right-2 top-2 z-[5] flex flex-col items-end gap-1 text-[11px]" data-testid="iv-controls">
        <div className="flex gap-1">
          <button type="button" className={`hv-btn ${mode === 'eligible' ? 'hv-on' : ''}`} onClick={() => setMode('eligible')} data-testid="iv-mode-eligible">Eligible for {year}</button>
          <button type="button" className={`hv-btn ${mode === 'all' ? 'hv-on' : ''}`} onClick={() => setMode('all')} data-testid="iv-mode-all">All imported</button>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          <button type="button" className={`hv-btn ${showGame ? 'hv-on' : ''}`} onClick={() => setShowGame((x) => !x)} title="The game's own street grid (drawn from memory), dashed red">Game streets</button>
          <button type="button" className={`hv-btn ${showParcels ? 'hv-on' : ''}`} onClick={() => setShowParcels((x) => !x)}>Parcels</button>
          <button type="button" className={`hv-btn ${showNav ? 'hv-on' : ''}`} onClick={() => setShowNav((x) => !x)} data-testid="iv-nav-btn">Walk graph</button>
          <button type="button" className={`hv-btn ${edit ? 'hv-on' : ''}`} onClick={() => setEdit((x) => !x)} data-testid="iv-edit">Map editor</button>
        </div>
        <div className="flex gap-1"><button type="button" className="hv-btn" onClick={() => zoom(1 / 1.4)}>＋</button><button type="button" className="hv-btn" onClick={() => zoom(1.4)}>－</button></div>
        <button type="button" className="hv-btn" onClick={() => setTasks((x) => !x)} data-testid="iv-tasks-btn">Unresolved: {counts.task}</button>
      </div>

      {/* Legend and attribution (the editor takes its place while open). */}
      {!edit && <div data-iv-ui className="absolute left-2 top-[4.6rem] z-[5] max-w-[min(26rem,60%)] rounded bg-noir-900/90 border border-noir-700 p-2 text-[10px] text-stone-300 space-y-0.5" data-testid="iv-legend">
        <div className="font-semibold text-stone-100">Imported blocks (beta) · {layer.name}</div>
        <div><Sw c={FILL.verified} /> verified {counts.verified} · <Sw c={FILL.provisional} /> provisional {counts.provisional} · <Sw c={FILL.task} dash /> unresolved {counts.task} · {mode === 'all' ? <><Sw c="none" dash /> built later {counts.ghost}</> : <>built later, hidden {counts.hidden}</>} · <Sw hatch /> generated outline</div>
        <div><span className="text-[#ff9f1c]">●</span> generated entrance · <span className="text-[#2ecc71]">●</span> mapped entrance · <span className="text-[#c0392b]">--</span> the game's own streets (drawn from memory; they do not match the real grid here)</div>
        <div className="text-stone-500">{layer.attribution.join(' · ')}</div>
      </div>}

      {tasks && (
        <div data-iv-ui className="absolute right-2 top-36 z-[6] w-72 max-h-[50vh] overflow-y-auto rounded border border-noir-600 bg-noir-900/95 p-2 text-[11px] text-stone-300" data-testid="iv-tasks">
          <div className="mb-1 font-semibold text-stone-100">{taskList.length} buildings with no period evidence</div>
          <p className="mb-1 text-stone-500">Shown as dashed outlines with "?" until a Sanborn sheet or directory settles them. None is assumed to have stood.</p>
          {taskList.slice(0, 80).map((b) => <button key={b.id} type="button" className="hv-mi block w-full text-left" onClick={() => pickBuilding(b)}>{b.name ?? b.id} <span className="text-stone-500">· {b.status}</span></button>)}
        </div>
      )}

      {(selB || selBiz) && (
        <div data-iv-ui className="absolute right-2 bottom-2 z-[6] w-[min(24rem,94%)] max-h-[58vh] overflow-y-auto rounded-lg border border-[#ff5fa2]/40 bg-noir-900/95 p-3 text-xs text-stone-300 shadow-xl" data-testid="iv-card">
          <div className="flex items-start justify-between gap-2">
            <div className="font-display text-lg leading-tight text-[#ffd1e6]">{selB ? (selB.name ?? (selB.src === 'generated' ? 'A building (generated outline)' : 'A building')) : selBiz!.name}</div>
            <button type="button" className="text-stone-400" onClick={() => { setSel(undefined); setEntrance(undefined); }}>close ×</button>
          </div>
          {selB && <BuildingCard b={selB} layer={layer} biz={view.businesses.filter((x) => x.building === selB.id)} mode={mode} occupant={occupant} year={year}
            onEntrance={goEntrance} entrance={entrance} walkLen={walk?.length}
            onOccupant={update ? (name, kind) => update((st) => assignImportedOccupant(st, selB.id, name, kind), `Put ${name} in a building`) : undefined} />}
          {selBiz && <BizCard b={selBiz} />}
          {edit && sel && <EditorPanel target={sel} b={selB} onOverride={addOverride} />}
        </div>
      )}

      {edit && (
        <div data-iv-ui className="absolute left-2 top-[4.6rem] z-[6] w-64 rounded border border-noir-600 bg-noir-900/95 p-2 text-[11px] text-stone-300" data-testid="iv-editor">
          <div className="font-semibold text-stone-100">Map editor (beta)</div>
          <p className="text-stone-500">Select a building or business, then drag it to move it, mark it verified with its evidence, or assign an asset. {overrides.length} correction(s) kept in this browser.</p>
          <div className="mt-1 flex gap-1">
            <button type="button" className="hv-btn" onClick={download} data-testid="iv-export">Download historical-overrides.json</button>
            <button type="button" className="hv-btn" onClick={() => { const t = exportFile(); setExportText(t); try { void navigator.clipboard.writeText(t); } catch { /* shown below */ } }}>Copy</button>
          </div>
          {overrides.length > 0 && <button type="button" className="mt-1 text-[10px] text-stone-500 underline" onClick={() => { if (window.confirm('Discard every correction kept in this browser?')) { setOverrides([]); saveOverrides(layer.packId, []); } }}>discard all</button>}
          {exportText && <textarea readOnly value={exportText} className="mt-1 h-24 w-full rounded bg-noir-950 p-1 font-mono text-[9px]" onFocus={(e) => e.currentTarget.select()} data-testid="iv-export-text" />}
        </div>
      )}
    </div>
  );
}

function Sw({ c, dash, hatch }: { c?: string; dash?: boolean; hatch?: boolean }) {
  return <span className="inline-block h-2.5 w-3.5 align-middle rounded-sm" style={{ background: hatch ? 'repeating-linear-gradient(45deg,#d9d2bf 0 2px,#8d8576 2px 3px)' : c === 'none' ? 'transparent' : c, border: `1px ${dash ? 'dashed' : 'solid'} #5e5446` }} />;
}

function shift(pts: number[], at: { u: number; v: number }): number[] {
  const [cu, cv] = centerOf(pts);
  return pts.map((x, i) => (i % 2 === 0 ? x + at.u - cu : x + at.v - cv));
}

/** One label per street name in view: on its longest piece, at that piece's middle. */
function roadLabels(layer: ImportedLayer, vb: VB): { id: string; name: string; u: number; v: number }[] {
  const best = new Map<string, { id: string; name: string; u: number; v: number; len: number }>();
  for (const r of layer.roads) {
    if (!r.name || r.cls !== 'street') continue;
    const p = unflat(r.pts).filter(([u, v]) => u >= vb.x && u <= vb.x + vb.w && -v >= vb.y && -v <= vb.y + vb.h);
    if (p.length < 2) continue;
    const len = Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]);
    const m = p[Math.floor(p.length / 2)];
    const cur = best.get(r.name);
    if (!cur || len > cur.len) best.set(r.name, { id: r.id, name: r.name, u: m[0], v: m[1], len });
  }
  return [...best.values()];
}

function navLines(layer: ImportedLayer): number[][] {
  const n = layer.nav.nodes, e = layer.nav.edges, out: number[][] = [];
  for (let k = 0; k + 1 < e.length; k += 2) out.push([n[2 * e[k]], n[2 * e[k] + 1], n[2 * e[k + 1]], n[2 * e[k + 1] + 1]]);
  return out;
}

const KINDS = ['social club', 'tavern', 'luncheonette', 'barber shop', 'candy store', 'rooming house', 'garage', 'storefront'];

function BuildingCard({ b, layer, biz, mode, occupant, year, onEntrance, entrance, walkLen, onOccupant }: { b: ViewBuilding; layer: ImportedLayer; biz: ViewBusiness[]; mode: ShowMode; occupant?: { name: string; kind: string; since: number }; year: number; onEntrance: (id: string) => void; entrance?: string; walkLen?: number; onOccupant?: (name: string, kind: string) => void }) {
  const dc = drawClass(b, mode);
  const parcels = b.parcels.map((id) => layer.parcels.find((p) => p.id === id)).filter(Boolean);
  const [name, setName] = useState(occupant?.name ?? '');
  const [kind, setKind] = useState(occupant?.kind ?? KINDS[0]);
  useEffect(() => { setName(occupant?.name ?? ''); setKind(occupant?.kind ?? KINDS[0]); }, [b.id, occupant?.name, occupant?.kind]);
  return (
    <div className="mt-1 space-y-2" data-testid="iv-building-card" data-id={b.id}>
      <div className="text-[10px] text-stone-500 break-all">id {b.id}</div>
      <div className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${dc === 'verified' ? 'bg-emerald-700/60' : dc === 'provisional' ? 'bg-amber-700/50' : 'bg-stone-700/70'} text-stone-100`} data-testid="iv-hist">{KIND_LABEL[dc]}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <div className="text-stone-500">Outline</div><div>{b.src === 'osm' ? 'surveyed (OpenStreetMap)' : 'generated from the parcel (no survey)'}</div>
        <div className="text-stone-500">Year built</div><div>{b.yr ? `${b.yr} (assessor, medium confidence)` : 'unknown'}</div>
        <div className="text-stone-500">Height</div><div>{b.h} m{b.levels ? ` · ${b.levels} storeys` : ''} {b.hGen && <em className="text-amber-300">generated</em>}</div>
        <div className="text-stone-500">Roof</div><div>{b.roof} {b.roofGen && <em className="text-amber-300">generated</em>} · template {b.tpl}</div>
        <div className="text-stone-500">Parcels</div><div>{parcels.length ? parcels.map((p) => `${p!.addr ?? p!.id}${p!.yr ? ` (${p!.yr})` : ''}`).join('; ') : 'none'}</div>
        {b.asset && <><div className="text-stone-500">Asset</div><div>{b.asset} (replaces the generated building)</div></>}
      </div>
      {b.evidence.length > 0 && <div className="text-[10px] text-stone-400">{b.evidence.map((e, i) => <div key={i}>· {e.note} — {e.source} ({e.confidence}{e.year ? `, ${e.year}` : ''})</div>)}</div>}
      <div>
        <div className="text-stone-500">Entrances</div>
        {b.entrances.map((e) => (
          <button key={e.id} type="button" className={`hv-btn mr-1 mt-0.5 ${entrance === e.id ? 'hv-on' : ''}`} onClick={() => onEntrance(e.id)} data-testid="iv-go-entrance">
            {e.gen ? 'Generated entrance' : 'Mapped entrance'}{e.node < 0 ? ' (not connected)' : ''}
          </button>
        ))}
        {entrance && <div className="text-[10px] text-stone-400 mt-0.5" data-testid="iv-walk-len">{walkLen !== undefined ? `Walk from the block corner on the street graph: ${Math.round(walkLen)} m (centrelines; no sidewalks or collision yet).` : 'This entrance is not connected to the walk graph.'}</div>}
      </div>
      {biz.length > 0 && <div><div className="text-stone-500">Occupants today (OpenStreetMap, unverified for {year})</div>{biz.map((x) => <div key={x.id}>· {x.name} <span className="text-stone-500">({x.cat})</span></div>)}</div>}
      <div className="rounded border border-noir-700 p-2" data-testid="iv-occupant-form">
        <div className="text-stone-400">Fictional occupant (saved with your game)</div>
        {occupant && <div className="text-[#ffd1e6]">{occupant.name} · {occupant.kind} · since {occupant.since}</div>}
        {onOccupant ? (
          <div className="mt-1 flex gap-1">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. The Blue Note" className="min-w-0 flex-1 rounded bg-noir-950 px-1 py-0.5 text-stone-200" data-testid="iv-occupant-name" />
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded bg-noir-950 px-1 text-stone-200">{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <button type="button" className="hv-btn hv-on" onClick={() => onOccupant(name, kind)} data-testid="iv-occupant-set">Set</button>
          </div>
        ) : <div className="text-stone-500">Open from a game to set one.</div>}
      </div>
    </div>
  );
}

function BizCard({ b }: { b: ViewBusiness }) {
  return (
    <div className="mt-1 space-y-1" data-testid="iv-biz-card">
      <div className="text-[10px] text-stone-500 break-all">id {b.id} · sources {b.srcIds.join(', ')}</div>
      <div>{b.cat}{b.addr ? ` · ${b.addr}` : ''}</div>
      <div>{b.building ? `In building ${b.building}` : 'In no building outline'}</div>
      <div className="text-amber-200">{b.status === 'verified' ? 'Verified for the year' : 'A modern business: not shown in the period until verified.'}</div>
    </div>
  );
}

function EditorPanel({ target, b, onOverride }: { target: { kind: 'building' | 'business'; id: string }; b?: ViewBuilding; onOverride: (o: HistOverride) => void }) {
  const [src, setSrc] = useState('');
  const [yr, setYr] = useState('');
  const [asset, setAsset] = useState(b?.asset ?? '');
  const layerName = target.kind === 'building' ? 'buildings' : 'businesses';
  const now = () => new Date().toISOString();
  return (
    <div className="mt-2 rounded border border-[#5ff2e6]/40 p-2 space-y-1" data-testid="iv-edit-panel">
      <div className="text-[#5ff2e6]">Editor: drag the selected {target.kind} to move it.</div>
      <div className="flex gap-1"><input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="Evidence (e.g. Sanborn 1950 sheet 63B)" className="min-w-0 flex-1 rounded bg-noir-950 px-1" data-testid="iv-ev-source" /><input value={yr} onChange={(e) => setYr(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Year" className="w-12 rounded bg-noir-950 px-1" /></div>
      <div className="flex gap-1 flex-wrap">
        <button type="button" className="hv-btn" disabled={!src.trim()} onClick={() => onOverride(editorOverride({ layer: layerName, id: target.id }, 'verify', { evidence: { year: yr ? Number(yr) : null, source: src.trim(), confidence: 'high', note: 'checked against period evidence in the map editor' } }, '', now()))} data-testid="iv-verify">Mark verified</button>
        <button type="button" className="hv-btn" disabled={!src.trim()} onClick={() => onOverride(editorOverride({ layer: layerName, id: target.id }, 'remove', { evidence: { year: yr ? Number(yr) : null, source: src.trim(), confidence: 'high', note: 'not there in the period (map editor)' } }, '', now()))}>Not there in the period</button>
      </div>
      {target.kind === 'building' && <div className="flex gap-1">
        <input list="iv-assets" value={asset} onChange={(e) => setAsset(e.target.value)} placeholder="Asset id (replaces the generated building)" className="min-w-0 flex-1 rounded bg-noir-950 px-1" data-testid="iv-asset" />
        <datalist id="iv-assets">{Object.keys(ASSET_URLS).slice(0, 200).map((k) => <option key={k} value={k} />)}</datalist>
        <button type="button" className="hv-btn" disabled={!asset.trim()} onClick={() => onOverride(editorOverride({ layer: 'buildings', id: target.id }, 'set-asset', { assetId: asset.trim() }, 'asset assigned in the map editor', now()))} data-testid="iv-asset-set">Assign</button>
      </div>}
    </div>
  );
}
