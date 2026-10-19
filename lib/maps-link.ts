/** Parse clipboard text as a single Google Maps URL, or return null. */
export function parseMapsUrl(text: string): URL | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (host === "maps.app.goo.gl") return url;
  if (host === "goo.gl") return path.startsWith("/maps") ? url : null;
  if (/^maps\.google\.[a-z.]+$/.test(host)) return url;
  if (/^(www\.)?google\.[a-z.]+$/.test(host)) return path.startsWith("/maps") ? url : null;
  return null;
}

export function isGoogleMapsUrl(text: string) {
  return parseMapsUrl(text) !== null;
}

/** Place name from /maps/place/<Name>/ (decoded, + as space), or null. */
export function placeNameFromMapsUrl(text: string): string | null {
  const url = parseMapsUrl(text);
  const raw = url?.pathname.match(/\/maps\/place\/([^/]+)/i)?.[1];
  if (!raw) return null;
  const spaced = raw.replace(/\+/g, " ");
  let name: string;
  try {
    name = decodeURIComponent(spaced);
  } catch {
    name = spaced;
  }
  name = name.trim();
  // A bare coordinate pair is not a name.
  if (!name || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(name)) return null;
  return name;
}
