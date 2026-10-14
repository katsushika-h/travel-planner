"use client";

import { useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { menuItemClassName } from "@/components/ui/menu-item";
import { recalculateTripMapPins } from "@/lib/google-maps-recalculate";
import type { TravelObject, Trip } from "@/types/travel";

export function RecalculateMapPinsButton({
  trip,
  onUpdated,
  onError,
}: {
  trip: Trip;
  onUpdated: (items: TravelObject[]) => void;
  onError: (message: string) => void;
}) {
  const [progress, setProgress] = useState<{ complete: number; total: number } | null>(null);
  const [summary, setSummary] = useState("");

  async function recalculate() {
    setProgress({ complete: 0, total: 0 });
    setSummary("");
    onError("");
    try {
      const { total, updated, unresolved, cleared, failed } = await recalculateTripMapPins(trip.id, (complete, count) =>
        setProgress({ complete, total: count }),
      );
      onUpdated(updated);
      setSummary(
        `Checked ${total} ${total === 1 ? "link" : "links"} · moved ${updated.length - cleared}${
          cleared ? ` · removed ${cleared} wrong ${cleared === 1 ? "pin" : "pins"}` : ""
        }${unresolved ? ` · ${unresolved} without coordinates` : ""}`,
      );
      if (failed) onError(`${failed} Maps ${failed === 1 ? "link" : "links"} could not be checked. Try again later.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not recalculate map pins.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className={menuItemClassName}
        disabled={progress !== null}
        onClick={() => void recalculate()}
      >
        {progress ? <LoaderCircle className="animate-spin" /> : <MapPin />}
        {progress ? `Recalculating ${progress.complete}/${progress.total}` : "Recalculate map pins"}
      </button>
      {summary && (
        <p role="status" className="px-4 pb-2 text-xs text-muted">
          {summary}
        </p>
      )}
    </>
  );
}
