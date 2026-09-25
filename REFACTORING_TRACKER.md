# Refactoring Tracker

This file is the living handoff for the codebase modernization effort. Every agent working on the refactor must read it before making changes and update it before finishing its turn.

The goal is to improve structure and changeability while preserving current behavior. Public API routes, response shapes, database behavior, and user-facing workflows must remain stable unless a migration is explicitly approved.

## Agent protocol

Before editing code:

1. Read `AGENTS.md`, `HANDOFF_REPORT.md`, this file, and the relevant source files.
2. Inspect `git status --short` and preserve unrelated working-tree changes.
3. Select one small pass below, or document a new pass before starting it.
4. Record the intended current behavior, structural improvement, and validation check in the work log.

After editing code:

1. Run the validation checks appropriate to the pass.
2. Record the files changed, behavior preserved, checks run, and any remaining risks.
3. Update the pass status and next-step notes below.
4. Do not silently combine framework upgrades, dependency upgrades, schema migrations, API changes, authentication, or attachment-storage changes with a structural refactor.

Keep each change reviewable. Prefer one pass per commit or pull request when practical.

## Current status (2026-09-25)

Passes 0 through 9 are complete. The separately approved API migration removed legacy schedule request and response fields; [ADR 0002](docs/decisions/0002-canonical-schedule-api.md) and the [release note](docs/work/api-schedule-release-note.md) describe the contract. Historical work-log entries below record the earlier compatibility period. The refactoring effort requires no further pass. The CSV partial-import and narrow Month density follow-ups are addressed in [the product follow-up handoff](docs/work/csv-calendar-followups.md).

## Current baseline

Historical baseline captured on 2026-09-22 (the API compatibility fields below were removed on 2026-09-25):

- Project: Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand, Prisma, PostgreSQL.
- Active workspace views: Calendar, Kanban, Itinerary, Table, and Map.
- Canonical schedule fields: `date`, `endDate`, `startTime`, `endTime`, `placementTime`, and `dayOrder`.
- Compatibility fields still returned by the API: `startDateTime`, `endDateTime`, and `dayIndex`.
- Attachments are stored as PostgreSQL `Bytes`, with a 20 MB upload limit.
- The application remains single-user and has no authentication or trip-ownership boundary.
- `npm run lint`: passes with 6 existing `@next/next/no-img-element` warnings.
- `npx tsc --noEmit`: passes.
- The handoff reports that `npx next build --webpack` passes. Re-run it after source changes.
- The working tree contains a staged change to `.next/dev/trace`. Treat generated `.next` artifacts as a separate repository-maintenance concern and do not overwrite or discard them without explicit instruction.

## Initial findings

### Dead-code candidates

- `components/trip/CreateItemDialog.tsx` had no source import or runtime reference and was removed in Pass 1.
- `lib/utils.ts` is referenced by `components.json`; do not delete it solely because application code does not import it.
- `components/inspector/MarkdownEditor.tsx` is a deliberate dynamic-import boundary for `MarkdownEditorClient.tsx`, not dead code.

### Duplicated or stale paths

- `components/layout/AppShell.tsx` is oversized and owns fetching, optimistic updates, debounced saves, selection, deletion, schedule mutations, keyboard shortcuts, and view composition.
- Create and update API routes duplicate schedule parsing, JSON handling, validation, and compatibility behavior.
- Schedule and duration logic is repeated across `AppShell`, Calendar, Table, Inspector, Itinerary, and CSV import code.
- `dayOrder` normalization is spread across create, update, and reorder paths. The handoff identifies ordering as not fully verified.
- `DayJourneyView` and `MapView` independently configure the shared Leaflet implementation.
- `ImportGoogleMapsCsvButton.tsx` combines CSV parsing, date/time parsing, Maps resolution, persistence, progress state, and UI.
- `boardItems` and `scheduledBoardItems` in `AppShell` are currently aliases for the same collection; the distinction should become explicit at a view boundary.

### Documentation drift

- `README.md` still describes the earlier month-only POC and old timestamp-based schema.
- `FEATURES.md` still treats some implemented work as backlog or incomplete.
- `HANDOFF_REPORT.md` contains the most current schedule and risk notes and should be updated after meaningful passes.

## Refactor passes

Statuses use `Not started`, `In progress`, `Complete`, or `Blocked`. Do not mark a pass complete unless its validation has been run and recorded in the work log.

### Pass 0 — Contract and parity baseline

Status: **Complete — baseline captured; API and ordering fixtures added, manual parity remains**

Current behavior: Calendar, Kanban, Itinerary, Table, Map, attachments, CSV import, unscheduled items, flexible scheduling, and legacy schedule compatibility are all active behavior.

Structural improvement: Create a behavior matrix, API fixtures, and representative seed data before changing implementation structure.

Validation: Run lint, TypeScript, webpack build, and the parity checklist. Record existing warnings separately from new warnings.

### Pass 1 — Verified dead-code cleanup

Status: **Complete — `CreateItemDialog` removed; other candidates require separate reachability checks**

Current behavior: Unreferenced modules do not affect the runtime, but stale files make ownership and future changes less clear.

Structural improvement: Confirm and remove only verified dead application code. Handle tracked `.next` artifacts in a separate repository-maintenance change.

Validation: Search imports/references with `rg`, run TypeScript and the webpack build, and confirm no route or UI behavior changes.

Likely first target: `components/trip/CreateItemDialog.tsx`.

### Pass 2 — Pure schedule-domain helpers

Status: **Complete — canonical schedule shapes and shared transformations extracted and tested**

Current behavior: Date conversion, duration calculations, schedule-shape decisions, and legacy fallbacks are repeated across multiple components and routes.

Structural improvement: Extract pure helpers for unscheduled, all-day, flexible, fixed-time, multi-day, timezone, and duration behavior. Keep function inputs and outputs explicit.

Validation: Add or run tests for every schedule shape, timezone/DST boundaries, invalid ranges, and canonical-to-compatibility serialization.

### Pass 3 — Shared API parsing and serialization

Status: **Complete — shared request parsing and compatibility serialization pass HTTP contract parity**

Current behavior: Create and update routes use shared identity, content, and schedule parsing plus compatibility serialization. They retain separate persistence logic and route-specific validation order.

Structural improvement: Centralize request parsing and travel-object response serialization while preserving route paths, status codes, error behavior, and compatibility fields.

Validation: Contract tests or fixtures for GET, POST, PATCH, DELETE, invalid payloads, legacy payloads, null fields, and response shapes.

### Pass 4 — Schedule ordering service

Status: **Complete — transaction-oriented writes and required ordering parity validated**

Current behavior: API create, update, reorder, and delete use a shared transaction-oriented order writer. Calendar, Kanban, and Itinerary still choose drop targets and insertion positions in their respective views.

Structural improvement: Move reorder and affected-date normalization into one transaction-oriented service. Preserve existing explicit-order and timed-item ordering rules unless a behavior fix is separately approved.

Validation: Database-backed checks for insert, same-day reorder, cross-day reorder, flexible placement, clear-time drops, multi-day items, deletion, and synthetic legacy-schema migration upgrades. Current data is disposable placeholder data, so a real-data backup rehearsal is not required.

### Pass 5 — AppShell decomposition

Status: **Complete — data loading, save queue, selection, and pure schedule actions extracted; AppShell retains view coordination**

Current behavior: Focused hooks own trip/item loading, selection, and optimistic save queues. `AppShell` coordinates view actions, trip-scoped async mutations, keyboard shortcuts, and rendering.

Structural improvement: Extract focused hooks/services such as trip data loading, travel-object mutation queues, selection state, and pure schedule actions. Preserve existing component-level APIs.

Validation: Manual parity checks for trip switching, selection and multi-selection, inspector opening, debounced edits, delete confirmation, keyboard shortcuts, and save failures.

Completion audit (2026-09-25): Prior disposable-browser checks covered trip switching, selection, inspector, debounced title persistence, bulk delete confirmation, Escape, and failed-save feedback. A fresh disposable browser verified Q and workspace number shortcuts after the extraction. Pure schedule actions, sorting, and shared selection targeting are separated; remaining AppShell handlers depend directly on its trip-scoped state and are intentional coordination. The narrow Calendar header check also exercised the Week-to-Day transition.

### Pass 6 — Canonical view data boundaries

Status: **Complete — canonical client and public API boundaries validated**

Current behavior: Active UI surfaces and the travel-object API use canonical schedule fields. The API rejects removed timestamp/day-index request keys and omits them from responses.

Structural improvement: Migrate consumers to canonical schedule fields, pass explicitly named collections to each view, and remove the transitional API adapter in an approved contract change.

Validation: Month/week/day Calendar behavior, unscheduled drawer behavior, Table editing, Kanban moves, Itinerary filtering and ordering, and Inspector edits must remain unchanged.

Exit validation: repository-wide search confirms that no active UI or API client consumes compatibility properties. `npm run check`, an isolated webpack build, and database-backed API and ordering fixtures pass with canonical responses and explicit rejection of removed request keys. Historical migrations and CSV input headers retain their original names.

### Pass 7 — Shared view primitives

Status: **Complete — shared display/domain primitives and responsive view parity validated**

Current behavior: Calendar contains several mode-specific behaviors; Day and global Map surfaces independently configure Leaflet; item display logic is repeated.

Structural improvement: Extract shared item cards, schedule labels, type-color helpers, map configuration, and focused mode components without merging distinct user experiences.

Validation: Visual/manual checks across all Calendar modes, global Map filters, marker selection, responsive layouts, and inspector synchronization.

Latest visual check (2026-09-25): A disposable trip with a three-day all-day event, overlapping fixed events, and a flexible item rendered in Month, Week, Day, and global Map at desktop and 390px widths. Week and Day showed all-day cards at the top; Map showed two markers, day filter, and attribution. At 390px, Month cells are small, Week scrolls horizontally, and the sidebar needs collapsing for useful content width. The Calendar header now wraps its controls; after scrolling Week to Friday, switching to Day kept the card aligned and showed Friday's itinerary. Day date navigation scrolls only its itinerary container. The desktop Day header retained a single row. Existing browser checks cover Map filters, marker selection, and inspector synchronization. Day, Itinerary, Kanban, and Calendar cards retain distinct layout and drag behavior, so a single shared card would add conditional complexity; they now share the relevant labels, colors, spans, and map predicates. `npm run check` passed 51 tests, and an isolated webpack production build passed after the header change.

### Pass 8 — CSV/import decomposition

Status: **Complete — parsing and import orchestration extracted; multi-row browser and failure-path contracts checked**

Current behavior: The button owns file selection and user feedback. Library modules parse schedules, resolve Maps URLs, and persist imported objects.

Structural improvement: Move pure CSV and schedule parsing into testable library modules. Keep the component responsible for file selection, progress, and user feedback.

Validation: Fixtures for quoted CSV fields, malformed dates/times, categories, custom types, unresolved Maps links, empty rows, and imported object parity.

The existing partial-create failure behavior is recorded as a separate product decision; it does not block the structural extraction.

### Pass 9 — Type and documentation alignment

Status: **Complete — explicit item request types and current-document pointers validated**

Current behavior: The API client accepts explicit create/update input types. `README.md` and `HANDOFF_REPORT.md` point to current architecture and the tracker while retaining historical detail; `FEATURES.md` marks implemented ideas.

Structural improvement: Introduce explicit create/update input types, update `README.md`, `FEATURES.md`, and `HANDOFF_REPORT.md`, and document the compatibility policy.

Validation: TypeScript rejects invalid request shapes; docs match the current implementation; lint/build remain stable.

## Required parity matrix

Before declaring the refactor complete, verify these behaviors:

- Create an unscheduled item, move it onto a date, remove its date, and confirm it returns to the unscheduled area.
- Create and edit all-day, fixed-time, flexible, and multi-day items.
- Move and resize fixed-time items across dates and timezone boundaries.
- Reorder flexible and timed items within a day and across days.
- Preserve selection, multi-selection, inspector state, and keyboard shortcuts.
- Verify Kanban type changes, custom type creation/removal, colors, and ordering.
- Verify Table filtering, sorting, inline edits, selection, and currency totals.
- Verify Map filtering, marker selection, coordinate-less links, and attribution.
- Upload, list, download/preview, and delete attachments.
- Import CSV rows with categories, schedules, malformed dates, quoted fields, and unresolved Maps URLs.

## Separate migration tasks

Do not combine these with ordinary refactoring:

- Removing legacy API request/response fields or changing public route contracts: completed as the approved 2026-09-25 API migration; see [ADR 0002](docs/decisions/0002-canonical-schedule-api.md) and [release note](docs/work/api-schedule-release-note.md).
- Rewriting or squashing Prisma migration history.
- Changing schedule columns, constraints, or attachment storage.
- Moving attachments from PostgreSQL bytes to object storage.
- Adding authentication or trip ownership.
- Upgrading Next.js, React, Prisma, Tailwind, or other dependencies.
- Introducing a test framework as a broad tooling change.
- Replacing the current Leaflet/OpenStreetMap or Google Maps integration.

## Work log

### 2026-09-25 — CSV partial imports and narrow Month layout

