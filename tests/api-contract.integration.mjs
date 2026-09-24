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
  const missingQuery = await request("/api/travel-objects");
  assert.deepEqual(missingQuery, { status: 400, body: { error: "tripId is required." } });

  const trip = await request("/api/trips", "POST", {
    title: "API parity fixture", startDate: "2026-09-24", endDate: "2026-09-28", timezone: "Asia/Singapore",
  });
  assert.equal(trip.status, 201);
  tripId = trip.body.id;

  const base = { tripId, type: "activity", location: null, cost: null, notes: null, tags: [] };
  const unscheduled = await request("/api/travel-objects", "POST", { ...base, title: "Unscheduled", date: null, endDate: null, startTime: null, endTime: null, isAllDay: false });
  assert.equal(unscheduled.status, 201);
  assert.deepEqual([unscheduled.body.date, unscheduled.body.startDateTime, unscheduled.body.endDateTime, unscheduled.body.dayIndex], [null, null, null, null]);

  const flexible = await request("/api/travel-objects", "POST", { ...base, title: "Flexible", date: "2026-09-24", endDate: "2026-09-24", startTime: null, endTime: null, placementTime: "09:15", isAllDay: false });
  assert.equal(flexible.status, 201);
  assert.deepEqual([flexible.body.placementTime, flexible.body.startDateTime, flexible.body.dayIndex], ["09:15", null, 1]);

  const fixed = await request("/api/travel-objects", "POST", { ...base, title: "Fixed", date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "01:00", isAllDay: false });
  assert.equal(fixed.status, 201);
  assert.deepEqual([fixed.body.date, fixed.body.endDate, fixed.body.startDateTime, fixed.body.endDateTime], ["2026-09-24", "2026-09-25", "2026-09-24T15:30:00.000Z", "2026-09-24T17:00:00.000Z"]);

  const allDay = await request("/api/travel-objects", "POST", { ...base, title: "All day", date: "2026-09-25", endDate: "2026-09-26", isAllDay: true });
  assert.equal(allDay.status, 201);
  assert.deepEqual([allDay.body.startTime, allDay.body.endTime, allDay.body.startDateTime, allDay.body.endDateTime], [null, null, "2026-09-24T16:00:00.000Z", "2026-09-25T16:00:00.000Z"]);

  const legacy = await request("/api/travel-objects", "POST", { ...base, title: "Legacy", startDateTime: "2026-09-24T01:00:00.000Z", endDateTime: "2026-09-24T02:00:00.000Z", isAllDay: false });
  assert.equal(legacy.status, 201);
  assert.deepEqual([legacy.body.date, legacy.body.startTime, legacy.body.endTime], ["2026-09-24", "09:00", "10:00"]);

  const canonicalPatch = await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { endDate: "2026-09-25", endTime: "02:00" });
  assert.equal(canonicalPatch.status, 200);
  assert.deepEqual([canonicalPatch.body.endDate, canonicalPatch.body.endTime, canonicalPatch.body.endDateTime], ["2026-09-25", "02:00", "2026-09-24T18:00:00.000Z"]);

  const flexiblePatch = await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { startTime: null, endTime: null });
  assert.equal(flexiblePatch.status, 200);
  assert.deepEqual([flexiblePatch.body.date, flexiblePatch.body.startTime, flexiblePatch.body.endTime, flexiblePatch.body.placementTime], ["2026-09-24", null, null, "09:00"]);

  const allDayPatch = await request(`/api/travel-objects/${allDay.body.id}`, "PATCH", { endDate: "2026-09-27" });
  assert.equal(allDayPatch.status, 200);
  assert.deepEqual([allDayPatch.body.endDate, allDayPatch.body.isAllDay, allDayPatch.body.startTime, allDayPatch.body.placementTime], ["2026-09-27", true, null, null]);

  const invalidPatchRange = await request(`/api/travel-objects/${allDay.body.id}`, "PATCH", { endDate: "2026-09-24" });
  assert.deepEqual(invalidPatchRange, { status: 400, body: { error: "endDate must be on or after date." } });

  const legacyPatch = await request(`/api/travel-objects/${legacy.body.id}`, "PATCH", { startDateTime: "2026-09-25T01:00:00.000Z", endDateTime: "2026-09-25T02:00:00.000Z" });
  assert.equal(legacyPatch.status, 200);
  assert.deepEqual([legacyPatch.body.date, legacyPatch.body.startTime, legacyPatch.body.endTime], ["2026-09-25", "09:00", "10:00"]);

  const canonicalPrecedence = await request(`/api/travel-objects/${legacy.body.id}`, "PATCH", { startTime: "12:00", endTime: "13:00", startDateTime: "2026-09-24T01:00:00.000Z", endDateTime: "2026-09-24T02:00:00.000Z" });
  assert.equal(canonicalPrecedence.status, 200);
  assert.deepEqual([canonicalPrecedence.body.date, canonicalPrecedence.body.startTime, canonicalPrecedence.body.endTime], ["2026-09-25", "12:00", "13:00"]);

  const legacyUnschedule = await request(`/api/travel-objects/${flexible.body.id}`, "PATCH", { startDateTime: null, endDateTime: null });
  assert.equal(legacyUnschedule.status, 200);
  assert.deepEqual([legacyUnschedule.body.date, legacyUnschedule.body.endDate, legacyUnschedule.body.placementTime, legacyUnschedule.body.startDateTime, legacyUnschedule.body.dayOrder], [null, null, null, null, null]);

  const loneLegacyEnd = await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { endDateTime: "2026-09-24T18:00:00.000Z" });
  assert.deepEqual(loneLegacyEnd, { status: 400, body: { error: "Provide at least one field to update." } });

  const invalid = await request("/api/travel-objects", "POST", { ...base, title: "Invalid", date: "2026-09-24", startTime: "10:00", endTime: "09:00" });
  assert.deepEqual(invalid, { status: 400, body: { error: "endTime must be after startTime on the same date." } });

  const list = await request(`/api/travel-objects?tripId=${tripId}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 5);
  assert.ok(list.body.every((item) => Object.hasOwn(item, "startDateTime") && Object.hasOwn(item, "dayIndex")));

  const deleted = await request(`/api/travel-objects/${fixed.body.id}`, "DELETE");
  assert.equal(deleted.status, 204);
  assert.equal((await request(`/api/travel-objects/${fixed.body.id}`)).status, 404);
  console.log("API contract fixture passed: GET, POST, PATCH, DELETE, canonical and legacy schedules.");
} finally {
  if (tripId) {
    const cleanup = await request(`/api/trips/${tripId}`, "DELETE");
    assert.equal(cleanup.status, 204);
  }
}
