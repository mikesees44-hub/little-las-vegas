import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { player } from '../../engine/characters';
import { placeAll } from '../../engine/hoodGeo';
import { findPath, hotspotAt, hotspotLot, hotspotNear, isWalkable, nearestWalkable, walkLight, whoIsAround, type WalkNpc } from '../../engine/walk';
import { BLOCKED, HOTSPOTS, SPAWN, WALKABLE, WALK_H, WALK_W, type Pt, type WalkHotspot } from '../../engine/walkData';
import type { GameState } from '../../engine/types';
import { FACTION_TINT } from '../components/People';
import { OWNER_COLOR } from '../map/lotIcons';
import { Portrait } from '../portrait/Portrait';
import { useTravel } from '../travel/context';
import { AssetImg } from './AssetImg';
import { itemsOf, type Item } from './Buildings';
import { ISO, type Mood } from './iso';
import { usePanZoom } from './usePanZoom';
import { MeetingPicker, WalkNpcCard, WalkSpotCard } from './WalkCard';
import { STRETCHES_BY_ID } from '../../engine/walkStretches';
import { StretchPicker, StretchView } from './StretchView';

/**
 * Walk the Boardwalk: the boss on the street. The user's aerial painting is
 * the ground (fixed angle, no rotation); the hand-authored walkmesh says where
 * he can go (the boards, the pier decks, the streets, the sand by the stairs);
 * the places on it are live records. Click or tap a spot and he walks there
 * along the boards; arrows or WASD on a keyboard. Walk up to a place (or
 * click it) to open its card; walk up to a person to talk.
 *
 * Moving is drawn with refs and one requestAnimationFrame loop (no React
 * render per frame); the pan and zoom are the island's (usePanZoom).
 */

const SPEED = 80; // painting pixels a second
const SECTION = { x0: 380, y0: 420, x1: 1510, y1: 1010 };
/** Where the middle of the screen may go (keeps the painting under the screen). */
const CENTER = { x0: 560, y0: 520, x1: 1300, y1: 760 };
const pts = (p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ');

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};

const AREA_FILL: Record<string, string> = { boards: '#b98a5a', 'hunts-deck': '#9c7146', 'next-deck': '#9c7146', beach: '#ecd8a8', stairs: '#9c7146', 'ocean-ave': '#6d6a66', 'oak-ave': '#6d6a66', 'upper-st': '#6d6a66' };

/** The drawn stand-in when the painting can't load (local dev, tests): sea, land, the walkable ground and the buildings. */
const DrawnGround = memo(function DrawnGround() {
  return (
    <svg viewBox={`0 0 ${WALK_W} ${WALK_H}`} className="absolute inset-0 h-full w-full" data-testid="walk-drawn" aria-hidden>
      <rect width={WALK_W} height={WALK_H} fill="#8fb7a0" />
      <path d={`M1240 0L${WALK_W} 0V${WALK_H}H1180L1260 700L1250 480Z`} fill="#2f7fa8" />
      <path d="M520 1024L780 808L915 688L1090 470L1250 480L1260 700L1180 1024Z" fill="#ecd8a8" />
      {WALKABLE.map((a) => <polygon key={a.id} points={pts(a.poly)} fill={AREA_FILL[a.id] ?? '#b98a5a'} stroke="#5b4630" strokeWidth="1" />)}
      {HOTSPOTS.filter((h) => h.kind !== 'beach').map((h) => <polygon key={h.id} points={pts(h.poly)} fill="#f3c6d6" stroke="#8a4a64" strokeWidth="1.5" />)}
      {BLOCKED.filter((b) => !b.id.startsWith('rail')).map((b) => <polygon key={b.id} points={pts(b.poly)} fill="#d98c6a" stroke="#6a3a2a" strokeWidth="1.5" />)}
    </svg>
  );
});

/** The boss on the boards: his portrait on a little pin, so you always know which one is you. */
const BossToken = memo(function BossToken({ s }: { s: GameState }) {
  const b = player(s);
  return (
    <div className="relative" style={{ width: 30, height: 40 }}>
      <div className="absolute left-1/2 bottom-0 h-2 w-5 -translate-x-1/2 rounded-full bg-black/40 blur-[1px]" />
      <div className="absolute left-1/2 bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-gold-400" />
      <div className="absolute left-0 top-0 h-[30px] w-[30px] overflow-hidden rounded-full border-2 border-gold-400 bg-noir-900 shadow-[0_0_8px_rgba(236,211,143,0.8)]">
        <Portrait c={b} seed={s.seed} date={s.date} size={26} tint={FACTION_TINT[b.faction]} />
      </div>
    </div>
  );
});

