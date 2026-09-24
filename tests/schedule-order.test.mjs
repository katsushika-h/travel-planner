import assert from "node:assert/strict";
import test from "node:test";
import { compactDayOrder, compareDayDisplayOrder, sortTravelObjects } from "../lib/schedule-order.ts";

test("Day displays all-day items first without changing order within either group", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const items = [
    { id: "fixed", dayOrder: 0, startTime: "09:00", endTime: "10:00", isAllDay: false, createdAt },
    { id: "all-day-later", dayOrder: 3, startTime: null, endTime: null, isAllDay: true, createdAt },
    { id: "flexible", dayOrder: 1, startTime: null, endTime: null, isAllDay: false, createdAt },
    { id: "all-day-earlier", dayOrder: 2, startTime: null, endTime: null, isAllDay: true, createdAt },
  ];
  assert.deepEqual(items.sort(compareDayDisplayOrder).map((item) => item.id), ["all-day-earlier", "all-day-later", "fixed", "flexible"]);
});

test("compacting after deletion preserves the remaining explicit order", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const items = [
    { id: "last", dayOrder: 3, startTime: "08:00", endTime: "09:00", isAllDay: false, createdAt },
    { id: "first", dayOrder: 0, startTime: null, endTime: null, isAllDay: false, createdAt },
    { id: "middle", dayOrder: 2, startTime: "10:00", endTime: "11:00", isAllDay: false, createdAt },
  ];
  assert.deepEqual(compactDayOrder(items).map(({ item, dayOrder }) => [item.id, dayOrder]), [["first", 0], ["middle", 1], ["last", 2]]);
});

test("complete trip sorting keeps date and explicit order with undated ideas last", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const base = { createdAt, startTime: null, endTime: null, isAllDay: false };
  const items = [
    { ...base, id: "idea", date: null, dayOrder: null },
    { ...base, id: "later", date: "2026-09-25", dayOrder: 0 },
    { ...base, id: "second", date: "2026-09-24", dayOrder: 1 },
    { ...base, id: "first", date: "2026-09-24", dayOrder: 0 },
  ];
  assert.deepEqual(sortTravelObjects(items).map((item) => item.id), ["first", "second", "later", "idea"]);
});
