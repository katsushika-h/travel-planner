import { NEARBY_CATEGORIES, type NearbyCategory, type NearbyFeature } from "./nearby-places.ts";

/** Pure OSM tag mapping for the Nearby "search more" query; no network, so Node tests can import it. */

/** OSM tag → OpenMapTiles `poi` class. The subclass is the raw OSM value, as in the tiles. */
const TAGS: Record<NearbyCategory, readonly { key: string; value: string; osmClass: string }[]> = {
  food: [
    { key: "amenity", value: "restaurant", osmClass: "restaurant" },
    { key: "amenity", value: "cafe", osmClass: "cafe" },
    { key: "amenity", value: "fast_food", osmClass: "fast_food" },
    { key: "amenity", value: "bar", osmClass: "bar" },
    { key: "amenity", value: "pub", osmClass: "beer" },
    { key: "amenity", value: "biergarten", osmClass: "beer" },
    { key: "amenity", value: "ice_cream", osmClass: "ice_cream" },
    { key: "shop", value: "ice_cream", osmClass: "ice_cream" },
    { key: "shop", value: "bakery", osmClass: "bakery" },
  ],
  sights: [
    { key: "tourism", value: "attraction", osmClass: "attraction" },
    { key: "tourism", value: "museum", osmClass: "museum" },
    { key: "tourism", value: "gallery", osmClass: "art_gallery" },
    { key: "amenity", value: "place_of_worship", osmClass: "place_of_worship" },
    { key: "amenity", value: "theatre", osmClass: "theatre" },
    { key: "leisure", value: "park", osmClass: "park" },
    { key: "historic", value: "castle", osmClass: "castle" },
    { key: "historic", value: "monument", osmClass: "monument" },
  ],
  transit: [
    { key: "railway", value: "station", osmClass: "railway" },
    { key: "railway", value: "halt", osmClass: "railway" },
    { key: "railway", value: "tram_stop", osmClass: "railway" },
    { key: "highway", value: "bus_stop", osmClass: "bus" },
    { key: "amenity", value: "bus_station", osmClass: "bus" },
    { key: "amenity", value: "ferry_terminal", osmClass: "ferry_terminal" },
    { key: "aerialway", value: "station", osmClass: "aerialway" },
    { key: "aeroway", value: "aerodrome", osmClass: "airport" },
  ],
};

/** `[key=value]` filters for a category's Overpass query. */
export function nearbyTagFilters(category: NearbyCategory) {
  return TAGS[category].map(({ key, value }) => `[${key}=${value}]`);
}

const OSM_TYPE_DIGIT = { node: 1, way: 2, relation: 3 } as const;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Named Overpass elements (`out center tags`) as tile-shaped features; unnamed, unmapped or coordinate-less ones are dropped. */
export function overpassToFeatures(elements: readonly unknown[], category: NearbyCategory): NearbyFeature[] {
  const allowed: readonly string[] = NEARBY_CATEGORIES.find((entry) => entry.id === category)?.classes ?? [];
  const features: NearbyFeature[] = [];
  for (const element of elements) {
    const el = asRecord(element);
    const tags = asRecord(el?.tags);
    if (!el || !tags) continue;
    const name = typeof tags.name === "string" ? tags.name.trim() : "";
    const digit = typeof el.type === "string" ? OSM_TYPE_DIGIT[el.type as keyof typeof OSM_TYPE_DIGIT] : undefined;
    const osmId = el.id;
    if (!name || !digit || typeof osmId !== "number" || !Number.isSafeInteger(osmId) || osmId <= 0) continue;
    const match = TAGS[category].find(({ key, value, osmClass }) => tags[key] === value && allowed.includes(osmClass));
    if (!match) continue;
    const center = asRecord(el.center);
    const lat = finite(el.lat) ?? finite(center?.lat);
    const lng = finite(el.lon) ?? finite(center?.lon);
    if (lat === null || lng === null) continue;
    features.push({
      id: osmId * 10 + digit,
      properties: { name, class: match.osmClass, subclass: match.value },
      geometry: { type: "Point", coordinates: [lng, lat] },
    });
  }
  return features;
}
