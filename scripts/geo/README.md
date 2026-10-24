# Map data pipeline

The bundled basemap in `src/ui/map/geo/` is built once, offline, and committed.

1. Land (OpenStreetMap-derived, 100 m): `npm pack @geo-maps/earth-lands-100m`, then
   `python3 1_filter_land.py` keeps the polygons touching North America and the East Coast.
2. `python3 2_simplify_land.py na|east|shore` simplifies per ring (Douglas–Peucker; the East Coast
   tiers are clipped to their boxes) into `land-na.json`, `land-east.json`, `land-shore.json`.
3. Natural Earth 10m (lakes, rivers, roads, populated places) from
   github.com/nvkelso/natural-earth-vector, filtered (US routes, the Garden State Parkway, the
   Atlantic City Expressway — shown only from 1964 — and the New Jersey and Pennsylvania turnpikes)
   and simplified with mapshaper into `lakes.topo.json`, `rivers.topo.json`, `roads.topo.json`,
   `places.json`.
4. `python3 4_wildwood_districts.py` lays the game's districts along the real Wildwood coastline
   (`wildwood.json`).
5. States and counties come straight from `us-atlas` (`us.topo.json`), borders from `world-atlas`.

Licences: OpenStreetMap data is ODbL (attribution shown on the map); US Census and Natural Earth
data are public domain.
