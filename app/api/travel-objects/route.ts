import { Prisma } from "@prisma/client";
import {
  isRecord,
  readDate,
  readEventType,
  readHeaderImage,
  readJsonBody,
  readPlacementTime,
  readTime,
  readTags,
  readTrimmedString,
  validateCost,
  validateLocation,
} from "@/lib/api-validation";
import { prisma } from "@/lib/prisma";
import { withScheduleCompatibility } from "@/lib/travel-object-compat";
import { dateParts } from "@/lib/date-utils";
import { normalizeDayOrder } from "@/lib/schedule-order";

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

    const legacyStart = typeof body.startDateTime === "string" ? readDate(body.startDateTime, "startDateTime") : null;
    const legacyEnd = typeof body.endDateTime === "string" ? readDate(body.endDateTime, "endDateTime") : null;
    const legacyStartParts = legacyStart ? dateParts(legacyStart, trip.timezone) : null;
    const legacyEndParts = legacyEnd ? dateParts(legacyEnd, trip.timezone) : null;
    const date = body.date === undefined ? legacyStartParts ? readDate(legacyStartParts.date, "date", true) : null : body.date === null ? null : readDate(body.date, "date", true);
    const endDate = date === null ? null : body.endDate === undefined ? legacyEndParts ? readDate(legacyEndParts.date, "endDate", true) : date : body.endDate === null ? date : readDate(body.endDate, "endDate", true);
    const startTime = body.startTime === undefined ? legacyStartParts && body.isAllDay !== true ? legacyStartParts.time : null : body.startTime === null ? null : readTime(body.startTime, "startTime");
    const endTime = body.endTime === undefined ? legacyEndParts && body.isAllDay !== true ? legacyEndParts.time : null : body.endTime === null ? null : readTime(body.endTime, "endTime");
    const placementTime = body.placementTime === undefined ? null : body.placementTime === null ? null : readPlacementTime(body.placementTime, "placementTime");
    const isAllDay = body.isAllDay === true;
    if (date === null && (endDate !== null || placementTime !== null || isAllDay)) throw new Error("Unscheduled items cannot have an end date, placement time, or be all-day.");
    if (date && endDate! < date) throw new Error("endDate must be on or after date.");
    if (isAllDay && (startTime || endTime)) throw new Error("All-day items cannot have times.");
    if (!isAllDay && (startTime === null) !== (endTime === null)) throw new Error("startTime and endTime must both be set or both be null.");
    if (placementTime && (isAllDay || startTime || endTime)) throw new Error("placementTime is only for flexible items without confirmed times.");
    if (!isAllDay && date && startTime && endTime && endDate!.getTime() === date.getTime() && endTime <= startTime) throw new Error("endTime must be after startTime on the same date.");
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
        const siblings = await tx.travelObject.findMany({ where: { tripId, date } });
        for (const { item, dayOrder: normalizedOrder } of normalizeDayOrder(siblings)) {
          if (item.dayOrder !== normalizedOrder) await tx.travelObject.update({ where: { id: item.id }, data: { dayOrder: normalizedOrder } });
        }
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
