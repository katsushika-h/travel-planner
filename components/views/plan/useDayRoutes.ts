"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api-client";
import { decodePolyline } from "@/lib/polyline";
import {
  buildRouteRequest,
  buildSegmentRequest,
  chunkRequestLegs,
  coordinatesById,
  endpointResolver,
  legCacheKey,
  mergePlannedLegs,
  mergeRoutedLegs,
  parkingSpots,
  type RouteSlot,
  type TravelMode,
} from "@/lib/routed-legs";
import { planDay } from "@/lib/travel-clusters";
import { dayLegs } from "@/lib/travel-legs";
import type { TravelObject } from "@/types/travel";

const NO_OVERRIDES: Record<string, TravelMode> = {};

// Routed results by mode plus rounded coordinates, shared by every day section, the map and the Today mark,
// so scrolling back or showing the same day twice never refetches. `version` tells subscribed hooks to re-read it.
const routeCache = new Map<string, RouteSlot>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
let cacheVersion = 0;
function bumpCache() {
  cacheVersion++;
  listeners.forEach((listener) => listener());
}
function subscribeCache(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
const cacheSnapshot = () => cacheVersion;

/**
 * Routes a day's legs. Walk mode routes walkable legs as before; Drive mode plans walk/drive segments
 * (with the car's position and saved parking) and routes every segment. Results are cached by mode and coordinates.
 * Pass no stops to make no request (a section that is far from the viewport).
 */
export function useDayRoutes(
  /** The day's route stops in order (see `dayRouteStops`): hotels at the ends, no notes or all-day items between. */
  dayItems: TravelObject[],
  mode: TravelMode,
  overrides: Record<string, TravelMode> = NO_OVERRIDES,
) {
  const baseLegs = useMemo(() => dayLegs(dayItems), [dayItems]);
  const resolve = useMemo(() => endpointResolver(dayItems), [dayItems]);
  const planned = useMemo(
    () =>
      mode === "drive"
        ? planDay(baseLegs, "drive", { overrides, parkingStopIds: new Set(parkingSpots(dayItems).keys()) })
        : [],
    [baseLegs, dayItems, mode, overrides],
  );
  const walkRequest = useMemo(
    () => buildRouteRequest(baseLegs, "walk", coordinatesById(dayItems)),
    [baseLegs, dayItems],
  );
  const requestLegs = useMemo(
    () => (mode === "drive" ? buildSegmentRequest(planned, resolve) : walkRequest.legs),
    [mode, planned, resolve, walkRequest],
  );
  const requestKeys = useMemo(() => requestLegs.map(legCacheKey), [requestLegs]);
  const requestSignature = `${mode}|${requestKeys.join("|")}`;
  const version = useSyncExternalStore(subscribeCache, cacheSnapshot, cacheSnapshot);
  const routed = useMemo(() => {
    const found: Record<string, RouteSlot> = {};
    for (const key of requestKeys) {
      const slot = routeCache.get(key);
      if (slot) found[key] = slot;
    }
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` stands for the cache contents
  }, [requestKeys, version]);
  const [failedSignature, setFailedSignature] = useState<string | null>(null);

  useEffect(() => {
    // Legs another hook is already fetching arrive through the shared cache.
    const missing = requestLegs.filter((leg) => !routeCache.has(legCacheKey(leg)) && !inflight.has(legCacheKey(leg)));
    if (!missing.length) return;
    let live = true;
    void (async () => {
      let failed = false;
      for (const chunk of chunkRequestLegs(missing)) {
        chunk.forEach((leg) => inflight.add(legCacheKey(leg)));
        try {
          const { legs: slots } = await api.routeLegs(chunk);
          chunk.forEach((leg, index) => {
            const slot = slots[index];
            if (slot && !("error" in slot)) routeCache.set(legCacheKey(leg), slot);
            else failed = true;
          });
        } catch {
          failed = true;
        } finally {
          chunk.forEach((leg) => inflight.delete(legCacheKey(leg)));
          bumpCache();
        }
      }
      if (failed && live) setFailedSignature(requestSignature);
    })();
    // A response always fills the shared cache, even after this hook has gone; only the failure note is dropped.
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the request signature, so a failure is not retried in a loop
  }, [requestSignature]);

  const legs = useMemo(
    () =>
      mode === "drive"
        ? mergePlannedLegs(baseLegs, planned, resolve, routed)
        : mergeRoutedLegs(
            baseLegs,
            "walk",
            walkRequest.selected,
            requestKeys.map((key) => routed[key]),
          ),
    [baseLegs, mode, planned, resolve, routed, walkRequest, requestKeys],
  );
  const mapLegs = useMemo(
    () =>
      legs.flatMap((leg) => {
        if (leg.kind === "planned") {
          return (leg.segments ?? []).flatMap((segment, index) =>
            segment.geometry
              ? [
                  {
                    id: `${leg.fromId}>${leg.toId}:${index}`,
                    positions: decodePolyline(segment.geometry),
                    mode: segment.mode,
                  },
                ]
              : [],
          );
        }
        return leg.kind === "routed" && leg.geometry
          ? [{ id: `${leg.fromId}>${leg.toId}`, positions: decodePolyline(leg.geometry), mode: leg.mode }]
          : [];
      }),
    [legs],
  );
  return { legs, mapLegs, planned, estimatedNote: failedSignature !== null && failedSignature === requestSignature };
}
