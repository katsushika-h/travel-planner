import { findNearby } from "@/lib/nearby-client";
import { NEARBY_CATEGORIES, NEARBY_RADIUS, type NearbyCategory } from "@/lib/nearby-places";

export const dynamic = "force-dynamic";

function readCoordinate(value: string | null, limit: number) {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = readCoordinate(params.get("lat"), 90);
  const lng = readCoordinate(params.get("lng"), 180);
  if (lat === null || lng === null)
    return Response.json({ error: "lat and lng must be valid coordinates." }, { status: 400 });

  const radiusText = params.get("radius") ?? "";
  const radius = /^\d+$/.test(radiusText) ? Number(radiusText) : NaN;
  if (!(radius >= NEARBY_RADIUS.min && radius <= NEARBY_RADIUS.max))
    return Response.json(
      { error: `radius must be an integer from ${NEARBY_RADIUS.min} to ${NEARBY_RADIUS.max}.` },
      { status: 400 },
    );

  const category = NEARBY_CATEGORIES.find((entry) => entry.id === params.get("category"))?.id as
    NearbyCategory | undefined;
  if (!category)
    return Response.json(
      { error: `category must be one of ${NEARBY_CATEGORIES.map((entry) => entry.id).join(", ")}.` },
      { status: 400 },
    );

  try {
    return Response.json({ features: await findNearby(lat, lng, radius, category) });
  } catch {
    return Response.json({ error: "Nearby lookup failed." }, { status: 502 });
  }
}
