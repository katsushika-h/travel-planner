import type { TravelObject } from "@/types/travel";

type OrderableItem = Omit<Pick<TravelObject, "id" | "dayOrder" | "startTime" | "endTime" | "isAllDay">, never> & { createdAt: string | Date };

const LAST = Number.MAX_SAFE_INTEGER;

export function isTimedItem(item: Pick<TravelObject, "startTime" | "endTime" | "isAllDay">) {
  return !item.isAllDay && Boolean(item.startTime && item.endTime);
}

function stableOrder(item: OrderableItem) {
  return item.dayOrder ?? LAST;
}

function createdAtValue(item: OrderableItem) {
  return item.createdAt instanceof Date ? item.createdAt.getTime() : Date.parse(item.createdAt);
}

function byExistingOrder(a: OrderableItem, b: OrderableItem) {
  return stableOrder(a) - stableOrder(b)
    || createdAtValue(a) - createdAtValue(b)
    || a.id.localeCompare(b.id);
}

function byInitialSchedule(a: OrderableItem, b: OrderableItem) {
  const aTimed = isTimedItem(a);
  const bTimed = isTimedItem(b);
  if (aTimed !== bTimed) return aTimed ? -1 : 1;
  if (aTimed && bTimed) return a.startTime!.localeCompare(b.startTime!) || a.endTime!.localeCompare(b.endTime!) || byExistingOrder(a, b);
  return byExistingOrder(a, b);
}

/**
 * Returns the canonical order for one date. Existing complete dayOrder values
 * represent an explicit user order and are preserved. Missing values are
 * initialized with timed items first, in chronological order, followed by
 * flexible items in their stable existing order.
 */
export function normalizeDayOrder<T extends OrderableItem>(items: readonly T[]) {
  const ordered = [...items].sort(byExistingOrder);
  const hasMissingOrder = ordered.some((item, index) => item.dayOrder == null || item.dayOrder !== index);
  return (hasMissingOrder ? [...items].sort(byInitialSchedule) : ordered).map((item, index) => ({ item, dayOrder: index }));
}

/** Reorders fixed items after a time edit while keeping flexible items in their existing gaps. */
export function normalizeAfterScheduleChange<T extends OrderableItem>(items: readonly T[]) {
  const current = [...items].sort(byExistingOrder);
  const complete = current.every((item, index) => item.dayOrder === index);
  if (!complete) return normalizeDayOrder(items);
  const timed = current.filter(isTimedItem).sort((a, b) => a.startTime!.localeCompare(b.startTime!) || a.endTime!.localeCompare(b.endTime!) || byExistingOrder(a, b));
  const timedPositions = current.flatMap((item, index) => isTimedItem(item) ? [index] : []);
  const replacement = new Map(timedPositions.map((position, index) => [position, timed[index]]));
  return current.map((item, index) => ({ item: replacement.get(index) ?? item, dayOrder: index }));
}

/** The only comparator used by Day, Week, Kanban and the client shell. */
export function compareScheduleOrder(a: OrderableItem, b: OrderableItem) {
  return byExistingOrder(a, b);
}

/** Day presentation keeps all-day items above the ordered itinerary. */
export function compareDayDisplayOrder(a: OrderableItem, b: OrderableItem) {
  return Number(b.isAllDay) - Number(a.isAllDay) || compareScheduleOrder(a, b);
}

export function sortScheduleItems<T extends OrderableItem>(items: readonly T[]) {
  return [...items].sort(compareScheduleOrder);
}

/** Close gaps after removal without changing the remaining explicit order. */
export function compactDayOrder<T extends OrderableItem>(items: readonly T[]) {
  return sortScheduleItems(items).map((item, dayOrder) => ({ item, dayOrder }));
}

/** Order a complete trip collection, with undated ideas after dated items. */
export function sortTravelObjects<T extends OrderableItem & { date: string | null }>(items: readonly T[]) {
  return [...items].sort((a, b) => (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31") || compareScheduleOrder(a, b));
}
