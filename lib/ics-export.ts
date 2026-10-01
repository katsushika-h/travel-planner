import { shiftDate, zonedDateTimeToUtc } from "./date-utils.ts";
import type { TravelObject, Trip } from "../types/travel.ts";

function escapeText(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

function foldLine(line: string) {
  const encoder = new TextEncoder();
  const lines = [""];
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      lines.push(" ");
      bytes = 1;
    }
    lines[lines.length - 1] += character;
    bytes += size;
  }
  return lines.join("\r\n");
}

function utcStamp(value: string) {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function calendarDate(value: string) {
  return value.slice(0, 10).replace(/-/g, "");
}

/** Export only dated items; a flexible visual placement is never a booked time. */
export function createTripIcs(trip: Pick<Trip, "id" | "title" | "timezone">, items: readonly TravelObject[], generatedAt = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wayfarer//Travel Planner//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(trip.title)}`,
  ];
  const stamp = utcStamp(generatedAt.toISOString());

  for (const item of items) {
    if (item.kind === "note" || !item.date || item.tripId !== trip.id) continue;
    const startDate = item.date.slice(0, 10);
    const endDate = item.endDate?.slice(0, 10) ?? startDate;
    const timed = !item.isAllDay && item.startTime !== null && item.endTime !== null;
    const start = timed
      ? `DTSTART:${utcStamp(zonedDateTimeToUtc(startDate, item.startTime!, trip.timezone))}`
      : `DTSTART;VALUE=DATE:${calendarDate(startDate)}`;
    const end = timed
      ? `DTEND:${utcStamp(zonedDateTimeToUtc(endDate, item.endTime!, trip.timezone))}`
      : `DTEND;VALUE=DATE:${calendarDate(shiftDate(endDate, 1))}`;
    const location = [item.location?.name?.trim(), item.location?.address?.trim()].filter(Boolean).join(", ") || item.location?.googleMapsUrl?.trim();

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(item.id)}@wayfarer.travel`,
      `DTSTAMP:${stamp}`,
      start,
      end,
      `SUMMARY:${escapeText(item.title)}`,
    );
    if (item.notes) lines.push(`DESCRIPTION:${escapeText(item.notes)}`);
    if (location) lines.push(`LOCATION:${escapeText(location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
