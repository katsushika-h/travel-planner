import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const KEY = "test-ors-key-DO-NOT-LEAK";
const Q = { lat: 33.2658, lng: 131.3606 };

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

/** Load the route with the real client and travel-legs modules and a mocked fetch. */
function load({ fetchImpl, key = KEY }) {
  const calls = [];
  const mockFetch = async (url, init) => {
    calls.push({ url, init });
    return fetchImpl(url, init, calls.length);
  };
  const env = { ORS_API_KEY: key };
  const base = { URL, URLSearchParams, Response, Request, AbortSignal, JSON, Math, Date, Number, Array, Error };
  const run = (path, requireMap) => {
    const mod = { exports: {} };
    vm.runInNewContext(compile(path), {
      ...base,
      Promise,
      Set,
      Map,
      RegExp,
      module: mod,
      exports: mod.exports,
      process: { env },
      fetch: mockFetch,
      require: (name) => requireMap[name] ?? require(name),
    });
    return mod.exports;
  };
  const legs = run("../lib/travel-legs.ts", {});
  const client = run("../lib/parking-client.ts", { "@/lib/travel-legs": legs });
  const route = run("../app/api/parking/route.ts", { "@/lib/parking-client": client });
  return { GET: route.GET, calls };
}

const overpassOk = (elements) => new Response(JSON.stringify({ elements }), { status: 200 });
const node = (dLat, tags = {}) => ({
  type: "node",
  lat: Q.lat + dLat,
  lon: Q.lng,
  tags: { amenity: "parking", ...tags },
});
const orsFeature = (dLat, tags) => ({
  geometry: { coordinates: [Q.lng, Q.lat + dLat] },
  properties: { osm_id: 1, osm_tags: tags },
});
const orsOk = (features) => new Response(JSON.stringify({ features }), { status: 200 });
const orsEmpty = () =>
  new Response('{"type":"FeatureCollection","bbox":[NaN,NaN,NaN,NaN],"features":[]}', { status: 200 });
const down = () => new Response("busy", { status: 504 });
const isOverpass = (url) => url.startsWith("https://overpass-api.de/");

async function get(ctx, query = `lat=${Q.lat}&lng=${Q.lng}`) {
  const response = await ctx.GET(new Request(`http://localhost/api/parking?${query}`));
  const text = await response.text();
  assert.ok(!text.includes(KEY), "response must never contain the key");
  return { status: response.status, body: JSON.parse(text) };
}

test("Overpass success: nodes and way centers, nearest first, null names, private excluded", async () => {
  const ctx = load({
    fetchImpl: () =>
      overpassOk([
        node(0.006, { name: "Far" }),
        {
          type: "way",
          center: { lat: Q.lat + 0.001, lon: Q.lng },
          tags: { amenity: "parking", fee: "yes", access: "yes" },
        },
        node(0.002, { name: "Private", access: "private" }),
        node(0.003, { access: "no" }),
        node(0.004, { access: "customers" }),
        node(0.005, { name: "Near", access: "permissive" }),
        { type: "node", tags: { amenity: "parking" } },
      ]),
  });
  const { status, body } = await get(ctx);
  assert.equal(status, 200);
  assert.deepEqual(
    body.parking.map((p) => [p.name, p.source, p.fee, p.access]),
    [
      [null, "osm", "yes", "yes"],
      ["Near", "osm", null, "permissive"],
      ["Far", "osm", null, null],
    ],
  );
  assert.ok(body.parking[0].meters < body.parking[1].meters);
  assert.equal(typeof body.parking[0].lat, "number");
  const [{ url, init }] = ctx.calls;
  assert.equal(url, "https://overpass-api.de/api/interpreter");
  assert.match(init.headers["User-Agent"], /travel-planner/);
  assert.match(new URLSearchParams(init.body).get("data"), /around:1000,33\.2658,131\.3606\)\[amenity=parking\]/);
});

