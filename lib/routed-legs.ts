import type { TravelObject } from "../types/travel.ts";
import { CLUSTER_WALK_METERS, type Endpoint, type PlannedLeg } from "./travel-clusters.ts";
import { estimateWalk, haversineMeters, type LatLng, type TravelLeg } from "./travel-legs.ts";

/** Pure helpers that choose which legs to route, build the /api/route-legs body and merge the response. */

export type TravelMode = "walk" | "drive";
/** The server accepts at most this many legs per request. */
export const MAX_ROUTE_LEGS = 25;

type OkLeg = Extract<TravelLeg, { status: "ok" }>;
export type RouteRequestLeg = { from: LatLng; to: LatLng; mode: TravelMode };
export type RouteSlot = { meters: number; seconds: number; geometry: string; cached?: boolean } | { error: string };

/** One planned segment of a Drive-mode leg. `estimate` is straight-line: a walking estimate, or distance only for driving. */
export type DisplaySegment = {
  role: "leg" | "to-car" | "from-parking";
  mode: TravelMode;
  state: "routed" | "estimate";
  meters: number;
  /** Absent for a driving estimate, which has no time. */
  seconds?: number;
  geometry?: string;
};

export type DisplayLeg = {
  fromId: string;
  toId: string;
  /** "planned" is a Drive-mode leg made of `segments`. */
  kind: "estimate" | "routed" | "far" | "unmapped" | "transfer" | "planned";
  /** Mode of a routed result (the planned mode for "planned"); estimates and far legs are straight-line walking figures. */
  mode: TravelMode;
  meters?: number;
  seconds?: number;
  geometry?: string;
  segments?: DisplaySegment[];
  /** "planned" only: the mode used when the leg has no override. */
  defaultMode?: TravelMode;
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

export type EndpointResolver = (endpoint: Endpoint) => LatLng | null;

function validPoint(point: { lat?: unknown; lng?: unknown } | null | undefined): LatLng | null {
  const lat = point?.lat;
  const lng = point?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Saved parking spots with valid coordinates, by the id of the stop they belong to. */
export function parkingSpots(items: readonly TravelObject[]) {
  const spots = new Map<string, LatLng & { name: string | null }>();
  for (const item of items) {
    const point = validPoint(item.location?.parking);
    if (point) spots.set(item.id, { ...point, name: item.location?.parking?.name?.trim() || null });
  }
  return spots;
}

/** Resolves a stop to its location and a parking endpoint to that stop's saved parking spot. */
export function endpointResolver(items: readonly TravelObject[]): EndpointResolver {
  const stops = coordinatesById(items);
  const spots = parkingSpots(items);
  return (endpoint) => {
    const point = endpoint.kind === "stop" ? stops.get(endpoint.id) : spots.get(endpoint.id);
    return point ? { lat: point.lat, lng: point.lng } : null;
  };
}

/** Every distinct segment of the planned legs as request body legs, in order. */
export function buildSegmentRequest(planned: readonly PlannedLeg[], resolve: EndpointResolver): RouteRequestLeg[] {
  const seen = new Set<string>();
  const body: RouteRequestLeg[] = [];
  for (const leg of planned) {
    for (const segment of leg.segments) {
      const from = resolve(segment.from);
      const to = resolve(segment.to);
      if (!from || !to) continue;
      const entry = { from, to, mode: segment.mode };
      const key = legCacheKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      body.push(entry);
    }
  }
  return body;
}

/** Splits request legs into batches the server accepts. */
export function chunkRequestLegs<T>(legs: readonly T[], size = MAX_ROUTE_LEGS): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < legs.length; i += size) chunks.push(legs.slice(i, i + size));
  return chunks;
}

/** One display entry per leg for Drive mode. `routed` is keyed by `legCacheKey`; missing entries are estimates. */
export function mergePlannedLegs(
  legs: readonly TravelLeg[],
  planned: readonly PlannedLeg[],
  resolve: EndpointResolver,
  routed: Readonly<Record<string, RouteSlot | undefined>>,
): DisplayLeg[] {
  return legs.map((leg, index): DisplayLeg => {
    const ids = { fromId: leg.fromId, toId: leg.toId };
    if (leg.status !== "ok") return { ...ids, kind: leg.status, mode: "walk" };
    const plan = planned[index];
    const segments: DisplaySegment[] = [];
    for (const segment of plan?.segments ?? []) {
      const from = resolve(segment.from);
      const to = resolve(segment.to);
      if (!from || !to) continue;
      const base = { role: segment.role, mode: segment.mode };
      const slot = routed[legCacheKey({ from, to, mode: segment.mode })];
      if (slot && !("error" in slot)) {
        segments.push({
          ...base,
          state: "routed",
          meters: slot.meters,
          seconds: slot.seconds,
          geometry: slot.geometry,
        });
        continue;
      }
      const straight = haversineMeters(from, to);
      if (segment.mode === "walk") segments.push({ ...base, state: "estimate", ...estimateWalk(straight) });
      else segments.push({ ...base, state: "estimate", meters: straight });
    }
    return {
      ...ids,
      kind: "planned",
      mode: plan?.mode ?? "walk",
      defaultMode: leg.meters <= CLUSTER_WALK_METERS ? "walk" : "drive",
      segments,
    };
  });
}

/** Drive-mode day totals: driving versus all walking segments. A driving estimate has no time, so it only marks the total approximate. */
export function drivePlanTotals(legs: readonly DisplayLeg[]) {
  const total = {
    drive: { seconds: 0, counted: 0, approximate: false },
    walk: { seconds: 0, counted: 0, approximate: false },
  };
  for (const leg of legs) {
    for (const segment of leg.segments ?? []) {
      const bucket = total[segment.mode];
      if (segment.seconds !== undefined) {
        bucket.seconds += segment.seconds;
        bucket.counted++;
      }
      if (segment.state === "estimate") bucket.approximate = true;
    }
  }
  return total;
}
