import { isRecord, readJsonBody } from "@/lib/api-validation";

export const MAX_ROUTE_LEGS = 25;
export type RouteMode = "walk" | "drive";
export type RouteProfile = "foot-walking" | "driving-car";
export type RoutePoint = { lat: number; lng: number };
export type RouteLegRequest = { from: RoutePoint; to: RoutePoint; mode: RouteMode };

const PROFILES: Record<RouteMode, RouteProfile> = { walk: "foot-walking", drive: "driving-car" };

export function profileForMode(mode: RouteMode) {
  return PROFILES[mode];
}

/** Round to 5 decimals (about 1 m) so nearby requests share one cache row. */
export function roundCoordinate(value: number) {
  return Math.round(value * 1e5) / 1e5;
}

function readPoint(value: unknown, field: string): RoutePoint {
  if (!isRecord(value)) throw new Error(`${field} must be an object with lat and lng.`);
  const { lat, lng } = value;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90)
    throw new Error(`${field}.lat must be a number between -90 and 90.`);
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180)
    throw new Error(`${field}.lng must be a number between -180 and 180.`);
  return { lat: roundCoordinate(lat), lng: roundCoordinate(lng) };
}

/** Parse the route-legs request body; coordinates come back rounded to 5 decimals. */
export async function readRouteLegsBody(request: Request): Promise<RouteLegRequest[]> {
  const body = await readJsonBody(request);
  if (!Array.isArray(body.legs) || body.legs.length < 1 || body.legs.length > MAX_ROUTE_LEGS)
    throw new Error(`legs must be an array of 1 to ${MAX_ROUTE_LEGS} legs.`);
  return body.legs.map((leg: unknown, index: number) => {
    if (!isRecord(leg)) throw new Error(`legs[${index}] must be an object.`);
    if (leg.mode !== "walk" && leg.mode !== "drive") throw new Error(`legs[${index}].mode must be "walk" or "drive".`);
    return {
      from: readPoint(leg.from, `legs[${index}].from`),
      to: readPoint(leg.to, `legs[${index}].to`),
      mode: leg.mode,
    };
  });
}
