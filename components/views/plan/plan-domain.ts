import { formatExpenseAmount } from "../../../lib/expense-domain.ts";
import { shiftDate } from "../../../lib/date-utils.ts";
import { hasMapCoordinates } from "../../../lib/map-coordinates.ts";
import { scheduleKind } from "../../../lib/schedule-domain.ts";
import type { LocationData, TravelObject } from "../../../types/travel.ts";

/** Pure helpers for the Plan view; kept free of React so they can be tested directly. */

/** Every date from the trip start to its end, inclusive. */
export function tripDays(startDate: string, endDate: string) {
  const days: string[] = [];
  const end = endDate.slice(0, 10);
  for (let date = startDate.slice(0, 10), guard = 0; date <= end && guard < 1000; date = shiftDate(date, 1), guard++)
    days.push(date);
  return days;
}

/** Large time column: fixed start, `~HH:MM` for a flexible placement, or a plain label. */
export function stopTimeLabel(
  item: Pick<TravelObject, "startTime" | "endTime" | "isAllDay" | "date" | "placementTime">,
) {
  const kind = scheduleKind(item);
  if (kind === "all-day") return "All day";
  if (kind === "fixed") return item.startTime!;
  return item.placementTime ? `~${item.placementTime}` : "Flexible";
}

/** Whether the time column states a confirmed booking time. */
export function isConfirmedTime(item: Pick<TravelObject, "startTime" | "endTime" | "isAllDay" | "date">) {
  return scheduleKind(item) === "fixed";
}

/** The mapped stops of a day are numbered in list order; stops without coordinates get no number. */
export function stopNumbers(events: readonly Pick<TravelObject, "id" | "location">[]) {
  const numbers = new Map<string, number>();
  for (const item of events) if (hasMapCoordinates(item.location)) numbers.set(item.id, numbers.size + 1);
  return numbers;
}

export function formatPlannedCost(amount: number, currency: string) {
  return amount === 0 ? "Free" : formatExpenseAmount(amount, currency);
}

/** Planned item costs only (never actual expenses), totalled per currency without conversion. */
export function plannedTotals(items: readonly Pick<TravelObject, "cost">[]) {
  const totals = new Map<string, number>();
  for (const { cost } of items) {
    if (!cost || typeof cost.amount !== "number" || !Number.isFinite(cost.amount) || cost.amount <= 0) continue;
    totals.set(cost.currency, (totals.get(cost.currency) ?? 0) + cost.amount);
  }
  return [...totals].map(([currency, amount]) => formatPlannedCost(amount, currency));
}

/** Muted second line: type, place, and what kind of time the stop has. */
export function stopMeta(
  item: Pick<TravelObject, "type" | "location" | "startTime" | "endTime" | "isAllDay" | "date" | "endDate">,
) {
  const kind = scheduleKind(item);
  const parts: string[] = [item.type];
  const place = item.location?.name ?? item.location?.address;
  if (place) parts.push(place);
  if (kind === "fixed" && item.endTime) {
    const sameDay = !item.endDate || item.endDate.slice(0, 10) === item.date?.slice(0, 10);
    parts.push(sameDay ? `until ${item.endTime}` : `until ${item.endDate!.slice(5, 10)} ${item.endTime}`);
  }
  if (kind === "flexible") parts.push("flexible");
  if (kind === "all-day" && item.endDate && item.date && item.endDate.slice(0, 10) !== item.date.slice(0, 10))
    parts.push(`through ${item.endDate.slice(5, 10)}`);
  if (!item.location?.name && !item.location?.address) parts.push("no location");
  return parts.join(" · ");
}

export function safeMapsHref(location: LocationData | null | undefined) {
  const url = location?.googleMapsUrl;
  if (url?.startsWith("https://") || url?.startsWith("http://")) return url;
  const query = location?.name || location?.address;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}
