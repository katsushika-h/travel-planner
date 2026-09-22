# Project notes

## Docker deployment architecture

The deployment target is **Linux AMD64**. Whenever building and pushing Docker images for deployment, explicitly target `linux/amd64` (for example, with `docker buildx build --platform linux/amd64 ... --push`). Do not rely on the build machine's native platform. Apply this to both the app and migrator images when rebuilding them.

After building the app image, push it with:

```sh
docker push hokusaik/travel-planner-app:latest
```

## Project quick start

This repository is a single-user travel-planning application built with Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand, Prisma, and PostgreSQL.

### Read first

For a new task, read these files in this order:

1. `HANDOFF_REPORT.md` — current project state, recent work, known gaps, and suggested next steps.
2. `README.md` — product scope and architecture background.
3. `FEATURES.md` — planned feature ideas.
4. The relevant files listed below before making changes.

Preserve unrelated working-tree changes. Inspect `git status` before editing and never reset or discard changes without an explicit request.

### Current architecture

- `app/` contains the Next.js App Router pages and API route handlers.
- `components/layout/AppShell.tsx` coordinates workspace tabs, active trips, selection, and editing.
- `components/views/` contains Calendar (month/week/day modes), Kanban, Itinerary (`TripDaysView`), Table, and Leaflet Map views.
- `components/inspector/` contains the travel-object inspector and Markdown notes editor.
- `components/trip/` contains trip/item dialogs and trip-level actions.
- `lib/api-client.ts` is the browser API client; `lib/api-validation.ts` validates route input.
- `store/use-travel-store.ts` contains client-side UI state such as selected items and custom type colors.
- `prisma/schema.prisma` defines the PostgreSQL schema; `prisma/migrations/` contains applied migrations.
- `types/travel.ts` defines shared client types. `TravelObject.location` is JSON and may contain place data, Google Maps URLs, and optional coordinates. Travel objects can also have `TravelAttachment` records.
- `docker-compose.nas.yml` runs PostgreSQL, the one-shot Prisma migrator, and the app container.
- `Dockerfile` builds both the app and migrator stages. The production image uses the webpack build.

### Important behavior

- Travel objects use `date`, `endDate`, `startTime`, `endTime`, `placementTime`, and `dayOrder` as the canonical schedule fields. The legacy `startDateTime`, `endDateTime`, and `dayIndex` values are compatibility fields computed by the API during the UI migration.
- Objects may be unscheduled, confirmed at a fixed time, all-day, or placed flexibly on a date. `placementTime` is a 15-minute visual placement for flexible items and is not a confirmed event time.
- Calendar supports month, week, and day modes. Kanban and Itinerary focus on scheduled objects; the Table view can show unscheduled objects.
- `dayOrder` is used for flexible item ordering, but ordering still needs review after the weekend schedule refactor.
- The Map view uses Leaflet and OpenStreetMap tiles. Map coordinates are extracted from supported Google Maps URLs; links without coordinates remain saved but cannot be plotted.
- Attachments are currently stored as `Bytes` in PostgreSQL through the `TravelAttachment` model. Revisit object storage if attachment volume grows.
- The repository currently contains a large number of tracked `.next` build artifacts. Avoid adding further generated build output to source changes; consider cleaning this up in a separate deliberate repository-maintenance change.
- API routes currently use trip/object IDs directly; authentication and per-user trip ownership are future features, not assumptions to add silently.
- Google Maps support currently handles pasted links and stores location data; do not introduce Google API billing unless explicitly requested.
- OSM maps must include visible attribution and follow the applicable tile/geocoding usage policies.

### Validation

For code changes, prefer these checks when applicable:

```sh
npm run lint
npx tsc --noEmit
npx next build --webpack
```

Do not rebuild or push Docker images unless requested. When deployment is requested, build both app and migrator images explicitly for `linux/amd64`.
