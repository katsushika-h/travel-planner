# WS1 — Plan view

**Status:** Done on branch, awaiting review · **Batch:** B
**Branch:** `claude/minimal-ui-ws1-plan` (from `claude/minimal-ui-rewrite`) · **Port:** 3101
**Reference:** `docs/design/minimal-ui/screenshots/plan-light.jpg`, `plan-dark.jpg`. Source boards: `Minimal.dc.html`, `MinimalDark.dc.html`.
**Owns:** `components/views/TripDaysView.tsx` (kept under this name so `AppShell.tsx` needs no import change; rename to `PlanView.tsx` on request), new files under `components/views/plan/`, `tests/plan-domain.test.mjs`, `docs/work/minimal-ui/screenshots/ws1/`.

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens), and the schedule decisions in `docs/decisions/0001`–`0005`.

## Checklist

- [x] Day strip: one button per trip day (weekday, date numeral in Geist Mono 300); active day has an ink underline. Day summary on the right: weekday, stop count, planned total per currency (planned costs only; never actual expenses).
- [x] Stop list for the active day: large monospace time (fixed: start time; flexible: `~HH:MM` from `placementTime` or "Flexible"; all-day: "All day"), map number (`01`…; "—" when the item has no coordinates), title, one muted meta line (type · place), cost. No past/done styling (no status field exists).
- [x] Clicking a row selects it (existing selection model) and expands notes with Maps and Edit links; Edit opens the item editor.
- [x] Day map beside the list using `LeafletMap` with `markerNumbers`, `selectedItemId`, hover sync both ways and fit to the active day — reuse the patterns in `DayJourneyView.tsx`. Show "N stops without a location · add link" when items lack coordinates.
- [x] Notes (kind `note`) appear inline in `dayOrder`, styled as plain dashed blocks.
- [x] Keep reordering within the day (`dayOrder`, same rules and helpers as today). **Cross-day moves (default decision):** dragging a stop onto a day in the day strip moves it to that day using the existing move action. If this proves unworkable, record it in Notes and keep the old multi-column layout behind the day strip instead.
- [x] Add-stop affordances: add at end of day and between stops, reusing the existing create flow.
- [x] Leave space in the row layout for a future travel-time line (WS7); do not implement routing.
- [x] Below 768px: list and map stack, or use the existing Itinerary/Day map switch.

## Parity items

- Reorder flexible and timed items within a day and across days.
- Create an unscheduled item, move it onto a date, remove its date (returns to Ideas).
- Selection, multi-selection and inspector state; marker ↔ row selection; coordinate-less links; attribution.

## Notes / Requests

**Built**

- `TripDaysView.tsx` is the Plan view: sticky day strip (weekday, mono day numeral, ink underline on the active day, accent when today) with a day summary (weekday, stop count, planned cost per currency; a multi-day item's cost counts on its first day only); stop list; day map. Parts live in `components/views/plan/` (`DayStrip`, `StopRow` with `AddGap`/`EndSlot`/`NoteBlock`, `PlanMap`, pure helpers in `plan-domain.ts` with tests).
- Row: mono time (fixed start, `~HH:MM` from `placementTime`, "Flexible", "All day"), map number (`—` without coordinates; mapped stops are numbered 01… in list order, matching the pins), title, one meta line, planned cost (`Free` for 0). No past/done styling. Click selects and expands notes with Maps and Edit; click again collapses.
- Map: `LeafletMap` with `markerNumbers`, row/pin hover and selection sync both ways, fit to the active day, "N stops without a location · add link" (opens the editor for the first such stop) and "Recenter day".
- Cross-day move: drag a stop onto a day button in the strip (default decision; works, verified in the browser). Dropping on a stop inserts before it, or after it when the dragged row's centre is in its lower half; dropping on "Add stop" at the end of the list appends. Drop logic reuses `itineraryDropPosition`, `allDayDropStartDate`, `onMove` and `onReorder` unchanged.
- Add stop: hover gap between stops (always visible on touch) and at the end of the day; the gap index is passed as a second argument to `onCreateItem`.
- The travel-time line (WS7) has a marked slot at the bottom of `StopRow`.
- Below 768px: Stops / Map switch in the sticky header; map is only mounted when visible.

**Deviations**

- Sensors changed from `PointerSensor` to `MouseSensor` (3px) plus `TouchSensor` (250ms hold) so a finger can scroll the list and long-press to drag. Not verified on a real touch device.
- Collision detection now uses only the pointer-within droppable (previously fell back to `closestCorners`); a drop outside any target is a no-op rather than snapping to the nearest slot.
- Header images on cards are dropped (the Minimal design has none). The old "Itinerary" header and multi-column board are gone.
- Notes are read-only dashed blocks (draggable, so `dayOrder` stays consistent); they are edited in Calendar Day mode. They only appear when the shell passes them (see request 1).
- Cost uses `currencyDisplay: "narrowSymbol"`, like the Spend follow-up in the plan.

**Requests for the coordinator (`AppShell.tsx`)**

1. Pass notes to the Plan view: `items={items.filter((item) => item.date !== null)}` instead of `itineraryItems`. The view filters notes out of the map, numbering and totals itself, and needs them so `dayOrder` gaps match the server's full day sequence.
2. Select without opening the inspector, and give Edit its own handler, as for Table: `onSelect={(item, additive) => selectItem(item, additive, false)}` and `onInspect={inspectItem}`. Until then, clicking a row also opens the editor (the view still works).
3. Pass the gap index when creating: `onCreateItem={(date, order) => void openCreateItem(date, undefined, "unclassified", "(untitled event)", order)}`. Until then new stops are appended at the end of the day.
4. Optional: `inspectedItemId` is no longer needed by the view; drop the prop when convenient.

**Findings**

- Pre-existing, unchanged: a multi-day all-day item (the hotel) sorts into other days by its first day's `dayOrder` and counts as a position in the visible list, so a drop can land one place later than drawn on days it spans. Same as the old Itinerary board; the fix belongs in `schedule-order`/reorder route, not here.
- Timed items re-sort by time after a reorder, so dragging a timed stop among timed stops appears to do nothing (existing rule).

## Verification log

1. `npm run check`: lint 0 errors (2 existing `<img>` warnings), `tsc` OK, Prettier OK, 104/104 tests (6 new in `tests/plan-domain.test.mjs`).
2. `npx next build --webpack`: succeeded.
3. Colour grep over owned files: prints nothing.
4. Screenshots in `screenshots/ws1/`: `plan-light-1440.jpg`, `plan-dark-1440.jpg`, `plan-light-390.jpg`, `plan-map-dark-390.jpg` (800px-wide captures of the Minimal UI QA trip, Mon Apr 5). Compared with `plan-light.jpg` / `plan-dark.jpg`: same layout, type scale, rules and number column; differences are the missing walking legs (WS7) and the real OSM map instead of the static image.
5. Parity, browser (Minimal UI QA, baseline restored afterwards): flexible stop reordered within a day, moved to another day via the strip and back; selection, expand/collapse, pin to row sync, editor opens; add stop via the gap creates an item (deleted afterwards). Not run: multi-select with Shift, keyboard shortcuts 1-6 (untouched shell code), notes block (no notes in the QA trip), touch long-press drag.
