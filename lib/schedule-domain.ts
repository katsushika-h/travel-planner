import { dateParts, endDateTimeFor, startDateTimeFor, zonedDateTimeToUtc } from "./date-utils.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

type ScheduleRange = { date: string | null; endDate: string | null; startTime: string | null; endTime: string | null; isAllDay: boolean };

/** Default end for a fixed-time item: one elapsed hour in the trip timezone. */
export function oneHourEnd(date: string, startTime: string, timeZone: string) {
  const start = zonedDateTimeToUtc(date, startTime, timeZone);
  const end = new Date(Date.parse(start) + 60 * MINUTE_MS);
  const parts = dateParts(end, timeZone);
  return { endDate: parts.date, endTime: parts.time };
}

export function scheduleKind(item: Pick<ScheduleRange, "date" | "startTime" | "endTime" | "isAllDay">) {
  if (item.isAllDay) return "all-day";
  if (!item.date) return "unscheduled";
  if (item.startTime && item.endTime) return "fixed";
  return "flexible";
}

/** Itinerary spans all-day and fixed ranges, but places flexible items only on their start date. */
export function occursOnItineraryDate(item: ScheduleRange, date: string) {
  if (!item.date) return false;
  if (scheduleKind(item) === "flexible") return item.date === date;
  return item.date <= date && date <= (item.endDate ?? item.date);
}

