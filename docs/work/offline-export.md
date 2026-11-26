# Offline HTML trip export

**Status:** Complete.

**Goal:** Share one trip with someone who cannot reach the NAS: a single read-only HTML file they open in any browser.

**Scope:** `lib/trip-offline-html.ts` builds the file; `app/trips/[tripId]/offline/route.ts` downloads it; Trip menu → Export… → Offline copy (.html). No API, schema or dependency changes.

**Checklist:**
- [x] Itinerary tab: day strip, days in Plan order (reuses `createTripPrintModel`), day notes, undated Ideas, expandable stops with place, notes, linked expenses, attachments and Google Maps links.
- [x] Spending tab: same data as the app — logged expenses under their item type plus item costs with no logged expense (`bookedItemExpenses`) — as one dashboard per currency converted with the trip's exchange rates (`convertExpenses`, currencies without a rate named), type and daily bars, planned-cost comparison, and the full list with a type filter.
- [x] Attachments embedded as base64 `data:` download links, typed by `attachmentContentType`.
- [x] Light/dark from `prefers-color-scheme`; phone layout at 375 px.

**Findings:** Without scripts both tabs show one after the other and stops still expand (`<details>`); only the tab switch and expense filter need JavaScript. Only `http(s)` links are written; all text is HTML-escaped. Attachments make the file roughly 1.33× their size. No map: tiles and Nearby need a server and network.

**Verification:** `node --test tests/trip-offline-html.test.mjs`, `npm run check`; a sample trip rendered through the builder and checked in the browser at desktop and 375 px (tabs, expand, filter, currency switch, no horizontal scroll). The route was not exercised against a database because Docker was not running.

**Remaining work / next step:** Download from a real trip once the local database is up, and open the file on a phone.
