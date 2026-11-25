import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function load(path, requireMap = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(source, {
    module: mod,
    exports: mod.exports,
    require: (id) => requireMap[id] ?? require(id),
    Math,
    Number,
    Object,
  });
  return mod.exports;
}

const legs = load("../lib/travel-legs.ts", {});
const { inferTypeFromClass, inferTypeFromPois, poiCandidate } = load("../lib/place-type.ts", {
  "./travel-legs.ts": legs,
});
const origin = { lat: 35.66, lng: 139.74 };
const poi = (properties, lat = 35.66, lng = 139.74) => poiCandidate(properties, { lat, lng });

test("maps POI classes to item types", () => {
  assert.equal(inferTypeFromClass("lodging"), "hotel");
  assert.equal(inferTypeFromClass("cafe"), "food");
  assert.equal(inferTypeFromClass("airport"), "flight");
  assert.equal(inferTypeFromClass("railway"), "commute");
  assert.equal(inferTypeFromClass("museum"), "sightseeing");
  assert.equal(inferTypeFromClass("park"), "activity");
  assert.equal(inferTypeFromClass("clothing_store"), null);
  assert.equal(inferTypeFromClass(undefined), null);
});

test("poiCandidate keeps typed POIs and every name property", () => {
  assert.equal(poi({ class: "toilets", name: "WC" }), null);
  assert.deepEqual(
    poi({ class: "railway", name: "東京", "name:en": "Tokyo", name_int: "Tokyo", population: 1 }).names,
    ["東京", "Tokyo", "Tokyo"],
  );
});

test("a matching name wins within 100 m and only an unnamed pin falls back to the nearest POI within 25 m", () => {
  const pois = [
    poi({ class: "lodging", name: "Hotel Okura" }, 35.6604, 139.74),
    poi({ class: "restaurant", name: "Okura Ramen" }, 35.66001, 139.74),
  ].filter(Boolean);
  assert.equal(inferTypeFromPois(pois, origin, "Hotel Okura Tokyo"), "hotel");
  assert.equal(inferTypeFromPois(pois, origin, "Unknown place"), null);
  assert.equal(inferTypeFromPois(pois, origin, null), "food");
});

test("matches names in another script through any name property", () => {
  const pois = [poi({ class: "railway", name: "東京", "name:en": "Tokyo", name_int: "Tokyo" }, 35.6603, 139.74)];
  assert.equal(inferTypeFromPois(pois, origin, "Tokyo Station"), "commute");
});

test("ignores POIs that are too far or unmatched beyond the pin", () => {
  assert.equal(inferTypeFromPois([poi({ class: "cafe", name: "Far" }, 35.662, 139.74)], origin, "Far"), null);
  assert.equal(inferTypeFromPois([poi({ class: "cafe", name: "Near" }, 35.6603, 139.74)], origin, "Other"), null);
});

test("matches names that share most of their words", () => {
  const pois = [poi({ class: "lodging", name: "ANA Crowne Plaza Hotel Fukuoka" }, 35.6601, 139.74)];
  assert.equal(inferTypeFromPois(pois, origin, "ANA Crowne Plaza Fukuoka by IHG"), "hotel");
  assert.equal(inferTypeFromPois(pois, origin, "Crowne Cafe"), null);
});
