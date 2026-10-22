# 3D map proof of concept

Status: PoC complete (2026-10-22) on `feat/3d-map-poc` (`c344ec7`, `2a762b1`). Waiting on the user: a check on a real phone, then the decision below.

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
- **Camera:** fits at city scale (zoom ≥ 12) tilt to 45°, and a whole-trip fit stays flat; the user can tilt and rotate with the MapLibre controls or Shift+arrow keys. Buildings appear from zoom 14, so a day spread across a city shows tilted streets until the user zooms in.
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
- [x] W2 `MapLibreMap.tsx` and MapLibre control, popup and attribution styles in `app/globals.css`
- [x] W3 `?map=3d` switch and fallback in `MapView` (done with W2 so the map could be checked in the app)
- [x] Verification below (headless Chrome measurements; real phone not yet checked)
- [x] Findings and recommendation written here for the user's decision
- [ ] S1 (only if requested)

## Verification

- `npm run check` and `npx next build --webpack` pass.
- Browser, desktop and phone width (375px), light and dark: buildings extrude when zoomed into a city; all mapped items show with correct numbers and colours; "All days", single day and shift-click multi-day filters fit and dim as on Leaflet; popup "Open details" opens the inspector; pins are not hidden under the day-filter panel; attribution visible.
- Without `?map=3d` the Map tab is unchanged; Plan's map is unchanged.
- Record for the decision: JS bundle size added to the Map tab, first-render time, frame rate while panning a dense area (for example central Tokyo or Berlin), behaviour on a phone.

### Results (2026-10-22, test trip in Kyoto and Tokyo)

- Done: Light (Liberty, its own 3D buildings) and Dark (added extrusion layer) render buildings with OSM heights; switching theme swaps the style live. The whole-trip fit is flat (zoom 6.2); a single day tilts to 45° with every pin inside the frame. Day filters and dimming match Leaflet. A pin click opens the inspector, and, as on Leaflet, no popup stays open. Phone width (375px): map fills the width, pins and attribution visible, no horizontal scroll. Attribution is readable in both themes. Without `?map=3d` the Leaflet map is unchanged. `npm run check` passes.
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
- Dark's extrusion uses `--faint` at 0.45 opacity; `--surface` was invisible against the near-black style.
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

The user tries `?map=3d` on a real phone and decides; if they agree to replace Leaflet, start with step 2 of "If the user agrees".
