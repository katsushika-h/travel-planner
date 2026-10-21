# PDF itinerary export

**Status:** Complete.

**Goal:** Save the active trip as an easy-to-read PDF with clickable Google Maps links.

**Scope:** A server-rendered print page and a Trip menu link. No API, schema or dependency changes.

**Checklist:**
- [x] `lib/trip-print.ts` builds the day-by-day model: Plan-view order, multi-day items in full on their first day and as "Continued" lines after, plain-text notes and day notes, planned costs and per-currency totals.
- [x] Per-item Maps link (saved URL → name/address → coordinates) and per-day route link through `dayRouteStops`.
- [x] `app/trips/[tripId]/print` renders a fixed light, print-styled page and opens the print dialog on load.
- [x] Trip menu → Export PDF opens it in a new tab.

**Findings:** Browser "Save as PDF" was chosen over a PDF library because trips contain Japanese text, which standard PDF fonts cannot render without embedding a large font. Chrome keeps the anchors as PDF link annotations. Route links use the `/maps/dir/<stop>/…` path form, which allows more stops than the `waypoints` parameter. Notes are Markdown, so they print through `markdownToPlainText`, which now also decodes numeric character references such as `&#x20;`.

**Verification:** `node --test tests/trip-print.test.mjs tests/text-utils.test.mjs`, `npm run check`, `npx next build --webpack`; headless Chrome `--print-to-pdf` of a seeded trip produced a 3-page PDF with Japanese text and 31 link annotations.

**Remaining work / next step:** None.
