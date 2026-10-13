# WS4 — Map and Spend

**Status:** Complete (pending coordinator review) · **Batch:** A
**Branch:** `claude/minimal-ui-ws4-map-spend` (from `claude/minimal-ui-rewrite`) · **Port:** 3104
**Reference:** `docs/design/minimal-ui/screenshots/map-light.jpg`, `map-dark.jpg`, `spend-light.jpg`, `spend-dark.jpg`. Source boards: `MinimalMap*.dc.html`, `MinimalSpend*.dc.html`.
**Owns:** `components/views/MapView.tsx`, `components/views/ExpensesView.tsx`. Uses `LeafletMap` (owned by the coordinator after WS0; it already supports `markerNumbers`, `selectedItemId`, `hoveredItemId` and `dimmedItemIds`). Request any change to it under Notes / Requests.

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens), and the expense invariants in `AGENTS.md` and `docs/decisions/0003-expense-records.md`.

## Checklist

- [x] Map: day filter list on the left (All days, then each day with title and place count); selecting a day numbers and highlights its markers and dims the rest (`dimmedItemIds`); fit to the selected day; note items without coordinates; OSM attribution visible.
- [x] Spend: one large total per currency (Geist Mono 300), each with "of X planned" only when the same currency has planned costs; never convert currencies or add planned costs to actual spend.
- [x] Spend: category breakdown with thin bars, switchable per currency; expense log table (date, description, category, linked item, amount); Log expense button opening the existing form.
- [x] Keep expense create/edit/delete, linking to items, and decimal-string amounts.

## Parity items

- Map filtering, marker selection, coordinate-less links, attribution.
- Expense totals per currency with the QA trip's JPY and SGD records; planned costs stay separate.

## Notes / Requests

- **Request (LeafletMap, needed for "fit to the selected day"):** `LeafletMap` fits bounds to all `items`, including dimmed ones. MapView now passes every mapped item plus `dimmedItemIds` (per the checklist), so picking a day dims the other pins and numbers that day's stops but the map does not zoom to the day. Please make the fit effect skip items in `dimmedItemIds` (and include `dimmedItemIds` in its deps). Until then, the fallback is to pass only the filtered items from MapView (fit works, no dimming).
- **Request (lib/expense-domain.ts):** `formatExpenseAmount` uses `Intl` currency style with the browser locale, so JPY renders `JP¥72,500` and SGD `SGD 32.50` (mockup: `¥43,750`, `S$1,398`). `currencyDisplay: "narrowSymbol"` would match the mockup. Left as is (not my file).
- Map pins: one selected day numbers its stops 1..n in `sortDayDisplayItems` order; All days and multi-select show the trip day number on each pin; undated items are plain dots. Shift-click (desktop) and tap (mobile) multi-select kept.
- Differences from the screenshots: day rows are titled by date ("Mon 5 Apr") with a stop count, since days have no names or place labels in the data; days with no mapped item are not listed (as before). The "Log expense" button sits inside the Spend view (top right) rather than in the shell header, because the header is coordinator-owned. Filters (search, category, currency, sort) were kept above the log. Below 1024px the expense log is a stacked list instead of a table; the category list stacks above it. The mockup's per-currency note ("flights and hotel deposit") is not shown (no data source). A one-line intro "Actual spending for <trip>" was added next to the button.
- Totals show only currencies that have expenses; "of X planned in the itinerary" appears only when the same currency has planned costs. Planned costs are never added to actual totals.
- Dark map tiles in the app look darker/more colourful than `map-dark.jpg`; that is the tile-pane filter in `globals.css` (coordinator-owned), not changed here.
- Not verified: shift-click multi-select was not exercised in the browser (code unchanged); marker click opening the editor was not exercised (LeafletMap unchanged, `onSelect` still wired).

## Verification log

- `npm run check`: pass (lint 0 errors, 6 pre-existing `<img>` warnings, tsc clean, Prettier clean, 94/94 tests).
- `npx next build --webpack`: success.
- Hard-coded colour grep over `MapView.tsx` and `ExpensesView.tsx`: no output.
- Browser (port 3104, trip Minimal UI QA): Map at 1440 light and dark and at 390 dark; Spend at 1440 light and dark and at 390; compared to the reference screenshots (differences in Notes). Picking a day highlights the row, numbers/dims pins; fit-to-day not working until the LeafletMap request is done.
- Expense parity: created `WS4 test lunch` (JPY 1000, Food, linked to Tofuku-ji), totals moved JPY 72,500 to 73,500 and planned stayed separate; edited it to 1250; deleted it through the confirm dialog. API afterwards lists only the 3 baseline expenses (500 JPY, 32.500 SGD, 72000.000 JPY).
- Mobile (390px): no horizontal overflow (scrollWidth 390); day filter becomes a chip row above the map; Spend log is a stacked list with 44px action targets.
- Not verified at 320px or in a real touch device.
