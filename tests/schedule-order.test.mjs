import assert from "node:assert/strict";
import test from "node:test";
import { compactDayOrder, compareDayDisplayOrder, itineraryDropPosition, mergeCreatedTravelObject, normalizeDayOrder, sortTravelObjects, weekFlexibleDropOrder } from "../lib/schedule-order.ts";

test("Week time-slot drops use the original day index for forward moves", () => {
  const date = "2026-09-24";
  const createdAt = "2026-09-24T00:00:00.000Z";
  const item = (id, dayOrder, startTime, endTime) => ({ id, date, dayOrder, startTime, endTime, isAllDay: false, createdAt });
  const items = [item("A", 0, null, null), item("B", 1, "10:00", "11:00"), item("C", 2, "11:00", "12:00")];
  assert.equal(weekFlexibleDropOrder(items, date, "10:30"), 2);
  assert.equal(weekFlexibleDropOrder(items, date, "12:00"), 3);
  assert.equal(weekFlexibleDropOrder(items, "2026-09-25", "10:30"), 0);
});

test("creating an item preserves explicit flexible gaps between timed items", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const item = (id, dayOrder, startTime, endTime, isAllDay = false) => ({ id, dayOrder, startTime, endTime, isAllDay, createdAt });
  const existing = [item("B", 0, "10:00", "11:00"), item("A", 1, null, null), item("C", 2, "11:00", "12:00")];
  assert.deepEqual(normalizeDayOrder([...existing, item("Span", null, null, null, true)]).map(({ item, dayOrder }) => [item.id, dayOrder]), [["B", 0], ["A", 1], ["C", 2], ["Span", 3]]);
  assert.deepEqual(normalizeDayOrder([...existing, item("D", null, "10:30", "11:30")]).map(({ item }) => item.id), ["B", "A", "D", "C"]);
  assert.deepEqual(normalizeDayOrder([item("flex", null, null, null), item("timed", null, "09:00", "10:00")]).map(({ item }) => item.id), ["timed", "flex"]);
});

test("the client inserts a created item at its persisted order", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const date = "2026-09-24";
  const item = (id, dayOrder) => ({ id, date, dayOrder, startTime: null, endTime: null, isAllDay: false, createdAt });
  const items = [item("B", 0), item("Gap", 1), item("C", 2)];
  assert.deepEqual(mergeCreatedTravelObject(items, item("D", 2)).map(({ id, dayOrder }) => [id, dayOrder]), [["B", 0], ["Gap", 1], ["D", 2], ["C", 3]]);
  assert.deepEqual(items.map(({ dayOrder }) => dayOrder), [0, 1, 2]);
});

test("Itinerary gap positions retain forward end drops and timed neighbors", () => {
  const date = "2026-09-24";
  const fixed = (id, startTime) => ({ id, date, startTime, endTime: "12:00", isAllDay: false });
  const [a, b, c] = [fixed("a", "09:00"), fixed("b", "10:00"), fixed("c", "11:00")];
  assert.deepEqual(itineraryDropPosition([a, b, c], a, date, 3), { requestedOrder: 3, betweenTimedAnchors: false });
  assert.deepEqual(itineraryDropPosition([a, b, c], a, date, 2), { requestedOrder: 2, betweenTimedAnchors: true });
  assert.deepEqual(itineraryDropPosition([a, b, c], c, date, 1), { requestedOrder: 1, betweenTimedAnchors: true });
  const fromAnotherDay = { ...a, id: "new", date: "2026-09-25" };
  assert.deepEqual(itineraryDropPosition([a, b, c], fromAnotherDay, date, 3), { requestedOrder: 3, betweenTimedAnchors: false });
});

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
