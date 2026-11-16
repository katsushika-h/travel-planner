# ADR 0003: Expense records, with hotel and flight costs counted as bookings

**Status:** Accepted (2026-09-28)

**Decision:** Store actual spending in an `Expense` table. Keep `TravelObject.cost` as an independent planned amount and do not backfill expenses from it. Expense amounts use PostgreSQL `Decimal(13,3)` and decimal strings in the API; aggregate exact thousandths by currency. Show one total per currency without exchange-rate conversion. An optional itinerary-item link uses `ON DELETE SET NULL`, while deleting a trip cascades to its expenses.

**Why:** An item cost does not prove that payment occurred. Separate records prevent planned and actual totals from being double-counted. Decimal strings preserve entered monetary values through the API and avoid binary floating-point addition in expense summaries.

**Consequences:** Clients must send positive amount strings with at most ten whole and three fractional digits. The first release has fixed categories and no budget targets, split payments, refunds, exchange rates, or receipt uploads. Existing cost data and schedule APIs remain unchanged.

**Amendment (2026-10-19):** Every itinerary item `cost` now counts as spend automatically, shown read-only beside logged expenses (hotels and flights as pre-trip spend, other items on their date), with the category taken from the item type (custom types become other). If any expense is linked to an item, its cost is skipped and the logged amounts win, so nothing is counted twice; log expenses linked to their items as the trip goes. Nothing is stored or backfilled; the bookings are derived from items on each render.

**Amendment (2026-10-19, combined total):** `Trip.exchangeRates` (nullable JSON, decimal strings keyed by currency code, rates into `defaultCurrency`) holds manual rates. When more than one currency is in use, Spend opens on an "All" tab that converts every entry into the default currency and labels the result approximate. A currency without a rate is left out and named, never guessed. Per-currency tabs stay exact, and no rate is fetched from a service. Changing `defaultCurrency` without new rates clears them, since they were stated against the old currency.

**Amendment (2026-11-16, types and display currency):** Expense categories are now the trip's itinerary types (built-in, custom and in use), so a flight's cost files under `flight` rather than `transport`. The API accepts any type string of up to 20 characters. Legacy categories stay in the database and are read as types (`accommodation` → `hotel`, `activities` → `activity`, `other` → `unclassified`; `transport`, `food` and `shopping` keep their names), with no migration. The "All" tab is gone: choosing any currency restates every expense and planned cost in it, converting through `defaultCurrency` with the stored rates; currencies without a rate are left out and named. Converted figures use the currency's usual precision.
