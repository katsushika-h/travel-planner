import assert from "node:assert/strict";
import test from "node:test";
import {
  WALK_DETOUR_FACTOR,
  dayLegs,
  dayTotals,
  estimateWalk,
  formatDistance,
  formatDuration,
  haversineMeters,
} from "../lib/travel-legs.ts";

const item = (id, lat, lng, extra = {}) => ({
  id,
  kind: "event",
  type: "food",
  location: lat === undefined ? null : { lat, lng },
  ...extra,
});

const tokyo = { lat: 35.6812, lng: 139.7671 };
const shinjuku = { lat: 35.6896, lng: 139.7006 };

test("haversine matches a known distance and zero distance", () => {
  const meters = haversineMeters(tokyo, shinjuku);
  assert.ok(Math.abs(meters - 6070) / 6070 < 0.01, `got ${meters}`);
  assert.equal(haversineMeters(tokyo, tokyo), 0);
});

test("estimateWalk applies detour and speed", () => {
  const walk = estimateWalk(1000);
  assert.equal(walk.meters, 1000 * WALK_DETOUR_FACTOR);
  assert.ok(Math.abs(walk.seconds - (1300 / 4800) * 3600) < 1e-6);
});

test("dayLegs gives ok legs with walking estimates", () => {
  const legs = dayLegs([item("a", tokyo.lat, tokyo.lng), item("b", shinjuku.lat, shinjuku.lng)]);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].status, "ok");
  assert.equal(legs[0].fromId, "a");
  assert.equal(legs[0].toId, "b");
  assert.ok(Math.abs(legs[0].meters - haversineMeters(tokyo, shinjuku) * 1.3) < 1e-6);
  const same = dayLegs([item("a", 1, 1), item("b", 1, 1)]);
  assert.equal(same[0].meters, 0);
  assert.equal(same[0].seconds, 0);
});

test("notes are skipped and legs bridge across them", () => {
  const legs = dayLegs([item("a", 1, 1), item("n", 2, 2, { kind: "note" }), item("b", 1, 1.01)]);
  assert.equal(legs.length, 1);
  assert.deepEqual([legs[0].fromId, legs[0].toId], ["a", "b"]);
});

test("unmapped when coordinates are missing or invalid", () => {
  const ok = item("a", 1, 1);
  for (const bad of [
    item("b"),
    item("b", null, 5),
    item("b", NaN, 5),
    item("b", 91, 5),
    item("b", 5, -181),
    item("b", "1", 5),
  ]) {
    assert.equal(dayLegs([ok, bad])[0].status, "unmapped");
    assert.equal(dayLegs([bad, ok])[0].status, "unmapped");
  }
});

test("commute and flight produce transfer legs on both sides", () => {
  for (const type of ["commute", "flight"]) {
    const legs = dayLegs([item("a", 1, 1), item("t", 1, 1.1, { type }), item("b", 1, 1.2)]);
    assert.deepEqual(
      legs.map((l) => l.status),
      ["transfer", "transfer"],
    );
  }
  // transfer wins over unmapped
  assert.equal(dayLegs([item("a"), item("t", 1, 1, { type: "flight" })])[0].status, "transfer");
});

test("empty and single-item days have no legs", () => {
  assert.deepEqual(dayLegs([]), []);
  assert.deepEqual(dayLegs([item("a", 1, 1)]), []);
  assert.deepEqual(dayLegs([item("a", 1, 1), item("n", 1, 1, { kind: "note" })]), []);
});

test("formatDistance boundaries", () => {
  assert.equal(formatDistance(0), "0 m");
  assert.equal(formatDistance(849), "850 m");
  assert.equal(formatDistance(994), "990 m");
  assert.equal(formatDistance(995), "1.0 km");
  assert.equal(formatDistance(1000), "1.0 km");
  assert.equal(formatDistance(1049), "1.0 km");
  assert.equal(formatDistance(1250), "1.3 km");
});

test("formatDuration boundaries", () => {
  assert.equal(formatDuration(0), "0 min");
  assert.equal(formatDuration(1), "1 min");
  assert.equal(formatDuration(59), "1 min");
  assert.equal(formatDuration(60), "1 min");
  assert.equal(formatDuration(61), "2 min");
  assert.equal(formatDuration(3540), "59 min");
  assert.equal(formatDuration(3600), "1 h 00 min");
  assert.equal(formatDuration(3900), "1 h 05 min");
});

test("dayTotals sums ok legs and counts only unmapped as skipped", () => {
  const totals = dayTotals([
    { fromId: "a", toId: "b", status: "ok", meters: 100, seconds: 60 },
    { fromId: "b", toId: "c", status: "ok", meters: 50, seconds: 30 },
    { fromId: "c", toId: "d", status: "unmapped" },
    { fromId: "d", toId: "e", status: "transfer" },
  ]);
  assert.deepEqual(totals, { meters: 150, seconds: 90, skipped: 1 });
  assert.deepEqual(dayTotals([]), { meters: 0, seconds: 0, skipped: 0 });
});
