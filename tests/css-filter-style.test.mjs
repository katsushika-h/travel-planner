import assert from "node:assert/strict";
import test from "node:test";
import { filterColor, filterStyle, parseColor, parseFilter } from "../lib/css-filter-style.ts";

const darkFilter = "invert(1) hue-rotate(180deg) brightness(0.88) contrast(0.92) saturate(0.75)";

test("parses colours and CSS filter lists", () => {
  assert.deepEqual(parseColor("#fff"), [1, 1, 1, 1]);
  assert.deepEqual(parseColor("rgba(255, 0, 0, 0.5)"), [1, 0, 0, 0.5]);
  assert.deepEqual(
    parseColor("hsl(120,100%,50%)").map((c) => Math.round(c * 255)),
    [0, 255, 0, 255],
  );
  assert.equal(parseColor("zoom"), null);
  assert.deepEqual(parseFilter(darkFilter), [
    { name: "invert", amount: 1 },
    { name: "hue-rotate", amount: 180 },
    { name: "brightness", amount: 0.88 },
    { name: "contrast", amount: 0.92 },
    { name: "saturate", amount: 0.75 },
  ]);
  assert.deepEqual(parseFilter("none"), []);
  assert.deepEqual(parseFilter("invert(100%) hue-rotate(0.5turn)"), [
    { name: "invert", amount: 1 },
    { name: "hue-rotate", amount: 180 },
  ]);
});

test("single operations follow the Filter Effects formulas", () => {
  assert.equal(filterColor("#ffffff", parseFilter("invert(1)")), "rgba(0, 0, 0, 1)");
  assert.equal(filterColor("#808080", parseFilter("brightness(0.5)")), "rgba(64, 64, 64, 1)");
  assert.equal(filterColor("#ff0000", parseFilter("saturate(0)")), "rgba(54, 54, 54, 1)");
  assert.equal(filterColor("hsla(0,0%,100%,0.4)", parseFilter("invert(1)")), "rgba(0, 0, 0, 0.4)");
});

test("the dark token turns OSM Carto colours into Plan's dark palette", () => {
  const ops = parseFilter(darkFilter);
  const lightness = (color) => {
    const [r, g, b] = parseColor(color);
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  };
  // Land goes near black, water to a dark teal, motorways stay pink (red channel highest).
  assert.ok(lightness(filterColor("#f2efe9", ops)) < 0.12);
  const [wr, wg, wb] = parseColor(filterColor("#aad3df", ops));
  assert.ok(wb > wr && wg > wr && lightness(filterColor("#aad3df", ops)) < 0.3);
  const [mr, mg, mb] = parseColor(filterColor("#e892a2", ops));
  assert.ok(mr > mg && mr > mb);
});

test("filters every paint colour, inverts rasters, fades patterns, and leaves the input alone", () => {
  const style = {
    layers: [
      { type: "background", paint: { "background-color": "#f2efe9" } },
      {
        type: "line",
        paint: { "line-color": ["match", ["get", "class"], "trunk", "#f9b29c", "#fcd6a4"], "line-width": 2 },
      },
      { type: "fill-extrusion", paint: { "fill-extrusion-color": "#d9d0c9", "fill-extrusion-height": 10 } },
      { type: "fill", paint: { "fill-pattern": "hatching", "fill-opacity": 1 } },
      { type: "raster", paint: { "raster-opacity": 0.5 } },
    ],
  };
  const before = JSON.stringify(style);
  const dark = filterStyle(style, darkFilter);
  assert.equal(JSON.stringify(style), before);
  assert.match(dark.layers[0].paint["background-color"], /^rgba\(/);
  assert.deepEqual(dark.layers[1].paint["line-color"].slice(0, 3), ["match", ["get", "class"], "trunk"]);
  assert.equal(dark.layers[1].paint["line-width"], 2);
  assert.equal(dark.layers[2].paint["fill-extrusion-height"], 10);
  assert.equal(dark.layers[3].paint["fill-opacity"], 0.15);
  assert.equal(dark.layers[4].paint["raster-brightness-min"], 0.88);
  assert.equal(dark.layers[4].paint["raster-brightness-max"], 0);
  assert.equal(dark.layers[4].paint["raster-hue-rotate"], 180);
  assert.equal(filterStyle(style, "none"), style);
});
