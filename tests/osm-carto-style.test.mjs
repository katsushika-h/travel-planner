import assert from "node:assert/strict";
import test from "node:test";
import { applyCartoPalette, cartoRoadColor, cartoRoads } from "../lib/osm-carto-style.ts";

test("single-class road layers take the Carto fill or casing colour", () => {
  assert.equal(cartoRoadColor("road_motorway"), cartoRoads.motorway[0]);
  assert.equal(cartoRoadColor("bridge_motorway_casing"), cartoRoads.motorway[1]);
  assert.equal(cartoRoadColor("tunnel_minor"), cartoRoads.minor[0]);
  assert.equal(cartoRoadColor("road_service_track_casing"), cartoRoads.minor[1]);
});

test("layers that draw several classes colour each feature by its class", () => {
  assert.deepEqual(cartoRoadColor("road_trunk_primary"), [
    "match",
    ["get", "class"],
    "trunk",
    cartoRoads.trunk[0],
    "primary",
    cartoRoads.primary[0],
    cartoRoads.primary[0],
  ]);
  const casing = cartoRoadColor("bridge_secondary_tertiary_casing");
  assert.equal(casing[3], cartoRoads.secondary[1]);
  assert.equal(casing[5], cartoRoads.tertiary[1]);
});

test("rail, paths and other layers keep Liberty's colours", () => {
  for (const id of [
    "road_major_rail",
    "tunnel_transit_rail_hatching",
    "road_path_pedestrian",
    "boundary_2",
    "road_oneway",
  ])
    assert.equal(cartoRoadColor(id), null, id);
});

test("applies Carto colours to roads, water, greens and buildings without touching the input", () => {
  const style = {
    layers: [
      { id: "water", type: "fill", paint: { "fill-color": "rgb(158,189,255)", "fill-opacity": 1 } },
      { id: "landcover_wood", type: "fill", paint: { "fill-color": "hsla(98,61%,72%,0.7)" } },
      {
        id: "road_motorway",
        type: "line",
        paint: { "line-color": ["interpolate", ["linear"], ["zoom"], 5, "#f00", 6, "#fc8"], "line-width": 3 },
      },
      { id: "road_major_rail", type: "line", paint: { "line-color": "#bbb" } },
      { id: "building-3d", type: "fill-extrusion", paint: { "fill-extrusion-color": "hsl(35,8%,85%)" } },
      { id: "place_city", type: "symbol", paint: { "text-color": "#333" } },
    ],
  };
  const before = JSON.stringify(style);
  const carto = applyCartoPalette(style);
  assert.equal(JSON.stringify(style), before);
  assert.deepEqual(carto.layers[0].paint, { "fill-color": "#aad3df", "fill-opacity": 1 });
  assert.equal(carto.layers[1].paint["fill-color"], "#add19e");
  assert.deepEqual(carto.layers[2].paint, { "line-color": "#e892a2", "line-width": 3 });
  assert.equal(carto.layers[3].paint["line-color"], "#bbb");
  assert.equal(carto.layers[4].paint["fill-extrusion-color"], "#d9d0c9");
  assert.deepEqual(carto.layers[5].paint, { "text-color": "#333" });
});
