"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { estimateWalk, formatDistance, haversineMeters } from "@/lib/travel-legs";
import type { TravelObject, UpdateTravelObjectInput } from "@/types/travel";

type Spot = Awaited<ReturnType<typeof api.parking>>["parking"][number];
type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "results"; spots: Spot[] };

const linkButton =
  "flex min-h-11 items-center underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground sm:min-h-0";

/** Saved car park for a stop, or a "Find parking" lookup (up to a minute) whose result is saved on the stop's location. */
export function ParkingControl({
  item,
  canFind,
  onChangeItem,
}: {
  item: TravelObject;
  /** Whether to offer a search when no parking is saved. */
  canFind: boolean;
  onChangeItem: (id: string, patch: UpdateTravelObjectInput, immediate?: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const location = item.location;
  const saved = location?.parking && hasMapCoordinates(location.parking) ? location.parking : null;
  if (!location || !hasMapCoordinates(location) || (!saved && !canFind)) return null;
  const { lat, lng } = location as { lat: number; lng: number };

  function search() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase({ kind: "loading" });
    api
      .parking(lat, lng, controller.signal)
      .then(({ parking }) => {
        if (!controller.signal.aborted) setPhase({ kind: "results", spots: parking });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhase({ kind: "error" });
      });
  }

  function save(parking: { name?: string; lat: number; lng: number } | null) {
    controllerRef.current?.abort();
    setPhase({ kind: "idle" });
    onChangeItem(item.id, { location: { ...location, parking } }, true);
  }

  const walk = saved ? formatDistance(estimateWalk(haversineMeters({ lat, lng }, saved)).meters) : null;
  return (
    <div className="flex flex-col gap-2 pb-3 text-[13px] text-muted sm:pl-[156px]">
      {saved ? (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Park at {saved.name?.trim() || "saved car park"} · {walk} walk
          </span>
          <button type="button" onClick={search} className={linkButton}>
            Change
          </button>
          <button type="button" onClick={() => save(null)} className={linkButton}>
            Remove
          </button>
        </p>
      ) : (
        phase.kind === "idle" && (
          <p>
            <button type="button" onClick={search} className={linkButton}>
              Find parking
            </button>
          </p>
        )
      )}
      <div aria-live="polite">
        {phase.kind === "loading" && <p>Searching car parks… this can take up to a minute.</p>}
        {phase.kind === "error" && (
          <p className="flex flex-wrap items-center gap-x-4">
            <span>Parking lookup unavailable — try again</span>
            <button type="button" onClick={search} className={linkButton}>
              Retry
            </button>
          </p>
        )}
        {phase.kind === "results" &&
          (phase.spots.length === 0 ? (
            <p className="flex flex-wrap items-center gap-x-4">
              <span>No car parks found within 1 km</span>
              <button type="button" onClick={() => setPhase({ kind: "idle" })} className={linkButton}>
                Close
              </button>
            </p>
          ) : (
            <ul aria-label={`Car parks near ${item.title}`} className="flex flex-col border-t border-divider">
              {phase.spots.map((spot, index) => (
                <li key={`${spot.lat},${spot.lng},${index}`} className="border-b border-divider">
                  <button
                    type="button"
                    onClick={() => save({ ...(spot.name ? { name: spot.name } : {}), lat: spot.lat, lng: spot.lng })}
                    className="flex min-h-11 w-full items-baseline justify-between gap-3 py-1 text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground sm:min-h-8"
                  >
                    <span className="min-w-0 truncate">{spot.name || "Unnamed car park"}</span>
                    <span className="shrink-0 font-mono text-xs">
                      {formatDistance(spot.meters)}
                      {spot.fee === "yes" ? " · fee" : ""}
                    </span>
                  </button>
                </li>
              ))}
              <li className="py-1">
                <button type="button" onClick={() => setPhase({ kind: "idle" })} className={linkButton}>
                  Close
                </button>
              </li>
            </ul>
          ))}
      </div>
    </div>
  );
}
