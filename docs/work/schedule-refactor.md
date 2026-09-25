# Schedule refactor handoff

**Status:** Complete (2026-09-25). `REFACTORING_TRACKER.md` retains the detailed work log.

**Goal:** Use canonical `date`/`endDate` and `startTime`/`endTime` fields throughout the client and public API.

**Scope:** Pure schedule helpers, active views, CSV creation, shared API parsing, ordering, parity fixtures, and the separately approved API contract migration. No schema, dependency, or deployment change.

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
- [x] Block Day drops that reverse confirmed-time order or place flexible items inside overlapping confirmed times.
- [x] Indent overlapping Week cards and open flexible groups on hover.
- [x] Serialize bulk deletion to avoid same-day ordering conflicts.
- [x] Share optional location/cost JSON parsing across travel-object create and update routes.
- [x] Share canonical item date-span projection across Calendar and Day views.
- [x] Consolidate AppShell's undated, flexible, and fixed-time item creation into one guarded flow.
- [x] Move AppShell's item-move schedule patch decisions into a pure schedule-domain helper.
- [x] Share POST/PATCH parsing for travel-object content fields while retaining route validation order.
- [x] Share title/type parsing and finish Pass 3 HTTP contract parity.
- [x] Audit Pass 4 transaction ownership and close required ordering parity.
- [x] Share selected-or-single targets across AppShell group action handlers.
- [x] Remove unreachable additive-selection inspector logic.
- [x] Share all-day and confirmed-time labels across Day, Itinerary preview, and Map popups.
- [x] Audit and close Pass 2's pure canonical schedule-domain coverage.
- [x] Extend database-backed contract and ordering coverage before removing legacy API fields.
- [x] Review remaining Pass 3 through Pass 9 work in `REFACTORING_TRACKER.md`.
- [x] Complete the approved canonical schedule API migration and update fixtures, ADR, and release note.

**Current state:** The app and travel-object API use canonical `date`, `endDate`, `startTime`, `endTime`, `placementTime`, and `dayOrder` fields. The API rejects `startDateTime`, `endDateTime`, and `dayIndex` request keys and omits them from responses. CSV input retains its external combined date/time labels and converts values before API creation; historical migrations remain unchanged. Week and Day show all-day items first, Week separates overlapping timed cards, and Day blocks invalid fixed/flexible drops. AppShell delegates loading, saves, and selection to focused hooks and keeps trip-scoped view coordination. Shared schedule, ordering, color, coordinate, and note-limit helpers serve the views. Passes 0 through 9 are complete under the recorded parity checks.

**Findings:** The Table previously sent only `endDateTime` on length edits, which PATCH rejects; fixed-time edits now send canonical end fields. A multi-day all-day item sent through `/api/travel-objects/reorder` returned HTTP 400 because the route assigned a flexible `placementTime`; the route and UI now restrict all-day dragging to date moves and preserve the date span. The user chose inclusive calendar days for all-day Table Length, avoiding elapsed-hour ambiguity across DST. A failed debounced save displays a connection error while retaining the optimistic unsaved value. The user chose to keep this error-only feedback without automatic retry, rollback, or an unsaved marker. A multi-row CSV import currently rejects if one create fails while other rows may already be saved; the button does not display those successes until the trip reloads. Concurrent bulk deletion of two same-day items produced a Prisma P2025 ordering conflict; the UI now sends those deletes sequentially.

**Verification:** `npm run check` passed with 43 tests and six existing image warnings; an isolated webpack production build and `git diff --check` passed. The shared coordinate predicate passed valid-range boundary, out-of-range, non-finite, and URL-only cases. The CSV parser fixture now covers invalid dates and times, incomplete rows, empty lines, and preserved categories. A three-row CSV uploaded through the browser and persisted a timed place with coordinates, an all-day custom-type place with only a Maps URL, and an undated place with coordinates; the UI reported the coordinate-free link and invalid schedule. A disposable browser trip showed two of four Map items with valid coordinates, one marker per day filter, and the matching inspector on marker selection. Day counted one of three mappable places on the first day and one of one on the second; the URL-only item retained its Google Maps link. Browser checks against disposable PostgreSQL databases confirmed trip switching, item selection, inspector opening, title edit persistence after reload, Escape clearing selection, Table multi-selection and delete confirmation, and visible error feedback for failed saves. Delayed-response checks confirmed single-item deletion and Kanban type changes persisted on Alpha without changing Beta; sequential bulk deletion removed both same-day Alpha siblings while Beta stayed intact after a trip switch. A separate 20-second delayed trip-delete callback check kept Beta and its item visible after deleting Gamma, and API readback showed only Beta persisted. A disposable browser check rejected Day moves that reversed 09:00 and 10:30 timed items and placed a flexible item inside a 09:00–12:00/10:00–11:00 overlap; API readback kept the original order. A valid flexible move before the timed group persisted. Week displayed three staggered color bars for overlapping events, and its flexible group expanded on hover and collapsed on leave. Week and Day placed all-day items first; a three-day all-day item moved to another day with its span intact, including when dropped over a Week time slot. Table displayed a three-day all-day span, saved a four-day length edit, and retained four days after a Start edit across DST. On a fresh temporary PostgreSQL instance, all ten migrations applied, and the API fixture passed GET, POST, PATCH, DELETE, canonical and legacy requests, including PATCH precedence, null unscheduling, flexible conversion, all-day range edits, invalid ranges, and an unscheduled-to-flexible-to-unscheduled round trip. Malformed JSON and non-object JSON requests retained their 400 response. Attachment upload, listing, inline preview, download, deletion, missing-attachment 404, and unsupported-extension validation passed with persisted bytes and headers. The ordering fixture passed forward and reverse same-day insertion, cross-day fixed, flexible, fixed-to-flexible clearing, multi-day all-day movement, gap compaction after deletion, and preservation of explicit flexible gaps after new items were created. It also rejected negative order and off-grid flexible placement without changing persisted dates or sibling order. The API fixture also passed set/clear and invalid-value cases for location, cost, notes, tags, and header-image URLs. Browser checks confirmed Itinerary final-gap insertion, conversion between timed anchors, persistence after reload and creation, and moving a multi-day all-day continuation card with its span intact. Week browser drags placed a flexible item after two fixed items at 12:00 and retained that order after reload. With an all-day sibling at persisted order zero, a cluster drop and an exact-gap drop both preserved all-day-first persisted order. The opt-in legacy migration fixture applied five old migrations, inserted four old-schema rows, applied the remaining five migrations, and verified canonical backfill. Run the HTTP fixtures with `API_BASE_URL=http://127.0.0.1:<port> node tests/api-contract.integration.mjs` and `API_BASE_URL=http://127.0.0.1:<port> node tests/order-contract.integration.mjs` against an isolated migrated database; run the migration fixture with `MIGRATION_FIXTURE_DATABASE_URL=<empty disposable database URL> bash tests/migration-contract.integration.sh`.

