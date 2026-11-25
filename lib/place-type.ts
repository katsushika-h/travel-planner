/** Infer an itinerary item type from OpenMapTiles `poi` features. Pure: no network or React. */
import { haversineMeters } from "./travel-legs.ts";

export type InferredType = "hotel" | "food" | "flight" | "commute" | "sightseeing" | "activity";

/** A named tile point of interest: its class and every `name*` property. */
export type PoiCandidate = { poiClass: string; names: string[]; lat: number; lng: number };

/** With no name to match, a pin this close to a POI is taken to be that POI. */
const PIN_METERS = 25;
/** A POI this close may be the place when its name matches the Maps name. */
const NAMED_METERS = 100;

const TYPE_BY_CLASS: Record<string, InferredType> = {
  lodging: "hotel",
  restaurant: "food",
  cafe: "food",
  fast_food: "food",
  bar: "food",
  beer: "food",
  ice_cream: "food",
  bakery: "food",
  airport: "flight",
  railway: "commute",
  bus: "commute",
  ferry_terminal: "commute",
  harbor: "commute",
  attraction: "sightseeing",
  museum: "sightseeing",
  art_gallery: "sightseeing",
  place_of_worship: "sightseeing",
  theatre: "sightseeing",
  castle: "sightseeing",
  monument: "sightseeing",
  zoo: "sightseeing",
  aquarium: "sightseeing",
  park: "activity",
  garden: "activity",
  stadium: "activity",
  sports_centre: "activity",
  swimming_pool: "activity",
  golf: "activity",
  cinema: "activity",
};

/** The default item type for a POI class, or null when the class says nothing about a trip. */
export function inferTypeFromClass(poiClass: string | null | undefined): InferredType | null {
  return (poiClass && TYPE_BY_CLASS[poiClass]) || null;
}

function normalise(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function namesMatch(placeName: string, tagName: string) {
  const a = normalise(placeName);
  const b = normalise(tagName);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  // Maps and OSM word names differently ("ANA Crowne Plaza Fukuoka by IHG" vs "ANA Crowne Plaza Hotel Fukuoka").
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  return shared >= 2 && shared / Math.min(aTokens.size, bTokens.size) >= 0.6;
}

/** Read a tile feature's POI class and every `name*` string property; null when it has no inferable class. */
export function poiCandidate(
  properties: Record<string, unknown> | null | undefined,
  point: { lat: number; lng: number },
): PoiCandidate | null {
  const poiClass = typeof properties?.class === "string" ? properties.class : "";
  if (!inferTypeFromClass(poiClass)) return null;
  const names = Object.entries(properties ?? {})
    .filter(([key, value]) => key.startsWith("name") && typeof value === "string" && value.trim())
    .map(([, value]) => value as string);
  return { poiClass, ...point, names };
}

/**
 * Type of the best POI near the pin: the nearest within 100 m whose name matches `name`. Without a name, the
 * nearest typed POI within 25 m. A named place that matches nothing stays unclassified rather than borrowing a neighbour's type.
 */
export function inferTypeFromPois(
  pois: readonly PoiCandidate[],
  origin: { lat: number; lng: number },
  name: string | null,
): InferredType | null {
  let named: { meters: number; poiClass: string } | null = null;
  let nearest: { meters: number; poiClass: string } | null = null;
  for (const poi of pois) {
    const meters = haversineMeters(origin, poi);
    if (!name && meters <= PIN_METERS && (!nearest || meters < nearest.meters))
      nearest = { meters, poiClass: poi.poiClass };
    if (name && meters <= NAMED_METERS && poi.names.some((candidate) => namesMatch(name, candidate)))
      if (!named || meters < named.meters) named = { meters, poiClass: poi.poiClass };
  }
  return inferTypeFromClass((named ?? nearest)?.poiClass);
}
