import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as validation from "../lib/api-validation.ts";

const require = createRequire(import.meta.url);
const KEY = "test-ors-key-DO-NOT-LEAK";
const DAY = 24 * 60 * 60 * 1000;

function compile(path, deps) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  return { compiledModule, source, deps };
}

/** Load the route with its real helper modules, a stub Prisma client and a mocked fetch. */
function load({ rows = new Map(), fetchImpl, key = KEY }) {
  const calls = { fetch: [], upserts: [] };
  const mockFetch = async (url, init) => {
    calls.fetch.push({ url, init });
    return fetchImpl(url, init, calls.fetch.length);
  };
  const prisma = {
    routeLeg: {
      findUnique: async ({ where }) =>
        rows.get(JSON.stringify(Object.values(where.profile_fromLat_fromLng_toLat_toLng))) ?? null,
      upsert: async (args) => {
        calls.upserts.push(args);
        return args.create;
      },
    },
  };
  const env = { ORS_API_KEY: key };
  const base = { URL, Response, Request, AbortSignal, JSON, Math, Date, Number, Array, Error, Promise };
  const run = (path, requireMap) => {
    const { compiledModule, source } = compile(path);
    vm.runInNewContext(source, {
      ...base,
      module: compiledModule,
      exports: compiledModule.exports,
      process: { env },
      fetch: mockFetch,
      require: (name) => requireMap[name] ?? require(name),
    });
    return compiledModule.exports;
  };
  const ors = run("../lib/ors-client.ts", {});
  const legValidation = run("../lib/route-leg-validation.ts", { "@/lib/api-validation": validation });
  const route = run("../app/api/route-legs/route.ts", {
    "@/lib/ors-client": ors,
    "@/lib/prisma": { prisma },
    "@/lib/route-leg-validation": legValidation,
  });
  return { POST: route.POST, calls, ors };
}

const rowKey = (profile, f, t) => JSON.stringify([profile, f.lat, f.lng, t.lat, t.lng]);
const A = { lat: 35.68123, lng: 139.76712 };
const B = { lat: 35.69, lng: 139.7 };
const C = { lat: 35.7, lng: 139.8 };
const D = { lat: 35.71, lng: 139.9 };
const leg = (from, to, mode = "walk") => ({ from, to, mode });
const orsOk = (distance = 1000, duration = 800) =>
  new Response(JSON.stringify({ routes: [{ summary: { distance, duration }, geometry: "abc123" }] }), { status: 200 });

async function post(ctx, body) {
  const response = await ctx.POST(
    new Request("http://localhost/api/route-legs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  const text = await response.text();
  assert.ok(!text.includes(KEY), "response must never contain the key");
  return { status: response.status, body: JSON.parse(text) };
}

test("validation rejects bad JSON, leg counts, coordinates and modes with 400", async () => {
  const ctx = load({ fetchImpl: () => assert.fail("no fetch for invalid input") });
  const legs26 = Array.from({ length: 26 }, () => leg(A, B));
  for (const body of [
    "{not json",
    { legs: [] },
    { legs: legs26 },
    { legs: "x" },
    { legs: [leg({ lat: 91, lng: 0 }, B)] },
    { legs: [leg(A, { lat: 0, lng: 181 })] },
    { legs: [leg(A, { lat: "1", lng: 2 })] },
    { legs: [leg(A, B, "fly")] },
    { legs: [{ from: A, to: B }] },
  ]) {
    const result = await post(ctx, body);
    assert.equal(result.status, 400);
    assert.equal(typeof result.body.error, "string");
  }
  assert.equal(ctx.calls.fetch.length, 0);
});

test("accepts exactly 25 legs", async () => {
  const ctx = load({ fetchImpl: () => orsOk() });
  const result = await post(ctx, { legs: Array.from({ length: 25 }, () => leg(A, B)) });
  assert.equal(result.status, 200);
  assert.equal(result.body.legs.length, 25);
});

test("missing key returns 503 and never calls ORS", async () => {
  const ctx = load({ key: "", fetchImpl: () => assert.fail("no fetch without a key") });
  const result = await post(ctx, { legs: [leg(A, B)] });
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: "Routing is not configured." });
});

test("a cache hit skips fetch and rounds coordinates to 5 decimals", async () => {
  const rows = new Map([
    [
      rowKey("foot-walking", A, B),
      { meters: 500, seconds: 400, geometry: "cached", createdAt: new Date(Date.now() - 10 * DAY) },
    ],
  ]);
  const ctx = load({ rows, fetchImpl: () => assert.fail("cache hit must not fetch") });
  const result = await post(ctx, { legs: [leg({ lat: 35.681234999, lng: 139.767121 }, B)] });
  assert.deepEqual(result.body.legs, [{ meters: 500, seconds: 400, geometry: "cached", cached: true }]);
});