- Intent/current behavior: Concurrent CSV creates can partially succeed, but a rejected create hides all successful rows until reload. At narrow widths, seven Month columns shrink beyond readable item titles.
- Change: Return successful and failed create outcomes together, show successful items immediately, report failed row names and reasons, and add event types only for successful rows. Give the Month grid a 700px minimum width with a shared horizontal scroll area for weekday headings and dates. At narrow widths, show an icon rail that can open as an overlay so the Calendar keeps usable width.
- Files changed: `lib/google-maps-import.ts`, `components/trip/ImportGoogleMapsCsvButton.tsx`, `components/views/CalendarView.tsx`, `components/layout/AppShell.tsx`, `tests/google-maps-import.test.mjs`, this tracker, `README.md`, and `docs/work/csv-calendar-followups.md`.
- Validation: `npm run check` passed 51 tests with six existing image warnings; an isolated webpack production build and `git diff --check` passed. A disposable 390px browser check showed aligned weekday/date columns before and after horizontal scrolling, a readable Month header, and a compact expandable sidebar. A three-row CSV with a test-only failure on the middle create displayed two confirmed places immediately and named the failed row; the two places persisted after reload. The API and ordering HTTP fixtures passed against the isolated database.
- Remaining work: None within these two follow-ups.

### 2026-09-25 — Post-migration PATCH validation audit

- Intent/current behavior: PATCH requires a non-empty event type when `type` is supplied; POST defaults an omitted or null type to `unclassified`.
- Fix: Restrict the default to creation so PATCH `{ "type": null }` retains its prior 400 response instead of changing the item.
- Files changed: `lib/api-validation.ts`, identity and API contract fixtures, and this tracker.
- Validation: `npm run check` passed 51 tests with six existing image warnings; `git diff --check` passed. The API contract fixture was extended but not rerun against a database in this audit.
- Remaining work: No further refactor pass is identified.

### 2026-09-25 — Approved canonical schedule API migration

- Pass: `Pass 6 — Canonical view data boundaries` and a separately approved public API contract change.
- Intent/current behavior: Active UI and import paths already use canonical schedule fields, while the API still accepts and emits deprecated timestamp/day-index keys.
- Structural improvement: Remove the legacy request parser and response adapter; serialize date-only canonical fields, reject removed request keys, and remove them from shared client types. Keep CSV input conversion and historical migrations intact.
- Files changed: travel-object API routes, `lib/api-schedule.ts`, `lib/api-validation.ts`, `lib/schedule-domain.ts`, `lib/travel-object-serialization.ts`, `types/travel.ts`, API/domain fixtures, agent/architecture/decision/release documentation, and this tracker.
- Behavior preserved: Canonical GET/POST/PATCH/reorder, day ordering, all-day spans, CSV conversion, attachments, and trip-timezone calculations. The approved breaking change removes `startDateTime`, `endDateTime`, and `dayIndex` from public requests and responses.
- Validation: `npm run check` passed 51 tests with six existing image warnings; isolated webpack production build passed; all ten migrations applied to a fresh disposable PostgreSQL database; API and ordering HTTP fixtures passed, including rejection and response-shape checks; `git diff --check` passed.
- Risks or follow-up: External clients using removed keys must update; no schema migration was needed. Historical tracker entries below describe the earlier compatibility period.

### 2026-09-25 — Narrow Calendar navigation and Pass 5 completion audit

- Pass: `Pass 5 — AppShell decomposition` and `Pass 7 — Shared view primitives` responsive parity.
- Intent/current behavior: A horizontally scrolled Week could leave the Day card offscreen at 390px because the Calendar header kept mode controls in an overflowing row. Day date navigation also used `scrollIntoView`, which may scroll ancestors horizontally.
- Structural improvement: Wrap header controls within the available width and scroll Day dates through the itinerary container only. Keep trip-scoped view actions in AppShell while its focused hooks and pure schedule helpers own reusable behavior.
- Files changed: `components/views/CalendarView.tsx`, `components/views/DayJourneyView.tsx`, this tracker, and `docs/work/schedule-refactor.md`.
- Behavior preserved: Week horizontal scrolling, focused-date transfer to Day, desktop header layout, all-day position, and keyboard view shortcuts.
- Validation: Disposable PostgreSQL with all ten migrations and a disposable webpack development app; at 390px, selected Friday from a horizontally scrolled Week and switched to Day with Friday visible and the card aligned. At 1280px, the Day header remained one row. Browser Q and workspace number shortcuts switched views. `npm run check` passed 51 tests, and an isolated webpack production build passed after the header change.
- Risks or follow-up: Narrow Month remains dense and Week requires horizontal scrolling by design. Keep legacy API removal separate.

### 2026-09-25 — Pass 2 schedule-domain audit

- Pass: `Pass 2 — Pure schedule-domain helpers`.
- Intent/current behavior: Active schedule consumers use canonical fields. Schedule classification, placement, item and group moves, resizing, date spans, Table length/start edits, labels, and compatibility serialization have pure helpers; Inspector input handling and Calendar drop targeting remain view-specific.
- Structural improvement: Close the domain extraction at the shared behavior boundary instead of moving view-specific interaction code into the domain module.
- Files changed: `REFACTORING_TRACKER.md` and `docs/work/schedule-refactor.md` only for this audit.
- Validation: `npm run check` passed 51 tests covering unscheduled, flexible, fixed-time, all-day, multi-day, invalid ranges, timezone/DST edges, duration, and canonical-to-compatibility serialization. The isolated webpack build and the prior disposable-database API fixture passed.
- Status: Complete. View interaction refinement remains in Pass 5/7; legacy API field removal remains separate.

### 2026-09-25 — Shared visible schedule label

- Pass: `Pass 7 — Shared view primitives`.
- Intent/current behavior: Day cards, Itinerary drag previews, and Map popups independently label all-day and confirmed-time items. Flexible fallbacks differ by view.
- Structural improvement: Share the all-day/fixed-time label calculation while letting each view supply its existing flexible fallback and styling.
- Validation planned: Focused label test, `npm run check`, isolated webpack build, and `git diff --check`.
- Files changed: `lib/schedule-domain.ts`, `components/views/DayJourneyView.tsx`, `components/views/TripDaysView.tsx`, `components/views/LeafletMap.tsx`, and `tests/schedule-domain.test.mjs`.
- Result: Day card badges, Itinerary previews, and Map popups share the same all-day/fixed-time text. Flexible items still omit the badge and popup time; the Itinerary preview still says `Unscheduled time`.
- Validation: `npm run check` passed 51 tests with six existing image warnings; isolated webpack build and `git diff --check` passed.
- Status: Complete for this extraction; other Pass 7 view primitives remain.

### 2026-09-25 — Remove unreachable additive-selection branch

- Pass: `Pass 5 — AppShell decomposition` cleanup.
- Intent/current behavior: Additive selection toggles membership and primary selection but does not open the inspector. The hook contains an `inspect && !additive` condition inside the additive-only branch, so that statement is unreachable.
- Structural improvement: Remove the dead conditional while retaining additive selection and inspector behavior.
- Validation planned: `npm run check` and `git diff --check`.
- Files changed: `components/layout/useItemSelection.ts`, `REFACTORING_TRACKER.md`, and `docs/work/schedule-refactor.md`.
- Result: Additive selection still toggles selected IDs and primary ID without opening the inspector; the unreachable inspector write is gone.
- Validation: `npm run check` passed 50 tests with six existing image warnings; `git diff --check` passed.
- Status: Complete for this cleanup; Pass 5 still needs its remaining action and keyboard parity audit.

### 2026-09-25 — Shared selected-item action targets

- Pass: `Pass 5 — AppShell decomposition`.
- Intent/current behavior: Grouped moves, day moves, unscheduling, and type changes each act on the current selection when the dragged item is selected, or on that item alone otherwise.
- Structural improvement: Compute that target list once in AppShell and reuse it in the four action paths.
- Validation planned: `npm run check`, isolated webpack build, and `git diff --check`.
- Files changed: `components/layout/AppShell.tsx`, `REFACTORING_TRACKER.md`, and `docs/work/schedule-refactor.md`.
- Result: Four action handlers reuse one selected-or-single target calculation. API calls, mutation order, and view callbacks are unchanged.
- Validation: `npm run check` passed 50 tests with six existing image warnings; isolated webpack build and `git diff --check` passed.
- Status: Complete for this extraction; Pass 5 remains open for remaining action ownership and manual parity review.

### 2026-09-25 — Pass 4 ordering-service audit

- Pass: `Pass 4 — Schedule ordering service`.
- Intent/current behavior: Create, PATCH, reorder, and delete normalize affected start dates through `writeDateOrder`; the reorder route delegates its transaction to `reorderTravelObject`. View-specific drop targets remain in their respective views.
- Structural improvement: Close the extraction pass after confirming that the shared service owns every persisted order mutation and its required parity cases are covered.
- Files changed: `REFACTORING_TRACKER.md` and `docs/work/schedule-refactor.md` only for this audit.
- Validation: The database-backed order fixture passed again with the final Pass 3 build. It covers initial insert, same-day forward/backward insertion, cross-day fixed moves, flexible placement, clear-time drops, multi-day all-day moves and rejections, gap compaction after deletion, and preservation of explicit gaps. The synthetic legacy-schema migration fixture and browser checks across Week, Day, Kanban, and Itinerary are recorded in this tracker and handoff. `npm run check` passed 50 tests, and the isolated webpack build passed.
- Status: Complete. Remaining UI refinements are view-specific work; the public compatibility-field removal remains a separate API migration.

### 2026-09-25 — Shared title and type request parsing

- Pass: `Pass 3 — Shared API parsing and serialization`.
- Intent/current behavior: POST requires a title and defaults missing type to `unclassified`; PATCH parses either field only when supplied. The two routes run these checks at different points relative to schedule parsing.
- Structural improvement: Share the title/type parser while calling it at each route's existing point.
- Validation planned: Focused parser tests, `npm run check`, isolated webpack build, and `git diff --check`.
- Files changed: `lib/api-validation.ts`, both travel-object route handlers, and `tests/api-validation.test.mjs`.
- Result: POST retains required title and default `unclassified` type; PATCH still omits untouched identity fields. Each route invokes the parser at its original point relative to schedule validation.
- Validation: `npm run check` passed 50 tests with six existing image warnings; isolated webpack build, database-backed API and ordering HTTP fixtures, and `git diff --check` passed.
- Status: Complete. Pass 3's shared parsing and serialization objectives are satisfied; legacy API field removal remains a separate contract migration.

### 2026-09-25 — Shared travel-object content parsing

- Pass: `Pass 3 — Shared API parsing and serialization`.
- Intent/current behavior: POST and PATCH separately parse header image, location, cost, notes, and tags. POST supplies creation defaults; PATCH omits untouched fields. POST validates cost and location before looking up the trip, while PATCH checks header image before those fields.
- Structural improvement: Share the content-field parser with an explicit create/update mode, retaining the route-specific validation sequence and response contract.
- Validation planned: Focused parser tests, `npm run check`, isolated webpack build, disposable-database HTTP contract fixtures, and `git diff --check`.
- Files changed: `lib/api-validation.ts`, both travel-object route handlers, `tests/api-validation.test.mjs`, and `tests/api-contract.integration.mjs`.
- Result: POST still supplies content defaults and checks cost/location before trip lookup; PATCH still omits untouched fields. Null JSON, header URLs, notes, and tags retain their existing validation and error precedence.
- Validation: Focused parser tests, `npm run check` (49 tests; six existing image warnings), isolated webpack build, and database-backed API and ordering HTTP fixtures passed. `git diff --check` passed. The first HTTP attempt hit an unrelated PostgreSQL listener on the IPv4 port; the isolated app's IPv6 listener passed both fixtures.
- Status: Complete for this extraction; broader Pass 3 request and response boundaries remain.
- Next recommended pass: Review remaining route parsing and serialization, then assess Pass 4 ordering and Pass 5 AppShell parity. Keep compatibility-field removal as a separate API migration.

### 2026-09-25 — Pure item-move schedule patch

- Pass: `Pass 2 — Pure schedule-domain helpers` and `Pass 5 — AppShell decomposition`.
- Intent/current behavior: AppShell classifies all-day, flexible/undated, and fixed items before applying immediate move patches. All-day moves preserve the span, flexible placement retains its visual time, and fixed moves preserve duration.
- Structural improvement: Build the canonical move patch in `lib/schedule-domain.ts`; AppShell only queues the result.
- Validation planned: Focused schedule-shape tests, `npm run check`, and `git diff --check`.
- Files changed: `lib/schedule-domain.ts`, `components/layout/AppShell.tsx`, and `tests/schedule-domain.test.mjs`.
- Result: AppShell now queues the pure patch. All-day spans, flexible placement, and fixed-time duration retain their existing fields and defaults.
- Validation: `npm run check` passed 47 tests with six existing image warnings; a fresh isolated webpack production build and `git diff --check` passed. The database-backed HTTP fixtures preceded this extraction and were not rerun for it.
- Status: Complete for this extraction; broader Pass 2 and Pass 5 work remains.

### 2026-09-25 — One AppShell item-creation path

- Pass: `Pass 5 — AppShell decomposition`.
- Intent/current behavior: Undated, flexible, and fixed-time creation each build the same base request and repeat selection, list insertion, error handling, and active-trip guards. Flexible creation alone may reorder into a requested day gap.
- Structural improvement: Compute the schedule-specific fields once, then use a single create, optional reorder, insertion, and selection path.
- Validation planned: `npm run check`, isolated webpack build, and `git diff --check`; retain an HTTP/browser follow-up if a local server is available.
- Files changed: `components/layout/AppShell.tsx`.
- Result: Undated, flexible, and fixed creation retain their distinct schedule defaults; flexible gap insertion still reorders before selection. Creation, trip-switch guards, insertion, selection, and error handling now share one path.
- Validation: `npm run check` passed 46 tests with six existing image warnings. An isolated webpack production build, the database-backed API and ordering HTTP fixtures, and `git diff --check` passed.
- Status: Complete for this extraction; broader Pass 5 view actions remain.
- Next recommended pass: Review remaining AppShell mutation paths and Pass 3 field parsing. Keep the public compatibility-field removal as a separately approved API contract change.

