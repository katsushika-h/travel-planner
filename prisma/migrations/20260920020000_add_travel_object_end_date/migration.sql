ALTER TABLE "TravelObject" ADD COLUMN "endDate" DATE;

UPDATE "TravelObject" AS object
SET "endDate" = (object."endDateTime" AT TIME ZONE 'UTC' AT TIME ZONE trip."timezone")::date
FROM "Trip" AS trip
WHERE trip."id" = object."tripId" AND object."date" IS NOT NULL;

UPDATE "TravelObject"
SET "endDate" = "date"
WHERE "date" IS NOT NULL AND "endDate" IS NULL;

DROP INDEX IF EXISTS "TravelObject_tripId_date_startTime_idx";
CREATE INDEX "TravelObject_tripId_date_endDate_startTime_idx" ON "TravelObject"("tripId", "date", "endDate", "startTime");
