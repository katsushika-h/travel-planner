# WS2 — Calendar: Month, Week, Day, Ideas

**Status:** Complete on branch (pending coordinator review) · **Batch:** B
**Branch:** `claude/minimal-ui-ws2-calendar` (from `claude/minimal-ui-rewrite`) · **Port:** 3102
**Reference:** `docs/design/minimal-ui/screenshots/week-light.jpg`, `week-dark.jpg`. Month and Day are not mocked: derive them from the same tokens and the Plan screenshots. Source boards: `MinimalWeek*.dc.html`.
**Owns:** `components/views/CalendarView.tsx`, `components/views/calendar/*`, `components/views/DayJourneyView.tsx`.

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens), and the schedule decisions in `docs/decisions/0001`–`0005`.

## Checklist

- [x] Toolbar: previous/next, period title, Ideas count, Month/Week/Day as plain-text options with an ink underline. Remove the visible shortcut chips (keep the shortcuts; show them in `title` tooltips).
- [x] Week: day headers with large date numerals; hotel stays as one thin bar spanning their days (all-day multi-day items); hairline hour grid.
- [x] Week fixed items: surface fill, 3px left bar in the type colour, booked items with a 1px ink top edge, **title anchored to the top of the card** (the card is a `<button>`: add `flex flex-col justify-start`; this fix was verified earlier but never merged), overlap indentation via `weekFixedLayers` (12px step) with a 1px background-coloured ring and soft shadow on cards that sit on top.
- [x] Week flexible windows (from PR #14): restyle with tokens; each item row gets the same 3px type-colour bar.
- [x] Start the visible grid near the first item of the week instead of 00:00 (scroll the grid to it on open); keep all 24 hours reachable.
- [x] Month: same tokens, type-colour bars on chips instead of coloured text on tint (fixes low contrast).
- [x] Day mode (`DayJourneyView`): restyle to match the Plan view's list style; keep its continuous scroll and map sync.
- [x] Ideas panel: restyle; "Idea" accent labels.

## Parity items

- Move and resize fixed-time items across dates and timezone boundaries.
- Month drops, flexible-window drops, Day reorder, Ideas drag.
- Keyboard: Q/W/E calendar modes, Space for Ideas.
- `tests/week-create.test.mjs` renders `WeekPlanner`; update its stubs if imports change.

## Notes / Requests

**Deviations and decisions**

- **Weeks are trip-aligned** (seven-day blocks from the trip's first day, so Apr 3–9 as in the mockup and "Day 1" opens the first week) instead of Sunday-based. This is a behaviour change in `CalendarView.weekStartOf`; revert it to the old `sundayOf` if Sunday weeks are preferred. Month still starts on Sunday. Today still lands on the week that contains today.
- **"Booked" top edge**: the data model has no booking flag, so `isBookedItem()` in `calendar-shared.tsx` treats `flight` and `commute` items as booked. Request: an explicit field (or a rule such as "has attachment/confirmation") if the user wants Kaiseki-style reservations marked.
- **Stays band**: all-day items are one bar per week, stacked in lanes, labelled "Stays" when every bar is a hotel and "All day" otherwise. A hotel bar covers its nights (check-out day is not an occupied column), labelled `· N nights`; other all-day items show `· N days`. Bars are draggable (grabbed day keeps its offset, as in Month) and the cells under them still accept `day:` drops.
- **Overlap step**: `weekFixedLayers` (lib, not mine) still steps 8px; `WeekPlanner` derives the depth from it and indents 12px per level. Request: give `weekFixedLayers` a 12px step and drop the conversion.
- **Dropped**: visible shortcut chips (shortcuts kept; shown in `title` tooltips), the "Choose a day, then arrange its visit order" subtitle, the footer help strip and the per-day "N places" count in the Week header. The Month/Week/Day buttons are plain text with an ink underline; Today, Trip start, Ideas and Add idea are plain text options.
- **Resize handles**: on touch they are a thin bar inside a 24px hit area (they were a bright pill); the desktop hover pill is ink.
- **Day mode**: the itinerary column is 44% wide (was 28.5%) so the large mono time, number, title and cost fit; Ideas panel offset follows. Cards are Plan-style rows (time, number, title, type · location · cost, Maps link, reorder grip); the selected stop's time and number use the accent.
- **Week scroll**: the grid opens scrolled to half an hour above the week's first item (07:30 when nothing is earlier than 08:00); all 24 hours remain reachable. The day headers and stays band are sticky.
- Month: the grid grip icon was removed (whole chip drags); chips use a 3px type-colour bar on a surface fill.
- Pre-existing, not changed: in Day mode, drop gaps are numbered over the displayed list including multi-day all-day items carried from earlier days, while `canDropInDayOrder` and the server count only items dated that day, so a gap just below a carried hotel is a no-op. Not caused by this rewrite.
- Tests: `tests/week-create.test.mjs` stubs updated (`useEffect`, `isBookedItem`, real `shiftDate`/`occursOnItineraryDate`) and a new test covers the stay bar and top-anchored cards.

## Verification log

- `npm run check`: lint 0 errors (warnings: img elements elsewhere, none new in owned files after cleanup), `tsc` clean, Prettier clean, 99/99 tests.
- `npx next build --webpack`: success.
- Colour grep over owned files: no output.
- Browser (port 3102, trip Minimal UI QA), screenshots in `docs/work/minimal-ui/screenshots/ws2/`: Week at 1440 light and dark vs `week-light.jpg`/`week-dark.jpg`; Month and Day at 1440 (light and dark); Week, Month and Day at 390 light, Week at 390 dark; Ideas panel open in Day and Week; selected card with the editor open.
- Parity (1440, light): fixed item drag Tue 14:00 to Wed 12:00 (moved, time kept); Idea dragged from the panel into the Thu flexible window (joined it as #2); Month drop Wed to Fri (time kept); Space toggles Ideas; clicking a card selects it and opens the editor. Test items were deleted afterwards (21 baseline items remain).
- Not verified: resize-handle drag, Q/W/E keys (handled in the shell), timezone boundary moves, Day reorder drop (hit the pre-existing gap-index quirk above), 320px, dark Month/Day at 390.
