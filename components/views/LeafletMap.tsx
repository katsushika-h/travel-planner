"use client";

import { useEffect, useRef } from "react";
import L, { type Map as LeafletMapInstance, type Marker } from "leaflet";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { itemScheduleLabel } from "@/lib/schedule-domain";
import { defaultTypeColor, typeColor } from "@/lib/type-color";
import { useResolvedTheme } from "@/store/use-travel-store";
import { placeLabel } from "@/lib/place-label";
import type { TravelObject, Trip } from "@/types/travel";

function markerColor(type: string, colors: Record<string, string>) {
  const color = typeColor(type, colors);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : defaultTypeColor(type);
}

type MarkerState = "default" | "active" | "dimmed" | "preview";

/** Numbered stops are outlined circles; unnumbered stops are small type-colour dots. Colours come from theme tokens. */
function markerIcon(color: string, number?: number, state: MarkerState = "default") {
  const numbered = number != null;
  const size =
    state === "active" || state === "preview" ? (numbered ? 36 : 22) : state === "dimmed" ? 10 : numbered ? 26 : 16;
  return L.divIcon({
    className: "travel-map-marker",
    html: `<span class="travel-map-pin" aria-hidden="true" data-numbered="${numbered}" data-active="${state === "active"}" data-dimmed="${state === "dimmed"}" data-preview="${state === "preview"}" style="--pin-type: ${color}">${numbered ? number : ""}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function popupContent(item: TravelObject, number?: number) {
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = `${number == null ? "" : `${number}. `}${item.title || "Untitled item"}`;
  content.appendChild(title);
  const details = document.createElement("div");
  details.className = "travel-map-popup-meta";
  const fixedTime = itemScheduleLabel(item);
  details.textContent = [item.type, placeLabel(item), fixedTime].filter(Boolean).join(" · ");
  content.appendChild(details);
  const action = document.createElement("button");
  action.type = "button";
  action.textContent = "Open details";
  action.className = "travel-map-popup-action";
  action.dataset.openItem = item.id;
  content.appendChild(action);
  return content;
}

export type MapParkingMarker = { id: string; lat: number; lng: number; name: string | null };

function parkingIcon() {
  return L.divIcon({
    className: "travel-map-marker",
    html: '<span aria-hidden="true" style="display:grid;width:20px;height:20px;place-items:center;border:1px solid var(--ink);background:var(--surface);color:var(--ink);font:600 11px/1 var(--font-mono, monospace)">P</span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/**
 * How far floating panels marked `data-map-overlay` reach into the map from its left and right edges, so a fit can
 * keep pins out from under them. A panel covering most of the map (a phone) is ignored.
 */
function overlayInsets(container: HTMLElement) {
  const box = container.getBoundingClientRect();
  let left = 0;
  let right = 0;
  for (const element of document.querySelectorAll("[data-map-overlay]")) {
    const panel = element.getBoundingClientRect();
    if (panel.bottom <= box.top || panel.top >= box.bottom) continue;
    if (panel.left <= box.left && panel.right > box.left) left = Math.max(left, panel.right - box.left);
    else if (panel.right >= box.right && panel.left < box.right) right = Math.max(right, box.right - panel.left);
  }
  return left + right > box.width - 160 ? { left: 0, right: 0 } : { left, right };
}

export type MapLeg = { id: string; positions: [number, number][]; mode: "walk" | "drive" };

const ROUTE_ATTRIBUTION = 'Routes &copy; <a href="https://openrouteservice.org/">openrouteservice</a> by HeiGIT';

export interface LeafletMapProps {
  trip: Trip;
  items: TravelObject[];
  typeColors: Record<string, string>;
  onSelect: (item: TravelObject) => void;
  markerNumbers?: ReadonlyMap<string, number>;
  selectedItemId?: string | null;
  hoveredItemId?: string | null;
  onHover?: (itemId: string | null) => void;
  fitKey?: string;
  recenterToken?: number;
  onUserMove?: () => void;
  /** Items drawn as small muted dots (for example, stops outside a selected day). */
  dimmedItemIds?: ReadonlySet<string>;
  /** Routed leg lines, drawn in the accent colour (dashed for walking). */
  legs?: MapLeg[];
  /** Small "P" markers for saved car parks; they show a title tooltip and open nothing. */
  parkingMarkers?: MapParkingMarker[];
  /** An item outside `items` (a selected idea) shown as a temporary dashed pin; the map frames it with the day. */
  previewItem?: TravelObject | null;
  className?: string;
}

export function LeafletMap({
  trip,
  items,
  typeColors,
  onSelect,
  markerNumbers,
  selectedItemId = null,
  hoveredItemId = null,
  onHover,
  fitKey,
  recenterToken = 0,
  onUserMove,
  dimmedItemIds,
  legs,
  parkingMarkers,
  previewItem = null,
  className = "min-h-[360px] flex-1",
}: LeafletMapProps) {
  const theme = useResolvedTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const legLayerRef = useRef<L.LayerGroup | null>(null);
  const parkingLayerRef = useRef<L.LayerGroup | null>(null);
  const previewLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onSelect, onHover, onUserMove });
  const lastFitRef = useRef("");
  const programmaticMoveRef = useRef(false);
  const lastSelectedItemRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    callbacksRef.current = { onSelect, onHover, onUserMove };
  }, [onHover, onSelect, onUserMove]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    legLayerRef.current = L.layerGroup().addTo(map);
    parkingLayerRef.current = L.layerGroup().addTo(map);
    previewLayerRef.current = L.layerGroup().addTo(map);
    const markers = markersRef.current;
    mapRef.current = map;
    layerRef.current = layer;
    const markMoved = () => {
      if (!programmaticMoveRef.current) callbacksRef.current.onUserMove?.();
    };
    map.on("dragstart", markMoved);
    map.on("zoomstart", markMoved);
    map.on("moveend", () => {
      programmaticMoveRef.current = false;
    });
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(container);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      legLayerRef.current = null;
      parkingLayerRef.current = null;
      previewLayerRef.current = null;
      markers.clear();
      lastFitRef.current = "";
      lastSelectedItemRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    for (const item of items.filter((item) => hasMapCoordinates(item.location))) {
      const point: [number, number] = [item.location!.lat!, item.location!.lng!];
      const number = markerNumbers?.get(item.id);
      const marker = L.marker(point, {
        title: item.title || "Untitled item",
        icon: markerIcon(markerColor(item.type, typeColors), number),
        riseOnHover: true,
      });
      const popup = popupContent(item, number);
      popup.querySelector("button")?.addEventListener("click", () => callbacksRef.current.onSelect(item));
      marker
        .bindPopup(popup)
        .on("click", () => callbacksRef.current.onSelect(item))
        .on("mouseover", () => callbacksRef.current.onHover?.(item.id))
        .on("mouseout", () => callbacksRef.current.onHover?.(null))
        .addTo(layer);
      markersRef.current.set(item.id, marker);
    }
  }, [items, markerNumbers, trip, typeColors]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = legLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!legs?.length) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "currentColor";
    for (const leg of legs) {
      if (leg.positions.length < 2) continue;
      L.polyline(leg.positions, {
        color,
        weight: 4,
        opacity: 0.85,
        dashArray: leg.mode === "walk" ? "2 8" : undefined,
        lineCap: "round",
        interactive: false,
      }).addTo(layer);
    }
    map.attributionControl.addAttribution(ROUTE_ATTRIBUTION);
    return () => {
      map.attributionControl.removeAttribution(ROUTE_ATTRIBUTION);
    };
  }, [legs, theme]);

  useEffect(() => {
    const layer = parkingLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const spot of parkingMarkers ?? []) {
      L.marker([spot.lat, spot.lng], {
        title: spot.name ? `Parking: ${spot.name}` : "Parking",
        alt: "",
        icon: parkingIcon(),
        keyboard: false,
        zIndexOffset: -500,
      }).addTo(layer);
    }
  }, [parkingMarkers, theme]);

  const preview = previewItem && hasMapCoordinates(previewItem.location) ? previewItem : null;
  useEffect(() => {
    const layer = previewLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!preview) return;
    const popup = popupContent(preview);
    popup.querySelector("button")?.remove();
    L.marker([preview.location!.lat!, preview.location!.lng!], {
      title: preview.title || "Untitled item",
      icon: markerIcon(markerColor(preview.type, typeColors), undefined, "preview"),
      zIndexOffset: 1000,
    })
      .bindPopup(popup)
      .addTo(layer);
  }, [preview, typeColors]);

  useEffect(() => {
    for (const item of items.filter((item) => hasMapCoordinates(item.location))) {
      const marker = markersRef.current.get(item.id);
      if (!marker) continue;
      const state: MarkerState =
        item.id === selectedItemId || item.id === hoveredItemId
          ? "active"
          : dimmedItemIds?.has(item.id)
            ? "dimmed"
            : "default";
      marker.setIcon(markerIcon(markerColor(item.type, typeColors), markerNumbers?.get(item.id), state));
      marker.setZIndexOffset(state === "active" ? 1000 : state === "dimmed" ? -1000 : 0);
    }
  }, [dimmedItemIds, hoveredItemId, items, markerNumbers, selectedItemId, typeColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lastSelectedItemRef.current === selectedItemId) return;
    lastSelectedItemRef.current = selectedItemId;
    if (!selectedItemId) {
      map.closePopup();
      return;
    }
    const selected = items.find((item) => item.id === selectedItemId && hasMapCoordinates(item.location));
    if (!selected) return;
    const point: [number, number] = [selected.location!.lat!, selected.location!.lng!];
    programmaticMoveRef.current = true;
    const size = map.getSize();
    if (size.x > 0 && size.y > 0) map.flyTo(point, Math.max(map.getZoom(), 16), { animate: true, duration: 0.55 });
    else map.setView(point, 16, { animate: false });
    markersRef.current.get(selectedItemId)?.openPopup();
  }, [items, selectedItemId]);

  useEffect(() => {
    const map = mapRef.current;
    const located = items.filter((item) => hasMapCoordinates(item.location));
    const focused = located.filter((item) => !dimmedItemIds?.has(item.id));
    const points = [...(focused.length ? focused : located), ...(preview ? [preview] : [])].map(
      (item) => [item.location!.lat!, item.location!.lng!] as [number, number],
    );
    // Showing or clearing a preview pin reframes the day so the pin is seen in relation to its stops.
    const nextFit = `${fitKey ?? "items"}:${recenterToken}:${preview?.id ?? ""}`;
    if (!map || lastFitRef.current === nextFit) return;
    lastFitRef.current = nextFit;
    const timer = window.setTimeout(() => {
      map.invalidateSize({ pan: false });
      if (!points.length) return;
      programmaticMoveRef.current = true;
      const inset = overlayInsets(map.getContainer());
      map.fitBounds(points, {
        paddingTopLeft: [48 + inset.left, 48],
        paddingBottomRight: [48 + inset.right, 48],
        maxZoom: points.length === 1 ? 14 : 15,
        animate: true,
      });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [dimmedItemIds, fitKey, items, preview, recenterToken]);

  return <div ref={containerRef} className={`travel-leaflet-map relative z-0 isolate text-sm ${className}`} />;
}
