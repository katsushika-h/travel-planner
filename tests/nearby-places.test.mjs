import assert from "node:assert/strict";
import test from "node:test";
import { NEARBY_CATEGORIES, NEARBY_RADIUS, mapsSearchUrl, nearbyPlaces } from "../lib/nearby-places.ts";
import { nearbyTagFilters, overpassToFeatures } from "../lib/nearby-overpass.ts";
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

test("the same OSM element is a repeat at any distance, other elements are not", () => {
  const places = run(
    [
      { ...feature("Temple", "place_of_worship", 100), id: 72 },
      { ...feature("Temple (centre)", "place_of_worship", 300), id: 72 },
      { ...feature("Temple", "place_of_worship", 300), id: 71 },
      { ...feature("Temple", "place_of_worship", 450), id: 73 },
    ],
    { category: "sights" },
  );
  assert.deepEqual(
    places.map((p) => [p.name, p.osm.osmType]),
    [
      ["Temple", "way"],
      ["Temple", "node"],
      ["Temple", "relation"],
    ],
  );
});

const element = (type, id, tags, extra = {}) => ({ type, id, tags, ...extra });

test("overpassToFeatures maps nodes and way centres to tile-shaped features", () => {
  const features = overpassToFeatures(
    [
      element("node", 5, { name: "Cafe A", amenity: "cafe" }, { lat: 35.1, lon: 135.2 }),
      element("way", 6, { name: "Park B", leisure: "park" }, { center: { lat: 35.3, lon: 135.4 } }),
      element("relation", 7, { name: "Sta C", railway: "station" }, { center: { lat: 35.5, lon: 135.6 } }),
    ],
    "food",
  );
  // Only the cafe belongs to the food category.
  assert.deepEqual(features, [
    {
      id: 51,
      properties: { name: "Cafe A", class: "cafe", subclass: "cafe" },
      geometry: { type: "Point", coordinates: [135.2, 35.1] },
    },
  ]);
  assert.deepEqual(
    overpassToFeatures(
      [element("way", 6, { name: "Park B", leisure: "park" }, { center: { lat: 35.3, lon: 135.4 } })],
      "sights",
    ),
    [
      {
        id: 62,
        properties: { name: "Park B", class: "park", subclass: "park" },
        geometry: { type: "Point", coordinates: [135.4, 35.3] },
      },
    ],
  );
  assert.equal(
    overpassToFeatures(
      [element("relation", 7, { name: "Sta", railway: "station" }, { center: { lat: 1, lon: 2 } })],
      "transit",
    )[0].id,
    73,
  );
});

test("overpassToFeatures drops unnamed, unmapped and coordinate-less elements", () => {
  const features = overpassToFeatures(
    [
      element("node", 1, { amenity: "cafe" }, { lat: 1, lon: 2 }),
      element("node", 2, { name: "  ", amenity: "cafe" }, { lat: 1, lon: 2 }),
      element("node", 3, { name: "Shop", shop: "convenience" }, { lat: 1, lon: 2 }),
      element("way", 4, { name: "No centre", amenity: "cafe" }),
      element("node", 5, { name: "Bad id", amenity: "cafe" }, { lat: 1, lon: 2, id: -1 }),
      element("node", 6, { name: "Ok", amenity: "cafe" }, { lat: 1, lon: 2 }),
      null,
      "x",
    ],
    "food",
  );
  assert.deepEqual(
    features.map((f) => f.properties.name),
    ["Ok"],
  );
});

test("overpassToFeatures maps every category class and only the classes NEARBY_CATEGORIES lists", () => {
  const cases = {
    food: [
      [{ amenity: "restaurant" }, "restaurant"],
      [{ amenity: "cafe" }, "cafe"],
      [{ amenity: "fast_food" }, "fast_food"],
      [{ amenity: "bar" }, "bar"],
      [{ amenity: "pub" }, "beer"],
      [{ amenity: "biergarten" }, "beer"],
      [{ amenity: "ice_cream" }, "ice_cream"],
      [{ shop: "ice_cream" }, "ice_cream"],
      [{ shop: "bakery" }, "bakery"],
    ],
    sights: [
      [{ tourism: "attraction" }, "attraction"],
      [{ tourism: "museum" }, "museum"],
      [{ tourism: "gallery" }, "art_gallery"],
      [{ amenity: "place_of_worship" }, "place_of_worship"],
      [{ amenity: "theatre" }, "theatre"],
      [{ leisure: "park" }, "park"],
      [{ historic: "castle" }, "castle"],
      [{ historic: "monument" }, "monument"],
    ],
    transit: [
      [{ railway: "station" }, "railway"],
      [{ railway: "halt" }, "railway"],
      [{ railway: "tram_stop" }, "railway"],
      [{ highway: "bus_stop" }, "bus"],
      [{ amenity: "bus_station" }, "bus"],
      [{ amenity: "ferry_terminal" }, "ferry_terminal"],
      [{ aerialway: "station" }, "aerialway"],
      [{ aeroway: "aerodrome" }, "airport"],
    ],
  };
  for (const category of NEARBY_CATEGORIES) {
    const listed = new Set(category.classes);
    const seen = new Set();
    for (const [tags, osmClass] of cases[category.id]) {
      const [feature] = overpassToFeatures(
        [element("node", 1, { name: "X", ...tags }, { lat: 1, lon: 2 })],
        category.id,
      );
      assert.equal(feature.properties.class, osmClass);
      assert.equal(feature.properties.subclass, Object.values(tags)[0]);
      assert.ok(listed.has(osmClass));
      seen.add(osmClass);
    }
    assert.deepEqual([...seen].sort(), [...listed].sort());
  }
});

test("nearbyTagFilters lists one filter per mapped tag", () => {
  assert.ok(nearbyTagFilters("sights").includes("[tourism=gallery]"));
  assert.equal(nearbyTagFilters("transit").length, 8);
});
