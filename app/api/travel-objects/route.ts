import { Prisma } from "@prisma/client";
import {
  isRecord,
  readDate,
  readJsonBody,
  readPositiveInteger,
  readTags,
  readTrimmedString,
} from "@/lib/api-validation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function readOptionalJson(value: unknown, field: string) {
  if (value === undefined) return undefined;
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
    orderBy: [{ startDateTime: "asc" }, { createdAt: "asc" }],
  });

  return Response.json(travelObjects);
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const startDateTime = readDate(body.startDateTime, "startDateTime");
    const endDateTime = readDate(body.endDateTime, "endDateTime");

    if (endDateTime < startDateTime) {
      return Response.json(
        { error: "endDateTime must be on or after startDateTime." },
        { status: 400 },
      );
    }

    const tripId = readTrimmedString(body.tripId, "tripId")!;
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const travelObject = await prisma.travelObject.create({
      data: {
        tripId,
        title: readTrimmedString(body.title, "title")!,
        type: readTrimmedString(body.type ?? "activity", "type")!,
        startDateTime,
        endDateTime,
        dayIndex: readPositiveInteger(body.dayIndex ?? 1, "dayIndex"),
        isAllDay: body.isAllDay === true,
        location: readOptionalJson(body.location, "location"),
        cost: readOptionalJson(body.cost, "cost"),
        notes: readTrimmedString(body.notes, "notes", { optional: true }),
        tags: readTags(body.tags),
      },
    });

    return Response.json(travelObject, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid travel object data." },
      { status: 400 },
    );
  }
}
