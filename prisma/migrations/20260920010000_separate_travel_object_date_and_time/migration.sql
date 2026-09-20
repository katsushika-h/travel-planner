ALTER TABLE "TravelObject"
  ADD COLUMN "date" DATE,
  ADD COLUMN "startTime" TEXT,
  ADD COLUMN "endTime" TEXT;

UPDATE "TravelObject" AS object
SET
  "date" = (object."startDateTime" AT TIME ZONE 'UTC' AT TIME ZONE trip."timezone")::date,
  "startTime" = CASE WHEN object."startDateTime" IS NULL OR object."isAllDay" THEN NULL ELSE to_char(object."startDateTime" AT TIME ZONE 'UTC' AT TIME ZONE trip."timezone", 'HH24:MI') END,
  "endTime" = CASE WHEN object."endDateTime" IS NULL OR object."isAllDay" THEN NULL ELSE to_char(object."endDateTime" AT TIME ZONE 'UTC' AT TIME ZONE trip."timezone", 'HH24:MI') END
FROM "Trip" AS trip
WHERE trip."id" = object."tripId";

CREATE INDEX "TravelObject_tripId_date_startTime_idx" ON "TravelObject"("tripId", "date", "startTime");