### 2026-09-25 — Shared canonical date span

- Pass: `Pass 2 — Pure schedule-domain helpers` and `Pass 7 — Shared view primitives`.
- Intent/current behavior: Calendar and Day each slice canonical date fields to form an inclusive visible date span. A missing end date means a one-day span; an undated item has no span.
- Structural improvement: Share the pure date-span projection while leaving each view's existing item inclusion rules intact.
- Validation planned: Focused span fixture, `npm run check`, and `git diff --check`.
- Files changed: `lib/schedule-domain.ts`, `components/views/CalendarView.tsx`, `components/views/DayJourneyView.tsx`, and `tests/schedule-domain.test.mjs`.
- Result: Both views use the same canonical inclusive span projection. Calendar's span placement and Day's inclusion rule remain separate.
- Validation: `npm run check` passed 46 tests with six existing image warnings; the isolated webpack build, database-backed API and ordering HTTP fixtures, and `git diff --check` passed.
- Status: Complete for this extraction; broader Pass 2 and Pass 7 work remains.

### 2026-09-25 — Shared optional JSON field parsing

- Pass: `Pass 3 — Shared API parsing and serialization`.
- Intent/current behavior: Travel-object POST and PATCH each convert nullable JSON fields to Prisma JSON null and reject non-object values. Their errors differ slightly for omitted versus explicit null values.
- Structural improvement: Move the common conversion into API validation with an explicit create/update option, retaining both routes' current responses.
- Validation planned: API validation checks, `npm run check`, `git diff --check`, and the isolated HTTP contract fixture if a disposable database is available.
- Files changed: `lib/api-validation.ts`, `app/api/travel-objects/route.ts`, and `app/api/travel-objects/[objectId]/route.ts`.
- Result: POST still allows omitted location/cost and retains its non-object error; PATCH still accepts explicit null and retains its non-object error. Both use the same Prisma JSON-null conversion.
- Validation: `npm run check` passed 46 tests with six existing image warnings; the isolated webpack build, database-backed API and ordering HTTP fixtures, and `git diff --check` passed.
- Status: Complete for this extraction; broader Pass 3 route parity remains.

### 2026-09-25 — Day drop constraints and Week overlap presentation

- Pass: `Pass 4 — Schedule ordering service` and `Pass 7 — Shared view primitives` behavior fixes.
- Intent/current behavior: Day currently accepts timed items dragged ahead of earlier timed items and flexible items dropped between overlapping timed items. Week timed overlaps share the same left edge and arbitrary paint order; flexible groups require a click to open.
- Files changed: `lib/schedule-order.ts`, `components/views/CalendarView.tsx`, `tests/schedule-order.test.mjs`, `REFACTORING_TRACKER.md`, and `docs/work/schedule-refactor.md`.
- Structural improvement: Validate Day drops before calling the reorder route, layer overlapping Week cards with visible color bars, and expand Week flexible groups on hover.
- Behavior preserved: Valid Day gap moves still use the reorder route; overlapping fixed-time events remain visible and draggable in Week; the flexible group remains clickable and keyboard focusable.
- Validation run: Focused pure tests, disposable browser interaction and visual checks, `npm run check` (45 passing tests), `git diff --check`, Linux AMD64 Docker app production build, and Docker Hub manifest inspection for app and migrator.
- Results: Day rejected a 10:30 item before a 09:00 item and rejected a flexible item between 09:00–12:00 and 10:00–11:00; API readback retained the original order. A flexible item moved successfully before the timed group. Week showed three distinct left color bars for overlapping cards, and its flexible group opened on hover and closed on pointer leave. The disposable app and database were removed.
- Delivery: Pushed `hokusaik/travel-planner-app:latest` at `sha256:507c412ad9af3f6dc1b1f4dfcbc03db5eddcaafa6f1afac2b881828ca47ba473` and `hokusaik/travel-planner-migrator:latest` at `sha256:0d9368b8907a2a3b8013f26464feb3e4fc38dacf78f2468ebb76d4bde7de18ad`. Both published manifests contain `linux/amd64`; no migration files changed.
- Next recommended pass: Continue the broader refactor parity work.

### 2026-09-25 — Keep late action errors with their source trip

- Pass: `Pass 5 — AppShell decomposition` validation.
- Intent/current behavior: Creating, reordering, or saving an item and importing a CSV may finish after the user selects another trip. Their status messages should describe only the trip where the action began.
- Files changed: `components/layout/AppShell.tsx`, `components/layout/useItemSaveQueue.ts`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Guard create, reorder, and queued-save failure messages and CSV import feedback with the active source-trip ID, matching the existing result guards.
- Behavior preserved: Server writes still target the original trip and successful results still update its view only while it remains active.
- Validation run: `npm run check` (43 passing tests) and `git diff --check`.
- Risks or follow-up: Late create, reorder, queued-save, and CSV import error feedback is guarded in code but has not been exercised with delayed failures in the browser.
- Next recommended pass: Continue focused Pass 3–5 parity, including a delayed failure-path check if the interaction changes again.

### 2026-09-25 — Guard trip deletion across trip switches

- Pass: `Pass 5 — AppShell decomposition` validation.
- Intent/current behavior: Deleting Trip Alpha should remove Alpha from the trip list. If the user switches to Beta before the DELETE reply, Beta should remain active with its items and selection intact.
- Structural improvement: Apply the delete result by the deleted trip's ID, and reset active-trip state only if that trip is still active when the response arrives.
- Files changed: `components/layout/AppShell.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: Deleting the active trip still selects the next available trip; a late deletion response removes only its source trip from the list and does not clear another active trip's state or display a stale error.
- Validation run: Delayed trip DELETE against a disposable browser and PostgreSQL fixture; `npm run check` (43 passing tests), isolated webpack production build, and `git diff --check`.
- Results: A test-only 20-second client callback delay allowed switching from deleted Gamma to Beta before result handling. Beta and its item remained visible after the callback; API readback contained only Beta and its item. The temporary browser, app, and database were removed.
- Next recommended pass: Continue the focused AppShell mutation audit.

### 2026-09-25 — Guard late type and delete results across trip switches

- Pass: `Pass 5 — AppShell decomposition` validation.
- Intent/current behavior: Type changes and deletions persist on the source trip; a response that arrives after switching trips should not alter the destination trip's items, selection, confirmation state, or error message.
- Files changed: `components/layout/AppShell.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Capture the source trip and guard local result handling after asynchronous calls.
- Behavior preserved: Server writes still target the source item; the current trip's items, selection, and error feedback are handled only when that trip remains active. Switching trips also clears a pending bulk-delete confirmation.
- Validation run: Delayed-response browser checks for single-item deletion, Kanban type change, and bulk deletion against disposable PostgreSQL; `npm run check`, isolated webpack build, and `git diff --check`.
- Results: A late Alpha single-item DELETE and Kanban type PATCH persisted on Alpha while Beta kept its own item. The fixed bulk-delete check removed both same-day Alpha siblings; after switching during delayed responses, Beta retained its item and had no stale selection or error. The isolated production build passed.
- Risks or follow-up: A bulk-delete confirmation blocks ordinary trip switching while open; the tested path dismissed it with Escape after starting deletion, then switched trips. Remaining AppShell mutations can be audited separately.
- Next recommended pass: Continue focused AppShell mutation-race and view parity checks.

### 2026-09-25 — Serialize bulk deletion within one trip

- Pass: `Pass 4 — Schedule ordering service` and `Pass 5 — AppShell decomposition` behavior fix.
- Intent/current behavior: Bulk deletion sends concurrent DELETE requests. Each DELETE compacts `dayOrder`; simultaneous requests for siblings on one date can race and one can fail with Prisma P2025.
- Files changed: `components/layout/AppShell.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Delete selected items in sequence while retaining per-item success/failure feedback and the active-trip result guard.
- Behavior preserved: Successful items are removed, failed items remain selected with the existing error feedback, and deletion remains scoped to the source trip.
- Validation run: Reproduced concurrent failure against disposable PostgreSQL, then retested sequential deletion in the browser with delayed responses; `npm run check`, isolated webpack build, and `git diff --check`.
- Results: The original concurrent action deleted one sibling and failed to normalize the other with Prisma P2025. Sequential deletion removed both siblings; API readback showed Alpha empty and Beta unchanged. The confirmation was dismissed after starting the action to allow a trip switch before the delayed responses.
- Risks or follow-up: Bulk deletion now takes one request per item in sequence, so large selections finish more slowly. The route still normalizes each delete independently.
- Next recommended pass: Review other same-date concurrent mutations and the remaining Pass 5 actions.

### 2026-09-25 — Disposable-data migration scope

- Pass: `Pass 4 — Schedule ordering service` and `Pass 6 — Canonical view data boundaries` planning.
- Decision: The user confirmed that the current database contains only disposable placeholder data. A sanitized real-data backup rehearsal is not required for this refactor; existing synthetic migration fixtures remain the upgrade check.
- Files changed: `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: No schema, migration, or runtime change.
- Validation run: User clarification recorded; `git diff --check`.
- Risks or follow-up: If real user data is added before migration or deployment, reassess the rehearsal need. Public API compatibility removal remains a separate approval decision.
- Next recommended pass: Continue mutation-race guards, then remaining contract and view parity.

Each agent must append an entry. Use the following format:

```md
### YYYY-MM-DD — Agent/task name

- Pass: `Pass N — name`
- Intent/current behavior:
- Files changed:
- Structural improvement:
- Behavior preserved:
- Validation run:
- Results:
- Risks or follow-up:
- Next recommended pass:
```

### 2026-09-25 — Itinerary all-day drag anchor

- Pass: `Pass 4 — Schedule ordering service` and `Pass 6 — Canonical view data boundaries`.
- Intent/current behavior: Itinerary renders a multi-day all-day item on each covered date, but its drag handler treats a continuation card's date as the new start date on drop.
- Structural improvement: Reuse the existing all-day drop-date calculation in the Itinerary drag boundary, carrying the grabbed card's date in drag data.
- Files changed: `components/views/TripDaysView.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: The grabbed date lands on the target date while the all-day item's inclusive span stays intact; dropping a continuation card back on its own date does nothing. Other Itinerary ordering paths are unchanged.
- Validation run: `npm run check` and `git diff --check`.
- Results: Lint and TypeScript passed with six existing image warnings; 35 tests passed, including continuation-card forward, backward, and same-date anchors. Diff check passed.
- Risks or follow-up: Itinerary drag behavior still needs visual browser parity; remaining ordering consumers and wider API contracts remain open.
- Next recommended pass: Continue browser drag parity and ordering-contract coverage before the separate compatibility migration.

### 2026-09-25 — Kanban browser parity and timed-create reachability

- Pass: `Pass 4 — Schedule ordering service` and `Pass 5 — AppShell decomposition` validation.
- Intent/current behavior: Kanban's corrected same-day target index and AppShell's created-item merge need runtime confirmation.
- Structural improvement: Validate the existing ordering boundaries before further extraction; check whether a timed create is reachable from the current UI.
- Files changed: `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: No runtime code changed in this validation slice.
- Validation run: Disposable database/browser forward drag and reload; source-level create caller audit.
- Results: Dragging A onto C in Kanban produced B–A–C, and that order survived reload. No active UI caller supplies both a date and a time to `openCreateItem`; current Add item paths create unscheduled or flexible items. The timed-create branch and its immediate merge remain unit-checked but not browser-reachable.
- Risks or follow-up: Other Kanban type moves and Calendar drag modes remain separate parity checks.
- Next recommended pass: Continue Pass 3 API contract coverage and remaining view parity.

### 2026-09-25 — Week time-slot forward insertion

- Pass: `Pass 4 — Schedule ordering service` and `Pass 6 — Canonical view data boundaries`.
- Intent/current behavior: Week computes a flexible item's time-slot insertion index after removing the moving item, but the reorder route expects the original day-list index and adjusts same-day forward moves itself.
- Files changed: `lib/schedule-order.ts`, `components/views/CalendarView.tsx`, `tests/schedule-order.test.mjs`, `tests/order-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Move the Week target-index calculation into the shared ordering module and use the original ordered list.
- Behavior preserved: The time slot still sets `placementTime`; same-day forward movement now inserts at the intended position. The API contract and schema are unchanged.
- Validation run: Pure forward/cross-day insertion tests, database-backed reorder fixture against temporary PostgreSQL, browser Week drag and reload, `npm run check`, and `git diff --check`.
- Results: Lint and TypeScript passed; 39 unit tests passed; ordering fixture passed. Browser drag of Flexible A from before 10:00 to 12:00 persisted Anchor B, Anchor C, Flexible A after reload. Six existing image warnings remain.
- Risks or follow-up: Week flexible cluster and exact-gap targets calculate indices from a list excluding all-day items; check those against the route's full day order next.
- Next recommended pass: Align Week cluster and gap target indices with persisted order, including all-day items.

### 2026-09-25 — Week flexible target indices with all-day items

- Pass: `Pass 4 — Schedule ordering service` and `Pass 6 — Canonical view data boundaries`.
- Intent/current behavior: Week cluster and exact-gap droppables derive their target indices from non-all-day items, while the reorder route indexes the full start-date list.
- Files changed: `components/views/CalendarView.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Derive drop target indices from the complete original day order without changing the visual grouping of all-day items.
- Behavior preserved: All-day items remain at the top of Week, and flexible clusters still follow their timed anchors. Cluster and gap drops now address the route's full day order.
- Validation run: Browser cluster and exact-gap drags against disposable PostgreSQL; persisted-order reads; `npm run check`; `git diff --check`.
- Results: With persisted All-day O, Flexible A, Fixed B, Flexible C, dropping C onto A's cluster produced O, C, A, B. Dragging A into the first exact gap restored O, A, C, B. Both drops used indices including O. Lint and TypeScript passed; 39 unit tests passed with six existing image warnings.
- Risks or follow-up: Broader Week drag combinations and exact-gap keyboard interaction remain untested. No public API or schema change.
- Next recommended pass: Continue API parity and remaining view interactions, keeping legacy API removal separate.

