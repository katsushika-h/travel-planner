import assert from "node:assert/strict";
import test from "node:test";
import { elapsedDurationMinutes, moveAllDayRange, moveFixedTimeRange, placeUnfixedItem, scheduleKind } from "../lib/schedule-domain.ts";
import { endDateTimeFor, startDateTimeFor, zonedDateTimeToUtc } from "../lib/date-utils.ts";
import { withScheduleCompatibility } from "../lib/travel-object-compat.ts";

test("unscheduled and flexible items have no confirmed elapsed duration", () => {
  assert.equal(elapsedDurationMinutes({ date: null, endDate: null, startTime: null, endTime: null, isAllDay: false }, "Asia/Singapore"), null);
  const flexible = { date: "2026-09-23", endDate: "2026-09-23", startTime: null, endTime: null, isAllDay: false };
  assert.equal(elapsedDurationMinutes(flexible, "Asia/Singapore"), null);
  assert.equal(startDateTimeFor(flexible, "Asia/Singapore"), null);
  assert.equal(endDateTimeFor(flexible, "Asia/Singapore"), null);
});

test("schedule kinds use canonical fields, including saved times on undated items", () => {
  assert.equal(scheduleKind({ date: null, startTime: "09:00", endTime: "10:00", isAllDay: false }), "unscheduled");
  assert.equal(scheduleKind({ date: "2026-09-23", startTime: null, endTime: null, isAllDay: true }), "all-day");
  assert.equal(scheduleKind({ date: "2026-09-23", startTime: null, endTime: null, isAllDay: false }), "flexible");
  assert.equal(scheduleKind({ date: "2026-09-23", startTime: "09:00", endTime: "10:00", isAllDay: false }), "fixed");
});

test("placing undated and flexible items preserves saved times and overnight defaults", () => {
  const flexible = placeUnfixedItem({ startTime: null, endTime: null, placementTime: "13:15" }, "2026-09-23");
  assert.deepEqual(flexible, { kind: "flexible", date: "2026-09-23", endDate: "2026-09-23", startTime: null, endTime: null, placementTime: "13:15", isAllDay: false });
  assert.equal(startDateTimeFor(flexible, "Asia/Singapore"), null);
  const restored = placeUnfixedItem({ startTime: "14:00", endTime: "15:30", placementTime: null }, "2026-09-24");
  assert.deepEqual(restored, { kind: "fixed", date: "2026-09-24", endDate: "2026-09-24", startTime: "14:00", endTime: "15:30", placementTime: null, isAllDay: false });
  const overnight = placeUnfixedItem({ startTime: null, endTime: null, placementTime: null }, "2026-09-24", "23:30");
  assert.deepEqual(overnight, { kind: "fixed", date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "00:30", placementTime: null, isAllDay: false });
  assert.equal(endDateTimeFor(overnight, "Asia/Singapore"), "2026-09-24T16:30:00.000Z");
});

test("all-day moves keep the inclusive day span across DST", () => {
  const moved = moveAllDayRange("2026-03-07", "2026-03-09", "2026-10-31");
  assert.deepEqual(moved, {
    date: "2026-10-31",
    endDate: "2026-11-02",
  });
  assert.equal(moveAllDayRange("2026-09-23", "2026-09-23", "2026-09-25").endDate, "2026-09-25");
});

test("fixed-time moves preserve wall-clock duration, including overnight and DST moves", () => {
  const moved = moveFixedTimeRange("2026-03-07", "2026-03-07", "17:00", "19:00", "2026-03-08", "17:00");
  assert.deepEqual(moved, {
    date: "2026-03-08", endDate: "2026-03-08", startTime: "17:00", endTime: "19:00",
  });
  assert.equal(startDateTimeFor({ ...moved, isAllDay: false }, "America/New_York"), "2026-03-08T21:00:00.000Z");
  assert.equal(endDateTimeFor({ ...moved, isAllDay: false }, "America/New_York"), "2026-03-08T23:00:00.000Z");
  const overnight = moveFixedTimeRange("2026-09-23", "2026-09-24", "22:00", "00:00", "2026-09-25", "23:00");
  assert.equal(overnight.endDate, "2026-09-26");
  assert.equal(overnight.endTime, "01:00");
});

test("elapsed duration remains UTC based and clamps negative ranges", () => {
  assert.equal(elapsedDurationMinutes({ date: "2026-03-08", endDate: "2026-03-08", startTime: "01:30", endTime: "03:30", isAllDay: false }, "America/New_York"), 60);
  assert.equal(elapsedDurationMinutes({ date: "2026-09-23", endDate: "2026-09-23", startTime: "10:00", endTime: "09:00", isAllDay: false }, "Asia/Singapore"), 0);
});

test("invalid local dates and times are rejected", () => {
  assert.throws(() => zonedDateTimeToUtc("2026-02-30", "09:00", "Asia/Singapore"), RangeError);
  assert.throws(() => moveFixedTimeRange("2026-09-23", "2026-09-23", "09:00", "10:00", "2026-09-24", "25:00"), RangeError);
});

test("canonical schedule shapes serialize to existing compatibility fields", () => {
  const tripStart = "2026-09-23";
  const timezone = "Asia/Singapore";
  const unscheduled = withScheduleCompatibility({ date: null, endDate: null, startTime: null, endTime: null, isAllDay: false }, timezone, tripStart);
  assert.deepEqual([unscheduled.startDateTime, unscheduled.endDateTime, unscheduled.dayIndex], [null, null, null]);
  const flexible = withScheduleCompatibility({ date: "2026-09-24", endDate: "2026-09-24", startTime: null, endTime: null, isAllDay: false }, timezone, tripStart);
  assert.deepEqual([flexible.startDateTime, flexible.endDateTime, flexible.dayIndex], [null, null, 2]);
  const allDay = withScheduleCompatibility({ date: "2026-09-24", endDate: "2026-09-25", startTime: null, endTime: null, isAllDay: true }, timezone, tripStart);
  assert.deepEqual([allDay.startDateTime, allDay.endDateTime, allDay.dayIndex], ["2026-09-23T16:00:00.000Z", "2026-09-24T16:00:00.000Z", 2]);
  const fixed = withScheduleCompatibility({ date: "2026-09-24", endDate: "2026-09-24", startTime: "09:00", endTime: "10:00", isAllDay: false }, timezone, tripStart);
  assert.deepEqual([fixed.startDateTime, fixed.endDateTime, fixed.dayIndex], ["2026-09-24T01:00:00.000Z", "2026-09-24T02:00:00.000Z", 2]);
});
