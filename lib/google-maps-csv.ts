import { dateParts, shiftDate, zonedDateTimeToUtc } from "./date-utils.ts";
import { canonicalScheduleFromInstants } from "./travel-object-compat.ts";

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") { row.push(field); field = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += character;
  }
  row.push(field); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeCategory(value: string) { return value.trim().replace(/\s+/g, " ").slice(0, 20); }
function normalizeHeader(value: string) { return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function findColumn(header: string[] | undefined, names: string[]) { return header?.findIndex((cell) => names.includes(cell)) ?? -1; }
function findTitleColumn(header: string[] | undefined) {
  return findColumn(header, ["title", "place", "place name", "location", "location name", "name"]);
}

function validDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

function parseDate(value: string) {
  const text = value.trim();
  const numeric = text.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})$/);
  if (numeric) {
    const first = Number(numeric[1]); const second = Number(numeric[2]); const third = Number(numeric[3]);
    if (numeric[1].length === 4) return validDate(first, second, third);
    const year = numeric[3].length === 2 ? (third < 70 ? 2000 + third : 1900 + third) : third;
    if (first > 12) return validDate(year, second, first);
    if (second > 12) return validDate(year, first, second);
    return validDate(year, second, first);
  }
  const parsed = Date.parse(`${text} 00:00:00 UTC`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function parseTime(value: string) {
  const text = value.trim().toLowerCase().replace(/\./g, "");
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] ?? "0"); const meridiem = match[3];
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (meridiem) { if (hour === 12) hour = 0; if (meridiem === "pm") hour += 12; }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}


function parseCombinedDateTime(value: string, timeZone: string) {
  const text = value.trim();
  if (/\dT\d.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = new Date(text);
    if (Number.isFinite(parsed.getTime())) return { iso: parsed.toISOString(), date: dateParts(parsed, timeZone).date };
  }
  const match = text.match(/^(.*?)(?:T|,?\s+)(\d{1,2}(?::\d{1,2})?(?::\d{1,2})?\s*(?:a\.?m\.?|p\.?m\.?)?)$/i);
  if (!match) return null;
  const date = parseDate(match[1]); const time = parseTime(match[2]);
  return date && time ? { iso: zonedDateTimeToUtc(date, time, timeZone), date } : null;
}

type ScheduleColumns = { date: number; time: number; dateTime: number; endDate: number; endTime: number; endDateTime: number };

function scheduleFromRow(row: string[], columns: ScheduleColumns, timeZone: string) {
  const combinedValue = columns.dateTime >= 0 ? row[columns.dateTime]?.trim() ?? "" : "";
  const dateValue = columns.date >= 0 ? row[columns.date]?.trim() ?? "" : "";
  const timeValue = columns.time >= 0 ? row[columns.time]?.trim() ?? "" : "";
  const hasSchedule = Boolean(combinedValue || dateValue || timeValue);
  if (!hasSchedule) return { ...canonicalScheduleFromInstants(null, null, false, timeZone), invalid: false };

  let start: { iso: string; date: string } | null = combinedValue ? parseCombinedDateTime(combinedValue, timeZone) : null;
  const startDate = dateValue ? parseDate(dateValue) : null;
  const startTime = timeValue ? parseTime(timeValue) : null;
  if (!start && startDate && (!timeValue || startTime)) start = { iso: zonedDateTimeToUtc(startDate, startTime ?? "00:00", timeZone), date: startDate };
  if (!start) return { ...canonicalScheduleFromInstants(null, null, false, timeZone), invalid: true };

  const isAllDay = !combinedValue && Boolean(startDate) && !timeValue;
  const endCombinedValue = columns.endDateTime >= 0 ? row[columns.endDateTime]?.trim() ?? "" : "";
  const endDateValue = columns.endDate >= 0 ? row[columns.endDate]?.trim() ?? "" : "";
  const endTimeValue = columns.endTime >= 0 ? row[columns.endTime]?.trim() ?? "" : "";
  let end = endCombinedValue ? parseCombinedDateTime(endCombinedValue, timeZone) : null;
  if (!end && (endDateValue || endTimeValue)) {
    let date = endDateValue ? parseDate(endDateValue) : start.date;
    const time = endTimeValue ? parseTime(endTimeValue) : (isAllDay ? "00:00" : startTime ?? dateParts(start.iso, timeZone).time);
    if (date && time) {
      let iso = zonedDateTimeToUtc(date, time, timeZone);
      if (!endDateValue && endTimeValue && Date.parse(iso) <= Date.parse(start.iso)) { date = shiftDate(date, 1); iso = zonedDateTimeToUtc(date, time, timeZone); }
      end = { iso, date };
    }
  }
  const defaultEnd = isAllDay ? start.iso : new Date(Date.parse(start.iso) + 3_600_000).toISOString();
  const endDateTime = end && (isAllDay ? Date.parse(end.iso) >= Date.parse(start.iso) : Date.parse(end.iso) > Date.parse(start.iso)) ? end.iso : defaultEnd;
  return { ...canonicalScheduleFromInstants(start.iso, endDateTime, isAllDay, timeZone), invalid: false };
}

/** Parse a Google Maps export without performing URL resolution or persistence. */
export function parseGoogleMapsCsv(text: string, timeZone: string, eventTypes: readonly string[]) {
  const rows = parseCsv(text);
  const header = rows.shift()?.map(normalizeHeader);
  const titleIndex = findTitleColumn(header); const noteIndex = header?.indexOf("note") ?? -1; const urlIndex = header?.indexOf("url") ?? -1;
  const categoryIndex = header?.findIndex((cell) => ["type", "category", "categories", "type category", "type/category"].includes(cell)) ?? -1;
  const scheduleColumns: ScheduleColumns = {
    date: findColumn(header, ["date", "start date"]),
    time: findColumn(header, ["time", "start time"]),
    dateTime: findColumn(header, ["datetime", "date time", "date/time", "start datetime", "start date time", "start date/time"]),
    endDate: findColumn(header, ["end date"]),
    endTime: findColumn(header, ["end time"]),
    endDateTime: findColumn(header, ["end datetime", "end date time", "end date/time"]),
  };
  if (titleIndex < 0 || noteIndex < 0 || urlIndex < 0) throw new Error("This CSV needs a Title or Place column, plus Note and URL columns from a Google Maps export.");
  const knownTypes = new Map(eventTypes.map((type) => [type.toLocaleLowerCase(), type]));
  const records = rows.map((row) => { const category = categoryIndex >= 0 ? normalizeCategory(row[categoryIndex] ?? "") : ""; return { title: row[titleIndex]?.trim() ?? "", notes: row[noteIndex]?.trim() ?? "", url: row[urlIndex]?.trim() ?? "", type: (knownTypes.get(category.toLocaleLowerCase()) ?? category) || "unclassified", schedule: scheduleFromRow(row, scheduleColumns, timeZone) }; }).filter((record) => record.title && record.url);
  if (!records.length) throw new Error("No Google Maps places were found in this CSV.");
  const newTypes = [...new Set(records.map((record) => record.type))].filter((type) => !knownTypes.has(type.toLocaleLowerCase()));
  return { records, newTypes, skipped: rows.length - records.length, invalidDates: records.filter((record) => record.schedule.invalid).length };
}
