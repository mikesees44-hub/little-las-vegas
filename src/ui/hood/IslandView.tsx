import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lotOverlay, type HoodOverlay } from '../../engine/hood';
import { HOODS, crossU, type HoodId } from '../../engine/hoodData';
import { hoodBounds, placeAll } from '../../engine/hoodGeo';
import { USES_BY_ID, type UseCat } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { OWNER_COLOR } from '../map/lotIcons';
import { Building, itemsOf, type Item } from './Buildings';
import { Ground, GroundDefs, VIEW_BOUNDS } from './Ground';
import { HoodDashboard } from './HoodDashboard';
import { ISO, P, PLAN, palette, poly, type Mood } from './iso';
import { StreetCard } from './StreetCard';

/**
 * Wildwood up close: the illustrated 1960 island (the third map level).
 * Streets, the Boardwalk with its tram car, the piers and their rides, the
 * beach, the bay; every building drawn from its record and clickable — a
 * postcard "street view" card with who runs it, the deed and the paperwork.
 * Overlays tint the records (ownership, business type, rival influence,
 * what is available, construction, the economy, reputation, police). It is
 * sunny Doo Wop by day; when the heat rises the island goes to dusk and then
 * to neon on dark.
 */

const OVERLAYS: { id: HoodOverlay; label: string }[] = [
  { id: 'none', label: 'Street view' }, { id: 'owner', label: 'Ownership' }, { id: 'category', label: 'Business type' }, { id: 'rival', label: 'Rival influence' },
  { id: 'available', label: 'Available' }, { id: 'construction', label: 'Construction' }, { id: 'economy', label: 'Economy' }, { id: 'reputation', label: 'Reputation' }, { id: 'police', label: 'Police' },
];

const CAT_COLOR: Record<UseCat, string> = { boardwalk: '#ff6f91', services: '#4ea8ff', music: '#9b5de5', realestate: '#f2c14e', industrial: '#8a8378', food: '#ff8a3c', public: '#2fb5a8' };

function ramp(t: number, a: [number, number, number], b: [number, number, number]): string {
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function tintOf(s: GameState, it: Item, o: HoodOverlay): string | undefined {
  if (o === 'none' || o === 'reputation' || o === 'police') return undefined;
  if (o === 'owner') return it.vacant && !it.forSale ? undefined : it.forSale && !it.mine ? OWNER_COLOR.sale : it.forLease ? OWNER_COLOR.lease : OWNER_COLOR[it.owner] ?? OWNER_COLOR.private;
  if (o === 'category') { const c = it.useId ? USES_BY_ID[it.useId]?.cat : undefined; return c ? CAT_COLOR[c] : undefined; }
  if (!it.lot) return o === 'available' || o === 'construction' ? undefined : OWNER_COLOR.player;
  const v = lotOverlay(s, it.lot, o);
  if (o === 'available') return v ? (it.forLease ? '#4ea8ff' : '#2ecc71') : undefined;
  if (o === 'construction') return v ? '#ff9f1c' : undefined;
  if (o === 'rival') return it.lot.status === 'rival' ? OWNER_COLOR[it.owner] : undefined;
  if (o === 'economy') return v > 0 ? ramp(v, [226, 86, 61], [46, 204, 113]) : undefined;
  return undefined;
}

function moodFor(s: GameState): Mood {
  const h = Math.max(s.heat.local, s.heat.federal * 0.8);
  return h >= 80 ? 'night' : h >= 55 ? 'dusk' : 'day';
}

const LS = 'llv:island';
function pref(): { proj?: 'iso' | 'plan'; mood?: 'auto' | Mood } {
  try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; }
}
function savePref(p: { proj?: 'iso' | 'plan'; mood?: 'auto' | Mood }): void {
  try { localStorage.setItem(LS, JSON.stringify({ ...pref(), ...p })); } catch { /* private window */ }
}

