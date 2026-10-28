import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { ISO } from '../src/ui/hood/iso';
import { wildwoodDetails, wildwoodRegions, wildwoodStyles } from '../src/ui/hood/wildwoodRealm';
import { regionsFromGrid } from '../src/ui/realm/gridRegions';
import { PoliticalOverlay } from '../src/ui/realm/PoliticalOverlay';
import { bboxOf, holderFromShares, insideRings, mergeRealms, placeRealmLabel, realmBorders, spreadLabels, type Pt, type RealmRegion } from '../src/ui/realm/realmGeo';

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const svg = (p: Parameters<typeof PoliticalOverlay>[0]) => renderToString(createElement('svg', null, createElement(PoliticalOverlay, p)));
const reg = (id: string, polygons: Pt[][], holder: string | null, extra: Partial<RealmRegion> = {}): RealmRegion => ({ id, name: id, polygons, holder, share: 50, ...extra });

describe('political map: who holds an area', () => {
  it('the top share holds it with a clear lead; close contenders contest it; a weak top share leaves it neutral', () => {
    expect(holderFromShares({ player: 75, feldstein: 6, none: 19 })).toEqual({ holder: 'player', share: 75 });
    const c = holderFromShares({ player: 32, manno: 25, none: 43 });
    expect(c.contested).toEqual(['player', 'manno']);
    expect(holderFromShares({ player: 16, manno: 34, none: 50 }).holder).toBe('manno');
    expect(holderFromShares({ player: 12, kessler: 9, none: 79 }).holder).toBeNull();
    expect(holderFromShares({ none: 100 })).toEqual({ holder: null, share: 0 });
    // The unaligned share never holds, however big.
    expect(holderFromShares({ none: 90, manno: 10 }).holder).toBeNull();
  });
});

describe('political map: realms from regions', () => {
  // A row of four squares sharing edges: A B | C | D, held mine, mine, theirs, mine.
  const regions = [
    reg('a', [rect(0, 0, 10, 10)], 'player'),
    reg('b', [rect(10, 0, 20, 10)], 'player'),
    reg('c', [rect(20, 0, 30, 10)], 'manno'),
    reg('d', [rect(30, 0, 40, 10)], 'player'),
  ];

  it('adjacent areas of one holder merge into one realm; a gap splits it', () => {
    const realms = mergeRealms(regions);
    expect(realms.map((r) => r.ids)).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(realms[0].polygons).toHaveLength(2);
  });

  it('declared neighbours merge areas whose borders do not share vertices', () => {
    const loose = [reg('x', [rect(0, 0, 10, 10)], 'kessler', { neighbors: ['y'] }), reg('y', [rect(10.5, 0, 20, 10)], 'kessler')];
    expect(mergeRealms(loose).map((r) => r.ids)).toEqual([['x', 'y']]);
  });

  it('contested areas never merge into either side, but two of the same contest do', () => {
    const rs = [
      reg('a', [rect(0, 0, 10, 10)], 'player'),
      reg('b', [rect(10, 0, 20, 10)], 'player', { contested: ['player', 'manno'] }),
      reg('c', [rect(20, 0, 30, 10)], 'manno', { contested: ['manno', 'player'] }),
    ];
    expect(mergeRealms(rs).map((r) => r.key)).toEqual(['player', 'contested:manno|player']);
  });

  it('borders: thick between holders, thin inside a realm, each shared edge once', () => {
    const b = realmBorders(regions);
    const len = (ls: Pt[][]) => ls.reduce((a, l) => a + l.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - l[i][0], p[1] - l[i][1]), 0), 0);
    expect(len(b.district)).toBeCloseTo(10); // a|b
    expect(len(b.realm)).toBeCloseTo(20); // b|c and c|d
    expect(len(b.outer)).toBeCloseTo(2 * 40 + 2 * 10);
  });
});

describe('political map: the realm name', () => {
  it('follows a long territory\'s axis and fits inside it', () => {
    // A long strip tilted 30 degrees.
    const th = Math.PI / 6;
    const rot = ([x, y]: Pt): Pt => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)];
    const strip = rect(0, 0, 1000, 120).map(rot);
    const lab = placeRealmLabel([strip], 'THE MANNO FAMILY')!;
    expect(lab).toBeDefined();
    expect(Math.abs(lab.angle - 30)).toBeLessThan(2);
    expect(lab.length).toBeGreaterThan(900);
    expect(lab.thickness).toBeGreaterThan(100);
    expect(lab.thickness).toBeLessThan(140);
    expect(lab.fontSize).toBeLessThanOrEqual(lab.thickness * 0.5 + 1e-6);
    expect(lab.textLength).toBeLessThanOrEqual(lab.length);
    for (const p of lab.points) expect(insideRings([strip], p[0], p[1])).toBe(true);
    // Reads left to right.
    expect(lab.points[lab.points.length - 1][0]).toBeGreaterThan(lab.points[0][0]);
  });

  it('a short name in a big square is capped by the length rule, a long name by the square', () => {
    const sq = [rect(0, 0, 400, 400)];
    const a = placeRealmLabel(sq, 'AB')!;
    const b = placeRealmLabel(sq, 'THE FELDSTEIN FAMILY OF ATLANTIC CITY')!;
    expect(a.fontSize).toBeLessThanOrEqual(201);
    expect(b.fontSize).toBeLessThan(a.fontSize);
    const bb = bboxOf(sq);
    for (const p of [...a.points, ...b.points]) expect(p[0] >= bb.x0 && p[0] <= bb.x1 && p[1] >= bb.y0 && p[1] <= bb.y1).toBe(true);
  });

  it('bows through a curved territory (an L) but stays inside its band', () => {
    const L: Pt[] = [[0, 0], [600, 0], [600, 100], [100, 100], [100, 300], [0, 300]];
    const lab = placeRealmLabel([L], 'THE KESSLER FAMILY', { maxFs: 40 })!;
    expect(lab.fontSize).toBeLessThanOrEqual(40);
    expect(lab.points.length).toBeGreaterThan(3);
  });

  it('district names are spread off each other', () => {
    const s = spreadLabels([{ id: 'a', x: 0, y: 0, w: 50, h: 10 }, { id: 'b', x: 5, y: 2, w: 50, h: 10 }]);
    const [a, b] = [s.get('a')!, s.get('b')!];
    expect(Math.abs(a[1] - b[1])).toBeGreaterThanOrEqual(10);
  });
});

