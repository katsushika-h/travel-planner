-- A flexible item's placement is deliberately distinct from a confirmed time.
ALTER TABLE "TravelObject" ADD COLUMN "placementTime" TEXT;

-- Give pre-existing flexible items stable 15-minute positions while retaining
-- their existing explicit day order. New drag/drop positions replace this value.
UPDATE "TravelObject"
SET "placementTime" = to_char(
  TIME '00:00' + ((540 + COALESCE("dayOrder", 0) * 15) % 1440) * INTERVAL '1 minute',
  'HH24:MI'
)
WHERE "date" IS NOT NULL
  AND "isAllDay" = FALSE
  AND "startTime" IS NULL
  AND "endTime" IS NULL;

CREATE INDEX "TravelObject_tripId_date_placementTime_dayOrder_idx"
  ON "TravelObject"("tripId", "date", "placementTime", "dayOrder");

ALTER TABLE "TravelObject" DROP CONSTRAINT "TravelObject_schedule_shape";

ALTER TABLE "TravelObject"
  ADD CONSTRAINT "TravelObject_schedule_shape"
  CHECK (
    (
      "date" IS NULL
      AND "endDate" IS NULL
      AND "placementTime" IS NULL
      AND "dayOrder" IS NULL
      AND "isAllDay" = FALSE
      AND (("startTime" IS NULL AND "endTime" IS NULL) OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL))
    )
    OR (
      "date" IS NOT NULL
      AND "endDate" IS NOT NULL
      AND "endDate" >= "date"
      AND (
        ("isAllDay" = TRUE AND "startTime" IS NULL AND "endTime" IS NULL AND "placementTime" IS NULL)
        OR (
          "isAllDay" = FALSE
          AND (
            ("startTime" IS NULL AND "endTime" IS NULL AND "placementTime" IS NOT NULL)
            OR
            ("startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "placementTime" IS NULL)
          )
        )
      )
    )
  );
