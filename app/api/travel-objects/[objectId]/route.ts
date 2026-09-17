import { Prisma } from "@prisma/client";
import {
  isRecord,
  readDate,
  readEventType,
  readJsonBody,
  readPositiveInteger,
  readTags,
  readTrimmedString,
} from "@/lib/api-validation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ objectId: string }> };

function readOptionalJson(value: unknown, field: string) {
  if (value === null) return Prisma.JsonNull;
  if (!isRecord(value)) throw new Error(`${field} must be a JSON object or null.`);
  return value as Prisma.InputJsonValue;
}

export async function GET(_request: Request, { params }: Context) {
  const { objectId } = await params;
  const travelObject = await prisma.travelObject.findUnique({ where: { id: objectId } });

  return travelObject
    ? Response.json(travelObject)
    : Response.json({ error: "Travel object not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { objectId } = await params;
    const body = await readJsonBody(request);
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = readTrimmedString(body.title, "title");
    if (body.type !== undefined) data.type = readEventType(body.type, "type");
    if (body.startDateTime !== undefined) data.startDateTime = readDate(body.startDateTime, "startDateTime");
    if (body.endDateTime !== undefined) data.endDateTime = readDate(body.endDateTime, "endDateTime");
    if (body.dayIndex !== undefined) data.dayIndex = readPositiveInteger(body.dayIndex, "dayIndex");
    if (body.isAllDay !== undefined) {
      if (typeof body.isAllDay !== "boolean") throw new Error("isAllDay must be a boolean.");
      data.isAllDay = body.isAllDay;
    }
    if (body.location !== undefined) data.location = readOptionalJson(body.location, "location");
    if (body.cost !== undefined) data.cost = readOptionalJson(body.cost, "cost");
    if (body.notes !== undefined) {
      data.notes = body.notes === null ? null : readTrimmedString(body.notes, "notes");
    }
    if (body.tags !== undefined) data.tags = readTags(body.tags);

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "Provide at least one field to update." }, { status: 400 });
    }

    const existing = await prisma.travelObject.findUnique({ where: { id: objectId } });

    if (!existing) {
      return Response.json({ error: "Travel object not found." }, { status: 404 });
    }

    const startDateTime = (data.startDateTime as Date | undefined) ?? existing.startDateTime;
    const endDateTime = (data.endDateTime as Date | undefined) ?? existing.endDateTime;

    const isAllDay = (data.isAllDay as boolean | undefined) ?? existing.isAllDay;
    if (isAllDay ? endDateTime < startDateTime : endDateTime <= startDateTime) {
      return Response.json(
        { error: isAllDay ? "endDateTime must be on or after startDateTime." : "endDateTime must be after startDateTime." },
        { status: 400 },
      );
    }

    const travelObject = await prisma.travelObject.update({
      where: { id: objectId },
      data,
    });

    return Response.json(travelObject);
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
