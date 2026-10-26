import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function run(path, requireMap = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(compile(path), {
    URL,
    Response,
    AbortSignal,
    JSON,
    Math,
    Date,
    Number,
    Array,
    Error,
    Object,
    Promise,
    Map,
    Set,
    RegExp,
    encodeURIComponent,
    fetch: () => {
      throw new Error("real fetch must not be used");
    },
    module: mod,
    exports: mod.exports,
    require: (name) => requireMap[name] ?? require(name),
  });
  return mod.exports;
}

const details = run("../lib/place-details.ts");
const client = run("../lib/place-details-client.ts", { "@/lib/place-details": details });

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const entity = (id, { description, sitelinks = {} } = {}) => ({
  entities: {
    [id]: {
      descriptions: description ? { en: { language: "en", value: description } } : {},
      sitelinks: Object.fromEntries(Object.entries(sitelinks).map(([site, title]) => [site, { site, title }])),
    },
  },
});
const summary = (extra = {}) => ({
  type: "standard",
  title: "Nashi Shrine",
  extract: "A shrine.",
  content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Nashi_Shrine" } },
  thumbnail: { source: "https://upload.wikimedia.org/x.jpg" },
  ...extra,
});

test("decodeTileFeatureId decodes node, way and relation ids", () => {
  assert.deepEqual({ ...details.decodeTileFeatureId(1234561) }, { osmType: "node", osmId: 123456 });
  assert.deepEqual({ ...details.decodeTileFeatureId(6273260162) }, { osmType: "way", osmId: 627326016 });
  assert.deepEqual({ ...details.decodeTileFeatureId(93) }, { osmType: "relation", osmId: 9 });
});

test("decodeTileFeatureId rejects invalid ids", () => {
  for (const id of [0, -11, 1.5, 5, 4, 1, 2, 3, NaN, Infinity, "12", null, undefined, Number.MAX_SAFE_INTEGER + 2])
    assert.equal(details.decodeTileFeatureId(id), null, String(id));
});

test("detailsFromTags reads names, lists, hours, religion and the OSM link", () => {
  const d = client.detailsFromTags("way", 7, {
    name: "梛神社",
    "name:en": " Nashi Shrine ",
    cuisine: "ramen;japanese_curry; ;sushi",
    opening_hours: "Mo-Su 09:00-17:00",
    religion: "shinto",
  });
  assert.equal(d.name, "梛神社");
  assert.equal(d.nameEn, "Nashi Shrine");
  assert.equal(d.cuisine, "ramen, japanese curry, sushi");
  assert.equal(d.openingHours, "Mo-Su 09:00-17:00");
  assert.equal(d.religion, "shinto");
  assert.equal(d.osmUrl, "https://www.openstreetmap.org/way/7");
  assert.equal(d.description, null);
  assert.equal(d.summary, null);
  assert.equal(d.otherWikipedia, null);
});

test("website keeps only http(s) URLs and falls back to contact:website", () => {
  const site = (tags) => client.detailsFromTags("node", 1, tags).website;
  assert.equal(site({ website: "https://example.com/a" }), "https://example.com/a");
  assert.equal(site({ website: "javascript:alert(1)", "contact:website": "http://ok.example" }), "http://ok.example");
  assert.equal(site({ website: "ftp://example.com" }), null);
  assert.equal(site({ website: "not a url" }), null);
  assert.equal(site({}), null);
});

test("parseWikidataEntity reads the English description and enwiki title", () => {
  const info = client.parseWikidataEntity(
    entity("Q1", {
      description: "Shinto shrine in Kyoto Prefecture, Japan",
      sitelinks: { enwiki: "Nashi Shrine", jawiki: "梛神社", commonswiki: "Category:X" },
    }),
    "Q1",
  );
  assert.equal(info.description, "Shinto shrine in Kyoto Prefecture, Japan");
  assert.equal(info.enwikiTitle, "Nashi Shrine");
  assert.deepEqual({ ...info.sitelinks }, { en: "Nashi Shrine", ja: "梛神社" });
  assert.equal(client.parseWikidataEntity({ entities: { Q1: { missing: "" } } }, "Q1"), null);
  assert.equal(client.parseWikidataEntity(null, "Q1"), null);
});

test("without enwiki, otherWikipedia prefers the wikipedia tag's language, else the first sitelink", () => {
  const info = client.parseWikidataEntity(entity("Q1", { sitelinks: { dewiki: "Nashi", jawiki: "梛 神社" } }), "Q1");
  const tagged = client.detailsFromTags("way", 1, { wikipedia: "ja:梛神社" }, info);
  assert.equal(tagged.otherWikipedia.language, "ja");
  assert.equal(tagged.otherWikipedia.title, "梛 神社");
  assert.equal(tagged.otherWikipedia.url, `https://ja.wikipedia.org/wiki/${encodeURIComponent("梛_神社")}`);
  const untagged = client.detailsFromTags("way", 1, {}, info);
  assert.equal(untagged.otherWikipedia.language, "de");
  const tagOnly = client.detailsFromTags("way", 1, { wikipedia: "fr:Temple X" });
  assert.deepEqual(
    { ...tagOnly.otherWikipedia },
    { language: "fr", title: "Temple X", url: "https://fr.wikipedia.org/wiki/Temple_X" },
  );
  assert.equal(client.detailsFromTags("way", 1, { wikipedia: "en:Temple X" }).otherWikipedia, null);
});

