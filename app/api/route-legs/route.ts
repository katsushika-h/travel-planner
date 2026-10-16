import { fetchOrsRoute, OrsError, type OrsErrorKind } from "@/lib/ors-client";
import { prisma } from "@/lib/prisma";
import { profileForMode, readRouteLegsBody } from "@/lib/route-leg-validation";

export const dynamic = "force-dynamic";

const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
const LEG_ERRORS: Record<Exclude<OrsErrorKind, "missing-key">, string> = {
  quota: "Routing quota reached.",
  unauthorized: "Routing key was rejected.",
  upstream: "Routing service failed.",
};

type LegResult = { meters: number; seconds: number; geometry: string; cached: boolean } | { error: string };

export async function POST(request: Request) {
  let legs;
  try {
    legs = await readRouteLegsBody(request);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: 400 });
  }
  if (!process.env.ORS_API_KEY?.trim()) return Response.json({ error: "Routing is not configured." }, { status: 503 });

  const results: LegResult[] = [];
  // After a quota or key failure every further ORS call would fail the same way.
  let blocked: LegResult | null = null;

  for (const { from, to, mode } of legs) {
    const profile = profileForMode(mode);
    const where = { profile, fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng };
    try {
      const row = await prisma.routeLeg.findUnique({ where: { profile_fromLat_fromLng_toLat_toLng: where } });
      if (row && Date.now() - row.createdAt.getTime() < STALE_AFTER_MS) {
        results.push({ meters: row.meters, seconds: row.seconds, geometry: row.geometry, cached: true });
        continue;
      }
      if (blocked) {
        results.push(blocked);
        continue;
      }
      const route = await fetchOrsRoute(profile, from, to);
      await prisma.routeLeg.upsert({
        where: { profile_fromLat_fromLng_toLat_toLng: where },
        create: { ...where, ...route },
        update: { ...route, createdAt: new Date() },
      });
      results.push({ ...route, cached: false });
    } catch (error) {
      const kind = error instanceof OrsError ? error.kind : "upstream";
      if (kind === "missing-key") return Response.json({ error: "Routing is not configured." }, { status: 503 });
      const result = { error: LEG_ERRORS[kind] };
      if (kind === "quota" || kind === "unauthorized") blocked = result;
      results.push(result);
    }
  }
  return Response.json({ legs: results });
}
