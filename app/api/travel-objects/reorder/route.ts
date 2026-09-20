import { Prisma } from "@prisma/client";
import { readJsonBody, readNonNegativeInteger, readPositiveInteger, readTrimmedString } from "@/lib/api-validation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const tripId = readTrimmedString(body.tripId, "tripId")!;
    const objectId = readTrimmedString(body.objectId, "objectId")!;
    const dayIndex = readPositiveInteger(body.dayIndex, "dayIndex");
    const requestedOrder = readNonNegativeInteger(body.dayOrder, "dayOrder");
    const clearTime = body.clearTime === true;

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.travelObject.findFirst({ where: { id: objectId, tripId } });
      if (!item) throw new Error("Travel object not found.");
      const siblings = await tx.travelObject.findMany({ where: { tripId, dayIndex, id: { not: objectId } } });
      siblings.sort((a, b) => (a.dayOrder ?? Number.MAX_SAFE_INTEGER) - (b.dayOrder ?? Number.MAX_SAFE_INTEGER) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
      const ordered = [...siblings];
      ordered.splice(Math.min(requestedOrder, siblings.length), 0, item);
      for (const [index, sibling] of ordered.entries()) {
        await tx.travelObject.update({ where: { id: sibling.id }, data: { dayIndex, dayOrder: index, ...(sibling.id === objectId && clearTime ? { startDateTime: null, endDateTime: null, isAllDay: false } : {}) } });
      }
      return tx.travelObject.findMany({ where: { tripId }, orderBy: [{ dayIndex: "asc" }, { dayOrder: "asc" }, { startDateTime: "asc" }, { createdAt: "asc" }] });
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Prisma.PrismaClientKnownRequestError ? "Could not reorder travel objects." : error instanceof Error ? error.message : "Invalid reorder request." }, { status: 400 });
  }
}
