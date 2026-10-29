/**
 * City configurations: everything a city import needs that is not code.
 * Wildwood is the first; Atlantic City and Philadelphia are configured so the
 * same pipeline runs for them next (their sources are listed, not yet fetched).
 *
 * Bounding boxes are [west, south, east, north] in EPSG:4326.
 */

export type BBox4 = [number, number, number, number];

export interface ImportArea {
  id: string;
  name: string;
  bbox: BBox4;
  /** Municipality codes (NJ MOD-IV PCL_MUN) the parcels may come from. */
  municipalities?: string[];
  /** How the game layer is generalized: coordinates rounded to `round` metres, outlines simplified to `simplify` metres (0: kept). */
  gameLayer?: { round: number; simplify: number };
  note?: string;
}

export interface SourceConfig {
  id: string;
  /** 1 = OpenStreetMap, 2 = NJGIN, 3 = Philadelphia open data, 4 = Library of Congress. */
  priority: 1 | 2 | 3 | 4;
  name: string;
  kind: 'osm' | 'arcgis-featureserver' | 'loc-iiif' | 'philly-opendata' | 'manual';
  endpoint: string;
  license: string;
  attribution: string;
  /** What the source is used for. */
  layers: string[];
  notes?: string[];
}

export interface CityConfig {
  id: string;
  name: string;
  state: string;
  /** Origin of the local metric CRS (roughly the middle of the city). */
  origin: { lon: number; lat: number };
  targetYear: number;
  /** The game frame the pack's game coordinates are expressed in ('wildwood-island-uv' or 'local' for a city with no game map yet). */
  gameFrame: 'wildwood-island-uv' | 'local';
  areas: ImportArea[];
  sources: SourceConfig[];
  /** Sanborn volumes known for the city (LOC item ids). */
  sanborn?: { item: string; title: string; date: string; scanned: boolean; note?: string }[];
}

const OSM: SourceConfig = {
  id: 'osm',
  priority: 1,
  name: 'OpenStreetMap',
  kind: 'osm',
  endpoint: 'https://overpass-api.de/api/interpreter (fallback for small boxes: https://api.openstreetmap.org/api/0.6/map.json)',
  license: 'ODbL 1.0',
  attribution: '© OpenStreetMap contributors (https://www.openstreetmap.org/copyright)',
  layers: ['roads', 'water', 'rail', 'buildings', 'businesses'],
  notes: ['Modern data: every feature is unverified for the target year until checked against historical evidence.'],
};

/** NJ MOD-IV parcel fields kept. Owner names, mailing addresses and sale data are deliberately excluded. */
export const NJ_PARCEL_FIELDS = ['OBJECTID', 'PAMS_PIN', 'GIS_PIN', 'PCL_MUN', 'PCLBLOCK', 'PCLLOT', 'PCLQCODE', 'PCLLASTUPD', 'COUNTY', 'MUN_NAME', 'PROP_LOC', 'PROP_CLASS', 'BLDG_DESC', 'LAND_DESC', 'CALC_ACRE', 'FAC_NAME', 'PROP_USE', 'BLDG_CLASS', 'YR_CONSTR', 'DWELL', 'COMM_DWELL', 'PCL_PBDATE', 'PCL_GUID'];
/** Fields that must never be requested or stored (privacy). */
export const NJ_PARCEL_FORBIDDEN = ['OWNER_NAME', 'ST_ADDRESS', 'CITY_STATE', 'ZIP_CODE', 'ZIP5', 'SALE_PRICE', 'DEED_BOOK', 'DEED_PAGE', 'DEED_DATE', 'SALES_CODE', 'LAST_YR_TX', 'NET_VALUE', 'LAND_VAL', 'IMPRVT_VAL', 'OLD_PROP', 'OLD_BLOCK', 'OLD_LOT'];

const NJGIN_PARCELS: SourceConfig = {
  id: 'njgin-parcels',
  priority: 2,
  name: 'NJGIN / NJOGIS Parcels Composite (with MOD-IV attributes)',
  kind: 'arcgis-featureserver',
  endpoint: 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0',
  license: 'NJ public data (NJOGIS terms of use; attribution requested)',
  attribution: 'Parcels: NJ Office of GIS (NJOGIS), Cape May County; MOD-IV tax-list attributes via NJ Division of Taxation',
  layers: ['parcels'],
  notes: ['Owner names, mailing addresses and sale data are never requested (outFields allowlist).', 'YR_CONSTR is the assessor\'s year built: used as medium-confidence evidence only.'],
};

const NJGIN_AERIALS: SourceConfig = {
  id: 'njgin-aerials-1930',
  priority: 2,
  name: 'NJGIN historical aerial imagery (1930) — reference for manual verification',
  kind: 'manual',
  endpoint: 'https://njgin.nj.gov/ (NJ 1930 aerial mosaic; image service, not vector data)',
  license: 'NJ public data',
  attribution: 'NJ Office of GIS (NJOGIS), historical aerial imagery',
  layers: [],
  notes: ['Imagery is for a person to compare against; the importer does not trace buildings from it.'],
};

