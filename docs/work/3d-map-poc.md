# 3D map proof of concept

Status: PoC complete (2026-10-22) on `feat/3d-map-poc`. Phase 2 planned (W4–W8): port Plan's map features to MapLibre and add nearby suggestions from the tiles. Not started.

Goal: Prove that the Map tab (`components/views/MapView.tsx`) can run on a WebGL map that shows OpenStreetMap buildings as extruded 3D blocks, without losing anything the current Leaflet map does, so the user can decide whether to replace it.

Scope: the Map tab only. Plan's day map (`components/views/plan/PlanMap.tsx`) and its legs, parking and preview pins stay on `LeafletMap.tsx`. The new map sits behind a switch, so Leaflet stays the default and the PoC can be dropped by deleting files. No schema, API or persisted-format change; no new API key; no Google billing.

Out of scope: terrain/elevation, pitched roofs, legs and parking on the 3D map, offline tile caching, replacing Plan's map, removing Leaflet.

## Findings

- `MapView` renders day filter buttons and one `LeafletMap` (loaded with `next/dynamic`, `ssr: false`). It passes only `trip`, `items` (already filtered by `hasMapCoordinates`), `typeColors`, `onSelect`, `markerNumbers`, `dimmedItemIds`, `fitKey` and `className`. The PoC map needs only these props.
- `LeafletMap.tsx` holds the behaviour to match: `markerIcon` (outlined numbered circles or type-colour dots, sizes per state, `.travel-map-pin` CSS with `data-*` state attributes and the `--pin-type` colour), `popupContent` (title, type · place · fixed time, "Open details" button that calls `onSelect`), fitting bounds when `fitKey` changes while keeping pins out from under `[data-map-overlay]` panels (`overlayInsets`), and theme switching through `useResolvedTheme()`.
- Tiles today: raster `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` with "© OpenStreetMap contributors" attribution. Raster tiles carry no building heights, so 3D needs vector tiles or separate building data.
- Existing Overpass use is server-side in `lib/parking-client.ts` (`overpass-api.de`, custom `User-Agent`). Any Overpass building lookup would follow that pattern through an `app/api/` route.
- No CSP is set in `next.config.ts`, so new tile and style hosts need no header change. The Dockerfile builds with webpack (`npx next build --webpack`); the new library must build there.
- Colours must come from tokens (ADR 0006, `app/globals.css`); pin CSS already uses `var(--ink)`, `var(--surface)`, `var(--accent)`.
- Options researched in this session: OSM Buildings (no code updates since 2021, terms restrict to non-commercial use), Streets GL (raw WebGL2 renderer, early development), three.js with Overpass footprints (full control, but tiles, pan/zoom, labels and attribution would all be hand-built), and MapLibre GL JS `fill-extrusion` (maintained, extrudes buildings from vector tiles out of the box). The official MapLibre "Display buildings in 3D" example uses the keyless OpenFreeMap style.

## Decisions (defaults until the user says otherwise)

- **Library:** MapLibre GL JS with a `fill-extrusion` layer on the building layer of a keyless OpenFreeMap vector style. Heights come from the tile's `render_height` / `render_min_height` (OpenMapTiles schema; confirm in the style). three.js is not used in the PoC; if the user later wants custom geometry, MapLibre's custom layer can host three.js on the same map (stretch item S1).
- **Switch:** `?map=3d` on the URL turns the PoC on for the Map tab; without it the tab is unchanged. No store or persisted preference.
- **Fallback:** if WebGL is unavailable or the style fails to load, render `LeafletMap` instead.
- **Camera:** fits at city scale (zoom ≥ 12) tilt to 45°, and a whole-trip fit stays flat; the user can rotate and tilt with Cmd+drag, Ctrl+drag or right-drag, a trackpad twist in Safari, two fingers on touch, the MapLibre controls or Shift+arrow keys. Buildings appear from zoom 14, so a day spread across a city shows tilted streets until the user zooms in.
- **Theme and palette** (user decisions, 2026-10-22):
  - Liberty is recoloured with the OSM Carto palette (`lib/osm-carto-style.ts`) in both themes, so the 3D map reads like the Leaflet maps' openstreetmap.org tiles. Roads take Carto's fill and casing colours by class; Liberty layers that draw several classes get a per-feature `match` on `class`. Water, parks, woods, grass, residential, cemetery and buildings are recoloured too. Rails, paths, labels and icons keep Liberty's look.
  - Dark mode runs every paint colour through the same `--map-tile-filter` token as the Leaflet tiles, using the Filter Effects formulas (`lib/css-filter-style.ts`, read when the style loads). The shaded-relief raster gets matching raster paint, and sprite pattern fills are faded. The canvas itself is not filtered, so buildings keep normal lighting.
  - Buildings are opaque and shade by ambient occlusion relative to their own height (user decision, 2026-10-22): with the base at t = 0 and the top at t = 1, the wall colour is × (1 − 0.25 × (1 − t)), a smooth gradient from 25% darker at the ground to the original at the roof; roofs are also lit more than walls by MapLibre's default light (0.5). MapLibre's own vertical gradient is fixed to a 150 m reference height and cannot be configured, so `scripts/patch-maplibre-shader.mjs` rewrites that one shader expression in `node_modules/maplibre-gl/dist/maplibre-gl{,-dev}.mjs` (2 copies each). It runs on `postinstall` (the Dockerfile copies it into the dependencies stage before `npm ci`), is idempotent, and fails the install if a MapLibre upgrade changes the expression; re-check it on every MapLibre upgrade. A stronger light (0.8) and 8 stacked extrusion bands were tried and dropped (near-black shaded walls; visible steps).

