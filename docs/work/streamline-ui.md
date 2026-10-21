# Streamline UI

Status: implemented and browser-checked (2026-10-22); uncommitted on `claude/streamline-ui`.

Goal: one continuous Plan view instead of two day views, a shorter Trip menu, and a calmer item editor. Plan: `~/.claude/plans/gentle-mapping-wolf.md`.

Scope: §1 `components/views/`, `store/use-travel-store.ts`, `components/layout/AppShell.tsx`; §2 `TripMenu.tsx`, `components/trip/*`; §3 `ObjectInspectorPanel.tsx`. Board and Table stay.

## Checklist

### §1 Merge the day views into Plan
- [x] `DayList.tsx` (sections, scroll/active-day tracking, today mark, phone FAB and sheets, notes, log-expense, phone pills), `PhoneJourneyRow.tsx`, `useDayPlan.ts`; `DayJourneyView.tsx` and `DesktopJourneyCard` deleted.
- [x] `TripDaysView` hosts the list: DnD, Ideas, Walk/Drive, desktop day strip (jumps the scroll), summary and `PlanMap` for the active day.
- [x] Route cache lifted to module scope in `useDayRoutes` (shared by sections, map and the Today mark; in-flight requests de-duplicated). A section routes only once near the viewport.
- [x] Drop targets use `trip-row:` / `trip-day:`; `NoteBlock`, the single-day list and `mobileSurface` removed.
- [x] Store `CalendarMode = "month" | "week"`, persist version 2 and migration.
- [x] `CalendarView` without Day; Month/Week open a day through `onOpenDay`; AppShell sets the working day and opens Plan.
- [x] AppShell: Trip tab, `mobileDestination`, `dayFab`, map toggle, notes, log-expense and More → Ideas on Plan; More → Plan row removed; Day shortcut removed.
- [x] Docs: ADR 0010, `AGENTS.md` code map, Pass 6 table in `mobile-ui-implementation.md`.
- [x] Browser QA (desktop 1280, phone 390x844 and 320x568, light and dark): see Verification.

### §2 Trip menu
- [x] Import… and Export… entries, delete `ImportGoogleMapsCsvButton`/`RecalculateMapPinsButton`, add `useLegacyPinCheck`, update `docs/architecture.md` and `docs/FEATURES.md`.

### §3 Item editor
- [x] Double-clicking a desktop Plan row opens the editor (as the old Day view did).
- [x] Redesign `ObjectInspectorPanel.tsx` as in the plan. Same-day items keep date and times on one row; the end date shows once it differs or after "Ends another day".

## Current state

All three parts pass `npm run check` (239 tests) and `npx next build --webpack`. Row ids are now `plan-row-<id>-<date>[-end]` (a multi-day hotel shows on several days); expansion is keyed by item and day.

§2: the one-time pin check (`useLegacyPinCheck`) reports moved pins through a neutral, dismissible notice in `AppShell`; links that cannot be checked are retried on the next visit, not reported. `ImportReservationButton.tsx` now exports `ImportReservationDialog`.

## Findings (browser QA, 2026-10-22)

Passed: Plan scroll, day strip, map and legs, within-day drag, Ideas, notes, Calendar Month/Week and open-day, store migration, Trip menu order, Export, Import accept list, pin-check flag, editor sections, phone Trip/map/More/Ideas, no overflow at 390 and 320. Not tested: drag across days, long-press (no gesture in the browser tool), Month "Today" (today outside the QA trip).

Open, not caused by this work: a new item's title is the literal "(untitled event)" rather than a placeholder; dropping on the upper half of the neighbouring row shows the move toast without a change; view tabs wrap at 1024px; the phone + button overlaps the last row's Maps icon at 320px; the Week → Plan jump is blank for 1–3 s in dev. QA left "QA streamline editor check" (Nov 29) and "QA streamline note persistence check" (Dec 3) in the QA trip.

## Verification

`npm run check`, `npx next build --webpack`, then the browser checklist in the plan on the QA trip "Codex Mobile UI QA": Plan scroll and day strip, map and legs, drag within and across days and to/from Ideas, notes, Calendar Month/Week and "open day", a stored `calendarMode:"day"` migrating to Plan, phone Trip on today, long-press sheet, FAB, map switch, More → Ideas, no horizontal overflow; then the Trip menu and editor checks.
