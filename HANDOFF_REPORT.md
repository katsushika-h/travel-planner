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

## Weekend update (2026-09-19 through 2026-09-21)

### Features added

- Added travel-document attachments to itinerary items, including upload/list/download/delete API routes and a Prisma `TravelAttachment` model.
- Added Google Maps saved-list CSV import with category/type mapping. CSV categories that do not already exist are added as custom event types.
- Added Google Maps coordinate extraction, including coordinates found in common URL forms and legacy Google Maps feature IDs.
- Added a Leaflet/OpenStreetMap Map workspace view with colored markers, item popups, and day filters.
- Added trip map support to the workspace navigation and persisted calendar mode state.

### Schedule refactor

- Replaced the prior schedule source of truth with separate `date`, `endDate`, `startTime`, and `endTime` fields.
- Added `dayOrder` for itinerary ordering and `placementTime` for flexible items that have a date but no confirmed time.
- Added database migrations and a schedule-shape check constraint to distinguish unscheduled, all-day, fixed-time, and flexible items.
- Added compatibility conversion so API responses still expose legacy timestamp fields while the UI migration is in progress.
- Expanded Calendar behavior toward month, week, and full-width day views, including drag/drop, fixed-time anchors, flexible item placement, and resizing.
- Added reorder API support and updated the Itinerary view to persist day ordering.
- The latest schedule commit explicitly notes that `dayOrder` is still somewhat incorrect and should be tested before treating this area as finished.

### Other weekend changes

- Added trip and travel-object deletion confirmation flows.
- Added custom event-type removal support and calendar mode state to Zustand.
- Expanded the feature backlog with CSV categorizing, suggested-time planning, user accounts, and a revised unscheduled panel concept.
- Added design/reference images and a `day-view.md` specification for the new day and week behavior.

### Weekend validation

- `npm run lint` passed with 7 warnings: one unused `timezone` parameter in `CalendarView.tsx` and six existing `<img>` optimization warnings.
- `npx tsc --noEmit` passed.
- `npx next build --webpack` passed, including the new attachment, reorder, and map routes.

### Current risks and follow-up

- The schedule migration is a large schema change across six migrations. Test upgrades against a database containing real pre-refactor data before deployment.
- Verify `dayOrder` and flexible-item placement across Calendar week/day and Itinerary views; the latest commit identifies this as unfinished.
- Attachments are stored directly in PostgreSQL as bytes. This is acceptable for a lightweight POC but may increase database size and backup time.
- Confirm OpenStreetMap tile usage and attribution remain compliant before public or high-volume hosting.
- Rebuild and push both Docker images for `linux/amd64` after schedule or schema changes; the migrator must be rebuilt whenever migration files change.

### Review findings

- The weekend commits include hundreds of tracked `.next` build artifacts and generated cache changes. This creates noisy diffs and should be cleaned up separately with an explicit repository-maintenance change.
- Attachment routes enforce a 20 MB limit and extension allowlist, but there is still no authentication or trip ownership boundary. That is consistent with the single-user POC and must be addressed before exposing the app to multiple users.
- The attachment model stores binary data in PostgreSQL. This keeps deployment simple but makes database growth and backups scale with every uploaded file.
- `CalendarView.tsx` has one unused `timezone` parameter in addition to existing image optimization warnings; these are lint warnings, not build blockers.
