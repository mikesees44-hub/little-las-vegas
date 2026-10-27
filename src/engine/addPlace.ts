import { exportCityPackage, validateCityPackage, type BusinessRec, type CityPackage, type CityValidation, type Confidence, type Evidence, type Landmark, type MarketStatus, type NamePolicy, type Parcel, type Placement, type Years } from './cityPackage';
import { districtAt, slugOf, uniqueId } from './cityEdit';
import { frameFns } from './cityPackage';

/**
 * "Add a Place": one form in the town editor (and on a vacant lot's card)
 * that turns what you know about a real or invented place into the town
 * package's own records — a parcel (the building, which outlives its
 * occupants), a business (the occupant, with its years and its name rule),
 * a location-layer placement (the map point, art and footprint) or, for a
 * public place, a landmark — each with its evidence. The same records go
 * two ways: into the package JSON (Copy JSON, for the repository) and,
 * for the home town, live into the game in progress by their stable ids
 * (`s.addedPlaces`, read by hoodState/hoodGeo), where the place becomes an
 * ordinary property: drawn on the island, on the block map, on its walk
 * stretch, buyable through the Deal flow.
 *
 * Pure: no DOM, no randomness. Ids are made once from the name and never
 * reused (a save may hold the lot).
 */

export interface AddedPlaces {
  /** The package (town) each record belongs to, by town id. */
  [townId: string]: { parcels: Parcel[]; businesses: BusinessRec[]; placements: Placement[]; landmarks: Landmark[] };
}

export type PlaceStatus = 'operating' | 'vacant' | 'sale' | 'landmark';
/** What the place's evidence says, detail by detail. */
export type EvidenceDetail = 'location' | 'identity' | 'years' | 'appearance' | 'owner';

export interface PlaceDraft {
  /** 1 · Where: a package parcel (a vacant lot), a grid slot, or a point in the town's frame. */
  where: { mode: 'parcel'; parcelId: string } | { mode: 'slot'; run: string; cross: string; half: 'a' | 'b' | 'w' } | { mode: 'pos'; u: number; v: number };
  /** 2 · Identify. */
  name: string;
  use: string;
  /** A finer kind for art and templates (grocery, variety, bar …). */
  kind?: string;
  address: string;
  districtId?: string;
  /** Game zone (home town lots). */
  zone?: string;
  /** 3 · Years (approximate allowed). */
  years: Years;
  /** 4 · The building: an art key (or a generic template), its size, which way it faces, where the door is. */
  art?: string;
  template?: string;
  size: { w: number; d: number };
  /** Degrees, clockwise; 0 faces the ocean (the main street). */
  facing: number;
  entrance?: 'front' | 'side' | 'corner';
  floors?: number;
  built?: number;
  /** 5 · Gameplay: who holds it (unknown = an independent owner) and how it stands. */
  owner: 'unknown' | 'private' | 'city' | string;
  status: PlaceStatus;
  operator?: string;
  /** 6 · Evidence. */
  namePolicy: NamePolicy;
  nearMissOf?: string;
  source: string;
  confidence: Partial<Record<EvidenceDetail, Confidence>>;
  /** A business sharing another occupant's property (a bar on a pier). */
  shares?: boolean;
}

export interface PlaceRecords {
  parcel?: Parcel;
  business?: BusinessRec;
  placement?: Placement;
  landmark?: Landmark;
  /** The id the game knows the building by (the lot id). */
  buildingId: string;
}

const RANK: Confidence[] = ['verified', 'approximate', 'invented'];

/** The record's overall confidence: the weakest of its details (a verified address with an invented name is invented). */
export function overallConfidence(c: Partial<Record<EvidenceDetail, Confidence>>): Confidence {
  const vals = Object.values(c).filter(Boolean) as Confidence[];
  if (!vals.length) return 'invented';
  return vals.reduce((a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a), 'verified' as Confidence);
}

function evidenceOf(d: PlaceDraft, what: EvidenceDetail[]): Evidence & { details?: Partial<Record<EvidenceDetail, Confidence>> } {
  const sub: Partial<Record<EvidenceDetail, Confidence>> = {};
  for (const k of what) if (d.confidence[k]) sub[k] = d.confidence[k];
  const confidence = overallConfidence(Object.keys(sub).length ? sub : d.confidence);
  const scope = confidence === 'verified' ? (Object.entries(sub).filter(([, c]) => c === 'verified').map(([k]) => (k === 'location' ? 'address' : k === 'years' ? 'dates' : k === 'identity' ? 'identity' : 'footprint')) as Evidence['scope']) : undefined;
  const ev: Evidence & { details?: Partial<Record<EvidenceDetail, Confidence>> } = { confidence, source: d.source.trim() || (confidence === 'invented' ? 'A fictional place (Add a Place).' : 'Entered with Add a Place; add the source.') };
  if (scope?.length) ev.scope = scope;
  if (Object.keys(sub).length) ev.details = sub;
  return ev;
}

