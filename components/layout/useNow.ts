"use client";

import { useEffect, useState } from "react";
import { isTripInProgress } from "@/lib/today";
import type { Trip } from "@/types/travel";

const MINUTE = 60_000;

/**
 * The current time. In development only, `?today=2026-11-29T11:00` fakes the clock (a value without an offset is
 * read in the browser's timezone; add `Z` or `-05:00` to pin it). The fake clock keeps ticking from that moment.
 */
export function currentTime() {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const fake = Date.parse(new URLSearchParams(window.location.search).get("today") ?? "");
    if (Number.isFinite(fake)) return new Date(fake + (Date.now() - startedAt));
  }
  return new Date();
}
const startedAt = Date.now();

/** Re-renders its component every minute, on the minute boundary. */
export function useNow() {
  const [now, setNow] = useState(currentTime);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(currentTime());
      timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE) + 50);
    };
    timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE) + 50);
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** Whether today is within the trip. Re-checked every minute, but only re-renders when the answer changes. */
export function useTripInProgress(trip: Trip | null | undefined) {
  const [inProgress, setInProgress] = useState(false);
  useEffect(() => {
    if (!trip) return;
    const update = () => setInProgress(isTripInProgress(trip, currentTime()));
    update();
    const timer = setInterval(update, MINUTE);
    return () => clearInterval(timer);
  }, [trip]);
  return trip ? inProgress : false;
}
