/**
 * The Wildwood town package's geography rebuilt from the island measurements
 * (islandgrid.ts): the frame, the cross streets in their real order, the
 * avenues on their real courses, the island and town outlines, the profiles,
 * West Wildwood, the causeway, and the street-relative re-placement of every
 * record that was laid out on the old (memory) grid. Every id is kept.
 *
 * Re-placement, by what a record says about where it is:
 *   1. a verified point (sourced coordinates)           kept as it is
 *   2. a house number on a street the tax list knows    the parcel with that address (PROP_LOC), in its town
 *   3. "<avenue> at <cross street>", "Boardwalk at …"   the same corner of the real grid (its offset from
 *                                                         the corner on the old grid kept, clamped to the block)
 *   4. a grid slot (run, cross street, half)             follows its streets (nothing to move)
 *   5. anything else placed on the old grid               the same block-relative spot between the same
 *                                                         two streets, when they are neighbours in reality;
 *                                                         otherwise queued for review (never guessed)
 */
import type { CityPackage, Landmark, Street } from '../../../src/engine/cityPackage';
import { frameFns } from '../../../src/engine/cityPackage';
import { regionsFromGrid } from '../../../src/ui/realm/gridRegions';
import { parseAddress, streetKey } from '../lib/address';
import type { LL } from './osm';
import { roadClass } from './osm';
import { CODE_MUNI, MUNI_TOWN, components, dilate, erode, fillPoly, makeRaster, r1, rAt, simplifyLine, simplifyRing, strokeLine, type AveObs, type CrossObs, type Measured, type Raster, type UVp } from './islandgrid';

export interface ReviewItem { id: string; kind: string; priority: 'high' | 'medium' | 'low'; target?: { layer: string; id: string }; detail: string; suggestion: string; status: 'open' }

const median = (xs: number[]): number => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r0 = (x: number) => Math.round(x);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Game street names that are spelled differently in OSM. */
const ALIAS: Record<string, string> = { 'st paul ave': 'saint paul ave', 'sweet briar rd': 'sweetbriar rd' };
export const nkey = (name: string): string => { const k = streetKey(name.replace(/-/g, ' ')).replace(/\s+/g, ' '); return ALIAS[k] ?? k; };

const TOWN_NAME: Record<string, string> = { crest: 'Wildwood Crest', wildwood: 'Wildwood', north: 'North Wildwood', other: 'Diamond Beach' };

/* ---------------- profiles ---------------- */

/** A profile from samples [u, value] every `step`: gaps filled, smoothed, simplified. */
function profile(samples: Map<number, number>, u0: number, u1: number, step: number, smooth: number, tol: number): [number, number][] {
  const us: number[] = []; for (let u = u0; u <= u1; u += step) us.push(u);
  let vs = us.map((u) => samples.get(u) ?? NaN);
  for (let i = 0; i < vs.length; i++) if (Number.isNaN(vs[i])) {
    let a = i - 1; while (a >= 0 && Number.isNaN(vs[a])) a--;
    let b = i + 1; while (b < vs.length && Number.isNaN(vs[b])) b++;
    vs[i] = a < 0 ? vs[b] : b >= vs.length ? vs[a] : vs[a] + ((vs[b] - vs[a]) * (i - a)) / (b - a);
  }
  for (let p = 0; p < smooth; p++) vs = vs.map((_, i) => (vs[Math.max(0, i - 1)] + 2 * vs[i] + vs[Math.min(vs.length - 1, i + 1)]) / 4);
  return simplifyLine(us.map((u, i) => [u, r0(vs[i])] as UVp), tol).map(([u, v]) => [r0(u), r0(v)] as [number, number]);
}

export const profAt = (pts: [number, number][], u: number): number => {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + ((u - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]); }
  return pts[pts.length - 1][1];
};

/* ---------------- the grid ---------------- */

export interface GridOut {
  pkg: CityPackage;
  review: ReviewItem[];
  report: Record<string, unknown>;
  /** name → measured real u (and town) for every grid cross street, for tests and the evidence file. */
  order: { name: string; label: string; u: number; town: string; source: string }[];
  debug?: { lab: Uint8Array; raster: Raster };
}

interface CrossPick { name: string; label: string; key: string; u: number; town: string; obs?: CrossObs; legacy?: Street; hidden?: boolean; vRange?: [number, number] }

