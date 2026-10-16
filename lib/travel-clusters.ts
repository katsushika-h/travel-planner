import type { TravelLeg } from "./travel-legs.ts";

/** Pure walk/drive planning for a day's legs, tracking where the car is parked; no React or network. */

/** Legs at or under this (detour-adjusted walking) distance are walked in Drive mode; about 1.5 km straight-line. */
export const CLUSTER_WALK_METERS = 2000;

export type Endpoint = { kind: "stop"; id: string } | { kind: "parking"; id: string };

export type Segment = {
  mode: "walk" | "drive";
  from: Endpoint;
  to: Endpoint;
  role: "leg" | "to-car" | "from-parking";
};

export type PlannedLeg = {
  fromId: string;
  toId: string;
  status: TravelLeg["status"];
  mode: "walk" | "drive" | null;
  segments: Segment[];
};

/** Groups consecutive stop ids; a hop joins the cluster only if it is an "ok" leg within walkMeters. */
export function clusterDay(
  legs: readonly TravelLeg[],
  { walkMeters = CLUSTER_WALK_METERS }: { walkMeters?: number } = {},
): string[][] {
  if (legs.length === 0) return [];
  const clusters: string[][] = [[legs[0].fromId]];
  for (const leg of legs) {
    if (leg.status === "ok" && leg.meters <= walkMeters) clusters[clusters.length - 1].push(leg.toId);
    else clusters.push([leg.toId]);
  }
  return clusters;
}

const stop = (id: string): Endpoint => ({ kind: "stop", id });
const parking = (id: string): Endpoint => ({ kind: "parking", id });
const same = (a: Endpoint, b: Endpoint) => a.kind === b.kind && a.id === b.id;

/**
 * Plans each leg as walk/drive segments. In Drive mode the car stays where it was last parked, so a drive
 * after a walk first returns to the car (and from a saved parking spot walks to the stop afterwards).
 * Overrides are keyed "fromId>toId" and apply in Drive mode only.
 */
export function planDay(
  legs: readonly TravelLeg[],
  mode: "walk" | "drive",
  {
    overrides = {},
    parkingStopIds = new Set<string>(),
    walkMeters = CLUSTER_WALK_METERS,
  }: {
    overrides?: Record<string, "walk" | "drive">;
    parkingStopIds?: ReadonlySet<string>;
    walkMeters?: number;
  } = {},
): PlannedLeg[] {
  const placeOf = (id: string): Endpoint => (parkingStopIds.has(id) ? parking(id) : stop(id));
  let car: Endpoint | null = legs.length > 0 ? placeOf(legs[0].fromId) : null;

  return legs.map((leg): PlannedLeg => {
    const base = { fromId: leg.fromId, toId: leg.toId, status: leg.status };
    if (leg.status !== "ok") {
      car = placeOf(leg.toId);
      return { ...base, mode: null, segments: [] };
    }
    const from = stop(leg.fromId);
    const to = stop(leg.toId);
    if (mode === "walk") {
      return { ...base, mode: "walk", segments: [{ mode: "walk", from, to, role: "leg" }] };
    }
    const legMode = overrides[`${leg.fromId}>${leg.toId}`] ?? (leg.meters <= walkMeters ? "walk" : "drive");
    if (legMode === "walk") {
      return { ...base, mode: "walk", segments: [{ mode: "walk", from, to, role: "leg" }] };
    }
    const segments: Segment[] = [];
    const start = car ?? placeOf(leg.fromId);
    if (!same(start, from)) segments.push({ mode: "walk", from, to: start, role: "to-car" });
    const dest = placeOf(leg.toId);
    segments.push({ mode: "drive", from: start, to: dest, role: "leg" });
    if (dest.kind === "parking") segments.push({ mode: "walk", from: dest, to, role: "from-parking" });
    car = dest;
    return { ...base, mode: "drive", segments };
  });
}
