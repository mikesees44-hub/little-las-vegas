/**
 * Layout for the block map's building photos and their name tags, so that
 * nothing piles up: every photo is sized to its own lot (as wide as the
 * footprint, never taller than the lot is deep allows), neighbors on the same
 * row are shrunk or nudged apart until they no longer cover each other, a
 * nearer building never hides more than the lower part of the one behind it,
 * and a photo too small to read at this zoom becomes a dot. Name tags are
 * placed last, in screen-constant size, by priority (selected, yours,
 * researched landmarks, businesses, lots for sale, houses), each in the first
 * free spot round its building (above, below, right, left) — or left off,
 * with the name still on hover. All in world units (meters, y down).
 */

export interface SpriteIn {
  id: string;
  /** The footprint's front edge, middle (where the photo stands). */
  ax: number;
  ay: number;
  /** The facing edge is the top one (the building faces inland): stand just inside it. */
  top?: boolean;
  /** The footprint's height on the screen (meters). */
  ext?: number;
  /** Footprint width and depth, meters. */
  w: number;
  d: number;
  /** Photo height / width, when the photo has loaded. */
  ar?: number;
  /** A sign: drawn small whatever its footprint. */
  sign?: boolean;
  /** Always shown as a photo (selected, being edited). */
  keep?: boolean;
}

export interface Box { x: number; y: number; w: number; h: number }
export interface SpriteOut extends Box { mode: 'photo' | 'dot' }

/** A photo narrower than this many screen pixels is a dot instead. */
export const MIN_PHOTO_PX = 18;

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** The photo's box before it meets its neighbors: as wide as the lot, height capped by the lot. */
export function baseBox(s: SpriteIn): Box {
  const ar = s.ar ?? 0.62;
  let w = s.sign ? 9 : Math.min(s.w, 70) * 1.05;
  let h = w * ar;
  // A tall painting (a church tower, a high school) may stand a little over its lot, not over the block.
  const maxH = s.sign ? 14 : Math.max(s.d * 1.25, w * 0.75, 10);
  if (h > maxH) { h = maxH; w = h / ar; }
  const bottom = s.top ? s.ay + Math.min(h, s.ext ?? h) : s.ay;
  return { x: s.ax - w / 2, y: bottom - h, w, h };
}

/**
 * Sizes and places every photo. `pxPerM` is the current zoom (screen pixels per meter).
 * Returns the box for each id; ids whose photo hasn't loaded come back as a dot.
 */
export function layoutSprites(list: SpriteIn[], pxPerM: number): Map<string, SpriteOut> {
  const boxes = list.map((s) => ({ s, b: baseBox(s) }));
  // Pairwise: same row → shrink to the gap (nudge apart when they stand on the same spot);
  // one in front of the other → the nearer one stops at half the farther one's height.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i].b;
        const B = boxes[j].b;
        const ov = overlap(A, B);
        if (ov <= Math.min(A.w * A.h, B.w * B.h) * 0.06) continue;
        const ayA = A.y + A.h;
        const ayB = B.y + B.h;
        const sameRow = Math.abs(ayA - ayB) < Math.min(A.h, B.h) * 0.45;
        if (sameRow) {
          const ca = A.x + A.w / 2;
          const cb = B.x + B.w / 2;
          let gap = Math.abs(ca - cb);
          const half = (A.w + B.w) / 2;
          let k = gap / half;
          if (k < 0.6) {
            // Practically on the same spot: stand them side by side at 60%.
            k = 0.6;
            const mid = (ca + cb) / 2;
            const left = ca <= cb ? A : B;
            const right = left === A ? B : A;
            const lw = left.w * k;
            const rw = right.w * k;
            left.x = mid - lw - 0.5; right.x = mid + 0.5;
            left.y += left.h * (1 - k); right.y += right.h * (1 - k);
            left.w = lw; left.h *= k; right.w = rw; right.h *= k;
            moved = true;
            continue;
          }
          gap = Math.max(0, gap - 0.5);
          k = Math.min(1, gap / half);
          for (const X of [A, B]) {
            const cx = X.x + X.w / 2;
            const by = X.y + X.h;
            X.w *= k; X.h *= k;
            X.x = cx - X.w / 2; X.y = by - X.h;
          }
          moved = true;
        } else {
          // The nearer one is the one standing lower on the screen.
          const [back, front] = ayA < ayB ? [A, B] : [B, A];
          const limit = back.y + back.h * 0.7;
          if (front.y < limit && front.y + front.h > limit) {
            const by = front.y + front.h;
            const cx = front.x + front.w / 2;
            const nh = Math.max(front.h * 0.5, by - limit);
            if (nh < front.h - 0.01) {
              const k = nh / front.h;
              front.h = nh; front.w *= k; front.x = cx - front.w / 2; front.y = by - nh;
              moved = true;
            }
          }
        }
      }
    }
    if (!moved) break;
  }
  const out = new Map<string, SpriteOut>();
  for (const { s, b } of boxes) {
    const tiny = b.w * pxPerM < MIN_PHOTO_PX && !s.keep;
    out.set(s.id, { ...b, mode: s.ar === undefined || tiny ? 'dot' : 'photo' });
  }
  return out;
}

export interface LabelIn {
  id: string;
  text: string;
  /** Higher first. */
  prio: number;
  /** The building's drawn box (photo, or footprint when a dot). */
  around: Box;
}
export interface LabelOut { x: number; y: number; w: number; h: number; fs: number }

/** Screen size of a name tag. */
export const LABEL_PX = 10.5;

/**
 * Places name tags without overlapping each other (and, where it can, not over
 * another building's photo). Returns the placed tags; those left out show on hover.
 */
export function layoutLabels(list: LabelIn[], obstacles: { id: string; b: Box }[], pxPerM: number): Map<string, LabelOut> {
  const fs = LABEL_PX / Math.max(0.01, pxPerM);
  const placed: Box[] = [];
  const out = new Map<string, LabelOut>();
  const order = [...list].sort((a, b) => b.prio - a.prio || a.around.y - b.around.y);
  for (const l of order) {
    const w = l.text.length * fs * 0.56 + fs * 1.1;
    const h = fs * 1.45;
    const a = l.around;
    const cx = a.x + a.w / 2;
    const gapY = fs * 0.25;
    const cands: Box[] = [
      { x: cx - w / 2, y: a.y - h - gapY, w, h },
      { x: cx - w / 2, y: a.y + a.h + gapY, w, h },
      { x: a.x + a.w + gapY, y: a.y + a.h / 2 - h / 2, w, h },
      { x: a.x - w - gapY, y: a.y + a.h / 2 - h / 2, w, h },
      { x: cx - w / 2, y: a.y - 2 * h - gapY, w, h },
    ];
    const free = (c: Box) => placed.every((p) => overlap(p, c) <= 0);
    const clearOfPhotos = (c: Box) => obstacles.every((o) => o.id === l.id || overlap(o.b, c) < c.w * c.h * 0.2);
    const pick = cands.find((c) => free(c) && clearOfPhotos(c)) ?? cands.slice(0, 2).find(free);
    if (!pick) continue;
    placed.push(pick);
    out.set(l.id, { ...pick, fs });
  }
  return out;
}
