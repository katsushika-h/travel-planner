# ADR 0003: Keep actual expenses separate from planned item costs

**Status:** Accepted (2026-09-28)

**Decision:** Store actual spending in an `Expense` table. Keep `TravelObject.cost` as an independent planned amount and do not backfill expenses from it. Expense amounts use PostgreSQL `Decimal(13,3)` and decimal strings in the API; aggregate exact thousandths by currency. Show one total per currency without exchange-rate conversion. An optional itinerary-item link uses `ON DELETE SET NULL`, while deleting a trip cascades to its expenses.

**Why:** An item cost does not prove that payment occurred. Separate records prevent planned and actual totals from being double-counted. Decimal strings preserve entered monetary values through the API and avoid binary floating-point addition in expense summaries.

**Consequences:** Clients must send positive amount strings with at most ten whole and three fractional digits. The first release has fixed categories and no budget targets, split payments, refunds, exchange rates, or receipt uploads. Existing cost data and schedule APIs remain unchanged.
