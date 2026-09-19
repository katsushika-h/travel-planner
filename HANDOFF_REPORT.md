# Travel Planner Handoff Report

**Report date:** 2026-09-19  
**Coverage:** Work completed on 2026-09-18  
**Repository:** `/Users/users/Documents/projects/travel-planner`

## Summary

The project moved beyond the initial POC yesterday with explicit support for unscheduled itinerary items and a new sortable, filterable table view. The data model now permits itinerary items without dates, while the existing Calendar, Kanban, and Itinerary views continue to operate on scheduled items.

## Work completed yesterday

### Unscheduled itinerary items

- Added nullable `startDateTime`, `endDateTime`, and `dayIndex` fields to `TravelObject`.
- Added and applied the migration for the nullable scheduling fields.
- Updated API validation, API routes, client types, and inspector handling.
- Added creation of items without a date.
- Added an unscheduled-items drawer/dock to the Calendar view.
- Added drag behavior to move an unscheduled item onto a calendar date and assign a default one-hour time range.
- Kept unscheduled items out of scheduled Kanban and Itinerary views.
- Added “Remove date” support from the inspector.

### Table view

- Added `components/views/TableView.tsx`.
- Added a **Table** workspace tab and persisted tab state.
- Added keyboard shortcut `T`.
- Added sortable columns for:
  - Title
  - Type
  - Length/duration
  - Cost
  - Tags
- Added a filter menu for title search, type, and tag.
- Clicking a table title opens the existing item inspector.

### Existing data and UI improvements included in yesterday’s work

- Added trip-level default currency support.
- Added optional travel-object header image support and its migration.
- Continued inspector editing for type, dates, location, cost, tags, notes, and header images.
- Updated Calendar, Kanban, and Itinerary views to handle nullable scheduling fields.
- Cleaned up the repository documentation and deployment files.

## Current project state

- Main app: Next.js 16, React 19, TypeScript, Tailwind, Zustand.
- Persistence: PostgreSQL via Prisma.
- Existing workspace views: Calendar, Kanban, Itinerary, and Table.
- Travel objects support locations, Google Maps URLs, costs, notes, tags, header images, and optionally no schedule.
- Docker deployment target: `linux/amd64`.
- App image: `hokusaik/travel-planner-app:latest`.
- The app image was successfully built and pushed after the latest UI changes. No migrator image was rebuilt because no schema change was included in that deployment.

## Validation performed

- `npm run lint` passed with four existing `@next/next/no-img-element` warnings.
- `npx tsc --noEmit` passed.
- `npx next build --webpack` passed.
- The default Turbopack build was blocked by a local sandbox process-binding restriction; the Dockerfile uses the webpack build explicitly.

## Feature backlog

See [FEATURES.md](./FEATURES.md). Current ideas are:

- Attach flight tickets, hotel reservations, and other travel documents.
- Export locations to Google My Maps as CSV/KML.
- Import a Google Maps saved-list/Google Takeout export into itinerary items.
- Unscheduled items (implemented; the backlog entry should be marked complete when desired).
- Undo recently made changes.

## Important handoff notes

- A follow-up commit on 2026-09-19 is titled `fixed drawer beheavior`; review it together with the unscheduled drawer implementation.
- The working tree contains changes after the last clean feature commit. Review them before rebasing, reverting, or creating a release commit; do not reset them blindly.
- When deploying Docker images, explicitly use `--platform linux/amd64`. Push the app image with `docker push hokusaik/travel-planner-app:latest`.

## Suggested next steps

1. Manually exercise the unscheduled drawer: create an undated item, drag it onto a date, remove its date, and verify it returns to the drawer.
2. Manually exercise Table filters and sorting with scheduled and unscheduled items.
3. Decide whether unscheduled items should appear in the Table view by default or have a dedicated schedule-status filter.
4. Mark the implemented unscheduled-items feature complete in `FEATURES.md`.
5. Add the undo stack before making broader editing changes.
