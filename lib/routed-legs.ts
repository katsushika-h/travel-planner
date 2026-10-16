import type { TravelObject } from "../types/travel.ts";
import type { LatLng, TravelLeg } from "./travel-legs.ts";

/** Pure helpers that choose which legs to route, build the /api/route-legs body and merge the response. */

export type TravelMode = "walk" | "drive";
/** The server accepts at most this many legs per request. */
export const MAX_ROUTE_LEGS = 25;

type OkLeg = Extract<TravelLeg, { status: "ok" }>;
export type RouteRequestLeg = { from: LatLng; to: LatLng; mode: TravelMode };
export type RouteSlot = { meters: number; seconds: number; geometry: string; cached?: boolean } | { error: string };

export type DisplayLeg = {
  fromId: string;
  toId: string;
  kind: "estimate" | "routed" | "far" | "unmapped" | "transfer";
  /** Mode of a routed result; estimates and far legs are straight-line walking figures. */
  mode: TravelMode;
  meters?: number;
  seconds?: number;
  geometry?: string;
};

export function coordinatesById(items: readonly TravelObject[]) {
  const coords = new Map<string, LatLng>();
  for (const item of items) {
    const lat = item.location?.lat;
    const lng = item.location?.lng;
    if (typeof lat === "number" && typeof lng === "number") coords.set(item.id, { lat, lng });
  }
  return coords;
}

/** Walk mode routes walkable "ok" legs only; drive mode routes every "ok" leg. Capped at MAX_ROUTE_LEGS. */
export function selectRoutableLegs(legs: readonly TravelLeg[], mode: TravelMode) {
  const selected: OkLeg[] = [];
  for (const leg of legs) {
    if (leg.status !== "ok") continue;
    if (mode === "walk" && !leg.walkable) continue;
    selected.push(leg);
    if (selected.length === MAX_ROUTE_LEGS) break;
  }
  return selected;
}

/** The selected legs and their request body legs, in order. */
export function buildRouteRequest(legs: readonly TravelLeg[], mode: TravelMode, coords: ReadonlyMap<string, LatLng>) {
  const selected: OkLeg[] = [];
  const body: RouteRequestLeg[] = [];
  for (const leg of selectRoutableLegs(legs, mode)) {
    const from = coords.get(leg.fromId);
    const to = coords.get(leg.toId);
    if (!from || !to) continue;
    selected.push(leg);
    body.push({ from, to, mode });
  }
  return { selected, legs: body };
}

/** Merges response slots (matching `selected` by position) into one display entry per leg. */
export function mergeRoutedLegs(
  legs: readonly TravelLeg[],
  mode: TravelMode,
  selected: readonly OkLeg[],
  slots: readonly (RouteSlot | null | undefined)[],
): DisplayLeg[] {
  const routed = new Map<string, RouteSlot | null | undefined>();
  selected.forEach((leg, index) => routed.set(`${leg.fromId}>${leg.toId}`, slots[index]));
  return legs.map((leg): DisplayLeg => {
    const ids = { fromId: leg.fromId, toId: leg.toId };
    if (leg.status !== "ok") return { ...ids, kind: leg.status, mode: "walk" };
    const slot = routed.get(`${leg.fromId}>${leg.toId}`);
    if (slot && !("error" in slot)) {
      return { ...ids, kind: "routed", mode, meters: slot.meters, seconds: slot.seconds, geometry: slot.geometry };
    }
    return {
      ...ids,
      kind: leg.walkable ? "estimate" : "far",
      mode: "walk",
      meters: leg.meters,
      seconds: leg.seconds,
    };
  });
}

/** Day total of routed legs and walkable estimates; `approximate` is true when any counted leg is an estimate. */
export function displayTotals(legs: readonly DisplayLeg[]) {
  let seconds = 0;
  let counted = 0;
  let approximate = false;
  for (const leg of legs) {
    if (leg.kind === "routed" || leg.kind === "estimate") {
      seconds += leg.seconds ?? 0;
      counted++;
      if (leg.kind === "estimate") approximate = true;
    }
  }
  return { seconds, counted, approximate };
}

const round = (value: number) => value.toFixed(5);

/** Cache key for one routed leg: mode plus coordinates rounded to 5 decimals. */
export function legCacheKey(leg: RouteRequestLeg) {
  return `${leg.mode}:${round(leg.from.lat)},${round(leg.from.lng)}>${round(leg.to.lat)},${round(leg.to.lng)}`;
}
