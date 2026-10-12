import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as validation from "../lib/api-validation.ts";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../app/api/maps/resolve/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function resolve(url, responses = [new Response("ok")]) {
  const compiledModule = { exports: {} };
  let calls = 0;
  vm.runInNewContext(source, {
    module: compiledModule, exports: compiledModule.exports, URL, Response, AbortSignal,
    require: (name) => name === "@/lib/api-validation" ? validation : require(name),
    fetch: async () => {
      assert.ok(calls < responses.length, "unexpected fetch");
      return responses[calls++];
    },
  });
  const response = await compiledModule.exports.POST(new Request("http://localhost/api/maps/resolve", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
  }));
  assert.equal(response.status, 200);
  return response.json();
}

function assertPoint(result, lat, lng) {
  assert.equal(result.lat, lat);
  assert.equal(result.lng, lng);
  assert.equal(result.coordinateSource, "url");
}

test("place pin wins over camera coordinates, including encoded data", async () => {
  for (const data of ["!3d35.6812!4d139.7671", "%213d35.6812%214d139.7671"]) {
    const result = await resolve(`https://www.google.com/maps/place/Tokyo+Station/@35.68,139.76,15z/data=${data}`);
    assertPoint(result, 35.6812, 139.7671);
    assert.equal(result.name, "Tokyo Station");
  }
});

test("location query and destination win over camera regardless of parameter order", async () => {
  for (const key of ["query", "q", "destination", "daddr"]) {
    for (const params of [`center=35.68,139.76&${key}=35.6812,139.7671`, `${key}=35.6812,139.7671&center=35.68,139.76`]) {
      assertPoint(await resolve(`https://www.google.com/maps/@35.68,139.76,15z?${params}`), 35.6812, 139.7671);
    }
  }
});

test("camera-only links retain their coordinate fallback", async () => {
  assertPoint(await resolve("https://www.google.com/maps/@-33.86,151.2,15z"), -33.86, 151.2);
  assertPoint(await resolve("https://www.google.com/maps?center=1.3,103.8"), 1.3, 103.8);
});

test("invalid place coordinates fall back to valid camera coordinates", async () => {
  assertPoint(await resolve("https://www.google.com/maps/@1.3,103.8,15z/data=!3d95!4d200"), 1.3, 103.8);
});

test("short links resolve to the place pin after redirect", async () => {
  const expandedUrl = "https://www.google.com/maps/place/Station/@35.68,139.76,15z/data=!3d35.6812!4d139.7671";
  const result = await resolve("https://maps.app.goo.gl/example", [
    new Response(null, { status: 302, headers: { location: expandedUrl } }), new Response("ok"),
  ]);
  assertPoint(result, 35.6812, 139.7671);
  assert.equal(result.expandedUrl, expandedUrl);
});

test("links without coordinates remain usable without inventing a pin", async () => {
  const url = "https://www.google.com/maps/place/Tokyo+Station";
  const result = await resolve(url);
  assert.equal(result.expandedUrl, url);
  assert.equal(result.lat, null);
  assert.equal(result.lng, null);
  assert.equal(result.coordinateSource, null);
});
