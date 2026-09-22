# Feature ideas

Potential features to implement after the POC. These are ideas, not commitments or a prioritized roadmap.

## Completed recently

- [x] **Travel document attachments** — upload, list, preview/download, and delete files on itinerary items. Current implementation stores file bytes in PostgreSQL and limits uploads to 20 MB.
- [x] **Google Maps saved-list import** — import Google Takeout CSV files, preserve place metadata and Maps links, and map CSV categories to event types.
- [x] **Map view** — show items with extracted coordinates on a Leaflet/OpenStreetMap map with colored markers and day filters.
- [x] **Calendar schedule modes** — month, week, and day views with fixed-time items, flexible placement, drag/drop, resizing, and itinerary ordering. `dayOrder` still needs verification.

- [x] **CSV categorizing** — read the types categories from a CSV file and apply them to imported travel objects. Unmatched categories create new categories automatically.
- [ ] **Undo** — allow recently made changes to be reversed.
- [ ] **Rethink the unscheduled panel** — Something like a panel that the use can open with a hotkey, like Space button. Brainstormed locations will be here, and the user can add them to the itinerary by dragging them in. This dock will be accessible with mouseover as well.
  - [ ] **Notes function** - User should be able to put notes, maybe only in the day view 
- [ ] **Export locations to Google My Maps** — export itinerary locations as an importable CSV or KML file.
- [ ] **Suggested-time auto-planning** — optionally calculate suggested times for flexible ordered activities using the day start, estimated durations, travel times, and existing fixed-time bookings; keep suggestions distinct from confirmed times until the user accepts them.
- [ ] **User accounts and trip ownership** — allow users to log in, create their own trips, and access only the trips they own instead of every trip in the database.
