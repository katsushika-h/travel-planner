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

## Current baseline

Baseline captured on 2026-09-22:

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

Status: **In progress — move, grouped move, resize, placement, creation, classification, and Table duration/start helpers extracted; other schedule decisions still inline**

Current behavior: Date conversion, duration calculations, schedule-shape decisions, and legacy fallbacks are repeated across multiple components and routes.

Structural improvement: Extract pure helpers for unscheduled, all-day, flexible, fixed-time, multi-day, timezone, and duration behavior. Keep function inputs and outputs explicit.

Validation: Add or run tests for every schedule shape, timezone/DST boundaries, invalid ranges, and canonical-to-compatibility serialization.

### Pass 3 — Shared API parsing and serialization

Status: **In progress — shared schedule-field parsing underway; route behavior remains separate**

Current behavior: Create and update routes independently parse canonical and legacy payloads, validate JSON fields, and construct persistence data.

Structural improvement: Centralize request parsing and travel-object response serialization while preserving route paths, status codes, error behavior, and compatibility fields.

Validation: Contract tests or fixtures for GET, POST, PATCH, DELETE, invalid payloads, legacy payloads, null fields, and response shapes.

### Pass 4 — Schedule ordering service

Status: **In progress — transaction-oriented normalization and reorder extraction complete; broader ordering parity remains**

Current behavior: `dayOrder` normalization and movement behavior are distributed across create, update, reorder, Calendar, Kanban, and Itinerary paths. Ordering is a known risk area.

Structural improvement: Move reorder and affected-date normalization into one transaction-oriented service. Preserve existing explicit-order and timed-item ordering rules unless a behavior fix is separately approved.

Validation: Database-backed checks for insert, same-day reorder, cross-day reorder, flexible placement, clear-time drops, multi-day items, deletion, and migration upgrades using real pre-refactor data.

### Pass 5 — AppShell decomposition

Status: **In progress — sorting, trip/item loading, save queue, and selection extracted; view actions remain**

Current behavior: `AppShell` coordinates data loading, selection, optimistic edits, debounced persistence, deletes, keyboard shortcuts, scheduling mutations, and all view rendering.

Structural improvement: Extract focused hooks/services such as trip data loading, travel-object mutation queues, selection state, and pure schedule actions. Preserve existing component-level APIs.

Validation: Manual parity checks for trip switching, selection and multi-selection, inspector opening, debounced edits, delete confirmation, keyboard shortcuts, and save failures.

### Pass 6 — Canonical view data boundaries

Status: **In progress — active views and optimistic writes use canonical fields; API compatibility remains**

Current behavior: Several UI surfaces still read deprecated `startDateTime`, `endDateTime`, and `dayIndex` compatibility fields.

Structural improvement: Migrate consumers to canonical schedule fields and pass explicitly named collections to each view. Keep compatibility fields at the API boundary until all consumers are migrated.

Validation: Month/week/day Calendar behavior, unscheduled drawer behavior, Table editing, Kanban moves, Itinerary filtering and ordering, and Inspector edits must remain unchanged.

Exit condition: once repository-wide searches confirm that no UI, importer, API client, or internal helper consumes the compatibility fields, remove `startDateTime`, `endDateTime`, and `dayIndex` from shared client types and API responses in a dedicated API-contract change. Do not leave these fields in the normal response shape indefinitely.

### Pass 7 — Shared view primitives

Status: **Not started**

Current behavior: Calendar contains several mode-specific behaviors; Day and global Map surfaces independently configure Leaflet; item display logic is repeated.

Structural improvement: Extract shared item cards, schedule labels, type-color helpers, map configuration, and focused mode components without merging distinct user experiences.

Validation: Visual/manual checks across all Calendar modes, global Map filters, marker selection, responsive layouts, and inspector synchronization.

### Pass 8 — CSV/import decomposition

Status: **In progress — pure parsing extracted; unresolved-link and live-import parity remain**

Current behavior: `ImportGoogleMapsCsvButton.tsx` owns parsing, scheduling, Maps resolution, concurrency, persistence, progress, and rendering.

Structural improvement: Move pure CSV and schedule parsing into testable library modules. Keep the component responsible for file selection, progress, and user feedback.

Validation: Fixtures for quoted CSV fields, malformed dates/times, categories, custom types, unresolved Maps links, empty rows, and imported object parity.

### Pass 9 — Type and documentation alignment

Status: **In progress — explicit item request types underway; documentation alignment remains**

Current behavior: `api.updateObject` accepts broad `Partial<TravelObject>` data, and project documentation describes superseded architecture and schema details.

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

- Removing legacy API request/response fields or changing public route contracts.
- Removing schedule compatibility fields: after canonical consumers are migrated and parity checks pass, delete `startDateTime`, `endDateTime`, and `dayIndex` from the client types, serializers, response payloads, and legacy request parsing. Treat this as an explicit API migration with updated fixtures and release notes; do not remove the fields during an intermediate structural refactor.
- Rewriting or squashing Prisma migration history.
- Changing schedule columns, constraints, or attachment storage.
- Moving attachments from PostgreSQL bytes to object storage.
- Adding authentication or trip ownership.
- Upgrading Next.js, React, Prisma, Tailwind, or other dependencies.
- Introducing a test framework as a broad tooling change.
- Replacing the current Leaflet/OpenStreetMap or Google Maps integration.

## Work log

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
