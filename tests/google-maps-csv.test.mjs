import assert from "node:assert/strict";
import test from "node:test";
import { parseGoogleMapsCsv } from "../lib/google-maps-csv.ts";

test("CSV parser keeps quoted fields, categories, overnight schedules, and skipped rows", () => {
  const csv = '\uFEFFTitle,Note,URL,Category,Date,Time,End Time\r\n"Dinner, ""Blue""","first line\nsecond line",https://maps.example/dinner,FOOD,2026-09-24,11:30 pm,01:00 am\r\nNo URL,note,,Food,2026-09-24,09:00,10:00\r\nMuseum,note,https://maps.example/museum,New   Category,2026-09-25,,\r\n';
  const parsed = parseGoogleMapsCsv(csv, "Asia/Singapore", ["food"]);
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.invalidDates, 0);
  assert.deepEqual(parsed.newTypes, ["New Category"]);
  assert.deepEqual([parsed.records[0].title, parsed.records[0].notes, parsed.records[0].type], ['Dinner, "Blue"', "first line\nsecond line", "food"]);
  assert.deepEqual([parsed.records[0].schedule.date, parsed.records[0].schedule.endDate, parsed.records[0].schedule.startTime, parsed.records[0].schedule.endTime], ["2026-09-24", "2026-09-25", "23:30", "01:00"]);
  assert.deepEqual([parsed.records[1].schedule.date, parsed.records[1].schedule.endDate, parsed.records[1].schedule.isAllDay], ["2026-09-25", "2026-09-25", true]);
});

test("CSV parser leaves unrecognized schedules unscheduled and reads offset datetimes", () => {
  const csv = "Place Name,Note,URL,Start Date/Time,End Date/Time\nInvalid,note,https://maps.example/invalid,not a date,\nOffset,note,https://maps.example/offset,2026-09-24T01:00:00Z,2026-09-24T02:00:00Z\n";
  const parsed = parseGoogleMapsCsv(csv, "Asia/Singapore", []);
  assert.equal(parsed.invalidDates, 1);
  assert.deepEqual([parsed.records[0].schedule.date, parsed.records[0].schedule.invalid], [null, true]);
  assert.deepEqual([parsed.records[1].schedule.date, parsed.records[1].schedule.startTime, parsed.records[1].schedule.endTime], ["2026-09-24", "09:00", "10:00"]);
  assert.deepEqual(parsed.newTypes, ["unclassified"]);
});

test("CSV parser preserves import validation errors", () => {
  assert.throws(() => parseGoogleMapsCsv("Title,URL\nA,https://maps.example/a", "Asia/Singapore", []), /Note and URL columns/);
  assert.throws(() => parseGoogleMapsCsv("Title,Note,URL\nA,note,", "Asia/Singapore", []), /No Google Maps places/);
});