export function IslandView({ s, onSurvey, onHood, focusHood }: { s: GameState; onSurvey?: () => void; onHood?: (id?: HoodId) => void; focusHood?: { id: HoodId; nonce: number } }) {
  const host = useRef<HTMLDivElement>(null);
  const g = useRef<SVGGElement>(null);
  const tf = useRef({ sc: 0.5, tx: 0, ty: 0 });
  const [zb, setZb] = useState(-2);
  const [projMode, setProjMode] = useState<'iso' | 'plan'>(() => (typeof localStorage !== 'undefined' ? pref().proj : undefined) ?? 'iso');
  const [moodSet, setMoodSet] = useState<'auto' | Mood>(() => (typeof localStorage !== 'undefined' ? pref().mood : undefined) ?? 'auto');
  const [overlay, setOverlay] = useState<HoodOverlay>('none');
  const [sel, setSel] = useState<string | undefined>();
  const [hood, setHood] = useState<HoodId | undefined>();
  const [menu, setMenu] = useState(false);
  const pr = projMode === 'iso' ? ISO : PLAN;
  const mood: Mood = moodSet === 'auto' ? moodFor(s) : moodSet;
  const pal = palette(mood);
  const scB = 1.4 ** zb;
  const tier = scB < 0.33 ? 0 : scB < 1.9 ? 1 : 2;

  const parcels = useMemo(() => placeAll(s), [s]);
  const items = useMemo(() => itemsOf(s, parcels, pr), [s, parcels, pr]);
  const selItem = sel ? items.find((x) => x.key === sel) : undefined;

  const apply = useCallback(() => {
    const t = tf.current;
    g.current?.setAttribute('transform', `translate(${t.tx.toFixed(1)} ${t.ty.toFixed(1)}) scale(${t.sc.toFixed(4)})`);
    const b = Math.round(Math.log(t.sc) / Math.log(1.4));
    setZb((old) => (old === b ? old : b));
  }, []);

  const fit = useCallback((x0: number, y0: number, x1: number, y1: number, pad = 0.9) => {
    const el = host.current;
    if (!el) return;
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 600;
    const sc = Math.min(6, Math.max(0.08, Math.min(W / (x1 - x0), H / (y1 - y0)) * pad));
    tf.current = { sc, tx: W / 2 - ((x0 + x1) / 2) * sc, ty: H / 2 - ((y0 + y1) / 2) * sc };
    apply();
  }, [apply]);

  const fitUV = useCallback((u0: number, u1: number, v0: number, v1: number, pad = 0.9) => {
    const pts = [P(pr, u0, v0), P(pr, u1, v0), P(pr, u1, v1), P(pr, u0, v1), P(pr, u0, v0, 30), P(pr, u1, v0, 30)];
    fit(Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), pad);
  }, [fit, pr]);

  const home = useCallback(() => fitUV(crossU('Spicer Ave') - 20, crossU('Garfield Ave') + 40, -170, 120, 1), [fitUV]);
  const whole = useCallback(() => { const b = VIEW_BOUNDS(pr); fit(b.x0 + 700, b.y0 + 200, b.x1 - 300, b.y1 - 600, 1.05); }, [fit, pr]);

  // First view: the Boardwalk.
  useEffect(() => { home(); }, [projMode]);
  const goHood = useCallback((id: HoodId | undefined) => {
    setHood(id);
    onHood?.(id);
    if (!id) return;
    setSel(undefined);
    const b = hoodBounds(s, id);
    if (b) fitUV(b.u0, b.u1, b.v0 - (id === 'boardwalk' ? 280 : 0), b.v1, 0.95);
  }, [s, fitUV, onHood]);
  useEffect(() => { if (focusHood) goHood(focusHood.id); }, [focusHood?.nonce]);

  // Pan, wheel zoom and pinch.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch: { d: number; sc: number; cx: number; cy: number } | undefined;
    const zoomAt = (x: number, y: number, k: number) => {
      const t = tf.current;
      const sc = Math.min(8, Math.max(0.08, t.sc * k));
      t.tx = x - ((x - t.tx) * sc) / t.sc;
      t.ty = y - ((y - t.ty) * sc) / t.sc;
      t.sc = sc;
      apply();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('[data-hv-ui]')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const r = el.getBoundingClientRect();
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), sc: tf.current.sc, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(pinch.cx, pinch.cy, (pinch.sc * (d / pinch.d)) / tf.current.sc);
        moved += 10;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        tf.current.tx += dx;
        tf.current.ty += dy;
        apply();
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = undefined;
      (el as unknown as { _moved: number })._moved = moved;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [apply]);

  const wasDrag = () => ((host.current as unknown as { _moved?: number })?._moved ?? 0) > 6;
  const pick = useCallback((key: string) => { if (!wasDrag()) { setSel(key); setMenu(false); } }, []);
  const zoomBtn = (k: number) => {
    const el = host.current;
    if (!el) return;
    const t = tf.current;
    const x = el.clientWidth / 2;
    const y = el.clientHeight / 2;
    const sc = Math.min(8, Math.max(0.08, t.sc * k));
    t.tx = x - ((x - t.tx) * sc) / t.sc;
    t.ty = y - ((y - t.ty) * sc) / t.sc;
    t.sc = sc;
    apply();
  };

  const ctx = useMemo(() => ({ pr, m: mood, pal, tier, ls: 10.5 / scB }), [pr, mood, tier, zb]);
  const ground = useMemo(() => <Ground pr={pr} pal={pal} mood={mood} tier={tier} sc={scB} />, [pr, mood, tier, zb]);
  const areas = useMemo(() => {
    if (overlay !== 'reputation' && overlay !== 'police' && overlay !== 'rival') return null;
    return HOODS.map((h) => {
      const b = hoodBounds(s, h.id);
      const st = s.hood?.stats[h.id];
      if (!b || !st) return null;
      const t = overlay === 'reputation' ? st.rep / 100 : overlay === 'police' ? st.police / 100 : Math.max(0, ...(['manno', 'feldstein', 'kessler', 'philly'] as const).map((r) => s.districts.find((d) => d.id === h.district)?.influence[r] ?? 0)) / 100;
      const col = overlay === 'reputation' ? ramp(t, [190, 70, 70], [255, 120, 190]) : overlay === 'police' ? ramp(t, [120, 170, 220], [20, 60, 200]) : ramp(t, [200, 190, 170], [200, 30, 40]);
      const d = poly([P(pr, b.u0, b.v0), P(pr, b.u1, b.v0), P(pr, b.u1, b.v1), P(pr, b.u0, b.v1)]);
      const [x, y] = P(pr, (b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2);
      return <g key={h.id}><path d={d} fill={col} opacity={0.18 + t * 0.4} stroke={col} strokeWidth={2 / scB} /><text x={x} y={y} fontSize={13 / scB} textAnchor="middle" fill="#fff" stroke="#1b1030" strokeWidth={3 / scB} paintOrder="stroke" fontWeight="700">{Math.round(t * 100)}</text></g>;
    });
  }, [overlay, s, pr, zb]);
  const hoodPills = useMemo(() => tier >= 1 ? null : HOODS.map((h) => {
    const b = hoodBounds(s, h.id);
    if (!b) return null;
    const [x, y] = P(pr, (b.u0 + b.u1) / 2, h.id === 'boardwalk' ? -200 : (b.v0 + b.v1) / 2, 40);
    const fsz = 11 / scB;
    const w = h.name.length * fsz * 0.6 + fsz * 1.6;
    return (
      <g key={h.id} data-testid={`hv-hood-${h.id}`} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); if (!wasDrag()) goHood(h.id); }}>
        <rect x={x - w / 2} y={y - fsz * 1.1} width={w} height={fsz * 1.6} rx={fsz * 0.8} fill={mood === 'day' ? '#fffaf0' : '#1b1030'} stroke={mood === 'day' ? '#c2185b' : '#ff5fa2'} strokeWidth={fsz * 0.12} opacity="0.95" />
        <text x={x} y={y} fontSize={fsz} textAnchor="middle" fill={mood === 'day' ? '#c2185b' : '#ffd1e6'} fontWeight="700">{h.name}</text>
      </g>
    );
  }), [s, pr, tier, zb, mood, goHood]);

  const tram = useMemo(() => {
    const a = P(pr, crossU('Cresse Ave') + 30, -8);
    const b = P(pr, crossU('16th Ave') - 30, -8);
    return { a, b };
  }, [pr]);

  const legend = overlay === 'owner' ? [['You', OWNER_COLOR.player], ['Manno', OWNER_COLOR.manno], ['Feldstein', OWNER_COLOR.feldstein], ['Kessler', OWNER_COLOR.kessler], ['Philadelphia', OWNER_COLOR.philly], ['The city', OWNER_COLOR.city], ['Independent', OWNER_COLOR.private], ['For sale', OWNER_COLOR.sale], ['For lease', OWNER_COLOR.lease]]
    : overlay === 'category' ? (Object.keys(CAT_COLOR) as UseCat[]).map((c) => [c[0].toUpperCase() + c.slice(1), CAT_COLOR[c]])
    : overlay === 'available' ? [['For sale', '#2ecc71'], ['For lease', '#4ea8ff']]
    : overlay === 'construction' ? [['Going up', '#ff9f1c']]
    : overlay === 'economy' ? [['Losing', 'rgb(226,86,61)'], ['Earning', 'rgb(46,204,113)']]
    : overlay === 'reputation' ? [['Seedy', 'rgb(190,70,70)'], ['Postcard', 'rgb(255,120,190)']]
    : overlay === 'police' ? [['Quiet', 'rgb(120,170,220)'], ['Crawling with cops', 'rgb(20,60,200)']]
    : overlay === 'rival' ? [['Rival-held', OWNER_COLOR.manno], ['Rival pull (area)', 'rgb(200,30,40)']] : [];

  const panelOpen = !!selItem || !!hood;
  return (
    <div className="absolute inset-0 overflow-hidden select-none" data-testid="island-view" data-mood={mood} data-overlay={overlay} style={{ background: pal.bay, touchAction: 'none' }}>
      <div ref={host} className="absolute inset-0" onClick={() => { if (!wasDrag()) { setSel(undefined); } }}>
        <svg width="100%" height="100%" className="block" style={{ fontFamily: "'Trebuchet MS', system-ui, sans-serif" }}>
          <GroundDefs pal={pal} mood={mood} />
          <g ref={g}>
            {ground}
            {areas}
            {items.map((it) => <Building key={it.key} it={it} c={ctx} sel={it.key === sel} tint={tintOf(s, it, overlay)} label={tier >= 2 && !!it.icon} onPick={pick} />)}
            {tier >= 1 && (
              <g className="hv-tram" style={{ ['--tx' as string]: `${tram.b[0] - tram.a[0]}px`, ['--ty' as string]: `${tram.b[1] - tram.a[1]}px` }} pointerEvents="none">
                <g transform={`translate(${tram.a[0]} ${tram.a[1]})`}>
                  <rect x="-9" y="-6" width="7" height="4.5" rx="1" fill="#ffd34d" stroke="#1d4f91" strokeWidth="0.5" />
                  <rect x="-1.5" y="-6" width="7" height="4.5" rx="1" fill="#ffd34d" stroke="#1d4f91" strokeWidth="0.5" />
                  <rect x="6" y="-6" width="7" height="4.5" rx="1" fill="#ffd34d" stroke="#1d4f91" strokeWidth="0.5" />
                  <path d="M-9 -6h22" stroke="#1d4f91" strokeWidth="1.2" />
                  {mood !== 'day' && <circle cx="14" cy="-3.5" r="2.5" fill="#fff3b0" opacity="0.8" />}
                </g>
              </g>
            )}
            {hoodPills}
          </g>
        </svg>
      </div>
      {/* Controls. */}
      <div data-hv-ui className="absolute right-2 top-2 z-[1001] flex flex-col items-end gap-1.5 max-w-[60%]">
        <div className="flex gap-1">
          <button type="button" className="hv-btn" onClick={() => zoomBtn(1.5)} aria-label="Zoom in">+</button>
          <button type="button" className="hv-btn" onClick={() => zoomBtn(1 / 1.5)} aria-label="Zoom out">−</button>
          <button type="button" className="hv-btn" onClick={whole} title="The whole island">⤢</button>
          <button type="button" className="hv-btn" onClick={() => { home(); setHood(undefined); onHood?.(undefined); }} title="Back to the Boardwalk">⌂</button>
        </div>
        <div className="flex gap-1" role="group" aria-label="Light">
          {(['auto', 'day', 'dusk', 'night'] as const).map((m) => (
            <button key={m} type="button" className={`hv-btn ${moodSet === m ? 'hv-on' : ''}`} onClick={() => { setMoodSet(m); savePref({ mood: m }); }} title={m === 'auto' ? 'Follows the heat' : m}>{m === 'auto' ? 'Auto' : m === 'day' ? '☀' : m === 'dusk' ? '◐' : '☾'}</button>
          ))}
        </div>
        <div className="flex gap-1">
          <button type="button" className={`hv-btn ${projMode === 'iso' ? 'hv-on' : ''}`} onClick={() => { setProjMode('iso'); savePref({ proj: 'iso' }); }}>2.5D</button>
          <button type="button" className={`hv-btn ${projMode === 'plan' ? 'hv-on' : ''}`} onClick={() => { setProjMode('plan'); savePref({ proj: 'plan' }); }}>Plan</button>
          {onSurvey && <button type="button" className="hv-btn" onClick={onSurvey} title="The survey map (districts)">Survey map</button>}
        </div>
        <div className="relative">
          <button type="button" className="hv-btn hv-on" onClick={() => setMenu((x) => !x)} aria-expanded={menu} data-testid="hv-overlay-btn">Overlay: {OVERLAYS.find((o) => o.id === overlay)?.label} ▾</button>
          {menu && (
            <div className="absolute right-0 mt-1 w-44 rounded border border-noir-600 bg-noir-900/95 p-1 shadow-xl" role="menu">
              {OVERLAYS.map((o) => <button key={o.id} type="button" role="menuitem" data-testid={`hv-ov-${o.id}`} onClick={() => { setOverlay(o.id); setMenu(false); }} className={`block w-full text-left rounded px-2 py-1 text-xs ${overlay === o.id ? 'text-gold-300 bg-gold-500/10' : 'text-stone-300 hover:bg-noir-800'}`}>{o.label}</button>)}
            </div>
          )}
        </div>
        {legend.length > 0 && (
          <div className="rounded bg-noir-900/90 border border-noir-700 px-2 py-1 text-[10px] text-stone-300" data-testid="hv-legend">
            {legend.map(([t, c]) => <div key={t} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{t}</div>)}
          </div>
        )}
        {moodSet === 'auto' && mood !== 'day' && <div className="rounded bg-noir-900/90 border border-blood-500/60 px-2 py-1 text-[10px] text-rose-200 max-w-[220px]">The heat is on. The island looks different after dark.</div>}
      </div>
      <div data-hv-ui className="absolute left-2 top-11 z-[999] flex flex-wrap gap-1 max-w-[55%] md:max-w-[50%]" data-testid="hv-hoods">
        {HOODS.map((h) => <button key={h.id} type="button" onClick={() => goHood(h.id)} className={`hv-chip ${hood === h.id ? 'hv-on' : ''}`}>{h.name}</button>)}
      </div>
      {panelOpen && (
        <div data-hv-ui className="absolute z-[1002] panel overflow-y-auto p-3 inset-x-0 bottom-0 max-h-[62%] rounded-b-none md:inset-x-auto md:right-2 md:top-36 md:bottom-12 md:max-h-none md:w-[380px] md:rounded-b-lg llv-slide-right" data-testid="hv-panel">
          {selItem ? <StreetCard s={s} it={selItem} mood={mood} onClose={() => setSel(undefined)} />
            : hood ? <HoodDashboard key={hood} s={s} initial={hood} compact onClose={() => { setHood(undefined); onHood?.(undefined); }} /> : null}
        </div>
      )}
    </div>
  );
}