**Delivery:** After the Day and Week fixes, `npm run check` passed 45 tests, the Linux AMD64 Docker app production build passed, and `git diff --check` passed. Pushed `hokusaik/travel-planner-app:latest` (`sha256:507c412ad9af3f6dc1b1f4dfcbc03db5eddcaafa6f1afac2b881828ca47ba473`) and `hokusaik/travel-planner-migrator:latest` (`sha256:0d9368b8907a2a3b8013f26464feb3e4fc38dacf78f2468ebb76d4bde7de18ad`); both published manifests list `linux/amd64`. Migration files were unchanged.

**Latest local pass:** Shared create/update parsing of nullable location and cost, canonical item date-span projection across Calendar and Day, and AppShell's item-creation flow. `npm run check` passed 46 tests with six existing image warnings. An isolated webpack production build, the API and ordering HTTP fixtures against a fresh disposable PostgreSQL database, and `git diff --check` passed. The temporary app and database were stopped and removed. No image was built or pushed in this pass.

The subsequent pure item-move extraction passed `npm run check` with 47 tests, a fresh isolated webpack production build, and `git diff --check`. The HTTP fixtures were completed before that final extraction.

**Latest API pass:** Header image, location, cost, notes, and tags now use shared create/update parsing while preserving defaults, partial-update omissions, and validation order. `npm run check` passed 49 tests with six existing image warnings; an isolated webpack build, API and ordering HTTP fixtures on a disposable PostgreSQL database, and `git diff --check` passed. The temporary resources were removed.

Title and type now use shared create/update parsing as well. The final Pass 3 source passed `npm run check` with 50 tests, an isolated webpack build, and both HTTP fixtures against a fresh disposable migrated database. Pass 3 is complete; the public legacy-field contract change remains separate.

The Pass 4 audit confirmed that create, PATCH, reorder, and delete use the shared transaction-oriented order service. Its required database fixture and recorded browser checks pass, so Pass 4 is complete.

AppShell's grouped move, day move, unschedule, and type-change handlers now share one selection target calculation. The 50-test check and isolated webpack build passed after that extraction.

The selection hook's unreachable additive-inspector branch was removed; `npm run check` still passed 50 tests.

Day cards, Itinerary previews, and Map popups now use one short schedule-label helper while retaining each surface's flexible fallback. `npm run check` passed 51 tests and an isolated webpack build passed.

The Pass 2 audit found shared pure helpers for the canonical schedule shapes and transformations, with 51 unit tests covering timezone and DST boundaries. Inspector text input and Calendar drop targeting remain with their views; Pass 2 is complete.

A disposable browser trip was checked in Month, Week, Day, and global Map at desktop and 390px widths. The multi-day all-day item appeared at the top of its dates, and the Map showed both mapped markers and attribution. Month cells are small and Week uses horizontal scrolling. The Calendar header now wraps controls at narrow widths, and Day date navigation scrolls only its itinerary container. A repeat browser path scrolled Week to Friday and switched to Day; Friday's itinerary remained visible and the card stayed aligned. The desktop Day header remained on one row. Browser keyboard checks switched Calendar mode and workspace tabs. Pass 5's loading, save, selection, schedule, and action-boundary audit is complete; AppShell retains trip-scoped view coordination.

The Pass 7 audit found shared labels, date spans, type colors, coordinate validation, note limits, and one Leaflet implementation. Cards stay separate because their layout and drag interactions differ across views. The responsive visual checks, prior Map filter/marker/inspector checks, `npm run check` (51 tests), and isolated webpack build complete Pass 7.

The approved Pass 6 API migration removed legacy response fields and shared client types, rejected removed request keys, and moved CSV timestamp conversion into the canonical schedule domain. On fresh disposable PostgreSQL with all ten migrations, the API and ordering HTTP fixtures passed, including removed-key rejection and canonical response shapes. `npm run check` passed 51 tests, an isolated webpack production build passed, and no schema change was needed. See [ADR 0002](../decisions/0002-canonical-schedule-api.md) and the [release note](api-schedule-release-note.md).

**Post-migration audit:** Restored PATCH validation of `type: null`, which shared identity parsing had accidentally converted to `unclassified`. A unit check and an API contract assertion cover the case. `npm run check` passed 51 tests, and `git diff --check` passed; the database-backed API fixture was not rerun for this narrow correction.

**Next step:** The refactoring effort is complete. The CSV partial-import and narrow Month follow-ups are recorded in [their own handoff](csv-calendar-followups.md). External API clients using removed schedule keys must follow the [release note](api-schedule-release-note.md).
