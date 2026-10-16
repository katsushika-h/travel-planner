import type { TravelObject } from "../types/travel.ts";

/** Pure straight-line distance and walking-time helpers for consecutive stops in a day; no React or network. */

export const WALK_DETOUR_FACTOR = 1.3;
export const WALK_SPEED_KMH = 4.8;

const EARTH_RADIUS_METERS = 6371008.8;

export type LatLng = { lat: number; lng: number };

export type TravelLeg =
  | { fromId: string; toId: string; status: "ok"; meters: number; seconds: number }
  | { fromId: string; toId: string; status: "unmapped" }
  | { fromId: string; toId: string; status: "transfer" };

/** Great-circle distance in metres between two points. */
export function haversineMeters(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Walking estimate: straight-line metres inflated by the detour factor, timed at the walking speed. */
export function estimateWalk(meters: number) {
  const walked = meters * WALK_DETOUR_FACTOR;
  return { meters: walked, seconds: walked / ((WALK_SPEED_KMH * 1000) / 3600) };
}

function coordinates(item: TravelObject): LatLng | null {
  const lat = item.location?.lat;
  const lng = item.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function isTransfer(item: TravelObject) {
  return item.type === "commute" || item.type === "flight";
}

/** One leg per adjacent pair of a day's items (already in display order); notes are skipped. */
export function dayLegs(items: readonly TravelObject[]): TravelLeg[] {
  const stops = items.filter((item) => item.kind !== "note");
  const legs: TravelLeg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1];
    const to = stops[i];
    const ids = { fromId: from.id, toId: to.id };
    if (isTransfer(from) || isTransfer(to)) {
      legs.push({ ...ids, status: "transfer" });
      continue;
    }
    const a = coordinates(from);
    const b = coordinates(to);
    if (!a || !b) {
      legs.push({ ...ids, status: "unmapped" });
      continue;
    }
    legs.push({ ...ids, status: "ok", ...estimateWalk(haversineMeters(a, b)) });
  }
  return legs;
}

/** "850 m" under a kilometre (nearest 10 m), otherwise "1.2 km". */
export function formatDistance(meters: number) {
  const rounded = Math.round(meters / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Minutes rounded up (at least 1 for any positive time): "4 min" or "1 h 05 min". */
export function formatDuration(seconds: number) {
  const minutes = seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** Summed walking totals of the mapped legs; `skipped` counts unmapped legs (transfers are intentional). */
export function dayTotals(legs: readonly TravelLeg[]) {
  let meters = 0;
  let seconds = 0;
  let skipped = 0;
  for (const leg of legs) {
    if (leg.status === "ok") {
      meters += leg.meters;
      seconds += leg.seconds;
    } else if (leg.status === "unmapped") skipped++;
  }
  return { meters, seconds, skipped };
}
