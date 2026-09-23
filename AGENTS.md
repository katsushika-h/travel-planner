# Travel Planner agent guide

Travel Planner is a single-user itinerary app built with Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand, Prisma, and PostgreSQL. The current workspace has Calendar, Kanban, Itinerary, Table, and Map views. Treat current code as the source of truth; `README.md` is an older product specification, and `HANDOFF_REPORT.md` records historical work.

## Start a task

- Inspect `git status` and preserve unrelated changes. Never reset or discard them without an explicit request.
- Read this file, then search only relevant implementation, tests, and documentation. Check applicable records in `docs/decisions/` and overlapping work in `docs/work/` before substantial changes.
- Read `docs/architecture.md` only when architectural context is needed. Read `FEATURES.md` for backlog work, `README.md` for original product intent, and `HANDOFF_REPORT.md` for historical context only when relevant.
- Prefer the smallest coherent change. Preserve behavior unless the task changes it; reuse existing patterns, avoid unrelated edits and one-use abstractions, and avoid unnecessary API, schema, or persisted-format changes. Add or update behavioral tests when behavior changes and a practical test seam exists.

## Code map

- `app/`: pages and API route handlers.
- `components/layout/AppShell.tsx`: active trip, items, selection, editing, and workspace view coordination.
- `components/views/`, `components/inspector/`, `components/trip/`: workspace views, item editing, and trip/item actions.
- `lib/api-client.ts`, `lib/api-validation.ts`, `lib/date-utils.ts`, `lib/schedule-domain.ts`, `lib/schedule-order.ts`, `lib/travel-object-compat.ts`: request flow and schedule logic.
- `store/use-travel-store.ts`: persisted client UI preferences; `types/travel.ts`: shared browser types.
- `prisma/schema.prisma`, `prisma/migrations/`: persisted model and migrations.
- `Dockerfile`, `docker-compose.nas.yml`: app, migrator, and PostgreSQL deployment.

## Important invariants

- `date`, `endDate`, `startTime`, `endTime`, `placementTime`, and `dayOrder` are the persisted schedule fields. The API computes legacy `startDateTime`, `endDateTime`, and `dayIndex` for UI compatibility. `placementTime` is a 15-minute visual position for flexible items, not a confirmed booking time. `dayOrder` behavior still needs review across Calendar and Itinerary.
- The app has no authentication or per-user trip ownership. Do not assume either exists when changing routes.
- Map coordinates are extracted from supported Google Maps URLs. Preserve URLs without coordinates; they cannot be plotted. Do not introduce Google API billing unless requested. Keep visible OpenStreetMap attribution and comply with tile/geocoding usage policies.
- Attachments are stored as PostgreSQL `Bytes`. The repository tracks some `.next` artifacts despite `.gitignore`; avoid including generated output in source changes.

## Commands and deployment

Run `npm ci` to install, `npm run dev` for local development, and `npm run check` for canonical lint, type checking, and Node schedule-domain tests. For production build verification, run `npx next build --webpack`; the Dockerfile uses webpack. Run the narrowest relevant check while iterating, then `npm run check` before completing substantial changes when practical. Report only checks actually run.

Do not rebuild or push Docker images unless deployment is requested. The target is **Linux AMD64**: explicitly use `--platform linux/amd64` for both app and migrator images. Rebuild the migrator when migrations change. After building the app image for deployment, push it with `docker push hokusaik/travel-planner-app:latest`.

For substantial multi-step work, create or update one concise handoff in `docs/work/` with status, goal, scope, executable checklist, current state, remaining work, findings, verification, and next step. Update `docs/architecture.md` only for architectural changes and add a concise ADR in `docs/decisions/` only for a durable decision. Mark finished work complete and remove transient notes.
