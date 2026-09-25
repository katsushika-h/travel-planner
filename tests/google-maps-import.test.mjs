import assert from "node:assert/strict";
import test from "node:test";
import { importGoogleMapsCsv } from "../lib/google-maps-import.ts";

test("CSV import keeps resolved and unresolved Maps links through object creation", async () => {
  const originalFetch = globalThis.fetch;
  const created = [];
  const progress = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url === "/api/maps/resolve") {
      if (body.url.endsWith("/failed")) throw new TypeError("resolver unavailable");
      return Response.json(body.url.endsWith("/resolved") ? { lat: 1.25, lng: 103.75 } : { lat: null, lng: null });
    }
    assert.equal(url, "/api/travel-objects");
    created.push(body);
    return Response.json({ ...body, id: String(created.length) }, { status: 201 });
  };

  try {
    const csv = "Title,Note,URL,Category,Date,End Date\nResolved,ok,https://maps.example/resolved,Food,2026-09-24,2026-09-25\nNo coordinates,ok,https://maps.example/without,New Type,2026-09-25,\nResolver failed,ok,https://maps.example/failed,Food,invalid,\n";
    const result = await importGoogleMapsCsv(csv, { id: "trip-1", timezone: "Asia/Singapore" }, ["food"], (complete, total) => progress.push([complete, total]));
    assert.deepEqual([result.created.length, result.unresolvedCount, result.invalidDates, result.skipped], [3, 2, 1, 0]);
    assert.deepEqual(result.newTypes, ["New Type"]);
    assert.deepEqual(progress, [[0, 3], [1, 3], [2, 3], [3, 3]]);
    assert.deepEqual(created.map(({ type, location }) => [type, location.googleMapsUrl, location.lat ?? null, location.lng ?? null]), [
      ["food", "https://maps.example/resolved", 1.25, 103.75],
      ["New Type", "https://maps.example/without", null, null],
      ["food", "https://maps.example/failed", null, null],
    ]);
    assert.deepEqual([created[0].date, created[0].endDate, created[0].isAllDay], ["2026-09-24", "2026-09-25", true]);
    assert.deepEqual([created[2].date, created[2].endDate], [null, null]);
    assert.ok(created.every((item) => item.tripId === "trip-1"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CSV import reports a create failure after other rows were created", async () => {
  const originalFetch = globalThis.fetch;
  const createdTitles = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url === "/api/maps/resolve") return Response.json({ lat: null, lng: null });
    assert.equal(url, "/api/travel-objects");
    if (body.title === "Second") return Response.json({ error: "Create failed" }, { status: 500 });
    createdTitles.push(body.title);
    return Response.json({ ...body, id: body.title }, { status: 201 });
  };

  try {
    const csv = "Title,Note,URL\nFirst,note,https://maps.example/first\nSecond,note,https://maps.example/second\nThird,note,https://maps.example/third\n";
    await assert.rejects(
      importGoogleMapsCsv(csv, { id: "trip-1", timezone: "Asia/Singapore" }, [], () => {}),
      /Create failed/,
    );
    assert.deepEqual(createdTitles, ["First", "Third"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
