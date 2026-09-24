import { Prisma } from "@prisma/client";
import {
  isRecord,
  readEventType,
  readHeaderImage,
  readJsonBody,
  readNonNegativeInteger,
  readTags,
  readTrimmedString,
  validateCost,
  validateLocation,
} from "@/lib/api-validation";
import { normalizeUpdatedScheduleData, readLegacyUpdateScheduleFields, readUpdateScheduleFields } from "@/lib/api-schedule";
import { prisma } from "@/lib/prisma";
import { withScheduleCompatibility } from "@/lib/travel-object-compat";
import { writeDateOrder } from "@/lib/schedule-order-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ objectId: string }> };

function readOptionalJson(value: unknown, field: string) {
  if (value === null) return Prisma.JsonNull;
  if (!isRecord(value)) throw new Error(`${field} must be a JSON object or null.`);
  return value as Prisma.InputJsonValue;
}

export async function GET(_request: Request, { params }: Context) {
  const { objectId } = await params;
  const travelObject = await prisma.travelObject.findUnique({ where: { id: objectId }, include: { trip: { select: { timezone: true, startDate: true } } } });

  return travelObject
    ? Response.json(withScheduleCompatibility(travelObject, travelObject.trip.timezone, travelObject.trip.startDate))
    : Response.json({ error: "Travel object not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { objectId } = await params;
    const body = await readJsonBody(request);
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = readTrimmedString(body.title, "title", { maxLength: 100 });
    if (body.type !== undefined) data.type = readEventType(body.type, "type");
    Object.assign(data, readUpdateScheduleFields(body));
    if (body.dayOrder !== undefined) data.dayOrder = body.dayOrder === null ? null : readNonNegativeInteger(body.dayOrder, "dayOrder");
    if (body.isAllDay !== undefined) {
      if (typeof body.isAllDay !== "boolean") throw new Error("isAllDay must be a boolean.");
      data.isAllDay = body.isAllDay;
    }
    if (body.headerImage !== undefined) data.headerImage = readHeaderImage(body.headerImage);
    if (body.location !== undefined) { validateLocation(body.location); data.location = readOptionalJson(body.location, "location"); }
    if (body.cost !== undefined) { validateCost(body.cost); data.cost = readOptionalJson(body.cost, "cost"); }
    if (body.notes !== undefined) {
      data.notes = body.notes === null ? null : readTrimmedString(body.notes, "notes", { maxBytes: 2500 });
    }
    if (body.tags !== undefined) data.tags = readTags(body.tags);

    const existing = await prisma.travelObject.findUnique({ where: { id: objectId }, include: { trip: { select: { timezone: true, startDate: true } } } });

    if (!existing) {
      return Response.json({ error: "Travel object not found." }, { status: 404 });
    }

    Object.assign(data, readLegacyUpdateScheduleFields(body, existing.trip.timezone, existing.isAllDay));

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "Provide at least one field to update." }, { status: 400 });
    }

    normalizeUpdatedScheduleData(data, existing);

    const scheduleChanged = ["date", "endDate", "startTime", "endTime", "placementTime", "isAllDay", "dayOrder"].some((field) => body[field] !== undefined);
    const travelObject = await prisma.$transaction(async (tx) => {
      const updated = await tx.travelObject.update({
        where: { id: objectId },
        data,
      });
      if (!scheduleChanged) return updated;

      const finalDate = data.date !== undefined ? data.date as Date | null : existing.date;
      const affectedDates = [existing.date, finalDate].filter((value, index, values): value is Date => value !== null && values.findIndex((candidate) => candidate?.getTime() === value.getTime()) === index);
      for (const affectedDate of affectedDates) {
        await writeDateOrder(tx, existing.tripId, affectedDate, "schedule-change");
      }
      return tx.travelObject.findUniqueOrThrow({ where: { id: objectId } });
    });

    return Response.json(withScheduleCompatibility(travelObject, existing.trip.timezone, existing.trip.startDate));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid travel object data." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { objectId } = await params;
  const existing = await prisma.travelObject.findUnique({ where: { id: objectId } });

  if (!existing) {
    return Response.json({ error: "Travel object not found." }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.travelObject.delete({ where: { id: objectId } });
    if (existing.date) await writeDateOrder(tx, existing.tripId, existing.date, "compact");
  });
  return new Response(null, { status: 204 });
}