const LOC_SANBORN: SourceConfig = {
  id: 'loc-sanborn',
  priority: 4,
  name: 'Library of Congress — Sanborn Fire Insurance Maps',
  kind: 'loc-iiif',
  endpoint: 'https://www.loc.gov/item/{item}/?fo=json (sheet images via IIIF: https://tile.loc.gov/image-services/iiif/...)',
  license: 'Public domain (LOC Sanborn Maps Collection: no known restrictions)',
  attribution: 'Sanborn Map Company; Library of Congress, Geography and Map Division',
  layers: ['historical evidence'],
};

const LOC_DIRECTORIES: SourceConfig = {
  id: 'loc-directories',
  priority: 4,
  name: 'City directories (LOC / other public-domain scans) — OCR into candidate businesses',
  kind: 'manual',
  endpoint: 'https://www.loc.gov/ (directory scans; pages are added by hand to citydata/<city>/raw/directories/)',
  license: 'Public domain scans only',
  attribution: 'As listed per page in the directory manifest',
  layers: ['business candidates'],
};

export const WILDWOOD: CityConfig = {
  id: 'wildwood',
  name: 'Wildwood (Five Mile Beach)',
  state: 'NJ',
  // Near Pacific & Schellenger Aves.
  origin: { lon: -74.8145, lat: 38.9922 },
  targetYear: 1960,
  gameFrame: 'wildwood-island-uv',
  areas: [
    {
      id: 'test-blocks',
      name: 'Wildwood: Lincoln Ave to 26th Ave, Park Blvd to Pacific Ave (test area)',
      bbox: [-74.8185, 38.9895, -74.8105, 38.995],
      municipalities: ['0514', '0507'],
      note: 'A few connected blocks first, before the island.',
    },
    {
      id: 'island',
      name: 'Five Mile Beach: Wildwood Crest, Wildwood, North Wildwood, West Wildwood',
      bbox: [-74.865, 38.945, -74.775, 39.015],
      // NJ municipality codes (Cape May County 05xx), confirmed by the island download (2026-10-29): 0507 North Wildwood, 0513 West Wildwood, 0514 Wildwood, 0515 Wildwood Crest.
      municipalities: ['0507', '0513', '0514', '0515'],
      gameLayer: { round: 1, simplify: 0.8 },
      note: 'Imported 2026-10-29 from a browser hand-off (OSM API map.json, 36 tiles merged; NJOGIS parcels by PCL_MUN). The raw files (35 MB) are kept out of git: restore them with `handoff --area island --from <cache>`; their sha256 is in the manifest.',
    },
  ],
  sources: [OSM, NJGIN_PARCELS, NJGIN_AERIALS, LOC_SANBORN, LOC_DIRECTORIES],
  sanborn: [
    { item: 'sanborn05568_015', title: 'Sanborn Fire Insurance Map from New Jersey Coast, Vol. 4 (1909, corrected to Nov 1950)', date: '1950', scanned: true },
    { item: 'sanborn05568_027', title: 'New Jersey Coast, Vol. 4 (May 1958)', date: '1958-05', scanned: false, note: 'In the LOC catalog but not scanned online; the closest volume to 1960 if it is ever digitized.' },
  ],
};

export const ATLANTIC_CITY: CityConfig = {
  id: 'atlantic-city',
  name: 'Atlantic City',
  state: 'NJ',
  origin: { lon: -74.4357, lat: 39.3643 },
  targetYear: 1960,
  gameFrame: 'local',
  areas: [
    { id: 'test-blocks', name: 'Atlantic City: around Missouri Ave and the 500 Club (test area, not imported)', bbox: [-74.4420, 39.3580, -74.4330, 39.3640], municipalities: ['0102'], note: 'Configured only. 0102 is Atlantic City in the NJ municipal code list; confirm on first fetch.' },
  ],
  sources: [OSM, { ...NJGIN_PARCELS, attribution: 'Parcels: NJ Office of GIS (NJOGIS), Atlantic County; MOD-IV tax-list attributes via NJ Division of Taxation' }, LOC_SANBORN, LOC_DIRECTORIES],
};

export const PHILADELPHIA: CityConfig = {
  id: 'philadelphia',
  name: 'Philadelphia',
  state: 'PA',
  origin: { lon: -75.1652, lat: 39.9526 },
  targetYear: 1960,
  gameFrame: 'local',
  areas: [
    { id: 'test-blocks', name: 'South Philadelphia: around 9th St and Passyunk Ave (test area, not imported)', bbox: [-75.1640, 39.9330, -75.1560, 39.9390], note: 'Configured only.' },
  ],
  sources: [
    OSM,
    {
      id: 'philly-opendata',
      priority: 3,
      name: 'OpenDataPhilly / City of Philadelphia (building footprints, historical maps)',
      kind: 'philly-opendata',
      endpoint: 'https://phl.carto.com/api/v2/sql (CARTO SQL API) and https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services (City ArcGIS Online)',
      license: 'City of Philadelphia open data terms (per dataset)',
      attribution: 'City of Philadelphia, OpenDataPhilly',
      layers: ['buildings', 'historical maps'],
      notes: ['Stub: endpoints documented in fetch/philly.ts; the dataset ids must be confirmed against the catalog before the first run.'],
    },
    LOC_SANBORN,
    LOC_DIRECTORIES,
  ],
};

export const CITIES: Record<string, CityConfig> = { wildwood: WILDWOOD, 'atlantic-city': ATLANTIC_CITY, philadelphia: PHILADELPHIA };
