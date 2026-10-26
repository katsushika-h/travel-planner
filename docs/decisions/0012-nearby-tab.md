# ADR 0012: The Map tab becomes the Nearby finder

**Status:** Accepted (2026-10-23).

**Context:** Plan's day map (`components/views/plan/PlanMap.tsx`) shows each day's stops, legs and parking, so the Map tab's whole-trip, day-filtered view repeated it. The backlog's Recommendations feature needed a home with a large map, and the MapLibre vector tiles (ADR 0011) already carry OpenStreetMap points of interest.

**Decision:**

- The Map tab is relabelled "Nearby" and lists places of one category (food, sights, transit) within an adjustable radius (200–1000 m, default 500 m) of a trip pin picked on the map, or of the map centre. The day list stays for browsing; picking a pin switches it to search.
- Places come from the tiles' OpenMapTiles `poi` layer through `querySourceFeatures`, with no new API, key or request. Results are sorted nearest first; matching, de-duplication and sorting live in `lib/nearby-places.ts`.
- Adding a place saves it at once as an undated idea, with its coordinates and a Google Maps search link built from them, and opens it in the inspector.
- The internal tab key stays `"map"`, so persisted tab state is unchanged.

**Consequences:**

- Results only cover tiles the map has loaded at zoom 14 or closer, which caps the radius at 1000 m and means the camera moves to the chosen stop.
- Tile coverage is good for food and thin for sights and transit; an explicit Overpass search is the planned complement (`docs/work/recommendations.md`).
- Clicking a result fetches its details through `app/api/place-details` (OSM API 0.6 element, Wikidata description, English Wikipedia summary), one lookup per click, cached on the server for 24 h. Wikipedia text carries its CC BY-SA credit and link; a Google Maps name search link covers reviews and photos without API use.
- OpenStreetMap has no ratings, reviews or live opening hours; the view says so.
