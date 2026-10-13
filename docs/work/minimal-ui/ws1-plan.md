# WS1 — Plan view

**Status:** Not started · **Batch:** B (after batch A merges)
**Branch:** `claude/minimal-ui-ws1-plan` (from `claude/minimal-ui-rewrite`) · **Port:** 3101
**Reference:** `docs/design/minimal-ui/screenshots/plan-light.jpg`, `plan-dark.jpg`. Source boards: `Minimal.dc.html`, `MinimalDark.dc.html`.
**Owns:** `components/views/TripDaysView.tsx` (rename to `PlanView.tsx` if useful; the import in `AppShell.tsx` is changed by the coordinator on request), new files under `components/views/plan/`.

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens), and the schedule decisions in `docs/decisions/0001`–`0005`.

## Checklist

- [ ] Day strip: one button per trip day (weekday, date numeral in Geist Mono 300); active day has an ink underline. Day summary on the right: weekday, stop count, planned total per currency (planned costs only; never actual expenses).
- [ ] Stop list for the active day: large monospace time (fixed: start time; flexible: `~HH:MM` from `placementTime` or "Flexible"; all-day: "All day"), map number (`01`…; "—" when the item has no coordinates), title, one muted meta line (type · place), cost. No past/done styling (no status field exists).
- [ ] Clicking a row selects it (existing selection model) and expands notes with Maps and Edit links; Edit opens the item editor.
- [ ] Day map beside the list using `LeafletMap` with `markerNumbers`, `selectedItemId`, hover sync both ways and fit to the active day — reuse the patterns in `DayJourneyView.tsx`. Show "N stops without a location · add link" when items lack coordinates.
- [ ] Notes (kind `note`) appear inline in `dayOrder`, styled as plain dashed blocks.
- [ ] Keep reordering within the day (`dayOrder`, same rules and helpers as today). **Cross-day moves (default decision):** dragging a stop onto a day in the day strip moves it to that day using the existing move action. If this proves unworkable, record it in Notes and keep the old multi-column layout behind the day strip instead.
- [ ] Add-stop affordances: add at end of day and between stops, reusing the existing create flow.
- [ ] Leave space in the row layout for a future travel-time line (WS7); do not implement routing.
- [ ] Below 768px: list and map stack, or use the existing Itinerary/Day map switch.

## Parity items

- Reorder flexible and timed items within a day and across days.
- Create an unscheduled item, move it onto a date, remove its date (returns to Ideas).
- Selection, multi-selection and inspector state; marker ↔ row selection; coordinate-less links; attribution.

## Notes / Requests

_(fill in)_

## Verification log

_(record each done-check and its result)_
