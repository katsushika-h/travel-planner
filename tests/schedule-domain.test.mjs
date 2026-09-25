import assert from "node:assert/strict";
import test from "node:test";
import { allDayCalendarDays, allDayDropStartDate, elapsedDurationMinutes, endForAllDayCalendarDays, endForElapsedDuration, groupedMoveTarget, moveAllDayRange, moveFixedTimeRange, occursOnItineraryDate, oneHourEnd, placeUnfixedItem, resizeFixedTimeRange, scheduleAtTableStart, scheduleKind } from "../lib/schedule-domain.ts";
import { endDateTimeFor, shiftDate, startDateTimeFor, zonedDateTimeToUtc } from "../lib/date-utils.ts";
import { canonicalScheduleFromInstants, withScheduleCompatibility } from "../lib/travel-object-compat.ts";

test("calendar-day shifts cross leap days and year boundaries", () => {
  assert.equal(shiftDate("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDate("2028-02-29", 1), "2028-03-01");
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDate("2026-03-08", 1), "2026-03-09");
});

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

test("new fixed items end one elapsed hour later in the trip timezone", () => {
  assert.deepEqual(oneHourEnd("2026-09-24", "23:30", "Asia/Singapore"), { endDate: "2026-09-25", endTime: "00:30" });
  assert.deepEqual(oneHourEnd("2026-03-08", "01:30", "America/New_York"), { endDate: "2026-03-08", endTime: "03:30" });
  assert.throws(() => oneHourEnd("2026-02-30", "09:00", "Asia/Singapore"), RangeError);
});

test("all-day moves keep the inclusive day span across DST", () => {
  assert.equal(allDayDropStartDate("2026-03-07", "2026-03-08", "2026-03-10"), "2026-03-09");
  assert.equal(allDayDropStartDate("2026-03-07", "2026-03-08", "2026-03-08"), "2026-03-07");
  assert.equal(allDayDropStartDate("2026-03-07", "2026-03-09", "2026-03-08"), "2026-03-06");
  assert.equal(allDayDropStartDate("2026-09-23", "2026-09-23", "2026-09-25"), "2026-09-25");
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

test("resizing a fixed item changes one edge and keeps its date range", () => {
  assert.deepEqual(resizeFixedTimeRange("2026-09-24", "2026-09-25", "23:00", "01:00", "start", "22:30"), {
    date: "2026-09-24", endDate: "2026-09-25", startTime: "22:30", endTime: "01:00",
  });
  const resized = resizeFixedTimeRange("2026-03-08", null, "01:30", "03:30", "end", "04:30");
  assert.deepEqual(resized, { date: "2026-03-08", endDate: "2026-03-08", startTime: "01:30", endTime: "04:30" });
  assert.equal(startDateTimeFor({ ...resized, isAllDay: false }, "America/New_York"), "2026-03-08T06:30:00.000Z");
  assert.equal(endDateTimeFor({ ...resized, isAllDay: false }, "America/New_York"), "2026-03-08T08:30:00.000Z");
});

test("grouped moves preserve wall-clock offsets without compatibility timestamps", () => {
  const anchor = { date: "2026-03-07", startTime: "09:00", isAllDay: false };
  const later = { date: "2026-03-08", startTime: "11:30", isAllDay: false };
  assert.deepEqual(groupedMoveTarget(anchor, later, "2026-03-14", "America/New_York", "10:00"), { date: "2026-03-15", time: "12:30" });
  assert.deepEqual(groupedMoveTarget(anchor, anchor, "2026-03-14", "America/New_York"), { date: "2026-03-14", time: "09:00" });
  const allDay = { date: "2026-03-09", startTime: null, isAllDay: true };
  assert.deepEqual(groupedMoveTarget({ date: "2026-03-07", startTime: null, isAllDay: true }, allDay, "2026-03-14", "America/New_York"), { date: "2026-03-16", time: "00:00" });
  const gap = { date: "2026-03-08", startTime: "02:30", isAllDay: false };
  assert.deepEqual(groupedMoveTarget(gap, gap, "2026-03-15", "America/New_York"), { date: "2026-03-15", time: "01:30" });
});

test("grouped move fallback keeps the target for flexible and undated items", () => {
  const fixed = { date: "2026-09-23", startTime: "13:00", isAllDay: false };
  const flexible = { date: "2026-09-24", startTime: null, isAllDay: false };
  const undated = { date: null, startTime: "08:00", isAllDay: false };
  assert.deepEqual(groupedMoveTarget(fixed, flexible, "2026-09-25", "Asia/Singapore"), { date: "2026-09-25", time: "13:00" });
  assert.deepEqual(groupedMoveTarget(undated, fixed, "2026-09-25", "Asia/Singapore"), { date: "2026-09-25", time: "09:00" });
  assert.deepEqual(groupedMoveTarget(fixed, undated, "2026-09-25", "Asia/Singapore", "17:00"), { date: "2026-09-25", time: "17:00" });
});

test("elapsed duration remains UTC based and clamps negative ranges", () => {
  assert.equal(elapsedDurationMinutes({ date: "2026-03-08", endDate: "2026-03-08", startTime: "01:30", endTime: "03:30", isAllDay: false }, "America/New_York"), 60);
  assert.equal(elapsedDurationMinutes({ date: "2026-09-23", endDate: "2026-09-23", startTime: "10:00", endTime: "09:00", isAllDay: false }, "Asia/Singapore"), 0);
});

test("Table duration edits produce canonical end fields across DST and midnight", () => {
  const spring = { date: "2026-03-08", endDate: "2026-03-08", startTime: "01:30", endTime: "03:30", isAllDay: false };
  assert.deepEqual(endForElapsedDuration(spring, 60, "America/New_York"), { endDate: "2026-03-08", endTime: "03:30" });
  const overnight = { date: "2026-09-24", endDate: "2026-09-24", startTime: "23:30", endTime: "23:45", isAllDay: false };
  assert.deepEqual(endForElapsedDuration(overnight, 90, "Asia/Singapore"), { endDate: "2026-09-25", endTime: "01:00" });
  assert.equal(endForElapsedDuration(overnight, 0, "Asia/Singapore"), null);
});

test("all-day Table length uses inclusive calendar days across DST", () => {
  const spring = { date: "2026-03-07", endDate: "2026-03-09", isAllDay: true };
  assert.equal(allDayCalendarDays(spring), 3);
  assert.deepEqual(endForAllDayCalendarDays(spring, 2), { endDate: "2026-03-08" });
  assert.deepEqual(endForAllDayCalendarDays(spring, 1), { endDate: "2026-03-07" });
  const fall = { date: "2026-10-31", endDate: "2026-11-02", isAllDay: true };
  assert.equal(allDayCalendarDays(fall), 3);
  assert.deepEqual(endForAllDayCalendarDays(fall, 4), { endDate: "2026-11-03" });
  assert.deepEqual(scheduleAtTableStart({ ...spring, startTime: null, endTime: null }, "2026-03-14", "12:00", "America/New_York"), {
    date: "2026-03-14", endDate: "2026-03-16", startTime: null, endTime: null, placementTime: null,
  });
});

test("all-day Table length ignores invalid and non-all-day edits", () => {
  assert.equal(allDayCalendarDays({ date: null, endDate: null, isAllDay: true }), null);
  assert.equal(allDayCalendarDays({ date: "2026-09-24", endDate: "2026-09-23", isAllDay: true }), null);
  assert.equal(allDayCalendarDays({ date: "2026-09-24", endDate: "2026-09-25", isAllDay: false }), null);
  assert.equal(endForAllDayCalendarDays({ date: "2026-09-24", isAllDay: true }, 0), null);
  assert.equal(endForAllDayCalendarDays({ date: "2026-09-24", isAllDay: true }, 1.5), null);
  assert.equal(endForAllDayCalendarDays({ date: null, isAllDay: true }, 2), null);
  assert.equal(endForAllDayCalendarDays({ date: "2026-09-24", isAllDay: false }, 2), null);
});

test("Table duration edits skip items without fixed times and invalid lengths", () => {
  assert.equal(endForElapsedDuration({ date: null, endDate: null, startTime: "09:00", endTime: "10:00", isAllDay: false }, 60, "Asia/Singapore"), null);
  assert.equal(endForElapsedDuration({ date: "2026-09-24", endDate: "2026-09-24", startTime: null, endTime: null, isAllDay: false }, 60, "Asia/Singapore"), null);
  assert.equal(endForElapsedDuration({ date: "2026-03-08", endDate: "2026-03-08", startTime: null, endTime: null, isAllDay: true }, 1440, "America/New_York"), null);
  assert.equal(endForElapsedDuration({ date: "2026-09-24", endDate: "2026-09-24", startTime: "09:00", endTime: "10:00", isAllDay: false }, Number.NaN, "Asia/Singapore"), null);
  assert.equal(endForElapsedDuration({ date: "2026-09-24", endDate: "2026-09-24", startTime: "09:00", endTime: "10:00", isAllDay: false }, 1.5, "Asia/Singapore"), null);
});

test("Table start edits retain each fixed item's elapsed duration across DST", () => {
  const spring = { date: "2026-03-08", endDate: "2026-03-08", startTime: "01:30", endTime: "03:30", isAllDay: false };
  const overnight = { date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "01:00", isAllDay: false };
  assert.deepEqual(scheduleAtTableStart(spring, "2026-03-14", "10:00", "America/New_York"), {
    date: "2026-03-14", endDate: "2026-03-14", startTime: "10:00", endTime: "11:00", placementTime: null,
  });
  assert.deepEqual(scheduleAtTableStart(spring, "2026-03-08", "02:30", "America/New_York"), {
    date: "2026-03-08", endDate: "2026-03-08", startTime: "01:30", endTime: "03:30", placementTime: null,
  });
  assert.deepEqual(scheduleAtTableStart(overnight, "2026-09-26", "23:30", "Asia/Singapore"), {
    date: "2026-09-26", endDate: "2026-09-27", startTime: "23:30", endTime: "01:00", placementTime: null,
  });
});

test("Table start edits keep all-day items all-day and default unscheduled or flexible items to one hour", () => {
  const allDay = { date: "2026-09-24", endDate: "2026-09-25", startTime: null, endTime: null, isAllDay: true };
  const flexible = { date: "2026-09-24", endDate: "2026-09-24", startTime: null, endTime: null, isAllDay: false };
  const undated = { date: null, endDate: null, startTime: "08:00", endTime: "09:00", isAllDay: false };
  assert.deepEqual(scheduleAtTableStart(allDay, "2026-09-27", "12:00", "Asia/Singapore"), {
    date: "2026-09-27", endDate: "2026-09-28", startTime: null, endTime: null, placementTime: null,
  });
  for (const item of [flexible, undated]) assert.deepEqual(scheduleAtTableStart(item, "2026-09-27", "23:30", "Asia/Singapore"), {
    date: "2026-09-27", endDate: "2026-09-28", startTime: "23:30", endTime: "00:30", placementTime: null,
  });
});

test("Itinerary spans fixed and all-day ranges while flexible items stay on their start date", () => {
  const fixed = { date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "01:00", isAllDay: false };
  const allDay = { date: "2026-09-24", endDate: "2026-09-26", startTime: null, endTime: null, isAllDay: true };
  const flexible = { date: "2026-09-24", endDate: "2026-09-26", startTime: null, endTime: null, isAllDay: false };
  const undated = { date: null, endDate: null, startTime: "09:00", endTime: "10:00", isAllDay: false };
  assert.equal(occursOnItineraryDate(fixed, "2026-09-25"), true);
  assert.equal(occursOnItineraryDate(fixed, "2026-09-26"), false);
  assert.equal(occursOnItineraryDate(allDay, "2026-09-26"), true);
  assert.equal(occursOnItineraryDate(flexible, "2026-09-24"), true);
  assert.equal(occursOnItineraryDate(flexible, "2026-09-25"), false);
  assert.equal(occursOnItineraryDate(undated, "2026-09-24"), false);
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

test("CSV import instants project to the same canonical schedule as legacy create requests", () => {
  assert.deepEqual(canonicalScheduleFromInstants(null, null, false, "Asia/Singapore"), {
    date: null, endDate: null, startTime: null, endTime: null, isAllDay: false,
  });
  assert.deepEqual(canonicalScheduleFromInstants("2026-09-24T15:30:00.000Z", "2026-09-24T17:00:00.000Z", false, "Asia/Singapore"), {
    date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "01:00", isAllDay: false,
  });
  assert.deepEqual(canonicalScheduleFromInstants("2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z", true, "America/New_York"), {
    date: "2026-03-08", endDate: "2026-03-09", startTime: null, endTime: null, isAllDay: true,
  });
});