### 2026-09-25 — Malformed JSON and attachment API parity

- Pass: `Pass 3 — Shared API parsing and serialization`.
- Intent/current behavior: Travel-object create and update routes share `readJsonBody`; malformed JSON and non-object JSON should retain the same HTTP 400 error contract. Attachments support multipart upload, listing, inline preview, download, and delete.
- Files changed: `tests/api-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Extend the database-backed API fixture to cover malformed and non-object bodies plus attachment upload, listing, retrieval, and deletion without changing route behavior.
- Behavior preserved: No route, validation, response, or attachment storage changes; tests assert the existing status codes, response metadata, content headers, and bytes.
- Validation run: API contract fixture against disposable PostgreSQL with all migrations, `npm run check`, and `git diff --check`.
- Results: Malformed and array JSON bodies returned the existing HTTP 400 error. A TXT attachment uploaded, appeared in the list, returned matching preview/download content and headers, deleted with HTTP 204, and returned 404 afterward; unsupported extensions returned HTTP 400. API fixture passed; lint and TypeScript passed; 39 unit tests passed; diff check passed. Six existing image warnings remain.
- Risks or follow-up: Attachment size-boundary and unusual Unicode filename cases remain untested. The app continues to store bytes in PostgreSQL.
- Next recommended pass: Continue targeted API field and view interaction parity before the separate compatibility migration.

### 2026-09-25 — Shared mappable-coordinate rule

- Pass: `Pass 7 — Shared view primitives`.
- Intent/current behavior: Day counts every finite latitude/longitude pair as mappable, while the Leaflet map and Map workspace reject coordinates outside valid geographic ranges. This can show a mapped-item count without a marker.
- Files changed: `lib/map-coordinates.ts`, `components/views/DayJourneyView.tsx`, `components/views/MapView.tsx`, `components/views/LeafletMap.tsx`, `tests/map-coordinates.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Use one pure coordinate predicate in Day, Map, and the Leaflet renderer so their filtering agrees.
- Behavior preserved: Valid coordinates still produce markers; saved location URLs without coordinates remain available on items. Day's mapped count now excludes out-of-range coordinates, matching the map.
- Validation run: Coordinate boundary test, `npm run check`, `git diff --check`, and source-consumer audit.
- Results: The focused boundary test and all 40 project tests passed; lint and TypeScript passed with six existing image warnings; diff check passed. Day, Map, and Leaflet now import the same predicate.
- Risks or follow-up: This narrow change has not had a visual browser check. Other shared view primitives and map interactions remain open.
- Next recommended pass: Continue targeted Map and view interaction parity before wider component extraction.

### 2026-09-25 — Map view and Day map browser parity

- Pass: `Pass 7 — Shared view primitives` validation.
- Intent/current behavior: Map and Day now share coordinate filtering; Map day chips should filter valid markers, and Day should count only markers that can render while retaining location links without coordinates.
- Files changed: `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Validate the shared boundary in the running UI before further map component extraction.
- Behavior preserved: Saved location links remain available for items without map coordinates; selecting a valid marker opens its item inspector.
- Validation run: Disposable migrated PostgreSQL trip with two valid coordinates on separate days, one URL-only location, and one out-of-range coordinate; browser Map filter, marker selection, and Day count checks; `git diff --check`.
- Results: Map showed two of four items with coordinates. Its day chips showed one marker each, and selecting the second marker opened the matching popup and inspector. Day showed one of three places with map coordinates on the first day and one of one on the second. The URL-only item retained its Google Maps link. The temporary browser, app, and database were closed afterward.
- Risks or follow-up: Map visual styling and interaction on touch devices remain untested; this pass changed documentation only.
- Next recommended pass: Continue targeted Pass 7 and Pass 8 parity, keeping public API compatibility removal separate.

### 2026-09-25 — CSV invalid-row parity

- Pass: `Pass 8 — CSV/import decomposition` validation.
- Intent/current behavior: Invalid dates and times should leave imported places unscheduled, and blank or incomplete rows should be skipped while valid rows retain their categories.
- Files changed: `tests/google-maps-csv.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Extend the pure parser fixture for these outcomes without changing import behavior.
- Behavior preserved: Rows with a valid title and URL remain importable even when their schedules are invalid; invalid schedules are flagged and left undated. Incomplete rows are skipped.
- Validation run: Focused CSV parser tests, `npm run check`, and `git diff --check`.
- Results: The new fixture covered an impossible date, invalid hour, missing title, missing URL, an empty line, and a valid categorized row. All 41 project tests, lint, and TypeScript passed; lint retained six existing image warnings.
- Risks or follow-up: Multi-row live import and partial create failures remain browser parity cases. Whitespace-only rows still count as skipped input; this fixture uses a truly empty row.
- Next recommended pass: Continue Pass 8 live import parity or a focused remaining view interaction check.

### 2026-09-25 — CSV partial-create failure contract

- Pass: `Pass 8 — CSV/import decomposition` validation.
- Intent/current behavior: Multi-row creation starts after URL resolution; a failed create rejects the import after other create requests may have succeeded.
- Files changed: `tests/google-maps-import.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Record this partial-failure contract with a focused service test before deciding whether a future import transaction is needed.
- Behavior preserved: A failed create rejects the import; successful rows remain created. The service does not attempt rollback.
- Validation run: Mocked multi-row import with one failed create, `npm run check`, and `git diff --check`.
- Results: The second row returned HTTP 500 and the import rejected with its error; first and third rows had already succeeded. Lint, TypeScript, and all 42 tests passed, with six existing image warnings.
- Risks or follow-up: The button reports the failure but does not call `onImported` for successful rows, so the current trip may need a reload to show them. A transactional or partial-success UX change requires a separate behavior decision.
- Next recommended pass: Check remaining Pass 8 browser parity, then return to focused ordering and API contract cases.

### 2026-09-25 — Multi-row CSV browser parity

- Pass: `Pass 8 — CSV/import decomposition` validation.
- Intent/current behavior: A multi-row import should create each valid place, retain coordinate-free URLs, assign categories, and report invalid schedules without interrupting valid rows.
- Files changed: `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Verify the extracted parser and importer through the actual file-selection UI and persisted records.
- Behavior preserved: Valid rows were created, including a URL-only place; an invalid schedule left its place unscheduled while retaining its resolved coordinates.
- Validation run: Disposable PostgreSQL with all existing migration SQL applied, CSV upload through the browser, persisted API readback, and `git diff --check`.
- Results: The browser reported three imported places, one link without coordinates, and one invalid schedule. API readback showed the quoted-title cafe at 09:00 with coordinates, a new custom-type all-day place retaining its coordinate-free URL, and an undated place with its coordinates. The browser, app, and database were closed afterward.
- Risks or follow-up: `prisma migrate deploy` returned an uninformative schema-engine error in this disposable setup, so this browser fixture applied the same ten migration SQL files directly. The earlier migration fixture validated the Prisma migration path separately. Partial-create failure remains a separate behavior issue.
- Next recommended pass: Continue focused ordering and API contract checks; keep compatibility removal separate.

### 2026-09-25 — Reorder validation parity

- Pass: `Pass 4 — Schedule ordering service` validation.
- Intent/current behavior: Invalid requested order and invalid flexible placement should return HTTP 400 without moving an item or changing its siblings.
- Files changed: `tests/order-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Add database-backed failure assertions around the existing reorder fixture before further ordering extraction.
- Behavior preserved: Negative `dayOrder` and off-grid `placementTime` return their existing validation errors; no schedule or sibling-order fields change.
- Validation run: Ordering fixture against disposable PostgreSQL with all existing migration SQL applied, `npm run check`, and `git diff --check`.
- Results: Both invalid requests returned HTTP 400, and readback retained A/B/C on the original date at orders 0/1/2. The full ordering fixture, lint, TypeScript, and all 42 unit tests passed; lint retained six existing image warnings.
- Risks or follow-up: A clean Prisma migration command failed with an uninformative schema-engine error in this environment, so this fixture applied the checked-in SQL directly. The legacy migration fixture previously covered Prisma migration sequencing.
- Next recommended pass: Continue targeted API and ordering edge cases, then review remaining Pass 2–7 scope.

### 2026-09-25 — Compatibility consumer audit

- Pass: `Pass 6 — Canonical view data boundaries` validation.
- Intent/current behavior: The API still accepts and emits `startDateTime`, `endDateTime`, and `dayIndex`; active UI scheduling should depend only on canonical fields.
- Files changed: `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Inventory remaining compatibility references before planning the dedicated public API migration.
- Behavior preserved: No runtime code or response shape changed.
- Validation run: Repository search across `app`, `components`, `lib`, `store`, and `types` for legacy field accesses and declarations; prior `npm run check`; `git diff --check`.
- Results: No component, store, or API-client property read uses the legacy fields. Remaining property accesses are CSV input-column parsing and the API's legacy request parser. Shared response/request types and API serialization still declare or emit the fields; date utilities compute instants from canonical fields without reading legacy properties.
- Risks or follow-up: Public API response removal remains a dedicated contract migration requiring explicit approval under this tracker and ADR. External consumers cannot be ruled out by repository search.
- Next recommended pass: Continue independent Pass 2–5 and Pass 7 checks while preparing a separate compatibility-removal proposal.

### 2026-09-25 — Share inspector type colors

- Pass: `Pass 7 — Shared view primitives`.
- Intent/current behavior: The inspector repeats the same default and fallback type-color tables already shared by the workspace views.
- Files changed: `components/inspector/ObjectInspectorPanel.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Use the shared type-color lookup for the selected type and its picker options.
- Behavior preserved: Saved custom colors, built-in defaults, and deterministic fallback colors use the same values as before.
- Validation run: Call-site and fallback-value review, `npm run check`, and `git diff --check`.
- Results: Both inspector swatches now use the shared lookup. Lint, TypeScript, and all 42 tests passed; lint retained six existing image warnings. No build or browser check was run for this narrow import replacement.
- Risks or follow-up: Visual inspector parity remains manual; other Pass 7 primitives remain.
- Next recommended pass: Continue targeted shared-view work and remaining Pass 2–5 checks.

### 2026-09-25 — Share UTF-8 note limit

- Pass: `Pass 7 — Shared view primitives` and `Pass 8 — CSV/import decomposition` follow-up.
- Intent/current behavior: Inspector edits and CSV imports independently truncate notes to 2,500 UTF-8 bytes without splitting Unicode characters.
- Files changed: `lib/text-utils.ts`, `components/inspector/ObjectInspectorPanel.tsx`, `lib/google-maps-import.ts`, `tests/text-utils.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Use one pure byte-limit helper at both input paths.
- Behavior preserved: The note limit remains 2,500 UTF-8 bytes in the Inspector and CSV importer; the helper stops before an incomplete Unicode character.
- Validation run: Unicode boundary test, `npm run check`, isolated `npx next build --webpack`, and `git diff --check`.
- Results: The new boundary test and all 43 project tests passed; lint and TypeScript passed with six existing image warnings; isolated webpack build passed.
- Risks or follow-up: No database or response-shape change; the importer partial-failure UX remains separate.
- Next recommended pass: Continue Pass 2–5 or remaining Pass 7 work with targeted parity checks.

### 2026-09-25 — Non-schedule API field parity

- Pass: `Pass 3 — Shared API parsing and serialization`.
- Intent/current behavior: The API contract fixture covers schedule shapes but has little persisted coverage for nullable location/cost/notes, tags, header-image URLs, and invalid non-schedule fields.
- Structural improvement: Extend the database-backed fixture with set, clear, and validation cases without changing route behavior.
- Files changed: `tests/api-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: Existing POST/PATCH route paths, status codes, JSON validation messages, and response shapes remain unchanged.
- Validation run: API fixture against disposable PostgreSQL with all migrations, `npm run check`, and `git diff --check`.
- Results: Set and clear round trips passed for location, cost, notes, tags, and URL-only header images; invalid location, negative cost, data URL image, and non-array tags retained HTTP 400 messages. Lint and TypeScript passed with six existing image warnings, 38 unit tests passed, and diff check passed.
- Risks or follow-up: Further route parity can cover malformed bodies and attachment endpoints before compatibility removal; real-data migration rehearsal still needs a suitable backup.
- Next recommended pass: Continue targeted route parity and browser view interactions, keeping legacy API removal a separate migration.

### 2026-09-25 — Itinerary exact-gap insertion

- Pass: `Pass 4 — Schedule ordering service`.
- Intent/current behavior: Itinerary gap IDs use the original visible list, but the drag handler removes the moving item before clamping the requested index and checking timed neighbors. Forward drops can land one slot early or miss a timed-anchor conversion.
- Structural improvement: Resolve the route's requested index and the effective post-removal neighbors in a pure ordering helper.
- Files changed: `lib/schedule-order.ts`, `components/views/TripDaysView.tsx`, `tests/schedule-order.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: Existing date-move and all-day paths remain; exact gap indices now reach the reorder route, including the final gap. A drop between fixed-time anchors converts the moving item to flexible placement as intended.
- Validation run: Focused gap-position tests, disposable database/browser drag checks, `npm run check`, and `git diff --check`.
- Results: Itinerary placed the first card after the last card, then placed it between two fixed-time cards and cleared its confirmed time. The order and flexible shape survived reload. Lint and TypeScript passed with six existing image warnings; 38 unit tests and diff check passed.
- Risks or follow-up: Browser parity for Kanban forward drops and remaining Calendar interactions is still open.
- Next recommended pass: Continue remaining view drag parity and API contract coverage.

