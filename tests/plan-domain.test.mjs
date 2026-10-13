import assert from "node:assert/strict";
import test from "node:test";
import {
  plannedTotals,
  stopMeta,
  stopNumbers,
  stopTimeLabel,
  tripDays,
  safeMapsHref,
} from "../components/views/plan/plan-domain.ts";

const base = {
  startTime: null,
  endTime: null,
  isAllDay: false,
  date: "2026-04-05",
  endDate: "2026-04-05",
  placementTime: null,
  type: "food",
  location: null,
};

test("tripDays lists every date inclusive", () => {
  assert.deepEqual(tripDays("2026-04-30T00:00:00.000Z", "2026-05-02T00:00:00.000Z"), [
    "2026-04-30",
    "2026-05-01",
    "2026-05-02",
  ]);
});

test("stop time label distinguishes confirmed, flexible, and all-day items", () => {
  assert.equal(stopTimeLabel({ ...base, startTime: "09:15", endTime: "11:00" }), "09:15");
  assert.equal(stopTimeLabel({ ...base, placementTime: "12:00" }), "~12:00");
  assert.equal(stopTimeLabel(base), "Flexible");
  assert.equal(stopTimeLabel({ ...base, isAllDay: true }), "All day");
});

test("only stops with coordinates are numbered, in list order", () => {
  const located = { location: { lat: 35, lng: 135 } };
  const numbers = stopNumbers([
    { id: "a", ...located },
    { id: "b", location: { name: "No pin", googleMapsUrl: "https://maps.app.goo.gl/x" } },
    { id: "c", ...located },
    { id: "d", location: null },
  ]);
  assert.deepEqual(
    [...numbers],
    [
      ["a", 1],
      ["c", 2],
    ],
  );
});

test("planned totals group per currency without conversion and skip free or missing costs", () => {
  const totals = plannedTotals([
    { cost: { amount: 1000, currency: "JPY" } },
    { cost: { amount: 500, currency: "JPY" } },
    { cost: { amount: 12.5, currency: "SGD" } },
    { cost: { amount: 0, currency: "JPY" } },
    { cost: null },
  ]);
  assert.equal(totals.length, 2);
  assert.match(totals[0], /1,500/);
  assert.match(totals[1], /12\.50|12\.5/);
});

test("meta line names type, place, and the kind of time", () => {
  assert.equal(
    stopMeta({ ...base, type: "sightseeing", startTime: "09:15", endTime: "11:00", location: { name: "Gion" } }),
    "sightseeing · Gion · until 11:00",
  );
  assert.equal(stopMeta(base), "food · flexible · no location");
});

test("Maps link prefers the saved URL and omits itself without a place", () => {
  assert.equal(safeMapsHref({ googleMapsUrl: "https://maps.app.goo.gl/x" }), "https://maps.app.goo.gl/x");
  assert.match(safeMapsHref({ name: "Gion" }) ?? "", /query=Gion/);
  assert.equal(safeMapsHref(null), null);
  assert.equal(safeMapsHref({ googleMapsUrl: "javascript:alert(1)" }), null);
});
