import type { LocationData } from "@/types/travel";

/** Whether a saved location can be placed on the map. */
export function hasMapCoordinates(location: LocationData | null | undefined) {
  const { lat, lng } = location ?? {};
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}
