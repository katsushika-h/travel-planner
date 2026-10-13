# WS2 — Calendar: Month, Week, Day, Ideas

**Status:** Not started · **Batch:** B (after batch A merges)
**Branch:** `claude/minimal-ui-ws2-calendar` (from `claude/minimal-ui-rewrite`) · **Port:** 3102
**Reference:** `docs/design/minimal-ui/screenshots/week-light.jpg`, `week-dark.jpg`. Month and Day are not mocked: derive them from the same tokens and the Plan screenshots. Source boards: `MinimalWeek*.dc.html`.
**Owns:** `components/views/CalendarView.tsx`, `components/views/calendar/*`, `components/views/DayJourneyView.tsx`.

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens), and the schedule decisions in `docs/decisions/0001`–`0005`.

## Checklist

- [ ] Toolbar: previous/next, period title, Ideas count, Month/Week/Day as plain-text options with an ink underline. Remove the visible shortcut chips (keep the shortcuts; show them in `title` tooltips).
- [ ] Week: day headers with large date numerals; hotel stays as one thin bar spanning their days (all-day multi-day items); hairline hour grid.
- [ ] Week fixed items: surface fill, 3px left bar in the type colour, booked items with a 1px ink top edge, **title anchored to the top of the card** (the card is a `<button>`: add `flex flex-col justify-start`; this fix was verified earlier but never merged), overlap indentation via `weekFixedLayers` (12px step) with a 1px background-coloured ring and soft shadow on cards that sit on top.
- [ ] Week flexible windows (from PR #14): restyle with tokens; each item row gets the same 3px type-colour bar.
- [ ] Start the visible grid near the first item of the week instead of 00:00 (scroll the grid to it on open); keep all 24 hours reachable.
- [ ] Month: same tokens, type-colour bars on chips instead of coloured text on tint (fixes low contrast).
- [ ] Day mode (`DayJourneyView`): restyle to match the Plan view's list style; keep its continuous scroll and map sync.
- [ ] Ideas panel: restyle; "Idea" accent labels.

## Parity items

- Move and resize fixed-time items across dates and timezone boundaries.
- Month drops, flexible-window drops, Day reorder, Ideas drag.
- Keyboard: Q/W/E calendar modes, Space for Ideas.
- `tests/week-create.test.mjs` renders `WeekPlanner`; update its stubs if imports change.

## Notes / Requests

_(fill in)_

## Verification log

_(record each done-check and its result)_
