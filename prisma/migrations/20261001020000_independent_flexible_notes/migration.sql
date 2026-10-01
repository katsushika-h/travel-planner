BEGIN;
ALTER TABLE "TravelObject" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'event';
ALTER TABLE "TravelObject" ADD COLUMN "noteBody" TEXT;
-- Convert attached notes into independent flexible entries on their parent's start date.
-- Preserve IDs, contents, and timestamps; detach their lifecycle from the parent.
CREATE TEMP TABLE note_conversion_order ON COMMIT DROP AS
SELECT p."tripId", p."date", p."id" AS "parentId", n."id" AS "noteId",
       COALESCE(p."dayOrder", 2147483647) AS "parentOrder", n."createdAt"
FROM "ItemNote" n JOIN "TravelObject" p ON p."id" = n."travelObjectId";
INSERT INTO "TravelObject" ("id", "tripId", "title", "type", "kind", "noteBody", "date", "endDate", "placementTime", "isAllDay", "tags", "createdAt", "updatedAt")
SELECT n."id", p."tripId", COALESCE(n."title", 'Note'), 'unclassified', 'note', n."body", p."date", p."date",
       CASE WHEN p."date" IS NOT NULL THEN '09:00' ELSE NULL END, false, ARRAY[]::TEXT[], n."createdAt", n."updatedAt"
FROM "ItemNote" n JOIN "TravelObject" p ON p."id" = n."travelObjectId";
-- Only dates containing converted notes need compaction; all other event orders stay untouched.
WITH sequence AS (
  SELECT t."id", ROW_NUMBER() OVER (PARTITION BY t."tripId", t."date" ORDER BY
    COALESCE(c."parentOrder", t."dayOrder", 2147483647),
    CASE WHEN t."kind" = 'note' THEN 1 ELSE 0 END,
    t."createdAt", t."id") - 1 AS position
  FROM "TravelObject" t LEFT JOIN note_conversion_order c ON c."noteId" = t."id"
  WHERE t."date" IS NOT NULL AND EXISTS (SELECT 1 FROM note_conversion_order n WHERE n."tripId" = t."tripId" AND n."date" = t."date")
)
UPDATE "TravelObject" t SET "dayOrder" = sequence.position FROM sequence WHERE sequence."id" = t."id";
ALTER TABLE "TravelObject" ADD CONSTRAINT "TravelObject_kind_check" CHECK ("kind" IN ('event', 'note'));
ALTER TABLE "TravelObject" ADD CONSTRAINT "TravelObject_note_schedule_check" CHECK ("kind" <> 'note' OR (
  "noteBody" IS NOT NULL AND "startTime" IS NULL AND "endTime" IS NULL AND "isAllDay" = false
  AND "endDate" IS NOT DISTINCT FROM "date" AND "location" IS NULL AND "cost" IS NULL
));
DROP TABLE "ItemNote";
COMMIT;
