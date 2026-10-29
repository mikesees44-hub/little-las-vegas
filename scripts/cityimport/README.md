# City importer (dev time)

Builds a *city pack* of real geography for the game — streets, water, rail, parcels,
buildings, businesses — from documented sources, at development time only. Players
never trigger a download. Wildwood is imported — the whole island (Five Mile Beach) and
the first test blocks; Atlantic City and Philadelphia are configured in `config/cities.ts`
and use the same pipeline.

```
npx tsx scripts/cityimport/cli.ts fetch    --city wildwood --area test-blocks   # download + cache (polite)
npx tsx scripts/cityimport/cli.ts fetch    --offline                            # cache only: report what needs the network
npx tsx scripts/cityimport/cli.ts handoff  --from <dir> [--images a.jpg]        # files downloaded in a browser
npx tsx scripts/cityimport/cli.ts sheets   --item sanborn05568_015 --sheets ind3,63B,27 [--pct 50]
npx tsx scripts/cityimport/cli.ts build                                         # pack + game layer, then validate
npx tsx scripts/cityimport/cli.ts validate
npx tsx scripts/cityimport/cli.ts grid --area island --legacy <old wildwood.json>  # the game's street grid from OSM
npx tsx scripts/cityimport/cli.ts sanborn-geo --images <scans dir> --bundle 0043,0049 # georeference the 1950 sheets
```

## The whole island (2026-10-29)

The island raw files (OSM map.json, 36 tiles merged; NJOGIS parcels for 0507/0513/0514/0515, owner/mailing/sale
fields never requested) came from a browser hand-off and are **not in git** (35 MB; sha256 in `raw/manifest.json`):

```
npx tsx scripts/cityimport/cli.ts handoff --area island --from <folder with wildwood_island.osm.json and _parcels.geojson>
NODE_OPTIONS=--max-old-space-size=3000 npx tsx scripts/cityimport/cli.ts build --area island   # ~2.5 min
```

The island pack's bulky layers (buildings, parcels, roads, water, rail, blocks, nav, asset manifest, overrides:
~60 MB) are rebuilt by that command and kept out of git; `city.json` (counts, matching, Sanborn coverage),
`review-queue.json`, `businesses.json` and `sources-and-attribution.json` are committed. The game layer
`public/geo/imported-wildwood-island.json` is generalized for the page (`gameLayer` in `config/cities.ts`:
coordinates to 1 m, outlines Douglas–Peucker at 0.8 m): 7.7 MB, 1.2 MB gzipped, loaded only when the imported
view opens (it culls to the view; parcels and buildings appear below ~2.6 km across).

### The game's street grid (`grid`)

`build/islandgrid.ts` and `build/islandpkg.ts` re-derive the Wildwood town package's geography from the same data:
a curvilinear frame along New Jersey Avenue (u along the island, v inland from the Wildwood Boardwalk; its cross
direction leans with the streets), every cross street in its real order (105 on the grid), the avenues on their
measured courses, the island / town / West Wildwood / municipal outlines (parcels and streets inside the OSM
coastline), the front, beach and bay profiles, the causeway, and the district outlines. Records laid out on the
old memory grid are moved by what they say (a verified point stays; a tax-list address; a corner; else the same
spot between the same streets) and every id is kept; what could not be placed confidently is in
`packs/island/grid-review.json`. The street order is in `evidence/osm-street-order.json` (the tests check the game
against it). Old saves move their own added places once (`src/engine/legacyGrid.ts`).

### Sanborn 1950 (`sanborn-geo`)

Control points (street intersections read by eye off the 25% scans) are in `evidence/sanborn-1950-control-points.json`;
each is matched to where the two OSM centrelines cross, and each sheet (or each frame of a two-strip sheet) gets a
least-squares affine with its residuals and a leave-one-out check (`evidence/sanborn-1950-georef.json`). Sheets that
cannot be fitted (collinear points, streets gone from OSM) are listed with why; scans not examined are listed too.
The imported view's **1950 Sanborn** button draws the registered sheets (a few downscaled copies ship in
`public/sanborn/`; the rest by file name once the scans are in the asset store: `window.__SANBORN_BASE`). Buildings
record the sheets they stand on (`sanbornSheets`) and each sheet is a review task; no building was corrected from a
sheet automatically.

