# ADR 0001: Persist separate schedule fields

**Status:** Accepted

**Decision:** Persist `date`, `endDate`, `startTime`, `endTime`, `placementTime`, and `dayOrder` on travel objects. The temporary derived API compatibility fields were removed in [ADR 0002](0002-canonical-schedule-api.md). Active UI schedule reads use canonical fields.

**Why:** The product distinguishes unscheduled, all-day, confirmed-time, and flexibly placed items. A timestamp pair alone does not express those states, and a flexible visual placement must not imply a confirmed booking time.

**Consequence:** API writes validate schedule shapes and trip-timezone conversion. Schedule changes must preserve the distinction between confirmed times and flexible placement. Calendar and Itinerary ordering is covered by database-backed and browser parity checks.
