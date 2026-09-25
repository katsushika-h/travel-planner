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

async function requestRaw(path, method, body, contentType = "application/json") {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { "Content-Type": contentType },
    body,
  });
  return { status: response.status, body: await response.json() };
}

async function uploadAttachment(path, fileName, content, contentType) {
  const form = new FormData();
  form.append("file", new Blob([content], { type: contentType }), fileName);
  const response = await fetch(new URL(path, baseUrl), { method: "POST", body: form });
  return { status: response.status, body: await response.json() };
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
  assert.deepEqual(await requestRaw("/api/travel-objects", "POST", "{"), { status: 400, body: { error: "Request body must be a JSON object." } });
  assert.deepEqual(await requestRaw("/api/travel-objects", "POST", "[]"), { status: 400, body: { error: "Request body must be a JSON object." } });
  const unscheduled = await request("/api/travel-objects", "POST", { ...base, title: "Unscheduled", date: null, endDate: null, startTime: null, endTime: null, isAllDay: false });
  assert.equal(unscheduled.status, 201);
  assert.deepEqual(await requestRaw(`/api/travel-objects/${unscheduled.body.id}`, "PATCH", "{"), { status: 400, body: { error: "Request body must be a JSON object." } });
  assert.deepEqual([unscheduled.body.date, unscheduled.body.startDateTime, unscheduled.body.endDateTime, unscheduled.body.dayIndex], [null, null, null, null]);
  const placedIdea = await request(`/api/travel-objects/${unscheduled.body.id}`, "PATCH", { date: "2026-09-27", endDate: "2026-09-27", placementTime: "10:15" });
  assert.equal(placedIdea.status, 200);
  assert.deepEqual([placedIdea.body.date, placedIdea.body.endDate, placedIdea.body.startTime, placedIdea.body.endTime, placedIdea.body.placementTime, placedIdea.body.dayOrder], ["2026-09-27", "2026-09-27", null, null, "10:15", 0]);
  const returnedIdea = await request(`/api/travel-objects/${unscheduled.body.id}`, "PATCH", { date: null });
  assert.equal(returnedIdea.status, 200);
  assert.deepEqual([returnedIdea.body.date, returnedIdea.body.endDate, returnedIdea.body.startTime, returnedIdea.body.endTime, returnedIdea.body.placementTime, returnedIdea.body.dayOrder], [null, null, null, null, null, null]);

  const flexible = await request("/api/travel-objects", "POST", { ...base, title: "Flexible", date: "2026-09-24", endDate: "2026-09-24", startTime: null, endTime: null, placementTime: "09:15", isAllDay: false });
  assert.equal(flexible.status, 201);
  assert.deepEqual([flexible.body.placementTime, flexible.body.startDateTime, flexible.body.dayIndex], ["09:15", null, 1]);

  const fixed = await request("/api/travel-objects", "POST", { ...base, title: "Fixed", date: "2026-09-24", endDate: "2026-09-25", startTime: "23:30", endTime: "01:00", isAllDay: false });
  assert.equal(fixed.status, 201);
  assert.deepEqual([fixed.body.date, fixed.body.endDate, fixed.body.startDateTime, fixed.body.endDateTime], ["2026-09-24", "2026-09-25", "2026-09-24T15:30:00.000Z", "2026-09-24T17:00:00.000Z"]);
  const details = await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { location: { name: "Test Place", lat: 1, lng: 2 }, cost: { amount: 12.5, currency: "USD" }, notes: "Updated notes", tags: ["alpha", "beta"], headerImage: "https://example.com/image.jpg" });
  assert.equal(details.status, 200);
  assert.deepEqual([details.body.location, details.body.cost, details.body.notes, details.body.tags, details.body.headerImage], [{ name: "Test Place", lat: 1, lng: 2 }, { amount: 12.5, currency: "USD" }, "Updated notes", ["alpha", "beta"], "https://example.com/image.jpg"]);
  const clearedDetails = await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { location: null, cost: null, notes: null, tags: [], headerImage: null });
  assert.equal(clearedDetails.status, 200);
  assert.deepEqual([clearedDetails.body.location, clearedDetails.body.cost, clearedDetails.body.notes, clearedDetails.body.tags, clearedDetails.body.headerImage], [null, null, null, [], null]);
  assert.deepEqual(await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { location: [] }), { status: 400, body: { error: "location must be a JSON object or null." } });
  assert.deepEqual(await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { cost: { amount: -1, currency: "USD" } }), { status: 400, body: { error: "cost must have a non-negative numeric amount." } });
  assert.deepEqual(await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { headerImage: "data:image/png;base64,AA" }), { status: 400, body: { error: "headerImage must be an http or https image URL." } });
  assert.deepEqual(await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { tags: "alpha" }), { status: 400, body: { error: "tags must be an array of strings." } });

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
  const afterLegacyMove = await request(`/api/travel-objects?tripId=${tripId}`);
  for (const date of ["2026-09-24", "2026-09-25"]) {
    const orders = afterLegacyMove.body.filter((item) => item.date === date).map((item) => item.dayOrder).sort((a, b) => a - b);
    assert.deepEqual(orders, Array.from({ length: orders.length }, (_, index) => index), `${date} order after legacy move`);
  }

  const canonicalPrecedence = await request(`/api/travel-objects/${legacy.body.id}`, "PATCH", { startTime: "12:00", endTime: "13:00", startDateTime: "2026-09-24T01:00:00.000Z", endDateTime: "2026-09-24T02:00:00.000Z" });
  assert.equal(canonicalPrecedence.status, 200);
  assert.deepEqual([canonicalPrecedence.body.date, canonicalPrecedence.body.startTime, canonicalPrecedence.body.endTime], ["2026-09-25", "12:00", "13:00"]);

  const legacyUnschedule = await request(`/api/travel-objects/${flexible.body.id}`, "PATCH", { startDateTime: null, endDateTime: null });
  assert.equal(legacyUnschedule.status, 200);
  assert.deepEqual([legacyUnschedule.body.date, legacyUnschedule.body.endDate, legacyUnschedule.body.placementTime, legacyUnschedule.body.startDateTime, legacyUnschedule.body.dayOrder], [null, null, null, null, null]);
  const afterLegacyUnschedule = await request(`/api/travel-objects?tripId=${tripId}`);
  const remainingOrders = afterLegacyUnschedule.body.filter((item) => item.date === "2026-09-24").map((item) => item.dayOrder).sort((a, b) => a - b);
  assert.deepEqual(remainingOrders, Array.from({ length: remainingOrders.length }, (_, index) => index), "source order after legacy unschedule");

  const loneLegacyEnd = await request(`/api/travel-objects/${fixed.body.id}`, "PATCH", { endDateTime: "2026-09-24T18:00:00.000Z" });
  assert.deepEqual(loneLegacyEnd, { status: 400, body: { error: "Provide at least one field to update." } });

  const attachmentPath = `/api/travel-objects/${fixed.body.id}/attachments`;
  const uploaded = await uploadAttachment(attachmentPath, "notes.txt", "fixture attachment", "text/plain");
  assert.equal(uploaded.status, 201);
  assert.deepEqual([uploaded.body.fileName, uploaded.body.contentType, uploaded.body.size], ["notes.txt", "text/plain", 18]);
  const attachments = await request(attachmentPath);
  assert.equal(attachments.status, 200);
  assert.deepEqual(attachments.body.map(({ id, fileName, contentType, size }) => ({ id, fileName, contentType, size })), [{ id: uploaded.body.id, fileName: "notes.txt", contentType: "text/plain", size: 18 }]);
  const attachmentUrl = `${attachmentPath}/${uploaded.body.id}`;
  const preview = await fetch(new URL(attachmentUrl, baseUrl));
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-disposition"), "inline; filename*=UTF-8''notes.txt");
  assert.equal(await preview.text(), "fixture attachment");
  const download = await fetch(new URL(`${attachmentUrl}?download=1`, baseUrl));
  assert.equal(download.headers.get("content-disposition"), "attachment; filename*=UTF-8''notes.txt");
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await download.text(), "fixture attachment");
  assert.equal((await request(`${attachmentPath}/${uploaded.body.id}`, "DELETE")).status, 204);
  assert.deepEqual(await request(`${attachmentPath}/${uploaded.body.id}`), { status: 404, body: { error: "Attachment not found." } });
  assert.deepEqual(await uploadAttachment(attachmentPath, "unsupported.exe", "bad", "application/octet-stream"), { status: 400, body: { error: "Supported formats: JPG, PNG, PDF, DOCX, spreadsheets, presentations, TXT, and CSV." } });

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
