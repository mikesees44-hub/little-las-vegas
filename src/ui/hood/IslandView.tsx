import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lotOverlay, type HoodOverlay } from '../../engine/hood';
import { HOODS, crossU, type HoodId } from '../../engine/hoodData';
import { hoodBounds, placeAll } from '../../engine/hoodGeo';
import { groupOfBiz, groupOfLot, PROP_GROUP_BY_ID, PROP_GROUPS, type PropGroup } from '../../engine/propertyGroups';
import { USES_BY_ID } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { OWNER_COLOR } from '../map/lotIcons';
import { Building, itemsOf, type Item } from './Buildings';
import { Ground, GroundDefs, PierArches, VIEW_BOUNDS } from './Ground';
import { HoodDashboard } from './HoodDashboard';
import { ISO, P, PLAN, palette, poly, type Mood } from './iso';
import { StreetCard } from './StreetCard';
import { PaintedView, type Scene } from './PaintedView';
import { useShell } from '../shell/context';

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

/** The business-type overlay uses the same groups (and icons) as Holdings and the buy catalog. */
const GROUP_COLOR: Record<PropGroup, string> = {
  hotels: '#4ea8ff', food: '#ff8a3c', nightlife: '#9b5de5', boardwalk: '#ff6f91', shops: '#2fb5a8', gambling: '#e0b84a',
  money: '#5fae7f', building: '#8a8378', transport: '#a0785a', quiet: '#c0392b', homes: '#f2d39a',
};

function groupOfItem(s: GameState, it: Item): PropGroup | undefined {
  if (it.vacant) return undefined;
  if (it.lot) return it.lot.use || it.lot.bizId ? groupOfLot(s, it.lot) : undefined;
  if (it.biz) return groupOfBiz(it.biz.kind);
  return it.useId && USES_BY_ID[it.useId]?.biz ? groupOfBiz(USES_BY_ID[it.useId].biz!) : undefined;
}

