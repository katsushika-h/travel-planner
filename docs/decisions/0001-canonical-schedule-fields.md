# ADR 0001: Persist separate schedule fields

**Status:** Accepted

**Decision:** Persist `date`, `endDate`, `startTime`, `endTime`, `placementTime`, and `dayOrder` on travel objects. Keep `startDateTime`, `endDateTime`, and `dayIndex` as derived API compatibility fields while the UI migration is incomplete.

**Why:** The product distinguishes unscheduled, all-day, confirmed-time, and flexibly placed items. A timestamp pair alone does not express those states, and a flexible visual placement must not imply a confirmed booking time.

**Consequence:** API writes validate schedule shapes and trip-timezone conversion. Reads derive the legacy fields. Schedule changes must preserve the distinction between confirmed times and flexible placement. `dayOrder` across Calendar and Itinerary still needs behavioral verification.
