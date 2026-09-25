# CSV import and narrow Calendar follow-ups

**Status:** Complete (2026-09-25).

**Goal:** Make partial CSV imports visible and actionable, and keep Month cells readable at narrow widths.

**Scope:** Client import orchestration and feedback; Month layout only. No API, schema, or deployment change.

**Checklist**

- [x] Collect successful and failed CSV create results without losing successful rows.
- [x] Show successful rows immediately and report failed row titles and reasons.
- [x] Add custom event types only when a row with that type was saved.
- [x] Keep Month weekday headings aligned with a horizontally scrollable grid at narrow widths.
- [x] Keep the workspace usable at narrow widths with a compact sidebar and an expandable overlay.
- [x] Cover partial success in the import service test and run project checks.
- [x] Verify a partial upload and Month layout in a disposable browser trip.

**Current state:** A partial import returns confirmed created items and failed rows. The button adds the confirmed items to the active trip and reports rows whose result could not be confirmed; users should check the trip before retrying those rows. Month cells retain at least 100px each, with a shared sideways scroll for headings and weeks when needed. At narrow widths the sidebar starts as an icon rail and expands over the workspace on request. Week and Day layouts are unchanged.

**Verification:** `npm run check` passed 51 tests with six existing image warnings; an isolated webpack production build and `git diff --check` passed. In a 390px browser viewport, the sidebar started compact, opened as an overlay, and left a readable Month header and cells. The 700px Month grid scrolled horizontally inside a 296px visible area; weekday and date cell x-positions matched before and after scrolling. Desktop Month remained aligned. A three-row CSV uploaded through the browser with a temporary test-only 500 response for the middle row: two confirmed places appeared immediately and persisted after reload, and the banner named the unconfirmed row and test error. The API and ordering HTTP fixtures passed against the same isolated database.

**Next step:** None for these follow-ups.
