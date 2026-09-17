import { readJsonBody, readTrimmedString } from "@/lib/api-validation";

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

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const rawUrl = readTrimmedString(body.url, "url")!;
    let current = new URL(rawUrl);
    if (current.protocol !== "https:" || !allowedHost(current.hostname)) throw new Error("Paste a Google Maps link that begins with https://.");

    for (let hop = 0; hop < 6; hop += 1) {
      const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { Accept: "text/html,application/xhtml+xml" } });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, current);
        if (next.protocol !== "https:" || !allowedHost(next.hostname)) throw new Error("The link redirected outside Google Maps.");
        current = next;
        continue;
      }
      if (!response.ok) throw new Error("Google Maps could not resolve that link.");
      return Response.json({ expandedUrl: current.toString(), name: nameFromMapsUrl(current) });
    }
    throw new Error("This Maps link redirected too many times.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to resolve Maps link." }, { status: 400 });
  }
}
