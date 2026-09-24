import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUpdatedScheduleData, readCreateSchedule, readLegacyScheduleParts, readLegacyUpdateScheduleFields, readUpdateScheduleFields } from "../lib/api-schedule.ts";

test("create schedule preserves canonical fixed, flexible, and all-day shapes", () => {
  const fixed = readCreateSchedule({ date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "01:00" }, "Asia/Singapore");
  assert.deepEqual([fixed.date?.toISOString(), fixed.endDate?.toISOString(), fixed.startTime, fixed.endTime, fixed.placementTime, fixed.isAllDay], ["2026-09-24T00:00:00.000Z", "2026-09-25T00:00:00.000Z", "23:30", "01:00", null, false]);
  const flexible = readCreateSchedule({ date: "2026-09-24", placementTime: "09:15" }, "Asia/Singapore");
  assert.deepEqual([flexible.startTime, flexible.endTime, flexible.placementTime], [null, null, "09:15"]);
  const allDay = readCreateSchedule({ date: "2026-09-24", endDate: "2026-09-25", isAllDay: true }, "Asia/Singapore");
  assert.deepEqual([allDay.startTime, allDay.endTime, allDay.isAllDay], [null, null, true]);
});

test("create schedule retains legacy timestamp projection and canonical precedence", () => {
  const legacy = readCreateSchedule({ startDateTime: "2026-09-24T15:30:00.000Z", endDateTime: "2026-09-24T17:00:00.000Z" }, "Asia/Singapore");
  assert.deepEqual([legacy.date?.toISOString(), legacy.endDate?.toISOString(), legacy.startTime, legacy.endTime], ["2026-09-24T00:00:00.000Z", "2026-09-25T00:00:00.000Z", "23:30", "01:00"]);
  const unscheduled = readCreateSchedule({ date: null, endDate: "invalid", startDateTime: "2026-09-24T01:00:00.000Z", endDateTime: "2026-09-24T02:00:00.000Z" }, "Asia/Singapore");
  assert.deepEqual([unscheduled.date, unscheduled.endDate, unscheduled.startTime, unscheduled.endTime], [null, null, "09:00", "10:00"]);
  assert.deepEqual(readLegacyScheduleParts({ startDateTime: "2026-03-08T06:30:00.000Z", endDateTime: "2026-03-08T07:30:00.000Z" }, "America/New_York"), {
    start: { date: "2026-03-08", time: "01:30" }, end: { date: "2026-03-08", time: "03:30" },
  });
});

test("create schedule keeps existing validation messages", () => {
  assert.throws(() => readCreateSchedule({ date: "2026-09-24", startTime: "09:00" }, "Asia/Singapore"), /startTime and endTime must both be set/);
  assert.throws(() => readCreateSchedule({ date: "2026-09-24", startTime: "10:00", endTime: "09:00" }, "Asia/Singapore"), /endTime must be after startTime/);
  assert.throws(() => readCreateSchedule({ date: "2026-09-24", placementTime: "09:10" }, "Asia/Singapore"), /15-minute interval/);
  assert.throws(() => readCreateSchedule({ date: "2026-09-24", isAllDay: true, startTime: "09:00" }, "Asia/Singapore"), /All-day items cannot have times/);
  assert.throws(() => readCreateSchedule({ date: null, placementTime: "09:00" }, "Asia/Singapore"), /Unscheduled items cannot have/);
});

test("update schedule parser includes only supplied canonical fields", () => {
  assert.deepEqual(readUpdateScheduleFields({}), {});
  assert.deepEqual(readUpdateScheduleFields({ date: null, endTime: null, placementTime: "09:15" }), { date: null, endTime: null, placementTime: "09:15" });
  const fields = readUpdateScheduleFields({ date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "01:00" });
  assert.deepEqual([fields.date?.toISOString(), fields.endDate?.toISOString(), fields.startTime, fields.endTime], ["2026-09-24T00:00:00.000Z", "2026-09-25T00:00:00.000Z", "23:30", "01:00"]);
  assert.throws(() => readUpdateScheduleFields({ startTime: "25:00" }), /startTime must be a 24-hour time/);
});

test("legacy PATCH projection retains canonical precedence and null semantics", () => {
  const legacy = readLegacyUpdateScheduleFields({ startDateTime: "2026-09-24T15:30:00.000Z", endDateTime: "2026-09-24T17:00:00.000Z" }, "Asia/Singapore", false);
  assert.deepEqual([legacy.date?.toISOString(), legacy.endDate?.toISOString(), legacy.startTime, legacy.endTime, legacy.placementTime, legacy.isAllDay], ["2026-09-24T00:00:00.000Z", "2026-09-25T00:00:00.000Z", "23:30", "01:00", null, false]);
  assert.deepEqual(readLegacyUpdateScheduleFields({ startDateTime: null, endDateTime: null }, "Asia/Singapore", false), { date: null });
  assert.deepEqual(readLegacyUpdateScheduleFields({ startDateTime: "2026-09-24T01:00:00.000Z" }, "Asia/Singapore", false), {});
  assert.deepEqual(readLegacyUpdateScheduleFields({ date: "2026-09-25", startDateTime: "2026-09-24T01:00:00.000Z", endDateTime: "2026-09-24T02:00:00.000Z" }, "Asia/Singapore", false), {});
  assert.throws(() => readLegacyUpdateScheduleFields({ date: "2026-09-25", startDateTime: "invalid" }, "Asia/Singapore", false), /startDateTime/);
});

test("PATCH normalization preserves unscheduled, flexible, fixed, and all-day shapes", () => {
  const existing = { date: new Date("2026-09-24T00:00:00.000Z"), endDate: new Date("2026-09-24T00:00:00.000Z"), startTime: "10:00", endTime: "11:00", placementTime: null, isAllDay: false };
  assert.deepEqual(normalizeUpdatedScheduleData({ date: null }, existing), { date: null, endDate: null, placementTime: null, dayOrder: null, isAllDay: false });
  assert.deepEqual(normalizeUpdatedScheduleData({ startTime: null, endTime: null }, existing), { startTime: null, endTime: null, endDate: existing.endDate, placementTime: "09:00" });
  assert.deepEqual(normalizeUpdatedScheduleData({ endTime: "12:00" }, existing), { endTime: "12:00", endDate: existing.endDate, placementTime: null });
  assert.deepEqual(normalizeUpdatedScheduleData({ isAllDay: true, startTime: null, endTime: null }, existing), { isAllDay: true, startTime: null, endTime: null, endDate: existing.endDate, placementTime: null });
});

test("PATCH normalization retains schedule validation errors", () => {
  const existing = { date: new Date("2026-09-24T00:00:00.000Z"), endDate: new Date("2026-09-24T00:00:00.000Z"), startTime: "10:00", endTime: "11:00", placementTime: null, isAllDay: false };
  assert.throws(() => normalizeUpdatedScheduleData({ endDate: new Date("2026-09-23T00:00:00.000Z") }, existing), /endDate must be on or after date/);
  assert.throws(() => normalizeUpdatedScheduleData({ endTime: "09:00" }, existing), /endTime must be after startTime/);
  assert.throws(() => normalizeUpdatedScheduleData({ isAllDay: true }, existing), /All-day items cannot have times/);
  assert.throws(() => normalizeUpdatedScheduleData({ endTime: null }, existing), /startTime and endTime must both be set/);
  assert.throws(() => normalizeUpdatedScheduleData({ placementTime: "09:00" }, existing), /placementTime is only for flexible items/);
});
