# ADR 0011: MapLibre map with OpenFreeMap tiles

**Status:** Accepted (2026-10-22).

**Context:** The Map tab and Plan's day map used Leaflet with raster tiles from `tile.openstreetmap.org`, which carry no building heights and whose usage policy is strict; dark mode was a CSS filter on the tile pane. A proof of concept (`docs/work/3d-map-poc.md`) showed a WebGL map with extruded OpenStreetMap buildings, and the user chose to replace Leaflet with it. Constraints: no Google API billing and no new API key (`AGENTS.md`), visible OpenStreetMap attribution, and the Docker image builds with webpack.

**Decision:**

- **Library and tiles:** both maps use MapLibre GL JS (`components/views/MapLibreMap.tsx`, `maplibre-gl` pinned). Tiles come from OpenFreeMap's keyless Liberty style (`https://tiles.openfreemap.org/styles/liberty`, unmodified OpenMapTiles schema). MapLibre 6's worker file is emitted by the bundler through `setWorkerUrl(new URL(..., import.meta.url))`.
- **Colours:** in both themes, Liberty is recoloured with the OSM Carto palette (`lib/osm-carto-style.ts`), so the map keeps the look of the openstreetmap.org tiles. In dark mode, every style colour is run through the `--map-tile-filter` token with the CSS Filter Effects formulas (`lib/css-filter-style.ts`). The canvas is not filtered, so 3D lighting stays correct.
- **Buildings:** buildings are extruded from the tiles' `render_height`. Walls shade by ambient occlusion relative to each building's own height, × (1 − 0.25 × (1 − t)). That needs a one-expression patch to MapLibre's extrusion shader, applied on `postinstall` by `scripts/patch-maplibre-shader.mjs`, which the Dockerfile copies in before `npm ci`. The script is idempotent and fails the install if a MapLibre upgrade changes the expression.
- **3D or 2D:** fits at city scale tilt to 45°. A 2D/3D button flattens the map; the choice is a per-device preference in `store/use-travel-store.ts`.
- **Gestures:** follow common map apps. Drag pans. Cmd, Ctrl or right-drag rotates and tilts, turning the same way as Google Maps. On a trackpad, two fingers pan and pinch zooms at the cursor; twist rotates in Safari only.
- **Routes:** routes from openrouteservice (ADR 0008) draw under the buildings.
- **Fallbacks:** if the OpenFreeMap style fails to load, the map switches to a flat raster style of `tile.openstreetmap.org` tiles inside MapLibre, with the same colour steps and no buildings. Without WebGL, the map area shows a message. Leaflet is removed.

**Consequences:**

- **OpenFreeMap:** it is free, needs no key, allows commercial use and states no request limits (checked 2026-10-22), but has no SLA and "may discontinue it at any time"; the raster fallback keeps the map usable in that case. Its attribution ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap") is required and shown by MapLibre; printed output that shows a map must carry it too.
- **Bundle size:** about 288 KB gzipped of map code plus a 147 KB gzipped worker, loaded only with a map view.
- **Shader patch:** every `maplibre-gl` upgrade must re-check it.
- **Not recolourable:** sprite icons (road shields, POI icons) keep their light-mode look in dark mode.
- **Not yet checked:** a real phone and real Safari, before shipping.
- **Places data:** the tiles' POI layer makes nearby suggestions possible without another API (see the Recommendations entry in `docs/FEATURES.md`).
