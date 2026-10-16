/** Server-only parking lookup. Import it only from route handlers: it reads `ORS_API_KEY` for the fallback. */
import { haversineMeters } from "@/lib/travel-legs";

export type ParkingSpot = {
  name: string | null;
  lat: number;
  lng: number;
  meters: number;
  fee: string | null;
  access: string | null;
  source: "osm" | "ors";
};
export type ParkingErrorKind = "overpass" | "ors" | "unavailable";

const RADIUS_METERS = 1000;
const MAX_RESULTS = 5;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_BUDGET_MS = 60_000;
const OVERPASS_RETRY_STATUSES = new Set([429, 502, 503, 504]);
const OVERPASS_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000];
const ORS_POIS_URL = "https://api.openrouteservice.org/pois";
const ORS_PARKING_CATEGORY = 601;
const USER_AGENT = "travel-planner/0.1 (personal itinerary app)";
const EXCLUDED_ACCESS = new Set(["private", "no", "customers"]);
const MESSAGES: Record<ParkingErrorKind, string> = {
  overpass: "Parking service failed.",
  ors: "Parking fallback failed.",
  unavailable: "Parking lookup failed.",
};

/** Typed parking failure. Messages are fixed strings and never include the key. */
export class ParkingError extends Error {
  readonly kind: ParkingErrorKind;

  constructor(kind: ParkingErrorKind) {
    super(MESSAGES[kind]);
    this.name = "ParkingError";
    this.kind = kind;
  }
}

const cache = new Map<string, { at: number; spots: ParkingSpot[] }>();

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function build(
  origin: { lat: number; lng: number },
  raw: { lat: unknown; lng: unknown; tags: Record<string, unknown> | undefined },
  source: ParkingSpot["source"],
): ParkingSpot | null {
  const { lat, lng } = raw;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const access = text(raw.tags?.access);
  if (access && EXCLUDED_ACCESS.has(access.toLowerCase())) return null;
  return {
    name: text(raw.tags?.name),
    lat,
    lng,
    meters: Math.round(haversineMeters(origin, { lat, lng })),
    fee: text(raw.tags?.fee),
    access,
    source,
  };
}

function rank(spots: (ParkingSpot | null)[]) {
  return spots
    .filter((spot): spot is ParkingSpot => spot !== null)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, MAX_RESULTS);
}

async function fromOverpass(lat: number, lng: number): Promise<ParkingSpot[]> {
  // Overpass returns elements in ID order, not by distance, so fetch the whole radius (capped) and rank locally.
  const query = `[out:json][timeout:55];nwr(around:${RADIUS_METERS},${lat},${lng})[amenity=parking];out center tags 200;`;
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
  return rank(
    body.elements.map((element) => {
      const el = asRecord(element);
      if (!el) return null;
      const center = asRecord(el.center);
      return build(
        { lat, lng },
        { lat: el.lat ?? center?.lat, lng: el.lon ?? center?.lon, tags: asRecord(el.tags) },
        "osm",
      );
    }),
  );
}

async function fromOrs(key: string, lat: number, lng: number): Promise<ParkingSpot[]> {
  const response = await fetch(ORS_POIS_URL, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      request: "pois",
      geometry: { geojson: { type: "Point", coordinates: [lng, lat] }, buffer: RADIUS_METERS },
      filters: { category_ids: [ORS_PARKING_CATEGORY] },
      limit: 20,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("ors status");
  // With no results ORS emits `"bbox": [NaN, ...]`, which is not valid JSON; treat that as an empty list.
  let body: Record<string, unknown> | undefined;
  try {
    body = asRecord(JSON.parse((await response.text()).replace(/\bNaN\b/g, "null")));
  } catch {
    return [];
  }
  const features = Array.isArray(body?.features) ? body.features : [];
  return rank(
    features.map((feature) => {
      const f = asRecord(feature);
      const coordinates = asRecord(f?.geometry)?.coordinates;
      if (!Array.isArray(coordinates)) return null;
      return build(
        { lat, lng },
        { lat: coordinates[1], lng: coordinates[0], tags: asRecord(asRecord(f?.properties)?.osm_tags) },
        "ors",
      );
    }),
  );
}

/** Up to 5 car parks within 1 km of the point, nearest first. Overpass first, ORS POIs as fallback. */
export async function findParking(lat: number, lng: number): Promise<ParkingSpot[]> {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.spots;
  cache.delete(cacheKey);

  let spots: ParkingSpot[];
  try {
    spots = await fromOverpass(lat, lng);
  } catch {
    // ORS has no parking data for Japan, so an empty fallback is treated as a failure, and fallback results are never cached.
    const key = process.env.ORS_API_KEY?.trim();
    if (!key) throw new ParkingError("unavailable");
    let fallback: ParkingSpot[];
    try {
      fallback = await fromOrs(key, lat, lng);
    } catch {
      throw new ParkingError("ors");
    }
    if (fallback.length === 0) throw new ParkingError("unavailable");
    return fallback;
  }

  while (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, { at: Date.now(), spots });
  return spots;
}
