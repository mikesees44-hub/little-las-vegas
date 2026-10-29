# Map data pipeline

The bundled basemap in `public/geo/` is built once, offline, and committed.

1. Land (OpenStreetMap-derived, 100 m): `npm pack @geo-maps/earth-lands-100m`, then
   `python3 1_filter_land.py` keeps the polygons touching North America and the East Coast.
2. `python3 2_simplify_land.py na|east|shore` simplifies per ring (Douglas–Peucker; the East Coast
   tiers are clipped to their boxes) into `land-na.json`, `land-east.json`, `land-shore.json`.
3. Natural Earth 10m (lakes, rivers, roads, populated places) from
   github.com/nvkelso/natural-earth-vector, filtered (US routes, the Garden State Parkway, the
   Atlantic City Expressway — shown only from 1964 — and the New Jersey and Pennsylvania turnpikes)
   and simplified with mapshaper into `lakes.topo.json`, `rivers.topo.json`, `roads.topo.json`,
   `places.json`.
4. The game's Wildwood districts (`wildwood.json`) come from the town package's district outlines (measured from OSM and the
   NJ parcels): `npx tsx scripts/cityimport/cli.ts grid-geo`. (`4_wildwood_districts.py` made the earlier, hand-laid version.)
   (`wildwood.json`).
5. States and counties come straight from `us-atlas` (`us.topo.json`), borders from `world-atlas`.
6. New York City, 1960 (`data/nyc/nyc-1960.json`, bundled into the page, ~225 KB): download the sources
   into `data/nyc/downloads/` (untracked; the commands are at the top of `5_nyc.ts`), then
   `npx tsx scripts/geo/5_nyc.ts`. It simplifies with mapshaper, cuts the game's districts
   (`src/engine/nycData.ts`) out of the Neighborhood Tabulation Areas, and projects everything to
   SVG paths. Sources: NYC Department of City Planning borough boundaries and NTAs (public domain),
   US Census TIGER/Line 2010 ZCTAs for the New Jersey / Westchester / Nassau shores (public domain);
   bridges, tunnels, ferries, the 1960 highways and the Bronx el are traced by hand (approximate).

Licences: OpenStreetMap data is ODbL (attribution shown on the map); US Census, NYC Department of
City Planning and Natural Earth data are public domain.
