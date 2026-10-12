"use client";

import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { api } from "@/lib/api-client";
import { sortTravelObjects } from "@/lib/schedule-order";
import type { TravelObject, UpdateTravelObjectInput } from "@/types/travel";

/** Coordinate optimistic edits and debounced persistence for individual items. */
export function useItemSaveQueue(activeTripId: string | undefined, setItems: Dispatch<SetStateAction<TravelObject[]>>, onError: (message: string) => void) {
  const activeTripIdRef = useRef(activeTripId);
  useLayoutEffect(() => { activeTripIdRef.current = activeTripId; }, [activeTripId]);
  const saveQueues = useRef(new Map<string, UpdateTravelObjectInput>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savingIds = useRef(new Set<string>());
  const refreshTripId = useRef<string | null>(null);

  /** Reload once after the last concurrent save, since schedule writes can reorder siblings. */
  async function refreshAfterScheduleSaves() {
    const tripId = refreshTripId.current;
    if (!tripId || savingIds.current.size) return;
    refreshTripId.current = null;
    if (activeTripIdRef.current !== tripId) return;
    try {
      const refreshed = await api.objects(tripId);
      setItems((current) => activeTripIdRef.current === tripId ? sortTravelObjects(refreshed) : current);
    } catch (cause) {
      if (activeTripIdRef.current === tripId) onError(cause instanceof Error ? cause.message : "Could not refresh the itinerary.");
    }
  }

  async function flushItemSave(id: string) {
    if (savingIds.current.has(id)) return;
    savingIds.current.add(id);
    let scheduleChanged = false;
    try {
      while (saveQueues.current.has(id)) {
        const patch = saveQueues.current.get(id)!;
        saveQueues.current.delete(id);
        scheduleChanged ||= ["date", "endDate", "startTime", "endTime", "placementTime", "dayOrder", "isAllDay"].some((field) => field in patch);
        try {
          const updated = await api.updateObject(id, patch);
          const newer = saveQueues.current.get(id) ?? {};
          setItems((current) => activeTripIdRef.current === activeTripId ? sortTravelObjects(current.map((item) => item.id === id ? { ...updated, ...newer } : item)) : current);
        } catch (cause) {
          if (activeTripIdRef.current === activeTripId) onError(cause instanceof Error ? cause.message : "Could not save item changes.");
          break;
        }
      }
      if (scheduleChanged && activeTripId && activeTripIdRef.current === activeTripId) refreshTripId.current = activeTripId;
    } finally { savingIds.current.delete(id); }
    await refreshAfterScheduleSaves();
  }

  function changeItem(id: string, patch: UpdateTravelObjectInput, immediate = false) {
    setItems((current) => sortTravelObjects(current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)));
    saveQueues.current.set(id, { ...(saveQueues.current.get(id) ?? {}), ...patch });
    const oldTimer = saveTimers.current.get(id);
    if (oldTimer) clearTimeout(oldTimer);
    if (immediate) { saveTimers.current.delete(id); void flushItemSave(id); }
    else saveTimers.current.set(id, setTimeout(() => { saveTimers.current.delete(id); void flushItemSave(id); }, 450));
  }

  function cancelPendingSave(id: string) {
    const timer = saveTimers.current.get(id);
    if (timer) clearTimeout(timer);
    saveTimers.current.delete(id);
    saveQueues.current.delete(id);
  }

  return { changeItem, cancelPendingSave };
}
