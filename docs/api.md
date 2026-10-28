# HTTP API reference

The route handlers in `app/api/` are the source of truth; this page summarizes them. Request validation lives in `lib/api-validation.ts`, `lib/api-schedule.ts`, `lib/note-validation.ts`, `lib/expense-validation.ts`, and `lib/route-leg-validation.ts`. Browser code calls the API through `lib/api-client.ts`.

## Conventions

- **No authentication.** Every route acts on IDs directly; there is no user or ownership check.
- **JSON in and out.** Send `Content-Type: application/json` on writes. Attachment uploads use `multipart/form-data`.
- **Errors** return `{ "error": "<message>" }`. Validation failures are `400`, missing records `404`, upstream service failures `502`, and unconfigured services `503`.
- **Success codes:** `200` for reads and updates, `201` for creates, `204` with no body for deletes.
- **Partial updates.** `PATCH` changes only the fields you send. Send `null` to clear a nullable field. An empty update returns `400` ("Provide at least one field to update.").
- **Dates and times.** Schedule and expense dates are `YYYY-MM-DD`. Times are 24-hour `HH:MM`. `placementTime` must fall on a 15-minute interval. Trip `startDate`/`endDate` are sent as `YYYY-MM-DD` but returned as ISO timestamps at midnight UTC.
- **Removed keys.** Item create, update, and reorder reject `startDateTime`, `endDateTime`, and `dayIndex` (ADR 0002).

```bash
curl -s http://localhost:3000/api/trips
curl -s -X PATCH http://localhost:3000/api/travel-objects/<objectId> \
  -H 'Content-Type: application/json' -d '{"date":"2026-12-01","startTime":"09:30","endTime":"11:00"}'
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/api/trips` | List or create trips |
| GET, PATCH, DELETE | `/api/trips/{tripId}` | Read, update, or delete a trip |
| GET, POST | `/api/trips/{tripId}/expenses` | List or create a trip's expenses |
| GET, PATCH, DELETE | `/api/expenses/{expenseId}` | Read, update, or delete an expense |
| GET, POST | `/api/travel-objects` | List a trip's items, or create one |
| GET, PATCH, DELETE | `/api/travel-objects/{objectId}` | Read, update, or delete an item |
| POST | `/api/travel-objects/reorder` | Move an item to a day and position |
| GET, POST | `/api/travel-objects/{objectId}/attachments` | List or upload attachments |
| GET, DELETE | `/api/travel-objects/{objectId}/attachments/{attachmentId}` | Download or delete an attachment |
| POST | `/api/maps/resolve` | Expand a Google Maps link and extract coordinates |
| POST | `/api/route-legs` | Walking or driving distances between points |
| GET | `/api/parking` | Parking near a point |
| GET | `/api/nearby` | Named OpenStreetMap places around a point |
| GET | `/api/place-details` | Details for an OpenStreetMap place |

## Trips

**Trip** response:

```json
{
  "id": "uuid",
  "title": "Japan Kyushu 2026",
  "startDate": "2026-11-30T00:00:00.000Z",
  "endDate": "2026-12-09T00:00:00.000Z",
  "timezone": "Asia/Tokyo",
  "defaultCurrency": "JPY",
  "createdAt": "2026-10-10T06:31:18.300Z"
}
```

`GET /api/trips` returns all trips ordered by `startDate`, then newest first.

`POST /api/trips` body:

| Field | Rules |
| --- | --- |
| `title` | Required, non-empty, at most 50 characters |
| `startDate`, `endDate` | Required `YYYY-MM-DD`; `endDate` on or after `startDate` |
| `timezone` | Required IANA name, such as `Asia/Tokyo` |
| `defaultCurrency` | Optional three-letter uppercase code; anything else falls back to `SGD` |

`PATCH /api/trips/{tripId}` accepts the same fields, all optional. An invalid `defaultCurrency` is rejected rather than replaced. The date-order rule is checked against the stored dates.

`DELETE /api/trips/{tripId}` deletes the trip and, by cascade, its items, attachments, and expenses.

## Travel objects (items)

An item is either an event (`kind: "event"`, the default) or a day note (`kind: "note"`).

**Item** response (the stored row, with `date` and `endDate` as `YYYY-MM-DD`):