describe('political map: regions from a grid', () => {
  it('traces each label into rings that share their borders exactly and keep the triple points', () => {
    // 6x4: left half A, right-top B, right-bottom C; one stray cell of B voted away.
    const lab = (i: number, j: number) => (i < 3 ? (i === 1 && j === 1 ? 'B' : 'A') : j < 2 ? 'B' : 'C');
    const shapes = regionsFromGrid(6, 4, lab, (x, y) => [x * 10, y * 10], { vote: 1, smooth: 2 });
    expect([...shapes.keys()].sort()).toEqual(['A', 'B', 'C']);
    const rs = [...shapes].map(([id, polygons]) => reg(id, polygons, id === 'A' ? 'player' : 'manno'));
    for (const r of rs) expect(r.polygons).toHaveLength(1);
    const b = realmBorders(rs);
    // B and C (one holder) share a thin border; A meets them with a thick one.
    expect(b.district.length).toBeGreaterThan(0);
    expect(b.realm.length).toBeGreaterThan(0);
    // The point where all three meet stays on the grid.
    const all = rs.flatMap((r) => r.polygons.flat());
    expect(all.some(([x, y]) => x === 30 && y === 20)).toBe(true);
  });
});

describe('political map: Wildwood', () => {
  const s = newGame('realm-1960');

  it('every game district (and West Wildwood) is an area, held per its influence', () => {
    const rs = wildwoodRegions(s, ISO);
    const ids = rs.map((r) => r.id);
    for (const d of s.districts) expect(ids, d.id).toContain(d.id);
    expect(ids).toContain('westww');
    for (const r of rs) {
      const d = s.districts.find((x) => x.id === r.id);
      if (d) expect(r.holder ?? null).toBe(holderFromShares(d.influence).holder);
      expect(r.polygons.length).toBeGreaterThan(0);
    }
    // The player's areas merge into one realm along the island.
    const mine = mergeRealms(rs).filter((x) => x.holder === 'player' && !x.contested);
    expect(mine.length).toBeGreaterThan(0);
    expect(Math.max(...mine.map((m) => m.ids.length))).toBeGreaterThanOrEqual(3);
  });

  it('a district that changes hands changes colour; a near tie is contested', () => {
    const t = structuredClone(s);
    const north = t.districts.find((d) => d.id === 'north')!;
    north.influence = { player: 40, kessler: 35, none: 25 };
    const r = wildwoodRegions(t, ISO).find((x) => x.id === 'north')!;
    expect(r.contested).toEqual(['player', 'kessler']);
  });

  it('paints the house name, the rival families\' names, and renders a tooltip-ready overlay', () => {
    const st = wildwoodStyles(s);
    expect(st.player.name).toBe(`THE ${s.houseName.toUpperCase()} FAMILY`);
    expect(st.player.color).toBe('#d4a62a');
    expect(st.manno.color).toBe('#c0392b');
    expect(st.kessler.color).toBe('#5b8bc4');
    expect(st.feldstein.color).toBe('#3a9a5b');
    expect(st.philly.color).toBe('#9b6bc9');
    const t = structuredClone(s);
    t.districts.find((d) => d.id === 'docks')!.influence = { player: 30, manno: 28, none: 42 };
    const regions = wildwoodRegions(t, ISO);
    const html = svg({ regions, styles: st, scale: 0.15 });
    expect(html).toContain('data-testid="political-all"');
    expect(html).toContain(st.player.name);
    expect(html).toContain('THE KESSLER FAMILY');
    expect(html).toContain('<textPath');
    // Contested docks: striped in both colours.
    expect(html).toMatch(/<pattern[^>]*id="po-hatch-player-manno"/);
    expect(html).toContain('fill="url(#po-hatch-player-manno)"');
    const docks = regions.find((r) => r.id === 'docks')!;
    expect(wildwoodDetails(t, docks).map((x) => x[0])).toEqual(expect.arrayContaining(['Rackets', 'Heat']));
  });

  it('close in, the family names give way to the district names', () => {
    const regions = wildwoodRegions(s, ISO);
    const st = wildwoodStyles(s);
    const far = svg({ regions, styles: st, scale: 0.12 });
    const near = svg({ regions, styles: st, scale: 3 });
    expect(far).toContain('data-testid="realm-name"');
    expect(near).not.toContain('data-testid="realm-name"');
    expect(near).toContain('Pacific Avenue');
    // The split layers: fills only / ink only.
    const fill = svg({ regions, styles: st, scale: 0.12, layer: 'fill' });
    expect(fill).not.toContain('<textPath');
    expect(fill).toContain('data-region="pacific"');
  });
});