export function buildIslandGrid(m: Measured, old: CityPackage, opts: { now: string }): GridOut {
  const review: ReviewItem[] = [];
  const oldFrame = old.geography.frame!;
  const oldFns = frameFns(oldFrame);
  const oldCross = old.streets.filter((s) => s.kind === 'cross');
  const oldAve = old.streets.filter((s) => s.kind === 'avenue');

  /* ----- the island's avenues (the five the game runs on, and the others) ----- */
  const islandAves = m.aves.filter((a) => a.town !== 'westww' && a.town !== 'other' && a.length >= 400);
  const aveBy = (key: string, town?: string) => islandAves.filter((a) => a.key === key && (!town || a.town === town));
  const catProf = (parts: AveObs[]): [number, number][] => parts.flatMap((a) => a.prof).sort((x, y) => x[0] - y[0]);
  const AVE_DEF: { id: string; parts: AveObs[]; names: Record<string, string>; note?: string }[] = [
    { id: 'oc', parts: [...aveBy('ocean ave', 'wildwood'), ...aveBy('surf ave', 'north')], names: { crest: 'Ocean Ave', wildwood: 'Ocean Ave', north: 'Surf Ave' }, note: 'In North Wildwood the line of Ocean Avenue runs on as Surf Avenue; North Wildwood\'s own Ocean Avenue lies further out (ave:no).' },
    { id: 'at', parts: aveBy('atlantic ave'), names: { crest: 'Atlantic Ave', wildwood: 'Atlantic Ave', north: 'Atlantic Ave' } },
    { id: 'pa', parts: [...aveBy('pacific ave'), ...aveBy('central ave', 'north')], names: { crest: 'Pacific Ave', wildwood: 'Pacific Ave', north: 'Central Ave' } },
    { id: 'nj', parts: [...aveBy('new jersey ave'), ...aveBy('olde new jersey ave')], names: { crest: 'New Jersey Ave', wildwood: 'New Jersey Ave', north: 'New Jersey Ave' }, note: 'North of 1st Avenue it is Olde New Jersey Avenue.' },
    { id: 'pk', parts: aveBy('park blvd'), names: { crest: 'Park Blvd', wildwood: 'Park Blvd' } },
    { id: 'bc', parts: aveBy('beach ave', 'crest'), names: { crest: 'Beach Ave' } },
    { id: 'sv', parts: aveBy('seaview ave', 'crest'), names: { crest: 'Seaview Ave' } },
    { id: 'by', parts: aveBy('bayview ave', 'crest'), names: { crest: 'Bayview Ave' } },
    { id: 'ar', parts: aveBy('arctic ave', 'wildwood'), names: { wildwood: 'Arctic Ave' } },
    { id: 'hu', parts: aveBy('hudson ave', 'wildwood'), names: { wildwood: 'Hudson Ave' } },
    { id: 'sq', parts: aveBy('susquehanna ave', 'wildwood'), names: { wildwood: 'Susquehanna Ave' } },
    { id: 'lr', parts: aveBy('lake rd', 'wildwood'), names: { wildwood: 'Lake Rd' } },
    { id: 'no', parts: aveBy('ocean ave', 'north'), names: { north: 'Ocean Ave' } },
    { id: 'ny', parts: aveBy('new york ave', 'north'), names: { north: 'New York Ave', wildwood: 'New York Ave' } },
    { id: 'de', parts: aveBy('delaware ave', 'north'), names: { north: 'Delaware Ave' } },
    { id: 'md', parts: aveBy('maryland ave', 'north'), names: { north: 'Maryland Ave' } },
  ];
  const used = new Set(AVE_DEF.flatMap((d) => d.parts));
  for (const a of islandAves) if (!used.has(a)) review.push({ id: `rq-grid-ave-${slug(a.key)}-${a.town}`, kind: 'grid-avenue-not-drawn', priority: a.key.includes('kennedy') ? 'medium' : 'low', detail: `${a.display} (${TOWN_NAME[a.town] ?? a.town}, ${r0(a.length)} m along the island at v≈${r0(a.v)}) is in OSM but not on the game's grid.${a.key.includes('kennedy') ? ' It carries a post-1963 name: what the beachfront road was called in 1960 (and whether it existed) is not in the data.' : ''}`, suggestion: 'Add it as an avenue if it existed in 1960 (Sanborn 1950).', status: 'open' });
  const avenues: Street[] = [];
  for (const d of AVE_DEF) {
    if (!d.parts.length) { review.push({ id: `rq-grid-ave-missing-${d.id}`, kind: 'grid-avenue-missing', priority: 'high', detail: `Avenue ${d.id} (${Object.values(d.names).join(' / ')}) not found in OSM`, suggestion: 'Check the OSM download.', status: 'open' }); continue; }
    const prof = catProf(d.parts);
    const path = simplifyLine(prof.map(([u, v]) => [u, v] as UVp), 4).map(([u, v]) => [r0(u), r0(v)] as [number, number]);
    const legacy = oldAve.find((a) => a.id === `ave:${d.id}`);
    const st: Street = {
      ...(legacy ?? {}), id: `ave:${d.id}`, name: legacy?.name ?? Object.values(d.names)[0], kind: 'avenue', v: r0(median(prof.map((p) => p[1]))), names: d.names,
      from: r0(Math.min(...d.parts.map((p) => p.uMin))), to: r0(Math.max(...d.parts.map((p) => p.uMax))), path,
      evidence: { confidence: 'verified', source: `OpenStreetMap ${d.parts.map((p) => p.display).filter((x, i, a) => a.indexOf(x) === i).join(' + ')} centrelines (${d.parts.flatMap((p) => p.ways).length} ways), measured in the island frame; modern course, the 1960 course is unverified.${d.note ? ` ${d.note}` : ''}`, scope: ['address'] },
    };
    avenues.push(st);
  }
  const aveV = (id: string, u: number): number | undefined => { const a = avenues.find((x) => x.id === `ave:${id}`); if (!a || u < (a.from as number) - 30 || u > (a.to as number) + 30) return undefined; return profAt(a.path!, u); };

  /* ----- cross streets ----- */
  const crestS = (m.spineInfo as { crestSouthU?: number }).crestSouthU ?? 450;
  const crossObs = m.cross.filter((c) => (['crest', 'wildwood', 'north'].includes(c.town) || (c.town === 'other' && c.u > 0 && c.u < crestS + 80 && c.vMin < 600)) && c.length >= 100 && c.vMax - c.vMin >= 80);
  // A grid street crosses at least two of the main avenues where it runs.
  const crossesAves = (c: CrossObs) => ['oc', 'at', 'pa', 'nj', 'pk', 'sv', 'bc', 'no', 'ny', 'ar'].filter((id) => { const v = aveV(id, c.u); return v !== undefined && v >= c.vMin - 25 && v <= c.vMax + 25; }).length;
  const gridObs = crossObs.filter((c) => crossesAves(c) >= 2);
  const minorObs = crossObs.filter((c) => crossesAves(c) < 2);
  // Merge same-named pieces within 40 m (E/W halves measured apart).
  const merged: CrossObs[] = [];
  for (const c of [...gridObs].sort((a, b) => a.u - b.u)) {
    const prev = merged.find((x) => nkey(x.display) === nkey(c.display) && Math.abs(x.u - c.u) < 40);
    if (prev) { const w = prev.length + c.length; prev.u = (prev.u * prev.length + c.u * c.length) / w; prev.length = w; prev.vMin = Math.min(prev.vMin, c.vMin); prev.vMax = Math.max(prev.vMax, c.vMax); prev.ways.push(...c.ways); } else merged.push({ ...c, ways: [...c.ways] });
  }
  // Match the game's streets by name (and town, where a name repeats).
  const picks: CrossPick[] = [];
  const taken = new Set<CrossObs>();
  const legacyUnmatched: Street[] = [];
  for (const s of oldCross) {
    const k = nkey(s.name);
    const cands = merged.filter((c) => nkey(c.display) === k && !taken.has(c));
    const sub = s.sub ?? '';
    const pick = cands.find((c) => c.town === sub) ?? cands.find((c) => c.town === 'other' && sub === 'crest') ?? (cands.length === 1 ? cands[0] : undefined);
    if (!pick) { legacyUnmatched.push(s); continue; }
    taken.add(pick);
    picks.push({ name: s.name, label: s.label ?? s.name, key: k, u: pick.u, town: pick.town, obs: pick, legacy: s, vRange: [r0(pick.vMin), r0(pick.vMax)] });
  }
  const names = new Set(picks.map((p) => p.name));
  for (const c of merged) {
    if (taken.has(c)) continue;
    let name = c.display;
    if (names.has(name)) name = `${c.display} (${TOWN_NAME[c.town] ?? c.town})`;
    if (names.has(name)) name = `${name} ${r0(c.u)}`;
    names.add(name);
    picks.push({ name, label: c.display, key: nkey(c.display), u: c.u, town: c.town, obs: c, vRange: [r0(c.vMin), r0(c.vMax)] });
  }
  picks.sort((a, b) => a.u - b.u);
  // The game's streets the sources do not show: kept (places stand on them), hidden, half a block past their old southern neighbour.
  for (const s of legacyUnmatched) {
    const i = oldCross.indexOf(s);
    const prevOld = oldCross[i - 1];
    const nextOld = oldCross[i + 1];
    const prev = prevOld && picks.find((p) => p.legacy === prevOld);
    let u: number; let how: string;
    if (prev) {
      const after = picks.filter((p) => p.u > prev.u + 5 && !p.hidden).sort((a, b) => a.u - b.u)[0];
      u = prev.u + ((after ? after.u : prev.u + 80) - prev.u) / 2;
      how = `half a block north of ${prev.name} (its southern neighbour on the old grid)`;
    } else {
      const next = nextOld && picks.find((p) => p.legacy === nextOld);
      u = (next ? next.u : 0) - 40;
      how = `half a block south of ${next?.name ?? '?'} (its northern neighbour on the old grid)`;
    }
    picks.push({ name: s.name, label: s.label ?? s.name, key: nkey(s.name), u, town: s.sub ?? 'wildwood', legacy: s, hidden: true });
    review.push({ id: `rq-grid-street-${slug(s.name)}`, kind: 'grid-street-not-found', priority: 'high', target: { layer: 'streets', id: s.id }, detail: `${s.name} (the game's ${TOWN_NAME[s.sub ?? ''] ?? s.sub}) is not a cross street in OSM or the tax list${s.name === 'Lake Rd' ? ' (OSM\'s Lake Road is a bayside road in Wildwood, running along the island)' : ''}. Kept hidden at u ${r0(u)}, ${how}, so the records on it keep their ground; everything on it is queued below.`, suggestion: 'Find the street in a 1950s source (Sanborn index, a directory) or move its records onto a real street in the map editor.', status: 'open' });
  }
  picks.sort((a, b) => a.u - b.u);
  // Stable indexes: the old ones are kept (generated lot ids encode them), new streets get 100+ in name order (and keep it on later runs).
  const oldIdx = new Map(oldCross.map((s, i) => [s.name, s.idx ?? i]));
  let nextIdx = Math.max(99, ...oldCross.map((s, i) => s.idx ?? i)) + 1;
  for (const p of [...picks].sort((a, b) => a.name.localeCompare(b.name))) if (!oldIdx.has(p.name)) oldIdx.set(p.name, nextIdx++);
  const crossStreets: Street[] = picks.map((p) => {
    const st: Street = {
      id: p.legacy?.id ?? `st:${slug(p.name)}`, name: p.name, kind: 'cross', u: r0(p.u), sub: p.town === 'other' ? 'crest' : p.town, idx: oldIdx.get(p.name)!,
      evidence: p.hidden
        ? { confidence: 'invented', source: `Not in OSM or the NJ tax list: a street of the old (memory) grid, kept hidden so its records keep their ground. See the review queue.` }
        : { confidence: 'verified', source: `OpenStreetMap ${p.obs!.display} (${p.obs!.ways.length} ways, ${TOWN_NAME[p.town] ?? p.town}${p.town === 'other' ? ', Lower Township' : ''}): u where it crosses the middle of the island; modern course, the 1960 street is unverified.`, scope: ['address'] },
    };
    if (p.label !== p.name) st.label = p.label;
    if (p.vRange) st.vRange = p.vRange;
    if (p.hidden) st.hidden = true;
    return st;
  });
  const minorStreets: Street[] = minorObs.filter((c) => !merged.includes(c)).map((c) => ({ id: `rd:${slug(c.display)}-${r0(c.u)}`, name: c.display, kind: 'road', path: [[r0(c.uEnds[0]), r0(c.vMin)], [r0(c.uEnds[1]), r0(c.vMax)]] as [number, number][], evidence: { confidence: 'verified', source: `OpenStreetMap ${c.display} (short cross street, not on the block grid)` } }));
  const crossU = (name: string) => crossStreets.find((s) => s.name === name)?.u;

  /* ----- profiles and outlines ----- */
  const prof = buildProfiles(m, crossStreets);

  /* ----- causeway, West Wildwood ----- */
  const cw = causeway(m, crossU('Rio Grande Ave') ?? 3870);
  const ww = prof.westww;

  /* ----- the error of the old grid ----- */
  const errs = gridError(m, oldCross, oldFns, crossStreets);

  /* ----- landmarks ----- */
  const landmarks = placeLandmarks(m, old, crossStreets, prof, review);

  /* ----- assemble the package geography ----- */
  const g = old.geography;
  const pkg: CityPackage = JSON.parse(JSON.stringify(old));
  const oldBW = old.streets.find((s) => s.kind === 'boardwalk')!;
  pkg.streets = [
    ...crossStreets, ...avenues,
    { ...oldBW, path: prof.boardwalk.path, evidence: { confidence: 'approximate', source: `The Boardwalk's course: OpenStreetMap's named boards (today's) from Cresse Avenue to u ${prof.boardwalk.namedTo}, then along the front of the oceanfront lots to 16th Avenue (generated: OSM does not name the North Wildwood boards). The 1960 extent (Cresse Avenue to 16th Avenue) is the game's; unverified.` } },
    ...minorStreets,
  ];
  const sub = prof.subTowns;
  pkg.geography = {
    ...g,
    frame: m.frame,
    bounds: { u0: -700, u1: r0(prof.uNorth + 600), v0: r0(Math.min(...prof.beach.map((p) => -p[1])) - 150), v1: r0(cw.mainlandV + 200) },
    verified: true,
    subTowns: sub,
    profiles: { beach: { pts: prof.beach, beyond: prof.beach[prof.beach.length - 1][1] }, bay: { pts: prof.bay, beyond: prof.bay[prof.bay.length - 1][1] }, front: { pts: prof.front, beyond: prof.front[prof.front.length - 1][1] } },
    uSouth: r0(prof.uSouth), uNorth: r0(prof.uNorth),
    areas: [{ id: 'westww', name: 'West Wildwood', u0: ww.u0, u1: ww.u1, v0: ww.v0, v1: ww.v1 }],
    outlines: prof.outlines,
    derivedFrom: { sources: ['OpenStreetMap (ODbL), © OpenStreetMap contributors, downloaded 2026-10-29 (citydata/wildwood/raw/osm/island.osm.json)', 'NJOGIS Parcels Composite with MOD-IV attributes (municipal boundaries, addresses), downloaded 2026-10-29'], method: 'scripts/cityimport/build/islandgrid.ts + islandpkg.ts (npx tsx scripts/cityimport/cli.ts grid --area island)', at: opts.now, report: 'citydata/wildwood/packs/island/grid-report.json' },
  };
  const cwRoute = pkg.routes.find((r) => r.kind === 'causeway');
  if (cwRoute) { cwRoute.mainlandV = r0(cw.mainlandV); cwRoute.mainlandU = r0(cw.mainlandU); cwRoute.path = cw.path; cwRoute.evidence = { confidence: 'approximate', source: `Rio Grande Avenue / Route 47 west of the island, OpenStreetMap (${cw.ways} ways); the download ends at -74.865, so the mainland end is where the road leaves it (${cw.note}).` }; }
  pkg.landmarks = landmarks;
  pkg.provenance = [
    { confidence: 'verified', source: `Street frame measured from OpenStreetMap (2026-10-29): a curvilinear frame along New Jersey Avenue, cross streets in their real order (${crossStreets.filter((s) => !s.hidden).length} on the grid), avenues on their real courses; the 1960 grid is assumed to be today's (unverified).` },
    ...old.provenance.filter((p) => !/from memory/i.test(p.source)),
  ];
  pkg.contentVersion = `${opts.now.slice(0, 10)}.wildwood-island-grid`;

  const order = crossStreets.filter((s) => !s.hidden).map((s) => ({ name: s.name, label: s.label ?? s.name, u: s.u!, town: s.sub!, source: (s.evidence?.source ?? '').slice(0, 80) }));
  const report = {
    frame: { ...m.spineInfo, shift: m.shift, bearing: m.frame.bearing },
    cross: { grid: crossStreets.filter((s) => !s.hidden).length, hidden: crossStreets.filter((s) => s.hidden).map((s) => s.name), minor: minorStreets.length, legacyMatched: picks.filter((p) => p.legacy && !p.hidden).length, legacyTotal: oldCross.length, new: picks.filter((p) => !p.legacy).length },
    avenues: avenues.map((a) => ({ id: a.id, names: a.names, v: a.v, from: a.from, to: a.to, pts: a.path?.length })),
    error: errs,
    causeway: cw,
    westww: ww,
    profiles: { beach: prof.beach.length, bay: prof.bay.length, front: prof.front.length, uSouth: prof.uSouth, uNorth: prof.uNorth, subTowns: sub },
    coast: coastInfo,
    outlines: Object.fromEntries(Object.entries(prof.outlines).map(([k, v]) => [k, { rings: v.length, points: v.reduce((s, r) => s + r.length, 0) }])),
  };
  return { pkg, review, report, order, debug: { lab: prof.lab, raster: prof.labRaster } };
}

