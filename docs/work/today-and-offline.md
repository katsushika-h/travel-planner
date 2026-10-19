# Today mode and read-only offline

Status: Planned (2026-10-19). Nothing implemented. Phase 0 is a NAS configuration task for the user; phases 1–2 are code.

Goal: On the phone during a trip, open the app to a single Today screen (next stop, leave-by time, today's timeline, tonight's hotel), and keep that screen and the trip readable without signal.

Scope: a mobile-first `TodayView`, HTTPS access through the UGREEN NAS reverse proxy, a web app manifest, a service worker for the app shell, and a per-trip read-only snapshot in IndexedDB. Out of scope: offline edits (queued expenses/notes), booking-reference and opening-hours fields, weather, push notifications, bulk map-tile download.

## Findings

- Mobile bottom navigation is a five-slot grid (`components/layout/AppShell.tsx`, `aria-label="Mobile workspace"`): Day, Calendar, Places, Spend, More. A sixth slot does not fit at 320px (see `docs/work/mobile-ui-implementation.md`).
- Data reuse for Today: trip date and timezone (`Trip.timezone`, `lib/working-day.ts` for the shared working day), stop order and approximate flexible times (`lib/schedule-order.ts`), routed legs and parking (`lib/routed-legs.ts`, `RouteLeg` cache, used by `TripDaysView.tsx`), hotel day anchors (Plan/Day), full-screen mobile inspector (`ObjectInspectorPanel.tsx`).
- All data loads through client-side `fetch` in `lib/api-client.ts` / `components/layout/useTripData.ts`. There is no service worker, manifest, or local data copy.
- Next 16 `experimental.useOffline` (`node_modules/next/dist/docs/01-app/02-guides/offline-support.md`) only keeps navigations and Server Actions pending and retries them; it neither caches data nor covers client `fetch`. It does not solve this. The PWA guide (`.../progressive-web-apps.md`) points to Serwist for service-worker caching and requires HTTPS.
- Service workers and install-to-home-screen need a secure context. `docker-compose.nas.yml` serves plain HTTP on `3030:3000`, so a phone on `http://<nas>:3030` cannot register a service worker. Access must go through the HTTPS domain.
- The Dockerfile builds with webpack (`output: "standalone"`), so pick a service-worker setup that works with the webpack build (Serwist has webpack and Turbopack examples).
- OpenStreetMap tile policy forbids bulk prefetching. Only tiles the user has already viewed may be cached. Directions links open Google Maps, which has its own offline maps.
- The app has no authentication (AGENTS.md). Anything the reverse proxy exposes to the internet is readable and writable by anyone who finds the domain.

## Decisions (defaults until the user says otherwise)

- Today replaces the **Day** slot (label and icon) while today's date, in the trip timezone, is within the active trip; otherwise the slot stays Day. Today has a "Full itinerary" link to the continuous Day view. During a trip the app opens on Today on phone widths.
- Desktop gets no new screen; a later pass may add a Today button that opens Plan on today's date.
- "Done" is derived from the clock (end time, or start time + 1 h for items without an end), recomputed every minute; nothing is persisted.
- Leave-by = next stop start − routed leg seconds − 10 min buffer, shown only when the next stop has a confirmed start time and a routed leg. Flexible stops show their `~` time and no leave-by.
- Offline is read-only. While offline, editing controls are disabled with a short reason; no write is queued.
- The snapshot covers the active trip only, refreshed after each successful load and save. Attachments are offline only after an explicit "Save for offline" per trip.

## Phase 0 — HTTPS through the UGREEN reverse proxy (user, on the NAS)

UGOS menu names were not verified from documentation; confirm them on the device.

