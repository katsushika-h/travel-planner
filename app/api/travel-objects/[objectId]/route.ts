import { Prisma } from "@prisma/client";
import {
  isRecord,
  readDate,
  readEventType,
  readHeaderImage,
  readJsonBody,
  readNonNegativeInteger,
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
import { normalizeAfterScheduleChange } from "@/lib/schedule-order";

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
    if (body.date !== undefined) data.date = body.date === null ? null : readDate(body.date, "date", true);
    if (body.endDate !== undefined) data.endDate = body.endDate === null ? null : readDate(body.endDate, "endDate", true);
    if (body.startTime !== undefined) data.startTime = body.startTime === null ? null : readTime(body.startTime, "startTime");
    if (body.endTime !== undefined) data.endTime = body.endTime === null ? null : readTime(body.endTime, "endTime");
    if (body.placementTime !== undefined) data.placementTime = body.placementTime === null ? null : readPlacementTime(body.placementTime, "placementTime");
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

    // Accept the old request shape while clients are moved to the canonical
    // date/endDate/startTime/endTime representation. These values are never
    // persisted as duplicate timestamp columns.
    const hasCanonicalScheduleField = ["date", "endDate", "startTime", "endTime", "placementTime", "isAllDay", "dayOrder"].some((field) => body[field] !== undefined);
    const legacyStart = typeof body.startDateTime === "string" ? readDate(body.startDateTime, "startDateTime") : null;
    const legacyEnd = typeof body.endDateTime === "string" ? readDate(body.endDateTime, "endDateTime") : null;
    if (!hasCanonicalScheduleField && body.startDateTime === null && body.endDateTime === null) {
      data.date = null;
    } else if (!hasCanonicalScheduleField && legacyStart && legacyEnd) {
      const start = dateParts(legacyStart, existing.trip.timezone);
      const end = dateParts(legacyEnd, existing.trip.timezone);
      data.date = readDate(start.date, "date", true);
      data.endDate = readDate(end.date, "endDate", true);
      data.startTime = existing.isAllDay ? null : start.time;
      data.endTime = existing.isAllDay ? null : end.time;
      data.placementTime = null;
      data.isAllDay = existing.isAllDay;
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "Provide at least one field to update." }, { status: 400 });
    }

    let isAllDay = (data.isAllDay as boolean | undefined) ?? existing.isAllDay;
    const date = data.date !== undefined ? data.date as Date | null : existing.date;
    const endDate = data.endDate !== undefined ? data.endDate as Date | null : existing.endDate;
    const startTime = data.startTime !== undefined ? data.startTime as string | null : existing.startTime;
    const endTime = data.endTime !== undefined ? data.endTime as string | null : existing.endTime;
    const placementTime = data.placementTime !== undefined ? data.placementTime as string | null : existing.placementTime;
    if (date === null) {
      data.date = null;
      data.endDate = null;
      data.placementTime = null;
      data.dayOrder = null;
      data.isAllDay = false;
      isAllDay = false;
      if ((startTime === null) !== (endTime === null)) {
        throw new Error("startTime and endTime must both be set or both be null.");
      }
    } else {
      const finalEndDate = endDate ?? date;
      if (finalEndDate < date) throw new Error("endDate must be on or after date.");
      data.endDate = finalEndDate;
      if (isAllDay) {
        if (startTime || endTime) throw new Error("All-day items cannot have times.");
        data.startTime = null;
        data.endTime = null;
        data.placementTime = null;
      } else if ((startTime === null) !== (endTime === null)) {
        throw new Error("startTime and endTime must both be set or both be null.");
      } else if (startTime && endTime && finalEndDate.getTime() === date.getTime() && endTime <= startTime) {
        throw new Error("endTime must be after startTime on the same date.");
      } else if (startTime && endTime) {
        if (data.placementTime !== undefined && placementTime) throw new Error("placementTime is only for flexible items without confirmed times.");
        data.placementTime = null;
      } else {
        data.placementTime = placementTime ?? "09:00";
      }
    }

    const scheduleChanged = ["date", "endDate", "startTime", "endTime", "placementTime", "isAllDay", "dayOrder"].some((field) => body[field] !== undefined);
    const travelObject = await prisma.$transaction(async (tx) => {
      const updated = await tx.travelObject.update({
        where: { id: objectId },
        data,
      });
      if (!scheduleChanged) return updated;

      const affectedDates = [existing.date, date].filter((value, index, values): value is Date => value !== null && values.findIndex((candidate) => candidate?.getTime() === value.getTime()) === index);
      for (const affectedDate of affectedDates) {
        const siblings = await tx.travelObject.findMany({ where: { tripId: existing.tripId, date: affectedDate } });
        for (const { item: sibling, dayOrder } of normalizeAfterScheduleChange(siblings)) {
          if (sibling.dayOrder !== dayOrder) await tx.travelObject.update({ where: { id: sibling.id }, data: { dayOrder } });
        }
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

  await prisma.travelObject.delete({ where: { id: objectId } });
  return new Response(null, { status: 204 });
}