test("caps results at 5, nearest first", async () => {
  const ctx = load({ fetchImpl: () => overpassOk(Array.from({ length: 9 }, (_, i) => node(0.0005 * (9 - i)))) });
  const { body } = await get(ctx);
  assert.equal(body.parking.length, 5);
  const meters = body.parking.map((p) => p.meters);
  assert.deepEqual(
    meters,
    [...meters].sort((a, b) => a - b),
  );
});

test("Overpass failure falls back to ORS POIs with the key and lng,lat order", async () => {
  const ctx = load({
    fetchImpl: (url) =>
      isOverpass(url)
        ? down()
        : orsOk([
            orsFeature(0.004, { name: "B", fee: "no" }),
            orsFeature(0.001, {}),
            orsFeature(0.002, { access: "private" }),
          ]),
  });
  const { status, body } = await get(ctx);
  assert.equal(status, 200);
  assert.deepEqual(
    body.parking.map((p) => [p.name, p.source, p.fee]),
    [
      [null, "ors", null],
      ["B", "ors", "no"],
    ],
  );
  const { url, init } = ctx.calls[1];
  assert.equal(url, "https://api.openrouteservice.org/pois");
  assert.equal(init.headers.Authorization, KEY);
  const sent = JSON.parse(init.body);
  assert.deepEqual(sent.geometry.geojson.coordinates, [Q.lng, Q.lat]);
  assert.deepEqual(sent.filters.category_ids, [601]);
});

test("Overpass network error and malformed bodies fall back", async () => {
  for (const overpass of [
    () => Promise.reject(new Error("boom")),
    () => new Response("not json", { status: 200 }),
    () => new Response(JSON.stringify({ remark: "runtime error" }), { status: 200 }),
  ]) {
    const ctx = load({
      fetchImpl: (url) => (isOverpass(url) ? overpass() : orsOk([orsFeature(0.001, { name: "X" })])),
    });
    const { status, body } = await get(ctx);
    assert.equal(status, 200);
    assert.equal(body.parking[0].source, "ors");
  }
});

test("ORS NaN bbox body is an empty successful result", async () => {
  const ctx = load({ fetchImpl: (url) => (isOverpass(url) ? down() : orsEmpty()) });
  const { status, body } = await get(ctx);
  assert.equal(status, 200);
  assert.deepEqual(body, { parking: [] });
});

test("both providers failing returns 502", async () => {
  const ctx = load({ fetchImpl: () => down() });
  const { status, body } = await get(ctx);
  assert.equal(status, 502);
  assert.deepEqual(body, { error: "Parking lookup failed." });
  assert.equal(ctx.calls.length, 2);
});

test("missing key with Overpass down returns 502 and makes no ORS call", async () => {
  const ctx = load({ key: "", fetchImpl: () => down() });
  const { status, body } = await get(ctx);
  assert.equal(status, 502);
  assert.deepEqual(body, { error: "Parking lookup failed." });
  assert.equal(ctx.calls.length, 1);
  assert.ok(isOverpass(ctx.calls[0].url));
});

test("a cache hit makes no second fetch, nearby points share a key, failures are not cached", async () => {
  let fail = true;
  const ctx = load({ fetchImpl: () => (fail ? down() : overpassOk([])) });
  assert.equal((await get(ctx)).status, 502);
  fail = false;
  const before = ctx.calls.length;
  assert.deepEqual((await get(ctx)).body, { parking: [] });
  assert.equal(ctx.calls.length, before + 1);
  assert.deepEqual((await get(ctx, `lat=${Q.lat + 0.0001}&lng=${Q.lng}`)).body, { parking: [] });
  assert.equal(ctx.calls.length, before + 1);
});

test("bad query parameters return 400 and never fetch", async () => {
  const ctx = load({ fetchImpl: () => assert.fail("no fetch for invalid input") });
  for (const query of [
    "",
    "lat=1",
    "lng=1",
    "lat=abc&lng=1",
    "lat=91&lng=0",
    "lat=0&lng=181",
    "lat=&lng=1",
    "lat=Infinity&lng=1",
  ]) {
    const { status, body } = await get(ctx, query);
    assert.equal(status, 400, query);
    assert.equal(typeof body.error, "string");
  }
  assert.equal(ctx.calls.length, 0);
});
