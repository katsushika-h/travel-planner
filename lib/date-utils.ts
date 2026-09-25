/** Timezone-aware helpers. Database timestamps are stored as UTC. */
export function dateParts(value: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    time: `${read("hour")}:${read("minute")}`,
  };
}

export function formatTripDate(
  value: string | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(new Date(value));
}

export function dayIndexForDate(date: string, tripStartDate: string) {
  const start = Date.parse(`${tripStartDate.slice(0, 10)}T00:00:00Z`);
  const target = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((target - start) / 86_400_000) + 1;
}

/** Advance a calendar date without applying the browser or trip timezone. */
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function timezoneOffsetMs(utcMs: number, timeZone: string) {
  const { date, time } = dateParts(new Date(utcMs), timeZone);
  return Date.parse(`${date}T${time}:00Z`) - utcMs;
}

/** Converts a date/time displayed in an IANA timezone to a UTC ISO timestamp. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string) {
  const dateMs = Date.parse(`${date}T00:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(dateMs)
    && new Date(dateMs).toISOString().slice(0, 10) === date;
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (!validDate || !validTime) {
    throw new RangeError("A valid date and 24-hour time are required.");
  }
  const localMs = Date.parse(`${date}T${time}:00Z`);
  let utcMs = localMs - timezoneOffsetMs(localMs, timeZone);
  utcMs = localMs - timezoneOffsetMs(utcMs, timeZone);
  return new Date(utcMs).toISOString();
}

export function dateString(value: string | null | undefined) { return value?.slice(0, 10) ?? null; }

export function isTimed(item: { date: string | null; startTime: string | null; endTime: string | null; isAllDay: boolean }) {
  return Boolean(item.date && item.startTime && item.endTime && !item.isAllDay);
}

export function startDateTimeFor(item: { date: string | null; startTime: string | null; isAllDay: boolean }, timeZone: string) {
  return item.date && (item.startTime || item.isAllDay) ? zonedDateTimeToUtc(item.date.slice(0, 10), item.startTime ?? "00:00", timeZone) : null;
}

export function endDateTimeFor(item: { date: string | null; endDate: string | null; endTime: string | null; isAllDay: boolean }, timeZone: string) {
  const date = item.endDate?.slice(0, 10) ?? item.date?.slice(0, 10);
  return date && (item.endTime || item.isAllDay) ? zonedDateTimeToUtc(date, item.endTime ?? "00:00", timeZone) : null;
}

export function monthGrid(month: Date) {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}
