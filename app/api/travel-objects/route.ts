import {
  readJsonBody,
  rejectLegacyScheduleFields,
  readTravelObjectContent,
  readTravelObjectIdentity,
  readTrimmedString,
  validateCost,
  validateLocation,
} from "@/lib/api-validation";
import { readCreateSchedule } from "@/lib/api-schedule";
import { prisma } from "@/lib/prisma";
import { serializeTravelObject } from "@/lib/travel-object-serialization";
import { writeDateOrder } from "@/lib/schedule-order-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get("tripId");

  if (!tripId) {
    return Response.json({ error: "tripId is required." }, { status: 400 });
  }

  const [trip, travelObjects] = await Promise.all([prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } }), prisma.travelObject.findMany({
    where: { tripId },
    orderBy: [{ date: "asc" }, { dayOrder: "asc" }, { createdAt: "asc" }],
  })]);

  if (!trip) return Response.json({ error: "Trip not found." }, { status: 404 });

  return Response.json(travelObjects.map(serializeTravelObject));
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    rejectLegacyScheduleFields(body);
    const tripId = readTrimmedString(body.tripId, "tripId")!;
    validateCost(body.cost);
    validateLocation(body.location);
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const { date, endDate, startTime, endTime, placementTime, isAllDay } = readCreateSchedule(body);
    const travelObject = await prisma.$transaction(async (tx) => {
      const created = await tx.travelObject.create({
      data: {
        tripId,
        ...readTravelObjectIdentity(body, "create"),
        date,
        endDate: date === null ? null : endDate ?? date,
        startTime,
        endTime,
        placementTime: date !== null && !isAllDay && startTime === null && endTime === null ? placementTime ?? "09:00" : null,
        dayOrder: null,
        isAllDay,
        ...readTravelObjectContent(body, "create"),
      },
      });
      if (date !== null) {
        await writeDateOrder(tx, tripId, date, "initial");
      }
      return tx.travelObject.findUniqueOrThrow({ where: { id: created.id } });
    });

    return Response.json(serializeTravelObject(travelObject), { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid travel object data." },
      { status: 400 },
    );
  }
}