## Gate (passed 2026-10-22)

- OpenFreeMap (<https://openfreemap.org/>, ToS last updated 2026-10-14): free public instance, no key, registration or cookies, no stated request limits, commercial use allowed. Provided as-is with no SLA; it "may discontinue it at any time without notice", so keep the Leaflet fallback. Automated data collection is forbidden except offline downloads of at most 3,000 tiles or 50 MB per download with ≤ 4 parallel requests and an identifying User-Agent (out of scope here).
- Attribution (required; MapLibre shows it from the style): "OpenFreeMap © OpenMapTiles Data from OpenStreetMap", linking to openfreemap.org, openmaptiles.org and openstreetmap.org/copyright. Printed output that shows a map must carry it too.
- Styles (all returned 200): `https://tiles.openfreemap.org/styles/{liberty,bright,positron,dark,fiord}`. Tiles are unmodified OpenMapTiles from `https://tiles.openfreemap.org/planet`.
- Buildings: Liberty already has a `building-3d` `fill-extrusion` layer (source-layer `building`, `minzoom` 14, height `render_height`, base `render_min_height`). OpenFreeMap's Dark style has only a flat `building` fill and a greyscale palette; it is no longer used (see Theme).
- Library: `maplibre-gl` pinned at `6.15.0` (latest, released 2026-10-18).

## Workstreams

Phase 1 (W1–W3, done) built the 3D Map tab. Phase 2 (W4–W8) brings Plan's day map to MapLibre behind the same `?map=3d` switch and adds nearby suggestions. Phase 2 reuses all of Plan's data and logic unchanged (`useDayPlan`, `useDayRoutes`, `planDay`, `/api/route-legs`, `/api/parking`, Ideas); only drawing moves from `LeafletMap.tsx` to `MapLibreMap.tsx`.

Run one at a time, model `sonnet`. Branch `feat/3d-map-poc` from the tip of `claude/streamline-ui` (or from `main` once that is merged). The coordinator reviews each diff, re-runs the checks and updates this file; agents report in their final message and do not edit this file.

### W1 Shared marker and popup helpers

- Move `markerIcon`'s HTML string builder and `popupContent` out of `LeafletMap.tsx` into `components/views/map-markers.ts`, free of Leaflet imports, so both maps produce the same DOM. `LeafletMap` keeps wrapping the HTML in `L.divIcon`.
- Done when: `LeafletMap` behaves as before (Map and Plan tabs checked in the browser), `npm run check` passes.

### W2 MapLibre map component

- Add `maplibre-gl` (pinned) and `components/views/MapLibreMap.tsx`, taking the same props as `MapView` passes to `LeafletMap`.
- Base map: OpenFreeMap style, building `fill-extrusion` layer, visible OSM and OpenFreeMap attribution.
- Pins: `maplibregl.Marker` with the W1 element (numbers, type colour, dimmed state), popup with "Open details" calling `onSelect`.
- Fit: on `fitKey` change, fit bounds of non-dimmed items, padded by `overlayInsets` (move that helper into `map-markers.ts` too).
- Theme: swap style on light/dark change and re-add markers.
- Clean up the map on unmount; import the MapLibre CSS only in this component.
- Done when: the component renders in isolation with a trip's items, `npm run check` passes.

### W3 Wire into the Map tab

- In `MapView`, load `MapLibreMap` with `next/dynamic` (`ssr: false`) when `?map=3d` is present, else `LeafletMap`. Fall back to `LeafletMap` when WebGL context creation fails.
- Done when: the checks in Verification pass.

### W4 Selection, hover, preview and recenter in `MapLibreMap`

- Add the rest of `LeafletMapProps` that Plan passes: `selectedItemId`, `hoveredItemId`, `onHover`, `recenterToken`, `onUserMove`, `previewItem`. Match `LeafletMap` behaviour:
  - Pin states from `markerHtml` (`active` for selected or hovered, `dimmed`, `preview`), with active pins above the rest.
  - Hovering a pin calls `onHover`.
  - Selecting an item flies to it (zoom ≥ 16, tilted) and opens its popup; clearing the selection closes it.
  - `recenterToken` refits the day; a selected idea's preview pin is included in the fit.
  - `onUserMove` fires only for user drags, zooms and rotations (MapLibre events with an `originalEvent`), not programmatic fits or flights.
- Done when: the Map tab is unchanged and `npm run check` passes.

### W5 Route legs drawn under the buildings

- Draw `MapLeg[]` as one GeoJSON source (positions are `[lat, lng]`; MapLibre wants `[lng, lat]`) and a line layer coloured from `--accent`: dashed (`line-dasharray`) for walking, solid for driving, round caps.
- Routes draw under the buildings (user decision, 2026-10-22): insert the line layer below `building-3d`, so a building in front hides the part of the route behind it, as in reality.
- Give the source the openrouteservice attribution, so it shows only while routes are drawn.
- The style is rebuilt on a theme switch (`diff: false`), so re-add the source and layer on every `style.load`.
- Done when: walking and driving legs draw correctly at zoom 13–17, tilted and flat, in both themes, and buildings hide routes behind them.

### W6 Parking markers

- Move the "P" icon HTML from `LeafletMap.tsx` into `map-markers.ts` and draw `parkingMarkers` as MapLibre markers: a title tooltip, not clickable, below the stop pins.
- Done when: Drive mode shows the same car parks on both maps.

### W7 Plan's day map on MapLibre

- Move the `?map=3d` check (`wants3dMap` in `MapView.tsx`) into a shared helper, and have `PlanMap.tsx` render `MapLibreMap` with it, falling back to Leaflet as the Map tab does. The overlays ("N stops without a location · add link", "Recenter day", the empty-day note) stay as they are.
- Done when, in the browser at desktop and 375px, in both themes:
  - Hovering a stop row highlights its pin, and hovering a pin highlights its row.
  - Selecting either flies to the stop.
  - Scrolling to another day refits the map; panning shows "Recenter day", which refits.
  - Opening Ideas and selecting an idea shows its dashed preview pin and reframes the day.
  - Drive mode shows solid driving legs, dashed walking legs and "P" markers.
  - Without `?map=3d`, Plan is unchanged.

### W8 Nearby suggestions from the tiles' POI layer

- The vector tiles already carry points of interest (OpenMapTiles `poi` layer: `name`, `class`, `subclass`, `rank`; Liberty shows them from zoom 15–17 by rank), so suggestions need no new API, key or request. They are OSM data under the attribution already shown.
- A pure module `lib/nearby-places.ts`, with Node tests, does the following:
  - Takes the features near a point, keeps named ones within a radius, and maps OSM classes to app types (for example restaurant, cafe and fast_food to `food`; museum, attraction, viewpoint, castle and place_of_worship to `sightseeing`; park to `activity`).
  - Drops places already in the trip (same name, or within about 30 m of a stop).
  - Ranks by `rank`, then distance, and gives a walking estimate with the `lib/travel-legs.ts` detour factor.
- In `MapLibreMap`, read candidates with `querySourceFeatures("openmaptiles", { sourceLayer: "poi" })` around the selected stop (Plan) or the map centre (Map tab).
  - That only sees loaded tiles, so the query runs after `idle`. If the area is not loaded at a high enough zoom, say "zoom in to see nearby places", not an empty list.
- Show suggestions as small secondary markers and a short "Nearby" list (name, kind, distance, walk time). "Add as idea" calls the existing `openCreateItem(undefined, undefined, type, name, undefined, { name, lat, lng })`, so it opens the normal create form, undated.
- Limits to state in the UI copy: OSM has no ratings, reviews or live opening hours, and coverage varies by area.
- Decide with the user before building:
  - the default radius (suggested: 500 m, about a 7-minute walk);
  - which categories to show;
  - whether the list lives on the map or in the inspector;
  - whether added ideas also get a Google Maps link built from their coordinates (AGENTS.md treats Google Maps URLs as the source of coordinates; storing `lat`/`lng` without one is new).
- Done when: on the test trip, a selected stop in central Kyoto lists nearby food and sights with distances, an added idea appears in Ideas with its pin, and places already in the trip are not suggested.

### E1 (extended, evaluated 2026-10-22) Query nearby places by type: food, attractions, transport

Goal: from a stop (or the map centre), list nearby places of one chosen type, beyond W8's default suggestions.

Measured within 500 m of a Kyoto stop (Shijō-Kawaramachi, 35.0037, 135.7681):

| Type | Map tiles (named POIs in loaded tiles) | Overpass (one query) |
| --- | --- | --- |
| Food | ~389: restaurant 235, cafe 49, bar 48, beer 29, fast_food 23, ice_cream 3, bakery 2 | 399 (`amenity` restaurant, cafe, fast_food, bar, pub, ice_cream, food_court) |
| Attractions | ~55: place_of_worship 33, art_gallery 12, theatre 3, park 3, attraction 2, museum 2 | 96 (`tourism` attraction, museum, viewpoint, gallery, artwork; any `historic`; `amenity=place_of_worship`) |
| Transport | 9: bus 7, railway 2 | 26 (`railway=station`, `public_transport=station`, `highway=bus_stop`) |
| Cost | Instant, no request, no key, already attributed | 39 s for the query; the first attempt failed after 2 s with a non-JSON reply |

Findings:

- **Tiles:**
  - OpenFreeMap's `poi` layer holds every POI only in zoom-14 tiles. Below that it has almost nothing (2 POIs at zoom 13), so a by-type query needs zoom-14 tiles loaded for the area.
  - `querySourceFeatures` only sees tiles the map has loaded, so querying around a stop that is off screen needs either a camera move to it or fetching and decoding its zoom-14 tiles directly. The direct fetch uses the tile URL from the TileJSON at `https://tiles.openfreemap.org/planet`; decoding needs `@mapbox/vector-tile` and `pbf`, which are new dependencies.
  - Features repeat across tile edges, so de-duplicate by name, class and position.
- **Coverage:** tiles cover food almost fully (~97% of Overpass). Attractions come out at ~55%, missing historic sites and artworks. Transport comes out at ~35%: stations are there, many bus stops are not.
- **Overpass:**
  - It is complete and supports any tag or radius, but the public instance is slow and unreliable at busy times.
  - It would follow the existing `lib/parking-client.ts` pattern: a server route, an identifying User-Agent, a timeout, and a cache by area and type, called only on an explicit user action.

Recommendation:

- Build by-type queries on the tiles first: instant, no requests, enough for food. Proposed type mapping:
  - **food:** restaurant, cafe, fast_food, bar, beer, ice_cream, bakery
  - **attractions:** attraction, museum, art_gallery, place_of_worship, theatre, park, castle, monument
  - **transport:** railway, bus, ferry_terminal, aerialway, airport
- Add an optional "Search more (OpenStreetMap)" action that queries Overpass through a cached server route, for attractions and transport where tiles are thin. Show progress, fall back to the tile results on failure, and never call it automatically.
- If off-screen stops must be queryable without moving the map, add direct zoom-14 tile fetching (new dependencies). Otherwise query after flying to the stop, which W4 already does on selection.
- Decide with the user: the type list and mapping, whether Overpass is worth the latency, and whether transport should include bus stops.

### S1 (stretch, only if the user asks) three.js custom layer

- Render Overpass building footprints for the selected day's area as `ExtrudeGeometry` meshes inside a MapLibre custom layer, through a server route modelled on `app/api/parking/route.ts`. Compare look, load time and code size with W2 and record the result here.

## Checklist

- [x] Gate: OpenFreeMap terms, attribution, limits and `maplibre-gl` version recorded
- [x] W1 shared marker and popup helpers (`components/views/map-markers.ts`; `npm run check` passed, Map and Plan maps checked in the browser 2026-10-22)
- [x] W2 `MapLibreMap.tsx` and MapLibre control, popup and attribution styles in `app/globals.css`
- [x] W3 `?map=3d` switch and fallback in `MapView` (done with W2 so the map could be checked in the app)
- [x] Verification below (headless Chrome measurements; real phone not yet checked)
- [x] Findings and recommendation written here for the user's decision
- [ ] W4 selection, hover, preview and recenter in `MapLibreMap`
- [ ] W5 route legs under the buildings
- [ ] W6 parking markers
- [ ] W7 Plan's day map on MapLibre behind `?map=3d`
- [ ] W8 nearby suggestions (after the user decides radius, categories, placement and Google Maps links)
- [ ] E1 by-type nearby queries (evaluated; tiles first, optional Overpass; user decisions pending)
- [ ] S1 (only if requested)

## Verification

- `npm run check` and `npx next build --webpack` pass.
- Browser, desktop and phone width (375px), light and dark: buildings extrude when zoomed into a city; all mapped items show with correct numbers and colours; "All days", single day and shift-click multi-day filters fit and dim as on Leaflet; popup "Open details" opens the inspector; pins are not hidden under the day-filter panel; attribution visible.
- Without `?map=3d` the Map tab is unchanged; Plan's map is unchanged.
- Record for the decision: JS bundle size added to the Map tab, first-render time, frame rate while panning a dense area (for example central Tokyo or Berlin), behaviour on a phone.

### Results (2026-10-22, test trip in Kyoto and Tokyo)

- Done: Liberty's 3D buildings render with OSM heights in both themes; switching theme only changes the canvas filter, with no style reload. The whole-trip fit is flat (zoom 6.2); a single day tilts to 45° with every pin inside the frame. Day filters and dimming match Leaflet. A pin click opens the inspector, and, as on Leaflet, no popup stays open. Phone width (375px): map fills the width, pins and attribution visible, no horizontal scroll. Attribution is readable in both themes. Without `?map=3d` the Leaflet map is unchanged. `npm run check` passes.
- Fallback: verified by accident. Before the worker fix the map failed to start, and the tab fell back to Leaflet as intended.
- Webpack build (`npx next build --webpack`) passes and emits the worker as `/_next/static/media/maplibre-gl-worker.<hash>.mjs`. Size: the MapLibre chunk is 1.06 MB (288 KB gzipped) plus the worker at 510 KB (147 KB gzipped). Both load only when `?map=3d` renders the map, because of `next/dynamic`.
- Production build in the browser (`next start`, headless Chrome): the map, 8 pins, tiles and attribution render, with no errors. The one console warning, `Image "circle-11" could not be loaded`, comes from the OpenFreeMap style's own sprite, not from the app.
- Timings and frame rate (headless Chrome 155 on an Apple M2 GPU, dev server, cold cache, scripts kept outside the repo). "Ready" runs from tapping the Map tab to the first rendered frame with all tiles loaded:

  | Run | Map ready | Tilted day fit settles | Flying 6 s over dense blocks at pitch 60 (Kyoto Shijo, Tokyo Marunouchi) |
  | --- | --- | --- | --- |
  | Desktop 1280×800 @2x | 1.85 s | 1.4 s | 60 fps, p95 frame 16.7 ms, no frames > 50 ms (147 and 180 buildings) |
  | Phone 390×844 @3x, CPU slowed 4× | 1.4 s | 1.3 s | 60 fps, p95 16.7 ms, no frames > 50 ms (118 and 92 buildings) |

  The CPU slowdown does not slow the GPU, so the phone row overstates a real phone. Real-phone smoothness and battery use are still unknown.

### Implementation notes

- MapLibre 6 locates its worker (`maplibre-gl-worker.mjs`, ~0.5 MB, self-contained) next to its own module, which fails once bundled ("Worker failed to load"). `MapLibreMap.tsx` calls `setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href)` so the bundler emits the file under `/_next/static/media/`. Verified in dev (Turbopack); the webpack build is the check that matters for Docker.
- `maplibre-gl` 6 has no default export: `import * as maplibregl`.
- `cameraForBounds` ignores pitch, and perspective spreads the near edge, so a tilted fit backs off 0.5 zoom from the flat fit.
- Dark mode history (2026-10-22, user feedback):
  1. OpenFreeMap's Dark style with an added extrusion drew buildings under the roads and was greyscale.
  2. Recolouring Liberty per paint property kept hues but did not match Plan.
  3. Filtering the canvas with `--map-tile-filter` matched Plan's palette, but inverted the 3D shading (walls lighter than roofs, bases lighter than tops).
  4. Final: the same filter applied to the style's colours (see Theme and palette). Sprites (road shields, POI icons) cannot be recoloured, so they keep their light-mode look in dark.
  - Measured in dark with the Carto palette and the patched smooth gradient: map ready in 1.2 s, 60 fps, p95 frame 16.8 ms, no frames > 50 ms over Kyoto and Tokyo.
- Gestures follow common map apps (`mapAppGestures` in `MapLibreMap.tsx`, capture-phase listeners; revised 2026-10-22 after user feedback):
  - Drag pans, double-click zooms, and touch pinch and twist work as MapLibre provides them.
  - Cmd+drag, Ctrl+drag and right-drag rotate (sideways) and tilt (up and down), turning the same way as Google Maps. MapLibre's own drag-rotate turns the other way, so it is disabled.
  - On a Mac trackpad, two-finger scrolling pans, as in Apple Maps. Pinch (Ctrl+wheel) and a notched mouse wheel zoom. A trackpad is detected by `wheelDeltaY === -3 × deltaY` (Chrome, Safari) or any sideways delta; Firefox has no `wheelDeltaY`, so there a purely vertical two-finger scroll still zooms.
  - Twist to rotate works only in Safari, the one browser that reports trackpad rotation (`gesturechange.rotation`); Chrome and Firefox never pass it to the page. Safari's pinch scale also zooms through the same events unless Ctrl+wheel events arrive too.
  - Checked in headless Chrome with real input events: plain drag pans; Cmd, Ctrl and right drags all give bearing +96° and pitch 60° with the centre unchanged; a sideways two-finger scroll pans without zooming; Ctrl+wheel and a notched wheel zoom. Not checkable there: a vertical-only trackpad scroll (Chrome's synthetic wheel always looks like a mouse) and Safari twist. Both need a real Mac trackpad.
- MapLibre's own CSS outranks single-class selectors; the attribution rule needs `.maplibregl-ctrl.maplibregl-ctrl-attrib`.

## Decision for the user after the PoC

Options: replace Leaflet on the Map tab (and later Plan), keep 3D as an optional toggle, or drop it.

### Recommendation: replace Leaflet with MapLibre, once a real phone confirms it

- **It does the job.** Buildings, theme, day fits, filters, phone layout and fallback all work. The map was smooth in every measured run, and it is ready in under 2 s.
- **One map library, not two.** A permanent toggle means keeping Leaflet and MapLibre side by side, with pins, fits and theming in both. MapLibre also draws a flat 2D map (pitch 0), so a 2D/3D tilt button covers the toggle's purpose with one library.
- **Better than today in ways unrelated to 3D.**
  - The current map pulls raster tiles from `tile.openstreetmap.org`, whose usage policy is strict. It also builds dark mode with a CSS colour inversion.
  - OpenFreeMap allows app use and commercial use, needs no key, and has a real Dark style.
  - Vector tiles stay sharp at every zoom.
- **Costs to accept:**
  - About 435 KB gzipped of JS and worker. Today this loads only when the map is opened; after replacement it would load only with the Map or Plan view.
  - OpenFreeMap has no SLA. Mitigate with a second style URL (or self-hosted tiles) as the fallback, in place of Leaflet.
  - Porting Plan's map: legs, parking and preview pins.
- **Do not build S1 (three.js).** MapLibre's built-in extrusion already gives the 3D blocks. A three.js layer only makes sense for custom geometry (pitched roofs, landmarks), which is outside this goal.

### If the user agrees

1. Check on a real phone: open `http://<this Mac's LAN IP>:3000/?map=3d` with `npm run dev`. WebGL works over plain HTTP, so no NAS deploy is needed. Look for smoothness while panning and tilting, readable pins, and battery heat after a few minutes.
2. Write an ADR in `docs/decisions/` (map library and tile provider).
3. Make MapLibre the Map tab default, add a 2D/3D tilt button, and remove `?map=3d`.
4. Port Plan's map (`PlanMap.tsx`): legs as line layers (dashed for walking), parking and preview pins.
5. Remove Leaflet once nothing uses it, and update the OSM attribution notes in `AGENTS.md`.

## Next step

Phase 2: start W4, then W5, W6 and W7 in order (all four edit `MapLibreMap.tsx`, so run them one at a time). Settle W8's open decisions with the user before building it. The real-phone check from phase 1 still applies before replacing Leaflet.
