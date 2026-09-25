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
 * represent an explicit user order and are preserved. New missing-order items
 * join that sequence without moving already ordered siblings; fixed-time items
 * join near their timed anchors, and untimed items follow the existing list.
 * Legacy incomplete sequences fall back to chronological initialization.
 */
export function normalizeDayOrder<T extends OrderableItem>(items: readonly T[]) {
  const ordered = [...items].sort(byExistingOrder);
  const hasMissingOrder = ordered.some((item, index) => item.dayOrder == null || item.dayOrder !== index);
  if (!hasMissingOrder) return ordered.map((item, dayOrder) => ({ item, dayOrder }));

  const existing = ordered.filter((item) => item.dayOrder != null);
  const missing = ordered.filter((item) => item.dayOrder == null);
  if (missing.length && existing.every((item, index) => item.dayOrder === index)) {
    for (const item of missing.sort(byInitialSchedule)) {
      if (!isTimedItem(item)) { existing.push(item); continue; }
      const nextTimed = existing.findIndex((candidate) => isTimedItem(candidate) && byInitialSchedule(item, candidate) < 0);
      const lastTimedEnd = existing.reduce((end, candidate, index) => isTimedItem(candidate) ? index + 1 : end, 0);
      existing.splice(nextTimed >= 0 ? nextTimed : lastTimedEnd, 0, item);
    }
    return existing.map((item, dayOrder) => ({ item, dayOrder }));
  }
  return [...items].sort(byInitialSchedule).map((item, dayOrder) => ({ item, dayOrder }));
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

/** Translate an Itinerary gap in the visible list into the reorder route's index. */
export function itineraryDropPosition<T extends Pick<TravelObject, "id" | "date" | "startTime" | "endTime" | "isAllDay">>(visibleItems: readonly T[], moving: T, targetDate: string, gap: number) {
  const visibleGap = Number.isFinite(gap) ? Math.min(Math.max(Math.trunc(gap), 0), visibleItems.length) : visibleItems.length;
  const movingIndex = visibleItems.findIndex((item) => item.id === moving.id);
  const insertionIndex = visibleGap - (movingIndex >= 0 && movingIndex < visibleGap ? 1 : 0);
  const remaining = visibleItems.filter((item) => item.id !== moving.id);
  return {
    requestedOrder: moving.date === targetDate ? visibleGap : insertionIndex,
    betweenTimedAnchors: Boolean(remaining[insertionIndex - 1] && isTimedItem(remaining[insertionIndex - 1]))
      && Boolean(remaining[insertionIndex] && isTimedItem(remaining[insertionIndex])),
  };
}

/** Week time-slot drops use the original order expected by the reorder route. */
export function weekFlexibleDropOrder<T extends OrderableItem & { date: string | null }>(items: readonly T[], date: string, targetTime: string) {
  const ordered = items.filter((item) => item.date?.slice(0, 10) === date).sort(compareScheduleOrder);
  const nextFixed = ordered.findIndex((item) => isTimedItem(item) && item.startTime! >= targetTime);
  return nextFixed < 0 ? ordered.length : nextFixed;
}

/** Reject Day placements that contradict confirmed times or split overlapping bookings. */
export function canDropInDayOrder<T extends OrderableItem & { date: string | null; endDate: string | null }>(items: readonly T[], moving: T, date: string, requestedOrder: number) {
  const ordered = items.filter((item) => item.date?.slice(0, 10) === date).sort(compareScheduleOrder);
  const sourceIndex = ordered.findIndex((item) => item.id === moving.id);
  const gap = Number.isFinite(requestedOrder) ? Math.min(Math.max(Math.trunc(requestedOrder), 0), ordered.length) : ordered.length;
  const insertionIndex = gap - (sourceIndex >= 0 && sourceIndex < gap ? 1 : 0);
  const result = ordered.filter((item) => item.id !== moving.id);
  result.splice(insertionIndex, 0, moving);

  const fixed = result.filter(isTimedItem);
  if (fixed.some((item, index) => index > 0 && fixed[index - 1].startTime! > item.startTime!)) return false;
  if (isTimedItem(moving)) return true;

  const position = result.findIndex((item) => item.id === moving.id);
  const before = result.slice(0, position).reverse().find(isTimedItem);
  const after = result.slice(position + 1).find(isTimedItem);
  if (!before || !after) return true;
  if (before.endDate && before.endDate.slice(0, 10) > date) return false;
  return before.endTime! <= after.startTime!;
}

/** Week cards with later starts sit in front; a shorter card wins a shared start. */
export function weekFixedLayers<T extends OrderableItem>(items: readonly T[]) {
  const ordered = items.filter(isTimedItem).sort((a, b) => a.startTime!.localeCompare(b.startTime!) || b.endTime!.localeCompare(a.endTime!) || compareScheduleOrder(a, b));
  const layers = new Map<string, { left: number; zIndex: number }>();
  for (const [index, item] of ordered.entries()) {
    const depth = ordered.slice(0, index).filter((previous) => previous.startTime! < item.endTime! && previous.endTime! > item.startTime!).length;
    layers.set(item.id, { left: 4 + depth * 8, zIndex: 10 + index });
  }
  return layers;
}

/** Close gaps after removal without changing the remaining explicit order. */
export function compactDayOrder<T extends OrderableItem>(items: readonly T[]) {
  return sortScheduleItems(items).map((item, dayOrder) => ({ item, dayOrder }));
}

/** Order a complete trip collection, with undated ideas after dated items. */
export function sortTravelObjects<T extends OrderableItem & { date: string | null }>(items: readonly T[]) {
  return [...items].sort((a, b) => (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31") || compareScheduleOrder(a, b));
}

/** Apply a create response that may have shifted later siblings' stored order. */
export function mergeCreatedTravelObject<T extends OrderableItem & { date: string | null }>(items: readonly T[], created: T) {
  if (created.date === null || created.dayOrder === null) return sortTravelObjects([...items, created]);
  const createdOrder = created.dayOrder;
  const shifted = items.map((item) => item.date === created.date && item.dayOrder !== null && item.dayOrder >= createdOrder
    ? { ...item, dayOrder: item.dayOrder + 1 }
    : item);
  return sortTravelObjects([...shifted, created]);
}
