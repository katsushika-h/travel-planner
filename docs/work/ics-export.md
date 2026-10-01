# ICS calendar export

**Status:** Complete.

**Goal:** Download the active trip as a calendar file with one event per dated item.

**Scope:** A sidebar export button and a client-side ICS formatter. No API or database changes.

**Checklist:**
- [x] Convert confirmed trip-local times to UTC, including overnight ranges.
- [x] Export all-day and flexible items as date-valued events with an exclusive end date.
- [x] Include notes as `DESCRIPTION` and saved place details as `LOCATION`.
- [x] Escape and fold ICS text; omit unscheduled items.
- [x] Cover schedule, text, location, and omission behavior in tests.

**Current state:** Export downloads an `.ics` file for the loaded active trip. A flexible item's `placementTime` is ignored because it is not a confirmed time. If a location has no name or address, a saved Maps URL is used.

**Findings:** The app stores all-day end dates inclusively; ICS `DTEND` is exclusive. Confirmed times use the trip's IANA timezone for conversion to UTC.

**Verification:** `node --test tests/ics-export.test.mjs`, `npm run check` (57 tests; six existing image warnings), `npx next build --webpack`, and `git diff --check` passed.

**Remaining work / next step:** None.