/* ---------------- profiles, outlines ---------------- */

const coastInfo: { cells: number; used: boolean } = { cells: 0, used: false };

function buildProfiles(m: Measured, cross: Street[]) {
  const fns = m.fns;
  const muni = m.muni;
  // The ocean's edge: OSM coastline points seaward of the town.
  const coast: UVp[] = [];
  for (const w of m.osm.waterLines) if (w.tags.natural === 'coastline') for (const q of w.coords) coast.push(fns.toUv(q));
  const STEP = 50;
  const water = new Map<number, number>();
  for (let u = -800; u <= 9200; u += STEP) {
    const vs = coast.filter((p) => Math.abs(p[0] - u) <= STEP / 2 + 10 && p[1] < -60).map((p) => p[1]);
    if (vs.length) water.set(u, Math.max(...vs));
  }
  // The front: the Boardwalk where it runs, else the seaward edge of the addressed lots (the oceanfront motels' lot lines).
  // The Boardwalk (1960: Cresse Avenue to 16th Avenue): OSM's named boards from Cresse Avenue on (the Crest's beachfront
  // promenade is not the Boardwalk), continued along the front of the lots to 16th Avenue where OSM does not name it.
  const uCresse = cross.find((c) => c.name === 'Cresse Ave')?.u ?? 3468;
  const u16 = cross.find((c) => c.name === '16th Ave')?.u ?? 6390;
  const bw = m.boardwalk.flat().filter(([u]) => u >= uCresse - 20);
  const lots = m.parcels.filter((p) => p.address && p.parts.length === 1);
  const lotV = new Map<number, number[]>();
  for (const p of lots) for (const q of p.parts[0]) { const [u, v] = fns.toUv(q); if (v < -400) continue; const k = Math.round(u / STEP) * STEP; const l = lotV.get(k); if (l) l.push(v); else lotV.set(k, [v]); }
  const front = new Map<number, number>();
  for (let u = -800; u <= 9200; u += STEP) {
    const b = bw.filter((p) => Math.abs(p[0] - u) <= STEP / 2 + 5).map((p) => p[1]);
    const l = lotV.get(u);
    const lv = l && l.length >= 6 ? [...l].sort((a, c) => a - c)[Math.floor(l.length * 0.03)] : undefined;
    if (b.length) front.set(u, Math.min(...b) - 6);
    else if (lv !== undefined) front.set(u, lv);
  }
  // Land: the four towns' parcels, the streets between them (not bridges), the beach to the coastline, OSM beaches.
  const land = makeRaster(muni.u0, muni.u0 + muni.cols * muni.cell, muni.v0, muni.v0 + muni.rows * muni.cell, muni.cell);
  for (let k = 0; k < land.data.length; k++) land.data[k] = m.land.data[k] ? 1 : 0;
  // Near a parcel of the four towns (within 40 m), or in Diamond Beach.
  const nearRaster = spreadRaster(muni, 4);
  const onGround = ([u, v]: UVp) => !!rAt(nearRaster, u, v) || (u > -800 && u < 520 && v > -400 && v < 900);
  for (const r of m.osm.roads) {
    if (r.tags.bridge || r.tags.tunnel) continue;
    const cls = roadClass(r.tags.highway);
    const uv = r.coords.map((q) => fns.toUv(q));
    // Segment by segment: only streets on the towns' ground, never a causeway over the marsh.
    for (let i = 1; i < uv.length; i++) {
      if (!onGround(uv[i - 1]) || !onGround(uv[i])) continue;
      const diamond = uv[i][0] < 520 && uv[i - 1][0] < 520 && !rAt(muni, uv[i][0], uv[i][1]);
      strokeLine(land, [uv[i - 1], uv[i]], diamond ? 45 : cls === 'street' ? 16 : 5, 1);
    }
  }
  for (let u = -800; u <= 8000; u += 10) {
    const wv = profAtMap(water, u, STEP);
    const fv = profAtMap(front, u, STEP);
    if (wv === undefined || fv === undefined) continue;
    for (let v = wv; v <= fv + 10; v += 10) { const i = Math.floor((u - land.u0) / land.cell); const j = Math.floor((v - land.v0) / land.cell); if (i >= 0 && j >= 0 && i < land.cols && j < land.rows) land.data[j * land.cols + i] = 1; }
  }
  // Parcels drawn out over the ocean (a pier lease) are not land.
  for (let u = -800; u <= 9200; u += 10) {
    const wv = profAtMap(water, u, STEP);
    if (wv === undefined) continue;
    for (let v = land.v0; v < wv - 30; v += 10) { const i = Math.floor((u - land.u0) / land.cell); const j = Math.floor((v - land.v0) / land.cell); if (i >= 0 && j >= 0 && i < land.cols && j < land.rows) land.data[j * land.cols + i] = 0; }
  }
  // Water mapped inside the land (Sunset Lake, the harbours): cut out.
  for (const w of m.osm.waterAreas) if (w.tags.natural === 'water') fillPoly(land, w.ring.map((q) => fns.toUv(q)), 0);
  // Close pinholes (one cell); then keep only what lies inside the OSM coastline around the island and West Wildwood
  // (flood fill from a point in each town, the coastline as the barrier; tax lots drawn out into the water drop off).
  const closed0 = erode(dilate(land.data, land.cols, land.rows, 1), land.cols, land.rows, 1);
  const barrier = makeRaster(land.u0, land.u0 + land.cols * land.cell, land.v0, land.v0 + land.rows * land.cell, land.cell);
  for (const w of m.osm.waterLines) if (w.tags.natural === 'coastline') strokeLine(barrier, w.coords.map((q) => fns.toUv(q)), 6, 1);
  // Outside the download's box the coastline was not fetched: the box's edge closes the open coastline chains.
  const bb = m.bbox;
  for (let j = 0; j < barrier.rows; j++) for (let i = 0; i < barrier.cols; i++) {
    const [lng, lat] = fns.toLngLat(barrier.u0 + (i + 0.5) * barrier.cell, barrier.v0 + (j + 0.5) * barrier.cell);
    if (lng < bb[0] || lat < bb[1] || lng > bb[2] || lat > bb[3]) barrier.data[j * barrier.cols + i] = 1;
  }
  const inside = new Uint8Array(land.data.length);
  const seeds: UVp[] = [[4500, 500], [2000, 400], [7000, 400], [5300, 1900]];
  const st: number[] = [];
  for (const [u, v] of seeds) { const k = Math.floor((v - land.v0) / land.cell) * land.cols + Math.floor((u - land.u0) / land.cell); if (!barrier.data[k] && !inside[k]) { inside[k] = 1; st.push(k); } }
  while (st.length) { const c = st.pop()!; const i = c % land.cols; const j = (c - i) / land.cols; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di; const jj = j + dj; if (ii < 0 || jj < 0 || ii >= land.cols || jj >= land.rows) continue; const o = jj * land.cols + ii; if (!inside[o] && !barrier.data[o]) { inside[o] = 1; st.push(o); } } }
  let nIn = 0; for (const x of inside) nIn += x;
  const coastOk = nIn < inside.length * 0.5;
  const insideD = dilate(inside, land.cols, land.rows, 1);
  const closed = coastOk ? closed0.map((x, k) => (x && insideD[k] ? 1 : 0)) : closed0;
  coastInfo.cells = nIn; coastInfo.used = coastOk;
  const comp = components(closed, land.cols, land.rows);
  const order = comp.sizes.map((n, i) => [n, i]).sort((a, b) => b[0] - a[0]);
  const keep = new Set(order.filter(([n]) => n >= 400).map(([, i]) => i));
  // West Wildwood: its own town's ground (it touches Wildwood's marsh lots on the tax map).
  const wwNear = spreadRaster(muni, 3);
  const isWWcell = (k: number) => wwNear.data[k] === 4;
  const compMuni = new Map<number, number>();
  for (let k = 0; k < closed.length; k++) { const c = comp.label[k]; if (c >= 0 && muni.data[k] && !isWWcell(k)) compMuni.set(c, (compMuni.get(c) ?? 0) + 1); }
  const mainComp = [...compMuni.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // Labels for tracing: 1 main island (beach), 2 main island (town), 3 West Wildwood, 4 other islands of the towns.
  const lab = new Uint8Array(closed.length);
  const fAt = (u: number) => profAtMap(front, u, STEP) ?? 0;
  for (let k = 0; k < closed.length; k++) {
    const c = comp.label[k]; if (c < 0 || !keep.has(c)) continue;
    const i = k % land.cols; const j = (k - i) / land.cols;
    const u = land.u0 + (i + 0.5) * land.cell; const v = land.v0 + (j + 0.5) * land.cell;
    if (isWWcell(k)) lab[k] = 3;
    else if (c === mainComp) lab[k] = v >= fAt(u) ? 2 : 1;
    else if (compMuni.has(c)) lab[k] = 4;
  }
  const trace = (pred: (x: number) => boolean, tol: number): [number, number][][] => {
    // Trace at 20 m (downsampled by majority) for size; then simplify.
    const cs = 2; const cols = Math.ceil(land.cols / cs); const rows = Math.ceil(land.rows / cs);
    const L = (ii: number, jj: number) => { let n = 0; let t = 0; for (let dj = 0; dj < cs; dj++) for (let di = 0; di < cs; di++) { const i = ii * cs + di; const j = jj * cs + dj; if (i >= land.cols || j >= land.rows) continue; t++; if (pred(lab[j * land.cols + i])) n++; } return n * 2 >= t ? 'x' : null; };
    const shapes = regionsFromGrid(cols, rows, L, (x, y) => [land.u0 + x * cs * land.cell, land.v0 + y * cs * land.cell], { vote: 1, smooth: 1 });
    const rings = (shapes.get('x') ?? []).filter((r) => r.length >= 6 && Math.abs(ringArea(r)) > 4000);
    return rings.map((r) => simplifyRing(r as UVp[], tol).map(([u, v]) => [r0(u), r0(v)] as [number, number])).filter((r) => r.length >= 4);
  };
  const outlines: Record<string, [number, number][][]> = {
    land: trace((x) => x === 1 || x === 2, 6),
    town: trace((x) => x === 2, 6),
    westww: trace((x) => x === 3, 6),
    isles: trace((x) => x === 4, 8),
  };
  // Municipal outlines (for the districts and the realm map): the parcels' towns over the traced land.
  const munLab = spread(muni, closed, land.cols, land.rows);
  for (const [code, name] of [[1, 'mun:crest'], [2, 'mun:wildwood'], [3, 'mun:north']] as const) outlines[name] = traceLab(munLab, land, (x) => x === code, 8);

  // Bay edge: the main island's inland extent at each u (its farthest land in the column, past small inlets).
  const bay = new Map<number, number>();
  const uNorthLand: number[] = [];
  for (let u = -800; u <= 9200; u += STEP) {
    const i = Math.floor((u - land.u0) / land.cell); if (i < 0 || i >= land.cols) continue;
    let last: number | undefined;
    for (let j = 0; j < land.rows; j++) if (lab[j * land.cols + i] === 2) last = land.v0 + (j + 1) * land.cell;
    if (last !== undefined) { bay.set(u, last); uNorthLand.push(u); }
  }
  const crossU = cross.filter((c) => !c.hidden).map((c) => c.u!);
  const uSouth = Math.min(...crossU) - 60;
  const uNorth = Math.max(...uNorthLand);
  const beach = profile(new Map([...water].map(([u, v]) => [u, -v])), -800, Math.round(uNorth / STEP) * STEP, STEP, 2, 6);
  const bayP = profile(bay, -800, Math.round(uNorth / STEP) * STEP, STEP, 1, 10);
  const frontP = profile(front, -800, Math.round(uNorth / STEP) * STEP, STEP, 2, 3);
  // West Wildwood's box: where its streets are (its tax lots run on into the marsh).
  let wu0 = 1e9; let wu1 = -1e9; let wv0 = 1e9; let wv1 = -1e9;
  for (const r of m.osm.roads) { if (roadClass(r.tags.highway) !== 'street') continue; for (const q of r.coords) { const [u, v] = fns.toUv(q); if (rAt(muni, u, v) === 4 || rAt(nearRaster, u, v) === 4) { wu0 = Math.min(wu0, u); wu1 = Math.max(wu1, u); wv0 = Math.min(wv0, v); wv1 = Math.max(wv1, v); } } }
  const bwNamed = simplifyLine([...bw].sort((a, b) => a[0] - b[0]), 4);
  const bwEnd = bwNamed.length ? bwNamed[bwNamed.length - 1][0] : uCresse;
  const bwPath: [number, number][] = bwNamed.map(([u, v]) => [r0(u), r0(v)]);
  for (let u = Math.ceil((bwEnd + 30) / 50) * 50; u <= u16 + 40; u += 50) bwPath.push([u, r0(profAt(frontP, u) + 6)]);
  // The towns along u: where the column's majority changes town, along the front blocks.
  const townAtU = (u: number): number => { const cnt = new Map<number, number>(); for (let v = 50; v <= 700; v += 20) { const x = rAt(muni, u, v); if (x) cnt.set(x, (cnt.get(x) ?? 0) + 1); } return [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0; };
  let cw = 0; let wn = 0;
  for (let u = 2000; u <= 7000; u += 5) { const t = townAtU(u); if (!cw && t === 2) cw = u; if (cw && !wn && t === 3) wn = u; }
  // The boundary street belongs to the town north of it (Cresse Ave to Wildwood, 26th Ave to North Wildwood), as the game had it.
  const near = (u: number) => crossU.reduce((b, x) => (Math.abs(x - u) < Math.abs(b - u) ? x : b), crossU[0]);
  const subTowns = [{ id: 'crest', name: 'Wildwood Crest', uMax: Math.round(near(cw) - 1) }, { id: 'wildwood', name: 'Wildwood', uMax: Math.round(near(wn) - 1) }, { id: 'north', name: 'North Wildwood', uMax: 1e9 }];
  return { beach, bay: bayP, front: frontP, outlines, uSouth, uNorth, subTowns, boardwalk: { path: simplifyLine(bwPath as UVp[], 3).map(([u, v]) => [r0(u), r0(v)] as [number, number]), namedTo: r0(bwEnd) }, westww: { u0: r0(wu0), u1: r0(wu1), v0: r0(wv0), v1: r0(wv1) }, lab, labRaster: land };
}

function spreadRaster(r: Raster, k: number): Raster {
  const out: Raster = { ...r, data: r.data.slice() };
  let front: number[] = [];
  for (let s = 0; s < r.data.length; s++) if (r.data[s]) front.push(s);
  for (let step = 0; step < k && front.length; step++) {
    const next: number[] = [];
    for (const c of front) { const i = c % r.cols; const j = (c - i) / r.cols; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di; const jj = j + dj; if (ii < 0 || jj < 0 || ii >= r.cols || jj >= r.rows) continue; const o = jj * r.cols + ii; if (!out.data[o]) { out.data[o] = out.data[c]; next.push(o); } } }
    front = next;
  }
  return out;
}

