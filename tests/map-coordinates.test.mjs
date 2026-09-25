import assert from "node:assert/strict";
import test from "node:test";
import { hasMapCoordinates } from "../lib/map-coordinates.ts";

test("only geographic coordinates can count toward map markers", () => {
  assert.equal(hasMapCoordinates({ lat: 90, lng: -180 }), true);
  assert.equal(hasMapCoordinates({ lat: -90, lng: 180 }), true);
  assert.equal(hasMapCoordinates({ lat: 90.01, lng: 103 }), false);
  assert.equal(hasMapCoordinates({ lat: 1, lng: -180.01 }), false);
  assert.equal(hasMapCoordinates({ lat: Number.NaN, lng: 103 }), false);
  assert.equal(hasMapCoordinates({ googleMapsUrl: "https://maps.example/place" }), false);
});
