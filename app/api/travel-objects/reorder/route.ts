import { Prisma } from "@prisma/client";
import { readDate, readJsonBody, readNonNegativeInteger, readPlacementTime, readTrimmedString } from "@/lib/api-validation";
import { prisma } from "@/lib/prisma";
import { withScheduleCompatibility } from "@/lib/travel-object-compat";
import { reorderTravelObject } from "@/lib/schedule-order-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const tripId = readTrimmedString(body.tripId, "tripId")!;
    const objectId = readTrimmedString(body.objectId, "objectId")!;
    const date = readDate(body.date, "date", true)!;
    const requestedOrder = readNonNegativeInteger(body.dayOrder, "dayOrder");
    const clearTime = body.clearTime === true;
    const placementTime = body.placementTime === undefined ? undefined : body.placementTime === null ? null : readPlacementTime(body.placementTime, "placementTime");
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { timezone: true, startDate: true } });
    if (!trip) throw new Error("Trip not found.");

    const result = await prisma.$transaction((tx) => reorderTravelObject(tx, { tripId, objectId, date, requestedOrder, clearTime, placementTime }));
    return Response.json(result.map((item) => withScheduleCompatibility(item, trip.timezone, trip.startDate)));
  } catch (error) {
    return Response.json({ error: error instanceof Prisma.PrismaClientKnownRequestError ? "Could not reorder travel objects." : error instanceof Error ? error.message : "Invalid reorder request." }, { status: 400 });
  }
}
