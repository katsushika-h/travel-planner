-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelObject" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'activity',
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "dayIndex" INTEGER NOT NULL DEFAULT 1,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" JSONB,
    "cost" JSONB,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelObject_tripId_startDateTime_endDateTime_idx" ON "TravelObject"("tripId", "startDateTime", "endDateTime");

-- CreateIndex
CREATE INDEX "TravelObject_tripId_type_idx" ON "TravelObject"("tripId", "type");

-- AddForeignKey
ALTER TABLE "TravelObject" ADD CONSTRAINT "TravelObject_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
