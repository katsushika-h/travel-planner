# Travel Planner

Travel Planner is a single-user itinerary app for organizing trips across Calendar, Kanban, Itinerary, Table, and Map views. It runs on Next.js 16, React 19, TypeScript, Tailwind CSS, Prisma, and PostgreSQL. There is no login or per-user trip ownership.

## What it does

- **Calendar:** Month, Week, and Day modes. Month shows a date grid; Week shows timed events, flexible items, and overlapping events; Day combines the itinerary with a map. All-day events appear above timed content in Week and Day and retain their multi-day span when moved. On narrow screens, Month scrolls sideways so day cells remain readable, and the sidebar becomes a compact icon rail that can expand over the workspace.
- **Kanban, Itinerary, and Table:** Organize by event type, arrange visit order, and edit item details, dates, times, and lengths. All-day length is an inclusive count of calendar days.
- **Ideas and inspector:** Keep items unscheduled, drag them onto a date, or return them to Ideas. Select an item to edit notes, tags, cost, location, header image URL, and attachments. Header images use remote HTTP(S) URLs; attachment bytes are stored in PostgreSQL, with a 20 MB upload limit.
- **Maps and CSV import:** Plot items with coordinates on a Leaflet/OpenStreetMap map. Google Maps links without extractable coordinates stay saved but do not appear as markers. Google Maps saved-list CSV import converts recognized date/time columns to the app's schedule fields. If some rows fail to create, confirmed successes appear immediately and the UI names rows whose result could not be confirmed; check the trip before retrying them.

## Schedule model

An item has a `date` and `endDate` range, optional confirmed `startTime` and `endTime`, optional flexible `placementTime`, `dayOrder`, and `isAllDay`. `placementTime` is a 15-minute visual position, not a confirmed booking time. Unscheduled ideas have no date. The trip's IANA timezone is used for date/time calculations.

The travel-object API uses these canonical fields. It rejects the removed `startDateTime`, `endDateTime`, and `dayIndex` request keys and omits them from responses. Google Maps CSV input can still contain combined date/time columns; the importer converts them before creation. See [the API migration note](docs/work/api-schedule-release-note.md) and [schedule decisions](docs/decisions/0001-canonical-schedule-fields.md).

## Local development

1. Install Node.js 24 and provide a PostgreSQL database. Copy `.env.example` to `.env` and set `DATABASE_URL` to that database. The example uses port 5433 and development-only credentials.
2. Run `npm ci`.
3. Run `npx prisma migrate deploy` against the configured database.
4. Run `npm run dev` and open the URL printed by Next.js.

`npm run check` runs lint, TypeScript checking, and Node tests. `npx next build --webpack` verifies the production build used by the Dockerfile. The database-backed API and ordering fixtures require an isolated migrated database and a running app; see [the refactor handoff](docs/work/schedule-refactor.md) for their commands.

## Deployment and project notes

`Dockerfile` contains separate app and migrator stages. `docker-compose.nas.yml` runs PostgreSQL, the one-shot migrator, and the app. Deployment targets Linux AMD64; see [AGENTS.md](AGENTS.md) for image build and push rules. This README describes the current app. The [original v3 POC specification](docs/archive/original-spec-v3.md) is retained for historical context; [architecture](docs/architecture.md), [feature ideas](FEATURES.md), and the [refactoring tracker](REFACTORING_TRACKER.md) provide further detail.
