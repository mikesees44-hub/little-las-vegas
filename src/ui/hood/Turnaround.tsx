import { useRef, useState, type ReactNode } from 'react';
import { ASSET_SIZE, TURNAROUND_SPLIT, type AssetKey } from './art/assetUrls';
import { useAssetSrc } from './AssetImg';

const ANGLE = ['Front', 'Corner', 'Side', 'Back'];
/** Around the building: the sheet's quarters in walking order. */
const ORDER = [0, 1, 3, 2];

/** One quarter of a 2×2 sheet, in image pixels, trimmed past the divider lines. */
export function quarterRect(k: AssetKey, q: number): { x: number; y: number; w: number; h: number; W: number; H: number } {
  const [W, H] = ASSET_SIZE[k] ?? [1536, 1024];
  const sp = TURNAROUND_SPLIT[k] ?? { cx: 0.5, cy: 0.5 };
  const cx = sp.cx * W;
  const cy = sp.cy * H;
  const t = 7;
  const right = q % 2 === 1;
  const low = q >= 2;
  const x = right ? cx + t : t;
  const y = low ? cy + t : t;
  const w = (right ? W - cx : cx) - 2 * t;
  const h = (low ? H - cy : cy) - 2 * t;
  return { x, y, w, h, W, H };
}

/**
 * The four-angle viewer: one of the turnaround sheet's quarters at a time,
 * cropped out of the single image; the arrows (or a swipe, or ←/→) walk you
 * round the building — almost 3D. Falls back to `fallback` (the drawn
 * postcard) when the sheet can't be loaded.
 */
export function Turnaround({ k, name, fallback }: { k: AssetKey; name: string; fallback: ReactNode }) {
  const a = useAssetSrc(k);
  const [i, setI] = useState(0);
  const drag = useRef<number | undefined>();
  if (!a.src) return <>{fallback}</>;
  const q = ORDER[i];
  const r = quarterRect(k, q);
  const turn = (d: number) => setI((x) => (x + d + 4) % 4);
  return (
    <div
      className="relative overflow-hidden bg-[#0b1430] select-none touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[#5ff2e6]"
      style={{ aspectRatio: `${r.w} / ${r.h}` }}
      tabIndex={0}
      data-testid="turnaround" data-angle={i}
      aria-label={`${name}: ${ANGLE[i]} view. Use the arrows to walk round it.`}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') { turn(-1); e.preventDefault(); } if (e.key === 'ArrowRight') { turn(1); e.preventDefault(); } }}
      onPointerDown={(e) => { drag.current = e.clientX; }}
      onPointerUp={(e) => { if (drag.current !== undefined && Math.abs(e.clientX - drag.current) > 40) turn(e.clientX < drag.current ? 1 : -1); drag.current = undefined; }}
    >
      <img
        key={q} src={a.src} alt={`${name}, ${ANGLE[i].toLowerCase()} view`} draggable={false} onError={a.onError} onLoad={a.onLoad}
        className="absolute max-w-none llv-turn"
        style={{ width: `${(r.W / r.w) * 100}%`, height: `${(r.H / r.h) * 100}%`, left: `${(-r.x / r.w) * 100}%`, top: `${(-r.y / r.h) * 100}%` }}
      />
      <button type="button" aria-label="Walk round to the left" onClick={() => turn(-1)} data-testid="turn-left"
        className="absolute left-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-[#1b1030]/80 border border-[#5ff2e6]/70 text-[#c9fffa] text-lg leading-none hover:bg-[#1b1030]">‹</button>
      <button type="button" aria-label="Walk round to the right" onClick={() => turn(1)} data-testid="turn-right"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-[#1b1030]/80 border border-[#5ff2e6]/70 text-[#c9fffa] text-lg leading-none hover:bg-[#1b1030]">›</button>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[#1b1030]/80 px-2 py-0.5 text-[10px] text-[#ffd1e6]">
        {ANGLE.map((t, j) => <span key={t} className={`inline-block h-1.5 w-1.5 rounded-full ${j === i ? 'bg-[#ff5fa2]' : 'bg-stone-500'}`} />)}
        <span className="ml-1">{ANGLE[i]} · ↻ 4 angles</span>
      </div>
    </div>
  );
}