function ringArea(r: [number, number][]): number { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i]; const q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

function profAtMap(mp: Map<number, number>, u: number, step: number): number | undefined {
  const a = Math.floor(u / step) * step; const b = a + step;
  const va = mp.get(a); const vb = mp.get(b);
  if (va === undefined && vb === undefined) return undefined;
  if (va === undefined) return vb; if (vb === undefined) return va;
  return va + ((u - a) / step) * (vb - va);
}

/** Municipal labels spread over the traced land (streets between parcels take the nearest town). */
function spread(muni: Raster, land: Uint8Array, cols: number, rows: number): Uint8Array {
  const out = new Uint8Array(land.length);
  let front: number[] = [];
  for (let k = 0; k < land.length; k++) if (land[k] && muni.data[k]) { out[k] = muni.data[k]; front.push(k); }
  while (front.length) {
    const next: number[] = [];
    for (const c of front) { const i = c % cols; const j = (c - i) / cols; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di; const jj = j + dj; if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue; const o = jj * cols + ii; if (land[o] && !out[o]) { out[o] = out[c]; next.push(o); } } }
    front = next;
  }
  return out;
}

function traceLab(lab: Uint8Array, r: Raster, pred: (x: number) => boolean, tol: number): [number, number][][] {
  const cs = 2; const cols = Math.ceil(r.cols / cs); const rows = Math.ceil(r.rows / cs);
  const L = (ii: number, jj: number) => { let n = 0; let t = 0; for (let dj = 0; dj < cs; dj++) for (let di = 0; di < cs; di++) { const i = ii * cs + di; const j = jj * cs + dj; if (i >= r.cols || j >= r.rows) continue; t++; if (pred(lab[j * r.cols + i])) n++; } return n * 2 >= t ? 'x' : null; };
  const shapes = regionsFromGrid(cols, rows, L, (x, y) => [r.u0 + x * cs * r.cell, r.v0 + y * cs * r.cell], { vote: 1, smooth: 1 });
  return (shapes.get('x') ?? []).filter((x) => Math.abs(ringArea(x)) > 4000).map((x) => simplifyRing(x as UVp[], tol).map(([u, v]) => [r0(u), r0(v)] as [number, number])).filter((x) => x.length >= 4);
}

