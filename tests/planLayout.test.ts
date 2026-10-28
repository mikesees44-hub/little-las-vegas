import { describe, expect, it } from 'vitest';
import { baseBox, layoutLabels, layoutSprites, MIN_PHOTO_PX, type Box, type SpriteIn } from '../src/ui/hood/planLayout';

const ov = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

describe('block map layout: photos sized to their lots, kept off each other', () => {
  it('a tall painting is capped by its lot (a church tower does not climb over the next block)', () => {
    const b = baseBox({ id: 'church', ax: 0, ay: 0, w: 20, d: 20, ar: 2.4 });
    expect(b.h).toBeLessThanOrEqual(25.01);
    expect(b.y + b.h).toBeCloseTo(0);
  });

  it('a building facing inland stands just inside its facing edge (a long pier keeps its entrance at the Boardwalk)', () => {
    const b = baseBox({ id: 'pier', ax: 0, ay: 0, w: 40, d: 200, ar: 0.6, top: true, ext: 200 });
    expect(b.y).toBeGreaterThanOrEqual(-0.01);
    expect(b.y + b.h).toBeLessThan(60);
  });

  it('neighbors on one row are shrunk to their gap; two on the same spot stand side by side', () => {
    const list: SpriteIn[] = [
      { id: 'a', ax: 0, ay: 0, w: 30, d: 20, ar: 0.7 },
      { id: 'b', ax: 20, ay: 0, w: 30, d: 20, ar: 0.7 },
      { id: 'c', ax: 80, ay: 0, w: 20, d: 20, ar: 0.7 },
      { id: 'd', ax: 80.5, ay: 0, w: 20, d: 20, ar: 0.7 },
    ];
    const out = layoutSprites(list, 5);
    const ids = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = out.get(ids[i])!;
      const B = out.get(ids[j])!;
      expect(ov(A, B), `${ids[i]}/${ids[j]}`).toBeLessThan(Math.min(A.w * A.h, B.w * B.h) * 0.07);
    }
    for (const id of ids) expect(out.get(id)!.mode).toBe('photo');
  });

  it('a nearer building covers at most the lower third of the one behind it', () => {
    const out = layoutSprites([
      { id: 'back', ax: 0, ay: 0, w: 30, d: 30, ar: 0.8 },
      { id: 'front', ax: 0, ay: 12, w: 30, d: 30, ar: 0.8 },
    ], 5);
    const back = out.get('back')!;
    const front = out.get('front')!;
    expect(front.y).toBeGreaterThanOrEqual(back.y + back.h * 0.7 - 0.01);
  });

  it('far out, a photo too small to read is a dot (the selected one stays a photo)', () => {
    const px = (MIN_PHOTO_PX - 2) / 12;
    const out = layoutSprites([{ id: 'house', ax: 0, ay: 0, w: 11, d: 11, ar: 0.7 }, { id: 'sel', ax: 100, ay: 0, w: 11, d: 11, ar: 0.7, keep: true }, { id: 'unloaded', ax: 200, ay: 0, w: 60, d: 30 }], px);
    expect(out.get('house')!.mode).toBe('dot');
    expect(out.get('sel')!.mode).toBe('photo');
    expect(out.get('unloaded')!.mode).toBe('dot');
  });
});

describe('name tags', () => {
  it('never overlap; the higher priority keeps its place and a crowded one is left off', () => {
    const around = { x: 0, y: 0, w: 10, h: 10 };
    const list = Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, text: `A long place name ${i}`, prio: i === 7 ? 100 : 1, around }));
    const out = layoutLabels(list, [], 2);
    expect(out.has('l7')).toBe(true);
    expect(out.size).toBeLessThan(12);
    const bs = [...out.values()];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(ov(bs[i], bs[j])).toBe(0);
    // Screen-constant: half the zoom, twice the size in meters.
    expect(layoutLabels([list[0]], [], 1).get('l0')!.fs).toBeCloseTo(2 * layoutLabels([list[0]], [], 2).get('l0')!.fs);
  });
});
