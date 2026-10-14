import { api } from "./api-client.ts";
import { mapWithConcurrency } from "./google-maps-import.ts";
import type { TravelObject } from "../types/travel.ts";

/**
 * Re-resolve every saved Google Maps link in a trip and save pins that moved. Links can be the only
 * source of a pin, so a pin whose link resolves without coordinates was mis-parsed and is cleared;
 * the link itself is kept. Links that cannot be checked keep their pin.
 */
export async function recalculateTripMapPins(tripId: string, onProgress: (complete: number, total: number) => void) {
  const items = (await api.objects(tripId)).filter((item) => item.location?.googleMapsUrl?.trim());
  let complete = 0;
  let unchanged = 0;
  let unresolved = 0;
  let failed = 0;
  let cleared = 0;
  onProgress(0, items.length);
  const results = await mapWithConcurrency(items, 4, async (item): Promise<TravelObject | null> => {
    try {
      const location = item.location!;
      const result = await api.resolveMapsUrl(location.googleMapsUrl!.trim());
      if (result.lat == null || result.lng == null) {
        unresolved += 1;
        if (location.lat == null && location.lng == null) return null;
        const withoutPin = { ...location };
        delete withoutPin.lat;
        delete withoutPin.lng;
        cleared += 1;
        return await api.updateObject(item.id, { location: withoutPin });
      }
      if (result.lat === location.lat && result.lng === location.lng) {
        unchanged += 1;
        return null;
      }
      return await api.updateObject(item.id, { location: { ...location, lat: result.lat, lng: result.lng } });
    } catch {
      failed += 1;
      return null;
    } finally {
      complete += 1;
      onProgress(complete, items.length);
    }
  });
  const updated = results.filter((item): item is TravelObject => item !== null);
  return { total: items.length, updated, unchanged, unresolved, cleared, failed };
}
