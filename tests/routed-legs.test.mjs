import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRouteRequest,
  buildSegmentRequest,
  chunkRequestLegs,
  coordinatesById,
  displayTotals,
  drivePlanTotals,
  endpointResolver,
  legCacheKey,
  MAX_ROUTE_LEGS,
  mergePlannedLegs,
  mergeRoutedLegs,
  parkingSpots,
  selectRoutableLegs,
} from "../lib/routed-legs.ts";
import { planDay } from "../lib/travel-clusters.ts";
import { dayLegs } from "../lib/travel-legs.ts";

const stop = (id, lat, lng, extra = {}) => ({
  id,
  kind: "event",
  type: "food",
  location: lat === undefined ? null : { lat, lng },
  ...extra,
});

// a-b near (walkable), b-c far (over 3 km), c-d unmapped, d-e unmapped
const items = [
  stop("a", 35.68, 139.76),
  stop("b", 35.685, 139.765),
  stop("c", 35.75, 139.9),
  stop("d"),
  stop("e", 35.7, 139.7),
];
const legs = dayLegs(items);

test("walk mode routes only walkable ok legs", () => {
  assert.deepEqual(
    selectRoutableLegs(legs, "walk").map((l) => l.fromId),
    ["a"],
  );
});

test("drive mode routes every ok leg", () => {
  assert.deepEqual(
    selectRoutableLegs(legs, "drive").map((l) => l.fromId),
    ["a", "b"],
  );
});

test("request body carries coordinates and mode", () => {
  const { selected, legs: body } = buildRouteRequest(legs, "drive", coordinatesById(items));
  assert.equal(selected.length, 2);
  assert.deepEqual(body[0], { from: { lat: 35.68, lng: 139.76 }, to: { lat: 35.685, lng: 139.765 }, mode: "drive" });
});

test("more than 25 legs: first 25 routed, rest estimated", () => {
  const many = Array.from({ length: 32 }, (_, i) => stop(`s${i}`, 35.68 + i * 0.0001, 139.76));
  const manyLegs = dayLegs(many);
  const { selected, legs: body } = buildRouteRequest(manyLegs, "walk", coordinatesById(many));
  assert.equal(body.length, MAX_ROUTE_LEGS);
  const slots = body.map(() => ({ meters: 10, seconds: 20, geometry: "x" }));
  const merged = mergeRoutedLegs(manyLegs, "walk", selected, slots);
  assert.equal(merged.filter((l) => l.kind === "routed").length, 25);
  assert.equal(merged.filter((l) => l.kind === "estimate").length, 6);
});

test("merge keeps order and positions, and falls back on error slots", () => {
  const { selected } = buildRouteRequest(legs, "drive", coordinatesById(items));
  const merged = mergeRoutedLegs(legs, "drive", selected, [
    { meters: 900, seconds: 120, geometry: "g" },
    { error: "boom" },
  ]);
  assert.deepEqual(
    merged.map((l) => [l.fromId, l.kind]),
    [
      ["a", "routed"],
      ["b", "far"],
      ["c", "unmapped"],
      ["d", "unmapped"],
    ],
  );
  assert.equal(merged[0].mode, "drive");
  assert.equal(merged[0].meters, 900);
  assert.equal(merged[1].mode, "walk");
});

test("missing slots estimate walkable legs and keep far legs far", () => {
  const { selected } = buildRouteRequest(legs, "walk", coordinatesById(items));
  const merged = mergeRoutedLegs(legs, "walk", selected, []);
  assert.equal(merged[0].kind, "estimate");
  assert.equal(merged[1].kind, "far");
});

test("totals are approximate only when an estimate is counted", () => {
  const { selected } = buildRouteRequest(legs, "walk", coordinatesById(items));
  const routed = mergeRoutedLegs(legs, "walk", selected, [{ meters: 1, seconds: 60, geometry: "" }]);
  assert.deepEqual(displayTotals(routed), { seconds: 60, counted: 1, approximate: false });
  assert.equal(displayTotals(mergeRoutedLegs(legs, "walk", selected, [])).approximate, true);
});

