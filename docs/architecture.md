# Architecture

Read this when changing a boundary or tracing a cross-module data flow. `AGENTS.md` has commands and universal rules; code remains authoritative for implementation details.

## Boundaries and data flow

1. `app/page.tsx` renders the client workspace in `components/layout/AppShell.tsx`. `components/layout/useTripData.ts` loads trips and objects through `lib/api-client.ts`; `components/layout/useItemSaveQueue.ts` coordinates optimistic edits and debounced persistence; `components/layout/useItemSelection.ts` owns selection and inspector state. The shell coordinates the five views. `store/use-travel-store.ts` holds UI preferences such as active tab, active trip, and custom type colors; PostgreSQL holds trips and objects.
2. `app/api/` validates requests with `lib/api-validation.ts`, writes through the Prisma client in `lib/prisma.ts`, and returns shared shapes from `types/travel.ts`. `prisma/schema.prisma` and migrations define persistence. Routes currently use IDs directly; there is no authentication or ownership boundary.
3. Schedule values are persisted as a date range, optional confirmed start/end times, optional flexible `placementTime`, and `dayOrder`. `lib/date-utils.ts` handles trip-timezone conversions; `lib/schedule-order.ts` defines pure ordering rules, and `lib/schedule-order-service.ts` writes per-date order inside API transactions. `lib/api-schedule.ts` parses schedule requests; `lib/travel-object-compat.ts` derives transitional timestamp/day-index response fields for API compatibility. Do not persist those derived fields. See [ADR 0001](decisions/0001-canonical-schedule-fields.md).
4. `TravelObject.location` is JSON. Supported Google Maps URLs can yield coordinates for the Leaflet/OpenStreetMap view; a URL without coordinates remains valid stored data. `TravelAttachment` stores file bytes in PostgreSQL, so uploaded documents affect database size and backups.
5. `lib/google-maps-csv.ts` parses Google Maps CSV rows and projects schedules without network calls. `components/trip/ImportGoogleMapsCsvButton.tsx` resolves Maps URLs, creates objects, and reports progress.

## Deployment

`docker-compose.nas.yml` starts PostgreSQL, runs the one-shot Prisma migrator after the database is healthy, then starts the app. `Dockerfile` has separate `migrator` and app runner stages. Deployment images target `linux/amd64`; the production app build uses webpack. See `AGENTS.md` for the deployment rule and validation commands.

## Known gaps

- Ordering of flexible items through Calendar and Itinerary needs verification after the schedule refactor.
- Authentication and per-user trip ownership are future work.
- The repository still tracks generated `.next` files; clean them in a separate deliberate maintenance change.
