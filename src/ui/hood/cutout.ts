import { useEffect, useState } from 'react';
import { assetUrl, type AssetKey } from './art/assetUrls';
import { quarterRect } from './Turnaround';

/**
 * Building cutouts for the block map: one view of a painting (a quarter of a
 * four-angle sheet, or the whole storefront) with its plain dark backdrop
 * made transparent — a flood fill from the edges that follows the smooth
 * backdrop gradient and stops at the building — then trimmed. Made in the
 * browser from the asset-store image, once per view, and cached.
 */
const cache = new Map<string, Promise<string | undefined>>();

function cut(img: HTMLImageElement, k: AssetKey, quarter: number | undefined): string | undefined {
  const r = quarter === undefined ? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight } : quarterRect(k, quarter);
  const scale = Math.min(1, 520 / r.w);
  const w = Math.max(1, Math.round(r.w * scale));
  const h = Math.max(1, Math.round(r.h * scale));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  if (!cx) return undefined;
  cx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, w, h);
  const data = cx.getImageData(0, 0, w, h);
  const px = data.data;
  // The backdrop's color: the mean of the four corners.
  const corner = [0, w - 1, (h - 1) * w, h * w - 1];
  const bg = [0, 1, 2].map((c) => corner.reduce((a, i) => a + px[i * 4 + c], 0) / 4);
  const far = (i: number) => Math.abs(px[i * 4] - bg[0]) + Math.abs(px[i * 4 + 1] - bg[1]) + Math.abs(px[i * 4 + 2] - bg[2]);
  const step = (i: number, j: number) => Math.abs(px[i * 4] - px[j * 4]) + Math.abs(px[i * 4 + 1] - px[j * 4 + 1]) + Math.abs(px[i * 4 + 2] - px[j * 4 + 2]);
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => { if (!seen[i] && far(i) < 110) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || seen[j]) continue;
      if (step(i, j) < 26 && far(j) < 110) { seen[j] = 1; stack.push(j); }
    }
  }
  // Clear the backdrop; soften the edge by one pixel; find the building's box.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) {
    if (seen[i]) { px[i * 4 + 3] = 0; continue; }
    const x = i % w;
    const y = (i - x) / w;
    const edge = (x > 0 && seen[i - 1]) || (x < w - 1 && seen[i + 1]) || (y > 0 && seen[i - w]) || (y < h - 1 && seen[i + w]);
    if (edge) px[i * 4 + 3] = 150;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < x0 || y1 < y0) return undefined;
  cx.putImageData(data, 0, 0);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')?.drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  try { return out.toDataURL('image/png'); } catch { return undefined; }
}

export function cutoutOf(k: AssetKey, quarter?: number): Promise<string | undefined> {
  const url = assetUrl(k);
  if (!url || typeof document === 'undefined') return Promise.resolve(undefined);
  const id = `${k}:${quarter ?? 'all'}`;
  let p = cache.get(id);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { try { resolve(cut(img, k, quarter)); } catch { resolve(undefined); } };
      img.onerror = () => resolve(undefined);
      img.src = url;
    });
    cache.set(id, p);
  }
  return p;
}

/** The cutout for a view, or undefined while it is made (or when the painting can't load: draw the footprint instead). */
export function useCutout(k: AssetKey | undefined, quarter?: number): string | undefined {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    setSrc(undefined);
    if (k) cutoutOf(k, quarter).then((s) => { if (live) setSrc(s); });
    return () => { live = false; };
  }, [k, quarter]);
  return src;
}
