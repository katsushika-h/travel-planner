"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Routes a day's legs. Walk mode routes walkable legs as before; Drive mode plans walk/drive segments
 * (with the car's position and saved parking) and routes every segment. Results are cached by mode and coordinates.
 */
export function useDayRoutes(
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
  // Routed results by mode plus rounded coordinates, so switching days back and forth does not refetch.
  const cacheRef = useRef(new Map<string, RouteSlot>());
  const [routed, setRouted] = useState<Record<string, RouteSlot>>({});
  const [failedSignature, setFailedSignature] = useState<string | null>(null);

  useEffect(() => {
    const cache = cacheRef.current;
    const missing = requestLegs.filter((leg) => !cache.has(legCacheKey(leg)));
    if (!missing.length) return;
    const controller = new AbortController();
    void (async () => {
      let failed = false;
      for (const chunk of chunkRequestLegs(missing)) {
        try {
          const { legs: slots } = await api.routeLegs(chunk, controller.signal);
          if (controller.signal.aborted) return;
          chunk.forEach((leg, index) => {
            const slot = slots[index];
            if (slot && !("error" in slot)) cache.set(legCacheKey(leg), slot);
            else failed = true;
          });
          setRouted(Object.fromEntries(cache));
        } catch {
          if (controller.signal.aborted) return;
          failed = true;
        }
      }
      if (failed && !controller.signal.aborted) setFailedSignature(requestSignature);
    })();
    // Aborting on cleanup drops stale responses after a day or mode switch.
    return () => controller.abort();
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