/* ---------------- the causeway ---------------- */

function causeway(m: Measured, uRio: number) {
  const fns = m.fns;
  const ways = m.osm.roads.filter((r) => /rio grande/i.test(r.tags.name ?? '') || (r.tags.ref ?? '').includes('47'));
  const pts = ways.flatMap((r) => r.coords.map((q) => fns.toUv(q))).filter(([u, v]) => v > 600 && Math.abs(u - uRio) < 1500);
  pts.sort((a, b) => a[1] - b[1]);
  const far = pts[pts.length - 1] ?? [uRio, 2200];
  // A course: the median u per 100 m of v.
  const path: [number, number][] = [];
  for (let v = 600; v <= far[1] + 1; v += 100) { const us = pts.filter((p) => Math.abs(p[1] - v) <= 60).map((p) => p[0]); if (us.length) path.push([r0(median(us)), v]); }
  path.push([r0(far[0]), r0(far[1])]);
  return { mainlandU: r0(far[0]), mainlandV: r0(far[1]), path: simplifyLine(path as UVp[], 8).map(([u, v]) => [r0(u), r0(v)] as [number, number]), ways: ways.length, note: `the westernmost point in the download, ${r0(far[1])} m inland of the Boardwalk line` };
}

/* ---------------- how wrong the old grid was ---------------- */

