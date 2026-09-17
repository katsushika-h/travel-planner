import { readDate, readJsonBody, readTimeZone, readTrimmedString } from "@/lib/api-validation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const trips = await prisma.trip.findMany({
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
  });

  return Response.json(trips);
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const startDate = readDate(body.startDate, "startDate", true);
    const endDate = readDate(body.endDate, "endDate", true);

    if (endDate < startDate) {
      return Response.json(
        { error: "endDate must be on or after startDate." },
        { status: 400 },
      );
    }

    const trip = await prisma.trip.create({
      data: {
        title: readTrimmedString(body.title, "title")!,
        startDate,
        endDate,
        timezone: readTimeZone(body.timezone)!,
      },
    });

    return Response.json(trip, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid trip data." },
      { status: 400 },
    );
  }
}
