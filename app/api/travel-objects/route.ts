import { Prisma } from "@prisma/client";
import {
  isRecord,
  readDate,
  readEventType,
  readHeaderImage,
  readJsonBody,
  readPositiveInteger,
  readTags,
  readTrimmedString,
  validateCost,
  validateLocation,
} from "@/lib/api-validation";
import { prisma } from "@/lib/prisma";

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

  const travelObjects = await prisma.travelObject.findMany({
    where: { tripId },
    orderBy: [{ dayIndex: "asc" }, { dayOrder: "asc" }, { startDateTime: "asc" }, { createdAt: "asc" }],
  });

  return Response.json(travelObjects);
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const isAllDay = body.isAllDay === true;
    const unscheduled = body.startDateTime === null && body.endDateTime === null && body.dayIndex == null;
    if ((body.startDateTime == null) !== (body.endDateTime == null)) throw new Error("startDateTime and endDateTime must both be set or both be null.");
    const startDateTime = unscheduled ? null : readDate(body.startDateTime, "startDateTime");
    const endDateTime = unscheduled ? null : readDate(body.endDateTime, "endDateTime");
    if (startDateTime === null && endDateTime === null && isAllDay && body.dayIndex != null) throw new Error("Flexible items cannot be all-day items.");

    if (startDateTime && endDateTime && (isAllDay ? endDateTime < startDateTime : endDateTime <= startDateTime)) {
      return Response.json(
        { error: isAllDay ? "endDateTime must be on or after startDateTime." : "endDateTime must be after startDateTime." },
        { status: 400 },
      );
    }

    const tripId = readTrimmedString(body.tripId, "tripId")!;
    validateCost(body.cost);
    validateLocation(body.location);
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const dayIndex = unscheduled ? null : readPositiveInteger(body.dayIndex ?? 1, "dayIndex");
    const travelObject = await prisma.$transaction(async (tx) => {
      const dayOrder = dayIndex === null ? null : await tx.travelObject.count({ where: { tripId, dayIndex } });
      return tx.travelObject.create({
      data: {
        tripId,
        title: readTrimmedString(body.title, "title", { maxLength: 100 })!,
        type: readEventType(body.type ?? "unclassified", "type"),
        startDateTime,
        endDateTime,
        dayIndex,
        dayOrder,
        isAllDay,
        headerImage: body.headerImage === undefined ? null : readHeaderImage(body.headerImage),
        location: readOptionalJson(body.location, "location"),
        cost: readOptionalJson(body.cost, "cost"),
        notes: body.notes === null ? null : readTrimmedString(body.notes, "notes", { optional: true, maxBytes: 2500 }),
        tags: readTags(body.tags),
      },
      });
    });

    return Response.json(travelObject, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid travel object data." },
      { status: 400 },
    );
  }
}
