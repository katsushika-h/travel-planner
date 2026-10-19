import assert from "node:assert/strict";
import test from "node:test";
import { isGoogleMapsUrl, placeNameFromMapsUrl } from "../lib/maps-link.ts";

test("recognises Google Maps links only", () => {
  for (const url of [
    "https://www.google.com/maps/place/Tokyo+Tower/@35.6,139.7,17z",
    "https://google.com/maps?q=35.6,139.7",
    "https://maps.google.com/?q=Tokyo",
    "https://maps.google.co.jp/?q=Tokyo",
    "https://maps.app.goo.gl/AbC123",
    "https://goo.gl/maps/AbC123",
    "  https://maps.app.goo.gl/AbC123\n",
  ])
    assert.equal(isGoogleMapsUrl(url), true, url);
  for (const text of [
    "",
    "hello world",
    "https://www.google.com/search?q=maps",
    "https://example.com/maps/place/X",
    "https://evil.com/?u=https://maps.app.goo.gl/x",
    "https://maps.app.goo.gl/x and more",
    "javascript:alert(1)",
  ])
    assert.equal(isGoogleMapsUrl(text), false, text);
});

test("extracts a decoded place name", () => {
  assert.equal(placeNameFromMapsUrl("https://www.google.com/maps/place/Tokyo+Tower/@35,139,17z"), "Tokyo Tower");
  assert.equal(placeNameFromMapsUrl("https://www.google.com/maps/place/Caf%C3%A9+de+Flore/data=x"), "Café de Flore");
  assert.equal(placeNameFromMapsUrl("https://www.google.com/maps/place/35.6,139.7"), null);
  assert.equal(placeNameFromMapsUrl("https://maps.app.goo.gl/AbC"), null);
  assert.equal(placeNameFromMapsUrl("https://www.google.com/maps/place/100%+Fun"), "100% Fun");
});
