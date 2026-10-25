import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Drag-to-pan, wheel and pinch zoom for an illustrated map (the South Jersey
 * region map; the same gestures the Wildwood island uses). The committed
 * view maps world units to the host; while a gesture runs, a CSS transform
 * on `layer` moves the already-drawn picture (GPU-composited), and the view
 * is committed — one redraw — when it settles. The drawing should extend
 * past the host's edges by `margin` px so a pan shows real map until then.
 *
 *   host   the element that receives the gestures (its size is the screen)
 *   layer  the element the live transform goes on (holds the SVG)
 *   apply  writes a committed view into the drawing (e.g. a <g transform>)
 *
 * A pointer that moves more than 6px is a drag, never a click (`wasDrag`).
 * Elements inside the host marked `data-pz-ui` are left alone.
 */
export interface View { sc: number; tx: number; ty: number }

export interface PanZoomOpts {
  host: RefObject<HTMLElement>;
  layer: RefObject<HTMLElement>;
  apply: (v: View, margin: number) => void;
  /** Keep the view over the map (centre clamped to world bounds). */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  minSc: number;
  maxSc: number;
}

export function usePanZoom({ host, layer, apply, bounds, minSc, maxSc }: PanZoomOpts) {
  const tf = useRef<View>({ sc: 1, tx: 0, ty: 0 });
  const live = useRef({ k: 1, dx: 0, dy: 0 });
  const marginRef = useRef(300);
  const [margin, setMargin] = useState(300);
  const [sc, setSc] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const anim = useRef(0);
  const moved = useRef(0);
  const opts = useRef({ apply, bounds, minSc, maxSc });
  opts.current = { apply, bounds, minSc, maxSc };

  const size = () => {
    const el = host.current;
    return { W: el?.clientWidth || 800, H: el?.clientHeight || 600 };
  };
  const applyLive = useCallback(() => {
    const l = live.current;
    if (layer.current) layer.current.style.transform = l.k === 1 && !l.dx && !l.dy ? '' : `translate(${l.dx.toFixed(1)}px, ${l.dy.toFixed(1)}px) scale(${l.k.toFixed(4)})`;
  }, [layer]);
  const applyView = useCallback(() => {
    opts.current.apply(tf.current, marginRef.current);
    setSc(tf.current.sc);
  }, []);
  const clamp = useCallback((v: View): View => {
    const { W, H } = size();
    const b = opts.current.bounds;
    const s = Math.min(opts.current.maxSc, Math.max(opts.current.minSc, v.sc));
    const k = s / v.sc;
    // Zoom clamp about the screen centre, then keep the centre inside the bounds.
    const tx = W / 2 - (W / 2 - v.tx) * k;
    const ty = H / 2 - (H / 2 - v.ty) * k;
    const cx = Math.min(b.x1, Math.max(b.x0, (W / 2 - tx) / s));
    const cy = Math.min(b.y1, Math.max(b.y0, (H / 2 - ty) / s));
    return { sc: s, tx: W / 2 - cx * s, ty: H / 2 - cy * s };
  }, []);
  const commit = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = undefined; }
    const l = live.current;
    if (l.k === 1 && !l.dx && !l.dy) return;
    const t = tf.current;
    tf.current = clamp({ sc: t.sc * l.k, tx: l.k * t.tx + l.dx, ty: l.k * t.ty + l.dy });
    live.current = { k: 1, dx: 0, dy: 0 };
    applyLive();
    applyView();
  }, [applyLive, applyView, clamp]);
  const later = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, ms);
  }, [commit]);

  /** Set the view at once (no animation). */
  const setView = useCallback((v: View) => {
    if (anim.current) { cancelAnimationFrame(anim.current); anim.current = 0; }
    live.current = { k: 1, dx: 0, dy: 0 };
    applyLive();
    tf.current = clamp(v);
    applyView();
  }, [applyLive, applyView, clamp]);

  /** The view that fits a world rectangle. */
  const fitView = useCallback((x0: number, y0: number, x1: number, y1: number, pad = 0.92): View => {
    const { W, H } = size();
    const s = Math.min(W / Math.max(1e-6, x1 - x0), H / Math.max(1e-6, y1 - y0)) * pad;
    return { sc: s, tx: W / 2 - ((x0 + x1) / 2) * s, ty: H / 2 - ((y0 + y1) / 2) * s };
  }, []);

  /**
   * Glide to a view with the live (composited) transform, then commit once.
   * `done` runs when it lands (used to hand over to a street-level view).
   */
  const animateTo = useCallback((to: View, ms = 700, done?: () => void, opts2?: { noClamp?: boolean }) => {
    commit();
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = tf.current;
    const target = opts2?.noClamp ? to : clamp(to);
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || ms <= 0) { tf.current = target; applyView(); done?.(); return; }
    const t0 = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = ease(t);
      // Interpolate the scale geometrically and the world point at the screen centre linearly.
      const { W, H } = size();
      const s = from.sc * Math.pow(target.sc / from.sc, e);
      const c0 = [(W / 2 - from.tx) / from.sc, (H / 2 - from.ty) / from.sc];
      const c1 = [(W / 2 - target.tx) / target.sc, (H / 2 - target.ty) / target.sc];
      const cx = c0[0] + (c1[0] - c0[0]) * e;
      const cy = c0[1] + (c1[1] - c0[1]) * e;
      const v = { sc: s, tx: W / 2 - cx * s, ty: H / 2 - cy * s };
      // Express the in-between view as a live transform over the committed one.
      const k = v.sc / from.sc;
      live.current = { k, dx: v.tx - k * from.tx, dy: v.ty - k * from.ty };
      applyLive();
      if (t < 1) anim.current = requestAnimationFrame(step);
      else {
        anim.current = 0;
        live.current = { k: 1, dx: 0, dy: 0 };
        applyLive();
        tf.current = target;
        applyView();
        done?.();
      }
    };
    anim.current = requestAnimationFrame(step);
  }, [applyLive, applyView, clamp, commit]);

  const zoomAt = useCallback((x: number, y: number, f: number, settle = 180) => {
    const l = live.current;
    const total = Math.min(opts.current.maxSc, Math.max(opts.current.minSc, tf.current.sc * l.k * f));
    const k = total / tf.current.sc;
    l.dx = x - ((x - l.dx) * k) / l.k;
    l.dy = y - ((y - l.dy) * k) / l.k;
    l.k = k;
    applyLive();
    later(settle);
  }, [applyLive, later]);

  const zoomBy = useCallback((f: number) => {
    const { W, H } = size();
    zoomAt(W / 2, H / 2, f, 120);
  }, [zoomAt]);

  // The drawing's margin past the edges, within a pixel budget (phones, Retina).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const resize = () => {
      const { W, H } = size();
      const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      const budget = 16e6 / (dpr * dpr);
      let m = Math.round(Math.max(W, H) * 0.6);
      while (m > 160 && (W + 2 * m) * (H + 2 * m) > budget) m -= 40;
      m = Math.max(160, m);
      if (m !== marginRef.current) { marginRef.current = m; setMargin(m); applyView(); }
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [host, applyView]);

  // Pointer pan with inertia, wheel zoom, two-finger pinch.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; cx: number; cy: number } | undefined;
    let vel = { x: 0, y: 0, t: 0 };
    let glide = 0;
    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('[data-pz-ui]')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('[data-pz-ui]')) return;
      if (anim.current) { cancelAnimationFrame(anim.current); anim.current = 0; commit(); }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved.current = 0;
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
        moved.current += 10;
        return;
      }
      moved.current += Math.abs(dx) + Math.abs(dy);
      if (moved.current > 4) {
        const l = live.current;
        l.dx += dx;
        l.dy += dy;
        const now = performance.now();
        const dt = Math.max(1, now - vel.t);
        vel = { x: 0.7 * (dx / dt) + 0.3 * vel.x, y: 0.7 * (dy / dt) + 0.3 * vel.y, t: now };
        applyLive();
        const m = marginRef.current * 0.85;
        if (Math.abs(l.dx) > m || Math.abs(l.dy) > m) commit();
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = undefined;
      if (pts.size) return;
      const fresh = performance.now() - vel.t < 80;
      let vx = fresh ? vel.x * 16 : 0;
      let vy = fresh ? vel.y * 16 : 0;
      if (moved.current > 6 && Math.hypot(vx, vy) > 2) {
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
      if (glide) cancelAnimationFrame(glide);
      if (anim.current) cancelAnimationFrame(anim.current);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [host, zoomAt, applyLive, commit, later]);

  const wasDrag = useCallback(() => moved.current > 6, []);
  return { view: tf, margin, sc, setView, fitView, animateTo, zoomBy, wasDrag };
}
