"use client";

import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { dateParts, dayIndexForDate, zonedDateTimeToUtc } from "@/lib/date-utils";
import type { TravelObject, Trip } from "@/types/travel";

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

function truncateUtf8(value: string, maxBytes: number) { let result = ""; for (const character of value) { if (new TextEncoder().encode(result + character).byteLength > maxBytes) break; result += character; } return result; }
function normalizeCategory(value: string) { return value.trim().replace(/\s+/g, " ").slice(0, 20); }
function normalizeHeader(value: string) { return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function findColumn(header: string[] | undefined, names: string[]) { return header?.findIndex((cell) => names.includes(cell)) ?? -1; }
function findTitleColumn(header: string[] | undefined) {
  return findColumn(header, ["title", "place", "place name", "location", "location name", "name"]);
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, worker: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
  return results;
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

function nextDate(date: string) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }

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

function scheduleFromRow(row: string[], columns: ScheduleColumns, trip: Trip) {
  const combinedValue = columns.dateTime >= 0 ? row[columns.dateTime]?.trim() ?? "" : "";
  const dateValue = columns.date >= 0 ? row[columns.date]?.trim() ?? "" : "";
  const timeValue = columns.time >= 0 ? row[columns.time]?.trim() ?? "" : "";
  const hasSchedule = Boolean(combinedValue || dateValue || timeValue);
  if (!hasSchedule) return { startDateTime: null, endDateTime: null, dayIndex: null, isAllDay: false, invalid: false };

  let start: { iso: string; date: string } | null = combinedValue ? parseCombinedDateTime(combinedValue, trip.timezone) : null;
  const startDate = dateValue ? parseDate(dateValue) : null;
  const startTime = timeValue ? parseTime(timeValue) : null;
  if (!start && startDate && (!timeValue || startTime)) start = { iso: zonedDateTimeToUtc(startDate, startTime ?? "00:00", trip.timezone), date: startDate };
  if (!start) return { startDateTime: null, endDateTime: null, dayIndex: null, isAllDay: false, invalid: true };

  const isAllDay = !combinedValue && Boolean(startDate) && !timeValue;
  const endCombinedValue = columns.endDateTime >= 0 ? row[columns.endDateTime]?.trim() ?? "" : "";
  const endDateValue = columns.endDate >= 0 ? row[columns.endDate]?.trim() ?? "" : "";
  const endTimeValue = columns.endTime >= 0 ? row[columns.endTime]?.trim() ?? "" : "";
  let end = endCombinedValue ? parseCombinedDateTime(endCombinedValue, trip.timezone) : null;
  if (!end && (endDateValue || endTimeValue)) {
    let date = endDateValue ? parseDate(endDateValue) : start.date;
    const time = endTimeValue ? parseTime(endTimeValue) : (isAllDay ? "00:00" : startTime ?? dateParts(start.iso, trip.timezone).time);
    if (date && time) {
      let iso = zonedDateTimeToUtc(date, time, trip.timezone);
      if (!endDateValue && endTimeValue && Date.parse(iso) <= Date.parse(start.iso)) { date = nextDate(date); iso = zonedDateTimeToUtc(date, time, trip.timezone); }
      end = { iso, date };
    }
  }
  const defaultEnd = isAllDay ? start.iso : new Date(Date.parse(start.iso) + 3_600_000).toISOString();
  const endDateTime = end && (isAllDay ? Date.parse(end.iso) >= Date.parse(start.iso) : Date.parse(end.iso) > Date.parse(start.iso)) ? end.iso : defaultEnd;
  return { startDateTime: start.iso, endDateTime, dayIndex: Math.max(1, dayIndexForDate(start.date, trip.startDate)), isAllDay, invalid: false };
}

export function ImportGoogleMapsCsvButton({ trip, eventTypes, onAddType, onImported, onError, compact = false }: { trip: Trip; eventTypes: string[]; onAddType: (type: string) => void; onImported: (items: TravelObject[]) => void; onError: (message: string) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ complete: number; total: number } | null>(null);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true); onError("");
    try {
      const rows = parseCsv(await file.text());
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
      const records = rows.map((row) => { const category = categoryIndex >= 0 ? normalizeCategory(row[categoryIndex] ?? "") : ""; return { title: row[titleIndex]?.trim() ?? "", notes: row[noteIndex]?.trim() ?? "", url: row[urlIndex]?.trim() ?? "", type: (knownTypes.get(category.toLocaleLowerCase()) ?? category) || "unclassified", schedule: scheduleFromRow(row, scheduleColumns, trip) }; }).filter((record) => record.title && record.url);
      if (!records.length) throw new Error("No Google Maps places were found in this CSV.");
      let resolvedCount = 0;
      let unresolvedCount = 0;
      setImportProgress({ complete: 0, total: records.length });
      const resolvedRecords = await mapWithConcurrency(records, 4, async (record) => {
        try {
          const result = await api.resolveMapsUrl(record.url);
          const hasCoordinates = result.lat != null && result.lng != null;
          if (!hasCoordinates) unresolvedCount += 1;
          return { ...record, location: { name: record.title.slice(0, 300), googleMapsUrl: record.url, ...(hasCoordinates ? { lat: result.lat!, lng: result.lng! } : {}) } };
        } catch {
          unresolvedCount += 1;
          return { ...record, location: { name: record.title.slice(0, 300), googleMapsUrl: record.url } };
        } finally {
          resolvedCount += 1;
          setImportProgress({ complete: resolvedCount, total: records.length });
        }
      });
      const created = await Promise.all(resolvedRecords.map((record) => api.createObject({ tripId: trip.id, title: record.title.slice(0, 100), type: record.type, startDateTime: record.schedule.startDateTime, endDateTime: record.schedule.endDateTime, dayIndex: record.schedule.dayIndex, isAllDay: record.schedule.isAllDay, location: record.location, cost: null, notes: truncateUtf8(record.notes, 2500) || null, tags: [] })));
      for (const type of new Set(records.map((record) => record.type))) if (!knownTypes.has(type.toLocaleLowerCase())) onAddType(type);
      onImported(created);
      const skipped = rows.length - records.length; const invalidDates = records.filter((record) => record.schedule.invalid).length;
      if (skipped || invalidDates || unresolvedCount) onError(`Imported ${created.length} places.${unresolvedCount ? ` ${unresolvedCount} ${unresolvedCount === 1 ? "link did" : "links did"} not contain resolvable coordinates.` : ""}${skipped ? ` Skipped ${skipped} empty rows.` : ""}${invalidDates ? ` ${invalidDates} rows had an unrecognized date or time and were left unscheduled.` : ""}`);
    } catch (error) { onError(error instanceof Error ? error.message : "Could not import the Google Maps CSV."); }
    finally { setImporting(false); setImportProgress(null); if (inputRef.current) inputRef.current.value = ""; }
  }

  const label = importProgress ? `Resolving ${importProgress.complete}/${importProgress.total}` : "Import Maps CSV";
  return <><input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void importFile(event.target.files?.[0])} /><Button type="button" variant="ghost" size={compact ? "icon" : "sm"} className={compact ? "mx-auto" : "w-full justify-start"} aria-label={label} title={compact ? label : undefined} disabled={importing} onClick={() => inputRef.current?.click()}>{importing ? <LoaderCircle className="animate-spin" /> : <FileUp />}{!compact && label}</Button></>;
}
