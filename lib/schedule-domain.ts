import { endDateTimeFor, startDateTimeFor } from "./date-utils.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

type ScheduleRange = { date: string | null; endDate: string | null; startTime: string | null; endTime: string | null; isAllDay: boolean };

export function scheduleKind(item: Pick<ScheduleRange, "date" | "startTime" | "endTime" | "isAllDay">) {
  if (item.isAllDay) return "all-day";
  if (!item.date) return "unscheduled";
  if (item.startTime && item.endTime) return "fixed";
  return "flexible";
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
