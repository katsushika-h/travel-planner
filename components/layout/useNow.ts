"use client";

import { useEffect, useState } from "react";

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
