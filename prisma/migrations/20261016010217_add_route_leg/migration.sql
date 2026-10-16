-- CreateTable
CREATE TABLE "RouteLeg" (
    "id" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "fromLat" DOUBLE PRECISION NOT NULL,
    "fromLng" DOUBLE PRECISION NOT NULL,
    "toLat" DOUBLE PRECISION NOT NULL,
    "toLng" DOUBLE PRECISION NOT NULL,
    "meters" DOUBLE PRECISION NOT NULL,
    "seconds" DOUBLE PRECISION NOT NULL,
    "geometry" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteLeg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteLeg_profile_fromLat_fromLng_toLat_toLng_key" ON "RouteLeg"("profile", "fromLat", "fromLng", "toLat", "toLng");
