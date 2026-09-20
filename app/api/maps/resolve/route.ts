import { readJsonBody, readTrimmedString } from "@/lib/api-validation";
import { S2 } from "s2-geometry";

export const dynamic = "force-dynamic";

function allowedHost(hostname: string) {
  return hostname === "maps.app.goo.gl" || hostname === "goo.gl" || hostname === "google.com" || hostname === "www.google.com" || hostname === "maps.google.com" || hostname.endsWith(".google.com");
}

function nameFromMapsUrl(url: URL) {
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/i)?.[1];
  const query = url.searchParams.get("query") ?? url.searchParams.get("q");
  const value = place ?? query;
  if (!value) return null;
  try { return decodeURIComponent(value.replace(/\+/g, " ")).replace(/_/g, " ").trim() || null; }
  catch { return value.replace(/\+/g, " ").trim() || null; }
}

type Coordinates = { lat: number; lng: number };

function coordinates(latValue: string, lngValue: string): Coordinates | null {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function coordinatesFromValue(value: string) {
  const match = value.match(/(?:^|[^\d.])(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)(?=$|[^\d.])/);
  return match ? coordinates(match[1], match[2]) : null;
}

function coordinatesFromMapsUrl(url: URL): Coordinates | null {
  let decodedUrl = url.toString();
  try { decodedUrl = decodeURIComponent(decodedUrl); } catch { /* inspect the URL as-is */ }

  const atCoordinates = decodedUrl.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:[,/?&#]|$)/);
  if (atCoordinates) {
    const result = coordinates(atCoordinates[1], atCoordinates[2]);
    if (result) return result;
  }

  const dataCoordinates = decodedUrl.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)(?:[!/?&#]|$)/);
  if (dataCoordinates) {
    const result = coordinates(dataCoordinates[1], dataCoordinates[2]);
    if (result) return result;
  }

  const coordinateParams = ["query", "q", "center", "ll", "sll", "destination", "origin", "daddr"];
  for (const [key, value] of url.searchParams) {
    if (!coordinateParams.includes(key.toLowerCase())) continue;
    const result = coordinatesFromValue(value);
    if (result) return result;
  }
  return null;
}

function coordinatesFromLegacyFeatureId(url: URL): Coordinates | null {
  let decodedUrl = url.toString();
  try { decodedUrl = decodeURIComponent(decodedUrl); } catch { /* inspect the URL as-is */ }
  const featureId = decodedUrl.match(/(?:^|!)1s0x([0-9a-f]{1,16}):0x[0-9a-f]+(?:[!/?&#]|$)/i)?.[1];
  if (!featureId || /^0+$/.test(featureId)) return null;
  try {
    const point = S2.idToLatLng(BigInt(`0x${featureId}`).toString());
    return coordinates(String(point.lat), String(point.lng));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const rawUrl = readTrimmedString(body.url, "url")!;
    let current = new URL(rawUrl);
    if (current.protocol !== "https:" || !allowedHost(current.hostname)) throw new Error("Paste a Google Maps link that begins with https://.");
    let foundCoordinates = coordinatesFromMapsUrl(current);
    let coordinateSource: "url" | "featureId" | null = foundCoordinates ? "url" : null;
    if (!foundCoordinates) {
      foundCoordinates = coordinatesFromLegacyFeatureId(current);
      if (foundCoordinates) coordinateSource = "featureId";
    }

    for (let hop = 0; hop < 6; hop += 1) {
      const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { Accept: "text/html,application/xhtml+xml" } });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, current);
        if (next.protocol !== "https:" || !allowedHost(next.hostname)) throw new Error("The link redirected outside Google Maps.");
        current = next;
        const explicitCoordinates = coordinatesFromMapsUrl(current);
        if (explicitCoordinates) { foundCoordinates = explicitCoordinates; coordinateSource = "url"; }
        else if (!foundCoordinates) { foundCoordinates = coordinatesFromLegacyFeatureId(current); if (foundCoordinates) coordinateSource = "featureId"; }
        continue;
      }
      if (!response.ok) throw new Error("Google Maps could not resolve that link.");
      const explicitCoordinates = coordinatesFromMapsUrl(current);
      if (explicitCoordinates) { foundCoordinates = explicitCoordinates; coordinateSource = "url"; }
      else if (!foundCoordinates) { foundCoordinates = coordinatesFromLegacyFeatureId(current); if (foundCoordinates) coordinateSource = "featureId"; }
      return Response.json({ expandedUrl: current.toString(), name: nameFromMapsUrl(current), lat: foundCoordinates?.lat ?? null, lng: foundCoordinates?.lng ?? null, coordinateSource });
    }
    throw new Error("This Maps link redirected too many times.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to resolve Maps link." }, { status: 400 });
  }
}
