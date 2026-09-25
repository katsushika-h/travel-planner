# Schedule refactor handoff

**Status:** In progress (2026-09-25). `REFACTORING_TRACKER.md` is the detailed work log and source of truth.

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
- [x] Normalize affected day order after legacy timestamp PATCH moves and unscheduling.
- [x] Share event-type color lookup across views while retaining map marker validation.
- [x] Move CSV URL resolution and item creation out of the import button while preserving unresolved links.
- [x] Align agent guidance, the schedule ADR, and tracker status with the canonical UI and transitional API boundary.
- [x] Share UTC calendar-day shifting across navigation, trip defaults, and CSV overnight parsing.
- [x] Add a database-backed unscheduled-to-flexible-to-unscheduled schedule contract check.
- [x] Correct Itinerary exact-gap drops and preserve explicit day order when creating new items.
- [x] Verify Kanban forward dragging in a disposable browser and extend non-schedule API field parity.
- [x] Align Week time-slot, cluster, and exact-gap drop indices with the reorder route's full day order.
- [x] Verify malformed JSON API responses and attachment upload, listing, retrieval, and deletion contracts.
- [x] Use one valid-coordinate rule for Day map counts, Map filtering, and Leaflet markers.
- [x] Verify Map day filters, marker selection, Day map counts, and coordinate-free saved links in a disposable browser.
- [x] Cover invalid CSV schedules and incomplete rows in the parser fixture.
- [x] Record multi-row CSV partial-create failure behavior in a service test.
- [x] Verify a multi-row CSV import through browser upload and persisted API readback.
- [x] Verify rejected reorder inputs leave persisted date and sibling order unchanged.
- [x] Audit active consumers of legacy schedule fields before the dedicated API migration.
- [x] Share the type-color lookup with Inspector picker swatches.
- [x] Share the 2,500-byte UTF-8 note limit across Inspector editing and CSV import.
- [x] Guard late type-change and deletion results across trip switches.
- [x] Guard late trip deletion results across trip switches.
- [x] Keep late create, reorder, queued-save, and CSV import errors with their source trip.
- [x] Serialize bulk deletion to avoid same-day ordering conflicts.
- [ ] Extend database-backed contract and ordering coverage before removing legacy API fields.
- [ ] Review remaining Pass 3 through Pass 9 work in `REFACTORING_TRACKER.md`.

**Current state:** Active client components no longer read or write `startDateTime`, `endDateTime`, or `dayIndex`. The API still accepts legacy schedule requests and derives those fields in responses. CSV column names retain their external input labels. Shared client types and explicit create/update request types still include compatibility fields pending the dedicated migration. A repository-wide active-consumer audit found no UI, store, or API-client reads of those fields; remaining reads are CSV input columns and legacy API request parsing. Week and Day now place all-day items first; Week renders them on every date of their span. AppShell passes scheduled items to Itinerary and all items to the other views. `useTripData`, `useItemSaveQueue`, and `useItemSelection` own loading, saves, and selection respectively; AppShell still owns view actions and guards asynchronous item-list, type-change, item-deletion, trip-deletion, create, reorder, and import feedback across trip switches. Itinerary gap drops use shared insertion math; creating an item preserves existing explicit order. All six views and the Inspector use the shared event-type color lookup; Day map counts, Map filtering, and Leaflet markers share one geographic-coordinate check. Map markers still validate hex colors. CSV parsing and import orchestration now live in library modules, while the button owns file selection and feedback. Inspector editing and CSV import share a UTF-8 byte-limit helper for notes.

**Findings:** The Table previously sent only `endDateTime` on length edits, which PATCH rejects; fixed-time edits now send canonical end fields. A multi-day all-day item sent through `/api/travel-objects/reorder` returned HTTP 400 because the route assigned a flexible `placementTime`; the route and UI now restrict all-day dragging to date moves and preserve the date span. The user chose inclusive calendar days for all-day Table Length, avoiding elapsed-hour ambiguity across DST. A failed debounced save displays a connection error while retaining the optimistic unsaved value. The user chose to keep this error-only feedback without automatic retry, rollback, or an unsaved marker. A multi-row CSV import currently rejects if one create fails while other rows may already be saved; the button does not display those successes until the trip reloads. Concurrent bulk deletion of two same-day items produced a Prisma P2025 ordering conflict; the UI now sends those deletes sequentially.

