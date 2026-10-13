import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio, defaultTypeColor, typeTextColor } from "../lib/type-color.ts";

const defaults = ["unclassified", "flight", "hotel", "food", "commute", "activity", "sightseeing", "custom-type"].map(
  defaultTypeColor,
);
const userColors = ["#ffff00", "#00ffff", "#000000", "#ffffff", "#14b8a6", "#123", "#ABCDEF"];

test("type heading colours reach 4.5:1 against both theme backgrounds", () => {
  for (const color of [...defaults, ...userColors]) {
    assert.ok(contrastRatio(typeTextColor(color, "light"), "#FFFFFF") >= 4.5, `${color} on light`);
    assert.ok(contrastRatio(typeTextColor(color, "dark"), "#0E0E0E") >= 4.5, `${color} on dark`);
  }
});

test("light theme darkens and dark theme lightens the type colour", () => {
  for (const color of defaults) {
    const base = contrastRatio(color, "#000000");
    assert.ok(contrastRatio(typeTextColor(color, "light"), "#000000") < base, `${color} darker`);
    assert.ok(contrastRatio(typeTextColor(color, "dark"), "#000000") > base, `${color} lighter`);
  }
});

test("type heading colours keep their hue family and are deterministic hex values", () => {
  const food = typeTextColor("#f97316", "light");
  assert.match(food, /^#[0-9A-F]{6}$/);
  assert.equal(food, typeTextColor("#F97316", "light"));
  const [red, green, blue] = [1, 3, 5].map((offset) => parseInt(food.slice(offset, offset + 2), 16));
  assert.ok(red > green && green > blue, "orange stays orange");
  assert.equal(typeTextColor("#123", "dark"), typeTextColor("#112233", "dark"));
});

test("unparseable colours are returned unchanged", () => {
  assert.equal(typeTextColor("rebeccapurple", "light"), "rebeccapurple");
  assert.equal(contrastRatio("nope", "#FFFFFF"), 1);
});