const ROLE_COLOR: Record<WalkNpc['role'], string> = { capo: '#ecd38f', manager: '#ecd38f', crew: '#c49a3a', rival: '#e2563d', ear: '#ff9ec7' };

/**
 * Walking the town: the Boardwalk at Hunt's Pier (walkable, over the aerial)
 * or one of the other stretches (StretchView: the painting of the street and
 * its places as cards). "Walk to…" switches between them.
 */
export function WalkView({ s, onClose, initial = 'hunts' }: { s: GameState; onClose: () => void; initial?: string }) {
  const [at, setAt] = useState(STRETCHES_BY_ID[initial] ? initial : 'hunts');
  const st = STRETCHES_BY_ID[at];
  return st
    ? <StretchView key={st.id} s={s} st={st} onClose={onClose} onStretch={setAt} />
    : <HuntsWalk s={s} onClose={onClose} onStretch={setAt} />;
}

function HuntsWalk({ s, onClose, onStretch }: { s: GameState; onClose: () => void; onStretch: (id: string) => void }) {
  const travel = useTravel();
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const token = useRef<HTMLDivElement>(null);
  const apply = useCallback((v: { sc: number; tx: number; ty: number }, m: number) => {
    if (world.current) world.current.style.transform = `translate(${(v.tx + m).toFixed(1)}px, ${(v.ty + m).toFixed(1)}px) scale(${v.sc.toFixed(4)})`;
  }, []);
  const pz = usePanZoom({ host, layer, apply, bounds: CENTER, minSc: 0.5, maxSc: 4 });
  const pzRef = useRef(pz);
  pzRef.current = pz;

  // The boss: where he is, where he is going, what he does when he gets there.
  const pos = useRef<Pt>(SPAWN);
  const path = useRef<Pt[]>([]);
  const arrive = useRef<(() => void) | undefined>(undefined);
  const keys = useRef(new Set<string>());
  const raf = useRef(0);
  const last = useRef(0);
  const lastUi = useRef(0);
  const following = useRef(false);
  const fast = useRef(1);
  const [at, setAt] = useState<Pt>(SPAWN);
  const [goal, setGoal] = useState<Pt | undefined>();
  const [walking, setWalking] = useState(false);
  const [face, setFace] = useState(1);
  const [sel, setSel] = useState<{ spot?: string; npc?: string } | undefined>();
  const [names, setNames] = useState(false);
  const [moodSet, setMoodSet] = useState<'auto' | Mood>('auto');
  const [toast, setToast] = useState<string | undefined>();
  const [meetAll, setMeetAll] = useState(false);
  const [shown, setShown] = useState<'store' | 'inline' | 'fallback' | undefined>();

  const light = walkLight(s);
  const mood: Mood = moodSet === 'auto' ? light.mood : moodSet;
  const npcs = useMemo(() => whoIsAround(s), [s]);
  const items = useMemo(() => itemsOf(s, placeAll(s), ISO), [s]);
  const itemFor = useCallback((h: WalkHotspot): Item | undefined => { const l = hotspotLot(s, h); return l ? items.find((x) => x.key === l.id) : undefined; }, [s, items]);

  const place = (p: Pt) => {
    const el = token.current;
    if (el) el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
  };

  /** Keep him on screen: when he nears an edge, glide the view to put him back in the middle. */
  const follow = useCallback((p: Pt, force = false) => {
    const el = host.current;
    if (!el || following.current) return;
    const z = pzRef.current;
    const v = z.view.current;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const sx = p[0] * v.sc + v.tx;
    const sy = p[1] * v.sc + v.ty;
    if (!force && sx > W * 0.22 && sx < W * 0.78 && sy > H * 0.22 && sy < H * 0.7) return;
    following.current = true;
    z.animateTo({ sc: v.sc, tx: W / 2 - p[0] * v.sc, ty: H * 0.48 - p[1] * v.sc }, 520, () => { following.current = false; });
  }, []);

  const step = useCallback((t: number) => {
    const dt = Math.min(0.05, (t - (last.current || t)) / 1000);
    last.current = t;
    let p = pos.current;
    let moved = false;
    let dx = 0;
    let dy = 0;
    for (const k of keys.current) { const d = KEYS[k]; if (d) { dx += d[0]; dy += d[1]; } }
    if (dx || dy) {
      const l = Math.hypot(dx, dy);
      const sp = SPEED * dt;
      const nx: Pt = [p[0] + (dx / l) * sp, p[1] + (dy / l) * sp];
      // Slide along a wall: try the whole step, then each axis alone.
      const cand: Pt[] = [nx, [nx[0], p[1]], [p[0], nx[1]]];
      const ok = cand.find((c) => isWalkable(c));
      if (ok) { if (ok[0] !== p[0]) setFace(ok[0] > p[0] ? 1 : -1); p = ok; moved = true; }
    } else if (path.current.length) {
      let budget = SPEED * fast.current * dt;
      while (budget > 0 && path.current.length) {
        const q = path.current[0];
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (Math.abs(q[0] - p[0]) > 0.5) setFace(q[0] > p[0] ? 1 : -1);
        if (d <= budget) { p = q; budget -= d; path.current.shift(); } else { p = [p[0] + ((q[0] - p[0]) / d) * budget, p[1] + ((q[1] - p[1]) / d) * budget]; budget = 0; }
      }
      moved = true;
      if (!path.current.length) {
        fast.current = 1;
        setGoal(undefined);
        const cb = arrive.current;
        arrive.current = undefined;
        cb?.();
      }
    }
    pos.current = p;
    place(p);
    if (moved) follow(p);
    if (t - lastUi.current > 140 || !moved) { lastUi.current = t; setAt(p); }
    const busy = keys.current.size > 0 || path.current.length > 0;
    setWalking(busy);
    if (busy) raf.current = requestAnimationFrame(step);
    else { raf.current = 0; last.current = 0; setAt(p); }
  }, [follow]);

  const kick = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(step); }, [step]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast((x) => (x === t ? undefined : x)), 2200); };

  /** Walk to a spot (snapped to the nearest walkable ground), then do `then`. */
  const walkTo = useCallback((target: Pt, then?: () => void, speed = 1) => {
    const from = nearestWalkable(pos.current, 30) ?? SPAWN;
    const to = nearestWalkable(target, 120);
    const p = to ? findPath(from, to) : null;
    if (!p) { flash('You can\'t get there from here.'); return; }
    pos.current = from;
    path.current = p.slice(1);
    arrive.current = then;
    fast.current = speed;
    setGoal(to);
    kick();
  }, [kick]);

  // First view: the whole stretch on a big screen, the boss up close on a phone.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const v = pz.fitView(SECTION.x0 + 120, SECTION.y0, SECTION.x1, SECTION.y1 - 120, 0.98);
    if (el.clientWidth < 640) {
      const sc = Math.max(v.sc * 1.9, 0.9);
      pz.setView({ sc, tx: el.clientWidth / 2 - SPAWN[0] * sc, ty: el.clientHeight * 0.45 - SPAWN[1] * sc });
    } else pz.setView(v);
    place(pos.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrows and WASD; E or Enter goes in.
  const nearRef = useRef<{ spot?: WalkHotspot; npc?: WalkNpc }>({});
  useEffect(() => {
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (KEYS[e.key]) {
        // Walking keys are the boss's here, not the shell's letter shortcuts (D is Diplomacy).
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!keys.current.has(e.key)) { keys.current.add(e.key); path.current = []; arrive.current = undefined; setGoal(undefined); kick(); }
      } else if ((e.key === 'e' || e.key === 'E' || e.key === 'Enter') && (nearRef.current.npc || nearRef.current.spot)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const n = nearRef.current;
        if (n.npc) setSel({ npc: n.npc.charId }); else if (n.spot) setSel({ spot: n.spot.id });
      }
    };
    const up = (e: KeyboardEvent) => { if (KEYS[e.key]) e.stopImmediatePropagation(); keys.current.delete(e.key); };
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); };
  }, [kick]);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; }, []);

  const toWorld = (cx: number, cy: number): Pt => {
    const r = host.current!.getBoundingClientRect();
    const v = pz.view.current;
    return [(cx - r.left - v.tx) / v.sc, (cy - r.top - v.ty) / v.sc];
  };

  const openSpot = (h: WalkHotspot) => walkTo(h.door, () => setSel({ spot: h.id }));
  const openNpc = (n: WalkNpc) => walkTo([n.pos[0] - 12, n.pos[1] + 6], () => setSel({ npc: n.charId }));

  const onGround = (e: React.MouseEvent) => {
    if (pz.wasDrag()) return;
    const p = toWorld(e.clientX, e.clientY);
    const h = hotspotAt(p);
    if (h && h.kind !== 'beach') { openSpot(h); return; }
    setSel(undefined);
    walkTo(p);
  };

  // What he is standing next to.
  const nearNpc = npcs.find((n) => Math.hypot(n.pos[0] - at[0], n.pos[1] - at[1]) < 22);
  const nearSpot = hotspotNear(at);
  nearRef.current = { spot: nearSpot, npc: nearNpc };
  const selSpot = sel?.spot ? HOTSPOTS.find((h) => h.id === sel.spot) : undefined;
  const selNpc = sel?.npc ? npcs.find((n) => n.charId === sel.npc) : undefined;
  const hereName = nearSpot ? (itemFor(nearSpot)?.name ?? nearSpot.label) : 'the boards';

  const tram = () => {
    // The yellow car runs the length of the boards: to whichever end is farther.
    const hunts = HOTSPOTS.find((h) => h.id === 'hunts-pier')!.door;
    const next = HOTSPOTS.find((h) => h.id === 'next-pier')!.door;
    const p = pos.current;
    const to = Math.hypot(p[0] - hunts[0], p[1] - hunts[1]) > Math.hypot(p[0] - next[0], p[1] - next[1]) ? hunts : next;
    setSel(undefined);
    walkTo(to, undefined, 4);
  };

  const filter = (mood === 'night' ? 'brightness(0.48) saturate(0.75) hue-rotate(-12deg)' : mood === 'dusk' ? 'brightness(0.86) saturate(1.15) sepia(0.28)' : 'none') + (light.winter ? ' saturate(0.7) brightness(0.96)' : '');
  const k = Math.min(2.4, Math.max(0.75, 1 / Math.max(0.2, pz.sc)));
  const panel = selSpot || selNpc;
  const hue = (h: WalkHotspot) => { const it = itemFor(h); return it?.mine ? OWNER_COLOR.player : it?.forSale ? OWNER_COLOR.sale : it ? OWNER_COLOR[it.owner] ?? OWNER_COLOR.private : '#5ff2e6'; };

  return (
    <div className="absolute inset-0 overflow-hidden select-none bg-[#2f7fa8]" data-testid="walk-view" data-mood={mood} data-art-shown={shown} style={{ touchAction: 'none' }}>
      <div ref={host} className="absolute inset-0" onClick={onGround} style={{ cursor: walking ? 'progress' : 'pointer' }}>
        <div ref={layer} className="absolute" style={{ left: -pz.margin, top: -pz.margin, width: `calc(100% + ${pz.margin * 2}px)`, height: `calc(100% + ${pz.margin * 2}px)`, transformOrigin: `${pz.margin}px ${pz.margin}px`, willChange: 'transform' }}>
          <div ref={world} className="absolute left-0 top-0" style={{ width: WALK_W, height: WALK_H, transformOrigin: '0 0' }}>
            {/* Past the painting's bottom edge: more town, sand and sea, so a pan never shows a hole. */}
            <div className="pointer-events-none absolute" style={{ left: -700, top: WALK_H - 2, width: WALK_W + 1400, height: 800, background: 'linear-gradient(90deg, #8d8577 0 44%, #dcc79a 44% 77%, #3b84a8 77%)', filter }} />
            {/* 1. The ground: the painting (or the drawn stand-in). */}
            <AssetImg k="walk_aerial_boardwalk" alt="Wildwood from the air: the Boardwalk, Hunt's Pier and the next pier up the beach" className="absolute inset-0 h-full w-full" style={{ filter }} fallback={<DrawnGround />} onShown={setShown} />
            {light.winter && <div className="pointer-events-none absolute inset-0" style={{ background: 'rgba(170,190,215,0.18)' }} />}
            {mood === 'night' && <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 60% 70%, rgba(255,190,90,0.10), rgba(10,18,50,0.35) 70%)' }} />}
            {/* 2. The places: live outlines, labels on hover / when close / with Names on. */}
            <svg viewBox={`0 0 ${WALK_W} ${WALK_H}`} className="absolute inset-0 h-full w-full overflow-visible">
              {goal && <circle cx={goal[0]} cy={goal[1]} r={6} fill="none" stroke="#ecd38f" strokeWidth={2} className="hv-sel" pointerEvents="none" />}
              {HOTSPOTS.map((h) => {
                const on = selSpot?.id === h.id || nearSpot?.id === h.id;
                const c = hue(h);
                return (
                  <g key={h.id}>
                    <polygon points={pts(h.poly)} data-testid="walk-spot" data-spot={h.id}
                      fill={c} fillOpacity={on ? 0.18 : h.kind === 'beach' ? 0 : 0.04} stroke={c} strokeOpacity={on ? 1 : mood === 'night' ? 0.7 : 0.35} strokeWidth={on ? 2.5 : 1.2} strokeDasharray={h.kind === 'beach' ? '6 5' : undefined}
                      style={{ cursor: 'pointer', pointerEvents: h.kind === 'beach' ? 'none' : 'auto' }}
                      onClick={(e) => { e.stopPropagation(); if (pz.wasDrag()) return; setSel(undefined); openSpot(h); }} />
                  </g>
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0">
              {HOTSPOTS.map((h) => {
                const on = names || selSpot?.id === h.id || nearSpot?.id === h.id;
                const it = itemFor(h);
                const y = Math.min(...h.poly.map((p) => p[1]));
                const cx = h.poly.reduce((a, p) => a + p[0], 0) / h.poly.length;
                return (
                  <div key={h.id} className="absolute" style={{ left: h.kind === 'beach' ? h.door[0] : cx, top: h.kind === 'beach' ? h.door[1] - 20 : y - 4, transform: `translate(-50%, -100%) scale(${k})`, transformOrigin: '50% 100%' }} data-testid="walk-label">
                    {on
                      ? <div className="whitespace-nowrap rounded-full border bg-[#1b1030]/90 px-2 py-0.5 text-[10px] font-bold text-[#fff3dc]" style={{ borderColor: hue(h) }}>{it?.name ?? h.label}{it?.forSale && !it.mine ? ' · FOR SALE' : it?.mine ? ' · YOURS' : ''}</div>
                      : <div className="h-2.5 w-2.5 rounded-full border-2 bg-[#1b1030]/80" style={{ borderColor: hue(h) }} />}
                  </div>
                );
              })}
            </div>
            {/* 3. Who's around. */}
            {npcs.map((n) => (
              <button key={n.charId} type="button" data-testid="walk-npc" data-char={n.charId} className="absolute" title={`${n.name}: ${n.doing}`}
                style={{ left: n.pos[0], top: n.pos[1], transform: `translate(-50%, -100%) scale(${k * 0.8})`, transformOrigin: '50% 100%' }}
                onClick={(e) => { e.stopPropagation(); if (pz.wasDrag()) return; openNpc(n); }}>
                <span className="block h-4 w-4 rounded-full border-2 shadow" style={{ borderColor: ROLE_COLOR[n.role], background: FACTION_TINT[n.faction as never] ?? '#2e2a26' }} />
                <span className="mx-auto block h-1.5 w-1 bg-black/50" />
                {(names || nearNpc?.charId === n.charId) && <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1b1030]/90 px-1.5 text-[9px] font-semibold text-[#ffd1e6]">{n.name}</span>}
              </button>
            ))}
            {/* 4. The boss. */}
            <div ref={token} className="pointer-events-none absolute left-0 top-0" data-testid="walk-boss" style={{ transform: `translate(${SPAWN[0]}px, ${SPAWN[1]}px)` }}>
              <div style={{ transform: `translate(-50%, -100%) scale(${k}) scaleX(${face})`, transformOrigin: '50% 100%' }} className={walking ? 'hv-bounce' : undefined}>
                <BossToken s={s} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls. */}
      <div className="absolute left-2 top-11 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5" data-pz-ui>
        <button type="button" className="hv-btn" onClick={onClose} data-testid="walk-exit">← Island map</button>
        <StretchPicker at="hunts" onPick={onStretch} />
        <button type="button" className="hv-btn" onClick={() => pz.zoomBy(1.4)} aria-label="Zoom in">+</button>
        <button type="button" className="hv-btn" onClick={() => pz.zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
        <button type="button" className="hv-btn" onClick={() => follow(pos.current, true)} data-testid="walk-findme">Find me</button>
        <button type="button" className={`hv-btn ${names ? 'hv-on' : ''}`} onClick={() => setNames((x) => !x)}>Names</button>
        <div className="flex gap-1" role="group" aria-label="Light">
          {(['auto', 'day', 'dusk', 'night'] as const).map((m) => <button key={m} type="button" className={`hv-btn ${moodSet === m ? 'hv-on' : ''}`} onClick={() => setMoodSet(m)} title={m === 'auto' ? 'Follows the heat and the season' : m}>{m === 'auto' ? 'Auto' : m === 'day' ? '☀' : m === 'dusk' ? '◐' : '☾'}</button>)}
        </div>
      </div>

      {/* The boss: plan a trip, call a meeting, from wherever he stands. */}
      {!panel && (
        <div className="absolute bottom-14 left-2 sm:bottom-2 sm:left-auto sm:right-2 z-10 max-w-[calc(100%-1rem)] rounded-lg border border-gold-600/50 bg-noir-900/90 p-2 text-xs shadow-lg sm:max-w-[340px]" data-pz-ui data-testid="walk-boss-card">
          {nearNpc || nearSpot ? (
            <button type="button" className="btn-gold mb-1.5 w-full text-xs py-1" onClick={() => setSel(nearNpc ? { npc: nearNpc.charId } : { spot: nearSpot!.id })} data-testid="walk-enter">
              {nearNpc ? `Talk to ${nearNpc.name}` : nearSpot!.kind === 'beach' ? 'Look around the beach' : `Go up to ${hereName}`} <span className="hidden sm:inline opacity-70">(E)</span>
            </button>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={`btn-ghost text-xs py-1 ${meetAll ? 'ring-1 ring-gold-400' : ''}`} onClick={() => setMeetAll((x) => !x)} data-testid="walk-boss-meeting">Call a meeting…</button>
            <button type="button" className="btn-ghost text-xs py-1" disabled={!!s.gameOver} onClick={() => travel.plan(s.playerId)} data-testid="walk-boss-trip">Plan a trip…</button>
          </div>
          {meetAll && <div className="mt-2"><MeetingPicker s={s} place={hereName === 'the boards' ? 'the boards' : hereName} here={npcs.filter((n) => nearSpot && n.at === nearSpot.id)} /></div>}
          <div className="mt-1 text-[10px] text-stone-500">Tap the boards to walk · arrows or WASD · tap a place or a person to go up to them</div>
        </div>
      )}

      {toast && <div className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded bg-noir-900/95 px-3 py-1 text-xs text-amber-200" role="status">{toast}</div>}

      {panel && (
        <div data-pz-ui className="absolute z-20 panel overflow-y-auto p-3 pb-16 md:pb-3 inset-x-0 bottom-0 max-h-[60%] rounded-b-none md:inset-x-auto md:right-2 md:top-20 md:bottom-2 md:max-h-none md:w-[380px] md:rounded-b-lg llv-slide-right" data-testid="walk-panel">
          {selNpc
            ? <WalkNpcCard key={selNpc.charId} s={s} n={selNpc} place={itemFor(HOTSPOTS.find((h) => h.id === selNpc.at)!)?.name ?? HOTSPOTS.find((h) => h.id === selNpc.at)!.label} onClose={() => setSel(undefined)} />
            : selSpot && <WalkSpotCard key={selSpot.id} s={s} h={selSpot} it={itemFor(selSpot)} mood={mood} here={npcs.filter((n) => n.at === selSpot.id)} onClose={() => setSel(undefined)} onNpc={(id) => setSel({ npc: id })} onTram={selSpot.kind === 'tram' ? tram : undefined} />}
        </div>
      )}
    </div>
  );
}
