# 3D map proof of concept

Status: In progress (2026-10-22). Gate passed and W1 done on `feat/3d-map-poc` (uncommitted); W2 next.

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
- **Camera:** pitch 45° when zoomed in to buildings (zoom ≥ 15), flat when fitting the whole trip; the user can tilt and rotate with the default MapLibre controls.
- **Theme:** use a light and a dark OpenFreeMap style (or one style with paint overrides) chosen from `useResolvedTheme()`; extrusion colour from a token-derived value.

## Gate (passed 2026-10-22)

- OpenFreeMap (<https://openfreemap.org/>, ToS last updated 2026-10-14): free public instance, no key, registration or cookies, no stated request limits, commercial use allowed. Provided as-is with no SLA; it "may discontinue it at any time without notice", so keep the Leaflet fallback. Automated data collection is forbidden except offline downloads of at most 3,000 tiles or 50 MB per download with ≤ 4 parallel requests and an identifying User-Agent (out of scope here).
- Attribution (required; MapLibre shows it from the style): "OpenFreeMap © OpenMapTiles Data from OpenStreetMap", linking to openfreemap.org, openmaptiles.org and openstreetmap.org/copyright. Printed output that shows a map must carry it too.
- Styles (all returned 200): `https://tiles.openfreemap.org/styles/{liberty,bright,positron,dark,fiord}`. Tiles are unmodified OpenMapTiles from `https://tiles.openfreemap.org/planet`.
- Buildings: Liberty already has a `building-3d` `fill-extrusion` layer (source-layer `building`, `minzoom` 14, height `render_height`, base `render_min_height`). Dark has only a flat `building` fill, so W2 adds an extrusion layer to Dark with the same expressions and a token-derived colour. Use Liberty for light and Dark for dark.
- Library: `maplibre-gl` pinned at `6.15.0` (latest, released 2026-10-18).

## Workstreams

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

### S1 (stretch, only if the user asks) three.js custom layer

- Render Overpass building footprints for the selected day's area as `ExtrudeGeometry` meshes inside a MapLibre custom layer, through a server route modelled on `app/api/parking/route.ts`. Compare look, load time and code size with W2 and record the result here.

## Checklist

- [x] Gate: OpenFreeMap terms, attribution, limits and `maplibre-gl` version recorded
- [x] W1 shared marker and popup helpers (`components/views/map-markers.ts`; `npm run check` passed, Map and Plan maps checked in the browser 2026-10-22)
- [ ] W2 `MapLibreMap.tsx`
- [ ] W3 `?map=3d` switch and WebGL fallback in `MapView`
- [ ] Verification below, with screenshots
- [ ] Findings and recommendation written here for the user's decision
- [ ] S1 (only if requested)

## Verification

- `npm run check` and `npx next build --webpack` pass.
- Browser, desktop and phone width (375px), light and dark: buildings extrude when zoomed into a city; all mapped items show with correct numbers and colours; "All days", single day and shift-click multi-day filters fit and dim as on Leaflet; popup "Open details" opens the inspector; pins are not hidden under the day-filter panel; attribution visible.
- Without `?map=3d` the Map tab is unchanged; Plan's map is unchanged.
- Record for the decision: JS bundle size added to the Map tab, first-render time, frame rate while panning a dense area (for example central Tokyo or Berlin), behaviour on a phone.

## Decision for the user after the PoC

Replace Leaflet on the Map tab (and later Plan), keep 3D as an optional toggle, or drop it. If replacing: write an ADR in `docs/decisions/`, move legs, parking and preview pins to MapLibre, and remove the switch.

## Next step

Start W2: add `maplibre-gl@6.15.0` and build `MapLibreMap.tsx` on the W1 helpers.
