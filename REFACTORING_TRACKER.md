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

- `components/trip/CreateItemDialog.tsx` appears to have no source import or runtime reference. Confirm reachability before deleting it.
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

Status: **Complete — baseline captured; parity artifacts still to create**

Current behavior: Calendar, Kanban, Itinerary, Table, Map, attachments, CSV import, unscheduled items, flexible scheduling, and legacy schedule compatibility are all active behavior.

Structural improvement: Create a behavior matrix, API fixtures, and representative seed data before changing implementation structure.

Validation: Run lint, TypeScript, webpack build, and the parity checklist. Record existing warnings separately from new warnings.

### Pass 1 — Verified dead-code cleanup

Status: **Not started**

Current behavior: Unreferenced modules do not affect the runtime, but stale files make ownership and future changes less clear.

Structural improvement: Confirm and remove only verified dead application code. Handle tracked `.next` artifacts in a separate repository-maintenance change.

Validation: Search imports/references with `rg`, run TypeScript and the webpack build, and confirm no route or UI behavior changes.

Likely first target: `components/trip/CreateItemDialog.tsx`.

### Pass 2 — Pure schedule-domain helpers

Status: **Not started**

Current behavior: Date conversion, duration calculations, schedule-shape decisions, and legacy fallbacks are repeated across multiple components and routes.

Structural improvement: Extract pure helpers for unscheduled, all-day, flexible, fixed-time, multi-day, timezone, and duration behavior. Keep function inputs and outputs explicit.

Validation: Add or run tests for every schedule shape, timezone/DST boundaries, invalid ranges, and canonical-to-compatibility serialization.

### Pass 3 — Shared API parsing and serialization

Status: **Not started**

Current behavior: Create and update routes independently parse canonical and legacy payloads, validate JSON fields, and construct persistence data.

Structural improvement: Centralize request parsing and travel-object response serialization while preserving route paths, status codes, error behavior, and compatibility fields.

Validation: Contract tests or fixtures for GET, POST, PATCH, DELETE, invalid payloads, legacy payloads, null fields, and response shapes.

### Pass 4 — Schedule ordering service

Status: **Not started**

Current behavior: `dayOrder` normalization and movement behavior are distributed across create, update, reorder, Calendar, Kanban, and Itinerary paths. Ordering is a known risk area.

Structural improvement: Move reorder and affected-date normalization into one transaction-oriented service. Preserve existing explicit-order and timed-item ordering rules unless a behavior fix is separately approved.

Validation: Database-backed checks for insert, same-day reorder, cross-day reorder, flexible placement, clear-time drops, multi-day items, deletion, and migration upgrades using real pre-refactor data.

### Pass 5 — AppShell decomposition

Status: **Not started**

Current behavior: `AppShell` coordinates data loading, selection, optimistic edits, debounced persistence, deletes, keyboard shortcuts, scheduling mutations, and all view rendering.

Structural improvement: Extract focused hooks/services such as trip data loading, travel-object mutation queues, selection state, and pure schedule actions. Preserve existing component-level APIs.

Validation: Manual parity checks for trip switching, selection and multi-selection, inspector opening, debounced edits, delete confirmation, keyboard shortcuts, and save failures.

### Pass 6 — Canonical view data boundaries

Status: **Not started**

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

Status: **Not started**

Current behavior: `ImportGoogleMapsCsvButton.tsx` owns parsing, scheduling, Maps resolution, concurrency, persistence, progress, and rendering.

Structural improvement: Move pure CSV and schedule parsing into testable library modules. Keep the component responsible for file selection, progress, and user feedback.

Validation: Fixtures for quoted CSV fields, malformed dates/times, categories, custom types, unresolved Maps links, empty rows, and imported object parity.

### Pass 9 — Type and documentation alignment

Status: **Not started**

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
