import { fetchPlaceDetails, PlaceDetailsError } from "@/lib/place-details-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const idParam = params.get("id") ?? "";
  const id = /^\d+$/.test(idParam) ? Number(idParam) : NaN;
  if ((type !== "node" && type !== "way" && type !== "relation") || !Number.isSafeInteger(id) || id <= 0)
    return Response.json({ error: "type must be node, way or relation and id a positive integer." }, { status: 400 });

  try {
    return Response.json(await fetchPlaceDetails(type, id));
  } catch (error) {
    if (error instanceof PlaceDetailsError && error.kind === "not-found")
      return Response.json({ error: "Place not found." }, { status: 404 });
    return Response.json({ error: "Place details lookup failed." }, { status: 502 });
  }
}
