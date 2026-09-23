import { dayIndexForDate, endDateTimeFor, startDateTimeFor } from "./date-utils.ts";

type CanonicalObject = {
  date: Date | string | null;
  endDate: Date | string | null;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
};

function valueDate(value: Date | string | null) { return value === null ? null : typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10); }

/** Temporary API response adapter for UI code that still reads legacy fields. */
export function withScheduleCompatibility<T extends CanonicalObject>(item: T, timezone: string, tripStartDate: Date | string) {
  const date = valueDate(item.date);
  const endDate = valueDate(item.endDate);
  const canonical = { ...item, date, endDate };
  return {
    ...canonical,
    startDateTime: startDateTimeFor(canonical, timezone),
    endDateTime: endDateTimeFor(canonical, timezone),
    dayIndex: date ? dayIndexForDate(date, typeof tripStartDate === "string" ? tripStartDate : tripStartDate.toISOString()) : null,
  };
}
