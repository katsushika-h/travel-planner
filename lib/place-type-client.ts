/** Server-only lookup of the type of the place at a point from OpenFreeMap vector tiles. Import it only from route handlers. */
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { inferTypeFromPois, poiCandidate, type InferredType, type PoiCandidate } from "@/lib/place-type";

const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
/** OpenFreeMap serves up to zoom 14, the most detailed POI layer. */
const ZOOM = 14;
/** Tiles of this much margin around the pin are read, so a pin near a tile edge sees its neighbours. */
const MARGIN_DEGREES = 0.001;
const TILEJSON_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "travel-planner/0.1 (personal itinerary app)";

/** Typed lookup failure with a fixed message. */
export class PlaceTypeError extends Error {
  constructor() {
    super("Place type lookup failed.");
    this.name = "PlaceTypeError";
  }
}

let tileTemplate: { url: string; at: number } | null = null;

async function fetchBytes(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("tile status");
  return response;
}

/** The current tile URL template; OpenFreeMap puts a dated version in the path, so ask its TileJSON. */
async function currentTileTemplate() {
  if (tileTemplate && Date.now() - tileTemplate.at < TILEJSON_TTL_MS) return tileTemplate.url;
  const tilejson = (await (await fetchBytes(TILEJSON_URL)).json()) as { tiles?: unknown };
  const url = Array.isArray(tilejson.tiles) ? tilejson.tiles[0] : null;
  if (typeof url !== "string" || !url.startsWith("https://tiles.openfreemap.org/")) throw new Error("tilejson");
  tileTemplate = { url, at: Date.now() };
  return url;
}

function tileXY(lat: number, lng: number) {
  const n = 2 ** ZOOM;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

async function poisInTile(template: string, x: number, y: number): Promise<PoiCandidate[]> {
  const url = template.replace("{z}", String(ZOOM)).replace("{x}", String(x)).replace("{y}", String(y));
  const tile = new VectorTile(new PbfReader(new Uint8Array(await (await fetchBytes(url)).arrayBuffer())));
  const layer = tile.layers.poi;
  const pois: PoiCandidate[] = [];
  for (let index = 0; layer && index < layer.length; index += 1) {
    const feature = layer.feature(index);
    const geometry = feature.toGeoJSON(x, y, ZOOM).geometry;
    if (geometry.type !== "Point") continue;
    const [lng, lat] = geometry.coordinates;
    const poi = poiCandidate(feature.properties, { lat, lng });
    if (poi) pois.push(poi);
  }
  return pois;
}

export async function findPlaceType(lat: number, lng: number, name: string | null): Promise<InferredType | null> {
  try {
    const template = await currentTileTemplate();
    const corners = [
      tileXY(lat - MARGIN_DEGREES, lng - MARGIN_DEGREES),
      tileXY(lat + MARGIN_DEGREES, lng + MARGIN_DEGREES),
    ];
    const tiles = new Map<string, { x: number; y: number }>();
    for (let x = corners[0].x; x <= corners[1].x; x += 1)
      for (let y = corners[1].y; y <= corners[0].y; y += 1) tiles.set(`${x}/${y}`, { x, y });
    const pois = (await Promise.all([...tiles.values()].map((tile) => poisInTile(template, tile.x, tile.y)))).flat();
    return inferTypeFromPois(pois, { lat, lng }, name);
  } catch {
    throw new PlaceTypeError();
  }
}
