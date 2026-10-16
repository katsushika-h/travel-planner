import assert from "node:assert/strict";
import test from "node:test";
import { decodePolyline } from "../lib/polyline.ts";

test("decodes the canonical Google example", () => {
  assert.deepEqual(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453],
  ]);
});

test("empty string decodes to no points", () => {
  assert.deepEqual(decodePolyline(""), []);
});

test("decodes a single point", () => {
  assert.deepEqual(decodePolyline("_p~iF~ps|U"), [[38.5, -120.2]]);
});

test("ignores a truncated trailing point", () => {
  assert.deepEqual(decodePolyline("_p~iF~ps|U_ulL"), [[38.5, -120.2]]);
});

test("supports precision 6", () => {
  assert.deepEqual(decodePolyline("_p~iF~ps|U", 6), [[3.85, -12.02]]);
});
