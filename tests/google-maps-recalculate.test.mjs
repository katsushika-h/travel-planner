import assert from "node:assert/strict";
import test from "node:test";
import { recalculateTripMapPins } from "../lib/google-maps-recalculate.ts";

test("recalculating a trip saves moved pins, clears pins whose link has no coordinates, and keeps pins it cannot check", async () => {
  const originalFetch = globalThis.fetch;
  const items = [
    { id: "moved", location: { name: "A", googleMapsUrl: "https://maps.example/moved", lat: 1, lng: 1 } },
    { id: "same", location: { googleMapsUrl: "https://maps.example/same", lat: 2, lng: 3 } },
    { id: "none", location: { googleMapsUrl: "https://maps.example/none", lat: 4, lng: 5 } },
    { id: "failed", location: { googleMapsUrl: "https://maps.example/failed", lat: 8, lng: 9 } },
    { id: "never", location: { googleMapsUrl: "https://maps.example/none" } },
    { id: "no-link", location: { name: "No link", lat: 6, lng: 7 } },
  ];
  const patches = [];
  const progress = [];
  globalThis.fetch = async (url, init) => {
    if (url === "/api/travel-objects?tripId=trip-1") return Response.json(items);
    const body = JSON.parse(init.body);
    if (url === "/api/maps/resolve") {
      if (body.url.endsWith("/failed")) throw new TypeError("resolver unavailable");
      const point = { moved: [33.5864, 130.3955], same: [2, 3], none: [null, null] }[body.url.split("/").pop()];
      return Response.json({ lat: point[0], lng: point[1] });
    }
    patches.push([url, body]);
    return Response.json({ ...items.find((item) => url.endsWith(item.id)), ...body });
  };

  try {
    const result = await recalculateTripMapPins("trip-1", (complete, total) => progress.push([complete, total]));
    assert.deepEqual(
      [result.total, result.updated.length, result.unchanged, result.unresolved, result.cleared, result.failed],
      [5, 2, 1, 2, 1, 1],
    );
    assert.deepEqual(patches, [
      [
        "/api/travel-objects/moved",
        { location: { name: "A", googleMapsUrl: "https://maps.example/moved", lat: 33.5864, lng: 130.3955 } },
      ],
      ["/api/travel-objects/none", { location: { googleMapsUrl: "https://maps.example/none" } }],
    ]);
    assert.deepEqual(result.updated.map((item) => item.id).sort(), ["moved", "none"]);
    assert.deepEqual(progress.at(0), [0, 5]);
    assert.deepEqual(progress.at(-1), [5, 5]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
