# ADR 0006: Minimal trip-first UI

**Status:** Accepted (2026-10-13).

**Decision:** Replace the workspace sidebar with a one-line trip header (trip switcher, view tabs, search, add) and restyle every view in the Minimal design in [docs/design/minimal-ui](../design/minimal-ui/README.md): white or near-black backgrounds, ink rules and hairline dividers instead of cards, Geist and Geist Mono, large monospace timings, and a single accent colour. Ship light and dark themes from shared CSS variables. The Plan tab (persisted key `days`) shows one day as a stop list beside its map. Keep Leaflet and the standard OpenStreetMap tiles; theme the map with CSS filters on the tile layer (greyscale in light, colour-preserving invert in dark).

**Consequences:** Hard-coded Tailwind colour classes in components move to theme tokens. Persisted store keys (`activeTab` values, `calendarMode`, theme) and the API are unchanged, so existing client state stays valid. Type colours remain user-configurable and keep their full colour for bars and swatches, with readable darker or lighter shades for text. No new map provider, API key or billing; OSM attribution stays visible. Switching to MapLibre (for custom vector styles or 3D) and walking routes with travel times are separate, later decisions: walking routes need a routing provider, a server route and a cache table.