/** Where the draft stands in the town's frame. */
export function draftUV(pkg: CityPackage, d: PlaceDraft): { u: number; v: number } | undefined {
  if (d.where.mode === 'pos') return { u: d.where.u, v: d.where.v };
  if (d.where.mode === 'parcel') {
    const id = d.where.parcelId;
    const pc = pkg.parcels.find((x) => x.id === id);
    if (pc?.pos) return pc.pos;
    if (pc?.geo && pkg.geography.frame) { const [u, v] = frameFns(pkg.geography.frame).toUv(pc.geo); return { u, v }; }
    return undefined;
  }
  return undefined;
}

/** What is wrong with a draft before it is turned into records (empty: nothing). */
export function draftProblems(pkg: CityPackage, d: PlaceDraft): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push('Give it a name.');
  if (!d.use.trim()) out.push('Say what it is (a use: diner, motel, bar …).');
  if (d.where.mode === 'parcel' && !pkg.parcels.some((x) => x.id === (d.where as { parcelId: string }).parcelId)) out.push('That lot is not in this town.');
  if (d.namePolicy === 'historical' && d.years.to === undefined) out.push('A real name is only for a place that has closed: give the year it closed, or use a near-miss name.');
  if (d.namePolicy === 'near-miss' && d.nearMissOf && d.nearMissOf.trim().toLowerCase() === d.name.trim().toLowerCase()) out.push('A near-miss name must differ from the real one.');
  if (d.years.from !== undefined && d.years.to !== undefined && d.years.from > d.years.to) out.push('It opens after it closes.');
  if (!(d.size.w > 0 && d.size.d > 0)) out.push('Give the building a size.');
  return out;
}

/**
 * The draft as package records, added to a copy of the package. A landmark
 * (never ownable) becomes a landmark record; anything else a parcel with its
 * occupant. On an existing parcel only the occupant (and a placement) is
 * added: the building is already there.
 */
