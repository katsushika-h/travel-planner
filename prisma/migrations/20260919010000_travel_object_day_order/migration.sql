ALTER TABLE "TravelObject" ADD COLUMN "dayOrder" INTEGER;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "tripId", "dayIndex"
    ORDER BY "startDateTime" ASC NULLS LAST, "createdAt" ASC, "id" ASC
  ) - 1 AS "order"
  FROM "TravelObject"
  WHERE "dayIndex" IS NOT NULL
)
UPDATE "TravelObject" AS object
SET "dayOrder" = ranked."order"
FROM ranked
WHERE object."id" = ranked."id";

CREATE INDEX "TravelObject_tripId_dayIndex_dayOrder_idx" ON "TravelObject"("tripId", "dayIndex", "dayOrder");
