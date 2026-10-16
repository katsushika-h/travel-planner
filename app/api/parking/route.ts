import { findParking } from "@/lib/parking-client";

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

  try {
    return Response.json({ parking: await findParking(lat, lng) });
  } catch {
    return Response.json({ error: "Parking lookup failed." }, { status: 502 });
  }
}
