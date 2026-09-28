# Expense management

**Status:** Complete (2026-09-28).

**Goal:** Track actual trip spending independently of planned itinerary-item costs.

**Scope:** A trip-level Expenses view with create, edit, delete, search, category/currency filters, sorting, optional itinerary-item links, and per-currency/category summaries. Budget targets, exchange rates, split payments, refunds, and receipt uploads are outside this release.

## Checklist

- [x] Add the `Expense` Prisma model and migration with trip cascade deletion, optional item link with `SetNull`, date-only storage, indexes, and precise decimal amount.
- [x] Validate and serialize decimal-string amounts, dates, currency, category, notes, and same-trip item links in the expense API.
- [x] Add trip-scoped list/create and expense-ID read/update/delete routes, client calls, and a trip-keyed view whose pending load cannot replace another trip's data.
- [x] Add a responsive Expenses workspace tab, entry form, list controls, summaries, error states, and delete confirmation.
- [x] Keep planned item costs separate, with no backfill or cross-currency conversion. Record the contract in [ADR 0003](../decisions/0003-expense-records.md).
- [x] Add unit tests and an HTTP integration fixture; apply the full migration chain and manually check create, edit, reload, filtering, and trip switching in the browser.

**Current state:** Actual expenses are persisted as `Decimal(13,3)` and exposed as strings with three fractional digits. The view groups actual totals by currency and category; planned costs come from all itinerary items and appear in a separate card. Expense dates may precede the trip for advance bookings. Deleting a linked item retains the expense and clears its link.

**Findings:** `TravelObject.cost` cannot be treated as a payment record. The existing Table total is filtered to visible items, so the Expenses view calculates whole-trip planned costs independently. This release uses the recommended first-release scope from the plan when implementation was requested.

**Verification:** `npx prisma validate`, `npx prisma generate`, `npm run check` (60 tests; six existing image warnings), `npx next build --webpack`, and `git diff --check` passed. All 11 migrations applied to a disposable PostgreSQL database. `API_BASE_URL=http://127.0.0.1:<port> node tests/expense-contract.integration.mjs` passed against that database and the production build. In a disposable browser trip, expense creation, editing, reload persistence, search filtering, and switching to an empty second trip and back behaved as expected. A narrow viewport was not browser-tested.

**Docker delivery (2026-09-28):** Built and pushed `hokusaik/travel-planner-app:latest` (digest `sha256:57381e4650e8fde06d9ec40d7f305f3812056645ca4fbddd167804a75f27bd39`) and `hokusaik/travel-planner-migrator:latest` (digest `sha256:8d38e81d431e94affd0977c0e42889889b8050962e37e45cfbca906f1356b5c4`). Local image inspection and remote `docker buildx imagetools inspect` confirmed `linux/amd64` for both. The existing “MacOS Test Trip” had 28 items with empty costs; random SGD costs between 10 and 500 were saved on exactly 14 items. No NAS deployment was performed.

**Remaining work / next step:** None for this release. If budgeting or refunds are requested, define their accounting rules before extending the model.
