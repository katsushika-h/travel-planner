#!/usr/bin/env bash
set -euo pipefail

: "${MIGRATION_FIXTURE_DATABASE_URL:?Set this to an empty, disposable PostgreSQL database.}"
root_dir=$(cd "$(dirname "$0")/.." && pwd)
fixture_dir=$(mktemp -d /tmp/travel-planner-migrations.XXXXXX)
trap 'rm -rf "$fixture_dir"' EXIT
export DATABASE_URL="$MIGRATION_FIXTURE_DATABASE_URL"

if [ "$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")" != "0" ]; then
  echo "Migration fixture requires an empty database." >&2
  exit 1
fi

mkdir -p "$fixture_dir/prisma/migrations"
cp "$root_dir/prisma.config.ts" "$fixture_dir/"
cp "$root_dir/prisma/schema.prisma" "$fixture_dir/prisma/"
cp "$root_dir/prisma/migrations/migration_lock.toml" "$fixture_dir/prisma/migrations/"
ln -s "$root_dir/node_modules" "$fixture_dir/node_modules"

for migration_name in \
  20260917031401_init \
  20260918010000_trip_default_currency \
  20260918020000_travel_object_header_image \
  20260918030000_unscheduled_travel_objects \
  20260919000000_travel_object_attachments; do
  cp -R "$root_dir/prisma/migrations/$migration_name" "$fixture_dir/prisma/migrations/"
done
(cd "$fixture_dir" && npx prisma migrate deploy)

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Trip" ("id", "title", "startDate", "endDate", "timezone")
VALUES ('legacy-trip', 'Legacy schedule fixture', '2026-03-07', '2026-03-12', 'America/New_York');

INSERT INTO "TravelObject" ("id", "tripId", "title", "type", "startDateTime", "endDateTime", "dayIndex", "isAllDay", "updatedAt")
VALUES
  ('legacy-fixed', 'legacy-trip', 'Overnight fixed', 'activity', '2026-03-08 04:30:00', '2026-03-08 07:30:00', 1, false, NOW()),
  ('legacy-all-day', 'legacy-trip', 'Three-day all-day', 'activity', '2026-03-09 04:00:00', '2026-03-11 04:00:00', 3, true, NOW()),
  ('legacy-partial', 'legacy-trip', 'Partial timestamp pair', 'activity', '2026-03-10 14:00:00', NULL, 2, false, NOW()),
  ('legacy-undated', 'legacy-trip', 'Undated idea', 'activity', NULL, NULL, NULL, false, NOW());
SQL

for migration_name in \
  20260919010000_travel_object_day_order \
  20260920010000_separate_travel_object_date_and_time \
  20260920020000_add_travel_object_end_date \
  20260920030000_normalize_travel_object_schedule \
  20260920040000_add_flexible_placement_time; do
  cp -R "$root_dir/prisma/migrations/$migration_name" "$fixture_dir/prisma/migrations/"
done
(cd "$fixture_dir" && npx prisma migrate deploy)

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "TravelObject" WHERE "id" = 'legacy-fixed'
      AND "date" = '2026-03-07' AND "endDate" = '2026-03-08'
      AND "startTime" = '23:30' AND "endTime" = '03:30'
      AND "placementTime" IS NULL AND "dayOrder" = 0 AND "isAllDay" = false
  ) THEN RAISE EXCEPTION 'Fixed overnight row migrated incorrectly'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "TravelObject" WHERE "id" = 'legacy-all-day'
      AND "date" = '2026-03-09' AND "endDate" = '2026-03-11'
      AND "startTime" IS NULL AND "endTime" IS NULL
      AND "placementTime" IS NULL AND "dayOrder" = 0 AND "isAllDay" = true
  ) THEN RAISE EXCEPTION 'All-day range migrated incorrectly'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "TravelObject" WHERE "id" = 'legacy-partial'
      AND "date" = '2026-03-10' AND "endDate" = '2026-03-10'
      AND "startTime" IS NULL AND "endTime" IS NULL
      AND "placementTime" = '09:00' AND "dayOrder" = 0 AND "isAllDay" = false
  ) THEN RAISE EXCEPTION 'Partial timestamp row migrated incorrectly'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "TravelObject" WHERE "id" = 'legacy-undated'
      AND "date" IS NULL AND "endDate" IS NULL
      AND "startTime" IS NULL AND "endTime" IS NULL
      AND "placementTime" IS NULL AND "dayOrder" IS NULL AND "isAllDay" = false
  ) THEN RAISE EXCEPTION 'Undated row migrated incorrectly'; END IF;
END $$;
SQL

echo "Legacy schedule migration contract passed."
