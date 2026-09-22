import { Prisma } from "@prisma/client";
import { readDate, readJsonBody, readNonNegativeInteger, readPlacementTime, readTrimmedString } from "@/lib/api-validation";
import { prisma } from "@/lib/prisma";
import { withScheduleCompatibility } from "@/lib/travel-object-compat";
import { normalizeDayOrder } from "@/lib/schedule-order";

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

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.travelObject.findFirst({ where: { id: objectId, tripId } });
      if (!item) throw new Error("Travel object not found.");
      const sourceDate = item.date;
      const sourceEndDate = item.endDate ?? sourceDate;
      const durationDays = sourceDate && sourceEndDate ? Math.max(0, Math.round((sourceEndDate.getTime() - sourceDate.getTime()) / 86_400_000)) : 0;
      const destinationEndDate = new Date(date.getTime() + durationDays * 86_400_000);
      const siblings = await tx.travelObject.findMany({ where: { tripId, date, id: { not: objectId } } });
      siblings.sort((a, b) => (a.dayOrder ?? Number.MAX_SAFE_INTEGER) - (b.dayOrder ?? Number.MAX_SAFE_INTEGER) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
      const ordered = [...siblings];
      const sourceOrder = sourceDate?.getTime() === date.getTime() ? item.dayOrder : null;
      const insertionOrder = sourceOrder != null && sourceOrder < requestedOrder ? requestedOrder - 1 : requestedOrder;
      ordered.splice(Math.min(Math.max(insertionOrder, 0), siblings.length), 0, item);
      for (const [index, sibling] of ordered.entries()) {
        await tx.travelObject.update({
          where: { id: sibling.id },
          data: {
            dayOrder: index,
            ...(sibling.id === objectId ? {
              date,
              endDate: clearTime || (!item.startTime && !item.endTime) ? date : destinationEndDate,
              ...(clearTime ? { startTime: null, endTime: null, isAllDay: false, placementTime: placementTime ?? item.startTime ?? item.placementTime ?? "09:00" } : {}),
              ...(!clearTime && !item.startTime && !item.endTime ? { placementTime: placementTime ?? item.placementTime ?? "09:00" } : {}),
            } : {}),
          },
        });
      }
      const destinationItems = await tx.travelObject.findMany({ where: { tripId, date } });
      for (const { item: destinationItem, dayOrder: normalizedOrder } of normalizeDayOrder(destinationItems)) {
        if (destinationItem.dayOrder !== normalizedOrder) await tx.travelObject.update({ where: { id: destinationItem.id }, data: { dayOrder: normalizedOrder } });
      }
      if (sourceDate !== null && sourceDate.getTime() !== date.getTime()) {
        const remaining = await tx.travelObject.findMany({ where: { tripId, date: sourceDate, id: { not: objectId } }, orderBy: [{ dayOrder: "asc" }, { createdAt: "asc" }] });
        for (const [index, sibling] of remaining.entries()) await tx.travelObject.update({ where: { id: sibling.id }, data: { dayOrder: index } });
      }
      return tx.travelObject.findMany({ where: { tripId }, orderBy: [{ date: "asc" }, { dayOrder: "asc" }, { createdAt: "asc" }] });
    });
    return Response.json(result.map((item) => withScheduleCompatibility(item, trip.timezone, trip.startDate)));
  } catch (error) {
    return Response.json({ error: error instanceof Prisma.PrismaClientKnownRequestError ? "Could not reorder travel objects." : error instanceof Error ? error.message : "Invalid reorder request." }, { status: 400 });
  }
}