export function draftToRecords(pkg: CityPackage, d: PlaceDraft): { pkg: CityPackage; rec: PlaceRecords; validation: CityValidation } {
  const p = JSON.parse(JSON.stringify(pkg)) as CityPackage;
  const uv = draftUV(p, d);
  const slug = slugOf(d.name);
  const geo = uv && p.geography.frame ? frameFns(p.geography.frame).toLngLat(uv.u, uv.v).map((x) => Number(x.toFixed(6))) as [number, number] : undefined;
  const rec: PlaceRecords = { buildingId: '' };
  if (d.status === 'landmark') {
    const id = uniqueId(p, `lm:${slug}`);
    const l: Landmark = { id, name: d.name.trim(), kind: d.kind ?? d.use, ownable: false, evidence: evidenceOf(d, ['location', 'identity', 'years']) };
    if (uv) l.pos = { u: Math.round(uv.u), v: Math.round(uv.v) };
    else if (geo) l.geo = geo;
    const di = d.districtId ?? (uv ? districtAt(p, uv) : undefined);
    if (di) l.districtId = di;
    if (d.years.from !== undefined || d.years.to !== undefined) l.years = { ...d.years };
    if (d.art) l.art = [d.art];
    p.landmarks.push(l);
    rec.landmark = l;
    rec.buildingId = id;
  } else {
    let parcelId: string;
    if (d.where.mode === 'parcel') parcelId = d.where.parcelId;
    else {
      parcelId = uniqueId(p, `add-${slug}`);
      const status: MarketStatus = d.status === 'sale' ? 'sale' : d.status === 'vacant' ? 'lease' : d.owner === 'city' ? 'public' : d.owner !== 'unknown' && d.owner !== 'private' ? 'rival' : 'private';
      const pc: Parcel = {
        id: parcelId, districtId: d.districtId ?? (uv ? districtAt(p, uv) : undefined) ?? p.districts[0]?.id ?? '', address: d.address.trim(),
        footprint: { w: Math.round(d.size.w), d: Math.round(d.size.d) }, rotation: d.facing,
        structure: { built: d.built ?? d.years.from ?? p.era.from, condition: 70, floors: d.floors ?? 1, style: d.template },
        market: { status, owner: status === 'rival' ? d.owner : status === 'public' ? 'city' : 'private' },
        evidence: evidenceOf(d, ['location']),
      };
      if (d.zone) pc.zone = d.zone;
      if (d.where.mode === 'slot') pc.slot = { run: d.where.run, cross: d.where.cross, half: d.where.half };
      else if (uv) pc.pos = { u: Math.round(uv.u), v: Math.round(uv.v) };
      if (d.art) pc.art = [d.art];
      if (!pc.structure!.style) delete pc.structure!.style;
      p.parcels.push(pc);
      rec.parcel = pc;
    }
    rec.buildingId = parcelId;
    if (d.status !== 'vacant') {
      const id = uniqueId(p, `b:${parcelId}${p.businesses.some((b) => b.parcelId === parcelId) ? `-${slug}` : ''}`);
      const b: BusinessRec = { id, parcelId, name: d.name.trim(), use: d.use, years: { ...d.years }, namePolicy: d.namePolicy, evidence: evidenceOf(d, ['identity', 'years']) };
      if (d.kind) b.kind = d.kind;
      if (d.operator?.trim()) b.operator = d.operator.trim();
      if (d.nearMissOf?.trim()) b.nearMissOf = d.nearMissOf.trim();
      if (d.shares) b.shares = true;
      if (d.art) b.art = [d.art];
      if (b.years.from === undefined) delete b.years.from;
      if (b.years.to === undefined) delete b.years.to;
      if (!b.years.approx) delete b.years.approx;
      p.businesses.push(b);
      rec.business = b;
    }
    if (geo) {
      const pid = rec.parcel ? parcelId : uniqueId(p, `pl-${slug}`);
      const pl: Placement = {
        id: pid, building: parcelId, parcelId, name: d.name.trim(), kind: d.kind ?? d.use, address: d.address.trim(), geo, years: { ...d.years },
        rotation: d.facing, footprint: { w: Math.round(d.size.w), d: Math.round(d.size.d) }, art: d.art ? { exterior: [d.art] } : {}, evidence: evidenceOf(d, ['location', 'appearance']),
      };
      if (pl.years.from === undefined) delete pl.years.from;
      if (pl.years.to === undefined) delete pl.years.to;
      if (!pl.years.approx) delete pl.years.approx;
      p.placements.push(pl);
      rec.placement = pl;
    }
  }
  return { pkg: p, rec, validation: validateCityPackage(p, { mode: 'draft' }) };
}

/** The records as a package fragment to paste (and the whole package, stable JSON). */
export function recordsJson(pkg: CityPackage, rec: PlaceRecords): { fragment: string; whole: string } {
  const frag = { parcels: rec.parcel ? [rec.parcel] : [], businesses: rec.business ? [rec.business] : [], placements: rec.placement ? [rec.placement] : [], landmarks: rec.landmark ? [rec.landmark] : [] };
  return { fragment: JSON.stringify(frag, null, 2), whole: exportCityPackage(pkg) };
}

/* ---------------- finding a location ---------------- */

export interface AddressHit { kind: 'parcel' | 'placement' | 'street' | 'landmark'; id: string; label: string; detail: string; u?: number; v?: number }

