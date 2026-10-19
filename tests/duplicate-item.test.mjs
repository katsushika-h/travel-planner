import assert from "node:assert/strict";
import test from "node:test";
import { duplicableItems, duplicateCreateInput, duplicateDayOrder } from "../lib/duplicate-item.ts";

const base = {
  id: "a",
  tripId: "t1",
  kind: "event",
  noteBody: null,
  title: "Ramen",
  type: "food",
  date: "2026-09-24T00:00:00.000Z",
  endDate: "2026-09-24T00:00:00.000Z",
  startTime: "12:00",
  endTime: "13:00",
  placementTime: null,
  dayOrder: 2,
  isAllDay: false,
  headerImage: null,
  location: { name: "Shop", lat: 1, lng: 2 },
  cost: { amount: 12, currency: "JPY" },
  notes: "Cash only",
  tags: ["lunch"],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

test("duplicate payload copies content and schedule but not ids, order, or timestamps", () => {
  const input = duplicateCreateInput(base);
  assert.equal(input.title, "Ramen");
  assert.equal(input.date, "2026-09-24");
  assert.equal(input.endDate, "2026-09-24");
  assert.deepEqual(input.cost, base.cost);
  assert.deepEqual(input.tags, ["lunch"]);
  assert.notEqual(input.tags, base.tags);
  for (const key of ["id", "dayOrder", "createdAt", "updatedAt", "startDateTime", "dayIndex"])
    assert.equal(key in input, false);
});

test("duplicate of an idea stays unscheduled", () => {
  const idea = { ...base, date: null, endDate: null, startTime: null, endTime: null, dayOrder: null };
  const input = duplicateCreateInput(idea);
  assert.equal(input.date, null);
  assert.equal(input.endDate, null);
  assert.equal(input.isAllDay, false);
  assert.equal(duplicateDayOrder(idea), null);
});

test("copy is placed directly after the original; all-day and unordered items are left alone", () => {
  assert.equal(duplicateDayOrder(base), 3);
  assert.equal(duplicateDayOrder({ ...base, isAllDay: true }), null);
  assert.equal(duplicateDayOrder({ ...base, dayOrder: null }), null);
});

test("notes are not duplicable", () => {
  const items = [
    { id: 1, kind: "note" },
    { id: 2, kind: "event" },
  ];
  assert.deepEqual(
    duplicableItems(items).map((item) => item.id),
    [2],
  );
});
