# Minimal UI mockups

Reference designs for the Minimal UI rewrite. The implementation plan is [docs/work/minimal-ui-rewrite.md](../../work/minimal-ui-rewrite.md); the design decision is [ADR 0006](../../decisions/0006-minimal-ui.md).

These files are **design references, not app code**. Rebuild each screen as React + Tailwind components in the app; do not import or render these files.

- Live canvas (owner access only): https://claude.ai/artifact/HQrB58WJS5EhtSFZDxMRFk
- `mockups/` holds a copy of every canvas board as of 2026-10-13, plus the canvas index (`canvas.json`).
- `assets/` holds the map images and walking-route data the boards use.

## How to read a `.dc.html` board

Each board is one HTML file in the canvas's own format:

- The markup inside `<x-dc>` is the layout. Inline `style="…"` values are the exact spacing, sizes and colours to match.
- `{{name}}` placeholders are filled from `renderVals()` in the `<script type="text/x-dc">` block at the bottom. That function holds the sample data and computed styles (selected states, type colours, indentation).
- `<sc-for>` repeats markup for each item in a list; `<sc-if>` shows markup conditionally.
- `./support.js` is the canvas runtime and is not in the repo; the boards will not render standalone. Read them as source, or open the live canvas.
- Image URLs of the form `/_blob/<id>` are canvas uploads. The local copies are:

| Canvas URL | Local file | What it is |
| --- | --- | --- |
| `/_blob/e9333d16f4488a0e6654a246bb82124d` | `assets/kyoto-higashiyama-osm.webp` | OSM z16 snapshot of Higashiyama/Gion (Plan view, item editor map preview) |
| `/_blob/cd90b1ac02d733df62b31dacad4a206e` | `assets/kansai-osm.webp` | OSM z11 snapshot of Kyoto–Osaka (whole-trip Map) |

`assets/walking-legs-day3.json` is the walking-route data used on the Plan boards: OSRM foot-profile routes (FOSSGIS public server) between the Day 3 stops, with durations, distances and path data projected onto the Higashiyama image.

Map images © OpenStreetMap contributors (ODbL; tiles CC BY-SA). Keep the attribution visible wherever they are shown.

## Which boards are canonical

The **Minimal** boards are the chosen direction. Everything else on the canvas is exploration or history.

| Board | Canonical? | Use |
| --- | --- | --- |
| `Minimal.dc.html` | **Yes** | Plan view, light: header, day strip, stop list with walking legs, day map |
| `MinimalDark.dc.html` | **Yes** | Plan view, dark (has a `mapStyle` tweak: `color` is the chosen dark map) |
| `MinimalWeek.dc.html` / `MinimalWeekDark.dc.html` | **Yes** | Calendar week: type-colour bars, flexible windows, overlap indentation |
| `MinimalBoard.dc.html` / `MinimalBoardDark.dc.html` | **Yes** | Board (Kanban) with type-coloured columns |
| `MinimalTable.dc.html` / `MinimalTableDark.dc.html` | **Yes** | Table; the dark board also shows the docked item editor |
| `MinimalItem.dc.html` | **Yes** | Item editor (inspector), light |
| `MinimalMap.dc.html` / `MinimalMapDark.dc.html` | **Yes** | Whole-trip Map with day filter |
| `MinimalSpend.dc.html` / `MinimalSpendDark.dc.html` | **Yes** | Spend (expenses) |
| `Flexible.dc.html` | Reference | Rationale for flexible-item windows (shipped in PR #14) |
| `Main`, `Calendar`, `Mobile` | No | First trip-first redesign (superseded) |
| `Departures`, `DeparturesMap`, `Postcard`, `Shell` | No | Style explorations (superseded) |

Not mocked yet: Month view, Day mode of Calendar, mobile layouts in the Minimal style, trip create/edit dialogs, the trip-switcher menu contents, empty and error states. Derive them from the tokens below and the existing mobile contract in [mobile-ui-implementation.md](../../work/mobile-ui-implementation.md).

## Design tokens

Taken from the canonical boards. Put these in `app/globals.css` as CSS variables for `:root` and `.dark`, and use them instead of hard-coded Tailwind colour classes.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| background | `#FFFFFF` | `#0E0E0E` | Page |
| panel | `#FFFFFF` | `#141414` | Docked item editor |
| surface | `#F2F2F0` | `#1C1C1C` | Week fixed-item blocks, selected table row (`#F6F6F4` / `#1C1C1C`) |
| ink | `#111111` | `#EDEDEC` | Primary text, strong rules under headings, outlined buttons |
| muted | `#6B6B6B` | `#9A9A98` | Secondary text, inactive tabs |
| faint | `#9A9A98` | `#7A7A78` | Past items, hour labels, list numbers |
| divider | `#EBEBEA` | `#242424` | Row dividers |
| input rule | `#CFCFCC` | `#3A3A3A` | Underlined form fields, dashed outlines |
| accent | `#D9381E` | `#FF6A4D` | Selected stop, "Idea" labels, tight-gap warning (one accent only) |
| danger | `#B42318` | `#FF7B6B` | Delete actions |

- **Type:** Geist for text and Geist Mono for times, numbers and money. Large timings use Geist Mono weight 300 (28px in lists, 44px for Spend totals).
- **Shape:** no cards with heavy shadows. Sections are separated by a 1px ink rule above and 1px dividers between rows; corners are square except pins and round icon buttons.
- **Type colours:** keep `lib/type-color.ts` and user-set colours. Use the full colour for bars, swatches and column rules. Heading text in a type colour uses a darker shade in light mode and a lighter shade in dark mode (see `TYPE` in `MinimalBoard*.dc.html`) so it stays readable.
- **Week items:** 3px left bar in the type colour; booked items add a 1px ink top edge; overlapping items indent 12px per earlier overlap, with the title anchored to the top of the card.
- **Flexible items:** dashed window with a muted label (`Flexible · 11:00–13:30`, `after`, `before`, `anytime`), as shipped in PR #14.
- **Map:** light uses `filter: grayscale(1) contrast(0.85) brightness(1.08)` on the tile layer; dark uses `filter: invert(1) hue-rotate(180deg) brightness(0.88) contrast(0.92) saturate(0.75)` so parks stay green and water stays blue. Same OSM tiles in both themes; no new tile provider.

## Reference screenshots and re-rendering

`screenshots/` has a full-size render of every canonical board (light and dark), made 2026-10-13: `plan-*`, `week-*`, `board-*`, `table-light`, `table-dark-with-editor`, `item-editor-light`, `map-*`, `spend-*`. Compare implemented views against these.

To regenerate them after a mockup changes, serve this folder and capture with headless Chrome, using `render-board.html` (a small renderer for the canvas format: `{{holes}}`, `sc-for`, `sc-if`, `renderVals()` sample data, local copies of `/_blob/` images):

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/design/minimal-ui
```

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1440,1200 --virtual-time-budget=10000 --screenshot=out.png "http://127.0.0.1:8765/render-board.html?board=Minimal.dc.html"
```