```json
{
  "id": "uuid",
  "tripId": "uuid",
  "kind": "event",
  "title": "Kumamoto Castle",
  "type": "sightseeing",
  "noteBody": null,
  "date": "2026-12-01",
  "endDate": "2026-12-01",
  "startTime": null,
  "endTime": null,
  "placementTime": "10:00",
  "dayOrder": 0,
  "isAllDay": false,
  "headerImage": null,
  "location": { "name": "Kumamoto Castle", "lat": 32.806, "lng": 130.706, "googleMapsUrl": "https://..." },
  "cost": { "amount": 800, "currency": "JPY" },
  "notes": null,
  "tags": ["castle"],
  "createdAt": "...",
  "updatedAt": "..."
}
```

`GET /api/travel-objects?tripId={tripId}` lists the trip's items ordered by `date`, `dayOrder`, then creation time. `tripId` is required; an unknown trip returns `404`.

`GET /api/travel-objects/{objectId}` returns one item plus `trip: { timezone, startDate }`.

### Event fields

| Field | Rules |
| --- | --- |
| `tripId` | Required on create |
| `title` | Required on create, at most 100 characters |
| `type` | Free text, at most 20 characters; defaults to `unclassified` |
| `headerImage` | `http`/`https` URL or `null` |
| `location` | Object or `null`. Common keys: `name` (at most 300 characters), `address`, `googleMapsUrl`, `placeId`, `lat`, `lng`, `parking` (`{ name?, lat, lng }` or `null`). See `LocationData` in `types/travel.ts` |
| `cost` | `{ amount, currency }` or `null`. Planned cost: non-negative number with at most 10 digits and a three-letter code. Separate from expenses |
| `notes` | Text up to 2,500 bytes, or `null` |
| `tags` | Array of strings. Each string is split on whitespace and duplicates removed; at most 10 tags of 50 characters each |

### Schedule fields

| Field | Meaning |
| --- | --- |
| `date` | Start day, or `null` for an unscheduled idea |
| `endDate` | Last day; defaults to `date` |
| `startTime`, `endTime` | Confirmed times. Set both or neither; on a single day `endTime` must be after `startTime` |
| `isAllDay` | All-day items cannot have times |
| `placementTime` | Visual position for a flexible item (no confirmed times), not a booking time. Defaults to `09:00` when a dated item has no times |
| `dayOrder` | Position within the day, from 0. The server renumbers each affected day after a change |

Unscheduled items (`date: null`) cannot have `endDate`, `placementTime`, or `isAllDay`. Clearing `date` in a `PATCH` also clears those fields and `dayOrder`. Setting confirmed times clears `placementTime`; sending both returns `400`.

### Notes

Create a note with `kind: "note"`. Notes accept only `tripId`, `kind`, `type` (must be `unclassified`), `title` (defaults to `Note`), `noteBody` (at most 500 characters), and the schedule fields. A note stays flexible: no `startTime`, `endTime`, or `isAllDay`, and `endDate` must equal `date`. On create, `dayOrder` places the note at that position. `noteBody` is rejected on events, and `kind` cannot be changed by `PATCH`.

### Create, update, delete

- `POST /api/travel-objects` creates an item and returns it with `201`.
- `PATCH /api/travel-objects/{objectId}` updates any of the fields above except `tripId` and `kind`.
- `DELETE /api/travel-objects/{objectId}` deletes the item and renumbers its day.

### Reorder

`POST /api/travel-objects/reorder` moves an item to a day and position and returns **all of the trip's items** in list order.

| Field | Rules |
| --- | --- |
| `tripId`, `objectId` | Required |
| `date` | Required destination day, `YYYY-MM-DD` |
| `dayOrder` | Required position from 0, counted in the destination day's visible order |
| `clearTime` | Optional `true` turns a timed item into a flexible one |
| `placementTime` | Optional new placement time for a flexible item |

Multi-day items keep their length when moved. All-day items can only move to another day.

## Attachments