**Verification:** `npm run check` passed with 43 tests and six existing image warnings; an isolated webpack production build and `git diff --check` passed. The shared coordinate predicate passed valid-range boundary, out-of-range, non-finite, and URL-only cases. The CSV parser fixture now covers invalid dates and times, incomplete rows, empty lines, and preserved categories. A three-row CSV uploaded through the browser and persisted a timed place with coordinates, an all-day custom-type place with only a Maps URL, and an undated place with coordinates; the UI reported the coordinate-free link and invalid schedule. A disposable browser trip showed two of four Map items with valid coordinates, one marker per day filter, and the matching inspector on marker selection. Day counted one of three mappable places on the first day and one of one on the second; the URL-only item retained its Google Maps link. Browser checks against disposable PostgreSQL databases confirmed trip switching, item selection, inspector opening, title edit persistence after reload, Escape clearing selection, Table multi-selection and delete confirmation, and visible error feedback for failed saves. Delayed-response checks confirmed single-item deletion and Kanban type changes persisted on Alpha without changing Beta; sequential bulk deletion removed both same-day Alpha siblings while Beta stayed intact after a trip switch. A separate 20-second delayed trip-delete callback check kept Beta and its item visible after deleting Gamma, and API readback showed only Beta persisted. Week and Day placed all-day items first; a three-day all-day item moved to another day with its span intact, including when dropped over a Week time slot. Table displayed a three-day all-day span, saved a four-day length edit, and retained four days after a Start edit across DST. On a fresh temporary PostgreSQL instance, all ten migrations applied, and the API fixture passed GET, POST, PATCH, DELETE, canonical and legacy requests, including PATCH precedence, null unscheduling, flexible conversion, all-day range edits, invalid ranges, and an unscheduled-to-flexible-to-unscheduled round trip. Malformed JSON and non-object JSON requests retained their 400 response. Attachment upload, listing, inline preview, download, deletion, missing-attachment 404, and unsupported-extension validation passed with persisted bytes and headers. The ordering fixture passed forward and reverse same-day insertion, cross-day fixed, flexible, fixed-to-flexible clearing, multi-day all-day movement, gap compaction after deletion, and preservation of explicit flexible gaps after new items were created. It also rejected negative order and off-grid flexible placement without changing persisted dates or sibling order. The API fixture also passed set/clear and invalid-value cases for location, cost, notes, tags, and header-image URLs. Browser checks confirmed Itinerary final-gap insertion, conversion between timed anchors, persistence after reload and creation, and moving a multi-day all-day continuation card with its span intact. Week browser drags placed a flexible item after two fixed items at 12:00 and retained that order after reload. With an all-day sibling at persisted order zero, a cluster drop and an exact-gap drop both preserved all-day-first persisted order. The opt-in legacy migration fixture applied five old migrations, inserted four old-schema rows, applied the remaining five migrations, and verified canonical backfill. Run the HTTP fixtures with `API_BASE_URL=http://127.0.0.1:<port> node tests/api-contract.integration.mjs` and `API_BASE_URL=http://127.0.0.1:<port> node tests/order-contract.integration.mjs` against an isolated migrated database; run the migration fixture with `MIGRATION_FIXTURE_DATABASE_URL=<empty disposable database URL> bash tests/migration-contract.integration.sh`.

**Next step:** Continue focused Pass 2–5 and Pass 7 parity. Late create, reorder, queued-save, and CSV import errors are guarded in code but their delayed failure paths remain available for browser verification if those interactions change. Use the existing synthetic legacy-schema migration fixture because the current database contains only disposable placeholders. Prepare the dedicated API contract change that removes derived legacy schedule fields, and seek explicit approval before changing public responses. Keep the chosen error-only save feedback and record partial CSV import failures as a separate product decision.
