import assert from "node:assert/strict";
import test from "node:test";
import {
  canDropInDayOrder,
  compactDayOrder,
  compareDayDisplayOrder,
  itineraryDropPosition,
  mergeCreatedTravelObject,
  normalizeDayOrder,
  sortDayDisplayItems,
  sortTravelObjects,
  weekFixedLayers,
  weekFlexibleDropOrder,
  weekFlexibleWindows,
} from "../lib/schedule-order.ts";

test("Day blocks out-of-time fixed drops and flexible gaps inside overlaps", () => {
  const date = "2026-09-24";
  const createdAt = "2026-09-24T00:00:00.000Z";
  const item = (id, dayOrder, startTime, endTime) => ({
    id,
    date,
    endDate: date,
    dayOrder,
    startTime,
    endTime,
    isAllDay: false,
    createdAt,
  });
  const morning = item("morning", 0, "09:00", "10:00");
  const later = item("later", 1, "11:00", "12:00");
  const flexible = item("flexible", 2, null, null);
  assert.equal(canDropInDayOrder([morning, later, flexible], later, date, 0), false);
  assert.equal(canDropInDayOrder([morning, later, flexible], flexible, date, 1), true);
  const overlap = item("overlap", 1, "09:30", "11:00");
  assert.equal(canDropInDayOrder([morning, overlap, flexible], flexible, date, 1), false);
  assert.equal(canDropInDayOrder([morning, overlap, flexible], flexible, date, 0), true);
  assert.equal(canDropInDayOrder([morning, overlap, flexible], flexible, date, 3), true);
});

test("Week gives overlapping cards separate color bars and later cards the front layer", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const item = (id, startTime, endTime) => ({ id, dayOrder: null, startTime, endTime, isAllDay: false, createdAt });
  const layers = weekFixedLayers([
    item("later", "10:30", "13:00"),
    item("short", "10:00", "11:00"),
    item("long", "09:00", "12:00"),
    item("after", "13:00", "14:00"),
  ]);
  assert.deepEqual(layers.get("long"), { left: 4, zIndex: 10 });
  assert.deepEqual(layers.get("short"), { left: 12, zIndex: 11 });
  assert.deepEqual(layers.get("later"), { left: 20, zIndex: 12 });
  assert.deepEqual(layers.get("after"), { left: 4, zIndex: 13 });
});

test("Week time-slot drops use the original day index for forward moves", () => {
  const date = "2026-09-24";
  const createdAt = "2026-09-24T00:00:00.000Z";
  const item = (id, dayOrder, startTime, endTime) => ({
    id,
    date,
    dayOrder,
    startTime,
    endTime,
    isAllDay: false,
    createdAt,
  });
  const items = [item("A", 0, null, null), item("B", 1, "10:00", "11:00"), item("C", 2, "11:00", "12:00")];
  assert.equal(weekFlexibleDropOrder(items, date, "10:30"), 2);
  assert.equal(weekFlexibleDropOrder(items, date, "12:00"), 3);
  assert.equal(weekFlexibleDropOrder(items, "2026-09-25", "10:30"), 0);
});

test("creating an item preserves explicit flexible gaps between timed items", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const item = (id, dayOrder, startTime, endTime, isAllDay = false) => ({
    id,
    dayOrder,
    startTime,
    endTime,
    isAllDay,
    createdAt,
  });
  const existing = [item("B", 0, "10:00", "11:00"), item("A", 1, null, null), item("C", 2, "11:00", "12:00")];
  assert.deepEqual(
    normalizeDayOrder([...existing, item("Span", null, null, null, true)]).map(({ item, dayOrder }) => [
      item.id,
      dayOrder,
    ]),
    [
      ["B", 0],
      ["A", 1],
      ["C", 2],
      ["Span", 3],
    ],
  );
  assert.deepEqual(
    normalizeDayOrder([...existing, item("D", null, "10:30", "11:30")]).map(({ item }) => item.id),
    ["B", "A", "D", "C"],
  );
  assert.deepEqual(
    normalizeDayOrder([item("flex", null, null, null), item("timed", null, "09:00", "10:00")]).map(
      ({ item }) => item.id,
    ),
    ["timed", "flex"],
  );
});