test("parseWikipediaSummary handles normal, disambiguation and missing thumbnail", () => {
  assert.deepEqual(
    { ...client.parseWikipediaSummary(summary()) },
    {
      title: "Nashi Shrine",
      extract: "A shrine.",
      url: "https://en.wikipedia.org/wiki/Nashi_Shrine",
      thumbnailUrl: "https://upload.wikimedia.org/x.jpg",
    },
  );
  assert.equal(client.parseWikipediaSummary(summary({ type: "disambiguation" })), null);
  assert.equal(client.parseWikipediaSummary(summary({ thumbnail: undefined })).thumbnailUrl, null);
  assert.equal(client.parseWikipediaSummary(summary({ extract: "" })), null);
  assert.equal(client.parseWikipediaSummary("nope"), null);
});

function stub(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    for (const [prefix, handler] of Object.entries(handlers)) if (url.startsWith(prefix)) return handler(url, init);
    throw new Error(`unexpected ${url}`);
  };
  return { fetchImpl, calls };
}

const osmWay = (tags) => json({ elements: [{ type: "way", id: 1, tags }] });

test("orchestration combines OSM, Wikidata and the English summary", async () => {
  client.clearPlaceDetailsCache();
  const { fetchImpl, calls } = stub({
    "https://api.openstreetmap.org/api/0.6/way/101.json": () => osmWay({ name: "Nashi", wikidata: "Q1" }),
    "https://www.wikidata.org/w/api.php": () =>
      json(entity("Q1", { description: "Shrine", sitelinks: { enwiki: "Nashi Shrine" } })),
    "https://en.wikipedia.org/api/rest_v1/page/summary/Nashi_Shrine": () => json(summary()),
  });
  const d = await client.fetchPlaceDetails("way", 101, fetchImpl);
  assert.equal(d.description, "Shrine");
  assert.equal(d.summary.title, "Nashi Shrine");
  assert.match(calls[0].init.headers["User-Agent"], /travel-planner/);
  assert.match(calls[1].url, /ids=Q1&props=descriptions%7Csitelinks&languages=en&format=json/);
  assert.equal(calls.length, 3);
  await client.fetchPlaceDetails("way", 101, fetchImpl);
  assert.equal(calls.length, 3, "second call is served from the cache");
});

test("Wikidata failure still returns OSM details", async () => {
  client.clearPlaceDetailsCache();
  const { fetchImpl } = stub({
    "https://api.openstreetmap.org/": () => osmWay({ name: "Nashi", wikidata: "Q1", cuisine: "tea" }),
    "https://www.wikidata.org/": () => new Response("x", { status: 500 }),
  });
  const d = await client.fetchPlaceDetails("way", 102, fetchImpl);
  assert.equal(d.name, "Nashi");
  assert.equal(d.cuisine, "tea");
  assert.equal(d.description, null);
  assert.equal(d.summary, null);
});

test("Wikipedia timeout leaves the summary null; a wikipedia=en tag needs no Wikidata", async () => {
  client.clearPlaceDetailsCache();
  const { fetchImpl, calls } = stub({
    "https://api.openstreetmap.org/": () => osmWay({ name: "Nashi", wikipedia: "en:Nashi Shrine" }),
    "https://en.wikipedia.org/": () => Promise.reject(new Error("timeout")),
  });
  const d = await client.fetchPlaceDetails("way", 103, fetchImpl);
  assert.equal(d.summary, null);
  assert.equal(calls.length, 2);
});

test("OSM 404 and 410 are not-found errors (cached); upstream failures are not cached", async () => {
  client.clearPlaceDetailsCache();
  let status = 404;
  const { fetchImpl, calls } = stub({ "https://api.openstreetmap.org/": () => new Response("", { status }) });
  await assert.rejects(client.fetchPlaceDetails("node", 104, fetchImpl), (e) => e.kind === "not-found");
  await assert.rejects(client.fetchPlaceDetails("node", 104, fetchImpl), (e) => e.kind === "not-found");
  assert.equal(calls.length, 1);
  status = 410;
  await assert.rejects(client.fetchPlaceDetails("node", 105, fetchImpl), (e) => e.kind === "not-found");
  status = 500;
  await assert.rejects(client.fetchPlaceDetails("node", 106, fetchImpl), (e) => e.kind === "upstream");
  await assert.rejects(client.fetchPlaceDetails("node", 106, fetchImpl), (e) => e.kind === "upstream");
  assert.equal(calls.length, 4);
  assert.equal(new client.PlaceDetailsError("upstream").message, "Place details lookup failed.");
});

test("route rejects invalid input with 400", async () => {
  const route = run("../app/api/place-details/route.ts", { "@/lib/place-details-client": client });
  for (const q of [
    "",
    "type=node",
    "id=5",
    "type=bad&id=5",
    "type=node&id=0",
    "type=node&id=-3",
    "type=node&id=1.5",
    "type=node&id=abc",
    "type=node&id=99999999999999999999",
  ]) {
    const response = await route.GET(new Request(`http://localhost/api/place-details?${q}`));
    assert.equal(response.status, 400, q);
  }
});