### 2026-09-25 — Preserve explicit order when creating items

- Pass: `Pass 4 — Schedule ordering service`.
- Intent/current behavior: Creating an item with null `dayOrder` makes initial normalization sort every sibling by time, which can undo a previously saved flexible-item insertion between fixed-time items.
- Structural improvement: Insert missing-order items into the existing explicit sequence while placing new fixed-time items relative to timed anchors. Merge the created item into AppShell with the same affected-order shift so the immediate view matches persistence.
- Files changed: `lib/schedule-order.ts`, `components/layout/AppShell.tsx`, `tests/schedule-order.test.mjs`, `tests/order-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: New fixed items still join by confirmed time, and new untimed items follow the established sequence. Existing explicit sibling order remains intact; public API and schema are unchanged.
- Validation run: Focused normalization and client-merge tests, ordering HTTP fixture on disposable PostgreSQL with all migrations, browser drag/create/reload parity, `npm run check`, and `git diff --check`.
- Results: Database fixture preserved a flexible gap after subsequent untimed and timed creation. In the browser, B–A–C remained after adding Tail and reloading; dragging a multi-day all-day continuation card one day forward shifted the full span without converting it to flexible time. Lint and TypeScript passed with six existing image warnings; 38 unit tests, database fixture, and diff check passed.
- Risks or follow-up: The AppShell immediate creation merge is unit-checked but still merits direct browser parity for a timed insertion. A real pre-refactor backup migration rehearsal needs suitable data.
- Next recommended pass: Check immediate timed creation and Kanban forward drag in the browser, then continue API contract coverage before compatibility removal.

### 2026-09-25 — Kanban forward insertion target

- Pass: `Pass 4 — Schedule ordering service`.
- Intent/current behavior: Kanban computes a same-day card target index after excluding the moving item, but the reorder route expects an index in the original sequence and adjusts forward moves itself.
- Structural improvement: Send the target's original day-order position from Kanban and record the forward-insertion route contract.
- Files changed: `components/views/KanbanView.tsx`, `tests/order-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: Same-day drops still insert before the target card; all-day cards remain excluded from Kanban same-day reorder calls. The route, response shape, and persisted schedule fields are unchanged.
- Validation run: `npm run check`, ordering HTTP fixture against a disposable local PostgreSQL database with all migrations, and `git diff --check`.
- Results: Lint and TypeScript passed with six existing image warnings; 35 unit tests passed. The database fixture passed its new forward-before-target case and all existing cases. Diff check passed.
- Risks or follow-up: Browser drag parity remains to be checked for Kanban and Itinerary. A real pre-refactor backup migration rehearsal still requires suitable data.
- Next recommended pass: Continue browser drag parity and remaining API contract coverage before compatibility removal.

### 2026-09-24 — Reorder transaction extraction

- Pass: `Pass 4 — Schedule ordering service`.
- Intent/current behavior: The reorder route owns transaction-level insertion, date-span movement, flexible placement, all-day rejection, and affected-date normalization.
- Files changed: `lib/schedule-order-service.ts`, `app/api/travel-objects/reorder/route.ts`, `tests/order-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Move the transaction body into `lib/schedule-order-service.ts`; retain route parsing, transaction boundary, errors, and response compatibility.
- Behavior preserved: Same-day forward insertion, cross-day fixed and all-day ranges, flexible placement, and order compaction must match the database fixture.
- Validation run: `npm run check`; isolated webpack build; API and ordering HTTP fixtures against fresh migrated PostgreSQL; `git diff --check`.
- Results: Lint and TypeScript passed with six existing image warnings; 31 unit tests passed. Webpack build, API fixture, and ordering fixture passed. The fixture now covers reverse insertion and fixed-to-flexible clearing.
- Risks or follow-up: Browser drag parity and upgrades with real pre-refactor data remain outstanding. The route still owns parsing and compatibility serialization by design.
- Next recommended pass: Review remaining ordering consumers and browser drag paths.

### 2026-09-24 — Kanban reorder consistency

- Pass: `Pass 4 — Schedule ordering service`.
- Intent/current behavior: Kanban computes a same-day card insertion with a local comparator and sends all-day cards to a same-day reorder path that now rejects them.
- Files changed: `components/views/KanbanView.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Use `compareScheduleOrder` for Kanban's insertion calculation and skip same-day reorder requests for all-day cards; type moves remain available.
- Behavior preserved: Non-all-day card reordering and type moves retain their current callback paths.
- Validation run: `npm run check`, isolated webpack build, and `git diff --check`.
- Results: Lint and TypeScript passed with six existing image warnings; 31 unit tests and webpack build passed; diff check passed.
- Risks or follow-up: Kanban card drag parity remains to be exercised in a browser. A disposable browser check confirmed Week and Day all-day placement and a three-day all-day span moving by date, including a drop over a Week time slot; it retained its all-day shape.
- Next recommended pass: Review remaining schedule ordering consumers and browser drag paths.

### 2026-09-24 — Explicit travel-object request types

- Pass: `Pass 9 — Type and documentation alignment`.
- Intent/current behavior: `api.createObject` uses a long inline composition of response fields, and `api.updateObject` accepts any partial response object, including server-owned IDs and timestamps.
- Files changed: `types/travel.ts`, `lib/api-client.ts`, `components/layout/useItemSaveQueue.ts`, `components/layout/AppShell.tsx`, `components/views/TableView.tsx`, `components/inspector/ObjectInspectorPanel.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Define explicit create and update request types, then use them at the API client and item-save boundary. Keep legacy timestamp input fields for compatibility until the separate contract migration.
- Behavior preserved: Request JSON, route behavior, and response fields remain unchanged.
- Validation run: `npm run check`, isolated webpack build, and `git diff --check`.
- Results: Lint and TypeScript passed with six existing image warnings; 31 unit tests and webpack build passed; diff check passed.
- Risks or follow-up: Documentation remains out of date; API compatibility removal is still separate.
- Next recommended pass: Continue Pass 9 documentation alignment or remaining parity checks.

### 2026-09-24 — Current-document pointers

- Pass: `Pass 9 — Type and documentation alignment`.
- Intent/current behavior: README is an older POC specification with obsolete timestamp schema and view scope; HANDOFF_REPORT is a dated historical snapshot; FEATURES omits unscheduled items from the completed list.
- Files changed: `README.md`, `HANDOFF_REPORT.md`, `FEATURES.md`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Put current implementation and refactor pointers at the top of README and HANDOFF_REPORT, and mark the implemented unscheduled flow in FEATURES without rewriting historical detail.
- Behavior preserved: Documentation-only change.
- Validation run: Link/path review and `git diff --check`.
- Results: All referenced local documentation paths exist; diff check passed.
- Risks or follow-up: Full historical README revision remains separate; code is the source of truth.
- Next recommended pass: Continue parity and migration readiness work.

### 2026-09-24 — Legacy-data migration fixture

- Pass: `Pass 0 — Contract and parity baseline` and `Pass 3 — Shared API parsing and serialization` readiness.
- Intent/current behavior: Fresh-database migration tests do not verify upgrades of rows written under the old timestamp schema.
- Files changed: `tests/migration-contract.integration.sh`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Add an opt-in fixture that migrates an isolated database to the old schema, inserts representative fixed, all-day, partial-time, and unscheduled rows, then applies remaining migrations and checks canonical fields.
- Behavior preserved: Production migration SQL is unchanged; the fixture observes its existing transformation.
- Validation run: `bash -n`, two-stage Prisma migration against disposable PostgreSQL, SQL assertions, and `git diff --check`.
- Results: Five historical and five later migrations applied; fixed overnight, multi-day all-day, partial timestamp, and undated rows matched their canonical expected fields. Shell syntax and diff checks passed.
- Risks or follow-up: Synthetic rows complement, but cannot substitute for, a sanitized copy of real pre-refactor data before deployment.
- Next recommended pass: Use a sanitized pre-refactor backup for upgrade rehearsal when available.

### 2026-09-24 — Selection and save-failure browser parity

- Pass: `Pass 5 — AppShell decomposition` validation.
- Intent/current behavior: Selection, bulk delete confirmation, and failed debounced saves needed browser checks after extracting loading, selection, and save queues.
- Files changed: `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: No code change; recorded the existing failure behavior before future save-queue changes.
- Behavior preserved: Table selected two items and showed both names in the delete confirmation; cancel left the items in place. A title edit with the disposable server stopped displayed a connection error but kept the optimistic unsaved title visible.
- Validation run: Isolated production build and disposable PostgreSQL browser fixture.
- Results: Multi-selection and delete confirmation passed. Save failure surfaced the expected error text; the optimistic value remained visible without persistence.
- Risks or follow-up: Decide whether failed saves should revert, remain queued for retry, or show an explicit unsaved marker before changing this behavior. No real user data was affected.
- Next recommended pass: Continue route and view parity; keep save-failure behavior change separate.

### 2026-09-24 — All-day Table length in calendar days

- Pass: `Pass 2 — Pure schedule-domain helpers` and `Pass 6 — Canonical view data boundaries`.
- Intent/current behavior: Table Length displays and edits fixed-time elapsed minutes; all-day rows have a blank, nonfunctional length. The user chose inclusive calendar days for all-day Length.
- Files changed: `lib/schedule-domain.ts`, `components/views/TableView.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Add pure all-day day-count/end-date helpers and use them in Table display, sorting, and editing; mixed selection edits only items matching the row's schedule kind.
- Behavior preserved: Fixed-time duration remains elapsed minutes; flexible and unscheduled lengths remain blank; no API or schema change.
- Validation run: `npm run check`, isolated webpack build, `git diff --check`, and browser/API persistence check against disposable PostgreSQL.
- Results: Lint and TypeScript passed with six existing image warnings; 33 unit tests, webpack build, and diff check passed. Table showed three days, saved four days as March 7–10, then moved the four-day all-day span across DST to March 14–17 with null times and placement.
- Risks or follow-up: Mixed selection applies a length edit only to items matching the edited row's all-day or fixed-time kind. This is deliberate to prevent interpreting days as minutes.
- Next recommended pass: Continue remaining parity and API migration readiness.

### 2026-09-24 — Refresh after placement and order edits

- Pass: `Pass 4 — Schedule ordering service` and `Pass 5 — AppShell decomposition`.
- Intent/current behavior: The save queue refetches trip items after date/time/all-day edits, but excludes `placementTime` and `dayOrder`; PATCH can normalize siblings for either field.
- Files changed: `components/layout/useItemSaveQueue.ts`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Treat every persisted schedule-order field as a trigger for a trip refresh after save.
- Behavior preserved: Existing debounce, optimistic edits, API payloads, and error handling remain.
- Validation run: `npm run check`, isolated webpack build, caller audit, and `git diff --check`.
- Results: Lint and TypeScript passed with six existing image warnings; 33 unit tests, webpack build, and diff check passed. The queue now refetches after any canonical schedule/order field changes.
- Risks or follow-up: Save-failure policy remains a separate decision.
- Next recommended pass: Continue ordering and API parity.

### 2026-09-24 — Guard save results across trip switches

- Pass: `Pass 5 — AppShell decomposition`.
- Intent/current behavior: A queued save for Trip A can finish after switching to Trip B; its schedule refresh can replace Trip B's visible items while the trip-loading marker still says B.
- Files changed: `components/layout/useItemSaveQueue.ts`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Apply save results and trip refreshes only while their originating trip is active; still persist the queued edit for its original item.
- Behavior preserved: Same-trip optimistic updates, debounce, and mutation payloads remain.
- Validation run: `npm run check`, isolated webpack build, source-level race audit, `git diff --check`, and a delayed PATCH browser check against disposable PostgreSQL.
- Results: Lint and TypeScript passed with six existing image warnings; 33 unit tests, webpack build, and diff check passed. Alpha's edit persisted after switching immediately to Beta, while Beta continued to display only its own item after the delayed response.
- Risks or follow-up: Failed-save policy remains separate.
- Next recommended pass: Continue ordering and API parity; decide failed-save behavior separately.

### 2026-09-24 — Guard other item-list results across trip switches

- Pass: `Pass 5 — AppShell decomposition`.
- Intent/current behavior: Create, reorder, and CSV import responses can arrive after the user changes trips and put the previous trip's items in the newly selected trip's list.
- Files changed: `components/layout/AppShell.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Apply those asynchronous list results and create selection only while the originating trip is still active. The requested writes still complete for their original trip.
- Behavior preserved: Same-trip item creation, insertion order, reordering, and CSV import list updates retain their existing paths and payloads.
- Validation run: `npm run check` and `git diff --check`.
- Results: Lint and TypeScript passed with six existing image warnings; 33 tests and diff check passed.
- Risks or follow-up: A delayed-response browser check for create, reorder, and import is still useful. Failed-save behavior remains a separate pending decision.
- Next recommended pass: Continue browser parity for asynchronous trip mutations, then remaining ordering and API contract coverage.