function gridError(m: Measured, oldCross: Street[], oldFns: ReturnType<typeof frameFns>, newCross: Street[]) {
  const rows: { name: string; before: number; after: number; oldOrder: number; newOrder: number }[] = [];
  const realPts = new Map<string, LL[]>();
  for (const r of m.osm.roads) { if (!r.tags.name || roadClass(r.tags.highway) !== 'street') continue; const k = nkey(r.tags.name); const l = realPts.get(k); if (l) l.push(...r.coords); else realPts.set(k, [...r.coords]); }
  for (const s of oldCross) {
    const ns = newCross.find((x) => x.name === s.name && !x.hidden);
    if (!ns) continue;
    const pts = (realPts.get(nkey(s.name)) ?? []).filter((q) => { const [u] = m.fns.toUv(q); return Math.abs(u - ns.u!) < 60; });
    if (!pts.length) continue;
    // Before: where the old frame puts the real street (u), against the u the game drew it at; after: the same in the new frame.
    const before = median(pts.map((q) => Math.abs(oldFns.toUv(q)[0] - s.u!)));
    const after = median(pts.map((q) => Math.abs(m.fns.toUv(q)[0] - ns.u!)));
    rows.push({ name: s.name, before: r1(before), after: r1(after), oldOrder: 0, newOrder: 0 });
  }
  // Order: pairs of shared streets in the wrong order on the old grid (by the old u) against reality.
  const shared = rows.map((r) => ({ name: r.name, old: oldCross.find((s) => s.name === r.name)!.u!, real: newCross.find((s) => s.name === r.name)!.u! }));
  let inv = 0; let pairs = 0;
  for (let i = 0; i < shared.length; i++) for (let j = i + 1; j < shared.length; j++) { pairs++; if (Math.sign(shared[i].old - shared[j].old) !== Math.sign(shared[i].real - shared[j].real)) inv++; }
  const mean = (xs: number[]) => r1(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
  return { streets: rows.length, meanBefore: mean(rows.map((r) => r.before)), maxBefore: Math.max(...rows.map((r) => r.before)), meanAfter: mean(rows.map((r) => r.after)), maxAfter: Math.max(...rows.map((r) => r.after)), orderInversionsBefore: inv, pairs, rows };
}

/* ---------------- landmarks ---------------- */

function placeLandmarks(m: Measured, old: CityPackage, cross: Street[], prof: ReturnType<typeof buildProfiles>, review: ReviewItem[]): Landmark[] {
  const fns = m.fns;
  const named = (pred: (t: Record<string, string>) => boolean): LL | undefined => {
    for (const e of m.osm.buildings) if (pred(e.tags)) return mean(e.ring);
    for (const p of m.osm.pois) if (pred(p.tags)) return p.at;
    return undefined;
  };
  const mean = (r: LL[]): LL => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
  const crossU = (n: string) => cross.find((s) => s.name === n)?.u;
  const out: Landmark[] = [];
  const oldCross = old.streets.filter((s) => s.kind === 'cross');
  const oldAt = (u: number) => oldCross.reduce((b, s) => (Math.abs(s.u! - u) < Math.abs(b.u! - u) ? s : b), oldCross[0]);
  const fv = (u: number) => profAt(prof.front, u);
  for (const l of old.landmarks) {
    const n: Landmark = JSON.parse(JSON.stringify(l));
    if (l.kind === 'pier') {
      const at = oldAt(l.pos!.u).name;
      n.atStreet = at;
      // The deck slots keep the street name the records use (atStreet); the position is the sourced point where there is one.
      const verified = old.placements.find((p) => p.building === l.id && p.evidence.confidence === 'verified');
      if (verified) {
        const [u] = fns.toUv(verified.geo);
        n.pos = { u: r0(u), v: r0(fv(u) - 20) };
        const nearest = cross.filter((s) => !s.hidden).reduce((b, s) => (Math.abs(s.u! - u) < Math.abs(b.u! - u) ? s : b));
        n.evidence = { ...l.evidence, source: `${l.evidence.source} Position: the sourced point of ${verified.name} (${verified.evidence.source.split('.')[0]}), at ${nearest.name} on the real grid (OSM's ${l.name} outline agrees).` };
        if (nearest.name !== at) review.push({ id: `rq-pier-${l.id}`, kind: 'pier-street-changed', priority: 'medium', target: { layer: 'landmarks', id: l.id }, detail: `${l.name}: the game had it at ${at}; its sourced point (and OSM's outline of the pier) is at ${nearest.name} on the real grid. It now stands there; its deck slots keep the name "${at}" in the records.`, suggestion: 'Rename the pier slots\' street in the records when convenient (ids are unaffected).', status: 'open' });
      } else {
        const u = crossU(at);
        n.pos = { u: u ?? l.pos!.u, v: r0(fv(u ?? l.pos!.u) - 20) };
        n.evidence = { ...l.evidence, confidence: 'approximate', source: `${l.evidence.source} Placed at ${at} (the street the game gave it) on the real grid; the pier's street in 1960 is unverified.` };
        review.push({ id: `rq-pier-${l.id}`, kind: 'pier-street-unverified', priority: 'medium', target: { layer: 'landmarks', id: l.id }, detail: `${l.name} stands at ${at} because the game put it there; no source places it.`, suggestion: 'Check the 1950 Sanborn sheets / a 1960 directory for the pier\'s street.', status: 'open' });
      }
      out.push(n);
      continue;
    }
    // Other landmarks: OSM where it names the place, else street-relative.
    const osmAt: Record<string, LL | undefined> = {
      'lm:hereford-inlet-light': named((t) => t.man_made === 'lighthouse' || /hereford inlet light/i.test(t.name ?? '')),
      'lm:otten-s-harbor': (() => { for (const e of m.osm.pois) if (/otten/i.test(e.tags.name ?? '')) return e.at; return osmNode(m, /ottens? harbor/i); })(),
      'lm:sunset-lake': (() => { const w = m.osm.waterAreas.find((x) => /sunset lake/i.test(x.tags.name ?? '')); return w ? mean(w.ring) : undefined; })(),
      'lm:water-tower': osmNode(m, /^wildwood water tower$/i),
    };
    const ll = osmAt[l.id];
    if (ll) {
      const [u, v] = fns.toUv(ll);
      n.pos = { u: r0(u), v: r0(v) };
      n.evidence = { confidence: 'approximate', source: `Position: OpenStreetMap (${l.name}), today's feature; ${l.evidence.source}` };
    } else {
      review.push({ id: `rq-landmark-${l.id}`, kind: 'landmark-not-found', priority: 'medium', target: { layer: 'landmarks', id: l.id }, detail: `${l.name}: not found in OSM; left at its old frame position (u ${l.pos?.u}, v ${l.pos?.v}), which is on the old grid.`, suggestion: 'Place it in the map editor.', status: 'open' });
    }
    out.push(n);
  }
  return out;
}

function osmNode(m: Measured, re: RegExp): LL | undefined {
  return [...m.namedNodes].find(([k]) => re.test(k))?.[1];
}

export { CODE_MUNI, MUNI_TOWN };

/* ---------------- re-placing the records of the old grid ---------------- */

export interface ReplaceStats { placements: Record<string, number>; parcels: Record<string, number>; queued: string[] }

/**
 * Moves every record placed by a point (placements' geo, parcels' pos) from
 * the old memory grid onto the real one (rules in the header). Grid-slot
 * parcels follow their streets by themselves. Ids never change.
 */
export function replacePlaces(old: CityPackage, pkg: CityPackage, m: Measured, review: ReviewItem[]): ReplaceStats {
  const oldFns = frameFns(old.geography.frame!);
  const fns = frameFns(pkg.geography.frame!);
  const stats: ReplaceStats = { placements: {}, parcels: {}, queued: [] };
  const bump = (o: Record<string, number>, k: string) => { o[k] = (o[k] ?? 0) + 1; };
  const oldCross = old.streets.filter((s) => s.kind === 'cross').sort((a, b) => a.u! - b.u!);
  const newCross = pkg.streets.filter((s) => s.kind === 'cross').sort((a, b) => a.u! - b.u!);
  const newByName = new Map(newCross.map((s) => [s.name, s]));
  const oldAves = old.streets.filter((s) => s.kind === 'avenue');
  const newAves = pkg.streets.filter((s) => s.kind === 'avenue');
  const front = pkg.geography.profiles!.front.pts;
  const aveAt = (id: string, u: number): number | undefined => { const a = newAves.find((x) => x.id === id); if (!a || u < (a.from as number) - 40 || u > (a.to as number) + 40) return undefined; return profAt(a.path!, u); };
  const oldWW = old.geography.areas!.find((a) => a.id === 'westww')!;
  const newWW = pkg.geography.areas!.find((a) => a.id === 'westww')!;

  /** Old uv → new uv, keeping the spot relative to the streets around it. */
  const remap = (u: number, v: number): { u: number; v: number; ok: boolean; how: string } => {
    if (u >= oldWW.u0 - 30 && u <= oldWW.u1 + 30 && v >= oldWW.v0 - 30 && v <= oldWW.v1 + 30) {
      const tu = (u - oldWW.u0) / (oldWW.u1 - oldWW.u0); const tv = (v - oldWW.v0) / (oldWW.v1 - oldWW.v0);
      return { u: newWW.u0 + tu * (newWW.u1 - newWW.u0), v: newWW.v0 + Math.max(0, Math.min(1, tv)) * Math.min(400, newWW.v1 - newWW.v0), ok: true, how: 'the same spot of West Wildwood (scaled to its real streets)' };
    }
    let ia = -1; for (let i = 0; i < oldCross.length; i++) if (oldCross[i].u! <= u) ia = i;
    const A = oldCross[Math.max(0, ia)];
    const B = oldCross[Math.max(0, ia) + 1];
    const t = B ? (u - A.u!) / (B.u! - A.u!) : 0.5;
    const nA = newByName.get(A.name);
    if (!nA) return { u, v, ok: false, how: `its street ${A.name} is not on the new grid` };
    const after = newCross.find((s) => s.u! > nA.u! + 3);
    const nB = B && newByName.get(B.name);
    const adjacent = !!(nB && after && nB.name === after.name);
    const uEnd = after ? after.u! : nA.u! + 80;
    const nu = nA.u! + Math.max(0, Math.min(1, t)) * (uEnd - nA.u!);
    // v: the nearest reference line (the front, then the avenues), its offset kept within half the way to the next line.
    const refsOld: [string, number][] = [['front', 0], ...oldAves.map((a) => [a.id.slice(4), a.v!] as [string, number])];
    const ref = refsOld.reduce((b, r) => (Math.abs(r[1] - v) < Math.abs(b[1] - v) ? r : b));
    const dv = v - ref[1];
    const refV = ref[0] === 'front' ? profAt(front, nu) : aveAt(`ave:${ref[0]}`, nu);
    const nv0 = refV ?? profAt(front, nu) + v;
    const lines = [profAt(front, nu), ...newAves.map((a) => aveAt(a.id, nu)).filter((x): x is number => x !== undefined)].sort((a, b) => a - b);
    const nextLine = dv >= 0 ? lines.find((x) => x > nv0 + 1) : [...lines].reverse().find((x) => x < nv0 - 1);
    const lim = nextLine !== undefined ? Math.abs(nextLine - nv0) * 0.45 : Infinity;
    const nv = nv0 + Math.sign(dv) * Math.min(Math.abs(dv), lim);
    return { u: nu, v: nv, ok: true, how: adjacent ? `the same spot between ${A.name} and ${B?.name} (neighbours on the real grid too)` : `in the block north of ${A.name} (on the real grid its next street is ${after?.name ?? 'none'}${B ? `, not ${B.name}` : ''})` };
  };
  const ll = (u: number, v: number) => fns.toLngLat(u, v).map((x) => Math.round(x * 1e6) / 1e6) as [number, number];

  // Parcels by address (the tax list's PROP_LOC), per town.
  const MUN: Record<string, string> = { 'd:crest': '0515', 'd:north': '0507', 'd:westww': '0513' };
  const byAddr = new Map<string, { u: number; v: number; pin: string; loc: string }[]>();
  for (const p of m.parcels) {
    if (!p.address) continue;
    const a = parseAddress(p.address); if (!a) continue;
    const c = p.parts[0]; const g: LL = [c.reduce((s, q) => s + q[0], 0) / c.length, c.reduce((s, q) => s + q[1], 0) / c.length];
    const [u, v] = fns.toUv(g);
    const nums = a.numberTo ? [a.number, a.numberTo] : [a.number];
    for (const n of nums) { const k = `${p.mun}|${n}|${nkey(`${a.street.base} ${a.street.suffix ?? ''}`)}`; const l = byAddr.get(k); const rec = { u, v, pin: p.pin ?? p.id, loc: p.address }; if (l) l.push(rec); else byAddr.set(k, [rec]); }
  }
  const munOf = (addr: string, district?: string) => /north wildwood/i.test(addr) ? '0507' : /wildwood crest/i.test(addr) ? '0515' : /west wildwood/i.test(addr) ? '0513' : (district && MUN[district]) ?? '0514';
  const lookup = (addr: string, district?: string) => {
    const a = parseAddress(addr.split(',')[0]); if (!a) return undefined;
    const hits = byAddr.get(`${munOf(addr, district)}|${a.number}|${nkey(`${a.street.base} ${a.street.suffix ?? ''}`)}`);
    return hits?.length ? hits[0] : undefined;
  };

  // Corners: "<a> at <b>", "<a> & <b>".
  const crossOf = (txt: string) => newCross.find((s) => !s.hidden && new RegExp(`\\b${(s.label ?? s.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(txt)) ?? newCross.find((s) => s.hidden && txt.includes(s.name));
  const aveOf = (txt: string): string | undefined => {
    if (/boardwalk/i.test(txt)) return 'bw';
    for (const a of newAves) for (const n of Object.values(a.names ?? {})) if (n && new RegExp(`\\b${n.replace(/ Ave$/, '')}\\b`, 'i').test(txt)) return a.id.slice(4);
    return undefined;
  };
  const bwV = (u: number) => profAt(pkg.streets.find((s) => s.kind === 'boardwalk')!.path!, u);

  const hunts = old.placements.find((p) => p.id === 'hunts-pier');
  const huntsOld = hunts ? oldFns.toUv(hunts.geo) : undefined;
  const huntsNew = hunts ? fns.toUv(hunts.geo) : undefined;

  for (const p of pkg.placements) {
    const o = old.placements.find((x) => x.id === p.id)!;
    const [ou, ov] = oldFns.toUv(o.geo);
    const note = (how: string) => { p.evidence = { ...p.evidence, source: `${p.evidence.source} [Re-placed 2026-10-29 onto the real street grid: ${how}.]` }; };
    if (o.evidence.confidence === 'verified') { bump(stats.placements, 'kept-verified'); continue; }
    if (/hunt's pier/i.test(o.address) && huntsOld && huntsNew) {
      p.geo = ll(huntsNew[0] + (ou - huntsOld[0]), huntsNew[1] + (ov - huntsOld[1]));
      note('kept its offset from the sourced Hunt\'s Pier point'); bump(stats.placements, 'relative-to-verified'); continue;
    }
    const hit = /^\s*\d/.test(o.address) ? lookup(o.address, p.parcelId ? pkg.parcels.find((x) => x.id === p.parcelId)?.districtId : undefined) : undefined;
    if (hit) { p.geo = ll(hit.u, hit.v); note(`the tax parcel at ${hit.loc} (${hit.pin})`); bump(stats.placements, 'address'); continue; }
    const c = crossOf(o.address); const a = aveOf(o.address);
    if (c && a) {
      const oc = old.streets.find((s) => s.kind === 'cross' && s.name === c.name);
      const oa = a === 'bw' ? 0 : old.streets.find((s) => s.id === `ave:${a}`)?.v;
      const du = oc ? Math.max(-45, Math.min(45, ou - oc.u!)) : 12;
      const dvv = oa !== undefined ? Math.max(-45, Math.min(45, ov - oa)) : (a === 'bw' ? 30 : 12);
      const u = c.u! + du;
      const base = a === 'bw' ? bwV(u) : aveAt(`ave:${a}`, u);
      if (base !== undefined) {
        p.geo = ll(u, base + dvv);
        note(`the corner of ${c.label ?? c.name} and ${a === 'bw' ? 'the Boardwalk' : newAves.find((x) => x.id === `ave:${a}`)!.names![pkg.geography.subTowns!.find((t) => u < t.uMax)!.id] ?? a} on the real grid (its offset from the corner kept)`);
        bump(stats.placements, 'corner');
        if (c.hidden) { stats.queued.push(p.id); review.push({ id: `rq-place-${p.id}`, kind: 'place-on-unknown-street', priority: 'high', target: { layer: 'placements', id: p.id }, detail: `${p.name} (${o.address}): ${c.name} is not a real street; placed beside its stand-in.`, suggestion: 'Find the real corner and move it in the map editor.', status: 'open' }); }
        continue;
      }
    }
    const r = remap(ou, ov);
    p.geo = ll(r.u, r.v);
    note(`${r.how} (old grid position mapped street by street)`);
    bump(stats.placements, 'street-relative');
    stats.queued.push(p.id);
    review.push({ id: `rq-place-${p.id}`, kind: 'place-approximate', priority: 'medium', target: { layer: 'placements', id: p.id }, detail: `${p.name} (${o.address}): no corner or tax-list address to place it by; moved ${r.how}.`, suggestion: 'Confirm the spot (Sanborn 1950, a directory) and correct it in the map editor.', status: 'open' });
  }
  for (const pc of pkg.parcels) {
    if (!pc.pos) { bump(stats.parcels, pc.slot ? 'grid-slot' : 'no-position'); continue; }
    const r = remap(pc.pos.u, pc.pos.v);
    const hit = pc.address ? lookup(pc.address, pc.districtId) : undefined;
    if (hit && Math.hypot(hit.u - r.u, hit.v - r.v) <= 150) {
      pc.pos = { u: Math.round(hit.u), v: Math.round(hit.v) };
      pc.evidence = { ...pc.evidence, source: `${pc.evidence.source} [Re-placed 2026-10-29 at the tax parcel with its address, ${hit.loc}.]` };
      bump(stats.parcels, 'address'); continue;
    }
    pc.pos = { u: Math.round(r.u), v: Math.round(r.v) };
    pc.evidence = { ...pc.evidence, source: `${pc.evidence.source} [Re-placed 2026-10-29: ${r.how}.]` };
    bump(stats.parcels, r.how.startsWith('the same spot') ? 'street-relative' : 'street-relative-block');
    if (!r.ok) { stats.queued.push(pc.id); review.push({ id: `rq-parcel-${pc.id}`, kind: 'parcel-not-placed', priority: 'high', target: { layer: 'parcels', id: pc.id }, detail: `${pc.id} (${pc.address}): ${r.how}`, suggestion: 'Place it in the map editor.', status: 'open' }); }
  }
  const invented = pkg.parcels.filter((p) => p.pos && p.residential).length;
  review.push({ id: 'rq-house-lot-addresses', kind: 'invented-addresses', priority: 'low', detail: `${invented} invented house lots keep their invented house numbers, which do not follow the real numbering (moved by their block, not by number; ${stats.parcels.address ?? 0} matched a real tax-list address near their block and stand on it).`, suggestion: 'Renumber them from the parcels they now stand on, or leave them as fiction.', status: 'open' });
  return stats;
}

/* ---------------- frontage ---------------- */

/** Re-derives the districts' frontage runs and the fill runs on the real order: each run covers its records' streets and its old ends. */
export function refitFrontage(old: CityPackage, pkg: CityPackage, review: ReviewItem[]): Record<string, unknown> {
  const cross = pkg.streets.filter((s) => s.kind === 'cross' && !s.hidden).sort((a, b) => a.u! - b.u!);
  const all = pkg.streets.filter((s) => s.kind === 'cross');
  const uOf = (n: string) => all.find((s) => s.name === n)?.u;
  const seedsOn = (zone: string, run: string) => pkg.parcels.filter((p) => p.zone === zone && p.slot?.run === run).map((p) => p.slot!.cross);
  const ww = pkg.geography.areas!.find((a) => a.id === 'westww')!;
  const out: Record<string, unknown> = {};
  const span = (zone: string, run: string, from: string, to: string): [string, string] => {
    if (run === 'ww') { const inWW = cross.filter((s) => s.u! >= ww.u0 && s.u! <= ww.u1); return [inWW[0].name, inWW[inWW.length - 1].name]; }
    if (run === 'cw') return [from, to];
    const names = [from, to, ...seedsOn(zone, run)];
    const us = names.map((n) => ({ n, u: uOf(n) })).filter((x): x is { n: string; u: number } => x.u !== undefined).sort((a, b) => a.u - b.u);
    // The run ends one street past its last record (a slot is the block north of its street).
    const last = us[us.length - 1];
    const nxt = cross.find((s) => s.u! > last.u + 3);
    return [us[0].n, nxt && !names.includes(nxt.name) && seedsOn(zone, run).includes(last.n) ? nxt.name : last.n];
  };
  const blocks = (a: string, b: string) => { const ua = uOf(a)!; const ub = uOf(b)!; return all.filter((s) => s.u! >= Math.min(ua, ub) && s.u! < Math.max(ua, ub)).length; };
  for (const d of pkg.districts) for (const f of d.frontage ?? []) {
    const [a, b] = span(f.zone, f.run, f.from, f.to);
    out[`${d.id} ${f.run}`] = `${f.from}–${f.to} → ${a}–${b}`;
    f.from = a; f.to = b;
  }
  const oldFill = old.generation!.fill as { zone: string; run: string; from: string; to: string; p: number }[];
  const oldAll = old.streets.filter((s) => s.kind === 'cross');
  const oldBlocks = (a: string, b: string) => { const ua = oldAll.find((s) => s.name === a)!.u!; const ub = oldAll.find((s) => s.name === b)!.u!; return oldAll.filter((s) => s.u! >= Math.min(ua, ub) && s.u! < Math.max(ua, ub)).length; };
  for (const f of pkg.generation!.fill as { zone: string; run: string; from: string; to: string; p: number }[]) {
    const o = oldFill.find((x) => x.zone === f.zone && x.run === f.run)!;
    const [a, b] = span(f.zone, f.run, f.from, f.to);
    const nb = blocks(a, b); const ob = oldBlocks(o.from, o.to);
    // Keep about as many generated lots per run as before (the real grid has more, shorter blocks).
    const p = Math.round(Math.min(o.p, (o.p * ob) / Math.max(1, nb)) * 100) / 100;
    out[`fill ${f.zone} ${f.run}`] = `${f.from}–${f.to} (${ob} blocks, p ${o.p}) → ${a}–${b} (${nb} blocks, p ${p})`;
    f.from = a; f.to = b; f.p = p;
  }
  review.push({ id: 'rq-frontage-refit', kind: 'district-frontage', priority: 'medium', detail: `The districts' frontage runs and the generated-lot runs were re-fitted to the real street order (each covers its 1960 records and its old end streets); the generated-lot odds were scaled so a new game gets about as many lots as before. ${Object.entries(out).map(([k, v]) => `${k}: ${v}`).join('; ')}`, suggestion: 'Check that each district covers the stretch it should (Pacific Avenue\'s club row, the docks).', status: 'open' });
  return out;
}

/* ---------------- district outlines ---------------- */

export interface SlotLike { zone: string; u0: number; u1: number; v0: number; v1: number }

/**
 * The districts' outlines on the real island: the Crest, North Wildwood and
 * West Wildwood are their towns' ground (municipal lines from the tax parcels);
 * the Boardwalk district is the boards' strip (beach to Ocean Avenue, Cresse to
 * 16th Avenue); the rest of Wildwood goes to the district whose 1960 lots stand
 * nearest (Pacific Avenue, downtown, the docks); the causeway district is the
 * causeway's course and its mainland end. Traced at 20 m into rings.
 */
export function districtOutlines(m: Measured, pkg: CityPackage, slots: SlotLike[], lab: Uint8Array, r: Raster): Record<string, [number, number][][]> {
  const zoneDistrict = new Map<string, string>();
  for (const d of pkg.districts) for (const z of d.zones ?? []) zoneDistrict.set(z, d.id);
  const cross = pkg.streets.filter((s) => s.kind === 'cross');
  const cu = (n: string) => cross.find((s) => s.name === n)!.u!;
  const uC = cu('Cresse Ave'); const u16 = cu('16th Ave');
  const oc = pkg.streets.find((s) => s.id === 'ave:oc')!;
  const front = pkg.geography.profiles!.front.pts;
  const ocAt = (u: number) => (u >= (oc.from as number) && u <= (oc.to as number) ? profAt(oc.path!, u) : profAt(front, u) + 80);
  const mun = spreadRaster(m.muni, 6);
  const inner = slots.filter((s) => ['pacific', 'downtown', 'docks'].includes(s.zone)).map((s) => ({ ...s, d: zoneDistrict.get(s.zone)! }));
  const B = 300; const buckets = new Map<number, typeof inner>();
  for (const s of inner) for (let b = Math.floor(s.u0 / B); b <= Math.floor(s.u1 / B); b++) { const l = buckets.get(b); if (l) l.push(s); else buckets.set(b, [s]); }
  const nearest = (u: number, v: number) => {
    let best: { d: string; dist: number } | undefined;
    for (let ring = 0; ring < 12; ring++) {
      for (const b of ring ? [Math.floor(u / B) - ring, Math.floor(u / B) + ring] : [Math.floor(u / B)]) for (const s of buckets.get(b) ?? []) {
        const du = Math.max(s.u0 - u, 0, u - s.u1); const dv = Math.max(s.v0 - v, 0, v - s.v1);
        const dist = Math.hypot(du, dv * 1.3);
        if (!best || dist < best.dist) best = { d: s.d, dist };
      }
      if (best && best.dist < ring * B) break;
    }
    return best?.d;
  };
  const cw = pkg.routes.find((x) => x.kind === 'causeway');
  const cwPath = cw?.path ?? [];
  const nearCw = (u: number, v: number) => { for (let i = 1; i < cwPath.length; i++) { const a = cwPath[i - 1]; const b = cwPath[i]; const dx = b[0] - a[0]; const dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / L2)); if (Math.hypot(u - a[0] - t * dx, v - a[1] - t * dy) < 70) return true; } return false; };
  const cwSlots = slots.filter((s) => s.zone === 'causeway');
  const label = (k: number): string | null => {
    const i = k % r.cols; const j = (k - i) / r.cols;
    const u = r.u0 + (i + 0.5) * r.cell; const v = r.v0 + (j + 0.5) * r.cell;
    const L = lab[k];
    if (L === 3) return 'd:westww';
    if (L === 1 || L === 2) {
      if (u >= uC && u <= u16 && v < ocAt(u) - 9) return 'd:boardwalk';
      const mc = mun.data[k];
      if (mc === 1 || (!mc && u < uC)) return 'd:crest';
      if (mc === 3) return 'd:north';
      return nearest(u, v) ?? 'd:downtown';
    }
    if (cwSlots.some((s) => u >= s.u0 - 60 && u <= s.u1 + 60 && v >= s.v0 - 60 && v <= s.v1 + 60) || (v > profAt(pkg.geography.profiles!.bay.pts, u) && nearCw(u, v))) return 'd:causeway';
    return null;
  };
  const cs = 2; const cols = Math.ceil(r.cols / cs); const rows = Math.ceil(r.rows / cs);
  const L = (ii: number, jj: number) => { const i = Math.min(r.cols - 1, ii * cs + 1); const j = Math.min(r.rows - 1, jj * cs + 1); return label(j * r.cols + i); };
  const shapes = regionsFromGrid(cols, rows, L, (x, y) => [r.u0 + x * cs * r.cell, r.v0 + y * cs * r.cell], { vote: 2, smooth: 1 });
  const out: Record<string, [number, number][][]> = {};
  for (const [id, rings] of shapes) out[id] = rings.filter((x) => Math.abs(ringArea(x)) > 6000).map((x) => simplifyRing(x as UVp[], 8).map(([u, v]) => [r0(u), r0(v)] as [number, number])).filter((x) => x.length >= 4);
  return out;
}