## On a machine with network

1. `fetch` (no `--offline`). Sources, in priority order:
   - **OpenStreetMap** — Overpass (`fetch/osm.ts`), tiled at 0.02°, 5 s between requests, up to 4 retries
     with exponential backoff / `Retry-After`; falls back to the API `map.json` call for boxes ≤ 0.0025 sq°.
   - **NJGIN parcels** — NJOGIS `Parcels_Composite_NJ_WM/FeatureServer/0` (`fetch/njgin-parcels.ts`):
     count, then pages of 1,000 ordered by OBJECTID, each page cached. `outFields` is an allowlist;
     owner names, mailing addresses and sale data are refused before any request is made.
   - **LOC Sanborn** — `https://www.loc.gov/item/<item>/?fo=json` → sheet list with IIIF URLs; `sheets`
     downloads chosen sheets one every 3 s.
   - **Philadelphia open data** — stub (`fetch/philly.ts`): endpoints documented, disabled until confirmed.
   - Set `CITYIMPORT_CONTACT=<email or URL>` so the User-Agent identifies you (OSM / NJGIN policy).
   - Node's built-in `fetch` does not use `HTTPS_PROXY`; behind a proxy, download in a browser and use `handoff`.
2. `build`, then look at the game: Wildwood map → *View* → **Imported blocks (beta)**.
3. Work the review queue (`packs/<area>/review-queue.json`); corrections made in the game's map editor
   export as `historical-overrides.json`.

Every source that cannot be reached is printed as `[SOURCE UNREACHABLE]` with the error; nothing is ever
substituted for it. The last report is kept in `citydata/<city>/raw/fetch-report-<area>.json` and copied into
`sources-and-attribution.json`.

## Layout

```
citydata/<city>/raw/             originals, never edited, with manifest.json (source, licence, URL, download date,
                                 who downloaded it, sha256, coverage)
citydata/<city>/evidence/        transcriptions (e.g. the Sanborn street index)
citydata/<city>/packs/<area>/    the city pack:
  city.json  roads.geojson  water.geojson  parcels.geojson  buildings.geojson  businesses.json
  historical-overrides.json  asset-manifest.json  sources-and-attribution.json  review-queue.json
  (+ rail.geojson  blocks.geojson  nav.json)
citydata/templates/period-1960.json   period architectural templates (configurable)
public/geo/imported-<city>-<area>.json  the compact game layer (game frame only; loaded when the view opens)
```

Coordinates: GeoJSON geometry is the original lon/lat (EPSG:4326). Each feature also has `properties.local`
(transverse Mercator metres about `originLonLat`, x east / y north) and `properties.game` (the town package's
island frame, the same metres PlanView draws). The three are kept separately and only ever derived from lon/lat.
Per-feature fields shared with the Python starter packs: `layer`, `sourceId`, `historicalStatus`, `validFrom`,
`validTo` (exclusive), `activeInTargetYear`, `eligibleForHistoricalGame` (verified only).

## Historical rules (target year 1960)

- Every modern feature is `unverified` until checked against period evidence.
- Assessor year built (MOD-IV `YR_CONSTR`): ≤ 1960 → *likely existed* (medium); > 1960 → *built after 1960,
  removed for 1960* (medium); missing/0 → *unknown* (kept visible as an open task).
- Overrides (`historical-overrides.json`): add / remove / keep / rename / move / set-years / verify / set-asset,
  each with evidence `{ year, source, confidence, note }`. Pipeline rules are `proposed`; editor corrections `accepted`.
- Directory OCR (`ocr/`): pages under `raw/directories/<id>/` with a manifest; the system `tesseract` reads them;
  a listing is a candidate only when its address matches exactly one parcel — everything else goes to review.
  Coordinates are never invented: a matched candidate sits at its parcel, and says so.

## Generated, not sourced

Heights (unless OSM `height`), roofs (unless `roof:shape`), templates, entrances (unless OSM `entrance`), blocks,
the walk graph, and *generated outlines* (parcels with an assessor building record and no surveyed outline) are
all marked `generated` with how they were made.
