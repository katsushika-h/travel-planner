# WS4 — Map and Spend

**Status:** Not started · **Batch:** A
**Branch:** `claude/minimal-ui-ws4-map-spend` (from `claude/minimal-ui-rewrite`) · **Port:** 3104
**Reference:** `docs/design/minimal-ui/screenshots/map-light.jpg`, `map-dark.jpg`, `spend-light.jpg`, `spend-dark.jpg`. Source boards: `MinimalMap*.dc.html`, `MinimalSpend*.dc.html`.
**Owns:** `components/views/MapView.tsx`, `components/views/ExpensesView.tsx`. Uses `LeafletMap` (owned by the coordinator after WS0; it already supports `markerNumbers`, `selectedItemId`, `hoveredItemId` and `dimmedItemIds`). Request any change to it under Notes / Requests.

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens), and the expense invariants in `AGENTS.md` and `docs/decisions/0003-expense-records.md`.

## Checklist

- [ ] Map: day filter list on the left (All days, then each day with title and place count); selecting a day numbers and highlights its markers and dims the rest (`dimmedItemIds`); fit to the selected day; note items without coordinates; OSM attribution visible.
- [ ] Spend: one large total per currency (Geist Mono 300), each with "of X planned" only when the same currency has planned costs; never convert currencies or add planned costs to actual spend.
- [ ] Spend: category breakdown with thin bars, switchable per currency; expense log table (date, description, category, linked item, amount); Log expense button opening the existing form.
- [ ] Keep expense create/edit/delete, linking to items, and decimal-string amounts.

## Parity items

- Map filtering, marker selection, coordinate-less links, attribution.
- Expense totals per currency with the QA trip's JPY and SGD records; planned costs stay separate.

## Notes / Requests

_(fill in)_

## Verification log

_(record each done-check and its result)_
