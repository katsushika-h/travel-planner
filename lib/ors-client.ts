/** Server-only OpenRouteService client. Import it only from route handlers: it reads `ORS_API_KEY`. */

export type OrsProfile = "foot-walking" | "driving-car";
export type OrsErrorKind = "missing-key" | "quota" | "unauthorized" | "upstream";
export type OrsRoute = { meters: number; seconds: number; geometry: string };
type Point = { lat: number; lng: number };

const ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions";
const MESSAGES: Record<OrsErrorKind, string> = {
  "missing-key": "Routing is not configured.",
  quota: "Routing quota reached.",
  unauthorized: "Routing key was rejected.",
  upstream: "Routing service failed.",
};

/** Typed ORS failure. Messages are fixed strings and never include the key. */
export class OrsError extends Error {
  readonly kind: OrsErrorKind;

  constructor(kind: OrsErrorKind) {
    super(MESSAGES[kind]);
    this.name = "OrsError";
    this.kind = kind;
  }
}

/** Fetch one routed leg from OpenRouteService. Coordinates are sent longitude first. */
export async function fetchOrsRoute(profile: OrsProfile, from: Point, to: Point): Promise<OrsRoute> {
  const key = process.env.ORS_API_KEY?.trim();
  if (!key) throw new OrsError("missing-key");

  let response: Response;
  try {
    response = await fetch(`${ORS_BASE_URL}/${profile}`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OrsError("upstream");
  }

  if (response.status === 429) throw new OrsError("quota");
  if (response.status === 401 || response.status === 403) throw new OrsError("unauthorized");
  if (!response.ok) throw new OrsError("upstream");

  const body = (await response.json().catch(() => null)) as {
    routes?: { summary?: { distance?: unknown; duration?: unknown }; geometry?: unknown }[];
  } | null;
  const route = body?.routes?.[0];
  const meters = route?.summary?.distance;
  const seconds = route?.summary?.duration;
  const geometry = route?.geometry;
  if (
    typeof meters !== "number" ||
    typeof seconds !== "number" ||
    !Number.isFinite(meters) ||
    !Number.isFinite(seconds) ||
    typeof geometry !== "string" ||
    !geometry
  )
    throw new OrsError("upstream");
  return { meters, seconds, geometry };
}