test("the client inserts a created item at its persisted order", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const date = "2026-09-24";
  const item = (id, dayOrder) => ({ id, date, dayOrder, startTime: null, endTime: null, isAllDay: false, createdAt });
  const items = [item("B", 0), item("Gap", 1), item("C", 2)];
  assert.deepEqual(
    mergeCreatedTravelObject(items, item("D", 2)).map(({ id, dayOrder }) => [id, dayOrder]),
    [
      ["B", 0],
      ["Gap", 1],
      ["D", 2],
      ["C", 3],
    ],
  );
  assert.deepEqual(
    items.map(({ dayOrder }) => dayOrder),
    [0, 1, 2],
  );
});

test("Itinerary gap positions retain forward end drops and timed neighbors", () => {
  const date = "2026-09-24";
  const fixed = (id, startTime) => ({ id, date, startTime, endTime: "12:00", isAllDay: false });
  const [a, b, c] = [fixed("a", "09:00"), fixed("b", "10:00"), fixed("c", "11:00")];
  assert.deepEqual(itineraryDropPosition([a, b, c], a, date, 3), { requestedOrder: 3, betweenTimedAnchors: false });
  assert.deepEqual(itineraryDropPosition([a, b, c], a, date, 2), { requestedOrder: 2, betweenTimedAnchors: true });
  assert.deepEqual(itineraryDropPosition([a, b, c], c, date, 1), { requestedOrder: 1, betweenTimedAnchors: true });
  const fromAnotherDay = { ...a, id: "new", date: "2026-09-25" };
  assert.deepEqual(itineraryDropPosition([a, b, c], fromAnotherDay, date, 3), {
    requestedOrder: 3,
    betweenTimedAnchors: false,
  });
});

test("Itinerary gap positions skip carried-over stops and count all-day items first", () => {
  const date = "2026-09-24";
  const flexible = (id) => ({ id, date, startTime: null, endTime: null, isAllDay: false });
  const hotel = { id: "hotel", date: "2026-09-23", startTime: "15:00", endTime: "10:00", isAllDay: false };
  const [a, b, c] = [flexible("a"), flexible("b"), flexible("c")];
  // Route order is a, b, c; last night's hotel is shown first but belongs to the previous day.
  assert.equal(itineraryDropPosition([hotel, a, b, c], b, date, 1).requestedOrder, 0);
  assert.equal(itineraryDropPosition([hotel, a, b, c], a, date, 3).requestedOrder, 2);
  assert.equal(itineraryDropPosition([hotel, a, b, c], a, date, 4).requestedOrder, 3);
  // Route order is allDay, a, b, c.
  const allDay = { ...flexible("all-day"), isAllDay: true };
  assert.equal(itineraryDropPosition([a, b, allDay, c], c, date, 1).requestedOrder, 2);
  assert.equal(itineraryDropPosition([a, b, allDay, c], c, date, 0).requestedOrder, 1);
});

test("Day displays all-day items first without changing order within either group", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const items = [
    { id: "fixed", dayOrder: 0, startTime: "09:00", endTime: "10:00", isAllDay: false, createdAt },
    { id: "all-day-later", dayOrder: 3, startTime: null, endTime: null, isAllDay: true, createdAt },
    { id: "flexible", dayOrder: 1, startTime: null, endTime: null, isAllDay: false, createdAt },
    { id: "all-day-earlier", dayOrder: 2, startTime: null, endTime: null, isAllDay: true, createdAt },
  ];
  assert.deepEqual(
    items.sort(compareDayDisplayOrder).map((item) => item.id),
    ["all-day-earlier", "all-day-later", "fixed", "flexible"],
  );
});

