-- `date`, `endDate`, `startTime`, `endTime`, and `dayOrder` are the single
-- schedule source of truth. UTC timestamps and dayIndex duplicated that data.

UPDATE "TravelObject"
SET "endDate" = "date"
WHERE "date" IS NOT NULL AND "endDate" IS NULL;

UPDATE "TravelObject"
SET
  "date" = NULL,
  "endDate" = NULL,
  "dayOrder" = NULL,
  "isAllDay" = FALSE
WHERE "date" IS NULL;

UPDATE "TravelObject"
SET "startTime" = NULL, "endTime" = NULL
WHERE "startTime" IS NULL OR "endTime" IS NULL;

DROP INDEX IF EXISTS "TravelObject_tripId_startDateTime_endDateTime_idx";
DROP INDEX IF EXISTS "TravelObject_tripId_dayIndex_dayOrder_idx";
ALTER TABLE "TravelObject"
  DROP COLUMN "startDateTime",
  DROP COLUMN "endDateTime",
  DROP COLUMN "dayIndex";

CREATE INDEX "TravelObject_tripId_date_dayOrder_idx"
  ON "TravelObject"("tripId", "date", "dayOrder");

ALTER TABLE "TravelObject"
  ADD CONSTRAINT "TravelObject_schedule_shape"
  CHECK (
    ("date" IS NULL AND "endDate" IS NULL AND "dayOrder" IS NULL AND "isAllDay" = FALSE AND (("startTime" IS NULL AND "endTime" IS NULL) OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL)))
    OR
    ("date" IS NOT NULL AND "endDate" IS NOT NULL AND "endDate" >= "date" AND (
      ("isAllDay" = TRUE AND "startTime" IS NULL AND "endTime" IS NULL)
      OR
      ("isAllDay" = FALSE AND (("startTime" IS NULL AND "endTime" IS NULL) OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL))
    )))
  );