function ramp(t: number, a: [number, number, number], b: [number, number, number]): string {
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function tintOf(s: GameState, it: Item, o: HoodOverlay): string | undefined {
  if (o === 'none' || o === 'reputation' || o === 'police') return undefined;
  if (o === 'owner') return it.vacant && !it.forSale ? undefined : it.forSale && !it.mine ? OWNER_COLOR.sale : it.forLease ? OWNER_COLOR.lease : OWNER_COLOR[it.owner] ?? OWNER_COLOR.private;
  if (o === 'category') { const g = groupOfItem(s, it); return g ? GROUP_COLOR[g] : undefined; }
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

/** Detail tiers by zoom (px per meter), and the scale each tier's labels are sized for. */
const TIER_AT = [0.33, 1.9, 4.5];
const TIER_SC = [0.22, 0.9, 2.6, 6];
const tierOf = (sc: number) => (sc < TIER_AT[0] ? 0 : sc < TIER_AT[1] ? 1 : sc < TIER_AT[2] ? 2 : 3);

export function IslandView({ s, onSurvey, onHood, focusHood, land }: { s: GameState; onSurvey?: () => void; onHood?: (id?: HoodId) => void; focusHood?: { id: HoodId; nonce: number }; land?: { scene: Scene; nonce: number } }) {
  const shell = useShell();
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const g = useRef<SVGGElement>(null);
  // The committed view (world → host), and a live CSS transform on top of it while a gesture runs
  // (composited by the GPU; the SVG is redrawn once, when the gesture settles).
  const tf = useRef({ sc: 0.5, tx: 0, ty: 0 });
  const live = useRef({ k: 1, dx: 0, dy: 0 });
  const [margin, setMargin] = useState(400);
  const marginRef = useRef(400);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [tier, setTier] = useState(1);
  const [projMode, setProjMode] = useState<'iso' | 'plan'>(() => (typeof localStorage !== 'undefined' ? pref().proj : undefined) ?? 'iso');
  const [moodSet, setMoodSet] = useState<'auto' | Mood>(() => (typeof localStorage !== 'undefined' ? pref().mood : undefined) ?? 'auto');
  const [overlay, setOverlay] = useState<HoodOverlay>('none');
  const [sel, setSel] = useState<string | undefined>();
  const [hood, setHood] = useState<HoodId | undefined>();
  const [menu, setMenu] = useState(false);
  // Street level: the painted block and Pacific Avenue (live hotspots over the user's art).
  const [scene, setScene] = useState<Scene | undefined>(land?.scene);
  useEffect(() => { if (land) setScene(land.scene); }, [land?.nonce]);
  const pr = projMode === 'iso' ? ISO : PLAN;
  const mood: Mood = moodSet === 'auto' ? moodFor(s) : moodSet;
  const pal = palette(mood);
  const scB = TIER_SC[tier];

  const parcels = useMemo(() => placeAll(s), [s]);
  const items = useMemo(() => itemsOf(s, parcels, pr), [s, parcels, pr]);
  const selItem = sel ? items.find((x) => x.key === sel) : undefined;

  const applyG = useCallback(() => {
    const t = tf.current;
    const m = marginRef.current;
    g.current?.setAttribute('transform', `translate(${(t.tx + m).toFixed(1)} ${(t.ty + m).toFixed(1)}) scale(${t.sc.toFixed(4)})`);
    const nt = tierOf(t.sc);
    setTier((old) => (old === nt ? old : nt));
  }, []);
  const applyLive = useCallback(() => {
    const l = live.current;
    if (layer.current) layer.current.style.transform = l.k === 1 && !l.dx && !l.dy ? '' : `translate(${l.dx.toFixed(1)}px, ${l.dy.toFixed(1)}px) scale(${l.k.toFixed(4)})`;
  }, []);
  /** Keep the middle of the screen over the island and its waters, so it can never be lost. */
  const clampView = useCallback((v: { sc: number; tx: number; ty: number }) => {
    const el = host.current;
    if (!el) return v;
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 600;
    const b = VIEW_BOUNDS(projMode === 'iso' ? ISO : PLAN);
    const cx = Math.min(b.x1 - 400, Math.max(b.x0 + 400, (W / 2 - v.tx) / v.sc));
    const cy = Math.min(b.y1 - 300, Math.max(b.y0 + 300, (H / 2 - v.ty) / v.sc));
    return { sc: v.sc, tx: W / 2 - cx * v.sc, ty: H / 2 - cy * v.sc };
  }, [projMode]);
  const commit = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = undefined; }
    const l = live.current;
    if (l.k === 1 && !l.dx && !l.dy) return;
    const t = tf.current;
    tf.current = clampView({ sc: t.sc * l.k, tx: l.k * t.tx + l.dx, ty: l.k * t.ty + l.dy });
    live.current = { k: 1, dx: 0, dy: 0 };
    applyLive();
    applyG();
  }, [applyG, applyLive, clampView]);
  const later = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, ms);
  }, [commit]);

  // The drawing extends past the edges by a margin, so a pan shows real map until it settles.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const size = () => {
      // Kept within a pixel budget (about 16 megapixels at the screen's density), so phones and
      // Retina screens never rasterize a layer too big for the GPU.
      const W = el.clientWidth || 800;
      const H = el.clientHeight || 600;
      const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      const budget = 16e6 / (dpr * dpr);
      let m = Math.round(Math.max(W, H) * 0.6);
      while (m > 160 && (W + 2 * m) * (H + 2 * m) > budget) m -= 40;
      m = Math.max(160, m);
      if (m !== marginRef.current) { marginRef.current = m; setMargin(m); applyG(); }
    };
    size();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [applyG]);

  const fit = useCallback((x0: number, y0: number, x1: number, y1: number, pad = 0.9) => {
    const el = host.current;
    if (!el) return;
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 600;
    const sc = Math.min(6, Math.max(0.08, Math.min(W / (x1 - x0), H / (y1 - y0)) * pad));
    live.current = { k: 1, dx: 0, dy: 0 };
    applyLive();
    tf.current = { sc, tx: W / 2 - ((x0 + x1) / 2) * sc, ty: H / 2 - ((y0 + y1) / 2) * sc };
    applyG();
  }, [applyG, applyLive]);

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

  const zoomAt = useCallback((x: number, y: number, f: number, settle = 180) => {
    const l = live.current;
    const total = Math.min(8, Math.max(0.08, tf.current.sc * l.k * f));
    const k = total / tf.current.sc;
    l.dx = x - ((x - l.dx) * k) / l.k;
    l.dy = y - ((y - l.dy) * k) / l.k;
    l.k = k;
    applyLive();
    later(settle);
  }, [applyLive, later]);

  // Pan, wheel zoom and pinch.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch: { d: number; cx: number; cy: number } | undefined;
    let vel = { x: 0, y: 0, t: 0 };
    let glide = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('[data-hv-ui]')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (glide) { cancelAnimationFrame(glide); glide = 0; }
      vel = { x: 0, y: 0, t: performance.now() };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const r = el.getBoundingClientRect();
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
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
        zoomAt(pinch.cx, pinch.cy, d / pinch.d, 400);
        pinch.d = d;
        moved += 10;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        const l = live.current;
        l.dx += dx;
        l.dy += dy;
        const now = performance.now();
        const dt = Math.max(1, now - vel.t);
        vel = { x: 0.7 * (dx / dt) + 0.3 * vel.x, y: 0.7 * (dy / dt) + 0.3 * vel.y, t: now };
        applyLive();
        // Past the drawn margin: settle now so the edge never shows for long.
        const m = marginRef.current * 0.85;
        if (Math.abs(l.dx) > m || Math.abs(l.dy) > m) commit();
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = undefined;
      (el as unknown as { _moved: number })._moved = moved;
      if (pts.size) return;
      // A flick keeps going and slows down (inertia), then settles.
      const fresh = performance.now() - vel.t < 80;
      let vx = fresh ? vel.x * 16 : 0;
      let vy = fresh ? vel.y * 16 : 0;
      if (moved > 6 && Math.hypot(vx, vy) > 2) {
        const step = () => {
          const l = live.current;
          l.dx += vx;
          l.dy += vy;
          vx *= 0.86;
          vy *= 0.86;
          applyLive();
          const m = marginRef.current * 0.85;
          if (Math.abs(l.dx) > m || Math.abs(l.dy) > m) commit();
          if (Math.hypot(vx, vy) > 0.5) glide = requestAnimationFrame(step);
          else { glide = 0; later(40); }
        };
        glide = requestAnimationFrame(step);
      } else later(60);
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
  }, [zoomAt, applyLive, commit, later]);

  const wasDrag = () => ((host.current as unknown as { _moved?: number })?._moved ?? 0) > 6;
  const pick = useCallback((key: string) => { if (!wasDrag()) { setSel(key); setMenu(false); } }, []);
  const zoomBtn = (k: number) => {
    const el = host.current;
    if (!el) return;
    zoomAt(el.clientWidth / 2, el.clientHeight / 2, k, 60);
  };

  const ctx = useMemo(() => ({ pr, m: mood, pal, tier }), [pr, mood, tier]);
  const ground = useMemo(() => <Ground pr={pr} pal={pal} mood={mood} tier={tier} sc={scB} />, [pr, mood, tier]);
  const buildings = useMemo(() => items.map((it) => { const g = overlay === 'category' ? groupOfItem(s, it) : undefined; return <Building key={it.key} it={it} c={ctx} sel={it.key === sel} tint={tintOf(s, it, overlay)} badge={g && tier >= 1 ? PROP_GROUP_BY_ID[g].icon : undefined} onPick={pick} />; }), [items, ctx, sel, overlay, s, pick, tier]);
  const labels = useMemo(() => (tier < 2 ? null : (
    <g style={{ pointerEvents: 'none' }} fontWeight="700" textAnchor="middle">
      {items.filter((it) => it.icon).map((it) => {
        const c = P(pr, (it.fp.u0 + it.fp.u1) / 2, it.fp.v0);
        const y = c[1] - (it.fp.h + (it.icon === 'pier' ? 36 : 6)) * pr.hz - 4;
        const ls = 10.5 / scB;
        return <text key={it.key} x={c[0]} y={y} fontSize={ls} fill={it.mine ? '#b8860b' : mood === 'day' ? '#2a1f2e' : '#fff3df'} stroke={mood === 'day' ? '#fffaf0' : '#1b1030'} strokeWidth={ls * 0.25} paintOrder="stroke">{it.name}</text>;
      })}
    </g>
  )), [items, tier, pr, mood]);
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
  }, [overlay, s, pr, tier]);
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
  }), [s, pr, tier, mood, goHood]);

  const tram = useMemo(() => {
    const a = P(pr, crossU('Cresse Ave') + 30, -8);
    const b = P(pr, crossU('16th Ave') - 30, -8);
    return { a, b };
  }, [pr]);

  const legend = overlay === 'owner' ? [['You', OWNER_COLOR.player], ['Manno', OWNER_COLOR.manno], ['Feldstein', OWNER_COLOR.feldstein], ['Kessler', OWNER_COLOR.kessler], ['Philadelphia', OWNER_COLOR.philly], ['The city', OWNER_COLOR.city], ['Independent', OWNER_COLOR.private], ['For sale', OWNER_COLOR.sale], ['For lease', OWNER_COLOR.lease]]
    : overlay === 'category' ? PROP_GROUPS.filter((g) => items.some((it) => groupOfItem(s, it) === g.id)).map((g) => [`${g.icon} ${g.label}`, GROUP_COLOR[g.id]])
    : overlay === 'available' ? [['For sale', '#2ecc71'], ['For lease', '#4ea8ff']]
    : overlay === 'construction' ? [['Going up', '#ff9f1c']]
    : overlay === 'economy' ? [['Losing', 'rgb(226,86,61)'], ['Earning', 'rgb(46,204,113)']]
    : overlay === 'reputation' ? [['Seedy', 'rgb(190,70,70)'], ['Postcard', 'rgb(255,120,190)']]
    : overlay === 'police' ? [['Quiet', 'rgb(120,170,220)'], ['Crawling with cops', 'rgb(20,60,200)']]
    : overlay === 'rival' ? [['Rival-held', OWNER_COLOR.manno], ['Rival pull (area)', 'rgb(200,30,40)']] : [];

  const panelOpen = !!selItem || !!hood;
  return (
    <div className="absolute inset-0 overflow-hidden select-none" data-testid="island-view" data-mood={mood} data-overlay={overlay} data-tier={tier} style={{ background: pal.bay, touchAction: 'none' }}>
      <div ref={host} className="absolute inset-0" onClick={() => { if (!wasDrag()) { setSel(undefined); } }}>
        <div ref={layer} className="absolute" style={{ left: -margin, top: -margin, width: `calc(100% + ${margin * 2}px)`, height: `calc(100% + ${margin * 2}px)`, transformOrigin: `${margin}px ${margin}px`, willChange: 'transform' }}>
          <svg width="100%" height="100%" className="block" style={{ fontFamily: "'Trebuchet MS', system-ui, sans-serif" }}>
            <GroundDefs pal={pal} mood={mood} />
            <g ref={g}>
              {ground}
              {areas}
              {buildings}
              <PierArches pr={pr} mood={mood} tier={tier} sc={scB} />
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
              {labels}
              {hoodPills}
            </g>
          </svg>
        </div>
      </div>
      {scene && <div className="absolute inset-0 z-[998]"><PaintedView s={s} items={items} scene={scene} mood={mood} overlay={overlay} tint={(it) => tintOf(s, it, overlay)} sel={sel} onPick={(k) => { setSel(k); setMenu(false); }} onScene={setScene} onMap={() => setScene(undefined)} /></div>}
      {/* Controls. */}
      <div data-hv-ui className="absolute right-2 top-2 z-[1001] flex flex-col items-end gap-1.5 max-w-[60%]">
        {!scene && <div className="flex flex-wrap justify-end gap-1">
          <button type="button" className="hv-btn hv-on" onClick={() => { setScene('block'); setHood(undefined); onHood?.(undefined); }} title="Down onto the Boardwalk block" data-testid="hv-street">Street level</button>
          <button type="button" className="hv-btn" onClick={() => zoomBtn(1.5)} aria-label="Zoom in">+</button>
          <button type="button" className="hv-btn" onClick={() => zoomBtn(1 / 1.5)} aria-label="Zoom out">−</button>
          <button type="button" className="hv-btn" onClick={whole} title="The whole island">⤢</button>
          <button type="button" className="hv-btn" onClick={() => { home(); setHood(undefined); onHood?.(undefined); }} title="Recenter on the Boardwalk" data-testid="hv-recenter">⌂ Recenter</button>
        </div>}
        <div className="flex gap-1" role="group" aria-label="Light">
          {(['auto', 'day', 'dusk', 'night'] as const).map((m) => (
            <button key={m} type="button" className={`hv-btn ${moodSet === m ? 'hv-on' : ''}`} onClick={() => { setMoodSet(m); savePref({ mood: m }); }} title={m === 'auto' ? 'Follows the heat' : m}>{m === 'auto' ? 'Auto' : m === 'day' ? '☀' : m === 'dusk' ? '◐' : '☾'}</button>
          ))}
        </div>
        {!scene && <div className="flex gap-1">
          <button type="button" className={`hv-btn ${projMode === 'iso' ? 'hv-on' : ''}`} onClick={() => { setProjMode('iso'); savePref({ proj: 'iso' }); }}>2.5D</button>
          <button type="button" className={`hv-btn ${projMode === 'plan' ? 'hv-on' : ''}`} onClick={() => { setProjMode('plan'); savePref({ proj: 'plan' }); }}>Plan</button>
          {onSurvey && <button type="button" className="hv-btn" onClick={onSurvey} title="The survey map (districts)">Survey map</button>}
        </div>}
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
      {!scene && <div data-hv-ui className="absolute left-2 top-11 z-[999] flex flex-nowrap md:flex-wrap gap-1 overflow-x-auto max-w-[52%] md:max-w-[50%] pb-1" data-testid="hv-hoods">
        {HOODS.map((h) => <button key={h.id} type="button" onClick={() => goHood(h.id)} className={`hv-chip ${hood === h.id ? 'hv-on' : ''}`}>{h.name}</button>)}
      </div>}
      {panelOpen && (
        <div data-hv-ui className="absolute z-[1002] panel overflow-y-auto p-3 inset-x-0 bottom-0 max-h-[62%] rounded-b-none md:inset-x-auto md:right-2 md:top-36 md:bottom-12 md:max-h-none md:w-[380px] md:rounded-b-lg llv-slide-right" data-testid="hv-panel">
          {selItem ? <StreetCard s={s} it={selItem} mood={mood} onClose={() => setSel(undefined)} />
            : hood ? <HoodDashboard key={hood} s={s} initial={hood} compact onClose={() => { setHood(undefined); onHood?.(undefined); }} onFull={() => shell.go('town.hoods')} /> : null}
        </div>
      )}
    </div>
  );
}

