/** Place details shared by `app/api/place-details` and the Nearby view; pure, safe to import anywhere. */

export type OsmElementType = "node" | "way" | "relation";

export type PlaceDetails = {
  osmType: OsmElementType;
  osmId: number;
  name: string | null;
  nameEn: string | null;
  /** Wikidata's one-line English description. */
  description: string | null;
  /** English Wikipedia summary, when the place has an English article. */
  summary: { title: string; extract: string; url: string; thumbnailUrl: string | null } | null;
  /** A Wikipedia article in another language when there is no English one. */
  otherWikipedia: { language: string; title: string; url: string } | null;
  cuisine: string | null;
  openingHours: string | null;
  website: string | null;
  religion: string | null;
  osmUrl: string;
};

/** Planetiler (OpenFreeMap) encodes tile feature ids as OSM id × 10 + 1 (node), 2 (way) or 3 (relation). */
export function decodeTileFeatureId(id: unknown): { osmType: OsmElementType; osmId: number } | null {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  const osmType = ({ 1: "node", 2: "way", 3: "relation" } as const)[id % 10];
  const osmId = Math.floor(id / 10);
  return osmType && osmId > 0 ? { osmType, osmId } : null;
}

/** Google Maps search by name near a point, for reviews and photos OpenStreetMap does not have. */
export function mapsNameSearchUrl(name: string, lat: number, lng: number) {
  return `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat.toFixed(6)},${lng.toFixed(6)},18z`;
}