### 2026-09-25 — Normalize order after legacy PATCH moves

- Pass: `Pass 3 — Shared API parsing and serialization` and `Pass 4 — Schedule ordering service`.
- Intent/current behavior: A legacy timestamp PATCH projects into canonical date/time fields, but the route decides whether to normalize affected dates from the original request keys. A legacy-only move can leave `dayOrder` gaps on its source or destination date.
- Structural improvement: Detect schedule changes from the parsed update fields, regardless of request format.
- Files changed: `app/api/travel-objects/[objectId]/route.ts`, `tests/api-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: Canonical PATCH behavior and legacy request/response shapes stay the same. Legacy moves and unscheduling now compact affected `dayOrder` values.
- Validation run: `npm run check`, isolated `npx next build --webpack`, both HTTP contract fixtures on disposable PostgreSQL with all ten migrations, and `git diff --check`.
- Results: Lint and TypeScript passed with six existing image warnings; 33 unit tests, webpack build, API fixture including new legacy ordering assertions, ordering fixture, and diff check passed.
- Risks or follow-up: Broader runtime view parity and eventual dedicated API compatibility removal remain.
- Next recommended pass: Continue browser parity for asynchronous trip mutations and remaining Pass 3–9 coverage.

### 2026-09-25 — Share event-type color lookup

- Pass: `Pass 7 — Shared view primitives`.
- Intent/current behavior: Calendar, Kanban, Day, Itinerary, Table, and Leaflet markers repeat the same saved-color, default-color, and deterministic palette fallback rule. Leaflet also rejects non-hex custom colors before putting them into marker SVG.
- Structural improvement: Move the common lookup into one pure helper across all six views while retaining Leaflet's hex validation.
- Files changed: `lib/type-color.ts`, six view modules, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: Existing custom colors, defaults, deterministic palette, and Leaflet's invalid-color fallback remain the same.
- Validation run: Call-site and fallback-value review, `npm run check`, isolated `npx next build --webpack`, and `git diff --check`.
- Results: All six views call the shared helper; lint and TypeScript passed with six existing image warnings, 33 unit tests passed, webpack build passed, and diff check passed.
- Risks or follow-up: Visual parity of custom colors and map markers remains to be checked in the browser. Other Pass 7 primitives remain separate work.
- Next recommended pass: Continue a small shared-view or parity pass while keeping legacy API removal separate.

### 2026-09-25 — Separate CSV import orchestration from its button

- Pass: `Pass 8 — CSV/import decomposition`.
- Intent/current behavior: The button handles file input and progress UI while also resolving Maps URLs, retaining unresolved links, creating travel objects, and counting import outcomes.
- Structural improvement: Move resolution and persistence into a focused import function; leave file selection and user feedback in the component.
- Files changed: `lib/google-maps-import.ts`, `components/trip/ImportGoogleMapsCsvButton.tsx`, `tests/google-maps-import.test.mjs`, `docs/architecture.md`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: Import concurrency, resolver fallback, URL retention, canonical schedule payloads, custom types, progress counts, and summary wording stay the same.
- Validation run: Exercise resolved, coordinate-free, and failed URL resolution through a mocked fetch boundary; `npm run check`, isolated `npx next build --webpack`, `git diff --check`, and a synthetic CSV upload in the isolated browser/database.
- Results: The import fixture retained all three source URLs, created canonical all-day and unscheduled payloads, reported two unresolved locations and one invalid date, and counted progress through all three rows. Lint and TypeScript passed with six existing image warnings; 34 unit tests and webpack build passed; diff check passed. The browser import displayed the new item, and the API confirmed canonical all-day fields, normalized type, original Maps URL, and parsed coordinates.
- Risks or follow-up: Multi-row live import and partial create failure behavior are not browser checked. A create failure after other rows succeed can leave a partial import, as before.
- Next recommended pass: Continue Pass 8 runtime parity and remaining view interactions; keep API compatibility removal separate.

### 2026-09-25 — Align refactor guidance with current boundaries

- Pass: `Pass 9 — Type and documentation alignment`.
- Intent/current behavior: The tracker still describes legacy UI reads, duplicated route parsing, and the pre-extraction CSV button even though those slices are complete.
- Files changed: `AGENTS.md`, `docs/decisions/0001-canonical-schedule-fields.md`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: State the current canonical UI and transitional API boundary consistently; mark type/documentation alignment complete.
- Behavior preserved: Documentation only; no runtime or public contract change.
- Validation run: Source search for compatibility consumers, review of request types and documentation pointers, and `git diff --check`.
- Results: Active UI has no direct legacy-field reads; type declarations and current-doc pointers match the implementation; diff check passed. The earlier 34-test check and webpack build validated the associated code changes.
- Risks or follow-up: Dedicated API compatibility removal and remaining browser parity remain separate work.
- Next recommended pass: Continue Pass 4–8 parity and small structural slices.

### 2026-09-25 — Share calendar-day shifting

- Pass: `Pass 2 — Pure schedule-domain helpers`.
- Intent/current behavior: Calendar, Day, Itinerary, CSV parsing, and trip creation each advance ISO calendar dates with local UTC helpers.
- Structural improvement: Use one pure UTC calendar-day shift helper while retaining each caller's existing empty-input handling.
- Files changed: `lib/date-utils.ts`, Calendar, Day, Itinerary, CSV parser, trip dialog, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: Date navigation, trip defaults, and overnight CSV end dates still advance by whole UTC calendar days.
- Validation run: Leap-day and year-boundary assertions, `npm run check`, isolated `npx next build --webpack`, duplicate-implementation search, and `git diff --check`.
- Results: Lint and TypeScript passed with six existing image warnings; 35 unit tests, webpack build, and diff check passed. Only the shared helper mutates a UTC date for these callers.
- Risks or follow-up: Larger Calendar and Day mode behavior remains a separate browser parity item.
- Next recommended pass: Continue targeted view parity and API contract readiness.

### 2026-09-25 — Delayed-create trip-switch parity

- Pass: `Pass 5 — AppShell decomposition` validation.
- Intent/current behavior: A create response for the previous trip must not append its item or select it after switching trips.
- Files changed: `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: No code change; verified the existing active-trip guard with a delayed HTTP response.
- Behavior preserved: The original trip still receives the created item; the newly selected trip keeps its own item list and selection.
- Validation run: Browser check through an isolated production build, disposable PostgreSQL, and a local proxy delaying POST `/api/travel-objects` responses.
- Results: Alpha's new item persisted. Beta remained empty after the delayed response, and switching back showed the item in Alpha.
- Risks or follow-up: Reorder and CSV import response guards still lack a delayed-response browser check.
- Next recommended pass: Continue those race checks only where they address a concrete risk, then remaining refactor parity.

### 2026-09-25 — Failed-save behavior decision

- Pass: `Pass 5 — AppShell decomposition` behavior policy.
- Intent/current behavior: A failed debounced save shows an error while the optimistic edit stays visible; the failed patch is removed from the queue.
- Decision: The user chose to retain the current error-only feedback. Do not add automatic retry, rollback, or an unsaved marker as part of this refactor.
- Files changed: `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: No save-queue code or UI change.
- Validation run: Existing failed-save browser check reviewed; `git diff --check` for documentation.
- Results: The existing check already observed the chosen visible behavior. No new runtime test was needed for a documentation-only decision.
- Risks or follow-up: The visible optimistic edit may not be persisted after a failure; the error is the only indication until a later reload or edit.
- Next recommended pass: Continue independent schedule, ordering, and browser parity work.

### 2026-09-25 — Unscheduled round-trip API parity

- Pass: `Pass 0 — Contract and parity baseline` and `Pass 6 — Canonical view data boundaries` validation.
- Intent/current behavior: An undated idea can be placed flexibly on a date and later returned to the unscheduled collection without acquiring confirmed times.
- Structural improvement: Add a persisted contract assertion for that full canonical schedule transition.
- Files changed: `tests/api-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Behavior preserved: Existing canonical PATCH payloads and response shapes remain; the fixture records expected fields and day order at both transitions.
- Validation run: API fixture against isolated production build and disposable PostgreSQL, `npm run check`, and `git diff --check`.
- Results: The idea gained a date and 10:15 flexible placement with no confirmed times, then returned to null date, end date, placement, and day order. API fixture passed; lint and TypeScript passed with six existing image warnings, 35 unit tests passed, and diff check passed.
- Risks or follow-up: Browser drag/drop round-trip remains to be checked separately.
- Next recommended pass: Continue remaining view interaction parity and API-contract readiness.

### 2026-09-24 — Ordering normalization after deletion

- Pass: `Pass 4 — Schedule ordering service`.
- Intent/current behavior: DELETE removes a scheduled item without compacting the remaining date's `dayOrder`; create, update, and reorder each normalize ordering inline.
- Files changed: `lib/schedule-order.ts`, `lib/schedule-order-service.ts`, create/update/reorder API routes, `tests/schedule-order.test.mjs`, `tests/order-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: `writeDateOrder` normalizes one date within the caller's transaction. Create, update, reorder, and delete use the same writer with their existing ordering policies; deletion compacts gaps while retaining sibling order.
- Behavior preserved: Existing route paths, response shapes, and schedule parsing remain. The database fixture covers same-day insertion, cross-day fixed movement, flexible placement, and all-day date-only movement.
- Validation run: `npm run check`; isolated `npx next build --webpack`; both HTTP fixtures against a fresh temporary PostgreSQL database with all ten migrations; `git diff --check`.
- Results: Lint and TypeScript passed; 24 unit tests passed; webpack build and both HTTP fixtures passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Normalization policy still varies by mutation type, intentionally preserving existing create, update, and reorder behavior. Broader ordering and browser parity remain outstanding.
- Next recommended pass: Move PATCH legacy schedule projection into the shared API parser and extend its route-level fixture.

### 2026-09-24 — PATCH compatibility projection

- Pass: `Pass 3 — Shared API parsing and serialization`.
- Intent/current behavior: PATCH applies canonical fields through `lib/api-schedule.ts` but still converts legacy timestamp pairs inline in the route.
- Files changed: `lib/api-schedule.ts`, `app/api/travel-objects/[objectId]/route.ts`, `tests/api-schedule.test.mjs`, `tests/api-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: `readLegacyUpdateScheduleFields` owns legacy PATCH projection at the API boundary; the route merges its result into the existing update data.
- Behavior preserved: Canonical fields take precedence, a null timestamp pair unschedules, a lone legacy timestamp does not update, and invalid legacy strings still return validation errors.
- Validation run: `npm run check`; isolated `npx next build --webpack`; both HTTP fixtures against a fresh migrated PostgreSQL database; `git diff --check`.
- Results: Lint and TypeScript passed; 25 unit tests passed; webpack build and both HTTP fixtures passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: More route coverage and real pre-refactor migration data remain before compatibility removal.
- Next recommended pass: Extract the pure Google Maps CSV parser, then resume Pass 3 coverage.

### 2026-09-24 — Google Maps CSV parser extraction

- Pass: `Pass 8 — CSV/import decomposition`.
- Intent/current behavior: The import button contains CSV lexing, header/category lookup, date/time parsing, schedule projection, Maps resolution, persistence, and progress UI.
- Files changed: `lib/google-maps-csv.ts`, `components/trip/ImportGoogleMapsCsvButton.tsx`, `tests/google-maps-csv.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: `parseGoogleMapsCsv` owns CSV lexing, headers, categories, date/time interpretation, canonical schedule projection, and import counts. The button retains Maps URL resolution, persistence, progress, and feedback.
- Behavior preserved: Existing parser rules, custom category matching, invalid-date handling, and import messages remain. No API or schema change.
- Validation run: `npm run check`; isolated `npx next build --webpack`; `git diff --check`.
- Results: Lint and TypeScript passed; 28 unit tests passed; webpack build and diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Live import and unresolved Maps link feedback were not exercised in a browser; these remain before Pass 8 can be marked complete.
- Next recommended pass: Clarify AppShell view collection boundaries, then continue Pass 5 decomposition.

### 2026-09-24 — Explicit view collections

- Pass: `Pass 6 — Canonical view data boundaries`.
- Intent/current behavior: `AppShell` aliases the same item array as both `boardItems` and `scheduledBoardItems`; Itinerary filters undated items internally while Kanban needs both dated and undated items.
- Files changed: `components/layout/AppShell.tsx`, `components/views/TripDaysView.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Calendar, Kanban, Table, and Map receive the complete collection; Itinerary receives only scheduled items. Its redundant internal filter is removed.
- Behavior preserved: Kanban keeps undated items; Itinerary still displays scheduled dates and uses the same range/ordering helper. No API or schema change.
- Validation run: `npm run check`; isolated `npx next build --webpack`; `git diff --check`.
- Results: Lint and TypeScript passed; 28 unit tests passed; webpack build and diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Browser view parity remains manual. Pass 5 AppShell state/mutation decomposition is still outstanding.
- Next recommended pass: Extract one AppShell concern with a practical parity seam, or extend API/ordering fixtures before the compatibility migration.