/** Searches a package for an address, a name or a street (case-insensitive, words in any order). */
export function searchAddress(pkg: CityPackage, q: string, limit = 12): AddressHit[] {
  const words = q.toLowerCase().split(/[\s,&]+/).filter((w) => w.length > 1 && !['the', 'and', 'ave', 'st', 'rd', 'at'].includes(w));
  if (!words.length) return [];
  const hit = (t: string) => words.every((w) => t.toLowerCase().includes(w));
  const out: AddressHit[] = [];
  const f = pkg.geography.frame ? frameFns(pkg.geography.frame) : undefined;
  const uvOf = (x: { pos?: { u: number; v: number }; geo?: [number, number] }) => x.pos ?? (x.geo && f ? (([u, v]) => ({ u, v }))(f.toUv(x.geo)) : undefined);
  for (const pc of pkg.parcels) {
    const occ = pkg.businesses.filter((b) => b.parcelId === pc.id).map((b) => b.name).join(' / ');
    if (hit(`${pc.address ?? ''} ${occ} ${pc.id}`)) { const at = uvOf(pc); out.push({ kind: 'parcel', id: pc.id, label: pc.address || pc.id, detail: occ || 'An empty lot', u: at?.u, v: at?.v }); }
  }
  for (const pl of pkg.placements) {
    if (pl.parcelId && out.some((h) => h.id === pl.parcelId)) continue;
    if (hit(`${pl.address} ${pl.name}`)) { const at = uvOf(pl); out.push({ kind: 'placement', id: pl.id, label: pl.address, detail: pl.name, u: at?.u, v: at?.v }); }
  }
  for (const l of pkg.landmarks) if (hit(l.name)) out.push({ kind: 'landmark', id: l.id, label: l.name, detail: 'A landmark', u: l.pos?.u, v: l.pos?.v });
  for (const st of pkg.streets) {
    if (!hit(`${st.name} ${Object.values(st.names ?? {}).join(' ')}`)) continue;
    out.push({ kind: 'street', id: st.id, label: st.name, detail: st.kind === 'cross' ? 'Cross street' : st.kind === 'avenue' ? 'Avenue' : st.kind, u: st.u, v: st.v });
  }
  // An intersection ("17th & Central"): two streets that both match a word each.
  const cross = pkg.streets.filter((s) => s.kind === 'cross' && words.some((w) => s.name.toLowerCase().includes(w)));
  const aves = pkg.streets.filter((s) => (s.kind === 'avenue' || s.kind === 'boardwalk') && words.some((w) => `${s.name} ${Object.values(s.names ?? {}).join(' ')}`.toLowerCase().includes(w)));
  for (const c of cross.slice(0, 3)) for (const a of aves.slice(0, 3)) {
    const v = a.kind === 'boardwalk' ? 40 : a.v!;
    out.unshift({ kind: 'street', id: `${c.id}+${a.id}`, label: `${c.name} & ${a.kind === 'boardwalk' ? 'the Boardwalk' : a.name}`, detail: 'Corner', u: c.u, v });
  }
  return out.slice(0, limit);
}

/** A blank draft for a point (or a lot), with friendly defaults. */
export function blankDraft(where: PlaceDraft['where'], address = ''): PlaceDraft {
  return {
    where, name: '', use: 'diner', address, years: {}, size: { w: 16, d: 22 }, facing: 0, entrance: 'front',
    owner: 'unknown', status: 'operating', namePolicy: 'fictional', source: '', confidence: { location: 'approximate', identity: 'invented', years: 'approximate' },
  };
}

/** The draft's name check, as the editor shows it (the rule the validator enforces). */
export function namePolicyNote(p: NamePolicy): string {
  return p === 'historical' ? 'A real place that has closed: its real name, with the year it closed.' : p === 'near-miss' ? 'A real place still open: a near-miss name, never its real one.' : 'An invented place.';
}

/* ---------------- into the game ---------------- */

/** Adds a place's records to the game in progress (the home town picks them up as a lot; nothing rerolls). */
export function addPlaceLive(s: { addedPlaces?: AddedPlaces }, townId: string, rec: PlaceRecords): void {
  s.addedPlaces ??= {};
  const t = (s.addedPlaces[townId] ??= { parcels: [], businesses: [], placements: [], landmarks: [] });
  const put = <T extends { id: string }>(list: T[], r?: T) => { if (!r) return; const i = list.findIndex((x) => x.id === r.id); if (i >= 0) list[i] = r; else list.push(r); };
  put(t.parcels, rec.parcel);
  put(t.businesses, rec.business);
  put(t.placements, rec.placement);
  put(t.landmarks, rec.landmark);
}

/** The package with this game's added places merged in (by id; the package's own records win). */
export function withAdded(pkg: CityPackage, added: AddedPlaces | undefined): CityPackage {
  const a = added?.[pkg.townId];
  if (!a) return pkg;
  const merge = <T extends { id: string }>(base: T[], more: T[]) => [...base, ...more.filter((r) => !base.some((b) => b.id === r.id))];
  return { ...pkg, parcels: merge(pkg.parcels, a.parcels), businesses: merge(pkg.businesses, a.businesses), placements: merge(pkg.placements, a.placements), landmarks: merge(pkg.landmarks, a.landmarks) };
}

export const STATUS_HELP: Record<PlaceStatus, string> = {
  operating: 'Open for business (somebody runs it).',
  vacant: 'The building stands empty (for rent).',
  sale: 'Open, and the owner will sell.',
  landmark: 'A public place or landmark: never for sale.',
};

export type { MarketStatus };
