"use client";

import { useSyncExternalStore } from "react";

const phoneQuery = "(max-width: 639px)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** True below 640px (the Tailwind `sm` breakpoint), where Calendar is the phone Week. */
export function usePhone() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );
}