test("Day puts fixed bookings in time order while keeping flexible ideas in their saved gaps", () => {
  const createdAt = "2026-11-29T00:00:00.000Z";
  const item = (id, dayOrder, startTime, endTime, isAllDay = false) => ({
    id,
    dayOrder,
    startTime,
    endTime,
    isAllDay,
    createdAt,
  });
  const items = [
    item("flexible", 0, null, null),
    item("morning", 1, "10:00", "12:00"),
    item("evening", 2, "18:00", "19:00"),
    item("noon", 3, "12:00", "13:00"),
    item("afternoon", 4, "14:00", "15:00"),
  ];
  assert.deepEqual(
    sortDayDisplayItems(items).map(({ id }) => id),
    ["flexible", "morning", "noon", "afternoon", "evening"],
  );
  assert.deepEqual(
    items.map(({ id }) => id),
    ["flexible", "morning", "evening", "noon", "afternoon"],
  );
  const dated = items.map((entry) => ({ ...entry, date: "2026-11-29", endDate: "2026-11-29" }));
  assert.equal(canDropInDayOrder(dated, dated[0], "2026-11-29", 2), true);
});

test("compacting after deletion preserves the remaining explicit order", () => {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const items = [
    { id: "last", dayOrder: 3, startTime: "08:00", endTime: "09:00", isAllDay: false, createdAt },
    { id: "first", dayOrder: 0, startTime: null, endTime: null, isAllDay: false, createdAt },
    { id: "middle", dayOrder: 2, startTime: "10:00", endTime: "11:00", isAllDay: false, createdAt },
  ];
  assert.deepEqual(
    compactDayOrder(items).map(({ item, dayOrder }) => [item.id, dayOrder]),
    [
      ["first", 0],
      ["middle", 1],
      ["last", 2],
    ],
  );
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
  assert.deepEqual(
    sortTravelObjects(items).map((item) => item.id),
    ["first", "second", "later", "idea"],
  );
});

test("Week groups flexible items into the free window between fixed neighbours", () => {
  const date = "2026-09-24";
  const createdAt = "2026-09-24T00:00:00.000Z";
  const item = (id, dayOrder, startTime = null, endTime = null, endDate = date) => ({
    id,
    date,
    endDate,
    dayOrder,
    startTime,
    endTime,
    isAllDay: false,
    createdAt,
  });
  const early = item("early", 0);
  const temple = item("temple", 1, "09:15", "11:00");
  const lunch = item("lunch", 2);
  const shops = item("shops", 3);
  const garden = item("garden", 4, "13:30", "15:00");
  const stroll = item("stroll", 5);
  const windows = weekFlexibleWindows([early, temple, lunch, shops, garden, stroll]);
  assert.deepEqual(
    windows.map(({ key, start, end, items }) => ({ key, start, end, ids: items.map((entry) => entry.id) })),
    [
      { key: "before-temple", start: null, end: "09:15", ids: ["early"] },
      { key: "temple-garden", start: "11:00", end: "13:30", ids: ["lunch", "shops"] },
      { key: "garden-after", start: "15:00", end: null, ids: ["stroll"] },
    ],
  );
  assert.deepEqual(weekFlexibleWindows([temple, garden]), []);
  assert.deepEqual(
    weekFlexibleWindows([lunch, shops]).map(({ start, end }) => ({ start, end })),
    [{ start: null, end: null }],
  );
  const overnight = item("overnight", 0, "22:00", "06:00", "2026-09-25");
  assert.equal(weekFlexibleWindows([overnight, lunch])[0].start, "24:00");
});

test("sameDayGapOrder skips carried-over multi-day items when translating a visible gap", async () => {
  const { sameDayGapOrder } = await import("../lib/schedule-order.ts");
  const visible = [
    { id: "hotel", date: "2026-12-01" },
    { id: "a", date: "2026-12-03" },
    { id: "b", date: "2026-12-03" },
  ];
  assert.equal(sameDayGapOrder(visible, "2026-12-03", 0), 0);
  assert.equal(sameDayGapOrder(visible, "2026-12-03", 1), 0);
  assert.equal(sameDayGapOrder(visible, "2026-12-03", 2), 1);
  assert.equal(sameDayGapOrder(visible, "2026-12-03", 3), 2);
  assert.equal(sameDayGapOrder(visible, "2026-12-01", 3), 1);
});
