import assert from "node:assert/strict";

const baseUrl = process.env.API_BASE_URL;
if (!baseUrl) throw new Error("Set API_BASE_URL to a running isolated Travel Planner server.");

async function request(path, method = "GET", body) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

let tripId;
try {
  const trip = await request("/api/trips", "POST", { title: "Ordering parity fixture", startDate: "2026-09-24", endDate: "2026-09-29", timezone: "Asia/Singapore" });
  assert.equal(trip.status, 201);
  tripId = trip.body.id;
  const base = { tripId, type: "activity", location: null, cost: null, notes: null, tags: [], isAllDay: false };
  const create = async (title, date, startTime, endTime, endDate = date) => {
    const result = await request("/api/travel-objects", "POST", { ...base, title, date, endDate, startTime, endTime });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body;
  };
  const a = await create("A", "2026-09-24", "09:00", "10:00");
  const b = await create("B", "2026-09-24", "10:00", "11:00");
  const c = await create("C", "2026-09-24", "11:00", "12:00");
  assert.deepEqual([a.dayOrder, b.dayOrder, c.dayOrder], [0, 1, 2]);

  const invalidOrder = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: a.id, date: "2026-09-25", dayOrder: -1 });
  assert.deepEqual(invalidOrder, { status: 400, body: { error: "dayOrder must be a non-negative integer." } });
  const invalidPlacement = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: a.id, date: "2026-09-25", dayOrder: 0, clearTime: true, placementTime: "10:10" });
  assert.deepEqual(invalidPlacement, { status: 400, body: { error: "placementTime must fall on a 15-minute interval." } });
  const removedField = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: a.id, date: "2026-09-25", dayOrder: 0, dayIndex: 2 });
  assert.deepEqual(removedField, { status: 400, body: { error: "dayIndex is no longer supported; use canonical schedule fields." } });
  const afterInvalidReorders = await request(`/api/travel-objects?tripId=${tripId}`);
  assert.equal(afterInvalidReorders.status, 200);
  assert.deepEqual(afterInvalidReorders.body.map(({ title, date, dayOrder }) => [title, date, dayOrder]), [
    ["A", "2026-09-24", 0], ["B", "2026-09-24", 1], ["C", "2026-09-24", 2],
  ]);

  const forward = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: a.id, date: "2026-09-24", dayOrder: 3 });
  assert.equal(forward.status, 200);
  assert.ok(forward.body.every((item) => ["startDateTime", "endDateTime", "dayIndex"].every((field) => !Object.hasOwn(item, field))));
  assert.deepEqual(forward.body.filter((item) => item.date === "2026-09-24").map((item) => item.title), ["B", "C", "A"]);
  const backward = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: a.id, date: "2026-09-24", dayOrder: 0 });
  assert.equal(backward.status, 200);
  assert.deepEqual(backward.body.filter((item) => item.date === "2026-09-24").map((item) => item.title), ["A", "B", "C"]);
  const beforeLast = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: a.id, date: "2026-09-24", dayOrder: 2 });
  assert.equal(beforeLast.status, 200);
  assert.deepEqual(beforeLast.body.filter((item) => item.date === "2026-09-24").map((item) => item.title), ["B", "A", "C"]);
  assert.equal((await request("/api/travel-objects/reorder", "POST", { tripId, objectId: a.id, date: "2026-09-24", dayOrder: 0 })).status, 200);

  const overnight = await create("Overnight", "2026-09-24", "23:30", "01:00", "2026-09-25");
  const crossDay = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: overnight.id, date: "2026-09-26", dayOrder: 0 });
  assert.equal(crossDay.status, 200);
  const moved = crossDay.body.find((item) => item.id === overnight.id);
  assert.deepEqual([moved.date, moved.endDate, moved.startTime, moved.endTime, moved.dayOrder], ["2026-09-26", "2026-09-27", "23:30", "01:00", 0]);

  const fixedToClear = await create("Clear time", "2026-09-25", "14:00", "15:00");
  const cleared = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: fixedToClear.id, date: "2026-09-24", dayOrder: 2, clearTime: true, placementTime: "14:15" });
  assert.equal(cleared.status, 200);
  const clearedItem = cleared.body.find((item) => item.id === fixedToClear.id);
  assert.deepEqual([clearedItem.date, clearedItem.endDate, clearedItem.startTime, clearedItem.endTime, clearedItem.placementTime], ["2026-09-24", "2026-09-24", null, null, "14:15"]);

  const flexible = await request("/api/travel-objects", "POST", { ...base, title: "Flexible", date: "2026-09-25", endDate: "2026-09-25", startTime: null, endTime: null, placementTime: "09:15" });
  assert.equal(flexible.status, 201);
  const placed = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: flexible.body.id, date: "2026-09-24", dayOrder: 1, clearTime: true, placementTime: "10:30" });
  assert.equal(placed.status, 200);
  const placedItem = placed.body.find((item) => item.id === flexible.body.id);
  assert.deepEqual([placedItem.date, placedItem.startTime, placedItem.endTime, placedItem.placementTime], ["2026-09-24", null, null, "10:30"]);
  assert.deepEqual(placed.body.filter((item) => item.date === "2026-09-24").map((item) => item.dayOrder), [0, 1, 2, 3, 4]);

  const allDay = await request("/api/travel-objects", "POST", { ...base, title: "Multi-day all-day", date: "2026-09-24", endDate: "2026-09-26", startTime: null, endTime: null, isAllDay: true });
  assert.equal(allDay.status, 201);
  const allDayFlexible = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: allDay.body.id, date: "2026-09-27", dayOrder: 0, clearTime: true, placementTime: "09:00" });
  assert.deepEqual(allDayFlexible, { status: 400, body: { error: "All-day items can only be moved to another day." } });
  const allDaySameDay = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: allDay.body.id, date: "2026-09-24", dayOrder: 0 });
  assert.deepEqual(allDaySameDay, { status: 400, body: { error: "All-day items can only be moved to another day." } });
  const allDayMove = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: allDay.body.id, date: "2026-09-27", dayOrder: 0 });
  assert.equal(allDayMove.status, 200, JSON.stringify(allDayMove.body));
  const movedAllDay = allDayMove.body.find((item) => item.id === allDay.body.id);
  assert.deepEqual([movedAllDay.date, movedAllDay.endDate, movedAllDay.isAllDay, movedAllDay.placementTime], ["2026-09-27", "2026-09-29", true, null]);
  const beforeDelete = allDayMove.body.filter((item) => item.date === "2026-09-24");
  assert.ok(beforeDelete.length > 2);
  const deletedId = beforeDelete[1].id;
  assert.equal((await request(`/api/travel-objects/${deletedId}`, "DELETE")).status, 204);
  const afterDelete = await request(`/api/travel-objects?tripId=${tripId}`);
  assert.equal(afterDelete.status, 200);
  assert.deepEqual(afterDelete.body.filter((item) => item.date === "2026-09-24").map((item) => item.dayOrder), Array.from({ length: beforeDelete.length - 1 }, (_, index) => index));
  await create("Anchor B", "2026-09-28", "10:00", "11:00");
  await create("Anchor C", "2026-09-28", "11:00", "12:00");
  const gapItem = await create("Gap", "2026-09-28", null, null);
  const insertedGap = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: gapItem.id, date: "2026-09-28", dayOrder: 1 });
  assert.equal(insertedGap.status, 200);
  assert.deepEqual(insertedGap.body.filter((item) => item.date === "2026-09-28").map((item) => item.title), ["Anchor B", "Gap", "Anchor C"]);
  await create("Tail", "2026-09-28", null, null);
  await create("Timed D", "2026-09-28", "10:30", "11:30");
  const afterCreate = await request(`/api/travel-objects?tripId=${tripId}`);
  assert.equal(afterCreate.status, 200);
  assert.deepEqual(afterCreate.body.filter((item) => item.date === "2026-09-28").map((item) => item.title), ["Anchor B", "Gap", "Timed D", "Anchor C", "Tail"]);
  const weekForward = await request("/api/travel-objects/reorder", "POST", { tripId, objectId: gapItem.id, date: "2026-09-28", dayOrder: 3, clearTime: true, placementTime: "10:45" });
  assert.equal(weekForward.status, 200);
  assert.deepEqual(weekForward.body.filter((item) => item.date === "2026-09-28").map((item) => item.title), ["Anchor B", "Timed D", "Gap", "Anchor C", "Tail"]);
  assert.equal(weekForward.body.find((item) => item.id === gapItem.id).placementTime, "10:45");
  console.log("Ordering contract passed: forward/backward, fixed/flexible, and multi-day all-day movement.");
} finally {
  if (tripId) assert.equal((await request(`/api/trips/${tripId}`, "DELETE")).status, 204);
}
