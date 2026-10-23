/** Server-only place details lookup. Import it only from route handlers: it calls OpenStreetMap, Wikidata and Wikipedia. */
import type { OsmElementType, PlaceDetails } from "@/lib/place-details";

export type PlaceDetailsErrorKind = "not-found" | "upstream";
export type WikidataInfo = {
  description: string | null;
  enwikiTitle: string | null;
  sitelinks: Record<string, string>;
};
export type WikipediaSummary = NonNullable<PlaceDetails["summary"]>;

const OSM_API = "https://api.openstreetmap.org/api/0.6";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary";
const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const USER_AGENT = "travel-planner/0.1 (personal itinerary app)";
const MESSAGES: Record<PlaceDetailsErrorKind, string> = {
  "not-found": "Place not found.",
  upstream: "Place details lookup failed.",
};
/** Sitelink keys ending in "wiki" that are not Wikipedia editions. */
const NON_WIKIPEDIA_SITES = new Set(["commonswiki", "specieswiki", "metawiki", "mediawikiwiki", "wikidatawiki"]);

/** Typed place details failure. Messages are fixed strings. */
export class PlaceDetailsError extends Error {
  readonly kind: PlaceDetailsErrorKind;

  constructor(kind: PlaceDetailsErrorKind) {
    super(MESSAGES[kind]);
    this.name = "PlaceDetailsError";
    this.kind = kind;
  }
}

type CacheEntry = { at: number; details: PlaceDetails | null };
const cache = new Map<string, CacheEntry>();