test("cache key rounds coordinates and includes the mode", () => {
  const a = { from: { lat: 1.000001, lng: 2 }, to: { lat: 3, lng: 4 }, mode: "walk" };
  assert.equal(legCacheKey(a), legCacheKey({ ...a, from: { lat: 1.000002, lng: 2 } }));
  assert.notEqual(legCacheKey(a), legCacheKey({ ...a, mode: "drive" }));
});

// Drive-mode planning: x -> y is far (drive), y -> z is near (walk).
const park = { name: "Lot", lat: 35.0501, lng: 139.0501 };
const driveItems = [
  stop("x", 35.0, 139.0),
  stop("y", 35.05, 139.05, { location: { lat: 35.05, lng: 139.05, parking: park } }),
  stop("z", 35.051, 139.051),
];
const driveLegs = dayLegs(driveItems);
const resolve = endpointResolver(driveItems);
const plan = planDay(driveLegs, "drive", { parkingStopIds: new Set(["y"]) });

test("resolver maps stops to locations and parking endpoints to saved parking", () => {
  assert.deepEqual(resolve({ kind: "stop", id: "x" }), { lat: 35.0, lng: 139.0 });
  assert.deepEqual(resolve({ kind: "parking", id: "y" }), { lat: park.lat, lng: park.lng });
  assert.equal(resolve({ kind: "parking", id: "x" }), null);
  assert.deepEqual([...parkingSpots(driveItems).keys()], ["y"]);
});

test("segment request covers every segment, once each, with its mode", () => {
  const body = buildSegmentRequest(plan, resolve);
  const modes = plan.flatMap((p) => p.segments.map((s) => s.mode));
  assert.equal(body.length, modes.length);
  assert.deepEqual(
    body.map((b) => b.mode),
    modes,
  );
  assert.equal(buildSegmentRequest([plan[0], plan[0]], resolve).length, plan[0].segments.length);
});

test("chunks respect the 25 leg cap", () => {
  const chunks = chunkRequestLegs(Array.from({ length: 60 }, (_, i) => i));
  assert.deepEqual(
    chunks.map((c) => c.length),
    [25, 25, 10],
  );
  assert.deepEqual(chunkRequestLegs([]), []);
});

test("planned merge routes segments and falls back per segment without a driving time", () => {
  const body = buildSegmentRequest(plan, resolve);
  const routed = {};
  for (const b of body) if (b.mode === "walk") routed[legCacheKey(b)] = { meters: 100, seconds: 90, geometry: "g" };
  const merged = mergePlannedLegs(driveLegs, plan, resolve, routed);
  const first = merged[0];
  assert.equal(first.kind, "planned");
  assert.equal(first.mode, "drive");
  assert.equal(first.defaultMode, "drive");
  const drive = first.segments.find((s) => s.mode === "drive");
  assert.equal(drive.state, "estimate");
  assert.equal(drive.seconds, undefined);
  assert.ok(drive.meters > 1000);
  const fromParking = first.segments.find((s) => s.role === "from-parking");
  assert.equal(fromParking.state, "routed");
  assert.equal(fromParking.meters, 100);
});

test("a changed parking spot changes the cache keys", () => {
  const moved = driveItems.map((i) =>
    i.id === "y" ? { ...i, location: { ...i.location, parking: { ...park, lat: 35.0502 } } } : i,
  );
  const a = buildSegmentRequest(plan, resolve).map(legCacheKey);
  const b = buildSegmentRequest(plan, endpointResolver(moved)).map(legCacheKey);
  assert.notDeepEqual(a, b);
});

test("drive totals split driving and walking and flag estimates", () => {
  const body = buildSegmentRequest(plan, resolve);
  const routed = {};
  for (const b of body) routed[legCacheKey(b)] = { meters: 1000, seconds: 600, geometry: "g" };
  const all = drivePlanTotals(mergePlannedLegs(driveLegs, plan, resolve, routed));
  assert.equal(all.drive.seconds, 600);
  assert.equal(all.drive.approximate, false);
  assert.ok(all.walk.counted >= 1);
  assert.equal(all.walk.approximate, false);
  const none = drivePlanTotals(mergePlannedLegs(driveLegs, plan, resolve, {}));
  assert.equal(none.drive.counted, 0);
  assert.equal(none.drive.approximate, true);
  assert.equal(none.walk.approximate, true);
});
