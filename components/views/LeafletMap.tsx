"use client";

import { useEffect, useRef } from "react";
import L, { type Map as LeafletMapInstance, type Marker } from "leaflet";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { defaultTypeColor, typeColor } from "@/lib/type-color";
import type { TravelObject, Trip } from "@/types/travel";

function markerColor(type: string, colors: Record<string, string>) {
  const color = typeColor(type, colors);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : defaultTypeColor(type);
}

function markerIcon(color: string, number?: number, highlighted = false) {
  const size = highlighted ? 42 : 36;
  const label = number == null ? "" : String(number);
  return L.divIcon({
    className: "travel-map-marker",
    html: `<svg aria-hidden="true" viewBox="0 0 36 46" width="${size}" height="${Math.round(size * 46 / 36)}" xmlns="http://www.w3.org/2000/svg"><path d="M18 1C8.6 1 1 8.6 1 18c0 12.5 17 27 17 27s17-14.5 17-27C35 8.6 27.4 1 18 1Z" fill="${color}" stroke="#fff" stroke-width="2.5"/><circle cx="18" cy="18" r="10" fill="#fff"/><text x="18" y="22" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" font-weight="700" fill="${color}">${label}</text></svg>`,
    iconSize: [size, Math.round(size * 46 / 36)],
    iconAnchor: [size / 2, Math.round(size * 46 / 36)],
    popupAnchor: [0, -Math.round(size * 40 / 36)],
  });
}

function popupContent(item: TravelObject, number?: number) {
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = `${number == null ? "" : `${number}. `}${item.title || "Untitled item"}`;
  content.appendChild(title);
  const details = document.createElement("div");
  details.style.margin = "4px 0 8px";
  details.style.color = "#57534e";
  const fixedTime = item.startTime && item.endTime && !item.isAllDay ? `${item.startTime}–${item.endTime}` : item.isAllDay ? "All day" : null;
  details.textContent = [item.type, item.location?.name ?? item.location?.address, fixedTime].filter(Boolean).join(" · ");
  content.appendChild(details);
  const action = document.createElement("button");
  action.type = "button";
  action.textContent = "Open details";
  action.style.color = "#047857";
  action.style.fontWeight = "600";
  action.dataset.openItem = item.id;
  content.appendChild(action);
  return content;
}

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
  className?: string;
}

export function LeafletMap({ trip, items, typeColors, onSelect, markerNumbers, selectedItemId = null, hoveredItemId = null, onHover, fitKey, recenterToken = 0, onUserMove, className = "min-h-[360px] flex-1" }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onSelect, onHover, onUserMove });
  const lastFitRef = useRef("");
  const programmaticMoveRef = useRef(false);
  const lastSelectedItemRef = useRef<string | null | undefined>(undefined);

  useEffect(() => { callbacksRef.current = { onSelect, onHover, onUserMove }; }, [onHover, onSelect, onUserMove]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    const markers = markersRef.current;
    mapRef.current = map;
    layerRef.current = layer;
    const markMoved = () => { if (!programmaticMoveRef.current) callbacksRef.current.onUserMove?.(); };
    map.on("dragstart", markMoved);
    map.on("zoomstart", markMoved);
    map.on("moveend", () => { programmaticMoveRef.current = false; });
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(container);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
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
      const marker = L.marker(point, { title: item.title || "Untitled item", icon: markerIcon(markerColor(item.type, typeColors), number), riseOnHover: true });
      const popup = popupContent(item, number);
      popup.querySelector("button")?.addEventListener("click", () => callbacksRef.current.onSelect(item));
      marker.bindPopup(popup).on("click", () => callbacksRef.current.onSelect(item)).on("mouseover", () => callbacksRef.current.onHover?.(item.id)).on("mouseout", () => callbacksRef.current.onHover?.(null)).addTo(layer);
      markersRef.current.set(item.id, marker);
    }
  }, [items, markerNumbers, trip, typeColors]);

  useEffect(() => {
    for (const item of items.filter((item) => hasMapCoordinates(item.location))) {
      const marker = markersRef.current.get(item.id);
      if (!marker) continue;
      marker.setIcon(markerIcon(markerColor(item.type, typeColors), markerNumbers?.get(item.id), item.id === selectedItemId || item.id === hoveredItemId));
    }
  }, [hoveredItemId, items, markerNumbers, selectedItemId, typeColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lastSelectedItemRef.current === selectedItemId) return;
    lastSelectedItemRef.current = selectedItemId;
    if (!selectedItemId) { map.closePopup(); return; }
    const selected = items.find((item) => item.id === selectedItemId && hasMapCoordinates(item.location));
    if (!selected) return;
    const point: [number, number] = [selected.location!.lat!, selected.location!.lng!];
    programmaticMoveRef.current = true;
    map.flyTo(point, Math.max(map.getZoom(), 16), { animate: true, duration: 0.55 });
    markersRef.current.get(selectedItemId)?.openPopup();
  }, [items, selectedItemId]);

  useEffect(() => {
    const map = mapRef.current;
    const points = items.filter((item) => hasMapCoordinates(item.location)).map((item) => [item.location!.lat!, item.location!.lng!] as [number, number]);
    const nextFit = `${fitKey ?? "items"}:${recenterToken}`;
    if (!map || lastFitRef.current === nextFit) return;
    lastFitRef.current = nextFit;
    const timer = window.setTimeout(() => {
      map.invalidateSize({ pan: false });
      if (!points.length) return;
      programmaticMoveRef.current = true;
      if (points.length === 1) map.setView(points[0], 14, { animate: true });
      else map.fitBounds(points, { padding: [48, 48], maxZoom: 15, animate: true });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [fitKey, items, recenterToken]);

  return <div ref={containerRef} className={`relative z-0 isolate bg-stone-100 text-sm text-stone-600 ${className}`} />;
}
