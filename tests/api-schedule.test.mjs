import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUpdatedScheduleData, readCreateSchedule, readUpdateScheduleFields } from "../lib/api-schedule.ts";

test("create schedule preserves canonical fixed, flexible, and all-day shapes", () => {
  const fixed = readCreateSchedule({ date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "01:00" });
  assert.deepEqual([fixed.date?.toISOString(), fixed.endDate?.toISOString(), fixed.startTime, fixed.endTime, fixed.placementTime, fixed.isAllDay], ["2026-09-24T00:00:00.000Z", "2026-09-25T00:00:00.000Z", "23:30", "01:00", null, false]);
  const flexible = readCreateSchedule({ date: "2026-09-24", placementTime: "09:15" });
  assert.deepEqual([flexible.startTime, flexible.endTime, flexible.placementTime], [null, null, "09:15"]);
  const allDay = readCreateSchedule({ date: "2026-09-24", endDate: "2026-09-25", isAllDay: true });
  assert.deepEqual([allDay.startTime, allDay.endTime, allDay.isAllDay], [null, null, true]);
});

test("create schedule uses canonical fields and keeps unscheduled defaults", () => {
  const unscheduled = readCreateSchedule({ date: null, endDate: "invalid" });
  assert.deepEqual([unscheduled.date, unscheduled.endDate, unscheduled.startTime, unscheduled.endTime], [null, null, null, null]);
  const flexible = readCreateSchedule({ date: "2026-09-24" });
  assert.deepEqual([flexible.date?.toISOString(), flexible.endDate?.toISOString(), flexible.startTime, flexible.endTime], ["2026-09-24T00:00:00.000Z", "2026-09-24T00:00:00.000Z", null, null]);
});

test("create schedule keeps existing validation messages", () => {
  assert.throws(() => readCreateSchedule({ date: "2026-09-24", startTime: "09:00" }), /startTime and endTime must both be set/);
  assert.throws(() => readCreateSchedule({ date: "2026-09-24", startTime: "10:00", endTime: "09:00" }), /endTime must be after startTime/);
  assert.throws(() => readCreateSchedule({ date: "2026-09-24", placementTime: "09:10" }), /15-minute interval/);
  assert.throws(() => readCreateSchedule({ date: "2026-09-24", isAllDay: true, startTime: "09:00" }), /All-day items cannot have times/);
  assert.throws(() => readCreateSchedule({ date: null, placementTime: "09:00" }), /Unscheduled items cannot have/);
});

test("update schedule parser includes only supplied canonical fields", () => {
  assert.deepEqual(readUpdateScheduleFields({}), {});
  assert.deepEqual(readUpdateScheduleFields({ date: null, endTime: null, placementTime: "09:15" }), { date: null, endTime: null, placementTime: "09:15" });
  const fields = readUpdateScheduleFields({ date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "01:00" });
  assert.deepEqual([fields.date?.toISOString(), fields.endDate?.toISOString(), fields.startTime, fields.endTime], ["2026-09-24T00:00:00.000Z", "2026-09-25T00:00:00.000Z", "23:30", "01:00"]);
  assert.throws(() => readUpdateScheduleFields({ startTime: "25:00" }), /startTime must be a 24-hour time/);
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
