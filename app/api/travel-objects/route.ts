import { Prisma } from "@prisma/client";
import {
  isRecord,
  readEventType,
  readHeaderImage,
  readJsonBody,
  readTags,
  readTrimmedString,
  validateCost,
  validateLocation,
} from "@/lib/api-validation";
import { readCreateSchedule } from "@/lib/api-schedule";
import { prisma } from "@/lib/prisma";
import { withScheduleCompatibility } from "@/lib/travel-object-compat";
import { writeDateOrder } from "@/lib/schedule-order-service";

export const dynamic = "force-dynamic";

function readOptionalJson(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  if (!isRecord(value)) throw new Error(`${field} must be a JSON object.`);
  return value as Prisma.InputJsonValue;
}

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get("tripId");

  if (!tripId) {
    return Response.json({ error: "tripId is required." }, { status: 400 });
  }

  const [trip, travelObjects] = await Promise.all([prisma.trip.findUnique({ where: { id: tripId }, select: { timezone: true, startDate: true } }), prisma.travelObject.findMany({
    where: { tripId },
    orderBy: [{ date: "asc" }, { dayOrder: "asc" }, { createdAt: "asc" }],
  })]);

  if (!trip) return Response.json({ error: "Trip not found." }, { status: 404 });

  return Response.json(travelObjects.map((item) => withScheduleCompatibility(item, trip.timezone, trip.startDate)));
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const tripId = readTrimmedString(body.tripId, "tripId")!;
    validateCost(body.cost);
    validateLocation(body.location);
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const { date, endDate, startTime, endTime, placementTime, isAllDay } = readCreateSchedule(body, trip.timezone);
    const travelObject = await prisma.$transaction(async (tx) => {
      const created = await tx.travelObject.create({
      data: {
        tripId,
        title: readTrimmedString(body.title, "title", { maxLength: 100 })!,
        type: readEventType(body.type ?? "unclassified", "type"),
        date,
        endDate: date === null ? null : endDate ?? date,
        startTime,
        endTime,
        placementTime: date !== null && !isAllDay && startTime === null && endTime === null ? placementTime ?? "09:00" : null,
        dayOrder: null,
        isAllDay,
        headerImage: body.headerImage === undefined ? null : readHeaderImage(body.headerImage),
        location: readOptionalJson(body.location, "location"),
        cost: readOptionalJson(body.cost, "cost"),
        notes: body.notes === null ? null : readTrimmedString(body.notes, "notes", { optional: true, maxBytes: 2500 }),
        tags: readTags(body.tags),
      },
      });
      if (date !== null) {
        await writeDateOrder(tx, tripId, date, "initial");
      }
      return tx.travelObject.findUniqueOrThrow({ where: { id: created.id } });
    });

    return Response.json(withScheduleCompatibility(travelObject, trip.timezone, trip.startDate), { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid travel object data." },
      { status: 400 },
    );
  }
}
