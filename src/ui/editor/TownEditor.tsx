import { useEffect, useMemo, useRef, useState } from 'react';
import { confidenceLabel, evidenceSummary, exportCityPackage, frameFns, importCityPackage, occupantIn, validateCityPackage, type CityIssue, type CityPackage, type Confidence, type MarketStatus, type NamePolicy, type Years } from '../../engine/cityPackage';
import { addBusiness, addDistrict, addLandmark, addParcel, findRecord, moveRecord, newTown, removeRecord, setArt, setEvidence, setYears, updateRecord } from '../../engine/cityEdit';
import { CITY_PACKAGES } from '../../worldpack/cities';
import { ASSET_URLS, type AssetKey } from '../hood/art/assetUrls';
import { AssetImg } from '../hood/AssetImg';
import { ConfBadge, TownLayers, drawables, extentOf, type Drawn } from './townDraw';

/**
 * The town editor: make or correct a town package in the browser. Pick a
 * shipped package (or start a new town, or paste one in), then draw
 * districts, place parcels and landmarks, give them addresses, years,
 * evidence and art, preview any year, validate, and copy the package out as
 * JSON (copy, not download: the published page cannot follow download
 * links). A draft can be kept in this browser; the shipped packages are only
 * changed by pasting the export into the repository. Ids are never reused,
 * so saves that hold a lot keep finding it.
 */

type Tool = 'select' | 'parcel' | 'landmark' | 'district';
const DRAFT = (id: string) => `llv-town-draft:${id}`;
const ART_KEYS = Object.keys(ASSET_URLS) as AssetKey[];
const USES = ['hotel', 'motel', 'boarding', 'diner', 'trattoria', 'supper', 'bakery', 'pharmacy', 'hardware', 'storefront', 'bookstore', 'cinema', 'arcade', 'giftshop', 'souvenir', 'icecream', 'barber', 'florist', 'marina', 'dockwh', 'jazzclub', 'pavilion', 'surf', 'condo', 'casino'];

function loadDraft(id: string): string | undefined {
  try { return localStorage.getItem(DRAFT(id)) ?? undefined; } catch { return undefined; }
}

/** The record a validation path points at (`parcels[3].years` → that parcel's id). */
function recordOfPath(pkg: CityPackage, path: string): string | undefined {
  const m = /^(\w+)\[(\d+)\]/.exec(path);
  if (!m) return undefined;
  const list = (pkg as unknown as Record<string, { id?: string }[]>)[m[1]];
  return list?.[Number(m[2])]?.id;
}

const inp = 'bg-noir-900 border border-noir-700 rounded px-1 py-0.5 text-xs text-stone-200 w-full';