/** Test helper: forget cached lookups. */
export function clearPlaceDetailsCache() {
  cache.clear();
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function httpUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function list(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const items = raw
    .split(";")
    .map((item) => item.trim().replace(/_/g, " "))
    .filter(Boolean);
  return items.length ? items.join(", ") : null;
}

function wikipediaUrl(language: string, title: string) {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** Splits an OSM `wikipedia` tag such as `ja:梛神社` into language and title. */
export function parseWikipediaTag(value: unknown): { language: string; title: string } | null {
  const raw = text(value);
  const match = raw && /^([a-z][a-z-]{1,11}):(.+)$/i.exec(raw);
  return match ? { language: match[1].toLowerCase(), title: match[2].trim() } : null;
}

/** English description, `enwiki` title and every Wikipedia sitelink (language to title) of a `wbgetentities` response. */
export function parseWikidataEntity(body: unknown, id: string): WikidataInfo | null {
  const entity = asRecord(asRecord(asRecord(body)?.entities)?.[id]);
  if (!entity || "missing" in entity) return null;
  const description = text(asRecord(asRecord(entity.descriptions)?.en)?.value);
  const sitelinks: Record<string, string> = {};
  for (const [site, link] of Object.entries(asRecord(entity.sitelinks) ?? {})) {
    const title = text(asRecord(link)?.title);
    if (title && site.endsWith("wiki") && !NON_WIKIPEDIA_SITES.has(site) && site.length > 4)
      sitelinks[site.slice(0, -4).replace(/_/g, "-")] = title;
  }
  return { description, enwikiTitle: sitelinks.en ?? null, sitelinks };
}

/** The English Wikipedia REST summary, or null for disambiguation pages and malformed responses. */
export function parseWikipediaSummary(body: unknown): WikipediaSummary | null {
  const record = asRecord(body);
  if (!record || record.type === "disambiguation") return null;
  const title = text(record.title);
  const extract = text(record.extract);
  const url = httpUrl(asRecord(asRecord(record.content_urls)?.desktop)?.page);
  if (!title || !extract || !url) return null;
  return { title, extract, url, thumbnailUrl: httpUrl(asRecord(record.thumbnail)?.source) };
}

/** Picks a non-English article: the OSM `wikipedia` tag's language first, else the first Wikipedia sitelink. */
function pickOtherWikipedia(
  tagged: { language: string; title: string } | null,
  sitelinks: Record<string, string>,
): PlaceDetails["otherWikipedia"] {
  const taggedTitle = tagged && tagged.language !== "en" ? (sitelinks[tagged.language] ?? tagged.title) : null;
  const chosen =
    tagged && taggedTitle
      ? { language: tagged.language, title: taggedTitle }
      : (Object.entries(sitelinks)
          .filter(([language]) => language !== "en")
          .map(([language, title]) => ({ language, title }))[0] ?? null);
  return chosen ? { ...chosen, url: wikipediaUrl(chosen.language, chosen.title) } : null;
}

/** Builds details from OSM tags plus optional Wikidata and Wikipedia data; pure. */
export function detailsFromTags(
  osmType: OsmElementType,
  osmId: number,
  tags: Record<string, unknown>,
  wikidata: WikidataInfo | null = null,
  summary: WikipediaSummary | null = null,
): PlaceDetails {
  const tagged = parseWikipediaTag(tags.wikipedia);
  return {
    osmType,
    osmId,
    name: text(tags.name),
    nameEn: text(tags["name:en"]),
    description: wikidata?.description ?? null,
    summary,
    otherWikipedia: summary ? null : pickOtherWikipedia(tagged, wikidata?.sitelinks ?? {}),
    cuisine: list(tags.cuisine),
    openingHours: text(tags.opening_hours),
    website: httpUrl(tags.website) ?? httpUrl(tags["contact:website"]),
    religion: text(tags.religion),
    osmUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
  };
}

type Fetch = typeof fetch;

async function getJson(fetchImpl: Fetch, url: string) {
  const response = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response;
}

async function fetchTags(fetchImpl: Fetch, osmType: OsmElementType, osmId: number) {
  let response: Response;
  try {
    response = await getJson(fetchImpl, `${OSM_API}/${osmType}/${osmId}.json`);
  } catch {
    throw new PlaceDetailsError("upstream");
  }
  if (response.status === 404 || response.status === 410) throw new PlaceDetailsError("not-found");
  if (!response.ok) throw new PlaceDetailsError("upstream");
  try {
    const element = asRecord((asRecord(await response.json())?.elements as unknown[] | undefined)?.[0]);
    return asRecord(element?.tags) ?? {};
  } catch {
    throw new PlaceDetailsError("upstream");
  }
}

async function optionalJson(fetchImpl: Fetch, url: string) {
  try {
    const response = await getJson(fetchImpl, url);
    return response.ok ? ((await response.json()) as unknown) : null;
  } catch {
    return null;
  }
}

/** Lookups run only when called (one user click). Wikidata and Wikipedia failures leave their fields null. */
export async function lookupPlaceDetails(
  osmType: OsmElementType,
  osmId: number,
  fetchImpl: Fetch,
): Promise<PlaceDetails> {
  const tags = await fetchTags(fetchImpl, osmType, osmId);
  const qid = text(tags.wikidata);
  const wikidata =
    qid && /^Q\d+$/.test(qid)
      ? parseWikidataEntity(
          await optionalJson(
            fetchImpl,
            `${WIKIDATA_API}?action=wbgetentities&ids=${qid}&props=descriptions%7Csitelinks&languages=en&format=json`,
          ),
          qid,
        )
      : null;
  const tagged = parseWikipediaTag(tags.wikipedia);
  const englishTitle = wikidata?.enwikiTitle ?? (tagged?.language === "en" ? tagged.title : null);
  const summary = englishTitle
    ? parseWikipediaSummary(
        await optionalJson(fetchImpl, `${WIKIPEDIA_SUMMARY}/${encodeURIComponent(englishTitle.replace(/ /g, "_"))}`),
      )
    : null;
  return detailsFromTags(osmType, osmId, tags, wikidata, summary);
}

/** Details for one OSM element, cached 24 h (not-found for 1 h; upstream failures are never cached). */
export async function fetchPlaceDetails(
  osmType: OsmElementType,
  osmId: number,
  fetchImpl: Fetch = fetch,
): Promise<PlaceDetails> {
  const cacheKey = `${osmType}/${osmId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < (hit.details ? CACHE_TTL_MS : NOT_FOUND_TTL_MS)) {
    if (hit.details) return hit.details;
    throw new PlaceDetailsError("not-found");
  }
  cache.delete(cacheKey);

  let details: PlaceDetails | null;
  try {
    details = await lookupPlaceDetails(osmType, osmId, fetchImpl);
  } catch (error) {
    if (!(error instanceof PlaceDetailsError) || error.kind !== "not-found") throw error;
    details = null;
  }
  while (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, { at: Date.now(), details });
  if (!details) throw new PlaceDetailsError("not-found");
  return details;
}
