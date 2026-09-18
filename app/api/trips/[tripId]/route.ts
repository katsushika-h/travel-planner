import { isRecord, readDate, readJsonBody, readTimeZone, readTrimmedString } from "@/lib/api-validation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ tripId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { tripId } = await params;
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });

  return trip
    ? Response.json(trip)
    : Response.json({ error: "Trip not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { tripId } = await params;
    const body = await readJsonBody(request);
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = readTrimmedString(body.title, "title");
    if (body.startDate !== undefined) data.startDate = readDate(body.startDate, "startDate", true);
    if (body.endDate !== undefined) data.endDate = readDate(body.endDate, "endDate", true);
    if (body.timezone !== undefined) data.timezone = readTimeZone(body.timezone);
    if (body.defaultCurrency !== undefined) {
      if (typeof body.defaultCurrency !== "string" || !/^[A-Z]{3}$/.test(body.defaultCurrency)) throw new Error("defaultCurrency must be a three-letter currency code.");
      data.defaultCurrency = body.defaultCurrency;
    }

    if (!isRecord(data) || Object.keys(data).length === 0) {
      return Response.json({ error: "Provide at least one field to update." }, { status: 400 });
    }

    const existing = await prisma.trip.findUnique({ where: { id: tripId } });

    if (!existing) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const startDate = (data.startDate as Date | undefined) ?? existing.startDate;
    const endDate = (data.endDate as Date | undefined) ?? existing.endDate;

    if (endDate < startDate) {
      return Response.json(
        { error: "endDate must be on or after startDate." },
        { status: 400 },
      );
    }

    const trip = await prisma.trip.update({
      where: { id: tripId },
      data,
    });

    return Response.json(trip);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid trip data." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { tripId } = await params;
  const existing = await prisma.trip.findUnique({ where: { id: tripId } });

  if (!existing) {
    return Response.json({ error: "Trip not found." }, { status: 404 });
  }

  await prisma.trip.delete({ where: { id: tripId } });
  return new Response(null, { status: 204 });
}
