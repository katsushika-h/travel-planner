import { isNote } from "./note-domain.ts";
import type { CreateTravelObjectInput, TravelObject } from "../types/travel.ts";

/** Create payload for a copy of an item. Attachments, linked expenses, and day order are not copied. */
export function duplicateCreateInput(item: TravelObject): CreateTravelObjectInput {
  const date = item.date?.slice(0, 10) ?? null;
  return {
    tripId: item.tripId,
    title: item.title,
    type: item.type,
    isAllDay: date ? item.isAllDay : false,
    date,
    endDate: date ? (item.endDate?.slice(0, 10) ?? date) : null,
    startTime: item.startTime,
    endTime: item.endTime,
    placementTime: item.placementTime,
    headerImage: item.headerImage ?? null,
    location: item.location ?? null,
    cost: item.cost ?? null,
    notes: item.notes ?? null,
    tags: [...(item.tags ?? [])],
  };
}

/** Day order that puts a copy directly after its original, or null when it should stay where the server put it. */
export function duplicateDayOrder(original: Pick<TravelObject, "date" | "dayOrder" | "isAllDay">): number | null {
  if (!original.date || original.isAllDay || original.dayOrder === null) return null;
  return original.dayOrder + 1;
}

/** Only events are duplicated; day notes are skipped. */
export function duplicableItems<T extends { kind?: string }>(items: readonly T[]): T[] {
  return items.filter((item) => !isNote(item));
}