Files are stored in PostgreSQL. Each is at most 20 MB. Allowed extensions: `jpg`, `jpeg`, `png`, `gif`, `webp`, `pdf`, `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `txt`, `csv`, `ics`, `eml`. The served content type comes from the extension, never from the uploader.

- `GET /api/travel-objects/{objectId}/attachments` lists `{ id, fileName, contentType, size, createdAt }`, newest first.
- `POST /api/travel-objects/{objectId}/attachments` uploads one file in the `file` form field and returns its metadata with `201`.

  ```bash
  curl -s -F file=@booking.pdf http://localhost:3000/api/travel-objects/<objectId>/attachments
  ```

- `GET .../attachments/{attachmentId}` returns the file inline; add `?download=1` to download it.
- `DELETE .../attachments/{attachmentId}` deletes it.

## Expenses

Actual spending, separate from an item's planned `cost` (ADR 0003).

**Expense** response:

```json
{
  "id": "uuid",
  "tripId": "uuid",
  "travelObjectId": null,
  "description": "Train to Kumamoto",
  "date": "2026-12-01",
  "amount": "3500.000",
  "currency": "JPY",
  "category": "transport",
  "notes": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

| Field | Rules |
| --- | --- |
| `description` | Required on create, at most 100 characters |
| `date` | Required on create, `YYYY-MM-DD` |
| `amount` | Required on create. Positive **decimal string**, at most 10 whole and 3 fractional digits, such as `"12.5"`. Returned with three decimals |
| `currency` | Required on create, three-letter uppercase code |
| `category` | Required on create: `accommodation`, `transport`, `food`, `activities`, `shopping`, or `other` |
| `notes` | Up to 2,500 bytes; `null` or `""` clears it |
| `travelObjectId` | Optional linked item, which must belong to the same trip; `null` unlinks |

- `GET /api/trips/{tripId}/expenses` lists expenses, newest date first.
- `POST /api/trips/{tripId}/expenses` creates one (`201`).
- `GET`, `PATCH`, `DELETE /api/expenses/{expenseId}` read, update, or delete one.

Deleting a linked item keeps the expense and sets `travelObjectId` to `null`.

## Map helpers

### Resolve a Google Maps link

`POST /api/maps/resolve` with `{ "url": "https://maps.app.goo.gl/..." }`. The URL must be `https` on a Google Maps host. The server follows up to six redirects and returns:

```json
{ "expandedUrl": "https://www.google.com/maps/place/...", "name": "Kumamoto Castle", "lat": 32.806, "lng": 130.706, "coordinateSource": "url" }
```

`lat`, `lng`, and `coordinateSource` are `null` when the link has no coordinates. `coordinateSource` is `url` or `featureId`.

### Route legs

`POST /api/route-legs` with up to 25 legs:

```json
{ "legs": [{ "from": { "lat": 32.8, "lng": 130.7 }, "to": { "lat": 32.79, "lng": 130.69 }, "mode": "walk" }] }
```

`mode` is `walk` or `drive`. The response has one result per leg, in order: `{ meters, seconds, geometry, cached }`, or `{ error }` when that leg failed. Results come from openrouteservice and are cached for 90 days by coordinates rounded to 5 decimals. Returns `503` when `ORS_API_KEY` is not set (ADR 0008).

### Parking

`GET /api/parking?lat={lat}&lng={lng}` returns `{ "parking": [{ name, lat, lng, meters, fee, access, source }] }`: up to 5 public car parks within 1 km, from OpenStreetMap or openrouteservice. Upstream failures return `502`.

### Nearby places

`GET /api/nearby?lat={lat}&lng={lng}&radius={200-1000}&category={food|sights|transit}` returns `{ "features": [{ id, properties: { name, class, subclass }, geometry }] }`: named OpenStreetMap places from one Overpass query, shaped like the map tiles' POI features (`id` is OSM id × 10 + 1 node, 2 way, 3 relation; `geometry` is a Point, a way's or relation's centre). Up to 200 places, nearest first; results are cached for 24 hours. Invalid input returns `400` and upstream failures `502`. Call only on a user click.

### Place details

`GET /api/place-details?type={node|way|relation}&id={osmId}` returns details for an OpenStreetMap element, enriched from Wikidata and Wikipedia: `osmType`, `osmId`, `name`, `nameEn`, `description`, `summary`, `otherWikipedia`, `cuisine`, `openingHours`, `website`, `religion`, `osmUrl`. Unknown places return `404` and upstream failures `502` (ADR 0012).
