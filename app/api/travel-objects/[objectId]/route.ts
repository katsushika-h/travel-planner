import {
  readJsonBody,
  rejectLegacyScheduleFields,
  readNonNegativeInteger,
  readTravelObjectContent,
  readTravelObjectIdentity,
} from "@/lib/api-validation";
import { normalizeUpdatedScheduleData, readUpdateScheduleFields } from "@/lib/api-schedule";
import { prisma } from "@/lib/prisma";
import { serializeTravelObject } from "@/lib/travel-object-serialization";
import { writeDateOrder } from "@/lib/schedule-order-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ objectId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { objectId } = await params;
  const travelObject = await prisma.travelObject.findUnique({ where: { id: objectId }, include: { trip: { select: { timezone: true, startDate: true } } } });

  return travelObject
    ? Response.json(serializeTravelObject(travelObject))
    : Response.json({ error: "Travel object not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { objectId } = await params;
    const body = await readJsonBody(request);
    rejectLegacyScheduleFields(body);
    const data: Record<string, unknown> = {};

    Object.assign(data, readTravelObjectIdentity(body, "update"));
    Object.assign(data, readUpdateScheduleFields(body));
    if (body.dayOrder !== undefined) data.dayOrder = body.dayOrder === null ? null : readNonNegativeInteger(body.dayOrder, "dayOrder");
    if (body.isAllDay !== undefined) {
      if (typeof body.isAllDay !== "boolean") throw new Error("isAllDay must be a boolean.");
      data.isAllDay = body.isAllDay;
    }
    Object.assign(data, readTravelObjectContent(body, "update"));

    const existing = await prisma.travelObject.findUnique({ where: { id: objectId } });

    if (!existing) {
      return Response.json({ error: "Travel object not found." }, { status: 404 });
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "Provide at least one field to update." }, { status: 400 });
    }

    const scheduleChanged = ["date", "endDate", "startTime", "endTime", "placementTime", "isAllDay", "dayOrder"].some((field) => Object.hasOwn(data, field));
    normalizeUpdatedScheduleData(data, existing);

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

    return Response.json(serializeTravelObject(travelObject));
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
