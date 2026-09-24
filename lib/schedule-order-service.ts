import type { Prisma } from "@prisma/client";
import { compactDayOrder, normalizeAfterScheduleChange, normalizeDayOrder, sortScheduleItems } from "./schedule-order.ts";

type OrderMode = "initial" | "schedule-change" | "compact";

/** Normalize one start date inside the caller's mutation transaction. */
export async function writeDateOrder(tx: Prisma.TransactionClient, tripId: string, date: Date, mode: OrderMode) {
  const siblings = await tx.travelObject.findMany({ where: { tripId, date } });
  const ordered = mode === "initial" ? normalizeDayOrder(siblings)
    : mode === "schedule-change" ? normalizeAfterScheduleChange(siblings)
      : compactDayOrder(siblings);
  for (const { item, dayOrder } of ordered) {
    if (item.dayOrder !== dayOrder) await tx.travelObject.update({ where: { id: item.id }, data: { dayOrder } });
  }
}

type ReorderInput = {
  tripId: string;
  objectId: string;
  date: Date;
  requestedOrder: number;
  clearTime: boolean;
  placementTime: string | null | undefined;
};

/** Apply a reorder inside the route's transaction and return the refreshed trip items. */
export async function reorderTravelObject(tx: Prisma.TransactionClient, { tripId, objectId, date, requestedOrder, clearTime, placementTime }: ReorderInput) {
  const item = await tx.travelObject.findFirst({ where: { id: objectId, tripId } });
  if (!item) throw new Error("Travel object not found.");
  const sourceDate = item.date;
  if (item.isAllDay && (clearTime || placementTime !== undefined || sourceDate?.getTime() === date.getTime())) {
    throw new Error("All-day items can only be moved to another day.");
  }
  const sourceEndDate = item.endDate ?? sourceDate;
  const durationDays = sourceDate && sourceEndDate ? Math.max(0, Math.round((sourceEndDate.getTime() - sourceDate.getTime()) / 86_400_000)) : 0;
  const destinationEndDate = new Date(date.getTime() + durationDays * 86_400_000);
  const siblings = await tx.travelObject.findMany({ where: { tripId, date, id: { not: objectId } } });
  const ordered = sortScheduleItems(siblings);
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
          endDate: item.isAllDay ? destinationEndDate : clearTime || (!item.startTime && !item.endTime) ? date : destinationEndDate,
          ...(clearTime ? { startTime: null, endTime: null, isAllDay: false, placementTime: placementTime ?? item.startTime ?? item.placementTime ?? "09:00" } : {}),
          ...(!clearTime && !item.isAllDay && !item.startTime && !item.endTime ? { placementTime: placementTime ?? item.placementTime ?? "09:00" } : {}),
        } : {}),
      },
    });
  }
  await writeDateOrder(tx, tripId, date, "initial");
  if (sourceDate !== null && sourceDate.getTime() !== date.getTime()) {
    await writeDateOrder(tx, tripId, sourceDate, "compact");
  }
  return tx.travelObject.findMany({ where: { tripId }, orderBy: [{ date: "asc" }, { dayOrder: "asc" }, { createdAt: "asc" }] });
}
