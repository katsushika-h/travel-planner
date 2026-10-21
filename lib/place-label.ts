import type { TravelObject } from "@/types/travel";

/** The place name or address worth showing next to the title; null when it only repeats the title. */
export function placeLabel(item: Pick<TravelObject, "title" | "location">): string | null {
  const place = (item.location?.name?.trim() || item.location?.address?.trim()) ?? "";
  if (!place || place.toLowerCase() === item.title.trim().toLowerCase()) return null;
  return place;
}
