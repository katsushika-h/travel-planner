"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { TravelObject, Trip } from "@/types/travel";

/** Own trip and item loading while leaving mutations with the workspace shell. */
export function useTripData(activeTripId: string | null, setActiveTripId: (id: string | null) => void) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [items, setItems] = useState<TravelObject[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripsLoadError, setTripsLoadError] = useState<string | null>(null);
  const [tripsReloadNonce, setTripsReloadNonce] = useState(0);
  const [itemsTripId, setItemsTripId] = useState<string | null>(null);
  const [itemsLoadError, setItemsLoadError] = useState<string | null>(null);
  const [itemsReloadNonce, setItemsReloadNonce] = useState(0);
  const activeTrip = trips.find((trip) => trip.id === activeTripId) ?? null;
  const activeTripKey = activeTrip?.id;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    void api.trips(controller.signal).then((result) => {
      if (cancelled) return;
      setTrips(result);
      setTripsLoadError(null);
      if (!result.some((trip) => trip.id === activeTripId)) setActiveTripId(result[0]?.id ?? null);
    }).catch((cause) => {
      if (!cancelled) setTripsLoadError(controller.signal.aborted ? "The trip request timed out. Check your connection and try again." : cause instanceof Error ? cause.message : "Could not load trips.");
    }).finally(() => {
      window.clearTimeout(timeout);
      if (!cancelled) setLoadingTrips(false);
    });
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [activeTripId, setActiveTripId, tripsReloadNonce]);

  useEffect(() => {
    if (!activeTripKey) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    void api.objects(activeTripKey, controller.signal).then((result) => {
      if (cancelled) return;
      setItems(result);
      setItemsLoadError(null);
      setItemsTripId(activeTripKey);
    }).catch((cause) => {
      if (!cancelled) setItemsLoadError(controller.signal.aborted ? "The itinerary request timed out. Check your connection and try again." : cause instanceof Error ? cause.message : "Could not load itinerary.");
    }).finally(() => {
      window.clearTimeout(timeout);
    });
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [activeTripKey, itemsReloadNonce]);

  return { trips, setTrips, items, setItems, loadingTrips, tripsLoadError, retryTrips: () => { setLoadingTrips(true); setTripsLoadError(null); setTripsReloadNonce((nonce) => nonce + 1); }, itemsTripId, setItemsTripId, itemsLoadError, retryItems: () => { setItemsTripId(null); setItemsLoadError(null); setItemsReloadNonce((nonce) => nonce + 1); }, activeTrip };
}
