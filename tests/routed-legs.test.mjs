import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRouteRequest,
  coordinatesById,
  displayTotals,
  legCacheKey,
  MAX_ROUTE_LEGS,
  mergeRoutedLegs,
  selectRoutableLegs,
} from "../lib/routed-legs.ts";
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
