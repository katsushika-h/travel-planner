"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { TravelObject, Trip } from "@/types/travel";

/** Own trip and item loading while leaving mutations with the workspace shell. */
export function useTripData(activeTripId: string | null, setActiveTripId: (id: string | null) => void, onError: (message: string) => void) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [items, setItems] = useState<TravelObject[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [itemsTripId, setItemsTripId] = useState<string | null>(null);
  const activeTrip = trips.find((trip) => trip.id === activeTripId) ?? null;
  const activeTripKey = activeTrip?.id;

  useEffect(() => {
    let cancelled = false;
    void api.trips().then((result) => {
      if (cancelled) return;
      setTrips(result);
      if (!result.some((trip) => trip.id === activeTripId)) setActiveTripId(result[0]?.id ?? null);
    }).catch((cause) => {
      if (!cancelled) onError(cause instanceof Error ? cause.message : "Could not load trips.");
    }).finally(() => {
      if (!cancelled) setLoadingTrips(false);
    });
    return () => { cancelled = true; };
  }, [activeTripId, onError, setActiveTripId]);

  useEffect(() => {
    if (!activeTripKey) return;
    let cancelled = false;
    void api.objects(activeTripKey).then((result) => {
      if (cancelled) return;
      setItems(result);
      setItemsTripId(activeTripKey);
    }).catch((cause) => {
      if (!cancelled) onError(cause instanceof Error ? cause.message : "Could not load itinerary.");
    });
    return () => { cancelled = true; };
  }, [activeTripKey, onError]);

  return { trips, setTrips, items, setItems, loadingTrips, itemsTripId, setItemsTripId, activeTrip };
}
