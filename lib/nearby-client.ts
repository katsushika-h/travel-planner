/** Server-only Overpass lookup for the Nearby "search more" button. Import it only from route handlers. */
import { nearbyTagFilters, overpassToFeatures } from "@/lib/nearby-overpass";
import type { NearbyCategory, NearbyFeature } from "@/lib/nearby-places";
import { haversineMeters } from "@/lib/travel-legs";

/** Overpass returns elements in ID order, so fetch generously and keep the nearest locally. */
const MAX_ELEMENTS = 1000;
const MAX_FEATURES = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_BUDGET_MS = 60_000;
const OVERPASS_RETRY_STATUSES = new Set([429, 502, 503, 504]);
const OVERPASS_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000];
const USER_AGENT = "travel-planner/0.1 (personal itinerary app)";

/** Typed Nearby failure with a fixed message. */
export class NearbyError extends Error {
  constructor() {
    super("Nearby lookup failed.");
    this.name = "NearbyError";
  }
}

const cache = new Map<string, { at: number; features: NearbyFeature[] }>();

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

async function fromOverpass(lat: number, lng: number, radius: number, category: NearbyCategory) {
  const clauses = nearbyTagFilters(category).map((filter) => `nwr(around:${radius},${lat},${lng})${filter}[name];`);
  const query = `[out:json][timeout:55];(${clauses.join("")});out center tags ${MAX_ELEMENTS};`;
  const signal = AbortSignal.timeout(OVERPASS_BUDGET_MS);
  let response: Response;
  // A busy Overpass answers 429 or 502–504 at once and asks for exponential backoff; retry within the same budget.
  for (let attempt = 0; ; attempt++) {
    response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal,
    });
    if (response.ok || !OVERPASS_RETRY_STATUSES.has(response.status) || attempt >= OVERPASS_RETRY_DELAYS_MS.length)
      break;
    await new Promise((resolve) => setTimeout(resolve, OVERPASS_RETRY_DELAYS_MS[attempt]));
  }
  if (!response.ok) throw new Error("overpass status");
  const body = asRecord(await response.json());
  if (!body || !Array.isArray(body.elements)) throw new Error("overpass body");
  const origin = { lat, lng };
  const distance = (feature: NearbyFeature) => {
    const [featureLng, featureLat] = feature.geometry.coordinates as [number, number];
    return haversineMeters(origin, { lat: featureLat, lng: featureLng });
  };
  return overpassToFeatures(body.elements, category)
    .map((feature) => ({ feature, meters: distance(feature) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, MAX_FEATURES)
    .map(({ feature }) => feature);
}

/** Up to 200 named OpenStreetMap places of a category within the radius, nearest first, as tile-shaped features. */
export async function findNearby(
  lat: number,
  lng: number,
  radius: number,
  category: NearbyCategory,
): Promise<NearbyFeature[]> {
  const cacheKey = `${category}:${radius}:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.features;
  cache.delete(cacheKey);

  let features: NearbyFeature[];
  try {
    features = await fromOverpass(lat, lng, radius, category);
  } catch {
    throw new NearbyError();
  }
  while (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, { at: Date.now(), features });
  return features;
}
