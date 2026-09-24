# Schedule refactor handoff

**Status:** In progress (2026-09-24). `REFACTORING_TRACKER.md` is the detailed work log and source of truth.

**Goal:** Move schedule decisions and UI consumers to canonical `date`/`endDate` and `startTime`/`endTime` fields while preserving API and database behavior until a separate contract migration.

**Scope:** Pure schedule helpers, active view reads and writes, CSV creation, shared API parsing, and parity fixtures. No schema, dependency, deployment, or public response-shape change.

**Checklist**

- [x] Migrate Table start and fixed-duration edits to canonical fields.
- [x] Migrate CSV create requests and active Calendar, Kanban, Itinerary, Table, and Inspector schedule reads.
- [x] Remove client optimistic writes of legacy response fields.
- [x] Extract and test create/update schedule parsing; retain legacy request/response compatibility.
- [x] Add database-backed API and ordering parity fixtures.
- [x] Repair all-day dragging to move only by date and retain multi-day spans.
- [x] Show all-day items above Week and Day content, including every date of a multi-day span.
- [x] Share transaction-oriented date-order normalization and compact gaps after scheduled deletion.
- [x] Centralize legacy PATCH schedule projection while keeping the compatibility request contract.
- [x] Extract pure Google Maps CSV parsing from the import button.
- [x] Make the AppShell collection passed to each view explicit.
- [x] Move AppShell's pure trip-wide schedule sorting into `lib/schedule-order.ts`.
- [x] Extract AppShell trip and item loading into `useTripData`.
- [x] Extract AppShell's debounced item-save queue into `useItemSaveQueue`.
- [x] Extract AppShell item selection into `useItemSelection`.
- [x] Move PATCH final schedule normalization into `lib/api-schedule.ts`.
- [x] Extract the reorder transaction into `lib/schedule-order-service.ts`.
- [x] Route Kanban same-day insertion through shared ordering and skip invalid all-day same-day reorder calls.
- [x] Define explicit create and update item request types, including transitional legacy schedule inputs.
- [x] Mark README and HANDOFF_REPORT as historical, link current docs, and record unscheduled ideas as implemented in FEATURES.
- [x] Add a synthetic old-schema migration fixture and verify canonical schedule backfill through all ten migrations.
- [x] Show and edit inclusive calendar days for all-day Table Length, preserving the span on Start edits across DST.
- [x] Refresh trip items after `placementTime` and `dayOrder` PATCHes as well as other schedule changes.
- [x] Guard queued save results and schedule refreshes from replacing another active trip's items.
- [x] Guard create, reorder, and CSV import results from replacing another active trip's items.
- [ ] Extend database-backed contract and ordering coverage before removing legacy API fields.
- [ ] Review remaining Pass 3 through Pass 9 work in `REFACTORING_TRACKER.md`.

**Current state:** Active client components no longer read or write `startDateTime`, `endDateTime`, or `dayIndex`. The API still accepts legacy schedule requests and derives those fields in responses. CSV column names retain their external input labels. Shared client types and explicit create/update request types still include compatibility fields pending the dedicated migration. Week and Day now place all-day items first; Week renders them on every date of their span. AppShell passes scheduled items to Itinerary and all items to the other views. `useTripData`, `useItemSaveQueue`, and `useItemSelection` own loading, saves, and selection respectively; AppShell still owns view actions and guards asynchronous item-list responses across trip switches.

**Findings:** The Table previously sent only `endDateTime` on length edits, which PATCH rejects; fixed-time edits now send canonical end fields. A multi-day all-day item sent through `/api/travel-objects/reorder` returned HTTP 400 because the route assigned a flexible `placementTime`; the route and UI now restrict all-day dragging to date moves and preserve the date span. The user chose inclusive calendar days for all-day Table Length, avoiding elapsed-hour ambiguity across DST. A failed debounced save displays a connection error while retaining the optimistic unsaved value; a retry/rollback policy has not been chosen.

**Verification:** `npm run check` passed with 33 tests and six existing image warnings; an isolated webpack production build and `git diff --check` passed. Browser checks against disposable PostgreSQL databases confirmed trip switching, item selection, inspector opening, title edit persistence after reload, Escape clearing selection, Table multi-selection and delete confirmation, and visible error feedback for failed saves. Week and Day placed all-day items first; a three-day all-day item moved to another day with its span intact, including when dropped over a Week time slot. Table displayed a three-day all-day span, saved a four-day length edit, and retained four days after a Start edit across DST. On a fresh temporary PostgreSQL instance, all ten migrations applied, and the API fixture passed GET, POST, PATCH, DELETE, canonical and legacy requests, including PATCH precedence, null unscheduling, flexible conversion, all-day range edits, and invalid ranges. The ordering fixture passed forward and reverse same-day insertion, cross-day fixed, flexible, fixed-to-flexible clearing, multi-day all-day movement, and gap compaction after deletion. The opt-in legacy migration fixture applied five old migrations, inserted four old-schema rows, applied the remaining five migrations, and verified canonical backfill. Run the HTTP fixtures with `API_BASE_URL=http://127.0.0.1:<port> node tests/api-contract.integration.mjs` and `API_BASE_URL=http://127.0.0.1:<port> node tests/order-contract.integration.mjs` against an isolated migrated database; run the migration fixture with `MIGRATION_FIXTURE_DATABASE_URL=<empty disposable database URL> bash tests/migration-contract.integration.sh`.

**Next step:** Review remaining ordering consumers and browser drag parity. A delayed PATCH browser check confirmed that Alpha's edit persisted while Beta's visible items remained intact after switching trips. Rehearse migrations with a sanitized pre-refactor backup when available and decide retry/rollback behavior for failed saves before changing it. Keep public API compatibility removal as a separate migration.
