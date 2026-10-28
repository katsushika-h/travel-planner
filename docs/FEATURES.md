# Feature ideas

Potential features to implement after the POC. These are ideas, not commitments or a prioritized roadmap.

## Completed recently

- [x] **Reservation import** — create items from a PDF confirmation, an `.ics` invite, or schema.org JSON-LD in an `.eml` email or saved `.html` page, chosen through the Trip menu's Import… entry. Review and edit every field, with each PDF value's source shown, before creating; the original PDF, `.ics` or `.eml` file is attached. PDFs are read locally with label rules; image-only scans are not read (no OCR).
- [x] **Expense management** — record and edit actual trip spending, optionally link it to itinerary items, and view totals by currency and category alongside separate planned item costs.
- [x] **Unscheduled ideas** — create an item without a date, keep it in the Ideas panel, drag it onto a date, and remove its date to return it to Ideas.
- [x] **Travel document attachments** — upload, list, preview/download, and delete files on itinerary items. Current implementation stores file bytes in PostgreSQL and limits uploads to 20 MB.
- [x] **Google Maps saved-list import** — import Google Takeout CSV files through the Trip menu's Import… entry, preserve place metadata and Maps links, and map CSV categories to event types.
- [x] **Map view** — show items with extracted coordinates on an OpenStreetMap map with colored markers and day filters.
- [x] **3D map** — MapLibre map with extruded buildings, the OSM Carto palette in both themes, a 2D/3D toggle, and map-app gestures, on the Map tab and Plan's day map (ADR 0011, `docs/work/3d-map-poc.md`).
- [x] **Calendar schedule modes** — month, week, and day views with fixed-time items, flexible placement, drag/drop, resizing, and itinerary ordering. `dayOrder` still needs verification.
- [x] **CSV categorizing** — read the types categories from a CSV file and apply them to imported travel objects. Unmatched categories create new categories automatically.
- [x] **Undo** — reverse recently made changes (`lib/undo-stack.ts`, `components/layout/useUndo.ts`).
- [x] **Ideas panel on a hotkey** — Space shows or hides the Ideas panel with its search box focused; ideas are dragged into the itinerary from it. Opening it on mouseover is not implemented.
- [x] **Day notes** — notes attached to a day (ADR 0004, ADR 0005).
- [x] **Calendar export** — export the trip as an `.ics` file.
- [x] **PDF export** — a printable itinerary (`/trips/<id>/print`, Trip menu → Export… → Printable PDF) saved through the browser's print dialog: each day's items with times, places, notes and planned costs, a Google Maps link per item, and a Google Maps route link per day.
- [x] **Nearby recommendations** — the Map tab is a "Nearby" finder: food, sights or transit within 200–1000 m of a picked trip pin or the map centre, from the map tiles plus an on-click OpenStreetMap "Search more", with on-click place details, added as ideas (ADR 0012, `docs/work/recommendations.md`).
- [x] **Travel distance** — walking distance and time between consecutive stops, with parking suggestions for driving legs (`docs/work/travel-distance.md`).

## Open

- [ ] **Read-only offline and install to home screen** — service worker, web app manifest, and a per-trip IndexedDB snapshot so the trip can be read without a connection. Planned as phase 2 of `docs/work/today-and-offline.md`; it needs HTTPS on the NAS reverse proxy first (phase 0).
- [ ] **Export locations to Google My Maps** — export itinerary locations as an importable CSV or KML file.
- [ ] **Suggested-time auto-planning** — optionally calculate suggested times for flexible ordered activities using the day start, estimated durations, travel times, and existing fixed-time bookings; keep suggestions distinct from confirmed times until the user accepts them.
- [ ] **User accounts and trip ownership** — allow users to log in, create their own trips, and access only the trips they own instead of every trip in the database.
- [ ] **Reservation import gaps** — the PDF rules listed as not implemented in section 9 of `docs/work/reservation-pdf-extraction-recipe.md`, and OCR for image-only scans.
- [ ] **Public transit routing** — travel legs currently support only walking and driving.
- [ ] **Packing and to-do checklists** — per trip or per day.
- [ ] **Read-only share link** — let travel companions view a trip; depends on some form of access control.
- [ ] **Duplicate a trip or use it as a template** — for repeat trips.
- [ ] **Budget targets** — set a budget per expense category and compare it with actual spending.

## Out of scope for now

These were deliberately left out of earlier work and could be revisited:

- Offline edits (queued expenses or notes); offline is planned as read-only.
- Booking-reference and opening-hours fields.
- Weather and push notifications.
- Currency conversion; expense totals stay grouped by currency.