### 2026-09-24 — AppShell schedule sorting

- Pass: `Pass 5 — AppShell decomposition`.
- Intent/current behavior: `AppShell` repeatedly sorts complete item lists by date and explicit day order through a nested function.
- Files changed: `lib/schedule-order.ts`, `components/layout/AppShell.tsx`, `tests/schedule-order.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: `sortTravelObjects` owns trip-wide date and explicit-order sorting; AppShell uses it for all optimistic and API-result updates.
- Behavior preserved: Dated items remain ordered by date and `dayOrder`; undated ideas remain last. No API or schema change.
- Validation run: `npm run check`; isolated `npx next build --webpack`; `git diff --check`.
- Results: Lint and TypeScript passed; 29 unit tests passed; webpack build and diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: AppShell still owns fetching, selection, save queues, and mutations; browser parity remains manual.
- Next recommended pass: Extract one state or mutation concern with a practical validation seam.

### 2026-09-24 — AppShell trip data loading

- Pass: `Pass 5 — AppShell decomposition`.
- Intent/current behavior: AppShell owns trip and item fetch state, active-trip reconciliation, loading indicators, and cancellation guards alongside selection and mutation logic.
- Files changed: `components/layout/useTripData.ts`, `components/layout/AppShell.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`, `docs/architecture.md`.
- Structural improvement: `useTripData` owns trip and item fetch state, active-trip reconciliation, and cancellation guards. AppShell retains mutation setters and view composition.
- Behavior preserved: Trip selection still falls back to the first available trip, a switched trip waits for its item fetch through `itemsTripId`, and load errors keep their messages. No API or schema change.
- Validation run: `npm run check`; isolated `npx next build --webpack`; `git diff --check`; source-level audit of fetch and trip-switch paths.
- Results: Lint and TypeScript passed; 29 unit tests passed; webpack build and diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Trip switching was exercised in an isolated browser fixture; AppShell still owns view actions.
- Next recommended pass: Browser trip-switch parity, then extract one mutation concern with a practical validation seam.

### 2026-09-24 — AppShell save queue extraction

- Pass: `Pass 5 — AppShell decomposition`.
- Intent/current behavior: AppShell owns optimistic item patches, 450 ms debounced saves, per-item queue flushing, schedule refreshes, and pending-save cancellation before deletion.
- Files changed: `components/layout/useItemSaveQueue.ts`, `components/layout/AppShell.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`, `docs/architecture.md`.
- Structural improvement: `useItemSaveQueue` owns optimistic patches, per-item queued saves, 450 ms timers, schedule refreshes, and pending-save cancellation. AppShell keeps the same `changeItem` calls and cancels pending saves before deleting.
- Behavior preserved: Existing save timing, error text, patch merging, and delete paths remain. No API, schema, or persisted-format change.
- Validation run: `npm run check`; isolated `npx next build --webpack`; `git diff --check`; caller audit for edit, move, resize, and delete paths.
- Results: Lint and TypeScript passed; 29 unit tests passed; webpack build and diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: A debounced title save survived reload in an isolated browser fixture. Save-failure behavior remains unexercised; AppShell view actions remain inline.
- Next recommended pass: Extract selection state while keeping the current selection callbacks and keyboard shortcuts.

### 2026-09-24 — AppShell selection state extraction

- Pass: `Pass 5 — AppShell decomposition`.
- Intent/current behavior: AppShell owns selected IDs, primary selection, inspected item, and core selection callbacks used by every view.
- Files changed: `components/layout/useItemSelection.ts`, `components/layout/AppShell.tsx`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`, `docs/architecture.md`.
- Structural improvement: `useItemSelection` owns selected IDs, primary selection, inspector ID, and the existing selection callbacks. AppShell keeps delete and keyboard flows wired to the hook's setters.
- Behavior preserved: Select, inspect, clear, Escape, and view props retain their existing behavior. No API or schema change.
- Validation run: `npm run check`; follow-up lint after hook-dependency correction; isolated `npx next build --webpack`; `git diff --check`; browser parity on a disposable PostgreSQL database.
- Results: Lint and TypeScript passed; 29 unit tests passed; webpack build and diff check passed. The browser check confirmed trip switching, item selection, inspector opening, title edit persistence after reload, and Escape clearing selection. Lint retains six existing image warnings.
- Risks or follow-up: Multi-selection, delete confirmation, and save-failure behavior remain manual parity cases.
- Next recommended pass: Expand API contract coverage while completing remaining browser parity cases.

### 2026-09-24 — PATCH schedule normalization extraction

- Pass: `Pass 3 — Shared API parsing and serialization`.
- Intent/current behavior: PATCH parses fields through shared helpers but still normalizes and validates the final schedule shape inline in the route.
- Files changed: `lib/api-schedule.ts`, `app/api/travel-objects/[objectId]/route.ts`, `tests/api-schedule.test.mjs`, `tests/api-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: `normalizeUpdatedScheduleData` owns final PATCH schedule normalization and validation after request fields are parsed; the route keeps persistence and transaction ordering.
- Behavior preserved: Canonical and legacy precedence, unscheduling, flexible defaults, fixed-time placement, all-day invariants, validation messages, and response shape remain.
- Validation run: `npm run check`; isolated webpack build; both HTTP fixtures against a fresh migrated PostgreSQL database; `git diff --check`.
- Results: Lint and TypeScript passed; 31 unit tests passed; webpack build and both HTTP fixtures passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Broader migration parity with actual pre-refactor data remains before compatibility removal.
- Next recommended pass: Extract the reorder transaction into the schedule ordering service under the existing database fixture.

### 2026-09-24 — All-day placement in Week and Day

- Pass: `Pass 6 — Canonical view data boundaries` and `Pass 7 — Shared view primitives`.
- Intent/current behavior: Week mixed all-day items with flexible time clusters and showed multi-day all-day items only on their start date; Day interleaved all-day cards with timed and flexible cards according to `dayOrder`.
- Files changed: `components/views/CalendarView.tsx`, `components/views/DayJourneyView.tsx`, `lib/schedule-domain.ts`, `lib/schedule-order.ts`, `tests/schedule-domain.test.mjs`, `tests/schedule-order.test.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Week has an all-day lane above aligned time grids and shows each date of an all-day span. Day presents all-day cards first while drop targets retain canonical insertion indices. Dragging a continuation day shifts the whole all-day span by that day's offset.
- Behavior preserved: All-day drops remain date-only and retain inclusive multi-day spans; fixed and flexible items keep their Week time-grid placement and stored `dayOrder`. No API or schema change.
- Validation run: `npm run check`; isolated `npx next build --webpack`; `git diff --check`.
- Results: Lint and TypeScript passed; 23 unit tests passed; webpack build and diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Browser visual/drag parity across Week and Day remains manual; the all-day Table length decision remains pending.
- Next recommended pass: Continue Pass 3 API route parity coverage, then Pass 4 ordering-service extraction. Keep API compatibility removal separate.

### 2026-09-22 — Initial tracker created

- Pass: `Pass 0 — Contract and parity baseline`
- Intent/current behavior: Establish a shared plan and handoff document before implementation begins.
- Files changed: `REFACTORING_TRACKER.md`
- Structural improvement: Created a living tracker with refactor passes, behavior contracts, validation requirements, migration boundaries, and an agent update protocol.
- Behavior preserved: No application source, database schema, API route, or generated artifact was changed.
- Validation run: `git status --short`, `npm run lint`, `npx tsc --noEmit`, and repository inspection with `rg`.
- Results: Lint passed with 6 existing image-optimization warnings; TypeScript passed. A staged `.next/dev/trace` change was present before this tracker was created.
- Risks or follow-up: Create parity fixtures and verify the unreferenced `CreateItemDialog.tsx` before deleting anything.
- Next recommended pass: `Pass 1 — Verified dead-code cleanup` or first create the parity artifacts required by Pass 0.

### 2026-09-23 — Compatibility-field removal clause added

- Pass: `Pass 6 — Canonical view data boundaries`
- Intent/current behavior: Make removal of the transitional schedule fields an explicit tracked outcome rather than an indefinite compatibility promise.
- Files changed: `REFACTORING_TRACKER.md`
- Structural improvement: Added an exit condition and a dedicated API-migration clause for removing `startDateTime`, `endDateTime`, and `dayIndex` after canonical consumer migration.
- Behavior preserved: No application code, API response, database schema, or generated artifact was changed.
- Validation run: Read-back of the updated tracker.
- Results: The compatibility fields remain supported during intermediate passes and are now required to be removed in a later, explicitly validated API-contract change.
- Risks or follow-up: Before removal, search the entire repository and complete the schedule parity matrix and API fixture updates.
- Next recommended pass: `Pass 1 — Verified dead-code cleanup` or `Pass 2 — Pure schedule-domain helpers`.

### 2026-09-23 — Verified dead-code cleanup

- Pass: `Pass 1 — Verified dead-code cleanup`
- Intent/current behavior: Item creation is handled by `AppShell.openCreateItem`; `CreateItemDialog` has no imports or runtime references in application source.
- Files changed: `components/trip/CreateItemDialog.tsx` (removed), `REFACTORING_TRACKER.md`.
- Structural improvement: Remove the unused dialog and its private helpers without changing the active creation flow.
- Behavior preserved: Active item creation still uses `AppShell.openCreateItem`; no route, UI call site, schema, or API shape changed.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; final `rg` reference search; `git diff --check`.
- Results: Lint and TypeScript passed (six existing image warnings); webpack build passed; no application references to `CreateItemDialog` remain; diff check passed.
- Risks or follow-up: Runtime UI parity was not manually exercised. Other dead-code candidates need independent reachability checks. Generated `.next` artifacts stayed outside this pass.
- Next recommended pass: `Pass 2 — Pure schedule-domain helpers`.

### 2026-09-23 — Schedule-domain helper extraction

- Pass: `Pass 2 — Pure schedule-domain helpers`
- Intent/current behavior: `AppShell` shifts all-day and fixed-time ranges using date arithmetic; `TableView` computes elapsed duration from compatibility timestamps. Fixed-time moves preserve wall-clock duration across timezone transitions.
- Files changed: `lib/schedule-domain.ts`, `lib/travel-object-compat.ts`, `components/layout/AppShell.tsx`, `components/views/TableView.tsx`, `tests/schedule-domain.test.mjs`, `package.json`, `tsconfig.json`, `AGENTS.md`, `REFACTORING_TRACKER.md`.
- Structural improvement: Pure helpers now accept and return canonical date/time fields for all-day and fixed-time moves and derive elapsed duration from canonical fields. `AppShell` projects legacy timestamps only for UI compatibility. The existing compatibility serializer is directly testable, and `npm run check` includes the focused Node tests.
- Behavior preserved: Existing move formulas and table duration calculation were transferred while moving their inputs to canonical fields. Tests cover unscheduled, flexible, all-day, fixed-time, multi-day, DST, invalid local input, and canonical-to-compatibility serialization.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; six schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings. Node emits a module-type warning while running the TypeScript test imports.
- Risks or follow-up: Runtime UI parity was not manually exercised. Some `AppShell` branches and Table edits still read or write compatibility fields; migrate those consumers in later passes before removing the API fields. No API or database changes were made. Generated `.next` artifacts stayed outside this pass.
- Next recommended pass: Continue Pass 2 with pure schedule-shape and fallback helpers, then validate remaining consumers before Pass 3.

### 2026-09-23 — Canonical placement and schedule shapes

- Pass: `Pass 2 — Pure schedule-domain helpers`
- Intent/current behavior: `AppShell.moveItem` decides whether a dropped item is all-day, flexible, or fixed and restores saved times for undated items. A restored default hour can cross midnight.
- Files changed: `lib/schedule-domain.ts`, `components/layout/AppShell.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`.
- Structural improvement: `scheduleKind` and `placeUnfixedItem` now classify canonical schedule shapes and calculate undated/flexible placement outside `AppShell`.
- Behavior preserved: Saved times, flexible placement, default one-hour end across midnight, and trip-timezone compatibility projection remain the same. No API, schema, or persisted-format change.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; eight schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime UI parity was not manually exercised. Other schedule decisions and compatibility-field consumers remain; API response fields stay until the dedicated migration.
- Next recommended pass: Continue Pass 2 with remaining duration and schedule edits, then proceed to Pass 3.

### 2026-09-24 — Canonical fixed-time resizing

- Pass: `Pass 2 — Pure schedule-domain helpers`
- Intent/current behavior: `AppShell.resizeItem` changes one time edge while retaining the item's date range and deriving compatibility timestamps for optimistic UI state.
- Files changed: `lib/schedule-domain.ts`, `components/layout/AppShell.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`.
- Structural improvement: `resizeFixedTimeRange` calculates the canonical range outside `AppShell`; the shell derives compatibility timestamps only for optimistic UI state.
- Behavior preserved: Start/end edge edits retain their date range. Tests cover a multi-day range and timezone projection across DST. No API, schema, or persisted-format change.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; twelve schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime resize parity was not manually exercised. Table duration editing sends only a legacy end timestamp, while the update route appears to require both legacy timestamps to derive a canonical update; verify and fix that workflow with a separate regression test.
- Next recommended pass: Verify the Table duration edit contract, then finish Pass 2 or proceed to Pass 3.

### 2026-09-24 — Table duration editing