export function TownEditor({ year: gameYear, onClose }: { year: number; onClose: () => void }) {
  const [pkg, setPkg] = useState<CityPackage>(CITY_PACKAGES.capemay ?? Object.values(CITY_PACKAGES)[0]);
  const [undo, setUndo] = useState<CityPackage[]>([]);
  const lastKey = useRef<string | undefined>();
  const [sel, setSel] = useState<string | undefined>();
  const [tool, setTool] = useState<Tool>('select');
  const [poly, setPoly] = useState<[number, number][]>([]);
  const [year, setYear] = useState(gameYear);
  const [issues, setIssues] = useState<{ errors: CityIssue[]; warnings: CityIssue[] } | undefined>();
  const [box, setBox] = useState<'export' | 'import' | 'new' | undefined>();
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | undefined>();
  const [pasted, setPasted] = useState<ReturnType<typeof importCityPackage> | undefined>();
  const [draftHere, setDraftHere] = useState<string | undefined>(() => loadDraft(pkg.id));
  const svg = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState(() => extentOf(pkg, new Set(pkg.districts.slice(0, 2).map((d) => d.id))));
  const [px, setPx] = useState(800);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(el.clientWidth || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Every change goes through here: undo, and the stale check is cleared. */
  const edit = (next: CityPackage, key?: string) => {
    if (!key || key !== lastKey.current) setUndo((u) => [...u.slice(-39), pkg]);
    lastKey.current = key;
    setPkg(next);
    setIssues(undefined);
    setNote(undefined);
  };
  const open = (p: CityPackage) => {
    setPkg(p); setUndo([]); setSel(undefined); setPoly([]); setTool('select'); setIssues(undefined);
    setVb(extentOf(p, new Set(p.districts.slice(0, 2).map((d) => d.id))));
    setDraftHere(loadDraft(p.id));
    setYear(Math.min(Math.max(gameYear, p.era.from), p.era.to));
  };

  const items = useMemo(() => drawables(pkg, year), [pkg, year]);
  const scale = vb.w / Math.max(1, px);

  const toUV = (cx: number, cy: number) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return { u: 0, v: 0 };
    const pt = el.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const r = pt.matrixTransform(m.inverse());
    return { u: r.x, v: -r.y };
  };

  const drag = useRef<{ sx: number; sy: number; vb: typeof vb; d?: Drawn; moved: boolean } | undefined>();
  const down = (e: React.PointerEvent, d?: Drawn) => {
    if ((e.target as Element).closest('[data-te-ui]')) return;
    e.stopPropagation();
    if (!d && tool !== 'select') {
      const at = toUV(e.clientX, e.clientY);
      if (tool === 'parcel') { const r = addParcel(pkg, at); edit(r.pkg); setSel(r.id); setTool('select'); }
      if (tool === 'landmark') { const r = addLandmark(pkg, 'New landmark', 'landmark', at); edit(r.pkg); setSel(r.id); setTool('select'); }
      if (tool === 'district') setPoly((p) => [...p, [Math.round(at.u), Math.round(at.v)]]);
      return;
    }
    drag.current = { sx: e.clientX, sy: e.clientY, vb, d, moved: false };
    const start = d ? { u: d.u, v: d.v } : undefined;
    const mv = (ev: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      if (!g.moved && Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy) < 6) return;
      g.moved = true;
      const k = g.vb.w / Math.max(1, svg.current?.clientWidth ?? 1);
      if (!g.d || !g.d.movable || g.d.kind === 'district') {
        setVb({ ...g.vb, x: g.vb.x - (ev.clientX - g.sx) * k, y: g.vb.y - (ev.clientY - g.sy) * k });
        return;
      }
      const at = { u: start!.u + (ev.clientX - g.sx) * k, v: start!.v - (ev.clientY - g.sy) * k };
      setPkg((p) => {
        if (g.d!.kind === 'placement' && p.geography.frame) {
          const geo = frameFns(p.geography.frame).toLngLat(at.u, at.v);
          return updateRecord(p, g.d!.id, { geo: [Number(geo[0].toFixed(6)), Number(geo[1].toFixed(6))] });
        }
        return moveRecord(p, g.d!.id, at);
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const g = drag.current;
      drag.current = undefined;
      if (g && !g.moved) setSel(g.d?.id);
      if (g?.moved && g.d?.movable) { setUndo((u) => [...u.slice(-39), pkg]); lastKey.current = undefined; setIssues(undefined); }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const zoom = (k: number) => setVb((b) => { const w = Math.min(20000, Math.max(80, b.w * k)); const h = b.h * (w / b.w); return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }; });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const finishDistrict = () => {
    if (poly.length < 3) { setNote('A district needs at least three points.'); return; }
    const r = addDistrict(pkg, `District ${pkg.districts.length + 1}`, poly);
    edit(r.pkg);
    setSel(r.id);
    setPoly([]);
    setTool('select');
  };

  const validate = () => {
    const v = validateCityPackage(pkg);
    setIssues({ errors: v.errors, warnings: v.warnings });
  };
  const doExport = () => {
    const t = exportCityPackage(pkg);
    setText(t);
    setBox('export');
    setNote(undefined);
    try { void navigator.clipboard.writeText(t).then(() => setNote('Copied to the clipboard.'), () => setNote('Select all and copy.')); } catch { setNote('Select all and copy.'); }
  };
  const checkPaste = () => setPasted(importCityPackage(text, { allowErrors: true }));
  const loadPasted = () => { if (pasted?.pkg) { open(pasted.pkg); setBox(undefined); setPasted(undefined); setText(''); } };
  const saveDraft = () => {
    try { localStorage.setItem(DRAFT(pkg.id), exportCityPackage(pkg)); setDraftHere(exportCityPackage(pkg)); setNote('Draft kept in this browser.'); } catch { setNote('This browser will not keep it: use Copy JSON.'); }
  };

  const f = sel ? findRecord(pkg, sel) : undefined;
  const ev = useMemo(() => evidenceSummary(pkg), [pkg]);
  const open1960 = items.filter((d) => d.kind === 'parcel' && !d.dim).length;
  const years: number[] = [];
  for (let y = Math.ceil(pkg.era.from / 5) * 5; y <= pkg.era.to; y += 5) years.push(y);
  if (!years.includes(gameYear) && gameYear >= pkg.era.from && gameYear <= pkg.era.to) years.push(gameYear);
  years.sort((a, b) => a - b);

  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-[#16365a]" data-testid="town-editor" data-pkg={pkg.id} data-year={year} data-tool={tool}>
      <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full select-none" style={{ touchAction: 'none', cursor: tool === 'select' ? 'grab' : 'crosshair' }} onPointerDown={(e) => down(e)} data-testid="te-map">
        <TownLayers pkg={pkg} year={year} sel={sel} items={items} scale={scale} onDown={(e, d) => down(e, d)} />
        {poly.length > 0 && <path d={`M${poly.map(([u, v]) => `${u} ${-v}`).join('L')}`} fill="#ffe28a" fillOpacity="0.2" stroke="#ffe28a" strokeWidth={scale * 2} data-testid="te-poly" pointerEvents="none" />}
      </svg>

      {/* Toolbar. */}
      <div className="absolute left-2 top-2 right-2 z-10 flex flex-wrap items-center gap-1.5" data-te-ui>
        <button type="button" className="hv-btn" onClick={onClose} data-testid="te-close">← Block map</button>
        <label className="hv-btn flex items-center gap-1">Town
          <select className="bg-transparent text-[11px] max-w-[8rem]" value={CITY_PACKAGES[pkg.townId]?.id === pkg.id ? pkg.townId : ''} onChange={(e) => { const p = CITY_PACKAGES[e.target.value]; if (p) open(p); }} data-testid="te-town">
            {CITY_PACKAGES[pkg.townId]?.id !== pkg.id && <option value="">{pkg.displayName} (draft)</option>}
            {Object.values(CITY_PACKAGES).map((p) => <option key={p.townId} value={p.townId}>{p.displayName}</option>)}
          </select>
        </label>
        <button type="button" className="hv-btn" onClick={() => { setBox('new'); setText(''); }} data-testid="te-new">New town</button>
        <label className="hv-btn flex items-center gap-1">Year
          <select className="bg-transparent text-[11px]" value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="te-year">
            {years.map((y) => <option key={y} value={y}>{y}{y === gameYear ? ' (now)' : ''}</option>)}
          </select>
        </label>
        <span className="inline-flex rounded-md overflow-hidden border border-[#3a342e]" role="group" aria-label="Tool">
          {([['select', 'Select'], ['parcel', '+ Parcel'], ['landmark', '+ Landmark'], ['district', '+ District']] as [Tool, string][]).map(([t, n]) => (
            <button key={t} type="button" className={`hv-btn rounded-none border-0 ${tool === t ? 'hv-on' : ''}`} aria-pressed={tool === t} onClick={() => { setTool(t); setPoly([]); }} data-testid={`te-tool-${t}`}>{n}</button>
          ))}
        </span>
        {tool === 'district' && <button type="button" className="hv-btn hv-on" onClick={finishDistrict} data-testid="te-finish">Finish district ({poly.length})</button>}
        <button type="button" className="hv-btn" onClick={() => zoom(1 / 1.4)} aria-label="Zoom in">+</button>
        <button type="button" className="hv-btn" onClick={() => zoom(1.4)} aria-label="Zoom out">−</button>
        <button type="button" className="hv-btn" disabled={!undo.length} onClick={() => { const u = undo[undo.length - 1]; if (u) { setPkg(u); setUndo(undo.slice(0, -1)); lastKey.current = undefined; setIssues(undefined); } }} data-testid="te-undo">Undo</button>
        <button type="button" className="hv-btn" onClick={validate} data-testid="te-validate">Validate</button>
        <button type="button" className="hv-btn" onClick={doExport} data-testid="te-export">Copy JSON</button>
        <button type="button" className="hv-btn" onClick={() => { setBox('import'); setText(''); setPasted(undefined); }} data-testid="te-import">Paste JSON</button>
        <button type="button" className="hv-btn" onClick={saveDraft} data-testid="te-save">Keep draft</button>
      </div>

      {/* District jumps and the summary. */}
      <div className="absolute left-2 bottom-2 z-10 max-w-[min(620px,calc(100%-1rem))] rounded bg-[#1b1030]/90 border border-[#ff5fa2]/50 px-2 py-1 text-[11px] text-[#ffd1e6] space-y-1" data-te-ui data-testid="te-summary">
        <div><span className="font-display">{pkg.displayName}</span> <span className="text-stone-400">· {pkg.status} · v{pkg.contentVersion} · {pkg.districts.length} districts, {pkg.parcels.length} parcels, {open1960} open in {year}</span></div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-stone-300"><span><ConfBadge c="verified" /> {ev.verified}</span><span><ConfBadge c="approximate" /> {ev.approximate}</span><span><ConfBadge c="invented" /> {ev.invented}</span><span className="text-stone-500">solid / dashed / dotted outlines</span></div>
        <div className="flex flex-wrap gap-1">
          {pkg.districts.map((d) => <button key={d.id} type="button" className="hv-btn !py-0" onClick={() => setVb(extentOf(pkg, new Set([d.id])))} data-testid="te-goto">{d.name}</button>)}
        </div>
        {draftHere && draftHere !== exportCityPackage(pkg) && <div className="text-amber-200">A draft of this town is kept in this browser. <button type="button" className="underline" onClick={() => { const r = importCityPackage(draftHere, { allowErrors: true }); if (r.pkg) edit(r.pkg); }} data-testid="te-load-draft">Load it</button></div>}
        {note && <div className="text-emerald-200" data-testid="te-note">{note}</div>}
      </div>

      {/* Validation results. */}
      {issues && (
        <div className="absolute z-20 right-2 top-24 w-[min(380px,calc(100%-1rem))] max-h-[45%] overflow-y-auto panel p-2 text-xs space-y-1" data-te-ui data-testid="te-issues">
          <div className="flex justify-between"><span className={issues.errors.length ? 'text-rose-300 font-bold' : 'text-emerald-300 font-bold'} data-testid="te-valid">{issues.errors.length ? `${issues.errors.length} error${issues.errors.length > 1 ? 's' : ''}` : 'Valid'}{issues.warnings.length ? `, ${issues.warnings.length} to research` : ''}</span><button type="button" onClick={() => setIssues(undefined)}>close ×</button></div>
          {[...issues.errors.map((x) => ['e', x] as const), ...issues.warnings.map((x) => ['w', x] as const)].slice(0, 60).map(([k, x], i) => (
            <button key={i} type="button" className={`block w-full text-left ${k === 'e' ? 'text-rose-200' : 'text-amber-200'}`} onClick={() => setSel(recordOfPath(pkg, x.path))}>{k === 'e' ? '✕' : '!'} {x.message}</button>
          ))}
        </div>
      )}

      {/* Export / import / new town. */}
      {box && (
        <div className="absolute z-30 right-2 top-12 w-[min(440px,calc(100%-1rem))] panel p-2 space-y-1.5 text-xs" data-te-ui data-testid={`te-box-${box}`}>
          <div className="flex justify-between text-stone-300">
            <span>{box === 'export' ? (note ?? 'Copying…') : box === 'import' ? 'Paste a town package (JSON). Nothing changes until it checks out.' : 'A new town'}</span>
            <button type="button" onClick={() => { setBox(undefined); setPasted(undefined); }}>close ×</button>
          </div>
          {box === 'new'
            ? <NewTownForm onMake={(p) => { open(p); setBox(undefined); }} />
            : <textarea readOnly={box === 'export'} value={text} onChange={(e) => { setText(e.target.value); setPasted(undefined); }} onFocus={(e) => box === 'export' && e.currentTarget.select()} className="w-full h-40 bg-noir-900 text-[10px] font-mono text-stone-300 p-1" data-testid="te-text" />}
          {box === 'import' && <>
            <button type="button" className="btn-gold w-full" onClick={checkPaste} disabled={!text.trim()} data-testid="te-check">Check it</button>
            {pasted && (pasted.validation.ok
              ? <div className="space-y-1"><div className="text-emerald-300" data-testid="te-paste-ok">Valid: {pasted.pkg!.displayName}, {pasted.pkg!.parcels.length} parcels.</div><button type="button" className="btn-gold w-full" onClick={loadPasted} data-testid="te-load">Open it</button></div>
              : <div className="space-y-1"><div className="text-rose-300" data-testid="te-paste-bad">{pasted.validation.errors.length} problem{pasted.validation.errors.length > 1 ? 's' : ''}:</div>
                {pasted.validation.errors.slice(0, 8).map((x, i) => <div key={i} className="text-rose-200">✕ {x.message}</div>)}
                {pasted.pkg && <button type="button" className="hv-btn" onClick={loadPasted}>Open it as a draft anyway</button>}</div>)}
          </>}
        </div>
      )}

      {/* The selected record. */}
      {f && !box && (
        <div className="absolute z-20 left-2 right-2 bottom-24 max-h-[50%] overflow-y-auto md:left-auto md:bottom-auto md:right-2 md:top-24 md:w-[340px] md:max-h-[calc(100%-8rem)] panel p-2 space-y-1.5 text-xs" data-te-ui data-testid="te-panel" data-id={sel}>
          <RecordForm pkg={pkg} id={sel!} year={year} onEdit={edit} onSelect={setSel} onDelete={() => { edit(removeRecord(pkg, sel!)); setSel(undefined); }} onClose={() => setSel(undefined)} />
        </div>
      )}
      {tool !== 'select' && <div className="absolute z-10 left-1/2 -translate-x-1/2 top-24 rounded bg-black/70 px-2 py-1 text-[11px] text-stone-200 pointer-events-none" data-testid="te-hint">{tool === 'district' ? 'Tap the corners of the district, then Finish' : `Tap the map to place a ${tool}`}</div>}
    </div>
  );
}

function NewTownForm({ onMake }: { onMake: (p: CityPackage) => void }) {
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const la = lat.trim() ? Number(lat) : null;
  const ln = lng.trim() ? Number(lng) : null;
  return (
    <div className="grid grid-cols-3 gap-1">
      <label className="col-span-3 flex flex-col text-[10px] text-stone-500">Name<input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ocean City" data-testid="te-new-name" /></label>
      <label className="flex flex-col text-[10px] text-stone-500">Lat (optional)<input className={inp} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" /></label>
      <label className="flex flex-col text-[10px] text-stone-500">Lng (optional)<input className={inp} value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" /></label>
      <button type="button" className="btn-gold self-end" disabled={!name.trim() || (la !== null && !Number.isFinite(la)) || (ln !== null && !Number.isFinite(ln))} onClick={() => onMake(newTown(name.trim(), la, ln))} data-testid="te-new-make">Start</button>
      <p className="col-span-3 text-stone-500">Draw districts with + District, then place parcels in them. Without a lat/lng it stays a draft until you set the frame.</p>
    </div>
  );
}

function YearsInput({ y, onChange }: { y: Years | undefined; onChange: (y: Years) => void }) {
  const num = (s: string) => (s.trim() ? Number(s) : undefined);
  return (
    <div className="grid grid-cols-3 gap-1 items-end">
      <label className="flex flex-col text-[10px] text-stone-500">From<input className={inp} type="number" value={y?.from ?? ''} onChange={(e) => onChange({ ...y, from: num(e.target.value) })} data-testid="te-from" /></label>
      <label className="flex flex-col text-[10px] text-stone-500">To<input className={inp} type="number" value={y?.to ?? ''} onChange={(e) => onChange({ ...y, to: num(e.target.value) })} data-testid="te-to" /></label>
      <label className="flex items-center gap-1 text-[10px] text-stone-400"><input type="checkbox" checked={!!y?.approx} onChange={(e) => onChange({ ...y, approx: e.target.checked })} />approx.</label>
    </div>
  );
}

function RecordForm({ pkg, id, year, onEdit, onSelect, onDelete, onClose }: { pkg: CityPackage; id: string; year: number; onEdit: (p: CityPackage, key?: string) => void; onSelect: (id: string) => void; onDelete: () => void; onClose: () => void }) {
  const f = findRecord(pkg, id)!;
  const r = f.rec as Record<string, unknown> & { id: string };
  const set = (patch: Record<string, unknown>, key: string) => onEdit(updateRecord(pkg, id, patch), `${id}:${key}`);
  const evd = r.evidence as { confidence: Confidence; source: string } | undefined;
  const art = (r.art as string[] | { exterior?: string[] } | undefined);
  const artList = Array.isArray(art) ? art : art?.exterior ?? [];
  const [artText, setArtText] = useState(artList.join(', '));
  useEffect(() => setArtText(artList.join(', ')), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const kind = f.list.replace(/s$/, '');
  const businesses = f.list === 'parcels' ? pkg.businesses.filter((b) => b.parcelId === id) : [];
  const [nb, setNb] = useState({ name: '', use: 'storefront', from: String(year), policy: 'fictional' as NamePolicy });
  const occ = f.list === 'parcels' ? occupantIn(pkg, id, year) : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-2">
        <div className="min-w-0"><div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{kind} · {r.id}</div>
          <div className="font-display text-sm text-[#ffd1e6] truncate">{(r.name as string) || occ?.name || (r.address as string) || r.id}</div></div>
        <button type="button" className="text-stone-400 shrink-0" onClick={onClose}>done</button>
      </div>
      {'name' in r && <label className="flex flex-col text-[10px] text-stone-500">Name<input className={inp} value={(r.name as string) ?? ''} onChange={(e) => set({ name: e.target.value }, 'name')} data-testid="te-name" /></label>}
      {(f.list === 'parcels' || f.list === 'placements') && <label className="flex flex-col text-[10px] text-stone-500">Address<input className={inp} value={(r.address as string) ?? ''} onChange={(e) => set({ address: e.target.value }, 'address')} data-testid="te-address" /></label>}
      {'districtId' in r || f.list === 'parcels' || f.list === 'landmarks' || f.list === 'institutions' ? (
        <label className="flex flex-col text-[10px] text-stone-500">District
          <select className={inp} value={(r.districtId as string) ?? ''} onChange={(e) => set({ districtId: e.target.value || undefined }, 'district')}>
            <option value="">—</option>
            {pkg.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      ) : null}
      {f.list === 'districts' && <>
        <label className="flex flex-col text-[10px] text-stone-500">Residents (1960)<input className={inp} type="number" value={(r.pop as number) ?? 0} onChange={(e) => set({ pop: Number(e.target.value) || 0 }, 'pop')} /></label>
        <label className="flex flex-col text-[10px] text-stone-500">Blurb<textarea className={inp} rows={2} value={(r.blurb as string) ?? ''} onChange={(e) => set({ blurb: e.target.value }, 'blurb')} /></label>
      </>}
      {f.list === 'parcels' && <>
        <div className="grid grid-cols-2 gap-1">
          <label className="flex flex-col text-[10px] text-stone-500">Held as
            <select className={inp} value={(r.market as { status?: string } | undefined)?.status ?? 'private'} onChange={(e) => set({ market: { status: e.target.value as MarketStatus, owner: e.target.value === 'public' ? 'city' : ((r.market as { owner?: string } | undefined)?.owner ?? 'private') } }, 'market')} data-testid="te-market">
              {['private', 'rival', 'sale', 'lease', 'public'].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="flex items-end gap-1 text-[10px] text-stone-400 pb-1"><input type="checkbox" checked={r.ownable === false} onChange={(e) => set({ ownable: e.target.checked ? false : undefined }, 'ownable')} data-testid="te-never" />never for sale (public)</label>
        </div>
        {!!r.pos && <div className="grid grid-cols-3 gap-1">
          {(['w', 'd'] as const).map((k) => <label key={k} className="flex flex-col text-[10px] text-stone-500">{k === 'w' ? 'Width m' : 'Depth m'}<input className={inp} type="number" value={(r.footprint as { w: number; d: number } | undefined)?.[k] ?? 16} onChange={(e) => set({ footprint: { ...(r.footprint as object ?? { w: 16, d: 22 }), [k]: Math.max(2, Number(e.target.value) || 2) } }, `fp${k}`)} /></label>)}
          <label className="flex flex-col text-[10px] text-stone-500">Turn °<input className={inp} type="number" value={(r.rotation as number) ?? 0} onChange={(e) => set({ rotation: Number(e.target.value) || 0 }, 'rot')} /></label>
        </div>}
        {!r.pos && !!r.slot && <p className="text-stone-500">On the street grid (block and half-block). Move its building in the location layer instead.</p>}
        <div className="border-t border-noir-700 pt-1 space-y-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Occupants</div>
          {businesses.map((b) => (
            <button key={b.id} type="button" className={`block w-full text-left rounded px-1 ${occ?.id === b.id ? 'bg-emerald-900/40' : ''}`} onClick={() => onSelect(b.id)} data-testid="te-biz">
              <span className="text-stone-200">{b.name}</span> <span className="text-stone-500">{b.use} · {b.years.from ?? '?'}–{b.years.to ?? ''} · {b.namePolicy}</span>
            </button>
          ))}
          <div className="grid grid-cols-6 gap-1 items-end">
            <input className={`${inp} col-span-3`} placeholder="Business name" value={nb.name} onChange={(e) => setNb({ ...nb, name: e.target.value })} data-testid="te-nb-name" />
            <select className={`${inp} col-span-2`} value={nb.use} onChange={(e) => setNb({ ...nb, use: e.target.value })}>{USES.map((u) => <option key={u}>{u}</option>)}</select>
            <input className={inp} type="number" value={nb.from} onChange={(e) => setNb({ ...nb, from: e.target.value })} aria-label="Opened" />
            <select className={`${inp} col-span-3`} value={nb.policy} onChange={(e) => setNb({ ...nb, policy: e.target.value as NamePolicy })} aria-label="Name policy">
              <option value="fictional">fictional name</option><option value="near-miss">near-miss (still operating)</option><option value="historical">real name (closed)</option>
            </select>
            <button type="button" className="hv-btn col-span-3" disabled={!nb.name.trim()} onClick={() => { const x = addBusiness(pkg, id, nb.name.trim(), nb.use, { from: Number(nb.from) || undefined }, nb.policy); onEdit(x.pkg); setNb({ ...nb, name: '' }); }} data-testid="te-nb-add">Add occupant</button>
          </div>
        </div>
      </>}
      {f.list === 'businesses' && <>
        <div className="grid grid-cols-2 gap-1">
          <label className="flex flex-col text-[10px] text-stone-500">Use<input className={inp} list="te-uses" value={(r.use as string) ?? ''} onChange={(e) => set({ use: e.target.value }, 'use')} /></label>
          <label className="flex flex-col text-[10px] text-stone-500">Name policy
            <select className={inp} value={r.namePolicy as string} onChange={(e) => set({ namePolicy: e.target.value }, 'policy')}><option value="fictional">fictional</option><option value="near-miss">near-miss</option><option value="historical">historical (closed)</option></select>
          </label>
        </div>
        <datalist id="te-uses">{USES.map((u) => <option key={u} value={u} />)}</datalist>
        <button type="button" className="text-left text-stone-400 underline" onClick={() => onSelect(r.parcelId as string)}>On parcel {r.parcelId as string}</button>
      </>}
      {f.list === 'landmarks' && <p className="text-stone-400">A landmark: never ownable.</p>}
      {f.list === 'institutions' && <p className="text-stone-400">A public institution ({r.kind as string}): never ownable.</p>}
      {(f.list === 'businesses' || f.list === 'landmarks' || f.list === 'institutions' || f.list === 'placements' || f.list === 'streets') && (
        <YearsInput y={r.years as Years | undefined} onChange={(y) => onEdit(setYears(pkg, id, y), `${id}:years`)} />
      )}
      {evd && <>
        <div className="flex items-center gap-1.5"><ConfBadge c={evd.confidence} />
          <select className={`${inp} !w-auto`} value={evd.confidence} onChange={(e) => onEdit(setEvidence(pkg, id, e.target.value as Confidence, evd.source), `${id}:conf`)} data-testid="te-conf">
            {(['verified', 'approximate', 'invented'] as Confidence[]).map((c) => <option key={c} value={c}>{confidenceLabel(c)}</option>)}
          </select></div>
        <label className="flex flex-col text-[10px] text-stone-500">Source (what says so, and what it does not)<textarea className={inp} rows={2} value={evd.source} onChange={(e) => onEdit(setEvidence(pkg, id, evd.confidence, e.target.value), `${id}:src`)} data-testid="te-source" /></label>
      </>}
      {f.list !== 'districts' && f.list !== 'streets' && f.list !== 'routes' && f.list !== 'eraRules' && <>
        <label className="flex flex-col text-[10px] text-stone-500">Art keys (comma separated)
          <input className={inp} list="te-art" value={artText} onChange={(e) => setArtText(e.target.value)} onBlur={() => {
            const keys = artText.split(',').map((x) => x.trim()).filter(Boolean);
            onEdit(f.list === 'placements' ? updateRecord(pkg, id, { art: { ...(art as object), exterior: keys } }) : setArt(pkg, id, keys), `${id}:art`);
          }} data-testid="te-art" />
        </label>
        <datalist id="te-art">{ART_KEYS.map((k) => <option key={k} value={k} />)}</datalist>
        {artList[0] && <AssetImg k={artList[0] as AssetKey} alt="" className="block w-full max-h-28 object-contain rounded border border-noir-700" fallback={<div className="text-stone-500">No such art key here.</div>} />}
      </>}
      <button type="button" className="hv-btn text-rose-300" onClick={onDelete} data-testid="te-delete">Delete {kind}</button>
    </div>
  );
}
