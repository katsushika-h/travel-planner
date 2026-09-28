# Expense management implementation plan

**Status:** Planned; scope pending confirmation.

**Goal:** Record actual trip spending and see where it went, while preserving itinerary item `cost` as a planned estimate.

**Scope:** A trip-level Expenses view with create, edit, delete, filtering, and totals. Expenses can optionally link to an itinerary item. No currency conversion, shared payments, or receipt uploads in the first release.

## Proposed behavior

- Each expense has a description, date, amount, currency, category, optional notes, and optional linked itinerary item. Dates may fall outside the trip range for advance bookings.
- Show total actual spending by currency and category. Show the existing itinerary cost totals separately as planned amounts; never add planned and actual figures together.
- Default a new expense to the trip currency. Display separate totals for each currency; do not imply that mixed-currency values are directly comparable.
- Start with accommodation, transport, food, activities, shopping, and other categories. Do not backfill expenses from item costs: those values do not establish that money was spent.
- Deleting an itinerary item leaves its expenses in place and clears their link. Deleting a trip deletes its expenses.
- The Expenses view remains trip-specific and handles empty, loading, save-error, and delete-confirmation states.

## Executable checklist

- [ ] Confirm the first-release scope: actual expenses plus existing planned costs, actual expenses only, or full budgeting.
- [ ] Add an `Expense` Prisma model and migration with trip cascade deletion, optional travel-object link with `SetNull`, date-only storage, indexed trip/date queries, and a precise decimal amount. Add an ADR if the amount representation or accounting semantics become a durable cross-feature contract.
- [ ] Add shared expense request/response types and validation. Accept a decimal string for amount and return it as a string to avoid floating-point rounding; validate sign, precision, currency, category, date, and linked item belonging to the active trip.
- [ ] Add trip-scoped list/create routes and expense-ID read/update/delete routes. Return consistent 400/404 errors and date-only API values. Keep database writes authoritative; do not use persisted Zustand state for expenses.
- [ ] Extend `lib/api-client.ts` and add a trip-keyed expense loading/mutation hook so a pending response from a previous trip cannot overwrite the active trip's data.
- [ ] Add an Expenses workspace tab and a focused view with summary, entry form, sortable/filterable list, editing, and deletion. Reuse existing dialog/input patterns and support narrow screens.
- [ ] Add pure aggregation and formatting helpers for per-currency totals and category breakdowns. Keep planned item costs visually distinct from actual expenses and follow Table's existing per-currency grouping without inheriting its filtered-visible total.
- [ ] Add behavioral tests for amount precision, currency grouping, filters, linked-item validation, trip isolation, deletion behavior, and API CRUD. Verify a fresh migration and a manual browser flow across two trips.
- [ ] Run `npm run check`, `npx next build --webpack`, and `git diff --check`; record only checks actually run. Do not build or push Docker images unless deployment is requested.

**Current state:** `Trip.defaultCurrency` exists; itinerary objects have a nullable JSON `cost` with numeric amount/currency; Table shows filtered cost totals by currency. There is no Expense table, expense API, or expense view. Current uncommitted ICS export/import changes are unrelated and must be preserved.

**Remaining work / next step:** Confirm scope, then implement the data model and API before the workspace view. Update this handoff after each completed pass.
