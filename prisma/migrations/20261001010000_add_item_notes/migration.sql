CREATE TABLE "ItemNote" (
    "id" TEXT NOT NULL,
    "travelObjectId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemNote_travelObjectId_createdAt_idx" ON "ItemNote"("travelObjectId", "createdAt");
ALTER TABLE "ItemNote" ADD CONSTRAINT "ItemNote_travelObjectId_fkey" FOREIGN KEY ("travelObjectId") REFERENCES "TravelObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