- [ ] Point the domain (or a subdomain such as `trips.<domain>`) at the NAS public IP / DDNS, and forward router port 443 (and 80 if the certificate uses the HTTP challenge) to the NAS.
- [ ] In UGOS, obtain a Let's Encrypt certificate for that hostname (UGOS certificate settings), or import one. Confirm automatic renewal is on.
- [ ] In the UGOS reverse proxy, add a rule: source `https://trips.<domain>:443` → destination `http://localhost:3030`, using that certificate. Enable WebSocket support if offered (needed only for `next dev`, harmless otherwise).
- [ ] Turn on HTTP → HTTPS redirect for the hostname.
- [ ] Protect the hostname, because the app has no login. Options, in order of preference: restrict the rule to trusted IPs/VPN if UGOS allows it; enable access control / basic auth on the proxy rule if UGOS offers it; otherwise decide whether to add app authentication first (`docs/FEATURES.md`, user accounts). Note: basic auth in front of an installed iOS web app can prompt repeatedly; test it on the phone before relying on it.
- [ ] Check from the phone on mobile data: `https://trips.<domain>` loads, the padlock shows a valid certificate, and `https://trips.<domain>/api/trips` returns JSON.
- [ ] Tell the coordinator the final hostname and which protection was chosen.

## Phase 1 — Today view (code, no offline)

- [ ] Pure logic in `lib/today.ts` with `tests/today.test.mjs`: `isTripInProgress(trip, now)`, `todayDate(trip, now)` (trip timezone), `todayTimeline(items, date, now)` → past/next/upcoming with derived done state, `leaveBy(next, legSeconds, bufferMinutes)`.
- [ ] `components/views/TodayView.tsx`: next-stop card (title, time, type colour, leg time, parking, Directions = item Maps link, attachments link), "Rest of today" list, tonight's hotel row, quick actions (log expense → existing expense form linked to the item; add note; map). Reuse the routed-legs fetch used by Plan; do not add a second routing path.
- [ ] Mobile nav: swap Day → Today while the trip is in progress; open Today by default on phone widths during the trip. Keep `activeTab`/`calendarMode` semantics; add a `today` tab to `store/use-travel-store.ts` only if the swap cannot reuse existing state.
- [ ] Empty states: no items today; trip not started (show days until start and first stop); last day.
- [ ] Add the Today entry to `lib/keyboard-shortcuts.ts` only if a desktop shortcut is added.
- [ ] Browser check at 320px and 390px, light and dark, on the retained QA trip with the clock faked to a trip date.

## Phase 2 — Read-only offline (code, after phase 0)

- [ ] `app/manifest.ts` (name, icons in `public/`, `display: "standalone"`, theme colours from the tokens) so the app installs to the home screen.
- [ ] Service worker via Serwist (webpack): precache the app shell and static assets; network-first for `/api/*` with no API response caching in the worker (the snapshot handles data). Serve `sw.js` with `Cache-Control: no-cache` and a strict `Content-Security-Policy` per the Next PWA guide. Register it only in production builds.
- [ ] `lib/offline-snapshot.ts` (IndexedDB): save `{trip, items, expenses, routeLegs, savedAt}` for the active trip after each successful load/save; load it when the trip request fails. Tests for the pure merge/staleness logic.
- [ ] Offline state in `useTripData.ts`: when serving the snapshot, show a banner "Offline · last synced HH:MM" and disable edit controls (inspector inputs, drag, create, delete, paste, duplicate, undo). Re-fetch on `online`.
- [ ] "Save for offline" in the trip menu: fetch the trip's attachments into Cache Storage with a total-size readout and a remove action. Request `navigator.storage.persist()`.
- [ ] Keep only viewed OSM tiles (runtime cache with an entry cap); never prefetch tiles.
- [ ] Verify with `npx next build --webpack` + `npm start` behind HTTPS (or `next dev --experimental-https` locally): install, go offline in devtools, reload, open Today and an attachment.
- [ ] Add an ADR for the offline approach (snapshot in IndexedDB, read-only, Serwist) once phase 2 lands.

## Remaining work and next step

Next step: the user completes phase 0 and confirms the hostname and protection. Phase 1 can start in parallel because it needs no HTTPS. Offline edits (queue expenses and notes, temp-id mapping for creates; reorders stay online-only) are a later handoff.

## Verification

None yet; this is a plan.
