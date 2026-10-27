import { describe, expect, it } from 'vitest';
import { BLOCKED, HOTSPOTS, REACH, SPAWN, WALKABLE, type Pt } from '../src/engine/walkData';
import { centroid, distToPoly, findPath, hotspotLot, hotspotNear, isWalkable, lineWalkable, nearestWalkable, pathLength, pointInPoly, walkGrid, whoIsAround } from '../src/engine/walk';
import { newGame } from '../src/engine/newGame';
import { placeAll } from '../src/engine/hoodGeo';

/** Every point along a path, a few pixels apart. */
function along(p: Pt[], step = 1.5): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < p.length; i++) {
    const [a, b] = [p[i - 1], p[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

describe('walking the Boardwalk: the walkmesh', () => {
  it('the boss starts on the boards, and the ocean and the buildings are not walkable', () => {
    expect(isWalkable(SPAWN)).toBe(true);
    expect(WALKABLE.find((a) => a.id === 'boards') && pointInPoly(SPAWN, WALKABLE.find((a) => a.id === 'boards')!.poly)).toBe(true);
    // Out in the surf, in the bay, inside the Flyer's structure, inside the tram kiosk, inside the hotel.
    for (const p of [[1400, 620], [1500, 950], [100, 200], [1100, 740], [983, 577], [790, 600]] as Pt[]) expect(isWalkable(p), String(p)).toBe(false);
    for (const b of BLOCKED) expect(isWalkable(centroid(b.poly)), b.id).toBe(false);
    const g = walkGrid();
    const n = g.walk.reduce((a, x) => a + x, 0);
    expect(n).toBeGreaterThan(3000);
  });

  it('every hotspot has a walkable door within reach of it, and the boss can walk there from the pier', () => {
    expect(HOTSPOTS.length).toBeGreaterThanOrEqual(12);
    const ids = new Set(HOTSPOTS.map((h) => h.id));
    expect(ids.size).toBe(HOTSPOTS.length);
    for (const id of ['hunts-pier', 'flyer', 'castle-dungeon', 'tram-stop', 'beach', 'next-pier']) expect(ids.has(id), id).toBe(true);
    for (const h of HOTSPOTS) {
      expect(isWalkable(h.door), `${h.id} door`).toBe(true);
      expect(distToPoly(h.door, h.poly), `${h.id} reach`).toBeLessThanOrEqual(REACH);
      const p = findPath(SPAWN, h.door);
      expect(p, `${h.id} path`).not.toBeNull();
      expect(hotspotNear(h.door)?.id, `${h.id} near`).toBe(h.id);
    }
  });

  it('finds the way up the boards to the next pier, and the way is all walkable', () => {
    const next = HOTSPOTS.find((h) => h.id === 'next-pier')!;
    const p = findPath(SPAWN, next.door)!;
    expect(p).not.toBeNull();
    expect(pathLength(p)).toBeGreaterThan(400);
    for (let i = 1; i < p.length; i++) expect(lineWalkable(p[i - 1], p[i])).toBe(true);
    for (const q of along(p)) for (const b of BLOCKED) expect(pointInPoly(q, b.poly), `${b.id} at ${q}`).toBe(false);
  });

  it('never walks through a building or over the railing: the beach is reached by the stairs', () => {
    // Into a building: no way.
    expect(findPath(SPAWN, [1100, 740])).toBeNull();
    expect(findPath(SPAWN, centroid(BLOCKED.find((b) => b.id === 'tram-kiosk')!.poly))).toBeNull();
    // Onto the sand from right beside the railing: round by the stairs.
    const from: Pt = [930, 640];
    const to: Pt = [960, 660];
    expect(isWalkable(from) && isWalkable(to)).toBe(true);
    const p = findPath(from, to)!;
    expect(p).not.toBeNull();
    const stairs = WALKABLE.find((a) => a.id === 'stairs')!.poly;
    expect(along(p).some((q) => pointInPoly(q, stairs))).toBe(true);
    expect(pathLength(p)).toBeGreaterThan(Math.hypot(30, 20) * 3);
    // From the boards out to the end of Hunt's Pier: past the carousel and the pavilion, not through them.
    const end = HOTSPOTS.find((h) => h.id === 'castle-dungeon')!.door;
    const q = findPath(SPAWN, end)!;
    for (const pt of along(q)) for (const id of ['carousel', 'pavilion', 'flyer', 'hunts-gate']) expect(pointInPoly(pt, BLOCKED.find((b) => b.id === id)!.poly), id).toBe(false);
  });

  it('snaps a click on the water or a roof to the nearest walkable spot', () => {
    const p = nearestWalkable([1300, 600], 120);
    expect(p && isWalkable(p)).toBe(true);
    expect(nearestWalkable([100, 100], 40)).toBeUndefined();
  });
});

describe('walking the Boardwalk: the places are game records', () => {
  const s = newGame('walk-1');
  it('links the businesses to real lots (new Ocean Avenue lots included), drawn on the island', () => {
    const placed = placeAll(s);
    for (const h of HOTSPOTS.filter((x) => x.kind === 'business' || x.lots)) {
      const l = hotspotLot(s, h);
      expect(l, h.id).toBeDefined();
      expect(placed.has(l!.id), h.id).toBe(true);
    }
    // Something to buy on the stretch: the Pelican Court is for sale.
    expect(hotspotLot(s, HOTSPOTS.find((h) => h.id === 'pelican')!)?.status).toBe('sale');
    // Landmarks are not for sale.
    for (const h of HOTSPOTS.filter((x) => x.landmark)) expect(h.lots).toBeUndefined();
  });

  it('puts a few people on the street, each standing on walkable ground by a place', () => {
    const npcs = whoIsAround(s);
    expect(npcs.length).toBeLessThanOrEqual(7);
    for (const n of npcs) {
      expect(isWalkable(n.pos), n.name).toBe(true);
      expect(s.characters[n.charId]?.alive).toBe(true);
      expect(n.charId).not.toBe(s.playerId);
    }
    expect(whoIsAround(s)).toEqual(npcs);
  });
});

describe('walking the rest of the town: the stretches', () => {
  it('every stretch names real location-layer places and real art keys', async () => {
    const { STRETCHES } = await import('../src/engine/walkStretches');
    const { PLACES } = await import('../src/engine/placesGeo');
    const { ASSET_URLS } = await import('../src/ui/hood/art/assetUrls');
    expect(STRETCHES.length).toBeGreaterThanOrEqual(5);
    for (const st of STRETCHES) {
      for (const k of st.backdrop) expect(k in ASSET_URLS, `${st.id} ${k}`).toBe(true);
      for (const id of st.places) expect(PLACES.some((f) => f.id === id), `${st.id} ${id}`).toBe(true);
      for (const id of Object.keys(st.lines)) expect(st.places.includes(id), `${st.id} line ${id}`).toBe(true);
    }
    for (const f of PLACES) for (const k of [...(f.properties.images.exterior ?? []), ...(f.properties.images.views ?? [])]) expect(k in ASSET_URLS, `${f.id} ${k}`).toBe(true);
  });

  it('turns up the places standing in the game year, the zone lots, and landmarks that cannot be owned', async () => {
    const { STRETCHES, stretchSpots, whoIsOnStretch } = await import('../src/engine/walkStretches');
    const s = newGame('walk-2');
    for (const st of STRETCHES) {
      const spots = stretchSpots(s, st);
      expect(spots.length, st.id).toBeGreaterThanOrEqual(3);
      expect(new Set(spots.map((h) => h.id)).size).toBe(spots.length);
      for (const h of spots) if (h.lots) expect(hotspotLot(s, h), `${st.id} ${h.id}`).toBeDefined();
      expect(whoIsOnStretch(s, st)).toEqual(whoIsOnStretch(s, st));
    }
    const all = STRETCHES.flatMap((st) => stretchSpots(s, st));
    // Not open yet in 1960; Club Avalon and the Boardwalk Chapel are landmarks, never lots.
    expect(all.some((h) => h.id === 'pa-shore-comedy')).toBe(false);
    for (const id of ['club-avalon', 'bw-chapel', 'hereford-light']) {
      const h = all.find((x) => x.id === id)!;
      expect(h, id).toBeDefined();
      expect(h.lots, id).toBeUndefined();
      expect(h.kind, id).toBe('landmark');
    }
    // A later year: the later occupant takes the building.
    const late = { ...s, date: { ...s.date, y: 1986 } };
    const north = stretchSpots(late, STRETCHES.find((x) => x.id === 'boards-north')!);
    expect(north.some((h) => h.id === 'bw-sammys-cafe')).toBe(true);
    expect(north.some((h) => h.id === 'bw-sammys')).toBe(false);
  });
});
