import assert from "node:assert/strict";
import test from "node:test";
import { NEARBY_CATEGORIES, NEARBY_RADIUS, mapsSearchUrl, nearbyPlaces } from "../lib/nearby-places.ts";
import { estimateWalk, haversineMeters } from "../lib/travel-legs.ts";

const anchor = { lat: 35, lng: 135 };
// About 111 m per 0.001 degree of latitude.
const at = (metres) => ({ lat: anchor.lat + metres / 111195, lng: anchor.lng });

const feature = (name, osmClass, metres, extra = {}) => {
  const { lat, lng } = at(metres);
  return {
    properties: { name, class: osmClass, subclass: osmClass, ...extra },
    geometry: { type: "Point", coordinates: [lng, lat] },
  };
};

const run = (features, overrides = {}) =>
  nearbyPlaces({ features, anchor, radiusMeters: 500, category: "food", items: [], ...overrides });

test("category list and radius constants", () => {
  assert.deepEqual(
    NEARBY_CATEGORIES.map((entry) => [entry.id, entry.label]),
    [
      ["food", "Food"],
      ["sights", "Sights"],
      ["transit", "Transit"],
    ],
  );
  assert.deepEqual({ ...NEARBY_RADIUS }, { min: 200, max: 1000, step: 100, default: 500 });
});

test("keeps only the category's classes and maps item types", () => {
  const features = [
    feature("Ramen", "restaurant", 100),
    feature("Museum", "museum", 100),
    feature("Green", "park", 100),
    feature("Station", "railway", 100, { subclass: "station" }),
    feature("Shop", "clothing_store", 100),
  ];
  assert.deepEqual(
    run(features).map((p) => [p.name, p.type]),
    [["Ramen", "food"]],
  );
  assert.deepEqual(
    run(features, { category: "sights" }).map((p) => [p.name, p.type]),
    [
      ["Museum", "sightseeing"],
      ["Green", "activity"],
    ],
  );
  const [station] = run(features, { category: "transit" });
  assert.equal(station.type, "commute");
  assert.equal(station.subclass, "station");
  assert.equal(run(features)[0].subclass, "restaurant");
});

test("radius cut-off and walking estimate", () => {
  const features = [feature("Near", "cafe", 400), feature("Far", "cafe", 600)];
  const places = run(features);
  assert.deepEqual(
    places.map((p) => p.name),
    ["Near"],
  );
  assert.deepEqual(
    run(features, { radiusMeters: 700 }).map((p) => p.name),
    ["Near", "Far"],
  );
  const meters = haversineMeters(anchor, places[0]);
  assert.equal(places[0].meters, meters);
  assert.equal(places[0].walkSeconds, estimateWalk(meters).seconds);
});

test("ignores unnamed and non-point features", () => {
  const point = feature("Ok", "cafe", 50);
  const features = [
    point,
    feature("", "cafe", 50),
    feature("   ", "cafe", 50),
    { properties: { class: "cafe" }, geometry: point.geometry },
    { properties: null, geometry: point.geometry },
    { properties: { name: "Poly", class: "cafe" }, geometry: { type: "Polygon", coordinates: [[[135, 35]]] } },
    { properties: { name: "Bad", class: "cafe" }, geometry: { type: "Point", coordinates: ["x", 1] } },
  ];
  assert.deepEqual(
    run(features).map((p) => p.name),
    ["Ok"],
  );
});

test("removes repeats across tile edges but keeps distinct places", () => {
  const features = [
    feature("Ramen", "restaurant", 100),
    feature("Ramen", "restaurant", 110),
    feature("Ramen", "restaurant", 300),
    feature("Ramen", "cafe", 105),
  ];
  assert.equal(run(features).length, 3);
});

test("ids are stable across calls", () => {
  const features = [feature("Ramen", "restaurant", 100)];
  assert.equal(run(features)[0].id, run(features)[0].id);
  assert.notEqual(run(features)[0].id, run([feature("Ramen", "restaurant", 200)])[0].id);
});

test("drops places already in the trip by name or proximity", () => {
  const features = [
    feature("Ichiran Ramen", "restaurant", 100),
    feature("Cafe Kyoto", "cafe", 200),
    feature("Bakery Near Hotel", "bakery", 300),
    feature("Other", "bar", 400),
  ];
  const items = [
    { id: "a", title: "  ICHIRAN   ramen ", location: null },
    { id: "b", title: "Lunch", location: { name: "Ｃafe Kyoto" } },
    { id: "c", title: "Hotel", location: at(310) },
    { id: "d", title: "No coords", location: { lat: null, lng: null } },
  ];
  assert.deepEqual(
    run(features, { items }).map((p) => p.name),
    ["Other"],
  );
});

test("sorts nearest first, ignoring the tiles' rank", () => {
  const features = [
    feature("Unranked near", "cafe", 50),
    feature("Rank 5 far", "cafe", 400, { rank: 5 }),
    feature("Rank 5 near", "cafe", 100, { rank: 5 }),
    feature("Rank 1", "cafe", 450, { rank: 1 }),
  ];
  assert.deepEqual(
    run(features).map((p) => p.name),
    ["Unranked near", "Rank 5 near", "Rank 5 far", "Rank 1"],
  );
});

test("mapsSearchUrl rounds to six decimals", () => {
  assert.equal(
    mapsSearchUrl(35.01234567, 135.7),
    "https://www.google.com/maps/search/?api=1&query=35.012346,135.700000",
  );
});

test("decodes the OSM element from the tile feature id", () => {
  const places = run([
    { ...feature("Node", "cafe", 100), id: 1234561 },
    { ...feature("Way", "cafe", 200), id: 99992 },
    { ...feature("Bad", "cafe", 300), id: "x" },
    feature("None", "cafe", 400),
  ]);
  assert.deepEqual(
    places.map((p) => p.osm),
    [{ osmType: "node", osmId: 123456 }, { osmType: "way", osmId: 9999 }, null, null],
  );
});

test("a tile-edge repeat fills in a missing osm id but keeps the first one", () => {
  const first = run([feature("Cafe", "cafe", 100), { ...feature("Cafe", "cafe", 101), id: 51 }]);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].osm, { osmType: "node", osmId: 5 });
  const kept = run([
    { ...feature("Cafe", "cafe", 100), id: 11 },
    { ...feature("Cafe", "cafe", 101), id: 52 },
  ]);
  assert.deepEqual(kept[0].osm, { osmType: "node", osmId: 1 });
});