test("a miss fetches ORS with lng,lat order and the key, then stores the row", async () => {
  const ctx = load({ fetchImpl: () => orsOk(1234, 987) });
  const result = await post(ctx, { legs: [leg(A, B, "drive")] });
  assert.deepEqual(result.body.legs, [{ meters: 1234, seconds: 987, geometry: "abc123", cached: false }]);
  const [{ url, init }] = ctx.calls.fetch;
  assert.equal(url, "https://api.openrouteservice.org/v2/directions/driving-car");
  assert.equal(init.headers.Authorization, KEY);
  assert.deepEqual(JSON.parse(init.body), {
    coordinates: [
      [A.lng, A.lat],
      [B.lng, B.lat],
    ],
  });
  assert.equal(ctx.calls.upserts.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.upserts[0].create)), {
    profile: "driving-car",
    fromLat: A.lat,
    fromLng: A.lng,
    toLat: B.lat,
    toLng: B.lng,
    meters: 1234,
    seconds: 987,
    geometry: "abc123",
  });
});

test("a stale row (older than 90 days) is refetched and upserted", async () => {
  const rows = new Map([
    [
      rowKey("foot-walking", A, B),
      { meters: 1, seconds: 1, geometry: "old", createdAt: new Date(Date.now() - 91 * DAY) },
    ],
  ]);
  const ctx = load({ rows, fetchImpl: () => orsOk(700, 500) });
  const result = await post(ctx, { legs: [leg(A, B)] });
  assert.deepEqual(result.body.legs, [{ meters: 700, seconds: 500, geometry: "abc123", cached: false }]);
  assert.equal(ctx.calls.fetch.length, 1);
  assert.equal(ctx.calls.upserts.length, 1);
  assert.ok(ctx.calls.upserts[0].update.createdAt instanceof Date);
});

test("results keep request order with a mix of cached and fetched legs", async () => {
  const rows = new Map([
    [rowKey("foot-walking", B, C), { meters: 22, seconds: 22, geometry: "c", createdAt: new Date() }],
  ]);
  let n = 0;
  const ctx = load({ rows, fetchImpl: () => orsOk(++n * 100, n * 10) });
  const result = await post(ctx, { legs: [leg(A, B), leg(B, C), leg(C, D)] });
  assert.deepEqual(
    result.body.legs.map((l) => [l.meters, l.cached]),
    [
      [100, false],
      [22, true],
      [200, false],
    ],
  );
});

test("429 marks the failing and remaining misses, but cached legs are still served", async () => {
  const rows = new Map([
    [rowKey("foot-walking", C, D), { meters: 9, seconds: 9, geometry: "c", createdAt: new Date() }],
  ]);
  const ctx = load({
    rows,
    fetchImpl: (url, init, count) => (count === 1 ? orsOk() : new Response("{}", { status: 429 })),
  });
  const result = await post(ctx, { legs: [leg(A, B), leg(B, C), leg(C, D), leg(D, A)] });
  assert.equal(result.status, 200);
  assert.equal(result.body.legs[0].cached, false);
  assert.deepEqual(result.body.legs[1], { error: "Routing quota reached." });
  assert.equal(result.body.legs[2].cached, true);
  assert.deepEqual(result.body.legs[3], { error: "Routing quota reached." });
  assert.equal(ctx.calls.fetch.length, 2, "no ORS calls after the quota failure");
});

test("401 and 403 become unauthorized and stop further ORS calls", async () => {
  for (const status of [401, 403]) {
    const ctx = load({ fetchImpl: () => new Response("{}", { status }) });
    const result = await post(ctx, { legs: [leg(A, B), leg(B, C)] });
    assert.deepEqual(result.body.legs, [
      { error: "Routing key was rejected." },
      { error: "Routing key was rejected." },
    ]);
    assert.equal(ctx.calls.fetch.length, 1);
  }
});

test("timeouts, 500s and malformed bodies are upstream errors that do not stop later legs", async () => {
  const cases = [
    () => Promise.reject(new DOMException("timed out", "TimeoutError")),
    () => new Response("{}", { status: 500 }),
    () => new Response("not json", { status: 200 }),
    () => new Response(JSON.stringify({ routes: [] }), { status: 200 }),
    () =>
      new Response(JSON.stringify({ routes: [{ summary: { distance: "x", duration: 1 }, geometry: "g" }] }), {
        status: 200,
      }),
  ];
  for (const failure of cases) {
    const ctx = load({ fetchImpl: (url, init, count) => (count === 1 ? failure() : orsOk()) });
    const result = await post(ctx, { legs: [leg(A, B), leg(B, C)] });
    assert.deepEqual(result.body.legs[0], { error: "Routing service failed." });
    assert.equal(result.body.legs[1].cached, false);
    assert.equal(ctx.calls.upserts.length, 1, "failed legs are not stored");
  }
});

test("the client passes an abort signal to fetch", async () => {
  const ctx = load({ fetchImpl: () => orsOk() });
  await post(ctx, { legs: [leg(A, B)] });
  assert.ok(ctx.calls.fetch[0].init.signal instanceof AbortSignal);
});
