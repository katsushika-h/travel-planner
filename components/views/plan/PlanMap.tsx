"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { LeafletMapProps } from "../LeafletMap";
import type { TravelObject, Trip } from "@/types/travel";
import { useRequested3dMap } from "../useRequested3dMap";

const LeafletMap = dynamic(() => import("../LeafletMap").then((module) => module.LeafletMap), {
  ssr: false,
  loading: () => <div className="grid flex-1 place-items-center text-sm text-muted">Loading map…</div>,
});

/** 3D map proof of concept (docs/work/3d-map-poc.md), shown only with `?map=3d` in the URL. */
const MapLibreMap = dynamic(() => import("../MapLibreMap").then((module) => module.MapLibreMap), {
  ssr: false,
  loading: () => <div className="grid flex-1 place-items-center text-sm text-muted">Loading map…</div>,
});

/** The active day's map; it fills the space its parent gives it. Pins are numbered like the stop list; stops without coordinates are counted, not plotted. */
export function PlanMap({
  trip,
  date,
  mapped,
  unmappedCount,
  typeColors,
  markerNumbers,
  selectedItemId,
  hoveredItemId,
  recenterToken,
  mapMoved,
  onHover,
  onSelect,
  onUserMove,
  onRecenter,
  onAddLink,
  legs,
  parkingMarkers,
  previewItem,
}: {
  trip: Trip;
  date: string;
  mapped: TravelObject[];
  unmappedCount: number;
  typeColors: Record<string, string>;
  markerNumbers: ReadonlyMap<string, number>;
  selectedItemId: string | null;
  hoveredItemId: string | null;
  recenterToken: number;
  mapMoved: boolean;
  onHover: (itemId: string | null) => void;
  onSelect: (item: TravelObject) => void;
  onUserMove: () => void;
  onRecenter: () => void;
  onAddLink?: () => void;
  /** Routed leg lines to draw. */
  legs?: LeafletMapProps["legs"];
  /** Saved car parks to mark with a "P". */
  parkingMarkers?: LeafletMapProps["parkingMarkers"];
  /** A selected idea shown as a temporary pin. */
  previewItem?: TravelObject | null;
}) {
  const requested3d = useRequested3dMap();
  const [map3dFailed, setMap3dFailed] = useState(false);
  const note = "bg-background/90 px-2 py-1 text-xs text-muted";
  const mapProps = {
    trip,
    items: mapped,
    typeColors,
    markerNumbers,
    selectedItemId,
    hoveredItemId,
    onHover,
    onSelect,
    legs,
    parkingMarkers,
    previewItem,
    fitKey: date,
    recenterToken,
    onUserMove,
    className: "min-h-0 flex-1",
  };
  return (
    <section
      aria-label={`Map of ${date}`}
      className="relative flex h-full min-h-72 w-full flex-col overflow-hidden bg-surface"
    >
      {requested3d && !map3dFailed ? (
        <MapLibreMap {...mapProps} onFailure={() => setMap3dFailed(true)} />
      ) : (
        <LeafletMap {...mapProps} />
      )}
      {(unmappedCount > 0 || mapMoved) && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex max-w-[calc(100%-13rem)] flex-wrap gap-2">
          {unmappedCount > 0 && (
            <p className={`pointer-events-auto ${note}`}>
              {unmappedCount} {unmappedCount === 1 ? "stop" : "stops"} without a location
              {onAddLink && (
                <>
                  {" · "}
                  <button type="button" onClick={onAddLink} className="text-foreground underline underline-offset-2">
                    add link
                  </button>
                </>
              )}
            </p>
          )}
          {mapped.length > 0 && mapMoved && (
            <button
              type="button"
              onClick={onRecenter}
              className={`pointer-events-auto text-foreground underline underline-offset-2 ${note}`}
            >
              Recenter day
            </button>
          )}
        </div>
      )}
      {mapped.length === 0 && (
        <p className="pointer-events-none absolute inset-x-6 top-6 z-[500] bg-background/90 px-3 py-2 text-center text-xs text-muted">
          No locations with coordinates for this day.
        </p>
      )}
    </section>
  );
}