- Pass: `Pass 2 — Pure schedule-domain helpers`
- Intent/current behavior: Table shows elapsed minutes from canonical fields, but its length editor sends only `endDateTime`; the update route does not derive a canonical update from a lone legacy end timestamp.
- Files changed: `lib/schedule-domain.ts`, `components/views/TableView.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`.
- Structural improvement: `endForElapsedDuration` derives canonical `endDate` and `endTime` from a fixed item's canonical start. Table sends these fields through the existing multi-selection update path; compatibility `endDateTime` is included only for optimistic UI state.
- Behavior preserved: Each eligible selected item keeps its own start; elapsed duration handles midnight and DST. Undated, flexible, and all-day items are skipped, as are blank, zero, noninteger, and invalid lengths. No route, schema, or persisted-format change.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; fourteen schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime Table and database parity were not manually exercised. All-day length cannot represent arbitrary elapsed minutes with date-only fields, especially across DST, so its editor remains ineffective pending a product decision. Table start editing still submits legacy timestamps.
- Next recommended pass: Convert Table start editing to canonical fields, then continue Pass 2 consumer review before Pass 3.

### 2026-09-24 — Table start editing

- Pass: `Pass 2 — Pure schedule-domain helpers`
- Intent/current behavior: Table start edits preserve each selected item's elapsed duration (minimum fifteen minutes), default to one hour when no confirmed range exists, keep all-day items all-day, and clear a schedule when the value is emptied. The editor currently reads and writes compatibility timestamps.
- Files changed: `lib/schedule-domain.ts`, `components/views/TableView.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`.
- Structural improvement: `scheduleAtTableStart` calculates a canonical date/time range from each item's elapsed duration; the Table editor now derives its displayed start from canonical fields and sends canonical updates.
- Behavior preserved: Fixed and overnight items keep their individual elapsed durations across DST, all-day items stay all-day, undated/flexible items default to one hour, and clearing the input removes the date while keeping saved times. Compatibility fields remain optimistic UI projections.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; sixteen schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime Table and database parity were not manually exercised. Remaining UI/import consumers still use compatibility fields.
- Next recommended pass: Review remaining Pass 2 schedule consumers, then start Pass 3.

### 2026-09-24 — Canonical CSV import writes

- Pass: `Pass 2 — Pure schedule-domain helpers`
- Intent/current behavior: CSV date/time columns support local and offset timestamps, all-day dates, overnight end times, and a default one-hour end. Rows with invalid start values are imported as unscheduled. The importer currently submits legacy timestamp fields.
- Files changed: `lib/travel-object-compat.ts`, `components/trip/ImportGoogleMapsCsvButton.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`.
- Structural improvement: The existing parser still resolves local and offset timestamps, then `canonicalScheduleFromInstants` projects them into persisted schedule fields before create requests.
- Behavior preserved: Unscheduled, fixed overnight, and all-day DST projections match legacy route conversion. The existing invalid-start and default-end behavior remains in the CSV parser. No API or schema change.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; seventeen schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime CSV import was not manually exercised. The CSV parser remains inside the UI component; parser decomposition belongs to Pass 8.
- Next recommended pass: Migrate remaining UI compatibility-field reads in small view slices, then start Pass 3.

### 2026-09-24 — Table sort and Inspector schedule reads

- Pass: `Pass 6 — Canonical view data boundaries`
- Intent/current behavior: Table sorts by derived start timestamp. Inspector displays canonical date/time fields with fallbacks to compatibility timestamps.
- Files changed: `components/views/TableView.tsx`, `components/inspector/ObjectInspectorPanel.tsx`, `REFACTORING_TRACKER.md`.
- Structural improvement: Table start sorting derives its timestamp from canonical fields. Inspector input values use persisted date/time fields directly and no longer fall back to compatibility timestamps.
- Behavior preserved: The API provides canonical values for unscheduled, flexible, all-day, and fixed items; Table retains timezone-aware ordering and Inspector retains empty values for missing dates or times. No API or schema change.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; seventeen schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime view parity was not manually exercised. Inspector still writes compatibility projections for optimistic UI until other consumers migrate.
- Next recommended pass: Continue migrating Calendar, Kanban, and Itinerary reads.

### 2026-09-24 — Kanban and Itinerary canonical schedule reads

- Pass: `Pass 6 — Canonical view data boundaries`
- Intent/current behavior: Kanban cards show trip-local start labels and only reorder items on the same date. Itinerary includes scheduled items, spans fixed/all-day ranges across dates, keeps flexible items on their start date, and distinguishes timed drag anchors.
- Files changed: `lib/schedule-domain.ts`, `components/views/KanbanView.tsx`, `components/views/TripDaysView.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`.
- Structural improvement: Kanban derives labels and same-day reorder checks from canonical fields. Itinerary uses `occursOnItineraryDate` for fixed/all-day spans and flexible placement; drag decisions use canonical date and time shape.
- Behavior preserved: Tests cover multi-day fixed and all-day spans, flexible start-date placement, and undated exclusion. No API or schema change.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; eighteen schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime drag parity was not manually exercised. Calendar remains a separate view slice.
- Next recommended pass: Migrate Calendar reads, then review remaining legacy consumers.

### 2026-09-24 — Calendar canonical schedule reads

- Pass: `Pass 6 — Canonical view data boundaries`
- Intent/current behavior: Calendar month spans use canonical dates with timestamp fallbacks; drag previews and event chips format derived start timestamps in the trip timezone.
- Files changed: `components/views/CalendarView.tsx`, `REFACTORING_TRACKER.md`.
- Structural improvement: Month spans use canonical `date`/`endDate`; drag previews and event chips derive timezone-aware labels from canonical fields.
- Behavior preserved: Scheduled, all-day, flexible, and undated items keep their existing month placement and labels. No API or schema change.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; eighteen schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Calendar drag and visual parity were not manually exercised.
- Next recommended pass: Search remaining legacy reads and optimistic projections before API compatibility removal.

### 2026-09-24 — Remove client compatibility projections

- Pass: `Pass 6 — Canonical view data boundaries`
- Intent/current behavior: AppShell, Table, and Inspector include derived legacy fields in optimistic patches so older views display changes before API responses arrive. All active view reads now use canonical fields.
- Files changed: `components/layout/AppShell.tsx`, `components/views/TableView.tsx`, `components/inspector/ObjectInspectorPanel.tsx`, `REFACTORING_TRACKER.md`.
- Structural improvement: Optimistic patches now contain canonical schedule fields only. A repository search found no client view reads or writes of the legacy response fields; CSV header names and the API adapter remain intentionally.
- Behavior preserved: Move, resize, unschedule, and inline edit actions still send the same canonical fields. The API still emits and accepts compatibility fields; response shape is unchanged.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`; `rg` client-consumer audit.
- Results: Lint and TypeScript passed; eighteen schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime parity was not manually exercised. Legacy fields remain in the shared client type, API client input type, response adapter, and request parsers until the dedicated API contract migration.
- Next recommended pass: Confirm no client consumers remain; proceed with shared API parsing and parity fixtures before any contract removal.

### 2026-09-24 — Shared API schedule-field parsing

- Pass: `Pass 3 — Shared API parsing and serialization`
- Intent/current behavior: POST and PATCH independently parse the same canonical date/time/placement fields and legacy timestamp pair. POST and PATCH have different defaults and validation behavior that must remain intact.
- Files changed: `lib/api-schedule.ts`, `app/api/travel-objects/route.ts`, `app/api/travel-objects/[objectId]/route.ts`, `tests/api-schedule.test.mjs`, `REFACTORING_TRACKER.md`.
- Structural improvement: `readCreateSchedule` owns POST defaults and validation in their original order; `readUpdateScheduleFields` parses PATCH canonical fields; `readLegacyScheduleParts` is shared by both routes. Response serialization remains in `withScheduleCompatibility`.
- Behavior preserved: Tests cover canonical fixed/flexible/all-day shapes, legacy timezone/DST projection, canonical precedence, null handling, invalid values, and PATCH partial fields. Route paths, response shape, and schema are unchanged.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; twenty-two tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Parser tests alone do not prove persisted route behavior. The separate database-backed fixture below covers representative routes, but broader route and migration parity is still needed before API compatibility removal.
- Next recommended pass: Expand route-level parity coverage, then continue shared parsing/serialization.

### 2026-09-24 — Database-backed API and ordering baseline

- Pass: `Pass 0 — Contract and parity baseline` and `Pass 4 — Schedule ordering service` baseline only.
- Intent/current behavior: Capture representative persisted API and reorder behavior before shared route and ordering-service changes.
- Files changed: `tests/api-contract.integration.mjs`, `tests/order-contract.integration.mjs`, `docs/work/schedule-refactor.md`, `REFACTORING_TRACKER.md`.
- Structural improvement: Opt-in HTTP fixtures run against a temporary migrated PostgreSQL database and isolated production build; they create and clean up their own trip data.
- Behavior preserved: API fixture covers GET, POST, PATCH, DELETE, canonical/legacy schedule payloads, invalid requests, and response compatibility. Ordering fixture covers same-day forward insertion, cross-day fixed range movement, flexible placement, and current all-day failure behavior.
- Validation run: Ten Prisma migrations deployed to temporary PostgreSQL; both integration fixtures passed against an isolated `next start` build; `npm run check`, webpack build, and `git diff --check` run for source changes.
- Results: API fixture passed. Ordering fixture confirmed that multi-day all-day reorder returns HTTP 400. It attempts to assign `placementTime` to an all-day item, violating the database schedule constraint.
- Risks or follow-up: All-day reorder fix and Table all-day length semantics need product decisions. Broader parity coverage, runtime visual checks, and migration upgrades with real pre-refactor data remain outstanding.
- Next recommended pass: Resolve all-day behavior decisions; continue shared route and ordering extraction in independent passes.

### 2026-09-24 — All-day drag and reorder behavior

- Pass: `Pass 4 — Schedule ordering service` behavior fix, authorized by user clarification.
- Intent/current behavior: Multi-day all-day items currently fail with HTTP 400 through reorder because the route assigns flexible `placementTime`; Calendar and Itinerary can route all-day drops into flexible placement paths.
- Files changed: `app/api/travel-objects/reorder/route.ts`, `components/views/CalendarView.tsx`, `components/views/TripDaysView.tsx`, `components/layout/AppShell.tsx`, `tests/order-contract.integration.mjs`, `REFACTORING_TRACKER.md`, `docs/work/schedule-refactor.md`.
- Structural improvement: Calendar, Itinerary, and AppShell route all-day drops through date movement only. The reorder route rejects same-day and flexible-placement requests for all-day items and preserves their inclusive date span on cross-day moves.
- Behavior preserved: Existing fixed and flexible insertion and placement cases still pass the database-backed fixture. No schema or general API response-shape change.
- Validation run: `npm run check`; isolated `npx next build --webpack`; both HTTP integration fixtures against temporary migrated PostgreSQL; `git diff --check`.
- Results: Lint and TypeScript passed; twenty-two unit tests passed; webpack build passed; API and ordering fixtures passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Manual drag parity across Month, Week, Day, and Itinerary was not exercised. The all-day Table length choice remains pending.
- Next recommended pass: After the requested pause, decide all-day Table length behavior, then continue Pass 3 route coverage and Pass 4 ordering service extraction.

### 2026-09-24 — Canonical grouped moves

- Pass: `Pass 2 — Pure schedule-domain helpers`
- Intent/current behavior: Moving selected items together preserves each confirmed item's wall-clock offset from the dragged item. Flexible and undated items fall back to the target date/time.
- Files changed: `lib/schedule-domain.ts`, `components/layout/AppShell.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`.
- Structural improvement: `groupedMoveTarget` calculates selected-item targets from canonical date/time fields; `AppShell.moveSelectedItems` no longer reads compatibility timestamps.
- Behavior preserved: Fixed and all-day offsets, flexible/undated fallback, cross-day shifts, and existing timezone normalization are covered by tests. No API, schema, or persisted-format change.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; eleven schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime UI parity was not manually exercised. The current timezone converter normalizes nonexistent New York 02:30 on the spring DST transition to 01:30; this behavior was preserved, not corrected. Other UI consumers still read compatibility timestamps.
- Next recommended pass: Continue Pass 2 with remaining duration and schedule edits, then proceed to Pass 3.

### 2026-09-24 — Canonical item creation

- Pass: `Pass 2 — Pure schedule-domain helpers`
- Intent/current behavior: `AppShell.openCreateItem` creates undated, flexible, and fixed-time items; the fixed-time default lasts one elapsed hour and can cross midnight or a DST boundary. Creation still sends transitional timestamps.
- Files changed: `lib/schedule-domain.ts`, `components/layout/AppShell.tsx`, `tests/schedule-domain.test.mjs`, `REFACTORING_TRACKER.md`.
- Structural improvement: `oneHourEnd` calculates the default fixed-time end from canonical inputs. `AppShell.openCreateItem` now submits canonical fields for undated, flexible, and fixed-time items.
- Behavior preserved: The default remains one elapsed hour, including midnight and DST transitions. The create route and response compatibility shape were not changed.
- Validation run: `npm run check`; `npx next build --webpack` in an isolated temporary copy; `git diff --check`.
- Results: Lint and TypeScript passed; nine schedule tests passed; webpack build passed; diff check passed. Lint retains six existing image warnings.
- Risks or follow-up: Runtime creation parity was not manually exercised. Other UI writers still use transitional request fields; do not remove API compatibility yet.
- Next recommended pass: Continue Pass 2 with remaining duration and schedule edits, then proceed to Pass 3.
