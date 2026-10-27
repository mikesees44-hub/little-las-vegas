import { WILDWOOD_PACKAGE as PKG } from '../worldpack/cities';
import { displayName } from './characters';
import type { Lot } from './econState';
import { PLACES, placesIn, type PlaceFeature } from './placesGeo';
import type { Character, GameState } from './types';
import type { WalkNpc } from './walk';
import type { HotspotKind, WalkHotspot } from './walkData';

/**
 * The rest of the town on foot: stretches beyond the walkable Boardwalk at
 * Hunt's Pier, each one a painting of the street (the user's art) with the
 * places along it as cards. The places are the location layer's records
 * (placesGeo), so they follow the game year (a building's later occupant
 * takes its place), and where a place is a game lot its card has every verb
 * the Boardwalk's do (go in, make an offer, call a meeting, dirty work).
 * Each stretch also turns up a few of the district's own lots (for sale,
 * held by another family, yours) so there is always something to do there.
 *
 * Pure data and read-only helpers; nothing here changes the state.
 */

export interface WalkStretch {
  id: string;
  label: string;
  /** The street, in a few words (the header line). */
  where: string;
  /** The painting behind it, best first (asset keys; the UI falls back down the list). */
  backdrop: string[];
  /** The game zone (for Start a racket here, and the zone lots). */
  zone: string;
  /** The district whose capo walks it. */
  district: string;
  blurb: string;
  /** Location-layer ids, in the order you pass them walking. */
  places: string[];
  /** A line for each place, by id (the card's blurb). */
  lines: Record<string, string>;
  /** How many of the zone's own lots to turn up besides. */
  zoneLots: number;
}

/** The stretches, from the Wildwood town package (`walkStretches` there; the order is the walk order). */
export const STRETCHES: WalkStretch[] = PKG.walkStretches as WalkStretch[];

export const STRETCHES_BY_ID: Record<string, WalkStretch> = Object.fromEntries(STRETCHES.map((x) => [x.id, x]));

/** A stretch's place as the walk card's hotspot (no outline on a painting: the card is the place). */
export interface StretchSpot extends WalkHotspot {
  /** The location-layer record (absent for a zone lot). */
  place?: string;
}

function kindOf(f: PlaceFeature): HotspotKind {
  const k = f.properties.kind;
  if (f.properties.public || f.properties.establishment || k === 'church' || k === 'civic' || k === 'lighthouse' || k === 'landmark' || k === 'school') return 'landmark';
  if (k === 'pier') return 'pier';
  if (k === 'ride') return 'ride';
  return 'business';
}

function ownerLine(f: PlaceFeature): string | undefined {
  const p = f.properties;
  if (p.establishment) return 'A landmark establishment (never for sale)';
  if (p.public) return p.kind === 'church' ? 'The parish (not for sale)' : 'The city (not for sale)';
  if (p.kind === 'church') return 'The congregation (not for sale)';
  return undefined;
}

/** The place a feature is on a stretch. */
export function spotOfPlace(f: PlaceFeature, line?: string): StretchSpot {
  const p = f.properties;
  const art = [...(p.images.exterior ?? []), ...(p.images.turnaround ? [p.images.turnaround] : []), ...(p.images.interior ? [p.images.interior] : [])];
  const kind = kindOf(f);
  return {
    id: f.id, place: f.id, label: p.name, kind, poly: [], door: [0, 0],
    lots: p.lotId ? [p.lotId] : undefined,
    landmark: kind === 'landmark' || (!p.lotId && kind !== 'business') ? f.id : undefined,
    art: art.length ? art : undefined,
    address: p.address,
    ownerText: ownerLine(f),
    blurb: line ?? `${p.name}, ${p.address}.`,
  };
}

/**
 * The places standing on a stretch in the game year: each building's
 * occupant that year (a later one takes an earlier one's place), in walking
 * order, then a few of the zone's own lots (for sale first, then the other
 * families', then yours) that the location layer does not already show.
 */
export function stretchSpots(s: GameState, st: WalkStretch): StretchSpot[] {
  const open = placesIn(s.date.y);
  const out: StretchSpot[] = [];
  const seen = new Set<string>();
  const lotSeen = new Set<string>();
  for (const id of st.places) {
    const f = PLACES.find((x) => x.id === id);
    if (!f) continue;
    const cur = open.find((x) => x.properties.building === f.properties.building);
    if (!cur || seen.has(cur.id)) continue;
    seen.add(cur.id);
    if (cur.properties.lotId) lotSeen.add(cur.properties.lotId);
    out.push(spotOfPlace(cur, st.lines[cur.id] ?? st.lines[id]));
  }
  const placedLots = new Set(PLACES.map((f) => f.properties.lotId).filter(Boolean) as string[]);
  const rank = (l: Lot) => (l.status === 'sale' ? 0 : l.status === 'rival' ? 1 : l.owner === 'player' ? 2 : 3);
  const lots = (s.econ?.lots ?? [])
    .filter((l) => l.zone === st.zone && !lotSeen.has(l.id) && !placedLots.has(l.id) && l.status !== 'public' && (l.stage === undefined || l.stage === 'open' || l.status === 'sale'))
    .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
    .slice(0, st.zoneLots);
  for (const l of lots) {
    out.push({
      id: `lot:${l.id}`, label: l.name ?? l.address, kind: 'business', poly: [], door: [0, 0], lots: [l.id], address: l.address,
      blurb: l.status === 'sale' ? 'For sale: the owner wants out, and the price is on the window.' : l.status === 'rival' ? 'Another family holds this one. They will notice who walks in.' : l.owner === 'player' ? 'One of yours.' : 'A going concern on the block.',
    });
  }
  return out;
}

const free = (s: GameState, c: Character | undefined): c is Character => !!c && c.alive && !(c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week);

/** Who is out on a stretch this week: the district's capo if he is yours, the men running your places there, the rival bosses outside theirs. */
export function whoIsOnStretch(s: GameState, st: WalkStretch, spots = stretchSpots(s, st)): WalkNpc[] {
  const out: WalkNpc[] = [];
  const seen = new Set<string>([s.playerId]);
  const add = (c: Character, role: WalkNpc['role'], at: string, doing: string) => {
    if (seen.has(c.id) || out.length >= 6) return;
    seen.add(c.id);
    out.push({ charId: c.id, name: displayName(c), role, doing, at, pos: [0, 0], faction: c.faction });
  };
  const capoId = s.districts.find((d) => d.id === st.district)?.capoId;
  const capo = capoId ? s.characters[capoId] : undefined;
  const first = spots[0];
  if (free(s, capo) && capo.faction === 'player' && first) add(capo, 'capo', first.id, `Your capo, walking ${st.label.toLowerCase().replace(/^the /, 'the ')}`);
  for (const h of spots) {
    const l = h.lots ? s.econ?.lots.find((x) => x.id === h.lots![0]) : undefined;
    if (!l) continue;
    const m = s.econ?.managers[l.bizId ?? `lot:${l.id}`];
    const c = m?.charId ? s.characters[m.charId] : undefined;
    if (free(s, c)) add(c, 'manager', h.id, `Runs ${l.name ?? h.label} for you`);
    if (l.status === 'rival') {
      const r = s.rivals.find((x) => x.id === l.owner);
      const rc = r ? s.characters[r.leaderId] : undefined;
      if (free(s, rc)) add(rc, 'rival', h.id, `Outside ${l.name ?? h.label}, which his people hold`);
    }
  }
  return out;
}
