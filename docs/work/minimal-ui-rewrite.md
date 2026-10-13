# Minimal UI rewrite

**Status:** Planned (2026-10-13). Mockups and plan committed; no implementation yet.

**Goal:** Rebuild the workspace UI in the Minimal design, in light and dark themes, without changing behaviour, the API, the schema or persisted client state.

**Design source:** [docs/design/minimal-ui](../design/minimal-ui/README.md) (canonical boards, design tokens, how to read the mockups). Decision: [ADR 0006](../decisions/0006-minimal-ui.md).

**Branch:** `claude/minimal-ui-rewrite` (integration branch, created from `origin/main` at `e5f79fa`). All workstream branches start from it and merge back into it. Open one PR from it to `main` when Phase 2 is complete.

**Scope:**

- In: app shell and header, theme tokens and fonts, all six views (Plan, Calendar, Board, Table, Map, Spend), the item editor, trip dialogs and menus, map theming, light and dark, existing mobile layout restyled.
- Out (separate later work): walking routes and travel times (needs a routing provider, server route, cache table and migration — see Phase 3), MapLibre or 3D maps, new features not in the mockups, API or schema changes.

## Rules for every agent

Read these before editing:

1. `AGENTS.md` (important invariants), this plan, the design README, and the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (fonts, layout).
2. **Behaviour must not change.** Keep `date`/`endDate`/`startTime`/`endTime`/`placementTime`/`dayOrder` handling, drag and drop, multi-select, keyboard shortcuts (1–6 views, Q/W/E calendar modes, Space for Ideas, Delete with confirmation), autosave, Maps URL handling, attachments, and expense rules (actual expenses separate from planned costs; totals per currency, no conversion).
3. **Do not change persisted state.** Keep the `PlannerTab` values (`calendar`, `kanban`, `days`, `table`, `map`, `expenses`), `calendarMode`, and `theme` in `store/use-travel-store.ts`. Only labels change: `days` is shown as **Plan**, `kanban` as **Board**, `expenses` as **Spend**.
4. **Use theme tokens, not colours.** Replace hard-coded `stone-*`, `neutral-*`, `emerald-*` and hex classes in the files you own with the CSS variables from Workstream 0. Do not add new hard-coded colours.
5. **Mobile stays working.** The mobile contract in [mobile-ui-implementation.md](mobile-ui-implementation.md) (trip header, bottom navigation, full-width inspector, Day map switch) must keep working at 320–390px. Restyle it; do not remove it.
6. **Own only your files.** Each workstream lists the files it owns. If you need a change in a file you do not own (most often `AppShell.tsx`, `globals.css`, `LeafletMap.tsx`, `lib/type-color.ts`), write it under **Requests** in your workstream section and leave it to that file's owner or the coordinator.
7. **Keep OSM attribution visible** on every map. No new map provider, API key or billing.
8. Keep changes local; Prettier (`npm run format`) formats files. Add or update behavioural tests where a practical seam exists.

### Environment gotchas

- Work in your own git worktree. Turbopack rejects a symlinked `node_modules`, so run `npm ci` in each worktree, and copy `.env` from the main checkout.
- In a fresh worktree, run `npx next typegen` before `npm run typecheck`, or `LayoutProps` and route types are missing. Revert the resulting `next-env.d.ts` change before committing.
- PostgreSQL runs in Docker (`travel-planner-postgres-1`, port 5433). Start Docker Desktop if the app shows "Request failed".
- Use a distinct dev-server port per worktree (`npm run dev -- -p 31NN`, suggested below).
- Test data: do not delete or rewrite the retained trips **Codex Mobile UI QA**, **Codex Mobile UI Empty QA** or **MacOS Test Trip**. Workstream 0 creates a retained trip **Minimal UI QA**; add test items there and leave baseline items in place.

## Work sequence and parallelism

```
Phase 0 (one agent, blocks everything)      WS0 Foundation
Phase 1 (parallel, after WS0 is merged)     WS1 Plan · WS2 Calendar · WS3 Board + Table · WS4 Map + Spend · WS5 Item editor + dialogs
Phase 2 (one agent)                         WS6 Integration, parity QA, docs, PR
Phase 3 (later, separate PR, needs decision) WS7 Walking routes and travel times
```

