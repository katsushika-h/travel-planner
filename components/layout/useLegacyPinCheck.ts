"use client";

import { useEffect, useRef } from "react";
import { recalculateTripMapPins } from "@/lib/google-maps-recalculate";
import type { TravelObject } from "@/types/travel";

const checkedKey = (tripId: string) => `pins-checked:v1:${tripId}`;

function alreadyChecked(tripId: string) {
  try {
    return localStorage.getItem(checkedKey(tripId)) !== null;
  } catch {
    // Without storage the check would run on every visit, so treat the trip as checked.
    return true;
  }
}

function markChecked(tripId: string) {
  try {
    localStorage.setItem(checkedKey(tripId), new Date().toISOString());
  } catch {
    // The check simply runs again on a later visit.
  }
}

/**
 * Saved Maps links can carry pins that were mis-parsed before links were resolved on save. Each trip's links
 * are re-resolved once, in the background, the first time its items load. Trips with a failed link are retried
 * on a later visit.
 */
export function useLegacyPinCheck({
  tripId,
  itemsLoaded,
  onUpdated,
  onNotice,
}: {
  tripId: string | null;
  itemsLoaded: boolean;
  onUpdated: (items: TravelObject[]) => void;
  onNotice: (message: string) => void;
}) {
  const tripIdRef = useRef(tripId);
  const callbacksRef = useRef({ onUpdated, onNotice });
  const startedRef = useRef(new Set<string>());

  useEffect(() => {
    tripIdRef.current = tripId;
    callbacksRef.current = { onUpdated, onNotice };
  }, [tripId, onUpdated, onNotice]);

  useEffect(() => {
    if (!tripId || !itemsLoaded || startedRef.current.has(tripId) || alreadyChecked(tripId)) return;
    startedRef.current.add(tripId);
    recalculateTripMapPins(tripId, () => {})
      .then(({ updated, cleared, failed }) => {
        if (failed === 0) markChecked(tripId);
        // The trip may have changed while the links were resolving; its pins are saved either way.
        if (tripIdRef.current !== tripId || !updated.length) return;
        callbacksRef.current.onUpdated(updated);
        const moved = updated.length - cleared;
        const parts = [
          moved ? `Updated ${moved} map ${moved === 1 ? "pin" : "pins"} from their Maps links.` : "",
          cleared ? `Removed ${cleared} wrong map ${cleared === 1 ? "pin" : "pins"}.` : "",
        ];
        callbacksRef.current.onNotice(parts.filter(Boolean).join(" "));
      })
      .catch(() => {
        // Left unchecked; the next visit to this trip tries again.
      });
  }, [tripId, itemsLoaded]);
}
