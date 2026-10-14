import { readJsonBody, readTrimmedString } from "@/lib/api-validation";
import { S2 } from "s2-geometry";

export const dynamic = "force-dynamic";

function allowedHost(hostname: string) {
  return (
    hostname === "maps.app.goo.gl" ||
    hostname === "goo.gl" ||
    hostname === "google.com" ||
    hostname === "www.google.com" ||
    hostname === "maps.google.com" ||
    hostname.endsWith(".google.com")
  );
}

function nameFromMapsUrl(url: URL) {
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/i)?.[1];
  const query = url.searchParams.get("query") ?? url.searchParams.get("q");
  const value = place ?? query;
  if (!value) return null;
  try {
    return decodeURIComponent(value.replace(/\+/g, " ")).replace(/_/g, " ").trim() || null;
  } catch {
    return value.replace(/\+/g, " ").trim() || null;
  }
}

type Coordinates = { lat: number; lng: number };

function coordinates(latValue: string, lngValue: string): Coordinates | null {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Accept a parameter only when its whole value is a coordinate pair, never numbers inside an address. */
function coordinatesFromValue(value: string) {
  const match = value.match(/^\s*(?:loc:\s*)?(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/i);
  return match ? coordinates(match[1], match[2]) : null;
}

function decodedMapsUrl(url: URL) {
  try {
    return decodeURIComponent(url.toString());
  } catch {
    return url.toString();
  }
}

function coordinatesFromParams(url: URL, keys: string[]) {
  for (const key of keys) {
    for (const [param, value] of url.searchParams) {
      if (param.toLowerCase() !== key) continue;
      const result = coordinatesFromValue(value);
      if (result) return result;
    }
  }
  return null;
}

function coordinatesFromLegacyFeatureId(decodedUrl: string): Coordinates | null {
  const featureId = decodedUrl.match(/(?:^|!)1s0x([0-9a-f]{1,16}):0x[0-9a-f]+(?:[!/?&#]|$)/i)?.[1];
  if (!featureId || /^0+$/.test(featureId)) return null;
  try {
    const point = S2.idToLatLng(BigInt(`0x${featureId}`).toString());
    return coordinates(String(point.lat), String(point.lng));
  } catch {
    return null;
  }
}

type RankedCoordinates = Coordinates & { rank: number; source: "url" | "featureId" };

/**
 * Best coordinates in one URL. Lower rank is more precise: the place pin, an explicit
 * location query, the place's feature id, then the map camera (@ or center), which
 * only describes the viewport and can sit far from the place.
 */
function coordinatesFromMapsUrl(url: URL): RankedCoordinates | null {
  const decodedUrl = decodedMapsUrl(url);
  let decodedPath = url.pathname;
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    /* inspect the path as-is */
  }
  const dataMatch = decodedUrl.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)(?:[!/?&#]|$)/);
  const atMatch = decodedPath.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:[,/]|$)/);
  const candidates: [number, "url" | "featureId", () => Coordinates | null][] = [
    [0, "url", () => (dataMatch ? coordinates(dataMatch[1], dataMatch[2]) : null)],
    [1, "url", () => coordinatesFromParams(url, ["query", "q", "destination", "daddr"])],
    [2, "featureId", () => coordinatesFromLegacyFeatureId(decodedUrl)],
    [3, "url", () => (atMatch ? coordinates(atMatch[1], atMatch[2]) : null)],
    [4, "url", () => coordinatesFromParams(url, ["center", "ll", "sll", "origin"])],
  ];
  for (const [rank, source, read] of candidates) {
    const result = read();
    if (result) return { ...result, rank, source };
  }
  return null;
}

/** Keep the most precise coordinates seen across redirect hops; later hops win ties. */
function better(current: RankedCoordinates | null, next: RankedCoordinates | null) {
  if (!next) return current;
  return !current || next.rank <= current.rank ? next : current;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const rawUrl = readTrimmedString(body.url, "url")!;
    let current = new URL(rawUrl);
    if (current.protocol !== "https:" || !allowedHost(current.hostname))
      throw new Error("Paste a Google Maps link that begins with https://.");
    let found = coordinatesFromMapsUrl(current);

    for (let hop = 0; hop < 6; hop += 1) {
      const response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, current);
        if (next.protocol !== "https:" || !allowedHost(next.hostname))
          throw new Error("The link redirected outside Google Maps.");
        current = next;
        found = better(found, coordinatesFromMapsUrl(current));
        continue;
      }
      if (!response.ok) throw new Error("Google Maps could not resolve that link.");
      return Response.json({
        expandedUrl: current.toString(),
        name: nameFromMapsUrl(current),
        lat: found?.lat ?? null,
        lng: found?.lng ?? null,
        coordinateSource: found?.source ?? null,
      });
    }
    throw new Error("This Maps link redirected too many times.");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to resolve Maps link." },
      { status: 400 },
    );
  }
}
