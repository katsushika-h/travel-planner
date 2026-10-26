import type { TravelObject } from "../types/travel.ts";
import { decodeTileFeatureId, type OsmElementType } from "./place-details.ts";
import { hasMapCoordinates } from "./map-coordinates.ts";
import { estimateWalk, haversineMeters } from "./travel-legs.ts";

/** Pure filtering and nearest-first sorting of OpenMapTiles `poi` point features around an anchor; no React, MapLibre or network. */

export const NEARBY_CATEGORIES = [
  {
    id: "food",
    label: "Food",
    classes: ["restaurant", "cafe", "fast_food", "bar", "beer", "ice_cream", "bakery"],
  },
  {
    id: "sights",
    label: "Sights",
    classes: ["attraction", "museum", "art_gallery", "place_of_worship", "theatre", "park", "castle", "monument"],
  },
  { id: "transit", label: "Transit", classes: ["railway", "bus", "ferry_terminal", "aerialway", "airport"] },
] as const;

export type NearbyCategory = (typeof NEARBY_CATEGORIES)[number]["id"];

/** Search radius bounds in metres; the upper bound is set by what the zoom-14 tiles contain. */
export const NEARBY_RADIUS = { min: 200, max: 1000, step: 100, default: 500 } as const;

/** Repeats of one place across tile edges lie closer than this. */
const EDGE_DUPLICATE_METERS = 20;
/** A suggestion this close to a trip stop with coordinates is treated as that stop. */
const TRIP_MATCH_METERS = 30;

/** The shape MapLibre's `querySourceFeatures` returns. */
export type NearbyFeature = {
  /** Numeric Planetiler id; see `decodeTileFeatureId`. */
  id?: unknown;
  properties?: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown };
};

export type NearbyPlace = {
  id: string;
  name: string;
  osmClass: string;
  subclass: string;
  type: string;
  lat: number;
  lng: number;
  meters: number;
  walkSeconds: number;
  /** The OpenStreetMap element behind the tile feature, when its id decodes. */
  osm: { osmType: OsmElementType; osmId: number } | null;
};

/** Item type for a place of a category; parks are activities rather than sightseeing. */
function itemType(category: NearbyCategory, osmClass: string) {
  if (category === "food") return "food";
  if (category === "transit") return "commute";
  return osmClass === "park" ? "activity" : "sightseeing";
}

/** Case, width and whitespace-insensitive form of a name for comparing against trip items. */
function normalizeName(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPoint(feature: NearbyFeature) {
  if (feature.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) return null;
  const [lng, lat] = feature.geometry.coordinates;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Stable id for a place: class, normalised name and coordinates rounded to about a metre. */
function placeId(osmClass: string, name: string, lat: number, lng: number) {
  return `${osmClass}:${normalizeName(name)}:${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Google Maps search link for a point; `app/api/maps/resolve` reads the coordinates back from `query`. */
export function mapsSearchUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Named places of a category within the radius, nearest first, minus tile-edge repeats and anything already in the trip. */
export function nearbyPlaces({
  features,
  anchor,
  radiusMeters,
  category,
  items,
}: {
  features: readonly NearbyFeature[];
  anchor: { lat: number; lng: number };
  radiusMeters: number;
  category: NearbyCategory;
  items: readonly TravelObject[];
}): NearbyPlace[] {
  const classes: readonly string[] = NEARBY_CATEGORIES.find((entry) => entry.id === category)?.classes ?? [];
  const tripNames = new Set<string>();
  const tripPoints: { lat: number; lng: number }[] = [];
  for (const item of items) {
    for (const name of [item.title, item.location?.name]) {
      const text = readString(name);
      if (text) tripNames.add(normalizeName(text));
    }
    if (hasMapCoordinates(item.location)) tripPoints.push({ lat: item.location!.lat!, lng: item.location!.lng! });
  }

  const places: NearbyPlace[] = [];
  for (const feature of features) {
    const name = readString(feature.properties?.name);
    const osmClass = readString(feature.properties?.class);
    const point = readPoint(feature);
    if (!name || !osmClass || !point || !classes.includes(osmClass)) continue;
    const meters = haversineMeters(anchor, point);
    if (meters > radiusMeters) continue;
    const key = normalizeName(name);
    if (tripNames.has(key)) continue;
    if (tripPoints.some((stop) => haversineMeters(stop, point) <= TRIP_MATCH_METERS)) continue;
    const osm = decodeTileFeatureId(feature.id);
    const repeat = places.find(
      (place) =>
        place.osmClass === osmClass &&
        normalizeName(place.name) === key &&
        haversineMeters(place, point) <= EDGE_DUPLICATE_METERS,
    );
    if (repeat) {
      repeat.osm ??= osm;
      continue;
    }
    places.push({
      id: placeId(osmClass, name, point.lat, point.lng),
      name,
      osmClass,
      subclass: readString(feature.properties?.subclass) ?? osmClass,
      type: itemType(category, osmClass),
      ...point,
      meters,
      walkSeconds: estimateWalk(meters).seconds,
      osm,
    });
  }
  return places.sort((a, b) => a.meters - b.meters);
}