/** Move a multi-day item by the dragged date's offset, retaining its start-day relationship. */
export function allDayDropStartDate(startDate: string, draggedDate: string, targetDate: string) {
  const days = Math.round((Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${draggedDate}T00:00:00Z`)) / DAY_MS);
  return new Date(Date.parse(`${startDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Place an undated or flexible item, retaining saved times when present. */
export function placeUnfixedItem(item: { startTime: string | null; endTime: string | null; placementTime: string | null }, targetDate: string, targetTime?: string) {
  if (!targetTime && !item.startTime && !item.endTime) {
    return { kind: "flexible" as const, date: targetDate, endDate: targetDate, startTime: null, endTime: null, placementTime: item.placementTime ?? "09:00", isAllDay: false };
  }
  const startTime = targetTime ?? item.startTime ?? "09:00";
  const defaultEnd = item.endTime ? null : new Date(Date.parse(`${targetDate}T${startTime}:00Z`) + 60 * MINUTE_MS).toISOString();
  return {
    kind: "fixed" as const,
    date: targetDate,
    endDate: item.endTime ? targetDate : defaultEnd!.slice(0, 10),
    startTime,
    endTime: item.endTime ?? defaultEnd!.slice(11, 16),
    placementTime: null,
    isAllDay: false,
  };
}

/** Elapsed duration for display, derived from canonical fields in the trip timezone. */
export function elapsedDurationMinutes(schedule: ScheduleRange, timeZone: string) {
  const start = startDateTimeFor(schedule, timeZone);
  const end = endDateTimeFor(schedule, timeZone);
  if (!start || !end) return null;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / MINUTE_MS));
}

/** Inclusive calendar-day length for an all-day range, independent of DST. */
export function allDayCalendarDays(schedule: Pick<ScheduleRange, "date" | "endDate" | "isAllDay">) {
  if (!schedule.isAllDay || !schedule.date) return null;
  const start = Date.parse(`${schedule.date}T00:00:00Z`);
  const end = Date.parse(`${schedule.endDate ?? schedule.date}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / DAY_MS) + 1;
}

/** Canonical end date after changing an all-day item's inclusive day count. */
export function endForAllDayCalendarDays(schedule: Pick<ScheduleRange, "date" | "isAllDay">, calendarDays: number) {
  if (!schedule.isAllDay || !schedule.date || !Number.isSafeInteger(calendarDays) || calendarDays < 1) return null;
  const end = new Date(Date.parse(`${schedule.date}T00:00:00Z`) + (calendarDays - 1) * DAY_MS);
  if (!Number.isFinite(end.getTime())) return null;
  const endDate = end.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? { endDate } : null;
}

/** Canonical end fields for a fixed-time Table length edit. */
export function endForElapsedDuration(schedule: ScheduleRange, durationMinutes: number, timeZone: string) {
  if (scheduleKind(schedule) !== "fixed") return null;
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) return null;
  const start = startDateTimeFor(schedule, timeZone);
  if (!start) return null;
  const end = new Date(Date.parse(start) + durationMinutes * MINUTE_MS);
  const parts = dateParts(end, timeZone);
  return { endDate: parts.date, endTime: parts.time };
}

/** Move a Table start edit while retaining each item's elapsed duration. */
export function scheduleAtTableStart(schedule: ScheduleRange, targetDate: string, targetTime: string, timeZone: string) {
  if (schedule.isAllDay && schedule.date) {
    return { ...moveAllDayRange(schedule.date, schedule.endDate ?? schedule.date, targetDate), startTime: null, endTime: null, placementTime: null };
  }
  const durationMinutes = Math.max(15, elapsedDurationMinutes(schedule, timeZone) ?? 60);
  const start = zonedDateTimeToUtc(targetDate, targetTime, timeZone);
  const normalizedStart = dateParts(start, timeZone);
  const end = dateParts(new Date(Date.parse(start) + durationMinutes * MINUTE_MS), timeZone);
  return {
    date: normalizedStart.date,
    endDate: end.date,
    startTime: normalizedStart.time,
    endTime: end.time,
    placementTime: null,
  };
}

/** Keep an all-day item's inclusive date span when moving it to another date. */
export function moveAllDayRange(sourceDate: string, sourceEndDate: string, targetDate: string) {
  const durationDays = Math.max(0, Math.round((Date.parse(`${sourceEndDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / DAY_MS));
  const endDate = new Date(Date.parse(`${targetDate}T00:00:00Z`) + durationDays * DAY_MS).toISOString().slice(0, 10);
  return {
    date: targetDate,
    endDate,
  };
}

/** Preserve the displayed wall-clock span, rather than elapsed UTC hours, across DST moves. */
export function moveFixedTimeRange(sourceDate: string, sourceEndDate: string, sourceStartTime: string, sourceEndTime: string, targetDate: string, targetTime?: string) {
  const wallStart = Date.parse(`${sourceDate}T${sourceStartTime}:00Z`);
  const wallEnd = Date.parse(`${sourceEndDate}T${sourceEndTime}:00Z`);
  const durationMinutes = Math.max(15, Math.round((wallEnd - wallStart) / MINUTE_MS));
  const startTime = targetTime ?? sourceStartTime;
  const targetWallStart = Date.parse(`${targetDate}T${startTime}:00Z`);
  const targetWallEnd = new Date(targetWallStart + durationMinutes * MINUTE_MS);
  const targetEndDate = targetWallEnd.toISOString().slice(0, 10);
  const targetEndTime = targetWallEnd.toISOString().slice(11, 16);
  return {
    date: targetDate,
    endDate: targetEndDate,
    startTime,
    endTime: targetEndTime,
  };
}

/** Change one confirmed time edge without changing the stored date range. */
export function resizeFixedTimeRange(date: string, endDate: string | null, startTime: string, endTime: string, edge: "start" | "end", time: string) {
  return {
    date,
    endDate: endDate ?? date,
    startTime: edge === "start" ? time : startTime,
    endTime: edge === "end" ? time : endTime,
  };
}

type WallStart = { date: string | null; startTime: string | null; isAllDay: boolean };

function wallStart(item: WallStart, timeZone: string) {
  const timestamp = startDateTimeFor(item, timeZone);
  return timestamp ? dateParts(timestamp, timeZone) : null;
}

/** Keep selected items' displayed offsets from the dragged item. */
export function groupedMoveTarget(anchor: WallStart, item: WallStart, targetDate: string, timeZone: string, targetTime?: string) {
  const anchorStart = wallStart(anchor, timeZone);
  const itemStart = wallStart(item, timeZone);
  const destinationTime = targetTime ?? anchorStart?.time ?? "09:00";
  if (!anchorStart || !itemStart) return { date: targetDate, time: destinationTime };
  const destinationWall = Date.parse(`${targetDate}T${destinationTime}:00Z`);
  const anchorWall = Date.parse(`${anchorStart.date}T${anchorStart.time}:00Z`);
  const itemWall = Date.parse(`${itemStart.date}T${itemStart.time}:00Z`);
  const shifted = new Date(itemWall + destinationWall - anchorWall).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}