Coordinator duties: create each workstream branch from the integration branch after WS0 merges (`git worktree add ../travel-planner-ws1 -b claude/minimal-ui-ws1-plan claude/minimal-ui-rewrite`), merge finished branches back with `--no-ff` one at a time, run `npm run check` after each merge, and route **Requests** to file owners. Phase 1 workstreams do not share files, so merges should be clean apart from `docs/work/minimal-ui-rewrite.md` (resolve by keeping every workstream's notes).

Each agent, when finishing: tick its checklist here, fill in **Notes / Requests**, commit on its branch, and report the checks it actually ran.

---

## WS0 — Foundation (Phase 0)

**Branch:** `claude/minimal-ui-ws0-foundation` · **Port:** 3100
**Boards:** header and tabs on every Minimal board; tokens table in the design README.
**Owns:** `app/globals.css`, `app/layout.tsx`, `components/layout/AppShell.tsx`, `components/ui/*`, `lib/type-color.ts`, `components/views/LeafletMap.tsx`, `store/use-travel-store.ts` (labels only, no key changes), `components/trip/*` only for moving them into the trip menu (WS5 restyles their insides).

- [ ] Add the token set from the design README as CSS variables for `:root` and `.dark` in `globals.css`, mapped into the Tailwind `@theme` block (`--color-background`, `--color-foreground`, plus `panel`, `surface`, `muted`, `faint`, `divider`, `input-rule`, `accent`, `danger`). Keep the existing shadcn variables pointing at the new values so untouched components still look coherent.
- [ ] Load Geist and Geist Mono (check the Next 16 font guide in `node_modules/next/dist/docs/` first) and set `--font-sans` / `--font-mono`.
- [ ] Replace the desktop sidebar with the one-line header: trip name and dates as a trip-switcher button, plain-text view tabs (Plan, Calendar, Board, Table, Map, Spend) with an ink underline on the active tab, search button, and add button. Keep keyboard shortcuts 1–6.
- [ ] Trip-switcher menu (dropdown or popover, keyboard accessible, Escape closes, focus returns to the button) containing: trip list with dates, New trip, Edit trip, Import Maps CSV, Export calendar (.ics), theme toggle, Delete trip. Reuse the existing `components/trip/*` components and their logic.
- [ ] Restyle the mobile header and bottom navigation with the tokens; the More menu reuses the trip-switcher contents.
- [ ] Remove the 230px sidebar and its collapsed state from layout. Keep the `sidebarCollapsed` store field (persisted) but stop using it; note this in Notes.
- [ ] `lib/type-color.ts`: add `typeTextColor(color, theme)` that returns a readable darker shade (light) or lighter shade (dark) of a type colour for heading text (target 4.5:1 against the background); unit-test it in `tests/`.
- [ ] `LeafletMap.tsx`: apply the light/dark tile filters from the design README to the tile pane only (markers and popups unfiltered); restyle markers as numbered circles (default outlined, selected filled with accent) using tokens; keep attribution visible in both themes. Keep its props API stable for WS1/WS2/WS4.
- [ ] Restyle `components/ui/button.tsx` variants and `ConfirmDialog.tsx` to the tokens (square corners, outlined or text buttons, ink focus ring).
- [ ] Create the retained trip **Minimal UI QA** (Kyoto & Osaka, Apr 3–10, Asia/Tokyo, JPY) with items similar to the mockups: fixed, flexible, all-day multi-day hotel, overlapping fixed items, a flexible item between fixed items, an unscheduled idea, an item whose Maps URL has no coordinates, and two JPY plus one SGD expense. Record its ID in Notes.
- [ ] Verify all six tabs still render (unstyled is fine), shortcuts work, the trip menu performs every action, light/dark toggles, 390px mobile works. `npm run check`.

**Notes / Requests:** _(fill in)_

## WS1 — Plan view (Phase 1)

**Branch:** `claude/minimal-ui-ws1-plan` · **Port:** 3101
**Boards:** `Minimal.dc.html`, `MinimalDark.dc.html`.
**Owns:** `components/views/TripDaysView.tsx` (rename to `PlanView.tsx` if useful; update the import in `AppShell.tsx` through a Request or with the coordinator), new files under `components/views/plan/`.

- [ ] Day strip: one button per trip day (weekday, date numeral in Geist Mono 300); active day has an ink underline. Day summary on the right: weekday, stop count, planned total per currency (planned costs only; never actual expenses).
- [ ] Stop list for the active day: large monospace time (fixed: start time; flexible: `~HH:MM` from `placementTime` or "Flexible"; all-day: "All day"), map number (`01`…; "—" when the item has no coordinates), title, one muted meta line (type · place · status), cost. Past/done styling is out of scope (no status field exists).
- [ ] Clicking a row selects it (existing selection model) and expands notes with Maps and Edit links; Edit opens the item editor.
- [ ] Day map beside the list using `LeafletMap` with `markerNumbers`, `selectedItemId`, hover sync both ways and fit to the active day — reuse the patterns in `DayJourneyView.tsx`. Show "N stops without a location · add link" when items lack coordinates.
- [ ] Notes (kind `note`) appear inline in the list in `dayOrder`, styled as plain dashed blocks.
- [ ] Keep reordering within the day (`dayOrder`, same rules and helpers as today). **Cross-day moves (default decision):** dragging a stop onto a day in the day strip moves it to that day using the existing move action. If this proves unworkable, record it in Notes and keep the old multi-column layout behind the day strip instead.
- [ ] Add-stop affordances: add at end of day and between stops, reusing the existing create flow.
- [ ] Leave space in the row layout for a future travel-time line (WS7); do not implement routing.
- [ ] Below 768px: list and map stack, or use the existing Itinerary/Day map switch.
- [ ] Verify light/dark at 1440 and 390, reorder, cross-day move, create, select↔marker sync, attribution. `npm run check`.

**Notes / Requests:** _(fill in)_

## WS2 — Calendar: Month, Week, Day, Ideas (Phase 1)

**Branch:** `claude/minimal-ui-ws2-calendar` · **Port:** 3102
**Boards:** `MinimalWeek.dc.html`, `MinimalWeekDark.dc.html` (Month and Day are not mocked: derive from the same tokens).
**Owns:** `components/views/CalendarView.tsx`, `components/views/calendar/*`, `components/views/DayJourneyView.tsx`.

- [ ] Toolbar: previous/next, period title, Ideas count, Month/Week/Day as plain-text options with an ink underline. Remove the visible shortcut chips (keep the shortcuts; show them in `title` tooltips).
- [ ] Week: day headers with large date numerals; hotel stays as one thin bar spanning their days (all-day multi-day items); hairline hour grid.
- [ ] Week fixed items: surface fill, 3px left bar in the type colour, booked/fixed styling as in the board, **title anchored to the top of the card** (the card is a `<button>`; add `flex flex-col justify-start` — this fix was verified in the PR #14 worktree but never merged), overlap indentation via `weekFixedLayers` (12px step) with a 1px background-coloured ring and soft shadow on cards that sit on top.
- [ ] Week flexible windows (from PR #14): restyle with tokens; each item row gets the same 3px type-colour bar.
- [ ] Consider starting the visible grid near the first item of the week instead of 00:00 (scroll the grid to it on open); keep all 24 hours reachable.
- [ ] Month: same tokens, type-colour bars on chips instead of coloured text on tint (fixes low contrast).
- [ ] Day mode (`DayJourneyView`): restyle to match the Plan view's list style; keep its continuous scroll and map sync.
- [ ] Ideas panel: restyle; "Idea" accent labels.
- [ ] Verify drag/move/resize in Week, Month drops, flexible-window drops, Day reorder, Ideas drag, light/dark, 390px. `npm run check` (includes `tests/week-create.test.mjs` which renders `WeekPlanner`; update its stubs if imports change).

**Notes / Requests:** _(fill in)_

## WS3 — Board and Table (Phase 1)

**Branch:** `claude/minimal-ui-ws3-board-table` · **Port:** 3103
**Boards:** `MinimalBoard*.dc.html`, `MinimalTable*.dc.html`.
**Owns:** `components/views/KanbanView.tsx`, `components/views/TableView.tsx`.

- [ ] Board columns separated by whitespace, each with a 3px top rule and swatch in its type colour and the heading in `typeTextColor` (from WS0); counts in Geist Mono; cards as rows with when (Geist Mono), title, place; "Idea" in accent for unscheduled items.
- [ ] Keep column drag, type change on drop, custom type creation, colour picker and ordering.
- [ ] Board filter options All / Scheduled / Ideas only (client-side filter only; no persisted state unless the store already has one).
- [ ] Table: filter field with underline, ink rule above the table, hairline rows, date shown once per day, Geist Mono for date/time/cost, type dot in type colour, selected rows shaded, bulk action bar for the selection (reuse existing actions), planned-cost footer **per currency**.
- [ ] Keep sorting, inline edits, multi-select and currency totals.
- [ ] Verify light/dark, 390px horizontal scroll inside the table box. `npm run check`.

**Notes / Requests:** _(fill in)_

## WS4 — Map and Spend (Phase 1)

**Branch:** `claude/minimal-ui-ws4-map-spend` · **Port:** 3104
**Boards:** `MinimalMap*.dc.html`, `MinimalSpend*.dc.html`.
**Owns:** `components/views/MapView.tsx`, `components/views/ExpensesView.tsx`. (Uses `LeafletMap` from WS0; request changes there.)

- [ ] Map: day filter list on the left (All days, then each day with title, place count); selecting a day highlights its markers (numbered, accent) and dims the rest; fit to the selected day; note items without coordinates; attribution visible.
- [ ] Spend: one large total per currency (Geist Mono 300), each with "of X planned" only when the same currency has planned costs; never convert or add planned to actual.
- [ ] Spend: category breakdown with thin bars, switchable per currency; expense log table (date, description, category, linked item, amount); Log expense button opening the existing form.
- [ ] Keep expense create/edit/delete, linking to items, decimal string amounts.
- [ ] Verify light/dark, 390px, the per-currency rules with the QA trip's JPY and SGD expenses. `npm run check` (includes `tests/expense-domain.test.mjs`).

**Notes / Requests:** _(fill in)_

## WS5 — Item editor, notes and dialogs (Phase 1)

**Branch:** `claude/minimal-ui-ws5-editor` · **Port:** 3105
**Boards:** `MinimalItem.dc.html`, and the docked editor in `MinimalTableDark.dc.html`.
**Owns:** `components/inspector/*`, `components/notes/ItemNoteCard.tsx`, the insides of `components/trip/CreateTripDialog.tsx`, `EditTripDialog.tsx`, `DeleteTripButton.tsx`, `ImportGoogleMapsCsvButton.tsx`, `ExportIcsButton.tsx` (WS0 owns where they are placed).

- [ ] Editor layout: type dropdown with swatch, close button, large in-place title, then sections separated by dividers: When, Where, Cost and tags, Notes, Attachments; footer with "Saved" status and Delete item.
- [ ] When: Fixed time / Flexible / All day / Unscheduled as plain-text options mapping exactly to the current schedule shapes; date, start, end fields (underlined inputs, Geist Mono for times). Keep `DateFields.tsx` keyboard behaviour (see `tests/date-fields.test.mjs`).
- [ ] Where: place, Google Maps link, coordinate status ("Pinned · lat, lng" or "No location — paste a Maps link with coordinates"); optional small map preview using `LeafletMap` (non-interactive) or omit if it costs too much.
- [ ] Cost (amount + currency picker), tags, Markdown notes (restyle the MDX editor via the existing `.travel-markdown-editor` CSS hooks), attachments with drop zone.
- [ ] Docked side panel on desktop (as in `MinimalTableDark`), full-width surface on mobile (existing contract).
- [ ] Notes cards and trip dialogs restyled with tokens.
- [ ] Verify every field saves (autosave queue), schedule-mode switches keep valid shapes, attachments upload/delete, Delete confirmation, light/dark, 390px. `npm run check` (includes `tests/delete-hotkey.test.mjs`).

**Notes / Requests:** _(fill in)_

---

## WS6 — Integration, parity QA, docs (Phase 2)

**Owner:** coordinator or one agent on `claude/minimal-ui-rewrite` · **Port:** 3100

- [ ] Merge WS1–WS5; resolve Requests; remove now-unused code and colour classes (`grep -rn "emerald-\|stone-\|neutral-" components` should only show deliberate leftovers).
- [ ] Run the parity matrix in `docs/REFACTORING_TRACKER.md` ("Required parity matrix") in both themes.
- [ ] Mobile pass at 320 and 390px against [mobile-ui-implementation.md](mobile-ui-implementation.md).
- [ ] Accessibility pass: focus order and visible focus in header, trip menu, tabs, editor; text contrast 4.5:1 for body and type-coloured headings in both themes.
- [ ] `npm run check` and `npx next build --webpack`.
- [ ] Update `docs/architecture.md` (shell layout, theme tokens) and the `AGENTS.md` code map if files moved; mark this plan complete.
- [ ] Open the PR from `claude/minimal-ui-rewrite` to `main` with before/after screenshots in both themes.

## WS7 — Walking routes and travel times (Phase 3, separate PR)

Not part of this rewrite. Needs a decision from the user first: routing provider (hosted OpenRouteService or GraphHopper with a key, or self-hosted OSRM/Valhalla on the NAS). Plan when approved: server route that calls the provider and caches each leg in a new Postgres table (migration), walking time and distance between consecutive located stops in the Plan list ("11 min walk · 0.8 km · Directions"), a "tight" warning when a leg exceeds the gap before the next fixed item, and the route drawn on the day map. The mockup data in `docs/design/minimal-ui/assets/walking-legs-day3.json` shows the intended output.

## Findings

- PR #14 (flexible windows) and PR #15 (Prettier, Calendar split into `components/views/calendar/`, `useItemActions`) are on `main`; this plan targets that structure.
- The Week card top-alignment fix was made in the old `claude/week-flexible-windows` worktree after PR #14 merged and was never committed; WS2 re-applies it in `WeekPlanner.tsx`.
- The current UI hard-codes `stone`/`neutral`/`emerald` classes on about 125 lines across components (most in `DayJourneyView`, `TableView`, `AppShell`, `KanbanView`, `WeekPlanner`).

## Verification log

_(Each workstream adds the checks it actually ran.)_

## Next step

Start WS0 on `claude/minimal-ui-ws0-foundation`.
