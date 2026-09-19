CREATE TABLE "TravelAttachment" (
    "id" TEXT NOT NULL,
    "travelObjectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TravelAttachment_travelObjectId_createdAt_idx" ON "TravelAttachment"("travelObjectId", "createdAt");

ALTER TABLE "TravelAttachment" ADD CONSTRAINT "TravelAttachment_travelObjectId_fkey" FOREIGN KEY ("travelObjectId") REFERENCES "TravelObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