/**
 * The world map's Wildwood districts (public/geo/wildwood.json): the package's
 * district outlines through its frame to lon/lat, by game district id, and the
 * piers as their decks. Coordinates to 1e-5° (~1 m).
 */
export function worldMapDistricts(pkg: CityPackage): { type: 'FeatureCollection'; features: unknown[] } {
  const f = frameFns(pkg.geography.frame!);
  const ll = (r: [number, number][]) => { const ring = r.map(([u, v]) => f.toLngLat(u, v).map((x) => Math.round(x * 1e5) / 1e5) as [number, number]); return [...ring, ring[0]]; };
  const features: unknown[] = [];
  for (const d of pkg.districts) {
    if (!d.gameDistrict) continue;
    const rings = pkg.geography.outlines?.[d.id] ?? (d.polygon.length ? [d.polygon] : []);
    if (!rings.length) continue;
    features.push({ type: 'Feature', properties: { id: d.gameDistrict }, geometry: rings.length === 1 ? { type: 'Polygon', coordinates: [ll(rings[0])] } : { type: 'MultiPolygon', coordinates: rings.map((r) => [ll(r)]) } });
  }
  const bw = pkg.streets.find((s) => s.kind === 'boardwalk');
  const bwV = (u: number) => (bw?.path ? profAt(bw.path, u) : 0);
  const decks = pkg.landmarks.filter((l) => l.kind === 'pier' && l.pos && l.size).map((l) => { const { u } = l.pos!; const { w, d } = l.size!; const b = bwV(u) - (bw?.width ?? 16); return [ll([[u - w / 2, b], [u + w / 2, b], [u + w / 2, b - d], [u - w / 2, b - d]])]; });
  if (decks.length) features.push({ type: 'Feature', properties: { id: 'piers' }, geometry: { type: 'MultiPolygon', coordinates: decks } });
  return { type: 'FeatureCollection', features };
}
