import { readEntryKind, readNoteBody, readNoteTitle, validateNoteInput } from "@/lib/note-validation";
import {
  readJsonBody,
  readNonNegativeInteger,
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
import { reorderTravelObject, writeDateOrder } from "@/lib/schedule-order-service";

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
    const kind = readEntryKind(body.kind);
    if (kind === "note") validateNoteInput(body);
    else if (body.noteBody !== undefined) throw new Error("noteBody is only supported for notes.");
    validateCost(body.cost);
    validateLocation(body.location);
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const { date, endDate, startTime, endTime, placementTime, isAllDay } = readCreateSchedule(body);
    if (kind === "note" && date?.getTime() !== endDate?.getTime()) throw new Error("Notes belong to a single date.");
    const noteOrder = kind === "note" && body.dayOrder !== undefined ? readNonNegativeInteger(body.dayOrder, "dayOrder") : undefined;
    const travelObject = await prisma.$transaction(async (tx) => {
      const created = await tx.travelObject.create({
      data: {
        tripId,
        ...(kind === "note" ? { title: readNoteTitle(body.title), type: "unclassified", noteBody: readNoteBody(body.noteBody === undefined ? "" : body.noteBody) } : readTravelObjectIdentity(body, "create")),
        kind,
        date,
        endDate: date === null ? null : endDate ?? date,
        startTime,
        endTime,
        placementTime: date !== null && !isAllDay && startTime === null && endTime === null ? placementTime ?? "09:00" : null,
        dayOrder: null,
        isAllDay,
        ...(kind === "note" ? {} : readTravelObjectContent(body, "create")),
      },
      });
      if (date !== null) {
        await writeDateOrder(tx, tripId, date, "initial");
      }
      if (date && noteOrder !== undefined) await reorderTravelObject(tx, { tripId, objectId: created.id, date, requestedOrder: noteOrder, clearTime: false, placementTime: undefined });
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
