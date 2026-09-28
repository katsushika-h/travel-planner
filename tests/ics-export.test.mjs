import assert from "node:assert/strict";
import test from "node:test";
import { createTripIcs } from "../lib/ics-export.ts";

const trip = { id: "trip-1", title: "Autumn, Japan", timezone: "Asia/Tokyo" };
const base = { tripId: trip.id, title: "Visit", date: "2026-10-03", endDate: "2026-10-03", startTime: null, endTime: null, isAllDay: false, notes: null, location: null };
const stamp = new Date("2026-09-28T12:34:56.000Z");

function events(ics) {
  return [...ics.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT\r\n/g)].map((match) => match[1]);
}

test("exports confirmed times in UTC using the trip timezone, including overnight and DST changes", () => {
  const japan = createTripIcs(trip, [{ ...base, id: "flight", startTime: "23:30", endDate: "2026-10-04", endTime: "01:00" }], stamp);
  assert.match(japan, /DTSTART:20261003T143000Z\r\nDTEND:20261003T160000Z/);
  assert.match(japan, /DTSTAMP:20260928T123456Z/);

  const newYork = createTripIcs({ ...trip, timezone: "America/New_York" }, [{ ...base, id: "dinner", date: "2026-03-08", endDate: "2026-03-08", startTime: "01:30", endTime: "03:30" }], stamp);
  assert.match(newYork, /DTSTART:20260308T063000Z\r\nDTEND:20260308T073000Z/);
});

test("exports all-day and flexible dates with exclusive calendar ends, while omitting unscheduled items", () => {
  const ics = createTripIcs(trip, [
    { ...base, id: "festival", isAllDay: true, endDate: "2026-10-05" },
    { ...base, id: "cafe", placementTime: "14:15" },
    { ...base, id: "idea", date: null, endDate: null },
    { ...base, id: "other-trip", tripId: "trip-2" },
  ], stamp);
  assert.equal(events(ics).length, 2);
  assert.match(ics, /UID:festival@wayfarer\.travel[\s\S]*?DTSTART;VALUE=DATE:20261003\r\nDTEND;VALUE=DATE:20261006/);
  assert.match(ics, /UID:cafe@wayfarer\.travel[\s\S]*?DTSTART;VALUE=DATE:20261003\r\nDTEND;VALUE=DATE:20261004/);
  assert.doesNotMatch(ics, /UID:idea|UID:other-trip|141500/);
});

test("notes, title and item location use escaped calendar text and UTF-8-safe folded lines", () => {
  const note = `Bring tea, snacks; and a \\ map\n${"東京".repeat(40)}`;
  const ics = createTripIcs(trip, [{ ...base, id: "temple", title: "Temple, shrine", notes: note, location: { name: "Tokyo, Station", address: "1 Main St; Tokyo" } }], stamp);
  assert.match(ics, /SUMMARY:Temple\\, shrine/);
  assert.match(ics, /DESCRIPTION:Bring tea\\, snacks\\; and a \\\\ map\\n/);
  assert.match(ics, /LOCATION:Tokyo\\, Station\\, 1 Main St\\; Tokyo/);
  assert.match(ics, /X-WR-CALNAME:Autumn\\, Japan/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  assert.match(ics, /\r\n /);
});

test("uses a saved Maps URL when the item has no place name or address", () => {
  const ics = createTripIcs(trip, [{ ...base, id: "map", location: { googleMapsUrl: "https://maps.example/place?a=1,b=2" } }], stamp);
  assert.match(ics, /LOCATION:https:\/\/maps\.example\/place\?a=1\\,b=2/);
});
