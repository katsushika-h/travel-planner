import { attachmentContentType } from "@/lib/attachment-types";
import { serializeExpense } from "@/lib/expense-serialization";
import { prisma } from "@/lib/prisma";
import { serializeTravelObject } from "@/lib/travel-object-serialization";
import { createTripOfflineHtml, offlineFileName, type OfflineAttachment } from "@/lib/trip-offline-html";
import type { Expense, TravelObject, Trip } from "@/types/travel";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ tripId: string }> };

/** Downloads one trip as a self-contained, read-only HTML file, attachments included. */
export async function GET(_request: Request, { params }: Context) {
  const { tripId } = await params;
  const [trip, travelObjects, expenses, attachments] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId } }),
    prisma.travelObject.findMany({
      where: { tripId },
      orderBy: [{ date: "asc" }, { dayOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.expense.findMany({ where: { tripId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.travelAttachment.findMany({ where: { travelObject: { tripId } }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!trip) return Response.json({ error: "Trip not found." }, { status: 404 });

  const files = new Map<string, OfflineAttachment[]>();
  for (const attachment of attachments) {
    files.set(attachment.travelObjectId, [
      ...(files.get(attachment.travelObjectId) ?? []),
      {
        fileName: attachment.fileName,
        contentType: attachmentContentType(attachment.fileName),
        base64: Buffer.from(attachment.data).toString("base64"),
      },
    ]);
  }

  // Same JSON shapes the API returns to the browser.
  const data = JSON.parse(
    JSON.stringify({ trip, items: travelObjects.map(serializeTravelObject), expenses: expenses.map(serializeExpense) }),
  ) as { trip: Trip; items: TravelObject[]; expenses: Expense[] };

  const html = createTripOfflineHtml({ ...data, attachments: files });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(offlineFileName(trip.title))}`,
      "Cache-Control": "no-store",
    },
  });
}
